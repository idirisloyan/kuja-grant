"""
Risk register routes — Phase 13.7.

CRUD + lifecycle transitions for risks attached to orgs / applications /
grants. Validates with the Phase 13.3 primitive layer; logs every status
transition into the audit trail.
"""

from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from app.extensions import db
from app.models import Risk, Application, Grant, Organization
from app.utils.helpers import get_request_json
from app.utils.decorators import role_required
from app.utils.api_errors import error_response
from app.utils.validation import (
    require_string, optional_string, require_enum, optional_enum,
    require_int, optional_int, optional_date, ValidationError,
    to_error_response,
)
from app.services.audit import log_action

risks_bp = Blueprint('risks', __name__, url_prefix='/api/risks')


VALID_KINDS = ('compliance', 'eligibility', 'documents', 'finance',
               'narrative', 'data', 'governance')
VALID_SEVERITIES = ('critical', 'high', 'medium', 'low')
VALID_STATUSES = ('open', 'mitigating', 'mitigated', 'accepted', 'dismissed')
VALID_SUBJECT_KINDS = ('org', 'application', 'grant')


def _can_view_subject(subject_kind: str, subject_id: int) -> bool:
    """Access-control helper: can current_user see this subject's risks?"""
    role = current_user.role
    org_id = getattr(current_user, 'org_id', None)
    if role == 'admin':
        return True
    if subject_kind == 'org':
        if role == 'ngo':
            return subject_id == org_id
        # Donors can see risks on any org (they need the visibility for due diligence)
        return role == 'donor'
    if subject_kind == 'application':
        a = db.session.get(Application, subject_id)
        if not a:
            return False
        if role == 'ngo':
            return a.ngo_org_id == org_id
        if role == 'donor':
            g = db.session.get(Grant, a.grant_id) if a.grant_id else None
            return g is not None and getattr(g, 'donor_org_id', None) == org_id
        if role == 'reviewer':
            return True  # reviewer access is gated upstream
        return False
    if subject_kind == 'grant':
        g = db.session.get(Grant, subject_id)
        if not g:
            return False
        if role == 'donor':
            return getattr(g, 'donor_org_id', None) == org_id
        return False  # NGOs see grants but not their internal risk register
    return False


@risks_bp.route('/', methods=['GET'])
@login_required
def list_risks():
    """List risks for a subject. Required: subject_kind + subject_id.

    Optional filters: status, severity, kind, owner_user_id, exclude_terminal.
    """
    subject_kind = request.args.get('subject_kind')
    subject_id = request.args.get('subject_id', type=int)
    if not subject_kind or not subject_id:
        return error_response('validation.missing_field', 400, field='subject_kind/subject_id')
    if subject_kind not in VALID_SUBJECT_KINDS:
        return error_response('validation.invalid_value', 400, field='subject_kind')

    if not _can_view_subject(subject_kind, subject_id):
        return error_response('auth.access_denied', 403)

    q = Risk.query.filter_by(subject_kind=subject_kind, subject_id=subject_id)
    status = request.args.get('status')
    if status:
        q = q.filter_by(status=status)
    severity = request.args.get('severity')
    if severity:
        q = q.filter_by(severity=severity)
    kind = request.args.get('kind')
    if kind:
        q = q.filter_by(kind=kind)
    owner_user_id = request.args.get('owner_user_id', type=int)
    if owner_user_id:
        q = q.filter_by(owner_user_id=owner_user_id)
    if request.args.get('exclude_terminal') == 'true':
        q = q.filter(~Risk.status.in_(Risk.TERMINAL_STATUSES))

    rows = q.order_by(Risk.detected_at.desc()).limit(200).all()

    # Counts by status for the dashboard badge.
    counts = {s: 0 for s in VALID_STATUSES}
    all_for_subject = Risk.query.filter_by(
        subject_kind=subject_kind, subject_id=subject_id
    ).all()
    for r in all_for_subject:
        counts[r.status] = counts.get(r.status, 0) + 1
    counts['awaiting_response'] = counts.get('open', 0) + counts.get('mitigating', 0)

    return jsonify({
        'success': True,
        'risks': [r.to_dict() for r in rows],
        'counts': counts,
    })


@risks_bp.route('/', methods=['POST'])
@login_required
def create_risk():
    """Create a risk manually (donor/admin) or programmatically.

    Body: { subject_kind, subject_id, kind, severity, title, description?,
            owner_user_id?, due_date?, source? }
    """
    if current_user.role not in ('donor', 'admin', 'reviewer'):
        return error_response('auth.access_denied', 403)
    data = get_request_json() or {}
    try:
        subject_kind = require_enum(data, 'subject_kind', VALID_SUBJECT_KINDS)
        subject_id = require_int(data, 'subject_id', minimum=1)
        kind = require_enum(data, 'kind', VALID_KINDS)
        severity = require_enum(data, 'severity', VALID_SEVERITIES)
        title = require_string(data, 'title', max_len=280)
        description = optional_string(data, 'description', max_len=4000)
        owner_user_id = optional_int(data, 'owner_user_id', minimum=1)
        due_date = optional_date(data, 'due_date')
        source = optional_string(data, 'source', max_len=60, default='manual')
    except ValidationError as e:
        return to_error_response(e)

    if not _can_view_subject(subject_kind, subject_id):
        return error_response('auth.access_denied', 403)

    r = Risk(
        subject_kind=subject_kind,
        subject_id=subject_id,
        kind=kind,
        severity=severity,
        title=title,
        description=description or None,
        owner_user_id=owner_user_id,
        due_date=due_date,
        source=source or 'manual',
    )
    db.session.add(r)
    db.session.commit()

    log_action('risk.created', current_user.email, 'risk', r.id, {
        'subject_kind': subject_kind, 'subject_id': subject_id,
        'kind': kind, 'severity': severity, 'source': source,
    })
    return jsonify({'success': True, 'risk': r.to_dict()})


@risks_bp.route('/<int:risk_id>', methods=['PATCH'])
@login_required
def patch_risk(risk_id):
    """Transition risk lifecycle, attach response, assign owner, set due date.

    Body: any subset of { status, response_md, owner_user_id, due_date,
                          severity, title, description }

    Status transitions to mitigated / accepted / dismissed auto-stamp
    resolved_at and clear it on transition back to open / mitigating.
    """
    r = db.session.get(Risk, risk_id)
    if not r:
        return error_response('not_found', 404)
    if not _can_view_subject(r.subject_kind, r.subject_id):
        return error_response('auth.access_denied', 403)

    data = get_request_json() or {}
    changes = {}
    try:
        if 'status' in data:
            new_status = require_enum(data, 'status', VALID_STATUSES)
            if new_status != r.status:
                changes['status'] = (r.status, new_status)
                r.status = new_status
                if new_status in Risk.TERMINAL_STATUSES:
                    r.resolved_at = datetime.now(timezone.utc)
                else:
                    r.resolved_at = None
        if 'response_md' in data:
            r.response_md = optional_string(data, 'response_md', max_len=8000) or None
        if 'owner_user_id' in data:
            r.owner_user_id = optional_int(data, 'owner_user_id', minimum=1)
        if 'due_date' in data:
            r.due_date = optional_date(data, 'due_date')
        if 'severity' in data:
            r.severity = require_enum(data, 'severity', VALID_SEVERITIES)
        if 'title' in data:
            r.title = require_string(data, 'title', max_len=280)
        if 'description' in data:
            r.description = optional_string(data, 'description', max_len=4000) or None
    except ValidationError as e:
        return to_error_response(e)

    db.session.commit()

    if changes.get('status'):
        old, new = changes['status']
        log_action(f'risk.status.{new}', current_user.email, 'risk', r.id, {
            'from': old, 'to': new,
        })
    return jsonify({'success': True, 'risk': r.to_dict()})


@risks_bp.route('/<int:risk_id>', methods=['DELETE'])
@login_required
@role_required('admin')
def delete_risk(risk_id):
    """Hard delete (admin only). Most workflows should use status='dismissed'."""
    r = db.session.get(Risk, risk_id)
    if not r:
        return error_response('not_found', 404)
    db.session.delete(r)
    db.session.commit()
    log_action('risk.deleted', current_user.email, 'risk', risk_id, {})
    return jsonify({'success': True})


@risks_bp.route('/awaiting-response', methods=['GET'])
@login_required
def my_awaiting_response():
    """Risks the current user owns that are still open/mitigating.

    Used by the donor + admin "what needs you" panel.
    """
    rows = (Risk.query
            .filter_by(owner_user_id=current_user.id)
            .filter(Risk.status.in_(('open', 'mitigating')))
            .order_by(
                # critical first, then by due_date asc, then detected_at desc.
                db.case(
                    (Risk.severity == 'critical', 0),
                    (Risk.severity == 'high', 1),
                    (Risk.severity == 'medium', 2),
                    (Risk.severity == 'low', 3),
                    else_=4,
                ),
                Risk.due_date.asc().nullslast(),
                Risk.detected_at.desc(),
            )
            .limit(50).all())
    return jsonify({
        'success': True,
        'risks': [r.to_dict() for r in rows],
        'count': len(rows),
    })
