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

_None open. Last sweep on 2026-05-06 closed all open high-priority
items. New high-priority work should land here with a clear "Why"
section before any code is written._

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
when done.

- [ ] Set `CRON_SECRET` in Railway env for multi-worker stability
  (32-char token). *As of Phase 13.21 the app auto-generates a
  per-process fallback at boot if missing, so /admin/system-health
  no longer warns — but multi-worker prod needs an env-set value
  so all workers share the same secret.*
- [ ] Set `REDIS_URL` (or `RATE_LIMIT_REDIS_URL`) in Railway env so
  the Phase 13.35 Redis-backed rate limiter activates. Without it,
  rate limits are per-Gunicorn-worker (effectively N× looser) on
  multi-worker prod. Falls back to in-memory automatically — no
  outage if the env is unset.
- [ ] Set `KUJA_AI_BUDGET_USD_30D` in Railway env (default $250) if
  the team wants the AI-spend forecast banner to fire `over_budget`
  at a different threshold.
- [ ] Confirm `OPENSANCTIONS_API_KEY` is current. Live sanctions
  primary feed; falls back to direct UN/OFAC/EU CSVs if missing.
- [ ] Decide hard-2FA enforcement date (proposed 2026-05-29). Flip
  `KUJA_ENFORCE_ADMIN_2FA=true` in Railway env on the chosen date.
- [ ] First native-speaker review batch — assign reviewers per locale.
- [ ] Decide whether to enable per-tenant audit retention windows
  (current implementation is global). If yes, swap to a row in
  `feature_flag_overrides` keyed by `org_id`.

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
