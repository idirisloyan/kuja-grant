"""
EmailService — Phase 17A (May 2026).

Adapter that sends actual emails via the first available transport.
Replaces the Phase 6 _emit_email_stub() that only logged.

Transport selection priority (first hit wins):
  1. SendGrid Web API (SENDGRID_API_KEY env)
  2. SMTP (SMTP_HOST/SMTP_USER/SMTP_PASS/SMTP_PORT env, optional SMTP_TLS=1)
  3. Log-only fallback (no env config) — preserves existing dev behavior

Discipline:
  - Always returns a structured result dict — never raises to caller
  - Honest about which transport fired (or "stubbed" if none)
  - Recipient resolution via User.email; missing email = skipped, not failed
  - Subject + plain-text body; HTML rendering is a future enhancement
  - From address pulled from MAIL_FROM env (defaults to noreply@kuja.local)
"""

import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger('kuja')


def _from_address() -> str:
    return os.getenv('MAIL_FROM') or 'noreply@kuja.local'


def _from_name() -> str:
    return os.getenv('MAIL_FROM_NAME') or 'Kuja Grant Management'


class EmailService:

    @classmethod
    def send(cls, *, to: str, subject: str, body: str) -> dict:
        """Send a plain-text email. Returns:
          { success, transport: 'sendgrid'|'smtp'|'log', message_id?, error? }
        """
        if not to or '@' not in to:
            return {'success': False, 'transport': None,
                    'skipped': True, 'reason': 'invalid_recipient'}

        # 1. SendGrid first if configured
        if os.getenv('SENDGRID_API_KEY'):
            r = cls._send_sendgrid(to=to, subject=subject, body=body)
            r['transport'] = 'sendgrid'
            return r

        # 2. SMTP fallback if configured
        if os.getenv('SMTP_HOST'):
            r = cls._send_smtp(to=to, subject=subject, body=body)
            r['transport'] = 'smtp'
            return r

        # 3. Log-only fallback so dev still gets observability
        logger.info(
            f"NOTIF_EMAIL_LOG to={to} subject={subject[:80]!r} "
            f"body_len={len(body or '')} (no SMTP/SendGrid configured)"
        )
        return {'success': True, 'transport': 'log', 'logged': True}

    # ------------------------------------------------------------------

    @classmethod
    def _send_sendgrid(cls, *, to: str, subject: str, body: str) -> dict:
        """SendGrid v3 Web API. We POST directly via requests so we
        don't take on a sendgrid SDK dependency."""
        try:
            import requests
        except Exception as e:
            return {'success': False, 'error': f'requests unavailable: {e}'}

        api_key = os.getenv('SENDGRID_API_KEY', '')
        if not api_key:
            return {'success': False, 'skipped': True, 'reason': 'no_api_key'}

        payload = {
            'personalizations': [{'to': [{'email': to}]}],
            'from': {'email': _from_address(), 'name': _from_name()},
            'subject': subject[:200],
            'content': [{'type': 'text/plain', 'value': body or ''}],
        }
        try:
            resp = requests.post(
                'https://api.sendgrid.com/v3/mail/send',
                headers={
                    'Authorization': f'Bearer {api_key}',
                    'Content-Type': 'application/json',
                },
                json=payload,
                timeout=12,
            )
            if 200 <= resp.status_code < 300:
                # SendGrid returns Message-ID in the X-Message-Id header
                return {
                    'success': True,
                    'message_id': resp.headers.get('X-Message-Id'),
                    'status': resp.status_code,
                }
            return {
                'success': False,
                'status': resp.status_code,
                'error': resp.text[:200],
            }
        except Exception as e:
            logger.warning(f'SendGrid send failed: {e}')
            return {'success': False, 'error': str(e)[:200]}

    @classmethod
    def _send_smtp(cls, *, to: str, subject: str, body: str) -> dict:
        """Plain SMTP. Use STARTTLS if SMTP_TLS=1; PLAIN auth via SMTP_USER/PASS."""
        host = os.getenv('SMTP_HOST', '')
        if not host:
            return {'success': False, 'skipped': True, 'reason': 'no_host'}
        try:
            port = int(os.getenv('SMTP_PORT', '587'))
        except ValueError:
            port = 587
        use_tls = (os.getenv('SMTP_TLS', '1').lower() in ('1', 'true', 'yes'))
        user = os.getenv('SMTP_USER', '') or None
        pwd = os.getenv('SMTP_PASS', '') or None

        msg = MIMEMultipart()
        msg['From'] = f'{_from_name()} <{_from_address()}>'
        msg['To'] = to
        msg['Subject'] = subject[:200]
        msg.attach(MIMEText(body or '', 'plain', 'utf-8'))

        try:
            with smtplib.SMTP(host, port, timeout=15) as server:
                server.ehlo()
                if use_tls:
                    server.starttls()
                    server.ehlo()
                if user and pwd:
                    server.login(user, pwd)
                server.sendmail(_from_address(), [to], msg.as_string())
            return {'success': True}
        except Exception as e:
            logger.warning(f'SMTP send failed: {e}')
            return {'success': False, 'error': str(e)[:200]}
