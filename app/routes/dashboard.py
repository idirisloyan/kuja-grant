"""
Kuja Grant Management System - Dashboard API
==============================================
Optimized with GROUP BY aggregations to eliminate N+1 queries,
SQL aggregates for averages/sums, eager loading for recent items,
and a 30-second per-user cache.
"""

from flask import Blueprint, jsonify, request
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


@dashboard_bp.route('/today', methods=['GET'])
@login_required
def api_dashboard_today():
    """Return a role-aware 'Today' briefing — what should this user act on now?

    Deterministic: walks the DB, derives prioritised items with severity,
    due-in-days, and a primary action link. Capped at 6 items.

    See app/services/today_briefing_service.py for the full design.
    """
    from app.services.today_briefing_service import TodayBriefingService
    cache_key = f"today_brief_{current_user.id}"
    cached = _dashboard_cache.get(cache_key)
    if cached is not None:
        return jsonify(cached)
    brief = TodayBriefingService.build(current_user)
    _dashboard_cache.set(cache_key, brief)
    return jsonify(brief)


@dashboard_bp.route('/signer-coach', methods=['GET'])
@login_required
def api_signer_coach():
    """Phase 80 — Signature-pace gentle coaching.

    For a committee member, compute their personal recent signing pace
    (last 6 signatures, time from declaration assignment to actually
    signing/recusing) and compare to the network's 6-day target.

    Returns: {role, sample_size, my_median_days, my_p90_days,
              target_days, tone, headline, hint, pending_count,
              pending[]}

    Tone is 'good' if median ≤ target, 'warn' if 1.5× target, 'bad'
    otherwise. The phrasing is coaching, not surveillance: 'You're
    averaging 8 days; the network target is 6. Anything we can help
    with?' — never accusatory.
    """
    from datetime import datetime as _dt, timezone as _tz
    try:
        from app.models import EmergencyDeclaration, DeclarationSigner
    except Exception:
        return jsonify({'success': False, 'error': 'NEAR module not available'}), 404

    TARGET_DAYS = 6

    role = getattr(current_user, 'role', None)
    if role not in ('admin', 'ob_member', 'donor', 'reviewer'):
        return jsonify({'success': True, 'role': role, 'show': False})

    # Last 6 completed signing events for this user.
    completed = []
    try:
        rows = DeclarationSigner.query.filter(
            DeclarationSigner.user_id == current_user.id,
            DeclarationSigner.signed_at.isnot(None),
        ).order_by(DeclarationSigner.signed_at.desc()).limit(6).all()
        for s in rows:
            assigned = getattr(s, 'assigned_at', None) or getattr(s, 'created_at', None)
            signed = s.signed_at
            if assigned and signed:
                try:
                    a = assigned.date() if hasattr(assigned, 'date') else assigned
                    b = signed.date() if hasattr(signed, 'date') else signed
                    days = max(0, (b - a).days)
                    completed.append({'declaration_id': s.declaration_id, 'days': days})
                except Exception:
                    pass
    except Exception:
        pass

    # Pending — declarations currently waiting on this user's signature.
    pending = []
    try:
        prows = DeclarationSigner.query.filter(
            DeclarationSigner.user_id == current_user.id,
            DeclarationSigner.signed_at.is_(None),
        ).limit(10).all()
        for s in prows:
            assigned = getattr(s, 'assigned_at', None) or getattr(s, 'created_at', None)
            if not assigned: continue
            try:
                a = assigned.date() if hasattr(assigned, 'date') else assigned
                age = max(0, (_dt.now(_tz.utc).date() - a).days)
            except Exception:
                age = None
            d = db.session.get(EmergencyDeclaration, s.declaration_id)
            if not d or d.status not in ('in_review', 'draft'):
                continue
            pending.append({
                'declaration_id': s.declaration_id,
                'title': getattr(d, 'title', None),
                'age_days': age,
                'over_target': (age is not None and age > TARGET_DAYS),
            })
    except Exception:
        pass

    if not completed and not pending:
        return jsonify({'success': True, 'show': False})

    days = sorted([c['days'] for c in completed])
    median = days[len(days) // 2] if days else None
    p90 = days[min(len(days) - 1, int(len(days) * 0.9))] if days else None

    if median is None:
        tone = 'good' if not any(p['over_target'] for p in pending) else 'warn'
        headline = ('You haven\'t signed any declarations yet.' if not pending
                    else f'You have {len(pending)} declaration{"s" if len(pending) != 1 else ""} waiting on your signature.')
        hint = 'When a declaration lands, the network target is to sign within 6 days.'
    elif median <= TARGET_DAYS:
        tone = 'good'
        headline = f'Your median is {median} day{"s" if median != 1 else ""} — ahead of the {TARGET_DAYS}-day target.'
        hint = 'Thank you for the steady pace. Networks where signers move fast also see faster crisis response.'
    elif median <= TARGET_DAYS * 1.5:
        tone = 'warn'
        headline = f'Your last {len(days)} signatures took a median of {median} days — over the {TARGET_DAYS}-day network target.'
        hint = 'Anything we can help with? You can ask the secretariat to assign a co-signer if your week gets busy.'
    else:
        tone = 'bad'
        headline = f'Your last {len(days)} signatures averaged {median} days — the network target is {TARGET_DAYS}.'
        hint = 'No judgement — but the network depends on quick OB decisions in a crisis. If your workload is heavy, talk to the secretariat about temporary co-signers.'

    return jsonify({
        'success': True, 'show': True,
        'role': role,
        'sample_size': len(days),
        'my_median_days': median,
        'my_p90_days': p90,
        'target_days': TARGET_DAYS,
        'tone': tone,
        'headline': headline,
        'hint': hint,
        'pending_count': len(pending),
        'pending': pending[:5],
    })


@dashboard_bp.route('/compliance-coach', methods=['GET'])
@login_required
def api_compliance_coach():
    """Phase 74 — NGO compliance coach.

    Reframe compliance as growth, not surveillance. Today, donors see
    an NGO's compliance posture (risk flags etc.). The NGO does not see
    their own posture except as a series of red banners. This endpoint
    returns the NGO's own metrics PLUS the peer-median benchmark, so
    they see 'you average 4 days late, your peers average 1 day early'
    — actionable, not punitive.

    NGO-only. Lazy compute on each call (cheap; small per NGO).

    Returns: {timeliness, ai_quality, reports, next_action, pillars[]}
    """
    from datetime import datetime as _dt, timezone as _tz
    from app.models import Report
    from app.extensions import db as _db

    role = getattr(current_user, 'role', None)
    if role != 'ngo':
        return jsonify({'error': 'Compliance coach is for NGO viewers.', 'success': False}), 403
    org_id = current_user.org_id

    my_reports = Report.query.filter(
        Report.submitted_by_org_id == org_id,
        Report.submitted_at.isnot(None),
    ).all()

    def _lateness(r):
        if not r.due_date or not r.submitted_at:
            return None
        try:
            sd = r.submitted_at.date() if hasattr(r.submitted_at, 'date') else r.submitted_at
            return (sd - r.due_date).days
        except Exception:
            return None

    my_lateness = [l for l in (_lateness(r) for r in my_reports) if l is not None]
    avg_lateness = sum(my_lateness) / len(my_lateness) if my_lateness else None
    on_time = sum(1 for l in my_lateness if l <= 0)
    late = sum(1 for l in my_lateness if l > 0)
    overdue_open = Report.query.filter(
        Report.submitted_by_org_id == org_id,
        Report.status.in_(['draft', 'revision_requested']),
        Report.due_date < _dt.now(_tz.utc).date(),
    ).count()

    # Peer-median lateness across other NGOs with ≥3 reports.
    peer_rows = _db.session.query(
        Report.submitted_by_org_id, Report.due_date, Report.submitted_at,
    ).filter(
        Report.submitted_by_org_id != org_id,
        Report.due_date.isnot(None),
        Report.submitted_at.isnot(None),
    ).all()
    peer_by_org = {}
    for o, dd, sa in peer_rows:
        if not dd or not sa: continue
        try:
            sd = sa.date() if hasattr(sa, 'date') else sa
            peer_by_org.setdefault(o, []).append((sd - dd).days)
        except Exception: pass
    peer_med_pool = [sorted(v)[len(v) // 2] for v in peer_by_org.values() if len(v) >= 3]
    peer_median_lateness = (sorted(peer_med_pool)[len(peer_med_pool) // 2]
                            if peer_med_pool else None)

    # AI compliance score across this NGO's reviewed reports.
    my_scores = []
    for r in my_reports:
        a = r.get_ai_analysis() or {}
        s = a.get('compliance_score')
        if isinstance(s, (int, float)):
            my_scores.append(float(s))
    avg_score = sum(my_scores) / len(my_scores) if my_scores else None

    peer_scores_by_org = {}
    peer_score_rows = Report.query.filter(
        Report.submitted_by_org_id != org_id,
        Report.ai_analysis.isnot(None),
    ).limit(5000).all()
    for r in peer_score_rows:
        a = r.get_ai_analysis() or {}
        s = a.get('compliance_score')
        if isinstance(s, (int, float)):
            peer_scores_by_org.setdefault(r.submitted_by_org_id, []).append(float(s))
    peer_score_med_pool = [sorted(v)[len(v) // 2] for v in peer_scores_by_org.values() if len(v) >= 3]
    peer_score_median = (sorted(peer_score_med_pool)[len(peer_score_med_pool) // 2]
                         if peer_score_med_pool else None)

    def _trend(values):
        if len(values) < 4: return 'stable'
        a = sum(values[-3:]) / 3
        b = sum(values[-6:-3]) / 3 if len(values) >= 6 else (sum(values[:-3]) / max(len(values) - 3, 1))
        if a < b - 1: return 'improving'
        if a > b + 1: return 'slipping'
        return 'stable'

    def _label(my, peer, prefer_low=True):
        if my is None or peer is None: return 'Not enough data yet'
        delta = my - peer
        if prefer_low:
            if delta <= -2: return 'Ahead of your peers'
            if delta <= 1:  return 'On par with your peers'
            return 'Behind your peers'
        if delta >= 5: return 'Ahead of your peers'
        if delta >= -3: return 'On par with your peers'
        return 'Behind your peers'

    pillars = []
    if avg_lateness is not None:
        tone = 'good' if avg_lateness <= 0 else 'warn' if avg_lateness <= 5 else 'bad'
        pillars.append({
            'key': 'timeliness', 'label': 'Reporting timeliness',
            'score': round(avg_lateness, 1),
            'peer_median': peer_median_lateness, 'tone': tone,
            'hint': ('You usually submit early. Keep it up.' if tone == 'good'
                     else 'A 7-day reminder before each deadline could save the late penalty. Turn it on in Settings.' if tone == 'warn'
                     else 'Try drafting reports the week the activity happens, not the week the deadline hits.'),
        })
    if avg_score is not None:
        tone = 'good' if avg_score >= 80 else 'warn' if avg_score >= 65 else 'bad'
        pillars.append({
            'key': 'ai_quality', 'label': 'AI-rated content quality',
            'score': round(avg_score, 1),
            'peer_median': peer_score_median, 'tone': tone,
            'hint': ('Your reports score well against donor requirements.' if tone == 'good'
                     else 'Run the report pre-check before submitting. It catches the most common gaps in 30 seconds.' if tone == 'warn'
                     else 'Use Voice draft to capture what happened on the ground, then edit. The structure helps the AI score higher.'),
        })
    if overdue_open > 0:
        pillars.append({
            'key': 'open_overdue', 'label': 'Overdue draft reports',
            'score': overdue_open, 'peer_median': None, 'tone': 'bad',
            'hint': f'You have {overdue_open} draft report{"s" if overdue_open != 1 else ""} past their deadline.',
        })

    if overdue_open > 0:
        next_action = {'tone': 'bad',
                       'label': f'Submit {overdue_open} overdue report{"s" if overdue_open != 1 else ""}',
                       'hint': 'These are the fastest trust-score wins available right now.',
                       'href': '/reports'}
    elif avg_lateness is not None and avg_lateness > 3:
        next_action = {'tone': 'warn',
                       'label': 'Turn on early deadline reminders',
                       'hint': 'A 7-day reminder before each due date typically cuts average lateness by 3-4 days.',
                       'href': '/settings/notifications'}
    elif avg_score is not None and avg_score < 70:
        next_action = {'tone': 'warn',
                       'label': 'Use the report pre-check next time',
                       'hint': 'NGOs who run the pre-check see roughly +12 score on average.',
                       'href': '/reports'}
    else:
        next_action = {'tone': 'good',
                       'label': 'You are in good standing',
                       'hint': 'Your compliance posture is healthy. Keep the rhythm.'}

    return jsonify({
        'success': True, 'org_id': org_id,
        'generated_at': _dt.now(_tz.utc).isoformat(),
        'timeliness': {
            'avg_lateness_days': round(avg_lateness, 1) if avg_lateness is not None else None,
            'peer_median_days': peer_median_lateness,
            'trend': _trend(my_lateness),
            'rank_label': _label(avg_lateness, peer_median_lateness, prefer_low=True),
            'sample_size': len(my_lateness),
            'peer_sample_size': len(peer_med_pool),
        },
        'ai_quality': {
            'avg_compliance_score': round(avg_score, 1) if avg_score is not None else None,
            'peer_median': peer_score_median,
            'trend': _trend(my_scores),
            'rank_label': _label(avg_score, peer_score_median, prefer_low=False),
            'sample_size': len(my_scores),
            'peer_sample_size': len(peer_score_med_pool),
        },
        'reports': {
            'total_submitted': len(my_reports),
            'on_time': on_time, 'late': late, 'overdue_open': overdue_open,
        },
        'next_action': next_action, 'pillars': pillars,
    })


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

    # -- Upcoming deadlines for "What's Due Next" panel --
    from datetime import datetime, timedelta
    upcoming = []
    # Reports due
    draft_reports = Report.query.filter_by(
        submitted_by_org_id=org_id
    ).filter(Report.status.in_(['draft', 'revision_requested'])).limit(5).all()
    for r in draft_reports:
        upcoming.append({
            'type': 'report',
            'title': r.title or f'{r.report_type} Report',
            'grant_title': r.grant.title if r.grant else '',
            'due_date': r.due_date.isoformat() if r.due_date else None,
            'status': r.status,
            'href': '/reports',
        })
    # Open grants to apply to (show as opportunity)
    if stats['total_applications'] < 3:
        open_grants = Grant.query.filter_by(status='open').limit(2).all()
        for g in open_grants:
            upcoming.append({
                'type': 'application',
                'title': f'Apply to {g.title}',
                'grant_title': g.title,
                'due_date': g.deadline.isoformat() if g.deadline else None,
                'status': 'open',
                'href': '/grants',
            })
    # Assessment reminder if none done
    if stats['assessments'] == 0:
        upcoming.insert(0, {
            'type': 'assessment',
            'title': 'Complete your first capacity assessment',
            'grant_title': '',
            'due_date': None,
            'status': 'pending',
            'href': '/assessments',
        })
    stats['upcoming_deadlines'] = upcoming[:5]

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
    # Phase 206 — full per-status breakdown so the dashboard tile can
    # render every bucket (not just pending + awarded). Keys are
    # already canonical status strings.
    stats['app_status_breakdown'] = {
        k: v for k, v in app_status_map.items() if k
    }

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

    # -- Risk items for "At Risk Now" panel --
    stats['overdue_reports'] = report_status_map.get('draft', 0)  # drafts past due
    stats['reports_due_soon'] = report_status_map.get('submitted', 0)
    stats['flagged_compliance'] = 0  # placeholder

    # Phase 259 — applications by primary sector across the donor's grants.
    # Reads each org's primary sector.
    sector_bucket = {}
    apps_with_org = (
        db.session.query(Application, Organization)
        .join(Grant, Application.grant_id == Grant.id)
        .join(Organization, Application.ngo_org_id == Organization.id)
        .filter(Grant.donor_org_id == org_id)
        .all()
    )
    for a, ngo in apps_with_org:
        sect = (getattr(ngo, 'sector', None) or 'Unspecified').strip() or 'Unspecified'
        sector_bucket[sect] = sector_bucket.get(sect, 0) + 1
    stats['apps_by_sector'] = sorted(
        [{'sector': k, 'count': v} for k, v in sector_bucket.items()],
        key=lambda x: -x['count'],
    )[:10]

    # Phase 220 — median decision time (submitted_at -> decision_recorded_at).
    deltas = db.session.query(
        Application.submitted_at, Application.decision_recorded_at,
    ).join(Grant).filter(
        Grant.donor_org_id == org_id,
        Application.submitted_at.isnot(None),
        Application.decision_recorded_at.isnot(None),
    ).all()
    days = []
    for sub, dec in deltas:
        if sub and dec and dec > sub:
            days.append((dec - sub).total_seconds() / 86400.0)
    if days:
        s = sorted(days)
        mid = len(s) // 2
        median = s[mid] if len(s) % 2 else (s[mid - 1] + s[mid]) / 2
        stats['median_decision_days'] = round(median, 1)
        stats['decisions_counted'] = len(days)
    else:
        stats['median_decision_days'] = None
        stats['decisions_counted'] = 0

    # -- Application status breakdown for pipeline widget --
    stats['application_status_breakdown'] = {
        'draft': app_status_map.get('draft', 0),
        'submitted': app_status_map.get('submitted', 0),
        'under_review': app_status_map.get('under_review', 0),
        'scored': app_status_map.get('scored', 0),
        'awarded': app_status_map.get('awarded', 0),
        'rejected': app_status_map.get('rejected', 0),
    }

    # -- Pending reviews (alias) --
    stats['pending_reviews'] = stats['pending_review']

    # -- Total awarded (alias for frontend) --
    stats['total_awarded'] = stats['total_funding_awarded']

    return stats


# ---------------------------------------------------------------------------
# Reviewer dashboard
# ---------------------------------------------------------------------------

def _build_reviewer_stats(user_id):
    """Build reviewer dashboard stats with consolidated queries.

    Phase 99 follow-up — scoped to current network so a reviewer on the
    NEAR tenant sees only NEAR review stats, not their Kuja assignments.
    """
    from datetime import datetime, timezone, timedelta
    from app.utils.network import scope_review_query
    stats = {}

    # -- Single GROUP BY for review status counts (tenant-scoped) --
    counts_query = scope_review_query(
        db.session.query(Review.status, func.count(Review.id)).filter(
            Review.reviewer_user_id == user_id
        )
    ).group_by(Review.status)
    review_counts = counts_query.all()

    review_map = dict(review_counts)
    stats['total_reviews'] = sum(review_map.values())
    stats['assigned_reviews'] = review_map.get('assigned', 0)
    stats['in_progress_reviews'] = review_map.get('in_progress', 0)
    stats['completed_reviews'] = review_map.get('completed', 0)
    # Single canonical "pending" count for the dashboard. Verdict's
    # retest found "26 items waiting" + "0 pending" + "You're all
    # caught up" coexisting because each consumer rolled its own.
    stats['pending_reviews'] = (
        stats['assigned_reviews'] + stats['in_progress_reviews']
    )

    # -- Average score via SQL aggregate (tenant-scoped) --
    avg_query = scope_review_query(
        db.session.query(func.avg(Review.overall_score)).filter(
            Review.reviewer_user_id == user_id,
            Review.overall_score.isnot(None),
        )
    )
    avg = avg_query.scalar()
    stats['average_score_given'] = round(float(avg), 1) if avg else None

    # -- Recent reviews with eager loading (tenant-scoped) --
    recent_reviews = scope_review_query(
        Review.query.options(
            db.joinedload(Review.application).joinedload(Application.grant),
            db.joinedload(Review.reviewer)
        ).filter_by(reviewer_user_id=user_id)
    ).order_by(Review.created_at.desc()).limit(5).all()
    stats['recent_reviews'] = [r.to_dict() for r in recent_reviews]

    # -- SLA breakdown: open reviews bucketed by age in queue --
    # Buckets: <3d, 3-7d, 7-14d, 14d+. Tenant-scoped so SLA reflects
    # only the current network's queue.
    now = datetime.now(timezone.utc)
    open_reviews = scope_review_query(
        Review.query.filter(
            Review.reviewer_user_id == user_id,
            Review.status.in_(['assigned', 'in_progress']),
        )
    ).all()
    buckets = {'<3d': 0, '3-7d': 0, '7-14d': 0, '14d+': 0}
    for r in open_reviews:
        created = r.created_at
        if not created:
            continue
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        age_days = (now - created).days
        if age_days < 3: buckets['<3d'] += 1
        elif age_days < 7: buckets['3-7d'] += 1
        elif age_days < 14: buckets['7-14d'] += 1
        else: buckets['14d+'] += 1
    stats['sla_breakdown'] = [
        {'age': '<3d',  'count': buckets['<3d']},
        {'age': '3-7d', 'count': buckets['3-7d']},
        {'age': '7-14d','count': buckets['7-14d']},
        {'age': '14d+', 'count': buckets['14d+']},
    ]

    return stats


# ---------------------------------------------------------------------------
# Admin dashboard
# ---------------------------------------------------------------------------

def _build_admin_stats():
    """Build admin dashboard stats with consolidated queries."""
    from datetime import datetime, timezone, timedelta
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

    # -- Conversion funnel for the AdminOpsPanel chart --
    stats['conversion_funnel'] = {
        'opportunities': stats['open_grants'],
        'applications':  stats['total_applications'],
        'reviewed':      Application.query.filter(
            Application.status.in_(['under_review', 'scored', 'awarded', 'rejected'])
        ).count(),
        'awarded':       Application.query.filter_by(status='awarded').count(),
    }

    # -- Activity over last 14 days: daily submission counts --
    # Feeds the AdminOpsPanel line chart (was hardcoded placeholder).
    now = datetime.now(timezone.utc)
    fourteen_days_ago = now - timedelta(days=14)
    daily = (db.session.query(
                func.date(Application.created_at).label('day'),
                func.count(Application.id).label('n'))
             .filter(Application.created_at >= fourteen_days_ago)
             .group_by(func.date(Application.created_at))
             .all())
    by_day = {str(row.day): int(row.n) for row in daily}
    activity = []
    for i in range(13, -1, -1):
        dt = now - timedelta(days=i)
        label = dt.strftime('%b %-d') if hasattr(dt, 'strftime') else dt.isoformat()[:10]
        # Windows %-d isn't supported on every locale; fall back gracefully
        try:
            label = dt.strftime('%b ') + str(dt.day)
        except Exception:
            label = dt.isoformat()[:10]
        key = dt.date().isoformat()
        activity.append({'label': label, 'count': by_day.get(key, 0)})
    stats['activity_14d'] = activity

    return stats


# ----------------------------------------------------------------------
# Phase 16B — Peer benchmarks (NGO vs same-country NGOs / donor vs donors)
# ----------------------------------------------------------------------

@dashboard_bp.route('/donor-scorecard', methods=['GET'])
@login_required
def api_dashboard_donor_scorecard():
    """Phase 274 — Top 5 strong + 5 weak criteria across donor's grants.

    Walks each app's ai_rubric_result_json over the last 90 days and
    averages criterion scores grouped by label. Returns top 5 (strong)
    + bottom 5 (weak).
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    from collections import defaultdict

    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    sums = defaultdict(float)
    counts = defaultdict(int)
    labels = {}

    apps = Application.query.join(Grant).filter(
        Grant.donor_org_id == current_user.org_id,
        Application.updated_at >= cutoff,
    ).all()

    for a in apps:
        rubric = a.get_ai_rubric_result() if hasattr(a, 'get_ai_rubric_result') else None
        if not isinstance(rubric, dict):
            continue
        per = rubric.get('per_criterion') or rubric.get('scores') or {}
        # Pull labels off the grant for resolved display.
        if a.grant and hasattr(a.grant, 'get_criteria'):
            for c in (a.grant.get_criteria() or []):
                if isinstance(c, dict):
                    k = c.get('key') or c.get('id')
                    if k:
                        labels.setdefault(str(k), c.get('label') or str(k))
        if isinstance(per, list):
            for item in per:
                if not isinstance(item, dict):
                    continue
                k = item.get('key') or item.get('id')
                v = item.get('score') or item.get('value')
                if k is None or v is None:
                    continue
                try:
                    v = float(v)
                except (TypeError, ValueError):
                    continue
                sums[str(k)] += v
                counts[str(k)] += 1
        elif isinstance(per, dict):
            for k, v in per.items():
                try:
                    v = float(v) if not isinstance(v, dict) else float(v.get('score') or v.get('value') or 0)
                except (TypeError, ValueError):
                    continue
                sums[str(k)] += v
                counts[str(k)] += 1

    rows = []
    for k, total in sums.items():
        n = counts[k]
        if n == 0:
            continue
        rows.append({
            'key': k,
            'label': labels.get(k, k),
            'mean': round(total / n, 1),
            'n': n,
        })
    rows.sort(key=lambda r: r['mean'])
    weak = rows[:5]
    strong = list(reversed(rows[-5:])) if len(rows) >= 5 else list(reversed(rows))

    return jsonify({
        'success': True,
        'window_days': 90,
        'strong': strong,
        'weak': weak,
    })


@dashboard_bp.route('/benchmarks', methods=['GET'])
@login_required
def api_dashboard_benchmarks():
    """Anonymous comparison vs a relevant peer set. Cached 5 minutes.

    Returns { source, peer_count, metrics: [{code, label, self_value,
    peer_median, percentile, verdict, higher_is_better, unit}] }.
    """
    from app.services.peer_benchmark_service import PeerBenchmarkService

    role = current_user.role
    if role == 'ngo':
        if not current_user.org_id:
            return jsonify({'success': False, 'error': 'NGO org required'}), 400
        cache_key = f'peer_bench_ngo_{current_user.org_id}'
        cached = _dashboard_cache.get(cache_key)
        if cached is not None:
            return jsonify({'cached': True, **cached})
        result = PeerBenchmarkService.for_ngo(ngo_org_id=current_user.org_id)
        _dashboard_cache.set(cache_key, result)
        return jsonify(result)

    if role == 'donor':
        if not current_user.org_id:
            return jsonify({'success': False, 'error': 'Donor org required'}), 400
        cache_key = f'peer_bench_donor_{current_user.org_id}'
        cached = _dashboard_cache.get(cache_key)
        if cached is not None:
            return jsonify({'cached': True, **cached})
        result = PeerBenchmarkService.for_donor(donor_org_id=current_user.org_id)
        _dashboard_cache.set(cache_key, result)
        return jsonify(result)

    return jsonify({'success': False, 'error': 'Role not supported'}), 403


# ----------------------------------------------------------------------
# Phase 23B — Donor portfolio risk heatmap (sector × country grid)
# ----------------------------------------------------------------------

@dashboard_bp.route('/portfolio-risk-heatmap', methods=['GET'])
@login_required
def api_portfolio_risk_heatmap():
    from app.services.portfolio_risk_heatmap_service import PortfolioRiskHeatmapService

    if current_user.role == 'donor':
        if not current_user.org_id:
            return jsonify({'success': False, 'error': 'Donor org required'}), 400
        donor_id = current_user.org_id
    elif current_user.role == 'admin':
        raw = request.args.get('donor_org_id')
        if not raw:
            return jsonify({'success': False, 'error': 'admin must pass donor_org_id'}), 400
        try:
            donor_id = int(raw)
        except (TypeError, ValueError):
            return jsonify({'success': False, 'error': 'donor_org_id must be int'}), 400
    else:
        return jsonify({'success': False, 'error': 'Role not supported'}), 403

    cache_key = f'portfolio_risk_heatmap_{donor_id}'
    cached = _dashboard_cache.get(cache_key)
    if cached is not None:
        return jsonify({'cached': True, **cached})
    result = PortfolioRiskHeatmapService.for_donor(donor_org_id=donor_id)
    _dashboard_cache.set(cache_key, result)
    return jsonify(result)


# ----------------------------------------------------------------------
# Phase 24C — Donor cohort analytics (your funded NGOs vs cohort).
# ----------------------------------------------------------------------

@dashboard_bp.route('/donor-appeal-sla', methods=['GET'])
@login_required
def api_dashboard_donor_appeal_sla():
    """Phase 317 — Pending appeals on the donor's grants older than 7 days.

    Soft accountability. Self-gates when zero.
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    rows = (Application.query
            .join(Grant)
            .filter(Grant.donor_org_id == current_user.org_id,
                    Application.appeal_requested_at.isnot(None),
                    Application.appeal_requested_at <= cutoff,
                    Application.appeal_resolved_at.is_(None))
            .order_by(Application.appeal_requested_at.asc())
            .all())
    now = datetime.now(timezone.utc)
    out = []
    for a in rows[:3]:
        days_pending = int((now - a.appeal_requested_at).total_seconds() / 86400) if a.appeal_requested_at else None
        out.append({
            'application_id': a.id,
            'ngo_org_name': a.ngo_org.name if a.ngo_org else None,
            'days_pending': days_pending,
        })
    return jsonify({
        'sla_days': 7,
        'total': len(rows),
        'oldest': out,
    })


@dashboard_bp.route('/ngo-docs-pending', methods=['GET'])
@login_required
def api_dashboard_ngo_docs_pending():
    """Phase 340 — NGO: how many applications need a doc upload right now?

    Counts distinct applications belonging to this NGO where the latest
    'application_document_requested' notification fired AFTER the most
    recent document upload on that application.
    """
    if current_user.role != 'ngo' or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    from app.models import Notification
    apps = (Application.query
            .filter_by(ngo_org_id=current_user.org_id)
            .all())
    if not apps:
        return jsonify({'count': 0, 'application_ids': []})
    app_ids = [a.id for a in apps]
    # Latest notification per application
    notes = (Notification.query
             .filter(Notification.user_id.in_([u.id for u in []]),  # placeholder
                     False)
             .all())
    # Simpler: find apps + notes for this user, then group.
    notes = (Notification.query
             .filter(Notification.type == 'application_document_requested',
                     Notification.user_id == current_user.id)
             .order_by(Notification.created_at.desc())
             .all())
    out_ids: list[int] = []
    for a in apps:
        # Most recent doc-request notif relevant to this app (link contains /applications/<id>)
        link_target = f'/applications/{a.id}'
        n = next((nn for nn in notes if (nn.link or '') == link_target), None)
        if n is None:
            continue
        from app.models import Document
        latest_doc = (Document.query
                      .filter_by(application_id=a.id)
                      .order_by(Document.created_at.desc())
                      .first())
        if latest_doc is None or (n.created_at and latest_doc.created_at
                                  and n.created_at > latest_doc.created_at):
            out_ids.append(a.id)
    return jsonify({'count': len(out_ids), 'application_ids': out_ids[:5]})


@dashboard_bp.route('/donor-repeat-grantees', methods=['GET'])
@login_required
def api_dashboard_donor_repeat_grantees():
    """Phase 356 — NGOs this donor has funded 2+ times. Repeat grantees
    are good candidates for committed partnerships.
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from collections import Counter
    from app.models import Organization
    rows = (Application.query
            .join(Grant)
            .filter(Grant.donor_org_id == current_user.org_id,
                    Application.status.in_(['funded', 'awarded']))
            .with_entities(Application.ngo_org_id)
            .all())
    counts = Counter(r[0] for r in rows if r[0])
    repeats = [(org_id, n) for org_id, n in counts.items() if n >= 2]
    if not repeats:
        return jsonify({'grantees': [], 'total': 0})
    org_ids = [r[0] for r in repeats]
    orgs_by_id = {o.id: o for o in Organization.query.filter(Organization.id.in_(org_ids)).all()}
    out = []
    for org_id, n in sorted(repeats, key=lambda x: x[1], reverse=True)[:6]:
        org = orgs_by_id.get(org_id)
        out.append({
            'org_id': org_id,
            'org_name': org.name if org else f'Org #{org_id}',
            'fundings': n,
        })
    return jsonify({'grantees': out, 'total': len(repeats)})


@dashboard_bp.route('/donor-expressions-of-interest', methods=['GET'])
@login_required
def api_dashboard_donor_expressions_of_interest():
    """Phase 349 — Recent EOIs on this donor's grants.

    Newest 5 expressions with applicant name + grant title.
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from app.models import ExpressionOfInterest, Organization
    rows = (ExpressionOfInterest.query
            .join(Grant, Grant.id == ExpressionOfInterest.grant_id)
            .filter(Grant.donor_org_id == current_user.org_id)
            .order_by(ExpressionOfInterest.created_at.desc())
            .limit(5)
            .all())
    if not rows:
        return jsonify({'expressions': [], 'total': 0})
    org_ids = {r.org_id for r in rows}
    orgs_by_id = {o.id: o for o in Organization.query.filter(Organization.id.in_(org_ids)).all()}
    grant_ids = {r.grant_id for r in rows}
    grants_by_id = {g.id: g for g in Grant.query.filter(Grant.id.in_(grant_ids)).all()}
    out = []
    for r in rows:
        org = orgs_by_id.get(r.org_id)
        g = grants_by_id.get(r.grant_id)
        out.append({
            'id': r.id,
            'org_id': r.org_id,
            'org_name': org.name if org else None,
            'grant_id': r.grant_id,
            'grant_title': g.title if g else None,
            'created_at': r.created_at.isoformat() if r.created_at else None,
        })
    total = (ExpressionOfInterest.query
             .join(Grant, Grant.id == ExpressionOfInterest.grant_id)
             .filter(Grant.donor_org_id == current_user.org_id)
             .count())
    return jsonify({'expressions': out, 'total': total})


@dashboard_bp.route('/decision-forecast', methods=['GET'])
@login_required
def api_dashboard_decision_forecast():
    """Phase 345 — Project how many decisions the donor will record by
    month-end based on trailing 90-day daily rate.

    Self-gates client-side when trailing total is too small to project.
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    ninety_ago = now - timedelta(days=90)
    decided_90d = (Application.query
                   .join(Grant)
                   .filter(Grant.donor_org_id == current_user.org_id,
                           Application.decision_recorded_at.isnot(None),
                           Application.decision_recorded_at >= ninety_ago)
                   .count())
    daily_rate = decided_90d / 90.0
    # End of current month — days remaining (including today).
    if now.month == 12:
        end_of_month = now.replace(year=now.year + 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        end_of_month = now.replace(month=now.month + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
    days_left = max(1, int((end_of_month - now).total_seconds() / 86400))
    # Decisions so far this month
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    decided_so_far = (Application.query
                      .join(Grant)
                      .filter(Grant.donor_org_id == current_user.org_id,
                              Application.decision_recorded_at.isnot(None),
                              Application.decision_recorded_at >= month_start)
                      .count())
    projected = decided_so_far + int(round(daily_rate * days_left))
    return jsonify({
        'decided_so_far_this_month': decided_so_far,
        'projected_total_this_month': projected,
        'daily_rate_90d': round(daily_rate, 2),
        'days_left': days_left,
    })


@dashboard_bp.route('/first-time-vs-repeat', methods=['GET'])
@login_required
def api_dashboard_first_time_vs_repeat():
    """Phase 338 — Are recent applicants first-time or repeat?

    Donor view: of NGOs whose applications were received in the last 90
    days, what share were previously funded by this donor (= had a
    prior awarded application).
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)

    recent_ngo_ids = {a.ngo_org_id for a in (Application.query
                                              .join(Grant)
                                              .filter(Grant.donor_org_id == current_user.org_id,
                                                      Application.created_at >= cutoff,
                                                      Application.ngo_org_id.isnot(None))
                                              .all())}
    if not recent_ngo_ids:
        return jsonify({'total': 0, 'repeat': 0, 'first_time': 0})

    # Prior funded NGOs across this donor's history.
    prior_funded = {a.ngo_org_id for a in (Application.query
                                            .join(Grant)
                                            .filter(Grant.donor_org_id == current_user.org_id,
                                                    Application.created_at < cutoff,
                                                    Application.status.in_(['funded', 'awarded']))
                                            .all())}
    repeat = len(recent_ngo_ids & prior_funded)
    first_time = len(recent_ngo_ids) - repeat
    return jsonify({
        'total': len(recent_ngo_ids),
        'repeat': repeat,
        'first_time': first_time,
        'window_days': 90,
    })


@dashboard_bp.route('/usage-trend', methods=['GET'])
@login_required
def api_dashboard_usage_trend():
    """Phase 347 — 14-day daily usage trend. Admin-only.

    Returns per-day applications created, AI calls, decisions recorded.
    Used to draw a small line chart on the operator dashboard.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta, date as _date
    from sqlalchemy import text as _text
    now = datetime.now(timezone.utc)
    days = []
    apps = {}
    ai = {}
    dec = {}
    for i in range(13, -1, -1):
        d = (now - timedelta(days=i)).date()
        days.append(d)
        apps[d] = 0
        ai[d] = 0
        dec[d] = 0
    start = days[0]
    end = days[-1] + timedelta(days=1)

    for a in Application.query.filter(Application.created_at >= start, Application.created_at < end).all():
        if a.created_at:
            apps[a.created_at.date()] = apps.get(a.created_at.date(), 0) + 1
    try:
        rows = db.session.execute(_text(
            "SELECT DATE(created_at) AS d, COUNT(*) AS n FROM ai_call_logs WHERE created_at >= :a AND created_at < :b GROUP BY DATE(created_at)"
        ), {'a': start, 'b': end}).fetchall()
        for r in rows:
            try:
                d = r[0] if isinstance(r[0], _date) else _date.fromisoformat(str(r[0])[:10])
                ai[d] = int(r[1])
            except Exception:
                pass
    except Exception:
        pass
    for a in Application.query.filter(
        Application.decision_recorded_at.isnot(None),
        Application.decision_recorded_at >= start,
        Application.decision_recorded_at < end,
    ).all():
        if a.decision_recorded_at:
            dec[a.decision_recorded_at.date()] = dec.get(a.decision_recorded_at.date(), 0) + 1
    return jsonify({
        'series': [{
            'date': d.isoformat(),
            'applications': apps[d],
            'ai_calls': ai[d],
            'decisions': dec[d],
        } for d in days],
    })


@dashboard_bp.route('/applications-by-status', methods=['GET'])
@login_required
def api_dashboard_applications_by_status():
    """Phase 337 — Counts of applications across the system, grouped by status.

    Admin-only. Used as a stacked horizontal bar on the operator dashboard.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from sqlalchemy import func
    rows = (db.session.query(Application.status, func.count(Application.id))
            .group_by(Application.status)
            .all())
    out = {row[0] or 'unknown': int(row[1]) for row in rows}
    total = sum(out.values())
    return jsonify({'by_status': out, 'total': total})


@dashboard_bp.route('/decisions-by-month', methods=['GET'])
@login_required
def api_dashboard_decisions_by_month():
    """Phase 332 — Donor decisions per month for last 6 months.

    Returns funded / declined / total per month so the donor can spot
    momentum or backlogs. Self-gates client-side when total is zero.
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    from collections import defaultdict
    now = datetime.now(timezone.utc)
    six_months_ago = now - timedelta(days=180)
    apps = (Application.query
            .join(Grant)
            .filter(Grant.donor_org_id == current_user.org_id,
                    Application.decision_recorded_at.isnot(None),
                    Application.decision_recorded_at >= six_months_ago)
            .all())
    by_month: dict[str, dict[str, int]] = defaultdict(lambda: {'funded': 0, 'declined': 0})
    for a in apps:
        if not a.decision_recorded_at:
            continue
        key = a.decision_recorded_at.strftime('%Y-%m')
        if a.status in ('funded', 'awarded'):
            by_month[key]['funded'] += 1
        elif a.status in ('declined', 'rejected'):
            by_month[key]['declined'] += 1
    months = sorted(by_month.keys())
    return jsonify({
        'months': [{
            'month': m,
            'funded': by_month[m]['funded'],
            'declined': by_month[m]['declined'],
            'total': by_month[m]['funded'] + by_month[m]['declined'],
        } for m in months],
    })


@dashboard_bp.route('/reviewer-turnaround', methods=['GET'])
@login_required
def api_dashboard_reviewer_turnaround():
    """Phase 328 — Average days from review assignment to completion,
    per reviewer, scoped to the donor's grants over the last 90 days.

    Shows the slowest 5 reviewers (most days to complete). Useful when
    the donor's queue is backed up and they want to ask admin to
    rebalance.
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from collections import defaultdict
    from datetime import datetime, timezone, timedelta
    from app.models import Review, User
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    rows = (Review.query
            .join(Application, Application.id == Review.application_id)
            .join(Grant, Grant.id == Application.grant_id)
            .filter(Grant.donor_org_id == current_user.org_id,
                    Review.status == 'completed',
                    Review.completed_at.isnot(None),
                    Review.completed_at >= cutoff)
            .all())
    by_reviewer: dict[int, list[float]] = defaultdict(list)
    for r in rows:
        if r.completed_at and r.created_at:
            d = (r.completed_at - r.created_at).total_seconds() / 86400.0
            if d >= 0:
                by_reviewer[r.reviewer_user_id].append(d)
    out = []
    name_by_id = {u.id: u.name for u in User.query.filter(User.id.in_(list(by_reviewer.keys()))).all()}
    for rid, days in by_reviewer.items():
        if len(days) < 3:
            continue
        out.append({
            'reviewer_user_id': rid,
            'reviewer_name': name_by_id.get(rid) or f'Reviewer #{rid}',
            'avg_days': round(sum(days) / len(days), 1),
            'n': len(days),
        })
    out.sort(key=lambda r: r['avg_days'], reverse=True)
    return jsonify({'slowest': out[:5], 'window_days': 90})


@dashboard_bp.route('/reviewer-scoreboard', methods=['GET'])
@login_required
def api_dashboard_reviewer_scoreboard():
    """Phase 333 — Per-reviewer rollup. Admin-only.

    For each reviewer: total assigned, completed, completion %, mean
    human score. Sorted by completion % ascending so the most-behind
    reviewers surface first.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from collections import defaultdict
    from app.models import Review, User
    rows = Review.query.all()
    by_reviewer: dict[int, dict] = defaultdict(lambda: {'total': 0, 'completed': 0, 'scores': []})
    for r in rows:
        slot = by_reviewer[r.reviewer_user_id]
        slot['total'] += 1
        if r.status == 'completed':
            slot['completed'] += 1
        if r.overall_score is not None:
            slot['scores'].append(float(r.overall_score))
    ids = list(by_reviewer.keys())
    name_by_id = {u.id: u.name for u in User.query.filter(User.id.in_(ids)).all()}
    email_by_id = {u.id: u.email for u in User.query.filter(User.id.in_(ids)).all()}
    out = []
    for rid, s in by_reviewer.items():
        if s['total'] == 0:
            continue
        completion_pct = round(100 * s['completed'] / s['total'], 1)
        mean_score = round(sum(s['scores']) / len(s['scores']), 1) if s['scores'] else None
        out.append({
            'reviewer_user_id': rid,
            'name': name_by_id.get(rid) or email_by_id.get(rid) or f'Reviewer {rid}',
            'total': s['total'],
            'completed': s['completed'],
            'completion_pct': completion_pct,
            'mean_score': mean_score,
        })
    out.sort(key=lambda r: r['completion_pct'])
    return jsonify({'reviewers': out})


@dashboard_bp.route('/notification-volume', methods=['GET'])
@login_required
def api_dashboard_notification_volume():
    """Phase 325 — 5 noisiest notification recipients in the last 7 days.

    Admin-only. Helps spot users getting blasted (broken filtering, etc).
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    from sqlalchemy import func
    from app.models import Notification, User
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    rows = (db.session.query(Notification.user_id, func.count(Notification.id).label('n'))
            .filter(Notification.created_at >= cutoff)
            .group_by(Notification.user_id)
            .order_by(func.count(Notification.id).desc())
            .limit(5)
            .all())
    if not rows:
        return jsonify({'noisiest': [], 'total': 0})
    ids = [r.user_id for r in rows]
    users_by_id = {u.id: u for u in User.query.filter(User.id.in_(ids)).all()}
    total = (db.session.query(func.count(Notification.id))
             .filter(Notification.created_at >= cutoff)
             .scalar() or 0)
    out = []
    for r in rows:
        u = users_by_id.get(r.user_id)
        out.append({
            'user_id': r.user_id,
            'name': (u.name if u else None) or (u.email if u else f'User {r.user_id}'),
            'email': u.email if u else None,
            'count': int(r.n),
        })
    return jsonify({'noisiest': out, 'total': int(total), 'window_days': 7})


@dashboard_bp.route('/ai-human-agreement', methods=['GET'])
@login_required
def api_dashboard_ai_human_agreement():
    """Phase 323 — Per-criterion agreement rate between AI score and the
    average reviewer human score for this donor's grants.

    Considers a pair "in agreement" when |ai - human| <= 10 points.
    Returns rows sorted ascending by agreement_pct (most-divergent first).
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from collections import defaultdict
    apps = (Application.query
            .join(Grant)
            .filter(Grant.donor_org_id == current_user.org_id,
                    Application.ai_rubric_result_json.isnot(None))
            .all())

    # criterion_key -> [(ai_score, human_score), ...]
    pairs: dict[str, list[tuple[float, float]]] = defaultdict(list)
    labels: dict[str, str] = {}

    for a in apps:
        rubric = a.get_ai_rubric_result() if hasattr(a, 'get_ai_rubric_result') else None
        if not isinstance(rubric, dict):
            continue
        per = rubric.get('per_criterion') or rubric.get('scores') or {}
        if a.grant and hasattr(a.grant, 'get_criteria'):
            for c in (a.grant.get_criteria() or []):
                if isinstance(c, dict):
                    k = c.get('key') or c.get('id')
                    if k:
                        labels.setdefault(str(k), c.get('label') or str(k))
        # Build per-criterion AI scores
        ai_scores: dict[str, float] = {}
        if isinstance(per, list):
            for item in per:
                if isinstance(item, dict):
                    k = item.get('key') or item.get('id')
                    v = item.get('score') or item.get('value')
                    if k is not None and v is not None:
                        try:
                            ai_scores[str(k)] = float(v)
                        except (TypeError, ValueError):
                            pass
        elif isinstance(per, dict):
            for k, v in per.items():
                try:
                    val = float(v) if not isinstance(v, dict) else float(v.get('score') or v.get('value') or 0)
                    ai_scores[str(k)] = val
                except (TypeError, ValueError):
                    pass
        if not ai_scores:
            continue
        # Average reviewer human scores for this app, per criterion.
        from app.models import Review
        revs = Review.query.filter_by(application_id=a.id, status='completed').all()
        human_by_crit: dict[str, list[float]] = defaultdict(list)
        for r in revs:
            scores = r.get_scores() or {}
            for k, raw in scores.items():
                if isinstance(raw, dict):
                    raw = raw.get('score')
                try:
                    human_by_crit[str(k)].append(float(raw))
                except (TypeError, ValueError):
                    pass
        for k, ai in ai_scores.items():
            humans = human_by_crit.get(k, [])
            if not humans:
                continue
            avg_h = sum(humans) / len(humans)
            pairs[k].append((ai, avg_h))

    out = []
    for k, lst in pairs.items():
        if len(lst) < 3:
            continue
        agree = sum(1 for ai, h in lst if abs(ai - h) <= 10)
        out.append({
            'key': k,
            'label': labels.get(k, k),
            'n': len(lst),
            'agreement_pct': round(100 * agree / len(lst), 1),
        })
    out.sort(key=lambda r: r['agreement_pct'])
    return jsonify({'criteria': out[:5], 'total_criteria_analyzed': len(out)})


@dashboard_bp.route('/ai-cost-forecast', methods=['GET'])
@login_required
def api_dashboard_ai_cost_forecast():
    """Phase 322 — Project month-end AI cost from trailing-7d daily rate.

    Admin-only. Self-gates client-side when sample is too thin.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    from sqlalchemy import text
    now = datetime.now(timezone.utc)
    seven_ago = now - timedelta(days=7)
    try:
        total_7d = db.session.execute(text(
            "SELECT COALESCE(SUM(usd_cost), 0) FROM ai_call_logs WHERE created_at >= :c"
        ), {'c': seven_ago}).scalar() or 0
    except Exception:
        total_7d = 0
    try:
        total_7d = float(total_7d)
    except (TypeError, ValueError):
        total_7d = 0.0
    daily_avg = round(total_7d / 7, 2)
    days_in_month = 30
    projected = round(daily_avg * days_in_month, 2)
    return jsonify({
        'window_days': 7,
        'total_7d': round(total_7d, 2),
        'daily_avg': daily_avg,
        'projected_monthly': projected,
    })


@dashboard_bp.route('/appeal-stats', methods=['GET'])
@login_required
def api_dashboard_appeal_stats():
    """Phase 316 — Appeal resolution rollup over the last 30 days.

    Admin-only. Counts approved / declined / still-pending + median
    days-to-resolve. Self-gates client-side when total == 0.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    rows = (Application.query
            .filter(Application.appeal_requested_at.isnot(None),
                    Application.appeal_requested_at >= cutoff)
            .all())
    approved = 0
    declined = 0
    pending = 0
    resolution_days = []
    for a in rows:
        if a.appeal_resolved_at:
            if a.appeal_resolution == 'approved':
                approved += 1
            elif a.appeal_resolution == 'declined':
                declined += 1
            if a.appeal_requested_at:
                d = (a.appeal_resolved_at - a.appeal_requested_at).total_seconds() / 86400.0
                if d >= 0:
                    resolution_days.append(d)
        else:
            pending += 1
    median = None
    if resolution_days:
        s = sorted(resolution_days)
        mid = len(s) // 2
        median = round(s[mid] if len(s) % 2 else (s[mid - 1] + s[mid]) / 2.0, 1)
    return jsonify({
        'window_days': 30,
        'total': len(rows),
        'approved': approved,
        'declined': declined,
        'pending': pending,
        'median_days_to_resolve': median,
    })


@dashboard_bp.route('/data-integrity', methods=['GET'])
@login_required
def api_dashboard_data_integrity():
    """Phase 305 — Cheap orphan-reference check across core tables.

    Surfaces structural drift the bootstrap ALTER pattern + FKs are
    supposed to prevent. Admin-only. Self-gates client-side when all
    counts are zero.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from sqlalchemy import text
    issues = {}
    try:
        orphan_reviews = db.session.execute(text(
            'SELECT COUNT(*) FROM reviews r '
            'LEFT JOIN applications a ON a.id = r.application_id '
            'WHERE a.id IS NULL'
        )).scalar() or 0
        issues['reviews_missing_application'] = int(orphan_reviews)
    except Exception:
        issues['reviews_missing_application'] = None
    try:
        orphan_apps = db.session.execute(text(
            'SELECT COUNT(*) FROM applications a '
            'LEFT JOIN grants g ON g.id = a.grant_id '
            'WHERE g.id IS NULL'
        )).scalar() or 0
        issues['applications_missing_grant'] = int(orphan_apps)
    except Exception:
        issues['applications_missing_grant'] = None
    try:
        orphan_docs = db.session.execute(text(
            'SELECT COUNT(*) FROM documents d '
            'LEFT JOIN applications a ON a.id = d.application_id '
            'WHERE a.id IS NULL AND d.application_id IS NOT NULL'
        )).scalar() or 0
        issues['documents_missing_application'] = int(orphan_docs)
    except Exception:
        issues['documents_missing_application'] = None
    total = sum(v for v in issues.values() if isinstance(v, int))
    return jsonify({
        'total': total,
        'issues': issues,
    })


@dashboard_bp.route('/stale-published-grants', methods=['GET'])
@login_required
def api_dashboard_stale_published_grants():
    """Phase 353 — Grants still 'open' whose deadline has passed by > 7d.

    Operational drift signal. Admin-only. Lists 3 oldest.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    rows = (Grant.query
            .filter(Grant.status == 'open',
                    Grant.deadline.isnot(None),
                    Grant.deadline < cutoff)
            .order_by(Grant.deadline.asc())
            .all())
    out = []
    for g in rows[:3]:
        out.append({
            'grant_id': g.id,
            'title': g.title,
            'deadline': g.deadline.isoformat() if g.deadline else None,
        })
    return jsonify({'total': len(rows), 'oldest': out})


@dashboard_bp.route('/users-without-2fa', methods=['GET'])
@login_required
def api_dashboard_users_without_2fa():
    """Phase 357 — Privileged users without TOTP 2FA.

    Admin-only. Surfaces admin / donor / reviewer accounts where
    `totp_enabled` is false. Skips NGOs (most NGO users won't 2FA).
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from app.models import User
    rows = User.query.filter(
        User.role.in_(['admin', 'donor', 'reviewer']),
        User.totp_enabled.is_(False),
    ).all()
    out = []
    for u in rows[:5]:
        out.append({
            'id': u.id,
            'name': u.name or u.email,
            'role': u.role,
        })
    return jsonify({'total': len(rows), 'sample': out})


@dashboard_bp.route('/expired-screenings', methods=['GET'])
@login_required
def api_dashboard_expired_screenings():
    """Phase 351 — NGO orgs whose latest sanctions screening is > 6 months old.

    Admin-only. Surfaces 3 oldest. Self-gates client-side when zero.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    from collections import defaultdict
    from app.models import Organization, AdverseMediaScreening
    cutoff = datetime.now(timezone.utc) - timedelta(days=180)

    # Latest screening per org.
    latest_by_org: dict[int, AdverseMediaScreening] = {}
    rows = (AdverseMediaScreening.query
            .order_by(AdverseMediaScreening.screened_at.desc())
            .all())
    for r in rows:
        if r.org_id not in latest_by_org:
            latest_by_org[r.org_id] = r

    # NGO orgs only — filter by org_type/active where possible.
    ngo_orgs = Organization.query.filter(
        getattr(Organization, 'org_type', None) == 'ngo'
        if hasattr(Organization, 'org_type') else True
    ).all() if hasattr(Organization, 'org_type') else Organization.query.all()

    overdue: list[dict] = []
    for o in ngo_orgs:
        s = latest_by_org.get(o.id)
        if s is None:
            continue
        if s.screened_at and s.screened_at < cutoff:
            overdue.append({
                'org_id': o.id,
                'org_name': o.name,
                'last_screened_at': s.screened_at.isoformat() if s.screened_at else None,
            })
    overdue.sort(key=lambda r: r['last_screened_at'] or '')
    return jsonify({'total': len(overdue), 'oldest': overdue[:3]})


@dashboard_bp.route('/sla-breaches', methods=['GET'])
@login_required
def api_dashboard_sla_breaches():
    """Phase 301 — Applications past the expected decision deadline.

    Default: 30 days after submitted_at, status still pre-decision.
    Admin-only. Returns count + the 3 most overdue.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    sla_days = 30
    threshold = datetime.now(timezone.utc) - timedelta(days=sla_days)
    PRE_DECISION = ['submitted', 'under_review', 'scored']
    overdue = (Application.query
               .filter(Application.status.in_(PRE_DECISION),
                       Application.submitted_at.isnot(None),
                       Application.submitted_at <= threshold)
               .order_by(Application.submitted_at.asc())
               .all())
    now = datetime.now(timezone.utc)
    top = []
    for a in overdue[:3]:
        days_overdue = int((now - a.submitted_at).total_seconds() / 86400) - sla_days
        org_name = a.ngo_org.name if a.ngo_org else None
        top.append({
            'application_id': a.id,
            'ngo_org_name': org_name,
            'grant_title': a.grant.title if a.grant else None,
            'days_overdue': days_overdue,
            'status': a.status,
        })
    return jsonify({
        'sla_days': sla_days,
        'total': len(overdue),
        'most_overdue': top,
    })


@dashboard_bp.route('/reviewer-workload-by-donor', methods=['GET'])
@login_required
def api_dashboard_reviewer_workload_by_donor():
    """Phase 299 — For the donor's grants, which reviewers cover what
    share + their avg days to complete.

    Helps the donor see if work is balanced + who is fast vs slow.
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from app.models import Review, User
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)

    # All reviews on this donor's applications in the last 90 days.
    rows = (Review.query
            .join(Application, Application.id == Review.application_id)
            .join(Grant, Grant.id == Application.grant_id)
            .filter(Grant.donor_org_id == current_user.org_id,
                    Review.created_at >= cutoff)
            .all())

    if not rows:
        return jsonify({'reviewers': [], 'total': 0})

    from collections import defaultdict
    by_reviewer = defaultdict(lambda: {'total': 0, 'completed': 0, 'days_sum': 0.0})
    for r in rows:
        slot = by_reviewer[r.reviewer_user_id]
        slot['total'] += 1
        if r.status == 'completed' and r.completed_at and r.created_at:
            slot['completed'] += 1
            slot['days_sum'] += (r.completed_at - r.created_at).total_seconds() / 86400.0

    reviewer_ids = list(by_reviewer.keys())
    name_by_id = {u.id: u.name for u in User.query.filter(User.id.in_(reviewer_ids)).all()}

    total = sum(s['total'] for s in by_reviewer.values())
    out = []
    for rid, s in by_reviewer.items():
        avg_days = round(s['days_sum'] / s['completed'], 1) if s['completed'] > 0 else None
        out.append({
            'reviewer_user_id': rid,
            'reviewer_name': name_by_id.get(rid) or f'Reviewer #{rid}',
            'total': s['total'],
            'completed': s['completed'],
            'share_pct': round(100 * s['total'] / total, 1) if total else 0,
            'avg_days_to_complete': avg_days,
        })
    out.sort(key=lambda r: r['total'], reverse=True)
    return jsonify({'reviewers': out, 'total': total, 'window_days': 90})


@dashboard_bp.route('/donor-outreach-rollup', methods=['GET'])
@login_required
def api_dashboard_donor_outreach_rollup():
    """Phase 293 — Donor outreach progress on stale declines.

    Counts the donor's declined applications in the trailing 30 days
    where outreach has been initiated vs not. The pair makes it easy
    to see how much follow-up is still owed.
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)

    q = (Application.query
         .join(Grant)
         .filter(Grant.donor_org_id == current_user.org_id,
                 Application.status.in_(['declined', 'rejected']),
                 Application.decision_recorded_at.isnot(None),
                 Application.decision_recorded_at >= cutoff))
    apps = q.all()
    started = sum(1 for a in apps if a.outreach_initiated_at is not None)
    pending = sum(1 for a in apps if a.outreach_initiated_at is None)
    return jsonify({
        'window_days': 30,
        'total': len(apps),
        'outreach_started': started,
        'outreach_pending': pending,
    })


@dashboard_bp.route('/ngo-win-rate-trend', methods=['GET'])
@login_required
def api_dashboard_ngo_win_rate_trend():
    """Phase 355 — This NGO's award rate over the last 3 months vs the
    prior 3 months. Highlights momentum or a slowdown.
    """
    if current_user.role != 'ngo' or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    recent_start = now - timedelta(days=90)
    prior_start = now - timedelta(days=180)
    DECIDED = ['funded', 'awarded', 'declined', 'rejected']
    WIN = {'funded', 'awarded'}

    def _stats(start, end):
        q = (Application.query
             .filter(Application.ngo_org_id == current_user.org_id,
                     Application.status.in_(DECIDED),
                     Application.decision_recorded_at.isnot(None),
                     Application.decision_recorded_at >= start,
                     Application.decision_recorded_at < end)
             .all())
        total = len(q)
        wins = sum(1 for a in q if a.status in WIN)
        return total, wins
    recent_total, recent_wins = _stats(recent_start, now)
    prior_total, prior_wins = _stats(prior_start, recent_start)
    def _rate(t, w):
        return round(100 * w / t, 1) if t > 0 else None
    return jsonify({
        'recent_total': recent_total,
        'recent_win_rate': _rate(recent_total, recent_wins),
        'prior_total': prior_total,
        'prior_win_rate': _rate(prior_total, prior_wins),
    })


@dashboard_bp.route('/ngo-application-duration', methods=['GET'])
@login_required
def api_dashboard_ngo_application_duration():
    """Phase 350 — Submit→decision durations for the NGO's last 6
    decided applications, oldest first. Used for a small sparkline.
    """
    if current_user.role != 'ngo' or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    DECIDED = ['funded', 'awarded', 'declined', 'rejected']
    rows = (Application.query
            .filter(Application.ngo_org_id == current_user.org_id,
                    Application.status.in_(DECIDED),
                    Application.submitted_at.isnot(None),
                    Application.decision_recorded_at.isnot(None))
            .order_by(Application.decision_recorded_at.desc())
            .limit(6)
            .all())
    rows = list(reversed(rows))
    out = []
    for a in rows:
        if a.submitted_at and a.decision_recorded_at:
            d = (a.decision_recorded_at - a.submitted_at).total_seconds() / 86400.0
            if d >= 0:
                out.append({
                    'application_id': a.id,
                    'days': round(d, 1),
                    'status': a.status,
                })
    return jsonify({'durations': out})


@dashboard_bp.route('/ngo-decision-velocity', methods=['GET'])
@login_required
def api_dashboard_ngo_decision_velocity():
    """Phase 291 — NGO mirror of donor decision velocity.

    Median days from this NGO's submitted_at to updated_at on apps that
    have been decided in the trailing 90 days, plus a count of apps
    currently pending decision. Lets NGOs gauge wait expectations.
    """
    if current_user.role != 'ngo':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)

    DECIDED = {'funded', 'awarded', 'declined', 'rejected'}
    PENDING = {'submitted', 'under_review', 'scored'}

    decided = (Application.query
               .filter(Application.ngo_org_id == current_user.org_id,
                       Application.status.in_(list(DECIDED)),
                       Application.submitted_at.isnot(None),
                       Application.updated_at >= cutoff)
               .all())
    days = []
    for a in decided:
        if not a.submitted_at or not a.updated_at:
            continue
        d = (a.updated_at - a.submitted_at).total_seconds() / 86400.0
        if d >= 0:
            days.append(d)
    pending = (Application.query
               .filter(Application.ngo_org_id == current_user.org_id,
                       Application.status.in_(list(PENDING)))
               .count())

    def _median(xs):
        if not xs:
            return None
        xs = sorted(xs)
        mid = len(xs) // 2
        if len(xs) % 2:
            return round(xs[mid], 1)
        return round((xs[mid - 1] + xs[mid]) / 2.0, 1)

    return jsonify({
        'window_days': 90,
        'decided_count': len(days),
        'median_days': _median(days),
        'pending_count': pending,
    })


@dashboard_bp.route('/decision-velocity', methods=['GET'])
@login_required
def api_dashboard_decision_velocity():
    """Phase 284 — Decision velocity for a donor's grants.

    Walks each decided application from the trailing 90 days and computes
    median days from submitted_at -> updated_at (no discrete decided_at;
    using updated_at on the decision-applied row is the best proxy).
    Splits by funded vs declined so the donor can see whether either path
    drags.

    Response: { median_days, funded: { n, median_days },
                declined: { n, median_days }, total_decided }
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)

    DECIDED = {'funded', 'awarded', 'declined', 'rejected'}
    FUNDED = {'funded', 'awarded'}
    DECLINED = {'declined', 'rejected'}

    q = (Application.query
         .join(Grant)
         .filter(Grant.donor_org_id == current_user.org_id,
                 Application.status.in_(list(DECIDED)),
                 Application.submitted_at.isnot(None),
                 Application.updated_at >= cutoff))

    funded_days = []
    declined_days = []
    for a in q.all():
        if not a.submitted_at or not a.updated_at:
            continue
        delta = (a.updated_at - a.submitted_at).total_seconds() / 86400.0
        if delta < 0:
            continue
        if a.status in FUNDED:
            funded_days.append(delta)
        elif a.status in DECLINED:
            declined_days.append(delta)

    def _median(xs):
        if not xs:
            return None
        xs = sorted(xs)
        mid = len(xs) // 2
        if len(xs) % 2:
            return round(xs[mid], 1)
        return round((xs[mid - 1] + xs[mid]) / 2.0, 1)

    all_days = funded_days + declined_days
    return jsonify({
        'window_days': 90,
        'total_decided': len(all_days),
        'median_days': _median(all_days),
        'funded': {'n': len(funded_days), 'median_days': _median(funded_days)},
        'declined': {'n': len(declined_days), 'median_days': _median(declined_days)},
    })


@dashboard_bp.route('/donor-cohort-analytics', methods=['GET'])
@login_required
def api_donor_cohort_analytics():
    """Compare caller donor's awarded portfolio against other donors'
    awarded portfolios across capacity, AI score, diversity, small-org
    funding share, and grantee reporting compliance.

    Donors see their own portfolio; admin can inspect any via
    ?donor_org_id=. Cached 5 minutes.
    """
    from app.services.donor_cohort_analytics_service import (
        DonorCohortAnalyticsService,
    )

    if current_user.role == 'donor':
        if not current_user.org_id:
            return jsonify({'success': False, 'error': 'Donor org required'}), 400
        donor_id = current_user.org_id
    elif current_user.role == 'admin':
        raw = request.args.get('donor_org_id')
        if not raw:
            return jsonify({'success': False, 'error': 'admin must pass donor_org_id'}), 400
        try:
            donor_id = int(raw)
        except (TypeError, ValueError):
            return jsonify({'success': False, 'error': 'donor_org_id must be int'}), 400
    else:
        return jsonify({'success': False, 'error': 'Role not supported'}), 403

    cache_key = f'donor_cohort_analytics_{donor_id}'
    cached = _dashboard_cache.get(cache_key)
    if cached is not None:
        return jsonify({'cached': True, **cached})
    result = DonorCohortAnalyticsService.for_donor(donor_org_id=donor_id)
    _dashboard_cache.set(cache_key, result)
    return jsonify(result)


# ----------------------------------------------------------------------
# Phase 17B — NGO onboarding checklist (drops out once all 3 steps done).
# ----------------------------------------------------------------------

@dashboard_bp.route('/onboarding', methods=['GET'])
@login_required
def api_dashboard_onboarding():
    if current_user.role not in ('ngo', 'donor'):
        return jsonify({'success': False, 'reason': 'role_not_supported'})
    if not current_user.org_id:
        return jsonify({'success': False, 'reason': 'no_org'})
    from app.services.onboarding_service import OnboardingService
    cache_key = f'onboarding_{current_user.role}_{current_user.org_id}'
    cached = _dashboard_cache.get(cache_key)
    if cached is not None:
        return jsonify({'cached': True, **cached})
    if current_user.role == 'ngo':
        result = OnboardingService.for_ngo(ngo_org_id=current_user.org_id)
    else:
        result = OnboardingService.for_donor(donor_org_id=current_user.org_id)
    _dashboard_cache.set(cache_key, result)
    return jsonify(result)


# ----------------------------------------------------------------------
# Phase 16E — Reviewer throughput / SLA dashboard.
# Reviewer sees their own; admin can inspect any via ?reviewer_id=.
# ----------------------------------------------------------------------

@dashboard_bp.route('/reviewer-throughput', methods=['GET'])
@login_required
def api_dashboard_reviewer_throughput():
    from flask import request as _request
    from app.services.reviewer_throughput_service import ReviewerThroughputService

    if current_user.role == 'reviewer':
        rid = current_user.id
    elif current_user.role == 'admin':
        raw = _request.args.get('reviewer_id')
        if not raw:
            return jsonify({'success': False, 'error': 'admin must pass reviewer_id'}), 400
        try:
            rid = int(raw)
        except (TypeError, ValueError):
            return jsonify({'success': False, 'error': 'reviewer_id must be int'}), 400
    else:
        return jsonify({'success': False, 'error': 'Role not supported'}), 403

    cache_key = f'reviewer_throughput_{rid}'
    cached = _dashboard_cache.get(cache_key)
    if cached is not None:
        return jsonify({'cached': True, **cached})
    result = ReviewerThroughputService.for_reviewer(reviewer_user_id=rid)
    _dashboard_cache.set(cache_key, result)
    return jsonify(result)


@dashboard_bp.route('/ngo-stalled-applications', methods=['GET'])
@login_required
def api_dashboard_ngo_stalled_applications():
    """Phase 361 — NGO's applications stuck in the same pending status
    for more than 7 days. Each row shows the status + days stalled so
    the NGO knows where the bottleneck is.
    """
    if current_user.role != 'ngo' or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    PENDING = ['submitted', 'under_review', 'scored', 'revision_requested']
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    rows = (Application.query
            .filter(Application.ngo_org_id == current_user.org_id,
                    Application.status.in_(PENDING),
                    Application.updated_at < cutoff)
            .order_by(Application.updated_at.asc())
            .limit(6)
            .all())
    now = datetime.now(timezone.utc)
    out = []
    for a in rows:
        if not a.updated_at:
            continue
        days = (now - a.updated_at).total_seconds() / 86400.0
        out.append({
            'application_id': a.id,
            'grant_title': a.grant.title if a.grant else None,
            'status': a.status,
            'days_stalled': int(round(days)),
        })
    return jsonify({'stalled': out, 'total': len(out)})


@dashboard_bp.route('/donor-fastest-reviewer', methods=['GET'])
@login_required
def api_dashboard_donor_fastest_reviewer():
    """Phase 362 — The reviewer with the shortest median turnaround on
    this donor's grants over the last 30 days. Returns null if fewer
    than 3 reviewers each completed >=2 reviews in the window (avoid
    crowning someone on one data point).
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    from collections import defaultdict
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    rows = (db.session.query(Review.reviewer_user_id, Review.created_at, Review.completed_at)
            .join(Application, Application.id == Review.application_id)
            .join(Grant, Grant.id == Application.grant_id)
            .filter(Grant.donor_org_id == current_user.org_id,
                    Review.status == 'completed',
                    Review.completed_at.isnot(None),
                    Review.completed_at >= cutoff)
            .all())
    if not rows:
        return jsonify({'reviewer': None, 'reason': 'no_data'})
    by_reviewer = defaultdict(list)
    for rid, created, completed in rows:
        if not created or not completed:
            continue
        d = (completed - created).total_seconds() / 86400.0
        if d >= 0:
            by_reviewer[rid].append(d)
    eligible = {rid: days for rid, days in by_reviewer.items() if len(days) >= 2}
    if len(eligible) < 3:
        return jsonify({'reviewer': None, 'reason': 'insufficient_reviewers'})
    def _median(xs):
        s = sorted(xs)
        n = len(s)
        return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2.0
    medians = {rid: _median(days) for rid, days in eligible.items()}
    winner_id = min(medians, key=medians.get)
    winner = User.query.get(winner_id)
    return jsonify({
        'reviewer': {
            'user_id': winner_id,
            'name': winner.name if winner else None,
            'median_days': round(medians[winner_id], 1),
            'reviews_completed': len(eligible[winner_id]),
        },
    })


@dashboard_bp.route('/peers-watching-grant/<int:grant_id>', methods=['GET'])
@login_required
def api_dashboard_peers_watching_grant(grant_id):
    """Phase 433 — Count of distinct other users watchlisting this
    grant. Social signal — popular grants may be competitive.
    """
    if current_user.role not in ('ngo', 'donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from app.models.watchlist import WatchlistItem
    total = (db.session.query(db.func.count(db.distinct(WatchlistItem.user_id)))
             .filter(WatchlistItem.kind == 'grant',
                     WatchlistItem.target_id == grant_id,
                     WatchlistItem.user_id != current_user.id)
             .scalar() or 0)
    return jsonify({'grant_id': grant_id, 'others_watching': int(total)})


@dashboard_bp.route('/donor-apps-per-grant', methods=['GET'])
@login_required
def api_dashboard_donor_apps_per_grant():
    """Phase 434 — Mean number of applications received per grant
    over the last 90 days for this donor. Reach health signal.
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    grants_with_published = (Grant.query
                             .filter(Grant.donor_org_id == current_user.org_id,
                                     Grant.published_at.isnot(None),
                                     Grant.published_at >= cutoff)
                             .count())
    if grants_with_published == 0:
        return jsonify({'mean_apps_per_grant': None, 'grants': 0, 'apps': 0})
    apps = (Application.query
            .join(Grant)
            .filter(Grant.donor_org_id == current_user.org_id,
                    Application.submitted_at.isnot(None),
                    Application.submitted_at >= cutoff)
            .count())
    return jsonify({
        'mean_apps_per_grant': round(apps / grants_with_published, 1),
        'grants': grants_with_published,
        'apps': apps,
    })


@dashboard_bp.route('/reviewer-fastest-score', methods=['GET'])
@login_required
def api_dashboard_reviewer_fastest_score():
    """Phase 435 — Reviewer's minimum turnaround time across completed
    reviews in last 90 days, with sample size for context.
    """
    if current_user.role != 'reviewer':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    rows = (Review.query
            .filter(Review.reviewer_user_id == current_user.id,
                    Review.status.in_(['submitted', 'scored', 'completed']),
                    Review.created_at.isnot(None),
                    Review.completed_at.isnot(None),
                    Review.completed_at >= cutoff)
            .all())
    durations = []
    for r in rows:
        if not r.created_at or not r.completed_at:
            continue
        h = (r.completed_at - r.created_at).total_seconds() / 3600.0
        if h >= 0:
            durations.append(h)
    if not durations:
        return jsonify({'fastest_hours': None, 'sample': 0})
    return jsonify({
        'fastest_hours': round(min(durations), 1),
        'sample': len(durations),
    })


@dashboard_bp.route('/ai-calls-by-hour', methods=['GET'])
@login_required
def api_dashboard_ai_calls_by_hour():
    """Phase 436 — AI call counts grouped by hour-of-day over the last
    7 days. Identifies peak load windows.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    from sqlalchemy import text as _text
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    buckets = [0] * 24
    try:
        rows = db.session.execute(_text(
            "SELECT created_at FROM ai_call_logs WHERE created_at >= :c"
        ), {'c': cutoff}).all()
        for (created_at,) in rows:
            if created_at is None:
                continue
            try:
                buckets[created_at.hour] += 1
            except (AttributeError, IndexError):
                continue
    except Exception:
        pass
    return jsonify({'buckets': buckets, 'total': sum(buckets)})


@dashboard_bp.route('/ngo-deadline-density', methods=['GET'])
@login_required
def api_dashboard_ngo_deadline_density():
    """Phase 427 — Count of grants this NGO is watching, bucketed by
    deadline window (next 7d / 30d / 90d). Planning helper.
    """
    if current_user.role != 'ngo' or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    from app.models.watchlist import WatchlistItem
    today = datetime.now(timezone.utc).date()
    rows = (db.session.query(Grant.deadline)
            .join(WatchlistItem, db.and_(
                WatchlistItem.kind == 'grant',
                WatchlistItem.target_id == Grant.id,
            ))
            .filter(WatchlistItem.user_id == current_user.id,
                    Grant.deadline.isnot(None),
                    Grant.status.in_(['open', 'review']))
            .all())
    buckets = {'next_7d': 0, 'next_30d': 0, 'next_90d': 0}
    for (deadline,) in rows:
        if not deadline:
            continue
        days = (deadline - today).days
        if days < 0:
            continue
        if days <= 7:
            buckets['next_7d'] += 1
        elif days <= 30:
            buckets['next_30d'] += 1
        elif days <= 90:
            buckets['next_90d'] += 1
    return jsonify({'buckets': buckets, 'total_watching': len(rows)})


@dashboard_bp.route('/donor-median-funded-amount', methods=['GET'])
@login_required
def api_dashboard_donor_median_funded_amount():
    """Phase 428 — Median total_funding across grants where this donor
    has at least one funded application in the last 90 days. Mirrors
    the typical award size for the donor.
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    rows = (db.session.query(Grant.total_funding, Grant.currency)
            .join(Application, Application.grant_id == Grant.id)
            .filter(Grant.donor_org_id == current_user.org_id,
                    Application.status.in_(['funded', 'awarded']),
                    Application.decision_recorded_at >= cutoff,
                    Grant.total_funding.isnot(None))
            .all())
    if not rows:
        return jsonify({'median': None, 'sample': 0, 'currency': None})
    amounts = []
    currencies = {}
    for amount, cur in rows:
        try:
            amounts.append(float(amount))
            cur = cur or 'USD'
            currencies[cur] = currencies.get(cur, 0) + 1
        except (TypeError, ValueError):
            continue
    if not amounts:
        return jsonify({'median': None, 'sample': 0, 'currency': None})
    amounts.sort()
    n = len(amounts)
    median = amounts[n // 2] if n % 2 else (amounts[n // 2 - 1] + amounts[n // 2]) / 2.0
    # Pick the most common currency
    top_currency = max(currencies, key=currencies.get) if currencies else 'USD'
    return jsonify({
        'median': round(median, 2),
        'sample': n,
        'currency': top_currency,
    })


@dashboard_bp.route('/reviewer-overdue-count', methods=['GET'])
@login_required
def api_dashboard_reviewer_overdue_count():
    """Phase 429 — Count of this reviewer's reviews that are still
    in 'assigned' status and were created more than 14 days ago.
    """
    if current_user.role != 'reviewer':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=14)
    count = Review.query.filter(
        Review.reviewer_user_id == current_user.id,
        Review.status == 'assigned',
        Review.created_at < cutoff,
    ).count()
    return jsonify({'overdue': count, 'cutoff_days': 14})


@dashboard_bp.route('/cron-failure-rate', methods=['GET'])
@login_required
def api_dashboard_cron_failure_rate():
    """Phase 430 — % of cron_runs in the last 24h with success=False.
    Health signal across the entire cron fleet.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    from sqlalchemy import text as _text
    cutoff = datetime.now(timezone.utc) - timedelta(days=1)
    try:
        row = db.session.execute(_text(
            "SELECT COUNT(*) AS total, "
            "SUM(CASE WHEN success = 0 OR success = false THEN 1 ELSE 0 END) AS failed "
            "FROM cron_runs WHERE ran_at >= :c"
        ), {'c': cutoff}).first()
        total = int(row.total or 0)
        failed = int(row.failed or 0)
    except Exception:
        total = 0
        failed = 0
    if total == 0:
        return jsonify({'total': 0, 'failed': 0, 'failure_pct': None})
    return jsonify({
        'total': total,
        'failed': failed,
        'failure_pct': round(100 * failed / total, 1),
    })


@dashboard_bp.route('/ngo-criterion-score-trend', methods=['GET'])
@login_required
def api_dashboard_ngo_criterion_score_trend():
    """Phase 421 — Average AI rubric score per criterion across this
    NGO's last 5 submitted applications. Surfaces where the NGO is
    consistently strong vs weak.
    """
    if current_user.role != 'ngo' or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    from collections import defaultdict
    rows = (Application.query
            .filter(Application.ngo_org_id == current_user.org_id,
                    Application.submitted_at.isnot(None),
                    Application.ai_rubric_result_json.isnot(None))
            .order_by(Application.submitted_at.desc())
            .limit(5)
            .all())
    by_criterion = defaultdict(list)
    for a in rows:
        rubric = a.get_ai_rubric_result() if hasattr(a, 'get_ai_rubric_result') else None
        if not isinstance(rubric, dict):
            continue
        scores = rubric.get('criterion_scores') or {}
        if not isinstance(scores, dict):
            continue
        for cid, payload in scores.items():
            if isinstance(payload, dict) and 'score' in payload:
                try:
                    by_criterion[str(cid)].append(float(payload['score']))
                except (TypeError, ValueError):
                    continue
    out = []
    for cid, vals in by_criterion.items():
        if not vals:
            continue
        out.append({
            'criterion_id': cid,
            'avg_score': round(sum(vals) / len(vals), 1),
            'samples': len(vals),
        })
    out.sort(key=lambda x: x['avg_score'])
    return jsonify({'criteria': out, 'sample_apps': len(rows)})


@dashboard_bp.route('/donor-apps-by-month', methods=['GET'])
@login_required
def api_dashboard_donor_apps_by_month():
    """Phase 422 — Applications received per month over the last 12
    months across this donor's grants.
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    from collections import defaultdict
    now = datetime.now(timezone.utc)
    start = (now - timedelta(days=365)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    rows = (Application.query
            .join(Grant)
            .filter(Grant.donor_org_id == current_user.org_id,
                    Application.submitted_at.isnot(None),
                    Application.submitted_at >= start)
            .with_entities(Application.submitted_at)
            .all())
    by_month = defaultdict(int)
    for (submitted,) in rows:
        if not submitted:
            continue
        key = submitted.strftime('%Y-%m')
        by_month[key] += 1
    # Build 12 contiguous month buckets ending at current month.
    points = []
    cursor = start
    for _ in range(13):
        key = cursor.strftime('%Y-%m')
        points.append({'month': key, 'count': by_month.get(key, 0)})
        if cursor.month == 12:
            cursor = cursor.replace(year=cursor.year + 1, month=1)
        else:
            cursor = cursor.replace(month=cursor.month + 1)
    return jsonify({'points': points})


@dashboard_bp.route('/reviewer-queue-sector-mix', methods=['GET'])
@login_required
def api_dashboard_reviewer_queue_sector_mix():
    """Phase 423 — Reviewer queue grouped by primary grant sector.
    Helps reviewers see what kinds of apps they're scoring.
    """
    if current_user.role != 'reviewer':
        return jsonify({'error': 'access denied'}), 403
    from collections import Counter
    rows = (db.session.query(Grant.sectors)
            .join(Application, Application.grant_id == Grant.id)
            .join(Review, Review.application_id == Application.id)
            .filter(Review.reviewer_user_id == current_user.id,
                    Review.status.in_(['assigned', 'in_progress', 'reviewing']))
            .all())
    counts = Counter()
    for (sectors_json,) in rows:
        from app.utils.helpers import _json_load
        sectors = _json_load(sectors_json) or []
        if not sectors:
            counts['Unspecified'] += 1
            continue
        # Pick first sector as primary for simplicity.
        first = sectors[0] if isinstance(sectors, list) else None
        label = (first or 'Unspecified') if isinstance(first, str) else 'Unspecified'
        counts[label] += 1
    total = sum(counts.values())
    out = [{'sector': k, 'count': v} for k, v in counts.most_common(6)]
    return jsonify({'sectors': out, 'total': total})


@dashboard_bp.route('/i18n-coverage', methods=['GET'])
@login_required
def api_dashboard_i18n_coverage():
    """Phase 424 — Translation key counts per locale vs the English
    canonical. Translation-debt signal: how many keys are missing in
    each non-English locale.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    import json
    import os
    from flask import current_app
    LOCALES = ['en', 'ar', 'fr', 'es', 'sw', 'so']
    base = os.path.join(current_app.root_path, '..', 'frontend', 'src', 'i18n')
    counts = {}
    en_keys = set()
    for locale in LOCALES:
        path = os.path.join(base, f'{locale}.json')
        try:
            with open(path, 'r', encoding='utf-8') as fh:
                data = json.load(fh)
            keys = set()
            def _walk(node, prefix=''):
                if isinstance(node, dict):
                    for k, v in node.items():
                        nk = f'{prefix}.{k}' if prefix else k
                        if isinstance(v, dict):
                            _walk(v, nk)
                        else:
                            keys.add(nk)
            _walk(data)
            counts[locale] = len(keys)
            if locale == 'en':
                en_keys = keys
        except Exception:
            counts[locale] = 0
    en_total = len(en_keys)
    coverage = {}
    for locale, n in counts.items():
        if en_total == 0:
            coverage[locale] = None
        else:
            coverage[locale] = round(100 * n / en_total, 1)
    return jsonify({
        'counts': counts,
        'coverage_pct_vs_en': coverage,
        'en_total': en_total,
    })


@dashboard_bp.route('/ngo-app-reviewer-mix/<int:application_id>', methods=['GET'])
@login_required
def api_dashboard_ngo_app_reviewer_mix(application_id):
    """Phase 415 — Reviewer-mix summary for an NGO's application:
    total reviewers, active vs completed, % progress. No reviewer
    names exposed.
    """
    if current_user.role != 'ngo' or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    app_ = Application.query.get(application_id)
    if not app_ or app_.ngo_org_id != current_user.org_id:
        return jsonify({'error': 'not found'}), 404
    rows = Review.query.filter_by(application_id=app_.id).all()
    total = len(rows)
    active = sum(1 for r in rows if r.status in ('assigned', 'in_progress', 'reviewing'))
    completed = sum(1 for r in rows if r.status in ('submitted', 'scored', 'completed'))
    pct = round(100 * completed / total, 0) if total > 0 else None
    return jsonify({
        'application_id': app_.id,
        'total_reviewers': total,
        'active': active,
        'completed': completed,
        'progress_pct': pct,
    })


@dashboard_bp.route('/donor-review-pipeline', methods=['GET'])
@login_required
def api_dashboard_donor_review_pipeline():
    """Phase 416 — Counts of reviews by status across this donor's
    grants. Snapshot of where the donor's review workload sits.
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    rows = (db.session.query(Review.status, Review.snoozed_until)
            .join(Application, Application.id == Review.application_id)
            .join(Grant, Grant.id == Application.grant_id)
            .filter(Grant.donor_org_id == current_user.org_id)
            .all())
    counts = {
        'assigned': 0,
        'in_progress': 0,
        'completed': 0,
        'snoozed': 0,
    }
    for status, snoozed_until in rows:
        if snoozed_until and snoozed_until > now:
            counts['snoozed'] += 1
            continue
        if status == 'assigned':
            counts['assigned'] += 1
        elif status in ('in_progress', 'reviewing'):
            counts['in_progress'] += 1
        elif status in ('submitted', 'scored', 'completed'):
            counts['completed'] += 1
    return jsonify({'counts': counts, 'total': len(rows)})


@dashboard_bp.route('/reviewer-score-distribution', methods=['GET'])
@login_required
def api_dashboard_reviewer_score_distribution():
    """Phase 417 — 10-bucket histogram of this reviewer's overall_score
    across reviews completed in the last 30 days. Self-calibration tool.
    """
    if current_user.role != 'reviewer':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    rows = (Review.query
            .filter(Review.reviewer_user_id == current_user.id,
                    Review.status.in_(['submitted', 'scored', 'completed']),
                    Review.completed_at.isnot(None),
                    Review.completed_at >= cutoff,
                    Review.overall_score.isnot(None))
            .with_entities(Review.overall_score)
            .all())
    buckets = [0] * 10  # 0-9, 10-19, ..., 90-100
    for (score,) in rows:
        try:
            idx = max(0, min(9, int(float(score) // 10)))
            buckets[idx] += 1
        except (TypeError, ValueError):
            continue
    return jsonify({
        'window_days': 30,
        'buckets': buckets,
        'total': sum(buckets),
    })


@dashboard_bp.route('/new-signups-weekly', methods=['GET'])
@login_required
def api_dashboard_new_signups_weekly():
    """Phase 418 — Count of users created this week vs prior week.
    User-growth signal. (Pivoted from "inactive users" — no
    last_login_at column exists on User.)
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    recent_start = now - timedelta(days=7)
    prior_start = now - timedelta(days=14)
    recent = User.query.filter(
        User.created_at.isnot(None),
        User.created_at >= recent_start,
    ).count()
    prior = User.query.filter(
        User.created_at.isnot(None),
        User.created_at >= prior_start,
        User.created_at < recent_start,
    ).count()
    return jsonify({
        'this_week': recent,
        'last_week': prior,
        'delta': recent - prior,
    })


@dashboard_bp.route('/peer-funded-snippets/<int:grant_id>', methods=['GET'])
@login_required
def api_dashboard_peer_funded_snippets(grant_id):
    """Phase 409 — Anonymised text snippets from funded applications on
    the same grant. Different from Phase 117 (peer references); this
    surfaces actual response language. NGO sees snippets to learn how
    successful peers framed their answers, never an NGO name attached.
    """
    if current_user.role != 'ngo' or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    funded = (Application.query
              .filter(Application.grant_id == grant_id,
                      Application.status.in_(['funded', 'awarded']),
                      Application.ngo_org_id != current_user.org_id,
                      Application.responses.isnot(None))
              .order_by(Application.decision_recorded_at.desc())
              .limit(5)
              .all())
    snippets = []
    for app_ in funded:
        responses = app_.get_responses() if hasattr(app_, 'get_responses') else {}
        if not isinstance(responses, dict):
            continue
        for key, val in responses.items():
            if not isinstance(val, str):
                continue
            text = val.strip()
            if len(text) < 80:
                continue
            snippets.append({
                'criterion_key': key,
                'snippet': text[:240] + ('…' if len(text) > 240 else ''),
            })
            if len(snippets) >= 8:
                break
        if len(snippets) >= 8:
            break
    return jsonify({'snippets': snippets, 'sample_size': len(funded)})


@dashboard_bp.route('/donor-sla-breach-trend', methods=['GET'])
@login_required
def api_dashboard_donor_sla_breach_trend():
    """Phase 410 — 14-day daily sparkline of reviews whose turnaround
    exceeded the SLA (>14 days from created_at to completed_at) on
    this donor's grants.
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    from collections import defaultdict
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=14)
    SLA_DAYS = 14

    rows = (db.session.query(Review.created_at, Review.completed_at)
            .join(Application, Application.id == Review.application_id)
            .join(Grant, Grant.id == Application.grant_id)
            .filter(Grant.donor_org_id == current_user.org_id,
                    Review.status.in_(['submitted', 'scored', 'completed']),
                    Review.completed_at.isnot(None),
                    Review.completed_at >= start)
            .all())
    by_day = defaultdict(int)
    for created, completed in rows:
        if not created or not completed:
            continue
        days = (completed - created).total_seconds() / 86400.0
        if days > SLA_DAYS:
            key = completed.date().isoformat()
            by_day[key] += 1
    points = []
    for i in range(14):
        d = (start + timedelta(days=i)).date()
        points.append({'date': d.isoformat(), 'breached': by_day.get(d.isoformat(), 0)})
    return jsonify({'points': points, 'sla_days': SLA_DAYS})


@dashboard_bp.route('/reviewer-band-streak', methods=['GET'])
@login_required
def api_dashboard_reviewer_band_streak():
    """Phase 411 — Detect a 5-in-a-row band streak on this reviewer's
    last 5 completed reviews (all weak <60 or all strong >=80). Nudges
    a calibration check.
    """
    if current_user.role != 'reviewer':
        return jsonify({'error': 'access denied'}), 403
    rows = (Review.query
            .filter(Review.reviewer_user_id == current_user.id,
                    Review.status.in_(['submitted', 'scored', 'completed']),
                    Review.overall_score.isnot(None))
            .order_by(Review.completed_at.desc())
            .limit(5)
            .all())
    if len(rows) < 5:
        return jsonify({'streak': None})
    scores = [float(r.overall_score) for r in rows]
    if all(s < 60 for s in scores):
        return jsonify({'streak': 'weak', 'count': 5})
    if all(s >= 80 for s in scores):
        return jsonify({'streak': 'strong', 'count': 5})
    return jsonify({'streak': None})


@dashboard_bp.route('/audit-chain-rate', methods=['GET'])
@login_required
def api_dashboard_audit_chain_rate():
    """Phase 412 — Audit chain entries per day over the last 7 days vs
    prior 7 days. Sudden drop suggests broken audit hooks.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    from sqlalchemy import text as _text
    now = datetime.now(timezone.utc)
    recent_start = now - timedelta(days=7)
    prior_start = now - timedelta(days=14)
    try:
        recent_total = db.session.execute(_text(
            "SELECT COUNT(*) FROM audit_chain WHERE created_at >= :c"
        ), {'c': recent_start}).scalar() or 0
        prior_total = db.session.execute(_text(
            "SELECT COUNT(*) FROM audit_chain "
            "WHERE created_at >= :a AND created_at < :b"
        ), {'a': prior_start, 'b': recent_start}).scalar() or 0
    except Exception:
        recent_total = 0
        prior_total = 0
    recent_per_day = round(recent_total / 7.0, 1)
    prior_per_day = round(prior_total / 7.0, 1) if prior_total else None
    return jsonify({
        'recent_per_day': recent_per_day,
        'prior_per_day': prior_per_day,
        'recent_total': int(recent_total),
        'prior_total': int(prior_total),
    })


@dashboard_bp.route('/ngo-feedback-themes', methods=['GET'])
@login_required
def api_dashboard_ngo_feedback_themes():
    """Phase 403 — Top decision_reason_code values across this NGO's
    declined applications. Lets the NGO see patterns in why they're
    being passed over.
    """
    if current_user.role != 'ngo' or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    from collections import Counter
    rows = (Application.query
            .filter(Application.ngo_org_id == current_user.org_id,
                    Application.status.in_(['declined', 'rejected']),
                    Application.decision_reason_code.isnot(None))
            .with_entities(Application.decision_reason_code)
            .all())
    counts = Counter((c[0] or '').strip() for c in rows if c[0])
    counts.pop('', None)
    out = [{'reason_code': k, 'count': v}
           for k, v in counts.most_common(3)]
    return jsonify({'themes': out, 'total': sum(counts.values())})


@dashboard_bp.route('/donor-starred-queue', methods=['GET'])
@login_required
def api_dashboard_donor_starred_queue():
    """Phase 404 — Count of applications on this donor's grants that
    are starred (is_starred=True) but not yet decided. Quick read of
    "ready-to-call" inventory.
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    PENDING = ['submitted', 'under_review', 'scored', 'revision_requested']
    count = (Application.query
             .join(Grant)
             .filter(Grant.donor_org_id == current_user.org_id,
                     Application.is_starred.is_(True),
                     Application.status.in_(PENDING))
             .count())
    return jsonify({'starred_pending': count})


@dashboard_bp.route('/reviews-completed-this-week', methods=['GET'])
@login_required
def api_dashboard_reviews_completed_this_week():
    """Phase 405 — Count of the reviewer's reviews completed in the
    last 7 days. Lightweight motivator stat.
    """
    if current_user.role != 'reviewer':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    count = Review.query.filter(
        Review.reviewer_user_id == current_user.id,
        Review.status.in_(['submitted', 'scored', 'completed']),
        Review.completed_at.isnot(None),
        Review.completed_at >= cutoff,
    ).count()
    return jsonify({'completed_this_week': count})


@dashboard_bp.route('/slowest-cron', methods=['GET'])
@login_required
def api_dashboard_slowest_cron():
    """Phase 406 — Slowest cron run in the last 24h. Health signal —
    spikes can indicate runaway queries or external API trouble.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    from sqlalchemy import text as _text
    cutoff = datetime.now(timezone.utc) - timedelta(days=1)
    try:
        row = db.session.execute(_text(
            "SELECT name, duration_ms, ran_at "
            "FROM cron_runs WHERE ran_at >= :c "
            "ORDER BY duration_ms DESC NULLS LAST LIMIT 1"
        ), {'c': cutoff}).first()
    except Exception:
        try:
            row = db.session.execute(_text(
                "SELECT name, duration_ms, ran_at "
                "FROM cron_runs WHERE ran_at >= :c "
                "ORDER BY duration_ms DESC LIMIT 1"
            ), {'c': cutoff}).first()
        except Exception:
            row = None
    if not row:
        return jsonify({'name': None, 'duration_ms': None})
    return jsonify({
        'name': row.name,
        'duration_ms': int(row.duration_ms or 0),
        'ran_at': row.ran_at.isoformat() if row.ran_at else None,
    })


@dashboard_bp.route('/donor-track-record/<int:donor_org_id>', methods=['GET'])
@login_required
def api_dashboard_donor_track_record(donor_org_id):
    """Phase 397 — Anonymised donor history snapshot. Surfaces, for any
    NGO viewing a grant, how many decisions this donor has issued over
    the last year and the median time from submitted to decision.
    """
    if current_user.role not in ('ngo', 'donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=365)
    DECIDED = ['funded', 'awarded', 'declined', 'rejected']
    WIN = {'funded', 'awarded'}
    rows = (Application.query
            .join(Grant)
            .filter(Grant.donor_org_id == donor_org_id,
                    Application.status.in_(DECIDED),
                    Application.decision_recorded_at.isnot(None),
                    Application.decision_recorded_at >= cutoff,
                    Application.submitted_at.isnot(None))
            .all())
    total = len(rows)
    if total == 0:
        return jsonify({'decisions': 0, 'median_days': None, 'funded_pct': None})
    funded = sum(1 for a in rows if a.status in WIN)
    days = []
    for a in rows:
        if not a.submitted_at or not a.decision_recorded_at:
            continue
        d = (a.decision_recorded_at - a.submitted_at).total_seconds() / 86400.0
        if d >= 0:
            days.append(d)
    median = None
    if days:
        days.sort()
        n = len(days)
        median = days[n // 2] if n % 2 else (days[n // 2 - 1] + days[n // 2]) / 2.0
    return jsonify({
        'decisions': total,
        'median_days': round(median, 1) if median is not None else None,
        'funded_pct': round(100 * funded / total, 1),
    })


@dashboard_bp.route('/donor-grants-by-status', methods=['GET'])
@login_required
def api_dashboard_donor_grants_by_status():
    """Phase 398 — Counts of this donor's grants by status. Quick
    portfolio summary tile.
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    rows = (Grant.query
            .filter(Grant.donor_org_id == current_user.org_id)
            .with_entities(Grant.status)
            .all())
    counts = {'draft': 0, 'open': 0, 'review': 0, 'closed': 0, 'awarded': 0}
    for (status,) in rows:
        if status in counts:
            counts[status] += 1
    return jsonify({'counts': counts, 'total': len(rows)})


@dashboard_bp.route('/db-row-counts', methods=['GET'])
@login_required
def api_dashboard_db_row_counts():
    """Phase 400 — Quick row-count snapshot of the major tables. Gauge
    of overall system size for admins.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from app.models import Notification
    try:
        counts = {
            'users': User.query.count(),
            'organizations': Organization.query.count(),
            'grants': Grant.query.count(),
            'applications': Application.query.count(),
            'reviews': Review.query.count(),
            'notifications': Notification.query.count(),
        }
    except Exception as e:
        return jsonify({'error': 'count failed', 'detail': str(e)[:120]}), 500
    return jsonify({'counts': counts})


@dashboard_bp.route('/ngo-app-reviewer-signal/<int:application_id>', methods=['GET'])
@login_required
def api_dashboard_ngo_app_reviewer_signal(application_id):
    """Phase 391 — NGO inline signal: is your application currently in
    the hands of reviewers? Returns counts of assigned/in_progress/
    completed reviews on this app so the UI can show a soft "picked up"
    banner before the decision is recorded.
    """
    if current_user.role != 'ngo' or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    app_ = Application.query.get(application_id)
    if not app_ or app_.ngo_org_id != current_user.org_id:
        return jsonify({'error': 'not found'}), 404
    rows = Review.query.filter_by(application_id=app_.id).all()
    by_status = {
        'assigned': sum(1 for r in rows if r.status == 'assigned'),
        'in_progress': sum(1 for r in rows
                          if r.status in ('in_progress', 'reviewing')),
        'completed': sum(1 for r in rows
                        if r.status in ('submitted', 'scored', 'completed')),
    }
    return jsonify({
        'application_id': app_.id,
        'total': len(rows),
        'by_status': by_status,
    })


@dashboard_bp.route('/donor-decision-aging', methods=['GET'])
@login_required
def api_dashboard_donor_decision_aging():
    """Phase 392 — Median days from application.submitted_at to
    application.decision_recorded_at on this donor's last 50 decisions.
    Amber border at >=30d on the client.
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    DECIDED = ['funded', 'awarded', 'declined', 'rejected']
    rows = (Application.query
            .join(Grant)
            .filter(Grant.donor_org_id == current_user.org_id,
                    Application.status.in_(DECIDED),
                    Application.submitted_at.isnot(None),
                    Application.decision_recorded_at.isnot(None))
            .order_by(Application.decision_recorded_at.desc())
            .limit(50)
            .all())
    days = []
    for a in rows:
        if not a.submitted_at or not a.decision_recorded_at:
            continue
        d = (a.decision_recorded_at - a.submitted_at).total_seconds() / 86400.0
        if d >= 0:
            days.append(d)
    if not days:
        return jsonify({'median_days': None, 'sample': 0})
    days.sort()
    n = len(days)
    median = days[n // 2] if n % 2 else (days[n // 2 - 1] + days[n // 2]) / 2.0
    return jsonify({
        'median_days': round(median, 1),
        'sample': n,
    })


@dashboard_bp.route('/stale-notifications', methods=['GET'])
@login_required
def api_dashboard_stale_notifications():
    """Phase 394 — Count of unread notifications older than 14 days
    across all users. Signal that notification inboxes are neglected.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    from app.models import Notification
    cutoff = datetime.now(timezone.utc) - timedelta(days=14)
    try:
        stale = Notification.query.filter(
            Notification.is_read.is_(False),
            Notification.created_at < cutoff,
        ).count()
    except Exception:
        stale = 0
    return jsonify({
        'stale_unread': stale,
        'older_than_days': 14,
    })


@dashboard_bp.route('/ngo-submit-duration', methods=['GET'])
@login_required
def api_dashboard_ngo_submit_duration():
    """Phase 385 — Median elapsed time (in hours) from
    application.created_at to application.submitted_at across the
    NGO's last 5 submitted applications. Lets the NGO budget the
    session before opening apply.
    """
    if current_user.role != 'ngo' or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    rows = (Application.query
            .filter(Application.ngo_org_id == current_user.org_id,
                    Application.submitted_at.isnot(None),
                    Application.created_at.isnot(None))
            .order_by(Application.submitted_at.desc())
            .limit(5)
            .all())
    hours = []
    for a in rows:
        if not a.submitted_at or not a.created_at:
            continue
        h = (a.submitted_at - a.created_at).total_seconds() / 3600.0
        if h >= 0:
            hours.append(h)
    if not hours:
        return jsonify({'median_hours': None, 'sample': 0})
    hours.sort()
    n = len(hours)
    median = hours[n // 2] if n % 2 else (hours[n // 2 - 1] + hours[n // 2]) / 2.0
    return jsonify({
        'median_hours': round(median, 1),
        'sample': n,
    })


@dashboard_bp.route('/donor-response-completeness', methods=['GET'])
@login_required
def api_dashboard_donor_response_completeness():
    """Phase 386 — % of submitted applications on this donor's grants
    that have a non-null responses field over the last 90 days.
    Self-gates under 10 submitted apps.
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    rows = (db.session.query(Application.id, Application.responses)
            .join(Grant, Grant.id == Application.grant_id)
            .filter(Grant.donor_org_id == current_user.org_id,
                    Application.submitted_at.isnot(None),
                    Application.submitted_at >= cutoff)
            .all())
    total = len(rows)
    with_responses = sum(1 for _, r in rows if r and str(r).strip() not in ('', '{}', '[]', 'null'))
    if total < 10:
        return jsonify({'completeness_pct': None, 'total': total,
                        'reason': 'too_few_submissions'})
    return jsonify({
        'completeness_pct': round(100 * with_responses / total, 1),
        'with_responses': with_responses,
        'total': total,
        'window_days': 90,
    })


@dashboard_bp.route('/auth-lockout-rate', methods=['GET'])
@login_required
def api_dashboard_auth_lockout_rate():
    """Phase 388 — Security signal: count of distinct emails that hit
    >=5 failed login attempts in the last 24h, and total recorded
    attempts. The login_attempts table is shared across all
    rate-limited namespaces, so high counts may indicate brute force.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    from sqlalchemy import text as _text
    cutoff = datetime.now(timezone.utc) - timedelta(days=1)
    try:
        total_row = db.session.execute(_text(
            "SELECT COUNT(*) AS total FROM login_attempts WHERE attempted_at >= :c"
        ), {'c': cutoff}).first()
        total = int(total_row.total or 0)
        rate_limited_row = db.session.execute(_text(
            "SELECT COUNT(*) AS hot_emails FROM ("
            " SELECT email FROM login_attempts WHERE attempted_at >= :c "
            " GROUP BY email HAVING COUNT(*) >= 5"
            ") sub"
        ), {'c': cutoff}).first()
        hot_emails = int(rate_limited_row.hot_emails or 0)
    except Exception:
        total = 0
        hot_emails = 0
    return jsonify({
        'window_hours': 24,
        'total_attempts': total,
        'hot_emails': hot_emails,
    })


@dashboard_bp.route('/ngo-submissions-this-month', methods=['GET'])
@login_required
def api_dashboard_ngo_submissions_this_month():
    """Phase 379 — Count of applications the NGO submitted this calendar
    month, with same-month-last-year comparison.
    """
    if current_user.role != 'ngo' or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_year_start = month_start.replace(year=month_start.year - 1)
    if month_start.month == 12:
        last_year_end = last_year_start.replace(year=last_year_start.year + 1, month=1)
    else:
        last_year_end = last_year_start.replace(month=last_year_start.month + 1)

    this_month = (Application.query
                  .filter(Application.ngo_org_id == current_user.org_id,
                          Application.submitted_at.isnot(None),
                          Application.submitted_at >= month_start)
                  .count())
    last_year = (Application.query
                 .filter(Application.ngo_org_id == current_user.org_id,
                         Application.submitted_at.isnot(None),
                         Application.submitted_at >= last_year_start,
                         Application.submitted_at < last_year_end)
                 .count())
    return jsonify({
        'this_month': this_month,
        'same_month_last_year': last_year,
        'month_label': month_start.strftime('%B %Y'),
    })


@dashboard_bp.route('/donor-time-to-first-review', methods=['GET'])
@login_required
def api_dashboard_donor_time_to_first_review():
    """Phase 380 — Median days from application.submitted_at to the
    earliest review.created_at on this donor's grants over the last 90
    days. Self-gates when fewer than 5 measurable applications.
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    from sqlalchemy import func as _func
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    rows = (db.session.query(
                Application.id,
                Application.submitted_at,
                _func.min(Review.created_at).label('first_review_at'),
            )
            .join(Grant, Grant.id == Application.grant_id)
            .join(Review, Review.application_id == Application.id)
            .filter(Grant.donor_org_id == current_user.org_id,
                    Application.submitted_at.isnot(None),
                    Application.submitted_at >= cutoff)
            .group_by(Application.id, Application.submitted_at)
            .all())
    days = []
    for _, submitted, first in rows:
        if not submitted or not first:
            continue
        d = (first - submitted).total_seconds() / 86400.0
        if d >= 0:
            days.append(d)
    if len(days) < 5:
        return jsonify({'median_days': None, 'sample': len(days),
                        'reason': 'insufficient_data'})
    days.sort()
    n = len(days)
    median = days[n // 2] if n % 2 else (days[n // 2 - 1] + days[n // 2]) / 2.0
    return jsonify({
        'median_days': round(median, 1),
        'sample': n,
        'window_days': 90,
    })


@dashboard_bp.route('/ai-replay-coverage', methods=['GET'])
@login_required
def api_dashboard_ai_replay_coverage():
    """Phase 382 — % of AI calls in the last 7 days that have
    `replay_subject_kind` populated. Auditability signal — replay-ready
    calls can be re-run from the audit chain.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    from sqlalchemy import text as _text
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    try:
        row = db.session.execute(_text(
            "SELECT COUNT(*) AS total, "
            "SUM(CASE WHEN replay_subject_kind IS NOT NULL THEN 1 ELSE 0 END) AS replayable "
            "FROM ai_call_logs WHERE created_at >= :c"
        ), {'c': cutoff}).first()
        total = int(row.total or 0)
        replayable = int(row.replayable or 0)
    except Exception:
        total = 0
        replayable = 0
    if total == 0:
        return jsonify({'window_days': 7, 'total': 0, 'replayable': 0,
                        'coverage_pct': None})
    pct = round(100 * replayable / total, 1)
    return jsonify({
        'window_days': 7,
        'total': total,
        'replayable': replayable,
        'coverage_pct': pct,
    })


@dashboard_bp.route('/ngo-fresh-decision', methods=['GET'])
@login_required
def api_dashboard_ngo_fresh_decision():
    """Phase 373 — Surface the most recent unviewed decision on this
    NGO's applications. Powers a landing banner so a fresh
    funded/declined doesn't get lost in the inbox.
    Uses Phase 285 `applicant_viewed_feedback_at` to know what's seen.
    """
    if current_user.role != 'ngo' or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=14)
    DECIDED = ['funded', 'awarded', 'declined', 'rejected']
    row = (Application.query
           .filter(Application.ngo_org_id == current_user.org_id,
                   Application.status.in_(DECIDED),
                   Application.decision_recorded_at.isnot(None),
                   Application.decision_recorded_at >= cutoff,
                   Application.applicant_viewed_feedback_at.is_(None))
           .order_by(Application.decision_recorded_at.desc())
           .first())
    if not row:
        return jsonify({'fresh': None})
    return jsonify({
        'fresh': {
            'application_id': row.id,
            'status': row.status,
            'decision_recorded_at': row.decision_recorded_at.isoformat() if row.decision_recorded_at else None,
            'grant_title': row.grant.title if row.grant else None,
        },
    })


@dashboard_bp.route('/donor-apps-by-country', methods=['GET'])
@login_required
def api_dashboard_donor_apps_by_country():
    """Phase 374 — Country breakdown of applications received across
    this donor's grants. Geography signal for portfolio managers.
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from collections import Counter
    rows = (db.session.query(Organization.country)
            .join(Application, Application.ngo_org_id == Organization.id)
            .join(Grant, Grant.id == Application.grant_id)
            .filter(Grant.donor_org_id == current_user.org_id)
            .all())
    counts = Counter((c[0] or 'Unknown') for c in rows)
    out = [{'country': k, 'count': v}
           for k, v in sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:8]]
    return jsonify({'countries': out, 'total': sum(counts.values())})


@dashboard_bp.route('/ai-failure-rate', methods=['GET'])
@login_required
def api_dashboard_ai_failure_rate():
    """Phase 376 — % of AI calls in the last 24 hours that failed
    (success=False). Reliability signal for the operator dashboard.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    from sqlalchemy import text as _text
    cutoff = datetime.now(timezone.utc) - timedelta(days=1)
    try:
        row = db.session.execute(_text(
            "SELECT COUNT(*) AS total, "
            "SUM(CASE WHEN success = 0 OR success = false THEN 1 ELSE 0 END) AS failed "
            "FROM ai_call_logs WHERE created_at >= :c"
        ), {'c': cutoff}).first()
        total = int(row.total or 0)
        failed = int(row.failed or 0)
    except Exception:
        total = 0
        failed = 0
    if total == 0:
        return jsonify({'window_hours': 24, 'total': 0, 'failed': 0,
                        'failure_pct': None})
    pct = round(100 * failed / total, 1)
    return jsonify({
        'window_hours': 24,
        'total': total,
        'failed': failed,
        'failure_pct': pct,
    })


@dashboard_bp.route('/ngo-pipeline-value', methods=['GET'])
@login_required
def api_dashboard_ngo_pipeline_value():
    """Phase 367 — Total dollar value of grants this NGO has pending
    decisions on (status in submitted/under_review/scored/revision_requested).
    Helps the NGO see what's at stake right now.
    """
    if current_user.role != 'ngo' or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    PENDING = ['submitted', 'under_review', 'scored', 'revision_requested']
    rows = (db.session.query(Grant.total_funding, Grant.currency, Application.id)
            .join(Application, Application.grant_id == Grant.id)
            .filter(Application.ngo_org_id == current_user.org_id,
                    Application.status.in_(PENDING))
            .all())
    by_currency = {}
    count = 0
    for amt, cur, _ in rows:
        if amt is None:
            continue
        cur = cur or 'USD'
        by_currency[cur] = by_currency.get(cur, 0.0) + float(amt)
        count += 1
    out = [{'currency': c, 'amount': round(v, 2)}
           for c, v in sorted(by_currency.items(), key=lambda kv: kv[1], reverse=True)]
    return jsonify({
        'applications': len(rows),
        'with_amount': count,
        'totals': out,
    })


@dashboard_bp.route('/donor-decision-concentration', methods=['GET'])
@login_required
def api_dashboard_donor_decision_concentration():
    """Phase 368 — % of this donor's funded volume that flows to its
    top-third NGOs by funding count. >70% suggests concentration risk.
    Returns null when fewer than 6 funded NGOs (too small to bucket).
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from collections import Counter
    rows = (Application.query
            .join(Grant)
            .filter(Grant.donor_org_id == current_user.org_id,
                    Application.status.in_(['funded', 'awarded']))
            .with_entities(Application.ngo_org_id)
            .all())
    counts = Counter(r[0] for r in rows if r[0])
    n = len(counts)
    if n < 6:
        return jsonify({'concentration_pct': None, 'reason': 'too_few_grantees',
                        'unique_grantees': n})
    top_n = max(1, n // 3)
    top_count = sum(c for _, c in counts.most_common(top_n))
    total = sum(counts.values())
    pct = round(100 * top_count / total, 1) if total > 0 else None
    return jsonify({
        'concentration_pct': pct,
        'unique_grantees': n,
        'top_third_size': top_n,
        'top_third_fundings': top_count,
        'total_fundings': total,
    })


@dashboard_bp.route('/ai-cost-per-app', methods=['GET'])
@login_required
def api_dashboard_ai_cost_per_app():
    """Phase 370 — Average AI dollar spend per submitted application
    over the last 30 days. Admin-only unit-economics signal.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    from sqlalchemy import text as _text
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    try:
        total_cost = db.session.execute(_text(
            "SELECT COALESCE(SUM(usd_cost), 0) FROM ai_call_logs WHERE created_at >= :c"
        ), {'c': cutoff}).scalar() or 0
        total_cost = float(total_cost)
    except Exception:
        total_cost = 0.0
    submitted = Application.query.filter(
        Application.submitted_at.isnot(None),
        Application.submitted_at >= cutoff,
    ).count()
    avg = round(total_cost / submitted, 4) if submitted > 0 else None
    return jsonify({
        'window_days': 30,
        'total_ai_cost_usd': round(total_cost, 2),
        'applications_submitted': submitted,
        'avg_cost_per_app_usd': avg,
    })


@dashboard_bp.route('/duplicate-orgs', methods=['GET'])
@login_required
def api_dashboard_duplicate_orgs():
    """Phase 364 — Organisations that share a normalised legal name +
    country. Admin-only signal for cleanup; flags possible duplicates
    created by independent registration flows.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from collections import defaultdict
    rows = (Organization.query
            .with_entities(Organization.id, Organization.name, Organization.country, Organization.org_type)
            .all())
    groups = defaultdict(list)
    for org_id, name, country, otype in rows:
        if not name:
            continue
        key = ((name or '').strip().lower(), (country or '').strip().lower())
        groups[key].append({'id': org_id, 'name': name, 'country': country, 'org_type': otype})
    dupes = [orgs for orgs in groups.values() if len(orgs) >= 2]
    dupes.sort(key=lambda g: len(g), reverse=True)
    out = []
    for g in dupes[:5]:
        out.append({
            'normalized_name': g[0]['name'],
            'country': g[0].get('country'),
            'count': len(g),
            'orgs': g,
        })
    return jsonify({'duplicates': out, 'total_groups': len(dupes)})


@dashboard_bp.route('/ngo-fastest-submission', methods=['GET'])
@login_required
def api_dashboard_ngo_fastest_submission():
    """Phase 439 — Minimum hours between draft creation and submission
    across this NGO's submitted applications in the last 90 days.
    Motivational benchmark; self-gated by sample size on the frontend.
    """
    if current_user.role != 'ngo' or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    rows = (Application.query
            .filter(Application.org_id == current_user.org_id,
                    Application.submitted_at.isnot(None),
                    Application.submitted_at >= cutoff,
                    Application.created_at.isnot(None))
            .all())
    durations = []
    for a in rows:
        if not a.created_at or not a.submitted_at:
            continue
        hours = (a.submitted_at - a.created_at).total_seconds() / 3600.0
        if hours >= 0:
            durations.append(hours)
    if not durations:
        return jsonify({'fastest_hours': None, 'sample': 0})
    return jsonify({
        'fastest_hours': round(min(durations), 1),
        'sample': len(durations),
    })


@dashboard_bp.route('/donor-apps-this-week', methods=['GET'])
@login_required
def api_dashboard_donor_apps_this_week():
    """Phase 440 — Applications submitted to this donor's grants in the
    last 7 days, with the prior 7 days as a comparison delta.
    """
    if current_user.role not in ('donor', 'admin') or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    two_weeks_ago = now - timedelta(days=14)
    q = (db.session.query(Application)
         .join(Grant, Application.grant_id == Grant.id)
         .filter(Grant.donor_org_id == current_user.org_id,
                 Application.submitted_at.isnot(None)))
    this_week = q.filter(Application.submitted_at >= week_ago,
                         Application.submitted_at < now).count()
    prior_week = q.filter(Application.submitted_at >= two_weeks_ago,
                          Application.submitted_at < week_ago).count()
    return jsonify({
        'this_week': this_week,
        'prior_week': prior_week,
        'delta': this_week - prior_week,
    })


@dashboard_bp.route('/reviewer-ai-agreement', methods=['GET'])
@login_required
def api_dashboard_reviewer_ai_agreement():
    """Phase 441 — Percentage of this reviewer's completed reviews in the
    last 90 days where |overall_score - application.ai_score| <= 5.
    Self-calibration signal grounded in real scores, not stdev.
    """
    if current_user.role != 'reviewer':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    rows = (db.session.query(Review.overall_score, Application.ai_score)
            .join(Application, Application.id == Review.application_id)
            .filter(Review.reviewer_user_id == current_user.id,
                    Review.status.in_(['submitted', 'scored', 'completed']),
                    Review.completed_at.isnot(None),
                    Review.completed_at >= cutoff,
                    Review.overall_score.isnot(None),
                    Application.ai_score.isnot(None))
            .all())
    if not rows:
        return jsonify({'agreement_pct': None, 'sample': 0})
    matches = sum(1 for hs, ai in rows if abs(float(hs) - float(ai)) <= 5)
    return jsonify({
        'agreement_pct': round(100.0 * matches / len(rows), 1),
        'sample': len(rows),
    })


@dashboard_bp.route('/active-orgs-7d', methods=['GET'])
@login_required
def api_dashboard_active_orgs_7d():
    """Phase 442 — Distinct org_ids represented in users.updated_at >=
    7-day cutoff. Lightweight tenant-activity signal for admin.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    active = (db.session.query(User.org_id)
              .filter(User.updated_at >= cutoff,
                      User.org_id.isnot(None))
              .distinct().count())
    total = db.session.query(Organization.id).count()
    return jsonify({'active_orgs': active, 'total_orgs': total})


@dashboard_bp.route('/ngo-draft-funnel', methods=['GET'])
@login_required
def api_dashboard_ngo_draft_funnel():
    """Phase 445 — Drafts created in last 30 days vs how many of those
    reached submitted_at. Exposes stalling drafts.
    """
    if current_user.role != 'ngo' or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    drafts = (Application.query
              .filter(Application.org_id == current_user.org_id,
                      Application.created_at >= cutoff)
              .count())
    submitted = (Application.query
                 .filter(Application.org_id == current_user.org_id,
                         Application.created_at >= cutoff,
                         Application.submitted_at.isnot(None))
                 .count())
    rate = round(100.0 * submitted / drafts, 0) if drafts else 0
    return jsonify({
        'drafts_30d': drafts,
        'submitted_30d': submitted,
        'conversion_pct': int(rate),
    })


@dashboard_bp.route('/grant-ai-score-histogram/<int:grant_id>', methods=['GET'])
@login_required
def api_dashboard_grant_ai_score_histogram(grant_id: int):
    """Phase 446 — 10-bin histogram of AI scores across applications for
    a single grant. Donor-only on grants they own.
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    grant = Grant.query.get(grant_id)
    if not grant:
        return jsonify({'error': 'not found'}), 404
    if current_user.role == 'donor' and grant.donor_org_id != current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    rows = (Application.query
            .filter(Application.grant_id == grant_id,
                    Application.ai_score.isnot(None))
            .all())
    bins = [0] * 10
    for a in rows:
        try:
            s = float(a.ai_score)
        except (TypeError, ValueError):
            continue
        if s < 0 or s > 100:
            continue
        idx = min(9, int(s // 10))
        bins[idx] += 1
    return jsonify({'bins': bins, 'sample': len(rows)})


@dashboard_bp.route('/reviewer-review-streak', methods=['GET'])
@login_required
def api_dashboard_reviewer_review_streak():
    """Phase 447 — Consecutive recent days with ≥1 completed review.
    Looks back up to 30 days.
    """
    if current_user.role != 'reviewer':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    rows = (Review.query
            .filter(Review.reviewer_user_id == current_user.id,
                    Review.completed_at.isnot(None),
                    Review.completed_at >= cutoff)
            .all())
    days = {r.completed_at.date() for r in rows if r.completed_at}
    today = datetime.now(timezone.utc).date()
    streak = 0
    cursor = today
    while cursor in days:
        streak += 1
        cursor = cursor - timedelta(days=1)
    return jsonify({'streak_days': streak, 'days_with_reviews': len(days)})


@dashboard_bp.route('/tenants-without-grants', methods=['GET'])
@login_required
def api_dashboard_tenants_without_grants():
    """Phase 448 — Donor-type orgs with zero grants ever published.
    Surfaces tenants that registered but never engaged.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    donor_org_ids = (db.session.query(Organization.id)
                     .filter(Organization.org_type.in_(['donor', 'ingo']))
                     .all())
    donor_ids = {r[0] for r in donor_org_ids}
    if not donor_ids:
        return jsonify({'tenants_without_grants': 0, 'donor_orgs': 0})
    with_grants = (db.session.query(Grant.donor_org_id)
                   .filter(Grant.donor_org_id.in_(list(donor_ids)))
                   .distinct().all())
    with_set = {r[0] for r in with_grants}
    without = donor_ids - with_set
    return jsonify({
        'tenants_without_grants': len(without),
        'donor_orgs': len(donor_ids),
    })


@dashboard_bp.route('/ngo-oldest-draft-age', methods=['GET'])
@login_required
def api_dashboard_ngo_oldest_draft_age():
    """Phase 451 — Days since the NGO's oldest open draft was created.
    Flags drafts likely to miss grant deadlines.
    """
    if current_user.role != 'ngo' or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone
    drafts = (Application.query
              .filter(Application.org_id == current_user.org_id,
                      Application.status == 'draft',
                      Application.created_at.isnot(None))
              .all())
    if not drafts:
        return jsonify({'oldest_days': None, 'open_drafts': 0})
    now = datetime.now(timezone.utc)
    oldest_days = 0
    for d in drafts:
        created = d.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        age = (now - created).days
        if age > oldest_days:
            oldest_days = age
    return jsonify({'oldest_days': oldest_days, 'open_drafts': len(drafts)})


@dashboard_bp.route('/donor-unassigned-reviews', methods=['GET'])
@login_required
def api_dashboard_donor_unassigned_reviews():
    """Phase 452 — Applications on donor's grants in submitted/under_review
    that have NO assigned reviewer yet. Routing-bottleneck signal.
    """
    if current_user.role not in ('donor', 'admin') or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    apps = (db.session.query(Application.id)
            .join(Grant, Application.grant_id == Grant.id)
            .filter(Grant.donor_org_id == current_user.org_id,
                    Application.status.in_(['submitted', 'under_review']))
            .all())
    app_ids = [r[0] for r in apps]
    if not app_ids:
        return jsonify({'unassigned': 0, 'total_open': 0})
    assigned_ids = {r[0] for r in db.session.query(Review.application_id)
                    .filter(Review.application_id.in_(app_ids)).distinct().all()}
    unassigned = [aid for aid in app_ids if aid not in assigned_ids]
    return jsonify({'unassigned': len(unassigned), 'total_open': len(app_ids)})


@dashboard_bp.route('/reviewer-scoring-time-avg', methods=['GET'])
@login_required
def api_dashboard_reviewer_scoring_time_avg():
    """Phase 453 — Mean hours per completed review across last 30 days."""
    if current_user.role != 'reviewer':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    rows = (Review.query
            .filter(Review.reviewer_user_id == current_user.id,
                    Review.status.in_(['submitted', 'scored', 'completed']),
                    Review.created_at.isnot(None),
                    Review.completed_at.isnot(None),
                    Review.completed_at >= cutoff)
            .all())
    hours = []
    for r in rows:
        if not r.created_at or not r.completed_at:
            continue
        h = (r.completed_at - r.created_at).total_seconds() / 3600.0
        if h >= 0:
            hours.append(h)
    if len(hours) < 3:
        return jsonify({'mean_hours': None, 'sample': len(hours)})
    mean = sum(hours) / len(hours)
    return jsonify({'mean_hours': round(mean, 1), 'sample': len(hours)})


@dashboard_bp.route('/admin-user-growth-month', methods=['GET'])
@login_required
def api_dashboard_admin_user_growth_month():
    """Phase 454 — New users created this 30-day vs prior 30-day window,
    with delta and percent change. Standard adoption signal.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    recent = now - timedelta(days=30)
    prior = now - timedelta(days=60)
    this_month = User.query.filter(User.created_at >= recent,
                                   User.created_at < now).count()
    prior_month = User.query.filter(User.created_at >= prior,
                                    User.created_at < recent).count()
    delta = this_month - prior_month
    pct = round(100.0 * delta / prior_month, 1) if prior_month > 0 else None
    return jsonify({
        'this_month': this_month,
        'prior_month': prior_month,
        'delta': delta,
        'pct_change': pct,
    })


@dashboard_bp.route('/ngo-completed-assessments', methods=['GET'])
@login_required
def api_dashboard_ngo_completed_assessments():
    """Phase 457 — Count of completed capacity assessments for this NGO
    plus most recent completion date.
    """
    if current_user.role != 'ngo' or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    rows = (Assessment.query
            .filter(Assessment.org_id == current_user.org_id,
                    Assessment.status == 'completed')
            .all())
    if not rows:
        return jsonify({'completed': 0, 'most_recent': None})
    most_recent = max(
        (a.created_at for a in rows if a.created_at), default=None)
    return jsonify({
        'completed': len(rows),
        'most_recent': most_recent.isoformat() if most_recent else None,
    })


@dashboard_bp.route('/donor-approval-rate-year', methods=['GET'])
@login_required
def api_dashboard_donor_approval_rate_year():
    """Phase 458 — Percentage of donor's decisions year-to-date that
    were funded vs declined. Self-gates < 3 total.
    """
    if current_user.role not in ('donor', 'admin') or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone
    year_start = datetime(datetime.now(timezone.utc).year, 1, 1, tzinfo=timezone.utc)
    rows = (db.session.query(Application.status)
            .join(Grant, Application.grant_id == Grant.id)
            .filter(Grant.donor_org_id == current_user.org_id,
                    Application.decision_recorded_at.isnot(None),
                    Application.decision_recorded_at >= year_start)
            .all())
    decisions = [s for (s,) in rows]
    if len(decisions) < 3:
        return jsonify({'approval_pct': None, 'sample': len(decisions)})
    funded = sum(1 for s in decisions if s in ('funded', 'awarded'))
    return jsonify({
        'approval_pct': round(100.0 * funded / len(decisions), 1),
        'funded': funded,
        'sample': len(decisions),
    })


@dashboard_bp.route('/reviewer-high-score-rate', methods=['GET'])
@login_required
def api_dashboard_reviewer_high_score_rate():
    """Phase 459 — Percentage of completed reviews in last 90 days with
    overall_score >= 75. Calibration signal.
    """
    if current_user.role != 'reviewer':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    rows = (Review.query
            .filter(Review.reviewer_user_id == current_user.id,
                    Review.status.in_(['submitted', 'scored', 'completed']),
                    Review.completed_at.isnot(None),
                    Review.completed_at >= cutoff,
                    Review.overall_score.isnot(None))
            .all())
    if len(rows) < 5:
        return jsonify({'high_score_pct': None, 'sample': len(rows)})
    high = sum(1 for r in rows if (r.overall_score or 0) >= 75)
    return jsonify({
        'high_score_pct': round(100.0 * high / len(rows), 1),
        'high_count': high,
        'sample': len(rows),
    })


@dashboard_bp.route('/admin-top-orgs-by-users', methods=['GET'])
@login_required
def api_dashboard_admin_top_orgs_by_users():
    """Phase 460 — Top 5 organizations ranked by their user count."""
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    rows = (db.session.query(Organization.id, Organization.name,
                              Organization.org_type, func.count(User.id))
            .outerjoin(User, User.org_id == Organization.id)
            .group_by(Organization.id, Organization.name, Organization.org_type)
            .order_by(func.count(User.id).desc())
            .limit(5)
            .all())
    out = [{'id': r[0], 'name': r[1], 'org_type': r[2], 'users': int(r[3] or 0)}
           for r in rows if (r[3] or 0) > 0]
    return jsonify({'orgs': out})


@dashboard_bp.route('/ngo-unread-messages', methods=['GET'])
@login_required
def api_dashboard_ngo_unread_messages():
    """Phase 463 — Count of TenantMessage rows in current user's network
    that lack a TenantMessageRead receipt for the user's org_id.
    """
    if current_user.role != 'ngo' or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    from app.models import TenantMessage, TenantMessageRead
    read_ids_q = db.session.query(TenantMessageRead.message_id).filter(
        TenantMessageRead.org_id == current_user.org_id)
    unread = (TenantMessage.query
              .filter(TenantMessage.id.notin_(read_ids_q))
              .count())
    return jsonify({'unread': unread})


@dashboard_bp.route('/donor-applicants-this-quarter', methods=['GET'])
@login_required
def api_dashboard_donor_applicants_this_quarter():
    """Phase 464 — Distinct applicant org_ids on donor's grants in the
    current calendar quarter. Pipeline-diversity signal.
    """
    if current_user.role not in ('donor', 'admin') or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    quarter_start_month = ((now.month - 1) // 3) * 3 + 1
    quarter_start = datetime(now.year, quarter_start_month, 1, tzinfo=timezone.utc)
    distinct_count = (db.session.query(Application.org_id)
                      .join(Grant, Application.grant_id == Grant.id)
                      .filter(Grant.donor_org_id == current_user.org_id,
                              Application.submitted_at.isnot(None),
                              Application.submitted_at >= quarter_start)
                      .distinct().count())
    return jsonify({
        'applicants': distinct_count,
        'quarter_start': quarter_start.date().isoformat(),
    })


@dashboard_bp.route('/reviewer-median-score', methods=['GET'])
@login_required
def api_dashboard_reviewer_median_score():
    """Phase 465 — Median of reviewer's overall_score across completed
    reviews in last 30 days. Self-gates < 5 samples on the frontend.
    """
    if current_user.role != 'reviewer':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    rows = (Review.query
            .filter(Review.reviewer_user_id == current_user.id,
                    Review.status.in_(['submitted', 'scored', 'completed']),
                    Review.completed_at.isnot(None),
                    Review.completed_at >= cutoff,
                    Review.overall_score.isnot(None))
            .all())
    scores = sorted([float(r.overall_score) for r in rows])
    if len(scores) < 5:
        return jsonify({'median': None, 'sample': len(scores)})
    n = len(scores)
    median = scores[n // 2] if n % 2 else (scores[n // 2 - 1] + scores[n // 2]) / 2
    return jsonify({
        'median': round(median, 1),
        'sample': n,
    })


@dashboard_bp.route('/audit-chain-newest-age', methods=['GET'])
@login_required
def api_dashboard_audit_chain_newest_age():
    """Phase 466 — Seconds since the most recent audit chain entry.
    Confirms the chain is actively recording. Amber if > 6 hours.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from app.models.audit_chain import AuditChainEntry
    from datetime import datetime, timezone
    newest = (AuditChainEntry.query
              .order_by(AuditChainEntry.created_at.desc())
              .first())
    if not newest or not newest.created_at:
        return jsonify({'seconds': None, 'newest_at': None})
    created = newest.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    seconds = int((datetime.now(timezone.utc) - created).total_seconds())
    return jsonify({
        'seconds': seconds,
        'newest_at': created.isoformat(),
    })


@dashboard_bp.route('/ngo-apps-submitted-ytd', methods=['GET'])
@login_required
def api_dashboard_ngo_apps_submitted_ytd():
    """Phase 469 — Count of applications this NGO submitted year-to-date."""
    if current_user.role != 'ngo' or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone
    year_start = datetime(datetime.now(timezone.utc).year, 1, 1, tzinfo=timezone.utc)
    count = (Application.query
             .filter(Application.org_id == current_user.org_id,
                     Application.submitted_at.isnot(None),
                     Application.submitted_at >= year_start)
             .count())
    return jsonify({'submitted_ytd': count, 'year_start': year_start.date().isoformat()})


@dashboard_bp.route('/donor-grants-funded-ytd', methods=['GET'])
@login_required
def api_dashboard_donor_grants_funded_ytd():
    """Phase 470 — Count and total amount of grants funded year-to-date
    on donor's portfolio. Counts each grant once even with multiple
    funded applications.
    """
    if current_user.role not in ('donor', 'admin') or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone
    year_start = datetime(datetime.now(timezone.utc).year, 1, 1, tzinfo=timezone.utc)
    rows = (db.session.query(Grant.id, Grant.total_funding, Grant.currency)
            .join(Application, Application.grant_id == Grant.id)
            .filter(Grant.donor_org_id == current_user.org_id,
                    Application.status.in_(['funded', 'awarded']),
                    Application.decision_recorded_at.isnot(None),
                    Application.decision_recorded_at >= year_start)
            .distinct()
            .all())
    grants_count = len(rows)
    total = 0.0
    currency = None
    for _, amt, cur in rows:
        try:
            total += float(amt) if amt is not None else 0.0
        except (TypeError, ValueError):
            pass
        if currency is None and cur:
            currency = cur
    return jsonify({
        'grants_count': grants_count,
        'total_funded': round(total, 2),
        'currency': currency,
    })


@dashboard_bp.route('/reviewer-low-score-rate', methods=['GET'])
@login_required
def api_dashboard_reviewer_low_score_rate():
    """Phase 471 — Percentage of reviewer's completed reviews in last 90
    days with overall_score < 50. Mirror to high-score rate.
    """
    if current_user.role != 'reviewer':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    rows = (Review.query
            .filter(Review.reviewer_user_id == current_user.id,
                    Review.status.in_(['submitted', 'scored', 'completed']),
                    Review.completed_at.isnot(None),
                    Review.completed_at >= cutoff,
                    Review.overall_score.isnot(None))
            .all())
    if len(rows) < 5:
        return jsonify({'low_score_pct': None, 'sample': len(rows)})
    low = sum(1 for r in rows if (r.overall_score or 0) < 50)
    return jsonify({
        'low_score_pct': round(100.0 * low / len(rows), 1),
        'low_count': low,
        'sample': len(rows),
    })


@dashboard_bp.route('/admin-ob-throughput-30d', methods=['GET'])
@login_required
def api_dashboard_admin_ob_throughput_30d():
    """Phase 472 — Count of emergency declarations transitioned to a
    resolved state (decision_at) in the last 30 days. Network governance
    throughput signal.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from app.models import EmergencyDeclaration
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    resolved_count = (EmergencyDeclaration.query
                      .filter(EmergencyDeclaration.decision_at.isnot(None),
                              EmergencyDeclaration.decision_at >= cutoff)
                      .count())
    total_open = (EmergencyDeclaration.query
                  .filter(EmergencyDeclaration.decision_at.is_(None))
                  .count())
    return jsonify({
        'resolved_30d': resolved_count,
        'open': total_open,
    })


@dashboard_bp.route('/ngo-funding-total-ytd', methods=['GET'])
@login_required
def api_dashboard_ngo_funding_total_ytd():
    """Phase 475 — Sum of Grant.total_funding across this NGO's
    applications transitioned to funded/awarded year-to-date.
    """
    if current_user.role != 'ngo' or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone
    year_start = datetime(datetime.now(timezone.utc).year, 1, 1, tzinfo=timezone.utc)
    rows = (db.session.query(Grant.total_funding, Grant.currency)
            .join(Application, Application.grant_id == Grant.id)
            .filter(Application.org_id == current_user.org_id,
                    Application.status.in_(['funded', 'awarded']),
                    Application.decision_recorded_at.isnot(None),
                    Application.decision_recorded_at >= year_start,
                    Grant.total_funding.isnot(None))
            .all())
    total = 0.0
    currency = None
    for amt, cur in rows:
        try:
            total += float(amt)
        except (TypeError, ValueError):
            pass
        if currency is None and cur:
            currency = cur
    return jsonify({
        'count': len(rows),
        'total': round(total, 2),
        'currency': currency,
    })


@dashboard_bp.route('/donor-active-reviewer-panel', methods=['GET'])
@login_required
def api_dashboard_donor_active_reviewer_panel():
    """Phase 476 — Distinct reviewer_user_id values who completed at
    least one review on donor's grants in the last 30 days.
    """
    if current_user.role not in ('donor', 'admin') or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    count = (db.session.query(Review.reviewer_user_id)
             .join(Application, Application.id == Review.application_id)
             .join(Grant, Application.grant_id == Grant.id)
             .filter(Grant.donor_org_id == current_user.org_id,
                     Review.status.in_(['submitted', 'scored', 'completed']),
                     Review.completed_at.isnot(None),
                     Review.completed_at >= cutoff)
             .distinct().count())
    return jsonify({'active_reviewers': count})


@dashboard_bp.route('/reviewer-median-pending-age', methods=['GET'])
@login_required
def api_dashboard_reviewer_median_pending_age():
    """Phase 477 — Median days since assignment for the reviewer's
    current pending/in_progress reviews. Self-gates < 3 pending.
    """
    if current_user.role != 'reviewer':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone
    rows = (Review.query
            .filter(Review.reviewer_user_id == current_user.id,
                    Review.status.in_(['assigned', 'in_progress', 'pending']),
                    Review.created_at.isnot(None))
            .all())
    now = datetime.now(timezone.utc)
    ages = []
    for r in rows:
        c = r.created_at
        if c.tzinfo is None:
            c = c.replace(tzinfo=timezone.utc)
        d = (now - c).days
        if d >= 0:
            ages.append(d)
    if len(ages) < 3:
        return jsonify({'median_days': None, 'pending': len(ages)})
    ages.sort()
    n = len(ages)
    median = ages[n // 2] if n % 2 else (ages[n // 2 - 1] + ages[n // 2]) / 2
    return jsonify({'median_days': round(median, 1), 'pending': n})


@dashboard_bp.route('/admin-totp-enrollment-rate', methods=['GET'])
@login_required
def api_dashboard_admin_totp_enrollment_rate():
    """Phase 478 — Percentage of users with totp_secret set. Distinct
    from the raw "users without 2FA" count by surfacing the rate.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    total = User.query.count()
    if total == 0:
        return jsonify({'enrollment_pct': None, 'enrolled': 0, 'total': 0})
    enrolled = User.query.filter(User.totp_secret.isnot(None)).count()
    return jsonify({
        'enrollment_pct': round(100.0 * enrolled / total, 1),
        'enrolled': enrolled,
        'total': total,
    })


@dashboard_bp.route('/ngo-unread-notifications', methods=['GET'])
@login_required
def api_dashboard_ngo_unread_notifications():
    """Phase 481 — Count of Notification rows for current user with
    read=False. Inbox attention signal.
    """
    if current_user.role != 'ngo' or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    from app.models import Notification
    unread = (Notification.query
              .filter(Notification.user_id == current_user.id,
                      Notification.read.is_(False))
              .count())
    return jsonify({'unread': unread})


@dashboard_bp.route('/donor-avg-reviewer-score', methods=['GET'])
@login_required
def api_dashboard_donor_avg_reviewer_score():
    """Phase 482 — Mean overall_score across reviewer-completed reviews
    on donor's grants in last 90 days. Distinct from Phase 224 (AI
    score per criterion).
    """
    if current_user.role not in ('donor', 'admin') or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    rows = (db.session.query(Review.overall_score)
            .join(Application, Application.id == Review.application_id)
            .join(Grant, Application.grant_id == Grant.id)
            .filter(Grant.donor_org_id == current_user.org_id,
                    Review.status.in_(['submitted', 'scored', 'completed']),
                    Review.completed_at.isnot(None),
                    Review.completed_at >= cutoff,
                    Review.overall_score.isnot(None))
            .all())
    if len(rows) < 5:
        return jsonify({'mean_score': None, 'sample': len(rows)})
    scores = [float(s) for (s,) in rows]
    return jsonify({
        'mean_score': round(sum(scores) / len(scores), 1),
        'sample': len(scores),
    })


@dashboard_bp.route('/reviewer-completed-this-month', methods=['GET'])
@login_required
def api_dashboard_reviewer_completed_this_month():
    """Phase 483 — Count of reviews completed by current reviewer since
    first of the current calendar month.
    """
    if current_user.role != 'reviewer':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    count = (Review.query
             .filter(Review.reviewer_user_id == current_user.id,
                     Review.status.in_(['submitted', 'scored', 'completed']),
                     Review.completed_at.isnot(None),
                     Review.completed_at >= month_start)
             .count())
    return jsonify({
        'completed_this_month': count,
        'month_start': month_start.date().isoformat(),
    })


@dashboard_bp.route('/admin-documents-storage', methods=['GET'])
@login_required
def api_dashboard_admin_documents_storage():
    """Phase 484 — Sum of Document.file_size across all uploaded
    documents. Capacity-planning signal.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    total_bytes = (db.session.query(func.coalesce(func.sum(Document.file_size), 0))
                   .scalar() or 0)
    doc_count = Document.query.count()
    return jsonify({
        'total_bytes': int(total_bytes),
        'doc_count': doc_count,
    })


@dashboard_bp.route('/ngo-lifetime-win-rate', methods=['GET'])
@login_required
def api_dashboard_ngo_lifetime_win_rate():
    """Phase 487 — % of all applications ever submitted by this NGO
    that were funded/awarded. Self-gates < 3 decisions on the frontend.
    """
    if current_user.role != 'ngo' or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    rows = (db.session.query(Application.status)
            .filter(Application.org_id == current_user.org_id,
                    Application.decision_recorded_at.isnot(None))
            .all())
    decisions = [s for (s,) in rows]
    if len(decisions) < 3:
        return jsonify({'win_rate_pct': None, 'sample': len(decisions)})
    awarded = sum(1 for s in decisions if s in ('funded', 'awarded'))
    return jsonify({
        'win_rate_pct': round(100.0 * awarded / len(decisions), 1),
        'awarded': awarded,
        'sample': len(decisions),
    })


@dashboard_bp.route('/donor-apps-year-over-year', methods=['GET'])
@login_required
def api_dashboard_donor_apps_year_over_year():
    """Phase 488 — Applications submitted to donor's grants this
    calendar year vs prior calendar year, with delta.
    """
    if current_user.role not in ('donor', 'admin') or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    this_year_start = datetime(now.year, 1, 1, tzinfo=timezone.utc)
    prior_year_start = datetime(now.year - 1, 1, 1, tzinfo=timezone.utc)
    q = (db.session.query(Application)
         .join(Grant, Application.grant_id == Grant.id)
         .filter(Grant.donor_org_id == current_user.org_id,
                 Application.submitted_at.isnot(None)))
    this_year = q.filter(Application.submitted_at >= this_year_start).count()
    prior_year = q.filter(Application.submitted_at >= prior_year_start,
                          Application.submitted_at < this_year_start).count()
    delta = this_year - prior_year
    pct = round(100.0 * delta / prior_year, 1) if prior_year > 0 else None
    return jsonify({
        'this_year': this_year,
        'prior_year': prior_year,
        'delta': delta,
        'pct_change': pct,
        'year': now.year,
    })


@dashboard_bp.route('/reviewer-lifetime-completed', methods=['GET'])
@login_required
def api_dashboard_reviewer_lifetime_completed():
    """Phase 489 — Total count of completed reviews ever for this
    reviewer. Recognition milestone.
    """
    if current_user.role != 'reviewer':
        return jsonify({'error': 'access denied'}), 403
    count = (Review.query
             .filter(Review.reviewer_user_id == current_user.id,
                     Review.status.in_(['submitted', 'scored', 'completed']),
                     Review.completed_at.isnot(None))
             .count())
    return jsonify({'lifetime_completed': count})


@dashboard_bp.route('/admin-notifications-14d', methods=['GET'])
@login_required
def api_dashboard_admin_notifications_14d():
    """Phase 490 — 14-bucket count of Notification rows by day for the
    last 14 days. Volume trend signal.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from app.models import Notification
    from datetime import datetime, timezone, timedelta
    today = datetime.now(timezone.utc).date()
    cutoff = today - timedelta(days=13)
    cutoff_dt = datetime(cutoff.year, cutoff.month, cutoff.day, tzinfo=timezone.utc)
    rows = (Notification.query
            .with_entities(Notification.created_at)
            .filter(Notification.created_at >= cutoff_dt)
            .all())
    buckets = [0] * 14
    for (created_at,) in rows:
        if not created_at:
            continue
        try:
            day = created_at.date() if hasattr(created_at, 'date') else created_at
        except Exception:
            continue
        offset = (day - cutoff).days
        if 0 <= offset < 14:
            buckets[offset] += 1
    return jsonify({'buckets': buckets, 'total': sum(buckets)})


@dashboard_bp.route('/ngo-win-rate-quarter', methods=['GET'])
@login_required
def api_dashboard_ngo_win_rate_quarter():
    """Phase 493 — % of this NGO's decisions recorded in the current
    calendar quarter that were funded/awarded. Self-gates < 3.
    """
    if current_user.role != 'ngo' or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    quarter_start_month = ((now.month - 1) // 3) * 3 + 1
    quarter_start = datetime(now.year, quarter_start_month, 1, tzinfo=timezone.utc)
    rows = (db.session.query(Application.status)
            .filter(Application.org_id == current_user.org_id,
                    Application.decision_recorded_at.isnot(None),
                    Application.decision_recorded_at >= quarter_start)
            .all())
    decisions = [s for (s,) in rows]
    if len(decisions) < 3:
        return jsonify({'win_rate_pct': None, 'sample': len(decisions)})
    awarded = sum(1 for s in decisions if s in ('funded', 'awarded'))
    return jsonify({
        'win_rate_pct': round(100.0 * awarded / len(decisions), 1),
        'awarded': awarded,
        'sample': len(decisions),
        'quarter_start': quarter_start.date().isoformat(),
    })


@dashboard_bp.route('/donor-grants-published-this-month', methods=['GET'])
@login_required
def api_dashboard_donor_grants_published_this_month():
    """Phase 494 — Count of grants this donor created since first of the
    current calendar month. Publication-pace signal.
    """
    if current_user.role not in ('donor', 'admin') or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    count = (Grant.query
             .filter(Grant.donor_org_id == current_user.org_id,
                     Grant.created_at >= month_start)
             .count())
    return jsonify({
        'published_this_month': count,
        'month_start': month_start.date().isoformat(),
    })


@dashboard_bp.route('/reviewer-top-tier-rate', methods=['GET'])
@login_required
def api_dashboard_reviewer_top_tier_rate():
    """Phase 495 — % of reviewer's last-90d completed reviews with
    overall_score >= 90. Top-tier rate.
    """
    if current_user.role != 'reviewer':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    rows = (Review.query
            .filter(Review.reviewer_user_id == current_user.id,
                    Review.status.in_(['submitted', 'scored', 'completed']),
                    Review.completed_at.isnot(None),
                    Review.completed_at >= cutoff,
                    Review.overall_score.isnot(None))
            .all())
    if len(rows) < 5:
        return jsonify({'top_tier_pct': None, 'sample': len(rows)})
    top = sum(1 for r in rows if (r.overall_score or 0) >= 90)
    return jsonify({
        'top_tier_pct': round(100.0 * top / len(rows), 1),
        'top_count': top,
        'sample': len(rows),
    })


@dashboard_bp.route('/admin-active-webhooks', methods=['GET'])
@login_required
def api_dashboard_admin_active_webhooks():
    """Phase 496 — Webhook integration health snapshot: active vs total."""
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from app.models.webhook import Webhook
    active = Webhook.query.filter(Webhook.active.is_(True)).count()
    total = Webhook.query.count()
    return jsonify({'active': active, 'total': total})


@dashboard_bp.route('/ngo-watchlist-size', methods=['GET'])
@login_required
def api_dashboard_ngo_watchlist_size():
    """Phase 499 — Count of WatchlistItem rows for the current user.
    Surfaces how many grants the NGO is tracking.
    """
    if current_user.role != 'ngo' or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    from app.models.watchlist import WatchlistItem
    count = (WatchlistItem.query
             .filter(WatchlistItem.user_id == current_user.id)
             .count())
    return jsonify({'watchlist_size': count})


@dashboard_bp.route('/donor-days-since-last-grant', methods=['GET'])
@login_required
def api_dashboard_donor_days_since_last_grant():
    """Phase 500 — Days since this donor most recently created a grant.
    Inactivity signal; amber on the frontend when > 60 days.
    """
    if current_user.role not in ('donor', 'admin') or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone
    newest = (Grant.query
              .filter(Grant.donor_org_id == current_user.org_id)
              .order_by(Grant.created_at.desc())
              .first())
    if not newest or not newest.created_at:
        return jsonify({'days': None, 'newest_at': None})
    created = newest.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    days = (datetime.now(timezone.utc) - created).days
    return jsonify({
        'days': days,
        'newest_at': created.date().isoformat(),
    })


@dashboard_bp.route('/reviewer-private-notes-coverage', methods=['GET'])
@login_required
def api_dashboard_reviewer_private_notes_coverage():
    """Phase 501 — % of reviewer's last-90d completed reviews that
    include private_notes. Self-gates < 5.
    """
    if current_user.role != 'reviewer':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    rows = (Review.query
            .filter(Review.reviewer_user_id == current_user.id,
                    Review.status.in_(['submitted', 'scored', 'completed']),
                    Review.completed_at.isnot(None),
                    Review.completed_at >= cutoff)
            .all())
    if len(rows) < 5:
        return jsonify({'coverage_pct': None, 'sample': len(rows)})
    with_notes = sum(1 for r in rows if (r.private_notes or '').strip())
    return jsonify({
        'coverage_pct': round(100.0 * with_notes / len(rows), 1),
        'with_notes': with_notes,
        'sample': len(rows),
    })


@dashboard_bp.route('/admin-failed-cron-runs-7d', methods=['GET'])
@login_required
def api_dashboard_admin_failed_cron_runs_7d():
    """Phase 502 — Count of CronRun rows with success=False in the last
    7 days vs total runs in the same window. Health signal.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from app.models.cron_run import CronRun
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    failed = (CronRun.query
              .filter(CronRun.run_at >= cutoff,
                      CronRun.success.is_(False))
              .count())
    total = (CronRun.query
             .filter(CronRun.run_at >= cutoff)
             .count())
    return jsonify({'failed': failed, 'total': total})


@dashboard_bp.route('/ngo-sector-breadth', methods=['GET'])
@login_required
def api_dashboard_ngo_sector_breadth():
    """Phase 505 — Count of distinct sectors across this NGO's
    applications. Pipeline-diversity signal.
    """
    if current_user.role != 'ngo' or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    import json as _json
    rows = (db.session.query(Grant.sectors)
            .join(Application, Application.grant_id == Grant.id)
            .filter(Application.org_id == current_user.org_id,
                    Grant.sectors.isnot(None))
            .distinct().all())
    sector_set = set()
    for (raw,) in rows:
        if not raw:
            continue
        try:
            parsed = _json.loads(raw)
        except (TypeError, ValueError):
            continue
        if isinstance(parsed, list):
            for s in parsed:
                if isinstance(s, str) and s.strip():
                    sector_set.add(s.strip().lower())
    return jsonify({'distinct_sectors': len(sector_set)})


@dashboard_bp.route('/donor-median-grant-funding', methods=['GET'])
@login_required
def api_dashboard_donor_median_grant_funding():
    """Phase 506 — Median Grant.total_funding across all grants this
    donor has published. Distinct from Phase 428 (median funded
    amount on Application).
    """
    if current_user.role not in ('donor', 'admin') or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    rows = (db.session.query(Grant.total_funding, Grant.currency)
            .filter(Grant.donor_org_id == current_user.org_id,
                    Grant.total_funding.isnot(None))
            .all())
    if not rows:
        return jsonify({'median': None, 'sample': 0, 'currency': None})
    amounts = []
    currency = None
    for amt, cur in rows:
        try:
            amounts.append(float(amt))
        except (TypeError, ValueError):
            pass
        if currency is None and cur:
            currency = cur
    if not amounts:
        return jsonify({'median': None, 'sample': 0, 'currency': None})
    amounts.sort()
    n = len(amounts)
    median = amounts[n // 2] if n % 2 else (amounts[n // 2 - 1] + amounts[n // 2]) / 2
    return jsonify({
        'median': round(median, 2),
        'sample': n,
        'currency': currency,
    })


@dashboard_bp.route('/reviewer-longest-review', methods=['GET'])
@login_required
def api_dashboard_reviewer_longest_review():
    """Phase 507 — Max hours between created_at and completed_at across
    reviewer's last-90d completed reviews. Outlier signal.
    """
    if current_user.role != 'reviewer':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    rows = (Review.query
            .filter(Review.reviewer_user_id == current_user.id,
                    Review.status.in_(['submitted', 'scored', 'completed']),
                    Review.created_at.isnot(None),
                    Review.completed_at.isnot(None),
                    Review.completed_at >= cutoff)
            .all())
    durations = []
    for r in rows:
        if not r.created_at or not r.completed_at:
            continue
        h = (r.completed_at - r.created_at).total_seconds() / 3600.0
        if h >= 0:
            durations.append(h)
    if len(durations) < 3:
        return jsonify({'longest_hours': None, 'sample': len(durations)})
    return jsonify({
        'longest_hours': round(max(durations), 1),
        'sample': len(durations),
    })


@dashboard_bp.route('/admin-ai-models-today', methods=['GET'])
@login_required
def api_dashboard_admin_ai_models_today():
    """Phase 508 — Top 5 models by ai_call_logs count in last 24h."""
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from sqlalchemy import text as _text
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    try:
        rows = db.session.execute(_text(
            "SELECT model, COUNT(*) AS n FROM ai_call_logs "
            "WHERE created_at >= :c AND model IS NOT NULL "
            "GROUP BY model ORDER BY n DESC LIMIT 5"
        ), {'c': cutoff}).all()
    except Exception:
        rows = []
    out = [{'model': r.model, 'count': int(r.n or 0)} for r in rows]
    return jsonify({'models': out})


@dashboard_bp.route('/ngo-days-since-last-submission', methods=['GET'])
@login_required
def api_dashboard_ngo_days_since_last_submission():
    """Phase 511 — Days since this NGO's most recent application
    submission. Activity-pulse signal.
    """
    if current_user.role != 'ngo' or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone
    newest = (Application.query
              .filter(Application.org_id == current_user.org_id,
                      Application.submitted_at.isnot(None))
              .order_by(Application.submitted_at.desc())
              .first())
    if not newest or not newest.submitted_at:
        return jsonify({'days': None})
    submitted = newest.submitted_at
    if submitted.tzinfo is None:
        submitted = submitted.replace(tzinfo=timezone.utc)
    days = (datetime.now(timezone.utc) - submitted).days
    return jsonify({
        'days': days,
        'last_submitted_at': submitted.date().isoformat(),
    })


@dashboard_bp.route('/donor-open-grants-funding', methods=['GET'])
@login_required
def api_dashboard_donor_open_grants_funding():
    """Phase 512 — Sum of Grant.total_funding across donor's grants
    currently in open/review status. Pipeline capacity signal.
    """
    if current_user.role not in ('donor', 'admin') or not current_user.org_id:
        return jsonify({'error': 'access denied'}), 403
    rows = (db.session.query(Grant.total_funding, Grant.currency)
            .filter(Grant.donor_org_id == current_user.org_id,
                    Grant.status.in_(['open', 'review']),
                    Grant.total_funding.isnot(None))
            .all())
    total = 0.0
    currency = None
    for amt, cur in rows:
        try:
            total += float(amt)
        except (TypeError, ValueError):
            pass
        if currency is None and cur:
            currency = cur
    return jsonify({
        'total': round(total, 2),
        'open_count': len(rows),
        'currency': currency,
    })


@dashboard_bp.route('/reviewer-shortest-review', methods=['GET'])
@login_required
def api_dashboard_reviewer_shortest_review():
    """Phase 513 — Min hours between created_at and completed_at across
    reviewer's last-90d completed reviews. Self-gates < 3.
    """
    if current_user.role != 'reviewer':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    rows = (Review.query
            .filter(Review.reviewer_user_id == current_user.id,
                    Review.status.in_(['submitted', 'scored', 'completed']),
                    Review.created_at.isnot(None),
                    Review.completed_at.isnot(None),
                    Review.completed_at >= cutoff)
            .all())
    durations = []
    for r in rows:
        if not r.created_at or not r.completed_at:
            continue
        h = (r.completed_at - r.created_at).total_seconds() / 3600.0
        if h >= 0:
            durations.append(h)
    if len(durations) < 3:
        return jsonify({'shortest_hours': None, 'sample': len(durations)})
    return jsonify({
        'shortest_hours': round(min(durations), 2),
        'sample': len(durations),
    })


@dashboard_bp.route('/admin-new-orgs-this-week', methods=['GET'])
@login_required
def api_dashboard_admin_new_orgs_this_week():
    """Phase 514 — Count of Organization rows created in last 7 days,
    broken down by org_type. Onboarding pulse signal.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from collections import Counter
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    rows = (Organization.query
            .filter(Organization.created_at >= cutoff)
            .with_entities(Organization.org_type)
            .all())
    types = Counter((t or 'unknown') for (t,) in rows)
    return jsonify({
        'total': sum(types.values()),
        'by_type': [{'org_type': k, 'count': v} for k, v in types.most_common()],
    })


@dashboard_bp.route('/ngo-submission-consistency', methods=['GET'])
@login_required
def api_dashboard_ngo_submission_consistency():
    """Phase 517 — Number of distinct calendar months in the last 12
    months with at least one submitted application. Range 0-12.
    Higher is steadier engagement; gaps stand out as quiet stretches.
    """
    if current_user.role not in ('ngo', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=365)
    rows = (db.session.query(Application.submitted_at)
            .filter(Application.ngo_org_id == current_user.org_id,
                    Application.submitted_at.isnot(None),
                    Application.submitted_at >= cutoff)
            .all())
    months = set()
    for (ts,) in rows:
        if ts is None:
            continue
        months.add((ts.year, ts.month))
    return jsonify({'months_with_submission': len(months), 'sample': len(rows)})


@dashboard_bp.route('/donor-applications-without-reviewer', methods=['GET'])
@login_required
def api_dashboard_donor_applications_without_reviewer():
    """Phase 518 — Donor's applications in 'submitted' or 'in_review'
    status that have zero Review rows assigned. Operational staffing
    signal — applications waiting on reviewer assignment.
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from sqlalchemy import not_, exists
    sub = db.session.query(Review.id).filter(Review.application_id == Application.id)
    rows = (db.session.query(Application.id)
            .join(Grant, Application.grant_id == Grant.id)
            .filter(Grant.donor_org_id == current_user.org_id,
                    Application.status.in_(['submitted', 'in_review']),
                    not_(sub.exists()))
            .all())
    return jsonify({'count': len(rows)})


@dashboard_bp.route('/reviewer-avg-rationale-length', methods=['GET'])
@login_required
def api_dashboard_reviewer_avg_rationale_length():
    """Phase 519 — Average word count of reviewer's per-criterion
    comments across last-30-day completed reviews. Self-reflection
    signal on rationale depth. Self-gates < 3 sample on the client.
    """
    if current_user.role not in ('reviewer', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    rows = (Review.query
            .filter(Review.reviewer_user_id == current_user.id,
                    Review.status == 'completed',
                    Review.completed_at >= cutoff,
                    Review.comments.isnot(None))
            .all())
    if not rows:
        return jsonify({'avg_words': None, 'sample': 0})
    total_words = 0
    count = 0
    for r in rows:
        comments = r.get_comments()
        if not comments:
            continue
        text = ' '.join(str(v) for v in comments.values() if v)
        words = len(text.split())
        if words > 0:
            total_words += words
            count += 1
    if count == 0:
        return jsonify({'avg_words': None, 'sample': 0})
    return jsonify({'avg_words': round(total_words / count, 1), 'sample': count})


@dashboard_bp.route('/admin-feedback-this-week', methods=['GET'])
@login_required
def api_dashboard_admin_feedback_this_week():
    """Phase 520 — UserFeedback rows in last 7 days bucketed by NPS
    (promoter 9-10, passive 7-8, detractor 0-6). Pulse on user mood.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    from app.models.user_feedback import UserFeedback
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    rows = (db.session.query(UserFeedback.score)
            .filter(UserFeedback.created_at >= cutoff)
            .all())
    buckets = {'promoter': 0, 'passive': 0, 'detractor': 0}
    for (score,) in rows:
        if score is None:
            continue
        if score >= 9:
            buckets['promoter'] += 1
        elif score >= 7:
            buckets['passive'] += 1
        else:
            buckets['detractor'] += 1
    return jsonify({'total': sum(buckets.values()), 'buckets': buckets})


@dashboard_bp.route('/ngo-active-grants', methods=['GET'])
@login_required
def api_dashboard_ngo_active_grants():
    """Phase 523 — Count of NGO's applications currently in 'funded',
    'awarded', or 'in_progress' status. The grants the NGO is
    actively delivering on right now.
    """
    if current_user.role not in ('ngo', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    count = (Application.query
             .filter(Application.ngo_org_id == current_user.org_id,
                     Application.status.in_(['funded', 'awarded', 'in_progress']))
             .count())
    return jsonify({'count': count})


@dashboard_bp.route('/donor-grants-without-applications', methods=['GET'])
@login_required
def api_dashboard_donor_grants_without_applications():
    """Phase 524 — Donor's published grants ('open' or 'review') with
    zero Application rows. Operational signal — grant didn't get
    traction; may need promotion or scope tweak.
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from sqlalchemy import not_
    sub = db.session.query(Application.id).filter(Application.grant_id == Grant.id)
    rows = (db.session.query(Grant.id)
            .filter(Grant.donor_org_id == current_user.org_id,
                    Grant.status.in_(['open', 'review']),
                    not_(sub.exists()))
            .all())
    return jsonify({'count': len(rows)})


@dashboard_bp.route('/reviewer-weekly-cadence', methods=['GET'])
@login_required
def api_dashboard_reviewer_weekly_cadence():
    """Phase 525 — Count of completed reviews per ISO week for the
    last 4 weeks. List newest week first. Self-gates on the client
    when the total across all 4 weeks is zero.
    """
    if current_user.role not in ('reviewer', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    weeks = []
    for offset in range(4):
        week_end = now - timedelta(days=offset * 7)
        week_start = week_end - timedelta(days=7)
        c = (Review.query
             .filter(Review.reviewer_user_id == current_user.id,
                     Review.status == 'completed',
                     Review.completed_at >= week_start,
                     Review.completed_at < week_end)
             .count())
        weeks.append({'week_offset': offset, 'count': c})
    return jsonify({'weeks': weeks, 'total': sum(w['count'] for w in weeks)})


@dashboard_bp.route('/admin-webauthn-registrations-this-month', methods=['GET'])
@login_required
def api_dashboard_admin_webauthn_registrations_this_month():
    """Phase 526 — Count of WebAuthn credentials registered in the
    last 30 days. Security adoption pulse — how many users took the
    passwordless step recently.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    from app.models.webauthn_credential import WebAuthnCredential
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    count = (WebAuthnCredential.query
             .filter(WebAuthnCredential.created_at >= cutoff)
             .count())
    return jsonify({'count': count})


@dashboard_bp.route('/ngo-documents-this-month', methods=['GET'])
@login_required
def api_dashboard_ngo_documents_this_month():
    """Phase 529 — Count of Document rows uploaded against this NGO's
    applications in the last 30 days. Activity pulse on doc submission.
    """
    if current_user.role not in ('ngo', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    count = (db.session.query(Document.id)
             .join(Application, Document.application_id == Application.id)
             .filter(Application.ngo_org_id == current_user.org_id,
                     Document.uploaded_at >= cutoff)
             .count())
    return jsonify({'count': count})


@dashboard_bp.route('/donor-approvals-today', methods=['GET'])
@login_required
def api_dashboard_donor_approvals_today():
    """Phase 530 — Count of donor's applications transitioned to
    funded/awarded in the last 24 hours. Today's win count.
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    count = (db.session.query(Application.id)
             .join(Grant, Application.grant_id == Grant.id)
             .filter(Grant.donor_org_id == current_user.org_id,
                     Application.status.in_(['funded', 'awarded']),
                     Application.decision_recorded_at >= cutoff)
             .count())
    return jsonify({'count': count})


@dashboard_bp.route('/reviewer-scoring-tightness', methods=['GET'])
@login_required
def api_dashboard_reviewer_scoring_tightness():
    """Phase 531 — Standard deviation of reviewer's overall_score
    across last-30d completed reviews. Self-reflection on judgment
    consistency. Low std (clustered) vs high std (varied).
    """
    if current_user.role not in ('reviewer', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    import math
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    scores = [s for (s,) in (
        db.session.query(Review.overall_score)
        .filter(Review.reviewer_user_id == current_user.id,
                Review.status == 'completed',
                Review.completed_at >= cutoff,
                Review.overall_score.isnot(None))
        .all()
    ) if s is not None]
    if len(scores) < 3:
        return jsonify({'std_dev': None, 'sample': len(scores)})
    mean = sum(scores) / len(scores)
    var = sum((s - mean) ** 2 for s in scores) / len(scores)
    return jsonify({'std_dev': round(math.sqrt(var), 1), 'sample': len(scores)})


@dashboard_bp.route('/admin-tenant-messages-this-week', methods=['GET'])
@login_required
def api_dashboard_admin_tenant_messages_this_week():
    """Phase 532 — Count of TenantMessage rows in last 7 days.
    Engagement pulse on tenant-to-member broadcasts.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    from app.models.tenant_message import TenantMessage
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    count = (TenantMessage.query
             .filter(TenantMessage.sent_at >= cutoff)
             .count())
    return jsonify({'count': count})


@dashboard_bp.route('/ngo-pipeline-count', methods=['GET'])
@login_required
def api_dashboard_ngo_pipeline_count():
    """Phase 535 — Count of NGO's applications currently in 'submitted'
    or 'in_review' — the bottleneck visibility metric.
    """
    if current_user.role not in ('ngo', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    count = (Application.query
             .filter(Application.ngo_org_id == current_user.org_id,
                     Application.status.in_(['submitted', 'in_review']))
             .count())
    return jsonify({'count': count})


@dashboard_bp.route('/donor-grants-closing-7d', methods=['GET'])
@login_required
def api_dashboard_donor_grants_closing_7d():
    """Phase 536 — Count of donor's published grants with deadline
    within the next 7 days. Urgency signal for last-call promotion.
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta, date
    today = date.today()
    horizon = today + timedelta(days=7)
    count = (Grant.query
             .filter(Grant.donor_org_id == current_user.org_id,
                     Grant.status.in_(['open', 'review']),
                     Grant.deadline.isnot(None),
                     Grant.deadline >= today,
                     Grant.deadline <= horizon)
             .count())
    return jsonify({'count': count})


@dashboard_bp.route('/reviewer-snoozed-count', methods=['GET'])
@login_required
def api_dashboard_reviewer_snoozed_count():
    """Phase 537 — Count of reviewer's reviews with snoozed_until > now.
    Visibility on what's hidden behind a temporary timer.
    """
    if current_user.role not in ('reviewer', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    count = (Review.query
             .filter(Review.reviewer_user_id == current_user.id,
                     Review.snoozed_until.isnot(None),
                     Review.snoozed_until > now)
             .count())
    return jsonify({'count': count})


@dashboard_bp.route('/admin-ai-threads-this-week', methods=['GET'])
@login_required
def api_dashboard_admin_ai_threads_this_week():
    """Phase 538 — Count of AIThread rows created in last 7 days.
    AI co-pilot engagement pulse.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    from app.models.ai_thread import AIThread
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    count = (AIThread.query
             .filter(AIThread.created_at >= cutoff)
             .count())
    return jsonify({'count': count})


@dashboard_bp.route('/ngo-saved-searches-count', methods=['GET'])
@login_required
def api_dashboard_ngo_saved_searches_count():
    """Phase 541 — Count of SavedSearch rows for current_user. Quick
    signal on how much the NGO leans on search alerts.
    """
    if current_user.role not in ('ngo', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from app.models.saved_search import SavedSearch
    count = SavedSearch.query.filter_by(user_id=current_user.id).count()
    return jsonify({'count': count})


@dashboard_bp.route('/donor-declined-this-month', methods=['GET'])
@login_required
def api_dashboard_donor_declined_this_month():
    """Phase 542 — Count of donor's applications transitioned to
    'declined' this calendar month.
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    count = (db.session.query(Application.id)
             .join(Grant, Application.grant_id == Grant.id)
             .filter(Grant.donor_org_id == current_user.org_id,
                     Application.status == 'declined',
                     Application.decision_recorded_at >= month_start)
             .count())
    return jsonify({'count': count})


@dashboard_bp.route('/reviewer-comments-rate', methods=['GET'])
@login_required
def api_dashboard_reviewer_comments_rate():
    """Phase 543 — Percent of reviewer's last-30d completed reviews
    with a non-empty comments JSON. Quality signal on rationale
    coverage. Self-gates < 3 sample on the client.
    """
    if current_user.role not in ('reviewer', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    rows = (Review.query
            .filter(Review.reviewer_user_id == current_user.id,
                    Review.status == 'completed',
                    Review.completed_at >= cutoff)
            .all())
    if not rows:
        return jsonify({'rate': None, 'sample': 0})
    with_comments = 0
    for r in rows:
        c = r.get_comments()
        if c and any(v for v in c.values() if v):
            with_comments += 1
    rate = round(100 * with_comments / len(rows), 1)
    return jsonify({'rate': rate, 'sample': len(rows)})


@dashboard_bp.route('/admin-large-documents', methods=['GET'])
@login_required
def api_dashboard_admin_large_documents():
    """Phase 544 — Count of Document rows with file_size > 10 MB.
    Storage cost / heavy-attachment signal.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    threshold = 10 * 1024 * 1024
    count = (Document.query
             .filter(Document.file_size.isnot(None),
                     Document.file_size > threshold)
             .count())
    return jsonify({'count': count, 'threshold_mb': 10})


@dashboard_bp.route('/ngo-documents-pending-extraction', methods=['GET'])
@login_required
def api_dashboard_ngo_documents_pending_extraction():
    """Phase 547 — Count of Document rows tied to NGO's applications
    with extraction_status in 'queued' or 'running'. Visibility on
    the AI processing queue so the NGO knows what's still cooking.
    """
    if current_user.role not in ('ngo', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    count = (db.session.query(Document.id)
             .join(Application, Document.application_id == Application.id)
             .filter(Application.ngo_org_id == current_user.org_id,
                     Document.extraction_status.in_(['queued', 'running']))
             .count())
    return jsonify({'count': count})


@dashboard_bp.route('/donor-apps-open-over-60d', methods=['GET'])
@login_required
def api_dashboard_donor_apps_open_over_60d():
    """Phase 548 — Count of donor's applications in submitted/in_review
    with created_at older than 60 days. Staleness signal — these may
    have slipped through cracks.
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=60)
    count = (db.session.query(Application.id)
             .join(Grant, Application.grant_id == Grant.id)
             .filter(Grant.donor_org_id == current_user.org_id,
                     Application.status.in_(['submitted', 'in_review']),
                     Application.created_at < cutoff)
             .count())
    return jsonify({'count': count})


@dashboard_bp.route('/reviewer-next-deadline', methods=['GET'])
@login_required
def api_dashboard_reviewer_next_deadline():
    """Phase 549 — Earliest grant.deadline among reviewer's non-completed
    Review rows. Returns days from today (negative if overdue).
    """
    if current_user.role not in ('reviewer', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from datetime import date
    row = (db.session.query(Grant.deadline)
           .join(Application, Application.grant_id == Grant.id)
           .join(Review, Review.application_id == Application.id)
           .filter(Review.reviewer_user_id == current_user.id,
                   Review.status != 'completed',
                   Grant.deadline.isnot(None))
           .order_by(Grant.deadline.asc())
           .first())
    if not row or row[0] is None:
        return jsonify({'days': None})
    deadline = row[0]
    today = date.today()
    delta = (deadline - today).days
    return jsonify({'days': delta, 'deadline': deadline.isoformat()})


@dashboard_bp.route('/admin-active-push-subscriptions', methods=['GET'])
@login_required
def api_dashboard_admin_active_push_subscriptions():
    """Phase 550 — Total PushSubscription rows. Push notification
    adoption pulse.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from app.models.push_subscription import PushSubscription
    count = PushSubscription.query.count()
    return jsonify({'count': count})


@dashboard_bp.route('/ngo-ai-calls-7d', methods=['GET'])
@login_required
def api_dashboard_ngo_ai_calls_7d():
    """Phase 553 — Count of AICallLog rows attributed to NGO's org in
    last 7 days. Self-adoption signal — does the team use the AI
    surfaces actively?
    """
    if current_user.role not in ('ngo', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    from app.models.ai_thread import AICallLog
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    count = (AICallLog.query
             .filter(AICallLog.created_at >= cutoff,
                     AICallLog.org_id == current_user.org_id)
             .count())
    return jsonify({'count': count})


@dashboard_bp.route('/donor-criteria-templates-count', methods=['GET'])
@login_required
def api_dashboard_donor_criteria_templates_count():
    """Phase 554 — Count of CriteriaTemplate rows for the donor's org.
    Tracks investment in the reusable evaluation criteria library.
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from app.models.criteria_template import CriteriaTemplate
    count = (CriteriaTemplate.query
             .filter(CriteriaTemplate.donor_org_id == current_user.org_id)
             .count())
    return jsonify({'count': count})


@dashboard_bp.route('/reviewer-review-variety', methods=['GET'])
@login_required
def api_dashboard_reviewer_review_variety():
    """Phase 555 — Count of distinct grants reviewed by current reviewer
    in last 30d. Variety signal — narrow expertise vs broad pool work.
    """
    if current_user.role not in ('reviewer', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    rows = (db.session.query(Application.grant_id)
            .join(Review, Review.application_id == Application.id)
            .filter(Review.reviewer_user_id == current_user.id,
                    Review.completed_at >= cutoff,
                    Review.status == 'completed')
            .distinct()
            .all())
    return jsonify({'distinct_grants': len(rows)})


@dashboard_bp.route('/admin-audit-entries-today', methods=['GET'])
@login_required
def api_dashboard_admin_audit_entries_today():
    """Phase 556 — Count of AuditChainEntry rows in last 24 hours.
    Daily activity pulse — distinct from Phase 412 (audit rate / day)
    by reading current 24h instead of rolling rate.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    from app.models.audit_chain import AuditChainEntry
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    count = (AuditChainEntry.query
             .filter(AuditChainEntry.created_at >= cutoff)
             .count())
    return jsonify({'count': count})


@dashboard_bp.route('/ngo-submitted-today', methods=['GET'])
@login_required
def api_dashboard_ngo_submitted_today():
    """Phase 559 — Count of NGO's applications with submitted_at within
    the last 24 hours. Today's submission tally.
    """
    if current_user.role not in ('ngo', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    count = (Application.query
             .filter(Application.ngo_org_id == current_user.org_id,
                     Application.submitted_at.isnot(None),
                     Application.submitted_at >= cutoff)
             .count())
    return jsonify({'count': count})


@dashboard_bp.route('/donor-starred-count', methods=['GET'])
@login_required
def api_dashboard_donor_starred_count():
    """Phase 560 — Count of donor's applications with is_starred=True.
    Shortlist size at-a-glance. Distinct from Phase 213 (the dashboard
    tile that lists starred apps); this is a scalar header stat.
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    count = (db.session.query(Application.id)
             .join(Grant, Application.grant_id == Grant.id)
             .filter(Grant.donor_org_id == current_user.org_id,
                     Application.is_starred.is_(True))
             .count())
    return jsonify({'count': count})


@dashboard_bp.route('/reviewer-completed-today', methods=['GET'])
@login_required
def api_dashboard_reviewer_completed_today():
    """Phase 561 — Count of reviewer's reviews completed in the last
    24 hours. Distinct from Phase 405 (this calendar week) by using
    a rolling 24h window — today's tally.
    """
    if current_user.role not in ('reviewer', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    count = (Review.query
             .filter(Review.reviewer_user_id == current_user.id,
                     Review.status == 'completed',
                     Review.completed_at >= cutoff)
             .count())
    return jsonify({'count': count})


@dashboard_bp.route('/admin-saved-searches-lifetime', methods=['GET'])
@login_required
def api_dashboard_admin_saved_searches_lifetime():
    """Phase 562 — Total SavedSearch rows platform-wide. Adoption
    signal for the search alerts feature.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from app.models.saved_search import SavedSearch
    count = SavedSearch.query.count()
    return jsonify({'count': count})


@dashboard_bp.route('/ngo-eoi-count', methods=['GET'])
@login_required
def api_dashboard_ngo_eoi_count():
    """Phase 565 — Count of ExpressionOfInterest rows for current
    NGO's org. Shows how active the org has been signalling intent.
    """
    if current_user.role not in ('ngo', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from app.models.expression_of_interest import ExpressionOfInterest
    count = (ExpressionOfInterest.query
             .filter(ExpressionOfInterest.org_id == current_user.org_id)
             .count())
    return jsonify({'count': count})


@dashboard_bp.route('/donor-eoi-received', methods=['GET'])
@login_required
def api_dashboard_donor_eoi_received():
    """Phase 566 — Total ExpressionOfInterest rows across donor's
    grants. Scalar header (distinct from Phase 349 which is a
    per-grant rollup tile).
    """
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from app.models.expression_of_interest import ExpressionOfInterest
    count = (db.session.query(ExpressionOfInterest.id)
             .join(Grant, ExpressionOfInterest.grant_id == Grant.id)
             .filter(Grant.donor_org_id == current_user.org_id)
             .count())
    return jsonify({'count': count})


@dashboard_bp.route('/reviewer-private-notes-30d', methods=['GET'])
@login_required
def api_dashboard_reviewer_private_notes_30d():
    """Phase 567 — Count of reviewer's reviews with non-empty
    private_notes updated in last 30 days. Tracks the calibration
    journal habit.
    """
    if current_user.role not in ('reviewer', 'admin'):
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    count = (Review.query
             .filter(Review.reviewer_user_id == current_user.id,
                     Review.updated_at >= cutoff,
                     Review.private_notes.isnot(None),
                     Review.private_notes != '')
             .count())
    return jsonify({'count': count})


@dashboard_bp.route('/admin-stale-trust-profiles', methods=['GET'])
@login_required
def api_dashboard_admin_stale_trust_profiles():
    """Phase 568 — Count of NGO Organizations whose most recent
    Application activity is older than 90 days. Engagement / dormancy
    signal at the platform level.
    """
    if current_user.role != 'admin':
        return jsonify({'error': 'access denied'}), 403
    from datetime import datetime, timezone, timedelta
    from sqlalchemy import func, not_, exists
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    recent_sub = db.session.query(Application.ngo_org_id).filter(
        Application.ngo_org_id == Organization.id,
        Application.updated_at >= cutoff,
    )
    count = (Organization.query
             .filter(Organization.org_type == 'ngo',
                     not_(recent_sub.exists()))
             .count())
    return jsonify({'count': count})
