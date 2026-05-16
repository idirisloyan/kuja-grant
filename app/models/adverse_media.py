"""
AdverseMediaScreening — Phase 1 (May 2026 truth-in-claims)
==========================================================

Records adverse media / negative news screening runs against an
organization (and optionally its leadership). One row per screening
run; findings are stored inline as JSON so we keep the canonical
"this is what we saw on this date" snapshot for compliance evidence.

Why we don't normalize findings into a child table: the value to
donors and reviewers is the historical snapshot — "what did we know
on the date we approved the grant?" A child table makes that
question expensive (joins, soft deletes), while inline JSON is one
row + provenance preserved forever.

Schema notes:
  - `lookback_months` — how far back the screening searched
  - `subjects` — JSON: ["Org Name", "CEO Name", ...]  (what was searched)
  - `findings` — JSON: list of {severity, category, headline, summary,
                                url, source, published_at, subject}
  - `summary` — JSON: {high_count, medium_count, low_count, overall_status}
  - `source` — 'anthropic_web_search' | 'claude_training_knowledge' | 'manual'
  - `status` — 'clear' | 'review' | 'flagged' | 'error'
  - `ai_confidence` — 0-100; lower when source is training-knowledge fallback

Acceptable values for `overall_status`:
  - clear:    no adverse findings (or all dismissed)
  - review:   low/medium findings present, not blocking
  - flagged:  at least one high-severity finding
  - error:    screening could not complete
"""

from datetime import datetime, timezone

from app.extensions import db
from app.utils.helpers import _json_load, _json_dump


class AdverseMediaScreening(db.Model):
    __tablename__ = 'adverse_media_screenings'
    __table_args__ = (
        db.Index('ix_adverse_media_org_date', 'org_id', 'screened_at'),
        db.Index('ix_adverse_media_status', 'status'),
    )

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, db.ForeignKey('organizations.id'), nullable=False, index=True)

    lookback_months = db.Column(db.Integer, nullable=False, default=24)
    subjects_json = db.Column(db.Text, nullable=True)          # JSON list of strings
    findings_json = db.Column(db.Text, nullable=True)          # JSON list of finding dicts
    summary_json = db.Column(db.Text, nullable=True)           # JSON dict

    status = db.Column(db.String(16), nullable=False, default='pending')
    # pending | clear | review | flagged | error

    source = db.Column(db.String(64), nullable=False, default='anthropic_web_search')
    ai_confidence = db.Column(db.Float, nullable=True)         # 0-100
    ai_notes = db.Column(db.Text, nullable=True)               # Free-form summary from Claude

    screened_by_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    screened_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    expires_at = db.Column(db.DateTime, nullable=True)   # When this screening should be re-run

    # Relationships
    organization = db.relationship('Organization', backref=db.backref('adverse_media_screenings', lazy='dynamic'))
    screened_by = db.relationship('User', backref='adverse_media_runs')

    # --- JSON helpers ---
    def get_subjects(self):
        return _json_load(self.subjects_json) or []

    def set_subjects(self, value):
        self.subjects_json = _json_dump(value)

    def get_findings(self):
        return _json_load(self.findings_json) or []

    def set_findings(self, value):
        self.findings_json = _json_dump(value)

    def get_summary(self):
        return _json_load(self.summary_json) or {}

    def set_summary(self, value):
        self.summary_json = _json_dump(value)

    def to_dict(self):
        return {
            'id': self.id,
            'org_id': self.org_id,
            'org_name': self.organization.name if self.organization else None,
            'lookback_months': self.lookback_months,
            'subjects': self.get_subjects(),
            'findings': self.get_findings(),
            'summary': self.get_summary(),
            'status': self.status,
            'source': self.source,
            'ai_confidence': self.ai_confidence,
            'ai_notes': self.ai_notes,
            'screened_by_user_id': self.screened_by_user_id,
            'screened_by_name': self.screened_by.name if self.screened_by else None,
            'screened_at': self.screened_at.isoformat() if self.screened_at else None,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
        }
