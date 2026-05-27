"""Phase 32 — multi-tenant foundation.

Adds:
  - networks table (top-level tenant)
  - network_memberships table (Org ↔ Network with status + tier)

Seeds:
  - Default 'kuja' Network row representing the Kuja Marketplace.
    Subsequent migrations that backfill network_id on existing tables
    use this row's id.

No FK additions to existing tables in this migration — keeping it
purely additive so backwards compatibility is total. Phase 32B will
add nullable network_id columns to Organization/Grant/Application/etc
once Phase 32 is live and stable in prod.

Revision ID: v600_phase32_networks
Revises: v500_kuja_studio
Create Date: 2026-05-19
"""
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "v600_phase32_networks"
down_revision = "v500_kuja_studio"
branch_labels = None
depends_on = None


def _table_exists(inspector, table: str) -> bool:
    return table in inspector.get_table_names()


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)

    # ── networks ──────────────────────────────────────────────────
    if not _table_exists(inspector, "networks"):
        op.create_table(
            "networks",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("slug", sa.String(60), nullable=False, unique=True),
            sa.Column("name", sa.String(160), nullable=False),
            sa.Column("mission_short", sa.String(500), nullable=True),
            sa.Column("brand_logo_url", sa.String(500), nullable=True),
            sa.Column("brand_color_hex", sa.String(7), nullable=True),
            sa.Column("default_language", sa.String(10), nullable=False,
                      server_default="en"),
            sa.Column("home_url", sa.String(500), nullable=True),
            sa.Column("host_aliases", sa.Text(), nullable=True),
            sa.Column("oversight_body_min_signers", sa.Integer(),
                      nullable=False, server_default="2"),
            sa.Column("membership_review_days", sa.Integer(),
                      nullable=False, server_default="60"),
            sa.Column("default_assessment_framework", sa.String(40),
                      nullable=True),
            sa.Column("assessment_framework_display", sa.String(80),
                      nullable=True),
            sa.Column("default_currency", sa.String(10), nullable=False,
                      server_default="USD"),
            sa.Column("features", sa.Text(), nullable=True),
            sa.Column("is_default", sa.Boolean(), nullable=False,
                      server_default=sa.text("0")),
            sa.Column("is_active", sa.Boolean(), nullable=False,
                      server_default=sa.text("1")),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index(
            "ix_networks_slug", "networks", ["slug"], unique=True,
        )

    # ── network_memberships ──────────────────────────────────────
    if not _table_exists(inspector, "network_memberships"):
        op.create_table(
            "network_memberships",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("network_id", sa.Integer(), nullable=False),
            sa.Column("org_id", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(40), nullable=False,
                      server_default="pending"),
            sa.Column("status_reason", sa.String(500), nullable=True),
            sa.Column("member_tier", sa.String(40), nullable=False,
                      server_default="member"),
            sa.Column("parent_membership_id", sa.Integer(), nullable=True),
            sa.Column("region", sa.String(80), nullable=True),
            sa.Column("country", sa.String(80), nullable=True),
            sa.Column("required_documents_status", sa.Text(), nullable=True),
            sa.Column("capacity_assessment_id", sa.Integer(), nullable=True),
            sa.Column("applied_at", sa.DateTime(), nullable=True),
            sa.Column("reviewed_at", sa.DateTime(), nullable=True),
            sa.Column("reviewed_by_user_id", sa.Integer(), nullable=True),
            sa.Column("joined_at", sa.DateTime(), nullable=True),
            sa.Column("suspended_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["network_id"], ["networks.id"]),
            sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
            sa.ForeignKeyConstraint(
                ["parent_membership_id"], ["network_memberships.id"],
            ),
            sa.ForeignKeyConstraint(
                ["capacity_assessment_id"], ["assessments.id"],
            ),
            sa.ForeignKeyConstraint(["reviewed_by_user_id"], ["users.id"]),
            sa.UniqueConstraint(
                "network_id", "org_id",
                name="uq_network_membership_org_per_network",
            ),
        )
        op.create_index(
            "ix_network_memberships_network_status",
            "network_memberships",
            ["network_id", "status"],
        )
        op.create_index(
            "ix_network_memberships_org_id",
            "network_memberships",
            ["org_id"],
        )

    # ── seed default Kuja Marketplace network ────────────────────
    # NB: use :is_default / :is_active parameter binds rather than `1`/`0`
    # literals so this works on Postgres (strict boolean typing) as well
    # as SQLite (which would auto-coerce). Same for the SELECT 1 in the
    # WHERE NOT EXISTS — that's an integer-context literal, fine in both.
    now = datetime.now(timezone.utc)
    bind.execute(
        sa.text(
            """
            INSERT INTO networks
                (slug, name, mission_short, brand_color_hex,
                 default_language, home_url, host_aliases,
                 oversight_body_min_signers, membership_review_days,
                 default_assessment_framework,
                 assessment_framework_display,
                 default_currency, features,
                 is_default, is_active,
                 created_at, updated_at)
            SELECT 'kuja',
                   'Kuja Marketplace',
                   'AI-powered grant management for the Global South.',
                   '#C2410C',
                   'en',
                   'https://kuja.org',
                   '[]',
                   2,
                   60,
                   'kuja',
                   'Kuja Capacity Assessment',
                   'USD',
                   '{}',
                   :is_default,
                   :is_active,
                   :now,
                   :now
            WHERE NOT EXISTS (SELECT 1 FROM networks WHERE slug = 'kuja')
            """
        ),
        {"now": now, "is_default": True, "is_active": True},
    )


def downgrade():
    bind = op.get_bind()
    inspector = inspect(bind)

    if _table_exists(inspector, "network_memberships"):
        op.drop_table("network_memberships")
    if _table_exists(inspector, "networks"):
        op.drop_index("ix_networks_slug", table_name="networks")
        op.drop_table("networks")
