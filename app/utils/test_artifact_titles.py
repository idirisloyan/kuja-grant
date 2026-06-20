"""
Canonical list of grant titles created by the E2E test suite
(test_e2e_final.py) and other automated regression flows.

Single source of truth for both:
  - test_e2e_final.py        — creates these (prefixed for safety, see below)
  - scripts/prune_test_artifacts.py — deletes them + their applications

Going forward, new test-suite-created grants MUST use the
`[E2E-TEST]` prefix (handled by the `e2e_title()` helper in the
test runner). Historic titles without the prefix are listed under
LEGACY_TEST_GRANT_TITLES so the pruner can sweep them up too.

The pruner matches by exact title equality, never substring. Seed
data uses descriptive donor-named titles (e.g.
"USAID East Africa WASH Program 2026-2028") that never collide
with these markers.
"""

from __future__ import annotations

# Prefix every test-suite-created title should carry going forward.
E2E_TITLE_PREFIX = "[E2E-TEST]"


# Titles that test_e2e_final.py created before the prefix convention
# landed. The pruner removes any grant whose title is exactly one of
# these strings. Source of truth: title= literals in test_e2e_final.py
# as of June 2026.
LEGACY_TEST_GRANT_TITLES: frozenset[str] = frozenset({
    "Apply Entry Test Grant",
    "Draft Save Test",
    "Draft Update Test",
    "Empty PDF Test",
    "Error Test",
    "Exe Test",
    "Feedback Test",
    "Oversized Test",
    "Regression Grant",
    "Tiny Test",
    "Valid TXT Test",
    "Wizard E2E Grant",
    "X",   # one-char title from quick post-validation regression
})


def is_test_artifact_title(title: str | None) -> bool:
    """True if the grant title was created by an automated test run.

    Matches the [E2E-TEST] prefix (going forward) OR any of the
    LEGACY_TEST_GRANT_TITLES exactly.
    """
    if not title:
        return False
    if title.startswith(E2E_TITLE_PREFIX):
        return True
    return title in LEGACY_TEST_GRANT_TITLES


def e2e_title(label: str) -> str:
    """Format a title for test-suite use. Always prefixed for cleanup."""
    return f"{E2E_TITLE_PREFIX} {label}"
