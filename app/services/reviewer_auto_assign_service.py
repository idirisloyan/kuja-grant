"""
ReviewerAutoAssignService — Phase 24A (May 2026).

When an application is submitted (or a reviewer-light grant publishes),
auto-create Review rows for the top-N reviewers by ReviewerMatchService
ranking. Replaces the manual "pick 3 reviewers from a dropdown" step
that today is the most common reason apps sit in queue for days.

Discipline:
  - Top-N default 3, capped at 5 (avoid panel inflation)
  - Skip reviewers already assigned to this application
  - Skip reviewers whose throughput is 'slipping' UNLESS the pool has
    fewer than N healthy reviewers (then fill from slipping to keep
    the panel staffed)
  - Idempotent: re-running does NOT create duplicate Review rows
  - Writes an audit-chain anchor (reviewer.auto_assigned) for provenance
  - Best-effort: any one assignment failure doesn't abort the rest

Use cases:
  1. Manual: donor opens an application and clicks "Auto-assign 3
     reviewers" → fires this service
  2. Automatic: hooked into Application status transition to 'submitted'
     so panels are pre-populated by the time the donor opens the app
"""

import logging
from datetime import datetime, timezone

from app.extensions import db
from app.models import Application, Review

logger = logging.getLogger('kuja')

DEFAULT_PANEL_SIZE = 3
MAX_PANEL_SIZE = 5


class ReviewerAutoAssignService:

    @classmethod
    def run(cls, *, application_id: int, panel_size: int = DEFAULT_PANEL_SIZE,
            actor_email: str | None = None) -> dict:
        """Returns a structured assignment report."""
        application = db.session.get(Application, application_id)
        if not application:
            return {'ok': False, 'reason': 'application_not_found'}

        panel_size = max(1, min(MAX_PANEL_SIZE, int(panel_size)))

        # Reuse Phase 19D ranking service
        from app.services.reviewer_match_service import ReviewerMatchService
        ranked = ReviewerMatchService.suggest_for_application(
            application_id=application_id, top_n=panel_size * 2,  # buffer for skips
        )
        if not ranked or not ranked.get('success'):
            return {'ok': False, 'reason': 'no_match_service'}

        suggestions = ranked.get('suggestions') or []
        if not suggestions:
            return {'ok': True, 'application_id': application_id,
                    'assigned': 0, 'reason': 'no_reviewers_in_pool'}

        # Already-assigned reviewers we skip
        existing = (
            Review.query
            .filter_by(application_id=application_id)
            .with_entities(Review.reviewer_user_id).all()
        )
        already_assigned = {r[0] for r in existing}

        # Tier the suggestions: healthy panel first, then slipping as fallback
        healthy = [s for s in suggestions
                   if s['reviewer_user_id'] not in already_assigned
                   and 'busy queue — assign carefully' not in (s.get('reasons') or [])]
        slipping = [s for s in suggestions
                    if s['reviewer_user_id'] not in already_assigned
                    and 'busy queue — assign carefully' in (s.get('reasons') or [])]

        # Pick healthy first up to panel_size; fill from slipping if needed
        picks = healthy[:panel_size]
        if len(picks) < panel_size:
            picks += slipping[:panel_size - len(picks)]
        # Dedup paranoia
        seen_ids = set()
        unique_picks = []
        for p in picks:
            rid = p['reviewer_user_id']
            if rid in seen_ids or rid in already_assigned:
                continue
            seen_ids.add(rid)
            unique_picks.append(p)

        assignments = []
        for p in unique_picks:
            try:
                rev = Review(
                    application_id=application_id,
                    reviewer_user_id=p['reviewer_user_id'],
                    status='assigned',
                )
                db.session.add(rev)
                db.session.flush()
                assignments.append({
                    'reviewer_user_id': p['reviewer_user_id'],
                    'reviewer_name': p.get('reviewer_name'),
                    'review_id': rev.id,
                    'match_score': p.get('total_score'),
                    'reasons': p.get('reasons', []),
                })
            except Exception as e:
                logger.warning(
                    f'auto-assign failed reviewer={p["reviewer_user_id"]} '
                    f'app={application_id}: {e}'
                )

        if assignments:
            try:
                db.session.commit()
            except Exception as e:
                db.session.rollback()
                logger.exception(f'auto-assign commit failed app={application_id}: {e}')
                return {'ok': False, 'reason': 'commit_failed', 'error': str(e)[:200]}

        # Audit-chain anchor
        try:
            from app.models import AuditChainEntry
            AuditChainEntry.append(
                action='reviewer.auto_assigned',
                actor_email=actor_email,
                subject_kind='application', subject_id=application_id,
                details={
                    'panel_size_requested': panel_size,
                    'assigned': len(assignments),
                    'reviewer_ids': [a['reviewer_user_id'] for a in assignments],
                    'already_assigned': len(already_assigned),
                },
            )
        except Exception as e:
            logger.warning(f'auto-assign audit anchor failed: {e}')

        return {
            'ok': True,
            'application_id': application_id,
            'panel_size_requested': panel_size,
            'assigned': len(assignments),
            'already_assigned': len(already_assigned),
            'assignments': assignments,
            'pool_size_before_filter': len(suggestions),
            'computed_at': datetime.now(timezone.utc).isoformat(),
        }
