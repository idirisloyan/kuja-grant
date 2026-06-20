"""CronRun — Phase 153 (Jun 2026).

Tiny tracking table for cron executions so the cron-health admin page
can spot stale or never-ran crons. Each cron writes one row per
invocation with name + result summary.

Schema is deliberately minimal — we only ever query
`MAX(run_at) GROUP BY name` for the dashboard. Heavy structured
logging stays in the existing audit chain.
"""

from datetime import datetime, timezone

from app.extensions import db


class CronRun(db.Model):
    __tablename__ = 'cron_runs'
    __table_args__ = (
        db.Index('ix_cron_runs_name_run', 'name', 'run_at'),
    )

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    run_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    duration_ms = db.Column(db.Integer, nullable=True)
    success = db.Column(db.Boolean, nullable=False, default=True)
    summary = db.Column(db.String(500), nullable=True)


def record_cron_run(name: str, *, duration_ms: int | None = None,
                     success: bool = True, summary: str | None = None) -> int | None:
    """Insert one row. Best-effort; returns the new id or None on error."""
    import logging as _logging
    log = _logging.getLogger('kuja')
    try:
        row = CronRun(
            name=name[:80],
            duration_ms=duration_ms,
            success=success,
            summary=(summary or '')[:500] or None,
        )
        db.session.add(row)
        db.session.commit()
        return row.id
    except Exception as e:
        log.warning('cron_run record failed: %s', e)
        try:
            db.session.rollback()
        except Exception:
            pass
        return None
