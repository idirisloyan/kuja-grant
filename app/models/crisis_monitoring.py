"""Crisis Monitoring models — Phase 35 (May 2026).

CrisisMonitoringReport          — weekly per-network report
    └── CrisisMonitoringRow     — per-country / per-event row with the
                                  4-factor formula + composite score

CrisisSignal                    — member-submitted ad-hoc alert that
                                  the secretariat reviews and rolls into
                                  the next report (or escalates).

Workflow:
  Cron job every Sunday 00:00 UTC → creates a new draft report for each
  active network, populates rows from public news + signal queue, AI
  drafts the narrative + composite_score. Secretariat reviews + edits
  + publishes (status: draft → published). Once published, the OB uses
  it as evidence when declaring crises (Phase 36 mandatory link).
"""

from datetime import datetime, timezone

from app.extensions import db
from app.utils.helpers import _json_load, _json_dump


REPORT_STATUSES = (
    "draft",       # cron-drafted, not yet reviewed
    "in_review",   # secretariat editing
    "published",   # OB can cite from here
    "archived",    # historical; no longer current
)

SIGNAL_STATUSES = (
    "pending",     # submitted, not yet triaged
    "rolled_in",   # incorporated into a published report
    "escalated",   # secretariat fast-tracked to OB
    "dismissed",   # not material
)

BAND_VALUES = ("low", "medium", "high")  # used by gov_capacity, attention
HDI_BANDS = ("low_hdi", "medium_hdi", "high_hdi")


# ===============================================================
# CrisisMonitoringReport
# ===============================================================

class CrisisMonitoringReport(db.Model):
    """A weekly per-network monitoring report."""

    __tablename__ = "crisis_monitoring_reports"
    __table_args__ = (
        db.Index(
            "ix_crisis_reports_network_period",
            "network_id", "period_start",
        ),
        db.Index(
            "ix_crisis_reports_network_status",
            "network_id", "status",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    network_id = db.Column(
        db.Integer, db.ForeignKey("networks.id"), nullable=False,
    )
    period_start = db.Column(db.Date, nullable=False)
    period_end = db.Column(db.Date, nullable=False)
    summary_md = db.Column(db.Text, nullable=True)
    # 'cron' = auto-drafted by weekly job; 'manual' = secretariat created.
    generated_by = db.Column(db.String(20), nullable=False, default="manual")
    status = db.Column(db.String(40), nullable=False, default="draft")
    # Anchor to the audit chain for tamper-evidence on publication.
    cron_anchor_audit_id = db.Column(db.Integer, nullable=True)
    published_at = db.Column(db.DateTime, nullable=True)
    published_by_user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True,
    )

    created_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    rows = db.relationship(
        "CrisisMonitoringRow",
        backref="report",
        order_by="CrisisMonitoringRow.composite_score.desc().nullslast()",
        cascade="all, delete-orphan",
    )

    def to_dict(self, *, include_rows: bool = False) -> dict:
        d = {
            "id": self.id,
            "network_id": self.network_id,
            "period_start": self.period_start.isoformat() if self.period_start else None,
            "period_end": self.period_end.isoformat() if self.period_end else None,
            "summary_md": self.summary_md,
            "generated_by": self.generated_by,
            "status": self.status,
            "cron_anchor_audit_id": self.cron_anchor_audit_id,
            "published_at": self.published_at.isoformat() if self.published_at else None,
            "published_by_user_id": self.published_by_user_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "row_count": len(self.rows) if self.rows is not None else 0,
            "flagged_row_count": (
                sum(1 for r in self.rows if r.flagged_for_ob) if self.rows else 0
            ),
        }
        if include_rows:
            d["rows"] = [r.to_dict() for r in self.rows]
        return d

    def publish(self, *, by_user_id: int, actor_email: str | None = None) -> bool:
        """Transition draft|in_review → published. Audit-anchored."""
        if self.status not in ("draft", "in_review"):
            return False
        self.status = "published"
        self.published_at = datetime.now(timezone.utc)
        self.published_by_user_id = by_user_id
        db.session.flush()
        try:
            from app.models import AuditChainEntry
            entry = AuditChainEntry.append(
                action="crisis.monitoring_report.published",
                actor_email=actor_email,
                subject_kind="crisis_monitoring_report",
                subject_id=self.id,
                details={
                    "network_id": self.network_id,
                    "period_start": self.period_start.isoformat() if self.period_start else None,
                    "period_end": self.period_end.isoformat() if self.period_end else None,
                    "row_count": len(self.rows),
                    "flagged_rows": [r.country for r in self.rows if r.flagged_for_ob],
                },
            )
            if entry:
                self.cron_anchor_audit_id = entry.id
        except Exception:
            pass
        return True


# ===============================================================
# CrisisMonitoringRow
# ===============================================================

class CrisisMonitoringRow(db.Model):
    """One country/event row inside a monitoring report."""

    __tablename__ = "crisis_monitoring_rows"
    __table_args__ = (
        db.Index(
            "ix_crisis_rows_report_score",
            "report_id", "composite_score",
        ),
        db.Index("ix_crisis_rows_country", "country"),
    )

    id = db.Column(db.Integer, primary_key=True)
    report_id = db.Column(
        db.Integer, db.ForeignKey("crisis_monitoring_reports.id"),
        nullable=False,
    )
    country = db.Column(db.String(3), nullable=False)  # ISO 3166 alpha-3
    region = db.Column(db.String(80), nullable=True)
    event_type = db.Column(db.String(80), nullable=True)
    event_title = db.Column(db.String(200), nullable=True)

    # 4-factor inputs
    hdi_band = db.Column(db.String(20), nullable=True)
    gov_capacity_band = db.Column(db.String(20), nullable=True)
    people_impacted_estimate = db.Column(db.Integer, nullable=True)
    attention_band = db.Column(db.String(20), nullable=True)

    # Output
    composite_score = db.Column(db.Numeric(6, 2), nullable=True)
    narrative = db.Column(db.Text, nullable=True)
    flagged_for_ob = db.Column(db.Boolean, nullable=False, default=False)
    source_links_json = db.Column(db.Text, nullable=True)

    created_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def get_source_links(self) -> list[dict]:
        val = _json_load(self.source_links_json)
        return val if isinstance(val, list) else []

    def set_source_links(self, value) -> None:
        self.source_links_json = _json_dump(value or [])

    @staticmethod
    def compute_composite_score(
        *,
        hdi_band: str | None,
        gov_capacity_band: str | None,
        people_impacted_estimate: int | None,
        attention_band: str | None,
    ) -> float:
        """Deterministic 4-factor scorer. Returns 0-100.

        Heuristic (mirrors NEAR's narrative formula — lower HDI/capacity
        + larger impact + LOWER media attention → higher urgency for the
        OB to pay attention).
        """
        score = 0.0

        # HDI weight: lower HDI = more vulnerable.
        hdi_weights = {"low_hdi": 30.0, "medium_hdi": 18.0, "high_hdi": 8.0}
        score += hdi_weights.get(hdi_band or "", 15.0)

        # Government capacity: lower = state can't respond alone.
        gov_weights = {"low": 25.0, "medium": 15.0, "high": 5.0}
        score += gov_weights.get(gov_capacity_band or "", 13.0)

        # People impacted (log-ish bucketing so a 1M-person crisis isn't
        # 100× a 10k-person crisis).
        n = people_impacted_estimate or 0
        if n >= 1_000_000:
            score += 30.0
        elif n >= 100_000:
            score += 22.0
        elif n >= 10_000:
            score += 14.0
        elif n >= 1_000:
            score += 7.0
        else:
            score += 2.0

        # Attention INVERSION: low media attention means a forgotten crisis
        # that deserves more weight (NEAR explicitly cares about this).
        attn_weights = {"low": 15.0, "medium": 8.0, "high": 2.0}
        score += attn_weights.get(attention_band or "", 8.0)

        return round(min(100.0, max(0.0, score)), 2)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "report_id": self.report_id,
            "country": self.country,
            "region": self.region,
            "event_type": self.event_type,
            "event_title": self.event_title,
            "hdi_band": self.hdi_band,
            "gov_capacity_band": self.gov_capacity_band,
            "people_impacted_estimate": self.people_impacted_estimate,
            "attention_band": self.attention_band,
            "composite_score": float(self.composite_score) if self.composite_score is not None else None,
            "narrative": self.narrative,
            "flagged_for_ob": self.flagged_for_ob,
            "source_links": self.get_source_links(),
        }


# ===============================================================
# CrisisSignal
# ===============================================================

class CrisisSignal(db.Model):
    """Member-submitted ad-hoc crisis alert (between weekly reports)."""

    __tablename__ = "crisis_signals"
    __table_args__ = (
        db.Index(
            "ix_crisis_signals_network_status",
            "network_id", "status",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    network_id = db.Column(
        db.Integer, db.ForeignKey("networks.id"), nullable=False,
    )
    submitted_by_org_id = db.Column(
        db.Integer, db.ForeignKey("organizations.id"), nullable=True,
    )
    submitted_by_user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True,
    )
    country = db.Column(db.String(3), nullable=False)
    event_type = db.Column(db.String(80), nullable=True)
    description = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(40), nullable=False, default="pending")
    rolled_into_report_id = db.Column(
        db.Integer, db.ForeignKey("crisis_monitoring_reports.id"),
        nullable=True,
    )
    submitted_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "network_id": self.network_id,
            "submitted_by_org_id": self.submitted_by_org_id,
            "submitted_by_user_id": self.submitted_by_user_id,
            "country": self.country,
            "event_type": self.event_type,
            "description": self.description,
            "status": self.status,
            "rolled_into_report_id": self.rolled_into_report_id,
            "submitted_at": self.submitted_at.isoformat() if self.submitted_at else None,
        }
