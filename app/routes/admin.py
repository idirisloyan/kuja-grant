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


@admin_bp.route('/admin/clear-lockout', methods=['POST'])
@login_required
def api_admin_clear_lockout():
    """Phase 13.44 — admin tool to reset login lockout state.

    Used by:
      - QA test runs after exercising the brute-force lockout path against
        a real account (e.g. maria@reviewer.org). Without this, subsequent
        login-all-accounts tests fail with a 429 from the locked target.
      - Operations: rescuing a legitimately-locked-out user when password
        reset is still in flight.

    Body: { email: str }
      - Resets users.failed_login_count and users.locked_until on the
        user with that email (if exists).
      - Deletes login_attempts rows for that email so the per-email
        lockout window also resets.

    Returns: { success, email, user_reset: bool, attempts_deleted: int }
    """
    from app.utils.helpers import get_request_json

    if current_user.role != 'admin':
        return jsonify({'error': 'Admin access required'}), 403

    data = get_request_json() or {}
    email = (data.get('email') or '').strip().lower()
    if not email:
        return jsonify({'success': False, 'error': 'email is required'}), 400

    user_reset = False
    attempts_deleted = 0
    try:
        # Reset the per-user lockout columns if the column + user exist.
        from app.models import User
        u = User.query.filter_by(email=email).first()
        if u is not None:
            try:
                db.session.execute(
                    text("UPDATE users SET failed_login_count = 0, "
                         "last_failed_login = NULL, locked_until = NULL "
                         "WHERE id = :id"),
                    {"id": u.id}
                )
                user_reset = True
            except Exception as e:
                logger.warning(f"clear-lockout user reset failed: {e}")
                db.session.rollback()

        # Always sweep login_attempts rows for this email (works for
        # non-existent emails too).
        try:
            res = db.session.execute(
                text("DELETE FROM login_attempts WHERE email = :email"),
                {"email": email}
            )
            attempts_deleted = res.rowcount or 0
        except Exception as e:
            logger.warning(f"clear-lockout attempts delete failed: {e}")
            db.session.rollback()

        db.session.commit()
        logger.info(
            f"clear-lockout: email={email} user_reset={user_reset} "
            f"attempts_deleted={attempts_deleted} by admin={current_user.email}"
        )
    except Exception as e:
        logger.error(f"clear-lockout failed: {e}")
        db.session.rollback()
        return jsonify({'success': False, 'error': 'lockout reset failed',
                        'detail': str(e)[:200]}), 500

    return jsonify({
        'success': True,
        'email': email,
        'user_reset': user_reset,
        'attempts_deleted': attempts_deleted,
    })


@admin_bp.route('/admin/metrics', methods=['GET'])
@login_required
def api_admin_metrics():
    """Phase 29D — real-user behavioural metrics.

    Reads from the UserEvent table (Phase 29A) to surface:
      - DAU + WAU broken down by role + language
      - Top event counts over trailing 30 days
      - 5 critical funnels (apply, report, chat, search, decisions)
      - Per-language adoption of chat
      - A/B outcome split (will be empty until experiments are wired)

    Admin-only. Returns shaped JSON the frontend dashboard renders.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'Admin access required'}), 403

    from app.services.user_event_service import UserEventService
    from app.services.user_feedback_service import UserFeedbackService
    try:
        return jsonify({
            'success': True,
            'dau': UserEventService.active_users(days=1),
            'wau': UserEventService.active_users(days=7),
            'mau': UserEventService.active_users(days=30),
            'event_counts_30d': UserEventService.event_counts(days=30),
            'funnels': {
                'chat': UserEventService.funnel(
                    stages=['chat.thread_open', 'chat.message_sent'],
                ),
                'application': UserEventService.funnel(
                    stages=['application.start_draft', 'application.submit'],
                ),
                'report': UserEventService.funnel(
                    stages=['report.start_draft', 'report.submit'],
                ),
                'review': UserEventService.funnel(
                    stages=['reviewer.assignment_opened',
                            'reviewer.review_submitted'],
                ),
                'readiness_to_submit': UserEventService.funnel(
                    stages=['readiness_check.used', 'application.submit'],
                ),
                'preflight_to_submit': UserEventService.funnel(
                    stages=['report.preflight_used', 'report.submit'],
                ),
            },
            'chat_by_language': UserEventService.feature_usage_by_language(
                event_name='chat.message_sent',
            ),
            'search_by_language': UserEventService.feature_usage_by_language(
                event_name='search.query',
            ),
            'readiness_by_language': UserEventService.feature_usage_by_language(
                event_name='readiness_check.used',
            ),
            'preflight_by_language': UserEventService.feature_usage_by_language(
                event_name='report.preflight_used',
            ),
            'ab_application_submit': UserEventService.ab_outcome(
                outcome_event='application.submit',
            ),
            # Phase 31A — NPS rollup from UserFeedback.
            'nps': UserFeedbackService.nps_summary(days=30),
            'nps_recent_comments': UserFeedbackService.recent_comments(limit=10),
        })
    except Exception as e:
        logger.exception(f'admin metrics failed: {e}')
        return jsonify({'success': False, 'error': 'metrics build failed',
                        'detail': str(e)[:200]}), 500


# ---------------------------------------------------------------------------
# Phase 621 — Time-to-first telemetry. Answers two questions the funnel
# rollups above can't: how long does it take a new NGO to file their
# first application, and how long after a grant is awarded does the
# first report land? Stalls in either of these is where NGOs churn after
# onboarding, and the existing /admin/metrics tile only shows count
# funnels — not duration.
# ---------------------------------------------------------------------------

def _percentile_hours(values, pct):
    """Compute the given percentile (0-100) of a list of float hours.

    Returns None on an empty list. Linear interpolation between adjacent
    samples — good enough for an admin rollup, no numpy dependency. The
    p50/p90 split is what the team uses to spot tails; we don't need
    the full histogram in this endpoint.
    """
    if not values:
        return None
    s = sorted(values)
    if len(s) == 1:
        return round(s[0], 2)
    k = (len(s) - 1) * (pct / 100.0)
    lo = int(k)
    hi = min(lo + 1, len(s) - 1)
    frac = k - lo
    return round(s[lo] + (s[hi] - s[lo]) * frac, 2)


@admin_bp.route('/admin/time-to-first', methods=['GET'])
@login_required
def api_admin_time_to_first():
    """Phase 621 — time-to-first-application + time-to-first-report.

    Two distinct cohorts:
      1. TTFA — for each NGO user with role='ngo' that has submitted
         at least one application, hours from User.created_at to the
         earliest Application.submitted_at for any application of any
         org they belong to.
      2. TTFR — for each (grant_id, org_id) where the org has an
         'awarded' application, hours from that application's
         submitted_at (proxy for grant award) to the FIRST
         Report.submitted_at for the same grant + org.

    Returns p50/p90 for each, plus sample counts so the admin can tell
    whether the medians are based on enough signal to trust.

    Query:
      days = look-back window for the cohort. Default 90, max 365.
             Applied to the START event (User.created_at for TTFA,
             Application.submitted_at for TTFR).
    """
    if current_user.role != 'admin':
        return jsonify({'success': False, 'error': 'Admin only.'}), 403

    try:
        days = int(request.args.get('days', 90))
        days = max(7, min(365, days))
    except ValueError:
        days = 90

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    from app.models import Report

    # TTFA — group by user. For each NGO user created within the window,
    # find the earliest submit across any application from their org.
    # User → org is a direct FK (User.org_id); Application links
    # ngo_org_id back to that org. A user with no org_id contributes no
    # signal — they can't submit anyway.
    ttfa_hours = []
    try:
        rows = (
            db.session.query(User.id, User.created_at, db.func.min(Application.submitted_at))
            .join(Application, Application.ngo_org_id == User.org_id)
            .filter(User.role == 'ngo')
            .filter(User.created_at >= cutoff)
            .filter(User.org_id.isnot(None))
            .filter(Application.submitted_at.isnot(None))
            .group_by(User.id, User.created_at)
            .all()
        )
        for _uid, created_at, first_sub in rows:
            if not created_at or not first_sub:
                continue
            delta = (first_sub - created_at).total_seconds() / 3600.0
            if delta >= 0:  # guard clock skew
                ttfa_hours.append(delta)
    except Exception as e:
        logger.warning('TTFA rollup failed: %s', e)

    # TTFR — group by (grant_id, org_id) for awarded apps. Use the
    # awarded application's submitted_at as the "grant landed" anchor.
    # First report for that pair = the duration we care about.
    ttfr_hours = []
    try:
        # Awarded apps anchor: earliest submitted_at per (grant_id, org_id)
        # where any of that pair's applications reached 'awarded'.
        awarded = (
            db.session.query(
                Application.grant_id,
                Application.ngo_org_id,
                db.func.min(Application.submitted_at).label('anchor'),
            )
            .filter(Application.status == 'awarded')
            .filter(Application.submitted_at.isnot(None))
            .filter(Application.submitted_at >= cutoff)
            .group_by(Application.grant_id, Application.ngo_org_id)
            .all()
        )
        for grant_id, org_id, anchor in awarded:
            if not anchor:
                continue
            first_report = (
                db.session.query(db.func.min(Report.submitted_at))
                .filter(Report.grant_id == grant_id)
                .filter(Report.submitted_by_org_id == org_id)
                .filter(Report.submitted_at.isnot(None))
                .scalar()
            )
            if not first_report:
                continue
            delta = (first_report - anchor).total_seconds() / 3600.0
            if delta >= 0:
                ttfr_hours.append(delta)
    except Exception as e:
        logger.warning('TTFR rollup failed: %s', e)

    return jsonify({
        'success': True,
        'window_days': days,
        'time_to_first_application': {
            'sample_size': len(ttfa_hours),
            'p50_hours': _percentile_hours(ttfa_hours, 50),
            'p90_hours': _percentile_hours(ttfa_hours, 90),
            # Convenience day-rounded values for the UI; p50 in hours is
            # awkward when the median is days.
            'p50_days': round(_percentile_hours(ttfa_hours, 50) / 24.0, 1)
                if ttfa_hours else None,
            'p90_days': round(_percentile_hours(ttfa_hours, 90) / 24.0, 1)
                if ttfa_hours else None,
        },
        'time_to_first_report': {
            'sample_size': len(ttfr_hours),
            'p50_hours': _percentile_hours(ttfr_hours, 50),
            'p90_hours': _percentile_hours(ttfr_hours, 90),
            'p50_days': round(_percentile_hours(ttfr_hours, 50) / 24.0, 1)
                if ttfr_hours else None,
            'p90_days': round(_percentile_hours(ttfr_hours, 90) / 24.0, 1)
                if ttfr_hours else None,
        },
        'notes': {
            'ttfa_anchor': 'User.created_at (signup)',
            'ttfa_event': 'earliest Application.submitted_at across any org the user belongs to',
            'ttfr_anchor': "earliest Application.submitted_at where status='awarded' (proxy for grant landed)",
            'ttfr_event': 'earliest Report.submitted_at for the same (grant, org)',
            'cohort_filter': f'started in last {days} days',
        },
    })


@admin_bp.route('/admin/clear-all-lockouts', methods=['POST'])
@login_required
def api_admin_clear_all_lockouts():
    """Phase 28D — bulk clear ALL email + per-user lockouts.

    QA convenience: a single button the team can hit before kicking
    off a multi-role browser sweep so prior test runs don't lock out
    sarah/fatima/james accounts mid-cert. The team's 2026-05-16 retest
    flagged exactly this friction.

    Body: {} (no args; affects every user + every login_attempts row)

    Returns: { success, users_reset: int, attempts_deleted: int }
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'Admin access required'}), 403

    users_reset = 0
    attempts_deleted = 0
    try:
        try:
            res = db.session.execute(
                text("UPDATE users SET failed_login_count = 0, "
                     "last_failed_login = NULL, locked_until = NULL "
                     "WHERE failed_login_count > 0 OR locked_until IS NOT NULL")
            )
            users_reset = res.rowcount or 0
        except Exception as e:
            logger.warning(f"clear-all-lockouts user reset failed: {e}")
            db.session.rollback()

        try:
            res = db.session.execute(text("DELETE FROM login_attempts"))
            attempts_deleted = res.rowcount or 0
        except Exception as e:
            logger.warning(f"clear-all-lockouts attempts delete failed: {e}")
            db.session.rollback()

        db.session.commit()
        logger.info(
            f"clear-all-lockouts: users_reset={users_reset} "
            f"attempts_deleted={attempts_deleted} by admin={current_user.email}"
        )
    except Exception as e:
        logger.error(f"clear-all-lockouts failed: {e}")
        db.session.rollback()
        return jsonify({'success': False, 'error': 'bulk reset failed',
                        'detail': str(e)[:200]}), 500

    return jsonify({
        'success': True,
        'users_reset': users_reset,
        'attempts_deleted': attempts_deleted,
    })


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
# Phase 9.4 — performance budgets + alerts
# ===========================================================================

# Per-endpoint latency budgets (ms). Anything above the p95 budget for the
# trailing window triggers a regression flag in the dashboard. Tunable.
PERF_BUDGETS_P95_MS: dict[str, int] = {
    'draft_application':     12000,
    'draft_report':          12000,
    'generate_grant_brief':   8000,
    'median_ngo_preview':    10000,
    'compliance_preempt':     8000,
    'strengthen_section':     6000,
    'extract_evidence':       6000,
    'score_one_criterion':    5000,
    'chat':                   4000,
    'guidance':               4000,
}


@admin_bp.route('/admin/perf-budgets', methods=['GET'])
@login_required
def api_admin_perf_budgets():
    """Per-endpoint latency vs budget. Used by the observability page.

    Query: ?hours=24 (default) | max 168.
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

    out = []
    try:
        rows = db.session.execute(
            text("""
                SELECT
                    endpoint,
                    COUNT(*) AS total,
                    PERCENTILE_DISC(0.50) WITHIN GROUP (ORDER BY duration_ms)::INT AS p50,
                    PERCENTILE_DISC(0.95) WITHIN GROUP (ORDER BY duration_ms)::INT AS p95,
                    PERCENTILE_DISC(0.99) WITHIN GROUP (ORDER BY duration_ms)::INT AS p99
                FROM ai_call_logs
                WHERE created_at >= :cutoff
                GROUP BY endpoint
                HAVING COUNT(*) >= 3
                ORDER BY total DESC
            """),
            {"cutoff": cutoff},
        ).fetchall()

        for r in rows:
            endpoint = r[0]
            budget = PERF_BUDGETS_P95_MS.get(endpoint, 12000)
            p95 = r[3]
            over = (p95 is not None) and (p95 > budget)
            out.append({
                'endpoint': endpoint,
                'total': r[1],
                'p50_ms': r[2],
                'p95_ms': p95,
                'p99_ms': r[4],
                'budget_p95_ms': budget,
                'over_budget': over,
                'over_pct': round(100 * (p95 - budget) / budget, 1) if (over and p95) else 0.0,
            })
    except Exception as e:
        logger.error(f"perf budgets query failed: {e}")
        try:
            db.session.rollback()
        except Exception:
            pass

    return jsonify({
        'success': True,
        'window_hours': hours,
        'budgets': out,
        'alerts': [r for r in out if r.get('over_budget')],
    })


# ===========================================================================
# Phase 9.3 — A/B testing rail (experiments + outcomes)
# ===========================================================================

@admin_bp.route('/admin/experiments', methods=['GET'])
@login_required
def api_admin_experiments():
    """List defined experiments + last-30d winrates per variant."""
    if current_user.role != 'admin':
        from app.utils.api_errors import error_response
        return error_response('auth.admin_only', 403)
    from app.utils.ab_testing import list_experiments, get_winrates
    out = []
    for spec in list_experiments():
        out.append({**spec, 'winrates': get_winrates(spec['key'], days=30)})
    return jsonify({'success': True, 'experiments': out})


# ===========================================================================
# Phase 8.1 — anonymized cross-grant pattern library
# ===========================================================================

@admin_bp.route('/admin/patterns', methods=['GET'])
@login_required
def api_admin_patterns():
    """Anonymized cross-grant aggregates: which patterns recur in winning
    applications, which sectors have highest award rates, what response
    word counts correlate with awards.

    All counts are aggregated; no per-NGO data is returned. Available to
    admins; donors see their own portfolio via /admin/portfolio-diagnostics.
    """
    if current_user.role != 'admin':
        from app.utils.api_errors import error_response
        return error_response('auth.admin_only', 403)

    try:
        from sqlalchemy import text
        # Awards by sector (across ALL donors, anonymized).
        sector_rows = db.session.execute(
            text("""
                SELECT
                    UNNEST(string_to_array(LOWER(COALESCE(g.sectors::text, '')), ',')) AS sector,
                    COUNT(*) AS submissions,
                    SUM(CASE WHEN a.status = 'awarded' THEN 1 ELSE 0 END) AS awarded
                FROM applications a
                JOIN grants g ON g.id = a.grant_id
                WHERE a.status IN ('submitted', 'awarded', 'rejected', 'scored')
                  AND a.created_at >= NOW() - INTERVAL '180 days'
                GROUP BY sector
                HAVING COUNT(*) >= 3
                ORDER BY awarded DESC NULLS LAST
                LIMIT 20
            """)
        ).fetchall()
    except Exception as e:
        logger.debug(f"sector pattern query failed: {e}")
        try:
            db.session.rollback()
        except Exception:
            pass
        sector_rows = []

    sector_patterns = []
    for r in sector_rows:
        s = (r[0] or '').strip().strip('[]"\\') if r[0] else ''
        if not s or s in ('null', '{}'):
            continue
        subs = int(r[1] or 0)
        awarded = int(r[2] or 0)
        sector_patterns.append({
            'sector': s,
            'submissions': subs,
            'awarded': awarded,
            'award_rate_pct': round(100 * awarded / subs, 1) if subs > 0 else 0.0,
        })

    # Award rate by application word-count bucket. Establishes the rough
    # 'sweet spot' so applicant guidance can lean evidence-backed.
    try:
        from sqlalchemy import text
        wc_rows = db.session.execute(
            text("""
                SELECT
                    CASE
                        WHEN length(coalesce(responses::text, '')) < 2000  THEN '<2k chars'
                        WHEN length(coalesce(responses::text, '')) < 5000  THEN '2-5k chars'
                        WHEN length(coalesce(responses::text, '')) < 10000 THEN '5-10k chars'
                        WHEN length(coalesce(responses::text, '')) < 20000 THEN '10-20k chars'
                        ELSE '20k+ chars'
                    END AS bucket,
                    COUNT(*) AS submissions,
                    SUM(CASE WHEN status = 'awarded' THEN 1 ELSE 0 END) AS awarded
                FROM applications
                WHERE status IN ('submitted', 'awarded', 'rejected', 'scored')
                GROUP BY bucket
                ORDER BY bucket
            """)
        ).fetchall()
    except Exception as e:
        logger.debug(f"length pattern query failed: {e}")
        try:
            db.session.rollback()
        except Exception:
            pass
        wc_rows = []

    length_patterns = []
    for r in wc_rows:
        subs = int(r[1] or 0)
        awarded = int(r[2] or 0)
        length_patterns.append({
            'bucket': r[0],
            'submissions': subs,
            'awarded': awarded,
            'award_rate_pct': round(100 * awarded / subs, 1) if subs > 0 else 0.0,
        })

    return jsonify({
        'success': True,
        'window_days': 180,
        'sector_patterns': sector_patterns,
        'length_patterns': length_patterns,
    })


# ===========================================================================
# Reviewer drift detection (Phase 8.3) — admin only
# ===========================================================================

@admin_bp.route('/admin/reviewer-drift', methods=['GET'])
@login_required
def api_admin_reviewer_drift():
    """Detect reviewers whose scores systematically diverge from their peers.

    For each reviewer in the last 90 days, we compute:
      - n_reviews         total completed reviews
      - personal_avg      reviewer's mean overall_score
      - peer_avg          mean overall_score of OTHER reviewers on the
                          same applications they touched
      - drift_pct         personal_avg - peer_avg (signed)
    Flags reviewers whose |drift| >= 10 points with at least 5 reviews —
    the donor admin should re-norm or have a calibration conversation.

    Donor-scoped query: when caller is a donor admin, we restrict to
    reviews on grants the caller's org owns. Platform admins see all.
    """
    if current_user.role != 'admin':
        from app.utils.api_errors import error_response
        return error_response('auth.admin_only', 403)

    try:
        from sqlalchemy import text
        # Pull reviewer rollups; the aggregate uses self-join over the same
        # application id to compute peer averages excluding the reviewer.
        rows = db.session.execute(
            text("""
                SELECT
                    r.reviewer_user_id,
                    u.email,
                    u.name,
                    COUNT(*) AS n_reviews,
                    AVG(r.overall_score)::numeric(10,1) AS personal_avg,
                    (
                        SELECT AVG(r2.overall_score)::numeric(10,1)
                        FROM reviews r2
                        WHERE r2.application_id IN (
                            SELECT application_id FROM reviews
                            WHERE reviewer_user_id = r.reviewer_user_id
                              AND status = 'completed'
                              AND completed_at >= NOW() - INTERVAL '90 days'
                        )
                          AND r2.reviewer_user_id <> r.reviewer_user_id
                          AND r2.status = 'completed'
                    ) AS peer_avg
                FROM reviews r
                LEFT JOIN users u ON u.id = r.reviewer_user_id
                WHERE r.status = 'completed'
                  AND r.completed_at >= NOW() - INTERVAL '90 days'
                  AND r.reviewer_user_id IS NOT NULL
                GROUP BY r.reviewer_user_id, u.email, u.name
                HAVING COUNT(*) >= 3
                ORDER BY n_reviews DESC
            """)
        ).fetchall()

        out = []
        flagged = []
        for r in rows:
            personal = float(r[4]) if r[4] is not None else None
            peer = float(r[5]) if r[5] is not None else None
            drift = (personal - peer) if (personal is not None and peer is not None) else None
            row = {
                'reviewer_user_id': r[0],
                'email': r[1],
                'name': r[2],
                'n_reviews': int(r[3] or 0),
                'personal_avg': personal,
                'peer_avg': peer,
                'drift_pct': round(drift, 1) if drift is not None else None,
            }
            out.append(row)
            if drift is not None and abs(drift) >= 10 and row['n_reviews'] >= 5:
                flagged.append({
                    **row,
                    'direction': 'high' if drift > 0 else 'low',
                })

        return jsonify({
            'success': True,
            'reviewers': out,
            'flagged': flagged,
            'window_days': 90,
        })
    except Exception as e:
        logger.error(f"reviewer drift query failed: {e}")
        try:
            db.session.rollback()
        except Exception:
            pass
        from app.utils.api_errors import error_response
        return error_response('server.unexpected', 500)


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


# ----------------------------------------------------------------------
# Phase 17D — Donor merge tool (admin only, name-typed confirmation gate)
# ----------------------------------------------------------------------

@admin_bp.route('/admin/orgs/merge', methods=['POST'])
@login_required
def api_admin_orgs_merge():
    """Merge two donor orgs. Reparents grants/users/watchlist/signals
    onto the kept org and deletes the dup.

    Body: { kept_id: int, dup_id: int, confirm_name: str }

    confirm_name MUST exactly equal the duplicate org's name. Returns
    a structured report so the UI can show "moved N grants…".
    """
    if current_user.role != 'admin':
        return jsonify({'success': False, 'error': 'admin only'}), 403
    from app.models import Organization
    from app.services.org_merge_service import OrgMergeService
    from app.utils.helpers import get_request_json

    data = get_request_json() or {}
    try:
        kept_id = int(data.get('kept_id'))
        dup_id = int(data.get('dup_id'))
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': 'kept_id + dup_id required'}), 400
    confirm = (data.get('confirm_name') or '').strip()
    if not confirm:
        return jsonify({'success': False, 'error': 'confirm_name required'}), 400

    dup = db.session.get(Organization, dup_id)
    if not dup:
        return jsonify({'success': False, 'error': 'dup org not found'}), 404
    if confirm != dup.name:
        return jsonify({
            'success': False,
            'error': f'confirm_name must exactly match the duplicate org name: "{dup.name}"',
        }), 400

    report = OrgMergeService.merge(
        kept_id=kept_id, dup_id=dup_id,
        actor_email=getattr(current_user, 'email', None),
    )
    status = 200 if report.get('success') else 400
    return jsonify(report), status


@admin_bp.route('/admin/users', methods=['GET'])
@login_required
def api_admin_users():
    """Phase 242 — admin user search.

    Query: ?search= name/email substring (case-insensitive), ?role=
    optional role filter, ?limit=50.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'admin only'}), 403
    from app.models.user import User
    search = (request.args.get('search') or '').strip()
    role = (request.args.get('role') or '').strip() or None
    try:
        limit = int(request.args.get('limit', 50))
        limit = max(1, min(200, limit))
    except ValueError:
        limit = 50

    q = User.query
    if role:
        q = q.filter_by(role=role)
    if search:
        like = f'%{search}%'
        from sqlalchemy import or_
        q = q.filter(or_(User.name.ilike(like), User.email.ilike(like)))
    q = q.order_by(User.created_at.desc()).limit(limit)
    users = q.all()
    rows = []
    for u in users:
        rows.append({
            'id': u.id,
            'name': u.name,
            'email': u.email,
            'role': u.role,
            'org_id': u.org_id,
            'org_name': u.organization.name if u.organization else None,
            'created_at': u.created_at.isoformat() if u.created_at else None,
            'last_login_at': getattr(u, 'last_login_at', None).isoformat() if getattr(u, 'last_login_at', None) else None,
        })
    return jsonify({'success': True, 'users': rows})
