"""
Compliance health scoring — Phase 13.8.

Adapted from PMO's 4-pillar score but tuned for the Kuja donor↔NGO
shape. PMO scores deliverable approval health for one org's grants;
Kuja scores grant health from the donor's perspective: how well is
this grant being delivered against?

The four pillars (weights chosen by analogy to PMO; A/B-tunable):
  Completion   ×0.30 — % of expected reports submitted on time
  Timeliness   ×0.30 — % of submitted reports submitted before due_date
  Workflow     ×0.20 — % of reports accepted (vs revision_requested)
  Importance   ×0.20 — modulator: total funding × beneficiary count proxy

Bands (PMO vocabulary):
  80-100 — on track
  60-79  — at risk
   0-59  — high risk

The function returns the score AND a structured breakdown so the UI
can render the "Why this score?" disclosure. Rule-based; no AI cost.
The narrative layer (1-2 sentence Haiku summary) is added by the route
handler when ai.compliance_health_narrative flag is on.
"""

from datetime import date, datetime, timezone
from typing import Any

from app.extensions import db
from app.models import Grant, Report, Application


def calculate_grant_compliance_health(grant_id: int) -> dict[str, Any]:
    """Return a structured 4-pillar compliance health breakdown for a grant.

    Output:
      {
        'grant_id': int,
        'score': 0-100,
        'band': 'on_track' | 'at_risk' | 'high_risk',
        'pillars': [
          {'key': 'completion', 'weight': 0.30, 'value': 0-100, 'note': str,
           'contributions': [{'label', 'value', 'detail'}]},
          ...
        ],
        'as_of': ISO timestamp,
        'computed_via': 'rule_based',
      }
    """
    grant = db.session.get(Grant, grant_id)
    if not grant:
        return {'error': 'grant_not_found', 'grant_id': grant_id}

    # Pull all reports + awarded applications for this grant.
    reports = Report.query.filter_by(grant_id=grant_id).all()
    awarded_apps = Application.query.filter_by(grant_id=grant_id, status='awarded').all()

    today = date.today()

    # --- Pillar 1: Completion ----------------------------------------
    # % of REPORTS that have been submitted (vs draft / overdue / not started).
    # Donors define expected reports per awarded grant — we approximate as
    # reports.count for awarded apps.
    submitted_count = sum(1 for r in reports if r.status in ('submitted', 'accepted', 'revision_requested'))
    expected_count = max(len(reports), len(awarded_apps))  # at least 1 per awarded app
    completion_pct = (submitted_count / expected_count * 100) if expected_count else 100
    completion_pct = max(0, min(100, completion_pct))

    completion_contribs = [
        {'label': 'Submitted reports', 'value': submitted_count, 'detail': f'{submitted_count} of {expected_count} expected'},
        {'label': 'Awarded applications', 'value': len(awarded_apps), 'detail': 'Each awarded application expects at least one report'},
    ]

    # --- Pillar 2: Timeliness ---------------------------------------
    # % of submitted reports that landed on or before due_date.
    on_time = 0
    late = 0
    overdue_open = 0
    for r in reports:
        if r.due_date and r.due_date < today and r.status == 'draft':
            overdue_open += 1
            continue
        if r.status in ('submitted', 'accepted', 'revision_requested'):
            if r.due_date and r.submitted_at:
                # submitted_at is datetime; due_date is date — compare day-wise.
                submitted_day = r.submitted_at.date() if hasattr(r.submitted_at, 'date') else r.submitted_at
                if submitted_day <= r.due_date:
                    on_time += 1
                else:
                    late += 1
            else:
                on_time += 1  # if no due_date, give benefit of the doubt
    timeliness_total = on_time + late + overdue_open
    timeliness_pct = (on_time / timeliness_total * 100) if timeliness_total else 100
    timeliness_pct = max(0, min(100, timeliness_pct))

    timeliness_contribs = [
        {'label': 'On-time submissions', 'value': on_time, 'detail': 'Submitted on or before the due date'},
        {'label': 'Late submissions', 'value': late, 'detail': 'Submitted after the due date'},
        {'label': 'Overdue (still open)', 'value': overdue_open, 'detail': 'Past due, not yet submitted'},
    ]

    # --- Pillar 3: Workflow -----------------------------------------
    # % of reviewed reports that landed in 'accepted' (not revision_requested).
    reviewed = [r for r in reports if r.status in ('accepted', 'revision_requested')]
    accepted_count = sum(1 for r in reviewed if r.status == 'accepted')
    workflow_pct = (accepted_count / len(reviewed) * 100) if reviewed else 100
    workflow_pct = max(0, min(100, workflow_pct))

    workflow_contribs = [
        {'label': 'Accepted', 'value': accepted_count, 'detail': 'Reports approved without revision'},
        {'label': 'Revision requested', 'value': len(reviewed) - accepted_count, 'detail': 'Returned for changes'},
    ]

    # --- Pillar 4: Importance ---------------------------------------
    # Modulator that lifts the score for high-funding grants and dampens for low.
    # Centered at 70: a typical mid-sized grant scores 70 here. Goal isn't
    # to penalize small grants but to give donors a single number that
    # reflects scale.
    funding = float(getattr(grant, 'total_funding', 0) or 0)
    if funding >= 1_000_000:
        importance = 90
    elif funding >= 250_000:
        importance = 80
    elif funding >= 50_000:
        importance = 70
    elif funding >= 10_000:
        importance = 60
    else:
        importance = 50
    importance_contribs = [
        {'label': 'Total funding', 'value': funding, 'detail': f'USD {funding:,.0f}'},
        {'label': 'Awarded NGOs', 'value': len(awarded_apps), 'detail': f'{len(awarded_apps)} grantee(s)'},
    ]

    # --- Composite score ---------------------------------------------
    score = int(round(
        completion_pct * 0.30
        + timeliness_pct * 0.30
        + workflow_pct * 0.20
        + importance * 0.20
    ))
    score = max(0, min(100, score))

    if score >= 80:
        band = 'on_track'
    elif score >= 60:
        band = 'at_risk'
    else:
        band = 'high_risk'

    pillars = [
        {
            'key': 'completion',
            'weight': 0.30,
            'value': int(round(completion_pct)),
            'note': 'Share of expected reports that have been submitted.',
            'contributions': completion_contribs,
        },
        {
            'key': 'timeliness',
            'weight': 0.30,
            'value': int(round(timeliness_pct)),
            'note': 'Share of submissions that landed on or before the due date.',
            'contributions': timeliness_contribs,
        },
        {
            'key': 'workflow',
            'weight': 0.20,
            'value': int(round(workflow_pct)),
            'note': 'Share of reviewed reports that were accepted without revision.',
            'contributions': workflow_contribs,
        },
        {
            'key': 'importance',
            'weight': 0.20,
            'value': int(round(importance)),
            'note': 'Scale modulator based on total funding and grantee count.',
            'contributions': importance_contribs,
        },
    ]
    # Sort lowest pillar first so the UI shows what to fix.
    pillars.sort(key=lambda p: p['value'])

    return {
        'grant_id': grant_id,
        'score': score,
        'band': band,
        'pillars': pillars,
        'as_of': datetime.now(timezone.utc).isoformat(),
        'computed_via': 'rule_based',
    }


def add_ai_narrative(breakdown: dict, *, language: str = 'en') -> dict:
    """Phase 13.28 — overlay a 1-2 sentence Haiku-generated narrative
    on top of the rule-based compliance health breakdown.

    PMO's pattern: "Cached per-grant per-score for 6 hours. Falls back
    to the rule-based version if AI is unavailable — the callout always
    renders."

    Cache key is (grant_id, score, date_bucket_6h). The narrative is
    short (1-2 sentences) and uses Haiku 4.5 for cost — this is summary
    work, not extraction.

    Returns the breakdown dict with `narrative` field added (or unchanged
    if AI is unavailable).
    """
    if not breakdown or not isinstance(breakdown, dict):
        return breakdown
    if 'score' not in breakdown:
        return breakdown

    # Lookup cache — 6-hour bucket per grant_id + score combo.
    import hashlib
    grant_id = breakdown.get('grant_id')
    score = breakdown.get('score')
    band = breakdown.get('band', '')
    if grant_id is None or score is None:
        return breakdown
    bucket = datetime.now(timezone.utc).strftime('%Y%m%d') + str(datetime.now(timezone.utc).hour // 6)
    cache_key = hashlib.sha1(f"{grant_id}:{score}:{band}:{language}:{bucket}".encode()).hexdigest()[:16]

    # In-memory cache (ephemeral; OK at single-tenant scale).
    if not hasattr(add_ai_narrative, '_cache'):
        add_ai_narrative._cache = {}
    cached = add_ai_narrative._cache.get(cache_key)
    if cached:
        breakdown['narrative'] = cached
        breakdown['computed_via'] = 'ai_narrative'
        return breakdown

    # Build a compact prompt from the pillars.
    pillars = breakdown.get('pillars') or []
    pillars_brief = '; '.join(
        f"{p['key']}={p['value']}" for p in pillars[:4]
    )
    system = (
        "You are Kuja's grant compliance health narrator. Given a "
        "rule-based 4-pillar breakdown, write a 1-2 sentence plain-"
        "language summary the donor can read in 3 seconds. Lead with "
        "the lowest pillar (what's pulling the score down). Be concrete; "
        "don't say 'overall the grant is doing well' — say 'timeliness "
        "at 72 is dragging an otherwise strong run.' Max 220 chars."
    )
    user = (
        f"Score: {score}/100 ({band}). Pillars (lowest first): {pillars_brief}. "
        f"Write the 1-2 sentence summary."
    )
    try:
        from app.services.ai_service import AIService
        # Use Haiku for narrative — short output, cost-sensitive. Falls
        # back to text via _call_claude if Haiku helper not specialized.
        text = AIService._call_claude(
            system, user, max_tokens=200, language=language,
            endpoint='compliance_health_narrative',
        )
        if text:
            text = text.strip()
            if len(text) > 240:
                text = text[:237] + '…'
            add_ai_narrative._cache[cache_key] = text
            breakdown['narrative'] = text
            breakdown['computed_via'] = 'ai_narrative'
    except Exception:
        # Quiet fallback — caller still has the rule-based breakdown.
        pass
    return breakdown


def write_daily_snapshots():
    """Phase 13.27 — write one ComplianceSnapshot row per active grant.

    Idempotent: upserts on (grant_id, snapshot_date). Safe to re-run
    multiple times per day. Called by the notification scheduler.

    Returns dict {written, skipped, errors} for observability.
    """
    import json as _json
    from app.models import Grant, ComplianceSnapshot

    today = date.today()
    written = 0
    skipped = 0
    errors = 0

    grants = Grant.query.filter(Grant.status.in_(('open', 'closed'))).all()
    for g in grants:
        try:
            existing = ComplianceSnapshot.query.filter_by(
                grant_id=g.id, snapshot_date=today,
            ).first()
            breakdown = calculate_grant_compliance_health(g.id)
            if existing:
                existing.score = breakdown['score']
                existing.band = breakdown['band']
                existing.pillars_json = _json.dumps(breakdown['pillars'], default=str)
                skipped += 1
            else:
                snap = ComplianceSnapshot(
                    grant_id=g.id,
                    snapshot_date=today,
                    score=breakdown['score'],
                    band=breakdown['band'],
                    pillars_json=_json.dumps(breakdown['pillars'], default=str),
                )
                db.session.add(snap)
                written += 1
        except Exception:
            errors += 1
            continue
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        errors += written
        written = 0
    return {'written': written, 'skipped_existing': skipped, 'errors': errors,
            'snapshot_date': today.isoformat()}


def trajectory(grant_id: int, days: int = 60) -> dict:
    """Return the sparkline data + linear-regression forecast for a grant.

    Output:
      {
        'history': [{'date', 'score', 'band'}, ...],   # oldest → newest
        'forecast_30d_score': int | None,
        'slips_below_at_risk_in_days': int | None,    # null when not slipping
      }
    """
    from datetime import timedelta
    from app.models import ComplianceSnapshot

    cutoff = date.today() - timedelta(days=days)
    rows = (ComplianceSnapshot.query
            .filter(ComplianceSnapshot.grant_id == grant_id,
                    ComplianceSnapshot.snapshot_date >= cutoff)
            .order_by(ComplianceSnapshot.snapshot_date.asc())
            .all())
    history = [{'date': r.snapshot_date.isoformat(),
                'score': r.score, 'band': r.band} for r in rows]

    forecast = None
    slips_in = None
    if len(rows) >= 5:
        # Simple linear regression on (day_index, score) for the last 30 days.
        xs = [(r.snapshot_date - rows[0].snapshot_date).days for r in rows[-30:]]
        ys = [r.score for r in rows[-30:]]
        n = len(xs)
        sx, sy = sum(xs), sum(ys)
        sxx = sum(x * x for x in xs)
        sxy = sum(x * y for x, y in zip(xs, ys))
        denom = n * sxx - sx * sx
        if denom != 0:
            slope = (n * sxy - sx * sy) / denom
            intercept = (sy - slope * sx) / n
            current_x = xs[-1]
            forecast_x = current_x + 30
            forecast = max(0, min(100, int(round(slope * forecast_x + intercept))))
            # When does the line cross 60 (at-risk threshold)?
            if slope < 0 and rows[-1].score >= 60:
                # solve: slope * x + intercept = 60  →  x = (60 - intercept) / slope
                cross_x = (60 - intercept) / slope
                if cross_x > current_x and cross_x < current_x + 365:
                    slips_in = int(round(cross_x - current_x))

    return {
        'history': history,
        'forecast_30d_score': forecast,
        'slips_below_at_risk_in_days': slips_in,
    }
