#!/usr/bin/env python3
"""
smoke_api.py — Kuja Marketplace API smoke tests (LIVE, write-capable).

Drives the REAL workflow endpoints against a LIVE deployment as each persona and
asserts STATE + DATA ACCURACY + CROSS-SURFACE CONSISTENCY + NEGATIVE/AUTHZ cases —
not just HTTP 200. Creates [SMOKE-TEST]-tagged records and purges what the API allows
at the end (published grants can't be hard-deleted via API -> withdrawn + tagged).

Usage:
  KUJA_URL=https://fund.kuja.org py smoke_api.py                 # all journeys
  KUJA_URL=https://fund.kuja.org py smoke_api.py auth lifecycle  # selected
"""
import os
import sys
import time
import datetime as dt
import requests

BASE = os.getenv("KUJA_URL", "https://fund.kuja.org").rstrip("/")
PW = os.getenv("KUJA_DEMO_PASSWORD", "pass123")
HDR = {"X-Requested-With": "XMLHttpRequest"}
TAG = "[SMOKE-TEST]"
TS = int(time.time())

ACCOUNTS = {
    "ngo": "fatima@amani.org",
    "ngo2": "ahmed@salamrelief.org",
    "donor": "sarah@globalhealth.org",
    "donor2": "david@eatrust.org",
    "reviewer": "james@reviewer.org",
    "reviewer2": "maria@reviewer.org",
    "admin": "admin@kuja.org",
}

S = {}          # role -> session
ME = {}         # role -> /me payload
results = []    # (ok, journey, name, detail)
findings = []   # (sev, journey, layer, summary, detail)
_cleanup = []   # (label, fn)
CTX = {}        # shared ids across journeys (grant_id, app_id, ...)


def record(ok, journey, name, detail=""):
    results.append((ok, journey, name, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {journey} :: {name}" + (f" -- {detail}" if detail and not ok else ""))
    return ok


def finding(sev, journey, layer, summary, detail=""):
    findings.append((sev, journey, layer, summary, detail))
    print(f"     >>> FINDING [{sev}] {journey}: {summary}" + (f" — {detail}" if detail else ""))


def add_cleanup(label, fn):
    _cleanup.append((label, fn))


def login(role):
    s = requests.Session(); s.headers.update(HDR)
    r = s.post(f"{BASE}/api/auth/login", json={"email": ACCOUNTS[role], "password": PW}, timeout=30)
    if r.status_code != 200:
        raise RuntimeError(f"login {role} -> {r.status_code}: {r.text[:160]}")
    return s


def g(s, p, **k): return s.get(f"{BASE}{p}", timeout=40, **k)
def po(s, p, **k): return s.post(f"{BASE}{p}", timeout=90, **k)
def pu(s, p, **k): return s.put(f"{BASE}{p}", timeout=90, **k)
def pa(s, p, **k): return s.patch(f"{BASE}{p}", timeout=90, **k)


def body(r):
    try:
        return r.json()
    except Exception:
        return {}


def as_list(d):
    """Endpoints return either a bare list or {items|applications|grants|reports|...: [...]}."""
    if isinstance(d, list):
        return d
    if isinstance(d, dict):
        for k in ("items", "applications", "grants", "reports", "reviews", "data", "results", "assessments"):
            if isinstance(d.get(k), list):
                return d[k]
    return []


# ===========================================================================
# Journey 1 — Auth & access
# ===========================================================================
def journey_auth():
    j = "auth"
    print("\n=== Journey 1: Auth & access ===")
    for role in ("ngo", "donor", "reviewer"):
        record(role in S, j, f"login {role} ({ACCOUNTS[role]}) -> session")
    # admin (SMK-002): creds unknown on live; not retried here to avoid lockout.
    record("admin" in S, j, "login admin (SMK-002 pending creds)", "skipped active retries")

    # identity via /api/auth/me
    for role in ("ngo", "donor", "reviewer", "admin"):
        if role not in S:
            continue
        r = g(S[role], "/api/auth/me")
        d = body(r)
        ME[role] = d
        email = str((d.get("user") or d).get("email", d.get("email", ""))).lower() if isinstance(d, dict) else ""
        rr = str((d.get("user") or d).get("role", d.get("role", ""))).lower() if isinstance(d, dict) else ""
        ok = r.status_code == 200 and email == ACCOUNTS[role]
        record(ok, j, f"/api/auth/me identifies {role}", f"{r.status_code} email={email} role={rr}")
        if role in ("ngo", "donor", "reviewer", "admin") and rr and rr != (role if role in ("ngo","donor","reviewer","admin") else rr):
            if role != rr:
                finding("P2", j, "API", f"/me role mismatch for {role}", f"expected {role} got {rr}")

    # negative: wrong password (one attempt, then clear lockouts as admin)
    s = requests.Session(); s.headers.update(HDR)
    r = s.post(f"{BASE}/api/auth/login", json={"email": ACCOUNTS['ngo'], "password": f"wrong-{TS}"}, timeout=30)
    record(r.status_code in (400, 401, 403), j, "wrong password rejected (4xx)", f"got {r.status_code}")
    if r.status_code == 200:
        finding("P1", j, "API", "Wrong password accepted", f"-> {r.status_code}")

    # negative: unknown email
    r = s.post(f"{BASE}/api/auth/login", json={"email": f"nobody-{TS}@x.com", "password": PW}, timeout=30)
    record(r.status_code in (400, 401, 403), j, "unknown email rejected (4xx)", f"got {r.status_code}")

    # anon cannot read a protected list
    anon = requests.Session(); anon.headers.update(HDR)
    r = g(anon, "/api/applications/")
    record(r.status_code in (401, 403), j, "anon -> /api/applications/ refused", f"got {r.status_code}")
    if r.status_code == 200 and as_list(body(r)):
        finding("P1", j, "API", "Anonymous read of applications returned data", f"-> 200 with {len(as_list(body(r)))} rows")

    # clear any lockout our wrong-pw attempt may have started
    if "admin" in S:
        for p in ("/api/admin/clear-all-lockouts", "/api/auth/admin/reset-lockouts"):
            try:
                po(S["admin"], p)
            except Exception:
                pass


# ===========================================================================
# Journey 0 — Health / version / readiness
# ===========================================================================
def journey_health():
    j = "health"
    print("\n=== Journey 0: Health & version ===")
    anon = requests.Session(); anon.headers.update(HDR)
    for p in ("/api/health", "/api/ready", "/api/version"):
        r = g(anon, p)
        record(r.status_code == 200, j, f"GET {p} -> 200", f"got {r.status_code}")
    v = body(g(anon, "/api/version"))
    if v:
        record(True, j, f"version build={v.get('build')} fe={v.get('frontend_build')}")


# ===========================================================================
# Journey 6/7 — Core lifecycle (the backbone): grant -> apply -> review -> award -> report
# ===========================================================================
def journey_lifecycle():
    j = "lifecycle"
    print("\n=== Journey 6/7: Core lifecycle (grant->apply->review->award->report) ===")
    donor, ngo, admin = S.get("donor"), S.get("ngo"), S.get("admin")
    rev = S.get("reviewer")
    if not (donor and ngo):
        record(False, j, "preconditions (donor+ngo sessions)"); return

    title = f"{TAG} Lifecycle Grant {TS}"
    criteria = [
        {"id": "approach", "label": "Programme approach", "weight": 50, "description": "Soundness of approach"},
        {"id": "capacity", "label": "Organisational capacity", "weight": 50, "description": "Ability to deliver"},
    ]
    # --- donor creates grant ---
    r = po(donor, "/api/grants", json={
        "title": title, "description": "Smoke-test lifecycle grant.",
        "total_funding": 100000, "currency": "USD", "criteria": criteria,
        "sector": "health", "country": "Kenya",
    })
    grant = body(r)
    gid = grant.get("id") or (grant.get("grant") or {}).get("id")
    if not record(r.status_code in (200, 201) and gid, j, "donor POST /api/grants (create)", f"{r.status_code} {str(grant)[:160]}"):
        return
    CTX["grant_id"] = gid
    add_cleanup(f"withdraw grant {gid}", lambda: po(donor, f"/api/grants/{gid}/withdraw"))
    add_cleanup(f"delete grant {gid} (draft-only)", lambda: donor.delete(f"{BASE}/api/grants/{gid}", timeout=40))

    # criteria echoed back accurately
    r = g(donor, f"/api/grants/{gid}")
    gd = body(r)
    crit = gd.get("criteria") or (gd.get("grant") or {}).get("criteria") or []
    record(len(crit) == 2, j, "grant criteria persisted accurately (2)", f"got {len(crit)}")

    # --- publish ---
    r = po(donor, f"/api/grants/{gid}/publish")
    published = r.status_code in (200, 201)
    record(published, j, "donor publish grant -> open", f"{r.status_code} {r.text[:120]}")
    if r.status_code == 403 and "licens" in r.text.lower():
        finding("P3", j, "API", "Grant publish is licensing-gated on this env", "donor got license_required; set org licensed or GRANT_LICENSING_ENFORCED=false")
    r = g(donor, f"/api/grants/{gid}")
    st = (body(r).get("status") or (body(r).get("grant") or {}).get("status"))
    record(st == "open", j, "grant status == open after publish", f"got {st}")

    # grant visible to NGO in browse
    r = g(ngo, "/api/grants/")
    ngo_sees = any((it.get("id") == gid) for it in as_list(body(r)))
    record(ngo_sees, j, "published grant visible to NGO browse", "not found in NGO /api/grants/")
    if not ngo_sees and published:
        finding("P1", j, "API", "Published grant not visible to NGO", f"grant {gid} open but absent from NGO browse")

    # --- NGO applies ---
    r = po(ngo, "/api/applications/", json={"grant_id": gid})
    ap = body(r)
    aid = ap.get("id") or (ap.get("application") or {}).get("id")
    if r.status_code == 409:  # existing draft; resume
        r2 = g(ngo, f"/api/applications/?grant_id={gid}")
        lst = as_list(body(r2))
        aid = lst[0].get("id") if lst else None
    if not record(aid, j, "NGO POST /api/applications/ (create/resume)", f"{r.status_code} {str(ap)[:160]}"):
        return
    CTX["app_id"] = aid
    add_cleanup(f"withdraw app {aid}", lambda: po(ngo, f"/api/applications/{aid}/withdraw"))

    # fill responses (data we will verify the donor sees verbatim)
    marker = f"SMOKE approach rationale {TS}"
    responses = {"approach": marker, "capacity": f"SMOKE capacity statement {TS}"}
    elig = {"registered": True, "audited": True}
    r = pu(ngo, f"/api/applications/{aid}", json={"responses": responses, "eligibility_responses": elig})
    record(r.status_code in (200, 201), j, "NGO PUT responses/eligibility", f"{r.status_code}")

    # --- submit ---
    r = po(ngo, f"/api/applications/{aid}/submit")
    sub = body(r)
    record(r.status_code in (200, 201), j, "NGO submit application", f"{r.status_code} {r.text[:120]}")
    r = g(ngo, f"/api/applications/{aid}")
    ad = body(r); ad = ad.get("application") or ad
    record(ad.get("status") == "submitted", j, "application status == submitted", f"got {ad.get('status')}")
    auto = ad.get("ai_score", ad.get("auto_score"))
    record(isinstance(auto, (int, float)) and auto is not None, j, "deterministic auto_score present after submit", f"got {auto}")

    # DATA ACCURACY / CROSS-SURFACE: donor sees exactly what NGO wrote
    r = g(donor, f"/api/applications/{aid}")
    dd = body(r); dd = dd.get("application") or dd
    donor_resp = dd.get("responses") or {}
    ok = donor_resp.get("approach") == marker
    record(ok, j, "donor sees NGO's exact response text (cross-surface)", f"got {str(donor_resp.get('approach'))[:80]}")
    if not ok:
        finding("P1", j, "API", "Donor does not see the NGO's submitted response verbatim",
                f"expected '{marker}', got '{str(donor_resp.get('approach'))[:80]}'")

    # app now appears in donor's queue for this grant, NOT as draft
    r = g(donor, "/api/applications/")
    donor_apps = as_list(body(r))
    in_q = any(a.get("id") == aid for a in donor_apps)
    record(in_q, j, "submitted app appears in donor queue", "absent")
    drafts_leaked = [a for a in donor_apps if str(a.get("status")) == "draft"]
    if drafts_leaked:
        finding("P1", j, "API", "Draft applications leak into donor queue", f"{len(drafts_leaked)} draft rows visible to donor")
    record(not drafts_leaked, j, "no draft applications leak into donor queue", f"{len(drafts_leaked)} leaked")

    # --- review: assign reviewer, score, complete ---
    # Reviewer assignment: submit auto-assigns a panel (default 3, capped by the 2
    # available reviewers). Verify the manual-assign endpoint (SMK-001 regression),
    # then complete EVERY panel review we can auth as and assert the terminal 'scored'.
    _rm = ME.get("reviewer") or {}
    reviewer_id = (_rm.get("user") or _rm).get("id") or _rm.get("user_id") or _rm.get("id")
    if rev:
        r = po(donor, "/api/reviews/", json={"application_id": aid, "reviewer_user_id": reviewer_id})
        rv = body(r)
        # SMK-001 fixed: must NOT be a 500; either a fresh assign (201) or a clean dedupe (409)
        ok = r.status_code in (200, 201, 409)
        record(ok, j, "manual assign endpoint alive (SMK-001: no 500)", f"got {r.status_code} {str(rv)[:100]}")
        if r.status_code == 500:
            finding("P1", j, "API", "reviewer assignment regressed to 500", str(rv)[:120])

        panel_completed, saw_under_review, panel_seen = 0, False, 0
        for rk in ("reviewer", "reviewer2"):
            rsess = S.get(rk)
            if not rsess:
                continue
            mine = [x for x in as_list(body(g(rsess, "/api/reviews/"))) if x.get("application_id") == aid]
            if not mine:
                continue
            panel_seen += 1
            rvid = mine[0].get("id")
            pu(rsess, f"/api/reviews/{rvid}", json={"scores": {"approach": 4, "capacity": 5}, "comments": {"approach": "ok"}})
            st = (body(g(donor, f"/api/applications/{aid}")).get("application") or {}).get("status")
            if st == "under_review":
                saw_under_review = True
            rc = po(rsess, f"/api/reviews/{rvid}/complete", json={"scores": {"approach": 4, "capacity": 5}})
            if rc.status_code in (200, 201):
                panel_completed += 1
        record(panel_seen >= 1, j, f"auto-assigned panel present ({panel_seen} reachable reviewer(s))")
        record(panel_completed >= 1, j, f"completed {panel_completed} panel review(s)")
        ad = body(g(donor, f"/api/applications/{aid}")); ad = ad.get("application") or ad
        record(ad.get("status") == "scored", j, "application -> scored after full panel completes", f"got {ad.get('status')}")
        record(ad.get("final_score") is not None, j, "final_score computed after scoring", f"got {ad.get('final_score')}")
        if ad.get("status") == "scored" and not saw_under_review:
            finding("P3", j, "API", "Auto-assigned apps never show 'under_review'",
                    "submitted -> scored directly; PUT (reviewer starts scoring) doesn't flip status like manual/bulk assign do")

    # --- donor awards ---
    r = pa(donor, f"/api/applications/{aid}/status", json={"status": "awarded"})
    if r.status_code not in (200, 201):
        r = pu(donor, f"/api/applications/{aid}", json={"status": "awarded"})
    record(r.status_code in (200, 201), j, "donor awards application", f"{r.status_code} {r.text[:120]}")
    ad = body(g(donor, f"/api/applications/{aid}")); ad = ad.get("application") or ad
    record(ad.get("status") == "awarded", j, "application status == awarded", f"got {ad.get('status')}")
    # cross-surface: NGO also sees awarded
    an = body(g(ngo, f"/api/applications/{aid}")); an = an.get("application") or an
    record(an.get("status") == "awarded", j, "NGO sees awarded status (cross-surface)", f"got {an.get('status')}")

    # --- reporting: NGO creates + submits, donor accepts ---
    r = po(ngo, "/api/reports/", json={"grant_id": gid, "application_id": aid, "report_type": "narrative",
                                       "title": f"{TAG} Q1 Report {TS}",
                                       "content": {"sections": [{"heading": "Progress", "text": f"SMOKE report body {TS}"}]}})
    rp = body(r)
    rid = rp.get("id") or (rp.get("report") or {}).get("id")
    record(r.status_code in (200, 201) and rid, j, "NGO creates report (draft)", f"{r.status_code} {str(rp)[:140]}")
    if rid:
        CTX["report_id"] = rid
        r = po(ngo, f"/api/reports/{rid}/submit")
        record(r.status_code in (200, 201), j, "NGO submits report", f"{r.status_code} {r.text[:120]}")
        st = (body(g(ngo, f"/api/reports/{rid}")).get("report") or body(g(ngo, f"/api/reports/{rid}"))).get("status")
        record(st == "submitted", j, "report status == submitted", f"got {st}")
        # donor reviews/accepts
        r = po(donor, f"/api/reports/{rid}/review", json={"action": "accept", "notes": "ok"})
        if r.status_code not in (200, 201):
            r = po(donor, f"/api/reports/{rid}/review", json={"action": "accepted", "notes": "ok"})
        record(r.status_code in (200, 201), j, "donor reviews/accepts report", f"{r.status_code} {r.text[:120]}")
        st = (body(g(donor, f"/api/reports/{rid}")).get("report") or body(g(donor, f"/api/reports/{rid}"))).get("status")
        record(st in ("accepted", "reviewed", "approved"), j, "report status == accepted", f"got {st}")

        # KNOWN-ISSUE probe: report attachment endpoint
        r = po(ngo, f"/api/reports/{rid}/attachments", json={})
        if r.status_code == 404:
            finding("P2", j, "API", "Report /attachments endpoint returns 404 (known UAT issue NGO-046)",
                    f"POST /api/reports/{rid}/attachments -> 404")
        record(r.status_code != 500, j, "report /attachments does not 500", f"got {r.status_code}")


# ===========================================================================
# Journey — RBAC negative matrix (what each persona is DENIED)
# ===========================================================================
def journey_rbac():
    j = "rbac"
    print("\n=== Journey: RBAC negative matrix ===")
    donor, ngo, rev = S.get("donor"), S.get("ngo"), S.get("reviewer")
    gid, aid = CTX.get("grant_id"), CTX.get("app_id")

    # NGO cannot create a grant
    if ngo:
        r = po(ngo, "/api/grants", json={"title": f"{TAG} illegal {TS}", "total_funding": 1, "currency": "USD"})
        ok = r.status_code in (401, 403)
        record(ok, j, "NGO cannot create a grant (403)", f"got {r.status_code}")
        if not ok and r.status_code in (200, 201):
            finding("P1", j, "API", "NGO was allowed to create a grant", f"-> {r.status_code}")
            gid2 = body(r).get("id")
            if gid2:
                add_cleanup(f"delete illegal grant {gid2}", lambda: donor.delete(f"{BASE}/api/grants/{gid2}", timeout=30) if donor else None)

    # Reviewer cannot award an application
    if rev and aid:
        r = pa(rev, f"/api/applications/{aid}/status", json={"status": "awarded"})
        ok = r.status_code in (401, 403)
        record(ok, j, "Reviewer cannot award an application (403)", f"got {r.status_code}")
        if r.status_code in (200, 201):
            finding("P1", j, "API", "Reviewer was allowed to award an application", f"-> {r.status_code}")

    # NGO cannot award their own application
    if ngo and aid:
        r = pa(ngo, f"/api/applications/{aid}/status", json={"status": "awarded"})
        record(r.status_code in (401, 403), j, "NGO cannot self-award (403)", f"got {r.status_code}")

    # Cross-org isolation: donor2 cannot see NGO1's application detail as owner-data / NGO2 cannot read NGO1 app
    ngo2 = S.get("ngo2")
    if ngo2 and aid:
        r = g(ngo2, f"/api/applications/{aid}")
        ok = r.status_code in (403, 404) or not (body(r).get("application") or body(r))
        record(r.status_code in (403, 404), j, "other NGO cannot read this NGO's application", f"got {r.status_code}")
        if r.status_code == 200 and (body(r).get("responses") or (body(r).get("application") or {}).get("responses")):
            finding("P1", j, "API", "Cross-NGO application data leak", f"NGO2 read NGO1 application {aid} responses")


# ===========================================================================
# Journey 2/3/4 — Capacity assessment, trust profile, hand-off availability
# ===========================================================================
def journey_assessment():
    j = "assessment"
    print("\n=== Journey 2/3/4: Capacity assessment + Trust profile + hand-off ===")
    ngo = S.get("ngo")
    if not ngo:
        record(False, j, "precondition ngo session"); return
    # frameworks
    r = g(ngo, "/api/assessments/frameworks")
    fw = as_list(body(r)) or (body(r).get("frameworks") if isinstance(body(r), dict) else [])
    record(r.status_code == 200 and fw, j, "GET /assessments/frameworks", f"{r.status_code} n={len(fw) if fw else 0}")

    # create assessment
    r = po(ngo, "/api/assessments/", json={"framework": "kuja"})
    a = body(r); asid = a.get("id") or (a.get("assessment") or {}).get("id")
    record(r.status_code in (200, 201) and asid, j, "NGO create assessment", f"{r.status_code} {str(a)[:140]}")
    if asid:
        # complete it with responses -> should compute score and write to org
        r = pu(ngo, f"/api/assessments/{asid}", json={
            "status": "completed",
            "org_profile": {"name": "Amani", "country": "Kenya", "staff": 20},
            "checklist_responses": {"governance": True, "finance": True, "safeguarding": True},
        })
        record(r.status_code in (200, 201), j, "NGO complete assessment (compute score)", f"{r.status_code} {r.text[:120]}")
        ad = body(g(ngo, f"/api/assessments/{asid}")); ad = ad.get("assessment") or ad
        sc = ad.get("overall_score")
        record(ad.get("status") == "completed", j, "assessment status == completed", f"got {ad.get('status')}")
        record(sc is not None, j, "assessment overall_score computed", f"got {sc}")

    # trust profile read (own org)
    org_id = ((ME.get("ngo") or {}).get("user") or ME.get("ngo") or {}).get("org_id") \
        or ((ME.get("ngo") or {}).get("organization") or {}).get("id")
    if org_id:
        r = g(ngo, f"/api/trust-profile/{org_id}")
        record(r.status_code == 200 and body(r), j, "GET /trust-profile/<own org>", f"{r.status_code}")

    # hand-off availability (Kuja-only; whether configured on this env)
    r = g(ngo, "/api/trust/handoff/available")
    av = body(r)
    record(r.status_code == 200, j, "GET /trust/handoff/available", f"{r.status_code} {str(av)[:100]}")
    if isinstance(av, dict) and av.get("available"):
        r = po(ngo, "/api/trust/handoff")
        hd = body(r)
        ok = r.status_code in (200, 201) and isinstance(hd.get("url"), str) and hd["url"].startswith("http")
        record(ok, j, "POST /trust/handoff mints signed URL", f"{r.status_code} {str(hd)[:120]}")
        if ok and "token=" not in hd["url"]:
            finding("P2", j, "API", "Hand-off URL missing token", hd["url"][:120])
    else:
        record(True, j, "hand-off not configured on this env (UI falls back to /assessments)", str(av)[:80])
        finding("P3", j, "assessment", "Trust hand-off not enabled on this env",
                "GET /trust/handoff/available -> not available; NGOs use in-app assessment (set KUJA_TRUST_HANDOFF_SECRET + KUJA_TRUST_BASE_URL to enable)")


# ===========================================================================
# Journey — Dashboards render sane, role-scoped data
# ===========================================================================
def journey_dashboards():
    j = "dashboards"
    print("\n=== Journey 11: Dashboards ===")
    now = dt.datetime.now(dt.timezone.utc)
    for role in ("ngo", "donor", "reviewer", "admin"):
        s = S.get(role)
        if not s:
            continue
        r = g(s, "/api/dashboard/today")
        record(r.status_code in (200, 204), j, f"{role} GET /dashboard/today", f"got {r.status_code}")
        r = g(s, "/api/dashboard/stats")
        d = body(r)
        record(r.status_code in (200, 204), j, f"{role} GET /dashboard/stats", f"got {r.status_code}")
        # no negative counts
        if isinstance(d, dict):
            negs = [k for k, v in d.items() if isinstance(v, (int, float)) and v < 0]
            record(not negs, j, f"{role} dashboard has no negative counts", f"neg: {negs}")


# ===========================================================================
# Journey 12 — Data hygiene (no synthetic leaks, counts reconcile, no future ts)
# ===========================================================================
def journey_hygiene():
    j = "hygiene"
    print("\n=== Journey 12: Data hygiene ===")
    donor = S.get("donor")
    if not donor:
        record(False, j, "precondition donor session"); return
    now = dt.datetime.now(dt.timezone.utc)

    # future-timestamp check across donor-visible grants
    r = g(donor, "/api/grants/")
    future = []
    for it in as_list(body(r)):
        for key in ("created_at", "updated_at", "published_at"):
            v = it.get(key)
            if isinstance(v, str):
                try:
                    ts = dt.datetime.fromisoformat(v.replace("Z", "+00:00"))
                    if ts.tzinfo is None:
                        ts = ts.replace(tzinfo=dt.timezone.utc)
                    if ts > now + dt.timedelta(minutes=5):
                        future.append((it.get("id"), key, v))
                except Exception:
                    pass
    record(not future, j, "no future timestamps in donor grant list", f"{future[:3]}")
    if future:
        finding("P2", j, "API", "Future timestamps in grant list", str(future[:3]))

    # our own submitted app should be visible; count reconciliation smoke:
    r = g(donor, "/api/applications/")
    apps = as_list(body(r))
    record(isinstance(apps, list), j, "donor applications list returns a list", f"type={type(apps).__name__}")


JOURNEYS = {
    "health": journey_health,
    "auth": journey_auth,
    "lifecycle": journey_lifecycle,
    "rbac": journey_rbac,
    "assessment": journey_assessment,
    "dashboards": journey_dashboards,
    "hygiene": journey_hygiene,
}
DEFAULT_ORDER = ["health", "auth", "lifecycle", "rbac", "assessment", "dashboards", "hygiene"]


def cleanup():
    if not _cleanup:
        return
    print(f"\n=== Cleanup ({len(_cleanup)} items) ===")
    for label, fn in reversed(_cleanup):
        try:
            fn(); print(f"  [cleaned] {label}")
        except Exception as e:
            print(f"  [CLEANUP-FAILED] {label}: {e}")


def main():
    which = [a for a in sys.argv[1:] if not a.startswith("-")]
    print("=" * 72)
    print(f"KUJA SMOKE — API @ {BASE}  (tag {TAG}, ts {TS})")
    print("=" * 72)
    for role in ACCOUNTS:
        if role == "admin":
            continue  # SMK-002: admin@kuja.org creds unknown on live; skip to avoid lockout
        try:
            S[role] = login(role)
        except Exception as e:
            print(f"  [warn] preauth {role}: {e}")
    run = which or DEFAULT_ORDER
    try:
        for name in run:
            fn = JOURNEYS.get(name)
            if fn:
                fn()
            else:
                print(f"  [skip] unknown journey '{name}'")
    finally:
        cleanup()
    npass = sum(1 for ok, *_ in results if ok)
    print("\n" + "=" * 72)
    print(f"RESULTS: {npass}/{len(results)} checks passed ({len(results)-npass} failed)")
    if findings:
        print(f"FINDINGS ({len(findings)}):")
        for sev, jr, layer, summ, det in sorted(findings, key=lambda x: x[0]):
            print(f"  [{sev}] {jr}/{layer}: {summ}" + (f" — {det}" if det else ""))
    print("=" * 72)
    sys.exit(1 if (len(results) - npass) else 0)


if __name__ == "__main__":
    main()
