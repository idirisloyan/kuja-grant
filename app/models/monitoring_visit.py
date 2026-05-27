"""MonitoringVisit model — Phase 37 (May 2026).

The third risk-management pillar (alongside due diligence + regular
reporting + feedback mechanisms). Captures in-person or virtual visits
by secretariat / OB to a grant site, including the community feedback
that ties NEAR's constituent-voice discipline into the window report.

A visit always pertains to a specific Grant, and optionally to the
parent EmergencyDeclaration (so visits roll up under a declaration in
the window report).
"""

from datetime import datetime, timezone

from app.extensions import db
from app.utils.helpers import _json_load, _json_dump


VISIT_MODES = ("in_person", "virtual")
VISIT_STATUSES = ("scheduled", "recorded", "verified", "cancelled")


class MonitoringVisit(db.Model):
    """Visit record for grant implementation oversight."""

    __tablename__ = "monitoring_visits"
    __table_args__ = (
        db.Index("ix_monitoring_visits_grant", "grant_id"),
        db.Index("ix_monitoring_visits_declaration", "declaration_id"),
    )

    id = db.Column(db.Integer, primary_key=True)
    grant_id = db.Column(db.Integer, db.ForeignKey("grants.id"), nullable=False)
    declaration_id = db.Column(
        db.Integer, db.ForeignKey("emergency_declarations.id"), nullable=True,
    )
    visit_mode = db.Column(db.String(20), nullable=False, default="virtual")
    visit_date = db.Column(db.Date, nullable=False)
    visited_by_user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True,
    )

    observations_md = db.Column(db.Text, nullable=True)
    community_feedback_summary = db.Column(db.Text, nullable=True)
    issues_identified = db.Column(db.Text, nullable=True)
    action_items_md = db.Column(db.Text, nullable=True)
    attendance_estimate = db.Column(db.Integer, nullable=True)

    status = db.Column(db.String(40), nullable=False, default="recorded")
    source_links_json = db.Column(db.Text, nullable=True)

    created_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def get_source_links(self) -> list[dict]:
        val = _json_load(self.source_links_json)
        return val if isinstance(val, list) else []

    def set_source_links(self, value) -> None:
        self.source_links_json = _json_dump(value or [])

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "grant_id": self.grant_id,
            "declaration_id": self.declaration_id,
            "visit_mode": self.visit_mode,
            "visit_date": self.visit_date.isoformat() if self.visit_date else None,
            "visited_by_user_id": self.visited_by_user_id,
            "observations_md": self.observations_md,
            "community_feedback_summary": self.community_feedback_summary,
            "issues_identified": self.issues_identified,
            "action_items_md": self.action_items_md,
            "attendance_estimate": self.attendance_estimate,
            "status": self.status,
            "source_links": self.get_source_links(),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
