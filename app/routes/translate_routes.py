"""
Phase 78 — AI content translation route.

POST /api/translate
  body: { text, target_language, source_language?, domain? }
  returns: { translated, source_language, target_language, fidelity, notes,
             ai_used }

Auth: any authenticated user (translation is read-only and not tenant-
scoped — it's a utility surface). Rate-limited by the global SecurityService
if a 'translate' bucket exists; otherwise relies on standard auth.
"""

import logging
from flask import Blueprint, request, jsonify
from flask_login import login_required

from app.utils.helpers import get_request_json
from app.services.ai_service import AIService

logger = logging.getLogger('kuja')

translate_bp = Blueprint('translate', __name__, url_prefix='/api')

SUPPORTED = {'en', 'fr', 'ar', 'sw', 'so', 'es'}


@translate_bp.route('/translate', methods=['POST'])
@login_required
def api_translate():
    data = get_request_json() or {}
    text = (data.get('text') or '').strip()
    target = (data.get('target_language') or '').lower()[:2]
    source = (data.get('source_language') or None)
    domain = (data.get('domain') or 'grant').lower().strip()

    if not text:
        return jsonify({'success': False, 'error': 'text is required'}), 400
    if target not in SUPPORTED:
        return jsonify({
            'success': False,
            'error': f'target_language must be one of {sorted(SUPPORTED)}',
        }), 400
    if len(text) > 8000:
        text = text[:8000]

    try:
        result = AIService.translate_text(
            text=text, target_language=target,
            source_language=source, domain=domain,
        )
    except Exception as e:
        logger.error(f'translate failed: {e}')
        return jsonify({'success': False,
                        'error': 'Translation is temporarily unavailable.'}), 502

    return jsonify({'success': True, **result})
