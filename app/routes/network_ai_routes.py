"""Network AI routes — Phase 38 (May 2026).

Seven surfaces, one route each:

  POST /api/applications/<id>/ai-score-rubric        — score against window rubric
  POST /api/applications/<id>/ai-classify-budget     — direct-to-community ratio
  POST /api/network/membership/<id>/ai-brief         — OB reviewer brief
  POST /api/crisis/reports/<id>/rows/<rid>/ai-draft  — draft narrative + bands
  POST /api/declarations/<id>/ai-draft-assist        — fill summary + shortlist
  POST /api/windows/<id>/report/ai-narrative         — prose for window report
  POST /api/networks/patterns/ai-detect              — cross-window patterns

Every surface always returns the AI result inside the JSON (never raises),
so the frontend can render the deterministic fallback when AI is off.
"""

import logging
from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from app.extensions import db
from app.models import (
    Application, Grant, FundWindow, NetworkMembership, Organization,
    CrisisMonitoringReport, CrisisMonitoringRow, CrisisSignal,
    EmergencyDeclaration,
)
from app.services.network_ai_service import NetworkAIService
from app.services.window_report_service import WindowReportService
from app.utils.network import get_current_network_id
from app.utils.helpers import get_request_json
from app.utils.decorators import role_required

logger = logging.getLogger("kuja")

network_ai_bp = Blueprint("network_ai", __name__, url_prefix="/api")


# =============================================================================
# 1. Application Rubric Scorer
# =============================================================================

@network_ai_bp.route("/applications/<int:application_id>/ai-score-rubric", methods=["POST"])
@login_required
def api_ai_score_rubric(application_id):
    app_row = Application.query.get_or_404(application_id)
    grant = Grant.query.get(app_row.grant_id) if hasattr(app_row, "grant_id") else None
    if not grant:
        return jsonify({"success": False, "error": "Application not linked to a grant"}), 400
    if not grant.fund_window_id:
        return jsonify({
            "success": False,
            "error": "Grant has no fund_window_id — rubric scorer applies to network grants only",
        }), 400

    window = FundWindow.query.get(grant.fund_window_id)
    rubric = window.default_rubric() if window else None
    if not rubric or not rubric.criteria:
        return jsonify({"success": False, "error": "Window has no rubric"}), 400

    # Pull the application's submission text. The shape depends on the
    # existing Application model; we try the common field names + fall
    # back to the JSON dump.
    submission_text = (
        getattr(app_row, "submission_text", None)
        or getattr(app_row, "responses_json", None)
        or getattr(app_row, "narrative", None)
        or ""
    )
    if not isinstance(submission_text, str):
        submission_text = str(submission_text)

    org = (
        Organization.query.get(app_row.org_id) if getattr(app_row, "org_id", None) else None
    )

    result = NetworkAIService.score_application_against_rubric(
        application_text=submission_text,
        rubric_criteria=[c.to_dict() for c in rubric.criteria],
        org_name=org.name if org else None,
        window_name=window.name if window else None,
    )
    return jsonify({"success": True, **result})


# =============================================================================
# 2. Direct-to-Community Ratio Classifier
# =============================================================================

@network_ai_bp.route(
    "/applications/<int:application_id>/ai-classify-budget",
    methods=["POST"],
)
@login_required
def api_ai_classify_budget(application_id):
    app_row = Application.query.get_or_404(application_id)
    body = get_request_json() or {}
    budget_lines = body.get("budget_lines") or []
    is_consortium = bool(body.get("is_consortium", False))

    grant = Grant.query.get(app_row.grant_id) if hasattr(app_row, "grant_id") else None
    window = FundWindow.query.get(grant.fund_window_id) if grant and grant.fund_window_id else None
    threshold_single = (
        float(window.direct_to_community_single_min_pct)
        if window and window.direct_to_community_single_min_pct is not None
        else 80.0
    )
    threshold_consortium = (
        float(window.direct_to_community_consortium_min_pct)
        if window and window.direct_to_community_consortium_min_pct is not None
        else 70.0
    )

    result = NetworkAIService.classify_budget_direct_to_community(
        budget_lines=budget_lines,
        is_consortium=is_consortium,
        threshold_single_pct=threshold_single,
        threshold_consortium_pct=threshold_consortium,
    )
    return jsonify({"success": True, **result})


# =============================================================================
# 3. Membership Reviewer Brief
# =============================================================================

@network_ai_bp.route(
    "/network/membership/<int:membership_id>/ai-brief",
    methods=["POST"],
)
@role_required("admin")
def api_ai_membership_brief(membership_id):
    m = NetworkMembership.query.get_or_404(membership_id)
    org = Organization.query.get(m.org_id)

    # Pull capacity-assessment overall score if linked
    overall = None
    if m.capacity_assessment_id:
        try:
            from app.models import Assessment
            a = Assessment.query.get(m.capacity_assessment_id)
            overall = float(a.overall_score) if a and a.overall_score is not None else None
        except Exception:
            pass

    # Similar approved members — last 5 active memberships in same country
    similar = []
    if m.country:
        rows = (
            NetworkMembership.query
            .filter_by(network_id=m.network_id, country=m.country, status="active")
            .filter(NetworkMembership.id != m.id)
            .limit(5)
            .all()
        )
        for r in rows:
            o = Organization.query.get(r.org_id)
            if o:
                similar.append(o.name)

    result = NetworkAIService.membership_reviewer_brief(
        org_name=org.name if org else None,
        country=m.country,
        eligibility_answers=m.get_eligibility_answers(),
        capacity_assessment_score=overall,
        required_documents_status=m.get_required_documents_status(),
        similar_approved=similar,
    )
    return jsonify({"success": True, **result})


# =============================================================================
# 4. Crisis Monitoring Row Drafter
# =============================================================================

@network_ai_bp.route(
    "/crisis/reports/<int:report_id>/rows/<int:row_id>/ai-draft",
    methods=["POST"],
)
@role_required("admin")
def api_ai_crisis_draft(report_id, row_id):
    row = CrisisMonitoringRow.query.filter_by(
        id=row_id, report_id=report_id,
    ).first_or_404()

    body = get_request_json() or {}
    public_news = (body.get("public_news_summary") or "").strip() or None

    # Pull pending member signals for this country
    signals = (
        CrisisSignal.query
        .filter_by(country=row.country, status="pending")
        .order_by(CrisisSignal.submitted_at.desc())
        .limit(8)
        .all()
    )
    signal_texts = [s.description for s in signals]

    result = NetworkAIService.crisis_monitoring_draft_row_narrative(
        country=row.country,
        event_type=row.event_type,
        public_news_summary=public_news,
        member_signals=signal_texts,
        hdi_band=row.hdi_band,
    )

    # If apply=true, persist the suggestions onto the row.
    if body.get("apply") and result.get("ok"):
        if result.get("narrative") and not row.narrative:
            row.narrative = result["narrative"]
        sb = result.get("suggested_bands") or {}
        if sb:
            row.hdi_band = row.hdi_band or sb.get("hdi_band")
            row.gov_capacity_band = row.gov_capacity_band or sb.get("gov_capacity_band")
            row.people_impacted_estimate = (
                row.people_impacted_estimate
                or sb.get("people_impacted_estimate")
            )
            row.attention_band = row.attention_band or sb.get("attention_band")
            # Re-score with the updated bands
            row.composite_score = CrisisMonitoringRow.compute_composite_score(
                hdi_band=row.hdi_band,
                gov_capacity_band=row.gov_capacity_band,
                people_impacted_estimate=row.people_impacted_estimate,
                attention_band=row.attention_band,
            )
        db.session.commit()

    return jsonify({"success": True, **result, "row": row.to_dict()})


# =============================================================================
# 5. Declaration Draft Assist
# =============================================================================

@network_ai_bp.route(
    "/declarations/<int:declaration_id>/ai-draft-assist",
    methods=["POST"],
)
@role_required("admin")
def api_ai_declaration_assist(declaration_id):
    d = EmergencyDeclaration.query.get_or_404(declaration_id)
    if d.status not in ("draft",):
        return jsonify({"success": False, "error": "Draft assist only available on drafts"}), 409

    # Evidence narrative (from linked monitoring row)
    evidence_narrative = None
    if d.evidence_row_id:
        row = CrisisMonitoringRow.query.get(d.evidence_row_id)
        if row:
            evidence_narrative = row.narrative

    # Active members in country
    members_in_country = []
    member_sectors: dict[str, list[str]] = {}
    if d.country:
        rows = (
            NetworkMembership.query
            .filter_by(network_id=d.network_id, country=d.country, status="active")
            .all()
        )
        for r in rows:
            org = Organization.query.get(r.org_id)
            if not org:
                continue
            members_in_country.append(org.name)
            # Sectors are stored as JSON on Organization in this codebase
            sectors = []
            try:
                from app.utils.helpers import _json_load
                sectors_raw = getattr(org, "sectors_json", None) or getattr(org, "sectors", None)
                sectors = _json_load(sectors_raw) or []
            except Exception:
                pass
            if sectors:
                member_sectors[org.name] = sectors[:5]

    result = NetworkAIService.declaration_draft_assist(
        country=d.country or "",
        crisis_type=d.crisis_type,
        evidence_narrative=evidence_narrative,
        members_in_country=members_in_country,
        member_sectors=member_sectors,
        proposed_total_amount=(
            float(d.proposed_total_amount)
            if d.proposed_total_amount is not None else None
        ),
    )

    # If apply=true, write the summary into the declaration. Shortlist
    # suggestions stay as suggestions; the drafter applies them manually.
    body = get_request_json() or {}
    if body.get("apply") and result.get("ok") and result.get("summary_md"):
        if not d.summary_md:
            d.summary_md = result["summary_md"]
            db.session.commit()

    return jsonify({"success": True, **result, "declaration": d.to_dict()})


# =============================================================================
# 6. Window Narrative Generator
# =============================================================================

@network_ai_bp.route(
    "/windows/<int:window_id>/report/ai-narrative",
    methods=["POST"],
)
@role_required("admin")
def api_ai_window_narrative(window_id):
    w = FundWindow.query.get_or_404(window_id)
    nid = get_current_network_id()
    if nid and w.fund.network_id != nid:
        return jsonify({"success": False, "error": "Wrong network context"}), 403

    payload = WindowReportService.build(window_id)
    if not payload.get("success"):
        return jsonify(payload), 400

    result = NetworkAIService.window_narrative(window_report_payload=payload)
    return jsonify({"success": True, **result})


# =============================================================================
# 7. Cross-Window Patterns
# =============================================================================

@network_ai_bp.route("/networks/patterns/ai-detect", methods=["POST"])
@role_required("admin")
def api_ai_cross_window_patterns():
    nid = get_current_network_id()
    if not nid:
        return jsonify({"success": False, "error": "Network not resolved"}), 400

    # Build summaries for every window in every fund owned by this network.
    from app.models import Fund
    funds = Fund.query.filter_by(network_id=nid).all()
    summaries = []
    for f in funds:
        for w in f.windows:
            try:
                summaries.append(WindowReportService.build(w.id))
            except Exception:
                pass
    summaries = [s for s in summaries if s.get("success")]
    if not summaries:
        return jsonify({"success": True, "patterns": [],
                        "note": "no window data available"})

    result = NetworkAIService.cross_window_patterns(window_summaries=summaries)
    return jsonify({"success": True, **result})
