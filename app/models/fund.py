"""Fund + FundWindow + EvaluationRubric + EvaluationCriterion models.

Phase 34 (May 2026).

Models the NEAR-style funding structure:

    Network (Phase 32)
        └── Fund (Change Fund, Bulsho Fund, CORE Fund, PULSE)
                └── FundWindow (Emergency Response, Displacement,
                                Bridge Funding $25K)
                        └── WindowEvaluationRubric
                                └── WindowEvaluationCriterion (5-area)

The rubric is what the OB evaluates each application against, the
window owns its own minimal application template, and the fund holds
the money envelope + governance defaults.

Phase 35 adds Crisis Monitoring; Phase 36 wires this all into the
emergency-declaration workflow.
"""

from datetime import datetime, timezone

from app.extensions import db
from app.utils.helpers import _json_load, _json_dump


# Vocabulary -----------------------------------------------------

FUND_STATUSES = (
    "active",      # currently funding
    "paused",      # accepting no new windows; closing out existing
    "closed",      # all windows closed; fund archived
)

WINDOW_STATUSES = (
    "draft",            # in setup; not visible publicly
    "open",             # public; accepting applications
    "applications_closed",  # closed for review
    "decided",          # OB decided; grants in motion
    "closed",           # all grants complete
)

# Five evaluation areas, per NEAR's IKEA concept note.
EVALUATION_AREAS = (
    "objectives_activities",  # 1. Project Objectives & Activities
    "region_population",      # 2. Region & Target Population
    "budget_financial",       # 3. Budget & Financial Considerations
    "mel_reporting",          # 4. MEL & Reporting
    "ranking",                # 5. General / relative-strength ranking
)

THRESHOLD_KINDS = ("hard_gate", "soft_score")


# ===============================================================
# Fund
# ===============================================================

class Fund(db.Model):
    """Top-level fund within a network (Change Fund, Bulsho Fund, ...)."""

    __tablename__ = "funds"
    __table_args__ = (
        db.UniqueConstraint(
            "network_id", "slug",
            name="uq_fund_slug_per_network",
        ),
        db.Index("ix_funds_network_status", "network_id", "status"),
    )

    id = db.Column(db.Integer, primary_key=True)
    network_id = db.Column(db.Integer, db.ForeignKey("networks.id"), nullable=False)
    slug = db.Column(db.String(80), nullable=False)
    name = db.Column(db.String(200), nullable=False)
    short_description = db.Column(db.String(500), nullable=True)

    currency = db.Column(db.String(10), nullable=False, default="USD")
    total_pool_amount = db.Column(db.Numeric(14, 2), nullable=True)
    disbursed_to_date = db.Column(db.Numeric(14, 2), nullable=True)
    year_launched = db.Column(db.Integer, nullable=True)

    oversight_role_key = db.Column(db.String(60), nullable=True)
    status = db.Column(db.String(40), nullable=False, default="active")
    is_default_for_emergency = db.Column(db.Boolean, nullable=False, default=False)

    created_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    windows = db.relationship(
        "FundWindow",
        backref="fund",
        order_by="FundWindow.created_at.desc()",
        cascade="all, delete-orphan",
    )

    def to_dict(self, *, include_windows: bool = False) -> dict:
        d = {
            "id": self.id,
            "network_id": self.network_id,
            "slug": self.slug,
            "name": self.name,
            "short_description": self.short_description,
            "currency": self.currency,
            "total_pool_amount": float(self.total_pool_amount) if self.total_pool_amount is not None else None,
            "disbursed_to_date": float(self.disbursed_to_date) if self.disbursed_to_date is not None else None,
            "year_launched": self.year_launched,
            "oversight_role_key": self.oversight_role_key,
            "status": self.status,
            "is_default_for_emergency": self.is_default_for_emergency,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "window_count": len(self.windows) if self.windows is not None else 0,
        }
        if include_windows:
            d["windows"] = [w.to_dict() for w in self.windows]
        return d


# ===============================================================
# FundWindow
# ===============================================================

class FundWindow(db.Model):
    """Named window within a fund (Emergency Response, Bridge Funding, ...)."""

    __tablename__ = "fund_windows"
    __table_args__ = (
        db.UniqueConstraint(
            "fund_id", "slug",
            name="uq_fund_window_slug_per_fund",
        ),
        db.Index("ix_fund_windows_fund_status", "fund_id", "status"),
    )

    id = db.Column(db.Integer, primary_key=True)
    fund_id = db.Column(db.Integer, db.ForeignKey("funds.id"), nullable=False)
    slug = db.Column(db.String(80), nullable=False)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    crisis_type = db.Column(db.String(80), nullable=True)

    min_grant_amount = db.Column(db.Numeric(14, 2), nullable=True)
    max_grant_amount = db.Column(db.Numeric(14, 2), nullable=True)
    default_grant_duration_months = db.Column(db.Integer, nullable=True)

    application_window_hours = db.Column(db.Integer, nullable=True)
    decision_sla_days = db.Column(db.Integer, nullable=True)

    application_template_json = db.Column(db.Text, nullable=True)
    expected_completion_minutes = db.Column(db.Integer, nullable=True)

    direct_to_community_single_min_pct = db.Column(db.Numeric(5, 2), nullable=True)
    direct_to_community_consortium_min_pct = db.Column(db.Numeric(5, 2), nullable=True)

    status = db.Column(db.String(40), nullable=False, default="open")
    is_public = db.Column(db.Boolean, nullable=False, default=True)

    created_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    rubrics = db.relationship(
        "WindowEvaluationRubric",
        backref="window",
        order_by="WindowEvaluationRubric.created_at.desc()",
        cascade="all, delete-orphan",
    )

    def get_application_template(self) -> list[dict]:
        val = _json_load(self.application_template_json)
        return val if isinstance(val, list) else []

    def set_application_template(self, value) -> None:
        self.application_template_json = _json_dump(value or [])

    def default_rubric(self):
        return next((r for r in self.rubrics if r.is_default), None) or (
            self.rubrics[0] if self.rubrics else None
        )

    def to_dict(self, *, include_rubric: bool = False) -> dict:
        d = {
            "id": self.id,
            "fund_id": self.fund_id,
            "slug": self.slug,
            "name": self.name,
            "description": self.description,
            "crisis_type": self.crisis_type,
            "min_grant_amount": float(self.min_grant_amount) if self.min_grant_amount is not None else None,
            "max_grant_amount": float(self.max_grant_amount) if self.max_grant_amount is not None else None,
            "default_grant_duration_months": self.default_grant_duration_months,
            "application_window_hours": self.application_window_hours,
            "decision_sla_days": self.decision_sla_days,
            "expected_completion_minutes": self.expected_completion_minutes,
            "direct_to_community_single_min_pct": (
                float(self.direct_to_community_single_min_pct)
                if self.direct_to_community_single_min_pct is not None else None
            ),
            "direct_to_community_consortium_min_pct": (
                float(self.direct_to_community_consortium_min_pct)
                if self.direct_to_community_consortium_min_pct is not None else None
            ),
            "status": self.status,
            "is_public": self.is_public,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "application_template": self.get_application_template(),
        }
        if include_rubric:
            r = self.default_rubric()
            d["default_rubric"] = r.to_dict(include_criteria=True) if r else None
        return d


# ===============================================================
# WindowEvaluationRubric
# ===============================================================

class WindowEvaluationRubric(db.Model):
    """A rubric attached to a window. Multiple allowed; one default."""

    __tablename__ = "window_evaluation_rubrics"
    __table_args__ = (
        db.Index("ix_window_rubrics_window", "window_id"),
    )

    id = db.Column(db.Integer, primary_key=True)
    window_id = db.Column(
        db.Integer, db.ForeignKey("fund_windows.id"), nullable=False,
    )
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    is_default = db.Column(db.Boolean, nullable=False, default=True)
    created_by_user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True,
    )

    created_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    criteria = db.relationship(
        "WindowEvaluationCriterion",
        backref="rubric",
        order_by="WindowEvaluationCriterion.display_order.asc()",
        cascade="all, delete-orphan",
    )

    def to_dict(self, *, include_criteria: bool = False) -> dict:
        d = {
            "id": self.id,
            "window_id": self.window_id,
            "name": self.name,
            "description": self.description,
            "is_default": self.is_default,
            "created_by_user_id": self.created_by_user_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "criterion_count": len(self.criteria) if self.criteria is not None else 0,
        }
        if include_criteria:
            d["criteria"] = [c.to_dict() for c in self.criteria]
        return d

    # --- Seed: NEAR Change Fund 5-area default rubric -----------
    # When an admin creates a Change Fund-style window, this seeds the
    # exact rubric from NEAR's IKEA concept note. Use as:
    #
    #     r = WindowEvaluationRubric.seed_change_fund_default(window_id, user_id)
    #
    # Returns the new rubric with criteria attached.
    @classmethod
    def seed_change_fund_default(cls, window_id: int, by_user_id: int | None = None):
        rubric = cls(
            window_id=window_id,
            name="NEAR Change Fund — Standard Rubric",
            description=(
                "Five-area rubric per NEAR's published criteria. Direct-to-"
                "community thresholds are HARD gates (80% single applicant, "
                "70% consortium); other criteria are scored 0-100."
            ),
            is_default=True,
            created_by_user_id=by_user_id,
        )
        db.session.add(rubric)
        db.session.flush()  # need rubric.id

        seeded = [
            # Area 1 — objectives & activities
            ("objectives_activities", 1, "Alignment with Crisis Monitoring Report",
             "Does the proposal directly address the crisis identified in the OB's monitoring report?",
             "soft_score", None, "Higher score for tight alignment + cited evidence."),
            ("objectives_activities", 2, "Budget-activity coherence",
             "Are the proposed activities adequately budgeted and appropriately scoped?",
             "soft_score", None, None),
            ("objectives_activities", 3, "Sectoral response consistency",
             "Is the sectoral response (health, WASH, food security, etc.) consistent with the crisis profile?",
             "soft_score", None, None),

            # Area 2 — region & target population
            ("region_population", 4, "Operational presence in affected area",
             "Does the applicant have active operations in the specific affected region?",
             "hard_gate", 1.000, "Must demonstrate field presence (staff, partners, prior projects)."),
            ("region_population", 5, "Per-beneficiary cost reasonableness",
             "Total budget ÷ beneficiary count vs. peer applications + network historical average.",
             "soft_score", None, "Flagged if >2× peer median or <0.5× median (both suggest miscalc)."),
            ("region_population", 6, "Beneficiary clarity in budget",
             "Are beneficiaries clearly enumerated and tied to specific budget lines?",
             "soft_score", None, None),

            # Area 3 — budget & financial
            ("budget_financial", 7, "Prior funding managed at this scale",
             "Has the member previously managed grants of this size (audited statement review)?",
             "soft_score", None, None),
            ("budget_financial", 8, "Direct-to-community ratio (single applicant)",
             "≥80% of direct cost budget reaches affected communities directly.",
             "hard_gate", 0.800,
             "Single-applicant hard gate. Operational overhead + indirect costs ≤20%."),
            ("budget_financial", 9, "Direct-to-community ratio (consortium)",
             "≥70% of direct cost budget reaches affected communities when applicant is a consortium.",
             "hard_gate", 0.700,
             "Consortium hard gate. Only applies when applicant submits as a consortium."),
            ("budget_financial", 10, "Budget-narrative consistency",
             "Does the budget match the proposal narrative? No phantom line items, no narrative-only activities.",
             "soft_score", None, None),
            ("budget_financial", 11, "Unit cost reasonableness",
             "Are unit costs (per beneficiary, per output) within allowable + reasonable bands?",
             "soft_score", None, None),
            ("budget_financial", 12, "Required template used",
             "Did the applicant use NEAR's required budget + narrative template?",
             "hard_gate", 1.000, None),
            ("budget_financial", 13, "All activities reflected in budget",
             "Every activity in the narrative has a corresponding budget line.",
             "soft_score", None, None),

            # Area 4 — MEL & reporting
            ("mel_reporting", 14, "MEL plan sufficiency",
             "Is the MEL plan robust enough for the proposed activity level?",
             "soft_score", None, None),
            ("mel_reporting", 15, "MEL budget adequacy",
             "Is MEL adequately budgeted (typically 3-7% of total)?",
             "soft_score", None, None),

            # Area 5 — ranking (only applied when multiple applications compete)
            ("ranking", 16, "Relative strength vs. peers",
             "When applications must be ranked for limited funds: relative strength + impact.",
             "soft_score", None,
             "Comparative scoring across the cohort; not absolute."),
        ]

        for (area, order, name, desc, kind, threshold, meaning) in seeded:
            c = WindowEvaluationCriterion(
                rubric_id=rubric.id,
                area=area,
                name=name,
                description=desc,
                weight=1.000,
                threshold_kind=kind,
                threshold_value=threshold,
                threshold_meaning=meaning,
                display_order=order,
            )
            db.session.add(c)
        db.session.flush()
        return rubric


# ===============================================================
# WindowEvaluationCriterion
# ===============================================================

class WindowEvaluationCriterion(db.Model):
    """A single criterion within a rubric. Hard-gate or soft-score."""

    __tablename__ = "window_evaluation_criteria"
    __table_args__ = (
        db.Index("ix_window_criteria_rubric_area", "rubric_id", "area"),
    )

    id = db.Column(db.Integer, primary_key=True)
    rubric_id = db.Column(
        db.Integer, db.ForeignKey("window_evaluation_rubrics.id"),
        nullable=False,
    )
    area = db.Column(db.String(60), nullable=False)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    weight = db.Column(db.Numeric(6, 3), nullable=False, default=1.0)
    threshold_kind = db.Column(db.String(20), nullable=False, default="soft_score")
    threshold_value = db.Column(db.Numeric(6, 3), nullable=True)
    threshold_meaning = db.Column(db.Text, nullable=True)
    ai_evaluator_key = db.Column(db.String(80), nullable=True)
    display_order = db.Column(db.Integer, nullable=False, default=0)

    created_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "rubric_id": self.rubric_id,
            "area": self.area,
            "name": self.name,
            "description": self.description,
            "weight": float(self.weight) if self.weight is not None else 1.0,
            "threshold_kind": self.threshold_kind,
            "threshold_value": (
                float(self.threshold_value) if self.threshold_value is not None else None
            ),
            "threshold_meaning": self.threshold_meaning,
            "ai_evaluator_key": self.ai_evaluator_key,
            "display_order": self.display_order,
        }
