"""
Phase 99 — Database integrity invariants.

Asserts that critical relationships in the DB hold. Drift can come from
bugs, partial migrations, or admin tooling errors that bypass the
service layer; without explicit checks, the drift compounds silently
until a user notices a wrong number.

Each invariant is a function returning a list of violation dicts. The
top-level endpoint runs every invariant and aggregates the result. The
admin dashboard can render the count; CI / cron can poll and alert.

Auth: admin only.

Invariants today:

  1. orphan_applications        — `Application.grant_id` points at a
                                   missing Grant row.
  2. orphan_reports             — `Report.grant_id` points at a missing
                                   Grant; or `Report.application_id`
                                   points at a missing Application
                                   (when set).
  3. unsubmitted_with_submitted_at — Application with `submitted_at`
                                   set but status != 'submitted' (and
                                   not awarded/rejected — which imply
                                   prior submission).
  4. negative_funding           — Grant with `total_funding < 0`.
  5. user_without_org           — Non-admin user with `org_id IS NULL`.

Add more by appending to INVARIANTS.
"""

import logging
from flask import Blueprint, jsonify
from flask_login import login_required, current_user

from app.extensions import db
from app.models.user import User
from app.models.application import Application
from app.models.grant import Grant
from app.models.report import Report

logger = logging.getLogger('kuja')

integrity_bp = Blueprint('integrity', __name__, url_prefix='/api/admin')


def _orphan_applications():
    """Applications pointing at a missing Grant."""
    sql = db.text("""
        SELECT a.id, a.grant_id
          FROM applications a
     LEFT JOIN grants g ON g.id = a.grant_id
         WHERE g.id IS NULL
    """)
    rows = db.session.execute(sql).fetchall()
    return [
        {'kind': 'orphan_application', 'application_id': r[0], 'grant_id': r[1]}
        for r in rows
    ]


def _orphan_reports():
    """Reports pointing at a missing Grant, or a missing Application
    when application_id is set."""
    sql = db.text("""
        SELECT r.id, r.grant_id, r.application_id
          FROM reports r
     LEFT JOIN grants g ON g.id = r.grant_id
         WHERE g.id IS NULL
    """)
    rows = db.session.execute(sql).fetchall()
    out = [
        {'kind': 'orphan_report_grant', 'report_id': r[0],
         'grant_id': r[1], 'application_id': r[2]}
        for r in rows
    ]
    # Application-side orphan
    sql2 = db.text("""
        SELECT r.id, r.application_id
          FROM reports r
     LEFT JOIN applications a ON a.id = r.application_id
         WHERE r.application_id IS NOT NULL AND a.id IS NULL
    """)
    rows2 = db.session.execute(sql2).fetchall()
    out.extend([
        {'kind': 'orphan_report_application', 'report_id': r[0],
         'application_id': r[1]}
        for r in rows2
    ])
    return out


def _unsubmitted_with_submitted_at():
    """Submitted_at set but status is still draft / unsubmitted-like."""
    sql = db.text("""
        SELECT id, status, submitted_at
          FROM applications
         WHERE submitted_at IS NOT NULL
           AND status NOT IN ('submitted','approved','rejected','awarded',
                              'in_review','under_review','scored')
    """)
    rows = db.session.execute(sql).fetchall()
    return [
        {'kind': 'unsubmitted_with_submitted_at',
         'application_id': r[0], 'status': r[1],
         'submitted_at': r[2].isoformat() if hasattr(r[2], 'isoformat') else str(r[2])}
        for r in rows
    ]


def _negative_funding():
    """Grants with negative total_funding values."""
    sql = db.text("""
        SELECT id, title, total_funding
          FROM grants
         WHERE total_funding IS NOT NULL AND total_funding < 0
    """)
    rows = db.session.execute(sql).fetchall()
    return [
        {'kind': 'negative_funding', 'grant_id': r[0], 'title': r[1],
         'total_funding': float(r[2]) if r[2] is not None else None}
        for r in rows
    ]


def _user_without_org():
    """Non-admin user with no org. Admin can legitimately have org_id NULL."""
    sql = db.text("""
        SELECT id, email, role
          FROM users
         WHERE org_id IS NULL
           AND role != 'admin'
    """)
    rows = db.session.execute(sql).fetchall()
    return [
        {'kind': 'user_without_org', 'user_id': r[0],
         'email': r[1], 'role': r[2]}
        for r in rows
    ]


INVARIANTS = [
    ('orphan_applications', _orphan_applications),
    ('orphan_reports', _orphan_reports),
    ('unsubmitted_with_submitted_at', _unsubmitted_with_submitted_at),
    ('negative_funding', _negative_funding),
    ('user_without_org', _user_without_org),
]


@integrity_bp.route('/integrity', methods=['GET'])
@login_required
def api_integrity():
    """Run every invariant and return the aggregated violation report.

    Returns: {
      success, checks: [
        { name, ok: bool, violation_count, violations: [...], error? }
      ],
      total_violations,
      any_failed,
    }
    """
    if current_user.role != 'admin':
        return jsonify({'success': False, 'error': 'Admin only.'}), 403

    results = []
    total = 0
    for name, fn in INVARIANTS:
        try:
            violations = fn()
        except Exception as e:
            logger.exception('integrity check %s failed', name)
            results.append({
                'name': name,
                'ok': False,
                'violation_count': 0,
                'violations': [],
                'error': str(e)[:200],
            })
            continue
        results.append({
            'name': name,
            'ok': len(violations) == 0,
            'violation_count': len(violations),
            'violations': violations[:50],  # cap per check
        })
        total += len(violations)

    # Phase 109 — also surface the DB-level CHECK constraints that
    # *prevent* the same drift at insert time. Lets the admin see at a
    # glance which invariants are "guaranteed" vs "audited."
    db_constraints = []
    try:
        if db.engine.dialect.name == 'postgresql':
            rows = db.session.execute(db.text(
                "SELECT tc.table_name, tc.constraint_name, cc.check_clause "
                "FROM information_schema.table_constraints tc "
                "JOIN information_schema.check_constraints cc "
                "  ON tc.constraint_name = cc.constraint_name "
                "WHERE tc.constraint_type = 'CHECK' "
                "  AND tc.constraint_name LIKE 'ck_%' "
                "ORDER BY tc.table_name, tc.constraint_name"
            )).fetchall()
            db_constraints = [
                {'table': r[0], 'name': r[1], 'clause': str(r[2])[:240]}
                for r in rows
            ]
        else:
            db_constraints = [{
                'table': '(skipped)',
                'name': 'sqlite-dialect',
                'clause': 'CHECK enforcement is Postgres-only in this app.',
            }]
    except Exception as e:
        logger.warning('integrity CHECK reflection failed: %s', e)

    return jsonify({
        'success': True,
        'checks': results,
        'db_constraints': db_constraints,
        'total_violations': total,
        'any_failed': any(not r.get('ok') for r in results),
    })
