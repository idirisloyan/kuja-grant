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
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception(f'reviewer auto-assign sweep cron failed: {e}')
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

    try:
        from app.services.uat_fixture_service import UATFixtureService
        result = UATFixtureService.run()
        logger.info(f'UAT fixture cron: {result}')
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception(f'UAT fixture cron failed: {e}')
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
