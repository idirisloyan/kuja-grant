"""
Audit retention prune — Phase 13.30.

Reads KUJA_AUDIT_RETENTION_DAYS (default 365) and deletes:
  - ai_call_logs older than the window
  - notifications older than the window AND read

Hash-chained audit_chain rows are NEVER pruned — they're the
cryptographic record (Phase 13.12). If retention compliance ever
forces audit_chain pruning, build a separate snapshot+anchor flow
that writes a new genesis row pointing at the pruned segment's hash.
"""

import os
from datetime import datetime, timedelta, timezone

from app.extensions import db


def run_audit_prune() -> dict:
    """Returns {ai_call_logs_deleted, notifications_deleted, window_days}."""
    from sqlalchemy import text

    window_days = int(os.environ.get('KUJA_AUDIT_RETENTION_DAYS', '365'))
    window_days = max(30, min(3650, window_days))  # clamp to safe range
    cutoff = datetime.now(timezone.utc) - timedelta(days=window_days)

    ai_deleted = 0
    notif_deleted = 0
    try:
        # ai_call_logs: nothing references these by FK; safe to hard delete.
        result = db.session.execute(
            text("DELETE FROM ai_call_logs WHERE created_at < :cutoff"),
            {"cutoff": cutoff},
        )
        ai_deleted = int(result.rowcount or 0)
        db.session.commit()
    except Exception:
        db.session.rollback()

    try:
        # notifications: only prune READ ones. Unread stay forever
        # until the user dismisses them (they're current actionable signal).
        # Schema: read_at column exists when notification has been read.
        result = db.session.execute(
            text("""
                DELETE FROM notifications
                WHERE created_at < :cutoff
                  AND (read_at IS NOT NULL OR is_read = TRUE)
            """),
            {"cutoff": cutoff},
        )
        notif_deleted = int(result.rowcount or 0)
        db.session.commit()
    except Exception:
        db.session.rollback()

    # Audit chain rows are NEVER pruned — see module docstring.
    return {
        'ai_call_logs_deleted': ai_deleted,
        'notifications_deleted': notif_deleted,
        'window_days': window_days,
        'cutoff': cutoff.isoformat(),
        'ran_at': datetime.now(timezone.utc).isoformat(),
    }
