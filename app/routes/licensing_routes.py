"""
Kuja Grant — Licensing admin routes (Phase 2)
=============================================
Platform admins grant / revoke a donor org's Kuja Grant licence (and the Build
entitlement). The grant app is the source of record for these flags; Kuja Link
(Odoo) owns billing and can later drive them via a webhook, but enforcement
reads the org's flag here. Enforcement itself is gated by GRANT_LICENSING_ENFORCED
so licences can be provisioned BEFORE the gate is switched on (prod-safe rollout).

Blueprint prefix: /api/admin
  GET  /api/admin/licensing/status       - whether enforcement is currently on
  GET  /api/admin/orgs/licenses          - list orgs + licence status
  POST /api/admin/orgs/<org_id>/license  - set / grant / revoke a licence
"""
import logging
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify
from flask_login import current_user

from app.extensions import db
from app.models import Organization
from app.utils.decorators import role_required, licensing_enforced

logger = logging.getLogger('kuja')

licensing_bp = Blueprint('licensing', __name__, url_prefix='/api/admin')


def _parse_expiry(value):
    """Accept an ISO 8601 date/datetime string, or None/'' to clear.

    Returns a datetime or None. Raises ValueError on a malformed non-empty
    value so the caller can return a 400.
    """
    if value in (None, '', 'null'):
        return None
    return datetime.fromisoformat(str(value).strip().replace('Z', '+00:00'))


def _org_row(o):
    return {
        'id': o.id,
        'name': o.name,
        'org_type': o.org_type,
        'kuja_partner_id': o.kuja_partner_id,
        'grant_licensed': bool(o.grant_licensed),
        'grant_license_active': o.is_grant_licensed(),
        'grant_license_tier': o.grant_license_tier,
        'grant_license_expires_at': o.grant_license_expires_at.isoformat() if o.grant_license_expires_at else None,
        'has_kuja_build': bool(o.has_kuja_build),
        'license_updated_at': o.license_updated_at.isoformat() if o.license_updated_at else None,
        'license_updated_by': o.license_updated_by,
    }


@licensing_bp.route('/licensing/status', methods=['GET'])
@role_required('admin')
def api_licensing_status():
    """Report whether donor-licence enforcement is currently switched on."""
    return jsonify({'success': True, 'enforced': licensing_enforced()})


@licensing_bp.route('/orgs/licenses', methods=['GET'])
@role_required('admin')
def api_list_licenses():
    """List orgs with their licence status. ``?donor=1`` restricts to funders."""
    q = Organization.query
    if request.args.get('donor') in ('1', 'true', 'yes'):
        q = q.filter(Organization.org_type.in_(('donor', 'ingo')))
    orgs = q.order_by(Organization.name.asc()).all()
    return jsonify({
        'success': True,
        'enforced': licensing_enforced(),
        'organizations': [_org_row(o) for o in orgs],
    })


@licensing_bp.route('/orgs/<int:org_id>/license', methods=['POST'])
@role_required('admin')
def api_set_license(org_id):
    """Grant, revoke, or amend a donor org's Kuja Grant licence.

    Body (all fields optional; send only what you want to change):
      {
        "licensed": true|false,           # the enforceable flag
        "tier": "standard"|null,          # display/pricing label
        "expires_at": "2027-08-14"|null,  # ISO date/datetime, or null = no expiry
        "has_kuja_build": true|false      # Build ERP finance-feed entitlement
      }
    """
    org = db.session.get(Organization, org_id)
    if not org:
        return jsonify({'success': False, 'error': 'org_not_found'}), 404

    data = request.get_json(silent=True) or {}

    if 'licensed' in data:
        org.grant_licensed = bool(data['licensed'])
    if 'tier' in data:
        tier = data['tier']
        org.grant_license_tier = (str(tier).strip() or None) if tier is not None else None
    if 'expires_at' in data:
        try:
            org.grant_license_expires_at = _parse_expiry(data['expires_at'])
        except (ValueError, TypeError):
            return jsonify({'success': False, 'error': 'invalid_expires_at',
                            'message': 'expires_at must be an ISO 8601 date/datetime, or null.'}), 400
    if 'has_kuja_build' in data:
        org.has_kuja_build = bool(data['has_kuja_build'])

    org.license_updated_at = datetime.now(timezone.utc)
    org.license_updated_by = getattr(current_user, 'email', None) or 'admin'
    db.session.commit()

    # Audit trail (hash-chained). Import locally to match the codebase pattern.
    try:
        from app.services.audit import log_action
        log_action('org.license.updated', current_user.email, 'organization', org.id, {
            'grant_licensed': bool(org.grant_licensed),
            'grant_license_tier': org.grant_license_tier,
            'grant_license_expires_at': org.grant_license_expires_at.isoformat() if org.grant_license_expires_at else None,
            'has_kuja_build': bool(org.has_kuja_build),
        })
    except Exception as e:  # never fail the request on an audit hiccup
        logger.warning(f"license audit log failed for org {org.id}: {e}")

    logger.info(
        f"Org licence updated: org={org.id} '{org.name}' licensed={org.grant_licensed} "
        f"tier={org.grant_license_tier} build={org.has_kuja_build} by {current_user.email}"
    )
    return jsonify({'success': True, 'organization': org.to_dict(), 'enforced': licensing_enforced()})
