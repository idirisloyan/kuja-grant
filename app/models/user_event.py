"""UserEvent model — Phase 29A (May 2026).

Lightweight behavioral event store. Distinct from AuditChainEntry
(which is for tamper-evident provenance) and from notification
records (which are outbound delivery). This is for "user did X" so
we can answer:

  - Daily/weekly active users by role + language
  - Which features actually get used
  - Funnel drop-off (% of users who start the readiness check vs
    who finish it; how far into the apply flow they get; etc.)
  - A/B outcome differences when feature flags are bucketed

Discipline:
  - org_id is DENORMALIZED here for fast filtering — avoids joining
    every aggregation query through users
  - event_name is a stable string vocab (see EVENT_NAMES below)
  - event_props is JSON for free-form context; analyzers should only
    rely on its shape for keys they own
  - language is captured at event time so cohort analysis can group
    by what the user was actually working in (their language can change)
  - ab_arm captures which experimental arm the user was in (NULL if
    the feature wasn't gated by an A/B at the time)
  - NEVER store PII in event_props — only ids, counts, durations,
    feature keys

Cost shape: each row is ~100 bytes. 100 users × 200 events/week =
20,000 rows/week = ~2MB/week. Well within free-tier postgres.
"""

from datetime import datetime, timezone

from app.extensions import db
from app.utils.helpers import _json_load, _json_dump


# Stable vocabulary. Adding a new event name is fine; renaming an
# existing one is a breaking change for any dashboards built on it.
EVENT_NAMES = {
    # Auth / session
    'session.start',         # user logged in
    # Application lifecycle
    'application.start_draft',
    'application.submit',
    # Reports lifecycle
    'report.start_draft',
    'report.submit',
    'report.preflight_used',
    # AI surfaces
    'chat.thread_open',
    'chat.message_sent',
    'ai_assist.suggestion_accepted',
    # Donor surfaces
    'donor.decision_recorded',
    'donor.broadcast_sent',
    # Reviewer surfaces
    'reviewer.assignment_opened',
    'reviewer.review_submitted',
    # Discovery
    'search.query',
    # Trust + capacity
    'trust_profile.viewed',
    'readiness_check.used',
    # Feature taps (catch-all for "did they click this?")
    'feature.tap',
}


class UserEvent(db.Model):
    __tablename__ = 'user_events'
    __table_args__ = (
        db.Index('ix_user_events_user_time', 'user_id', 'occurred_at'),
        db.Index('ix_user_events_org_time', 'org_id', 'occurred_at'),
        db.Index('ix_user_events_name_time', 'event_name', 'occurred_at'),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'),
                        nullable=True, index=True)
    org_id = db.Column(db.Integer, db.ForeignKey('organizations.id'),
                       nullable=True, index=True)
    role = db.Column(db.String(40), nullable=True)
    language = db.Column(db.String(10), nullable=True)
    event_name = db.Column(db.String(80), nullable=False)
    event_props = db.Column(db.Text, nullable=True)   # JSON dict
    ab_arm = db.Column(db.String(40), nullable=True)
    occurred_at = db.Column(db.DateTime, nullable=False,
                            default=lambda: datetime.now(timezone.utc))

    def get_props(self) -> dict:
        return _json_load(self.event_props) or {}

    def set_props(self, value: dict) -> None:
        self.event_props = _json_dump(value or {})

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'user_id': self.user_id,
            'org_id': self.org_id,
            'role': self.role,
            'language': self.language,
            'event_name': self.event_name,
            'props': self.get_props(),
            'ab_arm': self.ab_arm,
            'occurred_at': self.occurred_at.isoformat() if self.occurred_at else None,
        }
