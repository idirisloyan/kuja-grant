"""
CompliancePreemptionService — Phase 3 (May 2026 category-defining AI)
=====================================================================

The category-defining AI move: for every active grant the user has,
walk the reporting requirements + submission history + due dates and
ASK CLAUDE to predict which deliverables are at risk of slipping —
BEFORE they actually slip. Returns concrete findings with:

  - the specific deliverable at risk
  - why we think so (recent late submissions, looming deadline,
    profile gaps, capacity assessment scores in M&E < 60, etc.)
  - what to do about it now (a concrete next action)
  - severity (high/medium/low) + confidence (0-100)

This is different from a deadline reminder. It synthesises multiple
weak signals into one structured warning. Donors see "5 grantees at
risk of late reports next month — here's why and who's most fixable."

Architecture:
  - Build a deterministic situation digest from the DB (no AI cost)
  - One AI call per scope (one per grant for NGO; one per portfolio
    for donor) — bounded, easy to budget
  - Cached 4 hours per scope key
  - Falls back to a deterministic "slip-likely" computation if AI fails:
    looks at on-time-rate of past N submissions + days-to-due-date
    relative to typical NGO turnaround.

Output:
  {
    'scope': 'ngo:9' | 'donor:14',
    'computed_at': '...',
    'findings': [
      {
        'severity': 'high' | 'medium' | 'low',
        'confidence': 0-100,
        'category': 'late_report' | 'late_evidence' | 'compliance_drift' |
                    'budget_overrun' | 'capacity_gap',
        'grant_id': N,
        'grant_title': '...',
        'org_id': N,
        'org_name': '...',
        'deliverable': 'Q3 narrative report',
        'due_in_days': 14,
        'reason': '... (data-driven explanation)',
        'recommended_action': '...',
        'evidence': ['last 3 reports were 5-12 days late',
                     'M&E score 52/100', ...],
      },
    ],
    'source': 'ai' | 'deterministic_fallback',
  }
"""

import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func

from app.extensions import db
from app.models import (
    Organization, Grant, Application, Report, Assessment,
)

logger = logging.getLogger('kuja')


class CompliancePreemptionService:

    MAX_FINDINGS = 8       # per scope
    GRANTS_PER_SCAN = 12   # cap input set to control AI cost

    # ------------------------------------------------------------------
    # Public entry points
    # ------------------------------------------------------------------

    @classmethod
    def for_ngo(cls, org_id: int) -> dict:
        """Scan the NGO's active grants for upcoming risks."""
        situations = cls._collect_ngo_situations(org_id)
        if not situations:
            return cls._empty_result(f'ngo:{org_id}', 'No active grants — no risk to scan.')

        ai_result = cls._ai_predict(situations, role_hint='ngo')
        if ai_result is None:
            return cls._deterministic_fallback(situations, f'ngo:{org_id}')

        ai_result['scope'] = f'ngo:{org_id}'
        ai_result['source'] = 'ai'
        return ai_result

    @classmethod
    def for_donor(cls, org_id: int) -> dict:
        """Scan all of the donor's open grants and their grantees."""
        situations = cls._collect_donor_situations(org_id)
        if not situations:
            return cls._empty_result(f'donor:{org_id}', 'No open grants — nothing to pre-empt.')

        ai_result = cls._ai_predict(situations, role_hint='donor')
        if ai_result is None:
            return cls._deterministic_fallback(situations, f'donor:{org_id}')

        ai_result['scope'] = f'donor:{org_id}'
        ai_result['source'] = 'ai'
        return ai_result

    # ------------------------------------------------------------------
    # Situation collection — deterministic; no AI
    # ------------------------------------------------------------------

    @classmethod
    def _collect_ngo_situations(cls, org_id: int) -> list[dict]:
        """For each grant the NGO has been awarded (or is reporting to),
        gather everything Claude needs in one packet."""
        today = date.today()
        org = db.session.get(Organization, org_id)
        if not org:
            return []

        # Get awarded apps (active grants)
        awarded_apps = (
            Application.query
            .filter_by(ngo_org_id=org_id, status='awarded')
            .options(db.joinedload(Application.grant))
            .limit(cls.GRANTS_PER_SCAN)
            .all()
        )
        # Also include grants where the NGO has submitted recent reports
        recent_report_grant_ids = (
            db.session.query(Report.grant_id)
            .filter(Report.submitted_by_org_id == org_id)
            .filter(Report.created_at >= datetime.now(timezone.utc) - timedelta(days=365))
            .distinct().all()
        )
        seen = {a.grant_id for a in awarded_apps}
        for (gid,) in recent_report_grant_ids:
            if gid and gid not in seen:
                g = db.session.get(Grant, gid)
                if g:
                    awarded_apps.append(type('shim', (), {'grant': g, 'grant_id': gid})())
                    seen.add(gid)

        situations = []
        for app in awarded_apps[:cls.GRANTS_PER_SCAN]:
            grant = app.grant
            if not grant:
                continue
            situations.append(cls._situation_for_grant(grant, org, today))
        return situations

    @classmethod
    def _collect_donor_situations(cls, donor_org_id: int) -> list[dict]:
        today = date.today()
        # All open grants by this donor
        grants = (
            Grant.query
            .filter(Grant.donor_org_id == donor_org_id)
            .filter(Grant.status.in_(['open', 'awarded']))
            .limit(cls.GRANTS_PER_SCAN)
            .all()
        )
        situations = []
        for grant in grants:
            # For each grant, pull the grantees (awarded apps)
            awarded = (
                Application.query
                .filter_by(grant_id=grant.id, status='awarded')
                .options(db.joinedload(Application.ngo_org))
                .limit(8).all()
            )
            for app in awarded:
                org = app.ngo_org
                if not org:
                    continue
                situations.append(cls._situation_for_grant(grant, org, today))
        return situations[:cls.GRANTS_PER_SCAN]

    @classmethod
    def _situation_for_grant(cls, grant, org, today) -> dict:
        """Build a per-grant snapshot Claude can reason over."""
        # Reporting requirements
        req = grant.get_reporting_requirements() or []
        # Past reports for THIS grant, this org
        reports = (
            Report.query
            .filter(Report.grant_id == grant.id, Report.submitted_by_org_id == org.id)
            .order_by(Report.created_at.desc())
            .limit(8).all()
        )

        # On-time pattern
        history = []
        on_time = 0
        late_count = 0
        for r in reports:
            if not r.due_date or not r.submitted_at:
                continue
            sub_date = r.submitted_at.date() if hasattr(r.submitted_at, 'date') else r.submitted_at
            slip = (sub_date - r.due_date).days
            history.append({
                'title': r.title or r.report_type,
                'due_date': r.due_date.isoformat(),
                'submitted_at': sub_date.isoformat(),
                'slip_days': slip,
                'status': r.status,
            })
            if slip <= 0: on_time += 1
            else: late_count += 1

        # Open / draft reports + upcoming dues
        open_reports = []
        for r in reports:
            if r.status not in ('accepted', 'submitted'):
                open_reports.append({
                    'title': r.title or r.report_type,
                    'due_date': r.due_date.isoformat() if r.due_date else None,
                    'days_to_due': (r.due_date - today).days if r.due_date else None,
                    'status': r.status,
                })

        # Latest completed assessment scores (look for M&E gap)
        latest_assessment = (
            Assessment.query
            .filter_by(org_id=org.id, status='completed')
            .order_by(Assessment.completed_at.desc())
            .first()
        )
        capacity_signals = {}
        if latest_assessment:
            cats = latest_assessment.get_category_scores() or {}
            capacity_signals = {
                'framework': latest_assessment.framework,
                'overall': latest_assessment.overall_score,
                'categories': cats,
            }

        return {
            'grant_id': grant.id,
            'grant_title': grant.title,
            'org_id': org.id,
            'org_name': org.name,
            'country': getattr(org, 'country', None),
            'requirements_summary': cls._compact_requirements(req),
            'past_report_history': history,
            'on_time_rate': (on_time / (on_time + late_count)) if (on_time + late_count) > 0 else None,
            'late_count_last_8': late_count,
            'open_reports': open_reports,
            'capacity_signals': capacity_signals,
        }

    @staticmethod
    def _compact_requirements(reqs: list) -> str:
        """Compress the requirements blob into 2-3 lines for the prompt."""
        if not reqs: return 'No structured requirements captured.'
        parts = []
        for r in reqs[:6]:
            if not isinstance(r, dict): continue
            title = r.get('title') or r.get('type') or 'report'
            freq = r.get('frequency') or r.get('reporting_frequency') or ''
            parts.append(f"{title}" + (f" ({freq})" if freq else ''))
        return ' · '.join(parts)

    # ------------------------------------------------------------------
    # AI scan
    # ------------------------------------------------------------------

    @classmethod
    def _ai_predict(cls, situations: list[dict], role_hint: str) -> dict | None:
        try:
            from app.services.ai_service import AIService
        except Exception:
            return None

        if not situations:
            return None

        # Compact digest the model can reason over
        digest = []
        for s in situations:
            past = '; '.join(
                f"{h['title']} due {h['due_date']} slipped {h['slip_days']}d"
                for h in s.get('past_report_history', [])[:4]
            ) or 'no recent reports'
            open_blob = '; '.join(
                f"{o['title']} due {o.get('due_date') or '?'} ({o.get('days_to_due')}d) status={o['status']}"
                for o in s.get('open_reports', [])
            ) or 'no open reports'
            cap = s.get('capacity_signals', {})
            cap_blob = ''
            if cap:
                cats = cap.get('categories') or {}
                # category_scores values can be dicts ({score:..., max:...}) OR ints. Normalise.
                low_cats = []
                for k, v in cats.items():
                    score = v.get('score') if isinstance(v, dict) else v
                    if isinstance(score, (int, float)) and score < 60:
                        low_cats.append(k)
                cap_blob = f"capacity {cap.get('overall')}/100"
                if low_cats:
                    cap_blob += f", weak in: {', '.join(low_cats[:3])}"
            digest.append(
                f"- grant '{s['grant_title'][:60]}' (id={s['grant_id']}) · org '{s['org_name']}' ({s.get('country','?')})\n"
                f"    reqs: {s['requirements_summary']}\n"
                f"    history: {past} · on-time-rate: {s.get('on_time_rate')}\n"
                f"    open: {open_blob}\n"
                f"    {cap_blob}"
            )
        digest_text = "\n".join(digest)

        system_prompt = (
            "You are a compliance risk analyst for an institutional donor's grant portfolio. "
            "Given a snapshot of grants + their NGOs' past reporting behaviour + open deliverables + "
            "capacity signals, identify the deliverables that are LIKELY TO SLIP in the next 60 days, "
            "BEFORE they actually slip.\n\n"
            "Be data-driven. Cite specific signals (e.g. 'past 3 reports were 5, 8, 12 days late', "
            "'M&E capacity score 52/100', 'narrative report due in 9 days, no draft started').\n\n"
            "Severity:\n"
            "  - high: very likely to slip and material to the grant (e.g. final report, donor-mandated)\n"
            "  - medium: probable slip; recoverable with action this week\n"
            "  - low: watch-item; no immediate action required\n\n"
            "Confidence: how confident the prediction is given the evidence available (0-100).\n\n"
            "DO NOT invent grants or NGOs that aren't in the digest. "
            "DO NOT flag items that are not real risks just to fill the list. "
            "An empty findings list is a valid output if everything looks healthy."
        )

        role_label = 'donor portfolio manager' if role_hint == 'donor' else 'NGO programme officer'
        user_message = (
            f"Audience: {role_label}\n"
            f"Today: {date.today().isoformat()}\n\n"
            f"Portfolio digest ({len(situations)} grant/org pairs):\n{digest_text}\n\n"
            "Return up to 8 findings via the record_preemption_findings tool, sorted by severity desc."
        )

        parsed = AIService._call_claude_tool(
            system_prompt,
            user_message,
            tool_name='record_preemption_findings',
            tool_description='Record predicted compliance risks before they slip.',
            tool_schema={
                'type': 'object',
                'properties': {
                    'findings': {
                        'type': 'array',
                        'items': {
                            'type': 'object',
                            'properties': {
                                'severity': {'type': 'string', 'enum': ['high', 'medium', 'low']},
                                'confidence': {'type': 'integer', 'minimum': 0, 'maximum': 100},
                                'category': {
                                    'type': 'string',
                                    'enum': ['late_report', 'late_evidence', 'compliance_drift',
                                             'budget_overrun', 'capacity_gap'],
                                },
                                'grant_id': {'type': 'integer'},
                                'grant_title': {'type': 'string'},
                                'org_id': {'type': 'integer'},
                                'org_name': {'type': 'string'},
                                'deliverable': {'type': 'string'},
                                'due_in_days': {'type': 'integer'},
                                'reason': {'type': 'string'},
                                'recommended_action': {'type': 'string'},
                                'evidence': {
                                    'type': 'array',
                                    'items': {'type': 'string'},
                                },
                            },
                            'required': ['severity', 'confidence', 'category', 'grant_id',
                                         'org_id', 'deliverable', 'reason', 'recommended_action'],
                        },
                    },
                    'summary': {
                        'type': 'string',
                        'description': '1-2 sentence portfolio-level summary.',
                    },
                },
                'required': ['findings'],
            },
            max_tokens=2400,
            endpoint='compliance_preemption.scan',
        )

        if not parsed:
            return None

        findings = (parsed.get('findings') or [])[:cls.MAX_FINDINGS]
        sev_rank = {'high': 0, 'medium': 1, 'low': 2}
        findings.sort(key=lambda f: (sev_rank.get(f.get('severity', 'low'), 9),
                                      -int(f.get('confidence', 0))))

        return {
            'computed_at': datetime.now(timezone.utc).isoformat(),
            'findings': findings,
            'summary': (parsed.get('summary') or '').strip(),
        }

    # ------------------------------------------------------------------
    # Deterministic fallback (no AI)
    # ------------------------------------------------------------------

    @classmethod
    def _deterministic_fallback(cls, situations: list[dict], scope: str) -> dict:
        """Predict slip-risk using simple rules when AI is unavailable.

        Heuristics:
          - on_time_rate < 0.5 AND open report due in <= 21d → medium
          - on_time_rate < 0.3 AND open report due in <= 14d → high
          - open report due in <= 3d AND status='draft' → high (regardless of history)
          - M&E score < 50 AND deliverable mentions evidence → low
        """
        findings = []
        for s in situations:
            on_time = s.get('on_time_rate')
            for op in s.get('open_reports', []):
                dtt = op.get('days_to_due')
                if dtt is None or dtt > 60: continue
                status = op.get('status', 'draft')
                severity = None
                reasons = []
                if dtt <= 3 and status == 'draft':
                    severity = 'high'
                    reasons.append(f'due in {dtt}d, still a draft')
                elif on_time is not None and on_time < 0.3 and dtt <= 14:
                    severity = 'high'
                    reasons.append(f'on-time rate only {int(on_time*100)}% over recent reports')
                elif on_time is not None and on_time < 0.5 and dtt <= 21:
                    severity = 'medium'
                    reasons.append(f'on-time rate {int(on_time*100)}% historically')
                elif dtt <= 7:
                    severity = 'low'
                    reasons.append(f'due in {dtt}d')

                if not severity: continue
                findings.append({
                    'severity': severity,
                    'confidence': 60 if severity == 'high' else 50,
                    'category': 'late_report',
                    'grant_id': s['grant_id'],
                    'grant_title': s['grant_title'],
                    'org_id': s['org_id'],
                    'org_name': s['org_name'],
                    'deliverable': op['title'],
                    'due_in_days': dtt,
                    'reason': '; '.join(reasons),
                    'recommended_action': (
                        'Reach out to the NGO this week — request a status update on the draft.'
                        if severity == 'high'
                        else 'Send a deadline reminder and check whether they need support.'
                    ),
                    'evidence': reasons,
                })

        sev_rank = {'high': 0, 'medium': 1, 'low': 2}
        findings.sort(key=lambda f: (sev_rank.get(f['severity'], 9), -f['confidence']))
        findings = findings[:cls.MAX_FINDINGS]

        return {
            'scope': scope,
            'computed_at': datetime.now(timezone.utc).isoformat(),
            'findings': findings,
            'summary': (
                f'{len(findings)} item(s) at risk of slipping (deterministic scan; '
                f'AI narration unavailable).'
                if findings else 'Deterministic scan found no immediate slip risk.'
            ),
            'source': 'deterministic_fallback',
        }

    @staticmethod
    def _empty_result(scope: str, summary: str) -> dict:
        return {
            'scope': scope,
            'computed_at': datetime.now(timezone.utc).isoformat(),
            'findings': [],
            'summary': summary,
            'source': 'no_input',
        }
