#!/usr/bin/env python3
"""
reset_credentials.py — break-glass password reset for the fixed set of REAL
go-live admin/OB accounts (the 6 protected seats). Deliberately minimal: it does
NOT call create_app (that heavy path has wedged a worker before) — it connects
straight to DATABASE_URL, sets a hashed temp password, forces a change on next
login, clears any lockout, and reactivates the account.

Roster is a base64 JSON array in argv[1]:  [{"email": "...", "password": "..."}]
Temp passwords are generated OUTSIDE this script (so they're known regardless of
the ssh session) and are NEVER committed or printed here. Only the six protected
go-live emails may be reset. Idempotent; prints per-email rowcount only.

Run (in the prod container, after this file is deployed):
    railway ssh --service web python reset_credentials.py "$(cat roster.b64)"
"""
import base64
import json
import os
import sys

from sqlalchemy import create_engine, text
from werkzeug.security import generate_password_hash  # same hasher as User.set_password

# The ONLY accounts this tool will touch — the 6 real go-live seats.
ALLOWED = {
    "iloyan@adesoafrica.org",
    "mrashid@adesoafrica.org",
    "thussein@adesoafrica.org",
    "mtumwebaze@adesoafrica.org",
    "kali@proximatefund.org",
    "msattar@proximatefund.org",
}


def _engine_url() -> str:
    url = os.environ.get("DATABASE_URL") or os.environ.get("DATABASE_PRIVATE_URL") or ""
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    # Bind to whichever psycopg driver the image actually ships.
    if url.startswith("postgresql://"):
        try:
            import psycopg2  # noqa: F401
            url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
        except ImportError:
            try:
                import psycopg  # noqa: F401
                url = url.replace("postgresql://", "postgresql+psycopg://", 1)
            except ImportError:
                pass
    return url


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: reset_credentials.py <base64 json roster>")
        return 2
    roster = json.loads(base64.b64decode(sys.argv[1]))

    url = _engine_url()
    if not url:
        print("ERROR: DATABASE_URL not set in this environment")
        return 2

    eng = create_engine(url)
    updated = 0
    with eng.begin() as cx:
        for item in roster:
            email = str(item.get("email", "")).strip().lower()
            pw = item.get("password")
            if email not in ALLOWED:
                print(f"SKIP  {email} (not in allowlist)")
                continue
            if not pw:
                print(f"SKIP  {email} (no password supplied)")
                continue
            res = cx.execute(
                text(
                    "UPDATE users SET password_hash = :h, must_change_password = TRUE, "
                    "is_active = TRUE, failed_login_count = 0, last_failed_login = NULL, "
                    "locked_until = NULL WHERE lower(email) = :e"
                ),
                {"h": generate_password_hash(pw), "e": email},
            )
            print(f"RESET {email}  rows={res.rowcount}")
            updated += res.rowcount or 0

    # Best-effort: clear any per-email login_attempts rows (separate transaction
    # so a missing table can't roll back the password resets above).
    try:
        with eng.begin() as cx:
            for item in roster:
                email = str(item.get("email", "")).strip().lower()
                if email in ALLOWED:
                    cx.execute(text("DELETE FROM login_attempts WHERE lower(email) = :e"), {"e": email})
    except Exception as exc:
        print(f"login_attempts cleanup skipped: {type(exc).__name__}")

    print(f"DONE: {updated} account(s) reset + forced-change on next login")
    return 0


if __name__ == "__main__":
    sys.exit(main())
