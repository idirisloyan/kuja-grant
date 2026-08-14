"""
build_routes.py — Kuja Build financial-source binding + donor financials feed.

Phase 0/1 of docs/KUJA_BUILD_NETWORKED_TENANTS_INTEGRATION.md. Inert until a
BuildClient is configured: an operator can map a grant to a Build account now,
and the donor financials endpoint returns the manual/empty shape until the feed
is wired.

Blueprint prefix: /api
  POST /api/grants/<id>/financial-source  - operator sets financial_source + build_ref
  GET  /api/grants/<id>/financials        - donor-scoped normalised financials
  GET  /api/admin/build/status            - is the Build feed configured?
"""
import logging

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from app.extensions import db
from app.models import Grant
from app.utils.decorators import role_required

logger = logging.getLogger('kuja')

build_bp = Blueprint('build', __name__, url_prefix='/api')


def _can_view_grant_financials(grant) -> bool:
    """Donor-scoped view: platform admins, or the donor org that owns the grant.
    Isolation by record — a donor only ever reaches a grant its own org owns,
    so it can only ever reach that grant's single build_ref."""
    role = getattr(current_user, 'role', None)
    if role == 'admin':
        return True
    return role == 'donor' and grant.donor_org_id == getattr(current_user, 'org_id', None)


@build_bp.route('/grants/<int:grant_id>/financial-source', methods=['POST'])
@role_required('admin')
def api_set_financial_source(grant_id):
    """Operator maps a grant's financial source. Body:
    { "financial_source": "erp"|"manual", "build_ref": "<analytic account id>"|null }
    """
    grant = db.session.get(Grant, grant_id)
    if not grant:
        return jsonify({'success': False, 'error': 'grant_not_found'}), 404

    data = request.get_json(silent=True) or {}
    src = str(data.get('financial_source', grant.financial_source_value())).strip().lower()
    if src not in ('erp', 'manual'):
        return jsonify({'success': False, 'error': 'invalid_financial_source',
                        'message': "financial_source must be 'erp' or 'manual'."}), 400
    grant.financial_source = src
    if 'build_ref' in data:
        ref = data.get('build_ref')
        grant.build_ref = (str(ref).strip() or None) if ref is not None else None
    db.session.commit()

    try:
        from app.services.audit import log_action
        log_action('grant.financial_source.set', current_user.email, 'grant', grant.id,
                   {'financial_source': grant.financial_source, 'build_ref': grant.build_ref})
    except Exception as e:  # never fail the request on an audit hiccup
        logger.warning(f"financial_source audit log failed for grant {grant.id}: {e}")

    logger.info(f"Grant financial source set: grant={grant.id} source={grant.financial_source} "
                f"build_ref={grant.build_ref} by {current_user.email}")
    return jsonify({'success': True, 'grant_id': grant.id,
                    'financial_source': grant.financial_source_value(), 'build_ref': grant.build_ref})


@build_bp.route('/grants/<int:grant_id>/financials', methods=['GET'])
@login_required
def api_grant_financials(grant_id):
    """Return the grant's normalised financials (erp feed or manual/empty)."""
    grant = db.session.get(Grant, grant_id)
    if not grant:
        return jsonify({'success': False, 'error': 'grant_not_found'}), 404
    if not _can_view_grant_financials(grant):
        return jsonify({'success': False, 'error': 'access_denied'}), 403

    from app.services import build_engine
    return jsonify({'success': True, 'grant_id': grant.id,
                    'financials': build_engine.get_grant_financials(grant)})


@build_bp.route('/admin/build/status', methods=['GET'])
@role_required('admin')
def api_build_status():
    """Diagnostics: whether the Build feed is configured on this deployment."""
    from app.services import build_engine
    return jsonify({'success': True, **build_engine.build_status()})
