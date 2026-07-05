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

History note: before 2026-06-30 this file was the Kuja backlog and the
NEAR file accumulated everything (including Proximate). Reorganised so
each file owns exactly one scope.

Updated 2026-07-05.

---

## Platform — open items (all tenants)

### Regression gate is not trustworthy locally
- **last_touched:** 2026-07-01
- Local `smoke_test.py` reports ~137/167 PASS on Windows dev; failures
  are SQLite readonly/schema quirks, not real regressions — but that
  means the gate can't distinguish real breakage from noise.
- [ ] Move local smoke to a dedicated pytest fixture DB (tmpdir SQLite
      or dockerised Postgres), or gate merges on the CI suite only and
      demote local smoke to advisory.

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

### Shared-service items tracked in tenant files (pointers)
- WhatsApp Cloud API (Phase 717 a–d) — filed under Proximate because it
  ships there first, but the send helper + templates + inbox are
  platform primitives NEAR/Kuja can reuse.
- Twilio SMS fallback (Phase 718) — same.
- Cloudflare R2 evidence storage (Phase 719) — same.
