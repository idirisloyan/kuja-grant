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


def is_current_network_default() -> bool:
    """True when the current request is in the default (Kuja marketplace)
    network. Marketplace grants have `fund_window_id IS NULL`; NEAR-style
    closed networks always go through `Fund → FundWindow → Grant`.
    Knowing which side we're on is what lets the tenant filter return the
    right slice of cross-network data without two divergent query paths.
    """
    net = get_current_network()
    return bool(net and getattr(net, "is_default", False))


# ---------------------------------------------------------------------------
# Phase 99 — tenant-scoped query helpers (2026-06-13)
# ---------------------------------------------------------------------------
# Code-review verdict found that a NEAR member's dashboard surfaced their
# Kuja marketplace drafts + grants + reports. The leak was that
# `/api/applications`, `/api/grants`, and `/api/reports/upcoming`
# filtered by role but not by current network. Adding the filter at the
# query layer (not the route) keeps the tenant boundary in one place and
# means every caller of these list endpoints gets it for free.
#
# Marketplace ↔ NEAR taxonomy:
#   • A Grant belongs to the marketplace iff `fund_window_id IS NULL`.
#   • Otherwise it joins through FundWindow → Fund.network_id.
#   • Applications + Reports inherit their network from the Grant they
#     reference (Application.grant_id → Grant → ...).


def _current_network_grant_id_subquery():
    """Subquery of `Grant.id`s belonging to the current network.

    Returns None if no network is resolvable (rare — admin-only / boot).
    Using a subquery keeps callers free to add their own joins on Grant
    without colliding with the tenant filter.
    """
    from app.extensions import db
    from app.models import Grant, FundWindow, Fund
    if is_current_network_default():
        return db.session.query(Grant.id).filter(Grant.fund_window_id.is_(None)).subquery()
    nid = get_current_network_id()
    if nid is None:
        return None
    return (
        db.session.query(Grant.id)
        .join(FundWindow, Grant.fund_window_id == FundWindow.id)
        .join(Fund, FundWindow.fund_id == Fund.id)
        .filter(Fund.network_id == nid)
        .subquery()
    )


def scope_grant_query(query):
    """Filter a Grant query down to the current network.

    For the default Kuja marketplace network, that means grants without a
    fund_window assignment. For any other network (e.g. NEAR), uses the
    subquery so callers' own joins are unaffected.
    """
    from app.models import Grant
    sub = _current_network_grant_id_subquery()
    if sub is None:
        return query  # No resolvable network — fail open.
    return query.filter(Grant.id.in_(sub))


def scope_application_query(query):
    """Same shape as scope_grant_query, applied through Application.grant_id.

    Uses the subquery so callers that already joined Grant (e.g. the
    donor branch of /api/applications) don't end up with a duplicate
    join or a Cartesian product.
    """
    from app.models import Application
    sub = _current_network_grant_id_subquery()
    if sub is None:
        return query
    return query.filter(Application.grant_id.in_(sub))


def scope_report_query(query):
    """Filter a Report query to the current network via Report.grant_id."""
    from app.models import Report
    sub = _current_network_grant_id_subquery()
    if sub is None:
        return query
    return query.filter(Report.grant_id.in_(sub))


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
