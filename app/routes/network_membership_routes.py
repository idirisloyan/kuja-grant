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
from app.services.email_service import EmailService
from app.utils.network import get_current_network, get_current_network_id, ob_required
from app.utils.helpers import get_request_json
from app.utils.decorators import role_required

logger = logging.getLogger("kuja")


def _notify_membership_decision(membership, *, decision: str, reason: str | None = None):
    """Send email to all NGO admins at the applicant org when the OB makes
    a final decision. Best-effort; swallows transport errors so the API
    response isn't held up by mail problems.

    decision: 'approved' or 'rejected'.
    """
    try:
        net = Network.query.get(membership.network_id)
        net_name = net.name if net else "the network"
        recipients = (
            User.query
            .filter_by(org_id=membership.org_id, role="ngo")
            .all()
        )
        if not recipients:
            logger.info(
                "membership.notify: no ngo users at org=%s (skipping)",
                membership.org_id,
            )
            return
        if decision == "approved":
            subject = f"Welcome — {net_name} membership approved"
            body = (
                f"Your application to join {net_name} has been approved by "
                f"the Oversight Body.\n\n"
                f"Sign in to see your dashboard, capacity score, and the "
                f"declarations and grants you're now eligible to participate "
                f"in.\n\n"
                f"— {net_name} secretariat"
            )
        else:
            reason_block = f"\n\nReason:\n  {reason}\n" if reason else ""
            subject = f"{net_name} membership decision"
            body = (
                f"Your application to join {net_name} was not approved at "
                f"this time."
                f"{reason_block}\n"
                f"You may re-apply after the cooldown period set by the "
                f"Oversight Body. Reach out to the secretariat if you have "
                f"questions about the decision.\n\n"
                f"— {net_name} secretariat"
            )
        # Phase 121 — render branded HTML version alongside the text body.
        html_body = None
        try:
            from app.services.email_templates import membership_decision_html
            applicant_org = None
            try:
                applicant_org = Organization.query.get(membership.org_id)
            except Exception:
                pass
            html_body = membership_decision_html(
                network_name=net_name,
                applicant_org_name=getattr(applicant_org, 'name', None),
                decision=decision,
                reason=reason,
            )
        except Exception as e:
            logger.debug("html template render skipped: %s", e)

        for u in recipients:
            r = EmailService.send(to=u.email, subject=subject, body=body, html_body=html_body)
            logger.info(
                "membership.notify decision=%s to=%s transport=%s success=%s html=%s",
                decision, u.email, r.get("transport"), r.get("success"), bool(html_body),
            )
    except Exception as e:
        logger.warning("membership.notify failed: %s", e)

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


@network_membership_bp.route("/directory", methods=["GET"])
@login_required
def api_network_directory():
    """Phase 197 — Per-network member directory.

    Returns every active membership in the current network with
    org name + country + sectors + most-recent capacity score.
    Visible to anyone whose org has an active membership in this
    network, plus admins.
    """
    network_id = get_current_network_id()
    if not network_id:
        return jsonify({"success": False, "error": "Network not resolved"}), 400

    # Access check: caller must have an active membership OR be admin.
    role_ok = current_user.role == "admin"
    if not role_ok and getattr(current_user, "org_id", None):
        m = NetworkMembership.query.filter_by(
            network_id=network_id,
            org_id=current_user.org_id,
            status="active",
        ).first()
        role_ok = m is not None
    if not role_ok:
        return jsonify({"success": False, "error": "Members only"}), 403

    try:
        from app.models import Assessment
        rows = (
            db.session.query(NetworkMembership, Organization)
            .join(Organization, Organization.id == NetworkMembership.org_id)
            .filter(NetworkMembership.network_id == network_id)
            .filter(NetworkMembership.status == "active")
            .order_by(Organization.name.asc())
            .all()
        )
    except Exception as e:
        logger.warning("network directory query failed: %s", e)
        rows = []

    items = []
    for m, org in rows:
        cap_score = None
        try:
            a = (
                Assessment.query
                .filter_by(organization_id=org.id)
                .order_by(Assessment.created_at.desc())
                .first()
            )
            cap_score = getattr(a, "score", None)
        except Exception:
            cap_score = None
        items.append({
            "org_id": org.id,
            "org_name": org.name,
            "country": getattr(org, "country", None),
            "sectors": (org.sectors or [])[:5],
            "member_tier": m.member_tier,
            "capacity_score": cap_score,
            "joined_at": (
                m.created_at.isoformat() if getattr(m, "created_at", None) else None
            ),
        })

    return jsonify({
        "success": True,
        "network_id": network_id,
        "members": items,
        "total": len(items),
    })


@network_membership_bp.route("/pending", methods=["GET"])
@ob_required(allow_admin_override=True)  # Phase 44C — OB members see the queue; Phase 114 — admins can still observe (read-only)
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
@ob_required(allow_admin_override=True)
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
    _notify_membership_decision(m, decision="approved")
    return jsonify({"success": True, "membership": m.to_dict()})


@network_membership_bp.route("/<int:membership_id>/reject", methods=["POST"])
@ob_required(allow_admin_override=True)
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
    _notify_membership_decision(m, decision="rejected", reason=reason)
    return jsonify({"success": True, "membership": m.to_dict()})


@network_membership_bp.route("/bulk-decision", methods=["POST"])
@ob_required(allow_admin_override=True)
def api_bulk_membership_decision():
    """Phase 122 — Approve or reject multiple memberships in one call.

    Body:
      {
        "decision": "approved" | "rejected",
        "membership_ids": [1, 2, 3, ...],
        "reason": "...",          # required when decision == 'rejected'
        "cooldown_months": 6      # optional, default 6 (rejection only)
      }

    Returns per-id success + error so the UI can flag partial failures.
    All sends fire AuditChainEntry via the state-machine method on
    NetworkMembership; bulk doesn't bypass per-row auditing.
    """
    data = get_request_json() or {}
    decision = (data.get("decision") or "").strip().lower()
    if decision not in ("approved", "rejected"):
        return jsonify({
            "success": False,
            "error": "decision must be 'approved' or 'rejected'",
        }), 400

    raw_ids = data.get("membership_ids") or []
    if not isinstance(raw_ids, list) or not raw_ids:
        return jsonify({"success": False, "error": "membership_ids required"}), 400
    if len(raw_ids) > 100:
        return jsonify({
            "success": False,
            "error": "Bulk decision capped at 100 rows per call",
        }), 400

    reason = (data.get("reason") or "").strip()
    cooldown_months = int(data.get("cooldown_months") or 6)
    if decision == "rejected" and not reason:
        return jsonify({
            "success": False,
            "error": "Reason is required when decision is 'rejected'",
        }), 400

    network_id = get_current_network_id()

    results = []
    success_count = 0
    fail_count = 0

    for mid_raw in raw_ids:
        try:
            mid = int(mid_raw)
        except (TypeError, ValueError):
            results.append({"id": mid_raw, "ok": False, "error": "invalid_id"})
            fail_count += 1
            continue
        m = NetworkMembership.query.get(mid)
        if not m:
            results.append({"id": mid, "ok": False, "error": "not_found"})
            fail_count += 1
            continue
        if network_id and m.network_id != network_id:
            results.append({"id": mid, "ok": False, "error": "wrong_network"})
            fail_count += 1
            continue
        try:
            if decision == "approved":
                ok = m.approve(
                    by_user_id=current_user.id,
                    actor_email=current_user.email,
                )
            else:
                ok = m.reject(
                    by_user_id=current_user.id,
                    reason=reason,
                    actor_email=current_user.email,
                    cooldown_months=cooldown_months,
                )
            if not ok:
                results.append({
                    "id": mid, "ok": False,
                    "error": f"invalid_status:{m.status}",
                })
                fail_count += 1
                continue
            results.append({"id": mid, "ok": True, "status": m.status})
            success_count += 1
        except Exception as e:
            results.append({"id": mid, "ok": False, "error": str(e)[:120]})
            fail_count += 1

    # Single commit for the whole batch — atomic from the DB's POV.
    db.session.commit()

    # Notify per-row outside the transaction so a mail failure doesn't roll
    # back the decisions.
    for r in results:
        if not r.get("ok"):
            continue
        try:
            m = NetworkMembership.query.get(r["id"])
            if m:
                _notify_membership_decision(
                    m, decision=decision,
                    reason=reason if decision == "rejected" else None,
                )
        except Exception as e:
            logger.warning("bulk notify failed mid=%s: %s", r.get("id"), e)

    return jsonify({
        "success": True,
        "decision": decision,
        "summary": {
            "requested": len(raw_ids),
            "succeeded": success_count,
            "failed": fail_count,
        },
        "results": results,
    })


@network_membership_bp.route("/<int:membership_id>/suspend", methods=["POST"])
@ob_required(allow_admin_override=True)
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


@network_membership_bp.route("/<int:membership_id>/run-trust-process", methods=["POST"])
@ob_required(allow_admin_override=True)
def api_run_trust_process(membership_id):
    """Phase 15 (NEAR redesign) — NEAR operator runs the trust process on
    behalf of the network. Triggers the existing trust-profile build
    pipeline (sanctions + adverse media + registry + bank verification)
    against the applicant org, persists the latest screenings + returns
    the aggregated profile.

    This is the NEAR-tenant equivalent of what Kuja-tenant donors do
    when they vet an NGO before funding. For NEAR, the network IS the
    funder, so the operator runs it during onboarding (not the NGO,
    and not at award time).

    Side effects:
      - If membership is pending, transition to under_review (the
        secretariat-is-reviewing state)
      - Audit anchor: 'network.membership.trust_process_run'
    """
    m = NetworkMembership.query.get_or_404(membership_id)
    network_id = get_current_network_id()
    if network_id and m.network_id != network_id:
        return jsonify({"success": False, "error": "Wrong network context"}), 403

    org = Organization.query.get(m.org_id)
    if not org:
        return jsonify({"success": False, "error": "Applicant org not found"}), 404

    # Auto-transition to under_review if still in 'pending'
    if m.status == "pending":
        m.status = "under_review"
        m.applied_at = m.applied_at or datetime.now(timezone.utc)

    # Run an adverse-media screen on the org (best-effort; service has
    # its own fallback). Persists via the canonical AdverseMediaScreening
    # shape — matches the same write pattern used by /trust/adverse-media.
    screening_summary = None
    try:
        from app.services.adverse_media_service import AdverseMediaService
        from app.models import AdverseMediaScreening
        result = AdverseMediaService.screen(
            org_name=org.name,
            country=getattr(org, "country", None),
            sector=None,
            leadership=None,
        )
        summary = result.get("summary") or {}
        scr = AdverseMediaScreening(
            org_id=org.id,
            lookback_months=result.get("lookback_months", 24),
            status=summary.get("overall_status", "pending"),
            source=result.get("source", "unknown"),
            ai_confidence=result.get("ai_confidence", 0),
            ai_notes=(result.get("ai_notes") or "")[:8000],
            screened_by_user_id=getattr(current_user, "id", None),
        )
        scr.set_subjects(result.get("subjects", []))
        scr.set_findings(result.get("findings", []))
        # Stash trust-process provenance + counts inside summary so we
        # don't lose the triggered-by attribution.
        merged_summary = {
            **summary,
            "triggered_by": "membership_trust_process",
            "membership_id": m.id,
        }
        scr.set_summary(merged_summary)
        db.session.add(scr)
        screening_summary = {
            "recommendation": summary.get("recommendation"),
            "high_count": summary.get("high_count", 0),
            "medium_count": summary.get("medium_count", 0),
            "low_count": summary.get("low_count", 0),
            "sources_searched": summary.get("sources_searched", []),
            "overall_status": summary.get("overall_status"),
        }
    except Exception as e:
        # NOTE: previously this except swallowed silently and the route
        # still returned 200, which let real defects (like the
        # screening_date=… invalid kwarg) hide for weeks. We now
        # surface the error inside the response payload so callers
        # see the failure even when the surrounding flow succeeds.
        logger.exception(f"membership trust process — adverse media failed: {e}")
        screening_summary = {"error": str(e)[:200], "ok": False}

    # Build the aggregated trust profile (uses ALL existing data —
    # screening just added + any prior verifications + capacity passport)
    try:
        from app.services.trust_profile_service import TrustProfileService
        profile = TrustProfileService.build(org.id)
    except Exception as e:
        logger.exception(f"trust profile build failed: {e}")
        profile = None

    db.session.commit()

    # Audit-anchor
    try:
        from app.models import AuditChainEntry
        AuditChainEntry.append(
            action="network.membership.trust_process_run",
            actor_email=current_user.email,
            subject_kind="network_membership",
            subject_id=m.id,
            details={
                "network_id": m.network_id,
                "org_id": org.id,
                "org_name": org.name,
                "country": getattr(org, "country", None),
                "screening_recommendation": (screening_summary or {}).get("recommendation"),
                "high_count": (screening_summary or {}).get("high_count"),
            },
        )
    except Exception:
        pass

    return jsonify({
        "success": True,
        "membership": m.to_dict(),
        "screening": screening_summary,
        "trust_profile": profile,
    })


@network_membership_bp.route("/<int:membership_id>/expel", methods=["POST"])
@ob_required(allow_admin_override=True)
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


# ---------------------------------------------------------------------------
# Phase 44 — Oversight Body seat management
# ---------------------------------------------------------------------------

@network_membership_bp.route("/<int:membership_id>/ob-seat", methods=["POST"])
@role_required("admin")
def api_grant_ob_seat(membership_id):
    """Grant an active member an Oversight Body seat in this network.

    Per the IKEA Concept Note, OB members are peer-elected from NEAR
    member orgs. The platform admin (Adeso staff) flags the seat
    here; once flagged, every user at that org gains OB permissions
    in the network on top of their NGO-member role.

    Body (optional): { effective_at: ISO datetime, note?: str }
    """
    from datetime import datetime, timezone
    m = NetworkMembership.query.get_or_404(membership_id)
    network_id = get_current_network_id()
    if network_id and m.network_id != network_id:
        return jsonify({"success": False, "error": "Wrong network context"}), 403
    if m.status != "active":
        return jsonify({
            "success": False,
            "error": f"Member must be active to hold an OB seat (status: {m.status})",
        }), 400
    if m.is_oversight_body:
        return jsonify({
            "success": False,
            "error": "Member already holds an OB seat",
            "membership": m.to_dict(),
        }), 409

    body = get_request_json() or {}
    m.is_oversight_body = True
    m.ob_role_started_at = datetime.now(timezone.utc)
    m.ob_role_ended_at = None
    db.session.flush()

    # Audit anchor so the OB roster has the same provenance as
    # declarations + signatures + grants.
    try:
        from app.models import AuditChainEntry
        AuditChainEntry.append(
            action="network.ob.seat_granted",
            actor_email=current_user.email,
            subject_kind="network_membership",
            subject_id=m.id,
            details={
                "network_id": m.network_id,
                "org_id": m.org_id,
                "note": (body.get("note") or "")[:500],
            },
        )
    except Exception:
        pass

    db.session.commit()
    return jsonify({"success": True, "membership": m.to_dict()})


@network_membership_bp.route("/<int:membership_id>/ob-seat", methods=["DELETE"])
@role_required("admin")
def api_revoke_ob_seat(membership_id):
    """Revoke an OB seat (e.g. term ended, member elected off the OB)."""
    from datetime import datetime, timezone
    m = NetworkMembership.query.get_or_404(membership_id)
    network_id = get_current_network_id()
    if network_id and m.network_id != network_id:
        return jsonify({"success": False, "error": "Wrong network context"}), 403
    if not m.is_oversight_body:
        return jsonify({
            "success": False,
            "error": "Member does not hold an OB seat",
        }), 409

    body = get_request_json() or {}
    m.is_oversight_body = False
    m.ob_role_ended_at = datetime.now(timezone.utc)
    db.session.flush()

    try:
        from app.models import AuditChainEntry
        AuditChainEntry.append(
            action="network.ob.seat_revoked",
            actor_email=current_user.email,
            subject_kind="network_membership",
            subject_id=m.id,
            details={
                "network_id": m.network_id,
                "org_id": m.org_id,
                "reason": (body.get("reason") or "")[:500],
            },
        )
    except Exception:
        pass

    db.session.commit()
    return jsonify({"success": True, "membership": m.to_dict()})


@network_membership_bp.route("/ob-roster", methods=["GET"])
@login_required
def api_ob_roster():
    """List active OB members in the current network.

    Used by the declaration signer-picker and the operator console
    so the team can see (and audit) who currently holds OB seats.

    Returns one entry per USER at an OB-flagged organisation —
    declaration signer slots identify a specific user_id, so the
    picker needs to surface user-level rows, not just org-level.
    Each row carries the membership context (org name, country)
    so the picker can group + label.
    """
    network_id = get_current_network_id()
    if not network_id:
        return jsonify({"success": True, "members": [], "count": 0})

    memberships = (
        NetworkMembership.query
        .filter_by(
            network_id=network_id,
            status="active",
            is_oversight_body=True,
        )
        .all()
    )

    from app.models import User, Organization
    rows = []
    for m in memberships:
        org = Organization.query.get(m.org_id)
        users = User.query.filter_by(org_id=m.org_id).all()
        for u in users:
            rows.append({
                "membership_id": m.id,
                "org_id": m.org_id,
                "org_name": org.name if org else f"Org #{m.org_id}",
                "country": m.country or (org.country if org else None),
                "user_id": u.id,
                "user_name": u.name,
                "user_email": u.email,
                "user_role": u.role,
                "ob_role_started_at": (
                    m.ob_role_started_at.isoformat() if m.ob_role_started_at else None
                ),
            })
    # Sort by org name, then user name — stable picker order
    rows.sort(key=lambda r: ((r["org_name"] or "").lower(),
                              (r["user_name"] or "").lower()))
    return jsonify({
        "success": True,
        "network_id": network_id,
        "members": rows,
        "count": len(rows),
    })
