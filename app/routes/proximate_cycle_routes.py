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
import os
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
    ProximateDisbursement, ProximateEvidence,

    AWARD_DECISIONS, AWARD_METHODS, CONTRACT_STATUSES, MEETING_TYPES,
    ROUND_PHASES, AREA_SOURCES,
)
from app.utils.network import ob_required, get_current_network
from app.utils.helpers import get_request_json
from app.utils.i18n import t, resolve_network_lang, resolve_display_lang

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

    # R-03: the client loads the setup by sending an EMPTY patch (read-via-
    # write, to keep one response shape). Previously this always committed and
    # wrote a 'proximate.cycle.setup' audit-chain entry, so *every page render*
    # minted a phantom "Cycle setup" event and polluted the tamper-evident log.
    # Only record the mutation when this request actually changed the round.
    changed = db.session.is_modified(rnd)
    if changed:
        db.session.commit()
        _audit('proximate.cycle.setup', 'round', rnd.id,
               region=rnd.target_region, locality=rnd.target_locality,
               envelope=rnd.envelope_usd, overhead=rnd.admin_overhead_usd)
    else:
        # No net change (an empty/no-op read patch) — leave the audit chain
        # untouched and don't emit a write.
        db.session.rollback()

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
            days = (today - target).days
            en_msg = (
                f'The target {label} date passed '
                f'{days} day(s) ago. '
                'This is a note, not a block — carry on.'
            )
            # Frontend (cycle-setup-card) renders `message` raw, so localize
            # it server-side to the operator's language.
            key = f'proximate.setup.date_warning.{label}'
            tr = t(key, lang=resolve_display_lang(getattr(rnd, 'network_id', None)), n=days)
            out.append({
                'kind': f'{label}_date_passed',
                'severity': 'warning',
                'days_late': days,
                'message': tr if tr and tr != key else en_msg,
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
        # R-04: separation of the two signatures. The OB cannot record the
        # PARTNER's signature by hand — that let one operator attest both
        # sides. 'partner_signed' is only reached by the partner acting on
        # their own signing link (POST /contract-sign/<token>, which stamps
        # partner_sign_source='partner_portal').
        if status == 'partner_signed' and c.partner_sign_source not in (
            'partner_portal', 'pandadoc',
        ):
            return jsonify({
                'success': False,
                'error': (
                    'The partner signs their own agreement through the signing '
                    'link — share it with them from this contract. The Oversight '
                    'Body cannot record the partner signature on their behalf.'
                ),
                'code': 'err.partner_must_sign',
            }), 422
        # R-04: the agreement is only complete once BOTH sides have signed —
        # an independent partner signature first, then Adeso.
        if status in ('adeso_signed', 'completed') and not c.partner_signed_at:
            return jsonify({
                'success': False,
                'error': (
                    'The partner has not signed yet. Share the signing link and '
                    'wait for their signature before Adeso signs or completes.'
                ),
                'code': 'err.partner_not_signed',
            }), 422
        c.status = status
        stamps = {
            'sent': 'sent_at',
            'partner_signed': 'partner_signed_at',
            'adeso_signed': 'adeso_signed_at',
            'completed': 'completed_at',
        }
        if status in stamps and not getattr(c, stamps[status]):
            setattr(c, stamps[status], _now())

    # R-04: mint the partner's signing token as soon as the agreement is in a
    # signable pre-partner-signed state, so the OB always has a link to share
    # (covers legacy contracts that predate this column too).
    if c.status in ('drafting', 'sent') and not c.partner_sign_token:
        c.partner_sign_token = ProximateContract.make_sign_token()

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

    # 0. Round activation (R-01). Money cannot move until the round itself
    # has been ACTIVATED by the required independent Oversight Body
    # signatures. This is the separation-of-duties control at the point of
    # release; the disbursement endpoint enforces it server-side too.
    rnd = ProximateRound.query.get(round_id)
    if not rnd or rnd.status != 'active':
        blocks.append({
            'code': 'round_not_active',
            'message': (
                'This round has not been activated. It needs the required '
                'Oversight Body signatures and must be Active before any '
                'funds can be released.'
            ),
        })

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
    # Anonymous portal — no logged-in user, so resolve the display language
    # from the host tenant (Proximate is Arabic-first). The token hasn't
    # resolved to a disbursement yet on the error path, so use g.network.
    lang = resolve_network_lang()
    if not token or len(token) < 16:
        return jsonify({'success': False,
                        'error': t('proximate.receipt.invalid_link', lang=lang)}), 404
    d = ProximateDisbursement.query.filter_by(receipt_token=token).first()
    if not d:
        return jsonify({'success': False,
                        'error': t('proximate.receipt.invalid_link', lang=lang)}), 404
    return jsonify({'success': True, 'receipt': _receipt_payload(d)})


@cycle_bp.route('/receipt/<token>', methods=['POST'])
def api_receipt_confirm(token):
    """Public. The partner confirms the money arrived."""
    lang = resolve_network_lang()
    if not token or len(token) < 16:
        return jsonify({'success': False,
                        'error': t('proximate.receipt.invalid_link', lang=lang)}), 404
    d = ProximateDisbursement.query.filter_by(receipt_token=token).first()
    if not d:
        return jsonify({'success': False,
                        'error': t('proximate.receipt.invalid_link', lang=lang)}), 404
    # Once we have the disbursement, prefer its own tenant network for language.
    lang = resolve_network_lang(d.network_id)
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
        'message': t('proximate.receipt.confirmed_thanks', lang=lang),
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


def _report_window_days_for(d: ProximateDisbursement) -> int:
    """Days from receipt to report-due.

    Khalid (29 Jul 2026): reporting is due at the END of the
    implementation period, not on a flat clock started when the money
    lands. When the contract records an implementation duration, the
    report window follows it. The 14-day default only applies when no
    implementation period has been set on the contract yet.
    """
    from app.models.proximate_disbursement import DEFAULT_REPORT_WINDOW_DAYS
    default = DEFAULT_REPORT_WINDOW_DAYS
    if not getattr(d, 'round_id', None):
        return default
    award = ProximateAward.query.filter_by(
        round_id=d.round_id, partner_id=d.partner_id, network_id=d.network_id,
    ).first()
    if not award:
        return default
    contract = ProximateContract.query.filter_by(award_id=award.id).first()
    if contract and contract.duration_days and contract.duration_days > 0:
        return int(contract.duration_days)
    return default


def _apply_receipt(d: ProximateDisbursement, body: dict, source: str) -> None:
    """Write the confirmation and restart the implementation clock.

    The report deadline is recomputed from the date the money ARRIVED,
    not the date it was sent. A partner cannot start work on funds that
    have not landed, and transfers through hawala routinely take days.
    Holding them to a clock that started in transit would penalise them
    for the fund's own payment rails.

    The window itself follows the contract's implementation period, so a
    partner with a 60-day activity is not flagged overdue on day 15 —
    reporting is due when the implementation period ends, not a flat 14
    days after the money lands (Khalid, 29 Jul 2026).
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

    explicit = body.get('report_window_days')
    window = int(explicit) if explicit else _report_window_days_for(d)
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


# ===============================================================
# Staged partner record
# ===============================================================
#
# One partner record, not seven forms. The fields are the same fields
# they always were — what changes is that they are grouped by the stage
# they belong to, and a stage the partner has not reached yet is marked
# `locked` rather than shown as a wall of empty inputs.
#
# The stage definitions live here rather than in the frontend so that
# "what does this cycle require" has one answer, and the donor pack and
# the console cannot drift apart.

PARTNER_STAGES = [
    {
        'key': 'nomination',
        'label': 'Nomination',
        'blurb': 'What the panel member put forward.',
        'fields': [
            ('nomination_rationale', 'Why they were nominated'),
            ('track_record', 'Track record'),
            ('community_credibility', 'Basis of community credibility'),
            ('proposed_activity_idea', 'Proposed activity idea'),
            ('known_risks', 'Known risks or concerns'),
        ],
    },
    {
        'key': 'initial_information',
        'label': 'Partner information',
        'blurb': 'Collected once Proximate makes contact (the PIF).',
        'fields': [
            ('legal_status', 'Legal status'),
            ('registration_number', 'Registration number'),
            ('country_of_registration', 'Country of registration'),
            ('year_established', 'Year established'),
            ('headquarters', 'Headquarters'),
            ('operational_offices', 'Operational offices'),
            ('website_social', 'Website / social media'),
            ('thematic_focus', 'Thematic focus areas'),
            ('target_population', 'Primary target population'),
            ('geographic_areas', 'Geographic areas of operation'),
            ('activities_12m', 'Key activities, last 12 months'),
            ('beneficiaries_reached', 'Beneficiaries reached'),
            ('current_donors', 'Current donor-funded programmes'),
        ],
    },
    {
        'key': 'due_diligence',
        'label': 'Due diligence',
        'blurb': 'What the secretariat checked, and what it found.',
        'fields': [],   # sourced from the DD models, not the intake form
    },
    {
        'key': 'activities',
        'label': 'Proposed activities',
        'blurb': 'What they are asking to do, and for how much.',
        'fields': [
            ('requested_budget', 'Requested budget'),
            ('activity_1', 'Activity 1 — name / type'),
            ('activity_1_description', 'Activity 1 — description'),
            ('activity_2', 'Activity 2 (optional)'),
            ('activity_3', 'Activity 3 (optional)'),
            ('activity_target_population', 'Target population'),
            ('activity_duration', 'Duration'),
            ('admin_cost_pct', 'Administration cost %'),
        ],
    },
    {
        'key': 'award',
        'label': 'Award decision',
        'blurb': 'What the panel decided.',
        'fields': [],   # sourced from ProximateAward
    },
    {
        'key': 'contracting',
        'label': 'Contracting & payment',
        'blurb': 'Only relevant once awarded.',
        'fields': [],   # sourced from ProximateContract
    },
    {
        'key': 'implementation',
        'label': 'Implementation',
        'blurb': 'Money out, evidence in.',
        'fields': [],
    },
    {
        'key': 'reporting',
        'label': 'Reporting',
        'blurb': "The partner's account of what happened.",
        'fields': [],
    },
]


@cycle_bp.route('/partners/<int:partner_id>/stages', methods=['GET'])
@login_required
@ob_required
def api_partner_stages(partner_id):
    """One partner, presented by stage, with each stage's completeness.

    `reached` marks the stages this partner has actually got to. Later
    stages come back `locked` — the fields are named so the secretariat
    can see what is coming, but nothing pretends to be missing data when
    it is simply not that partner's turn yet.
    """
    nid = _net_id()
    # Server-translate the PARTNER_STAGES labels/blurbs/field-labels: the
    # partner-lifecycle card renders them RAW (no t()), so an Arabic OB saw
    # English here (task_2e947f36). Falls back to the English literal — never
    # a raw key — if a translation is missing.
    lang = resolve_display_lang(nid)

    def _lbl(key, fallback):
        v = t(key, lang=lang)
        return fallback if v == key else v

    partner = ProximatePartner.query.filter_by(
        id=partner_id, network_id=nid,
    ).first()
    if not partner:
        return jsonify({'success': False, 'error': 'Partner not found'}), 404

    round_id = request.args.get('round_id', type=int)
    try:
        form = json.loads(partner.intake_form_json) if partner.intake_form_json else {}
        if not isinstance(form, dict):
            form = {}
    except (ValueError, TypeError):
        form = {}

    q = ProximateAward.query.filter_by(partner_id=partner_id, network_id=nid)
    if round_id:
        q = q.filter_by(round_id=round_id)
    award = q.order_by(ProximateAward.created_at.desc()).first()
    contract = (
        ProximateContract.query.filter_by(award_id=award.id).first()
        if award else None
    )

    reached = {'nomination'}
    if form:
        reached.add('initial_information')
    status = (getattr(partner, 'status', '') or '').lower()
    if status in ('dd_pending', 'dd_clear', 'endorsements_open'):
        reached.add('due_diligence')
    if form.get('requested_budget') or form.get('activity_1'):
        reached.add('activities')
    if award:
        reached.add('award')
    if contract:
        reached.add('contracting')

    disbursements = ProximateDisbursement.query.filter_by(
        partner_id=partner_id, network_id=nid,
    ).all()
    if disbursements:
        reached.add('implementation')
    if any(d.report_submitted_at for d in disbursements):
        reached.add('reporting')

    out = []
    for stage in PARTNER_STAGES:
        fields = []
        for fkey, flabel in stage['fields']:
            value = form.get(fkey)
            fields.append({
                'key': fkey,
                'label': _lbl(f'proximate.stage.field.{fkey}', flabel),
                'value': value if value not in ('', None) else None,
                'filled': value not in ('', None),
            })

        derived = None
        if stage['key'] == 'due_diligence':
            derived = {
                'status': partner.status,
                'trust_tier': getattr(partner, 'trust_tier', None),
                'dd_cleared_at': (
                    partner.dd_cleared_at.isoformat()
                    if getattr(partner, 'dd_cleared_at', None) else None
                ),
            }
        elif stage['key'] == 'award' and award:
            derived = award.to_dict(partner.name)
        elif stage['key'] == 'contracting' and contract:
            derived = contract.to_dict()
        elif stage['key'] == 'implementation':
            derived = {
                'disbursements': len(disbursements),
                'receipt_confirmed': sum(
                    1 for d in disbursements if d.receipt_confirmed_at),
                'awaiting_receipt': sum(
                    1 for d in disbursements
                    if d.sent_at and not d.receipt_confirmed_at),
                'evidence_items': ProximateEvidence.query.filter_by(
                    partner_id=partner_id).count(),
                'open_issues': ProximateEvidence.query.filter_by(
                    partner_id=partner_id, is_issue=True, resolved_at=None,
                ).count(),
            }
        elif stage['key'] == 'reporting':
            derived = {
                'reports_due': len(disbursements),
                'reports_in': sum(
                    1 for d in disbursements if d.report_submitted_at),
                'overdue': sum(1 for d in disbursements if d.is_overdue()),
            }

        out.append({
            'key': stage['key'],
            'label': _lbl(f"proximate.stage.{stage['key']}.label", stage['label']),
            'blurb': _lbl(f"proximate.stage.{stage['key']}.blurb", stage['blurb']),
            'reached': stage['key'] in reached,
            'locked': stage['key'] not in reached,
            'fields': fields,
            'filled_count': len([f for f in fields if f['filled']]),
            'field_count': len(fields),
            'derived': derived,
        })

    return jsonify({
        'success': True,
        'partner': {'id': partner.id, 'name': partner.name,
                    'status': partner.status},
        'stages': out,
    })


@cycle_bp.route('/partners/<int:partner_id>/stages', methods=['PATCH'])
@login_required
@ob_required
def api_partner_stage_save(partner_id):
    """Save intake-form fields for one stage.

    Writes into the partner's existing `intake_form_json` rather than a
    new table: the PIF was always stored there, and splitting it now
    would mean two places to look for the same answer.
    """
    nid = _net_id()
    partner = ProximatePartner.query.filter_by(
        id=partner_id, network_id=nid,
    ).first()
    if not partner:
        return jsonify({'success': False, 'error': 'Partner not found'}), 404

    body = get_request_json() or {}
    values = body.get('values')
    if not isinstance(values, dict):
        return jsonify({'success': False, 'error': 'values object required'}), 400

    known = {f[0] for s in PARTNER_STAGES for f in s['fields']}
    try:
        form = json.loads(partner.intake_form_json) if partner.intake_form_json else {}
        if not isinstance(form, dict):
            form = {}
    except (ValueError, TypeError):
        form = {}

    changed = []
    for k, v in values.items():
        if k not in known:
            continue          # ignore anything not on a declared stage
        form[k] = v
        changed.append(k)
    partner.intake_form_json = json.dumps(form, ensure_ascii=False)
    db.session.commit()
    _audit('proximate.partner.stage_saved', 'partner', partner.id, fields=changed)
    return jsonify({'success': True, 'saved': changed})


# ===============================================================
# Evidence inbox
# ===============================================================

@cycle_bp.route('/partners/<int:partner_id>/evidence', methods=['GET'])
@login_required
@ob_required
def api_evidence_list(partner_id):
    nid = _net_id()
    partner = ProximatePartner.query.filter_by(
        id=partner_id, network_id=nid,
    ).first()
    if not partner:
        return jsonify({'success': False, 'error': 'Partner not found'}), 404
    rows = ProximateEvidence.query.filter_by(
        partner_id=partner_id, network_id=nid,
    ).order_by(
        ProximateEvidence.occurred_at.desc().nullslast(),
        ProximateEvidence.created_at.desc(),
    ).limit(200).all()
    items = [r.to_dict() for r in rows]
    return jsonify({
        'success': True,
        'evidence': items,
        'summary': {
            'total': len(items),
            'open_issues': len([i for i in items if i['is_open_issue']]),
            'needs_followup': len([i for i in items if i['needs_followup']]),
            'needs_panel': len([i for i in items if i['needs_panel']]),
        },
    })


@cycle_bp.route('/partners/<int:partner_id>/evidence', methods=['POST'])
@login_required
@ob_required
def api_evidence_add(partner_id):
    """Log something that arrived — with or without a file.

    A phone call has no attachment. Requiring one would mean the most
    common kind of contact never gets recorded, which is exactly how a
    partner record ends up looking emptier than the relationship is.
    """
    nid = _net_id()
    partner = ProximatePartner.query.filter_by(
        id=partner_id, network_id=nid,
    ).first()
    if not partner:
        return jsonify({'success': False, 'error': 'Partner not found'}), 404

    body = get_request_json() or {}
    summary = (body.get('summary') or '').strip()
    if not summary and not body.get('document_id'):
        return jsonify({
            'success': False,
            'error': 'Add a note or attach a file — one or the other.',
        }), 400

    occurred = None
    if body.get('occurred_at'):
        try:
            occurred = datetime.fromisoformat(
                str(body['occurred_at']).replace('Z', '+00:00'))
        except (ValueError, TypeError):
            occurred = None

    e = ProximateEvidence(
        network_id=nid,
        partner_id=partner_id,
        round_id=body.get('round_id') or None,
        disbursement_id=body.get('disbursement_id') or None,
        occurred_at=occurred or _now(),
        source=(body.get('source') or 'whatsapp')[:20],
        kind=(body.get('kind') or 'progress_update')[:30],
        summary=summary or None,
        document_id=body.get('document_id') or None,
        is_issue=bool(body.get('is_issue')),
        needs_followup=bool(body.get('needs_followup')),
        needs_panel=bool(body.get('needs_panel')),
        recorded_by_user_id=getattr(current_user, 'id', None),
    )
    db.session.add(e)
    db.session.commit()
    _audit('proximate.evidence.recorded', 'partner', partner_id,
           source=e.source, kind=e.kind, is_issue=bool(e.is_issue))
    return jsonify({'success': True, 'evidence': e.to_dict()}), 201


@cycle_bp.route('/evidence/<int:evidence_id>', methods=['PATCH'])
@login_required
@ob_required
def api_evidence_update(evidence_id):
    nid = _net_id()
    e = ProximateEvidence.query.filter_by(id=evidence_id, network_id=nid).first()
    if not e:
        return jsonify({'success': False, 'error': 'Not found'}), 404
    body = get_request_json() or {}
    for f in ('summary', 'resolution_note'):
        if f in body:
            setattr(e, f, (body.get(f) or None))
    for f in ('is_issue', 'needs_followup', 'needs_panel'):
        if f in body:
            setattr(e, f, bool(body.get(f)))
    if 'resolved' in body:
        e.resolved_at = _now() if body.get('resolved') else None
    db.session.commit()
    _audit('proximate.evidence.updated', 'partner', e.partner_id,
           evidence_id=e.id, resolved=bool(e.resolved_at))
    return jsonify({'success': True, 'evidence': e.to_dict()})


# ===============================================================
# Partner history
# ===============================================================

@cycle_bp.route('/partners/<int:partner_id>/history', methods=['GET'])
@login_required
@ob_required
def api_partner_history(partner_id):
    """Everything this partner has done with the fund, across all cycles.

    Facts, not a score. There is deliberately no single number here.

    A "reliability rating" built from report timeliness would, in Sudan,
    be measuring connectivity and conflict as much as diligence — and a
    number on a partner card becomes a funding gate by accident, against
    exactly the organisations this fund exists to reach. The underlying
    facts are all present so a human can weigh them with the context
    only a human has.
    """
    nid = _net_id()
    partner = ProximatePartner.query.filter_by(
        id=partner_id, network_id=nid,
    ).first()
    if not partner:
        return jsonify({'success': False, 'error': 'Partner not found'}), 404

    awards = ProximateAward.query.filter_by(
        partner_id=partner_id, network_id=nid,
    ).order_by(ProximateAward.created_at.asc()).all()
    disbs = ProximateDisbursement.query.filter_by(
        partner_id=partner_id, network_id=nid,
    ).all()
    contracts = ProximateContract.query.filter_by(
        partner_id=partner_id, network_id=nid,
    ).all()
    # ProximateRoundParticipant has no network_id column — it is scoped
    # through the partner, which we have already confirmed belongs to nid.
    participants = ProximateRoundParticipant.query.filter_by(
        partner_id=partner_id,
    ).all()
    ev = ProximateEvidence.query.filter_by(
        partner_id=partner_id, network_id=nid).all()

    # ---- resolve actor names once (id -> display name) ----------------
    user_ids = set()
    for a in awards:
        if a.recorded_by_user_id:
            user_ids.add(a.recorded_by_user_id)
    for c in contracts:
        if c.created_by_user_id:
            user_ids.add(c.created_by_user_id)
    for d in disbs:
        if getattr(d, 'sent_by_user_id', None):
            user_ids.add(d.sent_by_user_id)
    for p in participants:
        if p.added_by_user_id:
            user_ids.add(p.added_by_user_id)
    for e in ev:
        if e.recorded_by_user_id:
            user_ids.add(e.recorded_by_user_id)
    if getattr(partner, 'nominated_by_user_id', None):
        user_ids.add(partner.nominated_by_user_id)
    names = {}
    if user_ids:
        from app.models import User
        for u in User.query.filter(User.id.in_(list(user_ids))).all():
            names[u.id] = u.name or u.email

    def _who(uid):
        return names.get(uid) if uid else None

    def _iso(dt):
        if not dt:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()

    # Widen the round set: the roster (participant), awards, disbursements,
    # contracts, and evidence — so a round where the partner was nominated
    # or vetted but never awarded is still visible.
    round_ids = {a.round_id for a in awards}
    round_ids |= {d.round_id for d in disbs if d.round_id}
    round_ids |= {p.round_id for p in participants if p.round_id}
    round_ids |= {c.round_id for c in contracts if c.round_id}
    round_ids |= {e.round_id for e in ev if e.round_id}
    round_ids.discard(None)
    rounds = {}
    if round_ids:
        for r in ProximateRound.query.filter(
            ProximateRound.id.in_(list(round_ids))
        ).all():
            rounds[r.id] = r

    # ---- partner-level lifetime timeline (nomination + due diligence) --
    partner_timeline = []

    def _padd(dt, type_, detail, actor=None, **extra):
        if dt:
            item = {'ts': _iso(dt), 'type': type_, 'detail': detail}
            if actor:
                item['actor'] = actor
            item.update({k: v for k, v in extra.items() if v is not None})
            partner_timeline.append(item)

    _padd(getattr(partner, 'nominated_at', None), 'nominated',
          'Nominated to the fund',
          actor=_who(getattr(partner, 'nominated_by_user_id', None)))
    _padd(getattr(partner, 'sanctions_checked_at', None), 'sanctions_checked',
          ('Sanctions / watchlist screened — flag raised'
           if getattr(partner, 'sanctions_flag', False)
           else 'Sanctions / watchlist screened — clear'),
          is_issue=bool(getattr(partner, 'sanctions_flag', False)) or None)
    _padd(getattr(partner, 'bank_verified_at', None), 'bank_verified',
          'Payment route verified')
    _padd(getattr(partner, 'dd_cleared_at', None), 'dd_cleared',
          'Cleared for funding (due diligence complete)')
    for e in ev:
        if not e.round_id:
            _padd(e.occurred_at or e.created_at, 'evidence',
                  (e.summary or (e.kind or 'evidence').replace('_', ' ')),
                  actor=_who(e.recorded_by_user_id),
                  is_issue=bool(e.is_issue) or None, kind=e.kind)
    partner_timeline.sort(key=lambda x: x['ts'] or '')

    # ---- per-round event timeline -------------------------------------
    rounds_out = []
    for rid in sorted(round_ids):
        r = rounds.get(rid)
        a = next((x for x in awards if x.round_id == rid), None)
        tl = []

        def _add(dt, type_, detail, actor=None, **extra):
            if dt:
                item = {'ts': _iso(dt), 'type': type_, 'detail': detail}
                if actor:
                    item['actor'] = actor
                item.update({k: v for k, v in extra.items() if v is not None})
                tl.append(item)

        for p in participants:
            if p.round_id == rid:
                _add(p.added_at, 'nominated', 'Added to this round',
                     actor=_who(p.added_by_user_id))
        if a:
            adt = a.decided_at or a.created_at
            if a.decision == 'awarded':
                _add(adt, 'awarded', 'Awarded by the panel',
                     actor=_who(a.recorded_by_user_id),
                     requested_usd=a.requested_amount_usd,
                     approved_usd=a.approved_amount_usd,
                     decision_method=a.decision_method)
            elif a.decision == 'not_awarded':
                _add(adt, 'not_awarded', 'Not awarded this round',
                     actor=_who(a.recorded_by_user_id),
                     requested_usd=a.requested_amount_usd)
            else:
                _add(adt, 'award_pending', 'Award decision pending',
                     requested_usd=a.requested_amount_usd)
        for c in contracts:
            if c.round_id == rid or (a and c.award_id == a.id):
                _add(c.created_at, 'contract_opened', 'Contract opened',
                     actor=_who(c.created_by_user_id))
                if c.is_complete:
                    _add(c.completed_at or c.adeso_signed_at,
                         'contract_signed', 'Contract signed & complete')
                elif c.partner_signed_at:
                    _add(c.partner_signed_at, 'contract_partner_signed',
                         'Partner signed the contract')
        for d in disbs:
            if d.round_id != rid:
                continue
            _add(d.sent_at, 'disbursed', 'Funds disbursed',
                 actor=_who(getattr(d, 'sent_by_user_id', None)),
                 amount_usd=d.amount_usd)
            _add(d.receipt_confirmed_at, 'receipt_confirmed',
                 'Receipt confirmed by partner', amount_usd=d.receipt_amount)
            if d.report_submitted_at:
                on_time_flag = None
                if d.report_due_at:
                    due, sub = d.report_due_at, d.report_submitted_at
                    if due.tzinfo is None:
                        due = due.replace(tzinfo=timezone.utc)
                    if sub.tzinfo is None:
                        sub = sub.replace(tzinfo=timezone.utc)
                    on_time_flag = sub <= due
                _add(d.report_submitted_at, 'report_submitted',
                     'Partner report submitted', on_time=on_time_flag)
        for e in ev:
            if e.round_id == rid:
                _add(e.occurred_at or e.created_at, 'evidence',
                     (e.summary or (e.kind or 'evidence').replace('_', ' ')),
                     actor=_who(e.recorded_by_user_id),
                     is_issue=bool(e.is_issue) or None, kind=e.kind)
        if r and getattr(r, 'closed_at', None):
            _add(r.closed_at, 'closeout',
                 'Round closed by the fund manager')
        tl.sort(key=lambda x: x['ts'] or '')
        rounds_out.append({
            'round_id': rid,
            'round_title': r.title if r else None,
            'region': r.target_region if r else None,
            'decision': a.decision if a else None,
            'requested_amount_usd': a.requested_amount_usd if a else None,
            'approved_amount_usd': a.approved_amount_usd if a else None,
            'closeout': {
                'status': r.status if r else None,
                'closed_at': (
                    _iso(r.closed_at)
                    if (r and getattr(r, 'closed_at', None)) else None
                ),
            },
            'timeline': tl,
        })

    # ---- backward-compatible per-round stats (cycles) ------------------
    cycles = []
    for rid in sorted(round_ids):
        r = rounds.get(rid)
        a = next((x for x in awards if x.round_id == rid), None)
        ds = [d for d in disbs if d.round_id == rid]
        cycles.append({
            'round_id': rid,
            'round_title': r.title if r else None,
            'region': r.target_region if r else None,
            'decision': a.decision if a else None,
            'requested_amount_usd': a.requested_amount_usd if a else None,
            'approved_amount_usd': a.approved_amount_usd if a else None,
            'disbursements': len(ds),
            'total_sent_usd': float(sum(float(d.amount_usd or 0) for d in ds)),
            'receipts_confirmed': sum(1 for d in ds if d.receipt_confirmed_at),
            'reports_in': sum(1 for d in ds if d.report_submitted_at),
        })

    lags = []
    for d in disbs:
        if d.sent_at and d.received_at:
            lags.append(max(0, (d.received_at - d.sent_at).days))

    on_time = late = 0
    for d in disbs:
        if not d.report_submitted_at or not d.report_due_at:
            continue
        due, sub = d.report_due_at, d.report_submitted_at
        if due.tzinfo is None:
            due = due.replace(tzinfo=timezone.utc)
        if sub.tzinfo is None:
            sub = sub.replace(tzinfo=timezone.utc)
        if sub <= due:
            on_time += 1
        else:
            late += 1

    return jsonify({
        'success': True,
        'partner': {'id': partner.id, 'name': partner.name,
                    'name_ar': getattr(partner, 'name_ar', None),
                    'status': partner.status,
                    'locality': getattr(partner, 'locality', None),
                    'nominated_at': _iso(getattr(partner, 'nominated_at', None)),
                    'dd_cleared_at': _iso(getattr(partner, 'dd_cleared_at', None)),
                    'bank_verified_at': _iso(
                        getattr(partner, 'bank_verified_at', None)),
                    'sanctions_flag': bool(
                        getattr(partner, 'sanctions_flag', False))},
        'partner_timeline': partner_timeline,
        'rounds': rounds_out,
        'cycles': cycles,
        'observations': {
            'cycles_participated': len(cycles),
            'times_awarded': len([c for c in cycles if c['decision'] == 'awarded']),
            'times_not_awarded': len(
                [c for c in cycles if c['decision'] == 'not_awarded']),
            'total_awarded_usd': float(sum(
                float(a.approved_amount_usd or 0) for a in awards
                if a.decision == 'awarded')),
            'total_sent_usd': float(sum(float(d.amount_usd or 0) for d in disbs)),
            'receipts_confirmed': sum(1 for d in disbs if d.receipt_confirmed_at),
            'receipts_outstanding': sum(
                1 for d in disbs if d.sent_at and not d.receipt_confirmed_at),
            'median_receipt_lag_days': (
                sorted(lags)[len(lags) // 2] if lags else None),
            'reports_on_time': on_time,
            'reports_late': late,
            'reports_outstanding': sum(
                1 for d in disbs if not d.report_submitted_at),
            'evidence_items': len(ev),
            'open_issues': len([x for x in ev if x.is_open_issue]),
        },
        'note': (
            'These are observations, not a rating. Report timing in Sudan '
            'reflects connectivity and conflict as much as diligence — read '
            'them alongside what you know about the context.'
        ),
    })


# ===============================================================
# Cycle closeout pack
# ===============================================================

def cycle_state(rnd):
    """Load a cycle's records and work out what is still outstanding.

    This is the ONE place the closeout rule lives. It was previously
    inline in the closeout endpoint, which meant the close action could
    — and did — let a cycle be closed while the closeout pack still
    reported blockers. Two answers to "is this cycle finished?" is one
    answer too many, so both callers now come here.
    """
    awards = ProximateAward.query.filter_by(round_id=rnd.id).all()
    contracts = {
        c.award_id: c
        for c in ProximateContract.query.filter_by(round_id=rnd.id).all()
    }
    disbs = ProximateDisbursement.query.filter_by(round_id=rnd.id).all()
    meetings = ProximatePanelMeeting.query.filter_by(round_id=rnd.id).all()
    panel = ProximatePanelCandidate.query.filter_by(round_id=rnd.id).all()

    awarded = [a for a in awards if a.decision == 'awarded']
    partner_names = {}
    pids = {a.partner_id for a in awards} | {d.partner_id for d in disbs}
    if pids:
        for p in ProximatePartner.query.filter(
            ProximatePartner.id.in_(list(pids))
        ).all():
            partner_names[p.id] = p.name

    # Display strings (`what`) are localized to the operator's language so the
    # closeout tab AND the closeout PDF read in Arabic on an Arabic-first tenant.
    # severity/partner drive logic and stay language-neutral.
    lang = resolve_display_lang(getattr(rnd, 'network_id', None))

    def _w(key, **p):
        return t(key, lang=lang, **p)

    outstanding = []
    for a in awarded:
        nm = partner_names.get(a.partner_id, f'Partner #{a.partner_id}')
        c = contracts.get(a.id)
        if not c or not c.is_complete:
            outstanding.append({'partner': nm,
                                'what': _w('proximate.closeout.what.agreement_incomplete'),
                                'severity': 'block'})
        if not a.decision_is_attributable:
            outstanding.append({
                'partner': nm,
                'what': _w('proximate.closeout.what.award_unattributable'),
                'severity': 'warn'})
    for d in disbs:
        nm = partner_names.get(d.partner_id, f'Partner #{d.partner_id}')
        if d.sent_at and not d.receipt_confirmed_at:
            outstanding.append({'partner': nm,
                                'what': _w('proximate.closeout.what.receipt_unconfirmed'),
                                'severity': 'block'})
        if not d.report_submitted_at:
            outstanding.append({
                'partner': nm, 'what': _w('proximate.closeout.what.report_missing'),
                'severity': 'block' if d.is_overdue() else 'warn'})

    held = {m.meeting_type for m in meetings}
    for required in ('orientation', 'nomination_review', 'awarding'):
        if required not in held:
            outstanding.append({
                'partner': None,
                'what': _w('proximate.closeout.what.no_meeting',
                           v=_w(f'proximate.closeout.meeting.{required}')),
                'severity': 'warn'})

    open_issues = ProximateEvidence.query.filter_by(
        round_id=rnd.id, is_issue=True, resolved_at=None,
    ).count()
    if open_issues:
        outstanding.append({
            'partner': None,
            'what': _w('proximate.closeout.what.open_issues', n=open_issues),
            'severity': 'warn'})

    # R-06: lifecycle prerequisites. The outstanding list is built by walking
    # the awards / disbursements / meetings that EXIST — so an untouched round
    # (no awards, never activated) generates no blockers and would report
    # itself "ready to close" the moment it is created. "Nothing outstanding
    # because nothing has happened" is not "finished". A cycle can only be
    # closed out once it has actually run: it must have been activated, and it
    # must have awarded at least one partner. These are hard blocks.
    if rnd.status not in ('active', 'closed'):
        outstanding.insert(0, {
            'partner': None,
            'what': _w('proximate.closeout.what.not_active',
                       status=_w(f'proximate.status.{rnd.status}')),
            'severity': 'block'})
    if not awarded:
        outstanding.insert(0, {
            'partner': None,
            'what': _w('proximate.closeout.what.no_awards'),
            'severity': 'block'})

    blocks = [o for o in outstanding if o['severity'] == 'block']
    return {
        'awards': awards, 'awarded': awarded, 'contracts': contracts,
        'disbs': disbs, 'meetings': meetings, 'panel': panel,
        'partner_names': partner_names,
        'outstanding': outstanding, 'blocks': blocks,
    }


@cycle_bp.route('/rounds/<int:round_id>/closeout', methods=['GET'])
@login_required
@ob_required
def api_cycle_closeout(round_id):
    """Everything needed to close a cycle, and what is still open.

    The outstanding list is the point. A closeout that only summarised
    what went well would let a cycle be declared finished with three
    partners still unpaid.
    """
    rnd = _scoped_round(round_id)
    if not rnd:
        return jsonify({'success': False, 'error': 'Round not found'}), 404

    st = cycle_state(rnd)
    awards, awarded = st['awards'], st['awarded']
    disbs, meetings, panel = st['disbs'], st['meetings'], st['panel']
    outstanding, blocks = st['outstanding'], st['blocks']

    return jsonify({
        'success': True,
        'cycle': _round_setup_dict(rnd),
        'panel': {
            'total': len(panel),
            'confirmed': len([p for p in panel if p.status == 'confirmed']),
            'localities': sorted({
                (p.location or '').strip() for p in panel
                if p.status == 'confirmed' and (p.location or '').strip()
            }),
        },
        'meetings': [m.to_dict() for m in meetings],
        'awards': {
            'considered': len(awards),
            'awarded': len(awarded),
            'not_awarded': len([a for a in awards if a.decision == 'not_awarded']),
            'total_approved_usd': float(sum(
                float(a.approved_amount_usd or 0) for a in awarded)),
        },
        'money': rnd.money_summary(),
        'disbursements': {
            'count': len(disbs),
            'total_sent_usd': float(sum(float(d.amount_usd or 0) for d in disbs)),
            'receipts_confirmed': sum(1 for d in disbs if d.receipt_confirmed_at),
            'reports_in': sum(1 for d in disbs if d.report_submitted_at),
        },
        'outstanding': outstanding,
        'ready_to_close': not blocks,
        'blocking_count': len(blocks),
        # A cycle that is already closed must not keep reading as "not
        # ready" with no explanation — that was the split-brain the QA
        # caught. If it was closed over the top of blockers, say so, name
        # who accepted them and why, and show what they were on the day.
        'closed': rnd.status == 'closed',
        'closed_at': rnd.closed_at.isoformat() if rnd.closed_at else None,
        'closed_over_blockers': rnd.closed_over_blockers,
        'close_override_reason': rnd.close_override_reason,
        'close_blockers_at_close': rnd.close_blockers(),
    })


# ===============================================================
# Panel-member CV
# ===============================================================

@cycle_bp.route('/panel/<int:member_id>/cv', methods=['POST'])
@login_required
@ob_required
def api_panel_cv(member_id):
    """Link an already-uploaded document as this member's CV.

    The upload itself goes through the existing /api/proximate/attachments
    endpoint (subject_kind='panel_candidate'); this links the resulting
    document so the roster can show at a glance who has one — which is
    what the SoP's CV-review requirement needs to be checkable.
    """
    nid = _net_id()
    m = ProximatePanelCandidate.query.filter_by(
        id=member_id, network_id=nid,
    ).first()
    if not m:
        return jsonify({'success': False, 'error': 'Panel member not found'}), 404
    body = get_request_json() or {}
    doc_id = body.get('document_id')
    if not doc_id:
        return jsonify({'success': False, 'error': 'document_id required'}), 400
    m.cv_doc_id = doc_id
    db.session.commit()
    _audit('proximate.panel.cv_linked', 'panel_member', m.id, document_id=doc_id)
    return jsonify({'success': True, 'member': m.to_dict()})


# ===============================================================
# Money split from the donor agreements
# ===============================================================

@cycle_bp.route('/rounds/<int:round_id>/money-from-grants', methods=['POST'])
@login_required
@ob_required
def api_money_from_grants(round_id):
    """Propose the cycle's money split from the linked donor grants.

    Reads what was allocated to this cycle and — where the donor
    agreement has been through AI extraction — what that document said
    about administration and overhead.

    It PROPOSES. Nothing is written unless the caller passes
    `apply: true`, because an extracted number is a reading of a PDF, and
    a reading of a PDF should not silently become the ceiling on what
    partners can be paid.
    """
    rnd = _scoped_round(round_id)
    if not rnd:
        return jsonify({'success': False, 'error': 'Round not found'}), 404

    from app.models import ProximateGrantAllocation, ProximateGrant

    allocs = ProximateGrantAllocation.query.filter_by(round_id=rnd.id).all()
    allocated = float(sum(float(a.amount_usd or 0) for a in allocs))

    overhead_hint = 0.0
    sources = []
    for a in allocs:
        g = ProximateGrant.query.get(a.grant_id) if a.grant_id else None
        if not g:
            continue
        entry = {
            'grant_id': g.id,
            'title': g.title,
            'donor': g.donor_name_cache,
            'allocated_usd': float(a.amount_usd or 0),
            'committed_usd': float(g.amount_committed_usd or 0),
            'received_usd': float(g.amount_received_usd or 0),
            'overhead_from_agreement': None,
        }
        try:
            ex = json.loads(g.extracted_json) if g.extracted_json else {}
        except (ValueError, TypeError):
            ex = {}
        if isinstance(ex, dict):
            for key in ('admin_overhead_usd', 'overhead_usd',
                        'indirect_cost_usd', 'administration_usd'):
                if not ex.get(key):
                    continue
                try:
                    share = float(ex[key])
                except (TypeError, ValueError):
                    continue
                # Scale the agreement's overhead to this cycle's slice of
                # the grant — a grant split across three cycles must not
                # charge each of them the full amount.
                committed = float(g.amount_committed_usd or 0)
                if committed > 0 and a.amount_usd:
                    share = share * (float(a.amount_usd) / committed)
                entry['overhead_from_agreement'] = round(share, 2)
                overhead_hint += share
                break
        sources.append(entry)

    proposal = {
        'envelope_usd': allocated or float(rnd.envelope_usd or 0),
        'admin_overhead_usd': round(overhead_hint, 2) if overhead_hint else None,
        'sources': sources,
    }
    if proposal['admin_overhead_usd'] is None:
        proposal['note'] = (
            'No administration figure was found in the donor agreements. '
            'Enter it by hand — the envelope is not what partners can '
            'receive, and leaving it at zero would say that it is.'
        )

    body = get_request_json() or {}
    if body.get('apply'):
        if proposal['envelope_usd']:
            rnd.envelope_usd = proposal['envelope_usd']
        if proposal['admin_overhead_usd'] is not None:
            rnd.admin_overhead_usd = proposal['admin_overhead_usd']
        db.session.commit()
        _audit('proximate.cycle.money_from_grants', 'round', rnd.id,
               envelope=rnd.envelope_usd, overhead=rnd.admin_overhead_usd)
        return jsonify({'success': True, 'applied': True,
                        'money': rnd.money_summary(), 'proposal': proposal})

    return jsonify({'success': True, 'applied': False,
                    'proposal': proposal, 'money': rnd.money_summary()})


# ===============================================================
# Closeout pack — server-rendered PDF
# ===============================================================

@cycle_bp.route('/rounds/<int:round_id>/closeout.pdf', methods=['GET'])
@login_required
@ob_required
def api_cycle_closeout_pdf(round_id):
    """The closeout pack as a real PDF, not a browser print.

    A donor-facing artefact should not depend on which browser the
    secretariat happened to use, or on print CSS surviving the next
    layout change. Arabic renders through the same shaping path as the
    partner report pack — Amiri, reshaped and bidi-ordered — so a cycle
    run in Arabic produces an Arabic pack.
    """
    rnd = _scoped_round(round_id)
    if not rnd:
        return jsonify({'success': False, 'error': 'Round not found'}), 404

    import io as _io
    from flask import send_file
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas as _canvas
    from app.utils.arabic_pdf import ensure_arabic_fonts, has_arabic, shape_ar

    data = api_cycle_closeout(round_id).get_json()
    if not data or not data.get('success'):
        return jsonify({'success': False, 'error': 'Could not build pack'}), 500

    arabic_ok = False
    try:
        arabic_ok = ensure_arabic_fonts()
    except Exception:
        arabic_ok = False

    lang = resolve_display_lang(getattr(rnd, 'network_id', None))

    def _t(key, **p):
        return t(key, lang=lang, **p)

    buf = _io.BytesIO()
    c = _canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    L, R = 18 * mm, W - 18 * mm
    y = H - 20 * mm

    def line(text, *, size=10, bold=False, gap=5.5, colour=(0.1, 0.1, 0.1)):
        nonlocal y
        if y < 25 * mm:
            c.showPage()
            y = H - 20 * mm
        text = str(text or '')
        c.setFillColorRGB(*colour)
        if arabic_ok and has_arabic(text):
            c.setFont('Amiri-Bold' if bold else 'Amiri', size)
            c.drawRightString(R, y, shape_ar(text))
        else:
            c.setFont('Helvetica-Bold' if bold else 'Helvetica', size)
            c.drawString(L, y, text)
        y -= (size + gap)

    def rule():
        nonlocal y
        c.setStrokeColorRGB(0.85, 0.85, 0.85)
        c.line(L, y + 3, R, y + 3)
        y -= 6

    cyc = data['cycle']
    line(cyc.get('title') or f'Cycle #{round_id}', size=16, bold=True, gap=3)
    where = ', '.join(x for x in [cyc.get('target_locality'),
                                  cyc.get('target_region')] if x)
    line(where or '—', size=10, colour=(0.45, 0.45, 0.45))
    rule()

    # Readiness first. If the pack opens with a summary of what went well,
    # a cycle can be signed off with partners still unpaid.
    if data.get('closed_over_blockers'):
        # The most important line in the document. A donor reading this pack
        # is entitled to know the cycle was signed off with open items, what
        # they were, and on what stated grounds — before any of the numbers.
        line(_t('proximate.closeout.pdf.closed_unfinished'),
             bold=True, size=12, colour=(0.7, 0.1, 0.1))
        line(_t('proximate.closeout.pdf.reason_given',
                v=data.get("close_override_reason") or "—"),
             size=9, colour=(0.35, 0.1, 0.1))
        for o in (data.get('close_blockers_at_close') or []):
            line(f'  • {_t("proximate.closeout.pdf.unresolved_at_close")}: '
                 f'{(o.get("partner") + ": ") if o.get("partner") else ""}'
                 f'{o.get("what")}', size=9, colour=(0.5, 0.15, 0.15))
        y -= 4
    elif data['ready_to_close']:
        line(_t('proximate.closeout.pdf.nothing_blocking'), bold=True)
    else:
        line(_t('proximate.closeout.pdf.items_first', n=data["blocking_count"]),
             bold=True, colour=(0.7, 0.1, 0.1))
    y -= 4

    blocks = [o for o in data['outstanding'] if o['severity'] == 'block']
    warns = [o for o in data['outstanding'] if o['severity'] != 'block']
    if blocks:
        line(_t('proximate.closeout.pdf.must_resolve'), bold=True, size=11)
        for o in blocks:
            line(f'  • {(o["partner"] + ": ") if o["partner"] else ""}{o["what"]}',
                 size=9, colour=(0.6, 0.1, 0.1))
        y -= 4
    if warns:
        line(_t('proximate.closeout.pdf.worth_noting'), bold=True, size=11)
        for o in warns:
            line(f'  • {(o["partner"] + ": ") if o["partner"] else ""}{o["what"]}',
                 size=9, colour=(0.5, 0.35, 0.05))
        y -= 4

    rule()
    line(_t('proximate.closeout.pdf.summary'), bold=True, size=11)
    m = data['money']
    _receipts = _t('proximate.closeout.pdf.n_of_m',
                   a=data["disbursements"]["receipts_confirmed"],
                   b=data["disbursements"]["count"])
    for label, value in [
        (_t('proximate.closeout.pdf.panel_seated'), data['panel']['confirmed']),
        (_t('proximate.closeout.pdf.localities'), len(data['panel']['localities'])),
        (_t('proximate.closeout.pdf.meetings'), len(data['meetings'])),
        (_t('proximate.closeout.pdf.considered'), data['awards']['considered']),
        (_t('proximate.closeout.pdf.awarded'), data['awards']['awarded']),
        (_t('proximate.closeout.pdf.total_approved'), f'${data["awards"]["total_approved_usd"]:,.0f}'),
        (_t('proximate.closeout.pdf.total_sent'), f'${data["disbursements"]["total_sent_usd"]:,.0f}'),
        (_t('proximate.closeout.pdf.receipts_confirmed'), _receipts),
        (_t('proximate.closeout.pdf.donor_envelope'), f'${m["envelope_usd"]:,.0f}'),
        (_t('proximate.closeout.pdf.administration'), f'${m["admin_overhead_usd"]:,.0f}'),
        (_t('proximate.closeout.pdf.available_partners'), f'${m["disbursable_usd"]:,.0f}'),
        (_t('proximate.closeout.pdf.unspent'), f'${m["uncommitted_usd"]:,.0f}'),
    ]:
        line(f'  {label}: {value}', size=9)

    if data['panel']['localities']:
        y -= 4
        line(_t('proximate.closeout.pdf.panel_from',
                v=', '.join(data['panel']['localities'])),
             size=9, colour=(0.45, 0.45, 0.45))

    c.showPage()
    c.save()
    buf.seek(0)
    _audit('proximate.cycle.closeout_pdf', 'round', rnd.id,
           ready=data['ready_to_close'], blocking=data['blocking_count'])
    return send_file(
        buf, mimetype='application/pdf', as_attachment=True,
        download_name=f'closeout-cycle-{round_id}.pdf',
    )


# ===============================================================
# Cron — cycles gone quiet during implementation
# ===============================================================

@cycle_bp.route('/cron/stale-implementation', methods=['POST'])
def api_cron_stale_implementation():
    """Flag partners who have had money for a while with nothing logged.

    Silence is the signal this catches. A partner mid-implementation who
    has sent nothing for weeks is either fine and busy, or in trouble —
    and the difference is exactly what somebody should go and find out.

    It records observations for the secretariat; it does not message
    partners and it does not change any partner's status. Being hard to
    reach in Sudan is not misconduct, and this must never read as an
    accusation.
    """
    secret = os.getenv('CRON_SECRET')
    auth = request.headers.get('Authorization', '')
    if not secret or auth != f'Bearer {secret}':
        return jsonify({'success': False, 'error': 'unauthorized'}), 401

    body = get_request_json() or {}
    quiet_days = int(body.get('quiet_days') or 14)
    cutoff = _now() - timedelta(days=quiet_days)

    from app.models import Network
    net = Network.query.filter_by(slug='proximate').first()
    if not net:
        return jsonify({'success': True, 'considered': 0, 'flagged': 0,
                        'note': 'proximate tenant not present'})

    # Disbursed, receipt confirmed, report not yet in — the window where
    # a partner is actually implementing and should be in contact.
    live = ProximateDisbursement.query.filter(
        ProximateDisbursement.network_id == net.id,
        ProximateDisbursement.receipt_confirmed_at.isnot(None),
        ProximateDisbursement.report_submitted_at.is_(None),
    ).all()

    considered = flagged = 0
    quiet = []
    for d in live:
        considered += 1
        start = d.implementation_start_at or d.received_at or d.sent_at
        if not start:
            continue
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        if start > cutoff:
            continue      # not yet quiet long enough

        latest = ProximateEvidence.query.filter_by(
            partner_id=d.partner_id, network_id=net.id,
        ).order_by(ProximateEvidence.occurred_at.desc().nullslast()).first()
        last_at = latest.occurred_at if latest else None
        if last_at and last_at.tzinfo is None:
            last_at = last_at.replace(tzinfo=timezone.utc)
        if last_at and last_at > cutoff:
            continue      # they have been in touch

        # Don't stack duplicates: if an unresolved quiet flag is already
        # open for this partner, leave it alone rather than adding a new
        # one every time the cron runs.
        existing = ProximateEvidence.query.filter_by(
            partner_id=d.partner_id, network_id=net.id,
            kind='issue', resolved_at=None,
        ).filter(ProximateEvidence.summary.like('No contact logged%')).first()
        if existing:
            continue

        days = (_now() - (last_at or start)).days
        e = ProximateEvidence(
            network_id=net.id,
            partner_id=d.partner_id,
            round_id=d.round_id,
            disbursement_id=d.id,
            occurred_at=_now(),
            source='other',
            kind='issue',
            summary=(
                f'No contact logged for {days} days since '
                f'{"the last update" if last_at else "funds were received"}. '
                'Worth a call — this is a prompt to check in, not a finding '
                'against the partner.'
            ),
            is_issue=True,
            needs_followup=True,
        )
        db.session.add(e)
        flagged += 1
        quiet.append({'partner_id': d.partner_id, 'disbursement_id': d.id,
                      'quiet_days': days})

    db.session.commit()
    try:
        from app.models import record_cron_run
        record_cron_run('proximate-stale-implementation', status='success',
                        detail=f'{flagged} flagged of {considered}')
    except Exception:
        db.session.rollback()

    _audit('proximate.cron.stale_implementation', 'round', None,
           considered=considered, flagged=flagged, quiet_days=quiet_days)
    return jsonify({'success': True, 'considered': considered,
                    'flagged': flagged, 'quiet_days': quiet_days,
                    'partners': quiet})
