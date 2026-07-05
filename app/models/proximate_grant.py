"""Proximate Grant — Phase 721 (June 2026).

Adeso's inbound grant from an institutional donor (Ford, Gates, EU, …).

Deliberately distinct from the Kuja `Grant` model because the lifecycle
is different:

  Kuja Grant     — Donor publishes → NGOs apply → NGO awarded → NGO reports
  ProximateGrant — Donor + Adeso sign an agreement OFF-PLATFORM → Adeso
                   uploads the signed PDF → AI extracts terms →
                   Adeso reviews/edits/accepts → grant is 'active' → Adeso
                   allocates rounds from it → Adeso reports back per
                   donor's cadence.

There's no application phase, no publication, no reviewer flow. It's a
contract-management surface, not a grant-marketplace surface.

Where possible we call the SAME shared services Kuja uses:
  • `GrantAgreementUnpackService` — PDF → extracted terms
  • Compliance coach / plain-language flags / polish response
  • Reports admin surfaces (with a ProximateGrantReport wrapper)
  • Deadline calendar + .ics export cron

The relationship to existing Proximate primitives:
  • `donor_id` → ProximateDonor (institutional donor)
  • Rounds allocate FROM this grant via `ProximateGrantAllocation`
  • Disbursements → to partners flow FROM rounds → traced back to grant
"""

from datetime import datetime, timezone

from app.extensions import db


GRANT_STATUSES = (
    'draft',           # uploaded, extraction in progress or awaiting review
    'active',          # reviewed + accepted, allocations can happen
    'paused',          # donor or Adeso paused (issue mid-cycle)
    'completed',       # grant period ended, all reports submitted+accepted
    'cancelled',       # withdrawn or terminated
)

REPORTING_CADENCES = (
    'monthly',
    'quarterly',
    'semi_annual',
    'annual',
    'final_only',      # only a final report at end of grant
    'ad_hoc',          # donor asks on their own schedule
)

REPORT_STATUSES = (
    'pending',              # obligation known, not started
    'drafting',             # AI+human draft in progress
    'submitted',            # sent to donor, awaiting acknowledgement
    'accepted',             # donor accepted, closed
    'revision_requested',   # donor kicked back
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


# =========================================================================
# ProximateGrant — the signed donor→Adeso agreement
# =========================================================================

class ProximateGrant(db.Model):
    """One signed grant Adeso holds from one institutional donor."""

    __tablename__ = 'proximate_grants'
    __table_args__ = (
        db.Index('ix_proximate_grants_network_status', 'network_id', 'status'),
        db.Index('ix_proximate_grants_donor', 'donor_id'),
    )

    id = db.Column(db.Integer, primary_key=True)
    network_id = db.Column(
        db.Integer, db.ForeignKey('networks.id'), nullable=False, index=True,
    )
    donor_id = db.Column(
        db.Integer,
        db.ForeignKey('proximate_donors.id', ondelete='SET NULL'),
        nullable=True, index=True,
    )
    # Snapshot of donor display name at signing so historical grants
    # keep rendering if the ProximateDonor row is deleted or renamed.
    donor_name_cache = db.Column(db.String(200), nullable=True)

    # Human-friendly title Adeso uses internally.
    title = db.Column(db.String(300), nullable=False)
    # Donor's own reference (they'll cite this on every email).
    donor_grant_ref = db.Column(db.String(120), nullable=True)

    amount_committed_usd = db.Column(db.Float, nullable=True)
    amount_received_usd = db.Column(db.Float, nullable=False, default=0.0)
    currency = db.Column(db.String(3), nullable=False, default='USD')

    start_date = db.Column(db.Date, nullable=True)
    end_date = db.Column(db.Date, nullable=True)

    reporting_cadence = db.Column(
        db.String(30), nullable=False, default='quarterly',
    )
    # When the next report is due — updated as reports get submitted.
    reporting_next_due_at = db.Column(db.DateTime, nullable=True, index=True)

    # Restrictions the donor placed (geo/sector/purpose). Extracted by
    # AI from the agreement PDF; Adeso reviews + edits before accepting.
    #   {"geographies":["SD"], "sectors":["cash","food"], "purpose":"..."}
    restrictions_json = db.Column(db.Text, nullable=True)

    # AI extraction output — full structured shape from the unpack service.
    # Kept separately from the human-edited fields above so the AI first-
    # pass is always inspectable. On accept, canonical values above are
    # copied from this JSON.
    extracted_json = db.Column(db.Text, nullable=True)
    extracted_at = db.Column(db.DateTime, nullable=True)
    extracted_model = db.Column(db.String(120), nullable=True)

    # Phase 721d — OB-entered progress for deliverables the system can't
    # compute (e.g. households reached). {"0": 4200, "2": 1} keyed by the
    # deliverable's index in extracted key_deliverables.
    deliverable_progress_json = db.Column(db.Text, nullable=True)

    # The signed PDF itself.
    signed_agreement_doc_id = db.Column(
        db.Integer, db.ForeignKey('documents.id'), nullable=True,
    )
    signed_at = db.Column(db.DateTime, nullable=True)

    status = db.Column(
        db.String(40), nullable=False, default='draft', index=True,
    )

    created_by_user_id = db.Column(
        db.Integer, db.ForeignKey('users.id'), nullable=True,
    )
    created_at = db.Column(db.DateTime, nullable=False, default=_now)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=_now, onupdate=_now,
    )

    # ---- computed properties ---------------------------------------------

    @property
    def amount_allocated_usd(self) -> float:
        """Sum of allocations from this grant across all rounds."""
        try:
            rows = ProximateGrantAllocation.query.filter_by(
                grant_id=self.id,
            ).all()
            return sum(float(r.amount_usd or 0) for r in rows)
        except Exception:
            return 0.0

    @property
    def amount_remaining_usd(self) -> float:
        return max(0.0, float(self.amount_committed_usd or 0) - self.amount_allocated_usd)

    def _restrictions(self) -> dict:
        if not self.restrictions_json:
            return {}
        import json as _json
        try:
            v = _json.loads(self.restrictions_json)
            return v if isinstance(v, dict) else {}
        except (ValueError, TypeError):
            return {}

    def _extracted(self) -> dict:
        if not self.extracted_json:
            return {}
        import json as _json
        try:
            v = _json.loads(self.extracted_json)
            return v if isinstance(v, dict) else {}
        except (ValueError, TypeError):
            return {}

    def to_dict(self, *, include_extracted: bool = False) -> dict:
        data = {
            'id': self.id,
            'network_id': self.network_id,
            'donor_id': self.donor_id,
            'donor_name': self.donor_name_cache,
            'title': self.title,
            'donor_grant_ref': self.donor_grant_ref,
            'amount_committed_usd': self.amount_committed_usd,
            'amount_received_usd': self.amount_received_usd,
            'amount_allocated_usd': self.amount_allocated_usd,
            'amount_remaining_usd': self.amount_remaining_usd,
            'currency': self.currency,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'end_date': self.end_date.isoformat() if self.end_date else None,
            'reporting_cadence': self.reporting_cadence,
            'reporting_next_due_at': (
                self.reporting_next_due_at.isoformat()
                if self.reporting_next_due_at else None
            ),
            'restrictions': self._restrictions(),
            'has_signed_pdf': self.signed_agreement_doc_id is not None,
            'signed_at': self.signed_at.isoformat() if self.signed_at else None,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
        if include_extracted:
            data['extracted'] = self._extracted()
            data['extracted_at'] = (
                self.extracted_at.isoformat() if self.extracted_at else None
            )
        return data


# =========================================================================
# ProximateGrantAllocation — round drawing money from grant
# =========================================================================

class ProximateGrantAllocation(db.Model):
    """One round drawing an amount from one grant. A round can be
    co-funded by multiple grants; a grant funds many rounds over time."""

    __tablename__ = 'proximate_grant_allocations'
    __table_args__ = (
        db.UniqueConstraint(
            'round_id', 'grant_id',
            name='uq_proximate_grant_allocation',
        ),
        db.Index(
            'ix_proximate_grant_allocations_grant',
            'grant_id',
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    round_id = db.Column(
        db.Integer,
        db.ForeignKey('proximate_rounds.id', ondelete='CASCADE'),
        nullable=False, index=True,
    )
    grant_id = db.Column(
        db.Integer,
        db.ForeignKey('proximate_grants.id', ondelete='CASCADE'),
        nullable=False, index=True,
    )
    amount_usd = db.Column(db.Float, nullable=False)
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=_now)

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'round_id': self.round_id,
            'grant_id': self.grant_id,
            'amount_usd': self.amount_usd,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


# =========================================================================
# ProximateGrantReport — Adeso's report BACK to donor
# =========================================================================

class ProximateGrantReport(db.Model):
    """A report Adeso owes the donor per the grant's reporting cadence.

    Content is AI-drafted from actual round/disbursement/outcome data
    then human-edited. Once submitted, we log donor acknowledgement +
    revision requests so the audit trail is complete."""

    __tablename__ = 'proximate_grant_reports'
    __table_args__ = (
        db.Index(
            'ix_proximate_grant_reports_grant_status',
            'grant_id', 'status',
        ),
        db.Index(
            'ix_proximate_grant_reports_due',
            'due_date',
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    grant_id = db.Column(
        db.Integer,
        db.ForeignKey('proximate_grants.id', ondelete='CASCADE'),
        nullable=False, index=True,
    )

    report_type = db.Column(db.String(30), nullable=False, default='quarterly')
    period_start = db.Column(db.Date, nullable=True)
    period_end = db.Column(db.Date, nullable=True)
    due_date = db.Column(db.Date, nullable=True)

    status = db.Column(
        db.String(40), nullable=False, default='pending', index=True,
    )

    # Human-editable body — sections keyed by requirement.
    #   {"executive_summary":"...", "rounds_funded":[...], "outcomes":"..."}
    content_json = db.Column(db.Text, nullable=True)
    # AI first-pass — kept separately.
    ai_draft_json = db.Column(db.Text, nullable=True)
    ai_draft_at = db.Column(db.DateTime, nullable=True)

    # Compliance-per-requirement score. AI evaluates each donor
    # requirement against the current content and returns a 0-100.
    #   {"requirement_id":"impact_narrative", "score":88, "why":"..."}
    compliance_score_json = db.Column(db.Text, nullable=True)
    compliance_scored_at = db.Column(db.DateTime, nullable=True)

    pdf_doc_id = db.Column(
        db.Integer, db.ForeignKey('documents.id'), nullable=True,
    )
    submitted_at = db.Column(db.DateTime, nullable=True)
    submitted_by_user_id = db.Column(
        db.Integer, db.ForeignKey('users.id'), nullable=True,
    )

    # Donor's response.
    donor_ack_at = db.Column(db.DateTime, nullable=True)
    donor_ack_notes = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, nullable=False, default=_now)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=_now, onupdate=_now,
    )

    def _content(self) -> dict:
        if not self.content_json:
            return {}
        import json as _json
        try:
            v = _json.loads(self.content_json)
            return v if isinstance(v, dict) else {}
        except (ValueError, TypeError):
            return {}

    def _compliance_score(self) -> list:
        if not self.compliance_score_json:
            return []
        import json as _json
        try:
            v = _json.loads(self.compliance_score_json)
            return v if isinstance(v, list) else []
        except (ValueError, TypeError):
            return []

    def to_dict(self, *, include_content: bool = False) -> dict:
        data = {
            'id': self.id,
            'grant_id': self.grant_id,
            'report_type': self.report_type,
            'period_start': self.period_start.isoformat() if self.period_start else None,
            'period_end': self.period_end.isoformat() if self.period_end else None,
            'due_date': self.due_date.isoformat() if self.due_date else None,
            'status': self.status,
            'compliance_score': self._compliance_score(),
            'submitted_at': self.submitted_at.isoformat() if self.submitted_at else None,
            'donor_ack_at': self.donor_ack_at.isoformat() if self.donor_ack_at else None,
            'donor_ack_notes': self.donor_ack_notes,
            'has_pdf': self.pdf_doc_id is not None,
        }
        if include_content:
            data['content'] = self._content()
        return data
