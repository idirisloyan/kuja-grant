#!/usr/bin/env python3
"""
fix_display_names.py — reconcile the display name on the real go-live accounts.

The first provisioning run inferred display names from email prefixes; this sets
them to the confirmed full names. Idempotent: an account already carrying the
right name is left untouched (SKIP). Dry-run by default; --confirm applies.

Roster is a base64 JSON array in argv[1] — [{"email": "...", "name": "..."}] —
so multi-word names (which contain spaces) survive `railway ssh`'s sh tokenizer.

Usage (inside the Railway container):
    python fix_display_names.py <BASE64_ROSTER>            # dry-run
    python fix_display_names.py <BASE64_ROSTER> --confirm  # apply
"""

import os
import sys
import json
import base64

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from app.extensions import db
from app.models import User
from app.models.audit_chain import AuditChainEntry


def main():
    confirm = '--confirm' in sys.argv
    b64 = next((a for a in sys.argv[1:] if a != '--confirm'), None)
    if not b64:
        print('ERROR: missing base64 roster arg')
        sys.exit(1)
    roster = json.loads(base64.b64decode(b64).decode('utf-8'))

    app = create_app()
    with app.app_context():
        print('=' * 64)
        print(('APPLY' if confirm else 'DRY-RUN') + f' — reconcile {len(roster)} display name(s)')
        print('-' * 64)
        changes = []
        for r in roster:
            email = (r.get('email') or '').strip().lower()
            want = (r.get('name') or '').strip()
            if not email or not want:
                continue
            u = User.query.filter(db.func.lower(User.email) == email).first()
            if not u:
                print(f'  MISSING  {email:34} (no such user)')
                continue
            cur = u.name or ''
            if cur == want:
                print(f'  SKIP     {email:34} name already "{want}"')
                continue
            print(f'  {"SET     " if confirm else "would   "} {email:34} "{cur}" -> "{want}"')
            changes.append((u, cur, want))

        print('-' * 64)
        if not confirm:
            print(f'Dry-run only — {len(changes)} would change. Re-run with --confirm.')
            return

        for u, cur, want in changes:
            u.name = want
            db.session.add(u)
        db.session.commit()

        for u, cur, want in changes:
            AuditChainEntry.append(
                action='admin.user.name_corrected',
                actor_email='fix_display_names.py',
                subject_kind='user', subject_id=u.id,
                details={'email': u.email, 'from': cur, 'to': want,
                         'reason': 'go-live: set confirmed full name'},
            )
        print(f'UPDATED {len(changes)} display name(s).')


if __name__ == '__main__':
    main()
