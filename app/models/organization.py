"""Organization model - NGOs, Donors, INGOs, CBOs, Networks."""

from datetime import datetime, timezone

from app.extensions import db
from app.utils.helpers import _json_load, _json_dump


class Organization(db.Model):
    """Organizations - NGOs, Donors, INGOs, CBOs, Networks."""
    __tablename__ = 'organizations'
    __table_args__ = (
        db.Index('ix_orgs_type', 'org_type'),
        db.Index('ix_orgs_verified', 'verified'),
    )

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False, index=True)
    org_type = db.Column(db.String(50), nullable=False)  # ngo, donor, ingo, cbo, network
    country = db.Column(db.String(100), nullable=True)
    city = db.Column(db.String(100), nullable=True)
    year_established = db.Column(db.Integer, nullable=True)
    annual_budget = db.Column(db.String(50), nullable=True)   # range: '<$100K', '$100K-$500K', etc.
    staff_count = db.Column(db.String(50), nullable=True)     # range: '1-10', '11-50', etc.
    sectors = db.Column(db.Text, nullable=True)           # JSON array
    description = db.Column(db.Text, nullable=True)
    mission = db.Column(db.Text, nullable=True)
    registration_status = db.Column(db.String(50), default='pending')
    registration_number = db.Column(db.String(100), nullable=True)
    verified = db.Column(db.Boolean, default=False)
    website = db.Column(db.String(500), nullable=True)
    logo_url = db.Column(db.String(500), nullable=True)
    assess_score = db.Column(db.Float, nullable=True)
    assess_date = db.Column(db.DateTime, nullable=True)
    geographic_areas = db.Column(db.Text, nullable=True)  # JSON array
    focus_areas = db.Column(db.Text, nullable=True)        # JSON array
    sdg_ids = db.Column(db.Text, nullable=True)            # JSON array
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    grants = db.relationship('Grant', backref='donor_org', lazy='dynamic')
    applications = db.relationship('Application', backref='ngo_org', lazy='dynamic')
    assessments = db.relationship('Assessment', backref='organization', lazy='dynamic')
    compliance_checks = db.relationship('ComplianceCheck', backref='organization', lazy='dynamic')

    # --- JSON helpers for SQLite compatibility ---
    def get_sectors(self):
        return _json_load(self.sectors) or []

    def set_sectors(self, value):
        self.sectors = _json_dump(value)

    def get_geographic_areas(self):
        return _json_load(self.geographic_areas) or []

    def set_geographic_areas(self, value):
        self.geographic_areas = _json_dump(value)

    def get_focus_areas(self):
        return _json_load(self.focus_areas) or []

    def set_focus_areas(self, value):
        self.focus_areas = _json_dump(value)

    def get_sdg_ids(self):
        return _json_load(self.sdg_ids) or []

    def set_sdg_ids(self, value):
        self.sdg_ids = _json_dump(value)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'org_type': self.org_type,
            'country': self.country,
            'city': self.city,
            'year_established': self.year_established,
            'annual_budget': self.annual_budget,
            'staff_count': self.staff_count,
            'sectors': self.get_sectors(),
            'description': self.description,
            'mission': self.mission,
            'registration_status': self.registration_status,
            'registration_number': self.registration_number,
            'verified': self.verified,
            'website': self.website,
            'logo_url': self.logo_url,
            'assess_score': self.assess_score,
            'assess_date': self.assess_date.isoformat() if self.assess_date else None,
            'geographic_areas': self.get_geographic_areas(),
            'focus_areas': self.get_focus_areas(),
            'sdg_ids': self.get_sdg_ids(),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
