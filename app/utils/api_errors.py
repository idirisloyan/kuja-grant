"""
Localized API error responses.
==============================

Pattern:
    return error_response('application.not_found', 404)
    return error_response('grant.deadline_passed', 400)
    return error_response('upload.too_large', 413, max_mb=16)

Returns a JSON response with three fields:
    {
      "success": false,
      "error":   "<machine-readable code>",   # stable, English, never localized
      "message": "<human message in user's language>"
    }

The machine code (`error`) stays English because frontends, monitoring, and
test suites all key off it. The message is what the UI actually shows the
user — drawn from the canonical i18n catalog (frontend/src/i18n/<lang>.json,
keys prefixed `server.error.`). Falls back to a sensible English default
when the translation is missing so we never show users a key.

Migrating existing handlers is incremental: any route can switch to this
helper without forcing the rest. Both formats are valid response shapes.
"""

from typing import Any
from flask import jsonify

from app.utils.i18n import t


# Default English fallbacks for the most common API error codes. Used when no
# translation exists in the user's language AND no `default` arg is passed.
# Keep these terse; the i18n catalog holds the polished copy.
_DEFAULT_FALLBACKS = {
    'auth.required': 'Authentication required',
    'auth.admin_only': 'Admin access required',
    'auth.access_denied': 'Access denied',
    'auth.too_many_attempts': 'Too many login attempts. Please wait a few minutes before trying again.',
    'auth.account_locked': 'Account locked. Try again in a few minutes.',
    'auth.invalid_credentials': 'Invalid email or password.',

    'grant.not_found': 'Grant not found.',
    'grant.deadline_passed': 'The application deadline has passed.',
    'grant.not_open': 'This grant is not currently accepting applications.',
    'grant.already_applied': 'Your organization has already applied to this grant.',

    'application.not_found': 'Application not found.',
    'application.cannot_modify': 'This application can no longer be modified.',

    'review.not_found': 'Review not found.',
    'review.not_assigned': 'You are not assigned to this review.',

    'report.not_found': 'Report not found.',
    'report.already_submitted': 'Report already submitted.',

    'upload.no_file': 'No file provided.',
    'upload.empty_file': 'File is empty or too small to contain valid content.',
    'upload.too_large': 'File too large. Maximum size is {max_mb} MB.',
    'upload.unsupported_type': 'Unsupported file type ({ext}). Allowed: {allowed}.',
    'upload.pdf_no_pages': 'PDF has no pages. Please upload a valid PDF document.',
    'upload.pdf_unreadable': 'Could not read the PDF file. It may be corrupted or password-protected.',
    'upload.docx_unreadable': 'Could not read the Word document. It may be corrupted.',
    'upload.no_text': 'No readable text found. The document may be empty, scanned, or corrupted.',

    'ai.unavailable': 'AI is temporarily unavailable. Please try again in a moment.',
    'ai.rate_limited': 'Too many AI requests. Please wait a moment.',
    'ai.invalid_input': 'AI request is missing required input.',

    'validation.missing_field': '{field} is required.',
    'validation.invalid_value': '{field} value is invalid.',

    'server.unexpected': 'Something went wrong. We have logged this and will investigate.',
}


def error_response(code: str, status: int = 400, *, default: str | None = None, **params: Any):
    """Build a localized JSON error response.

    Args:
        code:    Stable machine-readable error code, e.g. 'application.not_found'.
                 Translations live under `server.error.<code>` in the i18n catalog.
        status:  HTTP status code.
        default: Optional English fallback when no translation key is registered.
        **params: Interpolation values (e.g. max_mb=16, ext='pdf').

    Returns:
        Flask response tuple: (jsonify(...), status)
    """
    i18n_key = f'server.error.{code}'
    translated = t(i18n_key, **params)

    # If the i18n lookup returned the raw key, no translation exists. Fall
    # back to the explicit default, then to our static dict, then to the code.
    if translated == i18n_key:
        fallback_template = default or _DEFAULT_FALLBACKS.get(code) or code
        translated = fallback_template
        if params:
            for k, v in params.items():
                translated = translated.replace('{' + k + '}', str(v))

    return jsonify({
        'success': False,
        'error': code,
        'message': translated,
    }), status
