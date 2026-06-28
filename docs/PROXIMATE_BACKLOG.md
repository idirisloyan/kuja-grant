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
