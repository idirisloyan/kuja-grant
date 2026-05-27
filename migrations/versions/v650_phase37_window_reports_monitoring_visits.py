"""Phase 37 — MonitoringVisit table (window reports computed on demand).

Adds:
  - monitoring_visits  — in-person or virtual visit by secretariat/OB to
                         observe grant implementation. The third risk
                         pillar from NEAR's IKEA concept note (alongside
                         due diligence, regular reporting, and feedback
                         mechanisms). Includes community_feedback_summary
                         for the constituent-voice narrative thread.

Window reports themselves are computed on demand from existing data
(declarations + grants + signatures + visits) — no separate persisted
table needed. The PDF / CSV / ZIP bundle artefacts are streamed.

Revision ID: v650_phase37_window_reports_monitoring_visits
Revises: v640_phase36_emergency_declarations
Create Date: 2026-05-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "v650_phase37_window_reports_monitoring_visits"
down_revision = "v640_phase36_emergency_declarations"
branch_labels = None
depends_on = None


def _table_exists(inspector, table: str) -> bool:
    return table in inspector.get_table_names()


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)

    if not _table_exists(inspector, "monitoring_visits"):
        op.create_table(
            "monitoring_visits",
            sa.Column("id", sa.Integer(), primary_key=True),
            # Scope: a visit always pertains to a specific grant under
            # a specific declaration (so it rolls up neatly into the
            # window report).
            sa.Column("grant_id", sa.Integer(), nullable=False),
            sa.Column("declaration_id", sa.Integer(), nullable=True),
            # 'in_person' | 'virtual'
            sa.Column("visit_mode", sa.String(20), nullable=False, server_default="virtual"),
            sa.Column("visit_date", sa.Date(), nullable=False),
            sa.Column("visited_by_user_id", sa.Integer(), nullable=True),
            # Free-form narrative fields
            sa.Column("observations_md", sa.Text(), nullable=True),
            sa.Column("community_feedback_summary", sa.Text(), nullable=True),
            sa.Column("issues_identified", sa.Text(), nullable=True),
            sa.Column("action_items_md", sa.Text(), nullable=True),
            sa.Column("attendance_estimate", sa.Integer(), nullable=True),
            # Structured tags
            sa.Column("status", sa.String(40), nullable=False, server_default="recorded"),
            sa.Column("source_links_json", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["grant_id"], ["grants.id"]),
            sa.ForeignKeyConstraint(["declaration_id"], ["emergency_declarations.id"]),
            sa.ForeignKeyConstraint(["visited_by_user_id"], ["users.id"]),
        )
        op.create_index(
            "ix_monitoring_visits_grant",
            "monitoring_visits", ["grant_id"],
        )
        op.create_index(
            "ix_monitoring_visits_declaration",
            "monitoring_visits", ["declaration_id"],
        )


def downgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    if _table_exists(inspector, "monitoring_visits"):
        op.drop_table("monitoring_visits")
