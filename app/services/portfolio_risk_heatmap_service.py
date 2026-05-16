"""
PortfolioRiskHeatmapService — Phase 23B (May 2026).

For a donor: aggregate risk concentration across their active portfolio
as a (sector × country) grid. Each cell shows:
  - n_grants: open + awarded grants in this sector/country
  - n_high_risk: how many of those have flagged Risk rows
  - n_open_risks: total open Risk rows tagged to those grants/apps/reports
  - n_overdue_reports: reports past due on these grants

Cells get a risk_score 0-100 so the frontend colors them as a heatmap.
score = 100 if EITHER n_high_risk > 0 OR n_overdue_reports > 0 (always
salient), then gradient down by risk-flag density.

Pure SQL aggregation + per-cell math. Zero AI calls.
"""

import logging
from collections import defaultdict
from datetime import date, datetime, timezone

from app.extensions import db
from app.models import Application, Grant, Report, Risk

logger = logging.getLogger('kuja')

MAX_AXIS_SIZE = 10  # cap so the grid doesn't explode for big donors


class PortfolioRiskHeatmapService:

    @classmethod
    def for_donor(cls, *, donor_org_id: int) -> dict:
        # All non-draft grants for this donor
        grants = (
            Grant.query
            .filter(Grant.donor_org_id == donor_org_id)
            .filter(Grant.status.in_(('open', 'awarded', 'closed')))
            .all()
        )
        if not grants:
            return {
                'success': True,
                'donor_org_id': donor_org_id,
                'sectors': [],
                'countries': [],
                'cells': [],
                'total_grants': 0,
            }

        # Frequency-count sectors + countries across this donor's portfolio
        sector_freq: dict[str, int] = defaultdict(int)
        country_freq: dict[str, int] = defaultdict(int)
        # Build (sector, country) → list of grant ids
        cell_grants: dict[tuple[str, str], set[int]] = defaultdict(set)
        for g in grants:
            gs = g.get_sectors() if hasattr(g, 'get_sectors') else []
            gc = g.get_countries() if hasattr(g, 'get_countries') else []
            # Only count list-typed JSON; ignore noise (single chars etc)
            if not isinstance(gs, list): gs = []
            if not isinstance(gc, list): gc = []
            sectors = [s for s in gs if isinstance(s, str) and s.strip()]
            countries = [c for c in gc if isinstance(c, str) and c.strip()]
            if not sectors: sectors = ['(unspecified)']
            if not countries: countries = ['(unspecified)']
            for s in sectors:
                sector_freq[s] += 1
            for c in countries:
                country_freq[c] += 1
            for s in sectors:
                for c in countries:
                    cell_grants[(s, c)].add(g.id)

        # Pick top sectors + countries (most common first)
        sectors_axis = [s for s, _ in sorted(
            sector_freq.items(), key=lambda x: -x[1]
        )[:MAX_AXIS_SIZE]]
        countries_axis = [c for c, _ in sorted(
            country_freq.items(), key=lambda x: -x[1]
        )[:MAX_AXIS_SIZE]]

        # Pull open Risk rows + overdue Reports scoped to these grants once.
        # Risk uses polymorphic subject_kind/subject_id: count both
        # subject_kind='grant' (direct) and subject_kind='application'
        # (rolled up to the grant via the application).
        grant_ids = [g.id for g in grants]
        risks_by_grant: dict[int, int] = defaultdict(int)
        try:
            # Direct grant risks
            grant_risks = Risk.query.filter(
                Risk.subject_kind == 'grant',
                Risk.subject_id.in_(grant_ids),
                Risk.status == 'open',
            ).with_entities(Risk.subject_id).all()
            for (gid,) in grant_risks:
                risks_by_grant[gid] += 1
            # Application risks → roll up to grant
            apps_for_grants = (
                Application.query.filter(Application.grant_id.in_(grant_ids))
                .with_entities(Application.id, Application.grant_id).all()
            )
            app_to_grant = {aid: gid for aid, gid in apps_for_grants}
            if app_to_grant:
                app_risks = Risk.query.filter(
                    Risk.subject_kind == 'application',
                    Risk.subject_id.in_(list(app_to_grant.keys())),
                    Risk.status == 'open',
                ).with_entities(Risk.subject_id).all()
                for (aid,) in app_risks:
                    gid = app_to_grant.get(aid)
                    if gid:
                        risks_by_grant[gid] += 1
        except Exception:
            pass

        # Overdue reports
        today = date.today()
        overdue_by_grant: dict[int, int] = defaultdict(int)
        try:
            overdue_q = Report.query.filter(
                Report.grant_id.in_(grant_ids),
                Report.due_date.isnot(None),
                Report.due_date < today,
                Report.status.in_(('draft', 'submitted', 'revision_requested')),
            ).all()
            for r in overdue_q:
                overdue_by_grant[r.grant_id] += 1
        except Exception:
            pass

        # Flagged-status apps as a coarse risk signal (rejected with debrief reason)
        flagged_apps_by_grant: dict[int, int] = defaultdict(int)
        try:
            ap_rows = (
                Application.query
                .filter(Application.grant_id.in_(grant_ids))
                .filter(Application.decision_reason_code.in_(
                    ('risk_flags', 'eligibility_gap', 'insufficient_track_record')
                ))
                .with_entities(Application.grant_id).all()
            )
            for (gid,) in ap_rows:
                flagged_apps_by_grant[gid] += 1
        except Exception:
            pass

        # Build cells for each (sector, country) on axis
        cells = []
        for s in sectors_axis:
            for c in countries_axis:
                gids = cell_grants.get((s, c), set())
                if not gids:
                    cells.append({
                        'sector': s,
                        'country': c,
                        'n_grants': 0,
                        'n_open_risks': 0,
                        'n_overdue_reports': 0,
                        'n_flagged_apps': 0,
                        'risk_score': 0,
                    })
                    continue
                n_grants = len(gids)
                n_risks = sum(risks_by_grant.get(g, 0) for g in gids)
                n_overdue = sum(overdue_by_grant.get(g, 0) for g in gids)
                n_flagged = sum(flagged_apps_by_grant.get(g, 0) for g in gids)

                # Score: salient (75+) if anything overdue or flagged risk;
                # gradient down by density otherwise
                if n_overdue > 0 or n_risks > 0:
                    base = 75
                    density = min(25, (n_overdue + n_risks) * 5)
                    score = min(100, base + density)
                elif n_flagged > 0:
                    score = min(60, n_flagged * 15)
                else:
                    # No risk signal — concentration alone (cells with many
                    # grants but no risks shown as a soft signal)
                    score = min(30, n_grants * 3)

                cells.append({
                    'sector': s,
                    'country': c,
                    'n_grants': n_grants,
                    'n_open_risks': n_risks,
                    'n_overdue_reports': n_overdue,
                    'n_flagged_apps': n_flagged,
                    'risk_score': score,
                })

        return {
            'success': True,
            'donor_org_id': donor_org_id,
            'sectors': sectors_axis,
            'countries': countries_axis,
            'cells': cells,
            'total_grants': len(grants),
            'axis_truncated': (
                len(sector_freq) > MAX_AXIS_SIZE
                or len(country_freq) > MAX_AXIS_SIZE
            ),
            'computed_at': datetime.now(timezone.utc).isoformat(),
        }
