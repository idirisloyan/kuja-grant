"""
Entity comments — Phase 13.18.

PMO's polymorphic comments table: one row attaches to any entity
(application, grant, report, risk, etc.) with @mentions resolved
against email-localpart-first matching.

For Kuja's marketplace shape, comments must be scoped to the
donor↔NGO pair on entities they jointly access (grant + application
+ report). The visibility check is in the route, not the model.

Schema:
  entity_kind   'application' | 'grant' | 'report' | 'risk' | 'organization'
  entity_id     int
  body_md       free-text markdown (≤4000 chars)
  mentioned_user_ids  JSON list of user IDs @mentioned in body_md
  author_user_id
  created_at
  edited_at     null when not edited; set on update
  resolved_at   nullable — for resolvable threads
"""

import json
from datetime import datetime, timezone

from app.extensions import db


class EntityComment(db.Model):
    __tablename__ = 'entity_comments'
    __table_args__ = (
        db.Index('ix_entity_comments_entity', 'entity_kind', 'entity_id'),
        db.Index('ix_entity_comments_author', 'author_user_id'),
    )

    id = db.Column(db.Integer, primary_key=True)

    entity_kind = db.Column(db.String(40), nullable=False)
    entity_id = db.Column(db.Integer, nullable=False)

    author_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    body_md = db.Column(db.Text, nullable=False)
    mentioned_user_ids = db.Column(db.Text, nullable=True)  # JSON list[int]

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    edited_at = db.Column(db.DateTime, nullable=True)
    resolved_at = db.Column(db.DateTime, nullable=True)

    author = db.relationship('User', foreign_keys=[author_user_id])

    def get_mentions(self) -> list[int]:
        if not self.mentioned_user_ids:
            return []
        try:
            data = json.loads(self.mentioned_user_ids)
            return [int(x) for x in data if isinstance(x, (int, str))]
        except Exception:
            return []

    def set_mentions(self, ids: list[int]):
        self.mentioned_user_ids = json.dumps(list(set(int(i) for i in ids)))

    def to_dict(self):
        return {
            'id': self.id,
            'entity_kind': self.entity_kind,
            'entity_id': self.entity_id,
            'author': {
                'user_id': self.author_user_id,
                'name': self.author.name if self.author else None,
                'email': self.author.email if self.author else None,
            },
            'body_md': self.body_md,
            'mentioned_user_ids': self.get_mentions(),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'edited_at': self.edited_at.isoformat() if self.edited_at else None,
            'resolved_at': self.resolved_at.isoformat() if self.resolved_at else None,
        }
