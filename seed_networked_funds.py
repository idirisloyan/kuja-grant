#!/usr/bin/env python3
"""Seed networked-funds demo data via the production API.

Creates a realistic walkthrough scenario for the Phase 32-38
networked-funds workflow:

  Kuja Marketplace (network)
    └── Change Fund (fund, slug=change-fund)
            └── Emergency Response (window, slug=emergency-response)
                    └── NEAR Change Fund Standard Rubric (16 criteria)

  Plus:
  - A published Crisis Monitoring Report covering the past week
  - A Somalia drought row scored ~92/100 (high urgency, flagged for OB)
  - A draft EmergencyDeclaration citing that row, with 2 signer slots
    (admin + donor) ready to test the multi-sig flow

Idempotent: re-running skips entities that already exist by slug/title.

Usage:
  python seed_networked_funds.py [--base BASE_URL] [--email EMAIL] [--password PW]

Defaults to the live Railway deployment + admin@kuja.org / pass123.
"""
import argparse
import sys
from datetime import date, timedelta

import requests


DEFAULT_BASE = "https://web-production-6f8a.up.railway.app"
DEFAULT_EMAIL = "admin@kuja.org"
DEFAULT_PASSWORD = "pass123"


def main():
    parser = argparse.ArgumentParser(description="Seed networked-funds demo data via the API")
    parser.add_argument("--base", default=DEFAULT_BASE, help="API base URL")
    parser.add_argument("--email", default=DEFAULT_EMAIL, help="Admin email")
    parser.add_argument("--password", default=DEFAULT_PASSWORD, help="Admin password")
    args = parser.parse_args()

    base = args.base.rstrip("/")
    s = requests.Session()
    H = {"X-Requested-With": "XMLHttpRequest"}

    print(f"== Seeding networked-funds demo data on {base} ==\n")

    # ----------------------------------------------------------------
    # 1. Login
    # ----------------------------------------------------------------
    print(f"[1/8] Logging in as {args.email}...")
    r = s.post(
        f"{base}/api/auth/login",
        json={"email": args.email, "password": args.password},
        headers=H, timeout=15,
    )
    if r.status_code != 200:
        die(f"Login failed: HTTP {r.status_code} {r.text[:200]}")
    user = r.json().get("user", {})
    admin_id = user.get("id")
    print(f"   ok — user_id={admin_id}, role={user.get('role')}\n")

    # ----------------------------------------------------------------
    # 2. Fund — Change Fund
    # ----------------------------------------------------------------
    print("[2/8] Creating Fund 'Change Fund'...")
    fund_id = find_or_create(
        s, base, H,
        list_url="/api/funds",
        list_key="funds",
        find_by={"slug": "change-fund"},
        create_url="/api/funds",
        create_payload={
            "slug": "change-fund",
            "name": "Change Fund",
            "short_description": (
                "Global pooled fund for locally-led humanitarian response. "
                "Governed by an Oversight Body of peer-elected NEAR member leaders."
            ),
            "currency": "USD",
            "total_pool_amount": 6700000,
            "year_launched": 2022,
            "is_default_for_emergency": True,
        },
        out_key="fund",
    )
    print(f"   ok — fund_id={fund_id}\n")

    # ----------------------------------------------------------------
    # 3. Window — Emergency Response
    # ----------------------------------------------------------------
    print("[3/8] Creating FundWindow 'Emergency Response'...")
    window_id = find_or_create(
        s, base, H,
        list_url=f"/api/funds/{fund_id}/windows",
        list_key="windows",
        find_by={"slug": "emergency-response"},
        create_url=f"/api/funds/{fund_id}/windows",
        create_payload={
            "slug": "emergency-response",
            "name": "Emergency Response",
            "description": (
                "Rapid response window for sudden-onset humanitarian crises. "
                "72-hour application window, 6-day OB decision SLA."
            ),
            "crisis_type": "humanitarian",
            "min_grant_amount": 150000,
            "max_grant_amount": 250000,
            "default_grant_duration_months": 6,
            "application_window_hours": 72,
            "decision_sla_days": 6,
            "direct_to_community_single_min_pct": 80.0,
            "direct_to_community_consortium_min_pct": 70.0,
            "status": "open",
            "is_public": True,
        },
        out_key="window",
    )
    print(f"   ok — window_id={window_id}\n")

    # ----------------------------------------------------------------
    # 4. Seed Change Fund rubric on the window
    # ----------------------------------------------------------------
    print("[4/8] Seeding NEAR Change Fund 5-area rubric...")
    r = s.post(f"{base}/api/windows/{window_id}/rubric/seed-change-fund",
               headers=H, timeout=20)
    if r.status_code != 200:
        die(f"Rubric seed failed: HTTP {r.status_code} {r.text[:200]}")
    rubric = r.json().get("rubric", {})
    already = r.json().get("already_existed")
    print(f"   ok — rubric_id={rubric.get('id')}, criteria={rubric.get('criterion_count')}"
          f"{', already existed' if already else ', freshly seeded'}\n")

    # ----------------------------------------------------------------
    # 5. Crisis Monitoring Report (this week)
    # ----------------------------------------------------------------
    print("[5/8] Creating Crisis Monitoring Report for the past week...")
    today = date.today()
    period_start = (today - timedelta(days=7)).isoformat()
    period_end = today.isoformat()

    # Check if a report already exists for this period
    rl = s.get(f"{base}/api/crisis/reports?status=published", headers=H, timeout=10)
    existing_report = None
    if rl.status_code == 200:
        for rep in rl.json().get("reports", []):
            if rep.get("period_start") == period_start and rep.get("period_end") == period_end:
                existing_report = rep
                break

    if existing_report:
        report_id = existing_report["id"]
        print(f"   already exists — report_id={report_id}")
    else:
        r = s.post(f"{base}/api/crisis/reports", json={
            "period_start": period_start,
            "period_end": period_end,
            "summary_md": (
                "Weekly Crisis Monitoring Report covering humanitarian "
                "situations across NEAR member countries. Highlights below."
            ),
            "generated_by": "manual",
        }, headers=H, timeout=10)
        if r.status_code != 200:
            die(f"Report create failed: HTTP {r.status_code} {r.text[:200]}")
        report_id = r.json()["report"]["id"]
        print(f"   ok — report_id={report_id}")

    # ----------------------------------------------------------------
    # 6. Crisis Monitoring Row — Somalia drought
    # ----------------------------------------------------------------
    print("[6/8] Adding Somalia drought row...")
    # Look for existing row
    rdet = s.get(f"{base}/api/crisis/reports/{report_id}", headers=H, timeout=10)
    rows = rdet.json().get("report", {}).get("rows", []) if rdet.status_code == 200 else []
    som_row = next((r for r in rows if r.get("country") == "SOM"), None)
    if som_row:
        row_id = som_row["id"]
        print(f"   already exists — row_id={row_id}, score={som_row.get('composite_score')}")
    else:
        r = s.post(f"{base}/api/crisis/reports/{report_id}/rows", json={
            "country": "SOM",
            "region": "Horn of Africa",
            "event_type": "drought",
            "event_title": "Somalia drought escalation — Jubbaland, South-West",
            "hdi_band": "low_hdi",
            "gov_capacity_band": "low",
            "people_impacted_estimate": 200000,
            "attention_band": "low",
            "narrative": (
                "Severe drought conditions across southern Somalia. Member "
                "alerts indicate accelerating displacement, livestock losses, "
                "and water scarcity in Jubbaland and South-West State. "
                "Government response capacity overwhelmed; INGO presence "
                "thin in affected districts. Member orgs report immediate "
                "need for water trucking + cash transfers + livestock support."
            ),
            "flagged_for_ob": True,
        }, headers=H, timeout=10)
        if r.status_code != 200:
            die(f"Row create failed: HTTP {r.status_code} {r.text[:200]}")
        row = r.json()["row"]
        row_id = row["id"]
        print(f"   ok — row_id={row_id}, composite_score={row.get('composite_score')}")

    # ----------------------------------------------------------------
    # 7. Publish the report (so it can be cited as declaration evidence)
    # ----------------------------------------------------------------
    print("[7/8] Publishing Crisis Monitoring Report...")
    # Re-fetch to get current status
    rdet = s.get(f"{base}/api/crisis/reports/{report_id}", headers=H, timeout=10)
    current_status = rdet.json().get("report", {}).get("status") if rdet.status_code == 200 else None
    if current_status == "published":
        print(f"   already published")
    else:
        r = s.post(f"{base}/api/crisis/reports/{report_id}/publish", headers=H, timeout=10)
        if r.status_code != 200:
            die(f"Publish failed: HTTP {r.status_code} {r.text[:200]}")
        anchor = r.json().get("report", {}).get("cron_anchor_audit_id")
        print(f"   ok — published, audit_anchor=#{anchor}")
    print()

    # ----------------------------------------------------------------
    # 8. Draft EmergencyDeclaration citing the Somalia row
    # ----------------------------------------------------------------
    print("[8/8] Creating draft EmergencyDeclaration...")
    decl_title = "Somalia drought emergency — Q2 2026 response"

    # Look for existing
    rl = s.get(f"{base}/api/declarations", headers=H, timeout=10)
    existing_decl = None
    if rl.status_code == 200:
        for d in rl.json().get("declarations", []):
            if d.get("title") == decl_title:
                existing_decl = d
                break

    if existing_decl:
        decl_id = existing_decl["id"]
        print(f"   already exists — declaration_id={decl_id}, status={existing_decl['status']}")
    else:
        r = s.post(f"{base}/api/declarations", json={
            "fund_id": fund_id,
            "window_id": window_id,
            "title": decl_title,
            "crisis_type": "drought",
            "region": "Horn of Africa",
            "country": "SOM",
            "severity": "high",
            "summary_md": (
                "## Somalia drought — emergency response\n\n"
                "Severe drought across southern Somalia is driving rapid "
                "displacement, food insecurity, and water scarcity in "
                "Jubbaland and South-West State. ~200,000 people directly "
                "impacted. Government response capacity is overwhelmed; "
                "international presence in affected districts is thin.\n\n"
                "Proposed: 6 NEAR member orgs with operational presence "
                "in affected districts, $250k each, 6-month implementation. "
                "Priority interventions: water trucking, multi-purpose cash "
                "transfers, livestock support, community-based protection."
            ),
            "proposed_total_amount": 1500000,
            "evidence_row_id": row_id,
        }, headers=H, timeout=10)
        if r.status_code != 200:
            die(f"Declaration create failed: HTTP {r.status_code} {r.text[:200]}")
        decl_id = r.json()["declaration"]["id"]
        print(f"   ok — declaration_id={decl_id}")

    # Add 2 signer slots (admin + donor user) so submission can proceed.
    # Look up donor user id first.
    rdonor = s.post(
        f"{base}/api/auth/login",
        json={"email": "sarah@globalhealth.org", "password": args.password},
        headers=H, timeout=15,
    )
    if rdonor.status_code == 200:
        donor_id = rdonor.json()["user"]["id"]
        # Re-login as admin
        s.post(f"{base}/api/auth/login",
               json={"email": args.email, "password": args.password},
               headers=H, timeout=15)

        # Get current signers
        rdet = s.get(f"{base}/api/declarations/{decl_id}", headers=H, timeout=10)
        sigs = rdet.json().get("declaration", {}).get("signatures", []) if rdet.status_code == 200 else []
        existing_signer_ids = {s["signer_user_id"] for s in sigs}

        if admin_id not in existing_signer_ids:
            ra = s.post(f"{base}/api/declarations/{decl_id}/signers",
                        json={"user_id": admin_id, "required_order": 0},
                        headers=H, timeout=10)
            print(f"   - admin signer slot: {'added' if ra.status_code == 200 else 'failed'}")
        else:
            print(f"   - admin signer slot already exists")

        if donor_id not in existing_signer_ids:
            rd = s.post(f"{base}/api/declarations/{decl_id}/signers",
                        json={"user_id": donor_id, "required_order": 1},
                        headers=H, timeout=10)
            print(f"   - donor signer slot: {'added' if rd.status_code == 200 else 'failed'}")
        else:
            print(f"   - donor signer slot already exists")
    else:
        print("   warning: donor user lookup failed; signer slots not added")

    print()
    print("=" * 60)
    print("Seed complete. Walk through the demo at:")
    print(f"  {base}/admin/funds                                  -- see the Change Fund")
    print(f"  {base}/admin/windows/{window_id}/report             -- window report")
    print(f"  {base}/admin/declarations                           -- declaration list")
    print(f"  {base}/admin/declarations/{decl_id}                 -- multi-sig signing page")
    print("=" * 60)


# -------------------------------------------------------------------------

def find_or_create(s, base, H, *, list_url, list_key, find_by, create_url, create_payload, out_key):
    """Idempotent: return the id of the matching entity, creating if absent."""
    r = s.get(f"{base}{list_url}", headers=H, timeout=10)
    if r.status_code == 200:
        for item in r.json().get(list_key, []):
            if all(item.get(k) == v for k, v in find_by.items()):
                return item["id"]
    # Doesn't exist — create
    r = s.post(f"{base}{create_url}", json=create_payload, headers=H, timeout=10)
    if r.status_code not in (200, 201):
        die(f"Create failed for {find_by}: HTTP {r.status_code} {r.text[:200]}")
    return r.json()[out_key]["id"]


def die(msg):
    print(f"\nERROR: {msg}", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
