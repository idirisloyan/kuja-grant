"""Network context helpers — Phase 32 (May 2026).

Tiny shim around flask.g so callers don't import flask.g directly
when they want the current network. Also exposes a safe getter that
falls back to the default network if the middleware hasn't resolved
one yet (defensive against test setups + early boot).
"""

from flask import g, has_request_context


def get_current_network():
    """Return the resolved Network for the current request, or the
    default network if the middleware hasn't attached one. Returns
    None only if there's no request context AND no default exists."""
    if has_request_context():
        net = getattr(g, "network", None)
        if net is not None:
            return net

    # Fallback: load the default network. Cheap because the row is tiny
    # and SQLAlchemy will hit the identity map after the first call
    # in a request.
    try:
        from app.models import Network
        return Network.get_default()
    except Exception:
        return None


def get_current_network_id() -> int | None:
    """Return the id of the current network, or None."""
    if has_request_context():
        nid = getattr(g, "network_id", None)
        if nid is not None:
            return nid
    net = get_current_network()
    return net.id if net else None


# ---------------------------------------------------------------------------
# Phase 44 — Oversight Body permission helpers
# ---------------------------------------------------------------------------

def is_oversight_body_member(user, *, network_id: int | None = None) -> bool:
    """Return True if the user belongs to an org that holds an active
    Oversight Body seat in the given network (defaults to current).

    OB members are peer-elected from NEAR member orgs per the IKEA
    Concept Note — so the permission is granted at the org level on
    the user's NetworkMembership. Platform admins (the Adeso staff
    who run Kuja) are still recognised here so existing admin flows
    keep working during the rollout; once every actual OB member is
    flagged the admin shortcut can be retired.
    """
    if not user:
        return False
    # Platform admin keeps the legacy shortcut so we don't break in-flight
    # OB workflows while the per-network OB roster is being populated.
    if getattr(user, "role", None) == "admin":
        return True
    nid = network_id or get_current_network_id()
    if not nid or not getattr(user, "org_id", None):
        return False
    try:
        from app.models import NetworkMembership
    except Exception:
        return False
    m = (
        NetworkMembership.query
        .filter_by(network_id=nid, org_id=user.org_id, status="active")
        .first()
    )
    return bool(m and getattr(m, "is_oversight_body", False))


def ob_required(fn):
    """Flask decorator: 403 unless the caller has OB permissions in
    the current network. Use on declaration sign / approve, membership
    approve, run-trust-process — anything that the Concept Note says
    the OB does.
    """
    from functools import wraps
    from flask import jsonify
    from flask_login import current_user

    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not getattr(current_user, "is_authenticated", False):
            return jsonify({"success": False, "error": "Authentication required"}), 401
        if not is_oversight_body_member(current_user):
            return jsonify({
                "success": False,
                "error": "Oversight Body permission required",
                "code": "err.ob_required",
            }), 403
        return fn(*args, **kwargs)

    return wrapper
