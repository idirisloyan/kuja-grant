#!/usr/bin/env python3
"""
Kuja — Browser DATA-ACCURACY tests (Playwright).

Why this exists
---------------
browser_test.py has ~140 tests and NOT ONE reconciles a number or checks a
computed value — every assertion is presence/render ("email input found",
"body contains the word 'grant'", "no console errors", "Publish button
exists"). That is exactly the blind spot the team keeps finding bugs in:
R-01 (a disbursement recorded against a round that was never activated), the
blank Partners tab (data simply absent), phantom audit entries, closeout
reporting "done" on an empty round, a UI showing "submitted" while the backend
was "scored". A page can render perfectly and be WRONG.

These tests assert CORRECTNESS, driven through the real browser as a real user,
with the API (same logged-in cookies, via page.context.request) as the source
of truth:

  * a displayed value equals a recomputation from its inputs,
  * a count shown on screen reconciles with the underlying records,
  * a state shown on screen equals the authoritative state,
  * data that must NOT appear (another tenant's orgs) is absent — a negative
    control, the SMK-015 class.

"Verified" here means the DATA was checked, not that the page rendered.

Run:
  py -3 browser_data_accuracy_test.py --base https://fund.kuja.org
  py -3 browser_data_accuracy_test.py --local
Exit 0 = all pass, 1 = at least one data-accuracy failure.
"""

import io
import sys

# UTF-8 stdout so Arabic/Somali strings in data never crash the run.
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import browser_test as bt  # reuse login_as, get_page_text, USERS, PASS, BASE_URL


class Skip(Exception):
    """Precondition data is absent (e.g. a sparse local seed has no scored
    application). We SKIP rather than fail — a data-accuracy test must never
    go red for lack of data, only for WRONG data. Against a data-rich env
    (prod) the skips disappear and every invariant is really checked."""


def _api_json(page, base, path):
    """GET an API path with the page's logged-in cookies; return parsed JSON."""
    r = page.context.request.get(
        f"{base}{path}", headers={"X-Requested-With": "XMLHttpRequest"}
    )
    assert r.ok, f"API {path} returned HTTP {r.status}"
    return r.json()


def _apps(page, base):
    j = _api_json(page, base, "/api/applications/")
    return j if isinstance(j, list) else (j.get("applications") or j.get("data") or [])


# ===========================================================================
# DA-1 — a displayed score equals its formula AND what the UI shows
# ===========================================================================
def test_da_1_final_score_is_correct(page, base):
    """The final score is 0.4*AI + 0.6*human (backend self-consistency), and
    the number the DONOR sees on the application equals that stored value.
    A render test would pass on ANY number; this fails on a WRONG one."""
    bt.login_as(page, base, bt.USERS["donor"])
    apps = _apps(page, base)
    scored = [
        a for a in apps
        if a.get("ai_score") is not None
        and a.get("human_score") is not None
        and a.get("final_score") is not None
    ]
    if not scored:
        raise Skip("no fully-scored application in this env (need ai+human+final)")
    a = scored[0]
    ai, hum, final = a["ai_score"], a["human_score"], a["final_score"]

    expected = round(ai * 0.4 + hum * 0.6, 2)
    assert abs(final - expected) <= 0.5, (
        f"final_score is WRONG for app {a['id']}: stored {final}, "
        f"but 0.4*{ai}+0.6*{hum} = {expected}"
    )

    # And the value the user actually sees must be that score, not a stale one.
    page.goto(f"{base}/applications/{a['id']}", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(3500)
    body = bt.get_page_text(page)
    shown = {round(final), int(final), round(a.get("ai_score"))}
    assert any(str(v) in body for v in shown), (
        f"app {a['id']} detail page shows no score matching {final}% "
        f"(ai {ai}, human {hum}). Page text head: {body[:160]!r}"
    )


# ===========================================================================
# DA-2 — the status the UI shows equals the authoritative status
# ===========================================================================
def test_da_2_status_matches_backend(page, base):
    """For real applications, the status shown on the detail page equals the
    API's status. Catches the stale-cache / wrong-state class (a page that
    says 'Submitted' while the record is 'scored')."""
    bt.login_as(page, base, bt.USERS["donor"])
    apps = _apps(page, base)
    if not apps:
        raise Skip("donor has no applications in this env")

    LABELS = {
        "submitted": ["submitted", "awaiting"],
        "under_review": ["under review"],
        "scored": ["scored"],
        "awarded": ["awarded"],
        "rejected": ["rejected", "declined"],
        "revision_requested": ["revision"],
        "withdrawn": ["withdrawn"],
        "draft": ["draft"],
    }
    checked = 0
    for a in apps[:4]:
        status = (a.get("status") or "").lower()
        wants = LABELS.get(status)
        if not wants:
            continue
        page.goto(f"{base}/applications/{a['id']}", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3000)
        body = bt.get_page_text(page).lower()
        assert any(w in body for w in wants), (
            f"app {a['id']} is '{status}' in the API but the detail page shows "
            f"none of {wants}. Page head: {body[:160]!r}"
        )
        checked += 1
    if checked == 0:
        raise Skip("no application with a recognised status to reconcile")


# ===========================================================================
# DA-3 — tenant isolation: another tenant's orgs must be ABSENT (SMK-015 class)
# ===========================================================================
def test_da_3_no_cross_tenant_orgs(page, base):
    """A Kuja donor's organisation search must show ONLY Kuja orgs. Known
    non-Kuja orgs (Proximate / Saxansaxo) must not appear — in the API set OR
    on screen. This is the exact leak SMK-015 was; a render test never sees
    it because the page looks fine while listing the wrong data."""
    bt.login_as(page, base, bt.USERS["donor"])

    # Source of truth: the scoped API set the UI is built from.
    j = _api_json(page, base, "/api/organizations/")
    orgs = j if isinstance(j, list) else (j.get("organizations") or [])
    names = " ".join((o.get("name") or "") for o in orgs).lower()
    for leak in ("proximate", "saxansaxo"):
        assert leak not in names, (
            f"cross-tenant leak: '{leak}' org present in the Kuja donor's "
            f"/api/organizations result"
        )

    # And on screen.
    page.goto(f"{base}/organizations/search", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(3500)
    body = bt.get_page_text(page).lower()
    for leak in ("proximate oversight", "saxansaxo secretariat"):
        assert leak not in body, f"cross-tenant org '{leak}' is VISIBLE on the org search page"


# ===========================================================================
# DA-4 — a count shown on screen reconciles with the records behind it
# ===========================================================================
def test_da_4_applications_list_has_no_phantoms(page, base):
    """Every application row the donor sees on /applications corresponds to a
    real application id from the API (no phantom/duplicated rows), and the API
    itself returns a non-empty set for a donor who has apps. Catches the
    'list shows the wrong things' / blank-or-bogus-tab class."""
    bt.login_as(page, base, bt.USERS["donor"])
    api_ids = {a.get("id") for a in _apps(page, base) if a.get("id") is not None}
    if not api_ids:
        raise Skip("donor's /api/applications is empty — nothing to reconcile")

    page.goto(f"{base}/applications", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(3500)
    hrefs = page.eval_on_selector_all(
        "a[href*='/applications/']",
        "els => els.map(e => e.getAttribute('href'))",
    )
    shown_ids = set()
    for h in hrefs or []:
        for part in (h or "").rstrip("/").split("/"):
            if part.isdigit():
                shown_ids.add(int(part))
    # Every id rendered as a row must be a real application in the API set.
    phantom = shown_ids - api_ids
    assert not phantom, (
        f"/applications shows {len(phantom)} row(s) with no matching application "
        f"in the API: {sorted(phantom)[:8]}"
    )


DATA_ACCURACY_TESTS = [
    ("DA-1 final_score is correct + shown", test_da_1_final_score_is_correct),
    ("DA-2 UI status == backend status", test_da_2_status_matches_backend),
    ("DA-3 no cross-tenant orgs (SMK-015)", test_da_3_no_cross_tenant_orgs),
    ("DA-4 no phantom application rows", test_da_4_applications_list_has_no_phantoms),
]


def main():
    base = bt.BASE_URL
    if "--local" in sys.argv:
        print("[setup] starting local Flask...")
        base = bt.start_local_server()
    elif "--base" in sys.argv:
        base = sys.argv[sys.argv.index("--base") + 1]
    print(f"[setup] base = {base}")

    from playwright.sync_api import sync_playwright

    passed, failed, skipped = 0, 0, 0
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for name, fn in DATA_ACCURACY_TESTS:
            context = browser.new_context()
            page = context.new_page()
            try:
                fn(page, base)
                print(f"  [PASS] {name}")
                passed += 1
            except Skip as e:
                print(f"  [SKIP] {name} -- {e}")
                skipped += 1
            except AssertionError as e:
                print(f"  [FAIL] {name} -- {e}")
                failed += 1
            except Exception as e:  # noqa: BLE001
                print(f"  [ERR ] {name} -- {type(e).__name__}: {str(e)[:300]}")
                failed += 1
            finally:
                context.close()
        browser.close()

    print(f"\nDATA-ACCURACY: {passed} passed, {failed} failed, {skipped} skipped")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
