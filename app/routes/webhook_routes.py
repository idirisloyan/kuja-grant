"""
Phase 143 — Outbound webhook registration + dispatch.

Endpoints:
  GET    /api/webhooks              list the caller's org webhooks
  POST   /api/webhooks              register a new webhook (returns secret once)
  DELETE /api/webhooks/<id>         delete (scoped to caller's org)
  POST   /api/webhooks/<id>/test    fire a synthetic ping payload
  GET    /api/webhooks/events       list dispatchable event names

Dispatch happens via `dispatch_event(org_id, event_name, payload_dict)`
which is exposed for the rest of the code to import + call at the
relevant transition points. Delivery is synchronous + best-effort:
the caller's request continues even if the receiver is down.

Security:
  * Each webhook has a 32-byte URL-safe secret. Outbound POST includes
    `X-Kuja-Signature: sha256=<hex>` where the hex is HMAC-SHA256 of
    the raw JSON body. Receivers should verify before trusting.
  * Only org admins (any user in org with role admin/donor/ngo +
    `is_org_admin=True` if that flag exists, else just same org) can
    manage webhooks.
"""

from __future__ import annotations
import hmac
import hashlib
import json
import logging
import time
from typing import Any

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from app.extensions import db
from app.models import Webhook
from app.utils.helpers import get_request_json
from app.utils.api_errors import error_response

logger = logging.getLogger('kuja')

webhook_bp = Blueprint('webhook', __name__, url_prefix='/api/webhooks')


DISPATCHABLE_EVENTS = (
    'application.submitted',
    'application.awarded',
    'application.rejected',
    'report.submitted',
    'grant.published',
    'declaration.activated',
)


def _ensure_table():
    """Create the webhooks table on first use. Bootstrap pattern matches
    the rest of the codebase (db.create_all in __init__ handles it for
    SQLite; this is a safety net for prod PG cold starts)."""
    try:
        Webhook.__table__.create(bind=db.engine, checkfirst=True)
    except Exception as e:
        logger.debug('webhook table create skipped: %s', e)


@webhook_bp.route('/events', methods=['GET'])
@login_required
def api_list_events():
    """Public list of event names the system can dispatch."""
    return jsonify({'success': True, 'events': list(DISPATCHABLE_EVENTS)})


@webhook_bp.route('', methods=['GET'])
@webhook_bp.route('/', methods=['GET'])
@login_required
def api_list_webhooks():
    """List webhooks for the caller's org."""
    _ensure_table()
    if not getattr(current_user, 'org_id', None):
        return error_response('auth.access_denied', 403)
    rows = (
        Webhook.query
        .filter_by(org_id=current_user.org_id)
        .order_by(Webhook.created_at.desc())
        .all()
    )
    return jsonify({
        'success': True,
        'webhooks': [r.to_dict(include_secret=False) for r in rows],
    })


@webhook_bp.route('', methods=['POST'])
@webhook_bp.route('/', methods=['POST'])
@login_required
def api_create_webhook():
    """Register a new webhook. Returns the secret ONCE; it's never
    surfaced again (similar to most webhook providers)."""
    _ensure_table()
    if not getattr(current_user, 'org_id', None):
        return error_response('auth.access_denied', 403)
    data = get_request_json() or {}
    url = (data.get('url') or '').strip()
    if not url or not (url.startswith('http://') or url.startswith('https://')):
        return error_response('validation.invalid_value', 400, field='url',
                              detail='url must start with http:// or https://')
    events = data.get('events') or []
    if not isinstance(events, list) or not events:
        return error_response('validation.invalid_value', 400, field='events',
                              detail='events must be a non-empty list')
    bad = [e for e in events if e not in DISPATCHABLE_EVENTS]
    if bad:
        return error_response('validation.invalid_value', 400, field='events',
                              detail=f'unknown event(s): {", ".join(bad)}')
    description = (data.get('description') or '').strip() or None

    hook = Webhook(
        org_id=current_user.org_id,
        url=url[:500],
        secret=Webhook.generate_secret(),
        events=json.dumps(events),
        active=True,
        description=description[:240] if description else None,
        created_by_user_id=current_user.id,
    )
    db.session.add(hook)
    db.session.commit()
    logger.info(
        'webhook registered: org=%s url=%s events=%s',
        current_user.org_id, url, events,
    )
    return jsonify({'success': True, 'webhook': hook.to_dict(include_secret=True)})


@webhook_bp.route('/<int:hook_id>', methods=['DELETE'])
@login_required
def api_delete_webhook(hook_id: int):
    _ensure_table()
    hook = Webhook.query.get_or_404(hook_id)
    if hook.org_id != getattr(current_user, 'org_id', None):
        return error_response('auth.access_denied', 403)
    db.session.delete(hook)
    db.session.commit()
    return jsonify({'success': True})


@webhook_bp.route('/<int:hook_id>/test', methods=['POST'])
@login_required
def api_test_webhook(hook_id: int):
    """Fire a synthetic ping payload to validate the receiver."""
    _ensure_table()
    hook = Webhook.query.get_or_404(hook_id)
    if hook.org_id != getattr(current_user, 'org_id', None):
        return error_response('auth.access_denied', 403)
    result = _deliver(hook, 'kuja.test', {
        'message': 'This is a synthetic test payload from Kuja',
        'org_id': hook.org_id,
        'fired_at': int(time.time()),
    })
    return jsonify({'success': True, 'result': result})


# ---------------------------------------------------------------------------
# Dispatcher — imported by the rest of the codebase at transition sites.
# ---------------------------------------------------------------------------

def dispatch_event(org_id: int | None, event_name: str, payload: dict) -> int:
    """Fan out an event to every active webhook for `org_id`. Returns
    the number of dispatches attempted. Best-effort: errors are
    swallowed + recorded on the webhook row.
    """
    if not org_id or event_name not in DISPATCHABLE_EVENTS:
        return 0
    _ensure_table()
    try:
        hooks = (
            Webhook.query
            .filter_by(org_id=org_id, active=True)
            .all()
        )
    except Exception as e:
        logger.debug('webhook dispatch lookup failed: %s', e)
        return 0
    delivered = 0
    for h in hooks:
        try:
            events_list = json.loads(h.events) if h.events else []
        except Exception:
            events_list = []
        if event_name not in events_list:
            continue
        try:
            _deliver(h, event_name, payload)
            delivered += 1
        except Exception as e:
            logger.warning('webhook delivery error hook=%s: %s', h.id, e)
    return delivered


def _deliver(hook: Webhook, event_name: str, payload: dict) -> dict:
    """Synchronous POST. Updates the hook's delivery stats. Returns
    a dict with status + duration_ms + any error so the caller can
    surface it (for the /test endpoint)."""
    import requests  # local — keeps import cost off cold start
    body = json.dumps({
        'event': event_name,
        'org_id': hook.org_id,
        'fired_at': int(time.time()),
        'payload': payload,
    }, separators=(',', ':'))
    signature = hmac.new(
        hook.secret.encode('utf-8'),
        body.encode('utf-8'),
        hashlib.sha256,
    ).hexdigest()
    headers = {
        'Content-Type': 'application/json',
        'X-Kuja-Event': event_name,
        'X-Kuja-Signature': f'sha256={signature}',
        'User-Agent': 'KujaWebhook/1.0',
    }
    started = time.time()
    status = None
    err = None
    try:
        r = requests.post(hook.url, data=body, headers=headers, timeout=8)
        status = r.status_code
    except Exception as e:
        err = type(e).__name__ + ': ' + str(e)[:400]
    duration_ms = int((time.time() - started) * 1000)
    from datetime import datetime, timezone as _tz
    try:
        hook.last_delivery_at = datetime.now(_tz.utc)
        hook.last_delivery_status = status
        hook.last_delivery_error = err[:500] if err else None
        hook.delivery_count = (hook.delivery_count or 0) + 1
        if err or (status is not None and status >= 400):
            hook.failure_count = (hook.failure_count or 0) + 1
        db.session.commit()
    except Exception:
        try:
            db.session.rollback()
        except Exception:
            pass
    return {
        'status': status,
        'duration_ms': duration_ms,
        'error': err,
    }
