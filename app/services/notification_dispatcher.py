"""
NotificationDispatcher — Phase 6 (May 2026).

Single entry point that takes a notification (category + message) and
fan-outs to whichever channels the recipient user has opted into.

Channels handled:
  - in_app    → writes a Notification row (existing infrastructure)
  - email     → not yet wired (logged for now; will plug into a real
                provider when one is configured)
  - sms       → MessagingService.send(channel='sms', ...)
  - whatsapp  → MessagingService.send(channel='whatsapp', ...)
  - web_push  → not implemented in this push (existing PushSubscription
                is for VAPID push; out-of-scope to wire here)

Falls back silently when a channel isn't wired or the contact info is
missing — never raises. Returns a list of {channel, success, error?}
records so callers can log what happened.

Usage from a feature (e.g. pre-emption findings, deadline reminder):

    NotificationDispatcher.dispatch(
        user_id=user.id,
        category='compliance',
        title='High-severity pre-emption finding',
        body='Amani Q3 financial report likely to slip — see admin dashboard.',
        deep_link_url='/dashboard',
        related_kind='preemption_finding',
        related_id=None,
    )
"""

import logging

from app.extensions import db
from app.models import Notification, NotificationPreference
from app.services.messaging_service import MessagingService

logger = logging.getLogger('kuja')


class NotificationDispatcher:

    @classmethod
    def dispatch(
        cls,
        *,
        user_id: int,
        category: str,
        title: str,
        body: str,
        deep_link_url: str | None = None,
        related_kind: str | None = None,
        related_id: int | None = None,
    ) -> list[dict]:
        """Send a notification to one user across their preferred channels."""
        results: list[dict] = []
        channels = NotificationPreference.channels_for(
            user_id=user_id, category=category
        )

        # Compose the short outbound body for SMS / WhatsApp once.
        # In-app + email can use the full title+body without truncation.
        short_body = title
        if body and len(short_body) < 140:
            short_body = f"{title} — {body[:140]}".strip()
        if deep_link_url:
            short_body = f"{short_body} {deep_link_url}"

        for ch in channels:
            if ch == 'in_app':
                results.append(cls._emit_in_app(
                    user_id=user_id, title=title, body=body,
                    deep_link_url=deep_link_url,
                    related_kind=related_kind, related_id=related_id,
                    category=category,
                ))
            elif ch == 'email':
                results.append(cls._emit_email_stub(
                    user_id=user_id, title=title, body=body,
                ))
            elif ch == 'sms':
                results.append(cls._emit_external(
                    channel='sms', user_id=user_id, body=short_body,
                ))
            elif ch == 'whatsapp':
                results.append(cls._emit_external(
                    channel='whatsapp', user_id=user_id, body=short_body,
                ))
            elif ch == 'web_push':
                # Out of scope this push; surfaced cleanly so the caller can see it was skipped.
                results.append({'channel': 'web_push', 'success': False,
                                'skipped': True, 'reason': 'web_push_not_wired'})
            else:
                results.append({'channel': ch, 'success': False,
                                'skipped': True, 'reason': 'unknown_channel'})

        return results

    # Maps our category vocabulary to the existing Notification.type vocab.
    _CATEGORY_TO_NOTIF_TYPE = {
        'deadlines':  'deadline_reminder',
        'reviews':    'status_change',
        'compliance': 'screening_alert',
        'decisions':  'status_change',
    }

    @classmethod
    def _emit_in_app(
        cls, *, user_id: int, title: str, body: str,
        deep_link_url: str | None,
        related_kind: str | None, related_id: int | None,
        category: str = 'compliance',
    ) -> dict:
        try:
            n = Notification(
                user_id=user_id,
                type=cls._CATEGORY_TO_NOTIF_TYPE.get(category, 'status_change'),
                title=title[:200],
                message=(body or '')[:2000],
                link=deep_link_url,
            )
            db.session.add(n)
            db.session.commit()
            return {'channel': 'in_app', 'success': True, 'notification_id': n.id}
        except Exception as e:
            try: db.session.rollback()
            except Exception: pass
            logger.warning(f"NotificationDispatcher in_app emit failed: {e}")
            return {'channel': 'in_app', 'success': False, 'error': str(e)[:120]}

    @classmethod
    def _emit_email_stub(cls, *, user_id: int, title: str, body: str) -> dict:
        """Email isn't wired in this push — log for future plug-in."""
        logger.info(
            f"NOTIF_EMAIL_STUB user={user_id} title={title[:80]!r} "
            f"body_len={len(body or '')}"
        )
        return {'channel': 'email', 'success': True, 'stubbed': True}

    @classmethod
    def _emit_external(cls, *, channel: str, user_id: int, body: str) -> dict:
        """Send via Twilio SMS / WhatsApp, or fall back to log if unconfigured."""
        addr = NotificationPreference.contact_for(user_id=user_id, channel=channel)
        if not addr:
            return {'channel': channel, 'success': False,
                    'skipped': True, 'reason': 'no_contact'}
        result = MessagingService.send(channel=channel, to=addr, body=body)
        return {
            'channel': channel,
            'success': result.get('success', False),
            'fallback_used': result.get('fallback_used', False),
            'sid': result.get('sid'),
        }
