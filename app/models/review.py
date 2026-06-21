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
    # Phase 221 — private reviewer notes. Visible to reviewers + donor +
    # admin, never to the NGO. Free-form text. Audit log entries
    # reference these by review_id.
    private_notes = db.Column(db.Text, nullable=True)
    # Phase 283 — reviewer-disclosed conflict of interest. Set via
    # POST /api/reviews/<id>/coi-flag. Logged to the audit chain + admins
    # notified. Reviewer can recuse themselves up-front; admin reassigns.
    coi_disclosed_at = db.Column(db.DateTime, nullable=True)
    coi_kind = db.Column(db.String(60), nullable=True)  # employer_overlap | prior_consulting | family | other
    coi_note = db.Column(db.Text, nullable=True)
    # Phase 327 — reviewer can snooze a review for N days. Snoozed
    # reviews fall out of the visible queue until the timer expires.
    snoozed_until = db.Column(db.DateTime, nullable=True)
    snoozed_reason = db.Column(db.String(200), nullable=True)
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
            'private_notes': self.private_notes,
            'coi_disclosed_at': self.coi_disclosed_at.isoformat() if self.coi_disclosed_at else None,
            'coi_kind': self.coi_kind,
            'coi_note': self.coi_note,
            'snoozed_until': self.snoozed_until.isoformat() if self.snoozed_until else None,
            'snoozed_reason': self.snoozed_reason,
            'reviewer_name': self.reviewer.name if self.reviewer else None,
            'application_title': self.application.grant.title if self.application and self.application.grant else None,
            'grant_title': self.application.grant.title if self.application and self.application.grant else None,
            'org_name': self.application.ngo_org.name if self.application and self.application.ngo_org else None,
            # Phase 99 — reviewers' assignments table reads `ngo_org_name`
            # and was falling back to "Application #176" because we only
            # exposed `org_name`. Alias both so callers can use either.
            'ngo_org_name': self.application.ngo_org.name if self.application and self.application.ngo_org else None,
            'application_name': f'Application #{self.application_id}',
            'score': self.overall_score,
            # Phase 381 — surface the grant deadline so reviewer queues
            # can flag reviews whose grant deadline is imminent.
            'grant_deadline': (
                self.application.grant.deadline.isoformat()
                if self.application and self.application.grant and self.application.grant.deadline
                else None
            ),
        }
