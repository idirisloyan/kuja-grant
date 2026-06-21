"""ExpressionOfInterest — Phase 344.

A soft "I'm considering applying" signal from an NGO to a donor.
Heavier than the watchlist (which is private) but lighter than a full
application. Donors see a tile of EOI on their dashboard so they can
nudge a prospective applicant or share context.

One row per (org_id, grant_id). Posting again updates the message.
"""

from datetime import datetime, timezone

from app.extensions import db


class ExpressionOfInterest(db.Model):
    __tablename__ = 'expressions_of_interest'
    __table_args__ = (
        db.UniqueConstraint('org_id', 'grant_id', name='uq_eoi_org_grant'),
        db.Index('ix_eoi_grant', 'grant_id'),
    )

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(
        db.Integer, db.ForeignKey('organizations.id', ondelete='CASCADE'),
        nullable=False,
    )
    grant_id = db.Column(
        db.Integer, db.ForeignKey('grants.id', ondelete='CASCADE'),
        nullable=False,
    )
    message = db.Column(db.Text, nullable=True)
    created_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'org_id': self.org_id,
            'grant_id': self.grant_id,
            'message': self.message,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
