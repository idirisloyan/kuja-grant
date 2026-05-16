"""
AIBudgetService — Phase 5 (May 2026 integrity & polish)
=======================================================

Per-org AI spending cap with structured "skipped due to budget" telemetry.
PMO transfer pattern.

Why this exists:
  - NGOs reporting to donors have hard line-item budgets. AI cost surprises
    are an enterprise blocker — finance teams need a hard cap, not an
    advisory dashboard.
  - The cap protects the platform too: a runaway loop in a single tenant
    can't bankrupt the AI budget for everyone else.

Operations:
  - estimate_call_usd(input_tokens, output_tokens) → float
        Approximate cost from Claude Sonnet 4 token pricing.
        Static pricing table — refresh when Anthropic changes pricing.
  - month_to_date_usd(org_id) → float
        Sums tokens from ai_call_logs for the current calendar month,
        applies pricing.
  - check_budget(org_id) → {'allowed': bool, 'spent_usd': float,
                              'budget_usd': float | None, 'remaining_usd': float}
        Soft check; returns the full picture for UI display.
  - enforce_budget(org_id) → None or raises BudgetExceededError
        Hard check; called from AI service before invoking Claude.
  - record_skipped(endpoint, org_id, reason='budget')
        Writes an ai_call_logs row with success=false + error_code='budget'
        so the admin spend page can show "skipped due to budget" rollups.

NULL budget = unlimited.

Pricing snapshot (claude-sonnet-4 ish, May 2026):
  - input tokens:  $3.00 / 1M
  - output tokens: $15.00 / 1M
  Updates: refresh INPUT_PRICE_PER_M / OUTPUT_PRICE_PER_M when Anthropic
  publishes a new price sheet. Single source of truth, easy to grep.
"""

import logging
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import text

from app.extensions import db

logger = logging.getLogger('kuja')


class BudgetExceededError(Exception):
    """Raised by enforce_budget when over the monthly cap."""
    def __init__(self, *, org_id: int, spent_usd: float, budget_usd: float):
        self.org_id = org_id
        self.spent_usd = spent_usd
        self.budget_usd = budget_usd
        super().__init__(
            f"AI monthly budget exceeded for org {org_id}: "
            f"${spent_usd:.2f} spent / ${budget_usd:.2f} cap"
        )


class AIBudgetService:

    # Pricing — keep these constants together for easy refresh.
    INPUT_PRICE_PER_M = 3.00     # USD per million input tokens
    OUTPUT_PRICE_PER_M = 15.00   # USD per million output tokens

    @classmethod
    def estimate_call_usd(cls, input_tokens: int, output_tokens: int) -> float:
        return (
            (input_tokens / 1_000_000.0) * cls.INPUT_PRICE_PER_M
            + (output_tokens / 1_000_000.0) * cls.OUTPUT_PRICE_PER_M
        )

    @classmethod
    def month_to_date_usd(cls, org_id: int) -> float:
        """Sum AI token costs for `org_id` since the start of the current month."""
        now = datetime.now(timezone.utc)
        month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
        try:
            r = db.session.execute(
                text("""
                    SELECT
                        COALESCE(SUM(tokens_in), 0) AS in_sum,
                        COALESCE(SUM(tokens_out), 0) AS out_sum
                    FROM ai_call_logs
                    WHERE org_id = :oid
                      AND created_at >= :since
                      AND success = TRUE
                """),
                {'oid': org_id, 'since': month_start},
            )
            row = r.fetchone()
            in_sum = row[0] if row else 0
            out_sum = row[1] if row else 0
            return cls.estimate_call_usd(int(in_sum), int(out_sum))
        except Exception as e:
            logger.debug(f"AIBudgetService month_to_date_usd query failed: {e}")
            return 0.0

    @classmethod
    def check_budget(cls, org_id: int) -> dict:
        from app.models import Organization
        org = db.session.get(Organization, org_id)
        if not org:
            return {'allowed': True, 'spent_usd': 0.0, 'budget_usd': None,
                    'remaining_usd': None, 'reason': 'org_not_found'}
        budget = org.ai_monthly_budget_usd
        spent = cls.month_to_date_usd(org_id)
        if budget is None:
            return {'allowed': True, 'spent_usd': spent, 'budget_usd': None,
                    'remaining_usd': None, 'reason': 'unlimited'}
        budget_f = float(budget)
        remaining = budget_f - spent
        return {
            'allowed': remaining > 0,
            'spent_usd': round(spent, 4),
            'budget_usd': budget_f,
            'remaining_usd': round(max(0.0, remaining), 4),
            'reason': 'within_budget' if remaining > 0 else 'over_budget',
        }

    @classmethod
    def enforce_budget(cls, org_id: int | None) -> None:
        """Hard gate. Raises BudgetExceededError when org is over budget.
        Called from AIService before each external invocation.

        If org_id is None (no scope), returns immediately (system-level calls
        are not budget-gated; admin sees them in the admin spend report).
        """
        if not org_id:
            return
        status = cls.check_budget(org_id)
        if not status['allowed']:
            raise BudgetExceededError(
                org_id=org_id,
                spent_usd=status['spent_usd'],
                budget_usd=status['budget_usd'],
            )

    @classmethod
    def record_skipped(cls, *, endpoint: str, org_id: int | None, user_id: int | None,
                       role: str | None, language: str | None) -> None:
        """Write a 'skipped due to budget' ai_call_logs row so the admin
        spend report can surface which endpoints were blocked."""
        try:
            db.session.execute(
                text("""
                    INSERT INTO ai_call_logs
                      (endpoint, user_id, success, duration_ms, tokens_in, tokens_out,
                       model, error_code, error_message,
                       role, language, org_id)
                    VALUES
                      (:endpoint, :uid, FALSE, 0, 0, 0,
                       'budget-gate', 'budget', :err,
                       :role, :lang, :oid)
                """),
                {
                    'endpoint': endpoint, 'uid': user_id,
                    'err': 'AI monthly budget exceeded; call skipped.',
                    'role': role, 'lang': language, 'oid': org_id,
                },
            )
            db.session.commit()
        except Exception as e:
            try: db.session.rollback()
            except Exception: pass
            logger.debug(f"record_skipped failed: {e}")

    # ------------------------------------------------------------------
    # Admin spend report
    # ------------------------------------------------------------------

    @classmethod
    def admin_spend_report(cls) -> dict:
        """30-day rollup grouped by org + per-endpoint skip counts.

        Cross-database-portable: avoids `WHEN x THEN` on a boolean column
        (SQLite drivers map booleans inconsistently). Filter then group.
        """
        now = datetime.now(timezone.utc)
        month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
        orgs = []
        try:
            rows = db.session.execute(
                text("""
                    SELECT
                      ail.org_id,
                      COALESCE(o.name, '(unknown)') AS org_name,
                      o.ai_monthly_budget_usd AS budget,
                      COALESCE(SUM(ail.tokens_in), 0) AS in_sum,
                      COALESCE(SUM(ail.tokens_out), 0) AS out_sum,
                      COUNT(*) AS ok_count
                    FROM ai_call_logs ail
                    LEFT JOIN organizations o ON o.id = ail.org_id
                    WHERE ail.created_at >= :since
                      AND ail.success = TRUE
                    GROUP BY ail.org_id, o.name, o.ai_monthly_budget_usd
                    ORDER BY in_sum + out_sum DESC
                """),
                {'since': month_start},
            ).fetchall()
            for r in rows:
                spent = cls.estimate_call_usd(int(r[3] or 0), int(r[4] or 0))
                budget = float(r[2]) if r[2] is not None else None
                orgs.append({
                    'org_id': r[0],
                    'org_name': r[1],
                    'budget_usd': budget,
                    'spent_usd': round(spent, 4),
                    'remaining_usd': (round(max(0.0, budget - spent), 4) if budget else None),
                    'pct_used': round((spent / budget) * 100, 1) if budget else None,
                    'successful_calls': int(r[5] or 0),
                    'skipped_due_to_budget': 0,    # filled in below
                })
        except Exception as e:
            logger.warning(f"admin_spend_report org rollup failed: {e}")

        # Skipped counts per org (independent query so a failure here doesn't
        # nuke the whole rollup; result keeps `skipped_by_endpoint` present).
        try:
            skip_rows = db.session.execute(
                text("""
                    SELECT org_id, COUNT(*) AS n
                    FROM ai_call_logs
                    WHERE error_code = 'budget'
                      AND created_at >= :since
                    GROUP BY org_id
                """),
                {'since': month_start},
            ).fetchall()
            skip_by_org = {r[0]: int(r[1]) for r in skip_rows}
            # Patch into the orgs list (add missing orgs if they appear ONLY here)
            for org_id, skipped_n in skip_by_org.items():
                found = next((o for o in orgs if o['org_id'] == org_id), None)
                if found:
                    found['skipped_due_to_budget'] = skipped_n
                else:
                    orgs.append({
                        'org_id': org_id, 'org_name': '(unknown)', 'budget_usd': None,
                        'spent_usd': 0.0, 'remaining_usd': None, 'pct_used': None,
                        'successful_calls': 0, 'skipped_due_to_budget': skipped_n,
                    })
        except Exception as e:
            logger.warning(f"admin_spend_report skip-by-org query failed: {e}")

        # Skipped-by-endpoint breakdown — always present even if empty
        skipped_by_endpoint: list[dict] = []
        try:
            ep_rows = db.session.execute(
                text("""
                    SELECT endpoint, COUNT(*) AS n
                    FROM ai_call_logs
                    WHERE error_code = 'budget'
                      AND created_at >= :since
                    GROUP BY endpoint
                    ORDER BY n DESC
                    LIMIT 20
                """),
                {'since': month_start},
            ).fetchall()
            skipped_by_endpoint = [{'endpoint': r[0], 'count': int(r[1])} for r in ep_rows]
        except Exception as e:
            logger.warning(f"admin_spend_report skipped-by-endpoint query failed: {e}")

        return {
            'period_start': month_start.isoformat(),
            'orgs': orgs,
            'skipped_by_endpoint': skipped_by_endpoint,
        }
