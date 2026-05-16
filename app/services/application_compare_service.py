"""
ApplicationCompareService — Phase 10 (May 2026).

Donor selects 2-3 applications they're considering for the same grant
slot. Claude reads all of them and produces a side-by-side comparison
matrix that highlights the specific differences a reviewer needs to
decide between them:

  - per-criterion winner + WHY (specificity, evidence depth, capacity match)
  - org-level differentiators (capacity passport gaps, sector experience)
  - risk profile differences (registration, adverse media, on-time-rate)
  - recommended decision: "if you can only fund one, pick X because…"
    with confidence + 1-2 caveats

Different from PreflightService (NGO sees their own draft as reviewer
will). Different from ReviewerFollowupsService (questions to ask one
NGO). This is the comparison call: 3 apps competing for 1 slot.

Architecture:
  - Deterministic packet: applicant org metadata + responses-per-criterion
    + their on-time-rate if any past grants + capacity overall + diligence flags
  - Single AI call per compare, cached 30 min per (sorted_app_id_set)
  - Caps at 4 applications max per call (cost + readability)

Output:
  {
    'application_ids': [..., ...],
    'computed_at': iso,
    'source': 'ai' | 'unavailable',
    'criteria': [
      {
        'key': str, 'label': str,
        'winner_application_id': int | null,
        'why': str,
        'per_app': {
          str(app_id): {
            'predicted_score': int,
            'verdict': 'strong'|'adequate'|'thin',
            'reason': str,
          }
        }
      }
    ],
    'org_differentiators': [str, ...],
    'risk_differences': [str, ...],
    'recommendation': {
      'top_pick_application_id': int,
      'confidence': 0-100,
      'rationale': str,
      'caveats': [str, ...],
    }
  }
"""

import logging
from datetime import datetime, timezone

from app.extensions import db
from app.models import Application, Grant, Organization

logger = logging.getLogger('kuja')


class ApplicationCompareService:

    MAX_APPS = 4

    @classmethod
    def compare(cls, application_ids: list[int]) -> dict | None:
        if not application_ids or len(application_ids) < 2:
            return None
        application_ids = application_ids[:cls.MAX_APPS]

        # Load applications with grant + org
        apps = (
            Application.query
            .options(db.joinedload(Application.grant), db.joinedload(Application.ngo_org))
            .filter(Application.id.in_(application_ids))
            .all()
        )
        apps = sorted(apps, key=lambda a: application_ids.index(a.id) if a.id in application_ids else 999)
        if len(apps) < 2:
            return None

        # All apps should be against the same grant (or warn in output)
        grant_ids = {a.grant_id for a in apps}
        if len(grant_ids) > 1:
            logger.info(
                f"ApplicationCompareService: comparing apps from different grants "
                f"({grant_ids}) — caller's choice"
            )
        grant = apps[0].grant
        criteria = (grant.get_criteria() if grant else []) or []

        # Build per-app digest
        app_packets = []
        for a in apps:
            org = a.ngo_org
            responses = a.get_responses() or {}
            # Trust signals: latest sanctions + adverse media + capacity overall
            capacity_summary = cls._capacity_summary(org.id if org else None)
            on_time_rate = cls._on_time_rate(org.id if org else None)
            app_packets.append({
                'application_id': a.id,
                'org_id': org.id if org else None,
                'org_name': org.name if org else f'org #{a.ngo_org_id}',
                'org_country': org.country if org else None,
                'responses': {k: (str(v)[:1500] if v else '') for k, v in responses.items()},
                'capacity_summary': capacity_summary,
                'on_time_rate': on_time_rate,
                'status': a.status,
            })

        ai_result = cls._ai_compare(grant=grant, criteria=criteria, packets=app_packets)
        if not ai_result:
            return {
                'application_ids': [a.id for a in apps],
                'computed_at': datetime.now(timezone.utc).isoformat(),
                'source': 'unavailable',
                'criteria': [],
                'org_differentiators': [],
                'risk_differences': [],
                'recommendation': None,
            }
        ai_result.update({
            'application_ids': [a.id for a in apps],
            'computed_at': datetime.now(timezone.utc).isoformat(),
            'source': 'ai',
        })
        return ai_result

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _capacity_summary(org_id: int | None) -> dict | None:
        if not org_id:
            return None
        try:
            from app.services.trust_profile_service import TrustProfileService
            tp = TrustProfileService.build(org_id)
            if not tp:
                return None
            cap = tp.get('capacity', {})
            dil = tp.get('diligence', {})
            return {
                'capacity_score': cap.get('score'),
                'capacity_status': cap.get('status'),
                'frameworks_completed': cap.get('frameworks_completed'),
                'diligence_score': dil.get('score'),
                'diligence_status': dil.get('status'),
            }
        except Exception as e:
            logger.debug(f"_capacity_summary failed for org {org_id}: {e}")
            return None

    @staticmethod
    def _on_time_rate(org_id: int | None) -> float | None:
        if not org_id:
            return None
        try:
            from app.models import Report
            reports = (
                Report.query.filter_by(submitted_by_org_id=org_id)
                .filter(Report.due_date.isnot(None), Report.submitted_at.isnot(None))
                .order_by(Report.created_at.desc())
                .limit(8).all()
            )
            on_time = sum(1 for r in reports
                          if r.submitted_at and r.due_date and r.submitted_at.date() <= r.due_date)
            total = len(reports)
            return on_time / total if total else None
        except Exception:
            return None

    @classmethod
    def _ai_compare(cls, *, grant, criteria: list, packets: list[dict]) -> dict | None:
        try:
            from app.services.ai_service import AIService
        except Exception:
            return None

        # Build the digest the model reasons over
        grant_title = (grant.title if grant else '') or '(grant)'
        crit_lines = []
        for c in criteria[:10]:
            if not isinstance(c, dict): continue
            label = c.get('label') or c.get('key') or ''
            desc = c.get('description') or ''
            crit_lines.append(f"- {label}: {desc[:200]}")
        crit_blob = "\n".join(crit_lines) or "(no structured criteria; compare on overall fit)"

        app_blocks = []
        for p in packets:
            cap = p.get('capacity_summary') or {}
            otr = p.get('on_time_rate')
            cap_blob = (
                f"capacity={cap.get('capacity_score', 'n/a')}/100 [{cap.get('capacity_status', 'n/a')}]; "
                f"diligence={cap.get('diligence_score', 'n/a')}/100 [{cap.get('diligence_status', 'n/a')}]; "
                f"frameworks={cap.get('frameworks_completed', 0)}; "
                f"on_time_rate={f'{int(otr*100)}%' if otr is not None else 'no past reports'}"
            )
            resp_blob = "\n".join(
                f"  ### {k}\n  {str(v)[:600]}"
                for k, v in list(p.get('responses', {}).items())[:8]
                if v
            ) or "  (no responses submitted)"
            app_blocks.append(
                f"## Application id={p['application_id']} — {p['org_name']} ({p.get('org_country') or '?'})\n"
                f"Org trust signals: {cap_blob}\n"
                f"Status: {p.get('status')}\n"
                f"Responses:\n{resp_blob}\n"
            )

        system_prompt = (
            "You are an institutional grant reviewer comparing two-to-four NGO applications "
            "for the same opportunity. Your job: produce a side-by-side comparison the "
            "donor can use to decide.\n\n"
            "For each criterion you must produce per_app entries with predicted_score "
            "(0-100), verdict (strong/adequate/thin), and a one-line reason. Pick a "
            "winner_application_id per criterion (or null if it's genuinely a tie) with "
            "a one-line WHY that names the specific difference (e.g. 'App #471 quantifies "
            "M&E with monthly survey data; App #472 describes M&E qualitatively only').\n\n"
            "Then produce 1-4 org_differentiators (capacity / experience / track record "
            "differences across orgs) and 1-4 risk_differences (registration, on-time-rate, "
            "diligence signals).\n\n"
            "Finally, produce a recommendation: top_pick_application_id + confidence + "
            "rationale (1-2 sentences) + 1-2 caveats (what would change your mind).\n\n"
            "Discipline:\n"
            "  - Compare on EVIDENCE, not vibe. Cite specific phrases when possible.\n"
            "  - Don't invent data. If a response is empty, that's a finding.\n"
            "  - If all apps are very close, say so in the recommendation rationale.\n"
            "  - Keep org names exactly as written.\n"
        )

        user_message = (
            f"Grant: {grant_title}\n"
            f"Criteria:\n{crit_blob}\n\n"
            f"Applications being compared ({len(packets)}):\n\n" +
            "\n\n".join(app_blocks) +
            "\n\nReturn your comparison via the record_comparison tool."
        )

        parsed = AIService._call_claude_tool(
            system_prompt,
            user_message,
            tool_name='record_comparison',
            tool_description='Side-by-side application comparison for a donor reviewer.',
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
                                'winner_application_id': {'type': 'integer'},
                                'why': {'type': 'string'},
                                'per_app': {
                                    'type': 'object',
                                    'description': 'Map of application_id (string) → {predicted_score, verdict, reason}',
                                },
                            },
                            'required': ['label', 'why', 'per_app'],
                        },
                    },
                    'org_differentiators': {
                        'type': 'array', 'items': {'type': 'string'},
                    },
                    'risk_differences': {
                        'type': 'array', 'items': {'type': 'string'},
                    },
                    'recommendation': {
                        'type': 'object',
                        'properties': {
                            'top_pick_application_id': {'type': 'integer'},
                            'confidence': {'type': 'integer', 'minimum': 0, 'maximum': 100},
                            'rationale': {'type': 'string'},
                            'caveats': {'type': 'array', 'items': {'type': 'string'}},
                        },
                        'required': ['top_pick_application_id', 'confidence', 'rationale'],
                    },
                },
                'required': ['criteria', 'recommendation'],
            },
            max_tokens=3000,
            endpoint='application_compare',
        )

        if not parsed:
            return None

        return {
            'criteria': parsed.get('criteria', []),
            'org_differentiators': parsed.get('org_differentiators', []) or [],
            'risk_differences': parsed.get('risk_differences', []) or [],
            'recommendation': parsed.get('recommendation'),
        }
