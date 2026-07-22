"""ProximateMessaging — the fund's outbound/inbound message layer.
Backlog items 1-18, 33 (July 2026).

Sits ON TOP of the existing MessagingService rather than duplicating its
Twilio transport. This module owns the things MessagingService doesn't:

  * a persisted log of every message, so "did the partner ever actually
    hear from us?" is answerable
  * bilingual templates, kept in one place so the automated send and the
    OB's manual wa.me copy say the same words
  * Meta's 24-hour session window
  * inbound capture, language detection, and response attribution
  * a retry queue with bounded backoff

DESIGN RULE: when no provider is configured, a send is recorded with
status='unsent' and returns delivered=False. It never claims success.
That is the lesson from EmailService (and from MessagingService._send_log
before it was fixed in f9281cc44): a fallback that reports success hides
the failure until someone asks why nobody replied.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone

from app.extensions import db
from app.models.proximate_message import (
    ProximateMessage,
    ProximateSessionWindow,
)
from app.services.messaging_service import MessagingService

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 4
BACKOFF_MINUTES = [5, 30, 180]
APPROX_COST_USD = {'whatsapp': 0.02, 'sms': 0.08}

_ARABIC = re.compile(r'[؀-ۿ]')


# --------------------------------------------------------------------
# Templates — bilingual, single source of truth.
# --------------------------------------------------------------------

TEMPLATES: dict[str, dict[str, str]] = {
    'endorsement_invite': {
        'en': ('Assalaamu alaikum {name}. Adeso is asking a few short questions about '
               '{partner}. It takes about 3 minutes and you can answer by voice. Your '
               'name is never shown to the organisation. {link}'),
        'ar': ('السلام عليكم {name}. تسأل أديسو بضعة أسئلة قصيرة عن {partner}. يستغرق '
               'الأمر نحو ٣ دقائق ويمكنكم الإجابة صوتياً. لا يظهر اسمكم للمنظمة أبداً. {link}'),
    },
    'endorsement_reminder': {
        'en': ('Assalaamu alaikum {name}. A reminder that Adeso is still waiting for '
               'your answers about {partner}. About 3 minutes, voice is fine. {link}'),
        'ar': ('السلام عليكم {name}. تذكير بأن أديسو ما زالت تنتظر إجاباتكم عن {partner}. '
               'نحو ٣ دقائق، ويمكن الردّ صوتياً. {link}'),
    },
    'disbursement_notify': {
        'en': ('Adeso has sent {amount} to {partner} for: {purpose}. Please tell us what '
               'happened by {due}. You can answer by voice — no account needed. {link}'),
        'ar': ('أرسلت أديسو {amount} إلى {partner} من أجل: {purpose}. يُرجى إخبارنا بما '
               'حدث قبل {due}. يمكنكم الإجابة صوتياً — دون الحاجة إلى حساب. {link}'),
    },
    'report_reminder': {
        'en': ('A reminder from Adeso: your report for {partner} is due on {due}. It '
               'takes a few minutes and you can answer by voice. {link}'),
        'ar': ('تذكير من أديسو: تقريركم عن {partner} مستحقّ في {due}. يستغرق دقائق قليلة '
               'ويمكن الإجابة صوتياً. {link}'),
    },
    'report_ack': {
        'en': ('Thank you — Adeso has received your report for {partner}. Nothing '
               'further is needed right now.'),
        'ar': ('شكراً لكم — استلمت أديسو تقريركم عن {partner}. لا حاجة إلى أي شيء آخر '
               'في الوقت الحالي.'),
    },
    'outcome_reminder': {
        'en': ('Adeso has one last short question about {partner}, about what lasted. '
               'Honest answers help us fund organisations like yours. {link}'),
        'ar': ('لدى أديسو سؤال أخير قصير عن {partner}، عمّا استمرّ. الإجابات الصادقة '
               'تساعدنا على تمويل منظمات مثل منظمتكم. {link}'),
    },
    'partner_cleared': {
        'en': ('Thank you. The organisation you vouched for, {partner}, has been cleared '
               'for funding by Adeso. Your endorsement mattered.'),
        'ar': ('شكراً لكم. المنظمة التي زكّيتموها، {partner}، تمّت إجازتها للتمويل من '
               'أديسو. كانت تزكيتكم مهمّة.'),
    },
    'round_activated': {
        'en': ('Adeso has opened a new funding round: {round}. If you know a community '
               'organisation doing good work, you can nominate them. {link}'),
        'ar': ('فتحت أديسو جولة تمويل جديدة: {round}. إن كنتم تعرفون منظمة مجتمعية تقوم '
               'بعمل جيّد، يمكنكم ترشيحها. {link}'),
    },
}


class _SafeDict(dict):
    def __missing__(self, k):
        return ''


def render(key: str, locale: str, **params) -> str:
    """Render a template. Never raises — a half-rendered message that
    still carries the link beats an exception inside a cron."""
    variants = TEMPLATES.get(key) or {}
    body = variants.get(locale) or variants.get('en') or '{link}'
    try:
        return body.format_map(_SafeDict(params))
    except Exception:  # pragma: no cover
        return params.get('link') or ''


def detect_locale(text: str | None) -> str:
    """Deliberately crude: one Arabic character is enough. Replying in
    the wrong script is a worse failure than over-detecting Arabic."""
    return 'ar' if (text and _ARABIC.search(text)) else 'en'


def normalise_phone(p: str | None) -> str | None:
    if not p:
        return None
    plus = p.strip().startswith('+')
    digits = ''.join(ch for ch in p if ch.isdigit())
    return (('+' if plus else '') + digits) if digits else None


# --------------------------------------------------------------------


class ProximateMessaging:

    @staticmethod
    def configured() -> bool:
        return bool(
            MessagingService.is_channel_enabled('whatsapp')
            or MessagingService.is_channel_enabled('sms')
        )

    @classmethod
    def status(cls) -> dict:
        return {
            'whatsapp': MessagingService.is_channel_enabled('whatsapp'),
            'sms': MessagingService.is_channel_enabled('sms'),
            'any': cls.configured(),
        }

    # ---------------- send ----------------

    @classmethod
    def send(
        cls, *, network_id: int, template_key: str, to_phone: str | None,
        to_name: str | None = None, locale: str = 'en',
        subject_kind: str | None = None, subject_id: int | None = None,
        variant: str | None = None, **params,
    ) -> ProximateMessage:
        """Record and attempt one message. ALWAYS returns a persisted row —
        including when nothing could be sent. That row is the OB's to-do."""
        msg = ProximateMessage(
            network_id=network_id,
            direction='out',
            channel='manual',
            template_key=template_key,
            template_variant=variant,
            locale=locale,
            recipient_phone=normalise_phone(to_phone),
            recipient_name=to_name,
            body=render(template_key, locale, **params),
            subject_kind=subject_kind,
            subject_id=subject_id,
            status='unsent',
        )
        db.session.add(msg)
        db.session.flush()

        if not msg.recipient_phone:
            msg.error = 'no phone number on file'
            db.session.commit()
            return msg

        cls._attempt(msg)
        db.session.commit()
        return msg

    @classmethod
    def _attempt(cls, msg: ProximateMessage) -> None:
        """One pass down the transport ladder. Mutates; caller commits."""
        msg.attempts = (msg.attempts or 0) + 1

        if not cls.configured():
            msg.channel = 'manual'
            msg.status = 'unsent'
            msg.error = 'no messaging provider configured — send manually'
            msg.next_attempt_at = None
            return

        for channel in ('whatsapp', 'sms'):
            if not MessagingService.is_channel_enabled(channel):
                continue
            res = MessagingService.send(
                channel=channel, to=msg.recipient_phone, body=msg.body or '',
            )
            # Post-f9281cc44 the log fallback reports success=False, so a
            # truthy success here really does mean it left the building.
            if res.get('success'):
                msg.channel = channel
                msg.status = 'sent'
                msg.provider_message_id = res.get('sid')
                msg.sent_at = datetime.now(timezone.utc)
                msg.error = None
                msg.next_attempt_at = None
                msg.cost_usd = APPROX_COST_USD.get(channel)
                return
            msg.error = (res.get('error') or 'send failed')[:500]

        if msg.attempts >= MAX_ATTEMPTS:
            msg.status = 'failed'
            msg.next_attempt_at = None
        else:
            msg.status = 'queued'
            mins = BACKOFF_MINUTES[min(msg.attempts - 1, len(BACKOFF_MINUTES) - 1)]
            msg.next_attempt_at = datetime.now(timezone.utc) + timedelta(minutes=mins)

    # ---------------- retry sweep (cron) ----------------

    @classmethod
    def sweep_retries(cls, limit: int = 50) -> dict:
        now = datetime.now(timezone.utc)
        rows = (
            ProximateMessage.query
            .filter(ProximateMessage.status == 'queued')
            .filter(ProximateMessage.next_attempt_at.isnot(None))
            .filter(ProximateMessage.next_attempt_at <= now)
            .limit(limit).all()
        )
        sent = failed = 0
        for m in rows:
            cls._attempt(m)
            if m.status == 'sent':
                sent += 1
            elif m.status == 'failed':
                failed += 1
        if rows:
            db.session.commit()
        return {'examined': len(rows), 'sent': sent, 'failed': failed}

    # ---------------- inbound ----------------

    @classmethod
    def record_inbound(
        cls, *, network_id: int, from_phone: str, body: str,
        provider_message_id: str | None = None,
    ) -> ProximateMessage:
        phone = normalise_phone(from_phone)
        locale = detect_locale(body)

        row = ProximateMessage(
            network_id=network_id, direction='in', channel='whatsapp',
            locale=locale, recipient_phone=phone,
            body=(body or '')[:4000], status='received',
            provider_message_id=provider_message_id,
        )
        db.session.add(row)

        win = ProximateSessionWindow.query.filter_by(
            network_id=network_id, phone=phone,
        ).first()
        if not win:
            win = ProximateSessionWindow(network_id=network_id, phone=phone)
            db.session.add(win)
        win.last_inbound_at = datetime.now(timezone.utc)
        win.detected_locale = locale

        # Close the loop on our most recent outbound — this is what makes
        # response rate measurable per template.
        prior = (
            ProximateMessage.query
            .filter_by(network_id=network_id, recipient_phone=phone, direction='out')
            .filter(ProximateMessage.responded_at.is_(None))
            .order_by(ProximateMessage.created_at.desc())
            .first()
        )
        if prior:
            prior.responded_at = datetime.now(timezone.utc)

        db.session.commit()
        return row

    @classmethod
    def session_open(cls, network_id: int, phone: str) -> bool:
        win = ProximateSessionWindow.query.filter_by(
            network_id=network_id, phone=normalise_phone(phone),
        ).first()
        return bool(win and win.is_open)

    # ---------------- delivery receipts ----------------

    @classmethod
    def record_receipt(cls, provider_message_id: str, status: str) -> bool:
        m = ProximateMessage.query.filter_by(
            provider_message_id=provider_message_id,
        ).first()
        if not m:
            return False
        now = datetime.now(timezone.utc)
        if status == 'delivered':
            m.delivered_at = m.delivered_at or now
            m.status = 'delivered'
        elif status == 'read':
            m.delivered_at = m.delivered_at or now
            m.read_at = now
            m.status = 'read'
        elif status in ('failed', 'undelivered'):
            m.status = 'failed'
        db.session.commit()
        return True

    # ---------------- rollups ----------------

    @classmethod
    def delivery_stats(cls, network_id: int, days: int = 30) -> list[dict]:
        """Per-template send/delivered/read/responded, for the OB tile."""
        since = datetime.now(timezone.utc) - timedelta(days=days)
        rows = (
            ProximateMessage.query
            .filter_by(network_id=network_id, direction='out')
            .filter(ProximateMessage.created_at >= since).all()
        )
        by: dict[str, dict] = {}
        for m in rows:
            k = m.template_key or 'other'
            b = by.setdefault(k, {
                'template': k, 'total': 0, 'sent': 0, 'delivered': 0,
                'read': 0, 'responded': 0, 'unsent': 0, 'failed': 0,
                'cost_usd': 0.0,
            })
            b['total'] += 1
            if m.sent_at:
                b['sent'] += 1
            if m.delivered_at:
                b['delivered'] += 1
            if m.read_at:
                b['read'] += 1
            if m.responded_at:
                b['responded'] += 1
            if m.status == 'unsent':
                b['unsent'] += 1
            if m.status == 'failed':
                b['failed'] += 1
            if m.cost_usd:
                b['cost_usd'] += float(m.cost_usd)
        for b in by.values():
            b['cost_usd'] = round(b['cost_usd'], 4)
            b['response_rate'] = (
                round(b['responded'] / b['sent'], 3) if b['sent'] else None
            )
        return sorted(by.values(), key=lambda x: -x['total'])
