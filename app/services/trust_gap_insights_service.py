"""
TrustGapInsightsService — Phase 18A (May 2026).

Takes the deterministic trust profile (TrustProfileService.build) and
asks Claude to produce:
  - 1-paragraph summary of WHERE the gaps are (worst sub-components,
    not just headline scores)
  - 3-5 specific, prioritized actions, each with an estimated point
    impact ("could move you from 65 → 73 if completed")
  - Total estimated lift if all actions are completed

Discipline:
  - Forced tool-use → schema-validated JSON every time
  - Caches 30 minutes (trust profile rarely shifts that fast)
  - Quiet on missing profile (returns source='unavailable')
  - NEVER claims certainty — language is "could", "estimated", "if"
  - Cost-tagged endpoint='trust_gap.insights' for budget guard
"""

import logging

from app.services.trust_profile_service import TrustProfileService

logger = logging.getLogger('kuja')


class TrustGapInsightsService:

    @classmethod
    def for_ngo(cls, *, ngo_org_id: int) -> dict:
        profile = TrustProfileService.build(ngo_org_id)
        if not profile:
            return {'success': False, 'source': 'unavailable'}

        cap = profile.get('capacity', {}) or {}
        dil = profile.get('diligence', {}) or {}
        overall = profile.get('overall', {}) or {}

        # Compact digest the model can reason over
        cap_components = cap.get('components') or []
        dil_components = dil.get('components') or []

        cap_lines = []
        for c in cap_components[:8]:
            if not isinstance(c, dict):
                continue
            cap_lines.append(
                f"  - {c.get('label', c.get('key', '?'))}: "
                f"{c.get('score', 'n/a')}/100 "
                f"(weight {c.get('weight', '?')}, status: {c.get('status', 'n/a')})"
            )

        dil_lines = []
        for c in dil_components[:8]:
            if not isinstance(c, dict):
                continue
            dil_lines.append(
                f"  - {c.get('label', c.get('key', '?'))}: "
                f"{c.get('score', 'n/a')}/100 "
                f"(weight {c.get('weight', '?')}, status: {c.get('status', 'n/a')})"
            )

        digest = (
            f"Org: {profile.get('org_name')} ({profile.get('country') or 'unspecified'})\n"
            f"Sector: {profile.get('sector') or 'unspecified'}\n"
            f"Overall: {overall.get('score')}/100, status: {overall.get('status')}\n\n"
            f"CAPACITY pillar: {cap.get('score')}/100, status: {cap.get('status')}\n"
            + ('\n'.join(cap_lines) or '  (no components)')
            + f"\n\nDILIGENCE pillar: {dil.get('score')}/100, status: {dil.get('status')}\n"
            + ('\n'.join(dil_lines) or '  (no components)')
        )

        try:
            from app.services.ai_service import AIService
        except Exception:
            return {'success': False, 'source': 'unavailable'}

        system_prompt = (
            "You are a senior NGO capacity-building advisor. Read the "
            "trust profile, identify the 3-5 highest-leverage gaps "
            "(weakest sub-components, weighted), and propose specific "
            "actions the NGO should take in order. For each action:\n"
            "  - title: short imperative phrase (e.g. 'Refresh registration certificate')\n"
            "  - detail: 1-2 sentences explaining what + why\n"
            "  - target_component: the sub-component this lifts\n"
            "  - estimated_pillar: 'capacity' or 'diligence'\n"
            "  - estimated_lift_points: realistic point lift on the pillar (1-25)\n"
            "  - effort: 'low' | 'medium' | 'high'\n\n"
            "Plus produce:\n"
            "  - gap_summary: 1 paragraph (60-100 words) — name the weakest "
            "areas, not vague\n"
            "  - total_estimated_lift: integer (sum of action lifts, capped at "
            "30 so we don't overpromise)\n\n"
            "Discipline: always hedge language ('could lift', 'typically'), "
            "never promise certainty. If the profile is already strong "
            "(overall > 80), produce only 1-2 polish actions and an "
            "encouraging summary."
        )
        user_message = (
            f"Trust profile:\n{digest}\n\n"
            "Return your gap analysis via the rank_gap_actions tool."
        )

        tool_schema = {
            'type': 'object',
            'properties': {
                'gap_summary': {'type': 'string'},
                'total_estimated_lift': {'type': 'integer'},
                'actions': {
                    'type': 'array',
                    'items': {
                        'type': 'object',
                        'properties': {
                            'title': {'type': 'string'},
                            'detail': {'type': 'string'},
                            'target_component': {'type': 'string'},
                            'estimated_pillar': {
                                'type': 'string',
                                'enum': ['capacity', 'diligence'],
                            },
                            'estimated_lift_points': {'type': 'integer'},
                            'effort': {
                                'type': 'string',
                                'enum': ['low', 'medium', 'high'],
                            },
                        },
                        'required': ['title', 'estimated_pillar',
                                     'estimated_lift_points', 'effort'],
                    },
                    'maxItems': 6,
                },
            },
            'required': ['gap_summary', 'actions', 'total_estimated_lift'],
        }

        result = AIService._call_claude_tool(
            system_prompt, user_message,
            tool_name='rank_gap_actions',
            tool_description='Return the prioritised list of trust-profile gap actions.',
            tool_schema=tool_schema,
            max_tokens=1800,
            endpoint='trust_gap.insights',
        )
        if not result:
            return {'success': True, 'source': 'unavailable',
                    'gap_summary': None, 'actions': []}

        # Bound + sanity-cap the lift values so the UI never displays
        # "+200 points" hallucinations
        actions = result.get('actions') or []
        for a in actions:
            try:
                a['estimated_lift_points'] = max(0, min(25, int(a.get('estimated_lift_points', 0))))
            except (TypeError, ValueError):
                a['estimated_lift_points'] = 0
        try:
            total = max(0, min(30, int(result.get('total_estimated_lift', 0))))
        except (TypeError, ValueError):
            total = 0

        return {
            'success': True,
            'source': 'ai',
            'org_id': ngo_org_id,
            'current_overall': overall.get('score'),
            'projected_overall': min(100, (overall.get('score') or 0) + total),
            'gap_summary': result.get('gap_summary'),
            'total_estimated_lift': total,
            'actions': actions,
        }
