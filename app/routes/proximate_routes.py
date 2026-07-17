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
import secrets

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
from app.utils.helpers import get_request_json

logger = logging.getLogger('kuja')

proximate_bp = Blueprint('proximate', __name__, url_prefix='/api/proximate')


@proximate_bp.before_request
def _stamp_proximate_audit_scope():
    """QA 2026-07-14 (audit export tenant scoping) — every audit-chain
    row written while serving a Proximate route belongs to the Proximate
    tenant, but AuditChainEntry.append's fallback reads the HOST-resolved
    g.network, which is the default Kuja tenant for token-link requests,
    plain browser downloads, and any caller that omits the tenant
    override header. Those rows were being stamped network_id=1.
    Stamping g.audit_network_id here covers all append sites in this
    blueprint (session, token, public, and cron routes) in one place;
    append() prefers it over g.network.
    """
    try:
        net = getattr(g, 'network', None)
        if net is not None and getattr(net, 'slug', None) == 'proximate':
            g.audit_network_id = net.id
            return
        proximate = Network.query.filter_by(slug='proximate').first()
        if proximate:
            g.audit_network_id = proximate.id
    except Exception:
        pass


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


def _system_actor_user_id(net):
    """Return a valid users.id to attribute a *system*-opened record to
    (e.g. an auto-freeze from a fraud/safety grievance or the security
    keyword scan).

    InterventionMeasure.opened_by_user_id is a NOT NULL FK to users.id.
    The auto-open paths historically hardcoded id=1 as "the system user",
    but no user with id=1 is guaranteed to exist — on Proximate prod it
    does not — so the insert hit a foreign-key violation and 500'd (this
    was the SoP-14 fraud/safety grievance auto-freeze defect). We resolve
    a real user instead: prefer an OB member of THIS network (the fund's
    accountable body), then any platform admin, then any user. The true
    provenance ('public-form' / 'cron-security-scan') is still recorded
    separately on the audit chain.
    """
    from app.models import User, NetworkMembership
    try:
        ob_user = (
            db.session.query(User)
            .join(NetworkMembership, NetworkMembership.org_id == User.org_id)
            .filter(
                NetworkMembership.network_id == net.id,
                NetworkMembership.is_oversight_body.is_(True),
                NetworkMembership.status == 'active',
            )
            .order_by(User.id.asc())
            .first()
        )
        if ob_user:
            return ob_user.id
    except Exception:
        db.session.rollback()
    admin = User.query.filter_by(role='admin').order_by(User.id.asc()).first()
    if admin:
        return admin.id
    any_user = User.query.order_by(User.id.asc()).first()
    return any_user.id if any_user else None


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

    Phase 693 scope gate: this surface returns partner PII (name,
    contact, sanctions summary, status), which donors should not
    see — they get aggregate counts via `/donors/me/dashboard` and
    `/outcomes/rollup`. Restricted to OB + admin. Donors get 403
    with a hint pointing at their proper endpoints.
    """
    from app.utils.network import is_oversight_body_member

    net, err = _require_proximate_tenant()
    if err:
        return err

    if not is_oversight_body_member(current_user):
        return jsonify({
            'success': False,
            'error': 'forbidden — donors use /donors/me/dashboard for portfolio data',
            'code': 'donor_scope',
        }), 403

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

    # RBAC 2026-07-09 — persona-scoped partner detail. Previously any
    # authenticated tenant user got the full operator to_dict (contact,
    # bank, sanctions detail, trust-floor + reputation internals). Now:
    #   OB       -> full operator detail
    #   endorser -> only what the endorsement wizard needs (identity +
    #               questions + endorsement PROGRESS), no DD/payment/
    #               sanctions/reputation internals
    #   donor / other -> 403 (their views live on donor-scoped surfaces)
    persona = _proximate_persona(net)
    if persona not in ('ob', 'endorser'):
        return jsonify({
            'success': False, 'error': 'Not authorised',
            'code': 'err.forbidden',
        }), 403

    endorsements = Endorsement.query.filter_by(partner_id=partner.id).all()
    questions = {
        'q1': {'en': Q1_LABEL_EN, 'ar': Q1_LABEL_AR},
        'q2': {'en': Q2_LABEL_EN, 'ar': Q2_LABEL_AR},
        'q3': {'en': Q3_LABEL_EN, 'ar': Q3_LABEL_AR},
    }
    if persona == 'ob':
        # Endorsements de-identified (endorser_id only) already in to_dict.
        return jsonify({
            'success': True,
            'partner': partner.to_dict(),
            'endorsements': [e.to_dict() for e in endorsements],
            'questions': questions,
        })

    # Endorser — safe subset only.
    pd = partner.to_dict()
    safe = {k: pd.get(k) for k in (
        'id', 'network_id', 'name', 'name_ar', 'locality', 'country',
        'status', 'source', 'nominated_at', 'sanctions_flag',
    )}
    # Progress-only trust floor: how many independent endorsements are in
    # and whether the count target is met. Reputation floor, bank/DD and
    # payment internals are OB-only and deliberately omitted.
    full_floor = pd.get('trust_floor_signals') or {}
    safe['trust_floor_signals'] = {
        'endorsements_independent_count':
            full_floor.get('endorsements_independent_count'),
        'endorsements_required': full_floor.get('endorsements_required'),
        'endorsements_ok': full_floor.get('endorsements_ok'),
    }
    return jsonify({
        'success': True,
        'partner': safe,
        # count-only — never expose other endorsers' identities/COI.
        'endorsements': [{'id': e.id} for e in endorsements],
        'questions': questions,
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
    # Phase 716 DD sweep — sanctions screen runs on ALL nomination
    # paths, not just self-nominate (Phase 658 was only the public form).
    # Same OpenSanctions + UN/OFAC/EU/WB coverage as the self-nominate
    # path. Runs synchronously — < 2s for a clean lookup.
    try:
        _run_partner_sanctions_screen(partner)
    except Exception as e:
        logger.warning(
            f"Proximate: sanctions screen failed on nomination id={partner.id} err={e}"
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
    # the secretariat can read it during triage. Phase 716b adds
    # referred_by — word-of-mouth attribution without a full
    # endorser-referral flow (SoP keeps nomination and vouching apart).
    description = (payload.get('description') or '').strip()
    referred_by = (payload.get('referred_by') or '').strip()
    if description or referred_by:
        intake = {'source': 'self_nominated'}
        if description:
            intake['description'] = description[:2000]
        if referred_by:
            intake['referred_by'] = referred_by[:200]
        partner.set_intake_form(intake)
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


@proximate_bp.route('/public/funded-partners', methods=['GET'])
def api_public_funded_partners():
    """Phase 716b — social proof for the public nominate page.

    Deliberately minimal for a conflict environment: names + locality +
    disbursement count ONLY. No contacts, no amounts, no free-text
    descriptions (self-written text could contain sensitive detail).
    Partners listed are dd_clear — they passed screening and their
    participation is already visible to their own community by design
    (community endorsement is public within the locality)."""
    net, err = _require_proximate_tenant()
    if err:
        return err
    rows = (
        ProximatePartner.query
        .filter_by(network_id=net.id, status='dd_clear')
        .order_by(ProximatePartner.dd_cleared_at.desc().nullslast())
        .limit(4)
        .all()
    )
    out = []
    for p in rows:
        count = ProximateDisbursement.query.filter_by(
            partner_id=p.id,
        ).count()
        out.append({
            'name': p.name,
            'name_ar': p.name_ar,
            'locality': p.locality,
            'disbursements_count': count,
        })
    return jsonify({'success': True, 'partners': out})


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


def _run_named_sanctions_screen(entity, *, display_name, subject_kind,
                                audit_action):
    """Phase 716 DD sweep — generic sanctions screen for any entity
    carrying (sanctions_flag, sanctions_checked_at,
    sanctions_summary_json) columns: endorsers, FSPs/hawala brokers.
    Same OpenSanctions coverage as the partner screen. Best-effort:
    callers wrap in try/except so a screening outage never blocks the
    business action."""
    from app.services.compliance_service import ComplianceService
    import json as _json

    checks = ComplianceService.screen_organization(
        org_name=display_name,
        country=getattr(entity, 'country', None) or 'SD',
    ) or []
    flagged_checks = [c for c in checks if c.get('status') == 'flagged']
    summary = {
        'screened_name': display_name,
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
    entity.sanctions_flag = bool(flagged_checks)
    entity.sanctions_checked_at = datetime.now(timezone.utc)
    entity.sanctions_summary_json = _json.dumps(summary)
    db.session.commit()
    AuditChainEntry.append(
        action=audit_action,
        actor_email='system',
        subject_kind=subject_kind,
        subject_id=entity.id,
        details=summary,
    )
    if flagged_checks:
        logger.warning(
            f"Proximate: sanctions FLAG on {subject_kind} {entity.id} "
            f"({display_name!r}) — {len(flagged_checks)} hit(s)"
        )


_SUDAN_FORMS = ('SD', 'SDN', 'SUDAN')
_SOUTH_SUDAN_FORMS = ('SS', 'SSD', 'SOUTH SUDAN')


def _grant_geo_ok(partner_country, geographies):
    """Phase 721g — does the partner's country satisfy a grant's
    geographic restriction list? Restrictions come from AI extraction
    of agreement prose, so entries range from ISO codes ('SD') to
    phrases ('Sudan (Gedaref and Kassala states)'). Sudan and South
    Sudan are distinct jurisdictions — 'Sudan' as a substring of
    'South Sudan' must never produce a match in either direction."""
    if not geographies:
        return True
    pc = (partner_country or 'SD').strip().upper()
    if pc in _SOUTH_SUDAN_FORMS:
        pc = 'SOUTH SUDAN'
    elif pc in _SUDAN_FORMS:
        pc = 'SUDAN'
    for geo in geographies:
        gu = str(geo).strip().upper()
        if gu in _SOUTH_SUDAN_FORMS:
            gu = 'SOUTH SUDAN'
        elif gu in _SUDAN_FORMS:
            gu = 'SUDAN'
        if gu == pc:
            return True
        if 'SOUTH SUDAN' in gu:
            if pc == 'SOUTH SUDAN':
                return True
            continue  # never let 'SUDAN' match inside 'SOUTH SUDAN'
        if pc == 'SUDAN' and 'SUDAN' in gu:
            return True  # e.g. 'Sudan (Gedaref and Kassala states)'
        if pc != 'SUDAN' and pc != 'SOUTH SUDAN' and (pc in gu or gu in pc):
            return True  # e.g. 'KE' vs 'KENYA'
    return False


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

    # Phase 715a — participant-stage auto-compute. Endorsement trust-
    # floor crossings bump this partner in every active round they're in.
    if state_change == 'dd_pending':
        _bump_participant_stage_for_partner_across_active_rounds(
            net.id, partner.id, 'endorsed', current_user.id,
        )
    elif state_change == 'dd_clear':
        _bump_participant_stage_for_partner_across_active_rounds(
            net.id, partner.id, 'bank_verified', current_user.id,
        )

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

    # PRX-DD-001 — due-diligence integrity: bank verification confirms a
    # payment route that is on file, so there must be one. Block the
    # verify until at least one disbursement method (bank / hawala /
    # mobile money) exists, otherwise bank_verified_at can be set on a
    # partner with no account details at all.
    method_count = PartnerDisbursementMethod.query.filter_by(
        partner_id=partner.id,
    ).count()
    if method_count == 0:
        return jsonify({
            'success': False,
            'code': 'err.no_method',
            'error': (
                'Add a disbursement method (bank, hawala, or mobile money) '
                'before verifying. Bank verification confirms a payment '
                'route that is already on file.'
            ),
        }), 400

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

    # Phase 715 gap fix — a suspended partner is out of every active
    # round; mark their roster rows withdrawn (existing rows only).
    _bump_participant_stage_for_partner_across_active_rounds(
        net.id, partner.id, 'withdrawn', current_user.id,
    )

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
    gate = _proximate_ob_or_403(net)
    if gate:
        return gate
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
    # Phase 700 — mint the no-login portal token at approval. The OB
    # shares this URL via WhatsApp; endorser uses the page without
    # ever creating a password / signing in.
    if not e.public_token:
        import secrets
        e.public_token = secrets.token_urlsafe(32)
    db.session.commit()

    # Phase 716 DD sweep — sanctions screen at approval time. Flags
    # surface on the endorser record and the audit chain; per SoP §4
    # a hit informs the OB rather than hard-blocking (approval already
    # happened — the OB sees the flag and can suspend).
    try:
        from app.models import User as _User
        screen_user = db.session.get(_User, e.user_id)
        screen_name = (
            f'{screen_user.first_name or ""} {screen_user.last_name or ""}'.strip()
            if screen_user else f'endorser-{e.id}'
        )
        if screen_name:
            _run_named_sanctions_screen(
                e, display_name=screen_name,
                subject_kind='proximate_endorser',
                audit_action='proximate.endorser.sanctions_screened',
            )
    except Exception as _se:  # noqa: BLE001
        logger.warning(
            f"Proximate: endorser sanctions screen failed for {e.id}: {_se}"
        )
    AuditChainEntry.append(
        action='proximate.endorser.approved',
        actor_email=current_user.email,
        subject_kind='proximate_endorser',
        subject_id=e.id,
        details={'user_id': e.user_id, 'locality': e.locality},
    )
    base = request.host_url.rstrip('/')
    return jsonify({
        'success': True,
        'endorser': e.to_dict(include_coi=True),
        'portal_url': f'{base}/proximate-endorse?t={e.public_token}',
    })


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
    gate = _proximate_ob_or_403(net)
    if gate:
        return gate
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

    # Phase 716 DD sweep — hawala brokers and MNOs move Adeso's money;
    # screen them like partners. Best-effort, never blocks registration.
    try:
        _run_named_sanctions_screen(
            fsp, display_name=fsp.name,
            subject_kind='proximate_fsp',
            audit_action='proximate.fsp.sanctions_screened',
        )
    except Exception as _se:  # noqa: BLE001
        logger.warning(
            f"Proximate: FSP sanctions screen failed for {fsp.id}: {_se}"
        )

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
    gate = _proximate_ob_or_403(net)
    if gate:
        return gate
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

            # Auto-open a freeze. opened_by_user_id must reference a real
            # user (NOT NULL FK) — hardcoding id=1 500'd where no such
            # user exists; resolve a valid system actor instead.
            measure = InterventionMeasure.open_new(
                network_id=net.id, partner_id=p.id, kind='freeze',
                reason=f'Auto-flagged: security signal "{matched}" '
                       f'detected in partner intake. '
                       f'Human OB review required within 72h.',
                opened_by_user_id=_system_actor_user_id(net),
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
    # RBAC 2026-07-09 — OB-only: this returns every endorser's answers +
    # voice transcripts (their COI reasoning). Endorsers must not read one
    # another's submissions; they get only a progress count via partner
    # detail. Donors have no need for it.
    gate = _proximate_ob_or_403(net)
    if gate:
        return gate
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
    gate = _proximate_ob_or_403(net)
    if gate:
        return gate

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


# ---- OB attention queue (Phase 717) ----------------------------------

@proximate_bp.route('/attention-queue', methods=['GET'])
@login_required
def api_attention_queue():
    """The single 'what needs a human now' list for the OB. Merges every
    time-sensitive obligation across the fund into one prioritised feed so
    nothing hides inside a state machine: interventions (expired first),
    pending cosigns (money waiting), overdue partner reports, disbursements
    awaiting independent verification, new grievances, rounds awaiting
    signature, and the light-KYC endorser queue.

    Read-open like /overview (per-action endpoints enforce OB). Every item
    carries a severity, a human title/subtitle, and a deep link so the
    operator can act in one click.
    """
    from datetime import datetime as _dt, timezone as _tz
    from app.models import (
        ProximatePartner, InterventionMeasure, ProximateDisbursement,
        ProximateGrievance, ProximateRound, ProximateRoundSignature,
        Endorser,
    )
    net, err = _require_proximate_tenant()
    if err:
        return err
    gate = _proximate_ob_or_403(net)
    if gate:
        return gate
    now = _dt.now(_tz.utc)

    def _aware(dt):
        if dt is None:
            return None
        return dt.replace(tzinfo=_tz.utc) if dt.tzinfo is None else dt

    def _hours_until(dt):
        dt = _aware(dt)
        return round((dt - now).total_seconds() / 3600, 1) if dt else None

    def _days_since(dt):
        dt = _aware(dt)
        return round((now - dt).total_seconds() / 86400, 1) if dt else None

    partners = {
        p.id: p for p in
        ProximatePartner.query.filter_by(network_id=net.id).all()
    }

    def _pname(pid):
        p = partners.get(pid)
        return p.name if p else f'Partner #{pid}'

    items = []

    # 1. Interventions (open/escalated) — expired / escalated = critical
    for m in InterventionMeasure.query.filter(
        InterventionMeasure.network_id == net.id,
        InterventionMeasure.status.in_(['open', 'escalated']),
    ).all():
        hot = bool(getattr(m, 'is_expired', False)) or m.status == 'escalated'
        items.append({
            'kind': 'intervention',
            'severity': 'critical' if hot else 'high',
            'title': f'{(m.kind or "").title()} intervention — {_pname(m.partner_id)}',
            'subtitle': ('Response window passed — escalate/resolve now' if hot
                         else 'Awaiting an independent OB response'),
            'href': f'/proximate/endorse/{m.partner_id}',
            'entity_kind': 'intervention', 'entity_id': m.id,
            'due_at': (m.response_due_at.isoformat()
                       if m.response_due_at else None),
            'hours_until_due': _hours_until(m.response_due_at),
        })

    # 2. Disbursements — pending cosign / overdue report / verify pending
    for d in ProximateDisbursement.query.filter(
        ProximateDisbursement.network_id == net.id,
        ProximateDisbursement.status.in_(
            ['pending_cosign', 'pending_report', 'reported']),
    ).all():
        amt = float(d.amount_usd or 0)
        if d.status == 'pending_cosign':
            items.append({
                'kind': 'cosign',
                'severity': 'high',
                'title': f'Cosign needed — ${amt:,.0f} to {_pname(d.partner_id)}',
                'subtitle': (f'{d.cosigners_required or 0} co-signature(s) '
                             'required before funds can move'),
                'href': f'/proximate/disbursements/{d.id}',
                'entity_kind': 'disbursement', 'entity_id': d.id,
            })
        elif d.status == 'pending_report':
            due = _aware(d.report_due_at)
            if due and due < now:
                items.append({
                    'kind': 'report_overdue',
                    'severity': 'high',
                    'title': f'Report overdue — {_pname(d.partner_id)}',
                    'subtitle': (f'Partner report is {_days_since(due)} '
                                 'day(s) late'),
                    'href': f'/proximate/disbursements/{d.id}',
                    'entity_kind': 'disbursement', 'entity_id': d.id,
                    'due_at': d.report_due_at.isoformat() if d.report_due_at else None,
                })
        elif d.status == 'reported' and d.verifier_verdict != 'confirmed':
            assigned = d.verifier_user_id is not None
            items.append({
                'kind': 'verify',
                'severity': 'medium',
                'title': f'Independent verification pending — {_pname(d.partner_id)}',
                'subtitle': ('Verifier assigned — awaiting attestation'
                             if assigned else
                             'No independent verifier assigned yet'),
                'href': f'/proximate/disbursements/{d.id}',
                'entity_kind': 'disbursement', 'entity_id': d.id,
            })

    # 3. Grievances awaiting triage — fraud/safety = critical
    for gr in ProximateGrievance.query.filter_by(
        network_id=net.id, status='new',
    ).all():
        sev = 'critical' if gr.category in ('fraud', 'safety') else 'high'
        items.append({
            'kind': 'grievance',
            'severity': sev,
            'title': (f'New {gr.category} grievance'
                      + (f' — {_pname(gr.partner_id)}' if gr.partner_id else '')),
            'subtitle': 'Needs triage (SLA clock is running)',
            'href': '/proximate/admin/grievances',
            'entity_kind': 'grievance', 'entity_id': gr.id,
            'age_days': _days_since(gr.submitted_at),
        })

    # 4. Rounds in review awaiting signatures
    for r in ProximateRound.query.filter_by(
        network_id=net.id, status='in_review',
    ).all():
        signed = ProximateRoundSignature.query.filter_by(
            round_id=r.id, status='signed',
        ).count()
        items.append({
            'kind': 'round_sign',
            'severity': 'medium',
            'title': f'Round awaiting signatures — {r.title}',
            'subtitle': f'{signed}/2 signatures collected to activate',
            'href': f'/proximate/rounds/{r.id}',
            'entity_kind': 'round', 'entity_id': r.id,
        })

    # 5. Light-KYC endorser queue
    pend = Endorser.query.filter_by(
        network_id=net.id, status='pending',
    ).count()
    if pend:
        items.append({
            'kind': 'endorser_kyc',
            'severity': 'low',
            'title': f'{pend} endorser(s) awaiting light-KYC review',
            'subtitle': 'Approve or reject in the endorser queue',
            'href': '/proximate/admin/endorsers',
            'entity_kind': 'endorser_queue', 'entity_id': 0,
        })

    order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
    items.sort(key=lambda x: (
        order.get(x.get('severity'), 9),
        x.get('hours_until_due') if x.get('hours_until_due') is not None else 1e9,
    ))

    counts = {'critical': 0, 'high': 0, 'medium': 0, 'low': 0}
    for it in items:
        counts[it['severity']] = counts.get(it['severity'], 0) + 1

    return jsonify({
        'success': True,
        'items': items,
        'total': len(items),
        'counts': counts,
    })


# ---- Donor money-trail / traceability (Phase 717) --------------------

@proximate_bp.route('/grants/<int:grant_id>/traceability', methods=['GET'])
@login_required
def api_grant_traceability(grant_id):
    """The donor 'follow the money' chain for one grant:
    Grant -> round allocations -> disbursements -> partner reports ->
    outcomes -> audit anchors. Same scope guard as grant detail (OB or
    the owning donor). Every disbursement carries its latest hash-chained
    audit anchor so the whole trail is independently verifiable.
    """
    from app.models import (
        ProximateGrant, ProximateGrantAllocation, ProximateRound,
        ProximateDisbursement, ProximatePartner,
    )
    net, err = _require_proximate_tenant()
    if err:
        return err
    g = ProximateGrant.query.filter_by(
        id=grant_id, network_id=net.id,
    ).first()
    if not g:
        return jsonify({'success': False, 'error': 'not found'}), 404
    if not _user_is_ob(net):
        from app.models import ProximateDonor
        my_donor = ProximateDonor.query.filter_by(
            network_id=net.id, primary_user_id=current_user.id,
        ).first()
        if not my_donor or g.donor_id != my_donor.id:
            return jsonify({'success': False, 'error': 'not authorised'}), 403

    allocations = ProximateGrantAllocation.query.filter_by(grant_id=g.id).all()
    round_ids = [a.round_id for a in allocations] or [0]
    rounds = {
        r.id: r for r in
        ProximateRound.query.filter(ProximateRound.id.in_(round_ids)).all()
    }
    disbs = ProximateDisbursement.query.filter(
        ProximateDisbursement.round_id.in_(round_ids),
    ).all()
    disb_ids = [d.id for d in disbs] or [0]
    partners = {
        p.id: p for p in
        ProximatePartner.query.filter_by(network_id=net.id).all()
    }

    # Outcomes keyed by disbursement (model is ProximateOutcomeAttestation)
    outcomes = {}
    try:
        from app.models import ProximateOutcomeAttestation
        for o in ProximateOutcomeAttestation.query.filter(
            ProximateOutcomeAttestation.disbursement_id.in_(disb_ids),
        ).all():
            outcomes[o.disbursement_id] = o
    except Exception:
        pass

    # Latest hash-chained audit anchor per disbursement (batched)
    anchors = {}
    try:
        for e in AuditChainEntry.query.filter(
            AuditChainEntry.subject_kind == 'proximate_disbursement',
            AuditChainEntry.subject_id.in_(disb_ids),
        ).order_by(AuditChainEntry.seq.asc()).all():
            anchors[e.subject_id] = {
                'seq': e.seq,
                'payload_hash': e.payload_hash,
                'action': e.action,
            }
    except Exception:
        pass

    by_round = {}
    for d in disbs:
        by_round.setdefault(d.round_id, []).append(d)

    chain = []
    for a in allocations:
        r = rounds.get(a.round_id)
        chain.append({
            'round': {
                'id': a.round_id,
                'title': r.title if r else f'Round #{a.round_id}',
                'status': r.status if r else None,
                'allocation_usd': a.amount_usd,
            },
            'disbursements': [{
                'id': d.id,
                'amount_usd': float(d.amount_usd or 0),
                'status': d.status,
                'partner_name': (partners[d.partner_id].name
                                 if d.partner_id in partners
                                 else f'Partner #{d.partner_id}'),
                'report_submitted': d.status in ('reported', 'verified', 'flagged'),
                'verifier_verdict': d.verifier_verdict,
                'outcome': (outcomes[d.id].to_dict()
                            if d.id in outcomes
                            and hasattr(outcomes[d.id], 'to_dict') else None),
                'audit_anchor': anchors.get(d.id),
            } for d in by_round.get(a.round_id, [])],
        })

    return jsonify({
        'success': True,
        'grant': g.to_dict(),
        'committed_usd': g.amount_committed_usd,
        'allocated_usd': g.amount_allocated_usd,
        'disbursement_count': len(disbs),
        'chain': chain,
    })


# ---- Disbursement pre-flight / "why blocked?" (Phase 717) ------------

@proximate_bp.route('/disbursements/preflight', methods=['GET'])
@login_required
def api_disbursement_preflight():
    """"Why blocked?" for a disbursement. Given a partner (+ optional
    amount), returns the exact preconditions a release needs BEFORE the OB
    hits submit: hard `blockers` (cannot proceed) and advisory `warnings`.
    Serves the "only ever see the next safe step" goal on /disbursements/new
    and partner detail.
    """
    from app.models import ProximatePartner
    from app.models.proximate_fsp import PartnerDisbursementMethod
    from app.models.proximate_disbursement import cosigners_required_for
    from app.models.proximate_endorsement import classify_capital
    net, err = _require_proximate_tenant()
    if err:
        return err
    gate = _proximate_ob_or_403(net)
    if gate:
        return gate
    partner_id = request.args.get('partner_id', type=int)
    # The UI sends `amount`, but API callers and tests naturally reach for
    # `amount_usd` because the create endpoint uses that field name. Accept
    # both so preflight probes do not produce false negatives.
    amount = (
        request.args.get('amount', type=float)
        if request.args.get('amount') not in (None, '')
        else request.args.get('amount_usd', type=float)
    ) or 0.0
    if not partner_id:
        return jsonify({'success': False, 'error': 'partner_id required'}), 400
    p = ProximatePartner.query.filter_by(
        id=partner_id, network_id=net.id,
    ).first()
    if not p:
        return jsonify({'success': False, 'error': 'not found'}), 404

    blockers, warnings = [], []
    href = f'/proximate/endorse/{p.id}'

    # 1. Partner trust status. Each item carries a machine `code` (drives
    # a localized message on the client) and a `cta_code` (drives a precise,
    # localized "fix this now" action). `message` is the English fallback.
    if p.status == 'suspended':
        blockers.append({
            'code': 'partner_suspended',
            'cta_code': 'lift_suspension',
            'message': 'This partner is suspended. Lift the suspension before funding.',
            'href': href})
    elif p.status != 'dd_clear':
        try:
            tf = p.trust_floor_signals()
        except Exception:
            tf = {}
        missing = []
        if not tf.get('endorsements_ok'):
            missing.append('two conflict-free endorsements')
        if not tf.get('bank_verified'):
            missing.append('bank verification and a payment route')
        # Only surface the reputation-floor item when the endorsement COUNT
        # is already met — otherwise "need more endorsers" and "endorsers
        # below the reputation floor" read as the same thing and confuse.
        if tf.get('endorsements_ok') and not tf.get('endorsers_meet_reputation_floor'):
            missing.append('endorsers with a higher reputation score')
        warnings.append({
            'code': 'partner_not_cleared',
            'cta_code': 'clear_dd',
            'message': ('Partner is not fully cleared yet'
                        + (f" — still needs {', '.join(missing)}." if missing
                           else f' (status: {p.status}).')),
            'href': href})

    # 2. A disbursement route must exist
    total_methods = PartnerDisbursementMethod.query.filter_by(
        partner_id=p.id).count()
    verified_methods = PartnerDisbursementMethod.query.filter(
        PartnerDisbursementMethod.partner_id == p.id,
        PartnerDisbursementMethod.status.in_(['verified', 'active']),
    ).count()
    if total_methods == 0:
        blockers.append({
            'code': 'no_method',
            'cta_code': 'add_route',
            'message': 'No disbursement route on file. Add a bank, hawala, or mobile-money method for this partner.',
            'href': f'{href}#routes'})
    elif verified_methods == 0:
        warnings.append({
            'code': 'method_unverified',
            'cta_code': 'verify_route',
            'message': 'A disbursement method exists but none are verified yet.',
            'href': f'{href}#routes'})

    cosigners_required = cosigners_required_for(amount) if amount else 0
    if cosigners_required:
        warnings.append({
            'code': 'cosign_required',
            'message': (f'This amount (${amount:,.0f}) needs '
                        f'{cosigners_required} co-signature(s) — a different '
                        'OB member must cosign before funds move.')})

    return jsonify({
        'success': True,
        'partner_status': p.status,
        'can_disburse': len(blockers) == 0,
        'blockers': blockers,
        'warnings': warnings,
        'cosigners_required': cosigners_required,
        'capital_class': classify_capital(amount) if amount else None,
    })


# ---- Funding Rounds (Phase 649) --------------------------------------

@proximate_bp.route('/rounds', methods=['GET'])
@login_required
def api_list_rounds():
    """List rounds in this tenant, newest first. Donor-persona callers
    see only their linked rounds (funded / co-funded / followed) —
    same scope rule as the donor dashboard (2026-07-16)."""
    from app.models import ProximateDonor
    from app.utils.network import is_oversight_body_member
    net, err = _require_proximate_tenant()
    if err:
        return err
    q = ProximateRound.query.filter_by(network_id=net.id)
    if (getattr(current_user, 'role', '') != 'admin'
            and not is_oversight_body_member(current_user)):
        donor = ProximateDonor.query.filter_by(
            network_id=net.id, primary_user_id=current_user.id,
        ).first()
        if donor:
            visible = _donor_visible_round_ids(donor)
            q = q.filter(ProximateRound.id.in_(list(visible) or [-1]))
    rows = q.order_by(ProximateRound.drafted_at.desc()).limit(200).all()
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
    scope_err = _donor_round_scope_403(net, r.id)
    if scope_err:
        return scope_err

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

    # Phase 702 — donor-safe shape. Reviewer flagged that donors
    # could read this endpoint and see operational detail (signatures,
    # cancellation reason, full audit window, per-disbursement
    # purposes). For non-OB callers, strip those fields and return
    # only what the donor needs to verify their portfolio: envelope
    # rollup, disbursement count + amounts, status, anchor seq.
    is_ob = _user_is_ob(net)
    if is_ob:
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
    # Donor / non-OB shape: omits signatures (PII), actor_email
    # (operator emails), cancellation_reason, audit window, and
    # individual disbursement purpose / partner names. Returns just
    # the round meta + envelope numbers + disbursement count.
    rd = r.to_dict(include_signatures=False)
    for sensitive in (
        'cancellation_reason', 'closing_summary',
        'drafted_by_user_id', 'signatures',
        # RBAC 2026-07-09 — internal OB lifecycle / sign-off state that a
        # donor has no need for (flagged in the team RBAC audit).
        'signers_required', 'signed_count', 'ready_for_activation',
    ):
        rd.pop(sensitive, None)
    return jsonify({
        'success': True,
        'round': rd,
        'disbursements_count': len(disbursements),
        'envelope_used': envelope_used,
        'envelope_remaining': envelope_remaining,
    })


def _user_is_ob(net) -> bool:
    """Helper — is the current user an OB for THIS tenant? Used by
    endpoints that serve a donor-safe shape to donors but full operator
    detail to OB.

    RBAC hardening (2026-07-09): resolve the OB seat in the EXPLICIT
    Proximate network (net.id) rather than the ambient host-resolved
    network. A direct API call without the Proximate host/override header
    resolves g.network to the default Kuja tenant, where nobody holds an
    OB seat — that mismatch both (a) wrongly denied the real OB on
    /audit-chain and (b) is why the ambient check was unreliable. Also
    drop the `role=='admin'` shortcut: Phase 114 retired the platform-admin
    auto-pass, but this helper had quietly reintroduced it, which is why
    platform admin saw OB-only shapes and controls."""
    try:
        from app.utils.network import is_oversight_body_member
        return is_oversight_body_member(
            current_user, network_id=(net.id if net else None))
    except Exception:
        return False


def _proximate_ob_or_403(net):
    """Return None if the current user is an OB for THIS Proximate net,
    else a 403 response tuple. Network-explicit; no platform-admin
    auto-pass. Use immediately after `_require_proximate_tenant()` on
    OB-only endpoints so the guard matches the slug-resolved tenant the
    endpoint actually serves."""
    if _user_is_ob(net):
        return None
    return jsonify({
        'success': False,
        'error': 'Oversight Body permission required',
        'code': 'err.ob_required',
    }), 403


def _proximate_persona(net) -> str:
    """Return the current user's Proximate persona in this network:
    'ob' | 'endorser' | 'donor' | 'other'. Network-explicit. Platform
    admins are 'other' unless they also hold a real OB seat (Phase 114).
    Drives persona-scoped response shaping on shared read endpoints."""
    if _user_is_ob(net):
        return 'ob'
    from app.models import Endorser as _Endorser, ProximateDonor as _Donor
    try:
        if _Endorser.query.filter_by(
                network_id=net.id, user_id=current_user.id).first():
            return 'endorser'
    except Exception:
        db.session.rollback()
    try:
        if _Donor.query.filter_by(
                network_id=net.id, primary_user_id=current_user.id).first():
            return 'donor'
    except Exception:
        db.session.rollback()
    return 'other'


# =========================================================================
# Phase 715a — Participant stage auto-compute helper
# =========================================================================

def _bump_participant_stage(
    round_id, partner_id, target_stage: str,
    actor_user_id=None,
):
    """Advance a round-participant's stage forward. Idempotent and
    best-effort — a failed bump is logged but never raises.

    Rules:
      • None round_id or partner_id → no-op (disbursement not tied to a round).
      • Row missing → auto-create at target_stage (roster catches up to
        a real-world action the OB took without adding the partner first).
      • Row present at a stage AT-OR-BEYOND target → no-op (stages only
        advance; never regress). Uses PARTICIPANT_STAGES ordering.
      • Row at an earlier stage → advance to target_stage + commit.
    """
    if not round_id or not partner_id:
        return
    from app.models import ProximateRoundParticipant
    from app.models.proximate_round import PARTICIPANT_STAGES
    if target_stage not in PARTICIPANT_STAGES:
        return
    try:
        row = ProximateRoundParticipant.query.filter_by(
            round_id=round_id, partner_id=partner_id,
        ).first()
        target_idx = PARTICIPANT_STAGES.index(target_stage)
        if row is None:
            row = ProximateRoundParticipant(
                round_id=round_id, partner_id=partner_id,
                stage=target_stage, added_by_user_id=actor_user_id,
            )
            db.session.add(row)
            db.session.commit()
            return
        current_idx = (
            PARTICIPANT_STAGES.index(row.stage)
            if row.stage in PARTICIPANT_STAGES else -1
        )
        if target_idx > current_idx:
            row.stage = target_stage
            db.session.commit()
    except Exception as e:  # pragma: no cover — telemetry only
        db.session.rollback()
        try:
            logger.warning(
                f"Proximate: participant stage bump failed "
                f"round={round_id} partner={partner_id} "
                f"target={target_stage} err={e}"
            )
        except Exception:
            pass


def _bump_participant_stage_for_partner_across_active_rounds(
    net_id, partner_id, target_stage: str, actor_user_id=None,
):
    """Bump this partner's stage in every ACTIVE round they participate
    in. Used by partner-level events (endorsement threshold reached,
    bank verified) that affect all rounds simultaneously."""
    if not partner_id:
        return
    try:
        from app.models import (
            ProximateRound, ProximateRoundParticipant,
        )
        active_round_ids = [
            r.id for r in ProximateRound.query.filter_by(
                network_id=net_id, status='active',
            ).all()
        ]
        if not active_round_ids:
            return
        rows = ProximateRoundParticipant.query.filter(
            ProximateRoundParticipant.partner_id == partner_id,
            ProximateRoundParticipant.round_id.in_(active_round_ids),
        ).all()
        for row in rows:
            _bump_participant_stage(
                row.round_id, partner_id, target_stage, actor_user_id,
            )
    except Exception as e:  # pragma: no cover
        try:
            logger.warning(
                f"Proximate: cross-round stage bump failed "
                f"partner={partner_id} target={target_stage} err={e}"
            )
        except Exception:
            pass


# =========================================================================
# Phase 710b — Round participants + Donor lookup endpoints
# =========================================================================

@proximate_bp.route('/donors', methods=['GET'])
@login_required
def api_proximate_donors():
    """Donor registry for the new-round donor picker + admin surfaces.
    Returns a flat list of {id, display_name, contact_email} for the
    current Proximate tenant."""
    from app.models import ProximateDonor
    net, err = _require_proximate_tenant()
    if err:
        return err
    rows = (ProximateDonor.query
            .filter_by(network_id=net.id)
            .order_by(ProximateDonor.display_name.asc())
            .all())
    return jsonify({
        'success': True,
        'donors': [
            {
                'id': d.id,
                'display_name': d.display_name,
                'contact_email': d.contact_email,
            }
            for d in rows
        ],
    })


@proximate_bp.route('/rounds/<int:round_id>/participants', methods=['GET'])
@login_required
def api_round_participants(round_id):
    """Return the round's partner roster with per-partner stage.
    Used by the round dashboard's roster section (Phase 711)."""
    from app.models import (
        ProximateRound, ProximateRoundParticipant, ProximatePartner,
    )
    net, err = _require_proximate_tenant()
    if err:
        return err
    round_row = ProximateRound.query.filter_by(
        id=round_id, network_id=net.id,
    ).first()
    if not round_row:
        return jsonify({'success': False, 'error': 'not found'}), 404

    rows = (ProximateRoundParticipant.query
            .filter_by(round_id=round_row.id)
            .join(ProximatePartner,
                  ProximatePartner.id == ProximateRoundParticipant.partner_id)
            .order_by(ProximatePartner.name.asc())
            .all())
    partners_by_id = {
        p.id: p for p in ProximatePartner.query.filter(
            ProximatePartner.id.in_([r.partner_id for r in rows] or [0])
        ).all()
    }
    return jsonify({
        'success': True,
        'round_id': round_row.id,
        'round_title': round_row.title,
        'participants': [
            {
                'id': r.id,
                'partner_id': r.partner_id,
                'partner_name': (
                    partners_by_id[r.partner_id].name
                    if r.partner_id in partners_by_id else None
                ),
                'partner_locality': (
                    partners_by_id[r.partner_id].locality
                    if r.partner_id in partners_by_id else None
                ),
                'partner_status': (
                    partners_by_id[r.partner_id].status
                    if r.partner_id in partners_by_id else None
                ),
                'stage': r.stage,
                'notes': r.notes,
                'added_at': r.added_at.isoformat() if r.added_at else None,
            }
            for r in rows
        ],
    })


@proximate_bp.route('/rounds/<int:round_id>/participants', methods=['POST'])
@login_required
def api_round_participants_add(round_id):
    """Add a partner to this round. OB-only. Body: {partner_id, notes?}"""
    from app.models import (
        ProximateRound, ProximateRoundParticipant, ProximatePartner,
    )
    net, err = _require_proximate_tenant()
    if err:
        return err
    if not _user_is_ob(net):
        return jsonify({'success': False, 'error': 'ob only'}), 403
    round_row = ProximateRound.query.filter_by(
        id=round_id, network_id=net.id,
    ).first()
    if not round_row:
        return jsonify({'success': False, 'error': 'not found'}), 404
    body = get_request_json() or {}
    partner_id = body.get('partner_id')
    if not partner_id:
        return jsonify({'success': False, 'error': 'partner_id required'}), 400
    partner = ProximatePartner.query.filter_by(
        id=partner_id, network_id=net.id,
    ).first()
    if not partner:
        return jsonify({'success': False, 'error': 'partner not in tenant'}), 400
    existing = ProximateRoundParticipant.query.filter_by(
        round_id=round_row.id, partner_id=partner.id,
    ).first()
    if existing:
        return jsonify({
            'success': True, 'participant_id': existing.id,
            'already_present': True,
        })
    row = ProximateRoundParticipant(
        round_id=round_row.id, partner_id=partner.id,
        stage='planned',
        notes=(body.get('notes') or '')[:2000] or None,
        added_by_user_id=current_user.id,
    )
    db.session.add(row)
    db.session.commit()
    return jsonify({
        'success': True, 'participant_id': row.id,
        'already_present': False,
    })


@proximate_bp.route(
    '/rounds/<int:round_id>/participants/<int:participant_id>',
    methods=['DELETE'],
)
@login_required
def api_round_participants_remove(round_id, participant_id):
    """Remove a partner from the round. OB-only."""
    from app.models import ProximateRound, ProximateRoundParticipant
    net, err = _require_proximate_tenant()
    if err:
        return err
    if not _user_is_ob(net):
        return jsonify({'success': False, 'error': 'ob only'}), 403
    round_row = ProximateRound.query.filter_by(
        id=round_id, network_id=net.id,
    ).first()
    if not round_row:
        return jsonify({'success': False, 'error': 'round not found'}), 404
    row = ProximateRoundParticipant.query.filter_by(
        id=participant_id, round_id=round_row.id,
    ).first()
    if not row:
        return jsonify({'success': False, 'error': 'participant not found'}), 404
    db.session.delete(row)
    db.session.commit()
    return jsonify({'success': True})


# =========================================================================
# Phase 716a — Zero-login endorser invites (per SoP + partner-flow parity)
# =========================================================================

@proximate_bp.route(
    '/partners/<int:partner_id>/endorser-invites', methods=['POST'],
)
@login_required
def api_create_endorser_invite(partner_id):
    """OB issues a per-elder invite to endorse this partner.
    Body: {invitee_name (required), invitee_phone?, invitee_email?,
    invitee_locality?, note?}. Returns the invite + the shareable URL."""
    from app.models import ProximateEndorserInvite, ProximatePartner
    net, err = _require_proximate_tenant()
    if err:
        return err
    if not _user_is_ob(net):
        return jsonify({'success': False, 'error': 'ob only'}), 403
    partner = ProximatePartner.query.filter_by(
        id=partner_id, network_id=net.id,
    ).first()
    if not partner:
        return jsonify({'success': False, 'error': 'partner not in tenant'}), 404
    body = get_request_json() or {}
    name = (body.get('invitee_name') or '').strip()
    if not name:
        return jsonify({
            'success': False, 'error': 'invitee_name required',
        }), 400
    inv = ProximateEndorserInvite(
        partner_id=partner.id,
        invitee_name=name[:200],
        invitee_phone=(body.get('invitee_phone') or '').strip()[:50] or None,
        invitee_email=(body.get('invitee_email') or '').strip()[:200] or None,
        invitee_locality=(body.get('invitee_locality') or '').strip()[:120] or None,
        note=(body.get('note') or '').strip()[:2000] or None,
        created_by_user_id=current_user.id,
    )
    db.session.add(inv)
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.endorser_invite.created',
        actor_email=current_user.email,
        subject_kind='proximate_partner',
        subject_id=partner.id,
        details={
            'invite_id': inv.id,
            'invitee_name': inv.invitee_name,
            'invitee_phone': inv.invitee_phone,
        },
    )
    return jsonify({
        'success': True,
        'invite': inv.to_dict(include_token=True),
        'partner_name': partner.name,
    })


@proximate_bp.route('/endorser-invites/<token>', methods=['GET'])
def api_get_endorser_invite(token):
    """Public. Elder opens the shared URL cold — this returns enough
    context for the wizard to render (partner name, locality, OB note)
    without exposing internal partner detail."""
    from app.models import ProximateEndorserInvite, ProximatePartner
    inv = ProximateEndorserInvite.query.filter_by(
        invite_token=token,
    ).first()
    if not inv:
        return jsonify({'success': False, 'error': 'invalid token'}), 404
    if inv.used_at is not None:
        return jsonify({
            'success': False, 'error': 'already_used',
            'used_at': inv.used_at.isoformat(),
        }), 409
    partner = ProximatePartner.query.get(inv.partner_id)
    if not partner:
        return jsonify({'success': False, 'error': 'partner missing'}), 404
    return jsonify({
        'success': True,
        'invite': {
            'invitee_name': inv.invitee_name,
            'invitee_locality': inv.invitee_locality,
            'note': inv.note,
        },
        'partner': {
            'id': partner.id,
            'name': partner.name,
            'name_ar': partner.name_ar,
            'locality': partner.locality,
            'intake_summary_ar': partner.intake_summary_ar,
        },
    })


@proximate_bp.route('/endorser-invites/<token>', methods=['POST'])
def api_submit_endorser_invite(token):
    """Public. Elder submits the endorsement. Body: {q1_real, q2_trust,
    q3_accept_aid} — same shape as the login-based endorsement flow.
    Auto-provisions a User + Endorser under the hood so downstream
    reputation + trust-floor logic keeps working."""
    from app.models import (
        ProximateEndorserInvite, ProximatePartner, User, Endorser,
        Endorsement,
    )
    inv = ProximateEndorserInvite.query.filter_by(
        invite_token=token,
    ).first()
    if not inv:
        return jsonify({'success': False, 'error': 'invalid token'}), 404
    if inv.used_at is not None:
        return jsonify({
            'success': False, 'error': 'already_used',
        }), 409

    partner = ProximatePartner.query.get(inv.partner_id)
    if not partner:
        return jsonify({'success': False, 'error': 'partner missing'}), 404

    payload = request.get_json(silent=True) or {}
    for q in ('q1_real', 'q2_trust', 'q3_accept_aid'):
        if q not in payload or not isinstance(payload[q], bool):
            return jsonify({
                'success': False, 'error': f'{q} must be boolean',
            }), 400

    # Auto-provision User + Endorser under the hood. Placeholder email
    # uses the invite token so it's unique and doesn't collide with a
    # real user. Login is disabled — password_hash stays null.
    from werkzeug.security import generate_password_hash
    placeholder_email = f'invite-{inv.invite_token[:12]}@proximate.invited'
    user = User(
        email=placeholder_email,
        password_hash=generate_password_hash(secrets.token_hex(24)),
        role='ngo',
        first_name=inv.invitee_name.split(' ')[0][:50] if inv.invitee_name else 'Endorser',
        last_name=' '.join(inv.invitee_name.split(' ')[1:])[:50] or 'Invited',
        is_active=True,
    )
    db.session.add(user)
    db.session.flush()

    endorser = Endorser(
        network_id=partner.network_id,
        user_id=user.id,
        locality=inv.invitee_locality or partner.locality,
        country='SD',
        status='approved',  # invite IS the OB approval
        reputation_score=50,
    )
    db.session.add(endorser)
    db.session.flush()

    # Compute COI signals + create endorsement — same path as login flow.
    signals = Endorsement.compute_coi_signals(
        partner=partner, endorser=endorser,
    )
    endorsement = Endorsement(
        partner_id=partner.id,
        endorser_id=endorser.id,
        q1_real=payload['q1_real'],
        q2_trust=payload['q2_trust'],
        q3_accept_aid=payload['q3_accept_aid'],
        coi_check_passed=(not signals),
    )
    endorsement.set_coi_signals(signals)
    db.session.add(endorsement)
    endorser.endorsements_count = 1
    db.session.flush()

    # Trust floor transition — same rules as api_submit_endorsement.
    floor = partner.trust_floor_signals()
    state_change = None
    if floor['ready_for_dd_clear']:
        partner.status = 'dd_clear'
        partner.trust_tier = 'tier_1_relational'
        partner.dd_cleared_at = datetime.now(timezone.utc)
        state_change = 'dd_clear'
    elif floor['endorsements_ok'] and not floor['bank_verified']:
        if partner.status in ('nominated', 'endorsements_open'):
            partner.status = 'dd_pending'
            state_change = 'dd_pending'

    inv.used_at = datetime.now(timezone.utc)
    inv.endorsement_id = endorsement.id
    inv.endorser_id = endorser.id
    db.session.commit()

    AuditChainEntry.append(
        action='proximate.endorsement.submitted_via_invite',
        actor_email=f'invite:{inv.invite_token[:8]}…',
        subject_kind='proximate_partner',
        subject_id=partner.id,
        details={
            'invite_id': inv.id,
            'invitee_name': inv.invitee_name,
            'endorsement_id': endorsement.id,
            'coi_check_passed': endorsement.coi_check_passed,
            'coi_signals': list(signals.keys()),
            'state_change': state_change,
        },
    )
    if state_change == 'dd_pending':
        _bump_participant_stage_for_partner_across_active_rounds(
            partner.network_id, partner.id, 'endorsed', None,
        )
    elif state_change == 'dd_clear':
        _bump_participant_stage_for_partner_across_active_rounds(
            partner.network_id, partner.id, 'bank_verified', None,
        )

    # Phase 716 DD sweep — the invite bypasses the approval queue (the
    # invite IS approval), so it must not bypass the sanctions screen.
    try:
        if inv.invitee_name:
            _run_named_sanctions_screen(
                endorser, display_name=inv.invitee_name,
                subject_kind='proximate_endorser',
                audit_action='proximate.endorser.sanctions_screened',
            )
    except Exception as _se:  # noqa: BLE001
        logger.warning(
            f"Proximate: invite endorser sanctions screen failed "
            f"for {endorser.id}: {_se}"
        )

    return jsonify({
        'success': True,
        'partner_name': partner.name,
        'state_change': state_change,
    })


# =========================================================================
# Phase 721 — Adeso's inbound-grant management
#
# Adeso doesn't APPLY to grants — the grants are already signed with
# donors. This surface lets Adeso:
#   1. Upload the signed agreement (or record it manually for demo)
#   2. Review AI-extracted terms
#   3. Track compliance + reporting obligations
#   4. Allocate rounds from the grant (traced back via
#      ProximateGrantAllocation)
# =========================================================================

@proximate_bp.route('/grants', methods=['GET'])
@login_required
def api_list_grants():
    """List all inbound Adeso grants in this tenant. OB-only for the
    full view; donor persona gets scoped to their own grants."""
    from app.models import ProximateGrant
    net, err = _require_proximate_tenant()
    if err:
        return err
    q = ProximateGrant.query.filter_by(network_id=net.id)
    # Donor persona: only THEIR grants. OB / admin: all.
    from app.models import ProximateDonor
    is_donor_persona = not _user_is_ob(net)
    if is_donor_persona:
        my_donor = ProximateDonor.query.filter_by(
            network_id=net.id, primary_user_id=current_user.id,
        ).first()
        if not my_donor:
            return jsonify({'success': True, 'grants': []})
        q = q.filter_by(donor_id=my_donor.id)
    rows = q.order_by(ProximateGrant.created_at.desc()).all()
    return jsonify({
        'success': True,
        'grants': [r.to_dict() for r in rows],
    })


@proximate_bp.route('/grants/<int:grant_id>', methods=['GET'])
@login_required
def api_get_grant(grant_id):
    """Full grant detail including allocations + reports history."""
    from app.models import (
        ProximateGrant, ProximateGrantAllocation, ProximateGrantReport,
        ProximateRound,
    )
    net, err = _require_proximate_tenant()
    if err:
        return err
    g = ProximateGrant.query.filter_by(
        id=grant_id, network_id=net.id,
    ).first()
    if not g:
        return jsonify({'success': False, 'error': 'not found'}), 404
    # Donor scope check.
    if not _user_is_ob(net):
        from app.models import ProximateDonor
        my_donor = ProximateDonor.query.filter_by(
            network_id=net.id, primary_user_id=current_user.id,
        ).first()
        if not my_donor or g.donor_id != my_donor.id:
            return jsonify({'success': False, 'error': 'not authorised'}), 403

    allocations = ProximateGrantAllocation.query.filter_by(
        grant_id=g.id,
    ).all()
    round_ids = [a.round_id for a in allocations]
    rounds = {
        r.id: r for r in ProximateRound.query.filter(
            ProximateRound.id.in_(round_ids or [0])
        ).all()
    }
    reports = ProximateGrantReport.query.filter_by(
        grant_id=g.id,
    ).order_by(ProximateGrantReport.due_date.asc()).all()

    is_ob_viewer = _user_is_ob(net)
    return jsonify({
        'success': True,
        'grant': g.to_dict(include_extracted=is_ob_viewer),
        'allocations': [
            {
                **a.to_dict(),
                'round_title': (
                    rounds[a.round_id].title
                    if a.round_id in rounds else f'Round #{a.round_id}'
                ),
                'round_status': (
                    rounds[a.round_id].status
                    if a.round_id in rounds else None
                ),
            }
            for a in allocations
        ],
        # OB gets report content inline so the 721c editor can open
        # without a per-report fetch; donors see scores + status only.
        'reports': [r.to_dict(include_content=is_ob_viewer) for r in reports],
    })


@proximate_bp.route('/grants', methods=['POST'])
@login_required
def api_create_grant():
    """Create a new grant record (OB-only). For now this accepts the
    extracted terms directly — a PDF-upload + AI-extract wizard lands
    in Phase 721b. Body:
      title, donor_id, donor_grant_ref, amount_committed_usd,
      currency, start_date, end_date, reporting_cadence,
      restrictions {geographies, sectors, purpose}, signed_at
    """
    from app.models import ProximateGrant, ProximateDonor
    import json as _json
    net, err = _require_proximate_tenant()
    if err:
        return err
    if not _user_is_ob(net):
        return jsonify({'success': False, 'error': 'ob only'}), 403
    body = get_request_json() or {}
    title = (body.get('title') or '').strip()
    if not title:
        return jsonify({'success': False, 'error': 'title required'}), 400
    donor_id = body.get('donor_id')
    donor_name = None
    if donor_id:
        donor = ProximateDonor.query.filter_by(
            id=donor_id, network_id=net.id,
        ).first()
        if not donor:
            return jsonify({
                'success': False, 'error': 'donor not in tenant',
            }), 400
        donor_name = donor.display_name

    def _parse_date(v):
        if not v:
            return None
        from datetime import date
        try:
            y, m, d = str(v).split('-')[:3]
            return date(int(y), int(m), int(d))
        except (ValueError, TypeError):
            return None

    g = ProximateGrant(
        network_id=net.id,
        donor_id=donor_id,
        donor_name_cache=donor_name,
        title=title[:300],
        donor_grant_ref=(body.get('donor_grant_ref') or '').strip()[:120] or None,
        amount_committed_usd=body.get('amount_committed_usd'),
        currency=(body.get('currency') or 'USD')[:3],
        start_date=_parse_date(body.get('start_date')),
        end_date=_parse_date(body.get('end_date')),
        reporting_cadence=(body.get('reporting_cadence') or 'quarterly'),
        restrictions_json=(
            _json.dumps(body['restrictions'])
            if isinstance(body.get('restrictions'), dict) else None
        ),
        signed_at=(
            datetime.now(timezone.utc)
            if body.get('signed_at') else None
        ),
        status=(body.get('status') or 'active'),
        created_by_user_id=current_user.id,
    )
    # Phase 721b — the wizard passes the accepted (possibly OB-edited)
    # extraction alongside the stored agreement document.
    if isinstance(body.get('extracted'), dict):
        g.extracted_json = _json.dumps(body['extracted'])
        g.extracted_at = datetime.now(timezone.utc)
        g.extracted_model = (body.get('extracted_model') or '')[:80] or None
    if body.get('signed_agreement_doc_id'):
        try:
            g.signed_agreement_doc_id = int(body['signed_agreement_doc_id'])
        except (ValueError, TypeError):
            pass
    db.session.add(g)
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.grant.created',
        actor_email=current_user.email,
        subject_kind='proximate_grant',
        subject_id=g.id,
        details={
            'title': g.title,
            'donor_id': g.donor_id,
            'amount_committed_usd': g.amount_committed_usd,
            'status': g.status,
        },
    )
    return jsonify({'success': True, 'grant': g.to_dict()})


@proximate_bp.route('/grants/<int:grant_id>', methods=['PUT'])
@login_required
def api_update_grant(grant_id):
    """OB edits a grant (e.g. after reviewing AI extraction)."""
    from app.models import ProximateGrant
    import json as _json
    net, err = _require_proximate_tenant()
    if err:
        return err
    if not _user_is_ob(net):
        return jsonify({'success': False, 'error': 'ob only'}), 403
    g = ProximateGrant.query.filter_by(
        id=grant_id, network_id=net.id,
    ).first()
    if not g:
        return jsonify({'success': False, 'error': 'not found'}), 404
    body = get_request_json() or {}
    for field in (
        'title', 'donor_grant_ref', 'currency', 'reporting_cadence', 'status',
    ):
        if field in body:
            v = body[field]
            if isinstance(v, str):
                v = v.strip()
                v = v[:300] if field == 'title' else v
            setattr(g, field, v)
    for field in ('amount_committed_usd', 'amount_received_usd'):
        if field in body and body[field] is not None:
            try:
                setattr(g, field, float(body[field]))
            except (ValueError, TypeError):
                pass
    if 'restrictions' in body and isinstance(body['restrictions'], dict):
        g.restrictions_json = _json.dumps(body['restrictions'])
    if isinstance(body.get('extracted'), dict):
        g.extracted_json = _json.dumps(body['extracted'])
        g.extracted_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify({'success': True, 'grant': g.to_dict()})


@proximate_bp.route('/grants/<int:grant_id>/compliance', methods=['GET'])
@login_required
def api_grant_compliance(grant_id):
    """Phase 721d — deliverables vs targets, computed from live system
    data where possible, OB-entered otherwise.

    Auto sources:
      • unit mentions 'round'  → count of rounds allocated from this grant
      • unit mentions report/audit/brief → submitted+accepted report count
    Everything else reads the OB-entered value from
    deliverable_progress_json ('manual'), or shows 'untracked'."""
    import json as _json
    from app.models import (
        ProximateGrant, ProximateGrantAllocation, ProximateGrantReport,
    )
    net, err = _require_proximate_tenant()
    if err:
        return err
    g = ProximateGrant.query.filter_by(id=grant_id, network_id=net.id).first()
    if not g:
        return jsonify({'success': False, 'error': 'not found'}), 404
    # Donor scope: same rule as grant detail.
    if not _user_is_ob(net):
        from app.models import ProximateDonor
        my_donor = ProximateDonor.query.filter_by(
            network_id=net.id, primary_user_id=current_user.id,
        ).first()
        if not my_donor or g.donor_id != my_donor.id:
            return jsonify({'success': False, 'error': 'not authorised'}), 403

    return jsonify({
        'success': True, 'deliverables': _grant_deliverables_progress(g),
    })


def _grant_deliverables_progress(g) -> list[dict]:
    """Phase 721d computation, shared by the compliance JSON endpoint
    and the Phase 721f donor-pack PDF."""
    import json as _json
    from app.models import ProximateGrantAllocation, ProximateGrantReport
    extracted = g._extracted()
    deliverables = extracted.get('key_deliverables') or []
    manual = {}
    if g.deliverable_progress_json:
        try:
            manual = _json.loads(g.deliverable_progress_json) or {}
        except (ValueError, TypeError):
            manual = {}

    rounds_count = (
        db.session.query(ProximateGrantAllocation.round_id)
        .filter_by(grant_id=g.id).distinct().count()
    )
    reports_done = ProximateGrantReport.query.filter(
        ProximateGrantReport.grant_id == g.id,
        ProximateGrantReport.status.in_(('submitted', 'accepted')),
    ).count()

    out = []
    for i, d in enumerate(deliverables):
        unit = (d.get('unit') or '').lower()
        target = d.get('target')
        current, source = None, 'untracked'
        if 'round' in unit:
            current, source = rounds_count, 'auto:rounds'
        elif any(k in unit for k in ('report', 'audit', 'brief')):
            current, source = reports_done, 'auto:reports'
        elif str(i) in manual:
            current, source = manual[str(i)], 'manual'
        pct = None
        try:
            if current is not None and target:
                pct = min(100, round(float(current) / float(target) * 100))
        except (ValueError, TypeError, ZeroDivisionError):
            pct = None
        out.append({
            'index': i,
            'title': d.get('title'),
            'target': target,
            'unit': d.get('unit'),
            'current': current,
            'source': source,
            'pct': pct,
        })
    return out


@proximate_bp.route(
    '/grants/<int:grant_id>/deliverable-progress', methods=['PUT'],
)
@login_required
def api_set_deliverable_progress(grant_id):
    """Phase 721d — OB records current progress for a deliverable the
    system can't compute. Body: {index: int, value: number}."""
    import json as _json
    from app.models import ProximateGrant
    net, err = _require_proximate_tenant()
    if err:
        return err
    if not _user_is_ob(net):
        return jsonify({'success': False, 'error': 'ob only'}), 403
    g = ProximateGrant.query.filter_by(id=grant_id, network_id=net.id).first()
    if not g:
        return jsonify({'success': False, 'error': 'not found'}), 404
    body = get_request_json() or {}
    try:
        idx = int(body.get('index'))
        value = float(body.get('value'))
    except (ValueError, TypeError):
        return jsonify({
            'success': False, 'error': 'index and numeric value required',
        }), 400
    progress = {}
    if g.deliverable_progress_json:
        try:
            progress = _json.loads(g.deliverable_progress_json) or {}
        except (ValueError, TypeError):
            progress = {}
    progress[str(idx)] = value
    g.deliverable_progress_json = _json.dumps(progress)
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.grant.deliverable_progress_set',
        actor_email=current_user.email,
        subject_kind='proximate_grant',
        subject_id=g.id,
        details={'index': idx, 'value': value},
    )
    return jsonify({'success': True})


@proximate_bp.route(
    '/grants/<int:grant_id>/reports/<int:report_id>/draft', methods=['POST'],
)
@login_required
def api_draft_grant_report(grant_id, report_id):
    """Phase 721c — AI drafts the report body from real allocation /
    disbursement / outcome data. OB-only. The draft lands in
    ai_draft_json (always inspectable) and is copied into content_json
    only when no human content exists yet — a human edit is never
    silently overwritten."""
    import json as _json
    from app.models import ProximateGrant, ProximateGrantReport
    from app.services.proximate_grant_extract_service import (
        draft_grant_report,
    )
    net, err = _require_proximate_tenant()
    if err:
        return err
    if not _user_is_ob(net):
        return jsonify({'success': False, 'error': 'ob only'}), 403
    g = ProximateGrant.query.filter_by(id=grant_id, network_id=net.id).first()
    if not g:
        return jsonify({'success': False, 'error': 'grant not found'}), 404
    r = ProximateGrantReport.query.filter_by(
        id=report_id, grant_id=g.id,
    ).first()
    if not r:
        return jsonify({'success': False, 'error': 'report not found'}), 404
    draft = draft_grant_report(grant=g, report=r)
    if draft is None:
        return jsonify({
            'success': False,
            'error': 'AI drafting unavailable right now — try again shortly.',
        }), 503
    r.ai_draft_json = _json.dumps(draft)
    r.ai_draft_at = datetime.now(timezone.utc)
    if not r.content_json:
        r.content_json = r.ai_draft_json
    if r.status == 'pending':
        r.status = 'drafting'
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.grant_report.ai_drafted',
        actor_email=current_user.email,
        subject_kind='proximate_grant_report',
        subject_id=r.id,
        details={'grant_id': g.id, 'sections': list(draft.keys())},
    )
    return jsonify({'success': True, 'report': r.to_dict(include_content=True)})


@proximate_bp.route(
    '/grants/<int:grant_id>/reports/<int:report_id>', methods=['PUT'],
)
@login_required
def api_update_grant_report(grant_id, report_id):
    """Phase 721c — OB edits report content and moves it through its
    lifecycle. Body: {content?: dict, status?: str}. Allowed status
    moves: pending/drafting→drafting|submitted, submitted→accepted|
    revision_requested (donor feedback recorded by OB), revision_
    requested→drafting|submitted."""
    import json as _json
    from app.models import ProximateGrant, ProximateGrantReport
    net, err = _require_proximate_tenant()
    if err:
        return err
    if not _user_is_ob(net):
        return jsonify({'success': False, 'error': 'ob only'}), 403
    g = ProximateGrant.query.filter_by(id=grant_id, network_id=net.id).first()
    if not g:
        return jsonify({'success': False, 'error': 'grant not found'}), 404
    r = ProximateGrantReport.query.filter_by(
        id=report_id, grant_id=g.id,
    ).first()
    if not r:
        return jsonify({'success': False, 'error': 'report not found'}), 404
    body = get_request_json() or {}

    if isinstance(body.get('content'), dict):
        r.content_json = _json.dumps({
            str(k)[:60]: str(v)[:6000] for k, v in body['content'].items()
        })

    new_status = body.get('status')
    if new_status:
        allowed = {
            'pending': {'drafting', 'submitted'},
            'drafting': {'submitted'},
            'submitted': {'accepted', 'revision_requested'},
            'revision_requested': {'drafting', 'submitted'},
        }
        if new_status not in allowed.get(r.status, set()):
            return jsonify({
                'success': False,
                'error': f'cannot move {r.status} → {new_status}',
            }), 422
        if new_status == 'submitted' and not r.content_json:
            return jsonify({
                'success': False,
                'error': 'cannot submit an empty report — draft or write content first',
            }), 422
        r.status = new_status
        if new_status == 'submitted':
            r.submitted_at = datetime.now(timezone.utc)
            r.submitted_by_user_id = current_user.id
        if new_status == 'accepted':
            r.donor_ack_at = datetime.now(timezone.utc)
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.grant_report.updated',
        actor_email=current_user.email,
        subject_kind='proximate_grant_report',
        subject_id=r.id,
        details={
            'grant_id': g.id,
            'content_edited': isinstance(body.get('content'), dict),
            'status': r.status,
        },
    )
    return jsonify({'success': True, 'report': r.to_dict(include_content=True)})


@proximate_bp.route(
    '/grants/<int:grant_id>/reports/<int:report_id>/score', methods=['POST'],
)
@login_required
def api_score_grant_report(grant_id, report_id):
    """Phase 721d — AI scores one donor report against the grant's
    extracted requirements. OB-only; re-running overwrites the previous
    score. The donor persona sees the result on the grant detail —
    prescreened, scored deliverables are the selling point."""
    import json as _json
    from app.models import ProximateGrant, ProximateGrantReport
    from app.services.proximate_grant_extract_service import (
        score_report_compliance,
    )
    net, err = _require_proximate_tenant()
    if err:
        return err
    if not _user_is_ob(net):
        return jsonify({'success': False, 'error': 'ob only'}), 403
    g = ProximateGrant.query.filter_by(id=grant_id, network_id=net.id).first()
    if not g:
        return jsonify({'success': False, 'error': 'grant not found'}), 404
    r = ProximateGrantReport.query.filter_by(
        id=report_id, grant_id=g.id,
    ).first()
    if not r:
        return jsonify({'success': False, 'error': 'report not found'}), 404
    if not r.content_json and not r.ai_draft_json:
        return jsonify({
            'success': False,
            'error': 'report has no content to score yet',
        }), 422
    scores = score_report_compliance(grant=g, report=r)
    if scores is None:
        return jsonify({
            'success': False,
            'error': 'AI scoring unavailable right now — try again shortly.',
        }), 503
    r.compliance_score_json = _json.dumps(scores)
    r.compliance_scored_at = datetime.now(timezone.utc)
    db.session.commit()
    avg = round(sum(s['score'] for s in scores) / len(scores)) if scores else None
    AuditChainEntry.append(
        action='proximate.grant_report.compliance_scored',
        actor_email=current_user.email,
        subject_kind='proximate_grant_report',
        subject_id=r.id,
        details={
            'grant_id': g.id,
            'requirements_scored': len(scores),
            'average_score': avg,
        },
    )
    return jsonify({'success': True, 'report': r.to_dict()})


@proximate_bp.route('/grants/extract-agreement', methods=['POST'])
@login_required
def api_extract_grant_agreement():
    """Phase 721b — upload the signed grant agreement PDF and run AI
    extraction. OB-only. Multipart: file (text-based PDF, max 15 MB).

    Returns the extracted terms + stored document_id for the review
    wizard. Nothing is persisted to a grant here — the OB reviews,
    edits, and accepts via POST /grants (passing `extracted` +
    `signed_agreement_doc_id`)."""
    import uuid as _uuid
    from flask import current_app as cap
    from werkzeug.utils import secure_filename
    from app.models import Document, ProximateDonor
    from app.services.proximate_grant_extract_service import (
        extract_pdf_text, extract_agreement_terms, EXTRACT_MODEL,
    )
    net, err = _require_proximate_tenant()
    if err:
        return err
    if not _user_is_ob(net):
        return jsonify({'success': False, 'error': 'ob only'}), 403

    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'no file provided'}), 400
    file = request.files['file']
    if not file.filename:
        return jsonify({'success': False, 'error': 'no file selected'}), 400

    max_bytes = 15 * 1024 * 1024
    if request.content_length and request.content_length > max_bytes:
        return jsonify({
            'success': False,
            'error': 'file too large (max 15 MB)',
        }), 413

    original_filename = secure_filename(file.filename)
    ext = (original_filename.rsplit('.', 1)[-1].lower()
           if '.' in original_filename else '')
    if ext != 'pdf':
        return jsonify({
            'success': False,
            'error': 'only PDF agreements are supported (got .%s)' % (ext or '?'),
        }), 400

    stored_filename = f"proximate_agreement_{_uuid.uuid4().hex}.pdf"
    filepath = os.path.join(cap.config['UPLOAD_FOLDER'], stored_filename)
    file.save(filepath)
    file_size = os.path.getsize(filepath)
    with open(filepath, 'rb') as fcheck:
        if not fcheck.read(5).startswith(b'%PDF'):
            os.remove(filepath)
            return jsonify({
                'success': False, 'error': 'file is not a valid PDF',
            }), 400

    doc_text = extract_pdf_text(filepath)
    if len(doc_text) < 300:
        os.remove(filepath)
        return jsonify({
            'success': False,
            'error': (
                'No readable text in this PDF — it looks like a scan '
                'without an OCR text layer. Export the agreement as a '
                'text PDF (or run OCR) and upload again.'
            ),
        }), 422

    extracted = extract_agreement_terms(
        doc_text=doc_text, filename=original_filename,
    )
    if extracted is None:
        os.remove(filepath)
        return jsonify({
            'success': False,
            'error': 'AI extraction is unavailable right now — try again shortly.',
        }), 503

    doc = Document(
        original_filename=original_filename,
        stored_filename=stored_filename,
        file_size=file_size,
        mime_type='application/pdf',
        doc_type='proximate_grant_agreement',
    )
    db.session.add(doc)
    db.session.commit()

    # Best-effort donor match against the registry so the wizard can
    # pre-select; OB can always override.
    donor_match = None
    donor_name = (extracted.get('donor') or '').strip().lower()
    if donor_name:
        for d in ProximateDonor.query.filter_by(network_id=net.id).all():
            dn = (d.display_name or '').strip().lower()
            if dn and (dn in donor_name or donor_name in dn):
                donor_match = {'id': d.id, 'display_name': d.display_name}
                break

    AuditChainEntry.append(
        action='proximate.grant.agreement_extracted',
        actor_email=current_user.email,
        subject_kind='document',
        subject_id=doc.id,
        details={
            'filename': original_filename,
            'size_bytes': file_size,
            'text_chars': len(doc_text),
            'extraction_confidence': extracted.get('extraction_confidence'),
            'model': EXTRACT_MODEL,
        },
    )
    logger.info(
        f"Proximate: agreement extracted doc_id={doc.id} "
        f"confidence={extracted.get('extraction_confidence')}"
    )
    return jsonify({
        'success': True,
        'document_id': doc.id,
        'extracted': extracted,
        'extracted_model': EXTRACT_MODEL,
        'donor_match': donor_match,
    })


@proximate_bp.route(
    '/grants/<int:grant_id>/allocations', methods=['POST'],
)
@login_required
def api_add_grant_allocation(grant_id):
    """Allocate an amount from grant to a round. OB-only.
    Body: {round_id, amount_usd, notes?}"""
    from app.models import (
        ProximateGrant, ProximateGrantAllocation, ProximateRound,
    )
    net, err = _require_proximate_tenant()
    if err:
        return err
    if not _user_is_ob(net):
        return jsonify({'success': False, 'error': 'ob only'}), 403
    g = ProximateGrant.query.filter_by(
        id=grant_id, network_id=net.id,
    ).first()
    if not g:
        return jsonify({'success': False, 'error': 'grant not found'}), 404
    body = get_request_json() or {}
    round_id = body.get('round_id')
    amount = body.get('amount_usd')
    if not round_id or amount in (None, ''):
        return jsonify({
            'success': False,
            'error': 'round_id and amount_usd required',
        }), 400
    round_row = ProximateRound.query.filter_by(
        id=round_id, network_id=net.id,
    ).first()
    if not round_row:
        return jsonify({'success': False, 'error': 'round not in tenant'}), 400
    try:
        amount_f = float(amount)
    except (ValueError, TypeError):
        return jsonify({'success': False, 'error': 'amount_usd must be number'}), 400
    if amount_f > g.amount_remaining_usd:
        return jsonify({
            'success': False,
            'error': (
                f'insufficient grant balance: ${amount_f:,.0f} requested '
                f'but only ${g.amount_remaining_usd:,.0f} remains uncommitted'
            ),
        }), 422
    existing = ProximateGrantAllocation.query.filter_by(
        round_id=round_row.id, grant_id=g.id,
    ).first()
    if existing:
        return jsonify({
            'success': False,
            'error': 'this round is already allocated from this grant',
        }), 409
    row = ProximateGrantAllocation(
        round_id=round_row.id, grant_id=g.id,
        amount_usd=amount_f,
        notes=(body.get('notes') or '').strip()[:2000] or None,
    )
    db.session.add(row)
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.grant.allocated_to_round',
        actor_email=current_user.email,
        subject_kind='proximate_grant',
        subject_id=g.id,
        details={
            'round_id': round_row.id,
            'amount_usd': amount_f,
        },
    )
    return jsonify({'success': True, 'allocation': row.to_dict()})


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
    scope_err = _donor_round_scope_403(net, r.id)
    if scope_err:
        return scope_err

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
    scope_err = _donor_round_scope_403(net, r.id)
    if scope_err:
        return scope_err

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

    # Phase 711b — donor is a FK now, backfilled donor_name for
    # display. If the picker submitted a donor_id, look it up + trust
    # its display_name over any client-supplied name to keep the two
    # in sync. Free-text donor_name still accepted for backwards
    # compatibility with older callers.
    donor_id_raw = payload.get('donor_id')
    donor_id = None
    donor_name = (payload.get('donor_name') or '').strip() or None
    if donor_id_raw is not None:
        try:
            donor_id = int(donor_id_raw)
        except (TypeError, ValueError):
            donor_id = None
    if donor_id is not None:
        from app.models import ProximateDonor
        d = ProximateDonor.query.filter_by(
            id=donor_id, network_id=net.id,
        ).first()
        if d is None:
            return jsonify({
                'success': False,
                'error': 'donor_id not in this tenant',
            }), 400
        donor_name = d.display_name

    r = ProximateRound(
        network_id=net.id,
        title=title[:300],
        title_ar=(payload.get('title_ar') or '').strip()[:300] or None,
        trigger_type=trigger,
        trigger_summary=(payload.get('trigger_summary') or '').strip() or None,
        donor_id=donor_id,
        donor_name=donor_name,
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
        # Phase 715a — activation opens the endorsement window for every
        # planned participant. Idempotent; safe if roster is empty.
        from app.models import ProximateRoundParticipant
        planned = ProximateRoundParticipant.query.filter_by(
            round_id=r.id, stage='planned',
        ).all()
        for p in planned:
            _bump_participant_stage(
                r.id, p.partner_id, 'endorsement_open', current_user.id,
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
@ob_required
def api_list_disbursements():
    """List disbursements for the tenant. Filterable by partner_id,
    round_id, status, overdue.

    Phase 702 — gated to @ob_required. Reviewer flagged the prior
    @login_required: donors could still GET this and read every
    partner's disbursement detail (purpose, amount, status, partner
    name) via API even with the UI hidden. Donors get their portfolio
    rollup via /donors/me — that's the right donor surface.
    """
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
    # RBAC 2026-07-09 — OB-only, plus the assigned third-party verifier
    # (Phase 673) who must see the disbursement to attest. Donors/endorsers
    # get 403. report_token is a secret access value and is stripped for any
    # non-OB caller.
    is_ob = _user_is_ob(net)
    is_verifier = (getattr(d, 'verifier_user_id', None) == current_user.id)
    if not (is_ob or is_verifier):
        return jsonify({
            'success': False, 'error': 'Not authorised',
            'code': 'err.forbidden',
        }), 403
    payload = d.to_dict()
    if not is_ob:
        payload.pop('report_token', None)
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

    # Phase 721g — donor grant restriction enforcement. Every grant
    # funding this round carries geographic restrictions extracted from
    # the signed agreement; a disbursement to a partner outside those
    # geographies is a compliance breach, so it's a hard 422 here.
    if round_id_arg:
        from app.models import ProximateGrantAllocation, ProximateGrant

        funding_grants = (
            ProximateGrant.query
            .join(
                ProximateGrantAllocation,
                ProximateGrantAllocation.grant_id == ProximateGrant.id,
            )
            .filter(ProximateGrantAllocation.round_id == round_id_arg)
            .all()
        )
        for fg in funding_grants:
            geos = (fg._restrictions() or {}).get('geographies') or []
            if not _grant_geo_ok(partner.country, geos):
                return jsonify({
                    'success': False,
                    'error': (
                        f'grant restriction violation: "{fg.title}" '
                        f'(ref {fg.donor_grant_ref or "-"}) restricts funds to '
                        f'{", ".join(map(str, geos))}, but partner '
                        f'{partner.name!r} is registered in '
                        f'{partner.country or "?"}'
                    ),
                    'grant_id': fg.id,
                }), 422

    n_cosigners_needed = cosigners_required_for(amount_f)
    needs_cosign = n_cosigners_needed > 0
    initial_status = 'pending_cosign' if needs_cosign else 'pending_report'

    # PRX-DISB-001 — traceability: every money release should record WHICH
    # payment route it used. If the OB didn't pass an explicit method and
    # the partner has exactly one verified method on file, link it
    # automatically so the disbursement + report show the route in the
    # audit trail (a null method_id on a released disbursement is a gap).
    method_id = payload.get('disbursement_method_id')
    if not method_id:
        _verified = PartnerDisbursementMethod.query.filter_by(
            partner_id=partner.id, status='verified',
        ).all()
        if len(_verified) == 1:
            method_id = _verified[0].id

    d = ProximateDisbursement(
        network_id=net.id,
        partner_id=partner.id,
        round_id=payload.get('round_id'),
        disbursement_method_id=method_id,
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

    # Phase 716 DD sweep — adverse media screening for disbursements at
    # or above the $10k tier (matches the cosign ladder threshold; no
    # reason to hit a web-search AI call for a $200 release). Runs in
    # the background so it never delays the disbursement.
    if amount_f >= 10000:
        try:
            from app.utils.background import submit_task
            from flask import current_app as _ca
            _app = _ca._get_current_object()
            _pid = partner.id
            _did = d.id

            def _run_adverse_media():
                with _app.app_context():
                    try:
                        import json as _json
                        from app.services.adverse_media_service import (
                            AdverseMediaService,
                        )
                        p = ProximatePartner.query.get(_pid)
                        if not p:
                            return
                        result = AdverseMediaService.screen(
                            org_name=p.name,
                            country=p.country or 'SD',
                        ) or {}
                        verdict = result.get('verdict') or result.get('status')
                        intake = p.get_intake_form()
                        intake['adverse_media'] = {
                            'verdict': verdict,
                            'high_count': result.get('high_count'),
                            'medium_count': result.get('medium_count'),
                            'source': result.get('source'),
                            'checked_at': datetime.now(timezone.utc).isoformat(),
                            'trigger_disbursement_id': _did,
                        }
                        p.set_intake_form(intake)
                        db.session.commit()
                        AuditChainEntry.append(
                            action=(
                                'proximate.partner.adverse_media_flagged'
                                if verdict == 'flagged'
                                else 'proximate.partner.adverse_media_screened'
                            ),
                            actor_email='system',
                            subject_kind='proximate_partner',
                            subject_id=p.id,
                            details=intake['adverse_media'],
                        )
                        if verdict == 'flagged':
                            logger.warning(
                                f"Proximate: ADVERSE MEDIA flag on partner "
                                f"{p.id} ({p.name!r}) triggered by "
                                f"disbursement {_did}"
                            )
                    except Exception as e:  # noqa: BLE001
                        logger.warning(
                            f"Proximate adverse media screen failed for "
                            f"partner {_pid}: {e}"
                        )
            submit_task(
                _run_adverse_media, task_type='proximate_adverse_media',
            )
        except Exception as e:  # noqa: BLE001
            logger.warning(
                f"Proximate adverse media schedule failed for "
                f"disbursement {d.id}: {e}"
            )

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
    # Phase 715a — a real money release advances the partner's roster
    # stage to `disbursed`. If the disbursement still needs cosigners,
    # we hold at `bank_verified` and let the cosign endpoint bump.
    if not needs_cosign:
        _bump_participant_stage(
            d.round_id, partner.id, 'disbursed', current_user.id,
        )
    else:
        _bump_participant_stage(
            d.round_id, partner.id, 'bank_verified', current_user.id,
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
    # Phase 691 — issue verifier token URL so the verifier can attest
    # without needing a Kuja login. Idempotent re-assigns reuse it.
    if not d.verifier_token:
        import secrets as _secrets
        d.verifier_token = _secrets.token_urlsafe(32)
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
    base = request.host_url.rstrip('/')
    return jsonify({
        'success': True,
        'verifier_user_id': picked.user_id,
        'verifier_endorser_id': picked.id,
        'verifier_name': picked.full_name if hasattr(picked, 'full_name') else None,
        'verifier_url': f'{base}/proximate-verify?t={d.verifier_token}',
    })


# =====================================================================
# Phase 691 — Verifier mini-portal (token URL)
# =====================================================================
# The verifier gets one URL emailed/WhatsApp'd to them at assign time.
# No login required. They see the disbursement context + the OB's
# recorded verdict (if any) + a simple confirmed/disputed + notes form.


@proximate_bp.route('/verify-attest/<token>', methods=['GET'])
def api_verifier_attest_lookup(token):
    """Public lookup. Verifier sees the disbursement context they need
    to make an independent attestation."""
    d = ProximateDisbursement.query.filter_by(verifier_token=token).first()
    if not d:
        return jsonify({'success': False, 'error': 'invalid token'}), 404
    return jsonify({
        'success': True,
        'disbursement': {
            'id': d.id,
            'amount_usd': float(d.amount_usd) if d.amount_usd else None,
            'purpose': d.purpose,
            'status': d.status,
            'sent_at': d.sent_at.isoformat() if d.sent_at else None,
            'partner_name': d.partner.name if d.partner else None,
            'verifier_verdict': d.verifier_verdict,
            'verifier_notes': d.verifier_notes,
            'verifier_attested_at': (
                d.verifier_attested_at.isoformat()
                if d.verifier_attested_at else None
            ),
            'verified_by_ob': d.status == 'verified',
            'flagged_by_ob': d.status == 'flagged',
        },
    })


@proximate_bp.route('/verify-attest/<token>', methods=['POST'])
def api_verifier_attest_submit(token):
    """Public attest. Token IS the credential. Once a verdict is
    recorded the token rejects further submits."""
    d = ProximateDisbursement.query.filter_by(verifier_token=token).first()
    if not d:
        return jsonify({'success': False, 'error': 'invalid token'}), 404
    if d.verifier_verdict:
        return jsonify({
            'success': False,
            'error': 'already attested',
            'verdict': d.verifier_verdict,
        }), 409
    body = request.get_json() or {}
    verdict = (body.get('verdict') or '').strip().lower()
    if verdict not in ('confirmed', 'disputed'):
        return jsonify({
            'success': False,
            'error': 'verdict must be confirmed or disputed',
        }), 400
    notes = (body.get('notes') or '').strip()
    d.verifier_verdict = verdict
    d.verifier_notes = notes or None
    d.verifier_attested_at = datetime.now(timezone.utc)
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.disbursement.verifier_attested',
        actor_email=f'verifier_user_{d.verifier_user_id}',
        subject_kind='proximate_disbursement',
        subject_id=d.id,
        details={
            'verdict': verdict,
            'has_notes': bool(notes),
            'submitted_via': 'token_url',
        },
    )
    # Phase 715a — third-party confirmed verdict advances to `verified`.
    # Disputed verdicts do NOT advance the stage — they represent an open
    # question, not a completed step.
    if verdict == 'confirmed':
        _bump_participant_stage(d.round_id, d.partner_id, 'verified')
    return jsonify({
        'success': True,
        'verdict': verdict,
        'attested_at': d.verifier_attested_at.isoformat(),
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
    # Phase 715a — see api_verifier_attest_submit for the same rule.
    if verdict == 'confirmed':
        _bump_participant_stage(
            d.round_id, d.partner_id, 'verified', current_user.id,
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
        # Phase 715 gap fix — a disbursement created pending-cosign parked
        # the roster at bank_verified; final cosign means the money moves.
        _bump_participant_stage(
            d.round_id, d.partner_id, 'disbursed', current_user.id,
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
    # RBAC 2026-07-09 — evidence (photo/voice) is OB-only, plus the assigned
    # third-party verifier who must inspect it to attest. Not for donors/endorsers.
    if not (_user_is_ob(net)
            or getattr(d, 'verifier_user_id', None) == current_user.id):
        return jsonify({
            'success': False, 'error': 'Not authorised',
            'code': 'err.forbidden',
        }), 403

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
    # Phase 715a — 14-day report locks in the roster's `reported` stage.
    _bump_participant_stage(
        d.round_id, d.partner_id, 'reported',
        current_user.id if current_user.is_authenticated else None,
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
    # Phase 715a — 90-day attestation moves the partner to `attested`.
    _bump_participant_stage(
        o.round_id, o.partner_id, 'attested',
        current_user.id if current_user.is_authenticated else None,
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
# Phase 689 — Partner mini-portal (long-lived token URL)
# =====================================================================
# Partners with multiple disbursements need one place to see their
# whole story: every release, every report obligation, every OB
# acknowledgement, every outcome attestation. The mini-portal is
# that surface — token-credentialed like the per-disbursement
# report URL, but scoped to the partner.


def _ensure_partner_mini_portal_token(partner) -> str:
    """Idempotent — generates the token on first call, persists it,
    returns it. Subsequent calls return the existing token."""
    if not partner.mini_portal_token:
        import secrets
        partner.mini_portal_token = secrets.token_urlsafe(32)
        db.session.commit()
    return partner.mini_portal_token


@proximate_bp.route('/partner-mini-portal/<token>', methods=['GET'])
def api_partner_mini_portal(token):
    """Public mini-portal lookup. Token IS the credential.

    Returns the partner's profile + every disbursement + every
    outcome attestation + the most recent acknowledgement chain.
    No login required.
    """
    from app.models import ProximateOutcomeAttestation
    partner = ProximatePartner.query.filter_by(
        mini_portal_token=token,
    ).first()
    if not partner:
        return jsonify({'success': False, 'error': 'invalid token'}), 404

    dis = (
        ProximateDisbursement.query
        .filter_by(partner_id=partner.id)
        .order_by(ProximateDisbursement.sent_at.desc().nullslast())
        .all()
    )
    out = ProximateOutcomeAttestation.query.filter_by(
        partner_id=partner.id,
    ).all()
    out_by_dis_id = {o.disbursement_id: o for o in out}

    disbursements = []
    for d in dis:
        o = out_by_dis_id.get(d.id)
        disbursements.append({
            'id': d.id,
            'amount_usd': float(d.amount_usd) if d.amount_usd else None,
            'purpose': d.purpose,
            'status': d.status,
            'sent_at': d.sent_at.isoformat() if d.sent_at else None,
            'report_due_at': (
                d.report_due_at.isoformat() if d.report_due_at else None
            ),
            'report_submitted_at': (
                d.report_submitted_at.isoformat()
                if d.report_submitted_at else None
            ),
            'report_token': d.report_token,
            'ack_message': d.ack_message,
            'ack_message_at': (
                d.ack_message_at.isoformat() if d.ack_message_at else None
            ),
            'outcome': {
                'id': o.id,
                'status': o.status,
                'due_at': o.due_at.isoformat() if o.due_at else None,
                'submitted_at': (
                    o.submitted_at.isoformat() if o.submitted_at else None
                ),
                'report_token': o.report_token,
                'has_counterfactual': bool(o.counterfactual_reflection),
                'ack_message': o.ack_message,
            } if o else None,
        })

    return jsonify({
        'success': True,
        'partner': {
            'id': partner.id,
            'name': partner.name,
            'status': partner.status,
            'capital_class': getattr(partner, 'capital_class', None),
            'dd_cleared_at': (
                partner.dd_cleared_at.isoformat()
                if partner.dd_cleared_at else None
            ),
        },
        'disbursements': disbursements,
        # Phase 716d — right-to-know: what the fund has decided about
        # this partner and why. Redacted (no sanctions-list details,
        # no reporter identities); review requests go via the public
        # grievance channel.
        'decisions': _partner_decision_timeline(partner),
    })


def _partner_decision_timeline(partner) -> list[dict]:
    """Phase 716d — the partner-facing 'decisions affecting me' feed.

    Built from three redacted sources:
      1. whitelisted audit-chain events on this partner (status
         transitions, nominations, bank verify, suspend/reinstate) —
         label only, no details JSON (details can carry list names,
         reporter identities, endorser emails);
      2. sanctions checks collapsed to cleared/flagged + timestamp;
      3. interventions with kind, OB reason (that IS the rationale
         the fairness gap was about), deadline and status.

    Sorted newest-first. Fairness posture: right-to-know without
    right-to-appeal — the payload ends with how to request a review.
    """
    events = []

    # 1. Whitelisted audit actions → plain-language labels
    action_labels = {
        'proximate.partner.nominated': 'Nominated to the fund',
        'proximate.partner.self_nominated': 'Self-nomination received',
        'proximate.partner.endorsements_opened': 'Endorsement stage opened',
        'proximate.partner.dd_pending': 'Due diligence started',
        'proximate.partner.dd_clear': 'Due diligence cleared',
        'proximate.partner.bank_verified': 'Payment details verified',
        'proximate.partner.suspended': 'Suspended pending review',
        'proximate.partner.reinstated': 'Reinstated',
        'proximate.partner.status_changed': 'Status updated',
    }
    audit_rows = (
        AuditChainEntry.query
        .filter_by(subject_kind='proximate_partner', subject_id=partner.id)
        .order_by(AuditChainEntry.created_at.desc())
        .limit(100)
        .all()
    )
    for row in audit_rows:
        label = action_labels.get(row.action)
        if not label:
            continue
        events.append({
            'kind': 'status',
            'label': label,
            'at': row.created_at.isoformat() if row.created_at else None,
        })

    # 2. Sanctions screening — cleared/flagged only, never list detail
    if partner.sanctions_checked_at:
        events.append({
            'kind': 'screening',
            'label': (
                'Routine screening: flagged for review'
                if partner.sanctions_flag
                else 'Routine screening: cleared'
            ),
            'at': partner.sanctions_checked_at.isoformat(),
        })

    # 3. Interventions — the OB reason is the rationale the partner
    # has a right to see (SoP 13 measures are formal notices).
    for m in InterventionMeasure.query.filter_by(
        partner_id=partner.id,
    ).order_by(InterventionMeasure.opened_at.desc()).limit(20).all():
        events.append({
            'kind': 'intervention',
            'label': f'{m.kind.title()} measure ({m.status})',
            'reason': m.reason,
            'response_due_at': (
                m.response_due_at.isoformat() if m.response_due_at else None
            ),
            'at': m.opened_at.isoformat() if m.opened_at else None,
        })

    events.sort(key=lambda e: e.get('at') or '', reverse=True)
    return events


@proximate_bp.route('/partners/<int:partner_id>/mini-portal-link', methods=['POST'])
@ob_required
def api_issue_partner_mini_portal_link(partner_id):
    """OB endpoint — generate or fetch the mini-portal token and the
    sharable URL. Idempotent: returns the existing token if one is
    already issued."""
    net, err = _require_proximate_tenant()
    if err:
        return err
    partner = ProximatePartner.query.filter_by(
        id=partner_id, network_id=net.id,
    ).first()
    if not partner:
        return jsonify({'success': False, 'error': 'not found'}), 404
    token = _ensure_partner_mini_portal_token(partner)
    base = request.host_url.rstrip('/')
    return jsonify({
        'success': True,
        'token': token,
        'url': f'{base}/proximate-partner?t={token}',
    })


# =====================================================================
# Phase 700 — Public token endorsement portal (no-login flow)
# =====================================================================
# Reviewer feedback after the 9.5/10 retest: the endorser experience
# still felt like an authenticated platform page. This adds the sixth
# token-credentialed surface so endorsers can do the entire flow from
# a WhatsApp link — same pattern as the partner mini-portal (Phase 689).
#
# Token is minted at endorser approval (or on first-share by OB). The
# URL goes out via WhatsApp; the static-export page at
# /proximate-endorse?t=<token> shows the endorser's pending invitations
# and lets them submit the 3 Y/N answers + voice notes without logging
# in. Server-side authentication is the token alone — same security
# posture as the existing 5 token surfaces.


def _ensure_endorser_public_token(endorser) -> str:
    """Mint or return the endorser's no-login portal token. Idempotent."""
    if not endorser.public_token:
        import secrets
        endorser.public_token = secrets.token_urlsafe(32)
        db.session.commit()
    return endorser.public_token


@proximate_bp.route('/endorser-portal/<token>', methods=['GET'])
def api_endorser_portal_lookup(token):
    """Public lookup. Token IS the credential.

    Returns the endorser's identity + the partners they can endorse
    right now (those in nominated / endorsements_open / dd_pending
    states that this endorser hasn't already endorsed and where the COI
    auto-check would pass server-side).
    """
    endorser = Endorser.query.filter_by(public_token=token).first()
    if not endorser:
        return jsonify({'success': False, 'error': 'invalid token'}), 404

    if endorser.status != 'approved':
        return jsonify({
            'success': False,
            'error': f'endorser status is {endorser.status!r}; must be approved',
        }), 403

    # Find partners awaiting endorsement in this network. Pre-filter by
    # status so the inbox shows only actionable items.
    actionable_statuses = ('nominated', 'endorsements_open', 'dd_pending')
    existing = {
        e.partner_id for e in Endorsement.query.filter_by(
            endorser_id=endorser.id,
        ).all()
    }
    candidates = (
        ProximatePartner.query
        .filter(
            ProximatePartner.network_id == endorser.network_id,
            ProximatePartner.status.in_(actionable_statuses),
        )
        .order_by(ProximatePartner.nominated_at.desc().nullslast())
        .limit(50)
        .all()
    )

    pending = []
    for p in candidates:
        if p.id in existing:
            continue
        # Surface COI signals to the endorser before they answer; if
        # there's a hard conflict (shared family/village) we want them
        # to know up-front. Endorsement still records, but doesn't count.
        signals = Endorsement.compute_coi_signals(partner=p, endorser=endorser)
        # Pull a short summary from the intake form JSON if present.
        summary = ''
        try:
            import json as _json
            form = _json.loads(p.intake_form_json) if p.intake_form_json else {}
            summary = (form.get('description_ar') or form.get('description') or '')[:280]
        except (ValueError, TypeError):
            summary = ''
        pending.append({
            'partner_id': p.id,
            'partner_name': p.name,
            'partner_name_ar': p.name_ar,
            'locality': p.locality,
            'intake_summary_ar': summary,
            'coi_signals': list(signals.keys()),  # empty = clean
        })

    return jsonify({
        'success': True,
        'endorser': {
            'id': endorser.id,
            'reputation_score': endorser.reputation_score,
            'endorsements_count': endorser.endorsements_count,
            'locality': endorser.locality,
        },
        'pending_endorsements': pending,
    })


@proximate_bp.route(
    '/endorser-portal/<token>/partners/<int:partner_id>/endorse',
    methods=['POST'],
)
def api_endorser_portal_submit(token, partner_id):
    """Public submit. Token authenticates the endorser; no login.

    Same business logic as api_submit_endorsement: COI auto-check,
    audit-chain entry, partner-status transition, reputation bump on
    dd_clear. Surfaced via the no-shell /proximate-endorse?t=<token>
    page so partners experience this as a 3-question form, not a
    platform login.
    """
    endorser = Endorser.query.filter_by(public_token=token).first()
    if not endorser:
        return jsonify({'success': False, 'error': 'invalid token'}), 404
    if endorser.status != 'approved':
        return jsonify({
            'success': False, 'error': 'endorser not approved',
        }), 403

    partner = ProximatePartner.query.filter_by(
        id=partner_id, network_id=endorser.network_id,
    ).first()
    if not partner:
        return jsonify({'success': False, 'error': 'partner not found'}), 404

    if Endorsement.query.filter_by(
        partner_id=partner.id, endorser_id=endorser.id,
    ).first():
        return jsonify({
            'success': False,
            'error': 'already endorsed',
        }), 409

    payload = request.get_json(silent=True) or {}
    for q in ('q1_real', 'q2_trust', 'q3_accept_aid'):
        if q not in payload:
            return jsonify({
                'success': False, 'error': f'missing answer: {q}',
            }), 400
        if not isinstance(payload[q], bool):
            return jsonify({
                'success': False, 'error': f'{q} must be boolean',
            }), 400

    signals = Endorsement.compute_coi_signals(partner=partner, endorser=endorser)
    endorsement = Endorsement(
        partner_id=partner.id,
        endorser_id=endorser.id,
        q1_real=payload['q1_real'],
        q2_trust=payload['q2_trust'],
        q3_accept_aid=payload['q3_accept_aid'],
        q1_transcript=(payload.get('q1_transcript') or '').strip()[:5000] or None,
        q2_transcript=(payload.get('q2_transcript') or '').strip()[:5000] or None,
        q3_transcript=(payload.get('q3_transcript') or '').strip()[:5000] or None,
        coi_check_passed=(not signals),
        location_lat=payload.get('location_lat'),
        location_lng=payload.get('location_lng'),
    )
    endorsement.set_coi_signals(signals)
    db.session.add(endorsement)
    endorser.endorsements_count = (endorser.endorsements_count or 0) + 1
    db.session.flush()

    floor = partner.trust_floor_signals()
    state_change = None
    if floor['ready_for_dd_clear']:
        partner.status = 'dd_clear'
        partner.trust_tier = 'tier_1_relational'
        partner.dd_cleared_at = datetime.now(timezone.utc)
        state_change = 'dd_clear'
    elif floor['endorsements_ok'] and not floor['bank_verified']:
        if partner.status in ('nominated', 'endorsements_open'):
            partner.status = 'dd_pending'
            state_change = 'dd_pending'

    db.session.commit()

    # Audit-chain — token-portal endorsement is flagged with
    # submitted_via=token_url so auditors can distinguish from the
    # logged-in path.
    AuditChainEntry.append(
        action='proximate.endorsement.submitted',
        actor_email=None,  # no user session — anonymous token holder
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
            'submitted_via': 'token_url',
        },
    )
    if state_change:
        AuditChainEntry.append(
            action=f'proximate.partner.status_changed.{state_change}',
            actor_email=None,
            subject_kind='proximate_partner',
            subject_id=partner.id,
            details={
                'new_status': partner.status,
                'trust_tier': partner.trust_tier,
                'submitted_via': 'token_url',
            },
        )

    return jsonify({
        'success': True,
        'endorsement_id': endorsement.id,
        'coi_check_passed': endorsement.coi_check_passed,
        'partner_status': partner.status,
        'state_change': state_change,
    })


@proximate_bp.route(
    '/admin/endorsers/<int:endorser_id>/portal-link', methods=['POST'],
)
@ob_required
def api_issue_endorser_portal_link(endorser_id):
    """OB endpoint — mint or fetch the endorser's no-login portal token
    and the shareable URL. Idempotent. Used by the Share Hub UI; the
    OB then pastes this into WhatsApp.
    """
    net, err = _require_proximate_tenant()
    if err:
        return err
    endorser = Endorser.query.filter_by(
        id=endorser_id, network_id=net.id,
    ).first()
    if not endorser:
        return jsonify({'success': False, 'error': 'not found'}), 404
    if endorser.status != 'approved':
        return jsonify({
            'success': False,
            'error': f'endorser status is {endorser.status!r}',
        }), 400
    token = _ensure_endorser_public_token(endorser)
    base = request.host_url.rstrip('/')
    return jsonify({
        'success': True,
        'token': token,
        'url': f'{base}/proximate-endorse?t={token}',
    })


# =====================================================================
# Phase 700 — Audit chain read endpoint (resolves reviewer mismatch)
# =====================================================================
# The design doc v3 §11 advertises GET /api/proximate/audit-chain;
# this implements it. Tenant-scoped (per Phase 672) so an external
# Proximate auditor walks only Proximate's rows. Read-only.


@proximate_bp.route('/audit-chain', methods=['GET'])
@login_required
def api_proximate_audit_chain():
    """Return the most recent audit-chain rows scoped to this tenant.

    OB-only. RBAC hardening (2026-07-09): switched from the ambient
    @ob_required decorator to the network-explicit inline gate below.
    @ob_required resolves the OB seat in the host-resolved network, which
    on the shared prod host is the default Kuja tenant when a caller omits
    the Proximate host/override header — that wrongly 403'd the real OB
    (who holds the seat in Proximate, not Kuja). _proximate_ob_or_403
    resolves the seat in the slug-resolved Proximate net the endpoint
    actually serves.

    Donors/endorsers do not need raw chain access — the round-report PDF
    carries a donor-safe audit anchor for portfolio transparency. If a
    donor-safe audit view becomes a real ask, add a separate /donor-audit
    endpoint that filters actor_email and intervention-related actions.

    Tenant scope: rows with network_id=current tenant OR rows where
    subject_kind starts with 'proximate' (covers legacy rows written
    before Phase 672 backfilled network_id).
    """
    net, err = _require_proximate_tenant()
    if err:
        return err
    gate = _proximate_ob_or_403(net)
    if gate:
        return gate

    limit = max(1, min(int(request.args.get('limit', 100) or 100), 500))
    offset = max(0, int(request.args.get('offset', 0) or 0))

    q = AuditChainEntry.query.filter(
        db.or_(
            AuditChainEntry.network_id == net.id,
            AuditChainEntry.subject_kind.like('proximate_%'),
            AuditChainEntry.action.like('proximate.%'),
        )
    ).order_by(AuditChainEntry.seq.desc())

    total = q.count()
    rows = q.limit(limit).offset(offset).all()

    # Phase 704 — JSONL export for the closing-pack audit bundle.
    # ?format=jsonl returns one JSON object per line, with a download
    # filename. Same tenant-scoped query as JSON; the OB downloads
    # this from the closing-pack panel on round detail.
    if request.args.get('format') == 'jsonl':
        from flask import Response
        import json as _json
        # Materialize rows BEFORE building the response — the streaming
        # generator runs after the request context teardown otherwise,
        # and the SQLAlchemy session is gone.
        #
        # QA 2026-07-14: the export used to inherit the JSON view's
        # limit default (100), so a 204-entry chain silently produced a
        # 100-line file — an audit evidence file must be complete. The
        # full tenant-scoped chain is exported unless the caller passes
        # an explicit ?limit=.
        export_q = q.order_by(AuditChainEntry.seq.asc())
        if request.args.get('limit'):
            export_q = export_q.limit(limit).offset(offset)
        export_rows = export_q.all()
        body = '\n'.join(
            _json.dumps({
                'seq': r.seq,
                'prev_hash': r.prev_hash,
                'payload_hash': r.payload_hash,
                'action': r.action,
                'actor_email': r.actor_email,
                'subject_kind': r.subject_kind,
                'subject_id': r.subject_id,
                'created_at': r.created_at.isoformat() if r.created_at else None,
                'network_id': r.network_id,
            })
            for r in export_rows
        ) + ('\n' if export_rows else '')
        return Response(
            body, mimetype='application/x-ndjson',
            headers={
                'Content-Disposition':
                    f'attachment; filename="proximate-audit-chain-network{net.id}.jsonl"',
            },
        )

    return jsonify({
        'success': True,
        'total': total,
        'limit': limit,
        'offset': offset,
        'entries': [
            {
                'seq': r.seq,
                'prev_hash': r.prev_hash,
                'payload_hash': r.payload_hash,
                'action': r.action,
                'actor_email': r.actor_email,
                'subject_kind': r.subject_kind,
                'subject_id': r.subject_id,
                'created_at': r.created_at.isoformat() if r.created_at else None,
                'network_id': r.network_id,
            }
            for r in rows
        ],
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


def _donor_visible_round_ids(donor) -> set:
    """The rounds this donor is allowed to see: rounds they fund
    (`round.donor_id`), rounds where they hold a co-funding share
    (`donor_shares_json`), and rounds they explicitly follow
    (`subscribed_round_ids`). No fallback — a donor with no linked
    rounds sees nothing. (Retired 2026-07-16: the v0 "no subscription
    → list every round in the tenant" behavior, which exposed one
    funder's round data to every other registered donor.)"""
    ids = set(donor.subscribed_round_ids())
    rows = ProximateRound.query.filter_by(network_id=donor.network_id).all()
    for r in rows:
        if r.donor_id == donor.id:
            ids.add(r.id)
            continue
        try:
            if any(
                int(s.get('donor_id') or 0) == donor.id
                for s in r._donor_shares()
            ):
                ids.add(r.id)
        except (TypeError, ValueError):
            pass
    return ids


def _donor_round_scope_403(net, round_id):
    """Round-scope guard for donor-persona callers on shared read
    endpoints (round report bundle + PDF). OB members and platform
    admins pass through; a caller with a donor row is limited to
    their visible rounds; other personas keep their existing gates."""
    from app.models import ProximateDonor
    from app.utils.network import is_oversight_body_member
    if getattr(current_user, 'role', '') == 'admin':
        return None
    if is_oversight_body_member(current_user):
        return None
    donor = ProximateDonor.query.filter_by(
        network_id=net.id, primary_user_id=current_user.id,
    ).first()
    if donor and round_id not in _donor_visible_round_ids(donor):
        return jsonify({'success': False, 'error': 'not in your scope'}), 403
    return None


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


@proximate_bp.route('/persona/me', methods=['GET'])
@login_required
def api_my_persona():
    """Phase 696 — resolve the current user's Proximate persona.

    Donor and OB users are seeded with User.role='ngo' for platform
    compatibility, which means the frontend's role-driven nav chrome
    leaks NGO surfaces onto donor/OB pages. This endpoint returns
    {persona: 'donor' | 'ob' | 'admin' | 'none', display_name,
    network_id} so the shell can swap to Proximate-specific nav +
    role label.

    Returns 'none' (not 404) when the user has no Proximate role
    so the frontend can cache the answer instead of erroring.
    """
    from app.models import ProximateDonor
    from app.utils.network import is_oversight_body_member

    net, err = _require_proximate_tenant()
    if err:
        return err

    # Platform admin first — they get OB-level access too
    if getattr(current_user, 'role', '') == 'admin':
        return jsonify({
            'success': True,
            'persona': 'admin',
            'display_name': current_user.name or current_user.email,
            'network_id': net.id,
            'network_slug': 'proximate',
        })

    if is_oversight_body_member(current_user):
        return jsonify({
            'success': True,
            'persona': 'ob',
            'display_name': current_user.name or current_user.email,
            'network_id': net.id,
            'network_slug': 'proximate',
        })

    donor = ProximateDonor.query.filter_by(
        network_id=net.id, primary_user_id=current_user.id,
    ).first()
    if donor:
        return jsonify({
            'success': True,
            'persona': 'donor',
            'display_name': donor.display_name or current_user.name,
            'network_id': net.id,
            'network_slug': 'proximate',
        })

    return jsonify({
        'success': True,
        'persona': 'none',
        'display_name': current_user.name,
        'network_id': net.id,
        'network_slug': 'proximate',
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

    Honest scope: this is grounded ONLY in the donor's linked rounds
    (funded, co-funded, or followed). It will not answer questions
    about partners outside that scope; the prompt says so.
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

    visible = _donor_visible_round_ids(donor)
    rounds = ProximateRound.query.filter_by(
        network_id=donor.network_id,
    ).filter(ProximateRound.id.in_(visible)).order_by(
        ProximateRound.created_at.desc()
    ).limit(8).all() if visible else []

    if not rounds:
        return jsonify({
            'success': True,
            'answer': (
                "No rounds are linked to your donor account yet. Once "
                "the Oversight Body links your funding round (or you "
                "follow one), I can answer questions about it."
            ),
            'meta': {'grounded': False},
        })

    # Compact context bundle. Keep small so we stay within prompt cache.
    # Phase 694: also include the *computed* rollup metrics the donor
    # dashboard surfaces — attestation_rate, verification_rate,
    # sustained_impact_avg_pct — so the AI can answer questions about
    # them with numbers instead of "I don't know." Reuses the same
    # _outcome_rollup_stats helper the dashboard uses, so the AI's
    # answer and the UI tile are always in lock-step.
    ctx_rounds = []
    portfolio_outcomes = []
    for r in rounds:
        dis = ProximateDisbursement.query.filter_by(
            network_id=donor.network_id, round_id=r.id,
        ).all()
        outcomes = ProximateOutcomeAttestation.query.filter_by(
            network_id=donor.network_id, round_id=r.id,
        ).all()
        portfolio_outcomes.extend(outcomes)
        status_counts = {}
        partners = set()
        disbursed = 0.0
        for d in dis:
            status_counts[d.status] = status_counts.get(d.status, 0) + 1
            partners.add(d.partner_id)
            if d.status in ('pending_report', 'reported', 'verified', 'flagged'):
                disbursed += float(d.amount_usd or 0)
        round_outcome_stats = _outcome_rollup_stats(outcomes)
        ctx_rounds.append({
            'id': r.id,
            'title': r.title,
            'status': r.status,
            'trigger': r.trigger_type,
            'envelope_usd': float(r.envelope_usd) if r.envelope_usd else 0,
            'disbursed_usd': disbursed,
            'partners_served': len(partners),
            'status_counts': status_counts,
            'outcome_total': round_outcome_stats['total'],
            'outcome_attested': round_outcome_stats['submitted'],
            'outcome_verified': round_outcome_stats['verified'],
            'outcome_disputed': round_outcome_stats['disputed'],
            'attestation_rate_pct': round_outcome_stats['attestation_rate'],
            'verification_rate_pct': round_outcome_stats['verification_rate'],
            'sustained_impact_avg_pct': round_outcome_stats[
                'sustained_impact_avg_pct'
            ],
            'flagged_count': status_counts.get('flagged', 0),
        })
    portfolio_stats = _outcome_rollup_stats(portfolio_outcomes)

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
        "outside this donor's scope, redirect them to ask Adeso directly.\n"
        # Phase 698 — Sudanese-dialect cheap win. If the donor asks in
        # Arabic (dialect or MSA), reply in conversational Sudanese
        # Arabic, not MSA — the Fund operates in Sudan and the dialect
        # feels native to the audience. If they ask in MSA explicitly
        # or in English, stay in their register.
        "6. Language match: if the donor writes in Arabic, reply in "
        "conversational Sudanese Arabic (colloquial), not formal MSA. "
        "If they write in English (or any other language), stay in "
        "that language. Match the donor's register, not the default."
    )
    user_msg = (
        f"Donor: {donor.display_name}\n\n"
        f"Portfolio-wide outcome rollup (across all subscribed rounds):\n"
        f"{_json.dumps(portfolio_stats, indent=2)}\n\n"
        f"Per-round detail:\n{_json.dumps(ctx_rounds, indent=2)}\n\n"
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
    from app.utils.network import is_oversight_body_member
    is_ob = is_oversight_body_member(current_user)
    donor = ProximateDonor.query.filter_by(
        network_id=net.id, primary_user_id=current_user.id,
    ).first()
    if not is_ob and not donor:
        return jsonify({
            'success': False, 'error': 'access denied',
        }), 403

    round_id_arg = request.args.get('round_id', type=int)
    allowed_round_ids = None  # None = unrestricted (OB only)
    if donor and not is_ob:
        allowed_round_ids = _donor_visible_round_ids(donor)

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

    Scope (v1, 2026-07-16): the donor sees ONLY rounds linked to them
    — funded (round.donor_id), co-funded (donor_shares), or followed
    (subscribed_round_ids). A donor with no linked rounds gets an
    empty list, never the whole tenant.
    """
    from app.models import (
        ProximateOutcomeAttestation, ProximatePartner,
    )
    donor, err = _require_donor()
    if err:
        return err

    visible = _donor_visible_round_ids(donor)
    if visible:
        rounds = ProximateRound.query.filter_by(
            network_id=donor.network_id,
        ).filter(ProximateRound.id.in_(visible)).order_by(
            ProximateRound.created_at.desc()
        ).all()
    else:
        rounds = []

    out_rounds = []
    portfolio = {
        'envelope_usd': 0.0,
        'disbursed_usd': 0.0,
        'partners_served': set(),
        'disbursement_count': 0,
        'outcome_attested': 0,
        'outcome_verified': 0,
        'outcome_pending': 0,
        # Phase 697 — explicit denominator for the attestation_rate
        # tile. Previously the frontend divided outcome_attested by
        # disbursement_count, which is wrong: an obligation row
        # spawns only at "verify" (Phase 678), so older disbursements
        # never had one. The reviewer saw 3/9 = 33% on the top card
        # while round cards showed 3/4 = 75% — same denominator
        # mismatch. outcome_total is the correct denominator.
        'outcome_total': 0,
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
        portfolio['outcome_total'] += len(outcomes)
        portfolio['flagged_count'] += status_counts.get('flagged', 0)

    portfolio['partners_served'] = len(portfolio['partners_served'])
    return jsonify({
        'success': True,
        'donor': donor.to_dict(),
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


@proximate_bp.route('/rounds/<int:round_id>/retrospective.pdf', methods=['GET'])
@login_required
def api_round_retrospective_pdf(round_id):
    """Phase 687 — 6-month donor impact retrospective PDF.

    Only available for rounds that have been closed >= 180 days. Returns
    503 if reportlab isn't installed. Surfaces envelope used vs remaining,
    partners served, outcome attestation stats, common themes.

    Auth: OB sees all. Donor sees only if they subscribed to this round.
    Anyone else gets 403.
    """
    from app.models import (
        ProximateOutcomeAttestation, ProximatePartner, ProximateDonor,
    )

    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
        from reportlab.lib.units import cm
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
        return jsonify({'success': False, 'error': 'not found'}), 404
    if not r.closed_at:
        return jsonify({
            'success': False, 'error': 'round not closed yet',
        }), 422
    closed = (
        r.closed_at.replace(tzinfo=timezone.utc)
        if r.closed_at.tzinfo is None else r.closed_at
    )
    age_days = (datetime.now(timezone.utc) - closed).days
    if age_days < 180:
        return jsonify({
            'success': False,
            'error': f'retrospective available 180 days after closure (currently {age_days})',
        }), 422

    # Scope guard for donors
    if not (getattr(current_user, 'role', '') == 'admin'):
        donor = ProximateDonor.query.filter_by(
            network_id=net.id, primary_user_id=current_user.id,
        ).first()
        if donor:
            if round_id not in _donor_visible_round_ids(donor):
                return jsonify({
                    'success': False, 'error': 'not in your scope',
                }), 403
        else:
            return jsonify({'success': False, 'error': 'access denied'}), 403

    # Compute the data
    disbursements = ProximateDisbursement.query.filter_by(
        network_id=net.id, round_id=r.id,
    ).all()
    spendable = [
        d for d in disbursements
        if d.status in ('pending_report', 'reported', 'verified', 'flagged')
    ]
    disbursed = sum(float(d.amount_usd or 0) for d in spendable)
    partner_ids = {d.partner_id for d in spendable}
    partners = ProximatePartner.query.filter(
        ProximatePartner.id.in_(partner_ids)
    ).all() if partner_ids else []
    outcomes = ProximateOutcomeAttestation.query.filter_by(
        network_id=net.id, round_id=r.id,
    ).all()
    submitted_outcomes = [o for o in outcomes if o.submitted_at]
    verified_outcomes = [o for o in outcomes if o.status == 'verified']
    sustained_pcts = []
    for o in submitted_outcomes:
        ans = o.get_answers()
        s = ans.get('still_in_state_n'); t = ans.get('total_intended_n')
        if isinstance(s, (int, float)) and isinstance(t, (int, float)) and t > 0:
            sustained_pcts.append(min(100, max(0, (s / t) * 100)))
    sustained_avg = (
        sum(sustained_pcts) / len(sustained_pcts) if sustained_pcts else None
    )

    # Render PDF
    import io
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    y = height - 2 * cm
    c.setFont('Helvetica-Bold', 16)
    c.drawString(2 * cm, y, f'Proximate Round Retrospective')
    y -= 0.7 * cm
    c.setFont('Helvetica', 11)
    c.drawString(2 * cm, y, f'{r.title}')
    y -= 0.6 * cm
    c.setFont('Helvetica', 9)
    c.drawString(
        2 * cm, y,
        f'Closed {closed.strftime("%Y-%m-%d")} · '
        f'{age_days} days ago · Generated '
        f'{datetime.now(timezone.utc).strftime("%Y-%m-%d")}'
    )
    y -= 1 * cm

    def line(label, value):
        nonlocal y
        c.setFont('Helvetica-Bold', 10); c.drawString(2 * cm, y, label)
        c.setFont('Helvetica', 10); c.drawString(8 * cm, y, str(value))
        y -= 0.5 * cm

    c.setFont('Helvetica-Bold', 12)
    c.drawString(2 * cm, y, '1. Envelope use'); y -= 0.6 * cm
    line('Committed envelope', f'${float(r.envelope_usd or 0):,.0f}')
    line('Disbursed', f'${disbursed:,.0f}')
    line('Disbursement count', f'{len(spendable)}')
    line('Partners served', f'{len(partner_ids)}')
    y -= 0.4 * cm

    c.setFont('Helvetica-Bold', 12)
    c.drawString(2 * cm, y, '2. 90-day outcome attestation'); y -= 0.6 * cm
    line('Total obligations', f'{len(outcomes)}')
    line('Attested by partner', f'{len(submitted_outcomes)}')
    line('OB-verified', f'{len(verified_outcomes)}')
    line(
        'Sustained-impact average',
        f'{sustained_avg:.1f}% (n={len(sustained_pcts)})'
        if sustained_avg is not None else 'no data yet'
    )
    y -= 0.4 * cm

    c.setFont('Helvetica-Bold', 12)
    c.drawString(2 * cm, y, '3. Honest scope'); y -= 0.6 * cm
    c.setFont('Helvetica', 9)
    for fragment in (
        'This retrospective summarises platform-recorded data only.',
        'Counterfactual reflection themes from partners are surfaced',
        'on /proximate/admin → outcomes rollup, not in this PDF.',
        'Email delivery to donors requires SMTP — currently disabled.',
    ):
        c.drawString(2 * cm, y, fragment); y -= 0.4 * cm

    c.save()
    pdf_bytes = buf.getvalue()
    AuditChainEntry.append(
        action='proximate.retrospective.downloaded',
        actor_email=current_user.email,
        subject_kind='proximate_round',
        subject_id=r.id,
        details={'pdf_bytes': len(pdf_bytes), 'closed_days_ago': age_days},
    )
    from flask import Response
    return Response(
        pdf_bytes,
        mimetype='application/pdf',
        headers={
            'Content-Disposition': (
                f'inline; filename="round-{r.id}-retrospective.pdf"'
            ),
        },
    )


@proximate_bp.route('/monitoring/donor-retrospective', methods=['POST'])
def api_cron_donor_retrospective():
    """Phase 687 — finds closed rounds aged >= 180 days that don't yet
    have a 'proximate.retrospective.ready' audit row per subscribed
    donor, and emits one. The audit row is the durable signal the OB
    uses to email each donor (manually today; auto-send when SMTP
    lands). Honest: this cron does not send email itself.
    """
    from app.models import ProximateDonor
    from flask import current_app as cap
    secret = cap.config.get('CRON_SECRET') or os.getenv('CRON_SECRET')
    auth = request.headers.get('Authorization', '')
    if not secret or auth != f'Bearer {secret}':
        return jsonify({'success': False, 'error': 'forbidden'}), 403

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=180)
    closed_rounds = ProximateRound.query.filter(
        ProximateRound.status == 'closed',
        ProximateRound.closed_at.isnot(None),
        ProximateRound.closed_at < cutoff,
    ).all()
    emitted = 0
    for r in closed_rounds:
        donors = ProximateDonor.query.filter_by(network_id=r.network_id).all()
        for d in donors:
            if r.id not in _donor_visible_round_ids(d):
                continue
            existing = AuditChainEntry.query.filter_by(
                subject_kind='proximate_round',
                subject_id=r.id,
                action='proximate.retrospective.ready',
            ).first()
            details_blob = existing.details_json if existing else ''
            if existing and f'"donor_id": {d.id}' in (details_blob or ''):
                continue
            AuditChainEntry.append(
                action='proximate.retrospective.ready',
                actor_email='cron-monitoring',
                subject_kind='proximate_round',
                subject_id=r.id,
                details={
                    'donor_id': d.id,
                    'donor_display_name': d.display_name,
                    'closed_days_ago': (now - r.closed_at.replace(
                        tzinfo=timezone.utc
                    ) if r.closed_at.tzinfo is None else now - r.closed_at).days,
                    'smtp_blocked': not bool(
                        cap.config.get('SENDGRID_API_KEY') or
                        os.getenv('SENDGRID_API_KEY')
                    ),
                },
            )
            emitted += 1
    logger.info(
        f'Proximate cron: donor-retrospective emitted {emitted} '
        f'ready rows across {len(closed_rounds)} closed rounds'
    )
    return jsonify({
        'success': True,
        'emitted': emitted,
        'closed_rounds': len(closed_rounds),
    })


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


@proximate_bp.route('/monitoring/sanctions-rescreen', methods=['POST'])
def api_cron_sanctions_rescreen():
    """Phase 690 — weekly re-screen of every dd_clear partner against
    sanctions lists. Sudan sanctions landscape shifts; a partner cleared
    six weeks ago can show up on a new list today.

    Rate-limited per partner via sanctions_checked_at: skips anyone
    screened in the last 6 days. Emits 'proximate.partner.sanctions_
    rescreen_flagged' whenever a previously-clean partner flips to
    flagged so the OB has a single audit signal to react to.
    """
    from flask import current_app as cap
    secret = cap.config.get('CRON_SECRET') or os.getenv('CRON_SECRET')
    auth = request.headers.get('Authorization', '')
    if not secret or auth != f'Bearer {secret}':
        return jsonify({'success': False, 'error': 'forbidden'}), 403

    now = datetime.now(timezone.utc)
    stale_threshold = now - timedelta(days=6)
    candidates = ProximatePartner.query.filter(
        ProximatePartner.status == 'dd_clear',
    ).all()
    rescreened = 0
    newly_flagged = 0
    skipped_recent = 0
    for p in candidates:
        if p.sanctions_checked_at and p.sanctions_checked_at >= stale_threshold:
            skipped_recent += 1
            continue
        prev_flag = bool(p.sanctions_flag)
        _run_partner_sanctions_screen(p)
        rescreened += 1
        if p.sanctions_flag and not prev_flag:
            newly_flagged += 1
            AuditChainEntry.append(
                action='proximate.partner.sanctions_rescreen_flagged',
                actor_email='cron-monitoring',
                subject_kind='proximate_partner',
                subject_id=p.id,
                details={
                    'partner_name': p.name,
                    'rescreen_day': now.strftime('%Y-%m-%d'),
                },
            )
    logger.info(
        f'Proximate cron: sanctions rescreened {rescreened} partners, '
        f'newly flagged {newly_flagged}, skipped recent {skipped_recent}'
    )
    return jsonify({
        'success': True,
        'rescreened': rescreened,
        'newly_flagged': newly_flagged,
        'skipped_recent': skipped_recent,
        'day': now.strftime('%Y-%m-%d'),
    })


@proximate_bp.route('/monitoring/grant-reporting', methods=['POST'])
def api_cron_grant_reporting():
    """Phase 721e — daily grant-reporting cron (bearer CRON_SECRET).

    Two jobs per active grant with a recurring cadence:
      1. Ensure the NEXT report row exists — computed from the latest
         period_end (or the grant start date), one period ahead, with
         due_date = period_end + the donor's due-days (from extracted
         reporting_requirements, default 45). Idempotent by
         (grant, type, period_start), same key the seeder uses.
      2. Reminders — pending/drafting reports due within 30/14/3 days
         get one audit row per band (deduped by checking for an
         existing row is skipped for v0 simplicity; the cron runs daily
         so each band fires on consecutive days within its window —
         acceptable noise until WhatsApp auto-sends land in 717-b).
    Also refreshes grant.reporting_next_due_at for the list surfaces.
    """
    from flask import current_app as cap
    from datetime import date
    from dateutil.relativedelta import relativedelta
    from app.models import ProximateGrant, ProximateGrantReport
    secret = cap.config.get('CRON_SECRET') or os.getenv('CRON_SECRET')
    auth = request.headers.get('Authorization', '')
    if not secret or auth != f'Bearer {secret}':
        return jsonify({'success': False, 'error': 'forbidden'}), 403

    CADENCE_MONTHS = {
        'monthly': 1, 'quarterly': 3, 'semi_annual': 6, 'annual': 12,
    }
    today = date.today()
    created = 0
    reminders = 0
    grants = ProximateGrant.query.filter_by(status='active').all()
    for g in grants:
        months = CADENCE_MONTHS.get(g.reporting_cadence)
        if months:
            last = (
                ProximateGrantReport.query
                .filter_by(grant_id=g.id)
                .order_by(ProximateGrantReport.period_end.desc())
                .first()
            )
            period_start = (
                (last.period_end + timedelta(days=1))
                if last and last.period_end else (g.start_date or today)
            )
            period_end = period_start + relativedelta(months=months) - timedelta(days=1)
            # Only pre-create once the period has started (no far-future
            # rows) and stop at the grant end date.
            if (
                period_start <= today
                and (not g.end_date or period_start <= g.end_date)
            ):
                exists = ProximateGrantReport.query.filter_by(
                    grant_id=g.id,
                    report_type=g.reporting_cadence,
                    period_start=period_start,
                ).first()
                if not exists:
                    due_days = 45
                    reqs = (g._extracted() or {}).get('reporting_requirements') or []
                    matching = [
                        r.get('due_days_after_period') for r in reqs
                        if r.get('cadence') == g.reporting_cadence
                        and r.get('due_days_after_period')
                    ]
                    if matching:
                        due_days = min(matching)
                    db.session.add(ProximateGrantReport(
                        grant_id=g.id,
                        report_type=g.reporting_cadence,
                        period_start=period_start,
                        period_end=period_end,
                        due_date=period_end + timedelta(days=due_days),
                        status='pending',
                    ))
                    created += 1

        # Reminders + next-due refresh
        open_reports = ProximateGrantReport.query.filter(
            ProximateGrantReport.grant_id == g.id,
            ProximateGrantReport.status.in_(('pending', 'drafting')),
            ProximateGrantReport.due_date.isnot(None),
        ).all()
        next_due = None
        for r in open_reports:
            days_left = (r.due_date - today).days
            if days_left in (30, 14, 3, 0):
                reminders += 1
                AuditChainEntry.append(
                    action='proximate.grant_report.due_reminder',
                    actor_email='cron-monitoring',
                    subject_kind='proximate_grant_report',
                    subject_id=r.id,
                    details={
                        'grant_id': g.id,
                        'grant_title': g.title,
                        'report_type': r.report_type,
                        'due_date': r.due_date.isoformat(),
                        'days_left': days_left,
                    },
                )
            if next_due is None or r.due_date < next_due:
                next_due = r.due_date
        g.reporting_next_due_at = (
            datetime.combine(next_due, datetime.min.time())
            if next_due else None
        )
    db.session.commit()
    logger.info(
        f'Proximate cron: grant reporting — {created} report row(s) '
        f'created, {reminders} reminder(s) emitted across {len(grants)} '
        f'active grants'
    )
    return jsonify({
        'success': True,
        'grants_walked': len(grants),
        'reports_created': created,
        'reminders': reminders,
    })


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


# =========================================================================
# Phase 716c — Whistleblower / community grievance channel (SoP §14)
# =========================================================================

@proximate_bp.route('/public/grievances', methods=['POST'])
def api_submit_grievance():
    """Public endpoint — no auth, no token. A community member reports
    a concern about a partner (or the fund as a whole). Anonymity is a
    first-class option: is_anonymous=true clears identity fields
    server-side regardless of what the form sent.

    fraud/safety grievances that name a partner auto-open a Phase 635
    freeze intervention (72h clock) so the OB reacts on the SoP §4
    track, not just the triage queue. Every submission audit-chains.

    Spam guards mirror self-nominate: honeypot field + a 1-hour window
    that rejects an identical (partner_id, description) resubmission.
    """
    from app.models import (
        ProximateGrievance, GRIEVANCE_CATEGORIES, InterventionMeasure,
    )
    net, err = _require_proximate_tenant()
    if err:
        return err
    payload = request.get_json(silent=True) or {}

    description = (payload.get('description') or '').strip()
    if not description or len(description) < 10:
        return jsonify({
            'success': False,
            'error': 'description is required (at least 10 characters)',
        }), 400

    # Honeypot — bots fill every input; humans never see this one
    if (payload.get('website') or '').strip():
        return jsonify({'success': False, 'error': 'spam detected'}), 400

    category = (payload.get('category') or 'other').strip().lower()
    if category not in GRIEVANCE_CATEGORIES:
        category = 'other'

    partner_id = payload.get('partner_id')
    partner = None
    if partner_id:
        partner = ProximatePartner.query.filter_by(
            id=partner_id, network_id=net.id,
        ).first()
        if not partner:
            partner_id = None  # about-the-fund fallback, never 404 a reporter

    is_anonymous = bool(payload.get('is_anonymous'))

    # Dedup window — double-taps and copy-paste spam
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
    dup = ProximateGrievance.query.filter(
        ProximateGrievance.network_id == net.id,
        ProximateGrievance.description == description[:5000],
        ProximateGrievance.submitted_at >= cutoff,
    ).first()
    if dup:
        return jsonify({'success': True, 'grievance_id': dup.id,
                        'already_submitted': True})

    g = ProximateGrievance(
        network_id=net.id,
        partner_id=partner.id if partner else None,
        reporter_name=None if is_anonymous else (
            (payload.get('reporter_name') or '').strip()[:160] or None),
        reporter_phone=None if is_anonymous else (
            (payload.get('reporter_phone') or '').strip()[:60] or None),
        is_anonymous=is_anonymous,
        category=category,
        description=description[:5000],
    )
    db.session.add(g)
    db.session.commit()

    # SoP §4 — fraud/safety naming a partner opens a freeze unless one
    # is already running. Reporter identity never enters the
    # intervention record.
    if category in ('fraud', 'safety') and partner:
        # Best-effort: the reporter's grievance is already committed above,
        # so a failure here must never surface as a 500 to a public form.
        try:
            existing = InterventionMeasure.query.filter(
                InterventionMeasure.partner_id == partner.id,
                InterventionMeasure.status.in_(['open', 'escalated']),
            ).first()
            if not existing:
                actor_id = _system_actor_user_id(net)
                measure = InterventionMeasure.open_new(
                    network_id=net.id, partner_id=partner.id, kind='freeze',
                    reason=(
                        f'Auto-opened from community grievance #{g.id} '
                        f'(category: {category}). OB review required within '
                        f'72h per SoP 14.'
                    ),
                    opened_by_user_id=actor_id,
                )
                measure.sop_clause = 'SOP-14-grievance-auto'
                db.session.commit()
                g.intervention_id = measure.id
                db.session.commit()
        except Exception:
            db.session.rollback()
            logger.exception(
                f"Proximate: grievance #{g.id} auto-freeze failed "
                f"(partner {partner.id}); grievance itself is recorded"
            )

    AuditChainEntry.append(
        action='proximate.grievance.submitted',
        actor_email='public-form',
        subject_kind='proximate_grievance',
        subject_id=g.id,
        details={
            'category': category,
            'partner_id': g.partner_id,
            'is_anonymous': is_anonymous,
            'auto_intervention_id': g.intervention_id,
        },
    )
    logger.info(
        f"Proximate: grievance submitted id={g.id} category={category} "
        f"partner_id={g.partner_id} anonymous={is_anonymous} "
        f"auto_intervention={g.intervention_id}"
    )
    return jsonify({'success': True, 'grievance_id': g.id})


@proximate_bp.route('/grievances', methods=['GET'])
@ob_required
def api_list_grievances():
    """OB triage queue. Default: new + triaged (working set), newest
    first, SLA clock fields on every row. ?status= filters explicitly.
    Reporter identity is included here — this is the one OB-only
    surface allowed to see it."""
    from app.models import ProximateGrievance
    net, err = _require_proximate_tenant()
    if err:
        return err
    q = ProximateGrievance.query.filter_by(network_id=net.id)
    status = request.args.get('status')
    if status:
        q = q.filter_by(status=status)
    else:
        q = q.filter(ProximateGrievance.status.in_(['new', 'triaged']))
    rows = q.order_by(ProximateGrievance.submitted_at.desc()).limit(200).all()

    partner_ids = {r.partner_id for r in rows if r.partner_id}
    partners = {}
    if partner_ids:
        for p in ProximatePartner.query.filter(
            ProximatePartner.id.in_(partner_ids),
        ).all():
            partners[p.id] = p.name

    out = []
    for r in rows:
        d = r.to_dict(include_reporter=True)
        d['partner_name'] = partners.get(r.partner_id)
        out.append(d)
    new_count = sum(1 for r in rows if r.status == 'new')
    breached = sum(1 for r in rows if r.is_sla_breached)
    return jsonify({
        'success': True,
        'grievances': out,
        'new_count': new_count,
        'sla_breached_count': breached,
    })


@proximate_bp.route('/grievances/<int:grievance_id>/triage', methods=['POST'])
@ob_required
def api_triage_grievance(grievance_id):
    """Mark a grievance triaged (OB has looked at it — stops the 72h
    clock). Optional notes."""
    from app.models import ProximateGrievance
    net, err = _require_proximate_tenant()
    if err:
        return err
    g = ProximateGrievance.query.filter_by(
        id=grievance_id, network_id=net.id,
    ).first()
    if not g:
        return jsonify({'success': False, 'error': 'Grievance not found'}), 404
    if g.status != 'new':
        return jsonify({'success': False,
                        'error': f'cannot triage from status {g.status}'}), 422
    payload = request.get_json(silent=True) or {}
    was_breached = g.is_sla_breached
    g.triage(user_id=current_user.id, notes=payload.get('notes'))
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.grievance.triaged',
        actor_email=current_user.email,
        subject_kind='proximate_grievance',
        subject_id=g.id,
        details={'sla_breached_at_triage': was_breached},
    )
    return jsonify({'success': True, 'grievance': g.to_dict(include_reporter=True)})


@proximate_bp.route('/grievances/<int:grievance_id>/resolve', methods=['POST'])
@ob_required
def api_resolve_grievance(grievance_id):
    """Close out a grievance with resolution notes. dismissed=true for
    unfounded reports (kept, never deleted — the register is part of
    the audit posture)."""
    from app.models import ProximateGrievance
    net, err = _require_proximate_tenant()
    if err:
        return err
    g = ProximateGrievance.query.filter_by(
        id=grievance_id, network_id=net.id,
    ).first()
    if not g:
        return jsonify({'success': False, 'error': 'Grievance not found'}), 404
    if g.status in ('resolved', 'dismissed'):
        return jsonify({'success': False,
                        'error': 'grievance already closed'}), 422
    payload = request.get_json(silent=True) or {}
    notes = (payload.get('notes') or '').strip()
    if not notes:
        return jsonify({'success': False,
                        'error': 'resolution notes are required'}), 400
    dismissed = bool(payload.get('dismissed'))
    g.resolve(user_id=current_user.id, notes=notes, dismissed=dismissed)
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.grievance.dismissed' if dismissed
               else 'proximate.grievance.resolved',
        actor_email=current_user.email,
        subject_kind='proximate_grievance',
        subject_id=g.id,
        details={'dismissed': dismissed},
    )
    return jsonify({'success': True, 'grievance': g.to_dict(include_reporter=True)})


# =========================================================================
# Phase 716e — Public transparency page data (trust-building surface)
# =========================================================================

# Daily in-process cache — the public page must never become a live
# query vector into operational data. {network_id: (computed_at, payload)}
_TRANSPARENCY_CACHE: dict = {}
_TRANSPARENCY_TTL_SECONDS = 24 * 3600


def _build_transparency_payload(net) -> dict:
    """Aggregates only — no PII, no per-disbursement amounts, no
    partner identities beyond counts. Per the 716e spec."""
    from sqlalchemy import func, extract
    from app.models import ProximateOutcomeAttestation

    year = datetime.now(timezone.utc).year
    moved_states = ('pending_report', 'reported', 'verified', 'flagged')

    total_moved = (
        db.session.query(func.coalesce(func.sum(
            ProximateDisbursement.amount_usd), 0))
        .filter(
            ProximateDisbursement.network_id == net.id,
            ProximateDisbursement.status.in_(moved_states),
            extract('year', ProximateDisbursement.sent_at) == year,
        )
        .scalar()
    ) or 0

    disbursement_count = (
        db.session.query(func.count(ProximateDisbursement.id))
        .filter(
            ProximateDisbursement.network_id == net.id,
            ProximateDisbursement.status.in_(moved_states),
            extract('year', ProximateDisbursement.sent_at) == year,
        )
        .scalar()
    ) or 0

    # Partner counts by locality — active pipeline only, no names
    partners_by_locality: dict[str, int] = {}
    active = ProximatePartner.query.filter(
        ProximatePartner.network_id == net.id,
        ProximatePartner.status.in_(
            ['endorsements_open', 'dd_pending', 'dd_clear'],
        ),
    ).all()
    for p in active:
        key = (p.locality or 'Other').strip() or 'Other'
        partners_by_locality[key] = partners_by_locality.get(key, 0) + 1

    # Sustained-outcome rate — OB-verified attestations over all
    # attested (submitted / verified / disputed). Aggregate only.
    attested = ProximateOutcomeAttestation.query.join(
        ProximatePartner,
        ProximateOutcomeAttestation.partner_id == ProximatePartner.id,
    ).filter(
        ProximatePartner.network_id == net.id,
        ProximateOutcomeAttestation.status.in_(
            ['submitted', 'verified', 'disputed'],
        ),
    ).all()
    verified_count = sum(1 for a in attested if a.status == 'verified')
    sustained_rate = (
        round(100.0 * verified_count / len(attested)) if attested else None
    )

    # Active rounds — title + trigger only
    rounds = ProximateRound.query.filter(
        ProximateRound.network_id == net.id,
        ProximateRound.status == 'active',
    ).all()

    return {
        'year': year,
        'total_moved_usd': float(total_moved),
        'disbursement_count': int(disbursement_count),
        'partner_count': len(active),
        'partners_by_locality': partners_by_locality,
        'sustained_outcome_rate_pct': sustained_rate,
        'outcomes_attested': len(attested),
        'active_rounds': [
            {'title': r.title, 'trigger_type': r.trigger_type}
            for r in rounds
        ],
        'generated_at': datetime.now(timezone.utc).isoformat(),
    }


@proximate_bp.route('/public/transparency', methods=['GET'])
def api_public_transparency():
    """Public endpoint — no auth. Serves the Phase 716e transparency
    page. Cached in-process for 24h per tenant so the public surface
    is a snapshot, not a live query path (leak-vector avoidance per
    the spec)."""
    net, err = _require_proximate_tenant()
    if err:
        return err
    now_ts = datetime.now(timezone.utc).timestamp()
    cached = _TRANSPARENCY_CACHE.get(net.id)
    if cached and (now_ts - cached[0]) < _TRANSPARENCY_TTL_SECONDS:
        payload = cached[1]
    else:
        payload = _build_transparency_payload(net)
        _TRANSPARENCY_CACHE[net.id] = (now_ts, payload)
    return jsonify({'success': True, 'transparency': payload})


# =========================================================================
# Phase 721f — Donor Pack PDF (grant-timeline scope)
# =========================================================================

@proximate_bp.route('/grants/<int:grant_id>/donor-pack.pdf', methods=['GET'])
@login_required
def api_grant_donor_pack_pdf(grant_id):
    """Phase 721f — extends the Phase 671 end-of-round PDF to the full
    grant timeline: financial reconciliation (committed → allocated →
    disbursed → remaining, per funding round), deliverables vs targets
    (Phase 721d computation), the report timeline with compliance
    scores, and the latest report's narrative sections. Same reportlab
    canvas style as Phase 671; same OB-or-owning-donor scope as the
    grant detail endpoint.

    v0 punt: photo/voice evidence is summarised as counts, not embedded
    media (media embedding needs the R2 store, Phase 719 — blocked)."""
    from io import BytesIO
    import json as _json
    from flask import send_file as _send_file
    from app.models import (
        ProximateGrant, ProximateGrantAllocation, ProximateGrantReport,
    )
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
    g = ProximateGrant.query.filter_by(id=grant_id, network_id=net.id).first()
    if not g:
        return jsonify({'success': False, 'error': 'not found'}), 404
    if not _user_is_ob(net):
        from app.models import ProximateDonor
        my_donor = ProximateDonor.query.filter_by(
            network_id=net.id, primary_user_id=current_user.id,
        ).first()
        if not my_donor or g.donor_id != my_donor.id:
            return jsonify({'success': False, 'error': 'not authorised'}), 403

    # ---- financial reconciliation per allocated round ------------------
    allocations = ProximateGrantAllocation.query.filter_by(
        grant_id=g.id,
    ).all()
    moved_states = ('pending_report', 'reported', 'verified', 'flagged')
    round_rows = []
    total_allocated = 0.0
    for a in allocations:
        rnd = ProximateRound.query.get(a.round_id)
        moved = sum(
            float(d.amount_usd or 0)
            for d in ProximateDisbursement.query.filter_by(
                network_id=net.id, round_id=a.round_id,
            ).all()
            if d.status in moved_states
        )
        total_allocated += float(a.amount_usd or 0)
        round_rows.append({
            'title': rnd.title if rnd else f'Round #{a.round_id}',
            'allocated': float(a.amount_usd or 0),
            'round_disbursed': moved,
        })
    committed = float(g.amount_committed_usd or 0)

    deliverables = _grant_deliverables_progress(g)
    reports = ProximateGrantReport.query.filter_by(
        grant_id=g.id,
    ).order_by(ProximateGrantReport.period_start.asc()).all()

    # Latest narrative — most recent report that has human content
    narrative = None
    for rep in reversed(reports):
        content = rep._content() if hasattr(rep, '_content') else None
        if not content and rep.content_json:
            try:
                content = _json.loads(rep.content_json)
            except (ValueError, TypeError):
                content = None
        if content:
            narrative = (rep, content)
            break

    # ---- render ---------------------------------------------------------
    buf = BytesIO()
    p = _canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    y = height - 25 * mm

    def _line(txt, size=10, spacing=12, font='Helvetica'):
        nonlocal y
        if y < 30 * mm:
            p.showPage()
            y = height - 25 * mm
        p.setFont(font, size)
        p.drawString(20 * mm, y, str(txt)[:120])
        y -= spacing

    def _wrapped(txt, size=9, spacing=11, chars=100):
        for word_line in str(txt).splitlines():
            while word_line:
                _line(word_line[:chars], size, spacing)
                word_line = word_line[chars:]

    _line(f"Donor Pack: {g.title}", 16, 20, 'Helvetica-Bold')
    _line(
        f"Donor: {g.donor_name_cache or '—'}    "
        f"Ref: {g.donor_grant_ref or '—'}    Status: {g.status}",
        9, 13,
    )
    _line(
        f"Period: {g.start_date or '—'} → {g.end_date or '—'}    "
        f"Cadence: {g.reporting_cadence}",
        9, 16,
    )

    _line('Financial reconciliation', 12, 16, 'Helvetica-Bold')
    _line(
        f"Committed: ${committed:,.0f}    "
        f"Allocated to rounds: ${total_allocated:,.0f}    "
        f"Unallocated: ${committed - total_allocated:,.0f}",
        10, 14, 'Helvetica-Bold',
    )
    for rr in round_rows:
        _line(
            f"  • {rr['title']} — allocated ${rr['allocated']:,.0f} "
            f"(round total disbursed: ${rr['round_disbursed']:,.0f})",
            9, 12,
        )
    if not round_rows:
        _line('  (no allocations yet)', 9, 12)
    y -= 4

    _line('Deliverables vs targets', 12, 16, 'Helvetica-Bold')
    for d in deliverables:
        cur = d['current'] if d['current'] is not None else '—'
        pct = f"{d['pct']}%" if d['pct'] is not None else d['source']
        _line(
            f"  • {d['title']} — {cur} / {d['target'] or '—'} "
            f"{d['unit'] or ''} ({pct})",
            9, 12,
        )
    if not deliverables:
        _line('  (no deliverables extracted from the agreement)', 9, 12)
    y -= 4

    _line('Reporting timeline', 12, 16, 'Helvetica-Bold')
    for rep in reports:
        score_txt = ''
        if rep.compliance_score_json:
            try:
                scores = _json.loads(rep.compliance_score_json)
                items = scores if isinstance(scores, list) else \
                    scores.get('items', [])
                vals = [s.get('score') for s in items
                        if isinstance(s.get('score'), (int, float))]
                if vals:
                    score_txt = f"    compliance {round(sum(vals)/len(vals))}/100"
            except (ValueError, TypeError, AttributeError):
                pass
        _line(
            f"  • {rep.report_type} {rep.period_start or ''}–"
            f"{rep.period_end or ''} — {rep.status}"
            f"{'  due ' + str(rep.due_date) if rep.due_date else ''}"
            f"{score_txt}",
            9, 12,
        )
    if not reports:
        _line('  (no reports yet)', 9, 12)
    y -= 4

    if narrative:
        rep, content = narrative
        _line(
            f"Latest narrative ({rep.report_type} "
            f"{rep.period_start or ''}–{rep.period_end or ''})",
            12, 16, 'Helvetica-Bold',
        )
        for key, label in (
            ('executive_summary', 'Executive summary'),
            ('financial_summary', 'Financial summary'),
            ('impact_narrative', 'Impact narrative'),
            ('compliance_note', 'Compliance note'),
        ):
            txt = (content or {}).get(key)
            if txt:
                _line(label, 10, 13, 'Helvetica-Bold')
                _wrapped(txt, 9, 11)
                y -= 3

    # Audit anchor (same trust pattern as Phase 671)
    audit_last = (
        AuditChainEntry.query
        .filter(AuditChainEntry.action.like('proximate.%'))
        .order_by(AuditChainEntry.seq.desc())
        .first()
    )
    if audit_last:
        _line(
            f"Audit anchor: seq={audit_last.seq} "
            f"hash={audit_last.payload_hash[:16]}…",
            8, 11,
        )

    p.showPage()
    p.save()
    buf.seek(0)
    AuditChainEntry.append(
        action='proximate.grant.donor_pack_generated',
        actor_email=current_user.email,
        subject_kind='proximate_grant',
        subject_id=g.id,
        details={'bytes': buf.getbuffer().nbytes},
    )
    return _send_file(
        buf,
        mimetype='application/pdf',
        as_attachment=True,
        download_name=f'proximate-grant-{g.id}-donor-pack.pdf',
    )


# =====================================================================
# Blue Nile round intake (July 2026) — DD evidence, media verification,
# panel roster, PIF import. The first real round arrived as a OneDrive
# folder; these endpoints make the system the round's system of record.
# All OB-only via the network-explicit gate.
# =====================================================================

_ATTACH_EXTS = {'pdf', 'docx', 'doc', 'png', 'jpg', 'jpeg', 'webp', 'xlsx', 'csv'}
_ATTACH_MAX_BYTES = 15 * 1024 * 1024


def _attach_subject_or_404(net, subject_kind, subject_id):
    """Resolve + tenant-check the attachment subject. Returns (obj, err)."""
    from app.models import ProximateRound
    from app.models.crisis_monitoring import CrisisSignal
    model = {
        'partner': ProximatePartner,
        'round': ProximateRound,
        'crisis_signal': CrisisSignal,
    }.get(subject_kind)
    if model is None:
        return None, (jsonify({'success': False,
                               'error': 'invalid subject_kind'}), 400)
    obj = model.query.filter_by(id=subject_id, network_id=net.id).first()
    if not obj:
        return None, (jsonify({'success': False,
                               'error': 'subject not found'}), 404)
    return obj, None


@proximate_bp.route('/attachments', methods=['POST'])
@login_required
def api_add_proximate_attachment():
    """Attach one evidence file to a partner / round / crisis signal.
    Multipart: file, subject_kind, subject_id, kind, label(optional)."""
    import uuid
    from werkzeug.utils import secure_filename
    from flask import current_app as cap
    from app.models import Document, ProximateAttachment, ATTACHMENT_KINDS

    net, err = _require_proximate_tenant()
    if err:
        return err
    gate = _proximate_ob_or_403(net)
    if gate:
        return gate

    subject_kind = (request.form.get('subject_kind') or '').strip()
    try:
        subject_id = int(request.form.get('subject_id') or 0)
    except ValueError:
        subject_id = 0
    _, err = _attach_subject_or_404(net, subject_kind, subject_id)
    if err:
        return err

    kind = (request.form.get('kind') or 'other').strip()
    if kind not in ATTACHMENT_KINDS:
        kind = 'other'
    label = (request.form.get('label') or '').strip()[:300] or None

    if 'file' not in request.files or not request.files['file'].filename:
        return jsonify({'success': False, 'error': 'no file provided'}), 400
    file = request.files['file']
    original_filename = secure_filename(file.filename)
    ext = (original_filename.rsplit('.', 1)[-1].lower()
           if '.' in original_filename else '')
    if ext not in _ATTACH_EXTS:
        return jsonify({'success': False,
                        'error': f'file type .{ext} not allowed'}), 400
    if request.content_length and request.content_length > _ATTACH_MAX_BYTES:
        return jsonify({'success': False, 'error': 'file too large'}), 413

    stored_filename = f'proximate_evidence_{uuid.uuid4().hex}.{ext}'
    filepath = os.path.join(cap.config['UPLOAD_FOLDER'], stored_filename)
    file.save(filepath)
    file_size = os.path.getsize(filepath)

    doc = Document(
        original_filename=original_filename,
        stored_filename=stored_filename,
        file_size=file_size,
        mime_type=file.mimetype,
        doc_type='proximate_evidence',
    )
    db.session.add(doc)
    db.session.flush()
    att = ProximateAttachment(
        network_id=net.id,
        subject_kind=subject_kind,
        subject_id=subject_id,
        document_id=doc.id,
        kind=kind,
        label=label,
        uploaded_by_user_id=current_user.id,
    )
    db.session.add(att)
    db.session.commit()

    AuditChainEntry.append(
        action='proximate.evidence.attached',
        actor_email=current_user.email,
        subject_kind=f'proximate_{subject_kind}',
        subject_id=subject_id,
        details={'attachment_id': att.id, 'kind': kind,
                 'filename': original_filename, 'bytes': file_size},
    )
    return jsonify({'success': True, 'attachment': att.to_dict()})


@proximate_bp.route('/attachments', methods=['GET'])
@login_required
def api_list_proximate_attachments():
    from app.models import ProximateAttachment
    net, err = _require_proximate_tenant()
    if err:
        return err
    gate = _proximate_ob_or_403(net)
    if gate:
        return gate
    subject_kind = (request.args.get('subject_kind') or '').strip()
    try:
        subject_id = int(request.args.get('subject_id') or 0)
    except ValueError:
        subject_id = 0
    q = ProximateAttachment.query.filter_by(network_id=net.id)
    if subject_kind:
        q = q.filter_by(subject_kind=subject_kind)
    if subject_id:
        q = q.filter_by(subject_id=subject_id)
    rows = q.order_by(ProximateAttachment.created_at.desc()).limit(500).all()
    return jsonify({'success': True,
                    'attachments': [a.to_dict() for a in rows]})


@proximate_bp.route('/attachments/<int:attachment_id>/download', methods=['GET'])
@login_required
def api_download_proximate_attachment(attachment_id):
    from flask import current_app as cap, send_file
    from app.models import ProximateAttachment
    net, err = _require_proximate_tenant()
    if err:
        return err
    gate = _proximate_ob_or_403(net)
    if gate:
        return gate
    att = ProximateAttachment.query.filter_by(
        id=attachment_id, network_id=net.id,
    ).first()
    if not att or not att.document:
        return jsonify({'success': False, 'error': 'not found'}), 404
    filepath = os.path.join(
        cap.config['UPLOAD_FOLDER'], att.document.stored_filename,
    )
    if not os.path.exists(filepath):
        return jsonify({'success': False, 'error': 'file missing'}), 404
    return send_file(
        filepath, as_attachment=True,
        download_name=att.document.original_filename,
        mimetype=att.document.mime_type,
    )


@proximate_bp.route('/partners/<int:partner_id>/media-verification',
                    methods=['GET', 'POST'])
@login_required
def api_partner_media_verification(partner_id):
    """Social-footprint verification record — the check the field team
    actually performs (links, followers, activity evidence, verdict).
    POST appends a new record (history preserved); GET returns latest
    plus history."""
    from app.models import ProximateMediaVerification, MEDIA_VERDICTS
    import json as _json

    net, err = _require_proximate_tenant()
    if err:
        return err
    gate = _proximate_ob_or_403(net)
    if gate:
        return gate
    partner = ProximatePartner.query.filter_by(
        id=partner_id, network_id=net.id,
    ).first()
    if not partner:
        return jsonify({'success': False, 'error': 'partner not found'}), 404

    if request.method == 'GET':
        rows = (ProximateMediaVerification.query
                .filter_by(partner_id=partner.id)
                .order_by(ProximateMediaVerification.reviewed_at.desc())
                .limit(20).all())
        return jsonify({
            'success': True,
            'latest': rows[0].to_dict() if rows else None,
            'history': [r.to_dict() for r in rows],
        })

    payload = request.get_json(silent=True) or {}
    verdict = (payload.get('overall_verdict') or 'no_footprint').strip().lower()
    if verdict not in MEDIA_VERDICTS:
        return jsonify({
            'success': False,
            'error': f'overall_verdict must be one of {MEDIA_VERDICTS}',
        }), 400
    links = payload.get('links') or []
    if not isinstance(links, list):
        links = [str(links)]
    mv = ProximateMediaVerification(
        network_id=net.id,
        partner_id=partner.id,
        links_json=_json.dumps([str(u)[:500] for u in links[:10]]),
        interaction_summary=(payload.get('interaction_summary') or '').strip()[:2000] or None,
        external_mention=(payload.get('external_mention') or '').strip()[:300] or None,
        responsible_individual_mention=(
            payload.get('responsible_individual_mention') or '').strip()[:300] or None,
        overall_verdict=verdict,
        notes=(payload.get('notes') or '').strip()[:2000] or None,
        source=(payload.get('source') or 'manual').strip()[:30],
        reviewed_by_user_id=current_user.id,
    )
    db.session.add(mv)
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.partner.media_verified',
        actor_email=current_user.email,
        subject_kind='proximate_partner',
        subject_id=partner.id,
        details={'verdict': verdict, 'links': len(links),
                 'media_verification_id': mv.id},
    )
    return jsonify({'success': True, 'media_verification': mv.to_dict()})


@proximate_bp.route('/partners/<int:partner_id>/media-verification/ai-check',
                    methods=['POST'])
@login_required
def api_partner_media_verification_ai_check(partner_id):
    """AI-assisted media check — runs the adverse-media web screen (Claude +
    live web search) and stores the outcome as a DRAFT verification row.

    The AI does the legwork (finding links + mentions); the verdict stays
    conservative — 'inconclusive' unless the screen flagged something
    ('negative'), or found nothing at all ('no_footprint') — so a human
    still reviews and posts the final manual record. source='ai_web_search'
    keeps the two kinds of row distinguishable forever.
    """
    from app.models import ProximateMediaVerification
    from app.services.adverse_media_service import AdverseMediaService
    import json as _json

    net, err = _require_proximate_tenant()
    if err:
        return err
    gate = _proximate_ob_or_403(net)
    if gate:
        return gate
    partner = ProximatePartner.query.filter_by(
        id=partner_id, network_id=net.id,
    ).first()
    if not partner:
        return jsonify({'success': False, 'error': 'partner not found'}), 404

    leadership = []
    intake = partner.get_intake_form() if hasattr(partner, 'get_intake_form') else {}
    if isinstance(intake, dict):
        for key in ('contact_name', 'responsible_person', 'lead_name'):
            v = (intake.get(key) or '').strip() if isinstance(intake.get(key), str) else ''
            if v:
                leadership.append(v)

    screening = AdverseMediaService.screen(
        org_name=partner.name,
        country=partner.country or 'SD',
        leadership=leadership[:3] or None,
    )
    findings = screening.get('findings') or []
    summary = screening.get('summary') or {}
    overall = summary.get('overall_status') or 'clear'

    links = [f.get('url') for f in findings if f.get('url')][:10]
    mention_bits = [
        f"[{f.get('severity', '?')}] {f.get('headline', '')}"
        for f in findings[:5]
    ]
    if overall == 'flagged':
        verdict = 'negative'
    elif findings:
        verdict = 'inconclusive'
    else:
        verdict = 'no_footprint'

    mv = ProximateMediaVerification(
        network_id=net.id,
        partner_id=partner.id,
        links_json=_json.dumps([str(u)[:500] for u in links]),
        interaction_summary=(screening.get('ai_notes') or '')[:2000] or None,
        external_mention='; '.join(mention_bits)[:300] or None,
        overall_verdict=verdict,
        notes=('AI draft — review the links and post your own verdict. '
               f"Source: {screening.get('source', 'ai')}, "
               f"confidence {screening.get('ai_confidence', '?')}/100.")[:2000],
        source='ai_web_search',
        reviewed_by_user_id=current_user.id,
    )
    db.session.add(mv)
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.partner.media_ai_checked',
        actor_email=current_user.email,
        subject_kind='proximate_partner',
        subject_id=partner.id,
        details={'verdict': verdict, 'findings': len(findings),
                 'overall_status': overall,
                 'media_verification_id': mv.id,
                 'ai_source': screening.get('source')},
    )
    return jsonify({
        'success': True,
        'media_verification': mv.to_dict(),
        'findings_count': len(findings),
        'overall_status': overall,
    })


@proximate_bp.route('/panel-candidates', methods=['GET', 'POST'])
@login_required
def api_panel_candidates():
    """Per-round panel roster. GET ?round_id= filters; POST creates a
    candidate (name required; phone/email/rationale/location optional)."""
    from app.models import ProximatePanelCandidate

    net, err = _require_proximate_tenant()
    if err:
        return err
    gate = _proximate_ob_or_403(net)
    if gate:
        return gate

    if request.method == 'GET':
        q = ProximatePanelCandidate.query.filter_by(network_id=net.id)
        rid = request.args.get('round_id')
        if rid and rid.isdigit():
            q = q.filter_by(round_id=int(rid))
        rows = q.order_by(ProximatePanelCandidate.created_at.asc()).limit(300).all()
        return jsonify({'success': True,
                        'candidates': [c.to_dict() for c in rows]})

    payload = request.get_json(silent=True) or {}
    name = (payload.get('name') or '').strip()
    if not name or len(name) < 2:
        return jsonify({'success': False, 'error': 'name is required'}), 400
    round_id = payload.get('round_id')
    if round_id:
        from app.models import ProximateRound
        rnd = ProximateRound.query.filter_by(
            id=round_id, network_id=net.id,
        ).first()
        if not rnd:
            return jsonify({'success': False, 'error': 'round not found'}), 404
    cand = ProximatePanelCandidate(
        network_id=net.id,
        round_id=round_id or None,
        name=name[:200],
        phone=(payload.get('phone') or '').strip()[:40] or None,
        email=(payload.get('email') or '').strip()[:320] or None,
        rationale=(payload.get('rationale') or '').strip()[:3000] or None,
        location=(payload.get('location') or '').strip()[:160] or None,
        status='candidate',
        created_by_user_id=current_user.id,
    )
    db.session.add(cand)
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.panel.candidate_added',
        actor_email=current_user.email,
        subject_kind='proximate_panel_candidate',
        subject_id=cand.id,
        details={'round_id': round_id, 'location': cand.location},
    )
    return jsonify({'success': True, 'candidate': cand.to_dict()})


@proximate_bp.route('/panel-candidates/<int:candidate_id>', methods=['PATCH'])
@login_required
def api_update_panel_candidate(candidate_id):
    from app.models import ProximatePanelCandidate, PANEL_STATUSES
    net, err = _require_proximate_tenant()
    if err:
        return err
    gate = _proximate_ob_or_403(net)
    if gate:
        return gate
    cand = ProximatePanelCandidate.query.filter_by(
        id=candidate_id, network_id=net.id,
    ).first()
    if not cand:
        return jsonify({'success': False, 'error': 'not found'}), 404
    payload = request.get_json(silent=True) or {}
    if 'status' in payload:
        status = (payload.get('status') or '').strip().lower()
        if status not in PANEL_STATUSES:
            return jsonify({
                'success': False,
                'error': f'status must be one of {PANEL_STATUSES}',
            }), 400
        cand.status = status
    if 'notes' in payload:
        cand.notes = (payload.get('notes') or '').strip()[:3000] or None
    if 'round_id' in payload:
        cand.round_id = payload.get('round_id') or None
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.panel.candidate_updated',
        actor_email=current_user.email,
        subject_kind='proximate_panel_candidate',
        subject_id=cand.id,
        details={'status': cand.status},
    )
    return jsonify({'success': True, 'candidate': cand.to_dict()})


# ----------------------------------------------------------------------
# Panel selection vote — token-link voting for the round selection
# meeting. One session per round; each appointed panelist gets a
# personal one-shot ballot link (same zero-login pattern as endorser
# invites). OB opens, panelists tap, OB closes; everything audit-chained.
# ----------------------------------------------------------------------

def _vote_session_tally(session):
    """Live tally from submitted ballots: {pid: {'select': n, 'pass': n}}."""
    tally = {str(b['participant_id']): {'select': 0, 'pass': 0}
             for b in session.get_ballot()}
    voted = 0
    for inv in session.invites:
        if not inv.voted_at:
            continue
        voted += 1
        for pid, choice in inv.get_votes().items():
            if pid in tally and choice in ('select', 'pass'):
                tally[pid][choice] += 1
    return tally, voted


@proximate_bp.route('/rounds/<int:round_id>/selection-vote',
                    methods=['GET', 'POST'])
@login_required
def api_round_selection_vote(round_id):
    """GET: latest session + live tally (OB view, includes share tokens).
    POST: open a new session. Panelists default to the round's APPOINTED
    panel candidates (override with panel_candidate_ids); the ballot is
    the round's non-withdrawn roster, frozen at open."""
    from app.models import (
        ProximatePanelVoteSession, ProximatePanelVoteInvite,
        ProximatePanelCandidate, ProximateRound, ProximateRoundParticipant,
    )
    import json as _json

    net, err = _require_proximate_tenant()
    if err:
        return err
    gate = _proximate_ob_or_403(net)
    if gate:
        return gate
    rnd = ProximateRound.query.filter_by(
        id=round_id, network_id=net.id,
    ).first()
    if not rnd:
        return jsonify({'success': False, 'error': 'round not found'}), 404

    if request.method == 'GET':
        session = (ProximatePanelVoteSession.query
                   .filter_by(round_id=rnd.id, network_id=net.id)
                   .order_by(ProximatePanelVoteSession.created_at.desc())
                   .first())
        if not session:
            return jsonify({'success': True, 'session': None})
        tally, voted = _vote_session_tally(session)
        return jsonify({
            'success': True,
            'session': session.to_dict(),
            'invites': [i.to_dict(include_token=True)
                        for i in session.invites],
            'tally': tally,
            'voted': voted,
            'invited': len(session.invites),
        })

    existing = ProximatePanelVoteSession.query.filter_by(
        round_id=rnd.id, network_id=net.id, status='open',
    ).first()
    if existing:
        return jsonify({
            'success': False, 'error': 'vote_already_open',
            'session_id': existing.id,
        }), 409

    participants = (ProximateRoundParticipant.query
                    .filter_by(round_id=rnd.id)
                    .filter(ProximateRoundParticipant.stage != 'withdrawn')
                    .all())
    if not participants:
        return jsonify({
            'success': False, 'error': 'roster_empty',
        }), 400

    body = get_request_json() or {}
    cand_q = ProximatePanelCandidate.query.filter_by(network_id=net.id)
    ids = body.get('panel_candidate_ids')
    if isinstance(ids, list) and ids:
        cands = cand_q.filter(ProximatePanelCandidate.id.in_(
            [int(i) for i in ids if str(i).isdigit()])).all()
    else:
        cands = cand_q.filter_by(round_id=rnd.id, status='appointed').all()
    if not cands:
        return jsonify({
            'success': False, 'error': 'no_appointed_panelists',
        }), 400

    ballot = []
    for p in participants:
        partner = getattr(p, 'partner', None) or ProximatePartner.query.get(
            p.partner_id)
        ballot.append({
            'participant_id': p.id,
            'partner_id': p.partner_id,
            'partner_name': (partner.name if partner else None)
                or f'Partner #{p.partner_id}',
            'partner_name_ar': getattr(partner, 'name_ar', None),
            'locality': getattr(partner, 'locality', None),
        })

    session = ProximatePanelVoteSession(
        network_id=net.id,
        round_id=rnd.id,
        ballot_json=_json.dumps(ballot),
        created_by_user_id=current_user.id,
    )
    db.session.add(session)
    db.session.flush()
    for c in cands:
        db.session.add(ProximatePanelVoteInvite(
            session_id=session.id,
            panel_candidate_id=c.id,
            voter_name=c.name,
            voter_phone=c.phone,
        ))
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.round.selection_vote_opened',
        actor_email=current_user.email,
        subject_kind='proximate_round',
        subject_id=rnd.id,
        details={'session_id': session.id, 'ballot_size': len(ballot),
                 'panelists': len(cands)},
    )
    return jsonify({
        'success': True,
        'session': session.to_dict(),
        'invites': [i.to_dict(include_token=True) for i in session.invites],
    })


@proximate_bp.route('/rounds/<int:round_id>/selection-vote/close',
                    methods=['POST'])
@login_required
def api_round_selection_vote_close(round_id):
    """OB closes the vote: strict majority of CAST ballots selects a
    partner (select > pass; ties are not selected — the OB decides those
    outside the tally). The outcome is recorded, not auto-applied to the
    roster: the system records, the OB acts."""
    from app.models import ProximatePanelVoteSession, ProximateRound
    import json as _json

    net, err = _require_proximate_tenant()
    if err:
        return err
    gate = _proximate_ob_or_403(net)
    if gate:
        return gate
    rnd = ProximateRound.query.filter_by(
        id=round_id, network_id=net.id,
    ).first()
    if not rnd:
        return jsonify({'success': False, 'error': 'round not found'}), 404
    session = ProximatePanelVoteSession.query.filter_by(
        round_id=rnd.id, network_id=net.id, status='open',
    ).first()
    if not session:
        return jsonify({'success': False, 'error': 'no open vote'}), 404

    tally, voted = _vote_session_tally(session)
    selected = [int(pid) for pid, t in tally.items()
                if t['select'] > t['pass']]
    outcome = {
        'selected_participant_ids': selected,
        'tally': tally,
        'voted': voted,
        'invited': len(session.invites),
    }
    session.outcome_json = _json.dumps(outcome)
    session.status = 'closed'
    session.closed_by_user_id = current_user.id
    session.closed_at = datetime.now(timezone.utc)
    db.session.commit()
    AuditChainEntry.append(
        action='proximate.round.selection_vote_closed',
        actor_email=current_user.email,
        subject_kind='proximate_round',
        subject_id=rnd.id,
        details={'session_id': session.id, **outcome},
    )
    return jsonify({'success': True, 'session': session.to_dict()})


@proximate_bp.route('/selection-vote/<token>', methods=['GET'])
def api_get_selection_vote_ballot(token):
    """Public. Panelist opens their WhatsApp link cold — returns the
    ballot (partner names only, no internal detail) + whether they
    already voted."""
    from app.models import ProximatePanelVoteInvite, ProximateRound
    inv = ProximatePanelVoteInvite.query.filter_by(vote_token=token).first()
    if not inv:
        return jsonify({'success': False, 'error': 'invalid token'}), 404
    session = inv.session
    rnd = ProximateRound.query.get(session.round_id)
    return jsonify({
        'success': True,
        'voter_name': inv.voter_name,
        'already_voted': inv.voted_at is not None,
        'vote_open': session.status == 'open',
        'round': {
            'title': rnd.title if rnd else None,
            'title_ar': getattr(rnd, 'title_ar', None),
        },
        'ballot': session.get_ballot(),
    })


@proximate_bp.route('/selection-vote/<token>', methods=['POST'])
def api_submit_selection_vote(token):
    """Public. One-shot ballot submit. Body: {choices: {"<participant_id>":
    "select"|"pass"}, note?}. Anything not on the frozen ballot is
    ignored; anything on the ballot but missing defaults to 'pass'."""
    from app.models import ProximatePanelVoteInvite
    import json as _json

    inv = ProximatePanelVoteInvite.query.filter_by(vote_token=token).first()
    if not inv:
        return jsonify({'success': False, 'error': 'invalid token'}), 404
    if inv.voted_at is not None:
        return jsonify({'success': False, 'error': 'already_voted'}), 409
    session = inv.session
    if session.status != 'open':
        return jsonify({'success': False, 'error': 'vote_closed'}), 409

    body = get_request_json() or {}
    raw = body.get('choices') or {}
    if not isinstance(raw, dict):
        return jsonify({'success': False, 'error': 'choices must be an object'}), 400
    ballot_ids = {str(b['participant_id']) for b in session.get_ballot()}
    votes = {}
    for pid in ballot_ids:
        choice = str(raw.get(pid, 'pass')).strip().lower()
        votes[pid] = choice if choice in ('select', 'pass') else 'pass'

    inv.votes_json = _json.dumps(votes)
    inv.note = (str(body.get('note') or '').strip()[:2000]) or None
    inv.voted_at = datetime.now(timezone.utc)
    db.session.commit()
    selected_count = sum(1 for v in votes.values() if v == 'select')
    AuditChainEntry.append(
        action='proximate.round.selection_vote_cast',
        actor_email=f'panelist:{inv.vote_token[:8]}…',
        subject_kind='proximate_round',
        subject_id=session.round_id,
        # Counts only — individual choices stay in the DB row, visible
        # to OB, never on the public transparency surface.
        details={'session_id': session.id, 'invite_id': inv.id,
                 'selected': selected_count,
                 'passed': len(votes) - selected_count},
    )
    return jsonify({'success': True, 'voted_at': inv.voted_at.isoformat()})


@proximate_bp.route('/partners/import-pif', methods=['POST'])
@login_required
def api_import_pif():
    """Bulk-intake on-ramp: one PIF file -> one nominated partner with
    the structured form stored on intake_form.pif + the original file
    attached. Multipart: file (docx/pdf), fields_json (optional
    pre-parsed dict — skips AI), round_id (optional roster link).

    Extraction ladder: fields_json > AI extraction > stub partner named
    from the filename (honest fallback — the file is attached either
    way, nothing is lost)."""
    import uuid
    import json as _json
    from werkzeug.utils import secure_filename
    from flask import current_app as cap
    from app.models import Document, ProximateAttachment

    net, err = _require_proximate_tenant()
    if err:
        return err
    gate = _proximate_ob_or_403(net)
    if gate:
        return gate

    if 'file' not in request.files or not request.files['file'].filename:
        return jsonify({'success': False, 'error': 'no file provided'}), 400
    file = request.files['file']
    original_filename = secure_filename(file.filename)
    ext = (original_filename.rsplit('.', 1)[-1].lower()
           if '.' in original_filename else '')
    if ext not in ('pdf', 'docx', 'doc'):
        return jsonify({'success': False,
                        'error': 'PIF must be pdf/docx/doc'}), 400

    stored_filename = f'proximate_pif_{uuid.uuid4().hex}.{ext}'
    filepath = os.path.join(cap.config['UPLOAD_FOLDER'], stored_filename)
    file.save(filepath)

    fields = None
    source = 'fields_json'
    raw_fields = request.form.get('fields_json')
    if raw_fields:
        try:
            fields = _json.loads(raw_fields)
        except Exception:
            fields = None
    if not isinstance(fields, dict) or not fields:
        from app.services.proximate_pif_extract_service import (
            extract_pif_text, extract_pif_fields,
        )
        text = extract_pif_text(filepath)
        fields = extract_pif_fields(doc_text=text,
                                    filename=original_filename) if text else None
        source = 'ai_extraction' if fields else 'stub'

    fields = fields or {}
    name = (fields.get('org_name') or '').strip()
    if not name:
        # Filename fallback: "Partner Information Form (Org Name).docx"
        base = original_filename.rsplit('.', 1)[0]
        for marker in ('(', ' - '):
            if marker in base:
                base = base.split(marker, 1)[1]
        name = base.replace(')', '').replace('_', ' ').strip() or 'Unnamed partner'

    # Dedup: same name in this tenant -> update the PIF payload instead
    # of creating a twin.
    partner = ProximatePartner.query.filter(
        ProximatePartner.network_id == net.id,
        db.func.lower(ProximatePartner.name) == name.lower(),
    ).first()
    created = partner is None
    if created:
        partner = ProximatePartner(
            network_id=net.id,
            name=name[:200],
            status='nominated',
            country='SD',
            nominated_by_user_id=current_user.id,
        )
        db.session.add(partner)

    if fields.get('org_name_ar'):
        partner.name_ar = str(fields['org_name_ar'])[:200]
    if fields.get('headquarters_address') and not partner.locality:
        partner.locality = str(fields['headquarters_address'])[:120]
    if fields.get('contact_phone') and not partner.contact_phone:
        partner.contact_phone = str(fields['contact_phone'])[:40]
    if fields.get('contact_email') and not partner.contact_email:
        partner.contact_email = str(fields['contact_email'])[:320]
    if fields.get('bank_account_holder') and not partner.bank_account_holder_name:
        partner.bank_account_holder_name = str(fields['bank_account_holder'])[:200]
    if fields.get('bank_name_branch') and not partner.bank_name:
        partner.bank_name = str(fields['bank_name_branch'])[:160]
    if fields.get('bank_account_number') and not partner.bank_account_number:
        partner.bank_account_number = str(fields['bank_account_number'])[:80]

    intake = partner.get_intake_form() or {}
    intake['pif'] = fields
    intake['pif_source'] = source
    intake['pif_filename'] = original_filename
    partner.set_intake_form(intake)
    db.session.flush()

    doc = Document(
        original_filename=original_filename,
        stored_filename=stored_filename,
        file_size=os.path.getsize(filepath),
        mime_type=file.mimetype,
        doc_type='proximate_evidence',
    )
    db.session.add(doc)
    db.session.flush()
    att = ProximateAttachment(
        network_id=net.id,
        subject_kind='partner',
        subject_id=partner.id,
        document_id=doc.id,
        kind='pif_original',
        label=f'PIF ({source})',
        uploaded_by_user_id=current_user.id,
    )
    db.session.add(att)
    db.session.commit()

    if created:
        try:
            _run_partner_sanctions_screen(partner)
            db.session.commit()
        except Exception:
            db.session.rollback()

    AuditChainEntry.append(
        action='proximate.partner.pif_imported',
        actor_email=current_user.email,
        subject_kind='proximate_partner',
        subject_id=partner.id,
        details={'created': created, 'source': source,
                 'filename': original_filename,
                 'fields_extracted': len(fields)},
    )
    return jsonify({
        'success': True,
        'created': created,
        'extraction_source': source,
        'partner': partner.to_dict(),
        'attachment_id': att.id,
    })
