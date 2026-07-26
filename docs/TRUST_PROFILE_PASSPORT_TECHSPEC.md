# Portable Trust Profile & Capacity Passport — Feature & Technical Specification (as-is)

**Status:** Documentation of the feature as it exists in the Kuja Grant Management System, production build `f54ec732e` (`proximate.kuja.org` / `kuja.org`), 25 July 2026.
**Purpose:** Baseline for spinning the feature out as a standalone product. This describes *what is built today* — not an aspiration. Where something is thin or unproven, it says so.
**Companion references:** Charter for Change (C4C) Due Diligence Passporting Tool (attached `C4C-Passporting-Tool_12Dec24-upload.xlsx`); Humentum DD passporting model (<https://humentum.org/due-diligence-passporting/>). Their relationship to this feature is in §4.

---

## 1. Executive summary

An NGO completes its capacity assessment and due diligence **once**. Kuja assembles that scattered evidence into a single, defensible **Trust Profile**, freezes it into a shareable, tamper-evident **Capacity Passport**, and — optionally — issues it as a **W3C Verifiable Credential** the NGO can carry off-platform and present to any funder, on Kuja or not. Every time a donor verifies it, the event is written to a hash-chained audit log the NGO can point back to.

The problem it attacks: NGOs re-prove the same capacity and compliance facts to every donor, spending weeks per major application; each donor portal is a fresh information silo. The passport pattern inverts this — **verified once, accepted by many**. This is the same problem the Charter for Change consortium built its Excel passporting tool to solve; Kuja's implementation is a live, cryptographically-verifiable system rather than a signed spreadsheet.

Three layers, each usable on its own:

| Layer | What it is | Consumer |
|---|---|---|
| **Trust Profile** | Read-only synthesis of all capacity + due-diligence evidence into two pillars and one composite score | Donors/reviewers inside the platform |
| **Capacity Passport** | A frozen, hashed snapshot of a Trust Profile with a shareable slug + token; publish / share / verify / revoke lifecycle | Donors *outside* the donor portal — token link or public page |
| **Verifiable Credential** | An Ed25519-signed W3C VC over the passport, resolvable via `did:web`, revocable via StatusList2021 | Any third party, fully off-platform, no Kuja round-trip |

---

## 2. Concept model

### 2.1 The two pillars

**CAPACITY PROFILE — "what the NGO can do."** Up to five framework assessments, each scored 0–100, combined into a weighted composite.

**DUE DILIGENCE PROFILE — "whether the NGO is safe to fund."** Six components (registration, sanctions, PEP, adverse media, bank verification, beneficial ownership), each scored and weighted.

**OVERALL / composite trust** = the average of the two pillar scores. The **status** is the **worst** of the two pillars, reconciled against the composite score band so a strong capacity score can never mask a flagged due-diligence pillar (this reconciliation was a real production bug fix — see §6.3).

### 2.2 The passport

A published passport is an immutable snapshot: it copies the entire Trust Profile at publish time, computes a SHA-256 over the canonicalised JSON (`snapshot_hash`), and mints a URL-safe `slug` (~96 bits entropy) plus an opaque `share_token` (~192 bits). The NGO controls expiry and revocation. One active passport per org at a time (a new publish supersedes and revokes the previous one) so verification is deterministic.

### 2.3 The verifiable credential

The optional VC layer wraps the passport's headline scores in a W3C VC-JSON-LD object, signs it with the platform's Ed25519 key, and makes it verifiable by anyone who can resolve the platform's `did:web` document — with no call back to Kuja required. Revocation rides on a StatusList2021 bitstring.

---

## 3. Data model

All tables are SQLAlchemy models in `app/models/`. SQLite in dev, Postgres in prod. JSON payloads are stored as `Text` and (de)serialised via `_json_load` / `_json_dump` helpers.

### 3.1 `assessments` — capacity assessments (`app/models/assessment.py`)

| Column | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `org_id` | FK → organizations | indexed |
| `assess_type` | str(50) | `free` / `paid` |
| `framework` | str(50) | `kuja`, `step`, `un_hact`, `chs`, `nupas` |
| `status` | str(50) | `draft` / `in_progress` / `completed` |
| `overall_score` | float | 0–100, nullable until scored |
| `category_scores` | Text (JSON dict) | per-category sub-scores |
| `checklist_responses` | Text (JSON dict) | raw question answers |
| `gaps` | Text (JSON array) | identified gaps; items may be strings or `{category, score, description}` dicts |
| `completed_at`, `created_at`, `updated_at` | datetime | |

Documents attach to an assessment (`Document.assessment` backref, cascade delete).

### 3.2 `compliance_checks` — sanctions / PEP / keyword screening (`app/models/compliance.py`)

| Column | Type | Notes |
|---|---|---|
| `check_type` | str(50) | `sanctions_un`, `sanctions_ofac`, `sanctions_eu`, `blacklist`, `registration`, `sanctions_personnel`, `pep_screening`, `keyword_screening` |
| `status` | str(50) | `clear` / `flagged` / `pending` / `error` |
| `result` | Text (JSON) | matched entities, list name, scores |
| `checked_at`, `updated_at` | datetime | composite index on `(org_id, checked_at)` |

### 3.3 `registration_verifications` (`app/models/compliance.py`)

Legal-registration status: `unverified` / `pending` / `ai_reviewed` / `verified` / `flagged` / `expired`. Carries `registration_number`, `registration_authority`, `registry_check_result` (JSON of a live registry lookup), `registration_date`, `expiry_date`, `country`, `ai_analysis` (JSON) + `ai_confidence` (0–100), `registry_url`, and human verification fields (`verified_by_user_id`, `verified_at`, `notes`).

### 3.4 `capacity_passports` — the passport itself (`app/models/capacity_passport.py`)

| Column | Type | Notes |
|---|---|---|
| `id` | int PK | Also the StatusList2021 bit index |
| `org_id` | FK → organizations | indexed |
| `slug` | str(32) unique | `secrets.token_urlsafe(16)` → 22 chars, ~96 bits |
| `share_token` | str(64) | `secrets.token_urlsafe(24)` → 32 chars, ~192 bits; the shared secret |
| `snapshot_json` | Text | frozen full Trust Profile at publish time |
| `snapshot_hash` | str(64) | SHA-256 of canonical snapshot (`sort_keys`, `separators=(',',':')`) |
| `status` | str(16) | `draft` / `active` / `revoked` / `expired` |
| `expires_at`, `revoked_at`, `revoked_reason` | | NULL expiry = no expiry |
| `verification_count`, `last_verified_at` | | incremented on each token-valid view |
| `published_by_user_id`, `published_at`, `created_at`, `updated_at` | | |

Key methods: `generate_slug()`, `generate_share_token()`, `compute_snapshot_hash()`, `is_active()`, `share_url()`, `to_dict(include_token=…)`.

### 3.5 Supporting screening tables

- `AdverseMediaScreening` — `app/models/` (results of the AI adverse-media runs; `source` ∈ `anthropic_web_search` / `claude_training_knowledge`).
- `BankAccountVerification` — `app/models/bank_verification.py` (bank/account checks, risk score).
- `AuditChainEntry` — the tamper-evident hash chain; every passport/VC event appends here (see §10).

---

## 4. Relationship to the recognised models (C4C / Humentum)

The user is right to benchmark against these — they define the *domain vocabulary donors already accept*.

### 4.1 What C4C / Humentum are

- **Charter for Change (C4C) Due Diligence Passporting Tool** — a free multi-tab Excel workbook built by **seven INGOs** (CAFOD, Christian Aid, CRS, Kerk in Actie, SCIAF, Trócaire, Tearfund) with Humentum, drawing on CHS Alliance, HQAI and Start Network prior work. A **Passporting Organization** assesses a **Partner Organization** across seven domains, rates each question **1–4** (1 = high risk, 4 = low risk / exceeds), records comments + "Agreed Areas of Organizational Strengthening", **both parties sign**, and consent to share with future funders (**Receiving Organizations**).
- **Humentum three-step model** — (1) passporting org does the due diligence; (2) the completed tool is handed to the receiving org; (3) the receiving org does *reduced* additional DD only where a specific area needs it.

### 4.2 The C4C domain taxonomy (from the attached workbook)

| C4C tab | Questions | Domain |
|---|---|---|
| General | 1–5 | Identity, prior assessments, contacts, funding history, geographic capacity |
| Governance | 6–8 | Registration, legal/tax compliance, board, governance docs, internal control |
| Strategy | 9–10 | Strategic plan, annual work plan + budget, financial solvency outlook |
| Accountability | 11–13 | Complaints/whistleblowing, data protection, third-party (sub-recipient) risk |
| HR, Safeguarding & Security | 14–18 | Org structure, HR policy, code of conduct, safe recruitment, safeguarding, security |
| Financial & Asset Mgmt | 19–25 | Financial statements + audit, finance policy, finance team, procurement, asset register… |
| Data & IT | 26 | Data protection & IT systems |
| Additional / Signatures / Document Checklist | 27+ | Extensible criteria, mutual sign-off, evidence list |

### 4.3 How Kuja maps — and where it is ahead / behind

| Dimension | C4C tool | Kuja today |
|---|---|---|
| Assessment substance | 7 domains, 1–4 rating, human judgement | 5 frameworks (Kuja/STEP/UN-HACT/CHS/NUPAS), 0–100 scoring, category sub-scores + gaps |
| Who assesses | Passporting org assesses partner | NGO self-assesses; DD run by the platform/donor; **no third-party "passporting org" role yet** |
| Due diligence | Manual, evidence-in-comments | **Automated** — live sanctions (OpenSanctions → UN/OFAC/EU/World Bank + SAM.gov), AI adverse media, registration + bank checks |
| Artifact | Signed Excel file, emailed | Live snapshot + **SHA-256 hash + share token + public page + signed VC** |
| Reuse / sharing | Manual consent + file forwarding | Slug/token link, public share page, off-platform VC |
| Verification | Trust the signed file | **Cryptographic** (`did:web` + Ed25519) + **tamper-evident audit chain** of every verification event |
| Revocation / freshness | None (static file) | `revoked` / `expired` status + StatusList2021 bit + expiry dates |
| Consortium recognition | **Yes** — recognised by C4C signatories | **No** — Kuja's frameworks are not the C4C taxonomy |

**The strategic gap for the standalone product:** Kuja is technically far ahead (automated DD, cryptographic verification, audit chain) but its *content model is not the one INGOs already recognise*. The single highest-leverage move for a standalone tool is to **support the C4C domain taxonomy and 1–4 rubric as a first-class framework** (alongside or instead of the current five) and to add the **"assessing organization" role** and **mutual sign-off / consent-to-share** mechanic. That combination — C4C-recognised content *plus* Kuja's verification machinery — is the differentiated wedge. See §16.

---

## 5. Scoring engine (`app/services/trust_profile_service.py`)

`TrustProfileService.build(org_id)` is a **read-only, deterministic** assembler — it introduces no schema, it synthesises existing rows. Returns `None` if the org is missing.

### 5.1 Capacity pillar weights

```
FRAMEWORK_WEIGHTS = { kuja: 30, step: 20, un_hact: 20, chs: 15, nupas: 15 }   # sum 100
```

For each framework it takes the **latest** completed assessment, weights its `overall_score`, and normalises over the weights actually used (so a partial profile isn't penalised as if missing frameworks scored zero). It also computes `completion_pct`, `frameworks_completed`, and extracts **top-3 strengths** (highest `category_scores`) and **top-3 gaps** (from the `gaps` array, with human-readable composition when a gap is a raw dict).

### 5.2 Due-diligence pillar weights

```
DD_WEIGHTS = { registration: 25, sanctions: 25, pep: 15, adverse_media: 20, bank: 10, ownership: 5 }   # sum 100
```

Each component returns `{label, score, status, last_updated, evidence_url}`. Beneficial ownership is a proxy (presence/age of an uploaded "ownership" document).

### 5.3 Status logic and the reconciliation rule

Per-pillar status bands: `< 40 → flagged`, `< 70 → review`, `≥ 70 → clear`; zero completed inputs → `incomplete`.

The **overall status is the worst of {capacity status, diligence status, composite-score band}**, using the order `['flagged','review','incomplete','clear']` and `min(key=order.index)`. This exists because of two production bugs worth carrying forward as design constraints:

1. `max(..., key=order.index)` originally selected the **best** status, letting "Clear" survive a 28/100 flagged due-diligence pillar. Fixed to `min`.
2. Score and status were computed independently, so a banner could read "Due Diligence 28/100 · Clear". Fixed by folding the composite **score band** into the same `min`, so the banner can never claim Clear below 70 overall.

**Design rule for the rebuild:** score and displayed status must be derived from one reconciled computation, and a safety pillar must never be overridable by a capacity pillar.

### 5.4 Output shape

```json
{
  "org_id": 12, "org_name": "…", "country": "…", "sector": "…",
  "verified_badge": false,
  "overall":   { "score": 78, "status": "review", "computed_at": "…" },
  "capacity":  { "score": 82, "status": "clear", "completion_pct": 60,
                 "frameworks_completed": 3, "frameworks_total": 5,
                 "breakdown": [ … per framework … ],
                 "strengths": ["financial (88/100)", …], "gaps": [ … ] },
  "diligence": { "score": 74, "status": "review",
                 "breakdown": [ {registration}, {sanctions}, {pep},
                                {adverse_media}, {bank}, {ownership} ] }
}
```

---

## 6. Due-diligence sources (as wired today)

- **Sanctions / PEP** — `app/services/compliance_service.py`. Primary: **OpenSanctions API** (unified UN / OFAC / EU / World Bank), `OPENSANCTIONS_API_KEY`. Fallback: direct list download + parse (UN consolidated XML, OFAC SDN CSV, EU CSV). Plus **SAM.gov Exclusions** (US federal debarment), `SAM_GOV_API_KEY`.
- **Adverse media** — `app/services/adverse_media_service.py`. Layer 1: Anthropic hosted `web_search` tool (Claude runs 2–5 targeted searches, returns structured findings via forced tool-use). Layer 2 (fallback): Claude training-knowledge, clearly labelled `source='claude_training_knowledge'`. Toggle `ANTHROPIC_WEB_SEARCH`.
- **Registration** — live registry check + AI analysis with a confidence score, human override.
- **Bank verification** — `app/services/bank_verification_service.py` (risk-scored; **0 rows in prod today** — built, not exercised).

---

## 7. Passport lifecycle (`app/services/capacity_passport_service.py`)

### 7.1 Publish

`publish(org_id, user, expires_at=None)` → snapshots the current Trust Profile, wraps it with `passport_meta`, revokes any existing active passport (one-active policy), mints slug + token, computes hash, commits, and **appends a `capacity_passport.publish` audit-chain entry** carrying the snapshot hash and headline scores. The `share_token` is returned **only** on the publish response.

### 7.2 Verify (token-gated)

`verify(slug, token, verifier_label=None)` → looks up by slug, **constant-time** token compare (`secrets.compare_digest`), rejects `revoked` / `expired` (auto-marking expired on the fly) / non-active. On success: increments `verification_count`, stamps `last_verified_at`, appends a `capacity_passport.verify` audit entry (with an optional free-text `verifier_label` identifying the donor — audit clarity only, not security), and returns the snapshot **without** the token.

### 7.3 Revoke

`revoke(passport_id, user, reason)` → sets `revoked`, stamps reason, appends `capacity_passport.revoke`. Idempotent.

### 7.4 Public (no-token) share

The Wave-4 public page reads `/api/passport/share/<slug>` (no token) and renders the snapshot read-only; a revoked/expired passport returns **410 Gone**. The token-bearing `/trust/verify` path remains the "who verified" audit surface.

---

## 8. Verifiable Credentials layer (`app/services/vc_service.py`, `app/routes/credentials_routes.py`)

Phase 100. Deliberately simple and interoperable.

- **Suite:** `Ed25519Signature2020`, JWS-style `proofValue` (multibase base58btc). Signature is over `SHA-256(canonical_json(vc))`.
- **Canonicalization (published for third-party verifiers):** `json.dumps(obj, sort_keys=True, separators=(',',':'), ensure_ascii=False).encode('utf-8')` — RFC-8259 with sorted keys, no whitespace. *Not* full JCS-RDF; the flat JSON-LD shape doesn't need it.
- **Issuer DID:** `did:web`, document at `/.well-known/did.json` under `KUJA_PUBLIC_HOST`. Public key in `Ed25519VerificationKey2020` shape, referenced by every VC's `proof.verificationMethod`.
- **Key storage:** `KUJA_VC_SIGNING_KEY_HEX` (32-byte Ed25519 private key, hex). If unset, a key is generated on boot with a logged warning — **fine for dev, must be set in prod**.
- **Revocation:** StatusList2021 at `/api/credentials/status-list/2021`; bit index *i* = `CapacityPassport.id`; bit 1 = revoked.
- **Credential subject:** org name/country/type, `capacityScore`, `diligenceScore`, `compositeScore`, per-pillar scores, and `snapshotHash` (ties the VC back to the exact passport snapshot).
- **JSON-LD context:** hosted at `/.well-known/kuja-vc-context.jsonld` for the Kuja-specific terms.

`verify_credential(vc)` returns `{valid, issuer_matches, signature_valid, status_active, expired, errors[]}` and **only accepts credentials from this issuer's `did:web`** (a fork re-derives against its own DID).

---

## 9. API reference

**Trust / passport** (`app/routes/trust_routes.py`, prefix `/api`):

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/trust-profile/<org_id>` | login | Unified two-pillar Trust Profile |
| GET | `/trust-profile/<org_id>/gap-insights` | login | AI-narrated gap analysis (cached 30 min) |
| GET | `/adverse-media/<org_id>` | login | List past screenings |
| POST | `/adverse-media/screen` | login | Run a screening |
| GET | `/bank-verification/<org_id>` | login | List verifications |
| POST | `/bank-verification/verify` | login | Run a bank verification |
| POST | `/passport/publish` | login (own org / admin) | Publish a passport; returns token once |
| GET | `/passport/<org_id>` | login | List an org's passports |
| POST | `/passport/<passport_id>/revoke` | login | Revoke |
| GET | `/passport/share/<slug>` | **public** | Public snapshot (410 if revoked/expired) |
| GET | `/passport/verify/<slug>?t=<token>` | **public, token** | Token-gated verification (logs event) |

**Verifiable Credentials** (`app/routes/credentials_routes.py`):

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/.well-known/did.json` | public | Issuer DID document |
| GET | `/.well-known/kuja-vc-context.jsonld` | public | JSON-LD context |
| GET | `/api/passport/<id>/vc` | owner / admin | Download the signed VC |
| GET | `/api/credentials/status-list/2021` | public | StatusList2021 revocation list |
| POST | `/api/credentials/verify` | public, CORS-safe | Verify any Kuja-issued VC |
| GET | `/api/credentials/verifier-howto` | public | Offline-verification instructions |

---

## 10. Audit chain / tamper-evidence

`AuditChainEntry.append(action, actor_email, subject_kind, subject_id, details)` writes a hash-chained row (each entry links to the previous by hash; altering one breaks the chain visibly). Every passport `publish` / `verify` / `revoke` and VC event lands here. This is what lets an NGO answer "who verified my passport, and when?" and lets a donor's later challenge ("did this verification actually happen?") be settled by replaying the chain. The chain is per-tenant scoped.

---

## 11. Frontend surfaces (Next.js 14 static export)

- **`/trust`** (authenticated, NGO's own org) — `frontend/src/app/(app)/trust/page.tsx`. Mounts: `RegistrationPanel`, `TrustProfileCard`, `TrustGapInsightsCard`, `AdverseMediaPanel`, `BankVerificationPanel`, `CapacityPassportPanel`. Data via `frontend/src/lib/trust-api.ts`.
- **`/trust/share/[slug]`** — public, unauthenticated, no token (Wave 4). Renders the snapshot; shows a "revoked/expired" state on 410.
- **`/trust/verify?s=<slug>&t=<token>`** — public, token-bearing; calls `/api/passport/verify/<slug>?t=…`, renders the verified snapshot, and is the audited path.
- **Dashboard cards** — `trust-completeness-card`, `trust-share-card`, `stale-trust-profiles-stat`; plus `trust-portable-badge`, `trust-gap-insights-card`, and per-component panels (`adverse-media-panel`, `bank-verification-panel`, `registration-panel`, `evidence-panel`, `audit-timeline`, `typed-confirm`).

Because the frontend is statically exported, share/verify use **query-param** routes (`/trust/verify/?s=…&t=…`) rather than dynamic path segments.

---

## 12. AI surfaces in the feature

- **Trust Gap Insights** (Phase 18A) — `trust_gap_insights_service.py`; AI narrates the gaps and estimates the score **lift** per remediation action (`estimated_lift_points`, `effort`, `projected_overall`), cached 30 min.
- **Adverse media** — Claude web-search + fallback (§6).
- **Registration** — AI analysis + confidence on the uploaded registration doc.
- **Compliance explainer / coach** — plain-language explanation of flags (`compliance_explainer_service.py`, `compliance_preemption_service.py`, `compliance_rerun_service.py`).

Runtime models: `claude-sonnet-4-6` (primary), `claude-haiku-4-5` (cheap paths). All AI calls are logged for replay + per-org USD budget gating via the platform's `ai_service.py` governance layer.

---

## 13. Multi-tenancy / white-label

The capacity framework label is **network-aware**: on a non-default tenant with `Network.assessment_framework_display` set, the in-house `kuja` framework renders under the tenant's name (e.g. "NEAR Capacity Framework"). External standards (STEP, UN-HACT, CHS, NUPAS) keep their names. The whole feature already runs under host-based tenant resolution, so a standalone product could be a tenant, a fork, or a re-host of the same services.

---

## 14. Current production adoption (honest baseline)

Measured on prod, 25 July 2026:

| Metric | Count |
|---|---|
| Organizations | 15 |
| Assessments | 35 (kuja 21, step 5, un_hact 4, chs 3, nupas 2) |
| Compliance checks | 34 |
| Registration verifications | 22 |
| Adverse-media screenings | 5 |
| Bank verifications | **0** |
| **Published passports** | **1** (1 active) |
| **Passport verification events** | **1** |

**Read this plainly:** the *machinery* is complete and demonstrated end-to-end, but real-world usage of the passport/VC layer is nascent — effectively a working reference implementation, not a validated market behaviour. That is precisely the case for extracting and marketing it deliberately rather than leaving it as a sub-feature.

---

## 15. Known limitations / gaps (carry into the rebuild)

1. **No independent-assessor model.** Everything is self-assessment + platform/donor DD. C4C's whole premise is a *trusted assessing organization*; Kuja has no such role, no mutual sign-off, and no consent-to-share artifact.
2. **Content ≠ recognised taxonomy.** The five frameworks are not the C4C domain set INGOs accept. Recognition is a go-to-market blocker, not a technical one.
3. **Beneficial ownership is a proxy** (document presence), not structured UBO data.
4. **Bank verification unused** (0 rows) — unproven in practice.
5. **VC signing key** must be provisioned in prod (`KUJA_VC_SIGNING_KEY_HEX`); on a fresh host it silently self-generates.
6. **Snapshot is point-in-time** — there is no "freshness" contract beyond `expires_at`; a donor can't tell how stale the underlying screenings were at publish unless they read the breakdown timestamps.
7. **No verifier accounts / no verifier-side workflow** — verification is anonymous (optional free-text label only). A donor can't maintain a portfolio of passports they've verified.
8. **Assessment authoring UI** is Kuja-grant-shaped (wizard under `/assessments`), coupled to the grant product's IA.

---

## 16. Recommendations for the standalone product

**Lift-and-shift (high reuse, low risk):**
- `TrustProfileService`, `CapacityPassportService`, `VCService`, `AuditChainEntry` — these are clean, mostly self-contained services. The passport + VC layer in particular has almost no coupling to the grant product.
- The DD service layer (`compliance_service`, `adverse_media_service`, `bank_verification_service`) and its provider integrations (OpenSanctions, SAM.gov, Anthropic web-search).
- The public share / verify pages and the `.well-known` DID endpoints.

**Rebuild / add for the standalone (the differentiated wedge):**
1. **Adopt the C4C taxonomy as a first-class framework** — the 7 domains + 1–4 rubric + "Agreed Areas of Organizational Strengthening" + document checklist. Map Kuja's automated DD onto the Governance/Financial/Accountability/HR domains so automation *fills in* the recognised form rather than competing with it.
2. **Add the assessing-organization role + mutual sign-off + consent-to-share.** This is the Humentum three-step flow: passporting org assesses → signed passport → receiving org does reduced DD. It is the recognition mechanic, and it's the main thing Kuja lacks.
3. **Verifier accounts + portfolio.** Let funders keep, re-verify, and get freshness alerts on passports they rely on — turning a one-shot link into a standing relationship (and a second monetisable side).
4. **Freshness / re-attestation contract.** Surface "screenings as of" and auto-expire/nudge; StatusList2021 already supports revocation, extend it to staleness.
5. **Structured UBO** instead of the document proxy.
6. **Positioning:** a prior competitive brief exists — `docs/Kuja_Competitive_Brief_DD_Passporting_2026-07-09.docx` (and `Kuja_Link_Competitive_Analysis.md`) — reuse it for the standalone's market framing rather than starting the analysis fresh.

**The one-sentence thesis for the new build:** *Kuja already has the verification engine INGOs wish C4C's spreadsheet had; the product is that engine, wearing the C4C consortium's recognised clothing, with a verifier side.*

---

## Appendix — file map (`kuja-grant/`)

| Concern | Files |
|---|---|
| Trust Profile assembly | `app/services/trust_profile_service.py` |
| Passport lifecycle | `app/services/capacity_passport_service.py`, `app/models/capacity_passport.py` |
| Verifiable Credentials | `app/services/vc_service.py`, `app/routes/credentials_routes.py` |
| Due diligence | `app/services/compliance_service.py`, `adverse_media_service.py`, `bank_verification_service.py`, `compliance_explainer_service.py`, `compliance_preemption_service.py`, `compliance_rerun_service.py` |
| Gap insights (AI) | `app/services/trust_gap_insights_service.py` |
| Data models | `app/models/assessment.py`, `compliance.py`, `bank_verification.py`, `capacity_passport.py` |
| API routes | `app/routes/trust_routes.py`, `credentials_routes.py`, `assessments.py`, `compliance_routes.py`, `compliance_explainer_routes.py` |
| Frontend | `frontend/src/app/(app)/trust/`, `frontend/src/app/trust/share/[slug]/`, `frontend/src/app/trust/verify/`, `frontend/src/components/trust/*`, `frontend/src/lib/trust-api.ts` |
| Audit chain | `AuditChainEntry` in `app/models/` |
| Prior market analysis | `docs/Kuja_Competitive_Brief_DD_Passporting_2026-07-09.docx`, `Kuja_Link_Competitive_Analysis.md` |
