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
