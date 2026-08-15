"""Application model - Grant applications submitted by NGOs."""

from datetime import datetime, timezone

from app.extensions import db
from app.utils.helpers import _json_load, _json_dump, iso_utc


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
    # NOTE ON SCORE SEMANTICS (the three signals the platform keeps distinct):
    #   ai_score     — the DETERMINISTIC auto-score. Despite the legacy column
    #                  name, this is NOT an LLM judgement: it is written at
    #                  /submit by ScoringEngine.score_application (a fast,
    #                  offline heuristic over completeness / keyword coverage /
    #                  eligibility). Exposed in the API under the clearer name
    #                  `auto_score` (see to_dict + the auto_score property).
    #                  The separate, genuine LLM per-criterion scoring lives in
    #                  /api/ai/score-criterion|score-application and is advisory.
    #   human_score  — the AUTHORITATIVE signal: mean of completed reviewers'
    #                  weighted overall_scores.
    #   final_score  — blended 0.4*auto + 0.6*human once human review lands
    #                  (falls back to auto alone before any review completes).
    ai_score = db.Column(db.Float, nullable=True)
    human_score = db.Column(db.Float, nullable=True)
    final_score = db.Column(db.Float, nullable=True)
    submitted_at = db.Column(db.DateTime, nullable=True)
    # Phase 145 — NGO-initiated withdrawal before review starts.
    withdrawn_at = db.Column(db.DateTime, nullable=True)
    withdrawal_reason = db.Column(db.Text, nullable=True)
    # Phase 209 — donor/reviewer-side shortlist flag. Single bool on the
    # application row (not per-user) — a grant is owned by one donor +
    # the small reviewer pool, so they share the shortlist.
    is_starred = db.Column(db.Boolean, default=False, nullable=False)
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
    # Phase 285 — stamped the first time the NGO views their decision /
    # win-loss feedback after the donor records it. Lets the donor see
    # "applicant viewed feedback at X" so they can judge whether to
    # follow up personally.
    applicant_viewed_feedback_at = db.Column(db.DateTime, nullable=True)
    # Phase 290 — donor initiates follow-up outreach on a declined app.
    # Stamped by POST /api/applications/<id>/donor-outreach.
    outreach_initiated_at = db.Column(db.DateTime, nullable=True)
    outreach_initiated_by_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    # Phase 296 — optional templated message the donor leaves for the
    # applicant when initiating outreach. Surfaced inline in the NGO view.
    outreach_message_text = db.Column(db.Text, nullable=True)
    # Phase 302 — NGO appeal flow. On a declined/rejected app the NGO can
    # request a re-review; admin + donor see it as a follow-up obligation.
    appeal_requested_at = db.Column(db.DateTime, nullable=True)
    appeal_reason_text = db.Column(db.Text, nullable=True)
    # Phase 308 — donor resolves the appeal: 'approved' reopens to
    # under_review; 'declined' just closes the loop with a reason.
    appeal_resolved_at = db.Column(db.DateTime, nullable=True)
    appeal_resolution = db.Column(db.String(20), nullable=True)  # 'approved' | 'declined'
    appeal_resolution_text = db.Column(db.Text, nullable=True)
    appeal_resolved_by_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

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

    # --- Score semantics ---
    @property
    def auto_score(self):
        """Clear alias for the deterministic auto-score stored in the
        legacy-named ``ai_score`` column. Prefer this name in new code and
        surfaces so the three signals (auto / human / final) read plainly.
        Read-only: writes still go to ``ai_score`` on the /submit path."""
        return self.ai_score

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
            'ai_score': self.ai_score,        # legacy name (deterministic auto-score)
            'auto_score': self.ai_score,      # clear alias — same value, plain name
            'human_score': self.human_score,  # authoritative: mean of reviewer scores
            'final_score': self.final_score,  # blended 0.4*auto + 0.6*human
            'submitted_at': iso_utc(self.submitted_at),
            'created_at': iso_utc(self.created_at),
            'updated_at': iso_utc(self.updated_at),
            'decision_reason_code': self.decision_reason_code,
            'decision_notes': self.decision_notes,
            'decision_recorded_at': iso_utc(self.decision_recorded_at),
            'decision_recorded_by_user_id': self.decision_recorded_by_user_id,
            'applicant_viewed_feedback_at': iso_utc(self.applicant_viewed_feedback_at),
            'outreach_initiated_at': iso_utc(self.outreach_initiated_at),
            'outreach_initiated_by_user_id': self.outreach_initiated_by_user_id,
            'outreach_message_text': self.outreach_message_text,
            'appeal_requested_at': iso_utc(self.appeal_requested_at),
            'appeal_reason_text': self.appeal_reason_text,
            'appeal_resolved_at': iso_utc(self.appeal_resolved_at),
            'appeal_resolution': self.appeal_resolution,
            'appeal_resolution_text': self.appeal_resolution_text,
            'appeal_resolved_by_user_id': self.appeal_resolved_by_user_id,
            'is_starred': bool(self.is_starred),
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
