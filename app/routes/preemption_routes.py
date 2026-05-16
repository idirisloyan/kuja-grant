"""
Compliance pre-emption routes — Phase 3 + Phase 6 (high-severity notify).

Blueprint prefix: /api
Routes:
  GET /api/preemption/ngo/<org_id>     - NGO view: my active grants at risk
  GET /api/preemption/donor/<org_id>   - Donor view: grantees in my portfolio at risk
  GET /api/preemption/me               - Resolves to the right scope for the current user

Phase 6: when AI returns a HIGH-severity finding the current user hasn't
already been notified about this scan run, fire a notification through
their NotificationDispatcher channels (in-app + opt-in SMS/WhatsApp).
"""

import hashlib
import json
import logging

from flask import Blueprint, jsonify
from flask_login import login_required, current_user

from app.services.compliance_preemption_service import CompliancePreemptionService
from app.services.notification_dispatcher import NotificationDispatcher
from app.utils.cache import _dashboard_cache

logger = logging.getLogger('kuja')

preemption_bp = Blueprint('preemption', __name__, url_prefix='/api/preemption')


def _cached(cache_key: str, builder):
    cached = _dashboard_cache.get(cache_key)
    if cached is not None:
        return cached
    out = builder()
    _dashboard_cache.set(cache_key, out)
    return out


# Phase 6 — de-dupe key per (user, finding) so refreshing the page doesn't
# spam SMS/in-app every time. We store the set of fired keys in the
# dashboard cache (24h TTL — long enough that the same finding doesn't
# fire twice on the same day; short enough that recurrence eventually
# re-fires if the situation isn't fixed).
def _notify_high_severity_once(user_id: int, scope: str, findings: list[dict]) -> int:
    """Fire notifications for HIGH-severity findings the user hasn't seen
    via push before in this 24h window. Returns count fired."""
    if not findings:
        return 0
    fired_key = f'preempt_notif_fired:{user_id}'
    already = set(_dashboard_cache.get(fired_key) or [])
    new_keys = []
    fired = 0
    for f in findings:
        if (f.get('severity') or '').lower() != 'high':
            continue
        # Stable fingerprint per finding so re-runs of the same situation don't double-notify.
        sig = hashlib.sha256(json.dumps({
            'grant_id': f.get('grant_id'),
            'org_id': f.get('org_id'),
            'deliverable': f.get('deliverable'),
        }, sort_keys=True).encode()).hexdigest()[:16]
        key = f'{scope}:{sig}'
        if key in already:
            continue
        try:
            NotificationDispatcher.dispatch(
                user_id=user_id,
                category='compliance',
                title=f'Pre-emption: {f.get("deliverable", "deliverable")} likely to slip',
                body=(
                    f'{f.get("org_name", "An org")} — {f.get("reason", "")[:200]} '
                    f'(confidence {f.get("confidence", 0)}/100). '
                    f'Suggested: {f.get("recommended_action", "")[:160]}'
                ),
                deep_link_url='/dashboard',
                related_kind='preemption_finding',
            )
            new_keys.append(key)
            fired += 1
        except Exception as e:
            logger.warning(f"preemption notify failed for user={user_id}: {e}")
    if new_keys:
        merged = list(already | set(new_keys))[-200:]   # cap to avoid unbounded growth
        _dashboard_cache.set(fired_key, merged)
    return fired


@preemption_bp.route('/ngo/<int:org_id>', methods=['GET'])
@login_required
def api_preemption_ngo(org_id):
    """NGO scope. Donor + admin can also call this to inspect a grantee."""
    if current_user.role == 'ngo' and current_user.org_id != org_id:
        return jsonify({'success': False, 'error': 'Insufficient permissions'}), 403
    result = _cached(f'preemption_ngo_{org_id}',
                     lambda: CompliancePreemptionService.for_ngo(org_id))
    _notify_high_severity_once(current_user.id, f'ngo:{org_id}', result.get('findings', []))
    return jsonify({'success': True, **result})


@preemption_bp.route('/donor/<int:org_id>', methods=['GET'])
@login_required
def api_preemption_donor(org_id):
    """Donor scope. Only the donor org's users or admin."""
    if current_user.role == 'donor' and current_user.org_id != org_id:
        return jsonify({'success': False, 'error': 'Insufficient permissions'}), 403
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'success': False, 'error': 'Insufficient permissions'}), 403
    result = _cached(f'preemption_donor_{org_id}',
                     lambda: CompliancePreemptionService.for_donor(org_id))
    _notify_high_severity_once(current_user.id, f'donor:{org_id}', result.get('findings', []))
    return jsonify({'success': True, **result})


@preemption_bp.route('/me', methods=['GET'])
@login_required
def api_preemption_me():
    """Convenience: resolve to the right scope for the caller."""
    if current_user.role == 'ngo' and current_user.org_id:
        scope = f'ngo:{current_user.org_id}'
        result = _cached(f'preemption_ngo_{current_user.org_id}',
                         lambda: CompliancePreemptionService.for_ngo(current_user.org_id))
        _notify_high_severity_once(current_user.id, scope, result.get('findings', []))
    elif current_user.role == 'donor' and current_user.org_id:
        scope = f'donor:{current_user.org_id}'
        result = _cached(f'preemption_donor_{current_user.org_id}',
                         lambda: CompliancePreemptionService.for_donor(current_user.org_id))
        _notify_high_severity_once(current_user.id, scope, result.get('findings', []))
    elif current_user.role == 'admin':
        # Admin has no scope; return empty with note
        from datetime import datetime, timezone
        result = {
            'scope': 'admin',
            'computed_at': datetime.now(timezone.utc).isoformat(),
            'findings': [],
            'summary': 'Admin view: pick a specific org via /preemption/ngo/<id> or /preemption/donor/<id>.',
            'source': 'no_input',
        }
    else:
        return jsonify({'success': False, 'error': 'No scope for this user'}), 400

    return jsonify({'success': True, **result})
