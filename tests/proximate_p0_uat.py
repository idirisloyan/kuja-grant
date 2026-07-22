#!/usr/bin/env python3
"""Proximate P0 — repeatable, prod-safe, stamped UAT harness (Phase 717).

Codifies the manual SoP end-to-end UAT into a single repeatable script so
the full money-movement chain can be re-verified on demand instead of by
hand. Every artifact it creates is tagged with a unique STAMP so a run is
easy to find and clean up afterwards.

SAFETY: default mode is read-only (login + connectivity + attention-queue
+ overview). Mutating the fund requires an explicit --run. Cleanup of a
prior run's artifacts is --cleanup <STAMP>.

Usage:
  # read-only smoke (no data created)
  python tests/proximate_p0_uat.py \
      --base https://web-production-6f8a.up.railway.app \
      --ob ob@proximate.org --ob2 ob2@proximate.org --password pass123

  # full mutating P0 chain (creates stamped artifacts)
  python tests/proximate_p0_uat.py ... --run

  # clean up a prior run
  python tests/proximate_p0_uat.py ... --cleanup P0-20260708-abc123
"""
import argparse
import sys
import time

try:
    import requests
except ImportError:
    print("pip install requests")
    sys.exit(2)

PASS, FAIL = 0, 0
CREATED = {}


def _mark(ok, name, detail=""):
    global PASS, FAIL
    if ok:
        PASS += 1
    else:
        FAIL += 1
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    return ok


class Client:
    """A logged-in Proximate API session."""

    def __init__(self, base, override='proximate'):
        self.base = base.rstrip('/')
        self.s = requests.Session()
        self.s.headers.update({
            'X-Network-Override': override,
            'X-Requested-With': 'XMLHttpRequest',
        })
        self.email = None

    def login(self, email, password):
        r = self.s.post(f'{self.base}/api/auth/login',
                        json={'email': email, 'password': password}, timeout=30)
        self.email = email
        return r

    def get(self, path, **kw):
        return self.s.get(f'{self.base}{path}', timeout=60, **kw)

    def post(self, path, json=None, **kw):
        return self.s.post(f'{self.base}{path}', json=json or {}, timeout=90, **kw)


def _json(r):
    try:
        return r.json()
    except Exception:
        return {}


def readonly_checks(ob):
    print("\n== Read-only connectivity ==")
    r = ob.get('/api/proximate/overview')
    _mark(r.status_code == 200, 'OB overview 200', f'status={r.status_code}')
    r = ob.get('/api/proximate/attention-queue')
    b = _json(r)
    _mark(r.status_code == 200 and 'items' in b, 'attention-queue 200 + shape',
          f'total={b.get("total")} counts={b.get("counts")}')
    r = ob.get('/api/proximate/rounds')
    _mark(r.status_code == 200, 'rounds list 200', f'status={r.status_code}')
    r = ob.get('/api/proximate/grievances')
    _mark(r.status_code == 200, 'grievance queue 200 (OB-only)', f'status={r.status_code}')


# Statuses the backend accepts as a usable payment route. Mirrors the
# filter in api_disbursement_preflight (proximate_routes.py) — 'active' is
# a legacy value that predates 'verified' and still means routable.
_ROUTABLE_METHOD_STATUSES = ('verified', 'active')


def fundable_partner_checks(ob, sample_limit=25):
    """INVARIANT: the tenant can always move money to at least one partner.

    Read-only, so it is safe against prod and runs on every invocation.

    The three preconditions are checked together on ONE partner, because
    satisfying them separately is not the same thing: a cleared partner
    with no verified route, or a routable partner still in dd_pending,
    both leave the fund unable to disburse. The UAT script itself creates
    a fresh partner every run and would happily pass its own chain while
    the pre-existing roster had silently degraded — that is exactly the
    regression this catches.

    A degradation here is usually caused by a bulk status change, an FSP
    being retired (which unverifies its routes), or a partner suspension
    that swept more rows than intended. Finding it in CI beats finding it
    in the middle of a UAT session with the donor watching.
    """
    print("\n== Fundable-partner invariant ==")
    r = ob.get('/api/proximate/partners?status=dd_clear')
    body = _json(r)
    partners = body.get('partners', [])
    if not _mark(r.status_code == 200, 'cleared-partner list 200',
                 f'status={r.status_code}'):
        return
    if not _mark(len(partners) > 0, 'at least one dd_clear partner exists',
                 f'count={len(partners)}'):
        return

    # Stop at the first fully-fundable partner; the invariant is "at least
    # one", not "all of them". sample_limit bounds the request count on a
    # large roster — 25 partners is 50 requests worst case.
    fundable = None
    inspected = 0
    no_route = []
    for p in partners[:sample_limit]:
        inspected += 1
        pid = p.get('id')
        mr = ob.get(f'/api/proximate/partners/{pid}/disbursement-methods')
        methods = _json(mr).get('methods', [])
        routable = [m for m in methods
                    if m.get('status') in _ROUTABLE_METHOD_STATUSES]
        if not routable:
            no_route.append(p.get('name') or f'#{pid}')
            continue
        # The route exists — now confirm the OB's own gate agrees. No
        # amount is passed, so this asks "any disbursement at all", which
        # keeps the cosign ladder out of the assertion.
        pf = _json(ob.get(f'/api/proximate/disbursements/preflight?partner_id={pid}'))
        if pf.get('can_disburse'):
            fundable = {
                'id': pid,
                'name': p.get('name'),
                'method_id': routable[0].get('id'),
                'method_status': routable[0].get('status'),
            }
            break

    _mark(
        fundable is not None,
        'a cleared partner has a verified payment route and passes preflight',
        (f"partner={fundable['name']} (#{fundable['id']}) "
         f"method #{fundable['method_id']} = {fundable['method_status']}")
        if fundable else
        (f'inspected {inspected}/{len(partners)} cleared partners; '
         f'none fundable. Without a route: {", ".join(no_route[:5]) or "n/a"}'),
    )


def run_p0(ob, ob2, stamp):
    print(f"\n== Mutating P0 chain (stamp={stamp}) ==")

    # 1. Partner
    r = ob.post('/api/proximate/partners',
                {'name': f'UAT Partner {stamp}', 'contact_phone': '+249900000009'})
    partner = _json(r).get('partner', {})
    pid = partner.get('id')
    CREATED['partner_id'] = pid
    if not _mark(r.status_code == 200 and pid, 'create partner', f'id={pid}'):
        return

    # 2. Round + participant + submit + two signatures -> auto-activate
    r = ob.post('/api/proximate/rounds',
                {'title': f'UAT Round {stamp}', 'trigger_type': 'disaster',
                 'trigger_summary': f'automated UAT {stamp}'})
    rnd = _json(r).get('round', {})
    rid = rnd.get('id')
    CREATED['round_id'] = rid
    if not _mark(r.status_code == 200 and rid, 'create round', f'id={rid}'):
        return
    r = ob.post(f'/api/proximate/rounds/{rid}/participants', {'partner_id': pid})
    _mark(r.status_code == 200, 'add participant', f'status={r.status_code}')
    r = ob.post(f'/api/proximate/rounds/{rid}/submit')
    _mark(r.status_code == 200, 'submit round for review', f'status={r.status_code}')
    r = ob.post(f'/api/proximate/rounds/{rid}/sign', {'declared_no_coi': True})
    _mark(r.status_code == 200, 'OB #1 signs', f'status={r.status_code}')
    r = ob2.post(f'/api/proximate/rounds/{rid}/sign', {'declared_no_coi': True})
    _mark(r.status_code == 200, 'OB #2 signs', f'status={r.status_code}')
    r = ob.get(f'/api/proximate/rounds/{rid}')
    _mark(_json(r).get('round', {}).get('status') == 'active',
          'round auto-activated', f"status={_json(r).get('round', {}).get('status')}")

    # 3. Small disbursement (< $10k) -> report token -> submit -> verify
    r = ob.post('/api/proximate/disbursements',
                {'partner_id': pid, 'amount_usd': 4000, 'round_id': rid,
                 'purpose': f'UAT small {stamp}'})
    d1 = _json(r).get('disbursement', {})
    d1id = d1.get('id')
    CREATED['disbursement_small'] = d1id
    _mark(r.status_code == 200 and d1.get('status') == 'pending_report',
          'small disbursement issued (no cosign)', f'id={d1id} status={d1.get("status")}')
    tok = ob.get(f'/api/proximate/disbursements/{d1id}').json().get('disbursement', {}).get('report_token')
    if tok:
        r = ob.post(f'/api/proximate/disbursement-reports/{tok}',
                    {'activity_happened': True, 'people_helped': 12,
                     'issues': f'UAT {stamp}'})
        _mark(r.status_code == 200, 'partner report via token', f'status={r.status_code}')
        r = ob.post(f'/api/proximate/disbursements/{d1id}/verify', {'verdict': 'verified'})
        _mark(r.status_code == 200, 'OB verify small disbursement', f'status={r.status_code}')

    # 4. Large disbursement ($10k) -> cosign by OB2 -> report -> assign verifier
    r = ob.post('/api/proximate/disbursements',
                {'partner_id': pid, 'amount_usd': 10000, 'round_id': rid,
                 'purpose': f'UAT large {stamp}'})
    d2 = _json(r).get('disbursement', {})
    d2id = d2.get('id')
    CREATED['disbursement_large'] = d2id
    _mark(r.status_code == 200 and d2.get('status') == 'pending_cosign',
          'large disbursement pending_cosign', f'id={d2id} status={d2.get("status")}')
    r = ob.post(f'/api/proximate/disbursements/{d2id}/cosign')
    _mark(r.status_code == 403, 'sender cannot cosign own (403)', f'status={r.status_code}')
    r = ob2.post(f'/api/proximate/disbursements/{d2id}/cosign')
    _mark(r.status_code == 200, 'OB2 cosigns', f'status={r.status_code}')
    tok2 = ob.get(f'/api/proximate/disbursements/{d2id}').json().get('disbursement', {}).get('report_token')
    if tok2:
        r = ob.post(f'/api/proximate/disbursement-reports/{tok2}',
                    {'activity_happened': True, 'people_helped': 40})
        _mark(r.status_code == 200, 'report for cosigned disbursement', f'status={r.status_code}')
    r = ob.post(f'/api/proximate/disbursements/{d2id}/assign-verifier')
    _mark(r.status_code in (200, 409), 'assign independent verifier',
          f'status={r.status_code} ({_json(r).get("error", "ok")})')

    # 5. Intervention + independent response
    r = ob.post('/api/proximate/interventions',
                {'kind': 'warning', 'partner_id': pid, 'reason': f'UAT {stamp}'})
    iv = _json(r).get('intervention', {}) or _json(r)
    ivid = iv.get('intervention_id') or iv.get('id')
    CREATED['intervention_id'] = ivid
    _mark(r.status_code == 200, 'open intervention', f'id={ivid}')

    # 6. Grievances — plain + fraud/safety auto-freeze (the SoP-14 path)
    r = ob.post('/api/proximate/public/grievances',
                {'description': f'UAT plain grievance {stamp}', 'category': 'other'})
    CREATED['grievance_plain'] = _json(r).get('grievance_id')
    _mark(r.status_code == 200, 'plain grievance', f'status={r.status_code}')
    r = ob.post('/api/proximate/public/grievances',
                {'description': f'UAT fraud grievance {stamp}', 'category': 'fraud',
                 'partner_id': pid})
    CREATED['grievance_fraud'] = _json(r).get('grievance_id')
    _mark(r.status_code == 200, 'fraud grievance auto-freeze (SoP 14, was 500)',
          f'status={r.status_code}')

    # 7. Close the round
    r = ob.post(f'/api/proximate/rounds/{rid}/close', {'summary': f'UAT closed {stamp}'})
    _mark(r.status_code == 200, 'close round', f'status={r.status_code}')

    print("\nCreated artifacts (stamp %s):" % stamp)
    for k, v in CREATED.items():
        print(f"  {k} = {v}")


def cleanup(ob, stamp):
    """Best-effort: withdraw open interventions + resolve open grievances
    whose text carries the stamp. Rounds/disbursements are left (money-trail
    integrity), but a draft/in_review round with the stamp is cancelled."""
    print(f"\n== Cleanup (stamp={stamp}) ==")
    # Interventions
    r = ob.get('/api/proximate/interventions?status=open')
    for iv in _json(r).get('interventions', []):
        if stamp in (iv.get('reason') or ''):
            ob.post(f"/api/proximate/interventions/{iv['id']}/withdraw",
                    {'reason': f'UAT cleanup {stamp}'})
            print(f"  withdrew intervention #{iv['id']}")
    # Grievances (new/triaged)
    for st in ('new', 'triaged'):
        r = ob.get(f'/api/proximate/grievances?status={st}')
        for g in _json(r).get('grievances', []):
            if stamp in (g.get('description') or ''):
                gid = g['id']
                ob.post(f'/api/proximate/grievances/{gid}/triage')
                ob.post(f'/api/proximate/grievances/{gid}/resolve',
                        {'notes': f'UAT cleanup {stamp}', 'dismissed': True})
                print(f"  resolved grievance #{gid}")
    print("Cleanup complete (rounds/disbursements retained for audit integrity).")


def main():
    ap = argparse.ArgumentParser(description='Proximate P0 stamped UAT harness')
    ap.add_argument('--base', required=True)
    ap.add_argument('--ob', required=True)
    ap.add_argument('--ob2', required=True)
    ap.add_argument('--password', required=True)
    ap.add_argument('--run', action='store_true', help='execute the mutating P0 chain')
    ap.add_argument('--cleanup', metavar='STAMP', help='clean up a prior run by stamp')
    ap.add_argument('--stamp', help='override the run stamp')
    args = ap.parse_args()

    ob = Client(args.base)
    r = ob.login(args.ob, args.password)
    if not _mark(r.status_code == 200, f'login {args.ob}', f'status={r.status_code}'):
        sys.exit(1)

    if args.cleanup:
        cleanup(ob, args.cleanup)
        sys.exit(0)

    readonly_checks(ob)
    fundable_partner_checks(ob)

    if args.run:
        ob2 = Client(args.base)
        r = ob2.login(args.ob2, args.password)
        _mark(r.status_code == 200, f'login {args.ob2}', f'status={r.status_code}')
        # Stamp: date + short suffix. Caller can pass --stamp to make it
        # deterministic; otherwise derive from the process clock.
        stamp = args.stamp or f'P0-{time.strftime("%Y%m%d")}-{int(time.time()) % 100000:05d}'
        run_p0(ob, ob2, stamp)
    else:
        print("\n(read-only mode — pass --run to execute the mutating P0 chain)")

    print(f"\n=== {PASS}/{PASS + FAIL} checks passed ===")
    sys.exit(0 if FAIL == 0 else 1)


if __name__ == '__main__':
    main()
