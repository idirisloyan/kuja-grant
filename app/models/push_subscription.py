"""
Push subscription — Phase 13.34.

PMO's pattern: Web Push via VAPID. The subscription endpoint URL +
p256dh/auth keys uniquely identify a browser/device pair authorized
to receive notifications for a user.

Activation: requires VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY +
VAPID_SUBJECT (e.g. 'mailto:ops@kuja.org') in env. When unset, the
subscribe endpoint still accepts subscriptions (so the table fills
up) but the actual send is a no-op — useful for dev + when the
team is provisioning keys.
"""

from datetime import datetime, timezone

from app.extensions import db


class PushSubscription(db.Model):
    __tablename__ = 'push_subscriptions'
    __table_args__ = (
        db.Index('ix_push_subs_user', 'user_id'),
        db.UniqueConstraint('endpoint', name='uq_push_endpoint'),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    # Browser-given subscription endpoint URL.
    endpoint = db.Column(db.Text, nullable=False)
    # Public key for the subscription.
    p256dh = db.Column(db.String(200), nullable=False)
    # Auth secret.
    auth = db.Column(db.String(100), nullable=False)
    # Optional user-agent at subscription time, for diagnostics.
    user_agent = db.Column(db.String(400), nullable=True)

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    last_used_at = db.Column(db.DateTime, nullable=True)
    # Number of consecutive 404/410 responses from the push service —
    # at >= 3 we delete the subscription (browser unsubscribed).
    failure_count = db.Column(db.Integer, default=0, nullable=False)

    def to_dict(self):
        # Endpoint is sensitive — surface only the device-identifying suffix.
        ep_short = self.endpoint[-32:] if self.endpoint else ''
        return {
            'id': self.id,
            'user_id': self.user_id,
            'endpoint_suffix': ep_short,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_used_at': self.last_used_at.isoformat() if self.last_used_at else None,
            'failure_count': self.failure_count or 0,
        }
