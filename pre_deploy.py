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
                # Phase 34+ — widen version_num so the long networked-funds
                # revision IDs fit (default Alembic ships varchar(32),
                # several of our migrations are >32 chars).
                try:
                    conn.execute(sqlalchemy.text(
                        "ALTER TABLE alembic_version "
                        "ALTER COLUMN version_num TYPE varchar(255)"
                    ))
                    conn.commit()
                    print("pre_deploy: Widened alembic_version.version_num to varchar(255)")
                except Exception as widen_err:
                    print(f"pre_deploy: Column widen skipped (already wide?): {widen_err}")
                # Check current revision
                result = conn.execute(sqlalchemy.text(
                    "SELECT version_num FROM alembic_version"
                ))
                rows = result.fetchall()
                if rows:
                    current = rows[0][0]
                    print(f"pre_deploy: Current alembic revision: {current}")
                    # Known valid revisions across the cumulative migration chain.
                    # IMPORTANT: keep this in sync with migrations/versions/ —
                    # if a revision here doesn't have a corresponding file,
                    # `flask db upgrade` will fail.
                    valid_revisions = {
                        'v300_combined', 'v301_lockout',
                        # Phase 32-38 — networked funds (May 2026)
                        'v500_kuja_studio',
                        'v600_phase32_networks',
                        'v610_phase33_membership',
                        'v620_phase34_funds_windows_rubrics',
                        'v630_phase35_crisis_monitoring',
                        'v640_phase36_emergency_declarations',
                        'v650_phase37_window_reports_monitoring_visits',
                    }
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
