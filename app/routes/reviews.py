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
    """List reviews based on user role."""
    # Eager-load relationships to avoid N+1 in to_dict()
    query = Review.query.options(
        db.joinedload(Review.application).joinedload(Application.grant),
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
    return jsonify({'success': True, 'review': review.to_dict()}), 201


@reviews_bp.route('/<int:review_id>', methods=['PUT'])
@login_required
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

    logger.info(f"Review completed: review_id={review_id}, score={review.overall_score}")
    return jsonify({'success': True, 'review': review.to_dict()})
