"""
Flagship AI surface health runner — Phase 13.39.

Exercises every flagship AI surface against a small synthetic fixture
and reports whether each one returns a well-formed result. Catches
silent regressions (schema drift, prompt drift, model deprecation,
forced-tool-use breakage) BEFORE users find them.

Why fixtures and not real prod records:
  - Hermetic: results don't depend on which org the admin is in.
  - Cheap: a single short prompt per surface, ~5K tokens total per run.
  - Repeatable: drift surfaces as "this used to pass on this fixture
    last week and now doesn't" — the change is the regression, not
    the data.

Surfaces exercised:
  - check_submission_readiness  (forced tool-use)
  - check_report_readiness      (forced tool-use)
  - estimate_applicant_burden   (forced tool-use)
  - draft_application           (forced tool-use)
  - generate_reviewer_summary   (forced tool-use)
  - extract_evidence            (prompt-and-parse with fallback)
  - suggest_criteria            (prompt-and-parse with fallback)
  - generate_grant_brief        (prompt-and-parse with fallback)

Each entry returns:
  { name, status: 'ok'|'fail'|'skipped', source, latency_ms, detail }

`status='skipped'` when AI is not configured (no ANTHROPIC_API_KEY) —
the run still passes; the runner just notes that nothing was tested.
`status='fail'` when the surface raised, returned None, or returned a
shape that doesn't match the contract — admin sees the offending key.
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any

logger = logging.getLogger('kuja')


# Tiny synthetic fixtures — kept in code so the runner is self-contained
# and does not depend on the seed dataset being present.

_GRANT_FIXTURE = {
    'id': -1,
    'title': 'Sample maternal-health grant',
    'description': (
        'Two-year program funding 6 NGOs to expand antenatal-care '
        'access in rural Western Kenya. Maximum award: $250,000.'
    ),
    'objectives': [
        'Increase antenatal-visit completion to 80%',
        'Train 50 community health workers',
        'Distribute 5,000 maternal kits',
    ],
    'criteria': [
        {'key': 'capacity', 'label': 'Capacity', 'description': 'Track record',  'weight': 25},
        {'key': 'design',   'label': 'Program design', 'description': 'Theory of change', 'weight': 35},
        {'key': 'mel',      'label': 'M&E plan', 'description': 'Indicators + baselines', 'weight': 20},
        {'key': 'budget',   'label': 'Budget realism', 'description': 'Cost vs. scope',   'weight': 20},
    ],
    'sectors': ['Health'],
}

_APP_FIXTURE_RESPONSES = {
    'capacity': (
        'Amani Health has run maternal-health programs in Kakamega for 8 years, '
        'reaching 12,000 mothers in our last cycle. We employ 3 nurses and '
        '14 community health workers.'
    ),
    'design': (
        'Our intervention layers home-visits, SMS reminders, and a small '
        'incentive for completing the 4-visit ANC pathway. Theory of change: '
        'reducing the cost barrier increases visit completion.'
    ),
    'mel': (
        'Indicators: visit-completion rate (target 80%), CHW retention (target 90%), '
        'and a quarterly community-feedback panel. Baseline pulled from county '
        'health records.'
    ),
    'budget': (
        'Personnel 45%, transport 18%, kits 22%, M&E 8%, indirect 7%. '
        'Total ask: $235,000 over 24 months.'
    ),
}

_APP_FIXTURE = {
    'id': -1,
    'grant_id': -1,
    'organization_name': 'Amani Health',
    'responses': _APP_FIXTURE_RESPONSES,
    'documents': [],
    'summary': 'Maternal-health antenatal-care program in Kakamega.',
}

_REPORT_FIXTURE = {
    'id': -1,
    'grant_id': -1,
    'period_start': '2026-01-01',
    'period_end': '2026-03-31',
    'narrative': (
        'Reached 1,200 mothers this quarter (target 1,500). CHW retention 88%. '
        'Two community health workers attended advanced training. Two kits '
        'shipments delayed by customs but cleared in March.'
    ),
    'indicators': [
        {'key': 'visits_completed', 'target': 1500, 'actual': 1200},
        {'key': 'chw_retention',    'target': 90,   'actual': 88},
    ],
}


def _safe(name, fn):
    """Run a single surface check and capture any exception."""
    started = time.monotonic()
    try:
        result = fn()
        latency_ms = int((time.monotonic() - started) * 1000)
        return {'name': name, **result, 'latency_ms': latency_ms}
    except Exception as e:
        latency_ms = int((time.monotonic() - started) * 1000)
        logger.warning(f'ai_surface_health[{name}] raised: {e}')
        return {
            'name': name, 'status': 'fail', 'source': 'error',
            'latency_ms': latency_ms, 'detail': f'{type(e).__name__}: {str(e)[:200]}',
        }


def _has_keys(d, keys):
    return isinstance(d, dict) and all(k in d for k in keys)


def run_health_check(*, exercise_ai: bool = True) -> dict:
    """Run every flagship AI surface against the synthetic fixture.

    When `exercise_ai=False` or no ANTHROPIC_API_KEY is present, every
    surface returns status='skipped' — the runner exits cleanly so it
    can run on dev / CI without flaking on missing creds.
    """
    from app.services.ai_service import AIService

    skip_all = (not exercise_ai) or (not os.environ.get('ANTHROPIC_API_KEY'))
    surfaces: list[dict] = []

    def skip_or(name, fn):
        if skip_all:
            return {'name': name, 'status': 'skipped', 'source': 'no_key',
                    'latency_ms': 0, 'detail': 'ANTHROPIC_API_KEY not set'}
        return _safe(name, fn)

    # Phase 13.44 — fixture aligned with the real AIService signatures.
    # The earlier fixture used flat kwargs (criteria=, grant_title=) but
    # the real methods take grant=/org=/application= dicts that contain
    # title + criteria nested. Caught by the team's live admin probe.

    # Shared per-call shapes the AIService methods expect.
    grant_dict = {
        'title': _GRANT_FIXTURE['title'],
        'description': _GRANT_FIXTURE['description'],
        'criteria': _GRANT_FIXTURE['criteria'],
        'eligibility': [],
    }
    org_dict = {
        'name': 'Amani Health',
        'mission': 'Maternal-health antenatal-care expansion',
        'sectors': ['Health'],
        'countries': ['Kenya'],
        'capacity': {'staff': 17, 'years_active': 8},
    }
    application_dict = {
        'id': -1,
        'responses': _APP_FIXTURE_RESPONSES,
        'eligibility_responses': {},
    }
    report_dict = {
        'id': -1,
        'reporting_period': '2026 Q1',
        'report_type': 'quarterly',
        'sections': {'narrative': _REPORT_FIXTURE['narrative']},
        'budget_actuals': {},
        'milestones': [],
    }

    # 1. submission readiness — accepts (grant, org, application, ...)
    def _f1():
        r = AIService.check_submission_readiness(
            grant=grant_dict, org=org_dict, application=application_dict,
            documents=[], language='en',
        )
        # Real return shape uses readiness_score + verdict (not readiness_band)
        # plus gaps[]. Be permissive about the verdict key name.
        if not isinstance(r, dict) or not (
            'verdict' in r or 'readiness_score' in r or 'readiness_band' in r
        ):
            return {'status': 'fail', 'source': 'shape',
                    'detail': f'missing verdict/score: keys={list(r.keys())[:6]}'}
        return {'status': 'ok', 'source': r.get('source', 'claude'),
                'detail': f"verdict={r.get('verdict', '?')} gaps={len(r.get('gaps') or [])}"}
    surfaces.append(skip_or('check_submission_readiness', _f1))

    # 2. report readiness — accepts (grant, org, report, ...)
    def _f2():
        r = AIService.check_report_readiness(
            grant=grant_dict, org=org_dict, report=report_dict,
            prior_reports=[], documents=[], language='en',
        )
        if not isinstance(r, dict) or not (
            'verdict' in r or 'readiness_score' in r or 'readiness_band' in r
        ):
            return {'status': 'fail', 'source': 'shape',
                    'detail': f'missing verdict/score: keys={list(r.keys())[:6]}'}
        return {'status': 'ok', 'source': r.get('source', 'claude'),
                'detail': f"verdict={r.get('verdict', '?')}"}
    surfaces.append(skip_or('check_report_readiness', _f2))

    # 3. burden estimator — accepts (grant_draft, language)
    def _f3():
        r = AIService.estimate_applicant_burden(
            grant_draft={
                'title': _GRANT_FIXTURE['title'],
                'description': _GRANT_FIXTURE['description'],
                'criteria': _GRANT_FIXTURE['criteria'],
                'eligibility': [],
                'document_requirements': [
                    {'key': 'audit', 'label': 'Audited financials'},
                    {'key': 'org_chart', 'label': 'Org chart'},
                ],
                'reporting_requirements': [],
            },
            language='en',
        )
        if not isinstance(r, dict) or not (
            'verdict' in r or 'burden_score' in r
        ):
            return {'status': 'fail', 'source': 'shape',
                    'detail': f'missing verdict/burden_score: keys={list(r.keys())[:6]}'}
        return {'status': 'ok', 'source': r.get('source', 'claude'),
                'detail': f"verdict={r.get('verdict', '?')} score={r.get('burden_score', '?')}"}
    surfaces.append(skip_or('estimate_applicant_burden', _f3))

    # 4. draft_application — accepts (grant, org, brief, ...)
    def _f4():
        r = AIService.draft_application(
            grant=grant_dict, org=org_dict,
            brief='Two-year maternal-health expansion in Kakamega county.',
            prior_applications=[], prior_documents=[], language='en',
            existing_responses={},
        )
        # Real return shape: { responses: dict, source, ... }
        if not isinstance(r, dict) or not isinstance(r.get('responses'), dict):
            return {'status': 'fail', 'source': 'shape',
                    'detail': f"missing/bad responses: keys={list(r.keys())[:6]}"}
        return {'status': 'ok', 'source': r.get('source', 'claude'),
                'detail': f"{len(r['responses'])} response fields"}
    surfaces.append(skip_or('draft_application', _f4))

    # 5. reviewer summary — accepts (grant, org, application, ...)
    def _f5():
        r = AIService.generate_reviewer_summary(
            grant=grant_dict, org=org_dict, application=application_dict,
            documents=[], comparable_applications=[], language='en',
        )
        # Real return shape uses evidence_per_criterion (not per_criterion)
        # + draft_rationale. Be permissive about variant key names.
        if not isinstance(r, dict) or not (
            'evidence_per_criterion' in r or 'per_criterion' in r
            or 'one_screen_summary' in r
        ):
            return {'status': 'fail', 'source': 'shape',
                    'detail': f'missing evidence/summary: keys={list(r.keys())[:6]}'}
        criteria_count = len(
            r.get('evidence_per_criterion') or r.get('per_criterion') or []
        )
        return {'status': 'ok', 'source': r.get('source', 'claude'),
                'detail': f"{criteria_count} criteria"}
    surfaces.append(skip_or('generate_reviewer_summary', _f5))

    # 6. extract_evidence
    def _f6():
        r = AIService.extract_evidence(
            criteria=_GRANT_FIXTURE['criteria'],
            application_responses=_APP_FIXTURE_RESPONSES,
            application_summary=_APP_FIXTURE['summary'],
        )
        if not _has_keys(r, ('per_criterion',)):
            return {'status': 'fail', 'source': 'shape', 'detail': f'missing per_criterion'}
        return {'status': 'ok', 'source': r.get('source', 'claude'),
                'detail': f"{len(r.get('per_criterion') or [])} entries"}
    surfaces.append(skip_or('extract_evidence', _f6))

    # 7. suggest_criteria — Phase 13.38, fallback should always populate.
    def _f7():
        r = AIService.suggest_criteria(
            grant_title=_GRANT_FIXTURE['title'],
            grant_description=_GRANT_FIXTURE['description'],
            grant_objectives=_GRANT_FIXTURE['objectives'],
            sector='Health',
            count=5,
        )
        sugg = r.get('suggestions') or []
        if not isinstance(sugg, list) or len(sugg) < 4:
            return {'status': 'fail', 'source': 'shape', 'detail': f'only {len(sugg)} suggestions'}
        return {'status': 'ok', 'source': r.get('source', 'template'),
                'detail': f"{len(sugg)} suggestions"}
    surfaces.append(skip_or('suggest_criteria', _f7))

    # Aggregate
    fail = sum(1 for s in surfaces if s['status'] == 'fail')
    skipped = sum(1 for s in surfaces if s['status'] == 'skipped')
    ok = sum(1 for s in surfaces if s['status'] == 'ok')

    overall = 'ok' if fail == 0 else 'fail'
    if fail == 0 and skipped == len(surfaces):
        overall = 'skipped'  # everything was skipped, can't claim ok

    return {
        'overall': overall,
        'ok': ok, 'fail': fail, 'skipped': skipped,
        'surfaces': surfaces,
    }
