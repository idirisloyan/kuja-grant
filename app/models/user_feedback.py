"""UserFeedback model — Phase 31A (May 2026).

Captures 1-question NPS-style ratings at moments-of-completion (e.g.
right after an application or report is submitted). Complements the
behavioural UserEvent data with explicit perceived-value signal.

Discipline:
  - One row per (user, surface, related_kind, related_id) — the model
    enforces a unique constraint so users can't spam-submit
  - score is 0-10 (NPS scale: 0-6 detractor, 7-8 passive, 9-10 promoter)
  - comment is optional, capped at 500 chars to keep storage cheap
  - language captured at submission time so cohort analysis can split
    by what locale the user was working in
"""

from datetime import datetime, timezone

from app.extensions import db


class UserFeedback(db.Model):
    __tablename__ = 'user_feedback'
    __table_args__ = (
        db.Index('ix_user_feedback_surface_time', 'surface', 'created_at'),
        db.Index('ix_user_feedback_user_time', 'user_id', 'created_at'),
        db.UniqueConstraint(
            'user_id', 'surface', 'related_kind', 'related_id',
            name='uq_user_feedback_one_per_target',
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'),
                        nullable=False, index=True)
    org_id = db.Column(db.Integer, db.ForeignKey('organizations.id'),
                       nullable=True, index=True)
    role = db.Column(db.String(40), nullable=True)
    language = db.Column(db.String(10), nullable=True)

    # Where the survey fired. Stable vocab so dashboards can group:
    #   'application_submit', 'report_submit', 'chat_thread_close',
    #   'readiness_check', 'reviewer_summary'
    surface = db.Column(db.String(60), nullable=False)
    related_kind = db.Column(db.String(40), nullable=True)   # 'application' | 'report' | ...
    related_id = db.Column(db.Integer, nullable=True)

    score = db.Column(db.Integer, nullable=False)            # 0-10
    comment = db.Column(db.String(500), nullable=True)

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           nullable=False)

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'surface': self.surface,
            'related_kind': self.related_kind,
            'related_id': self.related_id,
            'score': self.score,
            'comment': self.comment,
            'language': self.language,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


# NPS bucket categorization for dashboard rollups.
def nps_bucket(score: int) -> str:
    if score >= 9:
        return 'promoter'
    if score >= 7:
        return 'passive'
    return 'detractor'
