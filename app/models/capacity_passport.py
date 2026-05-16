"""
CapacityPassport — Phase 1 (May 2026 truth-in-claims)
=====================================================

The Capacity Passport is Kuja's category-defining moat: an NGO
completes its capacity assessment + due diligence ONCE, and the
verified snapshot becomes a shareable artifact that any donor can
verify without re-running the work.

Pattern (inspired by trust frameworks like the START Network Tiered
Funding Framework and Bond's Safeguarding Self-Assessment):
  - NGO publishes a passport tied to its current Trust Profile.
  - System generates a unique slug + share token (URL-safe, ~22 chars).
  - The passport snapshots:
      • capacity scores per framework (Kuja, STEP, UN-HACT, CHS, NUPAS)
      • due diligence pillars (registration, sanctions, adverse media, bank, PEP)
      • last screening dates + provenance
  - Donors verify by visiting /trust/p/{slug} with the token, or
    via API. No auth required for read (token-gated). NGO controls
    expiry + revocation.
  - Every verification visit is logged to AuditChainEntry —
    NGOs can show donors who verified, when, from where.

Why this is differentiated:
  - Other platforms (Salesforce NPSP, Bonterra, Submittable) make NGOs
    re-prove capacity per donor. Each donor's portal is its own
    information silo. NGOs spend 2-4 weeks per major application
    just answering capacity questions.
  - The Passport pattern (verified once, accepted by many) is the
    inverse: donors trust the verification chain, NGOs reuse it.
  - The hash + chain + provenance is the trust mechanism.

Schema:
  - slug             — URL-safe public identifier (22 chars base64)
  - share_token      — opaque secret (32 chars) required for verification
  - snapshot_json    — frozen Trust Profile snapshot at publish time
  - snapshot_hash    — SHA256 of canonical snapshot (tamper-evidence)
  - status           — draft | active | revoked | expired
  - expires_at       — optional expiry (NULL = no expiry)
  - revoked_at       — when NGO revoked
  - revoked_reason   — free-text reason
  - verification_count — incremented on each token-validated view
"""

import hashlib
import json
import secrets
from datetime import datetime, timezone

from app.extensions import db
from app.utils.helpers import _json_load, _json_dump


class CapacityPassport(db.Model):
    __tablename__ = 'capacity_passports'
    __table_args__ = (
        db.Index('ix_passport_org', 'org_id'),
        db.Index('ix_passport_slug', 'slug'),
        db.Index('ix_passport_status', 'status'),
    )

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, db.ForeignKey('organizations.id'), nullable=False, index=True)

    slug = db.Column(db.String(32), nullable=False, unique=True)
    share_token = db.Column(db.String(64), nullable=False)

    snapshot_json = db.Column(db.Text, nullable=False)
    snapshot_hash = db.Column(db.String(64), nullable=False)

    status = db.Column(db.String(16), nullable=False, default='draft')
    # draft | active | revoked | expired

    expires_at = db.Column(db.DateTime, nullable=True)
    revoked_at = db.Column(db.DateTime, nullable=True)
    revoked_reason = db.Column(db.Text, nullable=True)

    verification_count = db.Column(db.Integer, default=0, nullable=False)
    last_verified_at = db.Column(db.DateTime, nullable=True)

    published_by_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    published_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    organization = db.relationship('Organization', backref=db.backref('capacity_passports', lazy='dynamic'))
    published_by = db.relationship('User', backref='published_passports')

    # --- Helpers ---
    @staticmethod
    def generate_slug() -> str:
        """22-char URL-safe slug (base64 of 16 bytes). ~96 bits entropy."""
        return secrets.token_urlsafe(16)

    @staticmethod
    def generate_share_token() -> str:
        """32-char URL-safe token (base64 of 24 bytes). ~192 bits entropy."""
        return secrets.token_urlsafe(24)

    @staticmethod
    def compute_snapshot_hash(snapshot: dict) -> str:
        canonical = json.dumps(snapshot, sort_keys=True, separators=(',', ':'), ensure_ascii=False)
        return hashlib.sha256(canonical.encode('utf-8')).hexdigest()

    def get_snapshot(self):
        return _json_load(self.snapshot_json) or {}

    def set_snapshot(self, value):
        self.snapshot_json = _json_dump(value)
        self.snapshot_hash = self.compute_snapshot_hash(value)

    def is_active(self) -> bool:
        if self.status != 'active':
            return False
        if self.expires_at and self.expires_at < datetime.now(timezone.utc):
            return False
        return True

    def share_url(self, base_url: str = '') -> str:
        """The public share URL (NGO sends this to donors).

        Uses query-param form because the frontend is statically exported,
        so dynamic-segment routes (`/trust/p/[slug]`) aren't generatable.
        """
        return f"{base_url}/trust/verify/?s={self.slug}&t={self.share_token}"

    def to_dict(self, *, include_token: bool = False):
        out = {
            'id': self.id,
            'org_id': self.org_id,
            'org_name': self.organization.name if self.organization else None,
            'slug': self.slug,
            'snapshot': self.get_snapshot(),
            'snapshot_hash': self.snapshot_hash,
            'status': self.status,
            'is_active': self.is_active(),
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'revoked_at': self.revoked_at.isoformat() if self.revoked_at else None,
            'revoked_reason': self.revoked_reason,
            'verification_count': self.verification_count,
            'last_verified_at': self.last_verified_at.isoformat() if self.last_verified_at else None,
            'published_by_user_id': self.published_by_user_id,
            'published_by_name': self.published_by.name if self.published_by else None,
            'published_at': self.published_at.isoformat() if self.published_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
        if include_token:
            out['share_token'] = self.share_token
            out['share_url'] = self.share_url()
        return out
