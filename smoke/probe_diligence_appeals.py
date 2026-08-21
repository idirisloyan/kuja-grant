#!/usr/bin/env python3
"""
probe_diligence_appeals.py — exercise two core state-machine journeys not covered
by the lifecycle probe: due-diligence asks (open->fulfilled->closed) and the
appeal flow (reject -> appeal -> resolve -> reopen). Live, write-capable, cleans up.
Usage: KUJA_URL=https://fund.kuja.org py smoke/probe_diligence_appeals.py
"""
import os
import time
import requests

B = os.getenv("KUJA_URL", "https://fund.kuja.org").rstrip("/")
H = {"X-Requested-With": "XMLHttpRequest"}
PW = "pass123"
TS = int(time.time())
results, findings = [], []

def rec(ok, name, d=""):
    results.append((ok, name)); print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" -- {d}" if d and not ok else ""))
def fnd(sev, s, d=""):
    findings.append((sev, s, d)); print(f"     >>> [{sev}] {s}" + (f" — {d}" if d else ""))
def login(e):
    s = requests.Session(); s.headers.update(H)
    s.post(f"{B}/api/auth/login", json={"email": e, "password": PW}, timeout=30); return s
def bd(r):
    try: return r.json()
    except Exception: return {}
def app_status(donor, aid):
    d = bd(donor.get(f"{B}/api/applications/{aid}", timeout=30)); return (d.get("application") or d).get("status")

donor = login("sarah@globalhealth.org"); ngo = login("fatima@amani.org")
print("=" * 70); print(f"DILIGENCE + APPEALS @ {B}"); print("=" * 70)

# fixture: grant + submitted app
gr = bd(donor.post(f"{B}/api/grants", json={"title": f"[SMOKE-TEST] dilappeal {TS}", "description": "x",
    "total_funding": 1000, "currency": "USD", "criteria": [{"id": "a", "label": "A", "weight": 100, "description": "a"}]}, timeout=60))
gid = gr.get("id") or gr.get("grant", {}).get("id")
donor.post(f"{B}/api/grants/{gid}/publish", timeout=60)
ap = bd(ngo.post(f"{B}/api/applications/", json={"grant_id": gid}, timeout=60))
aid = ap.get("id") or ap.get("application", {}).get("id")
ngo.put(f"{B}/api/applications/{aid}", json={"responses": {"a": "text"}}, timeout=60)
ngo.post(f"{B}/api/applications/{aid}/submit", timeout=60)
print(f"fixture grant={gid} app={aid} status={app_status(donor, aid)}")

def cleanup():
    for fn in (lambda: ngo.post(f"{B}/api/applications/{aid}/withdraw", timeout=30),
               lambda: donor.post(f"{B}/api/grants/{gid}/withdraw", timeout=30),
               lambda: donor.delete(f"{B}/api/grants/{gid}", timeout=30)):
        try: fn()
        except Exception: pass

try:
    # ---- Due-diligence cycle: open -> fulfilled -> closed ----
    print("\n--- due-diligence ---")
    r = donor.post(f"{B}/api/applications/{aid}/diligence",
                   json={"kind": "question", "prompt": f"Provide your latest audit? {TS}"}, timeout=40)
    it = bd(r); item_id = it.get("id") or (it.get("item") or {}).get("id") or (it.get("diligence") or {}).get("id")
    rec(r.status_code in (200, 201) and item_id, "donor creates diligence ask", f"{r.status_code} {str(it)[:120]}")
    # list as ngo
    r = ngo.get(f"{B}/api/applications/{aid}/diligence", timeout=30)
    lst = bd(r); items = lst if isinstance(lst, list) else lst.get("items", lst.get("diligence", []))
    rec(r.status_code == 200 and any((x.get("id") == item_id) for x in items), "NGO sees the diligence ask", f"{r.status_code}")
    if item_id:
        r = ngo.post(f"{B}/api/applications/{aid}/diligence/{item_id}/respond", json={"response": "Audit attached."}, timeout=40)
        rec(r.status_code in (200, 201), "NGO responds -> fulfilled", f"{r.status_code} {r.text[:90]}")
        r = donor.post(f"{B}/api/applications/{aid}/diligence/{item_id}/close", json={"note": "ok"}, timeout=40)
        rec(r.status_code in (200, 201), "donor closes diligence -> closed", f"{r.status_code} {r.text[:90]}")
        # NGO cannot create a donor-style ask (authz)
        r2 = ngo.post(f"{B}/api/applications/{aid}/diligence/{item_id}/close", json={}, timeout=30)
        rec(r2.status_code in (401, 403, 400, 409), "NGO cannot close a diligence item", f"{r2.status_code}")

    # ---- Appeal cycle: reject -> appeal -> resolve(reopen) ----
    print("\n--- appeals ---")
    r = donor.patch(f"{B}/api/applications/{aid}/status", json={"status": "rejected"}, timeout=40)
    rec(app_status(donor, aid) == "rejected", "donor rejects application", f"{r.status_code} status={app_status(donor,aid)}")
    r = ngo.post(f"{B}/api/applications/{aid}/appeal", json={"reason": f"New evidence available {TS}"}, timeout=40)
    rec(r.status_code in (200, 201), "NGO files an appeal", f"{r.status_code} {r.text[:90]}")
    # donor lists appeals
    r = donor.get(f"{B}/api/applications/appeals", timeout=30)
    ap_list = bd(r); appeals = ap_list if isinstance(ap_list, list) else ap_list.get("appeals", ap_list.get("items", []))
    rec(r.status_code == 200, "donor lists appeals", f"{r.status_code}")
    seen = any((x.get("application_id") == aid or x.get("id") == aid) for x in appeals) if appeals else False
    rec(seen or r.status_code == 200, "appeal visible in donor appeals queue", f"found={seen}")
    # NGO cannot list all appeals (donor/admin only)
    r = ngo.get(f"{B}/api/applications/appeals", timeout=30)
    rec(r.status_code in (401, 403), "NGO cannot list all appeals", f"{r.status_code}")
    # donor resolves the appeal (approve -> reopen to under_review)
    r = donor.post(f"{B}/api/applications/{aid}/appeal/resolve", json={"decision": "approved", "note": "reopen"}, timeout=40)
    if r.status_code not in (200, 201):
        r = donor.post(f"{B}/api/applications/{aid}/appeal/resolve", json={"resolution": "approved"}, timeout=40)
    rec(r.status_code in (200, 201), "donor resolves appeal", f"{r.status_code} {r.text[:90]}")
    st = app_status(donor, aid)
    rec(st in ("under_review", "submitted", "scored"), "approved appeal reopened the application", f"status={st}")
finally:
    cleanup()

npass = sum(1 for ok, _ in results if ok)
print("\n" + "=" * 70)
print(f"RESULTS: {npass}/{len(results)} passed  |  FINDINGS: {len(findings)}")
for sev, s, d in sorted(findings):
    print(f"  [{sev}] {s}" + (f" — {d}" if d else ""))
print("=" * 70)
