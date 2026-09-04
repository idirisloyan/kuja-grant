"""
One test-data policy for Proximate records (PFX-04SEP-GLOBAL-001).

The 4 Sep 2026 QA round found the dashboard counting 99 partners while the
Partners register showed 81 + "18 test partners hidden": two surfaces, two
interpretations of "test". This module is the single interpretation. The
frontend mirror (frontend/src/lib/test-records.ts) keeps the SAME name rule
as a fallback, but every serializer below emits an explicit `is_test` so
summary endpoints (the overview) and detail lists (the registers) agree by
construction, not by coincidence.

A record is test data when ANY of these hold:
  - its own name/title (incl. Arabic) or its donor / reference carries a
    QA/UAT/fixture word;
  - the record it belongs to is test data (a disbursement of a test partner,
    a grant from a test donor) — inheritance, so a real-looking title such as
    "Sudan Rapid Shelter Support 2026" is still test when its donor is;
  - the account that created / nominated / drafted it is a test identity
    (an @example.* address, or a qa-/uat-/test-/codex- local part).

Audit-chain rows are deliberately NOT covered: the chain is never filtered,
only badged (see the audit page).
"""
from __future__ import annotations

import re

TEST_NAME = re.compile(
    r'\b(uat|test|qa|codex|demo|fixture|verification|e2e|smoke|sandbox|dummy)\b',
    re.IGNORECASE,
)
TEST_EMAIL = re.compile(
    r'(@example\.(com|org|net)$|@test\.|^(qa|uat|test|codex|fixture|e2e)[-._@]|\+(qa|uat|test)@)',
    re.IGNORECASE,
)


def is_test_name(*names) -> bool:
    return any(n and TEST_NAME.search(str(n)) for n in names)


def is_test_email(email: str | None) -> bool:
    return bool(email) and bool(TEST_EMAIL.search(email))


def _user_email(user_id) -> str | None:
    """Email of a user id, cached per request so a register of 100 rows with
    three distinct nominators costs three lookups, not a hundred."""
    if not user_id:
        return None
    cache = None
    try:
        from flask import g, has_request_context
        if has_request_context():
            cache = getattr(g, '_test_records_email_cache', None)
            if cache is None:
                cache = {}
                g._test_records_email_cache = cache
            if user_id in cache:
                return cache[user_id]
    except Exception:
        cache = None
    email = None
    try:
        from app.models import User
        u = User.query.get(user_id)
        email = u.email if u else None
    except Exception:
        email = None
    if cache is not None:
        cache[user_id] = email
    return email


def partner_is_test(p) -> bool:
    return (
        is_test_name(getattr(p, 'name', None), getattr(p, 'name_ar', None))
        or is_test_email(_user_email(getattr(p, 'nominated_by_user_id', None)))
    )


def grant_is_test(g) -> bool:
    return (
        is_test_name(
            getattr(g, 'title', None),
            getattr(g, 'donor_name_cache', None),
            getattr(g, 'donor_grant_ref', None),
        )
        or is_test_email(_user_email(getattr(g, 'created_by_user_id', None)))
    )


def round_is_test(r) -> bool:
    return (
        is_test_name(
            getattr(r, 'title', None),
            getattr(r, 'title_ar', None),
            getattr(r, 'donor_name', None),
        )
        or is_test_email(_user_email(getattr(r, 'drafted_by_user_id', None)))
    )


def disbursement_is_test(d) -> bool:
    partner = getattr(d, 'partner', None)
    return bool(partner) and partner_is_test(partner)


def message_is_test(m) -> bool:
    return is_test_name(getattr(m, 'recipient_name', None))


def include_test_requested(request) -> bool:
    """`?include_test=1` — the frontend passes the shared "Show test data"
    flag so aggregates follow the same policy as the registers."""
    v = (request.args.get('include_test') or '').strip().lower()
    return v in ('1', 'true', 'yes')
