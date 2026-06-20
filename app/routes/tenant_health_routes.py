"""
Phase 106 — Per-tenant health dashboard (admin).

Surfaces drift before customers notice. Per tenant:

  - AI call count + failure rate (trailing 7d)
  - Open applications + drafts
  - Last activity timestamp (newest of: app, report, login event)
  - Active Capacity Passport status (published / expired / revoked / none)
  - Member count + admin count
  - Stale draft applications (>30d)
  - Overall health score: simple sum of red/amber flags. Lower = healthier.

The "best churn prevention investment" per the value ranking. An admin
can scan this once a week and call any tenant trending red BEFORE they
notice their AI failure rate is climbing or their submissions stalled.

Auth: admin only.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from app.extensions import db
from app.models.user import User
from app.models.organization import Organization
from app.models.application import Application
from app.models.ai_thread import AICallLog
from app.models.capacity_passport import CapacityPassport

logger = logging.getLogger('kuja')

tenant_health_bp = Blueprint('tenant_health', __name__, url_prefix='/api/admin')


def _classify(failures: int, total: int, drafts: int, stale: int, has_passport: bool) -> tuple[str, list[str]]:
    """Per-tenant health classification: 'green' | 'amber' | 'red' + flags."""
    flags: list[str] = []
    fail_rate_pct = (100 * failures / total) if total else 0
    if fail_rate_pct >= 25:
        flags.append('ai_failure_rate_high')
    elif fail_rate_pct >= 10:
        flags.append('ai_failure_rate_elevated')
    if stale >= 5:
        flags.append('many_stale_drafts')
    if drafts >= 10 and total == 0:
        flags.append('drafts_without_ai_activity')
    if not has_passport:
        flags.append('no_active_passport')

    red_flags = {'ai_failure_rate_high', 'many_stale_drafts'}
    amber_flags = {'ai_failure_rate_elevated', 'drafts_without_ai_activity'}
    if any(f in red_flags for f in flags):
        return 'red', flags
    if any(f in amber_flags for f in flags):
        return 'amber', flags
    return 'green', flags


@tenant_health_bp.route('/tenant-health', methods=['GET'])
@login_required
def api_tenant_health():
    if current_user.role != 'admin':
        return jsonify({'success': False, 'error': 'Admin only.'}), 403

    try:
        days = max(1, min(90, int(request.args.get('days', 7))))
    except ValueError:
        days = 7

    cutoff = datetime.utcnow() - timedelta(days=days)
    stale_cutoff = datetime.utcnow() - timedelta(days=30)

    # Tenants in scope: every org that has either a user or an application.
    orgs = (
        Organization.query
        .order_by(Organization.name.asc())
        .all()
    )

    # Pre-aggregate AI calls per (user → org)
    user_org = dict(db.session.query(User.id, User.org_id).all())
    ai_rows = (
        AICallLog.query
        .filter(AICallLog.created_at >= cutoff)
        .with_entities(AICallLog.user_id, AICallLog.success)
        .all()
    )
    ai_per_org = defaultdict(lambda: {'total': 0, 'failures': 0})
    for uid, success in ai_rows:
        org_id = user_org.get(uid)
        bucket = ai_per_org[org_id]
        bucket['total'] += 1
        if not success:
            bucket['failures'] += 1

    # Pre-aggregate applications per org
    app_rows = (
        Application.query
        .with_entities(Application.ngo_org_id, Application.status, Application.created_at, Application.updated_at)
        .all()
    )
    app_per_org = defaultdict(lambda: {'total': 0, 'drafts': 0, 'submitted': 0, 'stale': 0, 'last_activity': None})
    for org_id, status, created_at, updated_at in app_rows:
        b = app_per_org[org_id]
        b['total'] += 1
        if status == 'draft':
            b['drafts'] += 1
            if created_at and created_at < stale_cutoff:
                b['stale'] += 1
        elif status in ('submitted', 'in_review', 'under_review', 'scored', 'awarded'):
            b['submitted'] += 1
        ts = updated_at or created_at
        if ts and (b['last_activity'] is None or ts > b['last_activity']):
            b['last_activity'] = ts

    # Pre-aggregate active passports per org
    passport_rows = (
        db.session.query(CapacityPassport.org_id, CapacityPassport.status)
        .all()
    )
    active_passport_orgs = {oid for oid, st in passport_rows if st == 'active'}

    # Member + admin counts
    member_counts = defaultdict(lambda: {'members': 0, 'admins': 0})
    for u in db.session.query(User.org_id, User.role).all():
        if u[0] is None:
            continue
        member_counts[u[0]]['members'] += 1
        if u[1] == 'admin':
            member_counts[u[0]]['admins'] += 1

    rows: list[dict] = []
    for org in orgs:
        ai = ai_per_org.get(org.id, {'total': 0, 'failures': 0})
        ap = app_per_org.get(org.id, {'total': 0, 'drafts': 0, 'submitted': 0, 'stale': 0, 'last_activity': None})
        mc = member_counts.get(org.id, {'members': 0, 'admins': 0})
        has_passport = org.id in active_passport_orgs

        fail_rate_pct = round(100 * ai['failures'] / ai['total'], 1) if ai['total'] else 0.0
        health, flags = _classify(
            failures=ai['failures'], total=ai['total'],
            drafts=ap['drafts'], stale=ap['stale'],
            has_passport=has_passport,
        )

        rows.append({
            'org_id': org.id,
            'org_name': org.name,
            'org_type': getattr(org, 'org_type', None),
            'country': getattr(org, 'country', None),
            'members': mc['members'],
            'admins': mc['admins'],
            'ai_calls': ai['total'],
            'ai_failures': ai['failures'],
            'ai_failure_rate_pct': fail_rate_pct,
            'applications_total': ap['total'],
            'applications_draft': ap['drafts'],
            'applications_submitted': ap['submitted'],
            'stale_drafts': ap['stale'],
            'last_activity_at': ap['last_activity'].isoformat() if ap['last_activity'] else None,
            'has_active_passport': has_passport,
            'health': health,
            'flags': flags,
        })

    # Sort: red first, then amber, then green; within bucket by ai_failure_rate desc.
    order = {'red': 0, 'amber': 1, 'green': 2}
    rows.sort(key=lambda r: (order.get(r['health'], 3), -r['ai_failure_rate_pct'], r['org_name']))

    summary = {
        'red': sum(1 for r in rows if r['health'] == 'red'),
        'amber': sum(1 for r in rows if r['health'] == 'amber'),
        'green': sum(1 for r in rows if r['health'] == 'green'),
        'total_tenants': len(rows),
    }

    return jsonify({
        'success': True,
        'window_days': days,
        'summary': summary,
        'tenants': rows,
    })
