#!/usr/bin/env python3
"""
Kuja — Strict user-flow tests (focused harness).

Runs ONLY the Phase 32 strict tests from browser_test.py. Faster
feedback loop than the full 109-test suite when iterating on the
specific bugs the team's 2026-05-16 sweep flagged:

  - /api/api/... double-prefix
  - chat composer disabled
  - reviewer 429 noise
  - raw i18n keys in sidebar
  - dashboard hero "unavailable" text

Usage:
  py -3 browser_test_strict.py --local
  py -3 browser_test_strict.py --base https://prod
"""

import io
import sys

# Force UTF-8 stdout so Arabic/Somali strings in assertions don't crash.
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import browser_test as bt


def main():
    use_local = "--local" in sys.argv
    base = bt.BASE_URL
    if use_local:
        print("[setup] starting local Flask...")
        base = bt.start_local_server()
        print(f"[setup] base = {base}")
    elif "--base" in sys.argv:
        idx = sys.argv.index("--base")
        base = sys.argv[idx + 1]
        print(f"[setup] base = {base}")

    from playwright.sync_api import sync_playwright

    strict_tests = [
        ("32.1 Donor dashboard: no failed API calls", bt.test_32_1_donor_dashboard_no_failed_api_calls),
        ("32.2 /donors/<id>: no failed API calls", bt.test_32_2_donor_public_profile_no_failed_api_calls),
        ("32.3 /trust: no failed API calls", bt.test_32_3_ngo_trust_profile_no_failed_api_calls),
        ("32.4 /reports/<id>: no /api/api double-prefix", bt.test_32_4_report_detail_no_failed_api_calls),
        ("32.5 /admin/audit-chain: no failed API calls", bt.test_32_5_admin_audit_chain_no_failed_api_calls),
        ("32.6 /chat composer becomes interactive", bt.test_32_6_chat_composer_becomes_interactive),
        ("32.7 Reviewer dashboard: no 429 polling noise", bt.test_32_7_reviewer_dashboard_no_429_noise),
        ("32.8 No raw i18n keys in sidebar", bt.test_32_8_no_raw_i18n_keys_visible),
        ("32.9 Donor dashboard hero shows content", bt.test_32_9_donor_dashboard_briefing_card_shows_content),
    ]

    bt.current_cat = "STRICT"
    passes = fails = errors = 0
    failures = []
    print(f"\n[run] {len(strict_tests)} strict user-flow tests against {base}\n")
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)

        # Pre-create one context per test role. Each role logs in EXACTLY
        # ONCE; subsequent tests for the same role re-use that context's
        # cookie jar. Avoids the per-test login storm that locked out
        # fatima@amani.org during back-to-back runs (>=5 attempts in
        # 15min triggers the email-lockout middleware).
        contexts = {}
        def get_ctx_for(role: str):
            if role not in contexts:
                contexts[role] = browser.new_context(viewport={"width": 1280, "height": 800})
            return contexts[role]

        # Map each test to the role it logs in as so we can pre-warm.
        test_roles = {
            "32.1": "donor", "32.2": "admin", "32.3": "ngo", "32.4": "ngo",
            "32.5": "admin", "32.6": "ngo", "32.7": "reviewer",
            "32.8": "admin", "32.9": "donor",
        }

        # Monkey-patch login_as to skip if already authenticated in this context.
        original_login_as = bt.login_as
        def cached_login_as(page, base, email, password=bt.PASS, timeout=15000):
            # Check if we already have an auth cookie that works.
            try:
                page.goto(f"{base}/dashboard", wait_until="domcontentloaded", timeout=10000)
                page.wait_for_timeout(800)
                if "/login" not in page.url:
                    return True  # session is alive, skip login
            except Exception:
                pass
            return original_login_as(page, base, email, password, timeout)
        bt.login_as = cached_login_as

        for name, fn in strict_tests:
            role_key = name.split()[0]  # "32.1"
            role = test_roles.get(role_key, "ngo")
            context = get_ctx_for(role)
            page = context.new_page()
            ctx = {"base": base, "csp_errors": [], "js_errors": [], "failed_requests": []}
            bt.setup_console_listeners(page, ctx)
            try:
                fn(page, ctx)
                passes += 1
                bt._safe_print(f"  [PASS] {name}")
            except AssertionError as e:
                fails += 1
                msg = str(e)[:500]
                failures.append((name, "FAIL", msg))
                bt._safe_print(f"  [FAIL] {name}\n         {msg}")
            except Exception as e:
                errors += 1
                msg = f"{type(e).__name__}: {str(e)[:500]}"
                failures.append((name, "ERROR", msg))
                bt._safe_print(f"  [ERR ] {name}\n         {msg}")
            finally:
                page.close()

        for c in contexts.values():
            c.close()
        browser.close()

    print(f"\n{'=' * 60}")
    print(f"  STRICT RESULTS: {passes}/{len(strict_tests)} PASS · {fails} fail · {errors} error")
    print(f"{'=' * 60}")
    if failures:
        print("\nFAILURES:")
        for n, k, m in failures:
            bt._safe_print(f"  [{k}] {n}\n       {m}\n")
    sys.exit(1 if (fails + errors) else 0)


if __name__ == "__main__":
    main()
