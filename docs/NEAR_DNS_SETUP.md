# Adding `near.kuja.org` and/or `app.near.ngo` as real tenant URLs

Status: prerequisite tasks to retire the `?network=near` admin override and serve NEAR as a first-class subdomain.

After the steps below, **any visitor to `https://near.kuja.org`** will be routed automatically to the NEAR tenant — no override header required, no admin login needed, public pages (`/network/current` brand info) render with the teal NEAR brand.

The middleware (`app/middleware.py::resolve_network_context`) already honours the host header via `Network.resolve_from_host()`. The seeded NEAR Network row already has `host_aliases=["near.kuja.org", "app.near.ngo"]`. Everything on the backend side is wired. **The only remaining step is DNS + a Railway custom-domain registration.**

---

## Option A — `near.kuja.org` subdomain under Kuja's apex (fastest)

Use this when you want the demo live in minutes and don't need a NEAR-owned domain.

### 1. Register the custom domain on Railway

```bash
railway domain add near.kuja.org
```

Or via the Railway dashboard:
1. Open the `clever-cooperation` project → `web` service → **Settings → Networking → Domains**
2. Click **+ Custom Domain**
3. Enter `near.kuja.org`
4. Railway returns a CNAME target like `<random>.up.railway.app` (note this value — you'll need it for DNS)

### 2. Add the CNAME at your DNS provider

Wherever `kuja.org` DNS is hosted (Cloudflare, Route 53, Namecheap, etc.), add:

| Type  | Name    | Value                              | TTL  |
|-------|---------|------------------------------------|------|
| CNAME | `near`  | `<the value Railway gave you>`     | 300  |

### 3. Wait for propagation + cert provisioning

Railway auto-issues a Let's Encrypt certificate once it sees the CNAME resolve correctly. Usually < 5 minutes; can take up to 30. Verify:

```bash
dig +short near.kuja.org
# Expect a CNAME chain ending in *.up.railway.app

curl -I https://near.kuja.org/api/network/current
# Expect HTTP 200, JSON body with "slug": "near", "brand_color_hex": "#0F766E"
```

### 4. Verify the browser flow

Open `https://near.kuja.org/admin/funds` in a fresh browser session:
- Should resolve to the same Railway instance via host header
- `Network.resolve_from_host("near.kuja.org")` matches the seeded `host_aliases`
- Brand swaps to teal automatically on first paint, no `?network=` needed
- All `/api/*` calls scope to NEAR's data without `X-Network-Override`

---

## Option B — `app.near.ngo` on NEAR-owned domain (more credible)

Same code path; just CNAME from NEAR's domain instead of `kuja.org`.

### 1. Add to Railway

```bash
railway domain add app.near.ngo
```

### 2. NEAR adds the CNAME at near.ngo's DNS provider

| Type  | Name   | Value                              | TTL  |
|-------|--------|------------------------------------|------|
| CNAME | `app`  | `<the value Railway gave you>`     | 300  |

### 3. Update host_aliases if needed

The seeded row already lists `app.near.ngo` in `host_aliases`, so no code or data change is required. If you want to update it, run:

```python
# In flask shell or via railway run python
from app.extensions import db
from app.models import Network
n = Network.query.filter_by(slug="near").first()
n.set_host_aliases(["near.kuja.org", "app.near.ngo", "near.adeso.org"])
db.session.commit()
```

---

## Option C — Run both simultaneously (recommended for the spin-off transition)

NEAR spins off from Adeso end-2026. The clean transition:

1. **Now** — add `near.kuja.org`. Team can demo + soft-launch on Adeso infrastructure.
2. **When NEAR's own domain is registered** — add `app.near.ngo` (or whatever they choose). Both work simultaneously; either host resolves to the same NEAR tenant.
3. **At spin-off** — drop `near.kuja.org`. Optionally export NEAR's data (`SELECT ... WHERE network_id=2`) if they want their own infrastructure too.

Because the multi-tenant model is data-portable, spin-off doesn't require a migration or code change — it's a CNAME removal + optional data export.

---

## Troubleshooting

### `curl -I https://near.kuja.org/api/network/current` returns the wrong network

Verify the seeded host_aliases:

```bash
curl -s -H 'Authorization: Bearer ...' https://web-production-6f8a.up.railway.app/api/network/ \
  | python -m json.tool
```

Look for the `near` row and confirm `host_aliases` contains the exact hostname you're hitting (lowercase, no trailing slash).

If `host_aliases` is empty or missing the hostname, the bootstrap may have raced — set it manually via flask shell.

### Cert provisioning stuck

If Railway shows the domain as "Pending" for > 30 min, the CNAME hasn't propagated yet. Check:

```bash
dig +short near.kuja.org
nslookup near.kuja.org 8.8.8.8
```

If neither returns a CNAME, the DNS change hasn't reached the public resolvers yet. Wait or contact your DNS provider.

### Visitors see the Kuja brand on near.kuja.org

Means the host-header middleware fell through to the default tenant. Check:
1. `Network.query.filter_by(slug='near').first()` exists (bootstrap should have created it; check `app/__init__.py`)
2. `near.kuja.org` is in that row's `host_aliases` JSON list
3. The browser didn't cache an old localStorage `kuja_network_override` set during demo testing — open dev tools → Application → Local Storage → delete `kuja_network_override` if present

### Want to keep the `?network=` override AND real DNS

The two coexist. The middleware checks `X-Network-Override` first (admin-only), then falls through to the host header. So:
- Public visitors to `near.kuja.org` get NEAR via host header
- Admin testing on `web-production-6f8a.up.railway.app` can still use `?network=near` to switch
- Admin on `near.kuja.org` who wants to peek at Kuja Marketplace data uses `?network=kuja`

---

## Code reference

If you ever need to look up where this is wired:

| Concern | File |
|---|---|
| Network model + `resolve_from_host()` | `app/models/network.py` |
| Host-header + override middleware | `app/middleware.py::resolve_network_context` |
| Per-request `g.network` accessor | `app/utils/network.py::get_current_network()` |
| Bootstrap that seeds the `near` row | `app/__init__.py` (`Phase 32` block) |
| Frontend brand context | `frontend/src/components/network-provider.tsx` |
| API client header injection | `frontend/src/lib/api.ts::apiFetch` |
