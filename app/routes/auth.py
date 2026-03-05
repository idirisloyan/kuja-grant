from datetime import datetime, timezone, timedelta
from sqlalchemy import text

from flask import Blueprint, request, jsonify, session
from flask_login import login_required, login_user, logout_user, current_user
from app.extensions import db
from app.models import User
from app.utils.helpers import get_request_json
import logging

logger = logging.getLogger('kuja')

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

# Brute-force lockout configuration
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_WINDOW_MINUTES = 5       # Rolling window for counting failures
LOCKOUT_DURATION_MINUTES = 15    # How long the lockout lasts

# ---------- IP-based rate limiting (database-backed, works across all workers) ----------
IP_RATE_LIMIT_WINDOW = 300       # 5-minute sliding window (seconds)
IP_RATE_LIMIT_MAX = 50           # max login attempts per IP across all workers
_ip_table_ready = None


def _ensure_ip_table():
    """Create login_attempts table if it doesn't exist (auto-migrate)."""
    global _ip_table_ready
    if _ip_table_ready:
        return True
    try:
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS login_attempts (
                id SERIAL PRIMARY KEY,
                ip VARCHAR(45) NOT NULL,
                attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        # Index for fast lookups by IP + time
        db.session.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time
            ON login_attempts (ip, attempted_at)
        """))
        db.session.commit()
        _ip_table_ready = True
        logger.info("login_attempts table ready for IP rate limiting")
        return True
    except Exception as e:
        logger.error(f"Failed to create login_attempts table: {e}")
        db.session.rollback()
        _ip_table_ready = False
        return False


def _check_ip_rate_limit(ip):
    """Check if IP has exceeded login attempt threshold (database-backed)."""
    if not _ensure_ip_table():
        return False  # Fail open if table isn't ready
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=IP_RATE_LIMIT_WINDOW)
        result = db.session.execute(
            text("SELECT COUNT(*) FROM login_attempts WHERE ip = :ip AND attempted_at > :cutoff"),
            {"ip": ip, "cutoff": cutoff}
        )
        count = result.scalar() or 0
        return count >= IP_RATE_LIMIT_MAX
    except Exception as e:
        logger.error(f"IP rate limit check failed: {e}")
        db.session.rollback()
        return False


def _record_ip_attempt(ip):
    """Record a login attempt for this IP (database-backed)."""
    if not _ensure_ip_table():
        return
    try:
        db.session.execute(
            text("INSERT INTO login_attempts (ip, attempted_at) VALUES (:ip, :ts)"),
            {"ip": ip, "ts": datetime.now(timezone.utc)}
        )
        db.session.commit()
        # Prune old records periodically (every ~50 inserts, clean entries > 10 min old)
        import random
        if random.random() < 0.02:
            cutoff = datetime.now(timezone.utc) - timedelta(seconds=IP_RATE_LIMIT_WINDOW * 2)
            db.session.execute(
                text("DELETE FROM login_attempts WHERE attempted_at < :cutoff"),
                {"cutoff": cutoff}
            )
            db.session.commit()
    except Exception as e:
        logger.error(f"IP attempt recording failed: {e}")
        db.session.rollback()


def _has_lockout_columns():
    """Check whether the users table has lockout columns (migration may be pending)."""
    try:
        inspector = db.inspect(db.engine)
        columns = [c['name'] for c in inspector.get_columns('users')]
        return 'failed_login_count' in columns and 'locked_until' in columns
    except Exception:
        return False


# Cache the check so we don't inspect every request
_lockout_ready = None


def _lockout_enabled():
    global _lockout_ready
    if _lockout_ready is None:
        try:
            _lockout_ready = _has_lockout_columns()
            if _lockout_ready:
                logger.info("Database lockout columns available — brute-force protection active")
            else:
                logger.warning("Database lockout columns not found — brute-force protection inactive (run migration)")
        except Exception:
            _lockout_ready = False
    return _lockout_ready


def _safe_get(user, attr, default=None):
    """Safely access a lockout attribute that may not exist in the database."""
    try:
        val = getattr(user, attr, default)
        return val if val is not None else default
    except Exception:
        return default


@auth_bp.route('/login', methods=['POST'])
def api_login():
    """Authenticate user with email and password. Database-backed rate limiting."""
    data = get_request_json()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'success': False, 'error': 'Email and password are required'}), 400

    # --- IP-based rate limiting (catches brute-force against ANY email, existing or not) ---
    # Railway uses multiple proxy nodes, so request.remote_addr gives proxy IPs.
    # Extract the real client IP from X-Forwarded-For (first entry = original client).
    xff = request.headers.get('X-Forwarded-For', '')
    if xff:
        client_ip = xff.split(',')[0].strip()
    else:
        client_ip = request.remote_addr or '0.0.0.0'
    logger.debug(f"Login attempt: XFF={xff!r}, remote_addr={request.remote_addr}, client_ip={client_ip}")
    if _check_ip_rate_limit(client_ip):
        logger.warning(f"IP rate limit exceeded: {client_ip} (>{IP_RATE_LIMIT_MAX} attempts in {IP_RATE_LIMIT_WINDOW}s)")
        return jsonify({
            'success': False,
            'error': 'Too many login attempts from this address. Please wait a few minutes before trying again.',
        }), 429

    _record_ip_attempt(client_ip)

    user = User.query.filter_by(email=email).first()

    lockout_active = _lockout_enabled()

    # --- Database-backed lockout check (works across all Gunicorn workers) ---
    if lockout_active and user:
        try:
            locked_until = _safe_get(user, 'locked_until')
            if locked_until:
                now = datetime.now(timezone.utc)
                # Handle timezone-naive timestamps from DB
                if locked_until.tzinfo is None:
                    locked_until = locked_until.replace(tzinfo=timezone.utc)
                if now < locked_until:
                    remaining_seconds = int((locked_until - now).total_seconds())
                    remaining_minutes = max(1, remaining_seconds // 60)
                    logger.warning(
                        f"Login locked out: {email} from {request.remote_addr} "
                        f"({remaining_seconds}s remaining)"
                    )
                    return jsonify({
                        'success': False,
                        'error': f'Too many failed attempts. Account locked for {remaining_minutes} minute(s). Try again later.',
                    }), 429
                else:
                    # Lockout expired — reset
                    user.failed_login_count = 0
                    user.locked_until = None
                    db.session.commit()
        except Exception as e:
            logger.error(f"Lockout check failed: {e}")
            db.session.rollback()

    # --- Validate credentials ---
    if not user or not user.check_password(password):
        if lockout_active and user:
            try:
                now = datetime.now(timezone.utc)
                window_start = now - timedelta(minutes=LOCKOUT_WINDOW_MINUTES)

                # Reset counter if last failure was outside the window
                last_failed = _safe_get(user, 'last_failed_login')
                if last_failed:
                    if last_failed.tzinfo is None:
                        last_failed = last_failed.replace(tzinfo=timezone.utc)
                    if last_failed < window_start:
                        user.failed_login_count = 0

                user.failed_login_count = (_safe_get(user, 'failed_login_count', 0)) + 1
                user.last_failed_login = now

                remaining = max(0, MAX_LOGIN_ATTEMPTS - user.failed_login_count)

                if user.failed_login_count >= MAX_LOGIN_ATTEMPTS:
                    user.locked_until = now + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
                    db.session.commit()
                    logger.warning(
                        f"Account locked: {email} from {request.remote_addr} "
                        f"after {user.failed_login_count} failures"
                    )
                    return jsonify({
                        'success': False,
                        'error': f'Too many failed attempts. Account locked for {LOCKOUT_DURATION_MINUTES} minutes.',
                    }), 429

                db.session.commit()

                msg = 'Invalid email or password'
                if remaining <= 2 and remaining > 0:
                    msg += f'. {remaining} attempt(s) remaining before lockout.'
                logger.warning(
                    f"Failed login: {email} from {request.remote_addr} "
                    f"({remaining} attempts left)"
                )
            except Exception as e:
                logger.error(f"Lockout recording failed: {e}")
                db.session.rollback()
                msg = 'Invalid email or password'
        else:
            if not user:
                logger.warning(f"Failed login (unknown email): {email} from {request.remote_addr}")
            msg = 'Invalid email or password'

        return jsonify({'success': False, 'error': msg}), 401

    if not user.is_active:
        return jsonify({'success': False, 'error': 'Account is deactivated'}), 403

    # --- Success — reset lockout state and log in ---
    if lockout_active:
        try:
            user.failed_login_count = 0
            user.last_failed_login = None
            user.locked_until = None
            db.session.commit()
        except Exception as e:
            logger.error(f"Lockout reset failed: {e}")
            db.session.rollback()

    session.permanent = True
    login_user(user, remember=True)
    logger.info(f"User logged in: {user.email} (role: {user.role}) from {request.remote_addr}")
    return jsonify({'success': True, 'user': user.to_dict(include_org=True)})


@auth_bp.route('/logout', methods=['POST'])
@login_required
def api_logout():
    """Log out the current user."""
    logger.info(f"User logged out: {current_user.email}")
    logout_user()
    return jsonify({'success': True, 'message': 'Logged out successfully'})


@auth_bp.route('/me', methods=['GET'])
@login_required
def api_me():
    """Return current authenticated user info."""
    return jsonify({'user': current_user.to_dict(include_org=True)})


@auth_bp.route('/language', methods=['PUT'])
@login_required
def api_set_language():
    """Update the current user's preferred language."""
    data = get_request_json()
    lang = data.get('language', 'en')
    if lang not in ('en', 'ar', 'fr', 'es'):
        return jsonify({'success': False, 'error': 'Unsupported language'}), 400
    current_user.language = lang
    db.session.commit()
    logger.info(f"User {current_user.email} changed language to {lang}")
    return jsonify({'success': True, 'language': lang})
