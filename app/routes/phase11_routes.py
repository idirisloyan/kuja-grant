"""
Phase 11 routes — grant agreement unpack + cross-grant patterns.

Blueprint prefix: /api
Routes:
  POST /api/grants/<id>/unpack-agreement   - unpack signed agreement PDF
  GET  /api/patterns/me                    - cross-grant patterns for caller
  GET  /api/patterns/ngo/<org_id>          - NGO scope (admin override)
  GET  /api/patterns/donor/<org_id>        - donor scope (admin override)
"""

import logging

from flask import Blueprint, jsonify
from flask_login import login_required, current_user

from app.extensions import db
from app.models import Grant
from app.services.grant_agreement_unpack_service import GrantAgreementUnpackService
from app.services.cross_grant_patterns_service import CrossGrantPatternsService
from app.utils.cache import _dashboard_cache
from app.utils.helpers import get_request_json
from app.utils.decorators import role_required

logger = logging.getLogger('kuja')

phase11_bp = Blueprint('phase11', __name__, url_prefix='/api')


@phase11_bp.route('/grants/<int:grant_id>/unpack-agreement', methods=['POST'])
@login_required
def api_unpack_agreement(grant_id):
    """Run grant-agreement smart unpack. Returns the structured spec.

    Body: { document_id?: int }  (optional; if omitted, falls back to
                                   the grant's reporting_requirements)

    Visibility:
      - donor: grant must be theirs
      - ngo:   org must have an awarded application on this grant
      - admin: anyone
    """
    grant = db.session.get(Grant, grant_id)
    if not grant:
        return jsonify({'success': False, 'error': 'Grant not found'}), 404

    role = current_user.role
    org_id = current_user.org_id
    if role == 'donor':
        if grant.donor_org_id != org_id:
            return jsonify({'success': False, 'error': 'Insufficient permissions'}), 403
    elif role == 'ngo':
        from app.models import Application
        has_app = Application.query.filter_by(
            grant_id=grant.id, ngo_org_id=org_id,
        ).first() is not None
        if not has_app:
            return jsonify({'success': False, 'error': 'No application on this grant'}), 403
    elif role not in ('admin', 'reviewer'):
        return jsonify({'success': False, 'error': 'Insufficient permissions'}), 403

    data = get_request_json() or {}
    document_id = data.get('document_id')

    cache_key = f'grant_unpack_{grant_id}_{document_id or "none"}'
    cached = _dashboard_cache.get(cache_key)
    if cached is not None:
        return jsonify({'success': True, 'cached': True, **cached})

    result = GrantAgreementUnpackService.unpack(grant_id=grant_id, document_id=document_id)
    if not result:
        return jsonify({'success': False, 'error': 'Unpack could not run'}), 500
    _dashboard_cache.set(cache_key, result)
    return jsonify({'success': True, **result})


@phase11_bp.route('/patterns/me', methods=['GET'])
@login_required
def api_patterns_me():
    """Resolve to NGO or donor scope based on caller."""
    if current_user.role == 'ngo' and current_user.org_id:
        return _cached_patterns(f'patterns_ngo_{current_user.org_id}',
                                lambda: CrossGrantPatternsService.for_ngo(current_user.org_id))
    if current_user.role == 'donor' and current_user.org_id:
        return _cached_patterns(f'patterns_donor_{current_user.org_id}',
                                lambda: CrossGrantPatternsService.for_donor(current_user.org_id))
    if current_user.role == 'admin':
        # Admin /me returns empty — they should pick a specific scope
        from datetime import datetime, timezone
        return jsonify({'success': True,
                        'scope': 'admin',
                        'source': 'no_data',
                        'patterns': [], 'top_3_actions': [],
                        'summary': 'Admin view: hit /patterns/ngo/<id> or /patterns/donor/<id> for a specific org.',
                        'computed_at': datetime.now(timezone.utc).isoformat()})
    return jsonify({'success': False, 'error': 'No scope for this user'}), 400


@phase11_bp.route('/patterns/ngo/<int:org_id>', methods=['GET'])
@login_required
def api_patterns_ngo(org_id):
    if current_user.role == 'ngo' and current_user.org_id != org_id:
        return jsonify({'success': False, 'error': 'Insufficient permissions'}), 403
    if current_user.role not in ('ngo', 'admin'):
        return jsonify({'success': False, 'error': 'Insufficient permissions'}), 403
    return _cached_patterns(f'patterns_ngo_{org_id}',
                            lambda: CrossGrantPatternsService.for_ngo(org_id))


@phase11_bp.route('/patterns/donor/<int:org_id>', methods=['GET'])
@login_required
def api_patterns_donor(org_id):
    if current_user.role == 'donor' and current_user.org_id != org_id:
        return jsonify({'success': False, 'error': 'Insufficient permissions'}), 403
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'success': False, 'error': 'Insufficient permissions'}), 403
    return _cached_patterns(f'patterns_donor_{org_id}',
                            lambda: CrossGrantPatternsService.for_donor(org_id))


def _cached_patterns(cache_key: str, builder):
    cached = _dashboard_cache.get(cache_key)
    if cached is not None:
        return jsonify({'success': True, 'cached': True, **cached})
    result = builder()
    if result is None:
        return jsonify({'success': False, 'error': 'Could not compute patterns'}), 500
    _dashboard_cache.set(cache_key, result)
    return jsonify({'success': True, **result})
