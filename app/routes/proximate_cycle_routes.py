"""Proximate grant-cycle routes — 2026-07-24.

The OB-side command centre for the real Proximate process:

    area + grant size  →  panel members (vetted)  →  they nominate
    partners  →  secretariat due diligence  →  shortlist back to panel
    →  panel awards  →  contract  →  disburse  →  partner confirms
    receipt  →  implementation  →  report  →  close

Endpoints, grouped by the stage they serve:

  Cycle setup
    PATCH /rounds/<id>/setup            area, sources, money split, dates
    POST  /rounds/<id>/phase            move the cycle to the next phase

  Panel members  (they are the people who endorse partners — there is no
                  separate endorser role at Proximate)
    GET   /rounds/<id>/panel            roster with due-diligence state
    POST  /rounds/<id>/panel            add a member
    PATCH /panel/<id>                   edit profile / governance flags
    POST  /panel/<id>/checks            record a DD check result
    POST  /panel/<id>/confirm           seat them; mints their no-login link
    POST  /panel/<id>/stand-down

  Panel meetings
    GET   /rounds/<id>/meetings
    POST  /rounds/<id>/meetings
    PATCH /meetings/<id>

  Awards
    GET   /rounds/<id>/awards           the award register
    POST  /rounds/<id>/awards           record a decision
    PATCH /awards/<id>

  Contracting
    POST  /awards/<id>/contract         open a contract from an award
    PATCH /contracts/<id>

  Receipt confirmation
    GET   /receipt/<token>              public, no login
    POST  /receipt/<token>              public, partner confirms
    POST  /disbursements/<id>/receipt   secretariat records it instead

  Readiness
    GET   /disbursements/readiness/<partner_id>?round_id=

Everything except the two public receipt routes is OB-only.
"""

import json
import logging
import secrets
from datetime import datetime, timezone, timedelta

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from app.extensions import db
from app.models import (
    AuditChainEntry,
    ProximateRound, ProximateRoundParticipant,
    ProximatePartner, ProximatePanelCandidate,
    ProximatePanelMeeting, ProximateAward, ProximateContract,
    ProximateDisbursement,

    AWARD_DECISIONS, AWARD_METHODS, CONTRACT_STATUSES, MEETING_TYPES,
    ROUND_PHASES, AREA_SOURCES,
)
from app.utils.network import ob_required, get_current_network
from app.utils.helpers import get_request_json

logger = logging.getLogger('kuja')

cycle_bp = Blueprint('proximate_cycle', __name__, url_prefix='/api/proximate')


# ===============================================================
# helpers
# ===============================================================

def _now():
    return datetime.now(timezone.utc)


def _net_id():
    net = get_current_network()
    return net.id if net else None


def _scoped_round(round_id: int):
    """Fetch a round, or None if it is not this tenant's.

    Every handler below goes through here rather than Query.get() —
    an object-level check, not just a role check, so an OB member of
    one network cannot reach another network's cycle by guessing an id.
    """
    nid = _net_id()
    if not nid:
        return None
    return ProximateRound.query.filter_by(id=round_id, network_id=nid).first()


def _audit(action: str, subject_kind: str, subject_id, **details):
    try:
        AuditChainEntry.append(
            action=action,
            actor_email=getattr(current_user, 'email', None),
            subject_kind=subject_kind,
            subject_id=subject_id,
            details=details,
        )
    except Exception as e:  # never let the audit write break the action
        logger.warning('audit append failed for %s: %s', action, e)


def _parse_date(v):
    if not v:
        return None
    try:
        return datetime.fromisoformat(str(v)[:10]).date()
    except (ValueError, TypeError):
        return None


def _f(v):
    """Float or None — blank strings from a form must not become 0.0."""
    if v is None or v == '':
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


# ===============================================================
# Cycle setup
# ===============================================================

@cycle_bp.route('/rounds/<int:round_id>/setup', methods=['PATCH'])
@login_required
@ob_required
def api_round_setup(round_id):
    """Set the area, the grant size and the money split for a cycle."""
    rnd = _scoped_round(round_id)
    if not rnd:
        return jsonify({'success': False, 'error': 'Round not found'}), 404

    body = get_request_json() or {}

    for field in (
        'target_region', 'target_locality', 'area_rationale',
        'security_note', 'market_risk_note',
        'conflict_sensitivity_note', 'feasibility_note',
    ):
        if field in body:
            setattr(rnd, field, (body.get(field) or None))

    if 'grant_size_usd' in body:
        rnd.grant_size_usd = _f(body.get('grant_size_usd'))
    if 'envelope_usd' in body:
        rnd.envelope_usd = _f(body.get('envelope_usd'))
    if 'admin_overhead_usd' in body:
        overhead = _f(body.get('admin_overhead_usd'))
        envelope = _f(body.get('envelope_usd')) or rnd.envelope_usd
        # Overhead larger than the envelope leaves nothing for partners
        # and is always a typo. Refuse rather than silently clamp — a
        # clamped number would look deliberate on the donor pack.
        if overhead is not None and envelope is not None and overhead > envelope:
            return jsonify({
                'success': False,
                'error': (
                    'Administration and overhead cannot exceed the total '
                    'envelope — that would leave nothing for partners.'
                ),
                'code': 'err.overhead_exceeds_envelope',
            }), 400
        rnd.admin_overhead_usd = overhead

    if 'area_sources' in body:
        srcs = body.get('area_sources') or []
        if not isinstance(srcs, list):
            srcs = []
        srcs = [s for s in srcs if s in AREA_SOURCES]
        rnd.area_sources_json = json.dumps(srcs)

    for field in (
        'target_award_date', 'target_disbursement_date', 'target_report_date',
    ):
        if field in body:
            setattr(rnd, field, _parse_date(body.get(field)))

    db.session.commit()
    _audit('proximate.cycle.setup', 'round', rnd.id,
           region=rnd.target_region, locality=rnd.target_locality,
           envelope=rnd.envelope_usd, overhead=rnd.admin_overhead_usd)

    return jsonify({
        'success': True,
        'round': _round_setup_dict(rnd),
    })


def _round_setup_dict(rnd) -> dict:
    try:
        sources = json.loads(rnd.area_sources_json) if rnd.area_sources_json else []
    except (ValueError, TypeError):
        sources = []
    return {
        'id': rnd.id,
        'title': rnd.title,
        'status': rnd.status,
        'phase': rnd.phase or 'context_review',
        'target_country': rnd.target_country,
        'target_region': rnd.target_region,
        'target_locality': rnd.target_locality,
        'area_rationale': rnd.area_rationale,
        'area_sources': sources,
        'security_note': rnd.security_note,
        'market_risk_note': rnd.market_risk_note,
        'conflict_sensitivity_note': rnd.conflict_sensitivity_note,
        'feasibility_note': rnd.feasibility_note,
        'money': rnd.money_summary(),
        'target_award_date': (
            rnd.target_award_date.isoformat() if rnd.target_award_date else None
        ),
        'target_disbursement_date': (
            rnd.target_disbursement_date.isoformat()
            if rnd.target_disbursement_date else None
        ),
        'target_report_date': (
            rnd.target_report_date.isoformat() if rnd.target_report_date else None
        ),
        'date_warnings': _date_warnings(rnd),
    }


def _date_warnings(rnd) -> list:
    """Target dates warn; they never block.

    A cycle in Sudan slips because a road closed or a bank stopped
    settling, not because someone forgot. The system's job is to say so
    out loud, not to refuse the next step.
    """
    out = []
    today = datetime.now(timezone.utc).date()
    checks = (
        ('award', rnd.target_award_date, 'awarding'),
        ('disbursement', rnd.target_disbursement_date, 'disbursement'),
        ('report', rnd.target_report_date, 'reporting'),
    )
    order = list(ROUND_PHASES)
    current = rnd.phase or 'context_review'
    cur_idx = order.index(current) if current in order else 0
    for label, target, expected_phase in checks:
        if not target or target >= today:
            continue
        exp_idx = order.index(expected_phase) if expected_phase in order else 0
        if cur_idx <= exp_idx:
            out.append({
                'kind': f'{label}_date_passed',
                'severity': 'warning',
                'days_late': (today - target).days,
                'message': (
                    f'The target {label} date passed '
                    f'{(today - target).days} day(s) ago. '
                    'This is a note, not a block — carry on.'
                ),
            })
    return out


@cycle_bp.route('/rounds/<int:round_id>/phase', methods=['POST'])
@login_required
@ob_required
def api_round_phase(round_id):
    rnd = _scoped_round(round_id)
    if not rnd:
        return jsonify({'success': False, 'error': 'Round not found'}), 404
    body = get_request_json() or {}
    phase = (body.get('phase') or '').strip()
    if phase not in ROUND_PHASES:
        return jsonify({
            'success': False,
            'error': f'phase must be one of: {", ".join(ROUND_PHASES)}',
        }), 400
    previous = rnd.phase
    rnd.phase = phase
    if phase == 'closeout' and not rnd.closed_at:
        pass  # closing the ROUND is a separate, signed action
    db.session.commit()
    _audit('proximate.cycle.phase', 'round', rnd.id,
           from_phase=previous, to_phase=phase)
    return jsonify({'success': True, 'phase': phase})


# ===============================================================
# Panel members
# ===============================================================

@cycle_bp.route('/rounds/<int:round_id>/panel', methods=['GET'])
@login_required
@ob_required
def api_panel_list(round_id):
    rnd = _scoped_round(round_id)
    if not rnd:
        return jsonify({'success': False, 'error': 'Round not found'}), 404
    rows = ProximatePanelCandidate.query.filter_by(
        network_id=rnd.network_id, round_id=rnd.id,
    ).order_by(ProximatePanelCandidate.created_at.asc()).all()

    members = [r.to_dict(include_contact=True) for r in rows]
    confirmed = [m for m in members if m['status'] == 'confirmed']
    # Panel diversity is a stated SoP requirement, so report it rather
    # than leave the secretariat to eyeball a list.
    localities = sorted({(m.get('location') or '').strip()
                         for m in confirmed if (m.get('location') or '').strip()})
    return jsonify({
        'success': True,
        'members': members,
        'summary': {
            'total': len(members),
            'confirmed': len(confirmed),
            'awaiting_dd': len([m for m in members if not m['dd_complete']]),
            'dd_failed': len([m for m in members if m['dd_complete'] and not m['dd_passed']]),
            'localities_represented': localities,
            'locality_count': len(localities),
        },
    })


@cycle_bp.route('/rounds/<int:round_id>/panel', methods=['POST'])
@login_required
@ob_required
def api_panel_add(round_id):
    rnd = _scoped_round(round_id)
    if not rnd:
        return jsonify({'success': False, 'error': 'Round not found'}), 404
    body = get_request_json() or {}
    name = (body.get('name') or '').strip()
    if not name:
        return jsonify({'success': False, 'error': 'name is required'}), 400

    m = ProximatePanelCandidate(
        network_id=rnd.network_id,
        round_id=rnd.id,
        name=name,
        phone=(body.get('phone') or '').strip() or None,
        email=(body.get('email') or '').strip() or None,
        location=(body.get('location') or '').strip() or None,
        rationale=(body.get('rationale') or '').strip() or None,
        expertise=(body.get('expertise') or '').strip() or None,
        network_represented=(body.get('network_represented') or '').strip() or None,
        recommended_by=(body.get('recommended_by') or '').strip() or None,
        language=(body.get('language') or 'ar')[:8],
        status='candidate',
        created_by_user_id=getattr(current_user, 'id', None),
    )
    db.session.add(m)
    db.session.commit()
    _audit('proximate.panel.member_added', 'panel_member', m.id,
           round_id=rnd.id, name=name, location=m.location)
    return jsonify({'success': True, 'member': m.to_dict()}), 201


@cycle_bp.route('/panel/<int:member_id>', methods=['PATCH'])
@login_required
@ob_required
def api_panel_update(member_id):
    nid = _net_id()
    m = ProximatePanelCandidate.query.filter_by(
        id=member_id, network_id=nid,
    ).first()
    if not m:
        return jsonify({'success': False, 'error': 'Panel member not found'}), 404
    body = get_request_json() or {}

    for field in (
        'name', 'phone', 'email', 'location', 'rationale', 'expertise',
        'network_represented', 'recommended_by', 'notes', 'language',
    ):
        if field in body:
            setattr(m, field, (body.get(field) or None))

    # Governance flags are timestamps, not booleans — "when did they
    # accept the terms of reference" is the auditable question.
    for flag, col in (
        ('tor_accepted', 'tor_accepted_at'),
        ('coi_declared', 'coi_declared_at'),
        ('confidentiality_accepted', 'confidentiality_accepted_at'),
        ('reference_checked', 'reference_check_at'),
        ('independently_validated', 'independent_validation_at'),
    ):
        if flag in body:
            setattr(m, col, _now() if body.get(flag) else None)

    db.session.commit()
    _audit('proximate.panel.member_updated', 'panel_member', m.id)
    return jsonify({'success': True, 'member': m.to_dict()})


@cycle_bp.route('/panel/<int:member_id>/checks', methods=['POST'])
@login_required
@ob_required
def api_panel_check(member_id):
    """Record a due-diligence result against a panel member.

    kind: sanctions | media | social | other
    For `other` the caller supplies a label — this is the slot for the
    checks that matter locally and fit no schema: a reference call, a
    WhatsApp group, a radio interview.
    """
    nid = _net_id()
    m = ProximatePanelCandidate.query.filter_by(
        id=member_id, network_id=nid,
    ).first()
    if not m:
        return jsonify({'success': False, 'error': 'Panel member not found'}), 404

    body = get_request_json() or {}
    kind = (body.get('kind') or '').strip().lower()
    result = (body.get('result') or '').strip().lower()
    note = (body.get('note') or '').strip() or None

    valid_results = ('clear', 'possible_match', 'confirmed_match', 'not_checked')
    if result not in valid_results:
        return jsonify({
            'success': False,
            'error': f'result must be one of: {", ".join(valid_results)}',
        }), 400

    if kind == 'sanctions':
        m.sanctions_status, m.sanctions_checked_at = result, _now()
    elif kind == 'media':
        m.media_status, m.media_checked_at = result, _now()
    elif kind == 'social':
        m.social_status, m.social_checked_at = result, _now()
        links = body.get('links')
        if isinstance(links, list):
            m.social_links_json = json.dumps([str(x)[:500] for x in links[:20]])
    elif kind == 'other':
        label = (body.get('label') or '').strip()
        if not label:
            return jsonify({
                'success': False,
                'error': 'label is required for an "other" check',
            }), 400
        rows = m.other_checks()
        rows.append({
            'label': label[:120],
            'result': result,
            'note': note,
            'checked_at': _now().isoformat(),
            'checked_by': getattr(current_user, 'email', None),
        })
        m.other_checks_json = json.dumps(rows[-50:])
    else:
        return jsonify({
            'success': False,
            'error': 'kind must be sanctions, media, social or other',
        }), 400

    if m.status == 'candidate':
        m.status = 'dd_in_progress'
    db.session.commit()
    _audit('proximate.panel.check_recorded', 'panel_member', m.id,
           kind=kind, result=result)
    return jsonify({'success': True, 'member': m.to_dict()})


@cycle_bp.route('/panel/<int:member_id>/verdict', methods=['POST'])
@login_required
@ob_required
def api_panel_verdict(member_id):
    nid = _net_id()
    m = ProximatePanelCandidate.query.filter_by(
        id=member_id, network_id=nid,
    ).first()
    if not m:
        return jsonify({'success': False, 'error': 'Panel member not found'}), 404
    body = get_request_json() or {}
    verdict = (body.get('verdict') or '').strip().lower()
    valid = ('clear', 'low', 'medium', 'high', 'rejected')
    if verdict not in valid:
        return jsonify({
            'success': False,
            'error': f'verdict must be one of: {", ".join(valid)}',
        }), 400
    m.dd_verdict = verdict
    m.dd_notes = (body.get('notes') or '').strip() or None
    m.dd_completed_at = _now()
    m.dd_by_user_id = getattr(current_user, 'id', None)
    m.status = 'dd_passed' if m.dd_passed else 'dd_failed'
    db.session.commit()
    _audit('proximate.panel.dd_verdict', 'panel_member', m.id, verdict=verdict)
    return jsonify({'success': True, 'member': m.to_dict()})


@cycle_bp.route('/panel/<int:member_id>/confirm', methods=['POST'])
@login_required
@ob_required
def api_panel_confirm(member_id):
    """Seat a panel member and mint their no-login link.

    Confirming does two things at once: it records that this person is
    on the panel, and it creates the credential they will actually use.
    They work from a phone, often a shared one, so the link IS the
    account — there is no password to forget and nothing to install.

    Endorsements they submit point at this row directly. Endorsement is
    a step panel members perform, not a separate role, so there is no
    shadow "endorser" account behind them — they have no account at all.
    """
    nid = _net_id()
    m = ProximatePanelCandidate.query.filter_by(
        id=member_id, network_id=nid,
    ).first()
    if not m:
        return jsonify({'success': False, 'error': 'Panel member not found'}), 404

    if not m.can_be_confirmed:
        return jsonify({
            'success': False,
            'error': (
                'Run due diligence first. A panel member decides who gets '
                'public money, so the checks come before the seat.'
            ),
            'code': 'err.panel_dd_incomplete',
            'dd_complete': m.dd_complete,
            'dd_passed': m.dd_passed,
        }), 400

    if not m.public_token:
        m.public_token = secrets.token_urlsafe(32)
        m.token_issued_at = _now()

    m.status = 'confirmed'
    db.session.commit()
    _audit('proximate.panel.confirmed', 'panel_member', m.id,
           round_id=m.round_id)

    base = request.host_url.rstrip('/')
    return jsonify({
        'success': True,
        'member': m.to_dict(),
        'portal_url': f'{base}/proximate-endorse?t={m.public_token}',
    })


@cycle_bp.route('/panel/<int:member_id>/stand-down', methods=['POST'])
@login_required
@ob_required
def api_panel_stand_down(member_id):
    nid = _net_id()
    m = ProximatePanelCandidate.query.filter_by(
        id=member_id, network_id=nid,
    ).first()
    if not m:
        return jsonify({'success': False, 'error': 'Panel member not found'}), 404
    body = get_request_json() or {}
    m.status = 'stood_down'
    # Revoke the link. Someone off the panel keeps no way in.
    m.public_token = None
    reason = (body.get('reason') or '').strip() or None
    if reason:
        m.notes = f'{(m.notes or "").strip()}\nStood down: {reason}'.strip()
    db.session.commit()
    _audit('proximate.panel.stood_down', 'panel_member', m.id, reason=reason)
    return jsonify({'success': True, 'member': m.to_dict()})


# ===============================================================
# Panel meetings
# ===============================================================

@cycle_bp.route('/rounds/<int:round_id>/meetings', methods=['GET'])
@login_required
@ob_required
def api_meetings_list(round_id):
    rnd = _scoped_round(round_id)
    if not rnd:
        return jsonify({'success': False, 'error': 'Round not found'}), 404
    rows = ProximatePanelMeeting.query.filter_by(
        network_id=rnd.network_id, round_id=rnd.id,
    ).order_by(ProximatePanelMeeting.held_at.asc().nullslast()).all()
    held = {r.meeting_type for r in rows}
    return jsonify({
        'success': True,
        'meetings': [r.to_dict() for r in rows],
        # The SoP names three formal meetings. Report which are still
        # outstanding rather than blocking on them — a cycle can run
        # ahead of its paperwork and still be legitimate.
        'required_outstanding': [
            t for t in ('orientation', 'nomination_review', 'awarding')
            if t not in held
        ],
    })


@cycle_bp.route('/rounds/<int:round_id>/meetings', methods=['POST'])
@login_required
@ob_required
def api_meeting_create(round_id):
    rnd = _scoped_round(round_id)
    if not rnd:
        return jsonify({'success': False, 'error': 'Round not found'}), 404
    body = get_request_json() or {}
    mtype = (body.get('meeting_type') or 'ad_hoc').strip()
    if mtype not in MEETING_TYPES:
        return jsonify({
            'success': False,
            'error': f'meeting_type must be one of: {", ".join(MEETING_TYPES)}',
        }), 400

    existing = ProximatePanelMeeting.query.filter_by(
        network_id=rnd.network_id, round_id=rnd.id,
    ).count()
    attendees = body.get('attendees')
    m = ProximatePanelMeeting(
        network_id=rnd.network_id,
        round_id=rnd.id,
        meeting_number=body.get('meeting_number') or (existing + 1),
        meeting_type=mtype,
        title=(body.get('title') or '').strip() or None,
        held_at=(
            datetime.fromisoformat(body['held_at'].replace('Z', '+00:00'))
            if body.get('held_at') else None
        ),
        attendees_json=json.dumps(attendees) if isinstance(attendees, list) else None,
        agenda=(body.get('agenda') or '').strip() or None,
        decisions=(body.get('decisions') or '').strip() or None,
        minutes=(body.get('minutes') or '').strip() or None,
        action_items=(body.get('action_items') or '').strip() or None,
        coi_notes=(body.get('coi_notes') or '').strip() or None,
        created_by_user_id=getattr(current_user, 'id', None),
    )
    db.session.add(m)
    db.session.commit()
    _audit('proximate.panel.meeting_recorded', 'panel_meeting', m.id,
           round_id=rnd.id, meeting_type=mtype)
    return jsonify({'success': True, 'meeting': m.to_dict()}), 201


@cycle_bp.route('/meetings/<int:meeting_id>', methods=['PATCH'])
@login_required
@ob_required
def api_meeting_update(meeting_id):
    nid = _net_id()
    m = ProximatePanelMeeting.query.filter_by(
        id=meeting_id, network_id=nid,
    ).first()
    if not m:
        return jsonify({'success': False, 'error': 'Meeting not found'}), 404
    body = get_request_json() or {}
    for field in ('title', 'agenda', 'decisions', 'minutes',
                  'action_items', 'coi_notes'):
        if field in body:
            setattr(m, field, (body.get(field) or None))
    if 'attendees' in body and isinstance(body['attendees'], list):
        m.attendees_json = json.dumps(body['attendees'])
    if body.get('held_at'):
        try:
            m.held_at = datetime.fromisoformat(
                body['held_at'].replace('Z', '+00:00'))
        except (ValueError, TypeError):
            pass
    db.session.commit()
    _audit('proximate.panel.meeting_updated', 'panel_meeting', m.id)
    return jsonify({'success': True, 'meeting': m.to_dict()})


# ===============================================================
# Awards
# ===============================================================

@cycle_bp.route('/rounds/<int:round_id>/awards', methods=['GET'])
@login_required
@ob_required
def api_awards_list(round_id):
    """The award register — generated, not maintained in a spreadsheet."""
    rnd = _scoped_round(round_id)
    if not rnd:
        return jsonify({'success': False, 'error': 'Round not found'}), 404

    rows = ProximateAward.query.filter_by(
        network_id=rnd.network_id, round_id=rnd.id,
    ).order_by(ProximateAward.created_at.asc()).all()

    partner_ids = [r.partner_id for r in rows]
    names = {}
    if partner_ids:
        for p in ProximatePartner.query.filter(
            ProximatePartner.id.in_(partner_ids)
        ).all():
            names[p.id] = p.name

    contracts = {}
    if rows:
        for c in ProximateContract.query.filter(
            ProximateContract.award_id.in_([r.id for r in rows])
        ).all():
            contracts[c.award_id] = c

    register = []
    for r in rows:
        d = r.to_dict(partner_name=names.get(r.partner_id))
        c = contracts.get(r.id)
        d['contract'] = c.to_dict() if c else None
        register.append(d)

    unattributable = [d for d in register if not d['decision_is_attributable']]
    return jsonify({
        'success': True,
        'awards': register,
        'money': rnd.money_summary(),
        'summary': {
            'total': len(register),
            'awarded': len([d for d in register if d['decision'] == 'awarded']),
            'not_awarded': len([d for d in register if d['decision'] == 'not_awarded']),
            'pending': len([d for d in register if d['decision'] == 'pending']),
            'unattributable_decisions': len(unattributable),
        },
    })


@cycle_bp.route('/rounds/<int:round_id>/awards', methods=['POST'])
@login_required
@ob_required
def api_award_create(round_id):
    rnd = _scoped_round(round_id)
    if not rnd:
        return jsonify({'success': False, 'error': 'Round not found'}), 404
    body = get_request_json() or {}
    partner_id = body.get('partner_id')
    if not partner_id:
        return jsonify({'success': False, 'error': 'partner_id is required'}), 400

    partner = ProximatePartner.query.filter_by(
        id=partner_id, network_id=rnd.network_id,
    ).first()
    if not partner:
        return jsonify({'success': False, 'error': 'Partner not found'}), 404

    existing = ProximateAward.query.filter_by(
        round_id=rnd.id, partner_id=partner_id,
    ).first()
    if existing:
        return jsonify({
            'success': False,
            'error': 'This partner already has an award record in this cycle.',
            'award_id': existing.id,
        }), 409

    a = ProximateAward(
        network_id=rnd.network_id,
        round_id=rnd.id,
        partner_id=partner_id,
        requested_amount_usd=_f(body.get('requested_amount_usd')),
        recommended_amount_usd=_f(body.get('recommended_amount_usd')),
        decision='pending',
        recorded_by_user_id=getattr(current_user, 'id', None),
    )
    db.session.add(a)
    db.session.commit()
    _audit('proximate.award.opened', 'award', a.id,
           round_id=rnd.id, partner_id=partner_id)
    return jsonify({'success': True, 'award': a.to_dict(partner.name)}), 201


@cycle_bp.route('/awards/<int:award_id>', methods=['PATCH'])
@login_required
@ob_required
def api_award_decide(award_id):
    """Record the panel's decision on one partner."""
    nid = _net_id()
    a = ProximateAward.query.filter_by(id=award_id, network_id=nid).first()
    if not a:
        return jsonify({'success': False, 'error': 'Award not found'}), 404
    body = get_request_json() or {}

    if 'decision' in body:
        decision = (body.get('decision') or '').strip()
        if decision not in AWARD_DECISIONS:
            return jsonify({
                'success': False,
                'error': f'decision must be one of: {", ".join(AWARD_DECISIONS)}',
            }), 400
        a.decision = decision
        a.decided_at = _now() if decision != 'pending' else None

    if 'decision_method' in body:
        method = (body.get('decision_method') or '').strip()
        if method and method not in AWARD_METHODS:
            return jsonify({
                'success': False,
                'error': f'decision_method must be one of: {", ".join(AWARD_METHODS)}',
            }), 400
        a.decision_method = method or None

    for field in ('amount_reason', 'panel_comments', 'evidence_note'):
        if field in body:
            setattr(a, field, (body.get(field) or None))
    for field in ('requested_amount_usd', 'recommended_amount_usd',
                  'approved_amount_usd'):
        if field in body:
            setattr(a, field, _f(body.get(field)))
    if 'meeting_id' in body:
        a.meeting_id = body.get('meeting_id') or None
    for field, col in (('recusals', 'recusals_json'),
                       ('confirmations', 'confirmations_json')):
        if field in body and isinstance(body[field], list):
            setattr(a, col, json.dumps(body[field]))

    # Money guard. The cycle can only award what is actually disbursable
    # after administration — see ProximateRound.disbursable_usd.
    if a.decision == 'awarded':
        rnd = ProximateRound.query.get(a.round_id)
        if rnd:
            others = ProximateAward.query.filter(
                ProximateAward.round_id == rnd.id,
                ProximateAward.decision == 'awarded',
                ProximateAward.id != a.id,
            ).all()
            committed = sum(float(o.approved_amount_usd or 0) for o in others)
            proposed = float(a.approved_amount_usd or 0)
            if rnd.disbursable_usd and (committed + proposed) > rnd.disbursable_usd:
                db.session.rollback()
                return jsonify({
                    'success': False,
                    'error': (
                        f'That would commit ${committed + proposed:,.0f} against '
                        f'${rnd.disbursable_usd:,.0f} available for partner '
                        f'awards in this cycle. The donor envelope is '
                        f'${float(rnd.envelope_usd or 0):,.0f}, of which '
                        f'${float(rnd.admin_overhead_usd or 0):,.0f} is '
                        f'administration and overhead.'
                    ),
                    'code': 'err.exceeds_disbursable',
                    'money': rnd.money_summary(),
                }), 400

    a.recorded_by_user_id = getattr(current_user, 'id', None)
    db.session.commit()

    partner = ProximatePartner.query.get(a.partner_id)
    _audit('proximate.award.decided', 'award', a.id,
           decision=a.decision, method=a.decision_method,
           approved_usd=a.approved_amount_usd,
           attributable=a.decision_is_attributable)

    # Keep the roster stage in step with the decision.
    if a.decision in ('awarded', 'not_awarded'):
        part = ProximateRoundParticipant.query.filter_by(
            round_id=a.round_id, partner_id=a.partner_id,
        ).first()
        if part:
            part.stage = 'awarded' if a.decision == 'awarded' else 'not_awarded'
            db.session.commit()

    return jsonify({
        'success': True,
        'award': a.to_dict(partner.name if partner else None),
        'warning': (
            None if a.decision_is_attributable else
            'This decision is recorded by the secretariat with nothing behind '
            'it. Link a meeting, attach the minutes or record at least one '
            'panel confirmation — otherwise the panel cannot be shown to have '
            'made it.'
        ),
    })


# ===============================================================
# Contracting
# ===============================================================

@cycle_bp.route('/awards/<int:award_id>/contract', methods=['POST'])
@login_required
@ob_required
def api_contract_open(award_id):
    nid = _net_id()
    a = ProximateAward.query.filter_by(id=award_id, network_id=nid).first()
    if not a:
        return jsonify({'success': False, 'error': 'Award not found'}), 404
    if a.decision != 'awarded':
        return jsonify({
            'success': False,
            'error': 'Only an awarded partner can be contracted.',
            'code': 'err.not_awarded',
        }), 400

    existing = ProximateContract.query.filter_by(award_id=a.id).first()
    if existing:
        return jsonify({'success': True, 'contract': existing.to_dict()})

    body = get_request_json() or {}
    partner = ProximatePartner.query.get(a.partner_id)
    c = ProximateContract(
        network_id=a.network_id,
        award_id=a.id,
        partner_id=a.partner_id,
        round_id=a.round_id,
        official_name_ar=(body.get('official_name_ar') or '').strip() or None,
        official_name_en=(
            (body.get('official_name_en') or '').strip()
            or (partner.name if partner else None)
        ),
        approved_amount_usd=a.approved_amount_usd,
        duration_days=body.get('duration_days'),
        arabic_annex_required=body.get('arabic_annex_required', True),
        status='drafting',
        created_by_user_id=getattr(current_user, 'id', None),
    )
    db.session.add(c)
    db.session.commit()
    _audit('proximate.contract.opened', 'contract', c.id,
           award_id=a.id, partner_id=a.partner_id)

    part = ProximateRoundParticipant.query.filter_by(
        round_id=a.round_id, partner_id=a.partner_id,
    ).first()
    if part:
        part.stage = 'contracting'
        db.session.commit()

    return jsonify({'success': True, 'contract': c.to_dict()}), 201


@cycle_bp.route('/contracts/<int:contract_id>', methods=['PATCH'])
@login_required
@ob_required
def api_contract_update(contract_id):
    nid = _net_id()
    c = ProximateContract.query.filter_by(id=contract_id, network_id=nid).first()
    if not c:
        return jsonify({'success': False, 'error': 'Contract not found'}), 404
    body = get_request_json() or {}

    for field in (
        'official_name_ar', 'official_name_en', 'signatory_name',
        'signatory_title', 'signatory_phone', 'signatory_email',
        'signatory_id_number', 'local_currency', 'pandadoc_id',
        'pandadoc_url', 'pandadoc_status', 'void_reason',
    ):
        if field in body:
            setattr(c, field, (body.get(field) or None))
    for field in ('approved_amount_usd', 'local_amount'):
        if field in body:
            setattr(c, field, _f(body.get(field)))
    if 'duration_days' in body:
        c.duration_days = body.get('duration_days') or None
    if 'reporting_deadline' in body:
        c.reporting_deadline = _parse_date(body.get('reporting_deadline'))
    if 'arabic_annex_required' in body:
        c.arabic_annex_required = bool(body.get('arabic_annex_required'))

    if 'status' in body:
        status = (body.get('status') or '').strip()
        if status not in CONTRACT_STATUSES:
            return jsonify({
                'success': False,
                'error': f'status must be one of: {", ".join(CONTRACT_STATUSES)}',
            }), 400
        c.status = status
        stamps = {
            'sent': 'sent_at',
            'partner_signed': 'partner_signed_at',
            'adeso_signed': 'adeso_signed_at',
            'completed': 'completed_at',
        }
        if status in stamps and not getattr(c, stamps[status]):
            setattr(c, stamps[status], _now())

    db.session.commit()
    _audit('proximate.contract.updated', 'contract', c.id, status=c.status)

    if c.status == 'completed':
        part = ProximateRoundParticipant.query.filter_by(
            round_id=c.round_id, partner_id=c.partner_id,
        ).first()
        if part:
            part.stage = 'contract_signed'
            db.session.commit()

    return jsonify({'success': True, 'contract': c.to_dict()})


# ===============================================================
# Disbursement readiness — the hard gate
# ===============================================================

def compute_readiness(partner_id: int, round_id: int) -> dict:
    """Can money go to this partner in this cycle, and if not, why not?

    These are HARD blocks, unlike the date warnings. Every one of them
    represents an authorisation that has to exist before public money
    moves, and the reasons are phrased for a person to act on rather
    than a code to look up.
    """
    blocks, warnings = [], []

    partner = ProximatePartner.query.get(partner_id)
    if not partner:
        return {'ready': False, 'blocks': [{
            'code': 'partner_missing',
            'message': 'Partner not found.',
        }], 'warnings': []}

    # 1. Due diligence
    status = (getattr(partner, 'status', '') or '').lower()
    if status in ('suspended', 'rejected'):
        blocks.append({
            'code': 'partner_not_cleared',
            'message': f'This partner is {status}. Money cannot be released.',
        })

    # 2. Panel award decision
    award = ProximateAward.query.filter_by(
        round_id=round_id, partner_id=partner_id,
    ).first()
    if not award or award.decision != 'awarded':
        blocks.append({
            'code': 'no_award',
            'message': (
                'The panel has not awarded this partner in this cycle. '
                'Record the award decision first.'
            ),
        })
    elif not award.approved_amount_usd:
        blocks.append({
            'code': 'no_approved_amount',
            'message': 'The award has no approved amount.',
        })
    elif not award.decision_is_attributable:
        # A warning, not a block. Refusing to pay a partner because the
        # paperwork behind a decision is thin punishes the wrong person.
        warnings.append({
            'code': 'award_unattributable',
            'message': (
                'This award was recorded by the secretariat with no meeting, '
                'evidence or panel confirmation attached.'
            ),
        })

    # 3. Contract
    if award:
        contract = ProximateContract.query.filter_by(award_id=award.id).first()
        if not contract:
            blocks.append({
                'code': 'no_contract',
                'message': 'No agreement has been opened for this award.',
            })
        elif not contract.is_complete:
            blocks.append({
                'code': 'contract_incomplete',
                'message': (
                    f'The agreement is at "{contract.status}". Both signatures '
                    'are needed before funds are released.'
                ),
            })

    # 4. Payment details
    try:
        from app.models import PartnerDisbursementMethod
        method = PartnerDisbursementMethod.query.filter_by(
            partner_id=partner_id,
        ).filter(
            PartnerDisbursementMethod.status == 'verified',
        ).first()
        if not method:
            blocks.append({
                'code': 'no_verified_method',
                'message': (
                    'This partner has no verified payment method '
                    '(bank, mobile money or hawala).'
                ),
            })
    except Exception:
        db.session.rollback()

    return {
        'ready': not blocks,
        'blocks': blocks,
        'warnings': warnings,
        'award_id': award.id if award else None,
    }


@cycle_bp.route('/disbursements/readiness/<int:partner_id>', methods=['GET'])
@login_required
@ob_required
def api_readiness(partner_id):
    round_id = request.args.get('round_id', type=int)
    if not round_id:
        return jsonify({'success': False, 'error': 'round_id is required'}), 400
    rnd = _scoped_round(round_id)
    if not rnd:
        return jsonify({'success': False, 'error': 'Round not found'}), 404
    return jsonify({'success': True, **compute_readiness(partner_id, round_id)})


# ===============================================================
# Receipt confirmation
# ===============================================================

def _receipt_payload(d: ProximateDisbursement) -> dict:
    """The minimum a partner needs to recognise their own payment.

    Deliberately small: no internal ids, no other partners, no round
    finances. The token is a bearer credential shared over WhatsApp and
    may be forwarded, so it opens exactly one payment and nothing else.
    """
    partner = ProximatePartner.query.get(d.partner_id)
    return {
        'disbursement_id': d.id,
        'partner_name': partner.name if partner else None,
        'expected_amount_usd': float(d.amount_usd) if d.amount_usd else None,
        'sent_at': d.sent_at.isoformat() if d.sent_at else None,
        'purpose': d.purpose,
        'already_confirmed': d.receipt_confirmed_at is not None,
        'received_at': d.received_at.isoformat() if d.received_at else None,
        'receipt_amount': d.receipt_amount,
        'receipt_currency': d.receipt_currency,
    }


@cycle_bp.route('/receipt/<token>', methods=['GET'])
def api_receipt_get(token):
    """Public. The partner opens this from a WhatsApp link."""
    if not token or len(token) < 16:
        return jsonify({'success': False, 'error': 'Invalid link'}), 404
    d = ProximateDisbursement.query.filter_by(receipt_token=token).first()
    if not d:
        return jsonify({'success': False, 'error': 'Invalid link'}), 404
    return jsonify({'success': True, 'receipt': _receipt_payload(d)})


@cycle_bp.route('/receipt/<token>', methods=['POST'])
def api_receipt_confirm(token):
    """Public. The partner confirms the money arrived."""
    if not token or len(token) < 16:
        return jsonify({'success': False, 'error': 'Invalid link'}), 404
    d = ProximateDisbursement.query.filter_by(receipt_token=token).first()
    if not d:
        return jsonify({'success': False, 'error': 'Invalid link'}), 404
    if d.receipt_confirmed_at:
        return jsonify({
            'success': True,
            'already_confirmed': True,
            'receipt': _receipt_payload(d),
        })

    body = get_request_json() or {}
    _apply_receipt(d, body, source='partner_link')
    db.session.commit()
    _audit('proximate.receipt.confirmed', 'disbursement', d.id,
           source='partner_link', amount=d.receipt_amount,
           currency=d.receipt_currency)
    return jsonify({
        'success': True,
        'receipt': _receipt_payload(d),
        'message': 'Thank you. Your confirmation has been recorded.',
    })


@cycle_bp.route('/disbursements/<int:disb_id>/receipt', methods=['POST'])
@login_required
@ob_required
def api_receipt_record(disb_id):
    """The secretariat records a confirmation that arrived by WhatsApp.

    The common case, not the exception: a partner sends a screenshot of
    a mobile-money credit to whoever they normally talk to. Forcing that
    through a form the partner has to open would lose most of them.
    """
    nid = _net_id()
    d = ProximateDisbursement.query.filter_by(id=disb_id, network_id=nid).first()
    if not d:
        return jsonify({'success': False, 'error': 'Disbursement not found'}), 404
    body = get_request_json() or {}
    _apply_receipt(d, body, source='secretariat')
    d.receipt_recorded_by_user_id = getattr(current_user, 'id', None)
    db.session.commit()
    _audit('proximate.receipt.confirmed', 'disbursement', d.id,
           source='secretariat', amount=d.receipt_amount)
    return jsonify({'success': True, 'disbursement': d.to_dict()})


def _apply_receipt(d: ProximateDisbursement, body: dict, source: str) -> None:
    """Write the confirmation and restart the implementation clock.

    The report deadline is recomputed from the date the money ARRIVED,
    not the date it was sent. A partner cannot start work on funds that
    have not landed, and transfers through hawala routinely take days.
    Holding them to a clock that started in transit would penalise them
    for the fund's own payment rails.
    """
    d.receipt_amount = _f(body.get('amount'))
    d.receipt_currency = (body.get('currency') or 'SDG')[:8]
    d.receipt_sender_shown = (body.get('sender_shown') or '').strip() or None
    d.receipt_confirmed_by_name = (body.get('confirmed_by_name') or '').strip() or None
    d.receipt_confirmed_by_phone = (body.get('confirmed_by_phone') or '').strip() or None
    d.receipt_note = (body.get('note') or '').strip() or None
    d.receipt_doc_id = body.get('receipt_doc_id') or d.receipt_doc_id
    d.receipt_source = source
    d.receipt_confirmed_at = _now()

    received = body.get('received_at')
    parsed = None
    if received:
        try:
            parsed = datetime.fromisoformat(str(received).replace('Z', '+00:00'))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            parsed = None
    d.received_at = parsed or _now()
    d.implementation_start_at = d.received_at

    window = int(body.get('report_window_days') or 14)
    d.report_due_at = d.received_at + timedelta(days=window)

    part = ProximateRoundParticipant.query.filter_by(
        round_id=d.round_id, partner_id=d.partner_id,
    ).first()
    if part:
        part.stage = 'receipt_confirmed'


@cycle_bp.route('/disbursements/<int:disb_id>/receipt-link', methods=['POST'])
@login_required
@ob_required
def api_receipt_link(disb_id):
    """Mint (or return) the partner's confirmation link for sharing."""
    nid = _net_id()
    d = ProximateDisbursement.query.filter_by(id=disb_id, network_id=nid).first()
    if not d:
        return jsonify({'success': False, 'error': 'Disbursement not found'}), 404
    if not d.receipt_token:
        d.receipt_token = secrets.token_urlsafe(32)
        db.session.commit()
    base = request.host_url.rstrip('/')
    return jsonify({
        'success': True,
        'url': f'{base}/proximate-receipt?t={d.receipt_token}',
    })
