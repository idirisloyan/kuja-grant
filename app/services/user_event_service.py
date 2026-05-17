"""
UserEventService — Phase 29A (May 2026).

Wraps the UserEvent model with a record/query API that callers can use
without worrying about transactions, schema, or aggregation SQL.

Record path is best-effort: a failure to log an event NEVER raises
or blocks the calling request. Analytics is a read-only side channel.
"""

import logging
from datetime import datetime, timedelta, timezone
from collections import defaultdict

from sqlalchemy import func, distinct

from app.extensions import db
from app.models import UserEvent

logger = logging.getLogger('kuja')


class UserEventService:

    # ------------------------------------------------------------------
    # Record (called from anywhere a user does something we care about)
    # ------------------------------------------------------------------

    @classmethod
    def record(cls, *, user, event_name: str, ab_arm: str | None = None,
               **props) -> None:
        """Persist a single event. Best-effort: any exception is swallowed.

        Caller usage:
            UserEventService.record(user=current_user,
                                     event_name='application.submit',
                                     application_id=app.id, score=82.4)
        """
        try:
            uid = getattr(user, 'id', None)
            org_id = getattr(user, 'org_id', None)
            role = getattr(user, 'role', None)
            language = getattr(user, 'language', None)
            ev = UserEvent(
                user_id=uid,
                org_id=org_id,
                role=role,
                language=language,
                event_name=event_name,
                ab_arm=ab_arm,
            )
            ev.set_props(props)
            db.session.add(ev)
            # We commit explicitly because most callers are inside a
            # broader request transaction; if that transaction rolls
            # back we want the event recorded anyway. Use a savepoint.
            db.session.flush()
            try:
                db.session.commit()
            except Exception:
                # If the outer txn is in a bad state, rollback + retry
                # in a fresh transaction.
                db.session.rollback()
                ev2 = UserEvent(
                    user_id=uid, org_id=org_id, role=role, language=language,
                    event_name=event_name, ab_arm=ab_arm,
                )
                ev2.set_props(props)
                db.session.add(ev2)
                db.session.commit()
        except Exception as e:
            try:
                db.session.rollback()
            except Exception:
                pass
            logger.debug(f'user-event record skipped: {e}')

    # ------------------------------------------------------------------
    # Aggregations for the metrics dashboard
    # ------------------------------------------------------------------

    @classmethod
    def active_users(cls, *, days: int = 1) -> dict:
        """Distinct user_id count + per-role + per-language breakdowns
        over the trailing N days."""
        since = datetime.now(timezone.utc) - timedelta(days=days)
        base = UserEvent.query.filter(UserEvent.occurred_at >= since)

        total = base.with_entities(
            func.count(distinct(UserEvent.user_id))
        ).scalar() or 0

        by_role = dict(
            base.with_entities(UserEvent.role,
                               func.count(distinct(UserEvent.user_id)))
            .group_by(UserEvent.role).all()
        )
        by_language = dict(
            base.with_entities(UserEvent.language,
                               func.count(distinct(UserEvent.user_id)))
            .group_by(UserEvent.language).all()
        )

        return {
            'window_days': days,
            'total': int(total),
            'by_role': {k or 'unknown': int(v) for k, v in by_role.items()},
            'by_language': {k or 'unknown': int(v) for k, v in by_language.items()},
        }

    @classmethod
    def event_counts(cls, *, days: int = 30) -> list[dict]:
        """Count of each event_name over the trailing N days, descending."""
        since = datetime.now(timezone.utc) - timedelta(days=days)
        rows = (
            UserEvent.query
            .filter(UserEvent.occurred_at >= since)
            .with_entities(UserEvent.event_name, func.count(UserEvent.id))
            .group_by(UserEvent.event_name)
            .order_by(func.count(UserEvent.id).desc())
            .all()
        )
        return [{'event_name': name, 'count': int(c)} for name, c in rows]

    @classmethod
    def funnel(cls, *, stages: list[str], days: int = 30) -> dict:
        """Naive funnel: for each stage, count distinct users who
        recorded that event in the window. Returns absolute counts and
        the conversion rate from stage[0].

        NOT the same as a strict ordered funnel — for that we'd need
        per-session tracking. This is enough for "how many people who
        opened the chat actually sent a message?" type signal.
        """
        since = datetime.now(timezone.utc) - timedelta(days=days)
        out_stages = []
        base_count = None
        for s in stages:
            count = (
                UserEvent.query
                .filter(UserEvent.occurred_at >= since)
                .filter(UserEvent.event_name == s)
                .with_entities(func.count(distinct(UserEvent.user_id)))
                .scalar() or 0
            )
            count = int(count)
            if base_count is None:
                base_count = count
            rate = (count / base_count * 100) if base_count else 0
            out_stages.append({
                'event_name': s,
                'unique_users': count,
                'rate_vs_base_pct': round(rate, 1),
            })
        return {
            'window_days': days,
            'stages': out_stages,
        }

    @classmethod
    def feature_usage_by_language(cls, *, event_name: str,
                                  days: int = 30) -> dict:
        """For a single feature event, count distinct users per
        language. Helps answer 'is this feature used equally across
        locales or English-biased?'."""
        since = datetime.now(timezone.utc) - timedelta(days=days)
        rows = (
            UserEvent.query
            .filter(UserEvent.occurred_at >= since)
            .filter(UserEvent.event_name == event_name)
            .with_entities(UserEvent.language,
                           func.count(distinct(UserEvent.user_id)))
            .group_by(UserEvent.language)
            .all()
        )
        return {
            'event_name': event_name,
            'window_days': days,
            'by_language': {k or 'unknown': int(v) for k, v in rows},
        }

    @classmethod
    def ab_outcome(cls, *, outcome_event: str, days: int = 30) -> dict:
        """For a given outcome event, split count by ab_arm. Useful for
        'do users in the ai_on arm complete more applications than ai_off?'.
        Returns NULL arm bucket too so we can see baseline."""
        since = datetime.now(timezone.utc) - timedelta(days=days)
        rows = (
            UserEvent.query
            .filter(UserEvent.occurred_at >= since)
            .filter(UserEvent.event_name == outcome_event)
            .with_entities(UserEvent.ab_arm,
                           func.count(distinct(UserEvent.user_id)))
            .group_by(UserEvent.ab_arm)
            .all()
        )
        return {
            'outcome_event': outcome_event,
            'window_days': days,
            'by_arm': {k or '(unbucketed)': int(v) for k, v in rows},
        }
