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
    ProximateDonor, ProximateRound, ProximateRoundParticipant,
    ProximateGrant, ProximateGrantAllocation, ProximateGrantReport,
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
    # Phase 714 — three additional endorsers so the pool feels real
    # for demos and the independence rule on verifier has genuine
    # rotation options.
    {
        'email': 'sarah@globalhealth.org',
        'locality': 'Kassala', 'village_name': 'Kassala Town',
        'family_name': 'Adam', 'employer': 'Global Health',
        'reputation_score': 74,
    },
    {
        'email': 'james@reviewer.org',
        'locality': 'Port Sudan', 'village_name': 'Port Sudan Central',
        'family_name': 'Adan', 'employer': 'Reviewer Independent',
        'reputation_score': 88,
    },
    {
        'email': 'grace@childrenfirst.org',
        'locality': 'Wad Madani', 'village_name': 'Wad Madani East',
        'family_name': 'Barre', 'employer': 'Children First',
        'reputation_score': 79,
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
    # Phase 714 — three additional partners for round-roster demos
    {
        'name': 'Kassala East Farmers Circle',
        'name_ar': 'حلقة مزارعي شرق كسلا',
        'locality': 'Kassala',
        'bank_account_holder_name': 'Kassala East Farmers Circle',
        'bank_name': 'Agricultural Bank of Sudan',
        'target_status': 'dd_clear',
        'endorsement_target': [
            ('sarah@globalhealth.org', True, True, True),
            ('grace@childrenfirst.org', True, True, True),
        ],
    },
    {
        'name': 'Port Sudan Fisherfolk Union',
        'name_ar': 'اتحاد صيادي بورسودان',
        'locality': 'Port Sudan',
        'bank_account_holder_name': 'Port Sudan Fisherfolk Union',
        'bank_name': 'Bank of Khartoum',
        'target_status': 'dd_clear',
        'endorsement_target': [
            ('admin@kuja.org', True, True, True),
            ('sarah@globalhealth.org', True, True, True),
        ],
    },
    {
        'name': 'Wad Madani Youth Solidarity',
        'name_ar': 'تضامن شباب ود مدني',
        'locality': 'Wad Madani',
        'bank_account_holder_name': 'Wad Madani Youth Solidarity',
        'bank_name': 'Faisal Islamic Bank',
        'target_status': 'endorsements_open_pending',
        'endorsement_target': [
            ('grace@childrenfirst.org', True, True, True),
        ],
    },
]


# Phase 714 — additional donors so the donor picker on new-round has
# a real registry to choose from and donor portfolios exercise the
# multi-donor pattern. Each donor gets an org + a login user + a
# ProximateDonor row. Login: pass123 for all.
EXTRA_DONORS = [
    {
        'email': 'donor2@sudanemergency.org',
        'org_name': 'Sudan Emergency Trust',
        'user_name': 'Sudan Emergency Trust Ops',
        'display_name': 'Sudan Emergency Trust',
    },
    {
        'email': 'donor3@adesorapid.org',
        'org_name': 'Adeso Rapid Response Fund',
        'user_name': 'Adeso Rapid Response Ops',
        'display_name': 'Adeso Rapid Response Fund',
    },
    {
        'email': 'donor4@ihfsudan.org',
        'org_name': 'IHF Sudan Country Envelope',
        'user_name': 'IHF Sudan Envelope Ops',
        'display_name': 'IHF Sudan Country Envelope',
    },
    {
        'email': 'donor5@bilateralx.org',
        'org_name': 'Bilateral Fund X',
        'user_name': 'Bilateral Fund X Ops',
        'display_name': 'Bilateral Fund X',
    },
]


# Phase 714 — 3 seeded rounds spanning the round lifecycle. Each round
# names its donor by display_name (resolved to donor_id at seed time)
# and lists its partner roster by partner name (resolved to partner_id).
# `stages` per participant lets the demo show the roster mid-flight
# without needing to run disbursements to prove state.
ROUND_FIXTURES = [
    {
        # closed round — retrospective view; all partners disbursed +
        # attested, some verified. Good for the donor portal demo.
        'title': 'Kassala Rapid Cash — Round 1',
        'title_ar': 'كسلا الطوارئ النقدية — الجولة الأولى',
        'trigger_type': 'disaster',
        'trigger_summary': 'Flash flooding across Kassala in April 2026 displaced ~18k households. This round covered emergency cash to informal groups already active on-site.',
        'donor_display_name': 'Sudan Emergency Trust',
        'envelope_usd': 45000.0,
        'expected_duration_days': 60,
        'target_country': 'SD',
        'target_region': 'Kassala',
        'status': 'closed',
        'closing_summary': 'All partners disbursed on time; 2 of 3 outcomes verified by independent verifier; 1 outcome pending third-party sign-off but partner attestation received.',
        'roster': [
            ('Kassala East Farmers Circle', 'verified'),
            ('Port Sudan Fisherfolk Union', 'verified'),
            ('Sennar Children Outreach', 'attested'),
        ],
    },
    {
        # active round — partners in mid-flight, some disbursed, one
        # planned. This is where OB spends most of the working day.
        'title': 'Gedaref Winterisation — Round 2',
        'title_ar': 'التدفئة الشتوية في القضارف — الجولة الثانية',
        'trigger_type': 'programme',
        'trigger_summary': 'Winter shelter + heating kits for informal groups in Gedaref who have absorbed IDPs from Khartoum State. Multi-tranche release.',
        'donor_display_name': 'Adeso Rapid Response Fund',
        'envelope_usd': 32000.0,
        'expected_duration_days': 90,
        'target_country': 'SD',
        'target_region': 'Gedaref',
        'status': 'active',
        'roster': [
            ('Khartoum Sisters Mutual Aid', 'disbursed'),
            ('East Gedaref Volunteers', 'bank_verified'),
            ('Gedaref Mothers Co-op', 'endorsement_open'),
            ('New Hope Family Network', 'planned'),
        ],
    },
    {
        # draft round — OB is planning; roster staged but signatures
        # not yet collected. Good for showing the "before it starts"
        # experience.
        'title': 'Wad Madani Youth Programme — Round 3 (draft)',
        'title_ar': 'برنامج شباب ود مدني — الجولة الثالثة (مسودة)',
        'trigger_type': 'donor',
        'trigger_summary': 'Adeso-donor co-designed programme for youth-led informal groups in Wad Madani. Draft envelope pending Fiduciary Board sign-off.',
        'donor_display_name': 'IHF Sudan Country Envelope',
        'envelope_usd': 22000.0,
        'expected_duration_days': 120,
        'target_country': 'SD',
        'target_region': 'Wad Madani',
        'status': 'draft',
        'roster': [
            ('Wad Madani Youth Solidarity', 'planned'),
            ('Sennar Riverside Aid', 'planned'),
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
            # Phase 700 — mint no-login portal token for seeded endorsers.
            if not e.public_token:
                import secrets
                e.public_token = secrets.token_urlsafe(32)
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
                org_type='donor',
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

        # Phase 714 — extra donors so the round donor picker has a
        # realistic registry to render.
        donor_display_to_row = {}
        # Seed the existing 'Demo Donor Foundation' into the lookup.
        first_donor = ProximateDonor.query.filter_by(
            network_id=proximate.id, primary_user_id=donor_user.id,
        ).first()
        if first_donor:
            donor_display_to_row[first_donor.display_name] = first_donor

        for d in EXTRA_DONORS:
            org = Organization.query.filter_by(name=d['org_name']).first()
            if not org:
                org = Organization(
                    name=d['org_name'], org_type='donor', country='Sudan',
                )
                db.session.add(org)
                db.session.flush()
            u = User.query.filter_by(email=d['email']).first()
            if not u:
                u = User(
                    email=d['email'],
                    password_hash=generate_password_hash('pass123'),
                    role='ngo', name=d['user_name'], org_id=org.id,
                )
                db.session.add(u)
                db.session.flush()
                print(f"  extra donor user created: {d['email']}")
            elif u.org_id != org.id:
                u.org_id = org.id
            row = ProximateDonor.query.filter_by(
                network_id=proximate.id, primary_user_id=u.id,
            ).first()
            if not row:
                row = ProximateDonor(
                    network_id=proximate.id, org_id=org.id,
                    primary_user_id=u.id,
                    display_name=d['display_name'],
                    contact_email=d['email'],
                    auto_email_closing_pack=True,
                    registered_by_user_id=ob_user.id,
                )
                db.session.add(row)
                db.session.flush()
                print(f"  extra donor row created: {d['display_name']}")
            donor_display_to_row[d['display_name']] = row

        # Phase 714 — seeded rounds with participant rosters.
        # Idempotent by title. Roster snapshot re-runs snap partner
        # stages back to the fixture value (safe because these are demo
        # rows — production round rosters are OB-managed, never touched
        # by the seed).
        partner_by_name = {
            p.name: p for p in ProximatePartner.query.filter_by(
                network_id=proximate.id,
            ).all()
        }
        for rf in ROUND_FIXTURES:
            round_row = ProximateRound.query.filter_by(
                network_id=proximate.id, title=rf['title'],
            ).first()
            donor_row = donor_display_to_row.get(rf['donor_display_name'])
            if not round_row:
                round_row = ProximateRound(
                    network_id=proximate.id,
                    title=rf['title'],
                    title_ar=rf.get('title_ar'),
                    trigger_type=rf['trigger_type'],
                    trigger_summary=rf['trigger_summary'],
                    donor_id=donor_row.id if donor_row else None,
                    donor_name=rf['donor_display_name'],
                    envelope_usd=rf['envelope_usd'],
                    expected_duration_days=rf['expected_duration_days'],
                    target_country=rf['target_country'],
                    target_region=rf['target_region'],
                    status=rf['status'],
                    drafted_by_user_id=ob_user.id,
                    drafted_at=datetime.now(timezone.utc) - timedelta(days=30),
                    closing_summary=rf.get('closing_summary'),
                )
                if rf['status'] in ('active', 'closed'):
                    round_row.submitted_at = round_row.drafted_at + timedelta(days=1)
                    round_row.activated_at = round_row.drafted_at + timedelta(days=3)
                if rf['status'] == 'closed':
                    round_row.closed_at = round_row.drafted_at + timedelta(days=25)
                db.session.add(round_row)
                db.session.flush()
                print(f"  round created: {rf['title']} [{rf['status']}]")
            else:
                # Reconcile donor link + closing summary so re-runs snap.
                if donor_row:
                    round_row.donor_id = donor_row.id
                    round_row.donor_name = rf['donor_display_name']
                round_row.envelope_usd = rf['envelope_usd']
                round_row.status = rf['status']
                if rf.get('closing_summary'):
                    round_row.closing_summary = rf['closing_summary']

            # Reconcile the roster.
            for partner_name, stage in rf['roster']:
                partner = partner_by_name.get(partner_name)
                if not partner:
                    print(f"    WARN: partner '{partner_name}' not seeded yet, skipping")
                    continue
                existing = ProximateRoundParticipant.query.filter_by(
                    round_id=round_row.id, partner_id=partner.id,
                ).first()
                if not existing:
                    db.session.add(ProximateRoundParticipant(
                        round_id=round_row.id, partner_id=partner.id,
                        stage=stage, added_by_user_id=ob_user.id,
                    ))
                else:
                    existing.stage = stage

        db.session.commit()

        # ------------------------------------------------------------------
        # Phase 721 — Seed Adeso's 3 inbound grants + round allocations.
        # ------------------------------------------------------------------
        import json as _json_seed
        from datetime import date as _date

        # Grant fixtures — the 3 donors funding Proximate Fund.
        # Ordered so we can pair with the first 3 seeded ProximateDonor rows.
        GRANT_FIXTURES = [
            {
                'donor_email': 'donor@proximate.org',
                'title': 'Sudan Localization Fund 2026-2028',
                'donor_grant_ref': 'SLT-2026-0847',
                'amount_committed_usd': 5_000_000,
                'amount_received_usd': 2_100_000,
                'start_date': _date(2026, 1, 15),
                'end_date': _date(2028, 12, 31),
                'reporting_cadence': 'quarterly',
                'restrictions': {
                    'geographies': ['SD'],
                    'sectors': ['cash', 'food', 'shelter'],
                    'purpose': 'Direct cash transfers and localization capacity for Sudanese informal groups.',
                },
                'status': 'active',
                'signed': True,
                'allocate_to_rounds': [
                    ('Gedaref Winterisation', 350_000),
                    ('Wad Madani Youth Solidarity', 180_000),
                ],
                # AI-extracted from the signed PDF. Format mirrors what
                # grant_agreement_unpack_service.py returns.
                'extracted': {
                    'donor': 'Sudan Localization Trust',
                    'agreement_date': '2026-01-15',
                    'total_amount': '$5,000,000 USD',
                    'duration_months': 36,
                    'key_deliverables': [
                        {'title': 'Fund 10+ community-led rounds', 'target': 10, 'unit': 'rounds'},
                        {'title': 'Reach 15,000 households', 'target': 15000, 'unit': 'households'},
                        {'title': 'Quarterly impact narrative', 'target': 12, 'unit': 'reports'},
                        {'title': 'Annual audited financial statement', 'target': 3, 'unit': 'audits'},
                    ],
                    'reporting_requirements': [
                        {'type': 'financial', 'cadence': 'quarterly', 'due_days_after_period': 45},
                        {'type': 'impact_narrative', 'cadence': 'quarterly', 'due_days_after_period': 45},
                        {'type': 'annual_audit', 'cadence': 'annual', 'due_days_after_period': 90},
                    ],
                    'restrictions_verbatim': (
                        "Funds may only be deployed in the Republic of Sudan (\"Territory\") "
                        "for community-led response in the sectors of cash transfers, food "
                        "security, and shelter. No sub-grants to intermediaries."
                    ),
                    'compliance_flags': [
                        'sanctions_screening_required_all_partners',
                        'independent_audit_required_annual',
                        'anti_fraud_hotline_reference_in_reports',
                    ],
                    'extraction_confidence': 0.94,
                },
                'reports_to_seed': [
                    {'type': 'quarterly', 'period_start': _date(2026, 1, 15), 'period_end': _date(2026, 3, 31), 'due_date': _date(2026, 5, 15), 'status': 'accepted'},
                    {'type': 'quarterly', 'period_start': _date(2026, 4, 1), 'period_end': _date(2026, 6, 30), 'due_date': _date(2026, 8, 15), 'status': 'submitted'},
                    {'type': 'quarterly', 'period_start': _date(2026, 7, 1), 'period_end': _date(2026, 9, 30), 'due_date': _date(2026, 11, 15), 'status': 'pending'},
                ],
            },
            {
                'donor_email': 'donor2@proximate.org',
                'title': 'Rapid Emergency Response Sudan',
                'donor_grant_ref': 'GATES-HR-2026-2019',
                'amount_committed_usd': 3_000_000,
                'amount_received_usd': 1_500_000,
                'start_date': _date(2026, 3, 1),
                'end_date': _date(2027, 12, 31),
                'reporting_cadence': 'semi_annual',
                'restrictions': {
                    'geographies': ['SD'],
                    'sectors': ['emergency_cash', 'wash'],
                    'purpose': 'Rapid-onset humanitarian cash response with community-led targeting.',
                },
                'status': 'active',
                'signed': True,
                'allocate_to_rounds': [
                    ('Kassala Rapid Cash', 240_000),
                    ('Wad Madani Youth Solidarity', 120_000),
                ],
                'extracted': {
                    'donor': 'Bill & Melinda Gates Foundation — Humanitarian Response',
                    'agreement_date': '2026-03-01',
                    'total_amount': '$3,000,000 USD',
                    'duration_months': 22,
                    'key_deliverables': [
                        {'title': 'Rapid response capability (< 72h from crisis signal)', 'target': 72, 'unit': 'hours'},
                        {'title': 'Serve 8,000 households in rapid-onset crises', 'target': 8000, 'unit': 'households'},
                        {'title': 'Semi-annual outcome verification', 'target': 4, 'unit': 'reports'},
                    ],
                    'reporting_requirements': [
                        {'type': 'financial', 'cadence': 'semi_annual', 'due_days_after_period': 30},
                        {'type': 'outcome_verification', 'cadence': 'semi_annual', 'due_days_after_period': 60},
                    ],
                    'restrictions_verbatim': (
                        "Funds restricted to emergency cash and WASH interventions in Sudan. "
                        "Response initiation required within 72 hours of a verified crisis signal."
                    ),
                    'compliance_flags': [
                        'sanctions_screening_required_all_partners',
                        '72_hour_response_sla',
                        'third_party_outcome_verification',
                    ],
                    'extraction_confidence': 0.91,
                },
                'reports_to_seed': [
                    {'type': 'semi_annual', 'period_start': _date(2026, 3, 1), 'period_end': _date(2026, 8, 31), 'due_date': _date(2026, 9, 30), 'status': 'submitted'},
                    {'type': 'semi_annual', 'period_start': _date(2026, 9, 1), 'period_end': _date(2027, 2, 28), 'due_date': _date(2027, 3, 30), 'status': 'pending'},
                ],
            },
            {
                'donor_email': 'donor3@proximate.org',
                'title': 'EU Humanitarian Aid — Sudan Localisation Window',
                'donor_grant_ref': 'ECHO/-AF/BUD/2026/91007',
                'amount_committed_usd': 2_000_000,
                'amount_received_usd': 1_000_000,
                'start_date': _date(2026, 4, 1),
                'end_date': _date(2027, 3, 31),
                'reporting_cadence': 'annual',
                'restrictions': {
                    'geographies': ['SD'],
                    'sectors': ['cash', 'protection'],
                    'purpose': 'Support to community-led emergency response in eastern Sudan.',
                },
                'status': 'active',
                'signed': True,
                'allocate_to_rounds': [
                    ('Kassala Rapid Cash', 150_000),
                ],
                'extracted': {
                    'donor': 'European Commission — ECHO Sudan Window',
                    'agreement_date': '2026-04-01',
                    'total_amount': '€1,850,000 EUR (≈ $2M USD)',
                    'duration_months': 12,
                    'key_deliverables': [
                        {'title': 'Cash-based interventions in eastern Sudan', 'target': 1, 'unit': 'programme'},
                        {'title': 'Protection mainstreaming per ECHO DG guidance', 'target': 1, 'unit': 'compliance_certification'},
                        {'title': 'Annual narrative + financial report', 'target': 1, 'unit': 'reports'},
                    ],
                    'reporting_requirements': [
                        {'type': 'interim_narrative', 'cadence': 'semi_annual', 'due_days_after_period': 60},
                        {'type': 'final_narrative_and_financial', 'cadence': 'annual', 'due_days_after_period': 90},
                        {'type': 'audit_certificate', 'cadence': 'final_only', 'due_days_after_period': 120},
                    ],
                    'restrictions_verbatim': (
                        "Actions must comply with the EU Humanitarian Aid Regulation "
                        "(EC 1257/96) and ECHO's Humanitarian Implementation Plan for Sudan. "
                        "Geographic focus on Kassala and Gedaref states."
                    ),
                    'compliance_flags': [
                        'echo_visibility_requirements',
                        'protection_mainstreaming_mandatory',
                        'audit_certificate_required',
                        'eu_procurement_rules_apply',
                    ],
                    'extraction_confidence': 0.88,
                },
                'reports_to_seed': [
                    {'type': 'interim_narrative', 'period_start': _date(2026, 4, 1), 'period_end': _date(2026, 9, 30), 'due_date': _date(2026, 11, 30), 'status': 'drafting'},
                    {'type': 'final_narrative_and_financial', 'period_start': _date(2026, 4, 1), 'period_end': _date(2027, 3, 31), 'due_date': _date(2027, 6, 30), 'status': 'pending'},
                ],
            },
        ]

        # Lookup helpers for donors + rounds by name.
        donors_by_email = {}
        for d in ProximateDonor.query.filter_by(network_id=proximate.id).all():
            if d.contact_email:
                donors_by_email[d.contact_email] = d
        rounds_by_title = {
            r.title: r for r in ProximateRound.query.filter_by(
                network_id=proximate.id,
            ).all()
        }

        grants_created = 0
        allocations_created = 0
        for gf in GRANT_FIXTURES:
            donor = donors_by_email.get(gf['donor_email'])
            if not donor:
                print(f"    WARN: donor '{gf['donor_email']}' not found — skipping grant '{gf['title']}'")
                continue
            existing = ProximateGrant.query.filter_by(
                network_id=proximate.id, donor_grant_ref=gf['donor_grant_ref'],
            ).first()
            if existing:
                grant_row = existing
                # Backfill extracted_json even for pre-existing grants
                # so re-seeding refreshes the AI-extraction demo data.
                if gf.get('extracted') and not grant_row.extracted_json:
                    grant_row.extracted_json = _json_seed.dumps(gf['extracted'])
                    grant_row.extracted_at = datetime.now(timezone.utc)
                    grant_row.extracted_model = 'claude-opus-4-7-seed'
            else:
                grant_row = ProximateGrant(
                    network_id=proximate.id,
                    donor_id=donor.id,
                    donor_name_cache=donor.display_name,
                    title=gf['title'],
                    donor_grant_ref=gf['donor_grant_ref'],
                    amount_committed_usd=gf['amount_committed_usd'],
                    amount_received_usd=gf['amount_received_usd'],
                    currency='USD',
                    start_date=gf['start_date'],
                    end_date=gf['end_date'],
                    reporting_cadence=gf['reporting_cadence'],
                    restrictions_json=_json_seed.dumps(gf['restrictions']),
                    extracted_json=(
                        _json_seed.dumps(gf['extracted'])
                        if gf.get('extracted') else None
                    ),
                    extracted_at=(
                        datetime.now(timezone.utc)
                        if gf.get('extracted') else None
                    ),
                    extracted_model=(
                        'claude-opus-4-7-seed' if gf.get('extracted') else None
                    ),
                    status=gf['status'],
                    signed_at=(
                        datetime.now(timezone.utc) if gf.get('signed') else None
                    ),
                    created_by_user_id=ob_user.id,
                )
                db.session.add(grant_row)
                db.session.flush()
                grants_created += 1

            # Allocations to rounds.
            for round_title, amount in gf.get('allocate_to_rounds', []):
                round_row = rounds_by_title.get(round_title)
                if not round_row:
                    continue
                existing_alloc = ProximateGrantAllocation.query.filter_by(
                    grant_id=grant_row.id, round_id=round_row.id,
                ).first()
                if not existing_alloc:
                    db.session.add(ProximateGrantAllocation(
                        grant_id=grant_row.id,
                        round_id=round_row.id,
                        amount_usd=amount,
                    ))
                    allocations_created += 1

            # Reporting calendar entries. Idempotent by (grant, type,
            # period_start). Populates the calendar so UAT can see the
            # overdue/upcoming/submitted mix on grant detail.
            for rf in gf.get('reports_to_seed', []):
                existing_rep = ProximateGrantReport.query.filter_by(
                    grant_id=grant_row.id,
                    report_type=rf['type'],
                    period_start=rf['period_start'],
                ).first()
                if not existing_rep:
                    db.session.add(ProximateGrantReport(
                        grant_id=grant_row.id,
                        report_type=rf['type'],
                        period_start=rf['period_start'],
                        period_end=rf['period_end'],
                        due_date=rf['due_date'],
                        status=rf['status'],
                        submitted_at=(
                            datetime.now(timezone.utc)
                            if rf['status'] in ('submitted', 'accepted')
                            else None
                        ),
                        donor_ack_at=(
                            datetime.now(timezone.utc)
                            if rf['status'] == 'accepted' else None
                        ),
                    ))

        db.session.commit()
        if grants_created:
            print(f"  Grants created: {grants_created}")
        if allocations_created:
            print(f"  Allocations created: {allocations_created}")

        print()
        print(f"Done. Proximate now has:")
        print(f"  Endorsers : {Endorser.query.filter_by(network_id=proximate.id).count()}")
        print(f"  Partners  : {ProximatePartner.query.filter_by(network_id=proximate.id).count()}")
        print(f"  Endorsements: {Endorsement.query.join(ProximatePartner).filter(ProximatePartner.network_id == proximate.id).count()}")
        print(f"  Donors    : {ProximateDonor.query.filter_by(network_id=proximate.id).count()}")
        print(f"  Rounds    : {ProximateRound.query.filter_by(network_id=proximate.id).count()}")
        print(f"  Participants: {ProximateRoundParticipant.query.join(ProximateRound).filter(ProximateRound.network_id == proximate.id).count()}")
        print(f"  Grants    : {ProximateGrant.query.filter_by(network_id=proximate.id).count()}")
        print(f"  Allocations: {ProximateGrantAllocation.query.join(ProximateGrant).filter(ProximateGrant.network_id == proximate.id).count()}")
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
