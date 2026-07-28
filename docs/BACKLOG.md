# Kuja Grant Management — Backlog Index

> **Start here.** One platform, one deploy, three tenants. Each tenant
> has its own backlog file so stakeholders can read their slice;
> platform-wide items (shared services, infra, ops) live in this file.
>
> **Filing rule:** every commit that defers, picks up, or completes an
> item updates the matching backlog file in the same commit. If an item
> serves more than one tenant, it belongs HERE, not duplicated per file.

| Scope | File | What lives there |
|---|---|---|
| Platform (all tenants) | this file, below | Shared services, AI infra, ops, CI, security |
| Kuja Marketplace | [KUJA_BACKLOG.md](KUJA_BACKLOG.md) | NGO↔donor marketplace tenant (payments, metrics-gated items) |
| NEAR | [NEAR_BACKLOG.md](NEAR_BACKLOG.md) | Network fund tenant (declarations, windows, memberships) |
| Proximate Fund | [PROXIMATE_BACKLOG.md](PROXIMATE_BACKLOG.md) | Sudan community-fund tenant (endorsements, rounds, inbound grants) |
| Saxansaxo | [SAXANSAXO_BACKLOG.md](SAXANSAXO_BACKLOG.md) | Somalia SCLR micro-grants tenant (8-step cycle, no spend policing) |

History note: before 2026-06-30 this file was the Kuja backlog and the
NEAR file accumulated everything (including Proximate). Reorganised so
each file owns exactly one scope.

Updated 2026-07-05.

---

## Platform — open items (all tenants)

### Regression gate is not trustworthy locally
- **last_touched:** 2026-07-05
- Local `smoke_test.py` reports ~137/167 PASS on Windows dev; failures
  are SQLite readonly/schema quirks, not real regressions — but that
  means the gate can't distinguish real breakage from noise.
- **2026-07-05 concrete miss:** smoke reported 167/167 PASS while FIVE
  Proximate POST endpoints were dead on prod (`NameError:
  get_request_json` — missing import). The suite has no write-path
  coverage for Proximate grant/participant/invite endpoints; seeds
  insert rows directly so the gap was invisible until live API testing.
- [x] **RESOLVED 2026-07-07 — `regression.py`.** New deterministic gate:
      seeds a FRESH isolated SQLite DB in a tmp dir (`KUJA_DB_PATH` hook on
      dev config; forces UTF-8 stdio so seed unicode no longer crashes on a
      Windows cp1252 console — that was the bulk of the "readonly/schema
      quirks" noise). Local == CI. Run: `python regression.py`.
- [x] **RESOLVED 2026-07-07.** `regression.py` POSTs through the write paths
      of every Proximate route module (grants/allocations, rounds/sign,
      partners/suspend, disbursements/cosign, interventions, fsps,
      endorser-invites, crisis, grievances) + Kuja (grant→apply→submit→
      review→report) + NEAR (declarations/funds). Any handler that raises
      (NameError / missing import / 5xx) fails the gate — proven by injecting
      the exact `get_request_json` NameError and watching it go red. CI:
      `.github/workflows/regression.yml` (fast API job + full API+Playwright
      browser job). Live browser leg reuses `browser_test.py --base`.
      Old `smoke_test.py` stays as an advisory quick-check.

### "What is this / what needs action / what happens next" copy pass
- **last_touched:** 2026-07-01 (UAT feedback: applies platform-wide,
  start with Proximate's 6 primary OB surfaces)
- Every screen should answer those three questions at a glance. Add a
  one-line purpose header + a "needs your attention" block + a clear
  primary action to each main surface.

### Ops verifications (quick, non-code)
- [x] `SENTRY_DSN` set on Railway — verified via `railway variables`
      2026-07-05.
- [x] `WHISPER_API_KEY` set on Railway service `web` (2026-07-05) —
      verified live: `/api/whisper/status` on prod returns `status: ok`
      with primary languages ar/so/sw. Voice transcription is active.
      Key is Audio-restricted with a $25/mo budget cap on the OpenAI
      account.
- [ ] BetterStack (or similar) uptime checks on `/health` +
      one per-tenant API probe
- [ ] Railway daily Postgres backups enabled, 30-day retention
      (Phase 720 in the Proximate file covers the R2 pg_dump cron)

### i18n Tier-2: admin/secondary surfaces — DONE (2026-07-27, `ae7db8ec2`)
- **last_touched:** 2026-07-15 (QA "incomplete translation" finding)
- Ground truth after the 2026-07-15 audit: all six public/token-holder
  journeys (Proximate endorse/verify/report/outcome tokens, donor
  journey, OB journey) and the primary app surfaces ARE translated
  (2,788 keys × en/ar/fr/es/sw/so, parity-tested). Tier 1 of the QA fix
  added `proximate.partners.*` + donor follow keys and wired the
  Proximate partners list.
  **Update 2026-07-27 (`2494a5f25`):** the 7 user-facing files are DONE —
  wired `t()` + 237 new keys × en/ar/fr/es/sw/so at full parity (3425 →
  3662 each): donors/[id], ngo/[id], network/directory, network/join,
  settings/notifications, calendar, and proximate/admin/grants/[grantId].
  **Update 2026-07-27 (`ae7db8ec2`) — COMPLETE.** All 17 internal
  admin/ops consoles are now wired: metrics, ai-cost, ai-quality,
  ai-telemetry, audit-chain (access-restricted card), crisis-monitoring
  (list + detail), network-memberships (list + detail), declarations
  detail, window report, tenant-health, webhooks, cost-ceiling,
  reviews-bulk, reviewers-workload, cron-health. 702 new keys ×
  en/ar/fr/es/sw/so at full parity (3662 -> 4364 each). The i18n Tier-2
  backlog item is CLOSED — every app surface with `t()`-wireable strings
  is now translated across all six locales.
- Also untranslated by design so far: the OB sidebar labels and dynamic
  import-result notes ("Imported N new partners…") on the partners page.

### Shared-service items tracked in tenant files (pointers)
- WhatsApp Cloud API (Phase 717 a–d) — filed under Proximate because it
  ships there first, but the send helper + templates + inbox are
  platform primitives NEAR/Kuja can reuse.
- Twilio SMS fallback (Phase 718) — same.
- Cloudflare R2 evidence storage (Phase 719) — same.

## Read-only observer accounts (shipped 2026-07-18, `a9a1a8684`)
- `users.read_only` flag + middleware guard: authenticated read-only
  users can browse everything their role/memberships allow; every
  mutating verb (POST/PUT/PATCH/DELETE) returns 403 with a clear
  message; login/logout stay reachable. Flag is NOT settable through
  any app path — DB-assigned only. Gate check + seeded fixture
  (readonly.gate@kuja.org, local regression DB only) — 96 checks.
- Prod account: iloyan@gmail.com (role admin + Proximate OB org) for
  full read coverage across Kuja/NEAR/Proximate. Password managed at
  DB level like all accounts. Known boundary: donor/NGO/partner
  persona-specific portals need their own records; underlying data is
  visible via admin/OB registers. UI still shows action buttons — they
  403 server-side (acceptable; a UI read-only banner is possible v2).
