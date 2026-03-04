from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from app.extensions import db
from app.models import Organization, User, Assessment, ComplianceCheck
from app.utils.helpers import paginate_query
import logging

logger = logging.getLogger('kuja')

organizations_bp = Blueprint('organizations', __name__, url_prefix='/api/organizations')


@organizations_bp.route('/', methods=['GET'])
@login_required
def api_list_organizations():
    """List organizations, optionally filtered by type."""
    query = Organization.query

    org_type = request.args.get('type')
    if org_type:
        query = query.filter_by(org_type=org_type)

    country = request.args.get('country')
    if country:
        query = query.filter_by(country=country)

    verified = request.args.get('verified')
    if verified is not None:
        query = query.filter_by(verified=verified.lower() == 'true')

    search = request.args.get('search', '').strip()
    if search:
        query = query.filter(Organization.name.ilike(f'%{search}%'))

    query = query.order_by(Organization.name)
    pagination = paginate_query(query)

    return jsonify({
        'organizations': [o.to_dict() for o in pagination.items],
        'total': pagination.total,
        'page': pagination.page,
        'pages': pagination.pages,
    })


@organizations_bp.route('/<int:org_id>', methods=['GET'])
@login_required
def api_get_organization(org_id):
    """Get full organization detail including compliance checks."""
    org = db.session.get(Organization, org_id)
    if not org:
        return jsonify({'error': 'Organization not found', 'success': False}), 404

    # NGOs can only view their own org or donor/reviewer orgs (public info)
    if current_user.role == 'ngo' and org.id != current_user.org_id:
        # Return limited info for other orgs
        data = {
            'id': org.id,
            'name': org.name,
            'org_type': org.org_type,
            'country': org.country,
            'verified': org.verified,
        }
        return jsonify({'organization': data})

    data = org.to_dict()

    # Include compliance checks
    checks = ComplianceCheck.query.filter_by(org_id=org_id) \
        .order_by(ComplianceCheck.checked_at.desc()).all()
    data['compliance_checks'] = [c.to_dict() for c in checks]

    # Include user count
    data['user_count'] = User.query.filter_by(org_id=org_id).count()

    # Include assessment info
    latest_assessment = Assessment.query.filter_by(org_id=org_id) \
        .order_by(Assessment.created_at.desc()).first()
    if latest_assessment:
        data['latest_assessment'] = latest_assessment.to_dict()

    return jsonify({'organization': data})
