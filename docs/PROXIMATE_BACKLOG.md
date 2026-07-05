# Proximate Fund — Living Backlog

> Single source of truth for what's outstanding on the **Proximate Fund**
> tenant of the Kuja Grant Management platform. Maintained alongside the
> code: every commit that *defers*, *picks up*, or *completes* an item
> here must update this file in the same commit.
>
> Why a separate file from `NEAR_BACKLOG.md`: Proximate is a distinct
> tenant with its own SoP (Sudan-conflict-aware, Arabic-first, relational-
> validation) and the team needs to scan its backlog without wading
> through NEAR items.
>
> See also: [docs/PROXIMATE_FUND_DESIGN.md](PROXIMATE_FUND_DESIGN.md),
> `seed_proximate.py`, `memory/proximate_prod_state_2026-06-27.md`.

Updated 2026-06-27.

---

## In flight — current session
Phase 678–688 — donor portal + outcomes loop. Driven autonomously this
session; entries move to "Completed" below as each ships.

- [x] **Phase 678** — Outcome obligation model + 90-day cron (commit 3c6bb54e + 98563e5c timedelta hotfix; verify auto-spawns the 90-day attestation row)
- [x] **Phase 679** — Partner outcome attestation form (`/proximate-outcome?t=<token>`); commit 98563e5c; live token URL verified on prod with Arabic round-trip
- [x] **Phase 680** — OB outcome verdict + ack surface (commit de960b40); donor sees ack on revisit
- [x] **Phase 681** — `ProximateDonor` model + admin-registered membership (commits dad9121f + 4dfeca2e + be5eba38; donor1@proximate.org seeded)
- [x] **Phase 682** — Donor portal dashboard `/proximate/donor` (commit 600dc842); portfolio + per-round rollup
- [x] **Phase 683** — Donor AI Q&A (commit b4af4fe8 + 12a72c50 hotfix); replay-logged, fallback-aware
- [x] **Phase 684** — Outcome rollup + AI theme clustering (commit 413f2572); structured stats + optional Claude cluster
- [x] **Phase 685** — Counterfactual question + quarterly nudge cron (commit 0730037d); partner can attest counterfactual via token URL
- [x] **Phase 686** — Donor co-funding shares + restriction enforcement (commit 5b36182b); 422 on disbursements over restricted budget
- [x] **Phase 687** — Retrospective PDF endpoint + monthly cron (this commit); audit row emitted per donor/round, manual send pending SMTP
- [x] **Phase 688** — Final ship cycle for the 678-687 block (this commit); 6 honest punt-list deferrals tracked below

---

## High priority (next sprint candidates)

### ~~Partner mini-portal (long-lived token)~~ — shipped Phase 689 (2026-06-27)
- Done in commit 8ed8b463. Verified on prod against partner #8
  (Khartoum Sisters Mutual Aid) returning 9 disbursements with the
  full outcome join. Idempotent OB-issued token. Static page renders.
- Punt list:
  - No SMS/email of the URL (OB shares it manually for v0)
  - No auto-issue at clearance — OB requests when they need it
  - Partner can't update profile from the portal (read-only v0)

### SMS fallback for partners without WhatsApp
- **Why:** ~30% of Sudan rural users don't have WhatsApp. Today the only
  share path is the WhatsApp deep-link from Phase 669. Those partners
  can't receive the token URL.
- **Action:** add Twilio (or Africa's Talking) integration scoped to the
  Proximate network. Same token URL via SMS body. Cost is per-message
  so admin-only trigger, not auto-fire.

### Voice-only end-to-end flow for low-literacy partners
- **Why:** Phase 669 wires Whisper for inbound voice notes, but the form
  still requires literacy to read the 5 questions.
- **Action:** TTS the questions in Arabic (Sudanese dialect prioritised),
  serve as `<audio>` elements, capture answer-by-answer voice, transcribe
  each. Zero text required for partners.

### WhatsApp Business API (programmatic outbound)
- **Why:** today's WhatsApp is manual deep-link shares only — Phase
  669 added the button on disbursement detail (Phase 698 added it to
  the outcome attestation row). The OB still picks the contact and
  hits send for each one. Reach the ~30% of Sudan rural users without
  WhatsApp is a separate gap (SMS fallback above).
- **Owner:** Adeso ops + Meta Cloud API account (or Twilio WhatsApp).
  Pick the provider — cost per template message + template approval
  cadence (24h–7d per template via Meta).
- **Action:** Adeso opens a WhatsApp Business sender, gets templates
  pre-approved for: token-URL share, report-due nudge, outcome-due
  nudge, retrospective-ready notification. Provides credentials as
  Railway env vars.
- **Engineering effort once unblocked:** ~2 days. Wire the existing
  cron emit-points (Phase 651, 678, 685, 687, 690) to dispatch a
  template message instead of just an audit row. Same approach as
  the SMTP punt below.

### Sudanese-Arabic native-speaker translation review
- **Why:** all 490 Proximate i18n keys have real Arabic — but the
  copy is MSA (fusha). Sudanese rural partners *understand* MSA but
  it doesn't feel native. The voice-only Arabic flow item below is
  the dialect-blocked one; this is the *static-string* dialect gap.
  The Phase 698 donor-AI dialect instruction handles the
  conversational surface; this item handles the static UI.
- **Owner:** Adeso engages a Sudanese-Arabic translator or community
  reviewer. Same operational shape as the "real fr/sw/so/es
  translations" item — translator work, not engineering.
- **Action:** Translator walks the `proximate.*` keys in `ar.json`,
  flags where Sudanese-dialect substitutions would land more
  naturally for partner-facing surfaces (`proximate.nominate.*`,
  `proximate.outcome.*`, `proximate.partner.*`, `proximate.report.*`).
  Adeso-OB-facing strings (`proximate.admin.*`, sidebar nav) can
  stay MSA — register is correct for that audience.
- **Engineering effort once unblocked:** ~30 minutes per key x 100
  partner-facing keys = ~2 days. Pure replace-strings, no schema
  change.

### Quarterly Fiduciary Board pack
- **Why:** design doc §3.6 explicitly mentions this. Board reviews the
  fund's posture quarterly; today they get nothing structured.
- **Action:** auto-assemble a quarterly PDF: FSP performance + endorser
  concentration risk + sanctions drift + tranche-vs-actual variance +
  independence-rule violations. Reuses Phase 671 reportlab path.

### ~~Sanctions re-screening cron~~ — shipped Phase 690 (2026-06-27)
- Done. Weekly GHA cron POSTs `/monitoring/sanctions-rescreen`
  (bearer-auth). 6-day per-partner rate limit via `sanctions_checked_at`.
  Emits `proximate.partner.sanctions_rescreen_flagged` on clean→flagged
  transitions so the OB has one signal to act on.

### ~~Verifier-attest UI surface~~ — shipped Phase 691 (2026-06-27)
- Done. Token issued at assign time on Phase 673 endpoint; idempotent.
  `/proximate-verify?t=<token>` shows the disbursement context + a
  two-button confirmed/disputed + notes form. Token rejects POST
  once a verdict is recorded (one-shot). Audit row
  `proximate.disbursement.verifier_attested` with submitted_via=
  token_url.

---

## Medium priority

### Capital ring-fencing engine (enforce, not just classify)
- **Why:** Phase 636 added the small/medium/large classification, but
  the engine doesn't *enforce* tier limits. A small-tier partner can
  receive a $50k disbursement today without explicit tier upgrade.
- **Action:** hard-cap by capital_class at the disbursement create
  endpoint; require explicit tier-upgrade workflow with OB sign-off
  before raising the cap.

### Partner-tier graduation workflow
- **Why:** Tier 1 (relational) → Tier 2 (lite DD) → Tier 3 (full DD)
  is in the design doc but not codified. Partners stay at their initial
  tier indefinitely.
- **Action:** explicit triggers (e.g. 3+ verified disbursements + 0
  flags → eligible for Tier 2 upgrade). OB action with Board sign-off.

### FSP performance scoring + auto-flag
- **Why:** Phase 668 marks failed routes but there's no aggregate FSP
  scoring. The OB has no signal "FSP X is trending bad."
- **Action:** per-FSP rolling success rate + median latency + recent
  failure modes. Auto-flag FSPs that drop below threshold.

### Plan-B FSP auto-suggest (not just CTA)
- **Why:** Phase 668 surfaces a "View alternate routes" link but
  doesn't pick. The OB has to evaluate manually.
- **Action:** rank alternates by FSP score (above) excluding the failed
  route. Suggest the top one inline with one-click "use this route."

### Tranche scheduler progress UI + auto-linking
- **Why:** Phase 670 is annotation only. Disbursements aren't linked to
  tranches; no "tranche 2 is 65% released" visualisation.
- **Action:** disbursement create UI lets the OB pick which tranche it
  pays into. Round detail surfaces planned vs released per tranche.

### Whisper failure surfacing
- **Why:** Phase 669 fails silently. OB has no signal whether a missing
  transcript means "audio was bad" or "service was down."
- **Action:** track `report_voice_transcript_status` ∈ {pending, ok,
  failed_too_short, failed_api, failed_no_key}. Surface on OB UI.

### Outcome attestation backfill from existing disbursements
- **Why:** Phase 678 only creates obligations for *new* disbursements.
  Existing verified/flagged ones never get an outcome ask.
- **Action:** one-off migration to create outcome obligation rows for
  every closed disbursement older than 90 days, due_at=now+7d.

---

## Low priority / nice-to-have

### AI compliance coach for partners
- AI gently asks SoP-required follow-ups before partner submits their 5Q.
  E.g. "you said no issues — did the funds reach the planned
  beneficiaries within 7 days?"

### Anonymous peer review
- Every partner sees 3 anonymised peer reports per quarter; rates "would
  I recommend a similar disbursement?" Builds peer signal for the
  Allocation Committee.

### Real-time risk scoring per disbursement
- Score updates as audit chain grows. OB sees "high risk" disbursements
  flagged before opening them.

### Donor matchmaker AI
- AI matches logged crisis signals to donor patterns. "Donor X funded 3
  similar situations in 2025; suggest pitching this round."

### Endorser concentration risk dashboard
- Surface endorsers who vouched for >N% of partners in a single district.
  Possible collusion signal.

### Multi-tenant audit-chain visualiser (`/proximate/audit-chain`)
- Walk the chain, show hash links, let auditor verify integrity in-browser
  without downloading the JSON dump.

---

## Cross-tenant lifts (Proximate primitives → Kuja platform)

These items would benefit Kuja Marketplace + NEAR, not just Proximate.
Treat as future Kuja-level work, not Proximate work.

### Auto sanctions screening as a Network primitive
- Phase 658 wires it only to `/proximate/partners/self-nominate`. Every
  tenant's intake should get it.

### WhatsApp share for any token URL
- Phase 669 button is Proximate-only. Generalise to any token-credentialed
  URL (Kuja decision emails, NEAR membership invites, etc.).

### Server-side voice transcription for any application/report
- Phase 669 wires Whisper to Proximate voice attachments. Generalise
  to Kuja application voice + report voice paths.

### Audit-chain hash anchors in JSON downloads
- Phase 659 includes the audit anchor in the round report. Extend to
  every Kuja JSON export so "this report wasn't tampered with after
  Adeso published it" becomes a generic guarantee.

### Multi-tier cosign ladder as Network setting
- Phase 668 ladder is hard-coded for Proximate. Generalise to a
  per-Network `cosign_ladder_json` so NEAR can use it for emergency
  declaration ladder, etc.

---

## Explicitly deferred (with reason + date)

### Self-service donor signup → admin-registered only (deferred 2026-06-27)
- **Why:** needs a vetting/KYC story Adeso should design before code
  lands. v0 ships with admin-only `POST /api/proximate/donors`.

### Donor-direct partner messaging → kept through OB (deferred 2026-06-27)
- **Why:** invites scope creep into governance; OB should remain the
  intermediary. Donors get ack visibility via the portal, but message
  composition stays OB's.

### Real-time WebSocket dashboards → polling at 30s (deferred 2026-06-27)
- **Why:** polling is fine for v0. WebSocket adds infra cost +
  complexity for marginal UX win at current scale (<50 partners).

### Mobile-native donor app → web only (deferred 2026-06-27)
- **Why:** web works on phones. Native app is premature optimisation
  at v0 donor scale.

### News/signal feed ingestor for Crisis Selector (deferred 2026-06-27)
- **Why:** genuinely multi-week external integration work; needs the
  team's input on which feeds (OCHA, ReliefWeb, ACLED, etc.). Phase
  674 ships manual signal entry as the v0 stand-in.

### Full per-tenant audit chain refactor (deferred 2026-06-27)
- **Why:** touches ~100 emitter call sites. Phase 672 ships v0 column
  + opt-in `network_id`. Full migration warrants a dedicated session
  with explicit chain re-verification.

### fr/sw/so/es real translations (deferred 2026-06-27)
- **Why:** translator work, not engineering. Phase 675 ships English
  placeholders for parity gate. Team prioritised EN+AR for first cut.

### Third-party verifier — separate model (deferred 2026-06-27)
- **Why:** Phase 673 v0 reuses the Endorser pool for the verifier pool.
  Real verifiers are conceptually different (third party, may not be
  community insiders). Promotion to a separate `ProximateVerifier`
  model can wait until v0 surfaces real friction.

---

## Operational TODOs (team owes the system)

These five are not engineering work — they're configuration/account
setup that needs Adeso ops to action. Cited in the v2 design doc §13.

### DNS for `proximate.kuja.org`
- **Why:** team currently must send `X-Network-Override: proximate`
  header to access the tenant. DNS is the single bookmarkable URL.
- **Owner:** Adeso domain admin (Cloudflare or similar).
- **Action:** CNAME `proximate.kuja.org` →
  `web-production-6f8a.up.railway.app`. Once set, the host-header
  middleware (Phase 32) routes automatically.
- **Blocks:** clean partner/donor URL sharing; the test plan still
  works without it.

### SMTP env var on Railway
- **Why:** Phase 687 cron emits a "ready" audit row, but the OB
  still sends retrospective PDFs manually. SMS / WhatsApp likewise
  require operational backbone. No transactional emails fire today.
- **Owner:** Adeso ops + Railway env var dashboard.
- **Action:** set one of `SENDGRID_API_KEY`, `RESEND_API_KEY`, or
  `SMTP_HOST` + `SMTP_PORT` + `SMTP_USER` + `SMTP_PASS` on the
  Railway service env. App-side wiring is already in place via the
  existing notification service.
- **Blocks:** auto-send for Phase 687 retrospectives, decision
  emails for Phase 308 appeal-respond, partner-flagged-via-rescreen
  notification (Phase 690).

### `CRON_SECRET` GitHub repo secret
- **Why:** every bearer-auth cron (Phase 651, 678, 685, 687, 690 +
  Phase 44B) checks `Authorization: Bearer <CRON_SECRET>` and the
  Railway env var must match what GitHub Actions sends.
- **Owner:** GitHub Settings → Secrets and variables → Actions →
  New repository secret named `CRON_SECRET`. Use the same value
  set on Railway under the service env vars (or generate a fresh
  `python -c "import secrets; print(secrets.token_urlsafe(32))"`
  and set both sides).
- **Action:** add the GitHub repo secret; verify the next scheduled
  run returns 200 in the workflow logs.
- **Blocks:** all 6 monitoring crons currently 403 in GitHub
  Actions until set.

### SMS fallback for partners without WhatsApp
- **Why:** ~30% of Sudan rural users don't have WhatsApp. Today
  the only share path is the WhatsApp deep-link (Phase 669). Those
  partners can't receive token URLs (report, outcome, mini-portal).
- **Owner:** Adeso ops + Twilio (or Africa's Talking) account setup.
- **Action:** Adeso opens an SMS-provider account; provides
  `TWILIO_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` (or the
  Africa's Talking equivalents) as Railway env vars. Per-message
  cost decision pending: who pays per outbound SMS — fund overhead
  or per-disbursement budget line?
- **Blocks:** reach for the ~30% of Sudan rural partners without
  WhatsApp; admin-only trigger, not auto-fire.
- **Engineering effort once unblocked:** ~1 day. Wire the SMS body
  to the same token URLs; admin-trigger button on partner detail.

### Voice-only end-to-end flow for low-literacy partners
- **Why:** Phase 669 wires inbound voice via Whisper, but the form
  still requires reading the 5 questions. Zero-text participation
  requires TTS the questions in Sudanese-dialect Arabic.
- **Owner:** Adeso product + a voice-model choice (ElevenLabs?
  Azure Speech? Open-source Coqui?).
- **Action:** Adeso picks the voice model (cost + quality + dialect
  trade-off). Provides API key as Railway env var. The questions
  + status copy already exist in Arabic (Phase 661).
- **Blocks:** zero-text partner participation for the lowest-
  literacy end of the cohort.
- **Engineering effort once unblocked:** ~3 days. Synthesise once,
  cache the audio, serve as `<audio>` elements; capture answer-by-
  answer voice via existing Phase 71 voice recorder; transcribe
  via Phase 669 Whisper. Pure assembly; no new primitive.

---

## Completed (rolling log, newest first)

- **Phase 698 — WhatsApp share on outcome attestation + Sudanese
  AI dialect** (2026-06-28). Two cheap wins, plus honest scope of
  what's still pending:
  - **WhatsApp share on outcome row** — propagated the same wa.me
    deep-link button that was on the report-token row (Phase 669)
    to the outcome-attestation row on disbursement detail. The
    other two intended targets (verifier-assign UI,
    mini-portal-issue UI) need new OB UI surfaces first — not a
    cheap propagation, backlogged.
  - **Sudanese-Arabic dialect on donor AI Q&A** — added rule #6
    to the donor Q&A system prompt: if the donor writes in Arabic,
    reply in conversational Sudanese, not MSA. No-op for
    English/MSA queries. Outcome-cluster and Crisis-brief AI
    surfaces kept in MSA/English (output is for OB/Allocation
    Committee — MSA is the right register there).
  - **Honest disclosure added to backlog:** the existing 490
    Proximate Arabic strings are MSA — not yet native-speaker
    vetted, no Sudanese-dialect pass. New backlog item:
    "Sudanese-Arabic native-speaker translation review".
  - **New backlog item:** "WhatsApp Business API (programmatic
    outbound)" — paired with the SMS-fallback gap, same shape:
    Adeso ops + account decision blocks it, not engineering.


- **Phase 696 — Proximate persona refactor** (2026-06-27). Donor + OB
  + Adeso operator users on Proximate are seeded with
  `User.role='ngo'` for platform compatibility; the shell rendered
  NGO-flavored nav and labels for them. Added
  `GET /api/proximate/persona/me` returning
  `{persona: 'donor'|'ob'|'admin'|'none', display_name}`. New
  `useProximatePersona()` SWR hook reads it. Sidebar branches to
  a Proximate-specific `proximateProfile()` (donor → portal +
  rounds + Ask AI; OB/admin → operator dashboard + partners +
  disbursements + rounds + endorser queue + crisis selector + audit
  chain). Header avatar label shows "Proximate donor", "Oversight
  body", or "Proximate operator" instead of "Ngo".

- **Phases 692-695 — punch list from independent prod review** (2026-06-27).
  - 692: honeypot on `/proximate-nominate` switched to bulletproof
    clip technique (was visible as "Website (leave blank)" in
    Arabic/RTL mobile widths).
  - 693: `/api/proximate/partners` PII surface gated to OB only
    (was readable by any logged-in tenant user including donors).
  - 694: donor AI Q&A now includes computed dashboard metrics
    (`attestation_rate_pct`, `verification_rate_pct`,
    `sustained_impact_avg_pct`) via `_outcome_rollup_stats()` —
    same helper the dashboard tile uses. Verified on prod: AI
    answered "75.0%" matching the tile (was "unavailable").
  - 695: NGO `JourneyRail` hidden on `/proximate/*` paths so the
    "funding journey" rail stops leaking onto donor + OB pages.

- **Phase 691 — Verifier-attest token URL** (2026-06-27). Phase 673
  shipped the assign-verifier + verifier-attest endpoints but no UI.
  Now: assign-verifier issues a long-lived per-disbursement
  `verifier_token` and returns the share URL. New public
  `/proximate-verify?t=<token>` page shows disbursement context +
  confirmed/disputed two-button form + notes. Token rejects POST
  once a verdict is set (one-shot semantics). Audit row
  `proximate.disbursement.verifier_attested`.

- **Phase 690 — Sanctions re-screening cron** (2026-06-27). Weekly
  GHA cron `cron-proximate-sanctions-rescreen.yml` POSTs `/api/
  proximate/monitoring/sanctions-rescreen` (bearer-auth). Iterates
  every dd_clear partner, skips any rescreened in last 6 days,
  emits a flag-flip audit row whenever a clean partner becomes
  flagged. No-op for now (no actual list drift since Phase 658).

- **Phase 689 — Partner mini-portal** (2026-06-27, commit 8ed8b463).
  Long-lived per-partner token URL `/proximate-partner?t=<token>` shows
  all disbursements + linked outcome attestations + ack messages from
  both layers. OB issues the token via `POST /api/proximate/partners/
  <id>/mini-portal-link` (idempotent). Verified end-to-end on prod
  with Khartoum Sisters Mutual Aid (9 disbursements, mixed outcomes).

See `docs/NEAR_BACKLOG.md` "Completed" section for Phase 627–677
completions — those were logged there during the Proximate work in
2026-06-26 and 2026-06-27 before this dedicated backlog file existed.

Going forward, Proximate-only completions land here.

---

## Operational setup + open phases (consolidated from NEAR_BACKLOG.md, 2026-06-30 reorg)

### Proximate operational setup (added 2026-06-30)

Same app as Kuja tenant, so ANTHROPIC/OPENAI/OPENSANCTIONS/SMTP keys
are inherited — no re-configuration needed. Only genuinely new work:

**Must-have before pilot users**
- [ ] Verify `SENTRY_DSN` is set on Railway (both tenants currently
      running blind if not). Free tier is fine for pilot volume.
- [ ] Set Proximate tenant's AI cost ceiling on `/admin/cost-ceiling`
      (recommend $50/mo through pilot; Phase 108 machinery already there).
- [ ] Verify `SEED_PROXIMATE_ON_BOOT=true` is set so the seeded OB /
      donor / partners / rounds land on the first prod boot after each
      DB reset.
- [ ] Uptime monitor — add BetterStack (free tier) checks on
      `/health` (60s) and `/api/proximate/overview` (5min). Alert the
      team's Slack channel.

**Phase 716b `/proximate-nominate` content redesign — SHIPPED
2026-07-05** (spec added 2026-06-30 after intake-flow review)

- [x] Hero — Arabic primary + English secondary, community-endorsement
      framing ("no formal registration, no account, no heavy paperwork")
- [x] Three-step visual "how it works": Nominate → Community vouches →
      Adeso reviews & calls you (bilingual chips)
- [x] "Recently funded partners" strip — new public endpoint
      `GET /api/proximate/public/funded-partners`, protection-postured:
      names + locality + disbursement count ONLY (no amounts, no free
      text, dd_clear partners only)
- [x] FAQ collapsibles ×4 (timeline, registered-NGO?, declined?, data
      safety) — bilingual `<details>` elements, no JS
- [x] "Referred by someone?" optional field → stored in
      `intake_form_json.referred_by` for secretariat triage
- [x] Arabic-first: hero/steps/FAQ hardcoded bilingual (public page
      renders before language context exists); form labels keep i18n
- [x] Outreach kit in `docs/outreach/`: A4 one-pager PDF (AR+EN, QR,
      shaped Arabic via arabic-reshaper; `generate_onepager.py` to
      re-render when DNS lands), 60s WhatsApp voice-note script
      (Sudanese-register AR + EN), coordination-body email template

**Explicitly not doing (2026-06-30 decision)** — "endorser refers a
partner" path. SoP §3 separates nomination (partner/OB) from vouching
(endorsers) on purpose — merging them defeats the trust floor.
Revisit only if pilot elders repeatedly ask for it.

**Should-have — Phase 716a Zero-login endorser flow (redesigned
2026-06-30 after user challenged the login assumption)**

The current endorser flow requires login. Wrong for Sudan — elders
answering 3 Y/N questions on WhatsApp aren't inbox users. Should
match the partner report/attest pattern: token URL is the credential,
no login screen, no account required.

- [ ] New model `ProximateEndorserInvite`:
      `partner_id, invite_token, invitee_name, invitee_phone, note,
      created_by_user_id, created_at, used_at, endorsement_id,
      endorser_id` (last two populated on submit)
- [ ] New endpoints:
      • `POST /api/proximate/partners/<id>/endorser-invites` — OB issues
      • `GET /api/proximate/endorser-invites/<token>` — elder opens
      • `POST /api/proximate/endorser-invites/<token>` — elder submits
- [ ] New public client page `/proximate-endorse-invite/[token]` —
      no auth, mirrors the partner report page pattern
- [ ] Roster "Share endorser link" button → **"Invite endorser"** modal
      (name, phone, optional note → generate → WhatsApp share URL)
- [ ] Backend on submit: auto-create Endorser row with status
      'captured_via_invite' (bypasses OB approval — the invite IS
      approval), record Endorsement, mark invite used
- [ ] SoP compliance preserved: only OB can issue invites (audit
      trail via `created_by_user_id`); light-KYC still applies to
      endorsers who want to self-register for repeat vouching
- [ ] Existing login-based flow stays as an optional path for
      endorsers who want accounts

**Should-have — Phase 716c Whistleblower / community grievance
channel (added 2026-06-30)**

SoP §14 implies a public reporting channel; code doesn't have one
yet. A community member should be able to report concerns about a
partner without needing an account or explaining who they are.

- [ ] New model `ProximateGrievance`: partner_id (optional — can be
      about the fund as a whole), reporter_name (optional/anonymous),
      reporter_phone (optional), category (fraud/safety/other),
      description, submitted_at, triaged_at, triaged_by_user_id,
      resolution_notes.
- [ ] Public URL `/proximate-grievance` — no auth, no token, just a
      form with a "submit anonymously" option.
- [ ] OB triage queue at `/proximate/admin/grievances` with 72-hour
      SLA badge.
- [ ] Auto-open a Phase 635 intervention if severity=fraud/safety.
- [ ] Add QR code + short URL to the printable Adeso one-pager.

**Should-have — Phase 716d Partner-side audit trail (added 2026-06-30)**

Partners can currently see their disbursements via the mini-portal
but not WHY they were flagged / suspended / declined. Fairness gap.

- [ ] Extend partner mini-portal (Phase 634) with a "Decisions
      affecting me" section: sanctions checks (redacted to
      "cleared/flagged" only, no list details), status transitions
      with dates, interventions with response deadlines, and OB
      decision rationale for any flag.
- [ ] Right-to-know without right-to-appeal: partner sees what
      happened, can request review via the grievance channel.

**Should-have — Phase 716e Public transparency page (added 2026-06-30)**

Trust-building for future donors + the public.

- [ ] Public URL `/proximate` (marketing site, not the app shell) —
      no auth required.
- [ ] Shows: total envelope moved this year, partner count by
      locality, sustained-outcome rate (aggregated only, no per-
      partner detail), current active rounds (title + trigger only).
- [ ] No PII, no per-disbursement amounts, no partner identities
      beyond names of publicly-disclosed grantees.
- [ ] Refreshes daily via a cached endpoint (not real-time — avoids
      leak vectors).

**Should-have — Phase 716 DD guardrail sweep (files in the "High
priority — operational" list below)**
- [ ] Verify `api_cron_sanctions_rescreen` walks Proximate partners
      (not just Kuja orgs). Rescreen cadence 90 days.
- [ ] Run sanctions on OB-nominated partners (currently only auto-runs
      on self-nominate per Phase 658 — audit gap).
- [ ] Endorser sanctions check at approval time (light-KYC currently
      no name-list check).
- [ ] Wire Kuja's `AdverseMediaScreening` to Proximate partners
      receiving > $10k in a round (matches the tier ladder — no
      reason to hit the API for a $200 disbursement).
- [ ] Surface hits as interventions (Phase 635 register), not hard
      gates — SoP §4 keeps the door open, OB decides after seeing
      evidence.

**Should-have — Phase 717 WhatsApp Cloud API (defer until manual
share flow strains)**

Current state: OB shares links manually via their own WhatsApp
account (`wa.me/<phone>?text=...` opens draft, OB clicks Send).
That's enough for pilot scale (~20 invites/round). Everything below
is stuff the system can't do without a Business API account —
the server can't send messages on behalf of Adeso until Meta
approves the WhatsApp Business Account.

**Phase 717-a — Foundation (blocks everything else)**
- [ ] Meta Business Portfolio for Adeso → WhatsApp Business Account
      + phone number verification (24–72h Meta review).
- [ ] Register message templates in Meta (each needs 24h approval,
      English + Arabic separately): `endorsement_invite`,
      `endorsement_reminder`, `report_ack`, `report_reminder`,
      `disbursement_notify`, `outcome_reminder`, `partner_cleared`,
      `round_activated`.
- [ ] Env vars: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`,
      `WHATSAPP_BUSINESS_ACCOUNT_ID`.
- [ ] Backend `WhatsAppService` send helper + retry queue (mirror
      the pattern of Phase 147 webhook delivery retry queue).
- [ ] Delivery receipt webhook — Meta calls Adeso when a message is
      delivered/read; store status on the relevant record.
- [ ] Inbound message webhook — capture elder replies to Adeso's
      number; surface in a new "WhatsApp inbox" for OB triage.
- [ ] Fallback: keep the manual `wa.me/?text=` button working
      alongside API-driven auto-messages for OB power-users and
      for edge cases where the API errors.

**Phase 717-b — Auto-send on trigger events (each hooks a specific
existing endpoint; all cheap once 717-a lands)**
- [ ] **Endorsement invite auto-send** — when OB clicks "Generate
      invite" in the roster modal, ALSO auto-send the WhatsApp
      message using the `endorsement_invite` template. Removes the
      "open in WhatsApp then click Send" step.
- [ ] **Endorsement 48h reminder** — cron scans open invites
      (`used_at IS NULL AND created_at < now - 48h`), sends
      `endorsement_reminder`. Stops after 1 reminder.
- [ ] **Partner report acknowledgement** — hook in
      `api_submit_disbursement_report` — auto-send `report_ack` to
      partner's phone thanking them.
- [ ] **Disbursement notification to partner** — hook in
      `api_record_disbursement` — auto-send `disbursement_notify`
      with amount + purpose + report deadline + token URL.
- [ ] **Report deadline reminder** — cron scans disbursements
      approaching 14-day report deadline, sends `report_reminder`
      3 days before due date.
- [ ] **Outcome attestation nudge** — cron at day 85 post-disburse-
      ment sends `outcome_reminder` with the outcome token URL.
- [ ] **Partner-cleared broadcast** — when a partner reaches
      `dd_clear`, auto-send `partner_cleared` to all contributing
      endorsers (their vouch mattered — good reputation feedback
      loop).
- [ ] **Round-activated broadcast** — when OB signs a round into
      `active`, auto-send `round_activated` to all approved endorsers
      informing them a round is now open and inviting nominations.

**Phase 717-c — Two-way messaging surface**
- [ ] **WhatsApp inbox for OB** — inbound replies land in a triage
      queue at `/proximate/admin/whatsapp-inbox`. OB can reply from
      the console (server-side send using the same session).
- [ ] **Session window handling** — Meta enforces a 24-hour session
      window after a user messages the business; outside the window
      only template messages can be sent. Backend must track the
      per-recipient window state.
- [ ] **Language auto-detection** — parse inbound Arabic vs English
      and reply with the matching template.

**Phase 717-d — Analytics + observability**
- [ ] **Delivery/read rate dashboard tile** on `/proximate/admin` —
      per template, showing sent / delivered / read / responded.
- [ ] **Cost tracking** — Meta charges per conversation session
      (~$0.005–0.05 depending on country + template category); log
      to per-tenant AI-style cost ceiling machinery (Phase 108
      pattern).
- [ ] **Template performance A/B** — try 2 wording variants of the
      `endorsement_invite` template, measure response rate.

**Blocking dependencies before ANY of 717 can ship:**
- Adeso must own a dedicated Sudan-reachable phone number NOT used
  for personal WhatsApp (Meta rejects numbers with prior personal
  WhatsApp history).
- Adeso Business Portfolio must be verified (business licence
  documentation).
- Template copy must be drafted + translated (English + Arabic) and
  submitted before Meta's 24h approval window; each edit resets
  the clock.
- Phase 108 AI cost ceiling machinery should be extended to include
  WhatsApp conversation cost before templates go live at scale.

**Should-have — Phase 718 SMS fallback via Twilio (defer until an
endorser can't be reached over WhatsApp)**
- [ ] Twilio account + Sudan-reachable number (US long code works
      for outbound in pilot, ~$0.08/message).
- [ ] Env vars: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
      `TWILIO_FROM_NUMBER`.
- [ ] Send helper + fallback logic (try WhatsApp first, then SMS).

**Should-have — Phase 719 File storage on Cloudflare R2**
- [ ] Provision R2 bucket `proximate-evidence` + API token.
- [ ] Env vars: `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`,
      `S3_BUCKET`, `S3_REGION=auto`.
- [ ] Migrate existing evidence Documents to R2 (Kuja's Document
      model already supports S3-compatible storage).
- [ ] Budget: aim for < $5/mo through pilot.

**Should-have — Phase 720 Backup automation**
- [ ] Enable Railway daily Postgres backups, 30-day retention.
- [ ] Weekly `pg_dump` → R2 via a cron in `app/tasks/`.

**Deferred by design (not needed for pilot)**
- Meta-approved WhatsApp templates for Arabic (do after Phase 717
  English templates are approved — Meta approves per language).
- Per-tenant email `From` header ("Proximate Fund" vs. "Kuja").
- Per-tenant webhook URLs on Proximate (Phase 143 machinery exists).

---

## Grant management (inbound donor grants) — Phase 721 follow-ups (filed 2026-07-05)

Phase 721 shipped the foundation (models, endpoints, list + detail
pages, seeded grants/allocations/reports — commits 50df0d03..64cd8927).
Status notes from the 2026-07-01 UAT retest: list + donor scoping work;
detail-page ID bug and allocation seeding fixed in 64cd8927.

- [x] **Phase 721b — PDF upload → AI extraction wizard.** SHIPPED
      2026-07-05. New `proximate_grant_extract_service.py` (Proximate-
      specific schema matching the seeded `extracted_json` shape, not
      the Kuja unpack service which is coupled to Kuja's Grant model) +
      `POST /grants/extract-agreement` (OB-only, PDF ≤15MB, PyPDF2 text
      → Claude structured extraction, donor-registry auto-match, audit
      row) + wizard page `/proximate/admin/grants/new` (upload → extract
      w/ staged progress copy → review/edit/delete/add every section →
      accept creates the grant with extracted_json +
      signed_agreement_doc_id). Scanned PDFs without a text layer get a
      clear 422 telling the OB to OCR first. Punt list: re-extract on an
      existing grant (PUT accepts `extracted` but no UI); no OCR.
- [ ] **Phase 721c — AI-drafted donor reports.** Draft the quarterly/
      annual report body from real round/disbursement/outcome data,
      human-editable (same shape as Kuja report drafting).
- [ ] **Phase 721d — Compliance-per-requirement scoring.** Score each
      report section against the donor's extracted requirements
      (reuses Kuja auto-rubric machinery). Donor side sees prescreened,
      scored deliverables — the core selling point.
- [ ] **Phase 721e — Reporting cron.** Reminders 30/14/3 days before a
      report due date; auto-generate the next pending report per the
      grant's cadence; surface on the deadline calendar (.ics).
- [ ] **Phase 721f — Donor Pack PDF.** Extend the Phase 671 end-of-round
      PDF to grant-timeline scope: financial reconciliation, impact
      narrative, embedded photo/voice evidence from partner reports.
- [ ] **Phase 721g — Restriction enforcement at disbursement time.**
      A round funded by grant X must respect grant X's geo/sector
      restrictions (extends the Phase 686 restricted-share validation).

## Small state-machine gaps (from Phase 715, filed 2026-07-05)

- [x] SHIPPED 2026-07-05: `api_cosign_disbursement` now bumps the
      roster to `disbursed` when the final cosigner clears (was parked
      at `bank_verified`).
- [x] SHIPPED 2026-07-05: partner suspension auto-sets `withdrawn` on
      their roster rows across active rounds (existing rows only —
      suspension never adds a partner to a round).

## Crisis Selector clarity (UAT feedback 2026-06-30)

- [x] SHIPPED 2026-07-05: purpose explainer card ("early-warning
      signals that justify opening a funding round" + 3-step
      signal→review→round strip, EN+AR i18n keys in all 6 locales) and
      a "Start a round from this signal" action on every curated row
      and pending signal — prefills `/proximate/rounds/new` (title,
      trigger, summary, region) via query params.

## Hotfix log (2026-07-05, found by live prod verification)

- [x] **Five Proximate POST endpoints were dead on prod** with
      `NameError: get_request_json is not defined` (helper existed in
      `app/utils/helpers` but was never imported in
      `proximate_routes.py`): create grant, update grant, add grant
      allocation, add round participant (Phase 715b!), create endorser
      invite (Phase 716a!). Never caught because seeds insert rows
      directly and the smoke gate has no write-path coverage for these
      endpoints — smoke reported 167/167 PASS while they were broken.
      Fixed with a module-level import. Follow-up filed in
      BACKLOG.md → smoke-gate trustworthiness.

## Status corrections (2026-07-05)

- [x] **Phase 716a zero-login endorser flow — SHIPPED** (commit
      cb84e761): invite model + 3 public endpoints +
      `/proximate-endorse-invite` page + roster "Invite endorser" modal.
      The spec section above predates the ship.
- [x] **Phase 716 DD sweep, first item — SHIPPED** (7c0daa76): sanctions
      screen now runs on OB-nominated partners too. Remaining sweep
      items (endorser sanctions at approval, adverse media > $10k,
      rescreen-cron verification, hawala-agent screening) still open.
