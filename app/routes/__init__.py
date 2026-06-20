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
    from app.routes.notification_preferences_routes import notif_pref_bp, notif_pref_alias_bp  # Phase 6 + Phase 28B alias
    from app.routes.preflight_routes import preflight_bp  # Phase 7: donor-perspective pre-flight
    from app.routes.audit_chain_routes import audit_chain_bp  # Phase 7: hash-chain admin views
    from app.routes.report_bundle_routes import report_bundle_bp  # Phase 8: bundles + reviewer follow-ups
    from app.routes.document_search_routes import doc_search_bp, search_alias_bp  # Phase 9 + Phase 28A alias
    from app.routes.digest_routes import digest_bp  # Phase 9: notification digest
    from app.routes.autofill_compare_routes import ai_compare_bp  # Phase 10: auto-fill + compare
    from app.routes.phase11_routes import phase11_bp  # Phase 11: agreement unpack + cross-grant patterns
    from app.routes.portfolio_routes import portfolio_bp  # Phase 13: donor portfolio bundle + audit timeline
    from app.routes.cron_routes import cron_bp  # Phase 15D: UAT fixture cron + future scheduled tasks
    from app.routes.tags_routes import tags_bp  # Phase 15E: tags + segmentation (find-or-create)
    from app.routes.exports_routes import exports_bp  # Phase 21C: CSV exports for grants/applications/reviews
    from app.routes.webauthn_routes import webauthn_bp  # Phase 26C: biometric re-auth
    from app.routes.feedback_routes import feedback_bp  # Phase 31A: micro-survey ingest
    from app.routes.network_routes import network_bp  # Phase 32: multi-tenant network context
    from app.routes.network_membership_routes import network_membership_bp  # Phase 33: membership flow
    from app.routes.fund_routes import fund_bp  # Phase 34: funds + windows + rubrics
    from app.routes.crisis_monitoring_routes import crisis_bp  # Phase 35: weekly crisis monitoring
    from app.routes.emergency_declaration_routes import emergency_bp  # Phase 36: multi-sig declarations
    from app.routes.window_report_routes import window_report_bp  # Phase 37: window reports + monitoring visits
    from app.routes.network_ai_routes import network_ai_bp  # Phase 38: 7 network AI surfaces
    from app.routes.tenant_message_routes import tenant_message_bp  # Phase 43A: in-app messaging
    from app.routes.member_feedback_routes import member_feedback_bp  # Phase 43B: NGO feedback
    from app.routes.translate_routes import translate_bp  # Phase 78: AI content translation
    from app.routes.compliance_explainer_routes import compliance_explainer_bp  # Phase 91: plain-language compliance explainers
    from app.routes.journey_routes import journey_bp  # Phase 92: continuous NGO journey
    from app.routes.ai_health_routes import ai_health_bp  # Phase 93: AI service health probe
    from app.routes.whisper_routes import whisper_bp  # Phase 96: OpenAI Whisper fallback transcription
    from app.routes.ai_telemetry_routes import ai_telemetry_bp, ai_quality_bp  # Phase 97 admin rollup + Phase 98.10 producer endpoints
    from app.routes.whats_new_routes import whats_new_bp  # Phase 99: "what's new since" digest
    from app.routes.data_export_routes import data_export_bp  # Phase 99: per-tenant data export bundle
    from app.routes.integrity_routes import integrity_bp  # Phase 99: DB integrity invariants
    from app.routes.credentials_routes import credentials_bp, passport_vc_bp, well_known_bp  # Phase 100: W3C Verifiable Credentials
    from app.routes.synthetic_monitor_routes import synthetic_monitor_bp  # Phase 101: synthetic production monitoring
    from app.routes.replay_routes import replay_bp  # Phase 102: audit-chain replay
    from app.routes.tenant_health_routes import tenant_health_bp  # Phase 106: per-tenant health dashboard
    from app.routes.donor_portfolio_qa_routes import donor_portfolio_qa_bp  # Phase 107: donor "ask about my grantees"
    from app.routes.cost_ceiling_routes import cost_ceiling_bp  # Phase 108: per-tenant AI cost ceiling
    from app.routes.peer_snippets_routes import peer_snippets_bp  # Phase 117: peer reference snippets
    from app.routes.webhook_routes import webhook_bp  # Phase 143: outbound webhooks

    for bp in [auth_bp, dashboard_bp, organizations_bp, grants_bp,
               applications_bp, assessments_bp, documents_bp, ai_bp,
               copilot_bp,
               compliance_bp, reviews_bp, reports_bp, admin_bp,
               notifications_bp,
               match_bp, questions_bp, diligence_bp, org_memory_bp,
               risks_bp, admin_health_bp, totp_bp, comments_bp, test_bp,
               saved_searches_bp, push_bp, trust_bp, watchlist_bp, signals_bp,
               preemption_bp, calendar_bp, messaging_bp, ai_budget_bp,
               notif_pref_bp, notif_pref_alias_bp, preflight_bp, audit_chain_bp, report_bundle_bp,
               doc_search_bp, search_alias_bp, digest_bp, ai_compare_bp, phase11_bp,
               portfolio_bp, cron_bp, tags_bp, exports_bp, webauthn_bp,
               feedback_bp, network_bp, network_membership_bp, fund_bp, crisis_bp,
               emergency_bp, window_report_bp, network_ai_bp,
               tenant_message_bp, member_feedback_bp, translate_bp,
               compliance_explainer_bp, journey_bp, ai_health_bp,
               whisper_bp, ai_telemetry_bp, ai_quality_bp,
               whats_new_bp, data_export_bp, integrity_bp,
               credentials_bp, passport_vc_bp, well_known_bp,
               synthetic_monitor_bp, replay_bp, tenant_health_bp,
               donor_portfolio_qa_bp, cost_ceiling_bp, peer_snippets_bp, webhook_bp]:
        app.register_blueprint(bp)
