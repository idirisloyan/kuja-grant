"""Application model - Grant applications submitted by NGOs."""

from datetime import datetime, timezone

from app.extensions import db
from app.utils.helpers import _json_load, _json_dump


class Application(db.Model):
    """Grant applications submitted by NGOs."""
    __tablename__ = 'applications'
    __table_args__ = (
        db.Index('ix_applications_ngo_status', 'ngo_org_id', 'status'),
        db.Index('ix_applications_grant_status', 'grant_id', 'status'),
        db.UniqueConstraint('grant_id', 'ngo_org_id', name='uq_application_grant_ngo'),
    )

    id = db.Column(db.Integer, primary_key=True)
    grant_id = db.Column(db.Integer, db.ForeignKey('grants.id'), nullable=False, index=True)
    ngo_org_id = db.Column(db.Integer, db.ForeignKey('organizations.id'), nullable=False, index=True)
    status = db.Column(db.String(50), default='draft', index=True)
    # draft, submitted, under_review, scored, awarded, rejected
    responses = db.Column(db.Text, nullable=True)              # JSON dict keyed by criterion id
    eligibility_responses = db.Column(db.Text, nullable=True)  # JSON dict
    ai_score = db.Column(db.Float, nullable=True)
    human_score = db.Column(db.Float, nullable=True)
    final_score = db.Column(db.Float, nullable=True)
    submitted_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    documents = db.relationship('Document', backref='application', lazy='dynamic', cascade='all, delete-orphan')
    reviews = db.relationship('Review', backref='application', lazy='dynamic', cascade='all, delete-orphan')

    # --- JSON helpers ---
    def get_responses(self):
        return _json_load(self.responses) or {}

    def set_responses(self, value):
        self.responses = _json_dump(value)

    def get_eligibility_responses(self):
        return _json_load(self.eligibility_responses) or {}

    def set_eligibility_responses(self, value):
        self.eligibility_responses = _json_dump(value)

    def to_dict(self, summary=False):
        data = {
            'id': self.id,
            'grant_id': self.grant_id,
            'ngo_org_id': self.ngo_org_id,
            'status': self.status,
            'ai_score': self.ai_score,
            'human_score': self.human_score,
            'final_score': self.final_score,
            'submitted_at': self.submitted_at.isoformat() if self.submitted_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
        if not summary:
            data['responses'] = self.get_responses()
            data['eligibility_responses'] = self.get_eligibility_responses()
        # Include related names
        if self.grant:
            data['grant_title'] = self.grant.title
        if self.ngo_org:
            data['ngo_org_name'] = self.ngo_org.name
            data['org_name'] = self.ngo_org.name      # alias for frontend
            data['country'] = self.ngo_org.country     # needed for donor NGO listing
        return data
