"""
DonorCohortAnalyticsService — Phase 24C (May 2026).

Sister to PeerBenchmarkService but answers a different question. Peer
benchmarks tell a donor how they stack up vs other donors on a few
*operational* metrics (decision speed, decline rate, portfolio size).
This service tells a donor how the *NGOs they fund* stack up against
the NGOs that other donors fund — the "portfolio quality" lens.

Concretely, for a donor we compute (over their awarded applications):
  - avg_grantee_capacity_score
  - avg_ai_score_at_award          (the AI quality of apps they greenlit)
  - country_diversity_pct           (distinct countries / total grantees)
  - sector_diversity_pct
  - small_org_funding_share_pct     (orgs whose capacity_score < 60 — how
                                     much risk the donor is willing to take
                                     on emerging organizations; many donors
                                     systematically over-fund the same well-
                                     known partners, this surfaces it)
  - report_on_time_rate_pct         (reports submitted by their grantees on
                                     time / total non-draft reports)

Then we compute the same metrics across *all other donors' awarded
portfolios* and report median + percentile. Verdict bucket follows the
PeerBenchmarkService convention so the UI can share one row component.

Anonymity: no donor or NGO name ever leaves this service. Counts +
medians only. Below MIN_COHORT donors, returns source='sparse'.

Honesty: per-metric, if the caller donor has fewer than MIN_SAMPLE
grantees/reports backing a metric, we omit that row (don't lie with
N=1).
"""

import logging
from collections import defaultdict
from datetime import datetime, timezone

from app.extensions import db
from app.models import (
    Application, Assessment, Grant, Organization, Report,
)

logger = logging.getLogger('kuja')

MIN_COHORT = 3            # other-donors needed for a cohort comparison
MIN_SAMPLE = 2            # caller-side grantees/reports needed per metric


class DonorCohortAnalyticsService:

    @classmethod
    def for_donor(cls, *, donor_org_id: int) -> dict:
        donor_org = db.session.get(Organization, donor_org_id)
        if not donor_org or donor_org.org_type != 'donor':
            return {'success': False, 'reason': 'not_donor'}

        # All donor orgs (excluding the caller)
        other_donors = Organization.query.filter(
            Organization.org_type == 'donor',
            Organization.id != donor_org_id,
        ).all()
        if len(other_donors) < MIN_COHORT:
            return {
                'success': True,
                'source': 'sparse',
                'cohort_size': len(other_donors),
                'metrics': [],
                'computed_at': datetime.now(timezone.utc).isoformat(),
            }

        # Self portfolio numbers
        self_metrics = cls._portfolio_metrics(donor_org_id)
        # Cohort: one row per other donor; later we take median + percentile
        cohort_rows = []
        for d in other_donors:
            cohort_rows.append(cls._portfolio_metrics(d.id))

        metrics = []
        for code, label, unit, higher_is_better in (
            ('avg_grantee_capacity_score', 'Grantee capacity score (avg)', '/100', True),
            ('avg_ai_score_at_award',      'AI score of awarded apps (avg)', '/100', True),
            ('country_diversity_pct',      'Country diversity', '%', True),
            ('sector_diversity_pct',       'Sector diversity', '%', True),
            ('small_org_funding_share_pct','Funding to small/emerging orgs', '%', True),
            ('report_on_time_rate_pct',    'Grantee reports on time', '%', True),
        ):
            self_val = self_metrics.get(code)
            self_n = self_metrics.get(code + '_n', 0)
            cohort_vals = [r[code] for r in cohort_rows if r.get(code) is not None]

            if self_val is None or self_n < MIN_SAMPLE:
                continue
            if len(cohort_vals) < MIN_COHORT:
                continue

            metrics.append(cls._metric_row(
                code=code, label=label, unit=unit,
                higher_is_better=higher_is_better,
                self_value=self_val,
                self_sample_size=self_n,
                cohort_values=cohort_vals,
            ))

        return {
            'success': True,
            'source': 'cohort',
            'cohort_size': len(other_donors),
            'portfolio_size': self_metrics.get('portfolio_size', 0),
            'metrics': metrics,
            'computed_at': datetime.now(timezone.utc).isoformat(),
        }

    # ------------------------------------------------------------------
    # Per-donor portfolio metric extraction
    # ------------------------------------------------------------------

    @classmethod
    def _portfolio_metrics(cls, donor_org_id: int) -> dict:
        """Compute the metric dict for a single donor's awarded portfolio.

        Always returns the full key set; missing data → None values with
        sample-count companion keys so the caller can decide whether to
        compare or omit.
        """
        # Awarded applications under this donor's grants
        awarded = (
            db.session.query(Application, Grant)
            .join(Grant, Grant.id == Application.grant_id)
            .filter(Grant.donor_org_id == donor_org_id)
            .filter(Application.status == 'awarded')
            .all()
        )
        out: dict = {
            'portfolio_size': len(awarded),
            'avg_grantee_capacity_score': None,
            'avg_grantee_capacity_score_n': 0,
            'avg_ai_score_at_award': None,
            'avg_ai_score_at_award_n': 0,
            'country_diversity_pct': None,
            'country_diversity_pct_n': 0,
            'sector_diversity_pct': None,
            'sector_diversity_pct_n': 0,
            'small_org_funding_share_pct': None,
            'small_org_funding_share_pct_n': 0,
            'report_on_time_rate_pct': None,
            'report_on_time_rate_pct_n': 0,
        }
        if not awarded:
            return out

        # avg_ai_score_at_award
        ai_scores = [a.ai_score for a, _ in awarded if a.ai_score is not None]
        if ai_scores:
            out['avg_ai_score_at_award'] = round(sum(ai_scores) / len(ai_scores), 1)
            out['avg_ai_score_at_award_n'] = len(ai_scores)

        # Grantee orgs (unique)
        grantee_org_ids = list({a.ngo_org_id for a, _ in awarded})

        # avg_grantee_capacity_score (latest capacity score per grantee)
        cap_scores = []
        small_org_count = 0
        for oid in grantee_org_ids:
            cs = cls._latest_capacity_score(oid)
            if cs is not None:
                cap_scores.append(cs)
                if cs < 60:
                    small_org_count += 1
        if cap_scores:
            out['avg_grantee_capacity_score'] = round(sum(cap_scores) / len(cap_scores), 1)
            out['avg_grantee_capacity_score_n'] = len(cap_scores)
            out['small_org_funding_share_pct'] = round(
                (small_org_count / len(cap_scores)) * 100, 1
            )
            out['small_org_funding_share_pct_n'] = len(cap_scores)

        # country_diversity_pct: distinct countries among awarded grantees / portfolio_size
        grantee_orgs = Organization.query.filter(
            Organization.id.in_(grantee_org_ids)
        ).all() if grantee_org_ids else []
        countries = {o.country for o in grantee_orgs if o.country}
        if grantee_org_ids:
            out['country_diversity_pct'] = round(
                (len(countries) / len(grantee_org_ids)) * 100, 1
            )
            out['country_diversity_pct_n'] = len(grantee_org_ids)

        # sector_diversity_pct: distinct sectors across awarded grants / portfolio_size
        sector_set: set[str] = set()
        for _, g in awarded:
            try:
                gs = g.get_sectors() if hasattr(g, 'get_sectors') else []
                if isinstance(gs, list):
                    for s in gs:
                        if isinstance(s, str) and s.strip():
                            sector_set.add(s.strip())
            except Exception:
                continue
        if awarded:
            out['sector_diversity_pct'] = round(
                (len(sector_set) / len(awarded)) * 100, 1
            )
            out['sector_diversity_pct_n'] = len(awarded)

        # report_on_time_rate_pct: NGO reports on grants under this donor
        # On-time = submitted_at <= due_date (best-effort; skip rows w/o either)
        grant_ids = [g.id for _, g in awarded]
        if grant_ids:
            try:
                reports = Report.query.filter(
                    Report.grant_id.in_(grant_ids),
                    Report.status.in_(('submitted', 'under_review', 'accepted')),
                ).all()
                rated = 0
                on_time = 0
                for r in reports:
                    due = getattr(r, 'due_date', None)
                    sub = getattr(r, 'submitted_at', None)
                    if not due or not sub:
                        continue
                    rated += 1
                    sub_d = sub.date() if hasattr(sub, 'date') else sub
                    if sub_d <= due:
                        on_time += 1
                if rated:
                    out['report_on_time_rate_pct'] = round((on_time / rated) * 100, 1)
                    out['report_on_time_rate_pct_n'] = rated
            except Exception as e:
                logger.warning(f'cohort report rate calc failed donor={donor_org_id}: {e}')

        return out

    @staticmethod
    def _latest_capacity_score(org_id: int) -> float | None:
        a = (
            Assessment.query
            .filter(Assessment.org_id == org_id)
            .order_by(Assessment.created_at.desc())
            .first()
        )
        if not a:
            return None
        score = getattr(a, 'total_score', None) or getattr(a, 'overall_score', None)
        try:
            return round(float(score), 1) if score is not None else None
        except (TypeError, ValueError):
            return None

    # ------------------------------------------------------------------
    # Metric row builder (mirrors PeerBenchmarkService shape so the UI
    # can share a single component).
    # ------------------------------------------------------------------

    @staticmethod
    def _metric_row(
        *, code: str, label: str, unit: str, higher_is_better: bool,
        self_value: float, self_sample_size: int, cohort_values: list[float],
    ) -> dict:
        cohort_sorted = sorted(cohort_values)
        n = len(cohort_sorted)
        mid = n // 2
        median = (cohort_sorted[mid] if n % 2 == 1
                  else (cohort_sorted[mid - 1] + cohort_sorted[mid]) / 2)
        below_self = sum(1 for v in cohort_sorted if v < self_value)
        equal_self = sum(1 for v in cohort_sorted if v == self_value)
        percentile = ((below_self + (equal_self / 2)) / n) * 100 if n else 0

        if higher_is_better:
            verdict = ('above' if percentile >= 75 else
                       'around' if percentile >= 33 else
                       'below')
        else:
            verdict = ('above' if percentile <= 25 else
                       'around' if percentile <= 66 else
                       'below')

        return {
            'code': code,
            'label': label,
            'self_value': round(float(self_value), 1),
            'self_sample_size': self_sample_size,
            'cohort_median': round(float(median), 1),
            'cohort_count': n,
            'percentile': round(percentile),
            'verdict': verdict,
            'higher_is_better': higher_is_better,
            'unit': unit,
        }
