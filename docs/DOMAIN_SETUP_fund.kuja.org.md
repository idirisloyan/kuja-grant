# Set up `fund.kuja.org` for the Kuja Fund app — IT admin runbook

**Goal:** point **`fund.kuja.org`** at the Kuja Fund application (the main Kuja tenant — the one that integrates Kuja Trust). Date: 2026-08-16 · **re-verified against Railway's API 2026-08-19.**

> ## ✅ Current status (checked 2026-08-19) — you've done the DNS part; it's now Railway's turn
> We queried Railway's API directly. Here is the real state of `fund.kuja.org`:
> - ✅ The **`CNAME`** (`fund` → `u7b375h8.up.railway.app`) **is in place, correct, and fully propagated.** This is the **only** DNS record Railway requires.
> - ⏳ Railway's **TLS certificate is still being issued** — its status is *"validating ownership."* Until the certificate finishes, the edge serves its default `*.up.railway.app` certificate, which doesn't match `fund.kuja.org`, so browsers show a certificate/"Not Found" error.
>
> **There is nothing more to add in DNS.** In particular **no `_railway-verify` TXT record is needed** — Railway validates ownership automatically over the CNAME (an earlier version of this runbook wrongly told you to add a TXT; please ignore that — Railway's own required-records list contains only the CNAME, exactly like the working `proximate` and `saxansaxo` domains).
>
> **What happens next:** Railway issues the certificate automatically once it finishes validating — usually within ~30 minutes of the CNAME propagating, occasionally a few hours. When it's done, `fund.kuja.org` starts serving with no further action. **If it's still stuck after a few hours,** the fix is on the Railway side (dev/ops), not DNS — see "If it stays stuck" below.

**Good to know before you start**
- The app is hosted on **Railway** (project **`clever-cooperation`**, environment **production**, service **`web`**). It is currently reachable at `https://web-production-6f8a.up.railway.app`.
- **Zero downtime / no cutover risk:** adding a custom domain is *additive*. The existing Railway URL keeps working throughout.
- **No app routing change needed:** the app maps any un-recognised `*.kuja.org` host to the default **Kuja** tenant automatically, so `fund.kuja.org` lands on the right tenant with no code/DB change.
- TLS (HTTPS) is issued automatically by Railway (Let's Encrypt) once the CNAME resolves — you do **not** upload a certificate, and you do **not** add any verification record.

**Who does what**
- **Part A (DNS):** your DNS/IT team, in the `kuja.org` DNS zone. **This is a single CNAME — and per the status box above, it's already done.**
- **Parts B–C (Railway domain + app config):** whoever administers the Railway account (dev/ops).
- **Part D:** anyone, to verify.

---

## Part A — DNS record (in the `kuja.org` zone)

You already run other subdomains here (`proximate.kuja.org`, `saxansaxo.kuja.org`) the same way: **one CNAME each, no TXT.**

**The only record — CNAME** (already in place; shown for completeness / re-creation):

| Field | Value |
|---|---|
| **Type** | `CNAME` |
| **Host / Name** | `fund`  *(just `fund` — see gotcha #1)* |
| **Value / Target** | **`u7b375h8.up.railway.app`**  *(copy exactly)* |
| **TTL** | `300` (5 min) is fine |
| **Proxy** | **DNS only** if this zone is on Cloudflare (grey cloud), at least until the cert is issued — see gotcha #2 |

That's the whole DNS task. Once the CNAME resolves, Railway auto-validates ownership and issues the TLS certificate, and `fund.kuja.org` flips to **Active**.

### Gotchas (these have bitten this zone before)
1. **Don't double the prefix.** Many DNS UIs auto-append the zone. Enter the host as **`fund`** — *not* `fund.kuja.org`, or you create `fund.kuja.org.kuja.org`, which won't resolve. (If your UI *requires* an FQDN, use the full `fund.kuja.org` — but never both forms.) Confirm with `nslookup fund.kuja.org` — it must return a `*.up.railway.app` target.
2. **Cloudflare:** if `kuja.org` is proxied by Cloudflare, set this record to **DNS only** (grey cloud) so Railway/Let's Encrypt can validate and issue the certificate. (If you later turn the orange-cloud proxy on, use SSL mode **Full (strict)**.)
3. **CAA records:** if the `kuja.org` zone has any **CAA** records, make sure they allow **`letsencrypt.org`** to issue certs. (The working tenants already got Let's Encrypt certs on this zone, so this is only a concern if CAA was changed recently.)
4. Propagation is usually a few minutes; certificate issuance after that is usually < 30 min, occasionally a couple of hours.

---

## Part B — The custom domain in Railway (dev/ops)

> ✅ **Already done.** `fund.kuja.org` is registered on the `web` service with the CNAME target **`u7b375h8.up.railway.app`**. As of 2026-08-19 Railway reports its certificate status as **"validating ownership"** — i.e. it is mid-issuance, which is expected right after the CNAME propagates. You only need the steps below if you ever have to re-create it, or if issuance stays stuck (next section).

1. Open **Railway → project `clever-cooperation` → environment `production` → service `web`**.
2. **Settings → Networking → Custom Domain**. `fund.kuja.org` should already be listed.
3. The panel shows the certificate state. **Active/green** = done. **"Issuing" / "validating"** = in progress, just wait.

### If it stays stuck (still "Not Found" after a few hours)
This is a Railway-side certificate step, **not** a missing DNS record — do **not** add a TXT. To re-trigger issuance:
1. In **Railway → web → Settings → Networking**, **remove** the `fund.kuja.org` custom domain and **re-add** it (`+ Custom Domain` → `fund.kuja.org`). The CNAME target stays the same (`u7b375h8.up.railway.app`), so no DNS change is needed.
2. Wait ~15–30 min for Railway to re-validate and issue the cert.
3. Re-check with the verify steps in Part D. If it still fails, check the Cloudflare/CAA gotchas above, then contact Railway support with the domain name.

---

## Part C — App configuration (Railway → service `web` → Variables)

**Do this once `fund.kuja.org` is Active in Railway.** Several settings currently default to the old Railway URL; point them at the new domain or a few features break. In **Railway → web → Variables**, set/update:

| Variable | Set to | Why it matters |
|---|---|---|
| `CORS_ORIGINS` | `https://fund.kuja.org` *(comma-separate if keeping others, e.g. `https://fund.kuja.org,https://web-production-6f8a.up.railway.app`)* | Browser API calls from the new domain are blocked without it. |
| `WEBAUTHN_ORIGIN` | `https://fund.kuja.org` | Passkey (WebAuthn) sign-in verifies against this exact origin. |
| `WEBAUTHN_RP_ID` | `kuja.org` *(recommended)* | The domain passkeys are bound to. Using the parent `kuja.org` lets passkeys work on `fund.kuja.org` **and** survive future subdomain changes. (`fund.kuja.org` also works but is narrower.) |
| `KUJA_GRANT_BASE_URL` | `https://fund.kuja.org` | The **return URL for the Kuja Trust capacity-assessment hand-off** — so NGOs come back to `fund.kuja.org` after their assessment. |
| `KUJA_PUBLIC_HOST` | `fund.kuja.org` | Public hostname used for issued credentials / links. |
| `KUJA_PUBLIC_BASE_URL` *(if present)* | `https://fund.kuja.org` | Same, base-URL form. |

Saving variables triggers a redeploy (about a minute).

**Two things to know:**
- **Passkeys re-register once.** Any passkeys enrolled under the old Railway host stop working when `WEBAUTHN_RP_ID` changes; affected users simply re-add a passkey in **Settings → Security**. (Password + authenticator-app/TOTP sign-in are unaffected.)
- **Kuja Trust app is separate.** It stays on its own domain; the only cross-app dependency for this domain change is `KUJA_GRANT_BASE_URL` above.

---

## Part D — Verify (after the certificate is issued)

1. **CNAME resolves:** `nslookup fund.kuja.org` returns a Railway address (CNAME → `*.up.railway.app`). *(No TXT lookup is needed — Railway doesn't require one.)*
2. **Railway shows Active + HTTPS:** the domain is green/**Active** in Railway → web → Settings → Networking, and `curl -I https://fund.kuja.org/api/health` → `HTTP/… 200` with a valid certificate whose name is `fund.kuja.org` (not `*.up.railway.app`). In a browser the padlock is clean. *(A `SEC_E_WRONG_PRINCIPAL` / cert-name error, or the certificate showing `CN=*.up.railway.app`, means the certificate hasn't issued yet — wait, or re-trigger per Part B.)*
3. **App loads on the right tenant:** open `https://fund.kuja.org` → the **Kuja** sign-in page with Kuja branding.
4. **Sign in** with a real account; the dashboard loads with no console/CORS errors.
5. **Passkey (if used):** re-register a passkey under `fund.kuja.org`, sign out, sign back in with it.
6. **Trust hand-off round-trip:** as an NGO, open **Trust Profile** → **"Complete your capacity assessment in Kuja Trust"** → you're taken to Kuja Trust → **"Return to your application"** → you land back on **`https://fund.kuja.org/trust?from=trust`** (this proves `KUJA_GRANT_BASE_URL` is correct).

---

## Part E — Rollback

Because the change is additive, rollback is low-risk:
1. Revert the Variables in Part C to their previous values (or the old Railway URL).
2. In Railway → web → Settings → Networking, **remove** the `fund.kuja.org` custom domain.
3. Delete the DNS **CNAME** record.
The app remains fully available at `https://web-production-6f8a.up.railway.app` throughout.

---

### Quick reference
- **Domain:** `fund.kuja.org` → main **Kuja** tenant (integrates Kuja Trust)
- **Hosting:** Railway · project `clever-cooperation` · env `production` · service `web`
- **DNS record (the only one):** `CNAME  fund  →  u7b375h8.up.railway.app` — already live & propagated. **No TXT record is required.** TTL 300; DNS-only if Cloudflare.
- **Why it's not up yet (2026-08-19):** Railway's TLS cert for `fund.kuja.org` is still issuing ("validating ownership"). It completes automatically; if stuck for hours, remove + re-add the domain in Railway (Part B) — this is a Railway step, not a DNS one.
- **Env to update on `web` once Active:** `CORS_ORIGINS`, `WEBAUTHN_ORIGIN`, `WEBAUTHN_RP_ID`, `KUJA_GRANT_BASE_URL`, `KUJA_PUBLIC_HOST` (+ `KUJA_PUBLIC_BASE_URL` if present)
