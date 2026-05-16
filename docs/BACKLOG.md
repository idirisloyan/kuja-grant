# Kuja Grant — Backlog

Living list of deferred work. Every commit that defers, picks up, or
completes a backlog item should update this file in the same commit.

Updated 2026-05-16.

After Phase 26 (report detail page + scoped chat, reviewer auto-assign
cron sweep, WebAuthn biometric re-auth, Phase 24-26 browser UAT specs),
the WebAuthn biometric re-auth backlog item also closed. **Payment
integration is now the only deferred item — everything else has shipped.**

---

## Deferred — high priority

### Payment integration (Stripe + Flutterwave)
**Why deferred:** 2-3 day lift requiring real API keys, sandbox testing,
PCI scope review, and a refund-flow design pass. The current platform
captures every other artefact of the funding lifecycle (application →
review → award → debrief → report bundle → audit anchor); the only gap
is the actual money movement.

**Scope sketch:**
- Donor connects a Stripe Connect account OR a Flutterwave merchant
  (geo-aware: Stripe for global, Flutterwave for African-issued cards)
- On `application.status='awarded'`, render a "Disburse" CTA on the
  application detail (donor side)
- Funds flow into an escrow-style holding intent until NGO acknowledges
  receipt (prevents accidental sends; mirrors the existing
  audit-chain hash anchor pattern)
- Failed transfers surface as a Risk row + Today Briefing item
- Reports of disbursement → automatic milestone tracking
- NEVER store card data in our DB — Stripe/Flutterwave handles PCI

**What lands first when picked up:**
1. `PaymentIntentService` skeleton + audit-chain `payment.intent.created`
2. Stripe Connect onboarding flow on donor org settings
3. "Disburse $X" button on awarded application (admin-gated initially)
4. Webhook receiver for `transfer.created` / `transfer.failed`

**Owner:** unassigned · **Blocking team:** finance ops sign-off
(refund window, hold period, jurisdiction restrictions)

---

## Deferred — medium priority

(none — WebAuthn re-auth shipped in Phase 26C with `WebAuthnService` +
`/api/auth/webauthn/*` routes + `/settings/security` page +
`<WebAuthnPanel>` + `require_reauth()` gate helper.)

---

## Explicitly declined

(none yet)

---

## Completed (rolling log)

- **2026-05-16** — Phase 26 (this commit): `/reports/[id]` detail page
  with scoped `<AIChatPanel>`; nightly reviewer auto-assign sweep cron
  (`/api/cron/reviewer-auto-assign-sweep` + GH Actions schedule at
  02:45 UTC); WebAuthn biometric re-auth (`WebAuthnCredential` model +
  `WebAuthnService` + 6 `/api/auth/webauthn/*` routes + `<WebAuthnPanel>`
  + `/settings/security` page + `require_reauth()` gate helper for
  sensitive routes); +10 Playwright browser UAT specs covering Phase
  24-26 surfaces. 137/137 smoke tests passing.
- **2026-05-16** — Phase 25 (commit `1c6c7f7`): auto-assign reviewers on
  application submit (idempotent); per-scope `<AIChatPanel>` mounted
  on grant + application detail pages so users can ask Kuja about
  THIS entity without leaving the page; admin-only DonorCohortCard
  on `/donors/[id]` for cohort inspection; +222 i18n keys across 6
  locales covering chat thread, PWA banner, share, cohort strings.
- **2026-05-16** — Phase 24 (commit `53dd381`): reviewer auto-assignment,
  sustained AI chat threads (`AIChatService` + `/api/ai/threads/*` +
  `/chat` route + `<AIChatPanel>`), donor cohort analytics (your
  funded NGOs vs the cohort), PWA install banner + native share
  buttons on donor + NGO profile pages. 132/132 smoke tests passing.
- **2026-05-16** — Phase 23 (commit `68e263c`): side-by-side reviewer
  scoring, donor portfolio risk heatmap, Playwright CI, i18n batch
- **2026-05-16** — Phase 22 (commit `d13e904`): score breakdown,
  global search, compliance rerun cron, digest cadence
- **2026-05-16** — Phase 21 (commit `9758a6e`): panel calibration,
  donor broadcast, CSV exports, duplicate-app banner
- **2026-05-16** — Phase 20 (commit `2f5eaab`): application timeline,
  AI reviewer briefing, donor↔NGO messaging, passport polish
- **2026-05-16** — Phase 19 (commit `477c80a`): public donor benchmarks,
  past-wins suggester, NGO summary URL, reviewer match intelligence
- **2026-05-16** — Phase 18 (commit `088d95f` + `89611c4`): AI trust
  gap analysis, public donor profiles, donor onboarding, submission
  velocity, sectors-fix
- **2026-05-16** — Phase 17 (commit `833d776` + `9622d57`): real email
  transport, NGO onboarding, AI grant fit compare, donor merge
- **2026-05-16** — Phase 16 (commit `348832a`): AI debrief insights,
  peer benchmarks, smart match notifications, GitHub cron, reviewer
  throughput
- **2026-05-16** — Phase 15 (commit `e722fe6`): debrief rollup,
  application kanban, custom stage labels, UAT cron, tags
- **2026-05-15/16** — Phases 13 + 14 (commits `2c77614` + `833d776`):
  donor + NGO portfolio bundles, audit timeline, calendar PDF, win/loss
  debrief, outbound followups, plus all the PMO-transfer micro-patterns
