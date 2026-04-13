#!/usr/bin/env python3
"""
Kuja Grant — Pre-Deploy Smoke Test
====================================
Runs before every `railway up` via Claude Code hook.
Starts Flask locally, tests critical paths, blocks deploy on failure.

Usage:  python smoke_test.py
Exit 0 = all pass, Exit 1 = failures detected.
"""

import io, json, os, signal, socket, subprocess, sys, threading, time

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
PASS_PASSWORD = "pass123"
USERS = {
    "donor":    "sarah@globalhealth.org",
    "ngo":      "fatima@amani.org",
    "reviewer": "james@reviewer.org",
    "admin":    "admin@kuja.org",
}
TRANSLATION_DIR = os.path.join(os.path.dirname(__file__), "static", "js", "translations")
REQUIRED_DASHBOARD_KEYS = [
    "dashboard.welcome", "dashboard.quick_actions", "dashboard.capacity_level",
    "dashboard.no_upcoming_reports", "dashboard.days_overdue", "dashboard.days_left",
    "dashboard.btn_continue", "dashboard.btn_start",
    "dashboard.stat.open_grants", "dashboard.stat.total_grants",
    "dashboard.action.browse_grants", "dashboard.action.create_grant",
]
REQUIRED_WIZARD_KEYS = [
    "grant.create.step1", "grant.create.step2", "grant.create.step3",
    "grant.create.step4", "grant.create.step5", "grant.create.step6",
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
results = []

def run(name, fn):
    try:
        fn()
        results.append(("PASS", name, ""))
        print(f"  [PASS] {name}")
    except AssertionError as e:
        msg = str(e).encode('ascii', 'replace').decode()
        results.append(("FAIL", name, msg))
        print(f"  [FAIL] {name} -- {msg}")
    except Exception as e:
        msg = f"{type(e).__name__}: {e}".encode('ascii', 'replace').decode()
        results.append(("ERROR", name, msg))
        print(f"  [ERR]  {name} -- {msg}")

def _retry_session():
    s = requests.Session()
    retries = Retry(total=2, backoff_factor=0.3, status_forcelist=[502, 503, 504])
    s.mount("http://", HTTPAdapter(max_retries=retries))
    return s

def _free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]

_sessions = {}

def login_ok(base, email):
    if email in _sessions:
        return _sessions[email]
    s = _retry_session()
    r = s.post(f"{base}/api/auth/login",
               json={"email": email, "password": PASS_PASSWORD},
               headers={"X-Requested-With": "XMLHttpRequest"},
               timeout=10)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code}"
    _sessions[email] = s
    return s

# ---------------------------------------------------------------------------
# Start local Flask server (in-process, threaded)
# ---------------------------------------------------------------------------
def start_server():
    port = _free_port()
    project_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(project_dir)
    # Import Flask app in-process to avoid subprocess issues
    sys.path.insert(0, project_dir)
    from app import create_app
    from app.extensions import db
    app = create_app()
    with app.app_context():
        db.create_all()
    # Run in a daemon thread so it dies when main exits
    t = threading.Thread(
        target=lambda: app.run(host="127.0.0.1", port=port, debug=False, use_reloader=False),
        daemon=True,
    )
    t.start()
    base = f"http://127.0.0.1:{port}"
    # Wait for server to be ready (max 15s)
    for _ in range(30):
        try:
            r = requests.get(f"{base}/api/health", timeout=1)
            if r.status_code == 200:
                return t, base
        except Exception:
            pass
        time.sleep(0.5)
    raise RuntimeError(f"Flask server did not start on port {port} within 15s")

def stop_server(proc):
    pass  # Daemon thread dies with main process


# ===========================================================================
# TESTS
# ===========================================================================

def make_tests(base):
    """Return a list of (name, test_fn) tuples."""

    tests = []

    # --- Health check ---
    def test_health():
        r = requests.get(f"{base}/api/health", timeout=5)
        assert r.status_code == 200, f"Health check returned {r.status_code}"
    tests.append(("Health check", test_health))

    # --- Login all roles ---
    for role, email in USERS.items():
        def _make(e=email, rl=role):
            def test():
                s = login_ok(base, e)
                r = s.get(f"{base}/api/auth/me",
                          headers={"X-Requested-With": "XMLHttpRequest"}, timeout=15)
                assert r.status_code == 200, f"{rl} /me returned {r.status_code}"
                assert r.json()["user"]["email"] == e
            return test
        tests.append((f"Login {role} ({email})", _make()))

    # --- AI Extraction (DEF-CORE-001) ---
    def test_ai_extraction():
        s = login_ok(base, USERS["donor"])
        # Create draft
        gr = s.post(f"{base}/api/grants/",
                    json={"title": "Smoke Test Grant", "description": "smoke",
                          "total_funding": 50000, "currency": "USD", "status": "draft"},
                    headers={"X-Requested-With": "XMLHttpRequest"}, timeout=15)
        assert gr.status_code in (200, 201), f"Grant create: {gr.status_code}"
        gid = gr.json()["grant"]["id"]
        try:
            content = (
                "Grant Agreement - Reporting Requirements\n\n"
                "1. Quarterly Financial Report due 30 days after quarter end.\n"
                "2. Semi-annual Narrative Report on activities and outcomes.\n"
                "3. Annual Impact Assessment with beneficiary data.\n"
                "4. Final Completion Report due 60 days after project end.\n\n"
                "Key Performance Indicators:\n"
                "- Beneficiaries reached (target: 5000)\n"
                "- Budget utilization rate (target: 90%)\n"
                "- Facilities supported (target: 15)\n"
            )
            r = s.post(f"{base}/api/grants/{gid}/upload-grant-doc",
                       files={"file": ("agreement.txt", io.BytesIO(content.encode()), "text/plain")},
                       headers={"X-Requested-With": "XMLHttpRequest"}, timeout=90)
            assert r.status_code == 200, f"Upload: {r.status_code} {r.text[:200]}"
            data = r.json()
            assert data.get("success"), "Upload not successful"
            ext = data.get("extracted_requirements", {})
            reqs = ext.get("requirements", [])
            secs = ext.get("template_sections", [])
            inds = ext.get("indicators", [])
            assert len(reqs) > 0, f"Requirements = {len(reqs)}, expected > 0"
            assert len(secs) > 0, f"Template sections = {len(secs)}, expected > 0"
            assert len(inds) > 0, f"Indicators = {len(inds)}, expected > 0"
        finally:
            s.delete(f"{base}/api/grants/{gid}",
                     headers={"X-Requested-With": "XMLHttpRequest"}, timeout=5)
    tests.append(("DEF-CORE-001: AI extraction returns non-zero reqs/indicators", test_ai_extraction))

    # --- Grant Publish (DEF-UX-001) ---
    def test_grant_publish():
        s = login_ok(base, USERS["donor"])
        gr = s.post(f"{base}/api/grants/",
                    json={"title": "Publish Smoke Test", "description": "smoke",
                          "total_funding": 10000, "currency": "USD",
                          "deadline": "2026-12-31", "status": "draft"},
                    headers={"X-Requested-With": "XMLHttpRequest"}, timeout=15)
        assert gr.status_code in (200, 201), f"Grant create: {gr.status_code}"
        gid = gr.json()["grant"]["id"]
        try:
            r = s.post(f"{base}/api/grants/{gid}/publish",
                       headers={"Content-Type": "application/json",
                                "X-Requested-With": "XMLHttpRequest"}, timeout=15)
            assert r.status_code == 200, f"Publish: {r.status_code} {r.text[:200]}"
            assert r.json().get("grant", {}).get("status") == "open", "Grant not open after publish"
        finally:
            s.delete(f"{base}/api/grants/{gid}",
                     headers={"X-Requested-With": "XMLHttpRequest"}, timeout=5)
    tests.append(("DEF-UX-001: Grant publish sets status to open", test_grant_publish))

    # --- Wizard full flow: create empty draft → PUT title → upload → publish ---
    def test_wizard_full_flow():
        """Simulate the exact Next.js wizard flow that was failing."""
        s = login_ok(base, USERS["donor"])
        # Step 0: Create empty draft (like Skip path or upload path)
        gr = s.post(f"{base}/api/grants/",
                    json={"title": "Draft Grant"},
                    headers={"X-Requested-With": "XMLHttpRequest"}, timeout=15)
        assert gr.status_code in (200, 201), f"Draft create: {gr.status_code}"
        gid = gr.json()["grant"]["id"]
        try:
            # Step 1: Upload doc for AI extraction
            content = (
                "Grant Agreement - Reporting Requirements\n"
                "1. Quarterly Financial Report due 30 days.\n"
                "2. Annual Impact Assessment.\n"
                "KPIs: Beneficiaries (5000), Budget utilization (90%)\n"
            )
            up = s.post(f"{base}/api/grants/{gid}/upload-grant-doc",
                        files={"file": ("agreement.txt", io.BytesIO(content.encode()), "text/plain")},
                        headers={"X-Requested-With": "XMLHttpRequest"}, timeout=90)
            assert up.status_code == 200, f"Upload: {up.status_code}"
            ext = up.json().get("extracted_requirements", {})
            assert len(ext.get("requirements", [])) > 0, "Extraction returned 0 reqs"

            # Step 2-4: autoSave with title + required fields (simulates wizard PUT)
            put = s.put(f"{base}/api/grants/{gid}",
                        json={"title": "Wizard Flow Test Grant",
                              "total_funding": 50000, "currency": "USD",
                              "deadline": "2026-12-31"},
                        headers={"Content-Type": "application/json",
                                 "X-Requested-With": "XMLHttpRequest"}, timeout=15)
            assert put.status_code == 200, f"PUT: {put.status_code}"

            # Verify title persisted (not overwritten by empty autoSave)
            get = s.get(f"{base}/api/grants/{gid}",
                        headers={"X-Requested-With": "XMLHttpRequest"}, timeout=10)
            assert get.status_code == 200
            assert get.json()["grant"]["title"] == "Wizard Flow Test Grant", \
                f"Title was overwritten: {get.json()['grant']['title']}"

            # Step 5: Publish
            pub = s.post(f"{base}/api/grants/{gid}/publish",
                         headers={"Content-Type": "application/json",
                                  "X-Requested-With": "XMLHttpRequest"}, timeout=15)
            assert pub.status_code == 200, f"Publish: {pub.status_code}"
            assert pub.json().get("grant", {}).get("status") == "open"
        finally:
            s.delete(f"{base}/api/grants/{gid}",
                     headers={"X-Requested-With": "XMLHttpRequest"}, timeout=5)
    tests.append(("DEF-UX-001: Full wizard flow (draft>upload>put>publish)", test_wizard_full_flow))

    # --- i18n: key count parity (DEF-I18N-001) ---
    def test_i18n_key_counts():
        en = json.load(open(os.path.join(TRANSLATION_DIR, "en.json"), encoding="utf-8"))
        en_count = len(en)
        for lang in ("es", "fr", "ar"):
            trans = json.load(open(os.path.join(TRANSLATION_DIR, f"{lang}.json"), encoding="utf-8"))
            missing = [k for k in en if k not in trans]
            assert len(trans) >= en_count, (
                f"{lang}.json has {len(trans)} keys, EN has {en_count}. "
                f"Missing: {missing[:5]}"
            )
    tests.append(("DEF-I18N-001: ES/FR/AR key counts match EN", test_i18n_key_counts))

    # --- i18n: dashboard keys in ES ---
    def test_es_dashboard_keys():
        es = json.load(open(os.path.join(TRANSLATION_DIR, "es.json"), encoding="utf-8"))
        missing = [k for k in REQUIRED_DASHBOARD_KEYS if k not in es]
        assert not missing, f"ES missing dashboard keys: {missing}"
    tests.append(("DEF-I18N-001: ES has all dashboard translation keys", test_es_dashboard_keys))

    # --- Wizard step6 key in all languages ---
    def test_wizard_step6():
        for lang in ("en", "es", "fr", "ar"):
            trans = json.load(open(os.path.join(TRANSLATION_DIR, f"{lang}.json"), encoding="utf-8"))
            for key in REQUIRED_WIZARD_KEYS:
                assert key in trans, f"{lang}.json missing {key}"
    tests.append(("DEF-UX-001: Wizard step1-6 keys in all languages", test_wizard_step6))

    # --- Assessment frameworks endpoint returns category_items ---
    def test_assessment_frameworks():
        s = login_ok(base, USERS["ngo"])
        r = s.get(f"{base}/api/assessments/frameworks",
                  headers={"X-Requested-With": "XMLHttpRequest"}, timeout=10)
        assert r.status_code == 200, f"Frameworks: {r.status_code}"
        fw = r.json().get("frameworks", {})
        assert "kuja" in fw, "Missing kuja framework"
        kuja = fw["kuja"]
        assert "category_items" in kuja, "Missing category_items in kuja framework"
        cat_items = kuja["category_items"]
        assert "governance" in cat_items, "Missing governance in category_items"
        items = cat_items["governance"]["items"]
        assert len(items) >= 3, f"Governance has only {len(items)} items"
        keys = [i["key"] for i in items]
        assert "board_exists" in keys, f"Missing board_exists key, got: {keys}"
    tests.append(("P0-1: Assessment frameworks return real item keys", test_assessment_frameworks))

    # --- Assessment create with real keys scores > 0 ---
    def test_assessment_scoring():
        s = login_ok(base, USERS["ngo"])
        # Use real Kuja framework keys with positive responses
        checklist = {
            "board_exists": True, "board_meets_regularly": True, "strategic_plan": True,
            "policies_documented": True, "conflict_of_interest_policy": False,
            "financial_policies": True, "annual_audit": True, "budget_process": True,
            "internal_controls": True, "financial_reporting": True, "procurement_policy": False,
            "needs_assessment": True, "project_planning": True, "beneficiary_feedback": True,
            "partnership_agreements": False, "reporting_systems": True,
            "hr_policies": True, "staff_contracts": True, "safeguarding_policy": True,
            "training_plan": False, "code_of_conduct": True,
            "me_framework": True, "data_collection": True, "indicator_tracking": True,
            "evaluation_reports": False, "learning_integration": True,
        }
        r = s.post(f"{base}/api/assessments/",
                   json={"framework": "kuja", "checklist_responses": checklist},
                   headers={"Content-Type": "application/json",
                            "X-Requested-With": "XMLHttpRequest"}, timeout=15)
        assert r.status_code == 201, f"Assessment create: {r.status_code}"
        data = r.json()
        assess = data.get("assessment", {})
        assert assess.get("overall_score", 0) > 0, f"Score is {assess.get('overall_score')} (expected > 0)"
        assert assess.get("status") == "completed", f"Status: {assess.get('status')}"
        gaps = assess.get("gaps", [])
        # We set 5 items to False, so should have exactly 5 gaps
        assert len(gaps) == 5, f"Expected 5 gaps, got {len(gaps)}"
    tests.append(("P0-1: Assessment with real keys scores > 0", test_assessment_scoring))

    # --- Swahili and Somali language switch ---
    def test_language_sw_so():
        for lang in ("sw", "so"):
            # Check translation file exists
            lang_file = os.path.join(TRANSLATION_DIR, f"{lang}.json")
            assert os.path.exists(lang_file), f"Missing {lang}.json translation file"
            trans = json.load(open(lang_file, encoding="utf-8"))
            assert len(trans) > 100, f"{lang}.json has only {len(trans)} keys (expected 600+)"
            # Test API accepts the language
            s = login_ok(base, USERS["ngo"])
            r = s.put(f"{base}/api/auth/language",
                      json={"language": lang},
                      headers={"Content-Type": "application/json",
                               "X-Requested-With": "XMLHttpRequest"}, timeout=10)
            assert r.status_code == 200, f"Language {lang}: {r.status_code} {r.text[:100]}"
        # Reset to English
        s.put(f"{base}/api/auth/language",
              json={"language": "en"},
              headers={"Content-Type": "application/json",
                       "X-Requested-With": "XMLHttpRequest"}, timeout=10)
    tests.append(("P0-3: Swahili and Somali language support", test_language_sw_so))

    return tests


# ===========================================================================
# Main
# ===========================================================================
def main():
    print("\n" + "=" * 60)
    print("  Kuja Grant — Pre-Deploy Smoke Test")
    print("=" * 60)

    print("\n[1/2] Starting local Flask server...")
    proc, base = start_server()
    print(f"  Server ready at {base}")

    try:
        print("\n[2/2] Running tests...\n")
        for name, fn in make_tests(base):
            run(name, fn)
    finally:
        stop_server(proc)

    # Summary
    passed = sum(1 for r in results if r[0] == "PASS")
    failed = sum(1 for r in results if r[0] != "PASS")
    total = len(results)

    print("\n" + "=" * 60)
    print(f"  Results: {passed}/{total} passed, {failed} failed")
    if failed:
        print("\n  FAILURES:")
        for status, name, detail in results:
            if status != "PASS":
                print(f"    [{status}] {name}: {detail}")
        print("\n  DEPLOY BLOCKED — fix failures before deploying.")
    else:
        print("  All smoke tests passed. Deploy is clear.")
    print("=" * 60 + "\n")

    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
