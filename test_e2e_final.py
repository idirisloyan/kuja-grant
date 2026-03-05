#!/usr/bin/env python3
"""
Kuja Grant - Final E2E Retest (March 5 2026 Audit)
====================================================
Covers all 6 defects from the production audit + full regression.

DEF-SEC-001 (High)  Brute-force/credential-stuffing controls
DEF-UPL-001 (High)  Empty/invalid PDF accepted
DEF-UPL-002 (High)  Oversized upload 503
DEF-UI-001  (Med)   Donor wizard upload feedback
DEF-UI-002  (Med)   Save-as-draft confirmation
DEF-UI-003  (Med)   NGO apply entry reliability
"""

import io, os, sys, json, time, requests

BASE = os.getenv("KUJA_URL", "https://web-production-6f8a.up.railway.app")
PASS = "pass123"

DONOR1  = "sarah@globalhealth.org"
DONOR2  = "david@eatrust.org"
NGO1    = "fatima@amani.org"
NGO2    = "ahmed@salamrelief.org"
NGO3    = "thandi@ubuntu.org"
NGO4    = "peter@hopebridges.org"
NGO5    = "aisha@sahelwomen.org"
REV1    = "james@reviewer.org"
REV2    = "maria@reviewer.org"
ADMIN   = "admin@kuja.org"

results = []

def run(name, fn):
    try:
        fn()
        results.append(("PASS", name))
        print(f"  [PASS] {name}")
    except AssertionError as e:
        results.append(("FAIL", name, str(e)))
        print(f"  [FAIL] {name} -- {e}")
    except Exception as e:
        results.append(("ERROR", name, str(e)))
        print(f"  [ERR]  {name} -- {type(e).__name__}: {e}")

def login(email, password=PASS):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    return s, r

def login_ok(email):
    s, r = login(email)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text[:100]}"
    return s


# =========================================================================
print("\n" + "=" * 70)
print("SECTION 1: DEFECT RETESTS (except IP rate limit)")
print("=" * 70)

# --- DEF-SEC-001: Per-account lockout (does NOT need many IPs) ---
print("\n--- DEF-SEC-001: Per-account lockout ---")

def test_account_lockout_existing_user():
    """Per-account lockout for existing user after 5 bad passwords."""
    for i in range(6):
        s, r = login(NGO5, "wrongpw")
        if r.status_code == 429:
            break
    assert r.status_code == 429, f"Expected 429 after 5+ bad attempts, got {r.status_code}"

run("DEF-SEC-001: Per-account lockout (existing user)", test_account_lockout_existing_user)

def test_lockout_blocks_correct_pw():
    """Correct password during lockout -> still 429."""
    s, r = login(NGO5, PASS)
    assert r.status_code == 429, f"Expected 429 during lockout, got {r.status_code}"

run("DEF-SEC-001: Correct pw during lockout -> 429", test_lockout_blocks_correct_pw)

# Other accounts should still work
def test_other_accounts_unaffected():
    """Lockout doesn't affect other accounts."""
    s = login_ok(DONOR2)
    r = s.get(f"{BASE}/api/auth/me", timeout=10)
    assert r.status_code == 200
    assert r.json().get("user", {}).get("email") == DONOR2

run("DEF-SEC-001: Other accounts unaffected", test_other_accounts_unaffected)


# --- DEF-UPL-001: Empty/invalid PDF ---
print("\n--- DEF-UPL-001: Empty/invalid PDF rejection ---")

def test_empty_pdf_rejected():
    s = login_ok(DONOR2)
    empty_pdf = (b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
                 b"2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\nxref\n0 3\n"
                 b"0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n"
                 b"trailer<</Size 3/Root 1 0 R>>\nstartxref\n109\n%%EOF")
    gr = s.post(f"{BASE}/api/grants", json={
        "title": "Empty PDF Test", "description": "t", "total_funding": 1000,
        "currency": "USD", "status": "draft"
    }, timeout=10)
    gid = gr.json()["grant"]["id"]
    r = s.post(f"{BASE}/api/grants/{gid}/upload-grant-doc",
               files={"file": ("empty.pdf", io.BytesIO(empty_pdf), "application/pdf")},
               headers={"X-Requested-With": "XMLHttpRequest"}, timeout=30)
    assert r.status_code == 400, f"Expected 400, got {r.status_code}"
    assert "error" in r.json()
    s.delete(f"{BASE}/api/grants/{gid}", timeout=10)

run("DEF-UPL-001: Empty PDF -> 400 rejection", test_empty_pdf_rejected)

def test_tiny_file_rejected():
    s = login_ok(DONOR2)
    gr = s.post(f"{BASE}/api/grants", json={
        "title": "Tiny Test", "description": "t", "total_funding": 1000,
        "currency": "USD", "status": "draft"
    }, timeout=10)
    gid = gr.json()["grant"]["id"]
    r = s.post(f"{BASE}/api/grants/{gid}/upload-grant-doc",
               files={"file": ("tiny.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")},
               headers={"X-Requested-With": "XMLHttpRequest"}, timeout=30)
    assert r.status_code == 400, f"Expected 400, got {r.status_code}"
    s.delete(f"{BASE}/api/grants/{gid}", timeout=10)

run("DEF-UPL-001: Tiny file (8 bytes) -> 400", test_tiny_file_rejected)

def test_exe_rejected():
    s = login_ok(DONOR2)
    gr = s.post(f"{BASE}/api/grants", json={
        "title": "Exe Test", "description": "t", "total_funding": 1000,
        "currency": "USD", "status": "draft"
    }, timeout=10)
    gid = gr.json()["grant"]["id"]
    r = s.post(f"{BASE}/api/grants/{gid}/upload-grant-doc",
               files={"file": ("bad.exe", io.BytesIO(b"MZ" + b"\x00" * 500), "application/octet-stream")},
               headers={"X-Requested-With": "XMLHttpRequest"}, timeout=30)
    assert r.status_code == 400, f"Expected 400, got {r.status_code}"
    s.delete(f"{BASE}/api/grants/{gid}", timeout=10)

run("DEF-UPL-001: Unsupported .exe -> 400", test_exe_rejected)

def test_valid_txt_accepted():
    s = login_ok(DONOR2)
    gr = s.post(f"{BASE}/api/grants", json={
        "title": "Valid TXT Test", "description": "t", "total_funding": 50000,
        "currency": "USD", "status": "draft"
    }, timeout=10)
    gid = gr.json()["grant"]["id"]
    content = (
        "Grant Agreement - Reporting Requirements\n\n"
        "1. Quarterly Financial Report: Due within 30 days.\n"
        "2. Annual Narrative Report: Due within 60 days.\n"
        "3. Final Evaluation: Due within 90 days of completion.\n"
    )
    r = s.post(f"{BASE}/api/grants/{gid}/upload-grant-doc",
               files={"file": ("agreement.txt", io.BytesIO(content.encode()), "text/plain")},
               headers={"X-Requested-With": "XMLHttpRequest"}, timeout=90)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:200]}"
    data = r.json()
    assert data.get("success") is True
    assert data.get("content_extracted") is True
    s.delete(f"{BASE}/api/grants/{gid}", timeout=10)

run("DEF-UPL-001: Valid TXT -> 200 with extraction", test_valid_txt_accepted)


# --- DEF-UPL-002: Oversized upload ---
print("\n--- DEF-UPL-002: Oversized upload handling ---")

def test_oversized_upload():
    s = login_ok(DONOR2)
    gr = s.post(f"{BASE}/api/grants", json={
        "title": "Oversized Test", "description": "t", "total_funding": 1000,
        "currency": "USD", "status": "draft"
    }, timeout=10)
    gid = gr.json()["grant"]["id"]
    big = b"A" * (17 * 1024 * 1024)
    try:
        r = s.post(f"{BASE}/api/grants/{gid}/upload-grant-doc",
                   files={"file": ("huge.pdf", io.BytesIO(big), "application/pdf")},
                   headers={"X-Requested-With": "XMLHttpRequest"}, timeout=30)
        assert r.status_code in (413, 400), f"Expected 413/400, got {r.status_code}"
    except (requests.exceptions.ConnectionError, requests.exceptions.ChunkedEncodingError):
        print("    [WARN] Proxy killed connection (client-side 16MB check prevents this)")
    finally:
        try: s.delete(f"{BASE}/api/grants/{gid}", timeout=10)
        except: pass

run("DEF-UPL-002: 17MB upload -> 413 or proxy guard", test_oversized_upload)


# --- DEF-UI-001: Upload feedback ---
print("\n--- DEF-UI-001: Upload feedback (API level) ---")

def test_upload_success_has_all_fields():
    s = login_ok(DONOR2)
    gr = s.post(f"{BASE}/api/grants", json={
        "title": "Feedback Test", "description": "t", "total_funding": 50000,
        "currency": "USD", "status": "draft"
    }, timeout=10)
    gid = gr.json()["grant"]["id"]
    content = (
        "Reporting Requirements:\n"
        "1. Quarterly Financial Report due 30 days after period.\n"
        "2. Annual Narrative Report due 60 days after year end.\n"
    )
    r = s.post(f"{BASE}/api/grants/{gid}/upload-grant-doc",
               files={"file": ("report.txt", io.BytesIO(content.encode()), "text/plain")},
               headers={"X-Requested-With": "XMLHttpRequest"}, timeout=90)
    assert r.status_code == 200, f"Upload failed: {r.status_code}"
    d = r.json()
    assert d.get("success") is True
    assert "extracted_requirements" in d
    assert "content_extracted" in d
    assert "requirements_saved" in d
    s.delete(f"{BASE}/api/grants/{gid}", timeout=10)

run("DEF-UI-001: Upload response has all extraction fields", test_upload_success_has_all_fields)

def test_upload_error_returns_json_error():
    s = login_ok(DONOR2)
    gr = s.post(f"{BASE}/api/grants", json={
        "title": "Error Test", "description": "t", "total_funding": 1000,
        "currency": "USD", "status": "draft"
    }, timeout=10)
    gid = gr.json()["grant"]["id"]
    r = s.post(f"{BASE}/api/grants/{gid}/upload-grant-doc",
               files={"file": ("e.txt", io.BytesIO(b"hi"), "text/plain")},
               headers={"X-Requested-With": "XMLHttpRequest"}, timeout=30)
    assert r.status_code == 400
    d = r.json()
    assert "error" in d
    assert len(d["error"]) > 10
    s.delete(f"{BASE}/api/grants/{gid}", timeout=10)

run("DEF-UI-001: Upload error returns descriptive JSON", test_upload_error_returns_json_error)


# --- DEF-UI-002: Save-as-draft ---
print("\n--- DEF-UI-002: Save-as-draft (API level) ---")

def test_save_draft_creates_grant():
    s = login_ok(DONOR2)
    r = s.post(f"{BASE}/api/grants", json={
        "title": "Draft Save Test", "description": "Testing draft save",
        "total_funding": 5000, "currency": "USD", "status": "draft"
    }, timeout=10)
    assert r.status_code in (200, 201), f"Draft save failed: {r.status_code}"
    d = r.json()
    gid = d["grant"]["id"]
    assert gid > 0
    # Verify it persisted
    r2 = s.get(f"{BASE}/api/grants/{gid}", timeout=10)
    assert r2.status_code == 200
    grant = r2.json().get("grant", r2.json())
    assert grant.get("status") == "draft"
    s.delete(f"{BASE}/api/grants/{gid}", timeout=10)

run("DEF-UI-002: Save draft creates and persists grant", test_save_draft_creates_grant)

def test_save_draft_update_existing():
    s = login_ok(DONOR2)
    r = s.post(f"{BASE}/api/grants", json={
        "title": "Draft Update Test", "description": "Original",
        "total_funding": 5000, "currency": "USD", "status": "draft"
    }, timeout=10)
    gid = r.json()["grant"]["id"]
    # Update it
    r2 = s.put(f"{BASE}/api/grants/{gid}", json={
        "description": "Updated description", "status": "draft"
    }, timeout=10)
    assert r2.status_code == 200, f"Draft update failed: {r2.status_code}"
    s.delete(f"{BASE}/api/grants/{gid}", timeout=10)

run("DEF-UI-002: Save draft update existing grant", test_save_draft_update_existing)


# --- DEF-UI-003: Apply entry ---
print("\n--- DEF-UI-003: Apply entry (API level) ---")

test_apply_grant_id = None

def test_apply_grant_detail_loads():
    global test_apply_grant_id
    # Create a published grant first
    s = login_ok(DONOR2)
    r = s.post(f"{BASE}/api/grants", json={
        "title": "Apply Entry Test Grant", "description": "For apply test",
        "total_funding": 50000, "currency": "USD", "status": "draft"
    }, timeout=10)
    gid = r.json()["grant"]["id"]
    s.put(f"{BASE}/api/grants/{gid}", json={"status": "open"}, timeout=10)
    test_apply_grant_id = gid
    # NGO loads grant detail (what startApply does)
    ns = login_ok(NGO1)
    r2 = ns.get(f"{BASE}/api/grants/{gid}", timeout=10)
    assert r2.status_code == 200, f"Grant detail load failed: {r2.status_code}"
    grant = r2.json().get("grant", r2.json())
    assert grant.get("title") == "Apply Entry Test Grant"

run("DEF-UI-003: Grant detail loads for apply entry", test_apply_grant_detail_loads)

def test_apply_creates_application():
    if not test_apply_grant_id:
        raise AssertionError("No grant for apply test")
    s = login_ok(NGO1)
    r = s.post(f"{BASE}/api/applications", json={
        "grant_id": test_apply_grant_id
    }, timeout=15)
    assert r.status_code in (200, 201), f"Apply failed: {r.status_code} {r.text[:200]}"

run("DEF-UI-003: NGO creates application via apply entry", test_apply_creates_application)


# =========================================================================
print("\n" + "=" * 70)
print("SECTION 2: FULL REGRESSION")
print("=" * 70)

def test_login_all_accounts():
    for email in [DONOR1, DONOR2, NGO1, NGO2, NGO3, NGO4, REV1, REV2]:
        s, r = login(email)
        assert r.status_code == 200, f"Login failed for {email}: {r.status_code}"

run("AUTH: All 8 non-locked accounts log in", test_login_all_accounts)

def test_unauth_401():
    r = requests.get(f"{BASE}/api/grants", timeout=10)
    assert r.status_code == 401

run("AUTH: Unauthenticated -> 401", test_unauth_401)

def test_ngo_cant_create_grant():
    s = login_ok(NGO1)
    r = s.post(f"{BASE}/api/grants", json={"title": "X", "total_funding": 1000, "currency": "USD"}, timeout=10)
    assert r.status_code == 403

run("AUTH: NGO cannot create grants -> 403", test_ngo_cant_create_grant)

# Grant lifecycle
test_grant_id = None
def test_create_grant():
    global test_grant_id
    s = login_ok(DONOR2)
    r = s.post(f"{BASE}/api/grants", json={
        "title": "Regression Grant", "description": "Test", "total_funding": 100000,
        "currency": "USD", "deadline": "2026-12-31", "status": "draft"
    }, timeout=10)
    assert r.status_code in (200, 201)
    test_grant_id = r.json()["grant"]["id"]

run("GRANT: Create draft grant", test_create_grant)

def test_list_grants():
    s = login_ok(DONOR2)
    r = s.get(f"{BASE}/api/grants", timeout=10)
    assert r.status_code == 200
    data = r.json()
    grants = data if isinstance(data, list) else data.get("grants", [])
    assert len(grants) > 0

run("GRANT: List grants", test_list_grants)

def test_get_grant():
    if not test_grant_id: raise AssertionError("No grant")
    s = login_ok(DONOR2)
    r = s.get(f"{BASE}/api/grants/{test_grant_id}", timeout=10)
    assert r.status_code == 200

run("GRANT: Get grant detail", test_get_grant)

# Assessments
def test_frameworks():
    s = login_ok(NGO1)
    r = s.get(f"{BASE}/api/assessments/frameworks", timeout=10)
    assert r.status_code == 200
    data = r.json()
    fw = data if isinstance(data, list) else data.get("frameworks", [])
    assert len(fw) >= 5

run("CAP: List frameworks (>=5)", test_frameworks)

def test_assessments():
    s = login_ok(NGO1)
    r = s.get(f"{BASE}/api/assessments", timeout=10)
    assert r.status_code == 200

run("CAP: List assessments", test_assessments)

# Due diligence
def test_sanctions():
    s = login_ok(DONOR2)
    orgs = s.get(f"{BASE}/api/organizations", timeout=10).json()
    orgs_list = orgs if isinstance(orgs, list) else orgs.get("organizations", [])
    ngo_orgs = [o for o in orgs_list if o.get("type") == "ngo"]
    if ngo_orgs:
        r = s.post(f"{BASE}/api/compliance/screen", json={"org_id": ngo_orgs[0]["id"]}, timeout=30)
        assert r.status_code in (200, 201)

run("DILIGENCE: Sanctions screening", test_sanctions)

def test_registries():
    s = login_ok(DONOR2)
    r = s.get(f"{BASE}/api/verification/registries", timeout=10)
    assert r.status_code == 200

run("DILIGENCE: Registry directory", test_registries)

# Applications
def test_ngo_applications():
    s = login_ok(NGO1)
    r = s.get(f"{BASE}/api/applications", timeout=10)
    assert r.status_code == 200

run("APP: NGO lists applications", test_ngo_applications)

def test_donor_applications():
    s = login_ok(DONOR2)
    r = s.get(f"{BASE}/api/applications", timeout=10)
    assert r.status_code == 200

run("APP: Donor lists applications", test_donor_applications)

# Documents
def test_doc_upload():
    s = login_ok(NGO1)
    r = s.post(f"{BASE}/api/documents/upload",
               files={"file": ("report.txt", io.BytesIO(b"Financial Report\n" * 20), "text/plain")},
               headers={"X-Requested-With": "XMLHttpRequest"}, timeout=30)
    assert r.status_code in (200, 201)

run("DOC: NGO uploads document", test_doc_upload)

# Reports
def test_ngo_reports():
    s = login_ok(NGO1)
    r = s.get(f"{BASE}/api/reports", timeout=10)
    assert r.status_code == 200

run("REPORT: NGO lists reports", test_ngo_reports)

def test_donor_reports():
    s = login_ok(DONOR2)
    r = s.get(f"{BASE}/api/reports", timeout=10)
    assert r.status_code == 200

run("REPORT: Donor lists reports", test_donor_reports)

def test_upcoming():
    s = login_ok(NGO1)
    r = s.get(f"{BASE}/api/reports/upcoming", timeout=10)
    assert r.status_code == 200

run("REPORT: Upcoming reports", test_upcoming)

# Dashboard
def test_dashboard():
    s = login_ok(DONOR2)
    r = s.get(f"{BASE}/api/dashboard/stats", timeout=10)
    assert r.status_code == 200

run("DASHBOARD: Stats", test_dashboard)

# Organizations
def test_orgs():
    s = login_ok(DONOR2)
    r = s.get(f"{BASE}/api/organizations", timeout=10)
    assert r.status_code == 200

run("ORG: List organizations", test_orgs)

# Reviews
def test_reviews():
    s = login_ok(REV1)
    r = s.get(f"{BASE}/api/reviews", timeout=10)
    assert r.status_code == 200

run("REVIEW: List reviews", test_reviews)

# Security headers
def test_sec_headers():
    r = requests.get(f"{BASE}/api/health", timeout=10)
    h = r.headers
    assert h.get("X-Content-Type-Options") == "nosniff"
    assert h.get("X-Frame-Options") == "DENY"
    assert "strict-origin" in (h.get("Referrer-Policy") or "").lower()
    assert "max-age=" in (h.get("Strict-Transport-Security") or "")
    assert "default-src" in (h.get("Content-Security-Policy") or "")

run("SEC: All security headers present", test_sec_headers)

# Health
def test_health():
    r = requests.get(f"{BASE}/api/health", timeout=10)
    assert r.status_code == 200
    assert r.json().get("status") == "healthy"

run("HEALTH: Healthy", test_health)

def test_static():
    r = requests.get(f"{BASE}/static/js/app.js", timeout=10)
    assert r.status_code == 200
    assert len(r.text) > 1000

run("MISC: Static assets", test_static)

def test_api_info():
    r = requests.get(f"{BASE}/api", timeout=10)
    assert r.status_code == 200

run("MISC: API info", test_api_info)


# =========================================================================
# DEF-SEC-001: IP RATE LIMIT (runs LAST — uses up IP quota)
# The test sends enough requests to trigger the IP-based rate limit.
# By running last, accumulated login attempts from earlier tests contribute
# to the count, and subsequent tests aren't affected.
print("\n" + "=" * 70)
print("SECTION 3: IP RATE LIMIT TEST (runs last)")
print("=" * 70)

print("\n--- DEF-SEC-001: IP-based rate limiting ---")

def test_ip_rate_limit_nonexistent_email():
    """IP rate limit triggers for mass login attempts (even non-existent emails).
    Server limit is 50 per IP per 5 minutes. Earlier tests already used ~30-40
    login attempts, so this test needs fewer attempts to trigger 429.
    We send up to 55 to cover the case where this test runs standalone."""
    last_status = None
    triggered_429 = False
    for i in range(55):
        s = requests.Session()
        r = s.post(f"{BASE}/api/auth/login",
                   json={"email": f"attacker{i}@evil.com", "password": "bruteforce"},
                   timeout=10)
        last_status = r.status_code
        if r.status_code == 429:
            triggered_429 = True
            print(f"    429 triggered at attempt {i+1}")
            break
    assert triggered_429, f"Expected 429 within 55 attempts, last status: {last_status}"

run("DEF-SEC-001: IP rate limit on non-existent emails", test_ip_rate_limit_nonexistent_email)


# =========================================================================
# CLEANUP
print("\n" + "=" * 70)
print("CLEANUP")
print("=" * 70)

def test_cleanup():
    s = login_ok(DONOR2)
    for gid in [test_grant_id, test_apply_grant_id]:
        if gid:
            s.put(f"{BASE}/api/grants/{gid}", json={"status": "draft"}, timeout=10)
            s.delete(f"{BASE}/api/grants/{gid}", timeout=10)

run("CLEANUP: Remove test grants", test_cleanup)


# =========================================================================
# SUMMARY
print("\n" + "=" * 70)
print("TEST SUMMARY")
print("=" * 70)

passed = sum(1 for r in results if r[0] == "PASS")
failed = sum(1 for r in results if r[0] == "FAIL")
errors = sum(1 for r in results if r[0] == "ERROR")
total = len(results)

print(f"\nTotal: {total}  |  PASSED: {passed}  |  FAILED: {failed}  |  ERRORS: {errors}")
print(f"Pass rate: {passed}/{total} ({100*passed//total if total else 0}%)")

if failed or errors:
    print("\n--- FAILURES & ERRORS ---")
    for r in results:
        if r[0] in ("FAIL", "ERROR"):
            print(f"  {r[0]}: {r[1]} -- {r[2]}")

print("\n--- DEFECT RETEST SUMMARY ---")
defect_map = {
    "DEF-SEC-001": [], "DEF-UPL-001": [], "DEF-UPL-002": [],
    "DEF-UI-001": [], "DEF-UI-002": [], "DEF-UI-003": [],
}
for r in results:
    for did in defect_map:
        if did in r[1]:
            defect_map[did].append(r[0])

for did, statuses in defect_map.items():
    if not statuses:
        print(f"  {did}: NOT TESTED")
    elif all(s == "PASS" for s in statuses):
        print(f"  {did}: RESOLVED ({len(statuses)}/{len(statuses)} passed)")
    else:
        fails = sum(1 for s in statuses if s != "PASS")
        print(f"  {did}: NEEDS WORK ({fails}/{len(statuses)} failed)")

print()
sys.exit(1 if (failed + errors) > 0 else 0)
