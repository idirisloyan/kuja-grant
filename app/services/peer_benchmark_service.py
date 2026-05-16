"""
PeerBenchmarkService — Phase 16B (May 2026).

Compares the caller's org against a relevant peer set on a few stable
metrics, so the dashboard tells you not just "your score is 78" but
"your score is 78 — peers in your country average 72."

Why this is category-defining: Global South NGOs operate in a black box
about how they compare. PMOs and donors get sector benchmarks; NGOs
historically don't. We make the comparison automatic, anonymous, and
scoped to genuinely-similar peers.

NGO benchmarks (vs other NGOs in same country):
  - capacity_score (from latest Assessment)
  - win_rate         (awarded / decided applications)
  - submission_count (engagement)

Donor benchmarks (vs other donors):
  - decision_speed_days (median submission → decision)
  - decline_rate         (rejected / decided)
  - portfolio_size       (active grants)

Anonymity: peer counts + medians only. No org names ever leave this
service to the caller. Below MIN_PEERS, we return source='sparse' so
the UI can show "not enough peers in your bucket yet."
"""

import logging
from datetime import datetime, timedelta, timezone

from app.extensions import db
from app.models import Application, Assessment, Grant, Organization

logger = logging.getLogger('kuja')

MIN_PEERS = 3   # below this, refuse to expose a benchmark


class PeerBenchmarkService:

    @classmethod
    def for_ngo(cls, *, ngo_org_id: int) -> dict:
        org = db.session.get(Organization, ngo_org_id)
        if not org:
            return {'success': False, 'source': 'unavailable'}

        peers = Organization.query.filter(
            Organization.org_type == 'ngo',
            Organization.id != ngo_org_id,
        )
        # Country is the strongest peer signal for NGOs; fall back to
        # all NGOs if country is missing.
        if org.country:
            peers = peers.filter(Organization.country == org.country)
        peer_orgs = peers.all()

        if len(peer_orgs) < MIN_PEERS:
            return {
                'success': True,
                'source': 'sparse',
                'peer_count': len(peer_orgs),
                'peer_country': org.country,
                'metrics': [],
            }

        # Self values
        self_capacity = cls._latest_capacity_score(ngo_org_id)
        self_win_rate = cls._ngo_win_rate(ngo_org_id)
        self_submissions = cls._ngo_submission_count(ngo_org_id, days=365)

        # Peer values (medians + buckets)
        peer_caps = [cls._latest_capacity_score(p.id) for p in peer_orgs]
        peer_caps = [x for x in peer_caps if x is not None]
        peer_wins = [cls._ngo_win_rate(p.id) for p in peer_orgs]
        peer_wins = [x for x in peer_wins if x is not None]
        peer_subs = [cls._ngo_submission_count(p.id, days=365) for p in peer_orgs]

        metrics = []
        if self_capacity is not None and len(peer_caps) >= MIN_PEERS:
            metrics.append(cls._metric_row(
                code='capacity_score',
                label='Capacity score',
                self_value=self_capacity, peers=peer_caps,
                higher_is_better=True, unit='/100',
            ))
        if self_win_rate is not None and len(peer_wins) >= MIN_PEERS:
            metrics.append(cls._metric_row(
                code='win_rate',
                label='Application win rate',
                self_value=self_win_rate, peers=peer_wins,
                higher_is_better=True, unit='%',
            ))
        if len(peer_subs) >= MIN_PEERS:
            metrics.append(cls._metric_row(
                code='submission_count',
                label='Submissions (last 12 months)',
                self_value=self_submissions, peers=peer_subs,
                higher_is_better=True, unit='',
            ))

        return {
            'success': True,
            'source': 'benchmark',
            'peer_count': len(peer_orgs),
            'peer_country': org.country,
            'metrics': metrics,
            'computed_at': datetime.now(timezone.utc).isoformat(),
        }

    @classmethod
    def for_donor(cls, *, donor_org_id: int) -> dict:
        org = db.session.get(Organization, donor_org_id)
        if not org:
            return {'success': False, 'source': 'unavailable'}

        peers = Organization.query.filter(
            Organization.org_type == 'donor',
            Organization.id != donor_org_id,
        ).all()
        if len(peers) < MIN_PEERS:
            return {
                'success': True,
                'source': 'sparse',
                'peer_count': len(peers),
                'metrics': [],
            }

        self_speed = cls._donor_decision_speed_days(donor_org_id)
        self_decline = cls._donor_decline_rate(donor_org_id)
        self_portfolio = cls._donor_active_grants(donor_org_id)

        peer_speeds = [cls._donor_decision_speed_days(p.id) for p in peers]
        peer_speeds = [x for x in peer_speeds if x is not None]
        peer_declines = [cls._donor_decline_rate(p.id) for p in peers]
        peer_declines = [x for x in peer_declines if x is not None]
        peer_portfolios = [cls._donor_active_grants(p.id) for p in peers]

        metrics = []
        if self_speed is not None and len(peer_speeds) >= MIN_PEERS:
            metrics.append(cls._metric_row(
                code='decision_speed_days',
                label='Decision speed',
                self_value=self_speed, peers=peer_speeds,
                higher_is_better=False, unit=' days',
            ))
        if self_decline is not None and len(peer_declines) >= MIN_PEERS:
            metrics.append(cls._metric_row(
                code='decline_rate',
                label='Decline rate',
                self_value=self_decline, peers=peer_declines,
                higher_is_better=False, unit='%',
            ))
        if len(peer_portfolios) >= MIN_PEERS:
            metrics.append(cls._metric_row(
                code='portfolio_size',
                label='Active grants',
                self_value=self_portfolio, peers=peer_portfolios,
                higher_is_better=True, unit='',
            ))

        return {
            'success': True,
            'source': 'benchmark',
            'peer_count': len(peers),
            'metrics': metrics,
            'computed_at': datetime.now(timezone.utc).isoformat(),
        }

    # ------------------------------------------------------------------
    # Metric computation primitives
    # ------------------------------------------------------------------

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

    @staticmethod
    def _ngo_win_rate(org_id: int) -> float | None:
        rows = (
            Application.query
            .filter(Application.ngo_org_id == org_id)
            .filter(Application.status.in_(('awarded', 'rejected')))
            .with_entities(Application.status).all()
        )
        if not rows:
            return None
        wins = sum(1 for s, in rows if s == 'awarded')
        return round((wins / len(rows)) * 100, 1)

    @staticmethod
    def _ngo_submission_count(org_id: int, *, days: int = 365) -> int:
        since = datetime.now(timezone.utc) - timedelta(days=days)
        return Application.query.filter(
            Application.ngo_org_id == org_id,
            Application.created_at >= since,
            Application.status != 'draft',
        ).count()

    @staticmethod
    def _donor_decision_speed_days(donor_org_id: int) -> float | None:
        """Median days from Application.submitted_at to updated_at on
        awarded/rejected apps."""
        rows = (
            Application.query
            .join(Grant)
            .filter(Grant.donor_org_id == donor_org_id)
            .filter(Application.status.in_(('awarded', 'rejected')))
            .filter(Application.submitted_at.isnot(None))
            .with_entities(Application.submitted_at, Application.updated_at)
            .all()
        )
        deltas = []
        for sub, upd in rows:
            if sub and upd and upd >= sub:
                d = (upd - sub).total_seconds() / 86400.0
                if 0 <= d <= 720:   # sanity
                    deltas.append(d)
        if not deltas:
            return None
        deltas.sort()
        mid = len(deltas) // 2
        median = (deltas[mid] if len(deltas) % 2 == 1
                  else (deltas[mid - 1] + deltas[mid]) / 2)
        return round(median, 1)

    @staticmethod
    def _donor_decline_rate(donor_org_id: int) -> float | None:
        rows = (
            Application.query.join(Grant)
            .filter(Grant.donor_org_id == donor_org_id)
            .filter(Application.status.in_(('awarded', 'rejected')))
            .with_entities(Application.status).all()
        )
        if not rows:
            return None
        rejected = sum(1 for s, in rows if s == 'rejected')
        return round((rejected / len(rows)) * 100, 1)

    @staticmethod
    def _donor_active_grants(donor_org_id: int) -> int:
        return Grant.query.filter(
            Grant.donor_org_id == donor_org_id,
            Grant.status.in_(('open', 'awarded')),
        ).count()

    # ------------------------------------------------------------------
    # Comparison row builder
    # ------------------------------------------------------------------

    @staticmethod
    def _metric_row(
        *, code: str, label: str,
        self_value: float | int, peers: list[float | int],
        higher_is_better: bool, unit: str,
    ) -> dict:
        peers_sorted = sorted(peers)
        n = len(peers_sorted)
        mid = n // 2
        median = (peers_sorted[mid] if n % 2 == 1
                  else (peers_sorted[mid - 1] + peers_sorted[mid]) / 2)
        # Percentile rank of self in peer distribution (0..100)
        below_self = sum(1 for p in peers_sorted if p < self_value)
        equal_self = sum(1 for p in peers_sorted if p == self_value)
        # Average rank for ties so equal scores don't skew
        percentile = ((below_self + (equal_self / 2)) / n) * 100 if n else 0

        # Verdict labels
        if higher_is_better:
            verdict = ('above' if percentile >= 75 else
                       'around' if percentile >= 33 else
                       'below')
        else:
            # Inverted: lower is better → high percentile = bad
            verdict = ('above' if percentile <= 25 else
                       'around' if percentile <= 66 else
                       'below')

        return {
            'code': code,
            'label': label,
            'self_value': round(float(self_value), 1) if isinstance(self_value, (int, float)) else self_value,
            'peer_median': round(float(median), 1),
            'peer_count': n,
            'percentile': round(percentile),
            'verdict': verdict,                  # 'above' | 'around' | 'below'
            'higher_is_better': higher_is_better,
            'unit': unit,
        }
