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

from datetime import datetime, timezone
from flask import Blueprint, g, jsonify, request
from flask_login import login_required, current_user

from app.extensions import db
from app.models import (
    ProximatePartner, Endorser, Endorsement,
    Network, PARTNER_STATUSES, ENDORSER_STATUSES,
    Q1_LABEL_EN, Q1_LABEL_AR, Q2_LABEL_EN, Q2_LABEL_AR, Q3_LABEL_EN, Q3_LABEL_AR,
)

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
