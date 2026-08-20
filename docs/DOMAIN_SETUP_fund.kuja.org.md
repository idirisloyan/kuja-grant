# Set up `fund.kuja.org` for the Kuja Fund app — IT admin runbook

**Goal:** point **`fund.kuja.org`** at the Kuja Fund application (the main Kuja tenant — the one that integrates Kuja Trust). Date: 2026-08-16 · **corrected against Railway's API + DNS ground truth 2026-08-19.**

> ## ⚠️ To make it work you must add TWO DNS records: a CNAME **and** a `_railway-verify` TXT
> The certificate is stuck because the **ownership-verification TXT record is missing**. Confirmed three ways: Railway's `verificationToken` API field, a live DNS check (the working `proximate`/`saxansaxo` domains each have a `_railway-verify` TXT; `fund` does not), and Railway support.
>
> **A custom domain needs BOTH:**
> 1. a **CNAME** (routes traffic), and
> 2. a **`_railway-verify` TXT** (proves you own the domain so Railway/Let's Encrypt will issue the certificate).
>
> Until the TXT exists, Railway sits at **"validating ownership"** forever and serves its default `*.up.railway.app` certificate, so browsers get a cert-name mismatch / "Not Found."
>
> *(Note: an earlier version of this runbook briefly said "no TXT is needed." That was wrong — it came from reading Railway's `dnsRecords` API field, which lists only the CNAME and omits the verification TXT. The TXT is required. Add both records in Part A.)*

**Good to know before you start**
- Hosted on **Railway** (project **`clever-cooperation`**, environment **production**, service **`web`**). Currently reachable at `https://web-production-6f8a.up.railway.app`.
- **Zero downtime / additive:** the existing Railway URL keeps working throughout.
- **No app routing change needed:** the app maps any un-recognised `*.kuja.org` host to the default **Kuja** tenant automatically.
- TLS (HTTPS) is issued automatically by Railway (Let's Encrypt) once **both** DNS records are in place and verified — you don't upload a certificate.

---

## Part A — DNS records (in the `kuja.org` zone / Route 53)

**Both records are required.** Values below are current as of 2026-08-19; the **authoritative source is Railway → `web` → Settings → Networking → the `fund.kuja.org` entry**, which shows the CNAME target and the verification token. (If the domain is ever removed and re-added in Railway, the token and CNAME target change — re-read them from that panel.)

**Record #1 — CNAME (routes traffic):**

| Field | Value |
|---|---|
| **Type** | `CNAME` |
| **Host / Name** | `fund`  *(just `fund` — see gotcha #1)* |
| **Value / Target** | **`0tvwlstv.up.railway.app`**  *(current target in the dashboard; an older `u7b375h8.up.railway.app` may still be in place and also resolves, but set it to this to match Railway exactly)* |
| **TTL** | `300` |
| **Proxy** | **DNS only** if on Cloudflare — see gotcha #3 |

**Record #2 — TXT (proves ownership — THIS is the missing one blocking the cert):**

| Field | Value |
|---|---|
| **Type** | `TXT` |
| **Host / Name** | `_railway-verify.fund`  *(the zone appends `.kuja.org`; see gotcha #1)* |
| **Value / Content** | `railway-verify=7c60d4d4b9bd5dbac68b50dc126395139dd63a229da0ba3fbb49531cff107881` |
| **TTL** | `300` |
| **Proxy** | N/A (TXT is never proxied) |

Once **both** are live, Railway auto-verifies within a few minutes, issues the TLS certificate, and `fund.kuja.org` flips to **Active** — the "Not Found" page disappears.

### Gotchas (these have bitten this zone before)
1. **Don't double the prefix.** Enter the host as **`fund`** and **`_railway-verify.fund`** — *not* `fund.kuja.org` / `_railway-verify.fund.kuja.org`, or you create `fund.kuja.org.kuja.org`. (If your UI *requires* an FQDN, use the full form — but never both.) Verify with `nslookup -type=TXT _railway-verify.fund.kuja.org`; it must return the `railway-verify=…` value.
2. **Route 53 TXT quoting.** In AWS Route 53, wrap the TXT value in double quotes: `"railway-verify=7c60d4d4b9bd5dbac68b50dc126395139dd63a229da0ba3fbb49531cff107881"`. Paste the value **exactly** — exactly one `railway-verify=` prefix (if your UI shows `railway-verify=railway-verify=…`, delete the duplicate).
3. **Cloudflare:** if `kuja.org` is proxied, set the CNAME to **DNS only** so Let's Encrypt can validate. (This zone is on Route 53, so this usually doesn't apply.)
4. **CAA:** if the zone has CAA records, they must allow `letsencrypt.org`. (There are currently no CAA records on `kuja.org`, so this is fine.)
5. Propagation is usually a few minutes; certificate issuance after verification is usually < 30 min.

---

## Part B — The custom domain in Railway (dev/ops)

> ✅ Already registered on the `web` service. Its cert is stuck at **"validating ownership"** purely because the Part-A **TXT** record is missing. Add the TXT and it proceeds automatically. You only need the steps below to re-create it or read the current token/target.

1. Open **Railway → project `clever-cooperation` → environment `production` → service `web`**.
2. **Settings → Networking → Custom Domain → the `fund.kuja.org` entry**. It shows the required **CNAME target** and the **`_railway-verify` TXT host + token** — these are the source of truth for Part A.
3. Once both DNS records propagate, the entry flips to **Active** (green) and the cert issues.

---

## Part C — App configuration (Railway → service `web` → Variables)

**Do this once `fund.kuja.org` is Active.** Several settings default to the old Railway URL; point them at the new domain or a few features break.

| Variable | Set to | Why it matters |
|---|---|---|
| `CORS_ORIGINS` | `https://fund.kuja.org` *(comma-separate to keep others)* | Browser API calls from the new domain are blocked without it. |
| `WEBAUTHN_ORIGIN` | `https://fund.kuja.org` | Passkey (WebAuthn) sign-in verifies against this exact origin. |
| `WEBAUTHN_RP_ID` | `kuja.org` *(recommended)* | Domain passkeys are bound to; the parent zone lets them work across subdomains. |
| `KUJA_GRANT_BASE_URL` | `https://fund.kuja.org` | Return URL for the Kuja Trust capacity-assessment hand-off. |
| `KUJA_PUBLIC_HOST` | `fund.kuja.org` | Public hostname used for issued credentials / links. |
| `KUJA_PUBLIC_BASE_URL` *(if present)* | `https://fund.kuja.org` | Same, base-URL form. |

Saving variables triggers a redeploy (~1 min). Passkeys enrolled under the old host re-register once (Settings → Security).

---

## Part D — Verify (after both DNS records are live)

1. **Both records resolve:** `nslookup fund.kuja.org` → a Railway `*.up.railway.app` target, **and** `nslookup -type=TXT _railway-verify.fund.kuja.org` → the `railway-verify=…` value. (If that TXT lookup says "does not exist", you're still in the stuck state — go back to Part A record #2.)
2. **Railway shows Active + HTTPS:** green/**Active** in the dashboard, and `curl -I https://fund.kuja.org/api/health` → `HTTP/… 200` with a certificate whose name is `fund.kuja.org` (not `*.up.railway.app`). *(A `SEC_E_WRONG_PRINCIPAL` / cert-name error, or a cert showing `CN=*.up.railway.app`, means it hasn't verified/issued yet — recheck the TXT.)*
3. **App loads on the right tenant:** open `https://fund.kuja.org` → the **Kuja** sign-in page.
4. **Sign in**; dashboard loads with no console/CORS errors.
5. **Trust hand-off round-trip** (proves `KUJA_GRANT_BASE_URL`): NGO → Trust Profile → complete assessment in Kuja Trust → "Return to your application" → lands on `https://fund.kuja.org/trust?from=trust`.

---

## Part E — Rollback

Additive, so low-risk:
1. Revert the Part-C Variables.
2. Remove the `fund.kuja.org` custom domain in Railway.
3. Delete the DNS **CNAME** and **`_railway-verify.fund` TXT** records.
The app stays available at `https://web-production-6f8a.up.railway.app` throughout.

---

### Quick reference
- **Domain:** `fund.kuja.org` → main **Kuja** tenant.
- **Hosting:** Railway · project `clever-cooperation` · env `production` · service `web`.
- **DNS records (BOTH required):** (1) `CNAME  fund → 0tvwlstv.up.railway.app`; (2) `TXT  _railway-verify.fund → railway-verify=7c60d4d4b9bd5dbac68b50dc126395139dd63a229da0ba3fbb49531cff107881`. TTL 300. The TXT is the ownership-verification record — **without it the cert stays stuck at "validating ownership."** Read live values from Railway → web → Settings → Networking if in doubt.
- **Env to update on `web` once Active:** `CORS_ORIGINS`, `WEBAUTHN_ORIGIN`, `WEBAUTHN_RP_ID`, `KUJA_GRANT_BASE_URL`, `KUJA_PUBLIC_HOST` (+ `KUJA_PUBLIC_BASE_URL` if present).
