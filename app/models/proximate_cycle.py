"""Proximate grant-cycle models — 2026-07-24.

Closes the three structural holes between "we vetted a partner" and
"money left the building". Before this, the round lifecycle went

    endorsed → bank_verified → disbursed

which skipped the two steps that actually decide and authorise the
money: the panel meeting where partners are selected and amounts set,
and the agreement that follows it. Disbursement was therefore possible
with no recorded decision behind it.

Three models:

  ProximatePanelMeeting  — the formal sessions. The SoP names three
                           (orientation, deliberation, awarding) but
                           reality adds follow-ups, so the type is an
                           enum and the count is not fixed.

  ProximateAward         — one panel decision about one partner in one
                           cycle. Requested / recommended / approved are
                           three different numbers and all three are
                           kept: "we asked for X and got Y" is the
                           question partners and donors both ask later.

  ProximateContract      — the agreement between award and payment.
                           PandaDoc stays the signing tool; this tracks
                           its status and stores the final PDF so the
                           record does not live in someone's inbox.

Every column is nullable so the boot-time reconciler can add them to a
populated production table without a backfill.
"""

from datetime import datetime, timezone

from app.extensions import db


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ===============================================================
# Panel meetings
# ===============================================================

MEETING_TYPES = (
    "orientation",        # SoP meeting 1 — values, roles, criteria, COI
    "nomination_review",  # SoP meeting 2 — deliberation + initial vetting
    "awarding",           # SoP meeting 3 — allocations
    "dd_feedback",        # secretariat brings due-diligence findings back
    "implementation",     # follow-up after money moved
    "closeout",
    "ad_hoc",
)


class ProximatePanelMeeting(db.Model):
    """A panel session. Minutes and decisions live here, not in email."""

    __tablename__ = "proximate_panel_meetings"
    __table_args__ = (
        db.Index("ix_prx_panel_meeting_round", "round_id", "held_at"),
    )

    id = db.Column(db.Integer, primary_key=True)
    network_id = db.Column(
        db.Integer, db.ForeignKey("networks.id"), nullable=False, index=True,
    )
    round_id = db.Column(
        db.Integer, db.ForeignKey("proximate_rounds.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    meeting_number = db.Column(db.Integer, nullable=True)
    meeting_type = db.Column(db.String(30), nullable=True, default="ad_hoc")
    title = db.Column(db.String(300), nullable=True)
    held_at = db.Column(db.DateTime, nullable=True)

    # Attendance is stored as a JSON list of {panel_member_id, name,
    # present: bool, recused: bool} rather than a join table — the roster
    # is small, always read whole, and a recusal only means anything in
    # the context of the meeting it happened in.
    attendees_json = db.Column(db.Text, nullable=True)

    agenda = db.Column(db.Text, nullable=True)
    decisions = db.Column(db.Text, nullable=True)
    minutes = db.Column(db.Text, nullable=True)
    action_items = db.Column(db.Text, nullable=True)
    coi_notes = db.Column(db.Text, nullable=True)

    recording_doc_id = db.Column(
        db.Integer, db.ForeignKey("documents.id"), nullable=True,
    )
    minutes_doc_id = db.Column(
        db.Integer, db.ForeignKey("documents.id"), nullable=True,
    )

    created_by_user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True,
    )
    created_at = db.Column(db.DateTime, nullable=False, default=_now)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=_now, onupdate=_now,
    )

    def to_dict(self) -> dict:
        import json
        try:
            attendees = json.loads(self.attendees_json) if self.attendees_json else []
        except (ValueError, TypeError):
            attendees = []
        return {
            "id": self.id,
            "round_id": self.round_id,
            "meeting_number": self.meeting_number,
            "meeting_type": self.meeting_type,
            "title": self.title,
            "held_at": self.held_at.isoformat() if self.held_at else None,
            "attendees": attendees,
            "attendee_count": len(attendees),
            "agenda": self.agenda,
            "decisions": self.decisions,
            "minutes": self.minutes,
            "action_items": self.action_items,
            "coi_notes": self.coi_notes,
            "has_recording": bool(self.recording_doc_id),
            "has_minutes_doc": bool(self.minutes_doc_id),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ===============================================================
# Award decisions
# ===============================================================

AWARD_DECISIONS = (
    "pending",       # on the shortlist, panel has not ruled
    "awarded",
    "not_awarded",
    "clarification",  # sent back to the partner for more information
    "deferred",       # held for a later cycle
)

# How the decision was arrived at. `secretariat_recorded` is deliberately
# a first-class option rather than a fudge: connectivity in Sudan means
# the panel sometimes decides on a call and someone writes it down after.
# It is allowed, but it carries an evidence requirement — see
# `decision_is_attributable` below.
AWARD_METHODS = (
    "consensus",
    "no_objection",
    "recorded_vote",
    "chair_confirmation",
    "secretariat_recorded",
)


class ProximateAward(db.Model):
    """One panel decision about one partner in one cycle."""

    __tablename__ = "proximate_awards"
    __table_args__ = (
        db.UniqueConstraint("round_id", "partner_id", name="uq_prx_award"),
        db.Index("ix_prx_award_round_decision", "round_id", "decision"),
    )

    id = db.Column(db.Integer, primary_key=True)
    network_id = db.Column(
        db.Integer, db.ForeignKey("networks.id"), nullable=False, index=True,
    )
    round_id = db.Column(
        db.Integer, db.ForeignKey("proximate_rounds.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    partner_id = db.Column(
        db.Integer, db.ForeignKey("proximate_partners.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    meeting_id = db.Column(
        db.Integer,
        db.ForeignKey("proximate_panel_meetings.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )

    # Three different numbers, all worth keeping.
    requested_amount_usd = db.Column(db.Float, nullable=True)
    recommended_amount_usd = db.Column(db.Float, nullable=True)
    approved_amount_usd = db.Column(db.Float, nullable=True)
    currency = db.Column(db.String(3), nullable=True, default="USD")
    amount_reason = db.Column(db.Text, nullable=True)

    decision = db.Column(
        db.String(20), nullable=True, default="pending", index=True,
    )
    decision_method = db.Column(db.String(30), nullable=True)
    panel_comments = db.Column(db.Text, nullable=True)

    # JSON list of {panel_member_id, name, reason} for anyone who stood
    # out of this specific decision.
    recusals_json = db.Column(db.Text, nullable=True)
    # JSON list of {panel_member_id, name, confirmed_at, channel} — who
    # actually confirmed, and how (in-system, WhatsApp, call).
    confirmations_json = db.Column(db.Text, nullable=True)

    evidence_doc_id = db.Column(
        db.Integer, db.ForeignKey("documents.id"), nullable=True,
    )
    evidence_note = db.Column(db.Text, nullable=True)

    decided_at = db.Column(db.DateTime, nullable=True)
    recorded_by_user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True,
    )
    created_at = db.Column(db.DateTime, nullable=False, default=_now)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=_now, onupdate=_now,
    )

    # ---- integrity ------------------------------------------------------

    def _json_list(self, raw) -> list:
        import json
        try:
            v = json.loads(raw) if raw else []
            return v if isinstance(v, list) else []
        except (ValueError, TypeError):
            return []

    @property
    def recusals(self) -> list:
        return self._json_list(self.recusals_json)

    @property
    def confirmations(self) -> list:
        return self._json_list(self.confirmations_json)

    @property
    def decision_is_attributable(self) -> bool:
        """Can this decision be traced back to the panel, not the staff?

        A decision the secretariat recorded on the panel's behalf needs
        something behind it — a meeting it belongs to, an uploaded
        recording or minute, or at least one panel member confirming.
        Without that, "the panel decided" is an unfalsifiable claim, and
        panel independence is the one thing this fund sells to donors.

        Decisions made through any other method are attributable by
        construction, because the panel itself is the actor.
        """
        if self.decision_method != "secretariat_recorded":
            return True
        return bool(
            self.meeting_id
            or self.evidence_doc_id
            or self.confirmations
        )

    def to_dict(self, partner_name: str | None = None) -> dict:
        return {
            "id": self.id,
            "round_id": self.round_id,
            "partner_id": self.partner_id,
            "partner_name": partner_name,
            "meeting_id": self.meeting_id,
            "requested_amount_usd": self.requested_amount_usd,
            "recommended_amount_usd": self.recommended_amount_usd,
            "approved_amount_usd": self.approved_amount_usd,
            "currency": self.currency or "USD",
            "amount_reason": self.amount_reason,
            "decision": self.decision or "pending",
            "decision_method": self.decision_method,
            "panel_comments": self.panel_comments,
            "recusals": self.recusals,
            "confirmations": self.confirmations,
            "confirmation_count": len(self.confirmations),
            "has_evidence": bool(self.evidence_doc_id),
            "evidence_note": self.evidence_note,
            "decision_is_attributable": self.decision_is_attributable,
            "decided_at": self.decided_at.isoformat() if self.decided_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ===============================================================
# Contracting
# ===============================================================

CONTRACT_STATUSES = (
    "not_started",
    "drafting",
    "sent",           # out for signature
    "partner_signed",
    "adeso_signed",
    "completed",
    "void",
)


class ProximateContract(db.Model):
    """The agreement between an award and a payment.

    PandaDoc remains the signing tool — replacing it was never the point.
    This row holds the data the agreement is generated from, tracks where
    the signature process is, and stores the final signed PDF so the
    authoritative copy is not an attachment in somebody's mailbox.
    """

    __tablename__ = "proximate_contracts"
    __table_args__ = (
        db.UniqueConstraint("award_id", name="uq_prx_contract_award"),
    )

    id = db.Column(db.Integer, primary_key=True)
    network_id = db.Column(
        db.Integer, db.ForeignKey("networks.id"), nullable=False, index=True,
    )
    award_id = db.Column(
        db.Integer, db.ForeignKey("proximate_awards.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    partner_id = db.Column(
        db.Integer, db.ForeignKey("proximate_partners.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    round_id = db.Column(
        db.Integer, db.ForeignKey("proximate_rounds.id", ondelete="CASCADE"),
        nullable=True, index=True,
    )

    # Official names are captured separately in both scripts. A partner's
    # registration is in Arabic; the agreement and the bank may need the
    # Latin form. Storing one and transliterating on the fly loses the
    # legal name, so both are first-class.
    official_name_ar = db.Column(db.String(300), nullable=True)
    official_name_en = db.Column(db.String(300), nullable=True)

    signatory_name = db.Column(db.String(200), nullable=True)
    signatory_title = db.Column(db.String(160), nullable=True)
    signatory_phone = db.Column(db.String(50), nullable=True)
    signatory_email = db.Column(db.String(320), nullable=True)
    signatory_id_number = db.Column(db.String(80), nullable=True)

    approved_amount_usd = db.Column(db.Float, nullable=True)
    local_currency = db.Column(db.String(8), nullable=True)
    local_amount = db.Column(db.Float, nullable=True)
    duration_days = db.Column(db.Integer, nullable=True)
    reporting_deadline = db.Column(db.Date, nullable=True)
    arabic_annex_required = db.Column(db.Boolean, nullable=True, default=True)

    status = db.Column(
        db.String(20), nullable=True, default="not_started", index=True,
    )
    pandadoc_id = db.Column(db.String(120), nullable=True)
    pandadoc_url = db.Column(db.String(600), nullable=True)
    pandadoc_status = db.Column(db.String(60), nullable=True)

    sent_at = db.Column(db.DateTime, nullable=True)
    partner_signed_at = db.Column(db.DateTime, nullable=True)
    adeso_signed_at = db.Column(db.DateTime, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)
    void_reason = db.Column(db.Text, nullable=True)

    signed_doc_id = db.Column(
        db.Integer, db.ForeignKey("documents.id"), nullable=True,
    )

    created_by_user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True,
    )
    created_at = db.Column(db.DateTime, nullable=False, default=_now)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=_now, onupdate=_now,
    )

    @property
    def is_complete(self) -> bool:
        return self.status == "completed" or bool(self.completed_at)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "award_id": self.award_id,
            "partner_id": self.partner_id,
            "round_id": self.round_id,
            "official_name_ar": self.official_name_ar,
            "official_name_en": self.official_name_en,
            "signatory_name": self.signatory_name,
            "signatory_title": self.signatory_title,
            "signatory_phone": self.signatory_phone,
            "signatory_email": self.signatory_email,
            "approved_amount_usd": self.approved_amount_usd,
            "local_currency": self.local_currency,
            "local_amount": self.local_amount,
            "duration_days": self.duration_days,
            "reporting_deadline": (
                self.reporting_deadline.isoformat()
                if self.reporting_deadline else None
            ),
            "arabic_annex_required": bool(self.arabic_annex_required),
            "status": self.status or "not_started",
            "pandadoc_url": self.pandadoc_url,
            "pandadoc_status": self.pandadoc_status,
            "sent_at": self.sent_at.isoformat() if self.sent_at else None,
            "partner_signed_at": (
                self.partner_signed_at.isoformat()
                if self.partner_signed_at else None
            ),
            "adeso_signed_at": (
                self.adeso_signed_at.isoformat()
                if self.adeso_signed_at else None
            ),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "has_signed_doc": bool(self.signed_doc_id),
            "is_complete": self.is_complete,
        }
