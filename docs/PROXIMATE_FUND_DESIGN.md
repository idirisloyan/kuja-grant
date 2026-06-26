# Proximate Fund — Design Document v1 (draft for sign-off)

> **Status:** Draft. Author: 2026-06-21. Audience: Idiris, Adeso ops,
> Proximate secretariat.
>
> This document maps every product surface back to a specific clause in
> the Proximate SoP. Where it says "reuses NEAR component X" the
> implementation already exists in this codebase. Where it says
> "net-new", that's a build line item.
>
> Every claim about scope and effort in §5 is conditional on the team's
> reaction to §3 and §4 — if a flow looks wrong, the timeline below is
> wrong too.

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
