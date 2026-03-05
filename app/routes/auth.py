import threading
from collections import defaultdict
from datetime import datetime, timezone, timedelta

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

# ---------- IP-based rate limiting (works for all emails, existing or not) ----------
# In-memory per-process; with gthread workers all threads share this dict.
# Provides defense-in-depth alongside the per-account DB lockout.
IP_RATE_LIMIT_WINDOW = 300       # 5-minute sliding window
IP_RATE_LIMIT_MAX = 10           # max login attempts per IP per worker process
                                 # With N gunicorn workers, effective global limit is ~N*10
_ip_attempts = defaultdict(list) # {ip: [timestamp, ...]}
_ip_lock = threading.Lock()


def _check_ip_rate_limit(ip):
    """Return True if the IP has exceeded the login attempt threshold."""
    now = datetime.now(timezone.utc).timestamp()
    cutoff = now - IP_RATE_LIMIT_WINDOW
    with _ip_lock:
        attempts = _ip_attempts[ip]
        # Prune old entries
        _ip_attempts[ip] = [t for t in attempts if t > cutoff]
        return len(_ip_attempts[ip]) >= IP_RATE_LIMIT_MAX


def _record_ip_attempt(ip):
    """Record a login attempt for this IP address."""
    now = datetime.now(timezone.utc).timestamp()
    with _ip_lock:
        _ip_attempts[ip].append(now)


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
    client_ip = request.remote_addr or '0.0.0.0'
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
