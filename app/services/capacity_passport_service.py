"""
CapacityPassportService — Phase 1 (May 2026 truth-in-claims)
============================================================

Publishes, verifies, and revokes Capacity Passports. The passport is a
share-tokenised snapshot of an NGO's Trust Profile that any donor can
verify without going through the donor portal.

Operations:
  - publish(org_id, user, *, expires_at=None) → CapacityPassport
        Snapshots the current Trust Profile, generates slug + token,
        writes a hash-chain audit entry, returns the passport.

  - verify(slug, token) → (passport_dict | None, reason)
        Validates token, checks status/expiry, increments
        verification_count, writes an audit chain entry, returns the
        passport snapshot. Reason explains failure ('not_found',
        'invalid_token', 'revoked', 'expired').

  - revoke(passport_id, user, reason) → CapacityPassport
        Sets status='revoked', stamps revoked_at + reason, writes
        an audit row. Idempotent.

The audit-chain integration means every passport publish/verify/revoke
event is tamper-evident — donors can later challenge "did this
verification happen?" and we replay the hash chain to prove it.
"""

import logging
from datetime import datetime, timezone
from secrets import compare_digest

from app.extensions import db
from app.models import CapacityPassport, Organization, AuditChainEntry
from app.services.trust_profile_service import TrustProfileService

logger = logging.getLogger('kuja')


class CapacityPassportService:

    @classmethod
    def publish(
        cls,
        *,
        org_id: int,
        user,    # current_user or admin
        expires_at: datetime | None = None,
    ) -> CapacityPassport | None:
        """Snapshot the org's current Trust Profile + publish a passport.

        If an active passport already exists, it is revoked first
        (one-active-passport-at-a-time policy keeps verification
        deterministic). The new passport supersedes.
        """
        org = db.session.get(Organization, org_id)
        if not org:
            return None

        snapshot = TrustProfileService.build(org_id)
        if not snapshot:
            return None

        # Revoke any existing active passport
        existing = (
            CapacityPassport.query
            .filter_by(org_id=org_id, status='active')
            .all()
        )
        for old in existing:
            old.status = 'revoked'
            old.revoked_at = datetime.now(timezone.utc)
            old.revoked_reason = 'Superseded by new publish.'

        passport = CapacityPassport(
            org_id=org_id,
            slug=CapacityPassport.generate_slug(),
            share_token=CapacityPassport.generate_share_token(),
            status='active',
            expires_at=expires_at,
            published_by_user_id=getattr(user, 'id', None),
            published_at=datetime.now(timezone.utc),
        )
        # Snapshot now (also computes hash)
        snapshot_for_passport = {
            **snapshot,
            'passport_meta': {
                'published_at': passport.published_at.isoformat(),
                'org_id': org_id,
                'org_name': org.name,
                'country': org.country,
                'expires_at': expires_at.isoformat() if expires_at else None,
            },
        }
        passport.set_snapshot(snapshot_for_passport)

        db.session.add(passport)
        db.session.commit()

        # Hash-chain audit
        try:
            AuditChainEntry.append(
                action='capacity_passport.publish',
                actor_email=getattr(user, 'email', None),
                subject_kind='capacity_passport',
                subject_id=passport.id,
                details={
                    'org_id': org_id,
                    'slug': passport.slug,
                    'snapshot_hash': passport.snapshot_hash,
                    'overall_score': snapshot.get('overall', {}).get('score'),
                    'overall_status': snapshot.get('overall', {}).get('status'),
                    'expires_at': expires_at.isoformat() if expires_at else None,
                },
            )
        except Exception as e:
            logger.warning(f"Audit chain append failed for passport publish: {e}")

        return passport

    @classmethod
    def verify(cls, slug: str, token: str, *, verifier_label: str | None = None) -> tuple[dict | None, str]:
        """Validate a passport view request.

        Returns (passport_dict, '') on success, or (None, reason) on failure.
        Increments verification_count + writes audit row on success.

        verifier_label: optional free-text label written to the audit row
        identifying the donor making the request (from a header or query
        param). NOT used for security; purely for audit clarity.
        """
        passport = CapacityPassport.query.filter_by(slug=slug).first()
        if not passport:
            return None, 'not_found'

        # Constant-time token comparison
        if not compare_digest(passport.share_token, token or ''):
            return None, 'invalid_token'

        if passport.status == 'revoked':
            return None, 'revoked'
        if passport.expires_at and passport.expires_at < datetime.now(timezone.utc):
            # Auto-mark expired on the fly
            passport.status = 'expired'
            db.session.commit()
            return None, 'expired'
        if passport.status != 'active':
            return None, passport.status

        # Increment + audit
        passport.verification_count = (passport.verification_count or 0) + 1
        passport.last_verified_at = datetime.now(timezone.utc)
        db.session.commit()

        try:
            AuditChainEntry.append(
                action='capacity_passport.verify',
                actor_email=verifier_label or 'anonymous',
                subject_kind='capacity_passport',
                subject_id=passport.id,
                details={
                    'slug': slug,
                    'verifier_label': verifier_label,
                    'verification_count': passport.verification_count,
                    'snapshot_hash': passport.snapshot_hash,
                },
            )
        except Exception as e:
            logger.warning(f"Audit chain append failed for passport verify: {e}")

        # Return the snapshot but NOT the share_token (only the publishing NGO sees that)
        return passport.to_dict(include_token=False), ''

    @classmethod
    def revoke(cls, passport_id: int, *, user, reason: str | None = None) -> CapacityPassport | None:
        passport = db.session.get(CapacityPassport, passport_id)
        if not passport:
            return None
        if passport.status == 'revoked':
            return passport   # idempotent

        passport.status = 'revoked'
        passport.revoked_at = datetime.now(timezone.utc)
        passport.revoked_reason = reason
        db.session.commit()

        try:
            AuditChainEntry.append(
                action='capacity_passport.revoke',
                actor_email=getattr(user, 'email', None),
                subject_kind='capacity_passport',
                subject_id=passport.id,
                details={'reason': reason},
            )
        except Exception as e:
            logger.warning(f"Audit chain append failed for passport revoke: {e}")

        return passport
