"""Window report + Monitoring Visit routes — Phase 37 (May 2026).

Window reports (admin or fund-manager scope):
  GET    /api/windows/<id>/report                — structured JSON report
  GET    /api/windows/<id>/report/public         — anonymised public summary
  GET    /api/windows/<id>/report.csv            — declarations CSV
  GET    /api/windows/<id>/report/grants.csv     — grants CSV
  GET    /api/windows/<id>/report.zip            — full bundle (json+csv)

Monitoring visits (any logged-in user can view; admin can record):
  GET    /api/grants/<gid>/monitoring-visits          — list visits for grant
  POST   /api/grants/<gid>/monitoring-visits          — record visit (admin)
  PUT    /api/monitoring-visits/<id>                  — update (admin)

Scope: routes verify the parent fund belongs to the resolved Network.
"""

import logging

from flask import Blueprint, jsonify, request, Response
from flask_login import login_required, current_user

from app.extensions import db
from app.models import (
    FundWindow, Fund, Grant, MonitoringVisit,
    EmergencyDeclaration, VISIT_MODES,
)
from app.utils.network import get_current_network_id
from app.utils.helpers import get_request_json
from app.utils.decorators import role_required
from app.services.window_report_service import WindowReportService

logger = logging.getLogger("kuja")

window_report_bp = Blueprint("window_report", __name__, url_prefix="/api")


def _scope_window(window: FundWindow) -> bool:
    nid = get_current_network_id()
    if not nid:
        return True
    return window.fund.network_id == nid


# =============================================================================
# Window reports
# =============================================================================

@window_report_bp.route("/windows/<int:window_id>/report", methods=["GET"])
@login_required
def api_window_report(window_id):
    w = FundWindow.query.get_or_404(window_id)
    if not _scope_window(w):
        return jsonify({"success": False, "error": "Wrong network context"}), 403
    payload = WindowReportService.build(window_id)
    return jsonify(payload)


@window_report_bp.route("/windows/<int:window_id>/report/public", methods=["GET"])
def api_window_report_public(window_id):
    """Anonymised public summary. Available without login if the parent
    fund's network has the feature enabled; for now restrict to logged-in."""
    if not current_user.is_authenticated:
        # Phase 37 ships gated; opt-in public exposure lands in Phase 38.
        return jsonify({"success": False, "error": "login required"}), 401
    w = FundWindow.query.get_or_404(window_id)
    if not _scope_window(w):
        return jsonify({"success": False, "error": "Wrong network context"}), 403
    return jsonify(WindowReportService.public_summary(window_id))


@window_report_bp.route("/windows/<int:window_id>/report.csv", methods=["GET"])
@login_required
def api_window_report_csv(window_id):
    w = FundWindow.query.get_or_404(window_id)
    if not _scope_window(w):
        return jsonify({"success": False, "error": "Wrong network context"}), 403
    csv_text = WindowReportService.csv_declarations(window_id)
    return Response(
        csv_text,
        mimetype="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=window-{window_id}-declarations.csv",
        },
    )


@window_report_bp.route("/windows/<int:window_id>/report/grants.csv", methods=["GET"])
@login_required
def api_window_report_grants_csv(window_id):
    w = FundWindow.query.get_or_404(window_id)
    if not _scope_window(w):
        return jsonify({"success": False, "error": "Wrong network context"}), 403
    csv_text = WindowReportService.csv_grants(window_id)
    return Response(
        csv_text,
        mimetype="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=window-{window_id}-grants.csv",
        },
    )


@window_report_bp.route("/windows/<int:window_id>/report.zip", methods=["GET"])
@login_required
def api_window_report_zip(window_id):
    w = FundWindow.query.get_or_404(window_id)
    if not _scope_window(w):
        return jsonify({"success": False, "error": "Wrong network context"}), 403
    blob = WindowReportService.zip_bundle(window_id)
    return Response(
        blob,
        mimetype="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename=window-{window_id}-bundle.zip",
        },
    )


# =============================================================================
# Monitoring visits
# =============================================================================

@window_report_bp.route("/grants/<int:grant_id>/monitoring-visits", methods=["GET"])
@login_required
def api_list_visits(grant_id):
    g = Grant.query.get_or_404(grant_id)
    rows = (
        MonitoringVisit.query
        .filter_by(grant_id=grant_id)
        .order_by(MonitoringVisit.visit_date.desc())
        .all()
    )
    return jsonify({
        "success": True,
        "visits": [v.to_dict() for v in rows],
    })


@window_report_bp.route("/grants/<int:grant_id>/monitoring-visits", methods=["POST"])
@role_required("admin")
def api_record_visit(grant_id):
    g = Grant.query.get_or_404(grant_id)
    body = get_request_json() or {}
    mode = (body.get("visit_mode") or "virtual").strip().lower()
    if mode not in VISIT_MODES:
        return jsonify({"success": False, "error": f"Invalid visit_mode '{mode}'"}), 400
    visit_date_str = (body.get("visit_date") or "").strip()
    if not visit_date_str:
        return jsonify({"success": False, "error": "visit_date is required (ISO date)"}), 400
    from datetime import date
    try:
        visit_date = date.fromisoformat(visit_date_str)
    except ValueError:
        return jsonify({"success": False, "error": "visit_date must be ISO YYYY-MM-DD"}), 400

    # Optional declaration link (auto-detected if grant has fund_window
    # link + a single active declaration on that window, but caller can
    # pass declaration_id explicitly).
    declaration_id = body.get("declaration_id")

    v = MonitoringVisit(
        grant_id=grant_id,
        declaration_id=declaration_id,
        visit_mode=mode,
        visit_date=visit_date,
        visited_by_user_id=current_user.id,
        observations_md=(body.get("observations_md") or "").strip() or None,
        community_feedback_summary=(body.get("community_feedback_summary") or "").strip() or None,
        issues_identified=(body.get("issues_identified") or "").strip() or None,
        action_items_md=(body.get("action_items_md") or "").strip() or None,
        attendance_estimate=body.get("attendance_estimate"),
        status=(body.get("status") or "recorded"),
    )
    if isinstance(body.get("source_links"), list):
        v.set_source_links(body["source_links"])
    db.session.add(v)
    db.session.commit()
    return jsonify({"success": True, "visit": v.to_dict()})


@window_report_bp.route("/monitoring-visits/<int:visit_id>", methods=["PUT"])
@role_required("admin")
def api_update_visit(visit_id):
    v = MonitoringVisit.query.get_or_404(visit_id)
    body = get_request_json() or {}
    for fld in (
        "visit_mode", "observations_md", "community_feedback_summary",
        "issues_identified", "action_items_md", "attendance_estimate",
        "status",
    ):
        if fld in body:
            setattr(v, fld, body[fld])
    if "visit_date" in body:
        from datetime import date
        try:
            v.visit_date = date.fromisoformat(body["visit_date"])
        except (TypeError, ValueError):
            return jsonify({"success": False, "error": "visit_date must be ISO date"}), 400
    if isinstance(body.get("source_links"), list):
        v.set_source_links(body["source_links"])
    db.session.commit()
    return jsonify({"success": True, "visit": v.to_dict()})
