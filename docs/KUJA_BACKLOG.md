# Kuja Grant — Backlog

Living list of deferred work. Every commit that defers, picks up, or
completes a backlog item should update this file in the same commit.

Updated 2026-05-17.

After Phase 31 shipped the NPS micro-survey + per-language metric
breakdowns, **the active build-now backlog is empty except for
payment integration**. Everything else is *data-pending* — three
items waiting on 30 days of real production usage from the new
metrics dashboard before we know which version to build (and where
to spend the polish budget).

---

## Deferred — high priority (real blocker)

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

## Deferred — data-pending (do AFTER 30 days of metrics data)

These items are explicitly NOT premature. The Phase 29-31 metrics
infrastructure is now live; once we have real usage data we can make
each of these as a targeted bet instead of a guess.

### Outcome metrics (the "did Kuja help?" answer)
**Why wait:** without baseline volume + an A/B arm in production for
several weeks, "do reports using pre-flight need fewer revisions?" is
unanswerable. Currently every user gets every feature, so causal
attribution is impossible.

**What lands when picked up:**
1. Pick first experiment (likely readiness-check on/off via `ab_arm`)
2. Add outcome events: `report.accepted_first_pass`,
   `application.time_to_decision_days`, `application.score_delta_after_ai`
3. Admin metrics dashboard adds an "A/B outcomes" tab that splits
   each outcome by arm
4. After 30 days: report on the first experiment, decide whether to
   bake the feature in permanently or revert

**Readiness check:** `/admin/metrics` shows ≥50 application submits
across both arms.

### Deep i18n investment (per-locale native-speaker polish)
**Why wait:** Phase 31 added `chat_by_language`, `search_by_language`,
`readiness_by_language`, `preflight_by_language`, and NPS-by-language
breakdowns. After 30 days these will show which locales actually have
non-English users. Investing in deep polish across all 5 non-English
locales upfront is the most expensive item on the team's list AND
the most premature.

**What lands when picked up:**
1. Read `/admin/metrics` language breakdowns; identify the 1-2
   locales with ≥100 distinct users per week
2. For each qualifying locale:
   - Native-speaker review of the 6 most-trafficked surfaces
     (dashboard, chat, apply, reports, trust, search)
   - Unify glossary terms (readiness, compliance, trust profile,
     award, review, risk, evidence, reporting, capacity) into a
     locked terminology sheet
   - Audit microcopy on those surfaces (toasts, empty states,
     validation errors, placeholders, helper text)
   - RTL polish (Arabic specifically) — spacing, alignment, icon
     direction, mixed number/text wrapping
3. Skip locales that haven't crossed the threshold; revisit quarterly

**Readiness check:** `/admin/metrics` shows ≥100 weekly users in at
least one non-English locale for 4 consecutive weeks.

### Retention + habit metrics (beyond DAU/WAU)
**Why wait:** Phase 29 added DAU/WAU/MAU per role + per language, but
"weekly active per feature" and "% of users who repeat using feature X"
need at least 4 weeks of data to be meaningful — a single week is
just noise.

**What lands when picked up:**
1. `UserEventService.feature_retention(event_name, days)` — % of users
   who used the feature in week 1 who also used it in week 2/3/4
2. Admin metrics dashboard gains a retention card per flagship
   feature (chat, readiness, pre-flight, search, decision recording)
3. Drives the "which features deserve more investment" decision

**Readiness check:** continuous trailing 28-day window has at least
one feature with ≥50 distinct users.

---

## Deferred — medium priority

(none — WebAuthn re-auth shipped in Phase 26C; double-prefix wiring,
rate-limit noise, missing endpoints, AI-noise on admin pages, QA
lockout brittleness all shipped in Phase 27-28.)

---

## Explicitly declined

(none yet — but `require_reauth()` is still wired-but-ungated. Picking
which specific routes to gate with biometric re-auth is a *separate*
decision the team can make once they have a sense of which actions
they actually want protected. Don't gate broadly without that input.)

---

## Completed (rolling log)

- **2026-05-17** — Phase 30 + 31 (commit `d7e3b5a`): wired 7 more
  funnel events (`application.start_draft`, `report.start_draft`,
  `report.preflight_used`, `readiness_check.used`,
  `reviewer.assignment_opened`, `reviewer.review_submitted`,
  `trust_profile.viewed`, `donor.broadcast_sent`) + generic event
  ingest at `POST /api/ai/events/track`; metrics dashboard funnel
  count 3 → 6; `UserFeedback` model + service + `POST /api/feedback`
  + `<MicroSurvey>` component mounted on submitted apps + reports;
  NPS rollup on `/admin/metrics` with per-surface, per-language, and
  recent-comments cards. 153/153 smoke (+7 new tests).
- **2026-05-17** — Phase 29 (commit `62f77b5`): real-user metrics
  infrastructure — `UserEvent` model + service + 6 instrumented call
  sites + `ab_arm()` deterministic A/B bucketing helper + `GET
  /api/admin/metrics` + `/admin/metrics` page + sidebar link.
  146/146 smoke (+4 new tests).
- **2026-05-17** — Phase 28 (commit `3765254`): `/api/search` alias,
  `/api/notifications/preferences` alias, AI suggestions 502 noise
  suppression on admin pages (CopilotRail Now + Insights tabs
  classify transient errors), bulk lockout clear
  (`POST /api/admin/clear-all-lockouts`). 142/142 smoke (+5 new).
- **2026-05-16/17** — Phase 27 (commits `6f5e43e` + `4e9b4d4`): root-cause
  fix for `/api/api/...` double-prefix bug in api.ts (normalize
  leading `/api/`); AI rate-limit excluded `/api/ai/jobs/` polls
  + bumped 20 → 40 per minute (60 wedged the single worker);
  added `nav.audit_chain` i18n key; 9 strict interactive Playwright
  tests + `browser_test_strict.py` focused harness. 137/137 smoke.
- **2026-05-16** — Phase 26 (commit `b0ac3d5`): `/reports/[id]` detail
  page with scoped `<AIChatPanel>`; nightly reviewer auto-assign
  sweep cron; WebAuthn biometric re-auth full stack; +10 Playwright
  browser UAT specs.
- **2026-05-16** — Phase 25 (commit `1c6c7f7`): auto-assign reviewers
  on application submit (idempotent); per-scope `<AIChatPanel>`
  mounted on grant + application detail pages; admin-only
  `DonorCohortCard` on `/donors/[id]`; +222 i18n keys across 6
  locales.
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
