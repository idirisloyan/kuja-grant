"""
NotificationPreference — Phase 6 (May 2026).

Per-user, per-category preferences for how to receive notifications.
Each user has at most one row per category (or a default row when none
exists). Defaults: in-app + email; SMS + WhatsApp off until the user
opts in.

Categories (start small, easy to extend):
  - deadlines       — report due dates, grant closing, registration expiry
  - reviews         — application reviews assigned / completed
  - compliance      — pre-emption flags, sanctions hits, adverse media
  - decisions       — donor decisions on applications/reports

Channels (mirror the messaging adapter):
  - in_app          — always available; uses Notifications table
  - email           — placeholder; not wired in this push
  - sms             — Twilio SMS (env-gated)
  - whatsapp        — Twilio WhatsApp Business (env-gated)
  - web_push        — VAPID push (existing PushSubscription model)

Phone number lives here too (per-user, not per-org) — the user opts in
explicitly. We never SMS without consent.
"""

from datetime import datetime, timezone

from app.extensions import db
from app.utils.helpers import _json_load, _json_dump


VALID_CATEGORIES = {'deadlines', 'reviews', 'compliance', 'decisions', 'saved_search_matches', 'digests'}
VALID_CHANNELS = {'in_app', 'email', 'sms', 'whatsapp', 'web_push'}

DEFAULT_CHANNELS_BY_CATEGORY = {
    'deadlines':  ['in_app', 'email'],
    'reviews':    ['in_app', 'email'],
    'compliance': ['in_app'],
    'decisions':  ['in_app', 'email'],
    # Phase 170 — saved-search match alerts (Phase 167 fan-out).
    # Default to in-app only since these can be high-frequency.
    'saved_search_matches': ['in_app'],
    # Phase 326 — weekly summary digests (Phase 304 NGO pipeline,
    # Phase 268 donor weekly, Phase 329 donor portfolio recap).
    # Default to in-app; user opts in for email.
    'digests': ['in_app'],
}


class NotificationPreference(db.Model):
    """One row per (user_id, category). channels_json is a list of strings."""
    __tablename__ = 'notification_preferences'
    __table_args__ = (
        db.UniqueConstraint('user_id', 'category', name='uq_notif_pref_user_category'),
        db.Index('ix_notif_pref_user', 'user_id'),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    category = db.Column(db.String(32), nullable=False)
    channels_json = db.Column(db.Text, nullable=False, default='[]')

    # Contact info — per-user; opt-in.
    phone_e164 = db.Column(db.String(20), nullable=True)
    whatsapp_e164 = db.Column(db.String(20), nullable=True)

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user = db.relationship('User', backref=db.backref('notification_preferences', lazy='dynamic'))

    def get_channels(self) -> list[str]:
        return _json_load(self.channels_json) or []

    def set_channels(self, channels: list[str]) -> None:
        cleaned = [c for c in channels if c in VALID_CHANNELS]
        self.channels_json = _json_dump(cleaned)

    def to_dict(self):
        return {
            'category': self.category,
            'channels': self.get_channels(),
            'phone_e164': self.phone_e164,
            'whatsapp_e164': self.whatsapp_e164,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

    # ------------------------------------------------------------------
    # Convenience accessors
    # ------------------------------------------------------------------

    @classmethod
    def channels_for(cls, *, user_id: int, category: str) -> list[str]:
        """What channels does this user want for this category? Falls back
        to DEFAULT_CHANNELS_BY_CATEGORY if no row exists."""
        if category not in VALID_CATEGORIES:
            return ['in_app']
        pref = cls.query.filter_by(user_id=user_id, category=category).first()
        if pref:
            return pref.get_channels()
        return DEFAULT_CHANNELS_BY_CATEGORY.get(category, ['in_app'])

    @classmethod
    def contact_for(cls, *, user_id: int, channel: str) -> str | None:
        """What address does the user want to use for this channel?
        SMS/WhatsApp pull from any of the user's category rows (first
        non-null wins); in_app/email/web_push have their own addressing."""
        if channel not in ('sms', 'whatsapp'):
            return None
        rows = cls.query.filter_by(user_id=user_id).all()
        for r in rows:
            value = r.phone_e164 if channel == 'sms' else r.whatsapp_e164
            if value: return value
        return None
