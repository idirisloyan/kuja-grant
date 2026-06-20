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
