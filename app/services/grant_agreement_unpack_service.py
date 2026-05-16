"""
GrantAgreementUnpackService — Phase 11 (May 2026).

The single largest source of manual work in NGO grant management is
reading a 30-page signed grant agreement and translating it into a
calendar of deliverables, a budget tracker, a contact list, and a
compliance checklist. This service does that translation.

Given a Grant + the signed agreement document (a Document row with
extracted text), Claude returns a STRUCTURED unpack:

  - reporting_obligations:  [{title, type, frequency, due_pattern,
                              first_due_date, days_after_period}]
  - indicators:             [{name, target, unit, baseline, source}]
  - payment_milestones:     [{label, amount, currency, trigger_date,
                              trigger_condition}]
  - budget_breakdown:       [{category, amount, currency, restriction}]
  - key_contacts:           [{name, role, email, phone}]
  - conditions:             [{title, description, severity, status_default}]
  - restrictive_covenants:  [str, ...]
  - key_dates:              [{label, iso_date, kind}]
  - executive_summary:      1-paragraph what-this-grant-actually-requires

The NGO sees the unpack in a preview UI; can accept individual sections
into Calendar + Reports + Trust Profile checklist. Nothing is persisted
on the org's behalf without explicit accept.

Costs: one AI call per unpack; cached 24h per (grant_id, document_id)
since signed agreements don't change.
"""

import logging
from datetime import datetime, timezone

from app.extensions import db
from app.models import Grant, Document

logger = logging.getLogger('kuja')


class GrantAgreementUnpackService:

    MAX_DOC_TEXT_CHARS = 25000     # generous; signed agreements are long

    @classmethod
    def unpack(cls, *, grant_id: int, document_id: int | None = None) -> dict | None:
        """Run the unpack. Returns the structured dict or None if grant
        not found / no text available."""
        grant = db.session.get(Grant, grant_id)
        if not grant:
            return None

        doc_text = ''
        doc = None
        if document_id:
            doc = db.session.get(Document, document_id)
            if doc:
                doc_text = cls._read_doc_text(doc)

        # If we have no document text but the grant has reporting_requirements
        # stored as text, fall back to that.
        if not doc_text:
            existing = grant.get_reporting_requirements() or []
            if existing:
                # Synthesise text from the structured requirements so the AI
                # can re-organise + enrich them.
                import json
                doc_text = (
                    f"GRANT: {grant.title}\n\n"
                    f"DESCRIPTION: {(grant.description or '')[:1500]}\n\n"
                    f"PRE-CAPTURED REPORTING REQUIREMENTS:\n{json.dumps(existing, indent=2)[:6000]}"
                )

        if not doc_text:
            return cls._empty_result(grant_id, document_id,
                                     'No document text and no captured reporting requirements.')

        ai = cls._ai_unpack(grant=grant, doc_text=doc_text[:cls.MAX_DOC_TEXT_CHARS])
        if not ai:
            return cls._empty_result(grant_id, document_id,
                                     'AI not available — try again later.')

        ai.update({
            'grant_id': grant_id,
            'document_id': document_id,
            'document_name': doc.original_filename if doc else None,
            'source': 'ai',
            'computed_at': datetime.now(timezone.utc).isoformat(),
        })
        return ai

    # ------------------------------------------------------------------

    @classmethod
    def _read_doc_text(cls, doc: Document) -> str:
        """Best-effort: the document's ai_analysis often contains an
        extracted_text or summary field; failing that we just return ''."""
        try:
            analysis = doc.get_ai_analysis() or {}
            for key in ('extracted_text', 'full_text', 'text', 'content'):
                v = analysis.get(key)
                if isinstance(v, str) and len(v.strip()) > 100:
                    return v
            # Fallback to whatever findings the AI captured — better than nothing
            findings = analysis.get('findings') or []
            if findings and isinstance(findings, list):
                return ' '.join(str(f) for f in findings[:30])
        except Exception:
            pass
        return ''

    @classmethod
    def _ai_unpack(cls, *, grant, doc_text: str) -> dict | None:
        try:
            from app.services.ai_service import AIService
        except Exception:
            return None

        grant_title = grant.title or '(grant)'
        grant_desc = (grant.description or '')[:500]
        donor_name = ''
        try:
            from app.models import Organization
            donor = db.session.get(Organization, grant.donor_org_id) if grant.donor_org_id else None
            donor_name = donor.name if donor else ''
        except Exception:
            pass

        system_prompt = (
            "You are an experienced grants-management lawyer reading a signed grant "
            "agreement. Extract everything the grantee needs to know to comply with "
            "this contract over its lifetime.\n\n"
            "Be exhaustive and SPECIFIC. Quote dollar amounts as written. Quote dates as "
            "ISO 8601 (YYYY-MM-DD) when you can resolve them; otherwise leave the "
            "field empty (don't guess). For frequencies use exactly one of: monthly, "
            "quarterly, semi_annual, annual, one_time, final_only.\n\n"
            "For payment milestones: list every disbursement event (advance payment, "
            "milestone payments, final retention). If amounts are percentages of the "
            "total, calculate the absolute amount when total is known.\n\n"
            "For conditions: include MOU requirements, audit triggers, data-sharing "
            "obligations, branding/co-publication rules, IP terms, no-cost extensions, "
            "termination clauses. Set severity to 'critical' for anything that triggers "
            "termination/clawback, 'major' for required actions with penalties, 'minor' "
            "for routine notifications.\n\n"
            "For indicators: include only what's quantified (with target + unit). If "
            "the agreement says 'monitor outcomes' without a target, skip it.\n\n"
            "Write the executive_summary in 2-3 sentences — what does this contract "
            "actually require of the grantee in plain English."
        )

        user_message = (
            f"GRANT: {grant_title}\n"
            f"DONOR: {donor_name or '(unknown)'}\n"
            f"GRANT DESCRIPTION: {grant_desc}\n\n"
            f"=== AGREEMENT TEXT ({len(doc_text)} chars) ===\n"
            f"{doc_text}\n"
            f"=== END ===\n\n"
            "Return the full unpack via the unpack_agreement tool."
        )

        parsed = AIService._call_claude_tool(
            system_prompt,
            user_message,
            tool_name='unpack_agreement',
            tool_description='Structured unpacking of a signed grant agreement.',
            tool_schema=cls._tool_schema(),
            max_tokens=4096,
            endpoint='grant_agreement_unpack',
        )

        if not parsed:
            return None
        # Normalise / cap list lengths to keep response sizes reasonable
        return {
            'executive_summary': (parsed.get('executive_summary') or '').strip(),
            'reporting_obligations': (parsed.get('reporting_obligations') or [])[:30],
            'indicators': (parsed.get('indicators') or [])[:30],
            'payment_milestones': (parsed.get('payment_milestones') or [])[:20],
            'budget_breakdown': (parsed.get('budget_breakdown') or [])[:30],
            'key_contacts': (parsed.get('key_contacts') or [])[:10],
            'conditions': (parsed.get('conditions') or [])[:30],
            'restrictive_covenants': (parsed.get('restrictive_covenants') or [])[:15],
            'key_dates': (parsed.get('key_dates') or [])[:30],
        }

    @staticmethod
    def _tool_schema() -> dict:
        return {
            'type': 'object',
            'properties': {
                'executive_summary': {'type': 'string'},
                'reporting_obligations': {
                    'type': 'array',
                    'items': {
                        'type': 'object',
                        'properties': {
                            'title': {'type': 'string'},
                            'type': {'type': 'string',
                                     'enum': ['financial', 'narrative', 'impact', 'progress', 'final', 'audit']},
                            'frequency': {'type': 'string',
                                          'enum': ['monthly', 'quarterly', 'semi_annual', 'annual', 'one_time', 'final_only']},
                            'first_due_date': {'type': 'string', 'description': 'ISO date or empty'},
                            'days_after_period': {'type': 'integer'},
                            'description': {'type': 'string'},
                        },
                        'required': ['title', 'frequency'],
                    },
                },
                'indicators': {
                    'type': 'array',
                    'items': {
                        'type': 'object',
                        'properties': {
                            'name': {'type': 'string'},
                            'target': {'type': 'string'},
                            'unit': {'type': 'string'},
                            'baseline': {'type': 'string'},
                            'source_of_verification': {'type': 'string'},
                        },
                        'required': ['name'],
                    },
                },
                'payment_milestones': {
                    'type': 'array',
                    'items': {
                        'type': 'object',
                        'properties': {
                            'label': {'type': 'string'},
                            'amount': {'type': 'number'},
                            'currency': {'type': 'string'},
                            'trigger_date': {'type': 'string', 'description': 'ISO date or empty'},
                            'trigger_condition': {'type': 'string'},
                        },
                        'required': ['label'],
                    },
                },
                'budget_breakdown': {
                    'type': 'array',
                    'items': {
                        'type': 'object',
                        'properties': {
                            'category': {'type': 'string'},
                            'amount': {'type': 'number'},
                            'currency': {'type': 'string'},
                            'restriction': {'type': 'string'},
                        },
                        'required': ['category'],
                    },
                },
                'key_contacts': {
                    'type': 'array',
                    'items': {
                        'type': 'object',
                        'properties': {
                            'name': {'type': 'string'},
                            'role': {'type': 'string'},
                            'email': {'type': 'string'},
                            'phone': {'type': 'string'},
                        },
                        'required': ['name'],
                    },
                },
                'conditions': {
                    'type': 'array',
                    'items': {
                        'type': 'object',
                        'properties': {
                            'title': {'type': 'string'},
                            'description': {'type': 'string'},
                            'severity': {'type': 'string', 'enum': ['critical', 'major', 'minor']},
                            'status_default': {'type': 'string', 'enum': ['open', 'mitigating', 'mitigated', 'accepted']},
                        },
                        'required': ['title', 'description'],
                    },
                },
                'restrictive_covenants': {
                    'type': 'array',
                    'items': {'type': 'string'},
                },
                'key_dates': {
                    'type': 'array',
                    'items': {
                        'type': 'object',
                        'properties': {
                            'label': {'type': 'string'},
                            'iso_date': {'type': 'string'},
                            'kind': {'type': 'string',
                                     'enum': ['report_due', 'payment', 'audit', 'closeout', 'extension_deadline', 'other']},
                        },
                        'required': ['label', 'iso_date'],
                    },
                },
            },
            'required': ['executive_summary'],
        }

    @staticmethod
    def _empty_result(grant_id: int, document_id: int | None, note: str) -> dict:
        return {
            'grant_id': grant_id,
            'document_id': document_id,
            'source': 'unavailable',
            'note': note,
            'executive_summary': '',
            'reporting_obligations': [], 'indicators': [],
            'payment_milestones': [], 'budget_breakdown': [],
            'key_contacts': [], 'conditions': [],
            'restrictive_covenants': [], 'key_dates': [],
            'computed_at': datetime.now(timezone.utc).isoformat(),
        }
