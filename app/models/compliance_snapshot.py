"""
Compliance health snapshots — Phase 13.27.

PMO's pattern: every grant gets a daily health snapshot row written
by a cron job. Two derived views consume the table:
  - trajectory chart: sparkline of last 60 days
  - 30-day forecast: linear regression projected forward, with a
    "slips below at-risk in N days" badge when the trend crosses
    the threshold

Idempotency: only one row per (grant_id, date). The cron upserts —
re-running is harmless.
"""

from datetime import datetime, date, timezone

from app.extensions import db


class ComplianceSnapshot(db.Model):
    __tablename__ = 'compliance_snapshots'
    __table_args__ = (
        db.UniqueConstraint('grant_id', 'snapshot_date', name='uq_compliance_snapshot_day'),
        db.Index('ix_compliance_snapshot_grant_date', 'grant_id', 'snapshot_date'),
    )

    id = db.Column(db.Integer, primary_key=True)
    grant_id = db.Column(db.Integer, db.ForeignKey('grants.id'), nullable=False)
    snapshot_date = db.Column(db.Date, nullable=False, default=lambda: date.today())
    score = db.Column(db.Integer, nullable=False)
    band = db.Column(db.String(16), nullable=False)
    # Per-pillar values stored compactly so trajectory chart can also
    # render per-pillar trends without re-running the calculator.
    pillars_json = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    def to_dict(self):
        import json as _json
        pillars = None
        if self.pillars_json:
            try:
                pillars = _json.loads(self.pillars_json)
            except (ValueError, TypeError):
                pillars = None
        return {
            'id': self.id,
            'grant_id': self.grant_id,
            'date': self.snapshot_date.isoformat() if self.snapshot_date else None,
            'score': self.score,
            'band': self.band,
            'pillars': pillars,
        }
