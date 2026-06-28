"""Proximate donor model — Phase 681 (June 2026).

A donor is a funder subscribed to one or more Proximate rounds.
The donor portal (Phase 682) is the funder-facing surface; this
model + the registration endpoint are its data foundation.

v0 scope (per Phase 678–688 plan):
- Admin-registered only (OB calls POST /api/proximate/donors). Self-
  service signup is deferred — needs a vetting/KYC story Adeso
  designs separately. See docs/PROXIMATE_BACKLOG.md.
- One Donor row per (network, primary_user). The associated org may
  already exist in the Kuja Organization table (donors are usually
  funder orgs the platform already knows). If not, the OB creates
  the org first via the normal flow, then registers the donor.

Subscription model:
- `subscribed_round_ids_json` is a JSON list of round ids the donor
  has opted to follow. The donor portal aggregates across this list.
- The OB can set the list during registration; the donor can prune
  it themselves later from the portal (Phase 682).
"""

from datetime import datetime, timezone

from app.extensions import db


class ProximateDonor(db.Model):
    """A funder registered as a Proximate donor."""

    __tablename__ = "proximate_donors"
    __table_args__ = (
        db.Index(
            "ix_proximate_donors_network",
            "network_id",
        ),
        db.UniqueConstraint(
            "network_id", "primary_user_id",
            name="uq_proximate_donor_per_user_per_network",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    network_id = db.Column(
        db.Integer, db.ForeignKey("networks.id"),
        nullable=False,
    )
    org_id = db.Column(db.Integer, db.ForeignKey("organizations.id"), nullable=True)
    primary_user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False,
    )

    display_name = db.Column(db.String(200), nullable=False)
    contact_email = db.Column(db.String(200), nullable=True)

    auto_email_closing_pack = db.Column(db.Boolean, default=True, nullable=False)

    # JSON list of round_ids the donor is following. Empty list = all
    # public rounds (the portal still scopes to the network).
    subscribed_round_ids_json = db.Column(db.Text, nullable=True)

    # OB who registered this donor (audit trail companion).
    registered_by_user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True,
    )

    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def subscribed_round_ids(self) -> list:
        if not self.subscribed_round_ids_json:
            return []
        import json as _json
        try:
            v = _json.loads(self.subscribed_round_ids_json)
            return [int(x) for x in v] if isinstance(v, list) else []
        except (ValueError, TypeError):
            return []

    def set_subscribed_round_ids(self, ids):
        import json as _json
        clean = sorted(set(int(x) for x in ids if x is not None))
        self.subscribed_round_ids_json = _json.dumps(clean)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "network_id": self.network_id,
            "org_id": self.org_id,
            "primary_user_id": self.primary_user_id,
            "display_name": self.display_name,
            "contact_email": self.contact_email,
            "auto_email_closing_pack": self.auto_email_closing_pack,
            "subscribed_round_ids": self.subscribed_round_ids(),
            "registered_by_user_id": self.registered_by_user_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
