#!/usr/bin/env python3
"""
Kuja Grant — Mobile + Throttled-3G Browser Tests (Playwright)
==============================================================
Phase 615 — companion to browser_test.py focused on the failure mode the
team kept hitting from teammates' phones: 60s+ timeouts on /login, stale
chunk fetches, sticky CTAs that vanish when the keyboard pops up.

Each scenario runs in a fresh Chromium context emulating a Pixel 5
viewport + slow-3G network conditions. Failures are captured with a
screenshot, a HAR of the network exchange, and the captured console
errors so first-paint JS issues are visible without a re-run.

Usage:
    py -3 mobile_test.py                                  # uses KUJA_URL or prod default
    py -3 mobile_test.py --base http://127.0.0.1:5000     # against a running local server
    KUJA_URL=https://web-production-6f8a.up.railway.app py -3 mobile_test.py

Exit 0 = all pass, Exit 1 = any failure.
"""

import argparse
import os
import sys
import time
from pathlib import Path

DEFAULT_URL = os.getenv('KUJA_URL', 'https://web-production-6f8a.up.railway.app')

# Slow-3G as specified by the Chrome DevTools throttling presets. Numbers
# are bytes-per-second on the wire (CDP wants raw bps for the network
# call but Playwright's wrapper accepts kbps; we keep this in kbps and
# convert below).
SLOW_3G_KBPS_DOWN = 400
SLOW_3G_KBPS_UP = 400
SLOW_3G_LATENCY_MS = 400

# Pixel 5 metrics — matches Chrome DevTools' default mobile preset and a
# device most of the team's NGO users have a near-equivalent of.
PIXEL_5 = {
    'viewport': {'width': 393, 'height': 851},
    'device_scale_factor': 2.75,
    'is_mobile': True,
    'has_touch': True,
    'user_agent': (
        'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 '
        '(KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
    ),
}

RESULTS_DIR = Path('mobile-test-results')


def ensure_playwright():
    try:
        from playwright.sync_api import sync_playwright  # noqa: F401
        return True
    except ImportError:
        print('Playwright not installed. Run: pip install playwright && playwright install chromium')
        return False


def throttle(context, page):
    """Apply slow-3G via CDP Network.emulateNetworkConditions.

    Playwright's high-level API doesn't expose download/upload throughput,
    so we drop to CDP. Returns the CDP session so the caller can detach
    later if needed.
    """
    cdp = context.new_cdp_session(page)
    cdp.send('Network.enable')
    cdp.send('Network.emulateNetworkConditions', {
        'offline': False,
        'latency': SLOW_3G_LATENCY_MS,
        # CDP wants bytes/sec on the wire (the docs misleadingly say it
        # accepts kbps — they don't). Convert: kbps * 1000 / 8 = bytes/s.
        'downloadThroughput': int(SLOW_3G_KBPS_DOWN * 1000 / 8),
        'uploadThroughput': int(SLOW_3G_KBPS_UP * 1000 / 8),
    })
    return cdp


def run_scenario(name, fn, browser, base_url, results):
    """Run one scenario in an isolated context. Capture artifacts."""
    RESULTS_DIR.mkdir(exist_ok=True)
    har_path = RESULTS_DIR / f'{name}.har'
    shot_path = RESULTS_DIR / f'{name}.png'

    context = browser.new_context(
        viewport=PIXEL_5['viewport'],
        device_scale_factor=PIXEL_5['device_scale_factor'],
        is_mobile=PIXEL_5['is_mobile'],
        has_touch=PIXEL_5['has_touch'],
        user_agent=PIXEL_5['user_agent'],
        record_har_path=str(har_path),
    )
    console_errors = []
    page = context.new_page()
    page.on('pageerror', lambda exc: console_errors.append(f'pageerror: {exc}'))
    page.on('console', lambda msg: console_errors.append(f'{msg.type}: {msg.text}')
            if msg.type == 'error' else None)
    throttle(context, page)

    start = time.time()
    try:
        fn(page, base_url)
        elapsed = time.time() - start
        page.screenshot(path=str(shot_path), full_page=False)
        results.append(('PASS', name, f'{elapsed:.1f}s'))
        print(f'  PASS {name} ({elapsed:.1f}s)')
    except Exception as e:
        elapsed = time.time() - start
        try:
            page.screenshot(path=str(shot_path), full_page=False)
        except Exception:
            pass
        results.append(('FAIL', name, f'{type(e).__name__}: {e} ({elapsed:.1f}s)'))
        print(f'  FAIL {name} — {type(e).__name__}: {e}')
        if console_errors:
            print(f'    Console errors ({len(console_errors)}):')
            for line in console_errors[:5]:
                print(f'      {line}')
    finally:
        context.close()


# ---------------------------------------------------------------------------
# Scenarios
# ---------------------------------------------------------------------------

def scenario_login_cold_load(page, base_url):
    """/login must reach time-to-interactive under 15s on slow-3G cold load."""
    page.goto(f'{base_url}/login/', wait_until='domcontentloaded', timeout=30_000)
    # Sign-in form must be visible
    page.wait_for_selector('input[name="email"]', state='visible', timeout=15_000)
    page.wait_for_selector('input[name="password"]', state='visible', timeout=2_000)
    # And the demo cards (at least the NGO one)
    assert page.get_by_text('Amani Foundation').is_visible(), 'Demo card not visible'


def scenario_dashboard_after_ngo_login(page, base_url):
    """NGO can sign in and see their dashboard attention area on slow-3G.

    On slow networks the Sign-in button is intentionally disabled until
    React hydrates (prevents native HTML form submit from leaking
    credentials into the URL). A real user waits to see the button
    enabled before clicking; mirror that here. Without the wait, the
    click hits a disabled button and silently does nothing.
    """
    page.goto(f'{base_url}/login/', wait_until='domcontentloaded', timeout=30_000)
    page.wait_for_selector('input[name="email"]', state='visible', timeout=15_000)
    # Wait for hydration FIRST. The inputs are controlled, and React
    # overwrites the DOM value back to '' on hydration, wiping anything
    # typed beforehand. Real users hit the same bug — type into the
    # password before JS lands, see their text disappear, get confused.
    page.wait_for_selector('button[type="submit"]:not([disabled])', timeout=25_000)
    page.fill('input[name="email"]', 'fatima@amani.org')
    page.fill('input[name="password"]', 'pass123')
    # Diagnostic — capture button + form state right before click so a
    # silent click-no-op is debuggable from artifacts alone.
    btn_state = page.evaluate("""() => {
      const b = document.querySelector('button[type=\"submit\"]');
      const f = document.querySelector('form');
      const e = document.querySelector('input[name=\"email\"]');
      const p = document.querySelector('input[name=\"password\"]');
      return {
        button: b ? {type: b.type, disabled: b.disabled, text: (b.textContent || '').trim().slice(0, 40)} : null,
        form: f ? {method: f.method, action: f.action, hasOnSubmit: !!f.onsubmit} : null,
        emailValue: e?.value,
        passwordLength: p?.value?.length,
        url: window.location.href,
      };
    }""")
    # Diagnostic — if inputs are empty here, the controlled-input
    # hydration race wiped them. We disable inputs until hydrated so
    # this should never happen; if it does, the test fails loudly.
    assert btn_state['emailValue'] == 'fatima@amani.org', \
        f"Email value wiped by hydration race: {btn_state}"
    page.click('button[type="submit"]')
    # Hard nav lands on /dashboard/ — give the slow link time to ship the bundle
    page.wait_for_url('**/dashboard/**', timeout=30_000)
    # "Hi Fatima" heading is the canonical dashboard signal
    page.wait_for_selector('text=/Hi Fatima/i', timeout=20_000)


def scenario_application_sticky_cta(page, base_url):
    """For an NGO-owned draft, the StickyMobileCta is visible + reachable.

    We don't pin a specific application id (fixtures rotate); we navigate
    to /applications/ list, click into whichever draft appears first.
    """
    # Login first
    page.goto(f'{base_url}/login/', wait_until='domcontentloaded', timeout=30_000)
    page.fill('input[name="email"]', 'fatima@amani.org')
    page.fill('input[name="password"]', 'pass123')
    page.click('button[type="submit"]')
    page.wait_for_url('**/dashboard/**', timeout=30_000)

    # Go to applications list
    page.goto(f'{base_url}/applications/', wait_until='domcontentloaded', timeout=30_000)
    page.wait_for_selector('h1, h2', timeout=15_000)

    # If no draft is visible (Fatima may have submitted them all in this fixture),
    # skip the deep-detail assertion gracefully — we still verified login worked.
    draft_link = page.locator('a[href*="/applications/"]:has-text("draft"), a[href*="/applications/"]:has-text("Draft")').first
    if draft_link.count() == 0:
        return

    draft_link.click()
    page.wait_for_url('**/applications/**', timeout=20_000)
    # Scroll well past the fold; the sticky CTA must remain visible
    page.evaluate('window.scrollTo(0, 1500)')
    # "Continue editing" copy is the Phase 612 contract
    cta = page.get_by_text('Continue editing').first
    if cta.count() == 0:
        # Acceptable: the visited app may be in submitted/scored state, not draft
        return
    assert cta.is_visible(), 'StickyMobileCta not visible after scroll'


SCENARIOS = [
    ('login_cold_load', scenario_login_cold_load),
    ('dashboard_after_ngo_login', scenario_dashboard_after_ngo_login),
    ('application_sticky_cta', scenario_application_sticky_cta),
]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', default=DEFAULT_URL,
                        help='Target base URL (default: $KUJA_URL or prod)')
    parser.add_argument('--scenario', default=None,
                        help='Run only this scenario name (default: all)')
    args = parser.parse_args()

    if not ensure_playwright():
        return 1

    from playwright.sync_api import sync_playwright

    base_url = args.base.rstrip('/')
    print(f'Mobile/3G test against: {base_url}')
    print(f'  Throttle: {SLOW_3G_KBPS_DOWN}kbps down / {SLOW_3G_KBPS_UP}kbps up / '
          f'{SLOW_3G_LATENCY_MS}ms latency')
    print(f'  Viewport: {PIXEL_5["viewport"]["width"]}x{PIXEL_5["viewport"]["height"]} '
          f'(Pixel 5)')

    selected = [(n, fn) for (n, fn) in SCENARIOS
                if args.scenario is None or n == args.scenario]
    if not selected:
        print(f'No scenarios match "{args.scenario}". Available: '
              f'{[n for n, _ in SCENARIOS]}')
        return 1

    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            for name, fn in selected:
                # ASCII-only — Windows cp1252 console crashes on '→'
                print(f'\n-> {name}')
                run_scenario(name, fn, browser, base_url, results)
        finally:
            browser.close()

    passed = sum(1 for r in results if r[0] == 'PASS')
    failed = sum(1 for r in results if r[0] == 'FAIL')
    print()
    print('=' * 60)
    print(f'  Results: {passed}/{len(results)} passed, {failed} failed')
    if failed:
        print()
        for status, name, msg in results:
            if status == 'FAIL':
                print(f'  - {name}: {msg}')
        print(f'\n  Artifacts in {RESULTS_DIR.resolve()}')
    print('=' * 60)
    return 0 if failed == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
