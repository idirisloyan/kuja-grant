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
    parser.add_argument(
        "--network-slug", default=None,
        help="Target a specific network via X-Network-Override header (e.g. 'near'). "
             "Default: route via host header (kuja default).",
    )
    parser.add_argument(
        "--activate-declaration", action="store_true",
        help="After creating the draft declaration, submit + sign both slots "
             "via manual_admin so the declaration auto-activates. Adds a "
             "shortlist of 3 NGO orgs so auto grant drafts get created.",
    )
    parser.add_argument(
        "--release-applications", action="store_true",
        help="After activation, also flip the auto-created grant drafts to "
             "'open' and set applicants_notified_at. Use --activate-declaration "
             "together. Demonstrates the full handoff from declaration to "
             "operational grant.",
    )
    parser.add_argument(
        "--rich", action="store_true",
        help="Seed the richer demo story on top of the baseline: 3 pending "
             "NetworkMembership applications, a MonitoringVisit with community "
             "feedback narrative, and a second CrisisMonitoringRow (Sahel "
             "displacement) for variety in the report.",
    )
    args = parser.parse_args()

    base = args.base.rstrip("/")
    s = requests.Session()
    H = {"X-Requested-With": "XMLHttpRequest"}
    if args.network_slug:
        H["X-Network-Override"] = args.network_slug
        print(f"== Using X-Network-Override: {args.network_slug} ==")

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

    # Add 2 signer slots — donor + NGO. We DON'T add admin as a signer
    # because admin can't manual_admin-attest for themselves (the
    # activate-declaration path would skip it), and the platform's default
    # oversight_body_min_signers=2 means we need both slots to sign.
    # Both donor + NGO are valid third-party signers for the manual_admin
    # paper-signature ceremony path.
    sarah_id = None
    fatima_id = None
    try:
        rsarah = s.post(f"{base}/api/auth/login",
                        json={"email": "sarah@globalhealth.org", "password": args.password},
                        headers=H, timeout=15)
        if rsarah.status_code == 200:
            sarah_id = rsarah.json()["user"]["id"]
        rfatima = s.post(f"{base}/api/auth/login",
                         json={"email": "fatima@amani.org", "password": args.password},
                         headers=H, timeout=15)
        if rfatima.status_code == 200:
            fatima_id = rfatima.json()["user"]["id"]
        # Re-login as admin for the rest
        s.post(f"{base}/api/auth/login",
               json={"email": args.email, "password": args.password},
               headers=H, timeout=15)
    except Exception as e:
        print(f"   warning: signer user lookup failed: {e}")

    rdet = s.get(f"{base}/api/declarations/{decl_id}", headers=H, timeout=10)
    sigs = rdet.json().get("declaration", {}).get("signatures", []) if rdet.status_code == 200 else []
    existing_signer_ids = {s["signer_user_id"] for s in sigs}

    if sarah_id and sarah_id not in existing_signer_ids:
        ra = s.post(f"{base}/api/declarations/{decl_id}/signers",
                    json={"user_id": sarah_id, "required_order": 0},
                    headers=H, timeout=10)
        print(f"   - donor (sarah) signer slot: {'added' if ra.status_code == 200 else 'failed'}")
    elif sarah_id:
        print(f"   - donor (sarah) signer slot already exists")

    if fatima_id and fatima_id not in existing_signer_ids:
        rd = s.post(f"{base}/api/declarations/{decl_id}/signers",
                    json={"user_id": fatima_id, "required_order": 1},
                    headers=H, timeout=10)
        print(f"   - NGO (fatima) signer slot: {'added' if rd.status_code == 200 else 'failed'}")
    elif fatima_id:
        print(f"   - NGO (fatima) signer slot already exists")

    # ----------------------------------------------------------------
    # 9. Optional: submit + sign the declaration so it activates
    # ----------------------------------------------------------------
    if args.activate_declaration:
        print()
        print("[9/9] Activating the declaration (submit + sign both slots)...")
        # Re-fetch detail
        rdet = s.get(f"{base}/api/declarations/{decl_id}", headers=H, timeout=10)
        decl = rdet.json().get("declaration", {})
        cur_status = decl.get("status")

        # If still in draft, add a small shortlist (3 NGO orgs) so auto-
        # grant creation has something to do on activation.
        if cur_status == "draft" and not decl.get("shortlisted_org_ids"):
            # Pull NGO orgs the admin can see — there are seeded NGO test
            # orgs from seed.py. We'll grab the first 3.
            ngo_orgs = []
            try:
                ro = s.get(f"{base}/api/organizations/", headers=H, timeout=10)
                if ro.status_code == 200:
                    all_orgs = ro.json().get("organizations", [])
                    ngo_orgs = [
                        o["id"] for o in all_orgs
                        if (o.get("org_type") or "").lower() == "ngo"
                    ][:3]
            except Exception:
                pass
            if ngo_orgs:
                ru = s.put(f"{base}/api/declarations/{decl_id}",
                           json={"shortlisted_org_ids": ngo_orgs},
                           headers=H, timeout=10)
                if ru.status_code == 200:
                    print(f"   - shortlist: added {ngo_orgs}")
                else:
                    print(f"   - shortlist: skipped ({ru.status_code})")
            else:
                print(f"   - shortlist: no NGO orgs found")

            # Submit for signature: draft → in_review
            rsub = s.post(f"{base}/api/declarations/{decl_id}/submit",
                          headers=H, timeout=10)
            if rsub.status_code == 200:
                print(f"   - submitted for signature")
                cur_status = "in_review"
            else:
                print(f"   - submit failed ({rsub.status_code}): {rsub.text[:150]}")

        # Sign every pending slot via manual_admin (admin must be distinct
        # from each signer, which we ensure by adding donor+ngo, not admin).
        if cur_status == "in_review":
            rdet = s.get(f"{base}/api/declarations/{decl_id}", headers=H, timeout=10)
            sigs = rdet.json().get("declaration", {}).get("signatures", [])
            for sig in sigs:
                if sig.get("status") != "pending":
                    continue
                if sig.get("signer_user_id") == admin_id:
                    # Can't manual_admin-attest for self; skip. (Smoke
                    # uses donor+ngo for both slots to avoid this.)
                    print(f"   - sig #{sig['id']}: skipped (admin self)")
                    continue
                rsign = s.post(
                    f"{base}/api/declarations/{decl_id}/signatures/{sig['id']}/sign",
                    json={"signature_method": "manual_admin", "declared_no_coi": True},
                    headers=H, timeout=10,
                )
                if rsign.status_code == 200:
                    new_status = rsign.json().get("declaration", {}).get("status")
                    print(f"   - sig #{sig['id']}: signed (declaration: {new_status})")
                else:
                    print(f"   - sig #{sig['id']}: failed ({rsign.status_code}) {rsign.text[:150]}")

        # Final state
        rfin = s.get(f"{base}/api/declarations/{decl_id}", headers=H, timeout=10)
        final = rfin.json().get("declaration", {})
        print(f"   final status: {final.get('status')} "
              f"({final.get('signed_count')}/{final.get('required_signer_count')} signed)"
              f"{', audit anchor #' + str(final.get('signed_active_audit_id')) if final.get('signed_active_audit_id') else ''}")

        # Retroactive shortlist + grant creation if the declaration is
        # active but has no grants under it yet (happens when activated
        # with an empty shortlist).
        if final.get("status") == "signed_active":
            # Count grants associated with this declaration
            org_ids_now = final.get("shortlisted_org_ids") or []
            if not org_ids_now:
                # Pull NGO orgs
                try:
                    ro = s.get(f"{base}/api/organizations/", headers=H, timeout=10)
                    if ro.status_code == 200:
                        all_orgs = ro.json().get("organizations", [])
                        ngo_ids = [
                            o["id"] for o in all_orgs
                            if (o.get("org_type") or "").lower() == "ngo"
                        ][:3]
                        if ngo_ids:
                            rg = s.post(
                                f"{base}/api/declarations/{decl_id}/create-shortlist-grants",
                                json={"org_ids": ngo_ids},
                                headers=H, timeout=15,
                            )
                            if rg.status_code == 200:
                                grants_count = rg.json().get("declaration", {}).get("shortlisted_org_ids", [])
                                print(f"   - retroactive grants: created for orgs {ngo_ids}")
                            else:
                                print(f"   - retroactive grants: failed ({rg.status_code}) {rg.text[:200]}")
                except Exception as e:
                    print(f"   - retroactive grants: error {e}")

    # ----------------------------------------------------------------
    # 10. Optional: release applications (the governed handoff)
    # ----------------------------------------------------------------
    if args.release_applications:
        print()
        print("[10] Releasing applications (the governed declaration-to-grant handoff)...")
        rrel = s.post(f"{base}/api/declarations/{decl_id}/release-applications",
                      headers=H, timeout=10)
        if rrel.status_code == 200:
            data = rrel.json()
            count = data.get("released_count", 0)
            if count > 0:
                print(f"   ok - released {count} grant(s) to 'open' status")
                for g in data.get("released", [])[:5]:
                    print(f"     - grant #{g['grant_id']}")
            else:
                already = data.get("declaration", {}).get("applicants_notified_at")
                print(f"   already released (applicants_notified_at: {already})")
        elif rrel.status_code == 400 and "signed_active" in rrel.text:
            print(f"   skipped - declaration is not signed_active yet")
        else:
            print(f"   failed ({rrel.status_code}): {rrel.text[:150]}")

    # ----------------------------------------------------------------
    # 11. Optional: richer demo story (--rich)
    # ----------------------------------------------------------------
    if args.rich:
        print()
        print("[11] Seeding the richer demo story (memberships + visit + 2nd crisis row)...")
        _seed_rich(s, base, H, network_slug=args.network_slug, admin_id=admin_id,
                   report_id=report_id, decl_id=decl_id, window_id=window_id)

    print()
    print("=" * 60)
    print("Seed complete. Walk through the demo at:")
    print(f"  {base}/admin/funds                                  -- see the Change Fund")
    print(f"  {base}/admin/windows/{window_id}/report             -- window report")
    print(f"  {base}/admin/declarations                           -- declaration list")
    print(f"  {base}/admin/declarations/{decl_id}                 -- multi-sig signing page")
    print("=" * 60)


# -------------------------------------------------------------------------

def _seed_rich(s, base, H, *, network_slug, admin_id, report_id, decl_id, window_id):
    """Seed the richer demo story: pending memberships + monitoring visit + 2nd crisis row."""
    from datetime import date

    # --- 11.1 Three pending NetworkMembership applications -----------
    # Use the admin-create endpoint so memberships land under the *current*
    # tenant (the X-Network-Override header is admin-only; an NGO user
    # logging in directly would always hit the default tenant).
    #
    # Look up NGO org IDs by name — local SQLite has them at 1/2/3 but
    # prod assigns higher IDs based on seed.py ordering. Country mapping
    # by name keeps the seed deterministic across environments.
    org_name_to_country = {
        "Amani Community Development": "KEN",
        "Salam Relief Foundation": "SOM",
        "Ubuntu Education Trust": "ZAF",
    }
    ro = s.get(f"{base}/api/organizations/?type=ngo&page=1", headers=H, timeout=10)
    ngo_targets = []
    if ro.status_code == 200:
        for o in ro.json().get("organizations", []):
            name = o.get("name", "")
            if name in org_name_to_country:
                ngo_targets.append((o["id"], org_name_to_country[name]))
            if len(ngo_targets) >= 3:
                break
    if not ngo_targets:
        # Fallback: take the first 3 NGO orgs with a placeholder country
        if ro.status_code == 200:
            for o in ro.json().get("organizations", [])[:3]:
                ngo_targets.append((o["id"], "—"))
        print(f"   - falling back to first 3 NGO orgs (couldn't match by name)")
    pending_count = 0
    for (org_id, country) in ngo_targets:
        ra = s.post(f"{base}/api/network/membership/admin-create", json={
            "org_id": org_id,
            "country": country,
            "region": "Eastern + Southern Africa",
            "member_tier": "member",
            "eligibility_answers": {
                "registered_nonprofit": "yes",
                "global_south_hq": "yes",
                "locally_rooted": "yes",
                "governance_docs": "yes",
                "code_of_conduct": "yes",
            },
        }, headers=H, timeout=10)
        if ra.status_code == 200:
            mem = ra.json().get("membership", {})
            already = ra.json().get("already_existed", False)
            pending_count += 1
            print(f"   - org #{org_id} ({country}): membership #{mem.get('id')} "
                  f"status={mem.get('status')}"
                  f"{' (already existed)' if already else ''}")
        else:
            print(f"   - org #{org_id}: admin-create failed ({ra.status_code}): {ra.text[:120]}")
    print(f"   memberships: {pending_count}")

    # --- 11.2 Second crisis monitoring row (Sahel displacement) -----
    # Add to the same report; demonstrates per-report variety.
    rrows = s.get(f"{base}/api/crisis/reports/{report_id}", headers=H, timeout=10)
    existing_countries = set()
    if rrows.status_code == 200:
        for row in rrows.json().get("report", {}).get("rows", []):
            existing_countries.add(row.get("country"))
    if "BFA" not in existing_countries:
        rsahel = s.post(f"{base}/api/crisis/reports/{report_id}/rows", json={
            "country": "BFA",  # Burkina Faso
            "region": "Sahel",
            "event_type": "conflict_displacement",
            "event_title": "Sahel displacement spike — Centre-Nord, Boucle du Mouhoun",
            "hdi_band": "low_hdi",
            "gov_capacity_band": "low",
            "people_impacted_estimate": 80000,
            "attention_band": "low",  # forgotten crisis
            "narrative": (
                "Continued armed conflict in Burkina Faso's Centre-Nord and "
                "Boucle du Mouhoun regions has displaced an estimated 80,000 "
                "people in the past month. State response capacity is "
                "overstretched; international attention has shifted elsewhere. "
                "NEAR member orgs in adjacent regions report increasing "
                "household pressure. Suggested OB action: review whether "
                "the existing Sahel response cluster needs reinforcement."
            ),
            "flagged_for_ob": True,
        }, headers=H, timeout=10)
        if rsahel.status_code == 200:
            score = rsahel.json()["row"]["composite_score"]
            print(f"   crisis row: Sahel displacement (BFA), composite_score={score}")
        else:
            print(f"   crisis row: failed ({rsahel.status_code})")
    else:
        print(f"   crisis row: BFA already exists")

    # Re-publish if the report is no longer current
    rcheck = s.get(f"{base}/api/crisis/reports/{report_id}", headers=H, timeout=10)
    if rcheck.status_code == 200:
        if rcheck.json().get("report", {}).get("status") != "published":
            s.post(f"{base}/api/crisis/reports/{report_id}/publish",
                   headers=H, timeout=10)

    # --- 11.3 Monitoring visit on one of the declaration's grants ----
    # Find an open grant under this declaration.
    rwin = s.get(f"{base}/api/windows/{window_id}/report", headers=H, timeout=10)
    target_grant_id = None
    if rwin.status_code == 200:
        for d in rwin.json().get("declarations", []):
            if d.get("id") == decl_id:
                grants = d.get("grants", [])
                if grants:
                    target_grant_id = grants[0]["id"]
                    break
    if target_grant_id:
        # Check existing visits to stay idempotent
        rv_list = s.get(f"{base}/api/grants/{target_grant_id}/monitoring-visits",
                        headers=H, timeout=10)
        had_visit = False
        if rv_list.status_code == 200:
            had_visit = len(rv_list.json().get("visits", [])) > 0
        if not had_visit:
            rv = s.post(f"{base}/api/grants/{target_grant_id}/monitoring-visits",
                        json={
                            "declaration_id": decl_id,  # link so window report finds it
                            "visit_mode": "virtual",
                            "visit_date": date.today().isoformat(),
                            "observations_md": (
                                "Joint secretariat + OB virtual check-in with the "
                                "implementing team. Three water trucks deployed to "
                                "the affected districts; cash transfers to 1,200 "
                                "households in week 2. Field team reports access "
                                "constraints in two villages and is coordinating "
                                "with local authorities to resolve."
                            ),
                            "community_feedback_summary": (
                                "Community committee reports that the cash transfer "
                                "amount is well-matched to local food prices. They "
                                "raised one concern: pregnant women in two villages "
                                "have not received additional nutrition support yet — "
                                "the team committed to a follow-up in week 4."
                            ),
                            "issues_identified": "Access constraints in 2 villages; pregnant-women nutrition gap.",
                            "action_items_md": (
                                "1. Coordinate with district authorities on access "
                                "(due: 2 weeks).\n"
                                "2. Add pregnant-women nutrition module for next "
                                "distribution cycle (due: week 4)."
                            ),
                            "attendance_estimate": 18,
                        }, headers=H, timeout=10)
            if rv.status_code == 200:
                print(f"   monitoring visit: recorded on grant #{target_grant_id}")
            else:
                print(f"   monitoring visit: failed ({rv.status_code}) {rv.text[:120]}")
        else:
            print(f"   monitoring visit: grant #{target_grant_id} already has a visit")
    else:
        print(f"   monitoring visit: no eligible grant found (skipping)")


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
