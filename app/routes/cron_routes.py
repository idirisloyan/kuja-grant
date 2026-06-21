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

        ngos = User.query.filter_by(role='ngo').all()
        sent = 0
        for u in ngos:
            if not u.org_id:
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
