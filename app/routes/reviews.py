"""
Kuja Grant Management System - Review Routes
==============================================
Extracted from server.py section 18 (lines ~4412-4642).
Handles review assignment, scoring, and completion.

Blueprint prefix: /api/reviews
Routes served:
  /api/reviews                       GET   - list reviews (role-filtered)
  /api/reviews/<review_id>           GET   - get review detail
  /api/reviews                       POST  - create/assign review (donor/admin)
  /api/reviews/<review_id>           PUT   - update review scores/comments
  /api/reviews/<review_id>/complete  POST  - complete review, recalc scores
"""

import logging
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from app.extensions import db
from app.models import Application, Grant, Review, User
from app.utils.decorators import role_required
from app.utils.helpers import get_request_json, paginate_query

logger = logging.getLogger('kuja')

reviews_bp = Blueprint('reviews', __name__, url_prefix='/api/reviews')


@reviews_bp.route('/', methods=['GET'])
@login_required
def api_list_reviews():
    """List reviews based on user role + current network.

    Phase 99 follow-up — the verdict's second retest found that a
    reviewer signed in on the NEAR tenant could open /reviews/ and
    see 20 Kuja Marketplace assignments because the role filter
    didn't include network scope. Helper added at the query layer so
    every consumer is tenant-bounded.
    """
    from app.utils.network import scope_review_query
    # Eager-load relationships to avoid N+1 in to_dict()
    query = Review.query.options(
        db.joinedload(Review.application).joinedload(Application.grant),
        db.joinedload(Review.application).joinedload(Application.ngo_org),
        db.joinedload(Review.reviewer),
    )

    if current_user.role == 'reviewer':
        # Reviewer sees only their assigned reviews
        query = query.filter_by(reviewer_user_id=current_user.id)
    elif current_user.role == 'donor':
        # Donor sees all reviews for their grants
        query = query.join(Application).join(Grant).filter(
            Grant.donor_org_id == current_user.org_id
        )
    elif current_user.role != 'admin':
        # NGOs can see reviews for their applications (read only)
        query = query.join(Application).filter(
            Application.ngo_org_id == current_user.org_id
        )

    # Tenant scope: applied after the role/joins so the helper's
    # in-list filter doesn't collide with the explicit joins above.
    query = scope_review_query(query)

    status = request.args.get('status')
    if status:
        query = query.filter(Review.status == status)

    application_id = request.args.get('application_id', type=int)
    if application_id:
        query = query.filter(Review.application_id == application_id)

    query = query.order_by(Review.created_at.desc())
    pagination = paginate_query(query)

    return jsonify({
        'reviews': [r.to_dict() for r in pagination.items],
        'total': pagination.total,
        'page': pagination.page,
        'pages': pagination.pages,
    })


@reviews_bp.route('/<int:review_id>', methods=['GET'])
@login_required
def api_get_review(review_id):
    """Get full review detail."""
    review = db.session.get(Review, review_id)
    if not review:
        return jsonify({'error': 'Review not found'}), 404

    # Access control
    if current_user.role == 'reviewer' and review.reviewer_user_id != current_user.id:
        return jsonify({'error': 'Access denied'}), 403
    if current_user.role == 'donor':
        application = db.session.get(Application, review.application_id)
        if application:
            grant = db.session.get(Grant, application.grant_id)
            if not grant or grant.donor_org_id != current_user.org_id:
                return jsonify({'error': 'Access denied'}), 403

    data = review.to_dict()

    # Include application and grant context
    application = db.session.get(Application, review.application_id)
    if application:
        data['application'] = application.to_dict(summary=True)
        if application.grant:
            data['grant'] = application.grant.to_dict(summary=True)
            data['grant_criteria'] = application.grant.get_criteria()

    # Phase 30C — reviewer opens an assignment. Only emit for reviewers
    # (not donors/admins inspecting) so the metric reflects actual work.
    if current_user.role == 'reviewer':
        try:
            from app.services.user_event_service import UserEventService
            UserEventService.record(
                user=current_user, event_name='reviewer.assignment_opened',
                review_id=review.id, application_id=review.application_id,
                status=review.status,
            )
        except Exception:
            pass

    return jsonify({'review': data})


@reviews_bp.route('/', methods=['POST'])
@role_required('donor', 'admin')
def api_create_review():
    """Create/assign a new review."""
    data = get_request_json()
    application_id = data.get('application_id')
    reviewer_user_id = data.get('reviewer_user_id')

    if not application_id or not reviewer_user_id:
        return jsonify({
            'error': 'application_id and reviewer_user_id are required',
            'success': False,
        }), 400

    application = db.session.get(Application, application_id)
    if not application:
        return jsonify({'error': 'Application not found', 'success': False}), 404

    reviewer = db.session.get(User, reviewer_user_id)
    if not reviewer or reviewer.role != 'reviewer':
        return jsonify({'error': 'Reviewer not found or user is not a reviewer', 'success': False}), 404

    # Check for existing review by this reviewer for this application
    existing = Review.query.filter_by(
        application_id=application_id, reviewer_user_id=reviewer_user_id
    ).first()
    if existing:
        return jsonify({
            'error': 'This reviewer already has a review for this application',
            'existing_review_id': existing.id,
            'success': False,
        }), 409

    review = Review(
        application_id=application_id,
        reviewer_user_id=reviewer_user_id,
        status='assigned',
    )

    # Update application status
    if application.status == 'submitted':
        application.status = 'under_review'

    db.session.add(review)
    db.session.commit()

    logger.info(f"Review assigned: app={application_id}, reviewer={reviewer_user_id}, review_id={review.id}")

    # Phase 169 — notify the applicant NGO that their application is
    # now actively being reviewed (without naming the reviewer, since
    # the panel composition is private until decision).
    # Phase 182 — fan out to every user in the applicant org since
    # Notification is per-user (user_id NOT NULL).
    try:
        from app.models import Notification, User
        ngo_users = User.query.filter_by(
            org_id=application.ngo_org_id, role='ngo',
        ).all()
        for u in ngo_users:
            n = Notification(
                user_id=u.id,
                type='application_under_review',
                title='Your application is being reviewed',
                message='A reviewer has been assigned. We\'ll notify you when a decision is made.',
                link=f'/applications/{application.id}',
            )
            db.session.add(n)
        if ngo_users:
            db.session.commit()
    except Exception as e:
        logger.debug('under-review notification skipped: %s', e)

    return jsonify({'success': True, 'review': review.to_dict()}), 201


@reviews_bp.route('/my-caseload', methods=['GET'])
@login_required
@role_required('reviewer')
def api_reviewer_my_caseload():
    """Phase 295 — Live caseload header for the reviewer queue page.

    Returns open (in-flight) reviews + reviews completed in the current
    calendar month. Cheap query — used as a persistent header strap.
    """
    from datetime import datetime as _dt, timezone as _tz
    now = _dt.now(_tz.utc)
    month_start = _dt(now.year, now.month, 1, tzinfo=_tz.utc)
    open_count = Review.query.filter(
        Review.reviewer_user_id == current_user.id,
        Review.status.notin_(['completed']),
    ).count()
    completed_this_month = Review.query.filter(
        Review.reviewer_user_id == current_user.id,
        Review.status == 'completed',
        Review.completed_at >= month_start,
    ).count()
    return jsonify({
        'open_count': open_count,
        'completed_this_month': completed_this_month,
    })


@reviews_bp.route('/my-stats', methods=['GET'])
@login_required
@role_required('reviewer')
def api_reviewer_my_stats():
    """Phase 236 — Reviewer completion rate over last 90 days."""
    from datetime import datetime as _dt, timezone as _tz, timedelta as _td
    cutoff = _dt.now(_tz.utc) - _td(days=90)
    qs = Review.query.filter(
        Review.reviewer_user_id == current_user.id,
        Review.created_at >= cutoff,
    )
    total = qs.count()
    completed = qs.filter(
        Review.status.in_(['submitted', 'scored', 'completed']),
    ).count()
    rate = round(100 * completed / total, 1) if total > 0 else None
    return jsonify({
        'success': True,
        'window_days': 90,
        'total_assigned': total,
        'completed': completed,
        'completion_pct': rate,
    })


@reviews_bp.route('/workload', methods=['GET'])
@login_required
@role_required('donor', 'admin')
def api_reviewer_workload():
    """Phase 146 — Per-reviewer load summary.

    Admin / donor sees each reviewer's current pipeline so they don't
    pile more work on someone already over-extended. Counts:
      - assigned: in 'assigned' status, not yet started
      - in_progress: status in scoring/reviewing states
      - overdue: assigned > 14 days ago, not yet completed
      - completed: status in finished states
      - total: sum of the above (lifetime; cap at 90 days for sane bars)
    """
    from sqlalchemy import func as _f
    cutoff_overdue_days = 14

    reviewers = User.query.filter_by(role='reviewer').all()
    rows = []
    for r in reviewers:
        qs = Review.query.filter_by(reviewer_user_id=r.id)
        assigned_q = qs.filter(Review.status == 'assigned')
        completed_q = qs.filter(Review.status.in_(['submitted', 'scored', 'completed']))
        in_progress_q = qs.filter(Review.status.in_(['in_progress', 'reviewing']))
        # Overdue = still 'assigned' and assigned > 14 days ago.
        from datetime import datetime as _dt, timezone as _tz, timedelta as _td
        cutoff = _dt.now(_tz.utc) - _td(days=cutoff_overdue_days)
        overdue_q = assigned_q.filter(Review.created_at < cutoff)
        rows.append({
            'reviewer_user_id': r.id,
            'name': r.name,
            'email': r.email,
            'assigned': assigned_q.count(),
            'in_progress': in_progress_q.count(),
            'overdue': overdue_q.count(),
            'completed': completed_q.count(),
            'total': qs.count(),
        })

    # Sort: highest active load first (assigned + in_progress).
    rows.sort(key=lambda x: (x['assigned'] + x['in_progress']), reverse=True)

    return jsonify({
        'success': True,
        'reviewers': rows,
        'overdue_threshold_days': cutoff_overdue_days,
        'summary': {
            'reviewers': len(rows),
            'total_assigned': sum(r['assigned'] for r in rows),
            'total_in_progress': sum(r['in_progress'] for r in rows),
            'total_overdue': sum(r['overdue'] for r in rows),
        },
    })


@reviews_bp.route('/bulk-assign', methods=['POST'])
@role_required('donor', 'admin')
def api_bulk_assign_reviews():
    """Phase 136 — Assign one reviewer to many applications at once.

    Body:
      {
        "reviewer_user_id": 5,
        "application_ids": [1, 2, 3]   # cap 100 per call
      }

    Per-row idempotent: if a review already exists for
    (application_id, reviewer_user_id), it's marked as already_assigned
    in the result and the row is not duplicated. Returns per-row results
    so the caller can render partial successes.
    """
    data = get_request_json() or {}
    reviewer_user_id = data.get('reviewer_user_id')
    raw_ids = data.get('application_ids') or []

    if not reviewer_user_id or not isinstance(raw_ids, list) or not raw_ids:
        return jsonify({
            'success': False,
            'error': 'reviewer_user_id and application_ids (non-empty list) required',
        }), 400
    if len(raw_ids) > 100:
        return jsonify({
            'success': False,
            'error': 'Bulk-assign capped at 100 applications per call',
        }), 400

    reviewer = db.session.get(User, reviewer_user_id)
    if not reviewer or reviewer.role != 'reviewer':
        return jsonify({
            'success': False,
            'error': 'Reviewer not found or user is not a reviewer',
        }), 404

    results = []
    created = 0
    already = 0
    failed = 0

    for aid_raw in raw_ids:
        try:
            aid = int(aid_raw)
        except (TypeError, ValueError):
            results.append({'application_id': aid_raw, 'ok': False, 'error': 'invalid_id'})
            failed += 1
            continue
        application = db.session.get(Application, aid)
        if not application:
            results.append({'application_id': aid, 'ok': False, 'error': 'not_found'})
            failed += 1
            continue
        existing = Review.query.filter_by(
            application_id=aid, reviewer_user_id=reviewer_user_id,
        ).first()
        if existing:
            results.append({
                'application_id': aid, 'ok': True,
                'already_assigned': True, 'review_id': existing.id,
            })
            already += 1
            continue
        try:
            review = Review(
                application_id=aid,
                reviewer_user_id=reviewer_user_id,
                status='assigned',
            )
            if application.status == 'submitted':
                application.status = 'under_review'
            db.session.add(review)
            db.session.flush()
            results.append({
                'application_id': aid, 'ok': True,
                'already_assigned': False, 'review_id': review.id,
            })
            created += 1
        except Exception as e:
            results.append({'application_id': aid, 'ok': False, 'error': str(e)[:120]})
            failed += 1

    db.session.commit()
    logger.info(
        "bulk-assign: reviewer=%s created=%s already=%s failed=%s",
        reviewer_user_id, created, already, failed,
    )
    return jsonify({
        'success': True,
        'reviewer_user_id': reviewer_user_id,
        'summary': {
            'requested': len(raw_ids),
            'created': created,
            'already_assigned': already,
            'failed': failed,
        },
        'results': results,
    })


@reviews_bp.route('/<int:review_id>/decline', methods=['POST'])
@login_required
@role_required('reviewer', 'admin')
def api_decline_review(review_id):
    """Phase 232 — Reviewer declines an assignment.

    Body: { reason?: str (max 500) }
    Sets the review's `private_notes` to "DECLINED: <reason>" so the
    admin can see context in the audit trail, then deletes the review
    row so the application loses the assignment. The same reviewer
    can no longer be auto-reassigned (a fresh POST would hit the
    existing-review duplicate check).
    """
    from app.services.audit import log_action
    review = db.session.get(Review, review_id)
    if not review:
        return jsonify({'error': 'Review not found'}), 404
    if current_user.role == 'reviewer' and review.reviewer_user_id != current_user.id:
        return jsonify({'error': 'Access denied'}), 403
    if review.status == 'completed':
        return jsonify({'error': 'Cannot decline a completed review'}), 400

    data = get_request_json() or {}
    reason = (data.get('reason') or '').strip()[:500]

    log_action('review.declined', current_user.email,
               'review', review.id,
               {'application_id': review.application_id, 'reason': reason})

    # Notify admins via in-app notification — surface in their queue.
    try:
        from app.models import Notification, User
        admins = User.query.filter_by(role='admin').all()
        msg = (
            f'{current_user.name or current_user.email} declined review #{review.id}'
            f' for application #{review.application_id}.'
            + (f' Reason: {reason}' if reason else '')
        )
        for u in admins:
            n = Notification(
                user_id=u.id,
                type='review_declined',
                title='Reviewer declined assignment',
                message=msg[:500],
                link='/admin/reviewers-workload',
            )
            db.session.add(n)
    except Exception as e:
        logger.debug('decline notify skipped: %s', e)

    application_id = review.application_id
    db.session.delete(review)

    # If no remaining reviews on the app, drop status back to 'submitted'.
    other = Review.query.filter_by(application_id=application_id).count()
    if other == 0:
        app_obj = db.session.get(Application, application_id)
        if app_obj and app_obj.status == 'under_review':
            app_obj.status = 'submitted'

    db.session.commit()
    return jsonify({'success': True})


@reviews_bp.route('/scoring-outliers', methods=['GET'])
@login_required
@role_required('admin')
def api_reviews_scoring_outliers():
    """Phase 298 — Reviewers whose mean human score is > 1.5σ from the
    platform mean across their last 5+ completed reviews.

    Surfaces potential calibration drift. Cheap calculation over the
    completed-review corpus — no AI involvement.
    """
    rows = (Review.query
            .filter(Review.status == 'completed',
                    Review.overall_score.isnot(None))
            .all())
    if len(rows) < 10:
        return jsonify({'outliers': [], 'sample_size': len(rows)})

    from collections import defaultdict
    import statistics
    scores = [r.overall_score for r in rows if r.overall_score is not None]
    platform_mean = statistics.mean(scores)
    try:
        platform_stdev = statistics.stdev(scores) if len(scores) > 1 else 0.0
    except statistics.StatisticsError:
        platform_stdev = 0.0

    by_reviewer: dict[int, list[float]] = defaultdict(list)
    for r in rows:
        if r.overall_score is not None:
            by_reviewer[r.reviewer_user_id].append(r.overall_score)

    outliers = []
    for reviewer_id, vals in by_reviewer.items():
        if len(vals) < 5:
            continue
        mean = statistics.mean(vals)
        if platform_stdev > 0 and abs(mean - platform_mean) > 1.5 * platform_stdev:
            outliers.append({
                'reviewer_user_id': reviewer_id,
                'mean_score': round(mean, 1),
                'n': len(vals),
                'delta_vs_platform': round(mean - platform_mean, 1),
            })

    if outliers:
        # Resolve reviewer names + emails.
        ids = [o['reviewer_user_id'] for o in outliers]
        name_by_id = {u.id: u.name for u in User.query.filter(User.id.in_(ids)).all()}
        email_by_id = {u.id: u.email for u in User.query.filter(User.id.in_(ids)).all()}
        for o in outliers:
            o['reviewer_name'] = name_by_id.get(o['reviewer_user_id'])
            o['reviewer_email'] = email_by_id.get(o['reviewer_user_id'])

    outliers.sort(key=lambda o: abs(o['delta_vs_platform']), reverse=True)
    return jsonify({
        'platform_mean': round(platform_mean, 1),
        'platform_stdev': round(platform_stdev, 1),
        'outliers': outliers[:5],
        'sample_size': len(rows),
    })


@reviews_bp.route('/coi-rollup', methods=['GET'])
@login_required
@role_required('admin')
def api_reviews_coi_rollup():
    """Phase 292 — Admin rollup of COI disclosures over the last 30 days.

    Reads from the hash-chained audit log (the disclosing reviewer's row
    is deleted in auto-recuse, so the log is the only durable record).
    Returns total count + the 3 most recent disclosures with reviewer
    name + email + kind + application id.
    """
    from datetime import datetime, timezone, timedelta
    import json as _json
    from app.models.audit_chain import AuditChainEntry
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    rows = (AuditChainEntry.query
            .filter(AuditChainEntry.action == 'review.coi_disclosed',
                    AuditChainEntry.created_at >= cutoff)
            .order_by(AuditChainEntry.created_at.desc())
            .all())
    total = len(rows)
    recent = []
    if rows:
        # Resolve names for actor emails (best-effort).
        emails = list({r.actor_email for r in rows[:3] if r.actor_email})
        name_by_email = {}
        if emails:
            for u in User.query.filter(User.email.in_(emails)).all():
                name_by_email[u.email] = u.name
        for r in rows[:3]:
            try:
                details = _json.loads(r.details_json or '{}')
            except Exception:
                details = {}
            recent.append({
                'created_at': r.created_at.isoformat() if r.created_at else None,
                'reviewer_email': r.actor_email,
                'reviewer_name': name_by_email.get(r.actor_email or '', r.actor_email),
                'kind': details.get('kind'),
                'application_id': details.get('application_id'),
            })
    return jsonify({
        'window_days': 30,
        'total': total,
        'recent': recent,
    })


@reviews_bp.route('/<int:review_id>/coi-flag', methods=['POST'])
@login_required
@role_required('reviewer', 'admin')
def api_review_coi_flag(review_id):
    """Phase 283 — Reviewer self-discloses a conflict of interest.

    Body: { kind: 'employer_overlap'|'prior_consulting'|'family'|'other',
            note?: str (max 1000) }

    The disclosure stays on the review (kept for audit), is recorded to
    the hash-chained audit log, and admins receive an in-app notification
    so they can reassign.
    """
    from app.services.audit import log_action
    from app.models.audit_chain import AuditChainEntry
    review = db.session.get(Review, review_id)
    if not review:
        return jsonify({'error': 'Review not found'}), 404
    if current_user.role == 'reviewer' and review.reviewer_user_id != current_user.id:
        return jsonify({'error': 'Access denied'}), 403

    data = get_request_json() or {}
    kind = (data.get('kind') or '').strip()[:60]
    note = (data.get('note') or '').strip()[:1000]
    allowed = {'employer_overlap', 'prior_consulting', 'family', 'other'}
    if kind not in allowed:
        return jsonify({'error': 'Invalid kind'}), 400

    review.coi_disclosed_at = datetime.now(timezone.utc)
    review.coi_kind = kind
    review.coi_note = note or None
    db.session.add(review)

    log_action('review.coi_disclosed', current_user.email,
               'review', review.id,
               {'application_id': review.application_id, 'kind': kind})
    AuditChainEntry.append(
        action='review.coi_disclosed',
        actor_email=current_user.email,
        subject_kind='review',
        subject_id=review.id,
        details={'application_id': review.application_id, 'kind': kind, 'note': note[:200]},
    )

    try:
        from app.models import Notification, User
        admins = User.query.filter_by(role='admin').all()
        msg = (
            f'{current_user.name or current_user.email} disclosed a {kind} conflict on review #{review.id}'
            f' for application #{review.application_id}.'
        )
        for u in admins:
            n = Notification(
                user_id=u.id,
                type='reviewer_coi',
                title='Reviewer disclosed conflict',
                message=msg[:500],
                link='/admin/reviewers-workload',
            )
            db.session.add(n)
    except Exception as e:
        logger.debug('coi notify skipped: %s', e)

    # Phase 289 — auto-recuse the disclosing reviewer. Keep the audit
    # trail (the disclosure is already recorded above + on the audit
    # chain) but remove the assignment so the COI'd reviewer can't
    # score. Mirror Phase 232 decline semantics: drop the row, recompute
    # application status if no other reviewers remain.
    snapshot = review.to_dict()
    application_id = review.application_id
    db.session.delete(review)
    other = Review.query.filter_by(application_id=application_id).count()
    if other == 0:
        app_obj = db.session.get(Application, application_id)
        if app_obj and app_obj.status == 'under_review':
            app_obj.status = 'submitted'

    db.session.commit()
    return jsonify({'success': True, 'recused': True, 'review': snapshot})


@reviews_bp.route('/<int:review_id>', methods=['PUT'])
@login_required
@role_required('reviewer', 'admin')
def api_update_review(review_id):
    """Update review scores and comments."""
    review = db.session.get(Review, review_id)
    if not review:
        return jsonify({'error': 'Review not found'}), 404

    # Only the assigned reviewer, donor, or admin can update
    if current_user.role == 'reviewer' and review.reviewer_user_id != current_user.id:
        return jsonify({'error': 'Access denied'}), 403

    if review.status == 'completed' and current_user.role not in ('admin',):
        return jsonify({'error': 'Cannot edit a completed review', 'success': False}), 400

    data = get_request_json()

    if 'scores' in data:
        review.set_scores(data['scores'])
    if 'comments' in data:
        comments = data['comments']
        if isinstance(comments, dict):
            for key, val in comments.items():
                if isinstance(val, str) and len(val) > 10000:
                    return jsonify({'error': f'Comment for {key} too long (max 10000 chars)', 'success': False}), 400
        review.set_comments(data['comments'])
    if 'overall_score' in data:
        review.overall_score = data['overall_score']
    # Phase 221 — private notes (reviewer/donor/admin visible, never NGO).
    if 'private_notes' in data:
        pn = data['private_notes']
        if pn is None:
            review.private_notes = None
        elif isinstance(pn, str):
            review.private_notes = pn[:8000]

    # Auto-calculate overall from criterion scores if not explicitly set
    if 'scores' in data and 'overall_score' not in data:
        scores = review.get_scores() or {}
        if scores:
            # Get criterion weights from grant
            application = db.session.get(Application, review.application_id)
            if application and application.grant:
                criteria = application.grant.get_criteria() or []
                weight_map = {str(c.get('id', '')): c.get('weight', 1) for c in criteria}
                total_weight = 0
                weighted_sum = 0
                for cid, score_val in scores.items():
                    if isinstance(score_val, (int, float)):
                        w = weight_map.get(cid, 1)
                        weighted_sum += score_val * w
                        total_weight += w
                if total_weight > 0:
                    review.overall_score = round(weighted_sum / total_weight, 2)

    if review.status == 'assigned':
        review.status = 'in_progress'

    db.session.commit()
    return jsonify({'success': True, 'review': review.to_dict()})


@reviews_bp.route('/<int:review_id>/complete', methods=['POST'])
@login_required
@role_required('reviewer', 'admin')
def api_complete_review(review_id):
    """Mark a review as complete and update application scores."""
    review = db.session.get(Review, review_id)
    if not review:
        return jsonify({'error': 'Review not found'}), 404

    if current_user.role == 'reviewer' and review.reviewer_user_id != current_user.id:
        return jsonify({'error': 'Access denied'}), 403

    if review.status == 'completed':
        return jsonify({'error': 'Review is already completed', 'success': False}), 400

    # Ensure scores have been provided
    scores = review.get_scores() or {}
    if not scores:
        return jsonify({
            'error': 'Cannot complete a review without scores',
            'success': False,
        }), 400

    review.status = 'completed'
    review.completed_at = datetime.now(timezone.utc)

    # Update application human_score as average of all completed reviews
    application = db.session.get(Application, review.application_id)
    if application:
        completed_reviews = Review.query.filter_by(
            application_id=application.id, status='completed'
        ).all()
        # Include this review (status just set to completed above, but not yet committed)
        review_scores = [r.overall_score for r in completed_reviews if r.overall_score is not None]
        if review.overall_score is not None and review.overall_score not in review_scores:
            review_scores.append(review.overall_score)

        if review_scores:
            application.human_score = round(sum(review_scores) / len(review_scores), 2)
            # Recalculate final score: 40% AI + 60% human
            if application.ai_score is not None:
                application.final_score = round(
                    (application.ai_score * 0.4) + (application.human_score * 0.6), 2
                )
            else:
                application.final_score = application.human_score

            # Update application status
            all_reviews = Review.query.filter_by(application_id=application.id).all()
            all_completed = all(r.status == 'completed' for r in all_reviews)
            if all_completed:
                application.status = 'scored'

    db.session.commit()

    # Phase 30C — funnel: reviewer completed work. Pairs with assignment_opened.
    try:
        from app.services.user_event_service import UserEventService
        UserEventService.record(
            user=current_user, event_name='reviewer.review_submitted',
            review_id=review.id, application_id=review.application_id,
            score=review.overall_score,
        )
    except Exception:
        pass

    logger.info(f"Review completed: review_id={review_id}, score={review.overall_score}")
    return jsonify({'success': True, 'review': review.to_dict()})
