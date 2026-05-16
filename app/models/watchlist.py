"""
WatchlistItem — Phase 2 (May 2026 category-defining UX)
=======================================================

A user's personal "starred" entities. Lightweight: composite (user, kind, target_id)
primary key; no per-row state beyond the timestamp it was added.

Why this exists:
  - NGO program officers each have a mental "top 5" of grants they're
    tracking and donors they care about.
  - Donors have a "watchlist" of grantees they're paying particular
    attention to.
  - Making it explicit lets the dashboard, command palette, and
    notifications all surface the same list — a tiny personal layer
    on top of org-wide data.

Kinds supported (extensible):
  - grant
  - organization

Composite primary key (user_id, kind, target_id). No soft delete —
unstarring removes the row.
"""

from datetime import datetime, timezone

from app.extensions import db


class WatchlistItem(db.Model):
    __tablename__ = 'watchlist_items'
    __table_args__ = (
        db.Index('ix_watchlist_user', 'user_id'),
        db.Index('ix_watchlist_kind_target', 'kind', 'target_id'),
    )

    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), primary_key=True)
    kind = db.Column(db.String(32), primary_key=True)   # 'grant' | 'organization'
    target_id = db.Column(db.Integer, primary_key=True)

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    user = db.relationship('User', backref=db.backref('watchlist_items', lazy='dynamic'))

    def to_dict(self):
        return {
            'kind': self.kind,
            'target_id': self.target_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
