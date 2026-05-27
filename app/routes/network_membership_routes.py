"""Network membership routes — Phase 33 (May 2026).

NGO-facing:
  POST   /api/network/membership/apply             — start a membership application
  POST   /api/network/membership/<id>/submit       — submit for OB review (pending → under_review)
  GET    /api/network/membership/me                — the caller's memberships across networks

OB / admin-facing:
  GET    /api/network/membership/pending           — list memberships under review
  GET    /api/network/membership/<id>              — full detail (org + answers + docs + assessment)
  POST   /api/network/membership/<id>/approve      — approve (under_review → active)
  POST   /api/network/membership/<id>/reject       — reject (under_review → rejected)
  POST   /api/network/membership/<id>/suspend      — suspend an active membership (admin)
  POST   /api/network/membership/<id>/expel        — terminal removal (admin)

Configuration:
  GET    /api/network/membership/config            — eligibility questions + required docs
                                                     for the current network (used to drive
                                                     the "Join network" form).

Every status-changing action triggers an AuditChainEntry via the model
state-machine methods (see network_membership.py).
"""

import logging
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from app.extensions import db
from app.models import (
    Network,
    NetworkMembership,
    MEMBERSHIP_TIERS,
    Organization,
    User,
)
from app.utils.network import get_current_network, get_current_network_id
from app.utils.helpers import get_request_json
from app.utils.decorators import role_required

logger = logging.getLogger("kuja")

network_membership_bp = Blueprint(
    "network_membership",
    __name__,
    url_prefix="/api/network/membership",
)


# =============================================================================
# CONFIG — drives the "Join network" form on the frontend
# =============================================================================

@network_membership_bp.route("/config", methods=["GET"])
def api_membership_config():
    """Public endpoint: returns the eligibility questionnaire + required-doc
    list for the *current* network (resolved from host header). Public so
    the join page can render before the user signs up."""
    net = get_current_network()
    if net is None:
        return jsonify({"success": False, "error": "network not resolved"}), 404
    return jsonify({
        "success": True,
        "network": {
            "id": net.id,
            "slug": net.slug,
            "name": net.name,
            "assessment_framework_display": net.assessment_framework_display,
        },
        "eligibility_questions": net.get_eligibility_questions(),
        "required_documents": net.get_required_documents(),
        "membership_review_days": net.membership_review_days,
    })


# =============================================================================
# NGO-facing — apply / submit / me
# =============================================================================

@network_membership_bp.route("/admin-create", methods=["POST"])
@role_required("admin")
def api_admin_create_membership():
    """Admin creates a NetworkMembership on behalf of an Organization.

    Use cases:
      - NGO has SLA/technical issue submitting; admin creates the record
      - Demo/seed data that needs to live under a specific tenant via
        the X-Network-Override header (which non-admins can't use)
      - Migrating in-flight applications during NEAR spin-off

    Body: { org_id, member_tier?, country?, region?, eligibility_answers? }

    Idempotent: returns existing membership if (network_id, org_id) already
    has any non-terminal row. Status starts at 'pending'.
    """
    network_id = get_current_network_id()
    if not network_id:
        return jsonify({"success": False, "error": "Network not resolved"}), 400

    body = get_request_json() or {}
    org_id = body.get("org_id")
    if not org_id:
        return jsonify({"success": False, "error": "org_id required"}), 400

    org = Organization.query.get(org_id)
    if not org:
        return jsonify({"success": False, "error": "Organization not found"}), 404

    tier = (body.get("member_tier") or "member").strip().lower()
    if tier not in MEMBERSHIP_TIERS:
        return jsonify({"success": False, "error": f"Invalid tier '{tier}'"}), 400

    # Idempotency: return existing non-terminal membership.
    existing = NetworkMembership.query.filter_by(
        network_id=network_id, org_id=org_id,
    ).first()
    if existing and existing.status in ("pending", "under_review", "active", "suspended"):
        return jsonify({
            "success": True,
            "membership": existing.to_dict(),
            "already_existed": True,
        })

    m = existing or NetworkMembership(
        network_id=network_id, org_id=org_id, status="pending",
    )
    m.member_tier = tier
    m.status = "pending"
    m.status_reason = None
    m.country = (body.get("country") or "").strip() or m.country
    m.region = (body.get("region") or "").strip() or m.region
    m.set_eligibility_answers(body.get("eligibility_answers") or {})
    m.applied_at = datetime.now(timezone.utc)
    if not existing:
        db.session.add(m)
    db.session.commit()

    try:
        from app.models import AuditChainEntry
        AuditChainEntry.append(
            action="network.membership.admin_created",
            actor_email=current_user.email,
            subject_kind="network_membership",
            subject_id=m.id,
            details={
                "network_id": network_id, "org_id": org_id, "tier": tier,
                "on_behalf": True,
            },
        )
    except Exception:
        pass

    return jsonify({"success": True, "membership": m.to_dict()})


@network_membership_bp.route("/apply", methods=["POST"])
@login_required
def api_apply_for_membership():
    """Start a membership application. NGO role only.

    Body: { eligibility_answers: {...}, member_tier?, region?, country? }

    Idempotent: if the caller's org already has a *non-terminal* membership
    in this network (pending / under_review / active / suspended), returns
    the existing row instead of creating a duplicate.
    """
    if current_user.role != "ngo":
        return jsonify({"success": False, "error": "Only NGO accounts can apply"}), 403
    if not current_user.org_id:
        return jsonify({"success": False, "error": "Your account is not linked to an organisation"}), 400

    network_id = get_current_network_id()
    if not network_id:
        return jsonify({"success": False, "error": "Network not resolved from host"}), 400

    body = get_request_json() or {}
    tier = (body.get("member_tier") or "member").strip().lower()
    if tier not in MEMBERSHIP_TIERS:
        return jsonify({"success": False, "error": f"Invalid tier '{tier}'"}), 400

    # Reapplication guard: if there's a rejected row with an active cooldown,
    # surface the cooldown date.
    existing = NetworkMembership.query.filter_by(
        network_id=network_id, org_id=current_user.org_id,
    ).first()
    if existing:
        if existing.status in ("pending", "under_review", "active", "suspended"):
            return jsonify({
                "success": True,
                "membership": existing.to_dict(),
                "already_existed": True,
            })
        if existing.status == "rejected" and existing.cooldown_until:
            now = datetime.now(timezone.utc)
            if now < existing.cooldown_until:
                return jsonify({
                    "success": False,
                    "error": "In rejection cooldown",
                    "cooldown_until": existing.cooldown_until.isoformat(),
                }), 409
        # Otherwise (expelled, or rejected past cooldown) we recycle the row.
        m = existing
        m.status = "pending"
        m.member_tier = tier
        m.status_reason = None
    else:
        m = NetworkMembership(
            network_id=network_id,
            org_id=current_user.org_id,
            status="pending",
            member_tier=tier,
        )
        db.session.add(m)

    m.set_eligibility_answers(body.get("eligibility_answers") or {})
    m.region = (body.get("region") or "").strip() or None
    m.country = (body.get("country") or "").strip() or None
    m.applied_at = datetime.now(timezone.utc)

    db.session.commit()

    # Audit anchor for the application itself (not a status transition).
    try:
        from app.models import AuditChainEntry
        AuditChainEntry.append(
            action="network.membership.applied",
            actor_email=current_user.email,
            subject_kind="network_membership",
            subject_id=m.id,
            details={"network_id": network_id, "org_id": current_user.org_id, "tier": tier},
        )
    except Exception:
        pass

    return jsonify({"success": True, "membership": m.to_dict()})


@network_membership_bp.route("/<int:membership_id>/submit", methods=["POST"])
@login_required
def api_submit_for_review(membership_id):
    """Submit a pending application for OB review. NGO role; must own the org."""
    if current_user.role != "ngo":
        return jsonify({"success": False, "error": "Only NGOs can submit applications"}), 403
    m = NetworkMembership.query.get_or_404(membership_id)
    if m.org_id != current_user.org_id:
        return jsonify({"success": False, "error": "Not your application"}), 403

    # Server-side completeness check: every required eligibility question
    # must have an affirmative answer before we accept submission.
    net = Network.query.get(m.network_id)
    if net is None:
        return jsonify({"success": False, "error": "Network not found"}), 404
    answers = m.get_eligibility_answers()
    missing = [
        q["key"] for q in net.get_eligibility_questions()
        if q.get("required") and str(answers.get(q["key"], "")).lower() not in ("yes", "true", "1")
    ]
    if missing:
        return jsonify({
            "success": False,
            "error": "Eligibility questions incomplete",
            "missing_question_keys": missing,
        }), 400

    # Capacity assessment must be linked + completed (mandatory gate).
    if not m.capacity_assessment_id:
        return jsonify({
            "success": False,
            "error": "Capacity assessment is required before submitting",
        }), 400

    if not m.submit_for_review(actor_email=current_user.email):
        return jsonify({
            "success": False,
            "error": f"Cannot submit from status '{m.status}'",
        }), 400

    db.session.commit()
    return jsonify({"success": True, "membership": m.to_dict()})


@network_membership_bp.route("/me", methods=["GET"])
@login_required
def api_my_memberships():
    """Return all memberships for the caller's org. Useful for NGO dashboard."""
    if not current_user.org_id:
        return jsonify({"success": True, "memberships": []})
    rows = (
        NetworkMembership.query
        .filter_by(org_id=current_user.org_id)
        .order_by(NetworkMembership.created_at.desc())
        .all()
    )
    return jsonify({
        "success": True,
        "memberships": [m.to_dict() for m in rows],
    })


# =============================================================================
# OB / admin-facing — list / detail / approve / reject / suspend / expel
# =============================================================================

def _is_ob_or_admin() -> bool:
    """Oversight Body member or platform admin can review memberships."""
    if current_user.role == "admin":
        return True
    # Phase 33 — until per-network roles ship in Phase 38, treat any
    # platform-level admin as authorised. Network-scoped OB roles will
    # tighten this when User.network_role JSON lands.
    return False


@network_membership_bp.route("/pending", methods=["GET"])
@role_required("admin")  # tightened in Phase 38 to OB members per network
def api_list_pending_memberships():
    """List memberships awaiting OB decision in the current network.

    Query params:
      status — filter by status (default: 'under_review'). Use 'all' for everything.
    """
    network_id = get_current_network_id()
    if not network_id:
        return jsonify({"success": False, "error": "Network not resolved"}), 400

    status_filter = (request.args.get("status") or "under_review").strip().lower()
    q = NetworkMembership.query.filter_by(network_id=network_id)
    if status_filter != "all":
        q = q.filter_by(status=status_filter)
    rows = q.order_by(NetworkMembership.applied_at.asc().nullslast()).all()

    # Enrich with org name for the list view.
    out = []
    for m in rows:
        d = m.to_dict()
        org = Organization.query.get(m.org_id)
        d["org_name"] = org.name if org else None
        out.append(d)
    return jsonify({"success": True, "memberships": out})


@network_membership_bp.route("/<int:membership_id>", methods=["GET"])
@login_required
def api_get_membership(membership_id):
    """Detail view. NGO sees own; admin/OB sees any in the current network."""
    m = NetworkMembership.query.get_or_404(membership_id)

    is_own = current_user.org_id == m.org_id
    is_admin = current_user.role == "admin"
    if not (is_own or is_admin):
        return jsonify({"success": False, "error": "Not authorised"}), 403

    d = m.to_dict()
    org = Organization.query.get(m.org_id)
    d["org"] = (
        {"id": org.id, "name": org.name, "country": getattr(org, "country", None)}
        if org else None
    )
    reviewer = (
        User.query.get(m.reviewed_by_user_id) if m.reviewed_by_user_id else None
    )
    d["reviewer"] = (
        {"id": reviewer.id, "name": reviewer.name, "email": reviewer.email}
        if reviewer else None
    )
    return jsonify({"success": True, "membership": d})


@network_membership_bp.route("/<int:membership_id>/approve", methods=["POST"])
@role_required("admin")
def api_approve_membership(membership_id):
    m = NetworkMembership.query.get_or_404(membership_id)
    # Scope-check: admin must be acting within the network that owns this row.
    network_id = get_current_network_id()
    if network_id and m.network_id != network_id:
        return jsonify({"success": False, "error": "Wrong network context"}), 403

    if not m.approve(by_user_id=current_user.id, actor_email=current_user.email):
        return jsonify({
            "success": False,
            "error": f"Cannot approve from status '{m.status}'",
        }), 400
    db.session.commit()
    return jsonify({"success": True, "membership": m.to_dict()})


@network_membership_bp.route("/<int:membership_id>/reject", methods=["POST"])
@role_required("admin")
def api_reject_membership(membership_id):
    m = NetworkMembership.query.get_or_404(membership_id)
    body = get_request_json() or {}
    reason = (body.get("reason") or "").strip()
    if not reason:
        return jsonify({"success": False, "error": "Reason is required"}), 400

    network_id = get_current_network_id()
    if network_id and m.network_id != network_id:
        return jsonify({"success": False, "error": "Wrong network context"}), 403

    cooldown_months = int(body.get("cooldown_months") or 6)
    if not m.reject(
        by_user_id=current_user.id,
        reason=reason,
        actor_email=current_user.email,
        cooldown_months=cooldown_months,
    ):
        return jsonify({
            "success": False,
            "error": f"Cannot reject from status '{m.status}'",
        }), 400
    db.session.commit()
    return jsonify({"success": True, "membership": m.to_dict()})


@network_membership_bp.route("/<int:membership_id>/suspend", methods=["POST"])
@role_required("admin")
def api_suspend_membership(membership_id):
    m = NetworkMembership.query.get_or_404(membership_id)
    body = get_request_json() or {}
    reason = (body.get("reason") or "").strip()
    if not reason:
        return jsonify({"success": False, "error": "Reason is required"}), 400

    if not m.suspend(
        by_user_id=current_user.id,
        reason=reason,
        actor_email=current_user.email,
    ):
        return jsonify({
            "success": False,
            "error": f"Cannot suspend from status '{m.status}'",
        }), 400
    db.session.commit()
    return jsonify({"success": True, "membership": m.to_dict()})


@network_membership_bp.route("/<int:membership_id>/expel", methods=["POST"])
@role_required("admin")
def api_expel_membership(membership_id):
    m = NetworkMembership.query.get_or_404(membership_id)
    body = get_request_json() or {}
    reason = (body.get("reason") or "").strip()
    if not reason:
        return jsonify({"success": False, "error": "Reason is required"}), 400

    if not m.expel(
        by_user_id=current_user.id,
        reason=reason,
        actor_email=current_user.email,
    ):
        return jsonify({
            "success": False,
            "error": f"Cannot expel from status '{m.status}'",
        }), 400
    db.session.commit()
    return jsonify({"success": True, "membership": m.to_dict()})
