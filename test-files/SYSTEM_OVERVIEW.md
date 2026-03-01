# Kuja Grant Management System - Overview & Testing Guide

## What is Kuja?

Kuja is an **end-to-end AI-powered grant management platform** designed specifically for the global south. It connects **donors** with **NGOs** through a single system that handles the entire grant lifecycle:

**Donor finds the right NGO** → **NGO is pre-qualified through capacity assessment** → **NGO is matched to grants** → **NGO applies** → **Application is reviewed & scored** → **Grant is awarded** → **NGO reports back to donor** — all within one platform.

The system uses **real-time AI analysis** (Claude API) to score documents, analyze reports, and extract grant requirements automatically.

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Capacity Assessment** | NGOs complete assessments using 5 industry frameworks (Kuja Standard, STEP, UN HACT, CHS, NUPAS) |
| **Grant Discovery** | NGOs browse, search, and filter grants by sector, country, and keywords |
| **Smart Applications** | 4-step application wizard with eligibility checks, proposals, and document uploads |
| **AI Document Scoring** | Uploaded documents are analyzed and scored in real-time by Claude AI |
| **Grant Creation** | Donors create grants with a 5-step wizard including AI-powered reporting requirement extraction |
| **Grant Reporting** | NGOs submit financial, narrative, and impact reports; AI analyzes completeness and quality |
| **Donor Review** | Donors review AI-analyzed reports and accept or request revisions |
| **Multi-language** | English, French, Swahili, Arabic, Somali |
| **Role-based Dashboards** | Customized views for NGOs, Donors, and Reviewers |
| **AI Assistant** | Chat panel for grant-related questions |

---

## System URL

**Production:** https://web-production-6f8a.up.railway.app

**Local (if running on laptop):** http://localhost:5000

---

## Test User Accounts

All passwords are: **`pass123`**

### NGO Users

| User | Email | Organization | Country | Sectors | Assessment Score |
|------|-------|-------------|---------|---------|-----------------|
| Fatima Hassan | fatima@amani.org | Amani Community Development | Kenya | Health, WASH, Nutrition | 82% |
| Ahmed Omar | ahmed@salamrelief.org | Salam Relief Foundation | Somalia | Food Security, Protection | 68% |
| Thandi Nkosi | thandi@ubuntu.org | Ubuntu Education Trust | South Africa | Education, Livelihoods | 91% |
| Peter Okello | peter@hopebridges.org | Hope Bridges Initiative | Uganda | Health, Climate | 55% |
| Aisha Bello | aisha@sahelwomen.org | Sahel Women's Network | Nigeria | Protection, Gender | 47% |

### Donor Users

| User | Email | Organization | Country |
|------|-------|-------------|---------|
| Sarah Mitchell | sarah@globalhealth.org | Global Health Fund | Switzerland |
| David Kimani | david@eatrust.org | East Africa Development Trust | Kenya |

### Reviewer Users

| User | Email |
|------|-------|
| James Ochieng | james@reviewer.org |
| Maria Santos | maria@reviewer.org |

### Admin

| User | Email |
|------|-------|
| Admin User | admin@kuja.org |

---

## Pre-loaded Test Data

### Grants

| # | Grant Title | Donor | Amount | Status | Eligible Countries |
|---|------------|-------|--------|--------|--------------------|
| 1 | Community Health Workers Scale-Up Program | Global Health Fund | $500,000 | Open | Kenya, Somalia, Uganda |
| 2 | Education Technology for Rural Schools | EA Development Trust | $250,000 | Open | Kenya, Uganda, Tanzania |
| 3 | Climate Resilience in East Africa | EA Development Trust | $1,000,000 | Draft | Kenya, Somalia, Ethiopia, Uganda |
| 4 | Women's Protection and Empowerment | Global Health Fund | $350,000 | Open | Nigeria, Niger, Chad, Mali |

### Applications

| NGO | Grant | Status | AI Score |
|-----|-------|--------|----------|
| Amani Community Development | Community Health Workers | Submitted | 78.5% |
| Salam Relief Foundation | Community Health Workers | Submitted | 62.3% |
| Ubuntu Education Trust | Education Technology | Draft | - |
| Sahel Women's Network | Women's Protection | Submitted | 71.0% |
| Hope Bridges Initiative | Community Health Workers | Draft (incomplete) | - |

### Reports

| Report | NGO | Grant | Type | Status |
|--------|-----|-------|------|--------|
| Q1 2026 Financial Report | Amani | Community Health Workers | Financial | Submitted (AI Score: 90) |
| Annual Progress Report H1 2026 | Amani | Community Health Workers | Narrative | Draft |
| Test Q2 Financial Report | Amani | Community Health Workers | Financial | Accepted |
| Annual Impact Report 2025 | Amani | Community Health Workers | Impact | Revision Requested |
| Under Review Financial Report | Amani | Community Health Workers | Financial | Under Review |

### Documents (Amani Community Development)

| Document | Type | AI Score |
|----------|------|----------|
| amani_psea_policy_2024.pdf | PSEA Policy | 88% |
| amani_audit_2024.pdf | Audit Report | 78% |
| amani_registration_certificate.pdf | Registration Cert | 95% |
| amani_financial_2023-2025.pdf | Financial Report | 82% |

---

## Assessment Frameworks

NGOs can select from 5 assessment/due diligence frameworks:

| Framework | Description | Items | Est. Time |
|-----------|-------------|-------|-----------|
| **Kuja Standard** | Default capacity assessment covering 5 organizational domains | 26 | 30-45 min |
| **STEP** | Strengthening Effective Partner Engagement and Performance | 26 | 45-60 min |
| **UN HACT** | UN Harmonized Approach to Cash Transfers micro-assessment | 22 | 45-60 min |
| **CHS** | Core Humanitarian Standard on Quality and Accountability | 27 | 60-90 min |
| **NUPAS** | Non-profit Unified Performance Assessment System | 27 | 60-90 min |

---

## Test Files Available

The `test-files/` folder contains realistic documents for testing AI upload and analysis:

### Standard Test Files
| File | Description | Expected AI Score |
|------|-------------|-------------------|
| financial_report_q1_2026.txt | Quarterly financial report with budget vs actuals | Medium-High (70-80) |
| audit_report_2025.txt | Independent external audit report | High (80-90) |
| registration_certificate.txt | NGO registration certificate | High (85-95) |
| project_proposal.txt | Full project proposal with budget | High (75-85) |
| impact_report_annual_2025.txt | Annual impact report with metrics | High (80-90) |
| budget_template.txt | Annual budget with line items | Medium-High (70-80) |
| compliance_checklist.txt | Completed due diligence checklist | Medium-High (70-80) |
| grant_agreement_sample.txt | Grant agreement (for AI requirement extraction) | N/A - used for extraction |

### Edge Case Test Files
| File | Description | Expected AI Score |
|------|-------------|-------------------|
| poor_quality_report.txt | Deliberately incomplete, vague report | Low (20-40) |
| excellent_narrative_report.txt | Comprehensive, detailed narrative report | High (85-95) |
| arabic_grant_agreement.txt | Grant agreement in Arabic | Tests multi-language |
| french_project_report.txt | WASH project report in French | Tests multi-language |
| large_budget_detailed.txt | 50+ line item budget for $500K grant | High (80-90) |
| strategic_plan_2025_2030.txt | 5-year NGO strategic plan | High (80-90) |
| due_diligence_questionnaire_completed.txt | 30-question completed questionnaire | High (80-90) |
| empty_template.txt | Template with only headers, no content | Very Low (5-15) |
| risk_assessment_matrix.txt | 15-risk matrix with mitigations | Medium-High (70-85) |
| beneficiary_feedback_report.txt | Community accountability report | Medium-High (70-85) |

---

## How to Run a Full End-to-End Test

### Scenario: Complete Grant Lifecycle

1. **Login as Donor** (sarah@globalhealth.org) → Create a new grant with reporting requirements → Upload `grant_agreement_sample.txt` for AI extraction → Publish grant

2. **Login as NGO** (fatima@amani.org) → Complete STEP assessment → Upload `financial_report_q1_2026.txt` and `audit_report_2025.txt` → Browse grants → Apply to the new grant with full proposal

3. **Login as Reviewer** (james@reviewer.org) → Review the submitted application → Score it

4. **Login as Donor** (sarah@globalhealth.org) → Review application rankings → Award the grant

5. **Login as NGO** (fatima@amani.org) → Go to Reports → Create new financial report → Submit it

6. **Login as Donor** (sarah@globalhealth.org) → Go to Grant Reports → Review the submitted report with AI analysis → Accept or request revision

### Scenario: AI Document Testing

1. **Login as NGO** (fatima@amani.org) → Go to My Documents
2. Upload `excellent_narrative_report.txt` → Expect HIGH AI score (85+)
3. Upload `poor_quality_report.txt` → Expect LOW AI score (below 40)
4. Upload `empty_template.txt` → Expect VERY LOW score or error
5. Upload `french_project_report.txt` → Verify AI handles French content

---

## Technical Notes

- **Database:** SQLite (resets on each Railway redeploy)
- **AI Engine:** Claude API (Anthropic) — requires valid API key
- **File Uploads:** Max 10MB, supports PDF, DOC, DOCX, XLS, XLSX, TXT, CSV
- **Sessions:** Cookie-based, expire on browser close
- **No integration with Kuja Link** in this version — that is planned for the next phase
