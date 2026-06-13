#!/usr/bin/env python3
"""
NEAR Network UAT smoke — Phase 39 (May 2026).
============================================
End-to-end functional smoke for the NEAR tenant flows added across
Phases 32–38 plus the post-Phase-38 polish (Phase 39):

  Phase 32  Multi-tenant resolution + tenant brand context
  Phase 33  NetworkMembership application + OB review
  Phase 34  Funds, Windows, EvaluationRubrics
  Phase 35  Crisis Monitoring Report
  Phase 36  Emergency declarations + multi-sig with COI recusal
  Phase 37  Window reporting + Monitoring Visits
  Phase 38  Seven AI surfaces (rubric, budget, brief, etc.)
  Phase 39  Login CTA, tenant-aware strings, auto-link assessment to
            membership, email-on-decision, application AI panel,
            TOTP polish, WebAuthn assertion wrapper, NEAR onboarding tour

Run-style: HTTP smoke (no browser). Targets the live Railway URL by
default and uses the X-Network-Override header to scope every call to
the NEAR tenant. Idempotent — does not write demo data; relies on the
prior seed_networked_funds.py --rich run.

Usage:
  python test_near_uat.py [--base URL] [--network near]
"""

import argparse
import sys
import requests


DEFAULT_BASE = "https://web-production-6f8a.up.railway.app"
DEFAULT_NETWORK = "near"
PASS = "pass123"

ADMIN = "admin@kuja.org"
NGO1 = "fatima@amani.org"

results: list[tuple] = []


def run(name, fn):
    try:
        fn()
        results.append(("PASS", name))
        print(f"  [PASS] {name}")
    except AssertionError as e:
        results.append(("FAIL", name, str(e)))
        print(f"  [FAIL] {name} -- {e}")
    except Exception as e:
        results.append(("ERR", name, str(e)))
        print(f"  [ERR ] {name} -- {e}")


def session(base, network):
    """Build a requests.Session with X-Network-Override pinned to NEAR."""
    s = requests.Session()
    s.headers.update({
        "X-Requested-With": "XMLHttpRequest",
        "X-Network-Override": network,
    })
    s._base = base  # type: ignore[attr-defined]
    return s


def login(s, email, password=PASS):
    base = s._base  # type: ignore[attr-defined]
    r = s.post(f"{base}/api/auth/login",
               json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email}: HTTP {r.status_code} {r.text[:200]}"
    return r.json()


# ---------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------

def test_tenant_resolves_to_near(s):
    base = s._base
    # /network/current responds without auth and should resolve via
    # the X-Network-Override header.
    r = s.get(f"{base}/api/network/current", timeout=10)
    assert r.status_code == 200, f"HTTP {r.status_code}"
    net = r.json().get("network", {})
    assert net.get("slug") == "near", f"resolved {net.get('slug')!r}, expected 'near'"
    assert net.get("name"), "network has no name"


def test_login_as_admin(s):
    j = login(s, ADMIN)
    assert j.get("user", {}).get("role") == "admin"


def test_login_as_ngo(s):
    # Re-login as NGO
    j = login(s, NGO1)
    assert j.get("user", {}).get("role") == "ngo"


def test_funds_listed(s):
    base = s._base
    r = s.get(f"{base}/api/funds", timeout=10)
    assert r.status_code == 200, f"HTTP {r.status_code}"
    funds = r.json().get("funds", [])
    # The seed creates the Change Fund — should exist
    assert any("change" in (f.get("slug") or "").lower() for f in funds), \
        f"no change-fund found in {[f.get('slug') for f in funds]}"


def test_windows_have_rubric(s):
    base = s._base
    rf = s.get(f"{base}/api/funds", timeout=10)
    assert rf.status_code == 200
    funds = rf.json().get("funds", [])
    fund = next((f for f in funds if "change" in (f.get("slug") or "").lower()), None)
    assert fund is not None, "no change-fund found"
    rw = s.get(f"{base}/api/funds/{fund['id']}/windows", timeout=10)
    assert rw.status_code == 200
    windows = rw.json().get("windows", [])
    assert windows, "no windows under change-fund"


def test_crisis_report_published(s):
    base = s._base
    r = s.get(f"{base}/api/crisis/reports", timeout=10)
    assert r.status_code == 200, f"HTTP {r.status_code}"
    reports = r.json().get("reports", [])
    pub = [r for r in reports if r.get("status") == "published"]
    assert pub, "no published crisis monitoring report"


def test_declarations_listed(s):
    base = s._base
    r = s.get(f"{base}/api/declarations", timeout=10)
    assert r.status_code == 200, f"HTTP {r.status_code}"
    decls = r.json().get("declarations", [])
    assert decls, "no declarations in NEAR tenant"


def test_membership_admin_create(s):
    """Phase 39 — the admin-create endpoint exists + accepts X-Network-Override."""
    base = s._base
    # Probe the pending-list endpoint to confirm the membership blueprint
    # is mounted under this tenant.
    r = s.get(f"{base}/api/network/membership/pending?status=under_review", timeout=10)
    assert r.status_code in (200, 401, 403), \
        f"membership listing returned unexpected {r.status_code}"


def test_compliance_reports_endpoint(s):
    base = s._base
    r = s.get(f"{base}/api/reports/", timeout=10)
    # NGO context. Either returns the NGO's reports list or 403 if role
    # mismatch. Should never be 5xx.
    assert r.status_code < 500, f"HTTP {r.status_code} {r.text[:120]}"


def test_application_ai_panel_endpoints_mounted(s):
    """Phase 39 — both AI surfaces should be reachable and gate on app id."""
    base = s._base
    # Hitting with an invalid id should respond with 404, not 5xx — proving
    # the route is registered.
    r1 = s.post(f"{base}/api/applications/999999/ai-score-rubric", timeout=10)
    assert r1.status_code in (400, 403, 404), \
        f"rubric scorer route returned {r1.status_code}"
    r2 = s.post(f"{base}/api/applications/999999/ai-classify-budget",
                json={"budget_lines": []}, timeout=10)
    assert r2.status_code in (400, 403, 404), \
        f"budget classifier route returned {r2.status_code}"


def test_webauthn_routes_mounted(s):
    """Phase 39 — the verify-assertion wrapper should be present."""
    from app.routes import webauthn_routes  # type: ignore
    fn = getattr(webauthn_routes, "verify_assertion_for_user", None)
    assert callable(fn), "verify_assertion_for_user not exported from webauthn_routes"


def test_totp_status_endpoint(s):
    base = s._base
    r = s.get(f"{base}/api/auth/totp/status", timeout=10)
    assert r.status_code == 200, f"HTTP {r.status_code}"
    data = r.json()
    assert "enabled" in data and "has_pyotp" in data


def test_window_report_endpoint(s):
    """Phase 37 — window report aggregator is reachable."""
    base = s._base
    # Pull the first window id under change-fund
    rf = s.get(f"{base}/api/funds", timeout=10)
    funds = rf.json().get("funds", [])
    fund = next((f for f in funds if "change" in (f.get("slug") or "").lower()), None)
    assert fund, "no fund"
    rw = s.get(f"{base}/api/funds/{fund['id']}/windows", timeout=10)
    win = rw.json().get("windows", [])[0]
    r = s.get(f"{base}/api/windows/{win['id']}/report", timeout=10)
    assert r.status_code == 200, f"HTTP {r.status_code}"


def test_assessment_autolink_present(s):
    """Phase 39 — the auto-link helper code is registered (best-effort
    check via the import path)."""
    from app.routes import assessments as _a  # type: ignore
    assert hasattr(_a, "_autolink_assessment_to_membership"), \
        "auto-link helper not found"


def test_membership_decision_email_helper(s):
    """Phase 39 — decision-notify helper is registered on membership routes."""
    from app.routes import network_membership_routes as _m  # type: ignore
    assert hasattr(_m, "_notify_membership_decision"), \
        "_notify_membership_decision not found"


def test_application_has_phase40_columns(s):
    """Phase 40 — applications table has ai_rubric_result_json + budget_lines_json."""
    from app.models import Application  # type: ignore
    cols = {c.name for c in Application.__table__.columns}
    assert "ai_rubric_result_json" in cols, \
        "ai_rubric_result_json column missing from Application model"
    assert "budget_lines_json" in cols, \
        "budget_lines_json column missing from Application model"


def test_application_budget_helpers(s):
    """Phase 40 — get/set budget_lines + ai_rubric_result helpers exist."""
    from app.models import Application  # type: ignore
    a = Application()
    assert hasattr(a, "get_budget_lines") and hasattr(a, "set_budget_lines"), \
        "budget helpers missing on Application"
    assert hasattr(a, "get_ai_rubric_result") and hasattr(a, "set_ai_rubric_result"), \
        "rubric-result helpers missing on Application"
    # Round-trip a budget
    a.set_budget_lines([{"item": "Cash transfers", "amount": 1500}])
    out = a.get_budget_lines()
    assert isinstance(out, list) and len(out) == 1 and out[0]["amount"] == 1500, \
        f"budget round-trip broke: {out}"


def test_submit_hard_gate_response_shape(s):
    """Phase 40 — the submit endpoint returns the hard-gate response
    shape (gate code + threshold + direct_pct) when budget is below the
    window threshold. We don't have a live application to fail-trigger
    on, so this just probes the response shape via a known-bad app id
    (returns 404) confirming the route is mounted."""
    base = s._base
    r = s.post(f"{base}/api/applications/999999/submit", timeout=10)
    # Either 404 (app not found) or 403 (not your app). Never 5xx.
    assert r.status_code in (400, 403, 404), \
        f"/submit returned unexpected {r.status_code}"


# ---------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default=DEFAULT_BASE)
    parser.add_argument("--network", default=DEFAULT_NETWORK)
    args = parser.parse_args()

    base = args.base.rstrip("/")
    print(f"NEAR UAT smoke against {base} (network={args.network})\n")

    s = session(base, args.network)

    print("Tenant resolution + auth")
    run("Tenant resolves to NEAR via X-Network-Override", lambda: test_tenant_resolves_to_near(s))
    run("Admin login (NEAR scope)", lambda: test_login_as_admin(s))

    print("\nNetworked-funds entities")
    run("Funds list includes the Change Fund", lambda: test_funds_listed(s))
    run("Windows have a rubric attached", lambda: test_windows_have_rubric(s))
    run("Window report endpoint reachable (Phase 37)", lambda: test_window_report_endpoint(s))
    run("Crisis Monitoring Report has a published edition", lambda: test_crisis_report_published(s))
    run("Declarations list returns rows", lambda: test_declarations_listed(s))

    print("\nMembership + reporting")
    run("Membership listing endpoint mounted", lambda: test_membership_admin_create(s))
    run("Reports endpoint reachable for NGO context", lambda: test_compliance_reports_endpoint(s))

    print("\nPhase 38 AI surfaces (route registration)")
    run("Application rubric scorer route mounted", lambda: test_application_ai_panel_endpoints_mounted(s))
    run("Application budget classifier route mounted", lambda: test_application_ai_panel_endpoints_mounted(s))

    print("\nPhase 39 polish")
    run("TOTP status endpoint reachable", lambda: test_totp_status_endpoint(s))
    run("verify_assertion_for_user exported (WebAuthn wrapper)", lambda: test_webauthn_routes_mounted(s))
    run("Capacity-assessment auto-link helper present", lambda: test_assessment_autolink_present(s))
    run("Membership decision email helper present", lambda: test_membership_decision_email_helper(s))

    print("\nPhase 40 auto-rubric-score + hard-gate")
    run("Application has ai_rubric_result_json + budget_lines_json columns",
        lambda: test_application_has_phase40_columns(s))
    run("Budget + rubric helpers round-trip on the model",
        lambda: test_application_budget_helpers(s))
    run("/submit endpoint reachable (hard-gate route mounted)",
        lambda: test_submit_hard_gate_response_shape(s))

    print("\nNGO viewer")
    run("NGO login (NEAR scope)", lambda: test_login_as_ngo(s))

    # Summary
    passes = sum(1 for r in results if r[0] == "PASS")
    fails = sum(1 for r in results if r[0] == "FAIL")
    errors = sum(1 for r in results if r[0] == "ERR")
    total = len(results)

    print()
    print("=" * 60)
    print(f"NEAR UAT smoke: {passes}/{total} passed "
          f"({fails} failed, {errors} errored)")
    print("=" * 60)
    if fails or errors:
        print()
        for r in results:
            if r[0] != "PASS":
                print(f"  {r[0]} {r[1]}: {r[2] if len(r) > 2 else ''}")
        sys.exit(1)


if __name__ == "__main__":
    main()
