"""Saxansaxo API — SCLR micro-grants console + public token pages.

Route map (all JSON under /api/saxansaxo):

  Ops (SaxOpsMember only — deny-by-default, network-explicit):
    GET  /overview                     dashboard rollup
    GET  /groups                       list (stage-computed)
    POST /groups                       create group WITH permission (step 1)
    GET  /groups/<id>                  full detail
    POST /groups/<id>/inquiry          step 2 (+ activity-90d score)
    POST /groups/<id>/proposal-link    step 3 — issue no-login token link
    POST /groups/<id>/vetting          step 4 — criteria scores + decision
    GET  /funds  POST /funds           Resilio envelopes
    POST /groups/<id>/grant            step 5 — starts the 10-day clock
    POST /grants/<id>/disburse         step 6 — stops clock, issues report link
    POST /grants/<id>/outcome          step 8 — tag + lesson + co-contribution
    GET  /pauses POST /pauses          political-interference register
    POST /pauses/<id>/lift

  Public (token-authed, no login — shareable over WhatsApp):
    GET/POST /proposal?token=…         community fills its own proposal
    GET/POST /report?token=…           community reports in its own words

Accountability posture (design doc): every step appends to the audit
chain — the story of the decision — but nothing here polices spending.
The signatory sanctions screen is best-effort and RECORDS its result;
it never blocks the 10-day clock.
"""

import json
import logging
import secrets
from datetime import datetime, timezone

from flask import Blueprint, jsonify, g, request
from flask_login import current_user

from app.extensions import db
from app.models import (
    Network, AuditChainEntry,
    SaxOpsMember, SaxFund, SaxGroup, SaxPermission, SaxInquiry,
    SaxProposal, SaxVetting, SaxGrant, SaxReport, SaxAreaPause,
    SAX_OUTCOME_TAGS, SAX_DISBURSE_SLA_DAYS,
)
from app.utils.helpers import get_request_json

logger = logging.getLogger('kuja')

saxansaxo_bp = Blueprint('saxansaxo', __name__, url_prefix='/api/saxansaxo')


@saxansaxo_bp.before_request
def _stamp_sax_audit_scope():
    """Same tenant-stamping shape as proximate_bp: every audit row
    written while serving a Saxansaxo route belongs to this tenant,
    including token-link requests that arrive without the override
    header."""
    try:
        net = getattr(g, 'network', None)
        if net is not None and getattr(net, 'slug', None) == 'saxansaxo':
            g.audit_network_id = net.id
            return
        sax = Network.query.filter_by(slug='saxansaxo').first()
        if sax:
            g.audit_network_id = sax.id
    except Exception:
        pass


def _utcnow():
    return datetime.now(timezone.utc)


def _audit(action, subject_kind, subject_id, details=None):
    AuditChainEntry.append(
        action=action,
        actor_email=(current_user.email
                     if getattr(current_user, 'is_authenticated', False)
                     else None),
        subject_kind=subject_kind, subject_id=subject_id,
        details=details or {},
    )


def _require_ops():
    """(None, error) unless the caller holds a SaxOpsMember seat.
    Platform admins do NOT auto-pass (Proximate Batch-0 lesson)."""
    if not getattr(current_user, 'is_authenticated', False):
        return None, (jsonify({'success': False,
                               'error': 'Authentication required'}), 401)
    member = SaxOpsMember.query.filter_by(user_id=current_user.id).first()
    if not member:
        return None, (jsonify({'success': False,
                               'error': 'Saxansaxo ops permission required',
                               'code': 'err.sax_ops_required'}), 403)
    return member, None


def _screen_signatory(name):
    """Best-effort sanctions screen (Adeso legal floor). Records only —
    never blocks. Returns 'clear' | 'review' | 'unavailable'."""
    try:
        from app.services.compliance_service import ComplianceService
        res = ComplianceService._check_opensanctions(name, 'SO', schema='Person')
        if res is None:
            return 'unavailable'
        results = res.get('results') or []
        for m in results[:5]:
            if (m.get('score') or 0) >= 0.7:
                return 'review'
        return 'clear'
    except Exception as e:
        logger.warning(f"sax signatory screen failed for '{name}': {e}")
        return 'unavailable'


# ---------------------------------------------------------------------
# Overview
# ---------------------------------------------------------------------

@saxansaxo_bp.route('/overview', methods=['GET'])
def api_overview():
    _, err = _require_ops()
    if err:
        return err

    groups = SaxGroup.query.all()
    stage_counts = {}
    for gr in groups:
        stage_counts[gr.stage] = stage_counts.get(gr.stage, 0) + 1

    grants = SaxGrant.query.all()
    undisbursed = [gg for gg in grants if gg.disbursed_at is None]
    disbursed = [gg for gg in grants if gg.disbursed_at is not None]
    sla_actuals = [gg.sla_days for gg in disbursed if gg.sla_days is not None]
    outcome_counts = {tag: 0 for tag in SAX_OUTCOME_TAGS}
    co_contrib = 0
    for gg in grants:
        if gg.outcome_tag in outcome_counts:
            outcome_counts[gg.outcome_tag] += 1
        if gg.co_contribution:
            co_contrib += 1

    return jsonify({
        'success': True,
        'groups_total': len(groups),
        'stage_counts': stage_counts,
        'clock': {
            'sla_days': SAX_DISBURSE_SLA_DAYS,
            'awaiting_disbursement': [
                {**gg.to_dict(), 'group_name': gg.group.name}
                for gg in sorted(undisbursed,
                                 key=lambda x: x.sla_days or 0,
                                 reverse=True)
            ],
            'avg_days_to_disburse': (round(sum(sla_actuals) / len(sla_actuals), 1)
                                     if sla_actuals else None),
            'breaches': sum(1 for d in sla_actuals
                            if d > SAX_DISBURSE_SLA_DAYS),
        },
        'funds': [f.to_dict() for f in SaxFund.query.all()],
        'outcomes': outcome_counts,
        'co_contribution_count': co_contrib,
        'active_pauses': [p.to_dict() for p in
                          SaxAreaPause.query.filter_by(lifted_at=None).all()],
    })


# ---------------------------------------------------------------------
# Groups + steps 1-4
# ---------------------------------------------------------------------

@saxansaxo_bp.route('/groups', methods=['GET'])
def api_list_groups():
    _, err = _require_ops()
    if err:
        return err
    groups = SaxGroup.query.order_by(SaxGroup.id.desc()).all()
    return jsonify({'success': True,
                    'groups': [gr.to_dict() for gr in groups]})


@saxansaxo_bp.route('/groups', methods=['POST'])
def api_create_group():
    """Step 1 — a group enters the system only WITH its gatekeeper
    permission. Refuses localities under an active political pause."""
    _, err = _require_ops()
    if err:
        return err
    data = get_request_json() or {}
    name = (data.get('name') or '').strip()
    locality = (data.get('locality') or '').strip()
    granted_by_name = (data.get('granted_by_name') or '').strip()
    granted_by_role = (data.get('granted_by_role') or '').strip()
    if not name or not locality:
        return jsonify({'success': False,
                        'error': 'name and locality are required'}), 400
    if not granted_by_name or not granted_by_role:
        return jsonify({
            'success': False,
            'error': 'Permission first: granted_by_name and '
                     'granted_by_role are required',
            'code': 'err.permission_required',
        }), 400
    pause = SaxAreaPause.query.filter(
        SaxAreaPause.lifted_at.is_(None),
        db.func.lower(SaxAreaPause.locality) == locality.lower(),
    ).first()
    if pause:
        return jsonify({
            'success': False,
            'error': f'Locality "{locality}" is paused: {pause.reason}',
            'code': 'err.locality_paused',
        }), 409

    group = SaxGroup(
        name=name, name_so=data.get('name_so'), locality=locality,
        region=data.get('region'), description=data.get('description'),
        contact_name=data.get('contact_name'),
        contact_phone=data.get('contact_phone'),
        contact_email=data.get('contact_email'),
        created_by_user_id=current_user.id,
    )
    db.session.add(group)
    db.session.flush()
    db.session.add(SaxPermission(
        group_id=group.id, granted_by_name=granted_by_name,
        granted_by_role=granted_by_role, note=data.get('permission_note'),
        recorded_by_user_id=current_user.id,
    ))
    db.session.commit()
    _audit('saxansaxo.group.created', 'sax_group', group.id,
           {'name': name, 'locality': locality})
    _audit('saxansaxo.permission.recorded', 'sax_group', group.id,
           {'granted_by': granted_by_name, 'role': granted_by_role})
    return jsonify({'success': True, 'group': group.to_dict(deep=True)}), 201


@saxansaxo_bp.route('/groups/<int:group_id>', methods=['GET'])
def api_group_detail(group_id):
    _, err = _require_ops()
    if err:
        return err
    group = db.session.get(SaxGroup, group_id)
    if not group:
        return jsonify({'success': False, 'error': 'Group not found'}), 404
    d = group.to_dict(deep=True)
    # Ops see the shareable links
    if group.proposal:
        d['proposal'] = group.proposal.to_dict(include_token=True)
    d['grants'] = [gg.to_dict(deep=True, include_token=True)
                   for gg in group.grants]
    return jsonify({'success': True, 'group': d})


@saxansaxo_bp.route('/groups/<int:group_id>/inquiry', methods=['POST'])
def api_save_inquiry(group_id):
    """Step 2 — the on-the-ground inquiry, with the pre-existing
    activity score (0-3) as the low-commitment filter."""
    _, err = _require_ops()
    if err:
        return err
    group = db.session.get(SaxGroup, group_id)
    if not group:
        return jsonify({'success': False, 'error': 'Group not found'}), 404
    data = get_request_json() or {}
    score = data.get('activity_90d_score')
    if score is not None:
        try:
            score = max(0, min(3, int(score)))
        except (TypeError, ValueError):
            return jsonify({'success': False,
                            'error': 'activity_90d_score must be 0-3'}), 400
    inquiry = group.inquiry or SaxInquiry(group_id=group.id)
    inquiry.answers_json = json.dumps(data.get('answers') or {})
    inquiry.activity_90d_score = score
    inquiry.note = data.get('note')
    inquiry.done_by_user_id = current_user.id
    inquiry.done_at = _utcnow()
    db.session.add(inquiry)
    db.session.commit()
    _audit('saxansaxo.inquiry.recorded', 'sax_group', group.id,
           {'activity_90d_score': score})
    return jsonify({'success': True, 'inquiry': inquiry.to_dict()})


@saxansaxo_bp.route('/groups/<int:group_id>/proposal-link', methods=['POST'])
def api_issue_proposal_link(group_id):
    """Step 3 — issue (or re-issue) the community's no-login proposal
    link. Ownership stays with the group."""
    _, err = _require_ops()
    if err:
        return err
    group = db.session.get(SaxGroup, group_id)
    if not group:
        return jsonify({'success': False, 'error': 'Group not found'}), 404
    proposal = group.proposal
    if not proposal:
        proposal = SaxProposal(group_id=group.id)
        db.session.add(proposal)
        db.session.commit()
        _audit('saxansaxo.proposal_link.issued', 'sax_group', group.id, {})
    return jsonify({
        'success': True,
        'proposal': proposal.to_dict(include_token=True),
        'link_path': f'/sax-proposal/?token={proposal.token}',
    })


@saxansaxo_bp.route('/groups/<int:group_id>/vetting', methods=['POST'])
def api_record_vetting(group_id):
    """Step 4 — the virtual review decision, scored against the SCLR
    criteria. Permanent and dated: the anti-interference shield."""
    _, err = _require_ops()
    if err:
        return err
    group = db.session.get(SaxGroup, group_id)
    if not group:
        return jsonify({'success': False, 'error': 'Group not found'}), 404
    data = get_request_json() or {}
    decision = data.get('decision')
    if decision not in ('selected', 'not_selected', 'deferred'):
        return jsonify({'success': False,
                        'error': 'decision must be selected / not_selected'
                                 ' / deferred'}), 400
    vetting = group.vetting or SaxVetting(group_id=group.id,
                                          decision=decision)
    vetting.scores_json = json.dumps(data.get('scores') or {})
    vetting.decision = decision
    vetting.note = data.get('note')
    vetting.decided_by_user_id = current_user.id
    vetting.decided_at = _utcnow()
    db.session.add(vetting)
    db.session.commit()
    _audit('saxansaxo.vetting.decided', 'sax_group', group.id,
           {'decision': decision, 'scores': data.get('scores') or {}})
    return jsonify({'success': True, 'vetting': vetting.to_dict()})


# ---------------------------------------------------------------------
# Funds + grants (steps 5-6, 8)
# ---------------------------------------------------------------------

@saxansaxo_bp.route('/funds', methods=['GET'])
def api_list_funds():
    _, err = _require_ops()
    if err:
        return err
    return jsonify({'success': True,
                    'funds': [f.to_dict() for f in SaxFund.query.all()]})


@saxansaxo_bp.route('/funds', methods=['POST'])
def api_create_fund():
    _, err = _require_ops()
    if err:
        return err
    data = get_request_json() or {}
    name = (data.get('name') or '').strip()
    try:
        total = float(data.get('total_usd') or 0)
    except (TypeError, ValueError):
        return jsonify({'success': False,
                        'error': 'total_usd must be a number'}), 400
    if not name or total <= 0:
        return jsonify({'success': False,
                        'error': 'name and total_usd (>0) required'}), 400
    fund = SaxFund(name=name,
                   donor_name=(data.get('donor_name') or 'Resilio').strip(),
                   total_usd=total)
    db.session.add(fund)
    db.session.commit()
    _audit('saxansaxo.fund.created', 'sax_fund', fund.id,
           {'name': name, 'total_usd': total})
    return jsonify({'success': True, 'fund': fund.to_dict()}), 201


@saxansaxo_bp.route('/groups/<int:group_id>/grant', methods=['POST'])
def api_create_grant(group_id):
    """Step 5 — selection issues the grant and STARTS the 10-day clock.
    Envelope-checked so the fund cannot overspend; sanctions screen on
    the signatory runs quietly (records, never gates)."""
    _, err = _require_ops()
    if err:
        return err
    group = db.session.get(SaxGroup, group_id)
    if not group:
        return jsonify({'success': False, 'error': 'Group not found'}), 404
    if not group.vetting or group.vetting.decision != 'selected':
        return jsonify({
            'success': False,
            'error': 'Group must have a "selected" vetting decision first',
            'code': 'err.not_vetted_selected',
        }), 409
    data = get_request_json() or {}
    fund = db.session.get(SaxFund, int(data.get('fund_id') or 0))
    if not fund:
        return jsonify({'success': False, 'error': 'fund_id required'}), 400
    try:
        amount = float(data.get('amount_usd') or 0)
    except (TypeError, ValueError):
        return jsonify({'success': False,
                        'error': 'amount_usd must be a number'}), 400
    signatory = (data.get('signatory_name') or '').strip()
    if amount <= 0 or not signatory:
        return jsonify({'success': False,
                        'error': 'amount_usd (>0) and signatory_name '
                                 'required'}), 400
    committed = sum(gg.amount_usd or 0 for gg in fund.grants)
    if committed + amount > (fund.total_usd or 0) + 0.01:
        return jsonify({
            'success': False,
            'error': f'Envelope exceeded: {committed:.0f} committed of '
                     f'{fund.total_usd:.0f} in "{fund.name}"',
            'code': 'err.envelope_exceeded',
        }), 409

    grant = SaxGrant(group_id=group.id, fund_id=fund.id,
                     amount_usd=amount, signatory_name=signatory,
                     signatory_screening=_screen_signatory(signatory))
    db.session.add(grant)
    db.session.commit()
    _audit('saxansaxo.grant.selected', 'sax_grant', grant.id,
           {'group_id': group.id, 'amount_usd': amount,
            'fund': fund.name, 'screening': grant.signatory_screening})
    return jsonify({'success': True,
                    'grant': grant.to_dict(include_token=True)}), 201


@saxansaxo_bp.route('/grants/<int:grant_id>/disburse', methods=['POST'])
def api_disburse_grant(grant_id):
    """Step 6 — stops the clock, freezes sla_days, and issues the
    community's no-login report link."""
    _, err = _require_ops()
    if err:
        return err
    grant = db.session.get(SaxGrant, grant_id)
    if not grant:
        return jsonify({'success': False, 'error': 'Grant not found'}), 404
    if grant.disbursed_at is not None:
        return jsonify({'success': False,
                        'error': 'Already disbursed'}), 409
    grant.disbursed_at = _utcnow()
    grant.report_token = secrets.token_urlsafe(24)
    db.session.commit()
    _audit('saxansaxo.grant.disbursed', 'sax_grant', grant.id,
           {'group_id': grant.group_id, 'sla_days': grant.sla_days,
            'sla_breached': grant.sla_days > SAX_DISBURSE_SLA_DAYS})
    return jsonify({
        'success': True,
        'grant': grant.to_dict(include_token=True),
        'report_link_path': f'/sax-report/?token={grant.report_token}',
    })


@saxansaxo_bp.route('/grants/<int:grant_id>/outcome', methods=['POST'])
def api_record_outcome(grant_id):
    """Step 8 — experiential learning. One-tap tag + the lesson.
    Non-punitive by design; learning_loss is a category, not a case."""
    _, err = _require_ops()
    if err:
        return err
    grant = db.session.get(SaxGrant, grant_id)
    if not grant:
        return jsonify({'success': False, 'error': 'Grant not found'}), 404
    data = get_request_json() or {}
    tag = data.get('outcome_tag')
    if tag not in SAX_OUTCOME_TAGS:
        return jsonify({'success': False,
                        'error': f'outcome_tag must be one of '
                                 f'{list(SAX_OUTCOME_TAGS)}'}), 400
    grant.outcome_tag = tag
    grant.outcome_lesson = data.get('outcome_lesson')
    if data.get('co_contribution') is not None:
        grant.co_contribution = data.get('co_contribution')
    grant.outcome_at = _utcnow()
    db.session.commit()
    _audit('saxansaxo.outcome.tagged', 'sax_grant', grant.id,
           {'tag': tag})
    return jsonify({'success': True, 'grant': grant.to_dict(deep=True)})


# ---------------------------------------------------------------------
# Political-interference pause register
# ---------------------------------------------------------------------

@saxansaxo_bp.route('/pauses', methods=['GET'])
def api_list_pauses():
    _, err = _require_ops()
    if err:
        return err
    pauses = SaxAreaPause.query.order_by(SaxAreaPause.id.desc()).all()
    return jsonify({'success': True,
                    'pauses': [p.to_dict() for p in pauses]})


@saxansaxo_bp.route('/pauses', methods=['POST'])
def api_create_pause():
    _, err = _require_ops()
    if err:
        return err
    data = get_request_json() or {}
    locality = (data.get('locality') or '').strip()
    reason = (data.get('reason') or '').strip()
    if not locality or not reason:
        return jsonify({'success': False,
                        'error': 'locality and reason required'}), 400
    pause = SaxAreaPause(locality=locality, reason=reason,
                         by_user_id=current_user.id)
    db.session.add(pause)
    db.session.commit()
    _audit('saxansaxo.area.paused', 'sax_area_pause', pause.id,
           {'locality': locality})
    return jsonify({'success': True, 'pause': pause.to_dict()}), 201


@saxansaxo_bp.route('/pauses/<int:pause_id>/lift', methods=['POST'])
def api_lift_pause(pause_id):
    _, err = _require_ops()
    if err:
        return err
    pause = db.session.get(SaxAreaPause, pause_id)
    if not pause:
        return jsonify({'success': False, 'error': 'Pause not found'}), 404
    pause.lifted_at = _utcnow()
    db.session.commit()
    _audit('saxansaxo.area.pause_lifted', 'sax_area_pause', pause.id,
           {'locality': pause.locality})
    return jsonify({'success': True, 'pause': pause.to_dict()})


# ---------------------------------------------------------------------
# Public token pages (no login — the whole point)
# ---------------------------------------------------------------------

@saxansaxo_bp.route('/proposal', methods=['GET'])
def api_public_proposal_get():
    token = (request.args.get('token') or '').strip()
    proposal = (SaxProposal.query.filter_by(token=token).first()
                if token else None)
    if not proposal:
        return jsonify({'success': False, 'error': 'Invalid link'}), 404
    group = proposal.group
    return jsonify({
        'success': True,
        'group_name': group.name, 'group_name_so': group.name_so,
        'locality': group.locality,
        'submitted': proposal.submitted_at is not None,
        'answers': proposal.to_dict()['answers'],
    })


@saxansaxo_bp.route('/proposal', methods=['POST'])
def api_public_proposal_submit():
    token = (request.args.get('token') or '').strip()
    proposal = (SaxProposal.query.filter_by(token=token).first()
                if token else None)
    if not proposal:
        return jsonify({'success': False, 'error': 'Invalid link'}), 404
    data = get_request_json() or {}
    answers = data.get('answers') or {}
    if not any(str(v or '').strip() for v in answers.values()):
        return jsonify({'success': False,
                        'error': 'Please answer at least one question'}), 400
    proposal.answers_json = json.dumps(answers)
    proposal.submitted_at = _utcnow()
    db.session.commit()
    _audit('saxansaxo.proposal.submitted', 'sax_group',
           proposal.group_id, {})
    return jsonify({'success': True})


@saxansaxo_bp.route('/report', methods=['GET'])
def api_public_report_get():
    token = (request.args.get('token') or '').strip()
    grant = (SaxGrant.query.filter_by(report_token=token).first()
             if token else None)
    if not grant:
        return jsonify({'success': False, 'error': 'Invalid link'}), 404
    return jsonify({
        'success': True,
        'group_name': grant.group.name,
        'group_name_so': grant.group.name_so,
        'amount_usd': grant.amount_usd,
        'disbursed_at': (grant.disbursed_at.isoformat()
                         if grant.disbursed_at else None),
        'submitted': grant.report is not None,
    })


@saxansaxo_bp.route('/report', methods=['POST'])
def api_public_report_submit():
    token = (request.args.get('token') or '').strip()
    grant = (SaxGrant.query.filter_by(report_token=token).first()
             if token else None)
    if not grant:
        return jsonify({'success': False, 'error': 'Invalid link'}), 404
    if grant.report is not None:
        return jsonify({'success': False,
                        'error': 'Report already submitted'}), 409
    data = get_request_json() or {}
    answers = data.get('answers') or {}
    if not any(str(v or '').strip() for v in answers.values()):
        return jsonify({'success': False,
                        'error': 'Please answer at least one question'}), 400
    report = SaxReport(grant_id=grant.id, answers_json=json.dumps(answers))
    db.session.add(report)
    # Count (never mandate) the community's own contribution.
    contrib = str(answers.get('q_contributed') or '').strip()
    if contrib:
        grant.co_contribution = contrib
    db.session.commit()
    _audit('saxansaxo.report.submitted', 'sax_grant', grant.id, {})
    return jsonify({'success': True})
