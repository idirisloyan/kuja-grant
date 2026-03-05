"""v3.0.1: Add database-backed login lockout columns to users table.

Enables brute-force protection that works across all Gunicorn workers
(replaces per-worker in-memory rate limiter).

Revision ID: v301_lockout
Revises: v300_combined
Create Date: 2026-03-05 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = 'v301_lockout'
down_revision = 'v300_combined'
branch_labels = None
depends_on = None


def _column_exists(inspector, table, column):
    columns = [c['name'] for c in inspector.get_columns(table)]
    return column in columns


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)

    if not _column_exists(inspector, 'users', 'failed_login_count'):
        op.add_column('users', sa.Column('failed_login_count', sa.Integer(), server_default='0'))

    if not _column_exists(inspector, 'users', 'last_failed_login'):
        op.add_column('users', sa.Column('last_failed_login', sa.DateTime(), nullable=True))

    if not _column_exists(inspector, 'users', 'locked_until'):
        op.add_column('users', sa.Column('locked_until', sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column('users', 'locked_until')
    op.drop_column('users', 'last_failed_login')
    op.drop_column('users', 'failed_login_count')
