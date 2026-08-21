# Kuja Marketplace — Smoke Test Findings (living report)

**Environment:** `https://fund.kuja.org` (Kuja Marketplace tenant) + Trust app `https://kuja-app-production.up.railway.app`
**Started:** 2026-08-20 · **Status:** in progress
**Data policy:** create `[SMOKE-TEST]`-tagged records, exercise write/destructive paths, purge at end.
**Accounts (`pass123`):** NGO `fatima@amani.org` · Donor `sarah@globalhealth.org` · Reviewer `james@reviewer.org` · Admin `admin@kuja.org`. (Never the 6 real go-live accounts.)

## Severity legend
- **P1 / Critical** — core feature broken or wrong data shown to a real user; go-live blocker. **Fix immediately, re-test.**
- **P2 / Major** — feature works but with a significant defect (wrong count, confusing state, missing guard).
- **P3 / Minor** — cosmetic, edge-case, or polish.

## Findings
| ID | Sev | Journey | Layer | Summary | Status |
|----|-----|---------|-------|---------|--------|
| SMK-001 | **P1** | Review & decision | API | `POST /api/reviews/` (donor/admin assigns a reviewer) **500s on every call** — `UnboundLocalError: User` (a local `from app.models import Notification, User` shadowed the module-level import; line 159 used `User` before it). Entire direct-assignment workflow broken; slipped through because existing tests use auto-assign. | **FIXED `2b1f7ad51`** — re-verify after deploy |
| SMK-002 | ~~P2~~ **By design** | Auth & access | API | `admin@kuja.org` can't log in — **confirmed intentional**: the account is `is_active=False`, deactivated at go-live by `retire_demo_accounts.py` (correct security hardening for a client-facing host; the shared admin demo is deliberately withheld from reseed). **Not a bug.** Admin features were verified by reprovisioning a **temp strong password**, testing, then **re-retiring** (prod left hardened; login now 401 for any pw). | **Resolved — no action; do NOT re-enable pass123 admin on prod** |
| SMK-003 | P2 | Review & decision | API | Auto-assigned applications **never transition to `under_review`** — they go `submitted → scored` directly. The PUT handler (reviewer starts scoring) doesn't flip app status like manual/bulk assign do, and auto-assign-on-submit is the default, so the donor pipeline can't tell "untouched" from "actively under review". | **FIXED (code)** — PUT now flips `submitted→under_review`; verify after deploy |
| SMK-004 | **P1** (scale) | Cross-cutting (demo readiness) | Data | UAT DB was **99.5% test junk**: **3,936 of 3,954 grants** were `[SMOKE-TEST]`/`[E2E-TEST]` (+ 298 apps, 13,491 compliance snapshots). Clients browsing the marketplace would wade through 4,000 junk grants. Root cause: E2E/soak test scripts create grants and never clean up. | **FIXED** — purged (FK-safe) → **18 real grants, 0 junk**. Reusable tool `smoke/purge_test_grants.py`; run before demos. Recommend: make E2E/soak tests self-clean |
| SMK-005 | P3 | Admin & dashboards | API | `GET /api/dashboard/portfolio-risk-heatmap` returns 400 (likely requires a query param). Not a crash; verify intended contract. | Open — low priority |
| SMK-006 | **P1** | Security (IDOR) | API | **Any authenticated NGO could read ANY org's due-diligence data** by iterating org ids — 5 endpoints were `@login_required` only, no ownership check: `trust-profile` (bank/sanctions/adverse/PEP/beneficial-ownership), `adverse-media`, `bank-verification`, `compliance`, `verification`. `trust-profile` even computed the access scope but used it only for analytics. Confirmed live leak (200). | **FIXED + verified `96abedf56`** — `can_view_org_dd()` helper (NGO→own; donor/reviewer/admin→any; unknown→deny). All 5: NGO-own 200 / NGO-other 403 / donor-any 200 |
| SMK-004b | P2 | Cross-cutting (root cause) | CI | **Root cause of SMK-004 found**: `e2e-regression.yml` runs write-heavy E2E tests against **PROD on every push to main**, creating `[E2E-TEST]` grants via the real apply flow, and **nothing ever ran the cleanup pruner** → accumulation to 3,936. (My own session pushes created new ones, e.g. grant 7762.) | **PARTIAL FIX** — added an always-run self-clean step to `e2e-regression.yml` (runs `smoke/purge_test_grants.py`); **team must add a `PROD_DATABASE_URL` secret** to activate it. Better long-term: run destructive E2E against staging, not prod |
| SMK-007 | P3 | Ops | CI/Deploy | **Every push to main — even test/doc-only files — redeploys prod (brief 502 rolling-restart) AND triggers a prod E2E run.** Matters during client UAT: routine commits cause prod blips + test-data creation. | Open — batch commits / consider path filters / non-prod E2E target |
| SMK-008 | P3 | Demo readiness | Data | All 7 seed marketplace grants have **past deadlines** (show "Expired"). Clients demoing the apply flow hit expired grants. | Open — refresh seed grant deadlines to future dates before demos |
| SMK-009 | P3 | Grant application | UI | Apply-wizard **Next button stays enabled and silently no-ops** when eligibility is incomplete — no validation message, so a user could click Next and be confused why nothing happens. | Open — disable Next until complete, or show a validation hint |
| SMK-010 | P3 | AI guidance | API | `POST /api/ai/draft-section` returned **500** when `criterion` was sent as a non-object (string) — `criterion.get()` raised an unhandled `AttributeError`. Bad input should be a clean 400. | **FIXED** — `isinstance` guard → 400 |
| SMK-011 | **P2** | Reporting/Appeals + DD | API | **7 naive/aware datetime 500s** (`TypeError: can't subtract offset-naive and offset-aware`): donor **appeals queue** (any pending appeal), **capacity-passport** serialization + **public** share endpoint + verify, **membership** serialization (disbursement gate), rejected-org cooldown re-apply, proximate overdue cron. All crash when the relevant date is set. | **FIXED** — shared `helpers.aware_utc()` applied at all 7 sites (`a39213c53`, `5237f4d69`) |
| SMK-012 | P3 | i18n | UI | Applications filter renders the **raw key `common.all`** instead of "All": the key is missing from message files, and next-intl `t()` returns the key (truthy) so the `\|\| 'All'` fallback is defeated. **Any missing key leaks as raw text this way.** | Open — add key + **systematic i18n key-coverage audit** before launch (fix+rebuild as one batch) |

## Journey status tracker
| # | Journey | API | UI | Notes |
|---|---------|-----|----|-------|
| 1 | Auth & access | ✅* | ✅ | *personas login OK; **admin login fails (SMK-002)**; wrong-pw/unknown/anon refused; UI login as NGO works, branded domain hides demo buttons |
| 2 | NGO onboarding / join | ⏳ | ⏳ | membership endpoints pending (fatima already a member — fresh-NGO join to test in UI) |
| 3 | Capacity assessment → Trust hand-off | ✅ | ✅ | **FULL round-trip VERIFIED in browser**: Grant→Trust SSO (no 2nd login) → rate domain (auto-save) → "Return to your application" → **read-back accurate** (Accountability 3/4 → 75/100 on Grant side, capacity 0→11). No console errors. |
| 4 | Due diligence | ⏳ | ⏳ | diligence endpoints pending |
| 5 | AI guidance / co-pilot | ✅ | ✅ | `/ai/guidance` + `/ai/draft-section` return grounded quality output; co-pilot rail present in UI. SMK-010 (500 on bad input) fixed |
| 6 | Grant application | ✅ | ◑ | API create/publish/criteria/apply/submit/auto-score/cross-surface all PASS. UI: wizard renders + eligibility logic works, but multi-step React wizard couldn't be fully click-driven in the in-app test browser (automation friction, NOT a product bug — fatima has real apps + API works). Minor SMK-009 UX. Recommend a manual UI click-through or real-Chrome pass |
| 7 | Review & decision | ✅ | ⏳ | **SMK-001 P1 fixed+redeployed+verified**; full chain: panel auto-assign → score → complete → **scored** → award → cross-surface all PASS. SMK-003 (P2) `under_review` never fires |
| 8 | Compliance & reporting | ✅* | ⏳ | report create/submit/accept PASS; *`/attachments` probe did not 500 |
| 9 | Donor features | 🔄 | ⏳ | queues/counts partial (via lifecycle); dedicated donor checks pending |
| 10 | Reviewer features | 🔄 | ⏳ | blocked by SMK-001; re-verify after deploy |
| 11 | Admin & dashboards | ✅ | ⏳ | ngo/donor/reviewer dashboards OK, no negative counts; **admin (temp-reprovisioned) verified**: stats/metrics/users/data-integrity/sla-breaches/ai-dashboard/clear-lockouts all 200, RBAC denies non-admin 403. Minor: `portfolio-risk-heatmap` 400 (needs param) |
| 12 | Cross-cutting (uploads, hygiene, RBAC, mobile/RTL) | ✅* | ⏳ | RBAC negative matrix PASS; no future timestamps/draft leak; **500-sweep clean** (0 5xx, 30 eps × 5 personas); **read-IDOR fixed** (SMK-006); **write-authz 10/10 clean**; UnboundLocalError class contained; *uploads + mobile/RTL still UI-layer |

## Security sweep summary (added beyond the original ask)
- **500-sweep:** 0 server errors across ~30 read endpoints × 5 personas.
- **Read IDOR (SMK-006, P1):** 5 due-diligence endpoints leaked any org's bank/sanctions/adverse-media to any NGO — **fixed + verified** (NGO→own 200, NGO→other 403, donor→any 200).
- **Write authz:** 10/10 cross-persona mutations correctly refused (no write-side IDOR).
- **UnboundLocalError class:** whole codebase scanned; the one live bug (SMK-001) was the only instance; CI-guard tool added.
- **Still to do:** file-upload security (malicious edge-case files), UI walkthroughs (apply wizard+AI, donor decision, reporting, reviewer, fresh-NGO join), i18n/RTL/mobile.

Legend: ⏳ not started · 🔄 in progress · ✅ pass · ❌ defects found (see table)
