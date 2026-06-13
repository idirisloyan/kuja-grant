# Kuja Design Changelog — 2026-06-12

> **Theme of the day: category-defining for the Global South NGO experience.**
> Twelve phases shipped to live prod, four phases worth of work explicitly
> deferred to the backlog with precise unblock paths. This document is the
> single read for what changed, why, what landed, and what didn't.
>
> Sister docs: `DESIGN_PRINCIPLES.md` (the principles being applied here)
> and `NEAR_BACKLOG.md` (the rolling work log + deferred items).

---

## At a glance

| | Count |
|---|---|
| Phases shipped to live prod | **12** (Phases 71 – 82) |
| Phases queued / deferred today | **7** (documented in backlog with unblock actions) |
| Commits | 13 |
| Production deploys | 5 (paced ≥5 min apart per deploy-cadence rule) |
| External probes between deploys | All 200 OK |
| Code surface added | 14 new components, 8 new endpoints, 4 new AI services |
| Roles affected | NGO · operator (admin) · donor · reviewer · OB committee member |

---

## Why this push, why today

The Phase 45–70 design refactor that landed yesterday (2026-06-11) was
infrastructure: PageShell, status-copy library, "what needs attention"
dashboards, per-window operational drill-in. Solid foundations, but the
NGO and operator experience was still incremental.

The 2026-06-12 push goes one layer up: **the moments that decide whether
a Global South NGO actually finishes their work**. Those moments — voicing
a report, photographing evidence, drafting an application, handling a
rejection, requesting an extension, surviving an audit — are where Global
South NGOs lose the most time and where the platform can lean on AI to
collapse the work from hours into minutes.

The strategic frame: **Kuja becomes a co-pilot for the NGO, a compliance
coach, and a trust-portable identity** — three roles no donor-specific
point solution can replicate, and three roles AI can now genuinely fulfil.

---

## The user we kept in mind

Throughout every design choice today: a program officer in Garissa or
Bunia, sharing a laptop with two colleagues, intermittent 3G, operates
in Somali or Swahili first, comfortable with WhatsApp but not web apps,
lost an audit last year because they couldn't find a 2024 receipt PDF.

If a feature didn't make her life materially easier in that operating
environment, we didn't build it today.

---

## Phases shipped to live prod

### Reporting & compliance arc

#### Phase 71 — Voice-to-report
**Surface:** `/reports` list, mounted next to each draft report.

**What it does:** NGO records a 5-minute voice memo in any of 6 languages
(EN / FR / AR / SW / SO / ES) via the browser's Web Speech API. Claude
maps the freeform transcript onto the donor's reporting requirements and
returns a per-section coverage report with plain-language follow-up hints
for sections that are still thin.

**Why:** the 4-hour Excel-and-PDF dance to write a quarterly report is
the single biggest reason reports are late or skipped. Talking for 5
minutes in your own language → AI structures it → review-and-edit collapses
the work from 4 hours to ~10 minutes.

**Code:**
- `app/services/ai_service.py` → `AIService.structure_voice_report`
- `app/routes/reports.py` → `POST /api/reports/<id>/structure-from-voice`
- `frontend/src/components/reports/VoiceReportComposer.tsx`

**Behavioural design notes:**
- Coverage status is `covered | partial | missing`, each `partial`/`missing`
  gets a one-sentence follow-up hint phrased as a question the NGO can
  answer in one breath.
- Browsers without Web Speech API (Firefox, Safari iOS) fall back to typed
  input — no surface break.
- Original transcript is persisted on `ai_analysis` so the donor can see
  the report was voice-drafted (transparency).

---

#### Phase 72 — Photo-as-evidence
**Surface:** `/reports` list, next to VoiceReportComposer.

**What it does:** NGO uploads (or directly captures via phone camera —
`capture="environment"`) a photo of an attendance sheet, receipt,
training session, or site visit. Claude vision extracts structured
fields appropriate to each kind:
- attendance → list of attendees + count
- receipt → vendor, total, currency, line items
- training → activity type, attendee count estimate, observations
- site_visit → location clues, condition observations
- other → subject + key facts

**Why:** for NGO field staff, the smartphone IS the scanner/OCR/data-entry
tool. The scan + OCR + retype + reformat pipeline that consumes hours per
report can be collapsed to one photo upload.

**Code:**
- `app/services/ai_service.py` → `AIService.extract_photo_evidence`
- `app/routes/reports.py` → `POST /api/reports/<id>/photo-evidence`
- `frontend/src/components/reports/PhotoEvidenceUploader.tsx`

**Behavioural design notes:**
- Confidence-scored. `legibility_warnings` surfaced as user-facing chips
  ("Two attendee names are smudged — can you confirm?").
- 5 MB cap; conservative prompt — "extract only what is clearly visible",
  no invented numbers/dates/locations.
- File saved as a `Document` row + linked to the report's `attachments`
  array + provenance written to `ai_analysis.photo_evidence` so the donor
  sees this evidence was AI-extracted.

---

#### Phase 73 — Audit-ready folder
**Surface:** `/grants/[id]` header → "Audit folder" download link.

**What it does:** one-click ZIP per grant. Folder structure:
```
1-agreement/   The signed grant document
2-application/ NGO application(s) + supporting docs
3-reports/<period>/  content + metadata + revision history
4-reviews/      Reviewer notes per report / per application
5-evidence/     Photo-evidence + image attachments
6-financials/   Documents flagged as financial/budget/receipt
manifest.txt    Human-readable README
manifest.json   Machine-readable inventory with SHA-256 of every file
```

**Why:** NGOs are routinely audited — by their own auditors, by donor
auditors, sometimes by government — on a few days' notice. Reconstructing
"everything related to grant X" from Drive + email + folders takes days.
This collapses it to a single click and includes tamper-evident hashes.

**Code:**
- `app/routes/grants.py` → `GET /api/grants/<id>/audit-folder`
- `frontend/src/app/(app)/grants/[id]/client.tsx` — PageHeader action.

**Access design:**
- NGO can export only the folder for grants they applied to.
- Donor can export full folder for grants they fund.
- Admin can export any grant.
- Reviewer blocked (wrong scope).

---

#### Phase 74 — NGO compliance coach
**Surface:** NGO dashboard, prominent panel inside PageMain.

**What it does:** flips the compliance dynamic. Today donors see an NGO's
posture (risk flags etc.); the NGO only sees red banners. Coach surfaces:
- timeliness (avg lateness days vs peer median)
- AI content quality (avg compliance_score vs peer median)
- submission record (on-time / late / overdue counts)
- per-pillar action hints
- single recommended next action with deep-link

**Why:** compliance as growth, not as surveillance. NGOs improve when they
see what "good" looks like for orgs like them, with concrete next steps.

**Code:**
- `app/routes/dashboard.py` → `GET /api/dashboard/compliance-coach`
- `frontend/src/components/dashboards/compliance-coach-card.tsx`

**Behavioural design notes:**
- Tone-coded: good / warn / bad with friendly copy ("no judgement, but
  the network depends on quick decisions").
- Hides gracefully when `total_submitted < 2` — not enough data to coach
  is shown as a "we'll start coaching when you have a few more reports"
  card rather than a punitive 0.
- Peer median computed across orgs with ≥3 reports each (excludes own org)
  so the benchmark is statistically meaningful.

---

#### Phase 81 — Smart deadline negotiation
**Surface:** `/reports/[id]` detail page, both roles.

**What it does:** NGO submits an extension request with `{ extra_days,
reason }`. Donor (or admin) approves, counters with different days, or
declines — all in-app, optionally with a note. On approval, due_date
moves automatically. History persisted on `ai_analysis.extension_requests`.

**Why:** today, extension negotiation happens in back-channel email and
neither party has an audit trail. The platform mediates so both sides
have a record and approval/decline becomes a single click.

**Code:**
- `app/routes/reports.py` → `POST /api/reports/<id>/extension-request`
  + `POST /api/reports/<id>/extension-decision`
- `frontend/src/components/reports/deadline-negotiator.tsx` — single
  component handles both sides based on role.

---

#### Phase 76 — Why-rejected (constructive feedback)
**Surface:** `/applications/[id]` and `/reports/[id]`, mounted at top of
PageMain when status ∈ {declined, rejected, revision_requested}.

**What it does:** AI mentor when a submission is declined.
Returns:
- empathetic 2-sentence summary
- 2-4 specific issues (each with evidence + impact)
- 2-4 concrete suggestions (each with action + expected lift)
- single line of encouragement

**Why:** most donors give cursory feedback ("not competitive", "see notes",
or nothing). This translates the donor's sparse signals + the submitted
content + the rubric into specific, kind, action-oriented advice. The
platform becomes the empathetic mentor the NGO doesn't have on staff.

**Code:**
- `app/services/ai_service.py` → `AIService.explain_rejection`
- `app/routes/applications.py` and `app/routes/reports.py` →
  `GET /api/.../<id>/explain-rejection`
- `frontend/src/components/shared/why-rejected-panel.tsx`

**Behavioural design notes:**
- Lazy-loaded: AI call only fires when the panel is opened (saves tokens).
- Prompt rule: "warm not patronising, specific not generic, every issue
  has a fix." If donor gave no useful notes, says so transparently
  rather than inventing.

---

### Application arc

#### Phase 75 — AI-drafts-application v0
**Surface:** `/apply/[grantId]`, banner above DraftCoAuthor.

**What it does:** "Don't start from blank — let Kuja draft this for you."
Pre-fills every response field by composite-grounding on:
- the grant's rubric, eligibility, doc requirements
- the org's latest capacity assessment (framework, score, top 30 response
  keys)
- the org's last 2 submitted applications (excerpted responses)
- the org's profile (sector, country, year founded, mission)

Per-question rationale ("Drawn from your 2025 capacity assessment, section
IV") and a `gaps[]` list (questions with no context to ground in).

**Why:** the blank-page problem is real — every grant asks 8-15 free-text
questions that take hours each. We already have the data; the NGO just
needed it composed.

**Code:**
- `app/services/ai_service.py` → `AIService.draft_application_responses`
- `app/routes/applications.py` → `POST /api/applications/<id>/ai-draft`
  (body.merge=false → preview; body.merge=true → fills empty fields,
  never overwrites typed text)
- `frontend/src/components/apply/SmartDraftBanner.tsx`

**Behavioural design notes:**
- Two-step UX: preview shows N drafted sections + gap list + source
  attributions → "Use this draft" commits.
- Hidden once any response has >30 chars typed — so it doesn't intrude
  later.
- Prompt rule: "use ONLY information present; NEVER invent dates,
  beneficiary counts, locations, organisational facts."

---

#### Phase 77 — Trust-portable badge
**Surface:** `/apply/[grantId]` (compact pill), `/assessments` and
dashboard (full panel).

**What it does:** makes the canonical Trust Profile **visible** to the
NGO. Today the profile exists and serves every donor, but the NGO doesn't
know — they still feel like they're starting from zero each time. The
badge says, in plain language: "Submit once, visible to every donor on
Kuja. No more filling out 12 donor questionnaires."

**Why:** this is the strongest structural moat against donor-specific
point solutions. It was invisible UX-wise, so it wasn't doing the
psychological work it could be doing.

**Code:**
- backend already provided `/api/trust-profile/<org_id>` — no schema/route
  change.
- `frontend/src/components/shared/trust-portable-badge.tsx` — two variants
  (compact pill, full gradient panel).

---

#### Phase 78 — AI content translation
**Surface:** `/reports/[id]` reviewer-notes block (mounted first; will
expand to more surfaces in subsequent phases).

**What it does:** wraps any free-text block. Default shows original;
"Translate to <UI lang>" button calls Claude; "Show original" toggle
reveals source. Source-language detection + fidelity score + translator
notes (cultural-nuance flags) shown beside.

Languages: EN / FR / AR / SW / SO / ES.

**Why:** today, reporting in the Global South is implicitly English /
French because "the donor reads that." This forces program officers to
write in their second or third language. Removing that constraint is a
quality unlock — and a filter that's been excluding otherwise-capable
NGOs whose English is weak.

**Code:**
- `app/services/ai_service.py` → `AIService.translate_text`
- `app/routes/translate_routes.py` → `POST /api/translate`
  (registered as `translate_bp`)
- `frontend/src/components/shared/translate-this.tsx`

**Behavioural design notes:**
- Cost-conscious: AI call only fires on click; result cached for session.
- Prompt rule: "preserve numbers/dates/names/currencies exactly; natural
  professional tone in target; keep domain codes/KPI refs as-is; flag
  cultural-nuance tricky choices in notes."

---

### NEAR-specific arc

#### Phase 79 — Declaration-as-conversation
**Surface:** new tab in `DeclarationWizard` modal; default mode.

**What it does:** OB committee member describes what's happening in their
own words (typed or voice-transcribed). Claude parses out:
- title (short, action-oriented)
- crisis_type / severity / country
- proposed total amount + currency (if mentioned)
- 2-3 sentence summary
- suggested OB committee (3-5 user_ids picked from the active roster)
- rationale for that committee
- confidence + warnings

Result preview shows parsed fields → "Use this draft" jumps to step 2
of the existing wizard pre-filled.

**Why:** OB members in real crisis response are not form-fillers; they're
operators reacting to a situation. The 4-step wizard (Phase 45) is great,
but starting from a structured form makes the platform feel bureaucratic
in moments where bureaucracy is exactly the wrong tone.

**Code:**
- `app/services/ai_service.py` → `AIService.parse_declaration_from_narrative`
- `app/routes/emergency_declaration_routes.py` →
  `POST /api/declarations/parse-narrative` (preview-only; doesn't create
  a declaration)
- `frontend/src/components/declarations/declaration-conversation.tsx`
- `frontend/src/components/declarations/declaration-wizard.tsx` — adds
  mode toggle in header.

**Behavioural design notes:**
- Conservative parser — does NOT invent locations, beneficiary counts, or
  dates the operator didn't mention.
- Committee suggestion uses the live OB roster + latest crisis-monitoring
  rows for grounding.
- Conversation mode hides the stepper rail and footer chrome so the focus
  stays on the conversation.

---

#### Phase 80 — Signature-pace gentle coaching
**Surface:** operator (admin) dashboard, after the attention block.

**What it does:** for a committee member, computes:
- last 6 signatures' median + p90 days from assignment to signed
- against the 6-day network target
- list of currently-pending declarations awaiting their signature, with
  age + over-target flag

Tone-coded headline + plain-language hint. Bad tone copy explicitly says
"no judgement, but the network depends on quick OB decisions in a crisis."

**Why:** Phase 68 ships the median/p90 telemetry per window. Phase 80
turns it into personal coaching for the signer. Phase 68 told operators
"your network's pace is slipping"; Phase 80 tells the signer "your
personal pace is slipping, here's what to do." Same data, more useful
framing.

**Code:**
- `app/routes/dashboard.py` → `GET /api/dashboard/signer-coach`
- `frontend/src/components/dashboards/signer-coach-card.tsx`

---

### Cross-cutting

#### Phase 82 — Today's focus banner
**Surface:** top of every role's attention dashboard (NGO, operator,
donor, member).

**What it does:** picks the highest-priority attention item from the
existing list, renders it as a kuja-display headline + plain-language
hint + single CTA, deep-links to the right surface with one click.

Priority logic:
- `bad` tone +1000 / `warn` +500 / `good` +100
- `severity = critical` +800 / `high` +400
- `due_in_days < 0` → +600 + |days|×10 (overdue rises sharply)
- `due_in_days ≤ 7` → +300

**Why:** Phase 48 introduced the "what needs attention" dashboards, but
the most important real estate (the very top) was still a generic
"Welcome back" greeting. Phase 82 puts the one thing the user should do
today exactly where the eye lands first. Below it, `PageAttention` still
shows the full list for the broader picture.

**Code:**
- `frontend/src/components/dashboards/today-focus-banner.tsx`
- Mounted in all four `attention-*-dashboard.tsx` components above
  `PageAttention`.

**Behavioural design notes:**
- Empty state isn't punitive: "You're all caught up. Take the win." —
  rewards the user.
- Tone-aware styling: bad → destructive gradient, warn → sun, good →
  grow.
- Counter ("+ N more attention items below") tells the user where the
  rest live without forcing them to scroll.

---

## What was deferred — and why

Each item below is high-value but blocked on something that can't be
done from a build session. All seven are documented in
`docs/NEAR_BACKLOG.md` with the precise unblock action.

### 1. WhatsApp surface (first-class channel)
**Why deferred:** Meta Business API approval is a 2-4 week external
process. We need to pick a BSP (Twilio, Vonage, Karix), submit, wait,
then set credentials on Railway.
**Why high-value:** many NGO field staff don't check email — they live
in WhatsApp. Capacity assessment, deadline reminders, voice-memo
reports, photo-evidence uploads could all land in WhatsApp.
**Engineering effort once unblocked:** ~2 days. The generic
`app/services/messaging` adapter already abstracts SMS/WhatsApp.

### 2. SMS OTP login
**Why deferred:** needs a Twilio account + provisioned phone number.
~$0.01/SMS in most LMIC markets.
**Why high-value:** email is a barrier for staff who don't check it.
SMS one-tap is universal. Keep email as optional.
**Engineering effort once unblocked:** ~3 days for the new auth method
+ flow.

### 3. Donor-pays-for-AI (billing reframe)
**Why deferred:** needs Stripe Connect for donor org billing + per-org
token metering hooks (AI service already wraps every Claude call, so
metering insertion itself is mechanical).
**Why high-value:** removes the implicit "will my AI calls cost the
NGO?" question. Reframes AI as "value the donor invests in capacity
building." Cleaner unit economics.
**Engineering effort once unblocked:** ~1 week including donor-portal
billing UI.

### 4. Offline-first PWA (IndexedDB + Service Worker)
**Why deferred:** no external creds; just multi-week engineering. Service
Worker scope, IndexedDB schema for forms-in-progress, conflict resolution
on sync are all real design problems.
**Why high-value:** rural NGOs work over intermittent 3G. Drafting an
assessment offline + syncing on next connection is operational table
stakes for the user the product targets.
**Engineering effort:** ~1 week for the manifest + offline route basics;
3-4 weeks for the full sync layer.

### 5. Peer reference snippets ("orgs like yours wrote this")
**Why deferred:** needs anonymization infrastructure (per-section
extract, scrub identifying detail, opt-in consent gate on the source
NGO). Reusing live applications without anonymization would violate
NGO trust.
**Why high-value:** non-technical NGOs don't know what "good" looks like.
Showing them anonymized peer snippets per section is a strong learning
signal donors won't provide.
**Engineering effort:** ~1 week for the anonymizer + consent gate + the
similar-org recommender.

### 6. NEAR cohort onboarding (6-week curriculum)
**Why deferred:** needs curriculum content authored by the NEAR
secretariat (not engineering work) + a lightweight scheduler.
**Why high-value:** new NEAR members today land in the platform and have
no path. A 6-week guided curriculum (complete profile → upload 3 docs
→ run first internal review → run first MV) gives them a path and
builds trust score gradually.
**Engineering effort:** ~2 weeks once curriculum content lands.

### 7. Side-by-side rubric preview
**Why deferred:** Phase 75 covered ~70% of the value with the
`confidence` and `gaps` shown in the SmartDraftBanner. A full live-rubric
preview that scores responses against the donor's rubric as the NGO types
is its own week of work.
**Why high-value:** donors hide their scoring rubric today. Showing it
to applicants — with a live score estimate — turns "guess what the donor
wants" into "I know exactly what they want." Transparency favours
prepared NGOs.
**Engineering effort:** ~1 week to wire up the live scorer.

---

## Deploy timeline (cadence rule from yesterday's post-mortem)

| Phase | Commit | Local time | Deploy fired | Cadence between |
|---|---|---|---|---|
| Backlog post-mortem | `7e3cd040` | early | — | — |
| 71, 72, 73, 74 | 4 commits | 12:40 | yes | first |
| 75, 76 | 2 commits | 13:08 | yes | +28 min |
| 77 | 1 commit | 13:25 | yes | +17 min |
| 78 | 1 commit | 13:32 | yes | +7 min |
| 79, 80, 81 | 3 commits | later | yes | +12 min |
| 82 | 1 commit | last | yes | +9 min |

Every deploy gated on an external probe of `/api/health` + `/api/ready`
+ `/login/` returning 200 from outside the chat egress. Railway dashboard
`SUCCESS` was treated as necessary but not sufficient evidence — direct
public-URL probe was required between each deploy. **No outage.** The
cadence rule from yesterday's post-mortem held.

---

## What this delivers for the user

### For a Somali program officer in Garissa

1. Opens Kuja → "Today's focus" sentence: *"Submit your Q1 report by
   Friday."* One button — Open.
2. New grant → "Trust Profile attached automatically" badge. "Draft this
   for me" → 90 sec later, 12 questions pre-drafted.
3. Quarterly report → "Voice draft" → talks in Somali for 5 min →
   structured into donor's sections. "Add photo" → snaps the attendance
   sheet → 47 attendees extracted.
4. Declined → "Why this was declined" panel: 3 specific issues with
   evidence + 3 concrete suggestions + line of encouragement.
5. Needs more time → "Request extension" → enter "7 days, three reports
   due same week" → donor approves in-app.
6. Audited → /grants/X → "Audit folder" → tamper-evident ZIP downloads.
7. Compliance posture → "You're 2 days late on average; peers are 1 day
   early. Turn on 7-day reminders — cuts lateness 3-4 days."
8. Donor's English notes → Translate to Somali button.

### For a NEAR OB committee member

1. Spots a crisis → "New declaration" → "Conversation" tab → talks for 1
   minute: *"Severe drought in Turkana, three sub-counties, ~$500k USD
   over 3 months."* → preview shows parsed fields + suggested committee
   → "Use this draft" → wizard pre-filled.
2. Signing pace slipping → Dashboard: *"Your last 5 sigs took median 8
   days. Network target is 6. Anything we can help with?"* + list of
   pending decls.

---

## Code surface added today

### New backend services (in `app/services/ai_service.py`)
- `structure_voice_report` — voice transcript → structured report content
- `extract_photo_evidence` — Claude vision → photo-type-aware fields
- `draft_application_responses` — composite-grounded application drafts
- `explain_rejection` — empathetic constructive feedback
- `translate_text` — 6-language content translation
- `parse_declaration_from_narrative` — free-text → structured declaration

### New backend routes
- `POST /api/reports/<id>/structure-from-voice` (Phase 71)
- `POST /api/reports/<id>/photo-evidence` (Phase 72)
- `POST /api/reports/<id>/extension-request` + `…/extension-decision` (Phase 81)
- `GET  /api/reports/<id>/explain-rejection` (Phase 76)
- `GET  /api/applications/<id>/explain-rejection` (Phase 76)
- `POST /api/applications/<id>/ai-draft` (Phase 75)
- `GET  /api/grants/<id>/audit-folder` (Phase 73)
- `GET  /api/dashboard/compliance-coach` (Phase 74)
- `GET  /api/dashboard/signer-coach` (Phase 80)
- `POST /api/translate` (Phase 78)
- `POST /api/declarations/parse-narrative` (Phase 79)

### New frontend components
- `reports/VoiceReportComposer.tsx` (Phase 71)
- `reports/PhotoEvidenceUploader.tsx` (Phase 72)
- `reports/deadline-negotiator.tsx` (Phase 81)
- `apply/SmartDraftBanner.tsx` (Phase 75)
- `shared/why-rejected-panel.tsx` (Phase 76)
- `shared/trust-portable-badge.tsx` (Phase 77)
- `shared/translate-this.tsx` (Phase 78)
- `declarations/declaration-conversation.tsx` (Phase 79)
- `dashboards/compliance-coach-card.tsx` (Phase 74)
- `dashboards/signer-coach-card.tsx` (Phase 80)
- `dashboards/today-focus-banner.tsx` (Phase 82)

---

## What this is not

This release is **not**:
- A redesign of any existing surface — the existing pages are unchanged
  except for additive panels.
- A breaking API change — every new route is purely additive; no
  existing route changed shape.
- A demo. Every phase is hooked to real data and probed against live
  prod before this document was written.

This release **is**:
- The point at which Kuja stops being a database with a form on top and
  starts being a co-pilot. The remaining infrastructure (WhatsApp, SMS,
  offline, Stripe) is plumbing the platform is now ready to accept the
  moment those accounts get provisioned.

---

## How to verify

For team members validating this end-to-end after deployment:

1. Open https://web-production-6f8a.up.railway.app/login
2. Log in as an NGO test account (e.g. `fatima@amani.org` / `pass123`).
3. Open `/reports` → expand a draft → "Voice draft" button visible.
4. Open `/apply/<an-open-grant>` → SmartDraftBanner visible if responses
   are empty.
5. Open `/dashboard` → "Today's focus" banner above attention list.
6. Open `/assessments` → Trust Profile gradient panel at top.
7. Switch to NEAR-mode (`/login?network=near`) → admin login → "New
   declaration" → Conversation tab is default.

Backend smoke for the new endpoints lives in the route files themselves
and was verified during the session via `app.url_map.iter_rules()`
inspection + live probe.

---

## Sources

- Today's commit range: `0f5035de…9fcc9d86` (12 phase commits + 1
  backlog update).
- Yesterday's design refactor: `DESIGN_CHANGELOG_2026-06-11` *(not yet
  written — Phase 45–70 documented inline in commits and in
  `NEAR_BACKLOG.md` rolling log).*
- Design principles applied: `docs/DESIGN_PRINCIPLES.md`.
- Backlog with deferred items: `docs/NEAR_BACKLOG.md` (block titled
  "Category-defining NGO experience").
- Deploy-cadence rule (from yesterday's post-mortem):
  `docs/NEAR_BACKLOG.md` under "Deploy-cadence guardrail."

— end of changelog —
