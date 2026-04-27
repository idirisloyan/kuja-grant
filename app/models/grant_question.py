"""
GrantQuestion — Phase 4.3
=========================
Inline questions an NGO can ask on a specific grant (or specific criterion
within a grant). The donor answers; the answer is visible to every NGO
applying to that grant, eliminating information asymmetry.

Design:
    - Questions are anonymous to other applicants. Donor admins see who
      asked; the public Q&A view does not.
    - One question per (grant, ngo_org, criterion_key) cap is informal —
      we don't enforce uniqueness, but we deduplicate in the UI.
    - Status state machine:
        'pending'  — asked, not yet answered
        'answered' — donor responded
        'moderated'— donor flagged as off-topic / spam / duplicate;
                     hidden from public view but kept for audit
"""

from datetime import datetime, timezone
from app.extensions import db


class GrantQuestion(db.Model):
    __tablename__ = 'grant_questions'
    __table_args__ = (
        db.Index('ix_grant_questions_grant', 'grant_id', 'created_at'),
        db.Index('ix_grant_questions_ngo', 'ngo_org_id', 'created_at'),
        db.Index('ix_grant_questions_status', 'status'),
    )

    id = db.Column(db.Integer, primary_key=True)
    grant_id = db.Column(db.Integer, db.ForeignKey('grants.id'), nullable=False)
    ngo_org_id = db.Column(db.Integer, db.ForeignKey('organizations.id'), nullable=False)
    asked_by_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    # Optional anchor — when present, the question is "about" a specific
    # criterion or eligibility item. The frontend uses this to render the
    # question inline next to that field.
    anchor_kind = db.Column(db.String(32), nullable=True)   # 'criterion' | 'eligibility' | 'document' | None
    anchor_key = db.Column(db.String(120), nullable=True)

    question = db.Column(db.Text, nullable=False)
    answer = db.Column(db.Text, nullable=True)

    answered_by_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    answered_at = db.Column(db.DateTime, nullable=True)

    status = db.Column(db.String(16), default='pending', nullable=False)

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def to_dict(self, include_asker=False):
        out = {
            'id': self.id,
            'grant_id': self.grant_id,
            'anchor_kind': self.anchor_kind,
            'anchor_key': self.anchor_key,
            'question': self.question,
            'answer': self.answer,
            'status': self.status,
            'answered_at': self.answered_at.isoformat() if self.answered_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_asker:
            out['ngo_org_id'] = self.ngo_org_id
            out['asked_by_user_id'] = self.asked_by_user_id
            out['answered_by_user_id'] = self.answered_by_user_id
        return out
