"""
Grant Q&A routes — Phase 4.3
=============================
Endpoints:
  POST   /api/grants/<id>/questions         NGO asks a question
  GET    /api/grants/<id>/questions         List answered (+ own pending)
  POST   /api/grants/<gid>/questions/<qid>/answer    Donor answers
  POST   /api/grants/<gid>/questions/<qid>/moderate  Donor moderates

Visibility rules:
  - NGOs see: every answered question + their own pending questions.
    They do NOT see other NGOs' pending questions or moderated ones.
  - Donors see: every question, including pending and moderated, with
    the asker org id revealed.
  - Admins see everything.
"""

from datetime import datetime, timezone
from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user
from sqlalchemy import desc

from app.extensions import db
from app.models import Grant, GrantQuestion
from app.utils.helpers import get_request_json
from app.utils.api_errors import error_response
from app.utils.rate_limiter import ai_limiter
import logging

logger = logging.getLogger('kuja')

questions_bp = Blueprint('grant_questions', __name__, url_prefix='/api/grants')


# Auto-create the table on first use — same idempotent pattern as the
# rest of the app. Safe under concurrency: CREATE TABLE IF NOT EXISTS.
_table_ready = None


def _ensure_table():
    global _table_ready
    if _table_ready:
        return True
    try:
        from sqlalchemy import text
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS grant_questions (
                id SERIAL PRIMARY KEY,
                grant_id INT NOT NULL,
                ngo_org_id INT NOT NULL,
                asked_by_user_id INT,
                anchor_kind VARCHAR(32),
                anchor_key VARCHAR(120),
                question TEXT NOT NULL,
                answer TEXT,
                answered_by_user_id INT,
                answered_at TIMESTAMP,
                status VARCHAR(16) NOT NULL DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_grant_questions_grant "
            "ON grant_questions (grant_id, created_at DESC)"
        ))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_grant_questions_status "
            "ON grant_questions (status)"
        ))
        db.session.commit()
        _table_ready = True
        return True
    except Exception as e:
        try:
            db.session.rollback()
        except Exception:
            pass
        logger.error(f"grant_questions table create failed: {e}")
        _table_ready = False
        return False


@questions_bp.route('/<int:grant_id>/questions', methods=['POST'])
@login_required
def api_ask_question(grant_id):
    """NGO asks a question on a grant.

    Body: {"question": str, "anchor_kind"?: str, "anchor_key"?: str}
    """
    if current_user.role != 'ngo':
        return error_response('auth.access_denied', 403)

    grant = db.session.get(Grant, grant_id)
    if not grant:
        return error_response('grant.not_found', 404)

    # Light rate limit so an NGO can't flood a donor's inbox.
    rate_key = f"qa_ask_{current_user.id}"
    if ai_limiter.is_locked(rate_key):
        return error_response('ai.rate_limited', 429)
    ai_limiter.record_failure(rate_key)

    if not _ensure_table():
        return error_response('server.unexpected', 500)

    data = get_request_json() or {}
    question = (data.get('question') or '').strip()
    if not question:
        return error_response('validation.missing_field', 400, field='question')
    if len(question) > 2000:
        question = question[:2000]

    q = GrantQuestion(
        grant_id=grant_id,
        ngo_org_id=current_user.org_id,
        asked_by_user_id=current_user.id,
        anchor_kind=(data.get('anchor_kind') or None),
        anchor_key=(data.get('anchor_key') or None),
        question=question,
        status='pending',
    )
    db.session.add(q)
    db.session.commit()
    logger.info(
        f"GrantQuestion asked: grant={grant_id} ngo={current_user.org_id} "
        f"qid={q.id} anchor={q.anchor_kind}:{q.anchor_key}"
    )
    return jsonify({'success': True, 'question': q.to_dict(include_asker=False)}), 201


@questions_bp.route('/<int:grant_id>/questions', methods=['GET'])
@login_required
def api_list_questions(grant_id):
    """Visible questions for this grant (rules per role)."""
    grant = db.session.get(Grant, grant_id)
    if not grant:
        return error_response('grant.not_found', 404)

    if not _ensure_table():
        return jsonify({'success': True, 'questions': []})

    q = GrantQuestion.query.filter_by(grant_id=grant_id)

    if current_user.role == 'ngo':
        # Their own (any status) + everyone's answered.
        q = q.filter(
            (GrantQuestion.ngo_org_id == current_user.org_id)
            | (GrantQuestion.status == 'answered')
        )
        # Hide moderated rows from NGOs.
        q = q.filter(GrantQuestion.status != 'moderated')
    elif current_user.role == 'donor':
        # Donor must own the grant.
        if grant.donor_org_id != current_user.org_id:
            return error_response('auth.access_denied', 403)
    elif current_user.role not in ('admin', 'reviewer'):
        return error_response('auth.access_denied', 403)

    rows = q.order_by(desc(GrantQuestion.created_at)).limit(200).all()
    include_asker = current_user.role in ('donor', 'admin')
    return jsonify({
        'success': True,
        'questions': [r.to_dict(include_asker=include_asker) for r in rows],
    })


@questions_bp.route('/<int:grant_id>/questions/<int:qid>/answer', methods=['POST'])
@login_required
def api_answer_question(grant_id, qid):
    """Donor answers a question. Once answered, visible to ALL applicant NGOs."""
    if current_user.role not in ('donor', 'admin'):
        return error_response('auth.access_denied', 403)

    grant = db.session.get(Grant, grant_id)
    if not grant:
        return error_response('grant.not_found', 404)
    if current_user.role == 'donor' and grant.donor_org_id != current_user.org_id:
        return error_response('auth.access_denied', 403)

    if not _ensure_table():
        return error_response('server.unexpected', 500)

    q = db.session.get(GrantQuestion, qid)
    if not q or q.grant_id != grant_id:
        return error_response('validation.invalid_value', 404, field='question')

    data = get_request_json() or {}
    answer = (data.get('answer') or '').strip()
    if not answer:
        return error_response('validation.missing_field', 400, field='answer')
    if len(answer) > 4000:
        answer = answer[:4000]

    q.answer = answer
    q.answered_by_user_id = current_user.id
    q.answered_at = datetime.now(timezone.utc)
    q.status = 'answered'
    q.updated_at = datetime.now(timezone.utc)
    db.session.commit()

    logger.info(f"GrantQuestion answered: grant={grant_id} qid={qid} by user={current_user.id}")
    return jsonify({'success': True, 'question': q.to_dict(include_asker=True)})


@questions_bp.route('/<int:grant_id>/questions/<int:qid>/moderate', methods=['POST'])
@login_required
def api_moderate_question(grant_id, qid):
    """Donor / admin can hide a question from public Q&A (off-topic / spam / duplicate).

    Body: {"reason"?: str}    Reason is private (audit only); we don't display.
    """
    if current_user.role not in ('donor', 'admin'):
        return error_response('auth.access_denied', 403)

    grant = db.session.get(Grant, grant_id)
    if not grant:
        return error_response('grant.not_found', 404)
    if current_user.role == 'donor' and grant.donor_org_id != current_user.org_id:
        return error_response('auth.access_denied', 403)

    if not _ensure_table():
        return error_response('server.unexpected', 500)

    q = db.session.get(GrantQuestion, qid)
    if not q or q.grant_id != grant_id:
        return error_response('validation.invalid_value', 404, field='question')

    q.status = 'moderated'
    q.updated_at = datetime.now(timezone.utc)
    db.session.commit()

    data = get_request_json() or {}
    logger.warning(
        f"GrantQuestion moderated: grant={grant_id} qid={qid} "
        f"by user={current_user.id} reason={(data.get('reason') or '-')[:200]}"
    )
    return jsonify({'success': True, 'question': q.to_dict(include_asker=True)})
