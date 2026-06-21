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
