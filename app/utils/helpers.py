"""
Kuja Grant Management System - Helper Functions & Constants
============================================================
Extracted from server.py (sections 2 and 5).
Pure utility functions with no app-level side effects.
"""

import json
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
