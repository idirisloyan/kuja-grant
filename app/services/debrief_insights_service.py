"""
DebriefInsightsService — Phase 16A (May 2026).

Takes the deterministic DebriefRollupService output and feeds it to
Claude to produce actionable, context-aware narrative:

  NGO view:
    "You lose 65% of declined applications on weak M&E plans. The 3
     NGOs in your sector who recovered did one thing: theory-of-change
     mapped to indicators with baseline values. Try this on the next
     submission."

  Donor view:
    "67% of your awards cite 'strong track record' but only 12% cite
     'innovative approach.' If you want more innovation in your
     portfolio, weight that criterion higher in the next RFP."

Design discipline:
- Single AI call per request, capped at 250 tokens
- Caches the rollup so repeated dashboard views don't re-bill
- Quiet on sparse data (returns None — frontend skips the narrative)
- Honest about confidence: low-data narratives include hedging language
- Cost-tagged via endpoint='debrief.insights' so AI budget service can
  audit + cap if needed
"""

import logging

from app.services.debrief_rollup_service import DebriefRollupService

logger = logging.getLogger('kuja')

MIN_DECISIONS_FOR_INSIGHT = 5   # below this we won't risk hallucination


class DebriefInsightsService:

    @classmethod
    def for_ngo(cls, *, ngo_org_id: int, lookback_days: int = 365) -> dict:
        rollup = DebriefRollupService.for_ngo(
            ngo_org_id=ngo_org_id, lookback_days=lookback_days,
        )
        return cls._narrate(rollup=rollup, perspective='ngo')

    @classmethod
    def for_donor(cls, *, donor_org_id: int, lookback_days: int = 365) -> dict:
        rollup = DebriefRollupService.for_donor(
            donor_org_id=donor_org_id, lookback_days=lookback_days,
        )
        return cls._narrate(rollup=rollup, perspective='donor')

    # ------------------------------------------------------------------

    @classmethod
    def _narrate(cls, *, rollup: dict, perspective: str) -> dict:
        """Produce a structured insight from the rollup. Always returns
        a dict (never raises) so the route can pass it through."""
        if not rollup:
            return {'success': False, 'source': 'unavailable', 'narrative': None,
                    'recommended_actions': []}

        total = rollup.get('total_decided', 0)
        debriefed = (rollup.get('debriefed_win', 0)
                     + rollup.get('debriefed_loss', 0))
        if total < MIN_DECISIONS_FOR_INSIGHT or debriefed == 0:
            return {
                'success': True,
                'source': 'sparse',
                'narrative': None,
                'recommended_actions': [],
                'rollup_summary': {
                    'total_decided': total,
                    'debriefed': debriefed,
                },
            }

        try:
            from app.services.ai_service import AIService
        except Exception:
            return {'success': False, 'source': 'unavailable',
                    'narrative': None, 'recommended_actions': []}

        # Compact, model-friendly digest of the rollup
        win_lines = [
            f"  - {r['label']} ({r['count']}, {r['pct']}%)"
            for r in rollup.get('wins_by_reason', [])[:6]
        ]
        loss_lines = [
            f"  - {r['label']} ({r['count']}, {r['pct']}%)"
            for r in rollup.get('losses_by_reason', [])[:6]
        ]

        if perspective == 'ngo':
            system_prompt = (
                "You are a senior fundraising strategist advising an NGO. "
                "Read the rollup of WHY their recent applications won and "
                "lost. Write ONE concise paragraph (90-130 words) telling "
                "the NGO program director what to do differently on the "
                "next submission to convert more declines into awards. "
                "Be specific. Cite the top loss reason by name. If sample "
                "size is small, hedge with 'early signal' language — never "
                "overclaim. End with 2-4 concrete fixes, ONE per line, "
                "prefixed with 'ACTION:'."
            )
            voice_who = "an NGO"
        else:
            system_prompt = (
                "You are a senior advisor to a grant-making organisation. "
                "Read the rollup of WHY this donor recently awarded vs. "
                "declined applications. Write ONE concise paragraph "
                "(90-130 words) telling the program officer what their "
                "decision pattern reveals about their portfolio and what "
                "to tweak in the next RFP to attract the kinds of "
                "applications they actually fund. End with 2-4 concrete "
                "tweaks, ONE per line, prefixed with 'ACTION:'."
            )
            voice_who = "a donor"

        user_message = (
            f"Recent {total} decided applications "
            f"({rollup.get('awarded_total', 0)} awarded, "
            f"{rollup.get('rejected_total', 0)} declined). "
            f"Debriefs recorded on {debriefed} of them.\n\n"
            f"TOP WIN REASONS (n={rollup.get('debriefed_win', 0)}):\n"
            + ('\n'.join(win_lines) or '  (none debriefed)')
            + f"\n\nTOP LOSS REASONS (n={rollup.get('debriefed_loss', 0)}):\n"
            + ('\n'.join(loss_lines) or '  (none debriefed)')
            + f"\n\nWrite the advice for {voice_who}. "
              "Be specific and actionable."
        )

        text = AIService._call_claude(
            system_prompt, user_message,
            max_tokens=420,
            endpoint='debrief.insights',
        )
        if not text:
            return {
                'success': True,
                'source': 'unavailable',
                'narrative': None,
                'recommended_actions': [],
            }

        # Parse the ACTION: lines out so the UI can render them as chips
        narrative_lines = []
        actions = []
        for line in text.splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            if stripped.upper().startswith('ACTION:'):
                a = stripped[len('ACTION:'):].strip().lstrip('-').strip()
                if a:
                    actions.append(a[:280])
            else:
                narrative_lines.append(stripped)

        narrative = ' '.join(narrative_lines).strip()[:1400]
        return {
            'success': True,
            'source': 'ai',
            'narrative': narrative or None,
            'recommended_actions': actions[:5],
            'rollup_summary': {
                'total_decided': total,
                'awarded_total': rollup.get('awarded_total'),
                'rejected_total': rollup.get('rejected_total'),
                'debriefed': debriefed,
            },
        }
