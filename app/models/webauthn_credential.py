"""WebAuthn credential model - Phase 26C.

Stores the public-key credentials registered by users for biometric /
hardware-key re-authentication. One user can have many credentials
(e.g. phone fingerprint + laptop Touch ID + roaming hardware key).

We deliberately store only the public side of each credential — the
private key never leaves the authenticator. We also track sign_count
to detect cloned authenticators (the count must monotonically
increase on each successful assertion).
"""

from datetime import datetime, timezone

from app.extensions import db


class WebAuthnCredential(db.Model):
    """WebAuthn public-key credential registered to a user."""
    __tablename__ = 'webauthn_credentials'
    __table_args__ = (
        db.Index('ix_webauthn_user', 'user_id'),
        db.UniqueConstraint('credential_id', name='uq_webauthn_credential_id'),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)

    # base64url-encoded credentialId (what the authenticator returns)
    credential_id = db.Column(db.String(512), nullable=False, unique=True)
    # base64url-encoded COSE public key
    public_key = db.Column(db.Text, nullable=False)
    # Authenticator sign count — must strictly increase on each assertion
    sign_count = db.Column(db.Integer, nullable=False, default=0)
    # User-friendly label: "iPhone 15", "MacBook Touch ID", "YubiKey 5"
    label = db.Column(db.String(120), nullable=True)
    # 'platform' (Touch ID / Face ID / Windows Hello) vs 'cross-platform' (USB key)
    transport_hint = db.Column(db.String(40), nullable=True)

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    last_used_at = db.Column(db.DateTime, nullable=True)

    user = db.relationship(
        'User',
        backref=db.backref('webauthn_credentials', lazy='dynamic',
                           cascade='all, delete-orphan'),
    )

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'label': self.label or 'Unnamed device',
            'transport_hint': self.transport_hint,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_used_at': self.last_used_at.isoformat() if self.last_used_at else None,
            # Never expose credential_id or public_key over the wire;
            # they're identifiers + crypto material, not for display.
        }
