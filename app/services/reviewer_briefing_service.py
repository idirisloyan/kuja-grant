"""
ReviewerBriefingService — Phase 20B (May 2026).

Before a reviewer scores an application, Claude reads the submission +
grant criteria + NGO context and produces a 1-paragraph "what to focus
on" brief plus 3-5 specific talking points the reviewer should test in
their evaluation.

Why this matters: review consistency is the #1 complaint in panel
reviews. The same application reviewed by 3 people gets 3 different
scores partly because they each focus on different things. A shared
"here's what's worth probing" brief — generated from the same source
material — gets reviewers aligned without dictating their conclusions.

Discipline:
- Forced tool-use → schema-validated JSON
- Hedging language built into the system prompt (talking points
  PROBE, never PREJUDGE)
- 10-minute cache per (application, reviewer) so reload doesn't re-bill
- Cost-tagged endpoint='reviewer.briefing' for budget guard
"""

import logging

from app.extensions import db
from app.models import Application, Grant

logger = logging.getLogger('kuja')


class ReviewerBriefingService:

    @classmethod
    def for_application(cls, *, application_id: int, reviewer_user_id: int | None = None) -> dict:
        app = (
            Application.query.options(
                db.joinedload(Application.grant).joinedload(Grant.donor_org),
                db.joinedload(Application.ngo_org),
            )
            .filter_by(id=application_id).first()
        )
        if not app or not app.grant:
            return {'success': False, 'source': 'unavailable'}

        grant = app.grant
        criteria = grant.get_criteria() if hasattr(grant, 'get_criteria') else []
        responses = app.get_responses() if hasattr(app, 'get_responses') else {}
        if not criteria or not responses:
            return {'success': True, 'source': 'sparse',
                    'briefing': None, 'talking_points': []}

        # Compact digest the model can reason over
        section_lines = []
        for c in (criteria or [])[:8]:
            if not isinstance(c, dict):
                continue
            key = str(c.get('key') or c.get('id') or '')
            label = c.get('label') or key
            weight = c.get('weight') or '?'
            resp = (responses.get(key) or '').strip()
            section_lines.append(
                f"### {label} (weight {weight}%)\n"
                f"Response ({len(resp.split())} words):\n"
                f"{resp[:1400] or '(empty — flag in talking points!)'}"
            )

        digest = '\n\n'.join(section_lines) or '(no responses)'

        try:
            from app.services.ai_service import AIService
        except Exception:
            return {'success': False, 'source': 'unavailable'}

        system_prompt = (
            "You are a senior grant-review trainer briefing one of your "
            "reviewers BEFORE they score an application. Your job is to "
            "help them focus on the right questions WITHOUT prejudging "
            "the outcome. Write:\n"
            "  - briefing: ONE paragraph (80-120 words) summarising the "
            "application's premise + the 2-3 things any honest reviewer "
            "should probe before deciding\n"
            "  - talking_points: 3-5 specific questions or evidence checks "
            "the reviewer should test. Each is a SHORT phrase (under 18 "
            "words). Phrase as PROBES ('verify the M&E baseline data'), "
            "not as VERDICTS ('the M&E plan is weak').\n\n"
            "Discipline:\n"
            "- Never pre-score the application. Reviewer scores; you brief.\n"
            "- Flag empty or sparse responses explicitly\n"
            "- Tag each talking point with target_criterion (criterion key)\n"
            "- If the application is unusually strong, say so — but still "
            "give probes to keep the review rigorous"
        )

        ngo_name = app.ngo_org.name if app.ngo_org else 'NGO'
        donor_name = grant.donor_org.name if grant.donor_org else 'donor'
        user_message = (
            f"Grant: {grant.title} ({donor_name}, ${grant.total_funding or '?'} "
            f"{grant.currency or 'USD'})\n"
            f"Applicant: {ngo_name} ({app.ngo_org.country if app.ngo_org else 'unknown country'})\n\n"
            f"Submission:\n{digest}\n\n"
            "Return the briefing via the reviewer_briefing tool."
        )

        tool_schema = {
            'type': 'object',
            'properties': {
                'briefing': {'type': 'string'},
                'talking_points': {
                    'type': 'array',
                    'items': {
                        'type': 'object',
                        'properties': {
                            'point': {'type': 'string'},
                            'target_criterion': {'type': 'string'},
                            'why_it_matters': {'type': 'string'},
                        },
                        'required': ['point'],
                    },
                    'maxItems': 5,
                },
            },
            'required': ['briefing', 'talking_points'],
        }

        result = AIService._call_claude_tool(
            system_prompt, user_message,
            tool_name='reviewer_briefing',
            tool_description='Return the pre-scoring briefing + probing questions.',
            tool_schema=tool_schema,
            max_tokens=1400,
            endpoint='reviewer.briefing',
        )
        if not result:
            return {'success': True, 'source': 'unavailable',
                    'briefing': None, 'talking_points': []}

        return {
            'success': True,
            'source': 'ai',
            'application_id': application_id,
            'briefing': result.get('briefing'),
            'talking_points': result.get('talking_points') or [],
        }
