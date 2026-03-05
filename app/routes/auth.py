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


@auth_bp.route('/login', methods=['POST'])
def api_login():
    """Authenticate user with email and password. Database-backed rate limiting."""
    data = get_request_json()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'success': False, 'error': 'Email and password are required'}), 400

    user = User.query.filter_by(email=email).first()

    # --- Database-backed lockout check (works across all Gunicorn workers) ---
    if user and user.locked_until:
        now = datetime.now(timezone.utc)
        if now < user.locked_until:
            remaining_seconds = int((user.locked_until - now).total_seconds())
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

    # --- Validate credentials ---
    if not user or not user.check_password(password):
        if user:
            now = datetime.now(timezone.utc)
            window_start = now - timedelta(minutes=LOCKOUT_WINDOW_MINUTES)

            # Reset counter if last failure was outside the window
            if user.last_failed_login and user.last_failed_login < window_start:
                user.failed_login_count = 0

            user.failed_login_count = (user.failed_login_count or 0) + 1
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
        else:
            # Don't reveal whether email exists
            logger.warning(f"Failed login (unknown email): {email} from {request.remote_addr}")
            msg = 'Invalid email or password'

        return jsonify({'success': False, 'error': msg}), 401

    if not user.is_active:
        return jsonify({'success': False, 'error': 'Account is deactivated'}), 403

    # --- Success — reset lockout state and log in ---
    user.failed_login_count = 0
    user.last_failed_login = None
    user.locked_until = None
    db.session.commit()

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
