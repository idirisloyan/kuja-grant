"""
Messaging routes — Phase 4 (Global South affordances).

Blueprint prefix: /api/messaging
Routes:
  GET  /api/messaging/channels         - status of all channels (admin)
  POST /api/messaging/test             - send a test message (admin)
"""

import logging

from flask import Blueprint, jsonify
from flask_login import login_required, current_user

from app.services.messaging_service import MessagingService
from app.utils.helpers import get_request_json
from app.utils.decorators import role_required

logger = logging.getLogger('kuja')

messaging_bp = Blueprint('messaging', __name__, url_prefix='/api/messaging')


@messaging_bp.route('/channels', methods=['GET'])
@login_required
def api_channel_status():
    """Return which delivery channels are wired."""
    return jsonify({
        'success': True,
        'channels': MessagingService.channel_status(),
    })


@messaging_bp.route('/test', methods=['POST'])
@login_required
@role_required('admin')
def api_test_send():
    """Send a test message. Admin only.

    Body: {channel: 'sms'|'whatsapp'|'log', to: '+1...', body: '...'}
    """
    data = get_request_json()
    channel = (data.get('channel') or 'log').strip().lower()
    to = (data.get('to') or '').strip()
    body = (data.get('body') or 'Kuja messaging test.').strip()

    if channel not in ('sms', 'whatsapp', 'log'):
        return jsonify({'success': False, 'error': 'channel must be sms|whatsapp|log'}), 400

    result = MessagingService.send(channel=channel, to=to, body=body)
    return jsonify({'success': result.get('success', False), 'result': result})
