"""Pre-deploy cleanup: reset Alembic version table if it references
migrations that no longer exist. Safe to run multiple times.

This handles the case where:
- Production DB was created with db.create_all() (no migrations)
- A previous deploy attempt failed mid-migration, leaving stale entries
- Migration files were replaced/combined

The v300_combined migration is idempotent, so re-running it is safe.
"""
import os
import sys


def main():
    db_url = os.environ.get('DATABASE_URL', '')
    if not db_url:
        print("pre_deploy: No DATABASE_URL set, skipping")
        return

    # Railway uses postgres:// but SQLAlchemy needs postgresql://
    db_url = db_url.replace('postgres://', 'postgresql://', 1)

    try:
        import sqlalchemy
        engine = sqlalchemy.create_engine(db_url)
        with engine.connect() as conn:
            # Check if alembic_version table exists
            result = conn.execute(sqlalchemy.text(
                "SELECT EXISTS (SELECT FROM information_schema.tables "
                "WHERE table_name = 'alembic_version')"
            ))
            exists = result.scalar()

            if exists:
                # Check current revision
                result = conn.execute(sqlalchemy.text(
                    "SELECT version_num FROM alembic_version"
                ))
                rows = result.fetchall()
                if rows:
                    current = rows[0][0]
                    print(f"pre_deploy: Current alembic revision: {current}")
                    # Known valid revisions (cumulative migration chain)
                    valid_revisions = {'v300_combined', 'v301_lockout'}
                    if current not in valid_revisions:
                        conn.execute(sqlalchemy.text(
                            "DELETE FROM alembic_version"
                        ))
                        conn.commit()
                        print(f"pre_deploy: Cleared stale revision '{current}'")
                    else:
                        print("pre_deploy: Revision is current, nothing to do")
                else:
                    print("pre_deploy: alembic_version table is empty")
            else:
                print("pre_deploy: No alembic_version table yet (fresh DB)")

    except Exception as e:
        print(f"pre_deploy: Warning - {e}")
        print("pre_deploy: Continuing anyway (flask db upgrade will handle it)")


if __name__ == '__main__':
    main()
