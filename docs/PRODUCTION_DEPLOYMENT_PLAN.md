# Kuja — Production Deployment Plan

**Version:** 1.0 · **Date:** 2026-08-15 · **Status:** Draft for review
**Platform:** Kuja Grant Management System v5.0.0 ("Kuja Studio") — multi-tenant Flask + Next.js on Railway
**Owner:** _[Programme / Eng lead]_ · **Target launch:** _[date — after pilot sign-off]_

> This is the master launch checklist. Work top-to-bottom; each `- [ ]` is an
> action with an owner. Sections 1–13 are the plan; Section 14 is the open-risk
> register; the Appendices are the fill-in checklists you tick on cut-over day.
> File references (e.g. `app/config.py:48`) point at where each item lives.

---

## 0. Executive summary — what "go live" means here

Kuja is **one codebase serving four tenants** off different hostnames (Kuja Marketplace, NEAR, Proximate/Adeso-Sudan, Saxansaxo/Somalia). The backend (Flask, `app/`) serves the pre-built Next.js static export (`static/nextjs/`) and the JSON API; Postgres is the store; Railway hosts it (project `clever-cooperation`, service `web`, plus Postgres, Redis, and a `near-redirect` service). Today the pilot runs on the raw Railway URL `web-production-6f8a.up.railway.app` with demo (`pass123`) accounts.

"Launch" = each tenant reachable on its **own branded domain**, with real accounts, real DNS/TLS/email, the legal & AI-disclosure pages published, the six languages reviewed by native speakers, real-device + accessibility + security certification done, monitoring live, and the demo accounts retired. The sections below cover all of it.

**Recommended sequencing:** stand up a **staging** deploy first (there is none today — this is a gap), migrate one tenant (suggest Proximate or NEAR as the first branded go-live since their domains are already documented), certify, then roll the rest.

---

## 1. Environments & release management

- [ ] **Create a staging environment** on Railway (separate service + Postgres) that mirrors prod config. There is currently only prod; every change is tested against pilot-on-prod, which is risky at launch scale.
- [ ] Confirm the branch→deploy flow: push to `main` → Railway auto-deploys → poll `GET /api/version` for the expected build SHA. Document the expected turnaround (~1–3 min).
- [ ] **Frontend build gotcha (critical):** Railway does **not** rebuild the Next.js frontend. The committed `static/nextjs/` export is what ships. Any frontend change must be built (`npm run build` in `frontend/`) and the regenerated `static/nextjs/` committed. The CI gate `.github/workflows/frontend-build-sync.yml` (runs `frontend/scripts/verify-built.js`) fails the build if the export drifts from source — keep it green.
- [ ] Adopt a **release/tag convention** and keep `docs/PHASE_*_RELEASE_NOTES.md` updated per release.
- [ ] Define a **deploy freeze window** policy around launch (no non-hotfix deploys 48h pre/post launch).
- [ ] Add a **post-deploy verification script** that polls `/api/version` for the expected SHA and runs the smoke gate (today `regression.py` polls `/api/health` but nothing asserts the deployed SHA).

## 2. Domains, DNS & TLS

The host→tenant mapping lives in `app/models/network.py::Network.resolve_from_host` (matches `host_aliases`, then subdomain-prefix vs `slug`, then falls back to the `kuja` default). Per-tenant DNS steps already exist in `docs/NEAR_DNS_SETUP.md` and `docs/PROXIMATE_DOMAIN_SETUP.md` — reuse and extend them.

**Target domains (confirm final with the client):**

| Tenant (slug) | Planned production host(s) | Code `host_aliases` today | Status |
|---|---|---|---|
| Kuja Marketplace (`kuja`) | _[e.g. app.kuja.org]_ | *(none — catch-all)* | ⚠ pick + add alias |
| NEAR (`near`) | `near.kuja.org`, `app.near.ngo` | already set | DNS doc exists |
| Proximate (`proximate`) | `proximate.kuja.org`, `proximate.adesoafrica.org` | already set | DNS doc exists, live once switched |
| Saxansaxo (`saxansaxo`) | `saxansaxo.kuja.org`, `sclr.kuja.org` | already set | DNS doc exists |

Per domain:
- [ ] Add the custom domain in Railway (`railway domain add <host>` on service `web`) and complete verification (TXT `_railway-verify.<sub>` + CNAME to the Railway target). **Watch the known gotcha** (doubled TXT prefix / stuck verification — see the DNS docs).
- [ ] Confirm **TLS**: Railway auto-provisions Let's Encrypt; verify the cert covers the exact host, auto-renews, and HSTS is honored (HSTS is set in prod by `app/middleware.py::add_security_headers`).
- [ ] Decide **apex vs subdomain** and set up `www`→apex (or apex→www) redirect; apex domains need ALIAS/ANAME or a redirect service (the repo already has a `near-redirect` service pattern).
- [ ] Add the new host to the network's `host_aliases` in the DB/seed (`app/__init__.py` seed block) so the tenant resolves.
- [ ] **CORS:** allowed origins are locked to the base Railway origin only (`app/__init__.py:63`). **Add every real tenant domain to the `CORS_ORIGINS` env var** (comma-separated) or logins/API calls from the branded domain will fail.
- [ ] **WebAuthn / passkeys:** the RP ID/origin default to the base Railway host (`app/services/webauthn_service.py:46`). Set **`WEBAUTHN_ORIGIN`** and **`WEBAUTHN_RP_ID`** to the launch domain, or passkeys won't validate. (For multi-domain, WebAuthn RP ID must be the registrable parent domain shared by the tenants.)
- [ ] Reserve role/support addresses on the domain: `support@`, `privacy@`, `security@`, `noreply@` (see §7 legal + §10 email).
- [ ] Update hard-coded base-URL defaults where a tenant needs them: `KUJA_PUBLIC_HOST`, `KUJA_PUBLIC_BASE_URL`, `PROXIMATE_PUBLIC_BASE_URL` (used for VC/report public links).

## 3. App icon, PWA manifest & installer

Kuja is an **installable PWA** (no native app store build today). Assets follow the `frontend/public/tenants/<slug>/` convention; the runtime swaps icon/manifest/theme per tenant in `frontend/src/components/network-provider.tsx`.

- [ ] **Per-tenant icon set** exists for all four tenants (`favicon.ico`, `favicon-32.png`, `icon-180.png` apple-touch, `icon-192.png`, `icon-512.png`, `manifest.webmanifest`). **Verify each is the final brand art**, not placeholder, at all sizes; add a **maskable** 512 (Android adaptive) and confirm `icon-180` is square with safe padding for iOS.
- [ ] Confirm each tenant's `manifest.webmanifest` has correct `name`, `short_name`, `theme_color` (brand hex), `background_color`, `display: standalone`, `start_url: /dashboard`, and `dir/lang` (Proximate = `rtl`/`ar`).
- [ ] **Install prompt** (`frontend/src/components/shared/pwa-install-banner.tsx`, captures `beforeinstallprompt`) — test the banner shows on Android/Chrome and the iOS "Add to Home Screen" hint path works (iOS gives no `beforeinstallprompt`).
- [ ] **Splash screens:** generate iOS launch images (or accept default) per tenant theme.
- [ ] **Service worker** (`frontend/public/sw.js`) — verify offline caching + cache-busting on new deploys (stale-SW is a classic launch bug); confirm the IndexedDB offline outbox syncs when back online.
- [ ] Confirm **theme-color meta**, address-bar color, and standalone status bar look right per tenant on real devices.
- [ ] **Decide** whether any tenant needs a true native wrapper (TWA for Play Store / Capacitor) — out of scope for v1 unless the client requires an app-store listing; note as a follow-up.

## 4. Infrastructure & configuration

**Runtime:** `Procfile`/`railway.json` → `gunicorn --workers 4 --threads (4–8) --timeout 180 --worker-class gthread --max-requests 1000 --preload server:app`, after `pre_deploy.py` + `flask db upgrade`. `ProductionConfig.init_app` **fails fast if `SECRET_KEY` is unset/default** (`app/config.py:48`).

- [ ] **Postgres:** confirm plan/sizing; connection pool is `pool_size=10, max_overflow=15, pool_recycle=300` (`app/config.py:57`). Enable **automated backups** + document **restore drill** (see §9). Set **PITR / retention** to meet the agreed RPO.
- [ ] **Redis:** provision and set `REDIS_URL` / `RATE_LIMIT_REDIS_URL`. **Required at multi-worker scale** because (a) WebAuthn re-auth tokens are stored **in-process** today (`webauthn_service.py`) and (b) rate-limit policies want a shared store. Without Redis, passkey re-auth and rate limits behave inconsistently across the 4 workers.
- [ ] **Secrets management:** set every required env var in Railway (see Appendix A). Rotate any secret that has ever been in a demo/pilot context. Never commit secrets.
- [ ] **`SEED_PROXIMATE_ON_BOOT=false`** before real users (confirmed already false on prod — keep it).
- [ ] **`CRON_SECRET`** must be set explicitly (else it auto-generates per-process and multi-worker crons break) — the 12 scheduled GitHub Actions authenticate with it.
- [ ] **File storage:** if using object storage, set `S3_*` (`S3_ENDPOINT/ACCESS_KEY/SECRET_KEY/BUCKET/REGION`); otherwise confirm `UPLOAD_FOLDER` is on a **persistent volume** (Railway ephemeral FS loses uploads on redeploy). Decide + document.
- [ ] **AI budget & keys:** set `ANTHROPIC_API_KEY`; confirm the per-tenant/user AI cost ceiling (`KUJA_AI_BUDGET_USD_30D`, default 250) and concurrency (`KUJA_USER_AI_CONCURRENT`) are right for launch volume. Confirm the production model ID is current (no stale `claude-*` strings).
- [ ] **Health/readiness:** wire uptime checks to `GET /api/health`, `GET /api/ready` (DB `SELECT 1`), `GET /api/version` (build SHA + `frontend_build`), `GET /api/admin/canary` (external deps).
- [ ] **Scaling & limits:** confirm worker count vs Railway CPU/memory (prior load test showed the app is render/CPU-bound at ~6 rps, not connection-bound); set autoscaling or a known ceiling; `MAX_CONTENT_LENGTH=16MB` + the WSGI oversized-upload guard are in place.
- [ ] **Time & locale:** confirm server TZ is UTC (timestamps are serialized UTC-aware after the recent `iso_utc` fix).
- [ ] **Refresh `OPERATIONS.md`** — it is stale (says v3.x, gevent, single worker, old model). Bring it to v5.0.0 / 4-worker gthread reality as the on-call runbook.

## 5. Security & data protection

Strong surface already (RBAC, DB-backed lockout, hash-chained audit, 2FA, WebAuthn, sanctions screening, CSP). Launch hardening:

- [ ] **Retire demo accounts:** run `retire_demo_accounts.py --confirm` on prod to deactivate + randomize every `pass123` account **before** branded go-live (they're re-enabled now for pilot QA). Verify `pass123` returns 401.
- [ ] **Enforce admin 2FA:** set `KUJA_ENFORCE_ADMIN_2FA=true` (today it's soft/nag). Ensure all admin/OB users have enrolled TOTP or a passkey first.
- [ ] **Password reset gap:** there is **no self-service password reset** (`OPERATIONS.md`) — only admin/DB reset + the forced `must_change_password` flow. Decide whether launch needs a self-service reset (email-token) flow, or document the admin-reset SOP for support.
- [ ] **Redis for WebAuthn** (see §4) so passkey re-auth is reliable.
- [ ] **CSP hardening:** current `script-src` allows `'unsafe-inline'` (flagged TODO in `middleware.py`). Move to nonce/hash-based CSP before launch if the client's security review requires it.
- [ ] **Secret rotation** on launch: `SECRET_KEY`, `ANTHROPIC_API_KEY`, Twilio, SendGrid, DB creds, `CRON_SECRET`, VC signing key. Document rotation cadence.
- [ ] **RBAC / tenant-isolation regression:** run the negative-authz + cross-tenant scoping tests (`test_trust_tenant_guard.py`, scope_* coverage) and confirm no persona can see another tenant's or another role's data.
- [ ] **Audit-chain integrity:** run `verify()` on the prod chain; confirm per-tenant `network_id` stamping; set `KUJA_AUDIT_RETENTION_DAYS` per policy.
- [ ] **Sanctions/DD:** set `OPENSANCTIONS_API_KEY` + `SAM_GOV_API_KEY`; confirm the rescreening scheduler runs on exactly one worker (`RESCREENING_SCHEDULER`).
- [ ] **Data classification & residency:** document where prod data physically lives (Railway region) vs where subjects are (Kenya, Somalia, Sudan, South Africa). This drives the POPIA/Kenya-DPA analysis in §7. Consider region pinning if required.
- [ ] **Encryption:** confirm TLS in transit everywhere and encryption-at-rest for Postgres + object storage.
- [ ] **Penetration test / security review** (see §9).
- [ ] **Backups are encrypted** and access-controlled; test restore.
- [ ] **Incident response & responsible disclosure:** publish `security@` + a coordinated-disclosure policy; document P0–P3 escalation (OPERATIONS.md has a draft).

## 6. Legal & policy documents  ⚠ **BIGGEST GAP — none exist today**

There are **no** privacy, terms, cookie, consent, or AI-disclosure pages in the app (a GDPR right-to-be-forgotten admin endpoint exists, but nothing user-facing). Because the platform handles NGO/beneficiary personal data, runs **AI-assisted scoring/decisions**, and (in Proximate) moves **funds**, these are launch blockers, not nice-to-haves. Draft with counsel; then build the pages + acceptance flow.

Documents to produce & publish (per tenant where branding/entity differs):
- [ ] **Privacy Policy** — data collected, purposes, legal basis, retention, sub-processors, subject rights, contact. Cover **GDPR** (EU donors/staff), **Kenya Data Protection Act 2019**, **South Africa POPIA** (Adeso is SA-registered), and any Somalia/Sudan considerations.
- [ ] **Terms of Service / Platform Use Agreement** — separate donor vs NGO vs reviewer terms where obligations differ.
- [ ] **AI & Automated Decision-Making Notice** — disclose that AI (Anthropic) assists scoring/guidance, that a human makes the final funding decision, the right to explanation/appeal (the app already has an appeal flow + provenance UI to point to), and data handling by the AI sub-processor.
- [ ] **Cookie / Local-storage notice + consent banner** — the app uses cookies (session) + localStorage (PWA, dismissals); provide a notice and, if targeting EU, a consent mechanism.
- [ ] **Data Processing Agreement (DPA)** template for donor/partner organizations (Kuja/Adeso as processor or controller as appropriate).
- [ ] **Sub-processor list** — Anthropic (AI), Twilio (SMS/WhatsApp), Meta (WhatsApp), SendGrid (email), Railway (hosting), OpenSanctions/SAM.gov (screening), any object storage. Publish + keep current.
- [ ] **Acceptable Use Policy** (esp. AI/content generation).
- [ ] **Data Retention & Deletion Policy** (ties to `KUJA_AUDIT_RETENTION_DAYS` and the RTBF endpoint).
- [ ] **Safeguarding / PSEA statement** — mandatory in humanitarian contexts (vulnerable beneficiaries, Sudan/Somalia).
- [ ] **AML / sanctions-screening statement** — for Proximate disbursements (hawala/mobile-money FSPs); document the KYC/DD and sanctions process.
- [ ] **Accessibility statement** (WCAG 2.1 AA target; see §9).
- [ ] **Responsible-disclosure / security policy** (from §5).
- [ ] **Consent-at-signup / terms-acceptance flow** in the app (record acceptance + version + timestamp in the audit chain).
- [ ] Confirm **entity, jurisdiction, and governing law** per tenant with the client/legal.

## 7. Localization & translation certification

Six languages ship: **English, Somali, Swahili, Spanish, French, Arabic** (Arabic = RTL). Strings live in `frontend/src/i18n/<lang>.json` (flat dotted keys); there are also **server-side generated strings** (`title_key`/params in notifications/audit — see `docs/i18n_review_targets.md`).

- [x] **Reviewer workbooks produced** — `docs/i18n-review/Kuja_i18n_review_<lang>.xlsx` (+ copies in `Downloads\Latest Kuja files\`), one per language, with instructions, the full string table (English source, current translation, placeholders to preserve, MISSING/SAME-as-English flags, editable correction columns), and a glossary tab. Generated by `docs/i18n-review/generate_review_workbooks.py`.
- [ ] **Assign a native speaker per language** and set a return date. Prioritise the rows flagged **MISSING** (19 per language — English-only keys) and **SAME AS ENGLISH** (fr 379, es 300, sw 281, so 279, ar 23 — likely untranslated).
- [ ] **Re-import** corrected strings back into the JSON (add a small importer that reads the workbook's "corrected" column and writes `<lang>.json`), rebuild the frontend, and run the i18n parity gate.
- [ ] **Server-side strings:** ensure the `title_key`/param strings and any `app/utils/i18n.py`-loaded backend strings are in the review set (they're not all in the frontend JSON).
- [ ] **RTL QA (Arabic):** verify layout mirroring, number/date direction, mixed LTR (names/URLs) rendering, and the Arabic PDF pipeline (`arabic-reshaper` + `python-bidi`).
- [ ] **Locale formatting:** dates, numbers, currency per locale; confirm no hard-coded English date/number formats.
- [ ] **Native-speaker sign-off** recorded per language (part of go/no-go).

## 8. Testing & certification

Existing automation to keep green: `smoke_test.py` (pre-deploy gate, ~14 tests), `regression.py` (+ `--browser` Playwright), `browser_test.py`, `mobile_test.py` (`docs/MOBILE_TESTING.md`), `test_pilot_hygiene.py` (cross-persona live probe), and the GitHub Actions (`smoke.yml`, `regression.yml`, `health-monitor.yml` every 5 min, `frontend-build-sync.yml`, 12 cron jobs).

**Certifications required before launch:**
- [ ] **Real-device mobile testing** — a physical matrix, not just emulator. Minimum: low-end Android (Chrome), mid Android, iPhone (Safari), small viewport **360×800**, plus a tablet. Test: install-as-PWA, offline/airplane-mode capture + sync, slow-3G/low-bandwidth (Global-South target), photo/voice capture, RTL on Arabic. (Note: the copilot-rail mobile-overflow fix shipped but its live 360×800 pixel-check is still pending.)
- [ ] **Accessibility (WCAG 2.1 AA)** — automated (axe) + manual screen-reader pass (VoiceOver/TalkBack), keyboard-only nav, focus states, colour contrast, RTL, and the skip-to-content link. Publish the accessibility statement (§6).
- [ ] **Native-speaker translation review** — the six workbooks (§7) signed off.
- [ ] **Security penetration test** — external test of authz/tenant isolation, session/CSRF, file upload, rate limits, WebAuthn, injection; remediate before launch.
- [ ] **Load / performance test** — validate expected concurrent users against the ~6 rps CPU-bound baseline; decide worker/instance count; test AI-endpoint latency + budget behavior under load.
- [ ] **Cross-browser** — Chrome, Safari, Firefox, Edge (desktop + mobile).
- [ ] **UAT sign-off** — per-tenant end-to-end business flows with the client (`docs/UAT_FIXTURES.md`, `scripts/certify_uat_remaining.py`).
- [ ] **Data migration / backup-restore drill** — restore a prod backup into staging and verify integrity + audit chain.
- [ ] **Email/SMS/WhatsApp deliverability test** end-to-end (see §10).
- [ ] **Deploy-verification test** — confirm `/api/version` reports the expected SHA + `frontend_build` post-deploy.

## 9. Messaging & email deliverability

- [ ] **Email (SendGrid):** Railway **blocks outbound SMTP**, so use the SendGrid **Web API** path (`app/services/email_service.py` prefers it). Set `SENDGRID_API_KEY`, `MAIL_FROM` (e.g. `noreply@adesoafrica.org`), `MAIL_FROM_NAME`. Today email is **log-only in prod** — this must be configured or no NGO/donor notifications go out.
- [ ] **Email authentication DNS:** add **SPF**, **DKIM** (SendGrid domain authentication), and **DMARC** records for the sending domain; verify sender domain; test inbox placement (not spam) to Gmail/Outlook.
- [ ] **WhatsApp/Twilio:** sender **+254705529285 is live**; **8 templates are pending Meta approval** (`endorsement_invite`, `endorsement_reminder`, `report_ack`, `report_reminder`, `disbursement_notify`, `outcome_reminder`, `partner_cleared`, `round_activated` — EN+AR). Get them **approved**, then wire the template SIDs into `messaging_service.py`. Confirm `TWILIO_*` + `WHATSAPP_*` env vars and webhook verification (`docs/WEBHOOK_VERIFICATION.md`, `WHATSAPP_VERIFY_TOKEN`).
- [ ] **SMS fallback** (`TWILIO_FROM_NUMBER`) tested.
- [ ] **Messaging consent/opt-in** — WhatsApp/SMS to beneficiaries needs documented opt-in; align with the privacy policy.
- [ ] **Web push** (VAPID) — if used at launch, set `VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT` and test.

## 10. Monitoring, alerting & observability

- [ ] **Uptime/health** — `health-monitor.yml` already probes `/api/health` + `/api/network/current` every 5 min (alerts via GitHub email). Add a **paging** channel (PagerDuty/Teams/email that's actually watched) and a **public status page**.
- [ ] **Error tracking** — set `SENTRY_DSN` (Sentry is wired) and confirm errors flow with release tagging.
- [ ] **Synthetic monitoring** — `synthetic_monitor.py` login probes are opt-in via `KUJA_SYN_*` creds; decide whether to run them against a dedicated monitor account (not `pass123`).
- [ ] **AI cost/quality** — watch the AI budget ceiling + telemetry dashboards; alert on cost spikes and AI failure-rate.
- [ ] **Audit-chain integrity monitor** — schedule periodic `verify()`.
- [ ] **Log retention & access** — define retention; ensure PII isn't over-logged; restrict log access.
- [ ] **DB & Redis metrics** — connection saturation, slow queries, memory.

## 11. Backups, disaster recovery & business continuity

- [ ] Define **RPO/RTO** with the client.
- [ ] **Automated Postgres backups** (a weekly-backup cron exists) + verified **restore drill** into staging.
- [ ] **Object-storage/upload backups** (if S3) or persistent-volume snapshot policy.
- [ ] **Runbook for full recovery** (recreate service, restore DB, restore uploads, re-point DNS).
- [ ] **Config/secret backup** (secure) so a service can be rebuilt.
- [ ] **Rollback plan** per deploy (redeploy previous build; `railway redeploy` is the documented recovery — see health-monitor doc).

## 12. Launch runbook (cut-over day)

**Pre-launch (T-1 week):**
- [ ] All §1–11 checkboxes closed or explicitly risk-accepted.
- [ ] Legal pages published; terms-acceptance flow live.
- [ ] Translations signed off + re-imported + deployed.
- [ ] Real accounts provisioned (`provision_users.py`); forced-password-change on first login verified.
- [ ] Demo `pass123` accounts retired; admin 2FA enforced.
- [ ] DNS/TLS/CORS/WebAuthn for the launch domain(s) verified; email + WhatsApp deliverability green.
- [ ] Backups + monitoring + on-call confirmed.

**Go / No-Go review:** sign-off from Eng, Product, Client, Legal, Security.

**Cut-over:**
- [ ] Deploy the release; confirm `/api/version` SHA + `frontend_build`.
- [ ] Flip DNS to the tenant domain (low TTL beforehand).
- [ ] Run the smoke gate + `test_pilot_hygiene.py` against the live domain.
- [ ] Manual cross-persona click-through per tenant (donor/NGO/reviewer/OB) + mobile install.
- [ ] Confirm a test email + WhatsApp actually arrive.

**Post-launch (T+0 to T+72h):**
- [ ] Watch Sentry, health-monitor, AI cost, DB metrics closely.
- [ ] Support channel staffed; known-issues list ready.
- [ ] Daily standup on launch health; hotfix path warm.

**Rollback:** `railway redeploy` to the previous good build; if DNS-related, revert DNS; communicate status.

## 13. Roles, ownership & timeline

- [ ] Fill a RACI for each section owner: Eng lead, DevOps, Product, Client/Programme, Legal/DPO, Security, Localization coordinator, Support lead.
- [ ] Put dates against Sections 2–12 working back from the target launch; the long-poles are usually **legal drafting**, **Meta template approval**, **native-speaker review turnaround**, and **pen-test remediation** — start those first.

---

## 14. Open risks / gaps register (start these now)

| # | Gap / risk | Impact | Section |
|---|---|---|---|
| 1 | **No legal/privacy/AI-disclosure pages** | Launch blocker (compliance) | §6 |
| 2 | **No staging environment** | Risky changes tested on prod | §1 |
| 3 | CORS locked to base Railway origin; WebAuthn origin/RP unset for tenant domains | Logins/passkeys break on branded domains | §2 |
| 4 | WebAuthn re-auth tokens + rate limits in-process → need **Redis** | Inconsistent auth/limits across workers | §4/§5 |
| 5 | **Email is log-only** (SMTP blocked); SendGrid + SPF/DKIM/DMARC not set | No notifications reach users | §9 |
| 6 | **8 WhatsApp templates pending Meta approval**; SIDs not wired | Proximate messaging can't send | §9 |
| 7 | **No self-service password reset** | Support burden / lockouts | §5 |
| 8 | Demo `pass123` accounts active | Security exposure at launch | §5 |
| 9 | Upload persistence on Railway ephemeral FS (unless S3/volume) | Data loss on redeploy | §4 |
| 10 | `OPERATIONS.md` stale (v3.x) | Wrong on-call info | §4 |
| 11 | CSP allows `'unsafe-inline'` scripts | Weaker XSS posture | §5 |
| 12 | Mobile 360×800 fix not yet pixel-verified on a device | UI regression risk | §8 |
| 13 | No app-store/native wrapper decision | Client expectation mismatch | §3 |
| 14 | Data residency vs POPIA/Kenya-DPA not analysed | Compliance | §5/§6 |

---

## Appendix A — Environment variable checklist (set in Railway)

**Required for any launch:** `DATABASE_URL`, `SECRET_KEY` (strong, non-default — app fails to boot otherwise), `CORS_ORIGINS` (all tenant domains), `CRON_SECRET`, `ANTHROPIC_API_KEY`, `SENDGRID_API_KEY` + `MAIL_FROM` + `MAIL_FROM_NAME`, `REDIS_URL`, `WEBAUTHN_ORIGIN` + `WEBAUTHN_RP_ID`, `SEED_PROXIMATE_ON_BOOT=false`.

**Security/limits:** `KUJA_ENFORCE_ADMIN_2FA=true`, `RATE_LIMIT_*`, `AUTH_ABUSE_SLO_*`, `GRANT_LICENSING_ENFORCED` (per commercial model).

**Screening:** `OPENSANCTIONS_API_KEY`, `SAM_GOV_API_KEY`, `RESCREENING_SCHEDULER`, `RESCREENING_INTERVAL_HOURS`.

**Messaging:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `TWILIO_WA_FROM`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`.

**AI tuning:** `ANTHROPIC_WEB_SEARCH`, `KUJA_AI_BUDGET_USD_30D`, `KUJA_USER_AI_CONCURRENT`, `WHISPER_API_KEY`/`WHISPER_MODEL`/`WHISPER_API_URL`.

**Storage/infra:** `S3_ENDPOINT`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`/`S3_BUCKET`/`S3_REGION` (or persistent `UPLOAD_FOLDER`), `TASK_RUNNER_WORKERS`, `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`, `SENTRY_DSN`, `KUJA_PUBLIC_HOST`/`KUJA_PUBLIC_BASE_URL`/`PROXIMATE_PUBLIC_BASE_URL`, `KUJA_VC_SIGNING_KEY_HEX`, `KUJA_AUDIT_RETENTION_DAYS`.

## Appendix B — Domain & DNS checklist (per tenant)

| Step | kuja | near | proximate | saxansaxo |
|---|---|---|---|---|
| Final host(s) confirmed | ☐ | ☐ | ☐ | ☐ |
| Railway domain added + verified (TXT+CNAME) | ☐ | ☐ | ☐ | ☐ |
| TLS cert issued + HSTS | ☐ | ☐ | ☐ | ☐ |
| `host_aliases` updated in DB/seed | ☐ | ☐ | ☐ | ☐ |
| Added to `CORS_ORIGINS` | ☐ | ☐ | ☐ | ☐ |
| WebAuthn origin/RP covers host | ☐ | ☐ | ☐ | ☐ |
| Email SPF/DKIM/DMARC on domain | ☐ | ☐ | ☐ | ☐ |
| `www`/apex redirect | ☐ | ☐ | ☐ | ☐ |

## Appendix C — Device / accessibility test matrix

| Device / target | Install PWA | Offline+sync | Slow-3G | Photo/voice | RTL (ar) | Screen reader |
|---|---|---|---|---|---|---|
| Low-end Android (Chrome) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ (TalkBack) |
| Mid Android (Chrome) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| iPhone (Safari) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ (VoiceOver) |
| 360×800 small viewport | ☐ | — | ☐ | — | ☐ | — |
| Tablet | ☐ | — | — | — | ☐ | — |

## Appendix D — Legal document checklist

Privacy Policy ☐ · Terms of Service (donor/NGO/reviewer) ☐ · AI & Automated-Decision Notice ☐ · Cookie/consent notice + banner ☐ · DPA template ☐ · Sub-processor list ☐ · Acceptable Use ☐ · Data Retention & Deletion ☐ · Safeguarding/PSEA ☐ · AML/sanctions statement ☐ · Accessibility statement ☐ · Responsible disclosure ☐ · In-app terms-acceptance flow ☐.

---

*References throughout point at the codebase (e.g. `app/config.py`, `app/middleware.py`, `frontend/public/tenants/`, `docs/NEAR_DNS_SETUP.md`, `docs/PROXIMATE_DOMAIN_SETUP.md`, `docs/OPS_WHATSAPP_TWILIO_SETUP.md`, `docs/MOBILE_TESTING.md`, `docs/i18n_review_targets.md`). Update this plan as items close.*
