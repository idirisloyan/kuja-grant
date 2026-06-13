"""
Phase 96 — OpenAI Whisper transcription fallback service.

Activates when WHISPER_API_KEY environment variable is set. Provides
auto-transcription for languages Chrome's Web Speech API doesn't cover
(Somali especially; Swahili and Arabic at higher quality).

Frontend POSTs the audio blob captured by MediaRecorder; this service
relays it to Whisper and returns the transcript.

Cost: ~$0.006 per minute of audio.

If WHISPER_API_KEY is absent, get_status() returns 'no_key' and the
frontend keeps the current behaviour (audio backup + manual typing).
"""

import os
import logging
from typing import Optional

logger = logging.getLogger('kuja')

WHISPER_API_KEY = os.getenv('WHISPER_API_KEY', '')
WHISPER_MODEL = os.getenv('WHISPER_MODEL', 'whisper-1')
WHISPER_API_URL = os.getenv('WHISPER_API_URL', 'https://api.openai.com/v1/audio/transcriptions')

# Languages Whisper handles well that Chrome Web Speech doesn't.
WHISPER_PRIMARY_LANGUAGES = {'so', 'sw', 'ar'}


def get_status() -> str:
    """Return 'ok' if Whisper is reachable, 'no_key' if not configured."""
    if not WHISPER_API_KEY:
        return 'no_key'
    return 'ok'


def transcribe_audio(audio_bytes: bytes, language: Optional[str] = None,
                     filename: str = 'audio.webm') -> dict:
    """Send audio to Whisper API. Returns {text, language, success, error}.

    Args:
      audio_bytes: raw audio bytes (webm/ogg/mp3/wav all accepted).
      language: ISO-639-1 code if known (improves accuracy).
      filename: hint for the API on the format.

    Returns:
      dict with text, language (detected or supplied), success flag.
      On failure returns success=False with error string.
    """
    if not WHISPER_API_KEY:
        return {
            'success': False, 'text': '',
            'error': 'Whisper API not configured. Set WHISPER_API_KEY on Railway to enable.',
            'status': 'no_key',
        }

    if not audio_bytes or len(audio_bytes) < 1000:
        return {'success': False, 'text': '', 'error': 'audio too short'}

    # 25 MB is Whisper's hard cap. Anything bigger needs splitting.
    if len(audio_bytes) > 25 * 1024 * 1024:
        return {
            'success': False, 'text': '',
            'error': 'Audio exceeds 25 MB (Whisper limit). Record in shorter chunks.',
        }

    import time as _time
    t0 = _time.time()
    try:
        import requests
        files = {'file': (filename, audio_bytes, 'audio/webm')}
        data = {'model': WHISPER_MODEL}
        if language:
            # Whisper expects ISO-639-1 (2-letter) code.
            data['language'] = language[:2].lower()
        headers = {'Authorization': f'Bearer {WHISPER_API_KEY}'}

        resp = requests.post(
            WHISPER_API_URL, headers=headers, data=data, files=files,
            timeout=60,  # Audio uploads can be slow on weak connections
        )
        latency_ms = int((_time.time() - t0) * 1000)
        if resp.status_code != 200:
            logger.warning(f"Whisper API returned {resp.status_code}: {resp.text[:300]}")
            _record_whisper_telemetry(False, latency_ms, language,
                                      error=f'http_{resp.status_code}')
            return {
                'success': False, 'text': '',
                'error': f'Whisper API returned {resp.status_code}',
            }

        parsed = resp.json()
        _record_whisper_telemetry(True, latency_ms, language)
        return {
            'success': True,
            'text': parsed.get('text', ''),
            'language': parsed.get('language', language or 'unknown'),
            'duration': parsed.get('duration'),
        }
    except Exception as e:
        logger.error(f"Whisper transcription failed: {e}")
        _record_whisper_telemetry(False, int((_time.time() - t0) * 1000),
                                  language, error=str(e)[:200])
        return {'success': False, 'text': '', 'error': str(e)[:200]}


def _record_whisper_telemetry(success: bool, latency_ms: int,
                              language: Optional[str], error: Optional[str] = None) -> None:
    """Best-effort write to ai_call_logs so /admin/ai-telemetry sees Whisper.

    Never raises. Falls through silently if the AI logging path can't be
    reached (no app context, table missing, etc.).
    """
    try:
        from app.services.ai_service import AIService
        AIService._record_call(
            endpoint='whisper-transcribe',
            role='ngo',
            language=(language or 'unknown')[:8],
            input_tokens=0,
            output_tokens=0,
            latency_ms=latency_ms,
            success=success,
            error=error,
        )
    except Exception:
        pass
