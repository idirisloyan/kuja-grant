"""
PanelCalibrationService — Phase 21A (May 2026).

When two or more reviewers have scored the same application, compute
the variance + flag divergent reviewers so the donor can intervene
(e.g. ask a third reviewer, request rationale, or break the tie).

Surfaces:
  - reviewer_count: how many completed reviews on this app
  - mean_score / median_score / spread (max - min)
  - std_dev: standard deviation of overall scores
  - calibration_status: 'tight' | 'normal' | 'divergent'
      tight: spread <= 8
      normal: spread <= 20
      divergent: spread > 20
  - per_reviewer: [{reviewer_id, name, score, deviation_from_mean}]
  - outliers: list of reviewer_ids whose score is > 1.0 std_dev from mean

Quiet on single reviewer: returns calibration_status='single' so the UI
shows "no calibration possible with 1 reviewer".

Pure math, zero AI calls. Cost = 1 query per request.
"""

import logging
import statistics
from datetime import datetime, timezone

from app.extensions import db
from app.models import Application, Review, User

logger = logging.getLogger('kuja')


class PanelCalibrationService:

    @classmethod
    def for_application(cls, *, application_id: int) -> dict:
        app = db.session.get(Application, application_id)
        if not app:
            return {'success': False, 'reason': 'not_found'}

        reviews = (
            Review.query
            .filter_by(application_id=application_id, status='completed')
            .filter(Review.overall_score.isnot(None))
            .all()
        )

        if not reviews:
            return {
                'success': True,
                'application_id': application_id,
                'reviewer_count': 0,
                'calibration_status': 'no_reviews',
                'per_reviewer': [],
                'outliers': [],
            }

        if len(reviews) == 1:
            r = reviews[0]
            reviewer = db.session.get(User, r.reviewer_user_id)
            return {
                'success': True,
                'application_id': application_id,
                'reviewer_count': 1,
                'mean_score': round(r.overall_score, 1),
                'median_score': round(r.overall_score, 1),
                'spread': 0,
                'std_dev': 0,
                'calibration_status': 'single',
                'per_reviewer': [{
                    'reviewer_user_id': r.reviewer_user_id,
                    'reviewer_name': reviewer.name if reviewer else None,
                    'score': round(r.overall_score, 1),
                    'deviation_from_mean': 0,
                    'is_outlier': False,
                }],
                'outliers': [],
            }

        # Two or more reviewers — real calibration
        scores = [float(r.overall_score) for r in reviews]
        mean_score = sum(scores) / len(scores)
        median_score = statistics.median(scores)
        spread = max(scores) - min(scores)
        std_dev = statistics.pstdev(scores) if len(scores) > 1 else 0.0

        if spread <= 8:
            status = 'tight'
        elif spread <= 20:
            status = 'normal'
        else:
            status = 'divergent'

        # Outliers: > 1.0 std_dev from mean (and stddev > 3 to avoid noise)
        per_reviewer = []
        outliers = []
        for r in reviews:
            reviewer = db.session.get(User, r.reviewer_user_id)
            dev = float(r.overall_score) - mean_score
            is_outlier = std_dev > 3 and abs(dev) >= std_dev
            per_reviewer.append({
                'reviewer_user_id': r.reviewer_user_id,
                'reviewer_name': reviewer.name if reviewer else None,
                'score': round(float(r.overall_score), 1),
                'deviation_from_mean': round(dev, 1),
                'is_outlier': is_outlier,
            })
            if is_outlier:
                outliers.append(r.reviewer_user_id)

        # Sort per_reviewer by score descending so the donor scans high → low
        per_reviewer.sort(key=lambda p: -p['score'])

        return {
            'success': True,
            'application_id': application_id,
            'reviewer_count': len(reviews),
            'mean_score': round(mean_score, 1),
            'median_score': round(median_score, 1),
            'spread': round(spread, 1),
            'std_dev': round(std_dev, 2),
            'calibration_status': status,
            'per_reviewer': per_reviewer,
            'outliers': outliers,
            'computed_at': datetime.now(timezone.utc).isoformat(),
        }
