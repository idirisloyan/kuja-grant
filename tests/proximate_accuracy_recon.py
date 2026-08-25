#!/usr/bin/env python3
"""Proximate data-accuracy reconciliation — prod-safe, READ-ONLY.

Every check asserts that a number a USER SEES equals the records behind it
(computed == formula, count == rows, state == authoritative), plus the
security negative-controls (donor isolation, RBAC, tenant isolation). This
is the standard the team kept asking for: not "the page rendered / 200",
but "the displayed value is CORRECT".

Built 2026-08-25 after a hand QA pass where all money/count/score checks
below reconciled on prod. Extend it one assertion per surface you touch.

Usage (needs OB + donor creds and DB read access):
  py -3 tests/proximate_accuracy_recon.py \
     --base https://proximate.kuja.org \
     --ob   zz-claude-ob@adeso.test --ob-pw '...' \
     --donor donor1@proximate.org  --donor-pw '...' \
     --db   'postgresql://.../railway'

Run against the TENANT HOST (proximate.kuja.org), NOT the railway URL —
OB-scoped calls resolve the network from the host header.
"""
import argparse
import sys

try:
    import requests
    import psycopg2
except ImportError:
    print("pip install requests psycopg2-binary"); sys.exit(2)

PASS = FAIL = 0


def ck(name, shown, truth):
    global PASS, FAIL
    ok = (shown == truth) or (
        isinstance(shown, (int, float)) and isinstance(truth, (int, float))
        and abs(shown - truth) < 0.5)
    print(f"[{'PASS' if ok else 'FAIL'}] {name}: shown={shown} vs records={truth}")
    PASS += ok
    FAIL += (not ok)
    return ok


def status_ck(name, got, expect):
    global PASS, FAIL
    ok = got in expect
    print(f"[{'PASS' if ok else 'FAIL'}] {name}: status={got} (expect {expect})")
    PASS += ok
    FAIL += (not ok)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', required=True)
    ap.add_argument('--ob', required=True)
    ap.add_argument('--ob-pw', required=True)
    ap.add_argument('--donor', required=True)
    ap.add_argument('--donor-pw', required=True)
    ap.add_argument('--db', required=True)
    ap.add_argument('--other-host', default='https://fund.kuja.org',
                    help='a DIFFERENT tenant host for the isolation check')
    a = ap.parse_args()

    db = psycopg2.connect(a.db)
    cur = db.cursor()

    def q1(sql, *args):
        cur.execute(sql, args)
        r = cur.fetchone()
        return r[0] if r else None

    H = {'X-Requested-With': 'XMLHttpRequest'}
    ob = requests.Session(); ob.headers.update(H)
    ob.post(a.base + '/api/auth/login', json={'email': a.ob, 'password': a.ob_pw})
    dn = requests.Session(); dn.headers.update(H)
    dn.post(a.base + '/api/auth/login', json={'email': a.donor, 'password': a.donor_pw})

    def G(sess, path):
        return sess.get(a.base + path).json()

    # ---- Grant financials (grant detail == records) -----------------------
    print("== Grant financial reconciliation ==")
    grants = G(dn, '/api/proximate/grants').get('grants', [])
    for g in grants:
        gid = g['id']
        db_c = float(q1("SELECT amount_committed_usd FROM proximate_grants WHERE id=%s", gid) or 0)
        db_a = float(q1("SELECT COALESCE(SUM(amount_usd),0) FROM proximate_grant_allocations WHERE grant_id=%s", gid) or 0)
        ck(f'grant {gid} committed', g.get('amount_committed_usd'), db_c)
        ck(f'grant {gid} allocated == SUM(allocations)', g.get('amount_allocated_usd'), db_a)
        if g.get('amount_committed_usd') is not None:
            ck(f'grant {gid} remaining == committed-allocated',
               g.get('amount_remaining_usd'), round(g['amount_committed_usd'] - db_a, 2))

    # ---- Donor money-trail (dashboard portfolio == records) ---------------
    print("== Donor money-trail reconciliation ==")
    dash = G(dn, '/api/proximate/donors/me/dashboard')
    pf = dash.get('portfolio', {})
    rids = [r['id'] for r in dash.get('rounds', [])]
    spend = "('pending_report','reported','verified','flagged')"
    if rids:
        ck('portfolio.envelope_usd == SUM(round envelopes)', pf.get('envelope_usd'),
           float(q1("SELECT COALESCE(SUM(envelope_usd),0) FROM proximate_rounds WHERE id = ANY(%s)", rids) or 0))
        ck('portfolio.disbursed_usd == SUM(spendable disb)', pf.get('disbursed_usd'),
           float(q1(f"SELECT COALESCE(SUM(amount_usd),0) FROM proximate_disbursements WHERE round_id = ANY(%s) AND status IN {spend}", rids) or 0))
        ck('portfolio.partners_served == distinct partners', pf.get('partners_served'),
           q1(f"SELECT COUNT(DISTINCT partner_id) FROM proximate_disbursements WHERE round_id = ANY(%s) AND status IN {spend}", rids))
        ck('portfolio.disbursement_count == COUNT', pf.get('disbursement_count'),
           q1(f"SELECT COUNT(*) FROM proximate_disbursements WHERE round_id = ANY(%s) AND status IN {spend}", rids))

    # ---- OB dashboard counts (overview == records) ------------------------
    print("== OB dashboard counts ==")
    ov = G(ob, '/api/proximate/overview')
    ck('overview.partners_total == COUNT(partners net3)', ov.get('partners_total'),
       q1("SELECT COUNT(*) FROM proximate_partners WHERE network_id=3"))
    for st, shown in (ov.get('partners_by_status') or {}).items():
        ck(f'partners_by_status[{st}]', shown,
           q1("SELECT COUNT(*) FROM proximate_partners WHERE network_id=3 AND status=%s", st))
    ck('fsps_registered', ov.get('fsps_registered'),
       q1("SELECT COUNT(*) FROM proximate_fsps WHERE network_id=3"))

    # ---- Cosigner ladder (SoP 10) is computed correctly -------------------
    print("== Cosigner ladder ==")
    pid = q1("SELECT id FROM proximate_partners WHERE network_id=3 AND status='dd_clear' LIMIT 1")
    for amt, exp in [(5000, 0), (10000, 1), (49999, 1), (60000, 2), (250000, 3)]:
        pf2 = G(ob, f'/api/proximate/disbursements/preflight?partner_id={pid}&amount={amt}')
        cos = [w for w in pf2.get('warnings', []) if 'cosign' in (w.get('code', '') or '')]
        ck(f'cosigners for ${amt}', (cos[0]['params']['count'] if cos else 0), exp)

    # ---- Compliance score == round(avg of criteria) -----------------------
    print("== Compliance score accuracy ==")
    import json as _json
    cur.execute("SELECT id, compliance_score_json FROM proximate_grant_reports WHERE compliance_score_json IS NOT NULL LIMIT 8")
    for rid, cs in cur.fetchall():
        try:
            data = _json.loads(cs)
        except Exception:
            continue
        items = data if isinstance(data, list) else (data.get('items') or [])
        vals = [i.get('score') for i in items if isinstance(i, dict) and isinstance(i.get('score'), (int, float))]
        overall = data.get('overall') if isinstance(data, dict) else None
        if vals and overall is not None:
            ck(f'report {rid} overall == round(avg criteria)', round(float(overall)), round(sum(vals) / len(vals)))

    # ---- Negative controls: donor isolation + RBAC + tenant isolation -----
    print("== Negative controls ==")
    own = [g['id'] for g in grants]
    if own:
        status_ck('donor own grant 200', dn.get(a.base + f'/api/proximate/grants/{own[0]}').status_code, [200])
    all_g = [r[0] for r in (cur.execute("SELECT id FROM proximate_grants WHERE network_id=3") or []) or cur.fetchall()]
    for gid in [g for g in all_g if g not in own][:3]:
        status_ck(f'donor other-grant {gid} 403', dn.get(a.base + f'/api/proximate/grants/{gid}').status_code, [403, 404])
    status_ck('donor create-round 403', dn.post(a.base + '/api/proximate/rounds', json={'title': 'x', 'trigger_type': 'disaster'}).status_code, [403])
    status_ck('donor grievance-queue 403', dn.get(a.base + '/api/proximate/grievances').status_code, [403])
    an = requests.Session(); an.headers.update(H)
    status_ck('anon overview 401/403', an.get(a.base + '/api/proximate/overview').status_code, [401, 403])
    # tenant isolation: a proximate donor on ANOTHER tenant host must not read
    # other users' proximate data (own data currently leaks via the fallback —
    # tracked separately; this asserts the confidentiality boundary at least).
    fh = requests.Session(); fh.headers.update(H)
    fh.post(a.other_host + '/api/auth/login', json={'email': a.donor, 'password': a.donor_pw})
    for gid in [g for g in all_g if g not in own][:2]:
        status_ck(f'donor other-grant {gid} on other-host 403', fh.get(a.other_host + f'/api/proximate/grants/{gid}').status_code, [403, 404])

    db.close()
    print(f"\n{PASS} passed, {FAIL} failed")
    return 1 if FAIL else 0


if __name__ == '__main__':
    sys.exit(main())
