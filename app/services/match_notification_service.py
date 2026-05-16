"""
MatchNotificationService — Phase 16C (May 2026).

When a new grant transitions to status='open' (donor publishes), score
every NGO against it and notify the high-confidence matches through
their preferred notification channels.

Why this is category-defining:
  - Today, NGOs find grants via mailing lists + manual search
  - With this, the platform PROACTIVELY surfaces "this grant is a 92%
    match for your org profile — apply by May 28" via in-app + email +
    SMS/WhatsApp per the NGO's prefs (Phase 6)

Discipline:
  - Only notify matches at or above HIGH_MATCH_THRESHOLD (default 65)
  - Cap at TOP_N_NOTIFY (default 20) so a wide-open eligibility grant
    doesn't notify 500 NGOs and become spam
  - Idempotent: writes an AuditChainEntry so we can detect duplicate
    publish events and not re-notify
  - Best-effort: any one NGO's dispatch failing doesn't abort the rest
"""

import logging

from app.extensions import db
from app.models import Grant, Organization, User
from app.services.match_engine import compute
from app.services.notification_dispatcher import NotificationDispatcher

logger = logging.getLogger('kuja')

HIGH_MATCH_THRESHOLD = 65
TOP_N_NOTIFY = 20


class MatchNotificationService:

    @classmethod
    def notify_for_new_grant(cls, grant_id: int) -> dict:
        """Score every active NGO against this grant and dispatch
        notifications to the top matches above threshold.

        Returns a structured summary:
          {
            'grant_id', 'grant_title',
            'ngos_scored', 'high_matches', 'notified',
            'channel_results': [{user_id, channels}]
          }
        """
        grant = db.session.get(Grant, grant_id)
        if not grant:
            return {'ok': False, 'reason': 'grant_missing'}
        if grant.status != 'open':
            return {'ok': False, 'reason': 'grant_not_open'}

        # Idempotency: have we already notified for this grant publish?
        try:
            from app.models import AuditChainEntry
            prior = (
                AuditChainEntry.query
                .filter(AuditChainEntry.action == 'match_notification.published')
                .filter(AuditChainEntry.subject_kind == 'grant')
                .filter(AuditChainEntry.subject_id == grant_id)
                .first()
            )
            if prior:
                return {'ok': True, 'reason': 'already_notified',
                        'grant_id': grant_id}
        except Exception:
            pass

        # Active NGOs to score
        ngos = (
            Organization.query
            .filter(Organization.org_type == 'ngo')
            .all()
        )

        scored = []
        for ngo in ngos:
            try:
                rec = compute(ngo.id, grant.id, persist=True)
                if rec and rec.get('score') is not None:
                    scored.append({
                        'org': ngo,
                        'score': rec.get('score', 0),
                        'top_strength': rec.get('top_strength'),
                        'top_blocker': rec.get('top_blocker'),
                    })
            except Exception as e:
                logger.warning(f'match score failed ngo={ngo.id} grant={grant_id}: {e}')

        # Filter + rank
        high = [s for s in scored if s['score'] >= HIGH_MATCH_THRESHOLD]
        high.sort(key=lambda x: x['score'], reverse=True)
        targets = high[:TOP_N_NOTIFY]

        # Dispatch
        notified = 0
        channel_results = []
        for s in targets:
            ngo = s['org']
            score = s['score']
            users = User.query.filter_by(org_id=ngo.id, is_active=True).all()
            if not users:
                continue
            title = f'New grant match — {round(score)}%'
            body_lines = [
                f'"{grant.title}" looks like a strong fit for {ngo.name}.',
                f'Match score: {round(score)}%.',
            ]
            if s.get('top_strength'):
                body_lines.append(f'Strength: {s["top_strength"]}')
            if s.get('top_blocker'):
                body_lines.append(f'Watch out: {s["top_blocker"]}')
            if grant.deadline:
                body_lines.append(f'Deadline: {grant.deadline.isoformat()}')
            body = '\n'.join(body_lines)
            deep_link = f'/grants/{grant_id}'

            for u in users:
                try:
                    results = NotificationDispatcher.dispatch(
                        user_id=u.id,
                        category='deadlines',
                        title=title,
                        body=body,
                        deep_link_url=deep_link,
                        related_kind='grant',
                        related_id=grant_id,
                    )
                    channel_results.append({
                        'user_id': u.id, 'org_id': ngo.id,
                        'score': round(score), 'channels': results,
                    })
                    notified += 1
                except Exception as e:
                    logger.warning(f'match notify failed user={u.id}: {e}')

        # Anchor in audit chain so a republish doesn't re-fire
        try:
            from app.models import AuditChainEntry
            AuditChainEntry.append(
                action='match_notification.published',
                actor_email=None,
                subject_kind='grant', subject_id=grant_id,
                details={
                    'grant_title': grant.title,
                    'ngos_scored': len(scored),
                    'high_matches': len(high),
                    'notified': notified,
                    'threshold': HIGH_MATCH_THRESHOLD,
                    'top_n': TOP_N_NOTIFY,
                },
            )
        except Exception as e:
            logger.warning(f'match audit anchor failed: {e}')

        return {
            'ok': True,
            'grant_id': grant_id,
            'grant_title': grant.title,
            'ngos_scored': len(scored),
            'high_matches': len(high),
            'notified': notified,
            'channel_results': channel_results,
        }
