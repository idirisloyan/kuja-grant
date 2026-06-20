"""
Phase 99 — "What's new since you last visited" digest.

Compresses re-orientation cost for weekly users by surfacing a single
banner on login: "3 reports awaiting review, 1 application reached
under-review, $40K in grants closed." Frontend tracks the last-visit
ISO timestamp in localStorage and sends it as ?since=…; this endpoint
returns the bucketed counts.

Auth: any authenticated user. Per-role views (NGO sees their own
applications, donor sees their grants, etc.) — the role check happens
inside each bucket so a single endpoint serves all roles.

Design:
  - Read-only, fast (single window).
  - No new tables — reads from existing Application / Report / Grant /
    Notification rows.
  - Falls back to a 7-day window when `since` is missing or malformed.
"""

from datetime import datetime, timezone, timedelta

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from app.extensions import db
from app.models.application import Application
from app.models.report import Report
from app.models.grant import Grant
from app.models.notification import Notification

whats_new_bp = Blueprint('whats_new', __name__, url_prefix='/api')


def _parse_since(raw):
    """Accept an ISO timestamp; default to 7 days ago. Clamp to 30 days
    so a brand-new user doesn't get an unbounded query."""
    now = datetime.now(timezone.utc)
    floor = now - timedelta(days=30)
    if not raw:
        return now - timedelta(days=7)
    try:
        # Accept both 'Z' suffix and '+00:00'.
        ts = datetime.fromisoformat(raw.replace('Z', '+00:00'))
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return max(ts, floor)
    except Exception:
        return now - timedelta(days=7)


def _ngo_summary(since, org_id):
    """For NGO users: counts of relevant activity on THEIR applications +
    reports + matching grants."""
    if org_id is None:
        return {'items': [], 'total': 0}
    items = []

    # Applications status-changed in window. We approximate with
    # updated-at since there isn't a dedicated transition log on the row.
    try:
        changed = (
            Application.query
            .filter(Application.ngo_org_id == org_id)
            .filter(Application.updated_at >= since.replace(tzinfo=None))
            .all()
        )
    except Exception:
        changed = []
    decisioned = [a for a in changed if a.status in ('approved', 'rejected', 'in_review')]
    if decisioned:
        items.append({
            'kind': 'application_decisions',
            'count': len(decisioned),
            'label': f"{len(decisioned)} application decision{'s' if len(decisioned) != 1 else ''}",
            'href': '/applications',
        })

    # Reports the NGO is responsible for that the donor has reviewed.
    try:
        reports = (
            Report.query
            .join(Application, Report.application_id == Application.id)
            .filter(Application.ngo_org_id == org_id)
            .filter(Report.updated_at >= since.replace(tzinfo=None))
            .filter(Report.status.in_(('scored', 'reviewed')))
            .all()
        )
    except Exception:
        reports = []
    if reports:
        items.append({
            'kind': 'report_decisions',
            'count': len(reports),
            'label': f"{len(reports)} report{'s' if len(reports) != 1 else ''} reviewed",
            'href': '/reports',
        })

    # New open grants that match (any open grant is a candidate; the
    # personal "match" rail filters further on the frontend).
    try:
        new_grants = (
            Grant.query
            .filter(Grant.created_at >= since.replace(tzinfo=None))
            .filter(Grant.status == 'open')
            .count()
        )
    except Exception:
        new_grants = 0
    if new_grants:
        items.append({
            'kind': 'new_open_grants',
            'count': new_grants,
            'label': f"{new_grants} new open grant{'s' if new_grants != 1 else ''}",
            'href': '/grants',
        })

    return {'items': items, 'total': sum(i['count'] for i in items)}


def _donor_summary(since, org_id):
    if org_id is None:
        return {'items': [], 'total': 0}
    items = []
    try:
        new_submissions = (
            Application.query
            .join(Grant, Application.grant_id == Grant.id)
            .filter(Grant.donor_org_id == org_id)
            .filter(Application.status == 'submitted')
            .filter(Application.submitted_at.isnot(None))
            .filter(Application.submitted_at >= since.replace(tzinfo=None))
            .count()
        )
    except Exception:
        new_submissions = 0
    if new_submissions:
        items.append({
            'kind': 'new_submissions',
            'count': new_submissions,
            'label': f"{new_submissions} new application{'s' if new_submissions != 1 else ''} submitted",
            'href': '/reviews',
        })
    try:
        new_reports = (
            Report.query
            .join(Application, Report.application_id == Application.id)
            .join(Grant, Application.grant_id == Grant.id)
            .filter(Grant.donor_org_id == org_id)
            .filter(Report.status == 'submitted')
            .filter(Report.submitted_at.isnot(None))
            .filter(Report.submitted_at >= since.replace(tzinfo=None))
            .count()
        )
    except Exception:
        new_reports = 0
    if new_reports:
        items.append({
            'kind': 'new_reports_submitted',
            'count': new_reports,
            'label': f"{new_reports} report{'s' if new_reports != 1 else ''} submitted",
            'href': '/reports',
        })
    return {'items': items, 'total': sum(i['count'] for i in items)}


def _reviewer_summary(since, user_id):
    try:
        unread_notifs = (
            Notification.query
            .filter(Notification.user_id == user_id)
            .filter(Notification.created_at >= since.replace(tzinfo=None))
            .count()
        )
    except Exception:
        unread_notifs = 0
    if unread_notifs:
        return {'items': [{
            'kind': 'new_notifications',
            'count': unread_notifs,
            'label': f"{unread_notifs} new notification{'s' if unread_notifs != 1 else ''}",
            'href': '/dashboard',
        }], 'total': unread_notifs}
    return {'items': [], 'total': 0}


@whats_new_bp.route('/whats-new', methods=['GET'])
@login_required
def api_whats_new():
    """Return a digest of relevant changes since the caller's last visit.

    Query:
      since = ISO timestamp; defaults to 7d ago, clamped to 30d.

    Returns:
      { success, since, role, total, items: [
          { kind, count, label, href }
        ]
      }
    """
    since = _parse_since(request.args.get('since'))
    role = current_user.role
    org_id = getattr(current_user, 'org_id', None)
    if role == 'ngo':
        summary = _ngo_summary(since, org_id)
    elif role == 'donor':
        summary = _donor_summary(since, org_id)
    elif role == 'reviewer':
        summary = _reviewer_summary(since, current_user.id)
    elif role == 'admin':
        # Admins get a roll-up of platform activity (light touch).
        try:
            new_apps = (
                Application.query
                .filter(Application.submitted_at.isnot(None))
                .filter(Application.submitted_at >= since.replace(tzinfo=None))
                .count()
            )
        except Exception:
            new_apps = 0
        summary = {
            'items': [{
                'kind': 'platform_submissions',
                'count': new_apps,
                'label': f"{new_apps} application{'s' if new_apps != 1 else ''} submitted platform-wide",
                'href': '/admin/metrics',
            }] if new_apps else [],
            'total': new_apps,
        }
    else:
        summary = {'items': [], 'total': 0}

    return jsonify({
        'success': True,
        'since': since.isoformat(),
        'role': role,
        'total': summary['total'],
        'items': summary['items'],
    })
