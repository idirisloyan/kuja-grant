# Kuja Tenant — Requirements & Design Specification (v1.2)

**Tenant:** Kuja Marketplace — the default network (`slug='kuja'`, `app/models/network.py:31`), served at `https://web-production-6f8a.up.railway.app`.
**Status:** Draft v1.2 · 2026-08-14 · consolidates the current build with the target design, verified against the code.
**Scope:** the **Kuja tenant only** — Proximate, NEAR, and Saxansaxo are separate tenants and are out of scope (referenced only where they prove a portable pattern).
**Companion specs:** [`KUJA_PLATFORM_INTEGRATION.md`](KUJA_PLATFORM_INTEGRATION.md) · [`KUJA_BUILD_NETWORKED_TENANTS_INTEGRATION.md`](KUJA_BUILD_NETWORKED_TENANTS_INTEGRATION.md).
**Companion prototype:** the redesign direction (interactive) — [Kuja Redesign Prototype](https://claude.ai/code/artifact/a12db9fb-c3fc-49d9-962b-60733db42297).

> **What changed in v1.1.** Expanded around the product's core: donor grant creation, the NGO's in-context AI application help ("the heart"), the AI-*and*-human scoring model, deliverables/compliance/reporting, and clean action-oriented dashboards. Every core function now carries an honest **Today (built) / Gap / Improvement** so this is a true design doc grounded in the running system — not a wishlist. **Finding: the Kuja tenant already implements most of what follows; the work ahead is consolidation, clarity, and polish, not net-new features.**
>
> **What changed in v1.2 (shipped this cycle — commit `60408f4a3`, live on prod).** Four items moved from *gap/recommended* to *live*, tightening the exact selling points this spec is built on: **(1)** the **donor approval inbox** is now built (`donor-report-inbox.tsx`) — pre-scored deliverables, one-click accept / request-revision (§9.3, §10); **(2)** the **standing end-to-end health check** exists and is green — `test_core_lifecycle.py` drives grant→apply→submit→score→award→report→accept in-process, **30/30 checks** (§14); **(3)** **scoring clarity** — the deterministic auto-score is now exposed under the clear name `auto_score` alongside legacy `ai_score` (§8); **(4)** a latent **report-webhook** bug is fixed (§14). See the change log at the end of §14.

Status tags: **[live]** in production · **[partial]** built but incomplete · **[gap]** designed here, not built.

---

## 0. The core idea — one rubric, three consumers

Everything hinges on a single fact: **a grant's criteria are defined once, then power the whole lifecycle.**

- The **donor** defines eligibility + weighted evaluation criteria + required documents + reporting deliverables (by uploading their call, or answering guided questions).
- The **NGO's in-context AI** helps them write *against those exact criteria* — so help is rubric-aligned, not generic.
- The **AI scorer and the human reviewer** both score *against those same criteria* — so scoring is fair, explainable, and comparable.
- The **deliverables engine** turns the grant's reporting requirements into a dated, tracked list the NGO and donor both see.

That coherence — one definition, four consumers — is what lets us honestly claim: *we know what the grant requires, so we make it easy to apply accurately, score fairly, and comply on time.* This spec is organized around that value chain.

---

## 1. Product vision & the Kuja tenant's role

**One line:** a donor publishes a grant; NGOs across the Global South apply from a phone on a weak connection, in their own language, guided step-by-step by embedded AI that knows the grant's criteria. Reviewers score a transparent rubric (with an AI first pass); the donor awards, then oversees compliance and reporting — with financials flowing from our ERP when they have it, and simple manual entry when they don't.

**Why the Kuja tenant is the growth engine.** It is horizontal — any donor/foundation can adopt it (several are already Kuja Link members) — and it is the upsell surface for Link (identity), Trust (portable due-diligence), and Build (ERP). **NGOs never pay**; monetization is structural on the donor side. That is *why* NGOs adopt — zero cost, minimum friction.

**Selling points this spec must protect (in priority order):** (1) barrier-free for NGOs; (2) AI integrated into the work, not a chatbot; (3) works offline/low-bandwidth; (4) localized (FR/AR/ES/SW/SO); (5) trustworthy (grounded AI, tamper-evident audit).

---

## 2. Design principles

- **AI is integrated, not a chatbot.** AI lives *on the field you're filling*, tied to one job (draft this answer, flag this gap, structure this report, score this criterion), with per-finding provenance. A conversational copilot exists as a *complement*, never the main event. Money-gating stays deterministic/human.
- **Barrier-free for NGOs.** Guided questions, not raw form fields. Voice and photo as first-class input. **One obvious next action on every screen.** Plain-language everything.
- **Clean, uncluttered, action-oriented dashboards.** Summary before detail; state encoded in form (chips/severity), not walls of numbers; the thing needing attention reads at a glance. (See §10.)
- **Offline-first / low-bandwidth.** Static-export PWA; writes queue and replay on reconnect.
- **Localized + trustworthy.** Six locales incl. Arabic RTL; deny-by-default server-side auth; hash-chained audit; grounded, sourced AI.

---

## 3. Platform architecture — the four products

| Product | Role for Kuja | Tech | State |
|---|---|---|---|
| **Kuja Link** | SSO + shared org identity (`res.partner`) + billing/entitlements | Odoo 18 | **[gap]** identity column only today; login is local email/password |
| **Kuja Grant** | This system | Flask + Next static export | — |
| **Kuja Trust** | The single due-diligence engine | Node/Next + Postgres | **[live local]** read routes through `trust_engine`; remote gated |
| **Kuja Build** | ERP financials (donor upsell) | Odoo 18 | **[partial]** abstraction + operator UI live; one finance call pending |

Shared identity is `Organization.kuja_partner_id` (`organization.py:35`); donor entitlements are org flags (`grant_licensed`, `has_kuja_build`, …). Seams detailed in §13.

---

## 4. Personas

Roles (`User.role`): `ngo`, `donor`, `reviewer`, `admin`. Org types: `ngo | donor | ingo | cbo | network`. Server-side, deny-by-default authorization (`role_required` + object-level ownership); donor publish/award additionally licence-gated (off by default).

| Persona | Jobs | Key surfaces |
|---|---|---|
| **NGO applicant** (`ngo`) | Discover; apply (AI-guided, offline); submit; respond to revision/doc requests; report | `/grants`, `/apply/[id]`, `/applications`, `/reports` |
| **Donor / Foundation** (`donor`) | Create & publish grants; assign reviewers; award; oversee compliance & reporting; map ERP | `/grants/new`, `/grants/[id]`, `/applications`, `/reports` |
| **Reviewer** (`reviewer`) | Score assigned applications vs the rubric; disclose COI; private notes | `/reviews`, `/reviews/[id]` |
| **Platform admin** (`admin`) | Provisioning, licensing, compliance oversight, AI quality, audit integrity | `/admin/*` |

---

## 5. Grant creation (donor) — two on-ramps, one wizard

The donor's job is to define the grant. Two ways in, converging on one editable wizard, then review-as-applicants-see-it, then publish.

**On-ramp A — Upload the call.** Donor drops a PDF/DOC/DOCX/TXT (≤16 MB). The system extracts the structured skeleton and pre-fills the wizard; every extracted item is editable and **tagged `ai_extracted | ai_edited | manual`** so the donor always sees what came from the model.
- **Today [partial]:** `POST /api/grants/<id>/upload-grant-doc` (`grants.py:1029`) reads the doc (PyPDF2 / python-docx, 30 pages) and runs `AIService.extract_reporting_requirements` → **reporting requirements + indicators + frequency + template sections**, auto-saved to the grant, with a deterministic fallback if the model returns nothing (`grants.py:1143-1165`). Extracted items render in `editable-extraction-list.tsx` with the provenance tags.
- **Gap:** the single upload pass extracts the *reporting/deliverables* side; **eligibility + weighted evaluation criteria + required documents** are filled via separate AI calls in the wizard (`/api/ai/donor-grant-copilot`, `/api/ai/suggest-criteria`), not the one upload.
- **Improvement:** one extraction that fills the **whole** skeleton — eligibility, weighted criteria, documents, and reporting deliverables **with due dates** — into the wizard for review. Same tags, same editability.

**On-ramp B — Guided (no document).** The wizard asks plain questions — *Who can apply? What will you fund? How will you decide (criteria + weights)? What do you need back, and when?* — and builds the same structure. **Today [live]:** the 6-step wizard (`frontend/src/app/(app)/grants/new/page.tsx`): **Upload → Basic Info → Eligibility → Evaluation → Documents → Review & Publish**; step 0 auto-creates a `draft` and AI pre-fills; `donor-grant-copilot` scaffolds criteria/rubric.

**Converge → Review → Publish.** Both paths land on **Review & Publish**: the donor sees the grant exactly as applicants will, confirms, and publishes. `POST /api/grants/<id>/publish` flips `draft → open`, stamps `published_at`, and fans out saved-search alerts + `grant.published` webhooks + smart-match notifications (`grants.py:691-767`). **[live]** Reusable **criteria templates** (`CriteriaTemplate`) make repeat grants one click. **[live]**

**Why it matters:** the published rubric is the single spine (§0) — it immediately powers the NGO's in-context help (§7) and both scoring passes (§8).

---

## 6. Grant lifecycle & domain model (the core functions)

The spine everything else rides on. All **[live]**.

**Grant** (`grant.py`) — `status: draft → open → review → closed → awarded`; weighted `criteria`, `eligibility`, `doc_requirements`, `reporting_requirements`, `reporting_frequency`; `financial_source`/`build_ref`.
**Application** (`application.py`) — `status: draft → submitted → under_review → scored → awarded | rejected | declined`, plus `withdrawn`, `revision_requested`; one per NGO per grant; `responses`, `eligibility_responses`, `ai_score/human_score/final_score`, appeal + win/loss fields.
**Review** (`review.py`) — a row *is* an assignment; `status: assigned → in_progress → completed`; per-criterion `scores`, weighted `overall_score`, `private_notes` (never shown to NGO), COI fields.
**Report** (`report.py`) — `report_type: financial|narrative|impact|progress|final`; `status: draft → submitted → under_review → accepted | revision_requested`; `due_date`, `revision_history`, attachments.
**Trust Profile** — synthesized two-pillar (Capacity + Due Diligence); see §12.

State-machine invariants, idempotency, and how we keep this boringly stable are in §14.

---

## 7. Applying (NGO) — the heart: in-context, criterion-aware AI

This is the system's core promise: because we hold the grant's exact criteria, we help the NGO complete an accurate, competitive application — inline, as they write, not via a chatbot.

**The apply flow** (`/apply/[grantId]`, 4 steps: Eligibility → Proposal → Documents → Review). For each criterion the NGO answers, the assistant provides:

| Capability | Today | Endpoint / component |
|---|---|---|
| **Draft this answer for me** | **[live]** | `/api/ai/draft-application`, `/draft-section` |
| **Strengthen / polish** the weakest answer | **[live]** | `/api/ai/strengthen-section`, `/polish-response`, `ai-diff.tsx` |
| **Autofill** from the org's profile + capacity passport + prior *winning* applications | **[live]** | `application_autofill_service`, `GET /api/grants/<id>/autofill` |
| **Live rubric preview** — score against the criteria *as they type* | **[live]** | `rubric-live-preview.tsx` |
| **Plain-language requirement explainers** (what this criterion means, in human terms) | **[live]** | `compliance_explainer_service` (deterministic catalogue) |
| **Pre-submit readiness** — predicts which criteria will score low and why | **[live]** | `/api/ai/submission-readiness`, `pre-submit-preview`, `preflight` |
| **Voice input** on any field | **[live]** | `voice-field-input.tsx` |
| **Offline autosave** — draft queues and replays on reconnect | **[live]** | `apiOffline.put` (`apply/[grantId]/client.tsx:309`) |

**Gaps / improvements** (the honest deltas):
- **Make criterion-awareness explicit.** Beside each question, show *"what a strong answer covers"* derived from the criterion + weight + donor guidance, and a per-answer **match-to-rubric meter**. (The pieces exist — rubric preview, strengthen-against-criterion — but the criterion→guidance link should be first-class.)
- **A reusable evidence library.** Today autofill pulls from prior apps ad-hoc; formalize an org-level library (registration, financials, past results, photos) the NGO builds once and reuses across every grant — the single biggest friction-killer.
- **Calm the surface.** Several assistants (draft, strengthen, readiness, flags) can crowd the page; consolidate into one quiet, expandable assistant panel per question (prior work already simplified `/apply` — Phase 619). Every AI suggestion stays accept/edit/dismiss + provenance-tracked (§11).

**Principle:** AI proposes; the NGO owns every word. Nothing is auto-submitted; provenance shows what the model contributed.

---

## 8. Selection & scoring — AI *and* human, cleanly separated

The system already has three scoring signals; the improvement is to **name and separate them cleanly** so donors trust the result.

**Today [live], being clarified:**
- **Deterministic auto-score** — `ScoringEngine.score_application` (`scoring_engine.py`) computes a weighted score from response completeness/keywords, document scores, and eligibility. It runs at submit and writes the fields `ai_score`/`final_score`. *(It is heuristic, **not** an LLM — despite the legacy field name.)* **[live, clarified this cycle]** the model now documents the three signals and exposes this deterministic score under the clear name **`auto_score`** (a read-only property + `to_dict` alias in `application.py`) alongside legacy `ai_score`, so the API reads plainly without a risky column rename/migration.
- **AI (LLM) scoring** — `/api/ai/score-criterion`, `/score-application` produce a model assessment against the criteria; surfaced to reviewers/donors.
- **Human scoring** — assigned reviewers score per criterion; the weighted mean (`Review.overall_score`, auto-computed from criteria weights, `reviews.py:963-1023`) is the decision score.
- **Calibration + accelerators** — AI-vs-human agreement (`ai-vs-human-card.tsx`, `GET /api/grants/<id>/ai-vs-human`), one-click **adopt-AI-score** into the human score (editable), reviewer summary, rubric guidance, private notes, COI recuse. NGOs see an **anonymized** score-breakdown (`ScoreBreakdownService`: strengths/weaknesses per criterion, `reviewer_count` — never reviewer identities).

**Improvement — the clean model (simple, defensible):**
1. **Eligibility gate** — deterministic pass/fail on hard requirements, kept *separate* from quality scoring.
2. **Completeness auto-check** — the current heuristic engine, now surfaced as **`auto_score`** (done this cycle; legacy `ai_score` retained for back-compat), used only to flag thin/incomplete submissions.
3. **AI first-pass score** — the LLM, per criterion: `{score, rationale, confidence, provenance}`. Runs on submit (async). Purpose: give the NGO a pre-submit self-check, give reviewers a head start, and rank a large pool.
4. **Human score** — reviewers decide; weighted mean is **authoritative for the award**. AI never awards.
5. **Calibration view** — AI-vs-human agreement per criterion; divergence + reviewer-outlier flags feed a quality loop.

**Net:** *AI proposes and accelerates; humans decide; both are visible and comparable.* This is the honest, category-defining version of "AI scoring and human scoring."

---

## 9. Deliverables, compliance & reporting — the NGO's easiest path to compliant

This is the key donor-facing selling point: **we make it easy for NGOs to comply with every requirement on time, and easy for donors to see what's due and what's ready.**

### 9.1 The Obligations engine (the unifying idea)
A grant's eligibility + documents + reporting requirements + deliverables should be **one dated, tracked list of what the NGO owes and when** — a single "Obligation" concept that powers the calendar, the next-action prompts, the reminders, and the donor view.
- **Today [partial]:** the pieces exist but aren't unified — `Grant.reporting_requirements` + `Report` (with `due_date`) + a cross-entity **deadline calendar** (`calendar_routes.py`, `.ics` export) that already shows, for the NGO, open-grant deadlines + own report due dates + screening refreshes, and for the donor, their grants' report due dates. Plus **at-risk prediction** (`compliance_preemption_service`) and `compliance_health`.
- **Portable proof:** the **Proximate** tenant already ships a richer version — compliance-per-requirement scoring + per-deliverable progress (Phase 721d). The pattern is proven; Kuja can adopt a unified `Obligation`/`Deliverable` entity with per-item `due_date` + `status` (upcoming / submitted / accepted / overdue).
- **Improvement:** promote deliverables to first-class dated obligations so "what's due" is one query, not four.

### 9.2 NGO experience — next action, calendar, never a blank page
- **Deliverables calendar** of what's coming due (upcoming / due-soon / overdue), subscribable via `.ics`. **[live]**
- **Always the next action** — the dashboard surfaces the single most important thing to do next (prior work: "surface ONE obvious next action," Phase 697). **[live, extend]**
- **Never a blank page** — reports pre-draft from prior submissions + the evidence library; **voice-to-report** (`/api/reports/<id>/structure-from-voice`), **photo evidence** (`/photo-evidence`), and an **AI pre-check** before submit. **[live]**
- **Offline-safe** — extend the outbox (today: apply autosave) to **report submission** so a report written on a weak connection is never lost. **[gap]**

### 9.3 Donor experience — the approval inbox
- **"What needs your decision now" — built this cycle. [live]** `DonorReportInbox` (`frontend/src/components/reports/donor-report-inbox.tsx`) is a clean, action-oriented queue of submitted / under-review deliverables **across all the donor's grants**, each showing the **AI pre-score** + per-requirement **met / partial / missing** coverage + summary, with one-click **Accept** and **Request revision** (with a short note back to the grantee) inline. It consumes `GET /api/reports/?status=submitted|under_review` (already scoped to the donor's grants + the Kuja network server-side) and `POST /api/reports/<id>/review {action, notes}` — an endpoint that previously had **no UI at all**. It renders atop the reports page for donor/admin only, self-hides when the queue is empty, and refreshes the grouped list on action. *(Live-proven end-to-end by the core lifecycle test, §14: donor sees the submitted report in the inbox and accepts it.)*
  - **Still open [gap]:** a portfolio "due soon" + "at risk" rollup card beside the inbox, and surfacing the same inbox as a donor-dashboard tile (today it lives on `/reports`).
- **Application status per grant** — # applied, funnel by status, # awaiting decision, review progress, deadline countdown, top applicants by score. All the data exists (applications-by-status, awaiting-decision, review-pipeline, applicant table, CSV export); consolidate into one clean grant home (§10). **[live → consolidate]**

### 9.4 Financials — with our ERP *and* without it
One normalized shape from `GET /api/grants/<id>/financials` regardless of source (`build_engine.get_grant_financials`, **[live]**):

| `financial_source` | Behavior | `status` |
|---|---|---|
| `manual` (default) | figures from the app + submitted reports | `manual` |
| `erp`, Build not configured | degrades to manual/empty (inert today) | `erp_unconfigured` |
| `erp`, Build configured | live budget / actuals / disbursements by `build_ref` | `erp` |
| `erp`, Build error | degrades, never raises | `erp_unavailable:*` |

Shape: `{source, build_ref, currency, budget_lines[], actuals[], disbursements[], last_synced_at, status}`. **Isolation by record** — keyed only by the grant's stored `build_ref`. Shipped this cycle: the operator mapping card + a donor/admin **financials panel** on the grant page. Pending: the one concrete Build finance call.

### 9.5 Reporting pipeline
`Report` lifecycle (draft → submitted → under_review → accepted | revision_requested) with voice/photo/AI-precheck; a **report bundle** assembles report + attachments + AI summary, publishes with an audit-chain anchor, exports **PDF** (`report_bundle_routes.py`). Where `financial_source=erp`, the bundle can carry live financials; where `manual`, the submitted figures. **[live]**

### 9.6 The compliance → Trust flywheel (how it all fits)
On-time, high-quality compliance history feeds the NGO's **Trust Profile** (§12) → a stronger profile speeds future eligibility → the portable-trust moat. Compliance, reporting, and Trust are not silos: **behaving well on one grant makes the next grant easier** — for the NGO and for every donor who reads that profile. This is the durable advantage.

---

## 10. Dashboards & UX — clean, uncluttered, action-oriented

The design language for every surface. (Prior work already moved this way — "Collapse NGO tile wall" Phase 613, "ONE obvious next action" Phase 697, `/apply` simplification Phase 619 — the direction is to finish it consistently.)

**Principles.** One primary action per screen. Summary before detail (progressive disclosure). State in *form* — a status chip, a due-soon stripe, an at-risk color — so attention reads at a glance, not by parsing numbers. Semantic color (good/warning/critical) separate from brand accent. Calm typography, generous spacing, tabular numerics where figures align. Mobile-first (cheap Android, one thumb).

**Three home screens to get right:**
- **NGO home** — a single "do this next" banner (finish a draft, a report due in 3 days, a document requested), then a compact deliverables calendar, then everything else one tap away.
- **Donor grant home** — a clean funnel (applied / under review / awaiting your decision), a "needs your decision now" queue, deadline countdown, top applicants by score — no tile wall.
- **Donor approval inbox** — pre-scored deliverables, one-click accept / request revision, portfolio due-soon + at-risk. **The inbox itself is now built [live] (§9.3);** the remaining work is the surrounding grant-home consolidation and the due-soon/at-risk rollup.

**On "the UI looks dated":** the app is functional and feature-complete but visually busy in places (tile sprawl, dense panels). The move is a **design-system pass** — consolidate to the calm patterns above, retire redundant tiles, and modernize spacing/hierarchy — **not a rebuild**. The visual direction is now shown concretely by the interactive **[Kuja Redesign Prototype](https://claude.ai/code/artifact/a12db9fb-c3fc-49d9-962b-60733db42297)** (NGO "do this next" home · criterion-aware apply with a live rubric meter · donor funnel + pre-scored inbox — calm, theme- and RTL-aware). Applying that language across the live screens, incrementally behind the existing tokens, is the **one substantive piece still deferred** (see §17 Phase A). The companion HTML for this spec carries the same direction.

---

## 11. AI architecture — embedded, grounded, reliable

A heavily-wired Anthropic path with consistent *budget-gate → telemetry → provenance → replay* plumbing behind every surface. Engine: `AIService` (`ai_service.py`) with `_call_claude` (free text) and `_call_claude_tool` (**forced tool-use against a JSON schema** = server-side output validation); companions `copilot_service` (typed copilot + SSE chat), `ai_chat_service` (persisted, budget-enforced). Models: `claude-sonnet-4-6` primary, `claude-haiku-4-5` fast, `whisper-1` (config-gated). Model ids centralized (a prior incident hard-fixed invalid ids).

**LLM vs deterministic — both by design.** Deliberately *not* LLM, for speed/explainability/defensibility: scoring (`scoring_engine`), why-this-match (`match_engine`), plain-language flags catalogue (`compliance_explainer`), guided-question mapping. LLM-backed: extraction, drafting/strengthen/polish, autofill, submission-readiness, adverse-media web check, voice→report, translation, summaries.

**Grounding & guardrails.** Per-claim provenance (`AIProvenance`: basis/source/confidence); per-field extraction tags (`ai_extracted|ai_edited|manual`); forced-schema validation + deterministic fallbacks; 8 flagship surfaces contract-checked (`ai_surface_health`); replayable calls (`log_replayable_ai_call`); a **false-confidence loop** (accepted-verbatim-then-corrected) rolled up per language. **Gap:** no unified registry of *mutating* AI actions — a recommended hardening (§15).

**Cost & degradation.** Hard per-org budget inside the call path (over-budget → deterministic template); soft thresholds 75/90/100%; async offload for heavy calls; a service-status banner (`ok|no_key|no_sdk`) so the workflow always has a non-AI path.

---

## 12. Compliance & Trust — the due-diligence spine

**Trust Profile** (`TrustProfileService.build`, **[live local]**): two pillars — **Capacity** (framework-based, weights sum 100) + **Due Diligence** (registration + sanctions/PEP + adverse-media + bank verification + beneficial ownership); each `score 0-100` + `status`; overall = mean, status = worst-of-two. The read routes through `trust_engine.get_trust_profile()` (`trust_routes.py:57`) in **local** mode; `remote`/`shadow` are env-gated and **Kuja-tenant-guarded**.

**Screening** (`ComplianceService`, **[live]**): OpenSanctions (UN/OFAC/EU/World Bank) + fallbacks; **SAM.gov** **[partial, needs key]**; keyword + registration + personnel; **adverse-media** via Anthropic web search.

**How Trust fits the whole system.** The profile feeds eligibility and the plain-language flags the NGO sees while applying (§7); compliance behavior on grants feeds back into the profile (§9.6 flywheel); and with Trust as the shared engine, the same profile is portable across the platform. It is the spine that makes "trust is the product" real.

---

## 13. Integration seams

- **Link → Grant [gap]:** identity column only; login is local email/password (`auth.py:195`); no OIDC/SSO, no inbound Odoo webhook. Target: OIDC SSO + a billing→entitlement webhook (drives `grant_licensed`/`has_kuja_build`).
- **Grant → Trust [live local / gap remote]:** local engine default; flip `shadow → remote` after the org identity backfill; retire the local DD fork.
- **Build → Grant [partial]:** `financial_source`/`build_ref` + `BuildClient` + `build_engine` + endpoints + operator UI live; the concrete finance call is stubbed (`build_client.py:63`) awaiting the dev-team contract.

---

## 14. Core functions & reliability

The core lifecycle must be *boringly* stable — the request was explicit about this. Design commitments:
- **Explicit state machines.** Grant / Application / Review / Report transitions are enumerated (§6); illegal transitions are rejected server-side, not just hidden in the UI.
- **Idempotency.** Submit/publish/award are idempotent (re-clicking is safe); the offline outbox replays without double-writes (mutating verbs never auto-retried).
- **Deterministic where it counts.** Scoring, eligibility, and matching are deterministic and reproducible; AI is advisory around them.
- **Server-side enforcement.** Static export = no client route auth; the server is the only gate; deny-by-default; object-level ownership; licence gate fails *closed*.
- **Auditability.** Governance actions on a hash-chained, tenant-scoped audit log; replayable AI calls; full JSONL export.
- **Schema safety.** A boot-time reconciler ALTER-adds missing columns as nullable (no silent drift).
- **A standing end-to-end health check — built this cycle. [live]** `test_core_lifecycle.py` (repo root) drives the *whole* core engine in-process through the real Flask routes against an isolated throwaway SQLite: **create grant (+weighted criteria) → publish → NGO apply → fill responses → submit (deterministic auto-score) → reviewer panel scores + completes → `scored` (human + blended `final_score`) → donor award → NGO report create → submit (AI analysis attached) → donor approval inbox lists it → donor accept.** It asserts every state transition and all three score signals — **30 / 30 checks green.** Zero production impact by construction (a full award run can't be cleaned off prod, since grant-delete blocks on non-draft applications with a 409, so the test runs entirely in-process). This makes "the core works" provable on demand, and it is the live proof behind the donor-approval-inbox claim (§9.3).

**Current-function status:** grant CRUD/publish, application draft→award (+revision/withdraw/appeal), reviewer assign/score/COI, compliance screening, Trust Profile, reporting (voice/photo/bundle/PDF), the **donor approval inbox**, and the financials abstraction are all **[live]**. The core lifecycle is now **verified green end-to-end**; remaining stability work is coverage breadth, not rebuilding.

### 14.1 Change log — shipped this cycle (commit `60408f4a3`, live on prod build `60408f4a3189`)
All Kuja-tenant only; Proximate / NEAR / Saxansaxo untouched.
1. **Donor approval inbox** — `donor-report-inbox.tsx` on the reports page (§9.3). New UI on the pre-existing, previously-UI-less `POST /api/reports/<id>/review`.
2. **Standing core-lifecycle health check** — `test_core_lifecycle.py`, 30/30 green (§14).
3. **Scoring clarity** — `auto_score` alias + documented three-signal model on `Application` (§8); additive, no migration.
4. **Report-webhook fix** — report-submit read a nonexistent `report.ngo_org_id`, so the `report.submitted` webhook to the grantee org **silently never fired** (the `AttributeError` was swallowed by the surrounding `try/except`). Corrected to `report.submitted_by_org_id` in `reports.py`.
Also produced (not code): the interactive redesign prototype (§10) establishing the visual direction.

---

## 15. Cross-cutting foundations

- **Offline / low-bandwidth [live infra, narrow adoption]:** custom service worker (network-first shell, cache-first static, SWR reads) + IndexedDB outbox + auto-drain. Extend the outbox from apply-autosave to **application submit + report submit** (§9.2). Static export removes SSR round-trips.
- **Localization [live, gaps]:** 6 locales (target→en→key fallback), Arabic RTL, per-user language wins. Coverage: ar ~99.5%, so/sw ~93.7%, es ~93.2%, fr ~91.5%. Finish fr/es/sw/so; fix 3 hardcoded-English surfaces (build card, voice composer, offline queue panel); Whisper server transcription unlocks Somali voice.
- **Security:** 2FA (TOTP + WebAuthn), forced rotation, brute-force lockout; deny-by-default; hash-chained audit.

---

## 16. Current state → target (capability matrix)

| Capability | State |
|---|---|
| Grant creation — guided wizard | **[live]** |
| Grant creation — upload → AI extract reporting deliverables | **[live]** |
| Grant creation — upload → full skeleton (eligibility+criteria+docs+dated deliverables) | **[gap]** |
| Editable/tagged extraction, review-then-publish, templates | **[live]** |
| NGO in-context AI (draft/strengthen/polish/autofill/live-rubric/readiness/voice/offline-autosave) | **[live]** |
| NGO criterion-aware "what a strong answer covers" + reusable evidence library | **[partial/gap]** |
| Scoring — deterministic + AI + human + calibration + adopt-AI-score | **[live]** |
| Scoring — `auto_score` alias + documented 3-signal model | **[live]** (this cycle) |
| Scoring — per-criterion AI first-pass object `{score,rationale,confidence,provenance}` | **[gap]** |
| Donor application-status (funnel, awaiting-decision, applicant table, CSV) | **[live]** |
| Deliverables calendar (NGO + donor, `.ics`) + at-risk prediction | **[live]** |
| Donor approval inbox (pre-scored reports, accept / request-revision) | **[live]** (this cycle) |
| Unified Obligations/Deliverables entity (dated, first-class) | **[gap]** |
| Reporting (voice/photo/precheck/bundle/PDF) | **[live]** |
| Financials abstraction + operator mapping + donor financials panel | **[live]** |
| Trust Profile (two-pillar, local) + screening | **[live]** (SAM.gov, Build feed, Link SSO gated) |
| Standing end-to-end core-lifecycle health check (30/30) | **[live]** (this cycle) |
| Offline coverage for submit/report writes | **[gap]** |
| Localization completion + 3 hardcoded surfaces | **[gap]** |
| Dashboards — clean/consolidated design-system pass on live app | **[partial]** (direction set; prototype done) |

---

## 17. Roadmap (priority-ordered)

**Phase A — core stability & clarity (highest priority, mostly consolidation).**
- ✅ **Done this cycle:** the end-to-end health check (§14, 30/30); the `auto_score` clarity alias (§8); the donor approval inbox (§9.3); the report-webhook fix (§14.1).
- **Now:** make the AI first-pass a per-criterion `{score, rationale, confidence, provenance}` object (human stays authoritative).
- **The one substantive piece still open:** the **dashboards design-system pass on the live app** — apply the [prototype](https://claude.ai/code/artifact/a12db9fb-c3fc-49d9-962b-60733db42297) language screen-by-screen behind the existing tokens (NGO "next action" home → donor grant home → donor approval-inbox surround), retiring tile sprawl. Held pending sign-off on the direction.

**Phase B — the NGO moat.**
- Criterion-aware "what a strong answer covers" + reusable evidence library.
- Extend the offline outbox to application submit + report submit.

**Phase C — deliverables engine.**
- Unified Obligations/Deliverables entity (adopt the proven Proximate pattern) → one calendar/next-action/donor-approval-inbox source.

**Phase D — grant-creation completeness.**
- One upload pass that fills the whole skeleton (eligibility+criteria+docs+dated deliverables).

**Phase E — integrations (mostly blocked on external inputs).**
- Link SSO + billing webhook; Trust remote cutover (after identity backfill); Build finance call; SAM.gov key; localization completion.

---

## 18. What we need

- **Link:** OIDC IdP details + billing→entitlement webhook contract + test env; which donors are already Link members.
- **Trust:** the org identity backfill (`res.partner` ↔ grant org).
- **Build:** finance API contract — endpoint, read-only service account, one sample payload, `build_ref` mapping, freshness model.
- **Licensing:** which donor orgs to license first + go-live date.
- **Localization:** native fr/es/sw/so reviewers.
- **Product decision:** confirm the deliverables-engine scope (adopt Proximate's per-requirement model wholesale, or a lighter Kuja variant).

---

## Appendix A — key endpoints (Kuja tenant)

- Grants: `POST/PUT/DELETE /api/grants`, `POST /api/grants/<id>/publish|withdraw|duplicate|upload-grant-doc`, `GET/POST /api/grants/criteria-templates`, `GET /api/grants/<id>/autofill|financials|ai-vs-human`.
- AI (apply): `/api/ai/draft-application|draft-section|strengthen-section|polish-response|submission-readiness|suggest-criteria|donor-grant-copilot`.
- Applications: `POST/PUT /api/applications`, `POST /<id>/submit|withdraw|request-revision|appeal|star`, `PATCH /<id>/status`, `GET /<id>/score-breakdown|pre-submit-preview|trust-profile-readiness`.
- Reviews: `POST /api/reviews`, `/bulk-assign`, `PUT /<id>`, `/<id>/complete|decline|snooze|coi-flag`.
- Reporting: `POST/PUT /api/reports`, `/<id>/submit|precheck|structure-from-voice|photo-evidence|review`, `GET /<id>/bundle|bundle.pdf`.
- Calendar: `GET /api/calendar` (unified deadlines, `.ics`).
- Financials/Build: `GET /api/grants/<id>/financials`, `POST /api/grants/<id>/financial-source`, `GET /api/admin/build/status`.

## Appendix B — data shapes

- **Financials:** `{source, build_ref, currency, budget_lines[], actuals[], disbursements[], last_synced_at, status}`.
- **Score-breakdown:** `{criteria_breakdown[], overall_human_score, overall_human_score_computed, reviewer_count, strongest_criteria[], weakest_criteria[]}` (reviewer identities never exposed).
- **AI first-pass score (proposed):** per criterion `{criterion_id, score, rationale, confidence, provenance[]}`.
- **Obligation/Deliverable (proposed):** `{grant_id, org_id, kind, label, due_date, status: upcoming|submitted|accepted|overdue, source}`.
