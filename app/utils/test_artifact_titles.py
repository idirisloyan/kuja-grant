"""
Canonical list of grant titles created by the E2E test suite
(test_e2e_final.py) and other automated regression flows.

Single source of truth for both:
  - test_e2e_final.py        — creates these (prefixed for safety, see below)
  - scripts/prune_test_artifacts.py — deletes them + their applications

Going forward, new test-suite-created grants MUST use the
`[E2E-TEST]` prefix (handled by the `e2e_title()` helper in the
test runner). Historic titles without the prefix are listed under
LEGACY_TEST_GRANT_TITLES so the pruner can sweep them up too. Other
test runners (some not in this repo) have left titles with shapes
like `E2E Test Grant <unix-ms>`, `SOAK30-<unix-ms>-N`, etc — those
are matched by LEGACY_TEST_TITLE_PATTERNS.

The pruner matches by exact title equality OR pattern regex. Seed
data uses descriptive donor-named titles (e.g.
"USAID East Africa WASH Program 2026-2028") that never collide
with these markers.
"""

from __future__ import annotations

import re

# Prefix every test-suite-created title should carry going forward.
E2E_TITLE_PREFIX = "[E2E-TEST]"


# Titles that test_e2e_final.py created before the prefix convention
# landed. The pruner removes any grant whose title is exactly one of
# these strings. Source of truth: title= literals in test_e2e_final.py
# as of June 2026, plus other-runner titles discovered during the
# June 2026 production cleanup pass.
LEGACY_TEST_GRANT_TITLES: frozenset[str] = frozenset({
    # From test_e2e_final.py:
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
    # From other-runner exhaust (discovered June 2026 prod cleanup):
    "Oversize Test Grant",   # repeated draft-grant creation in a sister suite
    "Draft Grant",            # generic
    "App002 Test Grant",
    "Smoke Test",
    "kuja manual extract doc",
    "retest doc",
    "retest doc2",
    "publish probe latest",
    "health",                 # one-word titles from a parameter-fuzzer
    "climate",
})


# Regex patterns matching whole grant titles created by other
# automated runners. Order doesn't matter; the pruner uses re.fullmatch.
LEGACY_TEST_TITLE_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"E2E Test Grant \d{10,13}"),
    re.compile(r"SOAK-\d{10,13}-\d+"),
    re.compile(r"SOAK30-\d{10,13}-\d+"),
    re.compile(r"BROWSER E2E \d{10,13}"),
    re.compile(r"API CORE RETEST \d{10,13}"),
    # Emergency-declaration test fixture titles (encoding-corrupted dashes).
    re.compile(r"Somalia drought emergency .+ Q[1-4] 20\d{2} response .+ "
               r"(Ubuntu Education Trust|Amani Community Development|"
               r"Salam Relief Foundation|Hope Bridges Initiative)"),
    # Catch-all for ANY title ending in a 10-13 digit unix timestamp.
    # Sister test runners (not in this repo) suffix everything with
    # Date.now() — too many distinct phrase prefixes to enumerate. No
    # real grant has a millisecond-precision suffix on its title.
    re.compile(r".+ \d{10,13}"),
)


def is_test_artifact_title(title: str | None) -> bool:
    """True if the grant title was created by an automated test run.

    Matches the [E2E-TEST] prefix (going forward), the legacy exact
    set, or any of the legacy patterns. Empty / whitespace-only titles
    are treated as test artifacts — no real grant ever has an empty
    title in this app.
    """
    if title is None:
        return True
    if not title.strip():
        return True
    if title.startswith(E2E_TITLE_PREFIX):
        return True
    if title in LEGACY_TEST_GRANT_TITLES:
        return True
    for pattern in LEGACY_TEST_TITLE_PATTERNS:
        if pattern.fullmatch(title):
            return True
    return False


def e2e_title(label: str) -> str:
    """Format a title for test-suite use. Always prefixed for cleanup."""
    return f"{E2E_TITLE_PREFIX} {label}"
