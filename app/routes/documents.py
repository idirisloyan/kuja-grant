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
from app.services.task_runner import submit_task
from app.services.audit import log_action
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

    # Version tracking: if a document of the same type already exists for this
    # application/assessment, mark the new one as superseding the old one and
    # increment the version number.
    supersedes_id = None
    version = 1
    if application_id and doc_type != 'general':
        prev_doc = Document.query.filter_by(
            application_id=application_id, doc_type=doc_type
        ).order_by(Document.uploaded_at.desc()).first()
        if prev_doc:
            supersedes_id = prev_doc.id
            version = (prev_doc.version or 1) + 1
    elif assessment_id and doc_type != 'general':
        prev_doc = Document.query.filter_by(
            assessment_id=assessment_id, doc_type=doc_type
        ).order_by(Document.uploaded_at.desc()).first()
        if prev_doc:
            supersedes_id = prev_doc.id
            version = (prev_doc.version or 1) + 1

    # Create document record
    document = Document(
        application_id=application_id,
        assessment_id=assessment_id,
        doc_type=doc_type,
        original_filename=original_filename,
        stored_filename=stored_filename,
        file_size=file_size,
        mime_type=mime_type,
        version=version,
        supersedes_id=supersedes_id,
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

    # Save document immediately (AI analysis runs in background to avoid 502 timeouts)
    # Phase 13.5 — two-phase intake: queue extraction with a stable
    # trace_id so the client can poll status + show "extracting…" UX
    # without holding the upload connection open.
    import uuid as _uuid
    document.extraction_status = 'queued'
    document.extraction_trace_id = _uuid.uuid4().hex[:16]
    document.extraction_attempt_count = 0
    db.session.add(document)
    db.session.commit()

    doc_id = document.id
    trace_id = document.extraction_trace_id
    logger.info(f"Document uploaded: {original_filename} (id={doc_id}, trace_id={trace_id}, AI analysis queued)")

    # Phase 176 — capture uploader org id before crossing thread boundary
    # (current_user is request-scoped and won't survive into the bg task).
    uploader_org_id = current_user.org_id

    # Submit AI analysis as a background task so the upload response returns fast
    def _run_ai_analysis():
        from flask import current_app
        from datetime import datetime, timezone
        app = current_app._get_current_object()
        with app.app_context():
            doc = db.session.get(Document, doc_id)
            if not doc:
                return
            try:
                # Phase 13.5 — running state
                doc.extraction_status = 'running'
                doc.extraction_started_at = datetime.now(timezone.utc)
                doc.extraction_attempt_count = (doc.extraction_attempt_count or 0) + 1
                db.session.commit()

                analysis = AIService.analyze_document(
                    original_filename, doc_type, file_size,
                    file_path=filepath, requirements=donor_requirements,
                )
                doc = db.session.get(Document, doc_id)
                if doc:
                    doc.set_ai_analysis(analysis)
                    doc.score = analysis.get('score', 0)
                    # Phase 13.5 — completed state + native_pdf telemetry
                    doc.extraction_status = 'completed'
                    doc.extraction_completed_at = datetime.now(timezone.utc)
                    if (analysis or {}).get('_extraction_path') == 'native_pdf':
                        doc.extraction_used_native_pdf = True
                    db.session.commit()
                    logger.info(f"Document AI analysis complete: id={doc_id}, score={doc.score}, trace_id={trace_id}")

                    # Phase 176 — re-run org compliance screen when a
                    # compliance-relevant doc lands. Org membership +
                    # registration verifications surface live status
                    # off the latest AdverseMediaScreening row, so we
                    # nudge a fresh one here.
                    COMPLIANCE_DOC_TYPES = {
                        'audit_report', 'audit', 'mou', 'governance_doc',
                        'governance', 'policy_handbook',
                        'beneficiary_data_policy', 'safeguarding_policy',
                    }
                    if doc_type in COMPLIANCE_DOC_TYPES and uploader_org_id:
                        try:
                            from app.services.adverse_media_service import AdverseMediaService
                            from app.models import Organization as _Org, AdverseMediaScreening, Notification
                            import json as _json
                            org = db.session.get(_Org, uploader_org_id)
                            if org and org.org_type == 'ngo':
                                result = AdverseMediaService.screen(
                                    org_name=org.name,
                                    country=org.country,
                                    sector=None,
                                    leadership=None,
                                )
                                summary = {
                                    'high_count': result.get('high_count') or 0,
                                    'medium_count': result.get('medium_count') or 0,
                                    'low_count': result.get('low_count') or 0,
                                }
                                ams = AdverseMediaScreening(
                                    org_id=org.id,
                                    status=result.get('status') or 'clean',
                                    source='auto_rerun_post_upload',
                                    summary_json=_json.dumps(summary),
                                )
                                db.session.add(ams)
                                # Phase 182 — per-user fan-out (Notification.user_id NOT NULL).
                                from app.models import User as _User
                                ngo_users = _User.query.filter_by(org_id=org.id, role='ngo').all()
                                status_label = (result.get('status') or 'clean').replace('_', ' ')
                                for _u in ngo_users:
                                    n = Notification(
                                        user_id=_u.id,
                                        type='compliance_refreshed',
                                        title='Compliance check refreshed',
                                        message=(
                                            f'We re-ran your screening after the new {doc_type} '
                                            f'upload. Status: {status_label}.'
                                        ),
                                        link='/compliance',
                                    )
                                    db.session.add(n)
                                db.session.commit()
                                logger.info(
                                    f"compliance re-screen after doc upload: org={org.id} status={result.get('status')}"
                                )
                        except Exception as _comp_e:
                            logger.debug('compliance re-screen skipped: %s', _comp_e)
            except Exception as e:
                logger.error(f"Background document analysis failed for id={doc_id} trace_id={trace_id}: {e}")
                # Phase 13.5 — classify failure into PMO's vocabulary so
                # the client can surface specific recovery copy.
                err_code = 'unknown'
                msg = (str(e) or '').lower()
                if 'timeout' in msg or 'timed out' in msg:
                    err_code = 'timeout'
                elif 'aborted' in msg or 'cancel' in msg:
                    err_code = 'aborted'
                elif 'rate' in msg and 'limit' in msg:
                    err_code = 'ai_error'
                elif 'pdf' in msg or 'extract' in msg:
                    err_code = 'text_extract_failed'
                doc = db.session.get(Document, doc_id)
                if doc:
                    doc.set_ai_analysis({
                        'score': 50,
                        'findings': ['Analysis could not be completed'],
                        'recommendations': ['Manual review recommended'],
                    })
                    doc.score = 50
                    doc.extraction_status = 'failed'
                    doc.extraction_completed_at = datetime.now(timezone.utc)
                    doc.extraction_failed_code = err_code
                    doc.extraction_failed_reason = str(e)[:500]
                    db.session.commit()

    from flask import current_app as _ca
    _app = _ca._get_current_object()

    def _bg_wrapper():
        with _app.app_context():
            _run_ai_analysis()

    submit_task(_bg_wrapper, task_type='doc_ai_analysis')

    result = document.to_dict()
    result['ai_analysis'] = None
    result['ai_pending'] = True
    return jsonify({'success': True, 'document': result}), 201


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


@documents_bp.route('/<int:doc_id>/raw', methods=['GET'])
@login_required
def api_document_raw(doc_id):
    """Phase 128 — Serve the raw bytes for inline preview.

    Access mirrors api_get_document: NGO can only see their own org's
    documents; admins see everything. Sends with `Content-Disposition:
    inline` so the browser renders PDFs/images in an iframe rather than
    forcing a download. Falls back to attachment for unknown mime types.
    """
    from flask import current_app, send_file as _send_file
    import os as _os
    document = db.session.get(Document, doc_id)
    if not document:
        return jsonify({'error': 'Document not found'}), 404

    # Same auth gates as api_get_document.
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

    upload_dir = current_app.config.get('UPLOAD_FOLDER')
    if not upload_dir or not document.stored_filename:
        return jsonify({'error': 'File not available'}), 404
    file_path = _os.path.join(upload_dir, document.stored_filename)
    if not _os.path.exists(file_path):
        return jsonify({'error': 'File missing on disk'}), 410

    mime = document.mime_type or 'application/octet-stream'
    inline_kinds = (
        'application/pdf',
        'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif',
        'text/plain', 'text/csv',
    )
    as_attachment = mime not in inline_kinds
    return _send_file(
        file_path,
        mimetype=mime,
        as_attachment=as_attachment,
        download_name=document.original_filename,
        max_age=0,
    )


@documents_bp.route('/<int:doc_id>/clarification', methods=['PATCH'])
@login_required
def api_document_clarification(doc_id):
    """Phase 13.26 — NGO clarification on AI findings.

    The team's May 6 ask: NGOs should be able to add context the AI
    missed on their uploaded compliance documents (e.g. "this finding
    doesn't apply because we used methodology X"). Donors see these
    notes alongside the AI analysis on review — humans staying in the
    loop on AI judgment without erasing the AI signal.

    Body: { clarification: str (max 4000c) | '' to clear }
    Authority: NGO that owns the document, or admin.
    """
    from datetime import datetime, timezone
    from app.utils.validation import optional_string, ValidationError, to_error_response
    from app.utils.api_errors import error_response

    document = db.session.get(Document, doc_id)
    if not document:
        return error_response('not_found', 404)
    if document.application_id:
        application = db.session.get(Application, document.application_id)
        if application and current_user.role == 'ngo' and application.ngo_org_id != current_user.org_id:
            return error_response('auth.access_denied', 403)
    if document.assessment_id:
        assessment = db.session.get(Assessment, document.assessment_id)
        if assessment and current_user.role not in ('admin',) and assessment.org_id != current_user.org_id:
            return error_response('auth.access_denied', 403)

    data = get_request_json() or {}
    try:
        clarification = optional_string(data, 'clarification', max_len=4000)
    except ValidationError as e:
        return to_error_response(e)

    document.user_clarification = clarification or None
    document.user_clarification_at = datetime.now(timezone.utc) if clarification else None
    document.user_clarification_by_user_id = current_user.id if clarification else None
    db.session.commit()

    log_action(
        'document.clarification.updated', current_user.email,
        'document', document.id,
        {'has_clarification': bool(clarification),
         'length': len(clarification or '')},
    )
    return jsonify({'success': True, 'document': document.to_dict()})


@documents_bp.route('/<int:doc_id>/extraction-status', methods=['GET'])
@login_required
def api_document_extraction_status(doc_id):
    """Phase 13.5 — lightweight polling endpoint for two-phase intake.

    The client polls this every 2-3s while the wizard is in `extracting`
    state. Returns just the lifecycle subset of the document — no AI
    analysis body, so this is cheap to call.

    Status values: queued | running | completed | failed | timed_out | aborted
    Failure codes: no_document | text_extract_failed | text_too_short |
                   timeout | ai_error | aborted | unknown
    """
    document = db.session.get(Document, doc_id)
    if not document:
        return jsonify({'error': 'Document not found'}), 404

    # Reuse same access-control as GET /<id>.
    if document.application_id:
        application = db.session.get(Application, document.application_id)
        if application and current_user.role == 'ngo' and application.ngo_org_id != current_user.org_id:
            return jsonify({'error': 'Access denied'}), 403
    if document.assessment_id:
        assessment = db.session.get(Assessment, document.assessment_id)
        if assessment and current_user.role not in ('admin',) and assessment.org_id != current_user.org_id:
            return jsonify({'error': 'Access denied'}), 403

    return jsonify({
        'success': True,
        'document_id': document.id,
        'extraction': {
            'status': document.extraction_status,
            'started_at': document.extraction_started_at.isoformat() if document.extraction_started_at else None,
            'completed_at': document.extraction_completed_at.isoformat() if document.extraction_completed_at else None,
            'failed_reason': document.extraction_failed_reason,
            'failed_code': document.extraction_failed_code,
            'trace_id': document.extraction_trace_id,
            'attempt_count': document.extraction_attempt_count or 0,
            'used_native_pdf': bool(document.extraction_used_native_pdf),
        },
        'has_analysis': bool(document.ai_analysis),
        'score': document.score,
    })
