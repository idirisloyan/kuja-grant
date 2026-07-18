"""ProximateReportCompileService — July 2026.

Turns one partner report package (structured answers + voice-note
transcripts + item captions) into a bilingual donor-facing narrative.
Same shape as the other Proximate extract services: one Claude call
with a tool schema, ALWAYS returns something — when AI is unavailable
the fallback assembles the narrative mechanically from the answers so
the OB review flow never blocks on AI uptime.
"""

import logging
from datetime import datetime, timezone

logger = logging.getLogger('kuja')

MAX_INPUT_CHARS = 20000


def _fallback_narrative(context: str) -> dict:
    return {
        'summary_en': ('Report compiled from the partner\'s structured '
                       'submission. AI narrative was unavailable — the '
                       'figures and evidence below are as submitted.'),
        'summary_ar': 'تم تجميع التقرير من البيانات المقدمة من الشريك.',
        'sections': [],
        'compiled_at': datetime.now(timezone.utc).isoformat(),
        'source': 'fallback',
    }


def compile_report_narrative(*, partner_name: str, round_title: str,
                             answers: dict, activities: list,
                             transcripts: list, captions: list,
                             spend_currency: str = 'SDG') -> dict:
    """One AI call -> {summary_en, summary_ar, sections[]}. Never raises."""
    lines = [
        f'PARTNER: {partner_name}',
        f'ROUND: {round_title}',
        f'SPEND CURRENCY: {spend_currency}',
        f'STRUCTURED ANSWERS: {answers}',
        'APPROVED ACTIVITIES: '
        + '; '.join(f"{a.get('name')} (budget {a.get('budget_lines')})"
                    for a in activities),
    ]
    for qkey, text in transcripts:
        lines.append(f'VOICE ANSWER [{qkey}]: {text}')
    if captions:
        lines.append('EVIDENCE CAPTIONS: ' + ' | '.join(captions))
    context = '\n'.join(lines)[:MAX_INPUT_CHARS]

    try:
        from app.services.ai_service import AIService
    except Exception:
        return _fallback_narrative(context)

    system_prompt = (
        'You are a grants officer at Adeso writing a donor-facing '
        'implementation report for the Proximate Fund (locally-led '
        'humanitarian response in Sudan). You are given a partner\'s '
        'structured figures, voice-note transcripts (often Arabic), and '
        'evidence captions. Write a faithful, dignified narrative: '
        'report ONLY what the material states, never invent figures, '
        'keep amounts in the stated currency, and preserve the '
        'community\'s own priorities and words where possible. Produce '
        'BOTH English and Modern Standard Arabic. Sections to cover '
        'when material exists: What was delivered; Who was reached; '
        'Challenges and adaptations; What the community said; Lessons '
        'and what comes next. Keep each section 2-5 sentences. '
        'IMPORTANT — this narrative goes to donors verbatim: never '
        'mention internal-only, withheld, excluded, or unapproved '
        'evidence, review or approval status, safeguarding decisions, '
        'or test/QA markers, even if a caption or transcript contains '
        'such wording. Describe only the delivered work itself; if a '
        'caption is purely an internal note, silently ignore it.'
    )
    tool_schema = {
        'type': 'object',
        'properties': {
            'summary_en': {'type': 'string'},
            'summary_ar': {'type': 'string'},
            'sections': {
                'type': 'array',
                'items': {
                    'type': 'object',
                    'properties': {
                        'title_en': {'type': 'string'},
                        'title_ar': {'type': 'string'},
                        'body_en': {'type': 'string'},
                        'body_ar': {'type': 'string'},
                    },
                    'required': ['title_en', 'body_en'],
                },
            },
        },
        'required': ['summary_en', 'sections'],
    }
    try:
        parsed = AIService._call_claude_tool(
            system_prompt,
            f'=== PACKAGE MATERIAL ===\n{context}\n=== END ===\n\n'
            'Return the report via the record_report tool.',
            tool_name='record_report',
            tool_description='Bilingual donor report narrative for one '
                             'partner report package.',
            tool_schema=tool_schema,
            max_tokens=4000,
            endpoint='proximate_report_compile',
        )
        if not isinstance(parsed, dict) or not parsed.get('summary_en'):
            return _fallback_narrative(context)
        parsed['compiled_at'] = datetime.now(timezone.utc).isoformat()
        parsed['source'] = 'ai'
        return parsed
    except Exception as e:
        logger.warning(f'report compile AI failed: {e}')
        return _fallback_narrative(context)
