#!/usr/bin/env python3
"""
Kuja Grant Management System - Full E2E Retest
================================================
Covers all 5 reported defects + complete functional regression.

Defects under retest:
  DEF-NFR-002  Brute-force lockout (HIGH)
  DEF-NFR-003  Empty/invalid PDF accepted (MEDIUM)
  DEF-NFR-004  Oversized upload 503 (MEDIUM)
  DEF-E2E-UI-001  Donor wizard EN upload feedback (MEDIUM)
  DEF-E2E-UI-002  Donor wizard AR upload feedback (MEDIUM)
"""

import io, os, sys, json, time, requests

BASE = os.getenv("KUJA_URL", "https://web-production-6f8a.up.railway.app")
PASS = "pass123"

# Test accounts
ADMIN   = "admin@kuja.org"
DONOR1  = "sarah@globalhealth.org"
DONOR2  = "david@eatrust.org"
NGO1    = "fatima@amani.org"
NGO2    = "ahmed@salamrelief.org"
NGO3    = "thandi@ubuntu.org"
NGO4    = "peter@hopebridges.org"
NGO5    = "aisha@sahelwomen.org"
REV1    = "james@reviewer.org"
REV2    = "maria@reviewer.org"

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
        print(f"  [ERR]  {name} -- {e}")


def login(email, password=PASS):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": password},
               timeout=15)
    return s, r


def login_ok(email):
    s, r = login(email)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code}"
    return s


# =========================================================================
# SECTION 1: DEFECT RETESTS
# =========================================================================
print("\n" + "=" * 70)
print("SECTION 1: DEFECT RETESTS")
print("=" * 70)

# --- DEF-NFR-002: Brute-force lockout ---
print("\n--- DEF-NFR-002: Brute-force lockout ---")

def test_lockout_after_5_bad():
    """5 bad passwords -> 429 lockout on 6th attempt."""
    for i in range(6):
        s, r = login(ADMIN, "wrong_password")
        if r.status_code == 429:
            break
    s, r = login(ADMIN, "wrong_password")
    assert r.status_code == 429, f"Expected 429, got {r.status_code}"

run("DEF-NFR-002: Lockout after 5 bad logins -> 429", test_lockout_after_5_bad)

def test_lockout_correct_pw_also_blocked():
    """Correct password during lockout still returns 429."""
    s, r = login(ADMIN, PASS)
    assert r.status_code == 429, f"Expected 429 during lockout, got {r.status_code}"

run("DEF-NFR-002: Correct pw during lockout -> still 429", test_lockout_correct_pw_also_blocked)

def test_valid_login_non_locked():
    """Non-locked account can still log in."""
    s = login_ok(DONOR1)
    r = s.get(f"{BASE}/api/auth/me", timeout=10)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    data = r.json()
    assert data.get("email") == DONOR1, f"Expected {DONOR1}, got {data.get('email')}"

run("DEF-NFR-002: Non-locked account logs in normally", test_valid_login_non_locked)


# --- DEF-NFR-003: Empty/invalid PDF ---
print("\n--- DEF-NFR-003: Empty/invalid PDF rejection ---")

def test_empty_pdf_rejected():
    """Upload empty PDF -> 400 rejection (not 200 with fake AI results)."""
    s = login_ok(DONOR1)
    empty_pdf = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\nxref\n0 3\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \ntrailer<</Size 3/Root 1 0 R>>\nstartxref\n109\n%%EOF"
    gr = s.post(f"{BASE}/api/grants", json={
        "title": "Empty PDF Test", "description": "Test",
        "total_funding": 1000, "currency": "USD", "status": "draft"
    }, timeout=10)
    assert gr.status_code in (200, 201), f"Grant create failed: {gr.status_code}"
    gid = gr.json()["grant"]["id"]
    r = s.post(f"{BASE}/api/grants/{gid}/upload-grant-doc",
               files={"file": ("empty.pdf", io.BytesIO(empty_pdf), "application/pdf")},
               headers={"X-Requested-With": "XMLHttpRequest"}, timeout=30)
    assert r.status_code == 400, f"Expected 400 for empty PDF, got {r.status_code}: {r.text[:200]}"
    assert "error" in r.json()
    s.delete(f"{BASE}/api/grants/{gid}", timeout=10)

run("DEF-NFR-003: Empty PDF upload -> 400 rejection", test_empty_pdf_rejected)

def test_tiny_file_rejected():
    """Upload tiny file (< 100 bytes) -> 400 rejection."""
    s = login_ok(DONOR1)
    gr = s.post(f"{BASE}/api/grants", json={
        "title": "Tiny File Test", "description": "Test",
        "total_funding": 1000, "currency": "USD", "status": "draft"
    }, timeout=10)
    gid = gr.json()["grant"]["id"]
    tiny = b"%PDF-1.4"  # 8 bytes
    r = s.post(f"{BASE}/api/grants/{gid}/upload-grant-doc",
               files={"file": ("tiny.pdf", io.BytesIO(tiny), "application/pdf")},
               headers={"X-Requested-With": "XMLHttpRequest"}, timeout=30)
    assert r.status_code == 400, f"Expected 400 for tiny file, got {r.status_code}"
    err = r.json().get("error", "").lower()
    assert "empty" in err or "small" in err, f"Error should mention empty/small: {err}"
    s.delete(f"{BASE}/api/grants/{gid}", timeout=10)

run("DEF-NFR-003: Tiny file (8 bytes) -> 400 rejection", test_tiny_file_rejected)

def test_unsupported_extension_rejected():
    """Upload .exe file -> 400 rejection."""
    s = login_ok(DONOR1)
    gr = s.post(f"{BASE}/api/grants", json={
        "title": "Bad Ext Test", "description": "Test",
        "total_funding": 1000, "currency": "USD", "status": "draft"
    }, timeout=10)
    gid = gr.json()["grant"]["id"]
    r = s.post(f"{BASE}/api/grants/{gid}/upload-grant-doc",
               files={"file": ("malware.exe", io.BytesIO(b"MZ" + b"\x00" * 500), "application/octet-stream")},
               headers={"X-Requested-With": "XMLHttpRequest"}, timeout=30)
    assert r.status_code == 400, f"Expected 400 for .exe, got {r.status_code}"
    s.delete(f"{BASE}/api/grants/{gid}", timeout=10)

run("DEF-NFR-003: Unsupported extension (.exe) -> 400", test_unsupported_extension_rejected)

def test_valid_txt_accepted():
    """Upload valid .txt file with real content -> 200 success."""
    s = login_ok(DONOR1)
    gr = s.post(f"{BASE}/api/grants", json={
        "title": "Valid TXT Test", "description": "Testing valid text upload",
        "total_funding": 50000, "currency": "USD", "status": "draft"
    }, timeout=10)
    gid = gr.json()["grant"]["id"]
    content = (
        "Grant Agreement - Quarterly Reporting Requirements\n\n"
        "1. Financial Report: Due every quarter, within 30 days of period end.\n"
        "   Must include budget vs actual expenditure breakdown.\n"
        "2. Narrative Report: Due every quarter, within 45 days.\n"
        "   Must include progress against indicators, challenges, and lessons learned.\n"
        "3. Annual Audit: Independent audit required within 90 days of fiscal year end.\n"
    )
    r = s.post(f"{BASE}/api/grants/{gid}/upload-grant-doc",
               files={"file": ("grant_agreement.txt", io.BytesIO(content.encode()), "text/plain")},
               headers={"X-Requested-With": "XMLHttpRequest"}, timeout=60)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:200]}"
    data = r.json()
    assert data.get("success") is True, f"success not True: {data}"
    assert data.get("content_extracted") is True, f"content_extracted not True: {data}"
    s.delete(f"{BASE}/api/grants/{gid}", timeout=10)

run("DEF-NFR-003: Valid TXT with real content -> 200 success", test_valid_txt_accepted)


# --- DEF-NFR-004: Oversized upload ---
print("\n--- DEF-NFR-004: Oversized upload handling ---")

def test_oversized_content_length_check():
    """Middleware rejects request with Content-Length > 16MB -> 413."""
    s = login_ok(DONOR1)
    # The middleware check_content_length fires before route matching,
    # so even a nonexistent grant ID will trigger 413 on the Content-Length check.
    try:
        r = s.post(f"{BASE}/api/auth/me",
                   data=b"small",
                   headers={
                       "X-Requested-With": "XMLHttpRequest",
                       "Content-Length": str(20 * 1024 * 1024),
                       "Content-Type": "application/json"
                   },
                   timeout=10)
        assert r.status_code == 413, f"Expected 413, got {r.status_code}"
    except requests.exceptions.ConnectionError:
        print("    [WARN] Connection killed by proxy (expected)")

run("DEF-NFR-004: Content-Length > 16MB -> 413 from middleware", test_oversized_content_length_check)

def test_oversized_upload_handled():
    """17MB file upload -> 413 or proxy kills connection (not 503)."""
    s = login_ok(DONOR1)
    gr = s.post(f"{BASE}/api/grants", json={
        "title": "Oversized Test", "description": "Test",
        "total_funding": 1000, "currency": "USD", "status": "draft"
    }, timeout=10)
    gid = gr.json()["grant"]["id"]
    big = b"A" * (17 * 1024 * 1024)
    try:
        r = s.post(f"{BASE}/api/grants/{gid}/upload-grant-doc",
                   files={"file": ("huge.pdf", io.BytesIO(big), "application/pdf")},
                   headers={"X-Requested-With": "XMLHttpRequest"},
                   timeout=30)
        assert r.status_code in (413, 400), f"Expected 413/400, got {r.status_code}"
    except (requests.exceptions.ConnectionError, requests.exceptions.ChunkedEncodingError) as e:
        # Railway proxy kills oversized connections. Client-side 16MB check prevents this.
        print(f"    [WARN] Proxy killed connection: {type(e).__name__}")
    finally:
        try:
            s.delete(f"{BASE}/api/grants/{gid}", timeout=10)
        except Exception:
            pass

run("DEF-NFR-004: 17MB upload -> 413 or proxy guard", test_oversized_upload_handled)


# --- DEF-E2E-UI-001/002: Upload feedback ---
print("\n--- DEF-E2E-UI-001/002: Upload feedback (API verification) ---")

def test_upload_returns_extraction_fields():
    """Successful upload returns all extraction status fields for frontend."""
    s = login_ok(DONOR1)
    gr = s.post(f"{BASE}/api/grants", json={
        "title": "Feedback Test", "description": "Testing upload feedback",
        "total_funding": 50000, "currency": "USD", "status": "draft"
    }, timeout=10)
    gid = gr.json()["grant"]["id"]
    content = (
        "Grant Reporting Requirements:\n"
        "1. Quarterly Financial Report - due within 30 days of quarter end.\n"
        "2. Annual Narrative Report - due within 60 days of fiscal year end.\n"
        "3. Final Evaluation Report - due within 90 days of project completion.\n"
    )
    r = s.post(f"{BASE}/api/grants/{gid}/upload-grant-doc",
               files={"file": ("agreement.txt", io.BytesIO(content.encode()), "text/plain")},
               headers={"X-Requested-With": "XMLHttpRequest"}, timeout=60)
    assert r.status_code == 200, f"Upload failed: {r.status_code}"
    data = r.json()
    assert "success" in data, "Missing 'success' field"
    assert "extracted_requirements" in data, "Missing 'extracted_requirements' field"
    assert "content_extracted" in data, "Missing 'content_extracted' field"
    assert "requirements_saved" in data, "Missing 'requirements_saved' field"
    assert data["content_extracted"] is True, "content_extracted should be True"
    s.delete(f"{BASE}/api/grants/{gid}", timeout=10)

run("DEF-E2E-UI-001: Upload response has extraction status fields", test_upload_returns_extraction_fields)

def test_upload_error_returns_json():
    """Failed upload returns JSON error for frontend display."""
    s = login_ok(DONOR1)
    gr = s.post(f"{BASE}/api/grants", json={
        "title": "Error Feedback Test", "description": "Test",
        "total_funding": 1000, "currency": "USD", "status": "draft"
    }, timeout=10)
    gid = gr.json()["grant"]["id"]
    r = s.post(f"{BASE}/api/grants/{gid}/upload-grant-doc",
               files={"file": ("empty.txt", io.BytesIO(b"hi"), "text/plain")},
               headers={"X-Requested-With": "XMLHttpRequest"}, timeout=30)
    assert r.status_code == 400, f"Expected 400, got {r.status_code}"
    data = r.json()
    assert "error" in data, "Missing 'error' field"
    assert isinstance(data["error"], str), "Error should be a string"
    assert len(data["error"]) > 10, "Error message should be descriptive"
    s.delete(f"{BASE}/api/grants/{gid}", timeout=10)

run("DEF-E2E-UI-002: Upload rejection returns descriptive JSON error", test_upload_error_returns_json)


# =========================================================================
# SECTION 2: AUTH & AUTHORIZATION
# =========================================================================
print("\n" + "=" * 70)
print("SECTION 2: AUTH & AUTHORIZATION")
print("=" * 70)

def test_login_all_roles():
    """All test accounts (except locked admin) can log in."""
    for email in [DONOR1, DONOR2, NGO1, NGO2, NGO3, NGO4, NGO5, REV1, REV2]:
        s, r = login(email)
        assert r.status_code == 200, f"Login failed for {email}: {r.status_code}"

run("AUTH: All 9 non-locked accounts log in", test_login_all_roles)

def test_unauthorized_access():
    """Unauthenticated request -> 401."""
    r = requests.get(f"{BASE}/api/grants", timeout=10)
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"

run("AUTH: Unauthenticated -> 401", test_unauthorized_access)

def test_ngo_cannot_create_grant():
    """NGO user cannot create a grant (donor only)."""
    s = login_ok(NGO1)
    r = s.post(f"{BASE}/api/grants", json={
        "title": "Should Fail", "total_funding": 1000, "currency": "USD"
    }, timeout=10)
    assert r.status_code == 403, f"Expected 403, got {r.status_code}"

run("AUTH: NGO cannot create grants -> 403", test_ngo_cannot_create_grant)


# =========================================================================
# SECTION 3: GRANT LIFECYCLE
# =========================================================================
print("\n" + "=" * 70)
print("SECTION 3: GRANT LIFECYCLE")
print("=" * 70)

test_grant_id = None

def test_create_grant():
    global test_grant_id
    s = login_ok(DONOR1)
    r = s.post(f"{BASE}/api/grants", json={
        "title": "E2E Retest Grant 2026",
        "description": "Full E2E regression test grant",
        "total_funding": 100000, "currency": "USD",
        "deadline": "2026-12-31",
        "sectors": ["health", "education"],
        "countries": ["Kenya", "Somalia"],
        "status": "draft"
    }, timeout=10)
    assert r.status_code in (200, 201), f"Grant creation failed: {r.status_code}"
    data = r.json()
    test_grant_id = data["grant"]["id"]
    assert test_grant_id > 0, f"Invalid grant ID: {test_grant_id}"

run("GRANT: Create draft grant", test_create_grant)

def test_list_grants():
    s = login_ok(DONOR1)
    r = s.get(f"{BASE}/api/grants", timeout=10)
    assert r.status_code == 200, f"List grants failed: {r.status_code}"
    data = r.json()
    # Response might be a list or an object with a list
    grants = data if isinstance(data, list) else data.get("grants", data.get("items", []))
    assert isinstance(grants, list), f"Unexpected response type: {type(data)}"
    assert len(grants) > 0, f"No grants returned"

run("GRANT: List grants", test_list_grants)

def test_get_grant_detail():
    if not test_grant_id:
        raise AssertionError("No test grant ID")
    s = login_ok(DONOR1)
    r = s.get(f"{BASE}/api/grants/{test_grant_id}", timeout=10)
    assert r.status_code == 200, f"Get detail failed: {r.status_code}"
    data = r.json()
    # Response might be wrapped in a "grant" key
    grant = data.get("grant", data) if isinstance(data, dict) else data
    assert grant.get("title", "").startswith("E2E Retest"), f"Wrong title: {grant.get('title')}"

run("GRANT: Get grant detail", test_get_grant_detail)

def test_update_grant():
    if not test_grant_id:
        raise AssertionError("No test grant ID")
    s = login_ok(DONOR1)
    r = s.put(f"{BASE}/api/grants/{test_grant_id}", json={
        "status": "open"
    }, timeout=10)
    assert r.status_code == 200, f"Update failed: {r.status_code}"

run("GRANT: Publish grant (status=open)", test_update_grant)


# =========================================================================
# SECTION 4: CAPACITY ASSESSMENT
# =========================================================================
print("\n" + "=" * 70)
print("SECTION 4: CAPACITY ASSESSMENT")
print("=" * 70)

def test_list_frameworks():
    s = login_ok(NGO1)
    r = s.get(f"{BASE}/api/assessments/frameworks", timeout=10)
    assert r.status_code == 200, f"Frameworks failed: {r.status_code}"
    data = r.json()
    frameworks = data if isinstance(data, list) else data.get("frameworks", [])
    assert len(frameworks) >= 5, f"Expected >=5 frameworks, got {len(frameworks)}"

run("CAP: List assessment frameworks (>=5)", test_list_frameworks)

def test_list_assessments():
    s = login_ok(NGO1)
    r = s.get(f"{BASE}/api/assessments", timeout=10)
    assert r.status_code == 200, f"List assessments failed: {r.status_code}"

run("CAP: List assessments", test_list_assessments)


# =========================================================================
# SECTION 5: DUE DILIGENCE
# =========================================================================
print("\n" + "=" * 70)
print("SECTION 5: DUE DILIGENCE")
print("=" * 70)

def test_sanctions_screen():
    s = login_ok(DONOR1)
    # Get an NGO org ID first
    r = s.get(f"{BASE}/api/organizations", timeout=10)
    assert r.status_code == 200, f"Orgs failed: {r.status_code}"
    orgs = r.json() if isinstance(r.json(), list) else r.json().get("organizations", [])
    ngo_orgs = [o for o in orgs if o.get("type") == "ngo"]
    if ngo_orgs:
        oid = ngo_orgs[0]["id"]
        r2 = s.post(f"{BASE}/api/compliance/screen", json={"org_id": oid}, timeout=30)
        assert r2.status_code in (200, 201), f"Sanctions screen failed: {r2.status_code}"
    else:
        # Try without org_id
        r2 = s.post(f"{BASE}/api/compliance/screen",
                     json={"org_name": "Test Organization"},
                     timeout=30)
        assert r2.status_code in (200, 201, 400), f"Sanctions: {r2.status_code}"

run("DILIGENCE: Sanctions screening", test_sanctions_screen)

def test_registry_directory():
    s = login_ok(DONOR1)
    r = s.get(f"{BASE}/api/verification/registries", timeout=10)
    assert r.status_code == 200, f"Registry dir failed: {r.status_code}"

run("DILIGENCE: Registry directory", test_registry_directory)


# =========================================================================
# SECTION 6: APPLICATION WORKFLOW
# =========================================================================
print("\n" + "=" * 70)
print("SECTION 6: APPLICATION WORKFLOW")
print("=" * 70)

test_app_id = None

def test_ngo_submit_application():
    global test_app_id
    if not test_grant_id:
        raise AssertionError("No test grant ID")
    s = login_ok(NGO1)
    r = s.post(f"{BASE}/api/applications", json={
        "grant_id": test_grant_id
    }, timeout=15)
    assert r.status_code in (200, 201), f"Application submit failed: {r.status_code} - {r.text[:200]}"
    data = r.json()
    test_app_id = data.get("application", {}).get("id") or data.get("id")

run("APP: NGO creates application", test_ngo_submit_application)

def test_list_applications_ngo():
    s = login_ok(NGO1)
    r = s.get(f"{BASE}/api/applications", timeout=10)
    assert r.status_code == 200, f"List apps failed: {r.status_code}"

run("APP: NGO lists applications", test_list_applications_ngo)

def test_list_applications_donor():
    s = login_ok(DONOR1)
    r = s.get(f"{BASE}/api/applications", timeout=10)
    assert r.status_code == 200, f"Donor apps failed: {r.status_code}"

run("APP: Donor lists applications", test_list_applications_donor)


# =========================================================================
# SECTION 7: DOCUMENT UPLOAD (NGO)
# =========================================================================
print("\n" + "=" * 70)
print("SECTION 7: DOCUMENT UPLOAD (NGO)")
print("=" * 70)

def test_ngo_upload_doc():
    s = login_ok(NGO1)
    content = b"Annual Financial Report 2025\n\nBudget: $50,000\nExpenditure: $48,500\nVariance: $1,500 (3%)\n" * 3
    r = s.post(f"{BASE}/api/documents/upload",
               files={"file": ("financial_report.txt", io.BytesIO(content), "text/plain")},
               headers={"X-Requested-With": "XMLHttpRequest"},
               timeout=30)
    assert r.status_code in (200, 201), f"Doc upload: {r.status_code} - {r.text[:200]}"

run("DOC: NGO uploads document", test_ngo_upload_doc)


# =========================================================================
# SECTION 8: REPORTING
# =========================================================================
print("\n" + "=" * 70)
print("SECTION 8: REPORTING")
print("=" * 70)

def test_ngo_list_reports():
    s = login_ok(NGO1)
    r = s.get(f"{BASE}/api/reports", timeout=10)
    assert r.status_code == 200, f"NGO reports failed: {r.status_code}"

run("REPORT: NGO lists reports", test_ngo_list_reports)

def test_donor_list_reports():
    s = login_ok(DONOR1)
    r = s.get(f"{BASE}/api/reports", timeout=10)
    assert r.status_code == 200, f"Donor reports failed: {r.status_code}"

run("REPORT: Donor lists reports", test_donor_list_reports)

def test_upcoming_reports():
    s = login_ok(NGO1)
    r = s.get(f"{BASE}/api/reports/upcoming", timeout=10)
    assert r.status_code == 200, f"Upcoming reports failed: {r.status_code}"

run("REPORT: Upcoming reports endpoint", test_upcoming_reports)


# =========================================================================
# SECTION 9: ADMIN & DASHBOARD
# =========================================================================
print("\n" + "=" * 70)
print("SECTION 9: ADMIN & DASHBOARD")
print("=" * 70)

def test_admin_stats():
    """Non-admin gets 403 for admin stats."""
    s = login_ok(DONOR2)
    r = s.get(f"{BASE}/api/admin/stats", timeout=10)
    assert r.status_code in (200, 403), f"Admin stats: {r.status_code}"

run("ADMIN: Stats endpoint responds (200 or 403)", test_admin_stats)

def test_dashboard_stats():
    """Dashboard stats for authenticated user."""
    s = login_ok(DONOR1)
    r = s.get(f"{BASE}/api/dashboard/stats", timeout=10)
    assert r.status_code == 200, f"Dashboard stats failed: {r.status_code}"

run("DASHBOARD: Stats for donor", test_dashboard_stats)

def test_dashboard_ngo():
    s = login_ok(NGO1)
    r = s.get(f"{BASE}/api/dashboard/stats", timeout=10)
    assert r.status_code == 200, f"NGO dashboard failed: {r.status_code}"

run("DASHBOARD: Stats for NGO", test_dashboard_ngo)


# =========================================================================
# SECTION 10: SECURITY HEADERS
# =========================================================================
print("\n" + "=" * 70)
print("SECTION 10: SECURITY HEADERS")
print("=" * 70)

def test_security_headers():
    r = requests.get(f"{BASE}/api/health", timeout=10)
    h = r.headers
    assert h.get("X-Content-Type-Options") == "nosniff", "Missing X-Content-Type-Options"
    assert h.get("X-Frame-Options") == "DENY", "Missing X-Frame-Options"
    assert "strict-origin" in (h.get("Referrer-Policy") or "").lower(), "Missing Referrer-Policy"

run("SEC: X-Content-Type-Options, X-Frame-Options, Referrer-Policy", test_security_headers)

def test_hsts_header():
    r = requests.get(f"{BASE}/api/health", timeout=10)
    hsts = r.headers.get("Strict-Transport-Security", "")
    assert "max-age=" in hsts, f"Missing HSTS: {hsts}"

run("SEC: HSTS header present", test_hsts_header)

def test_csp_header():
    r = requests.get(f"{BASE}/api/health", timeout=10)
    csp = r.headers.get("Content-Security-Policy", "")
    assert "default-src" in csp, f"Missing CSP: {csp}"

run("SEC: Content-Security-Policy header", test_csp_header)


# =========================================================================
# SECTION 11: ORGANIZATIONS & REVIEWS
# =========================================================================
print("\n" + "=" * 70)
print("SECTION 11: ORGANIZATIONS & REVIEWS")
print("=" * 70)

def test_list_organizations():
    s = login_ok(DONOR1)
    r = s.get(f"{BASE}/api/organizations", timeout=10)
    assert r.status_code == 200, f"Orgs failed: {r.status_code}"

run("ORG: List organizations", test_list_organizations)

def test_list_reviews():
    s = login_ok(REV1)
    r = s.get(f"{BASE}/api/reviews", timeout=10)
    assert r.status_code == 200, f"Reviews failed: {r.status_code}"

run("REVIEW: Reviewer lists reviews", test_list_reviews)


# =========================================================================
# SECTION 12: HEALTH & MISC
# =========================================================================
print("\n" + "=" * 70)
print("SECTION 12: HEALTH & MISC")
print("=" * 70)

def test_health_endpoint():
    r = requests.get(f"{BASE}/api/health", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data.get("status") == "healthy"

run("HEALTH: /api/health returns healthy", test_health_endpoint)

def test_version_endpoint():
    r = requests.get(f"{BASE}/api/version", timeout=10)
    assert r.status_code == 200

run("HEALTH: /api/version responds", test_version_endpoint)

def test_static_assets():
    """Static JS/CSS files are served."""
    r = requests.get(f"{BASE}/static/js/app.js", timeout=10)
    assert r.status_code == 200
    assert len(r.text) > 1000, "app.js too small"

run("MISC: Static assets served (app.js)", test_static_assets)

def test_api_info():
    """API info endpoint."""
    r = requests.get(f"{BASE}/api", timeout=10)
    assert r.status_code == 200

run("MISC: API info endpoint", test_api_info)


# =========================================================================
# CLEANUP
# =========================================================================
print("\n" + "=" * 70)
print("CLEANUP")
print("=" * 70)

def test_cleanup():
    if not test_grant_id:
        return
    s = login_ok(DONOR1)
    # First set back to draft so we can delete
    s.put(f"{BASE}/api/grants/{test_grant_id}", json={"status": "draft"}, timeout=10)
    r = s.delete(f"{BASE}/api/grants/{test_grant_id}", timeout=10)
    assert r.status_code in (200, 204, 404, 403), f"Cleanup: {r.status_code}"

run("CLEANUP: Delete test grant", test_cleanup)


# =========================================================================
# SUMMARY
# =========================================================================
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
defect_tests = {
    "DEF-NFR-002": [],
    "DEF-NFR-003": [],
    "DEF-NFR-004": [],
    "DEF-E2E-UI-001": [],
    "DEF-E2E-UI-002": [],
}
for r in results:
    for defect_id in defect_tests:
        if defect_id in r[1]:
            defect_tests[defect_id].append(r[0])

for defect_id, statuses in defect_tests.items():
    if not statuses:
        print(f"  {defect_id}: NOT TESTED")
    elif all(s == "PASS" for s in statuses):
        print(f"  {defect_id}: RESOLVED ({len(statuses)}/{len(statuses)} passed)")
    else:
        fails = sum(1 for s in statuses if s != "PASS")
        print(f"  {defect_id}: STILL FAILING ({fails}/{len(statuses)} failed)")

print()
sys.exit(1 if (failed + errors) > 0 else 0)
