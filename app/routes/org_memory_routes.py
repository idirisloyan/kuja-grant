"""
Org Memory routes — Phase 10.5.

CRUD for the reusable organizational memory layer. NGO users manage
their org's memory items; the AI co-author reads them transparently
on draft generation.
"""

from flask import Blueprint, jsonify
from flask_login import login_required, current_user

from app.services import org_memory_service as oms
from app.utils.helpers import get_request_json
from app.utils.decorators import role_required
from app.utils.api_errors import error_response

org_memory_bp = Blueprint('org_memory', __name__, url_prefix='/api/org-memory')


@org_memory_bp.route('/', methods=['GET'])
@login_required
@role_required('ngo')
def list_items():
    """List memory items for the current user's org.

    Query params:
        kind: optional filter by kind
        archived: 'true' to include archived items
    """
    from flask import request
    kind = request.args.get('kind')
    archived = request.args.get('archived') == 'true'
    items = oms.list_for_org(
        current_user.org_id,
        kind=kind,
        archived=archived,
    )
    return jsonify({
        'success': True,
        'items': [i.to_dict() for i in items],
        'total': len(items),
    })


@org_memory_bp.route('/', methods=['POST'])
@login_required
@role_required('ngo')
def create_item():
    """Create a new memory item.

    Body: { kind, content, label?, metadata?, tags?, confidence? }
    """
    data = get_request_json() or {}
    kind = (data.get('kind') or '').strip()
    content = (data.get('content') or '').strip()
    if not kind or not content:
        return error_response('validation.missing_field', 400, field='kind_or_content')
    if kind not in ('fact', 'narrative', 'evidence', 'document', 'metric', 'partner'):
        return error_response('validation.invalid_value', 400, field='kind')

    item = oms.add_item(
        current_user.org_id,
        kind=kind,
        content=content,
        label=(data.get('label') or '').strip()[:160] or None,
        metadata=data.get('metadata'),
        tags=data.get('tags'),
        confidence=data.get('confidence') or 'high',
    )
    if not item:
        return error_response('server.error', 500)
    return jsonify({'success': True, 'item': item.to_dict()})


@org_memory_bp.route('/<int:item_id>', methods=['PATCH'])
@login_required
@role_required('ngo')
def patch_item(item_id):
    """Update a memory item the current org owns.

    Body: any subset of { label, content, metadata, tags, kind, confidence, archived }
    """
    data = get_request_json() or {}
    allowed = {'label', 'content', 'metadata', 'tags', 'kind', 'confidence', 'archived'}
    fields = {k: v for k, v in data.items() if k in allowed}
    if not fields:
        return error_response('validation.missing_field', 400, field='update_fields')
    item = oms.update_item(item_id, org_id=current_user.org_id, **fields)
    if not item:
        return error_response('not_found', 404)
    return jsonify({'success': True, 'item': item.to_dict()})


@org_memory_bp.route('/<int:item_id>', methods=['DELETE'])
@login_required
@role_required('ngo')
def delete_item(item_id):
    """Hard delete a memory item the current org owns."""
    ok = oms.delete_item(item_id, org_id=current_user.org_id)
    if not ok:
        return error_response('not_found', 404)
    return jsonify({'success': True})
