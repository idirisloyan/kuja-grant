"""
GrantBroadcastService — Phase 21B (May 2026).

Donor sends ONE clarification message to every NGO who has applied
(or drafted an application) for a specific grant. Fans out via the
NotificationDispatcher (in_app + email + sms/whatsapp per recipient
prefs) instead of the donor opening 30 individual messages.

Use case:
  - "We extended the deadline by 5 days due to high interest."
  - "Page-limit clarification: the M&E section CAN exceed 2 pages."
  - "Please ignore the typo in section 3 of the doc requirements."

Scoping options:
  - audience='all' → every NGO with any app on the grant (default)
  - audience='drafts' → only draft apps (gentle nudge)
  - audience='submitted' → only submitted/under_review (post-submission clarification)

Best-effort: any one user's dispatch failing doesn't abort the rest.
Records an audit-chain entry so the donor can later show provenance.
"""

import logging

from app.extensions import db
from app.models import Application, Grant, User
from app.services.notification_dispatcher import NotificationDispatcher

logger = logging.getLogger('kuja')

ALLOWED_AUDIENCES = ('all', 'drafts', 'submitted')


class GrantBroadcastService:

    @classmethod
    def send(
        cls, *, grant_id: int, sender_user, subject: str, body: str,
        audience: str = 'all',
    ) -> dict:
        if audience not in ALLOWED_AUDIENCES:
            return {'ok': False, 'reason': 'bad_audience'}
        grant = db.session.get(Grant, grant_id)
        if not grant:
            return {'ok': False, 'reason': 'grant_not_found'}

        subject = (subject or '').strip()[:200]
        body = (body or '').strip()[:4000]
        if not subject or not body:
            return {'ok': False, 'reason': 'subject_and_body_required'}

        # Pick applications based on audience filter
        app_q = Application.query.filter(Application.grant_id == grant_id)
        if audience == 'drafts':
            app_q = app_q.filter(Application.status == 'draft')
        elif audience == 'submitted':
            app_q = app_q.filter(Application.status.in_(('submitted', 'under_review')))
        apps = app_q.all()

        # Unique NGO orgs to notify
        ngo_org_ids = sorted({a.ngo_org_id for a in apps if a.ngo_org_id})
        if not ngo_org_ids:
            return {
                'ok': True,
                'grant_id': grant_id,
                'audience': audience,
                'orgs_targeted': 0,
                'users_notified': 0,
                'notice': 'no_eligible_applications',
            }

        # All active users in those orgs
        users = (
            User.query
            .filter(User.org_id.in_(ngo_org_ids), User.is_active == True)  # noqa: E712
            .all()
        )

        notified = 0
        results = []
        deep_link = f'/grants/{grant_id}'
        for u in users:
            try:
                ch = NotificationDispatcher.dispatch(
                    user_id=u.id,
                    category='deadlines',
                    title=subject,
                    body=body,
                    deep_link_url=deep_link,
                    related_kind='grant',
                    related_id=grant_id,
                )
                results.append({'user_id': u.id, 'org_id': u.org_id, 'channels': ch})
                notified += 1
            except Exception as e:
                logger.warning(f'grant broadcast failed user={u.id}: {e}')

        # Audit-chain anchor so the donor can prove "I told everyone X on Y"
        try:
            from app.models import AuditChainEntry
            AuditChainEntry.append(
                action='grant.broadcast.sent',
                actor_email=getattr(sender_user, 'email', None),
                subject_kind='grant',
                subject_id=grant_id,
                details={
                    'audience': audience,
                    'orgs_targeted': len(ngo_org_ids),
                    'users_notified': notified,
                    'subject': subject[:120],
                },
            )
        except Exception as e:
            logger.warning(f'grant broadcast audit anchor failed: {e}')

        return {
            'ok': True,
            'grant_id': grant_id,
            'audience': audience,
            'orgs_targeted': len(ngo_org_ids),
            'users_notified': notified,
            'channel_results': results,
        }
