"""
Kuja Grant Management System - Helper Functions & Constants
============================================================
Extracted from server.py (sections 2 and 5).
Pure utility functions with no app-level side effects.
"""

import json
from datetime import timezone
from flask import request

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ALLOWED_EXTENSIONS = {'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'png', 'jpg', 'jpeg', 'txt'}

VALID_DOC_TYPES = frozenset([
    'general', 'financial_report', 'audit_report', 'registration_certificate',
    'proposal', 'budget', 'logframe', 'cv', 'reference_letter',
    'organizational_chart', 'annual_report', 'policy_document',
    'monitoring_report', 'evaluation_report', 'partnership_agreement',
    'tax_exemption', 'bank_statement', 'insurance_certificate',
])

MAGIC_BYTES = {
    'pdf': b'%PDF',
    'png': b'\x89PNG',
    'jpg': b'\xff\xd8\xff',
    'jpeg': b'\xff\xd8\xff',
    'xlsx': b'PK',   # ZIP-based
    'docx': b'PK',   # ZIP-based
    'xls': b'\xd0\xcf\x11\xe0',   # OLE2
    'doc': b'\xd0\xcf\x11\xe0',   # OLE2
}

# ---------------------------------------------------------------------------
# JSON helpers (SQLite TEXT column <-> Python objects)
# ---------------------------------------------------------------------------


def _json_load(text):
    """Safely parse a JSON string from a Text column."""
    if text is None:
        return None
    if isinstance(text, (dict, list)):
        return text
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return None


def _json_dump(obj):
    """Serialize a Python object to a JSON string for storage."""
    if obj is None:
        return None
    if isinstance(obj, str):
        return obj
    return json.dumps(obj, default=str)


def aware_utc(dt):
    """Coerce a datetime to timezone-aware UTC for safe arithmetic/comparison.

    Our timestamp columns are plain ``db.DateTime`` (no ``timezone=True``), so a
    value written tz-aware is read back NAIVE. Subtracting/comparing such a naive
    value with ``datetime.now(timezone.utc)`` raises
    ``TypeError: can't subtract offset-naive and offset-aware datetimes`` -> 500.
    Treat naive DB datetimes as UTC. No-op for already-aware or None inputs.
    """
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def iso_utc(dt):
    """Serialize a datetime as an explicit-UTC ISO-8601 string (with offset).

    Our timestamp columns are declared ``db.DateTime`` (no ``timezone=True``),
    so a value written tz-aware in UTC (``datetime.now(timezone.utc)``) is read
    back NAIVE from SQLite/Postgres. A bare ``.isoformat()`` then emits e.g.
    ``"2026-08-14T09:00:00"`` with no zone marker, and the frontend's
    ``new Date(...)`` / ``Date.parse(...)`` interprets that as *local* time — so
    a just-now timestamp reads as the future for any viewer west of UTC
    ("Updated in future", a 14-Aug pilot finding). Emitting an explicit UTC
    offset makes every consumer parse the instant correctly.

    Naive values are treated as the UTC they actually are; already-aware values
    are converted to UTC (never mangled). Returns ``None`` for ``None``. Only
    for ``datetime`` — pass ``date`` values through ``.isoformat()`` directly.
    """
    if dt is None:
        return None
    if getattr(dt, 'tzinfo', None) is not None:
        dt = dt.astimezone(timezone.utc)
    else:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


# ---------------------------------------------------------------------------
# Request helpers
# ---------------------------------------------------------------------------


def allowed_file(filename):
    """Check if a filename has an allowed extension."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def get_request_json():
    """Get JSON body from request, return empty dict if none."""
    data = request.get_json(silent=True)
    return data if data else {}


def paginate_query(query, default_per_page=20, max_per_page=100):
    """Apply pagination to a SQLAlchemy query based on request args."""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', default_per_page, type=int)
    per_page = min(per_page, max_per_page)
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    return pagination
