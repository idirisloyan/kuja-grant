"""KpiSnapshot — Phase 334.

Weekly aggregate of system KPIs, written by a cron so that we can show
trend visualizations later without recomputing on every dashboard load.

One row per ISO week. Inserted/updated idempotently by the
`/api/cron/weekly-kpi-snapshot` endpoint.
"""

from datetime import datetime, timezone

from app.extensions import db


class KpiSnapshot(db.Model):
    __tablename__ = 'kpi_snapshots'
    __table_args__ = (
        db.UniqueConstraint('week_starting', name='uq_kpi_snapshots_week'),
        db.Index('ix_kpi_snapshots_week', 'week_starting'),
    )

    id = db.Column(db.Integer, primary_key=True)
    week_starting = db.Column(db.Date, nullable=False)
    applications_received = db.Column(db.Integer, nullable=False, default=0)
    applications_decided = db.Column(db.Integer, nullable=False, default=0)
    avg_decision_days = db.Column(db.Float, nullable=True)
    ai_cost_usd = db.Column(db.Float, nullable=False, default=0.0)
    created_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def to_dict(self) -> dict:
        return {
            'week_starting': self.week_starting.isoformat() if self.week_starting else None,
            'applications_received': self.applications_received,
            'applications_decided': self.applications_decided,
            'avg_decision_days': self.avg_decision_days,
            'ai_cost_usd': round(self.ai_cost_usd, 2),
        }
