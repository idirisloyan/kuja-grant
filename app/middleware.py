"""
Kuja Grant Management System - Middleware
==========================================
Before/after request hooks, teardown handlers, and error handlers.

Extracted from the monolithic server.py during modularisation.
"""

import json
import os
import logging
import re
import time
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from threading import Lock
from time import time as _time

from flask import request, jsonify, send_from_directory
from flask_login import current_user
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.middleware.proxy_fix import ProxyFix

from app.extensions import db

logger = logging.getLogger('kuja')


# ---------------------------------------------------------------------------
# In-memory per-IP rate limiter for sensitive endpoints (defense-in-depth).
# For enterprise scale (multi-instance), swap for a Redis-backed limiter.
# ---------------------------------------------------------------------------

class EndpointRateLimiter:
    """Simple in-memory per-IP rate limiter.
    Tracks request timestamps per (IP, endpoint_group) pair and rejects
    requests that exceed the configured threshold within the sliding window.
    Thread-safe via a Lock for Gunicorn thread workers.
    """

    def __init__(self):
        self._hits = defaultdict(list)  # key: (ip, endpoint_group) -> [timestamps]
        self._lock = Lock()

    def is_limited(self, ip: str, endpoint: str, max_requests: int, window_seconds: int) -> bool:
        key = (ip, endpoint)
        now = _time()
        with self._lock:
            # Prune old entries
            self._hits[key] = [t for t in self._hits[key] if now - t < window_seconds]
            if len(self._hits[key]) >= max_requests:
                return True
            self._hits[key].append(now)
            return False


_endpoint_rate_limiter = EndpointRateLimiter()

# Rate limit rules: (endpoint pattern, max_requests, window_seconds)
# Patterns are matched against request.path using re.match.
_RATE_LIMIT_RULES = [
    (r'^/api/auth/login$', 10, 60),
    (r'^/api/ai/', 20, 60),
    (r'^/api/documents/upload$', 10, 60),
    (r'^/api/grants/\d+/upload-grant-doc$', 10, 60),
    (r'^/api/compliance/screen$', 5, 60),
]

APP_VERSION = '3.3.4'
APP_START_TIME = datetime.now(timezone.utc)

# Git commit hash for build verification (set at build time)
import subprocess as _sp
try:
    APP_BUILD = _sp.check_output(['git', 'rev-parse', '--short', 'HEAD'],
                                  stderr=_sp.DEVNULL, timeout=2).decode().strip()
except Exception:
    APP_BUILD = os.getenv('RAILWAY_GIT_COMMIT_SHA', 'unknown')[:8]


class OversizedUploadGuard:
    """WSGI middleware that rejects oversized uploads with a clean 413 JSON response.

    Why this exists (and why Flask-level checks don't work):
    When Flask rejects a large upload via before_request or MAX_CONTENT_LENGTH,
    the client is still streaming the request body. Flask closes the connection,
    the OS TCP stack sends RST (because there's unread data in the buffer),
    and the client sees ConnectionError instead of the 413 response.

    This middleware sits BELOW Flask at the WSGI level. It:
    1. Reads the Content-Length header before Flask processes the request
    2. If oversized, DRAINS the incoming body (up to a safe cap) so TCP can close cleanly
    3. Returns a proper 413 JSON response that the client actually receives
    """

    MAX_BODY = 16 * 1024 * 1024       # 16 MB — matches Flask MAX_CONTENT_LENGTH
    MAX_DRAIN = 50 * 1024 * 1024      # Drain up to 50 MB to prevent DoS
    CHUNK_SIZE = 65536                 # 64 KB read chunks

    def __init__(self, app):
        self.app = app

    def __call__(self, environ, start_response):
        content_length_str = environ.get('CONTENT_LENGTH', '')
        if not content_length_str:
            return self.app(environ, start_response)

        try:
            content_length = int(content_length_str)
        except (ValueError, TypeError):
            return self.app(environ, start_response)

        if content_length <= self.MAX_BODY:
            return self.app(environ, start_response)

        # --- Oversized request detected — drain body, then send 413 ---
        wsgi_input = environ.get('wsgi.input')
        if wsgi_input:
            drained = 0
            drain_limit = min(content_length, self.MAX_DRAIN)
            try:
                while drained < drain_limit:
                    to_read = min(self.CHUNK_SIZE, drain_limit - drained)
                    chunk = wsgi_input.read(to_read)
                    if not chunk:
                        break
                    drained += len(chunk)
            except Exception:
                pass

        size_mb = content_length / (1024 * 1024)
        body = json.dumps({
            'error': f'File too large ({size_mb:.1f} MB). Maximum size is 16 MB.',
            'success': False,
        }).encode('utf-8')

        start_response('413 Request Entity Too Large', [
            ('Content-Type', 'application/json'),
            ('Content-Length', str(len(body))),
            ('Connection', 'close'),
        ])
        return [body]


def register_middleware(app):
    """Register all middleware (before/after request hooks) with the Flask app."""

    # WSGI-level oversized upload guard (must be outermost middleware)
    # Drains the body before rejecting so the 413 reaches the client cleanly.
    app.wsgi_app = OversizedUploadGuard(app.wsgi_app)

    # Trust reverse proxy headers (Railway, Heroku, etc.) so request.is_secure works
    # x_for=1: trust X-Forwarded-For (1 proxy hop)
    # x_proto=1: trust X-Forwarded-Proto (critical for HSTS)
    # x_host=1: trust X-Forwarded-Host
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

    is_production = os.getenv('DATABASE_URL') is not None

    # ------------------------------------------------------------------
    # Request ID: unique identifier for tracing requests across logs
    # ------------------------------------------------------------------
    @app.before_request
    def add_request_id():
        """Assign a unique request ID for tracing. Honors upstream X-Request-ID if present."""
        request_id = request.headers.get('X-Request-ID', str(uuid.uuid4())[:8])
        request.request_id = request_id

    @app.after_request
    def add_request_id_header(response):
        """Include request ID in response for client-side correlation."""
        if hasattr(request, 'request_id'):
            response.headers['X-Request-ID'] = request.request_id
        return response

    # ------------------------------------------------------------------
    # Latency tracking: measure and log request duration for all API calls
    # ------------------------------------------------------------------
    @app.before_request
    def start_timer():
        """Record request start time for latency measurement."""
        request._start_time = time.monotonic()

    @app.after_request
    def log_request_metrics(response):
        """Log structured request metrics for observability."""
        if hasattr(request, '_start_time') and request.path.startswith('/api/'):
            duration_ms = (time.monotonic() - request._start_time) * 1000
            req_id = getattr(request, 'request_id', '-')
            user_email = current_user.email if current_user.is_authenticated else 'anonymous'
            logger.info(
                f"REQUEST {request.method} {request.path} "
                f"status={response.status_code} "
                f"duration={duration_ms:.1f}ms "
                f"user={user_email} "
                f"request_id={req_id}"
            )
            # Add Server-Timing header for browser DevTools
            response.headers['Server-Timing'] = f'total;dur={duration_ms:.1f}'
        return response

    @app.after_request
    def add_security_headers(response):
        """Add enterprise security headers to every response."""
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
        # CSP: Next.js static export requires 'unsafe-inline' for hydration
        # bootstrap scripts. TODO: replace with build-time SHA-256 hashes
        # of inline scripts (Option A in enterprise remediation plan).
        # 'unsafe-inline' on style-src for MUI runtime style injection.
        # blob: in img-src covers chart libraries that render to blob URLs.
        # data: in font-src covers libraries that inline small icon fonts.
        response.headers['Content-Security-Policy'] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "img-src 'self' data: blob:; "
            "font-src 'self' https://fonts.gstatic.com data:; "
            "connect-src 'self'; "
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

    # ------------------------------------------------------------------
    # Per-endpoint rate limiting (defense-in-depth, in-memory per-IP)
    # ------------------------------------------------------------------
    @app.before_request
    def endpoint_rate_limit():
        """Throttle sensitive endpoints per client IP.
        This is a lightweight in-memory limiter that adds defense-in-depth
        on top of the existing per-user and DB-backed limiters."""
        path = request.path
        for pattern, max_req, window in _RATE_LIMIT_RULES:
            if re.match(pattern, path):
                # Extract real client IP (Railway proxy sets X-Forwarded-For)
                xff = request.headers.get('X-Forwarded-For', '')
                client_ip = xff.split(',')[0].strip() if xff else (request.remote_addr or '0.0.0.0')
                if _endpoint_rate_limiter.is_limited(client_ip, pattern, max_req, window):
                    logger.warning(
                        f"RATE_LIMIT: {client_ip} exceeded {max_req}/{window}s on {path}"
                    )
                    response = jsonify({
                        'error': 'Rate limit exceeded. Please wait before retrying.',
                        'retry_after': window,
                    })
                    response.headers['Retry-After'] = str(window)
                    return response, 429
                break  # Only match the first applicable rule

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
