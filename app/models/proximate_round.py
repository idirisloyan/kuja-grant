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

# Operational phases — the real Proximate process, in order. Distinct
# from ROUND_STATUSES (see the `phase` column for why they are separate).
ROUND_PHASES = (
    "context_review",   # area picked, rationale being written
    "panel_setup",      # finding + vetting panel members
    "nominations",      # panel members nominating partners
    "due_diligence",    # secretariat vetting nominated partners
    "awarding",         # panel meeting → who gets what
    "contracting",      # agreements out for signature
    "disbursement",     # money moving
    "implementation",   # clock running, evidence arriving
    "reporting",        # partner reports in review
    "closeout",         # cycle being wrapped up
)

# Evidence sources for area selection (SoP: how Proximate picks where to
# work). Stored as slugs in `area_sources_json`.
AREA_SOURCES = (
    "local_networks",
    "community_information",
    "humanitarian_reports",
    "internal_analysis",
    "targeted_mapping",
)

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

    # Phase 710 — donor is now a first-class FK to ProximateDonor.
    # `donor_name` is retained as a display cache so historical rows
    # keep rendering; new rows should always set donor_id and the
    # denormalized name is regenerated from the linked donor.
    donor_id = db.Column(
        db.Integer,
        db.ForeignKey("proximate_donors.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    donor_name = db.Column(db.String(200), nullable=True)
    envelope_usd = db.Column(db.Float, nullable=True)
    expected_duration_days = db.Column(db.Integer, nullable=True)
    target_country = db.Column(db.String(3), nullable=False, default="SD")
    # Phase 670 — tranche plan stored as JSON list of
    # {label, target_amount_usd, target_date (ISO), notes}. Pure annotation
    # for v1; disbursements aren't auto-linked to specific tranches.
    tranche_schedule_json = db.Column(db.Text, nullable=True)
    # Phase 686 — donor co-funding shares. JSON list of:
    # {donor_id, committed_usd, restricted_to_partner_id?, restricted_to_purpose?}
    # Sum of committed_usd should equal envelope_usd for a fully-pledged
    # round. Disbursements to a partner with a restricted share validate
    # that the new amount fits within remaining restricted budget.
    donor_shares_json = db.Column(db.Text, nullable=True)
    target_region = db.Column(db.String(120), nullable=True)

    # ---- Cycle setup (2026-07-24) ---------------------------------------
    # The cycle now starts where Proximate actually starts it: pick the
    # area and the grant size, THEN find panel members, THEN partners.
    # Everything below is nullable so existing rounds keep loading.
    target_locality = db.Column(db.String(160), nullable=True)
    # "Size of grant for the round" — the per-partner award size this
    # cycle is built around. Not a hard cap: the panel can approve a
    # different amount and the award record keeps both numbers.
    grant_size_usd = db.Column(db.Float, nullable=True)

    # Why this area. The SoP names five evidence sources; we store the
    # rationale as prose and the sources as a JSON list of slugs so the
    # donor pack can show "selected on the basis of X, Y, Z".
    area_rationale = db.Column(db.Text, nullable=True)
    area_sources_json = db.Column(db.Text, nullable=True)
    security_note = db.Column(db.Text, nullable=True)
    market_risk_note = db.Column(db.Text, nullable=True)
    conflict_sensitivity_note = db.Column(db.Text, nullable=True)
    feasibility_note = db.Column(db.Text, nullable=True)

    # ---- Money: envelope is NOT what partners can receive ---------------
    # `envelope_usd` is what the donor allocated to this cycle. Some of it
    # pays for salaries, technology and administration. Only the remainder
    # can be awarded to partners, and awards are checked against it — see
    # `disbursable_usd` below. Getting this wrong over-commits the fund,
    # which is why it is computed rather than typed.
    admin_overhead_usd = db.Column(db.Float, nullable=True)

    # ---- Target dates: these WARN, they do not block --------------------
    # Ground reality delays cycles in Sudan. A missed target date is
    # information for the secretariat, never a reason the system refuses
    # to let them continue.
    target_award_date = db.Column(db.Date, nullable=True)
    target_disbursement_date = db.Column(db.Date, nullable=True)
    target_report_date = db.Column(db.Date, nullable=True)

    status = db.Column(
        db.String(40), nullable=False, default="draft", index=True,
    )

    # Operational phase, deliberately SEPARATE from `status`.
    #
    # `status` answers "is this cycle live?" (draft / in_review / active /
    # cancelled / closed) and gates the multi-sig activation. `phase`
    # answers "where in the process are we?" — a cycle can be `active`
    # while sitting in `awarding`. Collapsing the two would mean every
    # existing `status == 'active'` check silently changes meaning the
    # moment the secretariat moves to contracting, so they stay apart.
    phase = db.Column(
        db.String(30), nullable=True, default="context_review", index=True,
    )
    paused_at = db.Column(db.DateTime, nullable=True)
    pause_reason = db.Column(db.Text, nullable=True)

    drafted_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    drafted_at = db.Column(db.DateTime, nullable=False, default=_now)
    submitted_at = db.Column(db.DateTime, nullable=True)
    activated_at = db.Column(db.DateTime, nullable=True)
    cancelled_at = db.Column(db.DateTime, nullable=True)
    closed_at = db.Column(db.DateTime, nullable=True)

    cancellation_reason = db.Column(db.Text, nullable=True)
    closing_summary = db.Column(db.Text, nullable=True)

    # ---- closing over the top of unfinished business ---------------------
    # Closing is gated on the same readiness rule the closeout pack reports.
    # But a partner can become permanently unreachable — the organisation
    # dissolves, the person dies, the locality becomes inaccessible — and a
    # gate with no way through would either strand the cycle forever or, far
    # worse, push somebody to falsify a receipt confirmation to get past it.
    # So the gate can be overridden, never silently: the reason is required,
    # the blockers are snapshotted as they stood, and both print in the
    # closeout pack.
    close_override_reason = db.Column(db.Text, nullable=True)
    close_override_by_user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True,
    )
    close_overridden_at = db.Column(db.DateTime, nullable=True)
    close_blockers_json = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, nullable=False, default=_now)
    updated_at = db.Column(db.DateTime, nullable=False, default=_now, onupdate=_now)

    # ---- money ----------------------------------------------------------

    @property
    def disbursable_usd(self) -> float:
        """What partners can actually be awarded from this cycle.

        The donor's envelope is NOT this number. Salaries, technology and
        administration come out of the same envelope first. Treating the
        two as interchangeable is how a fund over-commits, so the split is
        computed here once and every award check reads it.
        """
        envelope = float(self.envelope_usd or 0)
        overhead = float(self.admin_overhead_usd or 0)
        return max(0.0, envelope - overhead)

    @property
    def awarded_usd(self) -> float:
        """Sum of approved awards on this cycle (excludes declined ones)."""
        from app.models.proximate_cycle import ProximateAward
        rows = ProximateAward.query.filter_by(
            round_id=self.id, decision="awarded",
        ).all()
        return float(sum(float(a.approved_amount_usd or 0) for a in rows))

    @property
    def uncommitted_usd(self) -> float:
        return self.disbursable_usd - self.awarded_usd

    def money_summary(self) -> dict:
        return {
            "envelope_usd": float(self.envelope_usd or 0),
            "admin_overhead_usd": float(self.admin_overhead_usd or 0),
            "disbursable_usd": self.disbursable_usd,
            "awarded_usd": self.awarded_usd,
            "uncommitted_usd": self.uncommitted_usd,
            "grant_size_usd": float(self.grant_size_usd) if self.grant_size_usd else None,
        }

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

    def close(self, summary: str | None = None, *,
              override_reason: str | None = None,
              override_by_user_id: int | None = None,
              blockers: list | None = None) -> None:
        """active → closed. Cycle is over; round is the audit-chain
        anchor for a date-range query against subsequent reporting.

        The caller is responsible for computing readiness and refusing to
        call this without an `override_reason` when blockers remain — the
        rule lives in the route because it needs the award, contract,
        disbursement and evidence tables. What this method guarantees is
        that an override can never be applied without being recorded.
        """
        if self.status != "active":
            raise ValueError(f"Cannot close a {self.status!r} round")
        self.status = "closed"
        self.closed_at = _now()
        if summary:
            self.closing_summary = summary[:5000]
        if override_reason:
            import json as _json
            self.close_override_reason = override_reason[:2000]
            self.close_override_by_user_id = override_by_user_id
            self.close_overridden_at = _now()
            # Snapshot what was unresolved AT THE MOMENT of closing. Deriving
            # it later would silently change as the underlying records move,
            # and the whole point is to show what was accepted on the day.
            self.close_blockers_json = _json.dumps(blockers or [])

    @property
    def closed_over_blockers(self) -> bool:
        """Was this cycle closed with unfinished business, on the record?"""
        return bool(self.close_overridden_at)

    def close_blockers(self) -> list:
        if not self.close_blockers_json:
            return []
        import json as _json
        try:
            v = _json.loads(self.close_blockers_json)
            return v if isinstance(v, list) else []
        except (ValueError, TypeError):
            return []

    # ---- serialization --------------------------------------------------

    def _tranche_schedule(self) -> list:
        if not self.tranche_schedule_json:
            return []
        import json as _json
        try:
            v = _json.loads(self.tranche_schedule_json)
            return v if isinstance(v, list) else []
        except (ValueError, TypeError):
            return []

    def _donor_shares(self) -> list:
        if not self.donor_shares_json:
            return []
        import json as _json
        try:
            v = _json.loads(self.donor_shares_json)
            return v if isinstance(v, list) else []
        except (ValueError, TypeError):
            return []

    def set_donor_shares(self, shares: list) -> None:
        """Phase 686 — replace the round's donor shares with the
        given list. Coerces fields, drops anything malformed."""
        import json as _json
        clean = []
        for s in (shares or []):
            try:
                did = int(s.get('donor_id'))
                amt = float(s.get('committed_usd') or 0)
            except (TypeError, ValueError):
                continue
            entry = {'donor_id': did, 'committed_usd': amt}
            rp = s.get('restricted_to_partner_id')
            if rp is not None:
                try:
                    entry['restricted_to_partner_id'] = int(rp)
                except (TypeError, ValueError):
                    pass
            rpurp = (s.get('restricted_to_purpose') or '').strip()
            if rpurp:
                entry['restricted_to_purpose'] = rpurp[:200]
            clean.append(entry)
        self.donor_shares_json = _json.dumps(clean) if clean else None

    def restricted_remaining_for(self, partner_id: int, disbursed_to_partner: float) -> dict:
        """Phase 686 — compute remaining restricted budget for a
        partner across all donor shares that earmark for them.
        Returns {has_restriction, restricted_total, remaining}.
        If no donor restricts to this partner, has_restriction is False.
        """
        shares = self._donor_shares()
        restricted_total = sum(
            float(s.get('committed_usd') or 0) for s in shares
            if s.get('restricted_to_partner_id') == partner_id
        )
        return {
            'has_restriction': restricted_total > 0,
            'restricted_total': restricted_total,
            'remaining': max(0.0, restricted_total - disbursed_to_partner),
        }

    def to_dict(self, *, include_signatures: bool = False) -> dict:
        data = {
            "id": self.id,
            "network_id": self.network_id,
            "title": self.title,
            "title_ar": self.title_ar,
            "trigger_type": self.trigger_type,
            "trigger_summary": self.trigger_summary,
            "donor_id": self.donor_id,
            "donor_name": self.donor_name,
            "envelope_usd": self.envelope_usd,
            "expected_duration_days": self.expected_duration_days,
            "tranche_schedule": self._tranche_schedule(),
            "donor_shares": self._donor_shares(),
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
            "closed_over_blockers": self.closed_over_blockers,
            "close_override_reason": self.close_override_reason,
            "close_overridden_at": (
                self.close_overridden_at.isoformat()
                if self.close_overridden_at else None
            ),
            "close_blockers": self.close_blockers(),
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


# ===============================================================
# ProximateRoundParticipant — Phase 710
# ===============================================================

# Round → partner roster. Prior to Phase 710 the set of partners in a
# round was inferred by querying disbursements after the fact. That
# made round planning impossible ("who's supposed to be in this
# round?" had no answer until money moved). Explicit participant rows
# solve it: OB adds partners at draft time, tracks stage per partner,
# renders roster on the round detail page.

PARTICIPANT_STAGES = (
    "nominated",         # a panel member put them forward
    "info_requested",    # secretariat asked for the partner information form
    "info_received",
    "planned",           # roster entry only (legacy entry point, kept)
    "endorsement_open",  # panel-member links shared
    "endorsed",          # 2+ panel endorsements collected
    "due_diligence",     # secretariat vetting in progress
    "dd_passed",
    "dd_failed",
    "shortlisted",       # back to the panel for the award decision
    "awarded",
    "not_awarded",
    "contracting",
    "contract_signed",
    "bank_verified",     # ready to disburse
    "disbursed",         # first tranche sent
    "receipt_confirmed",  # partner confirmed the money arrived
    "implementing",
    "reported",          # partner report received
    "attested",          # 90-day outcome attested
    "verified",          # third-party verifier confirmed
    "closed",
    "withdrawn",         # removed from the round
)


class ProximateRoundParticipant(db.Model):
    """A partner enrolled in a Proximate round.

    One row per (round, partner). The `stage` is the OB's snapshot of
    where this partner sits in the round's lifecycle — computed by the
    round-detail endpoint from the underlying endorsement / bank /
    disbursement / report / outcome / verifier state, but persisted
    here as a cache so the roster page loads instantly."""

    __tablename__ = "proximate_round_participants"
    __table_args__ = (
        db.UniqueConstraint(
            "round_id", "partner_id",
            name="uq_proximate_round_participant",
        ),
        db.Index(
            "ix_proximate_round_participant_stage",
            "round_id", "stage",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    round_id = db.Column(
        db.Integer,
        db.ForeignKey("proximate_rounds.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    partner_id = db.Column(
        db.Integer,
        db.ForeignKey("proximate_partners.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    stage = db.Column(
        db.String(30), nullable=False, default="planned",
    )
    notes = db.Column(db.Text, nullable=True)

    added_by_user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True,
    )
    added_at = db.Column(db.DateTime, nullable=False, default=_now)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=_now, onupdate=_now,
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "round_id": self.round_id,
            "partner_id": self.partner_id,
            "stage": self.stage,
            "notes": self.notes,
            "added_by_user_id": self.added_by_user_id,
            "added_at": self.added_at.isoformat() if self.added_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
