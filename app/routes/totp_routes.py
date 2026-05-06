"""
TOTP 2FA routes — Phase 13.15.

PMO's pattern: nag, then enforce. Soft enforcement starts now —
banner on every page when an admin lacks 2FA. After a few weeks of
nag, flip to a hard middleware gate.

Lifecycle:
  1. POST /enroll/start    — generate secret + provisioning URI + QR PNG bytes
  2. POST /enroll/confirm  — user enters first TOTP code, we verify + activate
                             + return 10 single-use recovery codes (one-time)
  3. POST /verify          — at login, after password OK
  4. POST /disable         — user-initiated (must verify current code)
  5. GET  /status          — for the UI nag banner

Recovery codes are stored as bcrypt hashes; consumed on use. Once
exhausted, the user must regenerate via /enroll/start (which also
rotates the secret).
"""

import base64
import io
import secrets
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from app.extensions import db
from app.utils.api_errors import error_response
from app.utils.helpers import get_request_json
from app.utils.validation import require_string, ValidationError, to_error_response
from app.utils.rate_policies import enforce as rate_enforce, RateLimitedError

try:
    import pyotp
    HAS_PYOTP = True
except Exception:
    HAS_PYOTP = False

totp_bp = Blueprint('totp', __name__, url_prefix='/api/auth/totp')

ISSUER = 'Kuja'


def _ensure_columns():
    """Idempotent ALTER for the user 2FA columns."""
    from sqlalchemy import text
    try:
        for col_sql in [
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(64)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT FALSE",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enrolled_at TIMESTAMP",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_recovery_codes TEXT",
        ]:
            try:
                db.session.execute(text(col_sql))
                db.session.commit()
            except Exception:
                db.session.rollback()
        return True
    except Exception:
        return False


@totp_bp.route('/status', methods=['GET'])
@login_required
def status():
    """Return whether the current user has 2FA enabled.

    Used by the nag banner: when the user is admin AND totp_enabled is
    false, the banner renders.
    """
    _ensure_columns()
    return jsonify({
        'success': True,
        'enabled': bool(getattr(current_user, 'totp_enabled', False)),
        'enrolled_at': (current_user.totp_enrolled_at.isoformat()
                        if getattr(current_user, 'totp_enrolled_at', None) else None),
        'has_pyotp': HAS_PYOTP,
        'admin_should_enroll': current_user.role == 'admin' and not getattr(current_user, 'totp_enabled', False),
    })


@totp_bp.route('/enroll/start', methods=['POST'])
@login_required
def enroll_start():
    """Generate a new TOTP secret + provisioning URI for the authenticator app.

    Returns: { secret, provisioning_uri }
    The user pastes the secret OR scans a QR (the client renders the
    QR from provisioning_uri using a small library — we don't generate
    the PNG server-side to avoid the qrcode dependency).
    """
    if not HAS_PYOTP:
        return error_response('totp.unavailable', 503,
                              detail='pyotp not installed on this deployment')
    try:
        rate_enforce('totp_enroll', current_user.id)
    except RateLimitedError as e:
        return error_response('rate.limited', 429, retry_after=e.retry_after)

    _ensure_columns()
    secret = pyotp.random_base32()
    current_user.totp_secret = secret
    # NOT enabled yet — confirm step required.
    current_user.totp_enabled = False
    db.session.commit()

    totp = pyotp.TOTP(secret)
    uri = totp.provisioning_uri(name=current_user.email, issuer_name=ISSUER)
    return jsonify({
        'success': True,
        'secret': secret,
        'provisioning_uri': uri,
        'note': 'Scan the QR or paste the secret into your authenticator app, then POST /enroll/confirm with the first 6-digit code.',
    })


@totp_bp.route('/enroll/confirm', methods=['POST'])
@login_required
def enroll_confirm():
    """Verify the first code + activate 2FA. Returns one-time recovery codes."""
    if not HAS_PYOTP:
        return error_response('totp.unavailable', 503)
    _ensure_columns()
    if not getattr(current_user, 'totp_secret', None):
        return error_response('validation.invalid_value', 400, field='totp',
                              detail='Call /enroll/start first')
    data = get_request_json() or {}
    try:
        code = require_string(data, 'code', min_len=6, max_len=8).replace(' ', '')
    except ValidationError as e:
        return to_error_response(e)

    totp = pyotp.TOTP(current_user.totp_secret)
    if not totp.verify(code, valid_window=1):
        return error_response('totp.invalid_code', 400)

    # Generate 10 recovery codes (single-use) and store as bcrypt hashes.
    from werkzeug.security import generate_password_hash
    raw_codes = ['-'.join([secrets.token_hex(2) for _ in range(3)]).upper() for _ in range(10)]
    hashes = [generate_password_hash(c) for c in raw_codes]
    import json as _json
    current_user.totp_recovery_codes = _json.dumps(hashes)
    current_user.totp_enabled = True
    current_user.totp_enrolled_at = datetime.now(timezone.utc)
    db.session.commit()

    # Audit-chain entry — the only time recovery codes are returned.
    from app.models.audit_chain import AuditChainEntry
    AuditChainEntry.append(
        action='user.totp_enrolled',
        actor_email=current_user.email,
        subject_kind='user',
        subject_id=current_user.id,
        details={'recovery_codes_issued': len(raw_codes)},
    )

    return jsonify({
        'success': True,
        'recovery_codes': raw_codes,
        'note': 'Save these codes somewhere safe — they will not be shown again. Each code works once.',
    })


@totp_bp.route('/verify', methods=['POST'])
@login_required
def verify():
    """Verify a TOTP code OR a recovery code at login.

    Body: { code: str }  — 6-digit TOTP or hyphenated recovery code.
    Returns: { success, used_recovery_code: bool }
    """
    if not HAS_PYOTP:
        return error_response('totp.unavailable', 503)
    if not getattr(current_user, 'totp_enabled', False):
        return error_response('validation.invalid_value', 400, field='totp',
                              detail='2FA is not enabled for this user')
    data = get_request_json() or {}
    try:
        code = require_string(data, 'code', min_len=6, max_len=20).strip().upper()
    except ValidationError as e:
        return to_error_response(e)

    # First try as a TOTP code (digits only).
    digits_only = ''.join(c for c in code if c.isdigit())
    if len(digits_only) == 6 and getattr(current_user, 'totp_secret', None):
        totp = pyotp.TOTP(current_user.totp_secret)
        if totp.verify(digits_only, valid_window=1):
            return jsonify({'success': True, 'used_recovery_code': False})

    # Otherwise try recovery codes.
    from werkzeug.security import check_password_hash
    import json as _json
    try:
        hashes = _json.loads(current_user.totp_recovery_codes or '[]')
    except Exception:
        hashes = []
    for i, h in enumerate(hashes):
        if check_password_hash(h, code):
            # Consume it.
            del hashes[i]
            current_user.totp_recovery_codes = _json.dumps(hashes)
            db.session.commit()
            from app.models.audit_chain import AuditChainEntry
            AuditChainEntry.append(
                action='user.totp_recovery_used',
                actor_email=current_user.email,
                subject_kind='user',
                subject_id=current_user.id,
                details={'remaining_codes': len(hashes)},
            )
            return jsonify({
                'success': True,
                'used_recovery_code': True,
                'remaining_recovery_codes': len(hashes),
            })

    return error_response('totp.invalid_code', 400)


@totp_bp.route('/disable', methods=['POST'])
@login_required
def disable():
    """Disable 2FA after verifying the current code (proves possession)."""
    if not HAS_PYOTP:
        return error_response('totp.unavailable', 503)
    if not getattr(current_user, 'totp_enabled', False):
        return jsonify({'success': True, 'note': 'Already disabled.'})
    data = get_request_json() or {}
    try:
        code = require_string(data, 'code', min_len=6, max_len=8)
    except ValidationError as e:
        return to_error_response(e)
    totp = pyotp.TOTP(current_user.totp_secret)
    if not totp.verify(code, valid_window=1):
        return error_response('totp.invalid_code', 400)
    current_user.totp_enabled = False
    current_user.totp_secret = None
    current_user.totp_recovery_codes = None
    db.session.commit()

    from app.models.audit_chain import AuditChainEntry
    AuditChainEntry.append(
        action='user.totp_disabled',
        actor_email=current_user.email,
        subject_kind='user',
        subject_id=current_user.id,
        details={},
    )
    return jsonify({'success': True})
