#!/usr/bin/env python3
"""
reseed_demo_logins.py — restore the shared demo logins for pilot/QA testing.

The exact inverse of retire_demo_accounts.py. Go-live ran that script, which
deactivated every ``pass123`` account and randomized its password so the shared
demo credentials could never authenticate again. That is the correct posture
for a branded production host — but it also broke the one-click demo buttons on
the raw Railway QA URL (``*.up.railway.app``), where they are still shown for
cross-tenant testing.

This restores ONLY an explicit allowlist of demo accounts:
  - reactivates (is_active=True),
  - sets the password back to the shared demo password (default ``pass123`` —
    the value the login buttons submit; override with KUJA_DEMO_PASSWORD),
  - clears must_change_password (so the demo lands in-app, not on
    /change-password),
  - clears any lockout (failed_login_count / locked_until / last_failed_login +
    login_attempts rows for the email), mirroring admin.py:api_admin_clear_lockout.

Safety:
  - The 6 real go-live accounts are NEVER touched (PROTECTED list).
  - Only emails on the DEMO allowlist are affected — never a blanket reset.
  - The shared platform-admin demo (admin@kuja.org) is held back unless
    --include-admin is passed, because restoring it to pass123 is a shared
    admin credential on production.
  - Accounts that do not exist are reported (seed.py recreates them).
  - Dry-run by default; pass --confirm to apply. Audit-logged.

SECURITY NOTE: this re-enables shared, guessable credentials on the deployment.
Use it for pilot/QA on the Railway URL, and re-run retire_demo_accounts.py
--confirm once testing is done (or before any branded go-live).

Usage (inside the Railway container):
    python reseed_demo_logins.py                    # dry-run
    python reseed_demo_logins.py --confirm          # apply (non-admin demo set)
    python reseed_demo_logins.py --confirm --include-admin
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text

from app import create_app
from app.extensions import db
from app.models import User
from app.models.audit_chain import AuditChainEntry

DEMO_PASSWORD = os.environ.get('KUJA_DEMO_PASSWORD', 'pass123')

# The real go-live accounts — never reseed these (belt-and-suspenders).
PROTECTED = {
    'iloyan@adesoafrica.org', 'mrashid@adesoafrica.org', 'thussein@adesoafrica.org',
    'mtumwebaze@adesoafrica.org', 'kali@proximatefund.org', 'msattar@proximatefund.org',
}

# The Kuja Marketplace demo set the login buttons + E2E suite reference.
DEMO_NON_ADMIN = [
    # donors
    'sarah@globalhealth.org', 'david@eatrust.org',
    # reviewers
    'james@reviewer.org', 'maria@reviewer.org',
    # NGOs / CBOs / networks
    'fatima@amani.org', 'ahmed@salamrelief.org', 'thandi@ubuntu.org',
    'peter@hopebridges.org', 'aisha@sahelwomen.org',
]
# Shared platform-admin demo — highest exposure; opt-in only.
DEMO_ADMIN = ['admin@kuja.org']


def _clear_lockout(email: str):
    """Mirror admin.py:api_admin_clear_lockout for one email — best-effort so a
    missing column/table on any deployment never aborts the reseed."""
    try:
        db.session.execute(
            text("UPDATE users SET failed_login_count = 0, "
                 "last_failed_login = NULL, locked_until = NULL "
                 "WHERE lower(email) = :email"),
            {'email': email},
        )
    except Exception as e:
        print(f'    (user lockout columns not cleared for {email}: {e})')
    try:
        db.session.execute(
            text("DELETE FROM login_attempts WHERE lower(email) = :email"),
            {'email': email},
        )
    except Exception as e:
        print(f'    (login_attempts not swept for {email}: {e})')


def main():
    confirm = '--confirm' in sys.argv
    include_admin = '--include-admin' in sys.argv

    targets = list(DEMO_NON_ADMIN) + (DEMO_ADMIN if include_admin else [])
    targets = [e.strip().lower() for e in targets if e.strip().lower() not in PROTECTED]

    app = create_app()
    with app.app_context():
        found, missing = [], []
        for email in targets:
            u = User.query.filter(User.email.ilike(email)).first()
            (found if u else missing).append((email, u))

        print('=' * 66)
        print(('APPLY' if confirm else 'DRY-RUN') +
              f' — reseed {len(found)} demo account(s) to the shared demo password'
              + ('' if include_admin else '  (admin@kuja.org held back — pass --include-admin)'))
        print('-' * 66)
        for email, u in found:
            print(f'  {"RESEED " if confirm else "would  "} {email:34} '
                  f'role={(u.role or "?"):9} active={u.is_active} '
                  f'must_change={getattr(u, "must_change_password", "?")}')
        for email, _ in missing:
            print(f'  MISSING {email:34} (not in DB — run seed.py to recreate)')
        print('-' * 66)

        if not confirm:
            print('Dry-run only. Re-run with --confirm to apply.')
            return

        for email, u in found:
            u.set_password(DEMO_PASSWORD)
            u.is_active = True
            if hasattr(u, 'must_change_password'):
                u.must_change_password = False
            db.session.add(u)
            _clear_lockout(email)
        db.session.commit()

        for email, u in found:
            AuditChainEntry.append(
                action='admin.user.demo_reseeded',
                actor_email='reseed_demo_logins.py',
                subject_kind='user', subject_id=u.id,
                details={'email': email,
                         'reason': 'pilot/QA: shared demo login restored (reactivated + '
                                   'password reset + lockout cleared)'},
            )
        print(f'RESEEDED {len(found)} account(s). Shared demo password is now active for them.')
        if missing:
            print(f'{len(missing)} account(s) were MISSING and were not created — run seed.py if needed.')
        print('Re-run retire_demo_accounts.py --confirm to lock these back down after testing.')


if __name__ == '__main__':
    main()
