"""
PastWinsService — Phase 19B (May 2026).

For an NGO writing a new application, surface the best-matching response
from their own past AWARDED applications for each criterion. Lets the
NGO copy + adapt instead of rewriting from scratch.

Why this is category-defining: NGOs accumulate winning content over
years (M&E plans, theory-of-change, partnership narratives) but it
sits in PDFs across email threads. We make it searchable + reusable
inside the platform.

Matching strategy (zero AI calls — pure heuristic):
  - For a target criterion (key + label), find responses from past
    AWARDED applications by the same NGO
  - Score each past response by:
      * exact key match (worth 100 points)
      * substring overlap on label tokens (worth up to 60 points)
      * preference for more recent awarded apps (worth up to 20 points)
      * minimum length filter (>= 30 words — short answers aren't worth reusing)
  - Return top 3 candidates with source app context

Privacy: only returns responses from the SAME NGO. No cross-org leakage.
"""

import logging
import re
from datetime import datetime, timezone

from app.extensions import db
from app.models import Application, Grant

logger = logging.getLogger('kuja')

MIN_WORDS = 30
MAX_SUGGESTIONS = 3


def _tokenize(s: str) -> set[str]:
    """Lowercase non-trivial tokens, no stopwords (cheap stoplist)."""
    if not s:
        return set()
    STOP = {
        'the', 'a', 'an', 'and', 'or', 'of', 'for', 'in', 'on', 'to',
        'with', 'by', 'is', 'are', 'as', 'at', 'be', 'was', 'were',
        'how', 'what', 'why', 'this', 'that', 'these', 'those',
    }
    return {
        t for t in re.findall(r'[a-z]{3,}', s.lower())
        if t not in STOP
    }


def _word_count(s: str) -> int:
    return len((s or '').split())


class PastWinsService:

    @classmethod
    def for_ngo_criterion(
        cls, *, ngo_org_id: int, criterion_key: str, criterion_label: str | None = None,
        exclude_application_id: int | None = None,
    ) -> dict:
        """Find best past-winning responses for one criterion. Returns:
          {
            success, criterion_key,
            candidates: [{ response, word_count, source_app_id,
                           source_grant_title, source_donor_name,
                           awarded_at, match_score, match_kind }]
          }
        """
        target_tokens = _tokenize(criterion_label or criterion_key)

        # Pull every awarded application this NGO has, ordered by recency
        awarded = (
            Application.query
            .filter(Application.ngo_org_id == ngo_org_id)
            .filter(Application.status == 'awarded')
            .options(db.joinedload(Application.grant).joinedload(Grant.donor_org))
            .order_by(Application.updated_at.desc().nullslast())
            .all()
        )
        if exclude_application_id:
            awarded = [a for a in awarded if a.id != exclude_application_id]

        candidates = []
        now = datetime.now(timezone.utc)
        for a in awarded:
            responses = a.get_responses() if hasattr(a, 'get_responses') else {}
            if not responses:
                continue

            # Iterate every past key, score it, pick the best for THIS app
            best = None
            for past_key, past_resp in responses.items():
                if not isinstance(past_resp, str):
                    continue
                if _word_count(past_resp) < MIN_WORDS:
                    continue

                # Score
                score = 0
                kind = 'token_match'
                if past_key == criterion_key:
                    score += 100
                    kind = 'exact_key'
                else:
                    # Token overlap on past_key tokens
                    past_tokens = _tokenize(past_key)
                    overlap_key = len(target_tokens & past_tokens)
                    score += min(60, overlap_key * 20)

                # Recency boost: 20 if updated <= 90 days ago, scaled
                if a.updated_at:
                    upd = a.updated_at if a.updated_at.tzinfo else a.updated_at.replace(tzinfo=timezone.utc)
                    days_ago = max(0, (now - upd).days)
                    recency = max(0, 20 - (days_ago / 30))  # full 20 if <=30d, decays
                    score += int(recency)

                if score <= 0:
                    continue
                if best is None or score > best['match_score']:
                    best = {
                        'response': past_resp,
                        'word_count': _word_count(past_resp),
                        'source_app_id': a.id,
                        'source_grant_title': a.grant.title if a.grant else None,
                        'source_donor_name': (
                            a.grant.donor_org.name
                            if a.grant and a.grant.donor_org else None
                        ),
                        'awarded_at': a.updated_at.isoformat() if a.updated_at else None,
                        'match_score': score,
                        'match_kind': kind,
                        'past_key': past_key,
                    }

            if best is not None:
                candidates.append(best)

        candidates.sort(key=lambda c: -c['match_score'])
        return {
            'success': True,
            'criterion_key': criterion_key,
            'criterion_label': criterion_label,
            'awarded_apps_searched': len(awarded),
            'candidates': candidates[:MAX_SUGGESTIONS],
        }
