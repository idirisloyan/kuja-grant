"""
Scheduled-task entry points — Phase 15D.

Blueprint prefix: /api/cron

All endpoints accept EITHER:
  - Authorization: Bearer $CRON_SECRET   (production scheduler)
  - An authenticated admin session       (manual run for debugging)

Routes here are idempotent and safe to call repeatedly. They surface
their work via the response payload so monitoring can alert on drift.
"""

import logging
import os

from flask import Blueprint, jsonify, request
from flask_login import current_user

logger = logging.getLogger('kuja')

cron_bp = Blueprint('cron', __name__, url_prefix='/api/cron')


def _is_authorized() -> bool:
    """CRON_SECRET via Bearer header OR an admin session."""
    auth_header = request.headers.get('Authorization', '')
    secret = os.getenv('CRON_SECRET') or ''
    if secret and auth_header == f'Bearer {secret}':
        return True
    if current_user.is_authenticated and getattr(current_user, 'role', None) == 'admin':
        return True
    return False


@cron_bp.route('/compliance-rerun', methods=['POST'])
def api_cron_compliance_rerun():
    """Phase 22C — re-screen NGOs whose adverse-media screening is stale.

    Caps MAX_PER_RUN per tick. Structured drift report so monitoring can
    alert if backlog grows (skipped_capacity > 0 for multiple days in a row).
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    t0 = _time.time()
    try:
        from app.services.compliance_rerun_service import ComplianceRerunService
        result = ComplianceRerunService.run()
        logger.info(f'compliance rerun cron: {result}')
        from app.models import record_cron_run
        record_cron_run('compliance-rerun',
                        duration_ms=int((_time.time() - t0) * 1000),
                        success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception(f'compliance rerun cron failed: {e}')
        try:
            from app.models import record_cron_run
            record_cron_run('compliance-rerun',
                            duration_ms=int((_time.time() - t0) * 1000),
                            success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/health', methods=['GET'])
def api_cron_health():
    """Phase 153 — Cron health snapshot for the admin monitor page.

    For each known cron, returns:
      - last_run_at (ISO) or null
      - last_success
      - last_duration_ms
      - last_summary
      - staleness_band: 'fresh' (ran in expected window),
                       'overdue' (past expected window),
                       'never' (no row ever)

    Admin-only. Reads from the cron_runs table populated by every
    cron handler.
    """
    from flask_login import current_user as _cu
    if not getattr(_cu, 'is_authenticated', False):
        return jsonify({'success': False, 'error': 'unauth'}), 401
    if getattr(_cu, 'role', None) != 'admin':
        return jsonify({'success': False, 'error': 'admin_only'}), 403

    KNOWN = {
        # name -> expected_cadence_hours, description
        'compliance-rerun': (24, 'Re-screen NGOs with stale adverse-media checks'),
        'reviewer-auto-assign-sweep': (24, 'Nightly safety-net for reviewer assignment'),
        'uat-fixtures': (24, 'Self-healing demo fixtures for UAT'),
        'crisis-monitoring-draft': (24 * 7, 'Weekly Crisis Monitoring Report draft'),
        'webhook-deliveries-cleanup': (24, 'Cap WebhookDelivery rows per hook to bound table size'),
    }

    from sqlalchemy import func as _f
    from datetime import datetime, timezone as _tz, timedelta as _td
    from app.models import CronRun
    try:
        rows = (
            db.session.query(
                CronRun.name,
                _f.max(CronRun.run_at).label('last_run_at'),
            )
            .filter(CronRun.name.in_(list(KNOWN.keys())))
            .group_by(CronRun.name)
            .all()
        )
    except Exception:
        rows = []
    last_run_map = {r[0]: r[1] for r in rows}

    detail = []
    now = datetime.now(_tz.utc)
    for name, (cadence_h, desc) in KNOWN.items():
        last_at = last_run_map.get(name)
        # Pull the most recent row for that cron to surface
        # success + summary + duration.
        latest = None
        try:
            latest = (
                CronRun.query
                .filter_by(name=name)
                .order_by(CronRun.run_at.desc())
                .first()
            )
        except Exception:
            pass
        if last_at is None:
            band = 'never'
        else:
            # Compare against expected cadence + grace (50% over).
            if last_at.tzinfo is None:
                last_at_aware = last_at.replace(tzinfo=_tz.utc)
            else:
                last_at_aware = last_at
            age_h = (now - last_at_aware).total_seconds() / 3600
            band = 'fresh' if age_h <= cadence_h * 1.5 else 'overdue'
        detail.append({
            'name': name,
            'description': desc,
            'cadence_hours': cadence_h,
            'last_run_at': last_at.isoformat() if last_at else None,
            'last_success': bool(latest.success) if latest else None,
            'last_duration_ms': latest.duration_ms if latest else None,
            'last_summary': latest.summary if latest else None,
            'staleness_band': band,
        })

    return jsonify({
        'success': True,
        'crons': detail,
        'summary': {
            'fresh': sum(1 for d in detail if d['staleness_band'] == 'fresh'),
            'overdue': sum(1 for d in detail if d['staleness_band'] == 'overdue'),
            'never': sum(1 for d in detail if d['staleness_band'] == 'never'),
        },
    })


@cron_bp.route('/reviewer-auto-assign-sweep', methods=['POST'])
def api_cron_reviewer_auto_assign_sweep():
    """Phase 26B — nightly safety net for reviewer auto-assignment.

    Phase 25A wired auto-assign into the application submit handler,
    but apps submitted before Phase 25A — or where the synchronous
    call failed silently inside the broad-except — can still be
    sitting in queue without reviewers. This sweep catches them.

    Walks every application in {submitted, under_review} that has
    zero Review rows and triggers ReviewerAutoAssignService.run()
    against each. Caps MAX_PER_RUN to avoid bursts.

    Returns a structured report: scanned, assigned, skipped (with
    reason buckets) so monitoring can alert if backlog grows.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.models import Application, Review
        from app.services.reviewer_auto_assign_service import (
            ReviewerAutoAssignService,
        )

        MAX_PER_RUN = 50
        # Find apps that need reviewers
        candidates = (
            Application.query
            .filter(Application.status.in_(('submitted', 'under_review')))
            .order_by(Application.submitted_at.asc().nullsfirst())
            .limit(MAX_PER_RUN * 2)  # buffer because we'll filter out already-assigned
            .all()
        )

        scanned = 0
        assigned_apps = 0
        total_reviewers_assigned = 0
        skipped: dict[str, int] = {}

        for app in candidates:
            if scanned >= MAX_PER_RUN:
                break
            # Skip if any reviews already exist
            has_reviews = (
                Review.query.filter_by(application_id=app.id).first() is not None
            )
            if has_reviews:
                skipped['already_assigned'] = skipped.get('already_assigned', 0) + 1
                continue
            scanned += 1
            try:
                r = ReviewerAutoAssignService.run(
                    application_id=app.id,
                    actor_email='cron.reviewer_auto_assign_sweep',
                )
                if r.get('ok') and r.get('assigned', 0) > 0:
                    assigned_apps += 1
                    total_reviewers_assigned += r['assigned']
                else:
                    reason = r.get('reason') or 'no_assignment'
                    skipped[reason] = skipped.get(reason, 0) + 1
            except Exception as e:
                logger.warning(
                    f'auto-assign sweep failed for app={app.id}: {e}'
                )
                skipped['exception'] = skipped.get('exception', 0) + 1

        result = {
            'scanned': scanned,
            'apps_assigned': assigned_apps,
            'reviewers_assigned': total_reviewers_assigned,
            'skipped': skipped,
            'cap': MAX_PER_RUN,
        }
        logger.info(f'reviewer auto-assign sweep cron: {result}')
        from app.models import record_cron_run as _rcr
        _rcr('reviewer-auto-assign-sweep',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception(f'reviewer auto-assign sweep cron failed: {e}')
        try:
            from app.models import record_cron_run as _rcr
            _rcr('reviewer-auto-assign-sweep',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/uat-fixtures', methods=['POST'])
def api_cron_uat_fixtures():
    """Daily-runnable: ensure demo/UAT state stays meaningful.

    Specifically ensures:
      - each donor has at least 1 open grant (flips draft → open if needed)
      - each donor has at least 1 awarded + 1 rejected app with a debrief
      - at least one report bundle is published (so audit chain has content)

    Returns a structured summary so the cron caller can log + alert on
    drift (e.g. 'no_candidate' counts >0 means demo data is too thin).
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403

    import time as _time
    _t0 = _time.time()
    try:
        from app.services.uat_fixture_service import UATFixtureService
        result = UATFixtureService.run()
        logger.info(f'UAT fixture cron: {result}')
        from app.models import record_cron_run as _rcr
        _rcr('uat-fixtures',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception(f'UAT fixture cron failed: {e}')
        try:
            from app.models import record_cron_run as _rcr
            _rcr('uat-fixtures',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/crisis-monitoring-draft', methods=['POST'])
def api_cron_crisis_monitoring_draft():
    """Phase 35 — weekly auto-draft of a Crisis Monitoring Report for
    every active network. Idempotent: only creates a draft if none
    already exists for this week's period.

    Real news/ReliefWeb pull + AI narrative drafting land in Phase 38;
    for now this just creates the empty draft + rolls pending CrisisSignals
    into it as preliminary rows. Secretariat fills + publishes manually.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403

    import time as _time
    _t0 = _time.time()
    try:
        from datetime import date, timedelta
        from app.extensions import db
        from app.models import (
            Network, CrisisMonitoringReport, CrisisMonitoringRow,
            CrisisSignal,
        )

        today = date.today()
        # Week ending today; covers the previous 7 days.
        period_end = today
        period_start = period_end - timedelta(days=7)

        drafted = []
        skipped = []
        rolled_signals = 0

        for net in Network.query.filter_by(is_active=True).all():
            existing = CrisisMonitoringReport.query.filter_by(
                network_id=net.id,
                period_start=period_start,
                period_end=period_end,
            ).first()
            if existing:
                skipped.append({"network_id": net.id, "report_id": existing.id})
                continue
            r = CrisisMonitoringReport(
                network_id=net.id,
                period_start=period_start,
                period_end=period_end,
                generated_by='cron',
                status='draft',
                summary_md=(
                    f"Auto-drafted by weekly cron for {net.name}. "
                    "Secretariat: review + edit + publish."
                ),
            )
            db.session.add(r)
            db.session.flush()  # need r.id for the FK

            # Pull pending signals for this network, group by country,
            # create one row per (country, event_type) bucket.
            pending = CrisisSignal.query.filter_by(
                network_id=net.id, status='pending',
            ).all()
            buckets: dict[tuple[str, str | None], list[CrisisSignal]] = {}
            for s in pending:
                key = (s.country, s.event_type)
                buckets.setdefault(key, []).append(s)

            for (country, event_type), sigs in buckets.items():
                narrative_lines = [
                    f"- {s.description[:200]}" for s in sigs[:5]
                ]
                row = CrisisMonitoringRow(
                    report_id=r.id,
                    country=country,
                    event_type=event_type,
                    event_title=f"Member-reported {(event_type or 'event').replace('_', ' ')}",
                    narrative=(
                        f"{len(sigs)} member signal(s) reported this period:\n"
                        + "\n".join(narrative_lines)
                    ),
                    flagged_for_ob=False,
                )
                # Score with whatever defaults we have; secretariat sets
                # bands manually during review. Composite stays low so
                # nothing accidentally surfaces to the OB as urgent.
                row.composite_score = CrisisMonitoringRow.compute_composite_score(
                    hdi_band=None,
                    gov_capacity_band=None,
                    people_impacted_estimate=None,
                    attention_band=None,
                )
                db.session.add(row)
                for s in sigs:
                    s.status = 'rolled_in'
                    s.rolled_into_report_id = r.id
                    rolled_signals += 1

            drafted.append({"network_id": net.id, "report_id": r.id})

        db.session.commit()
        try:
            from app.models import record_cron_run as _rcr
            _rcr('crisis-monitoring-draft',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=True,
                 summary=f'drafted={len(drafted)} skipped={skipped} signals={rolled_signals}'[:480])
        except Exception:
            pass
        return jsonify({
            'success': True,
            'result': {
                'drafted': drafted,
                'skipped_existing': skipped,
                'rolled_signals': rolled_signals,
                'period_start': period_start.isoformat(),
                'period_end': period_end.isoformat(),
            },
        })
    except Exception as e:
        logger.exception(f'crisis monitoring draft cron failed: {e}')
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/webhook-deliveries-cleanup', methods=['POST'])
def api_cron_webhook_cleanup():
    """Phase 171 — Keep only the last N WebhookDelivery rows per hook.

    webhook_deliveries grows by one row per fan-out; even a modest
    pipeline can hit hundreds of thousands quickly. We don't need
    deeper history than the dashboard surfaces (last 20), so a hard
    cap at 200 per hook gives ops 10x the visible window without
    letting the table balloon.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    KEEP_PER_HOOK = 200
    try:
        from app.models import Webhook, WebhookDelivery, record_cron_run as _rcr
        from sqlalchemy import select as _select
        deleted_total = 0
        hooks_swept = 0
        for hook in Webhook.query.all():
            # Find the row ids we want to KEEP — the last KEEP_PER_HOOK.
            keep_ids = [
                r[0] for r in db.session.execute(
                    _select(WebhookDelivery.id)
                    .where(WebhookDelivery.webhook_id == hook.id)
                    .order_by(WebhookDelivery.delivered_at.desc())
                    .limit(KEEP_PER_HOOK)
                ).all()
            ]
            if not keep_ids:
                continue
            # Delete the older overflow.
            n = (
                WebhookDelivery.query
                .filter_by(webhook_id=hook.id)
                .filter(~WebhookDelivery.id.in_(keep_ids))
                .delete(synchronize_session=False)
            )
            deleted_total += int(n or 0)
            hooks_swept += 1
        db.session.commit()
        result = {
            'hooks_swept': hooks_swept,
            'rows_deleted': deleted_total,
            'keep_per_hook': KEEP_PER_HOOK,
        }
        _rcr('webhook-deliveries-cleanup',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception(f'webhook deliveries cleanup cron failed: {e}')
        try:
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('webhook-deliveries-cleanup',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/watched-deadlines', methods=['POST'])
def api_cron_watched_deadlines():
    """Phase 238 — Notify NGOs about watched grants closing in <= 3 days.

    Idempotent per-day in practice — sending twice creates dupe
    notifications but no harm. Pulls every WatchlistItem where
    kind='grant', joins the grant, computes days-until-deadline, and
    if 0..3 fires a `grant_deadline_soon` notification.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import (
            WatchlistItem, Grant, Notification, record_cron_run as _rcr,
        )
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc)
        items = WatchlistItem.query.filter_by(kind='grant').all()
        sent = 0
        scanned = 0
        for w in items:
            scanned += 1
            g = db.session.get(Grant, w.target_id)
            if not g or g.status != 'open' or not g.deadline:
                continue
            dl = g.deadline
            if dl.tzinfo is None:
                dl = dl.replace(tzinfo=timezone.utc)
            days = (dl - now).days
            if 0 <= days <= 3:
                msg = (
                    f'"{g.title}" closes in {days} day{"s" if days != 1 else ""}.'
                    if days > 0 else
                    f'"{g.title}" closes today.'
                )
                n = Notification(
                    user_id=w.user_id,
                    type='grant_deadline_soon',
                    title='Watched grant closing soon',
                    message=msg,
                    link=f'/grants/{g.id}',
                )
                db.session.add(n)
                sent += 1
        if sent > 0:
            db.session.commit()
        result = {'scanned': scanned, 'sent': sent}
        _rcr('watched-deadlines',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception('watched-deadlines cron failed: %s', e)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('watched-deadlines',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/donor-digest', methods=['POST'])
def api_cron_donor_digest():
    """Phase 268 — Weekly donor summary notification.

    Fires one in-app notification per donor user with last-7-days counts:
      - applications received
      - applications scored
      - applications decided (awarded/declined/rejected)
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import (
            User, Application, Grant, Notification, record_cron_run as _rcr,
        )
        from datetime import datetime, timezone, timedelta

        cutoff = datetime.now(timezone.utc) - timedelta(days=7)

        donors = User.query.filter_by(role='donor').all()
        sent = 0
        for u in donors:
            if not u.org_id:
                continue
            # Apps received: created in window
            received = Application.query.join(Grant).filter(
                Grant.donor_org_id == u.org_id,
                Application.created_at >= cutoff,
            ).count()
            scored = Application.query.join(Grant).filter(
                Grant.donor_org_id == u.org_id,
                Application.status == 'scored',
                Application.updated_at >= cutoff,
            ).count()
            decided = Application.query.join(Grant).filter(
                Grant.donor_org_id == u.org_id,
                Application.decision_recorded_at >= cutoff,
            ).count() if hasattr(Application, 'decision_recorded_at') else 0

            if received + scored + decided == 0:
                continue
            n = Notification(
                user_id=u.id,
                type='donor_weekly_digest',
                title='Weekly summary',
                message=(
                    f'Last 7 days: {received} received, {scored} scored, {decided} decided.'
                ),
                link='/dashboard',
            )
            db.session.add(n)
            sent += 1
        if sent > 0:
            db.session.commit()
        result = {'donors_scanned': len(donors), 'digests_sent': sent}
        _rcr('donor-digest',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception('donor digest cron failed: %s', e)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('donor-digest',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/admin-weekly-events', methods=['POST'])
def api_cron_admin_weekly_events():
    """Phase 359 — Weekly system-events summary for admin users.

    For each admin user: applications received this week, decisions
    recorded, declarations activated, AI cost. Honors the Phase 326
    digests opt-out.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import (
            User, Application, Notification, record_cron_run as _rcr,
        )
        from app.models.notification_preference import NotificationPreference
        from sqlalchemy import text as _text
        from datetime import datetime, timezone, timedelta
        now = datetime.now(timezone.utc)
        week_ago = now - timedelta(days=7)

        # System-wide counts (admins see everything).
        received = Application.query.filter(Application.created_at >= week_ago).count()
        decided = Application.query.filter(
            Application.decision_recorded_at.isnot(None),
            Application.decision_recorded_at >= week_ago,
        ).count() if hasattr(Application, 'decision_recorded_at') else 0
        try:
            ai_cost = db.session.execute(_text(
                "SELECT COALESCE(SUM(usd_cost), 0) FROM ai_call_logs WHERE created_at >= :c"
            ), {'c': week_ago}).scalar() or 0
            ai_cost = float(ai_cost)
        except Exception:
            ai_cost = 0.0

        admins = User.query.filter_by(role='admin').all()
        sent = 0
        for u in admins:
            channels = NotificationPreference.channels_for(user_id=u.id, category='digests')
            if not channels:
                continue
            parts = []
            if received:
                parts.append(f'{received} new submission{"s" if received != 1 else ""}')
            if decided:
                parts.append(f'{decided} decided')
            if ai_cost > 0:
                parts.append(f'${round(ai_cost, 2)} AI spend')
            if not parts:
                continue
            n = Notification(
                user_id=u.id,
                type='admin_weekly_events',
                title='Weekly system summary',
                message='; '.join(parts),
                link='/dashboard',
            )
            db.session.add(n)
            sent += 1
        if sent > 0:
            db.session.commit()
        result = {'admins_scanned': len(admins), 'summaries_sent': sent}
        _rcr('admin-weekly-events',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception('admin-weekly-events cron failed: %s', e)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('admin-weekly-events',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/donor-closing-grants', methods=['POST'])
def api_cron_donor_closing_grants():
    """Phase 352 — Notify donors about their own grants closing this week.

    For each donor user, count grants on their org with deadline within
    the next 7 days. If any, drop one in-app notification suggesting
    they share with prospective applicants. Skips users who've already
    been notified about the same closing window in the past 7 days.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import (
            User, Grant, Notification, record_cron_run as _rcr,
        )
        from app.models.notification_preference import NotificationPreference
        from datetime import datetime, timezone, timedelta
        now = datetime.now(timezone.utc)
        week_ahead = now + timedelta(days=7)
        dedupe_cutoff = now - timedelta(days=7)

        donors = User.query.filter_by(role='donor').all()
        sent = 0
        for u in donors:
            if not u.org_id:
                continue
            channels = NotificationPreference.channels_for(user_id=u.id, category='digests')
            if not channels:
                continue
            closing = (Grant.query
                       .filter(Grant.donor_org_id == u.org_id,
                               Grant.status == 'open',
                               Grant.deadline.isnot(None),
                               Grant.deadline >= now,
                               Grant.deadline <= week_ahead)
                       .count())
            if closing == 0:
                continue
            recent = (Notification.query
                      .filter(Notification.user_id == u.id,
                              Notification.type == 'donor_closing_grants',
                              Notification.created_at >= dedupe_cutoff)
                      .first())
            if recent:
                continue
            n = Notification(
                user_id=u.id,
                type='donor_closing_grants',
                title='Your grants closing soon',
                message=(
                    f'{closing} of your grants close this week. '
                    'Last chance to share with prospective applicants.'
                ),
                link='/grants?status=open',
            )
            db.session.add(n)
            sent += 1
        if sent > 0:
            db.session.commit()
        result = {'donors_scanned': len(donors), 'nudges_sent': sent}
        _rcr('donor-closing-grants',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception('donor-closing-grants cron failed: %s', e)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('donor-closing-grants',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/feature-usage-delta', methods=['POST'])
def api_cron_feature_usage_delta():
    """Phase 437 — Weekly digest to admins highlighting AI endpoints
    whose call count shifted most week-over-week. Top 3 by absolute
    delta, both up and down. Honors digests opt-out.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import (
            User, Notification, record_cron_run as _rcr,
        )
        from app.models.notification_preference import NotificationPreference
        from sqlalchemy import text as _text
        from datetime import datetime, timezone, timedelta

        now = datetime.now(timezone.utc)
        recent_start = now - timedelta(days=7)
        prior_start = now - timedelta(days=14)
        try:
            recent_rows = db.session.execute(_text(
                "SELECT endpoint, COUNT(*) AS n FROM ai_call_logs "
                "WHERE created_at >= :c GROUP BY endpoint"
            ), {'c': recent_start}).all()
            prior_rows = db.session.execute(_text(
                "SELECT endpoint, COUNT(*) AS n FROM ai_call_logs "
                "WHERE created_at >= :a AND created_at < :b GROUP BY endpoint"
            ), {'a': prior_start, 'b': recent_start}).all()
        except Exception:
            recent_rows = []
            prior_rows = []

        recent = {r.endpoint: int(r.n or 0) for r in recent_rows}
        prior = {r.endpoint: int(r.n or 0) for r in prior_rows}
        all_keys = set(recent) | set(prior)
        deltas = []
        for k in all_keys:
            r = recent.get(k, 0)
            p = prior.get(k, 0)
            deltas.append({'endpoint': k, 'recent': r, 'prior': p, 'delta': r - p})

        deltas.sort(key=lambda d: abs(d['delta']), reverse=True)
        top = [d for d in deltas if abs(d['delta']) > 0][:3]

        sent = 0
        if top:
            parts = []
            for d in top:
                sign = '+' if d['delta'] > 0 else ''
                parts.append(f'{d["endpoint"]} {sign}{d["delta"]} ({d["recent"]} this wk)')
            msg = 'AI usage shift: ' + ', '.join(parts)
            admins = User.query.filter_by(role='admin').all()
            for u in admins:
                channels = NotificationPreference.channels_for(user_id=u.id, category='digests')
                if not channels:
                    continue
                n = Notification(
                    user_id=u.id,
                    type='feature_usage_delta',
                    title='Weekly AI feature usage shifts',
                    message=msg[:500],
                    link='/admin/ai-quality',
                )
                db.session.add(n)
                sent += 1
            if sent > 0:
                db.session.commit()

        result = {
            'endpoints_tracked': len(all_keys),
            'top_deltas': len(top),
            'admins_notified': sent,
        }
        _rcr('feature-usage-delta',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result, 'top': top})
    except Exception as e:
        logger.exception('feature-usage-delta cron failed: %s', e)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('feature-usage-delta',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/ngo-watchlist-deadlines', methods=['POST'])
def api_cron_ngo_watchlist_deadlines():
    """Phase 431 — Weekly digest to each NGO user listing watchlisted
    grants whose deadline falls within the next 7 days. Honors the
    digests opt-out (Phase 326). Skips users with no upcoming
    deadlines.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import (
            Grant, User, Notification, record_cron_run as _rcr,
        )
        from app.models.watchlist import WatchlistItem
        from app.models.notification_preference import NotificationPreference
        from datetime import datetime, timezone, timedelta

        today = datetime.now(timezone.utc).date()
        end = today + timedelta(days=7)

        rows = (db.session.query(WatchlistItem.user_id, Grant.id, Grant.title, Grant.deadline)
                .join(Grant, db.and_(
                    Grant.id == WatchlistItem.target_id,
                    WatchlistItem.kind == 'grant',
                ))
                .filter(Grant.deadline.isnot(None),
                        Grant.deadline >= today,
                        Grant.deadline <= end,
                        Grant.status.in_(['open', 'review']))
                .all())
        from collections import defaultdict
        by_user = defaultdict(list)
        for user_id, grant_id, title, deadline in rows:
            by_user[user_id].append({'grant_id': grant_id, 'title': title, 'deadline': deadline})

        sent = 0
        for user_id, items in by_user.items():
            channels = NotificationPreference.channels_for(user_id=user_id, category='digests')
            if not channels:
                continue
            user = User.query.get(user_id)
            if not user or user.role != 'ngo':
                continue
            items.sort(key=lambda x: x['deadline'])
            top_titles = ', '.join(i['title'][:45] for i in items[:3])
            n = Notification(
                user_id=user_id,
                type='watchlist_deadlines_week',
                title=f'{len(items)} watched grant{"s" if len(items) != 1 else ""} closing this week',
                message=f'Closing in next 7 days: {top_titles}'[:500],
                link='/grants?watching=1',
            )
            db.session.add(n)
            sent += 1
        if sent > 0:
            db.session.commit()
        result = {
            'users_with_deadlines': len(by_user),
            'digests_sent': sent,
        }
        _rcr('ngo-watchlist-deadlines',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception('ngo-watchlist-deadlines cron failed: %s', e)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('ngo-watchlist-deadlines',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/ai-dismissed-digest', methods=['POST'])
def api_cron_ai_dismissed_digest():
    """Phase 425 — Weekly digest to admins ranking AI endpoints by
    number of 'dismissed' helpfulness markers over the last 7 days.
    Tracks AI suggestions users found unhelpful, so the team can
    target prompt tuning.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import (
            User, Notification, record_cron_run as _rcr,
        )
        from app.models.notification_preference import NotificationPreference
        from sqlalchemy import text as _text
        from datetime import datetime, timezone, timedelta

        cutoff = datetime.now(timezone.utc) - timedelta(days=7)
        try:
            rows = db.session.execute(_text(
                "SELECT endpoint, COUNT(*) AS dismissals "
                "FROM ai_call_logs WHERE created_at >= :c "
                "AND helpfulness = 'dismissed' "
                "GROUP BY endpoint ORDER BY dismissals DESC LIMIT 5"
            ), {'c': cutoff}).all()
        except Exception:
            rows = []
        top = []
        for r in rows:
            top.append({
                'endpoint': r.endpoint,
                'dismissals': int(r.dismissals or 0),
            })

        sent = 0
        if top and top[0]['dismissals'] > 0:
            parts = [f'{t["endpoint"]} ({t["dismissals"]})' for t in top[:3]]
            msg = 'AI dismissals last 7d: ' + ', '.join(parts)
            admins = User.query.filter_by(role='admin').all()
            for u in admins:
                channels = NotificationPreference.channels_for(user_id=u.id, category='digests')
                if not channels:
                    continue
                n = Notification(
                    user_id=u.id,
                    type='ai_dismissed_digest',
                    title='Top dismissed AI suggestions this week',
                    message=msg[:500],
                    link='/admin/ai-quality',
                )
                db.session.add(n)
                sent += 1
            if sent > 0:
                db.session.commit()

        result = {
            'endpoints_ranked': len(top),
            'admins_notified': sent,
        }
        _rcr('ai-dismissed-digest',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result, 'top': top})
    except Exception as e:
        logger.exception('ai-dismissed-digest cron failed: %s', e)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('ai-dismissed-digest',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/trust-profile-freshness', methods=['POST'])
def api_cron_trust_profile_freshness():
    """Phase 419 — Quarterly nudge: NGOs whose Organization.assess_date
    is more than 180 days old (or null) get a notification to refresh
    their trust profile. Distinct from Phase 310 (which targets
    incomplete profiles); this targets stale ones.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import (
            User, Organization, Notification, record_cron_run as _rcr,
        )
        from app.models.notification_preference import NotificationPreference
        from datetime import datetime, timezone, timedelta

        cutoff = datetime.now(timezone.utc) - timedelta(days=180)
        ngo_users = (User.query
                     .filter(User.role == 'ngo', User.org_id.isnot(None))
                     .all())
        sent = 0
        for u in ngo_users:
            channels = NotificationPreference.channels_for(user_id=u.id, category='digests')
            if not channels:
                continue
            org = Organization.query.get(u.org_id) if u.org_id else None
            if not org:
                continue
            assessed = org.assess_date
            if assessed and assessed >= cutoff:
                continue
            n = Notification(
                user_id=u.id,
                type='trust_profile_stale',
                title='Refresh your trust profile',
                message=(
                    'Your trust profile was last updated '
                    f'{("more than 180 days ago" if assessed else "a while ago")}. '
                    'Re-run the capacity assessment so donors see your current state.'
                )[:500],
                link='/trust',
            )
            db.session.add(n)
            sent += 1
        if sent > 0:
            db.session.commit()
        result = {
            'ngos_scanned': len(ngo_users),
            'digests_sent': sent,
        }
        _rcr('trust-profile-freshness',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception('trust-profile-freshness cron failed: %s', e)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('trust-profile-freshness',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/top-ai-cost-endpoints', methods=['POST'])
def api_cron_top_ai_cost_endpoints():
    """Phase 413 — Monthly digest to admins: top 5 AI endpoints by
    usd_cost over the last 30 days. Cost-optimization signal so the
    team can target the most expensive surfaces.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import (
            User, Notification, record_cron_run as _rcr,
        )
        from app.models.notification_preference import NotificationPreference
        from sqlalchemy import text as _text
        from datetime import datetime, timezone, timedelta

        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
        try:
            rows = db.session.execute(_text(
                "SELECT endpoint, COALESCE(SUM(usd_cost), 0) AS total_cost, COUNT(*) AS calls "
                "FROM ai_call_logs WHERE created_at >= :c "
                "GROUP BY endpoint ORDER BY total_cost DESC LIMIT 5"
            ), {'c': cutoff}).all()
        except Exception:
            rows = []
        top = []
        for r in rows:
            top.append({
                'endpoint': r.endpoint,
                'usd_cost': float(r.total_cost or 0),
                'calls': int(r.calls or 0),
            })

        sent = 0
        if top and top[0]['usd_cost'] > 0:
            parts = [f'{t["endpoint"]} ${round(t["usd_cost"], 2)}' for t in top[:3]]
            msg = 'Top AI cost (30d): ' + ', '.join(parts)
            admins = User.query.filter_by(role='admin').all()
            for u in admins:
                channels = NotificationPreference.channels_for(user_id=u.id, category='digests')
                if not channels:
                    continue
                n = Notification(
                    user_id=u.id,
                    type='top_ai_cost_endpoints',
                    title='Monthly AI cost driver report',
                    message=msg[:500],
                    link='/admin/ai-cost',
                )
                db.session.add(n)
                sent += 1
            if sent > 0:
                db.session.commit()

        result = {
            'endpoints_ranked': len(top),
            'admins_notified': sent,
        }
        _rcr('top-ai-cost-endpoints',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result, 'top': top})
    except Exception as e:
        logger.exception('top-ai-cost-endpoints cron failed: %s', e)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('top-ai-cost-endpoints',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/ngo-sector-grants-digest', methods=['POST'])
def api_cron_ngo_sector_grants_digest():
    """Phase 407 — Weekly digest to each NGO listing newly-published
    grants whose sectors overlap with the NGO's org.sectors.
    Honors the digests opt-out (Phase 326). Skips NGOs with no
    sectors set on their org.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import (
            Grant, User, Organization, Notification,
            record_cron_run as _rcr,
        )
        from app.models.notification_preference import NotificationPreference
        from datetime import datetime, timezone, timedelta

        week_ago = datetime.now(timezone.utc) - timedelta(days=7)
        new_grants = (Grant.query
                      .filter(Grant.status == 'open',
                              Grant.published_at.isnot(None),
                              Grant.published_at >= week_ago)
                      .all())
        if not new_grants:
            result = {'new_grants': 0, 'digests_sent': 0}
            _rcr('ngo-sector-grants-digest',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=True, summary=str(result)[:480])
            return jsonify({'success': True, 'result': result})

        ngo_users = (User.query
                     .filter(User.role == 'ngo',
                             User.org_id.isnot(None))
                     .all())
        sent = 0
        for u in ngo_users:
            channels = NotificationPreference.channels_for(user_id=u.id, category='digests')
            if not channels:
                continue
            org = Organization.query.get(u.org_id) if u.org_id else None
            if not org:
                continue
            org_sectors = set((s or '').strip().lower()
                              for s in (org.get_sectors() if hasattr(org, 'get_sectors') else [])
                              if s)
            if not org_sectors:
                continue
            matches = []
            for g in new_grants:
                grant_sectors = set((s or '').strip().lower()
                                    for s in (g.get_sectors() if hasattr(g, 'get_sectors') else [])
                                    if s)
                if grant_sectors & org_sectors:
                    matches.append(g)
            if not matches:
                continue
            titles = ', '.join(g.title[:50] for g in matches[:3])
            msg = f'{len(matches)} new grant{"s" if len(matches) != 1 else ""} in your sectors: {titles}'
            n = Notification(
                user_id=u.id,
                type='ngo_sector_grants',
                title='New grants matching your sectors',
                message=msg[:500],
                link='/grants',
            )
            db.session.add(n)
            sent += 1
        if sent > 0:
            db.session.commit()

        result = {
            'new_grants': len(new_grants),
            'ngos_scanned': len(ngo_users),
            'digests_sent': sent,
        }
        _rcr('ngo-sector-grants-digest',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception('ngo-sector-grants-digest cron failed: %s', e)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('ngo-sector-grants-digest',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/donor-decisions-backlog', methods=['POST'])
def api_cron_donor_decisions_backlog():
    """Phase 401 — Weekly digest to each donor org's users summarising
    applications stuck in submitted/under_review/scored for more than
    14 days. Pressure-relief nudge that honors the digests opt-out.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import (
            Application, Grant, User, Notification, record_cron_run as _rcr,
        )
        from app.models.notification_preference import NotificationPreference
        from datetime import datetime, timezone, timedelta
        from collections import defaultdict

        cutoff = datetime.now(timezone.utc) - timedelta(days=14)
        PENDING = ['submitted', 'under_review', 'scored', 'revision_requested']

        rows = (db.session.query(Grant.donor_org_id, Application.id)
                .join(Application, Application.grant_id == Grant.id)
                .filter(Application.status.in_(PENDING),
                        Application.submitted_at.isnot(None),
                        Application.submitted_at < cutoff)
                .all())
        backlog_by_donor = defaultdict(int)
        for donor_org_id, _ in rows:
            if donor_org_id is None:
                continue
            backlog_by_donor[donor_org_id] += 1

        sent = 0
        for donor_org_id, count in backlog_by_donor.items():
            if count < 3:
                continue
            donor_users = User.query.filter_by(role='donor', org_id=donor_org_id).all()
            for u in donor_users:
                channels = NotificationPreference.channels_for(user_id=u.id, category='digests')
                if not channels:
                    continue
                n = Notification(
                    user_id=u.id,
                    type='donor_backlog_digest',
                    title=f'{count} applications waiting >14d for decision',
                    message=f'You have {count} pending applications older than 14 days. Consider reviewing or assigning reviewers.',
                    link='/applications',
                )
                db.session.add(n)
                sent += 1
        if sent > 0:
            db.session.commit()

        result = {
            'donors_with_backlog': len(backlog_by_donor),
            'digests_sent': sent,
        }
        _rcr('donor-decisions-backlog',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception('donor-decisions-backlog cron failed: %s', e)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('donor-decisions-backlog',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/grants-zero-applications', methods=['POST'])
def api_cron_grants_zero_applications():
    """Phase 395 — Notify donors whose published grants have been open
    for 14+ days with 0 applications received. Each donor gets one
    notification per grant (one-shot via audit-chain marker).
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import (
            Grant, Application, User, Notification, record_cron_run as _rcr,
        )
        from app.models.audit_chain import AuditChainEntry
        from app.models.notification_preference import NotificationPreference
        from datetime import datetime, timezone, timedelta

        cutoff = datetime.now(timezone.utc) - timedelta(days=14)
        candidates = (Grant.query
                      .filter(Grant.status.in_(['open', 'review']),
                              Grant.published_at.isnot(None),
                              Grant.published_at <= cutoff)
                      .all())
        nudged = 0
        for g in candidates:
            apps = Application.query.filter_by(grant_id=g.id).count()
            if apps > 0:
                continue
            already = AuditChainEntry.query.filter_by(
                action='grant.zero_apps_nudged',
                subject_kind='grant',
                subject_id=g.id,
            ).first()
            if already:
                continue
            donor_users = User.query.filter_by(role='donor', org_id=g.donor_org_id).all()
            for u in donor_users:
                channels = NotificationPreference.channels_for(user_id=u.id, category='digests')
                if not channels:
                    continue
                n = Notification(
                    user_id=u.id,
                    type='grant_zero_apps',
                    title=f'Grant "{g.title[:60]}" has no applications yet',
                    message='This grant has been open 14+ days without any applications. Consider reviewing the eligibility, deadline, or visibility.',
                    link=f'/grants/{g.id}',
                )
                db.session.add(n)
            AuditChainEntry.append(
                action='grant.zero_apps_nudged',
                actor_email='system@cron',
                subject_kind='grant',
                subject_id=g.id,
                details={'donor_org_id': g.donor_org_id,
                         'donors_notified': len(donor_users)},
            )
            nudged += 1
        if nudged > 0:
            db.session.commit()
        result = {
            'candidates_scanned': len(candidates),
            'grants_nudged': nudged,
        }
        _rcr('grants-zero-applications',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception('grants-zero-applications cron failed: %s', e)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('grants-zero-applications',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/ai-quality-drift', methods=['POST'])
def api_cron_ai_quality_drift():
    """Phase 389 — Daily AI-quality drift detector. For each donor,
    compute today's median AI score across submitted applications and
    compare against the median over the trailing 7 days. Notify
    admins when any donor's median shifts by more than 10 points.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import (
            Application, Grant, User, Notification, Organization,
            record_cron_run as _rcr,
        )
        from app.models.notification_preference import NotificationPreference
        from datetime import datetime, timezone, timedelta
        from collections import defaultdict

        now = datetime.now(timezone.utc)
        today_start = now - timedelta(days=1)
        baseline_start = now - timedelta(days=8)

        rows = (db.session.query(
                    Grant.donor_org_id,
                    Application.ai_score,
                    Application.submitted_at,
                )
                .join(Application, Application.grant_id == Grant.id)
                .filter(Application.submitted_at >= baseline_start,
                        Application.ai_score.isnot(None))
                .all())
        today_by_donor = defaultdict(list)
        baseline_by_donor = defaultdict(list)
        for donor_org_id, ai_score, submitted in rows:
            if donor_org_id is None or ai_score is None or not submitted:
                continue
            if submitted >= today_start:
                today_by_donor[donor_org_id].append(float(ai_score))
            else:
                baseline_by_donor[donor_org_id].append(float(ai_score))

        def _median(xs):
            if not xs:
                return None
            s = sorted(xs)
            n = len(s)
            return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2.0

        drifts = []
        for donor_org_id, today_scores in today_by_donor.items():
            if len(today_scores) < 3:
                continue
            baseline = baseline_by_donor.get(donor_org_id, [])
            if len(baseline) < 5:
                continue
            today_median = _median(today_scores)
            baseline_median = _median(baseline)
            if today_median is None or baseline_median is None:
                continue
            delta = today_median - baseline_median
            if abs(delta) >= 10:
                drifts.append({
                    'donor_org_id': donor_org_id,
                    'today_median': round(today_median, 1),
                    'baseline_median': round(baseline_median, 1),
                    'delta': round(delta, 1),
                })

        sent = 0
        if drifts:
            org_ids = [d['donor_org_id'] for d in drifts]
            orgs_by_id = {o.id: o for o in Organization.query.filter(Organization.id.in_(org_ids)).all()}
            parts = []
            for d in drifts[:5]:
                org = orgs_by_id.get(d['donor_org_id'])
                org_label = org.name if org else f'Org #{d["donor_org_id"]}'
                sign = '+' if d['delta'] > 0 else ''
                parts.append(f'{org_label} {sign}{d["delta"]}pp')
            msg = 'AI score drift: ' + ', '.join(parts)
            admins = User.query.filter_by(role='admin').all()
            for u in admins:
                channels = NotificationPreference.channels_for(user_id=u.id, category='digests')
                if not channels:
                    continue
                n = Notification(
                    user_id=u.id,
                    type='ai_quality_drift',
                    title='AI score drift detected',
                    message=msg[:500],
                    link='/admin/ai-quality',
                )
                db.session.add(n)
                sent += 1
            if sent > 0:
                db.session.commit()

        result = {
            'donors_scanned': len(today_by_donor),
            'drifts_detected': len(drifts),
            'admins_notified': sent,
        }
        _rcr('ai-quality-drift',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result, 'drifts': drifts[:10]})
    except Exception as e:
        logger.exception('ai-quality-drift cron failed: %s', e)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('ai-quality-drift',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/webhook-deliveries-health', methods=['POST'])
def api_cron_webhook_deliveries_health():
    """Phase 383 — Daily webhook-delivery-health summary. For each
    organisation with active webhooks, compute success rate over the
    last 24h. Notify admins when any org drops below 90% with >=10
    attempts (filters out noise from tiny sample sizes).
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import (
            Webhook, WebhookDelivery, User, Notification, Organization,
            record_cron_run as _rcr,
        )
        from app.models.notification_preference import NotificationPreference
        from datetime import datetime, timezone, timedelta
        from collections import defaultdict

        cutoff = datetime.now(timezone.utc) - timedelta(days=1)
        rows = (db.session.query(Webhook.org_id, WebhookDelivery.status_code)
                .join(Webhook, Webhook.id == WebhookDelivery.webhook_id)
                .filter(WebhookDelivery.delivered_at >= cutoff)
                .all())
        total_by_org = defaultdict(int)
        success_by_org = defaultdict(int)
        for org_id, status in rows:
            if org_id is None:
                continue
            total_by_org[org_id] += 1
            if status is not None and 200 <= int(status) < 300:
                success_by_org[org_id] += 1

        low_health = []
        for org_id, total in total_by_org.items():
            if total < 10:
                continue
            ok = success_by_org.get(org_id, 0)
            rate = 100 * ok / total
            if rate < 90:
                low_health.append({
                    'org_id': org_id,
                    'total': total,
                    'success': ok,
                    'success_pct': round(rate, 1),
                })

        sent = 0
        if low_health:
            org_ids = [d['org_id'] for d in low_health]
            orgs_by_id = {o.id: o for o in Organization.query.filter(Organization.id.in_(org_ids)).all()}
            summary_parts = []
            for d in low_health[:5]:
                org = orgs_by_id.get(d['org_id'])
                org_id = d['org_id']
                pct = d['success_pct']
                org_label = org.name if org else f'Org #{org_id}'
                summary_parts.append(f'{org_label}: {pct}%')
            msg = 'Webhook health <90% (24h): ' + ', '.join(summary_parts)
            admins = User.query.filter_by(role='admin').all()
            for u in admins:
                channels = NotificationPreference.channels_for(user_id=u.id, category='digests')
                if not channels:
                    continue
                n = Notification(
                    user_id=u.id,
                    type='webhook_health_warning',
                    title='Webhook delivery health degraded',
                    message=msg[:500],
                    link='/settings/webhooks',
                )
                db.session.add(n)
                sent += 1
            if sent > 0:
                db.session.commit()

        result = {
            'orgs_scanned': len(total_by_org),
            'orgs_with_low_health': len(low_health),
            'admins_notified': sent,
        }
        _rcr('webhook-deliveries-health',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result, 'low_health': low_health[:10]})
    except Exception as e:
        logger.exception('webhook-deliveries-health cron failed: %s', e)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('webhook-deliveries-health',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/expired-grants-auto-close', methods=['POST'])
def api_cron_expired_grants_auto_close():
    """Phase 377 — Auto-close grants whose deadline passed more than
    30 days ago, status is still 'open' or 'review', and no in-flight
    applications remain (none in submitted/under_review/scored). Sets
    status='closed' and appends an audit-chain entry per closure.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import (
            Grant, Application, record_cron_run as _rcr,
        )
        from app.models.audit_chain import AuditChainEntry
        from datetime import datetime, timezone, timedelta, date

        cutoff_date = (datetime.now(timezone.utc) - timedelta(days=30)).date()
        IN_FLIGHT = ['submitted', 'under_review', 'scored', 'revision_requested']

        candidates = (Grant.query
                      .filter(Grant.status.in_(['open', 'review']),
                              Grant.deadline.isnot(None),
                              Grant.deadline < cutoff_date)
                      .all())
        closed_ids = []
        for g in candidates:
            in_flight = Application.query.filter(
                Application.grant_id == g.id,
                Application.status.in_(IN_FLIGHT),
            ).count()
            if in_flight > 0:
                continue
            g.status = 'closed'
            db.session.add(g)
            AuditChainEntry.append(
                action='grant.auto_closed',
                actor_email='system@cron',
                subject_kind='grant',
                subject_id=g.id,
                details={'reason': 'deadline_expired_30d',
                         'deadline': g.deadline.isoformat() if g.deadline else None},
            )
            closed_ids.append(g.id)
        if closed_ids:
            db.session.commit()
        result = {
            'candidates_scanned': len(candidates),
            'auto_closed': len(closed_ids),
            'closed_ids_sample': closed_ids[:10],
        }
        _rcr('expired-grants-auto-close',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception('expired-grants-auto-close cron failed: %s', e)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('expired-grants-auto-close',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/ngo-peer-comparison-digest', methods=['POST'])
def api_cron_ngo_peer_comparison_digest():
    """Phase 371 — Weekly per-NGO digest comparing their submitted-app
    count and decisions over the trailing 7 days against the sector
    median. Honors the digests opt-out (Phase 326). NGOs without an
    activity signal this week are skipped.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import (
            User, Application, Organization, Notification,
            record_cron_run as _rcr,
        )
        from app.models.notification_preference import NotificationPreference
        from datetime import datetime, timezone, timedelta
        from collections import defaultdict

        week_ago = datetime.now(timezone.utc) - timedelta(days=7)
        DECIDED = ['funded', 'awarded', 'declined', 'rejected']

        submitted_rows = (Application.query
                          .filter(Application.submitted_at.isnot(None),
                                  Application.submitted_at >= week_ago)
                          .with_entities(Application.ngo_org_id)
                          .all())
        decided_rows = (Application.query
                        .filter(Application.status.in_(DECIDED),
                                Application.decision_recorded_at.isnot(None),
                                Application.decision_recorded_at >= week_ago)
                        .with_entities(Application.ngo_org_id)
                        .all())
        submitted_by_org = defaultdict(int)
        for (org_id,) in submitted_rows:
            if org_id:
                submitted_by_org[org_id] += 1
        decided_by_org = defaultdict(int)
        for (org_id,) in decided_rows:
            if org_id:
                decided_by_org[org_id] += 1

        active_org_ids = set(submitted_by_org) | set(decided_by_org)
        if not active_org_ids:
            result = {'orgs_active': 0, 'digests_sent': 0}
            _rcr('ngo-peer-comparison-digest',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=True, summary=str(result)[:480])
            return jsonify({'success': True, 'result': result})

        def _median(xs):
            if not xs:
                return 0
            s = sorted(xs)
            n = len(s)
            return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2.0

        submitted_median = _median([submitted_by_org[o] for o in active_org_ids])
        decided_median = _median([decided_by_org[o] for o in active_org_ids])

        ngo_users = (User.query
                     .filter(User.role == 'ngo',
                             User.org_id.in_(list(active_org_ids)))
                     .all())
        sent = 0
        for u in ngo_users:
            channels = NotificationPreference.channels_for(user_id=u.id, category='digests')
            if not channels:
                continue
            s = submitted_by_org.get(u.org_id, 0)
            d = decided_by_org.get(u.org_id, 0)
            parts = []
            if s:
                rel = 'above' if s > submitted_median else 'at' if s == submitted_median else 'below'
                parts.append(f'{s} submitted ({rel} sector median {submitted_median:g})')
            if d:
                rel = 'above' if d > decided_median else 'at' if d == decided_median else 'below'
                parts.append(f'{d} decided ({rel} sector median {decided_median:g})')
            if not parts:
                continue
            n = Notification(
                user_id=u.id,
                type='ngo_peer_comparison',
                title='How you compared this week',
                message='; '.join(parts)[:500],
                link='/dashboard',
            )
            db.session.add(n)
            sent += 1
        if sent > 0:
            db.session.commit()
        result = {
            'orgs_active': len(active_org_ids),
            'digests_sent': sent,
            'submitted_median': submitted_median,
            'decided_median': decided_median,
        }
        _rcr('ngo-peer-comparison-digest',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception('ngo-peer-comparison-digest cron failed: %s', e)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('ngo-peer-comparison-digest',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/monthly-reviewer-leaderboard', methods=['POST'])
def api_cron_monthly_reviewer_leaderboard():
    """Phase 365 — Monthly reviewer leaderboard for admins.

    Computes each reviewer's completed-review count + median turnaround
    days over the trailing 30 days, ranks by completion count (median as
    tiebreak), and notifies admins with the top 5. Honors the digests
    opt-out.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import (
            User, Review, Notification, record_cron_run as _rcr,
        )
        from app.models.notification_preference import NotificationPreference
        from datetime import datetime, timezone, timedelta
        from collections import defaultdict

        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
        rows = (Review.query
                .filter(Review.status.in_(['submitted', 'scored', 'completed']),
                        Review.completed_at.isnot(None),
                        Review.completed_at >= cutoff)
                .with_entities(Review.reviewer_user_id, Review.created_at, Review.completed_at)
                .all())
        by_reviewer = defaultdict(list)
        for rid, created, completed in rows:
            if not created or not completed:
                continue
            d = (completed - created).total_seconds() / 86400.0
            if d >= 0:
                by_reviewer[rid].append(d)

        def _median(xs):
            s = sorted(xs)
            n = len(s)
            return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2.0

        rankings = []
        if by_reviewer:
            reviewer_ids = list(by_reviewer.keys())
            users_by_id = {u.id: u for u in User.query.filter(User.id.in_(reviewer_ids)).all()}
            for rid, days in by_reviewer.items():
                u = users_by_id.get(rid)
                rankings.append({
                    'reviewer_user_id': rid,
                    'name': (u.name or u.email) if u else f'User #{rid}',
                    'completed': len(days),
                    'median_days': round(_median(days), 1),
                })
            rankings.sort(key=lambda r: (-r['completed'], r['median_days']))
            rankings = rankings[:5]

        admins = User.query.filter_by(role='admin').all()
        sent = 0
        if rankings:
            top_line = ', '.join(f'{r["name"]} ({r["completed"]})' for r in rankings[:3])
            msg = f'Top reviewers (30d): {top_line}'[:500]
            for u in admins:
                channels = NotificationPreference.channels_for(user_id=u.id, category='digests')
                if not channels:
                    continue
                n = Notification(
                    user_id=u.id,
                    type='reviewer_leaderboard',
                    title='Monthly reviewer leaderboard',
                    message=msg,
                    link='/admin/reviewers-workload',
                )
                db.session.add(n)
                sent += 1
            if sent > 0:
                db.session.commit()

        result = {
            'reviewers_ranked': len(rankings),
            'admins_notified': sent,
        }
        _rcr('monthly-reviewer-leaderboard',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result, 'leaderboard': rankings})
    except Exception as e:
        logger.exception('monthly-reviewer-leaderboard cron failed: %s', e)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('monthly-reviewer-leaderboard',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/notifications-cleanup', methods=['POST'])
def api_cron_notifications_cleanup():
    """Phase 343 — Delete stale notifications.

    Two rules:
      - read notifications older than 90 days → delete
      - any notification older than 180 days → delete (read or not)
    Keeps the notifications table from growing forever.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import Notification, record_cron_run as _rcr
        from datetime import datetime, timezone, timedelta
        now = datetime.now(timezone.utc)
        cutoff_read = now - timedelta(days=90)
        cutoff_all = now - timedelta(days=180)

        # Delete in two passes for clarity.
        deleted_read = (Notification.query
                        .filter(Notification.read.is_(True),
                                Notification.created_at < cutoff_read)
                        .delete(synchronize_session=False))
        deleted_old = (Notification.query
                       .filter(Notification.created_at < cutoff_all)
                       .delete(synchronize_session=False))
        db.session.commit()
        result = {
            'deleted_read_90d': int(deleted_read or 0),
            'deleted_any_180d': int(deleted_old or 0),
        }
        _rcr('notifications-cleanup',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception('notifications-cleanup cron failed: %s', e)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('notifications-cleanup',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/stale-draft-nudge', methods=['POST'])
def api_cron_stale_draft_nudge():
    """Phase 341 — Nudge NGOs about draft applications idle > 7 days.

    For each draft application not edited in the last 7 days, drop one
    in-app notification on the org's NGO users. Honors the Phase 326
    `digests` opt-out so users who silenced summaries don't get nudged.
    Skips duplicates within the last 14 days per (user, application).
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import (
            User, Application, Notification, record_cron_run as _rcr,
        )
        from app.models.notification_preference import NotificationPreference
        from datetime import datetime, timezone, timedelta
        now = datetime.now(timezone.utc)
        week_ago = now - timedelta(days=7)
        nudge_cutoff = now - timedelta(days=14)

        drafts = (Application.query
                  .filter(Application.status == 'draft',
                          Application.updated_at < week_ago)
                  .all())
        sent = 0
        for a in drafts:
            ngos = User.query.filter_by(org_id=a.ngo_org_id, role='ngo').all()
            for u in ngos:
                channels = NotificationPreference.channels_for(user_id=u.id, category='digests')
                if not channels:
                    continue
                # Skip if we've already nudged this user about this app recently.
                already = (Notification.query
                           .filter(Notification.user_id == u.id,
                                   Notification.type == 'stale_draft_nudge',
                                   Notification.link == f'/applications/{a.id}',
                                   Notification.created_at >= nudge_cutoff)
                           .first())
                if already:
                    continue
                title = a.grant.title if a.grant else f'Application #{a.id}'
                n = Notification(
                    user_id=u.id,
                    type='stale_draft_nudge',
                    title='Draft application going stale',
                    message=f'Your draft for "{title}" has been idle for over a week.',
                    link=f'/applications/{a.id}',
                )
                db.session.add(n)
                sent += 1
        if sent > 0:
            db.session.commit()
        result = {'drafts_checked': len(drafts), 'nudges_sent': sent}
        _rcr('stale-draft-nudge',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception('stale-draft-nudge cron failed: %s', e)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('stale-draft-nudge',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/weekly-kpi-snapshot', methods=['POST'])
def api_cron_weekly_kpi_snapshot():
    """Phase 334 — Snapshot system KPIs for the week just ended.

    Writes one row into kpi_snapshots keyed by week_starting (Monday).
    Idempotent — re-running for the same week updates that row.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import (
            Application, KpiSnapshot, record_cron_run as _rcr,
        )
        from sqlalchemy import text as _text
        from datetime import datetime, timezone, timedelta, date as _date

        now = datetime.now(timezone.utc)
        # Monday of THIS week as the bucket key.
        monday = (now - timedelta(days=now.weekday())).date()
        last_monday = monday - timedelta(days=7)
        next_monday = monday  # exclusive upper bound for last week

        # Counts over [last_monday, monday).
        received = Application.query.filter(
            Application.created_at >= datetime.combine(last_monday, datetime.min.time()).replace(tzinfo=timezone.utc),
            Application.created_at < datetime.combine(next_monday, datetime.min.time()).replace(tzinfo=timezone.utc),
        ).count()
        decided_apps = Application.query.filter(
            Application.decision_recorded_at >= datetime.combine(last_monday, datetime.min.time()).replace(tzinfo=timezone.utc),
            Application.decision_recorded_at < datetime.combine(next_monday, datetime.min.time()).replace(tzinfo=timezone.utc),
        ).all() if hasattr(Application, 'decision_recorded_at') else []
        decided = len(decided_apps)
        days = []
        for a in decided_apps:
            if a.submitted_at and a.decision_recorded_at:
                d = (a.decision_recorded_at - a.submitted_at).total_seconds() / 86400.0
                if d >= 0:
                    days.append(d)
        avg_days = round(sum(days) / len(days), 1) if days else None

        try:
            ai_cost = db.session.execute(_text(
                "SELECT COALESCE(SUM(usd_cost), 0) FROM ai_call_logs WHERE created_at >= :a AND created_at < :b"
            ), {'a': last_monday, 'b': next_monday}).scalar() or 0
            ai_cost = float(ai_cost)
        except Exception:
            ai_cost = 0.0

        existing = KpiSnapshot.query.filter_by(week_starting=last_monday).first()
        if existing:
            existing.applications_received = received
            existing.applications_decided = decided
            existing.avg_decision_days = avg_days
            existing.ai_cost_usd = ai_cost
        else:
            row = KpiSnapshot(
                week_starting=last_monday,
                applications_received=received,
                applications_decided=decided,
                avg_decision_days=avg_days,
                ai_cost_usd=ai_cost,
            )
            db.session.add(row)
        db.session.commit()
        result = {
            'week_starting': last_monday.isoformat(),
            'applications_received': received,
            'applications_decided': decided,
            'avg_decision_days': avg_days,
            'ai_cost_usd': round(ai_cost, 2),
        }
        _rcr('weekly-kpi-snapshot',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception('weekly-kpi-snapshot cron failed: %s', e)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('weekly-kpi-snapshot',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/donor-portfolio-recap', methods=['POST'])
def api_cron_donor_portfolio_recap():
    """Phase 329 — Weekly portfolio recap per donor user.

    For each donor user: count of open grants, applications received in
    the last 7 days, decisions recorded in the last 7 days, pending
    appeals on their grants. Skip users with zero activity. Honors the
    Phase 326 'digests' opt-out.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import (
            User, Application, Grant, Notification, record_cron_run as _rcr,
        )
        from app.models.notification_preference import NotificationPreference
        from datetime import datetime, timezone, timedelta
        now = datetime.now(timezone.utc)
        week_ago = now - timedelta(days=7)

        donors = User.query.filter_by(role='donor').all()
        sent = 0
        for u in donors:
            if not u.org_id:
                continue
            channels = NotificationPreference.channels_for(user_id=u.id, category='digests')
            if not channels:
                continue
            open_grants = Grant.query.filter_by(
                donor_org_id=u.org_id, status='open'
            ).count()
            received = Application.query.join(Grant).filter(
                Grant.donor_org_id == u.org_id,
                Application.created_at >= week_ago,
            ).count()
            decided = Application.query.join(Grant).filter(
                Grant.donor_org_id == u.org_id,
                Application.decision_recorded_at >= week_ago,
            ).count() if hasattr(Application, 'decision_recorded_at') else 0
            pending_appeals = Application.query.join(Grant).filter(
                Grant.donor_org_id == u.org_id,
                Application.appeal_requested_at.isnot(None),
                Application.appeal_resolved_at.is_(None),
            ).count() if hasattr(Application, 'appeal_requested_at') else 0
            if open_grants + received + decided + pending_appeals == 0:
                continue
            parts = []
            if open_grants:
                parts.append(f'{open_grants} open grant{"" if open_grants == 1 else "s"}')
            if received:
                parts.append(f'{received} new submission{"" if received == 1 else "s"}')
            if decided:
                parts.append(f'{decided} decision{"" if decided == 1 else "s"} recorded')
            if pending_appeals:
                parts.append(f'{pending_appeals} appeal{"" if pending_appeals == 1 else "s"} awaiting')
            n = Notification(
                user_id=u.id,
                type='donor_portfolio_recap',
                title='Weekly portfolio recap',
                message='; '.join(parts),
                link='/dashboard',
            )
            db.session.add(n)
            sent += 1
        if sent > 0:
            db.session.commit()
        result = {'donors_scanned': len(donors), 'recaps_sent': sent}
        _rcr('donor-portfolio-recap',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception('donor-portfolio-recap cron failed: %s', e)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('donor-portfolio-recap',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/trust-profile-nudge', methods=['POST'])
def api_cron_trust_profile_nudge():
    """Phase 310 — Monthly nudge for NGO orgs without a published Capacity Passport.

    For each NGO user whose org has no active CapacityPassport AND who
    has not been nudged in the last 30 days, drop a friendly inbox
    notification reminding them to publish to strengthen future
    applications.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import (
            User, Notification, record_cron_run as _rcr,
        )
        from app.models.capacity_passport import CapacityPassport
        from datetime import datetime, timezone, timedelta
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(days=30)

        ngos = User.query.filter_by(role='ngo').all()
        sent = 0
        for u in ngos:
            if not u.org_id:
                continue
            # Skip orgs that already have an active passport.
            active = (CapacityPassport.query
                      .filter(CapacityPassport.org_id == u.org_id,
                              CapacityPassport.status == 'active')
                      .first())
            if active is not None:
                continue
            # Skip users we've nudged in the last 30 days.
            recent = (Notification.query
                      .filter(Notification.user_id == u.id,
                              Notification.type == 'trust_profile_nudge',
                              Notification.created_at >= cutoff)
                      .first())
            if recent is not None:
                continue
            n = Notification(
                user_id=u.id,
                type='trust_profile_nudge',
                title='Publish a Trust Profile',
                message=(
                    'Donors give stronger weight to applications backed by a '
                    'published Capacity Passport. Take 10 minutes to publish '
                    'one — it strengthens every future submission.'
                ),
                link='/trust',
            )
            db.session.add(n)
            sent += 1
        if sent > 0:
            db.session.commit()
        result = {'ngos_scanned': len(ngos), 'nudges_sent': sent}
        _rcr('trust-profile-nudge',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception('trust-profile-nudge cron failed: %s', e)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('trust-profile-nudge',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/ngo-pipeline-digest', methods=['POST'])
def api_cron_ngo_pipeline_digest():
    """Phase 304 — Weekly digest for each NGO user.

    For every ngo user: deadlines this week, applications under review,
    decisions in the last 7 days. Skips users with zero activity.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import (
            User, Application, Grant, Notification, record_cron_run as _rcr,
        )
        from datetime import datetime, timezone, timedelta

        now = datetime.now(timezone.utc)
        week_ago = now - timedelta(days=7)
        week_ahead = now + timedelta(days=7)

        from app.models.notification_preference import NotificationPreference
        ngos = User.query.filter_by(role='ngo').all()
        sent = 0
        for u in ngos:
            if not u.org_id:
                continue
            # Phase 326 — skip users who've opted out of digests entirely.
            channels = NotificationPreference.channels_for(user_id=u.id, category='digests')
            if not channels:
                continue
            # Active in-flight apps
            under_review = Application.query.filter(
                Application.ngo_org_id == u.org_id,
                Application.status.in_(['submitted', 'under_review', 'scored']),
            ).count()
            # Decisions in last 7 days
            decided = Application.query.filter(
                Application.ngo_org_id == u.org_id,
                Application.decision_recorded_at >= week_ago,
            ).count() if hasattr(Application, 'decision_recorded_at') else 0
            # Open grants closing in next 7 days the NGO hasn't applied to
            grants_closing = (Grant.query
                              .filter(Grant.status == 'open',
                                      Grant.deadline.isnot(None),
                                      Grant.deadline >= now,
                                      Grant.deadline <= week_ahead)
                              .count())
            if under_review + decided + grants_closing == 0:
                continue
            parts = []
            if under_review:
                parts.append(f'{under_review} under review')
            if decided:
                parts.append(f'{decided} decided in the past week')
            if grants_closing:
                parts.append(f'{grants_closing} grant{"" if grants_closing == 1 else "s"} closing soon')
            n = Notification(
                user_id=u.id,
                type='ngo_pipeline_digest',
                title='Weekly pipeline',
                message='; '.join(parts),
                link='/dashboard',
            )
            db.session.add(n)
            sent += 1
        if sent > 0:
            db.session.commit()
        result = {'ngos_scanned': len(ngos), 'digests_sent': sent}
        _rcr('ngo-pipeline-digest',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception('ngo-pipeline-digest cron failed: %s', e)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('ngo-pipeline-digest',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/donor-followup-nudge', methods=['POST'])
def api_cron_donor_followup_nudge():
    """Phase 287 — Nudge donors to follow up personally on stale declines.

    For declined applications older than 14 days where the applicant has
    NOT viewed the recorded feedback (applicant_viewed_feedback_at IS
    NULL), drop one in-app notification per donor user with that grant
    so they can reach out. Cap at the 10 most recent per donor to keep
    the inbox calm.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import (
            User, Application, Grant, Notification, record_cron_run as _rcr,
        )
        from datetime import datetime, timezone, timedelta
        cutoff = datetime.now(timezone.utc) - timedelta(days=14)

        # Find declined + unviewed apps decided MORE THAN 14 days ago.
        stale_apps = (Application.query
                      .join(Grant)
                      .filter(Application.status.in_(['declined', 'rejected']),
                              Application.decision_recorded_at.isnot(None),
                              Application.decision_recorded_at <= cutoff,
                              Application.applicant_viewed_feedback_at.is_(None))
                      .order_by(Application.decision_recorded_at.desc())
                      .all())
        if not stale_apps:
            _rcr('donor-followup-nudge',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=True, summary='0 stale unviewed declines')
            return jsonify({'success': True, 'result': {'stale': 0, 'nudges_sent': 0}})

        # Group by donor_org_id (grant.donor_org_id).
        by_donor_org: dict[int, list[Application]] = {}
        for a in stale_apps:
            if not a.grant:
                continue
            by_donor_org.setdefault(a.grant.donor_org_id, []).append(a)

        sent = 0
        for org_id, apps in by_donor_org.items():
            donors = User.query.filter_by(org_id=org_id, role='donor').all()
            if not donors:
                continue
            top = apps[:10]
            msg = (
                f'{len(top)} declined application{"s" if len(top) != 1 else ""} from the last few weeks '
                'have not been read by the applicant. Consider reaching out personally.'
            )
            for u in donors:
                n = Notification(
                    user_id=u.id,
                    type='donor_followup_nudge',
                    title='Stale decline — applicant has not read feedback',
                    message=msg,
                    link='/applications?status=declined',
                )
                db.session.add(n)
                sent += 1
        if sent > 0:
            db.session.commit()
        result = {'stale': len(stale_apps), 'nudges_sent': sent, 'donor_orgs': len(by_donor_org)}
        _rcr('donor-followup-nudge',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception('donor-followup-nudge cron failed: %s', e)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('donor-followup-nudge',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/reviewer-digest', methods=['POST'])
def api_cron_reviewer_digest():
    """Phase 205 — Weekly per-reviewer caseload digest.

    Creates an in-app Notification per reviewer with:
      - pending review count
      - oldest pending assignment days (if any)
      - count past deadline
    Idempotent in practice — Notifications cluster per day; sending twice
    in a row creates a duplicate notification but no harm.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import User, Review, Notification, record_cron_run as _rcr
        from datetime import datetime, timezone

        reviewers = User.query.filter_by(role='reviewer').all()
        sent = 0
        now = datetime.now(timezone.utc)
        for r in reviewers:
            pending = Review.query.filter(
                Review.reviewer_id == r.id,
                Review.status.in_(['pending', 'in_progress']),
            ).all()
            if not pending:
                continue
            oldest_days = 0
            for rev in pending:
                created = getattr(rev, 'created_at', None) or getattr(rev, 'assigned_at', None)
                if created:
                    if created.tzinfo is None:
                        created = created.replace(tzinfo=timezone.utc)
                    d = (now - created).days
                    if d > oldest_days:
                        oldest_days = d
            msg = f'You have {len(pending)} pending review{"s" if len(pending) != 1 else ""}.'
            if oldest_days > 0:
                msg += f' Oldest is {oldest_days} day{"s" if oldest_days != 1 else ""} old.'
            n = Notification(
                user_id=r.id,
                type='reviewer_digest',
                title='Your review queue this week',
                message=msg,
                link='/reviews',
            )
            db.session.add(n)
            sent += 1
        if sent > 0:
            db.session.commit()
        result = {'reviewers_scanned': len(reviewers), 'digests_sent': sent}
        _rcr('reviewer-digest',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception(f'reviewer digest cron failed: {e}')
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('reviewer-digest',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/ai-cost-trend', methods=['POST'])
def api_cron_ai_cost_trend():
    """Phase 443 — Monthly digest to admins. Per-tenant sum(usd_cost) on
    ai_call_logs for the current 30-day window vs the prior 30-day window.
    Sends admins the top 3 climbers and top 3 fallers (absolute USD
    delta). Honors digests opt-out.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import (
            User, Organization, Notification,
            record_cron_run as _rcr,
        )
        from app.models.notification_preference import NotificationPreference
        from sqlalchemy import text as _text
        from datetime import datetime, timezone, timedelta

        now = datetime.now(timezone.utc)
        recent_start = now - timedelta(days=30)
        prior_start = now - timedelta(days=60)
        try:
            recent_rows = db.session.execute(_text(
                "SELECT org_id, COALESCE(SUM(usd_cost), 0) AS c "
                "FROM ai_call_logs WHERE created_at >= :c AND org_id IS NOT NULL "
                "GROUP BY org_id"
            ), {'c': recent_start}).all()
            prior_rows = db.session.execute(_text(
                "SELECT org_id, COALESCE(SUM(usd_cost), 0) AS c "
                "FROM ai_call_logs WHERE created_at >= :a AND created_at < :b "
                "AND org_id IS NOT NULL GROUP BY org_id"
            ), {'a': prior_start, 'b': recent_start}).all()
        except Exception:
            recent_rows = []
            prior_rows = []

        recent = {r.org_id: float(r.c or 0) for r in recent_rows}
        prior = {r.org_id: float(r.c or 0) for r in prior_rows}
        all_orgs = set(recent) | set(prior)
        deltas = []
        for oid in all_orgs:
            r = recent.get(oid, 0.0)
            p = prior.get(oid, 0.0)
            deltas.append({'org_id': oid, 'recent': round(r, 2),
                           'prior': round(p, 2), 'delta': round(r - p, 2)})

        climbers = sorted([d for d in deltas if d['delta'] > 0],
                          key=lambda d: d['delta'], reverse=True)[:3]
        fallers = sorted([d for d in deltas if d['delta'] < 0],
                         key=lambda d: d['delta'])[:3]

        org_id_set = {d['org_id'] for d in climbers + fallers}
        org_names = {}
        if org_id_set:
            for oid, name in db.session.query(Organization.id, Organization.name).filter(
                    Organization.id.in_(list(org_id_set))).all():
                org_names[oid] = name

        for d in climbers + fallers:
            d['org_name'] = org_names.get(d['org_id'], f'Org #{d["org_id"]}')

        sent = 0
        if climbers or fallers:
            parts = []
            for d in climbers:
                parts.append(f'{d["org_name"]} +${d["delta"]:.2f}')
            for d in fallers:
                parts.append(f'{d["org_name"]} ${d["delta"]:.2f}')
            msg = 'AI cost shifts (30d vs prior 30d): ' + ', '.join(parts)
            admins = User.query.filter_by(role='admin').all()
            for u in admins:
                channels = NotificationPreference.channels_for(user_id=u.id, category='digests')
                if not channels:
                    continue
                n = Notification(
                    user_id=u.id,
                    type='ai_cost_trend',
                    title='Monthly AI cost movers',
                    message=msg[:500],
                    link='/admin/ai-cost',
                )
                db.session.add(n)
                sent += 1
            if sent > 0:
                db.session.commit()

        result = {
            'orgs_tracked': len(all_orgs),
            'climbers': len(climbers),
            'fallers': len(fallers),
            'admins_notified': sent,
        }
        _rcr('ai-cost-trend',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result,
                        'climbers': climbers, 'fallers': fallers})
    except Exception as e:
        logger.exception('ai-cost-trend cron failed: %s', e)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('ai-cost-trend',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/ngo-closing-soon-watchlist', methods=['POST'])
def api_cron_ngo_closing_soon_watchlist():
    """Phase 449 — Weekly reminder. For each NGO user, count grants on
    their watchlist whose deadline is within 7 days AND they have NOT
    yet submitted an application for that grant. Sends one digest
    per affected user. Honors digests opt-out.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import (
            User, Grant, Application, Notification,
            record_cron_run as _rcr,
        )
        from app.models.notification_preference import NotificationPreference
        from app.models.watchlist import WatchlistItem
        from datetime import datetime, timezone, timedelta

        today = datetime.now(timezone.utc).date()
        seven_days = today + timedelta(days=7)
        ngos = User.query.filter_by(role='ngo').all()
        sent = 0
        for u in ngos:
            if not u.org_id:
                continue
            channels = NotificationPreference.channels_for(user_id=u.id, category='digests')
            if not channels:
                continue
            watched_ids = [w.target_id for w in WatchlistItem.query.filter_by(
                user_id=u.id, kind='grant').all()]
            if not watched_ids:
                continue
            closing = (Grant.query
                       .filter(Grant.id.in_(watched_ids),
                               Grant.deadline.isnot(None),
                               Grant.deadline >= today,
                               Grant.deadline <= seven_days,
                               Grant.status.in_(['open', 'review']))
                       .all())
            if not closing:
                continue
            applied_ids = {gid for (gid,) in db.session.query(
                Application.grant_id).filter(
                Application.org_id == u.org_id,
                Application.grant_id.in_([g.id for g in closing])
            ).distinct().all()}
            unapplied = [g for g in closing if g.id not in applied_ids]
            if not unapplied:
                continue
            sample = ', '.join(g.title for g in unapplied[:2])
            extra = f' (+{len(unapplied) - 2} more)' if len(unapplied) > 2 else ''
            msg = (
                f'{len(unapplied)} watchlisted grant'
                f'{"" if len(unapplied) == 1 else "s"} close within 7 days '
                f'and you have no draft yet: {sample}{extra}.'
            )
            n = Notification(
                user_id=u.id,
                type='closing_soon_watchlist',
                title='Grants closing this week',
                message=msg[:500],
                link='/grants',
            )
            db.session.add(n)
            sent += 1
        if sent > 0:
            db.session.commit()
        result = {'ngos_scanned': len(ngos), 'notifications_sent': sent}
        _rcr('ngo-closing-soon-watchlist',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception('ngo-closing-soon-watchlist cron failed: %s', e)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('ngo-closing-soon-watchlist',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/data-integrity-check', methods=['POST'])
def api_cron_data_integrity_check():
    """Phase 455 — Daily quick scan for orphan rows:
      * applications.grant_id pointing at a missing grant
      * reviews.application_id pointing at a missing application
    If either count > 0, notify admins. Digests opt-out gated.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import (
            User, Notification, record_cron_run as _rcr,
        )
        from app.models.notification_preference import NotificationPreference
        from sqlalchemy import text as _text

        try:
            orphan_apps = db.session.execute(_text(
                "SELECT COUNT(*) FROM applications a "
                "LEFT JOIN grants g ON g.id = a.grant_id "
                "WHERE a.grant_id IS NOT NULL AND g.id IS NULL"
            )).scalar() or 0
        except Exception:
            orphan_apps = 0
        try:
            orphan_reviews = db.session.execute(_text(
                "SELECT COUNT(*) FROM reviews r "
                "LEFT JOIN applications a ON a.id = r.application_id "
                "WHERE r.application_id IS NOT NULL AND a.id IS NULL"
            )).scalar() or 0
        except Exception:
            orphan_reviews = 0

        total = int(orphan_apps) + int(orphan_reviews)
        sent = 0
        if total > 0:
            msg = (
                f'Data integrity scan: {int(orphan_apps)} orphan '
                f'application(s), {int(orphan_reviews)} orphan review(s).'
            )
            admins = User.query.filter_by(role='admin').all()
            for u in admins:
                channels = NotificationPreference.channels_for(user_id=u.id, category='digests')
                if not channels:
                    continue
                n = Notification(
                    user_id=u.id,
                    type='data_integrity',
                    title='Data integrity orphans detected',
                    message=msg[:500],
                    link='/admin/observability',
                )
                db.session.add(n)
                sent += 1
            if sent > 0:
                db.session.commit()
        result = {
            'orphan_apps': int(orphan_apps),
            'orphan_reviews': int(orphan_reviews),
            'admins_notified': sent,
        }
        _rcr('data-integrity-check',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception('data-integrity-check cron failed: %s', e)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('data-integrity-check',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/yesterday-submissions-digest', methods=['POST'])
def api_cron_yesterday_submissions_digest():
    """Phase 461 — Daily morning admin digest. Counts applications
    submitted in the past 24h, grouped by donor org. Digests opt-out gated.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import (
            User, Organization, Application, Grant, Notification,
            record_cron_run as _rcr,
        )
        from app.models.notification_preference import NotificationPreference
        from datetime import datetime, timezone, timedelta

        now = datetime.now(timezone.utc)
        since = now - timedelta(hours=24)
        rows = (db.session.query(Organization.id, Organization.name,
                                  db.func.count(Application.id))
                .join(Grant, Grant.donor_org_id == Organization.id)
                .join(Application, Application.grant_id == Grant.id)
                .filter(Application.submitted_at.isnot(None),
                        Application.submitted_at >= since)
                .group_by(Organization.id, Organization.name)
                .all())
        groups = [(name, int(count)) for (oid, name, count) in rows if count]
        groups.sort(key=lambda x: x[1], reverse=True)
        total = sum(c for _, c in groups)
        sent = 0
        if total > 0:
            parts = [f'{name}: {c}' for name, c in groups[:5]]
            extra = f' (+{len(groups) - 5} more)' if len(groups) > 5 else ''
            msg = f'Yesterday: {total} application(s) submitted. ' + ', '.join(parts) + extra
            admins = User.query.filter_by(role='admin').all()
            for u in admins:
                channels = NotificationPreference.channels_for(user_id=u.id, category='digests')
                if not channels:
                    continue
                n = Notification(
                    user_id=u.id,
                    type='yesterday_submissions',
                    title='Yesterday\'s submissions',
                    message=msg[:500],
                    link='/applications',
                )
                db.session.add(n)
                sent += 1
            if sent > 0:
                db.session.commit()
        result = {
            'total_submissions': int(total),
            'donor_orgs': len(groups),
            'admins_notified': sent,
        }
        _rcr('yesterday-submissions-digest',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception('yesterday-submissions-digest cron failed: %s', e)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('yesterday-submissions-digest',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/reviewer-weekly-recap', methods=['POST'])
def api_cron_reviewer_weekly_recap():
    """Phase 467 — Friday cron. For each reviewer, send a weekly recap:
    reviews completed this week, mean overall_score, fastest turnaround.
    Honors digests opt-out.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import (
            User, Review, Notification, record_cron_run as _rcr,
        )
        from app.models.notification_preference import NotificationPreference
        from datetime import datetime, timezone, timedelta

        now = datetime.now(timezone.utc)
        since = now - timedelta(days=7)
        reviewers = User.query.filter_by(role='reviewer').all()
        sent = 0
        for u in reviewers:
            channels = NotificationPreference.channels_for(user_id=u.id, category='digests')
            if not channels:
                continue
            recent = (Review.query
                      .filter(Review.reviewer_user_id == u.id,
                              Review.status.in_(['submitted', 'scored', 'completed']),
                              Review.completed_at.isnot(None),
                              Review.completed_at >= since)
                      .all())
            if not recent:
                continue
            scores = [float(r.overall_score) for r in recent if r.overall_score is not None]
            durations = []
            for r in recent:
                if r.created_at and r.completed_at:
                    h = (r.completed_at - r.created_at).total_seconds() / 3600.0
                    if h >= 0:
                        durations.append(h)
            mean_score = round(sum(scores) / len(scores), 1) if scores else None
            fastest = round(min(durations), 1) if durations else None
            parts = [f'{len(recent)} reviews completed']
            if mean_score is not None:
                parts.append(f'mean score {mean_score}')
            if fastest is not None:
                parts.append(f'fastest {fastest}h')
            msg = 'Weekly recap: ' + ', '.join(parts) + '.'
            n = Notification(
                user_id=u.id,
                type='reviewer_weekly_recap',
                title='Your week in reviews',
                message=msg[:500],
                link='/reviews',
            )
            db.session.add(n)
            sent += 1
        if sent > 0:
            db.session.commit()
        result = {'reviewers_scanned': len(reviewers), 'digests_sent': sent}
        _rcr('reviewer-weekly-recap',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception('reviewer-weekly-recap cron failed: %s', e)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('reviewer-weekly-recap',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/ngo-unread-broadcasts-nudge', methods=['POST'])
def api_cron_ngo_unread_broadcasts_nudge():
    """Phase 473 — Weekly Friday nudge. For each NGO user whose org has
    unread TenantMessage rows, send a digest suggesting they catch up.
    Honors digests opt-out.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import (
            User, TenantMessage, TenantMessageRead, Notification,
            record_cron_run as _rcr,
        )
        from app.models.notification_preference import NotificationPreference

        ngos = User.query.filter_by(role='ngo').all()
        sent = 0
        for u in ngos:
            if not u.org_id:
                continue
            channels = NotificationPreference.channels_for(user_id=u.id, category='digests')
            if not channels:
                continue
            read_ids_q = db.session.query(TenantMessageRead.message_id).filter(
                TenantMessageRead.org_id == u.org_id)
            unread = (TenantMessage.query
                      .filter(TenantMessage.id.notin_(read_ids_q))
                      .count())
            if unread <= 0:
                continue
            msg = (
                f'You have {unread} unread message'
                f'{"" if unread == 1 else "s"} in your inbox.'
            )
            n = Notification(
                user_id=u.id,
                type='unread_broadcasts',
                title='Unread messages waiting',
                message=msg[:500],
                link='/messages',
            )
            db.session.add(n)
            sent += 1
        if sent > 0:
            db.session.commit()
        result = {'ngos_scanned': len(ngos), 'nudges_sent': sent}
        _rcr('ngo-unread-broadcasts-nudge',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception('ngo-unread-broadcasts-nudge cron failed: %s', e)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('ngo-unread-broadcasts-nudge',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/review-pipeline-summary', methods=['POST'])
def api_cron_review_pipeline_summary():
    """Phase 479 — Monthly admin digest. Reviews completed this 30-day
    window, mean turnaround hours, top 3 most-active reviewers by
    completion count. Honors digests opt-out.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import (
            User, Review, Notification, record_cron_run as _rcr,
        )
        from app.models.notification_preference import NotificationPreference
        from datetime import datetime, timezone, timedelta
        from collections import Counter

        now = datetime.now(timezone.utc)
        since = now - timedelta(days=30)
        recent = (Review.query
                  .filter(Review.status.in_(['submitted', 'scored', 'completed']),
                          Review.completed_at.isnot(None),
                          Review.completed_at >= since)
                  .all())
        total = len(recent)
        durations = []
        per_reviewer = Counter()
        for r in recent:
            if r.created_at and r.completed_at:
                h = (r.completed_at - r.created_at).total_seconds() / 3600.0
                if h >= 0:
                    durations.append(h)
            if r.reviewer_user_id:
                per_reviewer[r.reviewer_user_id] += 1
        mean_hours = round(sum(durations) / len(durations), 1) if durations else None

        top_ids = [rid for rid, _ in per_reviewer.most_common(3)]
        top_names = {}
        if top_ids:
            for uid, name in db.session.query(User.id, User.name).filter(
                    User.id.in_(top_ids)).all():
                top_names[uid] = name
        top_parts = []
        for rid in top_ids:
            label = top_names.get(rid, f'User #{rid}')
            top_parts.append(f'{label} ({per_reviewer[rid]})')

        sent = 0
        if total > 0:
            msg_parts = [f'{total} reviews completed']
            if mean_hours is not None:
                msg_parts.append(f'mean turnaround {mean_hours}h')
            if top_parts:
                msg_parts.append('top: ' + ', '.join(top_parts))
            msg = 'Review pipeline (30d): ' + ', '.join(msg_parts) + '.'
            admins = User.query.filter_by(role='admin').all()
            for u in admins:
                channels = NotificationPreference.channels_for(user_id=u.id, category='digests')
                if not channels:
                    continue
                n = Notification(
                    user_id=u.id,
                    type='review_pipeline_summary',
                    title='Monthly review pipeline summary',
                    message=msg[:500],
                    link='/admin/reviewers-workload',
                )
                db.session.add(n)
                sent += 1
            if sent > 0:
                db.session.commit()
        result = {
            'total_completed': total,
            'mean_hours': mean_hours,
            'top_reviewers': len(top_parts),
            'admins_notified': sent,
        }
        _rcr('review-pipeline-summary',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception('review-pipeline-summary cron failed: %s', e)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('review-pipeline-summary',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/ngo-monthly-accomplishments', methods=['POST'])
def api_cron_ngo_monthly_accomplishments():
    """Phase 485 — First-of-the-month cron. Per NGO user, send a digest
    of submissions + funded apps in the previous calendar month.
    Honors digests opt-out.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import (
            User, Application, Notification, record_cron_run as _rcr,
        )
        from app.models.notification_preference import NotificationPreference
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc)
        # Previous calendar month window
        if now.month == 1:
            prev_year, prev_month = now.year - 1, 12
        else:
            prev_year, prev_month = now.year, now.month - 1
        period_start = datetime(prev_year, prev_month, 1, tzinfo=timezone.utc)
        period_end = datetime(now.year, now.month, 1, tzinfo=timezone.utc)

        ngos = User.query.filter_by(role='ngo').all()
        sent = 0
        for u in ngos:
            if not u.org_id:
                continue
            channels = NotificationPreference.channels_for(user_id=u.id, category='digests')
            if not channels:
                continue
            submitted = (Application.query
                         .filter(Application.org_id == u.org_id,
                                 Application.submitted_at.isnot(None),
                                 Application.submitted_at >= period_start,
                                 Application.submitted_at < period_end)
                         .count())
            funded = (Application.query
                      .filter(Application.org_id == u.org_id,
                              Application.status.in_(['funded', 'awarded']),
                              Application.decision_recorded_at.isnot(None),
                              Application.decision_recorded_at >= period_start,
                              Application.decision_recorded_at < period_end)
                      .count())
            if submitted == 0 and funded == 0:
                continue
            label = period_start.strftime('%B %Y')
            parts = []
            if submitted:
                parts.append(f'{submitted} application{"" if submitted == 1 else "s"} submitted')
            if funded:
                parts.append(f'{funded} funded')
            msg = f'{label} accomplishments: ' + ', '.join(parts) + '.'
            n = Notification(
                user_id=u.id,
                type='ngo_monthly_accomplishments',
                title='Your month in review',
                message=msg[:500],
                link='/dashboard',
            )
            db.session.add(n)
            sent += 1
        if sent > 0:
            db.session.commit()
        result = {'ngos_scanned': len(ngos), 'digests_sent': sent}
        _rcr('ngo-monthly-accomplishments',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception('ngo-monthly-accomplishments cron failed: %s', e)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('ngo-monthly-accomplishments',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/system-load-summary', methods=['POST'])
def api_cron_system_load_summary():
    """Phase 491 — Weekly admin digest. Multi-metric pulse for the last
    7 days: notifications sent, audit chain entries, applications
    submitted, reviews completed. Honors digests opt-out.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import (
            User, Application, Review, Notification, record_cron_run as _rcr,
        )
        from app.models.notification_preference import NotificationPreference
        from app.models.audit_chain import AuditChainEntry
        from datetime import datetime, timezone, timedelta

        now = datetime.now(timezone.utc)
        since = now - timedelta(days=7)
        n_notifs = Notification.query.filter(Notification.created_at >= since).count()
        n_audit = AuditChainEntry.query.filter(AuditChainEntry.created_at >= since).count()
        n_apps = (Application.query
                  .filter(Application.submitted_at.isnot(None),
                          Application.submitted_at >= since)
                  .count())
        n_reviews = (Review.query
                     .filter(Review.completed_at.isnot(None),
                             Review.completed_at >= since,
                             Review.status.in_(['submitted', 'scored', 'completed']))
                     .count())
        msg = (
            f'Last 7 days: {n_apps} application(s) submitted, '
            f'{n_reviews} review(s) completed, {n_notifs} notification(s), '
            f'{n_audit} audit entries.'
        )
        sent = 0
        if (n_apps + n_reviews + n_notifs + n_audit) > 0:
            admins = User.query.filter_by(role='admin').all()
            for u in admins:
                channels = NotificationPreference.channels_for(user_id=u.id, category='digests')
                if not channels:
                    continue
                n = Notification(
                    user_id=u.id,
                    type='system_load_summary',
                    title='Weekly system load',
                    message=msg[:500],
                    link='/admin/observability',
                )
                db.session.add(n)
                sent += 1
            if sent > 0:
                db.session.commit()
        result = {
            'applications': n_apps,
            'reviews': n_reviews,
            'notifications': n_notifs,
            'audit_entries': n_audit,
            'admins_notified': sent,
        }
        _rcr('system-load-summary',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception('system-load-summary cron failed: %s', e)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('system-load-summary',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/stale-reviewers-digest', methods=['POST'])
def api_cron_stale_reviewers_digest():
    """Phase 497 — Weekly admin digest. Lists reviewers with zero
    completed reviews in the last 30 days. Helps admins notice churn
    risk. Honors digests opt-out.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    import time as _time
    _t0 = _time.time()
    try:
        from app.extensions import db
        from app.models import (
            User, Review, Notification, record_cron_run as _rcr,
        )
        from app.models.notification_preference import NotificationPreference
        from datetime import datetime, timezone, timedelta

        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(days=30)
        reviewers = User.query.filter_by(role='reviewer').all()
        active_ids = {
            rid for (rid,) in db.session.query(Review.reviewer_user_id)
            .filter(Review.status.in_(['submitted', 'scored', 'completed']),
                    Review.completed_at.isnot(None),
                    Review.completed_at >= cutoff)
            .distinct().all()
        }
        stale = [u for u in reviewers if u.id not in active_ids]
        sent = 0
        if stale:
            names = []
            for u in stale[:5]:
                label = u.name or u.email or f'User #{u.id}'
                names.append(label)
            sample = ', '.join(names)
            extra = f' (+{len(stale) - 5} more)' if len(stale) > 5 else ''
            msg = (
                f'{len(stale)} reviewer{"" if len(stale) == 1 else "s"} '
                f'completed no reviews in last 30 days: {sample}{extra}'
            )
            admins = User.query.filter_by(role='admin').all()
            for a in admins:
                channels = NotificationPreference.channels_for(user_id=a.id, category='digests')
                if not channels:
                    continue
                n = Notification(
                    user_id=a.id,
                    type='stale_reviewers',
                    title='Reviewers inactive last 30 days',
                    message=msg[:500],
                    link='/admin/reviewers-workload',
                )
                db.session.add(n)
                sent += 1
            if sent > 0:
                db.session.commit()
        result = {
            'reviewers_total': len(reviewers),
            'stale_count': len(stale),
            'admins_notified': sent,
        }
        _rcr('stale-reviewers-digest',
             duration_ms=int((_time.time() - _t0) * 1000),
             success=True, summary=str(result)[:480])
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception('stale-reviewers-digest cron failed: %s', e)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass
        try:
            from app.models import record_cron_run as _rcr
            _rcr('stale-reviewers-digest',
                 duration_ms=int((_time.time() - _t0) * 1000),
                 success=False, summary=str(e)[:480])
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)[:200]}), 500
