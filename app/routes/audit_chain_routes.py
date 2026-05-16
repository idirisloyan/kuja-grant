"""
Audit chain visualisation routes — Phase 7.

Blueprint prefix: /api/audit-chain
Routes:
  GET /api/audit-chain/verify         - admin: integrity check (full chain or limit=N)
  GET /api/audit-chain/recent         - admin: paginated recent entries

The chain itself lives in app/models/audit_chain.py (AuditChainEntry).
This blueprint only exposes read views — the chain is append-only via
the model's `append()` classmethod.
"""

import logging

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from app.extensions import db
from app.models import AuditChainEntry
from app.utils.decorators import role_required

logger = logging.getLogger('kuja')

audit_chain_bp = Blueprint('audit_chain', __name__, url_prefix='/api/audit-chain')


@audit_chain_bp.route('/verify', methods=['GET'])
@login_required
@role_required('admin')
def api_verify_chain():
    """Walk the full chain (or the last N entries) and return the
    integrity result. Used by the admin observability page to surface
    "chain intact" / "N breaks found" badges + the break detail."""
    limit_raw = request.args.get('limit')
    limit = int(limit_raw) if (limit_raw and limit_raw.isdigit()) else None
    result = AuditChainEntry.verify(limit=limit)
    return jsonify({
        'success': True,
        'ok': result.get('ok', False),
        'total_checked': result.get('total', 0),
        'breaks': result.get('breaks', []),
        'limit': limit,
    })


@audit_chain_bp.route('/recent', methods=['GET'])
@login_required
@role_required('admin')
def api_recent_chain():
    """Paginated recent entries — newest first."""
    try:
        limit = max(1, min(200, int(request.args.get('limit', 50))))
    except ValueError:
        limit = 50
    try:
        offset = max(0, int(request.args.get('offset', 0)))
    except ValueError:
        offset = 0

    total = db.session.query(db.func.count(AuditChainEntry.id)).scalar() or 0

    rows = (
        AuditChainEntry.query
        .order_by(AuditChainEntry.seq.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    entries = []
    for r in rows:
        import json
        try:
            details = json.loads(r.details_json or '{}')
        except Exception:
            details = {}
        entries.append({
            'id': r.id,
            'seq': r.seq,
            'action': r.action,
            'actor_email': r.actor_email,
            'subject_kind': r.subject_kind,
            'subject_id': r.subject_id,
            'prev_hash': (r.prev_hash or '')[:16],   # truncate for display
            'payload_hash': (r.payload_hash or '')[:16],
            'created_at': r.created_at.isoformat() if r.created_at else None,
            'details': details,
        })

    return jsonify({
        'success': True,
        'total': total,
        'limit': limit,
        'offset': offset,
        'entries': entries,
    })
