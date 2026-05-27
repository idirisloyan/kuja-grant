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
