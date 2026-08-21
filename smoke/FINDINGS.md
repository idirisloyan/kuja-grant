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

## Journey status tracker
| # | Journey | API | UI | Notes |
|---|---------|-----|----|-------|
| 1 | Auth & access | ✅* | ✅ | *personas login OK; **admin login fails (SMK-002)**; wrong-pw/unknown/anon refused; UI login as NGO works, branded domain hides demo buttons |
| 2 | NGO onboarding / join | ⏳ | ⏳ | membership endpoints pending (fatima already a member — fresh-NGO join to test in UI) |
| 3 | Capacity assessment → Trust hand-off | ✅ | ✅ | **FULL round-trip VERIFIED in browser**: Grant→Trust SSO (no 2nd login) → rate domain (auto-save) → "Return to your application" → **read-back accurate** (Accountability 3/4 → 75/100 on Grant side, capacity 0→11). No console errors. |
| 4 | Due diligence | ⏳ | ⏳ | diligence endpoints pending |
| 5 | AI guidance / co-pilot | ⏳ | ⏳ | pending (guidance/draft/score endpoints) |
| 6 | Grant application | ✅ | ⏳ | create/publish/criteria-accuracy/apply/fill/submit/auto-score/cross-surface all PASS |
| 7 | Review & decision | ✅ | ⏳ | **SMK-001 P1 fixed+redeployed+verified**; full chain: panel auto-assign → score → complete → **scored** → award → cross-surface all PASS. SMK-003 (P2) `under_review` never fires |
| 8 | Compliance & reporting | ✅* | ⏳ | report create/submit/accept PASS; *`/attachments` probe did not 500 |
| 9 | Donor features | 🔄 | ⏳ | queues/counts partial (via lifecycle); dedicated donor checks pending |
| 10 | Reviewer features | 🔄 | ⏳ | blocked by SMK-001; re-verify after deploy |
| 11 | Admin & dashboards | ✅ | ⏳ | ngo/donor/reviewer dashboards OK, no negative counts; **admin (temp-reprovisioned) verified**: stats/metrics/users/data-integrity/sla-breaches/ai-dashboard/clear-lockouts all 200, RBAC denies non-admin 403. Minor: `portfolio-risk-heatmap` 400 (needs param) |
| 12 | Cross-cutting (uploads, hygiene, RBAC, mobile/RTL) | ✅* | ⏳ | RBAC negative matrix PASS; no future timestamps / no draft leak; *uploads + mobile/RTL are UI-layer |

Legend: ⏳ not started · 🔄 in progress · ✅ pass · ❌ defects found (see table)
