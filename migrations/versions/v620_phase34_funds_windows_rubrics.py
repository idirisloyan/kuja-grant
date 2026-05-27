"""Phase 34 — Funds + Windows + Evaluation Rubrics.

Adds:
  - funds                                 — top-level fund within a network
                                            (Change Fund, Bulsho Fund, CORE Fund, ...)
  - fund_windows                          — named window within a fund
                                            (Emergency Response, Displacement,
                                             Bridge Funding $25K, ...)
  - window_evaluation_rubrics             — rubric attached to a window
  - window_evaluation_criteria            — per-criterion rows (5-area rubric
                                            with hard-gate thresholds per
                                            NEAR's IKEA concept note)
  - grants.fund_window_id (nullable FK)   — optional link from a Grant to
                                            the window it was issued under

All additive, all nullable on existing tables. The Grant FK is nullable
so existing grants without a window keep working unchanged.

Revision ID: v620_phase34_funds_windows_rubrics
Revises: v610_phase33_membership
Create Date: 2026-05-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "v620_phase34_funds_windows_rubrics"
down_revision = "v610_phase33_membership"
branch_labels = None
depends_on = None


def _table_exists(inspector, table: str) -> bool:
    return table in inspector.get_table_names()


def _has_column(inspector, table: str, col: str) -> bool:
    if not _table_exists(inspector, table):
        return False
    return col in {c["name"] for c in inspector.get_columns(table)}


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)

    # ── funds ────────────────────────────────────────────────────
    if not _table_exists(inspector, "funds"):
        op.create_table(
            "funds",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("network_id", sa.Integer(), nullable=False),
            sa.Column("slug", sa.String(80), nullable=False),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("short_description", sa.String(500), nullable=True),
            sa.Column("currency", sa.String(10), nullable=False, server_default="USD"),
            sa.Column("total_pool_amount", sa.Numeric(14, 2), nullable=True),
            sa.Column("disbursed_to_date", sa.Numeric(14, 2), nullable=True),
            sa.Column("year_launched", sa.Integer(), nullable=True),
            # Governance: which Network-level OB role is required to sign
            # off on declarations under this fund. NEAR Change Fund =
            # 'oversight_body_member'; other funds may differ.
            sa.Column("oversight_role_key", sa.String(60), nullable=True),
            sa.Column("status", sa.String(40), nullable=False, server_default="active"),
            sa.Column("is_default_for_emergency", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["network_id"], ["networks.id"]),
            sa.UniqueConstraint(
                "network_id", "slug",
                name="uq_fund_slug_per_network",
            ),
        )
        op.create_index(
            "ix_funds_network_status",
            "funds", ["network_id", "status"],
        )

    # ── fund_windows ─────────────────────────────────────────────
    if not _table_exists(inspector, "fund_windows"):
        op.create_table(
            "fund_windows",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("fund_id", sa.Integer(), nullable=False),
            sa.Column("slug", sa.String(80), nullable=False),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("crisis_type", sa.String(80), nullable=True),
            # Money envelope. min_grant + max_grant let the OB enforce a
            # default size for the window without hard-coding (e.g. Bridge
            # Funding caps at $25k).
            sa.Column("min_grant_amount", sa.Numeric(14, 2), nullable=True),
            sa.Column("max_grant_amount", sa.Numeric(14, 2), nullable=True),
            sa.Column("default_grant_duration_months", sa.Integer(), nullable=True),
            # SLAs (72h application window / 6-day decision per IKEA concept note)
            sa.Column("application_window_hours", sa.Integer(), nullable=True),
            sa.Column("decision_sla_days", sa.Integer(), nullable=True),
            # Streamlined application template — list of question blocks.
            sa.Column("application_template_json", sa.Text(), nullable=True),
            sa.Column("expected_completion_minutes", sa.Integer(), nullable=True),
            # Direct-to-community ratio thresholds (NEAR: 80% single / 70% consortium)
            sa.Column("direct_to_community_single_min_pct", sa.Numeric(5, 2), nullable=True),
            sa.Column("direct_to_community_consortium_min_pct", sa.Numeric(5, 2), nullable=True),
            sa.Column("status", sa.String(40), nullable=False, server_default="open"),
            sa.Column("is_public", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["fund_id"], ["funds.id"]),
            sa.UniqueConstraint(
                "fund_id", "slug",
                name="uq_fund_window_slug_per_fund",
            ),
        )
        op.create_index(
            "ix_fund_windows_fund_status",
            "fund_windows", ["fund_id", "status"],
        )

    # ── window_evaluation_rubrics ────────────────────────────────
    if not _table_exists(inspector, "window_evaluation_rubrics"):
        op.create_table(
            "window_evaluation_rubrics",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("window_id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_by_user_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["window_id"], ["fund_windows.id"]),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        )
        op.create_index(
            "ix_window_rubrics_window",
            "window_evaluation_rubrics", ["window_id"],
        )

    # ── window_evaluation_criteria ───────────────────────────────
    if not _table_exists(inspector, "window_evaluation_criteria"):
        op.create_table(
            "window_evaluation_criteria",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("rubric_id", sa.Integer(), nullable=False),
            # NEAR's 5 areas: objectives_activities, region_population,
            # budget_financial, mel_reporting, ranking. Free-form string so
            # other networks can use their own taxonomy.
            sa.Column("area", sa.String(60), nullable=False),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("weight", sa.Numeric(6, 3), nullable=False, server_default="1.000"),
            # Threshold semantics:
            #   'hard_gate'  — application fails if criterion not met
            #   'soft_score' — scored 0-100, contributes to total
            sa.Column("threshold_kind", sa.String(20), nullable=False, server_default="soft_score"),
            # Numeric threshold value for hard gates (e.g. 0.80 = 80%).
            sa.Column("threshold_value", sa.Numeric(6, 3), nullable=True),
            sa.Column("threshold_meaning", sa.Text(), nullable=True),
            # Which AI evaluator function applies to this criterion. Filled
            # in Phase 38 when the rubric scorer ships; nullable for now.
            sa.Column("ai_evaluator_key", sa.String(80), nullable=True),
            sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["rubric_id"], ["window_evaluation_rubrics.id"]),
        )
        op.create_index(
            "ix_window_criteria_rubric_area",
            "window_evaluation_criteria", ["rubric_id", "area"],
        )

    # ── grants.fund_window_id ────────────────────────────────────
    if _table_exists(inspector, "grants") and not _has_column(
        inspector, "grants", "fund_window_id"
    ):
        op.add_column(
            "grants",
            sa.Column("fund_window_id", sa.Integer(), nullable=True),
        )
        if bind.dialect.name == "postgresql":
            op.create_foreign_key(
                "fk_grants_fund_window_id",
                "grants",
                "fund_windows",
                ["fund_window_id"],
                ["id"],
            )
        op.create_index(
            "ix_grants_fund_window_id",
            "grants", ["fund_window_id"],
        )


def downgrade():
    bind = op.get_bind()
    inspector = inspect(bind)

    if _has_column(inspector, "grants", "fund_window_id"):
        try:
            op.drop_index("ix_grants_fund_window_id", table_name="grants")
        except Exception:
            pass
        if bind.dialect.name == "postgresql":
            try:
                op.drop_constraint(
                    "fk_grants_fund_window_id", "grants", type_="foreignkey",
                )
            except Exception:
                pass
        op.drop_column("grants", "fund_window_id")

    for table in (
        "window_evaluation_criteria",
        "window_evaluation_rubrics",
        "fund_windows",
        "funds",
    ):
        if _table_exists(inspector, table):
            op.drop_table(table)
