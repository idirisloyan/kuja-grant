"""
ApplicationAutofillService — Phase 10 (May 2026).

When an NGO starts a new application, Kuja pre-fills each criterion's
response with a smart draft pulled from their org profile + capacity
passport + prior winning applications + capacity assessment narratives.

This is the "make applying easy" original ask from the founder, made real.

Approach:
  - Per criterion, Claude reads:
      * the criterion's label + description + word target
      * the NGO's org profile (mission, sectors, country, geographic_areas)
      * top-scored prior application responses for similar criteria
        (from past Application rows owned by the same org)
      * latest completed capacity assessment summary
  - Returns a drafted response per criterion with:
      * draft (200-500 words, in the org's tone)
      * confidence (how grounded it is in real org data; 0-100)
      * sources (what the draft drew from)
      * fields_still_needed (what the NGO must write themselves —
        specific numbers, indicators, etc.)

Output is "preview", not "fill" — the NGO sees each section pre-filled
in a preview state and accepts/edits before it becomes the actual draft.

Cached 1h per (org_id, grant_id).
"""

import logging
from datetime import datetime, timezone

from app.extensions import db
from app.models import Organization, Grant, Application, Assessment

logger = logging.getLogger('kuja')


class ApplicationAutofillService:

    MAX_CRITERIA = 12      # cost ceiling — one AI call per criterion
    MAX_PRIOR_APPS = 4     # how many prior apps to feed Claude as exemplars

    @classmethod
    def for_grant(cls, *, grant_id: int, org_id: int) -> dict | None:
        """Build the auto-fill preview for an NGO applying to a grant."""
        grant = db.session.get(Grant, grant_id)
        org = db.session.get(Organization, org_id)
        if not grant or not org:
            return None

        criteria = grant.get_criteria() or []
        if not criteria:
            return {
                'grant_id': grant_id, 'org_id': org_id,
                'source': 'no_input',
                'criteria': [],
                'computed_at': datetime.now(timezone.utc).isoformat(),
                'note': 'Grant has no structured criteria — nothing to autofill.',
            }

        # Build the org context packet (deterministic; no AI cost yet)
        org_context = cls._org_context(org)
        prior_apps = cls._prior_applications_summary(org_id)

        # One AI call covering all criteria — Claude returns a draft per criterion
        ai_result = cls._ai_autofill(
            grant=grant, criteria=criteria[:cls.MAX_CRITERIA],
            org_context=org_context, prior_apps=prior_apps,
        )
        if not ai_result:
            return {
                'grant_id': grant_id, 'org_id': org_id,
                'source': 'unavailable',
                'criteria': [],
                'computed_at': datetime.now(timezone.utc).isoformat(),
                'note': 'AI not available — try again later.',
            }
        ai_result.update({
            'grant_id': grant_id, 'org_id': org_id,
            'source': 'ai',
            'computed_at': datetime.now(timezone.utc).isoformat(),
        })
        return ai_result

    # ------------------------------------------------------------------
    # Org context
    # ------------------------------------------------------------------

    @classmethod
    def _org_context(cls, org: Organization) -> dict:
        ctx = {
            'name': org.name,
            'country': org.country,
            'city': org.city,
            'mission': (org.mission or '')[:1000],
            'description': (org.description or '')[:1000],
            'sectors': org.get_sectors(),
            'focus_areas': org.get_focus_areas(),
            'geographic_areas': org.get_geographic_areas(),
            'year_established': org.year_established,
            'annual_budget': org.annual_budget,
            'staff_count': org.staff_count,
        }
        # Latest completed assessment narrative
        a = (
            Assessment.query.filter_by(org_id=org.id, status='completed')
            .order_by(Assessment.completed_at.desc().nullslast(), Assessment.updated_at.desc())
            .first()
        )
        if a:
            cats = a.get_category_scores() or {}
            gaps = a.get_gaps() or []
            ctx['capacity_assessment'] = {
                'framework': a.framework,
                'overall_score': a.overall_score,
                'top_strengths': cls._top_strengths(cats),
                'top_gaps': [str(g.get('description') or g.get('title') or g)
                             for g in gaps[:3] if g],
            }

        # Trust profile snapshot (use TrustProfileService for consistency)
        try:
            from app.services.trust_profile_service import TrustProfileService
            tp = TrustProfileService.build(org.id)
            if tp:
                ctx['trust_summary'] = {
                    'overall_score': tp.get('overall', {}).get('score'),
                    'capacity_score': tp.get('capacity', {}).get('score'),
                    'diligence_score': tp.get('diligence', {}).get('score'),
                }
        except Exception as e:
            logger.debug(f"trust summary skipped: {e}")

        return ctx

    @staticmethod
    def _top_strengths(category_scores: dict) -> list[str]:
        items = []
        for k, v in (category_scores or {}).items():
            score = v.get('score') if isinstance(v, dict) else v
            if isinstance(score, (int, float)) and score >= 70:
                items.append(f"{k} ({int(score)}/100)")
        return sorted(items, key=lambda s: s.split('(')[1] if '(' in s else '', reverse=True)[:3]

    @classmethod
    def _prior_applications_summary(cls, org_id: int) -> list[dict]:
        """Return top-scored prior apps as compact exemplars."""
        apps = (
            Application.query.filter_by(ngo_org_id=org_id)
            .filter(Application.status.in_(['awarded', 'scored', 'submitted']))
            .order_by(Application.final_score.desc().nullslast(), Application.updated_at.desc())
            .limit(cls.MAX_PRIOR_APPS)
            .all()
        )
        out = []
        for a in apps:
            responses = a.get_responses() or {}
            # Compact: keys + first 240 chars of each value
            sample = {k: (str(v)[:240] if v else '') for k, v in responses.items()}
            out.append({
                'application_id': a.id,
                'grant_title': (a.grant.title if a.grant else ''),
                'final_score': a.final_score,
                'status': a.status,
                'response_excerpts': sample,
            })
        return out

    # ------------------------------------------------------------------
    # AI autofill
    # ------------------------------------------------------------------

    @classmethod
    def _ai_autofill(cls, *, grant, criteria: list, org_context: dict, prior_apps: list) -> dict | None:
        try:
            from app.services.ai_service import AIService
        except Exception:
            return None

        # Compose digest
        crit_blob = "\n".join(
            f"### Criterion: {c.get('label') or c.get('key')} (key={c.get('key') or c.get('id')}, target {c.get('max_words') or 400} words)\n"
            f"Description: {c.get('description', '') or '(none)'}"
            for c in criteria if isinstance(c, dict)
        )

        ctx_blob = (
            f"Org: {org_context.get('name')} ({org_context.get('country')})\n"
            f"Mission: {org_context.get('mission')}\n"
            f"Sectors: {', '.join(org_context.get('sectors') or [])}\n"
            f"Geographic areas: {', '.join(org_context.get('geographic_areas') or [])}\n"
            f"Staff: {org_context.get('staff_count')} · Budget: {org_context.get('annual_budget')} · "
            f"Established: {org_context.get('year_established')}\n"
        )
        if org_context.get('capacity_assessment'):
            ca = org_context['capacity_assessment']
            ctx_blob += (
                f"Capacity ({ca.get('framework')}): overall {ca.get('overall_score')}; "
                f"strengths: {', '.join(ca.get('top_strengths', []))}; "
                f"gaps: {', '.join(ca.get('top_gaps', []))}\n"
            )
        if org_context.get('trust_summary'):
            ts = org_context['trust_summary']
            ctx_blob += (
                f"Trust: overall {ts.get('overall_score')}, "
                f"capacity {ts.get('capacity_score')}, diligence {ts.get('diligence_score')}\n"
            )

        prior_blob = ""
        for p in prior_apps[:cls.MAX_PRIOR_APPS]:
            prior_blob += f"\n--- Prior app {p['application_id']} ({p['grant_title']}, score {p['final_score']}, status {p['status']}) ---\n"
            for k, v in list(p['response_excerpts'].items())[:5]:
                prior_blob += f"  [{k}] {v}\n"

        system_prompt = (
            "You are an NGO grant writer drafting an application on behalf of the NGO. "
            "For each criterion, write a 200-400 word DRAFT response that the NGO can edit. "
            "Use the org's mission and capacity context to ground the draft.\n\n"
            "Discipline:\n"
            "  - Cite SPECIFIC org context (mission, sectors, country, prior numbers) — never invent.\n"
            "  - If a criterion asks for a number you don't have (e.g. 'how many beneficiaries'), "
            "    leave a clear PLACEHOLDER like '[INSERT 2025 BENEFICIARY COUNT]' and add it to "
            "    fields_still_needed.\n"
            "  - Draw on prior app phrasing where the same theme applies, but don't copy verbatim.\n"
            "  - Voice: confident but specific. No buzzwords.\n"
            "  - End each draft with 'CONFIDENCE NOTE:' followed by what the NGO MUST edit before submitting.\n\n"
            "Return your drafts via the record_autofill tool. Per criterion: key, draft, "
            "confidence (0-100), sources_used (which org fields you drew from), "
            "fields_still_needed (specifics the NGO must add). At top level: overall_note "
            "(1-2 sentences on coverage)."
        )

        user_message = (
            f"Grant to apply for: {grant.title}\n"
            f"Grant description: {(grant.description or '')[:600]}\n\n"
            f"NGO context:\n{ctx_blob}\n\n"
            f"Prior NGO applications (use as voice + experience reference):"
            f"{prior_blob or ' (no prior applications on file)'}\n\n"
            f"Criteria to draft for:\n{crit_blob}\n\n"
            "Generate a draft per criterion via the record_autofill tool."
        )

        parsed = AIService._call_claude_tool(
            system_prompt,
            user_message,
            tool_name='record_autofill',
            tool_description='Pre-filled application drafts grounded in org context.',
            tool_schema={
                'type': 'object',
                'properties': {
                    'criteria': {
                        'type': 'array',
                        'items': {
                            'type': 'object',
                            'properties': {
                                'key': {'type': 'string'},
                                'label': {'type': 'string'},
                                'draft': {'type': 'string'},
                                'confidence': {'type': 'integer', 'minimum': 0, 'maximum': 100},
                                'sources_used': {'type': 'array', 'items': {'type': 'string'}},
                                'fields_still_needed': {'type': 'array', 'items': {'type': 'string'}},
                            },
                            'required': ['key', 'draft', 'confidence'],
                        },
                    },
                    'overall_note': {'type': 'string'},
                },
                'required': ['criteria'],
            },
            max_tokens=4096,
            endpoint='application_autofill',
        )

        if not parsed:
            return None
        return {
            'criteria': parsed.get('criteria', []),
            'overall_note': (parsed.get('overall_note') or '').strip(),
        }
