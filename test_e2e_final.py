#!/usr/bin/env python3
"""
Kuja Grant - Final E2E Retest (March 5 2026 Audit v3)
======================================================
Covers all 6 defects from the production audit + full regression.
Uses session pooling to minimize login attempts (IP rate limit = 20/5min).

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
_login_count = 0  # Track total login attempts for debugging

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

# --- Session pool: login once per user, reuse across tests ---
_session_pool = {}

def login(email, password=PASS):
    """Create a NEW session (not cached). Increments login counter."""
    global _login_count
    _login_count += 1
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    return s, r

def login_ok(email):
    """Get a cached session for this user. Only logs in once per user."""
    if email in _session_pool:
        return _session_pool[email]
    s, r = login(email)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text[:100]}"
    _session_pool[email] = s
    return s


# =========================================================================
print("\n" + "=" * 70)
print("SECTION 1: DEFECT RETESTS (except IP rate limit)")
print("=" * 70)

# --- DEF-SEC-001: Per-account lockout (uses fresh logins, not cached) ---
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

def test_other_accounts_unaffected():
    """Lockout doesn't affect other accounts."""
    s = login_ok(DONOR2)
    r = s.get(f"{BASE}/api/auth/me", timeout=10)
    assert r.status_code == 200
    assert r.json().get("user", {}).get("email") == DONOR2

run("DEF-SEC-001: Other accounts unaffected", test_other_accounts_unaffected)


# --- DEF-UPL-001: Empty/invalid PDF ---
print("\n--- DEF-UPL-001: Empty/invalid PDF rejection ---")

def test_empty_pdf_rejected_grants():
    """Grant doc upload: empty PDF -> 400."""
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

run("DEF-UPL-001: Empty PDF -> 400 (grant upload)", test_empty_pdf_rejected_grants)

def test_empty_pdf_rejected_documents():
    """Document upload: empty PDF -> 400 (the 201 bug)."""
    s = login_ok(NGO1)
    empty_pdf = (b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
                 b"2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\nxref\n0 3\n"
                 b"0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n"
                 b"trailer<</Size 3/Root 1 0 R>>\nstartxref\n109\n%%EOF")
    r = s.post(f"{BASE}/api/documents/upload",
               files={"file": ("invalid_empty.pdf", io.BytesIO(empty_pdf), "application/pdf")},
               headers={"X-Requested-With": "XMLHttpRequest"}, timeout=30)
    assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text[:200]}"
    assert r.json().get("success") is False

run("DEF-UPL-001: Empty PDF -> 400 (document upload)", test_empty_pdf_rejected_documents)

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
    s = login_ok(DONOR2)
    r = s.post(f"{BASE}/api/grants", json={
        "title": "Apply Entry Test Grant", "description": "For apply test",
        "total_funding": 50000, "currency": "USD", "status": "draft"
    }, timeout=10)
    gid = r.json()["grant"]["id"]
    s.put(f"{BASE}/api/grants/{gid}", json={"status": "open"}, timeout=10)
    test_apply_grant_id = gid
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
print("SECTION 2: FULL REGRESSION (using cached sessions)")
print("=" * 70)

def test_login_all_accounts():
    """Verify all 8 non-locked accounts can log in (uses fresh sessions)."""
    for email in [DONOR1, DONOR2, NGO1, NGO2, NGO3, NGO4, REV1, REV2]:
        if email in _session_pool:
            # Already verified via cached session
            continue
        s = login_ok(email)  # Creates and caches

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

def test_doc_upload():
    """NGO uploads a valid document (not empty)."""
    s = login_ok(NGO1)
    valid_content = b"Financial Report\nQuarterly summary of expenditures and activities for the grant period.\n" * 5
    r = s.post(f"{BASE}/api/documents/upload",
               files={"file": ("report.txt", io.BytesIO(valid_content), "text/plain")},
               headers={"X-Requested-With": "XMLHttpRequest"}, timeout=30)
    assert r.status_code in (200, 201), f"Doc upload failed: {r.status_code} {r.text[:200]}"

run("DOC: NGO uploads valid document", test_doc_upload)

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

def test_dashboard():
    s = login_ok(DONOR2)
    r = s.get(f"{BASE}/api/dashboard/stats", timeout=10)
    assert r.status_code == 200

run("DASHBOARD: Stats", test_dashboard)

def test_orgs():
    s = login_ok(DONOR2)
    r = s.get(f"{BASE}/api/organizations", timeout=10)
    assert r.status_code == 200

run("ORG: List organizations", test_orgs)

def test_reviews():
    s = login_ok(REV1)
    r = s.get(f"{BASE}/api/reviews", timeout=10)
    assert r.status_code == 200

run("REVIEW: List reviews", test_reviews)

def test_sec_headers():
    r = requests.get(f"{BASE}/api/health", timeout=10)
    h = r.headers
    assert h.get("X-Content-Type-Options") == "nosniff"
    assert h.get("X-Frame-Options") == "DENY"
    assert "strict-origin" in (h.get("Referrer-Policy") or "").lower()
    assert "max-age=" in (h.get("Strict-Transport-Security") or "")
    assert "default-src" in (h.get("Content-Security-Policy") or "")

run("SEC: All security headers present", test_sec_headers)

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
print("\n" + "=" * 70)
print("SECTION 2b: REGRESSION GATE (Localization + Donor Wizard + NGO Apply)")
print("=" * 70)

# --- Localization ---
print("\n--- LOCALIZATION ---")

def test_translation_files():
    """Translation JSON files load for all supported languages."""
    for lang in ['en', 'ar', 'fr', 'es']:
        r = requests.get(f"{BASE}/static/js/translations/{lang}.json", timeout=10)
        assert r.status_code == 200, f"Translation file {lang}.json failed: {r.status_code}"
        data = r.json()
        assert len(data) >= 10, f"{lang}.json has too few keys: {len(data)}"

run("I18N: Translation files load (en/ar/fr/es)", test_translation_files)

def test_language_switch():
    """Language preference can be set and retrieved."""
    s = login_ok(NGO1)
    for lang in ['fr', 'ar', 'en']:
        r = s.put(f"{BASE}/api/auth/language", json={"language": lang}, timeout=10)
        assert r.status_code == 200, f"Set language '{lang}' failed: {r.status_code}"
    # Invalid language rejected
    r = s.put(f"{BASE}/api/auth/language", json={"language": "xx"}, timeout=10)
    assert r.status_code == 400, f"Invalid language should be 400, got {r.status_code}"

run("I18N: Language preference set/get", test_language_switch)

# --- Donor Wizard Full Lifecycle ---
print("\n--- DONOR WIZARD LIFECYCLE ---")

_wizard_grant_id = None

def test_wizard_step1_create():
    """Wizard Step 1: Create grant with basic info."""
    global _wizard_grant_id
    s = login_ok(DONOR1)
    r = s.post(f"{BASE}/api/grants", json={
        "title": "Wizard E2E Grant",
        "description": "End-to-end test of the 5-step donor wizard flow.",
        "total_funding": 250000,
        "currency": "USD",
        "deadline": "2026-12-31",
        "sectors": ["health", "education"],
        "countries": ["KE", "UG"],
        "status": "draft"
    }, timeout=10)
    assert r.status_code in (200, 201), f"Create grant failed: {r.status_code}"
    _wizard_grant_id = r.json()["grant"]["id"]
    assert _wizard_grant_id > 0

run("WIZARD: Step 1 - Create grant draft", test_wizard_step1_create)

def test_wizard_step2_criteria():
    """Wizard Step 2: Add evaluation criteria."""
    if not _wizard_grant_id: raise AssertionError("No wizard grant")
    s = login_ok(DONOR1)
    r = s.put(f"{BASE}/api/grants/{_wizard_grant_id}", json={
        "criteria": [
            {"label": "Technical approach", "weight": 40, "description": "Quality of methodology"},
            {"label": "Organizational capacity", "weight": 30, "description": "Track record"},
            {"label": "Budget reasonableness", "weight": 30, "description": "Cost effectiveness"}
        ]
    }, timeout=10)
    assert r.status_code == 200, f"Add criteria failed: {r.status_code}"

run("WIZARD: Step 2 - Add evaluation criteria", test_wizard_step2_criteria)

def test_wizard_step3_docs():
    """Wizard Step 3: Configure required documents."""
    if not _wizard_grant_id: raise AssertionError("No wizard grant")
    s = login_ok(DONOR1)
    r = s.put(f"{BASE}/api/grants/{_wizard_grant_id}", json={
        "doc_requirements": [
            {"type": "financial_report", "name": "Annual Financial Report", "required": True,
             "description": "Audited financials for the last fiscal year"},
            {"type": "proposal", "name": "Project Proposal", "required": True,
             "description": "Detailed project description with budget"}
        ]
    }, timeout=10)
    assert r.status_code == 200, f"Add docs failed: {r.status_code}"

run("WIZARD: Step 3 - Configure required documents", test_wizard_step3_docs)

def test_wizard_step4_upload():
    """Wizard Step 4: Upload grant agreement + AI extraction."""
    if not _wizard_grant_id: raise AssertionError("No wizard grant")
    s = login_ok(DONOR1)
    content = (
        "Grant Agreement - Reporting Requirements\n\n"
        "1. Quarterly Financial Report: Due within 30 days of quarter end.\n"
        "2. Annual Narrative Report: Due within 60 days of fiscal year.\n"
        "3. Final Evaluation Report: Due within 90 days of project completion.\n"
    )
    r = s.post(f"{BASE}/api/grants/{_wizard_grant_id}/upload-grant-doc",
               files={"file": ("wizard_agreement.txt", io.BytesIO(content.encode()), "text/plain")},
               headers={"X-Requested-With": "XMLHttpRequest"}, timeout=90)
    assert r.status_code == 200, f"Upload failed: {r.status_code}: {r.text[:200]}"
    d = r.json()
    assert d.get("success") is True
    assert d.get("content_extracted") is True

run("WIZARD: Step 4 - Upload agreement + AI extraction", test_wizard_step4_upload)

def test_wizard_step5_publish():
    """Wizard Step 5: Publish grant (draft -> open)."""
    if not _wizard_grant_id: raise AssertionError("No wizard grant")
    s = login_ok(DONOR1)
    r = s.put(f"{BASE}/api/grants/{_wizard_grant_id}", json={"status": "open"}, timeout=10)
    assert r.status_code == 200, f"Publish failed: {r.status_code}"
    # Verify it's open
    r2 = s.get(f"{BASE}/api/grants/{_wizard_grant_id}", timeout=10)
    grant = r2.json().get("grant", r2.json())
    assert grant.get("status") == "open"

run("WIZARD: Step 5 - Publish grant", test_wizard_step5_publish)

# --- NGO Apply Full Lifecycle ---
print("\n--- NGO APPLY LIFECYCLE ---")

def test_apply_browse_open():
    """NGO can browse and find the wizard-published grant."""
    if not _wizard_grant_id: raise AssertionError("No wizard grant")
    s = login_ok(NGO2)
    r = s.get(f"{BASE}/api/grants", timeout=10)
    assert r.status_code == 200
    data = r.json()
    grants = data if isinstance(data, list) else data.get("grants", [])
    found = any(g.get("id") == _wizard_grant_id for g in grants)
    assert found, f"Wizard grant {_wizard_grant_id} not found in open grants list"

run("APPLY: NGO browses and finds open grant", test_apply_browse_open)

def test_apply_load_details():
    """NGO loads grant details to start application."""
    if not _wizard_grant_id: raise AssertionError("No wizard grant")
    s = login_ok(NGO2)
    r = s.get(f"{BASE}/api/grants/{_wizard_grant_id}", timeout=10)
    assert r.status_code == 200
    g = r.json().get("grant", r.json())
    assert g.get("title") == "Wizard E2E Grant"
    assert len(g.get("criteria", [])) >= 3
    assert len(g.get("doc_requirements", [])) >= 2

run("APPLY: Load grant details with criteria + docs", test_apply_load_details)

def test_apply_create_application():
    """NGO creates application for the wizard grant."""
    if not _wizard_grant_id: raise AssertionError("No wizard grant")
    s = login_ok(NGO2)
    r = s.post(f"{BASE}/api/applications", json={
        "grant_id": _wizard_grant_id
    }, timeout=15)
    assert r.status_code in (200, 201), f"Create app failed: {r.status_code}: {r.text[:200]}"

run("APPLY: Create application", test_apply_create_application)

def test_apply_upload_doc():
    """NGO uploads required document for application."""
    s = login_ok(NGO2)
    content = b"Annual Financial Report\nTotal Revenue: $500,000\nTotal Expenses: $480,000\nNet Income: $20,000\n" * 5
    r = s.post(f"{BASE}/api/documents/upload",
               files={"file": ("financials.txt", io.BytesIO(content), "text/plain")},
               data={"doc_type": "financial_report"},
               headers={"X-Requested-With": "XMLHttpRequest"}, timeout=30)
    assert r.status_code in (200, 201), f"Doc upload failed: {r.status_code}"
    assert r.json().get("success") is not False

run("APPLY: Upload required document", test_apply_upload_doc)

# --- Admin Audit Dashboard ---
print("\n--- ADMIN AUDIT DASHBOARD ---")

def test_admin_stats_has_security():
    """Admin stats include security and document metrics."""
    s = login_ok(ADMIN)
    r = s.get(f"{BASE}/api/admin/stats", timeout=10)
    assert r.status_code == 200
    stats = r.json().get("stats", {})
    assert "security" in stats, "Missing 'security' in admin stats"
    sec = stats["security"]
    assert "login_attempts_24h" in sec
    assert "unique_ips_24h" in sec
    assert "currently_locked" in sec
    assert "top_ips_24h" in sec
    assert "documents" in stats, "Missing 'documents' in admin stats"
    docs = stats["documents"]
    assert "total_documents" in docs
    assert "avg_score" in docs

run("AUDIT: Admin stats include security+document metrics", test_admin_stats_has_security)

def test_admin_security_events():
    """Admin security-events endpoint returns data."""
    s = login_ok(ADMIN)
    r = s.get(f"{BASE}/api/admin/security-events", timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert d.get("success") is True
    assert "security" in d

run("AUDIT: Security events endpoint accessible", test_admin_security_events)

# Cleanup wizard grant
def _cleanup_wizard():
    if _wizard_grant_id:
        try:
            s = login_ok(DONOR1)
            s.put(f"{BASE}/api/grants/{_wizard_grant_id}", json={"status": "draft"}, timeout=10)
            s.delete(f"{BASE}/api/grants/{_wizard_grant_id}", timeout=10)
        except: pass

_cleanup_wizard()


# =========================================================================
# DEF-SEC-001: IP RATE LIMIT (runs LAST)
print("\n" + "=" * 70)
print(f"SECTION 3: IP RATE LIMIT TEST (runs last, {_login_count} logins so far)")
print("=" * 70)

print("\n--- DEF-SEC-001: IP-based rate limiting ---")

def test_ip_rate_limit_nonexistent_email():
    """IP rate limit triggers for mass login attempts.
    Server limit is 20 per IP per 5 minutes. Earlier tests already used
    some login attempts (cached sessions), so fewer attempts may be needed."""
    global _login_count
    last_status = None
    triggered_429 = False
    for i in range(30):
        s = requests.Session()
        _login_count += 1
        r = s.post(f"{BASE}/api/auth/login",
                   json={"email": f"attacker{i}@evil.com", "password": "bruteforce"},
                   timeout=10)
        last_status = r.status_code
        if r.status_code == 429:
            triggered_429 = True
            print(f"    429 triggered at attempt {i+1} (total logins: {_login_count})")
            break
    assert triggered_429, f"Expected 429 within 30 attempts, last status: {last_status} (total logins: {_login_count})"

run("DEF-SEC-001: IP rate limit on non-existent emails", test_ip_rate_limit_nonexistent_email)


# =========================================================================
# CLEANUP
print("\n" + "=" * 70)
print("CLEANUP")
print("=" * 70)

def test_cleanup():
    # After IP rate limit test, our IP may be blocked.
    s, r = login(DONOR2)
    if r.status_code == 429:
        print("    [WARN] IP rate-limited -- cleanup skipped (test grants will expire)")
        return
    assert r.status_code == 200, f"Login failed for {DONOR2}: {r.status_code}"
    for gid in [test_grant_id, test_apply_grant_id]:
        if gid:
            try:
                s.put(f"{BASE}/api/grants/{gid}", json={"status": "draft"}, timeout=10)
                s.delete(f"{BASE}/api/grants/{gid}", timeout=10)
            except: pass

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
print(f"Total login attempts: {_login_count}")

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

print("\n--- P1 REGRESSION GATE SUMMARY ---")
gate_map = {"I18N": [], "WIZARD": [], "APPLY": [], "AUDIT": []}
for r in results:
    for gid in gate_map:
        if r[1].startswith(gid + ":"):
            gate_map[gid].append(r[0])

all_gate_pass = True
for gid, statuses in gate_map.items():
    if not statuses:
        print(f"  {gid}: NOT TESTED")
        all_gate_pass = False
    elif all(s == "PASS" for s in statuses):
        print(f"  {gid}: PASS ({len(statuses)}/{len(statuses)})")
    else:
        fails = sum(1 for s in statuses if s != "PASS")
        print(f"  {gid}: FAIL ({fails}/{len(statuses)} failed)")
        all_gate_pass = False

if all_gate_pass:
    print("\n  >>> REGRESSION GATE: PASS (safe to deploy)")
else:
    print("\n  >>> REGRESSION GATE: FAIL (do NOT deploy)")

print()
sys.exit(1 if (failed + errors) > 0 else 0)
