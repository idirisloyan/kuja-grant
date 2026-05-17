"""
UserFeedbackService — Phase 31A (May 2026).

Record + aggregate NPS-style 1-question micro-survey responses. Surface
in the admin metrics dashboard alongside behavioural data.
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import func

from app.extensions import db
from app.models import UserFeedback
from app.models.user_feedback import nps_bucket

logger = logging.getLogger('kuja')


ALLOWED_SURFACES = {
    'application_submit', 'report_submit', 'chat_thread_close',
    'readiness_check', 'reviewer_summary', 'donor_decision',
}


class UserFeedbackService:

    @classmethod
    def record(cls, *, user, surface: str, score: int,
               related_kind: str | None = None,
               related_id: int | None = None,
               comment: str | None = None) -> dict:
        """Persist a feedback row. Upserts on (user, surface, related_kind,
        related_id) so the same user can't double-submit for the same
        completion. Returns {'ok': bool, 'created': bool, ...}."""
        if surface not in ALLOWED_SURFACES:
            return {'ok': False, 'reason': 'surface_not_allowed',
                    'allowed': sorted(ALLOWED_SURFACES)}
        try:
            score = int(score)
        except (TypeError, ValueError):
            return {'ok': False, 'reason': 'score_must_be_int'}
        if not (0 <= score <= 10):
            return {'ok': False, 'reason': 'score_out_of_range'}

        comment = (comment or '').strip()
        if len(comment) > 500:
            comment = comment[:500]

        # Upsert
        existing = UserFeedback.query.filter_by(
            user_id=user.id,
            surface=surface,
            related_kind=related_kind,
            related_id=related_id,
        ).first()

        try:
            if existing:
                existing.score = score
                existing.comment = comment or existing.comment
                existing.language = getattr(user, 'language', None)
                db.session.commit()
                return {'ok': True, 'created': False,
                        'feedback': existing.to_dict()}

            fb = UserFeedback(
                user_id=user.id,
                org_id=getattr(user, 'org_id', None),
                role=getattr(user, 'role', None),
                language=getattr(user, 'language', None),
                surface=surface,
                related_kind=related_kind,
                related_id=related_id,
                score=score,
                comment=comment or None,
            )
            db.session.add(fb)
            db.session.commit()
            return {'ok': True, 'created': True, 'feedback': fb.to_dict()}
        except Exception as e:
            db.session.rollback()
            logger.exception(f'user-feedback record failed: {e}')
            return {'ok': False, 'reason': 'persist_failed',
                    'error': str(e)[:200]}

    # ------------------------------------------------------------------
    # Aggregations for the admin metrics dashboard
    # ------------------------------------------------------------------

    @classmethod
    def nps_summary(cls, *, days: int = 30) -> dict:
        """NPS calc + per-surface breakdown over trailing window.

        NPS = % promoters (9-10) − % detractors (0-6). Range −100 to +100.
        Returns total responses + score histogram + per-surface NPS.
        """
        since = datetime.now(timezone.utc) - timedelta(days=days)
        rows = (
            UserFeedback.query
            .filter(UserFeedback.created_at >= since)
            .with_entities(UserFeedback.surface, UserFeedback.score,
                           UserFeedback.language)
            .all()
        )

        if not rows:
            return {
                'window_days': days,
                'total_responses': 0,
                'overall_nps': None,
                'by_surface': [],
                'by_language': {},
                'histogram': {str(s): 0 for s in range(11)},
            }

        # Overall
        scores = [s for _, s, _ in rows]
        promoters = sum(1 for s in scores if s >= 9)
        passives = sum(1 for s in scores if 7 <= s <= 8)
        detractors = sum(1 for s in scores if s <= 6)
        n = len(scores)
        overall_nps = round((promoters - detractors) / n * 100, 1)

        # Histogram (0..10)
        histogram = {str(i): 0 for i in range(11)}
        for s in scores:
            histogram[str(s)] += 1

        # Per surface
        surface_groups: dict[str, list[int]] = {}
        for surface, score, _ in rows:
            surface_groups.setdefault(surface, []).append(score)
        by_surface = []
        for surface, group in sorted(surface_groups.items()):
            p = sum(1 for s in group if s >= 9)
            d = sum(1 for s in group if s <= 6)
            by_surface.append({
                'surface': surface,
                'responses': len(group),
                'nps': round((p - d) / len(group) * 100, 1),
                'avg_score': round(sum(group) / len(group), 2),
            })

        # Per language
        lang_groups: dict[str, list[int]] = {}
        for _, score, lang in rows:
            lang_groups.setdefault(lang or 'unknown', []).append(score)
        by_language = {}
        for lang, group in lang_groups.items():
            p = sum(1 for s in group if s >= 9)
            d = sum(1 for s in group if s <= 6)
            by_language[lang] = {
                'responses': len(group),
                'nps': round((p - d) / len(group) * 100, 1),
            }

        return {
            'window_days': days,
            'total_responses': n,
            'overall_nps': overall_nps,
            'promoters': promoters,
            'passives': passives,
            'detractors': detractors,
            'by_surface': by_surface,
            'by_language': by_language,
            'histogram': histogram,
        }

    @classmethod
    def recent_comments(cls, *, limit: int = 20) -> list[dict]:
        rows = (
            UserFeedback.query
            .filter(UserFeedback.comment.isnot(None))
            .order_by(UserFeedback.created_at.desc())
            .limit(limit).all()
        )
        return [
            {
                'surface': r.surface,
                'score': r.score,
                'bucket': nps_bucket(r.score),
                'comment': r.comment,
                'language': r.language,
                'role': r.role,
                'created_at': r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]
