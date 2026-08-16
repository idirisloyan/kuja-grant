# Set up `fund.kuja.org` for the Kuja Fund app — IT admin runbook

**Goal:** point **`fund.kuja.org`** at the Kuja Fund application (the main Kuja tenant — the one that integrates Kuja Trust). Date: 2026-08-16.

**Good to know before you start**
- The app is hosted on **Railway** (project **`clever-cooperation`**, environment **production**, service **`web`**). It is currently reachable at `https://web-production-6f8a.up.railway.app`.
- **Zero downtime / no cutover risk:** adding a custom domain is *additive*. The existing Railway URL keeps working throughout, so you can set this up and verify before anyone relies on `fund.kuja.org`.
- **No app routing change needed:** the app maps any un-recognised `*.kuja.org` host to the default **Kuja** tenant automatically, so `fund.kuja.org` lands on the right tenant with no code/DB change.
- TLS (HTTPS) is issued automatically by Railway (Let's Encrypt) once DNS resolves — you do **not** upload a certificate.

**Who does what**
- **Part A (DNS):** your DNS/IT team, in the `kuja.org` DNS zone.
- **Parts B–C (Railway domain + app config):** whoever administers the Railway account (dev/ops). Parts B and A are done together (B gives you the exact value A needs).
- **Part D:** anyone, to verify.

---

## Part A — DNS record (in the `kuja.org` zone)

You already run other subdomains here (`proximate.kuja.org`, `near.kuja.org`), so this is one more subdomain record.

Add a single **CNAME** record:

| Field | Value |
|---|---|
| **Type** | `CNAME` |
| **Host / Name** | `fund`  *(just `fund` — see gotcha #1)* |
| **Value / Target** | **the CNAME target Railway shows** in Part B (e.g. `…​.up.railway.app`) — copy it exactly |
| **TTL** | `300` (5 min) is fine |
| **Proxy** | **DNS only** if this zone is on Cloudflare (grey cloud), at least until the cert is issued — see gotcha #3 |

### Gotchas (these have bitten this zone before)
1. **Don't double the prefix.** Many DNS UIs auto-append the zone. Enter the host as **`fund`**, *not* `fund.kuja.org` — otherwise you create `fund.kuja.org.kuja.org` and it won't resolve. (If your UI needs a FQDN, then use the full `fund.kuja.org`, but never both.)
2. **Copy the target from Railway verbatim.** Don't guess it or reuse another subdomain's target — each custom domain gets its own value.
3. **Cloudflare:** if `kuja.org` is proxied by Cloudflare, set this record to **DNS only** so Railway/Let's Encrypt can validate and issue the certificate. (If you later turn the orange-cloud proxy on, use SSL mode **Full (strict)**.)
4. **CAA records:** if the `kuja.org` zone has any **CAA** records, make sure they allow **`letsencrypt.org`** to issue certs, or Railway's TLS issuance will fail.
5. Propagation is usually a few minutes; allow up to a couple of hours.

---

## Part B — Add the custom domain in Railway (dev/ops)

1. Open **Railway → project `clever-cooperation` → environment `production` → service `web`**.
2. **Settings → Networking → Custom Domain → + Custom Domain**.
3. Enter **`fund.kuja.org`** and confirm.
4. Railway shows the **CNAME target** to point at — give this to the DNS team for Part A.
5. Once the DNS record is live, Railway auto-verifies and issues the TLS certificate. The domain flips to **Active** (green). If it's stuck "waiting", re-check the CNAME target and the Cloudflare/CAA gotchas above.

---

## Part C — App configuration (Railway → service `web` → Variables)

**Do this once `fund.kuja.org` is Active in Railway (Part B).** Several settings currently default to the old Railway URL; they must point at the new domain or a few features break. In **Railway → web → Variables**, set/update:

| Variable | Set to | Why it matters |
|---|---|---|
| `CORS_ORIGINS` | `https://fund.kuja.org` *(comma-separate if keeping others, e.g. `https://fund.kuja.org,https://web-production-6f8a.up.railway.app`)* | Browser API calls from the new domain are blocked without it. |
| `WEBAUTHN_ORIGIN` | `https://fund.kuja.org` | Passkey (WebAuthn) sign-in verifies against this exact origin. |
| `WEBAUTHN_RP_ID` | `kuja.org` *(recommended)* | The domain passkeys are bound to. Using the parent `kuja.org` lets passkeys work on `fund.kuja.org` **and** survive future subdomain changes. (`fund.kuja.org` also works but is narrower.) |
| `KUJA_GRANT_BASE_URL` | `https://fund.kuja.org` | The **return URL for the Kuja Trust capacity-assessment hand-off** — so NGOs come back to `fund.kuja.org` (not the Railway URL) after their assessment. |
| `KUJA_PUBLIC_HOST` | `fund.kuja.org` | Public hostname used for issued credentials / links. |
| `KUJA_PUBLIC_BASE_URL` *(if present)* | `https://fund.kuja.org` | Same, base-URL form. |

Saving variables triggers a redeploy (about a minute).

**Two things to know:**
- **Passkeys re-register once.** Any passkeys enrolled under the old Railway host stop working when `WEBAUTHN_RP_ID` changes; affected users simply re-add a passkey in **Settings → Security**. (Password + authenticator-app/TOTP sign-in are unaffected.) For a pilot with few/no passkeys this is a non-event — do it now rather than after go-live.
- **Kuja Trust app is separate.** It stays on its own domain (`kuja-app-production.up.railway.app`); the only cross-app dependency for this domain change is `KUJA_GRANT_BASE_URL` above. If you later want a branded Trust domain (e.g. `trust.kuja.org`), that's a separate, similar setup on the Trust service — ask us and we'll extend this runbook.
- *(Optional hardening, dev team):* the app already routes `fund.kuja.org` to the Kuja tenant via the default-tenant fallback. For determinism you can also add `fund.kuja.org` to the Kuja network's `host_aliases` — not required for launch.

---

## Part D — Verify (after DNS is live + variables saved)

1. **DNS resolves:** `nslookup fund.kuja.org` returns a Railway address (a CNAME to `*.up.railway.app`).
2. **HTTPS + health:** `curl -I https://fund.kuja.org/api/health` → `HTTP/…​ 200`, with a valid (non-warning) certificate. In a browser the padlock is clean.
3. **App loads on the right tenant:** open `https://fund.kuja.org` → the **Kuja** sign-in page with Kuja branding. (On a real branded domain the one-click "demo account" buttons are intentionally hidden — that's correct.)
4. **Sign in** with a real account; the dashboard loads with no console/CORS errors.
5. **Passkey (if used):** re-register a passkey under `fund.kuja.org`, sign out, sign back in with it.
6. **Trust hand-off round-trip:** as an NGO, open **Trust Profile** → **"Complete your capacity assessment in Kuja Trust"** → you're taken to Kuja Trust → click **"Return to your application"** → you land back on **`https://fund.kuja.org/trust?from=trust`** (this proves `KUJA_GRANT_BASE_URL` is correct).

---

## Part E — Rollback

Because the change is additive, rollback is low-risk:
1. Revert the Variables in Part C to their previous values (or the old Railway URL).
2. In Railway → web → Settings → Networking, **remove** the `fund.kuja.org` custom domain.
3. Delete the DNS CNAME record.
The app remains fully available at `https://web-production-6f8a.up.railway.app` throughout.

---

### Quick reference
- **Domain:** `fund.kuja.org` → main **Kuja** tenant (integrates Kuja Trust)
- **Hosting:** Railway · project `clever-cooperation` · env `production` · service `web`
- **DNS record:** `CNAME  fund  →  <target Railway shows>`  (TTL 300, DNS-only if Cloudflare)
- **Env to update on `web`:** `CORS_ORIGINS`, `WEBAUTHN_ORIGIN`, `WEBAUTHN_RP_ID`, `KUJA_GRANT_BASE_URL`, `KUJA_PUBLIC_HOST` (+ `KUJA_PUBLIC_BASE_URL` if present)
