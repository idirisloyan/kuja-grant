"""Proximate Fund demo fixtures — Phase 630 (June 2026).

Standalone, idempotent. Re-run any time to refresh the Proximate
demo state without touching the main Kuja/NEAR seed.

What it seeds:

  6 endorsers — bound to existing Kuja test users (admin + 5 NGO
    leads) so the Adeso team can log in as any of them and start
    endorsing. COI signals (locality, village, family_name, employer)
    are varied so the auto-COI check has both clean and flagged
    paths to exercise.

  8 partners across 3 Sudan localities (Gedaref, Sennar, Khartoum) —
    informal groups in plausible Sudan-pilot configurations. Status
    distribution:
      - 2 nominated, 0 endorsements (the inbox starts here)
      - 2 nominated, 1 valid endorsement (waiting on second)
      - 1 endorsements_open, 1 COI-flagged endorsement (doesn't count)
      - 1 dd_pending, 2 valid endorsements but bank not yet verified
      - 2 dd_clear, 2 valid endorsements + bank verified — Tier 1 ready

  ~10 endorsement rows distributed across the partners, with the
    COI auto-check populated as if it had run live.

Usage:
  py -3 seed_proximate.py

Idempotency: if a fixture partner with the same `name` already
exists in the Proximate tenant, it is reused (its endorsements get
topped up to the target state). Endorsers re-use existing rows.
This is the same pattern Phase 198's UAT fixture cron uses on the
adeso-pmo-v2 side — marker-row recognition + state reconciliation.
"""

from datetime import datetime, timezone, timedelta

from app import create_app
from app.extensions import db
from app.models import (
    Network, User, Endorser, ProximatePartner, Endorsement,
    FinancialServiceProvider, Organization, NetworkMembership,
    ProximateDonor,
)
from werkzeug.security import generate_password_hash

app = create_app()


# ---- Fixture definitions ----------------------------------------------

# Each endorser maps to an existing user. The COI fields are what the
# auto-check compares against partner fields at submit time.
ENDORSER_FIXTURES = [
    {
        'email': 'admin@kuja.org',
        'locality': 'Khartoum', 'village_name': 'Omdurman',
        'family_name': 'Yusuf', 'employer': 'Adeso',
        'reputation_score': 85,
    },
    {
        'email': 'fatima@amani.org',
        'locality': 'Gedaref', 'village_name': 'Doka',
        'family_name': 'Halawa', 'employer': 'Amani Trust',
        'reputation_score': 80,
    },
    {
        'email': 'ahmed@salamrelief.org',
        'locality': 'Khartoum', 'village_name': 'Bahri',
        'family_name': 'Salim', 'employer': 'Salam Relief',
        'reputation_score': 78,
    },
    {
        'email': 'aisha@sahelwomen.org',
        'locality': 'Sennar', 'village_name': 'Sennar Town',
        'family_name': 'Mohamed', 'employer': 'Sahel Women',
        'reputation_score': 82,
    },
    {
        'email': 'peter@hopebridges.org',
        'locality': 'Gedaref', 'village_name': 'Gallabat',
        'family_name': 'Kuol', 'employer': 'Hope Bridges',
        'reputation_score': 76,
    },
    {
        'email': 'thandi@ubuntu.org',
        'locality': 'Khartoum', 'village_name': 'Khartoum-2',
        'family_name': 'Ngoma', 'employer': 'Ubuntu Solidarity',
        'reputation_score': 80,
    },
]


# Partner fixtures + which endorsements they receive. The
# `endorsement_target` is a list of (endorser_email, q1, q2, q3) tuples.
# The seed script picks the partner status based on `target_status`:
#   - 'nominated': no endorsements, no bank verify
#   - 'endorsements_open_pending': 1 valid endorsement
#   - 'endorsements_open_coi': 1 endorsement, COI flagged
#   - 'dd_pending': 2 valid endorsements, no bank verify yet
#   - 'dd_clear': 2 valid endorsements + bank verified, status flipped

PARTNER_FIXTURES = [
    # --- nominated, no endorsements yet (top of inbox) ---
    {
        'name': 'New Hope Family Network',
        'name_ar': 'شبكة الأمل الجديد العائلية',
        'locality': 'Khartoum',
        'bank_account_holder_name': 'New Hope Family Network',
        'bank_name': 'Bank of Khartoum',
        'target_status': 'nominated',
        'endorsement_target': [],
    },
    {
        'name': 'River Bend Aid Circle',
        'name_ar': 'حلقة عون منحنى النهر',
        'locality': 'Sennar',
        'bank_account_holder_name': 'River Bend Aid Circle',
        'bank_name': 'Faisal Islamic Bank',
        'target_status': 'nominated',
        'endorsement_target': [],
    },

    # --- 1 valid endorsement, waiting for second ---
    {
        'name': 'Gedaref Mothers Co-op',
        'name_ar': 'تعاونية أمهات القضارف',
        'locality': 'Gedaref',
        'bank_account_holder_name': 'Gedaref Mothers Co-op',
        'bank_name': 'Agricultural Bank of Sudan',
        'target_status': 'endorsements_open_pending',
        'endorsement_target': [
            # admin from Khartoum — no COI with Gedaref partner
            ('admin@kuja.org', True, True, True),
        ],
    },
    {
        'name': 'Sennar Riverside Aid',
        'name_ar': 'إعانة ضفاف سنار',
        'locality': 'Sennar',
        'bank_account_holder_name': 'Sennar Riverside Aid',
        'bank_name': 'Bank of Khartoum',
        'target_status': 'endorsements_open_pending',
        'endorsement_target': [
            ('admin@kuja.org', True, True, True),
        ],
    },

    # --- 1 COI-flagged endorsement (doesn't count) ---
    {
        'name': 'Halawa Relief Block',
        'name_ar': 'كتلة الحلوة الإغاثية',
        'locality': 'Gedaref',
        'bank_account_holder_name': 'Halawa Relief Block',
        'bank_name': 'Agricultural Bank of Sudan',
        'target_status': 'endorsements_open_coi',
        'endorsement_target': [
            # fatima.family_name='Halawa' matches partner name → COI flag
            ('fatima@amani.org', True, True, True),
        ],
    },

    # --- 2 valid endorsements, bank not yet verified ---
    {
        'name': 'East Gedaref Volunteers',
        'name_ar': 'متطوعو شرق القضارف',
        'locality': 'Gedaref',
        'bank_account_holder_name': 'East Gedaref Volunteers',
        'bank_name': 'Bank of Khartoum',
        'target_status': 'dd_pending',
        'endorsement_target': [
            ('admin@kuja.org', True, True, True),    # Khartoum, no COI
            ('thandi@ubuntu.org', True, True, True), # Khartoum, no COI
        ],
    },

    # --- Tier 1 cleared: 2 valid endorsements + bank verified ---
    {
        'name': 'Sennar Children Outreach',
        'name_ar': 'تواصل أطفال سنار',
        'locality': 'Sennar',
        'bank_account_holder_name': 'Sennar Children Outreach',
        'bank_name': 'Faisal Islamic Bank',
        'target_status': 'dd_clear',
        'endorsement_target': [
            ('admin@kuja.org', True, True, True),
            ('peter@hopebridges.org', True, True, True),  # Gedaref, no COI
        ],
    },
    {
        'name': 'Khartoum Sisters Mutual Aid',
        'name_ar': 'العون المتبادل لأخوات الخرطوم',
        'locality': 'Khartoum',
        'bank_account_holder_name': 'Khartoum Sisters Mutual Aid',
        'bank_name': 'Bank of Khartoum',
        'target_status': 'dd_clear',
        'endorsement_target': [
            ('fatima@amani.org', True, True, True),   # Gedaref, no COI
            ('peter@hopebridges.org', True, True, True),  # Gedaref, no COI
        ],
    },
]


def run():
    with app.app_context():
        proximate = Network.query.filter_by(slug='proximate').first()
        if not proximate:
            print("ERROR: proximate Network row not found. Run the main app "
                  "once to trigger the bootstrap seed, then re-run this.")
            return

        print(f"Seeding Proximate fixtures into network_id={proximate.id}...")

        # --- Endorsers --------------------------------------------------
        endorser_by_email = {}
        for f in ENDORSER_FIXTURES:
            user = User.query.filter_by(email=f['email']).first()
            if not user:
                print(f"  WARN: user {f['email']} not found, skipping")
                continue
            e = Endorser.query.filter_by(
                network_id=proximate.id, user_id=user.id,
            ).first()
            if not e:
                e = Endorser(
                    network_id=proximate.id, user_id=user.id,
                    status='approved',
                    approved_at=datetime.now(timezone.utc),
                )
                db.session.add(e)
                action = 'created'
            else:
                action = 'updated'
            # Reconcile COI fields + reputation to target (so re-runs
            # snap demo state back even if it drifted).
            e.locality = f['locality']
            e.village_name = f['village_name']
            e.family_name = f['family_name']
            e.employer = f['employer']
            e.country = 'SD'
            e.reputation_score = f['reputation_score']
            e.status = 'approved'
            if not e.approved_at:
                e.approved_at = datetime.now(timezone.utc)
            endorser_by_email[f['email']] = e
            print(f"  endorser {action}: {f['email']} ({f['locality']}, rep={f['reputation_score']})")

        db.session.flush()

        # --- Partners + endorsements -----------------------------------
        for f in PARTNER_FIXTURES:
            p = ProximatePartner.query.filter_by(
                network_id=proximate.id, name=f['name'],
            ).first()
            if not p:
                p = ProximatePartner(
                    network_id=proximate.id,
                    name=f['name'], name_ar=f['name_ar'],
                    locality=f['locality'], country='SD',
                    bank_account_holder_name=f['bank_account_holder_name'],
                    bank_name=f['bank_name'],
                    bank_account_number='SD' + str(hash(f['name']) % 10**12).zfill(12),
                    status='nominated',
                )
                # Find admin user for the nominated_by attribution
                admin = User.query.filter_by(email='admin@kuja.org').first()
                if admin:
                    p.nominated_by_user_id = admin.id
                db.session.add(p)
                action = 'created'
            else:
                action = 'updated'
                # Wipe any prior endorsements so we snap to the target shape.
                Endorsement.query.filter_by(partner_id=p.id).delete()
                p.bank_verified_at = None
                p.dd_cleared_at = None
                p.trust_tier = None
                p.status = 'nominated'

            db.session.flush()  # ensure p.id exists

            # Replay each endorsement through the model's own COI logic
            for endorser_email, q1, q2, q3 in f['endorsement_target']:
                endorser = endorser_by_email.get(endorser_email)
                if not endorser:
                    continue
                signals = Endorsement.compute_coi_signals(
                    partner=p, endorser=endorser,
                )
                en = Endorsement(
                    partner_id=p.id, endorser_id=endorser.id,
                    q1_real=q1, q2_trust=q2, q3_accept_aid=q3,
                    coi_check_passed=(not signals),
                    submitted_at=datetime.now(timezone.utc) - timedelta(days=1),
                )
                en.set_coi_signals(signals)
                db.session.add(en)
                endorser.endorsements_count = (endorser.endorsements_count or 0) + 1

            # Apply target status — bank verification + status transition
            target = f['target_status']
            if target == 'dd_clear':
                p.bank_verified_at = datetime.now(timezone.utc) - timedelta(hours=12)
                # Let trust_floor_signals compute the actual readiness
                db.session.flush()
                floor = p.trust_floor_signals()
                if floor['ready_for_dd_clear']:
                    p.status = 'dd_clear'
                    p.trust_tier = 'tier_1_relational'
                    p.dd_cleared_at = datetime.now(timezone.utc) - timedelta(hours=6)
                else:
                    # Defensive: if for some reason the floor isn't met
                    # (shouldn't happen with our fixture data) leave it
                    # at dd_pending so the demo doesn't claim cleared.
                    p.status = 'dd_pending'
            elif target == 'dd_pending':
                # Bank not yet verified; status transitions to dd_pending
                # when 2 valid endorsements land.
                p.status = 'dd_pending'
            elif target in ('endorsements_open_pending', 'endorsements_open_coi'):
                p.status = 'endorsements_open'
            # 'nominated' → status already 'nominated' from default

            print(f"  partner {action}: {f['name']} -> {p.status}"
                  f" (endorsements={len(f['endorsement_target'])},"
                  f" tier={p.trust_tier})")

        # --- FSPs (Phase 639) ------------------------------------------
        # 4 plausible Sudan FSPs — 1 bank, 2 hawala brokers, 1 mobile-
        # money MNO. Idempotent via (network_id, name) unique constraint.
        fsp_fixtures = [
            {
                'name': 'Bank of Khartoum',
                'name_ar': 'بنك الخرطوم',
                'kind': 'bank',
                'locality': 'Khartoum',
                'notes': 'Largest commercial bank in Sudan. Has a branch network across Khartoum, Gedaref, and Port Sudan.',
            },
            {
                'name': 'Gedaref Souq Hawala #4',
                'name_ar': 'حوالة سوق القضارف رقم ٤',
                'kind': 'hawala',
                'locality': 'Gedaref',
                'notes': 'Trusted broker operating from the Gedaref Souq. Settlements 24h; can receive in Khartoum via partner office.',
            },
            {
                'name': 'Port Sudan Marine Hawala',
                'name_ar': 'حوالة بورتسودان البحرية',
                'kind': 'hawala',
                'locality': 'Port Sudan',
                'notes': 'Coastal broker with reach into Eritrean and Saudi corridors. Useful when Khartoum banking is offline.',
            },
            {
                'name': 'Sudani Mobile Money',
                'name_ar': 'سوداني للمحفظة',
                'kind': 'mobile_money',
                'locality': 'national',
                'notes': 'Sudatel mobile-money wallet. Works on basic phones via USSD. Daily limit ~SDG 50k.',
            },
        ]
        for f in fsp_fixtures:
            existing = FinancialServiceProvider.query.filter_by(
                network_id=proximate.id, name=f['name'],
            ).first()
            if existing:
                # Reconcile keys that might drift
                existing.name_ar = f['name_ar']
                existing.kind = f['kind']
                existing.locality = f['locality']
                existing.notes = f['notes']
                existing.is_active = True
                action = 'updated'
            else:
                db.session.add(FinancialServiceProvider(
                    network_id=proximate.id,
                    name=f['name'], name_ar=f['name_ar'], kind=f['kind'],
                    country='SD', locality=f['locality'], notes=f['notes'],
                    is_active=True,
                ))
                action = 'created'
            print(f"  fsp {action}: {f['name']} ({f['kind']})")

        # --- OB seat (Phase 648) ---------------------------------------
        # The @ob_required decorator (app/utils/network.py:193) checks for
        # an *active* NetworkMembership with `is_oversight_body=True`
        # against the user's org. Platform admin role does NOT bypass
        # this (Phase 114 retired the shortcut). Without a real OB seat,
        # the team's UAT runs into a 403 on every secretariat action.
        #
        # Seed a dedicated OB org + user so the team has a one-login way
        # to exercise the full happy path:
        #   ob@proximate.org / pass123
        OB_EMAIL = 'ob@proximate.org'
        OB_ORG_NAME = 'Proximate Oversight Body'

        org = Organization.query.filter_by(name=OB_ORG_NAME).first()
        if not org:
            org = Organization(
                name=OB_ORG_NAME,
                org_type='ngo',
                country='SD',
            )
            db.session.add(org)
            db.session.flush()
            print(f"  ob org created: {OB_ORG_NAME}")

        ob_user = User.query.filter_by(email=OB_EMAIL).first()
        if not ob_user:
            ob_user = User(
                email=OB_EMAIL,
                password_hash=generate_password_hash('pass123'),
                role='ngo',
                name='Proximate OB Seat',
                org_id=org.id,
            )
            db.session.add(ob_user)
            db.session.flush()
            print(f"  ob user created: {OB_EMAIL}")
        elif ob_user.org_id != org.id:
            ob_user.org_id = org.id
            print(f"  ob user reattached to OB org")

        membership = NetworkMembership.query.filter_by(
            network_id=proximate.id, org_id=org.id,
        ).first()
        if not membership:
            membership = NetworkMembership(
                network_id=proximate.id,
                org_id=org.id,
                status='active',
                member_tier='member',
                is_oversight_body=True,
                joined_at=datetime.now(timezone.utc),
            )
            db.session.add(membership)
            print(f"  ob membership created (is_oversight_body=True)")
        else:
            # Reconcile in case status/flag drifted
            membership.status = 'active'
            membership.is_oversight_body = True
            if membership.joined_at is None:
                membership.joined_at = datetime.now(timezone.utc)

        # Second OB seat — without one, the cosign happy-path for the
        # $10k+ threshold ladder (Phase 662) cannot be exercised end-to-end,
        # because the COI guard blocks the sender from cosigning their own
        # disbursement. Same email pattern; same org so the membership
        # already covers both.
        OB2_EMAIL = 'ob2@proximate.org'
        ob2_user = User.query.filter_by(email=OB2_EMAIL).first()
        if not ob2_user:
            ob2_user = User(
                email=OB2_EMAIL,
                password_hash=generate_password_hash('pass123'),
                role='ngo',
                name='Proximate OB Cosigner',
                org_id=org.id,
            )
            db.session.add(ob2_user)
            print(f"  ob2 user created: {OB2_EMAIL}")
        elif ob2_user.org_id != org.id:
            ob2_user.org_id = org.id
            print(f"  ob2 user reattached to OB org")

        # Phase 681 — seed a Proximate donor for portal verification.
        # Idempotent: if donor1 user + ProximateDonor row exist they
        # are reused. The donor's org is a separate "Demo Donor" org
        # so the user-org wiring matches the real-world pattern.
        DONOR_EMAIL = 'donor1@proximate.org'
        donor_user = User.query.filter_by(email=DONOR_EMAIL).first()
        donor_org = Organization.query.filter_by(
            name='Demo Donor Foundation',
        ).first()
        if not donor_org:
            donor_org = Organization(
                name='Demo Donor Foundation',
                organization_type='donor',
                country='Sudan',
            )
            db.session.add(donor_org)
            db.session.flush()
            print(f"  donor org created: Demo Donor Foundation")
        if not donor_user:
            donor_user = User(
                email=DONOR_EMAIL,
                password_hash=generate_password_hash('pass123'),
                role='ngo',
                name='Proximate Donor Demo',
                org_id=donor_org.id,
            )
            db.session.add(donor_user)
            db.session.flush()
            print(f"  donor user created: {DONOR_EMAIL}")
        elif donor_user.org_id != donor_org.id:
            donor_user.org_id = donor_org.id

        donor_row = ProximateDonor.query.filter_by(
            network_id=proximate.id,
            primary_user_id=donor_user.id,
        ).first()
        if not donor_row:
            donor_row = ProximateDonor(
                network_id=proximate.id,
                org_id=donor_org.id,
                primary_user_id=donor_user.id,
                display_name='Demo Donor Foundation',
                contact_email=DONOR_EMAIL,
                auto_email_closing_pack=True,
                registered_by_user_id=ob_user.id,
            )
            db.session.add(donor_row)
            print(f"  donor row created for {DONOR_EMAIL}")

        db.session.commit()
        print()
        print(f"Done. Proximate now has:")
        print(f"  Endorsers : {Endorser.query.filter_by(network_id=proximate.id).count()}")
        print(f"  Partners  : {ProximatePartner.query.filter_by(network_id=proximate.id).count()}")
        print(f"  Endorsements: {Endorsement.query.join(ProximatePartner).filter(ProximatePartner.network_id == proximate.id).count()}")
        print()
        print(f"  Demo URLs:")
        print(f"    /proximate/endorse           — endorser inbox")
        print(f"    /proximate/endorse/<id>      — wizard for a partner")
        print()
        print(f"  Login as any of these to endorse:")
        for f in ENDORSER_FIXTURES:
            print(f"    {f['email']}  (pass123)")


if __name__ == '__main__':
    run()
