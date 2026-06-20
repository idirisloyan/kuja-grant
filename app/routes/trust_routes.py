"""
Trust Profile, Adverse Media, Bank Verification, and Capacity Passport routes.

Phase 1 (May 2026 truth-in-claims).

Blueprint prefix: /api
Routes:
  /api/trust-profile/<org_id>                GET   - unified two-pillar Trust Profile
  /api/adverse-media/<org_id>                GET   - list past screenings
  /api/adverse-media/screen                  POST  - run a new screening
  /api/bank-verification/<org_id>            GET   - list past verifications
  /api/bank-verification/verify              POST  - run a new bank verification
  /api/passport/publish                      POST  - publish a capacity passport
  /api/passport/<org_id>                     GET   - list passports for org
  /api/passport/<int:id>/revoke              POST  - revoke a passport
  /api/passport/verify/<slug>                GET   - public verify endpoint (token in ?t=)
"""

import logging
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from app.extensions import db
from app.models import (
    Organization,
    AdverseMediaScreening,
    BankAccountVerification,
    CapacityPassport,
)
from app.services.adverse_media_service import AdverseMediaService
from app.services.bank_verification_service import BankVerificationService
from app.services.trust_profile_service import TrustProfileService
from app.services.capacity_passport_service import CapacityPassportService
from app.utils.helpers import get_request_json
from app.utils.decorators import role_required

logger = logging.getLogger('kuja')

trust_bp = Blueprint('trust', __name__, url_prefix='/api')


# =============================================================================
# TRUST PROFILE (unified two-pillar view)
# =============================================================================

@trust_bp.route('/trust-profile/<int:org_id>', methods=['GET'])
@login_required
def api_get_trust_profile(org_id):
    """Return the unified two-pillar Trust Profile for an org."""
    profile = TrustProfileService.build(org_id)
    if profile is None:
        return jsonify({'error': 'Organization not found', 'success': False}), 404

    # Phase 30D — track trust-profile visits. Filters to NGO viewing
    # own org + donor/reviewer/admin viewing any (matches access scope).
    try:
        from app.services.user_event_service import UserEventService
        is_own = current_user.role == 'ngo' and current_user.org_id == org_id
        is_external = current_user.role in ('donor', 'reviewer', 'admin')
        if is_own or is_external:
            UserEventService.record(
                user=current_user, event_name='trust_profile.viewed',
                viewed_org_id=org_id, own_org=is_own,
            )
    except Exception:
        pass

    return jsonify({'success': True, 'profile': profile})


@trust_bp.route('/trust-profile/<int:org_id>/gap-insights', methods=['GET'])
@login_required
def api_trust_gap_insights(org_id):
    """Phase 18A — AI-narrated gap analysis on top of the trust profile.

    Returns { gap_summary, total_estimated_lift, projected_overall,
    actions[{ title, detail, target_component, estimated_pillar,
    estimated_lift_points, effort }] } cached 30 minutes.

    Visibility:
      - NGO can read their own org
      - donor / reviewer / admin can read any (it's a review surface)
    """
    from app.services.trust_gap_insights_service import TrustGapInsightsService
    from app.utils.cache import _dashboard_cache

    org = db.session.get(Organization, org_id)
    if not org:
        return jsonify({'success': False, 'error': 'Org not found'}), 404

    # Access check
    if current_user.role == 'ngo' and org.id != current_user.org_id:
        return jsonify({'success': False, 'error': 'Insufficient permissions'}), 403

    cache_key = f'trust_gap_{org_id}'
    cached = _dashboard_cache.get(cache_key)
    if cached is not None:
        return jsonify({'cached': True, **cached})

    result = TrustGapInsightsService.for_ngo(ngo_org_id=org_id)
    _dashboard_cache.set(cache_key, result)
    return jsonify(result)


# =============================================================================
# ADVERSE MEDIA SCREENING
# =============================================================================

@trust_bp.route('/adverse-media/<int:org_id>', methods=['GET'])
@login_required
def api_list_adverse_media(org_id):
    """List adverse media screening runs for an organisation (most recent first)."""
    org = db.session.get(Organization, org_id)
    if not org:
        return jsonify({'error': 'Organization not found', 'success': False}), 404

    runs = (
        AdverseMediaScreening.query
        .filter_by(org_id=org_id)
        .order_by(AdverseMediaScreening.screened_at.desc())
        .limit(50)
        .all()
    )
    return jsonify({
        'success': True,
        'org_id': org_id,
        'org_name': org.name,
        'screenings': [r.to_dict() for r in runs],
        'latest': runs[0].to_dict() if runs else None,
    })


@trust_bp.route('/adverse-media/screen', methods=['POST'])
@login_required
@role_required('donor', 'admin', 'reviewer')
def api_run_adverse_media():
    """Run an adverse media screening against an org (+ optional leadership)."""
    data = get_request_json()
    org_id = data.get('org_id')
    if not org_id:
        return jsonify({'error': 'org_id is required', 'success': False}), 400

    org = db.session.get(Organization, org_id)
    if not org:
        return jsonify({'error': 'Organization not found', 'success': False}), 404

    lookback = int(data.get('lookback_months', AdverseMediaService.DEFAULT_LOOKBACK_MONTHS))
    leadership = data.get('leadership') or []

    # Best-effort: pull sector from the org if not supplied
    sector = data.get('sector')
    if sector is None:
        try:
            import json
            if org.sectors:
                arr = json.loads(org.sectors) if isinstance(org.sectors, str) else org.sectors
                if isinstance(arr, list) and arr:
                    sector = arr[0]
        except Exception:
            pass

    result = AdverseMediaService.screen(
        org_name=org.name,
        country=org.country,
        sector=sector,
        leadership=leadership,
        lookback_months=lookback,
    )

    # Persist
    screening = AdverseMediaScreening(
        org_id=org_id,
        lookback_months=lookback,
        status=result.get('summary', {}).get('overall_status', 'pending'),
        source=result.get('source', 'unknown'),
        ai_confidence=result.get('ai_confidence', 0),
        ai_notes=(result.get('ai_notes') or '')[:8000],
        screened_by_user_id=getattr(current_user, 'id', None),
    )
    screening.set_subjects(result.get('subjects', []))
    screening.set_findings(result.get('findings', []))
    screening.set_summary(result.get('summary', {}))
    db.session.add(screening)
    db.session.commit()

    return jsonify({
        'success': True,
        'screening': screening.to_dict(),
    })


# =============================================================================
# BANK ACCOUNT VERIFICATION
# =============================================================================

@trust_bp.route('/bank-verification/<int:org_id>', methods=['GET'])
@login_required
def api_list_bank_verifications(org_id):
    """List bank account verification runs for an org."""
    org = db.session.get(Organization, org_id)
    if not org:
        return jsonify({'error': 'Organization not found', 'success': False}), 404

    runs = (
        BankAccountVerification.query
        .filter_by(org_id=org_id)
        .order_by(BankAccountVerification.verified_at.desc())
        .limit(50)
        .all()
    )
    return jsonify({
        'success': True,
        'org_id': org_id,
        'org_name': org.name,
        'verifications': [r.to_dict() for r in runs],
        'latest': runs[0].to_dict() if runs else None,
    })


@trust_bp.route('/bank-verification/verify', methods=['POST'])
@login_required
def api_run_bank_verification():
    """Run a bank account verification. NGO or donor can submit.

    Body:
      org_id        — required
      bank_name     — string
      bank_country  — ISO 3166-1 alpha-2
      swift_bic     — string (optional)
      iban          — string (optional)
      currency      — ISO 4217 (optional)
      account_number — string (optional; not stored in plain text)
    """
    data = get_request_json()
    org_id = data.get('org_id')
    if not org_id:
        return jsonify({'error': 'org_id is required', 'success': False}), 400

    org = db.session.get(Organization, org_id)
    if not org:
        return jsonify({'error': 'Organization not found', 'success': False}), 404

    # NGO can only verify their own org; donors + admins can verify any
    if current_user.role == 'ngo' and current_user.org_id != org_id:
        return jsonify({'error': 'You can only verify your own organization', 'success': False}), 403

    bank_name = data.get('bank_name')
    bank_country = data.get('bank_country')
    swift_bic = data.get('swift_bic')
    iban = data.get('iban')
    currency = data.get('currency')
    account_number = data.get('account_number')

    result = BankVerificationService.verify(
        bank_name=bank_name,
        bank_country=bank_country,
        swift_bic=swift_bic,
        iban=iban,
        currency=currency,
        account_number=account_number,
        declared_org_country=org.country,
    )

    # Persist (account number minimized: last4 + hash only)
    last4 = (account_number or '').strip()[-4:] if account_number else None
    acct_hash = BankAccountVerification.hash_account_number(account_number or '') if account_number else None

    verification = BankAccountVerification(
        org_id=org_id,
        bank_name=bank_name,
        bank_country=result['normalised'].get('bank_country'),
        swift_bic=result['normalised'].get('swift_bic'),
        iban=result['normalised'].get('iban'),
        currency=result['normalised'].get('currency'),
        account_number_last4=last4,
        account_number_hash=acct_hash,
        risk_score=result.get('risk_score', 0),
        status=result.get('status', 'pending'),
        verified_by_user_id=getattr(current_user, 'id', None),
        verified_at=datetime.now(timezone.utc),
    )
    verification.set_findings(result.get('findings', []))
    db.session.add(verification)
    db.session.commit()

    return jsonify({
        'success': True,
        'verification': verification.to_dict(),
    })


# =============================================================================
# CAPACITY PASSPORT
# =============================================================================

@trust_bp.route('/passport/publish', methods=['POST'])
@login_required
def api_publish_passport():
    """NGO publishes their Capacity Passport (snapshot of current Trust Profile).

    Body:
      org_id      — required (must match current_user.org_id unless admin)
      expires_at  — optional ISO datetime
    """
    data = get_request_json()
    org_id = data.get('org_id')
    if not org_id:
        return jsonify({'error': 'org_id is required', 'success': False}), 400

    # NGOs can only publish their own passport
    if current_user.role == 'ngo' and current_user.org_id != org_id:
        return jsonify({'error': 'You can only publish a passport for your own organization', 'success': False}), 403
    # Only NGOs and admins publish
    if current_user.role not in ('ngo', 'admin'):
        return jsonify({'error': 'Only the NGO or an admin can publish a passport', 'success': False}), 403

    expires_at = None
    if data.get('expires_at'):
        try:
            expires_at = datetime.fromisoformat(str(data['expires_at']).replace('Z', '+00:00'))
        except Exception:
            return jsonify({'error': 'expires_at must be an ISO 8601 datetime', 'success': False}), 400

    passport = CapacityPassportService.publish(
        org_id=org_id, user=current_user, expires_at=expires_at
    )
    if not passport:
        return jsonify({'error': 'Could not publish passport', 'success': False}), 500

    return jsonify({
        'success': True,
        'passport': passport.to_dict(include_token=True),    # token only on publish response
    })


@trust_bp.route('/passport/<int:org_id>', methods=['GET'])
@login_required
def api_list_passports(org_id):
    """List all passports for an org (current_user's org or any if donor/admin)."""
    if current_user.role == 'ngo' and current_user.org_id != org_id:
        return jsonify({'error': 'Insufficient permissions', 'success': False}), 403

    passports = (
        CapacityPassport.query
        .filter_by(org_id=org_id)
        .order_by(CapacityPassport.created_at.desc())
        .all()
    )
    # Token returned only to publishing NGO + admin
    can_see_token = current_user.role in ('admin',) or (
        current_user.role == 'ngo' and current_user.org_id == org_id
    )
    return jsonify({
        'success': True,
        'org_id': org_id,
        'passports': [p.to_dict(include_token=can_see_token) for p in passports],
    })


@trust_bp.route('/passport/<int:passport_id>/revoke', methods=['POST'])
@login_required
def api_revoke_passport(passport_id):
    passport = db.session.get(CapacityPassport, passport_id)
    if not passport:
        return jsonify({'error': 'Passport not found', 'success': False}), 404
    if current_user.role == 'ngo' and current_user.org_id != passport.org_id:
        return jsonify({'error': 'Insufficient permissions', 'success': False}), 403
    if current_user.role not in ('ngo', 'admin'):
        return jsonify({'error': 'Insufficient permissions', 'success': False}), 403

    data = get_request_json() or {}
    reason = (data.get('reason') or '').strip() or None

    revoked = CapacityPassportService.revoke(
        passport_id=passport_id, user=current_user, reason=reason
    )
    return jsonify({
        'success': True,
        'passport': revoked.to_dict(include_token=False),
    })


@trust_bp.route('/passport/share/<slug>', methods=['GET'])
def api_share_passport(slug):
    """PUBLIC endpoint — read a published Capacity Passport by slug ONLY.

    Phase 98.4 (Wave 4) — extends Phase 77 trust-portable badge to a
    shareable, no-token public URL. Marketing/funder-facing surface so
    NGOs can put the link on their website + business card. Returns the
    snapshot data on the same shape as /api/passport/verify, minus the
    share token and minus the audit-trail bump (verification_count is
    not incremented for unauthenticated share reads, to avoid bot inflation).

    Revocation handling: if the passport's status is anything other than
    'active' (revoked / expired / draft), the endpoint returns 410 Gone
    with the reason. The frontend renders a clear "stale credential"
    state rather than the snapshot.
    """
    from app.models import CapacityPassport
    p = CapacityPassport.query.filter_by(slug=slug).first()
    if not p:
        return jsonify({'success': False, 'reason': 'not_found'}), 404
    if p.status == 'revoked':
        return jsonify({'success': False, 'reason': 'revoked'}), 410
    if p.expires_at and p.expires_at < datetime.now(timezone.utc):
        return jsonify({'success': False, 'reason': 'expired'}), 410
    if p.status != 'active':
        return jsonify({'success': False, 'reason': p.status}), 410

    snapshot = p.to_dict(include_token=False)
    # For the cryptographically-anchored verify URL we hand to the donor,
    # use the existing verify route — but the NGO does NOT share that link
    # publicly because the token in it is bearer-style.
    return jsonify({
        'success': True,
        'verified': False,  # NOT verified; just the published snapshot
        'public_share': True,
        'passport': snapshot,
        # Hint the frontend can use to surface a "Verify cryptographically"
        # CTA — the verify URL has the token only the NGO can produce.
        'verify_hint': 'Verify cryptographically via the link your NGO sent you (with ?t=<token>).',
    })


@trust_bp.route('/passport/verify/<slug>', methods=['GET'])
def api_verify_passport(slug):
    """PUBLIC endpoint — verify a Capacity Passport by slug + token.

    Token must be passed as a ?t=<token> query param. The endpoint is
    deliberately unauthenticated so a donor can verify with just the
    share URL the NGO sent them.
    """
    token = request.args.get('t', '')
    verifier_label = request.args.get('verifier', '')[:120]

    snapshot, reason = CapacityPassportService.verify(
        slug=slug, token=token, verifier_label=verifier_label or None
    )
    if not snapshot:
        return jsonify({
            'success': False,
            'verified': False,
            'reason': reason or 'unknown',
        }), 404 if reason == 'not_found' else 403

    return jsonify({
        'success': True,
        'verified': True,
        'passport': snapshot,
    })
