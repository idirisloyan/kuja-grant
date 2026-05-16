"""
Notification digest routes — Phase 9.

Blueprint prefix: /api/notification-digest
Routes:
  POST /api/notification-digest/me/run    - user-triggered: fire your own digest now (for testing)
  POST /api/notification-digest/cron       - admin/cron: run for all eligible users
"""

import logging
import os

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from app.services.notification_digest_service import NotificationDigestService
from app.utils.decorators import role_required

logger = logging.getLogger('kuja')

digest_bp = Blueprint('notif_digest', __name__, url_prefix='/api/notification-digest')


@digest_bp.route('/me/run', methods=['POST'])
@login_required
def api_run_my_digest():
    """User-triggered: fire your own digest right now (great for testing the wiring)."""
    from app.utils.helpers import get_request_json
    data = get_request_json() or {}
    frequency = (data.get('frequency') or 'daily').strip().lower()
    force = bool(data.get('force', True))   # default to force on manual trigger
    result = NotificationDigestService.run_for_user(
        current_user.id, frequency=frequency, force=force,
    )
    return jsonify({'success': True, 'result': result})


@digest_bp.route('/cron', methods=['POST'])
def api_cron_run():
    """Cron entry. Authentication is via CRON_SECRET header (matches the
    existing rescreening cron pattern) — works with either an
    authenticated admin OR the cron secret."""
    auth_header = request.headers.get('Authorization', '')
    cron_secret = os.getenv('CRON_SECRET') or ''
    is_cron = cron_secret and auth_header == f'Bearer {cron_secret}'

    if not is_cron:
        # Allow admin-only manual trigger as a fallback
        if not current_user.is_authenticated or current_user.role != 'admin':
            return jsonify({'success': False, 'error': 'forbidden'}), 403

    result = NotificationDigestService.run_for_all_eligible()
    return jsonify({'success': True, 'result': result})
