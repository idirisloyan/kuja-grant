# Kuja Grant Management System - End-to-End Test Plan

**Version:** 2.0
**Date:** 2026-03-01
**Application:** Kuja Grant Management System (AI-Powered Grant Management Platform)
**Production URL:** https://web-production-6f8a.up.railway.app
**Local URL:** http://localhost:5000
**Stack:** Python/Flask, Vanilla JS SPA, SQLite (dev)/PostgreSQL (prod), Claude AI

---

## Table of Contents

1. [Test Environment & Data](#1-test-environment--data)
2. [Authentication (TC-AUTH)](#2-authentication-tc-auth)
3. [NGO Dashboard (TC-NGOD)](#3-ngo-dashboard-tc-ngod)
4. [Donor Dashboard (TC-DOND)](#4-donor-dashboard-tc-dond)
5. [Reviewer Dashboard (TC-REVD)](#5-reviewer-dashboard-tc-revd)
6. [Assessment Hub & Wizard (TC-ASMT)](#6-assessment-hub--wizard-tc-asmt)
7. [Grants - Browse, Detail, Search, Filter (TC-GRNT)](#7-grants---browse-detail-search-filter-tc-grnt)
8. [Application Wizard (TC-APPL)](#8-application-wizard-tc-appl)
9. [Grant Creation Wizard (TC-GCRT)](#9-grant-creation-wizard-tc-gcrt)
10. [Document Upload & AI Analysis (TC-DOCU)](#10-document-upload--ai-analysis-tc-docu)
11. [Reports - NGO (TC-RPTN)](#11-reports---ngo-tc-rptn)
12. [Reports - Donor Review (TC-RPTD)](#12-reports---donor-review-tc-rptd)
13. [Organization Profile & Search (TC-ORG)](#13-organization-profile--search-tc-org)
14. [AI Chat Assistant (TC-AICHAT)](#14-ai-chat-assistant-tc-aichat)
15. [Language & UI (TC-LANG)](#15-language--ui-tc-lang)
16. [Edge Cases & Error Handling (TC-EDGE)](#16-edge-cases--error-handling-tc-edge)
17. [Cross-Role End-to-End Workflows (TC-E2E)](#17-cross-role-end-to-end-workflows-tc-e2e)
18. [Live Registration Verification (TC-REGV)](#18-live-registration-verification-tc-regv)
19. [Live Sanctions Screening (TC-SANC)](#19-live-sanctions-screening-tc-sanc)
20. [AI Document Analysis Against Donor Requirements (TC-AIDOC)](#20-ai-document-analysis-against-donor-requirements-tc-aidoc)
21. [Grant Setup Wizard - Donor Requirements (TC-GWIZ)](#21-grant-setup-wizard---donor-requirements-tc-gwiz)
22. [NGO Reporting to Donor (TC-NGORPT)](#22-ngo-reporting-to-donor-tc-ngorpt)
23. [End-to-End Grant Lifecycle Workflows (TC-LIFE)](#23-end-to-end-grant-lifecycle-workflows-tc-life)
24. [Live AI Integration (TC-LIVEAI)](#24-live-ai-integration-tc-liveai)

---

## Changelog

| Version | Date       | Author | Description                                                                 |
|---------|------------|--------|-----------------------------------------------------------------------------|
| 1.0     | 2026-02-28 | --     | Initial test plan covering sections 1-17 (108 test cases)                   |
| 2.0     | 2026-03-01 | --     | Complete rewrite. Added 7 new workstreams (sections 18-24, 78 new TCs). Updated test data, added edge-case test files, expanded existing sections. Total: 178 test cases |

---

## 1. Test Environment & Data

### 1.1 Test Users

All passwords: `pass123`

| Role     | Email                    | Password | Organization                    | Country       | Sectors                          | Assessment Score |
|----------|--------------------------|----------|---------------------------------|---------------|----------------------------------|------------------|
| NGO      | fatima@amani.org         | pass123  | Amani Community Development     | Kenya         | Health, WASH, Nutrition          | 82%              |
| NGO      | ahmed@salamrelief.org    | pass123  | Salam Relief Foundation         | Somalia       | Food Security, Protection        | 68%              |
| NGO      | thandi@ubuntu.org        | pass123  | Ubuntu Education Trust          | South Africa  | Education, Livelihoods           | 91%              |
| NGO      | peter@hopebridges.org    | pass123  | Hope Bridges Initiative         | Uganda        | Health, Climate                  | 55%              |
| NGO      | aisha@sahelwomen.org     | pass123  | Sahel Women's Network           | Nigeria       | Protection, Gender               | 47%              |
| Donor    | sarah@globalhealth.org   | pass123  | Global Health Fund              | Switzerland   | --                               | --               |
| Donor    | david@eatrust.org        | pass123  | East Africa Development Trust   | Kenya         | --                               | --               |
| Reviewer | james@reviewer.org       | pass123  | -- (James Ochieng)              | --            | --                               | --               |
| Reviewer | maria@reviewer.org       | pass123  | -- (Maria Santos)               | --            | --                               | --               |
| Admin    | admin@kuja.org           | pass123  | --                              | --            | --                               | --               |

### 1.2 Grants in System

| ID | Grant Name                                | Amount     | Status | Donor                        | Countries                  |
|----|-------------------------------------------|------------|--------|------------------------------|----------------------------|
| 1  | Community Health Workers Scale-Up Program | $500,000   | Open   | Global Health Fund           | Kenya, Somalia, Uganda     |
| 2  | Education Technology for Rural Schools    | $250,000   | Open   | EA Development Trust         | Kenya, Uganda, Tanzania    |
| 3  | Climate Resilience in East Africa         | $1,000,000 | Draft  | EA Development Trust         | --                         |
| 4  | Women's Protection and Empowerment        | $350,000   | Open   | Global Health Fund           | Nigeria, Niger, Chad, Mali |

### 1.3 Existing Applications

| NGO                      | Grant | Status    | AI Score   |
|--------------------------|-------|-----------|------------|
| Amani Community Dev      | 1     | Submitted | 78.5       |
| Salam Relief Foundation  | 1     | Submitted | 62.3       |
| Ubuntu Education Trust   | 2     | Draft     | --         |
| Sahel Women's Network    | 4     | Submitted | 71.0       |
| Hope Bridges Initiative  | 1     | Draft     | Incomplete |

### 1.4 Existing Reports

| ID | Title                           | NGO   | Grant | Status             | AI Scores     |
|----|---------------------------------|-------|-------|--------------------|---------------|
| 1  | Q1 2026 Financial Report        | Amani | 1     | Submitted          | 90/100/65     |
| 2  | Annual Progress Report H1 2026  | Amani | 1     | Draft              | --            |
| 3  | Test Q2 Financial Report        | Amani | 1     | Accepted           | --            |
| 4  | Annual Impact Report 2025       | Amani | 1     | Revision Requested | --            |
| 5  | Under Review Financial Report   | Amani | 1     | Under Review       | --            |

### 1.5 Test Files (in test-files/ folder)

**Standard Test Files:**
- `financial_report_q1_2026.txt`
- `audit_report_2025.txt`
- `registration_certificate.txt`
- `project_proposal.txt`
- `impact_report_annual_2025.txt`
- `budget_template.txt`
- `compliance_checklist.txt`
- `grant_agreement_sample.txt`

**Edge Case & Specialized Test Files:**
- `poor_quality_report.txt` - Low-quality report for negative AI scoring tests
- `excellent_narrative_report.txt` - High-quality report for positive AI scoring tests
- `arabic_grant_agreement.txt` - Arabic-language document for RTL/multilingual tests
- `french_project_report.txt` - French-language document for multilingual tests
- `large_budget_detailed.txt` - Large/complex document for stress testing
- `strategic_plan_2025_2030.txt` - Multi-year strategic document
- `due_diligence_questionnaire_completed.txt` - Completed due diligence form
- `empty_template.txt` - Empty file for edge case testing
- `risk_assessment_matrix.txt` - Risk assessment document
- `beneficiary_feedback_report.txt` - Beneficiary-facing report

### 1.6 External Registries & Sanctions Databases (for Sections 18-19)

**Government Registries:**
| Country      | Registry                              | URL / Access                                  | Format          |
|--------------|---------------------------------------|-----------------------------------------------|-----------------|
| Kenya        | NGO Coordination Board / BRS          | https://brs.go.ke/                            | Web portal      |
| Nigeria      | Corporate Affairs Commission (CAC)    | https://search.cac.gov.ng/                    | Free searchable |
| South Africa | DSD NPO Registry + CIPC              | https://www.npo.gov.za/ / https://apim.cipc.co.za/ | Web + REST API |
| Uganda       | NGO Bureau                            | https://ngobureau.go.ug/en/updated-national-ngo-register | Web table |
| Somalia      | MOIFAR                                | No online registry                            | N/A             |
| Ethiopia     | ACSO                                  | No online registry                            | N/A             |

**Sanctions & Debarment Databases:**
| Database                          | URL / Endpoint                                                    | Format   |
|-----------------------------------|-------------------------------------------------------------------|----------|
| UN Security Council Consolidated  | https://scsanctions.un.org/resources/xml/en/consolidated.xml      | XML      |
| OFAC SDN List                     | https://www.treasury.gov/ofac/downloads/sdn.csv                   | CSV      |
| EU Consolidated Sanctions         | https://webgate.ec.europa.eu/fsd/fsf/public/files/csvFullSanctionsList_1_1/content | CSV |
| World Bank Debarment              | https://www.worldbank.org/en/projects-operations/procurement/debarred-firms | Web |
| OpenSanctions (Unified API)       | https://api.opensanctions.org/ (POST /match/<dataset>)            | REST API |

---

## 2. Authentication (TC-AUTH)

### TC-AUTH-001: Successful NGO Login
- **Category:** Authentication
- **Priority:** P1 Critical
- **Preconditions:** Application is running; user is on the login page
- **Steps:**
  1. Navigate to the login page (e.g., `/login`)
  2. Enter email: `fatima@amani.org` in the email field
  3. Enter password: `pass123` in the password field
  4. Click the "Login" / "Sign In" button
- **Test Data:** fatima@amani.org / pass123
- **Expected Results:**
  - User is redirected to the NGO Dashboard
  - Dashboard displays "Amani Community Development" or a welcome greeting for Fatima
  - Sidebar navigation shows NGO-specific menu items (Dashboard, My Applications, Browse Grants, Assessment Hub, My Documents, Reports, Organization Profile)
  - No error messages are displayed

### TC-AUTH-002: Successful Donor Login
- **Category:** Authentication
- **Priority:** P1 Critical
- **Preconditions:** Application is running; user is on the login page
- **Steps:**
  1. Navigate to the login page
  2. Enter email: `sarah@globalhealth.org`
  3. Enter password: `pass123`
  4. Click the "Login" / "Sign In" button
- **Test Data:** sarah@globalhealth.org / pass123
- **Expected Results:**
  - User is redirected to the Donor Dashboard
  - Dashboard displays "Global Health Fund" or a welcome greeting for Sarah
  - Sidebar shows donor-specific items (Dashboard, My Grants, Create Grant, Organization Search, Compliance, Reports, Review Applications)

### TC-AUTH-003: Successful Reviewer Login
- **Category:** Authentication
- **Priority:** P1 Critical
- **Preconditions:** Application is running; user is on the login page
- **Steps:**
  1. Navigate to the login page
  2. Enter email: `james@reviewer.org`
  3. Enter password: `pass123`
  4. Click the "Login" / "Sign In" button
- **Test Data:** james@reviewer.org / pass123
- **Expected Results:**
  - User is redirected to the Reviewer Dashboard
  - Dashboard displays "James Ochieng" or relevant greeting
  - Sidebar shows reviewer-specific items (Dashboard, Assignments, etc.)

### TC-AUTH-004: Successful Admin Login
- **Category:** Authentication
- **Priority:** P1 Critical
- **Preconditions:** Application is running; user is on the login page
- **Steps:**
  1. Navigate to the login page
  2. Enter email: `admin@kuja.org`
  3. Enter password: `pass123`
  4. Click the "Login" / "Sign In" button
- **Test Data:** admin@kuja.org / pass123
- **Expected Results:**
  - User is redirected to the Admin Dashboard
  - Sidebar shows admin-specific menu items

### TC-AUTH-005: Login with Invalid Password
- **Category:** Authentication
- **Priority:** P1 Critical
- **Preconditions:** Application is running; user is on the login page
- **Steps:**
  1. Navigate to the login page
  2. Enter email: `fatima@amani.org`
  3. Enter password: `wrongpassword`
  4. Click the "Login" / "Sign In" button
- **Test Data:** fatima@amani.org / wrongpassword
- **Expected Results:**
  - User remains on the login page
  - An error message is displayed (e.g., "Invalid email or password")
  - No session is created; user is not authenticated

---

## 3. NGO Dashboard (TC-NGOD)

### TC-NGOD-001: Dashboard Statistics Display
- **Category:** NGO Dashboard
- **Priority:** P1 Critical
- **Preconditions:** Logged in as fatima@amani.org
- **Steps:**
  1. Navigate to the NGO Dashboard (should be default after login)
  2. Observe the statistics/summary cards at the top of the dashboard
- **Test Data:** N/A
- **Expected Results:**
  - Dashboard displays key stats such as: total applications, active grants, documents uploaded, assessment score
  - Stats reflect the known data: Amani has 1 submitted application (Grant 1), and 5 existing reports
  - Capacity badge is visible showing score 82%

### TC-NGOD-002: Recommended Grants Section
- **Category:** NGO Dashboard
- **Priority:** P2 High
- **Preconditions:** Logged in as fatima@amani.org
- **Steps:**
  1. On the NGO Dashboard, scroll to or locate the "Recommended Grants" section
  2. Review the grants listed
- **Test Data:** N/A
- **Expected Results:**
  - Recommended grants are displayed based on Amani's sectors (Health, WASH, Nutrition) and country (Kenya)
  - Grant 1 (Community Health Workers Scale-Up Program) should appear as recommended (Health sector, Kenya)
  - Each recommended grant shows title, amount, donor, and a link/button to view details

### TC-NGOD-003: Recent Applications Section
- **Category:** NGO Dashboard
- **Priority:** P2 High
- **Preconditions:** Logged in as fatima@amani.org
- **Steps:**
  1. On the NGO Dashboard, locate the "Recent Applications" section
  2. Review the list
- **Test Data:** N/A
- **Expected Results:**
  - Amani's application to Grant 1 is listed with status "Submitted" and AI score 78.5
  - Application links to the application detail or My Applications page

### TC-NGOD-004: Capacity Badge Display
- **Category:** NGO Dashboard
- **Priority:** P2 High
- **Preconditions:** Logged in as fatima@amani.org
- **Steps:**
  1. On the NGO Dashboard, locate the capacity badge or score indicator
- **Test Data:** N/A
- **Expected Results:**
  - Capacity badge displays the score of 82%
  - Badge may show a visual indicator (color coding, tier label, etc.)

### TC-NGOD-005: NGO Dashboard for User with No Applications
- **Category:** NGO Dashboard
- **Priority:** P3 Medium
- **Preconditions:** Logged in as thandi@ubuntu.org (has only a draft application)
- **Steps:**
  1. Navigate to the NGO Dashboard
  2. Review statistics and recent applications section
- **Test Data:** N/A
- **Expected Results:**
  - Dashboard loads without errors
  - Recent applications shows the draft application to Grant 2
  - Stats reflect the draft status appropriately

---

## 4. Donor Dashboard (TC-DOND)

### TC-DOND-001: Donor Dashboard Statistics
- **Category:** Donor Dashboard
- **Priority:** P1 Critical
- **Preconditions:** Logged in as sarah@globalhealth.org
- **Steps:**
  1. Navigate to the Donor Dashboard (default after login)
  2. Review the statistics cards
- **Test Data:** N/A
- **Expected Results:**
  - Dashboard shows stats: number of active grants (Grant 1 and Grant 4 are Open), total applications received, total funding amount
  - Grant 1: $500K, Grant 4: $350K total for Global Health Fund

### TC-DOND-002: Active Grants List
- **Category:** Donor Dashboard
- **Priority:** P1 Critical
- **Preconditions:** Logged in as sarah@globalhealth.org
- **Steps:**
  1. On the Donor Dashboard, locate the "Active Grants" section
  2. Review the grants listed
- **Test Data:** N/A
- **Expected Results:**
  - Grant 1 (Community Health Workers Scale-Up Program, $500K, Open) is listed
  - Grant 4 (Women's Protection and Empowerment, $350K, Open) is listed
  - Each grant shows title, amount, status, and number of applications

### TC-DOND-003: Recent Applications on Donor Dashboard
- **Category:** Donor Dashboard
- **Priority:** P2 High
- **Preconditions:** Logged in as sarah@globalhealth.org
- **Steps:**
  1. On the Donor Dashboard, locate "Recent Applications" or "Applications to Review"
  2. Review the list
- **Test Data:** N/A
- **Expected Results:**
  - Applications from Amani (score 78.5), Salam (score 62.3) for Grant 1 are shown
  - Application from Sahel Women's Network (score 71.0) for Grant 4 is shown
  - Hope Bridges draft application should NOT appear to donor (still in draft)

### TC-DOND-004: Reports to Review Section
- **Category:** Donor Dashboard
- **Priority:** P2 High
- **Preconditions:** Logged in as sarah@globalhealth.org
- **Steps:**
  1. On the Donor Dashboard, locate the "Reports to Review" section
- **Test Data:** N/A
- **Expected Results:**
  - Report 1 (Q1 2026 Financial Report, submitted) is listed for review
  - Report 5 (Under Review Financial Report) is listed
  - Draft reports (Report 2) should NOT appear to donor

---

## 5. Reviewer Dashboard (TC-REVD)

### TC-REVD-001: Reviewer Dashboard Display
- **Category:** Reviewer Dashboard
- **Priority:** P1 Critical
- **Preconditions:** Logged in as james@reviewer.org
- **Steps:**
  1. Navigate to the Reviewer Dashboard (default after login)
  2. Review the dashboard content
- **Test Data:** N/A
- **Expected Results:**
  - Dashboard loads successfully
  - Shows reviewer statistics (assignments pending, completed reviews, etc.)
  - Displays any assigned applications for review

### TC-REVD-002: Reviewer Assignments Section
- **Category:** Reviewer Dashboard
- **Priority:** P2 High
- **Preconditions:** Logged in as maria@reviewer.org
- **Steps:**
  1. On the Reviewer Dashboard, locate the "Assignments" section
  2. Review any pending assignments
- **Test Data:** N/A
- **Expected Results:**
  - Any assigned applications are listed with grant name, NGO name, and submission date
  - Each assignment has a link to review the application

---

## 6. Assessment Hub & Wizard (TC-ASMT)

### TC-ASMT-001: Assessment Hub - View Available Frameworks
- **Category:** Assessment
- **Priority:** P1 Critical
- **Preconditions:** Logged in as fatima@amani.org
- **Steps:**
  1. Click "Assessment Hub" in the sidebar navigation
  2. Review the list of available assessment frameworks
- **Test Data:** N/A
- **Expected Results:**
  - Page displays 5 assessment frameworks:
    1. Kuja Standard
    2. STEP
    3. UN HACT
    4. CHS (Core Humanitarian Standard)
    5. NUPAS
  - Each framework shows a name, brief description, and a button to start the assessment

### TC-ASMT-002: Start Kuja Standard Assessment - Step 1 (Org Profile)
- **Category:** Assessment
- **Priority:** P1 Critical
- **Preconditions:** Logged in as fatima@amani.org; on the Assessment Hub page
- **Steps:**
  1. Click "Start Assessment" or equivalent button on the "Kuja Standard" framework card
  2. Verify the wizard opens at Step 1: Organization Profile
  3. Review the pre-filled organization information
- **Test Data:** Amani Community Development, Kenya, Health/WASH/Nutrition
- **Expected Results:**
  - Wizard displays Step 1 of 4 with a progress indicator
  - Organization name "Amani Community Development" is pre-filled
  - Country "Kenya" is pre-filled
  - Sectors (Health, WASH, Nutrition) are pre-filled
  - A "Next" button is available to proceed

### TC-ASMT-003: Kuja Standard Assessment - Step 2 (Checklist)
- **Category:** Assessment
- **Priority:** P1 Critical
- **Preconditions:** On Step 1 of the Kuja Standard Assessment wizard (TC-ASMT-002 completed)
- **Steps:**
  1. Click "Next" to proceed from Step 1 to Step 2
  2. Review the checklist items specific to the Kuja Standard framework
  3. Check/select at least 5 checklist items
  4. For each checked item, fill in any required text fields or notes
- **Test Data:** Select checklist items related to governance, financial management, program delivery, monitoring & evaluation, and HR policies. Enter notes: "Amani has a 5-member board of directors with quarterly meetings" for governance.
- **Expected Results:**
  - Step 2 displays framework-specific checklist questions
  - Checkboxes or toggle switches are functional
  - Notes/text fields accept input
  - Progress indicator updates to Step 2 of 4

### TC-ASMT-004: Kuja Standard Assessment - Step 3 (Documents)
- **Category:** Assessment
- **Priority:** P1 Critical
- **Preconditions:** Step 2 checklist is filled (TC-ASMT-003 completed)
- **Steps:**
  1. Click "Next" to proceed to Step 3
  2. Upload the file `registration_certificate.txt` to the registration certificate upload field
  3. Upload the file `audit_report_2025.txt` to the audit report upload field
  4. Upload the file `compliance_checklist.txt` to the compliance documents upload field
- **Test Data:** Files from test-files/ folder: registration_certificate.txt, audit_report_2025.txt, compliance_checklist.txt
- **Expected Results:**
  - Step 3 shows document upload areas for required assessment documents
  - Files upload successfully with progress indicators
  - Uploaded file names are displayed after upload completes
  - AI analysis may begin processing on uploaded documents

### TC-ASMT-005: Kuja Standard Assessment - Step 4 (Review & Submit)
- **Category:** Assessment
- **Priority:** P1 Critical
- **Preconditions:** Step 3 documents uploaded (TC-ASMT-004 completed)
- **Steps:**
  1. Click "Next" to proceed to Step 4
  2. Review the summary of all entered information: org profile, checklist responses, uploaded documents
  3. Click "Submit Assessment"
- **Test Data:** N/A
- **Expected Results:**
  - Step 4 shows a complete summary of all wizard steps
  - Organization profile data is accurate
  - Checklist responses are listed
  - Uploaded documents are listed with file names
  - After clicking Submit, a success message is displayed
  - User is redirected to the Assessment Hub or assessment results page

---

## 7. Grants - Browse, Detail, Search, Filter (TC-GRNT)

### TC-GRNT-001: Browse All Grants
- **Category:** Grants
- **Priority:** P1 Critical
- **Preconditions:** Logged in as fatima@amani.org
- **Steps:**
  1. Click "Browse Grants" in the sidebar navigation
  2. Review the list of available grants
- **Test Data:** N/A
- **Expected Results:**
  - Page displays a list of open grants
  - Grant 1 (Community Health Workers Scale-Up Program, $500K) is visible
  - Grant 2 (Education Technology for Rural Schools, $250K) is visible
  - Grant 4 (Women's Protection and Empowerment, $350K) is visible
  - Grant 3 (Climate Resilience, Draft status) should NOT appear to NGO users
  - Each grant card/row shows: title, donor name, amount, deadline, countries, sectors

### TC-GRNT-002: Search Grants by Keyword
- **Category:** Grants
- **Priority:** P1 Critical
- **Preconditions:** Logged in as fatima@amani.org; on the Browse Grants page
- **Steps:**
  1. Locate the search input field
  2. Type "Health" in the search field
  3. Press Enter or click the search button
- **Test Data:** Search keyword: "Health"
- **Expected Results:**
  - Results filter to show Grant 1 (Community Health Workers Scale-Up Program)
  - Search is case-insensitive

### TC-GRNT-003: Filter Grants by Sector
- **Category:** Grants
- **Priority:** P1 Critical
- **Preconditions:** Logged in as fatima@amani.org; on the Browse Grants page
- **Steps:**
  1. Locate the sector filter dropdown or checkboxes
  2. Select "Education" sector
  3. Observe the filtered results
- **Test Data:** Sector filter: Education
- **Expected Results:**
  - Only Grant 2 (Education Technology for Rural Schools) is displayed
  - Other grants are hidden
  - Filter can be cleared to show all grants again

### TC-GRNT-004: Grant Detail Page - Overview Tab
- **Category:** Grants
- **Priority:** P1 Critical
- **Preconditions:** Logged in as fatima@amani.org; on the Browse Grants page
- **Steps:**
  1. Click on Grant 1 "Community Health Workers Scale-Up Program" title or "View Details" button
  2. Verify the Grant Detail page loads
  3. Confirm the "Overview" tab is active by default
- **Test Data:** N/A
- **Expected Results:**
  - Grant Detail page displays with tabs: Overview, Eligibility, Criteria, Documents
  - Overview tab shows: grant title, donor (Global Health Fund), amount ($500,000), status (Open), countries (Kenya, Somalia, Uganda), description/summary
  - An "Apply" button is visible (since grant is Open and user is NGO)

### TC-GRNT-005: Combined Search and Filter
- **Category:** Grants
- **Priority:** P2 High
- **Preconditions:** Logged in as fatima@amani.org; on the Browse Grants page
- **Steps:**
  1. Type "Women" in the search field
  2. Select "Protection" in the sector filter
  3. Observe results
- **Test Data:** Search: "Women", Sector: Protection
- **Expected Results:**
  - Grant 4 (Women's Protection and Empowerment) appears in results
  - No other grants match both search and filter criteria

---

## 8. Application Wizard (TC-APPL)

### TC-APPL-001: Start New Application - Eligibility Check
- **Category:** Application
- **Priority:** P1 Critical
- **Preconditions:** Logged in as peter@hopebridges.org; on Grant 4 Detail page (Women's Protection and Empowerment)
- **Steps:**
  1. Click the "Apply" button on Grant 4
  2. Verify Step 1: Eligibility Check loads
  3. Review eligibility criteria (countries: Nigeria, Niger, Chad, Mali)
  4. Note that Hope Bridges is based in Uganda, which is NOT in the eligible countries list
- **Test Data:** Hope Bridges Initiative, Uganda, Health/Climate sectors
- **Expected Results:**
  - Eligibility check shows country requirement: Nigeria, Niger, Chad, Mali
  - Hope Bridges (Uganda) may fail the country eligibility check
  - System should display a warning or block proceeding if not eligible

### TC-APPL-002: Application Wizard - Step 2 (Proposal)
- **Category:** Application
- **Priority:** P1 Critical
- **Preconditions:** Logged in as aisha@sahelwomen.org; new application started for Grant 1; Step 1 eligibility passed
- **Steps:**
  1. Click "Next" to proceed to Step 2
  2. Fill in the proposal fields:
     - Project Title: "Sahel Community Health Workers Training Program"
     - Project Summary: "A comprehensive program to train 200 community health workers across northern Nigeria to provide basic health services in underserved areas."
     - Objectives: "1. Train 200 CHWs. 2. Reduce child mortality by 15%. 3. Establish sustainable health worker networks."
     - Methodology: "Cascading training model with master trainers conducting regional workshops."
     - Timeline: "12 months with quarterly milestones"
     - Budget Amount: "450000"
- **Test Data:** As described above
- **Expected Results:**
  - Step 2 displays proposal form fields
  - All text fields accept input
  - Budget field accepts numeric input
  - Data is retained when navigating between steps

### TC-APPL-003: Application Wizard - Step 3 (Documents)
- **Category:** Application
- **Priority:** P1 Critical
- **Preconditions:** Step 2 proposal completed (TC-APPL-002)
- **Steps:**
  1. Click "Next" to proceed to Step 3
  2. Upload `project_proposal.txt` to the Project Proposal upload field
  3. Upload `budget_template.txt` to the Budget upload field
  4. Upload `registration_certificate.txt` to the Registration Certificate upload field
  5. Wait for uploads to complete
- **Test Data:** Files: project_proposal.txt, budget_template.txt, registration_certificate.txt
- **Expected Results:**
  - Document upload areas are displayed for each required document type
  - Files upload with progress indicators
  - File names appear after successful upload
  - AI analysis may trigger on uploaded documents with real-time scoring feedback

### TC-APPL-004: Application Wizard - Step 4 (Review & Submit)
- **Category:** Application
- **Priority:** P1 Critical
- **Preconditions:** Step 3 documents uploaded (TC-APPL-003)
- **Steps:**
  1. Click "Next" to proceed to Step 4
  2. Review all application information: eligibility results, proposal details, uploaded documents
  3. Verify all data is correct
  4. Click "Submit Application"
- **Test Data:** N/A
- **Expected Results:**
  - Step 4 shows a comprehensive summary of the entire application
  - After clicking Submit, a success message confirms submission
  - Application status changes to "Submitted"

### TC-APPL-005: Save Application as Draft and Resume
- **Category:** Application
- **Priority:** P2 High
- **Preconditions:** Logged in as thandi@ubuntu.org; has a draft application to Grant 2
- **Steps:**
  1. Navigate to "My Applications" in the sidebar
  2. Find the draft application to Grant 2 (Education Technology for Rural Schools)
  3. Click "Continue" or "Edit" on the draft application
  4. Verify the wizard opens with previously saved data
- **Test Data:** N/A
- **Expected Results:**
  - Draft application is listed in My Applications with status "Draft"
  - Clicking continue opens the wizard at the appropriate step
  - Any previously entered data is pre-populated

---

## 9. Grant Creation Wizard (TC-GCRT)

### TC-GCRT-001: Grant Creation Wizard - Step 1 (Basic Info)
- **Category:** Grant Creation
- **Priority:** P1 Critical
- **Preconditions:** Logged in as david@eatrust.org (Donor)
- **Steps:**
  1. Click "Create Grant" in the sidebar navigation
  2. Verify the Grant Creation Wizard opens at Step 1: Basic Information
  3. Fill in the fields:
     - Grant Title: "Digital Literacy for East African Youth"
     - Description: "A comprehensive grant to fund digital literacy programs targeting youth aged 15-25 in East African communities with limited access to technology education."
     - Total Funding Amount: "750000"
     - Currency: "USD"
     - Application Deadline: "2026-06-30"
     - Grant Duration: "24 months"
- **Test Data:** As described above
- **Expected Results:**
  - Step 1 form displays all basic information fields
  - All fields accept input
  - Amount field validates numeric input
  - Date field provides a date picker

### TC-GCRT-002: Grant Creation Wizard - Step 2 (Eligibility)
- **Category:** Grant Creation
- **Priority:** P1 Critical
- **Preconditions:** Step 1 completed (TC-GCRT-001)
- **Steps:**
  1. Click "Next" to proceed to Step 2: Eligibility
  2. Select eligible countries: Kenya, Uganda, Tanzania, Rwanda
  3. Select eligible sectors: Education, Technology
  4. Set minimum organizational capacity score: 60
- **Test Data:** Countries: Kenya, Uganda, Tanzania, Rwanda; Sectors: Education, Technology; Min score: 60
- **Expected Results:**
  - Step 2 shows eligibility configuration fields
  - Country multi-select works correctly
  - Sector multi-select works correctly
  - Minimum score field accepts numeric input

### TC-GCRT-003: Grant Creation Wizard - Step 5 (Reporting Requirements with AI Extraction)
- **Category:** Grant Creation
- **Priority:** P1 Critical
- **Preconditions:** Steps 1-4 completed
- **Steps:**
  1. Click "Next" to proceed to Step 5: Reporting Requirements
  2. Upload `grant_agreement_sample.txt` to the grant document upload field for AI extraction
  3. Wait for AI to process the document and extract reporting requirements
  4. Review the AI-extracted reporting requirements
  5. Modify or confirm the extracted requirements
  6. Add custom requirement: "Annual audit report required within 60 days of fiscal year end"
- **Test Data:** File: grant_agreement_sample.txt; custom requirement text as described
- **Expected Results:**
  - AI extraction processes the uploaded grant document
  - Extracted reporting requirements are displayed for review
  - Donor can modify, add, or remove extracted requirements

### TC-GCRT-004: Grant Creation Wizard - Submit and Publish
- **Category:** Grant Creation
- **Priority:** P1 Critical
- **Preconditions:** All 5 steps completed
- **Steps:**
  1. Review all grant information on the final summary
  2. Click "Save as Draft"
  3. Verify grant is created with "Draft" status
  4. Navigate to the draft grant and click "Publish"
- **Test Data:** N/A
- **Expected Results:**
  - Grant is created in Draft, then published to "Open" status
  - Grant appears in NGO Browse Grants after publication

---

## 10. Document Upload & AI Analysis (TC-DOCU)

### TC-DOCU-001: Upload Document from My Documents
- **Category:** Document Upload & AI Analysis
- **Priority:** P1 Critical
- **Preconditions:** Logged in as fatima@amani.org
- **Steps:**
  1. Click "My Documents" in the sidebar navigation
  2. Click "Upload Document" or equivalent button
  3. Select `financial_report_q1_2026.txt` from the file picker
  4. Select document type/category (e.g., "Financial Report")
  5. Click "Upload"
- **Test Data:** File: financial_report_q1_2026.txt; Type: Financial Report
- **Expected Results:**
  - File uploads with a progress bar
  - After upload, AI analysis begins automatically
  - AI scoring results appear showing real-time scores via Claude API
  - Document appears in the My Documents list with its AI score

### TC-DOCU-002: Upload Audit Report with AI Scoring
- **Category:** Document Upload & AI Analysis
- **Priority:** P1 Critical
- **Preconditions:** Logged in as fatima@amani.org; on My Documents page
- **Steps:**
  1. Click "Upload Document"
  2. Select `audit_report_2025.txt`
  3. Select document type: "Audit Report"
  4. Click "Upload"
  5. Wait for AI analysis to complete
- **Test Data:** File: audit_report_2025.txt; Type: Audit Report
- **Expected Results:**
  - Document uploads successfully
  - AI analysis returns a score and detailed feedback
  - Score is displayed with the document in the list

### TC-DOCU-003: View Document Details and AI Score
- **Category:** Document Upload & AI Analysis
- **Priority:** P2 High
- **Preconditions:** Logged in as fatima@amani.org; documents uploaded (TC-DOCU-001)
- **Steps:**
  1. Navigate to My Documents
  2. Click on the uploaded financial report to view details
  3. Review the AI analysis breakdown
- **Test Data:** N/A
- **Expected Results:**
  - Document detail page shows: file name, upload date, document type, AI score
  - AI analysis may show sub-scores (e.g., completeness, accuracy, compliance)
  - Feedback/recommendations from AI are displayed

### TC-DOCU-004: Upload Document During Application
- **Category:** Document Upload & AI Analysis
- **Priority:** P1 Critical
- **Preconditions:** Logged in as ahmed@salamrelief.org; on Step 3 (Documents) of an application wizard
- **Steps:**
  1. Upload `project_proposal.txt` to the project proposal field
  2. Wait for AI analysis to complete
  3. Observe the real-time AI scoring
- **Test Data:** File: project_proposal.txt
- **Expected Results:**
  - Document uploads within the application wizard context
  - AI scoring runs in real-time via Claude API
  - Score is displayed next to the uploaded document within the wizard

---

## 11. Reports - NGO (TC-RPTN)

### TC-RPTN-001: View Reports List
- **Category:** Reports - NGO
- **Priority:** P1 Critical
- **Preconditions:** Logged in as fatima@amani.org
- **Steps:**
  1. Click "Reports" in the sidebar navigation
  2. Review the list of reports
- **Test Data:** N/A
- **Expected Results:**
  - Reports page displays all 5 existing reports for Amani:
    1. Q1 2026 Financial Report - Submitted (AI scores: 90/100/65)
    2. Annual Progress Report H1 2026 - Draft
    3. Test Q2 Financial Report - Accepted
    4. Annual Impact Report 2025 - Revision Requested
    5. Under Review Financial Report - Under Review
  - Each report shows: title, grant name, status, submission date
  - Status badges/labels are color-coded

### TC-RPTN-002: Create New Report
- **Category:** Reports - NGO
- **Priority:** P1 Critical
- **Preconditions:** Logged in as fatima@amani.org; on the Reports page
- **Steps:**
  1. Click "Create New Report" or "New Report" button
  2. Select Grant: "Community Health Workers Scale-Up Program" (Grant 1)
  3. Select Report Type: "Financial Report"
  4. Enter Report Title: "Q2 2026 Financial Report"
  5. Click "Create" or "Next"
- **Test Data:** Grant: Community Health Workers Scale-Up Program; Type: Financial Report; Title: Q2 2026 Financial Report
- **Expected Results:**
  - Report creation form/dialog appears
  - Grant dropdown lists grants where Amani has active/submitted applications
  - Report type dropdown includes options like Financial Report, Progress Report, Impact Report
  - After creation, the report editor opens

### TC-RPTN-003: Fill Report Content and Submit
- **Category:** Reports - NGO
- **Priority:** P1 Critical
- **Preconditions:** New report created (TC-RPTN-002); report editor is open
- **Steps:**
  1. Fill in "Executive Summary": "This quarterly financial report covers Q2 2026 activities under the Community Health Workers Scale-Up Program."
  2. Fill in "Financial Overview": "Budget allocation: $130,000. Actual spending: $125,000. Variance: $5,000 (3.8% underspend)."
  3. Fill in remaining sections (Activities, Challenges, Next Steps)
  4. Click "Submit" or "Submit for Review"
  5. Confirm submission
- **Test Data:** As described in each section above
- **Expected Results:**
  - All content sections accept text input
  - Report status changes from "Draft" to "Submitted"
  - AI analysis begins processing the report content
  - AI scores are generated and displayed

### TC-RPTN-004: View Report with Revision Requested Status
- **Category:** Reports - NGO
- **Priority:** P2 High
- **Preconditions:** Logged in as fatima@amani.org
- **Steps:**
  1. Navigate to Reports
  2. Click on "Annual Impact Report 2025" (status: Revision Requested)
  3. Review the revision notes from the donor
- **Test Data:** N/A
- **Expected Results:**
  - Report opens with revision request notes visible
  - Donor's feedback/comments are displayed
  - Report may be editable for revisions
  - A "Resubmit" button is available

---

## 12. Reports - Donor Review (TC-RPTD)

### TC-RPTD-001: View All Reports as Donor
- **Category:** Reports - Donor Review
- **Priority:** P1 Critical
- **Preconditions:** Logged in as sarah@globalhealth.org
- **Steps:**
  1. Click "Reports" in the sidebar navigation
  2. Review the list of reports from NGOs
- **Test Data:** N/A
- **Expected Results:**
  - All submitted/reviewable reports for Global Health Fund grants are listed
  - Report 1 (Q1 2026 Financial Report, Submitted) is visible
  - Report 5 (Under Review Financial Report) is visible
  - Draft reports (Report 2) should NOT be visible to donors

### TC-RPTD-002: Review and Accept Report
- **Category:** Reports - Donor Review
- **Priority:** P1 Critical
- **Preconditions:** Logged in as sarah@globalhealth.org; on the Reports page
- **Steps:**
  1. Click on Report 1 "Q1 2026 Financial Report" (Submitted, from Amani)
  2. Review the report content and AI analysis scores (90/100/65)
  3. Click the "Accept" button
  4. Add a note: "Excellent financial reporting. All expenditures well documented."
  5. Confirm acceptance
- **Test Data:** Note: "Excellent financial reporting. All expenditures well documented."
- **Expected Results:**
  - Report detail page opens showing full report content
  - AI analysis scores are displayed
  - Report status changes to "Accepted"
  - Confirmation message is displayed

### TC-RPTD-003: Request Revision on a Report
- **Category:** Reports - Donor Review
- **Priority:** P1 Critical
- **Preconditions:** Logged in as sarah@globalhealth.org; viewing Report 5 "Under Review Financial Report"
- **Steps:**
  1. Click on Report 5 to view details
  2. Click "Request Revision" button
  3. Enter revision notes: "Please provide more detail on the travel expenditures in Section 3. The variance between budgeted and actual spending on supplies needs explanation."
  4. Click "Submit Revision Request" or "Send"
- **Test Data:** Revision notes as described above
- **Expected Results:**
  - Report status changes to "Revision Requested"
  - Revision notes are saved and associated with the report
  - NGO can view the revision notes when they open the report

### TC-RPTD-004: View Report AI Analysis Scores
- **Category:** Reports - Donor Review
- **Priority:** P2 High
- **Preconditions:** Logged in as sarah@globalhealth.org; viewing Report 1
- **Steps:**
  1. Locate the AI analysis section on the report detail page
  2. Review the three AI scores: 90, 100, and 65
- **Test Data:** N/A
- **Expected Results:**
  - AI scores are clearly displayed with labels (e.g., Financial Accuracy: 90, Completeness: 100, Narrative Quality: 65)
  - Scores may have visual indicators (progress bars, color coding)
  - AI may provide detailed feedback alongside scores

---

## 13. Organization Profile & Search (TC-ORG)

### TC-ORG-001: View Organization Profile (NGO)
- **Category:** Organization
- **Priority:** P2 High
- **Preconditions:** Logged in as fatima@amani.org
- **Steps:**
  1. Click "Organization Profile" in the sidebar navigation
  2. Review the profile information
- **Test Data:** N/A
- **Expected Results:**
  - Profile page displays:
    - Organization Name: Amani Community Development
    - Country: Kenya
    - Sectors: Health, WASH, Nutrition
    - Capacity Score: 82%
  - An "Edit" button is available

### TC-ORG-002: Edit Organization Profile
- **Category:** Organization
- **Priority:** P2 High
- **Preconditions:** Logged in as fatima@amani.org; on Organization Profile page
- **Steps:**
  1. Click "Edit" button
  2. Update the description field with organization background information
  3. Add a phone number: "+254 700 123 456"
  4. Click "Save" or "Update Profile"
- **Test Data:** Description and phone number as described
- **Expected Results:**
  - Profile fields become editable
  - Changes are saved successfully
  - Profile page refreshes with updated information

### TC-ORG-003: Organization Search (Donor Feature)
- **Category:** Organization
- **Priority:** P2 High
- **Preconditions:** Logged in as sarah@globalhealth.org
- **Steps:**
  1. Click "Organization Search" in the sidebar navigation
  2. Enter search term: "Amani" in the search field
  3. Click search or press Enter
- **Test Data:** Search term: "Amani"
- **Expected Results:**
  - Search results show "Amani Community Development" with key details: country (Kenya), sectors (Health, WASH, Nutrition), capacity score (82%)
  - Clicking on the result opens the organization's profile view

### TC-ORG-004: Compliance & Due Diligence (Donor Feature)
- **Category:** Organization
- **Priority:** P2 High
- **Preconditions:** Logged in as sarah@globalhealth.org
- **Steps:**
  1. Click "Compliance" or "Compliance & Due Diligence" in the sidebar
  2. Review the compliance dashboard
  3. Search for or select "Amani Community Development"
  4. Review compliance status and due diligence information
- **Test Data:** Organization: Amani Community Development
- **Expected Results:**
  - Compliance dashboard loads with overview of compliance status across organizations
  - Amani's compliance details show assessment completions, document status, and any flags

---

## 14. AI Chat Assistant (TC-AICHAT)

### TC-AICHAT-001: Open AI Chat Assistant
- **Category:** AI Assistant
- **Priority:** P2 High
- **Preconditions:** Logged in as fatima@amani.org; on any page
- **Steps:**
  1. Locate the floating AI Chat Assistant button/icon (usually bottom-right corner)
  2. Click to open the chat panel
- **Test Data:** N/A
- **Expected Results:**
  - Chat panel opens as a floating overlay or slide-in panel
  - A welcome message or prompt is displayed
  - Text input field is available for typing questions

### TC-AICHAT-002: Ask AI Assistant a Question
- **Category:** AI Assistant
- **Priority:** P2 High
- **Preconditions:** AI Chat panel is open (TC-AICHAT-001)
- **Steps:**
  1. Type: "What grants am I eligible for?"
  2. Click Send or press Enter
  3. Wait for AI response
- **Test Data:** Question: "What grants am I eligible for?"
- **Expected Results:**
  - AI processes the question
  - Loading indicator appears while generating response
  - AI responds with contextually relevant information about grants matching Amani's profile
  - Response mentions Grant 1 (Community Health Workers Scale-Up Program) as relevant

### TC-AICHAT-003: AI Assistant Context Awareness
- **Category:** AI Assistant
- **Priority:** P3 Medium
- **Preconditions:** Logged in as fatima@amani.org; on Grant 1 detail page; AI Chat panel is open
- **Steps:**
  1. Type: "Can you help me understand the eligibility requirements for this grant?"
  2. Send and wait for response
- **Test Data:** Question about current page context
- **Expected Results:**
  - AI response is contextually aware of the grant being viewed (Grant 1)
  - Response references specific eligibility criteria for the Community Health Workers Scale-Up Program

---

## 15. Language & UI (TC-LANG)

### TC-LANG-001: Switch Language to French
- **Category:** Language & UI
- **Priority:** P2 High
- **Preconditions:** Logged in as fatima@amani.org; language is set to English
- **Steps:**
  1. Locate the language switcher (usually in the header or sidebar)
  2. Select "French" / "Francais"
  3. Observe the page content
- **Test Data:** Target language: French
- **Expected Results:**
  - UI elements switch to French (navigation labels, buttons, headings)
  - Sidebar menu items are translated
  - Language selection persists across page navigation

### TC-LANG-002: Switch Language to Arabic (RTL)
- **Category:** Language & UI
- **Priority:** P2 High
- **Preconditions:** Logged in as fatima@amani.org
- **Steps:**
  1. Select "Arabic" from the language switcher
  2. Observe the UI
- **Test Data:** Target language: Arabic
- **Expected Results:**
  - UI switches to Arabic translations
  - Text direction changes to RTL (right-to-left) if the application supports it
  - Layout adjusts for RTL reading order

### TC-LANG-003: Sidebar Navigation - Role-Based Visibility (NGO)
- **Category:** Language & UI
- **Priority:** P1 Critical
- **Preconditions:** Logged in as fatima@amani.org
- **Steps:**
  1. Examine the sidebar navigation menu
  2. List all visible menu items
- **Test Data:** N/A
- **Expected Results:**
  - Sidebar shows NGO-specific items: Dashboard, Browse Grants, My Applications, Assessment Hub, My Documents, Reports, Organization Profile
  - Sidebar does NOT show donor-only items: Create Grant, Organization Search, Compliance, Review Applications

### TC-LANG-004: Sidebar Navigation - Role-Based Visibility (Donor)
- **Category:** Language & UI
- **Priority:** P1 Critical
- **Preconditions:** Logged in as sarah@globalhealth.org
- **Steps:**
  1. Examine the sidebar navigation menu
  2. List all visible menu items
- **Test Data:** N/A
- **Expected Results:**
  - Sidebar shows donor-specific items: Dashboard, My Grants, Create Grant, Organization Search, Compliance & Due Diligence, Reports, Review Applications
  - Sidebar does NOT show NGO-only items: Browse Grants, My Applications, Assessment Hub, My Documents

### TC-LANG-005: Responsive Design - Mobile View
- **Category:** Language & UI
- **Priority:** P2 High
- **Preconditions:** Logged in as fatima@amani.org
- **Steps:**
  1. Resize the browser window to mobile width (approximately 375px wide)
  2. Observe the layout changes
  3. Check if sidebar collapses to a hamburger menu
  4. Open the hamburger menu and verify all navigation items are accessible
- **Test Data:** Browser width: 375px
- **Expected Results:**
  - Layout adapts to mobile screen size
  - Sidebar collapses to a hamburger menu icon
  - Content reflows to single column
  - All functionality remains accessible

---

## 16. Edge Cases & Error Handling (TC-EDGE)

### TC-EDGE-001: Upload Invalid File Type
- **Category:** Edge Cases & Error Handling
- **Priority:** P2 High
- **Preconditions:** Logged in as fatima@amani.org; on My Documents page
- **Steps:**
  1. Click "Upload Document"
  2. Attempt to upload a file with an unsupported extension (e.g., `.exe`)
  3. Observe the response
- **Test Data:** Unsupported file type
- **Expected Results:**
  - File upload is rejected
  - Error message indicates the file type is not supported
  - No file is stored on the server

### TC-EDGE-002: Submit Application with Missing Required Fields
- **Category:** Edge Cases & Error Handling
- **Priority:** P2 High
- **Preconditions:** Logged in as peter@hopebridges.org; on Step 2 (Proposal) of application wizard for Grant 2
- **Steps:**
  1. Leave the "Project Title" field empty
  2. Leave the "Project Summary" field empty
  3. Fill only "Objectives": "Improve education access"
  4. Click "Next" or "Submit"
- **Test Data:** Objectives: "Improve education access"; all other fields empty
- **Expected Results:**
  - Form validation prevents proceeding
  - Error messages highlight the required fields
  - User remains on Step 2

### TC-EDGE-003: Access Donor Feature as NGO User
- **Category:** Edge Cases & Error Handling
- **Priority:** P1 Critical
- **Preconditions:** Logged in as fatima@amani.org (NGO role)
- **Steps:**
  1. Manually navigate to a donor-only URL (e.g., `/grants/create` or `/compliance`)
- **Test Data:** N/A
- **Expected Results:**
  - Access is denied (403 Forbidden) or user is redirected to their dashboard
  - An error message indicates insufficient permissions

### TC-EDGE-004: Special Characters in Form Fields
- **Category:** Edge Cases & Error Handling
- **Priority:** P3 Medium
- **Preconditions:** Logged in as fatima@amani.org; on the application wizard Step 2
- **Steps:**
  1. Enter Project Title: "Women's Health & Nutrition <Phase 2> \"Expansion\""
  2. Enter Summary with special characters: "Budget: $50,000 (50% increase). Contact: fatima@amani.org."
  3. Proceed to the next step and verify data integrity
- **Test Data:** Special characters: apostrophe, ampersand, angle brackets, quotes, dollar sign
- **Expected Results:**
  - All special characters are accepted and stored correctly
  - No XSS vulnerability (angle brackets are escaped in display)
  - Data displays correctly on the review step

### TC-EDGE-005: Session Timeout Handling
- **Category:** Edge Cases & Error Handling
- **Priority:** P2 High
- **Preconditions:** Logged in as fatima@amani.org
- **Steps:**
  1. Log in and navigate to the dashboard
  2. Wait for the session to timeout (or manually clear the session cookie)
  3. Attempt to navigate to a protected page
- **Test Data:** N/A
- **Expected Results:**
  - User is redirected to the login page
  - A message indicates the session has expired

---

## 17. Cross-Role End-to-End Workflows (TC-E2E)

### TC-E2E-001: Full Grant Lifecycle - Creation to Report Review

**Description:** Complete lifecycle: Donor creates a grant, NGO discovers and applies, Reviewer scores, Donor awards, NGO submits a report, Donor reviews and accepts.

- **Category:** Cross-Role Workflows
- **Priority:** P1 Critical
- **Preconditions:** Application is running; all test users available

**Phase 1: Donor Creates Grant**
- **Steps:**
  1. Log in as david@eatrust.org (Donor)
  2. Click "Create Grant" in the sidebar
  3. Complete all 5 steps:
     - Title: "Agricultural Innovation Grant for East Africa"
     - Amount: $400,000, USD, Deadline: 2026-08-15, Duration: 18 months
     - Countries: Kenya, Uganda, Tanzania; Sectors: Food Security, Agriculture, Climate; Min score: 50
     - Criteria: Technical 30%, Innovation 25%, Sustainability 25%, Impact 20%
     - Upload `grant_agreement_sample.txt`; Quarterly financial, semi-annual progress reports
  4. Save as Draft, then Publish
  5. Log out

**Phase 1 Expected Results:**
  - Grant is created and published with status "Open"
  - Grant appears in NGO Browse Grants

**Phase 2: NGO Discovers and Applies**
- **Steps:**
  1. Log in as peter@hopebridges.org (Uganda, Health/Climate)
  2. Browse Grants, search "Agricultural Innovation"
  3. Click Apply, complete all 4 steps with proposal and documents
  4. Submit application, log out

**Phase 2 Expected Results:**
  - Application is submitted with AI score generated

**Phase 3: Reviewer Scores, Donor Awards, NGO Reports, Donor Accepts**
- **Steps:**
  1. Log in as james@reviewer.org, score the application
  2. Log in as david@eatrust.org, review rankings and award
  3. Log in as the awarded NGO, create and submit a report
  4. Log in as david@eatrust.org, review and accept the report

**Phase 3 Expected Results:**
  - Complete grant lifecycle from creation through report acceptance is verified

### TC-E2E-002: NGO Assessment to Application Pipeline

**Description:** NGO completes assessment, uploads documents with AI scoring, browses grants, and submits application.

- **Category:** Cross-Role Workflows
- **Priority:** P1 Critical
- **Preconditions:** Logged in as thandi@ubuntu.org

- **Steps:**
  1. Complete CHS framework assessment (all 4 steps with documents)
  2. Upload documents to My Documents (audit report, impact report, financial report) with AI scoring
  3. Browse Grants, filter by Education, view Grant 2
  4. Apply to Grant 2, complete all steps, submit
- **Test Data:** Ubuntu Education Trust, South Africa, Education; files: compliance_checklist.txt, registration_certificate.txt, audit_report_2025.txt, impact_report_annual_2025.txt
- **Expected Results:**
  - Assessment completed, documents scored, application submitted
  - End-to-end pipeline from assessment to application is verified

### TC-E2E-003: Report Revision Cycle

**Description:** NGO submits a report, Donor requests revision, NGO revises and resubmits, Donor accepts.

- **Category:** Cross-Role Workflows
- **Priority:** P2 High
- **Preconditions:** Report 4 (Annual Impact Report 2025) has status "Revision Requested"

- **Steps:**
  1. Log in as fatima@amani.org, open Report 4, review donor notes, revise, resubmit
  2. Log in as sarah@globalhealth.org, review revised report, accept
- **Test Data:** N/A
- **Expected Results:**
  - Revision notes visible, report editable, resubmission works
  - Report status changes to "Accepted" after donor review

### TC-E2E-004: Multi-NGO Application Competition

**Description:** Donor reviews and compares multiple NGO applications using ranking system.

- **Category:** Cross-Role Workflows
- **Priority:** P2 High
- **Preconditions:** Grant 1 has applications from Amani (score 78.5), Salam (score 62.3)

- **Steps:**
  1. Log in as sarah@globalhealth.org
  2. Navigate to Rankings for Grant 1
  3. View ranked list, review both applications
  4. Verify Hope Bridges draft does NOT appear in rankings
- **Test Data:** N/A
- **Expected Results:**
  - Amani (78.5) ranks above Salam (62.3)
  - Draft applications excluded from rankings

---

## 18. Live Registration Verification (TC-REGV)

### TC-REGV-001: Verify Kenya-Registered Organization with Valid Registration Number
- **Category:** Registration Verification
- **Priority:** P1 Critical
- **Preconditions:** Logged in as sarah@globalhealth.org (Donor) or admin@kuja.org; registration verification feature is accessible; system has connectivity to external registry sources
- **Steps:**
  1. Navigate to the Compliance & Due Diligence section or Organization Verification page
  2. Select or search for an organization registered in Kenya
  3. Enter registration number: `OP.218/051/924/84` (ActionAid International Kenya)
  4. Select country: Kenya
  5. Select registry: NGO Coordination Board / BRS
  6. Click "Verify Registration" or equivalent button
  7. Wait for verification process to complete
- **Test Data:** Organization: ActionAid International Kenya; Registration Number: OP.218/051/924/84; Country: Kenya; Registry: BRS (https://brs.go.ke/)
- **Expected Results:**
  - System initiates verification against the Kenya NGO Coordination Board / BRS portal
  - Verification status returns as "Verified" or "Confirmed"
  - Organization name, registration number, and registration authority are displayed
  - Verification timestamp is recorded
  - A green checkmark or "Verified" badge appears on the organization profile
  - If the BRS web portal is unavailable, a clear message indicates the registry could not be reached and verification is pending

### TC-REGV-002: Verify Nigeria-Registered Organization via CAC Portal
- **Category:** Registration Verification
- **Priority:** P1 Critical
- **Preconditions:** Logged in as donor or admin; registration verification feature is accessible
- **Steps:**
  1. Navigate to the Registration Verification page
  2. Enter organization details for a Nigeria-registered entity
  3. Enter registration number format: `CAC/IT/NO XXXXX` (Incorporated Trustees format)
  4. Select country: Nigeria
  5. Select registry: Corporate Affairs Commission (CAC)
  6. Click "Verify Registration"
  7. Wait for verification to complete
- **Test Data:** Country: Nigeria; Registry: CAC (https://search.cac.gov.ng/); Registration format: CAC/IT/NO followed by 5-digit number
- **Expected Results:**
  - System queries the CAC searchable portal
  - If the organization is found, verification status returns "Verified"
  - Organization name, registration number, and entity type (Incorporated Trustees) are displayed
  - If not found, status returns "Not Found" with a recommendation to verify manually
  - CAC portal connectivity issues are handled gracefully with a retry option

### TC-REGV-003: Verify South Africa NPO via npo.gov.za Registry
- **Category:** Registration Verification
- **Priority:** P1 Critical
- **Preconditions:** Logged in as donor or admin; registration verification feature is accessible
- **Steps:**
  1. Navigate to the Registration Verification page
  2. Enter organization: "Gift of the Givers Foundation"
  3. Enter NPO registration number: `NPO 032-031`
  4. Select country: South Africa
  5. Select registry: DSD NPO Registry
  6. Click "Verify Registration"
  7. Wait for verification to complete
  8. Repeat with "Treatment Action Campaign" (NPO 043-770) to verify a second entity
  9. Repeat with "Nelson Mandela Foundation" (NPO 034-681) to verify a third entity
- **Test Data:** Gift of the Givers: NPO 032-031; Treatment Action Campaign: NPO 043-770; Nelson Mandela Foundation: NPO 034-681; Registry: https://www.npo.gov.za/ and CIPC API at https://apim.cipc.co.za/
- **Expected Results:**
  - System queries the South Africa NPO Registry (npo.gov.za) or CIPC REST API
  - All three organizations return "Verified" status
  - NPO number, organization name, and registration date are displayed
  - If the CIPC API is used, the REST API response is parsed correctly
  - Results are cached to avoid redundant API calls within a session

### TC-REGV-004: Verify Uganda Organization via NGO Bureau
- **Category:** Registration Verification
- **Priority:** P1 Critical
- **Preconditions:** Logged in as donor or admin; registration verification feature is accessible
- **Steps:**
  1. Navigate to the Registration Verification page
  2. Enter organization: "World Vision Uganda"
  3. Select country: Uganda
  4. Select registry: NGO Bureau
  5. Click "Verify Registration"
  6. Wait for verification to complete
  7. Repeat with "BRAC Uganda"
- **Test Data:** Organizations: World Vision Uganda, BRAC Uganda; Registry: https://ngobureau.go.ug/en/updated-national-ngo-register (web table format)
- **Expected Results:**
  - System queries the Uganda NGO Bureau register (web table scraping or API if available)
  - Both organizations return "Verified" status
  - Organization name and registration details are displayed
  - If web scraping is used, data is parsed correctly from the HTML table format
  - Verification timestamp is recorded

### TC-REGV-005: Attempt Verification for Somalia Organization (No Online Registry)
- **Category:** Registration Verification
- **Priority:** P1 Critical
- **Preconditions:** Logged in as donor or admin; viewing Salam Relief Foundation (Somalia) profile
- **Steps:**
  1. Navigate to Registration Verification for Salam Relief Foundation
  2. Select country: Somalia
  3. Attempt to initiate verification
- **Test Data:** Organization: Salam Relief Foundation; Country: Somalia; Registry: MOIFAR (no online portal)
- **Expected Results:**
  - System recognizes that Somalia (MOIFAR) has no online registry available
  - A graceful message is displayed: "No online registry available for Somalia. The Ministry of Interior, Federal Affairs and Reconciliation (MOIFAR) does not provide a publicly accessible digital registry. Manual verification is required."
  - System suggests alternative verification methods (e.g., request physical registration certificate, contact MOIFAR directly)
  - Verification status is set to "Manual Verification Required" (not "Failed" or "Unverified")
  - The organization is not penalized or flagged negatively for the lack of online registry

### TC-REGV-006: Verify with Invalid/Fake Registration Number
- **Category:** Registration Verification
- **Priority:** P2 High
- **Preconditions:** Logged in as donor or admin; registration verification feature is accessible
- **Steps:**
  1. Navigate to Registration Verification
  2. Enter organization: "Fake NGO International"
  3. Enter registration number: `FAKE-12345-INVALID`
  4. Select country: Kenya
  5. Select registry: NGO Coordination Board / BRS
  6. Click "Verify Registration"
  7. Wait for verification to complete
- **Test Data:** Organization: Fake NGO International; Registration Number: FAKE-12345-INVALID; Country: Kenya
- **Expected Results:**
  - Verification fails with status "Not Verified" or "Not Found"
  - A warning flag is applied to the organization profile
  - System displays a message: "Registration number could not be verified against the Kenya NGO Coordination Board registry"
  - Donor/admin is alerted about the failed verification
  - The failed verification is logged in the audit trail

### TC-REGV-007: Verify with Expired Registration
- **Category:** Registration Verification
- **Priority:** P2 High
- **Preconditions:** Logged in as donor or admin; a test organization has an expired registration on file
- **Steps:**
  1. Navigate to Registration Verification
  2. Enter an organization whose registration has expired or lapsed
  3. Submit for verification
  4. Review the verification results
- **Test Data:** An organization with an expired registration date (e.g., registration valid through 2024-12-31, now expired)
- **Expected Results:**
  - Verification returns a "Warning" status (not fully verified, not fully rejected)
  - Warning message: "Registration found but may be expired. Last known valid registration date: [date]. Please request updated registration documentation."
  - A yellow/amber warning indicator is displayed (distinct from green verified or red unverified)
  - System recommends the NGO upload a current registration certificate
  - Donor can manually override the warning after reviewing supporting documents

### TC-REGV-008: AI Analysis of Uploaded Registration Certificate vs Registry Data
- **Category:** Registration Verification
- **Priority:** P2 High
- **Preconditions:** Logged in as donor or admin; an NGO has uploaded `registration_certificate.txt`; registry verification has been completed for the same organization
- **Steps:**
  1. Navigate to the organization's verification page
  2. Locate the uploaded registration certificate document
  3. Trigger AI analysis to cross-reference the certificate content against registry verification data
  4. Review the AI analysis results
- **Test Data:** File: registration_certificate.txt; Registry data from a previous verification (TC-REGV-001 through TC-REGV-004)
- **Expected Results:**
  - AI reads the uploaded registration certificate and extracts: organization name, registration number, issuing authority, registration date, expiry date
  - AI cross-references extracted data against the registry verification results
  - AI reports any discrepancies (e.g., name mismatch, registration number difference, expired date)
  - If data matches, AI confirms consistency with a confidence score
  - If discrepancies exist, AI flags specific mismatches with details
  - Analysis results are displayed in a clear comparison format (certificate data vs registry data)

### TC-REGV-009: Bulk Verification Status Dashboard (Donor View)
- **Category:** Registration Verification
- **Priority:** P2 High
- **Preconditions:** Logged in as sarah@globalhealth.org (Donor); multiple NGOs have applied to Global Health Fund grants
- **Steps:**
  1. Navigate to the Compliance & Due Diligence dashboard
  2. Locate the "Registration Verification" section or tab
  3. View the verification status for all NGOs that have applied to the donor's grants
  4. Review the summary statistics (verified, pending, unverified, manual review required)
  5. Sort by verification status
  6. Click on an individual NGO to see detailed verification results
- **Test Data:** NGOs: Amani Community Development (Kenya), Salam Relief Foundation (Somalia), Hope Bridges Initiative (Uganda), Sahel Women's Network (Nigeria)
- **Expected Results:**
  - Dashboard displays a table/list of all applicant NGOs with their verification status
  - Each row shows: organization name, country, registration number, verification status, last verified date
  - Summary statistics show counts: X verified, Y pending, Z manual review required
  - Sorting and filtering work correctly
  - Clicking on an NGO navigates to detailed verification results
  - Somalia-based organizations show "Manual Verification Required" status

### TC-REGV-010: Verification Status Updates in Real-Time
- **Category:** Registration Verification
- **Priority:** P3 Medium
- **Preconditions:** Logged in as donor or admin; a verification request has been initiated
- **Steps:**
  1. Initiate a verification request for an organization
  2. Observe the status indicator while verification is processing
  3. Wait for verification to complete
  4. Verify the status updates without requiring a page refresh
  5. Navigate away and return to confirm the final status is persisted
- **Test Data:** Any verifiable organization from TC-REGV-001 through TC-REGV-004
- **Expected Results:**
  - During processing, a loading/spinner indicator is shown with status "Verifying..."
  - Status transitions are visible: "Pending" -> "Verifying..." -> "Verified" (or "Not Verified")
  - If real-time updates are supported (e.g., WebSocket or polling), the page updates without manual refresh
  - If polling is used, updates appear within 5-10 seconds
  - Final status is persisted in the database and visible on subsequent page loads
  - Other users (e.g., the NGO themselves) can see the verification status on their profile

---

## 19. Live Sanctions Screening (TC-SANC)

### TC-SANC-001: Screen Known Clean Organization - All Lists Clear
- **Category:** Sanctions Screening
- **Priority:** P1 Critical
- **Preconditions:** Logged in as sarah@globalhealth.org (Donor) or admin@kuja.org; sanctions screening feature is accessible; system has connectivity to sanctions databases
- **Steps:**
  1. Navigate to the Compliance & Due Diligence section or Sanctions Screening page
  2. Select or search for "Amani Community Development"
  3. Click "Screen for Sanctions" or equivalent button
  4. Wait for screening to complete against all configured databases
- **Test Data:** Organization: Amani Community Development; Expected databases checked: UN Security Council Consolidated List, OFAC SDN List, EU Consolidated Financial Sanctions List, World Bank Debarment List
- **Expected Results:**
  - Screening completes against all four sanctions databases (UN, OFAC, EU, World Bank)
  - All results return "Clear" / "No Match"
  - A green "All Clear" indicator is displayed
  - Each database is listed with its individual result (e.g., "UN Consolidated: Clear", "OFAC SDN: Clear", "EU Sanctions: Clear", "World Bank Debarment: Clear")
  - Screening timestamp is recorded
  - If OpenSanctions API is used as unified source, the combined "sanctions" dataset result is displayed

### TC-SANC-002: Screen Name Matching UN-Sanctioned Entity
- **Category:** Sanctions Screening
- **Priority:** P1 Critical
- **Preconditions:** Logged in as donor or admin; sanctions screening feature is accessible
- **Steps:**
  1. Navigate to the Sanctions Screening page
  2. Enter entity name: "Al-Shabaab" (or a test entity name that matches)
  3. Select screening databases: UN Security Council Consolidated List
  4. Click "Screen"
  5. Wait for results
- **Test Data:** Entity: Al-Shabaab; Database: UN Security Council Consolidated List (https://scsanctions.un.org/resources/xml/en/consolidated.xml); Known listing: Somalia, listed 2010
- **Expected Results:**
  - Screening returns a "MATCH FOUND" or "FLAGGED" result
  - Entity details from the UN list are displayed: entity name, listing date (2010), country (Somalia), sanctions regime
  - A red alert indicator is prominently displayed
  - System blocks or warns against proceeding with any grant relationship with this entity
  - Match details include the UN reference number and listing narrative
  - The alert is logged in the compliance audit trail

### TC-SANC-003: Screen Name Matching OFAC SDN List
- **Category:** Sanctions Screening
- **Priority:** P1 Critical
- **Preconditions:** Logged in as donor or admin; sanctions screening feature is accessible
- **Steps:**
  1. Navigate to the Sanctions Screening page
  2. Enter entity name: "Boko Haram" (or formal name "Jama'atu Ahlis Sunna Lidda'awati Wal Jihad")
  3. Select screening database: OFAC SDN List
  4. Click "Screen"
  5. Wait for results
- **Test Data:** Entity: Boko Haram / Jama'atu Ahlis Sunna Lidda'awati Wal Jihad; Database: OFAC SDN List (https://www.treasury.gov/ofac/downloads/sdn.csv); Known listing: SDGT program, Nigeria
- **Expected Results:**
  - Screening returns a "MATCH FOUND" or "FLAGGED" result
  - OFAC SDN entry details are displayed: entity name, aliases, program (SDGT), country (Nigeria)
  - Red alert indicator is prominently displayed
  - System provides the OFAC entry ID and reference details
  - Both the common name "Boko Haram" and formal name should trigger a match

### TC-SANC-004: Screen Name Matching EU Consolidated Sanctions List
- **Category:** Sanctions Screening
- **Priority:** P1 Critical
- **Preconditions:** Logged in as donor or admin; sanctions screening feature is accessible
- **Steps:**
  1. Navigate to the Sanctions Screening page
  2. Enter entity name: "Ansar Eddine"
  3. Select screening database: EU Consolidated Financial Sanctions List
  4. Click "Screen"
  5. Wait for results
- **Test Data:** Entity: Ansar Eddine; Database: EU Consolidated Financial Sanctions List (CSV endpoint); Known listing: Mali-based entity
- **Expected Results:**
  - Screening returns a "MATCH FOUND" or "FLAGGED" result
  - EU sanctions entry details are displayed: entity name, country (Mali), listing reference
  - Red alert indicator is displayed
  - If screening "M23/ARC" or "Alliance Fleuve Congo" (DRC-based), similar match results are expected

### TC-SANC-005: Screen Name Matching World Bank Debarment List
- **Category:** Sanctions Screening
- **Priority:** P1 Critical
- **Preconditions:** Logged in as donor or admin; sanctions screening feature is accessible
- **Steps:**
  1. Navigate to the Sanctions Screening page
  2. Enter entity name: "Gitto Costruzioni Generali Nigeria Limited"
  3. Select screening database: World Bank Debarment List
  4. Click "Screen"
  5. Wait for results
  6. Repeat with "Sego Ventures Nigeria Limited"
- **Test Data:** Entities: Gitto Costruzioni Generali Nigeria Limited, Sego Ventures Nigeria Limited; Database: World Bank Debarment List (https://www.worldbank.org/en/projects-operations/procurement/debarred-firms); Country: Nigeria
- **Expected Results:**
  - Both entities return "MATCH FOUND" against the World Bank Debarment List
  - Debarment details are displayed: entity name, country, debarment dates, grounds for debarment
  - Red alert indicator is displayed for each
  - System distinguishes between sanctions lists (UN/OFAC/EU) and debarment lists (World Bank) in the results

### TC-SANC-006: Screen with Fuzzy Name Match (Partial Match)
- **Category:** Sanctions Screening
- **Priority:** P2 High
- **Preconditions:** Logged in as donor or admin; sanctions screening feature supports fuzzy matching
- **Steps:**
  1. Navigate to the Sanctions Screening page
  2. Enter a partial or slightly misspelled name: "Al Shabab" (missing one 'a')
  3. Click "Screen" against all databases
  4. Review results
  5. Repeat with "Boko Hram" (misspelled)
  6. Repeat with "Gitto Nigeria" (abbreviated)
- **Test Data:** Fuzzy names: "Al Shabab", "Boko Hram", "Gitto Nigeria"
- **Expected Results:**
  - System performs fuzzy matching with a similarity/confidence score
  - "Al Shabab" returns a match for "Al-Shabaab" with a high confidence score (e.g., 90%+)
  - "Boko Hram" returns a potential match for "Boko Haram" with a warning indicator
  - Results show the match confidence score alongside the sanctioned entity name
  - Amber/yellow warning indicator is used for fuzzy matches (distinct from exact match red alerts)
  - System recommends manual review for fuzzy matches rather than automatic blocking
  - If OpenSanctions API is used, the match score from the API response is displayed

### TC-SANC-007: Screen Individual Names (Key Personnel)
- **Category:** Sanctions Screening
- **Priority:** P2 High
- **Preconditions:** Logged in as donor or admin; sanctions screening supports individual person screening
- **Steps:**
  1. Navigate to the Sanctions Screening page
  2. Switch to "Individual" screening mode (if separate from entity screening)
  3. Enter a test individual name that is known to be on a sanctions list
  4. Click "Screen"
  5. Review results
  6. Enter a clean individual name (e.g., "Fatima Hassan") and screen
  7. Verify clean result
- **Test Data:** A known sanctioned individual name from the UN or OFAC list; Clean name: Fatima Hassan
- **Expected Results:**
  - Known sanctioned individual returns a match with listing details
  - Clean individual name returns "No Match" / "Clear"
  - Individual screening checks both entity lists and individual designations
  - Results include the individual's aliases, nationality, and listing details if matched
  - Key personnel screening can be linked to an organization's profile

### TC-SANC-008: Bulk Screening of All NGOs in System
- **Category:** Sanctions Screening
- **Priority:** P2 High
- **Preconditions:** Logged in as sarah@globalhealth.org (Donor) or admin@kuja.org; multiple NGOs exist in the system
- **Steps:**
  1. Navigate to the Compliance & Due Diligence dashboard
  2. Locate the "Bulk Sanctions Screening" option or "Screen All Organizations" button
  3. Click to initiate bulk screening
  4. Wait for all screenings to complete
  5. Review the summary dashboard
- **Test Data:** All NGOs in system: Amani Community Development, Salam Relief Foundation, Ubuntu Education Trust, Hope Bridges Initiative, Sahel Women's Network
- **Expected Results:**
  - Bulk screening processes all 5 NGO organizations
  - A progress indicator shows screening progress (e.g., "3 of 5 complete")
  - Summary dashboard displays: X clear, Y flagged, Z pending
  - All 5 test NGOs should return "Clear" (they are fictional clean organizations)
  - Each organization's individual screening result is accessible
  - Bulk screening timestamp is recorded for compliance audit purposes
  - Results are sortable and filterable

### TC-SANC-009: Re-Screening After List Update
- **Category:** Sanctions Screening
- **Priority:** P2 High
- **Preconditions:** Logged in as donor or admin; previous screening results exist for at least one organization
- **Steps:**
  1. Navigate to an organization that was previously screened and cleared (e.g., Amani Community Development)
  2. View the existing screening results with timestamp
  3. Click "Re-Screen" or "Update Screening"
  4. Wait for new screening to complete
  5. Compare new results with previous results
- **Test Data:** Organization: Amani Community Development; Previous screening: Clear
- **Expected Results:**
  - Re-screening initiates fresh queries against all sanctions databases
  - New results are displayed alongside or replacing the previous results
  - Previous screening timestamp and current screening timestamp are both visible
  - If results are unchanged, system confirms "No change since last screening on [date]"
  - If results have changed (new match found), system prominently alerts about the change
  - Screening history is maintained (not overwritten) for audit trail purposes

### TC-SANC-010: Screening with Aliases and Name Variations
- **Category:** Sanctions Screening
- **Priority:** P2 High
- **Preconditions:** Logged in as donor or admin; sanctions screening supports alias matching
- **Steps:**
  1. Navigate to the Sanctions Screening page
  2. Screen "Jama'atu Ahlis Sunna Lidda'awati Wal Jihad" (formal name of Boko Haram)
  3. Verify it matches the same entity as "Boko Haram"
  4. Screen "JNIM" (abbreviation for Jama'at Nusrat al-Islam wal-Muslimin)
  5. Screen "FDLR" (abbreviation for Forces Democratiques de Liberation du Rwanda)
  6. Verify alias resolution works correctly
- **Test Data:** Formal names, abbreviations, and aliases for sanctioned entities: "Jama'atu Ahlis Sunna Lidda'awati Wal Jihad" = "Boko Haram"; "JNIM" = Jama'at Nusrat al-Islam wal-Muslimin (Mali, OFAC SDGT); "FDLR" = Forces Democratiques de Liberation du Rwanda (DRC, UN listed 2012)
- **Expected Results:**
  - All name variations, aliases, and abbreviations resolve to the correct sanctioned entity
  - Formal names and common names produce the same match result
  - Abbreviations (JNIM, FDLR) are recognized and matched
  - Entity details show all known aliases alongside the primary name
  - The system handles special characters in names (apostrophes, diacritics) correctly

---

## 20. AI Document Analysis Against Donor Requirements (TC-AIDOC)

### TC-AIDOC-001: Upload Financial Report Against Donor-Specific Financial Requirements
- **Category:** AI Document Analysis
- **Priority:** P1 Critical
- **Preconditions:** Logged in as fatima@amani.org (NGO); a grant has been awarded with donor-specified financial reporting requirements (e.g., "budget vs actuals, burn rate, variance analysis"); the report submission page is accessible
- **Steps:**
  1. Navigate to Reports and create a new Financial Report for Grant 1
  2. Upload `financial_report_q1_2026.txt` as the report attachment
  3. Wait for AI analysis to complete
  4. Review the AI analysis results focusing on requirement-by-requirement scoring
- **Test Data:** File: financial_report_q1_2026.txt; Donor requirements for financial reports: "Must include budget vs actuals comparison, burn rate calculation, variance analysis with explanations for variances over 10%, and expenditure breakdown by budget line"
- **Expected Results:**
  - AI analyzes the uploaded financial report against the donor's specific financial reporting requirements
  - Results show a criterion-by-criterion breakdown:
    - Budget vs actuals: Score and finding (e.g., "Present - budget and actual figures provided for all categories")
    - Burn rate: Score and finding (e.g., "Calculated at 96% for the quarter")
    - Variance analysis: Score and finding
    - Expenditure breakdown: Score and finding
  - Overall compliance score is calculated as a weighted average of individual criterion scores
  - AI provides specific quotes or references from the document to support each scoring decision
  - Missing requirements are clearly identified with "Not Found" or "Insufficient" status

### TC-AIDOC-002: Upload Narrative Report Against Gender-Disaggregated Data Requirements
- **Category:** AI Document Analysis
- **Priority:** P1 Critical
- **Preconditions:** Logged in as an NGO user; a grant requires narrative reports with "beneficiary data disaggregated by gender and age"
- **Steps:**
  1. Navigate to Reports for the applicable grant
  2. Upload a narrative report document
  3. Wait for AI analysis to complete
  4. Review whether AI checks for gender and age disaggregation
- **Test Data:** Donor requirement: "Narrative reports must include beneficiary data disaggregated by gender and age, with specific attention to vulnerable populations"; Upload: excellent_narrative_report.txt or a custom narrative report
- **Expected Results:**
  - AI specifically checks for the presence of gender-disaggregated data
  - AI checks for age-disaggregated data
  - AI checks for vulnerable population data
  - Each criterion is scored independently
  - If disaggregated data is present, AI notes what categories are covered
  - If disaggregated data is missing, AI identifies the gap with a specific recommendation

### TC-AIDOC-003: Upload Audit Report Against Donor Audit Requirements
- **Category:** AI Document Analysis
- **Priority:** P1 Critical
- **Preconditions:** Logged in as an NGO user; donor requires "independent qualified firm, management letter included"
- **Steps:**
  1. Navigate to Reports or document upload for the applicable grant
  2. Upload `audit_report_2025.txt`
  3. Wait for AI analysis to complete
  4. Review whether AI verifies audit-specific criteria
- **Test Data:** File: audit_report_2025.txt; Donor audit requirements: "Audit must be conducted by an independent qualified firm (CPA or equivalent), must include a management letter, and must follow International Standards on Auditing (ISA)"
- **Expected Results:**
  - AI checks whether the audit report identifies an independent qualified firm
  - AI checks for the presence of a management letter
  - AI checks for references to ISA or equivalent auditing standards
  - Each requirement is scored with specific evidence from the document
  - Missing elements are flagged with clear recommendations

### TC-AIDOC-004: Upload Excellent Report Against Strict Requirements - Expect High Score
- **Category:** AI Document Analysis
- **Priority:** P2 High
- **Preconditions:** Logged in as an NGO user; donor has strict, multi-criteria reporting requirements configured
- **Steps:**
  1. Navigate to the report submission page for a grant with comprehensive requirements
  2. Upload `excellent_narrative_report.txt`
  3. Wait for AI analysis to complete
  4. Review the detailed criterion-by-criterion breakdown
- **Test Data:** File: excellent_narrative_report.txt; Requirements: comprehensive set of narrative reporting criteria including beneficiary stories, quantitative outcomes, lessons learned, sustainability plan, and partner contributions
- **Expected Results:**
  - AI returns a high overall compliance score (e.g., 85%+ or equivalent)
  - Detailed criterion-by-criterion breakdown shows most or all criteria as "Met" or "Exceeded"
  - AI provides specific evidence/quotes from the document for each criterion
  - Any areas for improvement are minor and constructive
  - The analysis demonstrates that the AI genuinely reads and evaluates document content (not generic responses)

### TC-AIDOC-005: Upload Poor Quality Report Against Requirements - Expect Low Score
- **Category:** AI Document Analysis
- **Priority:** P2 High
- **Preconditions:** Logged in as an NGO user; donor has specific reporting requirements configured
- **Steps:**
  1. Navigate to the report submission page for a grant with specific requirements
  2. Upload `poor_quality_report.txt`
  3. Wait for AI analysis to complete
  4. Review the criterion-by-criterion breakdown
- **Test Data:** File: poor_quality_report.txt; Requirements: same comprehensive criteria as TC-AIDOC-004
- **Expected Results:**
  - AI returns a low overall compliance score (e.g., below 50% or equivalent)
  - Criterion-by-criterion breakdown shows multiple criteria as "Not Met" or "Insufficient"
  - AI identifies specific gaps: missing sections, vague data, lack of evidence
  - AI provides actionable recommendations for each unmet criterion
  - The contrast with TC-AIDOC-004 demonstrates that AI scoring is discriminating (not giving similar scores to all documents)

### TC-AIDOC-006: Upload Empty Template - Expect Very Low Score
- **Category:** AI Document Analysis
- **Priority:** P2 High
- **Preconditions:** Logged in as an NGO user; donor has reporting requirements configured
- **Steps:**
  1. Navigate to the report submission page for a grant
  2. Upload `empty_template.txt`
  3. Wait for AI analysis to complete
  4. Review the analysis results
- **Test Data:** File: empty_template.txt (empty or near-empty file)
- **Expected Results:**
  - AI returns a very low or zero compliance score
  - AI identifies that the document is empty or contains no substantive content
  - All donor requirements are listed as "Not Met" / "Missing"
  - AI provides a clear message: "The uploaded document does not contain sufficient content for analysis"
  - System may warn the user before submission that the document appears to be empty
  - Each requirement is listed with "Not addressed" status

### TC-AIDOC-007: Upload French Report - Multi-Language Analysis
- **Category:** AI Document Analysis
- **Priority:** P2 High
- **Preconditions:** Logged in as an NGO user; donor requirements are specified in English
- **Steps:**
  1. Navigate to the report submission page for a grant
  2. Upload `french_project_report.txt`
  3. Wait for AI analysis to complete
  4. Review the analysis results
- **Test Data:** File: french_project_report.txt (French-language report); Donor requirements: in English
- **Expected Results:**
  - AI successfully processes the French-language document
  - AI evaluates the French content against English-language donor requirements (cross-language analysis)
  - Analysis results are presented in English (or the user's selected language)
  - Scores reflect the actual content quality, not penalized for being in French
  - AI may note that the document is in French and provide translated summaries of key findings
  - Language detection is accurate

### TC-AIDOC-008: Upload Arabic Grant Agreement - RTL Language Analysis
- **Category:** AI Document Analysis
- **Priority:** P2 High
- **Preconditions:** Logged in as an NGO user; system supports Arabic/RTL document analysis
- **Steps:**
  1. Navigate to the report submission or document upload page
  2. Upload `arabic_grant_agreement.txt`
  3. Wait for AI analysis to complete
  4. Review the analysis results
- **Test Data:** File: arabic_grant_agreement.txt (Arabic-language document)
- **Expected Results:**
  - AI successfully processes the Arabic-language (RTL) document
  - AI extracts relevant content and evaluates it against configured requirements
  - Analysis results are coherent and reference specific sections of the Arabic document
  - RTL text rendering does not cause display issues in the analysis results
  - Scores reflect actual content quality

### TC-AIDOC-009: Donor Changes Requirements After Upload - AI Re-Analyzes
- **Category:** AI Document Analysis
- **Priority:** P2 High
- **Preconditions:** Logged in as sarah@globalhealth.org (Donor); a report has been previously uploaded and analyzed by an NGO
- **Steps:**
  1. Navigate to the grant management or reporting requirements section
  2. Modify the reporting requirements for an existing grant (e.g., add a new criterion: "Must include a sustainability exit strategy")
  3. Save the updated requirements
  4. Navigate to a previously submitted report for that grant
  5. Trigger re-analysis (or verify it happens automatically)
  6. Review the updated AI analysis results
- **Test Data:** New requirement added: "Must include a sustainability exit strategy"; Previously uploaded report: financial_report_q1_2026.txt
- **Expected Results:**
  - Updated requirements are saved successfully
  - Re-analysis runs against the new requirements
  - The new criterion ("sustainability exit strategy") appears in the analysis results
  - The previously uploaded document is evaluated against the new criterion
  - Previous scores for unchanged criteria remain consistent
  - The new criterion likely shows as "Not Met" since the financial report may not contain it
  - Analysis timestamp is updated to reflect the re-analysis

### TC-AIDOC-010: AI Provides Specific Recommendations for Improvement Per Requirement
- **Category:** AI Document Analysis
- **Priority:** P2 High
- **Preconditions:** Logged in as an NGO user; a document has been uploaded and analyzed with mixed results (some criteria met, some not)
- **Steps:**
  1. Upload a document that meets some but not all donor requirements (e.g., `poor_quality_report.txt` or a partially complete report)
  2. Wait for AI analysis
  3. Review the recommendations section for each unmet requirement
  4. Verify that recommendations are specific and actionable
- **Test Data:** File: poor_quality_report.txt or a custom partial report; Donor requirements: multiple criteria
- **Expected Results:**
  - For each unmet requirement, AI provides a specific recommendation (not generic advice)
  - Recommendations reference the specific requirement that was not met
  - Recommendations suggest concrete actions: "Add a table showing budget vs. actual expenditures by line item" rather than "Improve financial reporting"
  - Recommendations are prioritized (most critical gaps first)
  - Each recommendation includes what is missing and what should be added
  - Recommendations are constructive and professional in tone (suitable for NGO capacity building)

---

## 21. Grant Setup Wizard - Donor Requirements (TC-GWIZ)

### TC-GWIZ-001: Create Grant with Default Reporting Requirements
- **Category:** Grant Setup Wizard
- **Priority:** P1 Critical
- **Preconditions:** Logged in as sarah@globalhealth.org (Donor); on the Grant Creation page
- **Steps:**
  1. Navigate to "Create Grant" in the sidebar
  2. Complete Step 1 (Basic Info): Title: "Emergency Response Preparedness Fund", Amount: $200,000, Deadline: 2026-09-30
  3. Complete Step 2 (Eligibility): Countries: Kenya, Somalia; Sectors: Health, Protection
  4. Complete Step 3 (Criteria): Standard evaluation weights
  5. Proceed to the Reporting Requirements step
  6. Observe the default reporting requirements pre-populated by the system
  7. Accept the defaults without modification
  8. Save the grant as Draft
- **Test Data:** Grant: Emergency Response Preparedness Fund; $200,000; Kenya, Somalia; Health, Protection
- **Expected Results:**
  - Default reporting requirements are pre-populated (e.g., quarterly financial reports, semi-annual narrative reports, annual impact report, final report, audit)
  - Each default requirement shows: report type, frequency, description of what is expected
  - Defaults are reasonable and industry-standard for humanitarian grants
  - Grant can be saved with default requirements without modification
  - Defaults are stored and visible when the grant is later edited

### TC-GWIZ-002: Upload Grant Agreement - AI Extracts Reporting Requirements
- **Category:** Grant Setup Wizard
- **Priority:** P1 Critical
- **Preconditions:** Logged in as david@eatrust.org (Donor); on the Reporting Requirements step of the Grant Creation Wizard
- **Steps:**
  1. Navigate to "Create Grant" and proceed to the Reporting Requirements step
  2. Locate the "Upload Grant Agreement" or "Extract Requirements from Document" feature
  3. Upload `grant_agreement_sample.txt`
  4. Wait for AI to process the document
  5. Review the AI-extracted reporting requirements
- **Test Data:** File: grant_agreement_sample.txt; Expected extractions: reporting frequency, report types (financial quarterly, narrative semi-annual, impact annual, final report, audit), specific criteria for each report type
- **Expected Results:**
  - AI processes the grant agreement document
  - AI extracts and displays structured reporting requirements:
    - Financial reports: Quarterly frequency
    - Narrative/progress reports: Semi-annual frequency
    - Impact report: Annual
    - Final report: End of grant period
    - Audit: Annual or end of grant
  - Each extracted requirement shows the relevant section/clause from the agreement
  - Extraction accuracy is reasonable (AI may not capture every nuance)
  - Extracted requirements are editable by the donor before saving
  - A confidence indicator shows how certain the AI is about each extraction

### TC-GWIZ-003: Modify AI-Extracted Requirements
- **Category:** Grant Setup Wizard
- **Priority:** P1 Critical
- **Preconditions:** AI has extracted requirements from a grant agreement (TC-GWIZ-002 completed)
- **Steps:**
  1. Review the AI-extracted requirements displayed on screen
  2. Change the frequency of financial reports from "Quarterly" to "Monthly"
  3. Add a new criterion to narrative reports: "Must include case studies of at least 3 beneficiaries"
  4. Remove a requirement that was incorrectly extracted (if any)
  5. Reorder the requirements by priority
  6. Save the modified requirements
- **Test Data:** Modified frequency: Monthly; New criterion: "Must include case studies of at least 3 beneficiaries"
- **Expected Results:**
  - All AI-extracted requirements are editable (frequency, description, criteria)
  - New criteria can be added to any requirement type
  - Requirements can be deleted
  - Reordering (if supported) works correctly
  - Modified requirements are saved and reflect the donor's changes (not the original AI extraction)
  - A "Reset to AI-Extracted" option may be available to undo manual changes

### TC-GWIZ-004: Add Custom Document Type Requirements
- **Category:** Grant Setup Wizard
- **Priority:** P2 High
- **Preconditions:** Logged in as sarah@globalhealth.org (Donor); on the Reporting Requirements step of the Grant Creation Wizard
- **Steps:**
  1. Click "Add Custom Requirement" or "Add Document Type"
  2. Enter document type: "PSEA Policy"
  3. Set frequency: "One-time (at application)"
  4. Add evaluation criteria:
     - "Must include a clear definition of sexual exploitation and abuse"
     - "Must outline reporting mechanisms for SEA incidents"
     - "Must describe investigation procedures"
     - "Must include staff training protocols"
     - "Must be signed by the CEO or equivalent"
  5. Save the custom requirement
  6. Add another custom type: "Safeguarding Policy" with its own criteria
- **Test Data:** Document type: PSEA Policy; Criteria: 5 specific items as described; Additional type: Safeguarding Policy
- **Expected Results:**
  - Custom document types can be created with any name
  - Multiple evaluation criteria can be added to each document type
  - Each criterion can have a description and optional weight
  - Custom requirements appear alongside standard/AI-extracted requirements
  - All custom criteria will be used by AI when evaluating uploaded documents of that type

### TC-GWIZ-005: Set Per-Document-Type Evaluation Criteria for AI
- **Category:** Grant Setup Wizard
- **Priority:** P2 High
- **Preconditions:** Logged in as david@eatrust.org (Donor); on the Reporting Requirements step with multiple document types configured
- **Steps:**
  1. Select the "Financial Report" requirement type
  2. View and edit the AI evaluation criteria:
     - Add: "Budget vs actuals comparison must be present"
     - Add: "Burn rate must be calculated and reported"
     - Add: "Variances over 10% must include written explanations"
     - Add: "All expenditures must be categorized by budget line"
  3. Select the "Narrative Report" requirement type
  4. Set criteria:
     - "Beneficiary data disaggregated by gender"
     - "Beneficiary data disaggregated by age"
     - "Progress against stated objectives with quantitative indicators"
     - "Challenges encountered and mitigation strategies"
  5. Save all criteria
- **Test Data:** Financial criteria: 4 items; Narrative criteria: 4 items as described
- **Expected Results:**
  - Each document type has its own distinct set of evaluation criteria
  - Criteria are clearly associated with their document type
  - AI will use these specific criteria when analyzing uploaded documents of the corresponding type
  - Criteria are saved and persistent across page navigations
  - Criteria are visible to the NGO when they view grant requirements

### TC-GWIZ-006: Upload Arabic Grant Agreement - AI Extracts Requirements in English
- **Category:** Grant Setup Wizard
- **Priority:** P2 High
- **Preconditions:** Logged in as a donor; on the Reporting Requirements step of the Grant Creation Wizard
- **Steps:**
  1. Upload `arabic_grant_agreement.txt` to the grant agreement extraction field
  2. Wait for AI to process the Arabic-language document
  3. Review the extracted requirements
- **Test Data:** File: arabic_grant_agreement.txt (Arabic-language grant agreement)
- **Expected Results:**
  - AI successfully processes the Arabic-language document
  - Extracted requirements are presented in English (regardless of the source language)
  - Requirements are structured and coherent
  - AI may note that the source document was in Arabic
  - Extraction quality is comparable to English-language documents (within reasonable tolerance for translation complexity)

### TC-GWIZ-007: Preview How Requirements Will Appear to NGO Applicants
- **Category:** Grant Setup Wizard
- **Priority:** P2 High
- **Preconditions:** Logged in as a donor; reporting requirements have been configured (TC-GWIZ-001 through TC-GWIZ-005)
- **Steps:**
  1. Locate the "Preview" button or "View as NGO" option on the requirements configuration page
  2. Click to preview
  3. Review how the requirements will be presented to NGO applicants
  4. Verify all requirement types, frequencies, and criteria are visible
- **Test Data:** Previously configured requirements from TC-GWIZ-001 through TC-GWIZ-005
- **Expected Results:**
  - Preview shows the NGO's perspective of the grant requirements
  - All document types are listed with their frequencies
  - Evaluation criteria for each document type are visible
  - The preview is formatted clearly and professionally
  - No donor-only administrative details are shown in the preview
  - Preview can be closed to return to the editing view

### TC-GWIZ-008: Save Draft and Return to Edit Requirements Later
- **Category:** Grant Setup Wizard
- **Priority:** P2 High
- **Preconditions:** Logged in as david@eatrust.org (Donor); on the Reporting Requirements step with partially configured requirements
- **Steps:**
  1. Configure some but not all reporting requirements
  2. Click "Save Draft" or navigate away from the wizard
  3. Log out and log back in
  4. Navigate to the draft grant
  5. Open the grant for editing
  6. Navigate to the Reporting Requirements step
  7. Verify all previously configured requirements are preserved
- **Test Data:** Partially configured requirements
- **Expected Results:**
  - Draft is saved successfully with partial requirements
  - After re-login and re-navigation, all previously entered requirements are preserved
  - No data loss for partially completed requirement configurations
  - The wizard resumes at the correct step or allows navigation to the requirements step

### TC-GWIZ-009: Publish Grant with All Requirements - Verify in Grant Detail View
- **Category:** Grant Setup Wizard
- **Priority:** P1 Critical
- **Preconditions:** Logged in as david@eatrust.org (Donor); a grant has been fully configured with all reporting requirements
- **Steps:**
  1. Complete all steps of the Grant Creation Wizard including comprehensive reporting requirements
  2. Click "Publish" or "Open for Applications"
  3. Log out
  4. Log in as fatima@amani.org (NGO)
  5. Browse Grants and navigate to the newly published grant
  6. Click on the grant to view details
  7. Navigate to the "Documents" or "Requirements" tab
  8. Review the reporting requirements as visible to the NGO
- **Test Data:** Published grant with full reporting requirements
- **Expected Results:**
  - Grant is published and visible to NGOs
  - Grant detail page shows all configured reporting requirements
  - Requirements include: document types, frequencies, evaluation criteria
  - NGO can clearly understand what reports are required, how often, and what criteria will be used for evaluation
  - Requirements match exactly what the donor configured

### TC-GWIZ-010: Clone Existing Grant - Verify Requirements Are Copied
- **Category:** Grant Setup Wizard
- **Priority:** P3 Medium
- **Preconditions:** Logged in as sarah@globalhealth.org (Donor); Grant 1 exists with configured reporting requirements
- **Steps:**
  1. Navigate to Grant 1 (Community Health Workers Scale-Up Program) in the donor's grant list
  2. Click "Clone" or "Duplicate" grant
  3. Verify the Grant Creation Wizard opens with all fields pre-populated from Grant 1
  4. Navigate to the Reporting Requirements step
  5. Verify all reporting requirements from Grant 1 are copied
  6. Modify the grant title: "Community Health Workers Scale-Up Program Phase II"
  7. Modify the amount: "600000"
  8. Save as Draft
- **Test Data:** Source: Grant 1; New title: "Community Health Workers Scale-Up Program Phase II"; New amount: $600,000
- **Expected Results:**
  - Clone creates a new grant with all fields pre-populated from the source
  - Reporting requirements (types, frequencies, criteria) are fully copied
  - Modified fields (title, amount) reflect the changes
  - Cloned grant is saved as a new Draft (does not modify the original)
  - Original Grant 1 remains unchanged

---

## 22. NGO Reporting to Donor (TC-NGORPT)

### TC-NGORPT-001: NGO Creates New Financial Report for Awarded Grant
- **Category:** NGO Reporting
- **Priority:** P1 Critical
- **Preconditions:** Logged in as fatima@amani.org (NGO); Amani has an awarded grant (Grant 1 - Community Health Workers Scale-Up Program)
- **Steps:**
  1. Navigate to "Reports" in the sidebar
  2. Click "Create New Report"
  3. Select Grant: "Community Health Workers Scale-Up Program"
  4. Select Report Type: "Financial Report"
  5. Enter Report Title: "Q3 2026 Financial Report"
  6. Select reporting period: Q3 2026 (July - September 2026)
  7. Click "Create"
- **Test Data:** Grant: Grant 1; Type: Financial Report; Title: Q3 2026 Financial Report; Period: Q3 2026
- **Expected Results:**
  - Report creation form shows only grants where Amani has an awarded/active status
  - Report type dropdown reflects the types configured by the donor in the grant requirements
  - Report is created in "Draft" status
  - Report editor opens with sections aligned to the donor's financial reporting requirements
  - The reporting period matches the donor's required frequency (quarterly)

### TC-NGORPT-002: NGO Uploads Financial Report File - AI Analyzes Against Donor Requirements
- **Category:** NGO Reporting
- **Priority:** P1 Critical
- **Preconditions:** Report created in Draft status (TC-NGORPT-001); report editor is open
- **Steps:**
  1. In the report editor, locate the document attachment/upload section
  2. Upload `financial_report_q1_2026.txt` as the supporting document
  3. Wait for AI analysis to begin and complete
  4. Review the AI analysis results on the report page
- **Test Data:** File: financial_report_q1_2026.txt; Donor's financial reporting requirements: budget vs actuals, burn rate, variance analysis, expenditure breakdown by budget line
- **Expected Results:**
  - File uploads successfully within the report context
  - AI analysis begins automatically after upload
  - AI evaluates the document against the donor's SPECIFIC financial reporting requirements (not generic criteria)
  - Results show requirement-by-requirement compliance:
    - Budget vs actuals: Met/Not Met with evidence
    - Burn rate: Met/Not Met with evidence
    - Variance analysis: Met/Not Met with evidence
    - Expenditure breakdown: Met/Not Met with evidence
  - Overall compliance score is calculated
  - Results are displayed inline within the report editor
  - NGO can see exactly which requirements are met before submitting

### TC-NGORPT-003: NGO Submits Report - Status Changes and Donor Notified
- **Category:** NGO Reporting
- **Priority:** P1 Critical
- **Preconditions:** Report is complete with content and uploaded document (TC-NGORPT-002); AI analysis has been reviewed
- **Steps:**
  1. Review all report content sections and AI analysis results
  2. Click "Submit Report" or "Submit for Review"
  3. Confirm submission in any confirmation dialog
  4. Observe the status change
  5. Check if any notification mechanism is triggered for the donor
- **Test Data:** N/A
- **Expected Results:**
  - Report status changes from "Draft" to "Submitted"
  - Report becomes read-only (no further edits by NGO unless revision is requested)
  - Submission timestamp is recorded
  - Donor notification is triggered (email, in-app notification, or dashboard indicator)
  - Report appears in the donor's "Reports to Review" queue
  - AI analysis results are preserved and visible to the donor

### TC-NGORPT-004: Donor Views Submitted Report with AI Analysis Per Requirement
- **Category:** NGO Reporting
- **Priority:** P1 Critical
- **Preconditions:** Logged in as sarah@globalhealth.org (Donor); a report has been submitted by Amani (TC-NGORPT-003)
- **Steps:**
  1. Navigate to "Reports" in the donor sidebar
  2. Locate the submitted report from Amani
  3. Click to open the report
  4. Review the report content sections
  5. Review the AI analysis showing compliance per donor requirement
- **Test Data:** N/A
- **Expected Results:**
  - Report detail page shows all content sections written by the NGO
  - AI analysis section shows requirement-by-requirement compliance assessment
  - Each requirement shows: criterion description, compliance status (Met/Partially Met/Not Met), AI evidence/reasoning, score
  - Overall compliance score is prominently displayed
  - Donor can see both the NGO's self-reported content and the AI's independent analysis
  - Action buttons are available: "Accept" and "Request Revision"

### TC-NGORPT-005: Donor Accepts Report - Status Changes and Tranche Trigger
- **Category:** NGO Reporting
- **Priority:** P1 Critical
- **Preconditions:** Logged in as sarah@globalhealth.org (Donor); viewing a submitted report (TC-NGORPT-004)
- **Steps:**
  1. Review the submitted report and AI analysis
  2. Click "Accept Report"
  3. Optionally add a note: "Report meets all requirements. Excellent financial documentation."
  4. Confirm acceptance
  5. Observe any tranche/disbursement triggers
- **Test Data:** Acceptance note: "Report meets all requirements. Excellent financial documentation."
- **Expected Results:**
  - Report status changes to "Accepted"
  - Acceptance note is saved and visible to the NGO
  - NGO can see the accepted status and donor note on their Reports page
  - If the grant has tranche-based funding, acceptance may trigger eligibility for the next disbursement
  - Acceptance timestamp is recorded
  - Report moves from "To Review" to "Completed" in the donor's dashboard

### TC-NGORPT-006: Donor Requests Revision with Specific Feedback - NGO Sees Feedback
- **Category:** NGO Reporting
- **Priority:** P1 Critical
- **Preconditions:** Logged in as sarah@globalhealth.org (Donor); viewing a submitted report
- **Steps:**
  1. Review the submitted report and AI analysis
  2. Click "Request Revision"
  3. Enter specific feedback: "The variance analysis section needs more detail. Please explain the 15% overspend on travel. Also, the burn rate calculation appears to exclude indirect costs. Please recalculate including all cost categories."
  4. Click "Send Revision Request"
  5. Log out
  6. Log in as fatima@amani.org (NGO)
  7. Navigate to Reports
  8. Open the report that has revision requested
  9. Review the donor's feedback
- **Test Data:** Feedback: "The variance analysis section needs more detail. Please explain the 15% overspend on travel. Also, the burn rate calculation appears to exclude indirect costs."
- **Expected Results:**
  - Report status changes to "Revision Requested"
  - Donor's specific feedback is saved with the report
  - NGO sees the report status as "Revision Requested" in their report list
  - Opening the report shows the donor's feedback clearly and prominently
  - Report becomes editable again for the NGO to make revisions
  - A "Resubmit" button is available

### TC-NGORPT-007: NGO Revises and Resubmits - AI Re-Analyzes
- **Category:** NGO Reporting
- **Priority:** P2 High
- **Preconditions:** Logged in as fatima@amani.org (NGO); a report has "Revision Requested" status with donor feedback (TC-NGORPT-006)
- **Steps:**
  1. Open the report with "Revision Requested" status
  2. Review the donor's specific feedback
  3. Edit the relevant content sections to address the feedback
  4. Upload a revised document if applicable
  5. Click "Resubmit"
  6. Wait for AI re-analysis
  7. Log in as sarah@globalhealth.org (Donor) and verify the updated report
- **Test Data:** Revised content addressing the donor's travel variance and burn rate feedback
- **Expected Results:**
  - NGO can edit report sections that were flagged
  - Revised document uploads trigger new AI analysis
  - AI re-analysis runs against the same donor requirements
  - Updated AI scores reflect any improvements in the revised content
  - Report status changes from "Revision Requested" to "Submitted" (or "Resubmitted")
  - Donor sees the resubmitted report with updated AI analysis
  - Revision history is maintained (donor can see previous submission vs. current)

### TC-NGORPT-008: Report Dashboard Shows Upcoming Deadlines Based on Grant Schedule
- **Category:** NGO Reporting
- **Priority:** P2 High
- **Preconditions:** Logged in as fatima@amani.org (NGO); Amani has an active grant with configured reporting schedule
- **Steps:**
  1. Navigate to the Reports page or NGO Dashboard
  2. Locate the "Upcoming Deadlines" or "Reporting Calendar" section
  3. Review the upcoming report deadlines
- **Test Data:** Grant 1 reporting schedule: quarterly financial, semi-annual narrative, annual impact
- **Expected Results:**
  - Upcoming deadlines are displayed based on the grant agreement's reporting schedule
  - Each deadline shows: report type, due date, grant name, days remaining
  - Deadlines are sorted chronologically (nearest first)
  - Color coding or indicators show urgency: green (>30 days), amber (7-30 days), red (<7 days overdue)
  - Clicking on a deadline navigates to the report creation or editing page

### TC-NGORPT-009: Late Report Submission - System Flags Overdue Status
- **Category:** NGO Reporting
- **Priority:** P2 High
- **Preconditions:** Logged in as fatima@amani.org (NGO); a report deadline has passed without submission
- **Steps:**
  1. Navigate to the Reports page
  2. Observe any overdue report indicators
  3. Create a report that is past its due date
  4. Submit the late report
  5. Observe how the system handles the late submission
- **Test Data:** A report type with a past-due deadline
- **Expected Results:**
  - Overdue reports are flagged with a red "Overdue" or "Late" indicator
  - The number of days overdue is displayed
  - Late submission is still accepted but marked with a "Late Submission" tag
  - Donor can see the late submission status when reviewing the report
  - Overdue status appears on both the NGO dashboard and the donor's compliance dashboard

### TC-NGORPT-010: Full Reporting Cycle for All Report Types
- **Category:** NGO Reporting
- **Priority:** P2 High
- **Preconditions:** Logged in as fatima@amani.org (NGO); Amani has an active grant with multiple report types required
- **Steps:**
  1. Create and submit a Financial Report (quarterly) using `financial_report_q1_2026.txt`
  2. Create and submit a Narrative/Progress Report (semi-annual) with detailed narrative content
  3. Create and submit an Impact Report (annual) using `impact_report_annual_2025.txt`
  4. Create and submit an Audit Report using `audit_report_2025.txt`
  5. For each submission, verify AI analysis runs against the correct document-type-specific requirements
- **Test Data:** Files: financial_report_q1_2026.txt, impact_report_annual_2025.txt, audit_report_2025.txt; Report types: Financial, Narrative, Impact, Audit
- **Expected Results:**
  - All four report types can be created and submitted
  - Each report type triggers AI analysis against its own specific evaluation criteria (set by the donor)
  - Financial reports are scored on financial criteria (budget vs actuals, burn rate, etc.)
  - Narrative reports are scored on narrative criteria (beneficiary data, progress indicators, etc.)
  - Impact reports are scored on impact criteria (outcomes, indicators, sustainability, etc.)
  - Audit reports are scored on audit criteria (independence, management letter, ISA compliance, etc.)
  - All reports appear in the donor's review queue organized by type

---

## 23. End-to-End Grant Lifecycle Workflows (TC-LIFE)

### TC-LIFE-001: Full Lifecycle - NGO Registers Through Report Acceptance
- **Category:** Grant Lifecycle
- **Priority:** P1 Critical
- **Preconditions:** Application is running; all test users available; all features (registration verification, sanctions screening, AI analysis, reporting) are functional

**Phase 1: NGO Registration and Capacity Assessment**
- **Steps:**
  1. Log in as peter@hopebridges.org (Hope Bridges Initiative, Uganda, Health/Climate, score 55%)
  2. Navigate to Assessment Hub
  3. Complete a Kuja Standard assessment (all 4 steps with documents)
  4. Upload `registration_certificate.txt`, `compliance_checklist.txt`, `audit_report_2025.txt`
  5. Submit the assessment
  6. Verify the capacity score is updated

**Phase 2: Grant Matching and Application**
- **Steps:**
  1. Navigate to Browse Grants
  2. Identify Grant 1 (Community Health Workers Scale-Up Program) as a match (Health sector, Uganda)
  3. Click Apply
  4. Complete all application steps:
     - Step 1: Eligibility check (Uganda is eligible for Grant 1)
     - Step 2: Proposal (title, summary, objectives, methodology, timeline, budget)
     - Step 3: Documents (upload project_proposal.txt, budget_template.txt, registration_certificate.txt)
     - Step 4: Review and Submit
  5. Verify AI score is generated

**Phase 3: Review and Award**
- **Steps:**
  1. Log in as james@reviewer.org, locate and score the application
  2. Log in as sarah@globalhealth.org, review rankings, award the grant to Hope Bridges

**Phase 4: Reporting and Acceptance**
- **Steps:**
  1. Log in as peter@hopebridges.org
  2. Create a Financial Report for the awarded grant
  3. Upload `financial_report_q1_2026.txt`
  4. Submit the report, verify AI analysis runs
  5. Log in as sarah@globalhealth.org, review the report with AI analysis, accept it

- **Test Data:** All test files; Hope Bridges Initiative user
- **Expected Results:**
  - Complete lifecycle from assessment through report acceptance is verified
  - Each phase transitions correctly to the next
  - Data is consistent across all phases (scores, statuses, organization details)
  - AI analysis works at every document touchpoint (assessment, application, reporting)

### TC-LIFE-002: Donor Creates Grant with Uploaded Agreement Through Report Review
- **Category:** Grant Lifecycle
- **Priority:** P1 Critical
- **Preconditions:** Logged in as david@eatrust.org (Donor)

**Phase 1: Grant Creation with AI-Extracted Requirements**
- **Steps:**
  1. Create a new grant: "Water Security for Rural Communities", $450,000
  2. Upload `grant_agreement_sample.txt` for AI requirement extraction
  3. Review and modify AI-extracted requirements
  4. Add custom requirements for WASH-specific reporting
  5. Publish the grant

**Phase 2: Receive and Review Applications**
- **Steps:**
  1. Log in as fatima@amani.org (Health/WASH, Kenya)
  2. Apply to the Water Security grant with full application
  3. Log in as david@eatrust.org
  4. Review the application with AI scoring
  5. Award the grant

**Phase 3: Review Reports**
- **Steps:**
  1. Log in as fatima@amani.org, create and submit reports
  2. Log in as david@eatrust.org, review reports with AI analysis against configured requirements
  3. Accept or request revision

- **Test Data:** Grant agreement: grant_agreement_sample.txt; Reports: financial_report_q1_2026.txt
- **Expected Results:**
  - AI requirement extraction works on the grant agreement
  - NGO applications are evaluated against donor criteria
  - Reports are analyzed against donor-specific requirements
  - Full donor-side lifecycle is verified

### TC-LIFE-003: Multi-NGO Competition - AI Ranks Applications
- **Category:** Grant Lifecycle
- **Priority:** P1 Critical
- **Preconditions:** Application is running; Grant 1 is open; multiple NGOs are eligible

- **Steps:**
  1. Log in as fatima@amani.org, verify existing application (score 78.5) for Grant 1
  2. Log in as ahmed@salamrelief.org, verify existing application (score 62.3) for Grant 1
  3. Log in as peter@hopebridges.org, complete and submit a new application for Grant 1
  4. Log in as sarah@globalhealth.org (Donor for Grant 1)
  5. Navigate to "Review Applications" or "Rankings" for Grant 1
  6. View the AI-ranked list of all submitted applications
  7. Compare applications side by side (if feature exists)
  8. Review individual AI analyses and reviewer scores
  9. Make an award decision based on combined data
- **Test Data:** Amani (78.5), Salam (62.3), Hope Bridges (new application)
- **Expected Results:**
  - All submitted applications appear in the rankings (drafts excluded)
  - Applications are ranked by AI score (and reviewer scores if available)
  - Donor can view detailed AI analysis for each application
  - Comparison between applications is possible
  - Award decision can be made from the rankings page

### TC-LIFE-004: Compliance Workflow - Sanctions Screening Flag and Manual Clearance
- **Category:** Grant Lifecycle
- **Priority:** P2 High
- **Preconditions:** Logged in as sarah@globalhealth.org (Donor); sanctions screening feature is functional

- **Steps:**
  1. Navigate to Compliance & Due Diligence
  2. Run sanctions screening on all NGO applicants for Grant 1
  3. Verify all test NGOs come back clear
  4. Screen a test entity name that would trigger a fuzzy match (e.g., an NGO with a name similar to a sanctioned entity)
  5. Review the flagged result
  6. Perform manual review and clearance of the flag
  7. Document the clearance decision with notes
- **Test Data:** Clean NGOs: Amani, Salam, Hope Bridges, Ubuntu, Sahel; Fuzzy match test entity
- **Expected Results:**
  - Clean NGOs return clear screening results
  - Flagged entity shows amber/yellow warning with match details
  - Manual clearance workflow is available for donors/admins
  - Clearance decision is recorded with timestamp, reviewer, and notes
  - Cleared entity can proceed in the grant process

### TC-LIFE-005: Registration Verification Workflow - New NGO Through Donor Review
- **Category:** Grant Lifecycle
- **Priority:** P2 High
- **Preconditions:** Logged in as donor or admin; registration verification feature is functional

- **Steps:**
  1. Log in as fatima@amani.org (NGO, Kenya)
  2. Navigate to Organization Profile
  3. Upload `registration_certificate.txt` as the organization's registration document
  4. Log in as sarah@globalhealth.org (Donor)
  5. Navigate to Compliance & Due Diligence
  6. Initiate registration verification for Amani Community Development against Kenya BRS
  7. Review the AI cross-reference analysis (certificate vs registry data)
  8. View the verification status on the donor's compliance dashboard
- **Test Data:** Organization: Amani Community Development; Country: Kenya; File: registration_certificate.txt
- **Expected Results:**
  - NGO uploads certificate successfully
  - Donor can initiate verification against the Kenya registry
  - AI compares the uploaded certificate content with registry data
  - Verification status is visible on the compliance dashboard
  - Donor can make informed decisions based on verification results

### TC-LIFE-006: Report Revision Cycle - Three Rounds of Revision
- **Category:** Grant Lifecycle
- **Priority:** P2 High
- **Preconditions:** An NGO has submitted a report; donor has revision authority

- **Steps:**
  1. Log in as fatima@amani.org, submit a report with `poor_quality_report.txt`
  2. Log in as sarah@globalhealth.org, review the report (expect low AI scores), request revision with feedback round 1
  3. Log in as fatima@amani.org, review feedback, improve report, resubmit
  4. Log in as sarah@globalhealth.org, review improved report, request revision with feedback round 2 (more specific gaps)
  5. Log in as fatima@amani.org, review feedback, improve report further, resubmit
  6. Log in as sarah@globalhealth.org, review final version, request revision with feedback round 3 (minor issues)
  7. Log in as fatima@amani.org, make final improvements, resubmit
  8. Log in as sarah@globalhealth.org, review and accept the final version
- **Test Data:** Initial upload: poor_quality_report.txt; Subsequent revisions with improved content
- **Expected Results:**
  - Three complete revision cycles work without errors
  - Each revision shows improved AI scores (reflecting improved content)
  - All revision feedback from the donor is preserved in the report history
  - The final acceptance concludes the revision cycle
  - Complete revision history is available showing the progression

### TC-LIFE-007: Multi-Language Workflow - French NGO Completes Full Process
- **Category:** Grant Lifecycle
- **Priority:** P3 Medium
- **Preconditions:** Logged in as an NGO user; application supports French language

- **Steps:**
  1. Log in as any NGO user
  2. Switch language to French
  3. Navigate through the full workflow in French:
     - Browse Grants (Parcourir les subventions)
     - View Grant details
     - Apply to a grant (complete all wizard steps in French)
     - Upload `french_project_report.txt` as a document
     - Create and submit a report
  4. Verify all French translations display correctly
  5. Verify AI analysis handles French-language documents
  6. Switch back to English and verify data integrity
- **Test Data:** File: french_project_report.txt; Language: French
- **Expected Results:**
  - All UI elements are properly translated to French
  - Workflow functionality is not impaired by language switch
  - AI handles French-language documents for analysis
  - Data entered in French is preserved correctly
  - Switching back to English shows the same data (not corrupted)

### TC-LIFE-008: Edge Case - NGO Applies to Ineligible Grant
- **Category:** Grant Lifecycle
- **Priority:** P2 High
- **Preconditions:** Logged in as peter@hopebridges.org (Hope Bridges, Uganda, Health/Climate)

- **Steps:**
  1. Navigate to Browse Grants
  2. View Grant 4 (Women's Protection and Empowerment, Nigeria/Niger/Chad/Mali)
  3. Click "Apply"
  4. Observe the eligibility check results
  5. Attempt to proceed past the eligibility check
- **Test Data:** Hope Bridges: Uganda (not in Grant 4 countries: Nigeria, Niger, Chad, Mali); Health/Climate sectors (not matching Protection/Gender)
- **Expected Results:**
  - Eligibility check identifies that Hope Bridges does not meet country requirements
  - Eligibility check may also identify sector mismatch
  - System either blocks the application or displays a prominent warning
  - If the application is blocked, a clear message explains which criteria failed
  - NGO is redirected to Browse Grants to find eligible opportunities
  - No partial/incomplete application is created if blocked

---

## 24. Live AI Integration (TC-LIVEAI)

### TC-LIVEAI-001: Verify Claude API Key is Configured and Active
- **Category:** Live AI Integration
- **Priority:** P1 Critical
- **Preconditions:** Application is running; admin access available
- **Steps:**
  1. Log in as admin@kuja.org
  2. Navigate to system settings or admin panel
  3. Check that the Claude API key is configured
  4. Verify the API key status (active, valid, not expired)
  5. If a test/ping endpoint exists, send a test request to verify connectivity
- **Test Data:** Admin credentials: admin@kuja.org / pass123
- **Expected Results:**
  - Claude API key is present in the system configuration
  - API key status shows "Active" or "Connected"
  - Test request (if available) returns a successful response
  - No API key errors or warnings are displayed
  - Rate limit status (if displayed) shows available capacity

### TC-LIVEAI-002: Document Upload Triggers Real AI Analysis (Not Simulated)
- **Category:** Live AI Integration
- **Priority:** P1 Critical
- **Preconditions:** Logged in as fatima@amani.org; Claude API key is active (TC-LIVEAI-001)
- **Steps:**
  1. Navigate to My Documents
  2. Upload `financial_report_q1_2026.txt` with type "Financial Report"
  3. Wait for AI analysis to complete
  4. Examine the AI analysis response closely for signs of real analysis vs. simulated/demo responses
  5. Upload a second, different document (`audit_report_2025.txt`) and compare the analysis
- **Test Data:** Files: financial_report_q1_2026.txt (Financial Report), audit_report_2025.txt (Audit Report)
- **Expected Results:**
  - AI analysis produces responses that are specific to the content of each document (not generic/template responses)
  - Financial report analysis references actual financial data from the document (budget figures, expenditure categories, etc.)
  - Audit report analysis references audit-specific content (auditor name, findings, management letter, etc.)
  - The two analyses are meaningfully different (not copy-paste with different labels)
  - Response times are consistent with live API calls (typically 3-15 seconds, not instant)
  - No "demo mode" or "simulated" indicators are present

### TC-LIVEAI-003: Chat Assistant Provides Contextual Real Responses
- **Category:** Live AI Integration
- **Priority:** P1 Critical
- **Preconditions:** Logged in as fatima@amani.org; Claude API key is active
- **Steps:**
  1. Open the AI Chat Assistant
  2. Ask: "What is the status of my application to the Community Health Workers Scale-Up Program?"
  3. Wait for response
  4. Ask a follow-up: "What can I do to improve my application score?"
  5. Wait for response
  6. Ask a question about a specific grant: "How much funding is available for the Community Health Workers grant?"
- **Test Data:** Questions about user-specific data (Amani's application, Grant 1)
- **Expected Results:**
  - Chat responses reference actual system data (Amani's application, score 78.5, Grant 1 details)
  - Responses are contextual to the logged-in user (not generic)
  - Follow-up questions maintain conversation context
  - Grant-specific queries return accurate information ($500,000 for Grant 1)
  - Responses are coherent, professional, and helpful
  - Response times indicate live API processing

### TC-LIVEAI-004: Grant Agreement Upload - Real AI Extracts Actual Requirements
- **Category:** Live AI Integration
- **Priority:** P1 Critical
- **Preconditions:** Logged in as david@eatrust.org (Donor); Claude API key is active
- **Steps:**
  1. Navigate to Create Grant
  2. Proceed to the Reporting Requirements step
  3. Upload `grant_agreement_sample.txt`
  4. Wait for AI extraction to complete
  5. Review the extracted requirements
  6. Verify that the extracted requirements reflect the actual content of the uploaded document
- **Test Data:** File: grant_agreement_sample.txt
- **Expected Results:**
  - AI extraction produces requirements that are specific to the content of grant_agreement_sample.txt
  - Extracted reporting types, frequencies, and criteria reference actual clauses from the document
  - Extraction is not a generic/default set of requirements (it reflects what is actually in the agreement)
  - If the agreement specifies quarterly financial reports, the AI extracts "quarterly financial reports"
  - Extraction results include references to specific sections or clauses of the document
  - The entire extraction process completes within a reasonable time (under 30 seconds)

### TC-LIVEAI-005: Report Analysis - Real AI Evaluates Against Real Donor Requirements
- **Category:** Live AI Integration
- **Priority:** P1 Critical
- **Preconditions:** A grant has donor-configured reporting requirements; an NGO has submitted a report with an uploaded document; Claude API key is active
- **Steps:**
  1. Log in as fatima@amani.org
  2. Navigate to Reports, create a new report for Grant 1
  3. Upload `financial_report_q1_2026.txt`
  4. Submit the report
  5. Log in as sarah@globalhealth.org
  6. View the submitted report
  7. Review the AI analysis, verifying it evaluates against the specific donor requirements (not generic criteria)
- **Test Data:** File: financial_report_q1_2026.txt; Donor requirements: specific financial reporting criteria for Grant 1
- **Expected Results:**
  - AI analysis results reference the specific donor requirements configured for Grant 1
  - Each requirement is individually scored with evidence from the document
  - Analysis is substantive (not "This document meets/does not meet requirements" without detail)
  - Specific content from the financial report is cited in the analysis
  - Scores differentiate between well-addressed and poorly-addressed requirements

### TC-LIVEAI-006: Registration Certificate - Real AI Reads and Extracts Details
- **Category:** Live AI Integration
- **Priority:** P2 High
- **Preconditions:** Logged in as a user who can upload documents; Claude API key is active
- **Steps:**
  1. Navigate to the document upload or registration verification section
  2. Upload `registration_certificate.txt`
  3. Wait for AI analysis
  4. Review the AI-extracted information
- **Test Data:** File: registration_certificate.txt
- **Expected Results:**
  - AI reads the registration certificate and extracts structured data:
    - Organization name
    - Registration number
    - Issuing authority
    - Registration date
    - Expiry date (if present)
    - Country of registration
  - Extracted data is specific to the content of registration_certificate.txt (not generic placeholder data)
  - Extracted fields can be used for cross-referencing with registry verification data
  - Extraction is accurate for the fields present in the document

### TC-LIVEAI-007: AI Handles Rate Limiting Gracefully
- **Category:** Live AI Integration
- **Priority:** P2 High
- **Preconditions:** Logged in as an NGO user; Claude API key is active; multiple users or rapid requests can be simulated
- **Steps:**
  1. Upload multiple documents in rapid succession (e.g., 5 documents within 30 seconds):
     - `financial_report_q1_2026.txt`
     - `audit_report_2025.txt`
     - `impact_report_annual_2025.txt`
     - `project_proposal.txt`
     - `compliance_checklist.txt`
  2. Observe how the system handles the burst of AI analysis requests
  3. Wait for all analyses to complete
- **Test Data:** 5 files uploaded in rapid succession
- **Expected Results:**
  - System queues the AI analysis requests rather than failing
  - A progress indicator or queue status is shown for each pending analysis
  - No "Rate limit exceeded" errors are shown to the user (handled internally)
  - All 5 analyses eventually complete (may take longer due to queuing)
  - If rate limiting is encountered, the system retries automatically with backoff
  - User-facing error messages (if any) are helpful and non-technical

### TC-LIVEAI-008: AI Fallback Works When API is Temporarily Unavailable
- **Category:** Live AI Integration
- **Priority:** P2 High
- **Preconditions:** Claude API key is configured but API is temporarily unavailable (simulated by invalid key or network issue)
- **Steps:**
  1. Simulate API unavailability (admin may need to temporarily invalidate the API key or block network access)
  2. Upload a document (`financial_report_q1_2026.txt`)
  3. Observe the system behavior when AI analysis fails
  4. Check the Chat Assistant with a question
  5. Restore API access
  6. Retry the document upload and verify AI analysis works again
- **Test Data:** File: financial_report_q1_2026.txt; API status: temporarily unavailable
- **Expected Results:**
  - System does not crash or show unhandled errors
  - A graceful fallback message is displayed: "AI analysis is temporarily unavailable. Your document has been saved and will be analyzed when the service is restored." (or similar)
  - Document is still saved even if AI analysis fails
  - Chat Assistant shows a message that AI is temporarily unavailable
  - When API is restored, AI analysis can be triggered retroactively for the saved document
  - No data loss occurs during the outage

### TC-LIVEAI-009: AI Responses Are Contextually Appropriate Per User Role
- **Category:** Live AI Integration
- **Priority:** P2 High
- **Preconditions:** Claude API key is active; multiple user roles available
- **Steps:**
  1. Log in as fatima@amani.org (NGO), open Chat Assistant, ask: "What should I focus on to get my application approved?"
  2. Note the response tone and content
  3. Log out, log in as sarah@globalhealth.org (Donor), open Chat Assistant, ask: "How should I evaluate the applications I received?"
  4. Note the response tone and content
  5. Log out, log in as james@reviewer.org (Reviewer), open Chat Assistant, ask: "What criteria should I use to score this application?"
  6. Note the response tone and content
- **Test Data:** Same type of question asked from three different role perspectives
- **Expected Results:**
  - NGO response: Focused on application improvement, tips for better proposals, capacity building
  - Donor response: Focused on evaluation frameworks, due diligence, compliance considerations
  - Reviewer response: Focused on scoring criteria, review best practices, evaluation methodology
  - Each response is appropriate to the user's role and perspective
  - AI does not confuse roles or provide inappropriate advice
  - Responses reference role-specific features and capabilities

### TC-LIVEAI-010: AI Scoring is Consistent Across Multiple Analyses of Same Document
- **Category:** Live AI Integration
- **Priority:** P2 High
- **Preconditions:** Logged in as fatima@amani.org; Claude API key is active
- **Steps:**
  1. Upload `financial_report_q1_2026.txt` and record the AI analysis scores
  2. Delete or remove the upload (if possible) and re-upload the same file
  3. Record the new AI analysis scores
  4. Repeat once more (3 total analyses of the same document)
  5. Compare the three sets of scores
- **Test Data:** File: financial_report_q1_2026.txt uploaded 3 times
- **Expected Results:**
  - AI scores across all three analyses are consistent (within a reasonable tolerance, e.g., +/- 5%)
  - Major assessment findings are the same across all analyses (same strengths, same gaps identified)
  - The scoring demonstrates reliability and reproducibility
  - If any scores differ significantly, the specific criterion scores that vary should be examined
  - Overall compliance verdict (e.g., "meets requirements" vs. "does not meet") is the same across all analyses

---

## Appendix A: Test Execution Summary Template

| Category                            | Total TCs | P1 | P2 | P3 | Pass | Fail | Blocked | Not Run |
|-------------------------------------|-----------|----|----|----|----- |------|---------|---------|
| Authentication (TC-AUTH)            | 5         |    |    |    |      |      |         |         |
| NGO Dashboard (TC-NGOD)            | 5         |    |    |    |      |      |         |         |
| Donor Dashboard (TC-DOND)          | 4         |    |    |    |      |      |         |         |
| Reviewer Dashboard (TC-REVD)       | 2         |    |    |    |      |      |         |         |
| Assessment Hub & Wizard (TC-ASMT)  | 5         |    |    |    |      |      |         |         |
| Grants Browse/Detail/Filter (TC-GRNT) | 5      |    |    |    |      |      |         |         |
| Application Wizard (TC-APPL)       | 5         |    |    |    |      |      |         |         |
| Grant Creation Wizard (TC-GCRT)    | 4         |    |    |    |      |      |         |         |
| Document Upload & AI (TC-DOCU)     | 4         |    |    |    |      |      |         |         |
| Reports - NGO (TC-RPTN)            | 4         |    |    |    |      |      |         |         |
| Reports - Donor Review (TC-RPTD)   | 4         |    |    |    |      |      |         |         |
| Organization Profile/Search (TC-ORG) | 4       |    |    |    |      |      |         |         |
| AI Chat Assistant (TC-AICHAT)      | 3         |    |    |    |      |      |         |         |
| Language & UI (TC-LANG)            | 5         |    |    |    |      |      |         |         |
| Edge Cases & Error Handling (TC-EDGE) | 5      |    |    |    |      |      |         |         |
| Cross-Role E2E Workflows (TC-E2E)  | 4         |    |    |    |      |      |         |         |
| **NEW: Registration Verification (TC-REGV)** | 10 |  |    |    |      |      |         |         |
| **NEW: Sanctions Screening (TC-SANC)** | 10    |    |    |    |      |      |         |         |
| **NEW: AI Doc Analysis vs Requirements (TC-AIDOC)** | 10 | | |  |      |      |         |         |
| **NEW: Grant Setup Wizard - Requirements (TC-GWIZ)** | 10 | | |  |      |      |         |         |
| **NEW: NGO Reporting to Donor (TC-NGORPT)** | 10 |  |    |    |      |      |         |         |
| **NEW: Grant Lifecycle Workflows (TC-LIFE)** | 8 |    |    |    |      |      |         |         |
| **NEW: Live AI Integration (TC-LIVEAI)** | 10   |    |    |    |      |      |         |         |
| **TOTAL**                           | **136**   |    |    |    |      |      |         |         |

## Appendix B: Priority Distribution

- **P1 Critical:** Tests that validate core functionality; system is unusable if these fail. Includes: login, role access, grant lifecycle, application submission, report submission/review, sanctions screening matches, registration verification, live AI document analysis, and end-to-end lifecycle workflows.
- **P2 High:** Tests for important features that have workarounds if failing. Includes: search, filters, AI scoring details, document upload edge cases, fuzzy sanctions matching, bulk screening, AI re-analysis, report deadlines, and revision cycles.
- **P3 Medium:** Tests for nice-to-have features, edge cases, and polish items. Includes: responsive design, language persistence, verification real-time updates, grant cloning, and multi-language workflows.

## Appendix C: Test Environment Setup Checklist

- [ ] Flask application is running and accessible at the base URL (local or production)
- [ ] Database is seeded with all test users, grants, applications, and reports as described in Section 1
- [ ] Claude API key is configured and active for AI analysis features
- [ ] All 18 test files are present in the test-files/ directory (8 standard + 10 edge case/specialized)
- [ ] Browser is configured with developer tools available for inspecting network requests and console errors
- [ ] Screen recording or screenshot tools are available for documenting defects
- [ ] Multiple browser profiles or incognito windows are available for concurrent multi-role testing
- [ ] Internet connectivity is available for external registry verification (Kenya BRS, Nigeria CAC, South Africa NPO, Uganda NGO Bureau)
- [ ] Internet connectivity is available for sanctions database access (UN, OFAC, EU, World Bank, OpenSanctions API)
- [ ] OpenSanctions API key is configured (if required for the /match endpoint)
- [ ] Test data includes known sanctioned entity names for positive match testing
- [ ] Fallback/offline mode can be simulated for TC-LIVEAI-008

## Appendix D: External API Dependencies

| Service                          | Endpoint                                                     | Required For      | Fallback Behavior           |
|----------------------------------|--------------------------------------------------------------|-------------------|-----------------------------|
| Claude AI API                    | Anthropic API                                                | TC-LIVEAI, TC-AIDOC, TC-GWIZ | Graceful degradation, queue |
| Kenya BRS                        | https://brs.go.ke/                                           | TC-REGV-001       | Manual verification         |
| Nigeria CAC                      | https://search.cac.gov.ng/                                   | TC-REGV-002       | Manual verification         |
| South Africa NPO Registry       | https://www.npo.gov.za/                                      | TC-REGV-003       | Manual verification         |
| South Africa CIPC API           | https://apim.cipc.co.za/                                     | TC-REGV-003       | NPO Registry fallback       |
| Uganda NGO Bureau               | https://ngobureau.go.ug/en/updated-national-ngo-register     | TC-REGV-004       | Manual verification         |
| UN Security Council Sanctions   | https://scsanctions.un.org/resources/xml/en/consolidated.xml | TC-SANC-002       | Cached list + alert         |
| OFAC SDN List                    | https://www.treasury.gov/ofac/downloads/sdn.csv              | TC-SANC-003       | Cached list + alert         |
| EU Consolidated Sanctions       | EC webgate CSV endpoint                                      | TC-SANC-004       | Cached list + alert         |
| World Bank Debarment            | https://www.worldbank.org/en/projects-operations/procurement/debarred-firms | TC-SANC-005 | Cached list + alert |
| OpenSanctions API               | https://api.opensanctions.org/                               | TC-SANC-006/010   | Individual list queries     |

---

**End of Test Plan v2.0**
