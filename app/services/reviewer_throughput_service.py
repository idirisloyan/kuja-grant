"""
ReviewerThroughputService — Phase 16E (May 2026).

Per-reviewer dashboard metrics so they can see their own SLA position +
where the queue stands. Helps reviewers self-pace and helps donors
spot reviewers who are slipping before deadlines miss.

Metrics:
  - queue_count: assigned + in_progress reviews owned by this reviewer
  - completed_last_30d: count of reviews completed in the last 30 days
  - avg_review_days_30d: mean days from assigned → completed (last 30d)
  - oldest_assigned_days: how long the oldest unfinished assignment has
    been sitting in their queue (drives the "slipping" signal)
  - sla_status: 'ok' | 'watch' | 'slipping'
  - burn_down: per-day completion count over the last 14 days

SLA discipline:
  - ok: nothing in queue older than 7 days
  - watch: oldest assigned 7-14 days
  - slipping: oldest assigned > 14 days

Computation is single-user-scoped; admin can pass ?reviewer_id=N to
inspect any reviewer.
"""

import logging
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from app.extensions import db
from app.models import Review

logger = logging.getLogger('kuja')


class ReviewerThroughputService:

    @classmethod
    def for_reviewer(cls, *, reviewer_user_id: int) -> dict:
        now = datetime.now(timezone.utc)
        since_30 = now - timedelta(days=30)
        since_14 = now - timedelta(days=14)

        # Open queue
        open_q = Review.query.filter(
            Review.reviewer_user_id == reviewer_user_id,
            Review.status.in_(('assigned', 'in_progress')),
        ).all()

        queue_count = len(open_q)
        oldest = None
        if open_q:
            oldest_dt = min(r.created_at for r in open_q if r.created_at)
            if oldest_dt:
                # Treat both sides as offset-aware
                if oldest_dt.tzinfo is None:
                    oldest_dt = oldest_dt.replace(tzinfo=timezone.utc)
                oldest = (now - oldest_dt).days

        sla_status = (
            'slipping' if oldest is not None and oldest > 14 else
            'watch'    if oldest is not None and oldest > 7  else
            'ok'
        )

        # Completed window
        completed_recent = Review.query.filter(
            Review.reviewer_user_id == reviewer_user_id,
            Review.status == 'completed',
            Review.completed_at.isnot(None),
            Review.completed_at >= since_30,
        ).all()
        completed_count = len(completed_recent)

        # Avg time-to-complete in days
        deltas = []
        for r in completed_recent:
            if not (r.created_at and r.completed_at):
                continue
            ca = r.created_at if r.created_at.tzinfo else r.created_at.replace(tzinfo=timezone.utc)
            cb = r.completed_at if r.completed_at.tzinfo else r.completed_at.replace(tzinfo=timezone.utc)
            if cb >= ca:
                d = (cb - ca).total_seconds() / 86400.0
                if 0 <= d <= 365:
                    deltas.append(d)
        avg_days = round(sum(deltas) / len(deltas), 1) if deltas else None

        # 14-day burn-down (count completed per day)
        burn_by_day = defaultdict(int)
        for r in Review.query.filter(
            Review.reviewer_user_id == reviewer_user_id,
            Review.status == 'completed',
            Review.completed_at.isnot(None),
            Review.completed_at >= since_14,
        ).all():
            key = r.completed_at.date().isoformat()
            burn_by_day[key] += 1
        # Build a dense series so the chart renders zeros too
        burn_down = []
        for i in range(14, -1, -1):
            d = (date.today() - timedelta(days=i))
            iso = d.isoformat()
            burn_down.append({
                'date': iso,
                'label': d.strftime('%d %b'),
                'count': burn_by_day.get(iso, 0),
            })

        return {
            'success': True,
            'reviewer_user_id': reviewer_user_id,
            'queue_count': queue_count,
            'oldest_assigned_days': oldest,
            'sla_status': sla_status,
            'completed_last_30d': completed_count,
            'avg_review_days_30d': avg_days,
            'burn_down_14d': burn_down,
            'computed_at': now.isoformat(),
        }
