# Kuja Tenant — Requirements & Design Specification (v1.0)

**Tenant:** Kuja Marketplace — the default network (`slug='kuja'`, `app/models/network.py:31`), served at `https://web-production-6f8a.up.railway.app`.
**Status:** Draft v1.0 · 2026-08-14 · consolidates the current build + the target design.
**Audience:** product, engineering, and go-to-market. This is the canonical spec for the **Kuja tenant only** — Proximate, NEAR, and Saxansaxo are separate tenants with their own specs and are explicitly out of scope here.
**Companion specs:** [`KUJA_PLATFORM_INTEGRATION.md`](KUJA_PLATFORM_INTEGRATION.md) (four-product integration), [`KUJA_BUILD_NETWORKED_TENANTS_INTEGRATION.md`](KUJA_BUILD_NETWORKED_TENANTS_INTEGRATION.md) (Build ↔ non-Kuja tenants — *not* this tenant).

Legend used throughout: **[live]** = in production today · **[scaffold]** = present but env/flag-gated or stubbed · **[to build]** = designed here, not yet implemented.

---

## 0. What this document is

Kuja Grant is Adeso's grant-management platform. The **Kuja tenant** is our flagship, general-market product: we sell it to donors and foundations (several of whom are already members of **Kuja Link**), and it is the tenant that must carry our core promise — *the easiest grant system in the world for a Global-South NGO to use, with AI woven through every step rather than bolted on as a chatbot.*

This spec defines: the four-product platform and how the Kuja tenant integrates with **Link** (identity + marketplace), **Trust** (due-diligence engine), and **Build** (ERP financials); every persona and their end-to-end workflow; the AI-integration architecture; and the cross-cutting foundations (offline-first, low-bandwidth, five-language localization) that are our differentiators. It covers the compliance and reporting flows **both with our ERP (Build) and without it**.

It is deliberately written as *both* the design and the roadmap: §12 is the current-state matrix, §13 the phased backlog.

---

## 1. Product vision & the Kuja tenant's role

**One-line:** a donor publishes a grant; NGOs across the Global South apply from a phone on a weak connection, in their own language, guided end-to-end by embedded AI; reviewers score against a transparent rubric; the donor awards, then oversees compliance and reporting — with financials flowing automatically from our ERP when the donor has it, and through simple manual entry when they don't.

**Why the Kuja tenant is the growth engine:**
- It is horizontal — any donor/foundation can adopt it, unlike the closed-network tenants (Proximate, Saxansaxo) which are bespoke.
- It is the natural upsell surface for the rest of the platform: Link (identity/SSO), Trust (portable due-diligence), Build (ERP).
- **NGOs never pay** — monetization is on the donor/foundation side (licence + ERP upsell). This is structural, not a policy toggle, and it is the reason NGOs adopt us: zero cost, minimum friction.

**Selling points this spec must protect (in priority order):**
1. **Barrier-free for NGOs** — the system does the heavy lifting; the NGO answers plain questions.
2. **AI fully integrated** — not a chatbot; AI is *inside* each task (drafting, checking, scoring, translating, structuring) with visible provenance.
3. **Works where our NGOs work** — offline-first, low-bandwidth, on cheap Android phones.
4. **Localized** — French, Arabic, Spanish, Swahili, Somali, plus English; Arabic is RTL.
5. **Trustworthy** — every AI claim is grounded and sourced; every governance action is on a tamper-evident audit chain.

---

## 2. Design principles

### 2.1 AI is integrated, not a chatbot
AI appears **at the point of work**, as an affordance on the field/screen the user is already on — never as a separate "ask the assistant" pane the user must context-switch into. Concretely:
- Each AI surface has a **single job** tied to one workflow step (draft this answer, flag this compliance gap, structure this spoken report, score this application).
- Every AI output carries **provenance** — a per-finding basis / source / confidence — so the user (and an auditor) can see *why* the system said it. Outputs are **validated server-side against a closed catalogue** so the model cannot invent a UI action or a step that doesn't exist.
- AI is **suggestive, never silently authoritative**: the human accepts / edits / dismisses, and that decision is telemetered. Scoring that gates money is **deterministic** (`ScoringEngine`), with AI as an advisory second opinion, never the sole arbiter.

### 2.2 Barrier-free for NGOs
- **Guided questions, not form fields.** Ask "What change will this money make?" not "Enter project objective (max 500 chars)."
- **Progressive disclosure** — beginners see the minimum; experts can expand.
- **Voice and photo as first-class input** — an NGO officer can *speak* a report or *photograph* evidence.
- **One obvious next action** on every screen; the system tells the NGO what to do next and why they're blocked.
- **Plain-language everything** — compliance flags, rejection reasons, and concepts are explained in human terms, inline.

### 2.3 Offline-first / low-bandwidth
- The app is a **static export** served as a PWA with a hand-rolled service worker; navigations are network-first with a cached shell, static chunks are cache-first, safe reads are stale-while-revalidate.
- Writes queue in an **IndexedDB outbox** and replay on reconnect (Background Sync).
- Assume 2G/3G, intermittent connectivity, and 30–100 KB payload budgets. Retry transient failures with backoff.

### 2.4 Localized (FR / AR / ES / SW / SO + EN)
- Runtime `t()` catalogue with a **target → English → key** fallback; per-user language preference wins over the tenant default (`en` for Kuja).
- Arabic is **RTL** end-to-end (`dir` on `<html>`).
- User-generated content (proposals, reports) can be **AI-translated** on demand, distinct from the static UI catalogue.

### 2.5 Trust & auditability
- Deny-by-default authorization; server-side enforcement (the frontend is a static export with **no route auth** — the server is the only gate).
- Governance actions (COI disclosure, awards, report acceptance, licence changes) are written to a **hash-chained audit log**, tenant-scoped.

---

## 3. Platform architecture — the four products

| Product | What it is | Tech | Role for the Kuja tenant |
|---|---|---|---|
| **Kuja Link** | Identity + marketplace / member directory | Odoo 18 (kuja.org) | SSO for NGO + donor users; owns the shared org identity (`res.partner`) and billing/entitlements |
| **Kuja Grant** | This system — grant lifecycle | Flask + Next.js static export | The tenant this spec describes |
| **Kuja Trust** | Portable due-diligence / trust passport | Node/Next + Postgres | The single due-diligence engine the Grant app calls |
| **Kuja Build** | ERP / accounting | Odoo 18 | Real-time financials feed into compliance + reporting (the donor upsell) |

**Shared identity & entitlements.** Every organization has a nullable `kuja_partner_id` (Odoo `res.partner` id, `app/models/organization.py:35`) — the join key across Link/Trust/Build. Donor entitlements live on the org as flags (`grant_licensed`, `grant_license_tier`, `grant_license_expires_at`, `has_kuja_build`, `organization.py:45-51`), source-of-record in the Grant app, ultimately drivable by Link billing. See §10 for each seam's detailed contract and current state.

---

## 4. Personas & roles

Roles are the `User.role` enum (`app/models/user.py:23`): `ngo`, `donor`, `reviewer`, `admin`. `read_only` is a separate observer flag (middleware-enforced, not a role). Org type (`Organization.org_type`) is `ngo | donor | ingo | cbo | network`.

| Persona | Role | Primary jobs | Key surfaces |
|---|---|---|---|
| **NGO applicant** | `ngo` | Discover grants; apply (AI-assisted, offline-capable); submit; respond to revision/document requests; report | `/grants`, `/apply/[id]`, `/applications`, `/reports`, `/dashboard` |
| **Donor / Foundation** | `donor` | Create & publish grants; set criteria/eligibility; assign reviewers; award/reject; request revisions/docs; oversee compliance & reporting; map ERP financials | `/grants/new`, `/grants/[id]`, `/applications`, `/reports`, dashboards |
| **Reviewer** | `reviewer` | Score assigned applications against the rubric; disclose COI; leave private notes | `/reviews`, `/reviews/[id]` |
| **Platform admin** | `admin` | Tenant operations; user/licence provisioning; compliance oversight; AI-quality + telemetry; audit-chain integrity | `/admin/*` |

Authorization is enforced by `role_required(*roles)` (`app/utils/decorators.py:15`) plus object-level ownership checks in each handler; donor "publish & award" is additionally gated by `grant_license_required` / `donor_publish_allowed` (`decorators.py:49,69`) — **[scaffold]**, OFF unless `GRANT_LICENSING_ENFORCED` is set, behaving as a plain `donor|admin` gate while off. NGO capabilities are **never** licence-gated.

---

## 5. Domain model & state machines

**Grant** (`app/models/grant.py`) — `status: draft → open → review → closed → awarded`. JSON arrays: `eligibility`, `criteria` (weighted), `doc_requirements`, `reporting_requirements`, `report_template`, `sectors`, `countries`. `reporting_frequency`. Financial binding: `financial_source ('erp'|'manual', default manual)`, `build_ref`, `financial_synced_at`.

**Application** (`app/models/application.py`) — `status: draft → submitted → under_review → scored → awarded | rejected | declined`, plus `withdrawn`, `revision_requested`. One app per NGO per grant (unique `grant_id, ngo_org_id`). Holds `responses` (keyed by criterion), `eligibility_responses`, `ai_score/human_score/final_score`, `is_starred`, appeal fields, win/loss `decision_reason_code` (controlled vocab `WIN_LOSS_REASONS`, `app/constants.py`).

**Review** (`app/models/review.py`) — `status: assigned → in_progress → completed`. A Review row **is** the reviewer assignment (no separate model). Holds `scores` (keyed by criterion), `overall_score` (auto-computed weighted mean), `comments`, `private_notes` (never shown to NGO), COI fields (`coi_disclosed_at`, `coi_kind`, `coi_note`), snooze fields.

**Compliance** — `ComplianceCheck` (`check_type: sanctions_un/ofac/eu, blacklist, registration, sanctions_personnel, pep_screening, keyword_screening, sam_exclusions`; `status: clear|flagged|pending|error`), `RegistrationVerification` (`status: unverified→pending→ai_reviewed→verified|flagged|expired`), `AdverseMediaScreening` (`status: pending|clear|review|flagged|error`; `source: anthropic_web_search|claude_training_knowledge|manual`).

**Trust Profile** — synthesized read-only by `TrustProfileService.build(org_id)`: two pillars (Capacity, Due Diligence), each `score 0-100` + `status clear|review|flagged|incomplete`; overall = mean of pillars, status = worst-of-two.

**Report** (`app/models/report.py`) — `report_type: financial|narrative|impact|progress|final`; `status: draft → submitted → under_review → accepted | revision_requested`; `revision_history` with snapshots; attachments (doc ids); `ai_analysis`.

---

## 6. End-to-end workflows by persona

### 6.1 Donor / Foundation — create → publish → select → award → oversee

1. **Create (AI-accelerated).** Donor opens the grant wizard (`frontend/src/app/(app)/grants/new/page.tsx`, 6 steps: **Upload Document → Basic Info → Eligibility → Evaluation → Documents → Review & Publish**). Step 0 auto-creates a `draft` grant and, if the donor uploads their call document (pdf/doc/docx/txt, ≤16 MB), `AIService.extract_reporting_requirements` pre-fills reporting requirements and seeds fields — with a deterministic fallback if the model returns nothing (`grants.py:1143-1157`). **[live]** Eligibility categories: geographic, org_type, experience, budget, sector, registration. Criteria are weighted (weights drive reviewer scoring). Donor can save/reuse **criteria templates** (`CriteriaTemplate`).
2. **Publish.** `POST /api/grants/<id>/publish` (`@grant_license_required`) flips `draft → open`, stamps `published_at`, and fans out saved-search alerts, `grant.published` webhooks, and smart-match notifications to NGOs whose sectors/countries fit (`grants.py:691-767`). **[live]**; licence gate **[scaffold]**.
3. **Selection setup.** Donor/admin assigns reviewers — single (`POST /api/reviews/`) or bulk (`/bulk-assign`); assignment flips the application `submitted → under_review` and validates the target is a `reviewer` (`reviews.py:141-182,472`).
4. **Award / reject.** `PATCH /api/applications/<id>/status` (`awarded|rejected`, donor-own-grant/admin), passing the `donor_publish_allowed` licence gate; a win/loss debrief (`decision_reason_code` + narrative) is captured for constructive feedback (`applications.py:1180,1257`).
5. **Oversight.** Donor tracks compliance (Trust Profile + screenings, §8), reviews submitted reports (§9), requests revisions/documents, and — when they hold Build — sees live financials on each grant (§9). Dashboards surface *what needs attention now* (awaiting-decision, stale reviews, SLA breaches, reports due).

### 6.2 NGO applicant — discover → apply → submit → report (the barrier-free path)

1. **Discover.** Faceted `/grants` list (sector/country filters, saved searches, watchlist, express-interest). Smart-match surfaces "new grants matching your sectors."
2. **Apply — AI-guided, offline-capable.** `/apply/[grantId]` (4 steps: **Eligibility → Proposal → Documents → Review**). The NGO experiences:
   - **Guided questions** with inline examples and concept education, not raw fields.
   - **AI drafting** ("draft this answer for me") and **strengthen/polish** on weak responses.
   - **Live rubric preview** — the NGO sees how their answer scores against the donor's criteria *as they write*.
   - **Plain-language compliance flags** — the system checks eligibility/DD readiness and explains gaps in human terms.
   - **Voice input** on any field (`voice-field-input.tsx`) — speak the answer; browser transcribes.
   - **Offline autosave** — the draft PUT is queued in the IndexedDB outbox when offline (`apply/[grantId]/client.tsx:309`, `apiOffline.put`) and replays on reconnect.
3. **Submit.** `POST /api/applications/<id>/submit` (`@role_required('ngo')`): validates all criteria answered + deadline; runs **deterministic auto-scoring** (`ScoringEngine`, sets `ai_score/final_score`); auto-assigns a reviewer panel; emits webhooks (`applications.py:945-1152`). (The NEAR "direct-to-community" hard-gate at submit is **fund-window-only** and does **not** apply to Kuja marketplace grants.)
4. **Post-decision.** On a decision the NGO gets a **constructive why-rejected** debrief and, where enabled, an **appeal** path (`/appeal`). Winners move to reporting.
5. **Report — voice-first.** NGO drafts a report (`POST /api/reports/`), can **speak it** (`POST /api/reports/<id>/structure-from-voice` → `AIService.structure_voice_report` fills the fields), attach **photo evidence**, and submit. An AI **pre-check** flags gaps before submission.

### 6.3 Reviewer — assign → score → complete

1. Reviewer sees their caseload (`my-caseload`, `my-stats`). Opening a review flips `assigned → in_progress`.
2. **Score.** `PUT /api/reviews/<id>` writes per-criterion `scores`; `overall_score` auto-computes as the criterion-weighted mean from the grant's criteria weights (`reviews.py:963-1023`). Inline rubric guidance; private notes (never shown to the NGO).
3. **COI.** Reviewer self-discloses conflict (`POST /api/reviews/<id>/coi-flag`) → hash-chained audit entry + admin notified to reassign; auto-recuse where configured (`reviews.py:882-943`).
4. **Complete.** `POST /api/reviews/<id>/complete`. The donor sees the aggregated, **anonymized** score-breakdown (`ScoreBreakdownService`: per-criterion mean/count/weight, strongest/weakest, `reviewer_count` — reviewer identities never exposed to the NGO).

### 6.4 Platform admin — operate the tenant

- **Provisioning:** users, roles, forced password change, 2FA (TOTP + WebAuthn) — `provision_users.py`, `/settings/security`.
- **Licensing:** grant/revoke donor entitlements (`POST /api/admin/orgs/<id>/license`), audited `org.license.updated`; `license_org.py` CLI. Flip enforcement with `GRANT_LICENSING_ENFORCED` when ready.
- **Compliance oversight:** org screening status search, expiring-screening alerts, adverse-media review.
- **AI quality:** telemetry rollups, false-confidence rate, replay coverage, per-endpoint cost, drift summaries (`/admin/ai-quality`, `/admin/ai-telemetry`, `/admin/ai-cost`).
- **Integrity:** audit-chain dashboard + replay, tenant health, cron health.

---

## 7. AI integration architecture *(the "not a chatbot" pillar)*

This is a **heavily-wired** AI system today, not scaffolding — a real Anthropic SDK path with a consistent *budget-gate → telemetry → provenance → replay* plumbing behind every surface.

### 7.1 Principle
AI is delivered as **many small, embedded, single-purpose surfaces**, each attached to the exact workflow step it serves. A conversational copilot exists as a *complement* (`copilot_service.py` chat-stream; `ai_agent.py` "Ask AI" over a **read-only** DB-query tool registry), but the product's intelligence lives *inside* the tasks. Crucially, the surfaces that **gate money or must be explainable are deliberately deterministic** — AI is advisory around them, never the arbiter.

**Engine layer:** `app/services/ai_service.py` (the `AIService` monolith, ~30 workflow methods) is the central Anthropic client — `_call_claude` (free-text) and `_call_claude_tool` (**forced tool-use against a JSON schema** → the server-side output-validation mechanism). Companions: `copilot_service.py` (typed donor/NGO/reviewer copilot + SSE chat), `ai_chat_service.py` (persisted threads, budget-enforced per turn), `network_ai_service.py` (fund-window surfaces — NEAR-only, not Kuja marketplace). Models: `claude-sonnet-4-6` primary, `claude-haiku-4-5` fast, OpenAI `whisper-1` for transcription. **Every** call gates on `ANTHROPIC_API_KEY`; absent it, each surface falls back to a deterministic template.

### 7.2 Where intelligence lives (LLM vs deterministic — both by design)

**LLM-backed surfaces** (Claude, with provenance + fallback):

| Stage | Surface | Endpoint / service | Persona |
|---|---|---|---|
| Grant creation | **PDF → reporting-requirements extraction** (deterministic fallback) | `POST /api/grants/<id>/upload-grant-doc` → `AIService.extract_reporting_requirements` | Donor |
| Grant creation | Grant scaffold / **suggest criteria** / grant brief / burden + median-NGO preview | `/api/ai/donor-grant-copilot`, `/suggest-criteria`, `/grant-brief`, `/burden-estimate`, `/median-ngo-preview` | Donor |
| Application | **AI-drafts-application** + per-section draft / **strengthen** / **polish** | `/api/ai/draft-application`, `/draft-section`, `/strengthen-section`, `/polish-response`; `application_autofill_service` | NGO |
| Application | **Submission readiness** + **compliance-preempt** (predict at-risk items) | `/api/ai/submission-readiness`, `/compliance-preempt`; `compliance_preemption_service` | NGO |
| Selection | **Summarize application** / reviewer recommendation | `/api/ai/summarize-application`, `/reviewer-summary`, `/reviewer-recommendation` | Reviewer |
| Selection | AI score (**advisory**) + application compare | `/api/ai/score-criterion`, `/score-application`; `application_compare_service` | Reviewer/Donor |
| Compliance | **Adverse-media web check** (Anthropic hosted `web_search` + training-knowledge fallback) | `POST /api/adverse-media/screen` → `adverse_media_service` | Admin/Donor |
| Reporting | **Voice → structured report**, draft report, report readiness, **photo-evidence extraction** | `/api/reports/<id>/structure-from-voice`, `/api/ai/draft-report`, `/report-readiness`, `/api/reports/<id>/photo-evidence` | NGO |
| Reporting | Report **bundle AI summary** | `GET /api/reports/<id>/bundle?with_ai_summary` | Donor |
| Cross-cutting | **On-demand content translation** (user content, distinct from UI `t()`) | `POST /api/translate` → `AIService.translate_text` | All |
| Cross-cutting | Copilot rail (SSE) + portfolio Q&A | `/api/ai/chat-stream`, `/api/donor/portfolio-qa` | Donor/all |

**Deterministic surfaces** — intentionally *not* LLM, for speed, explainability, cost, and defensibility:

| Surface | Why deterministic | Where |
|---|---|---|
| **Application scoring** (the money-gating score) | Reproducible, auditable | `scoring_engine.py`, `score_breakdown_service.py` |
| **Why-this-match** | Rule-based, explainable, cheap | `match_engine.py` |
| **Plain-language compliance flags** | Curated catalogue (what/why/example/how/who-can-help) | `compliance_explainer_service.py` + `lib/compliance-explainers.ts` |
| **Guided questions** (fields-as-questions) | Static label→question mapping | `lib/guided-questions.ts` |
| **Live rubric preview / bands** | Deterministic against criteria weights | `rubric-live-preview.tsx` |

### 7.3 Provenance, grounding, and server-side validation
- **Per-claim provenance.** `AIProvenance` (`app/models/ai_provenance.py`) stores one citation per AI claim — `subject_kind/id/field`, `claim`, `source_kind` (document/application/report/grant/profile/web/ai_general), `source_locator`, `source_excerpt`, and bucketed `confidence` (high/medium/low). Written via `AIService.record_provenance`, read via `GET /api/ai/provenance`. General guidance legitimately has an empty source ref and says so.
- **Per-field extraction tagging.** Every extracted item is tagged `ai_extracted | ai_edited | manual` in the UI (`editable-extraction-list.tsx`) so a human always sees what came from the model and whether they changed it — used by the grant-creation wizard.
- **Server-side output validation.** `_call_claude_tool` forces tool-use so outputs conform to a JSON schema; each surface returns a deterministic fallback dict when the shape is missing; `ai_surface_health.py` contract-checks 8 flagship surfaces against fixtures to catch schema/prompt/model drift.
- **Replayable calls.** `log_replayable_ai_call` (`replay_service.py`) persists full input/output text, tokens, cost, role, and language to `AICallLog`; admins can replay by audit seq or call id (`/api/admin/audit-chain/<seq>/replay`, `/api/admin/ai-calls/<id>/replay`).
- **False-confidence loop.** The frontend records when a user accepted an AI output verbatim and later corrected it (`markFalseConfidence` → `/api/ai-telemetry/false-confidence`); the rollup computes `false_confidence_rate_pct` overall and **per language** — a direct quality signal for the localized surfaces.
- **Honest gap (design item).** There is no single unified registry of *mutating* AI actions. The grant app's equivalents are the read-only query-tool registry (`ai_agent.py` `TOOLS`), `AIProvenance`, and extraction tagging. A closed **action catalogue for any AI-proposed mutation** is a recommended hardening (§13, Phase 5) so the model can never invent a state-changing step.

### 7.4 Cost, reliability, and degradation
- **Hard per-org budget.** `ai_budget_service.enforce_budget` runs *inside* `_call_claude`; on `BudgetExceededError` it logs `AI_BUDGET_SKIP`, records a skipped row, and returns `None` → the surface degrades to its deterministic template. `ai_monthly_budget_usd` NULL = unlimited. Endpoints `/api/ai-budget/me`, `/admin/spend`.
- **Soft thresholds.** `cost_ceiling_service` fires notifications at 75/90/100% month-to-date (24h dedup) from the logging path.
- **Graceful degradation everywhere.** Missing key, over-budget, timeout, malformed output, or a per-user concurrency cap all shed to deterministic templates/fallback dicts; heavy calls offload async (`ai_jobs.py` → `202 + job_id`, polled at `/api/ai/jobs/<id>`); per-call timeouts + `AI_STALLED` logging.
- **Service-status aware.** `GET /api/ai/service-status` returns `ok | no_key | no_sdk` (60s cache); the UI shows a truthful `ai-fallback-notice` / `ai-status-notice` and the workflow always keeps a non-AI path (type instead of speak, manual criteria instead of extraction).
- **Telemetry.** `AICallLog` + `_record_call` back the admin rollups (`/api/admin/ai-telemetry`, `/ai-quality-rollup`, `/ai-cost-by-tenant`, `/ai-cost-by-user`, `/feature-usage`) and ~20 dashboard stat cards.
- **Model discipline.** Model ids are centralized in the service layer (a prior incident hard-fixed invalid ids across production files) so they cannot drift per-call.

---

## 8. Compliance & Trust

**Due-diligence engine (Trust seam).** The Grant app synthesizes a two-pillar **Trust Profile** (`TrustProfileService.build`, **[live, local]**): Capacity (framework-based, weights sum 100) + Due Diligence (registration + sanctions/PEP + adverse-media + bank verification + beneficial ownership). The read is routed through `trust_engine.get_trust_profile()` (`trust_routes.py:57`), which defaults to the **local** engine; `remote`/`shadow` modes call the standalone Kuja Trust app and are **[scaffold]** (env `KUJA_TRUST_ENGINE` + `KUJA_TRUST_*` creds), tenant-guarded so **only the Kuja tenant** can ever go remote. *Doc note:* the `trust_engine.py` module docstring ("nothing imports this module yet") is stale and corrected in this cycle.

**Screening (`ComplianceService.screen_organization`, [live]):** OpenSanctions primary (UN/OFAC/EU/World Bank) with direct-download fallbacks; **SAM.gov exclusions** **[scaffold-until-key]** (`SAM_GOV_API_KEY`); keyword + registration-format + personnel screening; **adverse-media** via Anthropic web search.

**Surfacing.** Compliance status appears on the org and on each application (`/api/applications/<id>/trust-profile-readiness`), and drives the plain-language compliance flags the NGO sees while applying (§6.2).

**Portable trust.** The two-pillar profile is portable — an NGO's assessment travels across grants (and, with Trust as the shared engine, across the platform). A public share page exists for the passport.

---

## 9. Financials & reporting — *with our ERP and without it*

This is the requirement to serve **both** kinds of donor: those who buy Kuja Build (ERP) and those who don't.

### 9.1 The `financial_source` abstraction
Every grant carries `financial_source = erp | manual` (+ `build_ref`, `financial_synced_at`). The read endpoint `GET /api/grants/<id>/financials` returns one **normalized shape** regardless of source (`build_engine.get_grant_financials`, **[live abstraction]**):

| `financial_source` | Behavior | `status` |
|---|---|---|
| `manual` (default) | Empty/manual shape; figures entered in the Grant app | `manual` |
| `erp`, Build not configured | Degrades to manual/empty | `erp_unconfigured` |
| `erp`, Build configured | Pulls live budget/actuals/disbursements by `build_ref` | `erp` |
| `erp`, Build error | Degrades, never raises | `erp_unavailable:*` |

Normalized shape: `{ source, build_ref, currency, budget_lines[], actuals[], disbursements[], last_synced_at }`. **Isolation by record** — the feed is keyed only by the grant's stored `build_ref`, never a request value, so a donor only ever sees the grant their org owns.

**With ERP:** compliance and reporting run against **real-time** financials — budget vs actuals vs disbursements flow from Build, so a donor can see spend against plan and a report can be auto-reconciled. **Without ERP:** the same surfaces run on **manually entered / uploaded** figures; compliance and reporting are unchanged in shape — the NGO uploads reports and the donor reviews them. The single pending piece is the concrete Build finance call (`build_client.py:63`, `build_api_pending`); everything up- and down-stream is built and inert-safe. The admin operator maps a grant to its Build account via `BuildFinancialSourceCard` on the grant detail page.

### 9.2 Reporting pipeline
Reporting requirements + frequency live on the grant (extracted at creation, §6.1). NGO reports (`Report`, `draft → submitted → under_review → accepted | revision_requested`) support **voice structuring**, **photo evidence**, and an **AI pre-check**; the donor reviews and accepts or requests revision. A **report bundle** assembles the report + attachments + an AI summary, publishes it with an audit-chain anchor, and exports a **PDF** (`report_bundle_routes.py`). Where the grant is `financial_source=erp`, the bundle can incorporate live financials; where `manual`, it uses the submitted figures.

---

## 10. Integration seams (detailed)

### 10.1 Link → Grant (SSO + entitlements) — **[scaffold]**
- **Today:** identity column `kuja_partner_id` only; sign-in is **local email/password** (`auth.py:195`) with brute-force lockout + rate limiting. No OIDC/SSO, no inbound Odoo webhook.
- **Target:** Odoo as OIDC IdP; on first SSO login the Grant user is provisioned and linked to `res.partner`. Entitlements (`grant_licensed`, `has_kuja_build`, tier, expiry) are driven by a **Link → Grant billing webhook** (inbound endpoint **[to build]**), with the admin API/CLI as the manual fallback. Since some donors are already Link members, SSO is the lowest-friction onboarding path.

### 10.2 Grant → Trust (one due-diligence engine) — **[live local / scaffold remote]**
- **Today:** the Trust-Profile read is served through `trust_engine` in **local** mode; remote/shadow are env-gated and **tenant-guarded to Kuja only**.
- **Target:** flip `KUJA_TRUST_ENGINE` to `shadow` (compare) then `remote` once the org **identity backfill** (map `res.partner` ↔ grant org) lands, then retire the local DD fork so Trust is the single engine. Service-credential auth (`KUJA_TRUST_SERVICE_TOKEN`), org keyed by `kuja_partner_id`.

### 10.3 Build → Grant (ERP financials — the upsell) — **[scaffold, one call pending]**
- **Today:** `financial_source`/`build_ref` model, `BuildClient` + `build_engine` + endpoints + operator UI are all live and inert-safe; the concrete finance call is stubbed (`build_api_pending`).
- **Target:** with the dev-team finance-API contract (endpoint + read-only service account + sample payload + `build_ref` mapping), fill the one call and set `KUJA_BUILD_*`. `has_kuja_build` is the donor-level entitlement that turns this on.

---

## 11. Cross-cutting foundations

### 11.1 Offline-first / low-bandwidth — **[live infra, narrow adoption]**
- Custom service worker (`frontend/public/sw.js`, cache `kuja-v15-0`): navigations network-first (cached shell fallback), `/_next/static/*` cache-first, whitelisted GET `/api/*` stale-while-revalidate.
- IndexedDB outbox (`frontend/src/lib/offline-outbox.ts`) + `apiOffline` wrapper + auto-drain (online event, SW message, Background Sync) + banner/queue UI.
- **Gap [to build]:** only 2 write surfaces adopt `apiOffline` (apply-autosave + a Proximate surface). Target: bring the NGO's critical writes — **application submit, report create/submit, document intent** — under the offline outbox.
- Static export (`output:'export'`, `images:unoptimized`) removes SSR round-trips; GET retry/backoff smooths flaky links.

### 11.2 Localization (FR / AR / ES / SW / SO + EN) — **[live, gaps]**
- 6 full locale catalogues (`frontend/src/i18n/`), `translate()` fallback target→en→key, per-user language wins over tenant default (`en`), Arabic RTL.
- **Coverage today:** ar ~99.5%; so/sw ~93.7%; es ~93.2%; fr ~91.5% (each carries a few hundred English-fallback strings).
- **Gaps [to build]:** (a) finish fr/es/sw/so coverage; (b) three surfaces bypass `t()` and are hardcoded English — the **Build operator card**, the **voice report composer**, and the **offline queue panel**; (c) integration-seam route error bodies ship English-only while the client expects a localized `message`. Server-generated titles/labels should emit `title_key` + params with an English fallback, and be verified in-language in a browser.

### 11.3 Security, RBAC, audit
- Server-side enforcement only (static export = no client route auth); deny-by-default; object-level ownership checks; licence gate fails **closed**.
- 2FA (TOTP + WebAuthn), forced password rotation, brute-force lockout.
- Hash-chained, tenant-scoped audit log for governance actions; full JSONL export; replayable AI calls.

---

## 12. Current state → target (capability matrix)

| Capability | State | Notes |
|---|---|---|
| Grant CRUD / publish / duplicate / templates | **live** | 6-step wizard + PDF→AI extraction |
| Application draft→submit→award, revision, withdraw, appeal | **live** | deterministic auto-score at submit |
| Reviewer assign / weighted score / COI / anonymized breakdown | **live** | Review row = assignment |
| Compliance screening (OpenSanctions + fallbacks, adverse-media) | **live** | SAM.gov **scaffold** (needs key) |
| Trust Profile (two-pillar, local) via `trust_engine` | **live (local)** | remote/shadow scaffold, Kuja-only guard |
| Reporting (draft→accept, voice, photo, bundle, PDF) | **live** | |
| `financial_source` abstraction + operator mapping UI | **live** | ERP feed **scaffold** (`build_api_pending`) |
| Offline SW + outbox infra | **live** | adoption narrow (2 surfaces) |
| i18n 6 locales + RTL | **live** | fr/es/sw/so coverage + 3 hardcoded surfaces to fix |
| AI surfaces (draft, strengthen, rubric, compliance flags, summarize, voice, translate) | **live** | provenance + server-validation live |
| AI cost budget / telemetry / replay / degradation | **live** | |
| **Link SSO + inbound billing webhook** | **to build / scaffold** | identity column only today |
| **Trust remote cutover** | **scaffold** | gated on identity backfill |
| **Build ERP finance call** | **scaffold** | gated on dev-team API contract |
| **Grant financials NGO/donor view** | **to build** | this cycle: read-only financials panel (§13) |
| **Offline coverage for submit/report writes** | **to build** | |
| **Localization completion + t() gaps** | **to build** | |

---

## 13. Phased implementation roadmap

**Phase 0 — this cycle (shipped/shipping, Kuja-scoped, inert-safe):**
- Trust tenant-guard (only `kuja` → remote); correct the stale `trust_engine` docstring.
- Licensing "upgrade required" prompt (reactive, enforcement-off-safe).
- Build operator mapping UI on grant detail.
- **Grant financials panel** — a donor/admin read-only view on the grant that renders the normalized financials (ERP feed *or* manual/empty), making the with/without-ERP design tangible. *(Included in this cycle.)*

**Phase 1 — identity & entitlements (Link):** inbound Link→Grant billing webhook (drive `grant_licensed`/`has_kuja_build`); OIDC SSO login + `res.partner` linking; then licence provisioning + flip `GRANT_LICENSING_ENFORCED`.

**Phase 2 — Trust as the single engine:** org identity backfill → `KUJA_TRUST_ENGINE=shadow` → `remote` → retire the local DD fork.

**Phase 3 — Build ERP financials live:** fill the `build_client` finance call to the dev-team contract; set `KUJA_BUILD_*`; wire live financials into the reporting bundle + compliance.

**Phase 4 — barrier-free depth:** extend offline outbox to application-submit + report writes; complete fr/es/sw/so localization + fix the 3 hardcoded-English surfaces + localize seam error bodies; broaden voice/photo affordances; Whisper server transcription (`WHISPER_API_KEY`) for Somali (unsupported in browser Web Speech).

**Phase 5 — AI depth:** expand embedded surfaces + provenance coverage; per-surface accept/edit/dismiss analytics into a quality loop.

---

## 14. What we need / open questions

- **Link:** OIDC IdP details + the billing→entitlement webhook contract (events, payload, signing) + the Link test env; confirmation of which donors are already Link members (SSO onboarding candidates).
- **Trust:** the org identity backfill (map `res.partner` ↔ grant org).
- **Build:** the finance API contract — endpoint, read-only service account, one sample payload (sign/currency/FX semantics), and the grant↔analytic-account (`build_ref`) mapping + freshness model.
- **Licensing:** which donor orgs to license first, and the go-live date to flip enforcement.
- **Localization:** native reviewers for fr/es/sw/so sign-off.

---

## Appendix A — key endpoints (Kuja tenant)

- Grants: `POST/PUT/DELETE /api/grants`, `POST /api/grants/<id>/publish|withdraw|duplicate|upload-grant-doc`, `GET/POST /api/grants/criteria-templates`.
- Applications: `POST/PUT /api/applications`, `POST /api/applications/<id>/submit|withdraw|request-revision|appeal|star`, `PATCH /api/applications/<id>/status`, `GET /api/applications/<id>/score-breakdown|trust-profile-readiness`.
- Reviews: `POST /api/reviews`, `POST /api/reviews/bulk-assign`, `PUT /api/reviews/<id>`, `POST /api/reviews/<id>/complete|decline|snooze|coi-flag`.
- Compliance/Trust: `GET /api/compliance/<org_id>`, `POST /api/compliance/screen`, `GET /api/trust-*`, `GET /api/admin/trust-engine/status`.
- Reporting: `POST/PUT /api/reports`, `POST /api/reports/<id>/submit|precheck|structure-from-voice|photo-evidence|review`, `GET /api/reports/<id>/bundle|bundle.pdf`.
- Financials: `GET /api/grants/<id>/financials`, `POST /api/grants/<id>/financial-source`, `GET /api/admin/build/status`.
- Licensing: `GET /api/admin/licensing/status`, `GET /api/admin/orgs/licenses`, `POST /api/admin/orgs/<id>/license`.

## Appendix B — data shapes

- **Financials:** `{ source: 'erp'|'manual', build_ref, currency, budget_lines[], actuals[], disbursements[], last_synced_at, status }`.
- **Score-breakdown:** `{ criteria_breakdown[], overall_human_score, overall_human_score_computed, reviewer_count, strongest_criteria[], weakest_criteria[] }` (reviewer identities never exposed).
- **Trust Profile:** `{ overall: { score, status }, capacity: { score, status, … }, diligence: { score, status, … } }`.
