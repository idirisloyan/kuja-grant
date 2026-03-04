"""
Kuja Grant Management System - Dashboard API
==============================================
Optimized with GROUP BY aggregations to eliminate N+1 queries,
SQL aggregates for averages/sums, eager loading for recent items,
and a 30-second per-user cache.
"""

from flask import Blueprint, jsonify
from flask_login import login_required, current_user
from sqlalchemy import func

from app.extensions import db
from app.models import (
    User, Organization, Grant, Application,
    Assessment, Document, Review, ComplianceCheck, Report,
)
from app.utils.cache import _dashboard_cache
import logging

logger = logging.getLogger('kuja')

dashboard_bp = Blueprint('dashboard', __name__, url_prefix='/api/dashboard')


@dashboard_bp.route('/stats', methods=['GET'])
@login_required
def api_dashboard_stats():
    """Return role-specific dashboard statistics.

    Uses GROUP BY queries instead of individual COUNT queries and
    caches results for 30 seconds per user+role combination.
    """
    role = current_user.role
    org_id = current_user.org_id

    # ---- 30-second per-user/role cache ----
    cache_key = f"dashboard_{current_user.id}_{role}"
    cached = _dashboard_cache.get(cache_key)
    if cached is not None:
        return jsonify(cached)

    stats = {}

    if role == 'ngo':
        stats = _build_ngo_stats(org_id)

    elif role == 'donor':
        stats = _build_donor_stats(org_id)

    elif role == 'reviewer':
        stats = _build_reviewer_stats(current_user.id)

    elif role == 'admin':
        stats = _build_admin_stats()

    result = {'stats': stats, 'role': role}
    _dashboard_cache.set(cache_key, result)
    return jsonify(result)


# ---------------------------------------------------------------------------
# NGO dashboard
# ---------------------------------------------------------------------------

def _build_ngo_stats(org_id):
    """Build NGO dashboard stats with consolidated queries."""
    stats = {}

    # -- Single GROUP BY for all application status counts --
    app_counts = db.session.query(
        Application.status,
        func.count(Application.id)
    ).filter(
        Application.ngo_org_id == org_id
    ).group_by(Application.status).all()

    app_status_map = dict(app_counts)
    stats['total_applications'] = sum(app_status_map.values())
    stats['draft_applications'] = app_status_map.get('draft', 0)
    stats['submitted_applications'] = sum(
        app_status_map.get(s, 0) for s in ('submitted', 'under_review', 'scored')
    )
    stats['awarded_applications'] = app_status_map.get('awarded', 0)
    stats['rejected_applications'] = app_status_map.get('rejected', 0)

    # -- Scalar queries for non-application counts --
    stats['open_grants'] = Grant.query.filter_by(status='open').count()
    stats['assessments'] = Assessment.query.filter_by(org_id=org_id).count()
    stats['documents'] = Document.query.join(Application).filter(
        Application.ngo_org_id == org_id
    ).count()

    # -- Single GROUP BY for report status counts --
    report_counts = db.session.query(
        Report.status,
        func.count(Report.id)
    ).filter(
        Report.submitted_by_org_id == org_id
    ).group_by(Report.status).all()

    report_status_map = dict(report_counts)
    stats['pending_reports'] = (
        report_status_map.get('draft', 0)
        + report_status_map.get('revision_requested', 0)
    )
    stats['submitted_reports'] = report_status_map.get('submitted', 0)

    # -- Recent applications with eager loading --
    recent_apps = Application.query.options(
        db.joinedload(Application.grant),
        db.joinedload(Application.ngo_org)
    ).filter_by(
        ngo_org_id=org_id
    ).order_by(Application.created_at.desc()).limit(5).all()
    stats['recent_applications'] = [a.to_dict(summary=True) for a in recent_apps]

    # -- Average score via SQL aggregate --
    avg = db.session.query(
        func.avg(Application.final_score)
    ).filter(
        Application.ngo_org_id == org_id,
        Application.final_score.isnot(None)
    ).scalar()
    stats['average_score'] = round(float(avg), 1) if avg else None

    return stats


# ---------------------------------------------------------------------------
# Donor dashboard
# ---------------------------------------------------------------------------

def _build_donor_stats(org_id):
    """Build donor dashboard stats with consolidated queries."""
    stats = {}

    # -- Single GROUP BY for grant status counts --
    grant_counts = db.session.query(
        Grant.status,
        func.count(Grant.id)
    ).filter(
        Grant.donor_org_id == org_id
    ).group_by(Grant.status).all()

    grant_status_map = dict(grant_counts)
    stats['total_grants'] = sum(grant_status_map.values())
    stats['open_grants'] = grant_status_map.get('open', 0)
    stats['draft_grants'] = grant_status_map.get('draft', 0)

    # -- Single GROUP BY for application status counts (via join) --
    app_counts = db.session.query(
        Application.status,
        func.count(Application.id)
    ).join(Grant).filter(
        Grant.donor_org_id == org_id
    ).group_by(Application.status).all()

    app_status_map = dict(app_counts)
    stats['total_applications'] = sum(app_status_map.values())
    stats['pending_review'] = sum(
        app_status_map.get(s, 0) for s in ('submitted', 'under_review')
    )
    stats['awarded'] = app_status_map.get('awarded', 0)

    # -- Total funding awarded via SQL aggregate (subquery) --
    stats['total_funding_awarded'] = db.session.query(
        func.sum(Grant.total_funding)
    ).filter(
        Grant.donor_org_id == org_id,
        Grant.id.in_(
            db.session.query(Application.grant_id).filter(
                Application.status == 'awarded'
            )
        )
    ).scalar() or 0

    # -- Total funding available via SQL aggregate --
    stats['total_funding_available'] = db.session.query(
        func.sum(Grant.total_funding)
    ).filter(
        Grant.donor_org_id == org_id,
        Grant.status == 'open'
    ).scalar() or 0

    # -- Single GROUP BY for donor report status counts --
    report_counts = db.session.query(
        Report.status,
        func.count(Report.id)
    ).join(Grant).filter(
        Grant.donor_org_id == org_id
    ).group_by(Report.status).all()

    report_status_map = dict(report_counts)
    stats['total_reports_received'] = sum(report_status_map.values())
    stats['pending_report_reviews'] = report_status_map.get('submitted', 0)

    # -- Recent grants with eager loading --
    recent_grants = Grant.query.options(
        db.joinedload(Grant.donor_org)
    ).filter_by(
        donor_org_id=org_id
    ).order_by(Grant.created_at.desc()).limit(5).all()
    stats['recent_grants'] = [g.to_dict(summary=True) for g in recent_grants]

    return stats


# ---------------------------------------------------------------------------
# Reviewer dashboard
# ---------------------------------------------------------------------------

def _build_reviewer_stats(user_id):
    """Build reviewer dashboard stats with consolidated queries."""
    stats = {}

    # -- Single GROUP BY for review status counts --
    review_counts = db.session.query(
        Review.status,
        func.count(Review.id)
    ).filter(
        Review.reviewer_user_id == user_id
    ).group_by(Review.status).all()

    review_map = dict(review_counts)
    stats['total_reviews'] = sum(review_map.values())
    stats['assigned_reviews'] = review_map.get('assigned', 0)
    stats['in_progress_reviews'] = review_map.get('in_progress', 0)
    stats['completed_reviews'] = review_map.get('completed', 0)

    # -- Average score via SQL aggregate --
    avg = db.session.query(
        func.avg(Review.overall_score)
    ).filter(
        Review.reviewer_user_id == user_id,
        Review.overall_score.isnot(None)
    ).scalar()
    stats['average_score_given'] = round(float(avg), 1) if avg else None

    # -- Recent reviews with eager loading --
    recent_reviews = Review.query.options(
        db.joinedload(Review.application).joinedload(Application.grant),
        db.joinedload(Review.reviewer)
    ).filter_by(
        reviewer_user_id=user_id
    ).order_by(Review.created_at.desc()).limit(5).all()
    stats['recent_reviews'] = [r.to_dict() for r in recent_reviews]

    return stats


# ---------------------------------------------------------------------------
# Admin dashboard
# ---------------------------------------------------------------------------

def _build_admin_stats():
    """Build admin dashboard stats with consolidated queries."""
    stats = {}

    # -- Single GROUP BY for users by role --
    role_counts = db.session.query(
        User.role,
        func.count(User.id)
    ).group_by(User.role).all()

    stats['users_by_role'] = dict(role_counts)
    stats['total_users'] = sum(stats['users_by_role'].values())
    stats['active_users'] = User.query.filter_by(is_active=True).count()

    # -- Single GROUP BY for orgs by type --
    type_counts = db.session.query(
        Organization.org_type,
        func.count(Organization.id)
    ).group_by(Organization.org_type).all()

    stats['orgs_by_type'] = dict(type_counts)
    stats['total_organizations'] = sum(stats['orgs_by_type'].values())
    stats['verified_organizations'] = Organization.query.filter_by(verified=True).count()

    # -- Remaining scalar counts --
    stats['total_grants'] = Grant.query.count()
    stats['open_grants'] = Grant.query.filter_by(status='open').count()
    stats['total_applications'] = Application.query.count()
    stats['total_reviews'] = Review.query.count()
    stats['total_assessments'] = Assessment.query.count()
    stats['flagged_compliance'] = ComplianceCheck.query.filter_by(status='flagged').count()

    return stats
