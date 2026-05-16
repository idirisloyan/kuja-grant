"""
ReviewerFollowupsService — Phase 8 (May 2026).

Donor-side AI: given an application (or report), Claude reads the
content and proposes the highest-leverage follow-up questions the
reviewer should ask the NGO before deciding.

Different from pre-flight (which is the NGO-facing "what will reviewers
flag"). This is the donor-facing "what should I ask to break the tie."
Sized to a reviewer's actual workflow: 3 questions, each tagged with
why it matters and what answer would unlock approval.

Output:
  {
    'scope': 'application:<id>' | 'report:<id>',
    'source': 'ai' | 'unavailable',
    'followups': [
      {
        'question': 'Ask this verbatim',
        'why_it_matters': 'unlocks understanding of X',
        'what_strong_answer_looks_like': '...',
        'covers_criterion': 'criterion_key | null',
      },
      ...
    ],
    'computed_at': iso,
  }
"""

import logging
from datetime import datetime, timezone

from app.extensions import db
from app.models import Application, Report

logger = logging.getLogger('kuja')


class ReviewerFollowupsService:

    MAX_FOLLOWUPS = 4

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
        criteria = app.grant.get_criteria() or []
        responses = app.get_responses() or {}
        return cls._run(
            scope=f'application:{application_id}',
            grant_title=app.grant.title or '',
            criteria=criteria, content=responses, kind='application',
        )

    @classmethod
    def for_report(cls, report_id: int) -> dict | None:
        rpt = db.session.get(Report, report_id)
        if not rpt:
            return None
        return cls._run(
            scope=f'report:{report_id}',
            grant_title=(rpt.grant.title if rpt.grant else ''),
            criteria=[], content=rpt.get_content() or {}, kind='report',
        )

    @classmethod
    def _run(cls, *, scope: str, grant_title: str, criteria: list, content: dict, kind: str) -> dict:
        try:
            from app.services.ai_service import AIService
        except Exception:
            return cls._empty(scope, 'unavailable')

        # Compact digest the model can reason over
        sections = []
        if criteria:
            for c in criteria[:10]:
                if not isinstance(c, dict):
                    continue
                key = str(c.get('key') or c.get('id') or c.get('label', '')[:32])
                label = c.get('label') or key
                text = (content.get(key) or '').strip()
                sections.append(
                    f"### Criterion: {label} (key={key})\n"
                    f"NGO response ({len(text.split())} words):\n{text[:1200] or '(empty)'}\n"
                )
        else:
            for k, v in list(content.items())[:10]:
                sections.append(f"### Section: {k}\n{str(v)[:1200]}\n")
        digest = "\n".join(sections) or '(no content provided)'

        system_prompt = (
            "You are a senior grant reviewer. Read the NGO's submission and propose "
            "3–4 follow-up questions you would ask before deciding. Each question "
            "should be the SINGLE question that would unlock the most progress on "
            "your decision — not a question whose answer you can already guess from "
            "the text in front of you.\n\n"
            "For each follow-up include:\n"
            "  - question (verbatim, asked as if you were emailing the NGO)\n"
            "  - why_it_matters (one sentence on what this resolves)\n"
            "  - what_strong_answer_looks_like (one sentence; gives the NGO calibration)\n"
            "  - covers_criterion (the criterion key this targets, or empty string)\n\n"
            "Discipline:\n"
            "  - Be specific. 'Can you explain your monitoring approach?' is weak. "
            "'How will you verify the 800 beneficiary number when you don't run baseline surveys?' is strong.\n"
            "  - Don't ask things the text already answers.\n"
            "  - Prioritise questions that change the decision, not nice-to-haves."
        )
        user_message = (
            f"Grant: {grant_title or '(unspecified)'}\n"
            f"Submission digest ({kind}):\n{digest}\n\n"
            "Return up to 4 follow-up questions via the record_followups tool."
        )

        parsed = AIService._call_claude_tool(
            system_prompt, user_message,
            tool_name='record_followups',
            tool_description='Reviewer follow-up questions for an NGO submission.',
            tool_schema={
                'type': 'object',
                'properties': {
                    'followups': {
                        'type': 'array',
                        'items': {
                            'type': 'object',
                            'properties': {
                                'question': {'type': 'string'},
                                'why_it_matters': {'type': 'string'},
                                'what_strong_answer_looks_like': {'type': 'string'},
                                'covers_criterion': {'type': 'string'},
                            },
                            'required': ['question', 'why_it_matters'],
                        },
                    },
                },
                'required': ['followups'],
            },
            max_tokens=1400,
            endpoint='reviewer_followups',
        )

        if not parsed:
            return cls._empty(scope, 'unavailable')

        followups = (parsed.get('followups') or [])[:cls.MAX_FOLLOWUPS]
        return {
            'scope': scope,
            'source': 'ai',
            'followups': followups,
            'computed_at': datetime.now(timezone.utc).isoformat(),
        }

    @staticmethod
    def _empty(scope: str, source: str) -> dict:
        return {
            'scope': scope, 'source': source, 'followups': [],
            'computed_at': datetime.now(timezone.utc).isoformat(),
        }
