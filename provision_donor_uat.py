#!/usr/bin/env python3
"""
provision_donor_uat.py — a dedicated donor-role UAT identity for Proximate.

Requested in the 4 Sep 2026 QA handoff ("Donor QA access"). Creates, idempotently:

  * one User with role='donor' (donor role ONLY — no org, no OB seat, no admin),
    forced password change on first sign-in, temp password printed ONCE;
  * one ProximateDonor row for that user on the Proximate network, following the
    representative rounds you name (`--rounds 3,4`), with the closing-pack auto-email
    switched OFF — the account must never trigger external messaging;
  * optionally one grant for that donor (`--grant-title/--grant-ref/--grant-amount`)
    so the donor's grants view is populated; a UAT reference makes the grant classify
    as test data under the ONE test-data policy (app/utils/test_records.py).

No phone number is stored. Every creation is audit-chained. Dry-run by default —
pass --confirm to write.

Run it from a machine whose DATABASE_URL points at the target database (see
docs/historical_import/README.md for the production pattern). Do NOT run via
`railway ssh` into the web worker.

Usage
  py provision_donor_uat.py --email donor.uat@kuja.org --name "UAT Donor" --rounds 3,4
  py provision_donor_uat.py --email donor.uat@kuja.org --name "UAT Donor" --rounds 3,4 \
      --grant-title "Sudan Community Resilience Window 2026" --grant-ref UAT-DONOR-2026-001 \
      --grant-amount 250000 --confirm
"""

from __future__ import annotations

import argparse
import os
import secrets
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Same alphabet as admin.py:_generate_temp_password / provision_users.py —
# no characters that are ambiguous when read aloud or retyped (0/O, 1/l/I).
_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'


def _temp_password() -> str:
    return '-'.join(''.join(secrets.choice(_ALPHABET) for _ in range(5)) for _ in range(3))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--email', required=True)
    ap.add_argument('--name', required=True, help='display name of the person')
    ap.add_argument('--display-name', default=None, help='donor organisation label (default: --name)')
    ap.add_argument('--rounds', default='', help='comma-separated round ids the donor follows')
    ap.add_argument('--grant-title')
    ap.add_argument('--grant-ref')
    ap.add_argument('--grant-amount', type=float)
    ap.add_argument('--confirm', action='store_true', help='write (default is a dry run)')
    args = ap.parse_args(argv)

    email = args.email.strip().lower()
    if '@' not in email:
        print('ERROR: --email must be an email address')
        return 2
    round_ids = [int(x) for x in args.rounds.split(',') if x.strip()]
    if bool(args.grant_title) != bool(args.grant_ref):
        print('ERROR: --grant-title and --grant-ref go together')
        return 2

    from app import create_app
    from app.extensions import db
    from app.models import User, Network
    from app.models.audit_chain import AuditChainEntry
    from app.models.proximate_donor import ProximateDonor
    from app.models.proximate_round import ProximateRound
    from app.models.proximate_grant import ProximateGrant
    from app.utils.test_records import round_is_test, grant_is_test

    app = create_app()
    with app.app_context():
        net = Network.query.filter_by(slug='proximate').first()
        if net is None:
            print('ERROR: proximate network not found')
            return 2

        plan = []
        rounds = []
        for rid in round_ids:
            r = ProximateRound.query.filter_by(id=rid, network_id=net.id).first()
            if r is None:
                print(f'ERROR: round {rid} is not a Proximate round in this database')
                return 2
            rounds.append(r)
            plan.append(f'FOLLOW   round #{r.id} "{r.title}" [{r.status}]'
                        + (' (test data)' if round_is_test(r) else ''))

        user = User.query.filter(User.email.ilike(email)).first()
        pw = None
        if user is None:
            pw = _temp_password()
            plan.append(f'CREATE   user {email} role=donor must_change_password=True (no org, no phone)')
        else:
            plan.append(f'EXISTS   user {email} role={user.role} active={user.is_active}'
                        + ('' if user.role == 'donor' else '  !! role is not donor — will NOT be changed'))

        donor = None
        if user is not None:
            donor = ProximateDonor.query.filter_by(network_id=net.id, primary_user_id=user.id).first()
        display = (args.display_name or args.name).strip()
        if donor is None:
            plan.append(f'CREATE   ProximateDonor "{display}" following {round_ids} auto_email_closing_pack=False')
        else:
            plan.append(f'EXISTS   ProximateDonor #{donor.id} "{donor.display_name}" following '
                        f'{donor.subscribed_round_ids()} -> will follow {sorted(set(donor.subscribed_round_ids()) | set(round_ids))}')

        grant = None
        if args.grant_title:
            if donor is not None:
                grant = ProximateGrant.query.filter_by(network_id=net.id, donor_id=donor.id,
                                                       donor_grant_ref=args.grant_ref).first()
            if grant is None:
                plan.append(f'CREATE   grant "{args.grant_title}" ref={args.grant_ref} '
                            f'committed=${args.grant_amount or 0:,.0f} status=active')
            else:
                plan.append(f'EXISTS   grant #{grant.id} "{grant.title}"')

        print('=' * 64)
        print('PROXIMATE DONOR UAT PROVISIONING — ' + ('APPLY' if args.confirm else 'DRY RUN'))
        print('=' * 64)
        for line in plan:
            print(line)
        if not args.confirm:
            print('-' * 64)
            print('Nothing written. Re-run with --confirm to apply.')
            return 0

        created = []
        if user is None:
            user = User(email=email, name=args.name.strip(), role='donor', org_id=None, is_active=True)
            user.set_password(pw)
            user.must_change_password = True
            db.session.add(user)
            db.session.flush()
            created.append(('user', user.id, {'email': email, 'role': 'donor', 'kind': 'donor (proximate UAT)',
                                              'via': 'provision_donor_uat.py'}))
        if donor is None:
            donor = ProximateDonor(
                network_id=net.id, org_id=None, primary_user_id=user.id,
                display_name=display, contact_email=email,
                auto_email_closing_pack=False, registered_by_user_id=None,
            )
            donor.set_subscribed_round_ids(round_ids)
            db.session.add(donor)
            db.session.flush()
            created.append(('proximate_donor', donor.id, {'display_name': display, 'rounds': round_ids,
                                                          'uat': True}))
        else:
            donor.set_subscribed_round_ids(set(donor.subscribed_round_ids()) | set(round_ids))
            donor.auto_email_closing_pack = False
        if args.grant_title and grant is None:
            grant = ProximateGrant(
                network_id=net.id, donor_id=donor.id, donor_name_cache=display,
                title=args.grant_title.strip(), donor_grant_ref=args.grant_ref.strip(),
                amount_committed_usd=args.grant_amount, amount_received_usd=0.0, currency='USD',
                reporting_cadence='quarterly', status='active', created_by_user_id=user.id,
                signed_at=datetime.now(timezone.utc),
            )
            db.session.add(grant)
            db.session.flush()
            created.append(('proximate_grant', grant.id, {'title': grant.title, 'ref': grant.donor_grant_ref,
                                                          'is_test': grant_is_test(grant), 'uat': True}))
        db.session.commit()

        for kind, sid, details in created:
            AuditChainEntry.append(
                action=('admin.user.created' if kind == 'user' else f'proximate.{kind.split("proximate_")[-1]}.registered'),
                actor_email='provision_donor_uat.py', subject_kind=kind, subject_id=sid,
                details=details, network_id=net.id,
            )

        print('-' * 64)
        print(f'user #{user.id}  donor #{donor.id}  grant #{grant.id if grant else "-"}')
        if pw:
            print('TEMP PASSWORD (shown once, forced change on first sign-in):')
            print(f'    {email}    {pw}')
        else:
            print('existing user: password untouched')
        return 0


if __name__ == '__main__':
    sys.exit(main())
