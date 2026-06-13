"""
Phase 93 — AI service health endpoint.

Lets the frontend know whether Claude is available BEFORE the user
records a 5-minute voice memo or sets up a photo upload. Cheap probe
(no token cost). Cached briefly so we don't ping Anthropic on every
page load.
"""

import logging
import time
from flask import Blueprint, jsonify
from flask_login import login_required

from app.services.ai_service import HAS_ANTHROPIC, ANTHROPIC_API_KEY

logger = logging.getLogger('kuja')

ai_health_bp = Blueprint('ai_health', __name__, url_prefix='/api/ai')

# Simple in-process cache so repeated probes within 60s share the result.
_LAST_PROBE: dict = {'ts': 0.0, 'status': None}
CACHE_SECONDS = 60


# Note: copilot blueprint already owns /api/ai/health (admin 24h rollup),
# so this user-facing service probe goes under a distinct path.
@ai_health_bp.route('/service-status', methods=['GET'])
@login_required
def api_ai_health():
    """Return AI service status. Cheap probe; cached 60s.

    Status:
      'ok'         — API key configured and (likely) reachable
      'no_key'     — API key missing on Railway; no AI features will work
      'no_sdk'     — anthropic SDK not importable (build issue)
    """
    now = time.time()
    if _LAST_PROBE['status'] and (now - _LAST_PROBE['ts']) < CACHE_SECONDS:
        return jsonify({
            'success': True,
            'status': _LAST_PROBE['status'],
            'cached': True,
            'ttl_seconds': max(0, int(CACHE_SECONDS - (now - _LAST_PROBE['ts']))),
        })

    if not HAS_ANTHROPIC:
        status = 'no_sdk'
    elif not ANTHROPIC_API_KEY:
        status = 'no_key'
    else:
        status = 'ok'

    _LAST_PROBE['ts'] = now
    _LAST_PROBE['status'] = status

    return jsonify({
        'success': True, 'status': status, 'cached': False,
    })
