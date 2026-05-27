"""NEAR tenant entry-point redirect service.

Tiny Flask app that gives the team a dedicated Railway-style URL for NEAR
without requiring real DNS work or buying a domain. Any request to this
service is 302'd to the main Kuja app with `?network=near` appended so the
existing NetworkProvider picks up the override, persists it to localStorage,
and the browser session continues entirely in NEAR's tenant.

Why a separate service?
  Railway caps auto-generated `.up.railway.app` domains at 1 per service.
  This separate service gets its own auto-issued URL — same Railway-style
  shape as the main app — so the team can bookmark a NEAR-specific entry
  point without configuring DNS.

Behaviour:
  GET  https://near-redirect-production-XXXX.up.railway.app/admin/funds
    → 302 → https://web-production-6f8a.up.railway.app/admin/funds?network=near

  After the redirect, NetworkProvider stores `kuja_network_override=near` in
  localStorage and strips the param from the URL. All subsequent navigation
  on the main app stays in NEAR's tenant for that browser session.

Health check:
  GET  /healthz → 200 OK ("ok" body). For Railway's healthcheck.

Environment:
  TARGET_URL — defaults to the live Kuja prod URL. Override to point this
               redirect at a different deploy (e.g. staging).
  NETWORK_SLUG — defaults to 'near'. Lets you reuse this same service shape
                 for future tenants by deploying with NETWORK_SLUG=resilio etc.
"""

import os
from urllib.parse import urlencode, urlparse, parse_qs, urlunparse

from flask import Flask, redirect, request, Response

app = Flask(__name__)

TARGET_URL = os.environ.get(
    "TARGET_URL", "https://web-production-6f8a.up.railway.app",
).rstrip("/")
NETWORK_SLUG = os.environ.get("NETWORK_SLUG", "near").strip().lower()


@app.route("/healthz", methods=["GET"])
def healthz():
    return Response("ok", status=200, mimetype="text/plain")


@app.route("/", defaults={"path": ""}, methods=["GET", "HEAD"])
@app.route("/<path:path>", methods=["GET", "HEAD"])
def near_entry(path):
    """Redirect any incoming GET to the main app with ?network=<slug> added.

    Preserves the original path + query string + fragment (where supported).
    Browsers handle fragment preservation across 302 automatically.
    """
    # Build the destination URL safely. Start from the configured target +
    # the requested path; merge query params; tack on the override.
    dest_path = f"/{path}" if path else "/"

    # Merge any incoming query params with network=<slug>
    incoming_qs = parse_qs(request.query_string.decode("utf-8") or "", keep_blank_values=True)
    incoming_qs["network"] = [NETWORK_SLUG]
    qs = urlencode({k: v[0] if isinstance(v, list) and v else v for k, v in incoming_qs.items()})

    dest = f"{TARGET_URL}{dest_path}?{qs}"
    return redirect(dest, code=302)


# For non-GET requests (POST/PUT/etc.) we keep the same redirect behaviour.
# Note: 307 would preserve method but breaks the network=near param flow for
# form posts. The expected usage is browser navigation (GET), so 302 is fine.


if __name__ == "__main__":
    # Local dev only. In Railway, Gunicorn runs this via Procfile.
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5001)), debug=False)
