"""
Phase 102 — Audit chain replay endpoints (admin).

  GET /api/admin/audit-chain/<seq>/replay
      Returns the audit chain entry at sequence `seq`, the linked AI
      call (if any), and the full input/output texts. Used when a
      donor/regulator asks "what exactly produced this decision."

  GET /api/admin/ai-calls/<id>/replay
      Direct lookup by AICallLog.id. Used by the audit chain UI when
      the chain entry's details_json carries an `ai_call_id`.
"""

import json
import logging

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from app.extensions import db
from app.models.ai_thread import AICallLog
from app.models.audit_chain import AuditChainEntry
from app.services.replay_service import lookup_ai_call_by_subject

logger = logging.getLogger('kuja')

replay_bp = Blueprint('replay', __name__, url_prefix='/api/admin')


def _is_admin() -> bool:
    return getattr(current_user, 'role', None) == 'admin'


@replay_bp.route('/audit-chain/<int:seq>/replay', methods=['GET'])
@login_required
def audit_entry_replay(seq):
    if not _is_admin():
        return jsonify({'success': False, 'error': 'Admin only.'}), 403

    entry = AuditChainEntry.query.filter_by(seq=seq).first()
    if entry is None:
        return jsonify({'success': False, 'error': 'audit_chain.not_found'}), 404

    try:
        details = json.loads(entry.details_json or '{}')
    except Exception:
        details = {}

    # Reconstruct linked AI call(s). Two paths:
    #   1. The audit entry's details_json carries an `ai_call_id`.
    #   2. Fall back to a (subject_kind, subject_id) lookup against
    #      ai_call_logs.replay_subject_*.
    ai_calls: list[AICallLog] = []
    call_id = details.get('ai_call_id') if isinstance(details, dict) else None
    if isinstance(call_id, int):
        c = AICallLog.query.filter_by(id=call_id).first()
        if c is not None:
            ai_calls = [c]
    if not ai_calls and entry.subject_kind and entry.subject_id is not None:
        ai_calls = lookup_ai_call_by_subject(
            entry.subject_kind, int(entry.subject_id),
        )

    return jsonify({
        'success': True,
        'entry': {
            'seq': entry.seq,
            'action': entry.action,
            'actor_email': entry.actor_email,
            'subject_kind': entry.subject_kind,
            'subject_id': entry.subject_id,
            'details': details,
            'created_at': entry.created_at.isoformat() if entry.created_at else None,
            'prev_hash': entry.prev_hash,
            'payload_hash': entry.payload_hash,
        },
        'ai_calls': [c.to_dict(include_replay=True) for c in ai_calls],
    })


@replay_bp.route('/ai-calls/<int:call_id>/replay', methods=['GET'])
@login_required
def ai_call_replay(call_id):
    if not _is_admin():
        return jsonify({'success': False, 'error': 'Admin only.'}), 403
    c = AICallLog.query.filter_by(id=call_id).first()
    if c is None:
        return jsonify({'success': False, 'error': 'ai_call.not_found'}), 404
    return jsonify({'success': True, 'ai_call': c.to_dict(include_replay=True)})
