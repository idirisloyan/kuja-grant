"""
handoff_token.py -- mint/verify the Grant->Trust capacity-assessment hand-off token.

A minimal, standards-shaped JWT (HS256) implemented with the Python standard library
only (hmac + hashlib + base64 + json) so the Trust app (Node) can verify it with its
own standard library (crypto) -- no third-party JWT dependency on either side.

Token = base64url(header).base64url(payload).base64url(HMAC-SHA256(secret, header.payload))
Header  = {"alg":"HS256","typ":"JWT"}
Payload = {iss, aud, sub(org ref), name, email, return_url, iat, exp, jti}

See docs/TRUST_HANDOFF_DESIGN.md.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time

ISS = "kuja-grant"
AUD = "kuja-trust"
_HEADER = {"alg": "HS256", "typ": "JWT"}


class HandoffTokenError(ValueError):
    """Raised when a hand-off token is malformed, unsigned, expired or mis-addressed."""


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64url_decode(seg: str) -> bytes:
    pad = "=" * (-len(seg) % 4)
    return base64.urlsafe_b64decode(seg + pad)


def _json_seg(obj: dict) -> str:
    # compact + deterministic so the signed bytes are stable
    return _b64url(json.dumps(obj, separators=(",", ":"), sort_keys=True).encode("utf-8"))


def mint(
    secret: str,
    *,
    sub: str,
    name: str,
    email: str | None = None,
    return_url: str,
    ttl_seconds: int = 300,
    iss: str = ISS,
    aud: str = AUD,
    now: int | None = None,
) -> str:
    """Create a signed hand-off token for org ref `sub`. Raises if secret is empty."""
    if not secret:
        raise HandoffTokenError("hand-off secret is not configured")
    if not sub or not return_url:
        raise HandoffTokenError("sub and return_url are required")
    issued = int(now if now is not None else time.time())
    payload = {
        "iss": iss,
        "aud": aud,
        "sub": str(sub),
        "name": name or "",
        "email": email or None,
        "return_url": return_url,
        "iat": issued,
        "exp": issued + int(ttl_seconds),
        "jti": secrets.token_urlsafe(12),
    }
    signing_input = _json_seg(_HEADER) + "." + _json_seg(payload)
    sig = hmac.new(secret.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest()
    return signing_input + "." + _b64url(sig)


def verify(
    secret: str,
    token: str,
    *,
    iss: str = ISS,
    aud: str = AUD,
    leeway_seconds: int = 30,
    now: int | None = None,
) -> dict:
    """Verify signature + exp + iss/aud and return the payload dict. Raises HandoffTokenError."""
    if not secret:
        raise HandoffTokenError("hand-off secret is not configured")
    try:
        h_b64, p_b64, s_b64 = token.split(".")
    except (ValueError, AttributeError):
        raise HandoffTokenError("malformed token")
    signing_input = h_b64 + "." + p_b64
    expected = hmac.new(secret.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest()
    try:
        provided = _b64url_decode(s_b64)
    except Exception:
        raise HandoffTokenError("malformed signature")
    if not hmac.compare_digest(expected, provided):
        raise HandoffTokenError("bad signature")
    try:
        payload = json.loads(_b64url_decode(p_b64))
    except Exception:
        raise HandoffTokenError("malformed payload")
    current = int(now if now is not None else time.time())
    if int(payload.get("exp", 0)) < current - leeway_seconds:
        raise HandoffTokenError("expired")
    if payload.get("iss") != iss or payload.get("aud") != aud:
        raise HandoffTokenError("wrong issuer/audience")
    return payload
