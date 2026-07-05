"""
ProximateGrantExtractService — Phase 721b.

Adeso RECEIVES grants from institutional donors to fund Proximate.
The grant lifecycle in this tenant starts AFTER the grant is won:
upload the actual signed agreement PDF → AI extracts the terms →
OB reviews / edits / accepts in a wizard → ProximateGrant row.

Distinct from Kuja's GrantAgreementUnpackService (which unpacks
agreements for grantee NGOs on the marketplace tenant): this one
extracts into the ProximateGrant.extracted_json shape that the
compliance dashboard, reporting calendar, and donor view are built
on (see seed_proximate.py GRANT_FIXTURES for the reference shape).

Nothing is persisted on the OB's behalf — extraction returns a
proposal; the grant row is only created when the OB accepts.
"""

import logging

logger = logging.getLogger('kuja')

# Keep in sync with the model string used across ai_service.py.
EXTRACT_MODEL = 'claude-sonnet-4-6'

MAX_DOC_TEXT_CHARS = 30000
MAX_PDF_PAGES = 60


def extract_pdf_text(filepath: str) -> str:
    """Pull text out of the uploaded agreement PDF. Returns '' when the
    PDF has no extractable text (e.g. a pure scan with no OCR layer)."""
    try:
        from PyPDF2 import PdfReader
    except ImportError:
        logger.error("PyPDF2 not installed — cannot extract agreement text")
        return ''
    try:
        text_parts = []
        with open(filepath, 'rb') as f:
            reader = PdfReader(f)
            for page in reader.pages[:MAX_PDF_PAGES]:
                text_parts.append(page.extract_text() or '')
        return '\n'.join(text_parts).strip()
    except Exception as e:
        logger.warning(f"Proximate agreement PDF text extraction failed: {e}")
        return ''


def extract_agreement_terms(*, doc_text: str, filename: str = '') -> dict | None:
    """One Claude call: signed agreement text → structured terms in the
    ProximateGrant.extracted_json shape. Returns None if AI unavailable."""
    try:
        from app.services.ai_service import AIService
    except Exception:
        return None

    system_prompt = (
        "You are an experienced grants-management lawyer at Adeso, an African "
        "humanitarian organisation. Adeso has WON this grant — the agreement "
        "is signed. Adeso is the GRANTEE; the donor funds Adeso's Proximate "
        "Fund, which makes small community-led disbursements in Sudan.\n\n"
        "Extract everything Adeso needs to comply with this contract:\n"
        "- Quote amounts as written (keep currency symbols) AND give the "
        "numeric USD value separately.\n"
        "- Dates as ISO 8601 (YYYY-MM-DD); leave empty if not resolvable — "
        "never guess.\n"
        "- key_deliverables: only quantified commitments (with target + unit).\n"
        "- reporting_requirements: every recurring report the donor expects; "
        "cadence must be one of monthly, quarterly, semi_annual, annual, "
        "one_time.\n"
        "- restrictions_verbatim: quote the geographic/sector/use "
        "restriction clauses word-for-word.\n"
        "- restrictions: distil the same clauses into geographies (country/"
        "region names), sectors, and a one-line purpose.\n"
        "- compliance_flags: snake_case tags for obligations that need "
        "operational machinery (e.g. sanctions_screening_required_all_partners, "
        "independent_audit_required_annual, no_subgrants_to_intermediaries).\n"
        "- extraction_confidence: 0-1 honest self-assessment; lower it when "
        "the text is partial, garbled, or clauses are ambiguous.\n\n"
        "If the document is clearly NOT a grant agreement, say so in "
        "not_an_agreement_reason and set extraction_confidence to 0."
    )

    user_message = (
        f"SIGNED AGREEMENT FILE: {filename or '(uploaded PDF)'}\n"
        f"=== AGREEMENT TEXT ({len(doc_text)} chars) ===\n"
        f"{doc_text[:MAX_DOC_TEXT_CHARS]}\n"
        f"=== END ===\n\n"
        "Return the full extraction via the extract_grant_terms tool."
    )

    parsed = AIService._call_claude_tool(
        system_prompt,
        user_message,
        tool_name='extract_grant_terms',
        tool_description=(
            'Structured extraction of a signed inbound grant agreement '
            'for the Proximate Fund grant register.'
        ),
        tool_schema=_tool_schema(),
        max_tokens=4096,
        endpoint='proximate_grant_extract',
    )
    if not parsed:
        return None

    return {
        'donor': (parsed.get('donor') or '').strip(),
        'title_suggested': (parsed.get('title_suggested') or '').strip(),
        'donor_grant_ref': (parsed.get('donor_grant_ref') or '').strip(),
        'agreement_date': (parsed.get('agreement_date') or '').strip(),
        'total_amount': (parsed.get('total_amount') or '').strip(),
        'total_amount_usd': parsed.get('total_amount_usd'),
        'currency': (parsed.get('currency') or 'USD').strip()[:3].upper(),
        'duration_months': parsed.get('duration_months'),
        'start_date': (parsed.get('start_date') or '').strip(),
        'end_date': (parsed.get('end_date') or '').strip(),
        'reporting_cadence_suggested': (
            parsed.get('reporting_cadence_suggested') or 'quarterly'
        ),
        'key_deliverables': (parsed.get('key_deliverables') or [])[:20],
        'reporting_requirements': (parsed.get('reporting_requirements') or [])[:15],
        'restrictions_verbatim': (parsed.get('restrictions_verbatim') or '').strip(),
        'restrictions': parsed.get('restrictions') or {},
        'compliance_flags': (parsed.get('compliance_flags') or [])[:15],
        'key_contacts': (parsed.get('key_contacts') or [])[:8],
        'extraction_confidence': parsed.get('extraction_confidence'),
        'not_an_agreement_reason': (
            parsed.get('not_an_agreement_reason') or ''
        ).strip(),
    }


def draft_grant_report(*, grant, report) -> dict | None:
    """Phase 721c — draft a donor report body from REAL system data.

    Gathers the grant's allocations → rounds → disbursements (within
    the report period where dated) → outcome attestations, hands the
    aggregate to Claude, and returns section dicts in the same shape
    the 721d scorer grades (executive_summary, financial_summary,
    impact_narrative, compliance_note). Numbers in the draft come from
    the aggregate — the prompt forbids inventing figures."""
    import json as _json
    from datetime import datetime, time, timezone as _tz
    try:
        from app.services.ai_service import AIService
    except Exception:
        return None
    from app.extensions import db
    from app.models import (
        ProximateGrantAllocation, ProximateRound, ProximateDisbursement,
    )

    allocations = ProximateGrantAllocation.query.filter_by(
        grant_id=grant.id,
    ).all()
    round_ids = [a.round_id for a in allocations]
    rounds = ProximateRound.query.filter(
        ProximateRound.id.in_(round_ids or [0]),
    ).all()
    disbursements = ProximateDisbursement.query.filter(
        ProximateDisbursement.round_id.in_(round_ids or [0]),
    ).all()

    def _in_period(dt) -> bool:
        if not dt or not report.period_start or not report.period_end:
            return True  # undated rows / open periods count
        start = datetime.combine(report.period_start, time.min, tzinfo=_tz.utc)
        end = datetime.combine(report.period_end, time.max, tzinfo=_tz.utc)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=_tz.utc)
        return start <= dt <= end

    period_disb = [d for d in disbursements if _in_period(d.sent_at)]
    total_disbursed = sum(float(d.amount_usd or 0) for d in period_disb)
    partners = {d.partner_id for d in period_disb if d.partner_id}
    reported = [d for d in period_disb if d.report_submitted_at]
    attested = [
        d for d in period_disb
        if getattr(d, 'outcome_attested_at', None)
        or getattr(d, 'verifier_verdict', None)
    ]

    extracted = grant._extracted() if hasattr(grant, '_extracted') else {}
    facts = {
        'grant_title': grant.title,
        'donor': grant.donor_name_cache,
        'report_type': report.report_type,
        'period': f'{report.period_start} to {report.period_end}',
        'amount_committed_usd': grant.amount_committed_usd,
        'amount_allocated_usd_lifetime': grant.amount_allocated_usd,
        'rounds_funded': [
            {'title': r.title, 'status': r.status} for r in rounds
        ],
        'period_disbursements_count': len(period_disb),
        'period_disbursed_usd': total_disbursed,
        'distinct_partners_in_period': len(partners),
        'partner_reports_received': len(reported),
        'disbursements_with_outcome_signal': len(attested),
        'donor_requirements': extracted.get('reporting_requirements') or [],
        'compliance_flags': extracted.get('compliance_flags') or [],
        'restrictions_verbatim': (extracted.get('restrictions_verbatim') or '')[:600],
    }

    system_prompt = (
        "You draft donor reports for Adeso's Proximate Fund. Write the "
        "four sections from the FACTS provided — never invent numbers, "
        "partner names, or events that are not in the facts. Where the "
        "facts show zero activity, say so plainly and explain what that "
        "means (e.g. the round is still in endorsement stage). Address "
        "every compliance flag the donor requires (sanctions screening "
        "status, anti-fraud hotline reference, restriction adherence). "
        "Professional, concrete, first person plural ('we disbursed…'). "
        "3-6 sentences per section. This is a DRAFT a human will edit."
    )
    user_message = (
        f"FACTS:\n{_json.dumps(facts, indent=1, default=str)}\n\n"
        "Draft the report via the draft_report tool."
    )

    parsed = AIService._call_claude_tool(
        system_prompt,
        user_message,
        tool_name='draft_report',
        tool_description='Four-section donor report draft from system facts.',
        tool_schema={
            'type': 'object',
            'properties': {
                'executive_summary': {'type': 'string'},
                'financial_summary': {'type': 'string'},
                'impact_narrative': {'type': 'string'},
                'compliance_note': {'type': 'string'},
            },
            'required': [
                'executive_summary', 'financial_summary',
                'impact_narrative', 'compliance_note',
            ],
        },
        max_tokens=2000,
        endpoint='proximate_report_draft',
    )
    if not parsed:
        return None
    return {
        k: str(parsed.get(k) or '').strip()[:4000]
        for k in (
            'executive_summary', 'financial_summary',
            'impact_narrative', 'compliance_note',
        )
    }


def score_report_compliance(*, grant, report) -> list | None:
    """Phase 721d — score one donor report against the grant's extracted
    requirements. Returns the per-requirement score list (the shape
    `ProximateGrantReport.compliance_score_json` stores) or None when AI
    is unavailable.

    Scores three things: (1) each extracted reporting requirement that
    applies to this report type — content completeness + timeliness,
    (2) reporting-relevant compliance flags (e.g. anti-fraud reference),
    (3) adherence to the donor's restrictions in the narrative."""
    import json as _json
    try:
        from app.services.ai_service import AIService
    except Exception:
        return None

    extracted = grant._extracted() if hasattr(grant, '_extracted') else {}
    content = report._content() if hasattr(report, '_content') else {}
    if not content and report.ai_draft_json:
        try:
            content = _json.loads(report.ai_draft_json) or {}
        except (ValueError, TypeError):
            content = {}

    system_prompt = (
        "You are a donor-compliance officer at Adeso reviewing a report "
        "BEFORE it goes to the institutional donor. Be strict — the donor "
        "will read this against the signed agreement. For every "
        "requirement give a 0-100 score, a verdict (met / partial / "
        "missing), and one concrete sentence on why — citing what is "
        "present or absent in the report content. Timeliness counts: a "
        "report submitted after its due date cannot score above 70 on "
        "the matching cadence requirement. If the report content is "
        "empty or unrelated to a requirement, verdict is missing with a "
        "score under 30. Do not invent content that is not there."
    )
    user_message = (
        f"GRANT: {grant.title} (donor: {grant.donor_name_cache or '-'}, "
        f"cadence: {grant.reporting_cadence})\n\n"
        f"EXTRACTED REQUIREMENTS:\n"
        f"{_json.dumps(extracted.get('reporting_requirements') or [], indent=1)}\n\n"
        f"COMPLIANCE FLAGS:\n"
        f"{_json.dumps(extracted.get('compliance_flags') or [], indent=1)}\n\n"
        f"RESTRICTIONS (verbatim): "
        f"{(extracted.get('restrictions_verbatim') or '')[:800]}\n\n"
        f"REPORT UNDER REVIEW: type={report.report_type}, "
        f"period={report.period_start}..{report.period_end}, "
        f"due={report.due_date}, submitted={report.submitted_at}, "
        f"status={report.status}\n\n"
        f"REPORT CONTENT:\n{_json.dumps(content, indent=1)[:8000]}\n\n"
        "Score every applicable requirement via the score_compliance tool."
    )

    parsed = AIService._call_claude_tool(
        system_prompt,
        user_message,
        tool_name='score_compliance',
        tool_description='Per-requirement compliance scores for a donor report.',
        tool_schema={
            'type': 'object',
            'properties': {
                'scores': {
                    'type': 'array',
                    'items': {
                        'type': 'object',
                        'properties': {
                            'requirement_id': {
                                'type': 'string',
                                'description': 'snake_case id, e.g. financial_semi_annual, anti_fraud_reference, restrictions_adherence',
                            },
                            'requirement': {'type': 'string',
                                            'description': 'One-line human label'},
                            'score': {'type': 'integer'},
                            'verdict': {'type': 'string',
                                        'enum': ['met', 'partial', 'missing']},
                            'why': {'type': 'string'},
                        },
                        'required': ['requirement_id', 'requirement', 'score', 'verdict', 'why'],
                    },
                },
            },
            'required': ['scores'],
        },
        max_tokens=2500,
        endpoint='proximate_report_compliance_score',
    )
    if not parsed:
        return None
    scores = parsed.get('scores') or []
    out = []
    for s in scores[:20]:
        try:
            out.append({
                'requirement_id': str(s.get('requirement_id') or '')[:80],
                'requirement': str(s.get('requirement') or '')[:200],
                'score': max(0, min(100, int(s.get('score') or 0))),
                'verdict': s.get('verdict') if s.get('verdict') in ('met', 'partial', 'missing') else 'partial',
                'why': str(s.get('why') or '')[:500],
            })
        except (ValueError, TypeError):
            continue
    return out


def _tool_schema() -> dict:
    cadences = ['monthly', 'quarterly', 'semi_annual', 'annual', 'one_time']
    return {
        'type': 'object',
        'properties': {
            'donor': {'type': 'string',
                      'description': 'Donor organisation name as written'},
            'title_suggested': {'type': 'string',
                                'description': 'Short human title for the grant register'},
            'donor_grant_ref': {'type': 'string',
                                'description': 'Donor reference / agreement number'},
            'agreement_date': {'type': 'string', 'description': 'ISO date or empty'},
            'total_amount': {'type': 'string',
                             'description': 'Amount verbatim, e.g. "$5,000,000 USD"'},
            'total_amount_usd': {'type': 'number',
                                 'description': 'Numeric USD value of the total commitment'},
            'currency': {'type': 'string'},
            'duration_months': {'type': 'integer'},
            'start_date': {'type': 'string', 'description': 'ISO date or empty'},
            'end_date': {'type': 'string', 'description': 'ISO date or empty'},
            'reporting_cadence_suggested': {'type': 'string', 'enum': cadences},
            'key_deliverables': {
                'type': 'array',
                'items': {
                    'type': 'object',
                    'properties': {
                        'title': {'type': 'string'},
                        'target': {'type': 'number'},
                        'unit': {'type': 'string'},
                    },
                    'required': ['title'],
                },
            },
            'reporting_requirements': {
                'type': 'array',
                'items': {
                    'type': 'object',
                    'properties': {
                        'type': {'type': 'string',
                                 'description': 'snake_case, e.g. financial, impact_narrative, annual_audit'},
                        'cadence': {'type': 'string', 'enum': cadences},
                        'due_days_after_period': {'type': 'integer'},
                    },
                    'required': ['type', 'cadence'],
                },
            },
            'restrictions_verbatim': {'type': 'string'},
            'restrictions': {
                'type': 'object',
                'properties': {
                    'geographies': {'type': 'array', 'items': {'type': 'string'}},
                    'sectors': {'type': 'array', 'items': {'type': 'string'}},
                    'purpose': {'type': 'string'},
                },
            },
            'compliance_flags': {'type': 'array', 'items': {'type': 'string'}},
            'key_contacts': {
                'type': 'array',
                'items': {
                    'type': 'object',
                    'properties': {
                        'name': {'type': 'string'},
                        'role': {'type': 'string'},
                        'email': {'type': 'string'},
                    },
                    'required': ['name'],
                },
            },
            'extraction_confidence': {'type': 'number'},
            'not_an_agreement_reason': {'type': 'string'},
        },
        'required': ['donor', 'extraction_confidence'],
    }
