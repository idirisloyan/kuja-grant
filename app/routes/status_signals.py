"""
Status signal routes (ASK / RISK / DECISION rails) — Phase 2.

Blueprint prefix: /api
Routes:
  GET    /api/signals/<entity_kind>/<entity_id>   - list signals on an entity
  POST   /api/signals                              - create a signal
  POST   /api/signals/<id>/resolve                 - mark resolved (with optional note)
  DELETE /api/signals/<id>                         - hard delete (creator or admin)
"""

import logging
from datetime import datetime, timezone

from flask import Blueprint, jsonify
from flask_login import login_required, current_user

from app.extensions import db
from app.models import StatusSignal, Application, Report, Grant
from app.utils.helpers import get_request_json

logger = logging.getLogger('kuja')

signals_bp = Blueprint('signals', __name__, url_prefix='/api/signals')

VALID_KINDS = {'ask', 'risk', 'decision'}
VALID_ENTITY_KINDS = {'application', 'report', 'grant'}


def _entity_visible_to_user(entity_kind: str, entity_id: int) -> bool:
    """Lightweight visibility check — admin sees all; others see entities
    in their org's scope."""
    if current_user.role == 'admin':
        return True
    if entity_kind == 'application':
        app = db.session.get(Application, entity_id)
        if not app:
            return False
        if current_user.role == 'ngo':
            return app.ngo_org_id == current_user.org_id
        if current_user.role == 'donor':
            return bool(app.grant and app.grant.donor_org_id == current_user.org_id)
        if current_user.role == 'reviewer':
            return True   # reviewers see assigned applications; deeper check would join reviews
    if entity_kind == 'report':
        rpt = db.session.get(Report, entity_id)
        if not rpt:
            return False
        if current_user.role == 'ngo':
            return rpt.submitted_by_org_id == current_user.org_id
        if current_user.role == 'donor':
            return bool(rpt.grant and rpt.grant.donor_org_id == current_user.org_id)
        if current_user.role == 'reviewer':
            return True
    if entity_kind == 'grant':
        g = db.session.get(Grant, entity_id)
        if not g:
            return False
        if current_user.role == 'donor':
            return g.donor_org_id == current_user.org_id
        return True   # NGOs can see any open grant's signals (e.g. donor risks)
    return False


@signals_bp.route('/<entity_kind>/<int:entity_id>', methods=['GET'])
@login_required
def api_list_signals(entity_kind, entity_id):
    """List signals attached to an entity (newest first)."""
    if entity_kind not in VALID_ENTITY_KINDS:
        return jsonify({'success': False, 'error': 'invalid entity_kind'}), 400
    if not _entity_visible_to_user(entity_kind, entity_id):
        return jsonify({'success': False, 'error': 'not visible'}), 403

    signals = (
        StatusSignal.query
        .filter_by(entity_kind=entity_kind, entity_id=entity_id)
        .order_by(StatusSignal.created_at.desc())
        .all()
    )
    return jsonify({
        'success': True,
        'entity_kind': entity_kind,
        'entity_id': entity_id,
        'signals': [s.to_dict() for s in signals],
    })


@signals_bp.route('', methods=['POST'])
@login_required
def api_create_signal():
    """Create a new ask/risk/decision signal.

    Body: { entity_kind, entity_id, kind, body }
    """
    data = get_request_json()
    entity_kind = (data.get('entity_kind') or '').strip()
    entity_id = data.get('entity_id')
    kind = (data.get('kind') or '').strip()
    body = (data.get('body') or '').strip()

    if entity_kind not in VALID_ENTITY_KINDS:
        return jsonify({'success': False, 'error': 'entity_kind must be application|report|grant'}), 400
    if not isinstance(entity_id, int):
        return jsonify({'success': False, 'error': 'entity_id must be an int'}), 400
    if kind not in VALID_KINDS:
        return jsonify({'success': False, 'error': 'kind must be ask|risk|decision'}), 400
    if not body or len(body) > 500:
        return jsonify({'success': False, 'error': 'body required, max 500 chars'}), 400
    if not _entity_visible_to_user(entity_kind, entity_id):
        return jsonify({'success': False, 'error': 'not visible'}), 403

    signal = StatusSignal(
        entity_kind=entity_kind,
        entity_id=entity_id,
        kind=kind,
        body=body,
        created_by_user_id=current_user.id,
    )
    db.session.add(signal)
    db.session.commit()

    return jsonify({'success': True, 'signal': signal.to_dict()})


@signals_bp.route('/<int:signal_id>/resolve', methods=['POST'])
@login_required
def api_resolve_signal(signal_id):
    """Mark a signal as resolved with an optional note."""
    signal = db.session.get(StatusSignal, signal_id)
    if not signal:
        return jsonify({'success': False, 'error': 'not found'}), 404
    if not _entity_visible_to_user(signal.entity_kind, signal.entity_id):
        return jsonify({'success': False, 'error': 'not visible'}), 403

    data = get_request_json() or {}
    note = (data.get('note') or '').strip() or None

    signal.status = 'resolved'
    signal.resolution_note = note
    signal.resolved_at = datetime.now(timezone.utc)
    signal.resolved_by_user_id = current_user.id
    db.session.commit()

    return jsonify({'success': True, 'signal': signal.to_dict()})


@signals_bp.route('/<int:signal_id>', methods=['DELETE'])
@login_required
def api_delete_signal(signal_id):
    """Delete a signal. Creator or admin only."""
    signal = db.session.get(StatusSignal, signal_id)
    if not signal:
        return jsonify({'success': False, 'error': 'not found'}), 404
    if current_user.role != 'admin' and signal.created_by_user_id != current_user.id:
        return jsonify({'success': False, 'error': 'only creator or admin can delete'}), 403

    db.session.delete(signal)
    db.session.commit()
    return jsonify({'success': True})
