"""
Logic invariant suite — Phase 13.20.

PMO's pattern: millisecond-level regression detection for things that
must be true. No browser, no DB, no Playwright. Run on every commit
as a safety net before the slower smoke + e2e suites.

Categories:
  1. AI timeout invariants — caller ≤ SDK; heavy callers ≥ 240s
  2. Validation primitive shape — every primitive raises ValidationError
  3. Prompt invariants — required directives appear in prompts
  4. Schema invariants — model columns we depend on exist
  5. Security invariants — mock endpoint gate, rate policy registration

Run: py -3 scripts/test_invariants.py
"""

import os
import sys
import re
import importlib

# Make the app package importable.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

PASS = 0
FAIL = 0
ERRORS: list[tuple[str, str]] = []


def check(label: str, predicate, detail_on_fail: str = ''):
    """Run one invariant; print PASS/FAIL; track totals."""
    global PASS, FAIL
    try:
        ok = predicate()
    except Exception as e:
        ok = False
        detail_on_fail = f'{detail_on_fail} (exception: {e})'
    if ok:
        print(f'  [PASS] {label}')
        PASS += 1
    else:
        print(f'  [FAIL] {label}{(" — " + detail_on_fail) if detail_on_fail else ""}')
        FAIL += 1
        ERRORS.append((label, detail_on_fail))


def main():
    print('Logic invariants:')
    print('=' * 60)

    # --- 1. AI timeout invariants ---------------------------------
    from app.services.ai_service import AIService
    check(
        'AI SDK timeout >= 300s (PMO contract)',
        lambda: AIService.AI_SDK_TIMEOUT >= 300.0,
        f'got {AIService.AI_SDK_TIMEOUT}',
    )
    check(
        'AI heavy timeout >= 240s',
        lambda: AIService.AI_HEAVY_TIMEOUT >= 240.0,
        f'got {AIService.AI_HEAVY_TIMEOUT}',
    )
    check(
        'AI heavy timeout <= SDK ceiling',
        lambda: AIService.AI_HEAVY_TIMEOUT <= AIService.AI_SDK_TIMEOUT,
    )
    check(
        'AI medium timeout <= heavy timeout',
        lambda: AIService.AI_MEDIUM_TIMEOUT <= AIService.AI_HEAVY_TIMEOUT,
    )
    check(
        'AI light timeout <= medium timeout',
        lambda: AIService.AI_LIGHT_TIMEOUT <= AIService.AI_MEDIUM_TIMEOUT,
    )
    # Spot-check a few endpoints that should be heavy.
    for ep in ('draft_application', 'draft_report', 'generate_grant_brief',
               'analyze_document'):
        check(
            f'endpoint {ep} resolves to heavy timeout',
            lambda ep=ep: AIService._resolve_timeout(ep) == AIService.AI_HEAVY_TIMEOUT,
            f'got {AIService._resolve_timeout(ep)}',
        )
    # The whole _AI_TIMEOUT_BY_ENDPOINT map must respect the ceiling.
    check(
        'every endpoint timeout <= SDK ceiling',
        lambda: all(t <= AIService.AI_SDK_TIMEOUT
                    for t in AIService._AI_TIMEOUT_BY_ENDPOINT.values()),
    )

    # --- 2. Validation primitive shape ----------------------------
    from app.utils.validation import (
        require_string, ValidationError,
        require_int, require_email, require_uuid, bound_array,
    )
    def expect_raises(fn):
        try:
            fn()
            return False
        except ValidationError:
            return True

    check(
        'require_string raises on missing field',
        lambda: expect_raises(lambda: require_string({}, 'name')),
    )
    check(
        'require_string raises on too-long input',
        lambda: expect_raises(lambda: require_string({'x': 'a' * 5000}, 'x', max_len=4000)),
    )
    check(
        'require_int raises on non-int',
        lambda: expect_raises(lambda: require_int({'n': 'abc'}, 'n')),
    )
    check(
        'require_int rejects bools',
        lambda: expect_raises(lambda: require_int({'n': True}, 'n')),
    )
    check(
        'require_email rejects malformed',
        lambda: expect_raises(lambda: require_email({'email': 'not-an-email'})),
    )
    check(
        'require_uuid rejects malformed',
        lambda: expect_raises(lambda: require_uuid({'id': 'abc'}, 'id')),
    )
    check(
        'bound_array raises on too-many items',
        lambda: expect_raises(
            lambda: bound_array({'tags': ['a'] * 101}, 'tags', max_items=100, item_type=str)
        ),
    )

    # --- 3. Prompt invariants -------------------------------------
    # Read the AI service file and check key directives are present.
    ai_src_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        'app', 'services', 'ai_service.py',
    )
    with open(ai_src_path, encoding='utf-8') as f:
        ai_src = f.read()

    check(
        'check_submission_readiness has severity bands',
        lambda: ('blocker' in ai_src and 'weak' in ai_src and 'polish' in ai_src),
    )
    check(
        "draft_application reminds AI not to invent facts",
        lambda: 'NEVER invent' in ai_src or 'never invent' in ai_src,
    )
    check(
        'check_submission_readiness scoring band hint present',
        lambda: '90-100' in ai_src and '70-89' in ai_src,
    )
    check(
        'reviewer summary requires evidence_for/against per criterion',
        lambda: 'evidence_for' in ai_src and 'evidence_against' in ai_src,
    )

    # --- 4. Schema invariants -------------------------------------
    from app.models import (
        Risk, AuditChainEntry, OrgMemory, EntityComment,
    )
    check('Risk model has lifecycle status column',
          lambda: hasattr(Risk, 'status') and hasattr(Risk, 'resolved_at'))
    check('AuditChainEntry has prev_hash + payload_hash',
          lambda: hasattr(AuditChainEntry, 'prev_hash') and hasattr(AuditChainEntry, 'payload_hash'))
    check('OrgMemory has usage_count for ranking',
          lambda: hasattr(OrgMemory, 'usage_count') and hasattr(OrgMemory, 'last_used_at'))
    check('EntityComment is polymorphic',
          lambda: hasattr(EntityComment, 'entity_kind') and hasattr(EntityComment, 'entity_id'))

    from app.models import User
    check('User has TOTP columns',
          lambda: hasattr(User, 'totp_secret') and hasattr(User, 'totp_enabled'))
    check('User has lockout columns',
          lambda: hasattr(User, 'failed_login_count') and hasattr(User, 'locked_until'))

    from app.models import Document
    check('Document has extraction lifecycle columns',
          lambda: all(hasattr(Document, c) for c in (
              'extraction_status', 'extraction_started_at',
              'extraction_completed_at', 'extraction_failed_code',
              'extraction_trace_id', 'extraction_used_native_pdf',
          )))

    # --- 5. Security invariants -----------------------------------
    from app.utils.rate_policies import POLICIES
    check('rate policy ai_extraction registered',
          lambda: 'ai_extraction' in POLICIES)
    check('rate policy ai_heavy stricter than ai_extraction',
          lambda: POLICIES['ai_heavy'].max_calls < POLICIES['ai_extraction'].max_calls)
    check('rate policy login is IP-scoped',
          lambda: POLICIES['login'].scope == 'ip')

    from app.services import ai_mock
    check('ai_mock.gate returns False when env is unset',
          lambda: (os.environ.pop('AI_MOCK_MODE', None) is not None or True) and not ai_mock.gate())

    # CSP middleware must include block-all-mixed-content.
    mw_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        'app', 'middleware.py',
    )
    with open(mw_path, encoding='utf-8') as f:
        mw_src = f.read()
    check('CSP includes block-all-mixed-content',
          lambda: 'block-all-mixed-content' in mw_src)
    check('CSP forbids object-src',
          lambda: "object-src 'none'" in mw_src)
    check('CSP frame-ancestors none',
          lambda: "frame-ancestors 'none'" in mw_src)

    # --- Done -----------------------------------------------------
    print('=' * 60)
    print(f'  Results: {PASS} passed, {FAIL} failed')
    if FAIL:
        print('  FAILURES:')
        for label, detail in ERRORS:
            print(f'    - {label}: {detail}')
        sys.exit(1)
    print('  All invariants hold.')


if __name__ == '__main__':
    main()
