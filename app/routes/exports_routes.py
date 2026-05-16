"""
Generic CSV export routes — Phase 21C.

Single endpoint family:
  GET /api/exports/<kind>.csv
where kind ∈ {grants, applications, reviews}.

Permissions:
  - grants:       donor + admin
  - applications: all logged-in (server scopes by role inside the service)
  - reviews:      donor + reviewer + admin
"""

import io
import logging

from flask import Blueprint, jsonify, send_file
from flask_login import login_required, current_user

logger = logging.getLogger('kuja')

exports_bp = Blueprint('exports', __name__, url_prefix='/api/exports')


@exports_bp.route('/<kind>.csv', methods=['GET'])
@login_required
def api_csv_export(kind: str):
    from app.services.csv_export_service import CsvExportService, ALLOWED_KINDS

    if kind not in ALLOWED_KINDS:
        return jsonify({'success': False, 'error': 'bad kind'}), 404

    # Per-kind role gate
    role = current_user.role
    if kind == 'grants' and role not in ('donor', 'admin'):
        return jsonify({'success': False, 'error': 'auth.access_denied'}), 403
    if kind == 'reviews' and role not in ('donor', 'reviewer', 'admin'):
        return jsonify({'success': False, 'error': 'auth.access_denied'}), 403
    # applications: any logged-in role; service scopes by role

    out = CsvExportService.export(kind=kind, user=current_user)
    if not out:
        return jsonify({'success': False, 'error': 'export failed'}), 500
    csv_bytes, filename = out

    # Audit-chain receipt — admin can later see who exported what
    try:
        from app.models import AuditChainEntry
        AuditChainEntry.append(
            action='csv_export.run',
            actor_email=getattr(current_user, 'email', None),
            subject_kind='org', subject_id=getattr(current_user, 'org_id', None),
            details={
                'kind': kind,
                'role': role,
                'filename': filename,
                'bytes': len(csv_bytes),
            },
        )
    except Exception as e:
        logger.warning(f'csv export audit anchor failed: {e}')

    return send_file(
        io.BytesIO(csv_bytes),
        mimetype='text/csv; charset=utf-8',
        as_attachment=True,
        download_name=filename,
    )
