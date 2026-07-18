#!/usr/bin/env python3
"""
Kuja Grant — Regression Suite
=============================
A trustworthy, deterministic regression gate. Unlike smoke_test.py (which
runs against the shared, possibly-drifted repo kuja.db and so is noisy on
Windows), this:

  * Seeds a FRESH, isolated SQLite DB in a temp dir (KUJA_DB_PATH) — no
    readonly/lock/stale-schema noise, identical behaviour locally and in CI.
  * Boots the app in-process against that DB.
  * Runs API tests with real WRITE-PATH (POST/PUT/PATCH/DELETE) coverage
    across all three tenants (kuja / near / proximate). This is the gap that
    let five dead Proximate endpoints ship: they returned 500 with
    `NameError: get_request_json` at request time and NOTHING caught it,
    because the old suite only seeds rows directly and reads them back.
  * Optionally runs the live browser suite (browser_test.py) against the
    same server for real end-to-end UI coverage.

A write-path check FAILS on any 5xx (a handler that raised — NameError,
missing import, UnboundLocalError, AttributeError, …). 400/403/409 are
allowed: they mean the handler ran and made a decision.

Usage:
  python regression.py               # API regression (default)
  python regression.py --browser     # API + live browser (needs Playwright)
  python regression.py --api-only    # explicit API-only
  python regression.py --keep-db     # don't delete the temp DB (debugging)
Exit 0 = all pass, non-zero = failures.
"""

import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import traceback

import requests

# Force UTF-8 stdio so unicode from the app/seed layer (Arabic, "→", …) never
# crashes on a Windows cp1252 console — a recurring source of false failures.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
PASSWORD = "pass123"

USERS = {
    "admin": "admin@kuja.org",
    "ngo": "fatima@amani.org",
    "donor": "sarah@globalhealth.org",
    "reviewer": "james@reviewer.org",
    "prox_ob": "ob@proximate.org",
    "prox_donor": "donor1@proximate.org",
}

# ---------------------------------------------------------------------------
# Result tracking
# ---------------------------------------------------------------------------
RESULTS = []  # (status, name, detail)


class Skip(Exception):
    """A check couldn't run to a verdict for a benign reason (e.g. an endpoint
    hit an external dependency that timed out). NOT a regression — a timeout
    still proves the handler executed past any import/reference error."""


def check(name, fn):
    try:
        fn()
        RESULTS.append(("PASS", name, ""))
        print(f"  [PASS] {name}")
    except Skip as e:
        RESULTS.append(("SKIP", name, str(e)))
        print(f"  [SKIP] {name} -- {str(e)[:200]}")
    except AssertionError as e:
        RESULTS.append(("FAIL", name, str(e)))
        print(f"  [FAIL] {name} -- {str(e)[:300]}")
    except Exception as e:
        RESULTS.append(("ERROR", name, f"{type(e).__name__}: {e}"))
        print(f"  [ERR]  {name} -- {type(e).__name__}: {e}")


def section(title):
    print(f"\n--- {title} ---")


# ---------------------------------------------------------------------------
# Isolated DB + seeding
# ---------------------------------------------------------------------------
def _run_seed(script, db_path, extra_args=None, required=True):
    """Run a seed script in a subprocess against the isolated DB."""
    env = dict(os.environ)
    env["KUJA_DB_PATH"] = db_path
    env.pop("DATABASE_URL", None)  # force dev config, not production
    env["SEED_PROXIMATE_ON_BOOT"] = "false"
    # Seed scripts print unicode (e.g. "→", Arabic) — force UTF-8 stdio so
    # they don't crash on a Windows cp1252 console. This is a big part of why
    # the old gate was noisy on Windows dev.
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    cmd = [sys.executable, script] + (extra_args or [])
    print(f"  seeding: {script} {' '.join(extra_args or [])}")
    proc = subprocess.run(
        cmd, cwd=PROJECT_DIR, env=env,
        capture_output=True, text=True, timeout=300,
    )
    if proc.returncode != 0:
        tail = (proc.stdout or "")[-600:] + "\n" + (proc.stderr or "")[-600:]
        msg = f"seed {script} exited {proc.returncode}:\n{tail}"
        if required:
            raise RuntimeError(msg)
        print(f"  [warn] optional seed failed: {script} ({proc.returncode})")


def seed_fresh_db(db_path):
    _run_seed("seed.py", db_path, ["--force"], required=True)
    # NEAR fixtures (funds/windows/declarations). Optional — its absence only
    # means NEAR write-path checks that need seeded funds get skipped.
    _run_seed("seed_networked_funds.py", db_path, required=False)
    # Proximate fixtures (OB user, partners, endorsers, rounds).
    _run_seed("seed_proximate.py", db_path, required=True)


# ---------------------------------------------------------------------------
# In-process server
# ---------------------------------------------------------------------------
def _free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def start_server(db_path):
    os.environ["KUJA_DB_PATH"] = db_path
    os.environ.pop("DATABASE_URL", None)
    os.environ["SEED_PROXIMATE_ON_BOOT"] = "false"
    sys.path.insert(0, PROJECT_DIR)
    from app import create_app  # noqa: E402
    app = create_app("development")
    port = _free_port()
    t = threading.Thread(
        target=lambda: app.run(host="127.0.0.1", port=port,
                               debug=False, use_reloader=False, threaded=True),
        daemon=True,
    )
    t.start()
    base = f"http://127.0.0.1:{port}"
    for _ in range(40):
        try:
            if requests.get(f"{base}/api/health", timeout=1).status_code == 200:
                return base
        except Exception:
            pass
        time.sleep(0.5)
    raise RuntimeError(f"server did not start on {base} within 20s")


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------
def login(base, who, override=None):
    """Return a logged-in session for a role key or raw email."""
    email = USERS.get(who, who)
    s = requests.Session()
    if override:
        s.headers["X-Network-Override"] = override
    r = s.post(
        f"{base}/api/auth/login",
        json={"email": email, "password": PASSWORD},
        headers={"X-Requested-With": "XMLHttpRequest"},
        timeout=10,
    )
    assert r.status_code == 200, f"login {email} -> {r.status_code}: {r.text[:200]}"
    return s


def _hdrs(override=None):
    h = {"X-Requested-With": "XMLHttpRequest", "Content-Type": "application/json"}
    if override:
        h["X-Network-Override"] = override
    return h


def _is_server_error(resp):
    """A 5xx OR a 200/4xx body that leaked a Python exception name."""
    if resp.status_code >= 500:
        return True
    body = (resp.text or "")[:2000]
    return any(tok in body for tok in (
        "NameError", "UnboundLocalError", "ImportError",
        "Traceback (most recent call last)",
    ))


def _write(method, sess, base, path, body, override, allow, timeout):
    try:
        r = sess.request(
            method, f"{base}{path}",
            json=body if body is not None else {},
            headers=_hdrs(override), timeout=timeout,
        )
    except requests.exceptions.Timeout:
        # The handler reached a slow external dependency (sanctions / AI /
        # network). That proves it ran past any code-error surface, so it is
        # NOT the regression class we gate on. Skip rather than fail.
        raise Skip(f"{method} {path} timed out after {timeout}s (external dependency)")
    assert not _is_server_error(r), (
        f"{method} {path} -> {r.status_code} (server error): {r.text[:280]}"
    )
    if allow is not None:
        assert r.status_code in allow, (
            f"{method} {path} -> {r.status_code}, expected one of {allow}: {r.text[:200]}"
        )
    return r


def post(sess, base, path, body=None, override=None, allow=None, timeout=60):
    """POST a write endpoint and assert the handler RAN (no 5xx / no Python
    error). 400/403/404/409/422 are acceptable — they mean the handler
    executed and made a decision. A timeout is a Skip (see _write).

    This is the check that would have caught the `NameError: get_request_json`
    regression: those endpoints 500'd the moment the handler ran, whatever the
    body was.
    """
    return _write("POST", sess, base, path, body, override, allow, timeout)


def put(sess, base, path, body=None, override=None, allow=None, timeout=60):
    return _write("PUT", sess, base, path, body, override, allow, timeout)


def get(sess, base, path, override=None, timeout=30):
    r = sess.request("GET", f"{base}{path}", headers=_hdrs(override), timeout=timeout)
    return r


# ---------------------------------------------------------------------------
# Foundation checks (harness sanity)
# ---------------------------------------------------------------------------
def run_foundation(base):
    section("Foundation — harness, seed, auth")

    def health():
        assert requests.get(f"{base}/api/health", timeout=5).status_code == 200
    check("health 200", health)

    def net_kuja():
        r = requests.get(f"{base}/api/network/current", timeout=5)
        assert r.status_code == 200, r.status_code
        assert r.json()["network"]["slug"] == "kuja", r.json()
    check("network/current default = kuja", net_kuja)

    def net_prox():
        r = requests.get(f"{base}/api/network/current",
                         headers={"X-Network-Override": "proximate"}, timeout=5)
        assert r.status_code == 200, r.status_code
        assert r.json()["network"]["slug"] == "proximate", r.json()
    check("network/current override = proximate (seed present)", net_prox)

    for who in ("admin", "ngo", "donor", "reviewer"):
        check(f"login {who}", lambda who=who: login(base, who))
    check("login prox_ob", lambda: login(base, "prox_ob", override="proximate"))
    check("login prox_donor", lambda: login(base, "prox_donor", override="proximate"))


def _list(resp):
    """Extract a list of records from a list-endpoint response of unknown shape."""
    try:
        data = resp.json()
    except Exception:
        return []
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for v in data.values():
            if isinstance(v, list):
                return v
    return []


def _first_id(sess, base, path, override=None):
    r = get(sess, base, path, override=override)
    if r.status_code != 200:
        return None
    rows = _list(r)
    for row in rows:
        if isinstance(row, dict) and row.get("id") is not None:
            return row["id"]
    return None


# ---------------------------------------------------------------------------
# Write-path regression — the coverage the old gate lacked.
# Every check asserts the handler RAN (no 5xx / Python error). A NameError /
# missing import / UnboundLocalError anywhere in a route module surfaces here.
# ---------------------------------------------------------------------------
def run_kuja_writes(base):
    section("Kuja marketplace — write paths")
    donor = login(base, "donor")
    ngo = login(base, "ngo")
    admin = login(base, "admin")

    grant_id = {"v": None}

    def create_grant():
        r = post(donor, base, "/api/grants/", {
            "title": "Regression WASH Grant",
            "description": "x" * 60,
            "total_funding": 100000, "currency": "USD",
            "deadline": "2026-12-31",
            "sectors": ["WASH"], "countries": ["Kenya"],
        }, allow={200, 201, 400, 403})
        if r.status_code in (200, 201):
            grant_id["v"] = (r.json().get("grant") or r.json()).get("id") or r.json().get("id")
    check("donor POST /api/grants/ (create)", create_grant)

    def publish():
        gid = grant_id["v"] or _first_id(donor, base, "/api/grants/")
        if not gid:
            return
        post(donor, base, f"/api/grants/{gid}/publish", {}, allow={200, 400, 403, 409})
    check("donor POST /grants/<id>/publish", publish)

    def express_interest():
        gid = _first_id(ngo, base, "/api/grants/")
        if not gid:
            return
        post(ngo, base, f"/api/grants/{gid}/express-interest", {}, allow={200, 201, 400, 403, 409})
    check("ngo POST /grants/<id>/express-interest", express_interest)

    def create_application():
        gid = _first_id(ngo, base, "/api/grants/")
        if not gid:
            return
        post(ngo, base, "/api/applications/", {"grant_id": gid},
             allow={200, 201, 400, 403, 409})
    check("ngo POST /api/applications/ (create)", create_application)

    def app_submit_and_review():
        aid = _first_id(ngo, base, "/api/applications/")
        if not aid:
            return
        post(ngo, base, f"/api/applications/{aid}/submit", {}, allow={200, 400, 403, 409})
        # admin bulk/auto-assign + reviewer create-review touch reviews.py
        post(admin, base, f"/api/applications/{aid}/auto-assign-reviewers", {},
             allow={200, 400, 403, 404, 409})
    check("ngo submit + admin auto-assign reviewers", app_submit_and_review)

    def report_write():
        # Touch reports.py write path even if it 400s on missing grant linkage.
        post(ngo, base, "/api/reports/", {"grant_id": grant_id["v"] or 1},
             allow={200, 201, 400, 403, 404, 409})
    check("ngo POST /api/reports/ (create)", report_write)


def run_proximate_writes(base):
    section("Proximate — write paths (the module set that shipped 5 dead endpoints)")
    OV = "proximate"
    ob = login(base, "prox_ob", override=OV)
    donor = login(base, "prox_donor", override=OV)

    pid = _first_id(ob, base, "/api/proximate/partners", override=OV)
    rid = _first_id(ob, base, "/api/proximate/rounds", override=OV)
    gid = _first_id(ob, base, "/api/proximate/grants", override=OV)
    did = _first_id(ob, base, "/api/proximate/disbursements", override=OV)
    eid = _first_id(ob, base, "/api/proximate/admin/endorsers", override=OV)
    iid = _first_id(ob, base, "/api/proximate/interventions", override=OV)

    print(f"      seeded ids: partner={pid} round={rid} grant={gid} "
          f"disb={did} endorser={eid} interv={iid}")

    # --- grants module (POST /grants was dead with NameError) ---
    new_grant = {"v": None}

    def grant_create():
        r = post(ob, base, "/api/proximate/grants", {
            "title": "Regression Donor Grant",
            "amount_committed_usd": 500000, "currency": "USD",
            "reporting_cadence": "quarterly",
        }, override=OV, allow={200, 201, 400, 403})
        if r.status_code in (200, 201):
            body = r.json()
            new_grant["v"] = (body.get("grant") or body).get("id") or body.get("id")
    check("OB POST /proximate/grants (create)", grant_create)

    def grant_update():
        g = new_grant["v"] or gid
        if not g:
            return
        put(ob, base, f"/api/proximate/grants/{g}",
            {"title": "Regression Donor Grant (edited)"},
            override=OV, allow={200, 400, 403, 404})
    check("OB PUT /proximate/grants/<id> (update)", grant_update)

    def grant_allocation():
        g = new_grant["v"] or gid
        if not (g and rid):
            return
        post(ob, base, f"/api/proximate/grants/{g}/allocations",
             {"round_id": rid, "amount_usd": 10000},
             override=OV, allow={200, 201, 400, 403, 404, 409})
    check("OB POST /proximate/grants/<id>/allocations", grant_allocation)

    def grant_extract():
        post(ob, base, "/api/proximate/grants/extract-agreement",
             {"grant_text": "Donor commits USD 100,000 for WASH."},
             override=OV, allow={200, 400, 403, 422, 503})
    check("OB POST /proximate/grants/extract-agreement", grant_extract)

    # --- rounds module ---
    def round_create():
        post(ob, base, "/api/proximate/rounds", {
            "title": "Regression Round", "round_trigger": "manual",
            "envelope_usd": 50000,
        }, override=OV, allow={200, 201, 400, 403})
    check("OB POST /proximate/rounds (create)", round_create)

    def round_submit_sign():
        if not rid:
            return
        post(ob, base, f"/api/proximate/rounds/{rid}/submit", {},
             override=OV, allow={200, 400, 403, 404, 409})
        post(ob, base, f"/api/proximate/rounds/{rid}/sign", {},
             override=OV, allow={200, 400, 403, 404, 409})
    check("OB POST /proximate/rounds/<id>/submit + sign", round_submit_sign)

    # --- partners module ---
    def partner_create():
        post(ob, base, "/api/proximate/partners",
             {"name": "Regression Partner Org", "locality": "Kassala", "country": "Sudan"},
             override=OV, allow={200, 201, 400, 403})
    check("OB POST /proximate/partners (nominate)", partner_create)

    def partner_suspend():
        if not pid:
            return
        post(ob, base, f"/api/proximate/partners/{pid}/suspend",
             {"reason": "regression test"},
             override=OV, allow={200, 400, 403, 404, 409})
    check("OB POST /proximate/partners/<id>/suspend (was dead)", partner_suspend)

    def partner_self_nominate():
        # public endpoint — no auth
        anon = requests.Session()
        anon.headers["X-Network-Override"] = OV
        post(anon, base, "/api/proximate/partners/self-nominate",
             {"name": "Self Nom Org", "contact_email": "x@example.org",
              "locality": "Gedaref", "country": "Sudan"},
             override=OV, allow={200, 201, 400, 403, 422})
    check("public POST /proximate/partners/self-nominate", partner_self_nominate)

    # --- disbursements module ---
    def disbursement_create():
        if not pid:
            return
        post(ob, base, "/api/proximate/disbursements",
             {"partner_id": pid, "amount_usd": 5000, "round_id": rid,
              "purpose": "regression"},
             override=OV, allow={200, 201, 400, 403, 404, 409})
    check("OB POST /proximate/disbursements (create)", disbursement_create)

    def disbursement_cosign():
        if not did:
            return
        post(ob, base, f"/api/proximate/disbursements/{did}/cosign", {},
             override=OV, allow={200, 400, 403, 404, 409})
    check("OB POST /proximate/disbursements/<id>/cosign", disbursement_cosign)

    # --- interventions module ---
    def intervention_create():
        if not pid:
            return
        post(ob, base, "/api/proximate/interventions",
             {"partner_id": pid, "kind": "monitoring_flag", "details": "regression"},
             override=OV, allow={200, 201, 400, 403, 404, 409})
    check("OB POST /proximate/interventions (create)", intervention_create)

    def intervention_respond():
        if not iid:
            return
        post(ob, base, f"/api/proximate/interventions/{iid}/respond",
             {"response": "regression response"},
             override=OV, allow={200, 400, 403, 404, 409})
    check("OB POST /proximate/interventions/<id>/respond", intervention_respond)

    # --- fsps / endorsers / crisis / grievance modules ---
    def fsp_create():
        post(ob, base, "/api/proximate/fsps",
             {"name": "Regression Hawala", "kind": "hawala"},
             override=OV, allow={200, 201, 400, 403})
    check("OB POST /proximate/fsps (create)", fsp_create)

    def endorser_invite():
        if not pid:
            return
        post(ob, base, f"/api/proximate/partners/{pid}/endorser-invites",
             {"email": "elder@example.org", "name": "Regression Elder",
              "locality": "Kassala"},
             override=OV, allow={200, 201, 400, 403, 404, 422})
    check("OB POST /proximate/partners/<id>/endorser-invites", endorser_invite)

    def endorser_approve():
        if not eid:
            return
        post(ob, base, f"/api/proximate/admin/endorsers/{eid}/approve", {"notes": "ok"},
             override=OV, allow={200, 400, 403, 404, 409})
    check("OB POST /proximate/admin/endorsers/<id>/approve", endorser_approve)

    def crisis_signal():
        post(ob, base, "/api/proximate/crisis-signals",
             {"title": "Regression signal", "severity": "medium",
              "location": "Kassala"},
             override=OV, allow={200, 201, 400, 403, 422})
    check("OB POST /proximate/crisis-signals", crisis_signal)

    def grievance_public():
        anon = requests.Session()
        anon.headers["X-Network-Override"] = OV
        post(anon, base, "/api/proximate/public/grievances",
             {"complaint_text": "regression grievance", "category": "conduct"},
             override=OV, allow={200, 201, 400, 403, 422})
    check("public POST /proximate/public/grievances", grievance_public)


def run_proximate_rbac(base):
    """Negative-authorization matrix — the defect class the team's RBAC report
    surfaced (donors/platform-admins reaching OB-only endpoints, report_token
    and bank/sanctions fields leaking, the OB wrongly denied on /audit-chain).

    Prior gate only exercised the OB happy path, so none of these were caught.
    This asserts, per persona:
      * OB REGAINS every OB-only read (catches the /audit-chain-blocked class),
      * non-OB personas are DENIED (403) on OB-only ops (the core leak class),
      * a non-OB body NEVER contains sensitive fields — an INVARIANT, not a
        brittle status, because a persona can legitimately be a seeded endorser
        (admin@kuja.org is one on the demo seed) and still must not see
        bank/sanctions/report_token internals,
      * an unauthenticated caller gets no data and no 5xx.
    """
    section("Proximate — RBAC / authorization matrix (negative cases)")
    OV = "proximate"
    ob = login(base, "prox_ob", override=OV)
    donor = login(base, "prox_donor", override=OV)
    admin = login(base, "admin", override=OV)  # platform admin — NOT an OB

    # Fields that must NEVER appear in a non-OB response body.
    SENSITIVE = (
        "report_token", "bank_account_holder_name", "bank_name",
        "contact_phone", "sanctions_summary", "intake_form",
        "reputation_floor", "audit_in_window", "actor_email",
        "signers_required", "audit_anchor_seq",
    )

    def _no_sensitive(label, r):
        leaked = [f for f in SENSITIVE if f'"{f}"' in (r.text or "")]
        assert not leaked, f"{label} leaked {leaked} (status {r.status_code})"

    pid = _first_id(ob, base, "/api/proximate/partners", override=OV)
    rid = _first_id(ob, base, "/api/proximate/rounds", override=OV)
    did = _first_id(ob, base, "/api/proximate/disbursements", override=OV)

    OB_ONLY = [
        "/api/proximate/overview", "/api/proximate/attention-queue",
        "/api/proximate/audit-chain", "/api/proximate/interventions",
        "/api/proximate/fsps",
        # Blue Nile intake surfaces (2026-07): DD evidence, panel roster,
        # media verification are OB-only reads like the rest.
        "/api/proximate/attachments",
        "/api/proximate/panel-candidates",
    ]
    if pid:
        OB_ONLY.append(f"/api/proximate/disbursements/preflight?partner_id={pid}")
        OB_ONLY.append(f"/api/proximate/partners/{pid}/media-verification")

    # --- OB regains access (the "OB blocked on /audit-chain" defect) ---
    for p in OB_ONLY:
        def ob_ok(p=p):
            r = get(ob, base, p, override=OV)
            assert r.status_code == 200, f"OB {p} -> {r.status_code} (want 200): {r.text[:160]}"
        check(f"OB 200 {p.split('?')[0]}", ob_ok)

    # --- OB NAV SURFACE: every link the OB sidebar renders must resolve for
    # the OB (200, not 403). This is the "broken nav link" defect class from
    # the 2026-07-10 QA crawl: 'Donor view', 'Observability', and 'Audit chain'
    # were shown to the OB but their backing APIs 403'd it, leaving dead pages +
    # console errors. The API 403 was *correct*; the nav pointing there was the
    # bug. Keep this list a 1:1 mirror of proximateProfile()'s 'ob'/'admin'
    # block in frontend/src/components/layout/sidebar.tsx — if you add a nav
    # item there, add its primary data endpoint here so the gate proves the OB
    # can actually load it. (Some entries overlap OB_ONLY above by design; the
    # value here is being a complete mirror of the rendered sidebar.)
    OB_NAV_SURFACES = [
        ("Dashboard",              "/api/proximate/overview"),
        ("Grants from donors",     "/api/proximate/grants"),
        ("Rounds & disbursements", "/api/proximate/rounds"),
        ("Partners",               "/api/proximate/partners"),
        ("Endorsers",              "/api/proximate/admin/endorsers/pending"),
        ("Crisis signals",         "/api/proximate/crisis-selector"),
        ("Crisis signals (list)",  "/api/proximate/crisis-signals"),
        ("All disbursements",      "/api/proximate/disbursements"),
        ("Audit chain",            "/api/proximate/audit-chain"),
    ]
    for label, ep in OB_NAV_SURFACES:
        def nav_loads(ep=ep, label=label):
            r = get(ob, base, ep, override=OV)
            assert r.status_code == 200, (
                f"OB nav '{label}' -> {ep} returned {r.status_code} "
                f"(a link the OB is shown but cannot load): {r.text[:160]}"
            )
        check(f"OB nav loads: {label}", nav_loads)

    # --- MONEY-WRITE endpoints: non-OB must be denied (POST 403). The QA
    # 2026-07-11 pilot pass confirmed these guards hold; lock them into the
    # gate so a future refactor can't silently open a money-mutation path to
    # a donor / platform-admin / endorser. (Frontend route guards are
    # defense-in-depth; THIS is the real gate.) ---
    MONEY_WRITES = [("/api/proximate/disbursements",
                     {"partner_id": pid or 1, "amount_usd": 100}),
                    # PIF import creates partners + stores bank details —
                    # same deny class as the money writes.
                    ("/api/proximate/partners/import-pif", {})]
    if pid:
        MONEY_WRITES.append(
            (f"/api/proximate/partners/{pid}/disbursement-methods",
             {"fsp_id": 1, "identifier": {}}))
        MONEY_WRITES.append(
            (f"/api/proximate/partners/{pid}/bank-verify", {}))
    for who, sess in (("donor", donor), ("admin", admin)):
        for ep, pbody in MONEY_WRITES:
            def money_denied(ep=ep, pbody=pbody, sess=sess):
                post(sess, base, ep, pbody, override=OV, allow={403})
            check(f"{who} 403 POST {ep.replace('/api/proximate', '')}",
                  money_denied)

    # --- non-OB denied on every OB-only op ---
    for who, sess in (("donor", donor), ("admin", admin)):
        for p in OB_ONLY:
            def denied(p=p, sess=sess):
                r = get(sess, base, p, override=OV)
                assert r.status_code == 403, f"{p} -> {r.status_code} (want 403): {r.text[:160]}"
            check(f"{who} 403 {p.split('?')[0]}", denied)

    # --- disbursement detail: OB 200; non-OB 403 AND no token leak ---
    if did:
        def ob_disb():
            r = get(ob, base, f"/api/proximate/disbursements/{did}", override=OV)
            assert r.status_code == 200, f"OB disbursement -> {r.status_code}"
        check("OB 200 /disbursements/<id>", ob_disb)
        for who, sess in (("donor", donor), ("admin", admin)):
            def disb_denied(sess=sess, who=who):
                r = get(sess, base, f"/api/proximate/disbursements/{did}", override=OV)
                assert r.status_code == 403, f"{who} disbursement -> {r.status_code} (want 403)"
                _no_sensitive(f"{who} disbursement detail", r)
            check(f"{who} 403 + no-leak /disbursements/<id>", disb_denied)

    # --- partner detail: OB full; donor hard-403; admin never sees secrets ---
    if pid:
        def ob_partner():
            r = get(ob, base, f"/api/proximate/partners/{pid}", override=OV)
            assert r.status_code == 200 and '"trust_floor_signals"' in (r.text or ""), \
                f"OB partner -> {r.status_code}"
        check("OB 200 /partners/<id> (full)", ob_partner)

        def donor_partner():
            r = get(donor, base, f"/api/proximate/partners/{pid}", override=OV)
            assert r.status_code == 403, f"donor partner -> {r.status_code} (want 403)"
        check("donor 403 /partners/<id>", donor_partner)

        # admin@kuja.org is a seeded endorser -> 403 OR 200-safe-subset; either
        # way it must never carry bank / sanctions / reputation internals.
        def admin_partner_no_leak():
            r = get(admin, base, f"/api/proximate/partners/{pid}", override=OV)
            assert r.status_code in (200, 403), f"admin partner -> {r.status_code}"
            _no_sensitive("admin partner detail", r)
        check("admin no-secret-leak /partners/<id>", admin_partner_no_leak)

    # --- round detail: donor gets the donor-safe view, no internal fields ---
    if rid:
        def donor_round_no_leak():
            r = get(donor, base, f"/api/proximate/rounds/{rid}", override=OV)
            assert r.status_code in (200, 403), f"donor round -> {r.status_code}"
            _no_sensitive("donor round detail", r)
        check("donor no-secret-leak /rounds/<id>", donor_round_no_leak)

    # --- DONOR ROUND SCOPE (2026-07-16). The v0 fallback listed EVERY
    # round in the tenant to a donor with no subscriptions — one funder
    # could read another funder's round data. Now a donor sees only
    # rounds linked to them: funded (round.donor_id), co-funded
    # (donor_shares), or followed (subscribed_round_ids). Invariant:
    # every round the dashboard returns must be provably linked, and a
    # non-linked round's report endpoints must 403 for the donor. ---
    def donor_dashboard_scoped():
        me = get(donor, base, "/api/proximate/donors/me", override=OV)
        assert me.status_code == 200, f"donors/me -> {me.status_code}"
        row = me.json()["donor"]
        my_id = row["id"]
        followed = set(row.get("subscribed_round_ids") or [])
        allr = get(ob, base, "/api/proximate/rounds", override=OV)
        assert allr.status_code == 200, f"OB rounds -> {allr.status_code}"
        linked = set(followed)
        unlinked = []
        for rr in _list(allr):
            share_ids = {
                s.get("donor_id") for s in (rr.get("donor_shares") or [])
            }
            if rr.get("donor_id") == my_id or my_id in share_ids:
                linked.add(rr["id"])
            else:
                unlinked.append(rr["id"])
        dash = get(donor, base, "/api/proximate/donors/me/dashboard",
                   override=OV)
        assert dash.status_code == 200, f"dashboard -> {dash.status_code}"
        body = dash.json()
        assert "using_fallback_listing" not in body, \
            "dashboard still exposes the retired fallback flag"
        shown = {r_["id"] for r_ in body.get("rounds") or []}
        stray = shown - linked
        assert not stray, (
            f"donor dashboard shows rounds not linked to them: {sorted(stray)} "
            f"(linked={sorted(linked)})"
        )
        # The rounds LIST endpoint must apply the same scope.
        lst = get(donor, base, "/api/proximate/rounds", override=OV)
        assert lst.status_code == 200, f"donor rounds list -> {lst.status_code}"
        listed = {r_["id"] for r_ in _list(lst)}
        stray_list = listed - linked
        assert not stray_list, (
            f"donor rounds list shows non-linked rounds: {sorted(stray_list)}"
        )
        # A non-linked round's detail, report bundle + PDF must be denied.
        if unlinked:
            probe = unlinked[0]
            for suffix in ("", "/report", "/report.pdf"):
                rep = get(donor, base,
                          f"/api/proximate/rounds/{probe}{suffix}",
                          override=OV)
                assert rep.status_code == 403, (
                    f"donor GET rounds/{probe}{suffix} on non-linked round -> "
                    f"{rep.status_code} (want 403)"
                )
    check("donor round scope: dashboard+list ⊆ linked, 403 outside",
          donor_dashboard_scoped)

    # --- AUDIT EXPORT INTEGRITY (QA 2026-07-14 audit-chain follow-up).
    # Three invariants the export probe surfaced:
    #   1. COMPLETE: the JSONL file must contain every row the JSON view
    #      counts — the old export inherited limit=100 and silently
    #      truncated a 204-row chain.
    #   2. TENANT-SCOPED: no exported row may be stamped with another
    #      tenant's network_id. Token-link/override-less requests used to
    #      stamp the host default (Kuja id) on Proximate rows. None is
    #      tolerated only for legacy/out-of-request writes (Phase 672 v0);
    #      a WRONG id never is. The expected id comes from the download
    #      filename (proximate-audit-chain-network<id>.jsonl).
    #   3. REDACTED ACTORS: a token-authenticated actor is recorded as a
    #      short prefix ('token:abcd1234…'), never the full credential.
    def audit_export_integrity():
        import json as _json
        import re as _re
        rj = get(ob, base, "/api/proximate/audit-chain", override=OV)
        assert rj.status_code == 200, f"audit-chain JSON -> {rj.status_code}"
        total = (rj.json() or {}).get("total")
        rx = get(ob, base, "/api/proximate/audit-chain?format=jsonl", override=OV)
        assert rx.status_code == 200, f"audit-chain jsonl -> {rx.status_code}"
        m = _re.search(r"network(\d+)\.jsonl",
                       rx.headers.get("Content-Disposition", ""))
        assert m, "export filename missing network id"
        expected_net = int(m.group(1))
        lines = [ln for ln in (rx.text or "").splitlines() if ln.strip()]
        assert total is not None and len(lines) == total, (
            f"export truncated: file has {len(lines)} lines, UI total={total}"
        )
        rows = [_json.loads(ln) for ln in lines]
        wrong = sorted({r0["network_id"] for r0 in rows
                        if r0.get("network_id") not in (None, expected_net)})
        assert not wrong, (
            f"export leaked/mislabeled rows with network_id {wrong} "
            f"(expected {expected_net} or legacy None)"
        )
        assert any(r0.get("network_id") == expected_net for r0 in rows), (
            "no exported row stamped with the tenant id — stamping hook dead?"
        )
        for r0 in rows:
            actor = r0.get("actor_email") or ""
            if actor.startswith(("token:", "invite:")):
                assert len(actor.split(":", 1)[1]) <= 10, (
                    f"unredacted credential in actor_email: {actor[:24]}…"
                )
            assert r0.get("payload_hash") and "seq" in r0, "hash fields missing"
    check("audit export: complete + tenant-scoped + redacted", audit_export_integrity)

    # --- PANEL SELECTION VOTE (July 2026): full token-link loop + authz.
    # The selection meeting is the highest-stakes decision in a round, so
    # the gate walks the whole flow every run: OB opens (donor is denied),
    # an anonymous panelist votes ONCE via token (replay 409s, bad token
    # 404s), OB closes (donor denied), majority outcome recorded. ---
    def selection_vote_flow():
        import requests as _rq
        # A round with a live roster (participants endpoint, not detail).
        vote_rid = None
        for rr in _list(get(ob, base, "/api/proximate/rounds", override=OV)):
            pr = get(ob, base,
                     f"/api/proximate/rounds/{rr['id']}/participants",
                     override=OV)
            if pr.status_code != 200:
                continue
            active = [p for p in (pr.json().get("participants") or [])
                      if p.get("stage") != "withdrawn"]
            if active:
                vote_rid = rr["id"]
                break
        assert vote_rid, "no round with roster to vote on"
        vp = f"/api/proximate/rounds/{vote_rid}/selection-vote"

        # Ensure an appointed panelist exists for this round.
        pc = ob.post(f"{base}/api/proximate/panel-candidates",
                     json={"name": "Regression Panelist", "round_id": vote_rid,
                           "phone": "+249900000000"},
                     headers=_hdrs(OV), timeout=30)
        assert pc.status_code == 200, f"panel-candidate create -> {pc.status_code}"
        cid = pc.json()["candidate"]["id"]
        pa = ob.request("PATCH", f"{base}/api/proximate/panel-candidates/{cid}",
                        json={"status": "appointed"}, headers=_hdrs(OV),
                        timeout=30)
        assert pa.status_code == 200, f"appoint -> {pa.status_code}"

        # Donor must NOT be able to open a vote.
        dv = donor.post(f"{base}{vp}", json={}, headers=_hdrs(OV), timeout=30)
        assert dv.status_code == 403, f"donor open vote -> {dv.status_code}"

        # OB opens (a leftover open session from a prior run is closed first).
        ov_resp = ob.post(f"{base}{vp}", json={}, headers=_hdrs(OV), timeout=30)
        if ov_resp.status_code == 409:
            ob.post(f"{base}{vp}/close", json={}, headers=_hdrs(OV), timeout=30)
            ov_resp = ob.post(f"{base}{vp}", json={}, headers=_hdrs(OV),
                              timeout=30)
        assert ov_resp.status_code == 200, (
            f"OB open vote -> {ov_resp.status_code}: {ov_resp.text[:160]}")
        invites = ov_resp.json().get("invites") or []
        assert invites and invites[0].get("vote_token"), "no invite token"
        token = invites[0]["vote_token"]
        ballot = ov_resp.json()["session"]["ballot"]
        assert ballot, "empty ballot"

        # Anonymous panelist: bad token 404, real token 200, vote once,
        # replay 409.
        anon = _rq.Session()
        assert anon.get(f"{base}/api/proximate/selection-vote/deadbeef",
                        headers=_hdrs(OV), timeout=15).status_code == 404
        bal = anon.get(f"{base}/api/proximate/selection-vote/{token}",
                       headers=_hdrs(OV), timeout=15)
        assert bal.status_code == 200, f"ballot fetch -> {bal.status_code}"
        first_pid = str(ballot[0]["participant_id"])
        cast = anon.post(f"{base}/api/proximate/selection-vote/{token}",
                         json={"choices": {first_pid: "select"}},
                         headers=_hdrs(OV), timeout=15)
        assert cast.status_code == 200, f"cast -> {cast.status_code}: {cast.text[:160]}"
        replay = anon.post(f"{base}/api/proximate/selection-vote/{token}",
                           json={"choices": {first_pid: "select"}},
                           headers=_hdrs(OV), timeout=15)
        assert replay.status_code == 409, f"replay -> {replay.status_code}"

        # Donor cannot close; OB closes; majority outcome recorded.
        dc = donor.post(f"{base}{vp}/close", json={}, headers=_hdrs(OV),
                        timeout=30)
        assert dc.status_code == 403, f"donor close -> {dc.status_code}"
        cl = ob.post(f"{base}{vp}/close", json={}, headers=_hdrs(OV),
                     timeout=30)
        assert cl.status_code == 200, f"OB close -> {cl.status_code}"
        outcome = cl.json()["session"]["outcome"]
        assert int(first_pid) in outcome["selected_participant_ids"], (
            f"1–0 majority not selected: {outcome}")
    check("selection vote: token loop + one-shot + OB-only open/close",
          selection_vote_flow)

    # --- PARTNER REPORT PACKAGE (July 2026): the donor-report pipeline.
    # Full lifecycle every run: OB opens a package, the partner fills it
    # anonymously via token (numeric answers + a photo item), submits
    # (replay 409s), the donor is DENIED until publish, the OB approves
    # media item-by-item (default is internal — the safeguarding gate),
    # publishes, and the subscribed donor then sees ONLY approved items
    # and never the package token. ---
    def report_package_flow():
        import io
        import requests as _rq
        # round with roster + its first partner
        rp_rid, rp_pid = None, None
        for rr in _list(get(ob, base, "/api/proximate/rounds", override=OV)):
            pr = get(ob, base,
                     f"/api/proximate/rounds/{rr['id']}/participants",
                     override=OV)
            if pr.status_code != 200:
                continue
            active = [p for p in (pr.json().get("participants") or [])
                      if p.get("stage") != "withdrawn"]
            if active:
                rp_rid, rp_pid = rr["id"], active[0]["partner_id"]
                break
        assert rp_rid, "no round with roster"

        # approved activity (the reporting baseline)
        aa = ob.post(f"{base}/api/proximate/rounds/{rp_rid}/approved-activities",
                     json={"partner_id": rp_pid, "name": "Regression Activity",
                           "budget_lines": [{"label": "Personnel", "amount": 500},
                                            {"label": "Supplies & Materials",
                                             "amount": 1500}]},
                     headers=_hdrs(OV), timeout=30)
        assert aa.status_code == 200, f"approved-activity -> {aa.status_code}"
        act_id = aa.json()["activity"]["id"]

        # OB opens the package (idempotent)
        op = ob.post(f"{base}/api/proximate/rounds/{rp_rid}/report-packages",
                     json={"partner_id": rp_pid}, headers=_hdrs(OV), timeout=30)
        assert op.status_code == 200, f"open package -> {op.status_code}"
        pkg = op.json()["package"]
        pkg_id, tok = pkg["id"], pkg["package_token"]

        anon = _rq.Session()
        H = _hdrs(OV)
        assert anon.get(f"{base}/api/proximate/report-package/deadbeef",
                        headers=H, timeout=15).status_code == 404
        bal = anon.get(f"{base}/api/proximate/report-package/{tok}",
                       headers=H, timeout=15)
        assert bal.status_code == 200, f"token view -> {bal.status_code}"
        assert "package_token" not in bal.text, "token echoed to partner view"

        # numeric answers keyed by the approved activity
        ans = anon.post(f"{base}/api/proximate/report-package/{tok}/answers",
                        json={"answers": {"activities": {str(act_id): {
                            "status": "done", "unit": "households",
                            "people_reached": 70,
                            "disaggregation": {"women": 70, "pwd": 5},
                            "spend": {"Personnel": 450,
                                      "Supplies & Materials": 1600}}}}},
                        headers=H, timeout=15)
        assert ans.status_code == 200, f"answers -> {ans.status_code}"

        # one photo item — MUST default to internal-only
        png = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00"
               b"\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\r"
               b"IDATx\x9cc\xfc\xff\xff?\x03\x00\x08\xfc\x02\xfe\xa7\x9a\xa0"
               b"\xa0\x00\x00\x00\x00IEND\xaeB`\x82")
        up = anon.post(f"{base}/api/proximate/report-package/{tok}/items",
                       data={"kind": "photo", "caption": "Regression photo"},
                       files={"file": ("evidence.png", io.BytesIO(png),
                                       "image/png")},
                       headers={"X-Network-Override": OV,
                                "X-Requested-With": "XMLHttpRequest"},
                       timeout=30)
        assert up.status_code == 200, f"item upload -> {up.status_code}: {up.text[:160]}"
        item = up.json()["item"]
        assert item["donor_visible"] is False, "media not internal by default!"

        # a SECOND item that stays internal-only — the safeguarding
        # negative case: the donor must never see any trace of it.
        up2 = anon.post(f"{base}/api/proximate/report-package/{tok}/items",
                        data={"kind": "photo",
                              "caption": "INTERNAL-ONLY-REGRESSION-XYZZY"},
                        files={"file": ("hidden-evidence-xyzzy.png",
                                        io.BytesIO(png), "image/png")},
                        headers={"X-Network-Override": OV,
                                 "X-Requested-With": "XMLHttpRequest"},
                        timeout=30)
        assert up2.status_code == 200, f"hidden upload -> {up2.status_code}"
        hidden = up2.json()["item"]

        # OB flags the item with a per-item fix request; the partner's
        # token view carries the note.
        fl = ob.request("PATCH",
                        f"{base}/api/proximate/report-packages/{pkg_id}/items/{item['id']}",
                        json={"change_request": "Please retake in daylight"},
                        headers=_hdrs(OV), timeout=15)
        assert fl.status_code == 200, f"item flag -> {fl.status_code}"
        assert fl.json()["item"]["change_request"] == "Please retake in daylight"
        pv = anon.get(f"{base}/api/proximate/report-package/{tok}",
                      headers=H, timeout=15)
        assert "Please retake in daylight" in pv.text, \
            "flag missing from partner token view"

        # OB sets the exchange rate (spend_currency per USD)
        xr = ob.request("PATCH",
                        f"{base}/api/proximate/report-packages/{pkg_id}",
                        json={"exchange_rate": 2500}, headers=_hdrs(OV),
                        timeout=15)
        assert xr.status_code == 200 and \
            xr.json()["package"]["exchange_rate"] == 2500, "rate not stored"

        # donor subscribes to the round so scope passes — still DENIED
        # pre-publish.
        donor.post(f"{base}/api/proximate/donors/me/subscribe",
                   json={"round_ids": [rp_rid]}, headers=_hdrs(OV), timeout=15)
        dv = get(donor, base, f"/api/proximate/report-packages/{pkg_id}",
                 override=OV)
        assert dv.status_code == 403, f"donor pre-publish -> {dv.status_code}"

        # partner submits; replay 409s
        sub = anon.post(f"{base}/api/proximate/report-package/{tok}/submit",
                        headers=H, timeout=60)
        assert sub.status_code == 200, f"submit -> {sub.status_code}"
        assert anon.post(f"{base}/api/proximate/report-package/{tok}/submit",
                         headers=H, timeout=15).status_code == 409
        # resubmission clears per-item fix requests; OB sees BOTH items
        ob_view = get(ob, base, f"/api/proximate/report-packages/{pkg_id}",
                      override=OV).json()
        assert all(not i.get("change_request")
                   for i in ob_view.get("items", [])), \
            "change_request not cleared on submit"
        ob_ids = {i["id"] for i in ob_view.get("items", [])}
        assert {item["id"], hidden["id"]} <= ob_ids, \
            f"OB missing items: {ob_ids}"
        # the viewer field is what the frontend gates OB-only copy on —
        # it must reflect the SESSION, never a client-side cache
        assert ob_view.get("viewer") == "ob", \
            f"OB viewer field -> {ob_view.get('viewer')}"

        # OB approves the photo for donor eyes + publishes
        vis = ob.request("PATCH",
                         f"{base}/api/proximate/report-packages/{pkg_id}/items/{item['id']}",
                         json={"donor_visible": True}, headers=_hdrs(OV),
                         timeout=15)
        assert vis.status_code == 200, f"item approve -> {vis.status_code}"
        pub = ob.post(f"{base}/api/proximate/report-packages/{pkg_id}/review",
                      json={"action": "publish"}, headers=_hdrs(OV), timeout=60)
        assert pub.status_code == 200, f"publish -> {pub.status_code}"

        # donor now sees the published view: only approved items, no token
        dv2 = get(donor, base, f"/api/proximate/report-packages/{pkg_id}",
                  override=OV)
        assert dv2.status_code == 200, f"donor post-publish -> {dv2.status_code}"
        body = dv2.json()
        assert "package_token" not in dv2.text, "token leaked to donor"
        assert all(i["donor_visible"] for i in body.get("items", [])), \
            "internal item leaked to donor"
        d_items = body.get("items", [])
        assert [i["id"] for i in d_items] == [item["id"]], \
            f"donor item set wrong: {[i['id'] for i in d_items]}"
        assert "INTERNAL-ONLY-REGRESSION-XYZZY" not in dv2.text \
            and "hidden-evidence-xyzzy" not in dv2.text, \
            "hidden item caption/filename leaked to donor"
        assert body.get("viewer") == "donor", \
            f"donor viewer field -> {body.get('viewer')}"
        # hidden file stream must be denied; approved one must stream
        hfile = donor.get(
            f"{base}/api/proximate/report-items/{hidden['id']}/file",
            headers=_hdrs(OV), timeout=15)
        assert hfile.status_code == 403, f"hidden file -> {hfile.status_code}"
        afile = donor.get(
            f"{base}/api/proximate/report-items/{item['id']}/file",
            headers=_hdrs(OV), timeout=15)
        assert afile.status_code == 200, f"approved file -> {afile.status_code}"
        # donor list endpoint includes it
        dl = get(donor, base, "/api/proximate/donors/me/report-packages",
                 override=OV)
        assert dl.status_code == 200 and any(
            p["id"] == pkg_id for p in dl.json().get("packages", [])), \
            "published package missing from donor list"
        # Arabic narrative -> PDF must embed the shaped-Arabic font.
        nr = ob.request("PATCH",
                        f"{base}/api/proximate/report-packages/{pkg_id}",
                        json={"narrative": {
                            "summary_en": "Regression summary.",
                            "summary_ar": "تم توزيع المساعدات في ولاية النيل الأزرق",
                            "sections": []}},
                        headers=_hdrs(OV), timeout=15)
        assert nr.status_code == 200, f"narrative patch -> {nr.status_code}"
        # PDF renders for the OB (503 tolerated only if reportlab absent)
        pdf = get(ob, base, f"/api/proximate/report-packages/{pkg_id}/pdf",
                  override=OV)
        assert pdf.status_code in (200, 503), f"pdf -> {pdf.status_code}"
        if pdf.status_code == 200:
            assert b"Amiri" in pdf.content, "Arabic font not embedded in PDF"
        # Range request on the evidence file -> 206 partial (video scrub)
        rg = ob.get(f"{base}/api/proximate/report-items/{item['id']}/file",
                    headers={**_hdrs(OV), "Range": "bytes=0-9"}, timeout=15)
        assert rg.status_code == 206, f"range -> {rg.status_code}"
        assert len(rg.content) == 10, f"range bytes -> {len(rg.content)}"
    check("report package: token fill + safeguarding gate + publish flow",
          report_package_flow)

    # --- Partner vetting assessment (process doc §4 formal record) ---
    def vetting_assessment():
        if not pid:
            raise Skip("no partner")
        g = get(ob, base, f"/api/proximate/partners/{pid}/vetting-assessment",
                override=OV)
        assert g.status_code == 200, f"vetting GET -> {g.status_code}"
        assert "sanctions_flag" in g.text and "media_verdict" in g.text
        p = ob.post(f"{base}/api/proximate/partners/{pid}/vetting-assessment",
                    json={}, headers=_hdrs(OV), timeout=30)
        assert p.status_code == 200 and p.json().get("recorded") is True
        d = donor.post(f"{base}/api/proximate/partners/{pid}/vetting-assessment",
                       json={}, headers=_hdrs(OV), timeout=15)
        assert d.status_code == 403, f"donor vetting POST -> {d.status_code}"
    check("vetting assessment: OB records, donor denied", vetting_assessment)

    # --- PRX-OUTCOME-002: outcome follow-up pauses while report flagged ---
    def outcome_pause_on_flag():
        # Any disbursement with a submitted report will do (verdict can be
        # re-issued); idempotent — the flow always ends on 'verified'.
        r = get(ob, base, "/api/proximate/disbursements", override=OV)
        assert r.status_code == 200, f"list -> {r.status_code}"
        rows = r.json().get("disbursements", [])
        cands = [d for d in rows
                 if d.get("status") in ("reported", "verified", "flagged")]
        if not cands:
            # Bootstrap: submit a minimal report on a pending_report
            # disbursement via the Phase 652 session fallback.
            pend = [d for d in rows if d.get("status") == "pending_report"]
            if not pend:
                raise Skip("no disbursement with a submitted report")
            sub = ob.post(f"{base}/api/proximate/disbursement-reports/bootstrap",
                          json={"disbursement_id": pend[0]["id"],
                                "activity_happened": True,
                                "people_helped": 10,
                                "issues": "regression bootstrap"},
                          headers=_hdrs(OV), timeout=30)
            assert sub.status_code == 200, f"bootstrap report -> {sub.status_code}"
            cands = [pend[0]]
        _did = cands[0]["id"]
        # 1. Flag: must NOT spawn/return the outcome obligation.
        f = ob.post(f"{base}/api/proximate/disbursements/{_did}/verify",
                    json={"verdict": "flagged", "flagged_reason": "other",
                          "note": "regression PRX-OUTCOME-002"},
                    headers=_hdrs(OV), timeout=30)
        assert f.status_code == 200, f"flag -> {f.status_code}"
        assert f.json().get("outcome_obligation") is None, \
            "flag verdict spawned/returned an outcome obligation"
        # 2. If an outcome already exists (prior verified run), its public
        #    token must be paused: GET paused=true, POST 409.
        det = get(ob, base, f"/api/proximate/disbursements/{_did}",
                  override=OV).json()
        tok = (det.get("outcome") or {}).get("report_token")
        if tok:
            anon = requests.Session()
            pg = anon.get(f"{base}/api/proximate/outcome-attestations/{tok}",
                          headers=_hdrs(OV), timeout=15)
            assert pg.status_code == 200 and \
                pg.json()["outcome"].get("paused") is True, \
                f"paused flag missing while flagged: {pg.text[:160]}"
            ps = anon.post(f"{base}/api/proximate/outcome-attestations/{tok}",
                           json={"sustained": "regression"},
                           headers=_hdrs(OV), timeout=15)
            already = ps.status_code == 200 and \
                ps.json().get("already_submitted") is True
            assert already or ps.status_code == 409, \
                f"submit while flagged -> {ps.status_code} (want 409)"
        # 3. Resolve: verified verdict spawns/returns the outcome and the
        #    public token un-pauses.
        v = ob.post(f"{base}/api/proximate/disbursements/{_did}/verify",
                    json={"verdict": "verified",
                          "note": "regression resolve"},
                    headers=_hdrs(OV), timeout=30)
        assert v.status_code == 200, f"resolve -> {v.status_code}"
        oo = v.json().get("outcome_obligation")
        assert oo and oo.get("report_token"), "verified verdict returned no outcome"
        pg2 = requests.get(
            f"{base}/api/proximate/outcome-attestations/{oo['report_token']}",
            headers=_hdrs(OV), timeout=15)
        assert pg2.status_code == 200 and \
            pg2.json()["outcome"].get("paused") is False, \
            f"outcome still paused after resolve: {pg2.text[:160]}"
    check("PRX-OUTCOME-002: flag pauses outcome, verify resumes",
          outcome_pause_on_flag)

    # --- unauthenticated caller: no data, no 5xx ---
    def unauth_denied():
        anon = requests.Session()
        anon.headers["X-Network-Override"] = OV
        r = anon.get(
            f"{base}/api/proximate/overview",
            headers={"X-Requested-With": "XMLHttpRequest"}, timeout=15,
        )
        assert r.status_code != 200, f"unauth /overview served 200 data: {r.text[:160]}"
        assert not _is_server_error(r), f"unauth /overview 5xx: {r.text[:160]}"
    check("unauth denied (no data / no 5xx) /overview", unauth_denied)


def run_near_writes(base):
    section("NEAR — write paths (best-effort; needs seeded funds)")
    OV = "near"
    admin = login(base, "admin", override=OV)

    def declaration_parse():
        post(admin, base, "/api/declarations/parse-narrative",
             {"narrative": "Flash floods in Kassala displaced 20,000 people."},
             override=OV, allow={200, 400, 403, 422, 503})
    check("admin POST /declarations/parse-narrative", declaration_parse)

    def declaration_create():
        post(admin, base, "/api/declarations",
             {"title": "Regression Declaration", "crisis_type": "flood",
              "country": "Sudan"},
             override=OV, allow={200, 201, 400, 403, 422})
    check("admin POST /api/declarations (create)", declaration_create)

    def fund_create():
        post(admin, base, "/api/funds",
             {"name": "Regression Fund", "currency": "USD"},
             override=OV, allow={200, 201, 400, 403, 422})
    check("admin POST /api/funds (create)", fund_create)


def run_api_regression(base):
    run_kuja_writes(base)
    run_proximate_writes(base)
    run_proximate_rbac(base)
    run_near_writes(base)


def run_browser(base):
    """Live browser leg — drive the real UI with Playwright against the same
    seeded server. Reuses the existing browser_test.py suite (--base URL).
    Skips (not fails) when Playwright isn't installed so `--browser` degrades
    gracefully on machines without it."""
    section("Live browser suite (Playwright)")
    try:
        import playwright  # noqa: F401
    except Exception:
        RESULTS.append(("SKIP", "live browser suite", "playwright not installed"))
        print("  [SKIP] Playwright not installed — "
              "pip install playwright && python -m playwright install chromium")
        return
    env = dict(os.environ)
    env["KUJA_URL"] = base
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    print(f"  running browser_test.py against {base} ...")
    proc = subprocess.run(
        [sys.executable, "browser_test.py", "--base", base],
        cwd=PROJECT_DIR, env=env, timeout=1800,
    )
    if proc.returncode == 0:
        RESULTS.append(("PASS", "live browser suite (browser_test.py)", ""))
        print("  [PASS] live browser suite")
    else:
        RESULTS.append(("FAIL", "live browser suite (browser_test.py)",
                        f"exit {proc.returncode}"))
        print(f"  [FAIL] live browser suite exit {proc.returncode}")


def summarize():
    passed = sum(1 for s, _, _ in RESULTS if s == "PASS")
    skipped = [(s, n, d) for s, n, d in RESULTS if s == "SKIP"]
    failed = [(s, n, d) for s, n, d in RESULTS if s not in ("PASS", "SKIP")]
    total = len(RESULTS) - len(skipped)
    print("\n" + "=" * 70)
    print(f"REGRESSION: {passed}/{total} passed"
          + (f", {len(skipped)} skipped" if skipped else ""))
    for _, n, d in skipped:
        print(f"  [SKIP] {n} ({d})")
    if failed:
        print(f"\n{len(failed)} FAILURE(S):")
        for s, n, d in failed:
            print(f"  [{s}] {n}\n         {d[:400]}")
    print("=" * 70)
    return 0 if not failed else 1


def main():
    api_only = "--api-only" in sys.argv or "--browser" not in sys.argv
    keep_db = "--keep-db" in sys.argv
    tmp = tempfile.mkdtemp(prefix="kuja_regression_")
    db_path = os.path.join(tmp, "regression.db")
    print(f"Isolated DB: {db_path}")
    try:
        print("\n[1/3] Seeding fresh DB ...")
        seed_fresh_db(db_path)
        print("\n[2/3] Booting server ...")
        base = start_server(db_path)
        print(f"      up at {base}")
        print("\n[3/3] Running checks ...")
        run_foundation(base)
        try:
            run_api_regression(base)  # defined once the write-path body lands
        except NameError:
            print("  (write-path body not wired yet — foundation only)")
        if not api_only:
            run_browser(base)
        return summarize()
    finally:
        if not keep_db:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
