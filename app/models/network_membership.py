"""NetworkMembership model — Phase 32 (May 2026).

Joins an Organization to a Network with status + tier. A single org
can be a member of multiple networks (e.g. an NGO that's both on the
Kuja Marketplace AND a NEAR member).

Status state machine (driven by membership workflows in Phase 33):
    pending      → applied; documents incomplete OR awaiting review
    under_review → docs complete + capacity assessment done; Oversight Body deciding
    active       → approved + visible in network directory + can receive grants
    rejected     → application rejected; can re-apply after cooldown
    suspended    → previously active; suspended for cause (manual)
    expelled     → terminal removal (manual)

Three-level hierarchy supported via parent_membership_id:
    Network → National Partner → Member NGO → Sub-NGO
The parent_membership_id self-reference covers NEAR's pattern where
a 'national partner' organisation oversees several regional members.

Phase 32 only ships the data model. The application workflow lands
in Phase 33 (TaskCreate #3).
"""

from datetime import datetime, timezone

from app.extensions import db
from app.utils.helpers import _json_load, _json_dump


# Status vocab — see file docstring for state machine.
MEMBERSHIP_STATUSES = (
    "pending",
    "under_review",
    "active",
    "rejected",
    "suspended",
    "expelled",
)

# Tier vocab — per the design doc, networks can have multiple member
# tiers (national partner vs regional member vs sub-NGO vs labs).
MEMBERSHIP_TIERS = (
    "member",            # default
    "national_partner",  # NEAR uses this for country-level coordination orgs
    "regional_member",   # standard regional member NGO
    "localisation_lab",  # NEAR-specific
    "sub_member",        # nested under a national_partner via parent_membership_id
)


class NetworkMembership(db.Model):
    """Org ↔ Network with status + tier + optional hierarchy."""

    __tablename__ = "network_memberships"
    __table_args__ = (
        db.UniqueConstraint(
            "network_id", "org_id",
            name="uq_network_membership_org_per_network",
        ),
        # Composite index for the common "list pending memberships
        # in this network" query. Single-column indexes on network_id
        # and org_id come from index=True on the columns themselves
        # (auto-named ix_network_memberships_<col>), which also matches
        # the index name in migrations/versions/v600_phase32_networks.py.
        db.Index("ix_network_memberships_network_status", "network_id", "status"),
    )

    id = db.Column(db.Integer, primary_key=True)
    network_id = db.Column(
        db.Integer,
        db.ForeignKey("networks.id"),
        nullable=False,
        index=True,
    )
    org_id = db.Column(
        db.Integer,
        db.ForeignKey("organizations.id"),
        nullable=False,
        index=True,
    )

    status = db.Column(db.String(40), nullable=False, default="pending")
    status_reason = db.Column(db.String(500), nullable=True)
    member_tier = db.Column(db.String(40), nullable=False, default="member")

    # 3-level hierarchy: a sub_member nests under a national_partner.
    parent_membership_id = db.Column(
        db.Integer,
        db.ForeignKey("network_memberships.id"),
        nullable=True,
    )

    region = db.Column(db.String(80), nullable=True)
    country = db.Column(db.String(80), nullable=True)

    # Membership materials (Phase 33 builds the workflow that fills these in)
    required_documents_status = db.Column(db.Text, nullable=True)  # JSON dict
    capacity_assessment_id = db.Column(
        db.Integer,
        db.ForeignKey("assessments.id"),
        nullable=True,
    )
    # Applicant's answers to the network's eligibility questionnaire.
    # Shape: {"registered_nonprofit": "yes", "global_south_hq": "yes", ...}
    eligibility_answers_json = db.Column(db.Text, nullable=True)

    # Lifecycle timestamps
    applied_at = db.Column(db.DateTime, nullable=True)
    reviewed_at = db.Column(db.DateTime, nullable=True)
    reviewed_by_user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id"),
        nullable=True,
    )
    joined_at = db.Column(db.DateTime, nullable=True)
    suspended_at = db.Column(db.DateTime, nullable=True)

    # Phase 33 — periodic due-diligence refresh. Gates grant disbursement
    # when stale. Set on approval to `joined_at + Network.assessment_refresh_months`.
    assessment_next_refresh_due_at = db.Column(db.DateTime, nullable=True)
    # Phase 33 — cooldown after rejection (default 6 months). Until this
    # date passes the org cannot re-apply to this network.
    cooldown_until = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(
        db.DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = db.Column(
        db.DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # --- JSON helpers ---
    def get_required_documents_status(self) -> dict:
        val = _json_load(self.required_documents_status)
        return val if isinstance(val, dict) else {}

    def set_required_documents_status(self, value) -> None:
        self.required_documents_status = _json_dump(value or {})

    def get_eligibility_answers(self) -> dict:
        val = _json_load(self.eligibility_answers_json)
        return val if isinstance(val, dict) else {}

    def set_eligibility_answers(self, value) -> None:
        self.eligibility_answers_json = _json_dump(value or {})

    # --- Freshness check ---
    def is_assessment_fresh(self) -> bool:
        """True if no refresh is due yet. Used as a grant-disbursement gate."""
        if not self.assessment_next_refresh_due_at:
            return self.status == "active"  # never refreshed yet but active
        return datetime.now(timezone.utc) < self.assessment_next_refresh_due_at

    # --- State-machine transitions ---
    # Every transition writes an AuditChainEntry. Each is best-effort
    # (the audit module catches errors); we don't block the transition
    # if the audit chain write fails.
    def _anchor(self, *, action: str, actor_email: str | None, details: dict | None = None) -> None:
        try:
            from app.models import AuditChainEntry
            AuditChainEntry.append(
                action=action,
                actor_email=actor_email,
                subject_kind="network_membership",
                subject_id=self.id,
                details=details or {},
            )
        except Exception:
            # Best-effort. The membership state still transitions.
            pass

    def submit_for_review(self, *, actor_email: str | None = None) -> bool:
        """Transition pending → under_review. Returns True on success."""
        if self.status != "pending":
            return False
        self.status = "under_review"
        self.applied_at = self.applied_at or datetime.now(timezone.utc)
        db.session.flush()
        self._anchor(
            action="network.membership.submitted_for_review",
            actor_email=actor_email,
            details={"network_id": self.network_id, "org_id": self.org_id},
        )
        return True

    def approve(self, *, by_user_id: int, actor_email: str | None = None) -> bool:
        """Transition under_review → active. Sets joined_at + computes
        the next refresh-due date from the parent Network's cadence."""
        if self.status not in ("pending", "under_review"):
            return False
        from datetime import timedelta
        now = datetime.now(timezone.utc)
        self.status = "active"
        self.reviewed_at = now
        self.reviewed_by_user_id = by_user_id
        self.joined_at = self.joined_at or now
        # Compute next refresh-due from the parent network's cadence.
        try:
            from app.models import Network
            net = Network.query.get(self.network_id)
            months = (net.assessment_refresh_months or 24) if net else 24
            # Approximate a month as 30 days — fine for the gating purpose.
            self.assessment_next_refresh_due_at = now + timedelta(days=30 * months)
        except Exception:
            self.assessment_next_refresh_due_at = now + timedelta(days=30 * 24)
        db.session.flush()
        self._anchor(
            action="network.membership.approved",
            actor_email=actor_email,
            details={
                "network_id": self.network_id,
                "org_id": self.org_id,
                "tier": self.member_tier,
                "reviewed_by_user_id": by_user_id,
            },
        )
        return True

    def reject(
        self,
        *,
        by_user_id: int,
        reason: str,
        actor_email: str | None = None,
        cooldown_months: int = 6,
    ) -> bool:
        """Transition under_review → rejected. Sets cooldown_until."""
        if self.status not in ("pending", "under_review"):
            return False
        from datetime import timedelta
        now = datetime.now(timezone.utc)
        self.status = "rejected"
        self.status_reason = (reason or "")[:500]
        self.reviewed_at = now
        self.reviewed_by_user_id = by_user_id
        self.cooldown_until = now + timedelta(days=30 * cooldown_months)
        db.session.flush()
        self._anchor(
            action="network.membership.rejected",
            actor_email=actor_email,
            details={
                "network_id": self.network_id,
                "org_id": self.org_id,
                "reason": self.status_reason,
                "reviewed_by_user_id": by_user_id,
            },
        )
        return True

    def suspend(
        self,
        *,
        by_user_id: int,
        reason: str,
        actor_email: str | None = None,
    ) -> bool:
        """Transition active → suspended (for cause)."""
        if self.status != "active":
            return False
        self.status = "suspended"
        self.status_reason = (reason or "")[:500]
        self.suspended_at = datetime.now(timezone.utc)
        db.session.flush()
        self._anchor(
            action="network.membership.suspended",
            actor_email=actor_email,
            details={
                "network_id": self.network_id,
                "org_id": self.org_id,
                "reason": self.status_reason,
                "by_user_id": by_user_id,
            },
        )
        return True

    def expel(
        self,
        *,
        by_user_id: int,
        reason: str,
        actor_email: str | None = None,
    ) -> bool:
        """Transition suspended → expelled (terminal)."""
        if self.status != "suspended":
            return False
        self.status = "expelled"
        self.status_reason = (reason or "")[:500]
        db.session.flush()
        self._anchor(
            action="network.membership.expelled",
            actor_email=actor_email,
            details={
                "network_id": self.network_id,
                "org_id": self.org_id,
                "reason": self.status_reason,
                "by_user_id": by_user_id,
            },
        )
        return True

    # --- Public dict ---
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "network_id": self.network_id,
            "org_id": self.org_id,
            "status": self.status,
            "status_reason": self.status_reason,
            "member_tier": self.member_tier,
            "parent_membership_id": self.parent_membership_id,
            "region": self.region,
            "country": self.country,
            "required_documents_status": self.get_required_documents_status(),
            "eligibility_answers": self.get_eligibility_answers(),
            "capacity_assessment_id": self.capacity_assessment_id,
            "applied_at": self.applied_at.isoformat() if self.applied_at else None,
            "reviewed_at": self.reviewed_at.isoformat() if self.reviewed_at else None,
            "reviewed_by_user_id": self.reviewed_by_user_id,
            "joined_at": self.joined_at.isoformat() if self.joined_at else None,
            "suspended_at": self.suspended_at.isoformat() if self.suspended_at else None,
            "assessment_next_refresh_due_at": (
                self.assessment_next_refresh_due_at.isoformat()
                if self.assessment_next_refresh_due_at else None
            ),
            "cooldown_until": (
                self.cooldown_until.isoformat() if self.cooldown_until else None
            ),
            "is_assessment_fresh": self.is_assessment_fresh(),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
