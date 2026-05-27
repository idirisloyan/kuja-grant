"""Phase 36 — Emergency Declaration multi-signature workflow.

Adds:
  - emergency_declarations         — the declaration itself
  - declaration_signatures         — per-signer state (with COI fields)
  - declaration_documents          — supporting docs attached

Each declaration MUST link to a published CrisisMonitoringRow (Phase 35)
as evidence — the FK is nullable in the schema (so historic test data
doesn't break) but is enforced at the route layer.

Revision ID: v640_phase36_emergency_declarations
Revises: v630_phase35_crisis_monitoring
Create Date: 2026-05-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "v640_phase36_emergency_declarations"
down_revision = "v630_phase35_crisis_monitoring"
branch_labels = None
depends_on = None


def _table_exists(inspector, table: str) -> bool:
    return table in inspector.get_table_names()


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)

    # ── emergency_declarations ───────────────────────────────────
    if not _table_exists(inspector, "emergency_declarations"):
        op.create_table(
            "emergency_declarations",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("network_id", sa.Integer(), nullable=False),
            sa.Column("fund_id", sa.Integer(), nullable=False),
            sa.Column("window_id", sa.Integer(), nullable=False),
            # Evidence anchor: the published Crisis Monitoring row that
            # justifies the declaration. Enforced at the route layer.
            sa.Column("evidence_row_id", sa.Integer(), nullable=True),
            sa.Column("evidence_report_id", sa.Integer(), nullable=True),

            sa.Column("title", sa.String(300), nullable=False),
            sa.Column("crisis_type", sa.String(80), nullable=True),
            sa.Column("region", sa.String(120), nullable=True),
            sa.Column("country", sa.String(3), nullable=True),  # ISO alpha-3
            sa.Column("severity", sa.String(40), nullable=True),
            sa.Column("summary_md", sa.Text(), nullable=True),
            sa.Column("proposed_total_amount", sa.Numeric(14, 2), nullable=True),
            sa.Column("shortlisted_org_ids_json", sa.Text(), nullable=True),

            # State machine
            sa.Column("status", sa.String(40), nullable=False, server_default="draft"),
            sa.Column("status_reason", sa.String(500), nullable=True),

            # SLA milestones (per NEAR's 72hr / 6-day commitment)
            sa.Column("declared_at", sa.DateTime(), nullable=True),
            sa.Column("applications_open_at", sa.DateTime(), nullable=True),
            sa.Column("applications_close_at", sa.DateTime(), nullable=True),
            sa.Column("decision_at", sa.DateTime(), nullable=True),
            sa.Column("applicants_notified_at", sa.DateTime(), nullable=True),

            sa.Column("signed_active_audit_id", sa.Integer(), nullable=True),

            sa.Column("created_by_user_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),

            sa.ForeignKeyConstraint(["network_id"], ["networks.id"]),
            sa.ForeignKeyConstraint(["fund_id"], ["funds.id"]),
            sa.ForeignKeyConstraint(["window_id"], ["fund_windows.id"]),
            sa.ForeignKeyConstraint(["evidence_row_id"], ["crisis_monitoring_rows.id"]),
            sa.ForeignKeyConstraint(["evidence_report_id"], ["crisis_monitoring_reports.id"]),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        )
        op.create_index(
            "ix_emergency_decl_network_status",
            "emergency_declarations",
            ["network_id", "status"],
        )
        op.create_index(
            "ix_emergency_decl_window",
            "emergency_declarations",
            ["window_id"],
        )

    # ── declaration_signatures ───────────────────────────────────
    if not _table_exists(inspector, "declaration_signatures"):
        op.create_table(
            "declaration_signatures",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("declaration_id", sa.Integer(), nullable=False),
            sa.Column("signer_user_id", sa.Integer(), nullable=False),
            sa.Column("required_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("status", sa.String(40), nullable=False, server_default="pending"),
            # 'totp' | 'webauthn' | 'manual_admin'
            sa.Column("signature_method", sa.String(20), nullable=True),
            # COI discipline (NEAR governance requirement)
            sa.Column("declared_no_coi", sa.Boolean(), nullable=True),
            sa.Column("recusal_reason", sa.String(500), nullable=True),
            sa.Column("rejection_reason", sa.String(500), nullable=True),
            sa.Column("signed_at", sa.DateTime(), nullable=True),
            sa.Column("auth_token_hint", sa.String(40), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["declaration_id"], ["emergency_declarations.id"]),
            sa.ForeignKeyConstraint(["signer_user_id"], ["users.id"]),
            sa.UniqueConstraint(
                "declaration_id", "signer_user_id",
                name="uq_one_signature_per_signer_per_declaration",
            ),
        )
        op.create_index(
            "ix_decl_signatures_declaration_status",
            "declaration_signatures",
            ["declaration_id", "status"],
        )

    # ── declaration_documents ────────────────────────────────────
    if not _table_exists(inspector, "declaration_documents"):
        op.create_table(
            "declaration_documents",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("declaration_id", sa.Integer(), nullable=False),
            sa.Column("document_id", sa.Integer(), nullable=True),
            # 'situation_report' | 'needs_assessment' | 'government_declaration'
            # | 'partner_intel' | 'other'
            sa.Column("kind", sa.String(40), nullable=False, server_default="other"),
            sa.Column("note", sa.String(500), nullable=True),
            sa.Column("uploaded_by_user_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["declaration_id"], ["emergency_declarations.id"]),
            sa.ForeignKeyConstraint(["document_id"], ["documents.id"]),
            sa.ForeignKeyConstraint(["uploaded_by_user_id"], ["users.id"]),
        )
        op.create_index(
            "ix_decl_docs_declaration",
            "declaration_documents",
            ["declaration_id"],
        )


def downgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    for table in (
        "declaration_documents",
        "declaration_signatures",
        "emergency_declarations",
    ):
        if _table_exists(inspector, table):
            op.drop_table(table)
