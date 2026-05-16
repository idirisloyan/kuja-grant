"""
Watchlist routes — Phase 2 (May 2026).

Blueprint prefix: /api
Routes:
  GET    /api/watchlist                  - list all my starred items
  POST   /api/watchlist/toggle           - toggle (kind, target_id) for current user
  GET    /api/watchlist/check/<kind>/<id> - is this specific item starred?
"""

import logging
from flask import Blueprint, jsonify
from flask_login import login_required, current_user

from app.extensions import db
from app.models import WatchlistItem, Grant, Organization
from app.utils.helpers import get_request_json

logger = logging.getLogger('kuja')

watchlist_bp = Blueprint('watchlist', __name__, url_prefix='/api/watchlist')

VALID_KINDS = {'grant', 'organization'}


@watchlist_bp.route('', methods=['GET'])
@login_required
def api_list_watchlist():
    """Return all items the current user has starred, with enriched titles."""
    items = (
        WatchlistItem.query
        .filter_by(user_id=current_user.id)
        .order_by(WatchlistItem.created_at.desc())
        .all()
    )

    # Enrich with target metadata (title/name) so the UI doesn't need a second hop.
    grant_ids = [i.target_id for i in items if i.kind == 'grant']
    org_ids = [i.target_id for i in items if i.kind == 'organization']

    grant_map = {
        g.id: {'id': g.id, 'title': g.title, 'status': g.status, 'deadline': g.deadline.isoformat() if g.deadline else None}
        for g in (Grant.query.filter(Grant.id.in_(grant_ids)).all() if grant_ids else [])
    }
    org_map = {
        o.id: {'id': o.id, 'name': o.name, 'country': o.country, 'org_type': o.org_type}
        for o in (Organization.query.filter(Organization.id.in_(org_ids)).all() if org_ids else [])
    }

    out = []
    for item in items:
        meta = (grant_map if item.kind == 'grant' else org_map).get(item.target_id)
        if meta is None:
            continue  # target was deleted; orphaned star — skip silently
        out.append({
            'kind': item.kind,
            'target_id': item.target_id,
            'created_at': item.created_at.isoformat() if item.created_at else None,
            'target': meta,
        })

    return jsonify({'success': True, 'items': out})


@watchlist_bp.route('/toggle', methods=['POST'])
@login_required
def api_toggle_watchlist():
    """Star or unstar an entity for the current user. Idempotent on outcome.

    Body: {kind: 'grant'|'organization', target_id: int}
    Returns: {success, starred: bool}
    """
    data = get_request_json()
    kind = (data.get('kind') or '').strip()
    target_id = data.get('target_id')

    if kind not in VALID_KINDS:
        return jsonify({'success': False, 'error': f'kind must be one of {sorted(VALID_KINDS)}'}), 400
    if not isinstance(target_id, int):
        return jsonify({'success': False, 'error': 'target_id must be an int'}), 400

    # Validate target exists (defence in depth — keeps the table clean)
    if kind == 'grant' and not db.session.get(Grant, target_id):
        return jsonify({'success': False, 'error': 'Grant not found'}), 404
    if kind == 'organization' and not db.session.get(Organization, target_id):
        return jsonify({'success': False, 'error': 'Organization not found'}), 404

    existing = (
        WatchlistItem.query
        .filter_by(user_id=current_user.id, kind=kind, target_id=target_id)
        .first()
    )
    if existing:
        db.session.delete(existing)
        db.session.commit()
        return jsonify({'success': True, 'starred': False})

    db.session.add(WatchlistItem(user_id=current_user.id, kind=kind, target_id=target_id))
    db.session.commit()
    return jsonify({'success': True, 'starred': True})


@watchlist_bp.route('/check/<kind>/<int:target_id>', methods=['GET'])
@login_required
def api_check_watchlist(kind, target_id):
    """Quick check: is this single item starred? Used by individual cards."""
    if kind not in VALID_KINDS:
        return jsonify({'starred': False}), 200
    existing = (
        WatchlistItem.query
        .filter_by(user_id=current_user.id, kind=kind, target_id=target_id)
        .first()
    )
    return jsonify({'starred': existing is not None})
