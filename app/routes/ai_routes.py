import os
from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user
from app.extensions import db
from app.models import Grant, Application, Report
from app.utils.helpers import get_request_json
from app.utils.decorators import role_required
from app.services.ai_service import AIService, HAS_ANTHROPIC, ANTHROPIC_API_KEY
from app.services.scoring_engine import ScoringEngine
from app.utils.rate_limiter import ai_limiter
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
