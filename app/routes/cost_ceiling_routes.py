"""
Phase 108 — Per-tenant AI cost ceiling admin endpoints.

  GET /api/admin/cost-ceiling                  — list every org's
                                                  current cap + month-to-
                                                  -date spend + % used.
  PUT /api/admin/cost-ceiling/<org_id>          — set or clear the cap.
                                                  body: { budget_usd: number |
                                                          null }

Auth: admin only. The hard-cap enforcement (BudgetExceededError) and the
soft-threshold notification flow (cost_ceiling_service) already exist —
this is the surface admins use to actually configure the caps.
"""

from __future__ import annotations

import logging
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from app.extensions import db
from app.models.organization import Organization
from app.services.ai_budget_service import AIBudgetService

logger = logging.getLogger('kuja')

cost_ceiling_bp = Blueprint('cost_ceiling', __name__, url_prefix='/api/admin')


def _is_admin() -> bool:
    return getattr(current_user, 'role', None) == 'admin'


@cost_ceiling_bp.route('/cost-ceiling', methods=['GET'])
@login_required
def list_caps():
    if not _is_admin():
        return jsonify({'success': False, 'error': 'Admin only.'}), 403

    orgs = Organization.query.order_by(Organization.name.asc()).all()
    rows = []
    for o in orgs:
        status = AIBudgetService.check_budget(o.id)
        budget = status.get('budget_usd')
        spent = status.get('spent_usd') or 0
        pct = round(100 * spent / budget, 1) if (budget and budget > 0) else None
        rows.append({
            'org_id': o.id,
            'org_name': o.name,
            'org_type': getattr(o, 'org_type', None),
            'budget_usd': float(budget) if budget is not None else None,
            'spent_usd': float(spent),
            'pct_used': pct,
            'reason': status.get('reason'),
        })
    rows.sort(key=lambda r: -(r['pct_used'] or 0))
    return jsonify({'success': True, 'orgs': rows})


@cost_ceiling_bp.route('/cost-ceiling/<int:org_id>', methods=['PUT'])
@login_required
def set_cap(org_id):
    if not _is_admin():
        return jsonify({'success': False, 'error': 'Admin only.'}), 403

    body = request.get_json(silent=True) or {}
    raw = body.get('budget_usd')
    if raw is None:
        new_budget = None
    else:
        try:
            new_budget = Decimal(str(raw)).quantize(Decimal('0.01'))
            if new_budget < 0:
                raise InvalidOperation
        except InvalidOperation:
            return jsonify({'success': False, 'error': 'budget_usd must be a non-negative number or null'}), 400

    org = db.session.get(Organization, org_id)
    if org is None:
        return jsonify({'success': False, 'error': 'Org not found.'}), 404

    org.ai_monthly_budget_usd = new_budget
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        logger.exception('cost ceiling commit failed')
        return jsonify({'success': False, 'error': f'commit failed: {e}'}), 500

    status = AIBudgetService.check_budget(org_id)
    return jsonify({
        'success': True,
        'org_id': org.id,
        'budget_usd': float(new_budget) if new_budget is not None else None,
        'status': status,
    })
