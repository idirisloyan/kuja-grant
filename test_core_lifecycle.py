#!/usr/bin/env python3
"""
Kuja Grant — Core lifecycle stability test (in-process, throwaway DB)
=====================================================================
Proves the CORE decision + reporting engine end-to-end by driving the real
Flask routes (via test_client) through the whole chain, asserting the state
machine and the three score signals at every hop:

  donor: create grant (+criteria)  ->  publish (open)
  ngo:   apply  ->  fill responses  ->  submit  (auto_score written)
  (auto-assign reviewer, else admin assigns)
  reviewer: score  ->  complete     (human_score + final_score, status 'scored')
  donor: award                       (status 'awarded')
  ngo:   create report -> submit     (ai_analysis attached, status 'submitted')
  donor: review -> accept            (status 'accepted')

Runs against an isolated SQLite file (KUJA_DB_PATH) seeded by seed.py, so it
NEVER touches production. Zero external calls: /submit auto-scoring is the
deterministic ScoringEngine and report analysis falls back to the offline
analyzer when no ANTHROPIC key is present.

Usage:
  KUJA_DB_PATH=/path/to/throwaway.db python seed.py --force   # once
  KUJA_DB_PATH=/path/to/throwaway.db python test_core_lifecycle.py
"""
import os
import sys
import json

# Force dev config against the isolated DB BEFORE importing the app.
os.environ.pop('DATABASE_URL', None)  # ensure we don't hit prod Postgres
if not os.environ.get('KUJA_DB_PATH'):
    print("ERROR: set KUJA_DB_PATH to the seeded throwaway SQLite file")
    sys.exit(2)

from app import create_app                      # noqa: E402
from app.extensions import db                   # noqa: E402
from app.models import User, Review, Application  # noqa: E402

app = create_app('development')
app.testing = True

DONOR = 'sarah@globalhealth.org'
NGO = 'fatima@amani.org'
PW = 'pass123'
HDR = {'X-Requested-With': 'XMLHttpRequest'}

results = []


def check(name, cond, detail=''):
    results.append(('PASS' if cond else 'FAIL', name, detail))
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}" + (f" -- {detail}" if detail and not cond else ''))
    if not cond:
        raise AssertionError(f"{name}: {detail}")


def client_login(email, pw=PW):
    c = app.test_client()
    r = c.post('/api/auth/login', json={'email': email, 'password': pw}, headers=HDR, follow_redirects=True)
    assert r.status_code == 200, f"login {email} -> {r.status_code}: {r.get_data(as_text=True)[:200]}"
    return c


def body(r):
    try:
        return r.get_json() or {}
    except Exception:
        return {}


def main():
    print("=" * 68)
    print("KUJA CORE LIFECYCLE — in-process, throwaway DB")
    print("=" * 68)

    donor = client_login(DONOR)
    ngo = client_login(NGO)

    # ---- 1. Donor creates a grant with weighted criteria -----------------
    criteria = [
        {'id': 'approach', 'label': 'Programme approach', 'weight': 50,
         'description': 'Soundness of the proposed approach'},
        {'id': 'capacity', 'label': 'Organisational capacity', 'weight': 50,
         'description': 'Ability to deliver at scale'},
    ]
    r = donor.post('/api/grants', json={
        'title': '[E2E-TEST] Core Lifecycle Grant',
        'description': 'In-process lifecycle stability check for the Kuja core engine.',
        'total_funding': 100000, 'currency': 'USD',
        'deadline': '2027-12-31',
        'sectors': ['Health'], 'countries': ['Kenya'],
        'criteria': criteria,
        'status': 'draft',
    }, headers=HDR, follow_redirects=True)
    check("donor creates grant (+criteria)", r.status_code in (200, 201),
          f"{r.status_code}: {r.get_data(as_text=True)[:200]}")
    gid = body(r)['grant']['id']

    # ---- 2. Donor publishes ---------------------------------------------
    r = donor.put(f'/api/grants/{gid}', json={'status': 'open'}, headers=HDR, follow_redirects=True)
    check("donor publishes grant (open)", r.status_code == 200, str(r.status_code))
    r = donor.get(f'/api/grants/{gid}', headers=HDR, follow_redirects=True)
    g = body(r).get('grant', body(r))
    check("published grant carries its criteria", len(g.get('criteria') or []) == 2,
          f"criteria={g.get('criteria')}")

    # ---- 3. NGO creates an application ----------------------------------
    r = ngo.post('/api/applications', json={'grant_id': gid}, headers=HDR, follow_redirects=True)
    check("ngo creates application", r.status_code in (200, 201),
          f"{r.status_code}: {r.get_data(as_text=True)[:200]}")
    aid = (body(r).get('application') or {}).get('id') or body(r).get('id')
    check("application id returned", bool(aid), str(body(r)))

    # ---- 4. NGO fills responses -----------------------------------------
    r = ngo.put(f'/api/applications/{aid}', json={'responses': {
        'approach': 'We deploy community health workers with a referral network, '
                    'targeting 40 villages with measurable maternal-health indicators.',
        'capacity': 'We have delivered three comparable grants totalling $2.1M over '
                    'five years with clean independent audits and 96% burn accuracy.',
    }}, headers=HDR, follow_redirects=True)
    check("ngo saves responses", r.status_code == 200,
          f"{r.status_code}: {r.get_data(as_text=True)[:200]}")

    # ---- 5. NGO submits (deterministic auto-score) ----------------------
    r = ngo.post(f'/api/applications/{aid}/submit', headers=HDR, follow_redirects=True)
    check("ngo submits application", r.status_code == 200,
          f"{r.status_code}: {r.get_data(as_text=True)[:250]}")
    a = body(r).get('application') or {}
    check("submit -> status 'submitted'", a.get('status') == 'submitted', a.get('status'))
    check("submit writes auto_score (deterministic)",
          isinstance(a.get('auto_score'), (int, float)), f"auto_score={a.get('auto_score')}")
    check("auto_score alias == legacy ai_score",
          a.get('auto_score') == a.get('ai_score'),
          f"auto={a.get('auto_score')} ai={a.get('ai_score')}")

    # ---- 6. Discover the reviewer panel (auto-assigned on submit) -------
    with app.app_context():
        panel = [(rv.id, db.session.get(User, rv.reviewer_user_id).email)
                 for rv in Review.query.filter_by(application_id=aid).all()]
    if not panel:
        # Fallback: no auto-assign configured -> donor assigns one seeded reviewer.
        with app.app_context():
            reviewer = User.query.filter_by(role='reviewer').first()
            reviewer_id, reviewer_email = reviewer.id, reviewer.email
        r = donor.post('/api/reviews', json={
            'application_id': aid, 'reviewer_user_id': reviewer_id}, headers=HDR, follow_redirects=True)
        check("reviewer assigned (donor -> POST /reviews)", r.status_code in (200, 201),
              f"{r.status_code}: {r.get_data(as_text=True)[:200]}")
        panel = [(body(r)['review']['id'], reviewer_email)]
    check("reviewer panel assigned on submit", len(panel) >= 1, f"panel={panel}")
    print(f"       reviewer panel ({len(panel)}): {[e for _, e in panel]}")

    # ---- 7. Every panel reviewer scores + completes ---------------------
    for review_id, reviewer_email in panel:
        rc = client_login(reviewer_email)
        r = rc.put(f'/api/reviews/{review_id}', json={
            'scores': {'approach': 82, 'capacity': 90},
            'comments': {'approach': 'Strong, well-targeted approach.',
                         'capacity': 'Proven delivery capacity.'},
        }, headers=HDR, follow_redirects=True)
        check(f"reviewer {reviewer_email} saves scores", r.status_code == 200,
              f"{r.status_code}: {r.get_data(as_text=True)[:200]}")
        rv = body(r).get('review') or {}
        check(f"{reviewer_email} overall auto-computed from weights (=86)",
              rv.get('overall_score') == 86, f"overall={rv.get('overall_score')}")
        r = rc.post(f'/api/reviews/{review_id}/complete', headers=HDR, follow_redirects=True)
        check(f"reviewer {reviewer_email} completes review", r.status_code == 200,
              f"{r.status_code}: {r.get_data(as_text=True)[:200]}")

    # ---- 8. Application now scored: human + final blended ----------------
    with app.app_context():
        a2 = db.session.get(Application, aid)
        st, hs, fs, auto = a2.status, a2.human_score, a2.final_score, a2.ai_score
    check("all reviews complete -> status 'scored'", st == 'scored', st)
    check("human_score set from reviewer", hs == 86, f"human={hs}")
    check("final_score blended 0.4*auto + 0.6*human",
          abs(fs - round(auto * 0.4 + hs * 0.6, 2)) < 0.05,
          f"final={fs} auto={auto} human={hs}")

    # ---- 9. Donor awards -------------------------------------------------
    r = donor.patch(f'/api/applications/{aid}/status', json={'status': 'awarded'}, headers=HDR, follow_redirects=True)
    check("donor awards application", r.status_code == 200,
          f"{r.status_code}: {r.get_data(as_text=True)[:200]}")
    check("award -> status 'awarded'", body(r).get('status') == 'awarded', body(r).get('status'))

    # ---- 10. NGO creates + submits a report -----------------------------
    r = ngo.post('/api/reports', json={
        'grant_id': gid, 'application_id': aid,
        'report_type': 'progress', 'reporting_period': 'Q1 2027',
        'title': 'Q1 Progress Report',
        'content': {'narrative': 'Reached 12 of 40 target villages; 1,840 consultations; '
                                 'budget burn 24% on plan. No safeguarding incidents.'},
        'due_date': '2027-04-30',
    }, headers=HDR, follow_redirects=True)
    check("ngo creates report", r.status_code in (200, 201),
          f"{r.status_code}: {r.get_data(as_text=True)[:200]}")
    rid = body(r)['report']['id']

    r = ngo.post(f'/api/reports/{rid}/submit', headers=HDR, follow_redirects=True)
    check("ngo submits report", r.status_code == 200,
          f"{r.status_code}: {r.get_data(as_text=True)[:250]}")
    rep = body(r).get('report') or {}
    check("report submit -> status 'submitted'", rep.get('status') == 'submitted', rep.get('status'))
    check("report carries ai_analysis (pre-score for donor)",
          isinstance(rep.get('ai_analysis'), dict) and len(rep.get('ai_analysis')) > 0,
          f"ai_analysis={str(rep.get('ai_analysis'))[:120]}")

    # ---- 11. Report appears in the donor's approval inbox ---------------
    r = donor.get('/api/reports/?status=submitted', headers=HDR, follow_redirects=True)
    check("donor inbox lists submitted report", r.status_code == 200, str(r.status_code))
    inbox = body(r).get('reports') or []
    check("submitted report visible to donor (scoped to their grants)",
          any(x.get('id') == rid for x in inbox), f"{len(inbox)} report(s) in inbox")

    # ---- 12. Donor accepts (approval action) ----------------------------
    r = donor.post(f'/api/reports/{rid}/review', json={
        'action': 'accept', 'notes': 'Clear, on-plan. Accepted.'}, headers=HDR, follow_redirects=True)
    check("donor accepts report", r.status_code == 200,
          f"{r.status_code}: {r.get_data(as_text=True)[:200]}")
    check("report -> status 'accepted'", (body(r).get('report') or {}).get('status') == 'accepted',
          (body(r).get('report') or {}).get('status'))

    print("\n" + "=" * 68)
    passed = sum(1 for x in results if x[0] == 'PASS')
    print(f"RESULT: {passed}/{len(results)} checks passed")
    print("=" * 68)


if __name__ == '__main__':
    try:
        main()
    except AssertionError as e:
        print(f"\n*** LIFECYCLE BROKE: {e}")
        passed = sum(1 for x in results if x[0] == 'PASS')
        print(f"RESULT: {passed}/{len(results)} checks passed before failure")
        sys.exit(1)
    fails = sum(1 for x in results if x[0] == 'FAIL')
    sys.exit(1 if fails else 0)
