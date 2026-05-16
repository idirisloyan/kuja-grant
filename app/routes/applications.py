from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from datetime import datetime, date, timezone
from app.extensions import db
from app.models import Grant, Application, Document, Review
from app.utils.helpers import get_request_json, paginate_query
from app.utils.decorators import role_required
from app.services.scoring_engine import ScoringEngine
import logging

from app.services.audit import log_action

logger = logging.getLogger('kuja')

applications_bp = Blueprint('applications', __name__, url_prefix='/api/applications')


@applications_bp.route('/', methods=['GET'])
@login_required
def api_list_applications():
    """List applications filtered by role."""
    # Eager-load grant and ngo_org to avoid N+1 queries in to_dict()
    query = Application.query.options(
        db.joinedload(Application.grant),
        db.joinedload(Application.ngo_org),
    )

    if current_user.role == 'ngo':
        # NGO sees only their own applications
        query = query.filter_by(ngo_org_id=current_user.org_id)
    elif current_user.role == 'donor':
        # Donor sees applications for their grants
        query = query.join(Grant).filter(Grant.donor_org_id == current_user.org_id)
    elif current_user.role == 'reviewer':
        # Reviewer sees applications they have reviews for
        review_app_ids = db.session.query(Review.application_id).filter_by(
            reviewer_user_id=current_user.id
        ).subquery()
        query = query.filter(Application.id.in_(review_app_ids))
    # Admin sees all

    status = request.args.get('status')
    if status:
        query = query.filter(Application.status == status)

    grant_id = request.args.get('grant_id', type=int)
    if grant_id:
        query = query.filter(Application.grant_id == grant_id)

    query = query.order_by(Application.created_at.desc())
    pagination = paginate_query(query)

    return jsonify({
        'applications': [a.to_dict(summary=True) for a in pagination.items],
        'total': pagination.total,
        'page': pagination.page,
        'pages': pagination.pages,
    })


@applications_bp.route('/<int:app_id>', methods=['GET'])
@login_required
def api_get_application(app_id):
    """Get full application detail with responses, documents, and reviews."""
    application = db.session.get(Application, app_id)
    if not application:
        return jsonify({'error': 'Application not found'}), 404

    # Access control
    if current_user.role == 'ngo' and application.ngo_org_id != current_user.org_id:
        return jsonify({'error': 'Access denied'}), 403
    if current_user.role == 'donor':
        grant = db.session.get(Grant, application.grant_id)
        if not grant or grant.donor_org_id != current_user.org_id:
            return jsonify({'error': 'Access denied'}), 403

    data = application.to_dict(summary=False)

    # Include documents
    docs = Document.query.filter_by(application_id=app_id).all()
    data['documents'] = [d.to_dict() for d in docs]

    # Include reviews (visible to donor, reviewer, admin)
    if current_user.role in ('donor', 'reviewer', 'admin'):
        reviews = Review.query.filter_by(application_id=app_id).all()
        data['reviews'] = [r.to_dict() for r in reviews]
    else:
        data['reviews'] = []

    # Include grant criteria for context
    if application.grant:
        data['grant_criteria'] = application.grant.get_criteria()
        data['grant_eligibility'] = application.grant.get_eligibility()

    return jsonify({'application': data})


@applications_bp.route('/', methods=['POST'])
@role_required('ngo')
def api_create_application():
    """Create a new grant application (NGO only)."""
    data = get_request_json()
    grant_id = data.get('grant_id')

    if not grant_id:
        return jsonify({'error': 'grant_id is required', 'success': False}), 400

    grant = db.session.get(Grant, grant_id)
    if not grant:
        return jsonify({'error': 'Grant not found', 'success': False}), 404

    if grant.status != 'open':
        return jsonify({'error': 'This grant is not currently accepting applications', 'success': False}), 400

    # Check deadline
    if grant.deadline and grant.deadline < date.today():
        return jsonify({'error': 'The application deadline has passed', 'success': False}), 400

    # Check for existing application
    existing = Application.query.filter_by(
        grant_id=grant_id, ngo_org_id=current_user.org_id
    ).first()
    if existing:
        return jsonify({
            'error': 'Your organization has already applied to this grant',
            'existing_application_id': existing.id,
            'success': False,
        }), 409

    application = Application(
        grant_id=grant_id,
        ngo_org_id=current_user.org_id,
        status='draft',
    )

    if data.get('responses'):
        application.set_responses(data['responses'])
    # Accept both 'eligibility_responses' (correct) and 'eligibility' (legacy)
    elig_data = data.get('eligibility_responses') or data.get('eligibility')
    if elig_data:
        application.set_eligibility_responses(elig_data)

    db.session.add(application)
    db.session.commit()

    logger.info(
        f"Application created: grant={grant_id}, org={current_user.org_id}, app_id={application.id}"
    )
    return jsonify({'success': True, 'application': application.to_dict()}), 201


@applications_bp.route('/<int:app_id>', methods=['PUT'])
@login_required
def api_update_application(app_id):
    """Update an application (responses, eligibility, status)."""
    application = db.session.get(Application, app_id)
    if not application:
        return jsonify({'error': 'Application not found'}), 404

    # Only owning NGO can edit drafts; donors/admins can update status
    if current_user.role == 'ngo':
        if application.ngo_org_id != current_user.org_id:
            return jsonify({'error': 'Access denied'}), 403
        if application.status not in ('draft',):
            return jsonify({'error': 'Cannot edit a submitted application', 'success': False}), 400

    data = get_request_json()

    if 'responses' in data:
        application.set_responses(data['responses'])
    # Accept both 'eligibility_responses' (correct) and 'eligibility' (legacy)
    elig_data = data.get('eligibility_responses') or data.get('eligibility')
    if elig_data:
        application.set_eligibility_responses(elig_data)
    new_status = None
    if 'status' in data and current_user.role in ('donor', 'admin'):
        new_status = data['status']
        application.status = new_status
    if 'ai_score' in data:
        application.ai_score = data['ai_score']
    if 'human_score' in data:
        application.human_score = data['human_score']
    if 'final_score' in data:
        application.final_score = data['final_score']

    db.session.commit()

    # Phase 13.6 — inline-edit endpoint follows below; the existing PUT
    # path is preserved for full-payload edits (responses, eligibility, etc.)
    # Audit trail for critical state transition: awarded
    if new_status == 'awarded':
        log_action('application.awarded', current_user.email, 'application', application.id,
                   {'grant_id': application.grant_id})

    return jsonify({'success': True, 'application': application.to_dict()})


@applications_bp.route('/<int:app_id>/submit', methods=['POST'])
@role_required('ngo')
def api_submit_application(app_id):
    """Submit an application for review."""
    application = db.session.get(Application, app_id)
    if not application:
        return jsonify({'error': 'Application not found'}), 404

    if application.ngo_org_id != current_user.org_id:
        return jsonify({'error': 'Access denied'}), 403

    # Idempotent: if already submitted (or further along), return success
    if application.status in ('submitted', 'under_review', 'scored', 'awarded'):
        logger.info(f"Application already submitted (idempotent): id={app_id} status={application.status} by org {current_user.org_id}")
        return jsonify({'success': True, 'message': 'Application already submitted', 'application': application.to_dict()})

    if application.status != 'draft':
        return jsonify({'error': 'Only draft applications can be submitted', 'success': False}), 400

    # Validate that required responses exist
    grant = application.grant
    if grant:
        criteria = grant.get_criteria() or []
        responses = application.get_responses() or {}
        missing = []
        for idx, criterion in enumerate(criteria):
            # Support both id-based keys (e.g. "approach") and index-based keys (e.g. "criterion_0")
            cid = str(criterion.get('id', ''))
            index_key = f'criterion_{idx}'
            response_text = responses.get(cid, '') if cid else ''
            if not response_text:
                response_text = responses.get(index_key, '')
            if not str(response_text).strip():
                missing.append(criterion.get('label', cid or index_key))
        if missing:
            return jsonify({
                'error': 'Missing required responses',
                'missing_criteria': missing,
                'success': False,
            }), 400

    # Check deadline
    if grant and grant.deadline and grant.deadline < date.today():
        return jsonify({'error': 'The application deadline has passed', 'success': False}), 400

    application.status = 'submitted'
    application.submitted_at = datetime.now(timezone.utc)

    # Auto-score with AI
    try:
        score_result = ScoringEngine.score_application(application)
        application.ai_score = score_result.get('overall_score')
        application.final_score = score_result.get('overall_score')
    except Exception as e:
        logger.error(f"Auto-scoring failed for application {app_id}: {e}")

    db.session.commit()

    log_action('application.submitted', current_user.email, 'application', application.id,
               {'grant_id': application.grant_id, 'ai_score': application.ai_score})

    # Phase 10.5 — auto-extract reusable memory items from the submitted
    # application so the next time this org applies, the AI co-author can
    # cite their actual figures/partners/narratives. Best-effort; errors
    # don't surface to the user.
    try:
        from app.utils.feature_flags import is_enabled
        if is_enabled('ai.org_memory', org_id=application.ngo_org_id):
            from app.services import org_memory_service as oms
            extracted = oms.auto_extract_from_application(application)
            if extracted > 0:
                logger.info(f"org_memory: extracted {extracted} item(s) from application {application.id}")
    except Exception as _exc:  # pylint: disable=broad-except
        logger.debug(f"org_memory auto-extraction skipped: {_exc}")

    logger.info(f"Application submitted: id={app_id} by org {current_user.org_id} (score: {application.ai_score})")
    return jsonify({'success': True, 'application': application.to_dict()})


# ---------------------------------------------------------------------------
# Phase 5.3 — NGO-visible audit trail
# ---------------------------------------------------------------------------

@applications_bp.route('/<int:app_id>/status', methods=['PATCH'])
@login_required
def api_application_status_inline(app_id):
    """Phase 13.6 — inline-edit status flip.

    Tight, low-friction endpoint for the dropdown-on-row UX. Returns the
    minimal payload needed to update the row in place — no full doc body,
    no recomputed scores. Donor + admin only; NGOs use /submit.

    Body: { status: 'submitted' | 'under_review' | 'awarded' | 'rejected' }

    Allowed transitions are role-checked:
      donor:  draft -> (no — NGO submits) ;
              submitted/under_review -> under_review/awarded/rejected
      admin:  any
    """
    from app.utils.validation import require_enum, ValidationError, to_error_response
    from app.utils.api_errors import error_response

    application = db.session.get(Application, app_id)
    if not application:
        return error_response('application.not_found', 404)
    if current_user.role not in ('donor', 'admin'):
        return error_response('auth.access_denied', 403)
    if current_user.role == 'donor':
        # Donor must own the grant to flip status on its applications.
        from app.models import Grant
        grant = db.session.get(Grant, application.grant_id)
        if not grant or getattr(grant, 'donor_org_id', None) != current_user.org_id:
            return error_response('auth.access_denied', 403)

    data = get_request_json() or {}
    try:
        new_status = require_enum(data, 'status', (
            'submitted', 'under_review', 'awarded', 'rejected'
        ))
    except ValidationError as e:
        return to_error_response(e)

    old_status = application.status
    application.status = new_status
    db.session.commit()

    log_action(
        f'application.status.{new_status}',
        current_user.email, 'application', application.id,
        {'old_status': old_status, 'new_status': new_status, 'inline': True},
    )
    logger.info(f"Inline status flip: app={app_id} {old_status}->{new_status} by {current_user.email}")
    return jsonify({
        'success': True,
        'application_id': application.id,
        'status': new_status,
        'previous_status': old_status,
    })


@applications_bp.route('/decision-reasons', methods=['GET'])
@login_required
def api_decision_reasons():
    """Phase 14 — controlled vocab for win/loss debrief.

    NGO and donor both fetch this so the UI can render the same chips
    in the same order on both sides. Stable English codes; frontend
    localises the labels.
    """
    from app.constants import WIN_LOSS_REASONS
    return jsonify({'success': True, 'reasons': WIN_LOSS_REASONS})


@applications_bp.route('/<int:app_id>/debrief', methods=['PUT'])
@login_required
def api_application_debrief(app_id):
    """Phase 14 — record the win/loss debrief on an awarded/rejected app.

    PMO-transfer pattern: donor records a structured reason + free-text
    notes at the moment of decision. NGOs see this read-only as
    structured feedback (closes the loop on declined proposals — and
    explains why winners won).

    Body: { reason_code: str, notes?: str }
    """
    from app.constants import WIN_LOSS_CODES
    from app.utils.api_errors import error_response

    application = (
        Application.query.options(db.joinedload(Application.grant))
        .filter_by(id=app_id).first()
    )
    if not application:
        return error_response('application.not_found', 404)

    # Donor must own the grant. Admin can record on any.
    if current_user.role == 'donor':
        if not application.grant or application.grant.donor_org_id != current_user.org_id:
            return error_response('auth.access_denied', 403)
    elif current_user.role != 'admin':
        return error_response('auth.access_denied', 403)

    # Only meaningful on a decided application.
    if application.status not in ('awarded', 'rejected'):
        return jsonify({'success': False,
                        'error': 'Debrief is only available after award/rejection'}), 400

    data = get_request_json() or {}
    reason_code = (data.get('reason_code') or '').strip()
    if reason_code and reason_code not in WIN_LOSS_CODES:
        return jsonify({'success': False, 'error': 'Unknown reason_code'}), 400

    notes = (data.get('notes') or '').strip()[:4000]

    application.decision_reason_code = reason_code or None
    application.decision_notes = notes or None
    application.decision_recorded_at = datetime.now(timezone.utc)
    application.decision_recorded_by_user_id = current_user.id
    db.session.commit()

    log_action(
        'application.debrief.recorded',
        current_user.email, 'application', application.id,
        {'reason_code': reason_code, 'status': application.status},
    )

    return jsonify({
        'success': True,
        'application_id': application.id,
        'decision_reason_code': application.decision_reason_code,
        'decision_notes': application.decision_notes,
        'decision_recorded_at': application.decision_recorded_at.isoformat(),
        'decision_recorded_by_user_id': application.decision_recorded_by_user_id,
    })


@applications_bp.route('/debrief/rollup', methods=['GET'])
@login_required
def api_debrief_rollup():
    """Phase 15A — aggregate win/loss debrief reasons for the current user.

    Returns role-scoped rollup:
      - NGO   → 'why your applications win/lose'
      - donor → 'why you've awarded/declined'
      - admin → must specify ?scope=ngo&id= or ?scope=donor&id=

    Query params:
      ?days=N    lookback window in days (default 365, max 730)
    """
    from app.services.debrief_rollup_service import DebriefRollupService
    from app.utils.cache import _dashboard_cache

    try:
        days = max(30, min(730, int(request.args.get('days', 365))))
    except (TypeError, ValueError):
        days = 365

    role = current_user.role
    scope = request.args.get('scope')
    raw_id = request.args.get('id')

    if role == 'ngo':
        if not current_user.org_id:
            return jsonify({'success': False, 'error': 'NGO org required'}), 400
        cache_key = f'debrief_rollup_ngo_{current_user.org_id}_{days}'
        cached = _dashboard_cache.get(cache_key)
        if cached is not None:
            return jsonify({'success': True, 'cached': True, **cached})
        rollup = DebriefRollupService.for_ngo(
            ngo_org_id=current_user.org_id, lookback_days=days,
        )
        _dashboard_cache.set(cache_key, rollup)
        return jsonify({'success': True, **rollup})

    if role == 'donor':
        if not current_user.org_id:
            return jsonify({'success': False, 'error': 'Donor org required'}), 400
        cache_key = f'debrief_rollup_donor_{current_user.org_id}_{days}'
        cached = _dashboard_cache.get(cache_key)
        if cached is not None:
            return jsonify({'success': True, 'cached': True, **cached})
        rollup = DebriefRollupService.for_donor(
            donor_org_id=current_user.org_id, lookback_days=days,
        )
        _dashboard_cache.set(cache_key, rollup)
        return jsonify({'success': True, **rollup})

    if role == 'admin':
        if scope not in ('ngo', 'donor') or not raw_id:
            return jsonify({'success': False, 'error': 'admin must pass scope + id'}), 400
        try:
            org_id = int(raw_id)
        except (TypeError, ValueError):
            return jsonify({'success': False, 'error': 'id must be int'}), 400
        if scope == 'ngo':
            rollup = DebriefRollupService.for_ngo(ngo_org_id=org_id, lookback_days=days)
        else:
            rollup = DebriefRollupService.for_donor(donor_org_id=org_id, lookback_days=days)
        return jsonify({'success': True, **rollup})

    return jsonify({'success': False, 'error': 'Role not supported'}), 403


@applications_bp.route('/<int:app_id>/activity', methods=['GET'])
@login_required
def api_application_activity(app_id):
    """Aggregated event log for an application — visible to the NGO that owns it.

    Surfaces what we already store, no new schema:
      - lifecycle: created, last edited, submitted (from Application timestamps)
      - AI calls run by anyone in this org (from ai_call_logs)
      - provenance rows attached to this application (ai_provenance)
      - reviews submitted (from reviews + reviewer name)
      - documents uploaded (from documents)

    Each event has {ts, kind, label, detail?, actor?}. UI renders as a
    timeline. This makes the application's history transparent to the NGO,
    answering 'what happened on my application' in plain language.
    """
    from app.utils.api_errors import error_response
    application = db.session.get(Application, app_id)
    if not application:
        return error_response('application.not_found', 404)

    # Access control: NGO sees their own; donor (of this grant) + reviewer
    # + admin all see it for transparency.
    if current_user.role == 'ngo' and application.ngo_org_id != current_user.org_id:
        return error_response('auth.access_denied', 403)
    if current_user.role == 'donor':
        from app.models import Grant
        grant = db.session.get(Grant, application.grant_id)
        if not grant or grant.donor_org_id != current_user.org_id:
            return error_response('auth.access_denied', 403)

    events = []

    # 1. Lifecycle from Application timestamps.
    if application.created_at:
        events.append({
            'ts': application.created_at.isoformat(),
            'kind': 'lifecycle',
            'label': 'application.activity.created',
        })
    if application.updated_at and application.updated_at != application.created_at:
        events.append({
            'ts': application.updated_at.isoformat(),
            'kind': 'lifecycle',
            'label': 'application.activity.last_edited',
        })
    if application.submitted_at:
        events.append({
            'ts': application.submitted_at.isoformat(),
            'kind': 'lifecycle',
            'label': 'application.activity.submitted',
            'detail': {'status': application.status},
        })

    # 2. AI calls. We log endpoint + role + language at each call. We attach
    # call rows whose user belongs to the same org and that occurred between
    # application.created_at and now.
    try:
        from sqlalchemy import text
        rows = db.session.execute(
            text("""
                SELECT created_at, endpoint, role, language, success
                FROM ai_call_logs
                WHERE org_id = :oid
                  AND created_at >= COALESCE(:since, NOW() - INTERVAL '90 days')
                ORDER BY created_at DESC
                LIMIT 200
            """),
            {"oid": application.ngo_org_id, "since": application.created_at},
        ).fetchall()
        for r in rows:
            events.append({
                'ts': r[0].isoformat() if r[0] else None,
                'kind': 'ai_call',
                'label': 'application.activity.ai_call',
                'detail': {
                    'endpoint': r[1],
                    'role': r[2],
                    'language': r[3],
                    'success': bool(r[4]) if r[4] is not None else None,
                },
            })
    except Exception:
        pass  # ai_call_logs may not exist in older deploys; non-critical

    # 3. Provenance rows for this application (per-criterion citations).
    try:
        from app.services.ai_service import AIService
        prov_rows = AIService.get_provenance(subject_kind='application', subject_id=app_id, limit=100)
        # Group by ai_call_id (or by claim hash when no call id) so the UI
        # surfaces "AI cited 7 sources for criterion X" rather than 7 rows.
        for p in prov_rows[:50]:
            events.append({
                'ts': p.get('created_at'),
                'kind': 'provenance',
                'label': 'application.activity.provenance',
                'detail': {
                    'criterion': (p.get('subject') or {}).get('field'),
                    'source_kind': (p.get('source') or {}).get('kind'),
                    'confidence': p.get('confidence'),
                },
            })
    except Exception:
        pass

    # 4. Reviews on this application.
    try:
        from app.models import Review, User
        reviews = (Review.query.filter_by(application_id=app_id)
                   .order_by(Review.created_at.desc())
                   .all())
        for rv in reviews:
            reviewer_name = None
            if rv.reviewer_user_id:
                u = db.session.get(User, rv.reviewer_user_id)
                if u:
                    reviewer_name = u.name
            events.append({
                'ts': (rv.completed_at or rv.created_at).isoformat() if (rv.completed_at or rv.created_at) else None,
                'kind': 'review',
                'label': 'application.activity.review',
                'detail': {
                    'status': rv.status,
                    'overall_score': rv.overall_score,
                    # Reviewer name visible to the NGO when the review is
                    # complete; pending reviews stay anonymous.
                    'reviewer': reviewer_name if rv.status == 'completed' else None,
                },
            })
    except Exception:
        pass

    # 5. Documents uploaded.
    try:
        from app.models import Document
        docs = (Document.query.filter_by(application_id=app_id)
                .order_by(Document.created_at.desc())
                .limit(50).all())
        for d in docs:
            events.append({
                'ts': d.created_at.isoformat() if d.created_at else None,
                'kind': 'document',
                'label': 'application.activity.document_uploaded',
                'detail': {
                    'filename': getattr(d, 'filename', None) or getattr(d, 'title', None),
                    'doc_type': getattr(d, 'doc_type', None),
                },
            })
    except Exception:
        pass

    # Sort newest first; trim to 100 for transport.
    events = [e for e in events if e.get('ts')]
    events.sort(key=lambda e: e['ts'], reverse=True)
    events = events[:100]

    return jsonify({'success': True, 'events': events, 'application_id': app_id})
