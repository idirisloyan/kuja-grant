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

from datetime import datetime, timezone, timedelta
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
    ProximateDisbursement, DEFAULT_REPORT_WINDOW_DAYS,
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


# ---- Public partner self-nominate (Phase 650) ------------------------

@proximate_bp.route('/partners/self-nominate', methods=['POST'])
def api_self_nominate_partner():
    """Public endpoint: a community group puts itself forward without
    needing a Kuja login. Lands in 'nominated' status alongside
    Adeso-staff nominations; the secretariat decides whether to open
    endorsements. No bank fields accepted from the public form — those
    are captured later by the secretariat under their authenticated
    session.

    Rate-limit guard: reject if an identical (name, contact_phone)
    pair was nominated in the last 24h. Naïve but catches double-taps
    and basic spam without needing infra.
    """
    net, err = _require_proximate_tenant()
    if err:
        return err
    payload = request.get_json(silent=True) or {}

    name = (payload.get('name') or '').strip()
    if not name or len(name) < 2 or len(name) > 200:
        return jsonify({
            'success': False, 'error': 'name is required (2-200 chars)',
        }), 400

    contact_phone = (payload.get('contact_phone') or '').strip() or None
    contact_email = (payload.get('contact_email') or '').strip() or None
    if not contact_phone and not contact_email:
        return jsonify({
            'success': False,
            'error': 'at least one contact (phone or email) is required',
        }), 400

    # Honeypot field — bots fill every input; humans don't see this one
    if (payload.get('website') or '').strip():
        return jsonify({'success': False, 'error': 'spam detected'}), 400

    # Dedup window
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    if contact_phone:
        recent = ProximatePartner.query.filter(
            ProximatePartner.network_id == net.id,
            ProximatePartner.name == name,
            ProximatePartner.contact_phone == contact_phone,
            ProximatePartner.created_at >= cutoff,
        ).first()
        if recent:
            return jsonify({
                'success': True,
                'partner': recent.to_dict(),
                'already_nominated': True,
            })

    partner = ProximatePartner(
        network_id=net.id,
        name=name,
        name_ar=(payload.get('name_ar') or '').strip() or None,
        locality=(payload.get('locality') or '').strip() or None,
        country=(payload.get('country') or 'SD').strip(),
        contact_phone=contact_phone,
        contact_email=contact_email,
        nominated_by_user_id=None,  # self-nominated, no logged-in user
        status='nominated',
    )
    # Stash the free-text "what does your group do" into intake_form so
    # the secretariat can read it during triage.
    description = (payload.get('description') or '').strip()
    if description:
        partner.set_intake_form({
            'description': description[:2000],
            'source': 'self_nominated',
        })
    db.session.add(partner)
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.partner.self_nominated',
        actor_email=contact_email or f'phone:{contact_phone}' or 'anonymous',
        subject_kind='proximate_partner',
        subject_id=partner.id,
        details={
            'name': partner.name,
            'locality': partner.locality,
            'country': partner.country,
            'has_email': bool(contact_email),
            'has_phone': bool(contact_phone),
        },
    )
    logger.info(
        f"Proximate: partner self-nominated id={partner.id} "
        f"name={partner.name!r} contact={contact_email or contact_phone}"
    )

    # Phase 658 — automatic sanctions screen on self-nominate. Wrapped
    # in try/except: a slow/outage on the screening API must NOT block
    # the nomination from landing in the queue.
    try:
        _run_partner_sanctions_screen(partner)
    except Exception as e:  # noqa: BLE001
        logger.warning(
            f"Proximate: sanctions screen failed for partner {partner.id}: {e}"
        )

    return jsonify({'success': True, 'partner': partner.to_dict()})


def _run_partner_sanctions_screen(partner):
    """Phase 658 — run a sanctions screen against a partner and flip
    sanctions_flag if any check came back flagged. Safe to call from any
    partner-create path. Stores a compact summary on the partner so the
    OB sees WHY it was flagged on the partner detail.
    """
    from app.services.compliance_service import ComplianceService
    import json as _json

    checks = ComplianceService.screen_organization(
        org_name=partner.name,
        country=partner.country or 'SD',
    ) or []
    flagged_checks = [c for c in checks if c.get('status') == 'flagged']
    summary = {
        'total_checks': len(checks),
        'flagged_count': len(flagged_checks),
        'flagged': [
            {
                'check_type': c.get('check_type'),
                'reason': (c.get('result') or {}).get('reason'),
                'match_score': (c.get('result') or {}).get('match_score'),
                'list': (c.get('result') or {}).get('list'),
            }
            for c in flagged_checks[:5]
        ],
    }
    partner.sanctions_flag = bool(flagged_checks)
    partner.sanctions_checked_at = datetime.now(timezone.utc)
    partner.sanctions_summary_json = _json.dumps(summary)
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.partner.sanctions_screened',
        actor_email='system',
        subject_kind='proximate_partner',
        subject_id=partner.id,
        details=summary,
    )
    if flagged_checks:
        logger.warning(
            f"Proximate: sanctions FLAG on partner {partner.id} ({partner.name!r}) "
            f"— {len(flagged_checks)} hit(s)"
        )


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

    # Phase 670 — Independence rule: the OB responding to (investigating)
    # an intervention cannot have nominated the partner and cannot have
    # endorsed the partner. The OB still records the case but it lands
    # in the audit chain with an independence_conflict flag rather than
    # being usable evidence on closure.
    independence_conflict = []
    partner = ProximatePartner.query.get(m.partner_id) if m.partner_id else None
    if partner:
        if partner.nominated_by_user_id == current_user.id:
            independence_conflict.append('nominator')
        # Endorsers whose endorsements landed on this partner
        from app.models import Endorsement, Endorser
        eligible_endorsers = (
            db.session.query(Endorser.user_id)
            .join(Endorsement, Endorsement.endorser_id == Endorser.id)
            .filter(Endorsement.partner_id == partner.id)
            .filter(Endorser.user_id == current_user.id)
            .first()
        )
        if eligible_endorsers:
            independence_conflict.append('endorser')
    if independence_conflict:
        return jsonify({
            'success': False,
            'error': (
                'independence rule violation — investigator is '
                + '+'.join(independence_conflict) + ' for this partner'
            ),
            'conflict_roles': independence_conflict,
        }), 422

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

    # Phase 656 — disbursements tagged to this round + envelope rollup
    disbursements = ProximateDisbursement.query.filter_by(
        network_id=net.id, round_id=r.id,
    ).order_by(ProximateDisbursement.sent_at.desc()).all()
    envelope_used = sum(
        float(d.amount_usd) for d in disbursements if d.amount_usd is not None
    )
    envelope_total = float(r.envelope_usd) if r.envelope_usd else None
    envelope_remaining = (
        envelope_total - envelope_used if envelope_total is not None else None
    )

    return jsonify({
        'success': True,
        'round': r.to_dict(include_signatures=True),
        'disbursements': [d.to_dict() for d in disbursements],
        'envelope_used': envelope_used,
        'envelope_remaining': envelope_remaining,
        'audit_in_window': [{
            'seq': a.seq, 'action': a.action,
            'actor_email': a.actor_email,
            'subject_kind': a.subject_kind, 'subject_id': a.subject_id,
            'created_at': a.created_at.isoformat() if a.created_at else None,
        } for a in audit_rows],
    })


@proximate_bp.route('/rounds/<int:round_id>/report.pdf', methods=['GET'])
@login_required
def api_round_report_pdf(round_id):
    """Phase 671 — server-side PDF of the end-of-round report.
    Uses reportlab; renders a one-page summary by default. Honours the
    same tenant gate + data shape as the JSON report endpoint."""
    from io import BytesIO
    from flask import send_file as _send_file
    import json as _json
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.pdfgen import canvas as _canvas
    except ImportError:
        return jsonify({
            'success': False,
            'error': 'reportlab not installed on this deploy',
        }), 503

    net, err = _require_proximate_tenant()
    if err:
        return err
    r = ProximateRound.query.filter_by(id=round_id, network_id=net.id).first()
    if not r:
        return jsonify({'success': False, 'error': 'Not found'}), 404

    disbursements = ProximateDisbursement.query.filter_by(
        network_id=net.id, round_id=r.id,
    ).order_by(ProximateDisbursement.sent_at.asc()).all()
    envelope_total = float(r.envelope_usd) if r.envelope_usd else 0.0
    envelope_used = sum(
        float(d.amount_usd) for d in disbursements if d.amount_usd is not None
    )
    envelope_remaining = envelope_total - envelope_used

    buf = BytesIO()
    p = _canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    y = height - 25 * mm

    def _line(txt, size=10, spacing=12, font='Helvetica'):
        nonlocal y
        p.setFont(font, size)
        p.drawString(20 * mm, y, txt[:120])
        y -= spacing

    _line(f"End-of-round report: {r.title}", 16, 20, 'Helvetica-Bold')
    if r.title_ar:
        _line(r.title_ar, 11, 16)
    _line(
        f"Trigger: {r.trigger_type or '—'}    Donor: {r.donor_name or '—'}    "
        f"Country: {r.target_country or '—'}",
        9, 14,
    )
    y -= 4
    _line(
        f"Envelope: ${envelope_total:,.0f}    Used: ${envelope_used:,.0f}    "
        f"Remaining: ${envelope_remaining:,.0f}",
        11, 16, 'Helvetica-Bold',
    )
    _line(
        f"Disbursements: {len(disbursements)}    "
        f"Partners served: {len({d.partner_id for d in disbursements if d.partner_id})}",
        10, 14,
    )
    y -= 6
    _line('Disbursements', 12, 16, 'Helvetica-Bold')

    for d in disbursements:
        partner = ProximatePartner.query.get(d.partner_id) if d.partner_id else None
        partner_name = partner.name if partner else f"Partner #{d.partner_id}"
        amt = float(d.amount_usd) if d.amount_usd is not None else 0
        _line(
            f"  • {partner_name} — ${amt:,.0f} — {d.status}",
            10, 12,
        )
        if d.report_json:
            try:
                rep = _json.loads(d.report_json)
                if rep.get('people_helped') is not None:
                    _line(
                        f"      people helped: {rep['people_helped']}",
                        9, 11,
                    )
            except (ValueError, TypeError):
                pass
        if y < 30 * mm:
            p.showPage()
            y = height - 25 * mm

    # Audit anchor at bottom
    audit_last = (
        AuditChainEntry.query
        .filter(AuditChainEntry.action.like('proximate.%'))
        .order_by(AuditChainEntry.seq.desc())
        .first()
    )
    if audit_last:
        _line(
            f"Audit anchor: seq={audit_last.seq} hash={audit_last.payload_hash[:16]}…",
            8, 11,
        )

    p.showPage()
    p.save()
    buf.seek(0)
    AuditChainEntry.append(
        action='proximate.round.report_pdf_generated',
        actor_email=current_user.email,
        subject_kind='proximate_round',
        subject_id=r.id,
        details={'bytes': buf.getbuffer().nbytes},
    )
    return _send_file(
        buf,
        mimetype='application/pdf',
        as_attachment=True,
        download_name=f'proximate-round-{r.id}-report.pdf',
    )


@proximate_bp.route('/rounds/<int:round_id>/tranche-schedule', methods=['PUT'])
@ob_required
def api_update_tranche_schedule(round_id):
    """Phase 670 — set or replace the tranche schedule on a round.

    Body: {tranches: [{label, target_amount_usd, target_date (ISO), notes}]}
    Pure annotation; disbursements are not auto-linked. Surfaced on the
    round detail so the OB can see planned vs released against the
    envelope used.
    """
    import json as _json

    net, err = _require_proximate_tenant()
    if err:
        return err
    r = ProximateRound.query.filter_by(id=round_id, network_id=net.id).first()
    if not r:
        return jsonify({'success': False, 'error': 'Not found'}), 404

    payload = request.get_json(silent=True) or {}
    raw = payload.get('tranches')
    if not isinstance(raw, list):
        return jsonify({
            'success': False, 'error': 'tranches must be a list',
        }), 400
    cleaned = []
    for i, t in enumerate(raw):
        if not isinstance(t, dict):
            continue
        label = (t.get('label') or '').strip()[:120]
        amt = t.get('target_amount_usd')
        try:
            amt = float(amt) if amt is not None else None
        except (TypeError, ValueError):
            amt = None
        cleaned.append({
            'label': label or f'Tranche {i + 1}',
            'target_amount_usd': amt,
            'target_date': (t.get('target_date') or '').strip()[:32] or None,
            'notes': (t.get('notes') or '').strip()[:500] or None,
        })
    r.tranche_schedule_json = _json.dumps(cleaned)
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.round.tranche_schedule_updated',
        actor_email=current_user.email,
        subject_kind='proximate_round',
        subject_id=r.id,
        details={'n_tranches': len(cleaned)},
    )
    return jsonify({
        'success': True,
        'tranche_schedule': cleaned,
    })


@proximate_bp.route('/rounds/<int:round_id>/donor-shares', methods=['PUT'])
@ob_required
def api_update_donor_shares(round_id):
    """Phase 686 — set or replace the donor shares on a round.

    Body: {shares: [{donor_id, committed_usd, restricted_to_partner_id?,
                     restricted_to_purpose?}]}
    Sum of committed_usd ideally equals envelope_usd. Restricted shares
    earmark capital for a specific partner — subsequent disbursements
    to that partner validate against the remaining restricted budget
    via ProximateRound.restricted_remaining_for().
    """
    from app.models import ProximateDonor
    net, err = _require_proximate_tenant()
    if err:
        return err
    r = ProximateRound.query.filter_by(id=round_id, network_id=net.id).first()
    if not r:
        return jsonify({'success': False, 'error': 'Not found'}), 404
    payload = request.get_json(silent=True) or {}
    shares = payload.get('shares')
    if not isinstance(shares, list):
        return jsonify({
            'success': False, 'error': 'shares must be a list',
        }), 400

    # Validate that every donor_id belongs to this network.
    donor_ids = {int(s['donor_id']) for s in shares
                 if isinstance(s, dict) and s.get('donor_id') is not None}
    if donor_ids:
        valid = {d.id for d in ProximateDonor.query.filter(
            ProximateDonor.network_id == net.id,
            ProximateDonor.id.in_(donor_ids),
        ).all()}
        unknown = donor_ids - valid
        if unknown:
            return jsonify({
                'success': False,
                'error': f'unknown donor_id(s) for this network: {sorted(unknown)}',
            }), 400

    r.set_donor_shares(shares)
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.round.donor_shares_updated',
        actor_email=current_user.email,
        subject_kind='proximate_round',
        subject_id=r.id,
        details={
            'n_shares': len(r._donor_shares()),
            'committed_total_usd': sum(
                s.get('committed_usd', 0) for s in r._donor_shares()
            ),
        },
    )
    return jsonify({'success': True, 'donor_shares': r._donor_shares()})


@proximate_bp.route('/rounds/<int:round_id>/report', methods=['GET'])
@login_required
def api_round_report(round_id):
    """Phase 659 — end-of-round report bundle.

    Auto-assembles the closing package the user asked for in their
    Step-1 brief: round metadata + envelope used/remaining + every
    disbursement with its 5Q report payload and per-row verdict +
    counts by status + the temporal audit window. Frontend renders
    this as printable HTML at /proximate/rounds/[id]/report.
    """
    import json as _json

    net, err = _require_proximate_tenant()
    if err:
        return err
    r = ProximateRound.query.filter_by(id=round_id, network_id=net.id).first()
    if not r:
        return jsonify({'success': False, 'error': 'Not found'}), 404

    end = r.closed_at or datetime.now(timezone.utc)
    start = r.submitted_at or r.drafted_at
    audit_rows = AuditChainEntry.query.filter(
        AuditChainEntry.action.like('proximate.%'),
        AuditChainEntry.created_at >= start,
        AuditChainEntry.created_at <= end,
    ).order_by(AuditChainEntry.seq.asc()).limit(500).all()

    disbursements = ProximateDisbursement.query.filter_by(
        network_id=net.id, round_id=r.id,
    ).order_by(ProximateDisbursement.sent_at.asc()).all()

    rows = []
    counts = {
        'pending_cosign': 0, 'pending_report': 0,
        'reported': 0, 'verified': 0, 'flagged': 0,
    }
    totals = {
        'verified_usd': 0.0, 'flagged_usd': 0.0,
        'reported_usd': 0.0, 'pending_usd': 0.0,
        'pending_cosign_usd': 0.0,
    }
    for d in disbursements:
        partner = ProximatePartner.query.get(d.partner_id) if d.partner_id else None
        report_payload = None
        if d.report_json:
            try:
                report_payload = _json.loads(d.report_json)
            except (ValueError, TypeError):
                report_payload = None
        amt = float(d.amount_usd) if d.amount_usd is not None else 0.0
        if d.status in counts:
            counts[d.status] += 1
        if d.status == 'verified':
            totals['verified_usd'] += amt
        elif d.status == 'flagged':
            totals['flagged_usd'] += amt
        elif d.status == 'reported':
            totals['reported_usd'] += amt
        elif d.status == 'pending_report':
            totals['pending_usd'] += amt
        elif d.status == 'pending_cosign':
            totals['pending_cosign_usd'] += amt
        rows.append({
            'disbursement_id': d.id,
            'partner_id': d.partner_id,
            'partner_name': partner.name if partner else None,
            'partner_locality': partner.locality if partner else None,
            'amount_usd': amt,
            'purpose': d.purpose,
            'sent_at': d.sent_at.isoformat() if d.sent_at else None,
            'status': d.status,
            'report': report_payload,
            'report_voice_transcript': d.report_voice_transcript,
            'has_voice': bool(d.report_voice_doc_id),
            'has_photo': bool(d.report_photo_doc_id),
            'report_submitted_at': (
                d.report_submitted_at.isoformat() if d.report_submitted_at else None
            ),
        })

    envelope_total = float(r.envelope_usd) if r.envelope_usd else None
    envelope_used = sum(row['amount_usd'] for row in rows)
    envelope_remaining = (
        envelope_total - envelope_used if envelope_total is not None else None
    )

    # The latest audit row's hash anchor — proves the report bundle is
    # tied to a tamper-evident point in the chain. Auditors can re-derive.
    latest_seq = audit_rows[-1].seq if audit_rows else None
    latest_hash = audit_rows[-1].payload_hash if audit_rows else None

    return jsonify({
        'success': True,
        'round': r.to_dict(include_signatures=True),
        'window': {
            'opened_at': start.isoformat() if start else None,
            'closed_at': end.isoformat() if end else None,
        },
        'envelope': {
            'total_usd': envelope_total,
            'used_usd': envelope_used,
            'remaining_usd': envelope_remaining,
            'partners_served': len({row['partner_id'] for row in rows if row['partner_id']}),
            'disbursement_count': len(rows),
        },
        'status_counts': counts,
        'status_totals_usd': totals,
        'disbursements': rows,
        'audit_in_window': [{
            'seq': a.seq, 'action': a.action,
            'actor_email': a.actor_email,
            'subject_kind': a.subject_kind, 'subject_id': a.subject_id,
            'created_at': a.created_at.isoformat() if a.created_at else None,
        } for a in audit_rows],
        'audit_anchor': {
            'latest_seq': latest_seq,
            'latest_hash': latest_hash,
            'row_count': len(audit_rows),
        },
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


# =====================================================================
# Phase 651 — Disbursements + per-disbursement reporting
# =====================================================================

@proximate_bp.route('/disbursements', methods=['GET'])
@login_required
def api_list_disbursements():
    """List disbursements for the tenant. Filterable by partner_id,
    round_id, status, overdue."""
    net, err = _require_proximate_tenant()
    if err:
        return err
    q = ProximateDisbursement.query.filter_by(network_id=net.id)
    partner_id = request.args.get('partner_id', type=int)
    if partner_id:
        q = q.filter_by(partner_id=partner_id)
    round_id = request.args.get('round_id', type=int)
    if round_id:
        q = q.filter_by(round_id=round_id)
    status = request.args.get('status')
    if status:
        q = q.filter_by(status=status)
    rows = q.order_by(ProximateDisbursement.sent_at.desc()).limit(200).all()
    return jsonify({
        'success': True,
        'disbursements': [d.to_dict() for d in rows],
    })


@proximate_bp.route('/disbursements/<int:disbursement_id>', methods=['GET'])
@login_required
def api_get_disbursement(disbursement_id):
    """Detail for one disbursement, including the partner's submitted
    report payload (if any) and the audit-chain rows scoped to this
    disbursement's lifecycle."""
    net, err = _require_proximate_tenant()
    if err:
        return err
    d = ProximateDisbursement.query.filter_by(
        id=disbursement_id, network_id=net.id,
    ).first()
    if not d:
        return jsonify({'success': False, 'error': 'not found'}), 404
    payload = d.to_dict()
    if d.report_json:
        import json as _json
        try:
            payload['report'] = _json.loads(d.report_json)
        except (ValueError, TypeError):
            payload['report'] = None
    else:
        payload['report'] = None
    payload['report_voice_doc_id'] = d.report_voice_doc_id
    payload['report_photo_doc_id'] = d.report_photo_doc_id
    payload['report_voice_transcript'] = d.report_voice_transcript

    audit_rows = AuditChainEntry.query.filter(
        AuditChainEntry.subject_kind == 'proximate_disbursement',
        AuditChainEntry.subject_id == d.id,
    ).order_by(AuditChainEntry.seq.asc()).limit(100).all()
    import json as _json2
    payload['audit'] = [
        {
            'seq': r.seq,
            'action': r.action,
            'actor_email': r.actor_email,
            'created_at': r.created_at.isoformat() if r.created_at else None,
            'details': (
                _json2.loads(r.details_json) if r.details_json else {}
            ),
        }
        for r in audit_rows
    ]

    # Phase 680 — fold the 90-day outcome attestation into the
    # disbursement detail payload. The OB-facing page now has
    # everything it needs in one fetch.
    from app.models import ProximateOutcomeAttestation
    o = ProximateOutcomeAttestation.query.filter_by(
        disbursement_id=d.id,
    ).first()
    payload['outcome'] = o.to_dict() if o else None

    return jsonify({'success': True, 'disbursement': payload})


@proximate_bp.route('/outcome-attestations/<int:outcome_id>/verdict', methods=['POST'])
@ob_required
def api_set_outcome_verdict(outcome_id):
    """Phase 680 — OB reviews the partner's 90-day attestation and
    records a verdict ∈ {verified, disputed}, with optional notes."""
    from app.models import ProximateOutcomeAttestation
    net, err = _require_proximate_tenant()
    if err:
        return err
    o = ProximateOutcomeAttestation.query.filter_by(
        id=outcome_id, network_id=net.id,
    ).first()
    if not o:
        return jsonify({'success': False, 'error': 'not found'}), 404
    if o.submitted_at is None:
        return jsonify({
            'success': False,
            'error': 'partner has not yet attested',
        }), 400
    payload = request.get_json(silent=True) or {}
    verdict = (payload.get('verdict') or 'verified').lower()
    if verdict not in ('verified', 'disputed'):
        return jsonify({
            'success': False,
            'error': 'verdict must be verified|disputed',
        }), 400
    notes = (payload.get('notes') or '').strip()[:2000] or None
    o.status = verdict
    o.verdict_by_user_id = current_user.id
    o.verdict_at = datetime.now(timezone.utc)
    o.verdict_notes = notes
    db.session.commit()
    AuditChainEntry.append(
        action=f'proximate.outcome.{verdict}',
        actor_email=current_user.email,
        subject_kind='proximate_outcome_attestation',
        subject_id=o.id,
        details={
            'disbursement_id': o.disbursement_id,
            'partner_id': o.partner_id,
            'notes_len': len(notes) if notes else 0,
        },
    )
    return jsonify({'success': True, 'outcome': o.to_dict()})


@proximate_bp.route('/outcome-attestations/<int:outcome_id>/ack', methods=['POST'])
@ob_required
def api_ack_outcome(outcome_id):
    """Phase 680 — OB writes an acknowledgement message that appears
    on the partner's outcome URL the next time they visit it.
    Mirrors the Phase 660 disbursement acknowledgement pattern."""
    from app.models import ProximateOutcomeAttestation
    net, err = _require_proximate_tenant()
    if err:
        return err
    o = ProximateOutcomeAttestation.query.filter_by(
        id=outcome_id, network_id=net.id,
    ).first()
    if not o:
        return jsonify({'success': False, 'error': 'not found'}), 404
    payload = request.get_json(silent=True) or {}
    message = (payload.get('message') or '').strip()
    if not message:
        return jsonify({'success': False, 'error': 'message required'}), 400
    if len(message) > 2000:
        return jsonify({
            'success': False, 'error': 'message too long (max 2000)',
        }), 400
    o.ack_message = message
    o.ack_message_at = datetime.now(timezone.utc)
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.outcome.acknowledged',
        actor_email=current_user.email,
        subject_kind='proximate_outcome_attestation',
        subject_id=o.id,
        details={
            'message_len': len(message),
            'partner_id': o.partner_id,
        },
    )
    return jsonify({'success': True, 'outcome': o.to_dict()})


@proximate_bp.route('/disbursements', methods=['POST'])
@ob_required
def api_record_disbursement():
    """OB records a money release to a cleared partner. Creates a
    pending-report obligation due in DEFAULT_REPORT_WINDOW_DAYS (14)
    and emits the audit-chain rows that drive the inbox tile + the
    nudge cron."""
    net, err = _require_proximate_tenant()
    if err:
        return err
    payload = request.get_json(silent=True) or {}
    partner_id = payload.get('partner_id')
    amount = payload.get('amount_usd')
    if not partner_id or amount in (None, '', 0):
        return jsonify({
            'success': False,
            'error': 'partner_id and amount_usd required',
        }), 400
    partner = ProximatePartner.query.filter_by(
        id=partner_id, network_id=net.id,
    ).first()
    if not partner:
        return jsonify({'success': False, 'error': 'Partner not in tenant'}), 404
    if partner.status not in ('dd_clear', 'endorsements_open', 'dd_pending'):
        # OB-only override allowed but flag it
        logger.warning(
            f"Proximate: disbursement on non-cleared partner id={partner.id} status={partner.status}"
        )

    from datetime import timedelta
    from app.models.proximate_disbursement import (
        COSIGN_THRESHOLD_USD, cosigners_required_for,
    )
    window_days = int(payload.get('report_window_days') or DEFAULT_REPORT_WINDOW_DAYS)
    now = datetime.now(timezone.utc)

    # Phase 662 (extended by Phase 668) — Allocation Committee tier
    # ladder. Below $10k = single signer (the sender alone). At $10k+
    # one cosigner; at $50k+ two; at $200k+ three. Snapshot the count
    # so the rule is locked at create time.
    amount_f = float(amount)

    # Phase 686 — donor restricted-share validation. If the round has
    # any donor share restricted to this partner, the new disbursement
    # must fit within the remaining restricted budget.
    round_id_arg = payload.get('round_id')
    if round_id_arg:
        round_row = ProximateRound.query.filter_by(
            id=round_id_arg, network_id=net.id,
        ).first()
        if round_row and round_row.donor_shares_json:
            disbursed_to_partner = sum(
                float(x.amount_usd or 0)
                for x in ProximateDisbursement.query.filter_by(
                    network_id=net.id, round_id=round_row.id, partner_id=partner.id,
                ).all()
                if x.status in ('pending_report', 'reported', 'verified', 'flagged')
            )
            restriction = round_row.restricted_remaining_for(
                partner.id, disbursed_to_partner,
            )
            if restriction['has_restriction'] and amount_f > restriction['remaining']:
                return jsonify({
                    'success': False,
                    'error': (
                        f'donor restriction exceeded: ${amount_f:,.0f} requested but '
                        f'only ${restriction["remaining"]:,.0f} of the '
                        f'${restriction["restricted_total"]:,.0f} restricted budget '
                        f'remains for this partner'
                    ),
                    'restriction': restriction,
                }), 422

    n_cosigners_needed = cosigners_required_for(amount_f)
    needs_cosign = n_cosigners_needed > 0
    initial_status = 'pending_cosign' if needs_cosign else 'pending_report'

    d = ProximateDisbursement(
        network_id=net.id,
        partner_id=partner.id,
        round_id=payload.get('round_id'),
        disbursement_method_id=payload.get('disbursement_method_id'),
        amount_usd=amount,
        purpose=(payload.get('purpose') or '').strip()[:500] or None,
        sent_by_user_id=current_user.id,
        sent_at=now,
        status=initial_status,
        report_due_at=now + timedelta(days=window_days),
        cosigners_required=n_cosigners_needed,
        # Token only issued when money has cleared signers
        report_token=(
            None if needs_cosign else ProximateDisbursement.make_report_token()
        ),
    )
    db.session.add(d)
    db.session.commit()

    # Phase 669 — ISF annotation flag travels with the audit row so
    # auditors can later confirm the OB attested to the SoP §3 gate.
    isf_cleared = bool(payload.get('isf_cleared'))
    AuditChainEntry.append(
        action='proximate.disbursement.recorded',
        actor_email=current_user.email,
        subject_kind='proximate_disbursement',
        subject_id=d.id,
        details={
            'partner_id': partner.id,
            'partner_name': partner.name,
            'amount_usd': amount_f,
            'round_id': d.round_id,
            'report_due_at': d.report_due_at.isoformat(),
            'requires_cosign': needs_cosign,
            'isf_cleared': isf_cleared,
        },
    )
    if not needs_cosign:
        AuditChainEntry.append(
            action='proximate.report.obligation_opened',
            actor_email=current_user.email,
            subject_kind='proximate_disbursement',
            subject_id=d.id,
            details={
                'partner_id': partner.id,
                'due_at': d.report_due_at.isoformat(),
                'token_present': True,
            },
        )
    else:
        AuditChainEntry.append(
            action='proximate.disbursement.cosign_required',
            actor_email=current_user.email,
            subject_kind='proximate_disbursement',
            subject_id=d.id,
            details={
                'threshold_usd': COSIGN_THRESHOLD_USD,
                'amount_usd': amount_f,
                'cosigners_required': n_cosigners_needed,
            },
        )
    logger.info(
        f"Proximate: disbursement recorded id={d.id} partner_id={partner.id} "
        f"amount=${amount_f:.2f} status={initial_status}"
    )
    return jsonify({'success': True, 'disbursement': d.to_dict()})


@proximate_bp.route('/disbursements/<int:disbursement_id>/assign-verifier', methods=['POST'])
@ob_required
def api_assign_verifier(disbursement_id):
    """Phase 673 — randomly pick a third-party verifier (an approved
    endorser, NOT one of the partner's own endorsers, NOT a signer on
    this disbursement) and assign them to attest. Returns the picked
    user id; the OB shares the link out-of-band for now (no email yet).
    """
    import random
    from app.models import Endorser, Endorsement

    net, err = _require_proximate_tenant()
    if err:
        return err
    d = ProximateDisbursement.query.filter_by(
        id=disbursement_id, network_id=net.id,
    ).first()
    if not d:
        return jsonify({'success': False, 'error': 'not found'}), 404
    if d.verifier_user_id:
        return jsonify({
            'success': False,
            'error': f'verifier already assigned (user_id={d.verifier_user_id})',
        }), 409
    if d.status not in ('reported', 'pending_report'):
        return jsonify({
            'success': False,
            'error': f'cannot assign verifier with status={d.status}',
        }), 400

    partner_endorsers = {
        e.endorser_id for e in Endorsement.query.filter_by(partner_id=d.partner_id).all()
    }
    # Exclude: partner's own endorsers + sender + every cosigner
    excluded_user_ids = set()
    if d.sent_by_user_id:
        excluded_user_ids.add(d.sent_by_user_id)
    if d.cosigned_by_user_id:
        excluded_user_ids.add(d.cosigned_by_user_id)
    for c in d._cosigners_extra():  # noqa: SLF001
        if c.get('user_id'):
            excluded_user_ids.add(c['user_id'])
    partner = ProximatePartner.query.get(d.partner_id) if d.partner_id else None
    if partner and partner.nominated_by_user_id:
        excluded_user_ids.add(partner.nominated_by_user_id)

    eligible = (
        Endorser.query
        .filter_by(network_id=net.id, status='approved')
        .filter(~Endorser.id.in_(partner_endorsers) if partner_endorsers else True)
        .filter(
            (~Endorser.user_id.in_(excluded_user_ids))
            if excluded_user_ids else True
        )
        .all()
    )
    if not eligible:
        return jsonify({
            'success': False,
            'error': 'no eligible verifier — pool exhausted by independence rules',
        }), 409

    picked = random.choice(eligible)
    d.verifier_user_id = picked.user_id
    d.verifier_assigned_at = datetime.now(timezone.utc)
    db.session.commit()

    AuditChainEntry.append(
        action='proximate.disbursement.verifier_assigned',
        actor_email=current_user.email,
        subject_kind='proximate_disbursement',
        subject_id=d.id,
        details={
            'verifier_user_id': picked.user_id,
            'verifier_endorser_id': picked.id,
            'eligible_pool_size': len(eligible),
        },
    )
    return jsonify({
        'success': True,
        'verifier_user_id': picked.user_id,
        'verifier_endorser_id': picked.id,
        'verifier_name': picked.full_name if hasattr(picked, 'full_name') else None,
    })


@proximate_bp.route('/disbursements/<int:disbursement_id>/verifier-attest', methods=['POST'])
@login_required
def api_verifier_attest(disbursement_id):
    """Phase 673 — assigned verifier records their independent verdict.
    Only the assigned user can attest; their verdict is captured beside
    (not replacing) the OB's. Three-eyes principle."""
    net, err = _require_proximate_tenant()
    if err:
        return err
    d = ProximateDisbursement.query.filter_by(
        id=disbursement_id, network_id=net.id,
    ).first()
    if not d:
        return jsonify({'success': False, 'error': 'not found'}), 404
    if d.verifier_user_id != current_user.id:
        return jsonify({
            'success': False,
            'error': 'not the assigned verifier for this disbursement',
        }), 403
    if d.verifier_verdict:
        return jsonify({
            'success': False,
            'error': 'already attested',
        }), 409
    payload = request.get_json(silent=True) or {}
    verdict = (payload.get('verdict') or '').lower()
    if verdict not in ('confirmed', 'disputed'):
        return jsonify({
            'success': False,
            'error': 'verdict must be confirmed|disputed',
        }), 400
    notes = (payload.get('notes') or '').strip()[:2000] or None
    d.verifier_verdict = verdict
    d.verifier_notes = notes
    d.verifier_attested_at = datetime.now(timezone.utc)
    db.session.commit()
    AuditChainEntry.append(
        action=f'proximate.disbursement.verifier_{verdict}',
        actor_email=current_user.email,
        subject_kind='proximate_disbursement',
        subject_id=d.id,
        details={
            'verdict': verdict,
            'notes_len': len(notes or ''),
        },
    )
    return jsonify({'success': True, 'disbursement': d.to_dict()})


@proximate_bp.route('/disbursements/<int:disbursement_id>/cosign', methods=['POST'])
@ob_required
def api_cosign_disbursement(disbursement_id):
    """Phase 662 + Phase 668 — Allocation Committee tier ladder cosign.
    COI guard: the original sender cannot cosign; previously-recorded
    cosigners cannot cosign again. The disbursement flips to
    pending_report (and emits the report token) only once
    cosigners_count >= cosigners_required."""
    from datetime import timedelta
    net, err = _require_proximate_tenant()
    if err:
        return err
    d = ProximateDisbursement.query.filter_by(
        id=disbursement_id, network_id=net.id,
    ).first()
    if not d:
        return jsonify({'success': False, 'error': 'not found'}), 404
    if d.status != 'pending_cosign':
        return jsonify({
            'success': False,
            'error': f'not awaiting cosign (status={d.status})',
        }), 409
    if d.sent_by_user_id == current_user.id:
        return jsonify({
            'success': False,
            'error': 'sender cannot cosign their own disbursement',
        }), 403
    # No double-cosign by the same user
    existing_extra_ids = {
        e.get('user_id') for e in d._cosigners_extra()  # noqa: SLF001
    }
    if (
        d.cosigned_by_user_id == current_user.id
        or current_user.id in existing_extra_ids
    ):
        return jsonify({
            'success': False,
            'error': 'you have already cosigned this disbursement',
        }), 409

    d.append_cosigner(current_user.id)

    required = d.cosigners_required or 0
    have = d._cosigners_count()  # noqa: SLF001
    fully_signed = have >= required

    if fully_signed:
        d.status = 'pending_report'
        d.report_token = ProximateDisbursement.make_report_token()
        window_days = DEFAULT_REPORT_WINDOW_DAYS
        d.report_due_at = datetime.now(timezone.utc) + timedelta(days=window_days)
    db.session.commit()

    AuditChainEntry.append(
        action='proximate.disbursement.cosigned',
        actor_email=current_user.email,
        subject_kind='proximate_disbursement',
        subject_id=d.id,
        details={
            'sender_user_id': d.sent_by_user_id,
            'cosigner_user_id': current_user.id,
            'amount_usd': float(d.amount_usd),
            'cosigners_have': have,
            'cosigners_required': required,
            'fully_signed': fully_signed,
        },
    )
    if fully_signed:
        AuditChainEntry.append(
            action='proximate.report.obligation_opened',
            actor_email=current_user.email,
            subject_kind='proximate_disbursement',
            subject_id=d.id,
            details={
                'partner_id': d.partner_id,
                'due_at': d.report_due_at.isoformat(),
                'token_present': True,
            },
        )
    return jsonify({'success': True, 'disbursement': d.to_dict()})


@proximate_bp.route('/disbursement-reports/<token>', methods=['GET'])
def api_get_disbursement_by_token(token):
    """Public: resolve a report token to its disbursement so the
    partner can see what to report on. No auth required — the token
    IS the credential. Returns minimal partner-facing shape."""
    d = ProximateDisbursement.query.filter_by(report_token=token).first()
    if not d:
        return jsonify({'success': False, 'error': 'invalid token'}), 404
    return jsonify({
        'success': True,
        'disbursement': {
            'id': d.id,
            'partner_name': d.partner.name if d.partner else None,
            'amount_usd': float(d.amount_usd) if d.amount_usd else None,
            'purpose': d.purpose,
            'sent_at': d.sent_at.isoformat() if d.sent_at else None,
            'report_due_at': d.report_due_at.isoformat() if d.report_due_at else None,
            'status': d.status,
            'has_report': d.report_submitted_at is not None,
            # Phase 660 — partner-facing acknowledgement, if Adeso has sent one
            'ack_message': d.ack_message,
            'ack_message_at': (
                d.ack_message_at.isoformat() if d.ack_message_at else None
            ),
        },
    })


@proximate_bp.route('/disbursements/<int:disbursement_id>/acknowledge', methods=['POST'])
@ob_required
def api_acknowledge_disbursement(disbursement_id):
    """Phase 660 — OB sends a short acknowledgement message to the
    partner. Surfaces on the same token URL the partner returns to.
    No transport (email/SMS) required — the partner has the link.
    """
    net, err = _require_proximate_tenant()
    if err:
        return err
    d = ProximateDisbursement.query.filter_by(
        id=disbursement_id, network_id=net.id,
    ).first()
    if not d:
        return jsonify({'success': False, 'error': 'not found'}), 404
    payload = request.get_json(silent=True) or {}
    message = (payload.get('message') or '').strip()
    if not message:
        return jsonify({'success': False, 'error': 'message required'}), 400
    if len(message) > 2000:
        return jsonify({'success': False, 'error': 'message too long (max 2000)'}), 400
    d.ack_message = message
    d.ack_message_at = datetime.now(timezone.utc)
    d.ack_by_user_id = current_user.id
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.disbursement.acknowledged',
        actor_email=current_user.email,
        subject_kind='proximate_disbursement',
        subject_id=d.id,
        details={'message_len': len(message)},
    )
    return jsonify({
        'success': True,
        'disbursement': d.to_dict(),
    })


@proximate_bp.route('/disbursement-reports/<token>/attachment', methods=['POST'])
def api_attach_disbursement_evidence(token):
    """Phase 655 — public file attachment endpoint for the report form.
    Token-scoped: the URL token is the only credential. Form field
    `kind` is 'voice' or 'photo'. The uploaded file is saved into the
    standard UPLOAD_FOLDER and a Document row is created and linked to
    the disbursement (report_voice_doc_id or report_photo_doc_id).

    Idempotency: rejected if the disbursement is already submitted
    (status != pending_report), since the report payload is closed at
    that point.
    """
    import uuid
    from werkzeug.utils import secure_filename
    from flask import current_app as cap
    from app.models import Document

    d = ProximateDisbursement.query.filter_by(report_token=token).first()
    if not d:
        return jsonify({'success': False, 'error': 'invalid token'}), 404
    if d.status != 'pending_report':
        return jsonify({
            'success': False,
            'error': 'report already submitted; attachments closed',
        }), 409

    kind = (request.form.get('kind') or '').strip().lower()
    if kind not in ('voice', 'photo'):
        return jsonify({'success': False, 'error': 'kind must be voice|photo'}), 400

    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'no file provided'}), 400
    file = request.files['file']
    if not file.filename:
        return jsonify({'success': False, 'error': 'no file selected'}), 400

    PHOTO_EXTS = {'jpg', 'jpeg', 'png', 'webp', 'gif'}
    VOICE_EXTS = {'webm', 'ogg', 'oga', 'mp3', 'm4a', 'wav', 'aac'}
    allowed = PHOTO_EXTS if kind == 'photo' else VOICE_EXTS
    max_bytes = 8 * 1024 * 1024 if kind == 'photo' else 5 * 1024 * 1024

    content_length = request.content_length
    if content_length and content_length > max_bytes:
        return jsonify({
            'success': False,
            'error': f'file too large ({content_length / (1024*1024):.1f} MB; max {max_bytes // (1024*1024)} MB)',
        }), 413

    original_filename = secure_filename(file.filename)
    ext = original_filename.rsplit('.', 1)[-1].lower() if '.' in original_filename else ''
    if ext not in allowed:
        return jsonify({
            'success': False,
            'error': f'file type not allowed for {kind} (got .{ext})',
        }), 400

    stored_filename = f"proximate_{kind}_{uuid.uuid4().hex}.{ext}"
    filepath = os.path.join(cap.config['UPLOAD_FOLDER'], stored_filename)
    file.save(filepath)
    file_size = os.path.getsize(filepath)
    if file_size < 100:
        os.remove(filepath)
        return jsonify({'success': False, 'error': 'file too small to be valid'}), 400

    mime_map = {
        'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
        'webp': 'image/webp', 'gif': 'image/gif',
        'webm': 'audio/webm', 'ogg': 'audio/ogg', 'oga': 'audio/ogg',
        'mp3': 'audio/mpeg', 'm4a': 'audio/mp4', 'wav': 'audio/wav',
        'aac': 'audio/aac',
    }
    doc = Document(
        original_filename=original_filename,
        stored_filename=stored_filename,
        file_size=file_size,
        mime_type=mime_map.get(ext),
        doc_type=f'proximate_{kind}',
    )
    db.session.add(doc)
    db.session.flush()
    if kind == 'photo':
        d.report_photo_doc_id = doc.id
    else:
        d.report_voice_doc_id = doc.id
    db.session.commit()

    AuditChainEntry.append(
        action='proximate.report.attachment_added',
        actor_email=f'token:{token[:8]}…',
        subject_kind='proximate_disbursement',
        subject_id=d.id,
        details={
            'kind': kind, 'doc_id': doc.id, 'size_bytes': file_size,
        },
    )
    logger.info(
        f"Proximate: report attachment doc_id={doc.id} kind={kind} "
        f"disbursement_id={d.id}"
    )

    # Phase 669 — fire Whisper transcription in the background for voice
    # attachments. Failures are silent (transcript stays None); the OB
    # still gets the audio player and any client-side transcript.
    if kind == 'voice':
        try:
            from app.services.whisper_service import transcribe_audio
            from app.utils.background import submit_task
            from flask import current_app as _ca
            _app = _ca._get_current_object()
            voice_path = filepath
            voice_filename = stored_filename
            disbursement_id = d.id

            def _run_transcribe():
                with _app.app_context():
                    try:
                        with open(voice_path, 'rb') as f:
                            audio = f.read()
                        result = transcribe_audio(
                            audio, language='ar', filename=voice_filename,
                        )
                        text = (result.get('text') or '').strip()
                        if text:
                            target = ProximateDisbursement.query.get(disbursement_id)
                            if target:
                                target.report_voice_transcript = text[:5000]
                                db.session.commit()
                                logger.info(
                                    f"Proximate: whisper transcript "
                                    f"d={disbursement_id} len={len(text)}"
                                )
                    except Exception as e:  # noqa: BLE001
                        logger.warning(
                            f"Proximate whisper background failed for "
                            f"disbursement {disbursement_id}: {e}"
                        )
            submit_task(_run_transcribe, task_type='proximate_voice_whisper')
        except Exception as e:  # noqa: BLE001
            logger.warning(
                f"Proximate whisper schedule failed for disbursement {d.id}: {e}"
            )

    return jsonify({
        'success': True,
        'doc_id': doc.id,
        'kind': kind,
        'size_bytes': file_size,
    })


@proximate_bp.route('/disbursements/<int:disbursement_id>/attachment/<kind>', methods=['GET'])
@login_required
def api_stream_disbursement_attachment(disbursement_id, kind):
    """Phase 657 — stream the photo or voice attachment to the OB so it
    can be rendered inline on the disbursement detail page. Auth gated
    to the Proximate tenant; the URL token is not accepted here (only
    Adeso staff need to view the evidence, partners just uploaded it)."""
    from flask import current_app as cap, send_file
    from app.models import Document

    if kind not in ('photo', 'voice'):
        return jsonify({'success': False, 'error': 'kind must be photo|voice'}), 400

    net, err = _require_proximate_tenant()
    if err:
        return err
    d = ProximateDisbursement.query.filter_by(
        id=disbursement_id, network_id=net.id,
    ).first()
    if not d:
        return jsonify({'success': False, 'error': 'not found'}), 404

    doc_id = d.report_photo_doc_id if kind == 'photo' else d.report_voice_doc_id
    if not doc_id:
        return jsonify({'success': False, 'error': f'no {kind} attached'}), 404
    doc = db.session.get(Document, doc_id)
    if not doc or not doc.stored_filename:
        return jsonify({'success': False, 'error': 'file not available'}), 404

    upload_dir = cap.config.get('UPLOAD_FOLDER')
    file_path = os.path.join(upload_dir, doc.stored_filename)
    if not os.path.exists(file_path):
        return jsonify({'success': False, 'error': 'file missing on disk'}), 410

    return send_file(
        file_path,
        mimetype=doc.mime_type or 'application/octet-stream',
        as_attachment=False,
        download_name=doc.original_filename or doc.stored_filename,
    )


@proximate_bp.route('/disbursement-reports/<token>', methods=['POST'])
def api_submit_disbursement_report(token):
    """Phase 652 — dual-auth report submission. The token in the URL
    is one valid credential; an authenticated session matching the
    disbursement's network is another. Either path produces the same
    submission record, audited with the source field so the OB can
    distinguish later.

    Body fields (5-question minimum form):
      activity_happened: bool      (Q1: did it happen?)
      people_helped: int           (Q2: how many people did it help?)
      issues: string               (Q3: any issues encountered?)
      spend_summary: string        (Q5, optional: how the money was spent)
      report_voice_doc_id: int     (Q4 attachment, optional)
      report_photo_doc_id: int     (Q4 attachment, optional)
      report_voice_transcript: string (optional transcript pre-computed by client)
    """
    d = ProximateDisbursement.query.filter_by(report_token=token).first()
    auth_source = 'token'
    if not d:
        # Allow logged-in OB/admin to submit a report by disbursement_id
        # as a fallback. Bot/spam not a concern here — must be auth'd.
        if not current_user.is_authenticated:
            return jsonify({'success': False, 'error': 'invalid token'}), 404
        payload_probe = request.get_json(silent=True) or {}
        dis_id = payload_probe.get('disbursement_id')
        if not dis_id:
            return jsonify({'success': False, 'error': 'invalid token'}), 404
        d = ProximateDisbursement.query.get(dis_id)
        if not d:
            return jsonify({'success': False, 'error': 'invalid token'}), 404
        # Tenant guard — auth'd path
        net, err = _require_proximate_tenant()
        if err:
            return err
        if d.network_id != net.id:
            return jsonify({'success': False, 'error': 'tenant mismatch'}), 403
        auth_source = 'session'
    elif current_user.is_authenticated:
        auth_source = 'session+token'

    if d.report_submitted_at is not None:
        return jsonify({
            'success': True,
            'already_submitted': True,
            'disbursement': d.to_dict(),
        })

    payload = request.get_json(silent=True) or {}
    import json as _json
    report_blob = {
        'activity_happened': bool(payload.get('activity_happened')),
        'people_helped': payload.get('people_helped'),
        'issues': (payload.get('issues') or '').strip()[:5000] or None,
        'spend_summary': (payload.get('spend_summary') or '').strip()[:5000] or None,
        'submitted_at': datetime.now(timezone.utc).isoformat(),
        'source': auth_source,
    }
    d.report_json = _json.dumps(report_blob, ensure_ascii=False)
    d.report_voice_doc_id = payload.get('report_voice_doc_id')
    d.report_photo_doc_id = payload.get('report_photo_doc_id')
    d.report_voice_transcript = (payload.get('report_voice_transcript') or '').strip() or None
    d.report_submitted_at = datetime.now(timezone.utc)
    d.status = 'reported'
    db.session.commit()

    actor = (
        current_user.email if current_user.is_authenticated
        else f'token:{token[:8]}…'
    )
    AuditChainEntry.append(
        action='proximate.report.submitted',
        actor_email=actor,
        subject_kind='proximate_disbursement',
        subject_id=d.id,
        details={
            'auth_source': auth_source,
            'activity_happened': report_blob['activity_happened'],
            'people_helped': report_blob['people_helped'],
            'has_voice': bool(d.report_voice_doc_id),
            'has_photo': bool(d.report_photo_doc_id),
        },
    )
    logger.info(
        f"Proximate: report submitted disbursement_id={d.id} "
        f"auth_source={auth_source} partner_id={d.partner_id}"
    )
    return jsonify({'success': True, 'disbursement': d.to_dict()})


@proximate_bp.route('/disbursements/<int:disbursement_id>/verify',
                    methods=['POST'])
@ob_required
def api_verify_disbursement_report(disbursement_id):
    """OB marks a submitted report verified or flagged. Closes the
    obligation in either direction."""
    net, err = _require_proximate_tenant()
    if err:
        return err
    d = ProximateDisbursement.query.filter_by(
        id=disbursement_id, network_id=net.id,
    ).first()
    if not d:
        return jsonify({'success': False, 'error': 'not found'}), 404
    if d.report_submitted_at is None:
        return jsonify({
            'success': False, 'error': 'no report to verify yet',
        }), 400
    payload = request.get_json(silent=True) or {}
    verdict = (payload.get('verdict') or 'verified').lower()
    if verdict not in ('verified', 'flagged'):
        return jsonify({'success': False, 'error': 'verdict must be verified|flagged'}), 400
    note = (payload.get('note') or '').strip()[:2000] or None
    # Phase 668 — when flagging, the OB can tag a structured reason so
    # the partner-detail Plan-B widget can surface alternate FSPs.
    # Allowed values mirror the SoP intervention categories.
    flagged_reason = None
    if verdict == 'flagged':
        flagged_reason = (payload.get('flagged_reason') or '').strip().lower() or None
        if flagged_reason and flagged_reason not in (
            'route_failure_security', 'fraud_suspected',
            'reporting_quality', 'identity_mismatch', 'other',
        ):
            return jsonify({
                'success': False, 'error': 'unknown flagged_reason',
            }), 400
    d.status = verdict
    d.flagged_reason = flagged_reason
    db.session.commit()
    AuditChainEntry.append(
        action=f'proximate.report.{verdict}',
        actor_email=current_user.email,
        subject_kind='proximate_disbursement',
        subject_id=d.id,
        details={'note': note, 'flagged_reason': flagged_reason},
    )

    # Phase 678 — spawn the 90-day outcome attestation obligation. The
    # partner gets a long-form token URL they can return to at the
    # 3-month mark to record whether the money actually helped.
    outcome = _spawn_outcome_obligation(d, net)
    return jsonify({
        'success': True,
        'disbursement': d.to_dict(),
        'outcome_obligation': outcome.to_dict() if outcome else None,
    })


def _spawn_outcome_obligation(d, net):
    """Phase 678 helper — idempotently create the 90-day outcome
    attestation row for a disbursement that just closed."""
    from app.models import ProximateOutcomeAttestation
    existing = ProximateOutcomeAttestation.query.filter_by(
        disbursement_id=d.id,
    ).first()
    if existing:
        return existing
    base_at = d.sent_at or datetime.now(timezone.utc)
    if base_at.tzinfo is None:
        base_at = base_at.replace(tzinfo=timezone.utc)
    due_at = base_at + timedelta(days=90)
    row = ProximateOutcomeAttestation(
        network_id=net.id,
        disbursement_id=d.id,
        partner_id=d.partner_id,
        round_id=d.round_id,
        due_at=due_at,
        report_token=ProximateOutcomeAttestation.make_report_token(),
        status='pending',
    )
    db.session.add(row)
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.outcome.spawned',
        actor_email='system',
        subject_kind='proximate_outcome_attestation',
        subject_id=row.id,
        details={
            'disbursement_id': d.id,
            'partner_id': d.partner_id,
            'due_at': due_at.isoformat(),
        },
    )
    return row


# =====================================================================
# Phase 679 — Partner outcome attestation form (90-day follow-up)
# =====================================================================
# Token-credentialed URL the partner returns to at the 3-month mark.
# Same dual-auth pattern as Phase 652 disbursement-reports.
#
# Form is intentionally short — 3 questions, voice + photo optional.
# The point is to capture sustained-impact data, not produce another
# narrative report.


@proximate_bp.route('/outcome-attestations/<token>', methods=['GET'])
def api_get_outcome_by_token(token):
    """Public: resolve an outcome token to its attestation row so the
    partner can see what to attest. Token IS the credential."""
    from app.models import ProximateOutcomeAttestation
    o = ProximateOutcomeAttestation.query.filter_by(
        report_token=token,
    ).first()
    if not o:
        return jsonify({'success': False, 'error': 'invalid token'}), 404
    d = ProximateDisbursement.query.get(o.disbursement_id)
    return jsonify({
        'success': True,
        'outcome': {
            'id': o.id,
            'status': o.status,
            'due_at': o.due_at.isoformat() if o.due_at else None,
            'spawned_at': o.spawned_at.isoformat() if o.spawned_at else None,
            'submitted_at': (
                o.submitted_at.isoformat() if o.submitted_at else None
            ),
            'answers': o.get_answers(),
            'voice_transcript': o.voice_transcript,
            'counterfactual_reflection': o.counterfactual_reflection,
            'ack_message': o.ack_message,
            'ack_message_at': (
                o.ack_message_at.isoformat() if o.ack_message_at else None
            ),
            'partner_name': d.partner.name if d and d.partner else None,
            'disbursement_amount_usd': (
                float(d.amount_usd) if d and d.amount_usd else None
            ),
            'disbursement_sent_at': (
                d.sent_at.isoformat() if d and d.sent_at else None
            ),
            'disbursement_purpose': d.purpose if d else None,
        },
    })


@proximate_bp.route('/outcome-attestations/<token>', methods=['POST'])
def api_submit_outcome_attestation(token):
    """Phase 679 — partner attests to 90-day sustained outcome.

    Body (3 short questions, all optional individually but at least
    one must be present):
      still_in_state_n: int      (Q1: how many of those originally
                                  helped are still in the same state?)
      total_intended_n: int      (Q1 denominator — partner's own count)
      sustained: string          (Q2: what sustained? — free text)
      not_sustained: string      (Q3: what did NOT sustain + what they
                                  would do differently)
      voice_doc_id: int          (optional voice attachment)
      photo_doc_id: int          (optional photo attachment)
      voice_transcript: string   (optional client-side transcript)
    """
    from app.models import ProximateOutcomeAttestation
    o = ProximateOutcomeAttestation.query.filter_by(
        report_token=token,
    ).first()
    auth_source = 'token'
    if not o:
        # Session fallback: authed user can submit by outcome id
        if not current_user.is_authenticated:
            return jsonify({'success': False, 'error': 'invalid token'}), 404
        payload_probe = request.get_json(silent=True) or {}
        oid = payload_probe.get('outcome_id')
        if not oid:
            return jsonify({'success': False, 'error': 'invalid token'}), 404
        o = ProximateOutcomeAttestation.query.get(oid)
        if not o:
            return jsonify({'success': False, 'error': 'invalid token'}), 404
        net, err = _require_proximate_tenant()
        if err:
            return err
        if o.network_id != net.id:
            return jsonify({'success': False, 'error': 'tenant mismatch'}), 403
        auth_source = 'session'
    elif current_user.is_authenticated:
        auth_source = 'session+token'

    if o.submitted_at is not None:
        return jsonify({
            'success': True,
            'already_submitted': True,
            'outcome': o.to_dict(),
        })

    import json as _json
    payload = request.get_json(silent=True) or {}

    def _int_or_none(v):
        try:
            return int(v) if v not in (None, '') else None
        except (TypeError, ValueError):
            return None

    answers = {
        'still_in_state_n': _int_or_none(payload.get('still_in_state_n')),
        'total_intended_n': _int_or_none(payload.get('total_intended_n')),
        'sustained': (payload.get('sustained') or '').strip()[:5000] or None,
        'not_sustained': (payload.get('not_sustained') or '').strip()[:5000] or None,
        'submitted_at': datetime.now(timezone.utc).isoformat(),
        'source': auth_source,
    }

    # Require at least ONE meaningful answer so we don't capture empty
    # attestations. The partner can submit minimal data — the absence
    # of any of them is meaningful and we want to surface it on the OB
    # side, but a fully-empty submission is a UI bug, not a signal.
    has_signal = (
        answers['still_in_state_n'] is not None
        or answers['sustained']
        or answers['not_sustained']
        or payload.get('voice_doc_id')
        or payload.get('photo_doc_id')
    )
    if not has_signal:
        return jsonify({
            'success': False,
            'error': 'attestation requires at least one answer or attachment',
        }), 400

    o.answers_json = _json.dumps(answers, ensure_ascii=False)
    o.voice_doc_id = payload.get('voice_doc_id')
    o.photo_doc_id = payload.get('photo_doc_id')
    o.voice_transcript = (payload.get('voice_transcript') or '').strip() or None
    # Phase 685 — partner can submit their counterfactual reflection
    # alongside the 3 core questions, OR return later via the same
    # token URL to add it. We accept both paths here.
    reflection = (payload.get('counterfactual_reflection') or '').strip()
    if reflection:
        o.counterfactual_reflection = reflection[:5000]
    o.submitted_at = datetime.now(timezone.utc)
    o.submitted_via = 'session' if auth_source != 'token' else 'token'
    o.status = 'submitted'
    db.session.commit()

    actor = (
        current_user.email if current_user.is_authenticated
        else f'token:{token[:8]}…'
    )
    AuditChainEntry.append(
        action='proximate.outcome.submitted',
        actor_email=actor,
        subject_kind='proximate_outcome_attestation',
        subject_id=o.id,
        details={
            'auth_source': auth_source,
            'still_in_state_n': answers['still_in_state_n'],
            'has_voice': bool(o.voice_doc_id),
            'has_photo': bool(o.photo_doc_id),
        },
    )
    return jsonify({'success': True, 'outcome': o.to_dict()})


@proximate_bp.route('/outcome-attestations/<token>/attachment', methods=['POST'])
def api_attach_outcome_evidence(token):
    """Token-scoped attachment endpoint for the outcome form. Same
    Document+UPLOAD_FOLDER pattern as Phase 655 disbursement-reports
    attachment. `kind` ∈ {voice, photo}."""
    import uuid
    from werkzeug.utils import secure_filename
    from flask import current_app as cap
    from app.models import Document, ProximateOutcomeAttestation

    o = ProximateOutcomeAttestation.query.filter_by(
        report_token=token,
    ).first()
    if not o:
        return jsonify({'success': False, 'error': 'invalid token'}), 404
    if o.submitted_at is not None:
        return jsonify({
            'success': False,
            'error': 'attestation already submitted; attachments closed',
        }), 409

    kind = (request.form.get('kind') or '').strip().lower()
    if kind not in ('voice', 'photo'):
        return jsonify({'success': False, 'error': 'kind must be voice|photo'}), 400

    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'no file provided'}), 400
    file = request.files['file']
    if not file.filename:
        return jsonify({'success': False, 'error': 'no file selected'}), 400

    PHOTO_EXTS = {'jpg', 'jpeg', 'png', 'webp', 'gif'}
    VOICE_EXTS = {'webm', 'ogg', 'oga', 'mp3', 'm4a', 'wav', 'aac'}
    allowed = PHOTO_EXTS if kind == 'photo' else VOICE_EXTS
    max_bytes = 8 * 1024 * 1024 if kind == 'photo' else 5 * 1024 * 1024

    content_length = request.content_length
    if content_length and content_length > max_bytes:
        return jsonify({
            'success': False,
            'error': f'file too large (max {max_bytes // (1024*1024)} MB)',
        }), 413

    original_filename = secure_filename(file.filename)
    ext = original_filename.rsplit('.', 1)[-1].lower() if '.' in original_filename else ''
    if ext not in allowed:
        return jsonify({
            'success': False,
            'error': f'file type not allowed for {kind} (got .{ext})',
        }), 400

    upload_folder = cap.config.get('UPLOAD_FOLDER') or os.getenv(
        'UPLOAD_FOLDER', '/tmp/uploads'
    )
    os.makedirs(upload_folder, exist_ok=True)
    stored_filename = f'outcome_{o.id}_{kind}_{uuid.uuid4().hex[:8]}.{ext}'
    file_path = os.path.join(upload_folder, stored_filename)
    file.save(file_path)
    file_size = os.path.getsize(file_path)

    doc = Document(
        filename=stored_filename,
        original_filename=original_filename,
        doc_type=f'proximate_outcome_{kind}',
        file_path=file_path,
        file_size=file_size,
        mime_type=file.mimetype,
        org_id=o.partner_id,
    )
    db.session.add(doc)
    db.session.flush()
    if kind == 'voice':
        o.voice_doc_id = doc.id
    else:
        o.photo_doc_id = doc.id
    db.session.commit()

    return jsonify({
        'success': True,
        'document_id': doc.id,
        'kind': kind,
        'size': file_size,
    })


# =====================================================================
# Phase 681 — Proximate donor registration (admin only)
# =====================================================================
# Donors are admin-registered (no self-service signup in v0 — needs a
# KYC story Adeso designs separately). Registration creates a
# ProximateDonor row tied to a user; the donor portal (Phase 682)
# reads from this table and the user authenticates normally.


def _require_donor():
    """Return (donor_row, error_response). The currently-logged-in
    user must have a ProximateDonor row scoped to the active network."""
    from app.models import ProximateDonor
    net, err = _require_proximate_tenant()
    if err:
        return None, err
    donor = ProximateDonor.query.filter_by(
        network_id=net.id, primary_user_id=current_user.id,
    ).first()
    if not donor:
        return None, (jsonify({
            'success': False, 'error': 'donor registration required',
        }), 403)
    return donor, None


@proximate_bp.route('/donors', methods=['POST'])
@ob_required
def api_register_donor():
    """Phase 681 — admin/OB registers a funder as a Proximate donor."""
    from app.models import ProximateDonor, User
    net, err = _require_proximate_tenant()
    if err:
        return err
    payload = request.get_json(silent=True) or {}
    primary_user_id = payload.get('primary_user_id')
    if not primary_user_id:
        return jsonify({
            'success': False, 'error': 'primary_user_id required',
        }), 400
    user = User.query.get(int(primary_user_id))
    if not user:
        return jsonify({'success': False, 'error': 'user not found'}), 404
    display_name = (payload.get('display_name') or '').strip()[:200]
    if not display_name:
        return jsonify({
            'success': False, 'error': 'display_name required',
        }), 400

    existing = ProximateDonor.query.filter_by(
        network_id=net.id, primary_user_id=user.id,
    ).first()
    if existing:
        return jsonify({
            'success': True, 'already_registered': True,
            'donor': existing.to_dict(),
        })

    donor = ProximateDonor(
        network_id=net.id,
        org_id=getattr(user, 'org_id', None) or payload.get('org_id'),
        primary_user_id=user.id,
        display_name=display_name,
        contact_email=(payload.get('contact_email') or user.email)[:200],
        auto_email_closing_pack=bool(
            payload.get('auto_email_closing_pack', True)
        ),
        registered_by_user_id=current_user.id,
    )
    subs = payload.get('subscribed_round_ids') or []
    if subs:
        donor.set_subscribed_round_ids(subs)
    db.session.add(donor)
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.donor.registered',
        actor_email=current_user.email,
        subject_kind='proximate_donor',
        subject_id=donor.id,
        details={
            'display_name': donor.display_name,
            'primary_user_id': donor.primary_user_id,
            'subscribed_count': len(donor.subscribed_round_ids()),
        },
    )
    return jsonify({'success': True, 'donor': donor.to_dict()})


@proximate_bp.route('/donors', methods=['GET'])
@ob_required
def api_list_donors():
    """OB-facing list of donors registered on the Proximate tenant."""
    from app.models import ProximateDonor
    net, err = _require_proximate_tenant()
    if err:
        return err
    donors = ProximateDonor.query.filter_by(
        network_id=net.id,
    ).order_by(ProximateDonor.created_at.desc()).all()
    return jsonify({
        'success': True,
        'donors': [d.to_dict() for d in donors],
    })


@proximate_bp.route('/donors/me', methods=['GET'])
@login_required
def api_my_donor():
    """Currently-logged-in user's own donor row, if any. Returns 404
    if the user is not a registered donor on this tenant — the
    portal uses that to redirect to a 'request access' page."""
    from app.models import ProximateDonor
    net, err = _require_proximate_tenant()
    if err:
        return err
    donor = ProximateDonor.query.filter_by(
        network_id=net.id, primary_user_id=current_user.id,
    ).first()
    if not donor:
        return jsonify({'success': False, 'error': 'not a donor'}), 404
    return jsonify({'success': True, 'donor': donor.to_dict()})


@proximate_bp.route('/donors/me/subscribe', methods=['POST'])
@login_required
def api_donor_subscribe():
    """The donor opts into following one or more rounds."""
    donor, err = _require_donor()
    if err:
        return err
    payload = request.get_json(silent=True) or {}
    add = payload.get('round_ids') or []
    if not isinstance(add, list) or not add:
        return jsonify({
            'success': False, 'error': 'round_ids list required',
        }), 400
    current = set(donor.subscribed_round_ids())
    current.update(int(x) for x in add if x is not None)
    donor.set_subscribed_round_ids(list(current))
    db.session.commit()
    return jsonify({'success': True, 'donor': donor.to_dict()})


@proximate_bp.route('/donors/me/unsubscribe', methods=['POST'])
@login_required
def api_donor_unsubscribe():
    """The donor drops a round from their watchlist."""
    donor, err = _require_donor()
    if err:
        return err
    payload = request.get_json(silent=True) or {}
    drop = payload.get('round_ids') or []
    if not isinstance(drop, list) or not drop:
        return jsonify({
            'success': False, 'error': 'round_ids list required',
        }), 400
    current = set(donor.subscribed_round_ids())
    current.difference_update(int(x) for x in drop if x is not None)
    donor.set_subscribed_round_ids(list(current))
    db.session.commit()
    return jsonify({'success': True, 'donor': donor.to_dict()})


@proximate_bp.route('/donors/me/ask', methods=['POST'])
@login_required
def api_donor_ask():
    """Phase 683 — donor AI Q&A scoped to their subscribed rounds.

    The donor asks a free-form question; we build a compact context
    bundle (per-round stats + recent audit events + outcome summary)
    and call CopilotService. Replay-logged so the OB can audit what
    AI told donors.

    Honest scope: this is grounded ONLY in the donor's subscribed
    rounds (or the fallback all-rounds-listing). It will not answer
    questions about partners outside that scope; the prompt says so.
    """
    from app.models import ProximateOutcomeAttestation
    from app.services.copilot_service import CopilotService
    from app.services.replay_service import log_replayable_ai_call

    donor, err = _require_donor()
    if err:
        return err
    payload = request.get_json(silent=True) or {}
    question = (payload.get('question') or '').strip()
    if not question:
        return jsonify({'success': False, 'error': 'question required'}), 400
    if len(question) > 1000:
        return jsonify({
            'success': False, 'error': 'question too long (max 1000)',
        }), 400

    subscribed = donor.subscribed_round_ids()
    rounds_q = ProximateRound.query.filter_by(network_id=donor.network_id)
    if subscribed:
        rounds_q = rounds_q.filter(ProximateRound.id.in_(subscribed))
    rounds = rounds_q.order_by(ProximateRound.created_at.desc()).limit(8).all()

    if not rounds:
        return jsonify({
            'success': True,
            'answer': (
                "I don't have any rounds to look at yet. Once you "
                "subscribe to a round (or the OB seeds one), I can "
                "answer questions about it."
            ),
            'meta': {'grounded': False},
        })

    # Compact context bundle. Keep small so we stay within prompt cache.
    ctx_rounds = []
    for r in rounds:
        dis = ProximateDisbursement.query.filter_by(
            network_id=donor.network_id, round_id=r.id,
        ).all()
        outcomes = ProximateOutcomeAttestation.query.filter_by(
            network_id=donor.network_id, round_id=r.id,
        ).all()
        status_counts = {}
        partners = set()
        disbursed = 0.0
        for d in dis:
            status_counts[d.status] = status_counts.get(d.status, 0) + 1
            partners.add(d.partner_id)
            if d.status in ('pending_report', 'reported', 'verified', 'flagged'):
                disbursed += float(d.amount_usd or 0)
        ctx_rounds.append({
            'id': r.id,
            'title': r.title,
            'status': r.status,
            'trigger': r.trigger_type,
            'envelope_usd': float(r.envelope_usd) if r.envelope_usd else 0,
            'disbursed_usd': disbursed,
            'partners_served': len(partners),
            'status_counts': status_counts,
            'outcome_total': len(outcomes),
            'outcome_attested': sum(1 for o in outcomes if o.submitted_at),
            'outcome_verified': sum(1 for o in outcomes if o.status == 'verified'),
            'flagged_count': status_counts.get('flagged', 0),
        })

    import json as _json
    system = (
        "You are the Proximate Fund donor portal AI assistant. You answer "
        "questions about a single donor's subscribed funding rounds using "
        "ONLY the structured data provided. Rules:\n"
        "1. Cite specific round titles and numbers from the data when "
        "making claims. Never invent figures.\n"
        "2. If the donor's question is not answerable from the data "
        "provided, say so clearly. Do not speculate.\n"
        "3. Be concise — donors are busy. 3-5 sentences typical.\n"
        "4. Stay neutral on partners — do not endorse or judge specific "
        "partners; only describe what the data shows.\n"
        "5. If the question is about a round, partner, or disbursement "
        "outside this donor's scope, redirect them to ask Adeso directly."
    )
    user_msg = (
        f"Donor: {donor.display_name}\n\n"
        f"Subscribed rounds data:\n{_json.dumps(ctx_rounds, indent=2)}\n\n"
        f"Question: {question}"
    )

    t0_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    result = CopilotService._call(
        system=system, user=user_msg, max_tokens=600, lang='en',
    )
    elapsed_ms = int(datetime.now(timezone.utc).timestamp() * 1000) - t0_ms

    if not result.get('ok'):
        return jsonify({
            'success': False,
            'error': result.get('message') or 'AI unavailable',
            'code': result.get('code'),
        }), 503

    # CopilotService returns {'ok': True, 'data': {'text': ...}, 'meta': {...}}
    answer = ((result.get('data') or {}).get('text') or '').strip()

    try:
        call_id = log_replayable_ai_call(
            endpoint='proximate_donor_ask',
            user_id=donor.primary_user_id,
            input_text=question,
            output_text=answer,
            duration_ms=elapsed_ms,
        )
    except Exception:
        call_id = None
        logger.exception('Failed to log proximate_donor_ask replay row')

    AuditChainEntry.append(
        action='proximate.donor.asked',
        actor_email=current_user.email,
        subject_kind='proximate_donor',
        subject_id=donor.id,
        details={
            'question_len': len(question),
            'answer_len': len(answer),
            'rounds_scope': [r['id'] for r in ctx_rounds],
            'call_id': call_id,
        },
    )

    return jsonify({
        'success': True,
        'answer': answer,
        'meta': {
            'grounded': True,
            'rounds_scope': [r['id'] for r in ctx_rounds],
            'latency_ms': elapsed_ms,
            'call_id': call_id,
            'fallback_used': result.get('meta', {}).get('fallback_used', False),
        },
    })


# =====================================================================
# Phase 684 — Outcome rollup + counterfactual clustering
# =====================================================================
# Aggregates outcome attestation data for a round (or portfolio) into
# structured stats — coverage %, sustained-impact %, partner-level
# breakdowns — and uses Claude to cluster the free-text `sustained`,
# `not_sustained`, and `counterfactual_reflection` fields into themes.
#
# Surfaces on both OB admin (Phase 685 cron prompts later) and the
# donor portal — same endpoint, scoped by caller.


def _outcome_rollup_stats(outcomes):
    """Pure stats — no AI call. Used by both the rollup endpoint and
    the Phase 682 dashboard payload."""
    total = len(outcomes)
    submitted = [o for o in outcomes if o.submitted_at]
    verified = [o for o in outcomes if o.status == 'verified']
    disputed = [o for o in outcomes if o.status == 'disputed']
    sustained_pcts = []
    for o in submitted:
        ans = o.get_answers()
        s = ans.get('still_in_state_n')
        t = ans.get('total_intended_n')
        if isinstance(s, (int, float)) and isinstance(t, (int, float)) and t > 0:
            sustained_pcts.append(min(100, max(0, (s / t) * 100)))
    return {
        'total': total,
        'submitted': len(submitted),
        'verified': len(verified),
        'disputed': len(disputed),
        'attestation_rate': (
            round(len(submitted) / total * 100, 1) if total else 0
        ),
        'verification_rate': (
            round(len(verified) / len(submitted) * 100, 1) if submitted else 0
        ),
        'sustained_impact_avg_pct': (
            round(sum(sustained_pcts) / len(sustained_pcts), 1)
            if sustained_pcts else None
        ),
        'sustained_sample_size': len(sustained_pcts),
    }


@proximate_bp.route('/outcomes/rollup', methods=['GET'])
@login_required
def api_outcomes_rollup():
    """Phase 684 — structured rollup over outcome attestations.

    Query params:
      round_id (optional) — narrow to one round
      cluster=true (optional) — also run AI theme clustering on free-text

    Auth:
      OB sees the full tenant scope.
      Donor sees only their subscribed rounds (or all if fallback).
    """
    from app.models import ProximateOutcomeAttestation, ProximateDonor
    from app.services.copilot_service import CopilotService
    from app.services.replay_service import log_replayable_ai_call

    net, err = _require_proximate_tenant()
    if err:
        return err

    # Resolve caller's allowed round scope
    is_ob = getattr(current_user, 'role', '') == 'admin' or current_user.is_authenticated and any(
        m for m in getattr(current_user, 'network_memberships', [])
        if m.network_id == net.id and m.is_oversight_body
    )
    donor = ProximateDonor.query.filter_by(
        network_id=net.id, primary_user_id=current_user.id,
    ).first()
    if not is_ob and not donor:
        return jsonify({
            'success': False, 'error': 'access denied',
        }), 403

    round_id_arg = request.args.get('round_id', type=int)
    allowed_round_ids = None
    if donor and not is_ob:
        subs = donor.subscribed_round_ids()
        allowed_round_ids = set(subs) if subs else None  # None = all rounds

    outcomes_q = ProximateOutcomeAttestation.query.filter_by(network_id=net.id)
    if round_id_arg:
        if allowed_round_ids is not None and round_id_arg not in allowed_round_ids:
            return jsonify({
                'success': False, 'error': 'round not in your scope',
            }), 403
        outcomes_q = outcomes_q.filter_by(round_id=round_id_arg)
    elif allowed_round_ids is not None:
        outcomes_q = outcomes_q.filter(
            ProximateOutcomeAttestation.round_id.in_(allowed_round_ids)
        )
    outcomes = outcomes_q.all()

    stats = _outcome_rollup_stats(outcomes)

    # Pull the free-text fields for optional clustering.
    submitted = [o for o in outcomes if o.submitted_at]
    snippets = []
    for o in submitted:
        ans = o.get_answers()
        if ans.get('sustained'):
            snippets.append({
                'kind': 'sustained',
                'text': str(ans['sustained'])[:500],
                'outcome_id': o.id,
            })
        if ans.get('not_sustained'):
            snippets.append({
                'kind': 'not_sustained',
                'text': str(ans['not_sustained'])[:500],
                'outcome_id': o.id,
            })
        if o.counterfactual_reflection:
            snippets.append({
                'kind': 'counterfactual',
                'text': o.counterfactual_reflection[:500],
                'outcome_id': o.id,
            })

    want_cluster = request.args.get('cluster', '').lower() in ('1', 'true', 'yes')
    themes = None
    cluster_meta = None
    if want_cluster and snippets:
        import json as _json
        system = (
            "You cluster short partner attestations into themes. "
            "Return STRICT JSON shape: {themes: [{label, count, kind, "
            "example_outcome_ids: [int]}]}. Rules:\n"
            "1. Use 3-7 themes. Cluster similar attestations together.\n"
            "2. `label` is 2-5 words describing the theme.\n"
            "3. `kind` is one of: sustained, not_sustained, counterfactual.\n"
            "4. `count` is how many snippets fit this theme.\n"
            "5. `example_outcome_ids` lists up to 3 representative IDs.\n"
            "6. Do not invent themes that aren't represented in the data."
        )
        user_msg = (
            f"Snippets to cluster:\n{_json.dumps(snippets, indent=2)}\n\n"
            "Output STRICT JSON only, no commentary."
        )
        t0 = int(datetime.now(timezone.utc).timestamp() * 1000)
        result = CopilotService._call(
            system=system, user=user_msg, max_tokens=800, lang='en',
        )
        elapsed = int(datetime.now(timezone.utc).timestamp() * 1000) - t0
        if result.get('ok'):
            raw = ((result.get('data') or {}).get('text') or '').strip()
            try:
                parsed = _json.loads(raw)
                themes = parsed.get('themes', [])
            except (ValueError, TypeError):
                themes = None
            try:
                call_id = log_replayable_ai_call(
                    endpoint='proximate_outcome_cluster',
                    user_id=current_user.id,
                    input_text=f'{len(snippets)} snippets',
                    output_text=raw[:2000],
                    duration_ms=elapsed,
                )
            except Exception:
                call_id = None
            cluster_meta = {
                'snippets_clustered': len(snippets),
                'latency_ms': elapsed,
                'fallback_used': result.get('meta', {}).get('fallback_used', False),
                'call_id': call_id,
            }

    return jsonify({
        'success': True,
        'scope': {
            'round_id': round_id_arg,
            'is_ob': is_ob,
            'donor_id': donor.id if donor else None,
        },
        'stats': stats,
        'themes': themes,
        'cluster_meta': cluster_meta,
        'snippet_count': len(snippets),
    })


@proximate_bp.route('/donors/me/dashboard', methods=['GET'])
@login_required
def api_donor_dashboard():
    """Phase 682 — single-fetch portal payload. Returns the donor's
    subscribed rounds with per-round envelope/disbursed/outcome stats,
    plus a portfolio-level rollup. The portal page hydrates from this
    one endpoint; no per-round drill-down request is needed for the
    landing view.

    Honest scope: if the donor has no `subscribed_round_ids`, this
    falls back to listing ALL rounds in the tenant. Subscriptions are
    a v0 surface; the v1 will require an explicit subscribe before
    the donor sees anything (per the Phase 686 co-funding gate).
    """
    from app.models import (
        ProximateOutcomeAttestation, ProximatePartner,
    )
    donor, err = _require_donor()
    if err:
        return err

    subscribed = donor.subscribed_round_ids()
    q = ProximateRound.query.filter_by(network_id=donor.network_id)
    if subscribed:
        q = q.filter(ProximateRound.id.in_(subscribed))
    rounds = q.order_by(ProximateRound.created_at.desc()).all()

    out_rounds = []
    portfolio = {
        'envelope_usd': 0.0,
        'disbursed_usd': 0.0,
        'partners_served': set(),
        'disbursement_count': 0,
        'outcome_attested': 0,
        'outcome_verified': 0,
        'outcome_pending': 0,
        'flagged_count': 0,
    }
    for r in rounds:
        dis = ProximateDisbursement.query.filter_by(
            network_id=donor.network_id, round_id=r.id,
        ).all()
        status_counts = {}
        status_totals = {}
        partners = set()
        disbursed_usd = 0.0
        for d in dis:
            status_counts[d.status] = status_counts.get(d.status, 0) + 1
            amt = float(d.amount_usd) if d.amount_usd else 0.0
            status_totals[d.status] = status_totals.get(d.status, 0.0) + amt
            partners.add(d.partner_id)
            if d.status in ('pending_report', 'reported', 'verified', 'flagged'):
                disbursed_usd += amt

        outcomes = ProximateOutcomeAttestation.query.filter_by(
            network_id=donor.network_id, round_id=r.id,
        ).all()
        outcome_attested = sum(1 for o in outcomes if o.submitted_at)
        outcome_verified = sum(1 for o in outcomes if o.status == 'verified')
        outcome_pending = sum(1 for o in outcomes if o.status == 'pending')

        env_usd = float(r.envelope_usd) if r.envelope_usd else 0.0
        out_rounds.append({
            'id': r.id,
            'title': r.title,
            'status': r.status,
            'trigger_type': r.trigger_type,
            'envelope_usd': env_usd,
            'disbursed_usd': disbursed_usd,
            'disbursement_count': len(dis),
            'status_counts': status_counts,
            'status_totals_usd': status_totals,
            'partners_served': len(partners),
            'flagged_count': status_counts.get('flagged', 0),
            'outcome_attested': outcome_attested,
            'outcome_verified': outcome_verified,
            'outcome_pending': outcome_pending,
            'outcome_total': len(outcomes),
            'created_at': r.created_at.isoformat() if r.created_at else None,
            'report_pdf_url': f'/api/proximate/rounds/{r.id}/report.pdf',
        })

        portfolio['envelope_usd'] += env_usd
        portfolio['disbursed_usd'] += disbursed_usd
        portfolio['partners_served'].update(partners)
        portfolio['disbursement_count'] += len(dis)
        portfolio['outcome_attested'] += outcome_attested
        portfolio['outcome_verified'] += outcome_verified
        portfolio['outcome_pending'] += outcome_pending
        portfolio['flagged_count'] += status_counts.get('flagged', 0)

    portfolio['partners_served'] = len(portfolio['partners_served'])
    return jsonify({
        'success': True,
        'donor': donor.to_dict(),
        'using_fallback_listing': not subscribed,
        'rounds': out_rounds,
        'portfolio': portfolio,
    })


@proximate_bp.route('/partners/<int:partner_id>/alternate-routes', methods=['GET'])
@login_required
def api_partner_alternate_routes(partner_id):
    """Phase 668 — Plan-B FSP fallback. Lists the partner's other
    disbursement methods, sorted by priority, excluding any method
    that was the route for a recently-flagged disbursement with
    `route_failure_security` reason. The OB can pick the next one
    when the primary route is unreachable.
    """
    from app.models import PartnerDisbursementMethod, FinancialServiceProvider

    net, err = _require_proximate_tenant()
    if err:
        return err
    partner = ProximatePartner.query.filter_by(
        id=partner_id, network_id=net.id,
    ).first()
    if not partner:
        return jsonify({'success': False, 'error': 'not found'}), 404

    # Methods belonging to this partner. Cleared methods first.
    methods = (
        PartnerDisbursementMethod.query
        .filter_by(partner_id=partner.id)
        .order_by(
            PartnerDisbursementMethod.verified_at.desc().nullslast()
            if hasattr(PartnerDisbursementMethod.verified_at, 'desc')
            else PartnerDisbursementMethod.id.desc()
        )
        .all()
    )

    # Methods recently used in flagged disbursements with security
    # reason. Penalty: keep them in the list but mark them.
    failed_method_ids = set()
    recent_flagged = ProximateDisbursement.query.filter(
        ProximateDisbursement.partner_id == partner.id,
        ProximateDisbursement.status == 'flagged',
        ProximateDisbursement.flagged_reason == 'route_failure_security',
    ).all()
    for d in recent_flagged:
        if d.disbursement_method_id:
            failed_method_ids.add(d.disbursement_method_id)

    out = []
    for m in methods:
        fsp = FinancialServiceProvider.query.get(m.fsp_id) if m.fsp_id else None
        out.append({
            'id': m.id,
            'fsp_id': m.fsp_id,
            'fsp_name': fsp.name if fsp else None,
            'fsp_kind': fsp.kind if fsp else None,
            'status': m.status,
            'verified_at': (
                m.verified_at.isoformat() if m.verified_at else None
            ),
            'is_failed_route': m.id in failed_method_ids,
        })
    return jsonify({
        'success': True,
        'partner_id': partner.id,
        'methods': out,
    })


@proximate_bp.route('/monitoring/disbursement-nudge', methods=['POST'])
def api_cron_disbursement_nudge():
    """Phase 651 — replaces the monthly calendar cron. Scans
    disbursements whose report obligation is overdue and emits a
    single nudge audit row per disbursement (idempotent within a
    day). Replaces the previous monthly-flag emission.
    """
    from flask import current_app as cap
    secret = cap.config.get('CRON_SECRET') or os.getenv('CRON_SECRET')
    auth = request.headers.get('Authorization', '')
    if not secret or auth != f'Bearer {secret}':
        return jsonify({'success': False, 'error': 'forbidden'}), 403

    now = datetime.now(timezone.utc)
    day_key = now.strftime('%Y-%m-%d')

    overdue = ProximateDisbursement.query.filter(
        ProximateDisbursement.status == 'pending_report',
        ProximateDisbursement.report_due_at < now,
    ).all()
    nudged = 0
    for d in overdue:
        # Idempotency: skip if we already nudged this disbursement today
        recent = AuditChainEntry.query.filter_by(
            subject_kind='proximate_disbursement',
            subject_id=d.id,
            action='proximate.report.overdue_nudge',
        ).order_by(AuditChainEntry.seq.desc()).limit(3).all()
        already_today = any(
            day_key in (r.details_json or '') for r in recent
        )
        if already_today:
            continue
        days_overdue = (now - d.report_due_at).days
        AuditChainEntry.append(
            action='proximate.report.overdue_nudge',
            actor_email='cron-monitoring',
            subject_kind='proximate_disbursement',
            subject_id=d.id,
            details={
                'day': day_key,
                'days_overdue': days_overdue,
                'partner_id': d.partner_id,
                'amount_usd': float(d.amount_usd) if d.amount_usd else None,
            },
        )
        nudged += 1
    logger.info(f"Proximate cron: nudged {nudged} overdue disbursements for {day_key}")
    return jsonify({'success': True, 'nudged': nudged, 'day': day_key})


@proximate_bp.route('/monitoring/quarterly-counterfactual-prompt', methods=['POST'])
def api_cron_quarterly_counterfactual_prompt():
    """Phase 685 — quarterly counterfactual prompt cron.

    Finds outcome attestations where the partner has submitted the
    3-question form but hasn't yet provided a counterfactual reflection
    ('what would have happened without this disbursement?'). Emits one
    nudge audit row per attestation per quarter so the OB can see who
    still owes a reflection and the partner sees it on next visit to
    their token URL.

    Why quarterly (not monthly): reflection answers are most useful
    when the partner has time to step back from operations. Quarterly
    also avoids burnout if rounds run hot.
    """
    from app.models import ProximateOutcomeAttestation
    from flask import current_app as cap
    secret = cap.config.get('CRON_SECRET') or os.getenv('CRON_SECRET')
    auth = request.headers.get('Authorization', '')
    if not secret or auth != f'Bearer {secret}':
        return jsonify({'success': False, 'error': 'forbidden'}), 403

    now = datetime.now(timezone.utc)
    quarter_key = f'{now.year}Q{((now.month - 1) // 3) + 1}'
    cutoff = now - timedelta(days=30)

    targets = ProximateOutcomeAttestation.query.filter(
        ProximateOutcomeAttestation.submitted_at.isnot(None),
        ProximateOutcomeAttestation.submitted_at < cutoff,
        ProximateOutcomeAttestation.counterfactual_reflection.is_(None),
    ).all()
    nudged = 0
    for o in targets:
        recent = AuditChainEntry.query.filter_by(
            subject_kind='proximate_outcome_attestation',
            subject_id=o.id,
            action='proximate.counterfactual.prompt',
        ).order_by(AuditChainEntry.seq.desc()).limit(4).all()
        already_this_quarter = any(
            quarter_key in (r.details_json or '') for r in recent
        )
        if already_this_quarter:
            continue
        AuditChainEntry.append(
            action='proximate.counterfactual.prompt',
            actor_email='cron-monitoring',
            subject_kind='proximate_outcome_attestation',
            subject_id=o.id,
            details={
                'quarter': quarter_key,
                'disbursement_id': o.disbursement_id,
                'partner_id': o.partner_id,
                'days_since_submitted': (now - o.submitted_at.replace(
                    tzinfo=timezone.utc
                ) if o.submitted_at.tzinfo is None else now - o.submitted_at).days,
            },
        )
        nudged += 1
    logger.info(
        f'Proximate cron: quarterly counterfactual prompt {quarter_key} '
        f'nudged {nudged} attestations'
    )
    return jsonify({
        'success': True, 'nudged': nudged, 'quarter': quarter_key,
    })


@proximate_bp.route('/monitoring/outcome-due-nudge', methods=['POST'])
def api_cron_outcome_due_nudge():
    """Phase 678 — 90-day outcome attestation nudge. Scans pending
    outcome obligations that have crossed their due_at and emits one
    nudge audit row per day per obligation. The partner still has
    a long-lived token URL, but the OB sees overdue rows in the
    operator dashboard.
    """
    from app.models import ProximateOutcomeAttestation
    from flask import current_app as cap
    secret = cap.config.get('CRON_SECRET') or os.getenv('CRON_SECRET')
    auth = request.headers.get('Authorization', '')
    if not secret or auth != f'Bearer {secret}':
        return jsonify({'success': False, 'error': 'forbidden'}), 403

    now = datetime.now(timezone.utc)
    day_key = now.strftime('%Y-%m-%d')

    overdue = ProximateOutcomeAttestation.query.filter(
        ProximateOutcomeAttestation.status == 'pending',
        ProximateOutcomeAttestation.due_at < now,
    ).all()
    nudged = 0
    for o in overdue:
        recent = AuditChainEntry.query.filter_by(
            subject_kind='proximate_outcome_attestation',
            subject_id=o.id,
            action='proximate.outcome.overdue_nudge',
        ).order_by(AuditChainEntry.seq.desc()).limit(3).all()
        already_today = any(
            day_key in (r.details_json or '') for r in recent
        )
        if already_today:
            continue
        due = (
            o.due_at.replace(tzinfo=timezone.utc)
            if o.due_at.tzinfo is None else o.due_at
        )
        days_overdue = (now - due).days
        AuditChainEntry.append(
            action='proximate.outcome.overdue_nudge',
            actor_email='cron-monitoring',
            subject_kind='proximate_outcome_attestation',
            subject_id=o.id,
            details={
                'day': day_key,
                'days_overdue': days_overdue,
                'disbursement_id': o.disbursement_id,
                'partner_id': o.partner_id,
            },
        )
        nudged += 1
    logger.info(
        f"Proximate cron: nudged {nudged} overdue outcome attestations "
        f"for {day_key}"
    )
    return jsonify({'success': True, 'nudged': nudged, 'day': day_key})


# =====================================================================
# Phase 663 — Crisis Selector (Module 3.2 skeleton)
# =====================================================================
# Design doc §3.2 calls for a 3-piece feature: ranked dashboard +
# AI-drafted scenario brief + net-new feed ingestor. The ingestor is
# explicitly the ~2-week module. This phase ships the dashboard +
# brief drafter against the existing CrisisMonitoringRow infrastructure
# the NEAR tenant already populates. The Proximate operator gets a
# usable Sudan-scoped view; feed ingestion remains backlogged.

PROXIMATE_SCENARIO_TYPES = ('incubate', 'strengthen', 'enable')


@proximate_bp.route('/crisis-signals', methods=['POST'])
@login_required
def api_post_crisis_signal():
    """Phase 674 — manual crisis signal entry (Crisis Selector v0
    deepening). Any logged-in user in the Proximate tenant can log a
    signal; OB triages later. Once any signals exist for the tenant,
    the Crisis Selector dashboard surfaces them instead of falling
    back to cross-tenant Sudan rows.
    """
    from app.models.crisis_monitoring import CrisisSignal

    net, err = _require_proximate_tenant()
    if err:
        return err
    payload = request.get_json(silent=True) or {}
    country = (payload.get('country') or 'SDN').strip().upper()[:3]
    description = (payload.get('description') or '').strip()
    event_type = (payload.get('event_type') or '').strip()[:80] or None
    if not description or len(description) < 5:
        return jsonify({
            'success': False, 'error': 'description required (min 5 chars)',
        }), 400
    sig = CrisisSignal(
        network_id=net.id,
        submitted_by_org_id=getattr(current_user, 'org_id', None),
        submitted_by_user_id=current_user.id,
        country=country,
        event_type=event_type,
        description=description[:5000],
        status='pending',
    )
    db.session.add(sig)
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.crisis_signal.logged',
        actor_email=current_user.email,
        subject_kind='crisis_signal',
        subject_id=sig.id,
        details={
            'country': country, 'event_type': event_type,
        },
    )
    return jsonify({'success': True, 'signal': sig.to_dict()})


@proximate_bp.route('/crisis-signals', methods=['GET'])
@login_required
def api_list_crisis_signals():
    """Phase 674 — list signals scoped to the Proximate tenant."""
    from app.models.crisis_monitoring import CrisisSignal
    net, err = _require_proximate_tenant()
    if err:
        return err
    rows = (
        CrisisSignal.query
        .filter_by(network_id=net.id)
        .order_by(CrisisSignal.submitted_at.desc())
        .limit(200)
        .all()
    )
    return jsonify({
        'success': True,
        'signals': [s.to_dict() for s in rows],
    })


@proximate_bp.route('/crisis-selector', methods=['GET'])
@login_required
def api_crisis_selector():
    """Phase 663 — ranked crisis dashboard. Returns the most recent
    published CrisisMonitoringRow rows for the Proximate tenant. If the
    tenant hasn't published any yet, falls back to any published row
    with country code matching Sudan (SDN) so the team sees something
    concrete during UAT.
    """
    from app.models.crisis_monitoring import (
        CrisisMonitoringReport, CrisisMonitoringRow,
    )

    net, err = _require_proximate_tenant()
    if err:
        return err

    # Primary scope: this tenant's reports.
    rows = (
        db.session.query(CrisisMonitoringRow, CrisisMonitoringReport)
        .join(
            CrisisMonitoringReport,
            CrisisMonitoringRow.report_id == CrisisMonitoringReport.id,
        )
        .filter(
            CrisisMonitoringReport.network_id == net.id,
            CrisisMonitoringReport.status == 'published',
        )
        .order_by(CrisisMonitoringRow.composite_score.desc())
        .limit(50)
        .all()
    )
    fallback_used = False
    if not rows:
        # Fallback for testing: any published row in any tenant where
        # country code is Sudan (SDN). The OB sees a useful preview;
        # the badge tells them this isn't their tenant's data yet.
        rows = (
            db.session.query(CrisisMonitoringRow, CrisisMonitoringReport)
            .join(
                CrisisMonitoringReport,
                CrisisMonitoringRow.report_id == CrisisMonitoringReport.id,
            )
            .filter(
                CrisisMonitoringReport.status == 'published',
                CrisisMonitoringRow.country == 'SDN',
            )
            .order_by(CrisisMonitoringRow.composite_score.desc())
            .limit(50)
            .all()
        )
        fallback_used = bool(rows)

    # Phase 674 — fold in member-submitted crisis signals so they show
    # alongside the structured CrisisMonitoringRows. Signals are simpler
    # (no composite_score) but they're what makes the dashboard light up
    # for the Proximate tenant today.
    from app.models.crisis_monitoring import CrisisSignal
    signals = (
        CrisisSignal.query
        .filter_by(network_id=net.id)
        .order_by(CrisisSignal.submitted_at.desc())
        .limit(50)
        .all()
    )

    return jsonify({
        'success': True,
        'rows': [
            {
                **row.to_dict(),
                'report_period_start': (
                    report.period_start.isoformat() if report.period_start else None
                ),
                'source': 'monitoring_row',
            }
            for row, report in rows
        ],
        'signals': [
            {**s.to_dict(), 'source': 'manual_signal'} for s in signals
        ],
        'fallback_used': fallback_used and not signals,
        'feed_ingestor_status': 'backlogged',
        'scenario_types': list(PROXIMATE_SCENARIO_TYPES),
    })


@proximate_bp.route('/crisis-selector/<int:row_id>/brief', methods=['POST'])
@ob_required
def api_crisis_selector_brief(row_id):
    """Phase 663 — call Claude to draft a decision brief for a crisis
    row in a specific scenario type. Returns the brief as plain text
    structured into three short sections (Situation, Why Proximate
    fits, Recommended action). No persistence in v0 — the brief lives
    in the OB's session.
    """
    from app.models.crisis_monitoring import CrisisMonitoringRow

    net, err = _require_proximate_tenant()
    if err:
        return err
    payload = request.get_json(silent=True) or {}
    scenario = (payload.get('scenario_type') or '').strip().lower()
    if scenario not in PROXIMATE_SCENARIO_TYPES:
        return jsonify({
            'success': False,
            'error': f'scenario_type must be one of {list(PROXIMATE_SCENARIO_TYPES)}',
        }), 400

    row = db.session.get(CrisisMonitoringRow, row_id)
    if not row:
        return jsonify({'success': False, 'error': 'crisis row not found'}), 404

    scenario_def = {
        'incubate': (
            'Incubate: seed a brand-new community-based group in this '
            'area. Maximum capacity-building, minimum dollars. Aim is '
            'institutional formation, not service delivery in v0.'
        ),
        'strengthen': (
            'Strengthen: top up an already-cleared partner operating '
            'in this geography. Aim is to sustain proven delivery '
            'capacity while the crisis lasts.'
        ),
        'enable': (
            'Enable: rapid micro-grant to a partner who can act in 7 '
            'days. Aim is immediate response; reporting cadence is '
            'tight (≤14 days).'
        ),
    }[scenario]

    from app.services.ai_service import AIService

    system_prompt = (
        "You are a humanitarian funder briefing the Allocation "
        "Committee at Adeso's Proximate Fund. You draft tight, "
        "actionable decision briefs grounded only in the data you "
        "are given. Never invent statistics. Keep it under 250 words "
        "total, structured exactly into the three labelled sections "
        "Situation, Why Proximate fits, and Recommended action."
    )
    user_msg = (
        f"Crisis row:\n"
        f"- Country: {row.country}\n"
        f"- Region: {row.region or '—'}\n"
        f"- Event: {row.event_type or '—'} — {row.event_title or '—'}\n"
        f"- Composite urgency score: {row.composite_score or '—'} / 100\n"
        f"- HDI band: {row.hdi_band or '—'}\n"
        f"- Government capacity: {row.gov_capacity_band or '—'}\n"
        f"- People impacted estimate: {row.people_impacted_estimate or '—'}\n"
        f"- Media attention band: {row.attention_band or '—'}\n"
        f"- Narrative: {(row.narrative or '—')[:1200]}\n\n"
        f"Scenario for this brief: {scenario_def}\n\n"
        f"Draft the decision brief in three sections."
    )
    text = AIService._call_claude(  # noqa: SLF001
        system_prompt, user_msg,
        max_tokens=600,
        endpoint='proximate_crisis_brief',
    )
    if not text:
        # Deterministic fallback so the page still shows something
        # actionable when the AI is unavailable.
        text = (
            f"Situation\n"
            f"{row.country} {('— ' + row.region) if row.region else ''}. "
            f"{row.event_type or 'unspecified event'}. People affected "
            f"(est.): {row.people_impacted_estimate or 'unknown'}. "
            f"Composite urgency: {row.composite_score or '—'} / 100.\n\n"
            f"Why Proximate fits\n"
            f"Aligned with SoP §3 thresholds for {scenario} mode. "
            f"Capacity to act through a community-endorsed informal "
            f"group already exists in this area.\n\n"
            f"Recommended action\n"
            f"Open a {scenario}-mode round; allocate per Sudan-pilot "
            f"thresholds (≤ $10k single-signer, > $10k two-signer)."
        )

    AuditChainEntry.append(
        action='proximate.crisis_brief.drafted',
        actor_email=current_user.email,
        subject_kind='crisis_monitoring_row',
        subject_id=row.id,
        details={
            'scenario_type': scenario,
            'country': row.country,
        },
    )
    return jsonify({
        'success': True,
        'brief': text,
        'scenario_type': scenario,
        'row_id': row.id,
    })
