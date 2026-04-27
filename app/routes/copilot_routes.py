"""Kuja Co-pilot routes — Phase 2 of the category-defining upgrade.

These endpoints power the new co-pilot rail, decision-driving dashboards,
and AI-narrated charts. All return a typed JSON contract:

    { "ok": true,  "data": {...},  "meta": {...} }
    { "ok": false, "code": "...", "message": "..." }

Each route logs its invocation to AICallLog for observability.
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone, timedelta

from flask import Blueprint, request, jsonify, Response, stream_with_context
from flask_login import login_required, current_user
from sqlalchemy import func

from app.extensions import db
from app.models import (
    Grant, Application, Report, Document, Organization, User,
    Assessment, Review,
    AIThread, AIMessage,
)
from app.services.copilot_service import CopilotService, log_call
from app.utils.helpers import get_request_json
from app.utils.rate_limiter import ai_limiter
from app.utils.i18n import get_lang
import logging

logger = logging.getLogger('kuja')

copilot_bp = Blueprint('copilot', __name__, url_prefix='/api/ai')


def _user_org_id():
    """Helper: get current user's org_id (column on users table)."""
    return getattr(current_user, 'org_id', None)


def _rate_check():
    """Per-user rate limit gate. Returns Flask response on exceeded."""
    key = f"copilot_{current_user.id}"
    if ai_limiter.is_locked(key):
        return jsonify({'ok': False, 'code': 'RATE_LIMITED',
                        'message': 'Too many AI requests. Please wait a moment.'}), 429
    ai_limiter.record_failure(key)
    return None


def _app_summary_text(app):
    """Pull a short text summary from an application's responses JSON."""
    try:
        responses = app.get_responses() if hasattr(app, 'get_responses') else {}
    except Exception:
        responses = {}
    bits = []
    for k, v in (responses or {}).items():
        if isinstance(v, str) and v.strip():
            bits.append(v.strip())
        if sum(len(b) for b in bits) > 1500:
            break
    return ' | '.join(bits)[:1500]


def _app_title(app):
    """Best-effort title for an application."""
    try:
        responses = app.get_responses() if hasattr(app, 'get_responses') else {}
    except Exception:
        responses = {}
    for key in ('project_title', 'title', 'name', 'project_name'):
        if isinstance(responses.get(key), str) and responses[key].strip():
            return responses[key].strip()
    if getattr(app, 'grant', None) and app.grant.title:
        return f"Application for {app.grant.title}"
    return f"Application #{app.id}"


# ----------------------------------------------------------------------
# 1. Donor portfolio insights
# ----------------------------------------------------------------------

@copilot_bp.route('/donor-portfolio-insights', methods=['POST'])
@login_required
def api_donor_portfolio_insights():
    rate = _rate_check()
    if rate: return rate
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'ok': False, 'code': 'FORBIDDEN',
                        'message': 'Only donors / admins can request portfolio insights.'}), 403

    org_id = _user_org_id()
    if not org_id and current_user.role != 'admin':
        return jsonify({'ok': False, 'code': 'NO_DATA',
                        'message': 'No organization set on this account.'}), 400

    grant_q = Grant.query if current_user.role == 'admin' else Grant.query.filter_by(donor_org_id=org_id)
    app_q = Application.query if current_user.role == 'admin' else \
        Application.query.join(Grant, Application.grant_id == Grant.id).filter(Grant.donor_org_id == org_id)

    active_grants = grant_q.filter(Grant.status == 'active').count()
    pending_apps = app_q.filter(Application.status == 'submitted').count()
    overdue_reports = 0
    try:
        report_q = Report.query
        if current_user.role != 'admin':
            report_q = report_q.join(Grant).filter(Grant.donor_org_id == org_id)
        overdue_reports = report_q.filter(Report.status == 'overdue').count()
    except Exception:
        pass

    recent_apps = []
    for a in app_q.order_by(Application.created_at.desc()).limit(8).all():
        recent_apps.append({
            'title': _app_title(a),
            'ngo': a.ngo_org.name if getattr(a, 'ngo_org', None) else '?',
            'ai_score': float(a.ai_score) if a.ai_score is not None else None,
            'status': a.status,
            'submitted_at': a.created_at.isoformat() if a.created_at else None,
        })

    snapshot = {
        'active_grants': active_grants,
        'pending_apps': pending_apps,
        'overdue_reports': overdue_reports,
        'recent_apps': recent_apps,
    }

    t0 = time.time()
    res = CopilotService.donor_portfolio_insights(
        donor_org_id=org_id or 0, snapshot=snapshot, lang=get_lang(),
    )
    log_call(endpoint='donor-portfolio-insights', user_id=current_user.id, result=res,
             duration_ms=int((time.time() - t0) * 1000))
    return jsonify(res)


# ----------------------------------------------------------------------
# 2. Donor grant co-pilot (design assistance)
# ----------------------------------------------------------------------

@copilot_bp.route('/donor-grant-copilot', methods=['POST'])
@login_required
def api_donor_grant_copilot():
    rate = _rate_check()
    if rate: return rate
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'ok': False, 'code': 'FORBIDDEN',
                        'message': 'Only donors / admins can use the grant co-pilot.'}), 403

    data = get_request_json()
    goal = (data.get('goal') or '').strip()
    if not goal:
        return jsonify({'ok': False, 'code': 'BAD_REQUEST',
                        'message': 'A grant goal is required.'}), 400

    t0 = time.time()
    res = CopilotService.donor_grant_copilot(
        goal=goal,
        thematic=(data.get('thematic') or '').strip(),
        geography=(data.get('geography') or '').strip(),
        budget_usd=data.get('budget_usd'),
        draft=data.get('draft'),
        lang=get_lang(),
    )
    log_call(endpoint='donor-grant-copilot', user_id=current_user.id, result=res,
             duration_ms=int((time.time() - t0) * 1000))
    return jsonify(res)


# ----------------------------------------------------------------------
# 3. NGO holistic readiness
# ----------------------------------------------------------------------

@copilot_bp.route('/ngo-readiness', methods=['POST'])
@login_required
def api_ngo_readiness():
    rate = _rate_check()
    if rate: return rate
    if current_user.role not in ('ngo', 'admin'):
        return jsonify({'ok': False, 'code': 'FORBIDDEN',
                        'message': 'Only NGOs / admins can request readiness coaching.'}), 403

    org = current_user.organization
    if not org:
        return jsonify({'ok': False, 'code': 'NO_DATA',
                        'message': 'No organization found for this user.'}), 400

    org_summary = {
        'name': org.name,
        'country': getattr(org, 'country', None),
        'sector': getattr(org, 'sector', None),
        'description': (getattr(org, 'description', '') or '')[:600],
        'capacity_score': getattr(org, 'capacity_score', None),
    }

    recent_apps = []
    for a in Application.query.filter_by(ngo_org_id=org.id).order_by(
        Application.created_at.desc()
    ).limit(6).all():
        recent_apps.append({
            'title': _app_title(a),
            'status': a.status,
            'ai_score': float(a.ai_score) if a.ai_score is not None else None,
            'submitted_at': a.created_at.isoformat() if a.created_at else None,
        })

    # Documents are attached to applications, not directly to orgs.
    # Pull docs via this org's applications.
    docs = (Document.query
            .join(Application, Document.application_id == Application.id)
            .filter(Application.ngo_org_id == org.id)
            .order_by(Document.uploaded_at.desc())
            .limit(20).all())
    documents_present = [{
        'name': d.original_filename,
        'type': d.doc_type or 'other',
        'uploaded_at': d.uploaded_at.isoformat() if d.uploaded_at else None,
    } for d in docs]

    # Pending/overdue reports — feed them to the AI so "submit your overdue
    # X report" becomes a concrete action_type=submit_report next_action.
    pending_reports = []
    try:
        rep_q = (Report.query
                 .filter(Report.submitted_by_org_id == org.id)
                 .filter(Report.status.in_(('draft', 'submitted', 'revision_requested')))
                 .order_by(Report.due_date.asc().nullslast())
                 .limit(10).all())
        for r in rep_q:
            pending_reports.append({
                'id': r.id,
                'title': r.title,
                'status': r.status,
                'due_date': r.due_date.isoformat() if r.due_date else None,
            })
    except Exception as e:
        logger.warning(f"Failed to load pending reports for ngo_readiness: {e}")

    t0 = time.time()
    res = CopilotService.ngo_readiness(
        org_summary=org_summary, recent_apps=recent_apps,
        documents_present=documents_present,
        pending_reports=pending_reports, lang=get_lang(),
    )
    log_call(endpoint='ngo-readiness', user_id=current_user.id, result=res,
             duration_ms=int((time.time() - t0) * 1000))
    return jsonify(res)


# ----------------------------------------------------------------------
# 4. Reviewer recommendation
# ----------------------------------------------------------------------

@copilot_bp.route('/reviewer-recommendation', methods=['POST'])
@login_required
def api_reviewer_recommendation():
    rate = _rate_check()
    if rate: return rate
    if current_user.role not in ('reviewer', 'admin'):
        return jsonify({'ok': False, 'code': 'FORBIDDEN',
                        'message': 'Only reviewers / admins can use this.'}), 403

    data = get_request_json()
    app_ids = data.get('application_ids') or []
    if not app_ids:
        return jsonify({'ok': False, 'code': 'NO_DATA',
                        'message': 'Provide application_ids to compare.'}), 400

    apps = Application.query.filter(Application.id.in_(app_ids)).all()
    if not apps:
        return jsonify({'ok': False, 'code': 'NO_DATA',
                        'message': 'No matching applications.'}), 404

    payload_apps = [{
        'id': a.id,
        'title': _app_title(a),
        'ngo': a.ngo_org.name if getattr(a, 'ngo_org', None) else '?',
        'ai_score': float(a.ai_score) if a.ai_score is not None else None,
        'summary': _app_summary_text(a),
    } for a in apps]

    rubric = data.get('rubric') or [
        {'criterion': 'Strategic alignment', 'weight': 25},
        {'criterion': 'Technical quality',   'weight': 25},
        {'criterion': 'Capacity to deliver', 'weight': 20},
        {'criterion': 'Cost-effectiveness',  'weight': 15},
        {'criterion': 'Risk management',     'weight': 15},
    ]

    t0 = time.time()
    res = CopilotService.reviewer_recommendation(
        applications=payload_apps, rubric=rubric, lang=get_lang(),
    )
    log_call(endpoint='reviewer-recommendation', user_id=current_user.id, result=res,
             duration_ms=int((time.time() - t0) * 1000))
    return jsonify(res)


# ----------------------------------------------------------------------
# 5. Cross-grant patterns
# ----------------------------------------------------------------------

@copilot_bp.route('/cross-grant-patterns', methods=['POST'])
@login_required
def api_cross_grant_patterns():
    rate = _rate_check()
    if rate: return rate
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'ok': False, 'code': 'FORBIDDEN',
                        'message': 'Only donors / admins.'}), 403

    org_id = _user_org_id()
    declined_q = Application.query.join(Grant, Application.grant_id == Grant.id).filter(
        Application.status == 'rejected',
    )
    if current_user.role != 'admin' and org_id:
        declined_q = declined_q.filter(Grant.donor_org_id == org_id)
    declined = declined_q.order_by(Application.created_at.desc()).limit(40).all()

    payload = [{
        'id': a.id,
        'title': _app_title(a),
        'ngo': a.ngo_org.name if getattr(a, 'ngo_org', None) else '?',
        'summary': _app_summary_text(a),
        'ai_score': float(a.ai_score) if a.ai_score is not None else None,
    } for a in declined]

    if not payload:
        return jsonify({'ok': True, 'data': {'patterns': [], 'summary': 'No declined applications yet.'},
                        'meta': {}})

    t0 = time.time()
    res = CopilotService.cross_grant_patterns(declined_apps=payload, lang=get_lang())
    log_call(endpoint='cross-grant-patterns', user_id=current_user.id, result=res,
             duration_ms=int((time.time() - t0) * 1000))
    return jsonify(res)


# ----------------------------------------------------------------------
# 6. Insight narration (universal chart caption)
# ----------------------------------------------------------------------

@copilot_bp.route('/insight-narrate', methods=['POST'])
@login_required
def api_insight_narrate():
    rate = _rate_check()
    if rate: return rate

    data = get_request_json()
    chart_type = (data.get('chart_type') or '').strip()
    chart_data = data.get('data')
    context = (data.get('context') or '').strip()
    if not chart_type or chart_data is None:
        return jsonify({'ok': False, 'code': 'BAD_REQUEST',
                        'message': 'chart_type and data are required.'}), 400

    t0 = time.time()
    res = CopilotService.insight_narrate(
        chart_type=chart_type, data=chart_data, context=context, lang=get_lang(),
    )
    log_call(endpoint='insight-narrate', user_id=current_user.id, result=res,
             duration_ms=int((time.time() - t0) * 1000))
    return jsonify(res)


# ----------------------------------------------------------------------
# 7. Page-aware suggestions (Co-pilot Now tab)
# ----------------------------------------------------------------------

@copilot_bp.route('/suggestions', methods=['POST'])
@login_required
def api_suggestions():
    rate = _rate_check()
    if rate: return rate

    data = get_request_json()
    role = data.get('role') or current_user.role
    scope = data.get('scope') or {'kind': 'global'}

    org_id = _user_org_id()
    page_state = {}
    try:
        if role in ('donor', 'admin') and org_id:
            page_state['active_grants'] = Grant.query.filter_by(
                donor_org_id=org_id, status='active').count()
            page_state['pending_apps'] = Application.query.join(Grant).filter(
                Grant.donor_org_id == org_id, Application.status == 'submitted',
            ).count()
        elif role == 'ngo' and org_id:
            page_state['my_apps_in_progress'] = Application.query.filter_by(
                ngo_org_id=org_id, status='draft').count()
            page_state['my_apps_submitted'] = Application.query.filter_by(
                ngo_org_id=org_id, status='submitted').count()
        elif role == 'reviewer':
            page_state['queued_reviews'] = Review.query.filter_by(
                reviewer_id=current_user.id, status='pending').count() if hasattr(Review, 'status') else 0
    except Exception as e:
        logger.warning(f"page_state build failed (non-fatal): {e}")

    t0 = time.time()
    res = CopilotService.context_suggestions(
        role=role, scope=scope, page_state=page_state, lang=get_lang(),
    )
    log_call(endpoint='suggestions', user_id=current_user.id, result=res,
             duration_ms=int((time.time() - t0) * 1000))
    return jsonify(res)


# ----------------------------------------------------------------------
# 8. Streaming chat
# ----------------------------------------------------------------------

@copilot_bp.route('/chat-stream', methods=['POST'])
@login_required
def api_chat_stream():
    """SSE-style streaming chat. Yields newline-delimited JSON frames."""
    rate = _rate_check()
    if rate: return rate

    data = get_request_json()
    question = (data.get('question') or '').strip()
    if not question:
        return jsonify({'ok': False, 'code': 'BAD_REQUEST',
                        'message': 'question is required.'}), 400
    if len(question) > 4000:
        question = question[:4000]

    scope = data.get('scope') or {'kind': 'global'}
    thread_id = data.get('thread_id')
    lang = get_lang()

    sources = _retrieve_sources(scope=scope, user=current_user)

    thread = None
    if thread_id:
        thread = AIThread.query.filter_by(id=thread_id, user_id=current_user.id).first()
    if not thread:
        thread = AIThread(
            user_id=current_user.id,
            scope_kind=scope.get('kind'),
            scope_id=scope.get('id'),
            title=question[:140],
        )
        db.session.add(thread)
        db.session.commit()
    db.session.add(AIMessage(thread_id=thread.id, role='user', content=question))
    db.session.commit()

    prior = [{'role': m.role, 'content': m.content}
             for m in thread.messages.order_by(AIMessage.created_at.asc()).all()]
    thread_pk = thread.id  # captured for closure
    user_id = current_user.id
    user_role = getattr(current_user, 'role', None)

    @stream_with_context
    def gen():
        full_answer = ''
        meta = {}
        try:
            for frame in CopilotService.chat_stream(
                question=question, scope=scope, prior_messages=prior,
                sources=sources, lang=lang, role=user_role,
            ):
                if frame.get('type') == 'delta':
                    full_answer += frame.get('text') or ''
                if frame.get('type') == 'done':
                    meta = {k: v for k, v in frame.items() if k != 'type'}
                    try:
                        from app.extensions import db as _db
                        _db.session.add(AIMessage(
                            thread_id=thread_pk, role='assistant', content=full_answer,
                            tokens_in=meta.get('input_tokens'),
                            tokens_out=meta.get('output_tokens'),
                            model=meta.get('model'),
                        ))
                        _db.session.commit()
                    except Exception as e:
                        logger.warning(f"thread persist failed (non-fatal): {e}")
                    log_call(endpoint='chat-stream', user_id=user_id,
                             result={'ok': True, 'meta': {
                                 'tokens_in': meta.get('input_tokens'),
                                 'tokens_out': meta.get('output_tokens'),
                                 'model': meta.get('model'),
                             }})
                    frame = {**frame, 'thread_id': thread_pk}
                if frame.get('type') == 'error':
                    log_call(endpoint='chat-stream', user_id=user_id,
                             result={'ok': False, 'code': 'AI_FAILED',
                                     'message': frame.get('message', 'stream error')})
                yield json.dumps(frame) + '\n'
        except Exception as e:
            logger.exception("chat-stream loop crashed")
            yield json.dumps({'type': 'error', 'message': str(e)[:200]}) + '\n'

    return Response(gen(), mimetype='application/x-ndjson')


def _retrieve_sources(*, scope: dict, user) -> list:
    """Tiny retrieval — pulls 3-8 documents relevant to the scope."""
    out = []
    kind = scope.get('kind') or 'global'
    org_id = getattr(user, 'org_id', None)

    if kind in ('global', 'grant'):
        if user.role in ('donor', 'admin') and org_id:
            grants = Grant.query.filter_by(donor_org_id=org_id).order_by(
                Grant.created_at.desc()).limit(6).all()
        else:
            grants = Grant.query.filter_by(status='active').order_by(
                Grant.created_at.desc()).limit(6).all()
        for g in grants:
            out.append({
                'doc_id': f"{g.id:08x}-0000-0000-0000-000000000001",
                'kind': 'grant',
                'title': g.title or f"Grant #{g.id}",
                'reference': f"GRANT-{g.id}",
                'href': f"#grant/{g.id}",
                'body': (getattr(g, 'description', '') or '')[:3000],
            })

    if kind in ('global', 'application'):
        if user.role == 'ngo' and org_id:
            apps = Application.query.filter_by(ngo_org_id=org_id).order_by(
                Application.created_at.desc()).limit(4).all()
        else:
            apps = Application.query.order_by(Application.created_at.desc()).limit(4).all()
        for a in apps:
            out.append({
                'doc_id': f"{a.id:08x}-0000-0000-0000-000000000002",
                'kind': 'application',
                'title': _app_title(a),
                'reference': f"APP-{a.id}",
                'href': f"#application/{a.id}",
                'body': _app_summary_text(a),
            })

    return out


# ----------------------------------------------------------------------
# 9. Thread management
# ----------------------------------------------------------------------

@copilot_bp.route('/threads', methods=['GET'])
@login_required
def api_threads_list():
    rows = AIThread.query.filter_by(user_id=current_user.id).order_by(
        AIThread.updated_at.desc()).limit(30).all()
    return jsonify({'ok': True, 'data': {'threads': [t.to_dict() for t in rows]}})


@copilot_bp.route('/threads/<int:thread_id>', methods=['GET'])
@login_required
def api_thread_get(thread_id):
    t = AIThread.query.filter_by(id=thread_id, user_id=current_user.id).first()
    if not t:
        return jsonify({'ok': False, 'code': 'NOT_FOUND', 'message': 'Thread not found.'}), 404
    return jsonify({'ok': True, 'data': t.to_dict(include_messages=True)})


# ----------------------------------------------------------------------
# 10. AI health endpoint (admin only)
# ----------------------------------------------------------------------

@copilot_bp.route('/health', methods=['GET'])
@login_required
def api_ai_health():
    """Lightweight 24h rollup. Kept for the existing admin AI health card."""
    if current_user.role != 'admin':
        return jsonify({'ok': False, 'code': 'FORBIDDEN', 'message': 'Admin only.'}), 403
    from app.models import AICallLog
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    rows = AICallLog.query.filter(AICallLog.created_at >= cutoff).all()
    total = len(rows)
    success = sum(1 for r in rows if r.success)
    by_endpoint = {}
    for r in rows:
        by_endpoint.setdefault(r.endpoint, {'total': 0, 'success': 0, 'tokens_in': 0, 'tokens_out': 0})
        by_endpoint[r.endpoint]['total'] += 1
        if r.success:
            by_endpoint[r.endpoint]['success'] += 1
        by_endpoint[r.endpoint]['tokens_in'] += (r.tokens_in or 0)
        by_endpoint[r.endpoint]['tokens_out'] += (r.tokens_out or 0)
    return jsonify({'ok': True, 'data': {
        'window_hours': 24,
        'total_calls': total,
        'success_rate_pct': round((success / total) * 100, 1) if total else None,
        'by_endpoint': by_endpoint,
    }})


@copilot_bp.route('/observability', methods=['GET'])
@login_required
def api_ai_observability():
    """Deep AI observability: time-series, latency percentiles, error
    breakdown, recent failures, top users. Powers the admin observability
    page so problems can be diagnosed without dropping into the database.
    Admin only.
    """
    if current_user.role != 'admin':
        return jsonify({'ok': False, 'code': 'FORBIDDEN', 'message': 'Admin only.'}), 403

    from app.models import AICallLog, User
    now = datetime.now(timezone.utc)
    h24 = now - timedelta(hours=24)
    d7  = now - timedelta(days=7)

    # 24h dataset for percentiles + by_endpoint
    rows_24h = AICallLog.query.filter(AICallLog.created_at >= h24).all()
    total_24h = len(rows_24h)
    success_24h = sum(1 for r in rows_24h if r.success)
    tokens_in_24h = sum((r.tokens_in or 0) for r in rows_24h)
    tokens_out_24h = sum((r.tokens_out or 0) for r in rows_24h)

    # Per-endpoint latency percentiles + success rate (last 24h)
    by_endpoint = {}
    for r in rows_24h:
        ep = by_endpoint.setdefault(r.endpoint, {
            'total': 0, 'success': 0, 'failures': 0,
            'tokens_in': 0, 'tokens_out': 0, '_latencies': [],
        })
        ep['total'] += 1
        if r.success:
            ep['success'] += 1
        else:
            ep['failures'] += 1
        ep['tokens_in'] += (r.tokens_in or 0)
        ep['tokens_out'] += (r.tokens_out or 0)
        if r.duration_ms is not None:
            ep['_latencies'].append(r.duration_ms)

    def _pct(values, q):
        if not values:
            return None
        s = sorted(values)
        idx = max(0, min(len(s) - 1, int(round((q / 100.0) * (len(s) - 1)))))
        return s[idx]

    for ep_name, ep in by_endpoint.items():
        lats = ep.pop('_latencies')
        ep['latency_p50_ms'] = _pct(lats, 50)
        ep['latency_p95_ms'] = _pct(lats, 95)
        ep['latency_p99_ms'] = _pct(lats, 99)
        ep['success_rate_pct'] = round((ep['success'] / ep['total']) * 100, 1) if ep['total'] else None

    # 7-day daily time-series (for trend chart)
    rows_7d = AICallLog.query.filter(AICallLog.created_at >= d7).all()
    daily = {}
    for r in rows_7d:
        # Bucket by UTC day
        day_key = r.created_at.date().isoformat() if r.created_at else None
        if not day_key:
            continue
        b = daily.setdefault(day_key, {'date': day_key, 'total': 0, 'success': 0, 'tokens_out': 0})
        b['total'] += 1
        if r.success:
            b['success'] += 1
        b['tokens_out'] += (r.tokens_out or 0)
    daily_series = sorted(daily.values(), key=lambda x: x['date'])

    # Top error_codes (last 24h)
    error_buckets = {}
    for r in rows_24h:
        if r.success or not r.error_code:
            continue
        eb = error_buckets.setdefault(r.error_code, {
            'error_code': r.error_code, 'count': 0, 'sample_message': None,
        })
        eb['count'] += 1
        if not eb['sample_message'] and r.error_message:
            eb['sample_message'] = r.error_message[:200]
    top_errors = sorted(error_buckets.values(), key=lambda x: x['count'], reverse=True)[:10]

    # Last 20 failures with full context
    recent_failures_q = (AICallLog.query
                         .filter(AICallLog.success == False)  # noqa: E712
                         .order_by(AICallLog.created_at.desc())
                         .limit(20).all())
    recent_failures = [{
        'endpoint': r.endpoint,
        'user_id': r.user_id,
        'duration_ms': r.duration_ms,
        'error_code': r.error_code,
        'error_message': (r.error_message or '')[:240] if r.error_message else None,
        'created_at': r.created_at.isoformat() if r.created_at else None,
    } for r in recent_failures_q]

    # Top users (24h) — surface heavy AI users
    user_buckets = {}
    for r in rows_24h:
        if not r.user_id:
            continue
        ub = user_buckets.setdefault(r.user_id, {
            'user_id': r.user_id, 'calls': 0, 'tokens_out': 0, 'failures': 0,
        })
        ub['calls'] += 1
        ub['tokens_out'] += (r.tokens_out or 0)
        if not r.success:
            ub['failures'] += 1
    top_user_ids = sorted(user_buckets.values(), key=lambda x: x['calls'], reverse=True)[:10]
    user_emails = {}
    if top_user_ids:
        ids = [u['user_id'] for u in top_user_ids]
        for u in User.query.filter(User.id.in_(ids)).all():
            user_emails[u.id] = {'email': u.email, 'role': u.role}
    for ub in top_user_ids:
        info = user_emails.get(ub['user_id']) or {}
        ub['email'] = info.get('email')
        ub['role'] = info.get('role')

    # Anomaly detection: endpoints whose 24h call count has dropped
    # 80%+ vs. their 6-day prior average (catches regressions silently
    # disabling a feature). Also flags p95 latency that doubled.
    rows_prior = AICallLog.query.filter(
        AICallLog.created_at >= d7, AICallLog.created_at < h24,
    ).all()
    prior_per_ep_count = {}
    prior_per_ep_lat = {}
    for r in rows_prior:
        prior_per_ep_count[r.endpoint] = prior_per_ep_count.get(r.endpoint, 0) + 1
        if r.duration_ms is not None:
            prior_per_ep_lat.setdefault(r.endpoint, []).append(r.duration_ms)
    anomalies = []
    for ep_name, ep in by_endpoint.items():
        prior_count = prior_per_ep_count.get(ep_name, 0)
        prior_avg_per_day = prior_count / 6.0 if prior_count else 0
        if prior_avg_per_day >= 5 and ep['total'] < prior_avg_per_day * 0.2:
            anomalies.append({
                'endpoint': ep_name,
                'kind': 'volume_drop',
                'detail': f'24h calls={ep["total"]} vs prior 6-day avg={round(prior_avg_per_day,1)}/day — possible silent failure',
            })
        prior_lats = prior_per_ep_lat.get(ep_name) or []
        prior_p95 = _pct(prior_lats, 95)
        if prior_p95 and ep.get('latency_p95_ms') and ep['latency_p95_ms'] > prior_p95 * 2:
            anomalies.append({
                'endpoint': ep_name,
                'kind': 'latency_spike',
                'detail': f'p95 {ep["latency_p95_ms"]}ms vs prior {prior_p95}ms (>2x)',
            })
        if ep.get('success_rate_pct') is not None and ep['success_rate_pct'] < 80 and ep['total'] >= 5:
            anomalies.append({
                'endpoint': ep_name,
                'kind': 'low_success_rate',
                'detail': f'24h success rate {ep["success_rate_pct"]}% on {ep["total"]} calls',
            })

    return jsonify({'ok': True, 'data': {
        'generated_at': now.isoformat(),
        'window_hours': 24,
        'summary_24h': {
            'total_calls': total_24h,
            'success_rate_pct': round((success_24h / total_24h) * 100, 1) if total_24h else None,
            'failures': total_24h - success_24h,
            'tokens_in': tokens_in_24h,
            'tokens_out': tokens_out_24h,
        },
        'by_endpoint': by_endpoint,
        'daily_series_7d': daily_series,
        'top_errors_24h': top_errors,
        'recent_failures': recent_failures,
        'top_users_24h': top_user_ids,
        'anomalies': anomalies,
    }})
