"""
Phase 11 routes — grant agreement unpack + cross-grant patterns.

Blueprint prefix: /api
Routes:
  POST /api/grants/<id>/unpack-agreement   - unpack signed agreement PDF
  GET  /api/patterns/me                    - cross-grant patterns for caller
  GET  /api/patterns/ngo/<org_id>          - NGO scope (admin override)
  GET  /api/patterns/donor/<org_id>        - donor scope (admin override)
"""

import logging

from flask import Blueprint, jsonify
from flask_login import login_required, current_user

from app.extensions import db
from app.models import Grant
from app.services.grant_agreement_unpack_service import GrantAgreementUnpackService
from app.services.cross_grant_patterns_service import CrossGrantPatternsService
from app.services.apply_unpack_service import ApplyUnpackService
from app.utils.cache import _dashboard_cache
from app.utils.helpers import get_request_json
from app.utils.decorators import role_required

logger = logging.getLogger('kuja')

phase11_bp = Blueprint('phase11', __name__, url_prefix='/api')


@phase11_bp.route('/grants/<int:grant_id>/unpack-agreement', methods=['POST'])
@login_required
def api_unpack_agreement(grant_id):
    """Run grant-agreement smart unpack. Returns the structured spec.

    Body: { document_id?: int }  (optional; if omitted, falls back to
                                   the grant's reporting_requirements)

    Visibility:
      - donor: grant must be theirs
      - ngo:   org must have an awarded application on this grant
      - admin: anyone
    """
    grant = db.session.get(Grant, grant_id)
    if not grant:
        return jsonify({'success': False, 'error': 'Grant not found'}), 404

    role = current_user.role
    org_id = current_user.org_id
    if role == 'donor':
        if grant.donor_org_id != org_id:
            return jsonify({'success': False, 'error': 'Insufficient permissions'}), 403
    elif role == 'ngo':
        from app.models import Application
        has_app = Application.query.filter_by(
            grant_id=grant.id, ngo_org_id=org_id,
        ).first() is not None
        if not has_app:
            return jsonify({'success': False, 'error': 'No application on this grant'}), 403
    elif role not in ('admin', 'reviewer'):
        return jsonify({'success': False, 'error': 'Insufficient permissions'}), 403

    data = get_request_json() or {}
    document_id = data.get('document_id')

    cache_key = f'grant_unpack_{grant_id}_{document_id or "none"}'
    cached = _dashboard_cache.get(cache_key)
    if cached is not None:
        return jsonify({'success': True, 'cached': True, **cached})

    result = GrantAgreementUnpackService.unpack(grant_id=grant_id, document_id=document_id)
    if not result:
        return jsonify({'success': False, 'error': 'Unpack could not run'}), 500
    _dashboard_cache.set(cache_key, result)
    return jsonify({'success': True, **result})


@phase11_bp.route('/patterns/me', methods=['GET'])
@login_required
def api_patterns_me():
    """Resolve to NGO or donor scope based on caller."""
    if current_user.role == 'ngo' and current_user.org_id:
        return _cached_patterns(f'patterns_ngo_{current_user.org_id}',
                                lambda: CrossGrantPatternsService.for_ngo(current_user.org_id))
    if current_user.role == 'donor' and current_user.org_id:
        return _cached_patterns(f'patterns_donor_{current_user.org_id}',
                                lambda: CrossGrantPatternsService.for_donor(current_user.org_id))
    if current_user.role == 'admin':
        # Admin /me returns empty — they should pick a specific scope
        from datetime import datetime, timezone
        return jsonify({'success': True,
                        'scope': 'admin',
                        'source': 'no_data',
                        'patterns': [], 'top_3_actions': [],
                        'summary': 'Admin view: hit /patterns/ngo/<id> or /patterns/donor/<id> for a specific org.',
                        'computed_at': datetime.now(timezone.utc).isoformat()})
    return jsonify({'success': False, 'error': 'No scope for this user'}), 400


@phase11_bp.route('/patterns/ngo/<int:org_id>', methods=['GET'])
@login_required
def api_patterns_ngo(org_id):
    if current_user.role == 'ngo' and current_user.org_id != org_id:
        return jsonify({'success': False, 'error': 'Insufficient permissions'}), 403
    if current_user.role not in ('ngo', 'admin'):
        return jsonify({'success': False, 'error': 'Insufficient permissions'}), 403
    return _cached_patterns(f'patterns_ngo_{org_id}',
                            lambda: CrossGrantPatternsService.for_ngo(org_id))


@phase11_bp.route('/patterns/donor/<int:org_id>', methods=['GET'])
@login_required
def api_patterns_donor(org_id):
    if current_user.role == 'donor' and current_user.org_id != org_id:
        return jsonify({'success': False, 'error': 'Insufficient permissions'}), 403
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'success': False, 'error': 'Insufficient permissions'}), 403
    return _cached_patterns(f'patterns_donor_{org_id}',
                            lambda: CrossGrantPatternsService.for_donor(org_id))


def _cached_patterns(cache_key: str, builder):
    cached = _dashboard_cache.get(cache_key)
    if cached is not None:
        return jsonify({'success': True, 'cached': True, **cached})
    result = builder()
    if result is None:
        return jsonify({'success': False, 'error': 'Could not compute patterns'}), 500
    _dashboard_cache.set(cache_key, result)
    # Phase 12 — fire notifications for HIGH-severity weakness patterns
    # (7-day per-(user, pattern_title) dedupe so re-running the scan
    # doesn't re-notify).
    try:
        _notify_high_severity_patterns(result)
    except Exception as e:
        logger.debug(f"pattern notification skipped: {e}")
    return jsonify({'success': True, **result})


def _notify_high_severity_patterns(result: dict) -> None:
    """If any pattern is category='weakness' AND severity='high', fire one
    notification per pattern through NotificationDispatcher with a 7-day
    per-(user, pattern_title) dedupe key."""
    if not getattr(current_user, 'is_authenticated', False):
        return
    patterns = result.get('patterns') or []
    if not patterns:
        return
    high_weaknesses = [
        p for p in patterns
        if (p.get('category') == 'weakness' and p.get('severity') == 'high')
    ]
    if not high_weaknesses:
        return

    import hashlib
    fired_key = f'pattern_notif_fired:{current_user.id}'
    already = set(_dashboard_cache.get(fired_key) or [])

    try:
        from app.services.notification_dispatcher import NotificationDispatcher
    except Exception:
        return

    new_keys = []
    for p in high_weaknesses[:5]:   # cap so we never spam
        title = (p.get('title') or '').strip()[:200]
        if not title:
            continue
        sig = hashlib.sha256(title.encode('utf-8')).hexdigest()[:16]
        if sig in already:
            continue
        try:
            NotificationDispatcher.dispatch(
                user_id=current_user.id,
                category='compliance',
                title=f'High-severity portfolio pattern: {title}',
                body=(
                    (p.get('fix') or '')[:300]
                    + (
                        ' · Evidence: ' + '; '.join((p.get('evidence') or [])[:2])[:200]
                        if p.get('evidence') else ''
                    )
                ),
                deep_link_url='/dashboard',
                related_kind='cross_grant_pattern',
            )
            new_keys.append(sig)
        except Exception as e:
            logger.debug(f"pattern dispatch failed: {e}")

    if new_keys:
        merged = list(already | set(new_keys))[-200:]
        _dashboard_cache.set(fired_key, merged)


# =========================================================================
# Phase 12 — apply the structured unpack to live entities
# =========================================================================

@phase11_bp.route('/grants/<int:grant_id>/apply-unpack', methods=['POST'])
@login_required
def api_apply_unpack(grant_id):
    """Turn the unpacked agreement into Report stubs + StatusSignal rows.

    Body: {
      document_id?: int,             # passed through to unpack call
      include_reports?: bool=True,
      include_conditions?: bool=True,
      org_id?: int                   # admin only; otherwise inferred
    }
    """
    grant = db.session.get(Grant, grant_id)
    if not grant:
        return jsonify({'success': False, 'error': 'Grant not found'}), 404

    role = current_user.role
    org_id = current_user.org_id

    # Visibility check (mirrors unpack route)
    if role == 'donor':
        if grant.donor_org_id != org_id:
            return jsonify({'success': False, 'error': 'Insufficient permissions'}), 403
    elif role == 'ngo':
        from app.models import Application
        has_app = Application.query.filter_by(
            grant_id=grant.id, ngo_org_id=org_id,
        ).first() is not None
        if not has_app:
            return jsonify({'success': False, 'error': 'No application on this grant'}), 403
    elif role not in ('admin',):
        return jsonify({'success': False, 'error': 'Insufficient permissions'}), 403

    data = get_request_json() or {}
    document_id = data.get('document_id')
    include_reports = data.get('include_reports', True)
    include_conditions = data.get('include_conditions', True)
    requested_org_id = data.get('org_id') if role == 'admin' else None

    # Get the unpack (from cache if available)
    cache_key = f'grant_unpack_{grant_id}_{document_id or "none"}'
    unpack = _dashboard_cache.get(cache_key)
    if unpack is None:
        unpack = GrantAgreementUnpackService.unpack(
            grant_id=grant_id, document_id=document_id,
        )
        if unpack:
            _dashboard_cache.set(cache_key, unpack)
    if not unpack or unpack.get('source') == 'unavailable':
        return jsonify({'success': False, 'error': 'Unpack not available; cannot apply'}), 400

    target_org = requested_org_id if role == 'admin' else (org_id if role == 'ngo' else None)

    result = ApplyUnpackService.apply(
        grant_id=grant_id,
        org_id=target_org,
        unpack=unpack,
        user=current_user,
        include_reports=bool(include_reports),
        include_conditions=bool(include_conditions),
    )

    return jsonify({'success': True, **result})


