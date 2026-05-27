"""Crisis Monitoring routes — Phase 35 (May 2026).

Reports (network-scoped):
  GET    /api/crisis/reports                  — list reports in current network
  POST   /api/crisis/reports                  — create a blank weekly report (admin)
  GET    /api/crisis/reports/<id>             — detail (with rows)
  POST   /api/crisis/reports/<id>/rows        — add/upsert a country row (admin)
  PUT    /api/crisis/reports/<id>/rows/<rid>  — update a row (admin)
  POST   /api/crisis/reports/<id>/publish     — admin publishes; audit-anchored
  GET    /api/crisis/reports/latest/published — latest published report
                                                (used as evidence by Phase 36)

Signals (member-facing):
  POST   /api/crisis/signals                  — NGO submits an ad-hoc alert
  GET    /api/crisis/signals                  — admin lists pending signals
  POST   /api/crisis/signals/<id>/roll-in     — admin rolls a signal into a
                                                report
"""

import logging
from datetime import date, datetime, timedelta, timezone

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from app.extensions import db
from app.models import (
    CrisisMonitoringReport, CrisisMonitoringRow, CrisisSignal,
    REPORT_STATUSES, SIGNAL_STATUSES,
)
from app.utils.network import get_current_network_id
from app.utils.helpers import get_request_json
from app.utils.decorators import role_required

logger = logging.getLogger("kuja")

crisis_bp = Blueprint("crisis", __name__, url_prefix="/api/crisis")


# =============================================================================
# Reports
# =============================================================================

def _scope_check(report: CrisisMonitoringReport) -> bool:
    """Return True if the report belongs to the resolved network."""
    nid = get_current_network_id()
    return not nid or report.network_id == nid


@crisis_bp.route("/reports", methods=["GET"])
@login_required
def api_list_reports():
    network_id = get_current_network_id()
    if not network_id:
        return jsonify({"success": False, "error": "Network not resolved"}), 400
    status = request.args.get("status")
    q = CrisisMonitoringReport.query.filter_by(network_id=network_id)
    if status:
        q = q.filter_by(status=status)
    rows = q.order_by(CrisisMonitoringReport.period_start.desc()).limit(50).all()
    return jsonify({
        "success": True,
        "reports": [r.to_dict() for r in rows],
    })


@crisis_bp.route("/reports", methods=["POST"])
@role_required("admin")
def api_create_report():
    network_id = get_current_network_id()
    if not network_id:
        return jsonify({"success": False, "error": "Network not resolved"}), 400

    body = get_request_json() or {}
    today = date.today()
    # Default period: last 7 days ending today.
    try:
        period_end = date.fromisoformat(body["period_end"]) if body.get("period_end") else today
        period_start = (
            date.fromisoformat(body["period_start"])
            if body.get("period_start")
            else (period_end - timedelta(days=7))
        )
    except ValueError:
        return jsonify({"success": False, "error": "Invalid date format"}), 400

    r = CrisisMonitoringReport(
        network_id=network_id,
        period_start=period_start,
        period_end=period_end,
        generated_by=(body.get("generated_by") or "manual"),
        status="draft",
        summary_md=(body.get("summary_md") or "").strip() or None,
    )
    db.session.add(r)
    db.session.commit()
    return jsonify({"success": True, "report": r.to_dict()})


@crisis_bp.route("/reports/<int:report_id>", methods=["GET"])
@login_required
def api_get_report(report_id):
    r = CrisisMonitoringReport.query.get_or_404(report_id)
    if not _scope_check(r):
        return jsonify({"success": False, "error": "Wrong network context"}), 403
    return jsonify({"success": True, "report": r.to_dict(include_rows=True)})


@crisis_bp.route("/reports/<int:report_id>/rows", methods=["POST"])
@role_required("admin")
def api_upsert_row(report_id):
    r = CrisisMonitoringReport.query.get_or_404(report_id)
    if not _scope_check(r):
        return jsonify({"success": False, "error": "Wrong network context"}), 403
    if r.status == "published":
        return jsonify({"success": False, "error": "Report already published"}), 409

    body = get_request_json() or {}
    country = (body.get("country") or "").strip().upper()
    if len(country) != 3:
        return jsonify({"success": False, "error": "country must be ISO 3166 alpha-3"}), 400

    row = CrisisMonitoringRow(
        report_id=report_id,
        country=country,
        region=(body.get("region") or "").strip() or None,
        event_type=(body.get("event_type") or "").strip() or None,
        event_title=(body.get("event_title") or "").strip() or None,
        hdi_band=body.get("hdi_band"),
        gov_capacity_band=body.get("gov_capacity_band"),
        people_impacted_estimate=body.get("people_impacted_estimate"),
        attention_band=body.get("attention_band"),
        narrative=(body.get("narrative") or "").strip() or None,
        flagged_for_ob=bool(body.get("flagged_for_ob", False)),
    )
    # Auto-compute composite score from the 4 factors.
    row.composite_score = CrisisMonitoringRow.compute_composite_score(
        hdi_band=row.hdi_band,
        gov_capacity_band=row.gov_capacity_band,
        people_impacted_estimate=row.people_impacted_estimate,
        attention_band=row.attention_band,
    )
    if isinstance(body.get("source_links"), list):
        row.set_source_links(body["source_links"])
    db.session.add(row)
    db.session.commit()
    return jsonify({"success": True, "row": row.to_dict()})


@crisis_bp.route("/reports/<int:report_id>/rows/<int:row_id>", methods=["PUT"])
@role_required("admin")
def api_update_row(report_id, row_id):
    r = CrisisMonitoringReport.query.get_or_404(report_id)
    if not _scope_check(r):
        return jsonify({"success": False, "error": "Wrong network context"}), 403
    if r.status == "published":
        return jsonify({"success": False, "error": "Report already published"}), 409

    row = CrisisMonitoringRow.query.filter_by(
        id=row_id, report_id=report_id,
    ).first_or_404()
    body = get_request_json() or {}
    for fld in (
        "region", "event_type", "event_title", "hdi_band",
        "gov_capacity_band", "people_impacted_estimate", "attention_band",
        "narrative",
    ):
        if fld in body:
            setattr(row, fld, body[fld])
    if "flagged_for_ob" in body:
        row.flagged_for_ob = bool(body["flagged_for_ob"])
    if isinstance(body.get("source_links"), list):
        row.set_source_links(body["source_links"])
    # Recompute composite score on every save — keeps the formula
    # consistent with the inputs.
    row.composite_score = CrisisMonitoringRow.compute_composite_score(
        hdi_band=row.hdi_band,
        gov_capacity_band=row.gov_capacity_band,
        people_impacted_estimate=row.people_impacted_estimate,
        attention_band=row.attention_band,
    )
    db.session.commit()
    return jsonify({"success": True, "row": row.to_dict()})


@crisis_bp.route("/reports/<int:report_id>/publish", methods=["POST"])
@role_required("admin")
def api_publish_report(report_id):
    r = CrisisMonitoringReport.query.get_or_404(report_id)
    if not _scope_check(r):
        return jsonify({"success": False, "error": "Wrong network context"}), 403
    if not r.publish(by_user_id=current_user.id, actor_email=current_user.email):
        return jsonify({
            "success": False,
            "error": f"Cannot publish from status '{r.status}'",
        }), 400
    db.session.commit()
    return jsonify({"success": True, "report": r.to_dict(include_rows=True)})


@crisis_bp.route("/reports/latest/published", methods=["GET"])
@login_required
def api_latest_published_report():
    """Used by Phase 36 declarations as the evidence anchor."""
    network_id = get_current_network_id()
    if not network_id:
        return jsonify({"success": False, "error": "Network not resolved"}), 400
    r = (
        CrisisMonitoringReport.query
        .filter_by(network_id=network_id, status="published")
        # Tie-break on published_at then id so callers get a deterministic
        # result when multiple reports cover the same period_end.
        .order_by(
            CrisisMonitoringReport.period_end.desc(),
            CrisisMonitoringReport.published_at.desc().nullslast(),
            CrisisMonitoringReport.id.desc(),
        )
        .first()
    )
    if not r:
        return jsonify({"success": True, "report": None})
    return jsonify({"success": True, "report": r.to_dict(include_rows=True)})


# =============================================================================
# Signals
# =============================================================================

@crisis_bp.route("/signals", methods=["POST"])
@login_required
def api_submit_signal():
    """Any authenticated user (typically an NGO member) can submit."""
    network_id = get_current_network_id()
    if not network_id:
        return jsonify({"success": False, "error": "Network not resolved"}), 400
    body = get_request_json() or {}
    country = (body.get("country") or "").strip().upper()
    description = (body.get("description") or "").strip()
    if len(country) != 3 or not description:
        return jsonify({
            "success": False,
            "error": "country (ISO alpha-3) and description are required",
        }), 400
    s = CrisisSignal(
        network_id=network_id,
        submitted_by_org_id=current_user.org_id,
        submitted_by_user_id=current_user.id,
        country=country,
        event_type=(body.get("event_type") or "").strip() or None,
        description=description,
        status="pending",
    )
    db.session.add(s)
    db.session.commit()
    return jsonify({"success": True, "signal": s.to_dict()})


@crisis_bp.route("/signals", methods=["GET"])
@role_required("admin")
def api_list_signals():
    network_id = get_current_network_id()
    if not network_id:
        return jsonify({"success": False, "error": "Network not resolved"}), 400
    status = (request.args.get("status") or "pending").strip().lower()
    q = CrisisSignal.query.filter_by(network_id=network_id)
    if status != "all":
        q = q.filter_by(status=status)
    rows = q.order_by(CrisisSignal.submitted_at.desc()).limit(100).all()
    return jsonify({
        "success": True,
        "signals": [s.to_dict() for s in rows],
    })


@crisis_bp.route("/signals/<int:signal_id>/roll-in", methods=["POST"])
@role_required("admin")
def api_roll_signal_into_report(signal_id):
    s = CrisisSignal.query.get_or_404(signal_id)
    body = get_request_json() or {}
    report_id = body.get("report_id")
    if not report_id:
        return jsonify({"success": False, "error": "report_id is required"}), 400
    r = CrisisMonitoringReport.query.get_or_404(report_id)
    if r.network_id != s.network_id:
        return jsonify({"success": False, "error": "Network mismatch"}), 400
    s.status = "rolled_in"
    s.rolled_into_report_id = report_id
    db.session.commit()
    return jsonify({"success": True, "signal": s.to_dict()})
