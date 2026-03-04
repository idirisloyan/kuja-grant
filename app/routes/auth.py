from flask import Blueprint, request, jsonify, session
from flask_login import login_required, login_user, logout_user, current_user
from app.extensions import db
from app.models import User
from app.utils.helpers import get_request_json
from app.utils.rate_limiter import login_limiter
import logging

logger = logging.getLogger('kuja')

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')


@auth_bp.route('/login', methods=['POST'])
def api_login():
    """Authenticate user with email and password. Rate-limited."""
    data = get_request_json()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'success': False, 'error': 'Email and password are required'}), 400

    # Rate limit by IP + email combo
    rate_key = f"{request.remote_addr}:{email}"

    if login_limiter.is_locked(rate_key):
        remaining = login_limiter.lockout_remaining(rate_key)
        logger.warning(f"Login locked out: {email} from {request.remote_addr} ({remaining}s remaining)")
        return jsonify({
            'success': False,
            'error': f'Too many failed attempts. Account locked for {remaining // 60} minutes. Try again later.',
        }), 429

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        remaining = login_limiter.record_failure(rate_key)
        logger.warning(f"Failed login: {email} from {request.remote_addr} ({remaining} attempts left)")
        msg = 'Invalid email or password'
        if remaining <= 2 and remaining > 0:
            msg += f'. {remaining} attempt(s) remaining before lockout.'
        return jsonify({'success': False, 'error': msg}), 401

    if not user.is_active:
        return jsonify({'success': False, 'error': 'Account is deactivated'}), 403

    # Success — reset rate limiter and log in
    login_limiter.reset(rate_key)
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
