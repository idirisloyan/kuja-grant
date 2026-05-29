# NEAR — Living Backlog

> Single source of truth for what's outstanding on the NEAR Network
> tenant of the Kuja Grant Management platform. Maintained alongside the
> code: every commit that *defers*, *picks up*, or *completes* an item
> here must update this file in the same commit.
>
> See also: [NEAR_DNS_SETUP.md](NEAR_DNS_SETUP.md), `test_near_uat.py`,
> `seed_networked_funds.py`.

---

## High priority

### Set up a real domain for NEAR
- **last_touched:** 2026-05-28
- **Why:** Team is bookmarking `?network=near` on the Railway URL during
  UAT. Not a long-term answer — the moment a NEAR user signs in from a
  link without the query string they land in Kuja and get confused.
  Documented in [NEAR_DNS_SETUP.md](NEAR_DNS_SETUP.md) (Option A
  `near.kuja.org`, Option B `app.near.ngo`, Option C both).
- **Action:** Pick option, coordinate the CNAME/A record with whoever
  owns the parent domain, add the hostname to the `near` network's
  `host_aliases` (admin can do this via `PUT /api/network/<id>/host-aliases`).

### Configure email transport on Railway
- **last_touched:** 2026-05-28
- **Why:** `_notify_membership_decision` in
  `app/routes/network_membership_routes.py` is wired but Railway has no
  `SENDGRID_API_KEY` or `SMTP_HOST` set (confirmed in memory). Approve
  + reject emails log only — NGOs aren't actually told. Same goes for
  every other transactional surface that calls `EmailService.send()`.
- **Action:** Pick a transport (SendGrid free tier ≤ 100/day or any
  SMTP relay), set the env var on Railway, redeploy. No code change.

### Schedule the weekly Crisis Monitoring Report draft cron
- **last_touched:** 2026-05-28
- **Why:** The endpoint exists at `POST /api/cron/crisis-monitoring-draft`
  but no external scheduler invokes it on Railway. NEAR's design calls
  for a weekly OB cadence — currently a human has to remember to
  create + publish each Monday.
- **Action:** Add a Railway Cron Job (or a GitHub Actions workflow on
  a `0 6 * * 1` cron) that POSTs to that endpoint with a shared
  `CRON_SECRET` bearer token. Then `_seed_rich` no longer has to be
  the substitute.

### Send shortlisted NGOs an invitation email on release-applications
- **last_touched:** 2026-05-28
- **Why:** `POST /api/declarations/<id>/release-applications` flips the
  auto-created grants from `draft` → `open` and sets
  `applicants_notified_at`, but doesn't actually email the shortlisted
  NGOs. They learn about the opportunity only when they next sign in.
  Same blocker as the membership-decision email (no transport set).
- **Action:** After flipping grants, iterate the shortlisted org IDs,
  resolve their NGO-role users, and `EmailService.send()` an
  invitation pointing at the grant URL. Mark each grant's
  `published_at` so the timestamp doesn't drift if release is re-run.

### Per-network Oversight Body role (separate from platform admin)
- **last_touched:** 2026-05-28
- **Why:** Today the OB's actions (declaration signing, grant approval,
  trust process, membership review) are gated on the `admin` role —
  which conflates two distinct concepts: platform super-user (Adeso
  staff who run Kuja) and OB member (peer-elected NEAR member who
  governs the Change Fund). The IKEA Concept Note is explicit that
  the OB is "composed of peer-elected leaders from NEAR member
  organizations" — they're NGO members of the network, not platform
  admins. The Phase 43C ledger now makes this gap visible (every
  audit row reads "by admin@kuja.org" instead of the actual OB
  member's name).
- **Action:** Add `is_oversight_body: bool` (or `ob_role: enum`) on
  `NetworkMembership`. Users at OB-member orgs gain OB permissions
  in that network (sign declarations, approve memberships, run trust
  process, approve grants) on top of their NGO-member role. Backend
  permission check in a new `@ob_required` decorator that walks
  user → org → NetworkMembership → is_oversight_body in the active
  network. Frontend: signer-picker on declarations only shows OB
  members; sign / approve buttons gate on it; declaration ledger
  shows actual OB member names.

### Make seeded memberships land in `under_review`
- **last_touched:** 2026-05-28
- **Why:** Demo memberships from `seed_networked_funds.py --rich` are
  created via `admin-create` in status `pending`. That's "draft" — the
  OB never sees them in the review queue. Demo only shows "0 awaiting
  review" because of this gap.
- **Action:** Either extend `admin-create` to accept an initial status
  (admin override), or have the seed link a stub capacity assessment
  and call `submit_for_review` so transitions land at `under_review`.

---

## Medium priority

### Browser-verify TOTP enrol with a real authenticator
- **Why:** Phase 39 polished the secret formatting, auto-focus, Enter
  submission, and "Open in authenticator" link. Local Flask dev lacks
  `pyotp` so the enrolling view never renders locally; prod has it but
  no team member has clicked through end-to-end.
- **Action:** Admin signs in to prod, navigates to /admin/security,
  enrolls a real device (Authy / Google Authenticator), confirms the
  verify input works on Enter, downloads recovery codes, signs out and
  back in to confirm the gate.

### Browser-verify WebAuthn declaration sign
- **Why:** Phase 39 added `verify_assertion_for_user` so
  `reauth_service._verify_webauthn` no longer fails closed. Nobody has
  signed an emergency declaration with WebAuthn end-to-end yet — the
  multi-sig demo uses `manual_admin` to avoid the hardware step.
- **Action:** Enroll a WebAuthn credential on /admin/security, create
  a draft declaration, sign one slot via WebAuthn (front-end must call
  `/authenticate/begin` then post the assertion to the signature route).

### Verify capacity-assessment auto-link on prod
- **Why:** The helper is loaded in `app/routes/assessments.py` and the
  smoke confirms it exists, but no NGO has actually completed a fresh
  assessment under an open membership on prod to confirm the FK fills
  in.
- **Action:** Pick a test NGO with no membership in NEAR, apply via
  /network/join, take the capacity assessment, then check the
  membership detail page — `Capacity` column should show an ID, not
  "missing".

### Browser-test the application AI panel on a real network grant
- **Why:** Routes mounted, JSX wired, chunks deployed — but no donor
  has clicked "Run scorer" or "Classify" on a real application.
- **Action:** Sign in as admin on prod, open one of the 3 grants
  under the active declaration, "Run scorer" against the rubric,
  paste a budget into the classifier, confirm output renders.

### Backfill Sahel + South Sudan crisis rows
- **Why:** The Phase 39 seed adds these rows in step `[6b]` before the
  crisis report is published. Prod's current crisis report was
  published before this change shipped, so the rows aren't there. The
  rows endpoint 409s on a published report and there's no unpublish
  API.
- **Action:** Either build a `/api/crisis/reports/<id>/unpublish`
  admin route (gated, with audit anchor) and re-seed, or accept
  the gap and let next week's fresh report carry the variety.

### Pin the membership listing route shape
- **Why:** Two places had `/api/network/membership/?status=` which is
  a 404 — the actual route is `/api/network/membership/pending`. Fixed
  in Phase 39, but anyone else using the API might still hit the
  wrong path. Worth a route-alias or an OpenAPI doc.
- **Action:** Decide whether to add a `GET /api/network/membership/`
  alias that delegates to pending, or expose this in a single API
  reference doc the team can find.

---

## Low priority

### Render a real QR code on TOTP enrol
- **Why:** Today admins copy the secret or click the `otpauth://`
  URI. A QR is the conventional UX. Phase 39 deferred this because
  adding `qrcode.react` is a new dep and the secret/URI path works.
- **Action:** Either bundle a tiny inline QR encoder (~5 KB), or add
  `qrcode.react` to package.json, render below the secret block.

### Localise the NEAR onboarding tour
- **Why:** The 4 NEAR tour steps are hard-coded English literals in
  `tour-provider.tsx` (Phase 39 ships them un-translated because UAT
  is English-only). The Kuja tour uses i18n keys.
- **Action:** Move the strings to `i18n/en.json` under `tour.near.*`,
  translate to the 6 supported locales (sw, so, ar, fr, es, en).

### Trim the stale `.claude/launch.json` entry
- **Why:** Contains a `near-prod-redirect` config pointing at a
  `Temp-near-preview` directory that may not exist (artifact of an
  abandoned experiment). Left in working tree, intentionally
  excluded from the Phase 39 commit.
- **Action:** Either delete the entry or revert the file with
  `git checkout .claude/launch.json`.

### Enforce a `/submit` latency budget in CI
- **last_touched:** 2026-05-28
- **Why:** Phase 40 silently pushed the endpoint to ~22 seconds because
  two AI calls (budget classifier + rubric scorer) were inline. That
  broke every browser-side test runner with a default <10s timeout —
  the team only caught it during the May-28 retest. We'd like the
  next regression to fail loudly in CI rather than during UAT.
- **Action:** Add a perf check to `test_near_uat.py` (or a separate
  perf smoke) that asserts a typical `/submit` round-trip lands in
  under (say) 1500ms against local Flask, with a higher budget for
  prod. Tripwire if it regresses past 5s.

### Decision-email template + branding
- **Why:** The approve/reject email body is a plain-text 4-line
  paragraph signed by "{network_name} secretariat". Works but
  unsophisticated. No HTML, no logo, no link back to the dashboard.
- **Action:** Add a templating step (Jinja or just an HTML string)
  with NEAR brand color and a "View your dashboard" CTA. Defer
  until the email transport is live.

---

## Operational TODOs (things the team owes the system)

- [ ] Coordinate DNS for the NEAR domain (high — see above)
- [ ] Set `SENDGRID_API_KEY` or `SMTP_*` env vars on Railway
- [ ] Train NEAR OB on the operator console (`/dashboard` + `/admin/network-memberships`)
- [ ] Send the team `?network=near` bookmark + the demo accounts list
- [ ] After UAT round 2, decide whether to formalise NEAR roles
      (per-network OB role from Phase 38 design — currently admin-only)

---

## Explicitly declined

*(empty — add items here as the team decides not to build them, with the date and reason)*

---

## Completed (rolling log, newest first)

- **2026-05-28** Phase 43 — Closed-network operations (3 features
  from the design conversation):
  **A. In-app messaging** (commit `ac09493`) — TenantMessage +
  TenantMessageRead models. Scopes: network / country / org /
  declaration. Secretariat composes at /messages, members read in
  inbox (unread badge + audit anchor). Every send writes an
  AuditChainEntry so secretariat comms live in the same tamper-
  evident chain as declarations. Interim channel until email
  transport is wired.
  **B. NGO feedback** (same commit) — MemberFeedback model with
  categories (process / system / decision / support / suggestion /
  other) and statuses (open / in_review / addressed / closed).
  /feedback page: NGOs file + see own, secretariat sees inbox +
  responds inline. Closes the Concept Note's risk pillar 4 gap.
  Note: URL collision — new routes mounted at /api/member-feedback
  because /api/feedback was already the Phase 31A micro-survey
  ingest blueprint.
  **C. Declaration process timeline** (same commit) — new GET
  /api/declarations/<id>/ledger transforms the existing
  AuditChainEntry rows into a human-readable narrative
  (drafted → submitted → signed by X declaring no COI via TOTP →
  recused by Y for reason Z → activated, 2/2 signed, 72h opened →
  3 grants auto-created → applications released). DeclarationLedgerPanel
  at the top of /admin/declarations/[id]. Surfaces the audit trail
  the team was asking to see "in human form."

  Sidebar (NEAR tenant only): NGO sidebar gains Messages + Feedback
  items; admin sidebar gains Messages + Member feedback (inbox).

- **2026-05-28** Phase 42 — Team UX feedback closeout:
  (1) Dashboard tile drill-in hangs fixed — `useRouteId` helper
  rescues the dynamic id segment from the static-export fallback for
  /admin/{declarations,crisis-monitoring,network-memberships}/[id] +
  /admin/windows/[id]/report (commit `dbe96c6`).
  (2) NEAR operator dashboard reorganised as Fund → Window tree. Flat
  4-tile layout replaced with: a cross-cutting attention strip
  (pending members + crisis monitoring), then a collapsible FundTree
  showing each Fund and its Windows with live stats (declarations
  active/draft, grants total, NGOs reached, countries, 72h hit rate
  per window). Scales to N funds without restructure (commit `ebf875c`).
  (3) Registration checks consolidated into Trust Profile. New
  `<RegistrationPanel>` at the top of /trust shows identity basics +
  latest verification + AI confidence + finding count + drill-in to
  the full registry workflow. Sidebar 'Registration checks' link
  removed (donor + admin); banner added to /verification pointing
  users to /trust as the canonical view (commit `1119416`).
- **2026-05-28** Phase 41 — Reliability + regression closeout flagged
  in the May-28 retest. Three fixes:
  (1) `/submit` latency cut from ~22s to ~140ms by switching the hard
  gate to a deterministic keyword classifier (`classify_budget_direct_to_community_fast`)
  and moving the AI rubric scorer to a background task via
  `submit_task`. Unblocks browser flows + test suites that were
  timing out (`test_e2e.py`, `test_e2e_final.py`,
  `browser_test_strict.py`).
  (2) Fixed silent defect in the membership trust-process route:
  `AdverseMediaScreening(...)` was being called with `screening_date=`
  + 5 other invalid kwargs; the catch-all `except` swallowed the
  TypeError and the route returned 200, hiding the failure. Now uses
  the canonical model shape (`screened_at`, `set_subjects`,
  `set_findings`, `set_summary`) — matches `/trust/adverse-media`.
  Error responses now surface `ok: false` so callers see the failure.
  (3) `ScoreBreakdownService.compute` — the early-return `no_criteria`
  shape was missing `reviewer_count`, `overall_human_score_computed`,
  `strongest_criteria`, `weakest_criteria`. Frontend reads these
  unconditionally so the missing fields crashed the score breakdown
  card. Now shape-stable across all three return paths. Commit pending.
- **2026-05-28** Phase 40 — Auto-rubric-score + direct-to-community hard
  gate on `/submit` for network grants. Added `ai_rubric_result_json`
  + `budget_lines_json` columns to `applications` (bootstrap ALTER +
  Alembic migration `v660`). NGO-facing budget panel on the
  application detail page. PUT route accepts `budget_lines`. Commit `f22c34b`.
- **2026-05-28** `5c16c1f` — Phase 39 NEAR polish (10 items):
  login CTA, tenant-aware strings, capacity-assessment auto-link,
  membership decision emails, application AI panel, TOTP polish,
  WebAuthn assertion wrapper, NEAR onboarding tour, seed enrichment,
  16-check UAT smoke.
- **2026-05** Phase 38 — 7 AI surfaces (rubric scorer, budget
  classifier, membership brief, crisis draft, declaration draft,
  window report narrative, pattern detector). Pre-Phase-39; commits
  predate this backlog.
- **2026-05** Phase 37 — Window reporting + Monitoring Visits.
- **2026-05** Phase 36 — Emergency declarations + multi-sig + COI.
- **2026-05** Phase 35 — Crisis Monitoring Report.
- **2026-05** Phase 34 — Funds + Windows + Evaluation Rubrics.
- **2026-05** Phase 33 — Network membership flow + OB review.
- **2026-05** Phase 32 — Multi-tenant foundation (Network model,
  host-alias resolver, X-Network-Override, tenant brand context).
