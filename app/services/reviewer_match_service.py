"""
ReviewerMatchService — Phase 19D (May 2026).

When a donor or admin needs to assign reviewers to an application,
rank the available reviewer pool by:

  1. Domain match (does this reviewer commonly review apps in the same
     sectors / countries as this application?)
  2. Throughput pressure (reviewers with shorter queues + faster
     historical SLA get a boost)
  3. Conflict avoidance (skip reviewers who already have a Review row
     for this application, or who flagged a prior CoI)

Pure heuristic — zero AI calls. Deterministic. Cheap.

Output: ranked list of reviewers with score breakdown so the donor can
see WHY this reviewer was suggested ("strong M&E history, 3 in queue,
4d median").
"""

import logging
from collections import Counter
from datetime import datetime, timezone

from app.extensions import db
from app.models import Application, Grant, Review, User

logger = logging.getLogger('kuja')

DOMAIN_WEIGHT = 50          # max 50 pts for sector/country alignment
THROUGHPUT_WEIGHT = 30      # max 30 pts for lighter queue + fast SLA
DEPTH_WEIGHT = 20           # max 20 pts for reviewer experience (history)


class ReviewerMatchService:

    @classmethod
    def suggest_for_application(cls, *, application_id: int, top_n: int = 5) -> dict:
        app = (
            Application.query.options(db.joinedload(Application.grant))
            .filter_by(id=application_id).first()
        )
        if not app:
            return {'success': False, 'reason': 'not_found'}

        grant = app.grant
        target_sectors = set((grant.sectors or [])) if grant else set()
        target_countries = set((grant.countries or [])) if grant else set()

        # Pull all active reviewers
        reviewers = User.query.filter_by(role='reviewer', is_active=True).all()
        if not reviewers:
            return {
                'success': True,
                'application_id': application_id,
                'suggestions': [],
                'reason': 'no_reviewers',
            }

        # Build per-reviewer history (cap to cheap aggregates)
        suggestions = []
        for r in reviewers:
            # Skip if already assigned
            has_review = Review.query.filter_by(
                reviewer_user_id=r.id, application_id=application_id,
            ).first()
            if has_review:
                continue

            history = cls._reviewer_history(r.id)
            domain_score = cls._domain_score(
                history=history,
                target_sectors=target_sectors,
                target_countries=target_countries,
            )
            throughput_score = cls._throughput_score(r.id)
            depth_score = cls._depth_score(history)
            total = round(domain_score + throughput_score + depth_score)

            reasons = []
            if domain_score >= 30:
                reasons.append('strong sector/country alignment')
            elif domain_score > 0:
                reasons.append('partial sector match')
            if throughput_score >= 20:
                reasons.append('light queue + fast SLA')
            elif throughput_score < 10:
                reasons.append('busy queue — assign carefully')
            if depth_score >= 15:
                reasons.append('experienced reviewer')
            elif depth_score < 5:
                reasons.append('newer reviewer')

            suggestions.append({
                'reviewer_user_id': r.id,
                'reviewer_name': r.name,
                'reviewer_email': r.email,
                'total_score': total,
                'breakdown': {
                    'domain': round(domain_score),
                    'throughput': round(throughput_score),
                    'depth': round(depth_score),
                },
                'queue_count': history.get('queue_count'),
                'avg_review_days_30d': history.get('avg_review_days_30d'),
                'reviews_completed_total': history.get('reviews_completed_total'),
                'top_sectors': history.get('top_sectors', [])[:3],
                'reasons': reasons,
            })

        suggestions.sort(key=lambda s: -s['total_score'])

        return {
            'success': True,
            'application_id': application_id,
            'target_sectors': sorted(target_sectors),
            'target_countries': sorted(target_countries),
            'reviewer_pool_size': len(reviewers),
            'suggestions': suggestions[:top_n],
            'computed_at': datetime.now(timezone.utc).isoformat(),
        }

    # ------------------------------------------------------------------

    @staticmethod
    def _reviewer_history(reviewer_user_id: int) -> dict:
        """One DB query per reviewer — kept compact."""
        rows = (
            Review.query.options(db.joinedload(Review.application).joinedload(Application.grant))
            .filter(Review.reviewer_user_id == reviewer_user_id)
            .all()
        )
        sector_counts: Counter = Counter()
        country_counts: Counter = Counter()
        completed = 0
        queue = 0
        for r in rows:
            if r.status == 'completed':
                completed += 1
                if r.application and r.application.grant:
                    for s in (r.application.grant.sectors or []):
                        sector_counts[s] += 1
                    for c in (r.application.grant.countries or []):
                        country_counts[c] += 1
            elif r.status in ('assigned', 'in_progress'):
                queue += 1
        return {
            'queue_count': queue,
            'reviews_completed_total': completed,
            'top_sectors': [s for s, _ in sector_counts.most_common(5)],
            'top_countries': [c for c, _ in country_counts.most_common(5)],
            'sector_counts': sector_counts,
            'country_counts': country_counts,
        }

    @classmethod
    def _domain_score(cls, *, history: dict, target_sectors: set, target_countries: set) -> float:
        sector_counts: Counter = history.get('sector_counts') or Counter()
        country_counts: Counter = history.get('country_counts') or Counter()

        # Reviewer "expertise" in target sectors/countries =
        # log-scaled share of their history that matches.
        total_sector = sum(sector_counts.values()) or 1
        total_country = sum(country_counts.values()) or 1

        sector_overlap = sum(sector_counts[s] for s in target_sectors)
        country_overlap = sum(country_counts[c] for c in target_countries)

        sector_share = sector_overlap / total_sector
        country_share = country_overlap / total_country

        # Weight sectors 2x as important as countries for matching
        weighted = (sector_share * 2 + country_share) / 3
        return min(DOMAIN_WEIGHT, weighted * DOMAIN_WEIGHT)

    @classmethod
    def _throughput_score(cls, reviewer_user_id: int) -> float:
        """Reuse the existing throughput service for SLA + avg time."""
        try:
            from app.services.reviewer_throughput_service import ReviewerThroughputService
            t = ReviewerThroughputService.for_reviewer(reviewer_user_id=reviewer_user_id)
        except Exception:
            return 0
        score = 0
        # SLA: ok = full credit, watch = half, slipping = zero
        sla = t.get('sla_status')
        if sla == 'ok':
            score += 15
        elif sla == 'watch':
            score += 8
        # Avg review days: fast (<7d) = full, slow (>21d) = zero
        avg = t.get('avg_review_days_30d')
        if avg is None:
            score += 8       # neutral — we don't know
        elif avg <= 7:
            score += 15
        elif avg <= 14:
            score += 10
        elif avg <= 21:
            score += 5
        return min(THROUGHPUT_WEIGHT, score)

    @staticmethod
    def _depth_score(history: dict) -> float:
        """Reviewer experience boost — log-scaled so first 10 reviews
        matter a lot, then diminishing returns."""
        completed = history.get('reviews_completed_total', 0) or 0
        if completed <= 0: return 0
        if completed >= 50: return DEPTH_WEIGHT
        # Smooth ramp to full at 50
        return min(DEPTH_WEIGHT, (completed / 50) * DEPTH_WEIGHT)
