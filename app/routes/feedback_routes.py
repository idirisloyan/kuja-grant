"""
Feedback routes — Phase 31A (May 2026).

POST /api/feedback              — submit a single NPS-style response
GET  /api/feedback/my           — list current user's responses
GET  /api/admin/feedback        — admin: full NPS rollup (added in admin.py)
"""

import logging

from flask import Blueprint, jsonify
from flask_login import login_required, current_user

from app.utils.helpers import get_request_json
from app.services.user_feedback_service import UserFeedbackService

logger = logging.getLogger('kuja')

feedback_bp = Blueprint('feedback', __name__, url_prefix='/api/feedback')


@feedback_bp.route('', methods=['POST'])
@feedback_bp.route('/', methods=['POST'])
@login_required
def api_submit_feedback():
    """Body: { surface: str, score: int 0-10, related_kind?, related_id?, comment? }"""
    data = get_request_json() or {}
    surface = (data.get('surface') or '').strip()
    score = data.get('score')
    related_kind = (data.get('related_kind') or '').strip() or None
    related_id = data.get('related_id')
    comment = (data.get('comment') or '').strip() or None

    result = UserFeedbackService.record(
        user=current_user, surface=surface, score=score,
        related_kind=related_kind, related_id=related_id, comment=comment,
    )
    if not result.get('ok'):
        return jsonify({'success': False, **result}), 400
    return jsonify({'success': True, **result})


@feedback_bp.route('/my', methods=['GET'])
@login_required
def api_my_feedback():
    """Return the calling user's feedback rows so the UI can avoid
    re-prompting for surfaces they've already rated."""
    from app.models import UserFeedback
    rows = (
        UserFeedback.query
        .filter_by(user_id=current_user.id)
        .order_by(UserFeedback.created_at.desc())
        .limit(50).all()
    )
    return jsonify({
        'success': True,
        'feedback': [r.to_dict() for r in rows],
    })
