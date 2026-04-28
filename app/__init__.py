"""
Kuja Grant Management System - Application Factory
====================================================
Creates and configures the Flask application using the factory pattern.
Supports development, production, and testing configurations.
"""

import os
import json
import logging
from flask import Flask, send_from_directory
from flask_cors import CORS

from app.extensions import db, login_manager, migrate
from app.config import config_map, BASE_DIR


def create_app(config_name=None):
    """Create and configure the Flask application.

    Args:
        config_name: One of 'development', 'production', 'testing'.
                     Defaults based on DATABASE_URL presence.
    """
    # Determine environment
    if config_name is None:
        config_name = 'production' if os.getenv('DATABASE_URL') else 'development'

    app = Flask(
        __name__,
        static_folder=os.path.join(BASE_DIR, 'static'),
        template_folder=os.path.join(BASE_DIR, 'templates'),
    )

    # Load configuration
    config_cls = config_map.get(config_name)
    if config_cls is None:
        raise ValueError(f"Unknown config: {config_name}. Use: {list(config_map.keys())}")
    app.config.from_object(config_cls)
    if hasattr(config_cls, 'init_app'):
        config_cls.init_app(app)

    # Ensure upload directory exists
    upload_folder = app.config.get('UPLOAD_FOLDER', os.path.join(BASE_DIR, 'uploads'))
    app.config['UPLOAD_FOLDER'] = upload_folder
    os.makedirs(upload_folder, exist_ok=True)

    # -----------------------------------------------------------------
    # Initialize extensions
    # -----------------------------------------------------------------
    db.init_app(app)
    login_manager.init_app(app)
    login_manager.session_protection = 'strong'
    migrate.init_app(app, db)

    # NOTE: db.create_all() moved after model imports below

    # -----------------------------------------------------------------
    # CORS - origins from environment (comma-separated) or defaults
    # -----------------------------------------------------------------
    # Production: only the Railway domain. Development: add localhost for convenience.
    # Wildcard origins ('*') are explicitly rejected to prevent CORS bypass.
    _prod_origins = 'https://web-production-6f8a.up.railway.app'
    _dev_origins = 'https://web-production-6f8a.up.railway.app,http://localhost:5000,http://127.0.0.1:5000,http://localhost:3000'
    _default_origins = _prod_origins if config_name == 'production' else _dev_origins
    _allowed_origins = [
        o.strip() for o in os.getenv('CORS_ORIGINS', _default_origins).split(',')
        if o.strip() and o.strip() != '*'
    ]
    # Safety net: if env var was set to just '*', fall back to production origin
    if not _allowed_origins:
        _allowed_origins = [_prod_origins]
        app.logger.warning("CORS_ORIGINS contained only wildcards; falling back to production origin")
    CORS(app, supports_credentials=True,
         resources={r"/api/*": {
             "origins": _allowed_origins,
             "methods": ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
             "allow_headers": ["Content-Type", "X-Requested-With", "Authorization", "X-Request-ID"],
             "max_age": 600,  # Cache preflight for 10 minutes
         }})

    # -----------------------------------------------------------------
    # Flask-Login user loader
    # -----------------------------------------------------------------
    @login_manager.user_loader
    def load_user(user_id):
        from app.models.user import User
        return db.session.get(User, int(user_id))

    @login_manager.unauthorized_handler
    def unauthorized():
        from flask import jsonify
        return jsonify({'error': 'Authentication required', 'success': False}), 401

    # -----------------------------------------------------------------
    # Sentry error tracking (production only)
    # -----------------------------------------------------------------
    sentry_dsn = os.getenv('SENTRY_DSN')
    if sentry_dsn:
        try:
            import sentry_sdk
            from sentry_sdk.integrations.flask import FlaskIntegration
            from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
            sentry_sdk.init(
                dsn=sentry_dsn,
                integrations=[FlaskIntegration(), SqlalchemyIntegration()],
                traces_sample_rate=0.1,
                environment=config_name,
            )
            app.logger.info("Sentry error tracking initialized")
        except ImportError:
            app.logger.warning("sentry-sdk not installed, error tracking disabled")

    # -----------------------------------------------------------------
    # Structured JSON logging (production)
    # -----------------------------------------------------------------
    _setup_logging(app, config_name)

    # -----------------------------------------------------------------
    # Register blueprints (all API routes)
    # -----------------------------------------------------------------
    from app.routes import register_blueprints
    register_blueprints(app)

    # -----------------------------------------------------------------
    # Register middleware (security headers, CSRF, audit, teardown)
    # -----------------------------------------------------------------
    from app.middleware import register_middleware, register_error_handlers
    register_middleware(app)
    register_error_handlers(app)

    # -----------------------------------------------------------------
    # SPA fallback routes
    # -----------------------------------------------------------------
    _register_spa_routes(app)

    # -----------------------------------------------------------------
    # Import all models so SQLAlchemy knows about them
    # -----------------------------------------------------------------
    with app.app_context():
        from app import models  # noqa: F401 — ensure all models registered with SQLAlchemy
        # Now that all models are registered, create any missing tables
        db.create_all()

    # -----------------------------------------------------------------
    # Ensure lockout columns exist (safety net for migration timing)
    # -----------------------------------------------------------------
    with app.app_context():
        try:
            from sqlalchemy import text
            with db.engine.connect() as conn:
                for col_sql in [
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER DEFAULT 0",
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_failed_login TIMESTAMP",
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP",
                ]:
                    conn.execute(text(col_sql))
                conn.commit()
                app.logger.info("Lockout columns verified/created in users table")
        except Exception as e:
            app.logger.warning(f"Could not verify lockout columns (non-PostgreSQL or migration pending): {e}")

    # -----------------------------------------------------------------
    # Ensure document versioning columns exist (added in v3.4)
    # Works on both PostgreSQL (ADD COLUMN IF NOT EXISTS) and SQLite (check pragma first)
    # -----------------------------------------------------------------
    with app.app_context():
        try:
            from sqlalchemy import text, inspect as sa_inspect
            inspector = sa_inspect(db.engine)
            with db.engine.connect() as conn:
                # Check existing columns and only add missing ones
                doc_cols = {c['name'] for c in inspector.get_columns('documents')}
                report_cols = {c['name'] for c in inspector.get_columns('reports')}
                added = []
                if 'version' not in doc_cols:
                    conn.execute(text("ALTER TABLE documents ADD COLUMN version INTEGER DEFAULT 1"))
                    added.append('documents.version')
                if 'supersedes_id' not in doc_cols:
                    conn.execute(text("ALTER TABLE documents ADD COLUMN supersedes_id INTEGER"))
                    added.append('documents.supersedes_id')
                if 'revision_number' not in report_cols:
                    conn.execute(text("ALTER TABLE reports ADD COLUMN revision_number INTEGER DEFAULT 1"))
                    added.append('reports.revision_number')
                if 'revision_history' not in report_cols:
                    conn.execute(text("ALTER TABLE reports ADD COLUMN revision_history TEXT"))
                    added.append('reports.revision_history')
                if added:
                    conn.commit()
                    app.logger.info(f"Added missing columns: {', '.join(added)}")
                else:
                    app.logger.info("Document/report versioning columns already present")
        except Exception as e:
            app.logger.warning(f"Could not verify versioning columns: {e}")

    # -----------------------------------------------------------------
    # Load i18n translation files
    # -----------------------------------------------------------------
    from app.utils.i18n import _load_translations
    _load_translations()

    # -----------------------------------------------------------------
    # Schedule periodic sanctions re-screening (background thread)
    # -----------------------------------------------------------------
    _register_rescreening_scheduler(app)

    # -----------------------------------------------------------------
    # Schedule daily notification checks (deadline reminders, overdue, expiry)
    # -----------------------------------------------------------------
    _register_notification_scheduler(app)

    return app


def _register_rescreening_scheduler(app):
    """Start a background daemon thread that periodically re-screens
    organizations with active grants against sanctions lists.

    MULTI-WORKER SAFETY:
    In production with Gunicorn (multiple workers), each worker process runs
    create_app() independently. To prevent duplicate re-screening runs:
    - Only start the scheduler when RESCREENING_SCHEDULER=true env var is set.
      By default it is NOT set, so no worker starts the scheduler.
    - In production, either:
      (a) Set RESCREENING_SCHEDULER=true on exactly ONE worker (e.g. via
          a dedicated scheduler process: gunicorn -w 1 --preload), OR
      (b) Use a separate scheduler process (e.g. cron, Celery beat).
    - A distributed lock (Redis or file-based) prevents concurrent runs
      even if multiple workers accidentally have the scheduler enabled.

    Interval is controlled by RESCREENING_INTERVAL_HOURS env var (default 24).
    Set to 0 to disable automatic re-screening.
    """
    import threading

    # Only start the scheduler if explicitly enabled via env var.
    # This prevents duplicate runs across Gunicorn workers.
    scheduler_enabled = os.getenv('RESCREENING_SCHEDULER', '').lower() == 'true'
    if not scheduler_enabled:
        app.logger.info(
            "Rescreening scheduler disabled (set RESCREENING_SCHEDULER=true to enable). "
            "In production, enable on exactly ONE worker or use a dedicated scheduler process."
        )
        return

    interval_hours = int(os.getenv('RESCREENING_INTERVAL_HOURS', '24'))
    if interval_hours <= 0:
        app.logger.info("Sanctions rescreening scheduler disabled (RESCREENING_INTERVAL_HOURS=0)")
        return

    interval_seconds = interval_hours * 3600

    def _rescreening_loop():
        import time
        # Wait for the app to fully start before first run
        time.sleep(60)
        while True:
            try:
                from app.services.task_runner import schedule_rescreening
                from app.services.distributed_lock import acquire_rescreening_lock, release_rescreening_lock

                # Acquire distributed lock to prevent duplicate runs across workers
                lock_acquired = acquire_rescreening_lock()
                if not lock_acquired:
                    app.logger.info(
                        "Rescreening scheduler: lock held by another worker, skipping"
                    )
                    time.sleep(interval_seconds)
                    continue

                app.logger.info(
                    "Rescreening scheduler: acquired lock, starting run "
                    f"(interval={interval_hours}h)"
                )
                try:
                    result = schedule_rescreening(app)
                    app.logger.info(
                        f"Scheduled rescreening complete: "
                        f"{result.get('orgs_screened', 0)} orgs, "
                        f"{result.get('new_flags', 0)} new flags"
                    )
                finally:
                    release_rescreening_lock()
            except Exception as e:
                app.logger.error(f"Scheduled rescreening failed: {e}")
            time.sleep(interval_seconds)

    thread = threading.Thread(
        target=_rescreening_loop,
        name='kuja-rescreening',
        daemon=True,
    )
    thread.start()
    app.logger.info(
        f"Sanctions rescreening scheduler started (interval={interval_hours}h, "
        f"first run in 60s)"
    )


def _register_notification_scheduler(app):
    """Start a lightweight background thread that runs daily notification checks.

    Checks for deadline reminders (30/14/7 days), overdue reports, and
    registration expiry alerts. Runs once daily (every 24 hours).

    Controlled by the same RESCREENING_SCHEDULER env var as the rescreening
    scheduler — only enabled when RESCREENING_SCHEDULER=true.
    """
    import threading

    scheduler_enabled = os.getenv('RESCREENING_SCHEDULER', '').lower() == 'true'
    if not scheduler_enabled:
        return  # Only run on the designated scheduler worker

    def _notification_loop():
        import time
        # Wait 5 minutes after startup before first check
        time.sleep(300)
        while True:
            try:
                from app.services.notification_service import run_all_notification_checks
                app.logger.info("Running daily notification checks...")
                run_all_notification_checks(app)
                app.logger.info("Daily notification checks completed")
            except Exception as e:
                app.logger.error(f"Notification checks failed: {e}")
            # Run once per day (24 hours)
            time.sleep(86400)

    thread = threading.Thread(
        target=_notification_loop,
        name='kuja-notifications',
        daemon=True,
    )
    thread.start()
    app.logger.info("Notification scheduler started (daily checks, first run in 5m)")


def _setup_logging(app, config_name):
    """Configure structured logging."""

    class JSONFormatter(logging.Formatter):
        def format(self, record):
            log_entry = {
                'timestamp': self.formatTime(record),
                'level': record.levelname,
                'logger': record.name,
                'message': record.getMessage(),
            }
            if record.exc_info:
                log_entry['exception'] = self.formatException(record.exc_info)
            return json.dumps(log_entry)

    handler = logging.StreamHandler()
    if config_name == 'production':
        handler.setFormatter(JSONFormatter())
    else:
        handler.setFormatter(logging.Formatter(
            '%(asctime)s [%(levelname)s] %(name)s: %(message)s'
        ))

    # Configure the kuja logger
    kuja_logger = logging.getLogger('kuja')
    kuja_logger.handlers = [handler]
    kuja_logger.setLevel(logging.INFO)

    # Configure the kuja.audit logger (inherits kuja handler, dedicated namespace
    # for easy filtering in log aggregation systems)
    audit_logger = logging.getLogger('kuja.audit')
    audit_logger.handlers = [handler]
    audit_logger.setLevel(logging.INFO)

    # Also set Flask's logger
    app.logger.handlers = [handler]
    app.logger.setLevel(logging.INFO)


def _register_spa_routes(app):
    """Register routes for the Next.js static export frontend.

    Serves pre-built pages from static/nextjs/ (produced by `npm run build`
    in the frontend/ directory). No legacy SPA fallback — the vanilla JS
    SPA in templates/ is retained for reference only and is not served.
    """
    nextjs_dir = os.path.join(app.static_folder, 'nextjs')

    def _serve_nextjs(path=''):
        """Serve a Next.js static export file.

        Next.js static export only generates the [param] placeholder folder
        (e.g. /apply/0/index.html) for dynamic routes. Without a fallback
        for /apply/<real_id>, /grants/<id>, etc., Flask was serving the
        root index.html, which then redirects authenticated users to
        /dashboard — breaking direct deep-link navigation. We rewrite any
        unmatched path to its parent's [param] placeholder so the client
        can read the real id from window.location and render correctly.
        """
        if not os.path.isdir(nextjs_dir):
            return None

        # Phase 10.11 — RSC fallback noise fix.
        # In static-export mode, Next router issues prefetch/navigation
        # requests with the `RSC: 1` header expecting an RSC stream
        # (`text/x-component`). We have no RSC stream — only static HTML.
        # Returning HTML to an RSC request triggers Next's
        # "Failed to fetch RSC payload ... Falling back to browser
        # navigation" console error, and only THEN it does the hard nav.
        #
        # The fix: return 200 with `text/x-component` content-type and an
        # empty body. Next's fetch succeeds (no console.error), the empty
        # payload parses to nothing, and the router falls back to hard
        # navigation silently. We also set Vary: RSC so any caching layer
        # treats RSC and HTML responses as distinct entries.
        from flask import request, make_response
        is_rsc_request = (
            request.headers.get('RSC') == '1'
            or request.args.get('_rsc') is not None
        )
        if is_rsc_request:
            resp = make_response('', 200)
            resp.headers['Content-Type'] = 'text/x-component'
            resp.headers['Vary'] = 'RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Url'
            resp.headers['Cache-Control'] = 'no-store'
            return resp

        # Try exact file first (JS, CSS, images, etc.)
        file_path = os.path.join(nextjs_dir, path)
        if os.path.isfile(file_path):
            return send_from_directory(nextjs_dir, path)

        # IMPORTANT: For hashed Next.js asset paths that don't exist, return
        # 404 instead of falling through to the SPA index. Otherwise a stale
        # browser referencing an old chunk hash receives index.html as the
        # script body, and silently loads nothing — invisible to the user
        # except that the page renders English fallbacks. Make it loud so
        # the browser refetches the parent HTML (which is no-store) and gets
        # current chunk references.
        if path.startswith('_next/') or path.endswith('.js') or path.endswith('.css'):
            from flask import abort
            abort(404)

        # Try path/index.html (Next.js trailingSlash output)
        for candidate in [f'{path}/index.html', f'{path}.html']:
            cand_path = os.path.join(nextjs_dir, candidate)
            if os.path.isfile(cand_path):
                return send_from_directory(nextjs_dir, candidate)

        # Fallback: dynamic-route segments. For path like "apply/266",
        # try parent + "0" placeholder (apply/0/index.html). Walk up the
        # path so /grants/123/details would also try /grants/0/details
        # and then /grants/0.
        parts = path.strip('/').split('/') if path else []
        for i in range(len(parts) - 1, -1, -1):
            candidate_parts = parts[:i] + ['0'] + parts[i + 1:]
            candidate_path = '/'.join(candidate_parts) + '/index.html'
            cand = os.path.join(nextjs_dir, candidate_path)
            if os.path.isfile(cand):
                return send_from_directory(nextjs_dir, candidate_path)

        # Last resort: root index.html so the client can render at least
        # the shell and redirect itself.
        root_index = os.path.join(nextjs_dir, 'index.html')
        if os.path.isfile(root_index):
            return send_from_directory(nextjs_dir, 'index.html')
        return None

    @app.route('/')
    def index():
        """Serve the Next.js index page."""
        resp = _serve_nextjs('')
        if resp:
            return resp
        from app.middleware import APP_VERSION
        from flask import jsonify
        return jsonify({
            'name': 'Kuja Grant Management System',
            'version': APP_VERSION,
            'status': 'running',
            'message': 'Frontend not built. Run: cd frontend && npm run build',
        })

    @app.route('/<path:path>')
    def catch_all(path):
        """Catch-all route for Next.js client-side routing."""
        if path.startswith('api') or path.startswith('uploads') or path.startswith('static'):
            from flask import abort
            abort(404)
        resp = _serve_nextjs(path)
        if resp:
            return resp
        from flask import abort
        abort(404)

    @app.route('/api')
    def api_info():
        """API information and available endpoints."""
        from flask import jsonify
        return jsonify({
            'name': 'Kuja Grant Management API',
            'version': '3.0.0',
            'description': 'REST API for the Kuja Grant Management System',
        })

    @app.route('/uploads/<path:filename>')
    def serve_upload(filename):
        """Serve uploaded files with org-level access control."""
        from flask_login import login_required, current_user
        from flask import jsonify
        from app.models.document import Document
        from app.models.grant import Grant
        from app.models.application import Application

        if not current_user.is_authenticated:
            return jsonify({'error': 'Authentication required'}), 401

        # Admins can access all files
        if current_user.role == 'admin':
            return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

        # Check documents table for org ownership
        doc = Document.query.filter_by(stored_filename=filename).first()
        if doc:
            app_obj = db.session.get(Application, doc.application_id) if doc.application_id else None
            if app_obj and app_obj.ngo_org_id != current_user.org_id:
                if not (current_user.role == 'donor' and app_obj.grant and app_obj.grant.donor_org_id == current_user.org_id):
                    return jsonify({'error': 'Access denied'}), 403

        # Check grant documents
        grant = Grant.query.filter_by(grant_document=filename).first()
        if grant and grant.donor_org_id != current_user.org_id and current_user.role != 'reviewer':
            return jsonify({'error': 'Access denied'}), 403

        return send_from_directory(app.config['UPLOAD_FOLDER'], filename)
