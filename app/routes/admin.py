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

from app.extensions import db
from app.models import (
    User, Organization, Grant, Application, Assessment,
    Review, ComplianceCheck,
)
from app.middleware import APP_VERSION, APP_START_TIME, APP_BUILD

logger = logging.getLogger('kuja')

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
    uptime_seconds = int((datetime.now(timezone.utc) - APP_START_TIME).total_seconds())
    return jsonify({
        'version': APP_VERSION,
        'build': APP_BUILD,
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

    # System info
    stats['app_version'] = APP_VERSION
    uptime = int((datetime.now(timezone.utc) - APP_START_TIME).total_seconds())
    stats['uptime'] = f"{uptime // 3600}h {(uptime % 3600) // 60}m"
    stats['environment'] = 'production' if os.getenv('DATABASE_URL') else 'development'
    stats['ai_enabled'] = bool(ANTHROPIC_API_KEY and HAS_ANTHROPIC)

    return jsonify({'stats': stats})
