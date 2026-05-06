"""
Web push send — Phase 13.34.

Wraps pywebpush + VAPID. Idempotent + best-effort: never raises,
never blocks the caller. When VAPID env isn't configured, the send
is a no-op + logged so ops can see who attempted.
"""

import json
import logging
import os
from datetime import datetime, timezone

from app.extensions import db

logger = logging.getLogger('kuja')


def _vapid_config() -> dict | None:
    pub = os.environ.get('VAPID_PUBLIC_KEY')
    priv = os.environ.get('VAPID_PRIVATE_KEY')
    sub = os.environ.get('VAPID_SUBJECT')
    if not (pub and priv and sub):
        return None
    return {'public_key': pub, 'private_key': priv, 'subject': sub}


def get_vapid_public_key() -> str | None:
    """Surfaced to the frontend so the service worker can subscribe."""
    cfg = _vapid_config()
    return cfg['public_key'] if cfg else None


def is_configured() -> bool:
    return _vapid_config() is not None


def send_to_user(user_id: int, *, title: str, body: str, url: str | None = None) -> dict:
    """Send a push to all of the user's subscriptions.

    Returns {sent, failed, skipped} for telemetry.
    Never raises — failures are absorbed and logged.
    """
    cfg = _vapid_config()
    if not cfg:
        logger.info(f'web_push: VAPID not configured; skipping push to user_id={user_id}')
        return {'sent': 0, 'failed': 0, 'skipped': 1, 'reason': 'vapid_not_configured'}

    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        logger.warning('web_push: pywebpush not installed')
        return {'sent': 0, 'failed': 0, 'skipped': 1, 'reason': 'pywebpush_not_installed'}

    from app.models.push_subscription import PushSubscription
    subs = PushSubscription.query.filter_by(user_id=user_id).all()
    if not subs:
        return {'sent': 0, 'failed': 0, 'skipped': 0, 'reason': 'no_subscriptions'}

    payload = json.dumps({
        'title': title,
        'body': body,
        'url': url or '/',
    })
    sent, failed = 0, 0
    for s in subs:
        try:
            webpush(
                subscription_info={
                    'endpoint': s.endpoint,
                    'keys': {'p256dh': s.p256dh, 'auth': s.auth},
                },
                data=payload,
                vapid_private_key=cfg['private_key'],
                vapid_claims={'sub': cfg['subject']},
                ttl=43200,  # 12 hours
            )
            s.last_used_at = datetime.now(timezone.utc)
            s.failure_count = 0
            sent += 1
        except Exception as e:  # noqa: BLE001
            failed += 1
            s.failure_count = (s.failure_count or 0) + 1
            try:
                # 404 / 410 from the push service means the browser
                # unsubscribed. Drop after 3 consecutive failures.
                err_text = str(e).lower()
                is_gone = '404' in err_text or '410' in err_text or 'not found' in err_text
                if is_gone or s.failure_count >= 3:
                    db.session.delete(s)
                    logger.info(f'web_push: dropped stale subscription user_id={user_id}')
            except Exception:
                pass
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
    return {'sent': sent, 'failed': failed, 'skipped': 0}
