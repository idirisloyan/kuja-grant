"""Phase 40 — Application AI rubric persistence + budget for hard gate.

Adds two JSON columns to `applications`:

  - ai_rubric_result_json — full breakdown from the Phase 38 rubric
    scorer (per-criterion scores + rationale). Auto-populated when an
    NGO submits an application on a network grant (grant.fund_window_id
    set). Used by the operator console to show WHY the AI scored as it
    did.
  - budget_lines_json — structured budget the applicant declared.
    Shape: [{"item": str, "amount": float}, ...]. Used by the
    Phase 38 direct-to-community classifier and, at /submit time, by
    the hard-gate enforcement: applications on a network grant must
    meet the window's direct-to-community threshold (80% single-org
    default, 70% consortium default) to land in 'submitted' status.

Both columns are nullable — legacy Kuja Marketplace applications never
populate them. Idempotent: skips columns that already exist (the
bootstrap in app/__init__.py adds them for local SQLite; this migration
handles Postgres production deploys).

Revision ID: v660_phase40_app_rubric_budget
Revises: v650_phase37_window_reports_monitoring_visits
Create Date: 2026-05-28
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "v660_phase40_app_rubric_budget"
down_revision = "v650_phase37_window_reports_monitoring_visits"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("applications")}

    if "ai_rubric_result_json" not in cols:
        op.add_column("applications", sa.Column("ai_rubric_result_json", sa.Text(), nullable=True))
    if "budget_lines_json" not in cols:
        op.add_column("applications", sa.Column("budget_lines_json", sa.Text(), nullable=True))


def downgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("applications")}

    if "budget_lines_json" in cols:
        op.drop_column("applications", "budget_lines_json")
    if "ai_rubric_result_json" in cols:
        op.drop_column("applications", "ai_rubric_result_json")
