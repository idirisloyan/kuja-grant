import os
from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user
from app.extensions import db
from app.models import Grant, Application, Report, Document, Organization
from app.utils.helpers import get_request_json
from app.utils.decorators import role_required
from app.services.ai_service import AIService, HAS_ANTHROPIC, ANTHROPIC_API_KEY
from app.services.scoring_engine import ScoringEngine
from app.utils.rate_limiter import ai_limiter
from app.utils.api_errors import error_response
import logging

logger = logging.getLogger('kuja')

ai_bp = Blueprint('ai', __name__, url_prefix='/api/ai')


@ai_bp.route('/chat', methods=['POST'])
@login_required
def api_ai_chat():
    """AI chat endpoint - contextual help for users."""
    # Rate limit AI calls per user
    ai_key = f"ai_{current_user.id}"
    if ai_limiter.is_locked(ai_key):
        return jsonify({'error': 'Too many AI requests. Please wait a moment.', 'success': False}), 429
    ai_limiter.record_failure(ai_key)

    data = get_request_json()
    message = data.get('message', '').strip()

    if not message:
        return jsonify({'error': 'Message is required', 'success': False}), 400

    # Limit message length to prevent token abuse
    if len(message) > 5000:
        message = message[:5000]

    context = data.get('context', {})
    result = AIService.chat(message, context, user_role=current_user.role)

    source = result.get('source', 'unknown')
    return jsonify({
        'success': True,
        'response': result['response'],
        'source': source,
        'ai_transparency': {
            'engine': 'Claude AI' if source == 'claude' else 'Rule-based heuristics',
            'disclaimer': 'AI-generated content — verify important details independently.',
        },
    })


@ai_bp.route('/guidance', methods=['POST'])
@login_required
def api_ai_guidance():
    """AI guidance endpoint - field-specific writing advice."""
    ai_key = f"ai_{current_user.id}"
    if ai_limiter.is_locked(ai_key):
        return jsonify({'error': 'Too many AI requests. Please wait a moment.', 'success': False}), 429
    ai_limiter.record_failure(ai_key)

    data = get_request_json()
    field_name = data.get('field_name', '').strip()

    if not field_name:
        return jsonify({'error': 'field_name is required', 'success': False}), 400

    grant_criteria = data.get('grant_criteria')
    current_text = data.get('current_text', '')

    result = AIService.guidance(field_name, grant_criteria, current_text)

    source = result.get('source', 'unknown')
    return jsonify({
        'success': True,
        'guidance': result['guidance'],
        'quality_score': result.get('quality_score', 0),
        'source': source,
        'ai_transparency': {
            'engine': 'Claude AI' if source == 'claude' else 'Rule-based heuristics',
            'disclaimer': 'AI-generated guidance — always apply professional judgment.',
        },
    })


@ai_bp.route('/strengthen-section', methods=['POST'])
@login_required
@role_required('ngo')
def api_ai_strengthen_section():
    """NGO co-writer v2: tailors a single criterion response against this
    specific donor's lens. Returns strengths, gaps, sharpened rewrite,
    and 2-3 specific tweaks. Sits between /draft-section (creates from
    scratch) and /guidance (gives feedback).
    """
    ai_key = f"ai_{current_user.id}"
    if ai_limiter.is_locked(ai_key):
        return jsonify({'error': 'Too many AI requests. Please wait a moment.', 'success': False}), 429
    ai_limiter.record_failure(ai_key)

    data = get_request_json()
    criterion = data.get('criterion') or {}
    current_text = (data.get('current_text') or '').strip()
    grant_id = data.get('grant_id')

    if not criterion.get('label') and not criterion.get('key'):
        return jsonify({'error': 'criterion is required', 'success': False}), 400

    org = getattr(current_user, 'organization', None)
    org_summary = {}
    if org:
        org_summary = {
            'name': org.name,
            'country': getattr(org, 'country', None),
            'sector': getattr(org, 'sector', None),
            'description': (getattr(org, 'description', '') or '')[:1500],
        }

    grant_context = None
    if grant_id:
        g = db.session.get(Grant, grant_id)
        if g:
            grant_context = {
                'title': g.title,
                'sectors': g.get_sectors() if hasattr(g, 'get_sectors') else None,
                'countries': g.get_countries() if hasattr(g, 'get_countries') else None,
                'description': (g.description or '')[:1200],
                'criteria_summary': [
                    {'label': c.get('label'), 'weight': c.get('weight')}
                    for c in (g.get_criteria() or [])
                ],
            }

    result = AIService.strengthen_against_criterion(
        criterion=criterion,
        response_text=current_text,
        grant_context=grant_context,
        org_summary=org_summary,
    )

    return jsonify({'success': True, **result})


@ai_bp.route('/extract-evidence', methods=['POST'])
@login_required
@role_required('reviewer', 'admin')
def api_ai_extract_evidence():
    """Reviewer evidence synthesizer: pulls verbatim supporting/
    contradicting/neutral quotes from an application against each rubric
    criterion. Reviewers cite specific evidence instead of writing
    rationale from cold memory.

    Body: { application_id: int }
    """
    ai_key = f"ai_{current_user.id}"
    if ai_limiter.is_locked(ai_key):
        return jsonify({'error': 'Too many AI requests. Please wait a moment.', 'success': False}), 429
    ai_limiter.record_failure(ai_key)

    data = get_request_json()
    app_id = data.get('application_id')
    if not app_id:
        return jsonify({'error': 'application_id is required', 'success': False}), 400

    app_obj = db.session.get(Application, app_id)
    if not app_obj:
        return jsonify({'error': 'Application not found', 'success': False}), 404

    grant = db.session.get(Grant, app_obj.grant_id)
    criteria = grant.get_criteria() if grant else []
    responses = app_obj.get_responses() if hasattr(app_obj, 'get_responses') else {}

    # Application summary text — pull short summary if available, else
    # synthesize one from responses.
    summary_text = ''
    if hasattr(app_obj, 'summary') and app_obj.summary:
        summary_text = app_obj.summary
    elif responses:
        first_keys = list(responses.keys())[:3]
        summary_text = ' '.join((responses.get(k) or '')[:300] for k in first_keys)

    result = AIService.extract_evidence(
        criteria=criteria,
        application_responses=responses,
        application_summary=summary_text,
    )

    return jsonify({'success': True, **result})


@ai_bp.route('/compliance-explain', methods=['POST'])
@login_required
@role_required('donor', 'admin')
def api_ai_compliance_explain():
    """Compliance co-pilot. Translate verification + sanctions findings into
    plain language with concrete follow-up actions.

    Body: { org_id: int }
    Returns: AIService.explain_compliance shape (headline, confidence_band,
             what_we_know[], gaps[], recommended_actions[], source).
    """
    ai_key = f"ai_{current_user.id}"
    if ai_limiter.is_locked(ai_key):
        return jsonify({'error': 'Too many AI requests. Please wait a moment.', 'success': False}), 429
    ai_limiter.record_failure(ai_key)

    data = get_request_json()
    org_id = data.get('org_id')
    if not org_id:
        return jsonify({'error': 'org_id is required', 'success': False}), 400

    from app.models import Organization, RegistrationVerification, ComplianceCheck
    org = db.session.get(Organization, org_id)
    if not org:
        return jsonify({'error': 'Organization not found', 'success': False}), 404

    org_summary = {
        'name': org.name,
        'country': getattr(org, 'country', None),
        'registration_number': getattr(org, 'registration_number', None),
        'org_type': getattr(org, 'org_type', None),
        'verified': getattr(org, 'verified', False),
    }

    latest_v = (RegistrationVerification.query
                .filter_by(org_id=org_id)
                .order_by(RegistrationVerification.updated_at.desc())
                .first())
    verification = latest_v.to_dict() if latest_v else None
    registry_check = (latest_v.get_registry_check_result() if latest_v
                      and hasattr(latest_v, 'get_registry_check_result') else None)

    compliance = (ComplianceCheck.query
                  .filter_by(org_id=org_id)
                  .order_by(ComplianceCheck.checked_at.desc())
                  .limit(20).all())
    compliance_checks = [c.to_dict() for c in compliance]

    result = AIService.explain_compliance(
        org_summary=org_summary,
        verification=verification,
        compliance_checks=compliance_checks,
        registry_check=registry_check,
    )

    return jsonify({
        'success': True,
        **result,
    })


@ai_bp.route('/draft-section', methods=['POST'])
@login_required
@role_required('ngo')
def api_ai_draft_section():
    """Generate an AI-drafted starting answer for a single application
    section, grounded in the NGO's profile and (optionally) past
    applications. The team feedback called for "AI actively helps finish
    applications, improve weak sections" — this endpoint is the active
    drafting half of that, complementing the existing /guidance feedback
    endpoint.

    Body:
        criterion: { label, description?, instructions? }
        current_text?: existing text — if non-empty, AI rewrites/strengthens
                       rather than drafting from scratch.
        grant_id?: int — used to fetch grant context (sector, country)
    Returns:
        { success, draft, mode: 'draft'|'improve', source }
    """
    ai_key = f"ai_{current_user.id}"
    if ai_limiter.is_locked(ai_key):
        return jsonify({'error': 'Too many AI requests. Please wait a moment.', 'success': False}), 429
    ai_limiter.record_failure(ai_key)

    data = get_request_json()
    criterion = data.get('criterion') or {}
    current_text = (data.get('current_text') or '').strip()
    grant_id = data.get('grant_id')

    label = (criterion.get('label') or '').strip()
    if not label:
        return jsonify({'error': 'criterion.label is required', 'success': False}), 400

    org = getattr(current_user, 'organization', None)
    org_summary = {}
    if org:
        org_summary = {
            'name': getattr(org, 'name', None),
            'country': getattr(org, 'country', None),
            'sector': getattr(org, 'sector', None),
            'description': (getattr(org, 'description', '') or '')[:1500],
            'capacity_score': getattr(org, 'capacity_score', None),
            'annual_budget_usd': getattr(org, 'annual_budget_usd', None),
            'staff_count': getattr(org, 'staff_count', None),
            'years_operating': getattr(org, 'years_operating', None),
        }

    grant_context = None
    if grant_id:
        g = db.session.get(Grant, grant_id)
        if g:
            grant_context = {
                'title': g.title,
                'sectors': g.get_sectors() if hasattr(g, 'get_sectors') else None,
                'countries': g.get_countries() if hasattr(g, 'get_countries') else None,
                'description': (g.description or '')[:600],
            }

    mode = 'improve' if current_text else 'draft'
    result = AIService.draft_application_section(
        criterion=criterion,
        org_summary=org_summary,
        grant_context=grant_context,
        current_text=current_text,
        mode=mode,
    )

    return jsonify({
        'success': True,
        'mode': mode,
        'draft': result.get('draft', ''),
        'source': result.get('source', 'template'),
        'ai_transparency': {
            'engine': 'Claude AI' if result.get('source') == 'claude' else 'Rule-based template',
            'disclaimer': 'AI-drafted content — review and edit before submitting.',
        },
    })


@ai_bp.route('/score-criterion', methods=['POST'])
@login_required
@role_required('reviewer', 'admin')
def api_ai_score_criterion():
    """Generate AI rationale + suggested score for a SINGLE rubric
    criterion against an application response. Lighter than the bulk
    score-application call — reviewers use this to refine one row at a
    time without rerunning analysis on the whole proposal.

    Body:
        application_id: int
        criterion_key:  string (matches Grant.criteria[].key)
    Returns:
        { success, score: 0-100, rationale: str, source: 'claude'|'template' }
    """
    ai_key = f"ai_{current_user.id}"
    if ai_limiter.is_locked(ai_key):
        return jsonify({'error': 'Too many AI requests. Please wait a moment.', 'success': False}), 429
    ai_limiter.record_failure(ai_key)

    data = get_request_json()
    application_id = data.get('application_id')
    criterion_key = (data.get('criterion_key') or '').strip()

    if not application_id or not criterion_key:
        return jsonify({'error': 'application_id and criterion_key required', 'success': False}), 400

    app_obj = db.session.get(Application, application_id)
    if not app_obj:
        return jsonify({'error': 'Application not found', 'success': False}), 404

    grant = db.session.get(Grant, app_obj.grant_id)
    if not grant:
        return jsonify({'error': 'Grant not found', 'success': False}), 404

    # Match criterion by `key` (stable id) OR by `label` (some older grants
    # only have label). Reviewer UIs may send either, so be tolerant.
    all_crits = grant.get_criteria() or []
    criterion = next(
        (c for c in all_crits if c.get('key') == criterion_key or c.get('label') == criterion_key),
        None,
    )
    if not criterion:
        return jsonify({'error': f'No criterion matching {criterion_key!r}', 'success': False}), 400

    # Pull this criterion's response from the application — try by key
    # first, then by label. Same compatibility shim as criterion lookup.
    responses = app_obj.get_responses() if hasattr(app_obj, 'get_responses') else {}
    response_text = (
        (responses or {}).get(criterion.get('key', ''))
        or (responses or {}).get(criterion.get('label', ''))
        or ''
    )

    result = AIService.score_one_criterion(
        criterion=criterion,
        response_text=response_text,
        org_name=getattr(app_obj.ngo_org, 'name', None) if hasattr(app_obj, 'ngo_org') else None,
        grant_title=grant.title,
    )

    return jsonify({
        'success': True,
        'score': result.get('score', 0),
        'rationale': result.get('rationale', ''),
        'source': result.get('source', 'template'),
        'ai_transparency': {
            'engine': 'Claude AI' if result.get('source') == 'claude' else 'Rule-based template',
            'disclaimer': 'AI-suggested rationale — review and edit before submitting.',
        },
    })


@ai_bp.route('/score-application', methods=['POST'])
@login_required
def api_ai_score_application():
    """AI scoring endpoint - score an application using the scoring engine."""
    data = get_request_json()
    application_id = data.get('application_id')

    if not application_id:
        return jsonify({'error': 'application_id is required', 'success': False}), 400

    application = db.session.get(Application, application_id)
    if not application:
        return jsonify({'error': 'Application not found', 'success': False}), 404

    # Access control
    if current_user.role == 'ngo' and application.ngo_org_id != current_user.org_id:
        return jsonify({'error': 'Access denied'}), 403
    if current_user.role == 'donor':
        grant = db.session.get(Grant, application.grant_id)
        if not grant or grant.donor_org_id != current_user.org_id:
            return jsonify({'error': 'Access denied'}), 403

    # Run scoring
    score_result = ScoringEngine.score_application(application)

    # Save score to application
    application.ai_score = score_result.get('overall_score')
    if application.human_score is not None:
        application.final_score = round(
            (application.ai_score * 0.4) + (application.human_score * 0.6), 2
        )
    else:
        application.final_score = application.ai_score
    db.session.commit()

    return jsonify({
        'success': True,
        'scores': score_result,
        'application_id': application_id,
        'ai_transparency': {
            'engine': 'Kuja Scoring Engine (rule-based + AI)',
            'disclaimer': 'Automated scoring — human review is recommended for final decisions.',
        },
    })


@ai_bp.route('/analyze-report', methods=['POST'])
@login_required
@role_required('ngo', 'donor', 'admin')
def api_ai_analyze_report():
    """AI analyzes a submitted report against requirements."""
    data = get_request_json()

    report_id = data.get('report_id')
    if report_id:
        report = db.session.get(Report, report_id)
        if not report:
            return jsonify({'error': 'Report not found'}), 404

        # Access control
        if current_user.role == 'ngo' and report.submitted_by_org_id != current_user.org_id:
            return jsonify({'error': 'Access denied'}), 403

        content = report.get_content()
        report_type = report.report_type
        grant = db.session.get(Grant, report.grant_id)
        requirements = grant.get_reporting_requirements() if grant else []
    else:
        # Allow ad-hoc analysis without a saved report
        content = data.get('content', {})
        report_type = data.get('report_type', 'progress')
        requirements = data.get('requirements', [])

    analysis = AIService.analyze_report(content, requirements, report_type)

    # If report_id was provided, save the analysis
    if report_id and report:
        report.set_ai_analysis(analysis)
        db.session.commit()

    return jsonify({
        'success': True,
        'analysis': analysis,
        'ai_transparency': {
            'engine': 'Claude AI' if (HAS_ANTHROPIC and ANTHROPIC_API_KEY) else 'Rule-based heuristics',
            'disclaimer': 'AI-generated analysis — cross-check findings against original documents.',
        },
    })


@ai_bp.route('/report-guidance', methods=['POST'])
@login_required
@role_required('ngo', 'donor', 'admin')
def api_ai_report_guidance():
    """AI guidance for NGOs writing report sections against donor requirements.

    Provides real-time feedback on a specific report section, scoring how well
    it addresses the donor requirement and suggesting improvements.
    """
    ai_key = f"ai_{current_user.id}"
    if ai_limiter.is_locked(ai_key):
        return jsonify({'error': 'Too many AI requests. Please wait a moment.', 'success': False}), 429
    ai_limiter.record_failure(ai_key)

    data = get_request_json()

    section_content = data.get('section_content', '').strip()
    requirement = data.get('requirement', {})
    grant_title = data.get('grant_title', '').strip()
    language = data.get('language', 'en')

    if not section_content:
        return jsonify({'error': 'section_content is required', 'success': False}), 400
    if not requirement:
        return jsonify({'error': 'requirement is required', 'success': False}), 400

    # Limit input length to prevent token abuse
    if len(section_content) > 10000:
        section_content = section_content[:10000]

    result = AIService.report_guidance(
        section_content=section_content,
        requirement=requirement,
        grant_title=grant_title,
        language=language,
    )

    source = result.get('source', 'unknown')
    return jsonify({
        'success': True,
        'quality_score': result.get('quality_score', 0),
        'completeness': result.get('completeness', 0),
        'suggestions': result.get('suggestions', []),
        'strengths': result.get('strengths', []),
        'missing_elements': result.get('missing_elements', []),
        'source': source,
        'ai_transparency': {
            'engine': 'Claude AI' if source == 'claude' else 'Rule-based heuristics',
            'disclaimer': 'AI-generated guidance — always apply professional judgment.',
        },
    })


@ai_bp.route('/extract-reporting-requirements', methods=['POST'])
@login_required
@role_required('donor', 'admin')
def api_ai_extract_reporting_requirements():
    """AI reads a grant document file and extracts reporting requirements."""
    data = get_request_json()

    grant_id = data.get('grant_id')
    file_content = data.get('file_content', '')
    grant_title = data.get('grant_title', '')

    # If grant_id provided, try to read the uploaded grant document
    if grant_id:
        grant = db.session.get(Grant, grant_id)
        if grant:
            grant_title = grant_title or grant.title
            if grant.grant_document and not file_content:
                filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], grant.grant_document)
                try:
                    ext = grant.grant_document.rsplit('.', 1)[-1].lower()
                    if ext in ('txt', 'csv'):
                        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                            file_content = f.read()
                    else:
                        file_content = f"Grant document: {grant.grant_document} for grant: {grant.title}. {grant.description or ''}"
                except Exception as e:
                    logger.error(f"Failed to read grant document for extraction: {e}")
                    file_content = f"Grant: {grant.title}. {grant.description or ''}"

    if not file_content:
        return jsonify({'error': 'No file content available for analysis'}), 400

    extracted = AIService.extract_reporting_requirements(file_content, grant_title)

    return jsonify({
        'success': True,
        'extracted': extracted,
        'ai_transparency': {
            'engine': 'Claude AI' if (HAS_ANTHROPIC and ANTHROPIC_API_KEY) else 'Rule-based heuristics',
            'disclaimer': 'AI-extracted requirements — review against the original grant agreement.',
        },
    })


# ---------------------------------------------------------------------------
# Phase 1.1 — NGO application co-author (first-draft generation)
# ---------------------------------------------------------------------------

def _gather_org_context(org_id):
    """Build the org payload the AI uses for grounded drafting."""
    org = db.session.get(Organization, org_id)
    if not org:
        return None
    capacity = {}
    try:
        # Most recent assessment, if any
        from app.models import Assessment
        a = (Assessment.query
             .filter_by(organization_id=org_id)
             .order_by(Assessment.created_at.desc())
             .first())
        if a:
            capacity = {
                'framework': a.framework,
                'score': a.score,
                'completed': a.completed_at.isoformat() if a.completed_at else None,
            }
    except Exception:
        pass
    return {
        'id': org.id,
        'name': org.name,
        'mission': getattr(org, 'mission', None) or getattr(org, 'description', None),
        'sectors': getattr(org, 'sectors', None),
        'countries': getattr(org, 'countries', None),
        'capacity': capacity,
    }


def _gather_prior_applications(org_id, exclude_id=None, limit=3):
    """Pull recent application responses to anchor voice + facts.

    Phase 1.4 — cross-application learning:
    prefer 'awarded' applications first (the NGO's winning patterns
    are higher-signal than rejected ones), then 'submitted' / 'scored',
    then everything else. Keep the most recent within each tier.
    Each row carries an `outcome_signal` flag so draft_application can
    treat winners differently in the prompt.
    """
    base = (Application.query
            .filter_by(ngo_org_id=org_id)
            .filter(Application.status.in_(('submitted', 'awarded', 'rejected', 'scored'))))
    if exclude_id:
        base = base.filter(Application.id != exclude_id)

    # Tier 1: awarded (winning patterns, highest signal).
    awarded = (base.filter(Application.status == 'awarded')
               .order_by(Application.submitted_at.desc().nullslast(),
                         Application.created_at.desc())
               .limit(2).all())
    # Tier 2: scored / submitted but not yet decided (recent activity).
    pending_or_scored = (base.filter(Application.status.in_(('submitted', 'scored')))
                         .order_by(Application.submitted_at.desc().nullslast(),
                                   Application.created_at.desc())
                         .limit(2).all())
    # Tier 3: rejected — useful for voice but flagged so AI doesn't
    # over-anchor on losing patterns.
    rejected = (base.filter(Application.status == 'rejected')
                .order_by(Application.submitted_at.desc().nullslast())
                .limit(1).all())

    seen = set()
    ordered: list[Application] = []
    for tier in (awarded, pending_or_scored, rejected):
        for a in tier:
            if a.id in seen:
                continue
            seen.add(a.id)
            ordered.append(a)
            if len(ordered) >= limit:
                break
        if len(ordered) >= limit:
            break

    out = []
    for a in ordered:
        try:
            responses = a.get_responses() or {}
        except Exception:
            responses = {}
        # outcome_signal lets the AI weigh tone — 'won' submissions are
        # treated as positive examples; 'lost' as voice-only references.
        if a.status == 'awarded':
            signal = 'won'
        elif a.status == 'rejected':
            signal = 'lost'
        elif a.status in ('submitted', 'scored'):
            signal = 'pending'
        else:
            signal = 'other'
        out.append({
            'id': a.id,
            'grant_id': a.grant_id,
            'status': a.status,
            'final_score': a.final_score,
            'outcome_signal': signal,
            'responses_excerpt': {k: (v[:600] if isinstance(v, str) else v)
                                  for k, v in list(responses.items())[:6]},
        })
    return out


def _gather_org_documents(org_id, limit=8):
    """Recent uploaded documents for the org. Excerpt where text was extracted."""
    docs = (Document.query
            .filter_by(organization_id=org_id)
            .order_by(Document.created_at.desc())
            .limit(limit)
            .all())
    out = []
    for d in docs:
        excerpt = ''
        # Some documents may have extracted text in extra fields; defensive.
        for attr in ('extracted_text', 'content', 'analysis'):
            val = getattr(d, attr, None)
            if isinstance(val, str) and val.strip():
                excerpt = val.strip()[:500]
                break
        out.append({
            'id': d.id,
            'title': getattr(d, 'title', None) or getattr(d, 'filename', None),
            'doc_type': getattr(d, 'doc_type', None),
            'excerpt': excerpt,
        })
    return out


def _persist_draft_provenance(application_id, parsed):
    """Persist each AI claim as an AIProvenance row attached to the application."""
    rows = parsed.get('claim_provenance') or []
    saved = 0
    for c in rows:
        try:
            AIService.record_provenance(
                subject_kind='application',
                subject_id=application_id,
                subject_field=c.get('criterion_key'),
                claim=c.get('claim') or '',
                source_kind=c.get('source_kind') or 'ai_general',
                source_id=c.get('source_id'),
                source_locator=c.get('source_locator'),
                source_excerpt=c.get('source_excerpt'),
                confidence=c.get('confidence') or 'medium',
            )
            saved += 1
        except Exception as e:
            logger.debug(f"draft provenance persist failed: {e}")
    return saved


@ai_bp.route('/draft-application', methods=['POST'])
@login_required
@role_required('ngo')
def api_ai_draft_application():
    """Phase 1.1 — generate a first-draft application for an NGO.

    Body:
        grant_id:       int   (required)
        application_id: int   (optional — improve existing draft instead of replacing)
        brief:          str   (optional, ≤500 chars — the user's pitch)
        replace_existing: bool (optional, default False — when true, AI output
                          replaces existing responses; when false, AI output is
                          merged onto empty fields only)

    Returns:
        { success, draft: {...AIService.draft_application output...},
          provenance_saved: int, application_id: int|None }
    """
    ai_key = f"ai_{current_user.id}"
    if ai_limiter.is_locked(ai_key):
        return error_response('ai.rate_limited', 429)
    ai_limiter.record_failure(ai_key)

    data = get_request_json() or {}
    grant_id = data.get('grant_id')
    if not grant_id:
        return error_response('validation.missing_field', 400, field='grant_id')

    grant = db.session.get(Grant, int(grant_id))
    if not grant:
        return error_response('grant.not_found', 404)

    application_id = data.get('application_id')
    application = None
    if application_id:
        application = db.session.get(Application, int(application_id))
        if application and application.ngo_org_id != current_user.org_id:
            return error_response('auth.access_denied', 403)

    brief = (data.get('brief') or '').strip()[:500]
    replace_existing = bool(data.get('replace_existing'))

    # Build context.
    org_payload = _gather_org_context(current_user.org_id)
    if not org_payload:
        return error_response('auth.access_denied', 403)

    grant_payload = {
        'id': grant.id,
        'title': grant.title,
        'description': grant.description,
        'criteria': grant.get_criteria() if hasattr(grant, 'get_criteria') else [],
        'eligibility': grant.get_eligibility() if hasattr(grant, 'get_eligibility') else [],
    }

    prior_apps = _gather_prior_applications(
        current_user.org_id, exclude_id=application.id if application else None
    )
    prior_docs = _gather_org_documents(current_user.org_id)

    existing_responses = {}
    if application and not replace_existing:
        try:
            existing_responses = application.get_responses() or {}
        except Exception:
            existing_responses = {}

    parsed = AIService.draft_application(
        grant=grant_payload,
        org=org_payload,
        brief=brief,
        prior_applications=prior_apps,
        prior_documents=prior_docs,
        language=current_user.language or 'en',
        existing_responses=existing_responses,
    )

    # If we have an application to attach to, optionally save the draft.
    save_to_application = bool(data.get('save', True)) and application is not None
    provenance_saved = 0
    if save_to_application and application:
        try:
            current = {} if replace_existing else (application.get_responses() or {})
            new_responses = parsed.get('responses') or {}
            # Merge: replace mode overrides; non-replace fills empty only.
            if replace_existing:
                merged = {**current, **new_responses}
            else:
                merged = dict(current)
                for k, v in new_responses.items():
                    if not merged.get(k):
                        merged[k] = v
            application.set_responses(merged)

            elig = parsed.get('eligibility_responses') or {}
            if elig:
                try:
                    cur_elig = application.get_eligibility_responses() or {}
                    application.set_eligibility_responses({**cur_elig, **elig})
                except Exception:
                    pass

            db.session.commit()
            provenance_saved = _persist_draft_provenance(application.id, parsed)
        except Exception as e:
            db.session.rollback()
            logger.error(f"Failed to save AI draft to application {application.id}: {e}")

    return jsonify({
        'success': True,
        'draft': parsed,
        'application_id': application.id if application else None,
        'provenance_saved': provenance_saved,
        'ai_transparency': {
            'engine': 'Claude AI' if parsed.get('source') == 'claude' else 'Template fallback',
            'disclaimer': 'AI-drafted application — review every claim before submitting.',
        },
    })


# ---------------------------------------------------------------------------
# Phase 8.2 — pre-submission compliance scan
# ---------------------------------------------------------------------------

@ai_bp.route('/compliance-preempt', methods=['POST'])
@login_required
@role_required('ngo')
def api_ai_compliance_preempt():
    """Pre-submission compliance scan.

    Body: {"application_id": int}

    Surfaces issues BEFORE the NGO submits — last chance to fix things
    that would later trigger a compliance flag or rejection. Gated by
    ai.compliance_preempt feature flag (default OFF until verified).
    """
    from app.utils.feature_flags import is_enabled
    if not is_enabled('ai.compliance_preempt',
                      user_id=current_user.id,
                      org_id=getattr(current_user, 'org_id', None)):
        return error_response('auth.access_denied', 403,
                              default='This feature is not enabled for your account.')

    ai_key = f"ai_{current_user.id}"
    if ai_limiter.is_locked(ai_key):
        return error_response('ai.rate_limited', 429)
    ai_limiter.record_failure(ai_key)

    data = get_request_json() or {}
    application_id = data.get('application_id')
    if not application_id:
        return error_response('validation.missing_field', 400, field='application_id')

    application = db.session.get(Application, int(application_id))
    if not application:
        return error_response('application.not_found', 404)
    if application.ngo_org_id != current_user.org_id:
        return error_response('auth.access_denied', 403)

    grant = db.session.get(Grant, application.grant_id) if application.grant_id else None
    if not grant:
        return error_response('grant.not_found', 404)

    org_payload = _gather_org_context(current_user.org_id)
    if not org_payload:
        return error_response('auth.access_denied', 403)

    grant_payload = {
        'id': grant.id,
        'title': grant.title,
        'eligibility': grant.get_eligibility() if hasattr(grant, 'get_eligibility') else [],
        'doc_requirements': grant.get_doc_requirements() if hasattr(grant, 'get_doc_requirements') else [],
    }

    application_payload = {
        'responses': (application.get_responses() or {}) if hasattr(application, 'get_responses') else {},
        'eligibility_responses': (application.get_eligibility_responses() or {})
        if hasattr(application, 'get_eligibility_responses') else {},
        'total_funding_requested': getattr(application, 'total_funding_requested', None),
    }

    documents = _gather_org_documents(current_user.org_id, limit=10)

    parsed = AIService.compliance_preempt(
        application=application_payload,
        org=org_payload,
        grant=grant_payload,
        documents=documents,
        language=current_user.language or 'en',
    )

    return jsonify({
        'success': True,
        'preempt': parsed,
        'ai_transparency': {
            'engine': 'Claude AI' if parsed.get('source') == 'claude' else 'Template fallback',
            'disclaimer': 'AI compliance scan — not a guarantee. Verify against the donor agreement.',
        },
    })


# ---------------------------------------------------------------------------
# Phase 1.3 — NGO report co-author (first-draft generation)
# ---------------------------------------------------------------------------

@ai_bp.route('/draft-report', methods=['POST'])
@login_required
@role_required('ngo')
def api_ai_draft_report():
    """Phase 1.3 — generate a first-draft donor report for an NGO.

    Body:
        report_id:        int   (required)
        notes:            str   (optional — reporter free-form notes)
        replace_existing: bool  (optional, default False)

    Returns:
        { success, draft: {...}, report_id, provenance_saved }
    """
    ai_key = f"ai_{current_user.id}"
    if ai_limiter.is_locked(ai_key):
        return error_response('ai.rate_limited', 429)
    ai_limiter.record_failure(ai_key)

    data = get_request_json() or {}
    report_id = data.get('report_id')
    if not report_id:
        return error_response('validation.missing_field', 400, field='report_id')

    report = db.session.get(Report, int(report_id))
    if not report:
        return error_response('report.not_found', 404)
    if report.submitted_by_org_id != current_user.org_id:
        return error_response('auth.access_denied', 403)

    grant = db.session.get(Grant, report.grant_id) if report.grant_id else None
    if not grant:
        return error_response('grant.not_found', 404)

    org_payload = _gather_org_context(current_user.org_id)
    if not org_payload:
        return error_response('auth.access_denied', 403)

    # Build grant payload incl. reporting requirements/template.
    requirements = []
    template_sections = []
    indicators = []
    try:
        requirements = grant.get_reporting_requirements() or []
    except Exception:
        pass
    try:
        tpl = grant.get_report_template() if hasattr(grant, 'get_report_template') else {}
        template_sections = tpl.get('template_sections') or []
        indicators = tpl.get('indicators') or []
    except Exception:
        pass

    grant_payload = {
        'id': grant.id,
        'title': grant.title,
        'reporting_frequency': getattr(grant, 'reporting_frequency', None),
        'reporting_requirements': requirements,
        'report_template_sections': template_sections,
        'report_template_indicators': indicators,
    }

    # Prior reports (last 3) on this grant by this org for voice anchoring.
    prior_reports = []
    try:
        prior_q = (Report.query
                   .filter_by(grant_id=report.grant_id,
                              submitted_by_org_id=current_user.org_id)
                   .filter(Report.id != report.id)
                   .order_by(Report.submitted_at.desc().nullslast(),
                             Report.created_at.desc())
                   .limit(3).all())
        for p in prior_q:
            try:
                content = p.get_content() if hasattr(p, 'get_content') else {}
            except Exception:
                content = {}
            prior_reports.append({
                'id': p.id,
                'period': getattr(p, 'reporting_period', None),
                'type': p.report_type,
                'sections_excerpt': {k: (v[:500] if isinstance(v, str) else v)
                                     for k, v in list((content or {}).items())[:8]},
            })
    except Exception as e:
        logger.debug(f"prior reports gather failed: {e}")

    # Evidence uploads attached to this report.
    evidence_uploads = []
    try:
        evidence_uploads = _gather_org_documents(current_user.org_id, limit=10)
    except Exception:
        pass

    notes = (data.get('notes') or '').strip()[:3000]

    parsed = AIService.draft_report(
        grant=grant_payload,
        org=org_payload,
        report_period=getattr(report, 'reporting_period', None),
        report_type=report.report_type,
        prior_reports=prior_reports,
        evidence_uploads=evidence_uploads,
        notes=notes,
        language=current_user.language or 'en',
    )

    # Save draft into report content, merging vs replacing.
    replace_existing = bool(data.get('replace_existing'))
    provenance_saved = 0
    try:
        current_content = {}
        try:
            current_content = report.get_content() or {}
        except Exception:
            pass
        new_sections = parsed.get('sections') or {}
        if replace_existing:
            merged = {**current_content, **new_sections}
        else:
            merged = dict(current_content)
            for k, v in new_sections.items():
                if not merged.get(k):
                    merged[k] = v
        if hasattr(report, 'set_content'):
            report.set_content(merged)
            db.session.commit()

        for c in (parsed.get('claim_provenance') or []):
            try:
                AIService.record_provenance(
                    subject_kind='report',
                    subject_id=report.id,
                    subject_field=c.get('section_key'),
                    claim=c.get('claim') or '',
                    source_kind=c.get('source_kind') or 'ai_general',
                    source_id=c.get('source_id'),
                    source_locator=c.get('source_locator'),
                    source_excerpt=c.get('source_excerpt'),
                    confidence=c.get('confidence') or 'medium',
                )
                provenance_saved += 1
            except Exception:
                pass
    except Exception as e:
        db.session.rollback()
        logger.error(f"Failed to save AI report draft for {report.id}: {e}")

    return jsonify({
        'success': True,
        'draft': parsed,
        'report_id': report.id,
        'provenance_saved': provenance_saved,
        'ai_transparency': {
            'engine': 'Claude AI' if parsed.get('source') == 'claude' else 'Template fallback',
            'disclaimer': 'AI-drafted report — verify every metric and date before submitting.',
        },
    })


# ---------------------------------------------------------------------------
# Provenance read endpoint (Phase 5.1 prep)
# ---------------------------------------------------------------------------

@ai_bp.route('/provenance', methods=['GET'])
@login_required
def api_ai_provenance():
    """Fetch AI provenance rows for a given subject.

    Query: ?subject_kind=application&subject_id=42[&subject_field=impact]

    Used by Phase 5.1 source-chip UI. Access control mirrors the underlying
    subject — for now we only check role-level access; per-row gating could
    be added if NGOs share subject ids across orgs (not currently the case).
    """
    subject_kind = request.args.get('subject_kind', '').strip()
    if subject_kind not in ('application', 'report', 'grant'):
        return error_response('validation.invalid_value', 400, field='subject_kind')
    subject_id = request.args.get('subject_id', type=int)
    subject_field = request.args.get('subject_field') or None

    # Access check: NGOs can only see provenance for their own subjects.
    if current_user.role == 'ngo' and subject_id:
        if subject_kind == 'application':
            a = db.session.get(Application, subject_id)
            if not a or a.ngo_org_id != current_user.org_id:
                return error_response('auth.access_denied', 403)
        elif subject_kind == 'report':
            r = db.session.get(Report, subject_id)
            if not r or r.submitted_by_org_id != current_user.org_id:
                return error_response('auth.access_denied', 403)

    rows = AIService.get_provenance(
        subject_kind=subject_kind,
        subject_id=subject_id,
        subject_field=subject_field,
    )
    return jsonify({'success': True, 'provenance': rows})


# ---------------------------------------------------------------------------
# Phase 2.1 — donor median-NGO preview (predict applicant pool quality)
# ---------------------------------------------------------------------------

@ai_bp.route('/median-ngo-preview', methods=['POST'])
@login_required
@role_required('donor', 'admin')
def api_ai_median_ngo_preview():
    """Donor-facing diagnostic: predict what the median qualifying NGO will
    submit AND rate how well each criterion will discriminate between
    strong and weak applicants. Helps donors tighten criteria BEFORE
    publishing.

    Body: {"grant_id": <int>}  OR  {"grant": <full grant dict for unsaved drafts>}
    """
    from app.utils.feature_flags import is_enabled
    if not is_enabled('ai.median_ngo_preview',
                      user_id=current_user.id,
                      org_id=getattr(current_user, 'org_id', None)):
        return error_response('auth.access_denied', 403,
                              default='This feature is not enabled for your account.')

    ai_key = f"ai_{current_user.id}"
    if ai_limiter.is_locked(ai_key):
        return error_response('ai.rate_limited', 429)
    ai_limiter.record_failure(ai_key)

    data = get_request_json() or {}
    grant_payload = None
    if data.get('grant_id'):
        grant = db.session.get(Grant, int(data['grant_id']))
        if not grant:
            return error_response('grant.not_found', 404)
        if current_user.role == 'donor' and grant.donor_org_id != current_user.org_id:
            return error_response('auth.access_denied', 403)
        grant_payload = {
            'id': grant.id,
            'title': grant.title,
            'description': grant.description,
            'criteria': grant.get_criteria() if hasattr(grant, 'get_criteria') else [],
            'eligibility': grant.get_eligibility() if hasattr(grant, 'get_eligibility') else [],
        }
    elif isinstance(data.get('grant'), dict):
        # Unsaved-draft mode: donor passes the full payload from the wizard
        # before the grant has a database id.
        grant_payload = data['grant']
    else:
        return error_response('validation.missing_field', 400, field='grant_id|grant')

    parsed = AIService.median_ngo_preview(
        grant=grant_payload,
        language=current_user.language or 'en',
    )

    return jsonify({
        'success': True,
        'preview': parsed,
        'ai_transparency': {
            'engine': 'Claude AI' if parsed.get('source') == 'claude' else 'Template fallback',
            'disclaimer': 'AI prediction — verify against your actual applicant pool after publishing.',
        },
    })


# ---------------------------------------------------------------------------
# Phase 2.2 — donor auto-generated grant brief
# ---------------------------------------------------------------------------

@ai_bp.route('/grant-brief', methods=['POST'])
@login_required
@role_required('donor', 'admin')
def api_ai_grant_brief():
    """Generate a complete grant scaffold from a 1-2 line donor prompt.

    Body: {"prompt": "...", "thematic": "...", "geography": "...",
           "budget_usd": <int>}

    Returns the full design (title, description, criteria, eligibility,
    doc_requirements, reporting frequency, burden score, recommended
    deadline). Donor edits in the wizard before publishing.

    Gated by feature flag ai.grant_brief_generator.
    """
    from app.utils.feature_flags import is_enabled
    if not is_enabled('ai.grant_brief_generator',
                      user_id=current_user.id,
                      org_id=getattr(current_user, 'org_id', None)):
        return error_response('auth.access_denied', 403,
                              default='This feature is not enabled for your account.')

    ai_key = f"ai_{current_user.id}"
    if ai_limiter.is_locked(ai_key):
        return error_response('ai.rate_limited', 429)
    ai_limiter.record_failure(ai_key)

    data = get_request_json() or {}
    prompt = (data.get('prompt') or '').strip()
    if not prompt:
        return error_response('validation.missing_field', 400, field='prompt')

    donor_org = None
    try:
        if current_user.org_id:
            org = db.session.get(Organization, current_user.org_id)
            if org:
                donor_org = {
                    'name': org.name,
                    'sectors': getattr(org, 'sectors', None),
                    'countries': getattr(org, 'countries', None),
                }
    except Exception:
        pass

    parsed = AIService.generate_grant_brief(
        donor_org=donor_org,
        prompt=prompt,
        thematic=data.get('thematic'),
        geography=data.get('geography'),
        budget_usd=data.get('budget_usd'),
        language=current_user.language or 'en',
    )

    return jsonify({
        'success': True,
        'brief': parsed,
        'ai_transparency': {
            'engine': 'Claude AI' if parsed.get('source') == 'claude' else 'Template fallback',
            'disclaimer': 'AI-designed grant — review every choice before publishing.',
        },
    })


# ---------------------------------------------------------------------------
# AI call helpfulness feedback (Phase 0.5 closer)
# ---------------------------------------------------------------------------

@ai_bp.route('/calls/<int:call_id>/feedback', methods=['PATCH'])
@login_required
def api_ai_call_feedback(call_id):
    """Record whether the user found the AI output helpful.

    Body: {"helpfulness": "used|edited|dismissed"}

    'used'      = pasted into form unchanged or with minor tweaks
    'edited'    = used as a starting point but rewrote significantly
    'dismissed' = closed without using
    """
    data = get_request_json() or {}
    h = (data.get('helpfulness') or '').strip().lower()
    if h not in ('used', 'edited', 'dismissed'):
        return error_response('validation.invalid_value', 400, field='helpfulness')
    try:
        from sqlalchemy import text
        db.session.execute(
            text("UPDATE ai_call_logs SET helpfulness = :h WHERE id = :id AND user_id = :uid"),
            {"h": h, "id": call_id, "uid": current_user.id},
        )
        db.session.commit()
        return jsonify({'success': True, 'helpfulness': h})
    except Exception as e:
        db.session.rollback()
        logger.error(f"helpfulness patch failed: {e}")
        return error_response('server.unexpected', 500)
