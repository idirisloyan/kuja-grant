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


# ----------------------------------------------------------------------
# Phase 15C — per-org settings JSON (stage labels, etc).
# Admin-only writes; any logged-in user can read their own org settings.
# ----------------------------------------------------------------------

@organizations_bp.route('/<int:org_id>/settings', methods=['GET'])
@login_required
def api_org_settings_get(org_id):
    org = db.session.get(Organization, org_id)
    if not org:
        return jsonify({'success': False, 'error': 'Org not found'}), 404
    # Read: own org OR admin
    if current_user.role != 'admin' and org.id != current_user.org_id:
        return jsonify({'success': False, 'error': 'Insufficient permissions'}), 403
    return jsonify({
        'success': True,
        'org_id': org.id,
        'settings': org.get_settings(),
    })


# ----------------------------------------------------------------------
# Phase 18B — Public donor profile aggregates.
# Visible to any logged-in user. Aggregates only — never names specific
# NGOs that won/lost.
# ----------------------------------------------------------------------

@organizations_bp.route('/<int:org_id>/donor-profile', methods=['GET'])
@login_required
def api_donor_profile(org_id):
    from app.services.donor_profile_service import DonorProfileService
    from app.utils.cache import _dashboard_cache

    cache_key = f'donor_profile_{org_id}'
    cached = _dashboard_cache.get(cache_key)
    if cached is not None:
        return jsonify({'cached': True, **cached})
    result = DonorProfileService.for_donor(donor_org_id=org_id)
    _dashboard_cache.set(cache_key, result)
    return jsonify(result)


_ALLOWED_STAGE_KEYS = ('draft', 'submitted', 'under_review',
                       'scored', 'awarded', 'rejected')


@organizations_bp.route('/<int:org_id>/settings', methods=['PUT'])
@login_required
def api_org_settings_put(org_id):
    """Write the per-org settings JSON.

    Body: { settings: { stage_labels?: { <status>: <label>, ... }, ... } }

    Permissions:
      - admin: any org
      - owner / org member with 'admin' on their own org (we treat any
        member of the org as authorized; tighten later if needed)
    """
    from app.utils.helpers import get_request_json

    org = db.session.get(Organization, org_id)
    if not org:
        return jsonify({'success': False, 'error': 'Org not found'}), 404
    if current_user.role != 'admin' and org.id != current_user.org_id:
        return jsonify({'success': False, 'error': 'Insufficient permissions'}), 403

    data = get_request_json() or {}
    incoming = data.get('settings')
    if not isinstance(incoming, dict):
        return jsonify({'success': False, 'error': 'settings must be an object'}), 400

    # Validate + sanitise stage_labels (only known keys, max 60 chars each)
    raw_labels = incoming.get('stage_labels') or {}
    if not isinstance(raw_labels, dict):
        return jsonify({'success': False, 'error': 'stage_labels must be an object'}), 400
    cleaned_labels = {}
    for k, v in raw_labels.items():
        if k in _ALLOWED_STAGE_KEYS and isinstance(v, str):
            label = v.strip()[:60]
            if label:
                cleaned_labels[k] = label

    cur = org.get_settings()
    if cleaned_labels:
        cur['stage_labels'] = cleaned_labels
    elif 'stage_labels' in cur:
        # Empty dict explicitly clears the override
        cur.pop('stage_labels', None)

    org.set_settings(cur)
    db.session.commit()

    return jsonify({
        'success': True,
        'org_id': org.id,
        'settings': org.get_settings(),
    })
