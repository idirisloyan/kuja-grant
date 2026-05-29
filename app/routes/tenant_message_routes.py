"""Tenant message routes — Phase 43A.

In-app messaging for the closed-network model. The secretariat
(admin role today, OB role in Phase 44) sends to members; members
read in their inbox. Scopes drive who can read:

  network     — every member NGO in the network
  country     — every member NGO with org.country == scope_value
  org         — single org by id
  declaration — every shortlisted org under the declaration

Audit-anchored at send time so every secretariat communication
appears in the same tamper-evident chain as declarations and grants.
"""

import logging
from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from app.extensions import db
from app.models import (
    TenantMessage, TenantMessageRead, AuditChainEntry,
    Network, NetworkMembership, Organization, EmergencyDeclaration,
)
from app.utils.helpers import get_request_json
from app.utils.network import get_current_network_id
from app.utils.decorators import role_required

logger = logging.getLogger('kuja')

tenant_message_bp = Blueprint('tenant_message', __name__, url_prefix='/api/messages')


VALID_SCOPES = ('network', 'country', 'org', 'declaration')


@tenant_message_bp.route('/', methods=['POST'])
@login_required
@role_required('admin')
def api_send_message():
    """Admin / secretariat sends a tenant message.

    Body: { scope, scope_value, subject, body_md, related_kind?, related_id? }
    """
    network_id = get_current_network_id()
    if not network_id:
        return jsonify({'success': False, 'error': 'No network in scope'}), 400

    data = get_request_json() or {}
    scope = (data.get('scope') or '').strip().lower()
    if scope not in VALID_SCOPES:
        return jsonify({
            'success': False,
            'error': f"scope must be one of {VALID_SCOPES}",
        }), 400
    subject = (data.get('subject') or '').strip()
    body_md = (data.get('body_md') or '').strip()
    if not subject or not body_md:
        return jsonify({'success': False, 'error': 'subject and body_md required'}), 400
    if len(subject) > 200:
        return jsonify({'success': False, 'error': 'subject too long (max 200)'}), 400
    if len(body_md) > 8000:
        return jsonify({'success': False, 'error': 'body_md too long (max 8000)'}), 400

    scope_value = data.get('scope_value')
    if scope == 'country' and not scope_value:
        return jsonify({'success': False, 'error': 'scope=country requires scope_value (ISO code)'}), 400
    if scope == 'org' and not scope_value:
        return jsonify({'success': False, 'error': 'scope=org requires scope_value (org id)'}), 400
    if scope == 'declaration' and not scope_value:
        return jsonify({'success': False, 'error': 'scope=declaration requires scope_value (declaration id)'}), 400

    msg = TenantMessage(
        network_id=network_id,
        sender_user_id=current_user.id,
        scope=scope,
        scope_value=str(scope_value) if scope_value is not None else None,
        subject=subject,
        body_md=body_md,
        related_kind=(data.get('related_kind') or None),
        related_id=data.get('related_id') or None,
    )
    db.session.add(msg)
    db.session.flush()

    # Resolve recipient count for audit + return
    recipient_count = _count_recipients(msg)

    anchor = AuditChainEntry.append(
        action='tenant.message.sent',
        actor_email=current_user.email,
        subject_kind='tenant_message',
        subject_id=msg.id,
        details={
            'network_id': network_id,
            'scope': scope,
            'scope_value': msg.scope_value,
            'subject': subject[:200],
            'recipient_count': recipient_count,
        },
    )
    if anchor:
        msg.audit_chain_id = anchor.id
    db.session.commit()

    return jsonify({
        'success': True,
        'message': msg.to_dict(),
        'recipient_count': recipient_count,
    })


@tenant_message_bp.route('/', methods=['GET'])
@login_required
def api_list_messages():
    """List messages visible to the current user.

    Admin: sees all messages they (or anyone) sent in this network —
    full sent log.

    NGO: sees only messages whose scope resolves to their org. Counts
    unread.
    """
    network_id = get_current_network_id()
    if not network_id:
        return jsonify({'success': True, 'messages': [], 'unread': 0})

    q = TenantMessage.query.filter_by(network_id=network_id)

    if current_user.role == 'admin':
        rows = q.order_by(TenantMessage.sent_at.desc()).limit(200).all()
        return jsonify({
            'success': True,
            'messages': [m.to_dict() for m in rows],
            'unread': 0,  # admin view doesn't need unread
        })

    # NGO viewer — scope to their org
    org_id = current_user.org_id
    if not org_id:
        return jsonify({'success': True, 'messages': [], 'unread': 0})

    org = Organization.query.get(org_id)
    rows = q.order_by(TenantMessage.sent_at.desc()).limit(200).all()
    visible = [m for m in rows if _can_org_read(m, org_id=org_id, country=getattr(org, 'country', None))]
    payload = [m.to_dict(viewer_org_id=org_id) for m in visible]
    unread = sum(1 for m in payload if m.get('is_read') is False)
    return jsonify({
        'success': True,
        'messages': payload,
        'unread': unread,
    })


@tenant_message_bp.route('/<int:message_id>/read', methods=['PATCH'])
@login_required
def api_mark_read(message_id):
    """Mark a message as read by the caller's org."""
    if not current_user.org_id:
        return jsonify({'success': False, 'error': 'No org on user'}), 400
    msg = TenantMessage.query.get_or_404(message_id)
    # Scope check
    org = Organization.query.get(current_user.org_id)
    if not _can_org_read(msg, org_id=current_user.org_id, country=getattr(org, 'country', None)):
        return jsonify({'success': False, 'error': 'Not visible to this org'}), 403
    existing = TenantMessageRead.query.filter_by(
        message_id=message_id, org_id=current_user.org_id,
    ).first()
    if not existing:
        rec = TenantMessageRead(message_id=message_id, org_id=current_user.org_id)
        db.session.add(rec)
        db.session.commit()
    return jsonify({'success': True})


@tenant_message_bp.route('/recipients', methods=['POST'])
@login_required
@role_required('admin')
def api_preview_recipients():
    """Preview which orgs a given scope/scope_value would reach.

    Lets the compose form show 'Would reach 12 orgs' before sending.
    Body: { scope, scope_value? }
    """
    network_id = get_current_network_id()
    if not network_id:
        return jsonify({'success': False, 'error': 'No network'}), 400
    data = get_request_json() or {}
    fake = TenantMessage(
        network_id=network_id,
        scope=(data.get('scope') or 'network').strip().lower(),
        scope_value=str(data.get('scope_value')) if data.get('scope_value') is not None else None,
    )
    return jsonify({'success': True, 'recipient_count': _count_recipients(fake)})


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _can_org_read(msg: TenantMessage, *, org_id: int, country: str | None) -> bool:
    """Return True if a message is visible to the given org.

    The scope check mirrors what _count_recipients computes — same
    rule, applied to a single org.
    """
    if msg.scope == 'network':
        return True
    if msg.scope == 'country':
        return bool(country) and country.upper() == (msg.scope_value or '').upper()
    if msg.scope == 'org':
        try:
            return int(msg.scope_value or 0) == int(org_id)
        except (TypeError, ValueError):
            return False
    if msg.scope == 'declaration':
        try:
            d = EmergencyDeclaration.query.get(int(msg.scope_value or 0))
        except (TypeError, ValueError):
            return False
        if not d:
            return False
        shortlist = d.get_shortlisted_org_ids() or []
        return int(org_id) in shortlist
    return False


def _count_recipients(msg: TenantMessage) -> int:
    """Count the active member orgs a message would reach in this network."""
    members = (
        NetworkMembership.query
        .filter_by(network_id=msg.network_id, status='active')
        .all()
    )
    org_ids = [m.org_id for m in members]
    if msg.scope == 'network':
        return len(org_ids)
    if msg.scope == 'country':
        if not msg.scope_value:
            return 0
        target = msg.scope_value.upper()
        # Resolve country per org
        if not org_ids:
            return 0
        orgs = Organization.query.filter(Organization.id.in_(org_ids)).all()
        return sum(1 for o in orgs if (getattr(o, 'country', None) or '').upper() == target)
    if msg.scope == 'org':
        try:
            target = int(msg.scope_value or 0)
        except (TypeError, ValueError):
            return 0
        return 1 if target in org_ids else 0
    if msg.scope == 'declaration':
        try:
            d = EmergencyDeclaration.query.get(int(msg.scope_value or 0))
        except (TypeError, ValueError):
            return 0
        if not d:
            return 0
        shortlist = d.get_shortlisted_org_ids() or []
        return sum(1 for o in shortlist if o in org_ids)
    return 0
