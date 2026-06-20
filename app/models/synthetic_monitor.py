"""Phase 101 — Synthetic monitor result rows.

One row per sweep. The admin dashboard renders a 7-day trend from this
table and the per-probe failure rate breakdown. Pruned by the existing
audit retention cron after KUJA_AUDIT_RETENTION_DAYS.
"""

import json
from datetime import datetime, timezone

from app.extensions import db


class SyntheticMonitorRun(db.Model):
    __tablename__ = 'synthetic_monitor_runs'

    id = db.Column(db.Integer, primary_key=True)
    started_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )
    finished_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    total_ms = db.Column(db.Integer, nullable=False, default=0)
    base_url = db.Column(db.String(255), nullable=False, default='')
    failures = db.Column(db.Integer, nullable=False, default=0)
    slow_count = db.Column(db.Integer, nullable=False, default=0)
    probes_json = db.Column(db.Text, nullable=False, default='[]')

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'finished_at': self.finished_at.isoformat() if self.finished_at else None,
            'total_ms': self.total_ms,
            'base_url': self.base_url,
            'failures': self.failures,
            'slow_count': self.slow_count,
            'probes': json.loads(self.probes_json or '[]'),
        }
