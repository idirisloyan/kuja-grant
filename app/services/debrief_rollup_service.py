"""
DebriefRollupService — Phase 15A (May 2026).

Aggregate the win/loss debrief data (Phase 14) into actionable rollups.

Two perspectives:
  - NGO ("where you consistently win/lose"):
      "Strong M&E plan" appears on 5/8 of your awarded applications.
      "Eligibility gap" appears on 4/12 of your declined applications.
  - Donor ("why you've awarded/declined"):
      "Strong fit with strategy" appears on 12/30 of your awards.
      "Limited funds available" appears on 18/40 of your declines.

Designed to feed the existing CrossGrantPatterns / observability cards
WITHOUT another AI call — pure SQL aggregation over decision_reason_code.

Honest about data sparseness: if fewer than 3 decisions have debrief
data the rollup returns source='sparse' so the UI can show a "not
enough data yet" empty state instead of misleading 1/1 percentages.
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, case

from app.constants import WIN_LOSS_REASONS
from app.extensions import db
from app.models import Application, Grant


logger = logging.getLogger('kuja')

# Map code → label for the response; codes are stable English, labels
# are i18n keys the frontend resolves.
_REASON_LABEL = {r['code']: r['label'] for r in WIN_LOSS_REASONS}
_REASON_TONE  = {r['code']: r['tone']  for r in WIN_LOSS_REASONS}

# Below this many decided applications, the rollup is too sparse to
# reason about — surface as such so we don't ship "1/1 (100%) lose on X"
# fake insights.
MIN_DECIDED = 3


class DebriefRollupService:

    @classmethod
    def for_ngo(cls, *, ngo_org_id: int, lookback_days: int = 365) -> dict:
        """Per-NGO rollup: 'why you've won/lost lately.'"""
        since = datetime.now(timezone.utc) - timedelta(days=lookback_days)
        base = Application.query.filter(
            Application.ngo_org_id == ngo_org_id,
            Application.status.in_(('awarded', 'rejected')),
            Application.updated_at >= since,
        )
        return cls._compose(scope='ngo', scope_id=ngo_org_id, query=base, lookback_days=lookback_days)

    @classmethod
    def for_donor(cls, *, donor_org_id: int, lookback_days: int = 365) -> dict:
        """Per-donor rollup: 'why you've awarded/declined lately.'"""
        since = datetime.now(timezone.utc) - timedelta(days=lookback_days)
        base = (
            Application.query
            .join(Grant)
            .filter(
                Grant.donor_org_id == donor_org_id,
                Application.status.in_(('awarded', 'rejected')),
                Application.updated_at >= since,
            )
        )
        return cls._compose(scope='donor', scope_id=donor_org_id, query=base, lookback_days=lookback_days)

    @classmethod
    def _compose(cls, *, scope: str, scope_id: int, query, lookback_days: int) -> dict:
        rows = query.with_entities(
            Application.status,
            Application.decision_reason_code,
        ).all()

        total = len(rows)
        awarded_total = sum(1 for s, _ in rows if s == 'awarded')
        rejected_total = sum(1 for s, _ in rows if s == 'rejected')

        win_counts: dict[str, int] = {}
        loss_counts: dict[str, int] = {}
        debriefed_win = 0
        debriefed_loss = 0
        for status, code in rows:
            if not code:
                continue
            if status == 'awarded':
                debriefed_win += 1
                win_counts[code] = win_counts.get(code, 0) + 1
            elif status == 'rejected':
                debriefed_loss += 1
                loss_counts[code] = loss_counts.get(code, 0) + 1

        def _build_rows(counts: dict[str, int], denom: int) -> list[dict]:
            out = []
            for code, n in sorted(counts.items(), key=lambda kv: -kv[1]):
                out.append({
                    'code': code,
                    'label': _REASON_LABEL.get(code, code),
                    'tone': _REASON_TONE.get(code, 'both'),
                    'count': n,
                    'pct': round((n / denom) * 100) if denom else 0,
                })
            return out

        # Sparse-data flag (we have enough total decisions to be meaningful)
        sparse = total < MIN_DECIDED
        # Also flag if NO debrief data exists at all — different empty state
        has_any_debrief = (debriefed_win + debriefed_loss) > 0

        return {
            'scope': scope,
            'scope_id': scope_id,
            'lookback_days': lookback_days,
            'total_decided': total,
            'awarded_total': awarded_total,
            'rejected_total': rejected_total,
            'debriefed_win': debriefed_win,
            'debriefed_loss': debriefed_loss,
            'wins_by_reason': _build_rows(win_counts, debriefed_win),
            'losses_by_reason': _build_rows(loss_counts, debriefed_loss),
            'source': 'sparse' if sparse else ('no_debrief' if not has_any_debrief else 'rollup'),
            'computed_at': datetime.now(timezone.utc).isoformat(),
        }
