"""
Risk model — Phase 13.7.

PMO's UAT-driven win: AI-extracted risks were read-only cards. The fix
was a 5-column workflow on each risk row — status, response, owner,
due date, resolved_at. Read-only is theater; workflow is value.

For Kuja, risks come from multiple sources:
  - compliance_preempt (sanctions / registry / capacity ambiguity)
  - document analysis (financial inconsistency, narrative gaps)
  - reviewer flags during scoring
  - manual entry by donor/admin

Polymorphic against the entity the risk attaches to (org / application
/ grant) so every signal lands in the same register and rolls up
consistently in the donor's "What needs you" panel.

Lifecycle:
  open       — newly detected, no decision
  mitigating — owner is actively addressing it
  mitigated  — issue resolved (resolved_at auto-stamped)
  accepted   — "we've decided to live with this risk" (resolved_at stamped)
  dismissed  — false positive (resolved_at stamped)
"""

from datetime import datetime, timezone

from app.extensions import db
from app.utils.helpers import _json_load, _json_dump


class Risk(db.Model):
    __tablename__ = 'risks'
    __table_args__ = (
        db.Index('ix_risks_subject', 'subject_kind', 'subject_id'),
        db.Index('ix_risks_status', 'status'),
        db.Index('ix_risks_owner', 'owner_user_id'),
    )

    id = db.Column(db.Integer, primary_key=True)

    # Where the risk attaches.
    subject_kind = db.Column(db.String(40), nullable=False)  # 'org' | 'application' | 'grant'
    subject_id = db.Column(db.Integer, nullable=False)

    # Risk taxonomy.
    kind = db.Column(db.String(40), nullable=False)  # compliance | eligibility | documents | finance | narrative | data | governance
    severity = db.Column(db.String(16), nullable=False, default='medium')  # critical | high | medium | low

    title = db.Column(db.String(280), nullable=False)
    description = db.Column(db.Text, nullable=True)

    # Lifecycle.
    status = db.Column(db.String(20), nullable=False, default='open')
    # open | mitigating | mitigated | accepted | dismissed

    response_md = db.Column(db.Text, nullable=True)  # mitigation plan, free text

    owner_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    due_date = db.Column(db.Date, nullable=True)
    resolved_at = db.Column(db.DateTime, nullable=True)

    # Provenance.
    detected_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    source = db.Column(db.String(60), nullable=True)
    # 'ai_compliance_preempt' | 'ai_document_analysis' | 'reviewer_flag' | 'manual'
    ai_call_id = db.Column(db.Integer, nullable=True)  # optional FK to ai_call_logs.id
    metadata_json = db.Column(db.Text, nullable=True)  # extra context (file id, criterion key, etc.)

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships.
    owner = db.relationship('User', foreign_keys=[owner_user_id])

    TERMINAL_STATUSES = ('mitigated', 'accepted', 'dismissed')

    def is_terminal(self) -> bool:
        return self.status in self.TERMINAL_STATUSES

    def get_metadata(self):
        return _json_load(self.metadata_json) or {}

    def set_metadata(self, value):
        self.metadata_json = _json_dump(value)

    def to_dict(self):
        return {
            'id': self.id,
            'subject': {'kind': self.subject_kind, 'id': self.subject_id},
            'kind': self.kind,
            'severity': self.severity,
            'title': self.title,
            'description': self.description,
            'status': self.status,
            'response_md': self.response_md,
            'owner': {
                'user_id': self.owner_user_id,
                'name': self.owner.name if self.owner else None,
                'email': self.owner.email if self.owner else None,
            } if self.owner_user_id else None,
            'due_date': self.due_date.isoformat() if self.due_date else None,
            'resolved_at': self.resolved_at.isoformat() if self.resolved_at else None,
            'detected_at': self.detected_at.isoformat() if self.detected_at else None,
            'source': self.source,
            'ai_call_id': self.ai_call_id,
            'metadata': self.get_metadata(),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
