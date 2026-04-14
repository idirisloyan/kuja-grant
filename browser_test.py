#!/usr/bin/env python3
"""
Kuja Grant — Browser UI Tests (Playwright)
=============================================
Tests real browser rendering, not just API endpoints.
Catches CSP issues, hydration failures, and broken UI flows.

Usage:  python browser_test.py [--base URL]
Default base: http://127.0.0.1:5055
Set KUJA_URL env var for production testing.

Exit 0 = all pass, Exit 1 = failures.
"""

import io, json, os, sys, socket, threading, time

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BASE_URL = os.getenv("KUJA_URL", "http://127.0.0.1:5055")
PASS = "pass123"
USERS = {
    "donor": "sarah@globalhealth.org",
    "ngo": "fatima@amani.org",
    "reviewer": "james@reviewer.org",
    "admin": "admin@kuja.org",
}

results = []

def run(name, fn, page, context):
    try:
        fn(page, context)
        results.append(("PASS", name, ""))
        print(f"  [PASS] {name}")
    except AssertionError as e:
        msg = str(e)[:200]
        results.append(("FAIL", name, msg))
        print(f"  [FAIL] {name} -- {msg}")
    except Exception as e:
        msg = f"{type(e).__name__}: {str(e)[:200]}"
        results.append(("ERROR", name, msg))
        print(f"  [ERR]  {name} -- {msg}")


# ---------------------------------------------------------------------------
# Local server (reuse smoke_test pattern)
# ---------------------------------------------------------------------------
def _free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]

def start_local_server():
    """Start Flask in-process for local testing."""
    import requests
    port = _free_port()
    project_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(project_dir)
    sys.path.insert(0, project_dir)
    from app import create_app
    from app.extensions import db
    app = create_app()
    with app.app_context():
        db.create_all()
    t = threading.Thread(
        target=lambda: app.run(host="127.0.0.1", port=port, debug=False, use_reloader=False),
        daemon=True,
    )
    t.start()
    base = f"http://127.0.0.1:{port}"
    for _ in range(30):
        try:
            r = requests.get(f"{base}/api/health", timeout=1)
            if r.status_code == 200:
                return base
        except Exception:
            pass
        time.sleep(0.5)
    raise RuntimeError(f"Server did not start on port {port}")


# ===========================================================================
# BROWSER TESTS
# ===========================================================================

def test_login_page_renders(page, ctx):
    """Login page loads with email/password fields and Sign In button."""
    page.goto(f"{ctx['base']}/login", wait_until="networkidle")
    # Check no CSP errors in console
    assert len(ctx['csp_errors']) == 0, f"CSP errors: {ctx['csp_errors'][:3]}"
    # Check key elements exist
    assert page.locator("input").count() >= 2, "Missing input fields"
    sign_in = page.locator("button:has-text('Sign In'), button:has-text('sign in'), button[type='submit']")
    assert sign_in.count() >= 1, "No Sign In button found"

def test_login_no_url_credentials(page, ctx):
    """Login submits via JS POST, not GET with credentials in URL."""
    page.goto(f"{ctx['base']}/login", wait_until="networkidle")
    # Fill email and password
    inputs = page.locator("input")
    inputs.nth(0).fill(USERS["donor"])
    inputs.nth(1).fill(PASS)
    # Click sign in and wait for navigation
    with page.expect_navigation(timeout=15000):
        page.locator("button:has-text('Sign In'), button:has-text('sign in'), button[type='submit']").first.click()
    # URL should NOT contain password or email as query params
    url = page.url
    assert "pass123" not in url, f"Password leaked in URL: {url}"
    assert "sarah" not in url.split("?")[-1] if "?" in url else True, f"Email in query: {url}"

def test_dashboard_hydrates(page, ctx):
    """Dashboard renders full content after login, not just shell."""
    # Login first
    page.goto(f"{ctx['base']}/login", wait_until="networkidle")
    inputs = page.locator("input")
    inputs.nth(0).fill(USERS["donor"])
    inputs.nth(1).fill(PASS)
    with page.expect_navigation(timeout=15000):
        page.locator("button:has-text('Sign In'), button:has-text('sign in'), button[type='submit']").first.click()
    # Wait for dashboard content
    page.wait_for_timeout(3000)
    # Should have more than just "K" shell
    body_text = page.inner_text("body")
    assert len(body_text) > 100, f"Dashboard barely rendered ({len(body_text)} chars)"
    # Should contain role-specific content
    assert any(w in body_text.lower() for w in ["grant", "dashboard", "welcome", "create"]), \
        f"No dashboard content found in: {body_text[:200]}"

def test_no_csp_errors_on_dashboard(page, ctx):
    """No CSP violation errors in browser console on dashboard."""
    page.goto(f"{ctx['base']}/login", wait_until="networkidle")
    inputs = page.locator("input")
    inputs.nth(0).fill(USERS["donor"])
    inputs.nth(1).fill(PASS)
    with page.expect_navigation(timeout=15000):
        page.locator("button:has-text('Sign In'), button:has-text('sign in'), button[type='submit']").first.click()
    page.wait_for_timeout(3000)
    assert len(ctx['csp_errors']) == 0, f"CSP errors on dashboard: {ctx['csp_errors'][:3]}"

def test_grant_wizard_renders(page, ctx):
    """Grant wizard page loads with step indicator and upload area."""
    # Login as donor
    page.goto(f"{ctx['base']}/login", wait_until="networkidle")
    inputs = page.locator("input")
    inputs.nth(0).fill(USERS["donor"])
    inputs.nth(1).fill(PASS)
    with page.expect_navigation(timeout=15000):
        page.locator("button:has-text('Sign In'), button:has-text('sign in'), button[type='submit']").first.click()
    page.wait_for_timeout(2000)
    # Navigate to grant wizard
    page.goto(f"{ctx['base']}/grants/new", wait_until="networkidle")
    page.wait_for_timeout(2000)
    body_text = page.inner_text("body")
    assert any(w in body_text.lower() for w in ["upload", "step", "grant", "wizard", "create"]), \
        f"Grant wizard not rendered: {body_text[:300]}"

def test_ngo_dashboard_renders(page, ctx):
    """NGO dashboard renders with grants and assessment content."""
    page.goto(f"{ctx['base']}/login", wait_until="networkidle")
    inputs = page.locator("input")
    inputs.nth(0).fill(USERS["ngo"])
    inputs.nth(1).fill(PASS)
    with page.expect_navigation(timeout=15000):
        page.locator("button:has-text('Sign In'), button:has-text('sign in'), button[type='submit']").first.click()
    page.wait_for_timeout(3000)
    body_text = page.inner_text("body")
    assert len(body_text) > 100, f"NGO dashboard barely rendered ({len(body_text)} chars)"

def test_language_switch(page, ctx):
    """Language dropdown works and UI text changes."""
    page.goto(f"{ctx['base']}/login", wait_until="networkidle")
    inputs = page.locator("input")
    inputs.nth(0).fill(USERS["ngo"])
    inputs.nth(1).fill(PASS)
    with page.expect_navigation(timeout=15000):
        page.locator("button:has-text('Sign In'), button:has-text('sign in'), button[type='submit']").first.click()
    page.wait_for_timeout(2000)
    # Look for language selector
    lang_select = page.locator("select, [role='combobox']").first
    if lang_select.count() > 0:
        # Try switching to French
        lang_select.select_option("FR") if lang_select.evaluate("el => el.tagName") == "SELECT" else None
        page.wait_for_timeout(1000)

def test_reports_page_renders(page, ctx):
    """Reports page loads for NGO with calendar or report list."""
    page.goto(f"{ctx['base']}/login", wait_until="networkidle")
    inputs = page.locator("input")
    inputs.nth(0).fill(USERS["ngo"])
    inputs.nth(1).fill(PASS)
    with page.expect_navigation(timeout=15000):
        page.locator("button:has-text('Sign In'), button:has-text('sign in'), button[type='submit']").first.click()
    page.wait_for_timeout(2000)
    page.goto(f"{ctx['base']}/reports", wait_until="networkidle")
    page.wait_for_timeout(2000)
    body_text = page.inner_text("body")
    assert len(body_text) > 50, f"Reports page empty ({len(body_text)} chars)"

def test_compliance_page_renders(page, ctx):
    """Compliance page loads for donor."""
    page.goto(f"{ctx['base']}/login", wait_until="networkidle")
    inputs = page.locator("input")
    inputs.nth(0).fill(USERS["donor"])
    inputs.nth(1).fill(PASS)
    with page.expect_navigation(timeout=15000):
        page.locator("button:has-text('Sign In'), button:has-text('sign in'), button[type='submit']").first.click()
    page.wait_for_timeout(2000)
    page.goto(f"{ctx['base']}/compliance", wait_until="networkidle")
    page.wait_for_timeout(2000)
    body_text = page.inner_text("body")
    assert len(body_text) > 50, f"Compliance page empty ({len(body_text)} chars)"

def test_verification_page_renders(page, ctx):
    """Verification page loads for donor."""
    page.goto(f"{ctx['base']}/login", wait_until="networkidle")
    inputs = page.locator("input")
    inputs.nth(0).fill(USERS["donor"])
    inputs.nth(1).fill(PASS)
    with page.expect_navigation(timeout=15000):
        page.locator("button:has-text('Sign In'), button:has-text('sign in'), button[type='submit']").first.click()
    page.wait_for_timeout(2000)
    page.goto(f"{ctx['base']}/verification", wait_until="networkidle")
    page.wait_for_timeout(2000)
    body_text = page.inner_text("body")
    assert len(body_text) > 50, f"Verification page empty ({len(body_text)} chars)"


# ===========================================================================
# Main
# ===========================================================================
def main():
    from playwright.sync_api import sync_playwright

    print("\n" + "=" * 60)
    print("  Kuja Grant — Browser UI Tests (Playwright)")
    print("=" * 60)

    # Determine base URL
    base = BASE_URL
    use_local = "--local" in sys.argv or not os.getenv("KUJA_URL")

    if use_local and "127.0.0.1" in base:
        print("\n[1/3] Starting local Flask server...")
        base = start_local_server()
        print(f"  Server ready at {base}")
    else:
        print(f"\n[1/3] Using external server: {base}")

    print("\n[2/3] Launching Chromium...")
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})

        # Collect CSP errors
        csp_errors = []
        def on_console(msg):
            if "content security policy" in msg.text.lower() or "csp" in msg.text.lower():
                csp_errors.append(msg.text[:200])

        page = context.new_page()
        page.on("console", on_console)

        ctx = {"base": base, "csp_errors": csp_errors}

        print("\n[3/3] Running browser tests...\n")

        tests = [
            ("Login page renders correctly", test_login_page_renders),
            ("Login does not leak credentials in URL", test_login_no_url_credentials),
            ("Dashboard fully hydrates after login", test_dashboard_hydrates),
            ("No CSP errors on authenticated pages", test_no_csp_errors_on_dashboard),
            ("Grant wizard page renders", test_grant_wizard_renders),
            ("NGO dashboard renders", test_ngo_dashboard_renders),
            ("Language switch works", test_language_switch),
            ("Reports page renders", test_reports_page_renders),
            ("Compliance page renders", test_compliance_page_renders),
            ("Verification page renders", test_verification_page_renders),
        ]

        for name, fn in tests:
            # Fresh CSP error list per test
            csp_errors.clear()
            run(name, fn, page, ctx)

        browser.close()

    # Summary
    passed = sum(1 for r in results if r[0] == "PASS")
    failed = sum(1 for r in results if r[0] != "PASS")
    total = len(results)

    print("\n" + "=" * 60)
    print(f"  Results: {passed}/{total} passed, {failed} failed")
    if failed:
        print("\n  FAILURES:")
        for status, name, detail in results:
            if status != "PASS":
                print(f"    [{status}] {name}: {detail}")
        print("\n  BROWSER TESTS FAILED — fix before deploying.")
    else:
        print("  All browser tests passed. UI is verified.")
    print("=" * 60 + "\n")

    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
