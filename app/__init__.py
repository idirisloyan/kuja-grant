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

        # Phase 33 — networks + network_memberships + documents had new
        # columns added in v610. db.create_all() doesn't ALTER existing
        # tables, and local dev SQLite skips migrations, so back-fill the
        # columns by hand. Idempotent: each check guards on column presence.
        try:
            from sqlalchemy import inspect as sa_inspect, text
            inspector = sa_inspect(db.engine)
            with db.engine.connect() as conn:
                tables = inspector.get_table_names()
                if "networks" in tables:
                    cols = {c["name"] for c in inspector.get_columns("networks")}
                    if "eligibility_questions_json" not in cols:
                        conn.execute(text("ALTER TABLE networks ADD COLUMN eligibility_questions_json TEXT"))
                    if "required_documents_config_json" not in cols:
                        conn.execute(text("ALTER TABLE networks ADD COLUMN required_documents_config_json TEXT"))
                    if "assessment_refresh_months" not in cols:
                        conn.execute(text("ALTER TABLE networks ADD COLUMN assessment_refresh_months INTEGER DEFAULT 24"))
                if "network_memberships" in tables:
                    cols = {c["name"] for c in inspector.get_columns("network_memberships")}
                    if "eligibility_answers_json" not in cols:
                        conn.execute(text("ALTER TABLE network_memberships ADD COLUMN eligibility_answers_json TEXT"))
                    if "assessment_next_refresh_due_at" not in cols:
                        conn.execute(text("ALTER TABLE network_memberships ADD COLUMN assessment_next_refresh_due_at TIMESTAMP"))
                    if "cooldown_until" not in cols:
                        conn.execute(text("ALTER TABLE network_memberships ADD COLUMN cooldown_until TIMESTAMP"))
                    # Phase 44 — per-network OB role columns
                    if "is_oversight_body" not in cols:
                        conn.execute(text("ALTER TABLE network_memberships ADD COLUMN is_oversight_body BOOLEAN DEFAULT 0"))
                    if "ob_role_started_at" not in cols:
                        conn.execute(text("ALTER TABLE network_memberships ADD COLUMN ob_role_started_at TIMESTAMP"))
                    if "ob_role_ended_at" not in cols:
                        conn.execute(text("ALTER TABLE network_memberships ADD COLUMN ob_role_ended_at TIMESTAMP"))
                if "documents" in tables:
                    cols = {c["name"] for c in inspector.get_columns("documents")}
                    if "network_membership_id" not in cols:
                        conn.execute(text("ALTER TABLE documents ADD COLUMN network_membership_id INTEGER"))
                # Phase 34 — grants.fund_window_id (FK + index).
                # Tables created by db.create_all() from the new fund.py
                # models are handled automatically; only the existing
                # `grants` table needs the column added in place.
                if "grants" in tables:
                    cols = {c["name"] for c in inspector.get_columns("grants")}
                    if "fund_window_id" not in cols:
                        conn.execute(text("ALTER TABLE grants ADD COLUMN fund_window_id INTEGER"))
                # Phase 40 — Application AI rubric persistence + budget for hard gate
                if "applications" in tables:
                    cols = {c["name"] for c in inspector.get_columns("applications")}
                    if "ai_rubric_result_json" not in cols:
                        conn.execute(text("ALTER TABLE applications ADD COLUMN ai_rubric_result_json TEXT"))
                    if "budget_lines_json" not in cols:
                        conn.execute(text("ALTER TABLE applications ADD COLUMN budget_lines_json TEXT"))
                conn.commit()
        except Exception as e:
            app.logger.warning(f"Phase 33/34/40 column back-fill skipped: {e}")

        # Phase 32 — guarantee the default Network row exists. The
        # migration seeds it on a fresh Postgres deploy, but local SQLite
        # bootstraps via db.create_all() (no migration), so we'd otherwise
        # boot with an empty networks table and the host-resolver would
        # return None for every request.
        try:
            from app.models import Network, DEFAULT_NETWORK_SLUG
            if not Network.query.filter_by(slug=DEFAULT_NETWORK_SLUG).first():
                default_net = Network(
                    slug=DEFAULT_NETWORK_SLUG,
                    name="Kuja Marketplace",
                    mission_short="AI-powered grant management for the Global South.",
                    brand_color_hex="#C2410C",
                    default_language="en",
                    home_url="https://kuja.org",
                    oversight_body_min_signers=2,
                    membership_review_days=60,
                    default_assessment_framework="kuja",
                    assessment_framework_display="Kuja Capacity Assessment",
                    default_currency="USD",
                    is_default=True,
                    is_active=True,
                )
                db.session.add(default_net)
                db.session.commit()
                app.logger.info("Seeded default 'kuja' Network row (bootstrap path)")

            # Phase 32 — also seed the NEAR Network so the multi-tenant
            # mode is demoable. NEAR uses the same internal framework
            # key ('kuja' → so existing test data keeps validating) but
            # displays as "NEAR Capacity Assessment" everywhere.
            if not Network.query.filter_by(slug="near").first():
                near_net = Network(
                    slug="near",
                    name="NEAR Network",
                    mission_short=(
                        "A world where local communities have the resources "
                        "and agency to address the challenges that impact them."
                    ),
                    brand_color_hex="#0F766E",  # NEAR teal
                    default_language="en",
                    home_url="https://near.ngo",
                    oversight_body_min_signers=2,
                    membership_review_days=60,
                    default_assessment_framework="kuja",
                    assessment_framework_display="NEAR Capacity Assessment",
                    default_currency="USD",
                    is_default=False,
                    is_active=True,
                )
                # host_aliases as JSON string list (model has helper but
                # not on a fresh instance; encode directly here)
                near_net.set_host_aliases(["near.kuja.org", "app.near.ngo"])
                db.session.add(near_net)
                db.session.commit()
                app.logger.info("Seeded 'near' Network row (bootstrap path)")

            # Phase 627 — Proximate Fund tenant scaffold.
            # Operates in Sudan under active conflict; default_language='ar'
            # so the Arabic + RTL stack (Phase 624) is the first thing a new
            # OB member sees. assessment_framework_display reads "Proximate
            # Due Diligence (Tier 1/2/3)" mapping the existing capacity-
            # assessment framework to SOP 6's tiered model — same internal
            # 'kuja' framework key, different label.
            # Membership SLA is shorter than NEAR's 60d default because
            # Proximate's primary lane is SOP 14 fast-track (per design doc
            # §1 north-star principle 1). The features dict carries the
            # 'sop_14_primary' flag so the UI can default to fast-track.
            # See docs/PROXIMATE_FUND_DESIGN.md for the design doc.
            if not Network.query.filter_by(slug="proximate").first():
                proximate_net = Network(
                    slug="proximate",
                    name="Proximate Fund",
                    mission_short=(
                        "Intermediary donor incubating new funds, strengthening "
                        "existing mechanisms, and enabling partner-hosted "
                        "mechanisms — operated by Adeso, Sudan-focused."
                    ),
                    brand_color_hex="#FC5810",  # Vivid Orange — PF Brand Guide 3.0
                    default_language="ar",
                    home_url="https://proximate.adesoafrica.org",
                    oversight_body_min_signers=2,
                    membership_review_days=20,
                    default_assessment_framework="kuja",
                    assessment_framework_display="Proximate Due Diligence (Tier 1/2/3)",
                    default_currency="USD",
                    is_default=False,
                    is_active=True,
                )
                proximate_net.set_host_aliases([
                    "proximate.kuja.org",
                    "proximate.adesoafrica.org",
                ])
                proximate_net.set_features({
                    "sop_14_primary": True,
                    "community_endorsement": True,
                    "fsp_registry": True,
                    "capital_classification": True,
                    "intervention_register_timers": True,
                })
                db.session.add(proximate_net)
                db.session.commit()
                app.logger.info("Seeded 'proximate' Network row (bootstrap path)")

            # Saxansaxo — SCLR micro-grants tenant (July 2026).
            # Somalia-focused; default_language='so' so community-facing
            # surfaces land in Somali first (the so locale is fully
            # translated as of 2026-07-20). Temp access pre-domain is
            # ?network=saxansaxo / X-Network-Override, same as
            # Proximate's pre-domain phase. Brand teal is a PLACEHOLDER
            # until a brand guide exists ("saxansaxo" = light rain).
            if not Network.query.filter_by(slug="saxansaxo").first():
                sax_net = Network(
                    slug="saxansaxo",
                    name="Saxansaxo",
                    mission_short=(
                        "Survivor and Community-Led Response (SCLR) in "
                        "Somalia — micro-grants direct to already-active "
                        "community groups. Operated by Adeso, funded by "
                        "Resilio."
                    ),
                    brand_color_hex="#0E8A7B",
                    default_language="so",
                    oversight_body_min_signers=1,
                    membership_review_days=10,
                    default_assessment_framework="kuja",
                    assessment_framework_display="SCLR Selection Criteria",
                    default_currency="USD",
                    is_default=False,
                    is_active=True,
                )
                sax_net.set_host_aliases(["saxansaxo.kuja.org"])
                sax_net.set_features({
                    "sclr_no_spend_policing": True,
                    "disburse_sla_days": 10,
                })
                db.session.add(sax_net)
                db.session.commit()
                app.logger.info("Seeded 'saxansaxo' Network row (bootstrap path)")

            # Idempotent Saxansaxo ops seat — mirrors the Proximate
            # ob@ pattern for the temp phase (rotate before real pilot).
            try:
                from werkzeug.security import generate_password_hash
                from app.models import (User, Organization,
                                        NetworkMembership, SaxOpsMember)
                sax_net_row = Network.query.filter_by(slug="saxansaxo").first()
                if sax_net_row:
                    sax_org = Organization.query.filter_by(
                        name='Saxansaxo Secretariat').first()
                    if not sax_org:
                        sax_org = Organization(
                            name='Saxansaxo Secretariat',
                            org_type='ngo', country='SO')
                        db.session.add(sax_org)
                        db.session.flush()
                    sax_user = User.query.filter_by(
                        email='ops@saxansaxo.org').first()
                    if not sax_user:
                        sax_user = User(
                            email='ops@saxansaxo.org',
                            password_hash=generate_password_hash('pass123'),
                            role='ngo', name='Saxansaxo Ops',
                            org_id=sax_org.id)
                        db.session.add(sax_user)
                        db.session.flush()
                    sm = NetworkMembership.query.filter_by(
                        network_id=sax_net_row.id, org_id=sax_org.id).first()
                    if not sm:
                        from datetime import datetime as _dt, timezone as _tz
                        db.session.add(NetworkMembership(
                            network_id=sax_net_row.id, org_id=sax_org.id,
                            status='active', member_tier='member',
                            is_oversight_body=True,
                            joined_at=_dt.now(_tz.utc)))
                    if not SaxOpsMember.query.filter_by(
                            user_id=sax_user.id).first():
                        db.session.add(SaxOpsMember(user_id=sax_user.id))
                    db.session.commit()
            except Exception as se:
                db.session.rollback()
                app.logger.warning(f"Saxansaxo ops seed skipped: {se}")
        except Exception as e:
            app.logger.warning(f"Network bootstrap skipped: {e}")

        # Phase 633 — opt-in one-shot Proximate demo seed. Set
        # SEED_PROXIMATE_ON_BOOT=true on Railway, restart once, then
        # unset. The seed is idempotent (Phase 630) so multiple runs
        # are safe; this is just an opt-in to avoid surprising
        # production with demo rows on every cold start.
        if os.getenv('SEED_PROXIMATE_ON_BOOT', '').lower() in ('true', '1', 'yes'):
            try:
                from seed_proximate import run as run_proximate_seed
                app.logger.info("SEED_PROXIMATE_ON_BOOT=true — seeding Proximate demo fixtures...")
                run_proximate_seed()
                app.logger.info("Proximate demo seed complete.")
            except Exception as e:
                app.logger.warning(f"SEED_PROXIMATE_ON_BOOT failed (non-fatal): {e}")

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
    # Auto schema reconciliation — Phase 610.
    #
    # Walks every SQLAlchemy model registered on db.Model, compares each
    # model's columns against the live Postgres schema, and ALTERs in
    # any columns that exist in code but not in prod. Each ALTER runs
    # in its own db.engine.begin() transaction so one failure can't
    # poison the rest.
    #
    # Why this exists: the team kept hitting the same class of bug —
    # ship a Phase that adds a column, forget to add a matching ALTER
    # to the bootstrap, the production endpoint silently returns 500.
    # Phase 607/608/609 each found another batch of missing columns.
    # This loop eliminates the whole class — any new Column declared on
    # a model auto-lands on next deploy.
    #
    # Safety: always adds as NULLABLE regardless of the model's
    # nullable=False (the standard "add column without backfill" pattern;
    # the ORM constraint applies to new writes, existing rows stay NULL).
    # Skips columns with composite/array types we can't trivially
    # generate DDL for.
    # -----------------------------------------------------------------
    with app.app_context():
        try:
            from sqlalchemy import text, inspect as sa_inspect
            inspector = sa_inspect(db.engine)
            dialect = db.engine.dialect
            is_pg = dialect.name == 'postgresql'

            # Walk every registered model.
            models = list(db.Model.registry.mappers)
            existing_tables = set(inspector.get_table_names())
            added: list[str] = []
            skipped: list[str] = []

            for mapper in models:
                table = mapper.local_table
                if table is None:
                    continue
                tbl_name = table.name
                # Skip tables that don't exist yet — db.create_all() handles
                # those. The auto-reconciler only fills missing COLUMNS.
                if tbl_name not in existing_tables:
                    continue
                try:
                    live_cols = {c['name'] for c in inspector.get_columns(tbl_name)}
                except Exception as e:
                    app.logger.warning(f"auto-schema: cannot inspect {tbl_name}: {e}")
                    continue

                for col in table.columns:
                    if col.name in live_cols:
                        continue
                    # Compile the column's type in the live dialect.
                    try:
                        col_type = col.type.compile(dialect=dialect)
                    except Exception as e:
                        skipped.append(f"{tbl_name}.{col.name} (type compile failed: {e})")
                        continue
                    # IF NOT EXISTS only works on Postgres ≥ 9.6.
                    if_not_exists = 'IF NOT EXISTS ' if is_pg else ''
                    ddl = (
                        f'ALTER TABLE "{tbl_name}" '
                        f'ADD COLUMN {if_not_exists}"{col.name}" {col_type}'
                    )
                    # Always add as NULLABLE (no NOT NULL, no default) to be
                    # safe against populated tables. If the model demands
                    # NOT NULL, the team should ship an explicit migration
                    # with a backfill.
                    try:
                        with db.engine.begin() as conn:
                            conn.execute(text(ddl))
                        added.append(f"{tbl_name}.{col.name} {col_type}")
                    except Exception as col_err:
                        skipped.append(f"{tbl_name}.{col.name} (ALTER failed: {col_err})")

            if added:
                app.logger.info(
                    f"auto-schema: added {len(added)} column(s): "
                    + ", ".join(added[:20])
                    + (f" + {len(added) - 20} more" if len(added) > 20 else "")
                )
            if skipped:
                app.logger.warning(
                    f"auto-schema: skipped {len(skipped)} column(s): "
                    + "; ".join(skipped[:10])
                    + (f" + {len(skipped) - 10} more" if len(skipped) > 10 else "")
                )
            if not added and not skipped:
                app.logger.info("auto-schema: schema in sync with models")
        except Exception as e:
            app.logger.warning(f"auto-schema reconciliation failed: {e}")

    # -----------------------------------------------------------------
    # Legacy per-ALTER bootstrap (kept as a safety net, but auto-schema
    # above is what reliably fills missing columns going forward).
    # -----------------------------------------------------------------
    with app.app_context():
        try:
            from sqlalchemy import text, inspect as sa_inspect
            inspector = sa_inspect(db.engine)
            # (table, column_name, ddl) — each runs in its own short-lived tx.
            # Covers every column added Phase 102 → Phase 308 (the range the
            # original monolithic bootstrap had been silently dropping).
            per_column_alters = [
                # ── applications (Phase 145-308) ────────────────────────
                ('applications', 'withdrawn_at',
                 'ALTER TABLE applications ADD COLUMN IF NOT EXISTS withdrawn_at TIMESTAMP'),
                ('applications', 'withdrawal_reason',
                 'ALTER TABLE applications ADD COLUMN IF NOT EXISTS withdrawal_reason TEXT'),
                ('applications', 'is_starred',
                 'ALTER TABLE applications ADD COLUMN IF NOT EXISTS is_starred BOOLEAN DEFAULT FALSE NOT NULL'),
                ('applications', 'applicant_viewed_feedback_at',
                 'ALTER TABLE applications ADD COLUMN IF NOT EXISTS applicant_viewed_feedback_at TIMESTAMP'),
                ('applications', 'outreach_initiated_at',
                 'ALTER TABLE applications ADD COLUMN IF NOT EXISTS outreach_initiated_at TIMESTAMP'),
                ('applications', 'outreach_initiated_by_user_id',
                 'ALTER TABLE applications ADD COLUMN IF NOT EXISTS outreach_initiated_by_user_id INTEGER'),
                ('applications', 'outreach_message_text',
                 'ALTER TABLE applications ADD COLUMN IF NOT EXISTS outreach_message_text TEXT'),
                ('applications', 'appeal_requested_at',
                 'ALTER TABLE applications ADD COLUMN IF NOT EXISTS appeal_requested_at TIMESTAMP'),
                ('applications', 'appeal_reason_text',
                 'ALTER TABLE applications ADD COLUMN IF NOT EXISTS appeal_reason_text TEXT'),
                ('applications', 'appeal_resolved_at',
                 'ALTER TABLE applications ADD COLUMN IF NOT EXISTS appeal_resolved_at TIMESTAMP'),
                ('applications', 'appeal_resolution',
                 'ALTER TABLE applications ADD COLUMN IF NOT EXISTS appeal_resolution VARCHAR(20)'),
                ('applications', 'appeal_resolution_text',
                 'ALTER TABLE applications ADD COLUMN IF NOT EXISTS appeal_resolution_text TEXT'),
                ('applications', 'appeal_resolved_by_user_id',
                 'ALTER TABLE applications ADD COLUMN IF NOT EXISTS appeal_resolved_by_user_id INTEGER'),
                ('applications', 'ai_rubric_result_json',
                 'ALTER TABLE applications ADD COLUMN IF NOT EXISTS ai_rubric_result_json TEXT'),
                ('applications', 'budget_lines_json',
                 'ALTER TABLE applications ADD COLUMN IF NOT EXISTS budget_lines_json TEXT'),
                # ── ai_call_logs (Phase 102, 108, 115) ──────────────────
                # These columns are what /api/admin/ai-telemetry selects.
                # Missing usd_cost (Phase 108) was breaking the endpoint
                # with a 500 in production — the AI cost ceiling, AI cost
                # forecast tile, and replay coverage all depend on them.
                ('ai_call_logs', 'input_text',
                 'ALTER TABLE ai_call_logs ADD COLUMN IF NOT EXISTS input_text TEXT'),
                ('ai_call_logs', 'output_text',
                 'ALTER TABLE ai_call_logs ADD COLUMN IF NOT EXISTS output_text TEXT'),
                ('ai_call_logs', 'replay_subject_kind',
                 'ALTER TABLE ai_call_logs ADD COLUMN IF NOT EXISTS replay_subject_kind VARCHAR(40)'),
                ('ai_call_logs', 'replay_subject_id',
                 'ALTER TABLE ai_call_logs ADD COLUMN IF NOT EXISTS replay_subject_id INTEGER'),
                ('ai_call_logs', 'org_id',
                 'ALTER TABLE ai_call_logs ADD COLUMN IF NOT EXISTS org_id INTEGER'),
                ('ai_call_logs', 'role',
                 'ALTER TABLE ai_call_logs ADD COLUMN IF NOT EXISTS role VARCHAR(20)'),
                ('ai_call_logs', 'language',
                 'ALTER TABLE ai_call_logs ADD COLUMN IF NOT EXISTS language VARCHAR(8)'),
                ('ai_call_logs', 'usd_cost',
                 'ALTER TABLE ai_call_logs ADD COLUMN IF NOT EXISTS usd_cost NUMERIC(12,6)'),
                # ── reviews (Phase 221, 232, 283, 327) ──────────────────
                ('reviews', 'private_notes',
                 'ALTER TABLE reviews ADD COLUMN IF NOT EXISTS private_notes TEXT'),
                ('reviews', 'declined_at',
                 'ALTER TABLE reviews ADD COLUMN IF NOT EXISTS declined_at TIMESTAMP'),
                ('reviews', 'declined_reason',
                 'ALTER TABLE reviews ADD COLUMN IF NOT EXISTS declined_reason TEXT'),
                # Phase 283 — Reviewer COI self-disclosure.
                ('reviews', 'coi_disclosed_at',
                 'ALTER TABLE reviews ADD COLUMN IF NOT EXISTS coi_disclosed_at TIMESTAMP'),
                ('reviews', 'coi_kind',
                 'ALTER TABLE reviews ADD COLUMN IF NOT EXISTS coi_kind VARCHAR(60)'),
                ('reviews', 'coi_note',
                 'ALTER TABLE reviews ADD COLUMN IF NOT EXISTS coi_note TEXT'),
                ('reviews', 'snoozed_until',
                 'ALTER TABLE reviews ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMP'),
                ('reviews', 'snoozed_reason',
                 'ALTER TABLE reviews ADD COLUMN IF NOT EXISTS snoozed_reason VARCHAR(200)'),
                # ── organizations (Phase 108, 257) ──────────────────────
                ('organizations', 'ai_monthly_budget_usd',
                 'ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ai_monthly_budget_usd NUMERIC(12,2)'),
                # ── grants (Phase 233) ──────────────────────────────────
                ('grants', 'withdrawn_at',
                 'ALTER TABLE grants ADD COLUMN IF NOT EXISTS withdrawn_at TIMESTAMP'),
                ('grants', 'withdrawal_reason',
                 'ALTER TABLE grants ADD COLUMN IF NOT EXISTS withdrawal_reason TEXT'),
            ]

            # Cache table → existing columns once per table.
            table_cols: dict[str, set] = {}
            for tbl, col_name, ddl in per_column_alters:
                if tbl not in table_cols:
                    try:
                        table_cols[tbl] = {
                            c['name'] for c in inspector.get_columns(tbl)
                        }
                    except Exception:
                        table_cols[tbl] = set()  # table missing — ALTER will fail too
                if col_name in table_cols[tbl]:
                    continue
                # IF NOT EXISTS is Postgres-only; SQLite ignores; both swallow.
                try:
                    with db.engine.begin() as conn:
                        conn.execute(text(ddl))
                    app.logger.info(f"per-ALTER bootstrap added: {tbl}.{col_name}")
                except Exception as col_err:
                    app.logger.warning(
                        f"per-ALTER bootstrap failed for {tbl}.{col_name}: {col_err}"
                    )
        except Exception as e:
            app.logger.warning(f"per-ALTER bootstrap skipped entirely: {e}")

    # -----------------------------------------------------------------
    # Ensure document versioning columns exist (added in v3.4)
    # Works on both PostgreSQL (ADD COLUMN IF NOT EXISTS) and SQLite (check pragma first)
    # -----------------------------------------------------------------
    with app.app_context():
        try:
            from sqlalchemy import text, inspect as sa_inspect
            inspector = sa_inspect(db.engine)
            with db.engine.connect() as conn:
                # Phase 4 / Phase 5 — organizations columns.
                # Run BEFORE the doc/report ALTERs and commit inline so a
                # noop in the doc batch (when columns already exist) doesn't
                # leave our ALTERs uncommitted.
                try:
                    org_cols = {c['name'] for c in inspector.get_columns('organizations')}
                    org_added = []
                    if 'preferred_currency' not in org_cols:
                        conn.execute(text("ALTER TABLE organizations ADD COLUMN preferred_currency VARCHAR(3) DEFAULT 'USD'"))
                        org_added.append('preferred_currency')
                    if 'ai_monthly_budget_usd' not in org_cols:
                        conn.execute(text("ALTER TABLE organizations ADD COLUMN ai_monthly_budget_usd NUMERIC(10, 2)"))
                        org_added.append('ai_monthly_budget_usd')
                    # Phase 15C — free-form org settings JSON.
                    if 'settings_json' not in org_cols:
                        conn.execute(text("ALTER TABLE organizations ADD COLUMN settings_json TEXT"))
                        org_added.append('settings_json')
                    if org_added:
                        conn.commit()
                        app.logger.info(f"Added organizations columns: {', '.join(org_added)}")
                except Exception as e:
                    # Don't leave the connection in a poisoned tx state for the next ALTER batch
                    try: conn.rollback()
                    except Exception: pass
                    app.logger.warning(f"organizations column migration skipped: {e}")

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
                # Phase 13.5 — extraction lifecycle columns (two-phase intake).
                if 'extraction_status' not in doc_cols:
                    conn.execute(text("ALTER TABLE documents ADD COLUMN extraction_status VARCHAR(20)"))
                    added.append('documents.extraction_status')
                if 'extraction_started_at' not in doc_cols:
                    conn.execute(text("ALTER TABLE documents ADD COLUMN extraction_started_at TIMESTAMP"))
                    added.append('documents.extraction_started_at')
                if 'extraction_completed_at' not in doc_cols:
                    conn.execute(text("ALTER TABLE documents ADD COLUMN extraction_completed_at TIMESTAMP"))
                    added.append('documents.extraction_completed_at')
                if 'extraction_failed_reason' not in doc_cols:
                    conn.execute(text("ALTER TABLE documents ADD COLUMN extraction_failed_reason VARCHAR(500)"))
                    added.append('documents.extraction_failed_reason')
                if 'extraction_failed_code' not in doc_cols:
                    conn.execute(text("ALTER TABLE documents ADD COLUMN extraction_failed_code VARCHAR(40)"))
                    added.append('documents.extraction_failed_code')
                if 'extraction_trace_id' not in doc_cols:
                    conn.execute(text("ALTER TABLE documents ADD COLUMN extraction_trace_id VARCHAR(40)"))
                    added.append('documents.extraction_trace_id')
                if 'extraction_attempt_count' not in doc_cols:
                    conn.execute(text("ALTER TABLE documents ADD COLUMN extraction_attempt_count INTEGER DEFAULT 0"))
                    added.append('documents.extraction_attempt_count')
                if 'extraction_used_native_pdf' not in doc_cols:
                    conn.execute(text("ALTER TABLE documents ADD COLUMN extraction_used_native_pdf BOOLEAN DEFAULT FALSE"))
                    added.append('documents.extraction_used_native_pdf')
                # Phase 13.26 — user clarification columns.
                if 'user_clarification' not in doc_cols:
                    conn.execute(text("ALTER TABLE documents ADD COLUMN user_clarification TEXT"))
                    added.append('documents.user_clarification')
                if 'user_clarification_at' not in doc_cols:
                    conn.execute(text("ALTER TABLE documents ADD COLUMN user_clarification_at TIMESTAMP"))
                    added.append('documents.user_clarification_at')
                if 'user_clarification_by_user_id' not in doc_cols:
                    conn.execute(text("ALTER TABLE documents ADD COLUMN user_clarification_by_user_id INTEGER"))
                    added.append('documents.user_clarification_by_user_id')
                # Phase 14 — Win/loss debrief columns on applications.
                # Donor-recorded structured learning at the moment of
                # award/rejection. Controlled vocab so we can aggregate
                # patterns later (PMO transfer pattern).
                app_cols = {c['name'] for c in inspector.get_columns('applications')}
                if 'decision_reason_code' not in app_cols:
                    conn.execute(text("ALTER TABLE applications ADD COLUMN decision_reason_code VARCHAR(60)"))
                    added.append('applications.decision_reason_code')
                if 'decision_notes' not in app_cols:
                    conn.execute(text("ALTER TABLE applications ADD COLUMN decision_notes TEXT"))
                    added.append('applications.decision_notes')
                if 'decision_recorded_at' not in app_cols:
                    conn.execute(text("ALTER TABLE applications ADD COLUMN decision_recorded_at TIMESTAMP"))
                    added.append('applications.decision_recorded_at')
                if 'decision_recorded_by_user_id' not in app_cols:
                    conn.execute(text("ALTER TABLE applications ADD COLUMN decision_recorded_by_user_id INTEGER"))
                    added.append('applications.decision_recorded_by_user_id')

                # Phase 145 — NGO-initiated application withdrawal.
                if 'withdrawn_at' not in app_cols:
                    conn.execute(text("ALTER TABLE applications ADD COLUMN withdrawn_at TIMESTAMP"))
                    added.append('applications.withdrawn_at')
                if 'withdrawal_reason' not in app_cols:
                    conn.execute(text("ALTER TABLE applications ADD COLUMN withdrawal_reason TEXT"))
                    added.append('applications.withdrawal_reason')
                # Phase 209 — donor/reviewer shortlist flag.
                if 'is_starred' not in app_cols:
                    conn.execute(text("ALTER TABLE applications ADD COLUMN is_starred BOOLEAN DEFAULT FALSE NOT NULL"))
                    added.append('applications.is_starred')

                # Phase 285 — NGO viewed-decision-feedback acknowledgement.
                if 'applicant_viewed_feedback_at' not in app_cols:
                    conn.execute(text("ALTER TABLE applications ADD COLUMN applicant_viewed_feedback_at TIMESTAMP"))
                    added.append('applications.applicant_viewed_feedback_at')

                # Phase 290 — donor outreach on declined applications.
                if 'outreach_initiated_at' not in app_cols:
                    conn.execute(text("ALTER TABLE applications ADD COLUMN outreach_initiated_at TIMESTAMP"))
                    added.append('applications.outreach_initiated_at')
                if 'outreach_initiated_by_user_id' not in app_cols:
                    conn.execute(text("ALTER TABLE applications ADD COLUMN outreach_initiated_by_user_id INTEGER"))
                    added.append('applications.outreach_initiated_by_user_id')
                # Phase 296 — optional templated message body the donor leaves
                # for the applicant when initiating outreach.
                if 'outreach_message_text' not in app_cols:
                    conn.execute(text("ALTER TABLE applications ADD COLUMN outreach_message_text TEXT"))
                    added.append('applications.outreach_message_text')

                # Phase 302 — NGO appeal flow.
                if 'appeal_requested_at' not in app_cols:
                    conn.execute(text("ALTER TABLE applications ADD COLUMN appeal_requested_at TIMESTAMP"))
                    added.append('applications.appeal_requested_at')
                if 'appeal_reason_text' not in app_cols:
                    conn.execute(text("ALTER TABLE applications ADD COLUMN appeal_reason_text TEXT"))
                    added.append('applications.appeal_reason_text')

                # Phase 308 — donor resolves the appeal.
                if 'appeal_resolved_at' not in app_cols:
                    conn.execute(text("ALTER TABLE applications ADD COLUMN appeal_resolved_at TIMESTAMP"))
                    added.append('applications.appeal_resolved_at')
                if 'appeal_resolution' not in app_cols:
                    conn.execute(text("ALTER TABLE applications ADD COLUMN appeal_resolution VARCHAR(20)"))
                    added.append('applications.appeal_resolution')
                if 'appeal_resolution_text' not in app_cols:
                    conn.execute(text("ALTER TABLE applications ADD COLUMN appeal_resolution_text TEXT"))
                    added.append('applications.appeal_resolution_text')
                if 'appeal_resolved_by_user_id' not in app_cols:
                    conn.execute(text("ALTER TABLE applications ADD COLUMN appeal_resolved_by_user_id INTEGER"))
                    added.append('applications.appeal_resolved_by_user_id')

                # Phase 221 — reviewer private notes.
                rev_cols = {c['name'] for c in inspector.get_columns('reviews')} if 'reviews' in inspector.get_table_names() else set()
                if rev_cols and 'private_notes' not in rev_cols:
                    conn.execute(text("ALTER TABLE reviews ADD COLUMN private_notes TEXT"))
                    added.append('reviews.private_notes')

                # Phase 283 — reviewer COI self-disclosure.
                if rev_cols and 'coi_disclosed_at' not in rev_cols:
                    conn.execute(text("ALTER TABLE reviews ADD COLUMN coi_disclosed_at TIMESTAMP"))
                    added.append('reviews.coi_disclosed_at')
                if rev_cols and 'coi_kind' not in rev_cols:
                    conn.execute(text("ALTER TABLE reviews ADD COLUMN coi_kind VARCHAR(60)"))
                    added.append('reviews.coi_kind')
                if rev_cols and 'coi_note' not in rev_cols:
                    conn.execute(text("ALTER TABLE reviews ADD COLUMN coi_note TEXT"))
                    added.append('reviews.coi_note')

                # Phase 327 — reviewer snooze.
                if rev_cols and 'snoozed_until' not in rev_cols:
                    conn.execute(text("ALTER TABLE reviews ADD COLUMN snoozed_until TIMESTAMP"))
                    added.append('reviews.snoozed_until')
                if rev_cols and 'snoozed_reason' not in rev_cols:
                    conn.execute(text("ALTER TABLE reviews ADD COLUMN snoozed_reason VARCHAR(200)"))
                    added.append('reviews.snoozed_reason')

                # Phase 102 — replay tooling: optional full input/output
                # text on AI call logs. Populated only for replay-eligible
                # calls (scoring decisions, narrative outputs that land in
                # the audit chain). Other calls leave these NULL to keep
                # storage cheap.
                if 'ai_call_logs' in tables:
                    aicall_cols = {c['name'] for c in inspector.get_columns('ai_call_logs')}
                    if 'input_text' not in aicall_cols:
                        conn.execute(text("ALTER TABLE ai_call_logs ADD COLUMN input_text TEXT"))
                        added.append('ai_call_logs.input_text')
                    if 'output_text' not in aicall_cols:
                        conn.execute(text("ALTER TABLE ai_call_logs ADD COLUMN output_text TEXT"))
                        added.append('ai_call_logs.output_text')
                    if 'replay_subject_kind' not in aicall_cols:
                        conn.execute(text("ALTER TABLE ai_call_logs ADD COLUMN replay_subject_kind VARCHAR(40)"))
                        added.append('ai_call_logs.replay_subject_kind')
                    if 'replay_subject_id' not in aicall_cols:
                        conn.execute(text("ALTER TABLE ai_call_logs ADD COLUMN replay_subject_id INTEGER"))
                        added.append('ai_call_logs.replay_subject_id')
                    # Phase 108 — per-tenant cost ceiling. ai_budget_service
                    # has been querying ai_call_logs.org_id which never
                    # existed (the try/except returned 0.0 silently). Add
                    # org_id + role + language + usd_cost so the budget
                    # service queries succeed and the new cost-ceiling
                    # threshold notification has data to work with.
                    if 'org_id' not in aicall_cols:
                        conn.execute(text("ALTER TABLE ai_call_logs ADD COLUMN org_id INTEGER"))
                        added.append('ai_call_logs.org_id')
                    if 'role' not in aicall_cols:
                        conn.execute(text("ALTER TABLE ai_call_logs ADD COLUMN role VARCHAR(20)"))
                        added.append('ai_call_logs.role')
                    if 'language' not in aicall_cols:
                        conn.execute(text("ALTER TABLE ai_call_logs ADD COLUMN language VARCHAR(8)"))
                        added.append('ai_call_logs.language')
                    if 'usd_cost' not in aicall_cols:
                        conn.execute(text("ALTER TABLE ai_call_logs ADD COLUMN usd_cost NUMERIC(12,6)"))
                        added.append('ai_call_logs.usd_cost')

                # Phase 108 — ensure organizations.ai_monthly_budget_usd
                # exists. The column is on the model but if the table was
                # created before the model field landed, it won't be in
                # the DB (db.create_all doesn't alter existing tables).
                if 'organizations' in tables:
                    org_cols = {c['name'] for c in inspector.get_columns('organizations')}
                    if 'ai_monthly_budget_usd' not in org_cols:
                        conn.execute(text("ALTER TABLE organizations ADD COLUMN ai_monthly_budget_usd NUMERIC(12,2)"))
                        added.append('organizations.ai_monthly_budget_usd')

                # Phase 109 — DB integrity *constraints* (CHECKs). The
                # Phase 99 /api/admin/integrity endpoint surfaces drift
                # after it happens; these CHECKs prevent the drift at
                # insert/update time. SQLite ignores CHECKs added via
                # ALTER, so they're Postgres-only — guarded on dialect.
                if db.engine.dialect.name == 'postgresql':
                    def _check_exists(name: str) -> bool:
                        try:
                            r = conn.execute(text(
                                "SELECT 1 FROM information_schema.table_constraints "
                                "WHERE constraint_name = :n AND constraint_type = 'CHECK'"
                            ), {'n': name}).first()
                            return r is not None
                        except Exception:
                            return False

                    checks = [
                        ('ck_grants_total_funding_nonneg', 'grants',
                         'CHECK (total_funding IS NULL OR total_funding >= 0)'),
                        ('ck_applications_status_submission',
                         'applications',
                         "CHECK (submitted_at IS NULL OR status IN "
                         "('submitted','approved','rejected','awarded',"
                         "'in_review','under_review','scored','declined'))"),
                        ('ck_reports_status_submission',
                         'reports',
                         "CHECK (submitted_at IS NULL OR status IN "
                         "('submitted','scored','reviewed','accepted',"
                         "'rejected','final'))"),
                        ('ck_ai_call_logs_tokens_nonneg',
                         'ai_call_logs',
                         '''CHECK ((tokens_in IS NULL OR tokens_in >= 0)
                                 AND (tokens_out IS NULL OR tokens_out >= 0))'''),
                    ]
                    for name, table, body in checks:
                        if table not in tables:
                            continue
                        if _check_exists(name):
                            continue
                        try:
                            conn.execute(text(
                                f'ALTER TABLE {table} ADD CONSTRAINT {name} {body}'
                            ))
                            added.append(f'{table}.{name}')
                        except Exception as e:
                            # Adding a CHECK against existing bad data
                            # fails. Log and continue — the operator can
                            # clean the data and re-deploy.
                            app.logger.warning(
                                'Phase 109 CHECK %s skipped: %s', name, e,
                            )

                # Phase 13.15 — TOTP 2FA columns on users.
                user_cols = {c['name'] for c in inspector.get_columns('users')}
                if 'totp_secret' not in user_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN totp_secret VARCHAR(64)"))
                    added.append('users.totp_secret')
                if 'totp_enabled' not in user_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN totp_enabled BOOLEAN DEFAULT FALSE"))
                    added.append('users.totp_enabled')
                if 'totp_enrolled_at' not in user_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN totp_enrolled_at TIMESTAMP"))
                    added.append('users.totp_enrolled_at')
                if 'totp_recovery_codes' not in user_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN totp_recovery_codes TEXT"))
                    added.append('users.totp_recovery_codes')
                # Phase 22D — notification digest cadence.
                if 'digest_cadence' not in user_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN digest_cadence VARCHAR(10) NOT NULL DEFAULT 'weekly'"))
                    added.append('users.digest_cadence')
                if added:
                    conn.commit()
                    app.logger.info(f"Added missing columns: {', '.join(added)}")
                else:
                    app.logger.info("Document/report versioning columns already present")
        except Exception as e:
            app.logger.warning(f"Could not verify versioning columns: {e}")

    # -----------------------------------------------------------------
    # Phase 13.21 — CRON_SECRET fallback.
    # Without an env-set CRON_SECRET, scheduled jobs that need to
    # authenticate to themselves (future audit prune, fixture cron)
    # have nothing to use. We generate a per-process token at boot
    # so prod isn't blocked, but multi-worker stability needs an
    # env-set value. /admin/system-health surfaces both states.
    # -----------------------------------------------------------------
    if not os.environ.get('CRON_SECRET'):
        import secrets as _secrets
        os.environ['CRON_SECRET'] = _secrets.token_urlsafe(32)
        app._kuja_cron_fallback = True
        app.logger.info("CRON_SECRET auto-generated (per-process fallback). "
                        "Set CRON_SECRET in Railway env for multi-worker stability.")
    else:
        app._kuja_cron_fallback = False

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
            # Phase 13.27 — daily compliance health snapshots. PMO's
            # trajectory chart + 30-day forecast read from this table.
            try:
                with app.app_context():
                    from app.services.compliance_health import write_daily_snapshots
                    result = write_daily_snapshots()
                    app.logger.info(
                        f"Daily compliance snapshots: "
                        f"written={result['written']} "
                        f"updated={result['skipped_existing']} "
                        f"errors={result['errors']}"
                    )
            except Exception as e:
                app.logger.error(f"Compliance snapshots failed: {e}")
            # Phase 13.30 — audit retention prune. Reads the
            # KUJA_AUDIT_RETENTION_DAYS env var (default 365). Deletes
            # ai_call_logs + read+old notifications older than the
            # window. Hash-chained audit_chain rows are NEVER pruned —
            # they're the cryptographic record. Logs the marker counts
            # so /admin/audit-retention can show the last run.
            try:
                with app.app_context():
                    from app.services.audit_prune import run_audit_prune
                    result = run_audit_prune()
                    app.logger.info(
                        f"Audit prune: ai_call_logs_deleted={result['ai_call_logs_deleted']} "
                        f"notifications_deleted={result['notifications_deleted']} "
                        f"window_days={result['window_days']}"
                    )
            except Exception as e:
                app.logger.error(f"Audit prune failed: {e}")

            # Phase 13.40 — daily AI-surface-health probe + demo-readiness
            # scan. Both run during the existing 24h cycle so we don't
            # add a second scheduler thread.
            #
            # AI surface health: exercises every flagship AI extractor
            # against synthetic fixtures. ~7 cheap Anthropic calls per
            # day (well under any reasonable budget). Skips itself when
            # ANTHROPIC_API_KEY is unset. On any fail, writes one
            # admin-kind notification per admin user so it shows up in
            # the notification panel.
            #
            # Opt out: set KUJA_DAILY_AI_SURFACE_HEALTH=false in env to
            # skip the probe (e.g. during initial cost-monitoring).
            try:
                if os.getenv('KUJA_DAILY_AI_SURFACE_HEALTH', 'true').lower() != 'false':
                    with app.app_context():
                        from app.services.ai_surface_health import run_health_check
                        hc = run_health_check(exercise_ai=True)
                        app.logger.info(
                            f"AI surface health: overall={hc['overall']} "
                            f"ok={hc['ok']} fail={hc['fail']} skipped={hc['skipped']}"
                        )
                        if hc['fail'] > 0:
                            _notify_admins(
                                kind='ai_surface_drift',
                                title=f"AI surface drift: {hc['fail']} flagship surface(s) failing",
                                body=', '.join(s['name'] for s in hc['surfaces']
                                               if s['status'] == 'fail')[:480],
                            )
            except Exception as e:
                app.logger.error(f"AI surface health daily run failed: {e}")

            # Demo-readiness: scans for sparse-data risks across 7
            # categories. Cheap (a few aggregate SQL queries). On any
            # category with warn status, notify admins ONCE per day so
            # they can curate the data before the next product showing.
            try:
                if os.getenv('KUJA_DAILY_DEMO_READINESS', 'true').lower() != 'false':
                    with app.app_context():
                        warn_findings = _run_demo_readiness_scan()
                        if warn_findings:
                            top = warn_findings[:3]
                            preview = ', '.join(
                                f"{f['key']} ({f['count']})" for f in top
                            )
                            _notify_admins(
                                kind='demo_readiness',
                                title=f"Demo-readiness: {len(warn_findings)} categor"
                                      f"{'y' if len(warn_findings) == 1 else 'ies'} need attention",
                                body=preview[:480],
                            )
                            app.logger.info(
                                f"Demo-readiness: {len(warn_findings)} warn categories"
                            )
            except Exception as e:
                app.logger.error(f"Demo-readiness daily run failed: {e}")

            # Run once per day (24 hours)
            time.sleep(86400)

    thread = threading.Thread(
        target=_notification_loop,
        name='kuja-notifications',
        daemon=True,
    )
    thread.start()
    app.logger.info("Notification scheduler started (daily checks, first run in 5m)")


def _notify_admins(*, kind: str, title: str, body: str) -> int:
    """Phase 13.40 — fan out a single notification row per admin user.

    Used by the daily scheduler to surface AI surface drift +
    demo-readiness warnings in the admin notification panel. Idempotent
    on a per-day basis — checks for an existing notification of the
    same kind+title within the last 20 hours and skips if found, so
    a worker restart mid-cycle doesn't duplicate.

    Returns count of newly-created notifications.
    """
    from datetime import datetime, timedelta, timezone
    from app.extensions import db
    from app.models import Notification, User
    from sqlalchemy import text
    try:
        admins = User.query.filter_by(role='admin').all()
        if not admins:
            return 0
        cutoff = datetime.now(timezone.utc) - timedelta(hours=20)
        created = 0
        for u in admins:
            # Idempotent: skip if a same-kind+title row already exists today.
            existing = Notification.query.filter(
                Notification.user_id == u.id,
                Notification.kind == kind,
                Notification.title == title,
                Notification.created_at >= cutoff,
            ).first()
            if existing:
                continue
            db.session.add(Notification(
                user_id=u.id, kind=kind, title=title, body=body,
            ))
            created += 1
        if created:
            db.session.commit()
        return created
    except Exception:
        try:
            db.session.rollback()
        except Exception:
            pass
        return 0


def _run_demo_readiness_scan() -> list[dict]:
    """Phase 13.40 — invoke the pure scanner used by the admin endpoint.
    Returns just the warn-status findings so the caller can decide
    whether to notify. Same source of truth — no drift possible.
    """
    try:
        from app.services.demo_readiness import scan_demo_readiness
        result = scan_demo_readiness()
        return [f for f in result.get('findings', []) if f.get('status') == 'warn']
    except Exception:
        return []


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

    def _proximate_home():
        """Persona-aware Proximate landing used to salvage bad deep
        links (pilot polish 2026-07-16, external-review finding). The
        caller's session tells us who they are; send them to THEIR
        Proximate surface instead of the generic NGO dashboard, whose
        API calls are meaningless for Proximate personas."""
        try:
            from flask_login import current_user
            from app.models import Network, ProximateDonor
            from app.models.proximate_endorsement import Endorser
            from app.utils.network import is_oversight_body_member
            if not getattr(current_user, 'is_authenticated', False):
                return '/login/'
            net = Network.query.filter_by(slug='proximate').first()
            if net:
                if (getattr(current_user, 'role', '') == 'admin'
                        or is_oversight_body_member(
                            current_user, network_id=net.id)):
                    return '/proximate/admin/'
                if ProximateDonor.query.filter_by(
                        network_id=net.id,
                        primary_user_id=current_user.id).first():
                    return '/proximate/donor/'
                if Endorser.query.filter_by(
                        network_id=net.id,
                        user_id=current_user.id).first():
                    return '/proximate/endorse/'
        except Exception:
            pass
        return '/dashboard/'

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

        # Phase 10.11 — RSC fallback noise fix (rev 2).
        # In static-export mode, Next router issues prefetch/navigation
        # requests with the `RSC: 1` header expecting an RSC stream
        # (`text/x-component`). We have no RSC stream — only static HTML.
        #
        # The first attempt returned an empty body, but the React Flight
        # parser hangs on an empty stream and ultimately rejects, which
        # makes Next.js log "Failed to fetch RSC payload ... Falling back
        # to browser navigation" before doing the hard nav.
        #
        # The actual fix: return a MINIMAL VALID Flight payload — the
        # single literal `0:null\n` which the Flight parser interprets
        # as "model 0 = null". It resolves cleanly with no payload, Next
        # router treats it as "no RSC content, do hard nav," and no
        # console.error fires.
        #
        # Belt-and-suspenders: set `Cache-Control: no-store` so browsers
        # never cache the empty payload, and `Vary: RSC` so any CDN or
        # proxy understands the RSC/HTML responses are distinct.
        from flask import request, make_response
        is_rsc_request = (
            request.headers.get('RSC') == '1'
            or request.args.get('_rsc') is not None
        )
        if is_rsc_request:
            # Minimal valid Flight payload: model 0 resolves to null.
            resp = make_response('0:null\n', 200)
            resp.headers['Content-Type'] = 'text/x-component'
            resp.headers['Vary'] = 'RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Url'
            resp.headers['Cache-Control'] = 'no-store'
            return resp

        # Try exact file first (JS, CSS, images, etc.)
        file_path = os.path.join(nextjs_dir, path)
        if os.path.isfile(file_path):
            resp = send_from_directory(nextjs_dir, path)
            # Phase 614 — content-hashed Next.js chunks live under
            # _next/static/ and never collide on rebuild. Cache them for
            # a year, immutable. /login on a second visit (UAT timeouts
            # hit at 60s+ from bundle re-download) becomes near-instant
            # because all the JS/CSS the page needs is already in the
            # browser cache.
            #
            # Non-_next assets (PWA icons, fonts, the service worker
            # bundle, etc.) get a shorter cache plus must-revalidate so
            # we can ship updates within a single page reload.
            if path.startswith('_next/static/'):
                resp.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
            elif path.endswith(('.js', '.css', '.woff', '.woff2', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico')):
                resp.headers['Cache-Control'] = 'public, max-age=86400, must-revalidate'
            return resp

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

        # /proximate has no real page — the export ships a bare shell
        # there that bounces logged-in users to the generic /dashboard.
        # Route it persona-aware like any other salvaged Proximate link.
        if path.strip('/') == 'proximate':
            from flask import redirect
            return redirect(_proximate_home(), code=302)

        # Try path/index.html (Next.js trailingSlash output)
        for candidate in [f'{path}/index.html', f'{path}.html']:
            cand_path = os.path.join(nextjs_dir, candidate)
            if os.path.isfile(cand_path):
                resp = send_from_directory(nextjs_dir, candidate)
                # Phase 614 — HTML is the deploy fingerprint. Never cache
                # it cross-deploy or the user lands on stale chunk
                # references. The stale-build-detector still helps for
                # session-pinned tabs.
                resp.headers['Cache-Control'] = 'no-store, must-revalidate'
                return resp

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
                resp = send_from_directory(nextjs_dir, candidate_path)
                resp.headers['Cache-Control'] = 'no-store, must-revalidate'
                return resp

        # Pilot polish (2026-07-16, external-review finding): a bad
        # Proximate deep link used to fall through to the root shell,
        # which redirects logged-in users to the generic /dashboard —
        # the wrong tenant's home, where NGO-centric API calls fail
        # noisily for Proximate personas. Salvage the obvious legacy
        # link shapes to their real admin routes; everything else under
        # /proximate lands on the caller's own Proximate surface.
        if parts and parts[0] == 'proximate':
            from flask import redirect
            if (len(parts) >= 3 and parts[1] == 'grants'
                    and parts[2].isdigit()):
                return redirect(
                    f'/proximate/admin/grants/{parts[2]}/', code=302)
            if len(parts) >= 2 and parts[1] in (
                    'partners', 'endorsers', 'fsps', 'grievances'):
                return redirect(f'/proximate/admin/{parts[1]}/', code=302)
            return redirect(_proximate_home(), code=302)

        # Last resort: root index.html so the client can render at least
        # the shell and redirect itself.
        root_index = os.path.join(nextjs_dir, 'index.html')
        if os.path.isfile(root_index):
            resp = send_from_directory(nextjs_dir, 'index.html')
            resp.headers['Cache-Control'] = 'no-store, must-revalidate'
            return resp
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

    @app.route('/favicon.ico')
    def tenant_favicon():
        """Host-aware favicon (2026-07-16, PF brand guide). Browsers
        request /favicon.ico before any JS runs; resolve the tenant
        from the Host header so proximate.kuja.org gets the Proximate
        mark and everything else falls back to the Kuja tile. In-app,
        the network-provider swaps the icon per tenant regardless."""
        from flask import request as _rq, abort as _abort
        slug = 'kuja'
        try:
            from app.models import Network
            net = Network.resolve_from_host(_rq.headers.get('Host', ''))
            if net and net.slug:
                slug = net.slug
        except Exception:
            pass
        for candidate in (f'tenants/{slug}/favicon.ico',
                          'tenants/kuja/favicon.ico'):
            p = os.path.join(nextjs_dir, candidate)
            if os.path.isfile(p):
                resp = send_from_directory(nextjs_dir, candidate)
                resp.headers['Cache-Control'] = 'public, max-age=3600'
                return resp
        _abort(404)

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
