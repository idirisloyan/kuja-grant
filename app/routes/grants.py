from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename
from app.extensions import db
from app.models import Grant, Application
from app.utils.helpers import get_request_json, paginate_query
from app.utils.decorators import role_required
from app.services.ai_service import AIService, HAS_PYPDF2, HAS_PYTHON_DOCX
from datetime import datetime, date, timezone
import os
import uuid
import logging

if HAS_PYPDF2:
    from PyPDF2 import PdfReader
if HAS_PYTHON_DOCX:
    import docx as python_docx

logger = logging.getLogger('kuja')

grants_bp = Blueprint('grants', __name__, url_prefix='/api/grants')


@grants_bp.route('/', methods=['GET'])
@login_required
def api_list_grants():
    """List grants with optional filters."""
    query = Grant.query

    status = request.args.get('status')
    if status:
        query = query.filter_by(status=status)
    else:
        # By default, NGOs only see open grants; donors see all their own
        if current_user.role == 'ngo':
            query = query.filter_by(status='open')

    # Donor filter: donors see only their own grants by default
    if current_user.role == 'donor' and not request.args.get('all'):
        query = query.filter_by(donor_org_id=current_user.org_id)

    sector = request.args.get('sector')
    if sector:
        query = query.filter(Grant.sectors.ilike(f'%"{sector}"%'))

    country = request.args.get('country')
    if country:
        query = query.filter(Grant.countries.ilike(f'%"{country}"%'))

    search = request.args.get('search', '').strip()
    if search:
        query = query.filter(
            db.or_(
                Grant.title.ilike(f'%{search}%'),
                Grant.description.ilike(f'%{search}%')
            )
        )

    query = query.order_by(Grant.created_at.desc())
    pagination = paginate_query(query)

    grants_data = [g.to_dict(summary=True) for g in pagination.items]

    # For NGOs, include their application status for each grant (Issue #8)
    if current_user.role == 'ngo' and current_user.org_id:
        grant_ids = [g.id for g in pagination.items]
        if grant_ids:
            user_apps = Application.query.filter(
                Application.grant_id.in_(grant_ids),
                Application.ngo_org_id == current_user.org_id
            ).all()
            app_status_map = {a.grant_id: a.status for a in user_apps}
            for gd in grants_data:
                gd['user_application_status'] = app_status_map.get(gd['id'])

    return jsonify({
        'grants': grants_data,
        'total': pagination.total,
        'page': pagination.page,
        'pages': pagination.pages,
    })


@grants_bp.route('/<int:grant_id>', methods=['GET'])
@login_required
def api_get_grant(grant_id):
    """Get full grant detail with eligibility, criteria, and document requirements."""
    grant = db.session.get(Grant, grant_id)
    if not grant:
        return jsonify({'error': 'Grant not found'}), 404

    data = grant.to_dict(summary=False)

    # Include application count
    data['application_count'] = Application.query.filter_by(grant_id=grant_id).count()

    # If user is NGO, include their application status for this grant
    if current_user.role == 'ngo' and current_user.org_id:
        existing_app = Application.query.filter_by(
            grant_id=grant_id, ngo_org_id=current_user.org_id
        ).first()
        if existing_app:
            data['user_application'] = existing_app.to_dict(summary=True)

    return jsonify({'grant': data})


@grants_bp.route('/', methods=['POST'])
@role_required('donor', 'admin')
def api_create_grant():
    """Create a new grant (donor only)."""
    data = get_request_json()

    if not data.get('title'):
        return jsonify({'error': 'Title is required', 'success': False}), 400
    if len(data['title']) > 500:
        return jsonify({'error': 'Title too long (max 500 characters)', 'success': False}), 400
    if data.get('description') and len(data['description']) > 10000:
        return jsonify({'error': 'Description too long (max 10000 characters)', 'success': False}), 400

    grant = Grant(
        donor_org_id=current_user.org_id,
        title=data['title'],
        description=data.get('description', ''),
        total_funding=data.get('total_funding'),
        currency=data.get('currency', 'USD'),
        status='draft',
    )

    if data.get('deadline'):
        try:
            grant.deadline = date.fromisoformat(data['deadline'])
        except (ValueError, TypeError):
            return jsonify({'error': 'Invalid deadline format. Use YYYY-MM-DD.', 'success': False}), 400

    if data.get('sectors'):
        grant.set_sectors(data['sectors'])
    if data.get('countries'):
        grant.set_countries(data['countries'])
    if data.get('eligibility'):
        grant.set_eligibility(data['eligibility'])
    if data.get('criteria'):
        grant.set_criteria(data['criteria'])
    if data.get('doc_requirements'):
        grant.set_doc_requirements(data['doc_requirements'])
    if data.get('reporting_requirements'):
        grant.set_reporting_requirements(data['reporting_requirements'])
    if data.get('report_template'):
        grant.set_report_template(data['report_template'])
    if data.get('reporting_frequency'):
        grant.reporting_frequency = data['reporting_frequency']

    db.session.add(grant)
    db.session.commit()

    logger.info(f"Grant created: {grant.title} (id={grant.id}) by org {current_user.org_id}")
    return jsonify({'success': True, 'grant': grant.to_dict()}), 201


@grants_bp.route('/<int:grant_id>', methods=['PUT'])
@role_required('donor', 'admin')
def api_update_grant(grant_id):
    """Update a grant."""
    grant = db.session.get(Grant, grant_id)
    if not grant:
        return jsonify({'error': 'Grant not found'}), 404

    # Only the owning donor or admin can edit
    if current_user.role == 'donor' and grant.donor_org_id != current_user.org_id:
        return jsonify({'error': 'You can only edit your own grants', 'success': False}), 403

    data = get_request_json()

    if 'title' in data:
        grant.title = data['title']
    if 'description' in data:
        grant.description = data['description']
    if 'total_funding' in data:
        grant.total_funding = data['total_funding']
    if 'currency' in data:
        grant.currency = data['currency']
    if 'deadline' in data:
        try:
            grant.deadline = date.fromisoformat(data['deadline']) if data['deadline'] else None
        except (ValueError, TypeError):
            return jsonify({'error': 'Invalid deadline format', 'success': False}), 400
    if 'status' in data:
        grant.status = data['status']
    if 'sectors' in data:
        grant.set_sectors(data['sectors'])
    if 'countries' in data:
        grant.set_countries(data['countries'])
    if 'eligibility' in data:
        grant.set_eligibility(data['eligibility'])
    if 'criteria' in data:
        grant.set_criteria(data['criteria'])
    if 'doc_requirements' in data:
        grant.set_doc_requirements(data['doc_requirements'])
    if 'reporting_requirements' in data:
        grant.set_reporting_requirements(data['reporting_requirements'])
    if 'report_template' in data:
        grant.set_report_template(data['report_template'])
    if 'reporting_frequency' in data:
        grant.reporting_frequency = data['reporting_frequency']

    db.session.commit()
    logger.info(f"Grant updated: {grant.title} (id={grant.id})")
    return jsonify({'success': True, 'grant': grant.to_dict()})


@grants_bp.route('/<int:grant_id>/publish', methods=['POST'])
@role_required('donor', 'admin')
def api_publish_grant(grant_id):
    """Publish a grant (set status to 'open')."""
    grant = db.session.get(Grant, grant_id)
    if not grant:
        return jsonify({'error': 'Grant not found'}), 404

    if current_user.role == 'donor' and grant.donor_org_id != current_user.org_id:
        return jsonify({'error': 'You can only publish your own grants', 'success': False}), 403

    if grant.status != 'draft':
        return jsonify({'error': f'Cannot publish a grant with status "{grant.status}"', 'success': False}), 400

    grant.status = 'open'
    grant.published_at = datetime.now(timezone.utc)
    db.session.commit()

    logger.info(f"Grant published: {grant.title} (id={grant.id})")
    return jsonify({'success': True, 'grant': grant.to_dict()})


@grants_bp.route('/<int:grant_id>/upload-grant-doc', methods=['POST'])
@login_required
def api_upload_grant_doc(grant_id):
    """Upload the actual grant document for a grant. AI extracts reporting requirements."""
    # Early Content-Length check before reading body (prevents 503 from proxy)
    content_length = request.content_length
    if content_length and content_length > 16 * 1024 * 1024:
        return jsonify({
            'error': f'File too large ({content_length / (1024*1024):.1f} MB). Maximum size is 16 MB.',
            'success': False,
        }), 413

    grant = db.session.get(Grant, grant_id)
    if not grant:
        return jsonify({'error': 'Grant not found'}), 404

    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'Only donors can upload grant documents'}), 403

    if grant.donor_org_id != current_user.org_id and current_user.role != 'admin':
        return jsonify({'error': 'Access denied'}), 403

    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    original_filename = secure_filename(file.filename)
    ext = original_filename.rsplit('.', 1)[-1].lower() if '.' in original_filename else ''

    # Validate file extension
    allowed_extensions = {'pdf', 'doc', 'docx', 'txt', 'csv'}
    if ext not in allowed_extensions:
        return jsonify({'error': f'Unsupported file type (.{ext}). Allowed: PDF, DOC, DOCX, TXT, CSV.', 'success': False}), 400

    stored_filename = f"grant_doc_{grant_id}_{uuid.uuid4().hex}.{ext}"

    filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], stored_filename)
    file.save(filepath)

    # Check minimum file size — empty or near-empty files cannot contain real content
    file_size = os.path.getsize(filepath)
    if file_size < 100:
        os.remove(filepath)
        logger.warning(f"Rejected empty/tiny file: {original_filename} ({file_size} bytes)")
        return jsonify({
            'error': 'File is empty or too small to contain valid content. Please upload a proper document.',
            'success': False,
        }), 400

    grant.grant_document = stored_filename

    # Try to read file content for AI analysis
    file_content = ''
    extraction_error = None
    try:
        if ext == 'txt':
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                file_content = f.read()
        elif ext == 'csv':
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                file_content = f.read()
        elif ext == 'pdf' and HAS_PYPDF2:
            try:
                reader = PdfReader(filepath)
                if len(reader.pages) == 0:
                    extraction_error = 'PDF has no pages. Please upload a valid PDF document.'
                else:
                    pages_text = []
                    for page in reader.pages[:30]:  # Limit to 30 pages
                        text = page.extract_text()
                        if text:
                            pages_text.append(text)
                    file_content = '\n'.join(pages_text)
            except Exception as pdf_err:
                logger.error(f"PDF extraction failed: {pdf_err}")
                extraction_error = 'Could not read the PDF file. It may be corrupted or password-protected.'
        elif ext in ('docx', 'doc') and HAS_PYTHON_DOCX:
            try:
                doc = python_docx.Document(filepath)
                paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
                file_content = '\n'.join(paragraphs)
            except Exception as docx_err:
                logger.error(f"DOCX extraction failed: {docx_err}")
                extraction_error = 'Could not read the Word document. It may be corrupted.'
        elif ext == 'pdf' and not HAS_PYPDF2:
            extraction_error = 'PDF processing is not available on this server. Please upload a DOC, DOCX, or TXT file.'
        elif ext in ('docx', 'doc') and not HAS_PYTHON_DOCX:
            extraction_error = 'Word document processing is not available on this server. Please upload a PDF or TXT file.'
    except Exception as e:
        logger.error(f"Failed to read grant document: {e}")
        extraction_error = 'Failed to read the uploaded document.'

    # Reject files with extraction errors
    if extraction_error:
        os.remove(filepath)
        grant.grant_document = None
        db.session.commit()
        return jsonify({'error': extraction_error, 'success': False}), 400

    # Reject files with no extractable text content
    if not file_content.strip() or len(file_content.strip()) < 50:
        os.remove(filepath)
        grant.grant_document = None
        db.session.commit()
        logger.warning(f"Rejected file with no extractable content: {original_filename}")
        return jsonify({
            'error': 'No readable text found in the uploaded file. The document may be empty, scanned (image-only), or corrupted. Please upload a text-based document.',
            'success': False,
        }), 400

    # AI extracts reporting requirements
    extracted = AIService.extract_reporting_requirements(file_content, grant.title)

    # Guard against None response
    if not extracted or not isinstance(extracted, dict):
        extracted = {}
        logger.warning(f"AI extraction returned no data for grant {grant_id}")

    # Normalize alternative key names from AI responses
    if 'reporting_requirements' in extracted and 'requirements' not in extracted:
        extracted['requirements'] = extracted['reporting_requirements']

    # Auto-save extracted requirements to grant
    requirements_saved = False
    if extracted.get('requirements'):
        grant.set_reporting_requirements(extracted['requirements'])
        requirements_saved = True
    if extracted.get('reporting_frequency'):
        grant.reporting_frequency = extracted['reporting_frequency']
    if extracted.get('template_sections') or extracted.get('indicators'):
        grant.set_report_template({
            'template_sections': extracted.get('template_sections', []),
            'indicators': extracted.get('indicators', []),
        })

    db.session.commit()

    return jsonify({
        'success': True,
        'grant_document': stored_filename,
        'original_filename': original_filename,
        'extracted_requirements': extracted,
        'requirements_saved': requirements_saved,
        'content_extracted': len(file_content) > 100,
        'auto_saved': True,
    })
