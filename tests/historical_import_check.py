#!/usr/bin/env python3
"""
tests/historical_import_check.py — proves the historical-import pathway does
what docs/historical_import/README.md claims, against a THROWAWAY SQLite DB.

    py tests/historical_import_check.py

Cycle:
  1. seed a fresh Proximate tenant (seed_proximate.py) in a temp dir;
  2. PREVIEW the sample package  -> zero rows written, exit 0;
  3. APPLY                        -> round/partners/releases exist with the ORIGINAL
                                     dates, one "Historical record imported" audit
                                     entry per row, message table unchanged;
  4. APPLY again                  -> every row skipped as already imported;
  5. ROLLBACK                     -> exactly the batch's rows removed, audited;
  6. APPLY a second batch, record product activity on an imported partner,
     ROLLBACK                     -> refused (exit 1), rows still present.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
TOOL = os.path.join(ROOT, 'import_historical_round.py')
PKG = os.path.join(ROOT, 'docs', 'historical_import', 'sample_round_package.json')
ACTOR = 'ob@proximate.org'   # seeded OB seat (seed_proximate.py)

tmp = tempfile.mkdtemp(prefix='kuja_hist_')
DB = os.path.join(tmp, 'hist.db')
ENV = {**os.environ, 'KUJA_DB_PATH': DB, 'PYTHONIOENCODING': 'utf-8',
       'SEED_PROXIMATE_ON_BOOT': 'false'}
ENV.pop('DATABASE_URL', None)

failures = []


def check(name, cond, detail=''):
    print(('  [PASS] ' if cond else '  [FAIL] ') + name + (f' — {detail}' if detail and not cond else ''))
    if not cond:
        failures.append(name)


def run(args, expect=0):
    r = subprocess.run([sys.executable, TOOL, *args], cwd=ROOT, env=ENV,
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    ok = r.returncode == expect
    if not ok:
        print(r.stdout[-3000:])
        print(r.stderr[-3000:])
    return r, ok


def counts():
    from app import create_app
    from app.models.proximate_round import ProximateRound, ProximateRoundParticipant
    from app.models.proximate_endorsement import ProximatePartner
    from app.models.proximate_disbursement import ProximateDisbursement
    from app.models.proximate_grant import ProximateGrant, ProximateGrantAllocation
    from app.models.proximate_message import ProximateMessage
    from app.models.audit_chain import AuditChainEntry
    app = create_app()
    with app.app_context():
        return {
            'rounds': ProximateRound.query.count(),
            'participants': ProximateRoundParticipant.query.count(),
            'partners': ProximatePartner.query.count(),
            'disbursements': ProximateDisbursement.query.count(),
            'grants': ProximateGrant.query.count(),
            'allocations': ProximateGrantAllocation.query.count(),
            'messages': ProximateMessage.query.count(),
            'audit': AuditChainEntry.query.count(),
        }


def imported_rows(batch):
    from app import create_app
    from app.models.proximate_round import ProximateRound
    from app.models.proximate_endorsement import ProximatePartner
    from app.models.proximate_disbursement import ProximateDisbursement
    from app.models.audit_chain import AuditChainEntry
    app = create_app()
    with app.app_context():
        r = ProximateRound.query.filter_by(import_batch_id=batch).first()
        ps = ProximatePartner.query.filter_by(import_batch_id=batch).all()
        ds = ProximateDisbursement.query.filter_by(import_batch_id=batch).order_by(
            ProximateDisbursement.import_source_ref).all()
        audit = AuditChainEntry.query.filter(
            AuditChainEntry.action == 'proximate.historical.imported').all()
        notes = {json.loads(a.details_json or '{}').get('note') for a in audit}
        return {
            'round': None if r is None else {
                'id': r.id, 'title': r.title, 'status': r.status,
                'drafted_at': r.drafted_at.date().isoformat() if r.drafted_at else None,
                'closed_at': r.closed_at.date().isoformat() if r.closed_at else None,
            },
            'partner_ids': [p.id for p in ps],
            'partner_statuses': sorted(p.status for p in ps),
            'disb': [(d.import_source_ref, float(d.amount_usd), d.status,
                      d.sent_at.date().isoformat(), d.report_token, d.receipt_token, d.verifier_token)
                     for d in ds],
            'audit_imported': len(audit), 'audit_notes': notes,
        }


def touch_partner(batch):
    """Simulate product activity on an imported partner (an audited action)."""
    from app import create_app
    from app.models.proximate_endorsement import ProximatePartner
    from app.models.audit_chain import AuditChainEntry
    app = create_app()
    with app.app_context():
        p = ProximatePartner.query.filter_by(import_batch_id=batch).first()
        AuditChainEntry.append(action='proximate.partner.updated', actor_email=ACTOR,
                               subject_kind='proximate_partner', subject_id=p.id,
                               details={'field': 'locality'}, network_id=p.network_id)


try:
    os.environ.update(ENV)
    print(f'temp db: {DB}')
    seed = subprocess.run([sys.executable, os.path.join(ROOT, 'seed_proximate.py')], cwd=ROOT, env=ENV,
                          capture_output=True, text=True, encoding='utf-8', errors='replace')
    check('seed_proximate.py ran', seed.returncode == 0, seed.stderr[-500:])

    base = counts()
    r, ok = run([PKG, '--actor', ACTOR, '--report', os.path.join(tmp, 'preview.json')])
    check('preview exits 0', ok)
    check('preview says nothing written', 'Nothing written' in r.stdout)
    check('preview writes no rows', counts() == base, json.dumps({'before': base, 'after': counts()}))
    rep = json.load(open(os.path.join(tmp, 'preview.json'), encoding='utf-8'))
    check('preview report has plan + totals', rep['mode'] == 'preview' and 'totals' in rep and rep['errors'] == [])

    r, ok = run([PKG, '--actor', ACTOR, '--apply', '--confirm-historical', '--report', os.path.join(tmp, 'apply.json')])
    check('apply exits 0', ok)
    after = counts()
    check('apply created 1 round, 2 partners, 2 releases, 1 grant, 1 allocation, 2 roster rows',
          (after['rounds'] - base['rounds'], after['partners'] - base['partners'],
           after['disbursements'] - base['disbursements'], after['grants'] - base['grants'],
           after['allocations'] - base['allocations'], after['participants'] - base['participants'])
          == (1, 2, 2, 1, 1, 2), json.dumps({'before': base, 'after': after}))
    check('apply sent NO messages', after['messages'] == base['messages'])
    rows = imported_rows('hist-2025-kassala-sample')
    check('round keeps its ORIGINAL dates + status',
          rows['round'] and rows['round']['drafted_at'] == '2025-08-20'
          and rows['round']['closed_at'] == '2025-12-15' and rows['round']['status'] == 'closed', json.dumps(rows['round']))
    check('partner status reconstructed (dd_clear x2)', rows['partner_statuses'] == ['dd_clear', 'dd_clear'], str(rows['partner_statuses']))
    check('releases keep original sent dates; D-002 status reconstructed as reported; no tokens issued',
          [(d[0], d[1], d[2], d[3]) for d in rows['disb']]
          == [('D-001', 8000.0, 'verified', '2025-09-05'), ('D-002', 5000.0, 'reported', '2025-09-06')]
          and all(d[4] is None and d[5] is None and d[6] is None for d in rows['disb']), str(rows['disb']))
    check('one "Historical record imported" audit entry per created row (6)',
          rows['audit_imported'] == 6 and rows['audit_notes'] == {'Historical record imported'},
          f"{rows['audit_imported']} {rows['audit_notes']}")

    r, ok = run([PKG, '--actor', ACTOR, '--apply', '--confirm-historical'])
    check('second apply exits 0', ok)
    check('second apply is a no-op (idempotent)', counts() == after, json.dumps({'after': after, 'again': counts()}))
    check('second apply reports every row as already imported',
          r.stdout.count('already imported') >= 6 and 'CREATE' not in r.stdout.split('WARNINGS')[0].replace('CREATE   allocation', ''))

    pre = counts()
    r, ok = run(['--rollback', 'hist-2025-kassala-sample', '--actor', ACTOR])
    check('rollback preview exits 0 and removes nothing', ok and counts() == pre,
          json.dumps({'pre': pre, 'post': counts()}))
    r, ok = run(['--rollback', 'hist-2025-kassala-sample', '--actor', ACTOR, '--confirm-rollback'])
    check('rollback exits 0', ok)
    back = counts()
    check('rollback removed exactly the batch (audit rows kept, +1 rollback entry)',
          {k: v for k, v in back.items() if k != 'audit'} == {k: v for k, v in base.items() if k != 'audit'}
          and back['audit'] > after['audit'], json.dumps({'base': base, 'back': back}))

    # Second batch: product activity blocks rollback.
    pkg2 = json.load(open(PKG, encoding='utf-8'))
    pkg2['batch_id'] = 'hist-2025-kassala-sample-b'
    p2 = os.path.join(tmp, 'pkg2.json')
    json.dump(pkg2, open(p2, 'w', encoding='utf-8'), ensure_ascii=False)
    r, ok = run([p2, '--actor', ACTOR, '--apply', '--confirm-historical'])
    check('second batch applies', ok)
    touch_partner('hist-2025-kassala-sample-b')
    r, ok = run(['--rollback', 'hist-2025-kassala-sample-b', '--actor', ACTOR, '--confirm-rollback'], expect=1)
    check('rollback REFUSED after product activity on an imported row', ok and 'refusing to roll back' in r.stdout)
    check('refused rollback removed nothing', counts()['partners'] == back['partners'] + 2)

    r, ok = run([PKG, '--actor', 'donor1@proximate.org'], expect=2)
    check('non-OB actor is refused', ok and 'Oversight Body' in r.stdout)
finally:
    shutil.rmtree(tmp, ignore_errors=True)

print('=' * 60)
print(f'HISTORICAL IMPORT CHECK: {"PASS" if not failures else "FAIL"} ({len(failures)} failing)')
for f in failures:
    print('  -', f)
sys.exit(1 if failures else 0)
