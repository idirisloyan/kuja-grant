"""
Kuja Grant Management System - Admin & Operational Routes
==========================================================
Extracted from server.py section 19a (lines ~5305-5462).
Handles health checks, version info, readiness probes, telemetry, and admin stats.

Blueprint prefix: /api
Routes served:
  /api/health        GET   - health check for load balancers
  /api/version       GET   - deployed version information
  /api/ready         GET   - readiness probe (DB connectivity)
  /api/telemetry     POST  - lightweight client event telemetry
  /api/admin/stats   GET   - comprehensive admin dashboard stats
"""

import os
import time
import logging
from datetime import datetime, timedelta, timezone
from threading import Lock

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from sqlalchemy import text, bindparam

from app.extensions import db
from app.models import (
    User, Organization, Grant, Application, Assessment,
    Review, ComplianceCheck, Document,
)
from app.middleware import APP_VERSION, APP_START_TIME, APP_BUILD

logger = logging.getLogger('kuja')

# ---------------------------------------------------------------------------
# Known test/seed accounts — excluded from security alert calculations
# to avoid QA traffic triggering brute-force warnings.
# ---------------------------------------------------------------------------
TEST_EMAILS = {
    'fatima@amani.org', 'ahmed@salamrelief.org', 'thandi@ubuntu.org',
    'peter@hopebridges.org', 'aisha@sahelwomen.org', 'sarah@globalhealth.org',
    'david@eatrust.org', 'james@reviewer.org', 'maria@reviewer.org', 'admin@kuja.org',
}

# ---------------------------------------------------------------------------
# AI availability flags (mirror what ai_service.py exposes)
# ---------------------------------------------------------------------------
try:
    import anthropic  # noqa: F401
    HAS_ANTHROPIC = True
except ImportError:
    HAS_ANTHROPIC = False

ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY', '')

# ---------------------------------------------------------------------------
# Telemetry rate-limiting state
# ---------------------------------------------------------------------------
TELEMETRY_VALID_EVENTS = frozenset([
    'wizard_step_enter', 'upload_started', 'upload_completed',
    'extraction_applied', 'extraction_failed', 'submit_started',
    'submit_succeeded', 'submit_failed', 'application_created',
])

# Simple per-user telemetry rate limiter: max 100 events per minute
_telemetry_buckets = {}   # user_id -> (window_start, count)
_telemetry_lock = Lock()
_telemetry_cleanup_last = 0

# ---------------------------------------------------------------------------
# Blueprint
# ---------------------------------------------------------------------------
admin_bp = Blueprint('admin', __name__, url_prefix='/api')


# =============================================================================
# OPERATIONAL ENDPOINTS (Health, Version, Readiness)
# =============================================================================

@admin_bp.route('/health', methods=['GET'])
def api_health():
    """Health check endpoint for load balancers and monitoring."""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now(timezone.utc).isoformat() + 'Z',
    })


@admin_bp.route('/version', methods=['GET'])
def api_version():
    """Version information for the deployed application."""
    from app.middleware import APP_FRONTEND_BUILD  # lazy import to pick up latest
    uptime_seconds = int((datetime.now(timezone.utc) - APP_START_TIME).total_seconds())
    return jsonify({
        'version': APP_VERSION,
        'build': APP_BUILD,
        'frontend_build': APP_FRONTEND_BUILD,
        'release': f'Kuja Studio {APP_VERSION}',
        'name': 'Kuja Grant Management System',
        'environment': 'production' if os.getenv('DATABASE_URL') else 'development',
        'uptime_seconds': uptime_seconds,
        'started_at': APP_START_TIME.isoformat() + 'Z',
    })


@admin_bp.route('/ready', methods=['GET'])
def api_ready():
    """Readiness probe -- verifies the database is reachable."""
    try:
        db.session.execute(db.text('SELECT 1'))
        db_ok = True
    except Exception as e:
        logger.error(f"Readiness check failed: {e}")
        db_ok = False

    ai_configured = bool(ANTHROPIC_API_KEY and HAS_ANTHROPIC)

    status_code = 200 if db_ok else 503
    return jsonify({
        'ready': db_ok,
        'checks': {
            'database': 'ok' if db_ok else 'unavailable',
            'ai_service': 'configured' if ai_configured else 'not_configured',
        },
        'timestamp': datetime.now(timezone.utc).isoformat() + 'Z',
    }), status_code


@admin_bp.route('/admin/canary', methods=['GET'])
@login_required
def api_admin_canary():
    """Canary health checks for external dependencies.
    Tests connectivity to OpenSanctions API and government registries."""
    if current_user.role != 'admin':
        return jsonify({'error': 'Admin access required'}), 403

    import requests as ext_requests

    checks = {}

    # OpenSanctions API — authenticated probe of the actual /match/sanctions
    # endpoint we use in compliance screening. A 200 here means the live key
    # works AND the request shape is correct; anything else means we'd be
    # falling back to direct list downloads in production.
    os_key = os.getenv('OPENSANCTIONS_API_KEY', '')
    try:
        if not os_key:
            checks['opensanctions'] = {
                'status': 'not_configured',
                'key_configured': False,
                'using_fallback': True,
            }
        else:
            probe_payload = {
                'queries': {
                    'probe': {
                        'schema': 'LegalEntity',
                        'properties': {'name': ['Kuja Health Probe']},
                    }
                }
            }
            r = ext_requests.post(
                'https://api.opensanctions.org/match/sanctions',
                json=probe_payload,
                headers={
                    'Authorization': f'ApiKey {os_key}',
                    'Content-Type': 'application/json',
                },
                timeout=10,
            )
            if r.status_code == 200:
                # Verify the response actually has the expected shape — a 200
                # with malformed body would still cause silent fallback in prod.
                try:
                    body = r.json()
                    inner = (body.get('responses') or {}).get('probe') or {}
                    inner_ok = inner.get('status', 200) == 200 and 'results' in inner
                    os_status = 'ok' if inner_ok else 'degraded'
                except Exception:
                    os_status = 'degraded'
            elif r.status_code in (401, 403):
                os_status = 'auth_failed'  # key invalid or expired
            elif r.status_code == 422:
                os_status = 'request_invalid'  # API contract drift
            elif r.status_code < 500:
                os_status = 'degraded'
            else:
                os_status = 'down'
            checks['opensanctions'] = {
                'status': os_status,
                'http_code': r.status_code,
                'latency_ms': int(r.elapsed.total_seconds() * 1000),
                'key_configured': True,
                'using_fallback': os_status != 'ok',
            }
    except Exception as e:
        checks['opensanctions'] = {
            'status': 'down',
            'error': str(e)[:100],
            'key_configured': bool(os_key),
            'using_fallback': True,
        }

    # Government registries (quick connectivity test)
    # Note: 403/redirect is normal for some portals — only 5xx or timeout = degraded
    registry_urls = {
        'kenya_brs': 'https://brs.go.ke/',
        'nigeria_cac': 'https://search.cac.gov.ng/',
        'south_africa_npo': 'https://www.npo.gov.za/',
        'uganda_ngo': 'https://ngobureau.go.ug/',
        'tanzania_nis': 'https://nis.jamii.go.tz/',
    }
    checks['registries'] = {}
    for name, url in registry_urls.items():
        try:
            r = ext_requests.head(url, timeout=8, allow_redirects=True,
                                  headers={'User-Agent': 'Kuja-Grant-Canary/1.0'})
            # Registries often return 403/301 — that means the server is UP.
            # Only 5xx or connection failure means degraded.
            if r.status_code >= 500:
                reg_status = 'degraded'
            elif r.status_code == 200:
                reg_status = 'ok'
            else:
                reg_status = 'reachable'  # 301/302/403/404 = server alive
            checks['registries'][name] = {
                'status': reg_status,
                'http_code': r.status_code,
                'latency_ms': int(r.elapsed.total_seconds() * 1000),
            }
        except Exception as e:
            checks['registries'][name] = {'status': 'down', 'error': str(e)[:80]}

    # Anthropic AI API (connectivity check only — never send API key in health probes)
    try:
        if ANTHROPIC_API_KEY:
            # Use the messages endpoint with no auth to confirm API is reachable.
            # Expect 401 (auth required) = API is up and responding.
            r = ext_requests.get('https://api.anthropic.com/v1/messages', timeout=8,
                                 headers={'anthropic-version': '2023-06-01'})
            if r.status_code in (401, 403):
                ai_status = 'ok'  # API reachable, auth required = healthy
            elif r.status_code < 500:
                ai_status = 'ok'
            else:
                ai_status = 'degraded'
            checks['anthropic'] = {
                'status': ai_status,
                'http_code': r.status_code,
                'latency_ms': int(r.elapsed.total_seconds() * 1000),
                'key_configured': True,
            }
        else:
            checks['anthropic'] = {'status': 'not_configured', 'key_configured': False}
    except Exception as e:
        checks['anthropic'] = {'status': 'down', 'error': str(e)[:80]}

    # Overall status — check core services (opensanctions, anthropic, db)
    # Registries are advisory only (many return 403 normally)
    core_checks = [checks.get('opensanctions', {}), checks.get('anthropic', {})]
    healthy_statuses = ('ok', 'reachable')
    degraded_statuses = ('degraded', 'auth_failed', 'request_invalid', 'not_configured')
    core_ok = all(c.get('status') in healthy_statuses for c in core_checks if c.get('status'))
    any_down = any(c.get('status') == 'down' for c in core_checks)
    any_degraded = any(c.get('status') in degraded_statuses for c in core_checks)

    if any_down:
        overall = 'degraded'
    elif any_degraded:
        overall = 'degraded'
    elif core_ok:
        overall = 'healthy'
    else:
        overall = 'degraded'

    return jsonify({
        'success': True,
        'overall': overall,
        'checks': checks,
        'timestamp': datetime.now(timezone.utc).isoformat() + 'Z',
    })


# =============================================================================
# TELEMETRY
# =============================================================================

@admin_bp.route('/telemetry', methods=['POST'])
@login_required
def api_telemetry():
    """Lightweight telemetry endpoint -- logs client events, no DB writes."""
    global _telemetry_cleanup_last
    uid = current_user.id

    # Rate limit: 100 events / 60 s per user
    now = time.time()
    with _telemetry_lock:
        # Periodic cleanup: remove stale entries every 60 seconds
        if now - _telemetry_cleanup_last > 60:
            stale_keys = [k for k, v in _telemetry_buckets.items() if now - v[0] > 120]
            for k in stale_keys:
                del _telemetry_buckets[k]
            _telemetry_cleanup_last = now

        bucket = _telemetry_buckets.get(uid, (now, 0))
        if now - bucket[0] > 60:
            bucket = (now, 0)
        if bucket[1] >= 100:
            return jsonify({'success': False, 'error': 'rate_limited'}), 429
        _telemetry_buckets[uid] = (bucket[0], bucket[1] + 1)

    body = request.get_json(silent=True) or {}
    event = body.get('event', '')
    if event not in TELEMETRY_VALID_EVENTS:
        return jsonify({'success': False, 'error': 'invalid_event'}), 400

    data = body.get('data', {})
    correlation_id = body.get('correlation_id', '')
    ts = body.get('timestamp', '')

    logger.info(
        f"TELEMETRY uid={uid} event={event} corr={correlation_id} "
        f"ts={ts} data={data}"
    )
    return jsonify({'success': True})


# =============================================================================
# ADMIN STATS
# =============================================================================

@admin_bp.route('/admin/stats', methods=['GET'])
@login_required
def api_admin_stats():
    """Comprehensive admin statistics for the admin dashboard."""
    if current_user.role != 'admin':
        return jsonify({'error': 'Admin access required'}), 403

    stats = {}

    # System overview
    stats['total_users'] = User.query.count()
    stats['active_users'] = User.query.filter_by(is_active=True).count()
    stats['total_organizations'] = Organization.query.count()
    stats['verified_organizations'] = Organization.query.filter_by(verified=True).count()
    stats['total_grants'] = Grant.query.count()
    stats['open_grants'] = Grant.query.filter_by(status='open').count()
    stats['total_applications'] = Application.query.count()
    stats['total_reviews'] = Review.query.count()
    stats['total_assessments'] = Assessment.query.count()

    # Compliance overview
    total_checks = ComplianceCheck.query.count()
    flagged_checks = ComplianceCheck.query.filter_by(status='flagged').count()
    stats['total_compliance_checks'] = total_checks
    stats['flagged_compliance'] = flagged_checks

    # Users by role
    stats['users_by_role'] = {}
    for r in ['ngo', 'donor', 'reviewer', 'admin']:
        stats['users_by_role'][r] = User.query.filter_by(role=r).count()

    # Orgs by type
    stats['orgs_by_type'] = {}
    for t in ['ngo', 'donor', 'ingo', 'cbo', 'network']:
        stats['orgs_by_type'][t] = Organization.query.filter_by(org_type=t).count()

    # Applications by status
    stats['apps_by_status'] = {}
    for s in ['draft', 'submitted', 'under_review', 'scored', 'approved', 'rejected']:
        stats['apps_by_status'][s] = Application.query.filter_by(status=s).count()

    # Recent activity (last 7 days)
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    stats['new_users_7d'] = User.query.filter(User.created_at >= week_ago).count()
    stats['new_apps_7d'] = Application.query.filter(Application.created_at >= week_ago).count()
    stats['new_orgs_7d'] = Organization.query.filter(Organization.created_at >= week_ago).count()

    # Recent users
    recent_users = User.query.order_by(User.created_at.desc()).limit(10).all()
    stats['recent_users'] = [{'id': u.id, 'name': u.name, 'email': u.email,
                              'role': u.role, 'is_active': u.is_active,
                              'created_at': u.created_at.isoformat() if u.created_at else None}
                             for u in recent_users]

    # --- Security & Audit Metrics ---
    stats['security'] = _get_security_metrics()

    # --- Document / Upload Metrics ---
    stats['documents'] = _get_document_metrics()

    # --- SLO / Alert Thresholds ---
    stats['alerts'] = _check_slo_alerts(stats['security'], stats['documents'])

    # System info
    stats['app_version'] = APP_VERSION
    uptime = int((datetime.now(timezone.utc) - APP_START_TIME).total_seconds())
    stats['uptime'] = f"{uptime // 3600}h {(uptime % 3600) // 60}m"
    stats['environment'] = 'production' if os.getenv('DATABASE_URL') else 'development'
    stats['ai_enabled'] = bool(ANTHROPIC_API_KEY and HAS_ANTHROPIC)

    return jsonify({'stats': stats})


# =============================================================================
# SECURITY & AUDIT
# =============================================================================

def _get_security_metrics():
    """Gather security metrics from login_attempts table and user lockout state."""
    metrics = {
        'login_attempts_1h': 0,
        'login_attempts_24h': 0,
        'unique_ips_1h': 0,
        'unique_ips_24h': 0,
        'currently_locked': 0,
        'top_ips_24h': [],
        'recent_attempts': [],
    }
    try:
        # Check if login_attempts table exists
        result = db.session.execute(text(
            "SELECT EXISTS (SELECT FROM information_schema.tables "
            "WHERE table_name = 'login_attempts')"
        ))
        if not result.scalar():
            return metrics

        now = datetime.now(timezone.utc)
        h1_ago = now - timedelta(hours=1)
        h24_ago = now - timedelta(hours=24)

        # Filter out QA/test account traffic from security metrics so
        # seed-data logins don't trigger brute-force alerts.
        _test_filter = " AND (email IS NULL OR email NOT IN :test_emails)"
        _test_emails = list(TEST_EMAILS)

        def _stmt(sql):
            """Build a text() statement with an expanding bind for test_emails."""
            return text(sql).bindparams(bindparam('test_emails', expanding=True))

        # Attempts in last hour
        r = db.session.execute(
            _stmt("SELECT COUNT(*) FROM login_attempts WHERE attempted_at > :cutoff" + _test_filter),
            {"cutoff": h1_ago, "test_emails": _test_emails},
        )
        metrics['login_attempts_1h'] = r.scalar() or 0

        # Attempts in last 24h
        r = db.session.execute(
            _stmt("SELECT COUNT(*) FROM login_attempts WHERE attempted_at > :cutoff" + _test_filter),
            {"cutoff": h24_ago, "test_emails": _test_emails},
        )
        metrics['login_attempts_24h'] = r.scalar() or 0

        # Unique IPs in last hour
        r = db.session.execute(
            _stmt("SELECT COUNT(DISTINCT ip) FROM login_attempts WHERE attempted_at > :cutoff" + _test_filter),
            {"cutoff": h1_ago, "test_emails": _test_emails},
        )
        metrics['unique_ips_1h'] = r.scalar() or 0

        # Unique IPs in last 24h
        r = db.session.execute(
            _stmt("SELECT COUNT(DISTINCT ip) FROM login_attempts WHERE attempted_at > :cutoff" + _test_filter),
            {"cutoff": h24_ago, "test_emails": _test_emails},
        )
        metrics['unique_ips_24h'] = r.scalar() or 0

        # Top IPs in last 24h (potential brute-force)
        r = db.session.execute(
            _stmt("SELECT ip, COUNT(*) as cnt FROM login_attempts "
                  "WHERE attempted_at > :cutoff" + _test_filter + " GROUP BY ip ORDER BY cnt DESC LIMIT 10"),
            {"cutoff": h24_ago, "test_emails": _test_emails},
        )
        metrics['top_ips_24h'] = [{'ip': row[0], 'attempts': row[1]} for row in r.fetchall()]

        # Recent login attempts (last 20, excluding test accounts)
        r = db.session.execute(
            _stmt("SELECT ip, attempted_at FROM login_attempts "
                  "WHERE (email IS NULL OR email NOT IN :test_emails) "
                  "ORDER BY attempted_at DESC LIMIT 20"),
            {"test_emails": _test_emails},
        )
        metrics['recent_attempts'] = [
            {'ip': row[0], 'time': row[1].isoformat() + 'Z' if row[1] else None}
            for row in r.fetchall()
        ]

    except Exception as e:
        logger.warning(f"Security metrics query failed: {e}")
        db.session.rollback()

    # Currently locked accounts
    try:
        now = datetime.now(timezone.utc)
        locked_users = User.query.filter(
            User.locked_until.isnot(None),
            User.locked_until > now
        ).all()
        metrics['currently_locked'] = len(locked_users)
        metrics['locked_accounts'] = [
            {'email': u.email, 'locked_until': u.locked_until.isoformat() + 'Z' if u.locked_until else None}
            for u in locked_users
        ]
    except Exception as e:
        logger.warning(f"Locked accounts query failed: {e}")
        metrics['currently_locked'] = 0
        metrics['locked_accounts'] = []

    return metrics


def _get_document_metrics():
    """Gather document upload metrics."""
    metrics = {
        'total_documents': 0,
        'documents_7d': 0,
        'avg_score': 0,
        'by_type': {},
        'low_score_docs': [],
    }
    try:
        metrics['total_documents'] = Document.query.count()

        week_ago = datetime.now(timezone.utc) - timedelta(days=7)
        metrics['documents_7d'] = Document.query.filter(
            Document.uploaded_at >= week_ago
        ).count()

        # Average AI score
        from sqlalchemy import func
        avg = db.session.query(func.avg(Document.score)).filter(
            Document.score.isnot(None), Document.score > 0
        ).scalar()
        metrics['avg_score'] = round(float(avg), 1) if avg else 0

        # Documents by type
        type_counts = db.session.query(
            Document.doc_type, func.count(Document.id)
        ).group_by(Document.doc_type).all()
        metrics['by_type'] = {t: c for t, c in type_counts}

        # Recent low-scoring documents (score < 40, last 10)
        low_docs = Document.query.filter(
            Document.score < 40, Document.score > 0
        ).order_by(Document.uploaded_at.desc()).limit(10).all()
        metrics['low_score_docs'] = [
            {
                'id': d.id,
                'filename': d.original_filename,
                'score': d.score,
                'type': d.doc_type,
                'uploaded': d.uploaded_at.isoformat() + 'Z' if d.uploaded_at else None,
            }
            for d in low_docs
        ]
    except Exception as e:
        logger.warning(f"Document metrics query failed: {e}")

    return metrics


# SLO thresholds — configurable via environment variables
AUTH_ABUSE_SLO_1H = int(os.getenv('AUTH_ABUSE_SLO_1H', '100'))    # Max login attempts per hour
AUTH_ABUSE_SLO_LOCKED = int(os.getenv('AUTH_ABUSE_SLO_LOCKED', '3'))  # Max simultaneously locked accounts
UPLOAD_ABUSE_SLO_LOW_SCORE = int(os.getenv('UPLOAD_ABUSE_SLO_LOW_SCORE', '10'))  # Max low-score docs


def _check_slo_alerts(security, documents):
    """Check SLO thresholds and generate alert list."""
    alerts = []
    if security.get('login_attempts_1h', 0) > AUTH_ABUSE_SLO_1H:
        alerts.append({
            'level': 'critical',
            'type': 'auth_abuse',
            'message': f"Login attempts in last hour ({security['login_attempts_1h']}) exceed SLO threshold ({AUTH_ABUSE_SLO_1H})",
            'metric': 'login_attempts_1h',
            'value': security['login_attempts_1h'],
            'threshold': AUTH_ABUSE_SLO_1H,
        })
    if security.get('currently_locked', 0) > AUTH_ABUSE_SLO_LOCKED:
        alerts.append({
            'level': 'warning',
            'type': 'auth_lockout',
            'message': f"{security['currently_locked']} accounts currently locked (threshold: {AUTH_ABUSE_SLO_LOCKED})",
            'metric': 'currently_locked',
            'value': security['currently_locked'],
            'threshold': AUTH_ABUSE_SLO_LOCKED,
        })
    low_docs = len(documents.get('low_score_docs', []))
    if low_docs > UPLOAD_ABUSE_SLO_LOW_SCORE:
        alerts.append({
            'level': 'warning',
            'type': 'upload_quality',
            'message': f"{low_docs} low-quality documents detected (threshold: {UPLOAD_ABUSE_SLO_LOW_SCORE})",
            'metric': 'low_score_docs',
            'value': low_docs,
            'threshold': UPLOAD_ABUSE_SLO_LOW_SCORE,
        })
    # High-risk IP alert
    for ip_info in security.get('top_ips_24h', []):
        if ip_info.get('attempts', 0) >= 50:
            alerts.append({
                'level': 'critical',
                'type': 'brute_force',
                'message': f"IP {ip_info['ip']} has {ip_info['attempts']} login attempts in 24h",
                'metric': 'ip_attempts',
                'value': ip_info['attempts'],
                'threshold': 50,
            })
    return alerts


@admin_bp.route('/admin/security-events', methods=['GET'])
@login_required
def api_admin_security_events():
    """Detailed security event log for admin audit dashboard."""
    if current_user.role != 'admin':
        return jsonify({'error': 'Admin access required'}), 403

    hours = request.args.get('hours', 24, type=int)
    hours = min(hours, 168)  # Cap at 7 days

    events = _get_security_metrics()
    return jsonify({'success': True, 'security': events, 'window_hours': hours})


@admin_bp.route('/tasks/<task_id>', methods=['GET'])
@login_required
def get_task_status(task_id):
    """Check the status of a background task (async AI/compliance operations).
    Returns task status, result on completion, or error on failure."""
    from app.services.task_runner import get_task
    task = get_task(task_id)
    if not task:
        return jsonify({
            'error': 'Task not found',
            'task_id': task_id,
            'hint': 'Task may have expired (24h TTL) or the ID may be incorrect. '
                    'Use GET /api/tasks to list all active tasks.',
        }), 404
    return jsonify(task)


@admin_bp.route('/admin/task-status/<task_id>', methods=['GET'])
@login_required
def get_admin_task_status(task_id):
    """Admin-only endpoint to check a background task status.

    Queries TaskRunner for the task by ID. Falls back to Redis if not
    found in memory. Returns task_id, status, result/error, and timestamps.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'Admin access required'}), 403

    from app.services.task_runner import get_task
    task = get_task(task_id)
    if not task:
        return jsonify({
            'error': 'Task not found',
            'task_id': task_id,
            'hint': 'Task may have expired (24h TTL), been cleaned up, or the ID '
                    'may be incorrect. Use GET /api/tasks to list all active tasks.',
        }), 404

    return jsonify({
        'task_id': task.get('id', task_id),
        'status': task.get('status', 'unknown'),
        'type': task.get('type'),
        'result': task.get('result'),
        'error': task.get('error'),
        'submitted_at': task.get('created_at'),
        'completed_at': task.get('completed_at'),
    })


@admin_bp.route('/tasks', methods=['GET'])
@login_required
def list_tasks():
    """List all background tasks. Admin-only for full list, others see own tasks."""
    if current_user.role != 'admin':
        return jsonify({'error': 'Admin access required'}), 403
    from app.services.task_runner import list_tasks as _list_tasks, cleanup_old_tasks
    # Auto-cleanup old tasks on each listing
    cleanup_old_tasks(max_age_hours=24)
    status_filter = request.args.get('status')
    tasks = _list_tasks(status=status_filter)
    return jsonify({'tasks': tasks, 'count': len(tasks)})


# =============================================================================
# SANCTIONS RE-SCREENING
# =============================================================================

@admin_bp.route('/admin/trigger-rescreening', methods=['POST'])
@login_required
def api_admin_trigger_rescreening():
    """Trigger a manual sanctions re-screening of all orgs with active grants.

    Admin-only. Submits the job as a background task and returns a job_id
    that can be polled via GET /api/tasks/<job_id>.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'Admin access required'}), 403

    from app.services.task_runner import submit_task, schedule_rescreening
    from flask import current_app

    app = current_app._get_current_object()
    task_id = submit_task(
        schedule_rescreening,
        app,
        task_type='sanctions_rescreening',
    )

    logger.info(f"Admin {current_user.email} triggered sanctions rescreening (task_id={task_id})")

    return jsonify({
        'success': True,
        'job_id': task_id,
        'message': 'Sanctions re-screening job submitted.',
        'poll_url': f'/api/admin/task-status/{task_id}',
        'alt_poll_url': f'/api/tasks/{task_id}',
    })


# Production reseed endpoint REMOVED — database seeding is a CLI-only
# operation (python seed.py) and must never be exposed as an API route.
# Retained as comment for audit trail: removed April 2026.


# ===========================================================================
# Feature flag management (Phase 9.1) — admin only
# ===========================================================================

@admin_bp.route('/admin/flags', methods=['GET'])
@login_required
def api_admin_flags_list():
    """List all defined feature flags + their current global value."""
    if current_user.role != 'admin':
        from app.utils.api_errors import error_response
        return error_response('auth.admin_only', 403)
    from app.utils.feature_flags import list_flags
    return jsonify({'success': True, 'flags': list_flags()})


@admin_bp.route('/admin/flags/<key>', methods=['PUT'])
@login_required
def api_admin_flag_set(key):
    """Set the global value for a flag.

    Body: {"value": <bool|str|int>}
       or {"scope_kind": "user"|"org", "scope_id": <int>, "value": <...>}
       to set a per-user/per-org override.
    """
    if current_user.role != 'admin':
        from app.utils.api_errors import error_response
        return error_response('auth.admin_only', 403)
    from app.utils.feature_flags import set_global, set_override
    from app.utils.helpers import get_request_json
    data = get_request_json() or {}
    if 'value' not in data:
        from app.utils.api_errors import error_response
        return error_response('validation.missing_field', 400, field='value')

    scope_kind = data.get('scope_kind')
    scope_id = data.get('scope_id')

    if scope_kind and scope_id is not None:
        ok = set_override(key, scope_kind=scope_kind, scope_id=int(scope_id), value=data['value'])
    else:
        ok = set_global(key, data['value'])

    if not ok:
        from app.utils.api_errors import error_response
        return error_response('server.unexpected', 500)

    logger.warning(
        f"Feature flag updated: key={key} scope={scope_kind or 'global'}"
        f"{':' + str(scope_id) if scope_id else ''} value={data['value']} "
        f"by admin={current_user.email}"
    )
    return jsonify({'success': True, 'key': key})


# ===========================================================================
# AI cost + helpfulness dashboard (Phase 9.2) — admin only
# ===========================================================================

@admin_bp.route('/admin/ai/dashboard', methods=['GET'])
@login_required
def api_admin_ai_dashboard():
    """Per-endpoint AI cost + helpfulness rollups for the admin observability tab.

    Query: ?hours=24 (default) | max 168.
    Pulls from the ai_call_logs table populated by AIService._record_call.
    """
    if current_user.role != 'admin':
        from app.utils.api_errors import error_response
        return error_response('auth.admin_only', 403)

    try:
        hours = int(request.args.get('hours', 24))
    except (TypeError, ValueError):
        hours = 24
    hours = max(1, min(168, hours))

    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)

    rows = []
    try:
        # Per-endpoint rollup: count, success rate, p50/p95 latency, tokens,
        # helpfulness breakdown.
        result = db.session.execute(
            text("""
                SELECT
                    endpoint,
                    COUNT(*) AS total,
                    SUM(CASE WHEN success THEN 1 ELSE 0 END) AS ok_count,
                    AVG(duration_ms)::INT AS avg_ms,
                    PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY duration_ms)::INT AS p50_ms,
                    PERCENTILE_DISC(0.95) WITHIN GROUP (ORDER BY duration_ms)::INT AS p95_ms,
                    COALESCE(SUM(tokens_in), 0) AS tokens_in,
                    COALESCE(SUM(tokens_out), 0) AS tokens_out,
                    SUM(CASE WHEN helpfulness = 'used' THEN 1 ELSE 0 END) AS used_count,
                    SUM(CASE WHEN helpfulness = 'edited' THEN 1 ELSE 0 END) AS edited_count,
                    SUM(CASE WHEN helpfulness = 'dismissed' THEN 1 ELSE 0 END) AS dismissed_count,
                    SUM(CASE WHEN helpfulness IS NULL THEN 1 ELSE 0 END) AS no_signal_count
                FROM ai_call_logs
                WHERE created_at >= :cutoff
                GROUP BY endpoint
                ORDER BY total DESC
            """),
            {"cutoff": cutoff},
        ).fetchall()

        for r in result:
            total = r[1] or 0
            ok = r[2] or 0
            with_signal = (r[8] or 0) + (r[9] or 0) + (r[10] or 0)
            helpfulness_pct = None
            if with_signal > 0:
                # 'used' counts as 1.0, 'edited' as 0.5, 'dismissed' as 0.0
                weighted = (r[8] or 0) + 0.5 * (r[9] or 0)
                helpfulness_pct = round(100 * weighted / with_signal, 1)
            rows.append({
                'endpoint': r[0],
                'total': total,
                'success_rate_pct': round(100 * ok / total, 1) if total else None,
                'avg_ms': r[3],
                'p50_ms': r[4],
                'p95_ms': r[5],
                'tokens_in': r[6],
                'tokens_out': r[7],
                'helpfulness': {
                    'used': r[8],
                    'edited': r[9],
                    'dismissed': r[10],
                    'no_signal': r[11],
                    'helpfulness_pct': helpfulness_pct,
                },
            })

        # Top users by call volume (top 10).
        top_users_result = db.session.execute(
            text("""
                SELECT user_id, COUNT(*) AS calls,
                       COALESCE(SUM(tokens_in + tokens_out), 0) AS tokens
                FROM ai_call_logs
                WHERE created_at >= :cutoff AND user_id IS NOT NULL
                GROUP BY user_id
                ORDER BY calls DESC
                LIMIT 10
            """),
            {"cutoff": cutoff},
        ).fetchall()
        top_users = [{'user_id': r[0], 'calls': r[1], 'tokens': r[2]} for r in top_users_result]

        # Per-language breakdown.
        lang_result = db.session.execute(
            text("""
                SELECT language, COUNT(*) AS calls
                FROM ai_call_logs
                WHERE created_at >= :cutoff AND language IS NOT NULL
                GROUP BY language
                ORDER BY calls DESC
            """),
            {"cutoff": cutoff},
        ).fetchall()
        by_language = [{'language': r[0], 'calls': r[1]} for r in lang_result]

    except Exception as e:
        logger.error(f"AI dashboard query failed: {e}")
        try:
            db.session.rollback()
        except Exception:
            pass
        rows = []
        top_users = []
        by_language = []

    return jsonify({
        'success': True,
        'window_hours': hours,
        'by_endpoint': rows,
        'top_users': top_users,
        'by_language': by_language,
    })


@admin_bp.route('/admin/flags/me', methods=['GET'])
@login_required
def api_admin_flags_me():
    """Returns the effective values of every flag for the current caller.

    Frontend uses this to gate UI surfaces — e.g. only render the Match
    Engine card when ai.match_engine resolves true for this user/org.
    Available to all logged-in users (the values are read-only and per-user
    by design — no admin gate needed for reading own scope).
    """
    from app.utils.feature_flags import is_enabled, DEFAULT_FLAGS
    out = {}
    for key, spec in DEFAULT_FLAGS.items():
        if spec['kind'] == 'bool':
            out[key] = is_enabled(
                key,
                user_id=current_user.id,
                org_id=getattr(current_user, 'org_id', None),
            )
    return jsonify({'success': True, 'flags': out})
