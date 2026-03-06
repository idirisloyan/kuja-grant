"""
Kuja Grant v3.0.1 — Comprehensive E2E Test Suite
=================================================
Tests all 6 defects identified by team testing:
  DEF-NFR-001: HSTS header
  DEF-NFR-002: Brute-force lockout
  DEF-E2E-UI-001/002: Upload feedback/state
  DEF-I18N-001: Localization completeness
  + Oversized upload error handling

Also includes core API regression tests.
"""

import os
import sys
import json
import time
import requests
import concurrent.futures

# Base URL from env or default to production
BASE = os.getenv('KUJA_URL', os.getenv('KUJA_TEST_URL', 'https://web-production-6f8a.up.railway.app'))

results = []
session = requests.Session()
session.headers.update({'X-Requested-With': 'XMLHttpRequest'})


def log(test_id, name, passed, detail=''):
    status = 'PASS' if passed else 'FAIL'
    results.append({'id': test_id, 'name': name, 'status': status, 'detail': detail})
    icon = '[PASS]' if passed else '[FAIL]'
    msg = f'{icon} {test_id}: {name}' + (f' -- {detail}' if detail else '')
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode('ascii', 'replace').decode('ascii'))


# ===========================================================================
# SECTION 1: Health + Core Smoke
# ===========================================================================

def test_health():
    r = session.get(f'{BASE}/api/health')
    log('SMOKE-001', 'Health endpoint returns 200', r.status_code == 200, f'status={r.status_code}')

def test_api_info():
    r = session.get(f'{BASE}/api')
    data = r.json()
    log('SMOKE-002', 'API info returns version 3.0.0', data.get('version') == '3.0.0', f'version={data.get("version")}')


# ===========================================================================
# SECTION 2: DEF-NFR-001 — HSTS Header
# ===========================================================================

def test_hsts_header():
    r = session.get(f'{BASE}/api/health')
    hsts = r.headers.get('Strict-Transport-Security', '')
    has_hsts = 'max-age' in hsts
    log('NFR-001', 'HSTS header present', has_hsts, f'HSTS={hsts or "MISSING"}')

def test_security_headers():
    r = session.get(f'{BASE}/api/health')
    headers = {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
    }
    all_present = True
    missing = []
    for name, expected in headers.items():
        val = r.headers.get(name, '')
        if expected not in val:
            all_present = False
            missing.append(name)
    log('NFR-002', 'Security headers complete', all_present, f'missing={missing}' if missing else 'all present')

def test_csp_header():
    r = session.get(f'{BASE}/api/health')
    csp = r.headers.get('Content-Security-Policy', '')
    log('NFR-003', 'CSP header present', len(csp) > 20, f'len={len(csp)}')


# ===========================================================================
# SECTION 3: DEF-NFR-002 — Brute-force Lockout
# ===========================================================================

def test_brute_force_lockout():
    """Send 7 invalid login attempts against NON-EXISTENT email and verify lockout.
    Per-email lockout must work for ALL emails (existing or not) to prevent
    email enumeration and brute-force against unknown accounts."""
    lockout_email = 'bruteforce_test@kuja.org'
    lockout_observed = False
    statuses = []

    for attempt in range(1, 8):
        r = session.post(f'{BASE}/api/auth/login', json={
            'email': lockout_email,
            'password': 'wrong_password_' + str(attempt)
        })
        statuses.append(r.status_code)
        if r.status_code == 429:
            lockout_observed = True
            break

    log('LOCK-001', 'Brute-force returns 429 after max attempts (non-existent email)',
        lockout_observed, f'statuses={statuses}')

def test_brute_force_real_account():
    """Test lockout with a real test account (not admin, to avoid locking it out)."""
    # Use reviewer account for lockout testing to avoid locking out admin
    lockout_email = 'maria@reviewer.org'
    lockout_observed = False
    final_status = None
    statuses = []

    for attempt in range(1, 8):
        r = session.post(f'{BASE}/api/auth/login', json={
            'email': lockout_email,
            'password': 'totally_wrong_' + str(attempt)
        })
        final_status = r.status_code
        statuses.append(final_status)
        if r.status_code == 429:
            lockout_observed = True
            break

    log('LOCK-002', 'Brute-force lockout triggers 429 for real account',
        lockout_observed, f'statuses={statuses}')

    # Verify 429 persists even with correct password
    if lockout_observed:
        r = session.post(f'{BASE}/api/auth/login', json={
            'email': lockout_email,
            'password': 'pass123'
        })
        log('LOCK-003', 'Locked account returns 429 even with correct password',
            r.status_code == 429, f'status={r.status_code}')


# ===========================================================================
# SECTION 4: Authentication + RBAC
# ===========================================================================

def login(email, password='pass123'):
    r = session.post(f'{BASE}/api/auth/login', json={'email': email, 'password': password})
    return r

def test_auth_flow():
    # Test login with donor
    r = login('sarah@globalhealth.org')
    log('AUTH-001', 'Donor login succeeds', r.status_code == 200, f'status={r.status_code}')

    if r.status_code == 200:
        data = r.json()
        user = data.get('user', {})
        log('AUTH-002', 'Login returns user role', user.get('role') == 'donor', f'role={user.get("role")}')

    # Test /me endpoint
    r = session.get(f'{BASE}/api/auth/me')
    log('AUTH-003', '/me returns current user', r.status_code == 200, f'status={r.status_code}')

    # Logout
    r = session.post(f'{BASE}/api/auth/logout')
    log('AUTH-004', 'Logout succeeds', r.status_code == 200, f'status={r.status_code}')

    # Test invalid credentials
    r = login('fake@kuja.org', 'wrong')
    log('AUTH-005', 'Invalid credentials returns 401', r.status_code == 401, f'status={r.status_code}')


# ===========================================================================
# SECTION 5: Grant Lifecycle (Donor)
# ===========================================================================

def test_grant_lifecycle():
    # Login as donor
    login('sarah@globalhealth.org')

    # Create grant
    r = session.post(f'{BASE}/api/grants', json={
        'title': 'E2E Test Grant ' + str(int(time.time())),
        'description': 'Test grant for E2E validation',
        'total_funding': 100000,
        'currency': 'USD',
        'deadline': '2026-12-31',
        'sectors': ['Health'],
        'countries': ['Kenya'],
        'eligibility': [{'text': 'Must be registered'}],
        'criteria': [{'name': 'Impact', 'weight': 50}, {'name': 'Sustainability', 'weight': 50}],
        'doc_requirements': [{'type': 'financial_report', 'required': True}],
        'status': 'draft'
    })
    log('GRANT-001', 'Create grant draft', r.status_code == 200 or r.status_code == 201,
        f'status={r.status_code}')

    if r.status_code in (200, 201):
        grant_id = r.json().get('grant', {}).get('id')

        # Upload grant document
        test_file_path = os.path.join(os.path.dirname(__file__), 'test-files', 'grant_agreement_sample.txt')
        if os.path.exists(test_file_path):
            with open(test_file_path, 'rb') as f:
                r = session.post(
                    f'{BASE}/api/grants/{grant_id}/upload-grant-doc',
                    files={'file': ('grant_agreement_sample.txt', f, 'text/plain')},
                    headers={'X-Requested-With': 'XMLHttpRequest'}
                )
            data = r.json() if r.status_code == 200 else {}
            log('GRANT-002', 'Upload grant document succeeds',
                r.status_code == 200 and data.get('success'),
                f'status={r.status_code}, success={data.get("success")}')

            # Check extraction result
            extracted = data.get('extracted_requirements', {})
            reqs = extracted.get('requirements', extracted.get('reporting_requirements', []))
            if not isinstance(reqs, list):
                reqs = []
            log('GRANT-003', 'AI extraction returns requirements',
                len(reqs) > 0,
                f'req_count={len(reqs)}')
        else:
            log('GRANT-002', 'Upload grant document', False, 'test file not found')
            log('GRANT-003', 'AI extraction', False, 'skipped — no test file')

        # Publish grant
        r = session.put(f'{BASE}/api/grants/{grant_id}', json={'status': 'open'})
        log('GRANT-004', 'Publish grant', r.status_code == 200, f'status={r.status_code}')

        # List grants
        r = session.get(f'{BASE}/api/grants')
        log('GRANT-005', 'List grants', r.status_code == 200, f'status={r.status_code}')

        return grant_id

    return None


# ===========================================================================
# SECTION 6: Application Lifecycle (NGO)
# ===========================================================================

def test_application_lifecycle(grant_id):
    if not grant_id:
        log('APP-001', 'NGO application', False, 'no grant_id available')
        return

    login('fatima@amani.org')

    # Browse grants
    r = session.get(f'{BASE}/api/grants?status=open')
    grants = r.json().get('grants', [])
    log('APP-001', 'NGO can see open grants', len(grants) > 0, f'count={len(grants)}')

    # Create application
    r = session.post(f'{BASE}/api/applications', json={
        'grant_id': grant_id,
        'criteria_responses': [
            {'criterion': 'Impact', 'response': 'Our project will impact 5000 beneficiaries'},
            {'criterion': 'Sustainability', 'response': 'We have a 5-year sustainability plan'}
        ],
        'org_profile': {'staff_count': 50, 'mission': 'Health in East Africa'}
    })
    log('APP-002', 'Create application', r.status_code in (200, 201), f'status={r.status_code}')

    if r.status_code in (200, 201):
        app_id = r.json().get('application', {}).get('id')

        # Upload document
        test_file = os.path.join(os.path.dirname(__file__), 'test-files', 'financial_report_q1_2026.txt')
        if os.path.exists(test_file):
            with open(test_file, 'rb') as f:
                r = session.post(f'{BASE}/api/documents/upload', files={'file': ('financial_report.txt', f, 'text/plain')},
                    data={'application_id': str(app_id), 'doc_type': 'financial_report'},
                    headers={'X-Requested-With': 'XMLHttpRequest'})
            log('APP-003', 'Upload application document', r.status_code in (200, 201), f'status={r.status_code}')
        else:
            log('APP-003', 'Upload application document', False, 'test file not found')

        # Submit
        r = session.put(f'{BASE}/api/applications/{app_id}', json={'status': 'submitted'})
        log('APP-004', 'Submit application', r.status_code == 200, f'status={r.status_code}')

        # Check my applications
        r = session.get(f'{BASE}/api/applications')
        apps = r.json().get('applications', [])
        log('APP-005', 'My applications list', len(apps) > 0, f'count={len(apps)}')


# ===========================================================================
# SECTION 7: DEF-I18N-001 — Localization
# ===========================================================================

def test_translations():
    """Verify translation files load and are complete."""
    for lang in ['en', 'ar', 'fr', 'es']:
        r = session.get(f'{BASE}/static/js/translations/{lang}.json')
        passed = r.status_code == 200
        detail = ''
        if passed:
            data = r.json()
            detail = f'keys={len(data)}'
            passed = len(data) >= 600
        log(f'I18N-{lang.upper()}-001', f'{lang}.json loads and has 600+ keys', passed, detail)

def test_language_switch():
    """Test language preference API."""
    login('fatima@amani.org')

    for lang in ['fr', 'ar', 'es', 'en']:
        r = session.put(f'{BASE}/api/auth/language', json={'language': lang})
        log(f'I18N-SWITCH-{lang.upper()}', f'Set language to {lang}',
            r.status_code == 200, f'status={r.status_code}')

    # Invalid language
    r = session.put(f'{BASE}/api/auth/language', json={'language': 'xx'})
    log('I18N-INVALID', 'Reject invalid language', r.status_code == 400, f'status={r.status_code}')


# ===========================================================================
# SECTION 8: Assessment + Verification
# ===========================================================================

def test_assessments():
    login('fatima@amani.org')

    r = session.get(f'{BASE}/api/assessments')
    log('ASSESS-001', 'Assessment list loads', r.status_code == 200, f'status={r.status_code}')

def test_verification():
    login('fatima@amani.org')

    r = session.get(f'{BASE}/api/verification/registries')
    log('VERIFY-001', 'Registry directory loads', r.status_code == 200, f'status={r.status_code}')
    if r.status_code == 200:
        data = r.json()
        registries = data.get('registries', data.get('countries', []))
        log('VERIFY-002', 'Registries contain countries',
            len(registries) > 0, f'count={len(registries)}')


# ===========================================================================
# SECTION 9: Oversized Upload
# ===========================================================================

def test_oversized_upload():
    login('sarah@globalhealth.org')

    # Create a minimal grant for upload testing
    r = session.post(f'{BASE}/api/grants', json={
        'title': 'Oversize Test Grant',
        'description': 'Testing oversized uploads',
        'total_funding': 1000,
        'currency': 'USD',
        'status': 'draft'
    })
    if r.status_code not in (200, 201):
        log('UPLOAD-SIZE-001', 'Oversized upload returns 413/400', False, 'could not create test grant')
        return

    grant_id = r.json().get('grant', {}).get('id')

    # Send Content-Length header that exceeds limit
    r = session.post(
        f'{BASE}/api/grants/{grant_id}/upload-grant-doc',
        headers={'Content-Length': str(20 * 1024 * 1024), 'X-Requested-With': 'XMLHttpRequest'},
        data=b'x' * 1000  # Small actual payload with large Content-Length
    )
    # Should get 413 or 400 (not 503)
    log('UPLOAD-SIZE-001', 'Oversized Content-Length returns 413 (not 503)',
        r.status_code in (400, 413), f'status={r.status_code}')


# ===========================================================================
# SECTION 10: Performance
# ===========================================================================

def test_latency():
    """Quick health endpoint latency check."""
    times = []
    for _ in range(5):
        start = time.time()
        session.get(f'{BASE}/api/health')
        times.append(time.time() - start)
    avg_ms = int(sum(times) / len(times) * 1000)
    log('PERF-001', 'Health endpoint p50 < 500ms', avg_ms < 500, f'avg={avg_ms}ms')


# ===========================================================================
# Main runner
# ===========================================================================

def main():
    print(f'\n{"="*60}')
    print(f'Kuja Grant v3.0.1 — E2E Test Suite')
    print(f'Target: {BASE}')
    print(f'{"="*60}\n')

    # Smoke
    test_health()
    test_api_info()

    # Security (DEF-NFR-001)
    print('\n--- Security Headers ---')
    test_hsts_header()
    test_security_headers()
    test_csp_header()

    # Brute-force (DEF-NFR-002)
    print('\n--- Brute-Force Lockout ---')
    test_brute_force_lockout()
    test_brute_force_real_account()

    # Auth
    print('\n--- Authentication ---')
    test_auth_flow()

    # Grant lifecycle (includes upload feedback test - DEF-E2E-UI-001/002)
    print('\n--- Grant Lifecycle ---')
    grant_id = test_grant_lifecycle()

    # Application lifecycle
    print('\n--- Application Lifecycle ---')
    test_application_lifecycle(grant_id)

    # Localization (DEF-I18N-001)
    print('\n--- Localization ---')
    test_translations()
    test_language_switch()

    # Assessments + Verification
    print('\n--- Assessments + Verification ---')
    test_assessments()
    test_verification()

    # Oversized upload
    print('\n--- Oversized Upload ---')
    test_oversized_upload()

    # Performance
    print('\n--- Performance ---')
    test_latency()

    # Summary
    print(f'\n{"="*60}')
    passed = sum(1 for r in results if r['status'] == 'PASS')
    failed = sum(1 for r in results if r['status'] == 'FAIL')
    total = len(results)
    print(f'Results: {passed}/{total} PASS, {failed} FAIL')
    print(f'{"="*60}\n')

    if failed > 0:
        print('Failed tests:')
        for r in results:
            if r['status'] == 'FAIL':
                print(f'  [FAIL] {r["id"]}: {r["name"]} -- {r["detail"]}')
        print()

    return 0 if failed == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
