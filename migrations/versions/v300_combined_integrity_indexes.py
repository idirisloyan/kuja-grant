"""v3.0.0 combined: indexes, updated_at, unique constraint, numeric funding

Idempotent migration that safely handles both fresh databases and
production databases that were initialized with db.create_all().

Revision ID: v300_combined
Revises:
Create Date: 2026-03-04 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = 'v300_combined'
down_revision = None
branch_labels = None
depends_on = None


def _column_exists(inspector, table, column):
    """Check if a column already exists in a table."""
    columns = [c['name'] for c in inspector.get_columns(table)]
    return column in columns


def _index_exists(inspector, table, index_name):
    """Check if an index already exists on a table."""
    indexes = inspector.get_indexes(table)
    return any(idx['name'] == index_name for idx in indexes)


def _unique_constraint_exists(inspector, table, constraint_name):
    """Check if a unique constraint already exists on a table."""
    constraints = inspector.get_unique_constraints(table)
    return any(uc['name'] == constraint_name for uc in constraints)


def _table_exists(inspector, table):
    """Check if a table exists."""
    return table in inspector.get_table_names()


def upgrade():
    bind = op.get_bind()
    insp = inspect(bind)

    # ── 1. Production indexes (from former c4c076a04aeb) ──────────────

    index_defs = [
        ('applications', 'ix_applications_grant_status', ['grant_id', 'status']),
        ('applications', 'ix_applications_ngo_status', ['ngo_org_id', 'status']),
        ('compliance_checks', 'ix_compliance_org_date', ['org_id', 'checked_at']),
        ('documents', 'ix_documents_stored_filename', ['stored_filename']),
        ('grants', 'ix_grants_donor_status', ['donor_org_id', 'status']),
        ('organizations', 'ix_orgs_type', ['org_type']),
        ('organizations', 'ix_orgs_verified', ['verified']),
        ('reports', 'ix_reports_grant_status', ['grant_id', 'status']),
        ('reports', 'ix_reports_org_status', ['submitted_by_org_id', 'status']),
        ('reports', 'ix_reports_submitted_by_org', ['submitted_by_org_id']),
        ('reviews', 'ix_reviews_user_status', ['reviewer_user_id', 'status']),
        ('users', 'ix_users_org_id', ['org_id']),
        ('users', 'ix_users_role', ['role']),
    ]

    for table, idx_name, columns in index_defs:
        if _table_exists(insp, table) and not _index_exists(insp, table, idx_name):
            op.create_index(idx_name, table, columns, unique=False)

    # registry_check_result column on registration_verifications
    if _table_exists(insp, 'registration_verifications'):
        if not _column_exists(insp, 'registration_verifications', 'registry_check_result'):
            op.add_column('registration_verifications',
                          sa.Column('registry_check_result', sa.Text(), nullable=True))

    # ── 2. v3 integrity (from former 30f23f47c1c7) ──────────────────

    # Add updated_at to all tables that need it
    updated_at_tables = [
        'users', 'organizations', 'grants', 'applications',
        'assessments', 'documents', 'reviews', 'reports',
        'compliance_checks',
    ]

    for table in updated_at_tables:
        if _table_exists(insp, table) and not _column_exists(insp, table, 'updated_at'):
            op.add_column(table, sa.Column('updated_at', sa.DateTime(), nullable=True))

    # Unique constraint on applications(grant_id, ngo_org_id)
    if _table_exists(insp, 'applications'):
        if not _unique_constraint_exists(insp, 'applications', 'uq_application_grant_ngo'):
            op.create_unique_constraint('uq_application_grant_ngo', 'applications',
                                        ['grant_id', 'ngo_org_id'])

    # Change grants.total_funding from FLOAT to Numeric(12,2)
    if _table_exists(insp, 'grants') and _column_exists(insp, 'grants', 'total_funding'):
        # Get current column type
        cols = {c['name']: c for c in insp.get_columns('grants')}
        col_type = cols.get('total_funding', {}).get('type')
        # Only alter if it's still FLOAT/REAL (not already Numeric)
        if col_type is not None and not isinstance(col_type, sa.Numeric):
            dialect = bind.dialect.name
            if dialect == 'postgresql':
                # PostgreSQL: direct ALTER COLUMN TYPE
                op.execute(
                    'ALTER TABLE grants ALTER COLUMN total_funding '
                    'TYPE NUMERIC(12,2) USING total_funding::NUMERIC(12,2)'
                )
            else:
                # SQLite: use batch mode (recreates table)
                with op.batch_alter_table('grants', schema=None) as batch_op:
                    batch_op.alter_column('total_funding',
                                          existing_type=sa.FLOAT(),
                                          type_=sa.Numeric(precision=12, scale=2),
                                          existing_nullable=True)


def downgrade():
    bind = op.get_bind()
    insp = inspect(bind)

    # Remove updated_at columns
    updated_at_tables = [
        'users', 'organizations', 'grants', 'applications',
        'assessments', 'documents', 'reviews', 'reports',
        'compliance_checks',
    ]

    for table in updated_at_tables:
        if _table_exists(insp, table) and _column_exists(insp, table, 'updated_at'):
            dialect = bind.dialect.name
            if dialect == 'postgresql':
                op.drop_column(table, 'updated_at')
            else:
                with op.batch_alter_table(table, schema=None) as batch_op:
                    batch_op.drop_column('updated_at')

    # Remove unique constraint
    if _table_exists(insp, 'applications'):
        if _unique_constraint_exists(insp, 'applications', 'uq_application_grant_ngo'):
            dialect = bind.dialect.name
            if dialect == 'postgresql':
                op.drop_constraint('uq_application_grant_ngo', 'applications', type_='unique')
            else:
                with op.batch_alter_table('applications', schema=None) as batch_op:
                    batch_op.drop_constraint('uq_application_grant_ngo', type_='unique')

    # Revert total_funding type
    if _table_exists(insp, 'grants') and _column_exists(insp, 'grants', 'total_funding'):
        dialect = bind.dialect.name
        if dialect == 'postgresql':
            op.execute(
                'ALTER TABLE grants ALTER COLUMN total_funding '
                'TYPE DOUBLE PRECISION USING total_funding::DOUBLE PRECISION'
            )
        else:
            with op.batch_alter_table('grants', schema=None) as batch_op:
                batch_op.alter_column('total_funding',
                                      existing_type=sa.Numeric(precision=12, scale=2),
                                      type_=sa.FLOAT(),
                                      existing_nullable=True)

    # Remove indexes
    index_defs = [
        ('applications', 'ix_applications_grant_status'),
        ('applications', 'ix_applications_ngo_status'),
        ('compliance_checks', 'ix_compliance_org_date'),
        ('documents', 'ix_documents_stored_filename'),
        ('grants', 'ix_grants_donor_status'),
        ('organizations', 'ix_orgs_type'),
        ('organizations', 'ix_orgs_verified'),
        ('reports', 'ix_reports_grant_status'),
        ('reports', 'ix_reports_org_status'),
        ('reports', 'ix_reports_submitted_by_org'),
        ('reviews', 'ix_reviews_user_status'),
        ('users', 'ix_users_org_id'),
        ('users', 'ix_users_role'),
    ]

    for table, idx_name in index_defs:
        if _table_exists(insp, table) and _index_exists(insp, table, idx_name):
            op.drop_index(idx_name, table_name=table)

    # Remove registry_check_result
    if _table_exists(insp, 'registration_verifications'):
        if _column_exists(insp, 'registration_verifications', 'registry_check_result'):
            dialect = bind.dialect.name
            if dialect == 'postgresql':
                op.drop_column('registration_verifications', 'registry_check_result')
            else:
                with op.batch_alter_table('registration_verifications', schema=None) as batch_op:
                    batch_op.drop_column('registry_check_result')
