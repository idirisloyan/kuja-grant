"""Proximate intervention register — Phase 635 (June 2026).

SOP 13 §4 calls for graduated intervention measures with explicit
response timers — escalating from a 24-hour warning all the way to
a 5-day suspension hearing. The register tracks every measure
opened against a Proximate partner, when the response is due, and
auto-escalates anything past its deadline via a cron tick.

Kinds (graduated; lighter touch first):

  warning   — 24-hour clock. Partner must acknowledge or explain.
              No reputation impact yet; this is the secretariat
              flagging a concern.
  freeze    — 72-hour clock. Disbursements paused pending response.
              -3 to contributing endorsers if escalated.
  suspend   — 5-day clock. Partner suspended pending hearing.
              The Phase 632 suspend endpoint already does the
              -5 reputation hit. This kind is the formal
              hearing-window track.

State machine:

  open → responded   (partner or OB responded in time)
  open → escalated   (response_due_at passed, no response — cron)
  open → withdrawn   (secretariat withdrew the measure)
  responded/escalated → closed   (final state, audit-chained)

The cron is best-effort: it walks open interventions hourly and
flips any that are past due to 'escalated'. The model exposes
`elapsed_seconds`, `remaining_seconds`, and `is_expired` so the UI
+ admin tools don't need to recompute clock math.
"""

from datetime import datetime, timezone, timedelta

from app.extensions import db


# ---- Vocabs -----------------------------------------------------------

INTERVENTION_KINDS = (
    'warning',   # 24h
    'freeze',    # 72h
    'suspend',   # 5d
)

INTERVENTION_STATUSES = (
    'open',
    'responded',
    'escalated',
    'withdrawn',
    'closed',
)

# Hours per kind — keep this dict in sync with INTERVENTION_KINDS.
RESPONSE_WINDOW_HOURS = {
    'warning': 24,
    'freeze':  72,
    'suspend': 120,
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---- InterventionMeasure ---------------------------------------------

class InterventionMeasure(db.Model):
    """One intervention against a Proximate partner. SOP 13 §4."""

    __tablename__ = 'proximate_interventions'
    __table_args__ = (
        db.Index(
            'ix_proximate_interventions_partner_status',
            'partner_id', 'status',
        ),
        db.Index(
            'ix_proximate_interventions_open_due',
            'status', 'response_due_at',
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    network_id = db.Column(
        db.Integer,
        db.ForeignKey('networks.id'),
        nullable=False,
        index=True,
    )
    partner_id = db.Column(
        db.Integer,
        db.ForeignKey('proximate_partners.id'),
        nullable=False,
        index=True,
    )

    kind = db.Column(db.String(40), nullable=False)
    sop_clause = db.Column(
        db.String(60), nullable=False, default='SOP-13-section-4',
    )

    opened_by_user_id = db.Column(
        db.Integer, db.ForeignKey('users.id'), nullable=False,
    )
    opened_at = db.Column(
        db.DateTime, nullable=False, default=_now,
    )
    response_due_at = db.Column(db.DateTime, nullable=False)

    reason = db.Column(db.Text, nullable=False)

    status = db.Column(
        db.String(40), nullable=False, default='open', index=True,
    )

    responded_at = db.Column(db.DateTime, nullable=True)
    responded_by_user_id = db.Column(
        db.Integer, db.ForeignKey('users.id'), nullable=True,
    )
    response_notes = db.Column(db.Text, nullable=True)

    escalated_at = db.Column(db.DateTime, nullable=True)
    closed_at = db.Column(db.DateTime, nullable=True)

    audit_chain_seq = db.Column(db.Integer, nullable=True)

    created_at = db.Column(
        db.DateTime, nullable=False, default=_now,
    )
    updated_at = db.Column(
        db.DateTime, nullable=False, default=_now, onupdate=_now,
    )

    # --- factory ----------------------------------------------------

    @classmethod
    def open_new(cls, *, network_id: int, partner_id: int,
                 kind: str, reason: str, opened_by_user_id: int,
                 ) -> 'InterventionMeasure':
        """Open a new intervention. response_due_at is computed from
        the kind's response window. Caller commits."""
        if kind not in INTERVENTION_KINDS:
            raise ValueError(f"unknown kind: {kind}")
        hours = RESPONSE_WINDOW_HOURS[kind]
        now = _now()
        m = cls(
            network_id=network_id,
            partner_id=partner_id,
            kind=kind,
            reason=reason[:2000],
            opened_by_user_id=opened_by_user_id,
            opened_at=now,
            response_due_at=now + timedelta(hours=hours),
            status='open',
        )
        db.session.add(m)
        return m

    # --- transitions ------------------------------------------------

    def record_response(self, *, user_id: int, notes: str) -> None:
        self.responded_at = _now()
        self.responded_by_user_id = user_id
        self.response_notes = (notes or '')[:2000]
        self.status = 'responded'

    def escalate(self) -> None:
        """Cron uses this when response_due_at is past."""
        self.escalated_at = _now()
        self.status = 'escalated'

    def withdraw(self) -> None:
        self.status = 'withdrawn'
        self.closed_at = _now()

    def close(self) -> None:
        self.status = 'closed'
        self.closed_at = _now()

    # --- helpers ----------------------------------------------------

    @property
    def is_open(self) -> bool:
        return self.status == 'open'

    @property
    def is_expired(self) -> bool:
        return self.is_open and self.response_due_at <= _now()

    @property
    def elapsed_seconds(self) -> int:
        return int((_now() - self.opened_at).total_seconds())

    @property
    def remaining_seconds(self) -> int:
        return max(0, int((self.response_due_at - _now()).total_seconds()))

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'network_id': self.network_id,
            'partner_id': self.partner_id,
            'kind': self.kind,
            'sop_clause': self.sop_clause,
            'reason': self.reason,
            'status': self.status,
            'opened_by_user_id': self.opened_by_user_id,
            'opened_at': self.opened_at.isoformat() if self.opened_at else None,
            'response_due_at': self.response_due_at.isoformat() if self.response_due_at else None,
            'response_window_hours': RESPONSE_WINDOW_HOURS[self.kind],
            'responded_at': self.responded_at.isoformat() if self.responded_at else None,
            'responded_by_user_id': self.responded_by_user_id,
            'response_notes': self.response_notes,
            'escalated_at': self.escalated_at.isoformat() if self.escalated_at else None,
            'closed_at': self.closed_at.isoformat() if self.closed_at else None,
            'elapsed_seconds': self.elapsed_seconds,
            'remaining_seconds': self.remaining_seconds,
            'is_expired': self.is_expired,
        }
