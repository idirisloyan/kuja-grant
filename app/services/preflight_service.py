"""
PreflightService — Phase 7 (May 2026 category-defining AI).

"See your submission exactly as the reviewer will see it — before you submit."

The NGO clicks pre-flight on their draft application (or report). We ask
Claude to score it the way a reviewer would and return:

  - per-criterion predicted score (0-100) + verbal grade
  - per-criterion weak-spot diagnosis (what the reviewer will flag)
  - per-criterion concrete improvement (what to add/change/cut)
  - overall predicted score
  - top 3 fixes ranked by leverage

This is different from the existing word-count PreviewAsReviewer:
that one is heuristic ("you wrote 200 words, target is 500, looks thin").
This one is AI ("your community engagement section talks about training
but doesn't quantify participants or outcomes — a reviewer will dock
this because the grant criteria explicitly asks for beneficiary numbers").

Architecture:
  - Build a deterministic "submission packet" from the application/report
    + the grant's criteria + (optional) anonymised winning-app excerpts
    if available (capacity passport / org memory)
  - One AI call per pre-flight; cached 10 min per (application_id) tuple
    so iterating on a draft isn't $$$
  - Falls back to the heuristic word-count summary when AI unavailable

Output shape:
  {
    'scope': 'application:<id>' | 'report:<id>',
    'source': 'ai' | 'heuristic_fallback',
    'predicted_overall_score': 0-100 | null,
    'predicted_grade': 'strong' | 'adequate' | 'thin',
    'criteria': [
      {
        'key': str,
        'label': str,
        'predicted_score': 0-100,
        'reviewer_signal': 'strong'|'adequate'|'thin',
        'what_works': '...',
        'what_a_reviewer_will_flag': '...',
        'concrete_fix': '...',
        'word_count': int,
        'target_words': int,
      }, ...
    ],
    'top_fixes': [
      {'criterion_key': str, 'fix': str, 'leverage': 'high|medium|low'},
      ...
    ],
    'ai_summary': '... 1-2 paragraph narrative ...',
    'computed_at': iso,
  }
"""

import logging
from datetime import datetime, timezone

from app.extensions import db
from app.models import Application, Report, Grant

logger = logging.getLogger('kuja')


class PreflightService:

    MAX_CRITERIA = 12   # cap per request to control AI cost

    @classmethod
    def for_application(cls, application_id: int) -> dict | None:
        app = (
            Application.query
            .options(db.joinedload(Application.grant))
            .filter_by(id=application_id)
            .first()
        )
        if not app or not app.grant:
            return None
        return cls._run(
            scope=f'application:{application_id}',
            grant=app.grant,
            criteria=app.grant.get_criteria() or [],
            responses=app.get_responses() or {},
            kind='application',
        )

    @classmethod
    def for_report(cls, report_id: int) -> dict | None:
        rpt = (
            Report.query
            .options(db.joinedload(Report.grant))
            .filter_by(id=report_id)
            .first()
        )
        if not rpt:
            return None
        # Reports don't have grant criteria as such; treat the content
        # sections as the "criteria" and re-use the same machinery so the
        # NGO gets the same kind of feedback.
        content = rpt.get_content() or {}
        synth_criteria = [
            {'key': k, 'label': k.replace('_', ' ').title(), 'max_words': 400}
            for k in (content.keys() or ['narrative'])
        ]
        return cls._run(
            scope=f'report:{report_id}',
            grant=rpt.grant,
            criteria=synth_criteria,
            responses=content,
            kind='report',
        )

    # ------------------------------------------------------------------
    # Core
    # ------------------------------------------------------------------

    @classmethod
    def _run(
        cls, *, scope: str, grant, criteria: list, responses: dict, kind: str,
    ) -> dict:
        # Normalise criteria
        crits = []
        for c in (criteria or [])[:cls.MAX_CRITERIA]:
            if not isinstance(c, dict):
                continue
            crits.append({
                'key': str(c.get('key') or c.get('id') or c.get('label', '')[:32]),
                'label': str(c.get('label') or c.get('key') or 'criterion'),
                'description': str(c.get('description') or ''),
                'max_words': int(c.get('max_words') or 400),
                'weight': c.get('weight'),
            })
        if not crits:
            crits = [{'key': 'response', 'label': 'Response',
                      'description': '', 'max_words': 500, 'weight': None}]

        # Compute the heuristic baseline first (always available)
        heuristic = cls._heuristic_summary(crits, responses)

        # Try AI
        ai_result = cls._ai_predict(grant=grant, crits=crits, responses=responses, kind=kind)
        if ai_result:
            ai_result.update({
                'scope': scope,
                'source': 'ai',
                'computed_at': datetime.now(timezone.utc).isoformat(),
            })
            # Always include the heuristic word-count alongside AI per-criterion
            # so the UI can show both signals.
            ai_by_key = {c['key']: c for c in ai_result.get('criteria', [])}
            for c in heuristic['criteria']:
                if c['key'] in ai_by_key:
                    ai_by_key[c['key']]['word_count'] = c['word_count']
                    ai_by_key[c['key']]['target_words'] = c['target_words']
            return ai_result

        # Heuristic fallback
        heuristic['scope'] = scope
        heuristic['source'] = 'heuristic_fallback'
        heuristic['computed_at'] = datetime.now(timezone.utc).isoformat()
        return heuristic

    # ------------------------------------------------------------------
    # AI prediction
    # ------------------------------------------------------------------

    @classmethod
    def _ai_predict(cls, *, grant, crits: list, responses: dict, kind: str) -> dict | None:
        try:
            from app.services.ai_service import AIService
        except Exception:
            return None

        # Build a compact digest the model can reason over
        sections = []
        for c in crits:
            text = (responses.get(c['key']) or '').strip()
            wc = len(text.split())
            sections.append(
                f"### Criterion: {c['label']} (key={c['key']}, target ~{c['max_words']} words, "
                f"weight={c['weight'] or 'n/a'})\n"
                f"Reviewer-side description: {c['description'] or '(none provided)'}\n"
                f"NGO response ({wc} words):\n{text or '(no response yet)'}\n"
            )
        digest = "\n".join(sections)

        scope_label = 'grant application' if kind == 'application' else 'donor report'
        grant_title = (grant.title if grant else '') or '(grant)'

        system_prompt = (
            "You are a senior grant reviewer running a pre-submission preview for "
            "the applying NGO. Your job: score their draft the way a real reviewer "
            "would, AND tell them exactly what the reviewer will flag so they can "
            "fix it before submitting.\n\n"
            "For each criterion you must produce:\n"
            "  - predicted_score (0-100) — what the reviewer will likely award\n"
            "  - reviewer_signal — 'strong' (>=75) / 'adequate' (50-74) / 'thin' (<50)\n"
            "  - what_works — one sentence on the strongest thing in this response\n"
            "  - what_a_reviewer_will_flag — one sentence, SPECIFIC and concrete\n"
            "  - concrete_fix — one action the NGO can take in <15 minutes\n\n"
            "Then produce 1-3 top_fixes — the highest-leverage edits that move the\n"
            "predicted overall the most.\n\n"
            "Discipline:\n"
            "  - Be SPECIFIC. 'Add more detail' is useless. 'Add the number of\n"
            "    beneficiaries you trained in 2025' is useful.\n"
            "  - Don't invent. If a response is empty, say 'no response' — don't\n"
            "    pretend the NGO wrote something.\n"
            "  - Be calibrated. A 78-word answer to a 500-word target is thin.\n"
            "  - Match the donor type implied by the criteria (technical funders\n"
            "    want numbers, foundations want stories) — never invent the donor.\n"
        )

        user_message = (
            f"Pre-flight check on this {scope_label}.\n\n"
            f"Grant: {grant_title}\n"
            f"Number of criteria: {len(crits)}\n\n"
            f"Submission digest:\n{digest}\n\n"
            "Return your reviewer-style scoring via the record_preflight tool."
        )

        parsed = AIService._call_claude_tool(
            system_prompt,
            user_message,
            tool_name='record_preflight',
            tool_description='Reviewer-style pre-submission scoring with concrete fixes.',
            tool_schema={
                'type': 'object',
                'properties': {
                    'predicted_overall_score': {'type': 'integer', 'minimum': 0, 'maximum': 100},
                    'predicted_grade': {'type': 'string', 'enum': ['strong', 'adequate', 'thin']},
                    'criteria': {
                        'type': 'array',
                        'items': {
                            'type': 'object',
                            'properties': {
                                'key': {'type': 'string'},
                                'label': {'type': 'string'},
                                'predicted_score': {'type': 'integer', 'minimum': 0, 'maximum': 100},
                                'reviewer_signal': {'type': 'string', 'enum': ['strong', 'adequate', 'thin']},
                                'what_works': {'type': 'string'},
                                'what_a_reviewer_will_flag': {'type': 'string'},
                                'concrete_fix': {'type': 'string'},
                            },
                            'required': ['key', 'predicted_score', 'reviewer_signal',
                                         'what_a_reviewer_will_flag', 'concrete_fix'],
                        },
                    },
                    'top_fixes': {
                        'type': 'array',
                        'items': {
                            'type': 'object',
                            'properties': {
                                'criterion_key': {'type': 'string'},
                                'fix': {'type': 'string'},
                                'leverage': {'type': 'string', 'enum': ['high', 'medium', 'low']},
                            },
                            'required': ['criterion_key', 'fix', 'leverage'],
                        },
                    },
                    'ai_summary': {'type': 'string'},
                },
                'required': ['predicted_overall_score', 'predicted_grade', 'criteria', 'top_fixes'],
            },
            max_tokens=2400,
            endpoint='preflight.predict',
        )

        if not parsed:
            return None

        return {
            'predicted_overall_score': int(parsed.get('predicted_overall_score') or 0),
            'predicted_grade': parsed.get('predicted_grade', 'thin'),
            'criteria': parsed.get('criteria', []),
            'top_fixes': (parsed.get('top_fixes') or [])[:3],
            'ai_summary': (parsed.get('ai_summary') or '').strip(),
        }

    # ------------------------------------------------------------------
    # Heuristic baseline (always available)
    # ------------------------------------------------------------------

    @classmethod
    def _heuristic_summary(cls, crits: list, responses: dict) -> dict:
        rows = []
        scores = []
        for c in crits:
            text = (responses.get(c['key']) or '').strip()
            wc = len(text.split()) if text else 0
            target = c['max_words'] or 500
            pct = min(100, round((wc / target) * 100)) if target else 0
            signal = 'strong' if pct >= 80 else 'adequate' if pct >= 40 else 'thin'
            score = pct
            rows.append({
                'key': c['key'],
                'label': c['label'],
                'predicted_score': score,
                'reviewer_signal': signal,
                'what_works': f'{wc} words written.' if wc else '',
                'what_a_reviewer_will_flag': (
                    'Response is empty.' if wc == 0
                    else f'Length is {pct}% of {target}-word target — reviewers may rate this thin.'
                    if pct < 40 else ''
                ),
                'concrete_fix': (
                    f'Add {max(0, target - wc)} more words covering the criterion in detail.'
                    if wc < target else 'Length is sufficient; tighten where possible.'
                ),
                'word_count': wc,
                'target_words': target,
            })
            scores.append(score)
        overall = round(sum(scores) / len(scores)) if scores else 0
        grade = 'strong' if overall >= 75 else 'adequate' if overall >= 50 else 'thin'
        weakest = sorted(rows, key=lambda r: r['predicted_score'])[:3]
        return {
            'predicted_overall_score': overall,
            'predicted_grade': grade,
            'criteria': rows,
            'top_fixes': [
                {'criterion_key': r['key'],
                 'fix': r['concrete_fix'],
                 'leverage': 'high' if r['predicted_score'] < 40 else 'medium'}
                for r in weakest if r['concrete_fix']
            ],
            'ai_summary': (
                f'Heuristic check: overall predicted {overall}/100. '
                f'AI narration is not currently available — these signals come from '
                f'word-count vs target only.'
            ),
        }
