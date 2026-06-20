"""WebhookDelivery — Phase 165 (Jun 2026).

Per-attempt log of every outbound webhook delivery. Phase 143 only
persisted last_delivery_* on the Webhook row; that's enough for "is it
healthy now?" but not "what happened last Thursday?"

Each row captures one delivery attempt: event, status code, duration,
attempts (i.e. internal retry count from the Phase 147 backoff), and
the optional error.

Bounded by a sweeper that keeps only the last N rows per hook so the
table doesn't grow without bound (cron not built yet — punt to ops).
"""

from datetime import datetime, timezone

from app.extensions import db


class WebhookDelivery(db.Model):
    __tablename__ = 'webhook_deliveries'
    __table_args__ = (
        db.Index('ix_webhook_deliveries_hook_at', 'webhook_id', 'delivered_at'),
    )

    id = db.Column(db.Integer, primary_key=True)
    webhook_id = db.Column(
        db.Integer, db.ForeignKey('webhooks.id', ondelete='CASCADE'),
        nullable=False,
    )
    event_name = db.Column(db.String(80), nullable=False)
    delivered_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    status_code = db.Column(db.Integer, nullable=True)
    duration_ms = db.Column(db.Integer, nullable=True)
    attempts = db.Column(db.Integer, nullable=False, default=1)
    error = db.Column(db.String(500), nullable=True)

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'webhook_id': self.webhook_id,
            'event_name': self.event_name,
            'delivered_at': self.delivered_at.isoformat() if self.delivered_at else None,
            'status_code': self.status_code,
            'duration_ms': self.duration_ms,
            'attempts': self.attempts,
            'error': self.error,
        }
