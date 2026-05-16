"""
Report bundle + reviewer follow-up routes — Phase 8.

Blueprint prefix: /api
Routes:
  GET  /api/reports/<id>/bundle                      - assemble (read-only)
  POST /api/reports/<id>/bundle/publish              - assemble + audit-chain anchor
  GET  /api/reviewer/followups/application/<id>      - reviewer AI: top 3 follow-ups
  GET  /api/reviewer/followups/report/<id>           - reviewer AI: top 3 follow-ups for a report
"""

import logging
import re

from flask import Blueprint, jsonify, send_file
from flask_login import login_required, current_user

from app.extensions import db
from app.models import Report, Application
from app.services.report_bundle_service import ReportBundleService
from app.services.reviewer_followups_service import ReviewerFollowupsService
from app.utils.cache import _dashboard_cache

logger = logging.getLogger('kuja')

report_bundle_bp = Blueprint('report_bundle', __name__, url_prefix='/api')


def _report_visible(rpt) -> bool:
    if not rpt: return False
    if current_user.role == 'admin': return True
    if current_user.role == 'ngo':
        return rpt.submitted_by_org_id == current_user.org_id
    if current_user.role == 'donor':
        return bool(rpt.grant and rpt.grant.donor_org_id == current_user.org_id)
    if current_user.role == 'reviewer':
        return True
    return False


def _application_visible(app) -> bool:
    if not app: return False
    if current_user.role == 'admin': return True
    if current_user.role == 'ngo':
        return app.ngo_org_id == current_user.org_id
    if current_user.role == 'donor':
        return bool(app.grant and app.grant.donor_org_id == current_user.org_id)
    if current_user.role == 'reviewer':
        return True
    return False


@report_bundle_bp.route('/reports/<int:report_id>/bundle', methods=['GET'])
@login_required
def api_bundle_assemble(report_id):
    """Read-only assembly. Anyone with visibility on the report can fetch."""
    rpt = db.session.get(Report, report_id)
    if not _report_visible(rpt):
        return jsonify({'success': False, 'error': 'Not found'}), 404
    cache_key = f'report_bundle_{report_id}_{current_user.id}'
    cached = _dashboard_cache.get(cache_key)
    if cached is not None:
        return jsonify({'success': True, 'bundle': cached, 'cached': True})
    bundle = ReportBundleService.assemble(report_id, with_ai_summary=True)
    if not bundle:
        return jsonify({'success': False, 'error': 'Could not assemble bundle'}), 500
    _dashboard_cache.set(cache_key, bundle)
    return jsonify({'success': True, 'bundle': bundle})


@report_bundle_bp.route('/reports/<int:report_id>/bundle.pdf', methods=['GET'])
@login_required
def api_bundle_pdf(report_id):
    """Download the bundle as a PDF. Same visibility check as the
    JSON assembly. The PDF is generated on demand from the cached
    bundle (or a fresh assembly if cache is empty)."""
    rpt = db.session.get(Report, report_id)
    if not _report_visible(rpt):
        return jsonify({'success': False, 'error': 'Not found'}), 404

    cache_key = f'report_bundle_{report_id}_{current_user.id}'
    bundle = _dashboard_cache.get(cache_key)
    if bundle is None:
        bundle = ReportBundleService.assemble(report_id, with_ai_summary=True)
        if bundle:
            _dashboard_cache.set(cache_key, bundle)
    if not bundle:
        return jsonify({'success': False, 'error': 'Could not assemble bundle'}), 500

    try:
        from app.services.bundle_pdf_service import build_bundle_pdf
        pdf_bytes = build_bundle_pdf(bundle)
    except Exception as e:
        logger.exception(f"Bundle PDF render failed: {e}")
        return jsonify({'success': False, 'error': 'PDF render failed'}), 500

    # Filename: kuja-bundle-<grant-slug>-<report-id>-<hash6>.pdf
    grant_title = (bundle.get('cover_meta', {}) or {}).get('grant_title') or 'grant'
    slug = re.sub(r'[^a-z0-9]+', '-', grant_title.lower()).strip('-')[:60] or 'grant'
    hash6 = (bundle.get('bundle_hash') or '')[:6]
    filename = f'kuja-bundle-{slug}-r{report_id}-{hash6}.pdf'

    # Phase 12 — donor-review audit receipt. Every donor / admin / reviewer
    # download writes a hash-anchored row to the audit chain so the NGO can
    # later prove the bundle was reviewed (and by whom, when). NGOs
    # downloading their own bundles don't fire receipts (avoids self-
    # reviewed noise in the audit log).
    try:
        from app.models import AuditChainEntry
        if current_user.role in ('donor', 'reviewer', 'admin'):
            AuditChainEntry.append(
                action='report_bundle.download_pdf',
                actor_email=getattr(current_user, 'email', None),
                subject_kind='report',
                subject_id=report_id,
                details={
                    'bundle_hash': bundle.get('bundle_hash'),
                    'reviewer_role': current_user.role,
                    'pdf_bytes': len(pdf_bytes),
                    'filename': filename,
                },
            )
    except Exception as e:
        # Never block the download on an audit failure
        logger.warning(f"Bundle PDF audit receipt failed: {e}")

    import io
    return send_file(
        io.BytesIO(pdf_bytes),
        mimetype='application/pdf',
        as_attachment=True,
        download_name=filename,
    )


@report_bundle_bp.route('/reports/<int:report_id>/bundle/publish', methods=['POST'])
@login_required
def api_bundle_publish(report_id):
    """Assemble + write an AuditChainEntry. NGO or admin only (the
    submitter publishes; donor reviews the published bundle)."""
    rpt = db.session.get(Report, report_id)
    if not _report_visible(rpt):
        return jsonify({'success': False, 'error': 'Not found'}), 404
    if current_user.role not in ('ngo', 'admin'):
        return jsonify({'success': False, 'error': 'Only the submitter or an admin can publish a bundle'}), 403
    bundle = ReportBundleService.publish(report_id, user=current_user, with_ai_summary=True)
    if not bundle:
        return jsonify({'success': False, 'error': 'Could not publish bundle'}), 500
    # Bust the cache so subsequent reads see the freshly published view
    _dashboard_cache.set(f'report_bundle_{report_id}_{current_user.id}', bundle)
    return jsonify({'success': True, 'bundle': bundle})


@report_bundle_bp.route('/reviewer/followups/application/<int:application_id>', methods=['GET'])
@login_required
def api_followups_application(application_id):
    """Reviewer-side AI: top 3 follow-up questions for an application."""
    app = db.session.get(Application, application_id)
    if not _application_visible(app):
        return jsonify({'success': False, 'error': 'Not found'}), 404
    cache_key = f'reviewer_followups_app_{application_id}'
    cached = _dashboard_cache.get(cache_key)
    if cached is not None:
        return jsonify({'success': True, 'cached': True, **cached})
    result = ReviewerFollowupsService.for_application(application_id)
    if not result:
        return jsonify({'success': False, 'error': 'Could not compute follow-ups'}), 500
    _dashboard_cache.set(cache_key, result)
    return jsonify({'success': True, **result})


@report_bundle_bp.route('/reviewer/followups/report/<int:report_id>', methods=['GET'])
@login_required
def api_followups_report(report_id):
    rpt = db.session.get(Report, report_id)
    if not _report_visible(rpt):
        return jsonify({'success': False, 'error': 'Not found'}), 404
    cache_key = f'reviewer_followups_rpt_{report_id}'
    cached = _dashboard_cache.get(cache_key)
    if cached is not None:
        return jsonify({'success': True, 'cached': True, **cached})
    result = ReviewerFollowupsService.for_report(report_id)
    if not result:
        return jsonify({'success': False, 'error': 'Could not compute follow-ups'}), 500
    _dashboard_cache.set(cache_key, result)
    return jsonify({'success': True, **result})


# ----------------------------------------------------------------------
# Phase 14 — Reviewer follow-ups outbound dispatch.
# Donor/reviewer/admin can fire selected questions to the NGO via the
# notification dispatcher (in_app + email + sms/whatsapp per prefs).
# ----------------------------------------------------------------------

from app.utils.helpers import get_request_json


def _send_followups_to_org(*, org_id: int, subject: str, deep_link: str,
                           questions: list[str], related_kind: str,
                           related_id: int) -> dict:
    """Fan out the selected follow-up questions to every user in the
    target NGO org. One Notification per user per dispatch (not one per
    question) — easier on the user's inbox + matches how a human would
    forward this."""
    from app.models import User
    from app.services.notification_dispatcher import NotificationDispatcher

    users = User.query.filter_by(org_id=org_id, is_active=True).all()
    if not users:
        return {'sent': 0, 'recipients': 0, 'channels': [], 'notice': 'no_active_users'}

    cleaned = [q.strip() for q in questions if q and q.strip()][:6]
    if not cleaned:
        return {'sent': 0, 'recipients': 0, 'channels': [], 'notice': 'no_questions'}

    body_lines = [
        'A reviewer has questions about this submission:',
        '',
    ]
    for i, q in enumerate(cleaned, 1):
        body_lines.append(f'{i}. {q}')
    body_lines.append('')
    body_lines.append('Please reply via the platform.')
    body = '\n'.join(body_lines)

    sent_per_user = []
    for u in users:
        results = NotificationDispatcher.dispatch(
            user_id=u.id,
            category='reviews',
            title=subject,
            body=body,
            deep_link_url=deep_link,
            related_kind=related_kind,
            related_id=related_id,
        )
        sent_per_user.append({'user_id': u.id, 'channels': results})
    return {
        'sent': len(sent_per_user),
        'recipients': len(users),
        'questions': cleaned,
        'channel_results': sent_per_user,
    }


@report_bundle_bp.route('/reviewer/followups/application/<int:application_id>/send', methods=['POST'])
@login_required
def api_followups_application_send(application_id):
    """Body: { questions: [str, ...] }

    Donor/reviewer/admin fires the selected questions to the NGO behind
    the application. Records an audit-chain entry so the loop is
    visible from both sides."""
    app = db.session.get(Application, application_id)
    if not _application_visible(app):
        return jsonify({'success': False, 'error': 'Not found'}), 404
    if current_user.role not in ('donor', 'reviewer', 'admin'):
        return jsonify({'success': False, 'error': 'Insufficient permissions'}), 403

    data = get_request_json() or {}
    questions = data.get('questions') or []
    if not isinstance(questions, list):
        return jsonify({'success': False, 'error': 'questions must be a list'}), 400

    result = _send_followups_to_org(
        org_id=app.ngo_org_id,
        subject=f'Reviewer follow-ups on your application',
        deep_link=f'/applications/{application_id}',
        questions=questions,
        related_kind='application', related_id=application_id,
    )

    try:
        from app.models import AuditChainEntry
        AuditChainEntry.append(
            action='reviewer_followups.sent',
            actor_email=getattr(current_user, 'email', None),
            subject_kind='application', subject_id=application_id,
            details={
                'recipients': result.get('recipients'),
                'question_count': len(result.get('questions', [])),
                'sender_role': current_user.role,
            },
        )
    except Exception as e:
        logger.warning(f"Followups audit receipt failed: {e}")

    return jsonify({'success': True, **result})


@report_bundle_bp.route('/reviewer/followups/report/<int:report_id>/send', methods=['POST'])
@login_required
def api_followups_report_send(report_id):
    rpt = db.session.get(Report, report_id)
    if not _report_visible(rpt):
        return jsonify({'success': False, 'error': 'Not found'}), 404
    if current_user.role not in ('donor', 'reviewer', 'admin'):
        return jsonify({'success': False, 'error': 'Insufficient permissions'}), 403

    data = get_request_json() or {}
    questions = data.get('questions') or []
    if not isinstance(questions, list):
        return jsonify({'success': False, 'error': 'questions must be a list'}), 400

    result = _send_followups_to_org(
        org_id=rpt.submitted_by_org_id,
        subject='Reviewer follow-ups on your report',
        deep_link='/reports',
        questions=questions,
        related_kind='report', related_id=report_id,
    )

    try:
        from app.models import AuditChainEntry
        AuditChainEntry.append(
            action='reviewer_followups.sent',
            actor_email=getattr(current_user, 'email', None),
            subject_kind='report', subject_id=report_id,
            details={
                'recipients': result.get('recipients'),
                'question_count': len(result.get('questions', [])),
                'sender_role': current_user.role,
            },
        )
    except Exception as e:
        logger.warning(f"Followups audit receipt failed: {e}")

    return jsonify({'success': True, **result})
