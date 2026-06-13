"""TenantMessage — Phase 43A (May 2026).

In-app messaging for the closed-network model. The NEAR secretariat
needs to push messages to members (especially during a 72-hour
application window after a declaration activates) without waiting for
the email transport gap to close. This is the interim mechanism — a
durable, auditable message thread inside the platform.

Scopes — drives who can read a message:
    network     — every member NGO in the network
    country     — every member NGO in a given country
    org         — a single member org (by id)
    declaration — every shortlisted org under a given declaration

Each message creates an AuditChainEntry so the team can trace what
the secretariat said and to whom. Read receipts are tracked per-org
so the inbox can show unread badges.
"""

from datetime import datetime, timezone

from app.extensions import db


class TenantMessage(db.Model):
    __tablename__ = 'tenant_messages'
    __table_args__ = (
        db.Index('ix_tenant_messages_network_sent', 'network_id', 'sent_at'),
        db.Index('ix_tenant_messages_scope', 'network_id', 'scope', 'scope_value'),
    )

    id = db.Column(db.Integer, primary_key=True)
    network_id = db.Column(db.Integer, db.ForeignKey('networks.id'), nullable=False)
    sender_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    scope = db.Column(db.String(20), nullable=False)
    # 'network' | 'country' | 'org' | 'declaration'
    scope_value = db.Column(db.String(120), nullable=True)

    subject = db.Column(db.String(200), nullable=False)
    body_md = db.Column(db.Text, nullable=False)

    related_kind = db.Column(db.String(40), nullable=True)
    related_id = db.Column(db.Integer, nullable=True)

    sent_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    audit_chain_id = db.Column(db.Integer, nullable=True)

    def to_dict(self, *, viewer_org_id: int | None = None) -> dict:
        # Resolve sender name without forcing a heavyweight join
        from app.models import User
        sender = User.query.get(self.sender_user_id) if self.sender_user_id else None
        is_read = None
        if viewer_org_id:
            rec = TenantMessageRead.query.filter_by(
                message_id=self.id, org_id=viewer_org_id,
            ).first()
            is_read = rec is not None
        return {
            'id': self.id,
            'network_id': self.network_id,
            'sender_user_id': self.sender_user_id,
            'sender_name': sender.name if sender else None,
            'sender_email': sender.email if sender else None,
            'scope': self.scope,
            'scope_value': self.scope_value,
            'subject': self.subject,
            'body_md': self.body_md,
            'related_kind': self.related_kind,
            'related_id': self.related_id,
            'sent_at': self.sent_at.isoformat() if self.sent_at else None,
            'audit_chain_id': self.audit_chain_id,
            'is_read': is_read,
        }


class TenantMessageRead(db.Model):
    """Per-org read receipt — viewer counts unread messages from this."""
    __tablename__ = 'tenant_message_reads'

    message_id = db.Column(
        db.Integer,
        db.ForeignKey('tenant_messages.id', ondelete='CASCADE'),
        primary_key=True,
    )
    org_id = db.Column(
        db.Integer,
        db.ForeignKey('organizations.id', ondelete='CASCADE'),
        primary_key=True,
    )
    read_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
