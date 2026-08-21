#!/usr/bin/env python3
"""
probe_write_authz.py — cross-persona WRITE authorization. Can persona A mutate
persona B's objects? Write authz is often weaker than read authz. Creates a small
[SMOKE-TEST] fixture (donor grant + NGO app), then tries illegal mutations as the
wrong persona; each must be refused (401/403/404). Cleans up its fixture.
Usage: KUJA_URL=https://fund.kuja.org py smoke/probe_write_authz.py
"""
import os
import time
import requests

B = os.getenv("KUJA_URL", "https://fund.kuja.org").rstrip("/")
H = {"X-Requested-With": "XMLHttpRequest"}
PW = "pass123"
TS = int(time.time())
findings, results = [], []

def rec(ok, name, d=""):
    results.append((ok, name)); print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" -- {d}" if d and not ok else ""))
def fnd(sev, summ, d=""):
    findings.append((sev, summ, d)); print(f"     >>> [{sev}] {summ}" + (f" — {d}" if d else ""))
def login(e):
    s = requests.Session(); s.headers.update(H)
    r = s.post(f"{B}/api/auth/login", json={"email": e, "password": PW}, timeout=30)
    assert r.status_code == 200, f"{e}->{r.status_code}"; return s
def body(r):
    try: return r.json()
    except Exception: return {}
def denied(r):
    return r.status_code in (401, 403, 404)

ngo = login("fatima@amani.org"); ngo2 = login("ahmed@salamrelief.org")
donor = login("sarah@globalhealth.org"); donor2 = login("david@eatrust.org")
reviewer = login("james@reviewer.org")
print("=" * 70); print(f"WRITE-AUTHZ probe @ {B}"); print("=" * 70)

# fixture: donor1 grant + NGO1 app (submitted)
gr = body(donor.post(f"{B}/api/grants", json={"title": f"[SMOKE-TEST] wauthz {TS}", "description": "x",
     "total_funding": 1000, "currency": "USD", "criteria": [{"id": "a", "label": "A", "weight": 100, "description": "a"}]}, timeout=60))
gid = gr.get("id") or gr.get("grant", {}).get("id")
donor.post(f"{B}/api/grants/{gid}/publish", timeout=60)
ap = body(ngo.post(f"{B}/api/applications/", json={"grant_id": gid}, timeout=60))
aid = ap.get("id") or ap.get("application", {}).get("id")
ngo.put(f"{B}/api/applications/{aid}", json={"responses": {"a": "mine"}}, timeout=60)
ngo.post(f"{B}/api/applications/{aid}/submit", timeout=60)
print(f"fixture: grant={gid} app={aid}")

def cleanup():
    try: ngo.post(f"{B}/api/applications/{aid}/withdraw", timeout=30)
    except Exception: pass
    try: donor.post(f"{B}/api/grants/{gid}/withdraw", timeout=30); donor.delete(f"{B}/api/grants/{gid}", timeout=30)
    except Exception: pass

try:
    # 1. other NGO cannot mutate NGO1's application
    r = ngo2.put(f"{B}/api/applications/{aid}", json={"responses": {"a": "HIJACK"}}, timeout=30)
    rec(denied(r), "other NGO cannot PUT NGO1's application", f"{r.status_code}")
    if not denied(r): fnd("P1", "IDOR-write: other NGO edited NGO1's application", f"{r.status_code}")
    r = ngo2.post(f"{B}/api/applications/{aid}/withdraw", timeout=30)
    rec(denied(r), "other NGO cannot withdraw NGO1's application", f"{r.status_code}")
    if not denied(r): fnd("P1", "IDOR-write: other NGO withdrew NGO1's application", f"{r.status_code}")
    r = ngo2.post(f"{B}/api/applications/{aid}/submit", timeout=30)
    rec(denied(r) or r.status_code == 400, "other NGO cannot submit NGO1's application", f"{r.status_code}")

    # 2. reviewer / other donor cannot AWARD
    r = reviewer.patch(f"{B}/api/applications/{aid}/status", json={"status": "awarded"}, timeout=30)
    rec(denied(r), "reviewer cannot award", f"{r.status_code}")
    if r.status_code in (200, 201): fnd("P1", "reviewer awarded an application", f"{r.status_code}")
    r = donor2.patch(f"{B}/api/applications/{aid}/status", json={"status": "awarded"}, timeout=30)
    rec(denied(r), "other donor cannot award app on donor1's grant", f"{r.status_code}")
    if r.status_code in (200, 201): fnd("P1", "IDOR-write: other donor awarded on donor1's grant", f"{r.status_code}")

    # 3. NGO cannot request-revision / request-document (donor actions)
    r = ngo2.post(f"{B}/api/applications/{aid}/request-revision", json={"reason": "x"}, timeout=30)
    rec(denied(r), "NGO cannot request-revision (donor action)", f"{r.status_code}")

    # 4. other donor cannot mutate donor1's grant
    r = donor2.put(f"{B}/api/grants/{gid}", json={"description": "HIJACK"}, timeout=30)
    rec(denied(r), "other donor cannot edit donor1's grant", f"{r.status_code}")
    if r.status_code in (200, 201): fnd("P1", "IDOR-write: other donor edited donor1's grant", f"{r.status_code}")
    r = donor2.post(f"{B}/api/grants/{gid}/withdraw", timeout=30)
    rec(denied(r), "other donor cannot withdraw donor1's grant", f"{r.status_code}")

    # 5. NGO cannot assign a reviewer (donor/admin only) or run DD screening
    r = ngo.post(f"{B}/api/reviews/", json={"application_id": aid, "reviewer_user_id": 16}, timeout=30)
    rec(denied(r), "NGO cannot assign a reviewer", f"{r.status_code}")
    r = ngo.post(f"{B}/api/adverse-media/screen", json={"org_id": 10}, timeout=30)
    rec(denied(r), "NGO cannot run adverse-media screening (donor/admin/reviewer)", f"{r.status_code}")
    if r.status_code in (200, 201): fnd("P2", "NGO ran adverse-media screening on another org", f"{r.status_code}")
finally:
    cleanup()

npass = sum(1 for ok, _ in results if ok)
print("\n" + "=" * 70)
print(f"RESULTS: {npass}/{len(results)} passed")
print(f"FINDINGS: {len(findings)}")
for sev, summ, d in sorted(findings):
    print(f"  [{sev}] {summ}" + (f" — {d}" if d else ""))
print("=" * 70)
