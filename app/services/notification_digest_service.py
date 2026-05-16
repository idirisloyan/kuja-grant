"""
NotificationDigestService — Phase 9 (May 2026).

Rolls up unread notifications per user and fires ONE summary
notification per period instead of N pings. Prevents SMS / WhatsApp
spam when many low-severity events accumulate.

Frequency: configurable per user via NotificationPreference.digest_frequency
(daily | weekly | off). Default 'off' so this never fires for users
who didn't opt in.

How it composes:
  - Pull unread Notification rows for the last N days, grouped by type
  - Build a compact body: "Today: 3 deadline reminders, 1 compliance
    flag, 2 reviews assigned."
  - Dispatch via NotificationDispatcher with category='digest'
  - Mark the rolled-up notifications as 'digested' so we don't re-send
    them in the next cycle (uses notifications.metadata or a separate
    digest_log table — for simplicity we just track the cutoff timestamp
    per user in the dashboard cache)
"""

import logging
from datetime import datetime, timedelta, timezone

from app.extensions import db
from app.models import Notification, NotificationPreference, User
from app.services.notification_dispatcher import NotificationDispatcher
from app.utils.cache import _dashboard_cache

logger = logging.getLogger('kuja')


# Frequencies are stored in NotificationPreference.channels_json under a
# pseudo-category 'digest' so we don't need a schema change. Values:
DIGEST_VALUES = {'off', 'daily', 'weekly'}


class NotificationDigestService:

    LOOKBACK_DAYS = {'daily': 1, 'weekly': 7}

    @classmethod
    def cutoff_cache_key(cls, user_id: int) -> str:
        return f'notif_digest_cutoff:{user_id}'

    @classmethod
    def run_for_user(cls, user_id: int, *, frequency: str = 'daily', force: bool = False) -> dict:
        """Build + dispatch the digest for one user.

        Returns: {sent: bool, channels: [...], items_rolled_up: int, reason?: str}
        """
        if frequency not in cls.LOOKBACK_DAYS:
            return {'sent': False, 'reason': f'invalid_frequency:{frequency}'}

        # Don't re-send within the same window
        cutoff_key = cls.cutoff_cache_key(user_id)
        last_sent_iso = _dashboard_cache.get(cutoff_key)
        if last_sent_iso and not force:
            try:
                last_sent = datetime.fromisoformat(str(last_sent_iso))
                interval = timedelta(hours=20) if frequency == 'daily' else timedelta(days=6)
                if last_sent > datetime.now(timezone.utc) - interval:
                    return {'sent': False, 'reason': 'within_dedupe_window',
                            'last_sent': last_sent_iso}
            except Exception:
                pass

        # Pull unread notifications for the last N days
        lookback = cls.LOOKBACK_DAYS[frequency]
        since = datetime.now(timezone.utc) - timedelta(days=lookback)
        unread = (
            Notification.query
            .filter_by(user_id=user_id, read=False)
            .filter(Notification.created_at >= since)
            .order_by(Notification.created_at.desc())
            .limit(50)
            .all()
        )
        if not unread:
            return {'sent': False, 'reason': 'no_unread'}

        # Group by type
        groups: dict[str, list] = {}
        for n in unread:
            groups.setdefault(n.type or 'other', []).append(n)

        # Compose digest body
        period_label = 'today' if frequency == 'daily' else 'this week'
        parts = []
        for t, items in sorted(groups.items(), key=lambda kv: -len(kv[1])):
            label = t.replace('_', ' ')
            parts.append(f'{len(items)} {label}{"" if len(items) == 1 else "s"}')
        summary = f'Kuja {period_label}: ' + '; '.join(parts) + '.'

        # Top 3 most recent items in the longer-form body (in-app + email use this)
        snippets = []
        for n in unread[:3]:
            snippets.append(f'• {n.title}')
        body = '\n'.join(snippets) + (
            f'\n+ {len(unread) - 3} more.' if len(unread) > 3 else ''
        )

        results = NotificationDispatcher.dispatch(
            user_id=user_id,
            category='digest',
            title=summary[:200],
            body=body[:1800],
            deep_link_url='/dashboard',
            related_kind='digest',
        )

        # Mark the cutoff so we don't re-send in this window
        _dashboard_cache.set(cutoff_key, datetime.now(timezone.utc).isoformat())

        return {
            'sent': True,
            'frequency': frequency,
            'channels': [r.get('channel') for r in results if r.get('success') and not r.get('skipped')],
            'items_rolled_up': len(unread),
            'summary': summary,
        }

    @classmethod
    def run_for_all_eligible(cls, *, frequency_filter: str | None = None) -> dict:
        """Cron entry point: iterates users whose digest preference is on.

        Phase 22D — honors User.digest_cadence (daily/weekly/off) as the
        canonical setting. Falls back to the legacy "digest:<freq>"
        channels-list convention so older installs keep working.

        If `frequency_filter` is provided ('daily' or 'weekly'), only
        users on that exact cadence are picked — so a daily cron can
        call run_for_all_eligible(frequency_filter='daily') without
        also re-firing weekly users.
        """
        from app.models import User

        # Use the User table as the authoritative source so users who
        # never set a NotificationPreference row also get digests.
        users = User.query.filter(User.is_active == True).all()  # noqa: E712
        seen = set()
        results = []

        # Build legacy channels-prefix lookup once (back-compat)
        legacy_pref_by_user: dict[int, str] = {}
        for r in NotificationPreference.query.all():
            if r.user_id in legacy_pref_by_user:
                continue
            for c in (r.get_channels() or []):
                if c.startswith('digest:'):
                    legacy_pref_by_user[r.user_id] = c.split(':', 1)[1]
                    break

        for u in users:
            if u.id in seen:
                continue
            cadence = (getattr(u, 'digest_cadence', None) or '').strip().lower()
            if cadence in ('', None) and u.id in legacy_pref_by_user:
                cadence = legacy_pref_by_user[u.id]
            if cadence not in cls.LOOKBACK_DAYS:
                # 'off' or unset → skip
                continue
            if frequency_filter and cadence != frequency_filter:
                continue
            seen.add(u.id)
            results.append(cls.run_for_user(u.id, frequency=cadence))

        return {
            'eligible_users': len(seen),
            'frequency_filter': frequency_filter,
            'results': results,
            'ran_at': datetime.now(timezone.utc).isoformat(),
        }
