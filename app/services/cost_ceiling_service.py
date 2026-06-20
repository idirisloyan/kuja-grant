"""
Phase 108 — Per-tenant AI cost ceiling threshold notifications.

`ai_budget_service` already has the hard-cap enforcement (raises
BudgetExceededError when an org goes over its monthly cap). What was
missing was the EARLY signal: a soft-threshold notification when an
org is approaching the cap, so admins can intervene before the hard
gate kicks in and breaks AI surfaces.

This service is the missing soft-threshold layer. It's called from
the AI logging path (replay_service.log_replayable_ai_call) after a
successful call, runs a cheap month-to-date sum, and fires an admin
notification once per (org, threshold-bucket) per day.

Thresholds: 75%, 90%, 100%. Crossing each fires its own notification
so the team sees gradual escalation, not "everything is fine, then
suddenly hard-gated."

Dedup: we use the existing 24h dedup in `create_notification` keyed on
(type, link). Two crossings in the same day suppress to one.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from app.extensions import db
from app.models.organization import Organization
from app.models.user import User
from app.services.ai_budget_service import AIBudgetService
from app.services.notification_service import create_notification

logger = logging.getLogger('kuja')


SOFT_THRESHOLDS = (
    # (pct, label, severity)
    (75, '75% of monthly AI cap used', 'warn'),
    (90, '90% of monthly AI cap used', 'warn'),
    (100, '100% of monthly AI cap reached', 'fail'),
)


def maybe_fire_threshold_notification(org_id: int) -> None:
    """Run a cheap cost check; fire notifications for any thresholds the
    org has crossed in the last call. Idempotent within a 24h window
    thanks to create_notification's built-in dedup."""
    if not org_id:
        return
    try:
        status = AIBudgetService.check_budget(org_id)
    except Exception:
        return
    budget = status.get('budget_usd')
    spent = status.get('spent_usd') or 0
    if not budget or budget <= 0:
        return
    pct = round(100 * spent / budget, 1)
    if pct < SOFT_THRESHOLDS[0][0]:
        return

    org = db.session.get(Organization, org_id)
    if not org:
        return
    # The "owning" admin we notify is every admin user under the same org,
    # plus every platform admin. Platform admins always want to know;
    # tenant admins want to know about their own org.
    recipients: list[int] = []
    try:
        tenant_admins = (
            User.query
            .filter(User.org_id == org_id)
            .filter(User.role.in_(('admin', 'owner')))
            .all()
        )
        recipients.extend([u.id for u in tenant_admins])
    except Exception:
        pass
    try:
        platform_admins = User.query.filter(User.role == 'admin').all()
        recipients.extend([u.id for u in platform_admins])
    except Exception:
        pass
    if not recipients:
        return
    recipients = list(set(recipients))

    # Pick the highest threshold the org has crossed.
    crossed = None
    for threshold_pct, label, severity in SOFT_THRESHOLDS:
        if pct >= threshold_pct:
            crossed = (threshold_pct, label, severity)
    if crossed is None:
        return

    threshold_pct, label, severity = crossed
    link = f"/admin/ai-cost?org_id={org_id}#threshold-{threshold_pct}"
    title = f"{org.name}: {label}"
    message = (
        f"Tenant {org.name} has used ${spent:.2f} of the ${float(budget):.2f} "
        f"monthly cap ({pct}%). "
        + ("Hard gate will block further AI calls until next month."
           if pct >= 100 else
           "Investigate before the hard cap blocks calls.")
    )
    for uid in recipients:
        try:
            create_notification(
                user_id=uid,
                type='ai_budget_threshold',
                title=title,
                message=message,
                link=link,
            )
        except Exception as e:
            logger.debug('threshold notify failed for user %s: %s', uid, e)
