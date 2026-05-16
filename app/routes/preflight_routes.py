"""
Pre-flight routes — Phase 7 (donor-perspective pre-flight).

Blueprint prefix: /api/preflight
Routes:
  GET /api/preflight/application/<id>   - AI reviewer-style preview of a draft application
  GET /api/preflight/report/<id>        - AI reviewer-style preview of a draft report

Per-resource visibility check + 10-min cache so iterating on a draft
doesn't burn AI tokens on every keystroke.
"""

import logging

from flask import Blueprint, jsonify
from flask_login import login_required, current_user

from app.extensions import db
from app.models import Application, Report
from app.services.preflight_service import PreflightService
from app.utils.cache import _dashboard_cache

logger = logging.getLogger('kuja')

preflight_bp = Blueprint('preflight', __name__, url_prefix='/api/preflight')


def _cached(cache_key: str, builder):
    cached = _dashboard_cache.get(cache_key)
    if cached is not None:
        return cached
    out = builder()
    if out is not None:
        _dashboard_cache.set(cache_key, out)
    return out


@preflight_bp.route('/application/<int:application_id>', methods=['GET'])
@login_required
def api_preflight_application(application_id):
    """Pre-flight a draft application. Caller must own the application,
    be the grant's donor, or be admin."""
    app = db.session.get(Application, application_id)
    if not app:
        return jsonify({'success': False, 'error': 'Application not found'}), 404

    # Visibility
    role = current_user.role
    if role == 'ngo' and app.ngo_org_id != current_user.org_id:
        return jsonify({'success': False, 'error': 'Insufficient permissions'}), 403
    if role == 'donor':
        if not app.grant or app.grant.donor_org_id != current_user.org_id:
            return jsonify({'success': False, 'error': 'Insufficient permissions'}), 403

    result = _cached(
        f'preflight_app_{application_id}',
        lambda: PreflightService.for_application(application_id),
    )
    if not result:
        return jsonify({'success': False, 'error': 'Could not compute preflight'}), 500
    return jsonify({'success': True, **result})


@preflight_bp.route('/report/<int:report_id>', methods=['GET'])
@login_required
def api_preflight_report(report_id):
    """Pre-flight a draft report."""
    rpt = db.session.get(Report, report_id)
    if not rpt:
        return jsonify({'success': False, 'error': 'Report not found'}), 404

    role = current_user.role
    if role == 'ngo' and rpt.submitted_by_org_id != current_user.org_id:
        return jsonify({'success': False, 'error': 'Insufficient permissions'}), 403
    if role == 'donor':
        if not rpt.grant or rpt.grant.donor_org_id != current_user.org_id:
            return jsonify({'success': False, 'error': 'Insufficient permissions'}), 403

    result = _cached(
        f'preflight_rpt_{report_id}',
        lambda: PreflightService.for_report(report_id),
    )
    if not result:
        return jsonify({'success': False, 'error': 'Could not compute preflight'}), 500
    return jsonify({'success': True, **result})
