"""
WebAuthn routes — Phase 26C (May 2026).

Routes:
  GET    /api/auth/webauthn/credentials             — list user's registered credentials
  POST   /api/auth/webauthn/register/begin          — issue registration challenge
  POST   /api/auth/webauthn/register/finish         — verify attestation + store credential
  POST   /api/auth/webauthn/authenticate/begin      — issue auth challenge
  POST   /api/auth/webauthn/authenticate/finish     — verify assertion + return re-auth token
  DELETE /api/auth/webauthn/credentials/<id>        — revoke a credential

The re-auth token returned by /authenticate/finish is short-lived
(5 min, single-use). Sensitive endpoints can require it via the
`X-Reauth-Token` header — see require_reauth() helper.
"""

import logging

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from app.utils.helpers import get_request_json

logger = logging.getLogger('kuja')

webauthn_bp = Blueprint('webauthn', __name__, url_prefix='/api/auth/webauthn')


@webauthn_bp.route('/credentials', methods=['GET'])
@login_required
def api_webauthn_list():
    from app.services.webauthn_service import WebAuthnService
    return jsonify({
        'success': True,
        'credentials': WebAuthnService.list_credentials(user=current_user),
    })


@webauthn_bp.route('/credentials/<int:credential_db_id>', methods=['DELETE'])
@login_required
def api_webauthn_revoke(credential_db_id: int):
    from app.services.webauthn_service import WebAuthnService
    ok = WebAuthnService.revoke_credential(
        user=current_user, credential_db_id=credential_db_id,
    )
    if not ok:
        return jsonify({'success': False, 'error': 'not_found'}), 404
    return jsonify({'success': True})


@webauthn_bp.route('/register/begin', methods=['POST'])
@login_required
def api_webauthn_register_begin():
    from app.services.webauthn_service import WebAuthnService
    try:
        opts = WebAuthnService.begin_registration(user=current_user)
        return jsonify({'success': True, **opts})
    except Exception as e:
        logger.exception(f'webauthn register begin failed: {e}')
        return jsonify({'success': False, 'error': 'server.unexpected'}), 500


@webauthn_bp.route('/register/finish', methods=['POST'])
@login_required
def api_webauthn_register_finish():
    from app.services.webauthn_service import WebAuthnService
    data = get_request_json() or {}
    credential = data.get('credential')
    label = data.get('label')
    if not credential or not isinstance(credential, dict):
        return jsonify({'success': False, 'error': 'credential required'}), 400
    try:
        result = WebAuthnService.finish_registration(
            user=current_user, credential_response=credential, label=label,
        )
        if not result.get('success'):
            return jsonify(result), 400
        return jsonify(result)
    except Exception as e:
        logger.exception(f'webauthn register finish failed: {e}')
        return jsonify({'success': False, 'error': 'server.unexpected'}), 500


@webauthn_bp.route('/authenticate/begin', methods=['POST'])
@login_required
def api_webauthn_auth_begin():
    from app.services.webauthn_service import WebAuthnService
    try:
        result = WebAuthnService.begin_authentication(user=current_user)
        if not result.get('success'):
            return jsonify(result), 400
        return jsonify(result)
    except Exception as e:
        logger.exception(f'webauthn auth begin failed: {e}')
        return jsonify({'success': False, 'error': 'server.unexpected'}), 500


@webauthn_bp.route('/authenticate/finish', methods=['POST'])
@login_required
def api_webauthn_auth_finish():
    from app.services.webauthn_service import WebAuthnService
    data = get_request_json() or {}
    assertion = data.get('credential')
    if not assertion or not isinstance(assertion, dict):
        return jsonify({'success': False, 'error': 'credential required'}), 400
    try:
        result = WebAuthnService.finish_authentication(
            user=current_user, assertion_response=assertion,
        )
        if not result.get('success'):
            return jsonify(result), 400
        return jsonify(result)
    except Exception as e:
        logger.exception(f'webauthn auth finish failed: {e}')
        return jsonify({'success': False, 'error': 'server.unexpected'}), 500


def verify_assertion_for_user(user, assertion: dict) -> bool:
    """Verify a WebAuthn assertion for the given user.

    Used by reauth_service._verify_webauthn() to gate sensitive
    operations like emergency-declaration signing. Wraps
    WebAuthnService.finish_authentication so the reauth helper doesn't
    need to know the WebAuthn library's call shape.

    The assertion is the full credential dict returned by the browser's
    navigator.credentials.get() — the same shape /authenticate/finish
    expects in its body.

    Returns True if the assertion verifies AND the challenge stored in
    Flask session matches; False otherwise. Caller is expected to
    invoke /authenticate/begin before requesting the sensitive op so a
    challenge is in the session.
    """
    if not user or not isinstance(assertion, dict):
        return False
    try:
        from app.services.webauthn_service import WebAuthnService
        result = WebAuthnService.finish_authentication(
            user=user, assertion_response=assertion,
        )
        return bool(result and result.get('success'))
    except Exception as e:
        logger.warning(f'verify_assertion_for_user failed: {e}')
        return False


def require_reauth():
    """Gate decorator/helper for sensitive routes.

    Usage in a route:
        from app.routes.webauthn_routes import require_reauth
        if (resp := require_reauth()) is not None:
            return resp

    Returns None if the X-Reauth-Token header is valid + matches the
    current user. Returns a 403 JSON response otherwise. Returns None
    (treated as bypassed) when the user has no registered credentials
    — re-auth gates only fire for users who opted in.
    """
    from app.services.webauthn_service import WebAuthnService
    if not current_user.is_authenticated:
        return jsonify({'success': False, 'error': 'unauthenticated'}), 401
    # If the user has no enrolled credentials, the gate is a no-op.
    if not current_user.webauthn_credentials.first():
        return None
    token = request.headers.get('X-Reauth-Token', '')
    if not token:
        return jsonify({
            'success': False,
            'error': 'reauth_required',
            'gate': 'webauthn',
        }), 403
    if not WebAuthnService.consume_reauth_token(
        user_id=current_user.id, token=token,
    ):
        return jsonify({
            'success': False,
            'error': 'reauth_invalid_or_expired',
            'gate': 'webauthn',
        }), 403
    return None
