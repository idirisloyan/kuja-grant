"""
Server-boundary validation primitives — Phase 13.3.

PMO's hard-won lesson: hand-rolled validation drifts. Every action that
takes user input ends up with its own `if not data.get('x'): return ...`
checks, which inevitably grow inconsistent. Build the primitive layer
once, retrofit cost grows linearly otherwise.

The server is the actual security boundary. Client-side `required`
attributes are UX, not security — an attacker hitting the action with
curl can send anything. Use these helpers on every write path.

Usage:

    from app.utils.validation import (
        require_string, optional_string, require_int, optional_int,
        require_email, require_enum, optional_enum, require_uuid,
        require_date, optional_date, require_date_order,
        require_currency, optional_url, require_country_code,
        bound_array, ValidationError,
    )

    @bp.route('/widgets', methods=['POST'])
    def create_widget():
        data = get_request_json() or {}
        try:
            name = require_string(data, 'name', max_len=200)
            price = require_int(data, 'price', minimum=0, maximum=1_000_000_000)
            currency = require_enum(data, 'currency', ('USD', 'EUR', 'KES'))
            tags = bound_array(data, 'tags', max_items=20, item_max_len=40)
        except ValidationError as e:
            return error_response(e.code, 400, field=e.field, detail=e.detail)
        # ... safe to use validated values
"""

import re
from datetime import datetime, date
from typing import Any, Iterable


class ValidationError(Exception):
    """Raised by validation primitives when input fails the contract.

    code   — short i18n key (e.g. 'validation.missing_field')
    field  — the name of the offending input (passed to error_response
             as a {field} param so the localized message can name it)
    detail — extra context, surfaced in logs but not user-facing
    """

    def __init__(self, code: str, field: str, detail: str = ''):
        super().__init__(f"{code}({field}): {detail}")
        self.code = code
        self.field = field
        self.detail = detail


# ---------------------------------------------------------------------------
# Strings
# ---------------------------------------------------------------------------

def require_string(
    data: dict, field: str, *, min_len: int = 1, max_len: int = 4000,
    strip: bool = True,
) -> str:
    """Required string of bounded length. Strips whitespace by default."""
    if not isinstance(data, dict):
        raise ValidationError('validation.bad_payload', field, 'data is not a dict')
    raw = data.get(field)
    if raw is None:
        raise ValidationError('validation.missing_field', field)
    if not isinstance(raw, str):
        raise ValidationError('validation.invalid_value', field, f'expected string, got {type(raw).__name__}')
    val = raw.strip() if strip else raw
    if len(val) < min_len:
        raise ValidationError('validation.too_short', field, f'min={min_len} got={len(val)}')
    if len(val) > max_len:
        raise ValidationError('validation.too_long', field, f'max={max_len} got={len(val)}')
    return val


def optional_string(
    data: dict, field: str, *, max_len: int = 4000, default: str = '',
    strip: bool = True,
) -> str:
    """Optional string. Returns default when missing or empty."""
    if not isinstance(data, dict):
        return default
    raw = data.get(field)
    if raw is None:
        return default
    if not isinstance(raw, str):
        raise ValidationError('validation.invalid_value', field, f'expected string, got {type(raw).__name__}')
    val = raw.strip() if strip else raw
    if not val:
        return default
    if len(val) > max_len:
        raise ValidationError('validation.too_long', field, f'max={max_len} got={len(val)}')
    return val


# ---------------------------------------------------------------------------
# Numbers
# ---------------------------------------------------------------------------

def require_int(
    data: dict, field: str, *,
    minimum: int | None = None, maximum: int | None = None,
) -> int:
    """Required integer. Bools are rejected (type-tight)."""
    raw = data.get(field) if isinstance(data, dict) else None
    if raw is None:
        raise ValidationError('validation.missing_field', field)
    if isinstance(raw, bool) or not isinstance(raw, (int, float, str)):
        raise ValidationError('validation.invalid_value', field, f'expected int, got {type(raw).__name__}')
    try:
        val = int(raw)
    except (TypeError, ValueError):
        raise ValidationError('validation.invalid_value', field, f'not an integer: {raw!r}')
    if minimum is not None and val < minimum:
        raise ValidationError('validation.too_small', field, f'min={minimum} got={val}')
    if maximum is not None and val > maximum:
        raise ValidationError('validation.too_large', field, f'max={maximum} got={val}')
    return val


def optional_int(
    data: dict, field: str, *,
    minimum: int | None = None, maximum: int | None = None,
    default: int | None = None,
) -> int | None:
    raw = data.get(field) if isinstance(data, dict) else None
    if raw is None or raw == '':
        return default
    return require_int({field: raw}, field, minimum=minimum, maximum=maximum)


def require_float(
    data: dict, field: str, *,
    minimum: float | None = None, maximum: float | None = None,
) -> float:
    raw = data.get(field) if isinstance(data, dict) else None
    if raw is None:
        raise ValidationError('validation.missing_field', field)
    try:
        val = float(raw)
    except (TypeError, ValueError):
        raise ValidationError('validation.invalid_value', field, f'not a number: {raw!r}')
    if minimum is not None and val < minimum:
        raise ValidationError('validation.too_small', field, f'min={minimum} got={val}')
    if maximum is not None and val > maximum:
        raise ValidationError('validation.too_large', field, f'max={maximum} got={val}')
    return val


# ---------------------------------------------------------------------------
# Booleans
# ---------------------------------------------------------------------------

def optional_bool(data: dict, field: str, *, default: bool = False) -> bool:
    raw = data.get(field) if isinstance(data, dict) else None
    if raw is None:
        return default
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, (int, float)):
        return bool(raw)
    if isinstance(raw, str):
        return raw.strip().lower() in ('true', '1', 'yes', 'on', 't', 'y')
    return default


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

def require_enum(data: dict, field: str, allowed: Iterable[str]) -> str:
    """Required string that must be in the allowed set. Case-sensitive."""
    val = require_string(data, field)
    allowed_set = set(allowed)
    if val not in allowed_set:
        raise ValidationError(
            'validation.invalid_enum', field,
            f'expected one of {sorted(allowed_set)}, got {val!r}',
        )
    return val


def optional_enum(
    data: dict, field: str, allowed: Iterable[str],
    *, default: str | None = None,
) -> str | None:
    raw = data.get(field) if isinstance(data, dict) else None
    if raw is None or raw == '':
        return default
    return require_enum({field: raw}, field, allowed)


# ---------------------------------------------------------------------------
# Specialized strings (email, URL, UUID, country code, currency)
# ---------------------------------------------------------------------------

_EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
_UUID_RE = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE,
)
_URL_RE = re.compile(r'^https?://[^\s]+$', re.IGNORECASE)
_ISO_COUNTRY_RE = re.compile(r'^[A-Z]{2}$')
_CURRENCY_RE = re.compile(r'^[A-Z]{3}$')


def require_email(data: dict, field: str = 'email') -> str:
    val = require_string(data, field, max_len=320).lower()
    if not _EMAIL_RE.match(val):
        raise ValidationError('validation.invalid_email', field, val)
    return val


def optional_email(data: dict, field: str = 'email') -> str | None:
    raw = data.get(field) if isinstance(data, dict) else None
    if raw is None or raw == '':
        return None
    return require_email({field: raw}, field)


def require_uuid(data: dict, field: str) -> str:
    val = require_string(data, field, max_len=36)
    if not _UUID_RE.match(val):
        raise ValidationError('validation.invalid_uuid', field, val)
    return val


def optional_uuid(data: dict, field: str) -> str | None:
    raw = data.get(field) if isinstance(data, dict) else None
    if raw is None or raw == '':
        return None
    return require_uuid({field: raw}, field)


def optional_url(data: dict, field: str, *, max_len: int = 2000) -> str | None:
    raw = data.get(field) if isinstance(data, dict) else None
    if raw is None or raw == '':
        return None
    val = require_string({field: raw}, field, max_len=max_len)
    if not _URL_RE.match(val):
        raise ValidationError('validation.invalid_url', field, val)
    return val


def require_country_code(data: dict, field: str = 'country') -> str:
    val = require_string(data, field, max_len=2).upper()
    if not _ISO_COUNTRY_RE.match(val):
        raise ValidationError('validation.invalid_country', field, val)
    return val


def require_currency(data: dict, field: str = 'currency') -> str:
    val = require_string(data, field, max_len=3).upper()
    if not _CURRENCY_RE.match(val):
        raise ValidationError('validation.invalid_currency', field, val)
    return val


# ---------------------------------------------------------------------------
# Dates
# ---------------------------------------------------------------------------

def require_date(data: dict, field: str) -> date:
    """ISO-8601 date string (YYYY-MM-DD or full datetime). Returns a date."""
    raw = data.get(field) if isinstance(data, dict) else None
    if raw is None:
        raise ValidationError('validation.missing_field', field)
    if isinstance(raw, date) and not isinstance(raw, datetime):
        return raw
    if isinstance(raw, datetime):
        return raw.date()
    if not isinstance(raw, str):
        raise ValidationError('validation.invalid_value', field, f'expected date string, got {type(raw).__name__}')
    s = raw.strip()
    try:
        # Try date-only first, then datetime ISO, with or without TZ.
        if 'T' in s or ' ' in s:
            d = datetime.fromisoformat(s.replace('Z', '+00:00')).date()
        else:
            d = date.fromisoformat(s)
        return d
    except (TypeError, ValueError):
        raise ValidationError('validation.invalid_date', field, raw)


def optional_date(data: dict, field: str) -> date | None:
    raw = data.get(field) if isinstance(data, dict) else None
    if raw is None or raw == '':
        return None
    return require_date({field: raw}, field)


def require_date_order(start: date, end: date, *, start_field: str = 'start',
                       end_field: str = 'end') -> None:
    """Ensure end >= start. Raises ValidationError otherwise."""
    if start is None or end is None:
        return
    if end < start:
        raise ValidationError(
            'validation.date_order', end_field,
            f'{end_field}={end.isoformat()} before {start_field}={start.isoformat()}',
        )


# ---------------------------------------------------------------------------
# Arrays
# ---------------------------------------------------------------------------

def bound_array(
    data: dict, field: str, *,
    max_items: int = 100, item_max_len: int = 200,
    item_type: type = str, default: list | None = None,
) -> list:
    """Optional array bounded by item count + per-item length (for strings)."""
    if default is None:
        default = []
    raw = data.get(field) if isinstance(data, dict) else None
    if raw is None:
        return default
    if not isinstance(raw, list):
        raise ValidationError('validation.invalid_value', field, f'expected list, got {type(raw).__name__}')
    if len(raw) > max_items:
        raise ValidationError('validation.too_many_items', field, f'max={max_items} got={len(raw)}')
    out = []
    for i, item in enumerate(raw):
        if not isinstance(item, item_type):
            raise ValidationError(
                'validation.invalid_item', field,
                f'item[{i}] expected {item_type.__name__}, got {type(item).__name__}',
            )
        if isinstance(item, str) and len(item) > item_max_len:
            raise ValidationError(
                'validation.item_too_long', field,
                f'item[{i}] max={item_max_len} got={len(item)}',
            )
        out.append(item)
    return out


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def to_error_response(err: ValidationError):
    """Convert a ValidationError into the canonical error_response shape.

    Returns a Flask response — import locally to avoid circulars.
    """
    from app.utils.api_errors import error_response
    return error_response(err.code, 400, field=err.field, detail=err.detail or None)
