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

    # Phase 64 — optional per-subject filter so per-entity drill-ins
    # (e.g. the membership review page) can show ONLY the chain entries
    # that touch a specific subject. Backward-compatible: omit the
    # query params for the full-chain view.
    subject_kind = request.args.get('subject_kind') or None
    subject_id_param = request.args.get('subject_id')
    subject_id = None
    if subject_id_param:
        try:
            subject_id = int(subject_id_param)
        except ValueError:
            subject_id = None

    q = AuditChainEntry.query
    if subject_kind:
        q = q.filter(AuditChainEntry.subject_kind == subject_kind)
    if subject_id is not None:
        q = q.filter(AuditChainEntry.subject_id == subject_id)

    total = q.with_entities(db.func.count(AuditChainEntry.id)).scalar() or 0

    rows = (
        q
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


@audit_chain_bp.route('/export.jsonl', methods=['GET'])
@login_required
@role_required('admin')
def api_export_chain():
    """Phase 131 — full hash-chained audit log as newline-delimited JSON.

    Each line is one entry preserving prev_hash + payload_hash so a
    third-party verifier can re-walk the chain offline without server
    cooperation. NDJSON keeps line-by-line streaming reasonable for
    chains with millions of entries.

    Query: ?subject_kind=&subject_id= to scope (optional).
    """
    import json
    from flask import Response

    subject_kind = request.args.get('subject_kind') or None
    subject_id_param = request.args.get('subject_id')
    subject_id = None
    if subject_id_param:
        try:
            subject_id = int(subject_id_param)
        except ValueError:
            subject_id = None

    q = AuditChainEntry.query
    if subject_kind:
        q = q.filter(AuditChainEntry.subject_kind == subject_kind)
    if subject_id is not None:
        q = q.filter(AuditChainEntry.subject_id == subject_id)
    q = q.order_by(AuditChainEntry.seq.asc())

    def stream():
        for r in q.yield_per(500):
            try:
                details = json.loads(r.details_json or '{}')
            except Exception:
                details = {}
            row = {
                'id': r.id,
                'seq': r.seq,
                'action': r.action,
                'actor_email': r.actor_email,
                'subject_kind': r.subject_kind,
                'subject_id': r.subject_id,
                'prev_hash': r.prev_hash,
                'payload_hash': r.payload_hash,
                'created_at': r.created_at.isoformat() if r.created_at else None,
                'details': details,
            }
            yield json.dumps(row, separators=(',', ':')) + '\n'

    headers = {
        'Content-Disposition': 'attachment; filename="kuja-audit-chain.jsonl"',
        'Cache-Control': 'no-store',
    }
    return Response(stream(), mimetype='application/x-ndjson', headers=headers)
