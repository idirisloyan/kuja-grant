"""
ApplicationTimelineService — Phase 20A (May 2026).

Single source of truth for "everything that's happened on this application."
Aggregates events from:
  - Application itself (created, submitted, status changes, debrief recorded)
  - Reviews (assigned, completed)
  - AuditChainEntry rows scoped to subject_kind='application' + this id
  - EntityComment rows scoped to ('application', id)

Returns a unified chronological list (descending) with:
  { id, kind, occurred_at, actor_email, actor_name, title, detail, icon_hint }

Display layer decides icons/colors. Service stays pure data.
"""

import json
import logging
from datetime import datetime, timezone

from sqlalchemy import or_

from app.extensions import db
from app.models import (
    Application, AuditChainEntry, EntityComment, Review, User,
)

logger = logging.getLogger('kuja')


def _iso(dt):
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


class ApplicationTimelineService:

    @classmethod
    def for_application(cls, *, application_id: int) -> dict:
        app = (
            Application.query.options(
                db.joinedload(Application.grant),
                db.joinedload(Application.ngo_org),
            )
            .filter_by(id=application_id).first()
        )
        if not app:
            return {'success': False, 'reason': 'not_found'}

        events: list[dict] = []

        # 1. Application lifecycle (created/submitted/decided/debriefed)
        if app.created_at:
            events.append({
                'kind': 'app.created',
                'occurred_at': _iso(app.created_at),
                'actor_email': None,
                'actor_name': app.ngo_org.name if app.ngo_org else None,
                'title': 'Application drafted',
                'detail': f'{app.ngo_org.name if app.ngo_org else "An NGO"} started a draft.',
                'icon_hint': 'edit',
            })
        if app.submitted_at:
            events.append({
                'kind': 'app.submitted',
                'occurred_at': _iso(app.submitted_at),
                'actor_email': None,
                'actor_name': app.ngo_org.name if app.ngo_org else None,
                'title': 'Submitted to donor',
                'detail': 'Application moved into review queue.',
                'icon_hint': 'send',
            })
        # AI score (best signal we have for AI score event is updated_at on the app
        # IF ai_score got set — we don't audit individual score writes, so we
        # surface only the current ai_score for context, not as a separate event)

        # Final decision
        if app.decision_recorded_at and app.decision_reason_code:
            decision = 'awarded' if app.status == 'awarded' else 'rejected'
            try:
                from app.constants import WIN_LOSS_REASONS
                label_map = {r['code']: r['label'] for r in WIN_LOSS_REASONS}
                reason_label = label_map.get(app.decision_reason_code, app.decision_reason_code)
            except Exception:
                reason_label = app.decision_reason_code
            events.append({
                'kind': f'app.{decision}',
                'occurred_at': _iso(app.decision_recorded_at),
                'actor_email': None,
                'actor_name': 'Donor',
                'title': f'Decision recorded: {decision}',
                'detail': f'Reason: {reason_label}. ' + ((app.decision_notes or '')[:240]),
                'icon_hint': 'award' if decision == 'awarded' else 'x',
            })

        # 2. Reviews (assigned + completed)
        reviews = (
            Review.query
            .filter_by(application_id=application_id)
            .options(db.joinedload(Review.reviewer_user_id) if False else db.joinedload(Review.application))  # noqa
            .all()
        )
        # Build reviewer name map cheaply
        rids = [r.reviewer_user_id for r in reviews]
        users_by_id = {}
        if rids:
            for u in User.query.filter(User.id.in_(rids)).all():
                users_by_id[u.id] = u

        for r in reviews:
            reviewer = users_by_id.get(r.reviewer_user_id)
            r_name = reviewer.name if reviewer else f'Reviewer #{r.reviewer_user_id}'
            if r.created_at:
                events.append({
                    'kind': 'review.assigned',
                    'occurred_at': _iso(r.created_at),
                    'actor_email': reviewer.email if reviewer else None,
                    'actor_name': r_name,
                    'title': 'Reviewer assigned',
                    'detail': f'{r_name} added to the review pool.',
                    'icon_hint': 'user-plus',
                })
            if r.completed_at and r.status == 'completed':
                score_text = f' (score {round(r.overall_score)}/100)' if r.overall_score is not None else ''
                events.append({
                    'kind': 'review.completed',
                    'occurred_at': _iso(r.completed_at),
                    'actor_email': reviewer.email if reviewer else None,
                    'actor_name': r_name,
                    'title': 'Review completed',
                    'detail': f'{r_name} finished their review{score_text}.',
                    'icon_hint': 'check-circle',
                })

        # 3. Audit chain entries scoped to this application
        audit_rows = (
            AuditChainEntry.query
            .filter(AuditChainEntry.subject_kind == 'application')
            .filter(AuditChainEntry.subject_id == application_id)
            .order_by(AuditChainEntry.id.asc())
            .all()
        )
        for a in audit_rows:
            try:
                details = json.loads(a.details_json) if a.details_json else {}
            except Exception:
                details = {}
            title, detail, icon = cls._audit_to_event(a.action, details)
            events.append({
                'kind': f'audit.{a.action}',
                'occurred_at': _iso(a.created_at),
                'actor_email': a.actor_email,
                'actor_name': None,
                'title': title,
                'detail': detail,
                'icon_hint': icon,
            })

        # 4. EntityComment (existing threaded comments)
        comments = (
            EntityComment.query
            .filter_by(entity_kind='application', entity_id=application_id)
            .order_by(EntityComment.created_at.asc())
            .all()
        )
        for c in comments:
            author = (
                users_by_id.get(c.author_user_id)
                if c.author_user_id in users_by_id
                else db.session.get(User, c.author_user_id)
            )
            if author and author.id not in users_by_id:
                users_by_id[author.id] = author
            preview = (c.body_md or '').strip()
            if len(preview) > 240:
                preview = preview[:240] + '…'
            events.append({
                'kind': 'comment.posted',
                'occurred_at': _iso(c.created_at),
                'actor_email': author.email if author else None,
                'actor_name': author.name if author else f'User #{c.author_user_id}',
                'title': 'Comment posted',
                'detail': preview,
                'icon_hint': 'message-square',
            })

        # Sort descending
        events.sort(key=lambda e: e['occurred_at'] or '', reverse=True)

        return {
            'success': True,
            'application_id': application_id,
            'grant_title': app.grant.title if app.grant else None,
            'ngo_name': app.ngo_org.name if app.ngo_org else None,
            'current_status': app.status,
            'events': events,
            'event_count': len(events),
            'computed_at': datetime.now(timezone.utc).isoformat(),
        }

    @staticmethod
    def _audit_to_event(action: str, details: dict) -> tuple[str, str, str]:
        """Translate audit-chain action codes into human titles + icons."""
        if action == 'reviewer_followups.sent':
            n = details.get('question_count', 0) or 0
            r = details.get('recipients', 0) or 0
            return (
                'Reviewer follow-ups sent',
                f'{n} question{"s" if n != 1 else ""} sent to {r} recipient{"s" if r != 1 else ""}.',
                'send',
            )
        if action == 'report_bundle.publish':
            return ('Report bundle published',
                    'NGO published a tamper-evident report bundle.',
                    'file-check')
        if action == 'report_bundle.download_pdf':
            return ('Report bundle downloaded',
                    f'{details.get("reviewer_role", "Reviewer")} downloaded the bundle PDF.',
                    'download')
        if action == 'application.debrief.recorded':
            return ('Debrief recorded',
                    f'Reason code: {details.get("reason_code") or "—"}.',
                    'clipboard')
        # Catch-all: surface the action code so we don't silently drop signals
        return (
            action.replace('.', ' ').replace('_', ' ').title(),
            json.dumps({k: v for k, v in (details or {}).items() if k != 'pdf_bytes'})[:240],
            'activity',
        )
