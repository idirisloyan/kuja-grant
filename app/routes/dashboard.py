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
