"""
Compliance pre-emption routes — Phase 3 (category-defining AI).

Blueprint prefix: /api
Routes:
  GET /api/preemption/ngo/<org_id>     - NGO view: my active grants at risk
  GET /api/preemption/donor/<org_id>   - Donor view: grantees in my portfolio at risk
  GET /api/preemption/me               - Resolves to the right scope for the current user
"""

import logging

from flask import Blueprint, jsonify
from flask_login import login_required, current_user

from app.services.compliance_preemption_service import CompliancePreemptionService
from app.utils.cache import _dashboard_cache

logger = logging.getLogger('kuja')

preemption_bp = Blueprint('preemption', __name__, url_prefix='/api/preemption')


def _cached(cache_key: str, builder):
    cached = _dashboard_cache.get(cache_key)
    if cached is not None:
        return cached
    out = builder()
    _dashboard_cache.set(cache_key, out)
    return out


@preemption_bp.route('/ngo/<int:org_id>', methods=['GET'])
@login_required
def api_preemption_ngo(org_id):
    """NGO scope. Donor + admin can also call this to inspect a grantee."""
    if current_user.role == 'ngo' and current_user.org_id != org_id:
        return jsonify({'success': False, 'error': 'Insufficient permissions'}), 403
    result = _cached(f'preemption_ngo_{org_id}',
                     lambda: CompliancePreemptionService.for_ngo(org_id))
    return jsonify({'success': True, **result})


@preemption_bp.route('/donor/<int:org_id>', methods=['GET'])
@login_required
def api_preemption_donor(org_id):
    """Donor scope. Only the donor org's users or admin."""
    if current_user.role == 'donor' and current_user.org_id != org_id:
        return jsonify({'success': False, 'error': 'Insufficient permissions'}), 403
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'success': False, 'error': 'Insufficient permissions'}), 403
    result = _cached(f'preemption_donor_{org_id}',
                     lambda: CompliancePreemptionService.for_donor(org_id))
    return jsonify({'success': True, **result})


@preemption_bp.route('/me', methods=['GET'])
@login_required
def api_preemption_me():
    """Convenience: resolve to the right scope for the caller."""
    if current_user.role == 'ngo' and current_user.org_id:
        result = _cached(f'preemption_ngo_{current_user.org_id}',
                         lambda: CompliancePreemptionService.for_ngo(current_user.org_id))
    elif current_user.role == 'donor' and current_user.org_id:
        result = _cached(f'preemption_donor_{current_user.org_id}',
                         lambda: CompliancePreemptionService.for_donor(current_user.org_id))
    elif current_user.role == 'admin':
        # Admin has no scope; return empty with note
        from datetime import datetime, timezone
        result = {
            'scope': 'admin',
            'computed_at': datetime.now(timezone.utc).isoformat(),
            'findings': [],
            'summary': 'Admin view: pick a specific org via /preemption/ngo/<id> or /preemption/donor/<id>.',
            'source': 'no_input',
        }
    else:
        return jsonify({'success': False, 'error': 'No scope for this user'}), 400

    return jsonify({'success': True, **result})
