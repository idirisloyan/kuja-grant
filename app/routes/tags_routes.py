"""
Tags + tag assignments — Phase 15E.

Blueprint prefix: /api/tags

Routes:
  GET    /api/tags                       - list current org's tags
  POST   /api/tags                       - find-or-create by name
  GET    /api/tags/by-target?kind=&id=  - tags applied to a target row
  POST   /api/tags/assign                - assign existing tag to target
  POST   /api/tags/apply-by-name         - find-or-create + assign in one trip
  DELETE /api/tags/assign                - remove an assignment

All operations are org-scoped to the caller's org_id.

Find-or-create rule: case-insensitive match on name_lower; preserves
the user's original casing on first create.
"""

import logging

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from app.extensions import db
from app.models import Tag, TagAssignment
from app.utils.helpers import get_request_json

logger = logging.getLogger('kuja')

tags_bp = Blueprint('tags', __name__, url_prefix='/api/tags')

ALLOWED_TARGET_KINDS = ('grant', 'organization', 'application')


def _norm(name: str) -> str:
    return (name or '').strip().lower()


def _find_or_create_tag(*, org_id: int, name: str, user_id: int | None) -> Tag | None:
    name = (name or '').strip()[:60]
    if not name:
        return None
    lower = _norm(name)
    existing = Tag.query.filter_by(org_id=org_id, name_lower=lower).first()
    if existing:
        return existing
    tag = Tag(
        org_id=org_id,
        name=name,
        name_lower=lower,
        created_by_user_id=user_id,
    )
    db.session.add(tag)
    db.session.flush()
    return tag


def _can_assign(target_kind: str, target_id: int, user_org_id: int, user_role: str) -> bool:
    """Visibility check: caller can only assign tags to entities their
    org owns (donor → grants/applications-for-their-grants;
    NGO → applications they own; admin → anything)."""
    if user_role == 'admin':
        return True
    if target_kind == 'organization':
        # Only your own org (and admins, handled above).
        return target_id == user_org_id
    if target_kind == 'grant':
        from app.models import Grant
        g = db.session.get(Grant, target_id)
        if not g:
            return False
        if user_role == 'donor':
            return g.donor_org_id == user_org_id
        return False
    if target_kind == 'application':
        from app.models import Application, Grant
        a = db.session.get(Application, target_id)
        if not a:
            return False
        if user_role == 'ngo':
            return a.ngo_org_id == user_org_id
        if user_role == 'donor':
            g = db.session.get(Grant, a.grant_id)
            return bool(g and g.donor_org_id == user_org_id)
        return False
    return False


@tags_bp.route('', methods=['GET'])
@login_required
def api_tags_list():
    if not current_user.org_id:
        return jsonify({'success': True, 'tags': []})
    tags = (
        Tag.query.filter_by(org_id=current_user.org_id)
        .order_by(Tag.name_lower.asc()).all()
    )
    return jsonify({'success': True, 'tags': [t.to_dict() for t in tags]})


@tags_bp.route('', methods=['POST'])
@login_required
def api_tags_create():
    """Body: { name: str, description?: str }"""
    if not current_user.org_id:
        return jsonify({'success': False, 'error': 'Org required'}), 400
    data = get_request_json() or {}
    name = (data.get('name') or '').strip()[:60]
    if not name:
        return jsonify({'success': False, 'error': 'name required'}), 400
    tag = _find_or_create_tag(
        org_id=current_user.org_id, name=name, user_id=current_user.id,
    )
    desc = (data.get('description') or '').strip()[:280] or None
    if desc:
        tag.description = desc
    db.session.commit()
    return jsonify({'success': True, 'tag': tag.to_dict()})


@tags_bp.route('/by-target', methods=['GET'])
@login_required
def api_tags_by_target():
    kind = request.args.get('kind') or ''
    if kind not in ALLOWED_TARGET_KINDS:
        return jsonify({'success': False, 'error': 'bad kind'}), 400
    try:
        tid = int(request.args.get('id') or '0')
    except ValueError:
        return jsonify({'success': False, 'error': 'bad id'}), 400
    if not tid:
        return jsonify({'success': True, 'tags': []})

    # Org-scope: only return assignments whose Tag belongs to caller's org.
    org_id = current_user.org_id
    q = (
        db.session.query(Tag)
        .join(TagAssignment, TagAssignment.tag_id == Tag.id)
        .filter(TagAssignment.target_kind == kind)
        .filter(TagAssignment.target_id == tid)
    )
    if current_user.role != 'admin' and org_id:
        q = q.filter(Tag.org_id == org_id)
    tags = q.order_by(Tag.name_lower.asc()).all()
    return jsonify({'success': True, 'tags': [t.to_dict() for t in tags]})


@tags_bp.route('/assign', methods=['POST'])
@login_required
def api_tags_assign():
    """Body: { tag_id: int, target_kind: str, target_id: int }"""
    data = get_request_json() or {}
    try:
        tag_id = int(data.get('tag_id'))
        target_id = int(data.get('target_id'))
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': 'tag_id + target_id required'}), 400
    target_kind = data.get('target_kind')
    if target_kind not in ALLOWED_TARGET_KINDS:
        return jsonify({'success': False, 'error': 'bad target_kind'}), 400

    tag = db.session.get(Tag, tag_id)
    if not tag:
        return jsonify({'success': False, 'error': 'tag not found'}), 404
    if current_user.role != 'admin' and tag.org_id != current_user.org_id:
        return jsonify({'success': False, 'error': 'cross-org tag use not allowed'}), 403
    if not _can_assign(target_kind, target_id, current_user.org_id, current_user.role):
        return jsonify({'success': False, 'error': 'cannot tag this target'}), 403

    existing = TagAssignment.query.filter_by(
        tag_id=tag.id, target_kind=target_kind, target_id=target_id,
    ).first()
    if existing:
        return jsonify({'success': True, 'tag': tag.to_dict(), 'already_assigned': True})

    assign = TagAssignment(
        tag_id=tag.id, target_kind=target_kind, target_id=target_id,
        assigned_by_user_id=current_user.id,
    )
    db.session.add(assign)
    db.session.commit()
    return jsonify({'success': True, 'tag': tag.to_dict()})


@tags_bp.route('/apply-by-name', methods=['POST'])
@login_required
def api_tags_apply_by_name():
    """Find-or-create + assign in ONE round-trip (PMO pattern).

    Body: { name: str, target_kind: str, target_id: int }
    """
    if not current_user.org_id:
        return jsonify({'success': False, 'error': 'Org required'}), 400
    data = get_request_json() or {}
    name = (data.get('name') or '').strip()[:60]
    target_kind = data.get('target_kind')
    try:
        target_id = int(data.get('target_id'))
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': 'target_id required'}), 400
    if not name:
        return jsonify({'success': False, 'error': 'name required'}), 400
    if target_kind not in ALLOWED_TARGET_KINDS:
        return jsonify({'success': False, 'error': 'bad target_kind'}), 400
    if not _can_assign(target_kind, target_id, current_user.org_id, current_user.role):
        return jsonify({'success': False, 'error': 'cannot tag this target'}), 403

    tag = _find_or_create_tag(
        org_id=current_user.org_id, name=name, user_id=current_user.id,
    )
    if not tag:
        return jsonify({'success': False, 'error': 'name normalised to empty'}), 400

    existing = TagAssignment.query.filter_by(
        tag_id=tag.id, target_kind=target_kind, target_id=target_id,
    ).first()
    if not existing:
        db.session.add(TagAssignment(
            tag_id=tag.id, target_kind=target_kind, target_id=target_id,
            assigned_by_user_id=current_user.id,
        ))
    db.session.commit()
    return jsonify({
        'success': True,
        'tag': tag.to_dict(),
        'created': existing is None,
    })


@tags_bp.route('/assign', methods=['DELETE'])
@login_required
def api_tags_unassign():
    """Body: { tag_id: int, target_kind: str, target_id: int }"""
    data = get_request_json() or {}
    try:
        tag_id = int(data.get('tag_id'))
        target_id = int(data.get('target_id'))
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': 'tag_id + target_id required'}), 400
    target_kind = data.get('target_kind')
    if target_kind not in ALLOWED_TARGET_KINDS:
        return jsonify({'success': False, 'error': 'bad target_kind'}), 400

    tag = db.session.get(Tag, tag_id)
    if tag and current_user.role != 'admin' and tag.org_id != current_user.org_id:
        return jsonify({'success': False, 'error': 'cross-org tag delete not allowed'}), 403
    if not _can_assign(target_kind, target_id, current_user.org_id, current_user.role):
        return jsonify({'success': False, 'error': 'cannot untag this target'}), 403

    assign = TagAssignment.query.filter_by(
        tag_id=tag_id, target_kind=target_kind, target_id=target_id,
    ).first()
    if assign:
        db.session.delete(assign)
        db.session.commit()
    return jsonify({'success': True})
