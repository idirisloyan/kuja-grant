"""Phase 43 — TenantMessage + TenantMessageRead + MemberFeedback.

Adds three tables:

  - tenant_messages — in-app messaging from the secretariat to members.
    Scopes: network / country / org / declaration. Each row stores
    the audit_chain_id of the AuditChainEntry written at send time,
    so we can trace every message through the same tamper-evident log
    as declarations and grants.
  - tenant_message_reads — composite-key (message_id, org_id) read
    receipts. The inbox uses these to surface unread counts.
  - member_feedback — NGO-side feedback channel for the NEAR risk
    pillar 4 ("feedback mechanisms"). Categorised: process / system /
    decision / support / suggestion / other. Tracked through
    open / in_review / addressed / closed. Secretariat responds in
    response_md.

All three are created idempotently — checked against the inspector
because the SQLite bootstrap in app/__init__.py also creates them
via db.create_all().

Revision ID: v670_phase43_messaging_feedback
Revises: v660_phase40_app_rubric_budget
Create Date: 2026-05-28
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = 'v670_phase43_messaging_feedback'
down_revision = 'v660_phase40_app_rubric_budget'
branch_labels = None
depends_on = None


def _has(inspector, table):
    return table in inspector.get_table_names()


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)

    if not _has(inspector, 'tenant_messages'):
        op.create_table(
            'tenant_messages',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('network_id', sa.Integer(), sa.ForeignKey('networks.id'), nullable=False),
            sa.Column('sender_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('scope', sa.String(20), nullable=False),
            sa.Column('scope_value', sa.String(120), nullable=True),
            sa.Column('subject', sa.String(200), nullable=False),
            sa.Column('body_md', sa.Text(), nullable=False),
            sa.Column('related_kind', sa.String(40), nullable=True),
            sa.Column('related_id', sa.Integer(), nullable=True),
            sa.Column('sent_at', sa.DateTime(), nullable=False),
            sa.Column('audit_chain_id', sa.Integer(), nullable=True),
        )
        op.create_index('ix_tenant_messages_network_sent', 'tenant_messages',
                        ['network_id', 'sent_at'])
        op.create_index('ix_tenant_messages_scope', 'tenant_messages',
                        ['network_id', 'scope', 'scope_value'])

    if not _has(inspector, 'tenant_message_reads'):
        op.create_table(
            'tenant_message_reads',
            sa.Column('message_id', sa.Integer(),
                      sa.ForeignKey('tenant_messages.id', ondelete='CASCADE'),
                      primary_key=True),
            sa.Column('org_id', sa.Integer(),
                      sa.ForeignKey('organizations.id', ondelete='CASCADE'),
                      primary_key=True),
            sa.Column('read_at', sa.DateTime(), nullable=False),
        )

    if not _has(inspector, 'member_feedback'):
        op.create_table(
            'member_feedback',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('network_id', sa.Integer(), sa.ForeignKey('networks.id'), nullable=False),
            sa.Column('org_id', sa.Integer(), sa.ForeignKey('organizations.id'), nullable=False),
            sa.Column('submitted_by_user_id', sa.Integer(),
                      sa.ForeignKey('users.id'), nullable=False),
            sa.Column('category', sa.String(40), nullable=False, server_default='other'),
            sa.Column('subject', sa.String(200), nullable=False),
            sa.Column('body_md', sa.Text(), nullable=False),
            sa.Column('related_kind', sa.String(40), nullable=True),
            sa.Column('related_id', sa.Integer(), nullable=True),
            sa.Column('status', sa.String(20), nullable=False, server_default='open'),
            sa.Column('response_md', sa.Text(), nullable=True),
            sa.Column('response_at', sa.DateTime(), nullable=True),
            sa.Column('response_by_user_id', sa.Integer(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=False),
        )
        op.create_index('ix_member_feedback_network_status', 'member_feedback',
                        ['network_id', 'status'])
        op.create_index('ix_member_feedback_org', 'member_feedback', ['org_id'])


def downgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    for table in ('member_feedback', 'tenant_message_reads', 'tenant_messages'):
        if _has(inspector, table):
            op.drop_table(table)
