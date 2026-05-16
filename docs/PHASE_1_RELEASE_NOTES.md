# Kuja v5.1 — Phase 1 Release Notes ("Truth-in-Claims")

**Release date:** 15 May 2026
**Branch / Commit:** master / TBD
**Scope:** Close credibility gaps between the v5.0 BRD / Market Analysis and the shipped product.

---

## Why this release

The v5.0 BRD and v5.0 Market Analysis describe a comprehensive due-diligence
and trust system. An honest audit found that 12 major features were live,
but several headline claims — adverse media screening, PEP screening, bank
account verification, the unified two-pillar Trust Profile, and Capacity
Passporting — existed only in the documents.

Phase 1 closes those gaps. Every claim in the BRD that previously had no
backing code now has a real, tested, shipped implementation.

---

## What shipped in Phase 1

### 1. Adverse Media Screening (NEW)
- **Service:** `app/services/adverse_media_service.py`
- **Model:** `app/models/adverse_media.py` — `AdverseMediaScreening` table
- **Routes:** `GET /api/adverse-media/<org_id>`, `POST /api/adverse-media/screen`
- **UI:** `frontend/src/components/trust/adverse-media-panel.tsx`
- **What it does:** runs targeted searches over recent web coverage for the
  organisation and its named leadership. Classifies findings by severity
  (high / medium / low) and category (fraud, investigation, regulatory,
  governance, safeguarding, finance, lawsuit, sanctions-adjacent, other).
  Returns real article URLs as citations, with per-finding confidence.
- **Two layers:**
  - **Primary:** Anthropic-hosted `web_search` tool (live web grounding;
    confidence 85+)
  - **Fallback:** Claude training-knowledge sweep, clearly marked as
    `claude_training_knowledge` source with confidence ~50 so operators
    understand the result is not a live news sweep.
- **Re-screening:** the existing rescreening cron now also refreshes
  adverse media when the previous screening is >90 days old.

### 2. PEP (Politically Exposed Persons) Screening (NEW)
- **Extension to:** `ComplianceService._check_pep()` in `compliance_service.py`
- **What it does:** for each personnel name submitted with the screening
  request, queries OpenSanctions' PEPs collection (`/match/peps`) and
  returns matches with topic, position, country, and dataset. PEP
  matches are surfaced as a distinct `check_type='pep_screening'`
  with status `flagged` (review-required, not auto-blocking) and an
  EDD (Enhanced Due Diligence) action_required hint.
- **Why separate:** PEP status alone is not disqualifying. Conflating
  with sanctions matches over-flags benign board members and mentors.

### 3. Bank Account Verification (NEW)
- **Service:** `app/services/bank_verification_service.py`
- **Model:** `app/models/bank_verification.py` — `BankAccountVerification` table
- **Routes:** `GET /api/bank-verification/<org_id>`, `POST /api/bank-verification/verify`
- **UI:** `frontend/src/components/trust/bank-verification-panel.tsx`
- **What it does:** mechanical structural validation —
  - IBAN checksum (mod-97-10, ISO 13616) + country code
  - SWIFT/BIC structure (ISO 9362)
  - Bank country vs declared country cross-check
  - FATF Call-for-Action + Increased Monitoring jurisdiction lists
  - Currency-country sanity
  - Account-number length heuristics per country
  - Pattern flags (uniform digits, sequential)
- **Privacy:** account numbers are NOT stored in full — only last 4 digits + SHA256 hash
- **Result:** structured findings list with severity, code, evidence; risk score (0-100); status (verified / review / flagged)

### 4. Unified Two-Pillar Trust Profile (NEW — was the BRD's headline framing)
- **Service:** `app/services/trust_profile_service.py`
- **Route:** `GET /api/trust-profile/<org_id>`
- **UI:** `frontend/src/components/trust/trust-profile-card.tsx`
- **Page:** `frontend/src/app/(app)/trust/page.tsx`
- **What it does:** synthesises an organisation's existing artifacts
  (assessments, sanctions checks, registration verification, PEP, adverse
  media, bank verification, beneficial ownership documents) into ONE
  defensible answer:
  - **Composite score** (0-100), pillar-weighted
  - **Capacity pillar** (40% weight) — 5 frameworks (Kuja, STEP, UN-HACT, CHS, NUPAS) with weighted scoring, completion %, top strengths, priority gaps
  - **Due diligence pillar** (60% weight via worse-of rule) — 6 components: registration, sanctions, PEP, adverse media, bank, beneficial ownership
  - **Status** propagated using worse-of-the-two rule (a flagged diligence pillar can't be overridden by strong capacity).
- **No new schema:** synthesises existing tables; one read endpoint, one composable React component.

### 5. Capacity Passport (NEW — the moat)
- **Service:** `app/services/capacity_passport_service.py`
- **Model:** `app/models/capacity_passport.py` — `CapacityPassport` table
- **Routes:**
  - `POST /api/passport/publish` — NGO publishes
  - `GET /api/passport/<org_id>` — list
  - `POST /api/passport/<id>/revoke` — revoke (idempotent)
  - `GET /api/passport/verify/<slug>?t=<token>` — **public, no auth**
- **UI (private):** `frontend/src/components/trust/capacity-passport-panel.tsx`
- **UI (public verify page):** `frontend/src/app/trust/verify/page.tsx`
- **What it does:** NGO publishes a tamper-evident snapshot of their
  current Trust Profile and shares the URL with donors. Donors verify
  with no Kuja login required.
  - **Snapshot hash:** SHA256 over canonical JSON — any change breaks the hash
  - **Tamper-evident audit:** every publish / verify / revoke is written to the existing `audit_chain` table (hash-chained, replayable)
  - **One-active-passport rule:** publishing supersedes any prior active passport
  - **Optional expiry**
  - **Verification counter:** NGO sees how many donors verified, when
- **Why it's category-defining:** existing platforms make NGOs re-prove
  capacity per donor. The Passport pattern inverts this — verified
  once, accepted by many. NGOs save weeks per major application.

### 6. Cron-driven re-screening extension (UPDATED)
- `app/services/task_runner.py::_run_rescreening` was extended to also
  re-run adverse media when the latest run is >90 days old. Same multi-worker
  safety as the existing sanctions rescreen.

---

## Frontend additions

| File | Purpose |
|------|---------|
| `frontend/src/lib/trust-api.ts` | TypeScript types + API client for the trust layer |
| `frontend/src/components/trust/trust-profile-card.tsx` | Composite two-pillar card with drilldowns |
| `frontend/src/components/trust/adverse-media-panel.tsx` | Run + display adverse media findings |
| `frontend/src/components/trust/bank-verification-panel.tsx` | Submit + display bank verification |
| `frontend/src/components/trust/capacity-passport-panel.tsx` | Publish / list / revoke passports |
| `frontend/src/app/(app)/trust/page.tsx` | The Trust page (NGO + donor + admin) |
| `frontend/src/app/trust/verify/page.tsx` | Public passport verification (no auth) |
| Sidebar entry added for NGO + Donor + Admin roles |
| `nav.trust_profile` translation key added to all 6 languages (EN/FR/AR/SW/SO/ES) |

---

## Test coverage added (5 new smoke tests)

| Test | What it asserts |
|------|----------------|
| `TRUST-001` | Trust profile returns the two-pillar synthesis with all 6 diligence components and the capacity breakdown |
| `BANK-001` | IBAN mod-97 checksum catches typos (negative test) |
| `ADVERSE-001` | Adverse media list endpoint returns 200 with empty list for a new org |
| `PASSPORT-001` | Passport list endpoint returns 200 with empty list for a new org |
| `PASSPORT-002` | Public verify endpoint refuses bad slug/token without 500-ing |

All 42 smoke tests pass.

---

## What's NOT in Phase 1 (deferred to later phases)

- **Beneficial ownership disclosure capture flow** — the Trust Profile now
  surfaces ownership disclosure status (using uploaded docs tagged with
  `beneficial_ownership` / `ownership_disclosure` / `board_structure`),
  but the dedicated capture form is in Phase 2.
- **Reference verification (call/email references)** — still missing.
  Will require a notification/messaging design and isn't a Phase 1 priority.
- **AI cost budget gate + "skipped-due-to-budget" telemetry** — Phase 5.
- **PWA + offline support** — Phase 4 (Global South affordances).
- **WhatsApp deadline reminders** — Phase 4.
- **Command palette (Cmd+K), empty states sweep, mobile table fallback** — Phase 2 (category-defining UX).

---

## Migration notes

- New tables (`adverse_media_screenings`, `bank_account_verifications`,
  `capacity_passports`) are created automatically by `db.create_all()`
  on the next deploy. No manual SQL needed.
- The `ANTHROPIC_WEB_SEARCH=1` env var (default on) controls whether
  adverse media uses the live web layer. Set to `0` to force the
  training-knowledge fallback (useful for tests or in environments
  where the hosted web tool isn't enabled).

---

## How to demo this

1. Sign in as an NGO (e.g. `fatima@amani.org`).
2. Click **Trust Profile** in the sidebar.
3. See the composite score + two pillars.
4. Click **Run screening** under "Adverse Media".
5. Click **Verify bank details** to enter a test IBAN — try a bad checksum to see the flag.
6. Click **Publish Capacity Passport**.
7. Click **Copy URL** on the new passport row.
8. Sign out (or open an incognito window).
9. Paste the URL — see the public verification page with the tamper-evident snapshot.

---

## What changed in the BRD (for the next regeneration)

- Mark all Phase 1 features as "Shipped: v5.1 — May 15, 2026" instead of
  "Shipped: v5.0".
- The "Adverse Media Monitoring" section (6.7.4) was previously aspirational;
  it now describes the live implementation accurately.
- The "Two-Pillar Trust Profile" framing now matches a real, queryable
  `/api/trust-profile/<org_id>` endpoint and a dedicated `/trust` page.
- Capacity Passporting — previously discussed as a roadmap concept — is now
  the `CapacityPassport` model with a public `/trust/verify` page.
