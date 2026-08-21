# Kuja Marketplace — Manual UI QA Checklist (client-UAT readiness)

The automated smoke suite verifies every journey's **backend/logic** + security (see
`FINDINGS.md`). This checklist covers the **on-screen** steps that still want a human
eye — done in a real browser. Accounts: `pass123`. Env: `https://fund.kuja.org`.

**Already verified in real Chrome (✅):** NGO login → dashboard; My Applications (found
SMK-012 i18n leak); Reports & Compliance; apply-wizard eligibility (checkboxes work with
real clicks); Trust hand-off round-trip. **Login tip:** the login/eligibility inputs are
React-controlled — you must *type* into them (paste/autofill may not register), then click.

## NGO journey (`fatima@amani.org`)
- [ ] **Fresh NGO join** (`ahmed@salamrelief.org` or a new org): `/network/join` → eligibility
      questionnaire → country/region → "Start assessment" → submit for review. Confirm status
      banner (pending). *(Join CTA must appear ONLY on Kuja marketplace, not proximate/saxansaxo.)*
- [ ] **Apply wizard end-to-end**: `/grants` → open a grant → Apply → Eligibility (check all,
      add evidence) → **Proposal** (per-criterion textareas; test the AI toolkit: **Guidance**,
      **Draft with AI**, **Strengthen**, **Polish**, voice input — confirm each returns text and
      inserts it) → Documents (upload a valid PDF) → Review → **Submit** → success screen shows an
      AI score + "what happens next". *(Backend apply/submit/auto-score + AI endpoints already
      verified; this confirms the on-screen flow.)*
- [ ] **Report submit**: `/reports` → a draft report → Pre-flight check → Submit; confirm status
      flips to Submitted. *(Note: report `/attachments` upload button may not be implemented — use
      photo-evidence / apply-time upload; confirm.)*
- [ ] **AI co-pilot rail** (right sparkle rail): Now / Ask (streaming answer with citations) / Insights.
- [ ] **Global chat** `/chat`: ask a question, confirm a grounded answer.

## Donor journey (`sarah@globalhealth.org`)
- [ ] **Create + publish grant**: `/grants/new` → fill fields + criteria → save → **Publish**
      (grant becomes Open). Try the **AI extract** from a Call-for-Proposals PDF.
- [ ] **Applicant pipeline** `/applications`: Table + **Pipeline (kanban)** toggle, status chips,
      **Shortlist (★)**. Open a submitted application → confirm the NGO's responses render.
- [ ] **Decision**: award / decline / **request revision** / request document. Confirm the NGO
      sees the new status. *(All decision endpoints verified server-side.)*
- [ ] **Assign reviewer**: on an application, assign a reviewer *(SMK-001 fixed — this used to 500)*.
- [ ] **Appeals queue**: after declining an app that the NGO appeals, open the appeals queue
      *(SMK-011 fixed — this used to 500 whenever an appeal was pending)*.
- [ ] **Report review** `/reports` (DonorReportInbox): approve / reject a submitted report.
- [ ] **Compliance** `/compliance` + **Portfolio QA** `/portfolio-qa`: risk verdicts, at-risk grants.

## Reviewer journey (`james@reviewer.org`)
- [ ] **Assignments** `/reviews`: Pending/Completed; open an assignment → per-criterion scoring
      with AI (score-criterion / score-application / extract-evidence) → Submit scores → Complete.
      Confirm the application advances to **under_review** then **scored** *(SMK-003 fixed)*.
- [ ] Decline an assignment; snooze; COI flag.

## Admin journey
- Admin (`admin@kuja.org`) is **intentionally disabled** on this branded host (correct hardening
  — SMK-002). Admin features were verified via a temp-reprovision + re-retire. For a live admin UI
  pass, reprovision a demo admin on a **non-client** host, or use a real admin account off-camera.

## Cross-cutting
- [ ] **i18n / RTL**: switch language to **Arabic** (top-right) — confirm RTL layout + no raw keys.
      **Known: SMK-012** — the applications filter shows the raw key `common.all`. **Run a full
      i18n key-coverage audit**: any key missing from `frontend/messages/*.json` renders as raw
      text (next-intl `t()` returns the key, defeating `|| 'fallback'`).
- [ ] **Mobile** (360×800): dashboards, apply wizard, reports — no horizontal overflow.
- [ ] **Uploads**: the malicious edge-case files are auto-tested (`smoke/probe_upload_security.py`,
      all rejected) — spot-check the UI error messages are friendly.
- [ ] **Demo-data freshness (SMK-008)**: refresh seed grant + report **deadlines to future dates**
      so the apply/report flows don't all show "Expired/overdue" in front of clients.
- [ ] **Test-data hygiene (SMK-004/004b)**: add the **`PROD_DATABASE_URL` GitHub secret** so the CI
      E2E gate self-cleans; else run `DATABASE_URL=… APPLY=1 py smoke/purge_test_grants.py` before demos.
