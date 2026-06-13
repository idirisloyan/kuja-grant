"""Phase 44 — Per-network Oversight Body role on NetworkMembership.

Adds three nullable columns to network_memberships:

  - is_oversight_body : bool, default False
  - ob_role_started_at : timestamp
  - ob_role_ended_at : timestamp

The Concept Note (IKEA Foundation, 2026) describes the Oversight
Body as "composed of peer-elected leaders from NEAR member
organizations" — so the OB seat lives on the membership row, not
on the user. Users at OB-flagged orgs gain OB permissions through
the org membership.

Backwards-compatible: every existing membership defaults to
is_oversight_body=False, so no behaviour change until the
secretariat starts flagging seats.

Revision ID: v680_phase44_ob_role
Revises: v670_phase43_messaging_feedback
Create Date: 2026-05-28
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "v680_phase44_ob_role"
down_revision = "v670_phase43_messaging_feedback"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("network_memberships")}

    if "is_oversight_body" not in cols:
        op.add_column(
            "network_memberships",
            sa.Column("is_oversight_body", sa.Boolean(), nullable=False,
                      server_default=sa.text("FALSE")),
        )
    if "ob_role_started_at" not in cols:
        op.add_column(
            "network_memberships",
            sa.Column("ob_role_started_at", sa.DateTime(), nullable=True),
        )
    if "ob_role_ended_at" not in cols:
        op.add_column(
            "network_memberships",
            sa.Column("ob_role_ended_at", sa.DateTime(), nullable=True),
        )


def downgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("network_memberships")}
    for col in ("ob_role_ended_at", "ob_role_started_at", "is_oversight_body"):
        if col in cols:
            op.drop_column("network_memberships", col)
