# NEAR tenant entry-point redirect

Tiny Flask service that gives the team a dedicated Railway-style URL for NEAR
without DNS work. Click the URL → 302 → main Kuja app with `?network=near`
appended. NetworkProvider on the main app sets localStorage and strips the
param; the browser session continues entirely in NEAR's tenant.

## Why it exists

Railway caps auto-generated `.up.railway.app` domains at 1 per service. This
separate service gets its own auto-issued URL — same Railway-style shape as
the main Kuja app — so the team can bookmark a NEAR-specific entry point
without configuring DNS.

## One-time setup

From the repo root:

```bash
cd near_redirect

# Login + link if not already
railway login
railway init       # creates a new project, OR:
railway link       # link to an existing project (recommended: same as main app)

# Set the redirect target (defaults to the live Kuja prod URL)
railway variables --set TARGET_URL=https://web-production-6f8a.up.railway.app
railway variables --set NETWORK_SLUG=near

# Deploy
railway up --detach

# Get the auto-generated domain
railway domain
```

Railway will print something like:
```
🚀 https://near-redirect-production-XXXX.up.railway.app
```

That's the URL to give the team.

## What the team does with it

1. Click `https://near-redirect-production-XXXX.up.railway.app/admin/funds`
2. They're 302'd to the main Kuja app at `/admin/funds?network=near`
3. NetworkProvider stores `kuja_network_override=near` in localStorage
4. The `?network=near` param is stripped from the URL bar
5. Every subsequent click on the main app stays in NEAR's tenant for this
   browser session
6. To exit NEAR: click any `?network=kuja` or `?network=` URL

## Re-pointing if main URL changes

If the main Kuja Railway URL ever changes (rare), update the env var:

```bash
railway variables --set TARGET_URL=https://new-kuja-url.up.railway.app
railway up --detach
```

No code changes needed.

## Reusing for other tenants

For Resilio Fund or any future network:

```bash
railway variables --set NETWORK_SLUG=resilio
railway up --detach   # produces another redirect endpoint pointing at the same main app
```

Each tenant gets its own redirect service + its own Railway-style entry URL.

## Resource footprint

A single Flask worker doing only 302 redirects. Negligible CPU/memory.
Should fit comfortably within Railway's lowest tier.
