# Kuja Grant — Living Backlog

**Created:** 2026-05-06
**Last cleanup:** 2026-05-06 (batch 45 — duplicate-entry sweep)
**Owner:** Idiris (single product owner today; if/when donor-side and NGO-side
audiences need separate planning, fork into parallel backlogs).

## Convention

Every commit that defers, picks up, or completes a backlog item **must
update this file in the same commit**. This is non-negotiable — the
backlog rots otherwise.

- **New deferrals** → land in the appropriate priority bucket with
  `last_touched: YYYY-MM-DD` and a short one-line reason.
- **Completions** → move to the rolling log at the bottom with the
  commit SHA + date.
- **Operational TODOs** (manual things the team owes the system) →
  strikethrough with `~~done~~` when fulfilled.
- **Explicitly declined** items → keep them in the "Declined" section
  with the date + reason so we don't re-relitigate.

Always check this file before proposing new work — if it's already
declined or already in flight, reference that decision instead of
re-discussing.

---

## High priority

### Phase 98 — Design backlog (June 2026 design review)

**Context.** A design review document landed June 2026 with ~30 ideas
across AI substrate, design, UI, usability, clutter removal, trust /
differentiation, and measurement. Review pass agreed with most ideas,
deferred four for design re-spike, and added ten reliability + usability
ideas of our own. This block is the implementation plan.

**Session-of-2026-06-19 status:** Wave 1 components shipped + wired,
Wave 3 pre-submit preview shipped (rule-based v0), Wave 4 public Trust
Profile share page shipped, RTL + dark-mode + a11y all verified in
browser. WhatsApp / offline PWA / verifiable credential export are
multi-week and remain committed in the relevant Wave sections below.

**Sequencing principle:** Wave 1 first (pure design/UX; no new infra),
then Wave 2a (channels — WhatsApp, voice extension, predictive nudge
wiring), then Wave 2b (offline-first PWA + IndexedDB queue — biggest
engineering chunk), then Wave 3 (foresight — pre-submit preview, jargon
melt, OB confirmation card), then Wave 4 (moat — portable Trust Profile
share page + AI quality instrumentation expansion).

**Cross-cutting guardrail (every wave):** validate with moderated,
native-language sessions on a mid-range phone over a throttled
connection. This is the ship gate, not the polish step.

---

#### Wave 1 — Coherence (no new infra; ship first)

Shipped in this commit (June 2026):
- ~~`shared/waiting-for.tsx`~~ — humanises wait states ("Waiting for 2
  signatures · Amina signed; Peter pending"). Wired into
  `/admin/declarations/[id]`. Extends Phase 62-63 named-entities to
  signature-pending surfaces.
- ~~`shared/time-estimate.tsx`~~ — "~6 min · 3 of 5 fields" badge.
- ~~`shared/ai-diff.tsx`~~ — universal Propose → Diff → Accept pattern
  with word-level inline diff. Exports `editDistanceWords` for the AI
  quality metric.
- ~~`shared/one-number-card.tsx`~~ — one big number + one next action +
  optional peer comparison. Replaces metric-soup tiles.
- ~~`shared/sticky-mobile-cta.tsx`~~ — pinned bottom primary action on
  mobile; inline above sm:.
- ~~`shared/why-this-match.tsx`~~ — match transparency. 1-3 reason
  facets with optional precise values.
- ~~`shared/pre-submit-preview.tsx`~~ — "what a reviewer will see" with
  predicted band + top 2 cheap fixes.
- ~~`shared/predictive-nudge.tsx`~~ — "You're 80% done · ~6 min left ·
  next: Save and continue" replacing dumb deadline reminders.
- ~~`shared/collapse-section.tsx`~~ — secondary content collapsed by
  default; persisted state per `storageKey`.
- ~~`shared/primary-ai-bar.tsx`~~ — one primary AI verb per surface;
  "More AI tools" dropdown for everything else. Extends Phase 83.
- ~~`lib/ai-quality.ts`~~ — `recordAiQuality()` + `markFalseConfidence()`
  client-side telemetry. Pairs edit-ratio with false-confidence rate
  so we don't optimise acceptance into confidently-wrong AI.

Additional Wave 1 wirings landed in this session:
- ~~`OneNumberCard` on `/ngo/[id]` Delivery snapshot~~ — 3 cards with
  real data (Awarded, Active, Reports).
- ~~`TimeEstimate` on `/reports/[id]`~~ — shown for draft reports next
  to due date.
- ~~`CollapseSection` on `/reports/[id]`~~ — wraps the AI analysis block
  with persisted open/close state.
- ~~`WhyThisMatch` on `/grants/[id]` for NGO users~~ — 3 reasons
  (country/sector/amount) with caveat.
- ~~`/admin/design-gallery`~~ — admin-only dev surface that renders
  all 10 components with sample data + interactivity for QA.
- ~~RTL/dark-mode/a11y verified~~ — all 10 components survive Arabic
  layout (1159px at 1280px desktop, dir=rtl); dark-mode-token mapping
  works (added explicit `dark:` variants on the amber/sky semantic-light
  components); `role="status"` on WaitingFor + `aria-label` on AiDiff;
  native `<button>` + `aria-expanded` on CollapseSection.

Open (Wave 1 work remaining):
- Sweep existing dashboards beyond `/ngo/[id]` to use `OneNumberCard`.
  Next targets: `/admin/dashboard`, `/dashboard`, donor dashboards,
  reviewer queue.
  `last_touched: 2026-06-19`
- **App-wide dark mode toggle** — `dark:` variants exist on the new
  components but the app itself has no theme switcher (admin dashboard
  body remained `rgb(255,255,255)` in the verification pass until I
  force-added the `.dark` class on `<html>`). Needs: theme toggle in
  user settings, `prefers-color-scheme` listener, dark-token audit
  across pre-Phase-98 surfaces.
  `last_touched: 2026-06-19`
- **Other browsers** — only Chrome-based preview tested today; need
  Firefox + Safari pass before claiming cross-browser support.
  `last_touched: 2026-06-19`
- **Real screen reader pass** — NVDA / VoiceOver on the new components.
  ARIA attributes audited (role/aria-label/aria-expanded) but the
  announcement order + live-region behaviour needs assistive-tech run.
  `last_touched: 2026-06-19`
- **Real-device mobile testing** — emulated 375×812 viewport verified
  StickyMobileCta pin; need a real phone on 3G/4G to validate touch
  targets + sticky behaviour with the iOS Safari bottom-bar quirk +
  Android keyboard overlay.
  `last_touched: 2026-06-19`
- **Long-form load tests** — components verified with realistic sample
  data; no load-test pass against very long forms (50+ field apps) or
  reviewer queues with 100+ items.
  `last_touched: 2026-06-19`
- Audit every page for "one primary action per page" — enforce as a
  code-review rule. Anything with two co-equal primary buttons is a
  bug; demote one to a text link.
- Enforce `EmptyState` body field (currently optional) — fail lint when
  an EmptyState is rendered without a `body` that names the next action
  and why it matters.
- Replace all per-page percentage-style AI confidence with the existing
  bucketed `AIConfidenceBadge` (already calm) — codemod sweep.
- Unify duplicate vocabularies. Audit for the same concept shown two
  ways (status words, role labels, type chips) — pick one and dedupe.
- Persistent quiet journey rail — extend the Phase 92 journey tracker
  to render as a thin top rail on every NGO screen, not a page to visit.
- Cross-tenant token unification — Kuja + NEAR share infrastructure but
  must share one token + component system with two themes. Audit for
  drift.

#### Wave 2a — Channels (after Wave 1 sweep)

- **WhatsApp Business API for deadline nudges + status changes** —
  vendor integration (likely Twilio or 360dialog). Outbound first
  (cheaper, easier), inbound report-by-WhatsApp as a Wave 2b stretch.
- **SMS fallback** for users where WhatsApp isn't available.
- **Voice on every long field** — extend Phase 71 from reports to apply
  responses + declaration descriptions, six languages, same
  map-to-structure + coverage feedback.
- **Time + effort estimates everywhere** — sweep using
  `<TimeEstimate>` on every multi-step form.
- **Predictive nudge wiring** — implement the server-side estimate
  computation (autosave snapshot + field schema + historical median),
  feed `<PredictiveNudge>`.
- **"What changed since you last visited" digest** (our addition) —
  shown on login. Compresses re-orientation cost for weekly users.
- **Magic-link login via email AND WhatsApp** (our addition) — Global
  South NGOs lose password-reset emails frequently. Reduces churn.
- **Global "simplify" reading-level control** (from the design doc) —
  one toggle that rewrites on-screen content to a lower reading level
  in the user's language (AI-generated, cached). Helps users with
  limited literacy or non-native English far beyond translation alone.
  Concern to design through first: which copy is rewritable (narrative)
  vs not (legal/compliance/contractual language must stay verbatim).
  Cache key per term per language to lock in vocabulary across sessions.
  `last_touched: 2026-06-19`

#### Wave 2b — Offline-first

- PWA install + IndexedDB queue. The `pwa-install-banner.tsx`
  component already exists as a starter; need the actual service worker
  + queue + reconciliation logic.
- Offline status indicator + sync states ("Saved on your device · will
  send when you're back online").
- Conflict resolution on reconnect — surface a clear diff when the
  server changed while the user was offline.
- Bandwidth-aware media (our addition) — detect poor connection, more
  aggressive photo compression, queue large uploads.
- Resumable file uploads (our addition) — RFC 8673 / tus.io for
  agreements + reports.
- Accessibility floor — large-text mode, high-contrast theme, full
  keyboard paths, RTL for Arabic. Treated as ship gates per language,
  not enhancements.

#### Wave 3 — Foresight

- ~~**Pre-submit "what reviewer will see"** wiring~~ — shipped in this
  session. Rule-based v0: backend `/api/applications/<id>/pre-submit-
  preview` computes a band + top 2 cheap fixes from response length
  per criterion + criterion weights. No new AI call. Wired into
  `/applications/[id]/client.tsx` for owning NGOs on draft state.
  **Next:** replace heuristic with AI prediction once the prompt is
  tuned (multi-day, separate session).
- **Jargon-melting on tap** — extends `concept-helper.tsx` with
  AI-cached per-language rewrites for unknown terms.
- **OB visual confirmation card** for declaration-as-conversation
  (Phase 79) — parse is invisible, confirmation is explicit.
- **Smart batch operations for reviewers** (our addition) — "score 5
  applications in a row using the same rubric" instead of context-
  switching back and forth.
- **Inline scenario modeling** (our addition) — "What if I delay this
  report by 2 weeks?" → shows downstream impact.
- **Inactivity-triggered help** (our addition) — 45-second nudge with
  "Stuck? Here's what most users do."

#### Wave 4 — Moat + measurement

- ~~**Portable Trust Profile share page**~~ — shipped 2026-06-19.
  Backend `/api/passport/share/<slug>` returns 200 with the snapshot
  (no token); 410 Gone for revoked / expired / non-active with the
  reason. Frontend `/trust/share/[slug]/` renders the existing
  `TrustProfileCard` primitive in `showActions={false}` mode + a
  "Public snapshot — for cryptographic verification, ask the NGO for
  the token-bearing link" framing. Browser-verified for both active
  and revoked states. The "fresh share link" copy renders for the
  revoked case without leaking the old snapshot.
- Verifiable credential export (W3C VC format) the NGO can send to any
  funder, on or off Kuja. **The Portable Share Page above is the
  precursor.** Multi-week (see "What is genuinely multi-week" below).
  `last_touched: 2026-06-19`
- **"Why this match" transparency** wiring — `<WhyThisMatch>` exists
  and is wired on `/grants/[id]` (NGO view) with country/sector/amount
  match facets computed locally from grant data. **Needs:** real
  recommendation endpoint that emits per-NGO match-reasoning with
  readiness + past-success + capacity-match signals, and wiring on
  the NGO dashboard / Marketplace cards. 2-3 days.
  `last_touched: 2026-06-19`
- AI quality dashboard — admin-side rollup of `editRatio` per surface
  per language; flags surfaces with high editRatio (weak prompt) or
  high `falseConfidenceRate` (confidently wrong). **Backend telemetry
  shipped** (`/api/ai-telemetry/quality` + `/api/ai-telemetry/false-
  confidence` write to `ai_call_logs` with endpoint tag
  `ai-quality/<surface>`, rolled up by existing Phase 97
  `/api/admin/ai-telemetry`). **UI not built** — dedicated admin page
  needs the quality-specific cuts: median edit-ratio per surface,
  false-confidence rate per surface × language, mode-distribution
  histogram (verbatim/blended/rejected). Estimate 2-3 days.
  `last_touched: 2026-06-19`
- **Per-donor "ask about my grantees" surface** (our addition) —
  donor-side mirror of the NGO compliance coach. Cited answers across
  the portfolio.
- **Grant agreement template library** (our addition) — public library
  of templates donors can fork.

#### Cross-cutting metrics (instrumentation)

Per the design doc Section 7, plus our addition of the false-confidence
rate guardrail:

- Journey funnel: completion + drop-off at each stage (Build profile →
  Apply → Submit → Award → Report).
- AI acceptance rate per surface per language (already supported by
  `recordAiQuality()`).
- Time-to-first-submission and time-to-first-report for a new NGO.
- On-time reporting rate vs peer median over time.
- NEAR signing pace median + p90 days-to-signed against 6-day SLA.
- **False confidence rate** (our addition) — % of times users accepted
  AI verbatim AND the recipient (donor/reviewer/OB) later corrected it.
  Without this, the team optimises acceptance and misses confidently-
  wrong AI. Captured by `markFalseConfidence()`.

#### Reliability additions (our list — beyond the input doc)

- **Per-surface AI cost ceiling user-visible** — extend Phase 97 admin
  telemetry to user-visible per-tenant cost meter. Backend telemetry
  table exists (`ai_call_logs.tokens_in/out`); needs a per-tenant
  meter component + admin-side cap configuration UI + soft/hard
  threshold notifications. 3-4 days. (This was previously marked done
  by mistake; the meter UI was never built — only the rollup endpoint.)
  `last_touched: 2026-06-19`
- AI fallback hierarchy with user-visible status — when Claude is
  unavailable and we degrade to Haiku, show "Using draft mode — full
  review available shortly" instead of silent fallback.
- Replay tooling for audit chain disputes — given an entry, replay the
  exact AI input/output that produced it. Required for compliance trust.
- Synthetic production monitoring — end-to-end tests running every 30
  minutes against critical paths (NGO apply, reviewer score, donor
  agreement upload). Page on failure.
- Database integrity invariants — assert at the DB level that key
  invariants hold (e.g. `grant.total >= sum(grant.line_items.amount)`).
  Catches drift from bugs and admin tooling errors.
- Read-only failover mode — when the DB is degraded, allow reads
  (past grants, reports) even when writes fail. Better than full outage.
- Per-tenant data export bundle — daily snapshot the NGO can download.
  Removes the "what if Kuja goes away?" CFO objection.
- Tenant health dashboard — proactive monitoring of each tenant's data
  integrity, AI quality, signature pace. Surface drift before it bites.
- Graceful degradation when third-party APIs fail (OpenSanctions, the
  African registry adapters, Plaid, OpenAI Whisper) — each has a
  documented failure mode that doesn't block the user.
- SIM-roam-resistant sessions — users in our markets switch SIMs
  frequently. Sessions should survive IP changes without re-login.

#### Usability additions (our list — beyond the input doc)

- Recurring meeting / signature blocks — let an OB member declare
  "I can sign 9-11am Tuesdays". System schedules nudges around it.
- Voice search / global voice command — "show me my reports due this
  month" navigates. Voice for navigation, not just for input.
- Inline currency / unit / date conversion — USD grant agreement read by
  Kenyan NGO shows KES inline; "30 days from award" shows the actual
  date in user's locale.
- Drafts shared across NGOs (with permission) — if NGO A's similar
  application won, NGO B (with consent) can use it as a template.
- Co-pilot for the NGO board meeting — auto-generate the board-pack
  from the platform (Elevate-style capability for Grant-only customers).
- "Why this notification?" link on every alert — explain which rule
  fired; offer mute/configure. Reduces notification fatigue.
- Onboarding that doesn't gate the value — let an NGO draft a grant
  application before completing their Trust Profile (gate the submit,
  not the draft).
- Per-donor "house style" learning — AI learns each donor's preferred
  narrative style from accepted applications.
- Anti-data-loss when battery dies — tune autosave cadence based on
  battery indicator where available.
- Offline-first reviewer mode — reviewers might travel; let them
  download applications, score offline, sync.

#### Deferred (revisit conditions explicit per backlog convention)

Four ideas from the design review document deferred after review:

1. **Draft-first as universal default state for every long field.**
   Idea: AI proposal pre-filled in every long field, user edits/accepts.
   *Why deferred:* training users to accept-without-reading is a real
   failure mode for high-stakes factual fields (budget, beneficiary
   count, indicators). *Revisit trigger:* design re-spike that
   distinguishes stylistic fields (drafts YES) from high-stakes
   factual fields (drafts NO, AI confirms numbers but doesn't propose
   them). `last_touched: 2026-06-18`

2. **Reviewer consistency assist comparing to own historical pattern.**
   Idea: flag when a reviewer's score diverges from their own
   historical pattern. *Why deferred:* fairness paradox — if a
   reviewer realised they've been too lenient and is now correcting,
   the flag suppresses the correction and reinforces the old bias.
   *Revisit trigger:* re-spike that compares to panel average instead,
   with separate (not real-time) self-reflection surface for own-drift.
   `last_touched: 2026-06-18`

3. **Single live "Readiness" gauge per role.**
   Idea: one calm gauge per role that recomputes as the user works,
   showing the one thing that would move it most. *Why deferred:* risk
   of becoming the only metric anyone optimises for, and the inputs
   will be reverse-engineered within weeks. *Revisit trigger:*
   re-spike with anti-gaming inputs and decision on whether the gauge
   is ever cross-NGO comparable (probably not). `last_touched: 2026-06-18`

4. **Cross-device resume (laptop ↔ phone).**
   Idea: server-synced draft so the user can start on a phone and
   finish on a laptop. *Why deferred:* harder than it looks — needs
   careful conflict resolution if the user has been offline on two
   devices simultaneously. *Revisit trigger:* paired with Wave 2b
   offline-first work; conflict resolution UX designed first.
   `last_touched: 2026-06-18`

- `last_touched: 2026-06-18`

#### What is genuinely multi-week (not session-achievable, even at pace)

The user asked for "the remaining waves from today" — being honest about
why some Wave items are still in the backlog after pulling everything
within reach:

- **Wave 2a WhatsApp Business API integration.** Requires Twilio /
  360dialog account, real-domain WhatsApp Business profile registration
  (multi-week vendor process), conversational templates approval cycle,
  inbound webhook handlers, two-way ID linking from phone number to
  Kuja user, opt-in/opt-out flows, and language detection per message.
  Estimate: 4-6 weeks of focused work even after vendor onboarding.
  **Next step:** kick off vendor procurement; meanwhile, the existing
  email-based deadline nudges remain the channel.
- **Wave 2a SMS fallback.** Same vendor question + per-country carrier
  cost modelling. 2-3 weeks.
- **Wave 2b offline-first PWA.** Service worker design + IndexedDB
  schema + queue + reconciliation UI + offline status indicator + sync
  conflict resolution. Estimate: 6-10 weeks. The `pwa-install-banner.tsx`
  starter exists.
- **Wave 4 verifiable credential (W3C VC) export.** Requires choosing a
  VC suite (e.g. BBS+ for selective disclosure), issuer DID, key
  management, revocation list publishing, an example verifier. 4-6
  weeks. The shareable-public-link landed today is the precursor.
- **Wave 4 donor "ask about my grantees" surface.** Requires an AI Q&A
  endpoint scoped to donor's grantee portfolio with citations to source
  records. 2-3 weeks just for the prompt + grounding work.
- **Wave 3 AI prediction for pre-submit.** Replace the rule-based v0
  shipped today. Multi-day prompt tuning + offline eval against past
  applications + telemetry instrumentation.
- **App-wide dark mode toggle.** The Phase 98 components ship with
  `dark:` variants, but the app has no theme switcher today (no `.dark`
  class on `<html>` from any user action; body stays
  `rgb(255,255,255)` in default state). Needs: settings-page toggle,
  `prefers-color-scheme` listener, persist preference per user,
  audit pre-Phase-98 surfaces for dark-token compliance, validate
  on print stylesheets. 1-2 weeks.
- **AI quality dashboard UI** (companion to the Phase 98.10 telemetry
  endpoint). Backend telemetry is shipped + verified end-to-end; the
  admin page that surfaces median edit-ratio per surface +
  false-confidence rate × language + mode distribution does not exist
  yet. 2-3 days.
- **Per-tenant AI cost meter UI.** Telemetry exists; the user-visible
  cost meter component + admin-side cap config + threshold
  notifications do not. 3-4 days.

These items remain committed in the relevant Wave sections above; the
estimates here are the scope honesty that lets the team plan against
them rather than slip them into a single session.

- `last_touched: 2026-06-19` (session update — Wave 1 deep wirings +
  Wave 3 pre-submit v0 + Wave 4 share page shipped)

---

## Medium priority

### Native-speaker translation review pass
Phase 6.1 shipped `docs/i18n_review_targets.md` listing priority
namespaces flagged for native-speaker review across ar/sw/so/fr/es.
Awaiting the human reviewers. When the first batch comes back:
- Build the `frontend/scripts/update_translations.py` 30-line merge
  script (planned but not written — see audit doc for invocation)
- Apply annotations and ship
- **Blocked on:** human reviewer availability (operational TODO).
- `last_touched: 2026-05-06`

---

## Low priority

### UAT fixture self-healing cron
PMO ran a daily `/api/cron/uat-fixtures` to ensure demo states
exist (≥ 1 grant in every band, 1 report needing pre-flight, etc.).
Kuja's single-tenant prod hasn't seen the marker-row drift PMO hit
in their multi-tenant prod. **Revisit trigger:** QA team complains
that demo data has drifted.
- `last_touched: 2026-05-06`

### Polymorphic FK lint
PMO had a Prisma-query lint that flagged any query against
polymorphic tables filtering on `contract_id` XOR `sop_id` without
a `// polymorphic-fk: <reason>` justification comment. No
polymorphic splits currently in flight at Kuja (`Risk`,
`EntityComment`, `OrgMemory` are polymorphic but use `subject_kind` +
`subject_id` patterns rather than dual-FK columns). **Revisit
trigger:** a similar dual-FK split lands.
- `last_touched: 2026-05-06`

### Saved searches on `/reports` calendar page
Phase 13.40 wired `<SavedSearchesBar>` on `/grants`, `/applications`, and
`/organizations/search`. The reports page is a calendar view, not a
filterable list, so saved searches has nothing to capture. Adding it
requires first deciding whether we want a flat list view alongside
the calendar — product decision, not a quick mount. **Revisit
trigger:** team or donor explicitly asks for a list-form reports view.
- `last_touched: 2026-05-06`

### Workflow configurator (parallel reviewer groups + COI gates)
PMO had a generic configurable workflow engine (parallel review
groups, COI gates, sign-off ledger, flowchart preview). Kuja's
review flow is currently single-reviewer per application. **Revisit
trigger:** a high-stakes donor explicitly requests multi-reviewer
parallel approval with COI gates, OR a procurement-grade reviewer
audit trail becomes a contractual ask. Estimated 2-3 weeks of work;
not worth the build cost without a customer pull.
- `last_touched: 2026-05-06`

---

## Operational TODOs

These are manual things the team owes the system. Strikethrough
when done. Last refreshed 2026-05-06 to reflect every env var the
codebase actually consults today.

### Railway env: required-or-recommended for production maturity

- [ ] **`CRON_SECRET`** — multi-worker stability for scheduled jobs.
  As of Phase 13.21 the app auto-generates a per-process fallback at
  boot if missing, so `/admin/system-health` no longer warns. **But**
  multi-worker prod needs an env-set value so all workers share the
  same secret. Set a 32-char token (`secrets.token_urlsafe(32)`).
- [ ] **`REDIS_URL`** (or `RATE_LIMIT_REDIS_URL`) — highest-leverage
  unset env. Activates **two** systems at once:
    1. Phase 13.35 cross-worker rate limiter (without it, limits are
       per-Gunicorn-worker — effectively N× looser).
    2. Phase 13.42 cross-worker async-AI job state (without it, a job
       submitted on worker A can't be polled from worker B; under
       multi-worker load, ~3 of every 4 polls would 404 the job).
  Both fall back gracefully when unset; no outage. Provision a
  Redis service in Railway and set the URL. The same Redis instance
  serves both — no need for two separate ones.
- [ ] **`VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT`** —
  activate web push @mention delivery to subscribed devices. Without
  these the in-app notification path still works, but push gracefully
  no-ops. Generate via `py -3 -m pywebpush --keys` (or any VAPID
  generator) and set all three in Railway env. Subject must be a
  `mailto:` URL or a site URL.
- [ ] **`OPENSANCTIONS_API_KEY`** — confirm current. Live sanctions
  primary feed; falls back to direct UN/OFAC/EU CSVs if missing or
  invalid. Worth re-verifying every quarter.

### Railway env: tunable thresholds (sensible defaults; override only on signal)

- [ ] `KUJA_AI_BUDGET_USD_30D` — `/admin/ai-spend/forecast` budget.
  Default `250`. Override only if your projected monthly spend
  shouldn't fire `over_budget` at $250.
- [ ] `KUJA_USER_AI_CONCURRENT` — max in-flight AI calls per
  authenticated user. Default `3`. Phase 13.41 added this to prevent
  one client saturating the worker pool. Lower if you see queue
  pressure; raise only after Phase 13.42 async dispatcher is wired
  on every AI route the team relies on.
- [ ] `KUJA_AUDIT_RETENTION_DAYS` — nightly prune window for
  `ai_call_logs` + read+old `notifications`. Default `365`.
  Hash-chained `audit_chain` rows are NEVER pruned. Lower if disk
  pressure; the value is editable live via PUT
  `/api/admin/audit-retention`.
- [ ] `KUJA_DAILY_AI_SURFACE_HEALTH` — daily dry-run of all 7
  flagship surfaces against synthetic fixtures (~7 cheap Anthropic
  calls). Default `true`. Set `false` only if you want to suppress
  the daily probe (e.g. during a cost-monitoring window).
- [ ] `KUJA_DAILY_DEMO_READINESS` — daily sparse-data scan + admin
  notification on warn-level findings. Default `true`. Same opt-out
  pattern as above.
- [ ] `RATE_LIMIT_LOGIN_PER_IP` — IP-scoped login attempt cap over
  the 5-minute sliding window. Default `100`. Raise only if shared-
  NAT testing teams keep getting locked out.
- [ ] `RATE_LIMIT_ENUM_PER_IP` — distinct-email enumeration cap.
  Default `15`. Raise only if multi-role QA grows past 15 seed
  accounts.

### Decisions the team owes the system

- [ ] **Hard-2FA enforcement date** — proposed `2026-05-29`. Flip
  `KUJA_ENFORCE_ADMIN_2FA=true` on the chosen day. Until then,
  admins are nagged but not blocked.
- [ ] **Native-speaker translation review** — assign reviewers per
  locale (ar/sw/so/fr/es). `docs/i18n_review_targets.md` lists
  priority namespaces. Once the first batch returns, a 30-line merge
  script (planned but unwritten) lands the annotations.
- [ ] **Per-tenant audit retention windows** — current impl is
  global. If yes, swap to a row in `feature_flag_overrides` keyed
  by `org_id`.
- [ ] **Reports list view** — `/reports` is calendar-only today.
  Saved-search bar isn't there because there's no list to filter.
  If a list-form view is wanted, that's a real product decision —
  layout + filters + saved-search wiring follow.
- [ ] **AI cost forecasting follow-through** — once 30 days of
  real spend data accumulates, review the `/admin/ai-spend/forecast`
  output and either confirm the $250 default or set a calibrated
  `KUJA_AI_BUDGET_USD_30D`.

### Manual verification owed (post-deploy, can't fully automate)

- [ ] **Web push end-to-end** — once VAPID env is set:
    - Open Chrome on a real machine, log in as an NGO program
      officer, click "Enable notifications" on the prompt the
      `<TwoFactorNagBanner>`-area surfaces.
    - Have a donor reviewer @mention them in a comment.
    - Verify the push arrives even with the tab backgrounded.
    - Cert script verifies the wiring contract (`/sw.js` reachable,
      `/api/push/config` shape, subscribe/unsubscribe 401-vs-400
      semantics) but can't grant Notification permission programmatically.
- [ ] **Slips forecast badge** under real conditions — currently
  no grant projects a slip ≤30d. Either:
    - Wait for the trajectory cron to accumulate enough snapshots
      that real grants enter the warning window naturally; OR
    - Pin a fixture grant whose health is deliberately deteriorating
      so the badge has a known-visible target.
  The cert reports SKIP today (correct fail-closed); a real-grant
  pass closes the loop.
- [ ] **NGO supportive-tone audit** — pointed feedback session with
  an NGO user identifying specific strings that read procedural vs.
  supportive. Without specific examples this can't be acted on
  blind. Phase 11.5 did a copy refresh; this is the next-mile
  pass.
- [ ] **First-week observability sweep** — check the seven Watch
  dashboards (below) after the first full week of post-deploy
  traffic. If anything trends red, file as new high-priority.

## Watch (post-launch monitoring)

These are observability dashboards that need a real-user data
window before signal can be read. Check after the first full week
of post-deploy traffic:

- `/admin/ai/dashboard` — helpfulness signal per endpoint
- `/admin/reviewer-drift` — divergence between AI scores and reviewer scores
- `/admin/perf-budgets` — cold-start regressions
- `/admin/experiments` — A/B rail bucket assignment + outcome data
- `/admin/system-health` — AI failure rate trends, native_pdf usage spikes
- `/admin/ai-spend` — day-bucket cost; `/admin/ai-spend/forecast` for
  30-day projection vs. `KUJA_AI_BUDGET_USD_30D`. Alert if any single
  day > $50 or if forecast hits `over_budget`.
- `/admin/failed-logins` — brute-force ramps

---

## Explicitly declined

These have been considered and consciously NOT pursued. Don't
re-pitch unless the underlying premise changes.

| Item | Date | Reason |
|---|---|---|
| Multi-tenant aggregate compliance score | 2026-05-06 | Masks per-grant signal; show count of grants per band instead. PMO consciously deferred for the same reason. |
| Custom dashboards / widget palette | 2026-05-06 | UI-heavy, needs a widget framework decision. Ship the fixed dashboards first; revisit if multiple donors ask for it. |
| Native iOS/Android apps | 2026-05-06 | PWA + web push covers the use case. App store deployment is significant overhead for marginal field benefit. |
| Browser fingerprinting / device intelligence | 2026-05-06 | Privacy-hostile, marginal anti-fraud value vs. the cost in NGO trust. |
| Aggregating org-wide compliance score for cross-donor benchmarking | 2026-05-06 | Requires opt-in data sharing or a 3rd-party dataset. Lower priority; revisit if donors request portfolio benchmarking. |
| `xlsx` (SheetJS) → `exceljs` migration | 2026-05-06 | N/A for our Python stack. We use `openpyxl` (no active CVEs). |
| `pdf-parse` v2 → alternative migration | 2026-05-06 | N/A for our Python stack. We use `PyPDF2` (PMO's warning was about a Node.js bug). |
| Per-org polymorphic comments scope | 2026-05-06 | Comments scope to donor↔NGO pair via the access-control function in `app/routes/comments.py`, not via org-wide visibility. |
| CSP nonce/hash replacement of `'unsafe-inline'` on `script-src` | 2026-05-06 | Deferred. Next.js static export emits per-page hydration scripts whose contents vary by route, so a nonce-based CSP requires either (a) a build-time per-page hash manifest + Flask middleware that emits per-page CSP headers, or (b) migrating off static export to SSR so a per-request nonce can be threaded through `next/script`. Both are 1–2 session refactors. The remaining `'unsafe-inline'` is meaningfully bounded: `script-src 'self' 'unsafe-inline'` (no third-party origins), `frame-ancestors 'none'`, `object-src 'none'`, `block-all-mixed-content`, `base-uri 'self'`, `form-action 'self'`. Revisit if (i) we drop static export, or (ii) a Wiz/Snyk audit specifically flags this as the top remediation for our threat model. |

---

## Completed (rolling log)

Newest first. Drop entries older than 90 days.

### 2026-05-06 — Phase 13 batch 52: UAT cert script + overlay listener fix

The team's previous certification pass left 5 UI items "code-shipped
but not visually certified": saved-search reorder, saved-search delete,
slips forecast badge, ?-shortcut overlay replay link, web-push wiring.
This batch builds an automated Playwright certification, runs it
against prod, and fixes every defect it surfaces. **Final result:
13/14 cert checks pass, 0 fail, 1 expected skip.**

| Sub-phase | What | Commit |
|---|---|---|
| 13.45-cert-script | New `scripts/certify_uat_remaining.py`. Real chromium, runs against prod by default, structured pass/fail/skip output. Hardened against IP rate-limit, ASCII-only icons (Windows cp1252 safe), UTF-8 stdout, dialog-role fallback if i18n moves text, locale-aware text fallbacks for replay link. Bypasses the SPA login form by calling `/api/auth/login` directly + storing the cookie in the page context (the form's `window.location.href = '/dashboard/'` redirect raced with the layout's session-check in headless). | (this batch) |
| 13.45-overlay-fix | Real defect: `KeyboardShortcutOverlay`'s keydown listener was attached with `[open]` deps, so each toggle tore down + re-attached. Under rapid presses (and synthetic dispatch) this opened a brief unbound window. Now empty deps + functional `setOpen` for the Escape branch — listener stable across the component lifetime. Also accepts `Shift+/` for non-US keyboard layouts that emit `/` with `shiftKey` rather than `?`. | (this batch) |
| 13.45-mount-marker | Component sets `window.__kuja_kbd_overlay_mounted = true` in `useEffect`. Lets any future cert distinguish "didn't mount" from "mounted but didn't open" without DOM scraping or i18n-fragile text matching. | (this batch) |
| 13.45-testids | `data-testid` on stable component anchors: `saved-searches-bar-<scope>`, `saved-search-confirm-save`, `shortcut-overlay-replay-tour`. The team's admin user is Swahili-locale so the cert's English-text fallbacks were missing locale-resolved buttons. Testids are i18n-stable. | (this batch) |
| 13.45-tour-dismiss | Cert detected the `OnboardingTourProvider`'s tour overlay (z-1400) intercepting clicks on the shortcut-overlay's replay button (z-50) for fresh browser contexts. Cert now reads `/api/auth/me`, writes the `kuja_onboarded_${role}_${userId}` localStorage marker the provider consults, and reloads. | (this batch) |

Cert results against prod (build `62qUKLecVVuOBVVmLxamF`):

  PASS: LOGIN_ADMIN, LOGIN_DONOR
  PASS: SAVED_SEARCH_BAR_VISIBLE (mounted on /grants)
  PASS: SAVED_SEARCH_SEEDED (created 2 chips inline)
  PASS: SAVED_SEARCH_REORDER (B↔A order verified via API)
  PASS: SAVED_SEARCH_DELETE (both chips deleted)
  PASS: SHORTCUT_OVERLAY_MOUNTED (window marker)
  PASS: SHORTCUT_OVERLAY_OPENS (dialog role match after '?')
  PASS: SHORTCUT_REPLAY_LINK (testid present)
  PASS: SHORTCUT_REPLAY_DISPATCHES_EVENT (kuja:replay-tour fired)
  PASS: WEB_PUSH_SW_REACHABLE (/sw.js → 200)
  PASS: WEB_PUSH_CONFIG_CONTRACT (configured=false, no VAPID env yet)
  PASS: WEB_PUSH_SUBSCRIBE_VALIDATES (400 on missing endpoint)
  SKIP: SLIPS_BADGE — no grant currently projects a slip ≤30d. The
        component is correctly fail-closed; this is correct behavior.

### 2026-05-06 — Phase 13 batch 51: post-async-rollout cleanup

The team's certification pass after the async rollout flagged 4 real
issues. Fixed in this batch.

| Sub-phase | What | Commit |
|---|---|---|
| 13.44-surface-health | `app/services/ai_surface_health.py` was passing flat kwargs (`criteria=`, `grant_title=`) but the real AIService methods take `grant=`/`org=`/`application=` dicts with title/criteria nested. 5/7 probes were failing in prod with TypeError. Fixture rewritten to match real signatures. Assertion shapes also relaxed to be permissive about variant return-keys (verdict / readiness_score / readiness_band; per_criterion / evidence_per_criterion). | (this batch) |
| 13.44-sig-invariants | 7 new logic invariants (one per flagship surface) use `inspect.signature.bind` to verify the runner's kwargs match the real method signatures **synchronously, without calling Anthropic**. Catches future signature drift in CI before it reaches production. 67/67 invariants pass. | (this batch) |
| 13.44-no-criteria-rescue | Reviewer page: the "Suggest evaluation criteria" affordance was only rendered inside `evidenceResult?.reason === 'no_criteria'` — i.e. only AFTER the user clicked Extract Evidence. The static empty state (visible the moment the page loads with no criteria) showed only an `<EmptyBox>` "No evaluation criteria defined" — looked like a dead end. Replaced with the productized rescue panel: button visible immediately, full proposal flow + clipboard copy + AI/template source label. | (this batch) |
| 13.44-ai-spend-contract | `_parse_int_arg` now raises `_BadIntArg` on non-numeric input instead of silently coercing to default. Both `/api/admin/ai-spend?days=foo` and `/api/admin/ai-spend/forecast?trailing_days=foo` return 400 with `{success: false, error: 'validation.invalid_value', message: '...'}`. Missing/empty arg still defaults (friendly common case). Out-of-range numeric still clamps. | (this batch) |
| 13.44-clear-lockout | New `POST /api/admin/clear-lockout` admin endpoint. Body: `{email}`. Resets `users.failed_login_count`, `users.locked_until`, and deletes `login_attempts` rows for that email. Used by `test_brute_force_real_account` to clean up `maria@reviewer.org` after exercising lockout, so subsequent login-all-accounts tests don't fail with phantom 429. Live probe confirms LOCK-001 itself is correct (was likely flaking during the outage period when worker saturation made DB queries unreliable). | (this batch) |

### 2026-05-06 — Phase 13 batch 50: complete the async AI migration

Batch 49 shipped the dispatcher + migrated 2 endpoints (insight-narrate,
suggestions). This batch sweeps the remaining heavy AI endpoints.

| Sub-phase | What | Commit |
|---|---|---|
| 13.43-helper | New `maybe_async_jsonify(req, task_type, work_fn)` in `app/services/ai_jobs.py`. Wraps "do the work, return a dict" closures so each route migration is ~5 lines instead of 12. Both sync and async modes from a single helper. | (this batch) |
| 13.43-routes | All heavy AI endpoints now async-capable. Backend list: `donor-portfolio-insights`, `donor-grant-copilot`, `ngo-readiness`, `reviewer-recommendation`, `cross-grant-patterns`, `extract-evidence`, `suggest-criteria`, `compliance-preempt`, `draft-application`, `draft-report`, `submission-readiness`, `report-readiness`, `reviewer-summary`, `burden-estimate`, `median-ngo-preview`, `grant-brief`. Plus the original `insight-narrate` and `suggestions` from batch 49 (refactored to use the new helper). 18 total. | (this batch) |
| 13.43-fetchers | Frontend fetchers in `copilot-api.ts` now async-by-default for: `fetchDonorPortfolioInsights`, `fetchGrantScaffold`, `fetchNgoReadiness`, `fetchReviewerRecommendation`, `fetchCrossGrantPatterns`, `fetchDraftApplication`, `fetchDraftReport`, `fetchMedianNGOPreview`, `fetchGrantBrief`, `fetchCompliancePreempt`, `fetchSubmissionReadiness`, `fetchReportReadiness`, `fetchReviewerSummary`, `fetchBurdenEstimate`. (`fetchInsightCaption` + `fetchSuggestions` already async from batch 49.) Caller signatures + return shapes unchanged — `safeCallAsync` does enqueue+poll under the hood. | (this batch) |
| 13.43-detached-objects | For routes that need DB writes after the AI call (`draft-application`, `draft-report`), the closure re-fetches SQLAlchemy objects by ID inside the bg thread instead of capturing the request-scoped session-attached object. Avoids "DetachedInstanceError" when the bg session is different from the request session. | (this batch) |

Endpoints intentionally left sync: `chat`, `chat-stream` (already streaming),
`guidance`, `strengthen-section`, `score-criterion`, `score-application`,
`analyze-report`, `report-guidance`, `compliance-explain`, `draft-section`
— per-section / per-criterion calls that are typically short and not
common dashboard saturators. Can migrate later if traffic shows them
problematic.

### 2026-05-06 — Phase 13 batch 49: async AI job dispatcher (architectural fix)

The 2026-05-06 outage exposed that synchronous AI calls in HTTP
handler threads is fundamentally fragile — when many concurrent AI
calls hit, workers saturate and even `/api/health` queues. Batch 41
shipped a bandage (thread bump + per-user concurrent cap). This batch
ships the proper architectural fix.

| Sub-phase | What | Commit |
|---|---|---|
| 13.42-dispatcher | New `app/services/ai_jobs.py` — `submit_ai_job(task_type, fn, ...)` composes the existing `task_runner.submit_task` to run AI calls in the background pool with full Flask app context. Captures per-request user_id + language so the bg worker reproduces the calling context. Drop-in: returns a `task_id` matching the existing job conventions. | (this batch) |
| 13.42-poll-endpoint | New `GET /api/ai/jobs/<id>` — generic poll for any submitted AI job. Returns `{status, result?, error?}` shape. Unknown ids return `status=unknown` rather than 404 so a stale poll never crashes the UI. | (this batch) |
| 13.42-async-mode | Backend convention: `?async=true` query param OR `body.async_mode=true` opts a route into async mode. Returns 202 + `{ok, job_id, status: 'pending'}`. Default sync mode unchanged for back-compat. Migrated `/api/ai/insight-narrate` and `/api/ai/suggestions` (the two worst offenders identified in the outage logs). | (this batch) |
| 13.42-frontend-hook | New `frontend/src/lib/hooks/use-ai-job.ts` — React hook with enqueue + exponential-backoff polling (250ms → 2s, capped at 30 attempts ~50s). Cancellation on unmount or new run. Sync fallback when an endpoint returns a body instead of a job_id. | (this batch) |
| 13.42-frontend-fetchers | `frontend/src/lib/copilot-api.ts` — added `safeCallAsync` helper that does enqueue+poll under the hood while preserving the `CopilotResult<T>` return shape. `fetchInsightCaption` and `fetchSuggestions` now run async-by-default — call sites (dashboards, co-pilot rail) get the same final result without holding worker threads during the wait. | (this batch) |
| 13.42-invariants | 4 new logic invariants pin the dispatcher contract: helpers are callable, `submit_ai_job` composes `task_runner.submit_task` (not a parallel system). 60/60 pass. | (this batch) |

Why this matters: dashboards mounting (admin AI insight cards, co-pilot
rail) used to fire 6+ concurrent synchronous AI calls. Each held a
Gunicorn thread for 2-10s. Even with batch 41's bumped thread count,
heavy concurrent traffic could still saturate. With batch 42, those
calls return 202 in <50ms — workers free, polling does the wait
client-side. The architectural fix the bandage was deferring.

### 2026-05-06 — Phase 13 batch 48: cron-wire diligence + finish saved-searches mounts

| Sub-phase | What | Commit |
|---|---|---|
| 13.40-cron-ai-surface | Daily scheduler now runs the flagship AI surface health probe inside the existing 24h loop. ~7 cheap Anthropic calls/day; skips when ANTHROPIC_API_KEY is unset. On any fail, writes one admin-kind notification per admin so it shows up in the panel. Idempotent on a 20h window so worker restarts don't dup. Opt out: `KUJA_DAILY_AI_SURFACE_HEALTH=false`. | (this batch) |
| 13.40-cron-demo-readiness | Daily scheduler runs the demo-readiness scan and notifies admins when any category goes warn-level. Top-3 finding preview in the notification body. Opt out: `KUJA_DAILY_DEMO_READINESS=false`. | (this batch) |
| 13.40-pure-scanner | Refactored `api_demo_readiness` to delegate to a new pure function `app/services/demo_readiness.scan_demo_readiness()`. Single source of truth — admin endpoint and daily scheduler can never drift apart. | (this batch) |
| 13.40-apps-saved | `<SavedSearchesBar>` mounted on `/applications`. Added a 6-state status filter chip strip (`all / submitted / under_review / scored / accepted / rejected`) so saved searches has meaningful filter shape to capture. | (this batch) |
| 13.40-orgs-saved | `<SavedSearchesBar>` mounted on `/organizations/search` capturing the active query. Auto-fires the search on apply so a saved filter restores the result list with one click. | (this batch) |
| 13.40-reports-saved | **Skipped** — `/reports` is calendar-only with no list-portion to attach a filter to. Adding saved searches here would mean first designing a flat report list view alongside the calendar, which is a product decision, not a 5-minute mount. Tracked separately. | — |

### 2026-05-06 — Phase 13 batch 47: orphans wired + admin diligence surfaces

| Sub-phase | What | Commit |
|---|---|---|
| 13.39-saved-searches-mount | `<SavedSearchesBar>` mounted on `/grants` list page. Captures `{ q, sectors, sort }` shape — restores all three on apply. The component now drives a real surface; previously was dead code. | (this batch) |
| 13.39-slips-mount | `<SlipsForecastBadge>` mounted next to each grant's `<ScoreRing>` on `/compliance`. Renders only when the trajectory cron projects a slip ≤30d away. | (this batch) |
| 13.39-budget-card | `<AIBudgetCard>` mounted on `/observability` (admin AI surface). Consumes `/admin/ai-spend/forecast` and renders ok/watch/over_budget tone-coded panel with daily-avg + headroom. | (this batch) |
| 13.39-demo-readiness | `GET /api/admin/demo-readiness` — scans prod for sparse-data risks across 7 categories (grants without criteria, open grants without applications, submitted apps without docs/responses, reports missing submitted_at, orgs missing profile, admins without 2FA). Each finding includes count + sample IDs + a fix hint so admins can curate before showing the product. | (this batch) |
| 13.39-ai-surface-health | New `app/services/ai_surface_health.py` runner exercises every flagship AI surface against synthetic fixtures (submission/report readiness, burden estimator, draft_application, reviewer summary, extract_evidence, suggest_criteria). `GET /api/admin/ai-surface-health` for admin readout; `scripts/ai_surface_health.py` for cron (exits 1 on overall=fail). 3 new logic invariants pin the runner's contract. | (this batch) |

### 2026-05-06 — Phase 13 batch 46: enterprise hardening + category-defining moments

Sequenced from the user's direct prioritized feedback after the live
admin/API + browser pass.

| Sub-phase | What | Commit |
|---|---|---|
| 13.38-ai-spend-harden | `_parse_int_arg` helper + try/except wraps around both `/ai-spend` and `/ai-spend/forecast` SQL paths. Bad query args (e.g. `?days=` empty / `?days=foo`) and any DB hiccup now return a logged `error_response` instead of a bare 500. | (this batch) |
| 13.38-system-health | Added `redis_backend` and `ai_budget_threshold` checks to `/admin/system-health`. Both surface as soft `ok` when env is unset (in-memory fallback / $250 default) with concrete `fix:` notes — never light up red, but make the missing env discoverable. | (this batch) |
| 13.38-retry | Bumped frontend `apiFetch` GET retry from 1× @ 250ms to 2× exponential (250ms, 750ms). Two retries cover two transient hops (Railway edge + Gunicorn worker recycle) while still surfacing real failures within ~1s. | (this batch) |
| 13.38-suggest-criteria | NEW backend extractor `AIService.suggest_criteria` + `POST /api/ai/suggest-criteria`. When a grant has no rubric, AI proposes 5-7 criteria (label / description / weight normalized to 100 / rationale). Reviewer empty-state now shows a "Suggest evaluation criteria" button → drafted criteria render inline + "Copy as plain text" action so the reviewer can share with the donor. Template fallback always non-empty so the surface is useful even if AI is offline. | (this batch) |
| 13.38-flag-flip | Strengthened the Phase 13.24 second-wave flag flip to ALSO sweep stale `feature_flag_overrides` rows (per-user / per-org `value='false'`) for the 6 second-wave keys. Previously only the global row was cleaned, so a leftover org-scope override silently kept a flag OFF for that tenant after the default flipped. Added 6 logic invariants pinning the defaults so this can't regress. | (this batch) |

### 2026-05-06 — Phase 13 batch 45: BACKLOG cleanup

Duplicate-entry sweep. The `High priority` section had completed
items both ✓-marked at the top AND repeated as un-done entries
further down (artifact of incremental edits over batches 36-44).
Removed the dupes; consolidated everything into the Completed
rolling log + Explicitly declined sections. Active backlog now
shows: 0 high-priority, 1 medium-priority (native-speaker review,
blocked on human reviewers), 3 low-priority (UAT cron, FK lint,
workflow configurator — all have explicit revisit triggers).

### 2026-05-06 — Phase 13 batch 44: low-priority polish

| Sub-phase | What | Commit |
|---|---|---|
| 13.36-saved-searches-ui | `<SavedSearchesBar>` drop-in component with ↑/↓ reorder (no DnD lib), inline create/delete, optimistic updates | `61f768b` |
| 13.36-slips-badge | `<SlipsForecastBadge>` consumes trajectory endpoint, renders only when projected slip ≤ threshold; tone-coded by urgency | `61f768b` |
| 13.36-ai-forecast | `GET /api/admin/ai-spend/forecast` — trailing-window daily-average → 30-day projection vs. `KUJA_AI_BUDGET_USD_30D` | `61f768b` |
| 13.36-tour-replay | Onboarding tour audit conclusion + "Replay onboarding tour" link in shortcut overlay (i18n across 6 locales) | `61f768b` |

### 2026-05-06 — Phase 13 batch 43: Redis rate limiter

| Sub-phase | What | Commit |
|---|---|---|
| 13.35 | Redis-backed sliding-window rate limiter via atomic `ZREMRANGEBYSCORE + ZADD + ZCARD + EXPIRE` pipeline; opt-in via `REDIS_URL` env; in-memory fallback when unconfigured | `f8a6653` |

### 2026-05-06 — Phase 13 batches 41 + 42: tool-use final + web push

| Sub-phase | What | Commit |
|---|---|---|
| 13.4-final | `draft_application` + `generate_reviewer_summary` migrated to `_call_claude_tool` (forced tool-use). All 5 top extractors now schema-validated. Logic invariants gate further drift. | `9ce2798` |
| 13.34 | Web push infra end-to-end: VAPID config + service worker + `<PushSubscription>` model + 4 routes + `frontend/src/lib/web-push.ts` client + integration with @mention notifications. Best-effort, no-op when VAPID env unset. | `9ce2798` |

### 2026-05-06 — Phase 13 batches 39 + 40: action queues + admin self-service

| Sub-phase | What | Commit |
|---|---|---|
| 13.29 | `<DonorActionQueue>` + `<ReviewerActionQueue>` mounted on the dashboard above existing surfaces | `6d1113f` |
| 13.30 | Audit retention prune in nightly notification scheduler (deletes ai_call_logs + read+old notifications; never touches hash-chained audit_chain rows) | `6d1113f` |
| 13.31 | Hard 2FA enforcement gate via `enforce_admin_2fa` middleware (`KUJA_ENFORCE_ADMIN_2FA=true`) | `df0fbca` |
| 13.32 | Real Redoc HTML at `/api/admin/api-docs/html` — synthesizes OpenAPI 3.0 from url_map + serves via Redoc CDN | `df0fbca` |
| 13.33 | Saved-searches model + CRUD + `/reorder` endpoint | `df0fbca` |

### 2026-05-06 — Phase 13 batches 36-38: UI polish + AI overlay + 2FA

| Sub-phase | What | Commit |
|---|---|---|
| 13.25 | EditableExtractionList primitive — donor edits AI-extracted reporting requirements + indicators in grant wizard (provenance badges: AI / AI-edited / You) | (batch 36) |
| 13.26 | NGO clarification notes on AI document analysis (3 new doc columns + PATCH endpoint + DocumentClarificationPanel UI) | (batch 36) |
| 13.7-ui | RiskRegister component — inline status, response drawer, severity-tinted left borders | (batch 36) |
| 13.15-wire | TwoFactorNagBanner mounted in app shell layout | (batch 36) |
| 13.16-wire | ChangelogButton mounted in header next to language picker | (batch 36) |
| 13.17-wire | KeyboardShortcutOverlay mounted globally (Cmd/? to open) | (batch 36) |
| 13.18-ui | `<EntityCommentsThread>` polymorphic, drops into any entity detail page | (batch 37) |
| 13.27 | ComplianceSnapshot model + write_daily_snapshots() in scheduler + `<ComplianceTrajectoryChart>` + `slips_below_at_risk_in_days` field | (batch 37) |
| 13.28 | `add_ai_narrative()` overlay on compliance health, 6h cache, gated by `ai.compliance_health_narrative` flag | (batch 37) |
| 13.15-ui | Full TOTP enrollment UI at `/admin/security/` — QR + 6-digit input + recovery code download + disable | (batch 38) |
| 13.4-tool-use-3 | check_submission_readiness · check_report_readiness · estimate_applicant_burden migrated to `_call_claude_tool` | (batch 38) |

### 2026-05-06 — Phase 13 hotfix batch (post-team-retest)

| Sub-phase | What | Commit |
|---|---|---|
| 13.10-fix | `/api/admin/ai-spend` 500 fix (column name mismatch — was `input_tokens`, schema is `tokens_in`) | (this batch) |
| 13.21 | CRON_SECRET auto-generated per-process fallback at boot | (this batch) |
| 13.22 | extract-evidence empty-state when grant has no criteria (UI callout + API `reason: 'no_criteria'`) | (this batch) |
| 13.23 | One-shot retry on transient 5xx for idempotent GET requests (silences single-502 console noise) | (this batch) |
| 13.24 | Second-wave flag flip: `ai.grant_brief_generator`, `ai.compliance_preempt`, `ai.cross_grant_patterns`, `ui.preview_as_reviewer`, `ui.live_drafters_pill`, `ui.audit_trail_tab` defaulted ON | (this batch) |

### 2026-05-06 — Phase 13 PMO transfer (9 batches, 20 sub-phases)

| Sub-phase | What | Commit |
|---|---|---|
| 13.1 | AI timeout contract (SDK 300s, heavy ≤240s) | `f1076bb` |
| 13.2 | Native PDF fallback for scanned documents | `f1076bb` |
| 13.3 | Validation primitive layer (`app/utils/validation.py`) | `f1076bb` |
| 13.4 | Forced tool-use helper `_call_claude_tool` | `f1076bb` |
| 13.5 | Two-phase intake lifecycle (8 columns + polling endpoint) | `a86aa9a` |
| 13.6 | Inline status changes on applications + reports | `a86aa9a` |
| 13.7 | Risk register workflow (model + 5 routes + counts ribbon) | `1d3a3f7` |
| 13.8 | 4-pillar grant compliance health + `<WhyThisScoreDialog>` | `1d3a3f7` |
| 13.9 | AI conversational agent ("Ask Kuja") + 8 read-only tools | `6b40fa8` |
| 13.10 | Admin self-service: `/system-health` + 4 sister pages | `bbdb735` |
| 13.11 | Named rate-limit policies (10 policies, in-memory bucket) | `53df143` |
| 13.12 | Hash-chained tamper-evident audit log | `53df143` |
| 13.13 | CSP refinement (block-all-mixed-content, worker-src, etc.) | `53df143` |
| 13.14 | GDPR right-to-be-forgotten endpoint | `53df143` |
| 13.15 | TOTP 2FA + 10 recovery codes + nag banner | `e1cfb43` |
| 13.16 | In-app changelog (Sparkles button + RECENT_RELEASES) | `4ae1528` |
| 13.17 | Keyboard shortcut overlay (Cmd/?) | `4ae1528` |
| 13.18 | Polymorphic comments + @mentions resolver | `4ae1528` |
| 13.19 | AI mock harness (env-gated) for CI failure-path testing | `bf51959` |
| 13.20 | Logic invariant suite (35 checks, gated in smoke runner) | `bf51959` |

### 2026-04-28 — Phase 12 stale-build auto-reload | `27fb1f6`

### 2026-04-28 — Phase 11 polish-pass for category-defining (6 moves)

| Sub-phase | What | Commit |
|---|---|---|
| 11.1 | Localized ComplianceState (CLEAR/CONFIRMED/etc. across 6 locales) | `44fe2ee` |
| 11.2 | Org memory transparency ("Drew on N facts from your memory") | `44fe2ee` |
| 11.3 | Reviewer decision-changers + per-criterion paste | `44fe2ee` |
| 11.4 | Report pre-flight: each fix maps to a donor concern | `44fe2ee` |
| 11.5 | NGO coaching tone refresh | `44fe2ee` |
| 11.6 | This-Week deep-links to specific entities | `44fe2ee` |

### 2026-04-27/28 — Phase 10 category-defining sprint (12 sub-phases)

See `docs/i18n_review_targets.md` for the full Phase 10 ledger; head
commits in this window are `e5e73cd` (flag flip), `90b923a` (visibility
fixes), `643f543`, `a727426`, `987be01`, `d169b2d`.
