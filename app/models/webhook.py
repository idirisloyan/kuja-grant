"""Webhook — Phase 143 (Jun 2026).

Donors / NGO admins can register an outbound webhook URL to receive
event payloads when key transitions happen on their entities:

  - application.submitted
  - application.awarded
  - application.rejected
  - report.submitted
  - grant.published
  - declaration.activated

Payloads are POSTed as JSON with an HMAC-SHA256 signature in the
`X-Kuja-Signature` header so receivers can verify integrity. The
shared secret is stored encrypted-at-rest by Railway's DB encryption.
"""

from __future__ import annotations
import secrets
from datetime import datetime, timezone

from app.extensions import db


class Webhook(db.Model):
    """Registered outbound webhook for an organization."""
    __tablename__ = 'webhooks'
    __table_args__ = (
        db.Index('ix_webhooks_org_active', 'org_id', 'active'),
    )

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(
        db.Integer, db.ForeignKey('organizations.id', ondelete='CASCADE'),
        nullable=False,
    )
    url = db.Column(db.String(500), nullable=False)
    secret = db.Column(db.String(64), nullable=False)
    events = db.Column(db.Text, nullable=False)  # JSON list of event names
    active = db.Column(db.Boolean, nullable=False, default=True)
    description = db.Column(db.String(240), nullable=True)
    created_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    last_delivery_at = db.Column(db.DateTime, nullable=True)
    last_delivery_status = db.Column(db.Integer, nullable=True)  # HTTP code
    last_delivery_error = db.Column(db.String(500), nullable=True)
    delivery_count = db.Column(db.Integer, nullable=False, default=0)
    failure_count = db.Column(db.Integer, nullable=False, default=0)

    @staticmethod
    def generate_secret() -> str:
        return secrets.token_urlsafe(32)

    def to_dict(self, *, include_secret: bool = False) -> dict:
        import json as _json
        try:
            events_list = _json.loads(self.events) if self.events else []
        except Exception:
            events_list = []
        out = {
            'id': self.id,
            'org_id': self.org_id,
            'url': self.url,
            'events': events_list,
            'active': self.active,
            'description': self.description,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_delivery_at':
                self.last_delivery_at.isoformat() if self.last_delivery_at else None,
            'last_delivery_status': self.last_delivery_status,
            'last_delivery_error': self.last_delivery_error,
            'delivery_count': self.delivery_count,
            'failure_count': self.failure_count,
        }
        if include_secret:
            out['secret'] = self.secret
        return out
