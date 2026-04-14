"""
Kuja Grant Management System - Notification Routes
====================================================
In-app notification endpoints for all authenticated users.

Blueprint prefix: /api/notifications
Routes served:
  /api/notifications/              GET  - list user's notifications (paginated)
  /api/notifications/unread-count  GET  - count of unread notifications
  /api/notifications/<id>/read     PUT  - mark one notification as read
  /api/notifications/read-all      PUT  - mark all notifications as read
"""

import logging

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from app.extensions import db
from app.models.notification import Notification

logger = logging.getLogger('kuja')

notifications_bp = Blueprint('notifications', __name__, url_prefix='/api/notifications')


@notifications_bp.route('/', methods=['GET'])
@login_required
def api_list_notifications():
    """List the current user's notifications, unread first, paginated."""
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 20, type=int), 100)
    unread_only = request.args.get('unread_only', '').lower() == 'true'

    query = Notification.query.filter_by(user_id=current_user.id)

    if unread_only:
        query = query.filter_by(read=False)

    # Unread first, then by created_at descending
    query = query.order_by(Notification.read.asc(), Notification.created_at.desc())

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'notifications': [n.to_dict() for n in pagination.items],
        'total': pagination.total,
        'page': pagination.page,
        'pages': pagination.pages,
        'unread_count': Notification.query.filter_by(
            user_id=current_user.id, read=False
        ).count(),
    })


@notifications_bp.route('/unread-count', methods=['GET'])
@login_required
def api_unread_count():
    """Return count of unread notifications for the current user."""
    count = Notification.query.filter_by(
        user_id=current_user.id, read=False
    ).count()
    return jsonify({'unread_count': count})


@notifications_bp.route('/<int:notification_id>/read', methods=['PUT'])
@login_required
def api_mark_read(notification_id):
    """Mark a single notification as read."""
    notification = db.session.get(Notification, notification_id)
    if not notification:
        return jsonify({'error': 'Notification not found'}), 404
    if notification.user_id != current_user.id:
        return jsonify({'error': 'Access denied'}), 403

    notification.read = True
    db.session.commit()

    return jsonify({'success': True, 'notification': notification.to_dict()})


@notifications_bp.route('/read-all', methods=['PUT'])
@login_required
def api_mark_all_read():
    """Mark all of the current user's notifications as read."""
    updated = Notification.query.filter_by(
        user_id=current_user.id, read=False
    ).update({'read': True})
    db.session.commit()

    return jsonify({'success': True, 'marked_read': updated})
