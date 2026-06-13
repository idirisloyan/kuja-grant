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

    # Phase 14 — Win/loss debrief (PMO transfer pattern). Donor-recorded
    # at the moment of award/rejection so NGOs get structured feedback +
    # the system can aggregate "why we typically win/lose" patterns.
    # decision_reason_code is from a controlled vocab (see WIN_LOSS_REASONS
    # in app/constants.py) so analytics are clean across orgs.
    decision_reason_code = db.Column(db.String(60), nullable=True)
    decision_notes = db.Column(db.Text, nullable=True)
    decision_recorded_at = db.Column(db.DateTime, nullable=True)
    decision_recorded_by_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    # Phase 40 — NEAR network grants only. Auto-populated on /submit when
    # grant.fund_window_id is set:
    #   - ai_rubric_result_json: full breakdown from the Phase 38 rubric
    #     scorer (per-criterion scores + rationale). Lets the operator
    #     dashboard show WHY the AI gave the overall score.
    #   - budget_lines_json: structured budget the NGO declared. Shape:
    #     [{'item': str, 'amount': float}, ...]. Used by the
    #     direct-to-community hard-gate at submit time and the operator's
    #     budget classifier view.
    ai_rubric_result_json = db.Column(db.Text, nullable=True)
    budget_lines_json = db.Column(db.Text, nullable=True)

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

    def get_ai_rubric_result(self):
        return _json_load(self.ai_rubric_result_json) or None

    def set_ai_rubric_result(self, value):
        self.ai_rubric_result_json = _json_dump(value) if value else None

    def get_budget_lines(self):
        val = _json_load(self.budget_lines_json) or []
        return val if isinstance(val, list) else []

    def set_budget_lines(self, value):
        self.budget_lines_json = _json_dump(value or [])

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
            'decision_reason_code': self.decision_reason_code,
            'decision_notes': self.decision_notes,
            'decision_recorded_at': self.decision_recorded_at.isoformat() if self.decision_recorded_at else None,
            'decision_recorded_by_user_id': self.decision_recorded_by_user_id,
        }
        if not summary:
            data['responses'] = self.get_responses()
            data['eligibility_responses'] = self.get_eligibility_responses()
            data['ai_rubric_result'] = self.get_ai_rubric_result()
            data['budget_lines'] = self.get_budget_lines()
        # Include related names
        if self.grant:
            data['grant_title'] = self.grant.title
        if self.ngo_org:
            data['ngo_org_name'] = self.ngo_org.name
            data['org_name'] = self.ngo_org.name      # alias for frontend
            data['country'] = self.ngo_org.country     # needed for donor NGO listing
        return data
