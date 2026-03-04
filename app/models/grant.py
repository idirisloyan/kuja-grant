"""Grant model - Grant opportunities posted by donors."""

from datetime import datetime, timezone

from app.extensions import db
from app.utils.helpers import _json_load, _json_dump


class Grant(db.Model):
    """Grant opportunities posted by donors."""
    __tablename__ = 'grants'
    __table_args__ = (
        db.Index('ix_grants_donor_status', 'donor_org_id', 'status'),
    )

    id = db.Column(db.Integer, primary_key=True)
    donor_org_id = db.Column(db.Integer, db.ForeignKey('organizations.id'), nullable=False, index=True)
    title = db.Column(db.String(500), nullable=False)
    description = db.Column(db.Text, nullable=True)
    total_funding = db.Column(db.Numeric(12, 2), nullable=True)
    currency = db.Column(db.String(10), default='USD')
    deadline = db.Column(db.Date, nullable=True)
    status = db.Column(db.String(50), default='draft', index=True)  # draft, open, review, closed, awarded
    sectors = db.Column(db.Text, nullable=True)          # JSON array
    countries = db.Column(db.Text, nullable=True)         # JSON array
    eligibility = db.Column(db.Text, nullable=True)       # JSON array of requirement objects
    criteria = db.Column(db.Text, nullable=True)          # JSON array of criterion objects
    doc_requirements = db.Column(db.Text, nullable=True)  # JSON array
    reporting_requirements = db.Column(db.Text, nullable=True)  # JSON array of reporting requirement objects
    grant_document = db.Column(db.String(500), nullable=True)  # stored filename of the actual grant document
    report_template = db.Column(db.Text, nullable=True)  # JSON - template structure for NGO reports
    reporting_frequency = db.Column(db.String(50), nullable=True)  # monthly, quarterly, semi-annual, annual, final_only
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))
    published_at = db.Column(db.DateTime, nullable=True)

    # Relationships
    applications = db.relationship('Application', backref='grant', lazy='dynamic')

    # --- JSON helpers ---
    def get_sectors(self):
        return _json_load(self.sectors) or []

    def set_sectors(self, value):
        self.sectors = _json_dump(value)

    def get_countries(self):
        return _json_load(self.countries) or []

    def set_countries(self, value):
        self.countries = _json_dump(value)

    def get_eligibility(self):
        return _json_load(self.eligibility) or []

    def set_eligibility(self, value):
        self.eligibility = _json_dump(value)

    def get_criteria(self):
        return _json_load(self.criteria) or []

    def set_criteria(self, value):
        self.criteria = _json_dump(value)

    def get_doc_requirements(self):
        return _json_load(self.doc_requirements) or []

    def set_doc_requirements(self, value):
        self.doc_requirements = _json_dump(value)

    def get_reporting_requirements(self):
        return _json_load(self.reporting_requirements) or []

    def set_reporting_requirements(self, value):
        self.reporting_requirements = _json_dump(value)

    def get_report_template(self):
        return _json_load(self.report_template) or {}

    def set_report_template(self, value):
        self.report_template = _json_dump(value)

    def to_dict(self, summary=False):
        data = {
            'id': self.id,
            'donor_org_id': self.donor_org_id,
            'title': self.title,
            'description': self.description,
            'total_funding': float(self.total_funding) if self.total_funding else None,
            'currency': self.currency,
            'deadline': self.deadline.isoformat() if self.deadline else None,
            'status': self.status,
            'sectors': self.get_sectors(),
            'countries': self.get_countries(),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'published_at': self.published_at.isoformat() if self.published_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
        if not summary:
            data['eligibility'] = self.get_eligibility()
            data['criteria'] = self.get_criteria()
            data['doc_requirements'] = self.get_doc_requirements()
            data['reporting_requirements'] = self.get_reporting_requirements()
            data['grant_document'] = self.grant_document
            data['report_template'] = self.get_report_template()
            data['reporting_frequency'] = self.reporting_frequency
        # Include donor org name if loaded
        if self.donor_org:
            data['donor_org_name'] = self.donor_org.name
        return data
