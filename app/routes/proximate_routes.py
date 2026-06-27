"""Proximate community-endorsement routes — Phase 628 (June 2026).

The /api/proximate/* surface that drives the wireframe flow from
docs/PROXIMATE_FUND_DESIGN.md §3.1 — the bet.

Five endpoints in v0:

  POST /api/proximate/endorsers              endorser self-register
  GET  /api/proximate/partners               list partners (with trust-floor)
  GET  /api/proximate/partners/<id>          one partner's full state
  POST /api/proximate/partners               nominate a new partner
  POST /api/proximate/partners/<id>/endorse  submit one endorsement

All endpoints scope to the caller's network — only Proximate-tenant
users can hit them. Cross-tenant calls return 403. The route layer
runs the COI auto-check at submit time and trips the partner's status
forward when the trust-floor is met.

Audit chain integration deferred to Phase 631 — every endorsement
write currently logs to the standard audit logger; chain entry comes
when the platform-wide tenant-scoping decision lands (see
PROXIMATE_FUND_DESIGN.md §6).
"""

import logging
import os

from datetime import datetime, timezone
from flask import Blueprint, g, jsonify, request
from flask_login import login_required, current_user

from app.extensions import db
from app.models import (
    ProximatePartner, Endorser, Endorsement,
    Network, PARTNER_STATUSES, ENDORSER_STATUSES,
    Q1_LABEL_EN, Q1_LABEL_AR, Q2_LABEL_EN, Q2_LABEL_AR, Q3_LABEL_EN, Q3_LABEL_AR,
    AuditChainEntry,
    InterventionMeasure, INTERVENTION_KINDS,
    FinancialServiceProvider, PartnerDisbursementMethod, FSP_KINDS,
    ProximateRound, ProximateRoundSignature,
    ROUND_TRIGGER_TYPES, ROUND_SIGNERS_REQUIRED,
)
from app.utils.network import ob_required

logger = logging.getLogger('kuja')

proximate_bp = Blueprint('proximate', __name__, url_prefix='/api/proximate')


# ---- Tenant guard -----------------------------------------------------

def _proximate_network():
    """Return the Proximate Network row for the current request, or None
    if the caller isn't in the Proximate tenant. Source of truth is the
    host-header resolver attached to g.network earlier in the request
    lifecycle (Phase 32 middleware)."""
    net = getattr(g, 'network', None)
    if net and net.slug == 'proximate':
        return net
    # Fallback for tests / direct hits without host-header — accept the
    # tenant from the user's network membership. This is the same shape
    # NEAR uses.
    if current_user.is_authenticated:
        # Allow super-admins to operate against Proximate from any host;
        # the explicit slug check below is the safety gate.
        proximate = Network.query.filter_by(slug='proximate').first()
        return proximate
    return None


def _require_proximate_tenant():
    """Returns (network, None) if OK, or (None, error_response) if
    not authorised. Use as the first thing in every route."""
    net = _proximate_network()
    if not net:
        return None, (jsonify({
            'success': False,
            'error': 'Proximate tenant not active for this request',
        }), 403)
    return net, None


# ---- Endorser self-register -------------------------------------------

@proximate_bp.route('/endorsers', methods=['POST'])
@login_required
def api_register_endorser():
    """Anyone authenticated can self-register as an endorser. Lands in
    'pending' status; light-KYC review (Phase 631) flips to 'approved'.
    Idempotent — re-registering returns the existing row.
    """
    net, err = _require_proximate_tenant()
    if err:
        return err
    payload = request.get_json(silent=True) or {}

    existing = Endorser.query.filter_by(
        network_id=net.id, user_id=current_user.id,
    ).first()
    if existing:
        return jsonify({
            'success': True,
            'endorser': existing.to_dict(include_coi=True),
            'already_registered': True,
        })

    endorser = Endorser(
        network_id=net.id,
        user_id=current_user.id,
        locality=(payload.get('locality') or '').strip() or None,
        country=(payload.get('country') or 'SD').strip(),
        village_name=(payload.get('village_name') or '').strip() or None,
        family_name=(payload.get('family_name') or '').strip() or None,
        employer=(payload.get('employer') or '').strip() or None,
        gov_id_doc_id=payload.get('gov_id_doc_id'),
        selfie_doc_id=payload.get('selfie_doc_id'),
        reference_user_id=payload.get('reference_user_id'),
        status='pending',
    )
    db.session.add(endorser)
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.endorser.registered',
        actor_email=current_user.email,
        subject_kind='proximate_endorser',
        subject_id=endorser.id,
        details={
            'user_id': current_user.id,
            'locality': endorser.locality,
            'country': endorser.country,
        },
    )
    logger.info(
        f"Proximate: endorser registered user_id={current_user.id} "
        f"locality={endorser.locality!r}"
    )
    return jsonify({
        'success': True,
        'endorser': endorser.to_dict(include_coi=True),
        'already_registered': False,
    })


# ---- List partners ---------------------------------------------------

@proximate_bp.route('/partners', methods=['GET'])
@login_required
def api_list_partners():
    """List Proximate partners. Filters: status, ready_for_endorsement.
    Returns each partner with their trust-floor signals — that's what
    the endorser inbox renders (wireframe Screen 1).
    """
    net, err = _require_proximate_tenant()
    if err:
        return err

    q = ProximatePartner.query.filter_by(network_id=net.id)
    status = request.args.get('status')
    if status and status in PARTNER_STATUSES:
        q = q.filter_by(status=status)

    partners = q.order_by(ProximatePartner.nominated_at.desc()).limit(200).all()
    return jsonify({
        'success': True,
        'partners': [p.to_dict() for p in partners],
        'total': len(partners),
    })


# ---- One partner ------------------------------------------------------

@proximate_bp.route('/partners/<int:partner_id>', methods=['GET'])
@login_required
def api_get_partner(partner_id):
    net, err = _require_proximate_tenant()
    if err:
        return err
    partner = ProximatePartner.query.filter_by(
        id=partner_id, network_id=net.id,
    ).first()
    if not partner:
        return jsonify({'success': False, 'error': 'Partner not found'}), 404

    # Include the list of existing endorsements (de-identified —
    # endorser_id only, not name) so the wireframe can render the
    # "1/2 endorsements collected" progress bar.
    endorsements = Endorsement.query.filter_by(partner_id=partner.id).all()
    return jsonify({
        'success': True,
        'partner': partner.to_dict(),
        'endorsements': [e.to_dict() for e in endorsements],
        'questions': {
            'q1': {'en': Q1_LABEL_EN, 'ar': Q1_LABEL_AR},
            'q2': {'en': Q2_LABEL_EN, 'ar': Q2_LABEL_AR},
            'q3': {'en': Q3_LABEL_EN, 'ar': Q3_LABEL_AR},
        },
    })


# ---- Nominate a partner ----------------------------------------------

@proximate_bp.route('/partners', methods=['POST'])
@login_required
def api_nominate_partner():
    """Nominate a new informal group. Any authenticated Proximate
    user can nominate; the partner lands in 'nominated' status. The
    secretariat moves them to 'endorsements_open' after a quick
    intake-form sanity check (Phase 629)."""
    net, err = _require_proximate_tenant()
    if err:
        return err
    payload = request.get_json(silent=True) or {}

    name = (payload.get('name') or '').strip()
    if not name:
        return jsonify({
            'success': False, 'error': 'name is required',
        }), 400

    partner = ProximatePartner(
        network_id=net.id,
        name=name,
        name_ar=(payload.get('name_ar') or '').strip() or None,
        locality=(payload.get('locality') or '').strip() or None,
        country=(payload.get('country') or 'SD').strip(),
        contact_phone=(payload.get('contact_phone') or '').strip() or None,
        contact_email=(payload.get('contact_email') or '').strip() or None,
        bank_account_holder_name=(payload.get('bank_account_holder_name') or '').strip() or None,
        bank_account_number=(payload.get('bank_account_number') or '').strip() or None,
        bank_name=(payload.get('bank_name') or '').strip() or None,
        bank_swift_or_iban=(payload.get('bank_swift_or_iban') or '').strip() or None,
        nominated_by_user_id=current_user.id,
        status='nominated',
    )
    if payload.get('intake_form'):
        partner.set_intake_form(payload['intake_form'])
    db.session.add(partner)
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.partner.nominated',
        actor_email=current_user.email,
        subject_kind='proximate_partner',
        subject_id=partner.id,
        details={
            'name': partner.name,
            'locality': partner.locality,
            'country': partner.country,
            'has_bank_details': bool(partner.bank_account_number),
        },
    )
    logger.info(
        f"Proximate: partner nominated id={partner.id} name={partner.name!r} "
        f"by user_id={current_user.id}"
    )
    return jsonify({'success': True, 'partner': partner.to_dict()})


# ---- Submit one endorsement ------------------------------------------

@proximate_bp.route('/partners/<int:partner_id>/endorse', methods=['POST'])
@login_required
def api_submit_endorsement(partner_id):
    """Submit one endorsement for a partner. The COI auto-check runs
    inline; flagged endorsements are still recorded (audit trail) but
    don't count toward the trust-floor. If the post-write trust-floor
    is met, partner status transitions to 'dd_pending' (awaiting bank
    verify) or 'dd_clear' (if bank already verified).
    """
    net, err = _require_proximate_tenant()
    if err:
        return err
    payload = request.get_json(silent=True) or {}

    partner = ProximatePartner.query.filter_by(
        id=partner_id, network_id=net.id,
    ).first()
    if not partner:
        return jsonify({'success': False, 'error': 'Partner not found'}), 404

    endorser = Endorser.query.filter_by(
        network_id=net.id, user_id=current_user.id,
    ).first()
    if not endorser:
        return jsonify({
            'success': False,
            'error': 'You are not registered as an endorser — register first',
        }), 403

    if endorser.status != 'approved':
        return jsonify({
            'success': False,
            'error': f'Your endorser status is {endorser.status!r}; '
                     f'must be approved to endorse',
        }), 403

    # One endorsement per (partner, endorser) — enforced at the DB
    # level too via the unique constraint, but we catch it here for
    # a clean error rather than a 500.
    if Endorsement.query.filter_by(
        partner_id=partner.id, endorser_id=endorser.id,
    ).first():
        return jsonify({
            'success': False,
            'error': 'You have already endorsed this partner',
        }), 409

    # Three Y/N answers — all required.
    for q in ('q1_real', 'q2_trust', 'q3_accept_aid'):
        if q not in payload:
            return jsonify({
                'success': False, 'error': f'missing answer: {q}',
            }), 400
        if not isinstance(payload[q], bool):
            return jsonify({
                'success': False, 'error': f'{q} must be boolean',
            }), 400

    # COI auto-check happens server-side; client-supplied COI flags
    # would defeat the purpose.
    signals = Endorsement.compute_coi_signals(partner=partner, endorser=endorser)

    endorsement = Endorsement(
        partner_id=partner.id,
        endorser_id=endorser.id,
        q1_real=payload['q1_real'],
        q2_trust=payload['q2_trust'],
        q3_accept_aid=payload['q3_accept_aid'],
        q1_voice_doc_id=payload.get('q1_voice_doc_id'),
        q2_voice_doc_id=payload.get('q2_voice_doc_id'),
        q3_voice_doc_id=payload.get('q3_voice_doc_id'),
        q1_transcript=(payload.get('q1_transcript') or '').strip()[:5000] or None,
        q2_transcript=(payload.get('q2_transcript') or '').strip()[:5000] or None,
        q3_transcript=(payload.get('q3_transcript') or '').strip()[:5000] or None,
        coi_check_passed=(not signals),
        location_lat=payload.get('location_lat'),
        location_lng=payload.get('location_lng'),
    )
    endorsement.set_coi_signals(signals)
    db.session.add(endorsement)

    # Bump the endorser's lifetime count (used downstream in Phase
    # 631 for reputation calculation).
    endorser.endorsements_count = (endorser.endorsements_count or 0) + 1

    # Transition partner status forward if the trust-floor is now met.
    # We commit the endorsement first so the signals-computation reads
    # the latest state.
    db.session.flush()
    floor = partner.trust_floor_signals()
    state_change = None
    if floor['ready_for_dd_clear']:
        partner.status = 'dd_clear'
        partner.trust_tier = 'tier_1_relational'
        partner.dd_cleared_at = datetime.now(timezone.utc)
        state_change = 'dd_clear'
    elif floor['endorsements_ok'] and not floor['bank_verified']:
        # Two valid endorsements but bank verification pending — move
        # to dd_pending so the secretariat sees it as their next
        # action.
        if partner.status in ('nominated', 'endorsements_open'):
            partner.status = 'dd_pending'
            state_change = 'dd_pending'

    db.session.commit()

    # Audit-chain hooks — Phase 631. Best-effort: AuditChainEntry.append
    # never raises, so a chain failure can't lose the endorsement write.
    AuditChainEntry.append(
        action='proximate.endorsement.submitted',
        actor_email=current_user.email,
        subject_kind='proximate_partner',
        subject_id=partner.id,
        details={
            'endorser_id': endorser.id,
            'endorsement_id': endorsement.id,
            'coi_check_passed': endorsement.coi_check_passed,
            'coi_signals': list(signals.keys()),
            'q1_real': payload['q1_real'],
            'q2_trust': payload['q2_trust'],
            'q3_accept_aid': payload['q3_accept_aid'],
            'state_change': state_change,
        },
    )
    if state_change:
        AuditChainEntry.append(
            action=f'proximate.partner.status_changed.{state_change}',
            actor_email=current_user.email,
            subject_kind='proximate_partner',
            subject_id=partner.id,
            details={
                'new_status': partner.status,
                'trust_tier': partner.trust_tier,
                'trust_floor': partner.trust_floor_signals(),
            },
        )
        # Reputation boost — Phase 631. Every endorser whose vouch
        # contributed to a clear gets +5 (capped at 100). This is the
        # ground-truth-feedback signal the design doc §3.1 calls for.
        # We boost only on dd_clear (the actual outcome confirmation),
        # not dd_pending (which is just a halfway state).
        if state_change == 'dd_clear':
            confirmed_endorsements = Endorsement.query.filter_by(
                partner_id=partner.id, coi_check_passed=True,
            ).all()
            for ce in confirmed_endorsements:
                contributor = Endorser.query.get(ce.endorser_id)
                if not contributor:
                    continue
                old = contributor.reputation_score
                contributor.reputation_score = min(100, (contributor.reputation_score or 50) + 5)
                if contributor.reputation_score != old:
                    AuditChainEntry.append(
                        action='proximate.endorser.reputation_bumped',
                        actor_email='system',
                        subject_kind='proximate_endorser',
                        subject_id=contributor.id,
                        details={
                            'from': old,
                            'to': contributor.reputation_score,
                            'reason': 'partner_cleared',
                            'partner_id': partner.id,
                        },
                    )
            db.session.commit()

    logger.info(
        f"Proximate: endorsement submitted partner_id={partner.id} "
        f"endorser_id={endorser.id} coi_passed={endorsement.coi_check_passed} "
        f"signals={list(signals.keys())} state_change={state_change}"
    )
    return jsonify({
        'success': True,
        'endorsement': endorsement.to_dict(),
        'partner': partner.to_dict(),
        'state_change': state_change,
    })


# ---- Secretariat: bank-verify ----------------------------------------

@proximate_bp.route('/partners/<int:partner_id>/bank-verify', methods=['POST'])
@ob_required
def api_bank_verify_partner(partner_id):
    """Mark a partner's bank account as character-for-character
    verified (SOP 10 §4 Step 1). If endorsements are already at the
    trust-floor, this triggers the dd_clear transition.

    OB-only — the bank verification is the secretariat's last gate
    before disbursement readiness.
    """
    net, err = _require_proximate_tenant()
    if err:
        return err
    partner = ProximatePartner.query.filter_by(
        id=partner_id, network_id=net.id,
    ).first()
    if not partner:
        return jsonify({'success': False, 'error': 'Partner not found'}), 404

    if partner.bank_verified_at:
        return jsonify({
            'success': False,
            'error': 'Bank already verified for this partner',
        }), 409

    partner.bank_verified_at = datetime.now(timezone.utc)
    state_change = None
    floor = partner.trust_floor_signals()
    if floor['ready_for_dd_clear']:
        partner.status = 'dd_clear'
        partner.trust_tier = 'tier_1_relational'
        partner.dd_cleared_at = datetime.now(timezone.utc)
        state_change = 'dd_clear'
    db.session.commit()

    AuditChainEntry.append(
        action='proximate.partner.bank_verified',
        actor_email=current_user.email,
        subject_kind='proximate_partner',
        subject_id=partner.id,
        details={'state_change': state_change},
    )

    # If bank verification just cleared the partner, apply the same
    # reputation bonus the endorsement path does. Same algorithm —
    # endorser reputation reflects ground-truth outcomes regardless of
    # whether it was the endorsement or the bank that was the last gate.
    if state_change == 'dd_clear':
        AuditChainEntry.append(
            action=f'proximate.partner.status_changed.{state_change}',
            actor_email=current_user.email,
            subject_kind='proximate_partner',
            subject_id=partner.id,
            details={'new_status': partner.status, 'trust_tier': partner.trust_tier},
        )
        for ce in Endorsement.query.filter_by(
            partner_id=partner.id, coi_check_passed=True,
        ).all():
            contributor = Endorser.query.get(ce.endorser_id)
            if not contributor:
                continue
            old = contributor.reputation_score
            contributor.reputation_score = min(100, (contributor.reputation_score or 50) + 5)
            if contributor.reputation_score != old:
                AuditChainEntry.append(
                    action='proximate.endorser.reputation_bumped',
                    actor_email='system',
                    subject_kind='proximate_endorser',
                    subject_id=contributor.id,
                    details={
                        'from': old, 'to': contributor.reputation_score,
                        'reason': 'partner_cleared_via_bank_verify',
                        'partner_id': partner.id,
                    },
                )
        db.session.commit()

    logger.info(
        f"Proximate: bank verified partner_id={partner.id} "
        f"by user_id={current_user.id} state_change={state_change}"
    )
    return jsonify({
        'success': True,
        'partner': partner.to_dict(),
        'state_change': state_change,
    })


# ---- Secretariat: suspend partner (SOP 13 §4) ------------------------

@proximate_bp.route('/partners/<int:partner_id>/suspend', methods=['POST'])
@ob_required
def api_suspend_partner(partner_id):
    """Suspend a partner per SOP 13 §4 intervention measures. Records
    the reason on the audit chain and applies a -5 reputation penalty
    to every endorser whose vouch is on this partner. Mirrors the
    positive-direction Phase 631 bump.

    Reputation penalty rationale: if a partner the endorser vouched
    for fails (security review / aid diversion / SoP breach), the
    endorser's signal was wrong. The penalty is part of the
    ground-truth feedback loop.
    """
    net, err = _require_proximate_tenant()
    if err:
        return err
    payload = request.get_json(silent=True) or {}
    reason = (payload.get('reason') or '').strip()
    if not reason:
        return jsonify({
            'success': False, 'error': 'reason is required',
        }), 400

    partner = ProximatePartner.query.filter_by(
        id=partner_id, network_id=net.id,
    ).first()
    if not partner:
        return jsonify({'success': False, 'error': 'Partner not found'}), 404

    if partner.status == 'suspended':
        return jsonify({
            'success': False, 'error': 'Partner already suspended',
        }), 409

    prior_status = partner.status
    partner.status = 'suspended'
    # Roll back any clear state — a suspended partner is not Tier 1.
    if partner.trust_tier == 'tier_1_relational':
        partner.trust_tier = None
    db.session.commit()

    AuditChainEntry.append(
        action='proximate.partner.suspended',
        actor_email=current_user.email,
        subject_kind='proximate_partner',
        subject_id=partner.id,
        details={
            'reason': reason[:500],
            'prior_status': prior_status,
            'sop_clause': 'SOP-13-section-4',
        },
    )

    # Reputation penalty — same magnitude as the positive bump
    # (-5, capped at 0). Applies to every endorser whose vouch is on
    # this partner, regardless of whether the COI check passed: the
    # endorser still backed the wrong organisation.
    penalised = 0
    for e in Endorsement.query.filter_by(partner_id=partner.id).all():
        contributor = Endorser.query.get(e.endorser_id)
        if not contributor:
            continue
        old = contributor.reputation_score
        contributor.reputation_score = max(0, (contributor.reputation_score or 50) - 5)
        if contributor.reputation_score != old:
            penalised += 1
            AuditChainEntry.append(
                action='proximate.endorser.reputation_penalised',
                actor_email='system',
                subject_kind='proximate_endorser',
                subject_id=contributor.id,
                details={
                    'from': old, 'to': contributor.reputation_score,
                    'reason': 'partner_suspended',
                    'partner_id': partner.id,
                    'partner_suspend_reason': reason[:200],
                },
            )
    db.session.commit()

    logger.info(
        f"Proximate: partner suspended id={partner.id} by user_id={current_user.id} "
        f"reason={reason!r} endorsers_penalised={penalised}"
    )
    return jsonify({
        'success': True,
        'partner': partner.to_dict(),
        'endorsers_penalised': penalised,
    })


# ---- Intervention register (SOP 13 §4) -------------------------------

@proximate_bp.route('/interventions', methods=['POST'])
@ob_required
def api_open_intervention():
    """Open a new intervention measure (warning / freeze / suspend)
    against a partner. response_due_at auto-computed from the kind.
    The Phase 632 /suspend endpoint is still the right tool for the
    actual suspension transition + reputation hit; this surface is
    the formal SOP 13 paper trail with a clock.
    """
    net, err = _require_proximate_tenant()
    if err:
        return err
    payload = request.get_json(silent=True) or {}
    kind = (payload.get('kind') or '').strip()
    partner_id = payload.get('partner_id')
    reason = (payload.get('reason') or '').strip()

    if kind not in INTERVENTION_KINDS:
        return jsonify({
            'success': False,
            'error': f'kind must be one of {INTERVENTION_KINDS}',
        }), 400
    if not partner_id:
        return jsonify({'success': False, 'error': 'partner_id required'}), 400
    if not reason:
        return jsonify({'success': False, 'error': 'reason required'}), 400

    partner = ProximatePartner.query.filter_by(
        id=int(partner_id), network_id=net.id,
    ).first()
    if not partner:
        return jsonify({'success': False, 'error': 'Partner not found'}), 404

    measure = InterventionMeasure.open_new(
        network_id=net.id,
        partner_id=partner.id,
        kind=kind,
        reason=reason,
        opened_by_user_id=current_user.id,
    )
    db.session.commit()

    AuditChainEntry.append(
        action=f'proximate.intervention.opened.{kind}',
        actor_email=current_user.email,
        subject_kind='proximate_partner',
        subject_id=partner.id,
        details={
            'intervention_id': measure.id,
            'kind': kind,
            'reason': reason[:300],
            'response_due_at': measure.response_due_at.isoformat(),
            'sop_clause': measure.sop_clause,
        },
    )

    logger.info(
        f"Proximate: intervention opened kind={kind} partner_id={partner.id} "
        f"by user_id={current_user.id} due={measure.response_due_at.isoformat()}"
    )
    return jsonify({'success': True, 'intervention': measure.to_dict()})


@proximate_bp.route('/interventions', methods=['GET'])
@login_required
def api_list_interventions():
    """List interventions in this tenant. Filters: partner_id,
    status. Default — open + escalated (the secretariat queue).
    """
    net, err = _require_proximate_tenant()
    if err:
        return err
    q = InterventionMeasure.query.filter_by(network_id=net.id)
    partner_id = request.args.get('partner_id', type=int)
    if partner_id:
        q = q.filter_by(partner_id=partner_id)
    status = request.args.get('status')
    if status:
        q = q.filter_by(status=status)
    else:
        q = q.filter(InterventionMeasure.status.in_(['open', 'escalated']))

    rows = q.order_by(InterventionMeasure.response_due_at.asc()).limit(200).all()
    return jsonify({
        'success': True,
        'interventions': [m.to_dict() for m in rows],
        'total': len(rows),
    })


@proximate_bp.route('/interventions/<int:intervention_id>/respond', methods=['POST'])
@login_required
def api_respond_intervention(intervention_id):
    """Partner or OB records a response. Closes the timer."""
    net, err = _require_proximate_tenant()
    if err:
        return err
    payload = request.get_json(silent=True) or {}
    notes = (payload.get('notes') or '').strip()
    if not notes:
        return jsonify({'success': False, 'error': 'notes required'}), 400

    m = InterventionMeasure.query.filter_by(
        id=intervention_id, network_id=net.id,
    ).first()
    if not m:
        return jsonify({'success': False, 'error': 'Not found'}), 404
    if m.status != 'open':
        return jsonify({
            'success': False, 'error': f'Intervention is {m.status!r}, cannot respond',
        }), 409

    m.record_response(user_id=current_user.id, notes=notes)
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.intervention.responded',
        actor_email=current_user.email,
        subject_kind='proximate_intervention',
        subject_id=m.id,
        details={
            'partner_id': m.partner_id,
            'kind': m.kind,
            'notes': notes[:300],
            'remaining_seconds_at_response': m.remaining_seconds,
        },
    )
    return jsonify({'success': True, 'intervention': m.to_dict()})


@proximate_bp.route('/interventions/<int:intervention_id>/withdraw', methods=['POST'])
@ob_required
def api_withdraw_intervention(intervention_id):
    """OB withdraws an intervention (false alarm / resolved out-of-band)."""
    net, err = _require_proximate_tenant()
    if err:
        return err
    m = InterventionMeasure.query.filter_by(
        id=intervention_id, network_id=net.id,
    ).first()
    if not m:
        return jsonify({'success': False, 'error': 'Not found'}), 404
    if m.status not in ('open', 'escalated'):
        return jsonify({
            'success': False, 'error': f'Intervention is {m.status!r}',
        }), 409
    m.withdraw()
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.intervention.withdrawn',
        actor_email=current_user.email,
        subject_kind='proximate_intervention',
        subject_id=m.id,
        details={'partner_id': m.partner_id, 'kind': m.kind},
    )
    return jsonify({'success': True, 'intervention': m.to_dict()})


@proximate_bp.route('/interventions/cron-tick', methods=['POST'])
def api_cron_intervention_tick():
    """Cron-driven escalation: every open intervention past its
    response_due_at flips to 'escalated' and is hash-chained.
    Authorised via CRON_SECRET Bearer header (same pattern as other
    Kuja crons). Idempotent — re-running just won't find more.
    """
    from flask import current_app as cap
    secret = cap.config.get('CRON_SECRET') or os.getenv('CRON_SECRET')
    auth = request.headers.get('Authorization', '')
    if not secret or auth != f'Bearer {secret}':
        return jsonify({'success': False, 'error': 'forbidden'}), 403

    from datetime import datetime as _dt, timezone as _tz
    now = _dt.now(_tz.utc)
    expired = InterventionMeasure.query.filter(
        InterventionMeasure.status == 'open',
        InterventionMeasure.response_due_at <= now,
    ).all()
    escalated = 0
    for m in expired:
        m.escalate()
        AuditChainEntry.append(
            action='proximate.intervention.escalated',
            actor_email='cron',
            subject_kind='proximate_intervention',
            subject_id=m.id,
            details={
                'partner_id': m.partner_id,
                'kind': m.kind,
                'reason': 'response_window_expired',
                'response_due_at': m.response_due_at.isoformat(),
            },
        )
        escalated += 1
    db.session.commit()
    logger.info(f"Proximate cron: escalated {escalated} interventions")
    return jsonify({'success': True, 'escalated': escalated})


# ---- Light-KYC endorser review queue (Phase 637) ---------------------

@proximate_bp.route('/admin/endorsers/pending', methods=['GET'])
@ob_required
def api_pending_endorsers():
    """Return endorsers in 'pending' state — the secretariat's
    light-KYC review queue. Includes COI signal fields (so the OB
    can see what the endorser has self-reported) plus the doc IDs
    for gov-ID + selfie. v1 — no AI scoring; human review only."""
    net, err = _require_proximate_tenant()
    if err:
        return err
    rows = Endorser.query.filter_by(
        network_id=net.id, status='pending',
    ).order_by(Endorser.registered_at.asc()).limit(200).all()
    return jsonify({
        'success': True,
        'endorsers': [e.to_dict(include_coi=True) for e in rows],
        'total': len(rows),
    })


@proximate_bp.route('/admin/endorsers/<int:endorser_id>/approve', methods=['POST'])
@ob_required
def api_approve_endorser(endorser_id):
    """Mark a pending endorser approved. Audit-chained."""
    net, err = _require_proximate_tenant()
    if err:
        return err
    e = Endorser.query.filter_by(id=endorser_id, network_id=net.id).first()
    if not e:
        return jsonify({'success': False, 'error': 'Not found'}), 404
    if e.status != 'pending':
        return jsonify({
            'success': False,
            'error': f'Endorser is {e.status!r}, can only approve pending',
        }), 409
    e.status = 'approved'
    e.approved_at = datetime.now(timezone.utc)
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.endorser.approved',
        actor_email=current_user.email,
        subject_kind='proximate_endorser',
        subject_id=e.id,
        details={'user_id': e.user_id, 'locality': e.locality},
    )
    return jsonify({'success': True, 'endorser': e.to_dict(include_coi=True)})


@proximate_bp.route('/admin/endorsers/<int:endorser_id>/reject', methods=['POST'])
@ob_required
def api_reject_endorser(endorser_id):
    """Reject a pending endorser. Records reason on the audit chain
    (not on the model — keeps the schema minimal). v1 — no notification."""
    net, err = _require_proximate_tenant()
    if err:
        return err
    payload = request.get_json(silent=True) or {}
    reason = (payload.get('reason') or '').strip()
    if not reason:
        return jsonify({'success': False, 'error': 'reason required'}), 400
    e = Endorser.query.filter_by(id=endorser_id, network_id=net.id).first()
    if not e:
        return jsonify({'success': False, 'error': 'Not found'}), 404
    if e.status != 'pending':
        return jsonify({
            'success': False,
            'error': f'Endorser is {e.status!r}, can only reject pending',
        }), 409
    e.status = 'suspended'  # 'rejected' isn't in the vocab; suspended is the right resting state
    e.suspended_at = datetime.now(timezone.utc)
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.endorser.rejected',
        actor_email=current_user.email,
        subject_kind='proximate_endorser',
        subject_id=e.id,
        details={'user_id': e.user_id, 'reason': reason[:500]},
    )
    return jsonify({'success': True, 'endorser': e.to_dict(include_coi=True)})


# ---- FSP registry (Phase 639) ----------------------------------------

@proximate_bp.route('/fsps', methods=['GET'])
@login_required
def api_list_fsps():
    """List FSPs in this tenant. Anyone authenticated can read —
    needed by the partner-detail UI to populate the FSP dropdown."""
    net, err = _require_proximate_tenant()
    if err:
        return err
    kind = request.args.get('kind')
    q = FinancialServiceProvider.query.filter_by(
        network_id=net.id, is_active=True,
    )
    if kind and kind in FSP_KINDS:
        q = q.filter_by(kind=kind)
    rows = q.order_by(
        FinancialServiceProvider.kind, FinancialServiceProvider.name,
    ).limit(200).all()
    return jsonify({
        'success': True,
        'fsps': [f.to_dict() for f in rows],
        'total': len(rows),
    })


@proximate_bp.route('/fsps', methods=['POST'])
@ob_required
def api_register_fsp():
    """OB registers a new FSP — a hawala broker, mobile-money MNO,
    or bank — into the Proximate tenant. Name is unique per network.
    """
    net, err = _require_proximate_tenant()
    if err:
        return err
    payload = request.get_json(silent=True) or {}
    name = (payload.get('name') or '').strip()
    kind = (payload.get('kind') or '').strip()
    if not name:
        return jsonify({'success': False, 'error': 'name required'}), 400
    if kind not in FSP_KINDS:
        return jsonify({
            'success': False, 'error': f'kind must be one of {FSP_KINDS}',
        }), 400

    existing = FinancialServiceProvider.query.filter_by(
        network_id=net.id, name=name,
    ).first()
    if existing:
        return jsonify({
            'success': False, 'error': 'FSP with this name already registered',
        }), 409

    fsp = FinancialServiceProvider(
        network_id=net.id,
        name=name,
        name_ar=(payload.get('name_ar') or '').strip() or None,
        kind=kind,
        country=(payload.get('country') or 'SD').strip(),
        locality=(payload.get('locality') or '').strip() or None,
        notes=(payload.get('notes') or '').strip() or None,
        is_active=True,
    )
    db.session.add(fsp)
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.fsp.registered',
        actor_email=current_user.email,
        subject_kind='proximate_fsp',
        subject_id=fsp.id,
        details={
            'name': fsp.name, 'kind': fsp.kind,
            'country': fsp.country, 'locality': fsp.locality,
        },
    )
    return jsonify({'success': True, 'fsp': fsp.to_dict()})


# ---- Partner disbursement methods ------------------------------------

@proximate_bp.route('/partners/<int:partner_id>/disbursement-methods',
                    methods=['GET'])
@login_required
def api_list_disbursement_methods(partner_id):
    net, err = _require_proximate_tenant()
    if err:
        return err
    partner = ProximatePartner.query.filter_by(
        id=partner_id, network_id=net.id,
    ).first()
    if not partner:
        return jsonify({'success': False, 'error': 'Partner not found'}), 404
    rows = PartnerDisbursementMethod.query.filter_by(
        partner_id=partner.id,
    ).all()
    return jsonify({
        'success': True,
        'methods': [m.to_dict() for m in rows],
        'total': len(rows),
    })


@proximate_bp.route('/partners/<int:partner_id>/disbursement-methods',
                    methods=['POST'])
@ob_required
def api_add_disbursement_method(partner_id):
    """Attach a disbursement method to a partner. Body:
       {fsp_id: int, identifier: dict}
    The identifier shape depends on FSP.kind — see model docstring.
    """
    net, err = _require_proximate_tenant()
    if err:
        return err
    payload = request.get_json(silent=True) or {}
    fsp_id = payload.get('fsp_id')
    identifier = payload.get('identifier') or {}

    if not fsp_id or not isinstance(identifier, dict):
        return jsonify({
            'success': False,
            'error': 'fsp_id (int) and identifier (object) required',
        }), 400

    partner = ProximatePartner.query.filter_by(
        id=partner_id, network_id=net.id,
    ).first()
    if not partner:
        return jsonify({'success': False, 'error': 'Partner not found'}), 404
    fsp = FinancialServiceProvider.query.filter_by(
        id=int(fsp_id), network_id=net.id,
    ).first()
    if not fsp:
        return jsonify({'success': False, 'error': 'FSP not found'}), 404

    # Per-kind minimum-fields validation. Better caught early than
    # at disbursement time.
    required = {
        'bank': ('account_holder_name', 'account_number'),
        'hawala': ('recipient_phone',),
        'mobile_money': ('msisdn',),
    }
    for k in required.get(fsp.kind, ()):
        if not identifier.get(k):
            return jsonify({
                'success': False,
                'error': f'identifier.{k} required for kind={fsp.kind}',
            }), 400

    method = PartnerDisbursementMethod(
        partner_id=partner.id, fsp_id=fsp.id, status='unverified',
    )
    method.set_identifier(identifier)
    db.session.add(method)
    db.session.commit()

    AuditChainEntry.append(
        action='proximate.disbursement_method.added',
        actor_email=current_user.email,
        subject_kind='proximate_partner',
        subject_id=partner.id,
        details={
            'method_id': method.id, 'fsp_id': fsp.id,
            'fsp_kind': fsp.kind, 'fsp_name': fsp.name,
            # Never log the identifier in the audit chain (PII —
            # phone numbers, account numbers). Just the FSP it ties
            # to is enough for the trail.
        },
    )

    return jsonify({'success': True, 'method': method.to_dict()})


# ---- Security-driven auto-intervention (Phase 641) -------------------

# Keywords that trip a freeze. Tuned to Sudan-context security
# vocabulary — kept conservative because false-positives cost an
# OB a manual withdraw. If the team finds we're over- or under-
# triggering, the list is the right thing to tune (not the threshold).
SECURITY_KEYWORDS = (
    'attack', 'attacked',
    'raid', 'raided',
    'kidnap', 'kidnapped', 'abduct', 'abducted',
    'evacuation', 'evacuated',
    'displacement', 'displaced',
    'shelling', 'shelled',
    'militia',
    'rsf ',         # Rapid Support Forces, watched for in Sudan context
    'saf ',         # Sudanese Armed Forces
    'aid diversion', 'diverted',
    'arrested', 'arrest',
    # Arabic-script equivalents for the same concepts
    'هجوم', 'اختطاف', 'إخلاء', 'نزوح', 'قصف',
    'تحويل المساعدات',
)


def _contains_security_signal(text: str | None) -> str | None:
    """Return the first matched keyword, or None. Case-insensitive
    substring match (kept simple — the OB-withdraw flow is the human-
    review safety net)."""
    if not text:
        return None
    lower = text.lower()
    for kw in SECURITY_KEYWORDS:
        if kw in lower:
            return kw
    return None


@proximate_bp.route('/security-scan/cron-tick', methods=['POST'])
def api_cron_security_scan():
    """Scan recent monitoring-report messages / partner intake forms
    for security keywords. For each partner with a fresh signal that
    doesn't already have an open intervention, auto-open a freeze
    (72h) and audit-chain. Idempotent — re-running doesn't double-fire
    because of the open-intervention check.

    CRON_SECRET-gated. Designed to run hourly alongside the
    intervention cron.
    """
    from flask import current_app as cap
    secret = cap.config.get('CRON_SECRET') or os.getenv('CRON_SECRET')
    auth = request.headers.get('Authorization', '')
    if not secret or auth != f'Bearer {secret}':
        return jsonify({'success': False, 'error': 'forbidden'}), 403

    # Find Proximate networks (multi-tenancy: this cron runs per row).
    proximate_nets = Network.query.filter_by(slug='proximate').all()
    auto_opened = 0
    for net in proximate_nets:
        partners = ProximatePartner.query.filter(
            ProximatePartner.network_id == net.id,
            ProximatePartner.status.in_(['dd_clear', 'dd_pending']),
        ).all()
        for p in partners:
            # Skip if there's already an open / escalated intervention
            existing = InterventionMeasure.query.filter(
                InterventionMeasure.partner_id == p.id,
                InterventionMeasure.status.in_(['open', 'escalated']),
            ).first()
            if existing:
                continue

            # v1 signal source: scan the partner's intake_form notes
            # field. Phase 642 will add monitoring reports — once
            # those land, the scan extends to them too.
            intake = p.get_intake_form() or {}
            signal_text = intake.get('latest_signal') or intake.get('notes')
            matched = _contains_security_signal(signal_text)
            if not matched:
                continue

            # Auto-open a freeze
            measure = InterventionMeasure.open_new(
                network_id=net.id, partner_id=p.id, kind='freeze',
                reason=f'Auto-flagged: security signal "{matched}" '
                       f'detected in partner intake. '
                       f'Human OB review required within 72h.',
                opened_by_user_id=1,  # system user — admin
            )
            measure.sop_clause = 'SOP-13-section-4-auto'
            db.session.commit()
            AuditChainEntry.append(
                action='proximate.intervention.opened.freeze.auto',
                actor_email='cron-security-scan',
                subject_kind='proximate_partner',
                subject_id=p.id,
                details={
                    'intervention_id': measure.id,
                    'keyword': matched,
                    'sop_clause': measure.sop_clause,
                },
            )
            auto_opened += 1

    logger.info(f"Proximate cron: auto-opened {auto_opened} security interventions")
    return jsonify({'success': True, 'auto_opened': auto_opened})


# ---- Monitoring report cadence (Phase 642) ---------------------------

@proximate_bp.route('/monitoring/cron-tick', methods=['POST'])
def api_cron_monitoring():
    """Create a monitoring-checkpoint audit-chain entry per cleared
    partner per month per SOP 12. Lightweight v1: instead of creating
    Report rows (which require a Grant/Application link that doesn't
    fit the relational-validation model), we just emit an audit-chain
    `monitoring_due` event with the cadence stamp. The Proximate
    inbox UI can read these to render "Reporting due" tiles.

    Idempotent within a calendar month — uses the audit chain to
    self-check.
    """
    from flask import current_app as cap
    from datetime import datetime as _dt, timezone as _tz
    secret = cap.config.get('CRON_SECRET') or os.getenv('CRON_SECRET')
    auth = request.headers.get('Authorization', '')
    if not secret or auth != f'Bearer {secret}':
        return jsonify({'success': False, 'error': 'forbidden'}), 403

    now = _dt.now(_tz.utc)
    month_key = f'{now.year:04d}-{now.month:02d}'

    proximate_nets = Network.query.filter_by(slug='proximate').all()
    queued = 0
    for net in proximate_nets:
        cleared = ProximatePartner.query.filter_by(
            network_id=net.id, status='dd_clear',
        ).all()
        for p in cleared:
            # Has this partner already been flagged for this month?
            # Cheap check — look back the last 5 audit rows for this
            # subject and look for the month_key.
            recent = AuditChainEntry.query.filter_by(
                subject_kind='proximate_partner',
                subject_id=p.id,
                action='proximate.monitoring.due',
            ).order_by(AuditChainEntry.seq.desc()).limit(5).all()
            already_for_month = any(
                month_key in (r.details_json or '') for r in recent
            )
            if already_for_month:
                continue

            AuditChainEntry.append(
                action='proximate.monitoring.due',
                actor_email='cron-monitoring',
                subject_kind='proximate_partner',
                subject_id=p.id,
                details={
                    'month': month_key,
                    'sop_clause': 'SOP-12',
                    'partner_name': p.name,
                    'capital_class': p.capital_class,
                },
            )
            queued += 1

    logger.info(f"Proximate cron: queued {queued} monitoring-due flags for {month_key}")
    return jsonify({'success': True, 'queued': queued, 'month': month_key})


@proximate_bp.route('/disbursement-methods/<int:method_id>/verify',
                    methods=['POST'])
@ob_required
def api_verify_disbursement_method(method_id):
    """Mark a method verified — the OB has confirmed identifier
    matches the holder via out-of-band check. Mirrors the older
    ProximatePartner.bank_verified_at flow but per-method."""
    net, err = _require_proximate_tenant()
    if err:
        return err
    m = PartnerDisbursementMethod.query.get(method_id)
    if not m:
        return jsonify({'success': False, 'error': 'Not found'}), 404
    partner = ProximatePartner.query.filter_by(
        id=m.partner_id, network_id=net.id,
    ).first()
    if not partner:
        return jsonify({'success': False, 'error': 'Partner not in tenant'}), 404

    m.status = 'verified'
    m.verified_at = datetime.now(timezone.utc)
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.disbursement_method.verified',
        actor_email=current_user.email,
        subject_kind='proximate_partner',
        subject_id=partner.id,
        details={'method_id': m.id, 'fsp_id': m.fsp_id},
    )
    return jsonify({'success': True, 'method': m.to_dict()})


# ---- Endorsement read view (Phase 644) -------------------------------

@proximate_bp.route('/partners/<int:partner_id>/endorsements',
                    methods=['GET'])
@login_required
def api_list_endorsements(partner_id):
    """List all endorsements for a partner. Returns answers +
    transcripts so the OB can read what each endorser said about each
    Y/N question. Without this, voice-transcribed reasoning is
    write-only — collected at submit time and never surfaced again.
    """
    net, err = _require_proximate_tenant()
    if err:
        return err
    partner = ProximatePartner.query.filter_by(
        id=partner_id, network_id=net.id,
    ).first()
    if not partner:
        return jsonify({'success': False, 'error': 'Partner not found'}), 404
    rows = Endorsement.query.filter_by(
        partner_id=partner.id,
    ).order_by(Endorsement.created_at.desc()).all()
    return jsonify({
        'success': True,
        'endorsements': [e.to_dict() for e in rows],
        'total': len(rows),
    })


# ---- Operator dashboard rollup (Phase 643) ---------------------------

@proximate_bp.route('/overview', methods=['GET'])
@login_required
def api_proximate_overview():
    """Single-pane rollup for the OB. Returns counts the dashboard
    needs to triage today's queue: partners by status, open
    interventions (separating expired = needs response NOW), pending
    endorser approvals, monitoring-due audit flags for this month,
    recent audit events.

    Read-only — open to any authenticated user in the tenant so we
    don't have to gate the dashboard route; the per-action endpoints
    already enforce OB role separately.
    """
    from datetime import datetime as _dt, timezone as _tz
    net, err = _require_proximate_tenant()
    if err:
        return err

    # Partners by status
    by_status = {s: 0 for s in PARTNER_STATUSES}
    rows = ProximatePartner.query.filter_by(network_id=net.id).all()
    for r in rows:
        if r.status in by_status:
            by_status[r.status] += 1

    # Open interventions — split open vs expired (past response_due_at)
    open_interventions = InterventionMeasure.query.filter(
        InterventionMeasure.network_id == net.id,
        InterventionMeasure.status.in_(['open', 'escalated']),
    ).all()
    expired_count = sum(1 for m in open_interventions if m.is_expired)
    open_count = len(open_interventions) - expired_count
    escalated_count = sum(
        1 for m in open_interventions if m.status == 'escalated'
    )

    # Pending endorser approvals
    pending_endorsers = Endorser.query.filter_by(
        network_id=net.id, status='pending',
    ).count()

    # Monitoring-due flags this month — count the audit-chain rows
    # the Phase 642 cron emits.
    now = _dt.now(_tz.utc)
    month_key = f'{now.year:04d}-{now.month:02d}'
    monitoring_due_rows = AuditChainEntry.query.filter_by(
        subject_kind='proximate_partner',
        action='proximate.monitoring.due',
    ).order_by(AuditChainEntry.seq.desc()).limit(200).all()
    monitoring_due_this_month = sum(
        1 for r in monitoring_due_rows
        if month_key in (r.details_json or '')
    )

    # FSP registry size for the OB to confirm the registry is wired
    fsp_count = FinancialServiceProvider.query.filter_by(
        network_id=net.id, is_active=True,
    ).count()

    # Recent audit events scoped to Proximate-flavoured actions
    recent = AuditChainEntry.query.filter(
        AuditChainEntry.action.like('proximate.%'),
    ).order_by(AuditChainEntry.seq.desc()).limit(10).all()
    recent_dicts = [{
        'seq': r.seq,
        'action': r.action,
        'actor_email': r.actor_email,
        'subject_kind': r.subject_kind,
        'subject_id': r.subject_id,
        'created_at': r.created_at.isoformat() if r.created_at else None,
    } for r in recent]

    return jsonify({
        'success': True,
        'partners_by_status': by_status,
        'partners_total': len(rows),
        'interventions': {
            'open': open_count,
            'expired': expired_count,
            'escalated': escalated_count,
            'total': len(open_interventions),
        },
        'endorsers_pending': pending_endorsers,
        'monitoring_due_this_month': monitoring_due_this_month,
        'fsps_registered': fsp_count,
        'month': month_key,
        'recent_audit': recent_dicts,
    })


# ---- Funding Rounds (Phase 649) --------------------------------------

@proximate_bp.route('/rounds', methods=['GET'])
@login_required
def api_list_rounds():
    """List rounds in this tenant, newest first."""
    net, err = _require_proximate_tenant()
    if err:
        return err
    rows = ProximateRound.query.filter_by(network_id=net.id).order_by(
        ProximateRound.drafted_at.desc(),
    ).limit(200).all()
    return jsonify({
        'success': True,
        'rounds': [r.to_dict() for r in rows],
        'total': len(rows),
    })


@proximate_bp.route('/rounds/<int:round_id>', methods=['GET'])
@login_required
def api_get_round(round_id):
    """Round detail + signatures + temporal audit window."""
    net, err = _require_proximate_tenant()
    if err:
        return err
    r = ProximateRound.query.filter_by(id=round_id, network_id=net.id).first()
    if not r:
        return jsonify({'success': False, 'error': 'Not found'}), 404

    # Temporal linkage — fetch audit-chain rows between submitted_at and
    # closed_at (or now). This is what end-of-round reports key off.
    end = r.closed_at or datetime.now(timezone.utc)
    start = r.submitted_at or r.drafted_at
    audit_rows = AuditChainEntry.query.filter(
        AuditChainEntry.action.like('proximate.%'),
        AuditChainEntry.created_at >= start,
        AuditChainEntry.created_at <= end,
    ).order_by(AuditChainEntry.seq.desc()).limit(500).all()

    return jsonify({
        'success': True,
        'round': r.to_dict(include_signatures=True),
        'audit_in_window': [{
            'seq': a.seq, 'action': a.action,
            'actor_email': a.actor_email,
            'subject_kind': a.subject_kind, 'subject_id': a.subject_id,
            'created_at': a.created_at.isoformat() if a.created_at else None,
        } for a in audit_rows],
    })


@proximate_bp.route('/rounds', methods=['POST'])
@ob_required
def api_create_round():
    """OB drafts a new round. Lands in `draft` status; must be submitted
    next, then signed by 2 OB members to activate."""
    net, err = _require_proximate_tenant()
    if err:
        return err
    payload = request.get_json(silent=True) or {}
    title = (payload.get('title') or '').strip()
    trigger = (payload.get('trigger_type') or '').strip()
    if not title:
        return jsonify({'success': False, 'error': 'title required'}), 400
    if trigger not in ROUND_TRIGGER_TYPES:
        return jsonify({
            'success': False,
            'error': f'trigger_type must be one of {ROUND_TRIGGER_TYPES}',
        }), 400

    r = ProximateRound(
        network_id=net.id,
        title=title[:300],
        title_ar=(payload.get('title_ar') or '').strip()[:300] or None,
        trigger_type=trigger,
        trigger_summary=(payload.get('trigger_summary') or '').strip() or None,
        donor_name=(payload.get('donor_name') or '').strip() or None,
        envelope_usd=payload.get('envelope_usd'),
        expected_duration_days=payload.get('expected_duration_days'),
        target_country=(payload.get('target_country') or 'SD').strip(),
        target_region=(payload.get('target_region') or '').strip() or None,
        drafted_by_user_id=current_user.id,
    )
    db.session.add(r)
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.round.drafted',
        actor_email=current_user.email,
        subject_kind='proximate_round',
        subject_id=r.id,
        details={'title': r.title, 'trigger': r.trigger_type,
                 'envelope_usd': r.envelope_usd},
    )
    return jsonify({'success': True, 'round': r.to_dict()})


@proximate_bp.route('/rounds/<int:round_id>/submit', methods=['POST'])
@ob_required
def api_submit_round(round_id):
    """Drafter flips the round into in_review; signatures can begin."""
    net, err = _require_proximate_tenant()
    if err:
        return err
    r = ProximateRound.query.filter_by(id=round_id, network_id=net.id).first()
    if not r:
        return jsonify({'success': False, 'error': 'Not found'}), 404
    try:
        r.submit()
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 409
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.round.submitted',
        actor_email=current_user.email,
        subject_kind='proximate_round',
        subject_id=r.id,
        details={'status': r.status},
    )
    return jsonify({'success': True, 'round': r.to_dict()})


@proximate_bp.route('/rounds/<int:round_id>/sign', methods=['POST'])
@ob_required
def api_sign_round(round_id):
    """Current OB user affirms or recuses on a round. If `reject_reason` is
    given, the whole round is cancelled instead. Reaching the signer floor
    auto-activates the round."""
    net, err = _require_proximate_tenant()
    if err:
        return err
    r = ProximateRound.query.filter_by(id=round_id, network_id=net.id).first()
    if not r:
        return jsonify({'success': False, 'error': 'Not found'}), 404
    if r.status != 'in_review':
        return jsonify({
            'success': False,
            'error': f'Round is {r.status!r}; only in_review accepts signatures',
        }), 409

    payload = request.get_json(silent=True) or {}
    reject_reason = (payload.get('reject_reason') or '').strip()
    declared_no_coi = bool(payload.get('declared_no_coi'))
    note = (payload.get('note') or '').strip() or None

    sig = ProximateRoundSignature.query.filter_by(
        round_id=r.id, user_id=current_user.id,
    ).first()
    if not sig:
        sig = ProximateRoundSignature(
            round_id=r.id, user_id=current_user.id,
        )
        db.session.add(sig)
        db.session.flush()
    if sig.status != 'pending':
        return jsonify({
            'success': False,
            'error': f'You already responded ({sig.status!r})',
        }), 409

    if reject_reason:
        sig.reject(reason=reject_reason)
        r.cancel(reason=f'Rejected by {current_user.email}: {reject_reason}')
        db.session.commit()
        AuditChainEntry.append(
            action='proximate.round.rejected',
            actor_email=current_user.email,
            subject_kind='proximate_round',
            subject_id=r.id,
            details={'reason': reject_reason[:500]},
        )
        return jsonify({
            'success': True, 'round': r.to_dict(include_signatures=True),
        })

    sig.sign(declared_no_coi=declared_no_coi, note=note)
    audit_action = 'proximate.round.signed' if sig.status == 'signed' else 'proximate.round.recused'
    db.session.commit()
    AuditChainEntry.append(
        action=audit_action,
        actor_email=current_user.email,
        subject_kind='proximate_round',
        subject_id=r.id,
        details={'signed_count': r.signed_count,
                 'required': ROUND_SIGNERS_REQUIRED},
    )
    # Auto-activate if threshold met
    if r.ready_for_activation:
        r.activate()
        db.session.commit()
        AuditChainEntry.append(
            action='proximate.round.activated',
            actor_email=current_user.email,
            subject_kind='proximate_round',
            subject_id=r.id,
            details={'signed_count': r.signed_count},
        )
    return jsonify({
        'success': True, 'round': r.to_dict(include_signatures=True),
    })


@proximate_bp.route('/rounds/<int:round_id>/close', methods=['POST'])
@ob_required
def api_close_round(round_id):
    """OB closes an active round. Anchors the cycle end; subsequent audit
    rows belong to the next round."""
    net, err = _require_proximate_tenant()
    if err:
        return err
    r = ProximateRound.query.filter_by(id=round_id, network_id=net.id).first()
    if not r:
        return jsonify({'success': False, 'error': 'Not found'}), 404
    summary = (request.get_json(silent=True) or {}).get('summary', '')
    try:
        r.close(summary=summary)
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 409
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.round.closed',
        actor_email=current_user.email,
        subject_kind='proximate_round',
        subject_id=r.id,
        details={'summary_preview': (summary or '')[:200]},
    )
    return jsonify({'success': True, 'round': r.to_dict()})
