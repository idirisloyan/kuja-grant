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

from flask import Blueprint, jsonify
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
