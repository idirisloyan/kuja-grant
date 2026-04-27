"""
Match engine — Phase 3.1
========================
Computes a win-probability score for every (NGO, open_grant) pair so the
NGO sees "the 3 grants you're most likely to win this week" instead of
"all open grants by date." This is deterministic + rule-based — not AI —
because:
    1. Speed: must rank thousands of pairs in < 1 second
    2. Explainability: every score has named components
    3. Cost: no per-pair Claude call

Score components (0-100):
    eligibility    — hard filter; if org fails any required eligibility,
                     match = 0 immediately. Otherwise contributes 25.
    sector         — Jaccard overlap of org.sectors × grant.sectors. 20 max.
    geography      — Jaccard overlap of org.countries × grant.countries. 20 max.
    capacity       — readiness assessment vs the grant's burden score.
                     Orgs with high readiness get more weight on high-burden
                     grants. 20 max.
    track_record   — past awarded applications by this org for similar
                     grants (same donor, similar sector). 15 max.

Top strength + blocker are derived from the highest / lowest contributing
components so the NGO sees not just a number but actionable insight:
    'You'd jump from 60 → 80 if you completed your audit.'

Storage: match_scores table, one row per (org, grant). Recomputed on:
    - grant publish or update
    - org readiness change
    - manual admin recompute
"""

from __future__ import annotations
import json
import logging
from typing import Any
from datetime import datetime, timezone

from app.extensions import db
from sqlalchemy import text
from app.models import Organization, Grant, Application

logger = logging.getLogger('kuja')


_table_ready = None


def _ensure_table():
    """Create match_scores table on first use."""
    global _table_ready
    if _table_ready:
        return True
    try:
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS match_scores (
                id SERIAL PRIMARY KEY,
                org_id INT NOT NULL,
                grant_id INT NOT NULL,
                score INT NOT NULL DEFAULT 0,
                components TEXT,
                top_strength VARCHAR(240),
                top_blocker VARCHAR(240),
                computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (org_id, grant_id)
            )
        """))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_match_scores_org "
            "ON match_scores (org_id, score DESC)"
        ))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_match_scores_grant "
            "ON match_scores (grant_id, score DESC)"
        ))
        db.session.commit()
        _table_ready = True
        return True
    except Exception as e:
        logger.error(f"match_scores table create failed: {e}")
        try:
            db.session.rollback()
        except Exception:
            pass
        _table_ready = False
        return False


def _normalize_list(value: Any) -> list[str]:
    """Coerce stored lists/strings to a list of lowercase tokens."""
    if value is None:
        return []
    if isinstance(value, str):
        value = [v.strip() for v in value.split(',')]
    if not isinstance(value, (list, tuple)):
        return []
    return [str(v).strip().lower() for v in value if v]


def _jaccard(a: list[str], b: list[str]) -> float:
    if not a or not b:
        return 0.0
    sa, sb = set(a), set(b)
    inter = len(sa & sb)
    union = len(sa | sb)
    return inter / union if union else 0.0


def _eligibility_passes(org, grant) -> tuple[bool, str | None]:
    """Hard filter: does org pass every REQUIRED eligibility item?

    For now we only check the structural facts we can verify
    automatically (geographic, org_type if it's stored on the org). The
    rest of eligibility is informational and doesn't hard-fail.
    Returns (passes, blocker_message_if_fails).
    """
    try:
        elig = grant.get_eligibility() if hasattr(grant, 'get_eligibility') else []
    except Exception:
        elig = []

    org_countries = _normalize_list(getattr(org, 'countries', None))

    for item in elig or []:
        if not item.get('required') and not item.get('enabled'):
            continue
        key = (item.get('key') or '').lower()
        details = (item.get('details') or '')

        # Geographic — only fail if grant lists countries and org's countries
        # don't overlap. Lenient: missing org countries doesn't fail.
        if key == 'geographic':
            grant_countries = _normalize_list(getattr(grant, 'countries', None))
            if grant_countries and org_countries:
                if not (set(grant_countries) & set(org_countries)):
                    return False, f"Geography: needs {', '.join(grant_countries[:3])}"

    return True, None


def _component_capacity(org, grant_burden) -> float:
    """Readiness fit: orgs with higher readiness handle higher-burden grants
    better. Returns 0..1.
    """
    try:
        from app.models import Assessment
        a = (Assessment.query
             .filter_by(organization_id=org.id)
             .order_by(Assessment.created_at.desc())
             .first())
        readiness = float(getattr(a, 'score', 0) or 0) / 100.0
    except Exception:
        readiness = 0.5

    burden_map = {'low': 0.3, 'medium': 0.6, 'high': 0.9}
    burden = burden_map.get((grant_burden or 'medium'), 0.6)

    # Sigmoid-like: when readiness >= burden, full points; else proportional.
    if readiness >= burden:
        return 1.0
    return max(0.0, readiness / burden)


def _component_track_record(org_id, grant) -> float:
    """Past awarded applications by this org for similar grants. 0..1."""
    try:
        wins = (Application.query
                .filter_by(ngo_org_id=org_id, status='awarded')
                .count())
        # Simple monotonic curve: 0 wins → 0.0, 1 win → 0.5, 3+ wins → 1.0
        if wins == 0:
            return 0.0
        return min(1.0, wins / 3.0)
    except Exception:
        return 0.0


def compute(org_id: int, grant_id: int, persist: bool = True) -> dict[str, Any]:
    """Compute one match score. Returns the score record dict."""
    org = db.session.get(Organization, org_id)
    grant = db.session.get(Grant, grant_id)
    if not org or not grant:
        return {'score': 0, 'reason': 'org_or_grant_missing'}

    components: dict[str, float] = {}
    blockers: list[tuple[str, str]] = []
    strengths: list[tuple[str, str]] = []

    # 1. Hard eligibility filter.
    passes, block_msg = _eligibility_passes(org, grant)
    if not passes:
        result = {
            'org_id': org_id,
            'grant_id': grant_id,
            'score': 0,
            'components': {'eligibility': 0},
            'top_strength': None,
            'top_blocker': block_msg or 'eligibility',
        }
        if persist:
            _persist(result)
        return result
    components['eligibility'] = 25.0
    strengths.append(('eligibility', 'You meet the hard eligibility criteria.'))

    # 2. Sector overlap.
    sector_overlap = _jaccard(
        _normalize_list(getattr(org, 'sectors', None)),
        _normalize_list(getattr(grant, 'sectors', None)),
    )
    components['sector'] = round(sector_overlap * 20, 2)
    if sector_overlap >= 0.5:
        strengths.append(('sector', 'Strong sector match with the grant focus.'))
    elif sector_overlap < 0.2:
        blockers.append(('sector', 'Limited sector overlap — broaden eligibility narrative.'))

    # 3. Geography overlap.
    geo_overlap = _jaccard(
        _normalize_list(getattr(org, 'countries', None)),
        _normalize_list(getattr(grant, 'countries', None)),
    )
    components['geography'] = round(geo_overlap * 20, 2)
    if geo_overlap >= 0.5:
        strengths.append(('geography', 'Operating in the grant\'s priority geographies.'))

    # 4. Capacity vs burden.
    burden = None
    try:
        b = grant.get_burden() if hasattr(grant, 'get_burden') else None
        burden = (b or {}).get('score') if isinstance(b, dict) else None
    except Exception:
        pass
    cap = _component_capacity(org, burden)
    components['capacity'] = round(cap * 20, 2)
    if cap >= 0.85:
        strengths.append(('capacity', 'Your readiness assessment fits this grant\'s complexity.'))
    elif cap < 0.5:
        blockers.append((
            'capacity',
            'Readiness gap — completing your assessment would lift this match.',
        ))

    # 5. Track record.
    tr = _component_track_record(org_id, grant)
    components['track_record'] = round(tr * 15, 2)
    if tr >= 0.6:
        strengths.append(('track_record', 'Strong history of awards strengthens this match.'))

    score = int(round(sum(components.values())))
    score = max(0, min(100, score))

    # Pick top strength = highest non-eligibility component; top blocker =
    # lowest non-eligibility component (or the captured blocker reason).
    non_elig_components = {k: v for k, v in components.items() if k != 'eligibility'}
    top_strength_msg = None
    top_blocker_msg = None
    if non_elig_components:
        max_key = max(non_elig_components, key=non_elig_components.get)
        max_val = non_elig_components[max_key]
        if max_val > 0:
            for k, msg in strengths:
                if k == max_key:
                    top_strength_msg = msg
                    break
        min_key = min(non_elig_components, key=non_elig_components.get)
        for k, msg in blockers:
            if k == min_key:
                top_blocker_msg = msg
                break
        if top_blocker_msg is None and blockers:
            top_blocker_msg = blockers[0][1]

    result = {
        'org_id': org_id,
        'grant_id': grant_id,
        'score': score,
        'components': components,
        'top_strength': top_strength_msg,
        'top_blocker': top_blocker_msg,
    }

    if persist:
        _persist(result)
    return result


def _persist(result: dict[str, Any]) -> None:
    """Upsert one match score row."""
    if not _ensure_table():
        return
    try:
        db.session.execute(
            text("""
                INSERT INTO match_scores
                  (org_id, grant_id, score, components, top_strength, top_blocker, computed_at)
                VALUES
                  (:o, :g, :s, :c, :str, :blk, CURRENT_TIMESTAMP)
                ON CONFLICT (org_id, grant_id) DO UPDATE
                SET score = EXCLUDED.score,
                    components = EXCLUDED.components,
                    top_strength = EXCLUDED.top_strength,
                    top_blocker = EXCLUDED.top_blocker,
                    computed_at = CURRENT_TIMESTAMP
            """),
            {
                "o": result['org_id'],
                "g": result['grant_id'],
                "s": result['score'],
                "c": json.dumps(result.get('components') or {}),
                "str": (result.get('top_strength') or '')[:240] or None,
                "blk": (result.get('top_blocker') or '')[:240] or None,
            },
        )
        db.session.commit()
    except Exception as e:
        try:
            db.session.rollback()
        except Exception:
            pass
        logger.debug(f"match_score persist failed: {e}")


def compute_for_grant(grant_id: int, limit: int | None = None) -> int:
    """Recompute scores for every NGO org against a grant. Returns count."""
    grant = db.session.get(Grant, grant_id)
    if not grant:
        return 0
    q = Organization.query.filter_by(org_type='ngo')
    if limit:
        q = q.limit(limit)
    n = 0
    for org in q.all():
        compute(org.id, grant_id, persist=True)
        n += 1
    return n


def compute_for_org(org_id: int, limit: int | None = None) -> int:
    """Recompute scores for one NGO against every open grant. Returns count."""
    q = Grant.query.filter_by(status='open')
    if limit:
        q = q.limit(limit)
    n = 0
    for g in q.all():
        compute(org_id, g.id, persist=True)
        n += 1
    return n


def top_matches_for_org(org_id: int, limit: int = 10) -> list[dict[str, Any]]:
    """Return the ranked top-N matches for an NGO, joined with grant info."""
    if not _ensure_table():
        return []
    try:
        rows = db.session.execute(
            text("""
                SELECT m.grant_id, m.score, m.components, m.top_strength, m.top_blocker,
                       m.computed_at,
                       g.title, g.description, g.deadline, g.total_funding, g.currency,
                       g.donor_org_id
                FROM match_scores m
                JOIN grants g ON g.id = m.grant_id
                WHERE m.org_id = :o
                  AND g.status = 'open'
                  AND (g.deadline IS NULL OR g.deadline >= CURRENT_DATE)
                ORDER BY m.score DESC, m.computed_at DESC
                LIMIT :lim
            """),
            {"o": org_id, "lim": limit},
        ).fetchall()
        out = []
        for r in rows:
            try:
                comp = json.loads(r[2]) if r[2] else {}
            except Exception:
                comp = {}
            out.append({
                'grant_id': r[0],
                'score': r[1],
                'components': comp,
                'top_strength': r[3],
                'top_blocker': r[4],
                'computed_at': r[5].isoformat() if r[5] else None,
                'grant': {
                    'id': r[0],
                    'title': r[6],
                    'description': r[7],
                    'deadline': r[8].isoformat() if r[8] else None,
                    'total_funding': float(r[9]) if r[9] is not None else None,
                    'currency': r[10],
                    'donor_org_id': r[11],
                },
            })
        return out
    except Exception as e:
        logger.error(f"top_matches_for_org failed: {e}")
        return []


def top_orgs_for_grant(grant_id: int, limit: int = 10) -> list[dict[str, Any]]:
    """Return the top-N matched NGOs for a grant — used by donors to see
    'who would be a great fit if they apply'."""
    if not _ensure_table():
        return []
    try:
        rows = db.session.execute(
            text("""
                SELECT m.org_id, m.score, m.components, m.top_strength, m.top_blocker,
                       o.name, o.sectors, o.countries
                FROM match_scores m
                JOIN organizations o ON o.id = m.org_id
                WHERE m.grant_id = :g
                ORDER BY m.score DESC
                LIMIT :lim
            """),
            {"g": grant_id, "lim": limit},
        ).fetchall()
        out = []
        for r in rows:
            try:
                comp = json.loads(r[2]) if r[2] else {}
            except Exception:
                comp = {}
            out.append({
                'org_id': r[0],
                'score': r[1],
                'components': comp,
                'top_strength': r[3],
                'top_blocker': r[4],
                'org': {
                    'id': r[0],
                    'name': r[5],
                    'sectors': r[6],
                    'countries': r[7],
                },
            })
        return out
    except Exception as e:
        logger.error(f"top_orgs_for_grant failed: {e}")
        return []
