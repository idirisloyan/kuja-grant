"""Member feedback routes — Phase 43B.

NEAR risk pillar 4 — feedback mechanisms. NGO members file feedback,
secretariat responds.

NGO: POST submit, GET own feedback
Admin (secretariat): GET inbox (all), PATCH status, PATCH respond
"""

import logging
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from app.extensions import db
from app.models import (
    MemberFeedback, FEEDBACK_CATEGORIES, FEEDBACK_STATUSES,
    AuditChainEntry, NetworkMembership, Organization,
)
from app.utils.helpers import get_request_json
from app.utils.network import get_current_network_id
from app.utils.decorators import role_required

logger = logging.getLogger('kuja')

member_feedback_bp = Blueprint('member_feedback', __name__, url_prefix='/api/member-feedback')


@member_feedback_bp.route('/', methods=['POST'])
@login_required
@role_required('ngo')
def api_submit_feedback():
    """NGO submits feedback to the secretariat.

    Body: { category, subject, body_md, related_kind?, related_id? }
    """
    network_id = get_current_network_id()
    if not network_id:
        return jsonify({'success': False, 'error': 'No network in scope'}), 400
    if not current_user.org_id:
        return jsonify({'success': False, 'error': 'No organisation on user'}), 400

    # Verify the NGO is a member of this network
    is_member = NetworkMembership.query.filter_by(
        network_id=network_id, org_id=current_user.org_id, status='active',
    ).first()
    # We allow non-active members to file feedback too (e.g. an applicant
    # rejected and wanting to appeal a decision). Just log it.
    if not is_member:
        logger.info(
            f"feedback from non-active member org={current_user.org_id} "
            f"network={network_id} — allowed"
        )

    data = get_request_json() or {}
    category = (data.get('category') or 'other').strip().lower()
    if category not in FEEDBACK_CATEGORIES:
        return jsonify({
            'success': False,
            'error': f'category must be one of {list(FEEDBACK_CATEGORIES)}',
        }), 400
    subject = (data.get('subject') or '').strip()
    body_md = (data.get('body_md') or '').strip()
    if not subject or not body_md:
        return jsonify({'success': False, 'error': 'subject and body_md required'}), 400
    if len(subject) > 200:
        return jsonify({'success': False, 'error': 'subject too long (max 200)'}), 400
    if len(body_md) > 8000:
        return jsonify({'success': False, 'error': 'body_md too long (max 8000)'}), 400

    fb = MemberFeedback(
        network_id=network_id,
        org_id=current_user.org_id,
        submitted_by_user_id=current_user.id,
        category=category,
        subject=subject,
        body_md=body_md,
        related_kind=(data.get('related_kind') or None),
        related_id=data.get('related_id') or None,
        status='open',
    )
    db.session.add(fb)
    db.session.flush()
    AuditChainEntry.append(
        action='member_feedback.submitted',
        actor_email=current_user.email,
        subject_kind='member_feedback',
        subject_id=fb.id,
        details={
            'network_id': network_id,
            'org_id': current_user.org_id,
            'category': category,
            'subject': subject[:200],
        },
    )
    db.session.commit()
    return jsonify({'success': True, 'feedback': fb.to_dict()})


@member_feedback_bp.route('/', methods=['GET'])
@login_required
def api_list_feedback():
    """List feedback visible to the caller.

    NGO: own feedback only.
    Admin: all feedback in this network (the inbox).
    """
    network_id = get_current_network_id()
    if not network_id:
        return jsonify({'success': True, 'feedback': []})

    q = MemberFeedback.query.filter_by(network_id=network_id)
    if current_user.role == 'ngo':
        if not current_user.org_id:
            return jsonify({'success': True, 'feedback': []})
        q = q.filter_by(org_id=current_user.org_id)

    status_filter = request.args.get('status')
    if status_filter and status_filter != 'all':
        q = q.filter_by(status=status_filter)

    rows = q.order_by(MemberFeedback.created_at.desc()).limit(200).all()
    return jsonify({
        'success': True,
        'feedback': [r.to_dict() for r in rows],
        'counts': _status_counts(network_id, viewer_org_id=current_user.org_id if current_user.role == 'ngo' else None),
    })


@member_feedback_bp.route('/<int:feedback_id>/respond', methods=['PATCH'])
@login_required
@role_required('admin')
def api_respond_feedback(feedback_id):
    """Secretariat responds to a feedback item.

    Body: { response_md, status? (default 'addressed') }
    """
    network_id = get_current_network_id()
    fb = MemberFeedback.query.get_or_404(feedback_id)
    if network_id and fb.network_id != network_id:
        return jsonify({'success': False, 'error': 'Wrong network'}), 403

    data = get_request_json() or {}
    response_md = (data.get('response_md') or '').strip()
    if not response_md:
        return jsonify({'success': False, 'error': 'response_md required'}), 400
    new_status = (data.get('status') or 'addressed').strip().lower()
    if new_status not in FEEDBACK_STATUSES:
        return jsonify({
            'success': False,
            'error': f'status must be one of {list(FEEDBACK_STATUSES)}',
        }), 400

    fb.response_md = response_md
    fb.response_at = datetime.now(timezone.utc)
    fb.response_by_user_id = current_user.id
    fb.status = new_status

    AuditChainEntry.append(
        action='member_feedback.responded',
        actor_email=current_user.email,
        subject_kind='member_feedback',
        subject_id=fb.id,
        details={
            'status': new_status,
            'response_preview': response_md[:200],
        },
    )
    db.session.commit()
    return jsonify({'success': True, 'feedback': fb.to_dict()})


@member_feedback_bp.route('/<int:feedback_id>/status', methods=['PATCH'])
@login_required
@role_required('admin')
def api_set_status(feedback_id):
    """Secretariat changes status without responding (e.g. → in_review)."""
    fb = MemberFeedback.query.get_or_404(feedback_id)
    network_id = get_current_network_id()
    if network_id and fb.network_id != network_id:
        return jsonify({'success': False, 'error': 'Wrong network'}), 403
    data = get_request_json() or {}
    new_status = (data.get('status') or '').strip().lower()
    if new_status not in FEEDBACK_STATUSES:
        return jsonify({
            'success': False,
            'error': f'status must be one of {list(FEEDBACK_STATUSES)}',
        }), 400
    fb.status = new_status
    AuditChainEntry.append(
        action='member_feedback.status_changed',
        actor_email=current_user.email,
        subject_kind='member_feedback',
        subject_id=fb.id,
        details={'status': new_status},
    )
    db.session.commit()
    return jsonify({'success': True, 'feedback': fb.to_dict()})


def _status_counts(network_id: int, *, viewer_org_id: int | None) -> dict:
    """Per-status counts for the inbox header chips."""
    q = MemberFeedback.query.filter_by(network_id=network_id)
    if viewer_org_id:
        q = q.filter_by(org_id=viewer_org_id)
    out = {s: 0 for s in FEEDBACK_STATUSES}
    for status, count in (
        db.session.query(MemberFeedback.status, db.func.count(MemberFeedback.id))
        .filter(MemberFeedback.network_id == network_id)
        .filter(MemberFeedback.org_id == viewer_org_id if viewer_org_id else db.true())
        .group_by(MemberFeedback.status)
        .all()
    ):
        out[status] = count
    return out
