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

### Set the CRON_SECRET GitHub repo secret (closes Crisis Monitoring cron)
- **last_touched:** 2026-05-28
- **Why:** Phase 44B added `.github/workflows/cron-crisis-monitoring.yml`
  on a `0 6 * * 1` schedule (Mondays 06:00 UTC). The workflow needs
  the `CRON_SECRET` repo secret to match the Railway env var. Until
  that secret is set, the workflow runs but fails authentication with
  a 403 from the cron endpoint.
- **Action:** GitHub → Settings → Secrets and variables → Actions →
  New repository secret → `CRON_SECRET` = value matching the
  Railway env var. (Optional `PROD_BASE` if the URL changes.) After
  setting, trigger the workflow manually (Actions tab → "Weekly
  Crisis Monitoring Report draft cron" → Run workflow) to verify.

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

### Retire the platform-admin shortcut in `is_oversight_body_member()`
- **last_touched:** 2026-05-28
- **Why:** Phase 44C swapped every governance endpoint to
  `@ob_required`. The decorator currently allows platform admin
  through as a legacy shortcut so existing flows kept working during
  rollout. Once the secretariat has flagged the actual OB roster
  via the new `<OversightBodyPanel>`, that shortcut is doing more
  harm than good — a compromised platform-admin account would still
  bypass every OB gate.
- **Action:** Drop the `if user.role == 'admin': return True` block
  in `app/utils/network.py::is_oversight_body_member`. Verify the
  same flows still work (admin who *also* holds an OB seat will
  still pass; admin who doesn't will start getting 403s, which is
  the desired behaviour).

### ~~Per-network Oversight Body role (separate from platform admin)~~ — DONE Phase 44
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

- **2026-06-11** Phase 56 — top_risks populated on the operational
  rollup. Closes the Phase 52 placeholder. Pure SQL rules, no AI
  tokens, instant. Four rule families per window
  (overdue_reports / cancelled_declarations / stuck_in_review /
  ready_to_release), each tagged with severity (low/medium/high),
  sorted desc, capped at 5. WindowCard renders a tone-coded "Top
  risks" list below the OpStat strip. Browser-verified live with
  seeded conditions: "1 declaration past 6-day decision SLA" (high)
  and "1 declaration ready to release" (medium) render with the
  expected destructive + kuja-sun backgrounds and the right hints.

- **2026-06-11** Phase 55 — Grants detail retrofit +
  KujaReportsPage attention strip. Grants detail wrapped in
  PageShell with new describeGrantStatus helper (human pills:
  "Open for applications" / "In review" / "Closed" / "Awarded"),
  header with funding + deadline + countries meta, primary action
  carries Apply/Broadcast/your-app status. GrantAgreementUnpackPanel
  and AIChatPanel pushed into PageDetail collapsibles. Kuja Reports
  list (the donor + marketplace NGO path) wrapped in PageShell with
  an attention strip ("5 reports overdue" / "N due in next 7 days").
  Browser-verified.

- **2026-06-11** Phase 54 — Applications detail anatomy retrofit.
  Brief: summary first, BUDGET SECOND, AI assist in collapsible,
  audit/history below. NgoBudgetPanel promoted from the very bottom
  of the page to position 2 (immediately after the "Where this
  stands" summary). NetworkAiPanel + AIChatPanel + ReviewerFollowups
  + PanelCalibration + MicroSurvey all moved into PageDetail
  collapsibles -- supporting, not dominant. Status pill uses
  describeApplicationStatus: "Submitted -- awaiting review" not
  raw "submitted". Browser-verified live on USAID East Africa WASH
  Program (application #1, fatima@amani.org viewer).

- **2026-06-11** Phase 53 — Reports detail page anatomy retrofit. Per
  brief: top = due date · status · score · next action; sections;
  collapsibles below. New shape:
  - PageShell + PageHeader with the title, FileText icon, human-language
    status pill (Draft / Submitted -- awaiting review / Accepted /
    Rejected -- revise / Overdue), meta strip (grant · period · due ·
    submitted · attachments · AI compliance score).
  - PageAttention computes the next action from the report's status:
    revision_requested -> "Revisions requested" (bad) with reviewer
    notes inline; draft + overdue -> "Overdue by N days" (bad); draft
    + due in <=7 days -> "Due today / in N days" (warn); draft otherwise
    -> "Continue drafting" (accent); submitted/in_review -> "Submitted
    -- awaiting reviewer decision" (info); accepted -> "Accepted"
    (good); rejected -> "Rejected" (bad) with reviewer notes.
  - Reviewer notes surface as their own section when not already in the
    attention strip.
  - AI chat + micro-survey moved into PageDetail collapsibles --
    supporting, not dominant.
  Browser-verified on Q3 2026 Financial Report (draft, due 2026-10-30):
  H1 + status pill "Draft" + attention "Continue drafting / Pick up
  where you left off — submit when ready" + AI chat collapsed +
  MicroSurvey hidden (correct: draft).

- **2026-06-11** Phase 52 — Per-window operational rollup endpoint +
  cards. Closes Phase 49's deferred gap. **Backend**: new
  `GET /api/windows/<id>/operational` returns
  `{available_budget, currency, active_declaration_count,
   open_grant_count, due_report_count, overdue_report_count, top_risks}`
  -- network-scoped, login_required. `top_risks` is a documented
  placeholder for a future AI surface. **Frontend**: new
  `useWindowOperational` hook + tone-coded `<OpStat>` tiles rendered
  at the TOP of every WindowCard so the card leads with state, not
  config. Tones: bad on overdue reports, warn on due-soon, good on
  open grants, accent on active declarations, muted on quiet.
  Browser-verified live against Change Fund / Emergency Response
  (window 160): Available 6,700,000 USD · Active declarations 1 ·
  Open grants 3 · Reports due 0.

- **2026-06-11** Phase 51 — Sweep status copy + PageShell across
  remaining list pages. Applications list: PageShell + attention strip
  for NGO viewers ("Continue N drafts", "N awaiting decision"), filter
  chips use `describeApplicationStatus.label`. Memberships list:
  PageShell + PageHeader title "NEAR Network -- Members" + attention
  strip ("N memberships awaiting your review", "N applicants missing
  capacity assessment") + row status pill via
  `describeMembershipStatus` + `TONE_PILL_CLASS`. Reports list:
  NearReportsPage retrofitted with PageShell (Kuja path deferred to
  the next reports rewrite). Crisis Monitoring detail: PageShell +
  PageBack + PageHeader with period title, human-language status pill
  (Draft / Awaiting review / Published / Archived), meta strip (rows +
  flagged + audit anchor), Publish button moves into header primary
  action slot. Browser-verified: membership list attention strip + 2
  human pills + raw_state_leaks=[].


- **2026-06-11** Phase 50 — Status copy + sweep cleanup. Shared
  `lib/status-copy.ts` helper with `describeApplicationStatus`,
  `describeReportStatus`, `describeMembershipStatus`,
  `describeDeclarationStatus` → `{ label, tone }`. Pure functions,
  trivial to unit-test. Applied to the declarations list (status pills
  read "Draft" / "Waiting for N signatures" / "Ready to release" /
  "Applications open" — no internal state codes; status filter labels
  match the human pills). Messages + Feedback pages retrofitted with
  PageShell + PageHeader. Browser-verified: pills on the declarations
  list show ["Draft", "Applications open"], `raw_state_leaks: []`.
  Applications + Reports + their detail pages can adopt the helper
  incrementally — the deeper Reports detail rewrite (1209 lines) is
  flagged for a future phase rather than rushed.

- **2026-06-11** Phase 49 — Funds & Windows + Crisis Monitoring
  redesign. **Crisis Monitoring (full rewrite):** PageShell + tabs
  Current report / Signals / History per the brief's decision-support
  shape. Current report leads with summary + top 5 flagged signals;
  long narrative hidden behind an expander. Signals tab = OB-flagged
  rows only. History = the existing list with status filter. Attention
  strip surfaces drafts/in_review reports owed a publish decision +
  flagged signals in the latest published edition. **Funds & windows
  (surgical):** PageShell + PageHeader; "New fund" moved into header
  primaryAction slot. Attention strip leads with operational state
  ("N declarations ready to release / in committee review / drafts").
  Per-window operational-state cards (budget · active · open · due ·
  risks) need a backend rollup endpoint that doesn't exist yet —
  queued as a high-priority operational TODO above. Browser-verified
  both pages.

- **2026-06-11** Phase 48 — Dashboards rebuilt around "what needs
  attention now". Four new PageShell-based role × flavor dashboards
  (Kuja donor / Kuja NGO / NEAR operator / NEAR member), each leading
  with an attention strip backed by live data + 2-4 focused work
  sections + a "More detail" collapsible that wraps the existing rich
  consoles (no functionality lost). Attention items are concrete
  counts with jump-link chips: "2 members awaiting review", "N draft
  declarations", "N reports due soon", "Continue where you left off",
  "Ready to release", etc. NEAR member dashboard specifically matches
  the brief's hardest constraint — feels like "my status / my apps /
  my reports / my messages", not "inside a giant system".
  `dashboard/page.tsx` becomes a thin router. Browser-verified both
  operator + member.

- **2026-06-11** Phase 47 — `<PageShell>` primitive + retrofit
  declarations + memberships. New
  `components/layout/page-shell.tsx` encodes the standard page
  anatomy: PageShell + PageBack + PageHeader + PageAttention +
  PageMain + PageDetail + PageDetailSection. Shared Tone vocabulary
  (muted/info/good/warn/bad/accent) drives status pills, attention
  banners, and detail icons. PageDetailSection uses native `<details>`
  for accessibility + zero JS. Declarations detail retrofitted: status
  pill now uses HUMAN copy ("Waiting for N signatures" / "Ready to
  release" / "Applications open"); ledger + SLA + audit anchor moved
  into PageDetail collapsibles; stepper stays as the live attention
  surface. Memberships detail rewritten with the brief's tabs
  (Overview / Capacity / Due diligence / Messages / Audit) + Approve /
  Reject in the header primary-action slot + attention strip for
  blockers like "Capacity assessment not yet linked". Status pill
  "Awaiting review" (not "pending"). Browser-verified both pages.

- **2026-06-11** Phase 46 — Design principles doc + nav split by flavor
  × role. Team feedback was that Kuja and NEAR should *not* share IA
  even though they share the codebase, and that the current sidebar
  exposes too much of the system's taxonomy instead of the user's
  workflow. Two deliverables:
  **(a) `docs/DESIGN_PRINCIPLES.md`** — captures the brief as the
  single referenceable source of truth (8 principles, full IA table
  for both flavors × all roles, shared page anatomy
  Header/Attention strip/Main/Detail, page-by-page direction for
  dashboards, membership review, declarations, funds & windows,
  crisis monitoring, applications, reports, messages, removal/reduce
  list, and the 7-step priority order from the brief). Every later
  phase checks against this doc.
  **(b) Sidebar refactor** — `pickNavProfile(role, isNearFlavor)`
  returns a `{ primary, secondary }` profile per flavor × role. Each
  group renders as its own `<NavGroup>` with a subtle divider between
  them; secondary group uses a lighter tone. Browser-verified end-to-
  end against the running app:
    • Kuja donor: Dashboard · Grants · Review apps · Reports · Orgs ·
      Insights | Messages · Settings  ✓
    • Kuja NGO: Dashboard · Opportunities · My Applications · Reports ·
      Organization Profile | Messages · Help & Chat · Settings  ✓
    • NEAR operator: Dashboard · Members · Declarations · Funds &
      Windows · Crisis Monitoring · Reports · Governance | Messages ·
      Feedback · Audit · Settings  ✓
    • NEAR member: Dashboard · Membership · My Applications · Reports
      | Messages · Feedback · Settings  ✓
  NEAR member nav matches the brief's hardest constraint — "they
  should not feel like they're inside a giant system: my status / my
  applications / my reports / my messages". A few hrefs point at the
  best current home until later phases ship dedicated routes:
  Insights → /dashboard?view=insights (Phase 48 will produce the real
  insights surface), Membership → /trust, Governance → /admin/audit-
  chain. Audit + Governance currently collide on the same route; they
  diverge once Phase 49 ships /governance with policy controls.
  Phases 47-50 queued in the backlog with explicit scope (PageShell
  primitive, dashboard rebuild, funds/windows + crisis-monitoring
  redesign, status-copy sweep). Frontend build green.

- **2026-06-11** Phase 45 — Declaration UX overhaul. The team's
  feedback was that declarations "don't feel completed" — no clear
  way to start one, no visible stage indicator, signer slots showed
  raw `User #N`, and the page was cluttered. Five-part fix:
  **(1) Guided creation wizard**: new `<DeclarationWizard>`
  4-step modal — pick crisis row from latest Crisis Monitoring
  report (pre-fills country/crisis_type/region), declaration
  details (fund + window + amount + severity + summary), committee
  pick from OB roster, confirm with optional submit-now. "New
  declaration" CTA on the list page header AND in the empty state
  (replaced the obscure "create from a fund window via the API"
  copy). **(2) Visual lifecycle stepper**: new
  `<DeclarationStepper>` 6-stage chevron strip (Draft → Committee
  → In review → Active → Released → Closed) with current stage
  highlighted in clay, past stages in grow-green, bad/cancelled
  in destructive red. Action-oriented "Next:" hint adapts to slot
  count and signing progress; live counter with progress bar.
  **(3) Identity-resolved signer rows**: backend
  `DeclarationSignature.to_dict()` now resolves `signer_name`,
  `signer_email`, `signer_org_name` via User + Organization
  lookups; frontend renders the name + org sub-line. No more
  `User #1`. **(4) Inline OB picker on the detail page**: new
  `<AddSignerPanel>` consumes `/api/network/membership/ob-roster`
  (one row per user at every OB-flagged org) with free-text
  filter on name/email/org/country. Filters out already-assigned
  members; shows helpful empty states. Trash-icon remove on
  pending draft slots. **(5) Simplification pass**: header trimmed
  to title + status + action button (stepper carries the counter);
  Summary + Evidence anchor merged into one Context card; Documents
  card hidden when empty; SLA card hidden until a timestamp lands;
  Signers section relabeled "Committee (Oversight Body signers)"
  with IKEA-Concept-Note context line. Browser-verified
  end-to-end against a fresh draft on the NEAR network: stepper
  visible, picker lists Fatima Hassan at Amani Community Development,
  Add → row renders "Fatima Hassan / Amani Community Development /
  pending", Fatima vanishes from the picker, "Next:" updates from
  "Add 2 more" → "Add 1 more". Frontend build green
  (`/admin/declarations/[id]` 12.4 kB).

- **2026-05-28** Phase 44C — Enforcement swap complete. Every
  governance endpoint the IKEA Concept Note attributes to the OB
  now uses `@ob_required` instead of `@role_required('admin')` —
  declaration create / submit / cancel / release / signers (×9
  total), membership pending / approve / reject / suspend /
  run-trust-process / expel (×6 total). Plus a defence-in-depth
  check on signer-slot creation: the user being assigned a slot
  must hold an OB seat in this network (or the admin must pass
  `allow_admin_override=true` for the paper-ceremony fallback).
  Sign / recuse / reject endpoints inherit the constraint via
  `_load_my_signature`. Platform admin keeps a legacy shortcut in
  `is_oversight_body_member` during rollout — flagged as a
  high-priority follow-up to retire once the OB roster is
  populated. Verified all four scenarios locally (admin OK,
  OB-flagged NGO OK, non-OB NGO 403 with err.ob_required, non-OB
  signer 400 with err.signer_not_ob). 19/19 smoke still green.

- **2026-05-28** Phase 44 — Per-network OB role + weekly Crisis
  Monitoring cron (commit `c7e6f56`).
  **A. OB role**: schema adds `is_oversight_body` + `ob_role_started_at`
  + `ob_role_ended_at` to `network_memberships`. Helper
  `is_oversight_body_member()` walks user → org → membership;
  `@ob_required` decorator returns 403 on non-OB callers. Endpoints
  to grant/revoke seats with audit anchors
  (`network.ob.seat_{granted,revoked}`). New `/ob-roster` lists
  active seats. `<OversightBodyPanel>` on
  `/admin/network-memberships/[id]` with header chip. Platform
  admin keeps the legacy shortcut so existing flows stay unbroken
  during rollout; once every actual OB member is flagged the
  shortcut retires and the existing `@role_required('admin')`
  gates can be swapped to `@ob_required` on declaration sign /
  membership approve / run-trust-process.
  **B. Weekly Crisis Monitoring cron**: GitHub Actions workflow at
  `.github/workflows/cron-crisis-monitoring.yml` on `0 6 * * 1`
  (Mondays 06:00 UTC). Reuses the cron-uat-fixtures pattern. Needs
  the `CRON_SECRET` repo secret set to match the Railway env var —
  documented as an operational TODO in the high-priority backlog.

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
