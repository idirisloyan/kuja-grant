#!/usr/bin/env python3
"""
test_pilot_hygiene.py — cross-persona live data-hygiene probe (Kuja Marketplace).

The 14-Aug pilot review caught defects that an in-process/API happy-path test
(test_core_lifecycle.py — proves the code path) is BLIND to, because they are
about the actual data a real user sees across surfaces: synthetic records in
queues, NGO drafts leaking to donors, counts that don't reconcile, and future
timestamps. This probe logs in as each persona against a LIVE deployment and
asserts the properties the team checked by hand, so a regression fails CI/QA
instead of a human.

It is deliberately assertion-only and read-only (no writes), safe to run against
production. Pair it with a browser walkthrough for layout/overflow defects that
only render (see docs — mobile 360x800 is a visual check, not an API one).

Usage:
    KUJA_URL=https://web-production-6f8a.up.railway.app python test_pilot_hygiene.py
"""

import os
import re
import sys
import datetime as dt
import requests

BASE = os.getenv("KUJA_URL", "https://web-production-6f8a.up.railway.app")
PW = os.getenv("KUJA_DEMO_PASSWORD", "pass123")
DONOR = "sarah@globalhealth.org"
NGO = "fatima@amani.org"
REVIEWER = "james@reviewer.org"
HDR = {"X-Requested-With": "XMLHttpRequest"}

# Mirror of app/utils/test_artifact_titles.is_test_artifact_title — kept in sync
# so the probe flags synthetic grants that leaked into a user-facing list.
_LEGACY = {
    "Apply Entry Test Grant", "Draft Save Test", "Draft Update Test", "Empty PDF Test",
    "Error Test", "Exe Test", "Feedback Test", "Oversized Test", "Regression Grant",
    "Tiny Test", "Valid TXT Test", "Wizard E2E Grant", "X", "Oversize Test Grant",
    "Draft Grant", "App002 Test Grant", "Smoke Test", "kuja manual extract doc",
    "retest doc", "retest doc2", "publish probe latest", "health", "climate",
}
_PATTERNS = [re.compile(p) for p in (
    r"E2E Test Grant \d{10,13}", r"SOAK-?\d{10,13}-\d+", r"SOAK30-\d{10,13}-\d+",
    r"BROWSER E2E \d{10,13}", r"API CORE RETEST \d{10,13}", r".+ \d{10,13}",
)]


def looks_synthetic(title):
    t = (title or "").strip()
    if not t or t.startswith("[E2E-TEST]") or t in _LEGACY:
        return True
    return any(p.fullmatch(t) for p in _PATTERNS)


results = []


def check(name, ok, detail=""):
    results.append((ok, name, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" -- {detail}" if detail and not ok else ""))


def login(email):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": PW}, headers=HDR, timeout=20)
    assert r.status_code == 200, f"login {email} -> {r.status_code}"
    return s


def all_apps(s):
    out, page = [], 1
    while page <= 40:
        r = s.get(f"{BASE}/api/applications?page={page}&per_page=100", headers=HDR, timeout=25)
        if r.status_code != 200:
            break
        j = r.json()
        rows = j if isinstance(j, list) else j.get("applications", [])
        out += rows
        if len(rows) < 100:
            break
        page += 1
    return out


def all_grants(s):
    out, page = [], 1
    while page <= 40:
        r = s.get(f"{BASE}/api/grants?page={page}&per_page=100", headers=HDR, timeout=25)
        if r.status_code != 200:
            break
        j = r.json()
        rows = j if isinstance(j, list) else j.get("grants", [])
        out += rows
        if len(rows) < 100:
            break
        page += 1
    return out


def is_future(iso):
    if not iso:
        return False
    try:
        d = dt.datetime.fromisoformat(iso.replace("Z", "+00:00"))
        if d.tzinfo is None:
            d = d.replace(tzinfo=dt.timezone.utc)
        return d > dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=5)
    except Exception:
        return False


def main():
    print("=" * 68)
    print(f"KUJA PILOT HYGIENE PROBE — {BASE}")
    print("=" * 68)

    donor, ngo, rev = login(DONOR), login(NGO), login(REVIEWER)

    # 1. No NGO drafts ever reach donor / reviewer queues (privacy + clutter).
    d_apps = all_apps(donor)
    d_drafts = [a for a in d_apps if a.get("status") == "draft"]
    check("donor review queue contains ZERO draft applications", len(d_drafts) == 0,
          f"{len(d_drafts)} drafts leaked")
    r_apps = all_apps(rev)
    r_drafts = [a for a in r_apps if a.get("status") == "draft"]
    check("reviewer queue contains ZERO draft applications", len(r_drafts) == 0,
          f"{len(r_drafts)} drafts leaked")

    # 2. No synthetic/test grants ACTIVE in the marketplace. A test grant that
    #    was withdrawn (soft-deleted) is out of the applyable marketplace and
    #    the donor's active view; only open/draft/closed synthetic grants are
    #    the "records hiding real work" the pilot flagged.
    d_grants = all_grants(donor)
    synth = [g for g in d_grants
             if looks_synthetic(g.get("title")) and g.get("status") != "withdrawn"]
    check("no synthetic/test grant is active in the donor marketplace", len(synth) == 0,
          f"{len(synth)} active synthetic grants (e.g. {synth[0].get('title') if synth else ''})")

    # 3. No future timestamps on visible applications ("Updated in future").
    future = [a for a in (d_apps + r_apps)
              if is_future(a.get("updated_at")) or is_future(a.get("created_at")) or is_future(a.get("submitted_at"))]
    check("no application carries a future timestamp", len(future) == 0,
          f"{len(future)} future-dated (e.g. app {future[0].get('id') if future else ''})")

    # 4. Criterion-aware AI is demonstrable: at least one PUBLISHED (open) grant
    #    carries >=3 weighted criteria. (The pilot flagged that the only grant
    #    left behind by the E2E suite had no criteria; after the synthetic purge
    #    the surviving real grants — WASH, Community Health Workers — do.)
    demoable = None
    for g in d_grants:
        if g.get("status") != "open":
            continue
        det = donor.get(f"{BASE}/api/grants/{g['id']}", headers=HDR, timeout=20).json()
        det = det.get("grant", det)
        crit = det.get("criteria") or []
        if len(crit) >= 3 and all(c.get("weight") for c in crit):
            demoable = (g.get("title"), len(crit)); break
    check("a published grant has >=3 weighted criteria (criterion-aware AI demoable)",
          demoable is not None, "no open grant with weighted criteria found")

    # 5. Count reconciliation: the donor's "awaiting review" figure agrees with
    #    the actual submitted/under_review applications the donor can list.
    listable_awaiting = sum(1 for a in d_apps if a.get("status") in ("submitted", "under_review"))
    ds = donor.get(f"{BASE}/api/dashboard/stats", headers=HDR, timeout=20)
    if ds.status_code == 200:
        stats = ds.json()
        stats = stats.get("stats", stats)  # /dashboard/stats nests under 'stats'
        awaiting = None
        for k in ("applications_awaiting_review", "awaiting_review", "pending_review", "to_review"):
            if isinstance(stats.get(k), int):
                awaiting = stats[k]; break
        if awaiting is not None:
            check("dashboard 'awaiting review' reconciles with the review list",
                  awaiting == listable_awaiting,
                  f"dashboard={awaiting} vs listable submitted/under_review={listable_awaiting}")
        else:
            print(f"  [i]  dashboard 'awaiting review' key not found; listable submitted/under_review={listable_awaiting}")
    print("-" * 68)
    passed = sum(1 for r in results if r[0])
    print(f"RESULT: {passed}/{len(results)} hygiene checks passed")
    print("=" * 68)


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print(f"*** probe setup failed: {e}")
        sys.exit(2)
    sys.exit(1 if any(not r[0] for r in results) else 0)
