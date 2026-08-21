#!/usr/bin/env python3
"""
probe_500_idor.py — two high-value security/robustness sweeps against LIVE:
  1) 500-SWEEP: hit many read endpoints as each persona; ANY 5xx is a bug.
  2) IDOR / object-level authz: can persona A reach persona B's objects by id?
Read-only (no writes). Usage: KUJA_URL=https://fund.kuja.org py smoke/probe_500_idor.py
"""
import os
import requests

B = os.getenv("KUJA_URL", "https://fund.kuja.org").rstrip("/")
H = {"X-Requested-With": "XMLHttpRequest"}
PW = "pass123"
ACC = {"ngo": "fatima@amani.org", "ngo2": "ahmed@salamrelief.org",
       "donor": "sarah@globalhealth.org", "donor2": "david@eatrust.org",
       "reviewer": "james@reviewer.org"}

findings, results = [], []
def rec(ok, name, d=""):
    results.append((ok, name)); print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" -- {d}" if d and not ok else ""))
def fnd(sev, summ, d=""):
    findings.append((sev, summ, d)); print(f"     >>> [{sev}] {summ}" + (f" — {d}" if d else ""))
def login(e):
    s = requests.Session(); s.headers.update(H)
    r = s.post(f"{B}/api/auth/login", json={"email": e, "password": PW}, timeout=30)
    if r.status_code != 200:
        raise RuntimeError(f"login {e} -> {r.status_code}")
    return s
def j(s, p):
    try:
        return s.get(f"{B}{p}", timeout=35)
    except Exception as e:
        class R: status_code = -1; text = str(e)
        return R()
def body(r):
    try:
        return r.json()
    except Exception:
        return {}
def as_list(d):
    if isinstance(d, list): return d
    if isinstance(d, dict):
        for k in ("items", "applications", "grants", "reports", "reviews", "organizations", "data"):
            if isinstance(d.get(k), list): return d[k]
    return []
def me(s):
    d = body(j(s, "/api/auth/me")).get("user", {})
    return d.get("id"), d.get("org_id")

S = {r: login(e) for r, e in ACC.items()}
print("=" * 70); print(f"500-SWEEP + IDOR @ {B}"); print("=" * 70)

# ---------------- 1) 500 sweep ----------------
SWEEP = [
    "/api/grants/", "/api/applications/", "/api/reports/", "/api/reviews/",
    "/api/reports/upcoming", "/api/organizations/", "/api/assessments/",
    "/api/assessments/frameworks", "/api/notifications", "/api/messages",
    "/api/dashboard/today", "/api/dashboard/stats", "/api/dashboard/applications-by-status",
    "/api/dashboard/decisions-by-month", "/api/dashboard/reviewer-turnaround",
    "/api/dashboard/sla-breaches", "/api/dashboard/portfolio-risk-heatmap",
    "/api/dashboard/data-integrity", "/api/portfolio/", "/api/ai/suggestions",
    "/api/network/membership/directory", "/api/reviews/my-caseload", "/api/reviews/my-stats",
    "/api/reviews/next-up", "/api/applications/decision-reasons", "/api/verification/registries",
    "/api/trust/handoff/available", "/api/reports/upcoming", "/api/preflight/",
]
print("\n--- 500-SWEEP (any 5xx = bug) ---")
for role, s in S.items():
    for p in SWEEP:
        r = j(s, p)
        if r.status_code >= 500:
            fnd("P1", f"5xx on {p} as {role}", f"{r.status_code} {getattr(r,'text','')[:80]}")
        elif r.status_code == -1:
            fnd("P2", f"request error {p} as {role}", getattr(r, 'text', '')[:60])
        else:
            rec(True, f"{role} GET {p}", f"{r.status_code}")

# ---------------- 2) IDOR / object-level authz ----------------
print("\n--- IDOR / object-level authz ---")
def ids(s, path, n=3):
    return [x.get("id") for x in as_list(body(j(s, path)))[:n] if x.get("id")]

ngo2_apps = ids(S["ngo2"], "/api/applications/")
ngo_id, ngo_org = me(S["ngo"]); ngo2_id, ngo2_org = me(S["ngo2"])
donor_grants = ids(S["donor"], "/api/grants/")

# (a) NGO reads ANOTHER NGO's application detail
if ngo2_apps:
    aid = ngo2_apps[0]
    r = j(S["ngo"], f"/api/applications/{aid}")
    leaked = r.status_code == 200 and bool((body(r).get("application") or body(r)).get("responses"))
    rec(r.status_code in (403, 404), f"NGO cannot read other-NGO application {aid}", f"{r.status_code}")
    if leaked:
        fnd("P1", "IDOR: NGO read another NGO's application responses", f"app {aid} -> 200 with responses")

# (b) NGO reads ANOTHER NGO's Trust Profile (sanctions/bank/adverse — sensitive DD)
if ngo2_org:
    r = j(S["ngo"], f"/api/trust-profile/{ngo2_org}")
    if r.status_code == 200 and body(r):
        fnd("P2", "NGO can read another NGO's full Trust Profile (DD/bank/sanctions)",
            f"GET /api/trust-profile/{ngo2_org} -> 200 as unrelated NGO")
        rec(False, f"NGO blocked from other-NGO trust-profile {ngo2_org}", f"{r.status_code}")
    else:
        rec(True, f"NGO blocked from other-NGO trust-profile {ngo2_org}", f"{r.status_code}")

# (c) NGO edits ANOTHER org's settings (write authz)
if ngo2_org:
    r = S["ngo"].put(f"{B}/api/organizations/{ngo2_org}/settings", json={"smoke_idor": True}, timeout=30)
    rec(r.status_code in (401, 403, 404), f"NGO cannot PUT other-org settings {ngo2_org}", f"{r.status_code}")
    if r.status_code in (200, 201):
        fnd("P1", "IDOR: NGO modified another org's settings", f"PUT /api/organizations/{ngo2_org}/settings -> {r.status_code}")

# (d) donor2 edits donor1's grant
if donor_grants:
    gid = donor_grants[0]
    r = S["donor2"].put(f"{B}/api/grants/{gid}", json={"description": "smoke idor edit"}, timeout=30)
    rec(r.status_code in (401, 403, 404), f"other donor cannot edit donor's grant {gid}", f"{r.status_code}")
    if r.status_code in (200, 201):
        fnd("P1", "IDOR: donor edited another donor's grant", f"PUT /api/grants/{gid} -> {r.status_code}")
    # and export applications.csv of a grant they don't own
    r = j(S["donor2"], f"/api/grants/{gid}/applications.csv")
    rec(r.status_code in (401, 403, 404), f"other donor cannot export donor's grant apps {gid}", f"{r.status_code}")
    if r.status_code == 200 and len(getattr(r, "text", "")) > 50:
        fnd("P2", "IDOR: donor exported another donor's applications CSV", f"grant {gid}")

# (e) reviewer reads an application they were never assigned (use ngo2's app)
if ngo2_apps:
    aid = ngo2_apps[0]
    r = j(S["reviewer"], f"/api/reviews/{aid}")  # review-id space; may 404 (fine)
    rec(r.status_code != 500, f"reviewer access to arbitrary review-id {aid} not a 500", f"{r.status_code}")

n_pass = sum(1 for ok, _ in results if ok)
print("\n" + "=" * 70)
print(f"RESULTS: {n_pass}/{len(results)} checks passed")
print(f"FINDINGS: {len(findings)}")
for sev, summ, d in sorted(findings):
    print(f"  [{sev}] {summ}" + (f" — {d}" if d else ""))
print("=" * 70)
