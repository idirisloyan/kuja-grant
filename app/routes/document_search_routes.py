"""
Document search routes — Phase 9.

Blueprint prefix: /api/documents
Routes:
  GET /api/documents/search?q=<query>   - cross-document ILIKE search,
                                          scoped to caller's visibility
"""

import logging

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from app.services.document_search_service import DocumentSearchService

logger = logging.getLogger('kuja')

doc_search_bp = Blueprint('doc_search', __name__, url_prefix='/api/documents')


@doc_search_bp.route('/search', methods=['GET'])
@login_required
def api_document_search():
    """Search across documents the caller can see.

    Query params:
      q: required, minimum 2 characters
    """
    q = (request.args.get('q') or '').strip()
    if len(q) < 2:
        return jsonify({
            'success': True, 'query': q,
            'total': 0, 'hits': [],
            'message': 'Type at least 2 characters to search.',
        })
    result = DocumentSearchService.search(query=q, user=current_user)
    return jsonify({'success': True, **result})
