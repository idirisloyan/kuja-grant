"""MemberFeedback — Phase 43B (May 2026).

NEAR's risk pillar 4 in the IKEA Concept Note is "Feedback mechanisms:
Regular review meetings between the secretariat and members explore
feedback received through the multiple available channels." Today the
only place the system captures member-side feedback is the
community_feedback_summary on MonitoringVisit — per-grant,
secretariat-recorded. There's no standing channel for the NGO itself
to file feedback on the process, the system, an OB decision, or
secretariat support.

This model is that channel. NGOs file feedback (categorised), the
secretariat sees an inbox, responds, and tracks status. Closes the
gap between what the Concept Note says NEAR does and what the
platform actually captures.
"""

from datetime import datetime, timezone

from app.extensions import db


FEEDBACK_CATEGORIES = (
    'process',      # the application / decision / reporting process
    'system',       # the Kuja platform itself
    'decision',     # an OB funding decision
    'support',      # the secretariat's responsiveness
    'suggestion',   # general suggestion
    'other',
)

FEEDBACK_STATUSES = (
    'open',
    'in_review',
    'addressed',
    'closed',
)


class MemberFeedback(db.Model):
    __tablename__ = 'member_feedback'
    __table_args__ = (
        db.Index('ix_member_feedback_network_status', 'network_id', 'status'),
        db.Index('ix_member_feedback_org', 'org_id'),
    )

    id = db.Column(db.Integer, primary_key=True)
    network_id = db.Column(db.Integer, db.ForeignKey('networks.id'), nullable=False)
    org_id = db.Column(db.Integer, db.ForeignKey('organizations.id'), nullable=False)
    submitted_by_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    category = db.Column(db.String(40), nullable=False, default='other')
    subject = db.Column(db.String(200), nullable=False)
    body_md = db.Column(db.Text, nullable=False)

    related_kind = db.Column(db.String(40), nullable=True)
    related_id = db.Column(db.Integer, nullable=True)

    status = db.Column(db.String(20), nullable=False, default='open')
    response_md = db.Column(db.Text, nullable=True)
    response_at = db.Column(db.DateTime, nullable=True)
    response_by_user_id = db.Column(db.Integer, nullable=True)

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def to_dict(self) -> dict:
        from app.models import User, Organization
        submitter = User.query.get(self.submitted_by_user_id) if self.submitted_by_user_id else None
        responder = User.query.get(self.response_by_user_id) if self.response_by_user_id else None
        org = Organization.query.get(self.org_id) if self.org_id else None
        return {
            'id': self.id,
            'network_id': self.network_id,
            'org_id': self.org_id,
            'org_name': org.name if org else None,
            'submitted_by_user_id': self.submitted_by_user_id,
            'submitted_by_name': submitter.name if submitter else None,
            'submitted_by_email': submitter.email if submitter else None,
            'category': self.category,
            'subject': self.subject,
            'body_md': self.body_md,
            'related_kind': self.related_kind,
            'related_id': self.related_id,
            'status': self.status,
            'response_md': self.response_md,
            'response_at': self.response_at.isoformat() if self.response_at else None,
            'response_by_user_id': self.response_by_user_id,
            'response_by_name': responder.name if responder else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
