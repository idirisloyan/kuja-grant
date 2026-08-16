# Kuja Marketplace — UAT Facilitation Guide

**Scope:** the Kuja Marketplace tenant only (default network, `slug='kuja'`). Proximate / Saxansaxo / NEAR are out of scope.

This guide explains how to run the User Acceptance Test (UAT) and how a new team member can use the pack to learn the product. The test cases themselves live in **`Kuja_UAT_Test_Plan.xlsx`**; the files testers upload live in **`testfiles/`**.

---

## 1. What's in the pack

| Item | Purpose |
|---|---|
| `Kuja_UAT_Test_Plan.xlsx` | 195 test cases across NGO, Capacity & Trust, Donor, Reviewer, Admin, and Cross-cutting tabs; plus README, Test Accounts, Coverage, and a Defect Log |
| `testfiles/` | 48 realistic, fictional upload files (registration docs, policies, proposals, budgets, field photos, receipts, a video + voice memo) and 14 deliberately-broken edge-case files |
| `UAT_Guide.md` | This document |
| `make_workbook.py`, `make_testfiles.py` | The generators — re-run them to regenerate the workbook or the file pack |

Everything is fictional. The applicant **Amani Health Initiative** and donor **Global Health Fund** do not exist; all names, numbers, and letters are invented for testing.

---

## 2. Environments

| System | URL |
|---|---|
| Kuja Grant app (prod/UAT) | `https://web-production-6f8a.up.railway.app` |
| Kuja Trust app (capacity assessment) | `https://kuja-app-production.up.railway.app` |

Prefer a dedicated **staging/UAT** deployment for destructive cases. If you must test on production, use only the demo accounts, avoid creating spam data under real accounts, and note anything needing cleanup in the Defect Log.

> **Demo login buttons** appear only on `localhost`, `*.up.railway.app`, or when `NEXT_PUBLIC_DEMO_MODE=true`. On a branded go-live domain you type the email + `pass123`.

---

## 3. Accounts (all demo passwords: `pass123`)

| Role | Account |
|---|---|
| NGO (primary) | `fatima@amani.org` |
| NGO (others) | `ahmed@salamrelief.org`, `thandi@ubuntu.org`, `peter@hopebridges.org`, `aisha@sahelwomen.org` |
| Donor | `sarah@globalhealth.org`, `david@eatrust.org` |
| Reviewer | `james@reviewer.org`, `maria@reviewer.org` |
| Admin | `admin@kuja.org` |

**Kuja Trust app:** click **"Explore the demo workspace"** on the Trust URL — one click, no credentials.

> ⚠️ **Never** sign in as, reset, or modify the 6 real go-live accounts: `iloyan@`, `mrashid@`, `thussein@adesoafrica.org`, `mtumwebaze@adesoafrica.org`, `kali@`, `msattar@proximatefund.org`.

---

## 4. How to run a session

1. **Assign roles.** For end-to-end review cycles you need at least two testers in the room: one on an **NGO** account and one on a **Donor/Reviewer/Admin** account, so an application can travel submitted → reviewed → decided in one sitting.
2. **Work a tab top-to-bottom.** Run **P1** rows first in every tab (they are go-live blockers), then P2, then P3.
3. **Record every row.** Fill **Actual result**, set **Status** (Pass / Fail / Blocked / Not run / In progress — it's a dropdown), and add **Tester / Date / Notes**.
4. **Raise a defect for every Fail.** Copy the **Test ID** into the **Defect Log** tab, add reproduction steps and a screenshot reference, and set a severity.
5. **Use the file pack** wherever a row's *Test data / files* column names a file.

### Suggested sequence for a full end-to-end cycle
1. Admin provisions/looks up accounts (Admin tab).
2. NGO completes org profile, then the capacity assessment in the Trust app (NGO + Capacity & Trust tabs).
3. Donor creates and publishes a grant (Donor tab) — use `05_donor/GlobalHealthFund_Call_for_Proposals_MCH.pdf` for the AI-extraction step.
4. NGO applies to that grant and submits (NGO tab) — use `03_grant_application/*`.
5. Donor assigns a reviewer; reviewer scores (Reviewer tab).
6. Donor decides (award / decline / request revision); NGO responds (withdraw / appeal / revise).
7. On an award, NGO submits a compliance report with photo evidence (NGO tab) — use `04_compliance_reporting/*`; donor reviews it.
8. Run the Cross-cutting tab (uploads, i18n/RTL, PWA/offline, mobile, notifications, accessibility) at any point.

---

## 5. Pass / fail criteria for go-live

- **All P1 cases Pass** across every tab.
- **No open P1 defects** in the Defect Log.
- Every **Negative** and **Security** case behaves as specified (the system *rejects* what it should reject).
- Native-speaker sign-off on Arabic (and the other launch languages) is tracked separately in the translation-review workbooks — the i18n cases here confirm the *mechanism*, not the wording.

---

## 6. Things the team should know going in (found during test design)

- **Capacity assessment is a live hand-off to the Trust app.** On `/trust` the NGO clicks **"Complete your capacity assessment in Kuja Trust"** and is taken to the Trust app's Assessment tab — **no second login** (a short-lived signed link binds their org) — with a **"Return to your application"** bar to come back. On return, the Grant app reads the result back and the capacity/due-diligence status reflects it. The Grant app still has its own in-app assessment as an offline/degraded fallback, and grant-application submission is **not** blocked by the Trust profile (soft nudge). See the Capacity & Trust tab, rows **TRU-011, TRU-012, TRU-033, TRU-034**, and `docs/TRUST_HANDOFF_DESIGN.md`.
- **Report attachment button may 404.** The draft-report "Upload" button posts to `POST /api/reports/{id}/attachments`, which appears not to be implemented. Use **photo-evidence** or apply-time document upload instead, and confirm/raise the defect (NGO-046).
- **Upload limits:** Grant app 16 MB, allowed types `pdf/doc/docx/xls/xlsx/csv/png/jpg/jpeg/txt`; photo-evidence 5 MB images; Trust evidence room 8 MB (PDF/JPEG/PNG/WebP/DOCX). The edge-case files exercise each boundary.
- **Publishing a grant and deciding an application are licence-gated** for donors — an unlicensed donor gets an "upgrade required" dialog, not an error.

---

## 7. Regenerating the pack

```bash
py -3 docs/uat/make_testfiles.py     # rebuild testfiles/
py -3 docs/uat/make_workbook.py      # rebuild the workbook (+ copy to Downloads)
```
