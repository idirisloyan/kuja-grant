from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user
from datetime import datetime, date, timezone
from app.extensions import db
from app.models import Grant, Application, Document, Review, Organization
from app.utils.helpers import get_request_json, paginate_query
from app.utils.decorators import role_required
from app.services.scoring_engine import ScoringEngine
import logging

from app.services.audit import log_action

logger = logging.getLogger('kuja')

applications_bp = Blueprint('applications', __name__, url_prefix='/api/applications')


def _run_network_rubric_scorer_background(*, app, application_id: int):
    """Phase 41 background worker — runs the Phase 38 NEAR rubric scorer
    asynchronously so /submit responds fast. Persists the result to
    ai_rubric_result_json + overrides ai_score with the rubric overall.

    The Flask app object must be captured at submit time (in the
    route handler) and passed in — the worker thread has no Flask
    request context, so we establish its own application context here.
    Best-effort: any failure logs but does not raise — the application
    is already submitted, the rubric just won't be present until an
    operator clicks "Run scorer".
    """
    with app.app_context():
        try:
            from app.models import FundWindow, Organization
            from app.services.network_ai_service import NetworkAIService
            a = db.session.get(Application, application_id)
            if not a or not a.grant or not a.grant.fund_window_id:
                return {'ok': False, 'reason': 'not_network_grant'}
            window = db.session.get(FundWindow, a.grant.fund_window_id)
            rubric = window.default_rubric() if window else None
            if not (rubric and rubric.criteria):
                return {'ok': False, 'reason': 'no_rubric'}
            submission_text = ''
            responses = a.get_responses() or {}
            if responses:
                submission_text = '\n\n'.join(
                    f"{k}: {v}" for k, v in responses.items() if v
                )
            org = db.session.get(Organization, a.ngo_org_id)
            rubric_result = NetworkAIService.score_application_against_rubric(
                application_text=submission_text,
                rubric_criteria=[c.to_dict() for c in rubric.criteria],
                org_name=org.name if org else None,
                window_name=window.name if window else None,
            )
            if rubric_result:
                a.set_ai_rubric_result(rubric_result)
                overall = rubric_result.get('overall_score')
                if overall is None:
                    overall = rubric_result.get('total_score')
                if isinstance(overall, (int, float)):
                    a.ai_score = float(overall)
                    a.final_score = float(overall)
                db.session.commit()
                logger.info(
                    f"background rubric scored app={application_id} "
                    f"overall={overall}"
                )
                return {'ok': True, 'overall': overall}
            return {'ok': False, 'reason': 'rubric_returned_none'}
        except Exception as e:
            logger.exception(
                f"background rubric scorer failed for app {application_id}: {e}"
            )
            try:
                db.session.rollback()
            except Exception:
                pass
            return {'ok': False, 'error': str(e)[:200]}


@applications_bp.route('/', methods=['GET'])
@login_required
def api_list_applications():
    """List applications filtered by role + current network.

    Phase 99 — code-review verdict found a NEAR member's dashboard
    surfaced their Kuja marketplace drafts because this endpoint
    filtered by role but not by network. Adding the tenant filter here
    (rather than at each consumer) means every list view stays inside
    its tenant boundary by default.
    """
    from app.utils.network import scope_application_query
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
    # Admin sees all (still tenant-scoped — admin viewing NEAR sees NEAR
    # only; admin viewing Kuja sees Kuja only; admin can switch tenants).

    # Tenant scope last so the joins don't fight with the role-specific
    # joins above. Donor branch already joined Grant — scope_application_query
    # joins it again, which is harmless for SQLAlchemy.
    query = scope_application_query(query)

    status = request.args.get('status')
    if status:
        query = query.filter(Application.status == status)

    grant_id = request.args.get('grant_id', type=int)
    if grant_id:
        query = query.filter(Application.grant_id == grant_id)

    # Phase 211 — donor/reviewer shortlist filter.
    if request.args.get('starred') in ('1', 'true'):
        query = query.filter(Application.is_starred == True)  # noqa: E712

    query = query.order_by(Application.created_at.desc())
    pagination = paginate_query(query)

    return jsonify({
        'applications': [a.to_dict(summary=True) for a in pagination.items],
        'total': pagination.total,
        'page': pagination.page,
        'pages': pagination.pages,
    })


@applications_bp.route('/<int:app_id>/ngo-history', methods=['GET'])
@login_required
def api_application_ngo_history(app_id):
    """Phase 188 — Past applications from the same NGO (donor view).

    Returns up to 12 prior applications from this NGO across grants
    (newest first) — title, status, scores, date. Helps donors gauge
    the relationship history when reviewing a fresh application.

    Access: donor (only for own grants), admin, the NGO itself.
    """
    application = db.session.get(Application, app_id)
    if not application:
        return jsonify({'error': 'Application not found'}), 404
    if current_user.role == 'donor':
        grant_check = db.session.get(Grant, application.grant_id)
        if not grant_check or grant_check.donor_org_id != current_user.org_id:
            return jsonify({'error': 'Access denied'}), 403
    if current_user.role == 'ngo' and application.ngo_org_id != current_user.org_id:
        return jsonify({'error': 'Access denied'}), 403

    try:
        rows = (
            Application.query
            .filter(Application.ngo_org_id == application.ngo_org_id)
            .filter(Application.id != application.id)
            .order_by(Application.submitted_at.desc().nullslast())
            .limit(12)
            .all()
        )
    except Exception as e:
        logger.warning('ngo-history query failed: %s', e)
        rows = []

    items = []
    for r in rows:
        grant_title = None
        try:
            g = db.session.get(Grant, r.grant_id) if r.grant_id else None
            grant_title = g.title if g else None
        except Exception:
            pass
        items.append({
            'id': r.id,
            'grant_id': r.grant_id,
            'grant_title': grant_title,
            'status': r.status,
            'ai_score': r.ai_score,
            'human_score': r.human_score,
            'submitted_at':
                r.submitted_at.isoformat() if r.submitted_at else None,
        })

    # Quick aggregate so the donor sees a one-line context.
    awarded = sum(1 for it in items if it['status'] == 'awarded')
    rejected = sum(1 for it in items if it['status'] in ('rejected', 'declined'))

    return jsonify({
        'success': True,
        'applications': items,
        'summary': {
            'total': len(items),
            'awarded': awarded,
            'rejected': rejected,
            'in_progress': len(items) - awarded - rejected,
        },
    })


@applications_bp.route('/<int:app_id>.pdf', methods=['GET'])
@login_required
def api_application_pdf(app_id):
    """Phase 159 — Self-contained PDF export of a single application.

    Access mirrors the JSON detail endpoint: NGO sees their own,
    donor sees apps to their grants, admin sees all.
    """
    application = db.session.get(Application, app_id)
    if not application:
        return jsonify({'error': 'Application not found'}), 404
    if current_user.role == 'ngo' and application.ngo_org_id != current_user.org_id:
        return jsonify({'error': 'Access denied'}), 403
    if current_user.role == 'donor':
        g_check = db.session.get(Grant, application.grant_id)
        if not g_check or g_check.donor_org_id != current_user.org_id:
            return jsonify({'error': 'Access denied'}), 403

    grant = db.session.get(Grant, application.grant_id)
    org = db.session.get(Organization, application.ngo_org_id)

    criteria = []
    try:
        criteria = grant.get_criteria() if grant else []
    except Exception:
        criteria = []
    responses = {}
    try:
        responses = application.get_responses() or {}
    except Exception:
        pass

    try:
        from app.services.application_pdf_service import build_application_pdf
        pdf_bytes = build_application_pdf(
            application=application,
            grant=grant,
            org=org,
            criteria=criteria,
            responses=responses,
        )
    except Exception as e:
        logger.exception(f'application PDF render failed: {e}')
        return jsonify({'success': False, 'error': 'PDF render failed'}), 500

    import re as _re
    slug_src = (grant.title if grant else f'app-{app_id}') or f'app-{app_id}'
    slug = _re.sub(r'[^a-z0-9]+', '-', slug_src.lower()).strip('-')[:60] or f'app-{app_id}'
    filename = f'kuja-application-{slug}-{app_id}.pdf'
    from flask import send_file as _send_file
    import io as _io
    return _send_file(
        _io.BytesIO(pdf_bytes),
        mimetype='application/pdf',
        as_attachment=True,
        download_name=filename,
    )


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
        # Network-window flag so the frontend can show the Phase 38 AI
        # panel (rubric scorer + direct-to-community classifier) only on
        # network grants.
        data['grant_fund_window_id'] = getattr(application.grant, 'fund_window_id', None)

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

    # Phase 30A — funnel: NGO starts a draft. Pairs with application.submit.
    try:
        from app.services.user_event_service import UserEventService
        UserEventService.record(
            user=current_user, event_name='application.start_draft',
            application_id=application.id, grant_id=grant_id,
        )
    except Exception:
        pass

    return jsonify({'success': True, 'application': application.to_dict()}), 201


@applications_bp.route('/<int:app_id>/explain-rejection', methods=['GET'])
@login_required
@role_required('ngo')
def api_explain_application_rejection(app_id):
    """Phase 76 — Why-rejected, constructively. Applications side."""
    from app.services.ai_service import AIService
    application = db.session.get(Application, app_id)
    if not application:
        return jsonify({'error': 'Application not found', 'success': False}), 404
    if application.ngo_org_id != current_user.org_id:
        return jsonify({'error': 'Access denied', 'success': False}), 403
    if application.status not in ('declined', 'rejected', 'revision_requested'):
        return jsonify({
            'error': 'Explanation is only available for declined or revision-requested applications.',
            'success': False,
        }), 400

    grant = db.session.get(Grant, application.grant_id)
    rubric = grant.get_criteria() if grant and hasattr(grant, 'get_criteria') else []
    payload = {
        'grant_title': grant.title if grant else None,
        'responses': application.get_responses() or {},
        'budget_lines': application.get_budget_lines() if hasattr(application, 'get_budget_lines') else None,
        'ai_score': getattr(application, 'ai_score', None),
        'human_score': getattr(application, 'human_score', None),
        'final_score': getattr(application, 'final_score', None),
    }
    donor_notes = (
        getattr(application, 'reviewer_notes', None)
        or getattr(application, 'donor_notes', None)
        or getattr(application, 'feedback', None)
    )

    result = AIService.explain_rejection(
        'application', payload=payload, donor_notes=donor_notes, rubric=rubric,
    )
    return jsonify({'success': True, **result})


@applications_bp.route('/<int:app_id>/ai-draft', methods=['POST'])
@login_required
@role_required('ngo')
def api_ai_draft_application(app_id):
    """Phase 75 — AI-drafts-application v0.

    NGO opens a draft application. Claude pre-fills every question using:
      - The grant's criteria, eligibility, doc_requirements
      - The org's latest completed capacity assessment
      - The org's last 2 submitted applications (to similar or different
        grants — donors won't see this leak)
      - The org's profile (sector, country, size hints)

    NGO becomes editor, not author. Returns suggested responses +
    a per-question rationale + a 'gaps' list (questions the AI was
    unable to draft because it had no context).

    Body: { merge?: bool (default false — preview only) }
    Returns: { responses: {key: text}, rationale: {key: why},
              gaps: [keys], confidence: 0-100 }
    """
    from app.models import Application, Grant, Assessment
    from app.services.ai_service import AIService

    application = db.session.get(Application, app_id)
    if not application:
        return jsonify({'error': 'Application not found', 'success': False}), 404
    if application.ngo_org_id != current_user.org_id:
        return jsonify({'error': 'Access denied', 'success': False}), 403
    if application.status not in ('draft',):
        return jsonify({'error': 'AI draft is only available for draft applications.',
                        'success': False}), 400

    grant = db.session.get(Grant, application.grant_id)
    if not grant:
        return jsonify({'error': 'Grant not found', 'success': False}), 404

    # Build context.
    criteria = grant.get_criteria() if hasattr(grant, 'get_criteria') else []
    eligibility = grant.get_eligibility() if hasattr(grant, 'get_eligibility') else []

    # Latest completed assessment for this org.
    org_assessment = None
    try:
        assess = Assessment.query.filter_by(org_id=current_user.org_id).order_by(
            Assessment.updated_at.desc()).first()
        if assess:
            org_assessment = {
                'framework': getattr(assess, 'framework', None),
                'overall_score': getattr(assess, 'overall_score', None),
                'responses': assess.get_responses() if hasattr(assess, 'get_responses') else None,
            }
    except Exception:
        pass

    # Last 2 submitted applications for this org.
    prior_apps = Application.query.filter(
        Application.ngo_org_id == current_user.org_id,
        Application.id != app_id,
        Application.status.in_(['submitted', 'in_review', 'awarded', 'declined']),
    ).order_by(Application.id.desc()).limit(2).all()
    prior_payloads = []
    for a in prior_apps:
        prior_payloads.append({
            'grant_title': (db.session.get(Grant, a.grant_id).title
                            if db.session.get(Grant, a.grant_id) else None),
            'responses': a.get_responses() if hasattr(a, 'get_responses') else None,
        })

    org = None
    try:
        from app.models import Organization
        org = db.session.get(Organization, current_user.org_id)
    except Exception:
        pass
    org_profile = {}
    if org:
        for f in ('name', 'sector', 'sectors', 'country', 'size', 'mission_statement', 'year_founded'):
            v = getattr(org, f, None)
            if v is not None:
                org_profile[f] = v

    try:
        result = AIService.draft_application_responses(
            grant_title=grant.title,
            grant_description=grant.description or '',
            criteria=criteria, eligibility=eligibility,
            org_profile=org_profile,
            org_assessment=org_assessment,
            prior_applications=prior_payloads,
            existing_responses=application.get_responses() or {},
        )
    except Exception as e:
        logger.error(f"ai-draft-application failed: {e}")
        return jsonify({
            'success': False,
            'error': 'AI drafting is temporarily unavailable. Please try again or fill the application by hand.',
        }), 502

    data = get_request_json() or {}
    merged = result.get('responses') or {}
    if data.get('merge'):
        existing = application.get_responses() or {}
        # Only fill EMPTY responses — never overwrite NGO text.
        out = dict(existing)
        for k, v in merged.items():
            if v and not (out.get(k) or '').strip():
                out[k] = v
        application.set_responses(out)
        db.session.commit()

    return jsonify({
        'success': True,
        'responses': result.get('responses', {}),
        'rationale': result.get('rationale', {}),
        'gaps':      result.get('gaps', []),
        'confidence': result.get('confidence', 0),
        'ai_used':   result.get('ai_used', False),
        'merged':    bool(data.get('merge')),
    })


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
    # Phase 40 — applicant records the structured budget the hard-gate
    # classifier needs. Accept on every PUT so the NGO can iterate
    # before /submit fires the gate.
    if 'budget_lines' in data:
        application.set_budget_lines(data['budget_lines'])
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

    # Phase 157 — fan out the transition as a webhook event so external
    # systems can pick up award / decline decisions without polling.
    if new_status in ('awarded', 'rejected', 'declined'):
        try:
            from app.routes.webhook_routes import dispatch_event
            event_name = (
                'application.awarded' if new_status == 'awarded'
                else 'application.rejected'
            )
            payload = {
                'application_id': application.id,
                'grant_id': application.grant_id,
                'ngo_org_id': application.ngo_org_id,
                'status': new_status,
                'final_score': application.final_score,
            }
            dispatch_event(application.ngo_org_id, event_name, payload)
            try:
                grant_obj = (
                    db.session.get(Grant, application.grant_id)
                    if application.grant_id else None
                )
                if grant_obj and grant_obj.donor_org_id:
                    dispatch_event(grant_obj.donor_org_id, event_name, payload)
            except Exception:
                pass
        except Exception as e:
            logger.debug('webhook dispatch (%s) skipped: %s', new_status, e)

    return jsonify({'success': True, 'application': application.to_dict()})


@applications_bp.route('/<int:app_id>/request-revision', methods=['POST'])
@role_required('donor', 'admin')
def api_request_revision(app_id):
    """Phase 160 — Donor requests a revision on a declined / under-review
    application instead of issuing a hard reject.

    Body: { feedback?: str (max 2000) }

    Sets status to 'revision_requested' so the NGO can edit + resubmit.
    Audited; notifies the NGO with the feedback if provided.
    """
    application = db.session.get(Application, app_id)
    if not application:
        return jsonify({'error': 'Application not found'}), 404
    # Donor scope check
    if current_user.role == 'donor':
        grant_check = db.session.get(Grant, application.grant_id)
        if not grant_check or grant_check.donor_org_id != current_user.org_id:
            return jsonify({'error': 'Access denied'}), 403

    if application.status not in ('submitted', 'under_review', 'scored', 'declined', 'rejected'):
        return jsonify({
            'success': False,
            'error': f"Cannot request revision from status '{application.status}'",
        }), 400

    from app.utils.helpers import get_request_json as _get
    data = _get() or {}
    feedback = (data.get('feedback') or '').strip()[:2000] or None

    application.status = 'revision_requested'
    if feedback:
        application.decision_notes = feedback
        application.decision_recorded_at = datetime.now(timezone.utc)
        application.decision_recorded_by_user_id = current_user.id
    db.session.commit()

    log_action('application.revision_requested', current_user.email,
               'application', application.id,
               {'feedback_chars': len(feedback) if feedback else 0})

    # Phase 182 — per-user fan-out (Notification.user_id is NOT NULL).
    try:
        from app.models import Notification, User
        ngo_users = User.query.filter_by(
            org_id=application.ngo_org_id, role='ngo',
        ).all()
        summary = (feedback[:140] + '…') if feedback and len(feedback) > 140 else feedback
        for u in ngo_users:
            n = Notification(
                user_id=u.id,
                type='application_revision_requested',
                title='Donor requested a revision',
                message=summary or 'Open the application to see what to change.',
                link=f'/applications/{application.id}',
            )
            db.session.add(n)
        if ngo_users:
            db.session.commit()
    except Exception as e:
        logger.debug('revision-request notify skipped: %s', e)

    return jsonify({'success': True, 'application': application.to_dict()})


@applications_bp.route('/<int:app_id>/peer-score', methods=['GET'])
@login_required
def api_peer_score(app_id):
    """Phase 225 — NGO calibration signal.

    Compares this application's `ai_score` with the median ai_score of
    accepted applications across the same grant's sector(s). Returns a
    relative delta + the n it's based on. Only the applicant NGO of the
    application can read this.
    """
    a = db.session.get(Application, app_id)
    if not a:
        return jsonify({'error': 'Application not found'}), 404
    if a.ngo_org_id != current_user.org_id:
        return jsonify({'error': 'Access denied'}), 403
    if a.ai_score is None:
        return jsonify({'success': True, 'reason': 'no_ai_score'})

    g = db.session.get(Grant, a.grant_id) if a.grant_id else None
    sectors = g.get_sectors() if g and hasattr(g, 'get_sectors') else []
    if not sectors:
        return jsonify({'success': True, 'reason': 'no_sectors'})

    # Find peer apps: accepted/awarded on grants sharing at least one sector,
    # excluding this org.
    from sqlalchemy import or_
    peers = Application.query.join(Grant).filter(
        Application.status.in_(['awarded', 'accepted']),
        Application.ngo_org_id != current_user.org_id,
        Application.ai_score.isnot(None),
    ).all()
    pool = []
    for p in peers:
        pg = db.session.get(Grant, p.grant_id) if p.grant_id else None
        ps = pg.get_sectors() if pg and hasattr(pg, 'get_sectors') else []
        if any(s in ps for s in sectors):
            pool.append(float(p.ai_score))
    if len(pool) < 5:
        return jsonify({'success': True, 'reason': 'small_pool', 'pool_size': len(pool)})
    pool.sort()
    mid = len(pool) // 2
    median = pool[mid] if len(pool) % 2 else (pool[mid - 1] + pool[mid]) / 2
    return jsonify({
        'success': True,
        'your_score': float(a.ai_score),
        'peer_median_accepted': round(median, 1),
        'delta': round(float(a.ai_score) - median, 1),
        'pool_size': len(pool),
    })


@applications_bp.route('/bulk-star', methods=['POST'])
@role_required('donor', 'admin', 'reviewer')
def api_bulk_star_applications():
    """Phase 215 — Bulk star/unstar.

    Body: { ids: [int], starred: bool }
    Donors must own every parent grant; mixed access → 403.
    """
    data = get_request_json() or {}
    raw_ids = data.get('ids') or []
    if not isinstance(raw_ids, list) or not raw_ids:
        return jsonify({'error': 'ids must be a non-empty list'}), 400
    try:
        ids = [int(x) for x in raw_ids][:100]
    except (TypeError, ValueError):
        return jsonify({'error': 'ids must be integers'}), 400
    starred = bool(data.get('starred', True))

    apps = Application.query.filter(Application.id.in_(ids)).all()
    if not apps:
        return jsonify({'success': True, 'updated': 0})

    if current_user.role == 'donor':
        for a in apps:
            g = db.session.get(Grant, a.grant_id) if a.grant_id else None
            if not g or g.donor_org_id != current_user.org_id:
                return jsonify({'error': 'Access denied'}), 403

    n = 0
    for a in apps:
        if a.is_starred != starred:
            a.is_starred = starred
            n += 1
    if n > 0:
        db.session.commit()
    log_action('application.bulk_star_toggled', current_user.email,
               'application', apps[0].id, {'count': n, 'starred': starred, 'ids': ids})
    return jsonify({'success': True, 'updated': n})


@applications_bp.route('/<int:app_id>/star', methods=['POST'])
@role_required('donor', 'admin', 'reviewer')
def api_toggle_application_star(app_id):
    """Phase 209 — Toggle the shortlist star on an application.

    Body: { starred: bool }  (or empty → toggle)
    """
    application = db.session.get(Application, app_id)
    if not application:
        return jsonify({'error': 'Application not found'}), 404

    # Donors: must own the parent grant.
    if current_user.role == 'donor':
        grant = db.session.get(Grant, application.grant_id) if application.grant_id else None
        if not grant or grant.donor_org_id != current_user.org_id:
            return jsonify({'error': 'Access denied'}), 403

    data = get_request_json() or {}
    if 'starred' in data:
        new_val = bool(data['starred'])
    else:
        new_val = not bool(application.is_starred)
    application.is_starred = new_val
    db.session.commit()

    log_action('application.star_toggled', current_user.email,
               'application', application.id, {'starred': new_val})
    return jsonify({'success': True, 'is_starred': new_val})


@applications_bp.route('/<int:app_id>/request-document', methods=['POST'])
@role_required('donor', 'admin')
def api_request_document(app_id):
    """Phase 202 — Donor asks the NGO for a specific additional document.

    Lighter-touch than request-revision: doesn't change the application
    status, just records a request + notifies the NGO. The NGO uploads
    the doc and the donor sees it in the documents list.

    Body: { label: str (required), note?: str (max 1000) }
    """
    application = db.session.get(Application, app_id)
    if not application:
        return jsonify({'error': 'Application not found'}), 404
    if application.status == 'draft':
        return jsonify({'error': 'Cannot request documents on a draft application.'}), 400

    data = get_request_json() or {}
    label = (data.get('label') or '').strip()
    if not label:
        return jsonify({'error': 'label is required'}), 400
    label = label[:200]
    note = (data.get('note') or '').strip()[:1000] or None

    log_action('application.document_requested', current_user.email,
               'application', application.id,
               {'label': label, 'note_chars': len(note) if note else 0})

    # Notify all NGO users in the applicant org.
    try:
        from app.models import Notification, User
        ngo_users = User.query.filter_by(
            org_id=application.ngo_org_id, role='ngo',
        ).all()
        msg = f'The donor would like you to upload: "{label}".'
        if note:
            msg += f' Note: {note[:200]}'
        for u in ngo_users:
            n = Notification(
                user_id=u.id,
                type='application_document_requested',
                title='Donor requested an additional document',
                message=msg,
                link=f'/applications/{application.id}',
            )
            db.session.add(n)
        if ngo_users:
            db.session.commit()
    except Exception as e:
        logger.debug('document-request notify skipped: %s', e)

    return jsonify({'success': True})


@applications_bp.route('/<int:app_id>/withdraw', methods=['POST'])
@role_required('ngo')
def api_withdraw_application(app_id):
    """Phase 145 — NGO withdraws a submitted application.

    Allowed only while the application is in 'submitted' (not yet
    under_review/scored/awarded/declined). Idempotent: returns success
    if already withdrawn.

    Records audit-chain entry + fires the
    `application.rejected` webhook (status === withdrawn is a form of
    not-going-forward; mapping it to a separate event would inflate
    surface area for little gain — the payload includes the
    `withdrawn=true` flag).
    """
    application = db.session.get(Application, app_id)
    if not application:
        return jsonify({'error': 'Application not found'}), 404
    if application.ngo_org_id != current_user.org_id:
        return jsonify({'error': 'Access denied'}), 403
    if application.status == 'withdrawn':
        return jsonify({
            'success': True,
            'message': 'Application already withdrawn',
            'application': application.to_dict(),
        })
    if application.status != 'submitted':
        return jsonify({
            'success': False,
            'error': (
                f"Cannot withdraw from status '{application.status}'. "
                "Withdraw is only available before review begins."
            ),
        }), 400

    from app.utils.helpers import get_request_json as _get
    data = _get() or {}
    reason = (data.get('reason') or '').strip()[:500] or None

    application.status = 'withdrawn'
    application.withdrawn_at = datetime.now(timezone.utc)
    if reason:
        application.withdrawal_reason = reason
    db.session.commit()

    log_action(
        'application.withdrawn', current_user.email,
        'application', application.id,
        {'reason': reason or None},
    )

    # Phase 143 — fire webhook to both NGO + donor orgs.
    try:
        from app.routes.webhook_routes import dispatch_event
        payload = {
            'application_id': application.id,
            'grant_id': application.grant_id,
            'ngo_org_id': application.ngo_org_id,
            'withdrawn': True,
            'reason': reason,
            'withdrawn_at':
                application.withdrawn_at.isoformat()
                if getattr(application, 'withdrawn_at', None) else None,
        }
        dispatch_event(application.ngo_org_id, 'application.rejected', payload)
        try:
            grant_obj = db.session.get(Grant, application.grant_id) if application.grant_id else None
            if grant_obj and grant_obj.donor_org_id:
                dispatch_event(grant_obj.donor_org_id, 'application.rejected', payload)
        except Exception:
            pass
    except Exception as e:
        logger.debug('webhook dispatch (application.withdrawn) skipped: %s', e)

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

    # Phase 40 / 41 — Hard gate on network grants: budget must meet the
    # window's direct-to-community threshold (80% single-org / 70%
    # consortium, configurable per window). Runs BEFORE we mark the
    # application submitted so a failing app stays in 'draft' for
    # revision.
    #
    # Phase 40 originally called the AI-powered classifier here (~4s
    # latency) which compounded with the rubric scorer to push /submit
    # past the 22-second mark — that broke end-to-end tests with short
    # client timeouts. Phase 41 switched to the deterministic fast
    # classifier (microseconds) so the gate decision is unblocked from
    # AI service health. The operator can still click "Run classifier"
    # on the application detail page to get the AI's verdict.
    if grant and grant.fund_window_id:
        budget_lines = application.get_budget_lines()
        if budget_lines:
            try:
                from app.models import FundWindow
                from app.services.network_ai_service import NetworkAIService
                window = db.session.get(FundWindow, grant.fund_window_id)
                single_min = (
                    float(window.direct_to_community_single_min_pct)
                    if window and window.direct_to_community_single_min_pct is not None
                    else 80.0
                )
                consortium_min = (
                    float(window.direct_to_community_consortium_min_pct)
                    if window and window.direct_to_community_consortium_min_pct is not None
                    else 70.0
                )
                elig = application.get_eligibility_responses() or {}
                is_consortium = str(elig.get('is_consortium', '')).lower() in ('yes', 'true', '1')
                gate = NetworkAIService.classify_budget_direct_to_community_fast(
                    budget_lines=budget_lines,
                    is_consortium=is_consortium,
                    threshold_single_pct=single_min,
                    threshold_consortium_pct=consortium_min,
                )
                if gate and gate.get('meets_threshold') is False:
                    threshold = (
                        gate.get('threshold_pct')
                        or (consortium_min if is_consortium else single_min)
                    )
                    return jsonify({
                        'error': 'Budget does not meet the direct-to-community threshold',
                        'gate': 'direct_to_community',
                        'gate_engine': 'fast_deterministic',
                        'threshold_pct': threshold,
                        'direct_pct': gate.get('direct_pct'),
                        'classifications': gate.get('classifications', []),
                        'summary': gate.get('summary'),
                        'success': False,
                    }), 400
            except Exception as e:
                # Soft fail: don't block submission on a transient error.
                logger.warning(
                    f"hard-gate skipped for app {app_id} (network grant): {e}"
                )
        else:
            logger.info(
                f"hard-gate: app {app_id} on network grant has no budget_lines "
                "— allowing submission with a soft warning"
            )

    # Auto-score with the legacy ScoringEngine — fast, deterministic,
    # no AI call. Runs on every grant.
    ai_score = None
    try:
        score_result = ScoringEngine.score_application(application)
        ai_score = score_result.get('overall_score')
    except Exception as e:
        logger.error(f"Auto-scoring failed for application {app_id}: {e}")

    # Phase 41 — Queue the NEAR rubric scorer as a background task for
    # network grants. The Phase 40 inline version added ~18-20s to
    # /submit (forced tool-use Claude call), which broke browser flows
    # with short client timeouts and any concurrent test runner. Now we
    # commit fast, return 200, and let the background worker populate
    # ai_rubric_result_json + override ai_score when the AI lands.
    queued_task_id = None
    if grant and grant.fund_window_id:
        try:
            from app.services.task_runner import submit_task
            # Capture the Flask app object now so the worker thread can
            # establish its own app_context (Flask globals don't cross
            # thread boundaries by themselves).
            _app_obj = current_app._get_current_object()
            queued_task_id = submit_task(
                _run_network_rubric_scorer_background,
                app=_app_obj,
                application_id=application.id,
                task_type='network_rubric_scorer',
            )
        except Exception as e:
            logger.warning(
                f"network rubric scorer queue skipped for app {app_id}: {e}"
            )

    # All mutations land in a single window right before commit so no
    # autoflush triggered by the scoring above can clobber the status
    # transition.
    application.status = 'submitted'
    application.submitted_at = datetime.now(timezone.utc)
    if ai_score is not None:
        application.ai_score = ai_score
        application.final_score = ai_score

    db.session.commit()

    log_action('application.submitted', current_user.email, 'application', application.id,
               {'grant_id': application.grant_id, 'ai_score': application.ai_score})

    # Phase 143 — outbound webhook fan-out to both the NGO's own org
    # (so they can wire downstream CRMs) and the donor org that owns the
    # grant (so they can pipe submissions into their pipeline tool).
    # Best-effort; failures don't surface to the user.
    try:
        from app.routes.webhook_routes import dispatch_event
        payload = {
            'application_id': application.id,
            'grant_id': application.grant_id,
            'ngo_org_id': application.ngo_org_id,
            'ai_score': application.ai_score,
            'submitted_at': application.submitted_at.isoformat() if application.submitted_at else None,
        }
        dispatch_event(application.ngo_org_id, 'application.submitted', payload)
        try:
            grant_obj = db.session.get(Grant, application.grant_id) if application.grant_id else None
            if grant_obj and grant_obj.donor_org_id:
                dispatch_event(grant_obj.donor_org_id, 'application.submitted', payload)
        except Exception:
            pass
    except Exception as e:
        logger.debug('webhook dispatch (application.submitted) skipped: %s', e)

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

    # Phase 29B — record the submit event for funnel analytics.
    # Best-effort: a failure here does NOT block the submit.
    try:
        from app.services.user_event_service import UserEventService
        UserEventService.record(
            user=current_user, event_name='application.submit',
            application_id=application.id,
            grant_id=application.grant_id,
            ai_score=application.ai_score,
        )
    except Exception:
        pass

    # Phase 25A — auto-assign a reviewer panel on submit so apps are
    # never sitting in queue waiting on a donor to pick reviewers.
    # Idempotent: ReviewerAutoAssignService skips already-assigned. If
    # the donor has already manually assigned, this is a no-op.
    try:
        from app.services.reviewer_auto_assign_service import (
            ReviewerAutoAssignService,
        )
        ra = ReviewerAutoAssignService.run(
            application_id=application.id,
            actor_email='system.auto_assign',
        )
        if ra.get('ok') and ra.get('assigned'):
            logger.info(
                f"auto-assigned {ra['assigned']} reviewer(s) to "
                f"app {application.id} on submit"
            )
    except Exception as _exc:  # pylint: disable=broad-except
        logger.debug(f"reviewer auto-assign on submit skipped: {_exc}")

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

    # Phase 29B — donor decision behaviour funnel event.
    try:
        from app.services.user_event_service import UserEventService
        UserEventService.record(
            user=current_user, event_name='donor.decision_recorded',
            application_id=application.id, status=application.status,
            reason_code=reason_code or None,
        )
    except Exception:
        pass

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


@applications_bp.route('/<int:app_id>/score-breakdown', methods=['GET'])
@login_required
def api_application_score_breakdown(app_id):
    """Phase 22A — per-criterion human-score decomposition.

    NGO sees aggregated panel comments + mean per criterion (no
    reviewer attribution).
    Donor/reviewer/admin see all comments.
    """
    from app.services.score_breakdown_service import ScoreBreakdownService

    application = (
        Application.query.options(db.joinedload(Application.grant))
        .filter_by(id=app_id).first()
    )
    if not application:
        return jsonify({'success': False, 'error': 'application.not_found'}), 404

    role = current_user.role
    visible = False
    if role == 'admin':
        visible = True
    elif role == 'ngo':
        visible = application.ngo_org_id == current_user.org_id
    elif role == 'donor':
        visible = bool(application.grant and application.grant.donor_org_id == current_user.org_id)
    elif role == 'reviewer':
        from app.models import Review
        visible = Review.query.filter_by(
            application_id=app_id, reviewer_user_id=current_user.id
        ).first() is not None
    if not visible:
        return jsonify({'success': False, 'error': 'auth.access_denied'}), 403

    result = ScoreBreakdownService.for_application(
        application_id=app_id, viewer_role=role,
    )
    return jsonify(result)


@applications_bp.route('/<int:app_id>/panel-calibration', methods=['GET'])
@login_required
def api_application_panel_calibration(app_id):
    """Phase 21A — variance + outlier detection across reviewers on this app.

    Visible to anyone who can see the application. NGOs benefit too —
    transparent calibration is the point.
    """
    from app.services.panel_calibration_service import PanelCalibrationService

    application = (
        Application.query.options(db.joinedload(Application.grant))
        .filter_by(id=app_id).first()
    )
    if not application:
        return jsonify({'success': False, 'error': 'application.not_found'}), 404

    role = current_user.role
    visible = False
    if role == 'admin':
        visible = True
    elif role == 'ngo':
        visible = application.ngo_org_id == current_user.org_id
    elif role == 'donor':
        visible = bool(application.grant and application.grant.donor_org_id == current_user.org_id)
    elif role == 'reviewer':
        from app.models import Review
        visible = Review.query.filter_by(
            application_id=app_id, reviewer_user_id=current_user.id
        ).first() is not None
    if not visible:
        return jsonify({'success': False, 'error': 'auth.access_denied'}), 403

    result = PanelCalibrationService.for_application(application_id=app_id)
    return jsonify(result)


@applications_bp.route('/<int:app_id>/reviewer-briefing', methods=['GET'])
@login_required
def api_reviewer_briefing(app_id):
    """Phase 20B — AI 'what to focus on' brief for reviewers/donors/admins
    before they score. Cached 10 min."""
    from app.services.reviewer_briefing_service import ReviewerBriefingService
    from app.utils.cache import _dashboard_cache

    if current_user.role not in ('reviewer', 'donor', 'admin'):
        return jsonify({'success': False, 'error': 'auth.access_denied'}), 403

    application = (
        Application.query.options(db.joinedload(Application.grant))
        .filter_by(id=app_id).first()
    )
    if not application:
        return jsonify({'success': False, 'error': 'application.not_found'}), 404

    # Reviewer can only brief on apps they're assigned to
    if current_user.role == 'reviewer':
        from app.models import Review
        own = Review.query.filter_by(
            application_id=app_id, reviewer_user_id=current_user.id
        ).first()
        if not own:
            return jsonify({'success': False, 'error': 'auth.access_denied'}), 403
    elif current_user.role == 'donor':
        if not application.grant or application.grant.donor_org_id != current_user.org_id:
            return jsonify({'success': False, 'error': 'auth.access_denied'}), 403

    cache_key = f'reviewer_briefing_{app_id}'
    cached = _dashboard_cache.get(cache_key)
    if cached is not None:
        return jsonify({'cached': True, **cached})
    result = ReviewerBriefingService.for_application(
        application_id=app_id,
        reviewer_user_id=current_user.id if current_user.role == 'reviewer' else None,
    )
    _dashboard_cache.set(cache_key, result)
    return jsonify(result)


@applications_bp.route('/<int:app_id>/timeline', methods=['GET'])
@login_required
def api_application_timeline(app_id):
    """Phase 20A — every action across this application, chronologically.

    Visibility:
      - admin: any
      - donor: app must be on their grant
      - ngo:   app must be theirs
      - reviewer: must have a Review row on this app
    """
    from app.services.application_timeline_service import ApplicationTimelineService

    application = (
        Application.query.options(db.joinedload(Application.grant))
        .filter_by(id=app_id).first()
    )
    if not application:
        return jsonify({'success': False, 'error': 'application.not_found'}), 404

    role = current_user.role
    visible = False
    if role == 'admin':
        visible = True
    elif role == 'ngo':
        visible = application.ngo_org_id == current_user.org_id
    elif role == 'donor':
        visible = bool(application.grant and application.grant.donor_org_id == current_user.org_id)
    elif role == 'reviewer':
        from app.models import Review
        visible = Review.query.filter_by(
            application_id=app_id, reviewer_user_id=current_user.id
        ).first() is not None
    if not visible:
        return jsonify({'success': False, 'error': 'auth.access_denied'}), 403

    result = ApplicationTimelineService.for_application(application_id=app_id)
    return jsonify(result)


@applications_bp.route('/<int:app_id>/auto-assign-reviewers', methods=['POST'])
@login_required
def api_application_auto_assign_reviewers(app_id):
    """Phase 24A — POST one click to auto-assign top reviewers.

    Body: { panel_size?: int (default 3, max 5) }

    Uses ReviewerMatchService (Phase 19D) for ranking + ReviewerAutoAssign
    for the writes. Skips already-assigned reviewers; idempotent across
    repeat calls.
    """
    from app.services.reviewer_auto_assign_service import ReviewerAutoAssignService

    if current_user.role not in ('donor', 'admin'):
        return jsonify({'success': False, 'error': 'auth.access_denied'}), 403

    application = (
        Application.query.options(db.joinedload(Application.grant))
        .filter_by(id=app_id).first()
    )
    if not application:
        return jsonify({'success': False, 'error': 'application.not_found'}), 404
    if current_user.role == 'donor':
        if not application.grant or application.grant.donor_org_id != current_user.org_id:
            return jsonify({'success': False, 'error': 'auth.access_denied'}), 403

    data = get_request_json() or {}
    try:
        panel_size = int(data.get('panel_size', 3))
    except (TypeError, ValueError):
        panel_size = 3

    result = ReviewerAutoAssignService.run(
        application_id=app_id, panel_size=panel_size,
        actor_email=getattr(current_user, 'email', None),
    )
    status = 200 if result.get('ok') else 400
    return jsonify({'success': result.get('ok'), **result}), status


@applications_bp.route('/<int:app_id>/suggest-reviewers', methods=['GET'])
@login_required
def api_application_suggest_reviewers(app_id):
    """Phase 19D — rank reviewers for this application by domain match,
    throughput, and depth. Donor/admin only.

    Returns top 5 (configurable via ?top=N up to 10).
    """
    from app.services.reviewer_match_service import ReviewerMatchService

    if current_user.role not in ('donor', 'admin'):
        return jsonify({'success': False, 'error': 'auth.access_denied'}), 403

    application = (
        Application.query.options(db.joinedload(Application.grant))
        .filter_by(id=app_id).first()
    )
    if not application:
        return jsonify({'success': False, 'error': 'application.not_found'}), 404
    if current_user.role == 'donor':
        if not application.grant or application.grant.donor_org_id != current_user.org_id:
            return jsonify({'success': False, 'error': 'auth.access_denied'}), 403

    try:
        top = max(1, min(10, int(request.args.get('top', 5))))
    except (TypeError, ValueError):
        top = 5

    result = ReviewerMatchService.suggest_for_application(
        application_id=app_id, top_n=top,
    )
    return jsonify(result)


@applications_bp.route('/<int:app_id>/past-wins', methods=['GET'])
@login_required
def api_application_past_wins(app_id):
    """Phase 19B — surface "from your past wins" suggestions for a
    specific criterion on the application the NGO is currently drafting.

    Query params:
      ?criterion_key=<str>   (required)
      ?criterion_label=<str> (optional, helps fuzzy match)

    Returns ranked candidates (top 3) from the NGO's own past awarded
    applications. No cross-org leakage.
    """
    from app.services.past_wins_service import PastWinsService

    application = (
        Application.query.options(db.joinedload(Application.grant))
        .filter_by(id=app_id).first()
    )
    if not application:
        return jsonify({'success': False, 'error': 'application.not_found'}), 404

    # Only the NGO that owns this application (or admin) can see their past wins
    if current_user.role == 'ngo':
        if application.ngo_org_id != current_user.org_id:
            return jsonify({'success': False, 'error': 'auth.access_denied'}), 403
    elif current_user.role != 'admin':
        return jsonify({'success': False, 'error': 'auth.access_denied'}), 403

    criterion_key = (request.args.get('criterion_key') or '').strip()
    if not criterion_key:
        return jsonify({'success': False, 'error': 'criterion_key required'}), 400
    criterion_label = (request.args.get('criterion_label') or '').strip() or None

    result = PastWinsService.for_ngo_criterion(
        ngo_org_id=application.ngo_org_id,
        criterion_key=criterion_key,
        criterion_label=criterion_label,
        exclude_application_id=app_id,
    )
    return jsonify(result)


@applications_bp.route('/debrief/insights', methods=['GET'])
@login_required
def api_debrief_insights():
    """Phase 16A — AI-narrated insight on top of the debrief rollup.

    Returns { narrative, recommended_actions[], source } where source
    is one of 'ai' | 'sparse' | 'unavailable'. Cached 10 minutes per
    (role, org, lookback) since the underlying rollup is rarely changing.
    """
    from app.services.debrief_insights_service import DebriefInsightsService
    from app.utils.cache import _dashboard_cache

    try:
        days = max(30, min(730, int(request.args.get('days', 365))))
    except (TypeError, ValueError):
        days = 365

    role = current_user.role
    if role == 'ngo':
        if not current_user.org_id:
            return jsonify({'success': False, 'error': 'NGO org required'}), 400
        cache_key = f'debrief_insights_ngo_{current_user.org_id}_{days}'
        cached = _dashboard_cache.get(cache_key)
        if cached is not None:
            return jsonify({'cached': True, **cached})
        result = DebriefInsightsService.for_ngo(
            ngo_org_id=current_user.org_id, lookback_days=days,
        )
        _dashboard_cache.set(cache_key, result)
        return jsonify(result)

    if role == 'donor':
        if not current_user.org_id:
            return jsonify({'success': False, 'error': 'Donor org required'}), 400
        cache_key = f'debrief_insights_donor_{current_user.org_id}_{days}'
        cached = _dashboard_cache.get(cache_key)
        if cached is not None:
            return jsonify({'cached': True, **cached})
        result = DebriefInsightsService.for_donor(
            donor_org_id=current_user.org_id, lookback_days=days,
        )
        _dashboard_cache.set(cache_key, result)
        return jsonify(result)

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


@applications_bp.route('/<int:app_id>/trust-profile-readiness', methods=['GET'])
@login_required
def api_application_trust_profile_readiness(app_id):
    """Phase 105 — soft Trust Profile readiness check at submit time.

    The system DELIBERATELY does not gate draft creation on Trust
    Profile completeness — NGOs can draft an application before their
    Trust Profile exists (verified at applications.py line 178+; no
    passport/trust-profile gates in api_create_application).

    This endpoint surfaces "how complete is the Trust Profile that will
    accompany this submission" as a non-blocking nudge the apply UI can
    show next to the Submit button. Donors see a more compelling
    application when the Trust Profile is fleshed out — but the
    submitter is the one who decides when to ship.

    Auth: owning NGO + admin.
    """
    application = Application.query.filter_by(id=app_id).first()
    if application is None:
        return jsonify({'success': False, 'error': 'application.not_found'}), 404
    if current_user.role == 'ngo' and application.ngo_org_id != current_user.org_id:
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    if current_user.role not in ('ngo', 'admin'):
        return jsonify({'success': False, 'error': 'forbidden'}), 403

    # Lookup the org's published Capacity Passport (the closest thing to
    # a single Trust-Profile completeness signal). If none, return a
    # gentle nudge — no submit block.
    from app.models.capacity_passport import CapacityPassport
    active = (
        CapacityPassport.query
        .filter(CapacityPassport.org_id == application.ngo_org_id)
        .filter(CapacityPassport.status == 'active')
        .order_by(CapacityPassport.published_at.desc().nullslast() if hasattr(CapacityPassport.published_at, 'desc') else CapacityPassport.id.desc())
        .first()
    )

    if active is None:
        return jsonify({
            'success': True,
            'ready': True,  # never blocks
            'state': 'no_published_passport',
            'nudge': (
                "You can submit now. Donors see a stronger application "
                "when your Trust Profile is published — consider publishing "
                "a Capacity Passport from /trust before sending."
            ),
            'cta': {'label': 'Open Trust', 'href': '/trust'},
        })

    snapshot = active.get_snapshot() or {}
    composite = snapshot.get('composite_score') or snapshot.get('composite') or None
    return jsonify({
        'success': True,
        'ready': True,
        'state': 'published',
        'passport_id': active.id,
        'composite_score': composite,
        'published_at': active.published_at.isoformat() if active.published_at else None,
    })


def _ai_pre_submit_prediction(application, criteria, responses, per_crit):
    """Phase 103 — AI-driven pre-submit prediction.

    Returns the response dict on success, or None to fall back to the
    rule-based v0. Logs the full prompt + response via replay_service so
    the audit chain can be replayed for any donor/regulator dispute.
    """
    import json as _json
    import time as _time

    from app.services.copilot_service import CopilotService
    from app.services.replay_service import log_replayable_ai_call
    from app.models.audit_chain import AuditChainEntry

    # Build a compact prompt — only criterion label/weight + the user's
    # current response. Keeps tokens manageable while giving the model
    # enough to predict a band.
    crit_block = []
    for c in criteria:
        if not isinstance(c, dict):
            continue
        key = str(c.get('key') or c.get('id') or '')
        label = c.get('label') or key
        weight = c.get('weight') or 0
        text = str(responses.get(key, '') or '').strip()
        crit_block.append({
            'key': key,
            'label': label,
            'weight': weight,
            'response': text[:1200] if text else '',
            'response_len': len(text),
        })

    user_payload = {
        'grant_title': getattr(application.grant, 'title', None),
        'grant_summary': getattr(application.grant, 'description', None) or '',
        'criteria': crit_block,
    }
    user_msg = (
        "You are previewing what a reviewer will likely see in this draft "
        "application. Predict a reviewer band, name 2 specific cheap fixes "
        "with estimated minutes, and return ONLY JSON matching the schema.\n\n"
        + _json.dumps(user_payload, ensure_ascii=False)[:7000]
    )
    schema_hint = (
        '{ "predictedBand": "Likely strong (top 25%)" | "Likely '
        'competitive" | "Borderline" | "Likely below threshold", '
        '"confidence": "high"|"medium"|"low", '
        '"overall_score_pct": number 0..100, '
        '"rationale": "1-2 sentence reviewer\'s-eye view (≤320 chars)", '
        '"fixes": [ { "fieldId": "<criterion key from input>", '
        '"label": "imperative one-liner", "estimatedMinutes": integer } ] }'
    )
    system_msg = (
        "You are a calibrated grant reviewer giving the applicant a "
        "preview. Be specific. Tie fixes to the criterion key. Never "
        "invent fields not in the criteria list."
    )

    t0 = _time.time()
    try:
        res = CopilotService._call_json(
            system_msg, user_msg, schema_hint,
            max_tokens=900, lang=(getattr(application, 'language', None) or 'en'),
        )
    except Exception:
        return None

    duration_ms = int((_time.time() - t0) * 1000)
    if not res.get('ok'):
        return None

    parsed = res.get('data') or {}
    if not isinstance(parsed, dict):
        return None
    band = parsed.get('predictedBand')
    confidence = parsed.get('confidence')
    score_pct = parsed.get('overall_score_pct')
    fixes = parsed.get('fixes') or []
    if not band or not isinstance(fixes, list):
        return None

    # Sanity-check fixes shape; drop malformed entries instead of failing.
    safe_fixes = []
    for f in fixes[:3]:
        if not isinstance(f, dict):
            continue
        label = f.get('label')
        field_id = f.get('fieldId')
        est = f.get('estimatedMinutes')
        if not label or not field_id:
            continue
        try:
            est = int(est)
        except (TypeError, ValueError):
            est = 5
        safe_fixes.append({
            'label': str(label)[:240],
            'fieldId': str(field_id)[:80],
            'estimatedMinutes': max(1, min(60, est)),
        })

    # Replay-eligible log — full prompt + response. Tagged so the admin
    # AI telemetry rollup shows it as its own surface.
    meta = res.get('meta') or {}
    call_id = log_replayable_ai_call(
        endpoint='ai-pre-submit-prediction',
        user_id=getattr(current_user, 'id', None),
        input_text=f"SYSTEM:\n{system_msg}\n\nUSER:\n{user_msg}",
        output_text=_json.dumps(parsed, ensure_ascii=False),
        model=meta.get('model'),
        tokens_in=meta.get('tokens_in'),
        tokens_out=meta.get('tokens_out'),
        duration_ms=duration_ms,
        success=True,
        subject_kind='application',
        subject_id=application.id,
    )

    # Audit chain entry so a donor dispute can resolve the exact AI call.
    try:
        AuditChainEntry.append(
            action='ai.pre_submit_prediction',
            actor_email=getattr(current_user, 'email', None),
            subject_kind='application',
            subject_id=application.id,
            details={
                'ai_call_id': call_id,
                'predictedBand': band,
                'overall_score_pct': score_pct,
                'fallback_used': bool(meta.get('fallback_used')),
                'model': meta.get('model'),
            },
        )
    except Exception:
        pass

    return {
        'success': True,
        'status': 'ready',
        'predictedBand': str(band),
        'confidence': str(confidence) if confidence else 'medium',
        'overall_score_pct': score_pct,
        'rationale': str(parsed.get('rationale') or '')[:320] or None,
        'filled': sum(1 for p in per_crit if p['response_len'] > 0),
        'total_criteria': len(per_crit),
        'fixes': safe_fixes[:2],
        'method': 'ai-v1',
        'replay': {'ai_call_id': call_id} if call_id else None,
        'meta': {
            'model': meta.get('model'),
            'fallback_used': bool(meta.get('fallback_used')),
        },
    }


@applications_bp.route('/<int:app_id>/pre-submit-preview', methods=['GET'])
@login_required
def api_application_pre_submit_preview(app_id):
    """Phase 98.7 (Wave 3) — pre-submission preview.

    Returns "what a reviewer will likely see" with a predicted band + the
    1-2 cheapest fixes that would move the score, computed from the
    application's current draft responses against the grant's criteria.

    This v0 is a rule-based heuristic — no new AI call — so it's cheap
    enough to run on every draft autosave. Wave 3 final replaces the
    heuristic with the AI prediction once the prompt is tuned.

    Auth: only the applying NGO + admin can read.
    """
    import json as _json
    application = (
        Application.query.options(db.joinedload(Application.grant))
        .filter_by(id=app_id).first()
    )
    if not application:
        return jsonify({'success': False, 'error': 'application.not_found'}), 404
    if current_user.role == 'ngo' and application.ngo_org_id != current_user.org_id:
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    if current_user.role not in ('ngo', 'admin'):
        return jsonify({'success': False, 'error': 'forbidden'}), 403

    criteria = (
        application.grant.get_criteria()
        if application.grant and hasattr(application.grant, 'get_criteria')
        else []
    )
    if not criteria:
        return jsonify({
            'success': True,
            'status': 'low-conf',
            'reason': 'no_criteria_defined',
        })

    try:
        responses = _json.loads(application.responses or '{}')
    except Exception:
        responses = {}

    # Heuristic per-criterion score: 0..1 from response length.
    # < 40 chars   → 0.10   (almost empty)
    # < 120 chars  → 0.40
    # < 400 chars  → 0.70
    # >= 400 chars → 0.90
    per_crit = []
    filled = 0
    for c in criteria:
        if not isinstance(c, dict):
            continue
        key = str(c.get('key') or c.get('id') or '')
        weight = float(c.get('weight') or 0)
        label = c.get('label') or key
        text = str(responses.get(key, '') or '').strip()
        n = len(text)
        if n == 0:
            score = 0.0
        elif n < 40:
            score = 0.10
        elif n < 120:
            score = 0.40
        elif n < 400:
            score = 0.70
        else:
            score = 0.90
        if n > 0:
            filled += 1
        per_crit.append({
            'key': key, 'label': label, 'weight': weight,
            'score': score, 'response_len': n,
        })

    if filled < max(2, len(per_crit) // 3):
        return jsonify({
            'success': True,
            'status': 'low-conf',
            'reason': 'too_few_responses_filled',
            'filled': filled,
            'total_criteria': len(per_crit),
        })

    # Phase 103 — AI prediction. Try Claude first; fall back to the
    # heuristic below on any failure (no API key, parse error,
    # transient outage). Default ON; pass ?method=heuristic to force the
    # rule-based path (used by tests + the v0 reference impl).
    method_q = request.args.get('method', 'auto')
    if method_q != 'heuristic':
        ai_resp = _ai_pre_submit_prediction(application, criteria, responses, per_crit)
        if ai_resp is not None:
            return jsonify(ai_resp)

    # Weighted overall (0..1)
    total_weight = sum(p['weight'] for p in per_crit) or 1.0
    overall = sum(p['score'] * p['weight'] for p in per_crit) / total_weight

    if overall >= 0.78:
        band = 'Likely strong (top 25%)'
        confidence = 'high'
    elif overall >= 0.60:
        band = 'Likely competitive'
        confidence = 'medium'
    elif overall >= 0.40:
        band = 'Borderline'
        confidence = 'medium'
    else:
        band = 'Likely below threshold'
        confidence = 'low'

    # Cheapest fixes — pick the 2 weighted-lowest criteria the user has
    # NOT yet filled deeply, sorted by weight × headroom desc.
    def headroom(p):
        return (0.90 - p['score']) * p['weight']
    fixes_sorted = sorted(per_crit, key=headroom, reverse=True)
    fixes = []
    for p in fixes_sorted[:3]:
        if p['score'] >= 0.85:
            continue
        # Weights here are stored as 0..100 in the criteria JSON, not 0..1.
        # Normalise so the displayed % is always 0..100.
        w = p['weight']
        w_pct = int(round(w if w > 1 else w * 100))
        if p['response_len'] == 0:
            label_text = f"Answer the «{p['label']}» question — it carries {w_pct}% of the score"
            est = 6
        elif p['response_len'] < 120:
            label_text = f"Expand «{p['label']}» — add 1-2 specifics"
            est = 4
        else:
            label_text = f"Strengthen «{p['label']}» with a concrete example"
            est = 4
        fixes.append({
            'label': label_text,
            'fieldId': p['key'],
            'estimatedMinutes': est,
        })
        if len(fixes) >= 2:
            break

    return jsonify({
        'success': True,
        'status': 'ready',
        'predictedBand': band,
        'confidence': confidence,
        'overall_score_pct': round(overall * 100, 1),
        'filled': filled,
        'total_criteria': len(per_crit),
        'fixes': fixes,
        'method': 'rule-based-v0',
    })


# ---------------------------------------------------------------------------
# Phase 99 — Predictive nudge wiring
# ---------------------------------------------------------------------------

@applications_bp.route('/<int:app_id>/predictive-nudge', methods=['GET'])
@login_required
def api_application_predictive_nudge(app_id):
    """Phase 99 — predictive nudge for the <PredictiveNudge> component.

    Computes a forward-looking estimate from the application's autosave
    state and the grant's field schema:

      - percentDone   — proportion of fields with >= some content
      - minutesLeft   — fieldsLeft × NGO's historical median minutes-per-
                        -field across their last 3 submissions, with a
                        global 3-min default for cold-start NGOs.
      - fieldsLeft    — count of unfilled criteria
      - fieldsTotal   — total criteria on the grant
      - nextTap       — { label, hint } pointing at the first unfilled
                        criterion so the nudge says exactly what to do next.

    Auth: same as pre-submit-preview (owning NGO + admin).

    Returns a status sentinel:
      ready    — usable estimate
      complete — every field has content (no nudge needed)
      no_criteria — grant has no rubric configured
    """
    import json as _json

    application = (
        Application.query.options(db.joinedload(Application.grant))
        .filter_by(id=app_id).first()
    )
    if not application:
        return jsonify({'success': False, 'error': 'application.not_found'}), 404
    if current_user.role == 'ngo' and application.ngo_org_id != current_user.org_id:
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    if current_user.role not in ('ngo', 'admin'):
        return jsonify({'success': False, 'error': 'forbidden'}), 403

    criteria = (
        application.grant.get_criteria()
        if application.grant and hasattr(application.grant, 'get_criteria')
        else []
    )
    if not criteria:
        return jsonify({'success': True, 'status': 'no_criteria'})

    try:
        responses = _json.loads(application.responses or '{}')
    except Exception:
        responses = {}

    total = 0
    filled = 0
    first_empty = None
    for c in criteria:
        if not isinstance(c, dict):
            continue
        total += 1
        key = str(c.get('key') or c.get('id') or '')
        text = str(responses.get(key, '') or '').strip()
        # "Filled" = ≥40 chars, matching the pre-submit-preview heuristic.
        if len(text) >= 40:
            filled += 1
        elif first_empty is None:
            first_empty = c

    if total == 0:
        return jsonify({'success': True, 'status': 'no_criteria'})

    fields_left = max(0, total - filled)
    pct_done = round(100 * filled / total, 1)
    if fields_left == 0:
        return jsonify({
            'success': True,
            'status': 'complete',
            'percentDone': 100.0,
            'fieldsTotal': total,
            'fieldsLeft': 0,
        })

    # Historical median minutes-per-field for this NGO. We approximate from
    # the last 3 submitted applications by the same org — created_at →
    # submitted_at delta, divided by # of criteria on that grant. If the
    # NGO has no prior submissions, fall back to the global 3-min default.
    median_minutes_per_field = _median_minutes_per_field_for_org(
        application.ngo_org_id, exclude_app_id=app_id,
    )
    minutes_left = int(round(fields_left * median_minutes_per_field))

    next_tap = None
    if first_empty is not None:
        next_tap = {
            'label': f"Answer '{first_empty.get('label') or first_empty.get('key')}'",
            'hint': str(first_empty.get('description') or '')[:200] or None,
            'criterion_key': str(first_empty.get('key') or first_empty.get('id') or ''),
        }

    return jsonify({
        'success': True,
        'status': 'ready',
        'percentDone': pct_done,
        'minutesLeft': minutes_left,
        'fieldsLeft': fields_left,
        'fieldsTotal': total,
        'nextTap': next_tap,
        'method': 'rule-based-v0',
        'minutes_per_field_basis': median_minutes_per_field,
    })


def _median_minutes_per_field_for_org(org_id, exclude_app_id=None):
    """NGO's historical minutes-per-field, computed from their last 3
    submitted applications. Returns the global 3-min default for cold
    starts."""
    if org_id is None:
        return 3.0
    try:
        q = (
            Application.query.options(db.joinedload(Application.grant))
            .filter(Application.ngo_org_id == org_id)
            .filter(Application.submitted_at.isnot(None))
        )
        if exclude_app_id:
            q = q.filter(Application.id != exclude_app_id)
        recent = q.order_by(Application.submitted_at.desc()).limit(3).all()
    except Exception:
        return 3.0
    samples = []
    for a in recent:
        if not a.submitted_at or not a.created_at:
            continue
        delta = (a.submitted_at - a.created_at).total_seconds() / 60.0
        if delta <= 0 or delta > 60 * 24 * 30:  # 30-day sanity cap
            continue
        crits = a.grant.get_criteria() if a.grant and hasattr(a.grant, 'get_criteria') else []
        n = sum(1 for c in crits if isinstance(c, dict))
        if n == 0:
            continue
        samples.append(delta / n)
    if not samples:
        return 3.0
    s = sorted(samples)
    mid = len(s) // 2
    return s[mid] if len(s) % 2 else (s[mid - 1] + s[mid]) / 2


@applications_bp.route('/compare', methods=['GET'])
@role_required('donor', 'admin', 'ngo')
def api_compare_applications():
    """Phase 203 — Side-by-side compare of 2-3 applications.

    Query: ?ids=1,2,3 (max 4)

    Returns the same criterion shape so the UI can render columns. Donor
    must own every grant the applications are tied to.
    """
    raw = request.args.get('ids', '').strip()
    if not raw:
        return jsonify({'error': 'ids is required'}), 400
    try:
        ids = [int(x) for x in raw.split(',') if x.strip()][:4]
    except (TypeError, ValueError):
        return jsonify({'error': 'ids must be a comma-separated list of integers'}), 400
    if len(ids) < 2:
        return jsonify({'error': 'Provide at least 2 application ids'}), 400

    apps = Application.query.filter(Application.id.in_(ids)).all()
    if not apps:
        return jsonify({'applications': [], 'criteria': []})

    if current_user.role == 'donor':
        for a in apps:
            g = db.session.get(Grant, a.grant_id) if a.grant_id else None
            if not g or g.donor_org_id != current_user.org_id:
                return jsonify({'error': 'Access denied'}), 403
    elif current_user.role == 'ngo':
        # Phase 273 — NGO can compare only their OWN applications.
        for a in apps:
            if a.ngo_org_id != current_user.org_id:
                return jsonify({'error': 'Access denied'}), 403

    # Take criteria from the first app's grant — assumes compare is
    # within the same grant (UI enforces). If grants differ we still
    # show whatever criteria we find on app[0].
    grant0 = db.session.get(Grant, apps[0].grant_id) if apps[0].grant_id else None
    criteria = []
    if grant0 and hasattr(grant0, 'get_criteria'):
        for c in (grant0.get_criteria() or []):
            if isinstance(c, dict):
                criteria.append({
                    'key': c.get('key'),
                    'label': c.get('label'),
                    'weight': c.get('weight'),
                })

    out_apps = []
    for a in apps:
        ngo = db.session.get(Organization, a.ngo_org_id) if a.ngo_org_id else None
        responses = a.get_responses() if hasattr(a, 'get_responses') else {}
        out_apps.append({
            'id': a.id,
            'org_name': ngo.name if ngo else 'Unknown',
            'org_country': getattr(ngo, 'country', None) if ngo else None,
            'status': a.status,
            'ai_score': a.ai_score,
            'human_score': a.human_score,
            'responses': {k: v for k, v in (responses or {}).items()},
            'submitted_at': a.submitted_at.isoformat() if a.submitted_at else None,
        })

    return jsonify({
        'success': True,
        'criteria': criteria,
        'applications': out_apps,
    })
