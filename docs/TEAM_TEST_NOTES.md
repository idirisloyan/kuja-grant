# Kuja — Team test notes (Phases 13-26)

**Period covered:** 2026-05-15 → 2026-05-16
**Live URL:** https://web-production-6f8a.up.railway.app
**Commits in scope:** `2c77614` → `b0ac3d5` (14 phases shipped over 2 days)
**Backlog status:** payment integration is the only remaining deferred item.

This is the full test reference for everything that's landed since the last team round. Organised by what testers actually click on, not by phase number — phase numbers are cross-referenced where helpful for the engineering side.

---

## Table of contents

1. [Sustained AI chat](#1-sustained-ai-chat) — `Phase 24B, 25B, 26A`
2. [Reviewer experience — match, panel, auto-assign, calibration, throughput, side-by-side scoring](#2-reviewer-experience) — `Phase 19D, 20B, 21A, 23A, 24A, 25A, 26B`
3. [Donor dashboard — verdict, diagnostics, risk heatmap, cohort, onboarding, action queue](#3-donor-dashboard) — `Phase 16B, 18C, 23B, 24C, 25C`
4. [Donor lifecycle tools — broadcast, merge, calibration, exports, decisions](#4-donor-lifecycle-tools) — `Phase 14, 17D, 21A, 21B, 21C`
5. [NGO dashboard — readiness, onboarding, summary URL, capacity passport](#5-ngo-dashboard) — `Phase 17B, 18A, 19C`
6. [Application lifecycle — timeline, messaging, kanban, dedupe, score breakdown](#6-application-lifecycle) — `Phase 15, 20A, 20C, 21D, 22A`
7. [Reports — list, detail page, bundles, follow-ups, AI compliance](#7-reports) — `Phase 8, 13, 14, 26A`
8. [Trust + truth-in-claims — donor profile, NGO public, passport, gap insights, benchmarks](#8-trust--truth-in-claims) — `Phase 18A, 18B, 19A, 19C, 20D`
9. [Search + insights — global search, debrief rollup, AI insights, cross-grant patterns, past wins](#9-search--insights) — `Phase 15A, 16A, 19B, 22B`
10. [Audit chain + portfolio bundles + calendar PDF](#10-audit-chain--bundles--calendar) — `Phase 13, 14, 20D`
11. [Notifications + digests + smart match](#11-notifications--digests--match) — `Phase 16C, 22D`
12. [PWA install + native share](#12-pwa-install--native-share) — `Phase 24D`
13. [Biometric re-authentication (WebAuthn)](#13-biometric-re-authentication-webauthn) — `Phase 26C`
14. [Admin tools — observability, audit chain, merge, compliance rerun, UAT fixtures, cron sweep](#14-admin-tools) — `Phase 15D, 17D, 22C, 26B`
15. [i18n](#15-i18n)
16. [Test accounts](#16-test-accounts)
17. [Stats + known gotchas](#17-stats--known-gotchas)
18. [What's NOT in this batch](#18-whats-not-in-this-batch)

---

## 1. Sustained AI chat

Until Phase 24, every AI interaction was one-shot — ask, answer, forget. The new chat is a **real conversation** where Claude sees the last 12 messages on every turn.

### Where to find it
- **Sidebar:** "Chat with Kuja" — visible for NGO + donor roles (top of nav)
- **Dedicated page:** `/chat` — global scope
- **Per-entity scoped:** bottom of these detail pages, Claude knows about the entity:
  - Grant detail `/grants/[id]`
  - Application detail `/applications/[id]`
  - Report detail `/reports/[id]` *(new page — see §7)*

### What to verify
- [ ] First message gets a reply within ~10s
- [ ] Follow-ups like "rewrite that in a less formal tone" show Claude remembers prior turns
- [ ] Reset button wipes the conversation, thread row survives
- [ ] On a grant page, ask "what are the top 3 risks reviewers will flag?" — Claude references the actual scope content
- [ ] Per-user thread isolation: log in as `fatima` then `sarah` — different histories
- [ ] Rate-limit gate kicks in if you spam messages (returns 429)

### Honest limitations
- If you ask about something Claude doesn't have in scope, it says "I don't have that loaded — try the corresponding page" rather than guess
- Max 12 messages of history sent per turn (cost cap); older bubbles stay visible
- The legacy CopilotRail "Ask" tab on the right edge is still one-shot streaming — that's intentional, distinct UX

---

## 2. Reviewer experience

### Reviewer matching intelligence (Phase 19D)
Service ranks reviewers per application using sector fit, country fit, throughput health, current workload. Powers both the manual "Suggest reviewers" UI and the new auto-assignment.

### Automatic assignment on submit (Phase 25A)
When an NGO submits an application, the system **automatically picks the top 3 reviewers**. No donor action required. Idempotent — manual donor picks are not overridden.

### Manual override
Donor can still click "Auto-assign reviewers" on an application detail page to top up a partial panel.

### Nightly safety net cron (Phase 26B)
Cron at **02:45 UTC daily** sweeps every `{submitted, under_review}` app with zero reviewers and assigns them. Caps 50/run.

### Reviewer briefing (Phase 20B)
On the application detail page, reviewers see a one-paragraph AI brief: applicant context, key strengths, red flags to probe.

### Panel calibration (Phase 21A)
Detects divergent reviewer scores on the same app. Three states: tight panel (within 8 pts), normal divergence (within 20 pts), divergent panel (>20 pts) — prompts donor to ask why or add a 3rd reviewer.

### Side-by-side reviewer scoring (Phase 23A)
On the application detail page, donor sees each reviewer's per-criterion scores side-by-side. Easier to spot disagreement at the criterion level.

### Reviewer throughput dashboard (Phase 16E)
Reviewer dashboard shows their own SLA: median turn-around days, oldest open assignment, slipping indicator. Admin can inspect any reviewer via `?reviewer_id=`.

### What to verify
- [ ] **Submit a fresh draft application** (any NGO) — confirm reviewer rows appear almost immediately on the app detail
- [ ] Reviewer panel shows 3 names with match scores + reasons ("sector fit", "country fit")
- [ ] Auto-assign is **idempotent**: clicking the manual button twice doesn't duplicate
- [ ] Verified backfill ran in prod: scanned 25 apps, assigned 50 reviewers
- [ ] As a reviewer (`james@reviewer.org`), open an assigned application — briefing card visible
- [ ] When two reviewers disagree by >20 pts, panel calibration card surfaces the divergence
- [ ] Donor sees side-by-side reviewer scores on application detail
- [ ] Reviewer dashboard `/dashboard` shows throughput card

---

## 3. Donor dashboard

### Verdict card (top hero, Phase 23)
AI synthesis of "today's portfolio decisions" — clickable action buttons that route to the relevant page (review applications, manage grants, etc.).

### Portfolio diagnostics card (Phase 23)
Cross-grant anomaly detection — surfaces grants where review velocity, scoring, or report timeliness drift from the donor's portfolio norm.

### Application pipeline funnel
Visual breakdown of applications by stage (Submitted → Under review → Scored → Awarded).

### Review velocity bars
Median + p75 days per pipeline stage.

### Portfolio risk heatmap (Phase 23B)
Sector × country grid showing risk concentration. Each cell shows grants, open risks, overdue reports, flagged apps; coloured by aggregate risk score.

### Peer benchmarks (Phase 16B)
How this donor stacks up vs other donors on decision speed, decline rate, portfolio size.

### Donor cohort analytics (Phase 24C, NEW)
**How the NGOs you fund compare to NGOs other donors fund.** Capacity score, AI score at award, country + sector diversity, % funding to small/emerging orgs, grantee reporting on-time rate. Each metric: your value, cohort median, percentile, verdict pill.

### Donor onboarding card (Phase 18C)
3-step checklist visible only until all complete.

### Donor action queue
Today's open items requiring action — applications to review, deadlines coming up, reports awaiting decision.

### What to verify
- [ ] Verdict card shows AI synthesis with clickable actions
- [ ] Portfolio diagnostics card shows per-grant rollup with any anomalies flagged
- [ ] Risk heatmap renders as a grid with coloured cells; click on a cell drills to the grants in that bucket
- [ ] Peer benchmarks show 3 metrics (decision speed, decline rate, portfolio size) with percentile + verdict
- [ ] **Cohort card sparse-honest:** prod has only 2 other donors → shows "Only 2 other donors on the platform — not enough yet to fairly compare." This is correct
- [ ] Admin can inspect any donor's cohort via `/donors/<id>` (cohort card at the bottom)
- [ ] Identity protection: no NGO names or specific dollar amounts on cohort card

---

## 4. Donor lifecycle tools

### Decision recording with debrief (Phase 14)
When marking an application `awarded` or `rejected`, donor records a controlled-vocabulary reason code + free-text notes. Drives debrief rollups + win/loss patterns.

### Donor broadcast (Phase 21B)
On a grant detail page, donor sends one message to all applicants (or just drafts, or just submitted). Subject + body + audience selector.

### CSV exports (Phase 21C)
"Export CSV" link on grants list, applications list, reviews list. Scoped to caller's visible data. Admin can export all.

### Donor merge tool (Phase 17D, admin-only)
If two donor orgs accidentally exist (e.g. typo'd email signup), admin can merge them with confirm_name protection.

### Donor portfolio bundle (Phase 13)
Download a PDF + ZIP of the entire portfolio: grants, awarded apps, reports, audit anchors.

### What to verify
- [ ] Recording a decision (awarded/rejected) requires a reason code from the dropdown
- [ ] Broadcast dialog: send a test broadcast to "drafts only" — applicants receive it
- [ ] CSV exports: donor downloads `/api/exports/grants.csv` — opens cleanly in Excel
- [ ] NGO is blocked from `/api/exports/grants.csv` (403)
- [ ] Admin merge tool: requires typing the source org name exactly to confirm
- [ ] Portfolio bundle: PDF downloads and opens; ZIP contains expected sub-files

---

## 5. NGO dashboard

### NGO readiness console (Phase 17B)
3-step onboarding checklist (assess capacity, complete profile, browse grants). Disappears once all done.

### Trust gap insights (Phase 18A)
AI reads NGO's two-pillar trust score + sub-components and prioritises highest-leverage actions to lift it. Includes lift estimate + effort label.

### Trust profile (Phase 18A, 20D)
Two-pillar view (Capacity + Diligence) with sub-components, AI synthesis, gap insights card if score < 80.

### NGO portfolio bundle (Phase 14)
Download all the NGO's evidence + history as PDF + ZIP — for sharing with donors directly.

### Public summary URL (Phase 19C, opt-in)
NGO can publish a public read-only summary at `/ngo/[slug]` showing aggregate delivery snapshot. Toggle in org settings.

### Past wins suggester (Phase 19B)
On the apply page, NGO sees suggested re-usable answers from their previous winning applications.

### NGO command center (Phase 23)
Donor-style portfolio surface adapted for NGO: open opportunities, application pipeline, deadlines, capacity trend.

### What to verify
- [ ] Onboarding card visible for a fresh NGO; disappears after assess + profile + browse
- [ ] Trust profile shows two-pillar bars + AI synthesis paragraph
- [ ] Gap insights card: lift estimates + try-next actions
- [ ] NGO portfolio bundle PDF downloads
- [ ] Toggle public summary in org profile → public URL responds 200 with aggregate data only
- [ ] When applying to a grant, past-wins popover suggests prior winning answers
- [ ] NGO command center renders cleanly

---

## 6. Application lifecycle

### Application timeline (Phase 20A)
Every event on the application — created, submitted, scored, comment added, decision recorded — chronological with event-type icons.

### Application kanban board (Phase 15)
Donor sees applications in a kanban view by status (Submitted / Under review / Scored / Awarded / Rejected). Drag to flip status.

### Custom stage labels (Phase 15C)
Org settings: rename stages to match local workflow ("Submitted" → "Received for triage", etc.).

### Donor ↔ NGO threaded messaging (Phase 20C)
Bottom of application detail page: threaded conversation between the donor + NGO. Both sides see it. Server-side gates enforce.

### Per-criterion score breakdown (Phase 22A)
On application detail, expandable card showing per-criterion AI scores + weights + comments. NGO sees why they got the score; donors/reviewers see all reviewer comments.

### Tags + segmentation (Phase 15E)
Apply tags to applications + grants. Filter list views by tag.

### Duplicate application banner (Phase 21D)
If an NGO tries to apply to the same grant twice, banner shows existing application with link instead of creating a duplicate.

### Activity timeline + status signals rail
Activity history + open ASK/RISK/DECISION rails (Phase 2 lineage, still on the page).

### What to verify
- [ ] Application timeline renders with multiple events; click an event for detail
- [ ] Kanban: drag an app from "Submitted" to "Under review" — status updates
- [ ] Stage labels editor: rename "Submitted" → custom label; verify it shows up everywhere
- [ ] Threaded messaging: NGO posts a message, donor sees it (and vice versa)
- [ ] Score breakdown: expand to see per-criterion AI scores; NGO sees rubric + their answer
- [ ] Apply a tag like "priority-2026" to two apps; filter list by tag
- [ ] Try submitting a duplicate application → banner with link to existing

---

## 7. Reports

### Reports list (existing, hardened in Phase 8 + 13)
NGOs see their reports grouped by due date + status. Donors see reports against their grants. AI compliance score badge.

### Report detail page (Phase 26A, NEW)
`/reports/[id]` — title, status, dates, AI compliance score, attachments count, reviewer notes, AI analysis summary. Plus the **scoped AI chat panel** ("what evidence is missing?", "rephrase the activities section").

### Report bundles (Phase 8)
NGO assembles a report bundle (cover + evidence + audit anchor); donor reviews per-requirement.

### Reviewer follow-ups (Phase 14)
On a report, donor sends outbound follow-up to NGO requesting specific evidence.

### Upcoming reports (existing)
NGO dashboard shows next due dates + AI-evaluated compliance scores.

### What to verify
- [ ] Reports list page renders with grouping + score badges
- [ ] Click into `/reports/<id>` — focused single-report view
- [ ] Visit `/reports/0` placeholder — graceful "Report not found"
- [ ] NGO cannot view another NGO's report (not-found surface, no leak)
- [ ] AI compliance score appears for submitted reports
- [ ] Report bundle assembles; PDF downloads as real PDF
- [ ] Donor sends a reviewer follow-up email — NGO receives it

---

## 8. Trust + truth-in-claims

### Trust profile (existing Phase 1, polished Phase 20D)
Two-pillar trust profile (Capacity + Diligence) with sub-component breakdown, AI synthesis, score history.

### Public donor profile (Phase 18B)
`/donors/[id]` — any logged-in user can view. Aggregate-only data:
- Portfolio size, total committed, decision speed, decline rate
- Active sectors, active countries (top 8, with grant counts)
- Typical grant size band
- Reporting burden signal (low/medium/high)
- Sparse-data fallback if fewer than 3 decided applications

### Public NGO summary (Phase 19C, opt-in)
`/ngo/[slug]` — NGO opts in via org settings. Aggregate delivery snapshot, no individual app data.

### Capacity passport (Phase 1, polished Phase 20D)
Public passport URL with verification token. `/trust/verify/<slug>` for third-party verifiers.

### Trust gap insights (Phase 18A)
AI prioritises highest-leverage actions to lift trust score, with lift estimates + effort labels.

### Public donor benchmarks (Phase 19A)
`/api/organizations/<id>/donor-benchmarks` exposes anonymous peer benchmarks NGOs can use to research a donor before applying.

### Native share buttons (Phase 24D, NEW)
"Share profile" button on `/donors/[id]` and `/ngo/[id]`. Uses `navigator.share()` on mobile, clipboard fallback on desktop.

### What to verify
- [ ] Trust profile page shows two-pillar bars + AI synthesis paragraph
- [ ] Public donor profile renders for any logged-in user (NGO, donor, reviewer, admin)
- [ ] Donor profile sparse-honest with <3 decided apps
- [ ] NGO public summary opt-in toggle works; URL responds 200 only when published
- [ ] Capacity passport verify URL responds correctly (valid + invalid token)
- [ ] Trust gap insights card on `/trust` shows ranked actions
- [ ] Share profile button: mobile opens share sheet, desktop copies + shows "Copied" toast

---

## 9. Search + insights

### Global cross-entity search (Phase 22B)
Header search bar — searches across grants, applications, reports, organisations. Returns shaped results with totals per entity type.

### Debrief insights (Phase 16A)
"Why we typically win/lose" patterns across the NGO's applications. AI synthesises from controlled-vocab reason codes recorded in decisions.

### Debrief rollup (Phase 15A)
NGO + donor versions: aggregated win/loss patterns by sector, deadline pressure, score band.

### Cross-grant patterns (Phase 11)
Donor view: patterns across the portfolio (sectors over-represented, applicants applying to multiple grants, etc.).

### Past wins suggester (Phase 19B)
NGO apply page: re-usable answers from prior winning applications, with similarity score.

### Score breakdown (Phase 22A)
Per-criterion score visualization on the application detail page.

### What to verify
- [ ] Global search: type "kenya" — returns grouped results (grants/apps/reports/orgs) with counts
- [ ] Search query too short returns clean error, not a crash
- [ ] Debrief insights card shows the NGO's win/loss patterns
- [ ] Debrief rollup card on NGO and donor dashboards shows shaped data
- [ ] Cross-grant patterns card on donor command center
- [ ] Past wins popover on apply page suggests relevant prior answers

---

## 10. Audit chain + bundles + calendar

### Audit chain (Phase 7, expanded Phase 13)
Hash-chained tamper-evident provenance log. Every meaningful action (grant published, application decision, report submitted, reviewer assigned, etc.) writes an `AuditChainEntry` with hash-of-previous-row. Admin can view at `/admin/audit-chain`.

### Portfolio audit timeline (Phase 13)
Donor sees per-grant timeline of every audit-anchored event.

### Portfolio bundles (Phase 13 + 14)
- Donor portfolio bundle (PDF + ZIP) — all grants, awarded apps, reports
- NGO portfolio bundle (PDF + ZIP) — assessments, applications, reports, debrief
- Used for evidence sharing without granting platform access

### Calendar PDF (Phase 13)
NGO + donor download a PDF calendar of all upcoming deadlines in their scope.

### What to verify
- [ ] Admin audit chain page shows chronological entries with action codes + actor emails
- [ ] Donor portfolio audit timeline renders per-grant
- [ ] Both portfolio bundle PDFs open cleanly
- [ ] Calendar PDF downloads, renders deadlines correctly
- [ ] Hash chain doesn't break: every entry's `previous_hash` matches the prior row's hash

---

## 11. Notifications + digests + match

### Smart match notifications (Phase 16C)
When a new grant matches an NGO's sector + country, the NGO gets a match notification.

### Notification digest cadence (Phase 22D)
User setting: daily / weekly / off. Controls whether the user appears in the digest cron's batch.

### Notification preferences (Phase 6)
Per-channel (email / in-app / web push) preferences per notification type.

### Web push (Phase 13.34)
Browser push notifications wired to the service worker.

### What to verify
- [ ] Publishing a new grant triggers a match notification for matched NGOs
- [ ] User setting page: change digest cadence; PUT round-trips correctly
- [ ] Notification preferences page: toggle email/push/in-app per type
- [ ] Web push: subscribe → publish a notification → push arrives (browser permission required)

---

## 12. PWA install + native share

### Install banner (Phase 24D)
On supported browsers (Chrome desktop, Chrome Android, Edge), Kuja prompts to install as a home-screen app. Dismissal persists in localStorage.

### Native share (Phase 24D)
"Share profile" buttons on donor + NGO profile pages. Mobile opens system share sheet; desktop falls back to clipboard.

### What to verify
- [ ] Chrome on Android: install banner appears within a few seconds of first visit
- [ ] Dismiss it — banner doesn't reappear on subsequent visits
- [ ] Share button on `/donors/[id]` and `/ngo/[id]` — opens share sheet (mobile) or copies link (desktop)
- [ ] Installed PWA opens directly to `/dashboard`, has Kuja icon + colours

### Honest limitations
- iOS Safari doesn't fire `beforeinstallprompt` — iOS users use Safari's manual "Add to Home Screen"

---

## 13. Biometric re-authentication (WebAuthn)

### Enrolment (Phase 26C)
New page `/settings/security`. Enrol Touch ID / Face ID / Windows Hello / hardware security key. Multiple devices per user (Mac Touch ID + iPhone Face ID + YubiKey all supported).

### What to verify
- [ ] On a Mac, visit `/settings/security` → "Enrol this device" → Touch ID prompt → device appears in trusted list
- [ ] On iPhone Safari, enrol with Face ID → labeled "iPhone/iPad"
- [ ] Remove a device with the trash icon → confirmation prompt then removal
- [ ] Unsupported browsers (very old Chrome / Firefox) show a clean warning instead of broken button
- [ ] List endpoint returns success even with no devices

### What's NOT yet gated
`require_reauth()` helper is wired and ready, but **no sensitive routes use it yet**. Enrolment works end-to-end, but no UI flow currently requires biometric re-auth. Adding gates is intentionally a follow-up so we can pick gates with the team based on what's worth protecting. Likely candidates: changing notification preferences, deleting reports, recording award decisions.

### Honest limitations
- Requires HTTPS (works on prod, not on local `http://127.0.0.1` dev)
- Re-auth tokens 5-min single-use, in-process — multi-worker deploys would need Redis (current prod runs single Gunicorn worker)
- Sign-count regression treated as hard fail (clone detection)

---

## 14. Admin tools

### Audit chain viewer (`/admin/audit-chain`)
Chronological entries with action, actor, subject, timestamp, hash.

### Compliance rerun cron (Phase 22C)
Admin can manually trigger or wait for the daily cron that re-screens NGOs whose adverse-media screening is stale.

### UAT fixture cron (Phase 15D)
Daily cron at 03:15 UTC ensures demo state stays meaningful (every donor has open + awarded + rejected apps, at least one report bundle published).

### Reviewer auto-assign sweep cron (Phase 26B, NEW)
Daily at 02:45 UTC. Catches apps that submitted before Phase 25A or where the synchronous auto-assign call silently failed.

### Donor merge tool (Phase 17D)
Admin merges two donor orgs (requires typing source name to confirm).

### Observability dashboard (`/observability`)
Surface health for AI calls, queue depth, error rate.

### Stage labels editor (Phase 15C)
Per-org editor for custom application stage labels.

### What to verify
- [ ] Audit chain admin page loads
- [ ] Trigger compliance rerun cron manually as admin → returns drift report
- [ ] UAT fixture cron returns counts; not callable by non-admin
- [ ] Reviewer auto-assign sweep cron: admin can trigger; **prod backfill assigned 50 reviewers across 25 apps**
- [ ] Donor merge tool requires exact source name match
- [ ] Observability page renders without 500
- [ ] Stage labels editor saves custom labels; visible everywhere

---

## 15. i18n

Languages supported: **en / fr / es / ar / sw / so** (English / French / Spanish / Arabic / Swahili / Somali).

### Phase 23 added
Batch of keys for Phase 18-22 components (~50 keys × 6 locales = 300 entries).

### Phase 24-25 added
222 new keys across 6 locales: chat panel, PWA install banner, share buttons, donor cohort card, "Chat with Kuja" sidebar label.

### What to verify
- [ ] Switch language to French / Arabic / Swahili / Somali / Spanish via user settings
- [ ] Chat panel header, empty state, action buttons all translated
- [ ] PWA install banner translated
- [ ] Share button translated
- [ ] Donor cohort card translated
- [ ] No raw `chat.empty.title` or similar key names visible anywhere
- [ ] Arabic + Somali read right-to-left where applicable
- [ ] Uncovered strings fall through to English (intentional inline-fallback pattern)

---

## 16. Test accounts

All passwords: `pass123`

| Email | Role | Country/org | What they're useful for |
|---|---|---|---|
| `fatima@amani.org` | NGO | Kenya | Standard NGO flow, chat, auto-assigned reviewers, gap insights |
| `ahmed@salamrelief.org` | NGO | Somalia | Test Somali locale + Arabic |
| `thandi@ubuntu.org` | NGO | South Africa | Multi-country NGO testing |
| `peter@hopebridges.org` | NGO | Uganda | — |
| `aisha@sahelwomen.org` | NGO | Nigeria | — |
| `sarah@globalhealth.org` | Donor | Geneva | Donor dashboard, cohort card, broadcast, exports |
| `david@eatrust.org` | Donor | East Africa | Second donor for cohort/peer comparisons |
| `james@reviewer.org` | Reviewer | — | Reviewer panel rows + briefing + throughput dashboard |
| `maria@reviewer.org` | Reviewer | — | Second reviewer for panel calibration tests |
| `admin@kuja.org` | Admin | — | Cron triggers, audit chain, merge, cohort inspect on `/donors/<id>` |

---

## 17. Stats + known gotchas

### Stats snapshot
- **Python smoke tests:** 137/137 passing
- **Playwright browser UAT specs:** 100 across 23 categories
- **Phases shipped this batch:** 14 (Phase 13 → 26)
- **Commits since previous team round:** 14 commits, 14 deploys
- **Prod regressions surfaced by users:** 0

### Known gotchas (these look broken but aren't)
1. **First chat reply is slow if AI is cold** — ~5-10s. Subsequent turns faster.
2. **Cohort card hides metrics with sample size below 2** — donors with only 1 awarded app see fewer rows than expected. Intentional honesty, not a bug.
3. **Auto-assign skips already-assigned reviewers** — if a donor manually picked a panel, auto-assign won't override.
4. **Per-scope chat threads are separate from global** — asking "what should I prioritise today?" on `/chat` does NOT see history from a grant-scoped chat (by design — scope context is different).
5. **WebAuthn doesn't yet gate any specific route** — enrolment is opt-in, gating is a follow-up.
6. **Cohort + benchmarks show "sparse" in prod** — only 2 other donors exist; below `MIN_COHORT=3` threshold. Correct behaviour.
7. **Hash chain entries are append-only** — admins cannot edit or delete audit entries; this is intentional.
8. **Stage label customisation is per-org** — changes in one org don't affect another.
9. **iOS doesn't show install banner** — Apple doesn't fire `beforeinstallprompt`; use Safari's share sheet → "Add to Home Screen".
10. **NGO public summary requires opt-in toggle** — fresh NGOs see 404 on their `/ngo/<slug>` URL until they publish from org profile.

### Quick smoke commands

```bash
# Trigger reviewer auto-assign sweep (admin or with CRON_SECRET)
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://web-production-6f8a.up.railway.app/api/cron/reviewer-auto-assign-sweep

# Check donor cohort analytics (after donor login → cookie jar)
curl -b cookies.txt -H "X-Requested-With: XMLHttpRequest" \
  https://web-production-6f8a.up.railway.app/api/dashboard/donor-cohort-analytics

# Open or resume a chat thread
curl -b cookies.txt -X POST -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" \
  -d '{"scope_kind": null, "scope_id": null}' \
  https://web-production-6f8a.up.railway.app/api/ai/threads/open

# Global search
curl -b cookies.txt -H "X-Requested-With: XMLHttpRequest" \
  "https://web-production-6f8a.up.railway.app/api/search?q=kenya"

# Reviewer throughput (as reviewer)
curl -b cookies.txt -H "X-Requested-With: XMLHttpRequest" \
  https://web-production-6f8a.up.railway.app/api/dashboard/reviewer-throughput

# Risk heatmap (as donor)
curl -b cookies.txt -H "X-Requested-With: XMLHttpRequest" \
  https://web-production-6f8a.up.railway.app/api/dashboard/portfolio-risk-heatmap
```

---

## 18. What's NOT in this batch

**Payment integration** (Stripe + Flutterwave) is the only deferred backlog item. Still pending API keys, PCI scope review, finance ops sign-off on refund window / hold period / jurisdiction restrictions. Everything around money — award decisions, debrief, audit chain, report bundles, dispute trails — is shipped; the actual disbursement is the only gap.

If anything in §1-15 doesn't behave as described, flag it with:
- the URL
- which test account
- a screenshot
- (optional) browser console errors

Team Slack works, or open a GitHub issue against `idirisloyan/kuja-grant`.
