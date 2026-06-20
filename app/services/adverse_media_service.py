"""
AdverseMediaService — Phase 1 (May 2026 truth-in-claims)
========================================================

Screens an organization (and optionally its leadership) against
public adverse media — negative news coverage, regulatory actions,
investigations, lawsuits, fraud allegations, terror-finance links.

Two-layer approach:

  Layer 1 — Live web search via Anthropic's hosted `web_search` tool
            (the production-grade path). Claude runs targeted
            searches, reads results, and synthesises structured
            findings with REAL URLs as citations.

  Layer 2 — Claude training-knowledge fallback (used when the web
            search tool errors or is rate-limited). Clearly marked
            as `source='claude_training_knowledge'` and surfaced
            with lower AI confidence so operators can request a
            human follow-up.

Both layers return the SAME structured shape:

    {
      'findings': [
        {
          'subject': 'Org Name',
          'severity': 'high' | 'medium' | 'low',
          'category': 'fraud' | 'investigation' | 'regulatory' |
                      'governance' | 'safeguarding' | 'finance' |
                      'sanctions_adjacent' | 'other',
          'headline': 'short title',
          'summary': '2-3 sentence description',
          'url': 'https://...',
          'source': 'Reuters' | 'AP' | etc,
          'published_at': 'YYYY-MM-DD' (best-effort),
          'confidence': 0-100 (per-finding),
        },
        ...
      ],
      'summary': {'high_count': N, 'medium_count': N, 'low_count': N,
                  'overall_status': 'clear'|'review'|'flagged'},
      'ai_notes': 'overall narrative summary, 1-2 paragraphs',
      'source': 'anthropic_web_search' | 'claude_training_knowledge',
      'ai_confidence': 0-100,
    }

Design principles:
  - Claude returns structured tool-use input (no JSON parsing).
  - The model is INSTRUCTED to mark findings as 'low' confidence
    when the URL is generic (homepage) rather than a specific article.
  - Namesake disambiguation: prompt includes country, sector, and
    known context so we don't flag every "World Vision" namesake.
  - Always returns SOMETHING — fallback returns a 'pending' status
    rather than raising, so the UI never breaks.
"""

import logging
import os
from datetime import datetime, timedelta, timezone

from app.services.ai_service import AIService

logger = logging.getLogger('kuja')


class AdverseMediaService:
    """Adverse media screening using Claude + web search."""

    DEFAULT_LOOKBACK_MONTHS = 24
    RESCREEN_DAYS = 90   # When to consider a screening "stale"

    # Severity thresholds (used to derive overall_status from finding counts)
    OVERALL_STATUS_RULES = {
        'flagged': lambda s: s.get('high_count', 0) >= 1,
        'review':  lambda s: s.get('medium_count', 0) >= 1 or s.get('low_count', 0) >= 3,
        'clear':   lambda s: True,
    }

    @classmethod
    def screen(
        cls,
        *,
        org_name: str,
        country: str | None,
        sector: str | None = None,
        leadership: list[str] | None = None,
        lookback_months: int = DEFAULT_LOOKBACK_MONTHS,
    ) -> dict:
        """Run an adverse media screening.

        Returns the structured result. Does NOT persist — caller
        wraps with AdverseMediaScreening DB write.
        """
        leadership = leadership or []
        subjects = [org_name] + [n for n in leadership if n][:5]   # cap personnel

        # Try live web search first
        result = cls._screen_with_web_search(
            org_name=org_name,
            country=country,
            sector=sector,
            leadership=leadership,
            lookback_months=lookback_months,
        )

        # Fallback to training-knowledge if web search failed
        if result is None or result.get('source') == 'error':
            logger.info(
                f"Adverse media: web search unavailable for '{org_name}', "
                "falling back to training-knowledge sweep."
            )
            result = cls._screen_with_training_knowledge(
                org_name=org_name,
                country=country,
                sector=sector,
                leadership=leadership,
                lookback_months=lookback_months,
            )

        # Last-resort: structural pending response so UI never breaks
        if result is None:
            return {
                'subjects': subjects,
                'findings': [],
                'summary': {
                    'high_count': 0,
                    'medium_count': 0,
                    'low_count': 0,
                    'overall_status': 'pending',
                },
                'ai_notes': 'Adverse media screening could not complete. '
                            'Please retry; if the issue persists, contact admin.',
                'source': 'error',
                'ai_confidence': 0,
            }

        result['subjects'] = subjects
        return result

    # =====================================================================
    # Layer 1 — Live web search
    # =====================================================================

    @classmethod
    def _screen_with_web_search(
        cls,
        *,
        org_name: str,
        country: str | None,
        sector: str | None,
        leadership: list[str],
        lookback_months: int,
    ) -> dict | None:
        """Use Anthropic's hosted web_search tool to find real adverse mentions.

        Returns None if web search is unavailable (older SDK, no
        permission, network failure), so caller can fall back.
        """
        client = AIService._get_client()
        if not client:
            return None

        anthropic_web_search_enabled = os.getenv('ANTHROPIC_WEB_SEARCH', '1').lower() in ('1', 'true', 'yes')
        if not anthropic_web_search_enabled:
            logger.info("Adverse media: ANTHROPIC_WEB_SEARCH disabled, skipping web layer.")
            return None

        system_prompt = cls._build_system_prompt(
            mode='web_search',
            country=country,
            sector=sector,
            lookback_months=lookback_months,
        )
        user_message = cls._build_user_message(
            org_name=org_name,
            country=country,
            sector=sector,
            leadership=leadership,
            lookback_months=lookback_months,
        )

        # Combine: web_search (Anthropic-hosted) + record_findings (client-side schema)
        tools = [
            {
                "type": "web_search_20250305",
                "name": "web_search",
                "max_uses": 6,    # Cap searches to control cost
            },
            {
                "name": "record_findings",
                "description": (
                    "Submit the final structured list of adverse media findings "
                    "after completing the web searches. Call this exactly once."
                ),
                "input_schema": cls._findings_schema(),
            },
        ]

        try:
            import time
            t0 = time.monotonic()
            message = client.with_options(timeout=120).messages.create(
                model="claude-sonnet-4-6",
                max_tokens=4096,
                system=system_prompt,
                tools=tools,
                messages=[{"role": "user", "content": user_message}],
            )
            latency_ms = int((time.monotonic() - t0) * 1000)

            # Find the record_findings tool_use block
            parsed = None
            for block in (message.content or []):
                if getattr(block, 'type', '') == 'tool_use' and getattr(block, 'name', '') == 'record_findings':
                    parsed = block.input
                    break

            if not parsed:
                logger.warning(
                    f"Adverse media: web_search returned no record_findings block for '{org_name}'. "
                    f"stop_reason={getattr(message, 'stop_reason', '-')}"
                )
                return None

            findings = parsed.get('findings', []) or []
            summary = cls._compute_summary(findings)
            ai_notes = parsed.get('overall_summary', '') or ''

            logger.info(
                f"AI_CALL endpoint=adverse_media.web_search org='{org_name}' "
                f"latency_ms={latency_ms} findings={len(findings)} status={summary['overall_status']}"
            )

            return {
                'findings': cls._normalize_findings(findings),
                'summary': summary,
                'ai_notes': ai_notes,
                'source': 'anthropic_web_search',
                'ai_confidence': 85,    # High — web-grounded
            }
        except Exception as e:
            logger.warning(f"Adverse media web_search failed for '{org_name}': {e}")
            return None

    # =====================================================================
    # Layer 2 — Training-knowledge fallback
    # =====================================================================

    @classmethod
    def _screen_with_training_knowledge(
        cls,
        *,
        org_name: str,
        country: str | None,
        sector: str | None,
        leadership: list[str],
        lookback_months: int,
    ) -> dict | None:
        """Fallback: use Claude's training knowledge.

        Lower confidence + clearly labelled so operators understand
        the result is not a live-news sweep.
        """
        system_prompt = cls._build_system_prompt(
            mode='training_knowledge',
            country=country,
            sector=sector,
            lookback_months=lookback_months,
        )
        user_message = cls._build_user_message(
            org_name=org_name,
            country=country,
            sector=sector,
            leadership=leadership,
            lookback_months=lookback_months,
        )

        parsed = AIService._call_claude_tool(
            system_prompt,
            user_message,
            tool_name='record_findings',
            tool_description=(
                'Record structured adverse media findings based on training knowledge. '
                'Mark each finding with confidence reflecting how recent/specific the recollection is.'
            ),
            tool_schema=cls._findings_schema(),
            max_tokens=2048,
            endpoint='adverse_media.training_fallback',
        )

        if not parsed:
            return None

        findings = parsed.get('findings', []) or []
        summary = cls._compute_summary(findings)
        ai_notes = parsed.get('overall_summary', '') or ''

        return {
            'findings': cls._normalize_findings(findings, default_confidence=50),
            'summary': summary,
            'ai_notes': (
                (ai_notes + ' ') if ai_notes else ''
            ) + (
                'Note: this screening drew on the model\'s training data rather than a live web search. '
                'Treat findings as starting points for human verification.'
            ),
            'source': 'claude_training_knowledge',
            'ai_confidence': 50,    # Lower — no live grounding
        }

    # =====================================================================
    # Prompts + schema
    # =====================================================================

    @classmethod
    def _build_system_prompt(
        cls,
        *,
        mode: str,
        country: str | None,
        sector: str | None,
        lookback_months: int,
    ) -> str:
        country_line = f"Operating country: {country}." if country else "Operating country: unknown."
        sector_line = f"Sector: {sector}." if sector else ""
        lookback_line = f"Lookback window: last {lookback_months} months."

        base = (
            "You are an experienced due-diligence analyst screening a non-profit "
            "organisation (NGO) on behalf of an institutional donor. Your goal is "
            "to find adverse media — public reporting that a reasonable donor would "
            "want to know about before approving a grant.\n\n"
            "What counts as adverse media:\n"
            "  - fraud, embezzlement, financial mismanagement allegations\n"
            "  - regulatory enforcement actions (registration revoked, audits failed)\n"
            "  - investigations (criminal, parliamentary, donor-initiated)\n"
            "  - safeguarding incidents (PSEAH, child protection breaches)\n"
            "  - governance failures (board resignations en masse, CEO removed)\n"
            "  - serious lawsuits (active or recent)\n"
            "  - sanctions-adjacent risk (links to designated entities)\n"
            "  - terror-finance or counter-terror-finance concerns\n\n"
            "What does NOT count (do not flag these):\n"
            "  - normal news coverage of programs\n"
            "  - critical opinion pieces without factual allegations\n"
            "  - government press releases mentioning the org positively\n"
            "  - generic 'NGO sector under scrutiny' articles\n\n"
            "Namesake discipline:\n"
            "  - Many NGO names are shared (e.g. multiple 'Hope Foundation'). "
            "Use the country, sector, and any historical context to disambiguate. "
            "If you cannot be sure the finding refers to THIS organisation, mark "
            "it 'low' severity and 'low' confidence and note the ambiguity in the summary.\n\n"
            f"{country_line}\n"
            f"{sector_line}\n"
            f"{lookback_line}\n\n"
        )

        if mode == 'web_search':
            base += (
                "Method: use the web_search tool. Run 2-5 targeted searches. "
                "Read the actual results — don't fabricate URLs. Include the real "
                "URLs of articles you find. If a search returns nothing relevant, "
                "DON'T invent findings.\n\n"
                "After your searches, call record_findings exactly once with the "
                "consolidated structured findings.\n\n"
                "If you find nothing adverse, call record_findings with an empty "
                "findings array — that's a 'clear' result, not a failure.\n"
            )
        else:
            base += (
                "Method: draw on your training knowledge. You do NOT have live web access. "
                "Only report findings you remember from real news coverage in the lookback window. "
                "DO NOT invent URLs — if you can't recall a specific source URL, leave the url "
                "field empty rather than guessing.\n\n"
                "Be CONSERVATIVE: under-report rather than fabricate. A human will follow up "
                "on whatever you surface, and false positives waste their time.\n\n"
                "Call record_findings exactly once with the consolidated findings. "
                "An empty list is fine.\n"
            )

        return base

    @classmethod
    def _build_user_message(
        cls,
        *,
        org_name: str,
        country: str | None,
        sector: str | None,
        leadership: list[str],
        lookback_months: int,
    ) -> str:
        parts = [
            f"Screen the following organisation for adverse media (last {lookback_months} months):",
            "",
            f"Organisation: {org_name}",
            f"Country: {country or 'unknown'}",
        ]
        if sector:
            parts.append(f"Sector: {sector}")
        if leadership:
            named = ", ".join(leadership[:5])
            parts.append(f"Leadership (also screen these names): {named}")
        parts.append("")
        parts.append(
            "Return all findings via the record_findings tool. "
            "If nothing is found, return an empty findings list."
        )
        return "\n".join(parts)

    @classmethod
    def _findings_schema(cls) -> dict:
        return {
            "type": "object",
            "properties": {
                "findings": {
                    "type": "array",
                    "description": "List of adverse media findings. Empty if nothing found.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "subject": {
                                "type": "string",
                                "description": "The organisation or person this finding refers to.",
                            },
                            "severity": {
                                "type": "string",
                                "enum": ["high", "medium", "low"],
                            },
                            "category": {
                                "type": "string",
                                "enum": [
                                    "fraud",
                                    "investigation",
                                    "regulatory",
                                    "governance",
                                    "safeguarding",
                                    "finance",
                                    "lawsuit",
                                    "sanctions_adjacent",
                                    "other",
                                ],
                            },
                            "headline": {"type": "string"},
                            "summary": {
                                "type": "string",
                                "description": "2-3 sentence description.",
                            },
                            "url": {
                                "type": "string",
                                "description": "Direct article URL. Leave empty if not available.",
                            },
                            "source": {
                                "type": "string",
                                "description": "Publication name (Reuters, BBC, local paper, etc).",
                            },
                            "published_at": {
                                "type": "string",
                                "description": "ISO date (YYYY-MM-DD) of publication.",
                            },
                            "confidence": {
                                "type": "integer",
                                "minimum": 0,
                                "maximum": 100,
                                "description": (
                                    "How confident that THIS finding is about THIS organisation "
                                    "(not a namesake) and material to the diligence decision."
                                ),
                            },
                        },
                        "required": ["subject", "severity", "category", "headline", "summary"],
                    },
                },
                "overall_summary": {
                    "type": "string",
                    "description": "1-2 paragraph narrative summary of what you found (or didn't).",
                },
            },
            "required": ["findings"],
        }

    # =====================================================================
    # Helpers
    # =====================================================================

    @classmethod
    def _normalize_findings(cls, findings: list[dict], *, default_confidence: int = 70) -> list[dict]:
        out = []
        for f in findings:
            out.append({
                'subject': (f.get('subject') or '').strip(),
                'severity': (f.get('severity') or 'low').lower(),
                'category': (f.get('category') or 'other').lower(),
                'headline': (f.get('headline') or '').strip(),
                'summary': (f.get('summary') or '').strip(),
                'url': (f.get('url') or '').strip(),
                'source': (f.get('source') or '').strip(),
                'published_at': (f.get('published_at') or '').strip(),
                'confidence': int(f.get('confidence', default_confidence)),
            })
        return out

    @classmethod
    def _compute_summary(cls, findings: list[dict]) -> dict:
        high = sum(1 for f in findings if (f.get('severity') or '').lower() == 'high')
        medium = sum(1 for f in findings if (f.get('severity') or '').lower() == 'medium')
        low = sum(1 for f in findings if (f.get('severity') or '').lower() == 'low')

        summary = {'high_count': high, 'medium_count': medium, 'low_count': low}
        for status, rule in cls.OVERALL_STATUS_RULES.items():
            if rule(summary):
                summary['overall_status'] = status
                break
        return summary

    # =====================================================================
    # Staleness check (for rescreening cron)
    # =====================================================================

    @classmethod
    def is_stale(cls, screened_at: datetime | None) -> bool:
        if not screened_at:
            return True
        # Normalize tz
        if screened_at.tzinfo is None:
            screened_at = screened_at.replace(tzinfo=timezone.utc)
        cutoff = datetime.now(timezone.utc) - timedelta(days=cls.RESCREEN_DAYS)
        return screened_at < cutoff
