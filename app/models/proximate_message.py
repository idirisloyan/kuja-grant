"""ProximateMessage + ProximateSessionWindow — outbound/inbound
messaging log for the Proximate Fund (July 2026).

Backlog items 1-18. One row per message the fund sends to, or receives
from, a partner / endorser / panellist phone number.

Why a log table rather than fire-and-forget:

  * Delivery is not guaranteed and the recipient is often unreachable
    for days. The OB needs to see "we tried, three times, it never
    landed" — not silence.
  * The whole point of the messaging work is to stop relying on someone
    remembering to paste a link into WhatsApp. That only holds if the
    system can prove what it sent.
  * Cost is per-conversation, so it has to be attributable.

Deliberately transport-agnostic: `channel` records whether it went via
WhatsApp, SMS, or was left for a human to send manually. When no
provider is configured every send lands as channel='manual' with
status='unsent' — visible, honest, and never a silent success. That
distinction is the whole lesson from EmailService, which reported
success while writing to a log and discarding the message.

ProximateSessionWindow tracks Meta's 24-hour rule: outside the window
after a user's last inbound message, only pre-approved templates may be
sent. Getting this wrong means messages silently rejected by Meta.
"""

from datetime import datetime, timedelta, timezone

from app.extensions import db


# Meta's customer-service window. Outside it, template-only.
SESSION_WINDOW_HOURS = 24


class ProximateMessage(db.Model):
    __tablename__ = 'proximate_messages'
    __table_args__ = (
        db.Index('ix_prox_msg_network_created', 'network_id', 'created_at'),
        db.Index('ix_prox_msg_status', 'status'),
        db.Index('ix_prox_msg_recipient', 'recipient_phone'),
    )

    id = db.Column(db.Integer, primary_key=True)
    network_id = db.Column(
        db.Integer, db.ForeignKey('networks.id'), nullable=False, index=True,
    )

    direction = db.Column(db.String(10), nullable=False, default='out')  # out|in
    channel = db.Column(db.String(16), nullable=False, default='manual')  # whatsapp|sms|manual
    template_key = db.Column(db.String(64), nullable=True)
    template_variant = db.Column(db.String(8), nullable=True)  # A/B
    locale = db.Column(db.String(8), nullable=True)

    recipient_phone = db.Column(db.String(32), nullable=True)
    recipient_name = db.Column(db.String(160), nullable=True)
    body = db.Column(db.Text, nullable=True)

    # What this message is about, so the OB can jump to the record.
    subject_kind = db.Column(db.String(32), nullable=True)   # disbursement|partner|round|invite
    subject_id = db.Column(db.Integer, nullable=True)

    # unsent | queued | sent | delivered | read | failed | received
    status = db.Column(db.String(16), nullable=False, default='unsent')
    provider_message_id = db.Column(db.String(128), nullable=True)
    error = db.Column(db.String(500), nullable=True)
    attempts = db.Column(db.Integer, nullable=False, default=0)
    next_attempt_at = db.Column(db.DateTime, nullable=True)

    cost_usd = db.Column(db.Numeric(10, 5), nullable=True)

    created_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    sent_at = db.Column(db.DateTime, nullable=True)
    delivered_at = db.Column(db.DateTime, nullable=True)
    read_at = db.Column(db.DateTime, nullable=True)
    responded_at = db.Column(db.DateTime, nullable=True)

    # OB triage of inbound replies
    handled_at = db.Column(db.DateTime, nullable=True)
    handled_by_user_id = db.Column(
        db.Integer, db.ForeignKey('users.id'), nullable=True,
    )

    def to_dict(self, include_body: bool = True) -> dict:
        d = {
            'id': self.id,
            'direction': self.direction,
            'channel': self.channel,
            'template_key': self.template_key,
            'template_variant': self.template_variant,
            'locale': self.locale,
            'recipient_name': self.recipient_name,
            'recipient_phone': _mask_phone(self.recipient_phone),
            'subject_kind': self.subject_kind,
            'subject_id': self.subject_id,
            'status': self.status,
            'error': self.error,
            'attempts': self.attempts,
            'cost_usd': float(self.cost_usd) if self.cost_usd is not None else None,
            'created_at': _iso(self.created_at),
            'sent_at': _iso(self.sent_at),
            'delivered_at': _iso(self.delivered_at),
            'read_at': _iso(self.read_at),
            'responded_at': _iso(self.responded_at),
            'handled_at': _iso(self.handled_at),
        }
        if include_body:
            d['body'] = self.body
        return d


class ProximateSessionWindow(db.Model):
    """Last inbound message per phone number, per tenant.

    Meta only allows free-form replies within 24h of the recipient's
    own last message. Outside that, template-only. We track it rather
    than discovering it through rejected sends.
    """

    __tablename__ = 'proximate_session_windows'
    __table_args__ = (
        db.UniqueConstraint('network_id', 'phone', name='uq_prox_session_net_phone'),
    )

    id = db.Column(db.Integer, primary_key=True)
    network_id = db.Column(
        db.Integer, db.ForeignKey('networks.id'), nullable=False,
    )
    phone = db.Column(db.String(32), nullable=False)
    last_inbound_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    detected_locale = db.Column(db.String(8), nullable=True)

    @property
    def is_open(self) -> bool:
        if not self.last_inbound_at:
            return False
        last = self.last_inbound_at
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) - last < timedelta(hours=SESSION_WINDOW_HOURS)


def _iso(v):
    return v.isoformat() if v else None


def _mask_phone(p: str | None) -> str | None:
    """Never hand a full number back to a browser. The OB needs enough
    to recognise the contact, not enough to redistribute it."""
    if not p:
        return None
    digits = ''.join(ch for ch in p if ch.isdigit())
    if len(digits) <= 4:
        return '•' * len(digits)
    return '•••' + digits[-4:]
