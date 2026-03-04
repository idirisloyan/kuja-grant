"""User model - NGO staff, Donors, Reviewers, Admins."""

from datetime import datetime, timezone

from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash

from app.extensions import db


class User(UserMixin, db.Model):
    """User accounts - NGO staff, Donors, Reviewers, Admins."""
    __tablename__ = 'users'
    __table_args__ = (
        db.Index('ix_users_role', 'role'),
        db.Index('ix_users_org_id', 'org_id'),
    )

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(50), nullable=False, default='ngo')  # ngo, donor, reviewer, admin
    org_id = db.Column(db.Integer, db.ForeignKey('organizations.id'), nullable=True)
    language = db.Column(db.String(10), default='en')
    avatar_url = db.Column(db.String(500), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    is_active = db.Column(db.Boolean, default=True)

    # Relationships
    organization = db.relationship('Organization', backref=db.backref('users', lazy='dynamic'))
    reviews = db.relationship('Review', backref='reviewer', lazy='dynamic')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self, include_org=False):
        data = {
            'id': self.id,
            'email': self.email,
            'name': self.name,
            'role': self.role,
            'org_id': self.org_id,
            'language': self.language,
            'avatar_url': self.avatar_url,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'is_active': self.is_active,
        }
        if include_org and self.organization:
            data['organization'] = self.organization.to_dict()
        return data
