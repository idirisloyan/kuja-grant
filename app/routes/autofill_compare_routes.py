"""
Application auto-fill + side-by-side compare routes — Phase 10.

Blueprint prefix: /api
Routes:
  POST /api/applications/compare            - donor: comparison matrix for 2-4 apps
  GET  /api/grants/<id>/autofill            - NGO: pre-fill drafts for the current org
"""

import logging

from flask import Blueprint, jsonify
from flask_login import login_required, current_user

from app.extensions import db
from app.models import Application, Grant
from app.services.application_compare_service import ApplicationCompareService
from app.services.application_autofill_service import ApplicationAutofillService
from app.utils.cache import _dashboard_cache
from app.utils.helpers import get_request_json
from app.utils.decorators import role_required

logger = logging.getLogger('kuja')

ai_compare_bp = Blueprint('ai_compare', __name__, url_prefix='/api')


@ai_compare_bp.route('/applications/compare', methods=['POST'])
@login_required
@role_required('donor', 'reviewer', 'admin')
def api_application_compare():
    """Body: { application_ids: [int, int, ...] }  (2-4 ids)

    All applications must be visible to the caller:
      - donor: each app's grant must be theirs
      - reviewer: each app must have a Review row for this user (lenient: any visibility OK)
      - admin: any
    """
    data = get_request_json() or {}
    raw_ids = data.get('application_ids') or []
    if not isinstance(raw_ids, list):
        return jsonify({'success': False, 'error': 'application_ids must be a list'}), 400
    try:
        application_ids = [int(x) for x in raw_ids]
    except (ValueError, TypeError):
        return jsonify({'success': False, 'error': 'application_ids must be integers'}), 400
    if len(application_ids) < 2:
        return jsonify({'success': False, 'error': 'at least 2 application_ids required'}), 400
    if len(application_ids) > 4:
        return jsonify({'success': False, 'error': 'at most 4 application_ids allowed'}), 400

    # Donor scope check
    if current_user.role == 'donor':
        apps = (
            Application.query.options(db.joinedload(Application.grant))
            .filter(Application.id.in_(application_ids)).all()
        )
        for a in apps:
            if not a.grant or a.grant.donor_org_id != current_user.org_id:
                return jsonify({'success': False, 'error': f'Insufficient permissions on app {a.id}'}), 403

    sorted_ids = sorted(application_ids)
    cache_key = f'app_compare_{"-".join(str(i) for i in sorted_ids)}'
    cached = _dashboard_cache.get(cache_key)
    if cached is not None:
        return jsonify({'success': True, 'cached': True, **cached})

    result = ApplicationCompareService.compare(application_ids)
    if not result:
        return jsonify({'success': False, 'error': 'Comparison could not be computed'}), 500
    _dashboard_cache.set(cache_key, result)
    return jsonify({'success': True, **result})


@ai_compare_bp.route('/grants/<int:grant_id>/autofill', methods=['GET'])
@login_required
@role_required('ngo', 'admin')
def api_application_autofill(grant_id):
    """Pre-fill a draft application for the current NGO against this grant.

    Returns the criteria-by-criteria drafted responses. Caller renders
    these in a preview state; the NGO accepts/edits before they become
    real responses in an Application row.
    """
    grant = db.session.get(Grant, grant_id)
    if not grant:
        return jsonify({'success': False, 'error': 'Grant not found'}), 404
    if grant.status not in ('open', 'draft'):
        return jsonify({'success': False, 'error': 'Grant is not open for applications'}), 400
    if not current_user.org_id:
        return jsonify({'success': False, 'error': 'You need an org to apply'}), 400

    cache_key = f'app_autofill_org{current_user.org_id}_grant{grant_id}'
    cached = _dashboard_cache.get(cache_key)
    if cached is not None:
        return jsonify({'success': True, 'cached': True, **cached})

    result = ApplicationAutofillService.for_grant(
        grant_id=grant_id, org_id=current_user.org_id,
    )
    if not result:
        return jsonify({'success': False, 'error': 'Auto-fill could not run'}), 500
    _dashboard_cache.set(cache_key, result)
    return jsonify({'success': True, **result})
