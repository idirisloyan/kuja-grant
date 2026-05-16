"""
CrossGrantPatternsService — Phase 11 (May 2026).

Reads an NGO's portfolio of submissions and surfaces the patterns that
matter: where they consistently win, where they consistently lose, what
to fix next. Donor-portfolio variant does the same on the donor side
("your top performers share these traits").

Output:
  {
    'scope': 'ngo:<id>' | 'donor:<id>',
    'window_days': 365,
    'source': 'ai' | 'unavailable' | 'no_data',
    'patterns': [
      {
        'title': 'M&E specificity is a consistent weakness',
        'category': 'weakness' | 'strength' | 'opportunity',
        'evidence': ['App #471 scored 52/100 on M&E', 'App #482 docked for "qualitative descriptions only"', ...],
        'severity': 'high'|'medium'|'low',
        'fix': 'Add baseline survey methodology to every M&E section; quantify the population sampled.',
      }
    ],
    'top_3_actions': [str, str, str],
    'summary': '1-2 paragraph narrative.',
    'computed_at': iso,
  }

Source data:
  - Last N application responses with scores
  - Last N reports with compliance_score + risk_flags
  - Capacity assessment gaps
  - Adverse media + sanctions screening status
  - Trust profile pillar scores
"""

import logging
from datetime import datetime, timedelta, timezone

from app.extensions import db
from app.models import Application, Report, Assessment, Grant

logger = logging.getLogger('kuja')


class CrossGrantPatternsService:

    LOOKBACK_DAYS = 365
    MAX_APPS = 12         # cap how much we feed to the model
    MAX_REPORTS = 12

    @classmethod
    def for_ngo(cls, org_id: int) -> dict:
        """Build the patterns view for an NGO."""
        situations = cls._collect_ngo_situations(org_id)
        if not situations['has_data']:
            return cls._empty(scope=f'ngo:{org_id}', reason='no_data',
                              summary='Not enough submission history to detect patterns yet.')
        result = cls._ai_patterns(situations=situations, role_hint='ngo')
        if not result:
            return cls._empty(scope=f'ngo:{org_id}', reason='unavailable',
                              summary='AI not available — try again later.')
        result.update({
            'scope': f'ngo:{org_id}',
            'window_days': cls.LOOKBACK_DAYS,
            'source': 'ai',
            'computed_at': datetime.now(timezone.utc).isoformat(),
        })
        return result

    @classmethod
    def for_donor(cls, org_id: int) -> dict:
        situations = cls._collect_donor_situations(org_id)
        if not situations['has_data']:
            return cls._empty(scope=f'donor:{org_id}', reason='no_data',
                              summary='No portfolio data to analyse yet.')
        result = cls._ai_patterns(situations=situations, role_hint='donor')
        if not result:
            return cls._empty(scope=f'donor:{org_id}', reason='unavailable',
                              summary='AI not available — try again later.')
        result.update({
            'scope': f'donor:{org_id}',
            'window_days': cls.LOOKBACK_DAYS,
            'source': 'ai',
            'computed_at': datetime.now(timezone.utc).isoformat(),
        })
        return result

    # ------------------------------------------------------------------
    # Situation collection
    # ------------------------------------------------------------------

    @classmethod
    def _collect_ngo_situations(cls, org_id: int) -> dict:
        since = datetime.now(timezone.utc) - timedelta(days=cls.LOOKBACK_DAYS)
        apps = (
            Application.query.filter(Application.ngo_org_id == org_id)
            .filter(Application.created_at >= since)
            .order_by(Application.created_at.desc())
            .limit(cls.MAX_APPS).all()
        )
        reports = (
            Report.query.filter(Report.submitted_by_org_id == org_id)
            .filter(Report.created_at >= since)
            .order_by(Report.created_at.desc())
            .limit(cls.MAX_REPORTS).all()
        )
        latest_assessment = (
            Assessment.query.filter_by(org_id=org_id, status='completed')
            .order_by(Assessment.completed_at.desc().nullslast(), Assessment.updated_at.desc())
            .first()
        )

        # Build trust snapshot
        trust = None
        try:
            from app.services.trust_profile_service import TrustProfileService
            trust = TrustProfileService.build(org_id)
        except Exception:
            pass

        # Build compact records
        app_records = []
        for a in apps:
            app_records.append({
                'application_id': a.id,
                'grant_title': (a.grant.title if a.grant else ''),
                'status': a.status,
                'final_score': a.final_score,
                'ai_score': a.ai_score if hasattr(a, 'ai_score') else None,
                'response_excerpts': {
                    k: str(v)[:300] for k, v in (a.get_responses() or {}).items()
                },
            })
        report_records = []
        for r in reports:
            ai_analysis = r.get_ai_analysis() or {}
            report_records.append({
                'report_id': r.id,
                'title': r.title or r.report_type,
                'grant_title': (r.grant.title if r.grant else ''),
                'status': r.status,
                'compliance_score': ai_analysis.get('compliance_score'),
                'risk_flags': (ai_analysis.get('risk_flags') or [])[:5],
                'submitted_late_days': (
                    (r.submitted_at.date() - r.due_date).days
                    if r.submitted_at and r.due_date
                    else None
                ),
            })

        assessment_data = None
        if latest_assessment:
            cats = latest_assessment.get_category_scores() or {}
            gaps = latest_assessment.get_gaps() or []
            assessment_data = {
                'framework': latest_assessment.framework,
                'overall_score': latest_assessment.overall_score,
                'category_scores': {k: (v.get('score') if isinstance(v, dict) else v)
                                    for k, v in cats.items()},
                'gaps': [str(g.get('description') if isinstance(g, dict) else g)
                         for g in gaps[:5]],
            }

        has_data = bool(app_records or report_records or assessment_data)
        return {
            'has_data': has_data,
            'apps': app_records,
            'reports': report_records,
            'assessment': assessment_data,
            'trust': trust,
        }

    @classmethod
    def _collect_donor_situations(cls, donor_org_id: int) -> dict:
        since = datetime.now(timezone.utc) - timedelta(days=cls.LOOKBACK_DAYS)
        # All grants the donor has
        grant_ids = [g.id for g in Grant.query.filter_by(donor_org_id=donor_org_id)
                     .with_entities(Grant.id).all()]
        if not grant_ids:
            return {'has_data': False}

        apps = (
            Application.query.filter(Application.grant_id.in_(grant_ids))
            .filter(Application.created_at >= since)
            .order_by(Application.final_score.desc().nullslast())
            .options(db.joinedload(Application.ngo_org), db.joinedload(Application.grant))
            .limit(20).all()
        )
        reports = (
            Report.query.filter(Report.grant_id.in_(grant_ids))
            .filter(Report.created_at >= since)
            .order_by(Report.created_at.desc())
            .options(db.joinedload(Report.submitted_by_org), db.joinedload(Report.grant))
            .limit(20).all()
        )

        app_records = [{
            'application_id': a.id,
            'org_name': (a.ngo_org.name if a.ngo_org else ''),
            'grant_title': (a.grant.title if a.grant else ''),
            'final_score': a.final_score,
            'status': a.status,
        } for a in apps]
        report_records = [{
            'report_id': r.id,
            'org_name': (r.submitted_by_org.name if r.submitted_by_org else ''),
            'grant_title': (r.grant.title if r.grant else ''),
            'status': r.status,
            'compliance_score': (r.get_ai_analysis() or {}).get('compliance_score'),
            'submitted_late_days': (
                (r.submitted_at.date() - r.due_date).days
                if r.submitted_at and r.due_date
                else None
            ),
        } for r in reports]

        return {
            'has_data': bool(app_records or report_records),
            'apps': app_records,
            'reports': report_records,
        }

    # ------------------------------------------------------------------
    # AI pattern detection
    # ------------------------------------------------------------------

    @classmethod
    def _ai_patterns(cls, *, situations: dict, role_hint: str) -> dict | None:
        try:
            from app.services.ai_service import AIService
        except Exception:
            return None

        # Build the digest
        digest_parts = []
        if role_hint == 'ngo':
            apps_blob = '\n'.join(
                f"- App #{a['application_id']} ({a.get('grant_title','')[:60]}): "
                f"status={a.get('status')}, final_score={a.get('final_score', 'n/a')}, "
                f"responses_present={len(a.get('response_excerpts', {}))}"
                for a in situations.get('apps', [])
            ) or '  (no applications)'
            digest_parts.append(f'APPLICATIONS:\n{apps_blob}')

            reports_blob = '\n'.join(
                f"- R#{r['report_id']} ({r.get('grant_title','')[:60]}): "
                f"status={r.get('status')}, compliance={r.get('compliance_score', 'n/a')}, "
                f"slip={r.get('submitted_late_days', 'on-time')}d, "
                f"risks={'; '.join((r.get('risk_flags') or [])[:2])}"
                for r in situations.get('reports', [])
            ) or '  (no reports)'
            digest_parts.append(f'\nREPORTS:\n{reports_blob}')

            if situations.get('assessment'):
                a = situations['assessment']
                low_cats = sorted(
                    [(k, v) for k, v in (a.get('category_scores') or {}).items()
                     if isinstance(v, (int, float))],
                    key=lambda kv: kv[1] or 0,
                )[:3]
                digest_parts.append(
                    f"\nCAPACITY ASSESSMENT ({a.get('framework')}): overall {a.get('overall_score')}; "
                    f"weakest categories: {', '.join(f'{k}={v}' for k, v in low_cats)}; "
                    f"gaps: {'; '.join(a.get('gaps', [])[:3])}"
                )
            if situations.get('trust'):
                t = situations['trust']
                digest_parts.append(
                    f"\nTRUST PROFILE: overall {t.get('overall', {}).get('score')}/100 "
                    f"[{t.get('overall', {}).get('status')}]; "
                    f"capacity {t.get('capacity', {}).get('score')}/100, "
                    f"diligence {t.get('diligence', {}).get('score')}/100"
                )

        elif role_hint == 'donor':
            apps_blob = '\n'.join(
                f"- App #{a['application_id']} ({a['org_name']} → {a.get('grant_title', '')[:60]}): "
                f"status={a.get('status')}, final_score={a.get('final_score', 'n/a')}"
                for a in situations.get('apps', [])
            ) or '  (no applications)'
            digest_parts.append(f'PORTFOLIO APPLICATIONS:\n{apps_blob}')
            reports_blob = '\n'.join(
                f"- R#{r['report_id']} ({r['org_name']}): "
                f"compliance={r.get('compliance_score', 'n/a')}, slip={r.get('submitted_late_days', 'on-time')}d"
                for r in situations.get('reports', [])
            ) or '  (no reports)'
            digest_parts.append(f'\nPORTFOLIO REPORTS:\n{reports_blob}')

        digest = '\n'.join(digest_parts)

        audience = ('NGO programme officer / executive director'
                    if role_hint == 'ngo' else 'donor portfolio manager')

        system_prompt = (
            "You are an analyst surfacing PATTERNS across a portfolio of grant data. "
            "Read everything below and identify 3-6 patterns: where this "
            f"{role_hint} consistently wins (strength), consistently loses (weakness), "
            "or has untapped opportunity. For each pattern give SPECIFIC evidence "
            "(cite App #X, Report #Y), a severity, and a concrete next action.\n\n"
            "Discipline:\n"
            "  - One pattern per real signal — don't pad to hit a number.\n"
            "  - Evidence must be specific — never 'multiple applications'.\n"
            "  - 'fix' must be doable this quarter, not a slogan.\n"
            "  - For weaknesses with confidence < high, mark severity 'low' or 'medium'.\n"
            "  - End with top_3_actions: the highest-leverage actions to take now."
        )

        user_message = (
            f"Audience: {audience}\n"
            f"Lookback window: {cls.LOOKBACK_DAYS} days\n\n"
            f"{digest}\n\n"
            "Surface the patterns via the record_patterns tool. "
            "Then write a 1-2 paragraph plain-English summary."
        )

        parsed = AIService._call_claude_tool(
            system_prompt,
            user_message,
            tool_name='record_patterns',
            tool_description='Cross-grant pattern detection with evidence + concrete fixes.',
            tool_schema={
                'type': 'object',
                'properties': {
                    'patterns': {
                        'type': 'array',
                        'items': {
                            'type': 'object',
                            'properties': {
                                'title': {'type': 'string'},
                                'category': {'type': 'string',
                                             'enum': ['strength', 'weakness', 'opportunity']},
                                'severity': {'type': 'string',
                                             'enum': ['high', 'medium', 'low']},
                                'evidence': {'type': 'array', 'items': {'type': 'string'}},
                                'fix': {'type': 'string'},
                            },
                            'required': ['title', 'category', 'severity', 'fix'],
                        },
                    },
                    'top_3_actions': {
                        'type': 'array',
                        'items': {'type': 'string'},
                    },
                    'summary': {'type': 'string'},
                },
                'required': ['patterns', 'summary'],
            },
            max_tokens=2400,
            endpoint='cross_grant_patterns',
        )

        if not parsed:
            return None
        return {
            'patterns': (parsed.get('patterns') or [])[:6],
            'top_3_actions': (parsed.get('top_3_actions') or [])[:3],
            'summary': (parsed.get('summary') or '').strip(),
        }

    @staticmethod
    def _empty(*, scope: str, reason: str, summary: str) -> dict:
        return {
            'scope': scope,
            'window_days': CrossGrantPatternsService.LOOKBACK_DAYS,
            'source': reason,
            'patterns': [], 'top_3_actions': [], 'summary': summary,
            'computed_at': datetime.now(timezone.utc).isoformat(),
        }
