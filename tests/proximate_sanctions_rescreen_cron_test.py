#!/usr/bin/env python3
"""Regression test — Proximate weekly sanctions-rescreen cron must not 500
on naive DB timestamps.

The bug (live on prod from Phase 690 / 2026-06-27 until 2026-08-24): the
cron skipped partners screened in the last 6 days via

    if p.sanctions_checked_at and p.sanctions_checked_at >= stale_threshold:

where `stale_threshold` is timezone-AWARE (datetime.now(timezone.utc) - 6d)
but `sanctions_checked_at` comes back timezone-NAIVE from Postgres
(column is `db.DateTime`, i.e. TIMESTAMP WITHOUT TIME ZONE). Comparing
naive >= aware raises `TypeError: can't compare offset-naive and
offset-aware datetimes`, which 500'd the ENTIRE endpoint. Result: a Sudan
fund's only recurring sanctions re-screen was silently dead for ~2 months
(green only on the one week every dd_clear partner happened to have a NULL
checked_at, so the comparison was short-circuited).

This test reproduces the exact condition (naive checked_at from SQLite,
which — like Postgres — returns naive datetimes) and asserts the endpoint
returns 200 with correct skip/rescreen accounting. Before the fix it goes
RED with a 500; after the fix it is GREEN. That is the mutation proof: run
it against the pre-fix code (revert the tz-coercion) and it fails.

Run:  python tests/proximate_sanctions_rescreen_cron_test.py
"""
import os
import sys
import tempfile
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault('SECRET_KEY', 'x' * 64)
os.environ['CRON_SECRET'] = 'test-cron-secret'
os.environ.pop('DATABASE_URL', None)  # force 'testing' path to stay off prod

# Use a temp FILE (not :memory:) so the schema persists across the pooled
# connections the test client opens.
_DBFILE = os.path.join(tempfile.gettempdir(), 'kuja_rescreen_regression.db')
if os.path.exists(_DBFILE):
    os.remove(_DBFILE)

from app import config as _cfg  # noqa: E402
_cfg.TestConfig.SQLALCHEMY_DATABASE_URI = f'sqlite:///{_DBFILE}'

from app import create_app, db  # noqa: E402
from app.routes import proximate_routes as pr  # noqa: E402
from app.models.proximate_endorsement import ProximatePartner  # noqa: E402

PASS = FAIL = 0


def check(ok, name, detail=""):
    global PASS, FAIL
    PASS += ok
    FAIL += (not ok)
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    return ok


def main():
    app = create_app('testing')

    # Stub the actual screen so the test never touches external sanctions
    # APIs. The bug is in the recency comparison that runs BEFORE this call,
    # so a no-op screen still exercises the regression fully. The stub sets
    # sanctions_checked_at the way the real function does.
    screened_ids = []

    def _fake_screen(partner):
        screened_ids.append(partner.id)
        partner.sanctions_checked_at = datetime.now(timezone.utc)
        db.session.commit()

    pr._run_partner_sanctions_screen = _fake_screen

    with app.app_context():
        db.create_all()

        now = datetime.now(timezone.utc)
        # NAIVE datetimes on purpose — this is what Postgres/SQLite return
        # for a `db.DateTime` column, and the exact trigger for the bug.
        recent_naive = (now - timedelta(days=1)).replace(tzinfo=None)
        stale_naive = (now - timedelta(days=30)).replace(tzinfo=None)

        a = ProximatePartner(network_id=3, name='ZZ Recent Naive',
                             status='dd_clear', sanctions_checked_at=recent_naive)
        b = ProximatePartner(network_id=3, name='ZZ Stale Naive',
                             status='dd_clear', sanctions_checked_at=stale_naive)
        c = ProximatePartner(network_id=3, name='ZZ Never Screened',
                             status='dd_clear', sanctions_checked_at=None)
        # A non-dd_clear partner must be ignored entirely.
        d = ProximatePartner(network_id=3, name='ZZ Not Clear',
                             status='intake', sanctions_checked_at=stale_naive)
        db.session.add_all([a, b, c, d])
        db.session.commit()

        client = app.test_client()
        # X-Requested-With satisfies the app's custom CSRF gate the same way
        # the GitHub-Actions cron curl does (it passes CSRF and hits the 500).
        cron_headers = {
            'Authorization': 'Bearer test-cron-secret',
            'X-Requested-With': 'XMLHttpRequest',
        }
        resp = client.post(
            '/api/proximate/monitoring/sanctions-rescreen',
            headers=cron_headers,
        )

        # THE regression assertion: pre-fix this was 500 (TypeError on the
        # naive>=aware comparison against partner A/B).
        check(resp.status_code == 200,
              'endpoint returns 200 (no naive/aware TypeError)',
              f'got {resp.status_code}: {resp.get_data(as_text=True)[:160]}')

        if resp.status_code == 200:
            j = resp.get_json()
            check(j.get('success') is True, 'success=true')
            # Recent (A) is within 6 days → skipped. Stale (B) + never (C)
            # → rescreened. Non-dd_clear (D) → never considered.
            check(j.get('skipped_recent') == 1,
                  'recent partner skipped', f"skipped_recent={j.get('skipped_recent')}")
            check(j.get('rescreened') == 2,
                  'stale + never-screened rescreened',
                  f"rescreened={j.get('rescreened')}")
            check(j.get('errors') == 0, 'no per-partner errors',
                  f"errors={j.get('errors')}")
            check(set(screened_ids) == {b.id, c.id},
                  'exactly the stale + never-screened partners were screened',
                  f'screened={sorted(screened_ids)} expected={sorted([b.id, c.id])}')

        # Negative control: a bad secret must be rejected 403 (proves auth
        # still gates the endpoint after the change).
        bad = client.post('/api/proximate/monitoring/sanctions-rescreen',
                          headers={'Authorization': 'Bearer wrong',
                                   'X-Requested-With': 'XMLHttpRequest'})
        check(bad.status_code == 403, 'wrong CRON_SECRET -> 403',
              f'got {bad.status_code}')

    print(f"\n{PASS} passed, {FAIL} failed")
    return 1 if FAIL else 0


if __name__ == '__main__':
    sys.exit(main())
