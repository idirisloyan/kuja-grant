"""
MessagingService — Phase 4 (Global South affordances)
======================================================

Multi-channel outbound messaging adapter. NGO program staff in the Global
South live on WhatsApp; SMS works on every phone in every country. The
existing in-app + web-push notification stack covers desktop, but a
real grant deadline reminder needs to arrive on the user's actual phone.

This module is the adapter layer + env gates. Wiring to specific notification
emit points (deadline reminders, donor decisions) is left to follow-up so
we don't lock the team into a delivery channel pattern before seeing
which channels they actually want first.

Supported channels (env-gated):

  - sms:        Twilio SMS API (TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN
                + TWILIO_FROM_NUMBER)
  - whatsapp:   Twilio WhatsApp Business API (same creds + TWILIO_WA_FROM)
  - log:        no-op fallback that just writes the message to the kuja
                logger — used in dev + when an env var is missing.

Methods always return a structured dict so callers can inspect what was
attempted. Never raises — failures degrade to log-only.

Why an adapter and not the Twilio SDK directly: keeps the call site
clean ("send_deadline_reminder(user, deadline)"); makes the channel
config a single source of truth; future-proofs swapping in a different
SMS provider (Africa's Talking, Vonage, etc.) without touching call sites.
"""

import logging
import os
from datetime import datetime, timezone

import requests

logger = logging.getLogger('kuja')


class MessagingService:

    # Channel availability is computed at call time so flipping the env
    # var doesn't require a restart.

    @classmethod
    def is_channel_enabled(cls, channel: str) -> bool:
        ch = channel.lower()
        if ch == 'log':
            return True
        if ch == 'sms':
            return bool(
                os.getenv('TWILIO_ACCOUNT_SID')
                and os.getenv('TWILIO_AUTH_TOKEN')
                and os.getenv('TWILIO_FROM_NUMBER')
            )
        if ch == 'whatsapp':
            return bool(
                os.getenv('TWILIO_ACCOUNT_SID')
                and os.getenv('TWILIO_AUTH_TOKEN')
                and os.getenv('TWILIO_WA_FROM')
            )
        return False

    @classmethod
    def channel_status(cls) -> dict:
        """Used by /admin/system-health to show what's wired."""
        return {
            'sms': cls.is_channel_enabled('sms'),
            'whatsapp': cls.is_channel_enabled('whatsapp'),
            'log_fallback': True,
        }

    @classmethod
    def send(
        cls,
        *,
        channel: str,
        to: str,
        body: str,
        from_override: str | None = None,
    ) -> dict:
        """Dispatch a single outbound message.

        Returns:
            {
              'success': bool,
              'channel': 'sms'|'whatsapp'|'log',
              'attempted_channel': original requested channel,
              'fallback_used': True if we degraded to log,
              'sid': provider message id (if applicable),
              'error': str (if failed),
              'sent_at': iso,
            }
        """
        attempted = channel.lower()
        if not to or not body:
            return {
                'success': False, 'channel': attempted, 'attempted_channel': attempted,
                'fallback_used': False, 'error': 'to and body are required',
                'sent_at': datetime.now(timezone.utc).isoformat(),
            }

        if attempted == 'log' or not cls.is_channel_enabled(attempted):
            return cls._send_log(attempted=attempted, to=to, body=body)

        if attempted == 'sms':
            return cls._send_twilio(
                to=to, body=body,
                from_number=from_override or os.getenv('TWILIO_FROM_NUMBER', ''),
                channel='sms',
            )
        if attempted == 'whatsapp':
            wa_from = from_override or os.getenv('TWILIO_WA_FROM', '')
            # Twilio requires the "whatsapp:" prefix on both ends
            to_addr = to if to.startswith('whatsapp:') else f'whatsapp:{to}'
            from_addr = wa_from if wa_from.startswith('whatsapp:') else f'whatsapp:{wa_from}'
            return cls._send_twilio(
                to=to_addr, body=body, from_number=from_addr, channel='whatsapp',
            )

        return cls._send_log(attempted=attempted, to=to, body=body)

    # ------------------------------------------------------------------
    # Channel implementations
    # ------------------------------------------------------------------

    @classmethod
    def _send_log(cls, *, attempted: str, to: str, body: str) -> dict:
        """No-op channel that just logs. Always succeeds; useful in dev
        and as a graceful degradation when a real channel isn't wired."""
        logger.info(
            f"MESSAGING_LOG attempted_channel={attempted} to={to[:6]}*** "
            f"body_len={len(body)} body_preview={body[:80]!r}"
        )
        return {
            'success': True,
            'channel': 'log',
            'attempted_channel': attempted,
            'fallback_used': attempted != 'log',
            'sid': None,
            'sent_at': datetime.now(timezone.utc).isoformat(),
        }

    @classmethod
    def _send_twilio(
        cls, *, to: str, body: str, from_number: str, channel: str,
    ) -> dict:
        sid = os.getenv('TWILIO_ACCOUNT_SID', '')
        token = os.getenv('TWILIO_AUTH_TOKEN', '')
        if not sid or not token or not from_number:
            return cls._send_log(attempted=channel, to=to, body=body)

        url = f'https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json'
        try:
            resp = requests.post(
                url,
                auth=(sid, token),
                data={'To': to, 'From': from_number, 'Body': body[:1600]},
                timeout=15,
            )
            if 200 <= resp.status_code < 300:
                msg_sid = resp.json().get('sid')
                logger.info(
                    f"MESSAGING_SENT channel={channel} to={to[:6]}*** sid={msg_sid}"
                )
                return {
                    'success': True,
                    'channel': channel,
                    'attempted_channel': channel,
                    'fallback_used': False,
                    'sid': msg_sid,
                    'sent_at': datetime.now(timezone.utc).isoformat(),
                }
            logger.warning(
                f"MESSAGING_TWILIO_HTTP {resp.status_code} for {channel}: "
                f"{resp.text[:200]}"
            )
            return {
                'success': False,
                'channel': channel,
                'attempted_channel': channel,
                'fallback_used': False,
                'error': f'HTTP {resp.status_code}',
                'sent_at': datetime.now(timezone.utc).isoformat(),
            }
        except Exception as e:
            logger.warning(f"MESSAGING_TWILIO_ERROR ({channel}): {e}")
            return {
                'success': False,
                'channel': channel,
                'attempted_channel': channel,
                'fallback_used': False,
                'error': str(e)[:200],
                'sent_at': datetime.now(timezone.utc).isoformat(),
            }

    # ------------------------------------------------------------------
    # Convenience composers (used by future call sites)
    # ------------------------------------------------------------------

    @classmethod
    def compose_deadline_reminder(
        cls, *, deliverable_title: str, due_in_days: int, deep_link_url: str,
    ) -> str:
        """Short reminder body suitable for SMS / WhatsApp."""
        if due_in_days < 0:
            phrase = f'is {-due_in_days} days overdue'
        elif due_in_days == 0:
            phrase = 'is due today'
        elif due_in_days == 1:
            phrase = 'is due tomorrow'
        else:
            phrase = f'is due in {due_in_days} days'
        return (
            f"[Kuja] '{deliverable_title}' {phrase}. "
            f"Open: {deep_link_url}"
        )
