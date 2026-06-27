"""Proximate Funding Round — Phase 649 (June 2026).

A "round" is the Proximate analogue of NEAR's emergency declaration. It
marks a funding cycle: trigger (disaster / donor / programme), envelope
($), duration, and the OB signers who activated it.

Once activated, every Proximate action (endorser approve, partner clear,
intervention open, monitoring flag) that happens between `activated_at`
and `closed_at` is part of the round. We use **temporal** linkage rather
than threading a round_id FK through every model — the audit chain is
already date-stamped, so querying it by date range gives us the round's
activity for an end-of-round report without schema changes.

State machine:
    draft        → in_review   (drafter submits for signature)
    in_review    → active      (≥ 2 OB signers; no rejection)
    in_review    → cancelled   (any signer rejects)
    active       → closed      (drafter or OB explicitly closes)

Signers must affirm declared_no_coi=True. Recusals (no_coi=False) don't
count toward the threshold but don't block the chain either.

See: docs/PROXIMATE_FUND_DESIGN.md §2, Adeso SoP 12+13.
"""

from datetime import datetime, timezone

from app.extensions import db


ROUND_STATUSES = ("draft", "in_review", "active", "cancelled", "closed")
ROUND_TRIGGER_TYPES = ("disaster", "donor_commitment", "programme_cycle")
SIGNATURE_STATUSES = ("pending", "signed", "recused", "rejected")

# How many OB signers must affirm before the round goes active. Hard-coded
# to 2 for v1 — matches Adeso's pre-platform sign-off pattern. If a future
# tenant needs a different floor, lift it to a Network column.
ROUND_SIGNERS_REQUIRED = 2


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ===============================================================
# ProximateRound
# ===============================================================

class ProximateRound(db.Model):
    """A Proximate funding cycle. Multi-sig activation; audit-anchored."""

    __tablename__ = "proximate_rounds"
    __table_args__ = (
        db.Index("ix_proximate_rounds_network_status", "network_id", "status"),
    )

    id = db.Column(db.Integer, primary_key=True)
    network_id = db.Column(
        db.Integer, db.ForeignKey("networks.id"), nullable=False, index=True,
    )

    title = db.Column(db.String(300), nullable=False)
    title_ar = db.Column(db.String(300), nullable=True)
    trigger_type = db.Column(db.String(40), nullable=False)  # disaster / donor / programme
    trigger_summary = db.Column(db.Text, nullable=True)

    donor_name = db.Column(db.String(200), nullable=True)
    envelope_usd = db.Column(db.Float, nullable=True)
    expected_duration_days = db.Column(db.Integer, nullable=True)
    target_country = db.Column(db.String(3), nullable=False, default="SD")
    target_region = db.Column(db.String(120), nullable=True)

    status = db.Column(
        db.String(40), nullable=False, default="draft", index=True,
    )

    drafted_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    drafted_at = db.Column(db.DateTime, nullable=False, default=_now)
    submitted_at = db.Column(db.DateTime, nullable=True)
    activated_at = db.Column(db.DateTime, nullable=True)
    cancelled_at = db.Column(db.DateTime, nullable=True)
    closed_at = db.Column(db.DateTime, nullable=True)

    cancellation_reason = db.Column(db.Text, nullable=True)
    closing_summary = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, nullable=False, default=_now)
    updated_at = db.Column(db.DateTime, nullable=False, default=_now, onupdate=_now)

    # ---- properties -----------------------------------------------------

    @property
    def signatures(self):
        return ProximateRoundSignature.query.filter_by(round_id=self.id).all()

    @property
    def signed_count(self) -> int:
        return ProximateRoundSignature.query.filter_by(
            round_id=self.id, status="signed",
        ).count()

    @property
    def rejected_count(self) -> int:
        return ProximateRoundSignature.query.filter_by(
            round_id=self.id, status="rejected",
        ).count()

    @property
    def ready_for_activation(self) -> bool:
        return (
            self.status == "in_review"
            and self.signed_count >= ROUND_SIGNERS_REQUIRED
            and self.rejected_count == 0
        )

    # ---- transitions ----------------------------------------------------

    def submit(self) -> None:
        """draft → in_review. Caller must hash-chain the audit row."""
        if self.status != "draft":
            raise ValueError(f"Cannot submit a {self.status!r} round")
        self.status = "in_review"
        self.submitted_at = _now()

    def activate(self) -> None:
        """in_review → active. Caller checks ready_for_activation first."""
        if not self.ready_for_activation:
            raise ValueError("Threshold not yet met")
        self.status = "active"
        self.activated_at = _now()

    def cancel(self, reason: str) -> None:
        """in_review → cancelled. Any signer reject or drafter withdraw."""
        if self.status not in ("draft", "in_review"):
            raise ValueError(f"Cannot cancel a {self.status!r} round")
        self.status = "cancelled"
        self.cancelled_at = _now()
        self.cancellation_reason = reason

    def close(self, summary: str | None = None) -> None:
        """active → closed. Cycle is over; round is the audit-chain
        anchor for a date-range query against subsequent reporting."""
        if self.status != "active":
            raise ValueError(f"Cannot close a {self.status!r} round")
        self.status = "closed"
        self.closed_at = _now()
        if summary:
            self.closing_summary = summary[:5000]

    # ---- serialization --------------------------------------------------

    def to_dict(self, *, include_signatures: bool = False) -> dict:
        data = {
            "id": self.id,
            "network_id": self.network_id,
            "title": self.title,
            "title_ar": self.title_ar,
            "trigger_type": self.trigger_type,
            "trigger_summary": self.trigger_summary,
            "donor_name": self.donor_name,
            "envelope_usd": self.envelope_usd,
            "expected_duration_days": self.expected_duration_days,
            "target_country": self.target_country,
            "target_region": self.target_region,
            "status": self.status,
            "drafted_by_user_id": self.drafted_by_user_id,
            "drafted_at": self.drafted_at.isoformat() if self.drafted_at else None,
            "submitted_at": self.submitted_at.isoformat() if self.submitted_at else None,
            "activated_at": self.activated_at.isoformat() if self.activated_at else None,
            "cancelled_at": self.cancelled_at.isoformat() if self.cancelled_at else None,
            "closed_at": self.closed_at.isoformat() if self.closed_at else None,
            "cancellation_reason": self.cancellation_reason,
            "closing_summary": self.closing_summary,
            "signed_count": self.signed_count,
            "signers_required": ROUND_SIGNERS_REQUIRED,
            "ready_for_activation": self.ready_for_activation,
        }
        if include_signatures:
            data["signatures"] = [s.to_dict() for s in self.signatures]
        return data


# ===============================================================
# ProximateRoundSignature
# ===============================================================

class ProximateRoundSignature(db.Model):
    """An OB member's affirmation/recusal/rejection on a round."""

    __tablename__ = "proximate_round_signatures"
    __table_args__ = (
        db.UniqueConstraint("round_id", "user_id",
                            name="uq_proximate_round_sig_per_user"),
        db.Index("ix_proximate_round_sig_status", "round_id", "status"),
    )

    id = db.Column(db.Integer, primary_key=True)
    round_id = db.Column(
        db.Integer, db.ForeignKey("proximate_rounds.id"),
        nullable=False, index=True,
    )
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False, index=True,
    )

    status = db.Column(
        db.String(40), nullable=False, default="pending", index=True,
    )
    # Per-NEAR governance: signers must affirm no COI at sign time. The
    # boolean here is what they ticked when they signed.
    declared_no_coi = db.Column(db.Boolean, nullable=True)
    note = db.Column(db.Text, nullable=True)

    acted_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=_now)

    def sign(self, *, declared_no_coi: bool, note: str | None = None) -> None:
        if not declared_no_coi:
            # No COI ticked → this is a recusal, not a sign-off.
            self.status = "recused"
        else:
            self.status = "signed"
        self.declared_no_coi = declared_no_coi
        self.note = (note or "")[:1000] or None
        self.acted_at = _now()

    def reject(self, *, reason: str) -> None:
        self.status = "rejected"
        self.note = (reason or "")[:1000] or None
        self.acted_at = _now()

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "round_id": self.round_id,
            "user_id": self.user_id,
            "status": self.status,
            "declared_no_coi": self.declared_no_coi,
            "note": self.note,
            "acted_at": self.acted_at.isoformat() if self.acted_at else None,
        }
