"""Proximate one-shot endorser invite — Phase 716a (June 2026).

The problem: the original endorser flow (Phase 629) assumed community
elders would want persistent identity + a login. In practice Sudan
elders are answering 3 Y/N questions on WhatsApp — they don't want
inbox management, they want the same zero-login token pattern that
partners get for report submission.

The model: OB issues a per-partner, per-elder invite (name + phone +
optional context). The invite_token IS the credential. The elder
opens the WhatsApp link cold, answers the wizard, submits. On submit
the backend auto-provisions an Endorser row (and a placeholder User
row underneath, since Endorser.user_id is NOT NULL) so downstream
reputation + audit trails keep working — the elder never sees the
account plumbing.

SoP compliance: only OB can issue invites, so the "who did we ask?"
audit is preserved via `created_by_user_id`. The invite IS the light-
KYC — OB knew the elder before inviting them.

The pre-existing login-based endorser path (`/proximate/endorse/register`
+ approval queue) stays untouched, for elders who want repeat-voucher
dashboards.
"""

from datetime import datetime, timezone
import secrets

from app.extensions import db


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _make_invite_token() -> str:
    """32-char hex, url-safe. Same shape as partner report tokens so
    ops muscle memory works across all Proximate tokened URLs."""
    return secrets.token_hex(16)


class ProximateEndorserInvite(db.Model):
    """One OB-issued invitation for a specific elder to endorse a
    specific partner. One-shot: `used_at` locks the invite once the
    elder submits."""

    __tablename__ = "proximate_endorser_invites"
    __table_args__ = (
        db.Index(
            "ix_proximate_endorser_invites_partner_active",
            "partner_id", "used_at",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)

    partner_id = db.Column(
        db.Integer,
        db.ForeignKey("proximate_partners.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    invite_token = db.Column(
        db.String(64), unique=True, nullable=False, index=True,
        default=_make_invite_token,
    )

    # Who we're inviting. Name is required; phone is what actually
    # reaches them (Sudan is phone-first, not email-first).
    invitee_name = db.Column(db.String(200), nullable=False)
    invitee_phone = db.Column(db.String(50), nullable=True)
    invitee_email = db.Column(db.String(200), nullable=True)
    # Optional COI hints so the auto-check has data to compare against.
    invitee_locality = db.Column(db.String(120), nullable=True)

    # Optional OB-supplied context shown to the elder on the invite
    # landing page ("You're being asked because you know Kassala").
    note = db.Column(db.Text, nullable=True)

    created_by_user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False,
    )
    created_at = db.Column(
        db.DateTime, nullable=False, default=_now,
    )

    # Populated on submit. If the invite is still open, both are NULL.
    used_at = db.Column(db.DateTime, nullable=True, index=True)
    endorsement_id = db.Column(
        db.Integer,
        db.ForeignKey("proximate_endorsements.id"),
        nullable=True,
    )
    endorser_id = db.Column(
        db.Integer,
        db.ForeignKey("proximate_endorsers.id"),
        nullable=True,
    )

    def to_dict(self, *, include_token: bool = False) -> dict:
        data = {
            "id": self.id,
            "partner_id": self.partner_id,
            "invitee_name": self.invitee_name,
            "invitee_phone": self.invitee_phone,
            "invitee_email": self.invitee_email,
            "invitee_locality": self.invitee_locality,
            "note": self.note,
            "created_by_user_id": self.created_by_user_id,
            "created_at": (
                self.created_at.isoformat() if self.created_at else None
            ),
            "used_at": self.used_at.isoformat() if self.used_at else None,
            "endorsement_id": self.endorsement_id,
            "endorser_id": self.endorser_id,
        }
        if include_token:
            data["invite_token"] = self.invite_token
        return data
