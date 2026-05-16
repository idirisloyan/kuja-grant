"""
StatusSignal — Phase 2 (May 2026 category-defining UX)
======================================================

ASK / RISK / DECISION rails attached to applications + reports. From PMO transfer:

  - **ASK**      — what we need from leadership / donor / partner
  - **RISK**     — what could derail us
  - **DECISION** — what was agreed (point-in-time decisions for audit)

Each signal is a single bullet with a tone color (blue / amber / green).
Renders as a 3-column color-tinted rail on the entity detail page; rolls
up into the dashboard's TodayBriefing when fresh.

Polymorphic: same table serves applications + reports (and easily grants).

Status lifecycle:
  - open      — default; visible on the rail
  - resolved  — closed (donor approved an ASK, RISK was mitigated, DECISION acted on)
  - archived  — historical
"""

from datetime import datetime, timezone

from app.extensions import db


class StatusSignal(db.Model):
    __tablename__ = 'status_signals'
    __table_args__ = (
        db.Index('ix_status_signal_entity', 'entity_kind', 'entity_id'),
        db.Index('ix_status_signal_kind_status', 'kind', 'status'),
    )

    id = db.Column(db.Integer, primary_key=True)

    entity_kind = db.Column(db.String(32), nullable=False)   # 'application' | 'report' | 'grant'
    entity_id = db.Column(db.Integer, nullable=False)

    kind = db.Column(db.String(16), nullable=False)           # 'ask' | 'risk' | 'decision'
    body = db.Column(db.Text, nullable=False)                 # single bullet

    status = db.Column(db.String(16), nullable=False, default='open')   # open | resolved | archived
    resolution_note = db.Column(db.Text, nullable=True)
    resolved_at = db.Column(db.DateTime, nullable=True)
    resolved_by_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    created_by_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    created_by = db.relationship('User', foreign_keys=[created_by_user_id])
    resolved_by = db.relationship('User', foreign_keys=[resolved_by_user_id])

    def to_dict(self):
        return {
            'id': self.id,
            'entity_kind': self.entity_kind,
            'entity_id': self.entity_id,
            'kind': self.kind,
            'body': self.body,
            'status': self.status,
            'resolution_note': self.resolution_note,
            'resolved_at': self.resolved_at.isoformat() if self.resolved_at else None,
            'resolved_by_user_id': self.resolved_by_user_id,
            'resolved_by_name': self.resolved_by.name if self.resolved_by else None,
            'created_by_user_id': self.created_by_user_id,
            'created_by_name': self.created_by.name if self.created_by else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
