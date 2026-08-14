#!/usr/bin/env python3
"""
test_build_financials.py — unit tests for the Kuja Build financial-source
abstraction (Phase 0/1). Pure-Python: no Flask, no DB, no network.

Proves the inert-by-default behaviour (manual/empty until a BuildClient is
configured) and the `erp | manual` selection.

Run:  python test_build_financials.py
"""
import os
import sys

from app.models.grant import Grant
from app.services import build_engine
from app.services.build_client import BuildClient, BuildUnavailable

failures = []


def check(name, cond):
    print(f"  {'PASS' if cond else 'FAIL'}  {name}")
    if not cond:
        failures.append(name)


def make_grant(**kw):
    g = Grant(title='Test grant', donor_org_id=1, currency=kw.get('currency', 'USD'))
    g.financial_source = kw.get('financial_source', 'manual')
    g.build_ref = kw.get('build_ref')
    return g


# Ensure no Build config leaks in from the environment.
for k in ('KUJA_BUILD_BASE_URL', 'KUJA_BUILD_SERVICE_TOKEN'):
    os.environ.pop(k, None)

print("Grant.financial_source_value():")
check("unset -> manual", make_grant(financial_source=None).financial_source_value() == 'manual')
check("garbage -> manual", make_grant(financial_source='weird').financial_source_value() == 'manual')
check("erp -> erp", make_grant(financial_source='erp').financial_source_value() == 'erp')

print("BuildClient (unconfigured):")
c = BuildClient()
check("not configured without env", c.configured is False)
try:
    c.get_financials('4471')
    check("get_financials raises when unconfigured", False)
except BuildUnavailable as e:
    check("get_financials raises BuildUnavailable(build_not_configured)", str(e) == 'build_not_configured')
try:
    c.get_financials('')
    check("get_financials raises on empty ref", False)
except BuildUnavailable as e:
    check("empty ref -> no_build_ref", str(e) == 'no_build_ref')

print("BuildClient.normalize():")
norm = BuildClient.normalize({'currency': 'QAR', 'actuals': [{'category': 'a', 'spent': 10}]}, '4471')
check("normalize maps source/build_ref", norm['source'] == 'erp' and norm['build_ref'] == '4471')
check("normalize keeps currency", norm['currency'] == 'QAR')
check("normalize passes actuals", len(norm['actuals']) == 1)
check("normalize defaults missing lists", norm['budget_lines'] == [] and norm['disbursements'] == [])

print("build_engine.get_grant_financials():")
man = build_engine.get_grant_financials(make_grant(financial_source='manual'))
check("manual grant -> status manual", man['status'] == 'manual' and man['source'] == 'manual')
check("manual grant -> empty rows", man['budget_lines'] == [] and man['actuals'] == [])

erp = build_engine.get_grant_financials(make_grant(financial_source='erp', build_ref='4471'))
check("erp grant, no client -> status erp_unconfigured", erp['status'] == 'erp_unconfigured')
check("erp grant -> keeps build_ref", erp['build_ref'] == '4471')
check("erp grant -> empty rows (inert)", erp['actuals'] == [] and erp['disbursements'] == [])

print("build_engine.build_status():")
st = build_engine.build_status()
check("build not configured by default", st['configured'] is False)

print()
if failures:
    print(f"{len(failures)} FAILED: {failures}")
    sys.exit(1)
print("ALL PASSED")
