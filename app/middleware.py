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

from app.extensions import db

logger = logging.getLogger('kuja')

APP_VERSION = '2.0.0'
APP_START_TIME = datetime.now(timezone.utc)


def register_middleware(app):
    """Register all middleware (before/after request hooks) with the Flask app."""

    @app.after_request
    def add_security_headers(response):
        """Add enterprise security headers to every response."""
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
        response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://api.anthropic.com; frame-ancestors 'none'"
        if request.is_secure:
            response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
        return response

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

    @app.errorhandler(500)
    def internal_error(error):
        db.session.rollback()
        logger.error(f"Internal server error: {error}")
        return jsonify({'error': 'Internal server error', 'success': False}), 500
