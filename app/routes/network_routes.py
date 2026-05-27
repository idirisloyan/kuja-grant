"""Network routes — Phase 32 (May 2026).

GET  /api/network/current           — the resolved Network for this request
                                      (used by the frontend to swap brand
                                      colour, logo, name on first paint).
GET  /api/network/                  — admin-only list of all networks
                                      (operator surface for switching context).

Phase 33+ will add membership endpoints (apply, list, review, decision).
"""

import logging

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from app.utils.network import get_current_network
from app.utils.helpers import get_request_json
from app.utils.decorators import role_required

logger = logging.getLogger("kuja")

network_bp = Blueprint("network", __name__, url_prefix="/api/network")


@network_bp.route("/current", methods=["GET"])
def api_network_current():
    """Return brand + config for the current network.

    NOT login-required: the frontend needs this on first paint, before
    the user has signed in, so the login page can be themed correctly.
    The data returned is non-sensitive (name, slug, colours, currency).
    """
    net = get_current_network()
    if net is None:
        # Pathological case: networks table empty. Return a minimal
        # default so the frontend can still render.
        return jsonify({
            "success": True,
            "network": {
                "id": None,
                "slug": "kuja",
                "name": "Kuja Marketplace",
                "brand_color_hex": "#C2410C",
                "default_language": "en",
                "default_currency": "USD",
                "is_default": True,
                "is_active": True,
                "assessment_framework_display": "Kuja Capacity Assessment",
                "features": {},
            },
        })
    return jsonify({"success": True, "network": net.to_dict()})


@network_bp.route("/", methods=["GET"])
@login_required
def api_network_list():
    """Admin-only list of every network the operator can switch into.

    Non-admin users get back only the currently-resolved network in
    a single-item list, so the frontend can use one endpoint shape.
    """
    if getattr(current_user, "role", None) != "admin":
        net = get_current_network()
        return jsonify({
            "success": True,
            "networks": [net.to_dict()] if net else [],
        })

    from app.models import Network
    rows = (
        Network.query.filter_by(is_active=True)
        .order_by(Network.is_default.desc(), Network.name.asc())
        .all()
    )
    return jsonify({
        "success": True,
        "networks": [n.to_dict(include_governance=True) for n in rows],
    })


@network_bp.route("/<int:network_id>/host-aliases", methods=["PUT"])
@role_required("admin")
def api_update_host_aliases(network_id):
    """Admin: update host_aliases for a network. Used by ops to wire a new
    Railway-style URL or custom subdomain to a tenant without redeploying.

    Body: { host_aliases: [str, str, ...] }   — REPLACES the existing list

    Audit-anchored. Idempotent if value is unchanged.
    """
    from app.extensions import db
    from app.models import Network
    net = Network.query.get_or_404(network_id)

    body = get_request_json() or {}
    aliases = body.get("host_aliases")
    if not isinstance(aliases, list):
        return jsonify({"success": False, "error": "host_aliases must be a list"}), 400
    cleaned = [str(a).strip().lower() for a in aliases if str(a).strip()]

    old = net.get_host_aliases()
    net.set_host_aliases(cleaned)
    db.session.commit()

    try:
        from app.models import AuditChainEntry
        AuditChainEntry.append(
            action="network.host_aliases.updated",
            actor_email=current_user.email,
            subject_kind="network",
            subject_id=net.id,
            details={"old": old, "new": cleaned},
        )
    except Exception:
        pass

    return jsonify({
        "success": True,
        "network_id": net.id,
        "host_aliases": net.get_host_aliases(),
    })
