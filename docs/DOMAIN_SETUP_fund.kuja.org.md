# Set up `fund.kuja.org` for the Kuja Fund app — IT admin runbook

**Goal:** point **`fund.kuja.org`** at the Kuja Fund application (the main Kuja tenant — the one that integrates Kuja Trust). Date: 2026-08-16 · **corrected 2026-08-18.**

> ## ⚠️ If you're stuck right now (page shows Railway "Not Found")
> **This is a one-record fix.** As of 2026-08-18 the DNS is in this exact state:
> - ✅ The `CNAME` (`fund` → `u7b375h8.up.railway.app`) **is in place and resolving.**
> - ❌ The domain-**verification** record `_railway-verify.fund` (a **TXT**) **is missing.**
>
> Railway will not issue the HTTPS certificate or route the hostname until that TXT exists, so the edge shows *"the train has not arrived at the station."* **An earlier version of this runbook wrongly said "no TXT is needed" — that was the blocker.** Proof: the two live tenants both have this record — `_railway-verify.proximate.kuja.org` and `_railway-verify.saxansaxo.kuja.org` each resolve to a `railway-verify=…` value; `fund` does not.
>
> **To finish: add the TXT record in Part A (record #2). Its value comes from Railway → `web` → Settings → Networking → the `fund.kuja.org` entry.** Nothing else needs to change.

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

You already run other subdomains here (`proximate.kuja.org`, `saxansaxo.kuja.org`), so this is the same shape they used.

> **The custom domain is already registered in Railway** (Part B is done — see below), so both values are known. **You need TWO records:** the `CNAME` (routes traffic) **and** the `_railway-verify` `TXT` (proves you own the domain so Railway will issue the certificate). The live tenants `proximate` and `saxansaxo` each have both — that is why they work. `fund` currently has only the CNAME, which is why it's stuck.

**Record #1 — CNAME** (already in place; shown for completeness):

| Field | Value |
|---|---|
| **Type** | `CNAME` |
| **Host / Name** | `fund`  *(just `fund` — see gotcha #1)* |
| **Value / Target** | **`u7b375h8.up.railway.app`**  *(copy exactly)* |
| **TTL** | `300` (5 min) is fine |
| **Proxy** | **DNS only** if this zone is on Cloudflare (grey cloud), at least until the cert is issued — see gotcha #3 |

**Record #2 — TXT (the missing one — add this to finish):**

| Field | Value |
|---|---|
| **Type** | `TXT` |
| **Host / Name** | `_railway-verify.fund`  *(just this — the zone appends `.kuja.org`; see gotcha #1)* |
| **Value / Content** | `railway-verify=…`  — **copy the exact string from Railway → `web` → Settings → Networking → the `fund.kuja.org` entry** (it lists the CNAME as done and the TXT as pending). Do **not** reuse another tenant's value; each domain has its own. **Gotcha #2b: the value must contain exactly ONE `railway-verify=` prefix.** Railway's field already includes it, so paste it as-is — if your DNS UI shows `railway-verify=railway-verify=…`, delete the duplicate. |
| **TTL** | `300` |
| **Proxy** | N/A (TXT records are never proxied) |

Once both records are live, Railway auto-verifies within a few minutes, issues the TLS certificate, and `fund.kuja.org` flips to **Active** — the "Not Found" page disappears.

### Gotchas (these have bitten this zone before)
1. **Don't double the prefix — this is the trap that stuck `fund`.** Many DNS UIs auto-append the zone. Enter the host as **`fund`** for the CNAME and **`_railway-verify.fund`** for the TXT — *not* `fund.kuja.org` / `_railway-verify.fund.kuja.org`, or you create `fund.kuja.org.kuja.org` / `_railway-verify.fund.kuja.org.kuja.org`, which won't verify. (If your UI *requires* an FQDN, use the full `fund.kuja.org` / `_railway-verify.fund.kuja.org` — but never both forms.) After saving, confirm with `nslookup -type=TXT _railway-verify.fund.kuja.org` — it must return the `railway-verify=…` value, at that exact name.
2. **Copy the target from Railway verbatim.** Don't guess it or reuse another subdomain's target — each custom domain gets its own value.
3. **Cloudflare:** if `kuja.org` is proxied by Cloudflare, set this record to **DNS only** so Railway/Let's Encrypt can validate and issue the certificate. (If you later turn the orange-cloud proxy on, use SSL mode **Full (strict)**.)
4. **CAA records:** if the `kuja.org` zone has any **CAA** records, make sure they allow **`letsencrypt.org`** to issue certs, or Railway's TLS issuance will fail.
5. Propagation is usually a few minutes; allow up to a couple of hours.

---

## Part B — Add the custom domain in Railway (dev/ops)

> ✅ **Already done (2026-08-17).** `fund.kuja.org` is registered on the `web` service; Railway's required CNAME target is **`u7b375h8.up.railway.app`** (already filled into Part A). It shows **"Waiting for DNS update"** until Part A propagates — that is expected. You only need Part B if you ever have to re-create it.

1. Open **Railway → project `clever-cooperation` → environment `production` → service `web`**.
2. **Settings → Networking → Custom Domain → + Custom Domain**.
3. Enter **`fund.kuja.org`** and confirm.
4. Railway shows the **CNAME target** to point at — give this to the DNS team for Part A. *(For this domain it is `u7b375h8.up.railway.app`.)*
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

1. **Both DNS records resolve:** `nslookup fund.kuja.org` returns a Railway address (CNAME → `*.up.railway.app`), **and** `nslookup -type=TXT _railway-verify.fund.kuja.org` returns a `railway-verify=…` value. (If that TXT lookup says "does not exist", you're still in the stuck state — go back to Part A record #2.)
2. **Railway shows Active + HTTPS:** the domain is green/**Active** in Railway → web → Settings → Networking, and `curl -I https://fund.kuja.org/api/health` → `HTTP/…​ 200` with a valid (non-warning) certificate. In a browser the padlock is clean. *(A `SEC_E_WRONG_PRINCIPAL` / cert-name error here means the certificate hasn't issued yet — almost always the missing TXT.)*
3. **App loads on the right tenant:** open `https://fund.kuja.org` → the **Kuja** sign-in page with Kuja branding. (On a real branded domain the one-click "demo account" buttons are intentionally hidden — that's correct.)
4. **Sign in** with a real account; the dashboard loads with no console/CORS errors.
5. **Passkey (if used):** re-register a passkey under `fund.kuja.org`, sign out, sign back in with it.
6. **Trust hand-off round-trip:** as an NGO, open **Trust Profile** → **"Complete your capacity assessment in Kuja Trust"** → you're taken to Kuja Trust → click **"Return to your application"** → you land back on **`https://fund.kuja.org/trust?from=trust`** (this proves `KUJA_GRANT_BASE_URL` is correct).

---

## Part E — Rollback

Because the change is additive, rollback is low-risk:
1. Revert the Variables in Part C to their previous values (or the old Railway URL).
2. In Railway → web → Settings → Networking, **remove** the `fund.kuja.org` custom domain.
3. Delete the DNS **CNAME and `_railway-verify` TXT** records.
The app remains fully available at `https://web-production-6f8a.up.railway.app` throughout.

---

### Quick reference
- **Domain:** `fund.kuja.org` → main **Kuja** tenant (integrates Kuja Trust)
- **Hosting:** Railway · project `clever-cooperation` · env `production` · service `web`
- **DNS records (BOTH required):** (1) `CNAME  fund  →  u7b375h8.up.railway.app` — already live; (2) `TXT  _railway-verify.fund  →  railway-verify=…` (value from Railway → web → Settings → Networking) — **the missing one that's blocking it.** TTL 300; DNS-only if Cloudflare.
- **Env to update on `web`:** `CORS_ORIGINS`, `WEBAUTHN_ORIGIN`, `WEBAUTHN_RP_ID`, `KUJA_GRANT_BASE_URL`, `KUJA_PUBLIC_HOST` (+ `KUJA_PUBLIC_BASE_URL` if present)
