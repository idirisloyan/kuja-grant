"""
Saved searches routes — Phase 13.33.
"""

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from app.extensions import db
from app.models import SavedSearch
from app.utils.helpers import get_request_json
from app.utils.api_errors import error_response
from app.utils.validation import (
    require_string, require_enum, optional_string,
    bound_array, ValidationError, to_error_response,
)

saved_searches_bp = Blueprint('saved_searches', __name__, url_prefix='/api/saved-searches')

VALID_SCOPES = ('grants', 'applications', 'reports', 'organizations', 'reviews', 'risks')


@saved_searches_bp.route('/', methods=['GET'])
@login_required
def list_saved():
    scope = request.args.get('scope')
    q = SavedSearch.query.filter_by(user_id=current_user.id)
    if scope:
        if scope not in VALID_SCOPES:
            return error_response('validation.invalid_value', 400, field='scope')
        q = q.filter_by(scope=scope)
    rows = q.order_by(SavedSearch.sort_order.asc(), SavedSearch.created_at.asc()).all()
    return jsonify({'success': True, 'searches': [r.to_dict() for r in rows]})


@saved_searches_bp.route('/', methods=['POST'])
@login_required
def create_saved():
    data = get_request_json() or {}
    try:
        scope = require_enum(data, 'scope', VALID_SCOPES)
        name = require_string(data, 'name', max_len=120)
    except ValidationError as e:
        return to_error_response(e)
    filter_obj = data.get('filter') or {}
    if not isinstance(filter_obj, dict):
        return error_response('validation.invalid_value', 400, field='filter')

    # Append at the end of the existing order.
    last = (SavedSearch.query
            .filter_by(user_id=current_user.id, scope=scope)
            .order_by(SavedSearch.sort_order.desc())
            .first())
    next_order = (last.sort_order + 1) if last else 0

    s = SavedSearch(
        user_id=current_user.id, scope=scope, name=name, sort_order=next_order,
    )
    s.set_filter(filter_obj)
    db.session.add(s)
    db.session.commit()
    return jsonify({'success': True, 'search': s.to_dict()})


@saved_searches_bp.route('/<int:search_id>', methods=['PATCH'])
@login_required
def patch_saved(search_id):
    s = db.session.get(SavedSearch, search_id)
    if not s or s.user_id != current_user.id:
        return error_response('not_found', 404)
    data = get_request_json() or {}
    try:
        if 'name' in data:
            s.name = require_string(data, 'name', max_len=120)
        if 'filter' in data:
            f = data['filter']
            if not isinstance(f, dict):
                return error_response('validation.invalid_value', 400, field='filter')
            s.set_filter(f)
    except ValidationError as e:
        return to_error_response(e)
    db.session.commit()
    return jsonify({'success': True, 'search': s.to_dict()})


@saved_searches_bp.route('/<int:search_id>', methods=['DELETE'])
@login_required
def delete_saved(search_id):
    s = db.session.get(SavedSearch, search_id)
    if not s or s.user_id != current_user.id:
        return error_response('not_found', 404)
    db.session.delete(s)
    db.session.commit()
    return jsonify({'success': True})


@saved_searches_bp.route('/reorder', methods=['POST'])
@login_required
def reorder():
    """Body: { scope: str, ids: [int, ...] } — applies sort_order in array order."""
    data = get_request_json() or {}
    try:
        scope = require_enum(data, 'scope', VALID_SCOPES)
    except ValidationError as e:
        return to_error_response(e)
    ids = data.get('ids')
    if not isinstance(ids, list) or not all(isinstance(i, int) for i in ids):
        return error_response('validation.invalid_value', 400, field='ids')

    rows = (SavedSearch.query
            .filter(SavedSearch.user_id == current_user.id,
                    SavedSearch.scope == scope,
                    SavedSearch.id.in_(ids))
            .all())
    by_id = {r.id: r for r in rows}
    for i, sid in enumerate(ids):
        if sid in by_id:
            by_id[sid].sort_order = i
    db.session.commit()
    return jsonify({'success': True, 'count': len(rows)})
