from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename
from app.extensions import db
from app.models import Grant, Application, Report, Review
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

from app.services.audit import log_action

logger = logging.getLogger('kuja')

grants_bp = Blueprint('grants', __name__, url_prefix='/api/grants')


def _validate_grant_arrays(data):
    """Validate and normalize grant configuration arrays."""
    errors = []

    if 'criteria' in data:
        criteria = data['criteria']
        if not isinstance(criteria, list):
            errors.append('criteria must be a list')
        else:
            total_weight = sum(c.get('weight', 0) for c in criteria if isinstance(c, dict))
            if criteria and abs(total_weight - 100) > 1:
                errors.append(f'criteria weights sum to {total_weight}, expected 100')

    if 'eligibility' in data:
        if not isinstance(data['eligibility'], list):
            errors.append('eligibility must be a list')

    if 'doc_requirements' in data:
        if not isinstance(data['doc_requirements'], list):
            errors.append('doc_requirements must be a list')

    return errors


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

    # Phase 66 — optional fund_window_id filter for the per-window
    # drill-in (/admin/windows/<id> "See all grants in this window").
    # Accepts either `fund_window_id` (canonical) or `window_id` (alias)
    # for ergonomic deep-linking from window pages.
    window_id_param = (
        request.args.get('fund_window_id')
        or request.args.get('window_id')
    )
    if window_id_param:
        try:
            wid = int(window_id_param)
            query = query.filter(Grant.fund_window_id == wid)
        except ValueError:
            pass

    query = query.order_by(Grant.created_at.desc())
    pagination = paginate_query(query)

    grants_data = [g.to_dict(summary=True) for g in pagination.items]

    # For donors, include application count per grant
    if current_user.role in ('donor', 'admin'):
        grant_ids = [g.id for g in pagination.items]
        if grant_ids:
            counts = db.session.query(
                Application.grant_id, db.func.count(Application.id)
            ).filter(Application.grant_id.in_(grant_ids)).group_by(Application.grant_id).all()
            count_map = dict(counts)
            for gd in grants_data:
                gd['application_count'] = count_map.get(gd['id'], 0)

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

    # Validate array fields (log warnings but don't reject to preserve compatibility)
    validation_errors = _validate_grant_arrays(data)
    if validation_errors:
        logger.warning(f"Grant create validation warnings: {validation_errors}")

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

    # Validate array fields (log warnings but don't reject to preserve compatibility)
    validation_errors = _validate_grant_arrays(data)
    if validation_errors:
        logger.warning(f"Grant update validation warnings for grant {grant_id}: {validation_errors}")

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


@grants_bp.route('/<int:grant_id>', methods=['DELETE'])
@role_required('donor', 'admin')
def api_delete_grant(grant_id):
    """Delete a grant. Restricted to draft status to protect grants that
    have already been published or awarded. Donors can only delete grants
    owned by their organization; admins can delete any draft.

    Query params:
      cascade=true — also delete any draft applications referencing this
                     grant. Submitted/awarded applications still block
                     the delete (409). Useful for cleaning up after e2e
                     test runs where an NGO created a draft application
                     before the test was abandoned.

    Previously DELETE /api/grants/<id> didn't exist, so the e2e test
    suite's cleanup calls silently failed and orphan drafts accumulated
    in production.
    """
    grant = db.session.get(Grant, grant_id)
    if not grant:
        return jsonify({'error': 'Grant not found', 'success': False}), 404

    if current_user.role == 'donor' and grant.donor_org_id != current_user.org_id:
        return jsonify({'error': 'You can only delete your own grants', 'success': False}), 403

    if grant.status != 'draft':
        return jsonify({
            'error': f'Cannot delete a grant with status "{grant.status}". '
                     f'Only drafts may be deleted.',
            'success': False,
        }), 400

    cascade = request.args.get('cascade', '').lower() in ('true', '1', 'yes')
    apps = Application.query.filter_by(grant_id=grant.id).all()

    cascaded_app_ids = []
    cascaded_report_ids = []
    cascaded_review_ids = []
    if apps:
        if not cascade:
            return jsonify({
                'error': f'Cannot delete: {len(apps)} application(s) reference this grant. '
                         f'Pass ?cascade=true to also delete draft applications.',
                'success': False,
            }), 409

        # With cascade=true, only draft applications are removed. Any
        # submitted/awarded application still blocks (data integrity).
        non_draft = [a for a in apps if a.status != 'draft']
        if non_draft:
            return jsonify({
                'error': f'Cannot cascade-delete: {len(non_draft)} application(s) are not '
                         f'in draft status (statuses: '
                         f'{sorted(set(a.status for a in non_draft))}).',
                'success': False,
            }), 409

        # Reports and Reviews FK to Application/Grant with NOT NULL — if we
        # delete an Application without first removing its dependent Reports
        # and Reviews, SQLAlchemy tries to null those FKs and the DB rejects
        # it. Sweep them first. Same posture as the grant itself: this only
        # runs when we've already verified the apps are drafts, so the
        # downstream rows belong to abandoned test state.
        app_ids = [a.id for a in apps]
        if app_ids:
            for r in Review.query.filter(Review.application_id.in_(app_ids)).all():
                cascaded_review_ids.append(r.id)
                db.session.delete(r)
            for rep in Report.query.filter(Report.application_id.in_(app_ids)).all():
                cascaded_report_ids.append(rep.id)
                db.session.delete(rep)
        # Also any Reports attached directly to the grant (without an app)
        for rep in Report.query.filter(Report.grant_id == grant.id).all():
            if rep.id not in cascaded_report_ids:
                cascaded_report_ids.append(rep.id)
                db.session.delete(rep)

        for a in apps:
            cascaded_app_ids.append(a.id)
            db.session.delete(a)

    title = grant.title
    db.session.delete(grant)
    db.session.commit()

    log_action('grant.deleted', current_user.email, 'grant', grant_id,
               {'title': title, 'donor_org_id': grant.donor_org_id,
                'cascaded_application_ids': cascaded_app_ids,
                'cascaded_report_ids': cascaded_report_ids,
                'cascaded_review_ids': cascaded_review_ids})
    logger.info(
        f"Grant deleted: {title} (id={grant_id}) by user {current_user.email}; "
        f"cascaded {len(cascaded_app_ids)} app(s), "
        f"{len(cascaded_report_ids)} report(s), "
        f"{len(cascaded_review_ids)} review(s)"
    )

    return jsonify({
        'success': True,
        'deleted_id': grant_id,
        'cascaded_application_ids': cascaded_app_ids,
        'cascaded_report_ids': cascaded_report_ids,
        'cascaded_review_ids': cascaded_review_ids,
    })


@grants_bp.route('/<int:grant_id>/publish', methods=['POST'])
@role_required('donor', 'admin')
def api_publish_grant(grant_id):
    """Publish a grant (set status to 'open')."""
    grant = db.session.get(Grant, grant_id)
    if not grant:
        return jsonify({'error': 'Grant not found'}), 404

    if current_user.role == 'donor' and grant.donor_org_id != current_user.org_id:
        return jsonify({'error': 'You can only publish your own grants', 'success': False}), 403

    # Idempotent: if already open, return success without error
    if grant.status == 'open':
        logger.info(f"Grant already published (idempotent): {grant.title} (id={grant.id}) by user {current_user.email}")
        return jsonify({'success': True, 'message': 'Grant is already published', 'grant': grant.to_dict()})

    if grant.status != 'draft':
        return jsonify({'error': f'Cannot publish a grant with status "{grant.status}"', 'success': False}), 400

    grant.status = 'open'
    grant.published_at = datetime.now(timezone.utc)
    db.session.commit()

    log_action('grant.published', current_user.email, 'grant', grant.id,
               {'title': grant.title, 'donor_org_id': grant.donor_org_id})

    logger.info(f"Grant published: {grant.title} (id={grant.id}) by user {current_user.email}")

    # Phase 16C — fire smart-match notifications. Best-effort, never
    # blocks the publish response. The service is idempotent (writes an
    # audit-chain anchor) so a republish doesn't re-fire.
    notify_summary = None
    try:
        from app.services.match_notification_service import MatchNotificationService
        notify_summary = MatchNotificationService.notify_for_new_grant(grant.id)
        logger.info(
            f"Match notifications for grant {grant.id}: {notify_summary}"
        )
    except Exception as e:
        logger.warning(f"Match notifications failed (non-fatal): {e}")

    response = {'success': True, 'grant': grant.to_dict()}
    if notify_summary:
        response['match_notifications'] = {
            'notified': notify_summary.get('notified'),
            'high_matches': notify_summary.get('high_matches'),
            'reason': notify_summary.get('reason'),
        }
    return jsonify(response)


@grants_bp.route('/<int:grant_id>/audit-folder', methods=['GET'])
@login_required
def api_audit_folder_export(grant_id):
    """Phase 73 — Audit-ready folder export.

    NGOs are routinely audited — by their auditors, by the donor's auditors,
    sometimes by government bodies — on a few days' notice. Reconstructing
    "everything related to grant X" from email + Drive + folders takes days.

    This endpoint streams a ZIP containing:
      - manifest.txt  (human-readable contents list)
      - manifest.json (machine-readable, with timestamps + hashes)
      - 1-agreement/<grant-doc>            (the signed agreement)
      - 2-application/                     (NGO's submitted application + docs)
      - 3-reports/<period>/                (one folder per report period,
                                            with content.json + attachments)
      - 4-reviews/                         (donor's reviewer notes per report)
      - 5-evidence/                        (photo-evidence + other docs)
      - 6-financials/                      (any docs flagged as financial)

    Access control:
      - The NGO that owns the application can always download their folder.
      - The donor for this grant can download (for their own audit needs).
      - Admins can download (for support / dispute).
      - Reviewers cannot download — wrong scope.

    Returns: application/zip stream.
    """
    import io, json, zipfile, hashlib
    from datetime import datetime as _dt, timezone as _tz
    from flask import send_file, abort
    from app.models import Document, Application
    try:
        from app.models import Review as _Review
    except Exception:
        _Review = None

    grant = db.session.get(Grant, grant_id)
    if not grant:
        return jsonify({'error': 'Grant not found', 'success': False}), 404

    role = getattr(current_user, 'role', None)
    is_donor = role in ('donor', 'admin') and (role == 'admin' or grant.donor_org_id == current_user.org_id)
    org_id_for_filter = None
    if role == 'ngo':
        # NGO can only export folders for grants they applied to.
        app = Application.query.filter_by(grant_id=grant_id, ngo_org_id=current_user.org_id).first()
        if not app:
            return jsonify({'error': 'You do not have an application on this grant.', 'success': False}), 403
        org_id_for_filter = current_user.org_id
    elif not is_donor and role != 'admin':
        return jsonify({'error': 'Not authorised to export an audit folder for this grant.', 'success': False}), 403

    # Discover all the artefacts.
    apps_q = Application.query.filter_by(grant_id=grant_id)
    if org_id_for_filter is not None:
        apps_q = apps_q.filter_by(ngo_org_id=org_id_for_filter)
    applications = apps_q.all()
    app_ids = [a.id for a in applications]

    reports = Report.query.filter(Report.grant_id == grant_id)
    if org_id_for_filter is not None:
        reports = reports.filter(Report.submitted_by_org_id == org_id_for_filter)
    reports = reports.all()

    # Pull documents linked to any of the applications. Reports use a
    # JSON attachments column rather than a Document FK.
    documents = []
    if app_ids:
        documents = Document.query.filter(Document.application_id.in_(app_ids)).all()
    # Add documents referenced from report.attachments by document_id.
    report_doc_ids = set()
    for r in reports:
        for att in (r.get_attachments() or []):
            did = att.get('document_id') if isinstance(att, dict) else None
            if isinstance(did, int):
                report_doc_ids.add(did)
    if report_doc_ids:
        extra_docs = Document.query.filter(Document.id.in_(report_doc_ids)).all()
        seen = {d.id for d in documents}
        for d in extra_docs:
            if d.id not in seen:
                documents.append(d)

    upload_dir = current_app.config.get('UPLOAD_FOLDER', '')

    def _file_path(stored_filename):
        return os.path.join(upload_dir, stored_filename) if stored_filename else None

    def _sha256(path):
        if not path or not os.path.exists(path):
            return None
        h = hashlib.sha256()
        with open(path, 'rb') as f:
            for chunk in iter(lambda: f.read(65536), b''):
                h.update(chunk)
        return h.hexdigest()

    # Build the ZIP in memory. Audit folders are typically modest (<20 MB);
    # if a real-world bundle ever exceeds streaming budget we can move to
    # zipstream-new. For now this keeps the implementation simple.
    buf = io.BytesIO()
    manifest = {
        'generated_at': _dt.now(_tz.utc).isoformat(),
        'generated_by': {'user_id': current_user.id, 'role': role},
        'grant': {
            'id': grant.id, 'title': grant.title, 'donor_org_id': grant.donor_org_id,
            'total_funding': float(grant.total_funding) if grant.total_funding is not None else None,
            'currency': getattr(grant, 'currency', None),
            'status': getattr(grant, 'status', None),
            'created_at': grant.created_at.isoformat() if getattr(grant, 'created_at', None) else None,
        },
        'applications': [], 'reports': [], 'documents': [], 'reviews': [],
        'evidence_photos': 0,
    }
    readme_lines = [
        'KUJA AUDIT-READY FOLDER',
        '=======================',
        f"Generated:  {manifest['generated_at']}",
        f"Grant:      {grant.title} (#{grant.id})",
        f"Scope:      " + ('Single NGO (your application only)' if org_id_for_filter else 'All applications under this grant'),
        '',
        'Folder layout:',
        '  1-agreement/      The grant agreement document.',
        '  2-application/    NGO application(s) + supporting documents.',
        '  3-reports/        One subfolder per submitted report period.',
        '  4-reviews/        Donor / reviewer notes for each report.',
        '  5-evidence/       Photo-evidence + miscellaneous attachments.',
        '  6-financials/     Documents flagged as financial.',
        '',
        'manifest.json contains a full machine-readable inventory with',
        'SHA-256 hashes of each file for tamper-evidence.',
        '',
    ]

    with zipfile.ZipFile(buf, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
        # ---- 1-agreement -------------------------------------------------
        agreement_path = None
        if getattr(grant, 'grant_document', None):
            agreement_path = _file_path(grant.grant_document)
            if agreement_path and os.path.exists(agreement_path):
                arc = f'1-agreement/{os.path.basename(grant.grant_document)}'
                zf.write(agreement_path, arc)
                manifest['agreement'] = {'arcname': arc, 'sha256': _sha256(agreement_path)}

        # ---- 2-application ----------------------------------------------
        for a in applications:
            adir = f'2-application/app-{a.id}/'
            payload = {
                'id': a.id, 'ngo_org_id': a.ngo_org_id,
                'status': getattr(a, 'status', None),
                'submitted_at': a.submitted_at.isoformat() if getattr(a, 'submitted_at', None) else None,
                'responses': a.get_responses() if hasattr(a, 'get_responses') else None,
                'budget_lines': a.get_budget_lines() if hasattr(a, 'get_budget_lines') else None,
                'ai_score': getattr(a, 'ai_score', None),
            }
            zf.writestr(adir + 'application.json', json.dumps(payload, indent=2, default=str))
            manifest['applications'].append({'id': a.id, 'status': payload['status'], 'submitted_at': payload['submitted_at']})

        # ---- 3-reports + 5-evidence (split by doc_type) ----------------
        for r in reports:
            period_key = (r.reporting_period or f'report-{r.id}').replace('/', '-').replace(' ', '_')
            rdir = f'3-reports/{period_key}/'
            content = r.get_content() or {}
            zf.writestr(rdir + 'content.json', json.dumps(content, indent=2, ensure_ascii=False))
            zf.writestr(
                rdir + 'metadata.json',
                json.dumps({
                    'id': r.id, 'status': r.status, 'report_type': r.report_type,
                    'reporting_period': r.reporting_period,
                    'due_date': r.due_date.isoformat() if r.due_date else None,
                    'submitted_at': r.submitted_at.isoformat() if r.submitted_at else None,
                    'reviewed_at': r.reviewed_at.isoformat() if r.reviewed_at else None,
                    'reviewer_notes': r.reviewer_notes,
                    'ai_analysis_summary': (r.get_ai_analysis() or {}).get('summary'),
                    'revision_number': r.revision_number,
                }, indent=2, default=str),
            )
            # Revision snapshots if any.
            revs = r.get_revision_history() or []
            if revs:
                zf.writestr(rdir + 'revisions.json', json.dumps(revs, indent=2, default=str))
            manifest['reports'].append({
                'id': r.id, 'period': r.reporting_period, 'status': r.status,
                'submitted_at': r.submitted_at.isoformat() if r.submitted_at else None,
            })
            # Reviewer record for 4-reviews
            if r.reviewer_notes or r.reviewed_at:
                zf.writestr(
                    f'4-reviews/report-{r.id}-review.json',
                    json.dumps({
                        'report_id': r.id, 'status': r.status,
                        'reviewed_at': r.reviewed_at.isoformat() if r.reviewed_at else None,
                        'reviewer_notes': r.reviewer_notes,
                    }, indent=2),
                )
                manifest['reviews'].append({'report_id': r.id, 'reviewed_at': r.reviewed_at.isoformat() if r.reviewed_at else None})

        # ---- documents bucketed by doc_type ----------------------------
        for d in documents:
            src = _file_path(d.stored_filename)
            if not src or not os.path.exists(src):
                continue
            dtype = (d.doc_type or '').lower()
            if dtype in ('financial', 'audit', 'budget', 'receipt'):
                bucket = '6-financials/'
            elif dtype == 'report_evidence' or (d.mime_type or '').startswith('image/'):
                bucket = '5-evidence/'
            else:
                bucket = '2-application/docs/'
            arc = bucket + (d.original_filename or d.stored_filename)
            try:
                zf.write(src, arc)
                doc_entry = {
                    'arcname': arc, 'doc_type': d.doc_type,
                    'original_filename': d.original_filename,
                    'file_size': d.file_size,
                    'uploaded_at': d.uploaded_at.isoformat() if d.uploaded_at else None,
                    'sha256': _sha256(src),
                }
                manifest['documents'].append(doc_entry)
                if bucket == '5-evidence/':
                    manifest['evidence_photos'] += 1
            except Exception as e:
                logger.warning(f"audit folder: could not zip doc {d.id}: {e}")

        # ---- 4-reviews: pull formal Reviews if model is present -------
        if _Review is not None and app_ids:
            for rev in _Review.query.filter(_Review.application_id.in_(app_ids)).all():
                payload = {
                    'id': rev.id,
                    'application_id': rev.application_id,
                    'reviewer_id': getattr(rev, 'reviewer_id', None),
                    'status': getattr(rev, 'status', None),
                    'overall_score': getattr(rev, 'overall_score', None),
                    'comments': getattr(rev, 'comments', None),
                    'completed_at': rev.completed_at.isoformat() if getattr(rev, 'completed_at', None) else None,
                }
                zf.writestr(f'4-reviews/application-review-{rev.id}.json', json.dumps(payload, indent=2, default=str))
                manifest['reviews'].append({'application_review_id': rev.id, 'completed_at': payload['completed_at']})

        # ---- manifests (last so they capture everything) ---------------
        zf.writestr('manifest.json', json.dumps(manifest, indent=2, default=str))
        readme_lines.append(f"Documents included: {len(manifest['documents'])}")
        readme_lines.append(f"Reports included:   {len(manifest['reports'])}")
        readme_lines.append(f"Applications:       {len(manifest['applications'])}")
        readme_lines.append(f"Reviews:            {len(manifest['reviews'])}")
        zf.writestr('manifest.txt', '\n'.join(readme_lines))

    buf.seek(0)
    ts = _dt.now(_tz.utc).strftime('%Y%m%d-%H%M')
    org_token = f"-org{org_id_for_filter}" if org_id_for_filter else ''
    fname = f'kuja-audit-folder-grant{grant.id}{org_token}-{ts}.zip'
    return send_file(
        buf, mimetype='application/zip',
        as_attachment=True, download_name=fname,
    )


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

    # DEF-CORE-001: If AI returned zero requirements, merge fallback defaults
    reqs = extracted.get('requirements', [])
    if not isinstance(reqs, list) or len(reqs) == 0:
        fallback = AIService._fallback_reporting_requirements()
        extracted['requirements'] = fallback['requirements']
        if not extracted.get('template_sections'):
            extracted['template_sections'] = fallback['template_sections']
        if not extracted.get('indicators'):
            extracted['indicators'] = fallback['indicators']
        if not extracted.get('reporting_frequency'):
            extracted['reporting_frequency'] = fallback['reporting_frequency']
        logger.info(f"AI returned empty requirements for grant {grant_id}; using fallback defaults")

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

    response = jsonify({
        'success': True,
        'grant_document': stored_filename,
        'original_filename': original_filename,
        'extracted_requirements': extracted,
        'requirements_saved': requirements_saved,
        'content_extracted': len(file_content) > 100,
        'auto_saved': True,
    })
    # Prevent proxy buffering so the connection stays alive during AI extraction
    response.headers['X-Accel-Buffering'] = 'no'
    response.headers['Connection'] = 'keep-alive'
    return response


# ---------------------------------------------------------------------------
# Phase 13.8 — grant compliance health (4-pillar score + Why-this-score)
# ---------------------------------------------------------------------------

@grants_bp.route('/<int:grant_id>/compliance-health/trajectory', methods=['GET'])
@login_required
def api_grant_compliance_trajectory(grant_id):
    """Phase 13.27 — sparkline + 30-day forecast for a grant's health score.

    Output: { history: [{date, score, band}, ...], forecast_30d_score,
              slips_below_at_risk_in_days }
    """
    from app.utils.api_errors import error_response
    from app.services.compliance_health import trajectory

    grant = db.session.get(Grant, grant_id)
    if not grant:
        return error_response('grant.not_found', 404)
    if current_user.role not in ('donor', 'admin'):
        return error_response('auth.access_denied', 403)
    if current_user.role == 'donor' and getattr(grant, 'donor_org_id', None) != current_user.org_id:
        return error_response('auth.access_denied', 403)

    days = min(int(request.args.get('days', 60)), 365)
    return jsonify({'success': True, 'grant_id': grant_id, **trajectory(grant_id, days=days)})


@grants_bp.route('/<int:grant_id>/compliance-health', methods=['GET'])
@login_required
def api_grant_compliance_health(grant_id):
    """Return the 4-pillar compliance health score for this grant.

    Donors + admins only. Other roles can call /api/grants/<id> for the
    public-facing grant info; this endpoint is the donor-side health
    surface that drives the 'Why this score?' dialog and the trajectory
    chart.

    Output (rule-based, no AI cost):
      score (0-100), band (on_track / at_risk / high_risk), pillars[]
      sorted lowest-first, with per-pillar contributions for the
      dialog drilldown.
    """
    from app.utils.api_errors import error_response
    from app.services.compliance_health import calculate_grant_compliance_health

    grant = db.session.get(Grant, grant_id)
    if not grant:
        return error_response('grant.not_found', 404)
    if current_user.role not in ('donor', 'admin'):
        return error_response('auth.access_denied', 403)
    if current_user.role == 'donor' and getattr(grant, 'donor_org_id', None) != current_user.org_id:
        return error_response('auth.access_denied', 403)

    breakdown = calculate_grant_compliance_health(grant_id)
    # Phase 13.28 — overlay AI narrative when the flag is on (default
    # off; flip per-tenant). Adds `narrative` field; falls back silently
    # to rule-based when AI is offline.
    try:
        from app.utils.feature_flags import is_enabled
        if is_enabled('ai.compliance_health_narrative'):
            from app.services.compliance_health import add_ai_narrative
            breakdown = add_ai_narrative(
                breakdown,
                language=getattr(current_user, 'language', None) or 'en',
            )
    except Exception:
        pass
    return jsonify({'success': True, **breakdown})


# ---------------------------------------------------------------------------
# Phase 2.3 — donor portfolio diagnostics
# ---------------------------------------------------------------------------

@grants_bp.route('/portfolio-diagnostics', methods=['GET'])
@login_required
def api_portfolio_diagnostics():
    """Cross-grant diagnostics for a donor's portfolio.

    Surfaces three classes of insight:
      1. Per-grant rollups: submissions, awarded, decline rate, avg AI score
      2. Criterion-quality patterns: which of THIS donor's criteria show
         the highest reviewer-score divergence (good criteria discriminate;
         high divergence = working as designed). And which produce
         identical-looking responses (low signal — too generic).
      3. Anomalies: grants attracting <2 applicants, grants where every
         applicant scores >85 (criteria too easy), grants with 50%+
         applicant decline (criteria likely too narrow).

    Donor-scoped: only grants where grant.donor_org_id == caller.org_id.
    Admin sees everyone.
    """
    if current_user.role not in ('donor', 'admin'):
        from app.utils.api_errors import error_response
        return error_response('auth.access_denied', 403)

    from sqlalchemy import func
    from datetime import datetime, timezone, timedelta

    org_filter = (Grant.donor_org_id == current_user.org_id) if current_user.role == 'donor' else True

    grants_q = Grant.query.filter(org_filter).order_by(Grant.created_at.desc()).limit(50)
    grants = grants_q.all()

    per_grant = []
    aggregate = {
        'total_grants': 0,
        'total_submissions': 0,
        'total_awarded': 0,
        'total_rejected': 0,
        'avg_ai_score_pct': None,
    }
    sum_score = 0.0
    score_count = 0
    anomalies = []

    for g in grants:
        try:
            apps = (Application.query
                    .filter_by(grant_id=g.id)
                    .filter(Application.status.in_(('submitted', 'scored', 'awarded', 'rejected')))
                    .all())
        except Exception:
            apps = []

        n = len(apps)
        if n == 0:
            per_grant.append({
                'grant_id': g.id,
                'title': g.title,
                'submissions': 0,
                'awarded': 0,
                'rejected': 0,
                'avg_ai_score': None,
                'min_ai_score': None,
                'max_ai_score': None,
            })
            continue

        awarded_n = sum(1 for a in apps if a.status == 'awarded')
        rejected_n = sum(1 for a in apps if a.status == 'rejected')
        ai_scores = [a.ai_score for a in apps if a.ai_score is not None]

        avg_ai = (sum(ai_scores) / len(ai_scores)) if ai_scores else None
        min_ai = min(ai_scores) if ai_scores else None
        max_ai = max(ai_scores) if ai_scores else None

        per_grant.append({
            'grant_id': g.id,
            'title': g.title,
            'submissions': n,
            'awarded': awarded_n,
            'rejected': rejected_n,
            'avg_ai_score': round(avg_ai, 1) if avg_ai is not None else None,
            'min_ai_score': round(min_ai, 1) if min_ai is not None else None,
            'max_ai_score': round(max_ai, 1) if max_ai is not None else None,
            'score_spread': round(max_ai - min_ai, 1) if (min_ai is not None and max_ai is not None) else None,
        })

        aggregate['total_submissions'] += n
        aggregate['total_awarded'] += awarded_n
        aggregate['total_rejected'] += rejected_n
        if ai_scores:
            sum_score += sum(ai_scores)
            score_count += len(ai_scores)

        # Anomaly detection per grant.
        if g.status == 'open' and n < 2:
            anomalies.append({
                'kind': 'low_interest',
                'grant_id': g.id,
                'title': g.title,
                'detail_key': 'portfolio.anomaly.low_interest',
                'submissions': n,
            })
        if n >= 5 and ai_scores and (max_ai - min_ai) < 8:
            anomalies.append({
                'kind': 'low_discrimination',
                'grant_id': g.id,
                'title': g.title,
                'detail_key': 'portfolio.anomaly.low_discrimination',
                'spread': round(max_ai - min_ai, 1),
            })
        if n >= 5 and avg_ai is not None and avg_ai > 85:
            anomalies.append({
                'kind': 'criteria_too_easy',
                'grant_id': g.id,
                'title': g.title,
                'detail_key': 'portfolio.anomaly.criteria_too_easy',
                'avg_score': round(avg_ai, 1),
            })
        if n >= 5 and (rejected_n / max(1, n)) > 0.5:
            anomalies.append({
                'kind': 'high_decline',
                'grant_id': g.id,
                'title': g.title,
                'detail_key': 'portfolio.anomaly.high_decline',
                'decline_rate_pct': round(100 * rejected_n / n, 1),
            })

    aggregate['total_grants'] = len(grants)
    aggregate['avg_ai_score_pct'] = round(sum_score / score_count, 1) if score_count else None

    return jsonify({
        'success': True,
        'aggregate': aggregate,
        'per_grant': per_grant,
        'anomalies': anomalies[:20],  # cap for transport
    })


# ---------------------------------------------------------------------------
# Phase 4.2 — live drafters pill
# ---------------------------------------------------------------------------

@grants_bp.route('/<int:grant_id>/drafters', methods=['GET'])
@login_required
def api_grant_drafters(grant_id):
    """Return how many NGOs currently have a draft application open.

    Donor-only (or admin). The donor's grant detail page shows a "12 NGOs
    are drafting now" pill — anonymized but real signal that the call is
    attracting interest. Excludes the donor's own org id and any soft-
    deleted apps.

    We define "currently drafting" as: status='draft' AND updated within
    the last 14 days AND the grant's deadline (if any) hasn't passed.
    """
    grant = db.session.get(Grant, grant_id)
    if not grant:
        from app.utils.api_errors import error_response
        return error_response('grant.not_found', 404)

    if current_user.role not in ('donor', 'admin'):
        from app.utils.api_errors import error_response
        return error_response('auth.access_denied', 403)
    if current_user.role == 'donor' and grant.donor_org_id != current_user.org_id:
        from app.utils.api_errors import error_response
        return error_response('auth.access_denied', 403)

    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=14)

    try:
        # Distinct count of NGO orgs with an active draft.
        from sqlalchemy import func, distinct
        q = (db.session.query(func.count(distinct(Application.ngo_org_id)))
             .filter(Application.grant_id == grant_id)
             .filter(Application.status == 'draft')
             .filter(Application.updated_at >= cutoff))
        if grant.deadline:
            from datetime import date
            if grant.deadline < date.today():
                # Closed call — return 0; the pill should hide.
                return jsonify({'success': True, 'count': 0, 'window_days': 14})
        count = q.scalar() or 0
    except Exception as e:
        logger.error(f"drafters count failed: {e}")
        count = 0

    return jsonify({
        'success': True,
        'count': int(count),
        'window_days': 14,
    })


# ----------------------------------------------------------------------
# Phase 17C — AI grant fit comparison for NGOs.
# NGO picks 2-4 grant IDs and asks "which fits best?" AI ranks them
# vs the NGO's profile + history.
# ----------------------------------------------------------------------

@grants_bp.route('/<int:grant_id>/broadcast', methods=['POST'])
@login_required
@role_required('donor', 'admin')
def api_grant_broadcast(grant_id):
    """Phase 21B — donor sends one clarification message to every NGO
    who has applied/drafted on this grant.

    Body: { subject: str, body: str, audience?: 'all'|'drafts'|'submitted' }
    """
    from app.services.grant_broadcast_service import GrantBroadcastService

    grant = db.session.get(Grant, grant_id)
    if not grant:
        return jsonify({'success': False, 'error': 'Grant not found'}), 404
    if current_user.role == 'donor' and grant.donor_org_id != current_user.org_id:
        return jsonify({'success': False, 'error': 'Insufficient permissions'}), 403

    data = get_request_json() or {}
    subject = (data.get('subject') or '').strip()
    body = (data.get('body') or '').strip()
    audience = (data.get('audience') or 'all').strip()
    if not subject:
        return jsonify({'success': False, 'error': 'subject required'}), 400
    if not body:
        return jsonify({'success': False, 'error': 'body required'}), 400

    result = GrantBroadcastService.send(
        grant_id=grant_id,
        sender_user=current_user,
        subject=subject,
        body=body,
        audience=audience,
    )

    # Phase 30D — funnel: donor sent a broadcast.
    if result.get('ok'):
        try:
            from app.services.user_event_service import UserEventService
            UserEventService.record(
                user=current_user, event_name='donor.broadcast_sent',
                grant_id=grant_id, audience=audience,
                recipients=result.get('recipient_count'),
            )
        except Exception:
            pass

    status = 200 if result.get('ok') else 400
    return jsonify({'success': result.get('ok'), **result}), status


@grants_bp.route('/fit-compare', methods=['POST'])
@login_required
@role_required('ngo', 'admin')
def api_grant_fit_compare():
    """Body: { grant_ids: [int, ...] (2-4) }"""
    from app.services.grant_fit_compare_service import GrantFitCompareService
    from app.utils.cache import _dashboard_cache

    if not current_user.org_id:
        return jsonify({'success': False, 'error': 'Org required'}), 400

    data = get_request_json() or {}
    raw_ids = data.get('grant_ids') or []
    if not isinstance(raw_ids, list):
        return jsonify({'success': False, 'error': 'grant_ids must be a list'}), 400
    try:
        ids = sorted(set(int(x) for x in raw_ids))
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': 'grant_ids must be ints'}), 400
    if len(ids) < 2:
        return jsonify({'success': False, 'error': 'at least 2 grants required'}), 400
    if len(ids) > 4:
        return jsonify({'success': False, 'error': 'at most 4 grants allowed'}), 400

    # Visibility: every grant must be open or the NGO has an application on it
    ngo_org_id = current_user.org_id if current_user.role == 'ngo' else current_user.org_id
    grants = Grant.query.filter(Grant.id.in_(ids)).all()
    for g in grants:
        if g.status not in ('open', 'awarded', 'closed'):
            return jsonify({'success': False,
                            'error': f'Grant {g.id} not visible (status={g.status})'}), 403

    cache_key = f"grant_fit_{ngo_org_id}_{'-'.join(str(i) for i in ids)}"
    cached = _dashboard_cache.get(cache_key)
    if cached is not None:
        return jsonify({'cached': True, **cached})

    result = GrantFitCompareService.compare(
        ngo_org_id=ngo_org_id, grant_ids=ids,
    )
    if not result:
        return jsonify({'success': False, 'error': 'Could not compute comparison'}), 500
    _dashboard_cache.set(cache_key, result)
    return jsonify(result)
