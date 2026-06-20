"""
Phase 107 — Donor "ask about my grantees" Q&A surface.

The NGO already has the compliance coach to ask about their own grants;
this is the donor-side mirror. A donor asks free-form questions about
their portfolio ("Which of my grantees are at risk?", "Show me the
strongest reports submitted this quarter") and Kuja answers with
specific citations to grants / applications / reports the donor owns.

Auth: donor only. The endpoint enforces that every cited row belongs
to the asking donor's organization — there is no path for a donor to
ask about another donor's portfolio.

Citations: every claim is logged as an AIProvenance row tied to the
specific source (application id, report id, grant id) so the donor can
click through to verify. Phase 102 replay also covers these calls.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from app.extensions import db
from app.models.organization import Organization
from app.models.grant import Grant
from app.models.application import Application
from app.models.report import Report
from app.models.ai_provenance import AIProvenance
from app.services.copilot_service import CopilotService
from app.services.replay_service import log_replayable_ai_call

logger = logging.getLogger('kuja')

donor_portfolio_qa_bp = Blueprint('donor_portfolio_qa', __name__, url_prefix='/api/donor')


# How much portfolio context we pull into the prompt. Tuned to keep us
# well under the prompt-cache + max-token budget on a single Claude call.
PORTFOLIO_GRANT_LIMIT = 12
PORTFOLIO_APP_LIMIT = 24
PORTFOLIO_REPORT_LIMIT = 24
MAX_QUESTION_CHARS = 1000


def _build_portfolio_context(donor_org_id: int) -> tuple[dict, dict]:
    """Snapshot of the donor's portfolio + an id→row map for resolving
    the AI's citations back to live DB rows."""
    grants = (
        Grant.query
        .filter(Grant.donor_org_id == donor_org_id)
        .order_by(Grant.id.desc())
        .limit(PORTFOLIO_GRANT_LIMIT)
        .all()
    )
    grant_ids = [g.id for g in grants]

    apps: list[Application] = []
    if grant_ids:
        apps = (
            Application.query
            .filter(Application.grant_id.in_(grant_ids))
            .order_by(Application.updated_at.desc().nullslast() if hasattr(Application.updated_at, 'desc') else Application.id.desc())
            .limit(PORTFOLIO_APP_LIMIT)
            .all()
        )

    app_ids = [a.id for a in apps]
    reports: list[Report] = []
    if app_ids:
        reports = (
            Report.query
            .filter(Report.application_id.in_(app_ids))
            .order_by(Report.id.desc())
            .limit(PORTFOLIO_REPORT_LIMIT)
            .all()
        )

    # Resolve NGO org names in batch.
    ngo_org_ids = {a.ngo_org_id for a in apps if a.ngo_org_id}
    ngo_names = {}
    if ngo_org_ids:
        ngo_names = {
            o.id: o.name
            for o in Organization.query.filter(Organization.id.in_(ngo_org_ids)).all()
        }

    def _snap_grant(g):
        return {
            'id': g.id,
            'title': g.title,
            'status': g.status,
            'total_funding': float(g.total_funding) if g.total_funding is not None else None,
            'currency': g.currency,
            'deadline': g.deadline.isoformat() if g.deadline else None,
        }

    def _snap_app(a):
        return {
            'id': a.id,
            'grant_id': a.grant_id,
            'ngo_org_id': a.ngo_org_id,
            'ngo_name': ngo_names.get(a.ngo_org_id),
            'status': a.status,
            'submitted_at': a.submitted_at.isoformat() if a.submitted_at else None,
            'ai_score': float(a.ai_score) if a.ai_score is not None else None,
            'human_score': float(a.human_score) if a.human_score is not None else None,
        }

    def _snap_report(r):
        return {
            'id': r.id,
            'grant_id': r.grant_id,
            'application_id': r.application_id,
            'status': r.status,
            'submitted_at': r.submitted_at.isoformat() if r.submitted_at else None,
        }

    context = {
        'donor_org_id': donor_org_id,
        'grants': [_snap_grant(g) for g in grants],
        'applications': [_snap_app(a) for a in apps],
        'reports': [_snap_report(r) for r in reports],
    }
    id_map = {
        'grants': {g.id: g for g in grants},
        'applications': {a.id: a for a in apps},
        'reports': {r.id: r for r in reports},
    }
    return context, id_map


@donor_portfolio_qa_bp.route('/portfolio-qa', methods=['POST'])
@login_required
def api_portfolio_qa():
    """Free-form Q&A scoped to the donor's portfolio.

    Body: { question: str, lang?: 'en'|'fr'|'ar'|'sw'|'so'|'es' }

    Returns: {
      success, answer, citations: [
        { kind: 'grant'|'application'|'report', id, claim, label }
      ],
      meta: { model, tokens_in, tokens_out, duration_ms, fallback_used },
      replay: { ai_call_id }
    }
    """
    if current_user.role != 'donor':
        return jsonify({
            'success': False, 'error': 'Donor only.',
            'hint': 'Use the NGO compliance coach if you are an NGO user.',
        }), 403
    if not current_user.org_id:
        return jsonify({'success': False, 'error': 'No org associated with this user.'}), 400

    body = request.get_json(silent=True) or {}
    question = str(body.get('question') or '').strip()
    lang = str(body.get('lang') or 'en').strip()[:5]
    if not question:
        return jsonify({'success': False, 'error': 'question is required'}), 400
    if len(question) > MAX_QUESTION_CHARS:
        question = question[:MAX_QUESTION_CHARS]

    context, id_map = _build_portfolio_context(current_user.org_id)
    if not context['grants'] and not context['applications']:
        return jsonify({
            'success': True,
            'answer': (
                "Your portfolio is empty — once you publish a grant and an "
                "NGO applies, ask again."
            ),
            'citations': [],
            'meta': {'model': None, 'fallback_used': False, 'tokens_in': 0, 'tokens_out': 0},
        })

    system_msg = (
        "You are a portfolio analyst for a Kuja donor. Answer the donor's "
        "question using ONLY the portfolio snapshot below. Cite specific "
        "applications, grants, or reports by id whenever you make a claim. "
        "Be specific and short — 1 to 4 short paragraphs. Never invent "
        "data not in the snapshot. If the snapshot doesn't have enough "
        "to answer, say so plainly."
    )
    user_payload = {
        'portfolio': context,
        'question': question,
    }
    user_msg = (
        "Portfolio snapshot + the donor's question follow as JSON. Return "
        "ONLY JSON matching this schema:\n\n"
        '{ "answer": "string, 1-4 paragraphs, plain text", '
        '"citations": [ { "kind": "grant"|"application"|"report", '
        '"id": integer, "claim": "string (≤160 chars, the specific '
        'sentence your citation supports)" } ] }\n\n'
        + json.dumps(user_payload, ensure_ascii=False)[:8000]
    )

    t0 = time.time()
    res = CopilotService._call_json(
        system_msg, user_msg,
        '{ "answer": "...", "citations": [...] }',
        max_tokens=1200, lang=lang,
    )
    duration_ms = int((time.time() - t0) * 1000)
    if not res.get('ok'):
        return jsonify({
            'success': False,
            'error': res.get('code') or 'AI_FAILED',
            'message': res.get('message') or 'AI call failed.',
        }), 503

    parsed = res.get('data') or {}
    if not isinstance(parsed, dict):
        return jsonify({'success': False, 'error': 'AI response was not valid JSON.'}), 502
    answer = str(parsed.get('answer') or '').strip()[:6000]
    raw_citations = parsed.get('citations') or []

    # Resolve + safety-check citations. Drop anything that doesn't point
    # to a row we KNOW belongs to this donor (the snapshot above only
    # contains the donor's rows, so id_map enforces ownership).
    safe_citations = []
    for c in raw_citations[:24]:
        if not isinstance(c, dict):
            continue
        kind = str(c.get('kind') or '').lower()
        try:
            cid = int(c.get('id'))
        except (TypeError, ValueError):
            continue
        if kind not in ('grant', 'application', 'report'):
            continue
        bucket = 'grants' if kind == 'grant' else 'applications' if kind == 'application' else 'reports'
        row = id_map[bucket].get(cid)
        if row is None:
            continue
        claim = str(c.get('claim') or '').strip()[:160]
        label = (
            row.title if kind == 'grant'
            else f"Application #{row.id}" if kind == 'application'
            else f"Report #{row.id}"
        )
        safe_citations.append({
            'kind': kind,
            'id': cid,
            'claim': claim,
            'label': label,
        })

    # Persist with replay + per-citation provenance rows.
    meta = res.get('meta') or {}
    call_id = log_replayable_ai_call(
        endpoint='donor-portfolio-qa',
        user_id=current_user.id,
        input_text=f"SYSTEM:\n{system_msg}\n\nUSER:\n{user_msg}",
        output_text=json.dumps(parsed, ensure_ascii=False),
        model=meta.get('model'),
        tokens_in=meta.get('tokens_in'),
        tokens_out=meta.get('tokens_out'),
        duration_ms=duration_ms,
        success=True,
        subject_kind='donor_org',
        subject_id=current_user.org_id,
    )

    if call_id is not None and safe_citations:
        try:
            for c in safe_citations:
                source_kind = 'grant' if c['kind'] == 'grant' else 'application' if c['kind'] == 'application' else 'report'
                db.session.add(AIProvenance(
                    ai_call_id=call_id,
                    subject_kind='donor_org',
                    subject_id=current_user.org_id,
                    subject_field='portfolio_qa',
                    claim=c['claim'][:500] or c['label'][:500],
                    source_kind=source_kind,
                    source_id=c['id'],
                    source_locator=None,
                    source_excerpt=None,
                    confidence='medium',
                ))
            db.session.commit()
        except Exception as e:
            logger.warning('donor portfolio qa provenance log failed: %s', e)
            db.session.rollback()

    return jsonify({
        'success': True,
        'answer': answer,
        'citations': safe_citations,
        'meta': {
            'model': meta.get('model'),
            'fallback_used': bool(meta.get('fallback_used')),
            'tokens_in': meta.get('tokens_in'),
            'tokens_out': meta.get('tokens_out'),
            'duration_ms': duration_ms,
        },
        'replay': {'ai_call_id': call_id} if call_id else None,
    })
