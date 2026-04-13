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
