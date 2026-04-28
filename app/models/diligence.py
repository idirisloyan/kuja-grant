"""
DiligenceItem — Phase 4.4
=========================
A finalist's joint diligence room: a shared list of clarification asks
between donor and NGO once an application has been shortlisted. Each
item is an ask from the donor (or a self-attested note from the NGO),
plus the NGO's response and optional attached document.

State machine:
    open       — donor (or auto-rules) created it; NGO hasn't responded
    fulfilled  — NGO submitted response or attachment
    closed     — donor accepted; no further action

Visibility: open to NGO that owns the application + donor that owns the
grant + admin. Reviewers see read-only.
"""

from datetime import datetime, timezone
from app.extensions import db


class DiligenceItem(db.Model):
    __tablename__ = 'diligence_items'
    __table_args__ = (
        db.Index('ix_diligence_app', 'application_id', 'created_at'),
        db.Index('ix_diligence_status', 'status'),
    )

    id = db.Column(db.Integer, primary_key=True)
    application_id = db.Column(db.Integer, db.ForeignKey('applications.id'), nullable=False)

    # 'question'         — donor asks something specific (free text answer)
    # 'document_request' — donor asks for a specific document
    # 'note'             — NGO or donor adds context (no required action)
    kind = db.Column(db.String(32), nullable=False, default='question')

    requested_by_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    prompt = db.Column(db.Text, nullable=False)

    response_text = db.Column(db.Text, nullable=True)
    response_document_id = db.Column(db.Integer, db.ForeignKey('documents.id'), nullable=True)
    responded_by_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    responded_at = db.Column(db.DateTime, nullable=True)

    status = db.Column(db.String(16), default='open', nullable=False)
    due_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def to_dict(self):
        return {
            'id': self.id,
            'application_id': self.application_id,
            'kind': self.kind,
            'requested_by_user_id': self.requested_by_user_id,
            'prompt': self.prompt,
            'response_text': self.response_text,
            'response_document_id': self.response_document_id,
            'responded_by_user_id': self.responded_by_user_id,
            'responded_at': self.responded_at.isoformat() if self.responded_at else None,
            'status': self.status,
            'due_at': self.due_at.isoformat() if self.due_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
