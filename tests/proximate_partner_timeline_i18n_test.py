#!/usr/bin/env python3
"""Data-accuracy regression — the Proximate partner "decisions affecting me"
timeline must be localized to the tenant language (Arabic), not leak English.

The leak: `_partner_decision_timeline` returned hardcoded English labels
('Routine screening: cleared', 'Nominated to the fund', ...). The partner
mini-portal is an ANONYMOUS token page with no logged-in user, so the
backend `get_lang()` defaulted to English — but Proximate is Arabic-first
(network default_language='ar'), and the frontend renders `dec.label` RAW
(proximate-partner/page.tsx:270, no t() wrapper). Result: an Arabic-first
partner saw English status text on their own portal.

Fix: translate server-side via t(key, lang=<network default>). This test
asserts the VALUE is the correct language (data accuracy), not merely that
a label exists. Mutation proof: revert the fix (return English literals)
and the English-absence assertions go red.

Run:  python tests/proximate_partner_timeline_i18n_test.py
"""
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('SECRET_KEY', 'x' * 64)
os.environ.pop('DATABASE_URL', None)

from app import create_app, db  # noqa: E402
from app.routes.proximate_routes import (  # noqa: E402
    _partner_decision_timeline, _proximate_portal_lang,
)
from app.models import Network, AuditChainEntry  # noqa: E402
from app.models.proximate_endorsement import ProximatePartner  # noqa: E402

PASS = FAIL = 0


def check(ok, name, detail=""):
    global PASS, FAIL
    PASS += ok
    FAIL += (not ok)
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" -- {detail}" if detail else ""))
    return ok


# English strings that MUST NOT appear on the Arabic portal (the pre-fix
# leak set). If any is present in a rendered label, the fix regressed.
ENGLISH_LEAKS = [
    'Routine screening', 'Nominated to the fund', 'Due diligence',
    'Payment details verified', 'Suspended pending review', 'Reinstated',
    'Status updated', 'Self-nomination', 'Endorsement stage',
]


def main():
    app = create_app('testing')
    with app.app_context():
        db.create_all()
        net = Network.query.filter_by(slug='proximate').first()
        check(net is not None and net.default_language == 'ar',
              'Proximate network is Arabic-first',
              f"default_language={getattr(net, 'default_language', None)}")

        # Language resolver: network default wins; unknown -> safe English.
        check(_proximate_portal_lang(net.id) == 'ar',
              'portal lang resolves to ar for Proximate network')
        check(_proximate_portal_lang(None) == 'en',
              'portal lang falls back to en when unknown')

        # Seed a partner with a screening event + a whitelisted audit event.
        p = ProximatePartner(network_id=net.id, name='ZZ i18n Test',
                             status='dd_clear', sanctions_flag=False,
                             sanctions_checked_at=datetime.now(timezone.utc))
        db.session.add(p)
        db.session.commit()
        AuditChainEntry.append(
            action='proximate.partner.nominated', actor_email='system',
            subject_kind='proximate_partner', subject_id=p.id, details={},
        )

        tl = _partner_decision_timeline(p)
        labels = [e.get('label', '') for e in tl]
        check(len(tl) >= 2, 'timeline has the seeded events', f'{len(tl)} events')

        # DATA-ACCURACY: every label must be Arabic, i.e. contain no English
        # leak string. This is the assertion that has teeth.
        leaked = [(lbl, leak) for lbl in labels for leak in ENGLISH_LEAKS
                  if leak in lbl]
        check(not leaked, 'no English leaked into any label',
              f'leaked={leaked}')

        # Positive: the screening label equals the exact Arabic catalog value.
        screening = [e['label'] for e in tl if e['kind'] == 'screening']
        check(screening and screening[0] == 'الفحص الدوري: تم اجتيازه',
              'screening label is the Arabic catalog string',
              f'got={screening}')

        # Positive: the nomination label is Arabic.
        status_labels = [e['label'] for e in tl if e['kind'] == 'status']
        check(status_labels and status_labels[0] == 'تم ترشيحكم للصندوق',
              'nomination label is the Arabic catalog string',
              f'got={status_labels}')

    print(f"\n{PASS} passed, {FAIL} failed")
    return 1 if FAIL else 0


if __name__ == '__main__':
    sys.exit(main())
