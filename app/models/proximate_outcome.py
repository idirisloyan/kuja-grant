"""Proximate outcome attestation — Phase 678 (June 2026).

Per-disbursement 90-day follow-up that captures whether the money
actually helped, not just whether the process was followed.

Spawned automatically when a disbursement closes (status ∈
{verified, flagged}). Partner submits via dual-auth (token URL or
logged-in Kuja session) — same pattern as Phase 652.

The presence of an *attestation* row is the obligation. `submitted_at`
flips when the partner answers; `verdict` flips when the OB reviews.
Quarterly counterfactual reflection (Phase 685) lands in the same
row's `counterfactual_reflection` text column.

See: docs/PROXIMATE_FUND_DESIGN.md §4 Flow E, conversation Phase
678 plan, docs/PROXIMATE_BACKLOG.md "in flight".
"""

from datetime import datetime, timezone, timedelta

from app.extensions import db


# Days after disbursement close before the 90-day attestation is due
DEFAULT_OUTCOME_WINDOW_DAYS = 90

OUTCOME_STATUSES = (
    "pending",      # auto-created, partner has not yet attested
    "submitted",    # partner attested, OB has not yet reviewed
    "verified",     # OB read and accepted the attestation
    "disputed",     # OB read and raised concerns
)


class ProximateOutcomeAttestation(db.Model):
    """Partner's 90-day post-disbursement attestation of impact."""

    __tablename__ = "proximate_outcome_attestations"
    __table_args__ = (
        db.Index(
            "ix_proximate_outcomes_due",
            "due_at", "status",
        ),
        db.Index(
            "ix_proximate_outcomes_disbursement",
            "disbursement_id",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    network_id = db.Column(
        db.Integer, db.ForeignKey("networks.id"),
        nullable=False, index=True,
    )
    disbursement_id = db.Column(
        db.Integer, db.ForeignKey("proximate_disbursements.id"),
        nullable=False, unique=True,
    )
    partner_id = db.Column(
        db.Integer, db.ForeignKey("proximate_partners.id"),
        nullable=False, index=True,
    )
    round_id = db.Column(
        db.Integer, db.ForeignKey("proximate_rounds.id"),
        nullable=True,
    )

    spawned_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    due_at = db.Column(db.DateTime(timezone=True), nullable=False)
    report_token = db.Column(db.String(64), nullable=True, unique=True)

    submitted_at = db.Column(db.DateTime(timezone=True), nullable=True)
    submitted_via = db.Column(db.String(20), nullable=True)  # 'token' | 'session'
    status = db.Column(
        db.String(40), nullable=False, default="pending", index=True,
    )

    # The 3 outcome questions. Stored as JSON so question shape can
    # evolve without a schema change.
    answers_json = db.Column(db.Text, nullable=True)
    voice_doc_id = db.Column(db.Integer, db.ForeignKey("documents.id"), nullable=True)
    photo_doc_id = db.Column(db.Integer, db.ForeignKey("documents.id"), nullable=True)
    voice_transcript = db.Column(db.Text, nullable=True)

    # Phase 685 — quarterly counterfactual reflection lands here.
    counterfactual_reflection = db.Column(db.Text, nullable=True)

    # OB verdict
    verdict_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    verdict_at = db.Column(db.DateTime(timezone=True), nullable=True)
    verdict_notes = db.Column(db.Text, nullable=True)

    # Phase 660-style ack back to the partner
    ack_message = db.Column(db.Text, nullable=True)
    ack_message_at = db.Column(db.DateTime(timezone=True), nullable=True)

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

    @classmethod
    def make_report_token(cls):
        import secrets
        return secrets.token_urlsafe(32)

    def is_overdue(self) -> bool:
        if self.submitted_at is not None:
            return False
        due = (
            self.due_at.replace(tzinfo=timezone.utc)
            if self.due_at.tzinfo is None else self.due_at
        )
        return datetime.now(timezone.utc) > due

    def get_answers(self) -> dict:
        if not self.answers_json:
            return {}
        import json as _json
        try:
            v = _json.loads(self.answers_json)
            return v if isinstance(v, dict) else {}
        except (ValueError, TypeError):
            return {}

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "network_id": self.network_id,
            "disbursement_id": self.disbursement_id,
            "partner_id": self.partner_id,
            "round_id": self.round_id,
            "spawned_at": self.spawned_at.isoformat() if self.spawned_at else None,
            "due_at": self.due_at.isoformat() if self.due_at else None,
            "report_token": self.report_token,
            "submitted_at": (
                self.submitted_at.isoformat() if self.submitted_at else None
            ),
            "submitted_via": self.submitted_via,
            "status": self.status,
            "overdue": self.is_overdue(),
            "answers": self.get_answers(),
            "voice_doc_id": self.voice_doc_id,
            "photo_doc_id": self.photo_doc_id,
            "voice_transcript": self.voice_transcript,
            "counterfactual_reflection": self.counterfactual_reflection,
            "verdict_by_user_id": self.verdict_by_user_id,
            "verdict_at": self.verdict_at.isoformat() if self.verdict_at else None,
            "verdict_notes": self.verdict_notes,
            "ack_message": self.ack_message,
            "ack_message_at": (
                self.ack_message_at.isoformat() if self.ack_message_at else None
            ),
        }
