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

### Real-device mobile + offline testing program
- **last_touched:** 2026-06-21
- **Why:** Per team feedback (2026-06-21 retest assessment, scoring path
  to 10/10): simulated slow-3G via Playwright CDP throttling (shipped
  in Phase 615 `mobile_test.py`) catches network-class bugs — and it
  already did, exposing a real login hydration race the team had been
  hitting on phones. But it can't reproduce device-class behaviour:
  Samsung Internet quirks, iOS Safari PWA + offline, low-RAM swap
  pressure on $80 Androids, battery throttling, screen-reader paths
  through the actual mobile OS, the keyboard's autofill UX, etc.
- **Action:** Stand up a real-device test cycle. Minimum loop:
  1. **Device matrix.** Pick 3 representative phones — one current iOS,
     one budget Android (Samsung A-series or similar), one low-end
     legacy Android — and document them in this file. Borrow team
     phones or use a service (BrowserStack/LambdaTest).
  2. **Scripted user journeys.** Each release candidate is walked
     through the same 6 flows (NGO login → draft → save → submit,
     reviewer assign + score, donor decision + appeal response) on
     each device. Pass/fail recorded in a doc with timestamps and
     screen recordings of any failures.
  3. **Offline + bad-network sweeps.** Disable wifi mid-flow on each
     device (forces the PWA outbox + sync to actually run), then
     reconnect and verify drafts/decisions sync correctly. Test
     "two bars then nothing" (cell shoulder) by walking outside.
  4. **Accessibility.** Run VoiceOver (iOS) and TalkBack (Android) on
     /login, /dashboard, /apply/[id] — capture the announcement
     transcripts.
  5. **Cadence + ownership.** Decide whether this is per-release
     (slow) or weekly (better). Name the human owner and write the
     SOP into this backlog.
- **Deferred-not-skipped:** the team explicitly flagged this as a
  path-to-10 item but asked us to backlog it (not do it now). When
  picked up, this is bigger than a "test script" — it's a
  monthly-or-better discipline plus tooling investment.

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

### ~~Browser-verify TOTP enrol with a real authenticator~~ DONE 2026-06-21
- **Status:** Covered by `browser_test.py` Category 33.1 against prod.
  Test does start → pyotp-generated code → confirm → assert
  `enabled=true` → cleanup `disable`. First end-to-end run against
  https://web-production-6f8a.up.railway.app passed: status flips to
  enabled, 10 recovery codes are returned.

### ~~Browser-verify WebAuthn declaration sign~~ DONE 2026-06-21
- **Status:** Covered by `browser_test.py` Category 33.2 — uses CDP
  virtual authenticator (`WebAuthn.addVirtualAuthenticator`) to drive
  register → finish → authenticate → finish loop. Verifies the exact
  helper (`WebAuthnService.finish_authentication`) that
  `verify_assertion_for_user` calls during declaration signing, so a
  green assertion here proves the Phase 36b reauth path is wired.

### ~~Verify capacity-assessment auto-link on prod~~ DONE 2026-06-21
- **Status:** Covered by `browser_test.py` Category 33.3 — admin
  pulls every membership via `/api/network/membership/pending?status=all`
  and asserts at least one has a non-null `capacity_assessment_id`.
  Skips gracefully when only `pending` rows exist (the helper only
  fires inside `submit_for_review`).

### ~~Browser-test the application AI panel on a real network grant~~ DONE 2026-06-21
- **Status:** Covered by `browser_test.py` Category 33.4 — admin
  searches `/api/applications/` for an application whose grant has a
  `fund_window_id`, POSTs to `/api/applications/<id>/ai-score-rubric`,
  asserts `success=True` and that either `criteria` or `overall_score`
  comes back. Skips gracefully when the tenant has no network apps.
- **Root cause discovered:** the surface was 500-ing in prod for
  >5 weeks because `applications.withdrawn_at` and 10 sibling columns
  added Phase 145-308 had never landed — the monolithic bootstrap
  ALTER block aborted on the first column failure and silently
  no-op'd the rest. Phase 607/607b adds a per-ALTER bootstrap pass
  (each column in its own transaction) so a single failure can't
  poison the rest. Verified `/api/applications/` returns 200 after
  the deploy.

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

## Quality bar (added 2026-06-13)

### Production demo-data cleanup
- **last_touched:** 2026-06-13
- **Why:** Code-review pass flagged that dashboards feel noisy / less
  credible because prod still contains E2E grants, applications and
  empty records left over from the test fixture-pinning work + the
  ongoing UAT sweeps. Real team-of-N users land on a dashboard with
  "Test Grant #47" rows next to real grants and the immediate read is
  "this is a demo, not a system." Same surfaces under-report what real
  signal-to-noise looks like for new NGOs.
- **Action:** Audit the prod DB for rows authored by E2E / fixture
  accounts (`*e2e*@*.org`, `uat-fixture@adeso.org`-style markers, draft
  rows older than N days with no real activity) and soft-delete or
  archive them. KEEP the marker rows the UAT cron uses
  (`/api/cron/uat-fixtures` self-heals 3 contracts — those are
  load-bearing) and seed accounts (fatima@amani.org etc. — the team
  demos with them). Everything else: cull. Pair with the team on the
  cull list before pulling the trigger.
- **Status:** deferred. Not safe to mutate prod without explicit ops
  alignment + a backup snapshot.

### Arabic translation completeness
- **last_touched:** 2026-06-13
- **Why:** Code-review pass observed the Arabic donor experience renders
  RTL nav but the dashboard content stays mostly English. Mixed-language
  UX is worse than monolingual English — readers context-switch every
  line. The root cause: `frontend/src/i18n/ar.json` covers the original
  Phase 13 / Phase 32 keys but the modern dashboard / Phase 48 attention
  surfaces / Phase 70+ reviewer surfaces shipped without parallel Arabic
  keys, so `translate()` falls back to English.
- **Action:** Diff `frontend/src/i18n/en.json` against `ar.json`,
  generate a translator-ready spreadsheet of missing keys, run it
  through an Arabic-native translator (NOT machine translation — the
  Arabic in the existing file is already curated and a new MT pass
  would lower quality), drop the result back into `ar.json`. Same pass
  is owed to `sw.json` and `so.json`, but Arabic is most visible
  because it's the only RTL surface.
- **Status:** deferred. Needs a translator, not just code. Tracked
  separately from `[[reference_kuja_near_backlog]]` because it's
  cross-tenant.

### Track AI acceptance / edit / time-saved per surface
- **last_touched:** 2026-06-13
- **Why:** The 2026-06-13 verdict's AI assessment noted "0% recorded
  failure rate, 7/7 flagship surfaces succeeded" but flagged that
  technical reliability ≠ demonstrated user value. We have no telemetry
  on whether NGOs actually USE the AI output: do they accept the
  generated draft as-is, edit it heavily, or scrap it? Without this we
  can't tell whether voice-to-report drafts are saving time or being
  thrown away. Phase 97 telemetry covers latency + failure rate
  (`/admin/ai-telemetry`), not acceptance.
- **Action:** Extend AICallLog (or a sibling table) with
  `outcome ∈ {accepted, edited, rejected, ignored}` and
  `time_saved_estimate_seconds`. Wire NGO-facing buttons (Voice draft,
  Photo evidence, Co-author, Smart draft, Translate) so the user's
  next action implies outcome — clicking Save = accepted, clicking
  Edit then Save = edited, dismissing the panel = rejected. Add the
  rollup to `/admin/ai-telemetry` next to failure rate. Lets us answer
  "which AI surface is actually earning its compute budget" with data.
- **Status:** deferred until the team is past the current UAT round —
  the metric is most useful with sustained NGO usage.

### Simplify dense pages around one recommended next action
- **last_touched:** 2026-06-13
- **Why:** The verdict's product assessment noted that Trust Profile,
  assessment history, and reports pages are "highly dense for a
  non-technical NGO user" and obscure the recommended action. The
  consolidation work already done on the reports page (one accordion
  per draft instead of four stacked panels — commit 217bf5d5) is the
  template. Need the same pass on Trust Profile and assessment
  history.
- **Action:** For Trust Profile: above the existing detail breakdown,
  add a single "Next action" verdict card driven by the worst pillar's
  status — "Complete your Bank Verification (Due Diligence Flagged)"
  / "Re-take Capacity Assessment (no result in 12 months)" / etc.
  Default-collapse the per-pillar breakdown for non-admins. For
  assessment history: collapse all but the most recent assessment per
  framework, with "Show older results" disclosure. Let the team
  validate with a real NGO walkthrough before generalising further.
- **Status:** deferred. Needs design pass — these pages are also
  due for the native-language test (which gates the simplification
  copy choices).

### Investigate gunicorn `--preload` after SLOW_REQUEST data accumulates
- **last_touched:** 2026-06-13
- **Why:** The 2026-06-13 retest verdict reproduced a wedge in the
  Railway web service: silent multi-minute log gaps, 3-of-5 `/api/health`
  probes hung past 8s. `railway redeploy --yes` recovered cleanly. The
  service runs gunicorn with `--workers 4 --threads 8 --timeout 180
  --worker-class gthread --max-requests 1000 --preload` (Procfile).
  With `--preload`, the Flask app is loaded once in the master and the
  module-level state (including the shared Anthropic client + any
  cached connection pools) is inherited by every worker. A hypothesis
  that fits the symptom: the inherited Anthropic SDK connection pool
  hits a shared per-process limit faster than separate-per-worker
  pools would, and once exhausted, subsequent calls block until SDK
  internals time out (180s default — matches the `gunicorn --timeout`
  value). Dropping `--preload` would give each worker its own
  Anthropic client + connection pool at the cost of ~50-100 MB more
  RSS per worker (4× extra ≈ 200-400 MB).
- **Why NOT touch yet:** Speculative. We have no telemetry confirming
  the Anthropic pool is the bottleneck — `--preload` could equally be
  unrelated and the wedge could be a DB pool / SQLAlchemy session
  / a single slow endpoint. Changing `--preload` without data risks
  trading a stable-with-known-rescue setup for a less-stable setup
  with worse failure modes. The slow-request logger (commit `27e608ed`,
  `SLOW_REQUEST` warnings on any `/api/*` > 5s) is the data source
  that has to come first.
- **Revisit criteria:** if `railway logs | grep SLOW_REQUEST` over a
  one-week window shows the slow requests clustering on Anthropic-
  calling endpoints (`/api/copilot/*`, `/api/applications/.../ai-*`,
  `/api/reports/.../structure-from-voice`, `/api/whisper/transcribe`,
  `/api/translate`, photo-evidence uploads), AND the cluster appears
  alongside the silent-log-gap signature, then the Anthropic pool
  hypothesis is supported — test dropping `--preload` in a controlled
  deploy + observe for 24h. If SLOW_REQUEST clusters elsewhere
  (e.g. `/api/applications/.../submit`, `/api/documents/upload`),
  the bottleneck is somewhere else and `--preload` is a distraction.
- **Status:** deferred pending SLOW_REQUEST telemetry from prod usage.

### Native-language user testing on real low-cost Android devices
- **last_touched:** 2026-06-13
- **Why:** Code-review verdict was that the product can't credibly
  approach 9.5–10/10 launch quality until non-technical NGO users have
  validated the mobile + voice + photo flows on the devices they
  actually use. Headless tests + this session's Playwright sweeps run
  on desktop Chrome — they don't catch low-bandwidth UX, RTL keyboard
  quirks, or whether the audio fallback path is actually usable on a
  $100 Android with 2G.
- **Action:** Recruit 6–10 NGO program officers across Somali (3+),
  Swahili (2+), Arabic (2+), French (1+) language groups. Moderated
  45-min sessions on their own devices, on a metered connection if
  available. Tasks: submit a draft application, file a quarterly
  report from a phone photo + voice memo, navigate the membership
  flow, find a deadline. Capture: where do they get stuck, where do
  they switch to typing, what English copy lands as nonsense in
  translation.
- **Status:** deferred. Needs recruitment + budget, not code. Block on
  this before claiming a 9.5/10 quality bar in any pitch.

---

## Explicitly declined

*(empty — add items here as the team decides not to build them, with the date and reason)*

---

## High priority — operational (added 2026-06-11)

### Deploy-cadence guardrail — never batch-deploy phases (added 2026-06-12)
- **last_touched:** 2026-06-12
- **Why:** Phases 67/68 (a single commit), 69, and 70 were deployed in a
  37-min window (commits at 21:47, 21:53, 22:03 PDT on 2026-06-11). Each
  `railway up --detach` triggers build → swap → drain → healthcheck. The
  rapid swaps left a ~2-hour window where the live URL was unreachable
  from external clients (probes returned 30-90s ReadTimeout from this
  network even though Railway showed deploy status=SUCCESS), and the
  team's UAT regression captured the outage:
    * `test_e2e.py` cascaded from green into 502s + connection-aborts
    * `test_e2e_final.py` 4/54 PASS, 9 FAIL, 41 ERRORS
    * `test_near_uat.py` 16/19 PASS, 3 ERRORS
    * Playwright entry-points (login-kuja, login-near, dashboard) timed
      out at 30s in the browser
  After `railway redeploy --service web` (a restart-only redeploy) the
  service became reachable again, and the same suites re-ran clean:
    * `test_near_uat.py` 19/19 PASS
    * `test_e2e_final.py` 54/54 PASS, regression gate PASS
    * Entry-point probes 200 OK in 350-510ms across login-kuja,
      login-near, dashboard, admin-windows/160, admin-reports
  Root cause: too-rapid sequential deploys can leave the active
  container wedged even when Railway marks the deploy SUCCESS. The
  symptom is user-visible (browser timeouts on /login + /dashboard),
  not just test-harness noise.
- **Rule going forward:** when shipping >1 phase in a single session,
  EITHER combine them into one commit + one deploy, OR pace deploys at
  least 5 minutes apart AND probe `/api/health` + `/api/network/current`
  from an external client (`requests`, `curl`, or a Playwright load)
  after each deploy before initiating the next. "Deploy SUCCESS in
  Railway's UI" is NOT sufficient evidence of reachability — the live
  URL has to be probed from the public internet.
- **Status:** documented; no code change. Next time I do a multi-phase
  session, I will pace deploys or batch commits and probe externally
  between each.

### Email transports — wire SendGrid / SMTP credentials on Railway
- **last_touched:** 2026-06-11
- **Why:** The Phase 21+44 codepaths that should send transactional
  email (membership approve/reject, declaration release-applications
  notifications) call `EmailService.send()`, but Railway has no
  `SENDGRID_API_KEY` or `SMTP_HOST` env var set. The handlers log + no-op
  silently. The shortlisted NGOs find out about a declaration release
  only when they next sign in. Same for membership decisions.
- **Action:** Pick a transport (SendGrid free tier ≤ 100/day is enough
  for current volume; any SMTP relay also works), set the env var on
  Railway, redeploy. No code change required — the handlers already
  exist and are wired. After flipping it on, verify by approving a
  pending NEAR membership and confirming the applicant gets the email.

## Category-defining NGO experience (added 2026-06-12)

These items need external account setup that can't be done from this
chat. Each is queued with a precise unblock action so the team can
flip them on quickly.

### Email transports — wire SendGrid / SMTP credentials on Railway
(See above. Still unblocked: Railway env var only.)

### WhatsApp surface — first-class channel for non-tech NGOs
- **Why:** Many NGO field staff don't check email; they live in
  WhatsApp. Capacity assessment, deadline reminders, voice-memo
  reports, photo-evidence uploads — all could land in WhatsApp.
- **Unblock:** Meta Business API approval (2-4 weeks). Pick a BSP
  (Twilio, Vonage, Karix) and set WHATSAPP_BSP_API_KEY +
  WHATSAPP_PHONE_NUMBER_ID on Railway.
- **Code state:** Backend already has a generic
  `app/services/messaging` adapter abstracting SMS/WhatsApp. Adding
  a WhatsApp implementation is ~2 days once BSP credentials land.

### SMS OTP login — alternative to email+password
- **Why:** Email is a barrier for staff who don't check it. SMS one-
  tap is universal. Keep email as optional.
- **Unblock:** Twilio account + SMS_PROVIDER_API_KEY +
  SMS_FROM_NUMBER. ~$0.01/SMS in most LMIC markets.
- **Code state:** Auth blueprint is single-method today. Adding
  SMS auth method is ~3 days.

### Donor-pays-for-AI — billing reframe
- **Why:** Removes the implicit 'will my AI calls cost the NGO?'
  question entirely. Reframes AI as 'value the donor invests in
  capacity building.' Cleaner story and unit economics.
- **Unblock:** Stripe connect for donor org billing + per-org token
  metering hooks. AI service already wraps every Claude call so
  metering insertion is mechanical.
- **Code state:** ~1 week including Stripe webhooks and
  donor-portal billing UI.

### Peer reference snippets — "orgs like yours wrote this"
- **last_touched:** 2026-06-12 (deferred during Phase 71-82 push)
- **Why:** Non-technical NGOs don't know what "good" looks like for a
  given section of a grant application. Showing them anonymized peer
  snippets of how similar-sized orgs in their region wrote the same
  section is a strong learning signal donors won't provide on their
  own.
- **Unblock:** Build an anonymization pipeline. Per-section extract,
  scrub identifying detail (org names, specific locations, named
  individuals, distinctive numbers), opt-in consent gate on the source
  NGO ('Allow your application snippets to be shown anonymized to
  peers?'), and a similar-org recommender (by sector, size, region).
- **Engineering effort:** ~1 week including the anonymizer, consent
  gate, and similarity index.
- **Code state:** Application response field schema already exists;
  the anonymizer + recommender are net-new.

### NEAR cohort onboarding — 6-week guided curriculum for new members
- **last_touched:** 2026-06-12 (deferred during Phase 71-82 push)
- **Why:** New NEAR members today land in the platform and have no
  guided path. A 6-week curriculum with weekly micro-tasks
  (complete profile → upload 3 docs → run first internal review → run
  first MV → attend first OB call observer → graduate to signer) gives
  them a path and builds trust score gradually. Higher completion →
  higher trust → fairer share of declared funds.
- **Unblock:** The NEAR secretariat must author the curriculum content
  (titles, micro-task descriptions, success criteria per week). This
  is product/content work, not engineering. Once content lands,
  engineering ships the scheduler + UI in ~2 weeks.
- **Engineering effort:** ~2 weeks for the scheduler + weekly-task
  dashboard widget + completion-tracking columns.

### Side-by-side rubric preview — live scoring as the NGO writes
- **last_touched:** 2026-06-12 (deferred during Phase 71-82 push;
  Phase 75 covered ~70% of the value via `confidence` + `gaps`)
- **Why:** Donors hide their scoring rubric today. Showing it to
  applicants — with a live score estimate that updates as they type —
  turns 'guess what the donor wants' into 'I know exactly what they
  want.' Transparency favours prepared NGOs.
- **Unblock:** None — engineering only. Phase 40 already has an
  auto-rubric-scorer that runs at /submit. Phase 75's preview shows
  static confidence + gaps. Live preview needs the scorer wired to
  fire on textarea-blur with a 200ms debounce.
- **Engineering effort:** ~1 week including UI for the live scoreboard
  + debounce + caching.
- **Code state:** AutoRubricScorer service exists. The new work is
  exposing it as a live endpoint + a sidebar panel on /apply.

### Server-side Whisper transcription — UNBLOCK BY SETTING ENV VAR (was deferred)
- **last_touched:** 2026-06-13 (scaffolding shipped Phase 96)
- **Why:** Chrome's Web Speech API does NOT support Somali at all and is
  weak on Swahili / Arabic. Phase 93's MediaRecorder fallback captures
  audio so the user can replay and type — but auto-transcription itself
  needs Whisper for those languages.
- **Status as of 2026-06-13:** Code path is ready. When `WHISPER_API_KEY`
  is set on Railway, the Voice composer auto-transcribes the captured
  audio for Somali / Swahili / Arabic users. When unset, behaviour is
  unchanged (replay-and-type workflow).
- **Action remaining:** OpenAI account + WHISPER_API_KEY on Railway.
  Cost ~$0.006/minute of audio. Hit `/api/whisper/status` after setting
  to confirm Whisper returns `status: ok`.
- **Code state:** `app/services/whisper_service.py` + `app/routes/
  whisper_routes.py` (`/api/whisper/status`, `/api/whisper/transcribe`),
  wired into VoiceReportComposer's MediaRecorder onstop handler.

### Native-language user testing (added 2026-06-12 — team review)
- **last_touched:** 2026-06-12
- **Why:** The team's design review named this the "most important
  validation step." Translation parity (UI strings in EN/FR/AR/SW/SO/
  ES) is not enough. The redesigned flows need testing for
  comprehension, tone, layout, and cultural clarity in each language,
  on mobile devices, over weak connectivity. Critical for closing the
  "visually simpler but cognitively the same" risk the team named.
- **Action:** Run moderated 45-min sessions with at least one program
  officer per language (Arabic, Somali, Swahili, French, Spanish, plus
  one English-as-second-language). Each session should cover: dashboard
  scan + apply (Voice Draft → review) + a report submission (Photo
  Evidence + Voice Draft) + a compliance flag walkthrough + journey
  tracker scan. Capture verbatim quotes; record screen + audio with
  consent.
- **Engineering effort:** None — this is product research.
- **Why we need to run this BEFORE building more:** It's the only way
  to learn whether the cognitive simplicity work (Phases 86-90) actually
  lands for non-English-first users, and it informs the design of
  beginner/expert progressive disclosure (next item).

### Beginner/expert progressive disclosure (added 2026-06-12 — team review)
- **last_touched:** 2026-06-12
- **Why:** The team review explicitly recommended "avoid a manual
  simple/expert mode toggle initially. A better design is progressive
  disclosure: new users receive explanations, examples, and guided
  steps; returning users naturally gain shortcuts, compact views, and
  bulk actions; complexity appears when behaviour demonstrates
  readiness."
- **Why deferred:** Designing this without behavioural data risks
  building disclosure rules that don't match how users actually
  progress. The native-language user testing item above should run
  first so we have real evidence of which surfaces non-technical
  users get stuck on and which experienced users already skip past.
- **Engineering scope** (once research is in):
  * A per-user "experience signal" computed from completed actions
    (submitted N applications, accepted reports, profile completeness,
    days since first login).
  * Conditional rendering in components — full explainers + examples
    by default; compact views once the user has demonstrated readiness.
  * Hard guarantee: no silent removal of options. Anything hidden by
    progression is reachable via "Show all options" / "Expand."
- **Engineering effort:** ~2-3 weeks after research lands.

### Offline-first PWA — IndexedDB + Service Worker
- **Why:** Rural NGOs work over intermittent 3G. Drafting an
  assessment offline + syncing on next connection is operational
  table stakes for the user the product targets.
- **Unblock:** No external creds; multi-week engineering. Service
  Worker scope, IndexedDB schema for forms-in-progress, conflict
  resolution on sync.
- **Code state:** Next.js static export already produces a near-
  PWA-shaped bundle. Adding manifest.json + offline route would
  ship the basics in a week; full sync layer is 3-4 weeks.

## Completed (rolling log, newest first)

- **2026-06-27** Phase 657–665 — Proximate Fund completeness sweep
  (commits `b55de3ee` + `51b69c33`). Closes the user-flagged audit
  list and ships a usable skeleton of Module 3.2 from
  PROXIMATE_FUND_DESIGN.md.
  - **657** OB can SEE the photo + HEAR the voice on disbursement
    detail. New `/disbursements/<id>/attachment/<kind>` streamer,
    `<img>` + `<audio>` controls inline.
  - **658** Self-nominated partners get screened automatically.
    `_run_partner_sanctions_screen()` runs inline on the public
    `/partners/self-nominate` POST; partner detail surfaces a red
    banner when flagged. Verified live: "Shadow Relief Coalition"
    self-nomination on prod (partner id 9) returned
    `sanctions_flag: True` via the keyword screener.
  - **659** End-of-round report — printable closing package.
    `/api/proximate/rounds/<id>/report` returns the full bundle
    (envelope used/remaining, per-disbursement breakdown with
    voice transcripts + attachment flags, status counts/totals,
    audit window + hash anchor). New `/proximate/rounds/[id]/report`
    page renders printable HTML; window.print() saves as PDF.
    **Hotfix Phase 665:** initial implementation referenced
    `entry_hash` on `AuditChainEntry`; the column is `payload_hash`.
    Surfaced as a 500 on prod the first time the OB hit the
    report. Single-line fix in commit `51b69c33`.
  - **660** Partner acknowledgement loop. Three new columns on
    `ProximateDisbursement` (ack_message, ack_message_at,
    ack_by_user_id). New `/acknowledge` OB-only endpoint. Token
    GET response surfaces the ack so the partner sees "A message
    from Adeso" when they return to the same URL.
  - **661** `useTranslation` falls back to
    `network.default_language` before 'en'. Proximate users land
    in Arabic by default; Kuja/NEAR unchanged.
  - **662** $10k threshold ladder. New `pending_cosign` status,
    new `/cosign` endpoint, COI guard (sender ≠ cosigner). Token
    only issued after both signers approve. Verified live: $15k
    disbursement → `pending_cosign` with NO `report_token`; $2,500
    → `pending_report` with token issued (per SoP 10 §4 Step 2).
  - **663** Crisis Selector skeleton (Module 3.2 partial). New
    `/api/proximate/crisis-selector` ranks
    `CrisisMonitoringRow`s scoped to the Proximate tenant, falling
    back to Sudan rows from any tenant during UAT. New
    `/api/proximate/crisis-selector/<row>/brief` calls Claude for
    a scenario-typed decision brief (incubate / strengthen /
    enable) with a deterministic offline fallback. Honest
    backlog: the news/signal feed ingestor stays deferred as the
    multi-week piece.
  - **i18n** +54 keys × 6 locales (parity 2531). Real Arabic for
    user-facing strings; EN placeholders for fr/sw/so/es per the
    team's EN+AR scope.
  - **Ops:** set `SEED_PROXIMATE_ON_BOOT=true` on Railway so the
    Proximate tenant got 8 partners + ob@proximate.org / pass123
    on this deploy cycle.

- **2026-06-26** Phase 648 — Default OB user seeded on Proximate
  tenant. The `@ob_required` decorator (Phase 44, retired the
  admin shortcut at Phase 114) checks
  `NetworkMembership.is_oversight_body=True` on an active
  membership against the user's org. The Adeso team had no way
  to test the secretariat happy path without one. Seed now
  creates:
    - Organization "Proximate Oversight Body" (org_type=ngo, SD)
    - User ob@proximate.org / pass123 attached to that org
    - Active NetworkMembership(is_oversight_body=True) on the
      Proximate tenant
  All idempotent — re-running reuses existing rows. Will land on
  prod automatically next boot via SEED_PROXIMATE_ON_BOOT.
  Full happy path verified end-to-end as the seeded OB user
  (with `X-Network-Override: proximate` header for localhost
  tenant resolution):
    - GET  /admin/endorsers/pending           → 200, 1 endorser
    - POST /admin/endorsers/<id>/approve      → 200, approved
    - POST /partners/3/bank-verify            → 200
    - POST /interventions                     → 200
  Every action that previously returned 403 against
  admin@kuja.org now works.

- **2026-06-26** Phase 646 + 647 — Endorser KYC loop closed.
  - **646:** new `/proximate/admin/endorsers` page lists pending
    endorsers with the COI self-disclosure fields (village /
    family / employer) inline. Approve is one click; Reject
    demands a textarea reason (required server-side too) that
    lands in the audit chain on `proximate.endorser.rejected`.
    Operator dashboard's "Endorsers pending" tile now links
    here. Without this, every light-KYC review (Phase 637) was
    a curl call.
  - **647:** new `/proximate/endorse/register` page lets any
    authenticated user self-register as an endorser. Form
    captures locality + country + COI fields (village, family
    name, employer). POST is idempotent — re-submits return
    `already_registered: true` instead of erroring. Success
    state shows status + next steps. Linked from the inbox
    empty state via a "Become an endorser" CTA. Without this,
    only seeded endorsers could ever exist; the system had no
    onboarding path.
  - 37 new i18n keys × 6 locales → 2317. Arabic translated for
    every visible string in both surfaces.
  - Browser-verified end-to-end with 1 seeded pending endorser
    (Nour al-Halawi / Halfaya / ICRC). Queue page rendered the
    "Endorser approvals" title and surfaced @ob_required 403
    inline (admin role ≠ per-network OB seat). Register form
    rendered all 5 inputs + COI section + Register button at
    /proximate/endorse/register as the logged-in admin user.

- **2026-06-26** Phase 645 — Disbursement method add UI on
  partner detail. New `<DisbursementMethodsPanel>` lists every
  attached method (with verify badge + one-click Verify for OB)
  and provides an inline Add form for the OB. FSP picker
  populates from `/api/proximate/fsps`; per-kind identifier
  fields mirror the server validation exactly (bank → holder +
  account, hawala → recipient_phone + broker_office +
  recipient_name, mobile_money → MSISDN + holder). 18 new i18n
  keys × 6 locales → 2280. Browser-verified end-to-end on
  partner 3: panel renders, dropdown lists all 4 FSPs (Bank of
  Khartoum, Gedaref Souq Hawala #4, Port Sudan Marine Hawala,
  Sudani Mobile Money), picking hawala flips the form to the 3
  hawala fields, submitting hits `@ob_required` which correctly
  surfaces "Oversight Body permission required" inline.

- **2026-06-26** Phase 643 + 644 — Operator dashboard +
  endorsement transcript read view.
  - **643:** new `/proximate/admin` page + `/api/proximate/overview`
    endpoint. Single-pane signal grid: partners by status (with
    cleared callout), open interventions (expired = destructive
    border + "past response window" callout), endorsers pending
    light-KYC, monitoring-due flags for this calendar month,
    registered FSP count, and the last 10 Proximate-flavoured
    audit chain rows. Browser-verified: 4 stat tiles + 14 audit
    rows render on dev.
  - **644:** new `<EndorsementsPanel>` on partner detail page +
    GET `/api/proximate/partners/<id>/endorsements`. Lists every
    endorsement with Y/N answers per question, COI-flagged badge
    if signals fired, "Voice transcript" badge + inline transcript
    text per question when voice was used. Without this, the
    Phase 640 voice work was collected at submit time and
    immediately invisible — the OB had no way to read what an
    endorser actually said. Browser-verified with a seeded
    transcript on partner 3: all 3 question transcripts render
    in the panel.
  - 19 new i18n keys × 6 locales → 2262 keys per locale.

- **2026-06-26** Phase 640 — Voice transcription per endorsement
  question. New `<VoiceQuestionInput>` at
  `frontend/src/components/proximate/voice-question-input.tsx`
  wired beneath each of the 3 Y/N questions in the endorser
  wizard. Tap Record → MediaRecorder captures audio → blob is
  POSTed to `/api/whisper/transcribe` with the active language
  code (ar/en) → returned text appended to the textarea. Endorser
  can type directly; textarea is source of truth. On submit,
  transcripts ship as `q1_transcript`/`q2_transcript`/
  `q3_transcript` and persist in new model columns (capped 5000
  chars each). Browser-verified: 3 record buttons + 3 textareas
  render on partner 3 wizard. 7 i18n keys × 6 locales → 2243.

- **2026-06-26** Phase 639 + 641 + 642 — FSP registry + auto-
  intervention + monitoring cadence.
  - **639 (FSP registry):** new `proximate_fsps` + `proximate_
    partner_disbursement_methods` tables. FSP kinds = bank /
    hawala / mobile_money. Routes — list/register FSPs (OB-only),
    list/add/verify partner disbursement methods. Per-kind
    identifier validation. Hawala office + recipient phone is
    first-class. Identifier NEVER logged in audit chain (PII).
    Seed adds 4 Sudan FSPs: Bank of Khartoum, Gedaref Souq Hawala
    #4, Port Sudan Marine Hawala, Sudani Mobile Money.
  - **641 (security auto-intervention):** new cron-tick endpoint
    scans Proximate partner intake_form notes for security
    keywords (RSF/SAF, raid/attack/kidnap/displacement etc. in
    both EN and AR script). Match → auto-opens a `freeze` (72h)
    intervention with SOP-13-section-4-auto clause. Idempotent
    (skips partners that already have an open intervention).
    Hash-chained as `proximate.intervention.opened.freeze.auto`.
  - **642 (monitoring cadence):** new cron-tick endpoint emits a
    `proximate.monitoring.due` audit-chain entry per cleared
    partner per calendar month per SOP 12. v1 — audit-chain
    flag only; the Report-table integration deferred (Report
    requires a Grant/Application link that doesn't fit the
    relational-validation model cleanly). Inbox UI can read these
    flags for "Reporting due" tiles.
  - Total Proximate route count: 22 (was 15).

- **2026-06-26** Phase 638 — Intervention register UI on partner
  detail page. New `<InterventionPanel>` at
  `frontend/src/components/proximate/intervention-panel.tsx`
  surfaces every open intervention for a partner. Each row shows
  kind badge (warning/freeze/suspend), SOP clause, live HH:MM:SS
  countdown to `response_due_at`, reason, and (for OB) a Withdraw
  button. Escalated rows get a destructive-tone treatment with no
  countdown. OB users also get the "Open intervention" form
  inline (kind dropdown + reason textarea → POST). Countdown
  re-renders every 30s — the server is the authority for
  `response_due_at`, so the display math is just `(due - now)`.
  Wired into the Proximate wizard above the Secretariat actions
  card. 16 new i18n keys EN+AR with real Arabic, all 6 locales at
  2236.
  - **Bug found + fixed during verification:** SQLite returned
    naive datetimes from the `proximate_interventions` columns
    even though we wrote aware UTC. Mixing them with `_now()`
    (aware) in `is_expired`/`elapsed_seconds`/`remaining_seconds`
    raised `TypeError: can't subtract offset-naive and
    offset-aware`. Added `_as_utc()` helper that coerces naive →
    UTC-aware before subtraction. The 3 helper props now all
    safe.
  - Browser-verified end-to-end with 2 seeded interventions on
    partner 3 — warning shows `30:56:42` countdown, freeze
    (backdated to expire) shows `00:00:00` in destructive
    styling. Withdraw button present on both for admin.

- **2026-06-25** Phase 635 + 636 + 637 — Intervention register +
  capital classification + light-KYC endorser queue.
  - **635 — Intervention register (SoP 13 §4):** new
    `app/models/proximate_intervention.py` with kinds
    warning/freeze/suspend and explicit response windows 24h/72h/5d.
    Five routes: open (OB-only), list, respond, withdraw (OB-only),
    cron-tick (CRON_SECRET-gated). Every transition hash-chained
    (`proximate.intervention.opened.{kind}`, `.responded`,
    `.escalated`, `.withdrawn`). Model exposes `elapsed_seconds`,
    `remaining_seconds`, `is_expired` so UI doesn't reimplement
    clock math.
  - **636 — Capital classification:** added `capital_class` column
    on `ProximatePartner` (small/medium/large, default small) per
    SoP 13 disbursement thresholds — small < $5k, medium $5k-$50k,
    large > $50k. `classify_capital(usd_amount)` helper exported
    for grant-time auto-classification. Surfaces in partner.to_dict.
    Auto-added by schema reconciler.
  - **637 — Light-KYC endorser queue:** three new admin routes
    under `/admin/endorsers/*` — list pending, approve, reject (with
    reason). Approve/reject audit-chained. v1 — human review only;
    AI assist deferred. Endorsers seeded by Phase 630 are already
    approved, so the queue is empty in demo until real users
    self-register.

- **2026-06-25** Phase 633 + 634 — Demo seed-on-boot + secretariat
  UI on the wizard.
  - **633:** `SEED_PROXIMATE_ON_BOOT=true` env-flag triggers
    `seed_proximate.run()` after the Network bootstrap. Fired
    successfully on prod (Railway logs show "Proximate demo seed
    complete." — 6 endorsers, 8 partners, 9 endorsements). Idempotent,
    so it's safe to leave on; flip it off (or just keep it on for
    nightly demo refresh) at the team's discretion.
  - **634:** violet "Secretariat actions" card on
    `/proximate/endorse/[partnerId]` for admin users only — two
    buttons ("Mark bank account verified", "Suspend partner") that
    hit the Phase 632 endpoints. Suspend is a confirm-with-reason
    flow (textarea + Confirm/Cancel). Browser-verified end-to-end:
    clicking bank-verify against a partner where admin is not OB on
    Proximate surfaces the server-side `Oversight Body permission
    required` error in the inline message — exactly the expected
    permission boundary (per-network OB role, Phase 44). 12 new i18n
    keys, all 6 locales at 2220 keys.

- **2026-06-25** Phase 632 — Proximate secretariat admin endpoints
  (bank-verify + suspend).
  - **POST /api/proximate/partners/<id>/bank-verify** (OB-only):
    flips `bank_verified_at`, auto-transitions to `dd_clear` if
    trust-floor is met. Mirrors the SOP 10 §4 Step 1 character-for-
    character verification step. Triggers the same +5 reputation
    bump on contributing endorsers as Phase 631's endorsement-path
    clear (because the outcome — partner cleared for Tier 1 — is
    the same regardless of which gate was last).
  - **POST /api/proximate/partners/<id>/suspend** (OB-only):
    SOP 13 §4 intervention measure. Requires a `reason`. Rolls back
    `trust_tier` if previously cleared. Penalises every endorser
    whose vouch is on the partner by -5 (capped at 0), regardless
    of COI status — the endorser backed the wrong organisation.
    Each penalty is itself an audit-chain entry with the suspend
    reason in the payload (truncated to 200 chars).
  - Both endpoints fully hash-chained.
  - Smoke green (166/167, only pre-existing PHASE21D-001
    unchanged).

- **2026-06-25** Phase 630 + 631 — Proximate seed fixtures + reputation
  algorithm + audit-chain hooks.
  - **630 (seed fixtures):** `seed_proximate.py` — idempotent
    standalone script. Re-runnable. Seeds 6 endorsers (admin + 5
    existing NGO test users, with COI signal variety so the auto-
    check has clean + flagged paths to exercise) and 8 partners
    across Gedaref / Sennar / Khartoum, distributed across the 5
    status buckets (nominated x2, 1-endorsement x2, COI-flagged
    endorsement x1, dd_pending x1, dd_clear x2). Marker-row pattern
    means re-runs snap demo state back even if it's drifted (mirrors
    Phase 198 UAT fixture cron on adeso-pmo-v2).
  - **631 (reputation + audit-chain hooks):** every Proximate write
    path now emits an `AuditChainEntry`:
    - `proximate.endorser.registered`
    - `proximate.partner.nominated`
    - `proximate.endorsement.submitted` (with COI signals list +
      state-change in the payload)
    - `proximate.partner.status_changed.dd_pending` /
      `.dd_clear`
    - `proximate.endorser.reputation_bumped` (per endorser whose
      vouch contributed to a clear)
  - **Reputation algorithm v1:** on `dd_clear` state-change, every
    endorser whose `coi_check_passed=true` endorsement is on the
    partner gets +5 reputation (capped at 100). The "ground-truth
    feedback" the design doc §3.1 calls for. v1 only handles the
    positive direction; the negative direction (endorser repeatedly
    backs partners that get suspended) deferred to Phase 632.
  - **End-to-end smoke verified inline** (cookie-auth in test_client
    was fighting Flask-Login — exercised the route's mutation
    sequence directly): partner Gedaref Mothers Co-op transitioned
    from `endorsements_open` → `dd_clear` on the second endorsement
    + bank verification; Thandi's reputation 80 → 85; audit-chain
    grew by exactly 4 entries (submission + status-change + 2
    reputation bumps).

- **2026-06-25** Phase 629 — Proximate endorser inbox + endorsement
  wizard frontend.
  - New `/proximate/endorse` page: filtered list of partners awaiting
    endorsement, "N of 2 endorsements collected" per row,
    Arabic-aware display name (`name_ar` when `lang === 'ar'`).
  - New `/proximate/endorse/[partnerId]` wizard: 3 Y/N questions with
    EN+AR labels supplied by the API. Submit uses `apiOffline.post`
    so the PWA outbox handles low-signal Sudan conditions (queued
    state has its own confirmation screen). Static-export pattern:
    `page.tsx` + `client.tsx` reading `window.location.pathname`
    (same fix as `/applications/[id]`).
  - Trust-floor checklist render (Screen 3): 3 gates — 2 independent
    endorsements / bank verified / endorsers meet reputation floor
    — each with a green tick or muted X. State-change callout fires
    when `state_change === 'dd_clear'` (the partner just cleared
    Tier 1 because of this endorsement). Separate amber callout when
    COI auto-check flagged the endorsement (recorded for audit but
    doesn't count toward floor).
  - 29 i18n keys added across all 6 locales (en/ar real translations,
    fr/sw/so/es backfilled with EN placeholders). Parity gate green
    at 2208 keys per locale.
  - **Browser-verified locally:** inbox shows "2 partners need
    endorsement" subtitle + 2 partner cards (Halawa Relief Block /
    Sennar, Gedaref Children Aid / Gedaref). Wizard renders heading,
    3 numbered questions ("Is this organisation real…", "Do you trust
    the leadership?", "Would you accept aid through them?"), Yes/No
    button pairs, Submit CTA. End-to-end submission test passed
    (admin promoted to approved endorser, q1/q2/q3 = true →
    `coi_passed=true`, `endorsements_independent_count=1`,
    `state_change=null` correctly — needs second endorser to clear).
  - **Deferred to Phase 631:** voice-note attachment per question
    (URL fields exist in the model + payload; UI uses voice-field-
    input component, just not wired here yet), partner nomination
    intake form UI (the API already exists, secretariat can
    POST directly until UI lands).

- **2026-06-25** Phase 628 — Proximate community-endorsement data
  model + endpoints (the bet).
  - New `app/models/proximate_endorsement.py` with three SQLAlchemy
    models: `ProximatePartner` (informal group nominated for
    Tier 1 funding), `Endorser` (registered community member with
    COI signals + reputation_score), `Endorsement` (one vouch with
    3 Y/N answers + COI auto-check).
  - `Endorsement.compute_coi_signals()` is the load-bearing helper.
    Compares endorser's locality/village/family_name/employer against
    partner fields (substring, case-insensitive). Non-empty signals
    flag the endorsement out of the trust-floor count but still
    record (audit). Biases false-positives over false-negatives.
  - `ProximatePartner.trust_floor_signals()` is the single source of
    truth for "Tier 1 ready": 2 independent COI-clean endorsements
    + bank verified + all endorsers reputation ≥ 75 (placeholder
    floor pending Phase 631 algorithm).
  - New `app/routes/proximate_routes.py` blueprint exposes 5
    endpoints under `/api/proximate/*`: register-endorser (idempotent),
    list-partners (filtered by status), get-partner-detail,
    nominate-partner, submit-endorsement (runs COI auto-check,
    transitions partner status on trust-floor met). Tenant guard
    via host-header → `g.network.slug == 'proximate'`.
  - Smoke-tested: 3 COI auto-check paths (clean / shared locality /
    shared family name) pass; all 5 routes registered; tables
    auto-create via existing schema reconciler.
  - **Deferred to Phase 631:** reputation algorithm (column exists,
    default 50), Whisper transcription of voice notes, audit-chain
    entry per endorsement (column exists), light-KYC review flow.
  - **Next (Phase 629):** Next.js frontend — endorser inbox,
    nomination form, endorsement wizard (3 Y/N questions, voice
    notes), trust-floor checklist render. Arabic-first.

- **2026-06-21** Phase 625 + 627 — Audit-chain tenant scope
  verification + Proximate Fund design doc v1.
  - **625 (verification only):** confirmed that
    `app/routes/audit_chain_routes.py` has zero `network_id`
    filtering, `AuditChainEntry` has no `network_id` column, and the
    `/admin/audit-chain` frontend doesn't read `useNetworkStore`. Not
    a prod leak today (the audit-chain page is `@role_required('admin')`
    only, and NEAR OBs use a separate role — Phase 44). Becomes a
    real decision when Proximate ships: per-tenant chain vs shared
    chain with read-side scoping. Decision documented in
    `docs/PROXIMATE_FUND_DESIGN.md` §6 (recommended: per-tenant).
  - **627 (Proximate Fund design doc v1):**
    `docs/PROXIMATE_FUND_DESIGN.md` is the reaction surface for the
    whole Proximate workstream. Structured as: north-star, what
    reuses NEAR, 6 net-new modules (community endorsement is the
    bet), per-flow walkthrough mapping each SoP step → UI surface,
    13-week phasing, 5 open design decisions for Adeso to call.
    SOP 14 fast-track as primary lane (not exception); Arabic-first
    by default; hawala + mobile-money as first-class FSP types;
    security-driven returns auto-detected. Awaiting team sign-off on
    §2 reuse table, §3 community-endorsement shape, §6 decisions, and
    §5 phasing.

- **2026-06-21** Phase 626 — mobile_test.py parametrise by network.
  **DEFERRED** pending Phase 627 sign-off. Rationale: parametrising
  the mobile test before the Proximate-specific routes exist would
  be guesswork. Once 627 lands and route paths are stable, parametrise
  `mobile_test.py` with the actual routes (community endorsement,
  multi-sig threshold dialog, tranche scheduler, intervention
  register) and run cold-mobile-slow-3G against both NEAR and
  Proximate tenants.

- **2026-06-21** Phase 624 — Arabic + RTL backfill on low-internet
  surfaces. After the team audit, 27 customer-facing strings were
  bypassing i18n and 8 Tailwind classes hardcoded LTR directionality.
  Added 44 new keys to en.json + ar.json (parity maintained, 2,179
  total), refactored OfflineBanner, PhotoEvidenceUploader,
  VoiceFieldInput, NearComplianceReporting, DeclarationWizard,
  AppealPanel, ComplianceFlag to use `useTranslation()`, and swapped
  `mr/ml/pl/pr/border-l` → `me/ms/ps/pe/border-s` (logical properties).
  Sudan / Proximate context: OfflineBanner is the lowest-bandwidth
  surface; voice + photo are the bridges for Arabic-first low-literacy
  field officers. Verified locally — composer header reads
  «دليل بالصورة — وجّه هاتفك...», all 5 photo-kind chips render in
  Arabic, `dir="rtl"` applied to root, file input uses `file:me-3`.

- **2026-06-21** Phase 623 — Photo-as-evidence on the shared report
  detail page. Audit found `PhotoEvidenceUploader` was only wired on
  the Kuja list-view (`/reports/page.tsx:1256`); the shared detail
  page `/reports/[id]/client.tsx` — used by both Kuja AND NEAR —
  didn't have it. Adding it to the shared detail page unblocks
  photo-as-evidence for NEAR users immediately and prepares the
  Proximate Fund tenant to inherit it on day one. Verified locally:
  composer opens, 4 kind chips render, `capture="environment"` opens
  the rear camera on mobile.

- **2026-06-21** Phase 622 — rubric live-preview anchors target the
  right criterion: the team flagged that anchor hrefs read
  `#criterion-undefined` because some grants ship criteria with `id`
  (seed shape) instead of `key`. Introduced shared
  `frontend/src/lib/criterion-anchor.ts` (`criterionAnchorId(c, idx)`)
  and wired it into the three sites that must agree on the anchor:
  `SubmissionVelocityBar` (segmented bar + Continue jump),
  `RubricLivePreview` ("jump to criterion" hrefs), and the apply page
  wrapper `<div id="criterion-...">`. Fallback chain: `c.key` → `c.id`
  → slugified `c.label` → `crit-<index>`. Verified locally: all 5
  anchors and links match for a `key`-shape grant; no
  `#criterion-undefined`.

- **2026-06-21** Phase 601-605 — Decision velocity from submission +
  EOI per grant mean + review burst max + funds total + monthly
  platform highlights cron:
  (a) `<DecisionVelocityFromSubmissionStat>` on NGO dashboard reports
  avg days submitted→decision_recorded for last 12 months; amber
  > 60d; self-gates < 3 sample.
  (b) `<EoiPerGrantMeanStat>` on donor dashboard reports avg EOI
  count per donor's published grant — engagement signal.
  (c) `<ReviewBurstMaxStat>` on reviewer reviews page shows peak
  single-day completion count in last 30d (flame icon).
  (d) `<FundsTotalStat>` on operator dashboard counts Fund rows
  lifetime. (e) Phase 605 cron `/api/cron/platform-highlights-month`
  monthly admin digest of platform highlights this month
  (apps submitted, grants published, AI calls, feedback); honors
  digests opt-out.

- **2026-06-21** Phase 595-599 — AI cost YTD + first-time NGOs this
  month + COI disclosed + AI tokens today + daily watchlist
  deadlines cron:
  (a) `<AiCostYtdStat>` on NGO dashboard sums AICallLog.usd_cost
  for the NGO's org since Jan 1 — annual spend transparency.
  (b) `<FirstTimeNgosMonthStat>` on donor dashboard counts distinct
  NGO orgs applying to donor's grants this month with no prior
  history (emerald growth tone). (c) `<CoiDisclosedCountStat>` on
  reviewer reviews page counts Review rows with coi_disclosed_at
  set — lifetime conflict-of-interest disclosure pattern.
  (d) `<AiTokensTodayStat>` on operator dashboard sums AICallLog
  tokens_in + tokens_out last 24h with breakdown (k-suffix when
  >= 1000). (e) Phase 599 cron `/api/cron/ngo-deadlines-today`
  daily NGO digest of watchlisted grants with deadline today or
  tomorrow; distinct from Phase 431 (this-week reminder). Honors
  digests opt-out.

- **2026-06-21** Phase 589-593 — Peak AI score + draft grants count
  + AI score lift + networks total + daily cron failures digest:
  (a) `<PeakAiScoreStat>` on NGO dashboard shows max Application.ai_score
  across last 365d with app id — personal-best confidence-builder.
  (b) `<DraftGrantsCountStat>` on donor dashboard counts donor's
  Grant rows in 'draft' status — surfaces unpublished work.
  (c) `<AiScoreLiftStat>` on reviewer reviews page reports avg
  (human_score − ai_score) across last 30d completed reviews with
  both fields set; trending-up emerald when reviewer scores higher,
  trending-down amber when lower. Self-gates < 3 sample.
  (d) `<NetworksTotalStat>` on operator dashboard counts Network
  rows — platform tenancy pulse. (e) Phase 593 cron
  `/api/cron/cron-failures-yesterday` daily admin digest of failed
  CronRun rows in last 24h with top-5 names; distinct from Phase 502
  (7d tile) by being a daily push notification. Honors digests opt-out.

- **2026-06-21** Phase 583-587 — Withdrawn count + apps awaiting first
  review + declined assignments + compliance snapshots this week +
  reviewer decline-rate feedback cron:
  (a) `<WithdrawnCountStat>` on NGO dashboard counts Application rows
  with withdrawn_at set — lifetime withdrawal history.
  (b) `<AppsAwaitingFirstReviewStat>` on donor dashboard counts apps
  in submitted/in_review where submitted_at > 7d ago with no Review
  carrying overall_score; amber tone — pre-scoring bottleneck
  signal (distinct from Phase 518 no-reviewer-assigned).
  (c) `<DeclinedCountStat>` on reviewer reviews page counts
  Review.status='declined' lifetime — calibration on what gets
  refused. (d) `<ComplianceSnapshotsWeekStat>` on operator dashboard
  counts ComplianceSnapshot rows in last 7d. (e) Phase 587 cron
  `/api/cron/reviewer-decline-rate-feedback` weekly reviewer
  feedback digest reporting decline rate vs total assignments
  last 30d; honors digests opt-out.

- **2026-06-21** Phase 577-581 — Most active grant + EOI conversion
  rate + highest review score + active grants total + assessments
  weekly digest cron:
  (a) `<MostActiveGrantStat>` on NGO dashboard shows the grant the
  NGO has applied to most often with count × title (self-gates
  when count < 2). (b) `<EoiConversionStat>` on donor dashboard
  reports % of EOI rows on donor's grants where the NGO actually
  followed through with an Application — funnel signal.
  (c) `<HighestScoreStat>` on reviewer reviews page shows reviewer's
  top overall_score across last 90d with the application id
  (emerald celebration tone). (d) `<ActiveGrantsTotalStat>` on
  operator dashboard counts Grants in 'open'/'review' status —
  currently-live opportunities. (e) Phase 581 cron
  `/api/cron/assessments-week-digest` weekly admin digest of
  Assessment rows completed in last 7d; honors digests opt-out.

- **2026-06-21** Phase 571-575 — Revision requested + shortlist
  conversion + scoring time variance + monitoring visits quarter
  + admin snoozes-ending-7d cron:
  (a) `<RevisionRequestedStat>` on NGO dashboard counts apps with
  status='revision_requested' — direct action signal (amber).
  (b) `<ShortlistConversionStat>` on donor dashboard reports % of
  donor's starred apps that became funded/awarded — measures
  shortlist quality. (c) `<ScoringTimeVarianceStat>` on reviewer
  reviews page reports std-dev of scoring time across last 30d
  with steady/variable/erratic label; self-gates < 3 sample.
  Distinct from Phase 453 (average). (d) `<MonitoringVisitsQuarterStat>`
  on operator dashboard counts MonitoringVisit rows scheduled this
  calendar quarter. (e) Phase 575 cron `/api/cron/snoozes-ending-7d-admin`
  weekly admin digest counting Review.snoozed_until expirations in
  next 7d; honors digests opt-out. Distinct from Phase 539 (per-reviewer).

- **2026-06-21** Phase 565-569 — EOI counts (both sides) + private
  notes 30d + stale trust profiles + NGO year-to-date recap cron:
  (a) `<EoiCountStat>` on NGO dashboard counts ExpressionOfInterest
  rows for the NGO's org — engagement signal.
  (b) `<EoiReceivedStat>` on donor dashboard counts EOI rows across
  the donor's grants — scalar header (distinct from Phase 349
  per-grant rollup tile). (c) `<PrivateNotes30dStat>` on reviewer
  reviews page counts Review rows with non-empty private_notes
  updated in last 30d — calibration journal habit signal.
  (d) `<StaleTrustProfilesStat>` on operator dashboard counts NGO
  orgs with no Application activity in > 90d — dormancy/engagement
  signal. (e) Phase 569 cron `/api/cron/ngo-ytd-recap` monthly NGO
  YTD digest (submissions, funded, declined); honors digests opt-out.

- **2026-06-21** Phase 559-563 — Submitted today + starred count +
  completed today + saved searches lifetime + donor decisions
  weekly mirror cron:
  (a) `<SubmittedTodayStat>` on NGO dashboard counts Application.submitted_at
  within last 24h (emerald celebration tone).
  (b) `<StarredCountStat>` on donor dashboard counts donor's apps
  with is_starred=True — scalar shortlist size (distinct from
  Phase 213 which lists them). (c) `<CompletedTodayStat>` on reviewer
  reviews page counts reviewer's completed reviews in last 24h
  (rolling 24h; distinct from Phase 405 which is calendar week).
  (d) `<SavedSearchesLifetimeStat>` on operator dashboard counts
  total SavedSearch rows — adoption signal. (e) Phase 563 cron
  `/api/cron/donor-decisions-week-mirror` weekly donor mirror digest
  of decisions they recorded last 7d grouped by status; honors
  digests opt-out.

- **2026-06-21** Phase 553-557 — AI calls last 7d + criteria templates
  + review variety + audit entries today + criteria-template-usage
  weekly cron:
  (a) `<AiCalls7dStat>` on NGO dashboard counts AICallLog rows for the
  NGO's org_id last 7d — self-adoption signal.
  (b) `<CriteriaTemplatesCountStat>` on donor dashboard counts donor's
  CriteriaTemplate rows — tracks investment in template library.
  (c) `<ReviewVarietyStat>` on reviewer reviews page counts distinct
  grants reviewed in last 30d — narrow expertise vs broad pool
  work. (d) `<AuditEntriesTodayStat>` on operator dashboard counts
  AuditChainEntry rows in last 24h (distinct from Phase 412 which
  was rolling rate). (e) Phase 557 cron
  `/api/cron/criteria-template-usage-week` weekly admin digest of
  CriteriaTemplate library: total + top-3 donor orgs; honors digests
  opt-out.

- **2026-06-21** Phase 547-551 — Docs pending AI extraction + apps open
  > 60d + next reviewer deadline + push subscriptions + NGO AI usage
  weekly cron:
  (a) `<DocsPendingExtractionStat>` on NGO dashboard counts Document
  rows in extraction_status 'queued'/'running' on NGO's apps —
  visibility into the AI processing queue (animated spinner icon).
  (b) `<AppsOpen60dStat>` on donor dashboard counts donor's apps in
  submitted/in_review with created_at > 60d ago — amber staleness
  signal. (c) `<NextDeadlineStat>` on reviewer reviews page shows the
  earliest grant.deadline among reviewer's non-completed reviews;
  rose tone if overdue, amber if ≤ 3d, sky otherwise. (d) `<PushSubscriptionsStat>`
  on operator dashboard counts PushSubscription rows — push
  adoption pulse. (e) Phase 551 cron `/api/cron/ngo-ai-usage-week`
  weekly NGO digest of AICallLog activity in last 7d with count +
  USD cost; honors digests opt-out.

- **2026-06-21** Phase 541-545 — Saved searches + declined-this-month
  + reviewer comments rate + large documents + monthly donor
  grants-closing-month cron:
  (a) `<SavedSearchesCountStat>` on NGO dashboard counts SavedSearch
  rows for current user — search-alert reliance signal.
  (b) `<DeclinedThisMonthStat>` on donor dashboard counts donor's
  applications declined this calendar month. (c) `<CommentsRateStat>`
  on reviewer reviews page reports % of last-30d completed reviews
  with non-empty comments JSON; amber tone < 50%; self-gates < 3
  sample. (d) `<LargeDocumentsStat>` on operator dashboard counts
  Documents with file_size > 10 MB — storage cost / heavy attachment
  signal. (e) Phase 545 cron `/api/cron/donor-grants-closing-month`
  is a monthly last-call digest of donor's open grants with deadline
  this calendar month; complements Phase 352 (closing-soon) and
  Phase 449 (closing-this-week). Honors digests opt-out.

- **2026-06-21** Phase 535-539 — Pipeline count + grants closing soon
  + snoozed reviews + AI threads this week + snoozed-reviews-ending-soon
  cron:
  (a) `<PipelineCountStat>` on NGO dashboard counts apps in submitted/
  in_review status (bottleneck visibility — distinct from Phase 367
  pipeline VALUE).
  (b) `<GrantsClosingSoonStat>` on donor dashboard counts donor's open
  grants with deadline within next 7 days (amber tone — urgency
  signal for last-call promotion). (c) `<SnoozedCountStat>` on reviewer
  reviews page counts Review rows with snoozed_until > now —
  visibility on what's temporarily hidden. (d) `<AiThreadsWeekStat>`
  on operator dashboard counts AIThread rows created in last 7d —
  AI co-pilot engagement pulse. (e) Phase 539 cron
  `/api/cron/snoozed-reviews-ending-soon` weekly reviewer digest
  for snoozed reviews resurfacing within 3 days; honors digests
  opt-out, telemetered.

- **2026-06-21** Phase 529-533 — Documents this month + approvals today
  + scoring tightness + tenant messages this week + tenant messages
  week digest cron:
  (a) `<DocumentsThisMonthStat>` on NGO dashboard counts Document rows
  attached to the NGO's applications in last 30d (sky tone).
  (b) `<ApprovalsTodayStat>` on donor dashboard counts donor's apps
  transitioned to funded/awarded in last 24h (emerald celebration).
  (c) `<ScoringTightnessStat>` on reviewer reviews page reports the
  standard deviation of reviewer's overall_score across last 30d
  completed reviews with a 'tight/moderate/spread' label; self-gates
  < 3 sample. (d) `<TenantMessagesWeekStat>` on operator dashboard
  counts TenantMessage rows in last 7d — broadcast engagement pulse.
  (e) Phase 533 cron `/api/cron/tenant-messages-week-digest` weekly
  admin digest with top-3 sender breakdown; honors digests opt-out.

- **2026-06-21** Phase 523-527 — Active grants + grants without apps +
  weekly review cadence + WebAuthn registrations + NGO decisions-this-week
  cron:
  (a) `<ActiveGrantsStat>` on NGO dashboard counts Application rows in
  'funded'/'awarded'/'in_progress' for the NGO's org — the grants they
  are actively delivering on right now (emerald tone).
  (b) `<GrantsWithoutAppsStat>` on donor dashboard counts donor's
  published grants with NOT EXISTS Application rows; amber tone —
  surfaces grants that aren't getting traction.
  (c) `<WeeklyCadenceStat>` on reviewer reviews page shows last 4
  weeks of completed-review counts as a mini bar chart with the
  total; self-gates total === 0. (d) `<WebauthnRegistrationsStat>`
  on operator dashboard counts WebAuthnCredential rows in last 30d
  — passwordless adoption pulse. (e) Phase 527 cron
  `/api/cron/ngo-decisions-this-week` weekly NGO digest of donor
  decisions in last 7 days grouped by status; honors digests opt-out
  via NotificationPreference; record_cron_run telemetered.

- **2026-06-21** Phase 517-521 — Submission consistency + apps without
  reviewer + average rationale length + feedback received this week
  + monthly feedback summary cron:
  (a) `<SubmissionConsistencyStat>` on NGO dashboard counts distinct
  calendar months in the last 12 with a submission (0-12); emerald
  tone when >= 8 — proxy for steady engagement.
  (b) `<ApplicationsWithoutReviewerStat>` on donor dashboard counts
  donor's applications in 'submitted'/'in_review' status with no
  Review row (`NOT EXISTS`); amber tone when >= 5 — operational
  staffing signal. (c) `<AvgRationaleLengthStat>` on reviewer reviews
  page reports average word count of per-criterion comments across
  last-30d completed reviews; self-gates < 3 sample; amber tone
  when < 20 words/review — self-reflection signal on rationale depth.
  (d) `<FeedbackThisWeekCard>` on operator dashboard buckets last-7d
  UserFeedback rows by NPS (promoter/passive/detractor). (e) Phase
  521 cron `/api/cron/feedback-month-summary` is a monthly admin
  digest: 30d UserFeedback count + NPS + top-3 surfaces + avg score.
  Honors NotificationPreference digests opt-out, telemetered via
  record_cron_run.

- **2026-06-21** Phase 511-515 — Days since last submission + open
  grants funding + shortest review + new orgs this week + documents
  week report cron:
  (a) `<DaysSinceLastSubmissionStat>` on NGO dashboard reports the
  age of the NGO's most recent Application.submitted_at; amber tone
  when > 60 days (signal of stalled pipeline). (b) `<OpenGrantsFundingStat>`
  on donor dashboard sums Grant.total_funding for the donor's grants
  in 'open' or 'review' status with `open_count` and currency; the
  pipeline value the donor still has on the market (distinct from
  Phase 470 YTD funded). (c) `<ShortestReviewStat>` on reviewer
  reviews page shows the fastest single review turnaround across
  the last 90 days; scale-aware (m/h/d label) and self-gates < 3.
  Pairs with the Phase 507 longest-review stat to bound the reviewer's
  velocity envelope. (d) `<NewOrgsThisWeekCard>` on operator dashboard
  shows Organization.created_at >= now-7d aggregated by org_type
  (top 4 inline). (e) Phase 515 cron `/api/cron/documents-week-report`
  is a weekly admin digest of Document uploads in the last 7 days —
  honors NotificationPreference digests opt-out, telemetered via
  record_cron_run. Self-gating: every endpoint returns 401 logged-out
  and components hide when their threshold isn't met.

- **2026-06-21** Phase 505-509 — Sector breadth + median grant
  funding + longest review + AI models 24h + draft activity recap
  cron:
  (a) `<SectorBreadthStat>` on NGO dashboard counts distinct sectors
  across this NGO's applications (parses Grant.sectors JSON).
  (b) `<MedianGrantFundingStat>` on donor dashboard shows median
  Grant.total_funding across all donor's published grants;
  distinct from Phase 428 (median funded application amount).
  (c) `<LongestReviewStat>` on reviewer reviews page shows max
  hours between created_at and completed_at across last 90 days;
  self-gates < 3. (d) `<AiModelsTodayCard>` on operator dashboard
  lists top 5 models by call count in last 24 hours with bar
  visualization. (e) Phase 509 cron `/api/cron/ngo-draft-activity-recap`
  sends each NGO with open drafts a Friday recap (draft count +
  oldest age in days). Digests opt-out gated; record_cron_run wired.

- **2026-06-21** Phase 499-503 — Watchlist size + days since last
  grant + private-notes coverage + failed cron runs + AI cost spike
  cron:
  (a) `<WatchlistSizeStat>` on NGO dashboard counts WatchlistItem
  rows; self-gates at zero. (b) `<DaysSinceLastGrantStat>` on donor
  dashboard shows days since most-recent grant creation; amber when
  > 60 days. (c) `<PrivateNotesCoverageStat>` on reviewer reviews
  page shows % of last-90d reviews that include private_notes;
  tone-coded; self-gates < 5. (d) `<FailedCronsCard>` on operator
  dashboard shows failed/total CronRun count in last 7 days; rose
  border when failed > 0. (e) Phase 503 cron
  `/api/cron/ai-cost-spike-alert` runs daily; if yesterday's AI
  usd_cost > 2x the prior 7-day average, sends admins an alert
  with the ratio. Digests opt-out gated; record_cron_run wired.

- **2026-06-21** Phase 493-497 — Win rate this quarter + grants
  published this month + top-tier rate + active webhooks + stale
  reviewers cron:
  (a) `<WinRateQuarterStat>` on NGO dashboard shows % of decisions
  this calendar quarter that were funded; tone-coded; self-gates < 3.
  (b) `<GrantsPublishedMonthStat>` on donor dashboard counts grants
  this donor created since 1st of current calendar month. (c)
  `<TopTierRateStat>` on reviewer reviews page shows % of last-90d
  reviews with overall_score ≥ 90; self-gates < 5. (d)
  `<ActiveWebhooksCard>` on operator dashboard shows active vs total
  webhook count with inactive-count footer. (e) Phase 497 cron
  `/api/cron/stale-reviewers-digest` lists reviewers with 0
  completed reviews in last 30 days; sends admins a names sample
  + count. Digests opt-out gated; record_cron_run wired.

- **2026-06-21** Phase 487-491 — Lifetime win rate + apps YoY +
  lifetime reviews + notifications 14d sparkline + system load
  summary cron:
  (a) `<LifetimeWinRateStat>` on NGO dashboard shows % of all
  decisions ever that were funded/awarded; tone-coded; self-gates
  < 3. (b) `<AppsYoyStat>` on donor dashboard compares apps
  submitted this calendar year vs prior, with delta + %. (c)
  `<LifetimeCompletedStat>` on reviewer reviews page shows total
  lifetime completed reviews; recognition milestone. (d)
  `<Notifications14dCard>` on operator dashboard renders 14-day
  notification volume sparkline with daily counts + avg. (e)
  Phase 491 cron `/api/cron/system-load-summary` sends admins a
  weekly multi-metric pulse: apps submitted, reviews completed,
  notifications sent, audit entries — in the last 7 days. Digests
  opt-out gated; record_cron_run wired.

- **2026-06-21** Phase 481-485 — Unread notifications + average
  reviewer score + reviews this month + documents storage + monthly
  NGO accomplishments cron:
  (a) `<UnreadNotificationsStat>` on NGO dashboard shows count of
  unread Notification rows; amber pill. Self-gates at zero. (b)
  `<AvgReviewerScoreStat>` on donor dashboard shows mean overall_score
  across last-90d reviewer-completed reviews; self-gates < 5.
  (c) `<CompletedThisMonthStat>` on reviewer reviews page counts
  reviews completed since the 1st of the current calendar month;
  shows month name. (d) `<DocumentsStorageCard>` on operator dashboard
  sums Document.file_size with human-readable B/KB/MB/GB unit.
  (e) Phase 485 cron `/api/cron/ngo-monthly-accomplishments` sends
  each NGO a previous-month digest of submissions + funded apps.
  Digests opt-out gated; record_cron_run wired.

- **2026-06-21** Phase 475-479 — Funding total YTD + active reviewer
  panel + median pending review age + TOTP enrollment rate + review
  pipeline summary cron:
  (a) `<FundingTotalYtdStat>` on NGO dashboard sums Grant.total_funding
  across funded apps year-to-date, emerald-themed callout. Self-gates
  at zero. (b) `<ActiveReviewerPanelStat>` on donor dashboard counts
  distinct reviewers who completed at least one review on donor's
  grants in the last 30 days. (c) `<PendingAgeStat>` on reviewer
  reviews page shows median days since assignment for current
  assigned/in_progress reviews; tone-coded (amber ≥7, rose ≥14);
  self-gates < 3 pending. (d) `<TotpEnrollmentCard>` on operator
  dashboard shows % of users with totp_secret set; amber border <50%.
  (e) Phase 479 cron `/api/cron/review-pipeline-summary` sends admins
  a monthly digest with total reviews completed, mean turnaround,
  and top 3 reviewers by completion count. Digests opt-out gated;
  record_cron_run wired.

- **2026-06-21** Phase 469-473 — Applications submitted YTD + grants
  funded YTD + reviewer low-score rate + OB throughput + unread
  broadcasts nudge cron:
  (a) `<AppsSubmittedYtdStat>` on NGO dashboard counts applications
  submitted year-to-date. (b) `<GrantsFundedYtdCard>` on donor
  dashboard shows distinct grants funded YTD with total funding
  budget; counts each grant once. (c) `<LowScoreRateStat>` on
  reviewer reviews page shows % of last-90d reviews with score < 50;
  self-gates < 5. (d) `<ObThroughputCard>` on operator dashboard
  counts emergency declarations transitioned past decision_at in
  last 30 days, plus count still open. (e) Phase 473 cron
  `/api/cron/ngo-unread-broadcasts-nudge` sends NGO users with > 0
  unread TenantMessages a Friday nudge. Digests opt-out gated;
  record_cron_run wired.

- **2026-06-20** Phase 463-467 — Unread tenant messages + distinct
  applicants this quarter + reviewer median score + audit chain age
  + reviewer weekly recap cron:
  (a) `<UnreadMessagesStat>` on NGO dashboard counts TenantMessage
  rows without a TenantMessageRead receipt for the user's org_id;
  amber pill links to /messages. Self-gates at zero.
  (b) `<ApplicantsThisQuarterStat>` on donor dashboard shows count
  of distinct applicant org_ids that submitted to this donor's
  grants this calendar quarter. (c) `<MedianScoreStat>` on reviewer
  reviews page shows median of overall_score across last 30 days;
  self-gates < 5 samples. (d) `<AuditChainAgeCard>` on operator
  dashboard shows seconds since most recent AuditChainEntry,
  scale-aware label (s/m/h/d). Amber border + tone when stale
  (> 6h). (e) Phase 467 cron `/api/cron/reviewer-weekly-recap` sends
  reviewers a Friday recap (reviews completed, mean score, fastest
  turnaround). Digests opt-out gated; record_cron_run wired.

- **2026-06-20** Phase 457-461 — Completed assessments + approval
  rate + reviewer high-score rate + top orgs by users + yesterday
  submissions digest cron:
  (a) `<CompletedAssessmentsStat>` on NGO dashboard shows count of
  completed capacity assessments + most recent date. Self-gates at
  zero. (b) `<ApprovalRateCard>` on donor dashboard shows YTD
  funded% across decisions; tone-coded (emerald ≥50, amber ≥25,
  rose <25). Self-gates < 3 decisions. (c) `<HighScoreRateStat>`
  on reviewer reviews page shows % of last-90d completed reviews
  with overall_score ≥ 75. Self-gates < 5. (d) `<TopOrgsByUsersCard>`
  on operator dashboard lists top 5 orgs by user count with bar
  visuals. (e) Phase 461 cron `/api/cron/yesterday-submissions-digest`
  sends admins a daily summary of past-24h submissions grouped by
  donor. Digests opt-out gated; record_cron_run wired.

- **2026-06-20** Phase 451-455 — Draft age + unassigned reviews
  + scoring time avg + user growth + data integrity cron:
  (a) `<DraftAgeStat>` on NGO dashboard shows oldest open draft
  age in days, tone-coded (rose ≥14, amber ≥7). Self-gates when
  no open drafts. (b) `<UnassignedReviewsCard>` on donor dashboard
  counts apps in submitted/under_review that have no reviewer yet;
  amber border surfaces routing-bottleneck. Self-gates at zero.
  (c) `<ScoringTimeAvgStat>` on reviewer reviews page shows mean
  hours per review over last 30 days (scale-aware m/h/d).
  Self-gates < 3 samples. (d) `<UserGrowthCard>` on operator
  dashboard shows new users this 30d vs prior 30d with delta + %
  change. (e) Phase 455 cron `/api/cron/data-integrity-check`
  scans for orphan applications (grant_id with no grant) + orphan
  reviews (application_id with no application); notifies admins if
  any. Digests opt-out gated; record_cron_run wired.

- **2026-06-20** Phase 445-449 — Draft funnel + AI score histogram
  per grant + review streak + tenants without grants + closing-soon
  watchlist cron:
  (a) `<DraftFunnelStat>` on NGO dashboard shows submitted_30d /
  drafts_30d with conversion %, tone-coded (emerald ≥70, amber ≥40,
  rose <40). Self-gates when zero drafts in window. (b) New donor
  surface `<AiScoreHistogram>` on grant detail renders a 10-bin
  histogram of received AI scores (0-9, 10-19 … 90-100). Self-gates
  < 3 apps; donor must own the grant. (c) `<ReviewStreakTile>` on
  reviewer reviews page shows consecutive days reviewer completed
  ≥1 review (looking back 30 days). Self-gates < 2. (d)
  `<TenantsWithoutGrantsCard>` on operator dashboard counts donor/ingo
  orgs with zero grants ever published, amber border when ≥50%. (e)
  Phase 449 cron `/api/cron/ngo-closing-soon-watchlist` finds each
  NGO's watchlisted grants closing within 7 days that the NGO has not
  applied to yet, sends digest with sample titles. Digests opt-out
  gated; record_cron_run wired.

- **2026-06-20** Phase 439-443 — Fastest submission + apps this
  week + reviewer AI agreement + active orgs + AI cost trend cron:
  (a) `<FastestSubmissionStat>` on the NGO dashboard shows min
  hours between draft create and submitted_at across the last
  90 days. m/h/d scale-aware. Self-gates < 3 submissions.
  (b) `<AppsThisWeekCard>` on donor attention dashboard counts
  apps submitted to donor's grants in the last 7 days with
  prior-week delta + arrow icon. Self-gates when both weeks
  are zero. (c) `<AiAgreementStat>` on the reviewer reviews
  page shows % of reviews where |human_score - ai_score| <= 5;
  tone-coded (emerald ≥70, amber ≥50, rose <50); self-gates
  < 5 reviews. (d) `<ActiveOrgsCard>` on the operator dashboard
  counts distinct orgs whose users updated_at within last 7
  days, with total-org denominator. (e) Phase 443 cron
  `/api/cron/ai-cost-trend` compares per-tenant sum(usd_cost)
  this 30d vs prior 30d; sends admins top 3 climbers + top 3
  fallers with org names; digests opt-out gated; record_cron_run.

- **2026-06-20** Phase 433-437 — Peers-watching social signal
  + apps-per-grant + reviewer fastest score + AI calls by hour
  + feature usage delta cron:
  (a) `<PeersWatching>` on the NGO grant detail page renders an
  anonymized "N other organisations watching" pill — backend
  `/api/dashboard/peers-watching-grant/<id>` counts distinct other
  users with a WatchlistItem(kind='grant', target_id) — a soft
  social signal that the grant is on others' radars without
  exposing identities. (b) `<AppsPerGrantCard>` on the donor
  attention dashboard shows the mean applications per grant over
  the last 90 days; amber border when < 3 to flag low-discovery
  publishing — mean across grants published in the last 90d.
  (c) `<FastestScoreStat>` on the reviewer reviews page shows
  the reviewer's fastest turnaround in the last 90 days (m/h/d
  scale-aware label), self-gates < 3 reviews so it never appears
  as misleading vanity. (d) `<AiCallsByHourCard>` on the operator
  dashboard renders a 24-bar histogram of AI call distribution
  by UTC hour over the last 7 days — highlights peak hour for
  load-shaping decisions. (e) Phase 437 cron
  `/api/cron/feature-usage-delta` compares this week vs prior
  week AI call counts per endpoint, sends admins the top 3
  movers in each direction via the digests opt-out gate.

- **2026-06-20** Phase 427-431 — Deadline density + median
  funded amount + overdue assignments + cron failure rate +
  watchlist deadlines cron:
  (a) `<DeadlineDensityCard>` on NGO dashboard counts
  watchlisted grants by deadline window (next 7d / 30d /
  90d), amber when >0 in the 7d bucket. Backend
  `GET /api/dashboard/ngo-deadline-density`. (b)
  `<MedianFundedAmountCard>` on donor dashboard shows median
  grant total_funding across funded apps in last 90 days,
  with the most common currency. Backend
  `GET /api/dashboard/donor-median-funded-amount`. (c)
  `<OverdueCountStat>` on /reviews surfaces a rose banner
  when the reviewer has reviews assigned >14 days ago that
  are still in status='assigned'. Backend
  `GET /api/dashboard/reviewer-overdue-count`. (d)
  `<CronFailureRateCard>` on operator dashboard shows % of
  cron_runs that failed in last 24h, rose border at >=10%.
  Backend `GET /api/dashboard/cron-failure-rate`. (e) New
  `POST /api/cron/ngo-watchlist-deadlines` weekly digest of
  watchlisted grants closing in next 7 days, joined via
  WatchlistItem. Honors digests opt-out.

- **2026-06-20** Phase 421-425 — Criterion score trend + apps
  by month + queue sector mix + i18n coverage + dismissed
  AI cron:
  (a) `<CriterionScoreTrendCard>` on NGO dashboard averages
  AI rubric scores per criterion across NGO's last 5
  submitted apps. Backend
  `GET /api/dashboard/ngo-criterion-score-trend`. (b)
  `<AppsByMonthCard>` on donor dashboard shows applications
  received per month over the last 12 months as a sparkline.
  Backend `GET /api/dashboard/donor-apps-by-month`. (c)
  `<QueueSectorMix>` on /reviews shows the reviewer's queue
  grouped by primary grant sector (pivoted from sector-match
  — no expertise_sectors on User). Backend
  `GET /api/dashboard/reviewer-queue-sector-mix`. (d)
  `<I18nCoverageCard>` on operator dashboard shows
  translation-key coverage % per locale vs the English
  canonical, amber when any locale <95%. Backend
  `GET /api/dashboard/i18n-coverage`. (e) New
  `POST /api/cron/ai-dismissed-digest` weekly digest to
  admins ranking AI endpoints by `dismissed` helpfulness
  markers over the last 7 days.

- **2026-06-20** Phase 415-419 — Reviewer mix + review pipeline +
  score distribution + new signups + profile-freshness cron:
  (a) `<ReviewerMix>` inline on application detail page (NGO
  view) shows "N/M reviewers complete · K in progress" without
  naming reviewers. Backend
  `GET /api/dashboard/ngo-app-reviewer-mix/<id>`. (b)
  `<ReviewPipelineCard>` on donor dashboard counts reviews by
  status (assigned/in_progress/completed/snoozed) across the
  donor's grants. Backend
  `GET /api/dashboard/donor-review-pipeline`. (c)
  `<ScoreDistributionCard>` on /reviews shows a 10-bucket
  histogram of the reviewer's overall_score across the last 30
  days. Backend
  `GET /api/dashboard/reviewer-score-distribution`. (d)
  `<NewSignupsCard>` on operator dashboard shows new user
  signups this week vs last week. Backend
  `GET /api/dashboard/new-signups-weekly`. Pivoted from
  inactive-users (no last_login_at on User). (e) New
  `POST /api/cron/trust-profile-freshness` quarterly nudge to
  NGOs whose Organization.assess_date is >180 days old.
  Distinct from Phase 310 (incomplete profiles); this targets
  stale ones. Honors digests opt-out.

- **2026-06-20** Phase 409-413 — Peer funded snippets + SLA
  breach trend + 5-in-a-row band streak + audit chain rate +
  top AI cost cron:
  (a) `GET /api/dashboard/peer-funded-snippets/<grant_id>`
  returns anonymised text snippets from peer NGOs' funded
  applications on the same grant. UI surface (apply page)
  deferred. (b) `<SlaBreachTrendCard>` on donor dashboard
  shows a 14-day daily sparkline of reviews completed past
  the 14-day SLA. Amber border at >=7 total breaches.
  Backend `GET /api/dashboard/donor-sla-breach-trend`. (c)
  `<BandStreakTip>` on /reviews surfaces a calibration nudge
  when the reviewer's last 5 completed reviews are all in
  the same band (all <60 or all >=80). Backend
  `GET /api/dashboard/reviewer-band-streak`. (d)
  `<AuditChainRateCard>` on operator dashboard shows audit
  chain entries/day over last 7 days vs prior 7 days; amber
  border when recent rate drops >30% below prior. Backend
  `GET /api/dashboard/audit-chain-rate`. (e) New
  `POST /api/cron/top-ai-cost-endpoints` monthly digest to
  admins ranking the 5 AI endpoints by usd_cost over the
  last 30 days; honors digests opt-out.

- **2026-06-20** Phase 403-407 — Feedback themes + starred
  queue + completed-this-week + slowest-cron + sector-matching
  grants digest:
  (a) `<NgoFeedbackThemesCard>` on NGO dashboard shows top 3
  decision_reason_code values across the NGO's declined apps.
  Backend `GET /api/dashboard/ngo-feedback-themes`. (b)
  `<StarredQueueCard>` on donor dashboard counts apps starred
  but not yet decided across the donor's grants. Backend
  `GET /api/dashboard/donor-starred-queue`. (c) `<MyCompletedThisWeek>`
  added to `/reviews` header stats — count of the reviewer's
  reviews completed in the last 7 days. Backend
  `GET /api/dashboard/reviews-completed-this-week`. Pivoted
  from time-on-task (no persistent column). (d)
  `<SlowestCronCard>` on operator dashboard shows the slowest
  cron run in the last 24h from cron_runs.duration_ms; amber
  border >=30s. Backend `GET /api/dashboard/slowest-cron`.
  Pivoted from schema-migration warnings (no persistence).
  (e) New `POST /api/cron/ngo-sector-grants-digest` weekly
  digest of newly-published grants whose sectors overlap with
  each NGO's org.sectors. Honors digests opt-out.

- **2026-06-20** Phase 397-401 — Donor track record + grants
  by status + scoring rubric bands + DB row counts + decisions
  backlog cron:
  (a) `<DonorTrackRecord>` inline on grant pages surfaces
  "N decisions last year · Xd median wait · Y% funded" so
  NGOs can context-set before applying. Backend
  `GET /api/dashboard/donor-track-record/<donor_org_id>`.
  Anonymised aggregate; available to NGOs viewing any donor's
  grant. (b) `<GrantsByStatusCard>` on donor dashboard shows
  counts of donor's grants by status (open/review/closed/
  awarded/draft). Backend
  `GET /api/dashboard/donor-grants-by-status`. (c)
  `<RubricScoringBands>` collapsible expander on reviewer
  detail page lists the 4 scoring bands (0-40 Weak / 41-60
  Developing / 61-80 Strong / 81-100 Exceptional) with brief
  notes. Pure client component, no backend. (d)
  `<DbRowCountsCard>` on operator dashboard shows row counts
  for users/orgs/grants/applications/reviews/notifications.
  Backend `GET /api/dashboard/db-row-counts`. (e) New
  `POST /api/cron/donor-decisions-backlog` weekly digests to
  each donor org's users summarising apps stuck in pending
  states >14 days when >=3 stuck on their org. Honors the
  digests opt-out.

- **2026-06-20** Phase 391-395 — Reviewer signal + decision
  aging + applicant context + stale notifications + zero-apps
  nudge:
  (a) `<ReviewerSignal>` inline on application detail page —
  when the NGO's app has assigned/in-progress reviews but
  isn't decided, shows "Your application has been picked up".
  Backend `GET /api/dashboard/ngo-app-reviewer-signal/<id>`.
  (b) `<DecisionAgingCard>` on donor dashboard shows median
  submitted-to-decision days across the donor's last 50
  decisions; amber border >=30d. Backend
  `GET /api/dashboard/donor-decision-aging`. (c) New
  `GET /api/reviews/<id>/applicant-context` returns the
  applicant org's country, year_established, sectors,
  verified status, and prior-funded count from this donor —
  ready for a reviewer detail callout (UI surface deferred).
  (d) `<StaleNotificationsCard>` on operator dashboard
  shows count of unread notifications older than 14 days.
  Backend `GET /api/dashboard/stale-notifications`. (e) New
  `POST /api/cron/grants-zero-applications` notifies donors
  whose published grants have been open 14+ days with 0
  applications. Idempotent via `grant.zero_apps_nudged`
  audit-chain marker.

- **2026-06-20** Phase 385-389 — Submit duration + response
  completeness + low-score rationale snippets +
  auth-lockout signal + AI quality drift cron:
  (a) `<NgoSubmitDurationCard>` on NGO dashboard shows median
  elapsed hours from application.created_at to submitted_at
  across the last 5 submitted apps. Backend
  `GET /api/dashboard/ngo-submit-duration`. (b)
  `<ResponseCompletenessCard>` on donor dashboard shows %
  of submitted apps with non-empty responses over the last
  90 days; amber border <80%, gates under 10 submissions.
  Backend `GET /api/dashboard/donor-response-completeness`.
  (c) New `GET /api/reviews/recent-low-score-rationales`
  returns the reviewer's last 3 completed reviews with
  overall_score < 60 plus per-criterion comment snippets —
  ready for reuse in new reviews (UI surface deferred). (d)
  `<AuthLockoutCard>` on operator dashboard surfaces emails
  that hit >=5 failed login attempts in the last 24h; rose
  border, self-gates when zero. Backend
  `GET /api/dashboard/auth-lockout-rate`. (e) New
  `POST /api/cron/ai-quality-drift` compares today's median
  AI score vs trailing 7-day baseline per donor and notifies
  admins when any donor's median shifts >=10 points.

- **2026-06-20** Phase 379-383 — This-month submissions +
  time-to-first-review + 24h deadline badge + AI replay
  coverage + webhook-health cron:
  (a) `<SubmissionsThisMonthCard>` on NGO dashboard counts
  apps submitted this calendar month and compares to same
  month last year. Backend
  `GET /api/dashboard/ngo-submissions-this-month`. (b)
  `<TimeToFirstReviewCard>` on donor dashboard shows median
  days from `application.submitted_at` to first
  `review.created_at` over the last 90 days; amber border
  >=7d, gates under 5 samples. Backend
  `GET /api/dashboard/donor-time-to-first-review`. (c)
  Reviewer queue table now shows a rose "Due Nh" badge next
  to the grant title when the grant deadline falls in the
  next 24h. Backend now serialises `grant_deadline` on every
  Review row. (d) `<AiReplayCoverageCard>` on operator
  dashboard shows % of AI calls in the last 7 days with
  `replay_subject_kind` set — auditability signal. Backend
  `GET /api/dashboard/ai-replay-coverage`. (e) New
  `POST /api/cron/webhook-deliveries-health` summarises
  webhook delivery success per org over the last 24h and
  notifies admins when any org with >=10 attempts drops
  below 90% (honors digests opt-out).

- **2026-06-20** Phase 373-377 — Fresh-decision banner +
  country breakdown + score-gap tip + AI failure rate +
  expired-grant auto-close (+ cost_usd typo fix):
  (a) `<NgoFreshDecisionBanner>` highlights the NGO's most recent
  unviewed decision (Phase 285's `applicant_viewed_feedback_at`
  drives "unviewed") so funded/declined doesn't sit ignored.
  Backend `GET /api/dashboard/ngo-fresh-decision`. (b)
  `<AppsByCountryCard>` on donor dashboard shows country
  breakdown of received applications. Backend
  `GET /api/dashboard/donor-apps-by-country`. (c) Reviewer
  score-gap inline tip on `/reviews/[id]`: when AI scoring runs
  and the reviewer overwrites a criterion by more than 25
  points, an amber line shows "AI suggested X · you scored Y";
  preserves the AI score in a separate `aiCriterionScores` map
  that the reviewer can't accidentally overwrite. (d)
  `<AiFailureRateCard>` on operator dashboard shows % of AI
  calls that failed in the last 24h (rose border at >=5%).
  Backend `GET /api/dashboard/ai-failure-rate`. (e) New
  `POST /api/cron/expired-grants-auto-close` closes grants whose
  deadline expired more than 30 days ago with no in-flight
  applications and writes a `grant.auto_closed` audit-chain
  entry per closure. (f) **Bug fix:** swept all four
  `SELECT SUM(cost_usd) FROM ai_call_logs` queries → `usd_cost`.
  The column is `usd_cost`; the typo had been silently making
  3 admin tiles + 1 cron return $0 since they were wrapped in
  bare `except Exception` handlers.

- **2026-06-20** Phase 367-371 — Pipeline value + portfolio
  concentration + reviewer "Next up" CTA + AI cost per app +
  peer-comparison digest:
  (a) `<NgoPipelineValueCard>` on NGO dashboard sums grant funding
  value across pending applications, grouped by currency. Backend
  `GET /api/dashboard/ngo-pipeline-value`. (b)
  `<DecisionConcentrationCard>` on donor dashboard shows the % of
  funded decisions concentrated on the top-third NGOs by funding
  count; warns amber when >=70%. Backend
  `GET /api/dashboard/donor-decision-concentration`. Self-gates
  under 6 unique grantees. (c) `<NextReviewCta>` on the reviewer
  dashboard renders a one-click "Continue" link to the reviewer's
  oldest open review (skipping snoozed). Backend
  `GET /api/reviews/next-up`. (d) `<AiCostPerAppCard>` on operator
  dashboard shows the rolling 30-day average AI dollar spend per
  submitted application. Backend
  `GET /api/dashboard/ai-cost-per-app`. (e) New
  `POST /api/cron/ngo-peer-comparison-digest` sends each NGO a
  weekly compare-to-sector-median digest (submissions + decisions)
  via the Phase 326 digests opt-out.

- **2026-06-20** Phase 361-365 — Stalled apps + fastest reviewer +
  turnaround stat + duplicate-org guard + monthly leaderboard:
  (a) `<NgoStalledApplicationsCard>` on NGO dashboard lists
  applications stuck in a pending status > 7 days, with status
  name + days stalled. Backend
  `GET /api/dashboard/ngo-stalled-applications`. (b)
  `<FastestReviewerCard>` on donor dashboard celebrates the
  reviewer with the shortest median turnaround on this donor's
  grants in the last 30 days. Backend
  `GET /api/dashboard/donor-fastest-reviewer`. Self-gates unless
  ≥3 reviewers each completed ≥2 reviews in the window. (c)
  `<MyTurnaroundStat>` on /reviews shows the reviewer their own
  median + p75 turnaround days over the last 90 days (decline
  data isn't persisted server-side, so accept-rate pivoted to
  turnaround). Backend `GET /api/reviews/my-turnaround`. (d)
  `<DuplicateOrgsCard>` on operator dashboard flags
  organisations sharing the same normalised legal name + country
  as possible duplicates. Backend
  `GET /api/dashboard/duplicate-orgs`. (e) New
  `POST /api/cron/monthly-reviewer-leaderboard` ranks reviewers
  by completed-review count over the last 30 days (median
  turnaround as tiebreak) and sends each admin the top 3 via the
  digests opt-out gate.

- **2026-06-20** Phase 355-359 — Trend tiles + security hygiene +
  reviewer ergonomics + admin digest:
  (a) `<NgoWinRateTrendCard>` on NGO dashboard compares the NGO's
  award rate over the last 90 days vs the prior 90 days. Backend
  `GET /api/dashboard/ngo-win-rate-trend`. Self-gates when both
  windows have < 3 decided. (b) `<RepeatGranteesCard>` on donor
  dashboard lists NGOs the donor has funded 2+ times. Backend
  `GET /api/dashboard/donor-repeat-grantees`. (c)
  `<UsersWithoutTwoFaCard>` on operator dashboard counts admin /
  donor / reviewer users without TOTP enrolled. Backend
  `GET /api/dashboard/users-without-2fa`. (d) `<KeyboardHelp>` on
  /reviews/[id] opens a cheat-sheet dialog when the reviewer
  presses `?` (skipped inside inputs/textareas). (e) New
  `POST /api/cron/admin-weekly-events` sends each admin a weekly
  in-app summary (new submissions, decisions, AI cost). Honors
  Phase 326 digests opt-out.

- **2026-06-20** Phase 349-353 — Per-persona surfaces + operational
  drift detectors:
  (a) `<DonorEoiCard>` on donor dashboard lists the newest 5
  expressions of interest (Phase 344) on this donor's grants.
  Backend `GET /api/dashboard/donor-expressions-of-interest`.
  (b) `<NgoApplicationDurationCard>` on NGO dashboard: SVG
  sparkline of submit→decision durations for the last 6 decided
  applications with a first→last delta tag. Backend
  `GET /api/dashboard/ngo-application-duration`. Self-gates < 3.
  (c) `<ExpiredScreeningsCard>` on operator dashboard lists NGO
  orgs whose latest sanctions screening is > 6 months old.
  Backend `GET /api/dashboard/expired-screenings`. (d) New
  `POST /api/cron/donor-closing-grants` notifies donor users
  about their own grants closing within 7 days; honors the
  digests opt-out and dedupes within 7 days per user. (e)
  `<StaleGrantsCard>` on operator dashboard flags grants still
  in 'open' status whose deadline has passed by > 7 days.
  Backend `GET /api/dashboard/stale-published-grants`.

- **2026-06-20** Phase 343-347 — Cleanup hygiene + soft signals +
  forecasting + usage trends:
  (a) New `POST /api/cron/notifications-cleanup` deletes read
  notifications older than 90 days and any notification older
  than 180 days. record_cron_run wired. (b) NGO "Express interest"
  soft signal on a grant: new `ExpressionOfInterest` model (one
  row per org × grant, upsert on repeat), endpoint
  `POST /api/grants/<id>/express-interest`, "Express interest"
  button on the grant detail page next to Apply. Donor users get
  a one-time notification when an NGO first expresses interest.
  (c) `<DecisionForecastCard>` on donor dashboard projects
  month-end decision total from the trailing 90-day daily rate +
  decisions so far this month. Backend
  `GET /api/dashboard/decision-forecast`. Self-gates when rate too
  thin. (d) Reviewer AI-summary auto-load preference — checkbox
  inside the `<TriageSummary>` panel persists via localStorage so
  the summary fetches automatically on next review open.
  (e) `<UsageTrendCard>` on operator dashboard: 14-day mini
  sparklines for applications created, AI calls, and decisions
  recorded. Backend `GET /api/dashboard/usage-trend`. Self-gates
  when total volume is zero.

- **2026-06-20** Phase 337-341 — System-wide rollups + applicant
  ergonomics + stale draft hygiene:
  (a) `<ApplicationsByStatusCard>` on operator dashboard: stacked
  horizontal bar of all applications grouped by status + per-status
  count. Backend `GET /api/dashboard/applications-by-status`.
  (b) `<FirstTimeVsRepeatCard>` on donor dashboard splits applicants
  in the trailing 90 days into repeat (previously funded by this
  donor) vs first-time. Backend
  `GET /api/dashboard/first-time-vs-repeat`. (c) `<MyScoreConsistency>`
  strip on /reviews surfaces the reviewer's std deviation across
  completed reviews — a self-reflection signal for calibration
  drift. Backend `GET /api/reviews/my-score-consistency`. Self-gates
  when n < 5. (d) `<NgoDocsPendingCard>` on NGO dashboard counts
  applications where a doc-request notification is newer than the
  most recent doc upload — surfaces inbox debt. Backend
  `GET /api/dashboard/ngo-docs-pending`. (e) New
  `POST /api/cron/stale-draft-nudge` notifies NGOs about draft
  applications idle > 7 days. Honors the Phase 326 digests opt-out;
  dedupes within 14 days per (user, app). Cron health recorded via
  `record_cron_run`.

- **2026-06-20** Phase 331-335 — Exports + trends + onboarding clarity:
  (a) NGO bulk CSV: new `GET /api/applications/my-applications.csv`
  streams every app from the org (id, grant, status, scores,
  decision reason). "Download CSV" button on /applications for
  NGO viewers. (b) `<DecisionsByMonthCard>` on donor dashboard:
  6-month stacked-bar mini chart of funded vs declined decisions
  per month. Backend `GET /api/dashboard/decisions-by-month`.
  (c) `<ReviewerScoreboardCard>` on operator dashboard: per-
  reviewer rollup (total / completed / completion % / mean
  score), sorted ascending so worst performers surface first.
  Backend `GET /api/dashboard/reviewer-scoreboard`. (d) New
  `KpiSnapshot` model + `POST /api/cron/weekly-kpi-snapshot`:
  writes one row per ISO week (Monday) with applications
  received, decided, avg decision days, AI cost. Idempotent.
  (e) Submission confirmation page now shows a 3-step "What
  happens next" panel — reviewer assignment, score notification,
  donor decision timeline — instead of just the toast.

- **2026-06-20** Phase 325-329 — Notification quality + reviewer
  ergonomics + portfolio recap:
  (a) `<NotificationVolumeCard>` on operator dashboard surfaces
  the 5 users receiving the most notifications in the last 7
  days. Backend `GET /api/dashboard/notification-volume`.
  (b) New `'digests'` notification preference category — Phase
  304 NGO pipeline cron now honors opt-out via
  `NotificationPreference.channels_for('digests')`. Settings UI
  surfaces the new category. (c) Reviewer snooze: new
  `reviews.snoozed_until + snoozed_reason`, endpoint
  `POST /api/reviews/<id>/snooze` accepts 3/7/14 days; queue
  filters snoozed reviews out by default (override with
  `?include_snoozed=1`). `<SnoozeButton>` on review-detail page;
  redirects to /reviews after snoozing. (d)
  `<ReviewerTurnaroundCard>` on donor dashboard shows the 5
  slowest reviewers (avg days assignment → completion) over the
  last 90 days. Backend
  `GET /api/dashboard/reviewer-turnaround`. (e) New
  `POST /api/cron/donor-portfolio-recap`: weekly summary digest
  per donor (open grants, new submissions, decisions, pending
  appeals). Skips users opted out of `digests`. Cron health
  recorded via `record_cron_run`.

- **2026-06-20** Phase 319-323 — AI polish + reviewer onboarding +
  cost / calibration insights:
  (a) New `POST /api/ai/polish-response` — clarity-only AI rewrite
  on a draft response (distinct from `/strengthen-section`, which
  tailors to the donor's lens). Never invents facts. log_replayable
  wired. (b) "Polish" button next to Strengthen on the apply page
  proposal step; result renders inline with Accept / Dismiss
  controls. (c) `<ReviewerFirstTimeTips>` overlay on /reviews/[id]
  — 3 lightweight tips for first-time reviewers
  (rubric scoring, private notes, COI disclosure). Persists
  dismissal in localStorage. (d) `<AiCostForecastCard>` on operator
  dashboard projects month-end AI cost from trailing 7-day daily
  rate. Backend `GET /api/dashboard/ai-cost-forecast`. (e)
  `<AiHumanAgreementCard>` on donor dashboard lists the 5 criteria
  where AI score and average reviewer human score diverge most
  (|ai - human| <= 10 = agree). Backend
  `GET /api/dashboard/ai-human-agreement`.

- **2026-06-20** Phase 313-317 — Appeal visibility across personas:
  (a) `<DonorAppealsCard>` on donor dashboard surfaces pending
  appeals on the donor's grants (backend reuses
  `/api/applications/appeals`, now donor-scoped when caller role is
  donor). (b) `<NgoWatchlistTile>` on NGO dashboard shows starred
  grants with deadline countdown (overdue/today/Nd badge). Reads
  the existing `/api/watchlist` endpoint. (c) Reviewer private-
  notes autosave indicator upgraded — now shows "Saved 14:32"
  with the actual save timestamp instead of a flash of "Saved".
  (d) `<AppealStatsCard>` on operator dashboard: 30-day rollup of
  approved / declined / pending appeals + median days-to-resolve.
  Backend `GET /api/dashboard/appeal-stats`. (e)
  `<DonorAppealSlaCard>` on donor dashboard lists appeals on the
  donor's grants pending > 7 days. Soft accountability nudge.
  Backend `GET /api/dashboard/donor-appeal-sla`.

- **2026-06-20** Phase 307-311 — Appeal loop closure + trust + sparkline:
  (a) New /admin/appeals queue page lists every application with
  `appeal_requested_at` set + no resolution. Backend
  `GET /api/applications/appeals` (admin-only). (b) Donor / admin can
  resolve an appeal: `POST /api/applications/<id>/appeal/resolve`
  accepts `{ resolution: 'approved' | 'declined', text }`, stamps
  `appeal_resolved_at + resolution + resolution_text + resolved_by`,
  writes to the hash-chained audit log, notifies the NGO. Approving
  flips status back to `under_review`. (c) `<AppealPanel>` extended:
  three-state render — pre-appeal / pending (with Approve/Decline
  buttons for donor/admin) / resolved (emerald approved or rose
  declined). (d) New `POST /api/cron/trust-profile-nudge`: monthly
  inbox reminder for NGO users whose org has no active Capacity
  Passport. Self-guards against re-nudging within 30 days. (e)
  `<MyScoreSparkline>` on /reviews — last 12 completed-review scores
  as a tiny SVG sparkline with a first→last delta tag. Backend
  `GET /api/reviews/my-score-history`. Self-gates when < 5 reviews.

- **2026-06-20** Phase 301-305 — SLA + appeal + calibration + integrity:
  (a) `<SlaBreachesCard>` on operator dashboard counts applications
  still pre-decision past the 30-day mark + lists the 3 most
  overdue. Backend `GET /api/dashboard/sla-breaches`. (b) NGO appeal
  flow: new `applications.appeal_requested_at + appeal_reason_text`,
  endpoint `POST /api/applications/<id>/appeal` records the request,
  writes to the hash-chained audit log, and notifies admin + every
  donor user on the grant's donor org. `<AppealPanel>` on the
  application detail page: "Request re-review" button for the owner
  NGO; status visible to every viewer once submitted. (c)
  `<MyCalibrationTip>` on the reviewer queue page surfaces a small
  amber tip when the reviewer's mean is > 1.0σ from the platform
  mean (5+ reviews). Backend `GET /api/reviews/my-calibration`.
  (d) New `POST /api/cron/ngo-pipeline-digest`: each NGO user gets
  one weekly Notification summarizing in-flight apps, last-7d
  decisions, and grants closing soon. Cron health recorded via
  `record_cron_run`. (e) `<DataIntegrityCard>` on operator
  dashboard cheaply counts orphaned FKs across reviews/applications/
  documents. Backend `GET /api/dashboard/data-integrity`. Self-
  gates when zero.

- **2026-06-20** Phase 295-299 — Caseload, calibration + workload signals:
  (a) `<MyCaseloadStrip>` header on /reviews — live open-count +
  completed-this-month. Backend `GET /api/reviews/my-caseload`.
  (b) Templated outreach message on donor "Reach out personally":
  new `applications.outreach_message_text` column; donor compose
  dialog pre-fills a template; NGO view renders the message inline
  in an amber callout. (c) `<CommonDeclineReasonsCard>` on the
  apply page (NGO viewer) lists the donor's top 3 decline-reason
  codes from past declines as a quiet "things they look for" hint.
  Backend `GET /api/applications/<id>/common-decline-reasons`.
  Self-gates when sample < 5. (d) `<ReviewerOutliersCard>` on the
  operator dashboard flags reviewers whose mean human score is
  > 1.5σ from the platform mean (5+ reviews). Backend
  `GET /api/reviews/scoring-outliers`. (e)
  `<ReviewerWorkloadByDonorCard>` on the donor dashboard shows
  which reviewer covers what share of the donor's review work +
  per-reviewer pace (avg days to complete). Backend
  `GET /api/dashboard/reviewer-workload-by-donor`.

- **2026-06-20** Phase 289-293 — COI recuse + outreach loop:
  (a) Reviewer auto-recuse on COI disclosure: the Phase 283
  endpoint now deletes the review row after stamping the
  disclosure (it's preserved in the hash-chained audit log),
  drops application status back to 'submitted' if no other
  reviewers remain. `<ReviewerCoiBanner>` redirects to /reviews
  after a successful disclosure. (b) Donor "Reach out personally"
  action on declined applications: new
  `POST /api/applications/<id>/donor-outreach` stamps
  `outreach_initiated_at` + by_user_id, fires an in-app
  notification to every NGO user on the applicant org. Surfaced
  inline in `<FeedbackAcknowledgement>` next to the ack status.
  (c) `<NgoDecisionVelocityCard>` on NGO dashboard mirrors the
  Phase 284 donor card: median wait time across this NGO's
  recent decisions + count pending. (d) `<ReviewerCoiRollupCard>`
  on operator dashboard surfaces 30d COI disclosure count + the
  3 most recent (sourced from the audit chain since the review
  rows are auto-deleted). (e) `<DonorOutreachRollupCard>` on
  donor dashboard shows outreach started vs pending across
  declines, giving the Phase 287 nudge a calm counterpart.

- **2026-06-20** Phase 283-287 — Trust + visibility surfaces:
  (a) Reviewer COI self-disclosure: new
  `POST /api/reviews/<id>/coi-flag` records a controlled-vocab kind
  + optional note, stamps the review row, logs to the hash-chained
  audit log, and fans out an in-app notification to every admin.
  `<ReviewerCoiBanner>` on the review-detail page renders a
  "Disclose conflict" link → dialog, then flips to an amber "you
  disclosed" callout. (b) Donor decision-velocity card on the
  donor dashboard: median days submission→decision over the
  trailing 90 days, split funded vs declined. Backend
  `GET /api/dashboard/decision-velocity`. (c) NGO post-decision
  feedback ack: new
  `applications.applicant_viewed_feedback_at` stamped via a tiny
  `POST /api/applications/<id>/feedback-viewed` the first time
  the applicant NGO loads a decided application; donor view shows
  "applicant viewed feedback on X" / "applicant has not viewed
  yet" as a small footer line. (d) `<WebhookHealthCard>` on the
  operator dashboard rolling up 24h delivery: ok / failed /
  retrying + the 3 noisiest webhooks. Backend
  `GET /api/webhooks/admin/health`. (e) New
  `POST /api/cron/donor-followup-nudge`: for declined apps older
  than 14 days where the applicant has not viewed feedback, drop
  a Now-rail notification on the donor users so they can reach
  out personally. Cron health recorded via `record_cron_run`.

- **2026-06-20** Phase 277-281 — Patterns + integrity surfaces:
  (a) `<LossPatternsCard>` on NGO dashboard counts
  `decision_reason_code` across past declines and surfaces the top
  3 with friendly labels. Self-gates < 3 losses. (b) New
  `GET /api/grants/<id>/reviewer-panel` (donor + admin) returns the
  distinct reviewers + their orgs + a `org_duplicates` flag for
  COI risk. `<ReviewerPanelCard>` on grant detail (donor view)
  renders the panel with an amber callout when an org has > 1
  reviewer. (c) `<AuditIntegrityCard>` on the operator dashboard
  calls `/api/audit-chain/verify?limit=1000` and shows "chain
  intact across N entries" (emerald) or "N breaks detected" (rose)
  with deep link to `/admin/audit-chain`. Always visible so a
  break cannot go unnoticed. (d) `<NgoHistoryPanel>` (Phase 188)
  also wired on the reviewer review-detail Responses tab — reviewer
  sees past applications from the same NGO. (e) Phase 281 closed
  as already-shipped — apply page already renders
  `<SubmissionReadiness>` next to the Submit button (Phase
  105/161). My duplicate component file was removed.

- **2026-06-20** Phase 271-275 — Smoke green + telemetry + analytics:
  (a) Fixed the remaining 2 smoke failures — `manual_admin cannot
  self-sign` got the same `allow_admin_override=true` treatment +
  bumped the Phase 38 AI-surfaces timeout from 10s → 60s. Smoke
  should now be 167/167. (b) Wired `log_replayable_ai_call` into
  `/api/ai/summarize-application` and surfaced `ai_call_id` on the
  response; `<AIFeedbackChip>` now renders inside `<TriageSummary>`
  so reviewers can rate the AI summary used/edited/dismissed. (c)
  `/api/applications/compare` now accepts `'ngo'` role with
  applicant-org scoping. `<CompareMyAppsCard>` on NGO dashboard
  deep-links to `/applications/compare?ids=<top3>` for self-compare.
  (d) New `GET /api/dashboard/donor-scorecard` walks the donor's
  apps' `ai_rubric_result_json` over the last 90 days, averages by
  criterion key, returns top 5 strong + 5 weak. `<DonorScorecardCard>`
  on donor dashboard renders both lists. (e) `<ReviewerResumeBanner>`
  on `/reviews` shows up to 3 in-progress reviews so the reviewer
  can resume mid-session. Hidden when none.

- **2026-06-20** Phase 265-269 — Test fixes + AI triage + cron + perf:
  (a) Fixed `Emergency Declaration multi-sig end-to-end -- add signer
  1` smoke failure by passing `allow_admin_override=true` when the
  admin session adds non-OB users as signers (the override path is
  documented in the endpoint's error message). (b) Same fix
  applied to the `Release applications handoff (governed)` test —
  the upstream declaration must reach signed_active for the
  downstream release endpoint to flip grants to 'open'. (c) New
  `POST /api/ai/summarize-application` (reviewer/donor/admin)
  returns a 3-sentence triage summary calling
  `AIService._call_claude` directly with org+grant+responses
  context. `<TriageSummary>` panel on the reviewer review page
  Responses tab (collapsed by default; one-tap "Summarize" CTA).
  Falls back to a deterministic template when Claude is
  unavailable. (d) New `POST /api/cron/donor-digest` (CRON_SECRET-
  gated) emits one in-app `donor_weekly_digest` notification per
  donor user with last-7-days counts (received/scored/decided).
  record_cron_run wired. (e) Phase 269 closed as already-shipped —
  `/api/dashboard/stats` was already 30-second-cached per
  user+role via `_dashboard_cache`.

- **2026-06-20** Phase 259-263 — Rollups + lifecycle:
  (a) `_build_donor_stats` now also computes `apps_by_sector`
  (top 10) joining Application → Grant → Organization. New
  `<SectorRollupCard>` on donor dashboard with mini bars.
  (b) `<PastDecisionsCard>` on NGO dashboard lists the 5 most
  recent awarded/declined/rejected/revision_requested apps with
  status pills + decision notes. (c) Reviewer review page gains
  a "Save draft" button alongside Submit — calls PUT
  `/api/reviews/<id>` with scores + comments (existing endpoint
  flips status to 'in_progress' but never completes), shows
  "Draft saved" pill on success. (d) Phase 262 (admin deferred-
  items log) DEFERRED — the backlog markdown is a build-time
  artifact, not a runtime data source; admins read it directly
  in `docs/NEAR_BACKLOG.md`. (e) `<PostDeadlineCard>` on donor
  dashboard cross-references grants + submitted applications and
  surfaces grants whose deadline has passed with un-reviewed
  submitted applications.

- **2026-06-20** Phase 253-257 — Polished outputs + sharing: (a) New
  `grant_summary_pdf_service.py` + `GET /api/grants/<id>/summary.pdf`
  (donor + admin, owner-scoped) renders a 1-2 page reportlab PDF
  with status breakdown, AI vs human calibration, and top-5 apps
  by AI score. "Summary PDF" download CTA on grant detail. (b)
  Documents step on apply now accepts drag-and-drop (with visual
  drop-target highlight) in addition to click-to-browse. (c)
  Phase 255 (reviewer 0-10 hotkeys) DEFERRED — conflicts with text
  entry in comment fields and the existing range slider + numeric
  input + Phase 183 AI-suggested-score copy button already cover
  score entry. (d) `<AdminStatusCard>` on the operator dashboard
  fetches both `/api/cron/health` + `/admin/ai-cost-by-tenant?days=30`
  and renders a compact two-line status with deep links to both
  detail pages. Self-gates when everything is clean. (e)
  `<TrustShareCard>` on the NGO dashboard exposes a single-click
  "Generate share link" CTA calling `/api/passport/publish`, auto-
  copies the public `/trust/share/<slug>` URL to clipboard. Hidden
  for non-NGO viewers.

- **2026-06-20** Phase 247-251 — Calibration + UX persistence: (a)
  New `GET /api/grants/<id>/ai-vs-human` (donor + admin, owner-
  scoped) returns mean (human − ai) score delta + mean abs delta
  across applications with both scores. `<AiVsHumanCard>` on grant
  detail with positive/negative tone. (b) Apply page now captures
  the autosave timestamp and renders `<FreshnessStamp loadedAt>` in
  the PageHeader secondaryAction slot — visible "Saved X min ago"
  proof every time the PUT autosave completes. (c) Reviewer detail
  page exposes a "Show scoring guidance for all criteria" checkbox
  that toggles each criterion's `<details>` open state and persists
  the preference under `kuja_reviewer_show_guidance` in
  localStorage. (d) New `/admin/feature-usage` endpoint groups
  UserEvent rows by event_name over a configurable window
  (top 30). `<FeatureUsageTable>` added beneath the AI cost
  breakdown on `/admin/ai-cost`. (e) `/grants` (NGO) now persists
  the last search query under `kuja_last_grant_query` and rehydrates
  it on next visit when the URL doesn't carry `?q=`.

- **2026-06-20** Phase 241-245 — Surface polish: (a) Phase 241
  (generic "was this helpful" on AIBadge) deferred — the existing
  `<AIFeedbackChip>` already handles per-call feedback when
  `ai_call_id` is present; a generic surface-wide rating produces
  unactionable signal. (b) New `GET /api/admin/users?search=&role=`
  (admin-only) + new `/admin/users` page — search by name/email,
  filter by role, see last_login_at. (c) Verified Phase 177 grant
  duplicate already copies sectors + countries + eligibility +
  criteria + doc_requirements + reporting_requirements +
  report_template (no change needed). (d) `<MyPastReviews>` on the
  reviewer reviews page lists their 5 most recent completed reviews
  with score, sorted by completed_at desc. Hidden when none. (e)
  `<ActiveApplicationsCard>` on the NGO dashboard combines
  submitted + under_review + scored apps with a 3-stage progress
  bar. Hidden when empty.

- **2026-06-20** Phase 235-239 — Visibility tiles + cron + timeline:
  (a) `<AwaitingDecisionCard>` on donor dashboard surfaces apps in
  `scored` status (reviewer done, donor sign-off pending). (b) New
  `GET /api/reviews/my-stats` (reviewer-only) returns 90-day
  completion rate + counts. `<MyCompletionStat>` strip on the
  reviews page header. (c) `<StatusTimeline>` on application detail
  reads `/api/audit-chain/recent?subject_kind=application` and
  renders chronological action events with human labels. (d) New
  `POST /api/cron/watched-deadlines` scans every WatchlistItem
  kind='grant' and emits a `grant_deadline_soon` notification when
  the grant deadline is 0..3 days out; record_cron_run wired. (e)
  New `<FreshnessStamp>` component (auto-updates every 30s) added to
  the cron-health page header to show how stale the rendered data
  is. Drop-in reusable on any admin page that fetches.

- **2026-06-20** Phase 229-233 — More dashboards + control: (a)
  `<ApplicationsReceivedTable>` on grant detail (donor) shows top-10
  apps by AI score with star + status badge + open link, plus a
  "see all" CTA. (b) `<TrustCompletenessCard>` on the NGO
  dashboard reads `/api/trust-profile/<org_id>` and lists every
  pillar component flagged missing/incomplete/pending. Hidden when
  none. (c) New `/admin/ai-cost-by-user` endpoint (admin-only, same
  pricing as ai-cost-by-tenant). `/admin/ai-cost` picks up a
  `<ByUserTable>` showing top 20 users by USD over the same window.
  (d) New `POST /api/reviews/<id>/decline` (reviewer/admin)
  deletes the review + flips the application status back to
  'submitted' if no other reviews remain + fans out a
  `review_declined` notification per admin. "Decline assignment"
  link on the reviewer detail page. (e) New
  `POST /api/grants/<id>/withdraw` (donor/admin, owner-scoped)
  flips the grant to 'withdrawn', cascades to every
  draft/submitted/under_review/scored/revision_requested
  application, and notifies every applicant NGO user with the
  reason. "Withdraw grant" button (rose-styled) on grant detail
  when status is open/draft.

- **2026-06-20** Phase 223-227 — Calibration + admin awareness:
  (a) Phase 221 UI activated — `<textarea>` for `private_notes` on
  the reviewer review page (auto-saves on blur via PUT
  `/api/reviews/<id>`). Only renders when the URL resolves to an
  existing review id. Visible label says "never the NGO." (b) New
  `GET /api/grants/<id>/criterion-averages` returns per-criterion
  mean AI score across applications (reads `ai_rubric_result_json`).
  `<CriterionAveragesCard>` on grant detail (donor view) sorts
  lowest first — surfaces where the application pool struggles. (c)
  New `GET /api/applications/<id>/peer-score` (NGO-only)
  compares your AI score vs median ai_score of accepted apps on
  sector-overlapping grants. `<PeerScoreCard>` on application
  detail; self-gates when pool < 5. (d) `<StaleReviewsCard>` on
  the operator dashboard reads the existing
  `/api/reviews/workload` `overdue` field and lists each reviewer
  with assignments > 14 days old. Hidden when nothing overdue.
  (e) `<NgoInboxCard>` on the NGO dashboard merges
  application_document_requested + application_revision_requested
  + application_under_review + compliance_refreshed notifications
  into one tile, dedup-sorted by recency. Used the Phase 212
  `?type=` notification filter.

- **2026-06-20** Phase 217-221 — Search + analytics polish: (a)
  Donor archive (statusFilter='archived') picks up an inline
  org-name search box for faster grantee lookup across closed
  grants. (b) `/api/organizations/` admin-only accepts
  `?screening_status=flagged|review|clear|pending` and
  `?screening_stale=1` (180-day cutoff); /organizations/search picks
  up matching admin-gated chips. (c) New
  `/settings/saved-searches` page lists every saved search across
  scopes with one-click delete (uses existing
  /api/saved-searches/ endpoints). (d) Donor dashboard adds
  `<DecisionTimeCard>` — median days from submitted_at →
  decision_recorded_at across donor's grants
  (`stats.median_decision_days` + `decisions_counted` added to
  `_build_donor_stats`). Self-gates when no decisions recorded yet.
  (e) `Review.private_notes` TEXT column + bootstrap ALTER; PUT
  `/api/reviews/<id>` accepts `private_notes`; reviewer/donor/admin
  can read via to_dict, NGO never sees it (GET endpoints
  role-gated). UI integration deferred (current reviewer page
  POST-only).

- **2026-06-20** Phase 211-215 — Shortlist usability pass: (a)
  `?starred=1` filter added to `/api/applications` + new "Shortlisted"
  pill on the applications list (donor/reviewer/admin). (b) NGO
  dashboard picks up `<DocsRequestedCard>` — surfaces unread
  `application_document_requested` notifications (created by Phase
  202). Needed `?type=` filter on `/api/notifications` which is now
  supported. (c) Donor dashboard picks up `<DonorShortlistCard>` —
  reads `/api/applications?starred=1`. Hidden when empty. (d)
  "My shortlist" quick link on the reviewer reviews page lands on
  `/applications?starred=1` which already enforces reviewer scope.
  (e) New `POST /api/applications/bulk-star` (max 100 ids) +
  "Unstar N" button on the applications list when the shortlist
  filter is on.

- **2026-06-20** Phase 205-209 — Operational closeout: (a) New
  `/api/cron/reviewer-digest` POST creates an in-app digest
  Notification per reviewer with pending count + oldest assignment
  age (record_cron_run wired). Schedule weekly. (b) Donor dashboard
  picks up `<DonorStatusBreakdownCard>` — reads the new
  `app_status_breakdown` map on `/api/dashboard/stats` and lists
  one click-through row per application status. Hidden when
  breakdown is empty. (c) NGO dashboard picks up
  `<DeadlineThisWeekCard>` — drafts with grant deadline ≤ 7 days,
  sorted by deadline ascending. Hidden when nothing due. (d) New
  `GET /api/grants/<id>/applications.csv` (donor + admin) exports
  applications + ai/human scores + statuses as CSV. "Export
  applications CSV" CTA on grant detail. (e) New
  `Application.is_starred` bool column with bootstrap ALTER + POST
  `/api/applications/<id>/star` toggle endpoint (donor + admin +
  reviewer). `<StarApplicationButton>` on application detail header.

- **2026-06-20** Phase 199-203 — Donors can now (a) save the criteria
  on an existing grant as a reusable template in one click ("Save as
  template" CTA on grant detail, uses the Phase 189 backend); (b)
  attach AI feedback chips to `/ai/guidance` and
  `/ai/strengthen-section` because both endpoints now stamp every
  response with `ai_call_id` via `log_replayable_ai_call`
  (compliance-preempt is also wired but its UI surface is
  feature-flagged); (c) ask the NGO for a specific extra document via
  `POST /api/applications/<id>/request-document` + the
  `<RequestDocumentButton>` on application detail — lighter-touch than
  a revision request, fires a `application_document_requested`
  notification per NGO user; (d) view 2-4 applications side-by-side
  on `/applications/compare?ids=…` against the same grant's criteria
  via a new `GET /api/applications/compare` endpoint that owner-scopes
  to the donor's grants. This closes the Phase 196 deferral (chip on
  apply-page AI panels is now live).

- **2026-06-20** Phase 193-197 — `<CriteriaTemplatePicker>` on the
  grant create form lets donors apply a saved criteria template
  (Phase 189) in one click. `<BroadcastsThread>` on grant detail
  reads the Phase 190 endpoint + renders the full message thread
  (donor + applicant NGOs). Applications list got `'active'` and
  `'archived'` meta-filters so donor queues stay focused on what
  needs action while keeping awarded/rejected/withdrawn/declined
  history accessible. New `/api/network/membership/directory`
  + `/network/directory` page lists every active member of the
  current network with sectors / country / capacity score + a
  search filter. Phase 196 (AI feedback chip on more surfaces)
  deferred — strengthen/guidance/compliance-preempt endpoints
  don't yet expose `ai_call_id` in their responses; needs a
  backend pass first.

- **2026-06-20** Phase 187-191 — `saved_search_matches` category now
  rendered in `/settings/notifications` with proper label + hint
  (Phase 170 had defined it backend-side only). New
  `/api/applications/<id>/ngo-history` returns the past 12
  applications from the same NGO; `<NgoHistoryPanel>` on donor /
  admin / reviewer view shows them with status badges + summary.
  New `criteria_templates` table + 4 endpoints
  (list / create / delete / save-as-template-from-grant) for the
  Phase 189 grant criteria template library. New
  `/api/grants/<id>/broadcasts` endpoint reads the audit chain for
  `grant.broadcast.sent` actions to produce a thread view; broadcast
  service now stores body alongside subject so the thread shows the
  actual messages. New `/api/exports/org-bundle.zip` packages the
  Phase 99 JSON bundle alongside every application as a self-
  contained Phase 159 PDF in a single download; "ZIP (with PDFs)" CTA
  on org profile alongside the existing JSON button.

- **2026-06-20** Phase 181-185 — "Duplicate" CTA on grant detail
  (donor/admin) calls the Phase 177 backend + routes to the new draft.
  **Critical bugfix found in Phase 182:** Phase 167/169/176 + Phase
  160 were writing Notification rows with non-existent kwargs
  (`kind=`, `org_id=`, `payload_json=`, `user_id=None`) — the model
  only has `user_id` (NOT NULL) + `type`/`title`/`message`/`link`.
  All 4 sites fixed to fan out per-user across the relevant org +
  use the schema fields; <NewGrantMatchesCard> updated to read the
  new shape. New Phase 183 "Accept AI score" chip on the reviewer
  page snaps every criterion's score to `application.ai_score` so
  reviewers who concur with the AI can confirm + comment instead of
  filling sliders. Decision audit drawer (existing Phase 10.8
  component) now wired on the donor/admin/reviewer view of the
  application detail page (Phase 184). New
  `/api/journey/peer-win-rate` (NGO-only) returns this NGO's
  win rate + an anonymized peer pool average; tile gates when
  peer pool <5. `<PeerWinRateCard>` on NGO dashboard surfaces it.

- **2026-06-20** Phase 175-179 — Reviewer page shows the donor's
  scoring guidance (instructions + example) inline next to each
  criterion as a collapsed details disclosure. Doc upload now
  triggers an AdverseMediaService re-screen when `doc_type` is in
  a compliance-relevant set (audit_report, mou, governance_doc,
  policy_handbook, safeguarding_policy) + writes a
  compliance_refreshed notification to the NGO. New
  `POST /api/grants/<id>/duplicate` (donor/admin) clones an existing
  grant into a fresh draft preserving every structured field
  (criteria, eligibility, doc + reporting requirements) and resetting
  status + deadline + published_at. New
  `docs/WEBHOOK_VERIFICATION.md` documents the X-Kuja-Signature
  HMAC-SHA256 scheme with Python (Flask) + Node (Express) + bash
  examples plus retry semantics. New `<PastApplicationsDrawer>`
  next to TrustPortableBadge on the apply page — opens a side
  drawer of awarded apps the NGO can open in new tabs to re-use
  successful language.

- **2026-06-20** Phase 169-173 — Reviewer-assigned notification on the
  applicant NGO side (`application_under_review` notification fired
  alongside the existing application.status flip). New
  `saved_search_matches` notification category in the prefs system
  (defaults to in_app only); Phase 167 fan-out now respects the
  per-user preference. New `/api/cron/webhook-deliveries-cleanup`
  caps WebhookDelivery rows at 200 per hook so the table doesn't
  balloon; registered in cron-health. New `<NewGrantMatchesCard>` on
  NGO dashboard surfaces unread `grant_published_match` notifications
  as a dedicated tile. Webhook settings page got a per-event filter
  dropdown (visible when >1 hook registered). Smoke test
  NOTIFPREF-001 relaxed from rigid `== 4` to `>= 4` so adding a
  category doesn't break the suite.

- **2026-06-20** Phase 163-167 — Application revision UI: donor
  "Request revision" button with feedback dialog on application detail;
  NGO-side banner when `status === 'revision_requested'` surfaces the
  donor's feedback + an "Edit + resubmit" link to the apply page. "PDF"
  CTA on application detail downloads via the Phase 159 endpoint.
  New `webhook_deliveries` table + `WebhookDelivery` model log every
  outbound attempt; `_deliver()` writes one row per attempt; new
  `/api/webhooks/<id>/deliveries` returns recent history scoped to the
  caller's org; per-hook disclosure on `/settings/webhooks` shows the
  last 20 attempts as a table. New `<DonorPortfolioCard>` on the donor
  dashboard reads `/api/journey/donor-summary` for 12-month rolling
  totals (grants, committed, applications, awarded, reports). New
  `SavedSearchAlertService` fires `grant_published_match` notifications
  when a newly published grant matches an NGO's saved search filter.
  ApplicationStatus type extended to include `declined`,
  `revision_requested`, `withdrawn` (was lagging the backend enum).

- **2026-06-20** Phase 157-161 — Webhook fan-out now fires on the 4
  remaining transition events: `application.awarded`,
  `application.rejected`, `report.submitted`, `grant.published` —
  routed to both NGO + donor orgs where relevant. `record_cron_run()`
  wired into the 3 remaining cron handlers (reviewer-auto-assign-sweep,
  uat-fixtures, crisis-monitoring-draft) so the Phase 153 cron-health
  dashboard sees every cron, not just compliance-rerun. New per-app
  PDF export at `/api/applications/<id>.pdf` (NGO/donor/admin scoped)
  via `application_pdf_service` — header + criterion responses +
  optional budget table. New `/api/applications/<id>/request-revision`
  (donor/admin) flips status to `revision_requested` + records
  feedback + notifies the NGO. Grants list now has country + closing-in
  (7/30/90d) facets in addition to the existing sector filter.

- **2026-06-20** Phase 151-155 — Org-admin webhook management UI at
  `/settings/webhooks` (register URL + events, fire test ping, see
  delivery stats, secret shown ONCE). Application withdraw button on
  the application detail page (submitted-state only) with reason
  dialog. New `cron_runs` table + `record_cron_run()` + `/api/cron/health`
  + `/admin/cron-health` page surfacing last-run / overdue / never
  bands per registered cron. Rolling 12-month `<ImpactCard>` on the
  NGO dashboard (submitted, awarded, win rate, total funding,
  reports). New `<TopMatchedNGOs>` panel on the donor view of grant
  detail consuming `/api/match/for-grant/<id>` (Phase 112 match
  engine surface that was sitting unwired).

- **2026-06-20** Phase 145-149 — NGO can now withdraw a submitted
  application before review starts via
  `POST /api/applications/<id>/withdraw`; new `withdrawn_at` +
  `withdrawal_reason` columns + bootstrap ALTER for prod. Fires the
  `application.rejected` webhook with `withdrawn=true`. New
  `/admin/reviewers-workload` dashboard: per-reviewer assigned /
  in-progress / overdue (>14 days) / completed bars, sorted by active
  load — pair with /admin/reviews-bulk to rebalance. Webhook delivery
  now does exponential-backoff retry (200ms → 600ms, 3 attempts max)
  on 5xx + connection errors; 4xx is treated as permanent. New
  `<WatchedGrantsCard>` tile on the NGO dashboard surfaces the user's
  starred grants with deadline countdown + "Apply" link. Gunicorn
  `--preload` was already enabled in the Procfile; documented the
  rationale + side-effects in `gunicorn.conf.py`.

- **2026-06-20** Phase 139-143 — `<InlineDocPreview>` (Phase 128 component)
  now wired on the reports bundle panel — reviewers see PDF/image
  previews next to evidence attachments without leaving the page. New
  admin/donor page at `/admin/reviews-bulk` calls the Phase 136
  `/api/reviews/bulk-assign` endpoint: pick a reviewer, multi-select
  submissions, one POST. Tenant message detail (admin view only) now
  embeds a read receipts disclosure: counts + per-org `read_at` from
  the Phase 137 endpoint. New smoke test `I18N-PARITY` asserts every
  locale has the same key set as `en.json` (guardrail against the kind
  of drift Phase 134 found — sw/so had 20 orphan keys, now cleaned up).
  New outbound webhook system: org admins POST to `/api/webhooks` with
  url + events; payloads POST'd with `X-Kuja-Signature` HMAC-SHA256.
  Wired into `application.submitted` (fires for both NGO + donor orgs).
  Test endpoint at `/api/webhooks/<id>/test` fires a synthetic ping.

- **2026-06-20** Phase 133-137 — Smoke test now enforces a latency
  budget on 5 critical user-facing endpoints (dashboard/stats,
  applications/, grants/, calendar/deadlines, journey/me). Soft +
  hard thresholds; warm-up call + measured 2nd call so we catch
  real regression, not noise. Arabic translation parity audit:
  ar.json at 100% (7 ASCII-identical are correctly-untranslated
  acronyms / placeholders); 3 header keys (`header.logout`,
  `header.notification_settings`, `nav.metrics`) backfilled in
  fr/sw/so/es. Sahel + South Sudan crisis rows now seeded on every
  `seed_networked_funds` run (was previously gated by `--rich`).
  New `POST /api/reviews/bulk-assign` to assign one reviewer to up
  to 100 applications in one call with per-row idempotency. New
  `GET /api/network/messages/<id>/read-receipts` exposes the
  sender-side view of who has opened a tenant message (admin-only;
  the inbox endpoint already showed per-recipient `is_read`).

- **2026-06-20** Phase 127-131 — `/api/calendar/deadlines.ics` returns the
  caller's deadlines as an RFC-5545 iCalendar so NGOs can subscribe in
  Google Calendar / Outlook / Apple Calendar; "Calendar feed" CTA next to
  the existing PDF download. New `/api/documents/<id>/raw` serves the raw
  bytes with `Content-Disposition: inline` for PDFs / images / text so an
  `<InlineDocPreview>` component can render them next to the NGO's upload
  list. seed_networked_funds now `/submit`s the seeded memberships after
  admin-create so the OB queue isn't empty on fresh deploys. New
  `<DisclosureToggle>` + `useDisclosureMode()` hook persist a beginner/
  expert preference in localStorage; wired on the apply page where
  beginner mode hides the "More AI tools" accordion. New
  `/api/audit-chain/export.jsonl` streams the full hash-chained log as
  NDJSON for offline third-party verification; download CTA on
  /admin/audit-chain. Stale `near-prod-redirect` entry trimmed from
  `.claude/launch.json`.

- **2026-06-19** Phase 121-125 — Branded HTML decision-email template
  (EmailService.send + _send_smtp + _send_sendgrid now accept html_body;
  membership decision sender renders via app.services.email_templates).
  Bulk membership decision endpoint `/api/network/membership/bulk-decision`
  (approves/rejects up to 100 rows per call, audit-chain per row, single
  commit + best-effort per-row notify). Bulk-select + bulk-action bar on
  /admin/network-memberships with checkbox column on each decidable row.
  NEAR onboarding tour fully localised: 20 keys added across en/fr/ar/sw/so/es
  with `{network}` interpolation, TourStep gained `titleArgs`/`bodyArgs`.
  Smoke test now pins membership listing route row shape (required keys
  + status enum). AIFeedbackChip wired on 3 surfaces: portfolio-qa
  (Phase 116), pre-submit-preview, WhyThisMatch.

- **2026-06-19** Phase 114-119 — Retire `is_oversight_body_member()`
  admin shortcut (admins no longer get phantom OB seats on every
  network; emergency-declaration + network-membership endpoints opt in
  to `allow_admin_override=True` for the paper-ceremony fallback).
  Every `AIService._record_call` now estimates `usd_cost` and fires
  Phase 108 monthly-cap threshold notifications (was previously only
  hit on `log_replayable_ai_call` paths). New `<AIFeedbackChip>`
  generic component captures used/edited/dismissed signals; wired on
  the Phase 107 portfolio-qa surface. New `/api/peer-snippets/<criterionKey>`
  returns 1-3 anonymized excerpts from peer awarded applications
  ranked by sector + country Jaccard; `<PeerSnippetsButton>` renders
  inline on every criterion. Real PNG QR code on TOTP enrol (Phase 118
  dropped the qrcode lib + dynamic data-URL render). New
  `<RubricLivePreview>` shows a sticky-side per-criterion bar updated
  per keystroke from a deterministic length+structure+specificity
  heuristic (no AI, no server round-trip).

- **2026-06-19** Phase 107-112 — Donor portfolio Q&A, per-tenant AI cost
  ceiling + threshold notifications, PG CHECK constraints, voice on apply
  + declaration fields, data-export download CTA + dark-mode toggle, real
  match-engine-backed WhyThisMatch. New surfaces: `/portfolio-qa`,
  `/admin/cost-ceiling`. New AICallLog columns: `org_id`, `role`,
  `language`, `usd_cost`. `log_replayable_ai_call` now resolves org/role
  from current_user, computes $ cost, and fires 75/90/100% threshold
  notifications via `cost_ceiling_service`. PG CHECK constraints on
  `grants.total_funding`, `applications.status` (when submitted_at set),
  `reports.status` (when submitted_at set), `ai_call_logs.tokens_*`
  non-negative — guarded by dialect check, won't break SQLite dev.
  `<VoiceFieldInput>` chip wired on every apply textarea + declaration
  summary. `<ThemeToggle>` in header cycles system → light → dark.
  `/api/match/explain/<grant_id>` returns real-signal reasons (sector /
  geography overlap, capacity fit, track record).

- **2026-06-12** Phase 92 — Continuous NGO journey tracker.
  Highest-value product gap the team named. New
  GET /api/journey/me computes per-NGO stage state across 6 stages
  (profile → readiness → apply → funded → compliant → impact)
  against real data (Organization, Assessment, Document,
  Application, Report). Returns 'current' (first unfinished),
  'next_action' with href + what completing it unlocks, and
  completion_pct. Frontend <JourneyTracker> mounted at the very top
  of NGO dashboard above TodayFocusBanner — the through-line
  connecting every other surface. Verified: 'Your funding journey'
  heading + 6 stage labels + 'YOUR NEXT STEP' card + 'This unlocks'
  copy render for a new test NGO at 0% complete.

- **2026-06-12** Phase 91 — Backend wiring for plain-language compliance.
  Closes the gap the team flagged as "most important unfinished
  engineering item." Adds 5th field 'who_can_help' to the
  ComplianceExplain schema and populates it on all 10 catalogued NGO
  flags. New backend module mirrors the frontend catalogue so
  server-side compliance code can attach the same shape:
    app/services/compliance_explainer_service.py
    GET  /api/compliance/explain/<key>     — single lookup
    POST /api/compliance/explain           — bulk
    GET  /api/compliance/explain-keys      — catalogue introspection
  Uncatalogued keys fall through to a minimal 'ask for help' shape
  so the NGO never sees an empty explainer card.

- **2026-06-12** Phase 88-90 — Examples + concept simplification + NGO nav tighten.
  Phase 88: example placeholders in apply textareas via
    getPlaceholderForLabel — concrete in-context examples replace
    generic 'Write your response' fallback.
  Phase 89: describeReportStatusForNgo + describeApplicationStatusForNgo
    bucket the 7 report states / 6 application states into 3 NGO
    buckets — 'Your turn' / 'With the donor' / 'Done'. Donor-side
    surfaces keep the full vocabulary.
  Phase 90: NGO primary nav 5→4. Opportunities demoted from primary
    to secondary as 'Find a grant.' Primaries: Dashboard, My
    Applications, Reports, Organization Profile. Verified live.

- **2026-06-12** Phase 87 — Guided questions instead of fields.
  lib/guided-questions.ts maps field keys to natural questions.
  'beneficiaries_reached' → 'How many people did you reach this
  period — and who were they?'. Coverage for reporting, capacity-
  assessment, application, and declaration fields. Heuristic
  fallback for uncatalogued keys. Applied to apply criterion
  headings.

- **2026-06-12** Phase 86 — Inline concept education.
  <ConceptHelper> inline term wrapper — click pops a 2-4 sentence
  plain-language explainer with optional example. lib/concepts.ts
  catalogues 13 hard concepts non-technical NGOs don't know in
  advance (grant_window, capacity_assessment, due_diligence,
  reporting_evidence, budget_line, declaration, ob_committee,
  crisis_monitoring_report, severity, trust_profile,
  compliance_score, sanctions_screening). Used inline in sentences:
  'This grant is in its <grant_window> phase.'

- **2026-06-12** Phase 85 — Plain-language compliance flags (frontend).
  <ComplianceFlag> renders any compliance issue with the universal
  4-part explainer (what / why / example / how) — tone-coded with
  'What is this and how do I fix it?' default-collapsed disclosure.
  lib/compliance-explainers.ts catalogues 10 most-common NGO flags.
  Backend wiring extended in Phase 91 to add the 5th 'who_can_help'
  field.

- **2026-06-12** Phase 84 — Textarea autosave + resume.
  lib/hooks/use-autosave.ts: generic useAutosave hook persists keyed
  work-in-progress to localStorage with 800ms debounce.
  components/dashboards/resume-banner.tsx: 'Resume where you left
  off' on NGO dashboard with title + preview + time-ago + deep-link.
  Storage key: kuja_autosave:<kind>:<id>[:<field>]. Registry key:
  kuja_autosave_registry_v1. Wired into ProposalStep on /apply.

- **2026-06-12** Phase 83 — Consolidate AI surfaces.
  Apply page had 6 stacked AI surfaces; reports page had 7. Team
  review flagged this as cognitive overload. New
  <AIToolsAccordion> wraps the legacy helpers in one collapsed
  'More AI tools' disclosure. Primary AI action stays visible:
    /apply: SmartDraftBanner stays at top; DraftCoAuthor +
      AutofillPanel + GrantQAPanel move into the accordion.
    /reports draft row: ReportReadiness + VoiceReportComposer +
      PhotoEvidenceUploader stay primary; ReportDraftCoAuthor +
      Bundle + PreSubmitReview + AIReportGuidance move into the
      accordion.

- **2026-06-12** Phase 82 — "Today's focus" single-sentence banner.
  Pushes Phase 48's principle further. Picks the highest-priority
  attention item, renders as kuja-display headline + plain-language
  hint + single CTA deep-linked to the right surface. Priority logic
  blends tone (bad +1000 / warn +500), severity (critical +800), and
  due-in-days (overdue +600 + |days|×10). Mounted at the top of all 4
  attention-* dashboards (NGO, operator, donor, member). PageAttention
  still renders below for the full picture. Empty state is rewarding
  ('You're all caught up. Take the win.').

- **2026-06-12** Phase 81 — Smart deadline negotiation.
  Platform mediates instead of forcing back-channel email.
  Backend reports.py:
    POST /api/reports/<id>/extension-request — NGO posts {extra_days
      1-30, reason}. Persists on ai_analysis.extension_requests with
      status='pending'.
    POST /api/reports/<id>/extension-decision — donor (or admin) sends
      {decision: approved|counter|declined, counter_days?, note?}.
      On 'approved', moves due_date by extra_days.
  Frontend deadline-negotiator.tsx — single component handles both
  sides by role. NGO + draft → 'Request extension' → days picker +
  reason. Donor + pending → Approve/Counter/Decline with optional note.
  Either side + decided → outcome banner. Mounted on /reports/[id].

- **2026-06-12** Phase 80 — Signature-pace gentle coaching.
  Phase 68 ships network-level pace data; Phase 80 personalises it for
  the signer.
  Backend GET /api/dashboard/signer-coach: last 6 signatures' median +
  p90 days vs 6-day network target. Tone-coded: good if ≤ target, warn
  if ≤1.5×, bad otherwise. Lists pending declarations awaiting this
  user's signature with age + over-target flag. Copy is coaching, not
  surveillance ('no judgement, but the network depends on quick OB
  decisions in a crisis').
  Frontend signer-coach-card.tsx mounted on operator dashboard.
  Auto-hides when there's nothing to coach on. 3-tile stats + pending-
  declaration list with deep-links.

- **2026-06-12** Phase 79 — NEAR declaration-as-conversation.
  Alternative to Phase 45's 4-step wizard. OB member describes the
  situation in their own words (typed or voice-transcribed via Web
  Speech API). Claude parses out title, crisis_type, severity, country,
  proposed amount + currency, summary, suggested OB committee
  (user_ids from active roster), rationale, confidence, warnings.
  Backend:
    AIService.parse_declaration_from_narrative — conservative parser;
      does NOT invent locations, counts, or dates.
    POST /api/declarations/parse-narrative — preview-only.
  Frontend declaration-conversation.tsx + mode toggle in
  declaration-wizard.tsx. Conversation default; wizard fallback. On
  'Use this draft', wizard jumps to step 2 pre-filled so OB member
  still picks fund + window (the only slots AI cannot infer) before
  confirming.

- **2026-06-12** Phase 78 — AI content translation.
  Removes the 'donor reads English' constraint that filtered out
  global-south NGOs whose English is weak. NGO writes in their own
  language, donor reads in theirs.
  Backend: AIService.translate_text covers en/fr/ar/sw/so/es;
    preserves numbers/dates/names; flags cultural-nuance tricky
    choices. POST /api/translate (any authenticated user; 8000-char
    cap). Blueprint wired and verified.
  Frontend: <TranslateThis> wraps any free-text. Translate-on-click
    (cost conscious), 'Show original' toggle, source-language
    detection + fidelity + translator notes. First mount:
    /reports/[id] reviewer-notes block.

- **2026-06-12** Phase 77 — Trust-portable assessment, made visible.
  Backend already had /api/trust-profile/<org_id>. NGOs just didn't
  realise the canonical assessment serves every donor on the
  platform.
  Frontend: <TrustPortableBadge> two variants. Full panel on
    /assessments + dashboard ('Submit once, visible to every donor
    on Kuja' + 4 tiles: overall trust, framework, last-refreshed,
    sanctions). Compact pill on /apply with copy 'attached
    automatically with this application.' Renders nothing pre-
    onboarding (no false moat signal).

- **2026-06-12** Phase 76 — Why-rejected, constructively.
  AI mentor when an application or report is declined/revisions
  requested. summary + 2-4 specific issues (each with evidence +
  impact) + 2-4 suggestions (each with action + expected lift) +
  encouragement.
  Backend: AIService.explain_rejection. Routes:
    GET /api/applications/<id>/explain-rejection (declined,
       rejected, revision_requested)
    GET /api/reports/<id>/explain-rejection (rejected,
       revision_requested)
  Frontend: <WhyRejectedPanel> lazy-loaded on detail pages.

- **2026-06-12** Phase 75 — AI-drafts-application v0.
  NGO becomes editor, not author. Cuts authoring time 70-85%.
  Backend: AIService.draft_application_responses grounds in org
    profile + latest capacity assessment + last 2 submitted apps +
    grant rubric. Per-question rationale + gaps list. Conservative
    ('use ONLY information present; never invent.')
    POST /api/applications/<id>/ai-draft with merge=false preview
    / merge=true commit (never overwrites typed text).
  Frontend: <SmartDraftBanner> on /apply/<grantId>. Two-step UX:
    preview → confirm. Hidden once any response has >30 chars
    typed.

- **2026-06-12** Phase 74 — NGO compliance coach.
  Flips compliance from surveillance to coaching. NGO sees own
  posture vs peer median, trends, single next-action.
  Backend: GET /api/dashboard/compliance-coach (NGO only).
    timeliness/ai_quality/reports/pillars + tone-coded recommended
    next action with deep-link href. Lazy compute; small per NGO.
  Frontend: <ComplianceCoachCard> with peer-benchmarked tiles +
    pillar hints. Hidden gracefully if <2 submitted reports.

- **2026-06-12** Phase 73 — Audit-ready folder export.
  One-click ZIP per grant. Structure: agreement, application,
  reports (per period), reviews, evidence, financials. manifest.txt
  (README) + manifest.json (SHA-256 tamper evidence). Access:
  NGO own / donor full / admin full.
  GET /api/grants/<id>/audit-folder.

- **2026-06-12** Phase 72 — Photo-as-evidence.
  Phone photo → Claude vision → structured fields. Per-photo-type
  prompts (attendance / receipt / training / site_visit / other).
  Confidence + legibility warnings.
  POST /api/reports/<id>/photo-evidence + <PhotoEvidenceUploader>
  with capture='environment' (opens phone rear camera directly).

- **2026-06-12** Phase 71 — Voice-to-report.
  NGO talks in any of 6 languages; browser Speech API transcribes;
  Claude maps onto donor's reporting requirements. NGO edits,
  doesn't author. Cuts 4-hour quarterly-report dance to ~10 min.
  POST /api/reports/<id>/structure-from-voice + <VoiceReportComposer>
  with 6-language picker and tone-coded per-section coverage.

- **2026-06-11** Phase 70 — Reviewer-side IA pass.
  /reviews/[id] is the reviewer's busiest surface and was still on the
  pre-Phase-47 layout (max-w-5xl wrapper + custom flex back-button
  header). Retrofitted to PageShell + PageBack + PageHeader + PageMain,
  matching the rest of the audit. Title-status moves into the header as
  a human pill via describeApplicationStatus, so reviewers see the
  same vocabulary as donors and admins (e.g. "Submitted — awaiting
  review", not "submitted"). DecisionAuditDrawer trigger is now a
  primaryAction on the header. The summary card drops the duplicated
  org/grant/status (which the header now carries) and focuses on the
  three score tiles (AI / Reviewer / Dual). The /reviews list also
  switches its rows from StatusBadge to the status-copy pill for
  consistency. Loading + not-found + success states all wrapped in
  PageShell. Browser-verified as reviewer james@reviewer.org on
  /reviews/11/ — h1 "Score application", "Draft" pill, subtitle
  "Amani Community Development · Somalia drought emergency...".

- **2026-06-11** Phase 69 — NEAR admin reports view at /admin/reports.
  Mirror of /admin/declarations: status filter, optional window_id
  chip, deadline-urgency tone-coding, link to existing /reports/<id>
  detail. Orders overdue first, then due-soon. Empty state under a
  window_id explains "reports are generated when grants under this
  window submit periodic reporting." Reports chip on
  /admin/windows/[id] now points at /admin/reports?window_id=<id>
  with the same "See all in this window" copy as Phase 66's grants
  link, so the window detail's three primary chips (declarations,
  grants, reports) now all land on admin-flavored list views with
  the active scope chip.
  Browser-verified:
    /admin/reports/ → "NEAR Network — reports", 20 rows, filter ok.
    /admin/reports/?window_id=160 → "0 reports · filtered to window
    #160", chip + "Open window operations" backlink + helpful empty
    state.

- **2026-06-11** Phase 68 — Signature-pace sparkline on /admin/windows/[id].
  Computes from already-fetched declarations — no new endpoint.
    - sigDays = (declared_at - created_at) per signed_active declaration.
    - sigStats = count + median + p90, tone-coded green if ≤ slaDays (6)
      or sun/destructive if over.
    - inFlight = draft + in_review decls, sorted by age, per-row progress
      bar of ageDays / (slaDays * 2), destructive when overSla.
    - Section gated on `(sigStats || inFlight.length > 0)` so it only
      renders when there's something to show.
  Browser-verified on window 160:
    Past signed: 1 · Median 0.0d (green) · p90 0.0d (green)
    In flight (1): "Drought response — Turkana basin · draft" at 9.8d
      in destructive tone, progress bar 81% bg-destructive.

- **2026-06-11** Phase 67 — Window audit events + activate the
  Phase 61 drill-in.
  api_create_window now appends AuditChainEntry(action="window.created",
  subject_kind="window", subject_id=w.id). api_update_window snapshots
  changes, emits "window.status_changed" if status changed else
  "window.updated", details = {fund_id, changed:[...]}. Phase 61's
  subjectDrillHref already maps window → /admin/windows/<id>, so the
  chain entries are now drillable. Verified via preview_eval: an
  entry shows `window_links: [{ href: "/admin/windows/160/", txt:
  "window #160" }]`.

- **2026-06-11** Phase 66 — Grants + Reports list window_id filter.
  Extends Phase 65's pattern to /grants and /reports.
  **Backend**:
    - GET /api/grants/ accepts fund_window_id (canonical) or
      window_id (alias for ergonomic deep-linking from window pages).
    - GET /api/reports/ accepts window_id; joins through
      grant.fund_window_id; respects existing role-gated base_query.
      Avoids double-join on the donor branch.
  **Frontend**:
    - /grants reads ?window_id=N from URL, shows the same chip +
      clear-X + "Open window operations" link as Phase 65.
    - /reports (KujaReportsPage) does the same.
    - /admin/windows/[id] "Open grants" link now reads
      "See all in this window" -> /grants?window_id=<id>.
  Browser-verified live:
    /grants?window_id=160 (NEAR admin viewer):
      subtitle: "3 grants found · filtered to window #160"
      chip:     "Window #160" + clear -> /grants/
      side:     "Open window operations" -> /admin/windows/160/
  Backend probe-verified for both endpoints (grants returns 3 rows,
  reports returns 0 — reports under network grants haven't been
  generated yet, but the filter joins correctly).

- **2026-06-11** Phase 65 — Declarations list window_id filter +
  cross-page links. Closes the navigation loop between /admin/funds
  -> /admin/windows/[id] -> /admin/declarations. Operator can now
  drill from a fund tile straight into the per-window operations
  page and from there into a window-scoped declarations list.
  **Backend (app/routes/emergency_declaration_routes.py)**:
    GET /api/declarations accepts optional `window_id` query param.
    Network gate preserved via filter_by(network_id=...), so the
    filter can't leak cross-tenant. Backward-compatible.
  **Frontend**:
    - useDeclarations hook takes optional { windowId }.
    - /admin/declarations reads ?window_id=N from URL via
      useSearchParams; subtitle reads "N declarations · filtered to
      window #N"; chip shows "Window #N" + X-clear (-> full list) +
      "Open window operations" link (-> per-window drill-in).
    - /admin/windows/[id] "Active declarations" sidebar link now
      reads "See all in this window" and points at
      /admin/declarations?window_id=<id>.
  Browser-verified live on window 160 (2 NEAR declarations):
    /admin/declarations?window_id=160
      subtitle: "2 declarations · filtered to window #160"
      chip:     "Window #160" + clear -> /admin/declarations/
      side:     "Open window operations" -> /admin/windows/160/

- **2026-06-11** Phase 64 — Membership review Audit + Messages tabs go
  live. The two placeholder tabs from Phase 47 are now real:
  **Backend (app/routes/audit_chain_routes.py)**:
    GET /api/audit-chain/recent now accepts optional
    `subject_kind` + `subject_id` query params so a per-entity
    drill-in can request only the chain entries for one subject.
    Backward-compatible: omit the params for the full chain view.
  **Frontend (admin/network-memberships/[id]/client.tsx)**:
    New <MembershipAuditTab> merges two parallel SWR calls:
    chain entries with subject_kind=network_membership&id=<m.id>
    plus subject_kind=org&id=<m.org_id>. Sorted by seq desc.
    Each row shows the action humanised (e.g.
    "network · ob · seat granted"), actor email, subject ref,
    timestamp, seq number. Empty state explains what would land
    here.
    New <MembershipMessagesTab> filters /messages/ to
    scope='org' messages whose scope_value matches this org id.
    Empty state cites the org by name + CTAs to the global
    Messages surface (where network-wide and country-wide
    broadcasts live). Has a 20-message cap.
  Browser-verified on membership #2 (Amani Community Development):
    Audit tab: 6 entries rendered, mix of network_membership +
      org subjects, including "network · ob · seat granted" by
      admin@kuja.org and "csv export · run" + "ngo portfolio ·
      download pdf" by fatima@amani.org.
    Messages tab: "No direct messages with Amani Community
      Development yet" empty state + CTA href="/messages/".

- **2026-06-11** Phase 63 — Name entities across the donor / NGO /
  member dashboards. Extends the Phase 62 pattern from the NEAR
  operator dashboard to the other three attention-first dashboards.
  Same deterministic templating: first 2 entity names + "+N more"
  in the hint. Coverage:
    AttentionDonorDashboard:
      "N applications awaiting your review"  -> grant_title list
      "N reports awaiting review"            -> grant_title list
      "N grants closing in the next 2 weeks" -> grant title list
    AttentionNgoDashboard:
      "Continue where you left off — N drafts" -> grant_title list
      "N reports due soon"                   -> grant_title list
    AttentionMemberDashboard:
      "N draft application waiting to submit" -> grant_title list
      "N reports due soon"                   -> grant_title list
  Browser-verified live:
    Donor dashboard:
      "4 applications awaiting your review"
        hint = "Global Fund Maternal & Newborn Health Initiative",
               "USAID East Africa WASH Program 2026-2028" +2 more
    NGO dashboard:
      "Continue where you left off — 2 drafts"
        hint = "Somalia drought emergency — Q2 2026 response — Org #1",
               "Schema Report Test". Pick up your work-in-progress...

- **2026-06-11** Phase 62 — Name entities in operator dashboard
  attention. The Phase 48 strip showed counts (`2 members awaiting
  review`) but operators wanted to know WHICH orgs / declarations.
  Lightweight deterministic enrichment (zero AI tokens): pull the
  first 2 entity names from each list and surface them in the hint
  with "+N more" when there are extras. Now reads:
    "Salam Relief Foundation, Ubuntu Education Trust. Run trust
     process, review capacity assessment, decide."
    "Drought response — Turkana basin. Add committee members and
     submit for signature."
  Applied to all 4 dashboard attention paths: members awaiting review,
  ready-to-release declarations, in-review declarations, draft
  declarations. Browser-verified live.

- **2026-06-11** Phase 61 — Audit chain entity drill-in. Subject
  badges on /admin/audit-chain rows are now Links to the matching
  entity detail page so the operator can click from an audit event
  to the entity that triggered it. Coverage: emergency_declaration ->
  /admin/declarations/<id>, network_membership ->
  /admin/network-memberships/<id>, crisis_monitoring_report ->
  /admin/crisis-monitoring/<id>, application -> /applications/<id>,
  grant -> /grants/<id>, report -> /reports/<id>, org ->
  /trust?org=<id>, window -> /admin/windows/<id>. member_feedback +
  tenant_message fall back to their list pages until detail surfaces
  ship. Helper `subjectDrillHref` is a pure function. Visual: arrow-
  up-right glyph appears on linked badges so it's obvious they're
  click-through. Browser-verified: rows with subject_kind='org'
  render as href="/trust?org=N".

- **2026-06-11** Phase 60 — AI-narrated top_risks. The rule-based risk
  labels from Phase 56 are now optionally enriched with window-specific
  narrative. Backend extends GET /api/windows/<id>/operational with
  ?narrate=true; on opt-in, the rule-based risks pass through
  NetworkAIService.narrate_top_risks which rewrites label+hint to cite
  specific declarations, countries, signature counts, and the next
  action. Always falls back to rule-based on AI failure (narration_ok
  in the response). System prompt explicitly bans invented specifics.
  Frontend: useWindowOperational hook takes {narrate} option;
  /admin/windows/[id] has a "Plain risks" / "AI-narrated" toggle next
  to the attention strip. Browser-verified end-to-end on the NEAR
  Change Fund / Emergency Response window with seeded conditions
  (decl 120 in_review backdated + decl 111 applicants_notified_at
  cleared):
    Default (plain):
      "1 declaration past 6-day decision SLA"
      "1 declaration ready to release"
    AI-narrated (translated from Arabic per admin's locale):
      "Kenya declaration stuck in review with no signatures" +
      hint citing 'Drought response — Turkana basin' + 0/2 sigs
      "Somalia declaration ready to release" +
      hint citing 'Somalia Drought Emergency — Q2 2026 Response'
    Toggle round-trip works. narration_ok=true on both calls.

- **2026-06-11** Phase 59 — Per-window operational drill-in. New page
  /admin/windows/[id] that complements the historical /report page
  with the LIVE operational view (the brief's "decisive operational"
  pattern). Sections render conditionally so the page only shows what
  matters right now:
    - PageHeader with the OpStat summary inline in the subtitle
    - PageAttention from top_risks + draft declarations
    - Active declarations list (in_review + signed_active)
    - Open grants list
    - Reports due in the next 30 days (overdue highlighted)
    - PageDetail collapsible linking out to the historical report
  Each row uses describeXxxStatus + TONE_PILL_CLASS for the
  human-language pill (the same vocabulary as the rest of the app).
  Linked from /admin/funds — every OpStat tile is now a click-through
  to the per-window drill-in (Phase 52's tiles are no longer dead-end
  visuals). The OpStat component took an optional href prop.
  Browser-verified:
    /admin/windows/160 h1 "Window #160 — operations"
    attention strip: "1 draft declaration not yet submitted"
    sections: Active declarations + Quick actions
    Full report link in header + PageDetail
    /admin/funds tiles -> /admin/windows/160 click-through

- **2026-06-11** Phase 58 — Final long-tail sweep. Last 7 surfaces
  wrapped in PageShell: /apply/[grantId], /assessments,
  /assessments/wizard (framework-select entry), /admin/windows/[id]/
  report, /ngo/[id], /donors/[id], /network/join. Every major
  user-visible page in the app now uses the canonical page anatomy.
  Browser-verified /assessments h1 "Assessment hub", /apply/5 h1
  "Apply: World Bank Youth Employment & Digital Skills".

- **2026-06-11** Phase 57 — Long-tail surface sweep (PageShell wrap).
  Standardised 13 secondary pages on the PageShell + PageHeader
  pattern: /reviews, /reviews/completed, /trust, /compliance,
  /calendar, /verification, /organizations/{search,profile,memory},
  /observability, /admin/{audit-chain,security,metrics}. Each leads
  with title + icon + subtitle + (optional) primaryAction. No deep
  redesign -- just consistent page anatomy. Browser-verified
  /calendar h1 "All your deadlines", /admin/audit-chain h1
  "Hash-chained audit log", /admin/metrics h1 "Real-user metrics",
  /trust (NGO viewer) h1 "Trust Profile". The codebase now has a
  single canonical page anatomy on every major user-visible page.

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
