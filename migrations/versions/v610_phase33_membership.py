"""Phase 33 — membership configuration + due-diligence refresh.

Adds:
  - networks.eligibility_questions_json        — per-network application questions
  - networks.required_documents_config_json    — per-network required doc types
  - networks.assessment_refresh_months         — periodic due-diligence cadence
  - network_memberships.eligibility_answers_json — applicant's answers
  - network_memberships.assessment_next_refresh_due_at — gates grant disbursement
  - network_memberships.cooldown_until         — reapply guard after rejection
  - documents.network_membership_id            — docs attached to a membership application

All additive, all nullable. No backfill needed since the only Network row
seeded so far is the default 'Kuja Marketplace' which carries no members yet.

Revision ID: v610_phase33_membership
Revises: v600_phase32_networks
Create Date: 2026-05-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "v610_phase33_membership"
down_revision = "v600_phase32_networks"
branch_labels = None
depends_on = None


def _has_column(inspector, table: str, col: str) -> bool:
    if table not in inspector.get_table_names():
        return False
    return col in {c["name"] for c in inspector.get_columns(table)}


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)

    # ── networks: config columns ────────────────────────────────
    if not _has_column(inspector, "networks", "eligibility_questions_json"):
        op.add_column(
            "networks",
            sa.Column("eligibility_questions_json", sa.Text(), nullable=True),
        )

    if not _has_column(inspector, "networks", "required_documents_config_json"):
        op.add_column(
            "networks",
            sa.Column("required_documents_config_json", sa.Text(), nullable=True),
        )

    if not _has_column(inspector, "networks", "assessment_refresh_months"):
        op.add_column(
            "networks",
            sa.Column(
                "assessment_refresh_months",
                sa.Integer(),
                nullable=False,
                server_default="24",
            ),
        )

    # ── network_memberships: applicant data + refresh tracking ──
    if not _has_column(inspector, "network_memberships", "eligibility_answers_json"):
        op.add_column(
            "network_memberships",
            sa.Column("eligibility_answers_json", sa.Text(), nullable=True),
        )

    if not _has_column(
        inspector, "network_memberships", "assessment_next_refresh_due_at"
    ):
        op.add_column(
            "network_memberships",
            sa.Column(
                "assessment_next_refresh_due_at", sa.DateTime(), nullable=True
            ),
        )

    if not _has_column(inspector, "network_memberships", "cooldown_until"):
        op.add_column(
            "network_memberships",
            sa.Column("cooldown_until", sa.DateTime(), nullable=True),
        )

    # ── documents: link to a membership application ─────────────
    # Polymorphic-style FK — Document already carries application_id +
    # assessment_id; we extend the same pattern.
    if not _has_column(inspector, "documents", "network_membership_id"):
        op.add_column(
            "documents",
            sa.Column("network_membership_id", sa.Integer(), nullable=True),
        )
        # Only add the FK constraint on backends that support it.
        # SQLite ignores ALTER TABLE ADD CONSTRAINT silently in Alembic
        # batch mode; Postgres needs explicit syntax.
        if bind.dialect.name == "postgresql":
            op.create_foreign_key(
                "fk_documents_network_membership_id",
                "documents",
                "network_memberships",
                ["network_membership_id"],
                ["id"],
            )
        op.create_index(
            "ix_documents_network_membership_id",
            "documents",
            ["network_membership_id"],
        )


def downgrade():
    bind = op.get_bind()
    inspector = inspect(bind)

    if _has_column(inspector, "documents", "network_membership_id"):
        try:
            op.drop_index(
                "ix_documents_network_membership_id", table_name="documents"
            )
        except Exception:
            pass
        if bind.dialect.name == "postgresql":
            try:
                op.drop_constraint(
                    "fk_documents_network_membership_id",
                    "documents",
                    type_="foreignkey",
                )
            except Exception:
                pass
        op.drop_column("documents", "network_membership_id")

    for col in (
        "cooldown_until",
        "assessment_next_refresh_due_at",
        "eligibility_answers_json",
    ):
        if _has_column(inspector, "network_memberships", col):
            op.drop_column("network_memberships", col)

    for col in (
        "assessment_refresh_months",
        "required_documents_config_json",
        "eligibility_questions_json",
    ):
        if _has_column(inspector, "networks", col):
            op.drop_column("networks", col)
