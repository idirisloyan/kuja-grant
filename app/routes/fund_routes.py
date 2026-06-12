"""Fund / Window / Rubric routes — Phase 34 (May 2026).

Funds & windows (network-scoped):
  GET    /api/funds                          — list funds in current network
  POST   /api/funds                          — create a fund (admin)
  GET    /api/funds/<id>                     — detail (with windows)
  PUT    /api/funds/<id>                     — update (admin)

  GET    /api/funds/<id>/windows             — list windows for a fund
  POST   /api/funds/<id>/windows             — create a window under a fund (admin)
  GET    /api/windows/<id>                   — detail (with default rubric)
  PUT    /api/windows/<id>                   — update (admin)

Rubrics:
  GET    /api/windows/<id>/rubric            — default rubric + criteria
  POST   /api/windows/<id>/rubric/seed-change-fund
                                             — seed the NEAR Change Fund
                                               5-area rubric on a window (admin)
  PUT    /api/criteria/<id>                  — update a single criterion (admin)

Everything is scoped to the host-resolved Network; admins on Network A
cannot see Network B funds. Read endpoints are open to authenticated
users; write endpoints require admin.
"""

import logging
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from app.extensions import db
from app.models import (
    Fund, FundWindow, WindowEvaluationRubric, WindowEvaluationCriterion,
    FUND_STATUSES, WINDOW_STATUSES, THRESHOLD_KINDS,
)
from app.utils.network import get_current_network_id
from app.utils.helpers import get_request_json
from app.utils.decorators import role_required

logger = logging.getLogger("kuja")

fund_bp = Blueprint("fund", __name__, url_prefix="/api")


# =============================================================================
# Funds
# =============================================================================

@fund_bp.route("/funds", methods=["GET"])
@login_required
def api_list_funds():
    network_id = get_current_network_id()
    if not network_id:
        return jsonify({"success": False, "error": "Network not resolved"}), 400
    status = request.args.get("status")
    q = Fund.query.filter_by(network_id=network_id)
    if status:
        q = q.filter_by(status=status)
    rows = q.order_by(Fund.name.asc()).all()
    return jsonify({
        "success": True,
        "funds": [f.to_dict() for f in rows],
    })


@fund_bp.route("/funds", methods=["POST"])
@role_required("admin")
def api_create_fund():
    network_id = get_current_network_id()
    if not network_id:
        return jsonify({"success": False, "error": "Network not resolved"}), 400
    body = get_request_json() or {}
    slug = (body.get("slug") or "").strip().lower()
    name = (body.get("name") or "").strip()
    if not slug or not name:
        return jsonify({"success": False, "error": "slug and name are required"}), 400

    # Slug uniqueness scoped per network.
    if Fund.query.filter_by(network_id=network_id, slug=slug).first():
        return jsonify({"success": False, "error": f"slug '{slug}' already exists in this network"}), 409

    f = Fund(
        network_id=network_id,
        slug=slug,
        name=name,
        short_description=(body.get("short_description") or "").strip() or None,
        currency=(body.get("currency") or "USD").strip().upper()[:10],
        total_pool_amount=body.get("total_pool_amount"),
        year_launched=body.get("year_launched"),
        oversight_role_key=(body.get("oversight_role_key") or "").strip() or None,
        status=(body.get("status") or "active"),
        is_default_for_emergency=bool(body.get("is_default_for_emergency", False)),
    )
    if f.status not in FUND_STATUSES:
        return jsonify({"success": False, "error": f"invalid status '{f.status}'"}), 400
    db.session.add(f)
    db.session.commit()
    return jsonify({"success": True, "fund": f.to_dict()})


@fund_bp.route("/funds/<int:fund_id>", methods=["GET"])
@login_required
def api_get_fund(fund_id):
    f = Fund.query.get_or_404(fund_id)
    network_id = get_current_network_id()
    if network_id and f.network_id != network_id:
        return jsonify({"success": False, "error": "Wrong network context"}), 403
    return jsonify({"success": True, "fund": f.to_dict(include_windows=True)})


@fund_bp.route("/funds/<int:fund_id>", methods=["PUT"])
@role_required("admin")
def api_update_fund(fund_id):
    f = Fund.query.get_or_404(fund_id)
    network_id = get_current_network_id()
    if network_id and f.network_id != network_id:
        return jsonify({"success": False, "error": "Wrong network context"}), 403
    body = get_request_json() or {}
    for fld in (
        "name", "short_description", "currency", "year_launched",
        "oversight_role_key", "status", "total_pool_amount", "disbursed_to_date",
    ):
        if fld in body:
            setattr(f, fld, body[fld])
    if "is_default_for_emergency" in body:
        f.is_default_for_emergency = bool(body["is_default_for_emergency"])
    if f.status not in FUND_STATUSES:
        return jsonify({"success": False, "error": f"invalid status '{f.status}'"}), 400
    db.session.commit()
    return jsonify({"success": True, "fund": f.to_dict()})


# =============================================================================
# Windows
# =============================================================================

@fund_bp.route("/funds/<int:fund_id>/windows", methods=["GET"])
@login_required
def api_list_windows(fund_id):
    f = Fund.query.get_or_404(fund_id)
    network_id = get_current_network_id()
    if network_id and f.network_id != network_id:
        return jsonify({"success": False, "error": "Wrong network context"}), 403
    return jsonify({
        "success": True,
        "windows": [w.to_dict() for w in f.windows],
    })


@fund_bp.route("/funds/<int:fund_id>/windows", methods=["POST"])
@role_required("admin")
def api_create_window(fund_id):
    f = Fund.query.get_or_404(fund_id)
    network_id = get_current_network_id()
    if network_id and f.network_id != network_id:
        return jsonify({"success": False, "error": "Wrong network context"}), 403

    body = get_request_json() or {}
    slug = (body.get("slug") or "").strip().lower()
    name = (body.get("name") or "").strip()
    if not slug or not name:
        return jsonify({"success": False, "error": "slug and name are required"}), 400

    if FundWindow.query.filter_by(fund_id=fund_id, slug=slug).first():
        return jsonify({"success": False, "error": f"slug '{slug}' already exists in this fund"}), 409

    w = FundWindow(
        fund_id=fund_id,
        slug=slug,
        name=name,
        description=(body.get("description") or "").strip() or None,
        crisis_type=(body.get("crisis_type") or "").strip() or None,
        min_grant_amount=body.get("min_grant_amount"),
        max_grant_amount=body.get("max_grant_amount"),
        default_grant_duration_months=body.get("default_grant_duration_months"),
        application_window_hours=body.get("application_window_hours"),
        decision_sla_days=body.get("decision_sla_days"),
        expected_completion_minutes=body.get("expected_completion_minutes"),
        direct_to_community_single_min_pct=body.get("direct_to_community_single_min_pct"),
        direct_to_community_consortium_min_pct=body.get("direct_to_community_consortium_min_pct"),
        status=(body.get("status") or "draft"),
        is_public=bool(body.get("is_public", True)),
    )
    if w.status not in WINDOW_STATUSES:
        return jsonify({"success": False, "error": f"invalid status '{w.status}'"}), 400
    if isinstance(body.get("application_template"), list):
        w.set_application_template(body["application_template"])
    db.session.add(w)
    db.session.commit()
    return jsonify({"success": True, "window": w.to_dict()})


@fund_bp.route("/windows/<int:window_id>", methods=["GET"])
@login_required
def api_get_window(window_id):
    w = FundWindow.query.get_or_404(window_id)
    network_id = get_current_network_id()
    if network_id and w.fund.network_id != network_id:
        return jsonify({"success": False, "error": "Wrong network context"}), 403
    return jsonify({"success": True, "window": w.to_dict(include_rubric=True)})


@fund_bp.route("/windows/<int:window_id>/operational", methods=["GET"])
@login_required
def api_window_operational_rollup(window_id):
    """Phase 52 — operational state rollup for a window.

    Returns the live count of declarations / grants / due reports tied
    to this window so the funds page can lead with operational state
    instead of configuration (see docs/DESIGN_PRINCIPLES.md, brief for
    Funds & Windows).

    Shape:
      {
        "success": True,
        "window_id": <int>,
        "available_budget": <int|null>,    # fund pool — disbursed (best-effort)
        "currency": <str>,
        "active_declaration_count": <int>, # in_review + signed_active
        "open_grant_count": <int>,         # status='open' under this window
        "due_report_count": <int>,         # tied grants, due in next 30 days
        "overdue_report_count": <int>,     # tied grants, due_date < today
        "top_risks": []                    # placeholder; populated by a
                                           # later AI surface
      }
    """
    from datetime import date, timedelta
    from app.models import EmergencyDeclaration, Grant, Report

    w = FundWindow.query.get_or_404(window_id)
    network_id = get_current_network_id()
    if network_id and w.fund.network_id != network_id:
        return jsonify({"success": False, "error": "Wrong network context"}), 403

    today = date.today()
    in_30 = today + timedelta(days=30)

    active_decl = (
        EmergencyDeclaration.query
        .filter(EmergencyDeclaration.window_id == window_id)
        .filter(EmergencyDeclaration.status.in_(["in_review", "signed_active"]))
        .count()
    )
    open_grants = (
        Grant.query
        .filter(Grant.fund_window_id == window_id)
        .filter(Grant.status == "open")
        .count()
    )
    # Reports are tied to grants, not directly to windows; join by grant.
    due_reports = (
        db.session.query(Report.id)
        .join(Grant, Report.grant_id == Grant.id)
        .filter(Grant.fund_window_id == window_id)
        .filter(Report.status.in_(["draft", "pending"]))
        .filter(Report.due_date.isnot(None))
        .filter(Report.due_date >= today)
        .filter(Report.due_date <= in_30)
        .count()
    )
    overdue_reports = (
        db.session.query(Report.id)
        .join(Grant, Report.grant_id == Grant.id)
        .filter(Grant.fund_window_id == window_id)
        .filter(Report.status.in_(["draft", "pending"]))
        .filter(Report.due_date.isnot(None))
        .filter(Report.due_date < today)
        .count()
    )

    # Best-effort budget: fund.total_pool_amount minus disbursed_to_date if
    # tracked. Per-window slicing requires a separate accounting endpoint
    # and isn't in scope for Phase 52.
    fund = w.fund
    pool = getattr(fund, "total_pool_amount", None)
    disbursed = getattr(fund, "disbursed_to_date", None) or 0
    available_budget = None
    if pool is not None:
        try:
            available_budget = max(0, int(pool) - int(disbursed))
        except (TypeError, ValueError):
            available_budget = pool

    return jsonify({
        "success": True,
        "window_id": window_id,
        "available_budget": available_budget,
        "currency": getattr(fund, "currency", None),
        "active_declaration_count": active_decl,
        "open_grant_count": open_grants,
        "due_report_count": due_reports,
        "overdue_report_count": overdue_reports,
        # top_risks is a placeholder. Populated by a later AI surface that
        # synthesises risk signals from declarations + grants + reports.
        "top_risks": [],
    })


@fund_bp.route("/windows/<int:window_id>", methods=["PUT"])
@role_required("admin")
def api_update_window(window_id):
    w = FundWindow.query.get_or_404(window_id)
    network_id = get_current_network_id()
    if network_id and w.fund.network_id != network_id:
        return jsonify({"success": False, "error": "Wrong network context"}), 403

    body = get_request_json() or {}
    for fld in (
        "name", "description", "crisis_type",
        "min_grant_amount", "max_grant_amount",
        "default_grant_duration_months",
        "application_window_hours", "decision_sla_days",
        "expected_completion_minutes",
        "direct_to_community_single_min_pct",
        "direct_to_community_consortium_min_pct",
        "status",
    ):
        if fld in body:
            setattr(w, fld, body[fld])
    if "is_public" in body:
        w.is_public = bool(body["is_public"])
    if isinstance(body.get("application_template"), list):
        w.set_application_template(body["application_template"])
    if w.status not in WINDOW_STATUSES:
        return jsonify({"success": False, "error": f"invalid status '{w.status}'"}), 400
    db.session.commit()
    return jsonify({"success": True, "window": w.to_dict()})


# =============================================================================
# Rubrics + Criteria
# =============================================================================

@fund_bp.route("/windows/<int:window_id>/rubric", methods=["GET"])
@login_required
def api_get_window_rubric(window_id):
    w = FundWindow.query.get_or_404(window_id)
    network_id = get_current_network_id()
    if network_id and w.fund.network_id != network_id:
        return jsonify({"success": False, "error": "Wrong network context"}), 403
    r = w.default_rubric()
    return jsonify({
        "success": True,
        "rubric": r.to_dict(include_criteria=True) if r else None,
    })


@fund_bp.route("/windows/<int:window_id>/rubric/seed-change-fund", methods=["POST"])
@role_required("admin")
def api_seed_change_fund_rubric(window_id):
    w = FundWindow.query.get_or_404(window_id)
    network_id = get_current_network_id()
    if network_id and w.fund.network_id != network_id:
        return jsonify({"success": False, "error": "Wrong network context"}), 403

    # Idempotent: if a default rubric already exists with >= 1 criterion,
    # return it instead of duplicating.
    existing = w.default_rubric()
    if existing and len(existing.criteria) > 0:
        return jsonify({
            "success": True,
            "rubric": existing.to_dict(include_criteria=True),
            "already_existed": True,
        })

    rubric = WindowEvaluationRubric.seed_change_fund_default(
        window_id=window_id, by_user_id=current_user.id,
    )
    db.session.commit()
    return jsonify({
        "success": True,
        "rubric": rubric.to_dict(include_criteria=True),
    })


@fund_bp.route("/criteria/<int:criterion_id>", methods=["PUT"])
@role_required("admin")
def api_update_criterion(criterion_id):
    c = WindowEvaluationCriterion.query.get_or_404(criterion_id)
    rubric = WindowEvaluationRubric.query.get(c.rubric_id)
    window = FundWindow.query.get(rubric.window_id) if rubric else None
    network_id = get_current_network_id()
    if window and network_id and window.fund.network_id != network_id:
        return jsonify({"success": False, "error": "Wrong network context"}), 403

    body = get_request_json() or {}
    for fld in (
        "area", "name", "description", "weight",
        "threshold_kind", "threshold_value", "threshold_meaning",
        "ai_evaluator_key", "display_order",
    ):
        if fld in body:
            setattr(c, fld, body[fld])
    if c.threshold_kind not in THRESHOLD_KINDS:
        return jsonify({
            "success": False,
            "error": f"invalid threshold_kind '{c.threshold_kind}'",
        }), 400
    db.session.commit()
    return jsonify({"success": True, "criterion": c.to_dict()})
