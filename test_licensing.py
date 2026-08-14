#!/usr/bin/env python3
"""
test_licensing.py — unit tests for the Kuja Grant donor-licensing gate (Phase 2).

Pure-Python: exercises the real Organization.is_grant_licensed() and the
donor_publish_allowed()/licensing_enforced() logic without booting Flask or a DB.
Proves the two security-critical invariants:
  * deny-by-default (unset/expired => not licensed), and
  * the enforcement flag defaults OFF (prod behaviour unchanged until flipped).

Run:  python test_licensing.py
"""
import os
import sys
from datetime import datetime, timezone, timedelta
from types import SimpleNamespace

from app.models.organization import Organization
from app.utils import decorators as D

failures = []


def check(name, cond):
    print(f"  {'PASS' if cond else 'FAIL'}  {name}")
    if not cond:
        failures.append(name)


def make_org(**kw):
    # Real model instance, no session/app context needed.
    return Organization(
        name='Test Org', org_type='donor',
        grant_licensed=kw.get('grant_licensed', False),
        grant_license_expires_at=kw.get('grant_license_expires_at'),
    )


def user(role, org=None):
    return SimpleNamespace(role=role, organization=org)


print("Organization.is_grant_licensed():")
check("unset flag -> not licensed", make_org().is_grant_licensed() is False)
check("flag true, no expiry -> licensed", make_org(grant_licensed=True).is_grant_licensed() is True)
check("flag true, future expiry -> licensed",
      make_org(grant_licensed=True, grant_license_expires_at=datetime.now(timezone.utc) + timedelta(days=1)).is_grant_licensed() is True)
check("flag true, past expiry -> not licensed",
      make_org(grant_licensed=True, grant_license_expires_at=datetime.now(timezone.utc) - timedelta(days=1)).is_grant_licensed() is False)
check("flag true, naive future expiry -> licensed",
      make_org(grant_licensed=True,
               grant_license_expires_at=(datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=1))).is_grant_licensed() is True)

# --- enforcement OFF (default) -------------------------------------------------
os.environ.pop('GRANT_LICENSING_ENFORCED', None)
print("enforcement OFF (default):")
check("licensing_enforced() is False", D.licensing_enforced() is False)
check("admin allowed", D.donor_publish_allowed(user('admin')) is True)
check("unlicensed donor allowed (unchanged behaviour)", D.donor_publish_allowed(user('donor', make_org())) is True)
check("ngo denied (never a donor power)", D.donor_publish_allowed(user('ngo')) is False)

# --- enforcement ON ------------------------------------------------------------
os.environ['GRANT_LICENSING_ENFORCED'] = 'true'
print("enforcement ON:")
check("licensing_enforced() is True", D.licensing_enforced() is True)
check("admin still allowed", D.donor_publish_allowed(user('admin')) is True)
check("unlicensed donor denied", D.donor_publish_allowed(user('donor', make_org())) is False)
check("licensed donor allowed", D.donor_publish_allowed(user('donor', make_org(grant_licensed=True))) is True)
check("expired-licence donor denied",
      D.donor_publish_allowed(user('donor', make_org(grant_licensed=True,
                                                     grant_license_expires_at=datetime.now(timezone.utc) - timedelta(days=1)))) is False)
check("donor with no org denied", D.donor_publish_allowed(user('donor', None)) is False)
check("ngo denied under enforcement", D.donor_publish_allowed(user('ngo', make_org(grant_licensed=True))) is False)
check("reviewer role denied (fail closed)", D.donor_publish_allowed(user('reviewer')) is False)
os.environ.pop('GRANT_LICENSING_ENFORCED', None)

print()
if failures:
    print(f"{len(failures)} FAILED: {failures}")
    sys.exit(1)
print("ALL PASSED")
