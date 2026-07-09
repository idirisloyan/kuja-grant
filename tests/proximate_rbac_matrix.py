# -*- coding: utf-8 -*-
"""Proximate RBAC regression matrix (2026-07-09).

Guards against the P0 authorization cluster found by the team: donors /
endorsers / platform-admins reading OB operational data, report_token
leakage, and the OB wrongly denied on /audit-chain.

Runs IN-PROCESS against the app's configured DB with Flask's test client.
Self-provisions throwaway donor / endorser / platform-admin users (idempotent)
and uses the seeded OB (ob@proximate.org / pass123). Asserts, for every
persona, the HTTP status AND that forbidden fields are absent from any body a
persona is allowed to see.

Usage:  py -3 tests/proximate_rbac_matrix.py
Exit 0 = all pass; exit 1 = at least one violation (prints the matrix).
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from werkzeug.security import generate_password_hash

from app import create_app
from app.extensions import db
from app.models import (
    Network, User, Organization, Endorser, ProximateDonor,
    ProximatePartner, ProximateDisbursement, ProximateRound,
)

PW = "RbacTest!123"
OB_EMAIL, OB_PW = "ob@proximate.org", "pass123"
DONOR_EMAIL = "rbactest_donor@proximate.org"
ENDORSER_EMAIL = "rbactest_endorser@proximate.org"
ADMIN_EMAIL = "rbactest_admin@proximate.org"

app = create_app()
app.login_manager.session_protection = None

failures = []
rows = []


def _ensure_user(email, role, org_id=None):
    u = User.query.filter_by(email=email).first()
    if not u:
        u = User(email=email, name=email.split("@")[0], role=role,
                 password_hash=generate_password_hash(PW), org_id=org_id)
        db.session.add(u)
        db.session.flush()
    else:
        u.password_hash = generate_password_hash(PW)
        u.role = role
        if org_id:
            u.org_id = org_id
    return u


def provision(net):
    org = Organization.query.filter_by(name="RBAC Test Org").first()
    if not org:
        org = Organization(name="RBAC Test Org", org_type="ngo", country="SD")
        db.session.add(org)
        db.session.flush()
    donor_u = _ensure_user(DONOR_EMAIL, "ngo", org.id)
    if not ProximateDonor.query.filter_by(
            network_id=net.id, primary_user_id=donor_u.id).first():
        db.session.add(ProximateDonor(
            network_id=net.id, primary_user_id=donor_u.id,
            display_name="RBAC Test Donor", org_id=org.id))
    end_u = _ensure_user(ENDORSER_EMAIL, "ngo", org.id)
    if not Endorser.query.filter_by(
            network_id=net.id, user_id=end_u.id).first():
        db.session.add(Endorser(
            network_id=net.id, user_id=end_u.id, locality="Khartoum",
            country="SD", reputation_score=50, status="approved"))
    _ensure_user(ADMIN_EMAIL, "admin", org.id)
    db.session.commit()


def client_for(email, pw):
    c = app.test_client()
    r = c.post("/api/auth/login",
               json={"email": email, "password": pw},
               headers={"X-Network-Override": "proximate"})
    if r.status_code != 200:
        failures.append(f"LOGIN FAILED for {email}: {r.status_code} {r.get_data(as_text=True)[:120]}")
    return c


def _get(c, path):
    return c.get(path, headers={"X-Network-Override": "proximate"})


def check(persona, path, c, *, expect_status, forbid=(), require=()):
    r = _get(c, path)
    body = r.get_data(as_text=True)
    ok = (r.status_code == expect_status)
    detail = f"status={r.status_code} (want {expect_status})"
    if ok and expect_status == 200:
        for f in forbid:
            if f'"{f}"' in body:
                ok = False
                detail += f" | LEAKED '{f}'"
        for f in require:
            if f'"{f}"' not in body:
                ok = False
                detail += f" | MISSING '{f}'"
    mark = "PASS" if ok else "FAIL"
    rows.append(f"  [{mark}] {persona:9} {path:55} {detail}")
    if not ok:
        failures.append(f"{persona} {path}: {detail}")


with app.app_context():
    net = Network.query.filter_by(slug="proximate").first()
    if not net:
        print("No Proximate network — run seed_proximate.py first.")
        sys.exit(1)
    provision(net)

    partner = ProximatePartner.query.filter_by(network_id=net.id).first()
    nominated = ProximatePartner.query.filter_by(
        network_id=net.id, status="nominated").first() or partner
    disb = ProximateDisbursement.query.filter_by(network_id=net.id).first()
    rnd = ProximateRound.query.filter_by(network_id=net.id).first()
    pid, npid = partner.id, nominated.id
    did = disb.id if disb else 0
    rid = rnd.id if rnd else 0

ob = client_for(OB_EMAIL, OB_PW)
donor = client_for(DONOR_EMAIL, PW)
endorser = client_for(ENDORSER_EMAIL, PW)
admin = client_for(ADMIN_EMAIL, PW)

# ---- OB: full access, sees the sensitive fields --------------------------
check("ob", "/api/proximate/overview", ob, expect_status=200)
check("ob", "/api/proximate/attention-queue", ob, expect_status=200)
check("ob", "/api/proximate/audit-chain", ob, expect_status=200)  # was 403 pre-fix
check("ob", f"/api/proximate/disbursements/preflight?partner_id={npid}", ob, expect_status=200)
check("ob", f"/api/proximate/partners/{pid}", ob, expect_status=200, require=("trust_floor_signals",))
if did:
    check("ob", f"/api/proximate/disbursements/{did}", ob, expect_status=200)

# ---- donor: locked out of OB ops; round detail donor-safe ----------------
for p in ["/api/proximate/overview", "/api/proximate/attention-queue",
          "/api/proximate/audit-chain", "/api/proximate/interventions",
          "/api/proximate/fsps",
          f"/api/proximate/disbursements/preflight?partner_id={npid}",
          f"/api/proximate/partners/{pid}",
          f"/api/proximate/partners/{pid}/endorsements",
          f"/api/proximate/partners/{pid}/disbursement-methods"]:
    check("donor", p, donor, expect_status=403)
if did:
    check("donor", f"/api/proximate/disbursements/{did}", donor, expect_status=403)
if rid:
    check("donor", f"/api/proximate/rounds/{rid}", donor, expect_status=200,
          forbid=("report_token", "audit_in_window", "actor_email",
                  "signers_required", "signed_count", "ready_for_activation"))

# ---- endorser: partner detail SAFE subset; no OB reads -------------------
check("endorser", f"/api/proximate/partners/{pid}", endorser, expect_status=200,
      forbid=("bank_account_holder_name", "bank_name", "contact_phone",
              "sanctions_summary", "intake_form", "reputation_floor"))
check("endorser", f"/api/proximate/partners/{pid}/endorsements", endorser, expect_status=403)
check("endorser", "/api/proximate/overview", endorser, expect_status=403)
if did:
    check("endorser", f"/api/proximate/disbursements/{did}", endorser, expect_status=403)

# ---- platform admin: NOT an OB — locked out ------------------------------
for p in ["/api/proximate/overview", "/api/proximate/attention-queue",
          "/api/proximate/audit-chain", f"/api/proximate/partners/{pid}"]:
    check("admin", p, admin, expect_status=403)
if did:
    check("admin", f"/api/proximate/disbursements/{did}", admin, expect_status=403)

print("\n=== Proximate RBAC matrix ===")
for line in rows:
    print(line)
print(f"\n{len(rows)} checks, {len(failures)} failures")
sys.exit(1 if failures else 0)
