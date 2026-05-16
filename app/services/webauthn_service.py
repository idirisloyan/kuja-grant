"""
WebAuthnService — Phase 26C (May 2026).

Server-side WebAuthn (FIDO2) flows for biometric / hardware-key
re-authentication. Wraps the `webauthn` lib so callers in routes don't
need to know the byte-level details.

Two flows:
  1. Registration — first time a user enrols a credential. Browser
     calls navigator.credentials.create() with a server-issued challenge,
     returns an attestation object which we verify and store.
  2. Authentication — for re-auth gates on sensitive actions. Browser
     calls navigator.credentials.get() with a server-issued challenge,
     returns an assertion which we verify against the stored public
     key. Sign-count must monotonically increase (clone detection).

Challenges are stored in Flask session (32-byte random). RP_ID is the
domain hostname (set via WEBAUTHN_RP_ID env var, defaults to host from
WEBAUTHN_ORIGIN). origin used for verification is WEBAUTHN_ORIGIN.

Discipline:
  - All credential material is stored base64url-encoded for portability
  - Sign-count regression is treated as a HARD failure (potential clone)
  - Re-auth tokens are short-lived (5 minutes) and single-use
"""

import base64
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone

from app.extensions import db
from app.models import User, WebAuthnCredential

logger = logging.getLogger('kuja')

REAUTH_TOKEN_TTL_SECONDS = 300  # 5 minutes
# In-process re-auth token store. For multi-worker deployments this
# should move to Redis; for current Kuja prod we run a single Gunicorn
# worker so process-local is fine.
_REAUTH_TOKENS: dict[str, dict] = {}


def _origin() -> str:
    return os.getenv('WEBAUTHN_ORIGIN', 'https://web-production-6f8a.up.railway.app')


def _rp_id() -> str:
    # Derive from origin if not explicitly set
    explicit = os.getenv('WEBAUTHN_RP_ID')
    if explicit:
        return explicit
    origin = _origin()
    # strip scheme + port
    host = origin.split('://', 1)[-1].split('/', 1)[0].split(':', 1)[0]
    return host


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')


def _b64url_decode(s: str) -> bytes:
    pad = '=' * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


class WebAuthnService:

    # ------------------------------------------------------------------
    # Registration
    # ------------------------------------------------------------------

    @classmethod
    def begin_registration(cls, *, user: User) -> dict:
        """Return options the browser passes to navigator.credentials.create().

        Stores the challenge in Flask session so verify can compare.
        """
        from webauthn import generate_registration_options
        from webauthn.helpers.structs import (
            AuthenticatorSelectionCriteria,
            UserVerificationRequirement,
        )
        from flask import session

        existing = [
            {'id': c.credential_id, 'transports': []}
            for c in user.webauthn_credentials.all()
        ]
        opts = generate_registration_options(
            rp_id=_rp_id(),
            rp_name='Kuja Grant Management',
            user_id=str(user.id).encode('utf-8'),
            user_name=user.email,
            user_display_name=user.name or user.email,
            authenticator_selection=AuthenticatorSelectionCriteria(
                user_verification=UserVerificationRequirement.PREFERRED,
            ),
            exclude_credentials=[
                {'id': _b64url_decode(e['id']), 'transports': []}
                for e in existing
            ],
        )
        session['webauthn_register_challenge'] = _b64url(opts.challenge)
        # Serialise for the browser. The webauthn lib has a helper.
        from webauthn.helpers import options_to_json
        return {'publicKey': options_to_json(opts)}

    @classmethod
    def finish_registration(
        cls, *, user: User, credential_response: dict, label: str | None = None,
    ) -> dict:
        """Verify the attestation and persist the credential."""
        from webauthn import verify_registration_response
        from webauthn.helpers.exceptions import InvalidRegistrationResponse
        from flask import session

        challenge_b64 = session.pop('webauthn_register_challenge', None)
        if not challenge_b64:
            return {'success': False, 'reason': 'no_challenge'}
        try:
            verification = verify_registration_response(
                credential=credential_response,
                expected_challenge=_b64url_decode(challenge_b64),
                expected_origin=_origin(),
                expected_rp_id=_rp_id(),
            )
        except InvalidRegistrationResponse as e:
            logger.warning(f'webauthn registration verify failed: {e}')
            return {'success': False, 'reason': 'invalid_attestation', 'error': str(e)[:200]}

        cred = WebAuthnCredential(
            user_id=user.id,
            credential_id=_b64url(verification.credential_id),
            public_key=_b64url(verification.credential_public_key),
            sign_count=verification.sign_count or 0,
            label=label or 'Unnamed device',
        )
        db.session.add(cred)
        db.session.commit()
        return {'success': True, 'credential': cred.to_dict()}

    # ------------------------------------------------------------------
    # Authentication (re-auth)
    # ------------------------------------------------------------------

    @classmethod
    def begin_authentication(cls, *, user: User) -> dict:
        from webauthn import generate_authentication_options
        from webauthn.helpers.structs import UserVerificationRequirement
        from webauthn.helpers import options_to_json
        from flask import session

        creds = user.webauthn_credentials.all()
        if not creds:
            return {'success': False, 'reason': 'no_credentials'}
        opts = generate_authentication_options(
            rp_id=_rp_id(),
            allow_credentials=[
                {'id': _b64url_decode(c.credential_id), 'transports': []}
                for c in creds
            ],
            user_verification=UserVerificationRequirement.PREFERRED,
        )
        session['webauthn_auth_challenge'] = _b64url(opts.challenge)
        return {'success': True, 'publicKey': options_to_json(opts)}

    @classmethod
    def finish_authentication(
        cls, *, user: User, assertion_response: dict,
    ) -> dict:
        from webauthn import verify_authentication_response
        from webauthn.helpers.exceptions import InvalidAuthenticationResponse
        from flask import session

        challenge_b64 = session.pop('webauthn_auth_challenge', None)
        if not challenge_b64:
            return {'success': False, 'reason': 'no_challenge'}

        # Find the credential by id from the assertion
        cred_id_b64url = assertion_response.get('id') or assertion_response.get('rawId')
        if not cred_id_b64url:
            return {'success': False, 'reason': 'no_credential_id'}
        cred = (
            WebAuthnCredential.query
            .filter_by(user_id=user.id, credential_id=cred_id_b64url)
            .first()
        )
        if not cred:
            return {'success': False, 'reason': 'credential_unknown'}

        try:
            verification = verify_authentication_response(
                credential=assertion_response,
                expected_challenge=_b64url_decode(challenge_b64),
                expected_origin=_origin(),
                expected_rp_id=_rp_id(),
                credential_public_key=_b64url_decode(cred.public_key),
                credential_current_sign_count=cred.sign_count,
            )
        except InvalidAuthenticationResponse as e:
            logger.warning(f'webauthn assertion verify failed: {e}')
            return {'success': False, 'reason': 'invalid_assertion', 'error': str(e)[:200]}

        # Sign-count must strictly increase. The library already enforces
        # this when credential_current_sign_count is passed, but we
        # double-check here so logs surface the regression clearly.
        new_sign_count = verification.new_sign_count or 0
        if new_sign_count <= cred.sign_count and cred.sign_count != 0:
            logger.warning(
                f'webauthn sign-count regression user={user.id} '
                f'cred={cred.id} stored={cred.sign_count} new={new_sign_count}'
            )
            return {'success': False, 'reason': 'sign_count_regression'}

        cred.sign_count = new_sign_count
        cred.last_used_at = datetime.now(timezone.utc)
        db.session.commit()

        # Issue a short-lived re-auth token the caller can use to satisfy
        # a re-auth gate on a subsequent sensitive request.
        token = secrets.token_urlsafe(32)
        _REAUTH_TOKENS[token] = {
            'user_id': user.id,
            'expires_at': datetime.now(timezone.utc) + timedelta(seconds=REAUTH_TOKEN_TTL_SECONDS),
        }
        return {
            'success': True,
            'reauth_token': token,
            'expires_in': REAUTH_TOKEN_TTL_SECONDS,
        }

    # ------------------------------------------------------------------
    # Re-auth token consumption (single-use)
    # ------------------------------------------------------------------

    @classmethod
    def consume_reauth_token(cls, *, user_id: int, token: str) -> bool:
        """Return True if token is valid + unexpired + matches user.

        Single-use: a successful consume removes the token. Expired
        tokens are also cleaned up opportunistically.
        """
        now = datetime.now(timezone.utc)
        # Opportunistic cleanup
        expired = [t for t, meta in _REAUTH_TOKENS.items() if meta['expires_at'] < now]
        for t in expired:
            _REAUTH_TOKENS.pop(t, None)

        meta = _REAUTH_TOKENS.pop(token, None)
        if not meta:
            return False
        if meta['user_id'] != user_id:
            return False
        if meta['expires_at'] < now:
            return False
        return True

    # ------------------------------------------------------------------
    # Listing + revoke
    # ------------------------------------------------------------------

    @classmethod
    def list_credentials(cls, *, user: User) -> list[dict]:
        return [c.to_dict() for c in user.webauthn_credentials.all()]

    @classmethod
    def revoke_credential(cls, *, user: User, credential_db_id: int) -> bool:
        cred = WebAuthnCredential.query.filter_by(
            id=credential_db_id, user_id=user.id,
        ).first()
        if not cred:
            return False
        db.session.delete(cred)
        db.session.commit()
        return True
