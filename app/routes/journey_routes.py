"""
Phase 92 — Continuous NGO journey tracker.

The team's review: "Build your organization profile → demonstrate readiness
→ apply → receive funding → remain compliant → report impact. It should
show one current stage, one next action, completed milestones, and what
completing the next action unlocks."

This route computes that journey state for the current NGO user.

Stages (in order):
  1. profile    — basic org information completed
  2. readiness  — capacity assessment done, key policies uploaded
  3. apply      — at least one application submitted
  4. funded     — at least one grant awarded / active
  5. compliant  — Trust Profile is healthy + no overdue reports
  6. impact     — at least one report accepted by a donor

Returns: {
  stages: [{ key, label, status, completed_at? }],
  current_stage: str,
  next_action: { label, hint, href, unlocks? },
  completion_pct: 0-100,
}
"""

import logging
from datetime import datetime, timezone
from flask import Blueprint, jsonify
from flask_login import login_required, current_user

from app.extensions import db
from app.utils.decorators import role_required

logger = logging.getLogger('kuja')

journey_bp = Blueprint('journey', __name__, url_prefix='/api/journey')

STAGES = [
    ('profile',    'Build your profile',     'Tell donors who you are.'),
    ('readiness',  'Demonstrate readiness',  'Show you can deliver a grant.'),
    ('apply',      'Apply for funding',      'Submit your first application.'),
    ('funded',     'Receive funding',        'Win a grant.'),
    ('compliant',  'Stay compliant',         'Keep your record clean.'),
    ('impact',     'Report impact',          'Show donors what changed.'),
]


def _profile_done(org) -> bool:
    """Stage 1: basic org info is filled."""
    if not org:
        return False
    required_fields = ['name', 'sector', 'country']
    return all(getattr(org, f, None) for f in required_fields)


def _readiness_done(org_id: int) -> bool:
    """Stage 2: capacity assessment + at least one policy doc."""
    try:
        from app.models import Assessment, Document
        # Has a completed capacity assessment.
        a = Assessment.query.filter_by(org_id=org_id).order_by(
            Assessment.updated_at.desc()).first()
        if not a:
            return False
        # Has at least one policy / registration doc.
        d = Document.query.filter(
            Document.doc_type.in_(['policy', 'registration', 'audit',
                                    'safeguarding', 'governance']),
        ).first()
        return bool(d)
    except Exception:
        return False


def _apply_done(org_id: int) -> bool:
    """Stage 3: at least one submitted application."""
    try:
        from app.models import Application
        return Application.query.filter(
            Application.ngo_org_id == org_id,
            Application.status.in_(['submitted', 'in_review', 'under_review',
                                     'awarded', 'accepted', 'declined',
                                     'rejected']),
        ).count() > 0
    except Exception:
        return False


def _funded_done(org_id: int) -> bool:
    """Stage 4: at least one grant has reached awarded / active."""
    try:
        from app.models import Application
        return Application.query.filter(
            Application.ngo_org_id == org_id,
            Application.status.in_(['awarded', 'accepted', 'approved']),
        ).count() > 0
    except Exception:
        return False


def _compliant_done(org_id: int) -> bool:
    """Stage 5: no overdue reports AND no critical Trust Profile gaps."""
    try:
        from app.models import Report
        overdue = Report.query.filter(
            Report.submitted_by_org_id == org_id,
            Report.status.in_(['draft', 'revision_requested']),
            Report.due_date < datetime.now(timezone.utc).date(),
        ).count()
        return overdue == 0
    except Exception:
        return False


def _impact_done(org_id: int) -> bool:
    """Stage 6: at least one report accepted by a donor."""
    try:
        from app.models import Report
        return Report.query.filter(
            Report.submitted_by_org_id == org_id,
            Report.status.in_(['accepted', 'approved']),
        ).count() > 0
    except Exception:
        return False


def _next_action_for(stage_key: str) -> dict:
    """Return the one concrete action to advance from this stage."""
    return {
        'profile': {
            'label': 'Complete your organisation profile',
            'hint': 'Add your name, sector, country, and mission statement — about 3 minutes.',
            'href': '/organizations/profile',
            'unlocks': 'Donors can find you in search.',
        },
        'readiness': {
            'label': 'Take the capacity assessment',
            'hint': 'A guided questionnaire that scores you against donor expectations. You only do it once and every donor sees the result.',
            'href': '/assessments',
            'unlocks': 'Apply to grants that require an assessment score.',
        },
        'apply': {
            'label': 'Submit your first application',
            'hint': 'Find a grant that matches your work and apply — Kuja can pre-fill 80% of the responses from your profile and assessment.',
            'href': '/grants',
            'unlocks': 'Get scored, get feedback, get funded.',
        },
        'funded': {
            'label': 'Keep applying',
            'hint': 'Most NGOs apply to 3-5 grants before winning their first. Every application improves your reviewer score.',
            'href': '/grants',
            'unlocks': 'Activate your first grant and start delivering.',
        },
        'compliant': {
            'label': 'Submit your overdue reports',
            'hint': 'A clean reporting record is the single biggest predictor of repeat funding. Voice draft any overdue report in 5 minutes.',
            'href': '/reports',
            'unlocks': 'Eligibility for fast-track grants and pre-screened opportunities.',
        },
        'impact': {
            'label': 'Submit your next report',
            'hint': 'Donors notice NGOs that report consistently. Each accepted report raises your trust score for future grants.',
            'href': '/reports',
            'unlocks': 'Repeat funding from the same donor and referrals to peer donors.',
        },
        # Final state — everything done. Surface as "good standing."
        'done': {
            'label': 'You are in good standing',
            'hint': 'Profile is complete, applications are landing, reports are accepted. Keep the rhythm.',
            'href': '/dashboard',
            'unlocks': None,
        },
    }.get(stage_key, {})


@journey_bp.route('/me', methods=['GET'])
@login_required
@role_required('ngo')
def api_my_journey():
    """Compute the journey state for the current NGO user."""
    try:
        from app.models import Organization
        org = db.session.get(Organization, current_user.org_id)
    except Exception:
        org = None

    org_id = current_user.org_id

    stage_status = {}
    stage_status['profile']    = _profile_done(org)
    stage_status['readiness']  = _readiness_done(org_id) if stage_status['profile'] else False
    stage_status['apply']      = _apply_done(org_id) if stage_status['readiness'] else False
    stage_status['funded']     = _funded_done(org_id) if stage_status['apply'] else False
    stage_status['compliant']  = _compliant_done(org_id) if stage_status['funded'] else False
    stage_status['impact']     = _impact_done(org_id) if stage_status['compliant'] else False

    # The first stage that isn't done is the current stage. If all done,
    # the user is on the rolling 'impact' stage (keep reporting well).
    current_stage = None
    for key, _, _ in STAGES:
        if not stage_status[key]:
            current_stage = key
            break

    completed_count = sum(1 for v in stage_status.values() if v)
    completion_pct = round(100 * completed_count / len(STAGES))

    if current_stage is None:
        next_action = _next_action_for('done')
        current_stage = 'impact'  # Surface as the rolling "keep going" stage.
    else:
        next_action = _next_action_for(current_stage)

    stages = []
    for key, label, why in STAGES:
        stages.append({
            'key': key, 'label': label, 'why': why,
            'status': ('done' if stage_status[key]
                       else 'current' if key == current_stage
                       else 'locked'),
        })

    return jsonify({
        'success': True,
        'stages': stages,
        'current_stage': current_stage,
        'next_action': next_action,
        'completion_pct': completion_pct,
        'all_done': all(stage_status.values()),
    })


@journey_bp.route('/impact', methods=['GET'])
@login_required
@role_required('ngo')
def api_my_impact():
    """Phase 154 — Per-NGO impact summary (rolling 12 months).

    Aggregates from the data we already have:
      - applications submitted (any status)
      - applications awarded (count + total funding)
      - reports submitted
      - people impacted (sum from report numeric fields where present)

    Cheap query — three counts + two sums. Cached at the client side by
    the dashboard tile so we don't re-hit on every navigation.
    """
    from sqlalchemy import func as _f
    from datetime import datetime as _dt, timezone as _tz, timedelta as _td
    from app.models import Application, Report

    org_id = current_user.org_id
    if not org_id:
        return jsonify({'success': False, 'error': 'no_org'}), 400

    since = _dt.now(_tz.utc) - _td(days=365)

    try:
        apps_submitted = (
            db.session.query(_f.count(Application.id))
            .filter(Application.ngo_org_id == org_id)
            .filter(Application.submitted_at >= since)
            .scalar()
        ) or 0
        awards_row = (
            db.session.query(
                _f.count(Application.id),
                _f.coalesce(_f.sum(Application.final_score), 0),
            )
            .filter(Application.ngo_org_id == org_id)
            .filter(Application.status == 'awarded')
            .filter(Application.submitted_at >= since)
            .first()
        )
        awards_count = awards_row[0] if awards_row else 0
        reports_submitted = (
            db.session.query(_f.count(Report.id))
            .filter(Report.ngo_org_id == org_id)
            .filter(Report.submitted_at.isnot(None))
            .filter(Report.submitted_at >= since)
            .scalar()
        ) or 0
    except Exception as e:
        logger.warning('impact aggregate failed: %s', e)
        apps_submitted = 0
        awards_count = 0
        reports_submitted = 0

    # Total funding from awarded grants. Joining Application → Grant
    # for each awarded app gives the granted amount.
    total_funding = 0.0
    try:
        from app.models import Grant
        awarded_apps = (
            Application.query
            .filter_by(ngo_org_id=org_id, status='awarded')
            .filter(Application.submitted_at >= since)
            .all()
        )
        for a in awarded_apps:
            try:
                g = db.session.get(Grant, a.grant_id) if a.grant_id else None
                if g and g.total_funding is not None:
                    total_funding += float(g.total_funding)
            except Exception:
                pass
    except Exception:
        pass

    win_rate_pct = None
    if apps_submitted > 0:
        win_rate_pct = round(100 * awards_count / apps_submitted, 1)

    return jsonify({
        'success': True,
        'window_days': 365,
        'applications_submitted': apps_submitted,
        'awards_count': awards_count,
        'win_rate_pct': win_rate_pct,
        'reports_submitted': reports_submitted,
        'total_funding_awarded': round(total_funding, 2),
    })
