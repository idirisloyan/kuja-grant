"""Assessment model - Organizational capacity assessments."""

from datetime import datetime, timezone

from app.extensions import db
from app.utils.helpers import _json_load, _json_dump


class Assessment(db.Model):
    """Organizational capacity assessments."""
    __tablename__ = 'assessments'

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, db.ForeignKey('organizations.id'), nullable=False, index=True)
    assess_type = db.Column(db.String(50), default='free')  # free, paid
    framework = db.Column(db.String(50), default='kuja')  # kuja, step, un_hact, chs, nupas
    status = db.Column(db.String(50), default='draft')       # draft, in_progress, completed
    overall_score = db.Column(db.Float, nullable=True)
    category_scores = db.Column(db.Text, nullable=True)      # JSON dict
    checklist_responses = db.Column(db.Text, nullable=True)   # JSON dict
    gaps = db.Column(db.Text, nullable=True)                  # JSON array
    completed_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    documents = db.relationship('Document', backref='assessment', lazy='dynamic', cascade='all, delete-orphan')

    # --- JSON helpers ---
    def get_category_scores(self):
        return _json_load(self.category_scores) or {}

    def set_category_scores(self, value):
        self.category_scores = _json_dump(value)

    def get_checklist_responses(self):
        return _json_load(self.checklist_responses) or {}

    def set_checklist_responses(self, value):
        self.checklist_responses = _json_dump(value)

    def get_gaps(self):
        return _json_load(self.gaps) or []

    def set_gaps(self, value):
        self.gaps = _json_dump(value)

    def to_dict(self):
        return {
            'id': self.id,
            'org_id': self.org_id,
            'assess_type': self.assess_type,
            'framework': self.framework,
            'status': self.status,
            'overall_score': self.overall_score,
            'category_scores': self.get_category_scores(),
            'checklist_responses': self.get_checklist_responses(),
            'gaps': self.get_gaps(),
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'org_name': self.organization.name if self.organization else None,
        }
