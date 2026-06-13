"""
Phase 91 — Plain-language compliance explainer route.

Frontend calls this whenever it shows a compliance issue and wants the
5-field shape (what / why / example / how / who_can_help). One catalogue
key in → consistent NGO-readable copy out.

Routes:
  GET  /api/compliance/explain/<key>     — single explainer
  POST /api/compliance/explain           — bulk: body { keys: [str, ...] }
  GET  /api/compliance/explain-keys      — list every catalogued key
"""

import logging
from flask import Blueprint, jsonify, request
from flask_login import login_required

from app.utils.helpers import get_request_json
from app.services.compliance_explainer_service import (
    get_explainer, get_explainers, fallback_explainer, list_catalogued_keys,
)

logger = logging.getLogger('kuja')

compliance_explainer_bp = Blueprint(
    'compliance_explainer', __name__, url_prefix='/api/compliance',
)


@compliance_explainer_bp.route('/explain/<key>', methods=['GET'])
@login_required
def api_explain_single(key):
    """One-key lookup. Always returns a useful shape — falls back to a
    minimal 'ask for help' entry if the key isn't catalogued so the NGO
    never sees an empty card."""
    entry = get_explainer(key)
    if entry is None:
        return jsonify({
            'success': True, 'catalogued': False,
            **fallback_explainer(key),
        })
    return jsonify({'success': True, 'catalogued': True, **entry})


@compliance_explainer_bp.route('/explain', methods=['POST'])
@login_required
def api_explain_bulk():
    """Bulk lookup. Body: { keys: [...] }. Useful for the Trust Profile
    page that surfaces many flags at once — saves N round trips."""
    data = get_request_json() or {}
    keys = data.get('keys') or []
    if not isinstance(keys, list):
        return jsonify({'success': False, 'error': 'keys must be a list'}), 400
    if len(keys) > 50:
        return jsonify({'success': False, 'error': 'too many keys (max 50)'}), 400

    found = get_explainers(keys)
    missing = [k for k in keys if k not in found]
    result = {
        'success': True,
        'entries': found,
        'fallback_entries': {k: fallback_explainer(k) for k in missing},
    }
    return jsonify(result)


@compliance_explainer_bp.route('/explain-keys', methods=['GET'])
@login_required
def api_list_keys():
    """List every catalogued key. Useful for the admin/testing surfaces
    so the team can audit what's covered."""
    return jsonify({'success': True, 'keys': list_catalogued_keys()})
