#!/usr/bin/env python3
"""
retire_demo_accounts.py — go-live safety: kill the shared demo logins.

Finds every account whose password is still the seeded demo password
(`pass123`), deactivates it (is_active=False) AND replaces the password with
a strong random one, so `pass123` can never authenticate again — even if an
account is later reactivated.

  - The 6 real go-live accounts are never touched (belt-and-suspenders: they
    don't have pass123 anyway, and they're on the exclusion list).
  - Aborts if the change would leave zero active platform admins.
  - Dry-run by default; pass --confirm to apply. Audit-logged.

NB the synthetic monitor no longer falls back to pass123 (its login probes
are opt-in via KUJA_SYN_*_PASSWORD), so retiring these does not create false
monitoring failures.

Usage (inside the Railway container):
    python retire_demo_accounts.py            # dry-run
    python retire_demo_accounts.py --confirm  # apply
"""

import os
import sys
import secrets

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from app.extensions import db
from app.models import User
from app.models.audit_chain import AuditChainEntry

DEMO_PASSWORD = 'pass123'
_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

# The real go-live accounts — never retire these.
PROTECTED = {
    'iloyan@adesoafrica.org', 'mrashid@adesoafrica.org', 'thussein@adesoafrica.org',
    'mtumwebaze@adesoafrica.org', 'kali@proximatefund.org', 'msattar@proximatefund.org',
}


def _rand_password() -> str:
    return ''.join(secrets.choice(_ALPHABET) for _ in range(28))


def main():
    confirm = '--confirm' in sys.argv
    app = create_app()
    with app.app_context():
        victims = []
        for u in User.query.all():
            if (u.email or '').strip().lower() in PROTECTED:
                continue
            try:
                if u.check_password(DEMO_PASSWORD):
                    victims.append(u)
            except Exception:
                pass

        total_active_admins = User.query.filter(
            User.role == 'admin', User.is_active.is_(True),
        ).count()
        losing_admins = sum(1 for u in victims if u.role == 'admin' and u.is_active)
        remaining_admins = total_active_admins - losing_admins

        print('=' * 60)
        print(('APPLY' if confirm else 'DRY-RUN') +
              f' — {len(victims)} account(s) still use the demo password')
        print(f'active platform admins remaining afterwards: {remaining_admins}')
        print('-' * 60)
        for u in victims:
            print(f'  {"RETIRE " if confirm else "would  "} {u.email:34} '
                  f'role={u.role:9} active={u.is_active}')
        print('-' * 60)

        if remaining_admins < 1:
            print('ABORT: this would leave zero active platform admins.')
            sys.exit(2)
        if not confirm:
            print('Dry-run only. Re-run with --confirm to apply.')
            return

        for u in victims:
            u.set_password(_rand_password())
            u.is_active = False
            db.session.add(u)
        db.session.commit()

        for u in victims:
            AuditChainEntry.append(
                action='admin.user.demo_retired',
                actor_email='retire_demo_accounts.py',
                subject_kind='user', subject_id=u.id,
                details={'email': u.email,
                         'reason': 'go-live: shared demo (pass123) login disabled + randomized'},
            )
        print(f'RETIRED {len(victims)} account(s): deactivated + password randomized.')


if __name__ == '__main__':
    main()
