# Kuja Grant Management System - End-to-End Test Plan

**Version:** 1.0
**Date:** 2026-02-28
**Application:** Kuja Grant Management System (Flask Web Application)
**Base URL:** http://localhost:5000 (or deployed environment)

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

---

## 1. Test Environment & Data

### 1.1 Test Users

| Role     | Email                    | Password | Organization                    | Country       | Sectors                          | Score |
|----------|--------------------------|----------|---------------------------------|---------------|----------------------------------|-------|
| NGO      | fatima@amani.org         | pass123  | Amani Community Development     | Kenya         | Health, WASH, Nutrition          | 82    |
| NGO      | ahmed@salamrelief.org    | pass123  | Salam Relief Foundation         | Somalia       | Food Security, Protection        | --    |
| NGO      | thandi@ubuntu.org        | pass123  | Ubuntu Education Trust          | South Africa  | Education                        | --    |
| NGO      | peter@hopebridges.org    | pass123  | Hope Bridges Initiative         | Uganda        | Health, Climate                  | --    |
| NGO      | aisha@sahelwomen.org     | pass123  | Sahel Women's Network           | Nigeria       | Protection, Gender               | --    |
| Donor    | sarah@globalhealth.org   | pass123  | Global Health Fund              | Switzerland   | --                               | --    |
| Donor    | david@eatrust.org        | pass123  | East Africa Development Trust   | Kenya         | --                               | --    |
| Reviewer | james@reviewer.org       | pass123  | -- (James Ochieng)              | --            | --                               | --    |
| Reviewer | maria@reviewer.org       | pass123  | -- (Maria Santos)               | --            | --                               | --    |
| Admin    | admin@kuja.org           | pass123  | --                              | --            | --                               | --    |

### 1.2 Grants in System

| ID | Grant Name                                | Amount   | Status | Donor                        | Countries                 |
|----|-------------------------------------------|----------|--------|------------------------------|---------------------------|
| 1  | Community Health Workers Scale-Up Program | $500,000 | Open   | Global Health Fund           | Kenya, Somalia, Uganda    |
| 2  | Education Technology for Rural Schools    | $250,000 | Open   | EA Development Trust         | Kenya, Uganda, Tanzania   |
| 3  | Climate Resilience in East Africa         | $1,000,000| Draft | EA Development Trust         | --                        |
| 4  | Women's Protection and Empowerment        | $350,000 | Open   | Global Health Fund           | Nigeria, Niger, Chad, Mali|

### 1.3 Existing Applications

| NGO                 | Grant | Status    | AI Score |
|---------------------|-------|-----------|----------|
| Amani Community Dev | 1     | Submitted | 78.5     |
| Salam Relief Found  | 1     | Submitted | 62.3     |
| Ubuntu Education     | 2     | Draft     | --       |
| Sahel Women's Net   | 4     | Submitted | 71.0     |
| Hope Bridges Init   | 1     | Draft     | Incomplete|

### 1.4 Existing Reports

| ID | Title                           | NGO   | Grant | Status             | AI Scores         |
|----|---------------------------------|-------|-------|--------------------|-------------------|
| 1  | Q1 2026 Financial Report        | Amani | 1     | Submitted          | 90/100/65         |
| 2  | Annual Progress Report H1 2026  | Amani | 1     | Draft              | --                |
| 3  | Test Q2 Financial Report        | Amani | 1     | Accepted           | --                |
| 4  | Annual Impact Report 2025       | Amani | 1     | Revision Requested | --                |
| 5  | Under Review Financial Report   | Amani | 1     | Under Review       | --                |

### 1.5 Test Files (in test-files/ folder)

- `financial_report_q1_2026.txt`
- `audit_report_2025.txt`
- `registration_certificate.txt`
- `project_proposal.txt`
- `impact_report_annual_2025.txt`
- `budget_template.txt`
- `compliance_checklist.txt`
- `grant_agreement_sample.txt`

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

### TC-AUTH-006: Login with Non-Existent Email
- **Category:** Authentication
- **Priority:** P2 High
- **Preconditions:** Application is running; user is on the login page
- **Steps:**
  1. Navigate to the login page
  2. Enter email: `nonexistent@test.org`
  3. Enter password: `pass123`
  4. Click the "Login" / "Sign In" button
- **Test Data:** nonexistent@test.org / pass123
- **Expected Results:**
  - User remains on the login page
  - An error message is displayed
  - Error message does not reveal whether the email exists in the system (security best practice)

### TC-AUTH-007: Login with Empty Fields
- **Category:** Authentication
- **Priority:** P2 High
- **Preconditions:** Application is running; user is on the login page
- **Steps:**
  1. Navigate to the login page
  2. Leave both email and password fields empty
  3. Click the "Login" / "Sign In" button
- **Test Data:** (empty)
- **Expected Results:**
  - Form validation prevents submission, or an error message is displayed
  - User remains on the login page

### TC-AUTH-008: Logout
- **Category:** Authentication
- **Priority:** P1 Critical
- **Preconditions:** User fatima@amani.org is logged in and on the NGO Dashboard
- **Steps:**
  1. Locate the logout button/link in the sidebar or header (e.g., user avatar dropdown or "Logout" link)
  2. Click "Logout"
- **Test Data:** N/A
- **Expected Results:**
  - User is redirected to the login page
  - Attempting to navigate to any protected page (e.g., `/dashboard`) redirects back to login
  - Session is destroyed

### TC-AUTH-009: Session Persistence - Protected Route Without Login
- **Category:** Authentication
- **Priority:** P1 Critical
- **Preconditions:** No user is logged in; browser session is clean
- **Steps:**
  1. Directly navigate to a protected URL such as `/dashboard` or `/grants`
- **Test Data:** N/A
- **Expected Results:**
  - User is redirected to the login page
  - No dashboard content is visible

### TC-AUTH-010: Session Persistence After Page Refresh
- **Category:** Authentication
- **Priority:** P2 High
- **Preconditions:** User fatima@amani.org is logged in
- **Steps:**
  1. Confirm the NGO Dashboard is displayed
  2. Press F5 or click the browser refresh button
- **Test Data:** N/A
- **Expected Results:**
  - User remains logged in on the same page
  - Dashboard data reloads correctly
  - No redirect to the login page

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
  - Capacity badge is visible showing score 82

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
  - Grant 4 (Women's Protection and Empowerment) may appear if sectors overlap
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
  - Capacity badge displays the score of 82
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
  - Report 2 (draft) should NOT appear to donor
  - Report 3 (accepted) may appear in a separate section or not require action

### TC-DOND-005: Second Donor Dashboard Verification
- **Category:** Donor Dashboard
- **Priority:** P2 High
- **Preconditions:** Logged in as david@eatrust.org
- **Steps:**
  1. Navigate to the Donor Dashboard
  2. Review statistics and active grants
- **Test Data:** N/A
- **Expected Results:**
  - Grant 2 (Education Technology for Rural Schools, $250K, Open) is listed
  - Grant 3 (Climate Resilience in East Africa, $1M, Draft) is listed
  - Applications: Ubuntu Education Trust draft application to Grant 2 (may or may not appear depending on draft visibility)

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
  - The completed assessment appears in the assessment history

### TC-ASMT-006: Start STEP Framework Assessment
- **Category:** Assessment
- **Priority:** P2 High
- **Preconditions:** Logged in as ahmed@salamrelief.org; on the Assessment Hub page
- **Steps:**
  1. Click "Start Assessment" on the "STEP" framework card
  2. Verify Step 1 shows Salam Relief Foundation profile
  3. Proceed through Steps 2-4 similarly to TC-ASMT-002 through TC-ASMT-005
  4. On Step 2, check items related to STEP-specific criteria
  5. On Step 3, upload `registration_certificate.txt`
  6. On Step 4, review and submit
- **Test Data:** Salam Relief Foundation, Somalia, Food Security/Protection; file: registration_certificate.txt
- **Expected Results:**
  - STEP framework has its own distinct checklist items (different from Kuja Standard)
  - All steps complete successfully
  - Assessment is submitted and recorded

### TC-ASMT-007: Assessment Wizard - Navigate Back
- **Category:** Assessment
- **Priority:** P2 High
- **Preconditions:** Logged in as fatima@amani.org; on Step 3 of any assessment wizard
- **Steps:**
  1. Click "Back" or "Previous" button on Step 3
  2. Verify Step 2 data is preserved
  3. Click "Back" again to return to Step 1
  4. Verify Step 1 data is preserved
- **Test Data:** N/A
- **Expected Results:**
  - Navigation back through steps works without data loss
  - All previously entered checklist items and notes are retained
  - Uploaded documents from Step 3 are preserved when navigating back and forward

### TC-ASMT-008: UN HACT Framework Assessment
- **Category:** Assessment
- **Priority:** P2 High
- **Preconditions:** Logged in as thandi@ubuntu.org; on the Assessment Hub page
- **Steps:**
  1. Click "Start Assessment" on the "UN HACT" framework
  2. Verify Step 1 shows Ubuntu Education Trust profile (South Africa, Education)
  3. Complete all 4 steps with UN HACT-specific checklist items
  4. Submit the assessment
- **Test Data:** Ubuntu Education Trust, South Africa, Education; upload compliance_checklist.txt
- **Expected Results:**
  - UN HACT framework has its own specific checklist distinct from Kuja Standard and STEP
  - Assessment completes and submits successfully

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
  - Grant 3 (Climate Resilience, Draft status) should NOT appear to NGO users (draft grants are donor-only)
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
  - Grant 2 and Grant 4 should be filtered out (unless their descriptions contain "Health")
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

### TC-GRNT-004: Filter Grants by Country
- **Category:** Grants
- **Priority:** P1 Critical
- **Preconditions:** Logged in as ahmed@salamrelief.org; on the Browse Grants page
- **Steps:**
  1. Locate the country filter dropdown or checkboxes
  2. Select "Somalia" as the country filter
  3. Observe the filtered results
- **Test Data:** Country filter: Somalia
- **Expected Results:**
  - Grant 1 (Community Health Workers Scale-Up Program) is displayed (covers Kenya/Somalia/Uganda)
  - Grant 2 and Grant 4 are hidden (do not cover Somalia)

### TC-GRNT-005: Grant Detail Page - Overview Tab
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

### TC-GRNT-006: Grant Detail Page - Eligibility Tab
- **Category:** Grants
- **Priority:** P2 High
- **Preconditions:** On Grant 1 Detail page (TC-GRNT-005 completed)
- **Steps:**
  1. Click the "Eligibility" tab
  2. Review the eligibility criteria
- **Test Data:** N/A
- **Expected Results:**
  - Eligibility tab shows requirements such as: eligible countries, eligible sectors, minimum organizational capacity score, required documentation, etc.
  - Information is clearly formatted and readable

### TC-GRNT-007: Grant Detail Page - Criteria Tab
- **Category:** Grants
- **Priority:** P2 High
- **Preconditions:** On Grant 1 Detail page
- **Steps:**
  1. Click the "Criteria" tab
  2. Review the evaluation criteria
- **Test Data:** N/A
- **Expected Results:**
  - Criteria tab shows scoring/evaluation criteria with weights or descriptions
  - Criteria may include: technical capacity, financial management, past performance, innovation, sustainability, etc.

### TC-GRNT-008: Grant Detail Page - Documents Tab
- **Category:** Grants
- **Priority:** P2 High
- **Preconditions:** On Grant 1 Detail page
- **Steps:**
  1. Click the "Documents" tab
  2. Review the required and available documents
- **Test Data:** N/A
- **Expected Results:**
  - Documents tab shows required application documents (e.g., proposal template, budget template)
  - Any downloadable grant documents are available with download links

### TC-GRNT-009: Combined Search and Filter
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

### TC-GRNT-010: Clear All Filters
- **Category:** Grants
- **Priority:** P3 Medium
- **Preconditions:** Filters are applied (TC-GRNT-009 completed)
- **Steps:**
  1. Click "Clear Filters" or manually remove search text and deselect sector/country filters
  2. Observe results
- **Test Data:** N/A
- **Expected Results:**
  - All open grants are displayed again (Grant 1, 2, 4)
  - Search field is empty; filters are deselected

---

## 8. Application Wizard (TC-APPL)

### TC-APPL-001: Start New Application - Step 1 (Eligibility Check)
- **Category:** Application
- **Priority:** P1 Critical
- **Preconditions:** Logged in as ahmed@salamrelief.org; on Grant 1 Detail page
- **Steps:**
  1. Click the "Apply" button on Grant 1 Detail page
  2. Verify the Application Wizard opens at Step 1: Eligibility Check
  3. Review the eligibility criteria displayed
  4. Confirm that Salam Relief Foundation already has a submitted application to Grant 1
- **Test Data:** N/A
- **Expected Results:**
  - Since Salam Relief already applied (submitted, score 62.3), the system should either:
    - Redirect to the existing application, OR
    - Show a message that an application already exists
  - If duplicate applications are allowed, the eligibility check step loads and shows criteria

### TC-APPL-002: Application Wizard - Step 1 Eligibility (New Application)
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
  - If eligible, a "Next" button allows proceeding to Step 2

### TC-APPL-003: Application Wizard - Step 2 (Proposal)
- **Category:** Application
- **Priority:** P1 Critical
- **Preconditions:** Logged in as aisha@sahelwomen.org; new application started for Grant 1 (Community Health Workers); Step 1 eligibility passed
- **Steps:**
  1. On Step 1, confirm eligibility passes (Sahel is in Nigeria; Grant 1 does not list Nigeria but covers Kenya/Somalia/Uganda - verify behavior)
  2. If eligible, click "Next" to proceed to Step 2
  3. Fill in the proposal fields:
     - Project Title: "Sahel Community Health Workers Training Program"
     - Project Summary: "A comprehensive program to train 200 community health workers across northern Nigeria to provide basic health services in underserved areas."
     - Objectives: "1. Train 200 CHWs in basic health service delivery. 2. Reduce child mortality by 15% in target communities. 3. Establish sustainable health worker networks."
     - Methodology: "The program will use a cascading training model with master trainers conducting regional workshops."
     - Timeline: "12 months with quarterly milestones"
     - Budget Amount: "450000"
- **Test Data:** As described above
- **Expected Results:**
  - Step 2 displays proposal form fields
  - All text fields accept input
  - Budget field accepts numeric input
  - Data is retained when navigating between steps

### TC-APPL-004: Application Wizard - Step 3 (Documents)
- **Category:** Application
- **Priority:** P1 Critical
- **Preconditions:** Step 2 proposal completed (TC-APPL-003)
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

### TC-APPL-005: Application Wizard - Step 4 (Review & Submit)
- **Category:** Application
- **Priority:** P1 Critical
- **Preconditions:** Step 3 documents uploaded (TC-APPL-004)
- **Steps:**
  1. Click "Next" to proceed to Step 4
  2. Review all application information: eligibility results, proposal details, uploaded documents
  3. Verify all data is correct
  4. Click "Submit Application"
- **Test Data:** N/A
- **Expected Results:**
  - Step 4 shows a comprehensive summary of the entire application
  - Proposal title, summary, objectives, methodology, timeline, and budget are displayed
  - Uploaded documents are listed
  - After clicking Submit, a success message confirms submission
  - Application status changes to "Submitted"
  - User is redirected to My Applications or a confirmation page

### TC-APPL-006: Save Application as Draft
- **Category:** Application
- **Priority:** P2 High
- **Preconditions:** Logged in as peter@hopebridges.org; on Step 2 of an application to Grant 2 (Education Technology)
- **Steps:**
  1. Start a new application to Grant 2
  2. Fill in partial proposal: Project Title: "Rural Digital Education Initiative"
  3. Click "Save Draft" or navigate away
- **Test Data:** Project Title: "Rural Digital Education Initiative"
- **Expected Results:**
  - Application is saved in Draft status
  - Application appears in My Applications with status "Draft"
  - Returning to the application later shows the saved data

### TC-APPL-007: Resume Draft Application
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

### TC-APPL-008: Application Wizard - Back Navigation with Data Preservation
- **Category:** Application
- **Priority:** P2 High
- **Preconditions:** On Step 3 of an application wizard with data entered in Steps 1-2
- **Steps:**
  1. Click "Back" to return to Step 2
  2. Verify proposal data is preserved
  3. Click "Back" to return to Step 1
  4. Verify eligibility data is preserved
  5. Click "Next" twice to return to Step 3
  6. Verify document upload state is preserved
- **Test Data:** N/A
- **Expected Results:**
  - All data is preserved across step navigation
  - No data loss when going back and forward

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
  - Progress indicator shows Step 1 of 5

### TC-GCRT-002: Grant Creation Wizard - Step 2 (Eligibility)
- **Category:** Grant Creation
- **Priority:** P1 Critical
- **Preconditions:** Step 1 completed (TC-GCRT-001)
- **Steps:**
  1. Click "Next" to proceed to Step 2: Eligibility
  2. Select eligible countries: Kenya, Uganda, Tanzania, Rwanda
  3. Select eligible sectors: Education, Technology
  4. Set minimum organizational capacity score: 60
  5. Add eligibility criteria: "Organization must have at least 3 years of operational experience in education"
- **Test Data:** Countries: Kenya, Uganda, Tanzania, Rwanda; Sectors: Education, Technology; Min score: 60
- **Expected Results:**
  - Step 2 shows eligibility configuration fields
  - Country multi-select works correctly
  - Sector multi-select works correctly
  - Minimum score field accepts numeric input
  - Custom eligibility criteria text field works

### TC-GCRT-003: Grant Creation Wizard - Step 3 (Criteria)
- **Category:** Grant Creation
- **Priority:** P2 High
- **Preconditions:** Step 2 completed (TC-GCRT-002)
- **Steps:**
  1. Click "Next" to proceed to Step 3: Evaluation Criteria
  2. Add evaluation criteria:
     - "Technical Capacity" with weight 30%
     - "Financial Management" with weight 20%
     - "Innovation" with weight 25%
     - "Sustainability" with weight 15%
     - "Impact Potential" with weight 10%
  3. Verify weights sum to 100%
- **Test Data:** As described above
- **Expected Results:**
  - Step 3 shows evaluation criteria configuration
  - Criteria can be added dynamically
  - Weight percentages are validated (must sum to 100%)
  - Each criterion has name and weight fields

### TC-GCRT-004: Grant Creation Wizard - Step 4 (Documents)
- **Category:** Grant Creation
- **Priority:** P2 High
- **Preconditions:** Step 3 completed (TC-GCRT-003)
- **Steps:**
  1. Click "Next" to proceed to Step 4: Documents
  2. Upload `grant_agreement_sample.txt` as the grant agreement template
  3. Upload `budget_template.txt` as the budget template
  4. Specify required application documents: "Project proposal, Organization registration, Audit report, Budget breakdown"
- **Test Data:** Files: grant_agreement_sample.txt, budget_template.txt
- **Expected Results:**
  - Step 4 shows document upload and configuration
  - Grant templates upload successfully
  - Required document types can be specified
  - Uploaded documents display with file names

### TC-GCRT-005: Grant Creation Wizard - Step 5 (Reporting Requirements with AI Extraction)
- **Category:** Grant Creation
- **Priority:** P1 Critical
- **Preconditions:** Step 4 completed (TC-GCRT-004)
- **Steps:**
  1. Click "Next" to proceed to Step 5: Reporting Requirements
  2. Upload `grant_agreement_sample.txt` to the grant document upload field for AI extraction
  3. Wait for AI to process the document and extract reporting requirements
  4. Review the AI-extracted reporting requirements
  5. Modify or confirm the extracted requirements:
     - Reporting frequency: Quarterly
     - Report types: Financial Report, Progress Report
     - First report due: 3 months after grant start
  6. Add custom requirement: "Annual audit report required within 60 days of fiscal year end"
- **Test Data:** File: grant_agreement_sample.txt; custom requirement text as described
- **Expected Results:**
  - Step 5 shows reporting requirements configuration
  - AI extraction processes the uploaded grant document
  - Extracted reporting requirements are displayed for review
  - Donor can modify, add, or remove extracted requirements
  - Custom requirements can be added manually
  - Progress indicator shows Step 5 of 5

### TC-GCRT-006: Grant Creation Wizard - Submit Grant
- **Category:** Grant Creation
- **Priority:** P1 Critical
- **Preconditions:** All 5 steps completed (TC-GCRT-001 through TC-GCRT-005)
- **Steps:**
  1. Review all grant information on the final summary or from Step 5
  2. Click "Create Grant" or "Publish Grant" or "Save as Draft"
  3. Choose to save as Draft first
- **Test Data:** N/A
- **Expected Results:**
  - Grant is created successfully with status "Draft"
  - Success message is displayed
  - Grant appears in the Donor's grant list
  - Grant does NOT appear in NGO browse (since it is Draft)

### TC-GCRT-007: Publish Draft Grant
- **Category:** Grant Creation
- **Priority:** P1 Critical
- **Preconditions:** Draft grant created (TC-GCRT-006); logged in as david@eatrust.org
- **Steps:**
  1. Navigate to the Donor Dashboard or grant management section
  2. Find the draft grant "Digital Literacy for East African Youth"
  3. Click "Publish" or "Open for Applications"
- **Test Data:** N/A
- **Expected Results:**
  - Grant status changes from "Draft" to "Open"
  - Grant now appears in NGO Browse Grants results
  - Success confirmation is displayed

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
  - A loading/processing indicator appears while AI analyzes the document
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
  - AI analysis returns a score and possibly detailed feedback
  - Score is displayed with the document in the list
  - AI may provide specific observations about the audit report content

### TC-DOCU-003: Upload Impact Report with AI Scoring
- **Category:** Document Upload & AI Analysis
- **Priority:** P2 High
- **Preconditions:** Logged in as fatima@amani.org; on My Documents page
- **Steps:**
  1. Click "Upload Document"
  2. Select `impact_report_annual_2025.txt`
  3. Select document type: "Impact Report"
  4. Click "Upload"
  5. Wait for AI analysis
- **Test Data:** File: impact_report_annual_2025.txt; Type: Impact Report
- **Expected Results:**
  - Document uploads and AI analyzes it
  - Real-time scoring feedback is displayed
  - Document appears in the list with an AI-generated score

### TC-DOCU-004: View Document Details and AI Score
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

### TC-DOCU-005: Upload Document During Application
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
  - Score contributes to the overall application quality indicator

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

### TC-RPTN-002: Create New Report - Select Grant and Report Type
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

### TC-RPTN-003: Fill Report Content Sections
- **Category:** Reports - NGO
- **Priority:** P1 Critical
- **Preconditions:** New report created (TC-RPTN-002); report editor is open
- **Steps:**
  1. Locate the content sections of the report (e.g., Executive Summary, Financial Overview, Activities, Challenges, Next Steps)
  2. Fill in "Executive Summary": "This quarterly financial report covers Q2 2026 activities under the Community Health Workers Scale-Up Program. Total expenditure for the quarter was $125,000 against a budget of $130,000, representing a 96% burn rate."
  3. Fill in "Financial Overview": "Budget allocation: $130,000. Actual spending: $125,000. Variance: $5,000 (3.8% underspend). Major expenditure categories: Personnel ($65,000), Training ($30,000), Supplies ($20,000), Travel ($10,000)."
  4. Fill in "Activities": "1. Trained 50 new community health workers in 3 counties. 2. Conducted 15 community health outreach events. 3. Distributed 5,000 health kits."
  5. Fill in "Challenges": "Supply chain delays for health kits impacted distribution timeline by 2 weeks. Local election period restricted community access in one county."
  6. Fill in "Next Steps": "1. Complete CHW training for remaining 30 workers. 2. Launch mobile health monitoring system. 3. Conduct mid-year impact assessment."
- **Test Data:** As described in each section above
- **Expected Results:**
  - All content sections accept text input
  - Text is saved as user types or on explicit save
  - Rich text formatting may be available (bold, bullets, etc.)

### TC-RPTN-004: Save Report as Draft
- **Category:** Reports - NGO
- **Priority:** P1 Critical
- **Preconditions:** Report content partially filled (TC-RPTN-003)
- **Steps:**
  1. Click "Save Draft" button
  2. Verify save confirmation
  3. Navigate away from the report
  4. Return to Reports list
  5. Verify the report appears with "Draft" status
- **Test Data:** N/A
- **Expected Results:**
  - Report is saved with "Draft" status
  - Confirmation message appears
  - Report appears in the reports list as Draft
  - Clicking on the draft report reopens it with all saved content

### TC-RPTN-005: Submit Report for AI Analysis
- **Category:** Reports - NGO
- **Priority:** P1 Critical
- **Preconditions:** Report content fully filled (TC-RPTN-003 completed with all sections)
- **Steps:**
  1. Return to the draft report (Q2 2026 Financial Report)
  2. Review all content sections
  3. Click "Submit" or "Submit for Review" button
  4. Confirm submission in any confirmation dialog
  5. Wait for AI analysis to process
- **Test Data:** N/A
- **Expected Results:**
  - Report status changes from "Draft" to "Submitted"
  - AI analysis begins processing the report content
  - AI analysis scores are generated and displayed (similar to the Q1 report scores: compliance/completeness/quality)
  - Report cannot be edited after submission (read-only)
  - Success message confirms submission

### TC-RPTN-006: View Report with Revision Requested Status
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

### TC-RPTN-007: View Accepted Report
- **Category:** Reports - NGO
- **Priority:** P3 Medium
- **Preconditions:** Logged in as fatima@amani.org
- **Steps:**
  1. Navigate to Reports
  2. Click on "Test Q2 Financial Report" (status: Accepted)
- **Test Data:** N/A
- **Expected Results:**
  - Report opens in read-only mode
  - "Accepted" status is prominently displayed
  - All content sections are visible but not editable

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
  - Report 3 (Test Q2 Financial Report, Accepted) may appear in a completed section
  - Report 4 (Annual Impact Report 2025, Revision Requested) is visible
  - Draft reports (Report 2) should NOT be visible to donors
  - Each report shows: NGO name, grant name, report title, status, submission date, AI scores

### TC-RPTD-002: Review Submitted Report
- **Category:** Reports - Donor Review
- **Priority:** P1 Critical
- **Preconditions:** Logged in as sarah@globalhealth.org; on the Reports page
- **Steps:**
  1. Click on Report 1 "Q1 2026 Financial Report" (Submitted, from Amani)
  2. Review the report content and AI analysis scores (90/100/65)
  3. Read through all content sections
- **Test Data:** N/A
- **Expected Results:**
  - Report detail page opens showing full report content
  - AI analysis scores are displayed: scores of 90, 100, and 65 for different dimensions
  - All content sections (Executive Summary, Financial Overview, etc.) are readable
  - Action buttons available: "Accept" and "Request Revision"

### TC-RPTD-003: Accept a Report
- **Category:** Reports - Donor Review
- **Priority:** P1 Critical
- **Preconditions:** Viewing Report 1 detail (TC-RPTD-002)
- **Steps:**
  1. Click the "Accept" button
  2. Optionally add a note: "Excellent financial reporting. All expenditures well documented."
  3. Confirm acceptance
- **Test Data:** Note: "Excellent financial reporting. All expenditures well documented."
- **Expected Results:**
  - Report status changes to "Accepted"
  - Confirmation message is displayed
  - NGO (Amani) can see the accepted status and donor's note
  - Report moves to the completed/accepted reports section

### TC-RPTD-004: Request Revision on a Report
- **Category:** Reports - Donor Review
- **Priority:** P1 Critical
- **Preconditions:** Logged in as sarah@globalhealth.org; viewing Report 5 "Under Review Financial Report"
- **Steps:**
  1. Click on Report 5 to view details
  2. Click "Request Revision" button
  3. Enter revision notes: "Please provide more detail on the travel expenditures in Section 3. The variance between budgeted and actual spending on supplies needs explanation. Also, please attach supporting receipts for purchases over $1,000."
  4. Click "Submit Revision Request" or "Send"
- **Test Data:** Revision notes as described above
- **Expected Results:**
  - Report status changes to "Revision Requested"
  - Revision notes are saved and associated with the report
  - NGO can view the revision notes when they open the report
  - Confirmation message is displayed to the donor

### TC-RPTD-005: View Report AI Analysis Scores
- **Category:** Reports - Donor Review
- **Priority:** P2 High
- **Preconditions:** Logged in as sarah@globalhealth.org; viewing Report 1
- **Steps:**
  1. Locate the AI analysis section on the report detail page
  2. Review the three AI scores: 90, 100, and 65
- **Test Data:** N/A
- **Expected Results:**
  - AI scores are clearly displayed, possibly with labels (e.g., Financial Accuracy: 90, Completeness: 100, Narrative Quality: 65)
  - Scores may have visual indicators (progress bars, color coding)
  - AI may provide detailed feedback or recommendations alongside scores

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
    - Capacity Score: 82
    - Contact information, registration details, etc.
  - An "Edit" button is available

### TC-ORG-002: Edit Organization Profile
- **Category:** Organization
- **Priority:** P2 High
- **Preconditions:** Logged in as fatima@amani.org; on Organization Profile page (TC-ORG-001)
- **Steps:**
  1. Click "Edit" button
  2. Update the description field: "Amani Community Development is a Kenyan NGO focused on improving health outcomes in underserved communities through WASH programs, nutrition support, and community health worker training. Founded in 2015, we operate in 5 counties across Kenya."
  3. Add a phone number: "+254 700 123 456"
  4. Click "Save" or "Update Profile"
- **Test Data:** Description and phone number as described
- **Expected Results:**
  - Profile fields become editable
  - Changes are saved successfully
  - Success message is displayed
  - Profile page refreshes with updated information
  - Description and phone number reflect the new values

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
  - Search results show "Amani Community Development" with key details: country (Kenya), sectors (Health, WASH, Nutrition), capacity score (82)
  - Clicking on the result opens the organization's profile view (donor perspective)

### TC-ORG-004: Organization Search by Country
- **Category:** Organization
- **Priority:** P3 Medium
- **Preconditions:** Logged in as david@eatrust.org; on Organization Search page
- **Steps:**
  1. Filter by country: "Kenya"
  2. Review results
- **Test Data:** Country filter: Kenya
- **Expected Results:**
  - Results include Amani Community Development (Kenya)
  - Results do NOT include Salam Relief Foundation (Somalia) or Ubuntu Education Trust (South Africa)

### TC-ORG-005: Compliance & Due Diligence (Donor Feature)
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
  - Due diligence checks and results are displayed

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
  - Send button is available

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
  - AI responds with contextually relevant information about grants matching Amani's profile (Health sector, Kenya)
  - Response mentions Grant 1 (Community Health Workers Scale-Up Program) as relevant

### TC-AICHAT-003: AI Assistant Context Awareness
- **Category:** AI Assistant
- **Priority:** P3 Medium
- **Preconditions:** Logged in as fatima@amani.org; AI Chat panel is open; user is on the Grant 1 detail page
- **Steps:**
  1. Navigate to Grant 1 detail page
  2. Open AI Chat
  3. Type: "Can you help me understand the eligibility requirements for this grant?"
  4. Send and wait for response
- **Test Data:** Question about current page context
- **Expected Results:**
  - AI response is contextually aware of the grant being viewed (Grant 1)
  - Response references specific eligibility criteria for the Community Health Workers Scale-Up Program
  - Response is helpful and actionable

### TC-AICHAT-004: Close AI Chat Assistant
- **Category:** AI Assistant
- **Priority:** P3 Medium
- **Preconditions:** AI Chat panel is open
- **Steps:**
  1. Click the close button (X) on the chat panel, or click the chat icon again to toggle
- **Test Data:** N/A
- **Expected Results:**
  - Chat panel closes
  - Floating chat button remains visible
  - Chat history is preserved if panel is reopened

---

## 15. Language & UI (TC-LANG)

### TC-LANG-001: Switch Language to French
- **Category:** Language & UI
- **Priority:** P2 High
- **Preconditions:** Logged in as fatima@amani.org; language is set to English
- **Steps:**
  1. Locate the language switcher (usually in the header or sidebar)
  2. Select "French" / "Fran\u00e7ais"
  3. Observe the page content
- **Test Data:** Target language: French
- **Expected Results:**
  - UI elements switch to French (navigation labels, buttons, headings)
  - Sidebar menu items are translated
  - Page content that has translations is displayed in French
  - Language selection persists across page navigation

### TC-LANG-002: Switch Language to Swahili
- **Category:** Language & UI
- **Priority:** P2 High
- **Preconditions:** Logged in as fatima@amani.org
- **Steps:**
  1. Select "Swahili" / "Kiswahili" from the language switcher
  2. Observe the UI translation
- **Test Data:** Target language: Swahili
- **Expected Results:**
  - UI switches to Swahili translations
  - Key navigation items and headings are in Swahili
  - Numbers and dates may remain in standard format

### TC-LANG-003: Switch Language to Arabic
- **Category:** Language & UI
- **Priority:** P2 High
- **Preconditions:** Logged in as fatima@amani.org
- **Steps:**
  1. Select "Arabic" / "\u0627\u0644\u0639\u0631\u0628\u064a\u0629" from the language switcher
  2. Observe the UI
- **Test Data:** Target language: Arabic
- **Expected Results:**
  - UI switches to Arabic translations
  - Text direction changes to RTL (right-to-left) if the application supports it
  - Layout adjusts for RTL reading order
  - Sidebar may flip to the right side

### TC-LANG-004: Switch Language to Somali
- **Category:** Language & UI
- **Priority:** P3 Medium
- **Preconditions:** Logged in as ahmed@salamrelief.org
- **Steps:**
  1. Select "Somali" / "Soomaali" from the language switcher
  2. Observe the UI
- **Test Data:** Target language: Somali
- **Expected Results:**
  - UI switches to Somali translations
  - Navigation and key UI elements are translated

### TC-LANG-005: Language Persistence Across Pages
- **Category:** Language & UI
- **Priority:** P2 High
- **Preconditions:** Language set to French (TC-LANG-001)
- **Steps:**
  1. Navigate to Browse Grants page
  2. Navigate to My Applications page
  3. Navigate back to Dashboard
- **Test Data:** N/A
- **Expected Results:**
  - French language persists across all page navigations
  - No revert to English on any page

### TC-LANG-006: Switch Back to English
- **Category:** Language & UI
- **Priority:** P3 Medium
- **Preconditions:** Language is set to a non-English language
- **Steps:**
  1. Select "English" from the language switcher
  2. Observe the UI
- **Test Data:** Target language: English
- **Expected Results:**
  - UI reverts to English
  - All translations reset to English text

### TC-LANG-007: Sidebar Navigation - Role-Based Visibility (NGO)
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
  - Sidebar does NOT show reviewer-only items

### TC-LANG-008: Sidebar Navigation - Role-Based Visibility (Donor)
- **Category:** Language & UI
- **Priority:** P1 Critical
- **Preconditions:** Logged in as sarah@globalhealth.org
- **Steps:**
  1. Examine the sidebar navigation menu
  2. List all visible menu items
- **Test Data:** N/A
- **Expected Results:**
  - Sidebar shows donor-specific items: Dashboard, My Grants/Active Grants, Create Grant, Organization Search, Compliance & Due Diligence, Reports, Review Applications/Rankings
  - Sidebar does NOT show NGO-only items: Browse Grants, My Applications, Assessment Hub, My Documents

### TC-LANG-009: Responsive Design - Mobile View
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
  - Text is readable without horizontal scrolling

### TC-LANG-010: Responsive Design - Tablet View
- **Category:** Language & UI
- **Priority:** P3 Medium
- **Preconditions:** Logged in as fatima@amani.org
- **Steps:**
  1. Resize browser to tablet width (approximately 768px wide)
  2. Observe layout
- **Test Data:** Browser width: 768px
- **Expected Results:**
  - Layout adapts to tablet dimensions
  - Content is well-organized and readable
  - Navigation is accessible (may be collapsed or mini sidebar)

---

## 16. Edge Cases & Error Handling (TC-EDGE)

### TC-EDGE-001: Upload Invalid File Type
- **Category:** Edge Cases & Error Handling
- **Priority:** P2 High
- **Preconditions:** Logged in as fatima@amani.org; on My Documents page
- **Steps:**
  1. Click "Upload Document"
  2. Attempt to upload a file with an unsupported extension (e.g., create or select a `.exe` file or any disallowed type)
  3. Observe the response
- **Test Data:** Unsupported file type
- **Expected Results:**
  - File upload is rejected
  - Error message indicates the file type is not supported
  - List of accepted file types is shown
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
  - Error messages highlight the required fields (Project Title, Project Summary)
  - User remains on Step 2
  - Partially entered data is preserved

### TC-EDGE-003: Access Donor Feature as NGO User
- **Category:** Edge Cases & Error Handling
- **Priority:** P1 Critical
- **Preconditions:** Logged in as fatima@amani.org (NGO role)
- **Steps:**
  1. Manually navigate to a donor-only URL (e.g., `/grants/create` or `/compliance` or `/organizations/search`)
- **Test Data:** N/A
- **Expected Results:**
  - Access is denied (403 Forbidden) or user is redirected to their dashboard
  - An error message indicates insufficient permissions
  - No donor functionality is exposed

### TC-EDGE-004: Access NGO Feature as Donor User
- **Category:** Edge Cases & Error Handling
- **Priority:** P1 Critical
- **Preconditions:** Logged in as sarah@globalhealth.org (Donor role)
- **Steps:**
  1. Manually navigate to an NGO-only URL (e.g., `/applications/new` or `/assessment` or `/my-documents`)
- **Test Data:** N/A
- **Expected Results:**
  - Access is denied or user is redirected to donor dashboard
  - Error message about role restrictions is shown

### TC-EDGE-005: Grant Creation with Invalid Amount
- **Category:** Edge Cases & Error Handling
- **Priority:** P2 High
- **Preconditions:** Logged in as david@eatrust.org; on Grant Creation Wizard Step 1
- **Steps:**
  1. Enter Grant Title: "Test Grant"
  2. Enter Amount: "abc" (non-numeric)
  3. Try to proceed
  4. Then enter Amount: "-50000" (negative)
  5. Try to proceed
  6. Then enter Amount: "0"
  7. Try to proceed
- **Test Data:** Amounts: "abc", "-50000", "0"
- **Expected Results:**
  - Non-numeric input is rejected with validation error
  - Negative amount is rejected with validation error
  - Zero amount is rejected or flagged as invalid
  - Appropriate error messages are shown for each case

### TC-EDGE-006: Session Timeout Handling
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
  - No partial data or broken pages are displayed

### TC-EDGE-007: Concurrent Draft Editing
- **Category:** Edge Cases & Error Handling
- **Priority:** P3 Medium
- **Preconditions:** Logged in as fatima@amani.org; has a draft report (Report 2)
- **Steps:**
  1. Open the draft report in one browser tab
  2. Open the same draft report in a second browser tab
  3. Edit content in Tab 1: change Executive Summary to "Updated from Tab 1"
  4. Save in Tab 1
  5. Edit content in Tab 2: change Executive Summary to "Updated from Tab 2"
  6. Save in Tab 2
- **Test Data:** Two different summary texts from two tabs
- **Expected Results:**
  - System handles concurrent edits gracefully
  - Either: last save wins (Tab 2 content prevails), or a conflict warning is shown in Tab 2
  - No data corruption occurs

### TC-EDGE-008: Empty Report Submission
- **Category:** Edge Cases & Error Handling
- **Priority:** P2 High
- **Preconditions:** Logged in as fatima@amani.org; creating a new report
- **Steps:**
  1. Create a new report (select grant and type)
  2. Leave all content sections empty
  3. Attempt to click "Submit"
- **Test Data:** All content sections empty
- **Expected Results:**
  - Submission is prevented
  - Validation errors indicate required content sections
  - Report remains in Draft status

### TC-EDGE-009: Special Characters in Form Fields
- **Category:** Edge Cases & Error Handling
- **Priority:** P3 Medium
- **Preconditions:** Logged in as fatima@amani.org; on the application wizard Step 2
- **Steps:**
  1. Enter Project Title: "Women's Health & Nutrition <Phase 2> \"Expansion\""
  2. Enter Summary with special characters: "Budget: $50,000 (50% increase). Contact: fatima@amani.org. Ratio: 1:10. Path: C:\\Documents"
  3. Proceed to the next step and verify data integrity
- **Test Data:** Special characters: apostrophe, ampersand, angle brackets, quotes, dollar sign, backslash, colon, at-sign
- **Expected Results:**
  - All special characters are accepted and stored correctly
  - No XSS vulnerability (angle brackets are escaped in display)
  - Data displays correctly on the review step
  - No server errors from special characters

### TC-EDGE-010: Very Long Text Input
- **Category:** Edge Cases & Error Handling
- **Priority:** P3 Medium
- **Preconditions:** Logged in as fatima@amani.org; creating a report
- **Steps:**
  1. In the report Executive Summary section, paste a very long text (5000+ characters)
  2. Save the report
  3. Re-open and verify the full text is preserved
- **Test Data:** 5000+ character text block
- **Expected Results:**
  - System accepts the long text (or shows a character limit warning)
  - If a character limit exists, a counter shows remaining characters
  - Saved text is fully preserved without truncation

---

## 17. Cross-Role End-to-End Workflows (TC-E2E)

### TC-E2E-001: Full Grant Lifecycle - Creation to Report Review

**Description:** Complete lifecycle: Donor creates a grant, NGO discovers and applies, Reviewer scores, Donor awards, NGO submits a report, Donor reviews and accepts the report.

- **Category:** Cross-Role Workflows
- **Priority:** P1 Critical
- **Preconditions:** Application is running; all test users available

**Phase 1: Donor Creates Grant**
- **Steps:**
  1. Log in as david@eatrust.org (Donor)
  2. Click "Create Grant" in the sidebar
  3. Complete Step 1 - Basic Info:
     - Title: "Agricultural Innovation Grant for East Africa"
     - Description: "Supporting innovative agricultural practices to improve food security in East African communities"
     - Amount: 400000
     - Currency: USD
     - Deadline: 2026-08-15
     - Duration: 18 months
  4. Complete Step 2 - Eligibility:
     - Countries: Kenya, Uganda, Tanzania
     - Sectors: Food Security, Agriculture, Climate
     - Min capacity score: 50
  5. Complete Step 3 - Criteria:
     - Technical Capacity: 30%
     - Innovation: 25%
     - Sustainability: 25%
     - Impact: 20%
  6. Complete Step 4 - Documents: upload `grant_agreement_sample.txt`
  7. Complete Step 5 - Reporting Requirements: Quarterly financial reports, Semi-annual progress reports
  8. Save as Draft, then Publish
  9. Log out

**Phase 1 Expected Results:**
  - Grant is created and published with status "Open"
  - Grant appears in the donor's active grants list
  - Grant is visible to NGOs in Browse Grants

**Phase 2: NGO Discovers and Applies**
- **Steps:**
  1. Log in as ahmed@salamrelief.org (NGO, Somalia, Food Security)
  2. Navigate to Browse Grants
  3. Note: Salam is in Somalia, but the grant covers Kenya/Uganda/Tanzania - verify eligibility behavior
  4. If ineligible, log out and log in as fatima@amani.org (Kenya, Health - may or may not match Food Security sector)
  5. Alternatively, log in as peter@hopebridges.org (Uganda, Health/Climate)
  6. Search for "Agricultural Innovation"
  7. Click on the grant to view details
  8. Click "Apply"
  9. Complete Step 1 - Eligibility Check: confirm eligibility passes
  10. Complete Step 2 - Proposal:
      - Title: "Sustainable Farming Innovation Program"
      - Summary: "An 18-month program to introduce climate-smart agricultural techniques to 500 smallholder farmers across 3 districts in Uganda, improving crop yields by 40% and building long-term food security."
      - Objectives: "1. Train 500 farmers in climate-smart agriculture. 2. Establish 10 demonstration farms. 3. Increase average crop yield by 40%."
      - Methodology: "Farmer Field Schools combined with digital extension services and peer-to-peer learning networks."
      - Timeline: "18 months with quarterly milestone reviews"
      - Budget: 380000
  11. Complete Step 3 - Documents: upload `project_proposal.txt`, `budget_template.txt`, `registration_certificate.txt`
  12. Complete Step 4 - Review and Submit
  13. Log out

**Phase 2 Expected Results:**
  - Application is submitted successfully
  - AI score is generated for the application
  - Application appears in the donor's received applications list
  - Application appears in the NGO's My Applications with status "Submitted"

**Phase 3: Reviewer Scores Application**
- **Steps:**
  1. Log in as james@reviewer.org (Reviewer)
  2. Navigate to Reviewer Dashboard
  3. Locate the assignment for the submitted application (if assigned)
  4. Open the application for review
  5. Review the proposal content, documents, and AI score
  6. Enter evaluation scores based on the criteria (Technical: 8/10, Innovation: 7/10, Sustainability: 9/10, Impact: 8/10)
  7. Add reviewer comments: "Strong proposal with clear implementation plan. Recommend funding with minor budget adjustments."
  8. Submit the review
  9. Log out

**Phase 3 Expected Results:**
  - Reviewer can access and score the application
  - Scores are saved and associated with the application
  - Reviewer comments are recorded
  - Application ranking is updated based on the review

**Phase 4: Donor Reviews Rankings and Awards**
- **Steps:**
  1. Log in as david@eatrust.org (Donor)
  2. Navigate to "Review Applications" or "Rankings" for the Agricultural Innovation Grant
  3. View the ranked list of applications
  4. Review the top-ranked application details including reviewer scores and AI scores
  5. Click "Award" or equivalent action on the top application
  6. Confirm the award
  7. Log out

**Phase 4 Expected Results:**
  - Applications are ranked by combined scores (AI + reviewer)
  - Donor can see all scoring details
  - Award action changes the application status (e.g., to "Awarded" or "Approved")
  - NGO is notified or can see the updated status

**Phase 5: NGO Submits Report**
- **Steps:**
  1. Log in as the awarded NGO (peter@hopebridges.org or the applicable user)
  2. Navigate to Reports
  3. Create a new report:
     - Grant: "Agricultural Innovation Grant for East Africa"
     - Type: Financial Report
     - Title: "Q1 2026 Agricultural Innovation Financial Report"
  4. Fill in report sections:
     - Executive Summary: "First quarter report covering initial project setup and farmer recruitment activities."
     - Financial Overview: "Total Q1 expenditure: $65,000 against budget of $70,000. Key expenses: Staff recruitment ($25,000), Training materials ($15,000), Farm inputs ($20,000), Admin ($5,000)."
     - Activities: "Recruited 3 agricultural extension officers. Identified and assessed 150 target farmers. Procured initial farm inputs for demonstration plots."
     - Challenges: "Delayed procurement of specialized seeds due to import regulations."
     - Next Steps: "Begin Farmer Field School sessions. Establish first 3 demonstration farms."
  5. Save as Draft, review, then Submit
  6. Wait for AI analysis to complete
  7. Log out

**Phase 5 Expected Results:**
  - Report is created and submitted successfully
  - AI analysis generates scores for the report
  - Report appears in donor's review queue
  - Report status is "Submitted"

**Phase 6: Donor Reviews and Accepts Report**
- **Steps:**
  1. Log in as david@eatrust.org (Donor)
  2. Navigate to Reports
  3. Find and open the "Q1 2026 Agricultural Innovation Financial Report"
  4. Review the content and AI analysis scores
  5. Click "Accept"
  6. Add note: "Good start to the project. Please ensure seed procurement issue is resolved by Q2."
  7. Confirm acceptance
  8. Log out

**Phase 6 Expected Results:**
  - Report status changes to "Accepted"
  - Donor note is saved and visible to the NGO
  - Complete grant lifecycle from creation to report acceptance is verified

---

### TC-E2E-002: NGO Assessment to Application Pipeline

**Description:** NGO completes an organizational assessment, uploads supporting documents with AI scoring, browses for matching grants, and submits an application.

- **Category:** Cross-Role Workflows
- **Priority:** P1 Critical
- **Preconditions:** Application is running; thandi@ubuntu.org has not completed an assessment

**Phase 1: Complete Assessment**
- **Steps:**
  1. Log in as thandi@ubuntu.org (Ubuntu Education Trust, South Africa, Education)
  2. Click "Assessment Hub" in the sidebar
  3. Select "CHS" (Core Humanitarian Standard) framework
  4. Step 1 - Org Profile: verify Ubuntu Education Trust, South Africa, Education are pre-filled. Click Next.
  5. Step 2 - Checklist: check at least 6 CHS-specific checklist items:
     - Community engagement practices
     - Accountability mechanisms
     - Complaints and feedback mechanisms
     - Staff competency framework
     - Financial transparency
     - Monitoring and evaluation processes
     For each, add brief notes (e.g., "Ubuntu has an active community advisory board").
  6. Step 3 - Documents: upload `compliance_checklist.txt` and `registration_certificate.txt`
  7. Step 4 - Review and Submit assessment

**Phase 1 Expected Results:**
  - CHS assessment is completed successfully
  - Assessment results/score is recorded
  - Assessment appears in the user's assessment history
  - Capacity score may be updated based on assessment results

**Phase 2: Upload Documents with AI Scoring**
- **Steps:**
  1. Navigate to "My Documents"
  2. Upload `audit_report_2025.txt` - Type: Audit Report - wait for AI scoring
  3. Upload `impact_report_annual_2025.txt` - Type: Impact Report - wait for AI scoring
  4. Upload `financial_report_q1_2026.txt` - Type: Financial Report - wait for AI scoring
  5. Review all three AI scores

**Phase 2 Expected Results:**
  - All three documents upload successfully
  - AI scoring completes for each document
  - Scores are displayed next to each document
  - Documents are stored and accessible from the My Documents page

**Phase 3: Browse and Select Grant**
- **Steps:**
  1. Navigate to "Browse Grants"
  2. Filter by sector: "Education"
  3. Identify Grant 2 (Education Technology for Rural Schools, $250K)
  4. Click to view Grant 2 details
  5. Review all tabs: Overview, Eligibility, Criteria, Documents

**Phase 3 Expected Results:**
  - Grant 2 appears when filtering by Education sector
  - Grant detail page shows all relevant information
  - Ubuntu Education Trust meets eligibility criteria (Education sector, though South Africa may not be in the country list: Kenya/Uganda/Tanzania)

**Phase 4: Submit Application**
- **Steps:**
  1. Click "Apply" on Grant 2
  2. Note: Ubuntu already has a Draft application to Grant 2 - system should offer to continue the draft
  3. If continuing draft: complete remaining steps
  4. If new application: complete all 4 steps:
     - Step 1: Eligibility Check (verify South Africa eligibility for Kenya/Uganda/Tanzania grant)
     - Step 2: Proposal
       - Title: "Digital Learning Platform for East African Schools"
       - Summary: "Leveraging Ubuntu Education Trust's proven digital literacy programs to establish technology-enabled learning centers in 50 rural schools across East Africa."
       - Objectives: "1. Deploy digital learning platforms in 50 schools. 2. Train 200 teachers in educational technology. 3. Improve student test scores by 25%."
       - Methodology: "Partnership with local education authorities and technology providers for sustainable deployment."
       - Budget: 240000
     - Step 3: Upload `project_proposal.txt` and `budget_template.txt`
     - Step 4: Review and Submit
  5. Log out

**Phase 4 Expected Results:**
  - Application is submitted (or draft is completed and submitted)
  - AI score is generated
  - Application appears in My Applications with "Submitted" status
  - End-to-end pipeline from assessment to application is verified

---

### TC-E2E-003: Report Revision Cycle

**Description:** NGO submits a report, Donor requests revision, NGO revises and resubmits, Donor accepts.

- **Category:** Cross-Role Workflows
- **Priority:** P2 High
- **Preconditions:** Logged in as fatima@amani.org; Report 4 (Annual Impact Report 2025) has status "Revision Requested"

**Phase 1: NGO Reviews Revision Request**
- **Steps:**
  1. Log in as fatima@amani.org
  2. Navigate to Reports
  3. Click on "Annual Impact Report 2025" (status: Revision Requested)
  4. Read the donor's revision notes
  5. Make revisions to the report content based on feedback
  6. Add additional detail to the sections flagged for revision
  7. Click "Resubmit" or "Submit Revised Report"
  8. Log out

**Phase 1 Expected Results:**
  - Revision notes from donor are clearly visible
  - Report content is editable for revision
  - After resubmission, status changes to "Submitted" or "Resubmitted"
  - AI re-analysis may run on the revised content

**Phase 2: Donor Reviews Revised Report**
- **Steps:**
  1. Log in as sarah@globalhealth.org
  2. Navigate to Reports
  3. Find the resubmitted "Annual Impact Report 2025"
  4. Review the revised content
  5. Click "Accept"
  6. Add note: "Revisions adequately address the requested changes. Report accepted."
  7. Log out

**Phase 2 Expected Results:**
  - Revised report is visible with updated content
  - Previous revision notes may be visible for context
  - Report status changes to "Accepted"
  - Full revision cycle is complete

---

### TC-E2E-004: Multi-NGO Application Competition

**Description:** Multiple NGOs apply to the same grant; Donor reviews and compares all applications using the ranking system.

- **Category:** Cross-Role Workflows
- **Priority:** P2 High
- **Preconditions:** Grant 1 has applications from Amani (score 78.5), Salam (score 62.3), and Hope Bridges (draft/incomplete)

- **Steps:**
  1. Log in as sarah@globalhealth.org (Donor for Grant 1)
  2. Navigate to "Review Applications" or "Rankings" for Grant 1
  3. View the ranked list of submitted applications:
     - Amani Community Development - AI Score: 78.5
     - Salam Relief Foundation - AI Score: 62.3
  4. Click on Amani's application to review details
  5. Review proposal content, documents, AI analysis, and reviewer scores
  6. Navigate back to the rankings
  7. Click on Salam's application to review details
  8. Compare the two applications side by side (if feature exists)
  9. Observe that Hope Bridges' draft application does NOT appear in rankings
  10. Log out
- **Test Data:** N/A
- **Expected Results:**
  - Rankings page shows submitted applications ordered by score
  - Amani (78.5) ranks above Salam (62.3)
  - Draft applications (Hope Bridges) are excluded from rankings
  - Donor can view detailed application information for each applicant
  - Comparison features (if available) work correctly

---

### TC-E2E-005: Donor Grant Management - Draft to Publication

**Description:** Donor manages a draft grant through to publication, verifying NGO visibility at each stage.

- **Category:** Cross-Role Workflows
- **Priority:** P2 High
- **Preconditions:** Grant 3 (Climate Resilience in East Africa) is in Draft status under david@eatrust.org

**Phase 1: Verify Draft Grant Not Visible to NGOs**
- **Steps:**
  1. Log in as peter@hopebridges.org (NGO)
  2. Navigate to Browse Grants
  3. Search for "Climate Resilience"
  4. Verify the grant is NOT in search results
  5. Log out

**Phase 1 Expected Results:**
  - Grant 3 does not appear in the NGO's Browse Grants view
  - Search returns no results for "Climate Resilience"

**Phase 2: Donor Publishes Grant**
- **Steps:**
  1. Log in as david@eatrust.org (Donor)
  2. Navigate to the Donor Dashboard or grant management
  3. Find "Climate Resilience in East Africa" (Draft, $1,000,000)
  4. Click on the grant to edit or manage it
  5. Complete any missing fields if needed
  6. Click "Publish" or "Open for Applications"
  7. Verify status changes to "Open"
  8. Log out

**Phase 2 Expected Results:**
  - Grant status changes from "Draft" to "Open"
  - Success confirmation is displayed

**Phase 3: Verify Published Grant Visible to NGOs**
- **Steps:**
  1. Log in as peter@hopebridges.org (NGO)
  2. Navigate to Browse Grants
  3. Search for "Climate Resilience"
  4. Verify the grant now appears in results
  5. Click to view details and verify all information is correct
  6. Log out

**Phase 3 Expected Results:**
  - Grant 3 now appears in Browse Grants for NGOs
  - All grant details (amount: $1M, donor: EA Development Trust) are correct
  - "Apply" button is available

---

### TC-E2E-006: Complete Document and Assessment Verification Pipeline

**Description:** Donor uses Organization Search and Compliance features to verify an NGO's documents and assessment status before awarding a grant.

- **Category:** Cross-Role Workflows
- **Priority:** P2 High
- **Preconditions:** Amani Community Development has completed at least one assessment and uploaded documents

- **Steps:**
  1. Log in as sarah@globalhealth.org (Donor)
  2. Navigate to "Organization Search"
  3. Search for "Amani"
  4. Click on Amani Community Development in results
  5. Review the organization profile: name, country (Kenya), sectors (Health, WASH, Nutrition), capacity score (82)
  6. Navigate to "Compliance & Due Diligence"
  7. Select or search for Amani Community Development
  8. Review:
     - Assessment completion status
     - Document upload status and AI scores
     - Compliance flags or certifications
  9. Navigate to "Review Applications" for Grant 1
  10. View Amani's application (AI score 78.5) alongside the compliance information
  11. Make an informed decision based on combined assessment, document, and application data
  12. Log out
- **Test Data:** N/A
- **Expected Results:**
  - Organization Search returns Amani with correct details
  - Compliance page shows Amani's assessment and document status
  - Donor has a comprehensive view of the NGO's capacity and compliance
  - Information is consistent across Organization Search, Compliance, and Application Review

---

### TC-E2E-007: Multi-Language Workflow

**Description:** User completes a critical workflow while switching languages to verify translations do not break functionality.

- **Category:** Cross-Role Workflows
- **Priority:** P3 Medium
- **Preconditions:** Logged in as ahmed@salamrelief.org

- **Steps:**
  1. Set language to Somali
  2. Navigate to Browse Grants (verify Somali translation of nav item)
  3. Switch language to Arabic
  4. View Grant 1 details (verify Arabic layout, RTL if applicable)
  5. Switch language to French
  6. Navigate to Assessment Hub (verify French translation)
  7. Start the NUPAS framework assessment
  8. Complete Step 1 in French (verify form labels are in French)
  9. Switch language to English mid-wizard at Step 2
  10. Verify checklist items display in English
  11. Complete the assessment in English
  12. Verify submission works regardless of language switches
- **Test Data:** N/A
- **Expected Results:**
  - Language switching works at any point in the workflow
  - No data loss when switching languages mid-wizard
  - UI elements properly translate in each language
  - Functionality is not impaired by language changes
  - Form submissions work correctly regardless of active language

---

## Appendix A: Test Execution Summary Template

| Category                     | Total TCs | P1 | P2 | P3 | Pass | Fail | Blocked | Not Run |
|------------------------------|-----------|----|----|----|----- |------|---------|---------|
| Authentication               | 10        |    |    |    |      |      |         |         |
| NGO Dashboard                | 5         |    |    |    |      |      |         |         |
| Donor Dashboard              | 5         |    |    |    |      |      |         |         |
| Reviewer Dashboard           | 2         |    |    |    |      |      |         |         |
| Assessment Hub & Wizard      | 8         |    |    |    |      |      |         |         |
| Grants (Browse/Detail/Filter)| 10        |    |    |    |      |      |         |         |
| Application Wizard           | 8         |    |    |    |      |      |         |         |
| Grant Creation Wizard        | 7         |    |    |    |      |      |         |         |
| Document Upload & AI         | 5         |    |    |    |      |      |         |         |
| Reports - NGO                | 7         |    |    |    |      |      |         |         |
| Reports - Donor Review       | 5         |    |    |    |      |      |         |         |
| Organization (Profile/Search)| 5         |    |    |    |      |      |         |         |
| AI Chat Assistant            | 4         |    |    |    |      |      |         |         |
| Language & UI                | 10        |    |    |    |      |      |         |         |
| Edge Cases & Error Handling  | 10        |    |    |    |      |      |         |         |
| Cross-Role E2E Workflows     | 7         |    |    |    |      |      |         |         |
| **TOTAL**                    | **108**   |    |    |    |      |      |         |         |

## Appendix B: Priority Distribution

- **P1 Critical:** Tests that validate core functionality; system is unusable if these fail (login, role access, grant lifecycle, application submission, report submission/review)
- **P2 High:** Tests for important features that have workarounds if failing (search, filters, AI scoring, document upload, profile editing)
- **P3 Medium:** Tests for nice-to-have features, edge cases, and polish items (responsive design, language persistence, concurrent editing, very long text)

## Appendix C: Test Environment Setup Checklist

- [ ] Flask application is running and accessible at the base URL
- [ ] Database is seeded with all test users, grants, applications, and reports as described in Section 1
- [ ] Claude API key is configured for AI analysis features
- [ ] All 8 test files are present in the test-files/ directory
- [ ] Browser is configured with developer tools available for inspecting network requests and console errors
- [ ] Screen recording or screenshot tools are available for documenting defects
- [ ] Multiple browser profiles or incognito windows are available for concurrent multi-role testing

## Appendix D: Defect Report Template

| Field              | Description                                              |
|--------------------|----------------------------------------------------------|
| Defect ID          | BUG-[CATEGORY]-[NNN]                                    |
| Test Case ID       | TC-[CATEGORY]-[NNN]                                     |
| Title              | Brief description of the defect                         |
| Severity           | Critical / Major / Minor / Cosmetic                     |
| Steps to Reproduce | Step-by-step instructions to reproduce                   |
| Expected Result    | What should happen                                       |
| Actual Result      | What actually happened                                   |
| Screenshots        | Attach relevant screenshots                              |
| Environment        | Browser, OS, app version                                 |
| Assigned To        | Developer or team responsible                            |
| Status             | New / In Progress / Fixed / Verified / Closed / Reopened |

---

*End of Test Plan Document*
*Total Test Cases: 108*
*Document generated: 2026-02-28*
