# Kuja Grant — Living Backlog

**Created:** 2026-05-06
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

### ~~Wire the Phase 13 polish components into the app shell~~ ✓
**Done batch 36 (`2026-05-06`):** TwoFactorNagBanner mounted above app
shell · ChangelogButton in header · KeyboardShortcutOverlay global ·
AskAI shipped via the existing copilot rail (header sparkle button).

### ~~Risk register UI~~ ✓
**Done batch 36 (`2026-05-06`):** `<RiskRegister>` component with
inline status dropdown + response_md drawer + owner/due display.
Drops into any application/grant detail page.

### Tool-use migration on the top 5 extractors
**Why:** PMO's lesson that schema-validated forced tool-use eliminates
JSON-parsing failure paths. Helper exists at
`AIService._call_claude_tool` (Phase 13.4); each extractor needs a
focused mechanical migration with side-by-side regression coverage.
Targets, in priority order:
1. `draft_application` — most-traffic, complex schema
2. `check_submission_readiness` — pre-submit pre-flight, high visibility
3. `check_report_readiness` — same, for reports
4. `generate_reviewer_summary` — reviewer-time-saving signature surface
5. `estimate_applicant_burden` — donor pre-publish critique
- **Pair with:** logic invariant test that flags any new extractor
  using prompt-and-parse.
- `last_touched: 2026-05-08`

### Wire the Phase 13 polish components into the app shell
Components exist but aren't mounted yet:
- `<TwoFactorNagBanner>` → into `(app)/layout.tsx` above the header
- `<ChangelogButton>` → into the header next to the language switcher
- `<KeyboardShortcutOverlay>` → mounted at the app root (renders globally)
- `<AskAIPanel>` → wired as a slide-over via the existing co-pilot
  rail toggle, OR as a dedicated header button
- **Estimated:** half a session.
- `last_touched: 2026-05-08`

### Risk register UI
Backend at `/api/risks/*` is complete (Phase 13.7). UI needed:
- `<RiskRegister>` component for application/grant detail pages —
  list with severity-colored left borders + status dropdown +
  `<RiskResponseDrawer>` for response_md / owner / due_date editing
- "Awaiting your response" badge on the donor dashboard sourced
  from `/api/risks/awaiting-response`
- `last_touched: 2026-05-08`

### Comments + @mentions UI
Backend at `/api/comments/*` is complete (Phase 13.18). UI needed:
- `<EntityCommentsThread>` component that drops into application,
  grant, report, and risk detail pages
- @mention auto-completion in the textarea (resolves against
  visible org members)
- Notifications panel surfaces mention-kind notifications
- `last_touched: 2026-05-08`

### Daily compliance health snapshots cron
Phase 13.8 ships on-demand calculation. The trajectory chart +
30-day forecast (PMO's "slips in N days" badge) needs:
- New `compliance_health_snapshots` table: `grant_id, date, score, band,
  pillars_json`
- Cron job (extend the existing notification scheduler) writes one row
  per active grant per day
- `<ComplianceTrajectoryChart>` component — sparkline of last 60 days
- Linear-regression forecast → "slips below at-risk in N days" badge
- `last_touched: 2026-05-08`

### Web push via VAPID
Currently @mention notifications fire to the in-app `Notification`
table only. Web push for the marketplace's collaboration moment
(donor reviewer @mentions NGO program officer) requires:
- `pywebpush` dependency
- VAPID key generation + Railway env config (3 keys: public, private, subject)
- Service worker registration in the frontend
- `push_subscriptions` table for endpoint storage
- Subscribe / unsubscribe routes
- `last_touched: 2026-05-08`

---

## Medium priority

### `/admin/security/` enrollment UI for TOTP 2FA
Backend complete (Phase 13.15). UI needed:
- QR code rendering from `provisioning_uri` (use `qrcode.react` or inline SVG)
- 6-digit code input with auto-submit
- Recovery codes display with one-time download
- Disable flow with current-code verification
- `last_touched: 2026-05-08`

### Hard 2FA enforcement gate
Soft enforcement (banner) shipped Phase 13.15. After ~3 weeks of
nag, flip to a middleware gate that:
- 401s any admin write action when `totp_enabled=False`
- Allows reads + the `/admin/security/` enrollment flow
- Surfaces clearly in the UI ("complete 2FA enrollment to continue")
- **Trigger date:** 2026-05-29 (3 weeks after batch 32 deploy)
- `last_touched: 2026-05-08`

### Donor + reviewer "What Needs You" panels
Phase 10.6 shipped `<ThisWeekHome>` for NGOs. Same pattern needed for:
- **Donor**: applications awaiting decision + grants with overdue
  reports + risks awaiting response (sourced from existing
  `/api/risks/awaiting-response` + `donor_portfolio_insights`)
- **Reviewer**: assigned applications + recently-edited applications
  in their queue
- Reuse the action-card visual vocabulary from ThisWeekHome.
- `last_touched: 2026-05-08`

### AI narrative layer on compliance health
Phase 13.8 ships rule-based 4-pillar score. PMO's enhancement:
1-2 sentence Haiku-generated narrative cached 6h per grant per
score. Falls back to rule-based if AI offline. Adds a `summary`
field on the response.
- Use Haiku 4.5 (cheap), not Sonnet
- Cache key: `(grant_id, score, date_bucket)`
- `last_touched: 2026-05-08`

### Real Redoc HTML page at `/admin/api-docs`
Phase 13.10 ships a route catalog as JSON. PMO's pattern was a
proper `/api/v1/openapi.json` + Redoc CDN bundle. To do this
properly we'd need:
- `@doc()` decorators on every route OR an OpenAPI generator
  walking Flask's url_map + introspecting handler signatures
- A small HTML page that loads `redoc-standalone.js` from CDN
- `last_touched: 2026-05-08`

### Audit retention pruning in the notification scheduler
Phase 13.10 exposes the config endpoint. Actual prune logic
needs to:
- Read `KUJA_AUDIT_RETENTION_DAYS` from env (default 365)
- Run nightly via the existing notification scheduler
- Delete `ai_call_logs`, `audit_chain` (only after confirming
  hash-chain re-anchor strategy), `notifications` (read + older)
- Write a marker row showing rows pruned per table
- `last_touched: 2026-05-08`

### Native-speaker translation review pass
Phase 6.1 shipped `docs/i18n_review_targets.md` listing priority
namespaces flagged for native-speaker review across ar/sw/so/fr/es.
Awaiting the human reviewers. When the first batch comes back:
- Build the `frontend/scripts/update_translations.py` 30-line merge
  script (planned but not written — see audit doc for invocation)
- Apply annotations and ship
- `last_touched: 2026-05-06`

### Redis-backed rate limiter
Phase 13.11 ships in-memory token bucket. Multi-worker production
on Railway means each Gunicorn worker has its own bucket — limits
are effectively per-worker, not per-user. Redis swap:
- Add `redis-py` connection helper (dep already in requirements.txt)
- Replace `_buckets: dict` with a Redis sorted-set per (policy, scope)
- One-file change inside `app/utils/rate_policies.py`
- `last_touched: 2026-05-08`

### CSP nonce-based replacement of `'unsafe-inline'`
Phase 13.13 tightened CSP but kept `'unsafe-inline'` on
`script-src` because Next.js static export needs it for hydration
bootstrap. Build-time SHA-256 hashes of inline scripts → CSP
`script-src 'self' 'sha256-...'`. Estimated 1-2 sessions.
- `last_touched: 2026-05-08`

---

## Low priority

### Saved searches with drag-reorder
PMO Section 11.4. Native HTML5 drag-and-drop, no library install.
`saved_searches` table with `sort_order` column. Reorder action
updates `sort_order` to the new array index in a single transaction.
Useful for donors with many filtered grant lists.
- `last_touched: 2026-05-08`

### Onboarding tour per role
Phase 8 already shipped a basic tour-provider. PMO's pattern: 4
per-role scripts (NGO / donor / reviewer / admin), localStorage-
tracked completion, library-free overlay + tooltip. Audit existing
tour and extend if shallow.
- `last_touched: 2026-05-08`

### UAT fixture self-healing cron
PMO ran a daily `/api/cron/uat-fixtures` to ensure demo states
exist (≥ 1 grant in every band, 1 report needing pre-flight, etc.).
Kuja's single-tenant prod hasn't seen the marker-row drift PMO hit
in their multi-tenant prod. Revisit if/when QA starts complaining
that demo data has drifted.
- `last_touched: 2026-05-08`

### Polymorphic FK lint
PMO had a Prisma-query lint that flagged any query against
polymorphic tables filtering on `contract_id` XOR `sop_id` without
a `// polymorphic-fk: <reason>` justification comment. No
polymorphic splits currently in flight at Kuja (`Risk`,
`EntityComment`, `OrgMemory` are polymorphic but use `subject_kind` +
`subject_id` patterns rather than dual-FK columns). Revisit if a
similar split lands.
- `last_touched: 2026-05-08`

### Workflow configurator
PMO had a generic configurable workflow engine (parallel review
groups, COI gates, sign-off ledger, flowchart preview). Kuja's
review flow is currently single-reviewer per application.
Multi-reviewer + COI gates would matter for high-stakes donors.
- `last_touched: 2026-05-08`

### "Slips in N days" forecast badge
Pairs with the daily compliance health snapshots cron (above).
Linear regression against last 30 days projected forward 30 days;
when forecast crosses below the at-risk threshold, render badge.
- `last_touched: 2026-05-08`

### AI cost forecasting
Phase 13.10's `/admin/ai-spend` shows historical day-buckets.
Forecast next-30-day spend based on trailing average + alert
admins when projected spend crosses a budget threshold.
- `last_touched: 2026-05-08`

---

## Operational TODOs

These are manual things the team owes the system. Strikethrough
when done.

- [ ] Set `CRON_SECRET` in Railway env for multi-worker stability
  (32-char token). *As of Phase 13.21 the app auto-generates a
  per-process fallback at boot if missing, so /admin/system-health
  no longer warns — but multi-worker prod needs an env-set value
  so all workers share the same secret.*
- [ ] Confirm `OPENSANCTIONS_API_KEY` is current. Live sanctions
  primary feed; falls back to direct UN/OFAC/EU CSVs if missing.
- [ ] Decide hard-2FA enforcement date (proposed 2026-05-29).
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
- `/admin/ai-spend` — day-bucket cost; alert if any single day > $50
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

---

## Completed (rolling log)

Newest first. Drop entries older than 90 days.

### 2026-05-06 — Phase 13 batch 36: AI-extract editability + UI mounts

| Sub-phase | What | Commit |
|---|---|---|
| 13.25 | EditableExtractionList primitive — donor edits AI-extracted reporting requirements + indicators in grant wizard (provenance badges: AI / AI-edited / You) | (this batch) |
| 13.26 | NGO clarification notes on AI document analysis (3 new doc columns + PATCH endpoint + DocumentClarificationPanel UI) | (this batch) |
| 13.15-wire | TwoFactorNagBanner mounted in app shell layout | (this batch) |
| 13.16-wire | ChangelogButton mounted in header next to language picker | (this batch) |
| 13.17-wire | KeyboardShortcutOverlay mounted globally (Cmd/? to open) | (this batch) |
| 13.7-ui | RiskRegister component — inline status, response drawer, severity-tinted left borders | (this batch) |

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
