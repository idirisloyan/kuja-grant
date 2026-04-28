"""
Diligence room routes — Phase 4.4
==================================
Donor + NGO + reviewer share a list of clarification asks for finalist
applications. Endpoints:
  POST   /api/applications/<id>/diligence            create (donor) / list (all)
  GET    /api/applications/<id>/diligence            list
  POST   /api/applications/<aid>/diligence/<id>/respond  NGO submits response
  POST   /api/applications/<aid>/diligence/<id>/close    donor accepts
"""

from datetime import datetime, timezone
from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user
from sqlalchemy import desc

from app.extensions import db
from app.models import Application, Grant, DiligenceItem
from app.utils.helpers import get_request_json
from app.utils.api_errors import error_response
import logging

logger = logging.getLogger('kuja')

diligence_bp = Blueprint('diligence', __name__, url_prefix='/api/applications')

_table_ready = None


def _ensure_table():
    global _table_ready
    if _table_ready:
        return True
    try:
        from sqlalchemy import text
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS diligence_items (
                id SERIAL PRIMARY KEY,
                application_id INT NOT NULL,
                kind VARCHAR(32) NOT NULL DEFAULT 'question',
                requested_by_user_id INT,
                prompt TEXT NOT NULL,
                response_text TEXT,
                response_document_id INT,
                responded_by_user_id INT,
                responded_at TIMESTAMP,
                status VARCHAR(16) NOT NULL DEFAULT 'open',
                due_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_diligence_app "
            "ON diligence_items (application_id, created_at)"
        ))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_diligence_status "
            "ON diligence_items (status)"
        ))
        db.session.commit()
        _table_ready = True
        return True
    except Exception as e:
        try:
            db.session.rollback()
        except Exception:
            pass
        logger.error(f"diligence_items table create failed: {e}")
        _table_ready = False
        return False


def _can_access(application):
    """NGO that owns it, donor that owns the grant, admin, or assigned reviewer."""
    if not application:
        return False
    if current_user.role == 'admin':
        return True
    if current_user.role == 'ngo' and application.ngo_org_id == current_user.org_id:
        return True
    if current_user.role == 'donor':
        grant = db.session.get(Grant, application.grant_id)
        if grant and grant.donor_org_id == current_user.org_id:
            return True
    if current_user.role == 'reviewer':
        # Reviewer can read-only if assigned.
        from app.models import Review
        rv = (Review.query.filter_by(application_id=application.id,
                                     reviewer_user_id=current_user.id)
              .first())
        if rv:
            return True
    return False


@diligence_bp.route('/<int:application_id>/diligence', methods=['GET'])
@login_required
def api_diligence_list(application_id):
    application = db.session.get(Application, application_id)
    if not application:
        return error_response('application.not_found', 404)
    if not _can_access(application):
        return error_response('auth.access_denied', 403)
    if not _ensure_table():
        return jsonify({'success': True, 'items': []})

    rows = (DiligenceItem.query
            .filter_by(application_id=application_id)
            .order_by(desc(DiligenceItem.created_at))
            .limit(200).all())
    return jsonify({'success': True, 'items': [r.to_dict() for r in rows]})


@diligence_bp.route('/<int:application_id>/diligence', methods=['POST'])
@login_required
def api_diligence_create(application_id):
    """Create a new diligence item. Donor (or admin) can ask anything; NGO
    can add 'note' kind to provide unsolicited context."""
    application = db.session.get(Application, application_id)
    if not application:
        return error_response('application.not_found', 404)
    if not _can_access(application):
        return error_response('auth.access_denied', 403)

    data = get_request_json() or {}
    kind = (data.get('kind') or 'question').strip()
    if kind not in ('question', 'document_request', 'note'):
        return error_response('validation.invalid_value', 400, field='kind')

    # NGOs may only create 'note' items; donors and admins create questions/doc requests.
    if current_user.role == 'ngo' and kind != 'note':
        return error_response('auth.access_denied', 403)
    if current_user.role == 'reviewer':
        return error_response('auth.access_denied', 403)

    prompt = (data.get('prompt') or '').strip()
    if not prompt:
        return error_response('validation.missing_field', 400, field='prompt')
    if len(prompt) > 2000:
        prompt = prompt[:2000]

    if not _ensure_table():
        return error_response('server.unexpected', 500)

    item = DiligenceItem(
        application_id=application_id,
        kind=kind,
        requested_by_user_id=current_user.id,
        prompt=prompt,
        status='open',
    )
    db.session.add(item)
    db.session.commit()

    logger.info(f"DiligenceItem created: app={application_id} kind={kind} by user={current_user.id}")
    return jsonify({'success': True, 'item': item.to_dict()}), 201


@diligence_bp.route('/<int:application_id>/diligence/<int:item_id>/respond', methods=['POST'])
@login_required
def api_diligence_respond(application_id, item_id):
    """NGO responds to a diligence ask.

    Body: {"response_text": str, "response_document_id"?: int}
    """
    application = db.session.get(Application, application_id)
    if not application:
        return error_response('application.not_found', 404)
    if current_user.role != 'ngo' or application.ngo_org_id != current_user.org_id:
        return error_response('auth.access_denied', 403)

    if not _ensure_table():
        return error_response('server.unexpected', 500)

    item = db.session.get(DiligenceItem, item_id)
    if not item or item.application_id != application_id:
        return error_response('validation.invalid_value', 404, field='item')

    data = get_request_json() or {}
    text = (data.get('response_text') or '').strip()
    doc_id = data.get('response_document_id')
    if not text and not doc_id:
        return error_response('validation.missing_field', 400, field='response_text|response_document_id')

    item.response_text = text[:4000] if text else None
    item.response_document_id = int(doc_id) if doc_id else None
    item.responded_by_user_id = current_user.id
    item.responded_at = datetime.now(timezone.utc)
    item.status = 'fulfilled'
    item.updated_at = datetime.now(timezone.utc)
    db.session.commit()

    return jsonify({'success': True, 'item': item.to_dict()})


@diligence_bp.route('/<int:application_id>/diligence/<int:item_id>/close', methods=['POST'])
@login_required
def api_diligence_close(application_id, item_id):
    """Donor accepts and closes a diligence item."""
    application = db.session.get(Application, application_id)
    if not application:
        return error_response('application.not_found', 404)
    if current_user.role not in ('donor', 'admin'):
        return error_response('auth.access_denied', 403)
    if current_user.role == 'donor':
        grant = db.session.get(Grant, application.grant_id)
        if not grant or grant.donor_org_id != current_user.org_id:
            return error_response('auth.access_denied', 403)

    if not _ensure_table():
        return error_response('server.unexpected', 500)

    item = db.session.get(DiligenceItem, item_id)
    if not item or item.application_id != application_id:
        return error_response('validation.invalid_value', 404, field='item')

    item.status = 'closed'
    item.updated_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify({'success': True, 'item': item.to_dict()})
