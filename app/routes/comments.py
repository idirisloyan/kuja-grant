"""
Entity comments + @mentions — Phase 13.18.

PMO's @mention syntax: @<email-localpart>. Multiple-match fallback to
full email lookup, then user_id. Mentions trigger an in-app
notification (Notification table) — web push via VAPID lands later.
"""

import re
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from app.extensions import db
from app.models import EntityComment, User, Application, Grant, Report, Risk, Organization, Notification
from app.utils.api_errors import error_response
from app.utils.helpers import get_request_json
from app.utils.validation import (
    require_string, require_enum, require_int, optional_string,
    ValidationError, to_error_response,
)

comments_bp = Blueprint('comments', __name__, url_prefix='/api/comments')

VALID_ENTITY_KINDS = ('application', 'grant', 'report', 'risk', 'organization')

_MENTION_RE = re.compile(r'@([A-Za-z0-9._-]+)')


def _can_view(entity_kind: str, entity_id: int) -> bool:
    """Visibility check — donor and NGO must be on opposite sides of the
    same grant/application/report relationship to read+post comments."""
    role = current_user.role
    org_id = getattr(current_user, 'org_id', None)
    if role == 'admin':
        return True
    if entity_kind == 'application':
        a = db.session.get(Application, entity_id)
        if not a:
            return False
        if role == 'ngo':
            return a.ngo_org_id == org_id
        if role == 'donor':
            g = db.session.get(Grant, a.grant_id) if a.grant_id else None
            return bool(g and getattr(g, 'donor_org_id', None) == org_id)
        if role == 'reviewer':
            return True
        return False
    if entity_kind == 'grant':
        g = db.session.get(Grant, entity_id)
        if not g:
            return False
        if role == 'donor':
            return getattr(g, 'donor_org_id', None) == org_id
        # NGOs see comments on grants they've applied to.
        if role == 'ngo':
            ap = Application.query.filter_by(grant_id=entity_id, ngo_org_id=org_id).first()
            return ap is not None
        return False
    if entity_kind == 'report':
        r = db.session.get(Report, entity_id)
        if not r:
            return False
        if role == 'ngo':
            return r.submitted_by_org_id == org_id
        if role == 'donor':
            g = db.session.get(Grant, r.grant_id) if r.grant_id else None
            return bool(g and getattr(g, 'donor_org_id', None) == org_id)
        return False
    if entity_kind == 'risk':
        rk = db.session.get(Risk, entity_id)
        if not rk:
            return False
        return _can_view(rk.subject_kind, rk.subject_id)  # delegate to subject
    if entity_kind == 'organization':
        if role == 'ngo':
            return entity_id == org_id
        if role == 'donor':
            return True  # donors see org comments for due diligence
        return False
    return False


def _resolve_mentions(body_md: str, viewer_org_id: int | None) -> list[int]:
    """@email-localpart resolver. Returns list of mentioned user IDs."""
    handles = set(_MENTION_RE.findall(body_md or ''))
    if not handles:
        return []
    resolved = set()
    for h in handles:
        h_lower = h.lower()
        # 1. Email localpart exact match
        users = User.query.filter(
            db.func.lower(User.email).like(f'{h_lower}@%')
        ).all()
        if not users:
            # 2. Full email
            users = User.query.filter(db.func.lower(User.email) == h_lower).all()
        # If multiple matches, prefer same-org members.
        if len(users) > 1 and viewer_org_id:
            same_org = [u for u in users if getattr(u, 'org_id', None) == viewer_org_id]
            if same_org:
                users = same_org
        for u in users[:1]:
            resolved.add(u.id)
    return sorted(resolved)


@comments_bp.route('/', methods=['GET'])
@login_required
def list_comments():
    """List comments for an entity. Required: entity_kind + entity_id."""
    entity_kind = request.args.get('entity_kind')
    entity_id = request.args.get('entity_id', type=int)
    if not entity_kind or not entity_id:
        return error_response('validation.missing_field', 400, field='entity_kind/entity_id')
    if entity_kind not in VALID_ENTITY_KINDS:
        return error_response('validation.invalid_value', 400, field='entity_kind')
    if not _can_view(entity_kind, entity_id):
        return error_response('auth.access_denied', 403)
    rows = (EntityComment.query
            .filter_by(entity_kind=entity_kind, entity_id=entity_id)
            .order_by(EntityComment.created_at.asc())
            .limit(200).all())
    return jsonify({'success': True, 'comments': [c.to_dict() for c in rows]})


@comments_bp.route('/', methods=['POST'])
@login_required
def create_comment():
    """Create a comment. @mentions trigger Notification rows."""
    data = get_request_json() or {}
    try:
        entity_kind = require_enum(data, 'entity_kind', VALID_ENTITY_KINDS)
        entity_id = require_int(data, 'entity_id', minimum=1)
        body_md = require_string(data, 'body_md', max_len=4000)
    except ValidationError as e:
        return to_error_response(e)
    if not _can_view(entity_kind, entity_id):
        return error_response('auth.access_denied', 403)

    mentioned = _resolve_mentions(body_md, getattr(current_user, 'org_id', None))
    c = EntityComment(
        entity_kind=entity_kind,
        entity_id=entity_id,
        author_user_id=current_user.id,
        body_md=body_md,
    )
    c.set_mentions(mentioned)
    db.session.add(c)
    db.session.commit()

    # Fire in-app notifications for each mentioned user (skip self).
    for uid in mentioned:
        if uid == current_user.id:
            continue
        try:
            n = Notification(
                user_id=uid,
                kind='mention',
                title=f'You were mentioned by {current_user.name or current_user.email}',
                body=(body_md[:200] + ('…' if len(body_md) > 200 else '')),
                # Adopting an extra metadata blob via meta_json if Notification supports it.
            )
            db.session.add(n)
        except Exception:
            pass
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()

    return jsonify({'success': True, 'comment': c.to_dict()})


@comments_bp.route('/<int:comment_id>', methods=['PATCH'])
@login_required
def edit_comment(comment_id):
    """Edit a comment (author only). Records edited_at, re-resolves mentions."""
    c = db.session.get(EntityComment, comment_id)
    if not c:
        return error_response('not_found', 404)
    if c.author_user_id != current_user.id and current_user.role != 'admin':
        return error_response('auth.access_denied', 403)
    data = get_request_json() or {}
    try:
        body_md = require_string(data, 'body_md', max_len=4000)
    except ValidationError as e:
        return to_error_response(e)
    c.body_md = body_md
    c.set_mentions(_resolve_mentions(body_md, getattr(current_user, 'org_id', None)))
    c.edited_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify({'success': True, 'comment': c.to_dict()})


@comments_bp.route('/<int:comment_id>', methods=['DELETE'])
@login_required
def delete_comment(comment_id):
    """Delete a comment (author or admin)."""
    c = db.session.get(EntityComment, comment_id)
    if not c:
        return error_response('not_found', 404)
    if c.author_user_id != current_user.id and current_user.role != 'admin':
        return error_response('auth.access_denied', 403)
    db.session.delete(c)
    db.session.commit()
    return jsonify({'success': True})
