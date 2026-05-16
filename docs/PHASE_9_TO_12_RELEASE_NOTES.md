# Kuja v5.9 — Phases 9 → 12 Release Notes

**Release date:** 15 May 2026
**Theme:** AI you can hand to a customer tomorrow.

Four phases shipped in a single arc. Each closes a loop opened earlier.

---

## Phase 9 — Bundle PDF + document search + notification digest

### Bundle PDF export
Real ReportLab-rendered downloadable PDF (`GET /api/reports/<id>/bundle.pdf`).

Layout: cover · status/compliance/capacity/diligence/evidence quick-stats grid · clay-bordered AI executive summary · narrative · indicators table · evidence attachments table · color-coded asks/risks/decisions · AI risk flags · audit-anchor block with full SHA256 + assembled timestamp. Every page footer carries the truncated bundle hash so even a forwarded single page is traceable.

### Document smart search
`GET /api/documents/search?q=...` — org-scoped ILIKE across filename + ai_analysis + user_clarification. Snippet highlights with `<mark>`. NGO sees own apps + assessments, donor sees apps on own grants, reviewer sees assigned, admin sees all.

Wired into Cmd+K as a new "Documents" group with snippets + match-location tags.

Postgres FTS migration (tsvector + GIN) deferred — ILIKE works on both SQLite and PostgreSQL today; FTS deserves its own iteration with backfill.

### Notification digest
Daily / weekly roll-up of unread Notifications grouped by type, AI-composed one-line summary (e.g. *"Kuja today: 3 deadline reminders, 1 compliance flag, 2 reviews assigned."*), dispatched through NotificationDispatcher. Per-(user, frequency) 20-hour dedupe via dashboard cache.

Routes: `POST /api/notification-digest/me/run` (test), `POST /api/notification-digest/cron` (CRON_SECRET-authenticated).

---

## Phase 10 — Side-by-side compare + AI auto-fill

### Reviewer side-by-side compare (donor)
`POST /api/applications/compare {application_ids: [int...]}`. ApplicationCompareService reads 2-4 applications and returns:
- per-criterion `winner_application_id` + WHY (phrase-level differences)
- per-app predicted_score + verdict + reason
- org_differentiators + risk_differences
- recommendation: top_pick_application_id + confidence + caveats

Frontend `ApplicationCompareDialog` opens from `/reviews` with the new "Side-by-side matrix" button. Trophy badge on winner; per-criterion verdict grid; org diff + risk diff side cards.

**Real prod proof of calibration:** comparing two empty drafts → confidence 10/100, AI correctly noted *"no responses submitted for both programs"* and refused to fabricate a winner. (Bonus: rationale came back in Swahili because the admin's language preference is `sw`.)

### AI application auto-fill (NGO)
`GET /api/grants/<id>/autofill` — `ApplicationAutofillService.for_grant()` reads org profile (mission, sectors, country, capacity assessment, trust summary) + up to 4 prior applications as voice/experience reference. Per criterion: 200-400 word draft with `[INSERT 2025 BENEFICIARY COUNT]` placeholders + `confidence` + `sources_used` + `fields_still_needed`.

`AutofillPanel` in apply wizard: per-criterion Accept + "Accept all N" bulk action; renders only when no responses are filled yet so it never overwrites in-progress work.

---

## Phase 11 — Grant agreement unpack + cross-grant patterns + low-bandwidth captions

### Grant agreement smart unpack
`POST /api/grants/<id>/unpack-agreement` — Claude tool-use extracts:
- `reporting_obligations` (title/type/frequency/first_due_date/days_after_period)
- `indicators` (name/target/unit/baseline/source_of_verification)
- `payment_milestones` (label/amount/currency/trigger_date/trigger_condition)
- `budget_breakdown` (category/amount/currency/restriction)
- `key_contacts` (name/role/email/phone)
- `conditions` (severity: critical for termination/clawback, major for required actions, minor for routine)
- `restrictive_covenants` (free-form bullets)
- `key_dates` (label/iso_date/kind)
- `executive_summary` (2-3 sentence plain English)

Cached 24h per (grant_id, document_id). Reads `Document.ai_analysis.extracted_text` or falls back to the grant's `reporting_requirements` field.

### Cross-grant patterns AI
`GET /api/patterns/me` (also `/ngo/<id>` and `/donor/<id>`). Reads NGO/donor's 365 days of applications + reports + capacity assessment + trust profile, surfaces 3-6 patterns (strength/weakness/opportunity) with specific evidence (App #X cited) + concrete fixes + top_3_actions.

`CrossGrantPatternsCard` on NGO + donor dashboard.

**Real prod proof:** for Amani, Claude returned 3 patterns including:
- HIGH WEAKNESS *"Application Paralysis"* citing App #480, #478, #477, #475, #473, #471, #469, #467, #465, #463, #461, #459 (12 specific IDs)
- HIGH WEAKNESS *"Financial Reporting Compliance Crisis"* citing R#20, R#8 ($5,000+ procurement gap), R#15 (missing bank reconciliation), trust diligence 28/100
- STRENGTH "R#14 and R#13 accepted with 85% and 88% compliance"

For Sarah (donor) the same call returned 5 patterns in Arabic (her language preference).

### Low-bandwidth chart captions
`ChartCard` now respects `useUIStore(s => s.lowBandwidth)`. When on, the AI caption auto-fetch defers — user opts in by tapping the refresh icon. Phase 4's bandwidth toggle is now actually saving bandwidth.

---

## Phase 12 — Apply-unpack + pattern notifications + bundle audit receipts

### Apply grant-agreement unpack to live entities
`POST /api/grants/<id>/apply-unpack` turns the structured spec into:
- **Report stubs** with `due_date` projected forward from each `reporting_obligation` (capped at 4 forward periods per obligation, spaced by frequency, stopping at grant_end). Skips duplicates idempotently.
- **StatusSignal rows** on the grant from each `condition`: `kind='risk'` for critical/major, `kind='decision'` for minor. Skips duplicate bodies.
- **AuditChainEntry** anchor for the apply event itself, so the wiring is provable.

Frontend `GrantAgreementUnpackPanel` on `/grants/[id]`. Success state shows counts + deep links to `/calendar` + `/reports` + audit sequence number.

**This is the "make complying easy" promise made real:** NGO uploads a 30-page signed agreement → Claude extracts everything → one click creates the entire quarterly reporting calendar.

### Pattern → notification emit
HIGH-severity weakness patterns from `CrossGrantPatternsService` now fire through `NotificationDispatcher` with a per-(user, pattern_title) 7-day SHA256 dedupe key. Body includes the AI fix + first 2 evidence bullets.

### Bundle PDF audit receipt
`/api/reports/<id>/bundle.pdf` writes an `AuditChainEntry` whenever a donor / reviewer / admin downloads. NGO self-downloads don't fire (avoids noise). Receipt logs: `bundle_hash`, `reviewer_role`, `pdf_bytes`, `filename`.

**NGOs can now PROVE which donors reviewed their bundle, when.**

---

## Tests

**71 / 71 smoke tests pass**, including 13 new tests across phases 9-12:
- BUNDLE-PDF-001 (PDF header + content-type + size)
- DOCSEARCH-001 + DOCSEARCH-002 (search + short-query guard)
- DIGEST-001 (manual digest trigger)
- COMPARE-001 (input validation)
- AUTOFILL-001 (response shape)
- UNPACK-001 (agreement unpack)
- PATTERNS-001 + PATTERNS-002 (patterns NGO + donor)
- APPLYUNPACK-001 (apply-unpack response)
- BUNDLEPDF-002 (donor download writes audit receipt)

Logic invariants pass.

---

## Phase ladder

| Phase | Goal | Status |
|---|---|---|
| 1 | Truth-in-claims | ✅ |
| 2 | Category-defining UX | ✅ |
| 3 | AI-deepening | ✅ |
| 4 | Global South affordances | ✅ |
| 5 | Integrity (AI budget gate) | ✅ |
| 6 | Notifications system | ✅ |
| 7 | Pre-flight + audit chain | ✅ |
| 8 | Bundles + reviewer follow-ups | ✅ |
| 9 | PDF export + doc search + digest | ✅ |
| 10 | Compare + auto-fill | ✅ |
| 11 | Agreement unpack + patterns + low-bw captions | ✅ |
| 12 | Apply-unpack + pattern notifications + bundle audit receipts | ✅ |

## What's still on the table

- **Postgres FTS migration** (tsvector + GIN) — upgrade document search ranking
- **Real Twilio wiring** — set `TWILIO_*` env vars on Railway → actual SMS/WhatsApp
- **2FA hard-enforce** for admins with rollout window
- **Notification digest cron schedule** — Railway cron config + on-call docs
- **AI auto-fill voice-tone consistency** — train per-org style guides over time
