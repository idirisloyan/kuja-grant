"""
Phase 96 — Whisper transcription endpoint.

Frontend POSTs the audio blob captured by MediaRecorder; we relay it
to OpenAI Whisper and return the transcript. Activates when
WHISPER_API_KEY is set on Railway. Otherwise returns 503 so the
frontend can fall through to its existing audio-backup + typed-input
workflow.
"""

import logging
from flask import Blueprint, jsonify, request
from flask_login import login_required

from app.services.whisper_service import (
    transcribe_audio, get_status, WHISPER_PRIMARY_LANGUAGES,
)

logger = logging.getLogger('kuja')

whisper_bp = Blueprint('whisper', __name__, url_prefix='/api/whisper')


@whisper_bp.route('/status', methods=['GET'])
@login_required
def api_whisper_status():
    """Cheap probe so frontend knows whether Whisper is available BEFORE
    uploading an audio blob."""
    return jsonify({
        'success': True,
        'status': get_status(),
        'primary_languages': sorted(WHISPER_PRIMARY_LANGUAGES),
    })


@whisper_bp.route('/transcribe', methods=['POST'])
@login_required
def api_whisper_transcribe():
    """Accept an audio file + optional language; return transcript.

    Form:
      file: audio blob (webm/ogg/mp3/wav, max 25MB)
      language: ISO-639-1 code (optional but improves accuracy)
    """
    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'file is required'}), 400

    upl = request.files['file']
    audio_bytes = upl.read()
    language = (request.form.get('language') or '').strip() or None

    result = transcribe_audio(
        audio_bytes=audio_bytes,
        language=language,
        filename=upl.filename or 'audio.webm',
    )

    if not result.get('success'):
        if result.get('status') == 'no_key':
            return jsonify({'success': False, 'error': result.get('error')}), 503
        return jsonify({'success': False, 'error': result.get('error')}), 502

    return jsonify({
        'success': True,
        'text': result.get('text', ''),
        'language': result.get('language'),
        'duration': result.get('duration'),
    })
