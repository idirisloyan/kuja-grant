#!/usr/bin/env python3
"""
purge_test_grants.py — remove [SMOKE-TEST]/[E2E-TEST]-titled grants and their
child rows from the database. FK-safe (auto-discovers child tables), transactional.

Test scripts (test_e2e*.py, soak runs, smoke_api.py) create tagged grants and do
not fully clean up (awarded/published grants can't be deleted via the API), so the
DB accumulates test junk. Run this before a client demo / UAT session.

SAFETY: matches ONLY the '[SMOKE-TEST]%' / '[E2E-TEST]%' title prefixes — never
touches untagged data. Dry-run by default; set APPLY=1 to delete.

Usage:
    DATABASE_URL=postgresql://...  py smoke/purge_test_grants.py           # dry-run
    DATABASE_URL=postgresql://...  APPLY=1 py smoke/purge_test_grants.py   # delete
"""
import os
import sys

try:
    import psycopg2
except ImportError:
    sys.exit("psycopg2 required: pip install psycopg2-binary")

URL = os.environ.get("DATABASE_URL")
if not URL:
    sys.exit("set DATABASE_URL to the target Postgres (use the public proxy URL locally)")
APPLY = os.environ.get("APPLY") == "1"
LIKE = ("[SMOKE-TEST]%", "[E2E-TEST]%")

conn = psycopg2.connect(URL)
cur = conn.cursor()

cur.execute("SELECT id FROM grants WHERE title LIKE %s OR title LIKE %s", LIKE)
gids = [r[0] for r in cur.fetchall()]
cur.execute("SELECT COUNT(*) FROM grants")
total = cur.fetchone()[0]
print(f"grants total={total}  test-tagged={len(gids)}")
if not gids:
    print("nothing to purge"); sys.exit(0)

cur.execute("SELECT id FROM applications WHERE grant_id = ANY(%s)", (gids,))
aids = [r[0] for r in cur.fetchall()]
print(f"applications under those grants={len(aids)}")

cur.execute("""
  SELECT tc.table_name, kcu.column_name, ccu.table_name AS ref
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name
  JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name=ccu.constraint_name
  WHERE tc.constraint_type='FOREIGN KEY' AND ccu.table_name IN ('applications','grants')
  ORDER BY ccu.table_name, tc.table_name""")
fks = cur.fetchall()

if not APPLY:
    print("child rows that WOULD be deleted (dry-run):")
    for t, col, ref in fks:
        ids = aids if ref == 'applications' else gids
        if not ids:
            continue
        try:
            cur.execute(f"SELECT COUNT(*) FROM {t} WHERE {col} = ANY(%s)", (ids,))
            n = cur.fetchone()[0]
            if n:
                print(f"   {t}.{col}: {n}")
        except Exception as e:
            conn.rollback(); print(f"   {t}.{col}: count failed ({str(e)[:50]})")
    print("\nDRY-RUN — set APPLY=1 to delete.")
    sys.exit(0)

deleted = {}
for t, col, ref in fks:
    ids = aids if ref == 'applications' else gids
    if not ids:
        continue
    try:
        cur.execute(f"DELETE FROM {t} WHERE {col} = ANY(%s)", (ids,))
        if cur.rowcount:
            deleted[f"{t}.{col}"] = cur.rowcount
    except Exception as e:
        conn.rollback(); sys.exit(f"FAILED delete {t}.{col}: {str(e)[:120]} (add table to purge order)")
if aids:
    cur.execute("DELETE FROM applications WHERE id = ANY(%s)", (aids,)); deleted["applications"] = cur.rowcount
cur.execute("DELETE FROM grants WHERE id = ANY(%s)", (gids,)); deleted["grants"] = cur.rowcount
conn.commit()
print("PURGED:", deleted)
