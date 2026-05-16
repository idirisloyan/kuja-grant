"""
Tag — Phase 15E (PMO transfer: per-org tags + segmentation).

Org-scoped controlled vocabulary for free-form classification. Used to
segment grants ("priority", "rural-Kenya", "climate-pilot") and
organizations ("partner-tier-1", "watch-closely") without needing to
add columns or migrations every time the team coins a new label.

Design:
  - Tag is org-scoped — donor A's "priority" is independent of donor B's
  - Polymorphic many-to-many via TagAssignment(tag_id, target_kind, target_id)
  - Find-or-create at the route layer (typing a new tag name on a grant
    auto-creates it for that org and applies it in one round-trip)
  - Color comes from the deterministic NameChip hash on the frontend —
    no manual palette management

Why not a column-per-tag scheme: orgs need 20-50 tags each over time
and most are bespoke. Generic m2m scales.
"""

from datetime import datetime, timezone

from app.extensions import db


class Tag(db.Model):
    __tablename__ = 'tags'
    __table_args__ = (
        db.UniqueConstraint('org_id', 'name_lower', name='uq_tag_org_name'),
        db.Index('ix_tags_org', 'org_id'),
    )

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, db.ForeignKey('organizations.id'),
                       nullable=False, index=True)
    name = db.Column(db.String(60), nullable=False)
    # Lowercased + trimmed for the uniqueness constraint. The display
    # name preserves the user's casing.
    name_lower = db.Column(db.String(60), nullable=False)
    description = db.Column(db.String(280), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           nullable=False)
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('users.id'),
                                   nullable=True)

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'org_id': self.org_id,
            'name': self.name,
            'description': self.description,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class TagAssignment(db.Model):
    """Polymorphic m2m: a tag applied to a grant/org/application/etc.

    target_kind controls which table target_id refers to:
      - 'grant'        → grants.id
      - 'organization' → organizations.id
      - 'application'  → applications.id

    Composite uniqueness prevents double-tagging.
    """
    __tablename__ = 'tag_assignments'
    __table_args__ = (
        db.UniqueConstraint('tag_id', 'target_kind', 'target_id',
                            name='uq_tagassign'),
        db.Index('ix_tagassign_target', 'target_kind', 'target_id'),
    )

    id = db.Column(db.Integer, primary_key=True)
    tag_id = db.Column(db.Integer, db.ForeignKey('tags.id', ondelete='CASCADE'),
                       nullable=False, index=True)
    target_kind = db.Column(db.String(40), nullable=False)
    target_id = db.Column(db.Integer, nullable=False)
    assigned_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                            nullable=False)
    assigned_by_user_id = db.Column(db.Integer, db.ForeignKey('users.id'),
                                    nullable=True)

    tag = db.relationship('Tag', backref=db.backref('assignments',
                                                     cascade='all, delete-orphan',
                                                     lazy='dynamic'))
