"""Compliance models - Sanctions screening and registration verification."""

from datetime import datetime, timezone

from app.extensions import db
from app.utils.helpers import _json_load, _json_dump


class ComplianceCheck(db.Model):
    """Sanctions and compliance screening results."""
    __tablename__ = 'compliance_checks'
    __table_args__ = (
        db.Index('ix_compliance_org_date', 'org_id', 'checked_at'),
    )

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, db.ForeignKey('organizations.id'), nullable=False, index=True)
    check_type = db.Column(db.String(50), nullable=False)
    # sanctions_un, sanctions_ofac, sanctions_eu, blacklist, registration
    status = db.Column(db.String(50), default='pending')  # clear, flagged, pending, error
    result = db.Column(db.Text, nullable=True)  # JSON
    checked_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    # --- JSON helpers ---
    def get_result(self):
        return _json_load(self.result) or {}

    def set_result(self, value):
        self.result = _json_dump(value)

    def to_dict(self):
        return {
            'id': self.id,
            'org_id': self.org_id,
            'check_type': self.check_type,
            'status': self.status,
            'result': self.get_result(),
            'checked_at': self.checked_at.isoformat() if self.checked_at else None,
            'org_name': self.organization.name if self.organization else None,
        }


class RegistrationVerification(db.Model):
    """Registration verification checks for NGO organizations."""
    __tablename__ = 'registration_verifications'

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, db.ForeignKey('organizations.id'), nullable=False, index=True)
    status = db.Column(db.String(50), default='unverified')
    # unverified, pending, ai_reviewed, verified, flagged, expired
    registration_number = db.Column(db.String(200), nullable=True)
    registration_authority = db.Column(db.String(300), nullable=True)
    registry_check_result = db.Column(db.Text, nullable=True)  # JSON - live registry check result
    registration_date = db.Column(db.Date, nullable=True)
    expiry_date = db.Column(db.Date, nullable=True)
    country = db.Column(db.String(100), nullable=True)
    ai_analysis = db.Column(db.Text, nullable=True)  # JSON
    ai_confidence = db.Column(db.Float, nullable=True)  # 0-100
    document_id = db.Column(db.Integer, db.ForeignKey('documents.id'), nullable=True)
    verified_by_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    verified_at = db.Column(db.DateTime, nullable=True)
    notes = db.Column(db.Text, nullable=True)
    registry_url = db.Column(db.String(500), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    organization = db.relationship('Organization', backref=db.backref('verifications', lazy='dynamic'))
    document = db.relationship('Document', backref='verification')
    verified_by = db.relationship('User', backref='verifications_performed')

    def get_ai_analysis(self):
        return _json_load(self.ai_analysis) or {}

    def set_ai_analysis(self, value):
        self.ai_analysis = _json_dump(value)

    def get_registry_check_result(self):
        return _json_load(self.registry_check_result) or {}

    def set_registry_check_result(self, value):
        self.registry_check_result = _json_dump(value)

    def to_dict(self):
        return {
            'id': self.id,
            'org_id': self.org_id,
            'org_name': self.organization.name if self.organization else None,
            'org_country': self.organization.country if self.organization else None,
            'status': self.status,
            'registration_number': self.registration_number,
            'registration_authority': self.registration_authority,
            'registry_check_result': self.get_registry_check_result(),
            'registration_date': self.registration_date.isoformat() if self.registration_date else None,
            'expiry_date': self.expiry_date.isoformat() if self.expiry_date else None,
            'country': self.country,
            'ai_analysis': self.get_ai_analysis(),
            'ai_confidence': self.ai_confidence,
            'document_id': self.document_id,
            'verified_by_user_id': self.verified_by_user_id,
            'verified_by_name': self.verified_by.name if self.verified_by else None,
            'verified_at': self.verified_at.isoformat() if self.verified_at else None,
            'notes': self.notes,
            'registry_url': self.registry_url,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
