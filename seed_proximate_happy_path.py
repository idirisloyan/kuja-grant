# -*- coding: utf-8 -*-
"""Proximate — PERMANENT happy-path QA fixture (reviewer improvement #2).

The pilot review found that prod carries only real Blue Nile data, and no
Blue Nile round happened to sit in the exact "awarded + dd_clear partner,
contract complete, money NOT yet moved" state a disbursement dry-run needs.
So every UAT pass had to hand-build that state, and the tester's ad-hoc round
then lingered as clutter next to real records.

This script seeds ONE standing, clearly-marked happy-path fixture so a
disbursement (and the report/outcome flow after it) can always be exercised
without touching a single real partner. It is:

  * TEST-tagged by NAME. Every fixture row's name contains "QA Fixture", which
    the console's own regex (/\\b(uat|test|qa|codex|demo|fixture)\\b/i) renders
    as a TEST badge — so it can never be mistaken for a live partner or round.
  * Idempotent. Every row is found-or-created by a stable marker name and its
    state reconciled to target, so re-running is a no-op (safe on prod boot or
    by hand). Same reconciliation pattern as seed_proximate.py.
  * Blue-Nile-safe. It ONLY ever queries/creates rows that carry the fixture
    marker names. It never selects, mutates, or deletes a real partner, round,
    award, contract, or disbursement. Round 9 / the real Blue Nile partners are
    untouched by construction — there is no query here that could reach them.
  * Money-clean. It stops at "ready to disburse". It creates NO disbursement;
    no money is ever recorded as moved by this fixture.

What it creates in the Proximate tenant:

  - 2 fixture endorsers (rep 90, COI-clean, distinct localities) so the
    partner's trust floor is genuinely met — not faked.
  - 1 partner "QA Fixture Partner — Ready to Disburse", status dd_clear, with
    a verified disbursement method (so preflight returns zero blockers).
  - 1 round "QA Fixture Round — Happy Path" (active).
  - 1 participant row at stage 'bank_verified' (== ready to disburse).
  - 1 award (decision 'awarded', $50 approved) + 1 contract (status
    'completed'). No disbursement.

Usage:
  py -3 seed_proximate_happy_path.py           # local / isolated DB
  railway ssh --service web -- python seed_proximate_happy_path.py   # PROD

Exit 0 iff the partner reached dd_clear AND preflight-readiness holds
(verified method present). A non-zero exit means the fixture did NOT reach a
releasable state — it never silently ships a half-ready fixture.
"""

import json as _json
import secrets
import sys
from datetime import datetime, timezone, timedelta

from app import create_app
from app.extensions import db
from app.models import (
    Network, User, Endorser, ProximatePartner, Endorsement,
    FinancialServiceProvider, PartnerDisbursementMethod,
    Organization,
    ProximateRound, ProximateRoundParticipant,
    ProximateAward, ProximateContract,
)
from werkzeug.security import generate_password_hash

app = create_app()

# --- Stable marker names. "QA Fixture" trips the console TEST badge regex. ---
PARTNER_NAME = "QA Fixture Partner — Ready to Disburse"
PARTNER_NAME_AR = "شريك اختبار الجودة — جاهز للصرف"
ROUND_TITLE = "QA Fixture Round — Happy Path"
FSP_NAME = "QA Fixture FSP — Test Bank"
APPROVED_USD = 50.0

# Two fixture endorsers. Distinct localities (and none == the partner's) so
# the COI auto-check passes cleanly and the trust floor is genuinely met.
ENDORSERS = [
    {"email": "qa.fixture.endorser1@proximate.test", "name": "QA Fixture Endorser One",
     "locality": "Khartoum", "village_name": "Bahri", "family_name": "TestOne",
     "employer": "QA Fixture Org A", "reputation_score": 90},
    {"email": "qa.fixture.endorser2@proximate.test", "name": "QA Fixture Endorser Two",
     "locality": "Port Sudan", "village_name": "Deim", "family_name": "TestTwo",
     "employer": "QA Fixture Org B", "reputation_score": 90},
]
PARTNER_LOCALITY = "Kassala"  # distinct from both endorser localities


def _now():
    return datetime.now(timezone.utc)


def run():
    with app.app_context():
        net = Network.query.filter_by(slug="proximate").first()
        if not net:
            print("ERROR: proximate Network row not found. Boot the app once "
                  "to bootstrap the tenant, then re-run.")
            return 2
        print(f"Seeding permanent happy-path fixture into network_id={net.id} ...")

        # --- 1. Fixture endorsers (users + Endorser rows) ------------------
        endorsers = []
        for f in ENDORSERS:
            u = User.query.filter_by(email=f["email"]).first()
            if not u:
                u = User(
                    email=f["email"],
                    password_hash=generate_password_hash(secrets.token_urlsafe(24)),
                    role="ngo", name=f["name"],
                )
                db.session.add(u)
                db.session.flush()
            e = Endorser.query.filter_by(network_id=net.id, user_id=u.id).first()
            if not e:
                e = Endorser(network_id=net.id, user_id=u.id, status="approved",
                             approved_at=_now())
                db.session.add(e)
            # Reconcile to target (snap back if drifted).
            e.locality = f["locality"]
            e.village_name = f["village_name"]
            e.family_name = f["family_name"]
            e.employer = f["employer"]
            e.country = "SD"
            e.reputation_score = f["reputation_score"]
            e.status = "approved"
            if not e.approved_at:
                e.approved_at = _now()
            if not e.public_token:
                e.public_token = secrets.token_urlsafe(32)
            endorsers.append(e)
            print(f"  endorser ready: {f['email']} (rep={f['reputation_score']})")
        db.session.flush()

        # --- 2. Partner ----------------------------------------------------
        p = ProximatePartner.query.filter_by(
            network_id=net.id, name=PARTNER_NAME,
        ).first()
        if not p:
            p = ProximatePartner(
                network_id=net.id, name=PARTNER_NAME, name_ar=PARTNER_NAME_AR,
                locality=PARTNER_LOCALITY, country="SD",
                bank_account_holder_name="QA Fixture Partner",
                bank_name="QA Fixture FSP — Test Bank",
                bank_account_number="SD" + "9" * 12,
                status="nominated",
            )
            db.session.add(p)
            db.session.flush()
        else:
            p.name_ar = PARTNER_NAME_AR
            p.locality = PARTNER_LOCALITY
        # Reset endorsements to target shape (only this fixture partner's rows).
        Endorsement.query.filter_by(partner_id=p.id).delete()
        db.session.flush()

        # --- 3. Two COI-clean endorsements --------------------------------
        for e in endorsers:
            signals = Endorsement.compute_coi_signals(partner=p, endorser=e)
            en = Endorsement(
                partner_id=p.id, endorser_id=e.id,
                q1_real=True, q2_trust=True, q3_accept_aid=True,
                coi_check_passed=(not signals),
                submitted_at=_now() - timedelta(days=1),
            )
            en.set_coi_signals(signals)
            db.session.add(en)
        db.session.flush()

        # --- 4. Bank-verify + flip to dd_clear via the model's own gate ----
        p.bank_verified_at = _now() - timedelta(hours=12)
        db.session.flush()
        floor = p.trust_floor_signals()
        if not floor.get("ready_for_dd_clear"):
            db.session.rollback()
            print("ERROR: fixture partner did NOT meet the trust floor — "
                  f"signals={floor}. Fixture NOT shipped (no false 'cleared').")
            return 1
        p.status = "dd_clear"
        p.trust_tier = "tier_1_relational"
        p.dd_cleared_at = _now() - timedelta(hours=6)
        print(f"  partner ready: {PARTNER_NAME} -> dd_clear (tier={p.trust_tier})")

        # --- 5. FSP + verified disbursement method -------------------------
        fsp = FinancialServiceProvider.query.filter_by(
            network_id=net.id, name=FSP_NAME,
        ).first()
        if not fsp:
            fsp = FinancialServiceProvider(
                network_id=net.id, name=FSP_NAME, name_ar="بنك اختبار الجودة",
                kind="bank", country="SD", locality=PARTNER_LOCALITY,
                notes="QA fixture FSP — not a real institution.", is_active=True,
            )
            db.session.add(fsp)
            db.session.flush()
        else:
            fsp.is_active = True
        method = PartnerDisbursementMethod.query.filter_by(
            partner_id=p.id, fsp_id=fsp.id,
        ).first()
        if not method:
            method = PartnerDisbursementMethod(
                partner_id=p.id, fsp_id=fsp.id,
                identifier_json=_json.dumps(
                    {"account_number": "SD" + "9" * 12,
                     "holder_name": "QA Fixture Partner"}),
                status="verified", verified_at=_now() - timedelta(hours=6),
            )
            db.session.add(method)
        else:
            method.status = "verified"
            method.verified_at = _now() - timedelta(hours=6)
        db.session.flush()
        print(f"  disbursement method ready: verified via {FSP_NAME}")

        # --- 6. Round + participant (stage bank_verified = ready to pay) ---
        # A round needs a drafter. Prefer the seeded OB seat; fall back to the
        # fixture endorser's own user so this never depends on the demo seed.
        drafter = User.query.filter_by(email="ob@proximate.org").first()
        drafter_id = drafter.id if drafter else endorsers[0].user_id
        rnd = ProximateRound.query.filter_by(
            network_id=net.id, title=ROUND_TITLE,
        ).first()
        if not rnd:
            rnd = ProximateRound(
                network_id=net.id, title=ROUND_TITLE,
                trigger_type="programme",
                trigger_summary=("Permanent QA happy-path fixture. Awarded + "
                                 "contracted + ready to disburse; no money moved. "
                                 "Safe to disburse-dry-run against; never a real "
                                 "round."),
                target_country="SD",
                drafted_by_user_id=drafter_id,
                status="active",
            )
            db.session.add(rnd)
            db.session.flush()
        else:
            rnd.status = "active"

        part = ProximateRoundParticipant.query.filter_by(
            round_id=rnd.id, partner_id=p.id,
        ).first()
        if not part:
            part = ProximateRoundParticipant(round_id=rnd.id, partner_id=p.id)
            db.session.add(part)
        part.stage = "bank_verified"  # ready to disburse
        db.session.flush()
        print(f"  round ready: {ROUND_TITLE} (active); participant @ bank_verified")

        # --- 7. Award (awarded, $50) --------------------------------------
        award = ProximateAward.query.filter_by(
            round_id=rnd.id, partner_id=p.id,
        ).first()
        if not award:
            award = ProximateAward(network_id=net.id, round_id=rnd.id,
                                   partner_id=p.id)
            db.session.add(award)
        award.decision = "awarded"
        award.approved_amount_usd = APPROVED_USD
        award.recommended_amount_usd = APPROVED_USD
        award.currency = "USD"
        if not award.decided_at:
            award.decided_at = _now() - timedelta(hours=5)
        db.session.flush()

        # --- 8. Contract (completed) --------------------------------------
        contract = ProximateContract.query.filter_by(award_id=award.id).first()
        if not contract:
            contract = ProximateContract(
                network_id=net.id, award_id=award.id, partner_id=p.id,
                round_id=rnd.id,
            )
            db.session.add(contract)
        contract.official_name_en = "QA Fixture Partner"
        contract.official_name_ar = PARTNER_NAME_AR
        contract.approved_amount_usd = APPROVED_USD
        contract.status = "completed"
        if not contract.partner_signed_at:
            contract.partner_signed_at = _now() - timedelta(hours=4)
        if hasattr(contract, "completed_at") and not contract.completed_at:
            contract.completed_at = _now() - timedelta(hours=4)
        print(f"  award + contract ready: ${APPROVED_USD:.0f} awarded, "
              f"contract completed. NO disbursement created.")

        db.session.commit()

        # --- Self-check: the fixture MUST be in a releasable state ---------
        p2 = ProximatePartner.query.get(p.id)
        method_ok = PartnerDisbursementMethod.query.filter_by(
            partner_id=p.id, status="verified",
        ).count() >= 1
        releasable = (p2.status == "dd_clear" and method_ok
                      and p2.trust_floor_signals().get("ready_for_dd_clear"))
        print("\n" + "=" * 64)
        print(f"Fixture partner_id={p.id}  round_id={rnd.id}  award_id={award.id}")
        print(f"  status={p2.status}  verified_method={method_ok}  "
              f"releasable={releasable}")
        print("=" * 64)
        if not releasable:
            print("ERROR: fixture is not in a releasable state.")
            return 1
        print("OK — permanent happy-path fixture is ready to disburse "
              "(no money moved).")
        return 0


if __name__ == "__main__":
    sys.exit(run())
