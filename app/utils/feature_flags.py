"""
Feature flags — Phase 9.1
=========================
Lightweight per-org / per-user / global flag system. Lets us roll out a new
AI surface to one pilot org first, kill an AI surface globally if it
misbehaves in production, or A/B test prompt variants without redeploying.

Three layers, evaluated in order:
    1. Env-var override (operator escape hatch — KILL_FLAG=1 disables a
       feature for everyone immediately, no DB writes needed)
    2. Per-user / per-org explicit value (DB)
    3. Global default (DB)

Flags are typed: 'bool' (on/off), 'pct' (rollout percentage, 0-100), or
'variant' (string). The flag table is auto-created on first access.

Default flags shipped today:
    ai.draft_application      bool, default ON   — Phase 1.1
    ai.draft_report           bool, default ON   — Phase 1.3
    ai.match_engine           bool, default OFF  — Phase 3 (off until ready)
    ai.median_ngo_preview     bool, default OFF  — Phase 2.1
    ai.cross_grant_patterns   bool, default OFF  — Phase 8.1
    ai.compliance_preempt     bool, default OFF  — Phase 8.2
    ui.preview_as_reviewer    bool, default OFF  — Phase 4.1
    ui.live_drafters_pill     bool, default OFF  — Phase 4.2
"""

from __future__ import annotations
import hashlib
import logging
import os
from typing import Any

from app.extensions import db
from sqlalchemy import text

logger = logging.getLogger('kuja')


# Default values applied when the DB has no row for the flag and no env
# override is set. Naming convention: <surface>.<feature>.
DEFAULT_FLAGS: dict[str, dict[str, Any]] = {
    'ai.draft_application':    {'kind': 'bool', 'default': True,  'description': 'NGO application first-draft co-author (Phase 1.1)'},
    'ai.draft_report':         {'kind': 'bool', 'default': True,  'description': 'NGO report first-draft co-author (Phase 1.3)'},
    'ai.match_engine':         {'kind': 'bool', 'default': False, 'description': 'Win-probability match scoring (Phase 3)'},
    'ai.median_ngo_preview':   {'kind': 'bool', 'default': False, 'description': 'Donor median-NGO preview (Phase 2.1)'},
    'ai.grant_brief_generator': {'kind': 'bool', 'default': False, 'description': 'Auto-generated grant brief (Phase 2.2)'},
    'ai.cross_grant_patterns': {'kind': 'bool', 'default': False, 'description': 'Anonymized cross-grant pattern library (Phase 8.1)'},
    'ai.compliance_preempt':   {'kind': 'bool', 'default': False, 'description': 'Pre-submit compliance pre-emption (Phase 8.2)'},
    'ui.preview_as_reviewer':  {'kind': 'bool', 'default': False, 'description': 'NGO can preview their submission as the reviewer sees it (Phase 4.1)'},
    'ui.live_drafters_pill':   {'kind': 'bool', 'default': False, 'description': 'Donor sees "N orgs are drafting now" (Phase 4.2)'},
    'ui.audit_trail_tab':      {'kind': 'bool', 'default': False, 'description': 'NGO-visible audit trail (Phase 5.3)'},
}


_table_ready = None


def _ensure_table():
    """Create feature_flags + feature_flag_overrides on first use."""
    global _table_ready
    if _table_ready:
        return True
    try:
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS feature_flags (
                key VARCHAR(80) PRIMARY KEY,
                kind VARCHAR(16) NOT NULL DEFAULT 'bool',
                value TEXT,
                description VARCHAR(500),
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS feature_flag_overrides (
                id SERIAL PRIMARY KEY,
                key VARCHAR(80) NOT NULL,
                scope_kind VARCHAR(16) NOT NULL,    -- 'user' | 'org'
                scope_id INT NOT NULL,
                value TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (key, scope_kind, scope_id)
            )
        """))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_ff_overrides_scope "
            "ON feature_flag_overrides (scope_kind, scope_id)"
        ))
        db.session.commit()
        _table_ready = True
        return True
    except Exception as e:
        logger.error(f"feature_flags table create failed: {e}")
        try:
            db.session.rollback()
        except Exception:
            pass
        _table_ready = False
        return False


def _coerce(kind: str, value: Any) -> Any:
    if value is None:
        return None
    if kind == 'bool':
        s = str(value).strip().lower()
        return s in ('1', 'true', 'yes', 'on')
    if kind == 'pct':
        try:
            return max(0, min(100, int(value)))
        except (TypeError, ValueError):
            return None
    return str(value)


def is_enabled(key: str, *, user_id: int | None = None, org_id: int | None = None) -> bool:
    """Return True if the flag is enabled for this user/org/global.

    Order:
      1. Env override KUJA_FF_<KEY_UPPER_DOTS_TO_UNDERSCORES>=on|off
      2. Per-user override
      3. Per-org override
      4. Global DB row
      5. DEFAULT_FLAGS[key]['default']
    """
    spec = DEFAULT_FLAGS.get(key) or {'kind': 'bool', 'default': False}
    kind = spec['kind']
    default = spec.get('default', False if kind == 'bool' else None)

    # 1. Env override
    env_key = 'KUJA_FF_' + key.upper().replace('.', '_').replace('-', '_')
    env_val = os.environ.get(env_key)
    if env_val is not None:
        if kind == 'bool':
            return _coerce('bool', env_val)
        # Non-bool kinds aren't "enabled" semantics; treat as truthy
        return bool(_coerce(kind, env_val))

    if not _ensure_table():
        return bool(default)

    # 2 + 3. Scope overrides
    try:
        for scope_kind, scope_id in (('user', user_id), ('org', org_id)):
            if scope_id is None:
                continue
            r = db.session.execute(
                text(
                    "SELECT value FROM feature_flag_overrides "
                    "WHERE key = :k AND scope_kind = :sk AND scope_id = :sid"
                ),
                {"k": key, "sk": scope_kind, "sid": scope_id},
            ).fetchone()
            if r and r[0] is not None:
                return bool(_coerce(kind, r[0]))

        # 4. Global
        r = db.session.execute(
            text("SELECT kind, value FROM feature_flags WHERE key = :k"),
            {"k": key},
        ).fetchone()
        if r:
            db_kind, db_val = r[0] or kind, r[1]
            if db_val is not None:
                if db_kind == 'pct':
                    pct = _coerce('pct', db_val) or 0
                    if pct >= 100:
                        return True
                    if pct <= 0:
                        return False
                    # Stable bucket per user/org so a given user gets a
                    # consistent answer across requests.
                    bucket_key = f"{key}:{user_id or org_id or 0}"
                    h = int(hashlib.md5(bucket_key.encode()).hexdigest()[:8], 16)
                    return (h % 100) < pct
                return bool(_coerce(db_kind, db_val))
    except Exception as e:
        logger.debug(f"feature flag lookup failed for {key}: {e}")
        try:
            db.session.rollback()
        except Exception:
            pass

    return bool(default)


def get_value(key: str, *, user_id: int | None = None, org_id: int | None = None) -> Any:
    """Generic getter for non-bool flags (variant strings, percentages)."""
    spec = DEFAULT_FLAGS.get(key) or {'kind': 'bool', 'default': None}
    kind = spec['kind']

    env_key = 'KUJA_FF_' + key.upper().replace('.', '_').replace('-', '_')
    env_val = os.environ.get(env_key)
    if env_val is not None:
        return _coerce(kind, env_val)

    if not _ensure_table():
        return spec.get('default')

    try:
        for scope_kind, scope_id in (('user', user_id), ('org', org_id)):
            if scope_id is None:
                continue
            r = db.session.execute(
                text(
                    "SELECT value FROM feature_flag_overrides "
                    "WHERE key = :k AND scope_kind = :sk AND scope_id = :sid"
                ),
                {"k": key, "sk": scope_kind, "sid": scope_id},
            ).fetchone()
            if r and r[0] is not None:
                return _coerce(kind, r[0])

        r = db.session.execute(
            text("SELECT kind, value FROM feature_flags WHERE key = :k"),
            {"k": key},
        ).fetchone()
        if r and r[1] is not None:
            return _coerce(r[0] or kind, r[1])
    except Exception as e:
        logger.debug(f"feature flag get_value failed for {key}: {e}")
        try:
            db.session.rollback()
        except Exception:
            pass

    return spec.get('default')


def set_global(key: str, value: Any) -> bool:
    """Set the global value for a flag. Idempotent upsert."""
    if not _ensure_table():
        return False
    spec = DEFAULT_FLAGS.get(key) or {'kind': 'bool'}
    kind = spec['kind']
    str_val = str(value)
    try:
        db.session.execute(
            text("""
                INSERT INTO feature_flags (key, kind, value, description, updated_at)
                VALUES (:k, :kind, :v, :d, CURRENT_TIMESTAMP)
                ON CONFLICT (key) DO UPDATE
                SET value = EXCLUDED.value,
                    kind = EXCLUDED.kind,
                    updated_at = CURRENT_TIMESTAMP
            """),
            {"k": key, "kind": kind, "v": str_val, "d": spec.get('description')},
        )
        db.session.commit()
        return True
    except Exception as e:
        try:
            db.session.rollback()
        except Exception:
            pass
        logger.error(f"feature flag set_global failed: {e}")
        return False


def set_override(key: str, *, scope_kind: str, scope_id: int, value: Any) -> bool:
    """Set a per-user or per-org override. scope_kind in ('user', 'org')."""
    if scope_kind not in ('user', 'org'):
        return False
    if not _ensure_table():
        return False
    str_val = str(value)
    try:
        db.session.execute(
            text("""
                INSERT INTO feature_flag_overrides (key, scope_kind, scope_id, value)
                VALUES (:k, :sk, :sid, :v)
                ON CONFLICT (key, scope_kind, scope_id) DO UPDATE
                SET value = EXCLUDED.value
            """),
            {"k": key, "sk": scope_kind, "sid": scope_id, "v": str_val},
        )
        db.session.commit()
        return True
    except Exception as e:
        try:
            db.session.rollback()
        except Exception:
            pass
        logger.error(f"feature flag set_override failed: {e}")
        return False


def list_flags() -> list[dict[str, Any]]:
    """Admin-facing listing of every defined flag with its effective global value."""
    out = []
    for key, spec in DEFAULT_FLAGS.items():
        out.append({
            'key': key,
            'kind': spec['kind'],
            'default': spec.get('default'),
            'description': spec.get('description'),
            'global_enabled': is_enabled(key) if spec['kind'] == 'bool' else None,
            'global_value': get_value(key),
        })
    return out
