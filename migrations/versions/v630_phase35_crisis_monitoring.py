"""Phase 35 — Crisis Monitoring Report.

Adds:
  - crisis_monitoring_reports     — weekly per-network report
  - crisis_monitoring_rows        — per-country / per-event rows scored
                                    with NEAR's 4-factor formula
  - crisis_signals                — member-submitted ad-hoc crisis alerts
                                    that get rolled into the next report

The 4-factor formula tracked on each row:
  1. country HDI band ('low_hdi' / 'medium_hdi' / 'high_hdi')
  2. government response capacity band ('low' / 'medium' / 'high')
  3. people directly impacted (numeric estimate)
  4. media + donor attention band ('low' / 'medium' / 'high')
plus a composite_score (0-100) and AI-drafted narrative.

Revision ID: v630_phase35_crisis_monitoring
Revises: v620_phase34_funds_windows_rubrics
Create Date: 2026-05-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "v630_phase35_crisis_monitoring"
down_revision = "v620_phase34_funds_windows_rubrics"
branch_labels = None
depends_on = None


def _table_exists(inspector, table: str) -> bool:
    return table in inspector.get_table_names()


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)

    # ── crisis_monitoring_reports ────────────────────────────────
    if not _table_exists(inspector, "crisis_monitoring_reports"):
        op.create_table(
            "crisis_monitoring_reports",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("network_id", sa.Integer(), nullable=False),
            sa.Column("period_start", sa.Date(), nullable=False),
            sa.Column("period_end", sa.Date(), nullable=False),
            sa.Column("summary_md", sa.Text(), nullable=True),
            sa.Column("generated_by", sa.String(20), nullable=False, server_default="manual"),
            sa.Column("status", sa.String(40), nullable=False, server_default="draft"),
            sa.Column("cron_anchor_audit_id", sa.Integer(), nullable=True),
            sa.Column("published_at", sa.DateTime(), nullable=True),
            sa.Column("published_by_user_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["network_id"], ["networks.id"]),
            sa.ForeignKeyConstraint(["published_by_user_id"], ["users.id"]),
        )
        op.create_index(
            "ix_crisis_reports_network_period",
            "crisis_monitoring_reports",
            ["network_id", "period_start"],
        )
        op.create_index(
            "ix_crisis_reports_network_status",
            "crisis_monitoring_reports",
            ["network_id", "status"],
        )

    # ── crisis_monitoring_rows ───────────────────────────────────
    if not _table_exists(inspector, "crisis_monitoring_rows"):
        op.create_table(
            "crisis_monitoring_rows",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("report_id", sa.Integer(), nullable=False),
            # ISO 3166 alpha-3 country code (e.g. 'KEN', 'SOM')
            sa.Column("country", sa.String(3), nullable=False),
            sa.Column("region", sa.String(80), nullable=True),
            # Free-form event tag: 'flood', 'conflict', 'epidemic', etc.
            sa.Column("event_type", sa.String(80), nullable=True),
            sa.Column("event_title", sa.String(200), nullable=True),
            # NEAR's 4-factor formula inputs
            sa.Column("hdi_band", sa.String(20), nullable=True),
            sa.Column("gov_capacity_band", sa.String(20), nullable=True),
            sa.Column("people_impacted_estimate", sa.Integer(), nullable=True),
            sa.Column("attention_band", sa.String(20), nullable=True),
            # Output: composite score (0-100). Higher = more urgent.
            sa.Column("composite_score", sa.Numeric(6, 2), nullable=True),
            sa.Column("narrative", sa.Text(), nullable=True),
            # OB shortlist flag — secretariat marks the highest-priority
            # rows so the OB can scan a focused list.
            sa.Column("flagged_for_ob", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("source_links_json", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["report_id"], ["crisis_monitoring_reports.id"]),
        )
        op.create_index(
            "ix_crisis_rows_report_score",
            "crisis_monitoring_rows",
            ["report_id", "composite_score"],
        )
        op.create_index(
            "ix_crisis_rows_country",
            "crisis_monitoring_rows",
            ["country"],
        )

    # ── crisis_signals ───────────────────────────────────────────
    if not _table_exists(inspector, "crisis_signals"):
        op.create_table(
            "crisis_signals",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("network_id", sa.Integer(), nullable=False),
            sa.Column("submitted_by_org_id", sa.Integer(), nullable=True),
            sa.Column("submitted_by_user_id", sa.Integer(), nullable=True),
            sa.Column("country", sa.String(3), nullable=False),
            sa.Column("event_type", sa.String(80), nullable=True),
            sa.Column("description", sa.Text(), nullable=False),
            sa.Column("status", sa.String(40), nullable=False, server_default="pending"),
            sa.Column("rolled_into_report_id", sa.Integer(), nullable=True),
            sa.Column("submitted_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["network_id"], ["networks.id"]),
            sa.ForeignKeyConstraint(["submitted_by_org_id"], ["organizations.id"]),
            sa.ForeignKeyConstraint(["submitted_by_user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["rolled_into_report_id"], ["crisis_monitoring_reports.id"]),
        )
        op.create_index(
            "ix_crisis_signals_network_status",
            "crisis_signals",
            ["network_id", "status"],
        )


def downgrade():
    bind = op.get_bind()
    inspector = inspect(bind)

    for table in (
        "crisis_signals",
        "crisis_monitoring_rows",
        "crisis_monitoring_reports",
    ):
        if _table_exists(inspector, table):
            op.drop_table(table)
