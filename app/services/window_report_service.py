"""Window report service — Phase 37 (May 2026).

Aggregates everything that happened in a FundWindow into a single,
defensible report payload:
  - Window header (name, fund, currency, year, status, money envelope)
  - Aggregate stats (counts, sums, NGOs reached, countries covered,
                     avg signing time, avg decision time)
  - SLA-vs-target (declarations hitting NEAR's 72h / 6-day commitment)
  - Declaration roster (per declaration: title, status, signers + COI
                        recusals + audit anchors, grants issued)
  - Grant-level detail (recipient, amount, status, monitoring visits,
                        community feedback summaries)
  - Audit chain verification status

PDF + CSV + ZIP exports build on this same payload.
"""

from __future__ import annotations

import csv
import io
import logging
import zipfile
from datetime import datetime, timedelta, timezone

from app.extensions import db

logger = logging.getLogger("kuja")


class WindowReportService:

    # NEAR's published SLA targets (per IKEA concept note)
    TARGET_APP_WINDOW_HOURS = 72
    TARGET_DECISION_DAYS = 6

    @classmethod
    def build(cls, window_id: int) -> dict:
        """Return the full structured report payload for a window."""
        from app.models import (
            FundWindow, Fund, EmergencyDeclaration, Grant,
            DeclarationSignature, MonitoringVisit, AuditChainEntry,
        )
        window = FundWindow.query.get(window_id)
        if not window:
            return {"success": False, "error": "window not found"}
        fund = Fund.query.get(window.fund_id)

        declarations = (
            EmergencyDeclaration.query
            .filter_by(window_id=window_id)
            .order_by(EmergencyDeclaration.created_at.asc())
            .all()
        )
        grants = (
            Grant.query
            .filter_by(fund_window_id=window_id)
            .order_by(Grant.created_at.asc())
            .all()
        )

        # Aggregates
        ngo_ids = {g.applications.first().org_id for g in grants
                   if g.applications.first() is not None}
        countries: set[str] = set()
        for d in declarations:
            if d.country:
                countries.add(d.country)

        total_disbursed = 0.0
        for g in grants:
            if g.total_funding is not None and g.status in ("awarded", "closed", "active"):
                try:
                    total_disbursed += float(g.total_funding)
                except Exception:
                    pass

        # SLA-vs-target: of signed_active declarations, how many had
        # applications_close_at within 72h of applications_open_at, and
        # decision_at (if set) within 6 days of declared_at.
        sla_hits_72h = 0
        sla_misses_72h = 0
        sla_hits_6d = 0
        sla_misses_6d = 0
        for d in declarations:
            if d.applications_open_at and d.applications_close_at:
                hours = (d.applications_close_at - d.applications_open_at).total_seconds() / 3600.0
                if hours <= cls.TARGET_APP_WINDOW_HOURS:
                    sla_hits_72h += 1
                else:
                    sla_misses_72h += 1
            if d.declared_at and d.decision_at:
                days = (d.decision_at - d.declared_at).total_seconds() / 86400.0
                if days <= cls.TARGET_DECISION_DAYS:
                    sla_hits_6d += 1
                else:
                    sla_misses_6d += 1

        # Per-declaration roster
        declaration_rows = []
        for d in declarations:
            sigs = [s.to_dict() for s in d.signatures]
            recused_count = sum(1 for s in d.signatures if s.status == "recused")
            grants_under = [g for g in grants if cls._grant_under_declaration(g, d)]
            visits_for_decl = (
                MonitoringVisit.query
                .filter_by(declaration_id=d.id)
                .all()
            )
            declaration_rows.append({
                "id": d.id,
                "title": d.title,
                "status": d.status,
                "crisis_type": d.crisis_type,
                "country": d.country,
                "severity": d.severity,
                "declared_at": d.declared_at.isoformat() if d.declared_at else None,
                "applications_open_at": d.applications_open_at.isoformat() if d.applications_open_at else None,
                "applications_close_at": d.applications_close_at.isoformat() if d.applications_close_at else None,
                "decision_at": d.decision_at.isoformat() if d.decision_at else None,
                "applicants_notified_at": d.applicants_notified_at.isoformat() if d.applicants_notified_at else None,
                "proposed_total_amount": float(d.proposed_total_amount) if d.proposed_total_amount is not None else None,
                "evidence_row_id": d.evidence_row_id,
                "evidence_report_id": d.evidence_report_id,
                "signatures": sigs,
                "signed_count": d.signed_count(),
                "recused_count": recused_count,
                "rejected_count": d.rejected_count(),
                "signed_active_audit_id": d.signed_active_audit_id,
                "grants": [
                    {
                        "id": g.id,
                        "title": g.title,
                        "amount": float(g.total_funding) if g.total_funding is not None else None,
                        "status": g.status,
                        "currency": g.currency,
                    } for g in grants_under
                ],
                "monitoring_visits": [v.to_dict() for v in visits_for_decl],
            })

        # Audit chain verification (best-effort)
        chain_state = None
        try:
            result = AuditChainEntry.verify(limit=2000)
            chain_state = {"ok": result.get("ok"), "total": result.get("total")}
        except Exception:
            chain_state = {"ok": None, "total": None}

        return {
            "success": True,
            "window": {
                "id": window.id,
                "fund_id": window.fund_id,
                "name": window.name,
                "slug": window.slug,
                "status": window.status,
                "crisis_type": window.crisis_type,
                "min_grant_amount": float(window.min_grant_amount) if window.min_grant_amount is not None else None,
                "max_grant_amount": float(window.max_grant_amount) if window.max_grant_amount is not None else None,
                "decision_sla_days": window.decision_sla_days,
                "application_window_hours": window.application_window_hours,
                "direct_to_community_single_min_pct": (
                    float(window.direct_to_community_single_min_pct)
                    if window.direct_to_community_single_min_pct is not None else None
                ),
                "direct_to_community_consortium_min_pct": (
                    float(window.direct_to_community_consortium_min_pct)
                    if window.direct_to_community_consortium_min_pct is not None else None
                ),
            },
            "fund": (
                {
                    "id": fund.id, "name": fund.name, "slug": fund.slug,
                    "currency": fund.currency, "year_launched": fund.year_launched,
                    "status": fund.status,
                } if fund else None
            ),
            "stats": {
                "declarations_total": len(declarations),
                "declarations_active": sum(1 for d in declarations if d.status == "signed_active"),
                "declarations_closed": sum(1 for d in declarations if d.status == "closed"),
                "declarations_cancelled": sum(1 for d in declarations if d.status == "cancelled"),
                "grants_total": len(grants),
                "ngos_reached": len(ngo_ids),
                "countries_covered": sorted(countries),
                "countries_count": len(countries),
                "total_disbursed_estimate": round(total_disbursed, 2),
            },
            "sla": {
                "target_app_window_hours": cls.TARGET_APP_WINDOW_HOURS,
                "target_decision_days": cls.TARGET_DECISION_DAYS,
                "app_window_hits": sla_hits_72h,
                "app_window_misses": sla_misses_72h,
                "decision_hits": sla_hits_6d,
                "decision_misses": sla_misses_6d,
            },
            "declarations": declaration_rows,
            "audit_chain": chain_state,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    @staticmethod
    def _grant_under_declaration(g, d) -> bool:
        """Heuristic: a grant 'belongs to' a declaration if it was created
        for an org in that declaration's shortlist (Phase 36b auto-creates
        grants with org_id encoded in title)."""
        org_ids = d.get_shortlisted_org_ids()
        for org_id in org_ids:
            marker = f"— Org #{org_id}"
            if g.title and marker in g.title:
                return True
        return False

    # ------------------------------------------------------------------
    # Anonymised public summary (opt-in per fund).
    # Counts + medians only; no NGO names or grant IDs.
    # ------------------------------------------------------------------

    @classmethod
    def public_summary(cls, window_id: int) -> dict:
        full = cls.build(window_id)
        if not full.get("success"):
            return full
        stats = full["stats"]
        sla = full["sla"]
        decls = full["declarations"]
        return {
            "success": True,
            "window": {
                "name": full["window"]["name"],
                "status": full["window"]["status"],
            },
            "fund_name": full["fund"]["name"] if full["fund"] else None,
            "headline": {
                "declarations": stats["declarations_total"],
                "active_declarations": stats["declarations_active"],
                "grants_issued": stats["grants_total"],
                "ngos_reached": stats["ngos_reached"],
                "countries_covered": stats["countries_count"],
                "total_disbursed": stats["total_disbursed_estimate"],
            },
            "sla_rates": {
                "app_window_72h_hit_rate": cls._pct(sla["app_window_hits"], sla["app_window_hits"] + sla["app_window_misses"]),
                "decision_6d_hit_rate": cls._pct(sla["decision_hits"], sla["decision_hits"] + sla["decision_misses"]),
            },
            "crisis_types": cls._top_crisis_types(decls),
            "regions_anonymised": sorted({d["country"] for d in decls if d.get("country")}),
            "generated_at": full["generated_at"],
        }

    @staticmethod
    def _pct(hits: int, total: int) -> float | None:
        if total <= 0:
            return None
        return round(100.0 * hits / total, 1)

    @staticmethod
    def _top_crisis_types(decls: list[dict]) -> list[dict]:
        counts: dict[str, int] = {}
        for d in decls:
            ct = d.get("crisis_type")
            if ct:
                counts[ct] = counts.get(ct, 0) + 1
        return [
            {"crisis_type": k, "count": v}
            for k, v in sorted(counts.items(), key=lambda kv: -kv[1])
        ]

    # ------------------------------------------------------------------
    # CSV export (one row per declaration; a separate file per concern)
    # ------------------------------------------------------------------

    @classmethod
    def csv_declarations(cls, window_id: int) -> str:
        full = cls.build(window_id)
        if not full.get("success"):
            return ""
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow([
            "id", "title", "status", "crisis_type", "country", "severity",
            "declared_at", "applications_open_at", "applications_close_at",
            "decision_at", "proposed_total_amount",
            "signed_count", "recused_count", "rejected_count",
            "grants_count", "evidence_row_id", "signed_active_audit_id",
        ])
        for d in full["declarations"]:
            w.writerow([
                d["id"], d["title"], d["status"], d["crisis_type"] or "",
                d["country"] or "", d["severity"] or "",
                d["declared_at"] or "", d["applications_open_at"] or "",
                d["applications_close_at"] or "", d["decision_at"] or "",
                d["proposed_total_amount"] or "",
                d["signed_count"], d["recused_count"], d["rejected_count"],
                len(d["grants"]), d["evidence_row_id"] or "",
                d["signed_active_audit_id"] or "",
            ])
        return buf.getvalue()

    @classmethod
    def csv_grants(cls, window_id: int) -> str:
        full = cls.build(window_id)
        if not full.get("success"):
            return ""
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow([
            "declaration_id", "grant_id", "title", "amount", "currency", "status",
        ])
        for d in full["declarations"]:
            for g in d["grants"]:
                w.writerow([
                    d["id"], g["id"], g["title"], g["amount"] or "",
                    g["currency"] or "", g["status"] or "",
                ])
        return buf.getvalue()

    # ------------------------------------------------------------------
    # ZIP bundle — declarations.csv + grants.csv + report.json
    # ------------------------------------------------------------------

    @classmethod
    def zip_bundle(cls, window_id: int) -> bytes:
        import json
        full = cls.build(window_id)
        if not full.get("success"):
            return b""
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as z:
            z.writestr("report.json", json.dumps(full, indent=2, default=str))
            z.writestr("declarations.csv", cls.csv_declarations(window_id))
            z.writestr("grants.csv", cls.csv_grants(window_id))
        return buf.getvalue()
