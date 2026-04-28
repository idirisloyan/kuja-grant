"""Kuja Co-pilot AI service.

Phase 2 of the category-defining upgrade. Hosts the new AI capabilities the
team brief identified as missing:

  - donor_portfolio_insights      — risk + opportunity narrative for donor's portfolio
  - donor_grant_copilot           — co-pilot for grant design (criteria/rubric/reqs)
  - ngo_readiness                 — holistic application-level coaching
  - ngo_application_coach         — section-aware progressive coach
  - reviewer_recommendation       — structured reviewer brief with comparisons
  - reviewer_rubric_justify       — pre-fill rationale per rubric criterion
  - proactive_report              — draft an upcoming report from prior data
  - cross_grant_patterns          — pattern detection across donor's declined apps
  - insight_narrate               — universal "what does this chart mean" caption
  - chat_stream                   — SSE-streamed chat replacing blocking /api/ai/chat
  - context_suggestions           — per-page suggested next actions for the co-pilot rail

All methods return a typed result dict:
    {'ok': True, 'data': {...}, 'meta': {'tokens_in': N, 'tokens_out': N, 'model': '...', 'duration_ms': N}}
    {'ok': False, 'code': 'NO_AI'|'NO_DATA'|'AI_FAILED'|'FORBIDDEN', 'message': '...'}

No silent template fallbacks here — failures are visible to the UI.
The chat_stream method yields NDJSON-shaped dicts the route turns into SSE.

Thread persistence + observability log writes happen in routes (so the
service stays unit-testable without DB), or via the `log_call` helper at
the bottom which routes can use.
"""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from typing import Any, Generator, Optional

try:
    import anthropic  # type: ignore
    HAS_ANTHROPIC = True
except Exception:
    HAS_ANTHROPIC = False
    anthropic = None  # type: ignore

import os

logger = logging.getLogger(__name__)

ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY')
MODEL_PRIMARY = "claude-sonnet-4-20250514"
MODEL_FAST = "claude-haiku-4-5-20251001"


class CopilotService:
    """Stateless service. Each call is independent."""

    _client = None

    @classmethod
    def _get_client(cls):
        if cls._client is None and HAS_ANTHROPIC and ANTHROPIC_API_KEY:
            cls._client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY, timeout=120.0)
        return cls._client

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @classmethod
    def _call(cls, system: str, user: str, *, max_tokens: int = 1024,
              model: str = MODEL_PRIMARY, lang: str = 'en') -> dict:
        """Single non-streaming call. Returns typed result.

        Includes one retry on transient failures (anthropic.APIConnectionError,
        APITimeoutError, RateLimitError) with a short backoff.
        """
        client = cls._get_client()
        if not client:
            return {'ok': False, 'code': 'NO_AI', 'message': 'AI not configured'}

        if lang and lang != 'en':
            from app.utils.i18n import LANG_NAMES
            if lang in LANG_NAMES:
                system += f"\n\nIMPORTANT: Respond entirely in {LANG_NAMES[lang]}."

        attempts = 0
        last_err = None
        while attempts < 2:
            attempts += 1
            t0 = time.time()
            try:
                msg = client.messages.create(
                    model=model,
                    max_tokens=max_tokens,
                    system=system,
                    messages=[{'role': 'user', 'content': user}],
                )
                usage = getattr(msg, 'usage', None)
                tin = getattr(usage, 'input_tokens', 0) if usage else 0
                tout = getattr(usage, 'output_tokens', 0) if usage else 0
                text = msg.content[0].text if msg.content else ''
                return {
                    'ok': True,
                    'data': {'text': text},
                    'meta': {
                        'tokens_in': tin, 'tokens_out': tout, 'model': model,
                        'duration_ms': int((time.time() - t0) * 1000),
                    },
                }
            except Exception as e:  # noqa: BLE001
                last_err = e
                logger.warning(f"copilot._call attempt {attempts} failed: {e}")
                if attempts < 2:
                    time.sleep(1.5)
                    continue
                break

        return {
            'ok': False,
            'code': 'AI_FAILED',
            'message': f"AI call failed: {last_err}",
        }

    @classmethod
    def _call_json(cls, system: str, user: str, schema_hint: str,
                   *, max_tokens: int = 2048, model: str = MODEL_PRIMARY,
                   lang: str = 'en') -> dict:
        """Force JSON output. Returns parsed JSON in data."""
        full_system = (
            system
            + "\n\nRespond with VALID JSON ONLY matching this shape:\n"
            + schema_hint
            + "\n\nDo not include any prose outside the JSON. No markdown fences."
        )
        res = cls._call(full_system, user, max_tokens=max_tokens, model=model, lang=lang)
        if not res['ok']:
            return res
        text = res['data']['text'].strip()
        # Strip code fences if Claude added them
        if text.startswith('```'):
            text = text.split('\n', 1)[1] if '\n' in text else text
            if text.endswith('```'):
                text = text.rsplit('```', 1)[0]
            text = text.strip()
        try:
            parsed = json.loads(text)
            return {'ok': True, 'data': parsed, 'meta': res['meta']}
        except json.JSONDecodeError as e:
            logger.warning(f"copilot JSON parse failed: {e} — text starts: {text[:200]}")
            return {'ok': False, 'code': 'AI_FAILED', 'message': f"AI returned invalid JSON: {e}"}

    # ------------------------------------------------------------------
    # 1. Donor portfolio insights
    # ------------------------------------------------------------------

    @classmethod
    def donor_portfolio_insights(cls, *, donor_org_id: int, snapshot: dict,
                                  lang: str = 'en') -> dict:
        """Synthesize a portfolio-level narrative for a donor.

        snapshot is a pre-aggregated dict the route assembles from DB:
            {
              'active_grants': N, 'pending_apps': N, 'overdue_reports': N,
              'recent_apps': [{title, ngo, ai_score, status}, ...],
              'risk_grants': [{name, ngo, risk_reason}, ...],
              'compliance_alerts': [...],
            }

        Returns: {ok, data: {headline, sections:[{title, body, severity}], next_decisions:[...]}}
        """
        system = (
            "You are Kuja's portfolio analyst for a grant-making donor. "
            "Read the snapshot and produce a SHORT actionable briefing — "
            "what's working, what needs attention TODAY, and what decisions "
            "the donor team should make this week. Be concrete, name specific "
            "grants/NGOs, and avoid generic advice. Never fabricate names — "
            "only reference items in the snapshot."
            "\n\n"
            "EVERY next_decision MUST include an `action_type` field set to one of:\n"
            "  - review_applications: donor should triage pending applications in their queue\n"
            "  - review_compliance: donor should look at flagged grantee compliance\n"
            "  - review_reports: donor should review submitted/overdue grantee reports\n"
            "  - create_grant: donor should design and publish a new grant call\n"
            "  - manage_grants: donor should adjust an existing grant (criteria, deadline, etc.)\n"
            "  - assign_reviewers: donor should assign reviewers to scored applications\n"
            "  - other: catch-all when none of the above fits\n"
            "Pick the most direct action_type; do not default to 'other' unless nothing fits."
        )
        user = (
            "PORTFOLIO SNAPSHOT:\n"
            + json.dumps(snapshot, indent=2, default=str)[:30000]
            + "\n\nProduce the briefing."
        )
        schema = """{
  "headline": "1-sentence portfolio mood",
  "sections": [
    {"title": "...", "body": "...", "severity": "critical|warn|info|good"}
  ],
  "next_decisions": [
    {"title": "...", "detail": "...", "severity": "critical|warn|info",
     "action_type": "review_applications|review_compliance|review_reports|create_grant|manage_grants|assign_reviewers|other"}
  ]
}"""
        return cls._call_json(system, user, schema, lang=lang)

    # ------------------------------------------------------------------
    # 2. Donor grant co-pilot (design assistance)
    # ------------------------------------------------------------------

    @classmethod
    def donor_grant_copilot(cls, *, goal: str, thematic: str, geography: str,
                            budget_usd: Optional[int] = None, draft: Optional[dict] = None,
                            lang: str = 'en') -> dict:
        """Help a donor design a grant. Suggests eligibility, scoring rubric,
        reporting requirements, and red-flag exclusions based on goal + context.
        """
        system = (
            "You are Kuja's grant-design co-pilot for African development "
            "donors. Given a high-level goal + thematic + geography + draft, "
            "propose a complete grant scaffold: eligibility criteria (3-5), "
            "scoring rubric (4-6 criteria with weights summing to 100), "
            "reporting requirements (3-5), and red-flag exclusions (2-4). "
            "Be specific to African NGO realities (capacity, registration, "
            "safeguarding, M&E maturity). Avoid generic templates.\n\n"
            "ALSO assess the APPLICATION BURDEN this design imposes on "
            "applicants. Burden = estimated time + complexity for a small/"
            "mid-sized NGO to apply. Lower burden attracts more diverse "
            "applicants and reduces incomplete submissions. Score:\n"
            "  - low: <8 hours typical, simple criteria, modest reporting\n"
            "  - medium: 8-16 hours, moderate complexity\n"
            "  - high: >16 hours, dense reporting, niche eligibility\n"
            "Explain WHICH design choices push burden up, so the donor can "
            "decide which trade-offs are worth keeping. If burden is high, "
            "suggest 1-2 specific simplifications that wouldn't compromise "
            "the grant's intent."
        )
        user = (
            f"GOAL: {goal}\n"
            f"THEMATIC: {thematic}\n"
            f"GEOGRAPHY: {geography}\n"
            f"BUDGET: {budget_usd or 'unspecified'} USD\n"
            f"DRAFT (may be empty): {json.dumps(draft or {}, indent=2)[:6000]}"
        )
        schema = """{
  "eligibility": ["...", "..."],
  "scoring_rubric": [{"criterion": "...", "weight": 25, "rationale": "..."}],
  "reporting_requirements": [{"title": "...", "frequency": "quarterly|annual|...", "detail": "..."}],
  "exclusions": ["...", "..."],
  "guidance": "1-2 sentence design note",
  "burden": {
    "score": "low|medium|high",
    "drivers": ["...", "..."],
    "simplifications": ["...", "..."]
  }
}"""
        return cls._call_json(system, user, schema, max_tokens=2800, lang=lang)

    # ------------------------------------------------------------------
    # 3. NGO holistic readiness
    # ------------------------------------------------------------------

    @classmethod
    def ngo_readiness(cls, *, org_summary: dict, recent_apps: list,
                       documents_present: list, pending_reports: list = None,
                       lang: str = 'en') -> dict:
        """Holistic NGO readiness coaching. Score + top blockers + actions.

        Each next_action carries an `action_type` so the UI can route to the
        right destination instead of just opening the co-pilot. This is the
        "AI as workflow, not commentary" shift.
        """
        pending_reports = pending_reports or []
        system = (
            "You are Kuja's NGO readiness coach. Given an organization's "
            "snapshot — capacity, recent applications, documents on file, "
            "pending reports — produce a 0-100 readiness score and the 3 "
            "highest-leverage actions the NGO can take NEXT WEEK to improve "
            "their chances of winning future grants. Be specific. Reference "
            "documents, applications, or reports by name. Don't repeat "
            "generic 'be more transparent' advice. "
            "\n\n"
            "EVERY next_action MUST include an `action_type` field set to one of:\n"
            "  - apply_grant: NGO should browse and apply to an open grant\n"
            "  - submit_report: NGO has a pending/overdue report to submit\n"
            "  - complete_assessment: NGO should run a capacity assessment\n"
            "  - upload_document: NGO should add a missing key document "
            "(audited financials, registration certificate, board minutes, etc.)\n"
            "  - update_profile: NGO should fill in missing org-profile fields\n"
            "  - improve_application: NGO has a draft application that needs "
            "stronger content before submission\n"
            "  - other: catch-all when none of the above fits\n"
            "Pick the most direct action_type; do not default to 'other' unless nothing fits.\n\n"
            "PHASE 11.6 — when the action targets a SPECIFIC application, "
            "report, or grant present in the snapshot, include `target_id` "
            "(integer) so the UI deep-links to that exact entity instead of "
            "the list page. Use the application/report/grant id from RECENT "
            "APPLICATIONS or PENDING REPORTS as appropriate. Omit `target_id` "
            "if the action is generic (e.g. 'browse open grants').\n\n"
            "PHASE 11.5 — TONE: NGO copy must coach, not judge. Replace "
            "'you are missing X' with 'here's how to strengthen this.' Replace "
            "'this is wrong' with 'sharper version.' Highlight progress and "
            "momentum, not gaps. Use confidence-building phrasing."
        )
        user = (
            f"ORG SNAPSHOT:\n{json.dumps(org_summary, indent=2)[:8000]}\n\n"
            f"RECENT APPLICATIONS:\n{json.dumps(recent_apps, indent=2, default=str)[:8000]}\n\n"
            f"DOCUMENTS ON FILE:\n{json.dumps(documents_present, indent=2)[:4000]}\n\n"
            f"PENDING REPORTS:\n{json.dumps(pending_reports, indent=2, default=str)[:4000]}"
        )
        schema = """{
  "readiness_score": 72,
  "headline": "1-sentence summary",
  "subscores": {
    "capacity": 80, "documents": 60, "compliance": 75, "application_quality": 65
  },
  "top_blockers": [
    {"title": "...", "impact_pts": 12, "severity": "critical|warn|info"}
  ],
  "next_actions": [
    {"title": "...", "detail": "...", "estimated_uplift_pts": 8,
     "action_type": "apply_grant|submit_report|complete_assessment|upload_document|update_profile|improve_application|other",
     "target_id": null}
  ]
}"""
        return cls._call_json(system, user, schema, max_tokens=2000, lang=lang)

    # ------------------------------------------------------------------
    # 4. Reviewer recommendation
    # ------------------------------------------------------------------

    @classmethod
    def reviewer_recommendation(cls, *, applications: list, rubric: list,
                                 lang: str = 'en') -> dict:
        """Generate a structured reviewer brief.

        applications: [{id, title, ngo, ai_score, summary, evidence_quotes}]
        rubric: [{criterion, weight}]
        """
        system = (
            "You are Kuja's reviewer co-pilot. Given a set of applications "
            "and the scoring rubric, produce a recommendation matrix: which "
            "apps deserve fund / clarify / decline, with concrete rationale "
            "anchored in evidence quotes. Identify pairs that are unusually "
            "similar (potential coordinated submissions). Be honest about "
            "weak apps, don't soft-pedal."
        )
        user = (
            f"RUBRIC:\n{json.dumps(rubric, indent=2)}\n\n"
            f"APPLICATIONS:\n{json.dumps(applications, indent=2, default=str)[:24000]}"
        )
        schema = """{
  "ranked": [
    {"application_id": 1, "rank": 1, "recommendation": "fund|clarify|decline",
     "rationale": "...", "key_strengths": ["..."], "key_weaknesses": ["..."]}
  ],
  "similarity_alerts": [
    {"application_ids": [3, 7], "reason": "..."}
  ],
  "review_summary": "1-2 sentence overall portfolio note"
}"""
        return cls._call_json(system, user, schema, max_tokens=4000, lang=lang)

    # ------------------------------------------------------------------
    # 5. Cross-grant patterns
    # ------------------------------------------------------------------

    @classmethod
    def cross_grant_patterns(cls, *, declined_apps: list, lang: str = 'en') -> dict:
        """Identify patterns across declined applications."""
        system = (
            "You are Kuja's grants-strategy AI. Look across recently declined "
            "applications and identify the 3-5 most common reasons applications "
            "fall short. Quantify. Suggest how the donor's RFPs / scoring "
            "criteria might be refined to attract stronger applications."
        )
        user = (
            f"DECLINED APPLICATIONS (sample):\n"
            + json.dumps(declined_apps, indent=2, default=str)[:24000]
        )
        schema = """{
  "patterns": [
    {"pattern": "...", "prevalence_pct": 60, "evidence_examples": ["..."],
     "rfp_recommendation": "..."}
  ],
  "summary": "1-2 sentence overarching insight"
}"""
        return cls._call_json(system, user, schema, max_tokens=2500, lang=lang)

    # ------------------------------------------------------------------
    # 6. Insight narration (universal chart caption)
    # ------------------------------------------------------------------

    @classmethod
    def insight_narrate(cls, *, chart_type: str, data: Any, context: str = '',
                         lang: str = 'en') -> dict:
        """Generate a single-sentence "what this means / so what" caption
        for a chart. Uses Haiku for speed/cost.
        """
        system = (
            "You are a data analyst describing a single chart. Output ONE "
            "sentence (max 30 words) explaining the most important takeaway "
            "from the data — not what the chart is showing, but the SO WHAT. "
            "Use plain English. Be concrete with numbers. No preamble."
        )
        user = (
            f"CHART TYPE: {chart_type}\n"
            f"CONTEXT: {context}\n"
            f"DATA: {json.dumps(data, default=str)[:4000]}\n\n"
            "Write the takeaway sentence."
        )
        res = cls._call(system, user, max_tokens=200, model=MODEL_FAST, lang=lang)
        if not res['ok']:
            return res
        return {'ok': True, 'data': {'caption': res['data']['text'].strip()}, 'meta': res['meta']}

    # ------------------------------------------------------------------
    # 7. Page-aware suggestions (Now tab)
    # ------------------------------------------------------------------

    @classmethod
    def context_suggestions(cls, *, role: str, scope: dict, page_state: Optional[dict] = None,
                              lang: str = 'en') -> dict:
        """3-5 actionable next-step suggestions for the user's current page."""
        system = (
            "You are Kuja's contextual co-pilot. Given the user's role, the "
            "page they're on, and a small JSON of relevant state, suggest 3-5 "
            "specific actions they should take next. Each suggestion should "
            "name a concrete thing (a grant title, a missing document, a "
            "deadline) — avoid generic prompts like 'review your dashboard'."
        )
        # Role-aware voice — same data, different lens. NGO gets coached,
        # donor gets briefed, reviewer gets evidence pointers, admin gets
        # operational signals.
        role_voice = {
            'ngo': " VOICE: warm coach. 'You / your team'. Each suggestion unblocks a submission, sharpens a narrative, or closes a gap.",
            'donor': " VOICE: strategic advisor. 'Your portfolio'. Each suggestion is a decision: approve, escalate, reallocate, or follow up.",
            'reviewer': " VOICE: analytical peer. Each suggestion points at evidence to verify, contradictions to reconcile, or scoring inconsistencies to revisit.",
            'admin': " VOICE: operations brief. Each suggestion is a system-level action — a stuck workflow, a compliance backlog, an AI quality signal.",
        }
        if role in role_voice:
            system += role_voice[role]
        user = (
            f"USER ROLE: {role}\n"
            f"SCOPE: {json.dumps(scope)}\n"
            f"STATE: {json.dumps(page_state or {}, default=str)[:6000]}"
        )
        schema = """{
  "suggestions": [
    {"title": "...", "detail": "...", "severity": "critical|major|minor|info",
     "action": "javascript-callable string e.g. nav('grants')"}
  ]
}"""
        return cls._call_json(system, user, schema, max_tokens=1200, lang=lang)

    # ------------------------------------------------------------------
    # 8. Streaming chat
    # ------------------------------------------------------------------

    @classmethod
    def chat_stream(cls, *, question: str, scope: dict, prior_messages: Optional[list] = None,
                     sources: Optional[list] = None, lang: str = 'en',
                     role: Optional[str] = None) -> Generator[dict, None, None]:
        """Stream a chat response. Yields NDJSON-shaped dicts:
              {'type': 'sources', 'items': [...]}
              {'type': 'delta', 'text': '...'}
              {'type': 'done', 'input_tokens': N, 'output_tokens': N}
              {'type': 'error', 'message': '...'}

        Sources are passed in by the route (route does retrieval); this
        method just streams the model output and lets the caller wire
        the sources frame. Keeps concerns separated.
        """
        client = cls._get_client()
        if not client:
            yield {'type': 'error', 'message': 'AI not configured'}
            return

        # Emit sources first so the UI can show "Grounded in N sources"
        # immediately while the model is still warming up.
        yield {'type': 'sources', 'items': sources or []}

        # Base system prompt — shared across roles. Citation discipline,
        # "WHY/SO WHAT/NEXT" structure, and grounding are universal.
        system = (
            "You are Kuja's read-only co-pilot. Answer the user's question "
            "STRICTLY from the provided source documents. Cite sources inline "
            "using exactly this token format: [src:UUID]. If you can't find "
            "the answer in the sources, say so plainly. Be concise. Use "
            "this structure when appropriate:\n"
            "WHY THIS MATTERS / SO WHAT / WHAT NEXT — explicit short labels."
        )

        # Role-aware tone. The same evidence base — but we coach an NGO,
        # advise a donor, support a reviewer, and brief an admin. This
        # differentiation is what makes Kuja's co-pilot feel role-native
        # rather than a generic chatbot bolted on top of the data model.
        role_addendum = {
            'ngo': (
                "\n\nAUDIENCE: NGO program lead. Voice: warm, encouraging, "
                "practical. Use 'you' and 'your team'. Frame everything as "
                "what they can do next — clarify positioning, sharpen the "
                "narrative, unblock the next submission. Never lecture. "
                "Translate compliance language into plain field-team terms."
            ),
            'donor': (
                "\n\nAUDIENCE: Donor portfolio owner. Voice: strategic, "
                "direct, decisional. Use 'your portfolio' and 'your grants'. "
                "Surface risk, allocation patterns, oversight signals, and "
                "trade-offs. Default to a recommendation with a one-line "
                "rationale — not a menu of options. Quantify where you can."
            ),
            'reviewer': (
                "\n\nAUDIENCE: Independent reviewer. Voice: analytical, "
                "neutral, evidence-first. Never advocate for fund/decline — "
                "just surface what the documents support, contradict, or "
                "leave silent. Quote the source when a claim is contested. "
                "Flag inconsistencies between applications without ranking."
            ),
            'admin': (
                "\n\nAUDIENCE: Platform admin / operations. Voice: precise, "
                "operational, throughput-aware. Surface system-level signals "
                "— stuck workflows, compliance backlogs, AI quality drift, "
                "cohort-level patterns. Skip narrative; lead with metrics."
            ),
        }
        if role and role in role_addendum:
            system += role_addendum[role]

        if lang and lang != 'en':
            from app.utils.i18n import LANG_NAMES
            if lang in LANG_NAMES:
                system += f"\n\nRespond in {LANG_NAMES[lang]}."

        # Build context block from sources
        ctx_block = ''
        if sources:
            for s in sources:
                ctx_block += (
                    f"=== [{s.get('kind','?').upper()}] {s.get('reference','')} · "
                    f"{s.get('title','')} · [src:{s.get('doc_id','')}] ===\n"
                    f"{s.get('body','')[:4000]}\n\n"
                )

        msgs = []
        if prior_messages:
            for m in prior_messages[-8:]:  # last 8 turns
                msgs.append({'role': m['role'], 'content': m['content']})
        full_user = (
            f"QUESTION: {question}\n\n"
            f"SOURCE DOCUMENTS:\n{ctx_block}\n\n"
            "Answer with [src:UUID] citations as required."
        )
        msgs.append({'role': 'user', 'content': full_user})

        try:
            with client.messages.stream(
                model=MODEL_PRIMARY,
                max_tokens=2000,
                system=system,
                messages=msgs,
            ) as stream:
                for delta in stream.text_stream:
                    if delta:
                        yield {'type': 'delta', 'text': delta}
                final = stream.get_final_message()
                usage = getattr(final, 'usage', None)
                yield {
                    'type': 'done',
                    'input_tokens': getattr(usage, 'input_tokens', 0) if usage else 0,
                    'output_tokens': getattr(usage, 'output_tokens', 0) if usage else 0,
                    'model': MODEL_PRIMARY,
                }
        except Exception as e:  # noqa: BLE001
            logger.exception("copilot stream failed")
            yield {'type': 'error', 'message': str(e)[:200]}


# ----------------------------------------------------------------------
# Observability helper — routes call this after every AI invocation
# ----------------------------------------------------------------------

def log_call(*, endpoint: str, user_id: Optional[int], result: dict,
             duration_ms: Optional[int] = None) -> None:
    """Record a single AI call to the AICallLog table. Best-effort —
    failures here are swallowed (we don't want logging to break the
    user-facing call)."""
    try:
        from app.extensions import db
        from app.models import AICallLog
        meta = result.get('meta') or {}
        log = AICallLog(
            endpoint=endpoint,
            user_id=user_id,
            success=bool(result.get('ok')),
            duration_ms=duration_ms or meta.get('duration_ms'),
            tokens_in=meta.get('tokens_in'),
            tokens_out=meta.get('tokens_out'),
            model=meta.get('model'),
            error_code=result.get('code') if not result.get('ok') else None,
            error_message=(result.get('message') or '')[:500] if not result.get('ok') else None,
        )
        db.session.add(log)
        db.session.commit()
    except Exception as e:
        logger.warning(f"AICallLog write failed (non-fatal): {e}")
