"""Network AI surfaces — Phase 38 (May 2026).

Seven AI surfaces specific to the networked-funds workflow:

  1. score_application_against_rubric()       — per-criterion AI scoring
  2. classify_budget_direct_to_community()    — direct/operational/indirect
                                                + ratio + threshold flag
  3. membership_reviewer_brief()              — one-paragraph OB brief
  4. crisis_monitoring_draft_row_narrative()  — narrative for a single row
  5. declaration_draft_assist()               — summary + shortlist suggestion
  6. window_narrative()                       — prose sections of report
  7. cross_window_patterns()                  — patterns across declarations

Every surface:
- Calls AIService._call_claude_tool with a forced schema.
- Returns a deterministic fallback dict when AI is unavailable (so
  the system stays usable when ANTHROPIC_API_KEY isn't set, e.g. CI).
- Never invents amounts or facts; always grounds in the data passed in.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger("kuja")


class NetworkAIService:

    # ==================================================================
    # 1. Application Rubric Scorer
    # ==================================================================

    @classmethod
    def score_application_against_rubric(
        cls,
        *,
        application_text: str,
        rubric_criteria: list[dict],
        org_name: str | None = None,
        window_name: str | None = None,
    ) -> dict:
        """Score one application against every criterion in a window rubric.

        Returns: {
            ok: bool,
            scores: [
                {criterion_id, area, name, score (0-100), evidence, flags[]},
                ...
            ],
            overall_score: float,
            hard_gate_failures: [criterion_id, ...],
            summary: str,
        }
        """
        from app.services.ai_service import AIService

        # Build prompts
        criteria_brief = "\n".join(
            f"- [{c['id']}] ({c['area']}) {c['name']}"
            f" — kind: {c['threshold_kind']}"
            + (f", threshold: {c['threshold_value']}" if c.get("threshold_value") else "")
            + (f". {c['description']}" if c.get("description") else "")
            for c in rubric_criteria
        )
        system = (
            "You are NEAR's grant-scoring assistant. Score the applicant's "
            "submission against EVERY criterion in the rubric. For each criterion:\n"
            "- score: 0-100 (for soft_score) or 100 (passed) / 0 (failed) (for hard_gate)\n"
            "- evidence: 1-2 sentences citing specific application text\n"
            "- flags: array of explicit concerns (missing info, contradictions)\n"
            "Never invent facts. If evidence is absent, score low and flag 'no_evidence'."
        )
        user = (
            f"Organisation: {org_name or '(unknown)'}\n"
            f"Window: {window_name or '(unknown)'}\n\n"
            "Application text:\n"
            f"{application_text[:12000]}\n\n"
            "Rubric criteria:\n"
            f"{criteria_brief}"
        )
        schema = {
            "type": "object",
            "required": ["scores", "overall_score", "summary"],
            "properties": {
                "scores": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "required": ["criterion_id", "score", "evidence"],
                        "properties": {
                            "criterion_id": {"type": "integer"},
                            "score": {"type": "number"},
                            "evidence": {"type": "string"},
                            "flags": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                        },
                    },
                },
                "overall_score": {"type": "number"},
                "summary": {"type": "string"},
            },
        }
        parsed = AIService._call_claude_tool(
            system, user,
            tool_name="score_application_rubric",
            tool_description="Score applicant against window rubric",
            tool_schema=schema,
            max_tokens=3500,
            endpoint="network.score_rubric",
        )
        if not parsed:
            return cls._fallback_rubric_score(rubric_criteria)

        # Compute hard_gate_failures from the scores
        gate_failures = []
        crit_by_id = {c["id"]: c for c in rubric_criteria}
        for s in parsed.get("scores", []):
            cid = s.get("criterion_id")
            c = crit_by_id.get(cid)
            if c and c.get("threshold_kind") == "hard_gate":
                if (s.get("score") or 0) < 100:
                    gate_failures.append(cid)
        return {
            "ok": True,
            "scores": parsed.get("scores", []),
            "overall_score": parsed.get("overall_score", 0),
            "hard_gate_failures": gate_failures,
            "summary": parsed.get("summary", ""),
        }

    @staticmethod
    def _fallback_rubric_score(rubric_criteria: list[dict]) -> dict:
        """Deterministic baseline when AI is unavailable. Marks every
        criterion as 'awaiting_review' so a human knows scoring hasn't
        completed."""
        return {
            "ok": False,
            "scores": [
                {
                    "criterion_id": c["id"],
                    "score": None,
                    "evidence": "AI unavailable — manual review required.",
                    "flags": ["ai_unavailable"],
                }
                for c in rubric_criteria
            ],
            "overall_score": None,
            "hard_gate_failures": [],
            "summary": "AI rubric scorer is currently unavailable. Please score manually.",
        }

    # ==================================================================
    # 2. Direct-to-Community Ratio Classifier
    # ==================================================================

    @classmethod
    def classify_budget_direct_to_community(
        cls,
        *,
        budget_lines: list[dict],
        is_consortium: bool = False,
        threshold_single_pct: float = 80.0,
        threshold_consortium_pct: float = 70.0,
    ) -> dict:
        """Classify each budget line as direct_community / operational /
        indirect and return the direct-to-community ratio.

        budget_lines: [{'item': str, 'amount': float, ...}, ...]
        Returns: {
            ok, classified: [{...,classification, rationale}], total,
            direct_to_community: float, ratio_pct: float,
            threshold_pct: float, meets_threshold: bool, flags: [...]
        }
        """
        from app.services.ai_service import AIService

        if not budget_lines:
            return {"ok": True, "classified": [], "total": 0.0,
                    "direct_to_community": 0.0, "ratio_pct": 0.0,
                    "threshold_pct": (threshold_consortium_pct if is_consortium else threshold_single_pct),
                    "meets_threshold": False, "flags": ["empty_budget"]}

        threshold_pct = threshold_consortium_pct if is_consortium else threshold_single_pct

        # Compact the budget for the prompt
        line_brief = "\n".join(
            f"{i+1}. {b.get('item', '')[:120]} — {b.get('amount', 0)}"
            for i, b in enumerate(budget_lines[:200])
        )
        system = (
            "You are NEAR's budget classifier. For each budget line, decide "
            "the classification:\n"
            "- 'direct_community': money that reaches affected communities "
            "  (cash transfers, food, medicines, shelter, training delivered "
            "  TO beneficiaries, community-staff salaries based in affected area)\n"
            "- 'operational': legitimate operational cost of delivery "
            "  (logistics, transport of supplies, field-team travel, M&E)\n"
            "- 'indirect': overhead / HQ costs / general admin / international "
            "  staff costs / external consultants\n"
            "Cite a 1-line rationale per classification. Don't invent line items."
        )
        user = (
            f"Threshold: {threshold_pct}% direct_community required "
            f"({'consortium' if is_consortium else 'single applicant'}).\n\n"
            "Budget lines (index. item — amount):\n"
            f"{line_brief}"
        )
        schema = {
            "type": "object",
            "required": ["classified"],
            "properties": {
                "classified": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "required": ["index", "classification"],
                        "properties": {
                            "index": {"type": "integer"},
                            "classification": {
                                "type": "string",
                                "enum": ["direct_community", "operational", "indirect"],
                            },
                            "rationale": {"type": "string"},
                        },
                    },
                },
            },
        }
        parsed = AIService._call_claude_tool(
            system, user,
            tool_name="classify_budget",
            tool_description="Classify budget lines for direct-to-community ratio",
            tool_schema=schema,
            max_tokens=3000,
            endpoint="network.classify_budget",
        )
        if not parsed:
            return cls._fallback_budget_classification(budget_lines, threshold_pct)

        # Compute the ratio
        total = sum((b.get("amount") or 0) for b in budget_lines)
        direct = 0.0
        classified_out = []
        cls_by_idx = {c["index"]: c for c in parsed.get("classified", []) if isinstance(c.get("index"), int)}
        flags = []
        for i, b in enumerate(budget_lines):
            ai_row = cls_by_idx.get(i + 1) or {}
            classification = ai_row.get("classification") or "operational"
            amt = float(b.get("amount") or 0)
            if classification == "direct_community":
                direct += amt
            classified_out.append({
                **b,
                "classification": classification,
                "rationale": ai_row.get("rationale", ""),
            })

        ratio_pct = (100.0 * direct / total) if total > 0 else 0.0
        meets = ratio_pct >= threshold_pct
        if not meets:
            flags.append(f"below_threshold_{int(threshold_pct)}pct")

        return {
            "ok": True,
            "classified": classified_out,
            "total": round(total, 2),
            "direct_to_community": round(direct, 2),
            "ratio_pct": round(ratio_pct, 2),
            "threshold_pct": threshold_pct,
            "meets_threshold": meets,
            "flags": flags,
        }

    @staticmethod
    def _fallback_budget_classification(budget_lines, threshold_pct):
        """Conservative fallback: everything classified as operational
        (so ratio = 0%, fails threshold). Forces manual review."""
        return {
            "ok": False,
            "classified": [
                {**b, "classification": "operational",
                 "rationale": "AI unavailable — manual classification required"}
                for b in budget_lines
            ],
            "total": sum((b.get("amount") or 0) for b in budget_lines),
            "direct_to_community": 0.0,
            "ratio_pct": 0.0,
            "threshold_pct": threshold_pct,
            "meets_threshold": False,
            "flags": ["ai_unavailable", "manual_review_required"],
        }

    # ==================================================================
    # 3. Membership Reviewer Brief
    # ==================================================================

    @classmethod
    def membership_reviewer_brief(
        cls, *,
        org_name: str | None,
        country: str | None,
        eligibility_answers: dict,
        capacity_assessment_score: float | None = None,
        required_documents_status: dict | None = None,
        similar_approved: list[str] | None = None,
    ) -> dict:
        """One-paragraph AI brief on a pending membership for the OB.

        Returns: { ok, paragraph, red_flags: [...] }
        """
        from app.services.ai_service import AIService

        # Compact context
        elig = ", ".join(f"{k}={v}" for k, v in (eligibility_answers or {}).items())
        docs = required_documents_status or {}
        doc_pct = 0
        if docs:
            uploaded = sum(1 for v in docs.values()
                           if isinstance(v, dict) and v.get("uploaded"))
            doc_pct = int(100 * uploaded / len(docs)) if docs else 0
        similar = ", ".join(similar_approved or [])[:200]

        system = (
            "You are NEAR's Oversight Body assistant. Produce ONE paragraph "
            "(3-5 sentences) summarising a pending membership application. "
            "Then list red flags as short bullet phrases. "
            "Be honest about gaps. Never invent capacity assessment scores."
        )
        user = (
            f"Org: {org_name or '(unknown)'}\n"
            f"Country: {country or '(unknown)'}\n"
            f"Eligibility answers: {elig}\n"
            f"Capacity assessment score: {capacity_assessment_score if capacity_assessment_score is not None else 'not yet'}\n"
            f"Required-doc completion: {doc_pct}%\n"
            f"Similar approved members (peer comparison): {similar or 'none provided'}\n"
        )
        schema = {
            "type": "object",
            "required": ["paragraph"],
            "properties": {
                "paragraph": {"type": "string"},
                "red_flags": {
                    "type": "array",
                    "items": {"type": "string"},
                },
            },
        }
        parsed = AIService._call_claude_tool(
            system, user,
            tool_name="membership_brief",
            tool_description="One-paragraph membership review brief",
            tool_schema=schema,
            max_tokens=600,
            endpoint="network.membership_brief",
        )
        if not parsed:
            return {
                "ok": False,
                "paragraph": (
                    f"{org_name or 'Applicant'} from {country or 'unknown country'} "
                    f"has completed {doc_pct}% of required documents. "
                    "AI brief unavailable — please review documents and capacity assessment directly."
                ),
                "red_flags": [],
            }
        return {
            "ok": True,
            "paragraph": parsed.get("paragraph", ""),
            "red_flags": parsed.get("red_flags", []),
        }

    # ==================================================================
    # 4. Crisis Monitoring Row Narrative Drafter
    # ==================================================================

    @classmethod
    def crisis_monitoring_draft_row_narrative(
        cls, *,
        country: str,
        event_type: str | None,
        public_news_summary: str | None = None,
        member_signals: list[str] | None = None,
        hdi_band: str | None = None,
    ) -> dict:
        """Draft a single Crisis Monitoring row narrative + suggest the
        4 input bands. Secretariat reviews + edits before publish.

        Returns: { ok, narrative, suggested_bands: {...} }
        """
        from app.services.ai_service import AIService

        signals = "\n".join(f"- {s[:200]}" for s in (member_signals or [])[:5])
        system = (
            "You are NEAR's Crisis Monitoring drafter. Given country + event "
            "context, draft a 2-3 sentence narrative and SUGGEST the 4 input "
            "bands per NEAR's formula:\n"
            "- hdi_band: low_hdi | medium_hdi | high_hdi\n"
            "- gov_capacity_band: low | medium | high\n"
            "- people_impacted_estimate: integer (best estimate, 0 if unknown)\n"
            "- attention_band: low | medium | high (media/donor attention)\n"
            "Be honest about uncertainty. If sources are weak, say so."
        )
        user = (
            f"Country: {country}\n"
            f"Event type: {event_type or '(unknown)'}\n"
            f"Public news summary:\n{(public_news_summary or '(none provided)')[:2000]}\n"
            f"Member-reported signals:\n{signals or '(none)'}\n"
            f"Existing HDI band hint: {hdi_band or '(unknown)'}\n"
        )
        schema = {
            "type": "object",
            "required": ["narrative", "suggested_bands"],
            "properties": {
                "narrative": {"type": "string"},
                "suggested_bands": {
                    "type": "object",
                    "properties": {
                        "hdi_band": {"type": "string"},
                        "gov_capacity_band": {"type": "string"},
                        "people_impacted_estimate": {"type": "integer"},
                        "attention_band": {"type": "string"},
                    },
                },
            },
        }
        parsed = AIService._call_claude_tool(
            system, user,
            tool_name="crisis_row_drafter",
            tool_description="Draft monitoring row narrative + bands",
            tool_schema=schema,
            max_tokens=800,
            endpoint="network.crisis_drafter",
        )
        if not parsed:
            return {
                "ok": False,
                "narrative": (
                    f"{event_type or 'Event'} reported in {country}. "
                    "AI drafter unavailable; please complete narrative + bands manually."
                ),
                "suggested_bands": {},
            }
        return {
            "ok": True,
            "narrative": parsed.get("narrative", ""),
            "suggested_bands": parsed.get("suggested_bands", {}),
        }

    # ==================================================================
    # 5. Declaration Draft Assist
    # ==================================================================

    @classmethod
    def declaration_draft_assist(
        cls, *,
        country: str,
        crisis_type: str | None,
        evidence_narrative: str | None = None,
        members_in_country: list[str] | None = None,
        member_sectors: dict[str, list[str]] | None = None,
        proposed_total_amount: float | None = None,
    ) -> dict:
        """Suggest summary_md + shortlist + per-org amounts for a draft
        emergency declaration.

        Returns: { ok, summary_md, shortlist_suggestions: [{org_name, rationale, amount}], rationale }
        """
        from app.services.ai_service import AIService

        members = "\n".join(f"- {m}" for m in (members_in_country or [])[:30])
        sectors_text = "\n".join(
            f"  {org}: {', '.join(s)}" for org, s in (member_sectors or {}).items()
        )[:1500]
        system = (
            "You are NEAR's emergency declaration drafter. From the crisis "
            "context, propose:\n"
            "1) summary_md: 2-3 short paragraphs covering severity, affected "
            "  population, time-criticality.\n"
            "2) shortlist_suggestions: up to 6 member orgs, each with a "
            "  1-line rationale tied to operational presence + sector fit, "
            "  and a suggested grant amount (split of total proposed).\n"
            "Never invent organisations. Only suggest from the provided list."
        )
        user = (
            f"Country: {country}\n"
            f"Crisis type: {crisis_type or '(unknown)'}\n"
            f"Total proposed: {proposed_total_amount or 'not specified'}\n"
            f"Evidence narrative:\n{(evidence_narrative or '(none)')[:2000]}\n"
            f"Members operating in country:\n{members or '(none)'}\n"
            f"Member sectors:\n{sectors_text or '(no data)'}\n"
        )
        schema = {
            "type": "object",
            "required": ["summary_md", "shortlist_suggestions"],
            "properties": {
                "summary_md": {"type": "string"},
                "shortlist_suggestions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "required": ["org_name", "rationale"],
                        "properties": {
                            "org_name": {"type": "string"},
                            "rationale": {"type": "string"},
                            "amount": {"type": "number"},
                        },
                    },
                },
                "rationale": {"type": "string"},
            },
        }
        parsed = AIService._call_claude_tool(
            system, user,
            tool_name="declaration_draft_assist",
            tool_description="Suggest summary + shortlist for an emergency declaration",
            tool_schema=schema,
            max_tokens=2000,
            endpoint="network.declaration_assist",
        )
        if not parsed:
            return {
                "ok": False,
                "summary_md": (
                    f"## Crisis in {country}\n\n"
                    f"AI declaration drafter unavailable. Please complete summary + shortlist manually."
                ),
                "shortlist_suggestions": [],
                "rationale": "ai_unavailable",
            }
        return {
            "ok": True,
            "summary_md": parsed.get("summary_md", ""),
            "shortlist_suggestions": parsed.get("shortlist_suggestions", []),
            "rationale": parsed.get("rationale", ""),
        }

    # ==================================================================
    # 6. Window Narrative Generator
    # ==================================================================

    @classmethod
    def window_narrative(cls, *, window_report_payload: dict) -> dict:
        """Generate the prose sections of a window report from the
        structured stats. Caller passes WindowReportService.build() output.

        Returns: { ok, overview_md, sla_commentary_md, governance_md, closing_md }
        """
        from app.services.ai_service import AIService

        stats = window_report_payload.get("stats") or {}
        sla = window_report_payload.get("sla") or {}
        window = window_report_payload.get("window") or {}
        fund = window_report_payload.get("fund") or {}

        system = (
            "You are NEAR's report narrator. Draft 4 short prose sections "
            "(2-3 sentences each) describing what happened in this window. "
            "Stick to the numbers provided. Never invent specifics. "
            "Tone: confident, factual, no hyperbole."
        )
        user = (
            f"Window: {window.get('name', '?')} ({fund.get('name', '?')})\n"
            f"Stats: declarations={stats.get('declarations_total')}, "
            f"active={stats.get('declarations_active')}, "
            f"grants={stats.get('grants_total')}, "
            f"NGOs reached={stats.get('ngos_reached')}, "
            f"countries={stats.get('countries_count')}, "
            f"disbursed≈{stats.get('total_disbursed_estimate')}.\n"
            f"SLA: 72h app window hit {sla.get('app_window_hits')}/"
            f"{(sla.get('app_window_hits') or 0) + (sla.get('app_window_misses') or 0)}, "
            f"6-day decision hit {sla.get('decision_hits')}/"
            f"{(sla.get('decision_hits') or 0) + (sla.get('decision_misses') or 0)}."
        )
        schema = {
            "type": "object",
            "required": ["overview_md", "sla_commentary_md", "governance_md", "closing_md"],
            "properties": {
                "overview_md": {"type": "string"},
                "sla_commentary_md": {"type": "string"},
                "governance_md": {"type": "string"},
                "closing_md": {"type": "string"},
            },
        }
        parsed = AIService._call_claude_tool(
            system, user,
            tool_name="window_narrative",
            tool_description="Generate window report prose",
            tool_schema=schema,
            max_tokens=1500,
            endpoint="network.window_narrative",
        )
        if not parsed:
            return {
                "ok": False,
                "overview_md": "AI narrative unavailable.",
                "sla_commentary_md": "",
                "governance_md": "",
                "closing_md": "",
            }
        return {
            "ok": True,
            **{k: parsed.get(k, "") for k in
               ("overview_md", "sla_commentary_md", "governance_md", "closing_md")},
        }

    # ==================================================================
    # 7. Cross-Window Pattern Detector
    # ==================================================================

    @classmethod
    def cross_window_patterns(cls, *, window_summaries: list[dict]) -> dict:
        """Surface patterns across multiple window reports.

        window_summaries: minimal stats per window (from WindowReportService.build).
        Returns: { ok, patterns: [{title, observation, evidence_windows[]}] }
        """
        from app.services.ai_service import AIService
        if not window_summaries:
            return {"ok": True, "patterns": []}

        brief = []
        for w in window_summaries[:12]:
            stats = w.get("stats") or {}
            sla = w.get("sla") or {}
            brief.append(
                f"Window {w.get('window', {}).get('name', '?')}: "
                f"{stats.get('declarations_total', 0)} decls, "
                f"{stats.get('grants_total', 0)} grants, "
                f"72h hit {sla.get('app_window_hits', 0)}/"
                f"{(sla.get('app_window_hits') or 0) + (sla.get('app_window_misses') or 0)}, "
                f"6d hit {sla.get('decision_hits', 0)}/"
                f"{(sla.get('decision_hits') or 0) + (sla.get('decision_misses') or 0)}"
            )
        system = (
            "You are NEAR's pattern detective. Given summary stats across "
            "multiple windows, identify 2-5 patterns worth surfacing to "
            "leadership. Each pattern: title (5-8 words), observation "
            "(2 sentences), evidence_windows (subset of window names that "
            "show this). Don't invent — base patterns ONLY on the data given."
        )
        user = "Window summaries:\n" + "\n".join(brief)
        schema = {
            "type": "object",
            "required": ["patterns"],
            "properties": {
                "patterns": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "required": ["title", "observation"],
                        "properties": {
                            "title": {"type": "string"},
                            "observation": {"type": "string"},
                            "evidence_windows": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                        },
                    },
                },
            },
        }
        parsed = AIService._call_claude_tool(
            system, user,
            tool_name="cross_window_patterns",
            tool_description="Detect patterns across window reports",
            tool_schema=schema,
            max_tokens=1500,
            endpoint="network.cross_window_patterns",
        )
        if not parsed:
            return {"ok": False, "patterns": []}
        return {"ok": True, "patterns": parsed.get("patterns", [])}
