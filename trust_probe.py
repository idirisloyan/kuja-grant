#!/usr/bin/env python3
"""
trust_probe.py — verify the grant app can reach the shared Kuja Trust engine.

Loads only app/services/trust_client.py (no app-package/DB boot needed) and,
using the container's env (KUJA_TRUST_BASE_URL / KUJA_TRUST_SERVICE_TOKEN),
checks connectivity and fetches a real Trust Profile.

Run in the container:
    railway ssh --service web python trust_probe.py [org_ref]
"""
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location(
    "trust_client", os.path.join(HERE, "app", "services", "trust_client.py"))
tc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tc)

client = tc.TrustClient()
print("base_url_set:", bool(client.base_url), "| configured:", client.configured,
      "| reachable:", client.health())

ref = sys.argv[1] if len(sys.argv) > 1 else "1"
try:
    prof = client.get_trust_profile(ref)
    print("PROFILE OK — org:", prof.get("org_name"),
          "| overall:", json.dumps(prof.get("overall")),
          "| source:", prof.get("source"))
except tc.TrustUnavailable as exc:
    print("PROFILE FAILED:", exc)
