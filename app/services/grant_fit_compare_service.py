"""
GrantFitCompareService — Phase 17C (May 2026).

NGO-facing analog of ApplicationCompareService (Phase 10). NGO picks
2-4 open grants from /grants and asks "which of these is the best fit
for us?" — AI grounds the answer in the NGO's actual profile + recent
delivery history.

Key difference from auto-fill (Phase 10): auto-fill drafts a SUBMISSION
for one grant; this RANKS multiple grants by fit + says which to chase
first and which to skip.

Output is forced JSON via tool-use so the frontend renders the table
deterministically:
  {
    'matrix': [
      { 'grant_id', 'grant_title', 'fit_score', 'effort_score',
        'verdict', 'reasons_to_apply', 'reasons_to_skip' },
      ...
    ],
    'recommended_grant_id': int,
    'recommendation_rationale': str,
    'second_choice_grant_id': int | None,
    'skip_grant_ids': [int],
  }

Cost-tagged endpoint='grant_fit.compare' for the AI budget guard.
"""

import logging

from app.extensions import db
from app.models import Application, Assessment, Grant, Organization, Report

logger = logging.getLogger('kuja')

MAX_GRANTS = 4


class GrantFitCompareService:

    @classmethod
    def compare(cls, *, ngo_org_id: int, grant_ids: list[int]) -> dict | None:
        if not grant_ids:
            return None
        ids = [int(x) for x in grant_ids][:MAX_GRANTS]
        ngo = db.session.get(Organization, ngo_org_id)
        if not ngo or ngo.org_type != 'ngo':
            return None

        grants = (
            Grant.query.filter(Grant.id.in_(ids))
            .options(db.joinedload(Grant.donor_org))
            .all()
        )
        if len(grants) < 2:
            return None

        # NGO context: profile + latest capacity score + win-rate so far
        latest_assess = (
            Assessment.query.filter(Assessment.org_id == ngo_org_id)
            .order_by(Assessment.created_at.desc()).first()
        )
        decided_apps = Application.query.filter(
            Application.ngo_org_id == ngo_org_id,
            Application.status.in_(('awarded', 'rejected')),
        ).count()
        awarded_apps = Application.query.filter(
            Application.ngo_org_id == ngo_org_id,
            Application.status == 'awarded',
        ).count()
        win_rate = (awarded_apps / decided_apps * 100) if decided_apps else None

        # Compact NGO digest
        sectors = ngo.get_sectors() if hasattr(ngo, 'get_sectors') else []
        focus = ngo.get_focus_areas() if hasattr(ngo, 'get_focus_areas') else []
        ngo_digest = (
            f"Name: {ngo.name}\n"
            f"Country: {ngo.country or 'unspecified'}\n"
            f"Sectors: {', '.join(sectors[:6]) if sectors else 'unspecified'}\n"
            f"Focus areas: {', '.join(focus[:6]) if focus else 'unspecified'}\n"
            f"Mission: {(ngo.mission or '')[:600]}\n"
            f"Annual budget band: {ngo.annual_budget or 'unspecified'}\n"
            f"Staff: {ngo.staff_count or 'unspecified'}\n"
            f"Latest capacity score: "
            f"{round(latest_assess.overall_score, 1) if latest_assess and latest_assess.overall_score else 'n/a'}/100\n"
            f"Decided apps to date: {decided_apps} "
            f"(win rate: {round(win_rate, 1) if win_rate is not None else 'n/a'}%)\n"
        )

        grant_blocks = []
        for g in grants:
            elig = g.get_eligibility() if hasattr(g, 'get_eligibility') else []
            elig_summary = '; '.join(
                f"{e.get('label', '')}" for e in (elig or [])[:6] if isinstance(e, dict)
            )
            criteria = g.get_criteria() if hasattr(g, 'get_criteria') else []
            criteria_summary = '; '.join(
                f"{c.get('label', '')}(w={c.get('weight', '?')})"
                for c in (criteria or [])[:6] if isinstance(c, dict)
            )
            sectors_g = ', '.join((g.sectors or [])[:6])
            countries_g = ', '.join((g.countries or [])[:6])
            grant_blocks.append(
                f"### Grant #{g.id}: {g.title}\n"
                f"Donor: {g.donor_org.name if g.donor_org else 'unknown'}\n"
                f"Status: {g.status} | Deadline: {g.deadline}\n"
                f"Funding: {g.total_funding} {g.currency or ''}\n"
                f"Sectors: {sectors_g or 'n/a'}\n"
                f"Countries: {countries_g or 'n/a'}\n"
                f"Eligibility: {elig_summary or 'n/a'}\n"
                f"Criteria: {criteria_summary or 'n/a'}\n"
                f"Description: {(g.description or '')[:600]}\n"
            )
        grants_digest = '\n'.join(grant_blocks)

        try:
            from app.services.ai_service import AIService
        except Exception:
            return None

        system_prompt = (
            "You are a senior grants advisor to an NGO. Given the NGO's "
            "profile + 2-4 open grants, score each grant for FIT (how "
            "well aligned this NGO is with the donor's intent, 0-100) "
            "and for EFFORT (how much work the application + reporting "
            "would be vs. typical applications this NGO has run, 0-100 "
            "where higher means more effort).\n\n"
            "For each grant produce:\n"
            "  - fit_score (0-100)\n"
            "  - effort_score (0-100)\n"
            "  - verdict: one of 'apply' | 'apply_if_capacity' | 'skip'\n"
            "  - reasons_to_apply: 2-3 specific points (cite the grant)\n"
            "  - reasons_to_skip: 1-3 specific risks or misalignments\n\n"
            "Then pick ONE recommended_grant_id (the best fit-effort "
            "tradeoff), an optional second_choice_grant_id, and the "
            "skip_grant_ids list. End with recommendation_rationale: a "
            "single short paragraph (60-100 words) explaining the pick "
            "in plain language the NGO ED would use in a board meeting."
        )

        user_message = (
            f"NGO context:\n{ngo_digest}\n\n"
            f"Grants to compare:\n{grants_digest}\n\n"
            "Return the comparison via the rank_grants tool."
        )

        tool = {
            'name': 'rank_grants',
            'description': 'Return the ranked grant comparison.',
            'input_schema': {
                'type': 'object',
                'properties': {
                    'matrix': {
                        'type': 'array',
                        'items': {
                            'type': 'object',
                            'properties': {
                                'grant_id': {'type': 'integer'},
                                'grant_title': {'type': 'string'},
                                'fit_score': {'type': 'integer'},
                                'effort_score': {'type': 'integer'},
                                'verdict': {
                                    'type': 'string',
                                    'enum': ['apply', 'apply_if_capacity', 'skip'],
                                },
                                'reasons_to_apply': {
                                    'type': 'array',
                                    'items': {'type': 'string'}, 'maxItems': 4,
                                },
                                'reasons_to_skip': {
                                    'type': 'array',
                                    'items': {'type': 'string'}, 'maxItems': 4,
                                },
                            },
                            'required': ['grant_id', 'fit_score', 'effort_score', 'verdict'],
                        },
                    },
                    'recommended_grant_id': {'type': 'integer'},
                    'second_choice_grant_id': {'type': 'integer'},
                    'skip_grant_ids': {
                        'type': 'array', 'items': {'type': 'integer'},
                    },
                    'recommendation_rationale': {'type': 'string'},
                },
                'required': ['matrix', 'recommended_grant_id', 'recommendation_rationale'],
            },
        }

        result = AIService._call_claude_tool(
            system_prompt, user_message, tool,
            max_tokens=2200,
            endpoint='grant_fit.compare',
        )
        if not result:
            return None

        return {
            'success': True,
            'ngo_org_id': ngo_org_id,
            'grant_ids': ids,
            **result,
        }
