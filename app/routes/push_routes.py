"""
Web push routes — Phase 13.34.

Frontend calls these to subscribe / unsubscribe a browser+device pair
to web push notifications. Backend then uses
app.services.web_push.send_to_user(uid, ...) to deliver pushes.
"""

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from app.extensions import db
from app.models import PushSubscription
from app.utils.helpers import get_request_json
from app.utils.api_errors import error_response
from app.utils.validation import (
    require_string, optional_string, ValidationError, to_error_response,
)
from app.utils.rate_policies import enforce as rate_enforce, RateLimitedError

push_bp = Blueprint('push', __name__, url_prefix='/api/push')


@push_bp.route('/config', methods=['GET'])
@login_required
def push_config():
    """Returns the VAPID public key the frontend service worker needs.

    Returns null when VAPID env isn't configured; the frontend then
    suppresses the subscribe affordance.
    """
    from app.services.web_push import get_vapid_public_key, is_configured
    return jsonify({
        'success': True,
        'configured': is_configured(),
        'public_key': get_vapid_public_key(),
    })


@push_bp.route('/subscribe', methods=['POST'])
@login_required
def push_subscribe():
    """Save a browser-issued PushSubscription.

    Body: { endpoint, keys: { p256dh, auth } }
    """
    try:
        rate_enforce('push_subscribe', current_user.id)
    except RateLimitedError as e:
        return error_response('rate.limited', 429, retry_after=e.retry_after)

    data = get_request_json() or {}
    try:
        endpoint = require_string(data, 'endpoint', max_len=2000)
    except ValidationError as e:
        return to_error_response(e)
    keys = data.get('keys') or {}
    if not isinstance(keys, dict):
        return error_response('validation.invalid_value', 400, field='keys')
    p256dh = (keys.get('p256dh') or '').strip()
    auth = (keys.get('auth') or '').strip()
    if not p256dh or not auth:
        return error_response('validation.missing_field', 400, field='keys.p256dh/keys.auth')

    user_agent = (request.headers.get('User-Agent') or '')[:400] or None

    # Idempotent: dedupe by endpoint, update keys+ua if it already exists.
    existing = PushSubscription.query.filter_by(endpoint=endpoint).first()
    if existing:
        existing.user_id = current_user.id
        existing.p256dh = p256dh
        existing.auth = auth
        existing.user_agent = user_agent
        existing.failure_count = 0
        db.session.commit()
        return jsonify({'success': True, 'subscription': existing.to_dict(), 'updated': True})

    sub = PushSubscription(
        user_id=current_user.id,
        endpoint=endpoint,
        p256dh=p256dh,
        auth=auth,
        user_agent=user_agent,
    )
    db.session.add(sub)
    db.session.commit()
    return jsonify({'success': True, 'subscription': sub.to_dict(), 'updated': False})


@push_bp.route('/unsubscribe', methods=['POST'])
@login_required
def push_unsubscribe():
    """Remove a subscription by endpoint."""
    data = get_request_json() or {}
    try:
        endpoint = require_string(data, 'endpoint', max_len=2000)
    except ValidationError as e:
        return to_error_response(e)
    sub = PushSubscription.query.filter_by(endpoint=endpoint).first()
    if sub and sub.user_id == current_user.id:
        db.session.delete(sub)
        db.session.commit()
    return jsonify({'success': True})


@push_bp.route('/test', methods=['POST'])
@login_required
def push_test():
    """Send a test push to all of the current user's subscriptions.

    Useful for verifying enrollment after a fresh subscribe.
    """
    from app.services.web_push import send_to_user
    result = send_to_user(
        current_user.id,
        title='Kuja test notification',
        body='If you can read this, push is configured correctly.',
    )
    return jsonify({'success': True, **result})
