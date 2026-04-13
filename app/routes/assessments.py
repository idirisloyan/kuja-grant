from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from datetime import datetime, timezone
from app.extensions import db
from app.models import Assessment, Document, Organization
from app.utils.helpers import get_request_json, paginate_query
from app.utils.decorators import role_required
from app.services.scoring_engine import _calculate_assessment_scores
import logging

logger = logging.getLogger('kuja')

assessments_bp = Blueprint('assessments', __name__, url_prefix='/api/assessments')


@assessments_bp.route('/', methods=['GET'])
@login_required
def api_list_assessments():
    """List assessments for the current user's organization."""
    if current_user.role in ('admin',):
        query = Assessment.query
    else:
        query = Assessment.query.filter_by(org_id=current_user.org_id)

    status = request.args.get('status')
    if status:
        query = query.filter_by(status=status)

    query = query.order_by(Assessment.created_at.desc())
    pagination = paginate_query(query)

    return jsonify({
        'assessments': [a.to_dict() for a in pagination.items],
        'total': pagination.total,
        'page': pagination.page,
        'pages': pagination.pages,
    })


@assessments_bp.route('/<int:assess_id>', methods=['GET'])
@login_required
def api_get_assessment(assess_id):
    """Get full assessment detail."""
    assessment = db.session.get(Assessment, assess_id)
    if not assessment:
        return jsonify({'error': 'Assessment not found'}), 404

    # Access control
    if current_user.role not in ('admin',) and assessment.org_id != current_user.org_id:
        return jsonify({'error': 'Access denied'}), 403

    data = assessment.to_dict()

    # Include documents
    docs = Document.query.filter_by(assessment_id=assess_id).all()
    data['documents'] = [d.to_dict() for d in docs]

    return jsonify({'assessment': data})


@assessments_bp.route('/', methods=['POST'])
@login_required
def api_create_assessment():
    """Create / start a new organizational assessment."""
    data = get_request_json()
    org_id = current_user.org_id

    if not org_id:
        return jsonify({'error': 'User must belong to an organization', 'success': False}), 400

    assessment = Assessment(
        org_id=org_id,
        assess_type=data.get('assess_type', 'free'),
        framework=data.get('framework', 'kuja'),
        status='in_progress',
    )

    if data.get('checklist_responses'):
        assessment.set_checklist_responses(data['checklist_responses'])

        # Auto-calculate scores when checklist is provided at creation time
        checklist = data['checklist_responses']
        category_scores, overall, gaps = _calculate_assessment_scores(
            checklist, assessment.framework or 'kuja'
        )
        assessment.set_category_scores(category_scores)
        assessment.overall_score = overall
        assessment.set_gaps(gaps)
        assessment.status = 'completed'
        assessment.completed_at = datetime.now(timezone.utc)

        # Update org assess score
        org = db.session.get(Organization, org_id)
        if org:
            org.assess_score = overall
            org.assess_date = datetime.now(timezone.utc)

    db.session.add(assessment)
    db.session.commit()

    logger.info(f"Assessment created: org={org_id}, id={assessment.id}, score={assessment.overall_score}")
    return jsonify({'success': True, 'assessment': assessment.to_dict()}), 201


@assessments_bp.route('/<int:assess_id>', methods=['PUT'])
@login_required
def api_update_assessment(assess_id):
    """Update assessment checklist responses and calculate scores."""
    assessment = db.session.get(Assessment, assess_id)
    if not assessment:
        return jsonify({'error': 'Assessment not found'}), 404

    if current_user.role not in ('admin',) and assessment.org_id != current_user.org_id:
        return jsonify({'error': 'Access denied'}), 403

    data = get_request_json()

    if 'checklist_responses' in data:
        assessment.set_checklist_responses(data['checklist_responses'])

    if 'status' in data:
        assessment.status = data['status']

    # Auto-calculate scores from checklist responses
    if data.get('calculate_scores') or data.get('status') == 'completed':
        checklist = assessment.get_checklist_responses() or {}
        category_scores, overall, gaps = _calculate_assessment_scores(checklist, assessment.framework or 'kuja')
        assessment.set_category_scores(category_scores)
        assessment.overall_score = overall
        assessment.set_gaps(gaps)

        if data.get('status') == 'completed' or assessment.status == 'completed':
            assessment.status = 'completed'
            assessment.completed_at = datetime.now(timezone.utc)

            # Update org assess score
            org = db.session.get(Organization, assessment.org_id)
            if org:
                org.assess_score = overall
                org.assess_date = datetime.now(timezone.utc)

    db.session.commit()
    return jsonify({'success': True, 'assessment': assessment.to_dict()})


@assessments_bp.route('/frameworks', methods=['GET'])
@login_required
def api_get_assessment_frameworks():
    """Return available assessment frameworks and their structures."""
    frameworks = {
        'kuja': {
            'name': 'Kuja Standard Assessment',
            'description': 'Kuja Link standard capacity assessment covering 5 key organizational domains.',
            'categories': ['Governance', 'Financial Management', 'Program Management', 'Human Resources', 'Monitoring & Evaluation'],
            'total_items': 26,
            'estimated_time': '30-45 minutes',
        },
        'step': {
            'name': 'STEP Assessment',
            'description': 'Strengthening Effective Partner Engagement and Performance assessment tool used by major international NGOs.',
            'categories': ['Organizational Governance', 'Financial Systems', 'Administration', 'Human Resource Management', 'Program Quality'],
            'total_items': 26,
            'estimated_time': '45-60 minutes',
        },
        'un_hact': {
            'name': 'UN HACT Micro Assessment',
            'description': 'UN Harmonized Approach to Cash Transfers micro-assessment for implementing partners.',
            'categories': ['Implementing Partner Info', 'Internal Control', 'Accounting Policies', 'Fixed Assets', 'Procurement'],
            'total_items': 22,
            'estimated_time': '45-60 minutes',
        },
        'chs': {
            'name': 'CHS Self-Assessment',
            'description': 'Core Humanitarian Standard on Quality and Accountability self-assessment.',
            'categories': ['Humanitarian Response', 'Effectiveness', 'Accountability', 'Coordination', 'Staff Competency', 'Management Support', 'Learning'],
            'total_items': 27,
            'estimated_time': '60-90 minutes',
        },
        'nupas': {
            'name': 'NUPAS Assessment',
            'description': 'Non-profit Unified Performance Assessment System for comprehensive organizational evaluation.',
            'categories': ['Governance & Leadership', 'Financial Stewardship', 'Program Delivery', 'People & Culture', 'Learning & Adaptation'],
            'total_items': 27,
            'estimated_time': '60-90 minutes',
        },
    }
    # Attach real checklist item keys from the scoring engine so frontends
    # generate the exact keys the backend expects for scoring.
    from app.services.scoring_engine import FRAMEWORK_CATEGORIES
    for fw_key, fw_info in frameworks.items():
        cats = FRAMEWORK_CATEGORIES.get(fw_key, {})
        fw_info['category_items'] = {}
        for cat_key, cat_data in cats.items():
            fw_info['category_items'][cat_key] = {
                'weight': cat_data['weight'],
                'label': cat_key.replace('_', ' ').title(),
                'items': [{'key': k, 'label': k.replace('_', ' ').title()} for k in cat_data['items']],
            }

    return jsonify({'frameworks': frameworks})
