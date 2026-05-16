"""
ScoreBreakdownService — Phase 22A (May 2026).

Decomposes the human-review score on an application into per-criterion
contributions so the NGO can SEE why they got the overall score they
did. Today the NGO just sees a single overall number; this exposes:

  - For each criterion in the grant: mean score across reviewers, count
    of reviewers who scored it, weight, weighted contribution to overall
  - The reviewer comments per criterion (if recorded)
  - The strongest + weakest 2 criteria so the NGO immediately knows
    where to focus on the next submission

Privacy: reviewer identities + which-reviewer-said-what are NOT exposed
to the NGO. Only mean per criterion + aggregated comments.

Pure SQL + math. Zero AI calls.
"""

import logging
from collections import defaultdict

from app.extensions import db
from app.models import Application, Grant, Review

logger = logging.getLogger('kuja')


class ScoreBreakdownService:

    @classmethod
    def for_application(cls, *, application_id: int, viewer_role: str) -> dict:
        app = (
            Application.query.options(db.joinedload(Application.grant))
            .filter_by(id=application_id).first()
        )
        if not app or not app.grant:
            return {'success': False, 'reason': 'not_found'}

        criteria = app.grant.get_criteria() if hasattr(app.grant, 'get_criteria') else []
        if not criteria:
            return {
                'success': True,
                'application_id': application_id,
                'criteria_breakdown': [],
                'overall_human_score': None,
                'reason': 'no_criteria',
            }

        reviews = (
            Review.query
            .filter_by(application_id=application_id, status='completed')
            .all()
        )

        # If no reviews yet, return the structure but with empty per-criterion data
        if not reviews:
            return {
                'success': True,
                'application_id': application_id,
                'criteria_breakdown': [{
                    'key': str(c.get('key') or c.get('id') or '?'),
                    'label': c.get('label') or '?',
                    'weight': c.get('weight') or 0,
                    'mean_score': None,
                    'reviewer_count': 0,
                    'weighted_contribution': None,
                    'comments': [],
                } for c in criteria if isinstance(c, dict)],
                'overall_human_score': None,
                'overall_human_score_computed': None,
                'reviewer_count': 0,
                'strongest_criteria': [],
                'weakest_criteria': [],
            }

        # Aggregate per-criterion across reviewers
        per_crit_scores: dict[str, list[float]] = defaultdict(list)
        per_crit_comments: dict[str, list[str]] = defaultdict(list)
        for r in reviews:
            scores = r.get_scores() or {}
            comments = r.get_comments() or {}
            for key, val in scores.items():
                try:
                    n = float(val)
                    if 0 <= n <= 100:
                        per_crit_scores[str(key)].append(n)
                except (TypeError, ValueError):
                    continue
            for key, c in comments.items():
                if isinstance(c, str) and c.strip():
                    # NGO-visible: strip reviewer-identifying language at
                    # composition time; here we just truncate to 400 chars
                    per_crit_comments[str(key)].append(c.strip()[:400])

        # Build the breakdown
        breakdown = []
        weighted_sum = 0
        weight_used = 0
        for c in criteria:
            if not isinstance(c, dict):
                continue
            key = str(c.get('key') or c.get('id') or '?')
            label = c.get('label') or '?'
            try:
                weight = float(c.get('weight') or 0)
            except (TypeError, ValueError):
                weight = 0
            vals = per_crit_scores.get(key, [])
            mean = round(sum(vals) / len(vals), 1) if vals else None
            contribution = round((mean * weight) / 100, 1) if (mean is not None and weight) else None
            if mean is not None and weight:
                weighted_sum += mean * weight
                weight_used += weight
            breakdown.append({
                'key': key,
                'label': label,
                'weight': weight,
                'mean_score': mean,
                'reviewer_count': len(vals),
                'weighted_contribution': contribution,
                'comments': per_crit_comments.get(key, []),
            })

        overall_computed = (
            round(weighted_sum / weight_used, 1)
            if weight_used else None
        )

        # Strongest + weakest from criteria that have scores
        scored = [b for b in breakdown if b['mean_score'] is not None]
        scored_sorted = sorted(scored, key=lambda b: b['mean_score'])
        weakest = scored_sorted[:2]
        strongest = list(reversed(scored_sorted[-2:]))

        # Don't expose comments to NGOs by default (privacy on reviewer style).
        # Donor + reviewer + admin see all comments; NGO sees them aggregated.
        if viewer_role == 'ngo':
            # NGO sees comments but tagged as "from review panel" — no per-reviewer attribution
            for b in breakdown:
                # Cap to 3 per criterion to keep UI clean
                b['comments'] = b['comments'][:3]
        # for donor/admin/reviewer we keep up to 6 per criterion
        else:
            for b in breakdown:
                b['comments'] = b['comments'][:6]

        return {
            'success': True,
            'application_id': application_id,
            'criteria_breakdown': breakdown,
            'overall_human_score': round(float(app.human_score), 1) if app.human_score is not None else None,
            'overall_human_score_computed': overall_computed,
            'reviewer_count': len(reviews),
            'strongest_criteria': [b['key'] for b in strongest],
            'weakest_criteria': [b['key'] for b in weakest],
        }
