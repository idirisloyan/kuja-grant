#!/usr/bin/env python3
"""
==============================================================================
  Kuja Grant Management System - Flask Backend
  A comprehensive grant management platform for NGOs and Donors
  in the humanitarian sector.
==============================================================================

Sections:
  1. Imports & Configuration
  2. Flask App & Extensions Setup
  3. Database Models
  4. Flask-Login Setup
  5. Helper Functions
  6. AI Service (Claude API + Fallback)
  7. Scoring Engine
  8. Compliance / Sanctions Screening Service
  9. API Routes - Auth
  10. API Routes - Dashboard
  11. API Routes - Organizations
  12. API Routes - Grants
  13. API Routes - Applications
  14. API Routes - Assessments
  15. API Routes - Documents
  16. API Routes - AI
  17. API Routes - Compliance
  18. API Routes - Reviews
  18b. API Routes - Reports
  19. Error Handlers
  20. Static / SPA Fallback
"""

# =============================================================================
# 1. IMPORTS & CONFIGURATION
# =============================================================================

import os
import sys
import json
import uuid
import math
import re
import logging
from datetime import datetime, date, timedelta
from functools import wraps

from flask import (
    Flask, request, jsonify, session, send_from_directory,
    abort, current_app, g
)
from flask_sqlalchemy import SQLAlchemy
from flask_login import (
    LoginManager, UserMixin, login_user, logout_user,
    login_required, current_user
)
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename

# Optional: Anthropic SDK for Claude AI integration
try:
    import anthropic
    HAS_ANTHROPIC = True
except ImportError:
    HAS_ANTHROPIC = False

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger('kuja')


# =============================================================================
# 2. FLASK APP & EXTENSIONS SETUP
# =============================================================================

# Base directory for the project
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Allowed file extensions for document uploads
ALLOWED_EXTENSIONS = {'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'png', 'jpg', 'jpeg', 'txt'}

# Create Flask app
app = Flask(
    __name__,
    static_folder=os.path.join(BASE_DIR, 'static'),
    template_folder=os.path.join(BASE_DIR, 'templates')
)

# Configuration
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'kuja-dev-secret-key-change-in-production')
# Always use absolute path for SQLite to avoid cwd-dependent path issues
_db_url = os.getenv('DATABASE_URL', '')
if not _db_url or _db_url == 'sqlite:///kuja.db':
    _db_url = f"sqlite:///{os.path.join(BASE_DIR, 'kuja.db')}"
app.config['SQLALCHEMY_DATABASE_URI'] = _db_url
# Fix Heroku-style postgres:// URIs
if app.config['SQLALCHEMY_DATABASE_URI'].startswith('postgres://'):
    app.config['SQLALCHEMY_DATABASE_URI'] = app.config['SQLALCHEMY_DATABASE_URI'].replace(
        'postgres://', 'postgresql://', 1
    )
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'pool_pre_ping': True,
}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB max upload
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_HTTPONLY'] = True

# Anthropic API key
ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY', '')

# Initialize extensions
db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.session_protection = 'strong'
CORS(app, supports_credentials=True, resources={r"/api/*": {"origins": "*"}})


# =============================================================================
# 3. DATABASE MODELS
# =============================================================================

class User(UserMixin, db.Model):
    """User accounts - NGO staff, Donors, Reviewers, Admins."""
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(50), nullable=False, default='ngo')  # ngo, donor, reviewer, admin
    org_id = db.Column(db.Integer, db.ForeignKey('organizations.id'), nullable=True)
    language = db.Column(db.String(10), default='en')
    avatar_url = db.Column(db.String(500), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
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


class Organization(db.Model):
    """Organizations - NGOs, Donors, INGOs, CBOs, Networks."""
    __tablename__ = 'organizations'

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
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

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
        }


class Grant(db.Model):
    """Grant opportunities posted by donors."""
    __tablename__ = 'grants'

    id = db.Column(db.Integer, primary_key=True)
    donor_org_id = db.Column(db.Integer, db.ForeignKey('organizations.id'), nullable=False, index=True)
    title = db.Column(db.String(500), nullable=False)
    description = db.Column(db.Text, nullable=True)
    total_funding = db.Column(db.Float, nullable=True)
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
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
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
            'total_funding': self.total_funding,
            'currency': self.currency,
            'deadline': self.deadline.isoformat() if self.deadline else None,
            'status': self.status,
            'sectors': self.get_sectors(),
            'countries': self.get_countries(),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'published_at': self.published_at.isoformat() if self.published_at else None,
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


class Application(db.Model):
    """Grant applications submitted by NGOs."""
    __tablename__ = 'applications'

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
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    documents = db.relationship('Document', backref='application', lazy='dynamic')
    reviews = db.relationship('Review', backref='application', lazy='dynamic')

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
        }
        if not summary:
            data['responses'] = self.get_responses()
            data['eligibility_responses'] = self.get_eligibility_responses()
        # Include related names
        if self.grant:
            data['grant_title'] = self.grant.title
        if self.ngo_org:
            data['ngo_org_name'] = self.ngo_org.name
        return data


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
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    documents = db.relationship('Document', backref='assessment', lazy='dynamic')

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


class Document(db.Model):
    """Uploaded documents attached to applications or assessments."""
    __tablename__ = 'documents'

    id = db.Column(db.Integer, primary_key=True)
    application_id = db.Column(db.Integer, db.ForeignKey('applications.id'), nullable=True, index=True)
    assessment_id = db.Column(db.Integer, db.ForeignKey('assessments.id'), nullable=True, index=True)
    doc_type = db.Column(db.String(100), nullable=True)
    original_filename = db.Column(db.String(500), nullable=False)
    stored_filename = db.Column(db.String(500), nullable=False)
    file_size = db.Column(db.Integer, nullable=True)
    mime_type = db.Column(db.String(200), nullable=True)
    ai_analysis = db.Column(db.Text, nullable=True)  # JSON with score, findings, recommendations
    score = db.Column(db.Float, nullable=True)
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow)

    # --- JSON helpers ---
    def get_ai_analysis(self):
        return _json_load(self.ai_analysis) or {}

    def set_ai_analysis(self, value):
        self.ai_analysis = _json_dump(value)

    def to_dict(self):
        return {
            'id': self.id,
            'application_id': self.application_id,
            'assessment_id': self.assessment_id,
            'doc_type': self.doc_type,
            'original_filename': self.original_filename,
            'stored_filename': self.stored_filename,
            'file_size': self.file_size,
            'mime_type': self.mime_type,
            'ai_analysis': self.get_ai_analysis(),
            'score': self.score,
            'uploaded_at': self.uploaded_at.isoformat() if self.uploaded_at else None,
        }


class Review(db.Model):
    """Reviewer evaluations of applications."""
    __tablename__ = 'reviews'

    id = db.Column(db.Integer, primary_key=True)
    application_id = db.Column(db.Integer, db.ForeignKey('applications.id'), nullable=False, index=True)
    reviewer_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    scores = db.Column(db.Text, nullable=True)     # JSON dict keyed by criterion id
    comments = db.Column(db.Text, nullable=True)   # JSON dict
    overall_score = db.Column(db.Float, nullable=True)
    status = db.Column(db.String(50), default='assigned')  # assigned, in_progress, completed
    completed_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

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
            'reviewer_name': self.reviewer.name if self.reviewer else None,
            'application_title': self.application.grant.title if self.application and self.application.grant else None,
        }


class ComplianceCheck(db.Model):
    """Sanctions and compliance screening results."""
    __tablename__ = 'compliance_checks'

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, db.ForeignKey('organizations.id'), nullable=False, index=True)
    check_type = db.Column(db.String(50), nullable=False)
    # sanctions_un, sanctions_ofac, sanctions_eu, blacklist, registration
    status = db.Column(db.String(50), default='pending')  # clear, flagged, pending, error
    result = db.Column(db.Text, nullable=True)  # JSON
    checked_at = db.Column(db.DateTime, default=datetime.utcnow)

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


class Report(db.Model):
    """Grant reports submitted by NGOs back to donors."""
    __tablename__ = 'reports'

    id = db.Column(db.Integer, primary_key=True)
    grant_id = db.Column(db.Integer, db.ForeignKey('grants.id'), nullable=False, index=True)
    application_id = db.Column(db.Integer, db.ForeignKey('applications.id'), nullable=True, index=True)
    submitted_by_org_id = db.Column(db.Integer, db.ForeignKey('organizations.id'), nullable=False)
    report_type = db.Column(db.String(50), nullable=False)  # financial, narrative, impact, progress, final
    reporting_period = db.Column(db.String(100), nullable=True)  # e.g. "Q1 2026", "Jan-Mar 2026"
    title = db.Column(db.String(500), nullable=True)
    content = db.Column(db.Text, nullable=True)  # JSON - structured report content
    attachments = db.Column(db.Text, nullable=True)  # JSON array of document IDs
    status = db.Column(db.String(50), default='draft')  # draft, submitted, under_review, accepted, revision_requested
    due_date = db.Column(db.Date, nullable=True)
    submitted_at = db.Column(db.DateTime, nullable=True)
    reviewed_at = db.Column(db.DateTime, nullable=True)
    reviewer_notes = db.Column(db.Text, nullable=True)
    ai_analysis = db.Column(db.Text, nullable=True)  # JSON - AI review of the report
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    grant = db.relationship('Grant', backref=db.backref('reports', lazy='dynamic'))
    application = db.relationship('Application', backref=db.backref('reports', lazy='dynamic'))
    submitted_by_org = db.relationship('Organization', backref=db.backref('submitted_reports', lazy='dynamic'))

    # JSON helpers
    def get_content(self):
        return _json_load(self.content) or {}
    def set_content(self, value):
        self.content = _json_dump(value)
    def get_attachments(self):
        return _json_load(self.attachments) or []
    def set_attachments(self, value):
        self.attachments = _json_dump(value)
    def get_ai_analysis(self):
        return _json_load(self.ai_analysis) or {}
    def set_ai_analysis(self, value):
        self.ai_analysis = _json_dump(value)

    def to_dict(self):
        return {
            'id': self.id,
            'grant_id': self.grant_id,
            'application_id': self.application_id,
            'submitted_by_org_id': self.submitted_by_org_id,
            'report_type': self.report_type,
            'reporting_period': self.reporting_period,
            'title': self.title,
            'content': self.get_content(),
            'attachments': self.get_attachments(),
            'status': self.status,
            'due_date': self.due_date.isoformat() if self.due_date else None,
            'submitted_at': self.submitted_at.isoformat() if self.submitted_at else None,
            'reviewed_at': self.reviewed_at.isoformat() if self.reviewed_at else None,
            'reviewer_notes': self.reviewer_notes,
            'ai_analysis': self.get_ai_analysis(),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'grant_title': self.grant.title if self.grant else None,
            'org_name': self.submitted_by_org.name if self.submitted_by_org else None,
        }


# =============================================================================
# 4. FLASK-LOGIN SETUP
# =============================================================================

@login_manager.user_loader
def load_user(user_id):
    """Load user by ID for Flask-Login session management."""
    return db.session.get(User, int(user_id))


@login_manager.unauthorized_handler
def unauthorized():
    """Return 401 JSON response for unauthenticated API requests."""
    return jsonify({'error': 'Authentication required', 'success': False}), 401


# =============================================================================
# 5. HELPER FUNCTIONS
# =============================================================================

def _json_load(text):
    """Safely parse a JSON string from a Text column."""
    if text is None:
        return None
    if isinstance(text, (dict, list)):
        return text
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return None


def _json_dump(obj):
    """Serialize a Python object to a JSON string for storage."""
    if obj is None:
        return None
    if isinstance(obj, str):
        return obj
    return json.dumps(obj, default=str)


def allowed_file(filename):
    """Check if a filename has an allowed extension."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def role_required(*roles):
    """Decorator that restricts access to users with specific roles."""
    def decorator(f):
        @wraps(f)
        @login_required
        def decorated_function(*args, **kwargs):
            if current_user.role not in roles:
                return jsonify({'error': 'Insufficient permissions', 'success': False}), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator


def get_request_json():
    """Get JSON body from request, return empty dict if none."""
    data = request.get_json(silent=True)
    return data if data else {}


def paginate_query(query, default_per_page=20, max_per_page=100):
    """Apply pagination to a SQLAlchemy query based on request args."""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', default_per_page, type=int)
    per_page = min(per_page, max_per_page)
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    return pagination


# =============================================================================
# 6. AI SERVICE (Claude API + Intelligent Fallback)
# =============================================================================

class AIService:
    """
    AI Service wrapping the Anthropic Claude API.
    Falls back to intelligent simulated responses when no API key is set
    or when the API call fails.
    """

    # ---- Document analysis templates keyed by doc_type / extension ----
    DOC_ANALYSIS_TEMPLATES = {
        'financial_report': {
            'score': 78,
            'findings': [
                'Financial statements cover the required reporting period',
                'Revenue and expenditure breakdown is provided',
                'Auditor signature and certification detected',
                'Some line items lack sufficient detail for full verification',
            ],
            'recommendations': [
                'Include disaggregated expenditure by project/program',
                'Add comparative figures for the previous fiscal year',
                'Provide notes to the financial statements for major items',
            ],
        },
        'audit_report': {
            'score': 85,
            'findings': [
                'Audit conducted by a registered independent firm',
                'Unqualified (clean) opinion issued',
                'Internal controls assessment included',
                'No material misstatements identified',
            ],
            'recommendations': [
                'Ensure management letter recommendations are addressed',
                'Include a going-concern assessment paragraph',
            ],
        },
        'registration_certificate': {
            'score': 90,
            'findings': [
                'Organization registration number is present and legible',
                'Registration authority name and seal detected',
                'Registration date and validity period confirmed',
                'Organization name matches application records',
            ],
            'recommendations': [
                'Ensure registration is current and not expired',
                'Provide translated copy if original is not in English',
            ],
        },
        'proposal': {
            'score': 72,
            'findings': [
                'Project objectives are stated but could be more specific',
                'Budget summary is included',
                'Timeline / workplan section detected',
                'Logical framework is partially complete',
            ],
            'recommendations': [
                'Add SMART indicators for each objective',
                'Include a detailed risk mitigation plan',
                'Strengthen the sustainability section with exit strategy',
                'Add baseline data and targets for key indicators',
            ],
        },
        'default': {
            'score': 70,
            'findings': [
                'Document received and readable',
                'Content appears relevant to the submission',
                'Document format and structure are acceptable',
            ],
            'recommendations': [
                'Ensure all required sections are complete',
                'Add page numbers and a table of contents for longer documents',
                'Include organizational branding and date of preparation',
            ],
        },
    }

    # ---- Chat response templates by role ----
    CHAT_TEMPLATES = {
        'ngo': {
            'default': (
                "I can help you with your grant applications, organizational assessments, "
                "and compliance requirements. Here are some things I can assist with:\n\n"
                "- **Application writing**: I can review your responses and suggest improvements\n"
                "- **Document preparation**: Tips on what donors look for in supporting documents\n"
                "- **Eligibility check**: Verify your organization meets grant requirements\n"
                "- **Assessment guidance**: Walk through the organizational capacity assessment\n\n"
                "What would you like help with?"
            ),
            'application': (
                "For a strong grant application, focus on these key areas:\n\n"
                "1. **Alignment**: Show how your project directly addresses the grant objectives\n"
                "2. **Evidence**: Use data and past results to demonstrate capability\n"
                "3. **Budget realism**: Ensure costs are justified and reasonable\n"
                "4. **Sustainability**: Explain how impact continues after funding ends\n"
                "5. **M&E Framework**: Include clear indicators and measurement plans\n\n"
                "Would you like me to review a specific section of your application?"
            ),
        },
        'donor': {
            'default': (
                "I can assist you with grant management, application reviews, and "
                "compliance oversight. Here are my capabilities:\n\n"
                "- **Grant design**: Help structure eligibility criteria and scoring rubrics\n"
                "- **Application screening**: Automated scoring and ranking of submissions\n"
                "- **Compliance checks**: Run sanctions screening on applicant organizations\n"
                "- **Portfolio analytics**: Insights on your funding portfolio\n\n"
                "How can I help you today?"
            ),
        },
        'reviewer': {
            'default': (
                "I can support your review process with:\n\n"
                "- **Scoring guidance**: Calibration tips for consistent evaluation\n"
                "- **Application analysis**: Quick summary of key strengths and weaknesses\n"
                "- **Comparative insights**: How this application compares to others\n"
                "- **Criteria interpretation**: Clarification of what each criterion expects\n\n"
                "Which application would you like to discuss?"
            ),
        },
    }

    # ---- Guidance templates by field type ----
    GUIDANCE_TEMPLATES = {
        'project_description': {
            'guidance': (
                "A strong project description should include:\n\n"
                "1. **Problem statement**: What specific issue does your project address? "
                "Use local data and evidence.\n"
                "2. **Target population**: Who benefits and how were they identified?\n"
                "3. **Approach**: What methodology or intervention will you use?\n"
                "4. **Innovation**: What makes your approach different or better?\n"
                "5. **Expected results**: Quantify the change you expect to create.\n\n"
                "Keep your language clear and jargon-free. Donors appreciate specificity "
                "over broad generalizations."
            ),
            'quality_score': 0,
        },
        'organizational_capacity': {
            'guidance': (
                "When describing your organizational capacity, cover:\n\n"
                "1. **Track record**: List 2-3 similar projects you have delivered\n"
                "2. **Team expertise**: Highlight relevant qualifications and experience\n"
                "3. **Systems**: Describe your financial management, HR, and M&E systems\n"
                "4. **Partnerships**: Mention key local and international partners\n"
                "5. **Reach**: Quantify your geographic coverage and beneficiary numbers\n\n"
                "Provide concrete examples rather than generic claims."
            ),
            'quality_score': 0,
        },
        'budget_justification': {
            'guidance': (
                "An effective budget justification should:\n\n"
                "1. **Link costs to activities**: Every budget line should trace to a project activity\n"
                "2. **Market rates**: Show that costs reflect local market prices\n"
                "3. **Cost-efficiency**: Compare cost-per-beneficiary to sector benchmarks\n"
                "4. **Co-funding**: Highlight any matching or leveraged funds\n"
                "5. **Indirect costs**: Explain overhead in line with donor policy\n\n"
                "Avoid round numbers; use actual quotes or price lists where possible."
            ),
            'quality_score': 0,
        },
        'sustainability': {
            'guidance': (
                "Donors want to know impact continues after funding. Address:\n\n"
                "1. **Exit strategy**: How will activities transition to local ownership?\n"
                "2. **Revenue model**: Will the project generate its own income?\n"
                "3. **Institutional embedding**: Are results integrated into government systems?\n"
                "4. **Community ownership**: How are beneficiaries involved in design and management?\n"
                "5. **Phased approach**: Show a realistic timeline for sustainability milestones\n\n"
                "Be honest about challenges and how you plan to mitigate them."
            ),
            'quality_score': 0,
        },
        'default': {
            'guidance': (
                "When writing this section of your application:\n\n"
                "1. **Read the criteria carefully**: Address every sub-point the donor has listed\n"
                "2. **Be specific**: Use numbers, dates, and concrete examples\n"
                "3. **Stay within word limits**: Be concise but thorough\n"
                "4. **Use evidence**: Reference data, reports, or evaluations\n"
                "5. **Check alignment**: Ensure your response maps to the grant objectives\n\n"
                "Would you like me to review what you have written so far?"
            ),
            'quality_score': 0,
        },
    }

    @staticmethod
    def _call_claude(system_prompt, user_message, max_tokens=1024):
        """
        Call the Anthropic Claude API. Returns the response text or None on failure.
        """
        if not ANTHROPIC_API_KEY or not HAS_ANTHROPIC:
            return None
        try:
            client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
            message = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=max_tokens,
                system=system_prompt,
                messages=[{"role": "user", "content": user_message}],
            )
            return message.content[0].text
        except Exception as e:
            logger.warning(f"Claude API call failed: {e}")
            return None

    @classmethod
    def chat(cls, message, context=None, user_role='ngo'):
        """
        Respond to a user chat message.
        Uses Claude API if available, otherwise returns a contextual template.
        """
        system_prompt = (
            "You are Kuja AI, an assistant for the Kuja Grant Management System. "
            "You help NGOs write grant applications, help donors manage grants, "
            "and help reviewers evaluate applications. "
            "You are knowledgeable about humanitarian funding, USAID/DFID/EU regulations, "
            "logical frameworks, M&E, and organizational capacity building. "
            "Be concise, practical, and supportive."
        )
        if context:
            system_prompt += f"\n\nCurrent context: {json.dumps(context)}"

        response_text = cls._call_claude(system_prompt, message, max_tokens=1024)
        if response_text:
            return {'response': response_text, 'source': 'claude'}

        # Fallback: pick appropriate template
        role_templates = cls.CHAT_TEMPLATES.get(user_role, cls.CHAT_TEMPLATES['ngo'])
        # Try to match context keyword
        ctx_key = 'default'
        if context and isinstance(context, dict):
            page = context.get('page', '').lower()
            if 'application' in page or 'apply' in page:
                ctx_key = 'application'
        template = role_templates.get(ctx_key, role_templates['default'])
        return {'response': template, 'source': 'template'}

    @classmethod
    def guidance(cls, field_name, grant_criteria=None, current_text=''):
        """
        Provide writing guidance for a specific application field.
        """
        system_prompt = (
            "You are a grant writing coach. Provide specific, actionable advice "
            "to improve the user's response to this grant application criterion. "
            "Be encouraging but honest about weaknesses."
        )
        user_msg = f"Field: {field_name}\n"
        if grant_criteria:
            user_msg += f"Criterion: {json.dumps(grant_criteria)}\n"
        if current_text:
            user_msg += f"Current draft:\n{current_text}\n"
        user_msg += "\nProvide guidance and a quality score (0-100)."

        response_text = cls._call_claude(system_prompt, user_msg, max_tokens=800)
        if response_text:
            # Try to extract score from Claude response
            score = cls._extract_score_from_text(response_text)
            return {'guidance': response_text, 'quality_score': score, 'source': 'claude'}

        # Fallback
        # Normalize field name for template lookup
        norm_field = field_name.lower().replace(' ', '_').replace('-', '_')
        template = cls.GUIDANCE_TEMPLATES.get(norm_field, cls.GUIDANCE_TEMPLATES['default']).copy()

        # If current_text is provided, score it
        if current_text.strip():
            template['quality_score'] = cls._quick_text_score(current_text, grant_criteria)
            if template['quality_score'] >= 70:
                template['guidance'] = (
                    "Your draft is looking good! Here are a few suggestions to strengthen it:\n\n"
                    "- Add more specific data points and quantified outcomes\n"
                    "- Reference past project results as evidence\n"
                    "- Ensure every sub-criterion is explicitly addressed\n"
                    "- Check for clarity and conciseness\n\n"
                    + template['guidance']
                )
        template['source'] = 'template'
        return template

    @staticmethod
    def analyze_document(filename, doc_type=None, file_size=None, file_path=None):
        """
        Analyze an uploaded document using AI.
        Uses Claude if available, else returns realistic simulated results based on doc_type.
        """
        # Try real AI analysis first
        if HAS_ANTHROPIC and ANTHROPIC_API_KEY and file_path:
            try:
                # Read file content
                file_content = ''
                ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
                if ext in ('txt', 'csv'):
                    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                        file_content = f.read()[:6000]  # Limit to 6000 chars
                elif ext in ('pdf', 'doc', 'docx'):
                    file_content = f"[Binary document: {filename}, type: {doc_type}, size: {file_size} bytes]"
                else:
                    file_content = f"[File: {filename}, type: {doc_type}, size: {file_size} bytes]"

                client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

                prompt = f"""Analyze this document for a grant management system.

Document: {filename}
Type: {doc_type}
Size: {file_size} bytes
Content: {file_content}

Evaluate the document for:
1. Relevance to the document type ({doc_type})
2. Completeness
3. Quality and professionalism
4. Compliance with typical donor requirements

Return a JSON object with:
- score (0-100, be realistic)
- findings (array of 3-5 specific findings about the document)
- recommendations (array of 2-4 specific improvement recommendations)

Return ONLY valid JSON."""

                response = client.messages.create(
                    model="claude-sonnet-4-20250514",
                    max_tokens=1000,
                    messages=[{"role": "user", "content": prompt}]
                )

                text = response.content[0].text.strip()
                if text.startswith('{'):
                    return json.loads(text)
                import re as _re
                json_match = _re.search(r'\{[\s\S]*\}', text)
                if json_match:
                    return json.loads(json_match.group())
            except Exception as e:
                logger.error(f"AI document analysis failed, using fallback: {e}")

        # Fallback to template-based analysis
        template_key = (doc_type or '').lower().replace(' ', '_')
        template = AIService.DOC_ANALYSIS_TEMPLATES.get(
            template_key, AIService.DOC_ANALYSIS_TEMPLATES['default']
        ).copy()

        # Add file-specific details
        ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
        if ext == 'pdf':
            template['findings'] = list(template['findings'])
            template['findings'].append('Document is in PDF format (preferred)')
            template['score'] = min(template['score'] + 3, 100)
        elif ext in ('doc', 'docx'):
            template['findings'] = list(template['findings'])
            template['findings'].append('Document is in Word format')
        elif ext in ('xls', 'xlsx'):
            template['findings'] = list(template['findings'])
            template['findings'].append('Document is in spreadsheet format')
            template['score'] = min(template['score'] + 2, 100)
        elif ext in ('png', 'jpg', 'jpeg'):
            template['findings'] = ['Document is an image file - text extraction limited']
            template['recommendations'] = list(template['recommendations'])
            template['recommendations'].append('Provide a PDF or Word version for better analysis')
            template['score'] = max(template['score'] - 15, 30)

        # Adjust score based on file size
        if file_size and file_size < 1024:
            template['score'] = max(40, template['score'] - 15)
            template['findings'] = list(template['findings'])
            template['findings'].append('Document appears very small - may be incomplete')

        if file_size and file_size < 5000:
            template['findings'] = list(template['findings'])
            template['findings'].append('Document is very small; may be incomplete')
            template['score'] = max(template['score'] - 10, 20)

        return template

    @staticmethod
    def _extract_score_from_text(text):
        """Try to extract a numeric score from AI response text."""
        patterns = [
            r'(?:score|quality)[:\s]*(\d{1,3})',
            r'(\d{1,3})\s*(?:/\s*100|out of 100|%)',
            r'(?:rating|grade)[:\s]*(\d{1,3})',
        ]
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                val = int(match.group(1))
                if 0 <= val <= 100:
                    return val
        return 65  # default

    @staticmethod
    def _quick_text_score(text, criteria=None):
        """
        Quick heuristic quality score for a text response.
        Used as fallback when Claude API is unavailable.
        """
        score = 30  # base
        words = text.split()
        word_count = len(words)

        # Word count scoring
        if word_count >= 50:
            score += 10
        if word_count >= 100:
            score += 10
        if word_count >= 200:
            score += 5
        if word_count >= 300:
            score += 5

        # Structure indicators
        if any(c in text for c in ['\n', '- ', '* ', '1.', '2.']):
            score += 5  # structured formatting
        if any(w in text.lower() for w in ['because', 'therefore', 'as a result', 'evidence']):
            score += 5  # reasoning
        if any(w in text.lower() for w in ['%', 'percent', 'number', 'total', 'increase', 'decrease']):
            score += 5  # quantitative language

        # Keyword relevance from criteria
        if criteria and isinstance(criteria, dict):
            label = criteria.get('label', '').lower()
            desc = criteria.get('desc', '').lower()
            keywords = set(re.findall(r'\b[a-z]{4,}\b', label + ' ' + desc))
            text_lower = text.lower()
            matches = sum(1 for kw in keywords if kw in text_lower)
            if keywords:
                relevance = matches / len(keywords)
                score += int(relevance * 20)

            # Word count vs max
            max_words = criteria.get('maxWords', 500)
            if max_words and max_words > 0:
                fill_ratio = word_count / max_words
                if 0.5 <= fill_ratio <= 1.0:
                    score += 10
                elif 0.3 <= fill_ratio < 0.5:
                    score += 5

        return min(score, 100)

    @staticmethod
    def analyze_report(content, requirements, report_type):
        """Analyze a submitted report against grant reporting requirements."""
        if HAS_ANTHROPIC and ANTHROPIC_API_KEY:
            try:
                client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

                prompt = f"""Analyze this grant report against the reporting requirements.

Report Type: {report_type}
Report Content: {json.dumps(content) if isinstance(content, dict) else str(content)}

Reporting Requirements: {json.dumps(requirements)}

Evaluate:
1. Completeness - are all required sections covered?
2. Quality - is the content detailed and specific enough?
3. Compliance - does it meet the stated requirements?
4. Data quality - are metrics/indicators properly reported?

Return a JSON object with:
- score (0-100)
- completeness_score (0-100)
- quality_score (0-100)
- findings (array of strings)
- missing_items (array of strings - what's missing)
- recommendations (array of strings)
- summary (1-2 sentence overall assessment)

Return ONLY valid JSON, no other text."""

                response = client.messages.create(
                    model="claude-sonnet-4-20250514",
                    max_tokens=1500,
                    messages=[{"role": "user", "content": prompt}]
                )

                text = response.content[0].text.strip()
                # Try to parse JSON from response
                if text.startswith('{'):
                    return json.loads(text)
                # Try to find JSON in the response
                import re as _re
                json_match = _re.search(r'\{[\s\S]*\}', text)
                if json_match:
                    return json.loads(json_match.group())
            except Exception as e:
                logger.error(f"AI report analysis failed: {e}")

        # Fallback simulated analysis
        num_sections = len(content) if isinstance(content, dict) else 1
        completeness = min(100, num_sections * 20)
        return {
            'score': max(50, completeness - 10),
            'completeness_score': completeness,
            'quality_score': 65,
            'findings': [
                'Report structure follows the expected format',
                'Key sections are present',
                f'Report covers {report_type} requirements',
            ],
            'missing_items': ['Detailed budget variance analysis', 'Beneficiary disaggregated data'] if completeness < 100 else [],
            'recommendations': [
                'Include more specific quantitative indicators',
                'Add comparison with planned vs actual results',
                'Strengthen the lessons learned section',
            ],
            'summary': f'The {report_type} report covers the basic requirements but could benefit from more detailed quantitative data and analysis.'
        }

    @staticmethod
    def extract_reporting_requirements(file_content, grant_title=''):
        """Extract reporting requirements from a grant document using AI."""
        if HAS_ANTHROPIC and ANTHROPIC_API_KEY:
            try:
                client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

                # Truncate if too long
                truncated = file_content[:8000] if len(file_content) > 8000 else file_content

                prompt = f"""Analyze this grant document and extract the reporting requirements.

Grant Title: {grant_title}
Document Content:
{truncated}

Extract and return a JSON object with:
- reporting_frequency: one of "monthly", "quarterly", "semi-annual", "annual", "final_only"
- requirements: array of objects, each with:
  - type: "financial", "narrative", "impact", "progress", or "final"
  - title: short title for this requirement
  - description: what needs to be reported
  - frequency: how often (monthly/quarterly/semi-annual/annual/final)
  - due_days_after_period: number of days after period end the report is due
- template_sections: array of section objects for the report template, each with:
  - title: section heading
  - description: what to include
  - required: boolean
- indicators: array of key performance indicators to track, each with:
  - name: indicator name
  - target: target value if specified
  - unit: unit of measurement

If the document doesn't clearly specify reporting requirements, infer reasonable ones based on the grant type and sector.

Return ONLY valid JSON, no other text."""

                response = client.messages.create(
                    model="claude-sonnet-4-20250514",
                    max_tokens=2000,
                    messages=[{"role": "user", "content": prompt}]
                )

                text = response.content[0].text.strip()
                if text.startswith('{'):
                    return json.loads(text)
                import re as _re
                json_match = _re.search(r'\{[\s\S]*\}', text)
                if json_match:
                    return json.loads(json_match.group())
            except Exception as e:
                logger.error(f"AI requirement extraction failed: {e}")

        # Fallback simulated extraction
        return {
            'reporting_frequency': 'quarterly',
            'requirements': [
                {
                    'type': 'financial',
                    'title': 'Quarterly Financial Report',
                    'description': 'Detailed financial statement showing expenditures against approved budget, including variance analysis and explanation of significant deviations.',
                    'frequency': 'quarterly',
                    'due_days_after_period': 30,
                },
                {
                    'type': 'narrative',
                    'title': 'Quarterly Progress Report',
                    'description': 'Narrative report on activities completed, outputs achieved, challenges faced, and planned activities for next quarter.',
                    'frequency': 'quarterly',
                    'due_days_after_period': 30,
                },
                {
                    'type': 'impact',
                    'title': 'Annual Impact Report',
                    'description': 'Comprehensive report on outcomes achieved, impact indicators, beneficiary data, and lessons learned.',
                    'frequency': 'annual',
                    'due_days_after_period': 60,
                },
                {
                    'type': 'final',
                    'title': 'Final Project Report',
                    'description': 'End-of-project report covering all activities, achievements, financial summary, sustainability plan, and recommendations.',
                    'frequency': 'final',
                    'due_days_after_period': 90,
                },
            ],
            'template_sections': [
                {'title': 'Executive Summary', 'description': 'Brief overview of the reporting period', 'required': True},
                {'title': 'Activities and Outputs', 'description': 'Detailed description of activities conducted and outputs achieved', 'required': True},
                {'title': 'Progress Against Indicators', 'description': 'Update on all key performance indicators with data', 'required': True},
                {'title': 'Financial Summary', 'description': 'Budget utilization and expenditure summary', 'required': True},
                {'title': 'Challenges and Mitigation', 'description': 'Issues encountered and how they were addressed', 'required': True},
                {'title': 'Beneficiary Data', 'description': 'Number and demographics of beneficiaries reached', 'required': True},
                {'title': 'Lessons Learned', 'description': 'Key learnings and best practices', 'required': False},
                {'title': 'Next Steps', 'description': 'Planned activities for the upcoming period', 'required': True},
            ],
            'indicators': [
                {'name': 'Direct beneficiaries reached', 'target': '', 'unit': 'people'},
                {'name': 'Budget utilization rate', 'target': '85%', 'unit': 'percentage'},
                {'name': 'Activities completed vs planned', 'target': '90%', 'unit': 'percentage'},
                {'name': 'Staff trained', 'target': '', 'unit': 'people'},
            ],
        }


# =============================================================================
# 7. SCORING ENGINE
# =============================================================================

class ScoringEngine:
    """
    Scores grant applications based on:
    - Response quality per criterion (word count, keywords, completeness)
    - Document scores from AI analysis
    - Eligibility compliance
    - Weighted overall score
    """

    @staticmethod
    def score_application(application):
        """
        Score a full application and return detailed breakdown.

        Returns:
            dict with keys: criterion_scores, document_score, eligibility_score,
                            overall_score, breakdown
        """
        grant = application.grant
        if not grant:
            return {'error': 'Grant not found', 'overall_score': 0}

        criteria = grant.get_criteria() or []
        responses = application.get_responses() or {}
        eligibility_defs = grant.get_eligibility() or []
        eligibility_responses = application.get_eligibility_responses() or {}

        # --- Score each criterion ---
        criterion_scores = {}
        total_weight = 0
        weighted_sum = 0

        for criterion in criteria:
            cid = str(criterion.get('id', ''))
            label = criterion.get('label', '')
            desc = criterion.get('desc', '')
            weight = criterion.get('weight', 1)
            max_words = criterion.get('maxWords', 500)
            response_text = responses.get(cid, '')

            if not isinstance(response_text, str):
                response_text = str(response_text) if response_text else ''

            cscore = ScoringEngine._score_criterion_response(
                response_text, label, desc, weight, max_words
            )
            criterion_scores[cid] = cscore
            total_weight += weight
            weighted_sum += cscore['score'] * weight

        criteria_avg = (weighted_sum / total_weight) if total_weight > 0 else 0

        # --- Score documents ---
        documents = Document.query.filter_by(application_id=application.id).all()
        doc_scores = []
        for doc in documents:
            dscore = doc.score if doc.score is not None else 0
            doc_scores.append({'id': doc.id, 'filename': doc.original_filename, 'score': dscore})
        doc_avg = (sum(d['score'] for d in doc_scores) / len(doc_scores)) if doc_scores else 0

        # --- Score eligibility ---
        eligibility_score = ScoringEngine._score_eligibility(eligibility_defs, eligibility_responses)

        # --- Calculate overall ---
        # Weights: criteria 60%, documents 20%, eligibility 20%
        overall = (criteria_avg * 0.60) + (doc_avg * 0.20) + (eligibility_score * 0.20)
        overall = round(overall, 2)

        return {
            'criterion_scores': criterion_scores,
            'criteria_average': round(criteria_avg, 2),
            'document_scores': doc_scores,
            'document_average': round(doc_avg, 2),
            'eligibility_score': round(eligibility_score, 2),
            'overall_score': overall,
            'breakdown': {
                'criteria_weight': 0.60,
                'documents_weight': 0.20,
                'eligibility_weight': 0.20,
            },
        }

    @staticmethod
    def _score_criterion_response(text, label, desc, weight, max_words):
        """Score a single criterion response."""
        if not text or not text.strip():
            return {
                'score': 0,
                'word_count': 0,
                'feedback': 'No response provided',
                'sub_scores': {'completeness': 0, 'relevance': 0, 'depth': 0},
            }

        words = text.split()
        word_count = len(words)

        # Sub-score: Completeness (based on word count vs max)
        if max_words and max_words > 0:
            fill_ratio = min(word_count / max_words, 1.2)
            if fill_ratio >= 0.7:
                completeness = 90 + min(fill_ratio - 0.7, 0.3) * 33
            elif fill_ratio >= 0.4:
                completeness = 50 + (fill_ratio - 0.4) * 133
            else:
                completeness = fill_ratio * 125
        else:
            completeness = min(word_count / 3, 100)  # ~300 words for 100
        completeness = min(completeness, 100)

        # Sub-score: Relevance (keyword matching)
        combined = (label + ' ' + desc).lower()
        keywords = set(re.findall(r'\b[a-z]{4,}\b', combined))
        # Remove very common words
        stopwords = {'this', 'that', 'with', 'from', 'your', 'have', 'will', 'been',
                      'what', 'when', 'where', 'which', 'their', 'there', 'these',
                      'those', 'about', 'would', 'could', 'should', 'does', 'into',
                      'than', 'then', 'them', 'some', 'more', 'also', 'each', 'such'}
        keywords -= stopwords
        text_lower = text.lower()
        if keywords:
            matches = sum(1 for kw in keywords if kw in text_lower)
            relevance = min((matches / len(keywords)) * 120, 100)
        else:
            relevance = 50  # neutral

        # Sub-score: Depth (structure, evidence, analysis)
        depth = 30  # base
        # Structural indicators
        if re.search(r'(\d+\.|\-\s|\*\s|•)', text):
            depth += 10  # uses lists/numbering
        if len(text.split('\n')) > 2:
            depth += 5   # multiple paragraphs
        # Evidence indicators
        evidence_words = ['data', 'evidence', 'study', 'survey', 'report', 'percent',
                          'increase', 'decrease', 'result', 'outcome', 'impact', 'baseline',
                          'target', 'indicator', 'beneficiar', 'household', 'community']
        evidence_count = sum(1 for w in evidence_words if w in text_lower)
        depth += min(evidence_count * 5, 30)
        # Analytical words
        analysis_words = ['because', 'therefore', 'however', 'furthermore', 'consequently',
                          'specifically', 'strategy', 'approach', 'framework', 'methodology']
        analysis_count = sum(1 for w in analysis_words if w in text_lower)
        depth += min(analysis_count * 5, 20)
        depth = min(depth, 100)

        # Composite score
        score = (completeness * 0.35) + (relevance * 0.35) + (depth * 0.30)
        score = round(min(score, 100), 1)

        # Feedback generation
        feedback_parts = []
        if completeness < 50:
            feedback_parts.append(f'Response is too brief ({word_count} words). Aim for at least {int(max_words * 0.6)} words.')
        if relevance < 40:
            feedback_parts.append('Response does not sufficiently address the criterion topic. Include more relevant keywords and concepts.')
        if depth < 40:
            feedback_parts.append('Add more evidence, data points, and analytical depth.')
        if score >= 75:
            feedback_parts.append('Strong response overall.')
        elif score >= 50:
            feedback_parts.append('Adequate response with room for improvement.')

        return {
            'score': score,
            'word_count': word_count,
            'max_words': max_words,
            'feedback': ' '.join(feedback_parts) if feedback_parts else 'Response meets basic requirements.',
            'sub_scores': {
                'completeness': round(completeness, 1),
                'relevance': round(relevance, 1),
                'depth': round(depth, 1),
            },
        }

    @staticmethod
    def _score_eligibility(eligibility_defs, eligibility_responses):
        """
        Score eligibility compliance.
        Required items are pass/fail (0 or 100), optional items are weighted.
        """
        if not eligibility_defs:
            return 100  # No requirements means automatically eligible

        total_items = 0
        passed_items = 0
        required_passed = True

        for elig in eligibility_defs:
            eid = str(elig.get('id', ''))
            required = elig.get('required', True)
            response = eligibility_responses.get(eid)

            # Normalize response to boolean
            if isinstance(response, str):
                is_met = response.lower() in ('true', 'yes', '1', 'met')
            elif isinstance(response, bool):
                is_met = response
            else:
                is_met = bool(response)

            total_items += 1
            if is_met:
                passed_items += 1
            elif required:
                required_passed = False

        if not required_passed:
            return 0  # Failing a required item disqualifies

        return round((passed_items / total_items) * 100, 1) if total_items > 0 else 100


# =============================================================================
# 8. COMPLIANCE / SANCTIONS SCREENING SERVICE
# =============================================================================

class ComplianceService:
    """
    Simulates sanctions and compliance screening.
    In production, this would integrate with real sanctions databases
    (UN, OFAC, EU) via their APIs.
    """

    # Organization name fragments that trigger a flag for demonstration
    FLAGGED_KEYWORDS = ['shadow', 'phantom', 'ghost', 'blacklisted']

    @classmethod
    def screen_organization(cls, org_name, country, personnel=None, org_id=None):
        """
        Run full compliance screening against an organization.
        Returns a list of ComplianceCheck results.

        For demonstration: most organizations return clear; organizations with
        certain keywords in the name will be flagged.
        """
        checks = []
        is_flagged = any(kw in org_name.lower() for kw in cls.FLAGGED_KEYWORDS)
        # Also flag org_id == 5 for demo seeded data
        if org_id and org_id == 5:
            is_flagged = True

        # 1. UN Sanctions List
        checks.append(cls._check_un_sanctions(org_name, country, is_flagged))
        # 2. OFAC SDN List
        checks.append(cls._check_ofac(org_name, country, is_flagged))
        # 3. EU Sanctions
        checks.append(cls._check_eu_sanctions(org_name, country, is_flagged))
        # 4. World Bank Debarment
        checks.append(cls._check_world_bank(org_name, country, is_flagged))
        # 5. Registration Verification
        checks.append(cls._check_registration(org_name, country))

        # Screen personnel if provided
        if personnel:
            for person in personnel[:10]:  # limit to 10
                person_name = person.get('name', '') if isinstance(person, dict) else str(person)
                person_flagged = any(kw in person_name.lower() for kw in cls.FLAGGED_KEYWORDS)
                if person_flagged:
                    checks.append({
                        'check_type': 'sanctions_un',
                        'status': 'flagged',
                        'result': {
                            'entity': person_name,
                            'entity_type': 'individual',
                            'list': 'UN Security Council Consolidated List',
                            'match_score': 87,
                            'reason': 'Potential name match found on sanctions list',
                            'details': 'Manual review recommended before proceeding',
                        },
                    })

        return checks

    @classmethod
    def _check_un_sanctions(cls, org_name, country, is_flagged):
        if is_flagged:
            return {
                'check_type': 'sanctions_un',
                'status': 'flagged',
                'result': {
                    'list': 'UN Security Council Consolidated List',
                    'match_score': 82,
                    'matched_entity': f'{org_name} (partial match)',
                    'reason': 'Partial name match detected against UN consolidated sanctions list',
                    'reference': 'UNSC/2024/R1287',
                    'action_required': 'Manual review required. Contact compliance team.',
                    'checked_against': 'UN Security Council Resolutions 1267, 1373, 1718, 1988, 2253',
                },
            }
        return {
            'check_type': 'sanctions_un',
            'status': 'clear',
            'result': {
                'list': 'UN Security Council Consolidated List',
                'match_score': 0,
                'message': 'No matches found on UN sanctions lists',
                'checked_against': 'UN Security Council Resolutions 1267, 1373, 1718, 1988, 2253',
                'records_searched': 892,
            },
        }

    @classmethod
    def _check_ofac(cls, org_name, country, is_flagged):
        if is_flagged:
            return {
                'check_type': 'sanctions_ofac',
                'status': 'flagged',
                'result': {
                    'list': 'OFAC Specially Designated Nationals (SDN)',
                    'match_score': 76,
                    'matched_entity': f'{org_name} (possible alias match)',
                    'reason': 'Possible alias match found on OFAC SDN list',
                    'sdn_type': 'Entity',
                    'programs': ['SDGT', 'SYRIA'],
                    'action_required': 'Enhanced due diligence recommended',
                },
            }
        return {
            'check_type': 'sanctions_ofac',
            'status': 'clear',
            'result': {
                'list': 'OFAC Specially Designated Nationals (SDN)',
                'match_score': 0,
                'message': 'No matches found on OFAC SDN or consolidated lists',
                'records_searched': 11847,
            },
        }

    @classmethod
    def _check_eu_sanctions(cls, org_name, country, is_flagged):
        if is_flagged:
            return {
                'check_type': 'sanctions_eu',
                'status': 'flagged',
                'result': {
                    'list': 'EU Consolidated Financial Sanctions List',
                    'match_score': 71,
                    'matched_entity': org_name,
                    'reason': 'Name similarity detected with entity on EU restrictive measures list',
                    'regulation': 'Council Regulation (EC) No 881/2002',
                    'action_required': 'Verify identity and seek legal guidance',
                },
            }
        return {
            'check_type': 'sanctions_eu',
            'status': 'clear',
            'result': {
                'list': 'EU Consolidated Financial Sanctions List',
                'match_score': 0,
                'message': 'No matches found on EU financial sanctions lists',
                'records_searched': 2341,
            },
        }

    @classmethod
    def _check_world_bank(cls, org_name, country, is_flagged):
        return {
            'check_type': 'blacklist',
            'status': 'clear',
            'result': {
                'list': 'World Bank Group Listing of Ineligible Firms & Individuals',
                'match_score': 0,
                'message': 'No matches found on World Bank debarment list',
                'records_searched': 1456,
            },
        }

    @classmethod
    def _check_registration(cls, org_name, country):
        """Verify registration number format by country."""
        return {
            'check_type': 'registration',
            'status': 'clear',
            'result': {
                'verification': 'format_valid',
                'country': country,
                'message': f'Registration format is consistent with {country} NGO registration requirements',
                'note': 'Physical verification with registrar recommended for full due diligence',
            },
        }

    @classmethod
    def save_checks(cls, org_id, check_results):
        """Save compliance check results to the database."""
        saved = []
        for check_data in check_results:
            check = ComplianceCheck(
                org_id=org_id,
                check_type=check_data['check_type'],
                status=check_data['status'],
                checked_at=datetime.utcnow(),
            )
            check.set_result(check_data['result'])
            db.session.add(check)
            saved.append(check)
        db.session.commit()
        return saved


# =============================================================================
# 9. API ROUTES - AUTH
# =============================================================================

@app.route('/api/auth/login', methods=['POST'])
def api_login():
    """Authenticate user with email and password."""
    data = get_request_json()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'success': False, 'error': 'Email and password are required'}), 400

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify({'success': False, 'error': 'Invalid email or password'}), 401

    if not user.is_active:
        return jsonify({'success': False, 'error': 'Account is deactivated'}), 403

    login_user(user, remember=True)
    logger.info(f"User logged in: {user.email} (role: {user.role})")
    return jsonify({'success': True, 'user': user.to_dict(include_org=True)})


@app.route('/api/auth/logout', methods=['POST'])
@login_required
def api_logout():
    """Log out the current user."""
    logger.info(f"User logged out: {current_user.email}")
    logout_user()
    return jsonify({'success': True, 'message': 'Logged out successfully'})


@app.route('/api/auth/me', methods=['GET'])
@login_required
def api_me():
    """Return current authenticated user info."""
    return jsonify({'user': current_user.to_dict(include_org=True)})


# =============================================================================
# 10. API ROUTES - DASHBOARD
# =============================================================================

@app.route('/api/dashboard/stats', methods=['GET'])
@login_required
def api_dashboard_stats():
    """Return role-specific dashboard statistics."""
    role = current_user.role
    org_id = current_user.org_id
    stats = {}

    if role == 'ngo':
        # NGO sees their applications and available grants
        stats['total_applications'] = Application.query.filter_by(ngo_org_id=org_id).count()
        stats['draft_applications'] = Application.query.filter_by(
            ngo_org_id=org_id, status='draft'
        ).count()
        stats['submitted_applications'] = Application.query.filter(
            Application.ngo_org_id == org_id,
            Application.status.in_(['submitted', 'under_review', 'scored'])
        ).count()
        stats['awarded_applications'] = Application.query.filter_by(
            ngo_org_id=org_id, status='awarded'
        ).count()
        stats['rejected_applications'] = Application.query.filter_by(
            ngo_org_id=org_id, status='rejected'
        ).count()
        stats['open_grants'] = Grant.query.filter_by(status='open').count()
        stats['assessments'] = Assessment.query.filter_by(org_id=org_id).count()
        stats['documents'] = Document.query.join(Application).filter(
            Application.ngo_org_id == org_id
        ).count()

        # Reports
        stats['pending_reports'] = Report.query.filter_by(
            submitted_by_org_id=org_id
        ).filter(Report.status.in_(['draft', 'revision_requested'])).count()
        stats['submitted_reports'] = Report.query.filter_by(
            submitted_by_org_id=org_id, status='submitted'
        ).count()

        # Recent applications
        recent_apps = Application.query.filter_by(ngo_org_id=org_id) \
            .order_by(Application.created_at.desc()).limit(5).all()
        stats['recent_applications'] = [a.to_dict(summary=True) for a in recent_apps]

        # Average score
        scored = Application.query.filter(
            Application.ngo_org_id == org_id,
            Application.final_score.isnot(None)
        ).all()
        if scored:
            stats['average_score'] = round(
                sum(a.final_score for a in scored) / len(scored), 1
            )
        else:
            stats['average_score'] = None

    elif role == 'donor':
        # Donor sees their grants and incoming applications
        stats['total_grants'] = Grant.query.filter_by(donor_org_id=org_id).count()
        stats['open_grants'] = Grant.query.filter_by(donor_org_id=org_id, status='open').count()
        stats['draft_grants'] = Grant.query.filter_by(donor_org_id=org_id, status='draft').count()
        stats['total_applications'] = Application.query.join(Grant).filter(
            Grant.donor_org_id == org_id
        ).count()
        stats['pending_review'] = Application.query.join(Grant).filter(
            Grant.donor_org_id == org_id,
            Application.status.in_(['submitted', 'under_review'])
        ).count()
        stats['awarded'] = Application.query.join(Grant).filter(
            Grant.donor_org_id == org_id, Application.status == 'awarded'
        ).count()

        # Total funding deployed
        awarded_apps = Application.query.join(Grant).filter(
            Grant.donor_org_id == org_id, Application.status == 'awarded'
        ).all()
        stats['total_funding_awarded'] = sum(
            (a.grant.total_funding or 0) for a in awarded_apps
        )

        # Total funding available
        stats['total_funding_available'] = db.session.query(
            db.func.sum(Grant.total_funding)
        ).filter(Grant.donor_org_id == org_id, Grant.status == 'open').scalar() or 0

        # Reports received
        stats['pending_report_reviews'] = Report.query.join(Grant).filter(
            Grant.donor_org_id == org_id,
            Report.status == 'submitted'
        ).count()
        stats['total_reports_received'] = Report.query.join(Grant).filter(
            Grant.donor_org_id == org_id
        ).count()

        # Recent grants
        recent_grants = Grant.query.filter_by(donor_org_id=org_id) \
            .order_by(Grant.created_at.desc()).limit(5).all()
        stats['recent_grants'] = [g.to_dict(summary=True) for g in recent_grants]

    elif role == 'reviewer':
        # Reviewer sees assigned reviews
        stats['total_reviews'] = Review.query.filter_by(reviewer_user_id=current_user.id).count()
        stats['assigned_reviews'] = Review.query.filter_by(
            reviewer_user_id=current_user.id, status='assigned'
        ).count()
        stats['in_progress_reviews'] = Review.query.filter_by(
            reviewer_user_id=current_user.id, status='in_progress'
        ).count()
        stats['completed_reviews'] = Review.query.filter_by(
            reviewer_user_id=current_user.id, status='completed'
        ).count()

        # Average score given
        completed = Review.query.filter(
            Review.reviewer_user_id == current_user.id,
            Review.overall_score.isnot(None)
        ).all()
        if completed:
            stats['average_score_given'] = round(
                sum(r.overall_score for r in completed) / len(completed), 1
            )
        else:
            stats['average_score_given'] = None

        # Recent reviews
        recent_reviews = Review.query.filter_by(reviewer_user_id=current_user.id) \
            .order_by(Review.created_at.desc()).limit(5).all()
        stats['recent_reviews'] = [r.to_dict() for r in recent_reviews]

    elif role == 'admin':
        # Admin sees everything
        stats['total_users'] = User.query.count()
        stats['active_users'] = User.query.filter_by(is_active=True).count()
        stats['total_organizations'] = Organization.query.count()
        stats['verified_organizations'] = Organization.query.filter_by(verified=True).count()
        stats['total_grants'] = Grant.query.count()
        stats['open_grants'] = Grant.query.filter_by(status='open').count()
        stats['total_applications'] = Application.query.count()
        stats['total_reviews'] = Review.query.count()
        stats['total_assessments'] = Assessment.query.count()
        stats['flagged_compliance'] = ComplianceCheck.query.filter_by(status='flagged').count()

        # Users by role
        stats['users_by_role'] = {}
        for r in ['ngo', 'donor', 'reviewer', 'admin']:
            stats['users_by_role'][r] = User.query.filter_by(role=r).count()

        # Orgs by type
        stats['orgs_by_type'] = {}
        for t in ['ngo', 'donor', 'ingo', 'cbo', 'network']:
            stats['orgs_by_type'][t] = Organization.query.filter_by(org_type=t).count()

    return jsonify({'stats': stats, 'role': role})


# =============================================================================
# 11. API ROUTES - ORGANIZATIONS
# =============================================================================

@app.route('/api/organizations', methods=['GET'])
@login_required
def api_list_organizations():
    """List organizations, optionally filtered by type."""
    query = Organization.query

    org_type = request.args.get('type')
    if org_type:
        query = query.filter_by(org_type=org_type)

    country = request.args.get('country')
    if country:
        query = query.filter_by(country=country)

    verified = request.args.get('verified')
    if verified is not None:
        query = query.filter_by(verified=verified.lower() == 'true')

    search = request.args.get('search', '').strip()
    if search:
        query = query.filter(Organization.name.ilike(f'%{search}%'))

    query = query.order_by(Organization.name)
    pagination = paginate_query(query)

    return jsonify({
        'organizations': [o.to_dict() for o in pagination.items],
        'total': pagination.total,
        'page': pagination.page,
        'pages': pagination.pages,
    })


@app.route('/api/organizations/<int:org_id>', methods=['GET'])
@login_required
def api_get_organization(org_id):
    """Get full organization detail including compliance checks."""
    org = db.session.get(Organization, org_id)
    if not org:
        return jsonify({'error': 'Organization not found'}), 404

    data = org.to_dict()

    # Include compliance checks
    checks = ComplianceCheck.query.filter_by(org_id=org_id) \
        .order_by(ComplianceCheck.checked_at.desc()).all()
    data['compliance_checks'] = [c.to_dict() for c in checks]

    # Include user count
    data['user_count'] = User.query.filter_by(org_id=org_id).count()

    # Include assessment info
    latest_assessment = Assessment.query.filter_by(org_id=org_id) \
        .order_by(Assessment.created_at.desc()).first()
    if latest_assessment:
        data['latest_assessment'] = latest_assessment.to_dict()

    return jsonify({'organization': data})


# =============================================================================
# 12. API ROUTES - GRANTS
# =============================================================================

@app.route('/api/grants', methods=['GET'])
@login_required
def api_list_grants():
    """List grants with optional filters."""
    query = Grant.query

    status = request.args.get('status')
    if status:
        query = query.filter_by(status=status)
    else:
        # By default, NGOs only see open grants; donors see all their own
        if current_user.role == 'ngo':
            query = query.filter_by(status='open')

    # Donor filter: donors see only their own grants by default
    if current_user.role == 'donor' and not request.args.get('all'):
        query = query.filter_by(donor_org_id=current_user.org_id)

    sector = request.args.get('sector')
    if sector:
        query = query.filter(Grant.sectors.ilike(f'%"{sector}"%'))

    country = request.args.get('country')
    if country:
        query = query.filter(Grant.countries.ilike(f'%"{country}"%'))

    search = request.args.get('search', '').strip()
    if search:
        query = query.filter(
            db.or_(
                Grant.title.ilike(f'%{search}%'),
                Grant.description.ilike(f'%{search}%')
            )
        )

    query = query.order_by(Grant.created_at.desc())
    pagination = paginate_query(query)

    return jsonify({
        'grants': [g.to_dict(summary=True) for g in pagination.items],
        'total': pagination.total,
        'page': pagination.page,
        'pages': pagination.pages,
    })


@app.route('/api/grants/<int:grant_id>', methods=['GET'])
@login_required
def api_get_grant(grant_id):
    """Get full grant detail with eligibility, criteria, and document requirements."""
    grant = db.session.get(Grant, grant_id)
    if not grant:
        return jsonify({'error': 'Grant not found'}), 404

    data = grant.to_dict(summary=False)

    # Include application count
    data['application_count'] = Application.query.filter_by(grant_id=grant_id).count()

    # If user is NGO, include their application status for this grant
    if current_user.role == 'ngo' and current_user.org_id:
        existing_app = Application.query.filter_by(
            grant_id=grant_id, ngo_org_id=current_user.org_id
        ).first()
        if existing_app:
            data['user_application'] = existing_app.to_dict(summary=True)

    return jsonify({'grant': data})


@app.route('/api/grants', methods=['POST'])
@role_required('donor', 'admin')
def api_create_grant():
    """Create a new grant (donor only)."""
    data = get_request_json()

    if not data.get('title'):
        return jsonify({'error': 'Title is required', 'success': False}), 400

    grant = Grant(
        donor_org_id=current_user.org_id,
        title=data['title'],
        description=data.get('description', ''),
        total_funding=data.get('total_funding'),
        currency=data.get('currency', 'USD'),
        status='draft',
    )

    if data.get('deadline'):
        try:
            grant.deadline = date.fromisoformat(data['deadline'])
        except (ValueError, TypeError):
            return jsonify({'error': 'Invalid deadline format. Use YYYY-MM-DD.', 'success': False}), 400

    if data.get('sectors'):
        grant.set_sectors(data['sectors'])
    if data.get('countries'):
        grant.set_countries(data['countries'])
    if data.get('eligibility'):
        grant.set_eligibility(data['eligibility'])
    if data.get('criteria'):
        grant.set_criteria(data['criteria'])
    if data.get('doc_requirements'):
        grant.set_doc_requirements(data['doc_requirements'])
    if data.get('reporting_requirements'):
        grant.set_reporting_requirements(data['reporting_requirements'])
    if data.get('report_template'):
        grant.set_report_template(data['report_template'])
    if data.get('reporting_frequency'):
        grant.reporting_frequency = data['reporting_frequency']

    db.session.add(grant)
    db.session.commit()

    logger.info(f"Grant created: {grant.title} (id={grant.id}) by org {current_user.org_id}")
    return jsonify({'success': True, 'grant': grant.to_dict()}), 201


@app.route('/api/grants/<int:grant_id>', methods=['PUT'])
@role_required('donor', 'admin')
def api_update_grant(grant_id):
    """Update a grant."""
    grant = db.session.get(Grant, grant_id)
    if not grant:
        return jsonify({'error': 'Grant not found'}), 404

    # Only the owning donor or admin can edit
    if current_user.role == 'donor' and grant.donor_org_id != current_user.org_id:
        return jsonify({'error': 'You can only edit your own grants', 'success': False}), 403

    data = get_request_json()

    if 'title' in data:
        grant.title = data['title']
    if 'description' in data:
        grant.description = data['description']
    if 'total_funding' in data:
        grant.total_funding = data['total_funding']
    if 'currency' in data:
        grant.currency = data['currency']
    if 'deadline' in data:
        try:
            grant.deadline = date.fromisoformat(data['deadline']) if data['deadline'] else None
        except (ValueError, TypeError):
            return jsonify({'error': 'Invalid deadline format', 'success': False}), 400
    if 'status' in data:
        grant.status = data['status']
    if 'sectors' in data:
        grant.set_sectors(data['sectors'])
    if 'countries' in data:
        grant.set_countries(data['countries'])
    if 'eligibility' in data:
        grant.set_eligibility(data['eligibility'])
    if 'criteria' in data:
        grant.set_criteria(data['criteria'])
    if 'doc_requirements' in data:
        grant.set_doc_requirements(data['doc_requirements'])
    if 'reporting_requirements' in data:
        grant.set_reporting_requirements(data['reporting_requirements'])
    if 'report_template' in data:
        grant.set_report_template(data['report_template'])
    if 'reporting_frequency' in data:
        grant.reporting_frequency = data['reporting_frequency']

    db.session.commit()
    logger.info(f"Grant updated: {grant.title} (id={grant.id})")
    return jsonify({'success': True, 'grant': grant.to_dict()})


@app.route('/api/grants/<int:grant_id>/publish', methods=['POST'])
@role_required('donor', 'admin')
def api_publish_grant(grant_id):
    """Publish a grant (set status to 'open')."""
    grant = db.session.get(Grant, grant_id)
    if not grant:
        return jsonify({'error': 'Grant not found'}), 404

    if current_user.role == 'donor' and grant.donor_org_id != current_user.org_id:
        return jsonify({'error': 'You can only publish your own grants', 'success': False}), 403

    if grant.status != 'draft':
        return jsonify({'error': f'Cannot publish a grant with status "{grant.status}"', 'success': False}), 400

    grant.status = 'open'
    grant.published_at = datetime.utcnow()
    db.session.commit()

    logger.info(f"Grant published: {grant.title} (id={grant.id})")
    return jsonify({'success': True, 'grant': grant.to_dict()})


# =============================================================================
# 13. API ROUTES - APPLICATIONS
# =============================================================================

@app.route('/api/applications', methods=['GET'])
@login_required
def api_list_applications():
    """List applications filtered by role."""
    query = Application.query

    if current_user.role == 'ngo':
        # NGO sees only their own applications
        query = query.filter_by(ngo_org_id=current_user.org_id)
    elif current_user.role == 'donor':
        # Donor sees applications for their grants
        query = query.join(Grant).filter(Grant.donor_org_id == current_user.org_id)
    elif current_user.role == 'reviewer':
        # Reviewer sees applications they have reviews for
        review_app_ids = db.session.query(Review.application_id).filter_by(
            reviewer_user_id=current_user.id
        ).subquery()
        query = query.filter(Application.id.in_(review_app_ids))
    # Admin sees all

    status = request.args.get('status')
    if status:
        query = query.filter(Application.status == status)

    grant_id = request.args.get('grant_id', type=int)
    if grant_id:
        query = query.filter(Application.grant_id == grant_id)

    query = query.order_by(Application.created_at.desc())
    pagination = paginate_query(query)

    return jsonify({
        'applications': [a.to_dict(summary=True) for a in pagination.items],
        'total': pagination.total,
        'page': pagination.page,
        'pages': pagination.pages,
    })


@app.route('/api/applications/<int:app_id>', methods=['GET'])
@login_required
def api_get_application(app_id):
    """Get full application detail with responses, documents, and reviews."""
    application = db.session.get(Application, app_id)
    if not application:
        return jsonify({'error': 'Application not found'}), 404

    # Access control
    if current_user.role == 'ngo' and application.ngo_org_id != current_user.org_id:
        return jsonify({'error': 'Access denied'}), 403
    if current_user.role == 'donor':
        grant = db.session.get(Grant, application.grant_id)
        if not grant or grant.donor_org_id != current_user.org_id:
            return jsonify({'error': 'Access denied'}), 403

    data = application.to_dict(summary=False)

    # Include documents
    docs = Document.query.filter_by(application_id=app_id).all()
    data['documents'] = [d.to_dict() for d in docs]

    # Include reviews (visible to donor, reviewer, admin)
    if current_user.role in ('donor', 'reviewer', 'admin'):
        reviews = Review.query.filter_by(application_id=app_id).all()
        data['reviews'] = [r.to_dict() for r in reviews]
    else:
        data['reviews'] = []

    # Include grant criteria for context
    if application.grant:
        data['grant_criteria'] = application.grant.get_criteria()
        data['grant_eligibility'] = application.grant.get_eligibility()

    return jsonify({'application': data})


@app.route('/api/applications', methods=['POST'])
@role_required('ngo')
def api_create_application():
    """Create a new grant application (NGO only)."""
    data = get_request_json()
    grant_id = data.get('grant_id')

    if not grant_id:
        return jsonify({'error': 'grant_id is required', 'success': False}), 400

    grant = db.session.get(Grant, grant_id)
    if not grant:
        return jsonify({'error': 'Grant not found', 'success': False}), 404

    if grant.status != 'open':
        return jsonify({'error': 'This grant is not currently accepting applications', 'success': False}), 400

    # Check deadline
    if grant.deadline and grant.deadline < date.today():
        return jsonify({'error': 'The application deadline has passed', 'success': False}), 400

    # Check for existing application
    existing = Application.query.filter_by(
        grant_id=grant_id, ngo_org_id=current_user.org_id
    ).first()
    if existing:
        return jsonify({
            'error': 'Your organization has already applied to this grant',
            'existing_application_id': existing.id,
            'success': False,
        }), 409

    application = Application(
        grant_id=grant_id,
        ngo_org_id=current_user.org_id,
        status='draft',
    )

    if data.get('responses'):
        application.set_responses(data['responses'])
    if data.get('eligibility_responses'):
        application.set_eligibility_responses(data['eligibility_responses'])

    db.session.add(application)
    db.session.commit()

    logger.info(
        f"Application created: grant={grant_id}, org={current_user.org_id}, app_id={application.id}"
    )
    return jsonify({'success': True, 'application': application.to_dict()}), 201


@app.route('/api/applications/<int:app_id>', methods=['PUT'])
@login_required
def api_update_application(app_id):
    """Update an application (responses, eligibility, status)."""
    application = db.session.get(Application, app_id)
    if not application:
        return jsonify({'error': 'Application not found'}), 404

    # Only owning NGO can edit drafts; donors/admins can update status
    if current_user.role == 'ngo':
        if application.ngo_org_id != current_user.org_id:
            return jsonify({'error': 'Access denied'}), 403
        if application.status not in ('draft',):
            return jsonify({'error': 'Cannot edit a submitted application', 'success': False}), 400

    data = get_request_json()

    if 'responses' in data:
        application.set_responses(data['responses'])
    if 'eligibility_responses' in data:
        application.set_eligibility_responses(data['eligibility_responses'])
    if 'status' in data and current_user.role in ('donor', 'admin'):
        application.status = data['status']
    if 'ai_score' in data:
        application.ai_score = data['ai_score']
    if 'human_score' in data:
        application.human_score = data['human_score']
    if 'final_score' in data:
        application.final_score = data['final_score']

    db.session.commit()
    return jsonify({'success': True, 'application': application.to_dict()})


@app.route('/api/applications/<int:app_id>/submit', methods=['POST'])
@role_required('ngo')
def api_submit_application(app_id):
    """Submit an application for review."""
    application = db.session.get(Application, app_id)
    if not application:
        return jsonify({'error': 'Application not found'}), 404

    if application.ngo_org_id != current_user.org_id:
        return jsonify({'error': 'Access denied'}), 403

    if application.status != 'draft':
        return jsonify({'error': 'Only draft applications can be submitted', 'success': False}), 400

    # Validate that required responses exist
    grant = application.grant
    if grant:
        criteria = grant.get_criteria() or []
        responses = application.get_responses() or {}
        missing = []
        for criterion in criteria:
            cid = str(criterion.get('id', ''))
            if not responses.get(cid, '').strip():
                missing.append(criterion.get('label', cid))
        if missing:
            return jsonify({
                'error': 'Missing required responses',
                'missing_criteria': missing,
                'success': False,
            }), 400

    # Check deadline
    if grant and grant.deadline and grant.deadline < date.today():
        return jsonify({'error': 'The application deadline has passed', 'success': False}), 400

    application.status = 'submitted'
    application.submitted_at = datetime.utcnow()

    # Auto-score with AI
    try:
        score_result = ScoringEngine.score_application(application)
        application.ai_score = score_result.get('overall_score')
        application.final_score = score_result.get('overall_score')
    except Exception as e:
        logger.error(f"Auto-scoring failed for application {app_id}: {e}")

    db.session.commit()

    logger.info(f"Application submitted: {app_id} (score: {application.ai_score})")
    return jsonify({'success': True, 'application': application.to_dict()})


# =============================================================================
# 14. API ROUTES - ASSESSMENTS
# =============================================================================

@app.route('/api/assessments', methods=['GET'])
@login_required
def api_list_assessments():
    """List assessments for the current user's organization."""
    if current_user.role in ('admin',):
        query = Assessment.query
    else:
        query = Assessment.query.filter_by(org_id=current_user.org_id)

    status = request.args.get('status')
    if status:
        query = query.filter_by(status=status)

    query = query.order_by(Assessment.created_at.desc())
    pagination = paginate_query(query)

    return jsonify({
        'assessments': [a.to_dict() for a in pagination.items],
        'total': pagination.total,
        'page': pagination.page,
        'pages': pagination.pages,
    })


@app.route('/api/assessments/<int:assess_id>', methods=['GET'])
@login_required
def api_get_assessment(assess_id):
    """Get full assessment detail."""
    assessment = db.session.get(Assessment, assess_id)
    if not assessment:
        return jsonify({'error': 'Assessment not found'}), 404

    # Access control
    if current_user.role not in ('admin',) and assessment.org_id != current_user.org_id:
        return jsonify({'error': 'Access denied'}), 403

    data = assessment.to_dict()

    # Include documents
    docs = Document.query.filter_by(assessment_id=assess_id).all()
    data['documents'] = [d.to_dict() for d in docs]

    return jsonify({'assessment': data})


@app.route('/api/assessments', methods=['POST'])
@login_required
def api_create_assessment():
    """Create / start a new organizational assessment."""
    data = get_request_json()
    org_id = current_user.org_id

    if not org_id:
        return jsonify({'error': 'User must belong to an organization', 'success': False}), 400

    assessment = Assessment(
        org_id=org_id,
        assess_type=data.get('assess_type', 'free'),
        framework=data.get('framework', 'kuja'),
        status='in_progress',
    )

    if data.get('checklist_responses'):
        assessment.set_checklist_responses(data['checklist_responses'])

    db.session.add(assessment)
    db.session.commit()

    logger.info(f"Assessment created: org={org_id}, id={assessment.id}")
    return jsonify({'success': True, 'assessment': assessment.to_dict()}), 201


@app.route('/api/assessments/<int:assess_id>', methods=['PUT'])
@login_required
def api_update_assessment(assess_id):
    """Update assessment checklist responses and calculate scores."""
    assessment = db.session.get(Assessment, assess_id)
    if not assessment:
        return jsonify({'error': 'Assessment not found'}), 404

    if current_user.role not in ('admin',) and assessment.org_id != current_user.org_id:
        return jsonify({'error': 'Access denied'}), 403

    data = get_request_json()

    if 'checklist_responses' in data:
        assessment.set_checklist_responses(data['checklist_responses'])

    if 'status' in data:
        assessment.status = data['status']

    # Auto-calculate scores from checklist responses
    if data.get('calculate_scores') or data.get('status') == 'completed':
        checklist = assessment.get_checklist_responses() or {}
        category_scores, overall, gaps = _calculate_assessment_scores(checklist, assessment.framework or 'kuja')
        assessment.set_category_scores(category_scores)
        assessment.overall_score = overall
        assessment.set_gaps(gaps)

        if data.get('status') == 'completed' or assessment.status == 'completed':
            assessment.status = 'completed'
            assessment.completed_at = datetime.utcnow()

            # Update org assess score
            org = db.session.get(Organization, assessment.org_id)
            if org:
                org.assess_score = overall
                org.assess_date = datetime.utcnow()

    db.session.commit()
    return jsonify({'success': True, 'assessment': assessment.to_dict()})


@app.route('/api/assessments/frameworks', methods=['GET'])
@login_required
def api_get_assessment_frameworks():
    """Return available assessment frameworks and their structures."""
    frameworks = {
        'kuja': {
            'name': 'Kuja Standard Assessment',
            'description': 'Kuja Link standard capacity assessment covering 5 key organizational domains.',
            'categories': ['Governance', 'Financial Management', 'Program Management', 'Human Resources', 'Monitoring & Evaluation'],
            'total_items': 26,
            'estimated_time': '30-45 minutes',
        },
        'step': {
            'name': 'STEP Assessment',
            'description': 'Strengthening Effective Partner Engagement and Performance assessment tool used by major international NGOs.',
            'categories': ['Organizational Governance', 'Financial Systems', 'Administration', 'Human Resource Management', 'Program Quality'],
            'total_items': 26,
            'estimated_time': '45-60 minutes',
        },
        'un_hact': {
            'name': 'UN HACT Micro Assessment',
            'description': 'UN Harmonized Approach to Cash Transfers micro-assessment for implementing partners.',
            'categories': ['Implementing Partner Info', 'Internal Control', 'Accounting Policies', 'Fixed Assets', 'Procurement'],
            'total_items': 22,
            'estimated_time': '45-60 minutes',
        },
        'chs': {
            'name': 'CHS Self-Assessment',
            'description': 'Core Humanitarian Standard on Quality and Accountability self-assessment.',
            'categories': ['Humanitarian Response', 'Effectiveness', 'Accountability', 'Coordination', 'Staff Competency', 'Management Support', 'Learning'],
            'total_items': 27,
            'estimated_time': '60-90 minutes',
        },
        'nupas': {
            'name': 'NUPAS Assessment',
            'description': 'Non-profit Unified Performance Assessment System for comprehensive organizational evaluation.',
            'categories': ['Governance & Leadership', 'Financial Stewardship', 'Program Delivery', 'People & Culture', 'Learning & Adaptation'],
            'total_items': 27,
            'estimated_time': '60-90 minutes',
        },
    }
    return jsonify({'frameworks': frameworks})


def _calculate_assessment_scores(checklist, framework='kuja'):
    """
    Calculate assessment category scores, overall score, and identify gaps.
    Supports multiple assessment frameworks.
    """
    FRAMEWORK_CATEGORIES = {
        'kuja': {
            'governance': { 'weight': 0.20, 'items': ['board_exists', 'board_meets_regularly', 'strategic_plan', 'policies_documented', 'conflict_of_interest_policy'] },
            'financial_management': { 'weight': 0.25, 'items': ['financial_policies', 'annual_audit', 'budget_process', 'internal_controls', 'financial_reporting', 'procurement_policy'] },
            'program_management': { 'weight': 0.20, 'items': ['needs_assessment', 'project_planning', 'beneficiary_feedback', 'partnership_agreements', 'reporting_systems'] },
            'human_resources': { 'weight': 0.15, 'items': ['hr_policies', 'staff_contracts', 'safeguarding_policy', 'training_plan', 'code_of_conduct'] },
            'monitoring_evaluation': { 'weight': 0.20, 'items': ['me_framework', 'data_collection', 'indicator_tracking', 'evaluation_reports', 'learning_integration'] },
        },
        'step': {
            'organizational_governance': { 'weight': 0.20, 'items': ['legal_registration', 'governing_body', 'strategic_direction', 'succession_planning', 'stakeholder_engagement'] },
            'financial_systems': { 'weight': 0.25, 'items': ['accounting_system', 'financial_controls', 'audit_practice', 'asset_management', 'donor_compliance', 'cash_management'] },
            'administration': { 'weight': 0.15, 'items': ['admin_procedures', 'record_keeping', 'it_systems', 'office_management', 'procurement_systems'] },
            'human_resource_management': { 'weight': 0.20, 'items': ['recruitment_process', 'staff_development', 'performance_management', 'compensation_policy', 'safeguarding_psea'] },
            'program_quality': { 'weight': 0.20, 'items': ['program_design', 'implementation_quality', 'monitoring_systems', 'reporting_quality', 'sustainability_planning'] },
        },
        'un_hact': {
            'implementing_partner_info': { 'weight': 0.10, 'items': ['legal_status', 'governance_structure', 'mandate_alignment'] },
            'internal_control': { 'weight': 0.25, 'items': ['control_environment', 'risk_assessment', 'control_activities', 'info_communication', 'monitoring_controls'] },
            'accounting_policies': { 'weight': 0.25, 'items': ['accounting_standards', 'fund_accounting', 'reporting_procedures', 'cash_management_hact', 'asset_management_hact'] },
            'fixed_assets': { 'weight': 0.15, 'items': ['asset_register', 'asset_safeguarding', 'asset_disposal', 'asset_verification'] },
            'procurement': { 'weight': 0.25, 'items': ['procurement_policy', 'competitive_bidding', 'procurement_documentation', 'contract_management', 'supplier_management'] },
        },
        'chs': {
            'humanitarian_response': { 'weight': 0.15, 'items': ['needs_based_response', 'timeliness', 'appropriate_response', 'reaching_most_vulnerable'] },
            'effectiveness': { 'weight': 0.15, 'items': ['effective_programs', 'evidence_based', 'adaptive_management', 'innovation_learning'] },
            'accountability': { 'weight': 0.20, 'items': ['community_participation', 'feedback_mechanisms', 'complaint_handling', 'transparency_info'] },
            'coordination': { 'weight': 0.10, 'items': ['coordination_participation', 'complementarity', 'information_sharing'] },
            'staff_competency': { 'weight': 0.15, 'items': ['skilled_staff', 'wellbeing_support', 'code_of_conduct_chs', 'psea_policy'] },
            'management_support': { 'weight': 0.15, 'items': ['policies_processes', 'resource_management', 'environmental_impact', 'quality_management'] },
            'learning': { 'weight': 0.10, 'items': ['organizational_learning', 'evaluation_practice', 'knowledge_sharing', 'continuous_improvement'] },
        },
        'nupas': {
            'governance_leadership': { 'weight': 0.20, 'items': ['legal_framework', 'board_effectiveness', 'leadership_quality', 'accountability_systems', 'risk_management'] },
            'financial_stewardship': { 'weight': 0.25, 'items': ['financial_systems', 'budgeting', 'financial_reporting_nupas', 'audit_compliance', 'resource_mobilization', 'value_for_money'] },
            'program_delivery': { 'weight': 0.25, 'items': ['design_quality', 'delivery_effectiveness', 'beneficiary_engagement', 'partnership_management', 'innovation_scaling'] },
            'people_culture': { 'weight': 0.15, 'items': ['hr_systems', 'staff_development_nupas', 'diversity_inclusion', 'safeguarding_nupas', 'organizational_culture'] },
            'learning_adaptation': { 'weight': 0.15, 'items': ['me_systems', 'data_use', 'knowledge_management', 'adaptive_programming', 'impact_measurement'] },
        },
    }

    categories = FRAMEWORK_CATEGORIES.get(framework, FRAMEWORK_CATEGORIES['kuja'])

    category_scores = {}
    gaps = []
    weighted_total = 0

    for cat_name, cat_info in categories.items():
        items = cat_info['items']
        met = 0
        total = len(items)
        for item in items:
            response = checklist.get(item)
            if isinstance(response, str):
                is_met = response.lower() in ('true', 'yes', '1', 'met', 'complete')
            elif isinstance(response, bool):
                is_met = response
            elif isinstance(response, (int, float)):
                is_met = response > 0
            else:
                is_met = False
            if is_met:
                met += 1
            else:
                gaps.append({
                    'category': cat_name,
                    'item': item,
                    'label': item.replace('_', ' ').title(),
                    'priority': 'high' if cat_info['weight'] >= 0.20 else 'medium',
                })

        cat_score = round((met / total) * 100, 1) if total > 0 else 0
        category_scores[cat_name] = {
            'score': cat_score,
            'met': met,
            'total': total,
            'weight': cat_info['weight'],
        }
        weighted_total += cat_score * cat_info['weight']

    overall = round(weighted_total, 1)
    return category_scores, overall, gaps


# =============================================================================
# 15. API ROUTES - DOCUMENTS
# =============================================================================

@app.route('/api/documents', methods=['GET'])
@login_required
def api_list_documents():
    """List documents uploaded by the current user's organization."""
    org_id = current_user.org_id
    # Get documents from applications belonging to this org
    from sqlalchemy import or_
    app_ids = [a.id for a in Application.query.filter_by(ngo_org_id=org_id).all()]
    assess_ids = [a.id for a in Assessment.query.filter_by(org_id=org_id).all()]
    conditions = []
    if app_ids:
        conditions.append(Document.application_id.in_(app_ids))
    if assess_ids:
        conditions.append(Document.assessment_id.in_(assess_ids))
    if conditions:
        docs = Document.query.filter(or_(*conditions)).order_by(Document.uploaded_at.desc()).all()
    else:
        docs = []
    return jsonify({'success': True, 'documents': [d.to_dict() for d in docs]})


@app.route('/api/documents/upload', methods=['POST'])
@login_required
def api_upload_document():
    """Upload a document and trigger AI analysis."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided', 'success': False}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected', 'success': False}), 400

    if not allowed_file(file.filename):
        return jsonify({
            'error': f'File type not allowed. Allowed: {", ".join(ALLOWED_EXTENSIONS)}',
            'success': False,
        }), 400

    # Secure the filename and generate unique stored name
    original_filename = secure_filename(file.filename)
    ext = original_filename.rsplit('.', 1)[-1].lower() if '.' in original_filename else ''
    stored_filename = f"{uuid.uuid4().hex}.{ext}" if ext else uuid.uuid4().hex

    filepath = os.path.join(app.config['UPLOAD_FOLDER'], stored_filename)
    file.save(filepath)
    file_size = os.path.getsize(filepath)

    # Determine MIME type
    mime_map = {
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls': 'application/vnd.ms-excel',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'csv': 'text/csv',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'txt': 'text/plain',
    }
    mime_type = mime_map.get(ext, 'application/octet-stream')

    # Get metadata from form
    application_id = request.form.get('application_id', type=int)
    assessment_id = request.form.get('assessment_id', type=int)
    doc_type = request.form.get('doc_type', 'general')

    # Create document record
    document = Document(
        application_id=application_id,
        assessment_id=assessment_id,
        doc_type=doc_type,
        original_filename=original_filename,
        stored_filename=stored_filename,
        file_size=file_size,
        mime_type=mime_type,
    )

    # Run AI analysis
    try:
        analysis = AIService.analyze_document(original_filename, doc_type, file_size, file_path=filepath)
        document.set_ai_analysis(analysis)
        document.score = analysis.get('score', 0)
    except Exception as e:
        logger.error(f"Document analysis failed: {e}")
        document.set_ai_analysis({
            'score': 50,
            'findings': ['Analysis could not be completed'],
            'recommendations': ['Manual review recommended'],
        })
        document.score = 50

    db.session.add(document)
    db.session.commit()

    logger.info(f"Document uploaded: {original_filename} (id={document.id}, score={document.score})")
    return jsonify({'success': True, 'document': document.to_dict()}), 201


@app.route('/api/documents/<int:doc_id>', methods=['GET'])
@login_required
def api_get_document(doc_id):
    """Get document metadata and AI analysis."""
    document = db.session.get(Document, doc_id)
    if not document:
        return jsonify({'error': 'Document not found'}), 404

    # Access control: verify user has access to the related application/assessment
    if document.application_id:
        application = db.session.get(Application, document.application_id)
        if application:
            if current_user.role == 'ngo' and application.ngo_org_id != current_user.org_id:
                return jsonify({'error': 'Access denied'}), 403
    if document.assessment_id:
        assessment = db.session.get(Assessment, document.assessment_id)
        if assessment:
            if current_user.role not in ('admin',) and assessment.org_id != current_user.org_id:
                return jsonify({'error': 'Access denied'}), 403

    return jsonify({'document': document.to_dict()})


# =============================================================================
# 16. API ROUTES - AI
# =============================================================================

@app.route('/api/ai/chat', methods=['POST'])
@login_required
def api_ai_chat():
    """AI chat endpoint - contextual help for users."""
    data = get_request_json()
    message = data.get('message', '').strip()

    if not message:
        return jsonify({'error': 'Message is required', 'success': False}), 400

    context = data.get('context', {})
    result = AIService.chat(message, context, user_role=current_user.role)

    return jsonify({
        'success': True,
        'response': result['response'],
        'source': result.get('source', 'unknown'),
    })


@app.route('/api/ai/guidance', methods=['POST'])
@login_required
def api_ai_guidance():
    """AI guidance endpoint - field-specific writing advice."""
    data = get_request_json()
    field_name = data.get('field_name', '').strip()

    if not field_name:
        return jsonify({'error': 'field_name is required', 'success': False}), 400

    grant_criteria = data.get('grant_criteria')
    current_text = data.get('current_text', '')

    result = AIService.guidance(field_name, grant_criteria, current_text)

    return jsonify({
        'success': True,
        'guidance': result['guidance'],
        'quality_score': result.get('quality_score', 0),
        'source': result.get('source', 'unknown'),
    })


@app.route('/api/ai/score-application', methods=['POST'])
@login_required
def api_ai_score_application():
    """AI scoring endpoint - score an application using the scoring engine."""
    data = get_request_json()
    application_id = data.get('application_id')

    if not application_id:
        return jsonify({'error': 'application_id is required', 'success': False}), 400

    application = db.session.get(Application, application_id)
    if not application:
        return jsonify({'error': 'Application not found', 'success': False}), 404

    # Access control
    if current_user.role == 'ngo' and application.ngo_org_id != current_user.org_id:
        return jsonify({'error': 'Access denied'}), 403
    if current_user.role == 'donor':
        grant = db.session.get(Grant, application.grant_id)
        if not grant or grant.donor_org_id != current_user.org_id:
            return jsonify({'error': 'Access denied'}), 403

    # Run scoring
    score_result = ScoringEngine.score_application(application)

    # Save score to application
    application.ai_score = score_result.get('overall_score')
    if application.human_score is not None:
        application.final_score = round(
            (application.ai_score * 0.4) + (application.human_score * 0.6), 2
        )
    else:
        application.final_score = application.ai_score
    db.session.commit()

    return jsonify({
        'success': True,
        'scores': score_result,
        'application_id': application_id,
    })


# =============================================================================
# 17. API ROUTES - COMPLIANCE
# =============================================================================

@app.route('/api/compliance/<int:org_id>', methods=['GET'])
@login_required
def api_get_compliance(org_id):
    """Get all compliance checks for an organization."""
    org = db.session.get(Organization, org_id)
    if not org:
        return jsonify({'error': 'Organization not found'}), 404

    checks = ComplianceCheck.query.filter_by(org_id=org_id) \
        .order_by(ComplianceCheck.checked_at.desc()).all()

    # Determine overall compliance status
    statuses = [c.status for c in checks]
    if 'flagged' in statuses:
        overall_status = 'flagged'
    elif 'error' in statuses:
        overall_status = 'error'
    elif 'pending' in statuses:
        overall_status = 'pending'
    elif checks:
        overall_status = 'clear'
    else:
        overall_status = 'not_screened'

    return jsonify({
        'org_id': org_id,
        'org_name': org.name,
        'overall_status': overall_status,
        'checks': [c.to_dict() for c in checks],
        'last_checked': checks[0].checked_at.isoformat() if checks else None,
    })


@app.route('/api/compliance/screen', methods=['POST'])
@login_required
def api_compliance_screen():
    """Run compliance screening on an organization."""
    data = get_request_json()
    org_name = data.get('org_name', '').strip()
    country = data.get('country', '').strip()
    personnel = data.get('personnel', [])
    org_id = data.get('org_id')

    if not org_name:
        return jsonify({'error': 'org_name is required', 'success': False}), 400

    # Run screening
    check_results = ComplianceService.screen_organization(
        org_name, country, personnel, org_id
    )

    # Save to database if org_id is provided
    saved_checks = []
    if org_id:
        org = db.session.get(Organization, org_id)
        if org:
            # Remove old checks for this org
            ComplianceCheck.query.filter_by(org_id=org_id).delete()
            saved_checks = ComplianceService.save_checks(org_id, check_results)

    # Determine overall status
    statuses = [c['status'] for c in check_results]
    overall_status = 'flagged' if 'flagged' in statuses else 'clear'

    return jsonify({
        'success': True,
        'overall_status': overall_status,
        'checks': check_results,
        'saved_count': len(saved_checks),
    })


# =============================================================================
# 18. API ROUTES - REVIEWS
# =============================================================================

@app.route('/api/reviews', methods=['GET'])
@login_required
def api_list_reviews():
    """List reviews based on user role."""
    query = Review.query

    if current_user.role == 'reviewer':
        # Reviewer sees only their assigned reviews
        query = query.filter_by(reviewer_user_id=current_user.id)
    elif current_user.role == 'donor':
        # Donor sees all reviews for their grants
        query = query.join(Application).join(Grant).filter(
            Grant.donor_org_id == current_user.org_id
        )
    elif current_user.role != 'admin':
        # NGOs can see reviews for their applications (read only)
        query = query.join(Application).filter(
            Application.ngo_org_id == current_user.org_id
        )

    status = request.args.get('status')
    if status:
        query = query.filter(Review.status == status)

    application_id = request.args.get('application_id', type=int)
    if application_id:
        query = query.filter(Review.application_id == application_id)

    query = query.order_by(Review.created_at.desc())
    pagination = paginate_query(query)

    return jsonify({
        'reviews': [r.to_dict() for r in pagination.items],
        'total': pagination.total,
        'page': pagination.page,
        'pages': pagination.pages,
    })


@app.route('/api/reviews/<int:review_id>', methods=['GET'])
@login_required
def api_get_review(review_id):
    """Get full review detail."""
    review = db.session.get(Review, review_id)
    if not review:
        return jsonify({'error': 'Review not found'}), 404

    # Access control
    if current_user.role == 'reviewer' and review.reviewer_user_id != current_user.id:
        return jsonify({'error': 'Access denied'}), 403
    if current_user.role == 'donor':
        application = db.session.get(Application, review.application_id)
        if application:
            grant = db.session.get(Grant, application.grant_id)
            if not grant or grant.donor_org_id != current_user.org_id:
                return jsonify({'error': 'Access denied'}), 403

    data = review.to_dict()

    # Include application and grant context
    application = db.session.get(Application, review.application_id)
    if application:
        data['application'] = application.to_dict(summary=True)
        if application.grant:
            data['grant'] = application.grant.to_dict(summary=True)
            data['grant_criteria'] = application.grant.get_criteria()

    return jsonify({'review': data})


@app.route('/api/reviews', methods=['POST'])
@role_required('donor', 'admin')
def api_create_review():
    """Create/assign a new review."""
    data = get_request_json()
    application_id = data.get('application_id')
    reviewer_user_id = data.get('reviewer_user_id')

    if not application_id or not reviewer_user_id:
        return jsonify({
            'error': 'application_id and reviewer_user_id are required',
            'success': False,
        }), 400

    application = db.session.get(Application, application_id)
    if not application:
        return jsonify({'error': 'Application not found', 'success': False}), 404

    reviewer = db.session.get(User, reviewer_user_id)
    if not reviewer or reviewer.role != 'reviewer':
        return jsonify({'error': 'Reviewer not found or user is not a reviewer', 'success': False}), 404

    # Check for existing review by this reviewer for this application
    existing = Review.query.filter_by(
        application_id=application_id, reviewer_user_id=reviewer_user_id
    ).first()
    if existing:
        return jsonify({
            'error': 'This reviewer already has a review for this application',
            'existing_review_id': existing.id,
            'success': False,
        }), 409

    review = Review(
        application_id=application_id,
        reviewer_user_id=reviewer_user_id,
        status='assigned',
    )

    # Update application status
    if application.status == 'submitted':
        application.status = 'under_review'

    db.session.add(review)
    db.session.commit()

    logger.info(f"Review assigned: app={application_id}, reviewer={reviewer_user_id}, review_id={review.id}")
    return jsonify({'success': True, 'review': review.to_dict()}), 201


@app.route('/api/reviews/<int:review_id>', methods=['PUT'])
@login_required
def api_update_review(review_id):
    """Update review scores and comments."""
    review = db.session.get(Review, review_id)
    if not review:
        return jsonify({'error': 'Review not found'}), 404

    # Only the assigned reviewer, donor, or admin can update
    if current_user.role == 'reviewer' and review.reviewer_user_id != current_user.id:
        return jsonify({'error': 'Access denied'}), 403

    if review.status == 'completed' and current_user.role not in ('admin',):
        return jsonify({'error': 'Cannot edit a completed review', 'success': False}), 400

    data = get_request_json()

    if 'scores' in data:
        review.set_scores(data['scores'])
    if 'comments' in data:
        review.set_comments(data['comments'])
    if 'overall_score' in data:
        review.overall_score = data['overall_score']

    # Auto-calculate overall from criterion scores if not explicitly set
    if 'scores' in data and 'overall_score' not in data:
        scores = review.get_scores() or {}
        if scores:
            # Get criterion weights from grant
            application = db.session.get(Application, review.application_id)
            if application and application.grant:
                criteria = application.grant.get_criteria() or []
                weight_map = {str(c.get('id', '')): c.get('weight', 1) for c in criteria}
                total_weight = 0
                weighted_sum = 0
                for cid, score_val in scores.items():
                    if isinstance(score_val, (int, float)):
                        w = weight_map.get(cid, 1)
                        weighted_sum += score_val * w
                        total_weight += w
                if total_weight > 0:
                    review.overall_score = round(weighted_sum / total_weight, 2)

    if review.status == 'assigned':
        review.status = 'in_progress'

    db.session.commit()
    return jsonify({'success': True, 'review': review.to_dict()})


@app.route('/api/reviews/<int:review_id>/complete', methods=['POST'])
@login_required
def api_complete_review(review_id):
    """Mark a review as complete and update application scores."""
    review = db.session.get(Review, review_id)
    if not review:
        return jsonify({'error': 'Review not found'}), 404

    if current_user.role == 'reviewer' and review.reviewer_user_id != current_user.id:
        return jsonify({'error': 'Access denied'}), 403

    if review.status == 'completed':
        return jsonify({'error': 'Review is already completed', 'success': False}), 400

    # Ensure scores have been provided
    scores = review.get_scores() or {}
    if not scores:
        return jsonify({
            'error': 'Cannot complete a review without scores',
            'success': False,
        }), 400

    review.status = 'completed'
    review.completed_at = datetime.utcnow()

    # Update application human_score as average of all completed reviews
    application = db.session.get(Application, review.application_id)
    if application:
        completed_reviews = Review.query.filter_by(
            application_id=application.id, status='completed'
        ).all()
        # Include this review (status just set to completed above, but not yet committed)
        review_scores = [r.overall_score for r in completed_reviews if r.overall_score is not None]
        if review.overall_score is not None and review.overall_score not in review_scores:
            review_scores.append(review.overall_score)

        if review_scores:
            application.human_score = round(sum(review_scores) / len(review_scores), 2)
            # Recalculate final score: 40% AI + 60% human
            if application.ai_score is not None:
                application.final_score = round(
                    (application.ai_score * 0.4) + (application.human_score * 0.6), 2
                )
            else:
                application.final_score = application.human_score

            # Update application status
            all_reviews = Review.query.filter_by(application_id=application.id).all()
            all_completed = all(r.status == 'completed' for r in all_reviews)
            if all_completed:
                application.status = 'scored'

    db.session.commit()

    logger.info(f"Review completed: review_id={review_id}, score={review.overall_score}")
    return jsonify({'success': True, 'review': review.to_dict()})


# =============================================================================
# 18b. API ROUTES - REPORTS
# =============================================================================

@app.route('/api/reports', methods=['GET'])
@login_required
def api_list_reports():
    """List reports - filtered by role."""
    role = current_user.role
    org_id = current_user.org_id

    if role == 'ngo':
        query = Report.query.filter_by(submitted_by_org_id=org_id)
    elif role == 'donor':
        # Reports for grants owned by this donor
        query = Report.query.join(Grant).filter(Grant.donor_org_id == org_id)
    else:
        query = Report.query

    grant_id = request.args.get('grant_id', type=int)
    if grant_id:
        query = query.filter(Report.grant_id == grant_id)

    status = request.args.get('status')
    if status:
        query = query.filter(Report.status == status)

    query = query.order_by(Report.created_at.desc())
    reports = query.all()

    return jsonify({
        'reports': [r.to_dict() for r in reports],
        'total': len(reports),
    })


@app.route('/api/reports', methods=['POST'])
@login_required
def api_create_report():
    """Create a new report (NGO)."""
    data = get_request_json()

    grant_id = data.get('grant_id')
    if not grant_id:
        return jsonify({'error': 'grant_id is required'}), 400

    grant = db.session.get(Grant, grant_id)
    if not grant:
        return jsonify({'error': 'Grant not found'}), 404

    report = Report(
        grant_id=grant_id,
        application_id=data.get('application_id'),
        submitted_by_org_id=current_user.org_id,
        report_type=data.get('report_type', 'progress'),
        reporting_period=data.get('reporting_period', ''),
        title=data.get('title', ''),
        status='draft',
    )

    if data.get('content'):
        report.set_content(data['content'])
    if data.get('due_date'):
        try:
            report.due_date = date.fromisoformat(data['due_date'])
        except (ValueError, TypeError):
            pass

    db.session.add(report)
    db.session.commit()

    return jsonify({'success': True, 'report': report.to_dict()}), 201


@app.route('/api/reports/<int:report_id>', methods=['GET'])
@login_required
def api_get_report(report_id):
    """Get report detail."""
    report = db.session.get(Report, report_id)
    if not report:
        return jsonify({'error': 'Report not found'}), 404

    # Access control
    if current_user.role == 'ngo' and report.submitted_by_org_id != current_user.org_id:
        return jsonify({'error': 'Access denied'}), 403
    if current_user.role == 'donor':
        grant = db.session.get(Grant, report.grant_id)
        if grant and grant.donor_org_id != current_user.org_id:
            return jsonify({'error': 'Access denied'}), 403

    data = report.to_dict()
    # Include grant reporting requirements for context
    grant = db.session.get(Grant, report.grant_id)
    if grant:
        data['grant_reporting_requirements'] = grant.get_reporting_requirements()
        data['grant_report_template'] = grant.get_report_template()
        data['grant_reporting_frequency'] = grant.reporting_frequency

    return jsonify({'report': data})


@app.route('/api/reports/<int:report_id>', methods=['PUT'])
@login_required
def api_update_report(report_id):
    """Update report content (NGO editing draft) or donor adding review notes."""
    report = db.session.get(Report, report_id)
    if not report:
        return jsonify({'error': 'Report not found'}), 404

    data = get_request_json()

    if current_user.role == 'ngo':
        if report.submitted_by_org_id != current_user.org_id:
            return jsonify({'error': 'Access denied'}), 403
        if report.status not in ('draft', 'revision_requested'):
            return jsonify({'error': 'Report cannot be edited in current status'}), 400

        if 'content' in data:
            report.set_content(data['content'])
        if 'title' in data:
            report.title = data['title']
        if 'reporting_period' in data:
            report.reporting_period = data['reporting_period']
        if 'report_type' in data:
            report.report_type = data['report_type']
        if 'attachments' in data:
            report.set_attachments(data['attachments'])

    db.session.commit()
    return jsonify({'success': True, 'report': report.to_dict()})


@app.route('/api/reports/<int:report_id>/submit', methods=['POST'])
@login_required
def api_submit_report(report_id):
    """Submit report to donor."""
    report = db.session.get(Report, report_id)
    if not report:
        return jsonify({'error': 'Report not found'}), 404

    if report.submitted_by_org_id != current_user.org_id:
        return jsonify({'error': 'Access denied'}), 403

    if report.status not in ('draft', 'revision_requested'):
        return jsonify({'error': 'Report already submitted'}), 400

    report.status = 'submitted'
    report.submitted_at = datetime.utcnow()

    # Run AI analysis against grant requirements
    try:
        grant = db.session.get(Grant, report.grant_id)
        requirements = grant.get_reporting_requirements() if grant else []
        content = report.get_content()

        analysis = AIService.analyze_report(content, requirements, report.report_type)
        report.set_ai_analysis(analysis)
    except Exception as e:
        logger.error(f"Report AI analysis failed: {e}")

    db.session.commit()
    return jsonify({'success': True, 'report': report.to_dict()})


@app.route('/api/reports/<int:report_id>/review', methods=['POST'])
@login_required
def api_review_report(report_id):
    """Donor reviews a submitted report."""
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'Only donors can review reports'}), 403

    report = db.session.get(Report, report_id)
    if not report:
        return jsonify({'error': 'Report not found'}), 404

    # Verify donor owns the grant
    grant = db.session.get(Grant, report.grant_id)
    if not grant or (current_user.role == 'donor' and grant.donor_org_id != current_user.org_id):
        return jsonify({'error': 'Access denied'}), 403

    data = get_request_json()
    action = data.get('action')  # 'accept' or 'request_revision'

    if action == 'accept':
        report.status = 'accepted'
    elif action == 'request_revision':
        report.status = 'revision_requested'
    else:
        return jsonify({'error': 'action must be "accept" or "request_revision"'}), 400

    report.reviewer_notes = data.get('notes', '')
    report.reviewed_at = datetime.utcnow()

    db.session.commit()
    return jsonify({'success': True, 'report': report.to_dict()})


@app.route('/api/grants/<int:grant_id>/upload-grant-doc', methods=['POST'])
@login_required
def api_upload_grant_doc(grant_id):
    """Upload the actual grant document for a grant. AI extracts reporting requirements."""
    grant = db.session.get(Grant, grant_id)
    if not grant:
        return jsonify({'error': 'Grant not found'}), 404

    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'Only donors can upload grant documents'}), 403

    if grant.donor_org_id != current_user.org_id and current_user.role != 'admin':
        return jsonify({'error': 'Access denied'}), 403

    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    original_filename = secure_filename(file.filename)
    ext = original_filename.rsplit('.', 1)[-1].lower() if '.' in original_filename else ''
    stored_filename = f"grant_doc_{grant_id}_{uuid.uuid4().hex}.{ext}"

    filepath = os.path.join(app.config['UPLOAD_FOLDER'], stored_filename)
    file.save(filepath)

    grant.grant_document = stored_filename

    # Try to read file content for AI analysis
    file_content = ''
    try:
        if ext == 'txt':
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                file_content = f.read()
        elif ext == 'csv':
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                file_content = f.read()
        else:
            # For PDF/DOCX, we can't easily read without extra libs
            # Use filename and grant context
            file_content = f"Grant document: {original_filename} for grant: {grant.title}. {grant.description or ''}"
    except Exception as e:
        logger.error(f"Failed to read grant document: {e}")
        file_content = f"Grant document: {original_filename} for grant: {grant.title}"

    # AI extracts reporting requirements
    extracted = AIService.extract_reporting_requirements(file_content, grant.title)

    db.session.commit()

    return jsonify({
        'success': True,
        'grant_document': stored_filename,
        'extracted_requirements': extracted,
    })


@app.route('/api/ai/analyze-report', methods=['POST'])
@login_required
def api_ai_analyze_report():
    """AI analyzes a submitted report against requirements."""
    data = get_request_json()

    report_id = data.get('report_id')
    if report_id:
        report = db.session.get(Report, report_id)
        if not report:
            return jsonify({'error': 'Report not found'}), 404

        # Access control
        if current_user.role == 'ngo' and report.submitted_by_org_id != current_user.org_id:
            return jsonify({'error': 'Access denied'}), 403

        content = report.get_content()
        report_type = report.report_type
        grant = db.session.get(Grant, report.grant_id)
        requirements = grant.get_reporting_requirements() if grant else []
    else:
        # Allow ad-hoc analysis without a saved report
        content = data.get('content', {})
        report_type = data.get('report_type', 'progress')
        requirements = data.get('requirements', [])

    analysis = AIService.analyze_report(content, requirements, report_type)

    # If report_id was provided, save the analysis
    if report_id and report:
        report.set_ai_analysis(analysis)
        db.session.commit()

    return jsonify({
        'success': True,
        'analysis': analysis,
    })


@app.route('/api/ai/extract-reporting-requirements', methods=['POST'])
@login_required
def api_ai_extract_reporting_requirements():
    """AI reads a grant document file and extracts reporting requirements."""
    data = get_request_json()

    grant_id = data.get('grant_id')
    file_content = data.get('file_content', '')
    grant_title = data.get('grant_title', '')

    # If grant_id provided, try to read the uploaded grant document
    if grant_id:
        grant = db.session.get(Grant, grant_id)
        if grant:
            grant_title = grant_title or grant.title
            if grant.grant_document and not file_content:
                filepath = os.path.join(app.config['UPLOAD_FOLDER'], grant.grant_document)
                try:
                    ext = grant.grant_document.rsplit('.', 1)[-1].lower()
                    if ext in ('txt', 'csv'):
                        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                            file_content = f.read()
                    else:
                        file_content = f"Grant document: {grant.grant_document} for grant: {grant.title}. {grant.description or ''}"
                except Exception as e:
                    logger.error(f"Failed to read grant document for extraction: {e}")
                    file_content = f"Grant: {grant.title}. {grant.description or ''}"

    if not file_content:
        return jsonify({'error': 'No file content available for analysis'}), 400

    extracted = AIService.extract_reporting_requirements(file_content, grant_title)

    return jsonify({
        'success': True,
        'extracted': extracted,
    })


# =============================================================================
# 19. ERROR HANDLERS
# =============================================================================

@app.errorhandler(400)
def bad_request(error):
    return jsonify({'error': 'Bad request', 'message': str(error)}), 400


@app.errorhandler(404)
def not_found(error):
    # If it looks like an API request, return JSON
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Resource not found'}), 404
    # Otherwise fall through to SPA
    return send_from_directory(app.static_folder, 'index.html') \
        if os.path.exists(os.path.join(app.static_folder, 'index.html')) \
        else (jsonify({'error': 'Not found'}), 404)


@app.errorhandler(405)
def method_not_allowed(error):
    return jsonify({'error': 'Method not allowed'}), 405


@app.errorhandler(413)
def request_entity_too_large(error):
    return jsonify({'error': 'File too large. Maximum size is 16 MB.'}), 413


@app.errorhandler(500)
def internal_error(error):
    db.session.rollback()
    logger.error(f"Internal server error: {error}")
    return jsonify({'error': 'Internal server error'}), 500


# =============================================================================
# 20. STATIC / SPA FALLBACK
# =============================================================================

@app.route('/')
def index():
    """Serve the SPA index page."""
    index_path = os.path.join(app.static_folder, 'index.html')
    if os.path.exists(index_path):
        return send_from_directory(app.static_folder, 'index.html')
    templates_index = os.path.join(app.template_folder, 'index.html')
    if os.path.exists(templates_index):
        from flask import render_template
        return render_template('index.html')
    return jsonify({
        'name': 'Kuja Grant Management System',
        'version': '1.0.0',
        'status': 'running',
        'api_docs': '/api',
        'endpoints': {
            'auth': '/api/auth/login',
            'dashboard': '/api/dashboard/stats',
            'grants': '/api/grants',
            'applications': '/api/applications',
            'organizations': '/api/organizations',
            'assessments': '/api/assessments',
            'assessment_frameworks': '/api/assessments/frameworks',
            'documents': '/api/documents/upload',
            'ai_chat': '/api/ai/chat',
            'ai_analyze_report': '/api/ai/analyze-report',
            'ai_extract_requirements': '/api/ai/extract-reporting-requirements',
            'compliance': '/api/compliance/<org_id>',
            'reviews': '/api/reviews',
            'reports': '/api/reports',
        },
    })


@app.route('/api')
def api_info():
    """API information and available endpoints."""
    return jsonify({
        'name': 'Kuja Grant Management API',
        'version': '1.0.0',
        'description': 'REST API for the Kuja Grant Management System',
        'endpoints': {
            'auth': {
                'POST /api/auth/login': 'Authenticate with email and password',
                'POST /api/auth/logout': 'Log out current user',
                'GET /api/auth/me': 'Get current user info',
            },
            'dashboard': {
                'GET /api/dashboard/stats': 'Get role-specific dashboard statistics',
            },
            'organizations': {
                'GET /api/organizations': 'List organizations (query: ?type=ngo)',
                'GET /api/organizations/<id>': 'Get organization detail with compliance checks',
            },
            'grants': {
                'GET /api/grants': 'List grants (query: ?status=open&sector=Health)',
                'GET /api/grants/<id>': 'Get grant detail with criteria',
                'POST /api/grants': 'Create grant (donor only)',
                'PUT /api/grants/<id>': 'Update grant',
                'POST /api/grants/<id>/publish': 'Publish grant',
            },
            'applications': {
                'GET /api/applications': 'List applications (role-filtered)',
                'GET /api/applications/<id>': 'Get application detail',
                'POST /api/applications': 'Create application (NGO only)',
                'PUT /api/applications/<id>': 'Update application',
                'POST /api/applications/<id>/submit': 'Submit application',
            },
            'assessments': {
                'GET /api/assessments': 'List assessments',
                'GET /api/assessments/<id>': 'Get assessment detail',
                'POST /api/assessments': 'Start new assessment',
                'PUT /api/assessments/<id>': 'Update assessment',
            },
            'documents': {
                'POST /api/documents/upload': 'Upload document (multipart)',
                'GET /api/documents/<id>': 'Get document metadata and AI analysis',
            },
            'ai': {
                'POST /api/ai/chat': 'AI chat assistant',
                'POST /api/ai/guidance': 'AI writing guidance',
                'POST /api/ai/score-application': 'AI application scoring',
            },
            'compliance': {
                'GET /api/compliance/<org_id>': 'Get compliance checks for org',
                'POST /api/compliance/screen': 'Run compliance screening',
            },
            'reviews': {
                'GET /api/reviews': 'List reviews (role-filtered)',
                'GET /api/reviews/<id>': 'Get review detail',
                'POST /api/reviews': 'Assign review (donor/admin)',
                'PUT /api/reviews/<id>': 'Update review scores',
                'POST /api/reviews/<id>/complete': 'Complete review',
            },
            'reports': {
                'GET /api/reports': 'List reports (role-filtered)',
                'GET /api/reports/<id>': 'Get report detail',
                'POST /api/reports': 'Create report (NGO)',
                'PUT /api/reports/<id>': 'Update report',
                'POST /api/reports/<id>/submit': 'Submit report to donor',
                'POST /api/reports/<id>/review': 'Donor reviews report',
                'POST /api/grants/<id>/upload-grant-doc': 'Upload grant document',
                'POST /api/ai/extract-reporting-requirements': 'AI extracts requirements from doc',
                'POST /api/ai/analyze-report': 'AI analyzes submitted report',
            },
        },
    })


@app.route('/uploads/<path:filename>')
@login_required
def serve_upload(filename):
    """Serve uploaded files (authenticated access only)."""
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)


# Catch-all for SPA routing: serve index.html for unmatched non-API routes
@app.route('/<path:path>')
def catch_all(path):
    """SPA catch-all route - serve static files or fall back to index.html."""
    # Try to serve static file first
    static_path = os.path.join(app.static_folder, path)
    if os.path.isfile(static_path):
        return send_from_directory(app.static_folder, path)

    # Fall back to SPA index
    index_path = os.path.join(app.static_folder, 'index.html')
    if os.path.exists(index_path):
        return send_from_directory(app.static_folder, 'index.html')

    templates_index = os.path.join(app.template_folder, 'index.html')
    if os.path.exists(templates_index):
        from flask import render_template
        return render_template('index.html')

    return jsonify({'error': 'Not found'}), 404


# =============================================================================
# AUTO-CREATE TABLES ON IMPORT (for Railway/production)
# =============================================================================

with app.app_context():
    db.create_all()

# =============================================================================
# END OF SERVER
# =============================================================================
