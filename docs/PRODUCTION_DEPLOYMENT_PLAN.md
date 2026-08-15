# Kuja Marketplace — Production Deployment Plan

**Version:** 2.0 (Kuja tenant only) · **Date:** 2026-08-15 · **Status:** Draft for review
**Scope:** the **Kuja Marketplace** tenant only (default network `slug='kuja'`) — the open grant marketplace where donors publish grants, NGOs apply, and reviewers score. The other networks on this codebase (Proximate, NEAR, Saxansaxo) are **out of scope** for this launch.
**Platform:** Kuja Grant Management System v5.0.0 — Flask + Next.js on Railway
**Owner:** _[Programme / Eng lead]_ · **Target launch:** _[date — after pilot sign-off]_

> Master launch checklist. Work top-to-bottom; each `- [ ]` is an action with an
> owner. Sections 1–13 are the plan; §14 is the open-risk register; the
> Appendices are the fill-in checklists for cut-over day. File references
> (e.g. `app/config.py:48`) point at where each item lives.

---

## 0. What "go live" means for the Kuja Marketplace

The codebase is multi-tenant, but **this launch is the Kuja Marketplace only**. It is the *default* network (`slug='kuja'`) — it has no `host_aliases`, so it is the **catch-all** any hostname resolves to unless another tenant claims that host (`app/models/network.py::Network.resolve_from_host`). Brand hex `#C2410C`, default language English.

The Kuja Marketplace product = **grants → applications → reviews → decisions**, with Trust Profiles + sanctions/due-diligence screening, AI-assisted scoring/guidance, reporting, and appeals. It does **not** move money (no disbursements — that's Proximate) and does **not** use networked funds/windows or crisis declarations (NEAR/Proximate). So this plan omits disbursement AML, WhatsApp templates, and networked-funds concerns.

"Launch" = the Marketplace reachable on its **own branded domain**, real accounts, DNS/TLS/email configured, the legal + AI-disclosure pages published, the six languages reviewed by native speakers, real-device + accessibility + security certification done, monitoring live, and the demo (`pass123`) accounts retired.

Today the pilot runs on the raw Railway URL `web-production-6f8a.up.railway.app` with demo accounts.

---

## 1. Environments & release management

- [ ] **Stand up a staging environment** on Railway (separate service + Postgres mirroring prod). There is none today — every change is tested against pilot-on-prod, which is risky at launch.
- [ ] Confirm the flow: push to `main` → Railway auto-deploys → poll `GET /api/version` for the expected build SHA (~1–3 min).
- [ ] **Frontend build gotcha (critical):** Railway does **not** rebuild the Next.js frontend — the committed `static/nextjs/` export ships. Any frontend change must be rebuilt (`npm run build` in `frontend/`) and the regenerated `static/nextjs/` committed. Keep the CI gate `.github/workflows/frontend-build-sync.yml` green.
- [ ] Adopt a release/tag convention; keep `docs/PHASE_*_RELEASE_NOTES.md` current.
- [ ] Define a **deploy-freeze window** around launch (no non-hotfix deploys 48h pre/post).
- [ ] Add a **post-deploy verification** step that polls `/api/version` for the expected SHA + `frontend_build`, then runs the smoke gate (`smoke_test.py`).

## 2. Domain, DNS & TLS

Because Kuja is the **catch-all** default, a new hostname will resolve to it automatically — but set it up explicitly for clarity.

- [ ] **Choose the production hostname** (e.g. `app.kuja.org` or `grants.kuja.org`) — _[confirm with client]_.
- [ ] Add the domain in Railway (`railway domain add <host>` on service `web`) and complete verification (TXT + CNAME to the Railway target). Watch the known verification gotchas documented in `docs/PROXIMATE_DOMAIN_SETUP.md` (doubled TXT prefix / stuck verification).
- [ ] Optionally add the host to the `kuja` network's `host_aliases` (seed in `app/__init__.py`) so resolution is explicit rather than via catch-all.
- [ ] **TLS:** Railway auto-provisions Let's Encrypt — verify the cert covers the host, auto-renews, and HSTS is honored (`app/middleware.py::add_security_headers` sets HSTS in prod).
- [ ] **`www`/apex** decision + redirect (apex needs ALIAS/ANAME or a redirect service).
- [ ] **CORS:** allowed origins are locked to the base Railway origin (`app/__init__.py:63`). **Add the Kuja production domain to `CORS_ORIGINS`** (comma-separated) or logins/API from the branded domain fail.
- [ ] **WebAuthn / passkeys:** RP ID/origin default to the base Railway host (`app/services/webauthn_service.py:46`). Set **`WEBAUTHN_ORIGIN`** and **`WEBAUTHN_RP_ID`** to the launch domain or passkeys won't validate.
- [ ] Reserve `support@`, `privacy@`, `security@`, `noreply@` on the domain (see §6, §9).
- [ ] Set public-link base URLs if used: `KUJA_PUBLIC_HOST`, `KUJA_PUBLIC_BASE_URL` (VC / share links).

## 3. App icon, PWA manifest & installer

Kuja is an **installable PWA** (no native app-store build). Kuja's asset set is `frontend/public/tenants/kuja/`; the runtime applies it in `frontend/src/components/network-provider.tsx`.

- [ ] Confirm the **Kuja icon set** is final brand art (not placeholder): `favicon.ico`, `favicon-32.png`, `icon-180.png` (apple-touch), `icon-192.png`, `icon-512.png`, `manifest.webmanifest`. Add a **maskable** 512 for Android adaptive icons.
- [ ] Confirm the Kuja `manifest.webmanifest`: `name`/`short_name`, `theme_color` `#C2410C`, `background_color`, `display: standalone`, `start_url: /dashboard`, `lang: en`.
- [ ] **Install prompt** (`frontend/src/components/shared/pwa-install-banner.tsx`) shows on Android/Chrome; test the iOS "Add to Home Screen" path (iOS has no `beforeinstallprompt`).
- [ ] **Service worker** (`frontend/public/sw.js`) — verify offline caching, cache-busting on new deploys, and that the IndexedDB offline outbox syncs on reconnect.
- [ ] iOS splash screen + standalone status-bar look correct in Kuja's theme.
- [ ] **Decide** whether Kuja needs a native app-store wrapper (TWA/Capacitor) — out of scope for v1 unless the client wants a store listing; note as follow-up.

## 4. Infrastructure & configuration

**Runtime:** `Procfile`/`railway.json` → `gunicorn --workers 4 --threads (4–8) --timeout 180 --worker-class gthread --max-requests 1000 --preload server:app`, after `pre_deploy.py` + `flask db upgrade`. `ProductionConfig.init_app` **fails fast if `SECRET_KEY` is unset/default** (`app/config.py:48`).

- [ ] **Postgres:** confirm plan/sizing; pool is `pool_size=10, max_overflow=15, pool_recycle=300` (`app/config.py:57`). Enable **automated backups** + document a **restore drill** (§11); set PITR/retention to the agreed RPO.
- [ ] **Redis:** provision + set `REDIS_URL` / `RATE_LIMIT_REDIS_URL`. **Needed at 4 workers** because WebAuthn re-auth tokens are stored **in-process** today and rate-limit policies want a shared store; without it, passkey re-auth + limits are inconsistent across workers.
- [ ] **Secrets:** set every required env var (Appendix A). Rotate anything used during the pilot. Never commit secrets.
- [ ] **`CRON_SECRET`** must be set explicitly (else it auto-generates per-process and multi-worker crons break).
- [ ] **`SEED_PROXIMATE_ON_BOOT=false`** — keep it false (already is); no demo data on boot.
- [ ] **File storage:** set `S3_*` for object storage, or ensure `UPLOAD_FOLDER` is a **persistent volume** — Railway's ephemeral FS loses uploads on redeploy. Decide + document.
- [ ] **AI keys/budget:** set `ANTHROPIC_API_KEY`; confirm the AI cost ceiling (`KUJA_AI_BUDGET_USD_30D`, default 250) + concurrency (`KUJA_USER_AI_CONCURRENT`); confirm the production model ID is current.
- [ ] **Health/readiness monitors** point at `GET /api/health`, `GET /api/ready` (DB `SELECT 1`), `GET /api/version` (SHA + `frontend_build`), `GET /api/admin/canary`.
- [ ] **Scaling:** confirm worker count vs Railway CPU/mem (prior load test: render/CPU-bound at ~6 rps, not connection-bound); set a known ceiling. `MAX_CONTENT_LENGTH=16MB` + the oversized-upload WSGI guard are in place.
- [ ] Confirm server TZ = UTC (timestamps are serialized UTC-aware after the recent `iso_utc` fix).
- [ ] **Refresh `OPERATIONS.md`** — it's stale (v3.x, gevent, single worker); bring it to v5.0.0 / 4-worker gthread as the on-call runbook.

## 5. Security & data protection

- [ ] **Retire demo accounts:** run `retire_demo_accounts.py --confirm` on prod to deactivate + randomize every `pass123` account **before** go-live (re-enabled now for pilot QA). Verify `pass123` returns 401.
- [ ] **Enforce admin 2FA:** set `KUJA_ENFORCE_ADMIN_2FA=true` (soft/nag today) after admins have enrolled TOTP or a passkey.
- [ ] **Password reset gap:** there is **no self-service reset** — only admin/DB reset + the forced `must_change_password` flow. Decide whether launch needs a self-service (email-token) reset, or document the admin-reset SOP for support.
- [ ] **Redis for WebAuthn** (see §4) so passkey re-auth is reliable at 4 workers.
- [ ] **CSP hardening:** current `script-src` allows `'unsafe-inline'` (TODO in `middleware.py`) — move to nonce/hash if the security review requires it.
- [ ] **Secret rotation** at launch: `SECRET_KEY`, `ANTHROPIC_API_KEY`, `SENDGRID_API_KEY`, DB creds, `CRON_SECRET`, VC signing key.
- [ ] **RBAC / role isolation regression:** verify no persona (ngo/donor/reviewer/admin) sees another role's data (negative-authz tests).
- [ ] **Audit-chain integrity:** run `verify()` on the prod chain; set `KUJA_AUDIT_RETENTION_DAYS` per policy.
- [ ] **Sanctions / due diligence:** set `OPENSANCTIONS_API_KEY` + `SAM_GOV_API_KEY`; confirm the rescreening scheduler runs on exactly one worker (`RESCREENING_SCHEDULER`). (This is a Kuja Trust-Profile feature, kept in scope.)
- [ ] **Data classification & residency:** document where prod data physically lives (Railway region) vs where NGOs/donors are; drives the POPIA/Kenya-DPA analysis in §6. Consider region pinning if required.
- [ ] **Encryption** in transit (TLS) + at rest (Postgres, object storage).
- [ ] **Penetration test / external security review** (§8), remediate before launch.
- [ ] **Incident response & responsible disclosure:** publish `security@` + a coordinated-disclosure policy; document P0–P3 escalation.

## 6. Legal & policy documents  ⚠ **BIGGEST GAP — none exist today**

There are **no** privacy, terms, cookie, consent, or AI-disclosure pages in the app (a GDPR right-to-be-forgotten admin endpoint exists at `app/routes/admin_health.py:583`, but nothing user-facing). Because the Marketplace handles NGO/organisation personal data and runs **AI-assisted scoring/decisions**, these are launch blockers. Draft with counsel, then build the pages + acceptance flow.

- [ ] **Privacy Policy** — data collected, purposes, legal basis, retention, sub-processors, subject rights, contact. Cover **GDPR** (EU donors/staff), **Kenya Data Protection Act 2019**, **South Africa POPIA** (Adeso is SA-registered).
- [ ] **Terms of Service / Platform Use Agreement** — with donor vs NGO vs reviewer terms where obligations differ.
- [ ] **AI & Automated Decision-Making Notice** — disclose that AI (Anthropic) assists scoring/guidance, that a **human makes the final funding decision**, and the right to explanation/appeal (the app already has an appeal flow + provenance UI to point to), plus AI-sub-processor data handling.
- [ ] **Cookie / local-storage notice + consent banner** — session cookie + localStorage (PWA/dismissals); add consent if targeting EU.
- [ ] **Data Processing Agreement (DPA)** template for donor/partner organisations.
- [ ] **Sub-processor list** — Anthropic (AI), SendGrid (email), Railway (hosting), OpenSanctions + SAM.gov (screening), object storage if used. Publish + keep current. _(No WhatsApp/Twilio for the Marketplace — that's Proximate.)_
- [ ] **Acceptable Use Policy** (esp. AI/content generation).
- [ ] **Data Retention & Deletion Policy** (ties to `KUJA_AUDIT_RETENTION_DAYS` + the RTBF endpoint).
- [ ] **Accessibility statement** (WCAG 2.1 AA target; §8).
- [ ] **Responsible-disclosure / security policy** (from §5).
- [ ] **Safeguarding statement** — lighter than the humanitarian-tenant version, but the Marketplace still works with NGOs; confirm scope with the client.
- [ ] **In-app terms-acceptance / consent flow** — record acceptance + version + timestamp (in the audit chain).
- [ ] Confirm **operating entity, jurisdiction, governing law** with the client/legal.

## 7. Localization & translation certification

Six languages ship: **English, Somali, Swahili, Spanish, French, Arabic** (Arabic = RTL). Strings live in `frontend/src/i18n/<lang>.json` (flat dotted keys). There are also **server-side generated strings** (`title_key`/params in notifications/audit — see `docs/i18n_review_targets.md`).

- [x] **Kuja-scoped reviewer workbooks produced** — `docs/i18n-review/Kuja_i18n_review_<lang>.xlsx` (+ copies in `Downloads\Latest Kuja files\`), one per language, **filtered to the ~2,873 Kuja Marketplace strings** (the Proximate/NEAR-only vocabulary is excluded). Each has instructions, the string table (English source, current translation, placeholders, MISSING / SAME-as-English flags, editable correction columns) and a glossary. Generated by `docs/i18n-review/generate_review_workbooks.py`.
- [ ] **Assign a native speaker per language** + set a return date. Prioritise **MISSING** (19/language) and **SAME AS ENGLISH** (fr 156, es 89, sw 78, so 75, ar 22 — likely untranslated).
- [ ] **Re-import** corrected strings into the JSON (add a small importer reading the workbook's "corrected" column → `<lang>.json`), rebuild the frontend, run the i18n parity gate.
- [ ] **Server-side strings** in the review set (not all live in the frontend JSON).
- [ ] **RTL QA (Arabic):** layout mirroring, mixed LTR (names/URLs), number/date direction, Arabic PDF pipeline (`arabic-reshaper` + `python-bidi`).
- [ ] **Locale formatting:** dates, numbers, currency per locale.
- [ ] **Native-speaker sign-off** recorded per language (go/no-go input).

## 8. Testing & certification

Automation to keep green: `smoke_test.py` (pre-deploy gate), `regression.py` (+ `--browser` Playwright), `browser_test.py`, `mobile_test.py` (`docs/MOBILE_TESTING.md`), `test_pilot_hygiene.py` (cross-persona live probe), and the GitHub Actions (`smoke.yml`, `regression.yml`, `health-monitor.yml` every 5 min, `frontend-build-sync.yml`).

- [ ] **Real-device mobile testing** — physical matrix (Appendix C): low-end Android (Chrome), iPhone (Safari), **360×800** viewport, tablet. Test: install-as-PWA, offline/airplane + sync, slow-3G/low-bandwidth, photo/voice capture, RTL (Arabic). (The copilot-rail 360×800 overflow fix shipped but its live pixel-check is still pending.)
- [ ] **Accessibility (WCAG 2.1 AA)** — automated (axe) + manual screen-reader (VoiceOver/TalkBack), keyboard-only, focus states, contrast, RTL, skip-to-content. Publish the accessibility statement (§6).
- [ ] **Native-speaker translation review** — the six Kuja workbooks (§7) signed off.
- [ ] **Security penetration test** — authz/role isolation, session/CSRF, file upload, rate limits, WebAuthn, injection; remediate before launch.
- [ ] **Load / performance test** — expected concurrent users vs the ~6 rps CPU-bound baseline; set worker/instance count; AI-endpoint latency + budget under load.
- [ ] **Cross-browser** — Chrome, Safari, Firefox, Edge (desktop + mobile).
- [ ] **UAT sign-off** — Marketplace end-to-end business flows with the client (`docs/UAT_FIXTURES.md`).
- [ ] **Data migration / backup-restore drill** — restore a prod backup into staging + verify integrity + audit chain.
- [ ] **Email deliverability test** end-to-end (§9).
- [ ] **Deploy-verification test** — `/api/version` reports the expected SHA + `frontend_build` post-deploy.

## 9. Email & in-app notifications

The Marketplace notifies via **email + in-app** (and optional web push). No WhatsApp/SMS is needed for this tenant.

- [ ] **Email (SendGrid Web API):** Railway **blocks outbound SMTP**, so use SendGrid's Web API (`app/services/email_service.py` prefers it). Set `SENDGRID_API_KEY`, `MAIL_FROM` (e.g. `noreply@kuja.org`), `MAIL_FROM_NAME`. **Email is log-only in prod today** — configure it or no donor/NGO/reviewer notifications go out.
- [ ] **Email authentication DNS:** add **SPF**, **DKIM** (SendGrid domain authentication) and **DMARC** for the sending domain; verify sender domain; test inbox placement (Gmail/Outlook, not spam).
- [ ] **In-app notifications** + digests verified across personas.
- [ ] **Web push** (VAPID) — if enabled at launch, set `VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT` and test.
- [ ] _Optional:_ transactional **SMS** via `TWILIO_*` only if the Marketplace decides to use it — not required.

## 10. Monitoring, alerting & observability

- [ ] **Uptime/health** — `health-monitor.yml` probes `/api/health` + `/api/network/current` every 5 min (alerts via GitHub email). Add a **paging** channel that's actually watched + a **public status page**.
- [ ] **Error tracking** — set `SENTRY_DSN` with release tagging.
- [ ] **Synthetic monitoring** — `synthetic_monitor.py` login probes are opt-in via `KUJA_SYN_*`; use a dedicated monitor account, not `pass123`.
- [ ] **AI cost/quality** — watch the AI budget ceiling + telemetry; alert on cost spikes + AI failure-rate.
- [ ] **Audit-chain integrity monitor** — schedule periodic `verify()`.
- [ ] **Log retention & access** — define retention; avoid over-logging PII; restrict access.
- [ ] **DB & Redis metrics** — connection saturation, slow queries, memory.

## 11. Backups, disaster recovery & continuity

- [ ] Define **RPO/RTO** with the client.
- [ ] **Automated Postgres backups** + verified **restore drill** into staging.
- [ ] **Upload backups** (object storage) or persistent-volume snapshot policy.
- [ ] **Full-recovery runbook** (recreate service, restore DB + uploads, re-point DNS).
- [ ] **Config/secret backup** (secure) to rebuild the service.
- [ ] **Rollback plan** — `railway redeploy` to the previous good build (the documented recovery).

## 12. Launch runbook (cut-over day)

**Pre-launch (T-1 week):**
- [ ] §1–11 closed or explicitly risk-accepted.
- [ ] Legal + AI-disclosure pages published; terms-acceptance flow live.
- [ ] Translations signed off + re-imported + deployed.
- [ ] Real accounts provisioned (`provision_users.py`); forced-password-change verified.
- [ ] Demo `pass123` accounts retired; admin 2FA enforced.
- [ ] Domain/TLS/CORS/WebAuthn for the Kuja domain verified; email deliverability green.
- [ ] Backups + monitoring + on-call confirmed.

**Go / No-Go:** Eng, Product, Client, Legal, Security sign-off.

**Cut-over:**
- [ ] Deploy the release; confirm `/api/version` SHA + `frontend_build`.
- [ ] Flip DNS to the Kuja domain (low TTL beforehand).
- [ ] Run the smoke gate + `test_pilot_hygiene.py` against the live domain.
- [ ] Manual cross-persona click-through (donor / NGO / reviewer / admin) + mobile install.
- [ ] Confirm a test email actually arrives.

**Post-launch (T+0 to T+72h):**
- [ ] Watch Sentry, health-monitor, AI cost, DB metrics.
- [ ] Support channel staffed; known-issues list ready; hotfix path warm.
- [ ] Daily standup on launch health.

**Rollback:** `railway redeploy` to the previous good build; revert DNS if DNS-related; communicate via status page.

## 13. Roles, ownership & timeline

- [ ] Fill a RACI per section: Eng lead, DevOps, Product, Client/Programme, Legal/DPO, Security, Localization coordinator, Support lead.
- [ ] Put dates against §2–12 working back from launch. Long-poles: **legal drafting**, **native-speaker review**, **pen-test remediation** — start first.

---

## 14. Open risks / gaps register (start now)

| # | Gap / risk | Impact | Section |
|---|---|---|---|
| 1 | **No legal/privacy/AI-disclosure pages** | Launch blocker (compliance) | §6 |
| 2 | **No staging environment** | Risky changes tested on prod | §1 |
| 3 | CORS locked to base Railway origin; WebAuthn origin/RP unset for the Kuja domain | Login/passkey break on the branded domain | §2 |
| 4 | WebAuthn re-auth tokens + rate limits in-process → need **Redis** | Inconsistent auth/limits across 4 workers | §4/§5 |
| 5 | **Email is log-only** (SMTP blocked); SendGrid + SPF/DKIM/DMARC not set | No notifications reach users | §9 |
| 6 | **No self-service password reset** | Support burden / lockouts | §5 |
| 7 | Demo `pass123` accounts active | Security exposure at launch | §5 |
| 8 | Upload persistence on Railway ephemeral FS (unless S3/volume) | Data loss on redeploy | §4 |
| 9 | `OPERATIONS.md` stale (v3.x) | Wrong on-call info | §4 |
| 10 | CSP allows `'unsafe-inline'` scripts | Weaker XSS posture | §5 |
| 11 | Mobile 360×800 fix not yet pixel-verified on a device | UI regression risk | §8 |
| 12 | No app-store/native wrapper decision | Client expectation mismatch | §3 |
| 13 | Data residency vs POPIA/Kenya-DPA not analysed | Compliance | §5/§6 |

---

## Appendix A — Environment variable checklist (Railway)

**Required for launch:** `DATABASE_URL`, `SECRET_KEY` (strong, non-default — app won't boot otherwise), `CORS_ORIGINS` (the Kuja domain), `CRON_SECRET`, `ANTHROPIC_API_KEY`, `SENDGRID_API_KEY` + `MAIL_FROM` + `MAIL_FROM_NAME`, `REDIS_URL`, `WEBAUTHN_ORIGIN` + `WEBAUTHN_RP_ID`, `SEED_PROXIMATE_ON_BOOT=false`.

**Security/limits:** `KUJA_ENFORCE_ADMIN_2FA=true`, `RATE_LIMIT_*`, `AUTH_ABUSE_SLO_*`, `GRANT_LICENSING_ENFORCED` (per commercial model).

**Screening (Trust Profile):** `OPENSANCTIONS_API_KEY`, `SAM_GOV_API_KEY`, `RESCREENING_SCHEDULER`, `RESCREENING_INTERVAL_HOURS`.

**AI:** `ANTHROPIC_WEB_SEARCH`, `KUJA_AI_BUDGET_USD_30D`, `KUJA_USER_AI_CONCURRENT`, `WHISPER_API_KEY`/`WHISPER_MODEL`/`WHISPER_API_URL` (if voice used).

**Storage/infra:** `S3_ENDPOINT`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`/`S3_BUCKET`/`S3_REGION` (or persistent `UPLOAD_FOLDER`), `TASK_RUNNER_WORKERS`, `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` (if web push), `SENTRY_DSN`, `KUJA_PUBLIC_HOST`/`KUJA_PUBLIC_BASE_URL`, `KUJA_VC_SIGNING_KEY_HEX`, `KUJA_AUDIT_RETENTION_DAYS`.

_Not needed for the Marketplace: the Twilio/WhatsApp (`TWILIO_*`, `WHATSAPP_*`) and Proximate-specific variables — those belong to other tenants._

## Appendix B — Domain & DNS checklist (Kuja Marketplace)

| Step | Status |
|---|---|
| Production hostname chosen (e.g. app.kuja.org) | ☐ |
| Railway domain added + verified (TXT+CNAME) | ☐ |
| TLS cert issued + HSTS | ☐ |
| Added to `CORS_ORIGINS` | ☐ |
| `WEBAUTHN_ORIGIN` / `WEBAUTHN_RP_ID` set to the domain | ☐ |
| (Optional) host added to `kuja` `host_aliases` | ☐ |
| Email SPF / DKIM / DMARC on the domain | ☐ |
| `www` / apex redirect | ☐ |

## Appendix C — Device / accessibility test matrix

| Device / target | Install PWA | Offline+sync | Slow-3G | Photo/voice | RTL (ar) | Screen reader |
|---|---|---|---|---|---|---|
| Low-end Android (Chrome) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ (TalkBack) |
| Mid Android (Chrome) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| iPhone (Safari) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ (VoiceOver) |
| 360×800 small viewport | ☐ | — | ☐ | — | ☐ | — |
| Tablet | ☐ | — | — | — | ☐ | — |

## Appendix D — Legal document checklist

Privacy Policy ☐ · Terms of Service (donor/NGO/reviewer) ☐ · AI & Automated-Decision Notice ☐ · Cookie/consent notice + banner ☐ · DPA template ☐ · Sub-processor list ☐ · Acceptable Use ☐ · Data Retention & Deletion ☐ · Accessibility statement ☐ · Responsible disclosure ☐ · Safeguarding statement ☐ · In-app terms-acceptance flow ☐.

---

*References point at the codebase (e.g. `app/config.py`, `app/middleware.py`, `frontend/public/tenants/kuja/`, `docs/MOBILE_TESTING.md`, `docs/i18n_review_targets.md`, `docs/PROXIMATE_DOMAIN_SETUP.md` for the DNS gotchas). Update this plan as items close.*
