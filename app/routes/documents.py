import os
import uuid
from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename
from sqlalchemy import or_
from app.extensions import db
from app.models import Application, Assessment, Document
from app.utils.helpers import get_request_json, allowed_file, ALLOWED_EXTENSIONS
from app.utils.decorators import role_required
from app.services.ai_service import AIService
import logging

logger = logging.getLogger('kuja')

documents_bp = Blueprint('documents', __name__, url_prefix='/api/documents')

# Valid document types
VALID_DOC_TYPES = frozenset([
    'general', 'financial_report', 'audit_report', 'registration_certificate',
    'proposal', 'budget', 'logframe', 'cv', 'reference_letter',
    'organizational_chart', 'annual_report', 'policy_document',
    'monitoring_report', 'evaluation_report', 'partnership_agreement',
    'tax_exemption', 'bank_statement', 'insurance_certificate',
])

# Magic bytes for MIME validation
MAGIC_BYTES = {
    'pdf': b'%PDF',
    'png': b'\x89PNG',
    'jpg': b'\xff\xd8\xff',
    'jpeg': b'\xff\xd8\xff',
    'xlsx': b'PK',  # ZIP-based
    'docx': b'PK',  # ZIP-based
    'xls': b'\xd0\xcf\x11\xe0',  # OLE2
    'doc': b'\xd0\xcf\x11\xe0',  # OLE2
}


@documents_bp.route('/', methods=['GET'])
@login_required
def api_list_documents():
    """List documents uploaded by the current user's organization."""
    org_id = current_user.org_id
    # Get documents from applications belonging to this org
    app_ids = [a.id for a in Application.query.filter_by(ngo_org_id=org_id).all()]
    assess_ids = [a.id for a in Assessment.query.filter_by(org_id=org_id).all()]
    conditions = []
    if app_ids:
        conditions.append(Document.application_id.in_(app_ids))
    if assess_ids:
        conditions.append(Document.assessment_id.in_(assess_ids))
    if conditions:
        docs = Document.query.filter(or_(*conditions)).order_by(Document.uploaded_at.desc()).all()
    else:
        docs = []
    return jsonify({'success': True, 'documents': [d.to_dict() for d in docs]})


@documents_bp.route('/upload', methods=['POST'])
@login_required
def api_upload_document():
    """Upload a document and trigger AI analysis."""
    # Early Content-Length check before reading body (prevents 503 from proxy)
    content_length = request.content_length
    if content_length and content_length > 16 * 1024 * 1024:
        return jsonify({
            'error': f'File too large ({content_length / (1024*1024):.1f} MB). Maximum size is 16 MB.',
            'success': False,
        }), 413

    if 'file' not in request.files:
        return jsonify({'error': 'No file provided', 'success': False}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected', 'success': False}), 400

    if not allowed_file(file.filename):
        return jsonify({
            'error': f'File type not allowed. Allowed: {", ".join(ALLOWED_EXTENSIONS)}',
            'success': False,
        }), 400

    # Secure the filename and generate unique stored name
    original_filename = secure_filename(file.filename)
    ext = original_filename.rsplit('.', 1)[-1].lower() if '.' in original_filename else ''
    stored_filename = f"{uuid.uuid4().hex}.{ext}" if ext else uuid.uuid4().hex

    filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], stored_filename)
    file.save(filepath)
    file_size = os.path.getsize(filepath)

    # Reject empty/tiny files (< 100 bytes cannot contain valid content)
    if file_size < 100:
        os.remove(filepath)
        logger.warning(f"Rejected empty/tiny document: {original_filename} ({file_size} bytes)")
        return jsonify({
            'error': 'File is empty or too small to contain valid content. Please upload a proper document.',
            'success': False,
        }), 400

    # Determine MIME type
    mime_map = {
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls': 'application/vnd.ms-excel',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'csv': 'text/csv',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'txt': 'text/plain',
    }
    mime_type = mime_map.get(ext, 'application/octet-stream')

    # Get metadata from form
    application_id = request.form.get('application_id', type=int)
    assessment_id = request.form.get('assessment_id', type=int)
    doc_type = request.form.get('doc_type', 'general')

    # Validate doc_type against allowed values
    if doc_type and doc_type not in VALID_DOC_TYPES:
        doc_type = 'general'  # Fallback to 'general' for unrecognized types

    # Validate file content matches extension (magic bytes check)
    expected_magic = MAGIC_BYTES.get(ext)
    if expected_magic:
        with open(filepath, 'rb') as fcheck:
            header = fcheck.read(8)
            if not header.startswith(expected_magic):
                os.remove(filepath)  # Clean up invalid file
                return jsonify({
                    'error': f'File content does not match .{ext} format',
                    'success': False,
                }), 400

    # For text-extractable types, verify the file has readable content
    text_types = {'pdf', 'doc', 'docx', 'txt', 'csv'}
    if ext in text_types:
        try:
            if ext == 'pdf':
                import PyPDF2
                with open(filepath, 'rb') as f:
                    reader = PyPDF2.PdfReader(f)
                    text = ''
                    for page in reader.pages[:5]:
                        text += (page.extract_text() or '')
                    if len(text.strip()) < 20:
                        os.remove(filepath)
                        logger.warning(f"Rejected PDF with no extractable text: {original_filename}")
                        return jsonify({
                            'error': 'PDF has no readable text content. Please upload a valid document.',
                            'success': False,
                        }), 400
            elif ext == 'txt' or ext == 'csv':
                with open(filepath, 'r', errors='ignore') as f:
                    text = f.read(2000)
                if len(text.strip()) < 20:
                    os.remove(filepath)
                    return jsonify({
                        'error': 'File has no readable content. Please upload a valid document.',
                        'success': False,
                    }), 400
        except Exception as e:
            logger.warning(f"Content validation failed for {original_filename}: {e}")
            os.remove(filepath)
            return jsonify({
                'error': 'Could not read file content. The file may be corrupted.',
                'success': False,
            }), 400

    # Create document record
    document = Document(
        application_id=application_id,
        assessment_id=assessment_id,
        doc_type=doc_type,
        original_filename=original_filename,
        stored_filename=stored_filename,
        file_size=file_size,
        mime_type=mime_type,
    )

    # Look up donor-specific requirements for this document type
    donor_requirements = None
    if application_id:
        app_record = db.session.get(Application, application_id)
        if app_record and app_record.grant:
            doc_reqs = app_record.grant.get_doc_requirements() or []
            for req in doc_reqs:
                if req.get('type') == doc_type or req.get('key') == doc_type:
                    donor_requirements = req
                    break

    # Run AI analysis (with donor requirements if available)
    try:
        analysis = AIService.analyze_document(
            original_filename, doc_type, file_size,
            file_path=filepath, requirements=donor_requirements,
        )
        document.set_ai_analysis(analysis)
        document.score = analysis.get('score', 0)
    except Exception as e:
        logger.error(f"Document analysis failed: {e}")
        document.set_ai_analysis({
            'score': 50,
            'findings': ['Analysis could not be completed'],
            'recommendations': ['Manual review recommended'],
        })
        document.score = 50

    db.session.add(document)
    db.session.commit()

    logger.info(f"Document uploaded: {original_filename} (id={document.id}, score={document.score})")
    return jsonify({'success': True, 'document': document.to_dict()}), 201


@documents_bp.route('/<int:doc_id>', methods=['GET'])
@login_required
def api_get_document(doc_id):
    """Get document metadata and AI analysis."""
    document = db.session.get(Document, doc_id)
    if not document:
        return jsonify({'error': 'Document not found'}), 404

    # Access control: verify user has access to the related application/assessment
    if document.application_id:
        application = db.session.get(Application, document.application_id)
        if application:
            if current_user.role == 'ngo' and application.ngo_org_id != current_user.org_id:
                return jsonify({'error': 'Access denied'}), 403
    if document.assessment_id:
        assessment = db.session.get(Assessment, document.assessment_id)
        if assessment:
            if current_user.role not in ('admin',) and assessment.org_id != current_user.org_id:
                return jsonify({'error': 'Access denied'}), 403

    return jsonify({'document': document.to_dict()})
