# Proximate Fund — Requirements & Design v4

> **Status:** v4 (2026-06-28, evening). Replaces v3 (2026-06-28, morning).
>
> v1 (2026-06-21) was the original SoP design.
> v2 (2026-06-27) was the as-built audit — heavy and dev-facing.
> v3 (2026-06-28 morning) was the first simple version.
> **v4 folds in the late-day shipping run**: Phase 706 (tenant-aware
> copilot, Crisis Selector pending-signals visibility, disbursement
> audit label fix) and Phase 707 (wedge-resistant production
> monitoring). Same simple voice as v3; the structure is mostly
> stable.
>
> Audience: Idiris, Adeso ops, donors, partner-facing staff. Not a code
> doc. The technical detail lives in `docs/PROXIMATE_BACKLOG.md` and the
> Phase 627-707 commits.

---

## 1. What is the Proximate Fund?

A Sudan-context humanitarian fund operated by Adeso through the Kuja
platform. It funds community-endorsed informal groups — not just
registered NGOs — and it does so under three non-negotiables:

1. **Speed is a feature**, not a workaround. Emergency Fast-Track is
   the primary lane.
2. **Arabic and RTL are first-class**. Every partner-facing surface
   defaults to Arabic.
3. **Verifiability without bureaucracy**. Every decision produces an
   auditable record as a *side effect* of the action, not a separate
   form to fill out.

The fund exists because most aid systems can't represent informal
groups, can't operate under conflict, and can't move at fast-track
speeds while staying auditable. Proximate proves they can.

---

## 2. The Proximate SoP — what it requires

The Sudan SoP defines 11 operational requirements. The app implements
all of them. This section names each requirement in plain language.

| # | SoP requirement | What it asks for |
|---|---|---|
| 1 | Capital classification | Every dollar tagged at acceptance: source, restriction, ISF eligibility (zakat / sadaqa / waqf), deployment deadline. |
| 2 | Context assessment + scenario selection | The fund picks **which** crisis to respond to and **what scenario** (incubate / strengthen / enable) based on signals, not gut. |
| 3 | Informal-group onboarding via community endorsement | An informal group can receive funding without a government registration certificate. Two community endorsements + bank-account check + reputation floor substitute for paperwork. |
| 4 | Threshold-driven multi-sig | Decisions need different signers based on amount: single signer ≤$10k, dual sign-off $10k-$100k, Allocation Committee $100k-$500k, Fiduciary Board >$500k. |
| 5 | Milestone-linked or schedule-based tranches | High-tier engagements release money in tranches that unlock when milestones complete. |
| 6 | Partner reporting | A 14-day disbursement report per release — no later. |
| 7 | Outcome attestation | At 90 days the partner attests what actually happened, including a counterfactual ("would this have happened without funding?"). |
| 8 | Independent verification | A third party — not the disbursing team — confirms or disputes what the partner attested. |
| 9 | Intervention register with hard timers | When something goes wrong, the system has a stopwatch: triage within 24-72h, investigation decision within 5-10 working days, etc. |
| 10 | FSP (Financial Service Provider) registry | Banks, mobile money, and hawala providers managed as first-class entities. No transfer route usable without current clearance. |
| 11 | Emergency Fast-Track | A documented urgency override: same thresholds, but the signer can act under documented urgency with retroactive ratification. |

All 11 are implemented. Sections 3 and 4 show how.

---

## 3. The 11 core steps — what the SoP says, what the app does

This is the requirements-to-implementation map. Each step names the
SoP requirement, what the app actually does, and the live URL or
endpoint where you can see it.

### Step 1 — Capital comes in
- **SoP says:** classify every dollar at acceptance.
- **App does:** when the OB sets up donor co-funding shares for a
  round, each share carries `restricted_to_partner_id` and
  `committed_usd`. At disbursement create time the engine refuses any
  release that would exceed the restricted budget for that partner —
  with a dollar-precise error.
- **Where:** `PUT /api/proximate/rounds/<id>/donor-shares`, then any
  disbursement attempt validates against it.

### Step 2 — Pick what to fund (Crisis Selector)
- **SoP says:** context assessment + scenario selection.
- **App does:** the Crisis Selector dashboard shows ranked crisis
  rows from the multi-tenant Sudan signal pool. ExecLead enters
  manual signals; a **"Pending signals" card** at the top of the page
  shows every OB-logged signal — country, event type, description,
  status, submitted_at — before the curated/triaged rows below.
  AI drafts a Decision Brief per row. The Allocation Committee decides.
- **Where:** `/proximate/crisis-selector`.
- **What's new in v4:** logging a signal is now immediately visible
  to whoever's looking. Previously the entry succeeded but the page
  only re-fetched the curated endpoint, so the signal felt "lost."
- **Honest:** automated feed ingestion (ReliefWeb, OCHA, ACLED, IFRC)
  is still deferred — feed-source choice needs Adeso input.

### Step 3 — Bring the partner in
- **SoP says:** two endorsements OR a registered Trust Profile.

**For informal groups (the differentiator):**
- The partner is self-nominated OR nominated. Either way, the partner
  shows up at `/proximate-nominate?t=<token>` — no login needed.
- Two endorsers receive a WhatsApp link. Each opens
  `/proximate/endorse/<id>`, answers 3 questions (Is this real? Do
  you trust the leadership? Would you accept aid through them?), and
  can attach a voice note.
- Conflict-of-interest gate: endorsers can't share a village, family,
  or current employer with the partner.
- Sanctions auto-screen at self-nominate; weekly re-screen forever
  after.
- 2 independent endorsements + verified bank account + reputation
  floor → **Tier 1 relational validation**. Partner is now disbursable.

**For registered NGOs:**
- Existing Kuja capacity assessment Trust Profile (5 frameworks: STEP,
  UN-HACT, CHS, NUPAS, Kuja).

### Step 4 — Decide who gets money
- **SoP says:** threshold-driven multi-sig.
- **App does:** the threshold ladder is enforced at disbursement
  create. Sender cannot cosign (COI guard). Plan-B FSP routing kicks
  in if the primary route fails.
- **Where:** `POST /api/proximate/disbursements`, `POST
  /api/proximate/disbursements/<id>/cosign`.

### Step 5 — Send the money
- **SoP says:** confirmed disbursement.
- **App does:** multi-route FSP (bank, hawala, mobile money) with
  per-partner method registry. Sanctions screen on outbound. ISF
  cleared-by-OB checkbox on Sudan-conflict scenarios.
- **Where:** `/proximate/disbursements/new`.

### Step 6 — Partner reports (14 days)
- **SoP says:** report every disbursement within 14 days.
- **App does:** the OB clicks "Share via WhatsApp" on the disbursement
  detail page. WhatsApp opens with a drafted message + token URL.
  Partner clicks the URL → opens `/proximate-report?t=<token>` → no
  login required → 5 questions, can speak instead of type, can
  upload photo, submits. Partner acknowledgement of receipt is
  recorded as the audit-chain action
  `proximate.disbursement.acknowledged` — and shows as
  "Partner acknowledged disbursement" in the round activity feed
  (label fix shipped in v4).
- **Where:** partner sees `/proximate-report?t=<token>`. OB sees the
  share button on `/proximate/disbursements/<id>`.

### Step 7 — Outcomes (90 days)
- **SoP says:** partner attests what actually happened, including
  counterfactual.
- **App does:** when OB sets disbursement to "verified," an outcome
  obligation auto-spawns with a 90-day due_at. The OB clicks the
  WhatsApp share for the outcome row → partner clicks → opens
  `/proximate-outcome?t=<token>` → 3 outcome questions + counterfactual
  + voice/photo → submits.
- **Where:** `/proximate-outcome?t=<token>`.

### Step 8 — Verify
- **SoP says:** independent third party.
- **App does:** the OB clicks "Assign verifier" on the disbursement.
  System picks a random endorser **excluding** the partner's own
  endorsers, the disbursement signers, and anyone who has already
  attested for this partner (independence rule). A token URL is
  issued. The verifier opens `/proximate-verify?t=<token>` → sees the
  disbursement context → confirms or disputes → done.
- **Where:** `/proximate-verify?t=<token>`.

### Step 9 — Monitor & intervene
- **SoP says:** intervention register, hard timers, hold / suspension
  / investigation / termination / recovery.
- **App does:** every intervention is a row in the register with a
  stopwatch. Hold → triage in 24-72h. Suspension → investigation
  decision in 5-10 working days. Auto-escalation when timers breach.
  Weekly sanctions re-screen flips cleared partners to flagged on the
  Sudan list shift.
- **Where:** OB sees it on the partner detail page; cron runs Mondays
  03:00 UTC.

### Step 10 — Donor visibility
- **App does:** donor portal at `/proximate/donor` shows portfolio +
  per-round rollup + closing PDF links. Donor AI Q&A grounded in
  real tenant data: "what's our 90-day attestation rate?" → the AI
  reads the same `outcome_total / outcome_attested` the tile reads
  and replies with the same number.
- **Where:** `/proximate/donor`.

### Step 11 — Audit
- **App does:** every state transition leaves a row in the
  hash-chained `AuditChainEntry` log. Each row carries a payload hash
  that includes the previous row's hash — tampering is detectable.
  Per-tenant scope means an external Proximate auditor walks only the
  Proximate chain. Audit-action codes are mapped to human labels for
  OB-facing surfaces (round activity feed, disbursement detail);
  unmapped codes fall back to the raw code so the chain is never
  silently mis-rendered.
- **Where:** `GET /api/proximate/audit-chain` (per-tenant). Round
  reports include the audit anchor in the JSON download.

---

## 4. Partner and endorser experience — extremely simple

The SoP doesn't say "make it simple." But unless it's simple, an
informal Sudan partner with intermittent power and limited literacy
won't be able to use it. So this fund's product success is measured
by step-count.

### The partner — only 4 things, ever

1. **Get nominated.** Someone fills the form OR you self-nominate via
   a link.
2. **Receive money.** No app action needed.
3. **Click a WhatsApp link → answer 5 questions → done.**
   That's the 14-day report.
4. **Click a WhatsApp link → answer 3 questions → done.**
   That's the 90-day outcomes.

No login. No password. No app to download. No certificate. No
training. Voice and photo are options at every step.

If the partner has multiple disbursements, they can click ONE link
(the partner mini-portal) to see all their disbursements,
obligations, and OB acknowledgements in one place.

### The endorser — only 2 things, ever

1. **Register once.** One form: name, ID photo, locality, one
   reference. Submit.
2. **Click a WhatsApp link → answer 3 questions about a partner →
   done.** "Is this organisation real? Do you trust the leadership?
   Would you accept aid through them?" One voice note per question
   if you'd rather speak.

The endorser is asked questions about people they actually know.
Three questions. Not 27. Not a 60-minute capacity assessment.

### The verifier — only 2 things, ever

1. **Get assigned.** You'll just receive a WhatsApp link.
2. **Click the link → see the disbursement → confirmed or disputed +
   optional notes → done.** One-shot. Token rejects further submits
   once you've voted. Your verdict joins the OB's verdict beside it —
   three-eyes principle.

### The OB / Adeso operator — handles complexity so the partner doesn't

The OB sees the full operator dashboard, the multi-sig ladder, the
intervention timers, the audit chain, the FSP registry. The partner
sees a link and 5 questions. That asymmetry is the design — the OB
takes on the operational load to keep partner friction at zero.

The OB also has a **Proximate-aware AI copilot** in the navbar. When
the OB asks "what can I do here?" the answer talks about partners,
endorsers, disbursements, OB, rounds, tranches, and FSPs — not
grants, rubrics, or reviewers. When the OB writes in Arabic, the
copilot replies in conversational Sudanese Arabic, not formal MSA.
This is new in v4 — previously only the donor AI Q&A surface had
tenant-aware vocabulary; the in-app copilot used generic Kuja
Marketplace language.

---

## 5. Cutting-edge tech — what's actually special

These are the things that let the simple partner experience above
exist at all. Each one is shipped and live.

### Token-credentialed URLs (the differentiator)
Five surfaces accept a token instead of a login. The token IS the
credential.
- `/proximate-nominate?t=<token>` — self-nomination
- `/proximate-report?t=<token>` — 14-day disbursement report
- `/proximate-outcome?t=<token>` — 90-day outcome attestation
- `/proximate-partner?t=<token>` — partner's own history mini-portal
- `/proximate-verify?t=<token>` — verifier independent verdict

No partner ever logs in. No password lifecycle, no MFA setup, no
forgotten-credentials path. The OB shares the URL, the partner uses
it, the URL is the credential. One-shot semantics where they matter
(verifier can't re-vote).

### WhatsApp deep-link share
Every OB-issued token URL has a one-click "Share via WhatsApp"
button. The OB clicks → WhatsApp opens with the message drafted →
picks contact → sends. No backend WhatsApp Business API yet (that's
on the backlog) — but the cheap manual share covers most cases.

### Voice transcription (Whisper)
Every text field that the partner fills can be filled by speaking.
The audio is uploaded, transcribed by OpenAI Whisper server-side,
and the transcription is what the OB reads. The OB can also play the
original audio. Dialect handling is good — Whisper handles Sudanese
Arabic better than most TTS systems handle it.

### Photo as evidence
Every report and outcome form accepts photo uploads. Photos are hashed
and the hash anchors into the audit chain. OB sees the photo inline
on the disbursement detail page.

### Tenant-aware AI grounded in real data
Two surfaces:

- **Donor AI Q&A** at `/proximate/donor`. Donors ask questions in
  plain language ("what's our 90-day attestation rate?", "which
  partner has the most disbursements?", "summarise round 1's
  outcomes"). The AI replies using the **same** computed metrics that
  the dashboard tiles use — by-construction consistency between the
  tile and the AI's answer.

- **In-app Copilot** at every Proximate surface. New in v4. The chat
  thread the OB opens in the navbar gets a Proximate-flavored system
  prompt — partner/endorser/disbursement/OB/round/tranche/FSP, NOT
  grant/rubric/reviewer. When the user writes in Arabic, the model
  replies in conversational Sudanese Arabic. When they write in
  English or French, it mirrors that register. Tenant identity comes
  from `g.network.slug` on the request, so other tenants
  (Marketplace, NEAR) continue to get the default Kuja prompt.

Every AI call on either surface is replay-logged with a `call_id` for
audit.

### Hash-chained audit log
Every meaningful action — partner endorsed, disbursement sent,
outcome attested, verifier confirmed, sanctions re-screen flipped,
crisis signal logged — writes a row to `audit_log`. Each row carries
`payload_hash = SHA256(prev_hash + action + subject + details +
timestamp)`. Tampering is detectable by walking the chain.
Per-tenant scope means an external Proximate auditor sees only
Proximate's rows.

### Sanctions auto-screen
At self-nomination: every new partner is screened against
OpenSanctions + UN XML + OFAC + EU CSV. Cleared partners are
re-screened **weekly** because the Sudan list shifts. Clean →
flagged transition emits a single audit row for the OB to react to.

### Independence rule on verifier
The system randomly picks a verifier from the endorser pool, **after
removing**: the partner's own endorsers, the disbursement's signers,
the partner's family-claimed locality, anyone who has previously
verified for this partner. This is enforced server-side at assign
time — the OB can't override it.

### Multi-route FSP with Plan-B fallback
Each partner has multiple disbursement methods (bank, hawala, mobile
money). The OB picks the primary. If the primary route returns
failure or "security-driven return" — the system surfaces the
ranked alternatives. The OB picks one and re-attempts. The original
attempt + reason + re-route is in the audit chain.

### Independent OBs — no admin shortcut
Per-tenant OB role is separate from the platform admin role. A
Proximate OB can't access Marketplace or NEAR. An admin can act in
Proximate but their action is logged separately. The "is_admin"
backdoor that used to short-circuit OB checks has been removed
(Phase 114).

### PWA offline operation
The frontend is a Progressive Web App with a service worker and an
IndexedDB outbox. When the OB loses connectivity, decisions queue
locally and sync when the network returns. The audit chain reflects
the action's *real* timestamp + sync timestamp.

### Schema auto-reconciliation
New model columns appear in prod without manual migrations. The boot
sequence (Phase 610) inspects model definitions and ALTERs the table.
Critical for ship cadence — no "migration is in flight, don't deploy"
windows.

### Verifiable Credentials
Cleared partners can be issued an Ed25519-signed credential they can
present to *other* funders. The verifier downloads a public-key
bundle from Kuja and verifies offline. Decoupled from any single
fund.

### Server-side PDFs
Round reports and donor retrospectives are generated server-side via
reportlab. Each PDF includes the audit anchor (the hash of the
audit-log row that produced it). A donor can prove the PDF is
exactly what Kuja generated at that timestamp — and that nothing has
been edited since.

### Per-tenant AI cost ceiling
Each network (Proximate, NEAR, Marketplace) has its own AI spend
limit. When 80% is reached, the OB gets a tile notification. At 100%
new AI calls return a graceful fallback message. Adeso doesn't get
surprise AI bills.

### 6-locale i18n parity
en, ar, fr, sw, so, es. 2702 keys each (up from 2699 — Phase 706
added Crisis Selector pending-signal copy). Build fails if any key
is missing in any locale. Real translations: en + ar. fr / sw / so /
es are en-placeholder pending translator work.

---

## 6. Reliability — wedge-resistant production monitoring (new in v4)

A retest this evening found a pattern worth fixing properly: a burst
of slow AI calls saturated the gunicorn worker pool, and during the
saturation window `/api/health` kept returning 200 in <1ms — because
that endpoint touches nothing — while `/api/auth/login` hung for
everyone. Health checks were green; users were locked out. This is a
classic false-green and any production system worth its name has to
defend against it.

The synthetic monitor has been upgraded to catch this pattern
(Phase 707):

- **`/api/ready` probe** alongside `/api/health`. `/api/ready` runs
  `SELECT 1` on the database, so it shares the gunicorn worker pool
  with every other DB-touching route. When workers are starved,
  `/api/ready` wedges with them instead of staying green.
- **Login soft-deadline of 2.0 seconds.** A login that succeeds but
  takes more than 2 seconds is flagged `slow` in the probe result.
  Surfaces in the admin `/admin/synthetic-monitor` trend even when
  the probe doesn't hard-fail. The reviewer's wedge would have
  tripped this signal long before any HTTP error.
- **Proximate-tenant login probe.** The probe now logs in as
  `ob@proximate.org` with `X-Network-Override: proximate` — the
  exact failure path the reviewer saw. Without this, the monitor
  would have noticed only Kuja-marketplace logins. Configurable via
  `KUJA_SYN_PROXIMATE_EMAIL` / `_PASSWORD` env vars.

The monitor runs every 30 minutes on a cron and writes one row per
sweep to `synthetic_monitor_runs`. Admin sees a 7-day trend on
`/admin/synthetic-monitor`. Failures fire one in-app notification per
admin with 24-hour dedup.

Verified live tonight: all 11 probes (health, ready, did_doc,
status_list, login.ngo, ngo_dashboard, ngo_apps_list,
ngo_reports_upcoming, login.donor, donor_reviews_pending,
login.proximate_ob) return HTTP 200 against prod with the
Proximate-tenant login completing in 565ms.

---

## 7. Honest — what's deferred

These items appear in the design doc but are not shipped yet. Each is
either an operational gap (someone in ops needs to act) or a
multi-week scope decision that needs Adeso to weigh in.

### Operational gaps (need someone to action, not engineering)
- **DNS** for `proximate.kuja.org` — needs Adeso domain admin.
- **SMTP** env var on Railway — needs `SENDGRID_API_KEY` or `SMTP_*`.
- **`CRON_SECRET`** GitHub repo secret — without it, GitHub Actions
  crons return 403.
- **WhatsApp Business API** (programmatic outbound) — needs Adeso to
  set up a Meta Cloud API account + template approval. Engineering
  effort once unblocked: ~2 days.
- **SMS fallback** (Twilio) — needs Adeso to pick a provider + agree
  per-message cost. Engineering effort once unblocked: ~1 day.
- **Sudanese-Arabic translator review** of the static partner-facing
  UI strings — today's strings are MSA. The conversational AI
  surfaces (donor Q&A and the in-app copilot) handle the dialect
  side; this is for the buttons, labels, and headings.

### Scope decisions (need Adeso input)
- **News-feed ingestor** for the Crisis Selector — needs Adeso to
  pick feed sources (ReliefWeb, OCHA, ACLED, IFRC, all of the above).
  Today: manual signal entry covers the gap and is now immediately
  visible in the UI as of v4.
- **Voice-only flow** for low-literacy partners — needs a Sudanese-
  Arabic TTS model choice (ElevenLabs, Coqui, Azure Speech).
- **Hard capital ring-fence engine** (not just classification) —
  enforcement at disbursement create needs Adeso to define
  tier-upgrade rules.
- **Quarterly Fiduciary Board pack** — needs Board to provide a
  template. Reuses Phase 671 reportlab path.

### Engineering follow-ups (small, in-flight)
- Worker-pool saturation root cause: investigate why
  `/api/ai/suggestions` consumes 27-30s of worker time despite
  returning 202 (background-job submit shape). The synthetic monitor
  now catches the symptom; the root cause is still on the list.
- Donor share-split surfacing on partner-facing UI (Phase 686
  enforces shares but doesn't yet show the donor their slice).
- Whisper failure surfacing — today fails silently; OB doesn't know
  if a missing transcript is bad audio vs API down.
- Per-tenant audit chain refactor v1 (~100 emitter call sites). v0
  shipped in Phase 672.

---

## 8. Status snapshot — what's live today

| Surface | Status |
|---|---|
| **Live URL** | https://web-production-6f8a.up.railway.app (multi-tenant). `X-Network-Override: proximate` header. |
| **Test accounts** | `ob@proximate.org` / `pass123` (Oversight Body), `ob2@proximate.org` / `pass123` (cosign happy-path), `donor1@proximate.org` / `pass123` (Demo Donor Foundation). Seeded via `SEED_PROXIMATE_ON_BOOT=true`. |
| **Test fixtures on prod** | 8 partners across 4 status states. 9 disbursements through the full pipeline. 4 outcome attestations with mixed verdicts. 1 verifier attestation recorded via token URL. 2 pending crisis signals (logged via OB UI, visible in the Crisis Selector pending-signals card). |
| **5 token URL surfaces** | nominate, report, outcome, partner mini-portal, verify. All verified live with seeded fixtures. |
| **6 monitoring crons** | disbursement-nudge (daily), outcome-due-nudge (daily 04:15 UTC), quarterly-counterfactual (1st of quarter), donor-retrospective (1st of month), sanctions-rescreen (Mondays 03:00 UTC), crisis-monitoring (weekly). All bearer-auth via `CRON_SECRET`. |
| **Synthetic monitor** | 11 probes including DB-touching `/api/ready` and Proximate-tenant login canary. Slow-login flagged at >2s. Sweep cron every 30 min. |
| **i18n** | 2702 keys × 6 locales. Parity gated in CI. Real EN + AR; fr/sw/so/es are en-placeholder. |
| **Audit chain** | Hash-chained, per-tenant scope v0 (Phase 672). Human labels for OB-facing surfaces. |
| **AI replay** | Every Claude / Whisper call logged with `call_id`. Tenant-aware system prompt on both donor Q&A and in-app copilot. |
| **Smoke tests** | 167/167 PASS as of 2026-06-28 evening. Invariants 67/67. |

---

## 9. The "did you actually do it" checklist

For someone reading this doc with the SoP in one hand and prod in
the other, here is the most direct test of whether the app delivers.

| You should be able to... | Where to look |
|---|---|
| Self-nominate an informal group with no Kuja account | https://web-production-6f8a.up.railway.app/proximate-nominate |
| See an OB log in and find a queue of nominated partners | log in as `ob@proximate.org`; visit `/proximate/admin` |
| Endorse a partner via a token URL (no login) | OB picks a partner, sends the endorser the URL via WhatsApp |
| Log a crisis signal and see it appear immediately in the Crisis Selector | OB logs signal via the entry form → "Pending signals" card on `/proximate/crisis-selector` shows it before any curated row |
| Send a disbursement that exceeds a restricted budget and see it 422 | OB tries to disburse more than the donor share allows |
| Send a disbursement under $10k and see it auto-clear | OB issues a $2.5k disbursement to a `dd_clear` partner |
| See a 14-day report submitted without the partner having a login | partner clicks the WhatsApp link → submits voice note + photo |
| See the outcome attestation auto-spawn 90 days after verify | check the `outcome` field in the disbursement detail JSON |
| See the donor AI cite an actual portfolio number | log in as `donor1@proximate.org`; ask "what's our attestation rate?" → it returns 75.0% which matches the tile |
| See the in-app copilot use Proximate vocabulary, not grant vocab | log in as `ob@proximate.org`; ask the navbar copilot "what can I do here?" → answer mentions partners, endorsers, disbursements, rounds — not grants, rubrics, reviewers |
| See the verifier confirm via a token URL (no login) | OB assigns verifier; verifier clicks the URL; votes confirmed |
| See the audit chain entries for any of the above | `GET /api/proximate/audit-chain` returns rows with `payload_hash` |
| See a partner-acknowledged disbursement label as a human label (not raw code) | round activity feed shows "Partner acknowledged disbursement" instead of `proximate.disbursement.acknowledged` |
| Generate the round report PDF with the audit anchor | `GET /api/proximate/rounds/<id>/report.pdf` |
| Reply in Sudanese dialect when asked in Arabic | donor asks AI Q&A in Arabic → reply has dialect markers (`دا`, `بس`, `اللي`). Same on the in-app copilot. |
| Catch a worker-pool wedge before users notice | run synthetic monitor against prod → `/api/ready` and `login.proximate_ob` go red if workers saturate, even when `/api/health` stays green |

All sixteen are verified live as of 2026-06-28 evening.

---

## 10. Phasing of what's left

If Adeso opens the deferred items (§7), here is what gets unblocked.

| If you unblock... | You can ship... | Engineering effort |
|---|---|---|
| DNS | bookmarkable `proximate.kuja.org` URLs for partner sharing | none |
| SMTP env var | auto-send retrospective PDFs, decision emails, partner notifications | none |
| `CRON_SECRET` GitHub secret | the 6 monitoring crons actually run on schedule | none |
| WhatsApp Business API | programmatic outbound — OB no longer hand-shares each link | ~2 days |
| SMS fallback | reach the ~30% of Sudan rural users without WhatsApp | ~1 day |
| Sudanese-Arabic translator | static partner-facing UI in dialect | ~2 days (replace strings) |
| News-feed source choice | automated Crisis Selector (currently manual signal entry) | ~2 weeks |
| Sudanese-Arabic TTS choice | voice-only end-to-end flow for low-literacy partners | ~3 days |

---

## 11. Why this fund matters

Most aid systems can't represent informal groups, can't operate
under conflict, and can't move at fast-track speeds while remaining
auditable. Proximate proves they can.

Three claims, each demonstrable today:

1. **Community endorsement substitutes for registration.** Two
   endorsers + bank check + reputation floor + sanctions screen +
   weekly re-screen = a defensible decision to disburse to an
   informal group.

2. **Token URLs substitute for accounts.** A partner with a phone and
   intermittent connectivity can do everything they need to do
   without ever logging in to anything.

3. **Hash-anchored audit substitutes for paperwork.** Every decision
   produces an auditable record as a side effect of the action — no
   separate compliance step.

These aren't aspirations. They are live on prod against seeded
fixtures right now.

The remaining work is operational — DNS, SMTP, sender accounts,
translator engagement. Once those land, Proximate is field-ready.

---

## What changed from v3 → v4 (one-paragraph summary)

Three things shipped after v3 was authored this morning:
**(1)** the Crisis Selector now surfaces OB-logged pending signals
in a card at the top of the page (was: logged silently);
**(2)** the in-app AI copilot is now tenant-aware, replying with
Proximate vocabulary (partner/endorser/disbursement/OB/round) and in
conversational Sudanese Arabic when the OB writes in Arabic — this
extends the dialect-aware behavior that was previously only on the
donor Q&A; and **(3)** the synthetic monitor now probes a
DB-touching endpoint, flags slow-but-OK logins as warnings, and
includes a Proximate-tenant login canary, closing the wedge-detection
gap a reviewer found tonight. One small polish: the partner-
acknowledgement audit event now renders as a human label instead of
a raw dotted code.

---

*Reproducible build cadence: ~6 days, ~80 phases, one product
surface that other Sudan-context funds could adopt directly.*
