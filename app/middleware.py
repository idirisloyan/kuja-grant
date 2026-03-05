"""
Kuja Grant Management System - Middleware
==========================================
Before/after request hooks, teardown handlers, and error handlers.

Extracted from the monolithic server.py during modularisation.
"""

import os
import logging
from datetime import datetime, timezone

from flask import request, jsonify, send_from_directory
from flask_login import current_user
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.middleware.proxy_fix import ProxyFix

from app.extensions import db

logger = logging.getLogger('kuja')

APP_VERSION = '3.3.0'
APP_START_TIME = datetime.now(timezone.utc)

# Git commit hash for build verification (set at build time)
import subprocess as _sp
try:
    APP_BUILD = _sp.check_output(['git', 'rev-parse', '--short', 'HEAD'],
                                  stderr=_sp.DEVNULL, timeout=2).decode().strip()
except Exception:
    APP_BUILD = os.getenv('RAILWAY_GIT_COMMIT_SHA', 'unknown')[:8]


def register_middleware(app):
    """Register all middleware (before/after request hooks) with the Flask app."""

    # Trust reverse proxy headers (Railway, Heroku, etc.) so request.is_secure works
    # x_for=1: trust X-Forwarded-For (1 proxy hop)
    # x_proto=1: trust X-Forwarded-Proto (critical for HSTS)
    # x_host=1: trust X-Forwarded-Host
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

    is_production = os.getenv('DATABASE_URL') is not None

    @app.after_request
    def add_security_headers(response):
        """Add enterprise security headers to every response."""
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
        response.headers['Content-Security-Policy'] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "img-src 'self' data:; "
            "font-src 'self' https://fonts.gstatic.com; "
            "connect-src 'self' https://api.anthropic.com; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self'; "
            "object-src 'none'; "
            "upgrade-insecure-requests"
        )
        # HSTS: always set in production (Railway terminates TLS at proxy)
        if is_production or request.is_secure:
            response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
        return response

    @app.before_request
    def check_content_length():
        """Reject oversized requests early with a clear 413 response.
        Prevents backend 503 errors from Gunicorn/proxy for large payloads.
        Defence layers: 1) this hook, 2) Flask MAX_CONTENT_LENGTH, 3) gunicorn --limit-request-body."""
        max_size = app.config.get('MAX_CONTENT_LENGTH', 16 * 1024 * 1024)
        content_length = request.content_length
        if content_length and content_length > max_size:
            size_mb = content_length / (1024 * 1024)
            max_mb = max_size / (1024 * 1024)
            user_info = current_user.email if hasattr(current_user, 'email') and current_user.is_authenticated else 'anonymous'
            logger.warning(
                f"UPLOAD_REJECT: oversized request ({size_mb:.1f} MB > {max_mb:.0f} MB) "
                f"from {request.remote_addr} by {user_info} to {request.path}"
            )
            return jsonify({
                'error': f'File too large ({size_mb:.1f} MB). Maximum size is {max_mb:.0f} MB.',
                'success': False,
            }), 413

    @app.before_request
    def csrf_protect():
        """Custom CSRF protection: require X-Requested-With header on mutating API requests.
        SameSite=Lax cookies + CORS origin lockdown already prevent most CSRF;
        this header check adds defense-in-depth since browsers block cross-origin
        custom headers unless explicitly allowed by CORS preflight."""
        if request.method in ('POST', 'PUT', 'DELETE', 'PATCH') and request.path.startswith('/api/'):
            # Skip for file upload endpoints (multipart forms can't easily set custom headers)
            if '/upload' in request.path or '/upload-grant-doc' in request.path:
                return
            content_type = request.content_type or ''
            if 'multipart/form-data' in content_type:
                return
            # Require either X-Requested-With header or correct Content-Type
            if not request.headers.get('X-Requested-With') and 'application/json' not in content_type:
                return jsonify({'error': 'CSRF validation failed', 'success': False}), 403

    @app.before_request
    def audit_log_request():
        """Log API requests for audit trail (non-static only)."""
        if request.path.startswith('/api/') and request.method in ('POST', 'PUT', 'DELETE', 'PATCH'):
            user_info = current_user.email if hasattr(current_user, 'email') and current_user.is_authenticated else 'anonymous'
            logger.info(
                f"AUDIT: {request.method} {request.path} by {user_info} "
                f"from {request.remote_addr}"
            )

    @app.teardown_appcontext
    def shutdown_session(exception=None):
        """Ensure database sessions are properly cleaned up after each request."""
        if exception:
            db.session.rollback()
        db.session.remove()


def register_error_handlers(app):
    """Register error handlers with the Flask app."""

    @app.errorhandler(400)
    def bad_request(error):
        return jsonify({'error': 'Bad request', 'success': False, 'message': str(error)}), 400

    @app.errorhandler(404)
    def not_found(error):
        if request.path.startswith('/api/'):
            return jsonify({'error': 'Resource not found', 'success': False}), 404
        static_folder = app.static_folder or ''
        index_path = os.path.join(static_folder, 'index.html')
        if os.path.exists(index_path):
            return send_from_directory(static_folder, 'index.html')
        return jsonify({'error': 'Not found', 'success': False}), 404

    @app.errorhandler(405)
    def method_not_allowed(error):
        return jsonify({'error': 'Method not allowed', 'success': False}), 405

    @app.errorhandler(413)
    def request_entity_too_large(error):
        return jsonify({'error': 'File too large. Maximum size is 16 MB.', 'success': False}), 413

    @app.errorhandler(RequestEntityTooLarge)
    def werkzeug_entity_too_large(error):
        """Catch werkzeug's RequestEntityTooLarge directly (raised by Flask's MAX_CONTENT_LENGTH)."""
        return jsonify({'error': 'File too large. Maximum size is 16 MB.', 'success': False}), 413

    @app.errorhandler(500)
    def internal_error(error):
        db.session.rollback()
        logger.error(f"Internal server error: {error}")
        return jsonify({'error': 'Internal server error', 'success': False}), 500

    @app.errorhandler(503)
    def service_unavailable(error):
        """Catch 503 errors (e.g. proxy kill on oversized upload) and return controlled JSON."""
        if '/upload' in request.path or '/upload-grant-doc' in request.path:
            logger.warning(f"503 on upload path {request.path} — likely oversized payload killed by proxy")
            return jsonify({
                'error': 'Upload too large or connection interrupted. Maximum file size is 16 MB.',
                'success': False,
            }), 413
        return jsonify({'error': 'Service temporarily unavailable', 'success': False}), 503
