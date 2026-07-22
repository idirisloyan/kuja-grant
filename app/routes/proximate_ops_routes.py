"""
Proximate ops / infrastructure crons — Phase 719-720.

Blueprint prefix: /api/proximate-ops

Separate from proximate_routes.py (the tenant-facing API) on purpose:
everything here is infrastructure work — object storage, database
backups, register reconciliation — that runs on a scheduler with a
CRON_SECRET rather than a user session, and has no tenant UI.

Every endpoint is:
  - Bearer CRON_SECRET gated (an admin session also works, for debugging)
  - idempotent / safe to re-run
  - explicit in its payload about work NOT done, so a no-op from missing
    configuration can never be mistaken for a successful run.
"""

import gzip
import logging
import os
import shutil
import subprocess
import tempfile
import time
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from flask_login import current_user

logger = logging.getLogger('kuja')

proximate_ops_bp = Blueprint(
    'proximate_ops', __name__, url_prefix='/api/proximate-ops')

# pg_dump gets its own generous ceiling — a cold Railway Postgres can take
# a while to stream a full dump, and a half-written dump is worse than a
# slow one.
PG_DUMP_TIMEOUT_SECONDS = 900


def _is_authorized() -> bool:
    """CRON_SECRET via Bearer header OR an authenticated admin session.
    Mirrors cron_routes._is_authorized so the scheduler config is uniform."""
    auth_header = request.headers.get('Authorization', '')
    secret = os.getenv('CRON_SECRET') or ''
    if secret and auth_header == f'Bearer {secret}':
        return True
    if current_user.is_authenticated and \
            getattr(current_user, 'role', None) == 'admin':
        return True
    return False


def _backup_key(now=None):
    """One object per ISO week. Re-running the cron inside the same week
    targets the same key, which is what makes the endpoint idempotent
    without needing a ledger table."""
    now = now or datetime.now(timezone.utc)
    iso_year, iso_week, _ = now.isocalendar()
    return f'backups/postgres/kuja-{iso_year:04d}-W{iso_week:02d}.sql.gz'


@proximate_ops_bp.route('/backup/weekly', methods=['POST'])
def api_cron_weekly_backup():
    """Phase 720 — weekly pg_dump to object storage.

    No-ops with an explicit payload (and HTTP 200) when object storage is
    unconfigured: that is the expected state until the R2 bucket is
    provisioned, and paging ops nightly for it would be noise. The payload
    always carries `backed_up: false` plus a `reason` in that case — it
    never reports a backup that did not happen.

    Query params:
      force=1   re-dump and overwrite even if this week's object exists.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403

    from app.services.object_storage_service import ObjectStorageService
    from app.models import record_cron_run

    t0 = time.time()
    force = request.args.get('force') in ('1', 'true', 'yes')
    key = _backup_key()

    def _finish(payload, *, success=True):
        record_cron_run(
            'proximate-weekly-backup',
            duration_ms=int((time.time() - t0) * 1000),
            success=success,
            summary=str({k: v for k, v in payload.items()
                         if k != 'storage_detail'})[:480],
        )
        return payload

    # --- Gate 1: object storage configured? ---
    if not ObjectStorageService.is_configured():
        return jsonify(_finish({
            'success': True,
            'backed_up': False,
            'reason': 'object_storage_not_configured',
            'message': ('S3/R2 is not configured — no backup was taken. '
                        'Set S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY '
                        'and S3_BUCKET to enable weekly dumps.'),
            'storage_detail': ObjectStorageService.config_status(),
            'key': key,
        }))

    # --- Gate 2: is there a Postgres to dump? ---
    db_url = os.getenv('DATABASE_URL', '')
    if db_url.startswith('postgres://'):
        # Railway hands out the legacy scheme; pg_dump accepts either, but
        # normalise so the URL we pass matches what SQLAlchemy connects to.
        db_url = db_url.replace('postgres://', 'postgresql://', 1)
    if not db_url.startswith('postgresql://'):
        return jsonify(_finish({
            'success': True,
            'backed_up': False,
            'reason': 'not_postgres',
            'message': ('DATABASE_URL is not a PostgreSQL URL (local dev '
                        'runs on SQLite) — nothing to pg_dump.'),
            'key': key,
        }))

    # --- Gate 3: pg_dump binary present? ---
    pg_dump = shutil.which('pg_dump')
    if not pg_dump:
        # A real failure: we are on Postgres and were asked to back up.
        logger.error('weekly backup: pg_dump not found on PATH')
        return jsonify(_finish({
            'success': False,
            'backed_up': False,
            'reason': 'pg_dump_not_found',
            'message': ('pg_dump is not installed in this image — the '
                        'weekly backup cannot run. Add postgresql-client '
                        'to the container.'),
            'key': key,
        }, success=False)), 500

    # --- Gate 4: already have this week's dump? ---
    if not force:
        head = ObjectStorageService.head_object(key)
        if head.get('success') and head.get('exists'):
            return jsonify(_finish({
                'success': True,
                'backed_up': False,
                'reason': 'already_present',
                'message': f'Backup for this ISO week already exists ({key}).',
                'key': key,
                'size': head.get('size'),
            }))
        if not head.get('success'):
            # Could not probe. Continue and upload anyway — overwriting
            # this week's key is harmless and losing a backup is not.
            logger.warning('weekly backup: HEAD probe failed (%s); '
                           'proceeding with dump', head.get('reason'))

    # --- Dump → gzip → upload ---
    tmp_dir = tempfile.mkdtemp(prefix='kuja-backup-')
    raw_path = os.path.join(tmp_dir, 'dump.sql')
    gz_path = os.path.join(tmp_dir, 'dump.sql.gz')
    try:
        # --no-owner/--no-acl keep the dump restorable into a database
        # with different role names (Railway regenerates them).
        # NOTE: db_url carries the password. It is passed as an argv item
        # and must never reach a log line or the response payload.
        proc = subprocess.run(
            [pg_dump, '--no-owner', '--no-acl', '--format=plain',
             '--file', raw_path, db_url],
            capture_output=True, text=True,
            timeout=PG_DUMP_TIMEOUT_SECONDS,
        )
        if proc.returncode != 0:
            # stderr can echo the connection string — truncate hard and
            # strip anything that looks like a URL before surfacing.
            err = (proc.stderr or '').replace(db_url, '<DATABASE_URL>')[:300]
            logger.error('weekly backup: pg_dump exited %s: %s',
                         proc.returncode, err)
            return jsonify(_finish({
                'success': False,
                'backed_up': False,
                'reason': 'pg_dump_failed',
                'exit_code': proc.returncode,
                'detail': err,
                'key': key,
            }, success=False)), 500

        with open(raw_path, 'rb') as src, gzip.open(gz_path, 'wb') as dst:
            shutil.copyfileobj(src, dst, length=1024 * 1024)
        gz_size = os.path.getsize(gz_path)

        res = ObjectStorageService.put_file(
            key, gz_path, content_type='application/gzip')
        if not res.get('success'):
            logger.error('weekly backup: upload failed: %s', res.get('reason'))
            return jsonify(_finish({
                'success': False,
                'backed_up': False,
                'reason': f"upload_failed:{res.get('reason')}",
                'detail': res.get('detail'),
                'key': key,
            }, success=False)), 502

        logger.info('weekly backup uploaded: %s (%s bytes)', key, gz_size)
        return jsonify(_finish({
            'success': True,
            'backed_up': True,
            'key': key,
            'size': gz_size,
            'raw_size': os.path.getsize(raw_path),
            'etag': res.get('etag'),
        }))

    except subprocess.TimeoutExpired:
        logger.error('weekly backup: pg_dump timed out after %ss',
                     PG_DUMP_TIMEOUT_SECONDS)
        return jsonify(_finish({
            'success': False,
            'backed_up': False,
            'reason': 'pg_dump_timeout',
            'timeout_seconds': PG_DUMP_TIMEOUT_SECONDS,
            'key': key,
        }, success=False)), 504
    except Exception as e:
        logger.exception('weekly backup failed: %s', e)
        return jsonify(_finish({
            'success': False,
            'backed_up': False,
            'reason': 'unexpected_error',
            'detail': str(e)[:300],
            'key': key,
        }, success=False)), 500
    finally:
        # Always reclaim the temp dump — it is a full copy of the database
        # sitting on the app container's disk.
        shutil.rmtree(tmp_dir, ignore_errors=True)


@proximate_ops_bp.route('/storage/status', methods=['GET'])
def api_storage_status():
    """Which S3 vars are set, and is this week's backup present.
    Read-only probe for ops — no secret values are returned."""
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403

    from app.services.object_storage_service import ObjectStorageService

    status = ObjectStorageService.config_status()
    key = _backup_key()
    backup = None
    if status['configured']:
        backup = ObjectStorageService.head_object(key)
    return jsonify({
        'success': True,
        'storage': status,
        'current_week_backup_key': key,
        'current_week_backup': backup,
    })


@proximate_ops_bp.route('/storage/migrate-evidence', methods=['POST'])
def api_migrate_evidence():
    """Phase 719 — copy existing evidence Documents into object storage.

    Safe to re-run (skips objects already present at the same size) and a
    no-op with a clear payload when S3 is unconfigured. Local originals
    are kept — see migrate_to_object_storage's docstring for why removing
    them would break every download route today.

    Query params:
      limit=N     only consider the first N documents
      dry_run=1   report what would upload without writing anything
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403

    from app.services.object_storage_service import migrate_to_object_storage
    from app.models import record_cron_run

    t0 = time.time()
    limit = request.args.get('limit', type=int)
    dry_run = request.args.get('dry_run') in ('1', 'true', 'yes')

    summary = migrate_to_object_storage(limit=limit, dry_run=dry_run)
    record_cron_run(
        'proximate-evidence-migrate',
        duration_ms=int((time.time() - t0) * 1000),
        # Configuration absent is not a failed run; upload errors are.
        success=(summary.get('errors', 0) == 0),
        summary=str({k: v for k, v in summary.items()
                     if k != 'error_detail'})[:480],
    )
    return jsonify({'success': True, 'result': summary})


@proximate_ops_bp.route('/sanctions/sweep-interventions', methods=['POST'])
def api_sweep_sanctions_interventions():
    """SOP 13 §4 — open an intervention for every sanctions-flagged
    partner that does not already have one open.

    This is what makes a screening hit RELIABLY produce an intervention
    rather than only a flag: screening runs from several call sites, and
    this sweep reconciles the register against the flags regardless of
    which path set them (and back-fills partners flagged earlier).

    Opens `warning` measures, which carry a 24h response clock and do NOT
    pause disbursements — the OB decides after seeing the match evidence.
    See ComplianceService.open_intervention_for_sanctions_hit for the full
    reasoning on why this is deliberately not a freeze.
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403

    from app.services.compliance_service import ComplianceService
    from app.models import record_cron_run

    t0 = time.time()
    limit = request.args.get('limit', type=int) or 500
    try:
        result = ComplianceService.sweep_sanctions_interventions(limit=limit)
    except Exception as e:
        logger.exception('sanctions intervention sweep failed: %s', e)
        record_cron_run('proximate-sanctions-sweep',
                        duration_ms=int((time.time() - t0) * 1000),
                        success=False, summary=str(e)[:480])
        return jsonify({'success': False, 'error': 'sweep_failed',
                        'detail': str(e)[:300]}), 500

    record_cron_run(
        'proximate-sanctions-sweep',
        duration_ms=int((time.time() - t0) * 1000),
        success=(result.get('failed', 0) == 0),
        summary=str(result)[:480],
    )
    return jsonify({'success': True, 'result': result})
