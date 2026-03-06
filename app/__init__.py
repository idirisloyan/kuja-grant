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

    # -----------------------------------------------------------------
    # CORS - origins from environment (comma-separated) or defaults
    # -----------------------------------------------------------------
    # Production: only the Railway domain. Development: add localhost for convenience.
    _prod_origins = 'https://web-production-6f8a.up.railway.app'
    _dev_origins = 'https://web-production-6f8a.up.railway.app,http://localhost:5000,http://127.0.0.1:5000'
    _default_origins = _prod_origins if config_name == 'production' else _dev_origins
    _allowed_origins = [o.strip() for o in os.getenv('CORS_ORIGINS', _default_origins).split(',') if o.strip()]
    CORS(app, supports_credentials=True,
         resources={r"/api/*": {"origins": _allowed_origins}})

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
    # Load i18n translation files
    # -----------------------------------------------------------------
    from app.utils.i18n import _load_translations
    _load_translations()

    return app


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

    # Also set Flask's logger
    app.logger.handlers = [handler]
    app.logger.setLevel(logging.INFO)


def _register_spa_routes(app):
    """Register SPA catch-all and static file routes."""

    @app.route('/')
    def index():
        """Serve the SPA index page."""
        index_path = os.path.join(app.static_folder, 'index.html')
        if os.path.exists(index_path):
            return send_from_directory(app.static_folder, 'index.html')
        templates_index = os.path.join(app.template_folder, 'index.html')
        if os.path.exists(templates_index):
            from flask import render_template
            return render_template('index.html')
        from app.middleware import APP_VERSION
        from flask import jsonify
        return jsonify({
            'name': 'Kuja Grant Management System',
            'version': APP_VERSION,
            'status': 'running',
        })

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
