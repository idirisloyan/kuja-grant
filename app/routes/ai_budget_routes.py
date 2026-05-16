"""
AI budget routes — Phase 5.

Blueprint prefix: /api/ai-budget
Routes:
  GET    /api/ai-budget/me                - current org status (any user)
  GET    /api/ai-budget/admin/spend       - full admin spend report
  PUT    /api/ai-budget/org/<id>          - set a budget cap (admin only)
"""

import logging
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify
from flask_login import login_required, current_user

from app.extensions import db
from app.models import Organization
from app.services.ai_budget_service import AIBudgetService
from app.utils.helpers import get_request_json
from app.utils.decorators import role_required

logger = logging.getLogger('kuja')

ai_budget_bp = Blueprint('ai_budget', __name__, url_prefix='/api/ai-budget')


@ai_budget_bp.route('/me', methods=['GET'])
@login_required
def api_my_budget():
    if not current_user.org_id:
        return jsonify({'success': False, 'error': 'no org scope'}), 400
    status = AIBudgetService.check_budget(current_user.org_id)
    return jsonify({'success': True, 'status': status})


@ai_budget_bp.route('/admin/spend', methods=['GET'])
@login_required
@role_required('admin')
def api_admin_spend():
    return jsonify({'success': True, 'report': AIBudgetService.admin_spend_report()})


@ai_budget_bp.route('/org/<int:org_id>', methods=['PUT'])
@login_required
@role_required('admin')
def api_set_budget(org_id):
    """Set a monthly AI budget for an org. Body: {budget_usd: number | null}."""
    org = db.session.get(Organization, org_id)
    if not org:
        return jsonify({'success': False, 'error': 'org not found'}), 404
    data = get_request_json() or {}
    raw = data.get('budget_usd')
    if raw is None:
        org.ai_monthly_budget_usd = None
    else:
        try:
            cap = Decimal(str(raw))
            if cap < 0:
                return jsonify({'success': False, 'error': 'budget cannot be negative'}), 400
            org.ai_monthly_budget_usd = cap
        except (InvalidOperation, TypeError):
            return jsonify({'success': False, 'error': 'budget_usd must be a number or null'}), 400
    db.session.commit()
    return jsonify({
        'success': True,
        'org_id': org_id,
        'budget_usd': float(org.ai_monthly_budget_usd) if org.ai_monthly_budget_usd is not None else None,
    })
