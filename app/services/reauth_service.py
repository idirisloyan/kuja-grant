"""Re-authentication helper — Phase 36b (May 2026).

Verifies a fresh authentication factor for a step-up flow like signing
an emergency declaration. Used by /api/declarations/<id>/signatures/<sid>/sign
to prove the human at the keyboard is the actual signer (not just a
hijacked session).

Two supported methods:
  - 'totp'      — verifies a 6-digit TOTP code OR a recovery code
  - 'webauthn'  — verifies a WebAuthn assertion blob (delegates to
                  app.services.webauthn_service.verify_assertion)
  - 'manual_admin' — only callable by an admin acting on behalf of a
                  signer (e.g. paper signature ceremony). Caller records
                  the rationale in `note`. NEVER use for self-signing.

Returns a small dict { ok: bool, method: str, code: str, message: str }.
On failure, the declaration route returns 400 with the message — the
signature row stays in 'pending' so the user can retry.

Design notes:
  - Pure helper; doesn't import the EmergencyDeclaration models so it
    can be reused for any future step-up flow.
  - Never logs the raw TOTP code or assertion payload (only the result).
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

logger = logging.getLogger("kuja")

if TYPE_CHECKING:  # pragma: no cover
    from app.models.user import User


def verify_reauth(
    *,
    user,
    method: str,
    totp_code: str | None = None,
    webauthn_assertion: dict | None = None,
    acting_admin=None,
) -> dict:
    """Run the appropriate re-auth check.

    Returns: { ok: bool, method: str, code: str, message: str }

    `code` is a stable machine code suitable for the API client to branch on:
      - 'ok.totp'              — TOTP verified
      - 'ok.totp_recovery'     — recovery code consumed
      - 'ok.webauthn'          — WebAuthn assertion verified
      - 'ok.manual_admin'      — recorded as admin override
      - 'err.totp_not_enrolled'
      - 'err.totp_invalid'
      - 'err.webauthn_not_enrolled'
      - 'err.webauthn_invalid'
      - 'err.manual_not_admin'
      - 'err.unknown_method'
    """
    method = (method or "").strip().lower()

    if method == "totp":
        return _verify_totp(user, totp_code)
    if method == "webauthn":
        return _verify_webauthn(user, webauthn_assertion)
    if method == "manual_admin":
        return _verify_manual_admin(acting_admin)
    return {
        "ok": False,
        "method": method or "unknown",
        "code": "err.unknown_method",
        "message": f"Unknown re-auth method '{method}'",
    }


# -----------------------------------------------------------------
# TOTP
# -----------------------------------------------------------------

def _verify_totp(user, totp_code: str | None) -> dict:
    if not totp_code or not str(totp_code).strip():
        return {
            "ok": False, "method": "totp", "code": "err.totp_missing",
            "message": "TOTP code is required",
        }
    if not getattr(user, "totp_enabled", False):
        return {
            "ok": False, "method": "totp", "code": "err.totp_not_enrolled",
            "message": "User has not enrolled in TOTP. Enable 2FA first.",
        }
    try:
        import pyotp  # type: ignore
    except Exception:
        return {
            "ok": False, "method": "totp", "code": "err.totp_unavailable",
            "message": "TOTP backend not available on this server",
        }

    code = "".join(c for c in str(totp_code) if c.isalnum()).upper()
    digits_only = "".join(c for c in code if c.isdigit())

    # 1. Try as a 6-digit TOTP code.
    if len(digits_only) == 6 and getattr(user, "totp_secret", None):
        try:
            totp = pyotp.TOTP(user.totp_secret)
            if totp.verify(digits_only, valid_window=1):
                logger.info(f"TOTP re-auth OK for user_id={user.id}")
                return {
                    "ok": True, "method": "totp", "code": "ok.totp",
                    "message": "Verified",
                }
        except Exception as e:
            logger.warning(f"TOTP verify error for user_id={user.id}: {e}")

    # 2. Try as a recovery code.
    try:
        from werkzeug.security import check_password_hash
        from app.extensions import db
        from app.models.user import User as UserModel  # noqa: F401
        # Recovery codes are stored hashed; we don't know which one was
        # used, so we have to try them all. The login-time /verify route
        # has the canonical implementation — replicate it minimally here.
        hashes = getattr(user, "totp_recovery_codes_hashed", None) or []
        if isinstance(hashes, str):
            # Stored as JSON in some schemas — parse defensively.
            import json
            try:
                hashes = json.loads(hashes) or []
            except Exception:
                hashes = []
        for idx, h in enumerate(hashes):
            if h and check_password_hash(h, code):
                # Burn this recovery code.
                hashes[idx] = None
                user.totp_recovery_codes_hashed = (
                    hashes if not isinstance(
                        getattr(user, "totp_recovery_codes_hashed", None), str
                    ) else __import__("json").dumps(hashes)
                )
                db.session.commit()
                logger.info(f"TOTP recovery-code re-auth OK for user_id={user.id}")
                return {
                    "ok": True, "method": "totp",
                    "code": "ok.totp_recovery",
                    "message": "Verified via recovery code",
                }
    except Exception as e:
        logger.warning(f"TOTP recovery-code check failed: {e}")

    return {
        "ok": False, "method": "totp", "code": "err.totp_invalid",
        "message": "TOTP code is invalid or expired",
    }


# -----------------------------------------------------------------
# WebAuthn
# -----------------------------------------------------------------

def _verify_webauthn(user, assertion: dict | None) -> dict:
    """Best-effort WebAuthn assertion verification. If the WebAuthn
    service isn't wired up or assertion is malformed, returns an error
    rather than silently approving."""
    if not assertion:
        return {
            "ok": False, "method": "webauthn",
            "code": "err.webauthn_missing",
            "message": "WebAuthn assertion is required",
        }
    # Check enrolment
    try:
        from app.models import WebAuthnCredential
        creds = WebAuthnCredential.query.filter_by(user_id=user.id).all()
        if not creds:
            return {
                "ok": False, "method": "webauthn",
                "code": "err.webauthn_not_enrolled",
                "message": "User has no enrolled WebAuthn credentials",
            }
    except Exception as e:
        logger.warning(f"WebAuthn enrolment check failed: {e}")
        return {
            "ok": False, "method": "webauthn",
            "code": "err.webauthn_unavailable",
            "message": "WebAuthn backend not available",
        }

    # Delegate verification to the existing WebAuthn module, if it
    # exposes one. If not, we fail closed.
    try:
        from app.routes import webauthn_routes  # type: ignore
        verify_fn = getattr(webauthn_routes, "verify_assertion_for_user", None)
        if callable(verify_fn):
            ok = bool(verify_fn(user, assertion))
            if ok:
                return {
                    "ok": True, "method": "webauthn",
                    "code": "ok.webauthn", "message": "Verified",
                }
            return {
                "ok": False, "method": "webauthn",
                "code": "err.webauthn_invalid",
                "message": "WebAuthn assertion is invalid",
            }
    except Exception as e:
        logger.warning(f"WebAuthn verify path failed: {e}")

    # Fail closed if the verification surface isn't available.
    return {
        "ok": False, "method": "webauthn",
        "code": "err.webauthn_unavailable",
        "message": "WebAuthn verification path not wired up on this server",
    }


# -----------------------------------------------------------------
# Manual admin override
# -----------------------------------------------------------------

def _verify_manual_admin(acting_admin) -> dict:
    """Admin attests on behalf of a signer (e.g. paper-signature ceremony).
    Never use for self-signing; the route layer ensures `acting_admin` is
    distinct from the signer."""
    if not acting_admin or getattr(acting_admin, "role", None) != "admin":
        return {
            "ok": False, "method": "manual_admin",
            "code": "err.manual_not_admin",
            "message": "manual_admin signature requires admin authorisation",
        }
    return {
        "ok": True, "method": "manual_admin",
        "code": "ok.manual_admin",
        "message": "Recorded as admin override",
    }
