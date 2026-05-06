"""
Saved searches — Phase 13.33.

PMO's pattern: a per-user list of named filtered queries with
drag-reorder. The underlying filter shape is opaque to this model
(stored as JSON) — the consumer (donor's grant list, NGO's apps
list, etc.) interprets it.
"""

import json
from datetime import datetime, timezone

from app.extensions import db


class SavedSearch(db.Model):
    __tablename__ = 'saved_searches'
    __table_args__ = (
        db.Index('ix_saved_search_user_scope', 'user_id', 'scope'),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    # Scope identifies which list this saved search belongs to.
    # e.g. 'grants' | 'applications' | 'reports' | 'organizations'
    scope = db.Column(db.String(40), nullable=False)

    name = db.Column(db.String(120), nullable=False)
    filter_json = db.Column(db.Text, nullable=False, default='{}')
    sort_order = db.Column(db.Integer, default=0, nullable=False)

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    def get_filter(self) -> dict:
        try:
            return json.loads(self.filter_json or '{}')
        except (ValueError, TypeError):
            return {}

    def set_filter(self, value: dict):
        self.filter_json = json.dumps(value or {}, default=str)

    def to_dict(self):
        return {
            'id': self.id,
            'scope': self.scope,
            'name': self.name,
            'filter': self.get_filter(),
            'sort_order': self.sort_order,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
