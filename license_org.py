#!/usr/bin/env python3
"""
license_org.py — grant / revoke a donor org's Kuja Grant licence (Phase 2).

The grant app is the source of record for the licence flag; this CLI lets a
platform admin set it without the frontend (mirrors provision_users.py). Safe to
run repeatedly (idempotent). Enforcement of the flag is separately gated by the
GRANT_LICENSING_ENFORCED env var — setting a licence here does nothing visible
until enforcement is switched on.

Usage (inside the container):
    railway ssh --service web python license_org.py list
    railway ssh --service web python license_org.py <org_id> on  [--tier standard] [--build] [--expires 2027-08-14]
    railway ssh --service web python license_org.py <org_id> off
    railway ssh --service web python license_org.py --email donor@example.org on
    railway ssh --service web python license_org.py <org_id>          # show current state
"""
import argparse
import sys
from datetime import datetime, timezone

from app import create_app
from app.extensions import db
from app.models import Organization


def _fmt(o):
    exp = o.grant_license_expires_at.isoformat() if o.grant_license_expires_at else '—'
    name = (o.name or '')[:38]
    return (f"  #{o.id:<4} {name:<38} type={o.org_type:<8} "
            f"licensed={'Y' if o.grant_licensed else 'n'} active={'Y' if o.is_grant_licensed() else 'n'} "
            f"tier={o.grant_license_tier or '—'} build={'Y' if o.has_kuja_build else 'n'} expires={exp}")


def main():
    p = argparse.ArgumentParser(description="Grant/revoke a donor org's Kuja Grant licence")
    p.add_argument('org', nargs='?', help="org id, or 'list' to print all orgs")
    p.add_argument('action', nargs='?', choices=['on', 'off'], help="on = license, off = revoke")
    p.add_argument('--email', help="resolve the org by a member user's email instead of id")
    p.add_argument('--tier', default=None, help="licence tier label, e.g. standard|pro")
    p.add_argument('--build', action='store_true', help="also enable the Kuja Build finance-feed entitlement")
    p.add_argument('--expires', default=None, help="ISO expiry date (e.g. 2027-08-14); omit for no expiry")
    args = p.parse_args()

    app = create_app()
    with app.app_context():
        if args.org == 'list' or (args.org is None and not args.email):
            orgs = Organization.query.order_by(Organization.org_type, Organization.name).all()
            print(f"{len(orgs)} organisations:")
            for o in orgs:
                print(_fmt(o))
            return

        org = None
        if args.email:
            from app.models import User
            u = User.query.filter_by(email=args.email.strip().lower()).first()
            if not u or not u.org_id:
                print(f"No org found for email {args.email}", file=sys.stderr)
                sys.exit(1)
            org = db.session.get(Organization, u.org_id)
        else:
            try:
                org = db.session.get(Organization, int(args.org))
            except (TypeError, ValueError):
                print(f"Invalid org id: {args.org}", file=sys.stderr)
                sys.exit(1)
        if not org:
            print("Organisation not found", file=sys.stderr)
            sys.exit(1)

        if args.action is None:
            print("Current:")
            print(_fmt(org))
            return

        org.grant_licensed = (args.action == 'on')
        if args.action == 'on':
            if args.tier is not None:
                org.grant_license_tier = args.tier
            if args.build:
                org.has_kuja_build = True
            if args.expires:
                org.grant_license_expires_at = datetime.fromisoformat(args.expires.replace('Z', '+00:00'))
        org.license_updated_at = datetime.now(timezone.utc)
        org.license_updated_by = 'license_org.py'
        db.session.commit()
        print(f"{'Licensed' if args.action == 'on' else 'Revoked'} org #{org.id}:")
        print(_fmt(org))


if __name__ == '__main__':
    main()
