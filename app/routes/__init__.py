"""
Kuja Grant Management System - Blueprint Registration
=======================================================
Central function to register all route blueprints with the Flask app.
Import is deferred to avoid circular dependencies.
"""


def register_blueprints(app):
    from app.routes.auth import auth_bp
    from app.routes.dashboard import dashboard_bp
    from app.routes.organizations import organizations_bp
    from app.routes.grants import grants_bp
    from app.routes.applications import applications_bp
    from app.routes.assessments import assessments_bp
    from app.routes.documents import documents_bp
    from app.routes.ai_routes import ai_bp
    from app.routes.copilot_routes import copilot_bp  # Phase 2: Kuja Co-pilot
    from app.routes.compliance_routes import compliance_bp
    from app.routes.reviews import reviews_bp
    from app.routes.reports import reports_bp
    from app.routes.admin import admin_bp
    from app.routes.notifications import notifications_bp
    from app.routes.match_routes import match_bp  # Phase 3: match engine
    from app.routes.grant_questions import questions_bp  # Phase 4.3: Q&A
    from app.routes.diligence import diligence_bp  # Phase 4.4: diligence room
    from app.routes.org_memory_routes import org_memory_bp  # Phase 10.5
    from app.routes.risks import risks_bp  # Phase 13.7
    from app.routes.admin_health import admin_health_bp  # Phase 13.10
    from app.routes.totp_routes import totp_bp  # Phase 13.15
    from app.routes.comments import comments_bp  # Phase 13.18
    from app.routes.test_routes import test_bp  # Phase 13.19 (env-gated)
    from app.routes.saved_searches import saved_searches_bp  # Phase 13.33
    from app.routes.push_routes import push_bp  # Phase 13.34
    from app.routes.trust_routes import trust_bp  # Phase 1 (truth-in-claims): trust profile + adverse media + bank + passport
    from app.routes.watchlist import watchlist_bp  # Phase 2 (category-defining UX): personal star toggle
    from app.routes.status_signals import signals_bp  # Phase 2: ASK/RISK/DECISION rails
    from app.routes.preemption_routes import preemption_bp  # Phase 3: AI compliance pre-emption scanner
    from app.routes.calendar_routes import calendar_bp  # Phase 3: cross-entity calendar
    from app.routes.messaging_routes import messaging_bp  # Phase 4: WhatsApp/SMS adapter
    from app.routes.ai_budget_routes import ai_budget_bp  # Phase 5: per-org AI budget gate
    from app.routes.notification_preferences_routes import notif_pref_bp  # Phase 6: channel prefs
    from app.routes.preflight_routes import preflight_bp  # Phase 7: donor-perspective pre-flight
    from app.routes.audit_chain_routes import audit_chain_bp  # Phase 7: hash-chain admin views
    from app.routes.report_bundle_routes import report_bundle_bp  # Phase 8: bundles + reviewer follow-ups

    for bp in [auth_bp, dashboard_bp, organizations_bp, grants_bp,
               applications_bp, assessments_bp, documents_bp, ai_bp,
               copilot_bp,
               compliance_bp, reviews_bp, reports_bp, admin_bp,
               notifications_bp,
               match_bp, questions_bp, diligence_bp, org_memory_bp,
               risks_bp, admin_health_bp, totp_bp, comments_bp, test_bp,
               saved_searches_bp, push_bp, trust_bp, watchlist_bp, signals_bp,
               preemption_bp, calendar_bp, messaging_bp, ai_budget_bp,
               notif_pref_bp, preflight_bp, audit_chain_bp, report_bundle_bp]:
        app.register_blueprint(bp)
