"""
BankAccountVerification — Phase 1 (May 2026 truth-in-claims)
============================================================

Records bank account verification checks for an organization.

What this does (and doesn't do):
  - Validates IBAN/SWIFT/BIC structure (checksum + country)
  - Checks the bank's country against high-risk jurisdiction lists
    (FATF Increased Monitoring + FATF Call for Action)
  - Cross-checks bank name against the org's declared bank
  - Flags structural anomalies (length, mismatched country code, etc.)

It does NOT call a bank API — no production NGO platform does, and
NGO partner banks rarely expose verification endpoints in the
Global South. The donor-grade pattern is: validate what we can
mechanically, flag what looks wrong, and require human attestation
on the rest. The audit trail captures both the mechanical signal
and the human override.

Why this is in scope for Kuja:
  - Many fraud incidents in donor disbursements stem from mis-typed
    account numbers, look-alike bank names, or accounts in
    high-risk jurisdictions the donor didn't sign off on.
  - Even a structural check + jurisdiction flag would have caught
    several historical donor fraud incidents in the sector.

Schema:
  - account_number_last4 — only last 4 stored (PCI-style minimization)
  - account_number_hash  — SHA256 for re-verification without re-storing PII
  - swift_bic            — full SWIFT/BIC (public)
  - iban                 — full IBAN (acceptable to store; not secret per ISO 13616)
  - bank_name            — bank declared by NGO
  - bank_country         — ISO 3166-1 alpha-2
  - findings_json        — structured findings list
  - status               — 'verified' | 'review' | 'flagged' | 'error'
  - risk_score           — 0-100 (higher = riskier)
"""

import hashlib
from datetime import datetime, timezone

from app.extensions import db
from app.utils.helpers import _json_load, _json_dump


class BankAccountVerification(db.Model):
    __tablename__ = 'bank_account_verifications'
    __table_args__ = (
        db.Index('ix_bank_verif_org_date', 'org_id', 'verified_at'),
        db.Index('ix_bank_verif_status', 'status'),
    )

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, db.ForeignKey('organizations.id'), nullable=False, index=True)

    # Bank identification (the public-safe fields)
    bank_name = db.Column(db.String(300), nullable=True)
    bank_country = db.Column(db.String(2), nullable=True)        # ISO 3166-1 alpha-2
    swift_bic = db.Column(db.String(11), nullable=True)
    iban = db.Column(db.String(34), nullable=True)
    currency = db.Column(db.String(3), nullable=True)            # ISO 4217

    # Account number — minimised storage
    account_number_last4 = db.Column(db.String(4), nullable=True)
    account_number_hash = db.Column(db.String(64), nullable=True)   # SHA256

    # Findings + scoring
    findings_json = db.Column(db.Text, nullable=True)
    risk_score = db.Column(db.Integer, default=0)                 # 0-100
    status = db.Column(db.String(16), nullable=False, default='pending')
    # pending | verified | review | flagged | error

    notes = db.Column(db.Text, nullable=True)

    verified_by_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    verified_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    organization = db.relationship('Organization', backref=db.backref('bank_verifications', lazy='dynamic'))
    verified_by = db.relationship('User', backref='bank_verifications_performed')

    # --- Helpers ---
    @staticmethod
    def hash_account_number(account_number: str) -> str:
        """Stable, salt-free SHA256 of the account number.

        We don't salt because the value is being hashed for
        re-identification only (does this match the previously
        recorded number?), not stored as a credential. Salting
        would defeat the comparison goal.
        """
        if not account_number:
            return ''
        return hashlib.sha256(account_number.strip().encode('utf-8')).hexdigest()

    def get_findings(self):
        return _json_load(self.findings_json) or []

    def set_findings(self, value):
        self.findings_json = _json_dump(value)

    def to_dict(self):
        return {
            'id': self.id,
            'org_id': self.org_id,
            'org_name': self.organization.name if self.organization else None,
            'bank_name': self.bank_name,
            'bank_country': self.bank_country,
            'swift_bic': self.swift_bic,
            'iban': self.iban,
            'currency': self.currency,
            'account_number_last4': self.account_number_last4,
            'findings': self.get_findings(),
            'risk_score': self.risk_score,
            'status': self.status,
            'notes': self.notes,
            'verified_by_user_id': self.verified_by_user_id,
            'verified_by_name': self.verified_by.name if self.verified_by else None,
            'verified_at': self.verified_at.isoformat() if self.verified_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
