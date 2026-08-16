# Grant ↔ Trust capacity-assessment hand-off — design

**Status:** approved, in build · **Scope:** Kuja Marketplace tenant (`slug='kuja'`) · **Date:** 2026-08-15

## Goal

An NGO in the **Kuja Grant** app completes its **capacity assessment** in the standalone
**Kuja Trust** app, then returns, with the trust/capacity result reflected back in the Grant
app — in one round trip, no second login. Robust, convenient, low-maintenance, and
forward-compatible with the eventual Odoo/OIDC identity plan.

## Chosen mechanism: signed hand-off + service read-back

```
NGO (Grant app)                     Grant backend                    Trust app
   |  click "Complete assessment"      |                                |
   |---------------------------------->| POST /api/trust/handoff        |
   |                                   |  - ensure org kuja_partner_id  |
   |                                   |  - mint 5-min HS256 token      |
   |     { url: TRUST/handoff?token }  |    (sub=ref, name, email,      |
   |<----------------------------------|     return_url, exp, jti)      |
   |  window.location = url            |                                |
   |------------------------------------------------------------------->| GET /handoff?token
   |                                   |                    verify sig + exp + iss/aud
   |                                   |                    resolve-or-create org by ref
   |                                   |                    mint session (like demo, no pwd)
   |                                   |                    store return_url on session
   |               302 -> Assessment tab (workspace) <------------------|
   |   ...NGO completes the 7-domain assessment / uploads evidence...   |
   |  click "Return to your application"                                |
   |<-------------------------------------------------------------------| 302 -> return_url
   |  Grant /trust?from=trust           |                                |
   |---------------------------------->| GET /api/trust-profile         |
   |                                   |  trust_engine=remote ->        |
   |                                   |  GET TRUST/api/service/         |
   |                                   |      trust-profile?org=ref  --->| (bearer service token)
   |   two-pillar status rendered      |<-------------------------------|
```

### 1. Identity — reuse the platform join key
`Organization.kuja_partner_id` is the durable cross-app org identity (Link/Grant/Trust/Build).
On first hand-off, if it is null we backfill a stable ref `grant:<org_id>` and persist it. The
Trust app resolves the org by this ref (`resolveOrgIdByRef`) and **creates** a minimal org if the
ref is new. No new identity concept is introduced.

### 2. The hand-off token — standard JWT (HS256), standard-library only
- Format: a real compact JWT `base64url(header).base64url(payload).base64url(HMAC-SHA256)`.
- Signed/verified with each language's **standard library** — Python `hmac`+`hashlib`,
  Node `crypto.createHmac` + `crypto.timingSafeEqual` (already used in Trust `lib/service-auth.ts`).
  **No new dependency on either side.**
- Claims: `iss="kuja-grant"`, `aud="kuja-trust"`, `sub=<org_ref>`, `name`, `email`,
  `return_url`, `iat`, `exp` (now + 5 min), `jti` (random nonce).
- Secret: shared `KUJA_TRUST_HANDOFF_SECRET` on both services.
- Robustness: HTTPS-only; short TTL; signature covers `return_url` (so it can't be tampered to
  an attacker site); `iss`/`aud` checked. `jti` is carried so a used-nonce store can be added
  later without changing the token format (replay within the 5-min window is low-risk — it only
  re-opens the same org's own session).

### 3. Trust side — `/handoff`
Verifies the token, resolves-or-creates the org, mints a session **bound to that org** (mirrors
the existing passwordless demo-session path, flagged `origin='grant_handoff'`), stores `return_url`
on the session, and redirects to the workspace **Assessment** tab. A **"Return to your
application"** button reads `return_url`. Hand-off sessions are scoped to the assessment/evidence
workspace (no platform-admin capability).

### 4. Read-back — the existing service seam
Grant reads the two-pillar profile back via `trust_engine`/`trust_client` →
`GET /api/service/trust-profile?org=<ref>` (bearer `KUJA_TRUST_SERVICE_TOKEN`). Surfaced on
`/trust`, the NGO dashboard, and the apply trust-readiness nudge. On `?from=trust` the Grant
`/trust` page force-refreshes.

### 5. Config / secrets
| Var | Grant | Trust | Purpose |
|---|---|---|---|
| `KUJA_TRUST_HANDOFF_SECRET` | ✓ | ✓ | HS256 sign/verify (shared) |
| `KUJA_TRUST_SERVICE_TOKEN` | ✓ (send) | ✓ (validate) | bearer read-back |
| `KUJA_TRUST_BASE_URL` | ✓ | — | where to send the browser + service calls |
| `KUJA_TRUST_ENGINE=remote` | ✓ | — | turn on read-back (default `local`) |
| `KUJA_GRANT_BASE_URL` | ✓ | — | build the signed `return_url` (or derive from request host) |

### 6. Rollout (safe, reversible)
1. Ship code to both repos **feature-gated on the secret** — with the secret unset the CTA is
   hidden, `/handoff` is disabled, engine stays `local`. Zero behaviour change on the live apps.
2. Set the shared secrets + `KUJA_TRUST_BASE_URL` + `KUJA_TRUST_ENGINE=remote` on both Railway
   services. Feature turns on.
3. E2E verify: NGO clicks CTA → lands on Assessment → completes → returns → Grant shows status.
4. Kill switch: unset `KUJA_TRUST_HANDOFF_SECRET` (or set `KUJA_TRUST_ENGINE=local`) to fully
   disable, instantly and non-destructively.

### 7. Forward-compatibility
When Kuja Link (Odoo) becomes the OIDC IdP, only the **token mint/verify** step is swapped for an
OIDC `id_token`; the org-resolve, session-mint, return-URL, and read-back machinery are unchanged.
Nothing here is throwaway.

## Non-goals (kept out for low maintenance)
- No full SSO/session federation now (that's the OIDC phase).
- No bespoke crypto or third-party JWT library.
- No change to the Grant app's own in-app assessment — it remains the offline/degraded fallback.
