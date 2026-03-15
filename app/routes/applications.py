from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from datetime import datetime, date, timezone
from app.extensions import db
from app.models import Grant, Application, Document, Review
from app.utils.helpers import get_request_json, paginate_query
from app.utils.decorators import role_required
from app.services.scoring_engine import ScoringEngine
import logging

logger = logging.getLogger('kuja')

applications_bp = Blueprint('applications', __name__, url_prefix='/api/applications')


@applications_bp.route('/', methods=['GET'])
@login_required
def api_list_applications():
    """List applications filtered by role."""
    # Eager-load grant and ngo_org to avoid N+1 queries in to_dict()
    query = Application.query.options(
        db.joinedload(Application.grant),
        db.joinedload(Application.ngo_org),
    )

    if current_user.role == 'ngo':
        # NGO sees only their own applications
        query = query.filter_by(ngo_org_id=current_user.org_id)
    elif current_user.role == 'donor':
        # Donor sees applications for their grants
        query = query.join(Grant).filter(Grant.donor_org_id == current_user.org_id)
    elif current_user.role == 'reviewer':
        # Reviewer sees applications they have reviews for
        review_app_ids = db.session.query(Review.application_id).filter_by(
            reviewer_user_id=current_user.id
        ).subquery()
        query = query.filter(Application.id.in_(review_app_ids))
    # Admin sees all

    status = request.args.get('status')
    if status:
        query = query.filter(Application.status == status)

    grant_id = request.args.get('grant_id', type=int)
    if grant_id:
        query = query.filter(Application.grant_id == grant_id)

    query = query.order_by(Application.created_at.desc())
    pagination = paginate_query(query)

    return jsonify({
        'applications': [a.to_dict(summary=True) for a in pagination.items],
        'total': pagination.total,
        'page': pagination.page,
        'pages': pagination.pages,
    })


@applications_bp.route('/<int:app_id>', methods=['GET'])
@login_required
def api_get_application(app_id):
    """Get full application detail with responses, documents, and reviews."""
    application = db.session.get(Application, app_id)
    if not application:
        return jsonify({'error': 'Application not found'}), 404

    # Access control
    if current_user.role == 'ngo' and application.ngo_org_id != current_user.org_id:
        return jsonify({'error': 'Access denied'}), 403
    if current_user.role == 'donor':
        grant = db.session.get(Grant, application.grant_id)
        if not grant or grant.donor_org_id != current_user.org_id:
            return jsonify({'error': 'Access denied'}), 403

    data = application.to_dict(summary=False)

    # Include documents
    docs = Document.query.filter_by(application_id=app_id).all()
    data['documents'] = [d.to_dict() for d in docs]

    # Include reviews (visible to donor, reviewer, admin)
    if current_user.role in ('donor', 'reviewer', 'admin'):
        reviews = Review.query.filter_by(application_id=app_id).all()
        data['reviews'] = [r.to_dict() for r in reviews]
    else:
        data['reviews'] = []

    # Include grant criteria for context
    if application.grant:
        data['grant_criteria'] = application.grant.get_criteria()
        data['grant_eligibility'] = application.grant.get_eligibility()

    return jsonify({'application': data})


@applications_bp.route('/', methods=['POST'])
@role_required('ngo')
def api_create_application():
    """Create a new grant application (NGO only)."""
    data = get_request_json()
    grant_id = data.get('grant_id')

    if not grant_id:
        return jsonify({'error': 'grant_id is required', 'success': False}), 400

    grant = db.session.get(Grant, grant_id)
    if not grant:
        return jsonify({'error': 'Grant not found', 'success': False}), 404

    if grant.status != 'open':
        return jsonify({'error': 'This grant is not currently accepting applications', 'success': False}), 400

    # Check deadline
    if grant.deadline and grant.deadline < date.today():
        return jsonify({'error': 'The application deadline has passed', 'success': False}), 400

    # Check for existing application
    existing = Application.query.filter_by(
        grant_id=grant_id, ngo_org_id=current_user.org_id
    ).first()
    if existing:
        return jsonify({
            'error': 'Your organization has already applied to this grant',
            'existing_application_id': existing.id,
            'success': False,
        }), 409

    application = Application(
        grant_id=grant_id,
        ngo_org_id=current_user.org_id,
        status='draft',
    )

    if data.get('responses'):
        application.set_responses(data['responses'])
    # Accept both 'eligibility_responses' (correct) and 'eligibility' (legacy)
    elig_data = data.get('eligibility_responses') or data.get('eligibility')
    if elig_data:
        application.set_eligibility_responses(elig_data)

    db.session.add(application)
    db.session.commit()

    logger.info(
        f"Application created: grant={grant_id}, org={current_user.org_id}, app_id={application.id}"
    )
    return jsonify({'success': True, 'application': application.to_dict()}), 201


@applications_bp.route('/<int:app_id>', methods=['PUT'])
@login_required
def api_update_application(app_id):
    """Update an application (responses, eligibility, status)."""
    application = db.session.get(Application, app_id)
    if not application:
        return jsonify({'error': 'Application not found'}), 404

    # Only owning NGO can edit drafts; donors/admins can update status
    if current_user.role == 'ngo':
        if application.ngo_org_id != current_user.org_id:
            return jsonify({'error': 'Access denied'}), 403
        if application.status not in ('draft',):
            return jsonify({'error': 'Cannot edit a submitted application', 'success': False}), 400

    data = get_request_json()

    if 'responses' in data:
        application.set_responses(data['responses'])
    # Accept both 'eligibility_responses' (correct) and 'eligibility' (legacy)
    elig_data = data.get('eligibility_responses') or data.get('eligibility')
    if elig_data:
        application.set_eligibility_responses(elig_data)
    if 'status' in data and current_user.role in ('donor', 'admin'):
        application.status = data['status']
    if 'ai_score' in data:
        application.ai_score = data['ai_score']
    if 'human_score' in data:
        application.human_score = data['human_score']
    if 'final_score' in data:
        application.final_score = data['final_score']

    db.session.commit()
    return jsonify({'success': True, 'application': application.to_dict()})


@applications_bp.route('/<int:app_id>/submit', methods=['POST'])
@role_required('ngo')
def api_submit_application(app_id):
    """Submit an application for review."""
    application = db.session.get(Application, app_id)
    if not application:
        return jsonify({'error': 'Application not found'}), 404

    if application.ngo_org_id != current_user.org_id:
        return jsonify({'error': 'Access denied'}), 403

    if application.status != 'draft':
        return jsonify({'error': 'Only draft applications can be submitted', 'success': False}), 400

    # Validate that required responses exist
    grant = application.grant
    if grant:
        criteria = grant.get_criteria() or []
        responses = application.get_responses() or {}
        missing = []
        for idx, criterion in enumerate(criteria):
            # Support both id-based keys (e.g. "approach") and index-based keys (e.g. "criterion_0")
            cid = str(criterion.get('id', ''))
            index_key = f'criterion_{idx}'
            response_text = responses.get(cid, '') if cid else ''
            if not response_text:
                response_text = responses.get(index_key, '')
            if not str(response_text).strip():
                missing.append(criterion.get('label', cid or index_key))
        if missing:
            return jsonify({
                'error': 'Missing required responses',
                'missing_criteria': missing,
                'success': False,
            }), 400

    # Check deadline
    if grant and grant.deadline and grant.deadline < date.today():
        return jsonify({'error': 'The application deadline has passed', 'success': False}), 400

    application.status = 'submitted'
    application.submitted_at = datetime.now(timezone.utc)

    # Auto-score with AI
    try:
        score_result = ScoringEngine.score_application(application)
        application.ai_score = score_result.get('overall_score')
        application.final_score = score_result.get('overall_score')
    except Exception as e:
        logger.error(f"Auto-scoring failed for application {app_id}: {e}")

    db.session.commit()

    logger.info(f"Application submitted: {app_id} (score: {application.ai_score})")
    return jsonify({'success': True, 'application': application.to_dict()})
