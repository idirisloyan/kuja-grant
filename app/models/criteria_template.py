"""CriteriaTemplate — Phase 189 (Jun 2026).

Donor can save a grant's criteria as a named template + reuse it on a
future grant. Templates scoped per donor org. Doesn't store criteria
inline twice — saves them as JSON the same way Grant.set_criteria does.
"""

from datetime import datetime, timezone

from app.extensions import db


class CriteriaTemplate(db.Model):
    __tablename__ = 'criteria_templates'
    __table_args__ = (
        db.Index('ix_criteria_templates_org', 'donor_org_id'),
    )

    id = db.Column(db.Integer, primary_key=True)
    donor_org_id = db.Column(
        db.Integer, db.ForeignKey('organizations.id', ondelete='CASCADE'),
        nullable=False,
    )
    name = db.Column(db.String(120), nullable=False)
    description = db.Column(db.String(500), nullable=True)
    criteria_json = db.Column(db.Text, nullable=False, default='[]')
    created_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    def to_dict(self) -> dict:
        import json as _json
        try:
            crits = _json.loads(self.criteria_json or '[]')
        except Exception:
            crits = []
        return {
            'id': self.id,
            'donor_org_id': self.donor_org_id,
            'name': self.name,
            'description': self.description,
            'criteria': crits,
            'criteria_count': len(crits) if isinstance(crits, list) else 0,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
