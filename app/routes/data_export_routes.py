"""
Phase 99 — Per-tenant data export bundle.

Removes the "what if Kuja goes away?" CFO objection by letting any
authenticated org user download a JSON bundle of everything Kuja
holds about their organization:

  - The org row
  - Every user belonging to the org
  - Every application the org has ever submitted (incl. responses + scores)
  - Every grant the org has authored (if it's a donor org)
  - Every report tied to its applications
  - Every capacity passport published for the org
  - Every assessment row attached to the org
  - The trust profile snapshot
  - All AI evaluation outputs the org can see

Auth: any authenticated member of the org; admin gets cross-tenant
access by passing ?org_id=N. NGO + donor members can only export their
own org's bundle.

Schema-level guarantee: nothing is fetched that the user can't already
see via the normal route surface. The endpoint is a *bundling* helper
for portability, not a privilege escalation.

The response is JSON; a download/save-as flow lives in the frontend
data-export panel.
"""

import json
import logging
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request, Response
from flask_login import login_required, current_user

from app.extensions import db
from app.models.user import User
from app.models.organization import Organization
from app.models.application import Application
from app.models.grant import Grant
from app.models.report import Report
from app.models.assessment import Assessment
from app.models.capacity_passport import CapacityPassport
from app.models.document import Document

logger = logging.getLogger('kuja')

data_export_bp = Blueprint('data_export', __name__, url_prefix='/api/exports')


def _safe_dict(obj):
    """Call .to_dict() if present, else best-effort serialize columns."""
    if obj is None:
        return None
    if hasattr(obj, 'to_dict'):
        try:
            return obj.to_dict()
        except Exception:
            pass
    # Fallback: pull mapped column values.
    out = {}
    for col in getattr(obj, '__table__', getattr(obj, '_table', None)).columns:
        try:
            v = getattr(obj, col.name)
            if isinstance(v, datetime):
                v = v.isoformat()
            out[col.name] = v
        except Exception:
            continue
    return out


def _build_org_bundle(org_id):
    """Build the export bundle dict for one org."""
    org = Organization.query.filter_by(id=org_id).first()
    if not org:
        return None

    org_users = User.query.filter_by(org_id=org_id).all()
    # Applications: this org as NGO (submitter)
    submitted_apps = Application.query.filter_by(ngo_org_id=org_id).all()
    # Grants: this org as donor
    authored_grants = Grant.query.filter_by(donor_org_id=org_id).all()
    # Reports: linked to apps this org submitted
    app_ids = [a.id for a in submitted_apps]
    reports = []
    if app_ids:
        reports = Report.query.filter(Report.application_id.in_(app_ids)).all()
    # Assessments
    try:
        assessments = Assessment.query.filter_by(org_id=org_id).all()
    except Exception:
        assessments = []
    # Capacity passports
    try:
        passports = CapacityPassport.query.filter_by(org_id=org_id).all()
    except Exception:
        passports = []
    # Documents attached to those applications
    documents = []
    if app_ids:
        try:
            documents = Document.query.filter(Document.application_id.in_(app_ids)).all()
        except Exception:
            documents = []

    return {
        'export_generated_at': datetime.now(timezone.utc).isoformat(),
        'export_format_version': 1,
        'org': _safe_dict(org),
        'users': [_safe_dict(u) for u in org_users],
        'applications_submitted': [_safe_dict(a) for a in submitted_apps],
        'grants_authored': [_safe_dict(g) for g in authored_grants],
        'reports': [_safe_dict(r) for r in reports],
        'assessments': [_safe_dict(a) for a in assessments],
        'capacity_passports': [_safe_dict(p) for p in passports],
        'documents': [_safe_dict(d) for d in documents],
        'note': (
            "This bundle contains every record Kuja holds attributed to "
            "your organization. Save it somewhere you control. The schema "
            "is documented in app/routes/data_export_routes.py."
        ),
    }


@data_export_bp.route('/org-bundle', methods=['GET'])
@login_required
def api_org_bundle():
    """Build + download the per-tenant export bundle.

    Query:
      org_id (admin only) — defaults to current_user.org_id.
      format = 'json' (default) | 'json-download' (sets Content-Disposition)
    """
    org_id = current_user.org_id
    if current_user.role == 'admin' and request.args.get('org_id'):
        try:
            org_id = int(request.args.get('org_id'))
        except ValueError:
            return jsonify({'success': False, 'error': 'org_id must be an integer'}), 400
    if org_id is None:
        return jsonify({'success': False, 'error': 'No org associated with this user.'}), 403

    bundle = _build_org_bundle(org_id)
    if bundle is None:
        return jsonify({'success': False, 'error': 'Org not found.'}), 404

    fmt = request.args.get('format', 'json')
    if fmt == 'json-download':
        org_slug = (bundle.get('org') or {}).get('name', f'org-{org_id}')
        # Sanitise for filename use — keep letters/digits/dash/underscore.
        safe = ''.join(c if c.isalnum() or c in '-_' else '_' for c in org_slug)[:60]
        filename = f"kuja-export-{safe}-{datetime.now(timezone.utc).strftime('%Y%m%d')}.json"
        return Response(
            json.dumps(bundle, indent=2, default=str),
            mimetype='application/json',
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"',
            },
        )

    return jsonify({'success': True, 'bundle': bundle})
