"""
A/B testing rail — Phase 9.3
=============================
Lightweight prompt-variant assignment + outcome tracking on top of the
existing feature flag system. An experiment defines a key (e.g.
'draft_application.system_prompt'), a list of named variants, and a
distribution function. Users get a stable variant via deterministic
hash so the same NGO sees the same variant across sessions.

Outcome reporting writes to ai_call_logs.helpfulness or a dedicated
ab_outcomes table — admins see win rates per variant in observability.
"""

from __future__ import annotations
import hashlib
import logging
import json
from typing import Any
from app.extensions import db
from sqlalchemy import text

logger = logging.getLogger('kuja')


# Built-in experiments. Keep these small — the goal is fast iteration on
# prompts, not a full experimentation platform. Each variant is referenced
# by AIService methods that read the active variant for their endpoint.
EXPERIMENTS: dict[str, dict[str, Any]] = {
    'draft_application.system_prompt': {
        'description': 'Tone variants for the application co-author system prompt.',
        'variants': ['baseline', 'firm', 'warm'],
        'default': 'baseline',
        'enabled': False,
    },
    'compliance_preempt.severity': {
        'description': 'How aggressive the pre-submit compliance scan is.',
        'variants': ['baseline', 'strict', 'lenient'],
        'default': 'baseline',
        'enabled': False,
    },
}


_table_ready = None


def _ensure_table():
    global _table_ready
    if _table_ready:
        return True
    try:
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS ab_outcomes (
                id SERIAL PRIMARY KEY,
                experiment VARCHAR(120) NOT NULL,
                variant VARCHAR(40) NOT NULL,
                user_id INT,
                outcome VARCHAR(40) NOT NULL,
                value NUMERIC(10,2),
                meta TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_ab_outcomes_exp_variant "
            "ON ab_outcomes (experiment, variant, created_at DESC)"
        ))
        db.session.commit()
        _table_ready = True
        return True
    except Exception as e:
        try:
            db.session.rollback()
        except Exception:
            pass
        logger.error(f"ab_outcomes table create failed: {e}")
        _table_ready = False
        return False


def assign_variant(experiment: str, *, user_id: int | None = None) -> str:
    """Stable per-user variant assignment.

    If the experiment is disabled, returns the default variant (no A/B).
    Otherwise hashes (experiment, user_id) and indexes into the variants
    list — same user gets the same variant across calls.
    """
    spec = EXPERIMENTS.get(experiment)
    if not spec:
        return 'baseline'
    variants = spec.get('variants') or ['baseline']
    default = spec.get('default') or variants[0]
    if not spec.get('enabled'):
        return default

    bucket_key = f"{experiment}:{user_id or 0}"
    h = int(hashlib.md5(bucket_key.encode()).hexdigest()[:8], 16)
    return variants[h % len(variants)]


def record_outcome(
    *,
    experiment: str,
    variant: str,
    user_id: int | None = None,
    outcome: str,
    value: float | None = None,
    meta: dict | None = None,
) -> bool:
    """Record an outcome event for an experiment.

    outcome examples: 'used', 'edited', 'dismissed', 'submitted',
    'awarded', 'rejected'. value is optional numeric (e.g. score).
    """
    if not _ensure_table():
        return False
    try:
        db.session.execute(
            text("""
                INSERT INTO ab_outcomes (experiment, variant, user_id, outcome, value, meta)
                VALUES (:exp, :var, :uid, :out, :val, :meta)
            """),
            {
                'exp': experiment,
                'var': variant,
                'uid': user_id,
                'out': outcome,
                'val': value,
                'meta': json.dumps(meta) if meta else None,
            },
        )
        db.session.commit()
        return True
    except Exception as e:
        try:
            db.session.rollback()
        except Exception:
            pass
        logger.debug(f"ab_outcomes insert failed: {e}")
        return False


def list_experiments() -> list[dict[str, Any]]:
    out = []
    for key, spec in EXPERIMENTS.items():
        out.append({
            'key': key,
            'description': spec.get('description'),
            'variants': spec.get('variants', []),
            'default': spec.get('default'),
            'enabled': bool(spec.get('enabled')),
        })
    return out


def get_winrates(experiment: str, *, days: int = 30) -> list[dict[str, Any]]:
    """Per-variant outcome rollup for the last N days.

    Returns: [{variant, total, used, edited, dismissed, helpful_pct}].
    helpful_pct = (used + 0.5*edited) / (used+edited+dismissed) — same
    weighting we use in the AI helpfulness dashboard for consistency.
    """
    if not _ensure_table():
        return []
    try:
        rows = db.session.execute(
            text("""
                SELECT variant,
                       COUNT(*) AS total,
                       SUM(CASE WHEN outcome = 'used' THEN 1 ELSE 0 END) AS used,
                       SUM(CASE WHEN outcome = 'edited' THEN 1 ELSE 0 END) AS edited,
                       SUM(CASE WHEN outcome = 'dismissed' THEN 1 ELSE 0 END) AS dismissed
                FROM ab_outcomes
                WHERE experiment = :exp
                  AND created_at >= NOW() - (:days || ' days')::interval
                GROUP BY variant
                ORDER BY total DESC
            """),
            {'exp': experiment, 'days': str(days)},
        ).fetchall()
    except Exception as e:
        logger.debug(f"ab_outcomes winrate query failed: {e}")
        return []

    out = []
    for r in rows:
        total = int(r[1] or 0)
        used = int(r[2] or 0)
        edited = int(r[3] or 0)
        dismissed = int(r[4] or 0)
        with_signal = used + edited + dismissed
        pct = round(100 * (used + 0.5 * edited) / with_signal, 1) if with_signal else None
        out.append({
            'variant': r[0],
            'total': total,
            'used': used,
            'edited': edited,
            'dismissed': dismissed,
            'helpful_pct': pct,
        })
    return out
