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

    for bp in [auth_bp, dashboard_bp, organizations_bp, grants_bp,
               applications_bp, assessments_bp, documents_bp, ai_bp,
               copilot_bp,
               compliance_bp, reviews_bp, reports_bp, admin_bp,
               notifications_bp]:
        app.register_blueprint(bp)
