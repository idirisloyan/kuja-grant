"""
Document search routes — Phase 9.

Blueprint prefix: /api/documents
Routes:
  GET /api/documents/search?q=<query>   - cross-document ILIKE search,
                                          scoped to caller's visibility
  GET /api/documents/search/global       - cross-entity search

Phase 28A also registers a second blueprint at /api/search as an alias
for the global search, because the team's 2026-05-16 retest expected
that path. The UI's command palette uses /api/documents/search/global
under the hood; the alias is for direct API discoverability.
"""

import logging

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from app.services.document_search_service import DocumentSearchService

logger = logging.getLogger('kuja')

doc_search_bp = Blueprint('doc_search', __name__, url_prefix='/api/documents')

# Phase 28A — clean top-level alias for global search.
search_alias_bp = Blueprint('search_alias', __name__, url_prefix='/api')


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


@doc_search_bp.route('/search/global', methods=['GET'])
@login_required
def api_global_search():
    """Phase 22B — cross-entity search across grants, applications,
    reports, and documents (all role-scoped).

    Query params:
      q: required, minimum 3 characters
    """
    from app.services.global_search_service import GlobalSearchService
    q = (request.args.get('q') or '').strip()
    result = GlobalSearchService.search(query=q, user=current_user)
    return jsonify(result)


# Phase 28A — top-level alias so /api/search?q=kenya works as the team
# expected during the 2026-05-16 retest. Forwards to the same service.
@search_alias_bp.route('/search', methods=['GET'])
@login_required
def api_search_alias():
    """Alias for /api/documents/search/global — top-level discoverability.

    The UI's command palette already calls the namespaced path; this
    alias exists so direct API callers and integration tests find a
    sensible /api/search endpoint.
    """
    from app.services.global_search_service import GlobalSearchService
    q = (request.args.get('q') or '').strip()
    result = GlobalSearchService.search(query=q, user=current_user)

    # Phase 29B — record search usage so we can see which features
    # users discover via search vs the sidebar nav.
    try:
        from app.services.user_event_service import UserEventService
        results = result.get('results') if isinstance(result, dict) else None
        UserEventService.record(
            user=current_user, event_name='search.query',
            query_length=len(q),
            result_count=len(results) if isinstance(results, list) else 0,
        )
    except Exception:
        pass

    return jsonify(result)
