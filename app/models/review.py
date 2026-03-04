"""Review model - Reviewer evaluations of applications."""

from datetime import datetime, timezone

from app.extensions import db
from app.utils.helpers import _json_load, _json_dump


class Review(db.Model):
    """Reviewer evaluations of applications."""
    __tablename__ = 'reviews'
    __table_args__ = (
        db.Index('ix_reviews_user_status', 'reviewer_user_id', 'status'),
    )

    id = db.Column(db.Integer, primary_key=True)
    application_id = db.Column(db.Integer, db.ForeignKey('applications.id'), nullable=False, index=True)
    reviewer_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    scores = db.Column(db.Text, nullable=True)     # JSON dict keyed by criterion id
    comments = db.Column(db.Text, nullable=True)   # JSON dict
    overall_score = db.Column(db.Float, nullable=True)
    status = db.Column(db.String(50), default='assigned')  # assigned, in_progress, completed
    completed_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    # --- JSON helpers ---
    def get_scores(self):
        return _json_load(self.scores) or {}

    def set_scores(self, value):
        self.scores = _json_dump(value)

    def get_comments(self):
        return _json_load(self.comments) or {}

    def set_comments(self, value):
        self.comments = _json_dump(value)

    def to_dict(self):
        return {
            'id': self.id,
            'application_id': self.application_id,
            'reviewer_user_id': self.reviewer_user_id,
            'scores': self.get_scores(),
            'comments': self.get_comments(),
            'overall_score': self.overall_score,
            'status': self.status,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'reviewer_name': self.reviewer.name if self.reviewer else None,
            'application_title': self.application.grant.title if self.application and self.application.grant else None,
        }
