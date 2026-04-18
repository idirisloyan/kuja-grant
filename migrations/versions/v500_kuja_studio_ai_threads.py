"""v5.0.0: Kuja Studio — AI thread persistence + observability log.

Three new tables backing the Phase 2 co-pilot rail:
    ai_threads      — conversation threads (persistent across sessions)
    ai_messages     — individual user/assistant turns
    ai_call_logs    — observability for every AI endpoint invocation

Revision ID: v500_kuja_studio
Revises: v301_lockout
Create Date: 2026-04-18 22:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = 'v500_kuja_studio'
down_revision = 'v301_lockout'
branch_labels = None
depends_on = None


def _table_exists(inspector, table):
    return table in inspector.get_table_names()


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)

    if not _table_exists(inspector, 'ai_threads'):
        op.create_table(
            'ai_threads',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False, index=True),
            sa.Column('scope_kind', sa.String(40), nullable=True),
            sa.Column('scope_id', sa.Integer(), nullable=True),
            sa.Column('title', sa.String(200), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=False),
        )
        op.create_index('ix_ai_threads_user_updated', 'ai_threads', ['user_id', 'updated_at'])
        op.create_index('ix_ai_threads_scope', 'ai_threads', ['scope_kind', 'scope_id'])

    if not _table_exists(inspector, 'ai_messages'):
        op.create_table(
            'ai_messages',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('thread_id', sa.Integer(),
                      sa.ForeignKey('ai_threads.id', ondelete='CASCADE'), nullable=False),
            sa.Column('role', sa.String(20), nullable=False),
            sa.Column('content', sa.Text(), nullable=False),
            sa.Column('meta_json', sa.Text(), nullable=True),
            sa.Column('tokens_in', sa.Integer(), nullable=True),
            sa.Column('tokens_out', sa.Integer(), nullable=True),
            sa.Column('model', sa.String(80), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False),
        )
        op.create_index('ix_ai_messages_thread_created', 'ai_messages', ['thread_id', 'created_at'])

    if not _table_exists(inspector, 'ai_call_logs'):
        op.create_table(
            'ai_call_logs',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('endpoint', sa.String(80), nullable=False),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
            sa.Column('success', sa.Boolean(), nullable=False, server_default=sa.text('1')),
            sa.Column('duration_ms', sa.Integer(), nullable=True),
            sa.Column('tokens_in', sa.Integer(), nullable=True),
            sa.Column('tokens_out', sa.Integer(), nullable=True),
            sa.Column('model', sa.String(80), nullable=True),
            sa.Column('error_code', sa.String(60), nullable=True),
            sa.Column('error_message', sa.String(500), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False),
        )
        op.create_index('ix_ai_call_logs_endpoint_created', 'ai_call_logs', ['endpoint', 'created_at'])
        op.create_index('ix_ai_call_logs_user_created', 'ai_call_logs', ['user_id', 'created_at'])
        op.create_index('ix_ai_call_logs_success', 'ai_call_logs', ['success'])


def downgrade():
    bind = op.get_bind()
    inspector = inspect(bind)

    if _table_exists(inspector, 'ai_messages'):
        op.drop_index('ix_ai_messages_thread_created', table_name='ai_messages')
        op.drop_table('ai_messages')

    if _table_exists(inspector, 'ai_threads'):
        op.drop_index('ix_ai_threads_scope', table_name='ai_threads')
        op.drop_index('ix_ai_threads_user_updated', table_name='ai_threads')
        op.drop_table('ai_threads')

    if _table_exists(inspector, 'ai_call_logs'):
        op.drop_index('ix_ai_call_logs_success', table_name='ai_call_logs')
        op.drop_index('ix_ai_call_logs_user_created', table_name='ai_call_logs')
        op.drop_index('ix_ai_call_logs_endpoint_created', table_name='ai_call_logs')
        op.drop_table('ai_call_logs')
