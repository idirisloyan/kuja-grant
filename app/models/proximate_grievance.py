"""Proximate grievance channel — Phase 716c (July 2026).

SoP §14 implies a public reporting channel: a community member must
be able to report concerns about a partner (or the fund itself)
without needing an account and without identifying themselves. In
the Sudan context anonymity is a safety feature, not a convenience —
reporters may live in the same neighbourhood as the people they are
reporting on.

One table:

  ProximateGrievance — a report filed through the public
    /proximate-grievance form (or logged by the OB on someone's
    behalf). partner_id is optional: a grievance can be about the
    fund as a whole. Reporter identity fields are optional and the
    form offers an explicit "submit anonymously" toggle that clears
    them client-side AND server-side.

Lifecycle: new → triaged → resolved (or dismissed). The OB works a
72-hour triage SLA (SoP §14 timer, mirrored from the Phase 635
intervention clocks). `sla_deadline`, `remaining_seconds` and
`is_sla_breached` are exposed so the queue UI never recomputes clock
math.

Grievances with category fraud/safety that name a partner auto-open
a Phase 635 intervention (freeze, 72h) — the route layer does that,
not the model.
"""

from datetime import datetime, timezone, timedelta

from app.extensions import db


GRIEVANCE_CATEGORIES = ('fraud', 'safety', 'other')
GRIEVANCE_STATUSES = ('new', 'triaged', 'resolved', 'dismissed')

# SoP §14 — OB must look at every grievance within 72 hours.
TRIAGE_SLA_HOURS = 72


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: datetime | None) -> datetime | None:
    """SQLite returns naive datetimes even when we stored aware ones —
    treat naive as UTC, since that's what we wrote."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


class ProximateGrievance(db.Model):
    """One community grievance. Public-submittable; OB-triaged."""

    __tablename__ = 'proximate_grievances'
    __table_args__ = (
        db.Index(
            'ix_proximate_grievances_network_status',
            'network_id', 'status',
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    network_id = db.Column(
        db.Integer, db.ForeignKey('networks.id'),
        nullable=False, index=True,
    )
    partner_id = db.Column(
        db.Integer, db.ForeignKey('proximate_partners.id'),
        nullable=True, index=True,
    )

    # Reporter identity — all optional. is_anonymous means the
    # reporter explicitly chose anonymity (vs just leaving blanks).
    reporter_name = db.Column(db.String(160), nullable=True)
    reporter_phone = db.Column(db.String(60), nullable=True)
    is_anonymous = db.Column(db.Boolean, nullable=False, default=False)

    category = db.Column(db.String(40), nullable=False, default='other')
    description = db.Column(db.Text, nullable=False)

    status = db.Column(
        db.String(40), nullable=False, default='new', index=True,
    )

    submitted_at = db.Column(db.DateTime, nullable=False, default=_now)

    triaged_at = db.Column(db.DateTime, nullable=True)
    triaged_by_user_id = db.Column(
        db.Integer, db.ForeignKey('users.id'), nullable=True,
    )
    resolution_notes = db.Column(db.Text, nullable=True)
    resolved_at = db.Column(db.DateTime, nullable=True)

    # Set when a fraud/safety grievance auto-opened an intervention.
    intervention_id = db.Column(
        db.Integer, db.ForeignKey('proximate_interventions.id'),
        nullable=True,
    )

    created_at = db.Column(db.DateTime, nullable=False, default=_now)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=_now, onupdate=_now,
    )

    # --- SLA helpers --------------------------------------------------

    @property
    def sla_deadline(self) -> datetime | None:
        submitted = _as_utc(self.submitted_at)
        if submitted is None:
            return None
        return submitted + timedelta(hours=TRIAGE_SLA_HOURS)

    @property
    def remaining_seconds(self) -> int:
        """Seconds until the triage SLA breaches. 0 once triaged or
        once past deadline."""
        if self.status != 'new':
            return 0
        deadline = self.sla_deadline
        if deadline is None:
            return 0
        return max(0, int((deadline - _now()).total_seconds()))

    @property
    def is_sla_breached(self) -> bool:
        if self.status != 'new':
            return False
        deadline = self.sla_deadline
        return deadline is not None and deadline <= _now()

    # --- transitions --------------------------------------------------

    def triage(self, *, user_id: int, notes: str | None = None) -> None:
        self.status = 'triaged'
        self.triaged_at = _now()
        self.triaged_by_user_id = user_id
        if notes:
            self.resolution_notes = notes[:2000]

    def resolve(self, *, user_id: int, notes: str,
                dismissed: bool = False) -> None:
        self.status = 'dismissed' if dismissed else 'resolved'
        self.resolved_at = _now()
        if not self.triaged_at:
            self.triaged_at = self.resolved_at
            self.triaged_by_user_id = user_id
        self.resolution_notes = (notes or '')[:2000]

    def to_dict(self, *, include_reporter: bool = False) -> dict:
        """include_reporter=False redacts identity — used anywhere the
        payload could travel beyond the OB (exports, partner views)."""
        d = {
            'id': self.id,
            'network_id': self.network_id,
            'partner_id': self.partner_id,
            'category': self.category,
            'description': self.description,
            'status': self.status,
            'is_anonymous': self.is_anonymous,
            'submitted_at': self.submitted_at.isoformat() if self.submitted_at else None,
            'sla_deadline': self.sla_deadline.isoformat() if self.sla_deadline else None,
            'remaining_seconds': self.remaining_seconds,
            'is_sla_breached': self.is_sla_breached,
            'triaged_at': self.triaged_at.isoformat() if self.triaged_at else None,
            'triaged_by_user_id': self.triaged_by_user_id,
            'resolution_notes': self.resolution_notes,
            'resolved_at': self.resolved_at.isoformat() if self.resolved_at else None,
            'intervention_id': self.intervention_id,
        }
        if include_reporter and not self.is_anonymous:
            d['reporter_name'] = self.reporter_name
            d['reporter_phone'] = self.reporter_phone
        return d
