# Kuja for Networks — Design Proposal

**Status:** Draft for discussion · 2026-05-19
**Owner:** unassigned · **Author:** Adeso engineering with Claude
**Scope:** Extend Kuja to serve network-based grant funders (NEAR, Resilio Fund, future similar) without forking the codebase or running multiple instances.

---

## 1. Context

Kuja was built as a marketplace where NGOs are findable and donors publish grants. The primary commercial market is big donors, foundations, INGOs. There's a real adjacent opportunity: **selling the same platform to network funders** — entities that operate their own membership network of NGOs and disburse pooled funds to those members.

Two concrete candidates:

- **NEAR Network** (currently an Adeso project; spinning off end-2026). 349 member orgs across 51 countries in 4 regions. Operates the Change Fund (flagship, since 2022), Bulsho Fund (Somali-specific), CORE Fund (Nepal), plus PULSE. Change Fund has three named windows: **Emergency Response**, **Displacement Window**, **Bridge Funding** ($25K grants, launched 2025 in response to US foreign-aid suspension). $6.7M disbursed across 65 grants in 24 countries.
- **Resilio Fund** (similar model, separate organisation).

Today their workflows are **fully manual**:
- Membership: NGO submits docs (registration cert, bylaws, board list with passports, code of conduct, audits, annual reports, 2 reference letters) → 2-month review by elected Oversight Body → approved as member.
- Emergency declaration: secretariat declares emergency → ~1 month elapsed → re-assesses NGO → disburses funds.
- Reporting: all by hand.

Kuja already has 80% of what they need (capacity assessment + sanctions + AI compliance + audit chain). The missing 20% is the **network-of-networks shape**: hierarchical tenancy, fund + window grouping, formal emergency-declaration workflow, window-scoped reporting.

---

## 2. Recommendation

**Build it as a multi-tenant extension of the existing platform, not as separate instances.**

The single biggest decision is "separate instance per network vs. multi-tenant single instance." I recommend multi-tenant single instance.

### Why multi-tenant wins

| Dimension | Multi-tenant (recommended) | Separate instances |
|---|---|---|
| Ops cost as we sell to more networks | Flat | Linear (N deploys, N DBs, N TLS certs) |
| Bug fix + security patch | Deploy once | Deploy N times; drift inevitable |
| AI cost / OpenSanctions API cost | Shared infrastructure | Duplicate spend |
| Donor that wants to fund NEAR + Kuja marketplace + Resilio | One account | Three accounts |
| NGO that's a member of multiple networks | One identity | Multiple identities, multiple capacity passports to maintain |
| Cross-network learning (anonymised analytics) | Possible | Impossible |
| Network's perception of independence | Subdomain + branded skin + isolated data scope = independent enough | Strongest |
| Backward compatibility with today's Kuja marketplace | Existing data becomes the "Kuja Marketplace" network | None |

The independence concern is the only meaningful argument for separate instances. We solve it with:
- **Subdomain routing** — `near.kuja.org` (or `app.near.ngo` via CNAME) resolves to the same app; the request determines network context from the host header.
- **Per-network branding** — logo, colour palette, name, default language stored on the Network row.
- **Strict data scoping** — every query filters by `network_id`; admins on Network A literally cannot read Network B data.
- **Per-network staff** — Network admins are scoped to their network; cross-network access is admin-of-the-platform only.

If NEAR ever wants to fully fork to their own infrastructure once they spin off, they can. The data model is portable. But they don't have to — and most importantly, they shouldn't have to before they need to.

### What stays unchanged

- 31 existing models keep their shape.
- All existing services (AI, compliance, reviewer match, trust profile, audit chain, metrics) work as-is — they just get a `network_id` filter added where they query.
- Existing API surface stays compatible; new endpoints sit alongside.
- Current `Kuja` capacity-assessment framework keeps its internal key; the *display label* becomes per-network (so NEAR users see it labeled "NEAR Capacity Assessment").

---

## 3. New entities + schema additions

Five new tables. Three existing tables get one or two new FK columns.

### `Network` — top-level tenant

```
id PK
slug UQ                     -- 'kuja', 'near', 'resilio'
name                        -- 'Kuja Marketplace' / 'NEAR Network' / 'Resilio Fund'
mission_short
brand_logo_url
brand_color_hex
default_language
home_url                    -- where 'Home' nav goes (e.g. kuja.org or near.ngo)
host_aliases JSON           -- list of subdomains / custom domains routing to this network
oversight_body_min_signers INT  -- emergency-declaration signature threshold
membership_review_days INT  -- expected review SLA (NEAR = 60)
default_assessment_framework  -- which framework is the membership gate
default_currency
created_at
```

### `NetworkMembership` — Org ↔ Network with status + tier

```
id PK
network_id FK
org_id FK
member_tier               -- 'national_partner' | 'regional_member' | 'localisation_lab' | 'sub_member'
parent_membership_id FK   -- self-ref so 'sub_member' nests under a 'national_partner'
status                    -- 'pending' | 'under_review' | 'active' | 'suspended' | 'rejected'
status_reason
region                    -- 'Africa' | 'Asia-Pacific' | 'MENA' | 'LAC' (network-defined)
country
required_documents_status JSON  -- which docs submitted vs missing
capacity_assessment_id FK -- mandatory: must be present before status flips to active
applied_at
reviewed_at
reviewed_by_user_id FK
joined_at
suspended_at
suspended_reason
UNIQUE (network_id, org_id)
```

**Three-level hierarchy supported.** NEAR has Network → National Partners → Member NGOs. The `parent_membership_id` self-reference covers this without a third table.

### `Fund` — a pooled fund operated by a network

```
id PK
network_id FK
name                       -- 'Change Fund' / 'Bulsho Fund' / 'CORE Fund'
slug
description
governance_oversight_body_users JSON  -- list of user_ids who govern this fund
status                     -- 'active' | 'closed'
currency
year_launched
total_committed NUMERIC    -- aggregate, computed nightly
total_disbursed NUMERIC    -- aggregate, computed nightly
public_summary_published   -- bool, opt-in
summary_stats_json         -- denormalised display stats
created_at
```

### `FundWindow` — a sub-pool within a fund

```
id PK
fund_id FK
name                       -- 'Emergency Response' / 'Displacement Window' / 'Bridge Funding'
slug
description
window_type                -- 'emergency' | 'displacement' | 'bridge' | 'thematic' | 'general'
status                     -- 'active' | 'closed'
max_grant_amount NUMERIC
typical_grant_amount NUMERIC
currency
year_launched
eligibility_criteria JSON  -- per-window override of network membership rules
reporting_template JSON    -- per-window report template
created_at
```

### `EmergencyDeclaration` — formal declaration triggering disbursement

```
id PK
fund_window_id FK          -- which window this declaration draws from
declared_by_user_id FK
title                      -- 'Sudan Conflict Response — Phase 2'
crisis_type                -- 'climate' | 'conflict' | 'health' | 'displacement' | 'food_security' | 'other'
region
country                    -- ISO code or 'multi'
severity INT               -- 1-5 scale
summary
needs_assessment           -- free text
proposed_total_amount NUMERIC
shortlisted_org_ids JSON   -- which member NGOs the secretariat proposes funding
declaration_date DATE
status                     -- 'draft' | 'in_review' | 'signed_active' | 'closed' | 'cancelled'
signed_at
closed_at
audit_chain_anchor         -- hash committing the declaration content
created_at
```

### `DeclarationSignature` — per-signer approval row

```
id PK
declaration_id FK
signer_user_id FK
required_role             -- 'oversight_body_chair' | 'secretariat_lead' | 'region_lead' | 'fund_chair'
status                    -- 'pending' | 'signed' | 'recused' | 'rejected'
signed_at
signature_method          -- 'totp' | 'webauthn' | 'manual_admin' (for recorded paper signature)
notes
```

### `DeclarationDocument` — supporting docs attached to a declaration

Either reuse the existing `Document` table with a polymorphic owner via a new join row, OR add a thin table:

```
id PK
declaration_id FK
document_id FK            -- FK to existing Document
kind                      -- 'situation_report' | 'needs_assessment' | 'government_declaration' | 'partner_intel' | 'other'
uploaded_by_user_id FK
uploaded_at
```

### Updates to existing tables

```
Organization.parent_org_id              FK nullable
  -- for 'org with sub-NGOs' (e.g. a national partner that has 12 NGOs underneath)

Grant.fund_window_id                    FK nullable
  -- a grant can belong to a window; null for the Kuja marketplace where grants are donor-published independently

Grant.emergency_declaration_id          FK nullable
  -- a grant can be created by a declaration; null for normal donor-published grants

User.network_role                       JSON
  -- additional role(s) scoped per network: [{'network_id': 7, 'role': 'oversight_body_member'}]
  -- existing User.role stays as the platform-level role
```

---

## 3B. NEAR Change Fund — process specifics (2026-05-26 update)

Additional context from NEAR's IKEA Foundation concept note (Change Fund) and operating-criteria summary. This sharpens Phases 34–37 considerably and introduces two new first-class concepts: the **Crisis Monitoring Report** and the **per-window Evaluation Rubric**.

### 3B.1 Sizing data points

- NEAR network: **349 CSOs + 20+ national/regional networks**, **44 countries** (Global South).
- Change Fund track record: **~$6.2M disbursed** across **63 grants** in **24 crisis-affected countries** (4 years).
- IKEA Foundation ask: **€5M** to consolidate + scale the model.
- Standard grant range: **$150,000–$250,000**, **up to 6 months**.
- Bridge Funding window: smaller grants at **$25,000** (introduced 2025 after US aid suspension).
- Network design assumption: budget for **≤2,000 member orgs per network** and **≤100 grants per fund per year**. Comfortably handled by the current Postgres schema.

### 3B.2 The Crisis Monitoring Report — new entity

The OB doesn't declare an emergency arbitrarily. They consume a **weekly Humanitarian Crisis Monitoring Report** produced by the secretariat, covering every country where the network has members. The report scores each country/event on a 4-factor formula:

1. **Country HDI ranking** (lower HDI → higher weight).
2. **Government response capacity + vulnerability** to natural disasters and conflict.
3. **Number of people directly impacted.**
4. **Media + donor community attention** ("forgotten emergencies" tend to score lower here — useful for surfacing them).

Members can submit ad-hoc **crisis alerts** any time outside the weekly cycle; these are rolled into the next report and the secretariat can promote one to the OB immediately.

**Proposed model:**

```python
class CrisisMonitoringReport:
    id; network_id (FK); period_start; period_end (week)
    summary_md (Markdown); generated_by ('cron' | 'manual')
    cron_anchor_audit_id (FK to AuditChainEntry — anchored)
    published_at

class CrisisMonitoringRow:
    id; report_id (FK); country (ISO-3); region; event_type
    hdi_band; gov_capacity_band; people_impacted_estimate
    attention_band; composite_score (0-100)
    narrative (AI-drafted); flagged_for_ob (bool)

class CrisisSignal:    # member-submitted ad-hoc alert
    id; network_id; submitted_by_org_id; country
    event_type; description; submitted_at; rolled_into_report_id
```

Generated weekly by a cron job (extends the existing `cron_routes`); AI drafts the narrative using public news feeds + member-submitted signals; secretariat reviews + approves before publishing. The report ID + the specific row become **mandatory evidence** when the OB declares a crisis.

### 3B.3 The 5-area Evaluation Rubric — new entity per window

The OB evaluates every application against **five rubric areas with specific quantitative thresholds**. These need to be first-class data so the AI can score systematically and the secretariat can produce a defensible summary.

| # | Area | Specific criteria with thresholds |
|---|---|---|
| 1 | **Project objectives + activities** | Aligned with Crisis Monitoring Report? · Activities adequately budgeted? · Sectoral response consistent with the crisis? |
| 2 | **Region + target population** | Operational presence in affected area? · Beneficiary count aligns with budget? · **Per-beneficiary cost** reasonable vs peers? |
| 3 | **Budget + financial** | Member previously managed funding at this scale (audit review)? · **≥80% direct-to-community** (or ≥70% for consortia)? · Budget matches narrative? · Unit costs allowable + reasonable? · Required template used? · All activities reflected in budget? · Beneficiaries identified in budget lines? |
| 4 | **MEL + reporting** | MEL plan sufficient for activity level? · MEL adequately budgeted? |
| 5 | **General considerations** | Relative strength + impact ranking when applications compete for limited funds. |

**Proposed model:**

```python
class WindowEvaluationRubric:
    id; window_id (FK to FundWindow)
    name; is_default (bool); created_by_user_id

class WindowEvaluationCriterion:
    id; rubric_id (FK); area (one of the 5 above); name; weight
    threshold_kind ('hard_gate' | 'soft_score'); threshold_value (e.g. '0.80')
    threshold_meaning (Markdown — explains "≥80% direct-to-community" etc)
    ai_evaluator_key (which AI scoring function applies — see §3B.5)

class ApplicationScore:
    id; application_id; criterion_id
    ai_score (0-100); ai_evidence (Markdown); ai_flags (JSON list)
    human_score (nullable); human_note; finalized_by_user_id; finalized_at
```

Seeded automatically when a NEAR Change Fund window is created (Phase 34 ships the seed). Networks can edit per-window before opening for applications.

### 3B.4 SLA contract (the 72-hour / 6-day commitment)

NEAR commits to these turnaround times publicly. Make them first-class on `EmergencyDeclaration`:

| Milestone | Target | Field |
|---|---|---|
| OB declares crisis | T0 | `declared_at` |
| Application window opens | T0 | `applications_open_at` |
| Application window closes | T0 + 72hrs | `applications_close_at` |
| OB decision | T0 + 5–6 days | `decision_at` |
| Members notified of decisions | T0 + 6 days | `applicants_notified_at` |
| Grant agreement signed | T0 + 10 days (target) | `agreement_signed_at` per grant |

Every declaration's window report (Phase 36) shows actual-vs-target per milestone. Useful for board reporting + donor accountability.

### 3B.5 Risk management — 4 pillars as scheduled processes

NEAR articulates risk management as four mutually-reinforcing pillars. Each maps to a concrete platform feature:

| Pillar | Platform mapping |
|---|---|
| **Due diligence** (initial + periodic) | Capacity assessment at membership + `NetworkMembership.assessment_next_refresh_due_at` (default = `Network.assessment_refresh_months`, e.g. 24). Grant-disbursement gate blocks when assessment is stale. |
| **Regular reporting** (mid + end, more for high-risk) | Existing report module; new `Grant.reporting_intensity = 'standard' \| 'high_risk'` toggles whether quarterly check-ins are required. |
| **Progress calls + monitoring visits** | New `MonitoringVisit` entity (in-person or virtual) — captures observations, photos, attendance, action items. Audit-chained. Lands in Phase 36 alongside reporting. |
| **Feedback mechanisms** | Existing feedback module + new "Network external evaluation" upload anchored to the network (not a single grant). |

### 3B.6 Conflict-of-interest discipline (governance)

Every OB signer affirms **no COI** with the affected country/member at signature time. Add to `DeclarationSignature`:

```python
declared_no_coi (bool, nullable) -- True when signing; False/null when recusing
recusal_reason (String, nullable)
```

If `declared_no_coi=False`, the signature does NOT count toward the threshold, and a recusal audit entry is written. The window report shows recusal counts per declaration — a transparency signal donors care about.

### 3B.7 Streamlined application template per window

NEAR explicitly says they use "streamlined application templates designed to minimize transaction costs for local responders." Each window owns a minimal template targeted at the rubric:

```python
class FundWindow:
    ...
    application_template_json (Text)  # ordered list of question blocks
    expected_completion_minutes (Integer)  # surfaced to applicants
```

Template question blocks (proposed default for Change Fund Emergency Response):
1. Crisis alignment (free text — links back to Crisis Monitoring Report)
2. Target population + community-participation narrative (free text + numeric beneficiary count)
3. Sectoral response (multi-select + free text)
4. Budget upload (file + structured line-items)
5. MEL plan (free text + key indicators)
6. Operational presence in affected area (yes/no + evidence)
7. Prior funding managed (single numeric + audit-link)

AI extracts structured signal from each block to feed the rubric scorer (§3B.3).

### 3B.8 Constituent voice — explicit narrative + monitoring fields

NEAR's rubric scores **community participation in design and delivery** explicitly. Track it both in the application and in monitoring visits:

- `Application.community_participation_narrative` (free text — required)
- `MonitoringVisit.community_feedback_summary` (free text — captured during visit)

These flow into the window report and the public anonymised summary as proof of locally-led discipline.

---

## 4. The three new workflows

### 4.1 Network membership onboarding

**Goal:** NGO joins a network, can't receive grants until capacity-assessed and approved.

**Flow:**

1. NGO clicks "Join the NEAR Network" on `near.kuja.org` (or wherever the network's portal lives).
2. NGO completes a network-specific eligibility questionnaire. NEAR's 5 questions (non-profit registered + non-OECD-DAC HQ + locally rooted + governance docs) become a configurable per-network form.
3. NGO uploads required documents. Required-document list is per-network config (NEAR requires: registration cert, bylaws, board list with passports, code of conduct, latest audit, latest annual report, 2 reference letters).
4. NGO completes the **mandatory capacity assessment** (framework determined by `Network.default_assessment_framework` — for NEAR, this is the existing "Kuja" framework relabeled "NEAR Capacity Assessment").
5. NGO submits → `NetworkMembership.status = 'pending'`. Audit chain entry written.
6. Oversight Body members see the pending membership on their dashboard. Each can request additional info via the existing donor↔NGO threaded messaging. Review takes up to `Network.membership_review_days` (NEAR = 60).
7. Approver clicks "Approve" or "Reject". If approve → `status = 'active'`, `joined_at = now`, NGO appears in the network's public directory, all of the network's published grants become visible/applicable.
8. If reject → `status = 'rejected'`, reason captured, NGO can re-apply after a configurable cooldown (default 6 months).
9. Pre-disbursement re-check: when a window's emergency declaration includes the NGO, the system auto-re-runs sanctions + adverse media (already in code; we just trigger it at this lifecycle moment).

**Status state machine:**

```
pending → under_review → active   (happy path)
                       → rejected (with reason)
                       → suspended (post-active misconduct, manual)
                       → expelled (terminal)
```

Every transition writes an `AuditChainEntry` with action `network.membership.{transition}` and the actor. Suspensions are visible to the NGO with the reason; rejection reasons go via email.

### 4.2 Emergency declaration with multi-signature workflow

**Goal:** Replace NEAR's current manual "declare emergency → email signatures → spreadsheet to track" process with an auditable digital flow.

**Flow:**

1. **Draft.** A user with `network_role` containing `secretariat_lead` (or admin) creates a draft declaration: select fund + window, fill crisis_type / region / country / severity / summary / proposed_total_amount, shortlist NGOs from the network's member directory. Save as draft (status = `draft`).

2. **Attach supporting documents.** Drag/drop: situation reports, needs assessment, government declarations, partner intel. Each becomes a `DeclarationDocument` row tied to the declaration.

3. **Define signing chain.** Network's default chain is configured on `Network.oversight_body_min_signers` (e.g. NEAR might require 3 signatures from named Oversight Body members + 1 from the fund chair). Drafter selects the specific people from a role-filtered dropdown.

4. **Submit for signature.** Status flips to `in_review`. `DeclarationSignature` rows created with `status = pending` for each required signer. Each signer gets:
   - In-app notification
   - Email with deep link
   - Optional SMS / WhatsApp if their notification preferences include those channels

5. **Each signer reviews + signs.** The signer's page shows: declaration content, attached documents (with inline preview), proposed grants + amounts, full discussion thread. Three actions per signer:
   - **Sign** — requires TOTP code OR WebAuthn biometric assertion (depending on signer's enrolment state). Captures `signature_method = 'totp'` or `'webauthn'` plus the recorded re-auth token. For the rare paper-signature case (older Oversight Body members), an admin can record a `manual_admin` signature with attached scanned signature page.
   - **Recuse** — captures reason; doesn't count toward the threshold; doesn't block.
   - **Reject** — captures reason; declaration → `cancelled` immediately, all pending signatures invalidated, drafter notified.

6. **Threshold reached.** When `signed` count ≥ `oversight_body_min_signers`, declaration auto-transitions to `signed_active`. Hash of the final state written to the audit chain as `emergency.declaration.signed_active` with the full payload (title + window + signers + documents + hash anchors).

7. **Side effects on activation.** When declaration becomes active:
   - **Pre-disbursement re-assessment** kicks off for every shortlisted NGO: sanctions re-screen, adverse media refresh, capacity-passport freshness check (if older than 12 months, prompt NGO to refresh).
   - **Grants are auto-created** under the window, one per shortlisted NGO with the proposed amount as the starting `total_funding`. The grant is in `draft` until the secretariat publishes (giving them a chance to tailor per-NGO).
   - **Notifications** fire to the eligible NGOs ("You have been shortlisted for a grant under [Window]").

8. **Normal lifecycle takes over.** Each grant runs through the existing Kuja flow: NGO confirms acceptance → submits required deliverables → AI compliance scoring → award → disburse → report.

9. **Closeout.** When all grants under a declaration are closed, declaration → `closed`. A closeout summary is generated and audit-chained.

### 4.3 Window report — the new artefact

**Goal:** Produce a complete, defensible report covering everything that happened in a window over a time period.

**Contents:**

- **Window header** — name, fund, network, currency, year launched, status, max-grant-amount.
- **Aggregate stats** — total declarations, total grants, total disbursed, NGOs reached, countries covered, crisis types addressed, average disbursement timeline (signed_active → first disbursement).
- **Declaration roster** — for each declaration in the window: title, crisis type, region, severity, declaration date, signed_active date, signers + signature methods + signed timestamps, supporting document list with hashes, grants issued + amounts + statuses, audit chain anchors.
- **Grant-level detail** — recipient org, amount, status, reports submitted with on-time status, AI compliance scores, decision rationale.
- **Compliance summary** — sanctions / adverse media / registry check status at time of disbursement for each NGO.
- **Audit chain verification** — green check if the full chain validates; red flag if any link is broken.
- **Per-region + per-crisis breakdowns** with charts.
- **Anonymised public summary** (opt-in per fund) — same shape minus identifying NGO + grant detail; suitable for stakeholder reporting.

**Output formats:** PDF (printable), CSV (per-table), ZIP bundle containing all source documents.

**Privacy guardrails:** the anonymised public summary follows the same anonymity discipline as the existing donor-cohort card: counts, medians, percentiles, NGO names redacted to country-only. The fully detailed report is admin/oversight-only.

---

## 5. Branding + access (the "feels independent" layer)

- **Subdomain routing.** `kuja.org` (Kuja Marketplace), `near.kuja.org` or `app.near.ngo` (NEAR), `resilio.kuja.org` (Resilio). Each resolves to the same app; the request middleware reads the host header, looks up the matching `Network.host_aliases`, and attaches `g.network` for the duration of the request.
- **Per-network skin.** Logo + colour palette + name + tagline rendered from the Network row. CSS custom properties for the brand colour swap on first paint.
- **Per-network email templates.** Sender identity, signature, brand colour all per-network.
- **Per-network public pages.** `near.kuja.org/members` shows only NEAR members; `near.kuja.org/funds` shows only NEAR funds; donor profiles still aggregate-only and anonymised.
- **Cross-network access for the platform operator.** Adeso staff (platform admins, distinct from network admins) can switch networks via a UI affordance. Network admins are locked to their network.

---

## 6. AI vision for networks

Every AI surface Kuja already ships continues to work; we add **seven new network-specific AI surfaces** (originally four; expanded post-IKEA-concept-note):

| # | Surface | Audience | What it does |
|---|---|---|---|
| 1 | **Membership reviewer brief** | Oversight Body | One-paragraph AI summary of a pending membership application: applicant context, capacity assessment highlights, document completeness, similar approved members for comparison, red flags. Reduces the 60-day review to an informed-decision-in-an-hour. |
| 2 | **Crisis Monitoring Report drafter** | Secretariat | Weekly cron pulls public news feeds + ReliefWeb + ACAPS + government press releases for every country where the network has members. Scores each event against the 4-factor formula (HDI / gov capacity / scale / attention). Drafts narrative per country row. Secretariat reviews + publishes. |
| 3 | **Emergency declaration draft assist** | Secretariat | When drafting a declaration, AI pulls from the latest Crisis Monitoring Report + network's recent activity in the region + the affected NGOs' active grants to draft the situation summary, suggest shortlisted NGOs based on geographic + sector fit, and propose realistic per-NGO amounts. |
| 4 | **Application rubric scorer** | Secretariat → OB | For each application, AI scores against every `WindowEvaluationCriterion`: cites evidence from the application text, flags missing info, scores 0–100 per criterion, summarises strengths/weaknesses. Secretariat can override; finalised score feeds the OB's deliberation pack. |
| 5 | **Direct-to-community ratio classifier** | Secretariat | Parses the uploaded budget (line-items or file). Classifies each line as `direct_community`, `operational_overhead`, or `indirect`. Returns the ratio. Hard-flags if below the window's threshold (80% single / 70% consortium). Always shows reasoning + lets the secretariat reclassify. |
| 6 | **Window narrative generator** | Fund manager | At report time, AI drafts the narrative sections of the window report ("How the Fund responded to the Sahel crisis in 2026") from the structured data, leaving humans to fact-check + refine. |
| 7 | **Cross-window pattern detector** | Network leadership | AI scans across declarations + outcomes to surface patterns ("Bridge Funding declarations issued faster than Emergency Response — is the review chain working?"). Feeds the network's strategic decisions. |

All seven follow the existing AI discipline: grounded in actual data, every claim provenance-tracked, never invents amounts, always cite source.

---

## 7. Scoring + assessment changes

- **Capacity-assessment framework labelling becomes per-network.** Internally the "Kuja" framework keeps its key so existing data stays valid; display labels resolve from `Network.default_assessment_framework_display`. NEAR users see "NEAR Capacity Assessment"; Kuja Marketplace users see "Kuja Capacity Assessment".
- **Pre-disbursement re-check uses the existing sanctions + adverse media + registry stack.** No new scoring logic; we trigger it at a new lifecycle moment (declaration → `signed_active`).
- **Membership-eligibility score is new.** A composite signal computed at the moment of membership decision combining: capacity assessment total score + sanctions clear + registration verified + reference-letter sentiment (AI summarised) + document completeness. Renders on the Oversight Body's review screen. Not stored as a model field initially — just computed on-demand.

---

## 8. Phased delivery

Revised plan (post-IKEA-concept-note). Originally 6 phases; expanded to 8 to surface the Crisis Monitoring Report and the Evaluation Rubric as distinct phases — they're large enough to deserve their own scope and they're what makes the platform usable for NEAR's specific OB process.

Each phase is 1-2 weeks of focused work, ships independently behind a feature flag, and adds incremental value.

| Phase | Scope | Why this order |
|---|---|---|
| **32 — Multi-tenant foundation** ✅ in flight | `Network` entity, host-header middleware, default "Kuja Marketplace" network seeded, `/api/network/current` endpoint, frontend brand context. | Unblocks everything below. Highest-risk because of the migration; ship first. |
| **33 — Network membership** | `NetworkMembership`, member-application flow with mandatory capacity gate, document upload pipeline (reuses existing Document model), Oversight Body review dashboard, audit-chain anchors on transitions. `assessment_next_refresh_due_at` for periodic due diligence. Rename "Kuja" framework display label per network. | Lets NEAR start onboarding members without the rest. Highest user-facing value, soonest. |
| **34 — Funds + Windows + Rubrics** | `Fund` + `FundWindow` + `WindowEvaluationRubric` + `WindowEvaluationCriterion` entities. Seeds the Change Fund rubric (5 areas, 80%/70% thresholds, MEL gates). Per-window application template config. Fund-manager UI for fund/window/rubric management. Window-scoped grant listing. | Lets NEAR publish a Change Fund window with the full evaluation discipline baked in. Prerequisite to emergency declarations. |
| **35 — Crisis Monitoring Report** | `CrisisMonitoringReport` + `CrisisMonitoringRow` + `CrisisSignal` entities. Weekly cron job (extends `cron_routes`) that drafts the report via AI from news/ReliefWeb/member alerts. Secretariat publish UI. The OB browses the report when deciding whether to declare. | Pre-cursor to declaration. NEAR can't responsibly declare without an evidence base; we need the report before we ship the declaration workflow. |
| **36 — Emergency declaration** | `EmergencyDeclaration` + `DeclarationSignature` (with `declared_no_coi` + `recusal_reason`) + `DeclarationDocument`, draft → sign → active state machine, multi-sig UX with TOTP/WebAuthn, **mandatory CrisisMonitoringRow link** as evidence, SLA timestamp fields (72hr/6-day milestones), auto pre-disbursement re-check, auto grant-creation under window. | The big workflow. Replaces NEAR's manual emergency process. Depends on Phase 35's report so declarations cite real evidence. |
| **37 — Window reporting + Monitoring Visits** | Per-window aggregation service, window report PDF generator (extends existing `bundle_pdf_service`), CSV exports, opt-in public anonymised summary, **SLA-vs-target widget** (declarations hitting 6-day commitment), **`MonitoringVisit` entity** with community-feedback summary, recusal-counts transparency, constituent-voice narrative threading from application → monitoring → report. | The artefact NEAR's stakeholders + IKEA Foundation ask for. Monitoring visits land here because they feed the report. |
| **38 — Network-specific AI surfaces** | All seven AI surfaces from §6: membership reviewer brief · Crisis Monitoring drafter · declaration draft assist · **rubric scorer** · **direct-to-community ratio classifier** · window narrative generator · cross-window pattern detector. | Polish layer. Everything else works without these but these are what makes the platform "intelligent" for network funders. Two of these (rubric scorer + direct-to-community classifier) materially improve OB decision speed. |

After Phase 38, NEAR can run their entire operation on the platform with auditable + reportable + AI-assisted workflows that meet their 72-hour / 6-day commitment to members and donors.

---

## 9. Backwards compatibility

The migration is the main risk. Concrete plan:

1. **Add `Network` table; insert one row** for "Kuja Marketplace" (slug = `kuja`).
2. **Add `network_id` to every relevant existing table** as nullable. Backfill all existing rows to the Kuja Marketplace network.
3. **Make `network_id` NOT NULL** in a follow-up migration once backfill is verified.
4. **Add host-header middleware** that defaults to the Kuja Marketplace network when no subdomain matches (so `kuja.org` continues to work as today).
5. **All existing tests pass** against the migrated schema; the default-network resolution means existing API paths still return identical results.
6. **No data loss possible** because every change is additive.

Net effect on existing functionality: zero. Net effect on test suite: 1-2 tests asserting "default network resolution" added; otherwise unchanged.

---

## 10. Open questions for the team

These are decisions the team should weigh in on before Phase 32 starts:

1. **Multi-tenant vs separate instances.** I recommend multi-tenant. Strongly. Is the team aligned, or is there a buying-side reason NEAR or Resilio would refuse to share infrastructure (e.g. compliance requirement, data residency, governance independence)?

2. **Domain strategy.** Three viable options:
   - `near.kuja.org` (subdomain under Kuja, cheap, fast to ship)
   - `app.near.ngo` via CNAME (NEAR-owned domain, more credible, ~1 day extra work)
   - Hybrid (start with subdomain, custom-domain in Phase 37)

3. **Hierarchy depth.** I designed for 2 levels (Network → Org → optional sub-Orgs via `parent_org_id`). NEAR's site mentions national partners and regional members. Is a 3rd explicit level needed (Network → National Partner → Regional Member → Sub-NGO), or does the `parent_membership_id` self-reference cover it?

4. **Signature threshold.** Default `oversight_body_min_signers = 3`. Should it be per-window (different windows have different governance), or per-network only?

5. **Pre-disbursement re-assessment trigger.** I propose firing on declaration → `signed_active`. NEAR's current practice is "~1 month after declaration." Should we add a configurable delay (e.g. "fire 21 days before scheduled disbursement") or fire immediately?

6. **Reference letter handling.** NEAR requires 2 reference letters from donors/networks/other NGOs/NEAR members. Should the platform support a reference-letter request workflow (NGO names referees, platform emails referees, referees submit through a token-gated form), or just accept uploads?

7. **Bulsho + CORE Fund nesting.** Both are funds operated by NEAR but governance is locally led (Somali for Bulsho, Nepali for CORE). Should they be `Fund` rows under the NEAR network, or separate networks with NEAR as a parent? I default to the former (less complexity), but the latter offers cleaner data isolation if those funds spin out independently.

8. **Resilio specifics.** I couldn't find Resilio's site in research — search returned no clear match. Before designing for them specifically, can the team share their actual operating model? The NEAR design above will probably fit, but worth confirming.

9. **NEAR spin-off timing.** End-2026. If NEAR fully spins out from Adeso, they may want their own infrastructure. Multi-tenant means we can export their data + hand them a clean fork at that point. Is that acceptable as a Plan B?

10. **Capacity assessment relabeling.** The user requested renaming the "Kuja" framework to "Near". I recommend keeping `framework_key = 'kuja'` internally (so existing data + tests stay intact) and making the *display label* per-network. Confirm this is fine.

---

## 11. What I'd ship first

If the team approves the strategy, Phase 32 (multi-tenant foundation) is the right first step because every subsequent phase depends on it. Phase 32 is ~3-5 days of work:

- New `Network` model + `NetworkMembership` model
- Migration adding `network_id` (nullable) to: `Organization`, `Grant`, `Application`, `Assessment`, `Report`, `Review`, `Document`, `Notification`, `AuditChainEntry`, `UserEvent`, `UserFeedback`
- Backfill all existing rows to the default `Kuja Marketplace` network
- Host-header middleware in `app/middleware.py`
- Branding context loaded into `g.network` on each request
- Frontend reads brand context from a new `/api/network/current` endpoint
- Smoke tests confirm zero regression on existing functionality

After Phase 32 is live + stable, Phase 33 (membership) unlocks NEAR's onboarding flow — which is what they actually need to start using the platform.

---

## Sources

- [NEAR — Home](https://near.ngo)
- [NEAR — Our Work / Solutions](https://near.ngo/our-work/solutions/)
- [NEAR — Change Fund](https://near.ngo/our-work/solutions/the-change-fund/)
- [NEAR — Membership](https://near.ngo/membership/)
- [NEAR — About](https://near.ngo/about/)
- NEAR — *Change Fund — Concept for IKEA Foundation Investment* (draft, 2026-01-23, provided 2026-05-26). Source of: 4-factor Crisis Monitoring formula · OB process detail · risk-management 4 pillars · $6.2M / 63-grant track record · $150k-$250k / 6-mo grant envelope · 72hr / 6-day SLA.
- NEAR — *Change Fund application evaluation criteria* (summary, provided 2026-05-26). Source of: 5-area rubric (objectives · region/population · budget · MEL · ranking) and the ≥80%/≥70% direct-to-community thresholds.
