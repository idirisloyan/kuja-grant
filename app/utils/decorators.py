"""
Kuja Grant Management System - Route Decorators
=================================================
Extracted from server.py lines 890-900.
Access-control decorators for API route handlers.
"""

import os

from functools import wraps
from flask import jsonify
from flask_login import login_required, current_user


def role_required(*roles):
    """Decorator that restricts access to users with specific roles."""
    def decorator(f):
        @wraps(f)
        @login_required
        def decorated_function(*args, **kwargs):
            if current_user.role not in roles:
                return jsonify({'error': 'Insufficient permissions', 'success': False}), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator


def can_view_org_dd(org_id):
    """Access scope for an org's due-diligence / trust surfaces (SMK-006).

    NGO -> its OWN org only; donor / reviewer / admin -> any org (they assess
    NGOs for funding); any unknown role -> deny (fail closed). Without this, any
    authenticated NGO could harvest every other org's sanctions, adverse-media,
    bank-verification, compliance and registration data by iterating org ids.
    Callers return 403 when this is False.
    """
    role = getattr(current_user, 'role', None)
    if role in ('donor', 'reviewer', 'admin'):
        return True
    if role == 'ngo':
        return getattr(current_user, 'org_id', None) == org_id
    return False


# ---------------------------------------------------------------------------
# Kuja Platform licensing gate (Phase 2)
# ---------------------------------------------------------------------------
# Donor "publish & award" powers may require an active grant licence on the
# donor's organisation. The grant app is the source of record for the licence
# flag; enforcement is switched on separately via GRANT_LICENSING_ENFORCED so
# licences can be provisioned on prod BEFORE the gate goes live (mirrors the
# KUJA_TRUST_ENGINE rollout). NGO capabilities never consult this.

def licensing_enforced() -> bool:
    """Whether donor grant-licensing is actively enforced.

    OFF by default: while off, ``donor_publish_allowed`` behaves exactly like
    the old role gate (no behaviour change on prod). Flip
    ``GRANT_LICENSING_ENFORCED=true`` to turn enforcement on without a redeploy.
    """
    return os.getenv('GRANT_LICENSING_ENFORCED', 'false').strip().lower() in (
        '1', 'true', 'yes', 'on',
    )


def donor_publish_allowed(user) -> bool:
    """May this user perform licensed donor actions (publish a call, award)?

    - Platform admins: always.
    - Donors: allowed unless enforcement is ON and their org lacks an active
      licence (deny-by-default under enforcement).
    - Any other role: never (fail closed). Callers are expected to have already
      role-gated; this is defence in depth.
    """
    role = getattr(user, 'role', None)
    if role == 'admin':
        return True
    if role == 'donor':
        if not licensing_enforced():
            return True
        org = getattr(user, 'organization', None)
        return bool(org is not None and org.is_grant_licensed())
    return False


def grant_license_required(f):
    """Gate a donor publish/award endpoint on an active grant licence.

    Drop-in replacement for ``role_required('donor', 'admin')`` on licensed
    actions. Identical behaviour while GRANT_LICENSING_ENFORCED is off; when on,
    unlicensed donors receive a 403 with ``error='license_required'`` so the UI
    can surface an upgrade path. NEVER apply to NGO capabilities.
    """
    @wraps(f)
    @login_required
    def decorated_function(*args, **kwargs):
        role = getattr(current_user, 'role', None)
        if role not in ('donor', 'admin'):
            return jsonify({'error': 'Insufficient permissions', 'success': False}), 403
        if not donor_publish_allowed(current_user):
            return jsonify({
                'success': False,
                'error': 'license_required',
                'message': ('Publishing and awarding grants requires an active '
                            'Kuja Grant licence for your organisation.'),
            }), 403
        return f(*args, **kwargs)
    return decorated_function
