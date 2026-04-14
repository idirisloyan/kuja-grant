"""Report model - Grant reports submitted by NGOs back to donors."""

from datetime import datetime, timezone

from app.extensions import db
from app.utils.helpers import _json_load, _json_dump


class Report(db.Model):
    """Grant reports submitted by NGOs back to donors."""
    __tablename__ = 'reports'
    __table_args__ = (
        db.Index('ix_reports_org_status', 'submitted_by_org_id', 'status'),
        db.Index('ix_reports_grant_status', 'grant_id', 'status'),
        db.Index('ix_reports_submitted_by_org', 'submitted_by_org_id'),
    )

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
    revision_number = db.Column(db.Integer, default=1)
    revision_history = db.Column(db.Text, nullable=True)  # JSON array of revision snapshots
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

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

    def get_revision_history(self):
        return _json_load(self.revision_history) or []

    def set_revision_history(self, value):
        self.revision_history = _json_dump(value)

    def append_revision_snapshot(self, reviewer_notes=None):
        """Append the current report state to revision_history and increment revision_number."""
        history = self.get_revision_history()
        snapshot = {
            'version': self.revision_number,
            'content_snapshot': self.get_content(),
            'submitted_at': self.submitted_at.isoformat() if self.submitted_at else None,
            'ai_score': self.get_ai_analysis().get('overall_score'),
            'reviewer_notes': reviewer_notes,
            'status': self.status,
            'recorded_at': datetime.now(timezone.utc).isoformat(),
        }
        history.append(snapshot)
        self.set_revision_history(history)
        self.revision_number = (self.revision_number or 1) + 1

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
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'revision_number': self.revision_number or 1,
            'revision_count': len(self.get_revision_history()),
            'grant_title': self.grant.title if self.grant else None,
            'org_name': self.submitted_by_org.name if self.submitted_by_org else None,
        }
