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
IP_RATE_LIMIT_MAX = 20           # max login attempts per IP in sliding window
_ip_table_ready = None


def _ensure_ip_table():
    """Create login_attempts table if it doesn't exist (auto-migrate).
    Includes email column for per-email lockout (works for non-existent accounts)."""
    global _ip_table_ready
    if _ip_table_ready:
        return True
    try:
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS login_attempts (
                id SERIAL PRIMARY KEY,
                ip VARCHAR(45) NOT NULL,
                email VARCHAR(255),
                attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        db.session.commit()

        # Auto-migrate: add email column if table existed before this change
        try:
            db.session.execute(text(
                "ALTER TABLE login_attempts ADD COLUMN email VARCHAR(255)"
            ))
            db.session.commit()
        except Exception:
            db.session.rollback()  # Column already exists — safe to ignore

        # Indexes for fast lookups
        db.session.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time
            ON login_attempts (ip, attempted_at)
        """))
        db.session.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time
            ON login_attempts (email, attempted_at)
        """))
        db.session.commit()
        _ip_table_ready = True
        logger.info("login_attempts table ready for IP + email rate limiting")
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


def _record_ip_attempt(ip, email=None):
    """Record a login attempt for this IP and email (database-backed)."""
    if not _ensure_ip_table():
        return
    try:
        db.session.execute(
            text("INSERT INTO login_attempts (ip, email, attempted_at) VALUES (:ip, :email, :ts)"),
            {"ip": ip, "email": email, "ts": datetime.now(timezone.utc)}
        )
        db.session.commit()
        # Prune old records periodically (every ~50 inserts)
        # Cutoff must cover the longest window: LOCKOUT_DURATION_MINUTES (15 min)
        import random
        if random.random() < 0.02:
            cutoff = datetime.now(timezone.utc) - timedelta(
                seconds=max(IP_RATE_LIMIT_WINDOW * 2, LOCKOUT_DURATION_MINUTES * 60 * 2)
            )
            db.session.execute(
                text("DELETE FROM login_attempts WHERE attempted_at < :cutoff"),
                {"cutoff": cutoff}
            )
            db.session.commit()
    except Exception as e:
        logger.error(f"IP attempt recording failed: {e}")
        db.session.rollback()


def _check_email_lockout(email):
    """Check if email has exceeded login attempt threshold (database-backed).

    Works for BOTH existing and non-existing accounts, preventing:
    - Brute force against any email address
    - Email enumeration via lockout behavior differences

    Uses a rolling window of LOCKOUT_DURATION_MINUTES (15 min).
    Once MAX_LOGIN_ATTEMPTS (5) are recorded, the email stays locked
    until the oldest relevant attempt ages out of the window.
    """
    if not _ensure_ip_table():
        return False
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=LOCKOUT_DURATION_MINUTES)
        result = db.session.execute(
            text("SELECT COUNT(*) FROM login_attempts WHERE email = :email AND attempted_at > :cutoff"),
            {"email": email, "cutoff": cutoff}
        )
        count = result.scalar() or 0
        return count >= MAX_LOGIN_ATTEMPTS
    except Exception as e:
        logger.error(f"Email lockout check failed: {e}")
        db.session.rollback()
        return False


def _lockout_enabled():
    """Check whether the users table has lockout columns (migration may be pending).
    No caching — SQLAlchemy's inspector caches internally, and stale cache
    caused lockout to be permanently disabled in some workers."""
    try:
        inspector = db.inspect(db.engine)
        columns = [c['name'] for c in inspector.get_columns('users')]
        return 'failed_login_count' in columns and 'locked_until' in columns
    except Exception:
        return False


@auth_bp.route('/login', methods=['POST'])
def api_login():
    """Authenticate user with email and password.

    Lockout uses ATOMIC SQL (not ORM read-then-write) to prevent race conditions
    across Gunicorn's 4 workers × 4 threads. Every counter increment is a single
    UPDATE ... SET failed_login_count = failed_login_count + 1 statement — the
    database guarantees no lost increments under concurrency.
    """
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
    logger.info(f"Login IP: XFF={xff!r}, client_ip={client_ip}")
    if _check_ip_rate_limit(client_ip):
        logger.warning(f"IP rate limit exceeded: {client_ip} (>{IP_RATE_LIMIT_MAX} attempts in {IP_RATE_LIMIT_WINDOW}s)")
        return jsonify({
            'success': False,
            'error': 'Too many login attempts from this address. Please wait a few minutes before trying again.',
        }), 429

    # --- Per-email lockout (catches brute-force against ANY email, existing or not) ---
    # This prevents email enumeration: both existing and non-existing emails lock at the same threshold.
    if _check_email_lockout(email):
        logger.warning(f"Email lockout: {email} from {client_ip} (>={MAX_LOGIN_ATTEMPTS} attempts in {LOCKOUT_DURATION_MINUTES}min)")
        _record_ip_attempt(client_ip, email)
        return jsonify({
            'success': False,
            'error': f'Too many failed attempts. Account locked for {LOCKOUT_DURATION_MINUTES} minutes.',
        }), 429

    _record_ip_attempt(client_ip, email)

    user = User.query.filter_by(email=email).first()

    lockout_active = _lockout_enabled()

    # --- Database-backed lockout check (works across all Gunicorn workers) ---
    if lockout_active and user:
        try:
            # Read lockout state directly from DB (bypass ORM cache)
            row = db.session.execute(
                text("SELECT locked_until FROM users WHERE id = :id"),
                {"id": user.id}
            ).fetchone()
            locked_until = row[0] if row else None
            if locked_until:
                now = datetime.now(timezone.utc)
                # Handle timezone-naive timestamps from DB
                if locked_until.tzinfo is None:
                    locked_until = locked_until.replace(tzinfo=timezone.utc)
                if now < locked_until:
                    remaining_seconds = int((locked_until - now).total_seconds())
                    remaining_minutes = max(1, remaining_seconds // 60)
                    logger.warning(
                        f"Login locked out: {email} from {client_ip} "
                        f"({remaining_seconds}s remaining)"
                    )
                    return jsonify({
                        'success': False,
                        'error': f'Too many failed attempts. Account locked for {remaining_minutes} minute(s). Try again later.',
                    }), 429
                else:
                    # Lockout expired — atomic reset
                    db.session.execute(
                        text("UPDATE users SET failed_login_count = 0, locked_until = NULL "
                             "WHERE id = :id"),
                        {"id": user.id}
                    )
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

                # Atomic: if last failure was outside the rolling window, reset counter to 1.
                # Otherwise, increment counter by 1. Both are single SQL statements.
                reset_result = db.session.execute(
                    text("UPDATE users SET failed_login_count = 1, last_failed_login = :now "
                         "WHERE id = :id AND (last_failed_login IS NULL OR last_failed_login < :window_start)"),
                    {"id": user.id, "now": now, "window_start": window_start}
                )

                if reset_result.rowcount == 0:
                    # Last failure IS within window — atomic increment
                    db.session.execute(
                        text("UPDATE users SET failed_login_count = failed_login_count + 1, "
                             "last_failed_login = :now WHERE id = :id"),
                        {"id": user.id, "now": now}
                    )

                db.session.commit()

                # Read back the authoritative count from DB (not stale ORM cache)
                count_row = db.session.execute(
                    text("SELECT failed_login_count FROM users WHERE id = :id"),
                    {"id": user.id}
                ).fetchone()
                new_count = count_row[0] if count_row else 0
                remaining = max(0, MAX_LOGIN_ATTEMPTS - new_count)

                if new_count >= MAX_LOGIN_ATTEMPTS:
                    # Atomic lockout
                    lockout_until = now + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
                    db.session.execute(
                        text("UPDATE users SET locked_until = :lockout_until WHERE id = :id"),
                        {"id": user.id, "lockout_until": lockout_until}
                    )
                    db.session.commit()
                    logger.warning(
                        f"Account locked: {email} from {client_ip} "
                        f"after {new_count} failures"
                    )
                    return jsonify({
                        'success': False,
                        'error': f'Too many failed attempts. Account locked for {LOCKOUT_DURATION_MINUTES} minutes.',
                    }), 429

                msg = 'Invalid email or password'
                if remaining <= 2 and remaining > 0:
                    msg += f'. {remaining} attempt(s) remaining before lockout.'
                logger.warning(
                    f"Failed login: {email} from {client_ip} "
                    f"({remaining} attempts left)"
                )
            except Exception as e:
                logger.error(f"Lockout recording failed: {e}")
                db.session.rollback()
                msg = 'Invalid email or password'
        else:
            if not user:
                logger.warning(f"Failed login (unknown email): {email} from {client_ip}")
            msg = 'Invalid email or password'

        return jsonify({'success': False, 'error': msg}), 401

    if not user.is_active:
        return jsonify({'success': False, 'error': 'Account is deactivated'}), 403

    # --- Success — atomic reset of lockout state and log in ---
    if lockout_active:
        try:
            db.session.execute(
                text("UPDATE users SET failed_login_count = 0, last_failed_login = NULL, "
                     "locked_until = NULL WHERE id = :id"),
                {"id": user.id}
            )
            db.session.commit()
        except Exception as e:
            logger.error(f"Lockout reset failed: {e}")
            db.session.rollback()

    # Clear email lockout records on successful login so legitimate users aren't blocked
    try:
        db.session.execute(
            text("DELETE FROM login_attempts WHERE email = :email"),
            {"email": email}
        )
        db.session.commit()
    except Exception as e:
        logger.error(f"Email lockout cleanup failed: {e}")
        db.session.rollback()

    session.permanent = True
    login_user(user, remember=True)
    logger.info(f"User logged in: {user.email} (role: {user.role}) from {client_ip}")
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
    from app.utils.i18n import SUPPORTED_LANGUAGES
    if lang not in SUPPORTED_LANGUAGES:
        return jsonify({'success': False, 'error': 'Unsupported language'}), 400
    current_user.language = lang
    db.session.commit()
    logger.info(f"User {current_user.email} changed language to {lang}")
    return jsonify({'success': True, 'language': lang})
