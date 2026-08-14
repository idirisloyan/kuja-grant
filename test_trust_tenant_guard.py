#!/usr/bin/env python3
"""
test_trust_tenant_guard.py — unit tests for the Kuja Trust engine tenant guard.

Pure-Python: exercises the real trust_engine tenant-guard logic without booting
Flask, a DB, or the Trust HTTP client. Proves the multi-tenant invariant:
  * only the default 'kuja' network may ever delegate to remote Trust, and
  * every other tenant (Proximate/Saxansaxo/NEAR) and the no-tenant case fall
    back to local — regardless of KUJA_TRUST_ENGINE (deny-by-default).

Run:  python test_trust_tenant_guard.py
"""
import os
import sys

from app.services import trust_engine as TE
from app.models.network import DEFAULT_NETWORK_SLUG

failures = []


def check(name, cond):
    print(f"  {'PASS' if cond else 'FAIL'}  {name}")
    if not cond:
        failures.append(name)


def with_slug(slug):
    """Force the 'current tenant' the guard sees, no request context needed."""
    TE._current_network_slug = lambda: slug


_orig = TE._current_network_slug
try:
    print(f"default network slug is 'kuja': ")
    check("DEFAULT_NETWORK_SLUG == 'kuja'", DEFAULT_NETWORK_SLUG == 'kuja')

    print("_tenant_allows_remote() per tenant:")
    with_slug('kuja')
    check("kuja tenant -> remote allowed", TE._tenant_allows_remote() is True)
    with_slug('proximate')
    check("proximate tenant -> remote blocked", TE._tenant_allows_remote() is False)
    with_slug('sclr')
    check("saxansaxo (sclr) tenant -> remote blocked", TE._tenant_allows_remote() is False)
    with_slug('near')
    check("near tenant -> remote blocked", TE._tenant_allows_remote() is False)
    with_slug(None)
    check("no tenant (background job) -> remote blocked", TE._tenant_allows_remote() is False)

    # --- effective mode via engine_status(): the tenant guard demotes the
    #     configured mode back to 'local' for non-Kuja tenants. ------------------
    os.environ['KUJA_TRUST_ENGINE'] = 'remote'
    print("engine_status().effective_mode with KUJA_TRUST_ENGINE=remote:")
    with_slug('kuja')
    st = TE.engine_status()
    check("kuja: mode=remote", st['mode'] == 'remote')
    check("kuja: effective_mode=remote", st['effective_mode'] == 'remote')
    check("kuja: tenant_allows_remote True", st['tenant_allows_remote'] is True)
    with_slug('proximate')
    st = TE.engine_status()
    check("proximate: mode still remote", st['mode'] == 'remote')
    check("proximate: effective_mode demoted to local", st['effective_mode'] == 'local')
    check("proximate: tenant_allows_remote False", st['tenant_allows_remote'] is False)

    # --- with the flag OFF (default), effective mode is local everywhere -------
    os.environ.pop('KUJA_TRUST_ENGINE', None)
    print("engine_status().effective_mode with KUJA_TRUST_ENGINE unset (default):")
    with_slug('kuja')
    st = TE.engine_status()
    check("default: mode=local", st['mode'] == 'local')
    check("default: effective_mode=local", st['effective_mode'] == 'local')
finally:
    TE._current_network_slug = _orig
    os.environ.pop('KUJA_TRUST_ENGINE', None)

print()
if failures:
    print(f"FAILED: {len(failures)} check(s): {failures}")
    sys.exit(1)
print("ALL PASS")
