"""Proximate disbursement model — Phase 651 (June 2026).

A disbursement is one money release from Adeso to a cleared partner.
Per the locked decision, reporting is per-disbursement (not monthly
calendar): every release spawns a report obligation that the partner
must complete by `report_due_at`. The cron now nudges late reports
rather than emitting calendar-month flags.

Keeps the relational footprint minimal: just enough to anchor a
report obligation. Round linkage is by round_id FK so end-of-round
reporting can pull all disbursements + reports in a single query.
"""

from datetime import datetime, timezone, timedelta

from app.extensions import db

DISBURSEMENT_STATUSES = (
    "pending_cosign",   # >=$10k threshold; awaits second OB signer
    "pending_report",   # released, partner has not submitted report
    "reported",         # partner submitted, OB has not yet reviewed
    "verified",         # OB read and accepted the report
    "flagged",          # OB read and raised concerns
)

DEFAULT_REPORT_WINDOW_DAYS = 14

# SOP 10 §4 Step 2: disbursements at or above this threshold require a
# second authorised signer before money moves. Below it, the OB can
# release single-handed.
COSIGN_THRESHOLD_USD = 10_000.0


class ProximateDisbursement(db.Model):
    """One release of money to a Proximate partner."""
    __tablename__ = 'proximate_disbursements'

    id = db.Column(db.Integer, primary_key=True)
    network_id = db.Column(
        db.Integer, db.ForeignKey('networks.id'),
        nullable=False, index=True,
    )
    partner_id = db.Column(
        db.Integer, db.ForeignKey('proximate_partners.id'),
        nullable=False, index=True,
    )
    round_id = db.Column(
        db.Integer, db.ForeignKey('proximate_rounds.id'),
        nullable=True, index=True,
    )
    disbursement_method_id = db.Column(
        db.Integer, db.ForeignKey('proximate_partner_disbursement_methods.id'),
        nullable=True,
    )

    amount_usd = db.Column(db.Numeric(12, 2), nullable=False)
    purpose = db.Column(db.String(500), nullable=True)
    sent_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    sent_by_user_id = db.Column(
        db.Integer, db.ForeignKey('users.id'), nullable=True,
    )

    status = db.Column(
        db.String(40), default='pending_report', nullable=False, index=True,
    )

    # Report obligation
    report_due_at = db.Column(db.DateTime(timezone=True), nullable=False)
    report_submitted_at = db.Column(db.DateTime(timezone=True), nullable=True)
    report_token = db.Column(db.String(64), nullable=True, unique=True, index=True)

    # Inline report payload — keep it simple; the 5-question form
    # answers land as JSON. Storage is fine for v1; if we need rich
    # querying later we promote columns.
    report_json = db.Column(db.Text, nullable=True)
    report_voice_doc_id = db.Column(db.Integer, db.ForeignKey('documents.id'), nullable=True)
    report_photo_doc_id = db.Column(db.Integer, db.ForeignKey('documents.id'), nullable=True)
    report_voice_transcript = db.Column(db.Text, nullable=True)

    # Phase 660 — Adeso acknowledgement back to the partner. Surfaces on
    # the same token URL the partner returns to.
    ack_message = db.Column(db.Text, nullable=True)
    ack_message_at = db.Column(db.DateTime(timezone=True), nullable=True)
    ack_by_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    # Phase 662 — $10k threshold ladder: second signer required when
    # status is pending_cosign. The original sender (sent_by_user_id)
    # cannot be the cosigner — COI guard enforced at the route layer.
    cosigned_by_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    cosigned_at = db.Column(db.DateTime(timezone=True), nullable=True)

    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    partner = db.relationship('ProximatePartner', backref='disbursements')

    @classmethod
    def make_report_token(cls):
        import secrets
        return secrets.token_urlsafe(32)

    def is_overdue(self) -> bool:
        if self.report_submitted_at is not None:
            return False
        return datetime.now(timezone.utc) > (
            self.report_due_at.replace(tzinfo=timezone.utc)
            if self.report_due_at.tzinfo is None else self.report_due_at
        )

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'network_id': self.network_id,
            'partner_id': self.partner_id,
            'partner_name': self.partner.name if self.partner else None,
            'round_id': self.round_id,
            'disbursement_method_id': self.disbursement_method_id,
            'amount_usd': float(self.amount_usd) if self.amount_usd is not None else None,
            'purpose': self.purpose,
            'sent_at': self.sent_at.isoformat() if self.sent_at else None,
            'sent_by_user_id': self.sent_by_user_id,
            'status': self.status,
            'report_due_at': self.report_due_at.isoformat() if self.report_due_at else None,
            'report_submitted_at': (
                self.report_submitted_at.isoformat() if self.report_submitted_at else None
            ),
            'overdue': self.is_overdue(),
            'report_token': self.report_token,
            'has_report': self.report_submitted_at is not None,
            'ack_message': self.ack_message,
            'ack_message_at': (
                self.ack_message_at.isoformat() if self.ack_message_at else None
            ),
            'cosigned_by_user_id': self.cosigned_by_user_id,
            'cosigned_at': (
                self.cosigned_at.isoformat() if self.cosigned_at else None
            ),
            'cosign_threshold_usd': COSIGN_THRESHOLD_USD,
        }
