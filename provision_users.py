#!/usr/bin/env python3
"""
provision_users.py — repeatable admin user provisioning (go-live onboarding).

Mirrors the blessed ``POST /admin/users`` flow (app/routes/admin.py) and the
seed_proximate OB seat block, but as a CLI so real accounts can be created in
the production container without going through a demo login.

The roster is passed as a **base64-encoded JSON array** in argv[1] so no staff
PII is ever committed to the repo. Each entry:

    {"email": "...", "name": "...", "role": "admin|ngo|donor|reviewer",
     "ob": true|false}

  - role='admin'  -> platform admin (manage tenant, users, workflows).
  - ob=true       -> Proximate Oversight Body seat. The user is created with
                     role='ngo' (platform-compat, exactly like the seed OB
                     seat) and attached to the shared "Proximate Oversight
                     Body" org, which carries one active
                     NetworkMembership(is_oversight_body=True) on the
                     proximate network. @ob_required checks that membership.

Passwords are generated server-side with the same CSPRNG + phone-safe alphabet
as admin.py:_generate_temp_password() and printed ONCE (never logged, hashed on
the way into the DB). Idempotent: an email that already exists is skipped — its
password is never touched — while role / OB seat are reconciled.

Usage (inside the Railway container):
    python provision_users.py <BASE64_JSON_ROSTER>
"""

import os
import sys
import json
import base64
import secrets
from datetime import datetime, timezone

# Make ``import app`` resolve no matter what CWD Railway runs us from —
# app/ is a sibling of this file at the repo root.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from app.extensions import db
from app.models import User, Organization, NetworkMembership, Network
from app.models.audit_chain import AuditChainEntry

# Same alphabet/shape as admin.py:_generate_temp_password — omits characters
# that are ambiguous read aloud over a phone line (0/O, 1/l/I).
_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
_VALID_ROLES = ('ngo', 'donor', 'reviewer', 'admin')
OB_ORG_NAME = 'Proximate Oversight Body'

# When PROVISION_FORCE_CHANGE=1, existing users in the roster are ALSO put
# on the forced-change path. Used ONCE to backfill accounts created before
# the must_change_password column existed. Off by default so ordinary
# re-runs never re-force someone who already rotated their password.
_FORCE_CHANGE_EXISTING = os.environ.get('PROVISION_FORCE_CHANGE') == '1'


def _temp_password() -> str:
    return '-'.join(
        ''.join(secrets.choice(_ALPHABET) for _ in range(5)) for _ in range(3)
    )


def _ensure_ob_org():
    org = Organization.query.filter_by(name=OB_ORG_NAME).first()
    if org is None:
        org = Organization(name=OB_ORG_NAME, org_type='ngo', country='SD')
        db.session.add(org)
        db.session.flush()
    return org


def _ensure_ob_membership(network_id, org_id):
    m = NetworkMembership.query.filter_by(
        network_id=network_id, org_id=org_id,
    ).first()
    if m is None:
        m = NetworkMembership(
            network_id=network_id, org_id=org_id, status='active',
            member_tier='member', is_oversight_body=True,
            joined_at=datetime.now(timezone.utc),
        )
        db.session.add(m)
    else:
        m.status = 'active'
        m.is_oversight_body = True
        if m.joined_at is None:
            m.joined_at = datetime.now(timezone.utc)
    return m


def main():
    if len(sys.argv) < 2:
        print('ERROR: base64 JSON roster required as argv[1]')
        sys.exit(2)
    try:
        roster = json.loads(base64.b64decode(sys.argv[1]).decode('utf-8'))
    except Exception as ex:
        print(f'ERROR: could not decode roster: {ex}')
        sys.exit(2)

    app = create_app()
    with app.app_context():
        prox = Network.query.filter_by(slug='proximate').first()
        if prox is None:
            print('ERROR: proximate network not found')
            sys.exit(2)

        created = []   # (email, kind, temp_password)
        skipped = []   # (email, note)
        ob_org = None

        for r in roster:
            email = (r.get('email') or '').strip().lower()
            name = (r.get('name') or '').strip()
            role = (r.get('role') or '').strip().lower()
            want_ob = bool(r.get('ob'))
            if not email or '@' not in email or not name:
                skipped.append((email or '(blank)', 'invalid entry'))
                continue
            if role not in _VALID_ROLES:
                skipped.append((email, f'invalid role {role!r}'))
                continue

            existing = User.query.filter(User.email.ilike(email)).first()
            if existing:
                notes = []
                if want_ob:
                    if ob_org is None:
                        ob_org = _ensure_ob_org()
                    if existing.org_id != ob_org.id:
                        existing.org_id = ob_org.id
                        notes.append('attached to OB org')
                    _ensure_ob_membership(prox.id, ob_org.id)
                    notes.append('OB seat ensured')
                elif existing.role != role:
                    existing.role = role
                    notes.append(f'role -> {role}')
                if _FORCE_CHANGE_EXISTING and not bool(
                        getattr(existing, 'must_change_password', False)):
                    existing.must_change_password = True
                    notes.append('forced password change on next login')
                skipped.append((email, '; '.join(notes) or 'already exists — unchanged'))
                continue

            org_id = None
            if want_ob:
                if ob_org is None:
                    ob_org = _ensure_ob_org()
                org_id = ob_org.id

            pw = _temp_password()
            user = User(
                email=email, name=name,
                role=('ngo' if want_ob else role),
                org_id=org_id, is_active=True,
            )
            user.set_password(pw)
            # Temp password is single-use: force a change on first sign-in.
            user.must_change_password = True
            db.session.add(user)
            db.session.flush()

            if want_ob:
                _ensure_ob_membership(prox.id, ob_org.id)

            created.append((email, ('OB (proximate)' if want_ob else role), pw, user))

        db.session.commit()

        # Audit each creation (append self-commits; scope OB rows to proximate).
        for email, kind, pw, user in created:
            AuditChainEntry.append(
                action='admin.user.created',
                actor_email='provision_users.py',
                subject_kind='user',
                subject_id=user.id,
                details={'email': email, 'role': user.role,
                         'kind': kind, 'via': 'go-live provisioning'},
                network_id=(prox.id if 'OB' in kind else None),
            )

        # ---- report (temp passwords shown ONCE) --------------------------
        print('=' * 64)
        print('PROVISION RESULT — temp passwords are shown ONCE, not logged')
        print('=' * 64)
        for email, kind, pw, _u in created:
            print(f'CREATED  {kind:16} {email:34} {pw}')
        for email, note in skipped:
            print(f'SKIPPED  {"":16} {email:34} ({note})')
        print('-' * 64)
        print(f'created={len(created)}  skipped={len(skipped)}')


if __name__ == '__main__':
    main()
