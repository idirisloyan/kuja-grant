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
