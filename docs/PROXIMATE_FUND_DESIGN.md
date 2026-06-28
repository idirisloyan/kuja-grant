# Proximate Fund — Design Document v2 (as-designed + as-built)

> **Status:** v1 design (§1–9) signed off 2026-06-21. v2 (§10–14)
> documents what was actually built 2026-06-21 → 2026-06-27 and the
> cross-tenant platform features that emerged. Audience: Idiris,
> Adeso ops, Proximate secretariat, prospective donors.
>
> §1–9 are the **design intent** snapshot — preserved for posterity
> as the contract we built against. §10 onwards is the **build
> reality** — Phase 627 → Phase 691 mapped back to design clauses,
> plus an honest punt list of what's still pending.
>
> v1 estimated ~13 weeks for the 6 net-new modules. Build sprint
> shipped a working tenant on prod in ~6 days, but two modules
> (Crisis Selector feed ingestor, hard capital ring-fence engine)
> are explicit deferrals — see §13.

---

## 1. North-star principle

Proximate operates in Sudan under active conflict. The system is built
around three non-negotiables:

1. **Speed is a feature, not a workaround.** SOP 14 (Emergency /
   Fast-Track) is the **primary lane**, not the exception. The
   standard 30–60-day allocation procedure (SOP 10 §3) is the slower
   alternate path. The UI should default to fast-track unless the user
   explicitly opts out.

2. **Arabic and RTL are first-class.** Every customer-facing surface
   speaks Arabic before it speaks English. The platform-wide
   Arabic/RTL parity was backfilled in Phase 624 — Proximate inherits
   it on day one.

3. **Verifiability without bureaucracy.** SoP §4.4 (Universal
   Documentation Rule) requires every decision to produce an auditable
   record. Proximate makes that record a *side effect* of the action,
   not a separate form to fill out.

---

## 2. What Proximate reuses from NEAR — zero or near-zero lift

| Proximate need | Reuses NEAR / Kuja component |
|---|---|
| Multi-tenant network with own branding | `Network` + `NetworkMembership` + host-header middleware (Phase 32) |
| Per-tenant OB role | OB role separate from platform admin (Phase 44) |
| Tiered capacity assessment for partner DD | 5-framework capacity assessment (Kuja, STEP, UN-HACT, CHS, NUPAS) → maps to Proximate Tier 1/2/3 |
| Live sanctions / PEP screening | OpenSanctions + UN XML / OFAC / EU CSV fallback |
| Live registry verification (7 African countries) | Existing live-registry path for registered NGOs |
| Multi-sig approvals | Emergency Declaration multi-sig (Phase 36) — generalised to threshold-driven |
| Fund → Window → Grant tree | Existing Funds + Windows + Evaluation Rubrics (Phase 34) |
| AI grant-criteria drafting + rubric preview | Phase 117 peer snippets + Phase 119 live rubric |
| Voice-on-fields, photo-as-evidence, offline outbox, service worker, sticky-mobile CTA | Phases 71, 72, 110, 162–164, 612 — all tenant-aware after Phase 623+624 |
| Audit chain | Existing `AuditChainEntry`, with one decision to land — see §6 |

**Implication:** the foundational infrastructure is already shipped.
Proximate is mostly a new tenant + a small set of new modules layered
on top.

---

## 3. What's net-new for Proximate — 6 modules

### 3.1 Community endorsement workflow (the bet)

**SoP clause:** SOP 6 §4 Step 1 — informal-group relational-validation
route. *"For informal groups without registration, the
relational-validation route applies: two independent community
endorsements, account verification and reputation check (adapted from
the Sudan pilot's SOP 8 logic) substitute for registration
documents."*

**Why it's the bet:** This is the part of Proximate that's genuinely
different from NEAR. NEAR assumes registered NGOs with a Trust
Profile; Proximate explicitly accepts informal grassroots groups via
community endorsement. If this works, it's the basis for an entirely
new class of grantmaking globally.

**Design:**
- **Endorser onboarding.** Anyone in the Proximate ecosystem can apply
  to be an endorser. Light KYC: government ID + selfie + locality +
  one reference. Reputation score starts at 0.
- **Partner intake.** A would-be partner self-nominates (or is
  nominated). They provide what they have: account details, photos of
  operations, references.
- **Endorsement form.** Single screen, designed for a phone in
  Arabic. Three questions: "Is this organisation real?", "Do you
  trust the leadership?", "Would you accept aid through them?". Each
  yes/no with a voice-note attachment (Phase 71 voice infrastructure
  reused).
- **COI gate.** Endorser cannot share a village, family, or current
  employer with the partner — checked at submit time against the
  endorser's profile.
- **Pass condition.** 2 independent endorsements (no shared COI signals)
  + verified bank/mobile-money account + reputation check ≥ threshold
  → Tier 1 relational validation. Below threshold, partner stays
  unverified.
- **Audit trail.** Each endorsement is hashed into the audit chain
  with location pin, voice-note hash, and timestamp.
- **Reputation feedback.** Every endorsement gets a ground-truth check
  6–12 months later: did the partner deliver? Endorser reputation
  goes up (or down) accordingly.

**Risk:** Sybil attacks. The system MUST treat 2 endorsements as
necessary-but-not-sufficient — the bank-account verification and
reputation-floor check are the real gates. Plan for a 2-month closed
pilot in one Sudan state before opening.

### 3.2 Crisis / scenario selector (SOP 5)

**SoP clause:** SOP 5 — Context Assessment and Scenario Selection.

**Today (manual):** Proximate ExecLead reads ReliefWeb / OCHA / ACLED
feeds, picks a crisis, picks a scenario (incubate / strengthen /
enable), writes a Decision Brief.

**Automation:** Daily cron ingests ReliefWeb + OCHA + ACLED + IFRC.
For each event, AI scores: (a) mandate fit, (b) compatible capital
classification available, (c) scenario suggestion, (d) projected
cost-to-impact. Output: a ranked dashboard with one-click "draft
Decision Brief". ExecLead still decides; AI removes the manual feed
review.

**Sudan-specific weight:** ACLED conflict-event signals get higher
weight than slow-onset crisis indicators because Proximate's primary
operating context is conflict-driven.

### 3.3 Capital classification + ring-fencing engine (SOP 2, SOP 3)

**SoP clause:** SOP 2 (Capital Classification, Ring-Fencing) and SOP 3
(Values-Based and Islamic Social Finance Capital — zakat, sadaqa,
waqf with deployment deadlines).

**Net-new:** Every dollar tagged at acceptance time with:
- Source (donor / DAF / Islamic Social Finance)
- Restriction type (geographic, sectoral, beneficiary)
- ISF eligibility (zakat / sadaqa / waqf / none)
- Deployment deadline (if any)

**Allocation engine gate:** at the decision step, the engine refuses
to match incompatible capital to a use. Restricted donor funds can't
flow to a non-restricted purpose; zakat can't flow to a non-
zakat-eligible recipient.

**Cron alert:** undeployed restricted capital approaching deadline
(60-day warning per SOP 3 §3) auto-escalates to ExecLead.

### 3.4 Threshold-driven multi-sig + Allocation Committee ladder
(Chapter 4 §4.3)

**SoP clause:** the decision-rights table.

**Net-new (small):** generalise the existing Emergency Declaration
multi-sig primitive. Same component, threshold-driven:
- ≤ $10,000: single-signer (still logged)
- $10,001 – $100,000: dual sign-off (SOP 10 §4 §2)
- $100,001 – $500,000: Allocation Committee
- $500,001+: Allocation Committee + Fiduciary Board

Partner-led allocations follow the parallel ladder ($250k / $1M
thresholds).

**Sudan-specific weight:** All approvals must support an
"emergency-fast-track" override (SOP 14) where the same threshold
applies but the signer can act under documented urgency, with
retroactive ratification at the next committee meeting.

### 3.5 Milestone-linked tranche scheduler (SOP 10 §4 + SOP 12 §2)

**SoP clause:** SOP 12 §2 — High-tier monitoring includes
"milestone-linked disbursements where appropriate."

**Net-new:** at agreement-creation, the partner and Proximate define
milestones (e.g., "training delivered to 47 women", "Cohort 2 baseline
survey complete"). Each tranche locks behind:
1. Milestone marked complete by partner (with photo + voice evidence)
2. Report submitted
3. Verification check (independent sample, see §3.6)

For High-tier engagements, milestone-linked is the **default**. For
Low/Medium, schedule-based is the default but can be switched.

**Sudan-specific weight:** because security-driven transfer returns
are common, every tranche has a "Plan B route" fallback — if the
primary route (e.g., bank) fails, the secondary (hawala / mobile
money) is pre-vetted and selectable from the failed-transfer screen.

### 3.6 Intervention register with hard timers (SOP 13)

**SoP clause:** SOP 13 — Hold / Suspension / Investigation /
Termination / Recovery, with hard timelines.

**Net-new:** every intervention is a row in the Intervention Register
with a stopwatch:
- Hold → triage required within 24–72 hours
- Suspension → investigation decision within 5–10 working days
- Unconfirmed transfer → escalate at 5 working days (24–48h for
  emergency)
- Fraud/safeguarding allegation → log within 24h, triage within 72h

When a timer breaches, the row auto-escalates to the next authority
level. The Fiduciary Board quarterly pack auto-assembles from the
register (SOP 13 §5).

**FSP registry sub-module:** banks / mobile-money / hawala providers
as managed entities. Each has an annual-clearance status. *No
transfer route is usable without current FSP clearance* (SOP 6 §5).
This is what makes the "Plan B route" in §3.5 viable.

---

## 4. Per-flow walkthrough

Each row: SoP step → UI surface → reused NEAR component → Proximate
addition.

### Flow A — Onboarding a community-endorsed informal group

| SoP step | UI surface | Reused | Proximate-specific |
|---|---|---|---|
| SOP 6 Step 1 — Intake (informal group) | `/proximate/partners/new` self-nomination form | NEAR membership form + voice + photo input | Endorser-eligible-COI banner; "no registration needed" copy |
| SOP 6 Step 1 — relational-validation route | `/proximate/endorse/{partnerId}` | Voice + photo input (Phase 71/72) | The endorsement screen itself (§3.1) |
| SOP 6 Step 2 — sanctions screening | (automatic, server-side) | OpenSanctions integration | Arabic-name parsing |
| SOP 6 Step 5 — Clearance | Trust Profile (existing) marked "Tier 1 — relational" | NEAR Trust Profile | Provenance: "Endorsed by X, Y" |

### Flow B — Selecting which crisis to fund

| SoP step | UI surface | Reused | Proximate-specific |
|---|---|---|---|
| SOP 5 — Context Assessment | `/proximate/crisis-selector` ranked dashboard | NEAR crisis-monitoring report renderer | Net-new feed ingestor (§3.2) |
| SOP 5 — Scenario selection | Decision Brief draft | AI drafting (Phase 75) | Scenario-specific brief templates (incubate / strengthen / enable) |
| Approval (Fiduciary Board) | Existing approval flow | NEAR OB multi-sig | — |

### Flow C — Allocating capital to a partner

| SoP step | UI surface | Reused | Proximate-specific |
|---|---|---|---|
| SOP 10 Step 1 — Origination | `/grants/new` — same as today | Kuja grant wizard | Capital-classification picker (§3.3) |
| SOP 10 Step 2 — Eligibility check | (server-side) | Sanctions + due-diligence check | ISF eligibility check |
| SOP 10 Step 3 — Risk assessment | Tier 1/2/3 badge on decision | NEAR risk tier | Auto-tier from value + context + partner type |
| SOP 10 Step 4 — Decision | Allocation Committee surface | NEAR OB multi-sig (generalised, §3.4) | Threshold ladder |
| SOP 10 Step 5 — Agreement | Standard agreement → micro-grant short-form | Kuja agreement template | Sudan-localised terms |

### Flow D — Disbursing a tranche

| SoP step | UI surface | Reused | Proximate-specific |
|---|---|---|---|
| SOP 10 §4 Step 1 — Readiness | Disbursement-ready checklist | — | Character-for-character bank verify (Sudan-pilot lesson, hard-coded) |
| SOP 10 §4 Step 2 — Authorisation | Dual-signer panel | NEAR multi-sig | $10k threshold check |
| SOP 10 §4 Step 3 — Execution | Route picker (Bank / Mobile / Hawala) | — | FSP registry lookup (§3.6) |
| SOP 10 §4 Step 4 — Confirmation | Tracker with 5-day SLA timer | NEAR SLA tiles | 24–48h emergency variant |
| SOP 10 §4 Step 5 — Failed return | Diagnose + Plan-B route fallback | — | Auto-detect security-driven returns; suggest alternate FSP |

### Flow E — Reporting + verification

| SoP step | UI surface | Reused | Proximate-specific |
|---|---|---|---|
| SOP 12 §3 — Partner reporting | `/reports/[id]` with voice + photo | Phase 623/624 photo + voice (Arabic-first) | Local-language report acceptance |
| SOP 12 §2 — Verification sample | Admin sample-selector (10–15%) | Monitoring-visit infrastructure | Tier-weighted auto-pick |
| SOP 10 §5 — Independent verification | Verifier dashboard | Reviewer queue | Third-party verifier role (new) |

### Flow F — Intervention

| SoP step | UI surface | Reused | Proximate-specific |
|---|---|---|---|
| SOP 13 — Hold | Hold dialog from any partner page | — | Intervention Register row + stopwatch (§3.6) |
| SOP 13 — Suspension | OB ratification flow | NEAR OB | Notification cascade per SoP §11.9 |
| SOP 13 — Investigation | Case dossier (existing entity drill-in) | NEAR audit-chain entity drill | Independence rule check on investigator assignment |

---

## 5. Phasing — ~12–14 weeks for v1

| Order | Module | Effort |
|---|---|---|
| 1 | Tenant setup + Tier 1/2/3 DD (reuses NEAR capacity + sanctions + registry) | ~2 weeks |
| 2 | **Community endorsement workflow (§3.1)** — *the bet* | ~4 weeks |
| 3 | Threshold-driven multi-sig + Allocation Committee ladder | ~1 week |
| 4 | Capital classification + restriction engine | ~2 weeks |
| 5 | Milestone tranche scheduler + Plan-B routes | ~2 weeks |
| 6 | Crisis selector AI | ~2 weeks |
| 7 | Intervention register + FSP registry | ~2 weeks |

Total: ~13 weeks. Community endorsement is the dominant slot because
it's the bet — give it the time to test against Sybil + collusion
attacks before opening to a second Sudan state.

---

## 6. Open design decisions (for Adeso to call)

| Question | Recommendation | Rationale |
|---|---|---|
| Audit chain per tenant or shared? | **Per tenant.** Proximate gets its own hash-chained sequence. | Each tenant verifies independently; aligns with SoP §4.4 — Proximate's own auditor walks Proximate's chain. Shared chain leaks decision counts across tenants. |
| Community-endorser KYC depth? | **Light** (ID + selfie + locality + reputation). | Heavier KYC excludes grassroots endorsers — the whole point of relational validation. Light KYC + Sybil-protection through bank-account verification + reputation. |
| ISF validation surface | **Annotation on the standard allocation step**, not a separate flow. | Per SoP §3 — *"Procedure (Allocation-Level). At allocation, the standard workflow (SOP 10) acquires one additional validation layer."* Don't fork the flow. |
| Verifier role — staff or third-party? | **Both**, with random assignment to enforce independence. | SoP §10 §5 says "third party or staff independent of the disbursing team". Random assignment removes the bias toward known-quantity verifiers. |
| Default UI language | **Arabic for all Proximate users**, with one-tap English toggle. | Sudan partners and OB members are Arabic-first; English second. Inverts the Kuja default. |

---

## 7. Sudan-specific design weights baked in

Already accounted for in §3 and §4, but called out here for clarity:

- **SOP 14 fast-track is the default lane**, not the exception. The
  standard 30–60-day allocation page is reachable but greyed-out
  unless ExecLead explicitly switches off "emergency context".
- **Hawala + mobile-money are first-class FSP types** in the registry
  (§3.6), not second-class workarounds.
- **Security-driven transfer returns** are auto-detected from FSP
  return-code patterns and trigger the Plan-B route flow without
  human intervention.
- **Arabic name parsing** for sanctions screening — many Sudan
  partners have names that don't roundtrip cleanly through Latin
  transliteration.
- **Power-cut + intermittent-connectivity resilience**: PWA service
  worker + IndexedDB outbox (Phase 162–164) already work for any
  tenant; OB members can sign decisions offline and they sync when
  reconnected.
- **Single-page "today's most urgent thing" landing** per OB member
  (modelled on Phase 82 "today's focus" banner) so an OB member with
  10 minutes between meetings can see the one disbursement that
  needs their signature.

---

## 8. What this design doc does NOT cover

To be honest about scope:

- **Post-v1 features** — Investment / repayable capital (SOP 4) is
  deferred. Network-membership-as-a-service for partner-hosted
  mechanisms (SOP 9) is deferred. Both fit cleanly into the same
  tenant model when needed.
- **Donor portal** — Proximate's donors interact through existing
  Kuja donor flows where applicable. A Proximate-specific donor
  dashboard is post-v1.
- **MEL / Learning analytics (SOP 16)** — out of scope for v1; the
  audit chain + verification sample give the foundation, but the
  rollup analytics come later.
- **Detailed wireframes** — this doc is component-level. Visual
  mockups for the community-endorsement screen specifically come
  before code lands.

---

## 9. Next step requested

Sign-off (or pushback) on:
1. The reuse table in §2 — anything I've over-claimed as already-built?
2. The 6 net-new modules in §3 — is the community-endorsement design
   roughly right, or should we reshape it?
3. The 5 open decisions in §6 — please call each one.
4. The phasing in §5 — does the 13-week shape work with your
   delivery commitments to the Proximate ops team?

Once those four answers land, I'll build wireframes for §3.1
(community endorsement) before any code, and the rest follows from
the SoP clauses directly.

---

# Part Two — As built

> Below is the build reality 2026-06-21 → 2026-06-27. Every section
> maps back to a §3 module from the v1 design above. Phase numbers
> reference commits in `kuja-grant/main`; the punt list in §13 is
> deliberately explicit.

---

## 10. Automation shipped — Phase 627 → Phase 691

The full list of phases is in `docs/PROXIMATE_BACKLOG.md` "Completed"
section. This section groups them by the design clause they satisfy.

### 10.1 §3.1 Community endorsement — shipped

| Phase | What | Closes design clause |
|---|---|---|
| 628 | `ProximatePartner` + `ProximateEndorsement` models + endpoints | Endorser onboarding, partner intake |
| 629 | Endorser inbox + 3-question wizard with voice | The form itself |
| 630 | Seed test fixtures (8 partners, 2 cleared) | — |
| 631 | Reputation algorithm + audit-chain per endorsement | Reputation feedback |
| 637 | Light-KYC review queue for new endorsers | Endorser approval |
| 640 | Voice transcription per endorsement question | Voice-note hash |
| 644 | Read transcripts on endorsement detail | OB review |
| 646 | OB endorser approval queue UI | OB decision |
| 647 | Endorser self-register form | Anyone can apply |
| 650 | Hybrid partner nomination (self-nominate path) | Net-add to design |
| 658 | Sanctions auto-screen on self-nominate | COI + Sybil-protection gate |

**Outcome:** the design's "bet" is live. Two cleared partners
(Khartoum Sisters Mutual Aid, Sennar Children Outreach) on prod.
Reputation scoring + 6-12 month ground-truth check pending real data.

### 10.2 §3.2 Crisis Selector — partial (deferred ingestor)

| Phase | What | Closes design clause |
|---|---|---|
| 663 | Crisis Selector dashboard skeleton | Ranked dashboard |
| 674 | Manual crisis signal entry (v0 deepening) | Stand-in for feed |
| 677 | Backend `feed_ingestor_status='backlogged'` flag | Honest UX signal |

**Outcome:** dashboard renders against cross-tenant Sudan fallback
rows. Feed ingestor (ReliefWeb + OCHA + ACLED + IFRC) explicitly
deferred — multi-week external-integration work that needs Adeso to
pick the feed sources first.

### 10.3 §3.3 Capital classification — partial (deferred ring-fence)

| Phase | What | Closes design clause |
|---|---|---|
| 636 | Sudan SoP-13 small/medium/large classification | Classification ladder |
| 686 | Donor co-funding shares + restriction enforcement on disbursement create | Restricted-capital enforcement |

**Outcome:** disbursements over a partner's restricted budget return
422 with a dollar-precise error (verified on prod: partner with
$1,200+ prior disbursements got "only $0 of $500 remains"). Tier-
upgrade hard-cap (small partner can't receive a $50k disbursement
today without explicit upgrade) is backlog.

### 10.4 §3.4 Multi-sig + Allocation Committee ladder — shipped

| Phase | What | Closes design clause |
|---|---|---|
| 662 | $10k threshold on disbursement multi-sig | Single-signer cutoff |
| 668 | Multi-tier cosign ladder ($60k → 2 cosigners) + Plan-B FSP fallback | Decision-rights table |

**COI guards verified on prod:**
- Sender cannot cosign their own disbursement → 403
- Cosign by ob2 (not sender) → 200 flips pending_cosign → pending_report

### 10.5 §3.5 Milestone tranche scheduler — partial

| Phase | What | Closes design clause |
|---|---|---|
| 670 | Tranche scheduler endpoint + Independence rule on investigator | Per-tranche planning |
| 651 | Per-disbursement reporting (replaces monthly calendar) | Tranche-locked reporting |
| 652 | Token-link + login report submission (dual auth) | Partner reports without login |

**Outcome:** annotation-level schedule. Auto-linking disbursement →
tranche (so "tranche 2 is 65% released" can render) is backlog.

### 10.6 §3.6 Intervention register + FSP registry — shipped

| Phase | What | Closes design clause |
|---|---|---|
| 635 | Intervention register with SoP 13 §4 response timers | Hard-timer stopwatch |
| 638 | Intervention register UI on partner detail | Surface the timers |
| 639 | FSP registry (hawala + mobile money first-class) | FSP entity model |
| 641 | Security-driven auto-intervention | Auto-flag on FSP failure |
| 645 | Disbursement method add UI on partner detail | OB-side FSP management |
| 673 | Third-party verifier role v0 | Verifier model + endpoints |
| 691 | Verifier-attest token URL `/proximate-verify?t=<token>` | Verifier doesn't need a Kuja login |

### 10.7 Net-add beyond v1 — donor portal + outcomes loop

Not in the v1 plan. Built Phases 678–688 after the partner +
disbursement loop was complete because Adeso asked "what's the
shortest path to a donor saying yes."

- **Outcome obligation** — auto-spawns 90 days after verify
- **Partner outcome form** `/proximate-outcome?t=<token>` — 3
  questions + counterfactual + voice/photo
- **OB verdict + ack loop** — partner sees ack on revisit
- **Donor model + admin-registered membership** — `donor1@proximate.org`
  seeded via SEED_PROXIMATE_ON_BOOT
- **Donor portfolio dashboard** `/proximate/donor` — portfolio +
  per-round rollup + closing PDF links
- **Donor AI Q&A** — grounded in tenant data, replay-logged with
  `call_id` (5777, 5778, 5790 confirmed on prod)
- **Outcome rollup + AI theme clustering**
- **Counterfactual quarterly cron**
- **Retrospective PDF (180-day age gate)** + monthly cron

### 10.8 Net-add — partner mini-portal (Phase 689)

`/proximate-partner?t=<token>` — long-lived per-partner URL listing
all disbursements + outcome attestations + ack messages from both
layers. Verified on prod with Khartoum Sisters Mutual Aid: 9
disbursements, mixed statuses (verified, pending_report), outcomes
joined correctly (submitted/verified/pending/no_outcome).

### 10.9 Net-add — weekly sanctions re-screen (Phase 690)

Cleared partners can drift into sanctions as the Sudan list changes.
Monday 03:00 UTC cron re-runs `ComplianceService.screen_organization`
on every `dd_clear` partner. 6-day per-partner rate limit via
`sanctions_checked_at`. Emits audit row
`proximate.partner.sanctions_rescreen_flagged` only on clean →
flagged transitions, so OB has one signal per drift event.

### 10.10 Token-credentialed URL surfaces — 5 of them

| URL | Phase | Purpose |
|---|---|---|
| `/proximate-nominate` | 650 | Self-nominate partner intake |
| `/proximate-report?t=<token>` | 652 | Partner submits 14-day disbursement report |
| `/proximate-outcome?t=<token>` | 679 | Partner attests 90-day outcome |
| `/proximate-partner?t=<token>` | 689 | Partner sees full disbursement + outcome history |
| `/proximate-verify?t=<token>` | 691 | Third-party verifier records confirmed/disputed |

All five accept a token (or login session, where applicable) — no
Kuja account required for partners or verifiers.

### 10.11 Continuous-monitoring crons — 6 scheduled

| Cron | Cadence | Phase | Bearer-auth |
|---|---|---|---|
| Crisis monitoring report | Weekly | 44B | yes |
| Disbursement report-due nudge | Daily | 651 | yes |
| Outcome attestation due nudge | Daily 04:15 UTC | 678 | yes |
| Quarterly counterfactual prompt | 1st of quarter, 05:00 UTC | 685 | yes |
| Monthly donor retrospective | 1st of month, 06:00 UTC | 687 | yes |
| Weekly sanctions re-screen | Mondays 03:00 UTC | 690 | yes |

All wired via GitHub Actions cron with `CRON_SECRET` repo secret →
`Authorization: Bearer` header → server-side gate. Step-summary
output written to GitHub workflow summary for OB review.

---

## 11. Cross-tenant platform features — what makes Kuja viable, fundable, and trusted beyond Proximate

Proximate was a forcing function. Many of the features built for it
have become generic platform primitives that any tenant inherits.
The fundability story for Adeso isn't just "we built Proximate" —
it's "we built primitives that let us build a Proximate-shaped fund
in any conflict context within ~1 sprint."

### 11.1 Verifiability without bureaucracy — the audit story

- **Hash-chained `AuditChainEntry`** — every state transition leaves
  a tamper-evident row. Verifier walks the chain independently.
- **Per-tenant audit chain scope v0** (Phase 672) — Proximate's
  auditor walks Proximate's rows, doesn't see Marketplace or NEAR.
- **Audit-chain entity drill-in** (Phase 61) — click any entity,
  see its full history across the chain.
- **Audit-chain integrity dashboard** (Phase 279) — system tile
  showing rows/day, newest-entry age, hash continuity.
- **Audit-chain rate tile** (Phase 412), **integrity check tile**
  (Phase 466), **download CTA** (Phase 131).
- **Audit anchor in JSON exports** (Phase 659) — every round report
  download includes a `payload_hash` from the audit chain so
  donors can prove the file wasn't edited post-publication.
- **AI replay logging** (Phase 115) — every AI call captures
  `input_text`, `output_text`, `duration_ms`, `user_id`, `endpoint`
  into a replay table. Donors can audit AI-assisted decisions.
- **AI call_id surfaced per surface** (Phases 200, 201) — chip on
  every AI output lets users mark accepted / edited / dismissed.
- **AI false-confidence rate dashboard** (Phase 620) — surfaces
  cases where AI said high-confidence but human disagreed.
- **Cron health monitor** (Phase 153) + **failed cron runs tile**
  (Phase 502) + **slowest-cron-in-24h tile** (Phase 406).
- **Time-to-first-app + time-to-first-report telemetry**
  (Phase 621) — the platform measures itself against onboarding.

### 11.2 Fundability — what donors need before they write checks

- **Server-side PDF generation** (Phase 671 round report, Phase 687
  donor retrospective) — donors get a hash-anchored PDF, not a
  screenshot.
- **Donor portfolio dashboard** (Phase 682) — single-fetch
  endpoint: envelope, disbursed %, partners, 90-day attestation
  rate, flagged warnings.
- **Donor AI Q&A grounded in tenant data** (Phase 683) — Sonnet
  with replay logging; donors can ask "which partners delivered
  on time last quarter" and get an answer they can audit.
- **Outcome attestation pipeline** (Phases 678–680) — closes the
  trust loop. Partner attests at 90 days; OB sets a verdict; donor
  sees the verdict in the portfolio dashboard.
- **Counterfactual question on outcome** (Phase 685) — "would this
  have happened without the funding?" The honest-answer field.
- **Donor co-funding restriction enforcement** (Phase 686) — when
  Donor A's $50k is geographically restricted to South Kordofan,
  the engine refuses any disbursement that would exceed it.
- **Token-credentialed report URLs** (Phases 652, 679, 689, 691) —
  donors, partners, verifiers don't need Kuja accounts. Lowers
  friction; raises participation rate.
- **Verifiable Credentials issuer** (Phase VC) — Ed25519-signed
  cleared-status credentials. A partner can present their clearance
  to a second funder without that funder needing access to Kuja.
- **Per-tenant AI cost ceiling + threshold notifications** (Phase
  108) — Adeso doesn't get surprise AI bills; donors fund
  predictably.
- **Synthetic production monitoring** (Phase 101) — uptime
  evidence; not just a status page, scheduled real requests.
- **Tenant health dashboard** (Phase 106) — single view per network
  of where it's working and where it's not.

### 11.3 Trust + integrity — beyond a single fund

- **5-framework capacity assessment** (Kuja, STEP, UN-HACT, CHS,
  NUPAS) — Trust Profile portable across networks (Phase 77).
- **Live sanctions screening** — OpenSanctions + UN XML + OFAC +
  EU CSV fallback. Auto-runs on self-nomination (Phase 658),
  re-runs weekly (Phase 690).
- **Live registry verification** — 7 African countries supported.
- **WebAuthn signing** (Phase 24) — hardware-key signing of OB
  decisions. Audit chain captures the WebAuthn assertion.
- **TOTP enrolment with real QR codes** (Phase 118).
- **COI auto-recuse** (Phase 289) — reviewers who disclose a
  conflict are auto-removed from the assignment.
- **Independence rule** on investigator and verifier (Phases 670,
  673) — random assignment from an eligible pool that excludes
  signers and prior endorsers.
- **Sender-cannot-cosign guard** (Phase 668) — multi-sig gate
  rejects when the signer is also the sender.
- **AI quality drift summary** (Phase 389) — surfaces if AI
  outputs are degrading over time so OB can intervene.
- **Multi-tier cosign ladder** (Phase 668) — $10k, $100k, $500k
  thresholds. Same component reused across NEAR emergency
  declarations and Proximate disbursements.

### 11.4 Resilience — operating where infrastructure doesn't

- **PWA service worker + IndexedDB outbox + offline status UX**
  (Phases 162–164) — OB members sign decisions offline; they sync
  when reconnected.
- **Default-Arabic UI + RTL** (Phases 624 + 661) — Proximate users
  default to Arabic; English is the toggle.
- **6-locale i18n parity** — en, ar, fr, sw, so, es. 2669 keys.
  Build fails if any key is missing from any locale.
- **Voice-on-fields with Whisper transcription** (Phases 71, 640,
  669) — partners speak; system transcribes.
- **Photo-as-evidence** (Phase 72) — photo upload from any field.
- **Sticky-mobile CTA primitive** (Phase 612) — mobile-first call
  to action that doesn't get lost under the keyboard.
- **Schema auto-reconciliation on boot** (Phase 610) — new model
  columns appear on Railway without manual migrations. Critical
  for ship cadence in a multi-tenant system.

### 11.5 Ecosystem extensibility — not a closed system

- **Outbound webhooks** with retry queue + signature verification
  (Phases 143–178) — any external system can subscribe to events.
- **Per-org webhook event filter** (Phase 173) — donors subscribe
  to their own grants' events; partners subscribe to theirs.
- **Webhook delivery log + per-hook history** (Phase 165).
- **Tenant switcher UI** for X-Network-Override (Phase 0) — Adeso
  staff can act in any tenant context.
- **Custom criteria template library** (Phase 189) — networks can
  publish rubric templates; other networks can apply them.
- **ICS calendar export** of deadlines (Phase 127) — donors and
  partners subscribe in Apple Calendar / Google Calendar / Outlook.
- **Per-application PDF export** (Phase 159), **org-level data
  export ZIP** (Phase 191) — partners own their data.

---

## 12. Scoreboard vs the original 13-week plan

| Module (v1 design) | Designed effort | Built |
|---|---|---|
| §3.1 Community endorsement (the bet) | 4 weeks | Shipped Phases 628–650 |
| §3.2 Crisis selector | 2 weeks | Dashboard skeleton + manual entry; feed ingestor deferred |
| §3.3 Capital classification | 2 weeks | Classification shipped; hard ring-fence engine = backlog |
| §3.4 Multi-sig ladder | 1 week | Shipped Phases 662 + 668 with Plan-B fallback |
| §3.5 Milestone tranche scheduler | 2 weeks | Annotation-level shipped (Phase 670); auto-link UI = backlog |
| §3.6 Intervention register + FSP registry | 2 weeks | Both shipped (Phases 635–639) |
| §3.6 Verifier UI surface | implicit | Shipped Phase 673 + 691 |
| Donor portal + outcomes loop | not in v1 plan | Net-add, shipped Phases 678–688 |
| Partner mini-portal | not in v1 plan | Net-add, shipped Phase 689 |
| Sanctions re-screening cron | not in v1 plan | Net-add, shipped Phase 690 |

---

## 13. Honest punt list — still pending, with reasons

These are explicit deferrals. Each has a why and a roughly-how.

| Item | Why deferred | What it unblocks |
|---|---|---|
| News-feed ingestor for Crisis Selector | Multi-week external integration; needs Adeso to pick ReliefWeb / OCHA / ACLED / IFRC | Full §3.2 — today's Crisis Selector reads cross-tenant Sudan fallback rows |
| Hard capital ring-fencing engine (tier caps) | Phase 636 classifies; enforcement at disbursement create = backlog | True §3.3 |
| Partner-tier graduation workflow | Triggers (e.g., 3 verified + 0 flags → Tier 2 eligible) need explicit Adeso policy | Tier 1 → 2 → 3 progression |
| FSP performance scoring + auto-flag | Phase 668 marks failed routes; aggregate per-FSP score = backlog | "FSP X is trending bad" signal |
| Plan-B FSP auto-suggest | Phase 668 surfaces "View alternates"; auto-rank + pick = backlog | One-click route swap |
| Tranche progress UI + auto-link | Phase 670 annotates; disbursement→tranche link + "65% released" viz = backlog | True §3.5 |
| Whisper failure surfacing | Today fails silently; need `report_voice_transcript_status` enum | OB knows if voice missing was bad audio or no API key |
| Outcome attestation backfill | Phase 678 spawns for new verifies only | Existing closed disbursements get an outcome ask too |
| Quarterly Fiduciary Board pack auto-assembly | Reuses Phase 671 reportlab path; needs Board template | True SoP 13 §5 obligation |
| SMS fallback for partners without WhatsApp | Twilio integration; per-message cost decision pending | Reach the ~30% of Sudan rural users without WhatsApp |
| Voice-only flow for low-literacy partners | TTS the questions in Sudanese Arabic; needs voice-model choice | Zero-text partner participation |
| Full per-tenant audit chain refactor | ~100 emitter call sites; Phase 672 v0 only | Auditor independence across tenants |
| Real fr/sw/so/es translations | Translator work, not engineering; parity ships EN placeholders | Sub-Saharan + Latin America deployment |
| SMTP delivery on Railway | Operational env var; Phase 687 cron emits "ready" signal, OB sends manually | Auto-send retrospective PDFs |
| DNS for proximate.kuja.org | Operational; today uses X-Network-Override header | Direct partner / donor URL bookmarking |

---

## 14. Status snapshot — 2026-06-27

- **Live URL:** https://web-production-6f8a.up.railway.app (multi-tenant)
- **Proximate access:** `X-Network-Override: proximate` header (DNS pending)
- **Test accounts seeded via `SEED_PROXIMATE_ON_BOOT=true`:**
  - `ob@proximate.org / pass123` — primary OB
  - `ob2@proximate.org / pass123` — second OB seat (cosign happy path)
  - `donor1@proximate.org / pass123` — Demo Donor Foundation
- **Seeded fixtures:** 8 partners across 4 status states, 9
  disbursements through the full pipeline, 4 outcome attestations
  with mixed verdicts, 1 verifier attestation recorded via
  token URL.
- **i18n:** 2669 keys × 6 locales, parity-gated in CI.
- **Audit chain:** hash-chained, per-tenant scope v0 (Phase 672).
- **AI replay:** every Claude / Whisper call logged with `call_id`,
  surfaced on each surface for accept/edit/dismiss telemetry.
- **6 monitoring crons** scheduled in GitHub Actions, all bearer-
  auth via `CRON_SECRET`.
- **5 token-credentialed URL surfaces** for partners, donors,
  verifiers — no Kuja login required.

The Proximate Fund tenant is operational end-to-end on prod. The
v1 design's "bet" — community-endorsed informal groups receiving
hash-anchored funding with token-credentialed reporting and
independent third-party verification — is demonstrable today
against the seeded fixtures.

Next gating questions for Adeso:
1. Open the v1 deferred items (§13)? Each unlocks specific scope.
2. Open a second Sudan state for the closed pilot, or stay in one?
3. Provision SMTP on Railway to unblock auto-send for retrospective
   PDFs.
4. Provision DNS for `proximate.kuja.org`.

Build cadence to date: ~6 days, ~64 phases. Reproducible for the
next tenant.
