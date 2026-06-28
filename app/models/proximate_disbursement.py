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

# SOP 10 §4 Step 2: Allocation Committee tier ladder. Each row is
# (min_amount_usd_inclusive, cosigners_required_in_addition_to_sender).
# Releases below the first threshold need zero cosigners (sender alone).
# Lookup: find the highest threshold the amount meets-or-exceeds.
COSIGN_LADDER_USD = (
    (10_000.0, 1),   # $10k+: one cosigner (the original Phase 662 rule)
    (50_000.0, 2),   # $50k+: two cosigners
    (200_000.0, 3),  # $200k+: three cosigners (full Allocation Committee)
)

# Kept for back-compat with Phase 662 callers; equals the first ladder row.
COSIGN_THRESHOLD_USD = COSIGN_LADDER_USD[0][0]


def cosigners_required_for(amount_usd: float) -> int:
    """Return the number of cosigners (additional to the sender) required
    by SOP 10 §4 Step 2 for a disbursement of the given size."""
    required = 0
    for threshold, n in COSIGN_LADDER_USD:
        if amount_usd >= threshold:
            required = n
    return required


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

    # Phase 668 — multi-tier ladder. cosigners_required is snapshotted at
    # create time so the rule applied to this disbursement is fixed even
    # if the ladder later changes. cosigners_extra_json holds the second
    # and later cosigners as a JSON list of {user_id, cosigned_at}.
    cosigners_required = db.Column(db.Integer, nullable=True, default=0)
    cosigners_extra_json = db.Column(db.Text, nullable=True)

    # Phase 668 — Plan-B FSP fallback. When the OB flags a disbursement,
    # they can tag a reason; security-driven route failures unlock a
    # 'Try alternate FSP' suggestion on the partner detail.
    flagged_reason = db.Column(db.String(80), nullable=True)

    # Phase 673 — third-party verifier (SoP §10 §5). A randomly-assigned
    # endorser (NOT one of the partner's own endorsers, NOT a signer)
    # attests independently to the disbursement's on-the-ground reality.
    verifier_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    verifier_assigned_at = db.Column(db.DateTime(timezone=True), nullable=True)
    verifier_verdict = db.Column(db.String(20), nullable=True)  # 'confirmed' | 'disputed'
    verifier_notes = db.Column(db.Text, nullable=True)
    verifier_attested_at = db.Column(db.DateTime(timezone=True), nullable=True)

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
            'cosigners_required': self.cosigners_required or 0,
            'cosigners_count': self._cosigners_count(),
            'cosigners_extra': self._cosigners_extra(),
            'flagged_reason': self.flagged_reason,
            'verifier_user_id': self.verifier_user_id,
            'verifier_assigned_at': (
                self.verifier_assigned_at.isoformat() if self.verifier_assigned_at else None
            ),
            'verifier_verdict': self.verifier_verdict,
            'verifier_notes': self.verifier_notes,
            'verifier_attested_at': (
                self.verifier_attested_at.isoformat() if self.verifier_attested_at else None
            ),
        }

    def _cosigners_extra(self):
        if not self.cosigners_extra_json:
            return []
        import json as _json
        try:
            v = _json.loads(self.cosigners_extra_json)
            return v if isinstance(v, list) else []
        except (ValueError, TypeError):
            return []

    def _cosigners_count(self) -> int:
        """How many cosignatures have been collected (1st + extras)."""
        n = 1 if self.cosigned_by_user_id else 0
        n += len(self._cosigners_extra())
        return n

    def append_cosigner(self, user_id: int) -> None:
        """Append a cosigner. The 1st lands on the legacy
        cosigned_by_user_id column; the 2nd and later land in
        cosigners_extra_json. Caller is responsible for COI checks."""
        import json as _json
        now = datetime.now(timezone.utc).isoformat()
        if not self.cosigned_by_user_id:
            self.cosigned_by_user_id = user_id
            self.cosigned_at = datetime.now(timezone.utc)
            return
        extras = self._cosigners_extra()
        extras.append({'user_id': user_id, 'cosigned_at': now})
        self.cosigners_extra_json = _json.dumps(extras)
