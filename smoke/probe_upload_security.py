#!/usr/bin/env python3
"""
probe_upload_security.py — upload the deliberately-malicious edge-case files and
assert the server REJECTS the dangerous ones (disguised exe, script svg, html,
content/extension mismatch, oversized) and accepts a valid control.
Usage: KUJA_URL=https://fund.kuja.org py smoke/probe_upload_security.py
"""
import os
import time
import requests

B = os.getenv("KUJA_URL", "https://fund.kuja.org").rstrip("/")
H = {"X-Requested-With": "XMLHttpRequest"}
PW = "pass123"
TS = int(time.time())
EDGE = "docs/uat/testfiles/99_edge_cases"
VALID = "docs/uat/testfiles/01_registration"
findings, results = [], []

def rec(ok, name, d=""):
    results.append((ok, name)); print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" -- {d}" if d else ""))
def fnd(sev, summ, d=""):
    findings.append((sev, summ, d)); print(f"     >>> [{sev}] {summ}" + (f" — {d}" if d else ""))

s = requests.Session(); s.headers.update(H)
s.post(f"{B}/api/auth/login", json={"email": "fatima@amani.org", "password": PW}, timeout=30)
# fixture app to attach uploads to
gr = s.post(f"{B}/api/grants", json={"title": "x"}, timeout=20)  # NGO can't create -> ignore
gid = None
# use a real open grant to apply to
grants = s.get(f"{B}/api/grants/", timeout=30).json()
glist = grants if isinstance(grants, list) else grants.get("grants", grants.get("items", []))
if glist:
    gid = glist[0].get("id")
aid = None
if gid:
    ap = s.post(f"{B}/api/applications/", json={"grant_id": gid}, timeout=30).json()
    aid = ap.get("id") or ap.get("application", {}).get("id")
print(f"fixture app={aid} (grant {gid})")

def upload(path, fname=None, ctype="application/octet-stream"):
    fname = fname or os.path.basename(path)
    with open(path, "rb") as fh:
        files = {"file": (fname, fh, ctype)}
        data = {"doc_type": "general"}
        if aid:
            data["application_id"] = str(aid)
        r = s.post(f"{B}/api/documents/upload", files=files, data=data, timeout=60)
    return r

# (rejected_expected, path, note)
DANGEROUS = [
    ("disguised_program.exe", "disguised executable (.exe)"),
    ("report.pdf.exe", "double-extension exe (report.pdf.exe)"),
    ("image_with_script.svg", "SVG with script (XSS vector)"),
    ("webpage_upload.html", "HTML upload (XSS vector)"),
    ("not_really_a_pdf.pdf", "content/extension mismatch (magic bytes)"),
    ("empty_file.pdf", "empty file"),
    ("oversized_20MB.pdf", "oversized (>16MB)"),
]
print("\n--- dangerous files (MUST be rejected) ---")
for name, note in DANGEROUS:
    p = os.path.join(EDGE, name)
    if not os.path.exists(p):
        print(f"  [skip] {name} (missing)"); continue
    try:
        r = upload(p)
        rejected = r.status_code in (400, 413, 415)
        rec(rejected, f"REJECT {name} — {note}", f"got {r.status_code} {r.text[:70]}")
        if not rejected:
            fnd("P1", f"Dangerous upload ACCEPTED: {name}", f"{note} -> {r.status_code}")
    except Exception as e:
        rec(False, f"REJECT {name}", f"error {str(e)[:60]}")

# valid control — a real registration PDF should be accepted
print("\n--- valid control (should be accepted) ---")
import glob as _g
ctrl = None
for f in _g.glob(os.path.join(VALID, "*.pdf")):
    ctrl = f; break
if ctrl:
    r = upload(ctrl, ctype="application/pdf")
    ok = r.status_code in (200, 201)
    rec(ok, f"ACCEPT valid pdf {os.path.basename(ctrl)}", f"got {r.status_code} {r.text[:70]}")
    if not ok:
        fnd("P2", "Valid PDF upload rejected (over-blocking)", f"{os.path.basename(ctrl)} -> {r.status_code}")

# edge (should not 500 — graceful handling)
print("\n--- robustness (no 500) ---")
for name in ["corrupt_truncated.pdf", "password_protected.pdf", "pdf_with_active_javascript.pdf",
             "very_long_filename_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf",
             "تقرير_ميداني_عربي.docx"]:
    p = os.path.join(EDGE, name)
    if not os.path.exists(p):
        print(f"  [skip] {name[:30]} (missing)"); continue
    try:
        r = upload(p)
        rec(r.status_code < 500, f"no-500 on {name[:30]}", f"got {r.status_code}")
        if r.status_code >= 500:
            fnd("P2", f"Upload 500 on edge file {name[:30]}", f"{r.status_code}")
    except Exception as e:
        rec(False, f"no-500 on {name[:30]}", f"error {str(e)[:50]}")

if aid:
    try: s.post(f"{B}/api/applications/{aid}/withdraw", timeout=30)
    except Exception: pass

npass = sum(1 for ok, _ in results if ok)
print("\n" + "=" * 70)
print(f"RESULTS: {npass}/{len(results)} passed  |  FINDINGS: {len(findings)}")
for sev, summ, d in sorted(findings):
    print(f"  [{sev}] {summ}" + (f" — {d}" if d else ""))
print("=" * 70)
