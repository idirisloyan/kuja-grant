"""
OrgMergeService — Phase 17D (PMO transfer: donor merge tool).

Two donor orgs sometimes get created for the same real-world funder
(spelling variations, signup before staff knew they had an account).
This service reparents every relationship onto a kept org and deletes
the duplicate, with a name-typed confirmation gate at the route layer.

Reparent surface (donor org duplicates):
  - grants.donor_org_id
  - users.org_id
  - watchlist_items where target_kind='organization' and target_id=dup
  - status_signals on the org
  - audit_chain entries (subject_kind='org' → kept_id)
  - notification_preferences (left alone — they're per-user)

NGO merges are NOT supported in this push (different relationship
shape; do separately when needed). Service raises if asked.

Safety:
  - Admin-only (route layer enforces)
  - Both orgs must be donor type
  - kept_id != dup_id
  - Returns structured report so the UI can show "moved 12 grants,
    3 users, 1 watchlist item"
"""

import logging

from sqlalchemy import text

from app.extensions import db
from app.models import (
    AuditChainEntry, Grant, Organization, StatusSignal,
    User, WatchlistItem,
)

logger = logging.getLogger('kuja')


class OrgMergeService:

    @classmethod
    def merge(cls, *, kept_id: int, dup_id: int, actor_email: str | None) -> dict:
        if kept_id == dup_id:
            return {'success': False, 'error': 'kept == dup'}
        kept = db.session.get(Organization, kept_id)
        dup = db.session.get(Organization, dup_id)
        if not kept or not dup:
            return {'success': False, 'error': 'org not found'}
        if kept.org_type != 'donor' or dup.org_type != 'donor':
            return {'success': False,
                    'error': 'donor-org merge only in this version'}

        report = {
            'kept_id': kept.id,
            'kept_name': kept.name,
            'dup_id': dup.id,
            'dup_name': dup.name,
            'grants_moved': 0,
            'users_moved': 0,
            'watchlist_moved': 0,
            'signals_moved': 0,
            'audit_chain_reparented': 0,
        }

        try:
            # 1. Reparent grants
            grants_q = Grant.query.filter_by(donor_org_id=dup.id).all()
            for g in grants_q:
                g.donor_org_id = kept.id
            report['grants_moved'] = len(grants_q)

            # 2. Reparent users
            users_q = User.query.filter_by(org_id=dup.id).all()
            for u in users_q:
                u.org_id = kept.id
            report['users_moved'] = len(users_q)

            # 3. Watchlist items
            w_q = WatchlistItem.query.filter_by(
                kind='organization', target_id=dup.id,
            ).all()
            for w in w_q:
                # Avoid duplicate-key on the kept org
                already = WatchlistItem.query.filter_by(
                    user_id=w.user_id, kind='organization', target_id=kept.id,
                ).first()
                if already:
                    db.session.delete(w)
                else:
                    w.target_id = kept.id
            report['watchlist_moved'] = len(w_q)

            # 4. Status signals
            s_q = StatusSignal.query.filter_by(
                subject_kind='organization', subject_id=dup.id,
            ).all()
            for s in s_q:
                s.subject_id = kept.id
            report['signals_moved'] = len(s_q)

            # 5. Audit chain entries — historical, just reparent subject_id
            # (we never rewrite payload_hash; the chain still verifies because
            # we use UPDATE rather than INSERT and the hash is over the
            # original payload, not the current row).
            ac_count = db.session.execute(
                text("""
                    UPDATE audit_chain SET subject_id = :kept
                    WHERE subject_kind = 'org' AND subject_id = :dup
                """),
                {"kept": kept.id, "dup": dup.id},
            ).rowcount or 0
            report['audit_chain_reparented'] = ac_count

            # 6. Delete the duplicate org
            db.session.delete(dup)
            db.session.commit()

            # 7. Write a high-signal audit anchor for the merge itself
            try:
                AuditChainEntry.append(
                    action='org.merge',
                    actor_email=actor_email,
                    subject_kind='org', subject_id=kept.id,
                    details={
                        'kept_id': kept.id, 'kept_name': kept.name,
                        'dup_id': dup.id, 'dup_name': dup.name,
                        **{k: v for k, v in report.items()
                           if k not in ('kept_id', 'dup_id', 'kept_name', 'dup_name')},
                    },
                )
            except Exception as e:
                logger.warning(f'org merge audit anchor failed: {e}')

            report['success'] = True
            return report

        except Exception as e:
            logger.exception(f'org merge failed: {e}')
            db.session.rollback()
            return {'success': False, 'error': str(e)[:200], **report}
