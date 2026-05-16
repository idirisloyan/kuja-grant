"""
DonorProfileService — Phase 18B (May 2026).

Aggregates "how does this donor actually behave?" facts so NGOs can
research before applying. Today, NGOs apply blind — they don't know
how often the donor approves, in which sectors, how fast they decide.
This service exposes the publicly-safe aggregates.

Aggregates returned:
  - portfolio_size: open + awarded grants
  - total_funding_committed_usd: rough sum (skips grants with missing
    currency to avoid lying)
  - decision_speed_days: median submission → decision
  - decline_rate: rejected / decided (%)
  - active_sectors: top 8 sectors funded (with grant counts)
  - active_countries: top 8 countries funded
  - typical_grant_size_band: bucketed (under_25k, 25k_100k, 100k_500k, 500k_plus)
  - reporting_burden_signal: median # of reporting requirements per grant
                             ("low" | "medium" | "high" based on count)

Anonymity: NEVER returns named NGOs that won/lost. Counts only.

Honesty: returns source='sparse' if the donor has fewer than 3 decided
applications — sample too small to fairly characterize.
"""

import logging
from collections import Counter
from datetime import datetime, timezone

from app.extensions import db
from app.models import Application, Grant, Organization

logger = logging.getLogger('kuja')

MIN_DECIDED_FOR_FULL_PROFILE = 3


class DonorProfileService:

    @classmethod
    def for_donor(cls, *, donor_org_id: int) -> dict:
        org = db.session.get(Organization, donor_org_id)
        if not org or org.org_type != 'donor':
            return {'success': False, 'reason': 'not_donor'}

        grants = (
            Grant.query
            .filter(Grant.donor_org_id == donor_org_id)
            .all()
        )
        open_grants = [g for g in grants if g.status == 'open']
        awarded_grants = [g for g in grants if g.status == 'awarded']

        # Funding (skip grants with missing currency to avoid summing apples + bananas)
        total_committed = 0
        funding_amounts = []
        for g in grants:
            if g.total_funding and g.currency in (None, 'USD'):
                try:
                    amt = float(g.total_funding)
                    total_committed += amt
                    funding_amounts.append(amt)
                except (TypeError, ValueError):
                    pass

        # Decision speed / decline rate
        decided = (
            Application.query.join(Grant)
            .filter(Grant.donor_org_id == donor_org_id)
            .filter(Application.status.in_(('awarded', 'rejected')))
            .with_entities(
                Application.status, Application.submitted_at, Application.updated_at,
            ).all()
        )
        deltas = []
        rejected_count = 0
        for status, sub, upd in decided:
            if status == 'rejected':
                rejected_count += 1
            if sub and upd and upd >= sub:
                d = (upd - sub).total_seconds() / 86400.0
                if 0 <= d <= 720:
                    deltas.append(d)
        deltas.sort()
        if deltas:
            mid = len(deltas) // 2
            decision_speed_days = round(
                deltas[mid] if len(deltas) % 2 == 1
                else (deltas[mid - 1] + deltas[mid]) / 2, 1
            )
        else:
            decision_speed_days = None

        decline_rate = round((rejected_count / len(decided)) * 100, 1) if decided else None

        # Sector / country distribution from grants — Grant stores these
        # as JSON text columns, so use the model's get_* helpers (NOT raw
        # str iteration which yields single characters).
        sector_counts: Counter = Counter()
        country_counts: Counter = Counter()
        for g in grants:
            gs = g.get_sectors() if hasattr(g, 'get_sectors') else (g.sectors or [])
            if isinstance(gs, list):
                for s in gs:
                    if s and isinstance(s, str):
                        sector_counts[s] += 1
            gc = g.get_countries() if hasattr(g, 'get_countries') else (g.countries or [])
            if isinstance(gc, list):
                for c in gc:
                    if c and isinstance(c, str):
                        country_counts[c] += 1

        active_sectors = [
            {'name': s, 'count': n}
            for s, n in sector_counts.most_common(8)
        ]
        active_countries = [
            {'name': c, 'count': n}
            for c, n in country_counts.most_common(8)
        ]

        # Typical grant size band (mode of bands)
        band_counts: Counter = Counter()
        for amt in funding_amounts:
            if amt < 25_000: band_counts['under_25k'] += 1
            elif amt < 100_000: band_counts['25k_100k'] += 1
            elif amt < 500_000: band_counts['100k_500k'] += 1
            else: band_counts['500k_plus'] += 1
        typical_band = band_counts.most_common(1)[0][0] if band_counts else None

        # Reporting burden signal
        report_count_per_grant = []
        for g in grants:
            rr = g.get_reporting_requirements() if hasattr(g, 'get_reporting_requirements') else []
            report_count_per_grant.append(len(rr) if rr else 0)
        if report_count_per_grant:
            report_count_per_grant.sort()
            mid = len(report_count_per_grant) // 2
            median_reports = (
                report_count_per_grant[mid]
                if len(report_count_per_grant) % 2 == 1
                else (report_count_per_grant[mid - 1] + report_count_per_grant[mid]) / 2
            )
            burden_signal = (
                'high' if median_reports >= 6 else
                'medium' if median_reports >= 3 else
                'low'
            )
        else:
            median_reports = 0
            burden_signal = None

        sparse = len(decided) < MIN_DECIDED_FOR_FULL_PROFILE

        return {
            'success': True,
            'donor_org_id': donor_org_id,
            'donor_name': org.name,
            'donor_country': org.country,
            'verified': bool(org.verified),
            'website': org.website,
            'mission': (org.mission or '')[:600] or None,
            'portfolio_size': len(open_grants) + len(awarded_grants),
            'open_grant_count': len(open_grants),
            'total_funding_committed_usd': int(total_committed) if total_committed else None,
            'decision_speed_days': decision_speed_days,
            'decline_rate': decline_rate,
            'decided_applications_total': len(decided),
            'active_sectors': active_sectors,
            'active_countries': active_countries,
            'typical_grant_size_band': typical_band,
            'reporting_burden': {
                'signal': burden_signal,
                'median_requirements_per_grant': round(median_reports, 1) if median_reports else 0,
            },
            'source': 'sparse' if sparse else 'profile',
            'computed_at': datetime.now(timezone.utc).isoformat(),
        }
