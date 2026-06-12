"""
Kuja Grant Management System - Report Routes
==============================================
Extracted from server.py section 18b (lines ~4649-5104).
Handles NGO report creation, submission, donor review, and upcoming reports.

Blueprint prefix: /api/reports
Routes served:
  /api/reports                       GET   - list reports (paginated, role-filtered)
  /api/reports                       POST  - create report (NGO)
  /api/reports/<report_id>           GET   - get report detail
  /api/reports/<report_id>           PUT   - update report
  /api/reports/<report_id>/submit    POST  - submit report (with AI analysis)
  /api/reports/<report_id>/review    POST  - donor reviews report
  /api/reports/upcoming              GET   - upcoming/overdue reports
"""

import logging
from datetime import datetime, date, timedelta, timezone

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from app.extensions import db
from app.models import Application, Grant, Report
from app.services.ai_service import AIService
from app.utils.helpers import get_request_json, paginate_query

from app.utils.decorators import role_required
from app.services.audit import log_action

logger = logging.getLogger('kuja')

reports_bp = Blueprint('reports', __name__, url_prefix='/api/reports')


@reports_bp.route('/', methods=['GET'])
@login_required
def api_list_reports():
    """List reports - filtered by role."""
    role = current_user.role
    org_id = current_user.org_id

    # Eager-load grant and submitted_by_org to avoid N+1 in to_dict()
    base_query = Report.query.options(
        db.joinedload(Report.grant),
        db.joinedload(Report.submitted_by_org),
    )

    if role == 'ngo':
        query = base_query.filter_by(submitted_by_org_id=org_id)
    elif role == 'donor':
        # Reports for grants owned by this donor
        query = base_query.join(Grant).filter(Grant.donor_org_id == org_id)
    else:
        query = base_query

    grant_id = request.args.get('grant_id', type=int)
    if grant_id:
        query = query.filter(Report.grant_id == grant_id)

    status = request.args.get('status')
    if status:
        query = query.filter(Report.status == status)

    # Phase 66 — optional window_id filter (joins through grant.fund_window_id).
    # Used by the per-window operations page to deep-link into a scoped
    # reports list. The role-gated base_query is already applied, so this
    # only narrows what the user could already see.
    window_id_param = request.args.get('window_id', type=int)
    if window_id_param is not None:
        # Avoid duplicate Report.grant join from the donor branch.
        if role != 'donor':
            query = query.join(Grant, Report.grant_id == Grant.id)
        query = query.filter(Grant.fund_window_id == window_id_param)

    query = query.order_by(Report.created_at.desc())
    pagination = paginate_query(query)

    return jsonify({
        'reports': [r.to_dict() for r in pagination.items],
        'total': pagination.total,
        'page': pagination.page,
        'pages': pagination.pages,
    })


@reports_bp.route('/', methods=['POST'])
@login_required
@role_required('ngo')
def api_create_report():
    """Create a new report (NGO)."""
    data = get_request_json()

    grant_id = data.get('grant_id')
    if not grant_id:
        return jsonify({'error': 'grant_id is required', 'success': False}), 400

    grant = db.session.get(Grant, grant_id)
    if not grant:
        return jsonify({'error': 'Grant not found', 'success': False}), 404

    # Input length validation
    title = data.get('title', '')
    if title and len(title) > 500:
        return jsonify({'error': 'Title too long (max 500 characters)', 'success': False}), 400
    reporting_period = data.get('reporting_period', '')
    if reporting_period and len(reporting_period) > 100:
        return jsonify({'error': 'Reporting period too long (max 100 characters)', 'success': False}), 400

    # Verify the NGO has a valid application for this grant
    app_id = data.get('application_id')
    if app_id:
        application = db.session.get(Application, app_id)
        if not application or application.ngo_org_id != current_user.org_id:
            return jsonify({'error': 'Invalid application', 'success': False}), 400

    report = Report(
        grant_id=grant_id,
        application_id=app_id,
        submitted_by_org_id=current_user.org_id,
        report_type=data.get('report_type', 'progress'),
        reporting_period=data.get('reporting_period', ''),
        title=data.get('title', ''),
        status='draft',
    )

    if data.get('content'):
        report.set_content(data['content'])
    if data.get('due_date'):
        try:
            report.due_date = date.fromisoformat(data['due_date'])
        except (ValueError, TypeError):
            pass

    db.session.add(report)
    db.session.commit()

    # Phase 30B — funnel: start of a draft. Pairs with report.submit.
    try:
        from app.services.user_event_service import UserEventService
        UserEventService.record(
            user=current_user, event_name='report.start_draft',
            report_id=report.id, grant_id=grant_id,
        )
    except Exception:
        pass

    return jsonify({'success': True, 'report': report.to_dict()}), 201


@reports_bp.route('/<int:report_id>', methods=['GET'])
@login_required
def api_get_report(report_id):
    """Get report detail."""
    report = db.session.get(Report, report_id)
    if not report:
        return jsonify({'error': 'Report not found'}), 404

    # Access control
    if current_user.role == 'ngo' and report.submitted_by_org_id != current_user.org_id:
        return jsonify({'error': 'Access denied'}), 403
    if current_user.role == 'donor':
        grant = db.session.get(Grant, report.grant_id)
        if grant and grant.donor_org_id != current_user.org_id:
            return jsonify({'error': 'Access denied'}), 403

    data = report.to_dict()
    # Include grant reporting requirements for context
    grant = db.session.get(Grant, report.grant_id)
    if grant:
        data['grant_reporting_requirements'] = grant.get_reporting_requirements()
        data['grant_report_template'] = grant.get_report_template()
        data['grant_reporting_frequency'] = grant.reporting_frequency

    return jsonify({'report': data})


@reports_bp.route('/<int:report_id>', methods=['PUT'])
@login_required
@role_required('ngo')
def api_update_report(report_id):
    """Update report content (NGO editing draft) or donor adding review notes."""
    report = db.session.get(Report, report_id)
    if not report:
        return jsonify({'error': 'Report not found'}), 404

    data = get_request_json()

    if current_user.role == 'ngo':
        if report.submitted_by_org_id != current_user.org_id:
            return jsonify({'error': 'Access denied'}), 403
        if report.status not in ('draft', 'revision_requested'):
            return jsonify({'error': 'Report cannot be edited in current status'}), 400

        if 'content' in data:
            report.set_content(data['content'])
        if 'title' in data:
            report.title = data['title']
        if 'reporting_period' in data:
            report.reporting_period = data['reporting_period']
        if 'report_type' in data:
            report.report_type = data['report_type']
        if 'attachments' in data:
            report.set_attachments(data['attachments'])

    elif current_user.role == 'donor':
        grant = db.session.get(Grant, report.grant_id)
        if not grant or grant.donor_org_id != current_user.org_id:
            return jsonify({'error': 'Access denied'}), 403
        # Donors can add review notes
        if 'reviewer_notes' in data:
            report.reviewer_notes = data['reviewer_notes']

    db.session.commit()
    return jsonify({'success': True, 'report': report.to_dict()})


@reports_bp.route('/<int:report_id>/explain-rejection', methods=['GET'])
@login_required
@role_required('ngo')
def api_explain_report_rejection(report_id):
    """Phase 76 — Why-rejected, constructively. Reports side."""
    report = db.session.get(Report, report_id)
    if not report:
        return jsonify({'error': 'Report not found', 'success': False}), 404
    if report.submitted_by_org_id != current_user.org_id:
        return jsonify({'error': 'Access denied', 'success': False}), 403
    if report.status not in ('rejected', 'revision_requested'):
        return jsonify({
            'error': 'Explanation is only available for rejected or revision-requested reports.',
            'success': False,
        }), 400

    grant = db.session.get(Grant, report.grant_id)
    rubric = grant.get_reporting_requirements() if grant else []
    payload = {
        'report_type': report.report_type,
        'reporting_period': report.reporting_period,
        'content': report.get_content() or {},
        'ai_analysis': report.get_ai_analysis() or {},
        'revision_number': report.revision_number,
    }
    donor_notes = report.reviewer_notes

    result = AIService.explain_rejection(
        'report', payload=payload, donor_notes=donor_notes, rubric=rubric,
    )
    return jsonify({'success': True, **result})


@reports_bp.route('/<int:report_id>/photo-evidence', methods=['POST'])
@login_required
@role_required('ngo')
def api_photo_evidence(report_id):
    """Phase 72 — Photo-as-evidence.

    NGO uploads a phone photo of an attendance sheet, receipt, training
    session, or site visit. Claude vision extracts structured data
    (attendees, totals, observations, etc.) appropriate to the chosen
    photo type, and the file + extracted fields are attached to the
    report.

    Form: file (image), photo_type (attendance|receipt|training|
                                    site_visit|other)
    Returns: {file_id, attachment_id, extraction:{...}, narrative,
             warnings[]}
    """
    import os, uuid
    from werkzeug.utils import secure_filename
    from flask import current_app
    from app.models import Document

    report = db.session.get(Report, report_id)
    if not report:
        return jsonify({'error': 'Report not found', 'success': False}), 404
    if report.submitted_by_org_id != current_user.org_id:
        return jsonify({'error': 'Access denied', 'success': False}), 403
    if report.status not in ('draft', 'revision_requested'):
        return jsonify({
            'error': 'Photo evidence can only be attached while the report is a draft.',
            'success': False,
        }), 400

    if 'file' not in request.files:
        return jsonify({'error': 'No file provided', 'success': False}), 400
    upl = request.files['file']
    if not upl.filename:
        return jsonify({'error': 'No file selected', 'success': False}), 400

    fname = secure_filename(upl.filename)
    ext = (fname.rsplit('.', 1)[-1] or '').lower() if '.' in fname else ''
    if ext not in {'jpg', 'jpeg', 'png', 'webp', 'gif'}:
        return jsonify({
            'error': 'Only photos are accepted here (jpg, png, webp). Use the "Upload document" button for PDFs/Word.',
            'success': False,
        }), 400

    stored = f"{uuid.uuid4().hex}.{ext}"
    fpath = os.path.join(current_app.config['UPLOAD_FOLDER'], stored)
    upl.save(fpath)
    size = os.path.getsize(fpath)
    if size < 500:
        try: os.remove(fpath)
        except Exception: pass
        return jsonify({'error': 'Photo is too small to be valid. Please retake it.', 'success': False}), 400

    photo_type = (request.form.get('photo_type') or 'other').lower().strip()
    grant = db.session.get(Grant, report.grant_id)

    try:
        extraction = AIService.extract_photo_evidence(
            image_path=fpath,
            photo_type=photo_type,
            grant_title=(grant.title if grant else None),
            report_type=report.report_type,
        )
    except Exception as e:
        logger.error(f"photo-evidence extraction failed: {e}")
        extraction = {
            'kind': photo_type, 'extracted': {}, 'narrative': '',
            'confidence': 0, 'warnings': ['AI extraction was unavailable.'],
            'ai_used': False,
        }

    # Save as a Document so it integrates with existing attachment UI.
    # Document model fields: original_filename, stored_filename, mime_type,
    # file_size, doc_type, ai_analysis (JSON). No org_id/uploaded_by_user_id.
    # Scope is implicit via report.submitted_by_org_id.
    try:
        doc = Document(
            original_filename=fname,
            stored_filename=stored,
            mime_type=f'image/{"jpeg" if ext == "jpg" else ext}',
            file_size=size,
            doc_type='report_evidence',
        )
        # Stash extraction in the ai_analysis JSON column so the existing
        # document-viewer UI can surface it alongside the photo.
        doc.set_ai_analysis({
            'photo_evidence': True,
            'photo_type': extraction.get('kind'),
            'extracted': extraction.get('extracted'),
            'narrative': extraction.get('narrative'),
            'confidence': extraction.get('confidence'),
            'report_id': report.id,
            'ai_used': extraction.get('ai_used', False),
        })
        db.session.add(doc)
        db.session.flush()

        # Append to the report's attachments list and stamp the narrative
        # into ai_analysis so the donor can see it was photo-evidenced.
        atts = report.get_attachments() or []
        atts.append({
            'document_id': doc.id, 'filename': fname,
            'kind': 'photo_evidence',
            'photo_type': extraction.get('kind'),
            'narrative': extraction.get('narrative'),
            'confidence': extraction.get('confidence'),
        })
        report.set_attachments(atts)

        ai = report.get_ai_analysis() or {}
        ai_evi = ai.get('photo_evidence', [])
        ai_evi.append({
            'document_id': doc.id, 'kind': extraction.get('kind'),
            'narrative': extraction.get('narrative'),
            'confidence': extraction.get('confidence'),
        })
        ai['photo_evidence'] = ai_evi[-20:]
        report.set_ai_analysis(ai)

        db.session.commit()
    except Exception as e:
        logger.error(f"photo-evidence persistence failed: {e}")
        db.session.rollback()
        return jsonify({
            'success': True,
            'persisted': False,
            'extraction': extraction,
            'note': 'Photo extracted but could not be saved to the report. Please re-upload.',
        }), 200

    return jsonify({
        'success': True,
        'persisted': True,
        'document_id': doc.id,
        'extraction': extraction,
        'narrative': extraction.get('narrative'),
        'confidence': extraction.get('confidence'),
        'warnings': extraction.get('warnings', []),
        'ai_used': extraction.get('ai_used'),
    })


@reports_bp.route('/<int:report_id>/structure-from-voice', methods=['POST'])
@login_required
@role_required('ngo')
def api_structure_report_from_voice(report_id):
    """Phase 71 — Voice-to-report.

    NGO records a voice memo in the browser, the browser transcribes it
    via Web Speech API (or pastes a written transcript), and POSTs the
    text here. We map it onto the donor's reporting requirements using
    Claude, merge with any existing draft content, and return a structured
    draft + coverage report for the NGO to review.

    The NGO never authors from a blank page — they edit a draft.

    Body: {transcript: str, language?: str}
    Returns: {content, coverage, summary, missing, ai_used}
    """
    report = db.session.get(Report, report_id)
    if not report:
        return jsonify({'error': 'Report not found', 'success': False}), 404
    if report.submitted_by_org_id != current_user.org_id:
        return jsonify({'error': 'Access denied', 'success': False}), 403
    if report.status not in ('draft', 'revision_requested'):
        return jsonify({
            'error': 'Voice-to-report is only available while the report is a draft.',
            'success': False,
        }), 400

    data = get_request_json() or {}
    transcript = (data.get('transcript') or '').strip()
    language = (data.get('language') or '').strip() or None
    if not transcript:
        return jsonify({'error': 'transcript is required', 'success': False}), 400
    if len(transcript) > 12000:
        # Defensive cap so a misbehaving recorder can't burn through a
        # 100k-token budget. Real voice memos are well under this.
        transcript = transcript[:12000]

    grant = db.session.get(Grant, report.grant_id)
    requirements = grant.get_reporting_requirements() if grant else []
    existing = report.get_content()

    try:
        result = AIService.structure_voice_report(
            transcript=transcript,
            requirements=requirements,
            report_type=report.report_type,
            grant_title=(grant.title if grant else None),
            reporting_period=report.reporting_period,
            language=language,
            existing_content=existing,
        )
    except Exception as e:
        logger.error(f"voice-to-report structuring failed: {e}")
        return jsonify({
            'success': False,
            'error': 'AI structuring is temporarily unavailable. Your transcript is not lost — please copy it into the report fields manually.',
        }), 502

    # Persist the structured draft so the NGO doesn't lose it if their
    # browser crashes. Status stays draft. Critical for low-bandwidth /
    # shared-device contexts.
    try:
        report.set_content(result.get('content') or {})
        # Save the last transcript snippet on ai_analysis so the donor can
        # see this was voice-drafted (for trust + transparency) — but only
        # the metadata, not the full transcript itself.
        ai = report.get_ai_analysis() or {}
        ai['voice_draft_used'] = True
        ai['voice_draft_summary'] = result.get('summary', '')[:500]
        ai['voice_draft_coverage'] = result.get('coverage', [])[:30]
        report.set_ai_analysis(ai)
        db.session.commit()
    except Exception as e:
        logger.error(f"voice-to-report persistence failed: {e}")
        db.session.rollback()

    return jsonify({
        'success': True,
        'content': result.get('content', {}),
        'coverage': result.get('coverage', []),
        'summary': result.get('summary', ''),
        'missing': result.get('missing', []),
        'ai_used': result.get('ai_used', False),
    })


@reports_bp.route('/<int:report_id>/precheck', methods=['POST'])
@login_required
@role_required('ngo')
def api_precheck_report(report_id):
    """Run AI compliance analysis WITHOUT submitting.

    Lets NGOs see per-requirement scores, gaps, and risk flags before they
    hit submit — the team flagged that the platform was running this only
    AFTER submission, which is "diagnosis" rather than "coaching." This
    endpoint flips it to coaching.
    """
    report = db.session.get(Report, report_id)
    if not report:
        return jsonify({'error': 'Report not found', 'success': False}), 404
    if report.submitted_by_org_id != current_user.org_id:
        return jsonify({'error': 'Access denied', 'success': False}), 403
    if report.status not in ('draft', 'revision_requested'):
        return jsonify({
            'error': 'Pre-check is only available for drafts or revision-requested reports.',
            'success': False,
        }), 400

    grant = db.session.get(Grant, report.grant_id)
    requirements = grant.get_reporting_requirements() if grant else []
    content = report.get_content()

    try:
        analysis = AIService.analyze_report(content, requirements, report.report_type)
    except Exception as e:
        logger.error(f"Report precheck AI failed: {e}")
        return jsonify({
            'success': False,
            'error': 'AI analysis is temporarily unavailable. You can still submit, '
                     'but a post-submit review will run instead.',
        }), 502

    # Persist on the report so the donor can also see what the AI saw at
    # precheck time, and so re-opening the panel doesn't burn another AI
    # call. Status stays unchanged.
    report.set_ai_analysis(analysis)
    db.session.commit()

    # Phase 30B — funnel event for pre-flight adoption.
    try:
        from app.services.user_event_service import UserEventService
        compliance_score = (analysis or {}).get('compliance_score')
        UserEventService.record(
            user=current_user, event_name='report.preflight_used',
            report_id=report.id, grant_id=report.grant_id,
            compliance_score=compliance_score,
        )
    except Exception:
        pass

    return jsonify({'success': True, 'analysis': analysis, 'report_id': report.id})


@reports_bp.route('/<int:report_id>/submit', methods=['POST'])
@login_required
@role_required('ngo')
def api_submit_report(report_id):
    """Submit report to donor."""
    report = db.session.get(Report, report_id)
    if not report:
        return jsonify({'error': 'Report not found'}), 404

    if report.submitted_by_org_id != current_user.org_id:
        return jsonify({'error': 'Access denied'}), 403

    if report.status not in ('draft', 'revision_requested'):
        return jsonify({'error': 'Report already submitted'}), 400

    # Append current state to revision history before updating status
    report.append_revision_snapshot()

    report.status = 'submitted'
    report.submitted_at = datetime.now(timezone.utc)

    # Run AI analysis against grant requirements
    try:
        grant = db.session.get(Grant, report.grant_id)
        requirements = grant.get_reporting_requirements() if grant else []
        content = report.get_content()

        analysis = AIService.analyze_report(content, requirements, report.report_type)
        report.set_ai_analysis(analysis)
    except Exception as e:
        logger.error(f"Report AI analysis failed: {e}")

    db.session.commit()

    # Phase 29B — funnel event.
    try:
        from app.services.user_event_service import UserEventService
        compliance_score = None
        try:
            compliance_score = (report.get_ai_analysis() or {}).get('compliance_score')
        except Exception:
            pass
        UserEventService.record(
            user=current_user, event_name='report.submit',
            report_id=report.id, grant_id=report.grant_id,
            compliance_score=compliance_score,
        )
    except Exception:
        pass

    return jsonify({'success': True, 'report': report.to_dict()})


@reports_bp.route('/<int:report_id>/review', methods=['POST'])
@login_required
@role_required('donor', 'admin')
def api_review_report(report_id):
    """Donor reviews a submitted report."""
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'Only donors can review reports'}), 403

    report = db.session.get(Report, report_id)
    if not report:
        return jsonify({'error': 'Report not found'}), 404

    # Verify donor owns the grant
    grant = db.session.get(Grant, report.grant_id)
    if not grant or (current_user.role == 'donor' and grant.donor_org_id != current_user.org_id):
        return jsonify({'error': 'Access denied'}), 403

    # Only submitted or under_review reports can be reviewed
    if report.status not in ('submitted', 'under_review'):
        return jsonify({'error': f'Report in "{report.status}" status cannot be reviewed'}), 400

    data = get_request_json()
    action = data.get('action')  # 'accept' or 'request_revision'

    if action == 'accept':
        report.status = 'accepted'
    elif action == 'request_revision':
        report.status = 'revision_requested'
    else:
        return jsonify({'error': 'action must be "accept" or "request_revision"'}), 400

    reviewer_notes = data.get('notes', '')
    report.reviewer_notes = reviewer_notes
    report.reviewed_at = datetime.now(timezone.utc)

    # Store reviewer notes in revision history when requesting revision
    if action == 'request_revision':
        report.append_revision_snapshot(reviewer_notes=reviewer_notes)

    db.session.commit()

    # Audit trail for report review actions
    if action == 'accept':
        log_action('report.accepted', current_user.email, 'report', report.id,
                   {'grant_id': report.grant_id})
    elif action == 'request_revision':
        log_action('report.revision_requested', current_user.email, 'report', report.id,
                   {'grant_id': report.grant_id})

    return jsonify({'success': True, 'report': report.to_dict()})


@reports_bp.route('/<int:report_id>/status', methods=['PATCH'])
@login_required
def api_report_status_inline(report_id):
    """Phase 13.6 — inline-edit status flip for reports.

    Body: { status: 'accepted' | 'revision_requested' | 'submitted' }

    Donor + admin only. Mirrors the application inline endpoint but
    routed through the report lifecycle.
    """
    from app.utils.validation import require_enum, ValidationError, to_error_response
    from app.utils.api_errors import error_response

    report = db.session.get(Report, report_id)
    if not report:
        return error_response('report.not_found', 404)
    if current_user.role not in ('donor', 'admin'):
        return error_response('auth.access_denied', 403)
    if current_user.role == 'donor':
        from app.models import Grant
        grant = db.session.get(Grant, report.grant_id)
        if not grant or getattr(grant, 'donor_org_id', None) != current_user.org_id:
            return error_response('auth.access_denied', 403)

    data = get_request_json() or {}
    try:
        new_status = require_enum(data, 'status', (
            'submitted', 'accepted', 'revision_requested',
        ))
    except ValidationError as e:
        return to_error_response(e)

    old_status = report.status
    report.status = new_status
    db.session.commit()
    log_action(
        f'report.status.{new_status}',
        current_user.email, 'report', report.id,
        {'old_status': old_status, 'new_status': new_status, 'inline': True},
    )
    logger.info(f"Inline status flip: report={report_id} {old_status}->{new_status} by {current_user.email}")
    return jsonify({
        'success': True,
        'report_id': report.id,
        'status': new_status,
        'previous_status': old_status,
    })


@reports_bp.route('/upcoming', methods=['GET'])
@login_required
def api_upcoming_reports():
    """Get upcoming and overdue reports for the current user's grants.
    For NGOs: reports they need to submit for awarded grants.
    For Donors: reports they are expecting from grantees.
    """
    today = date.today()
    upcoming = []

    if current_user.role == 'ngo':
        # Find awarded applications for this NGO's org (with eager loading)
        awarded_apps = Application.query.options(
            db.joinedload(Application.grant).joinedload(Grant.donor_org)
        ).filter_by(
            ngo_org_id=current_user.org_id, status='awarded'
        ).all()

        # Pre-fetch all reports for this org to avoid N+1 queries
        all_org_reports = Report.query.filter_by(
            submitted_by_org_id=current_user.org_id
        ).all()
        _report_lookup = {}
        for r in all_org_reports:
            key = (r.grant_id, r.report_type, r.reporting_period)
            _report_lookup[key] = r

        for app_record in awarded_apps:
            grant = app_record.grant
            if not grant:
                continue

            requirements = grant.get_reporting_requirements()
            if not requirements:
                # Generate default requirements from reporting_frequency
                freq = grant.reporting_frequency or 'quarterly'
                requirements = [{'type': 'financial', 'frequency': freq, 'due_days_after_period': 30, 'title': f'{freq.title()} Financial Report'},
                                {'type': 'narrative', 'frequency': freq, 'due_days_after_period': 45, 'title': f'{freq.title()} Narrative Report'}]

            # Calculate next due dates based on grant start (published_at or created_at)
            grant_start = (grant.published_at or grant.created_at or datetime.now(timezone.utc)).date() if hasattr(grant.published_at or grant.created_at, 'date') else today

            # Use pre-fetched reports to determine existing periods
            existing_periods = set()
            for rkey, rpt in _report_lookup.items():
                if rkey[0] == grant.id and rpt.status in ('submitted', 'accepted', 'under_review'):
                    existing_periods.add((rpt.report_type, rpt.reporting_period))

            for req in requirements:
                freq = req.get('frequency', grant.reporting_frequency or 'quarterly')
                due_days = req.get('due_days_after_period', 30)
                req_type = req.get('type', 'progress')
                req_title = req.get('title', f'{req_type.title()} Report')

                # Calculate period intervals
                if freq == 'monthly':
                    interval_months = 1
                elif freq == 'quarterly':
                    interval_months = 3
                elif freq == 'semi-annual':
                    interval_months = 6
                elif freq == 'annual':
                    interval_months = 12
                else:
                    continue  # Skip final_only - those are created manually

                # Generate next 4 upcoming periods
                for period_num in range(1, 13):
                    period_end_month = grant_start.month + (interval_months * period_num) - 1
                    period_end_year = grant_start.year + (period_end_month - 1) // 12
                    period_end_month = ((period_end_month - 1) % 12) + 1

                    try:
                        # Last day of the period end month
                        if period_end_month == 12:
                            period_end = date(period_end_year, 12, 31)
                        else:
                            period_end = date(period_end_year, period_end_month + 1, 1) - timedelta(days=1)
                    except (ValueError, OverflowError):
                        continue

                    due = period_end + timedelta(days=due_days)

                    # Only show reports due within the next 90 days or overdue
                    if due > today + timedelta(days=90):
                        break
                    if due < grant_start:
                        continue

                    # Determine period label
                    period_start_month = period_end_month - interval_months + 1
                    if period_start_month < 1:
                        period_start_month += 12
                        period_start_year = period_end_year - 1
                    else:
                        period_start_year = period_end_year

                    if interval_months <= 3:
                        q_num = ((period_end_month - 1) // 3) + 1
                        period_label = f"Q{q_num} {period_end_year}"
                    elif interval_months == 6:
                        h_num = 1 if period_end_month <= 6 else 2
                        period_label = f"H{h_num} {period_end_year}"
                    else:
                        period_label = str(period_end_year)

                    # Skip if already submitted
                    if (req_type, period_label) in existing_periods:
                        continue

                    # Check if there's a draft already (using pre-fetched lookup)
                    draft = _report_lookup.get((grant.id, req_type, period_label))
                    if draft and draft.status not in ('draft', 'revision_requested'):
                        draft = None  # Only consider drafts/revision_requested

                    days_until = (due - today).days
                    upcoming.append({
                        'grant_id': grant.id,
                        'grant_title': grant.title,
                        'application_id': app_record.id,
                        'report_type': req_type,
                        'requirement_title': req_title,
                        'reporting_period': period_label,
                        'due_date': due.isoformat(),
                        'days_until_due': days_until,
                        'is_overdue': days_until < 0,
                        'status': draft.status if draft else 'not_started',
                        'draft_report_id': draft.id if draft else None,
                        'donor_org': grant.donor_org.name if grant.donor_org else None,
                    })

    elif current_user.role == 'donor':
        # Find grants owned by this donor that are awarded (with eager loading)
        awarded_apps = Application.query.options(
            db.joinedload(Application.grant),
            db.joinedload(Application.ngo_org)
        ).join(Grant).filter(
            Grant.donor_org_id == current_user.org_id,
            Application.status == 'awarded'
        ).all()

        # Pre-fetch all reports for grants owned by this donor to avoid N+1 queries
        donor_grant_ids = list({a.grant_id for a in awarded_apps if a.grant_id})
        _donor_report_lookup = {}
        if donor_grant_ids:
            donor_reports = Report.query.filter(Report.grant_id.in_(donor_grant_ids)).all()
            for r in donor_reports:
                key = (r.grant_id, r.submitted_by_org_id, r.report_type, r.reporting_period)
                _donor_report_lookup[key] = r

        for app_record in awarded_apps:
            grant = app_record.grant
            if not grant:
                continue
            ngo_org = app_record.ngo_org

            requirements = grant.get_reporting_requirements()
            if not requirements:
                freq = grant.reporting_frequency or 'quarterly'
                requirements = [{'type': 'financial', 'frequency': freq, 'due_days_after_period': 30, 'title': f'{freq.title()} Financial Report'}]

            grant_start = (grant.published_at or grant.created_at or datetime.now(timezone.utc)).date() if hasattr(grant.published_at or grant.created_at, 'date') else today

            for req in requirements:
                freq = req.get('frequency', grant.reporting_frequency or 'quarterly')
                due_days = req.get('due_days_after_period', 30)
                req_type = req.get('type', 'progress')

                if freq == 'monthly':
                    interval_months = 1
                elif freq == 'quarterly':
                    interval_months = 3
                elif freq == 'semi-annual':
                    interval_months = 6
                elif freq == 'annual':
                    interval_months = 12
                else:
                    continue

                for period_num in range(1, 13):
                    period_end_month = grant_start.month + (interval_months * period_num) - 1
                    period_end_year = grant_start.year + (period_end_month - 1) // 12
                    period_end_month = ((period_end_month - 1) % 12) + 1
                    try:
                        if period_end_month == 12:
                            period_end = date(period_end_year, 12, 31)
                        else:
                            period_end = date(period_end_year, period_end_month + 1, 1) - timedelta(days=1)
                    except (ValueError, OverflowError):
                        continue

                    due = period_end + timedelta(days=due_days)
                    if due > today + timedelta(days=90):
                        break
                    if due < grant_start:
                        continue

                    if interval_months <= 3:
                        q_num = ((period_end_month - 1) // 3) + 1
                        period_label = f"Q{q_num} {period_end_year}"
                    elif interval_months == 6:
                        h_num = 1 if period_end_month <= 6 else 2
                        period_label = f"H{h_num} {period_end_year}"
                    else:
                        period_label = str(period_end_year)

                    # Check if report exists from this NGO (using pre-fetched lookup)
                    existing = _donor_report_lookup.get(
                        (grant.id, app_record.ngo_org_id, req_type, period_label)
                    )

                    days_until = (due - today).days
                    upcoming.append({
                        'grant_id': grant.id,
                        'grant_title': grant.title,
                        'ngo_org_id': app_record.ngo_org_id,
                        'ngo_org_name': ngo_org.name if ngo_org else None,
                        'report_type': req_type,
                        'reporting_period': period_label,
                        'due_date': due.isoformat(),
                        'days_until_due': days_until,
                        'is_overdue': days_until < 0,
                        'status': existing.status if existing else 'not_submitted',
                        'report_id': existing.id if existing else None,
                    })

    # Sort: overdue first, then by due date
    upcoming.sort(key=lambda x: (not x.get('is_overdue', False), x.get('due_date', '')))

    return jsonify({
        'upcoming_reports': upcoming,
        'total': len(upcoming),
        'overdue_count': sum(1 for r in upcoming if r.get('is_overdue')),
    })
