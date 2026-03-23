"""
Generate Kuja Grant Management System v3.0 Test Cases Document
Creates a professional Word document with comprehensive test cases.
"""

import os
from datetime import datetime
from docx import Document
from docx.shared import Inches, Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.section import WD_ORIENT
from docx.oxml.ns import qn, nsdecls
from docx.oxml import parse_xml

# ── Helpers ──────────────────────────────────────────────────────────────────

def set_cell_shading(cell, color_hex):
    """Set background color on a table cell."""
    shading = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{color_hex}"/>')
    cell._tc.get_or_add_tcPr().append(shading)

def set_cell_text(cell, text, bold=False, size=9, color=None, alignment=None):
    """Set text in a cell with formatting."""
    cell.text = ""
    p = cell.paragraphs[0]
    if alignment:
        p.alignment = alignment
    run = p.add_run(str(text))
    run.bold = bold
    run.font.size = Pt(size)
    if color:
        run.font.color.rgb = RGBColor(*color)

def add_test_case_table(doc, tc):
    """Add a single test case as a formatted table."""
    table = doc.add_table(rows=0, cols=2)
    table.style = 'Table Grid'
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    # Set column widths
    for row in table.rows:
        row.cells[0].width = Cm(4)
        row.cells[1].width = Cm(14)

    fields = [
        ("Test ID", tc["id"]),
        ("Test Name", tc["name"]),
        ("Category", tc["category"]),
        ("Priority", tc["priority"]),
        ("Requirement", tc.get("requirement", "N/A")),
        ("Prerequisites", tc.get("prereqs", "None")),
        ("Test Steps", tc["steps"]),
        ("Test Data", tc.get("data", "N/A")),
        ("Expected Result", tc["expected"]),
        ("Pass/Fail Criteria", tc.get("criteria", "Test passes if expected result is observed without errors.")),
    ]

    for label, value in fields:
        row = table.add_row()
        # Label cell
        cell0 = row.cells[0]
        set_cell_shading(cell0, "E8EAF6")
        set_cell_text(cell0, label, bold=True, size=9)
        # Value cell
        cell1 = row.cells[1]
        set_cell_text(cell1, value, size=9)

    # Priority color coding in the priority row
    priority_row = table.rows[3]
    p_text = tc["priority"]
    if "P1" in p_text:
        set_cell_shading(priority_row.cells[1], "FFCDD2")
    elif "P2" in p_text:
        set_cell_shading(priority_row.cells[1], "FFF9C4")
    elif "P3" in p_text:
        set_cell_shading(priority_row.cells[1], "C8E6C9")

    doc.add_paragraph("")  # spacer


# ── Define ALL test cases ────────────────────────────────────────────────────

test_cases = []

# ============================================================================
# CATEGORY 1: AUTHENTICATION (TC-001 to TC-015)
# ============================================================================

auth_cases = [
    {
        "id": "TC-001", "name": "Valid NGO Login", "category": "Authentication",
        "priority": "P1 - Critical", "requirement": "FR-AUTH-001",
        "prereqs": "System is running. Seed data loaded. User fatima@amani.org exists.",
        "steps": (
            "1. Open the application URL (https://web-production-6f8a.up.railway.app)\n"
            "2. Verify the login page is displayed with email and password fields\n"
            "3. Enter 'fatima@amani.org' in the Email field\n"
            "4. Enter 'pass123' in the Password field\n"
            "5. Click the 'Sign In' button\n"
            "6. Wait for page to load completely"
        ),
        "data": "Email: fatima@amani.org | Password: pass123",
        "expected": (
            "1. User is redirected to the NGO Dashboard\n"
            "2. Dashboard displays stat cards: Capacity Score (82%), My Applications, Open Grants, Documents\n"
            "3. Sidebar shows NGO-specific menu items (Dashboard, Grants, Applications, Assessments, Reports, Documents)\n"
            "4. Welcome message shows 'Welcome, Fatima' or similar\n"
            "5. Session cookie is set in browser"
        ),
        "criteria": "Pass: NGO dashboard loads with correct stats. Fail: Login error or wrong dashboard displayed."
    },
    {
        "id": "TC-002", "name": "Valid Donor Login", "category": "Authentication",
        "priority": "P1 - Critical", "requirement": "FR-AUTH-001",
        "prereqs": "System is running. Seed data loaded. User sarah@globalhealth.org exists.",
        "steps": (
            "1. Open the application URL\n"
            "2. Enter 'sarah@globalhealth.org' in the Email field\n"
            "3. Enter 'pass123' in the Password field\n"
            "4. Click the 'Sign In' button\n"
            "5. Wait for page to load completely"
        ),
        "data": "Email: sarah@globalhealth.org | Password: pass123",
        "expected": (
            "1. User is redirected to the Donor Dashboard\n"
            "2. Dashboard displays stat cards: Total Grants, Applications, Pending Reviews, Funding Awarded, Reports Due\n"
            "3. Sidebar shows Donor-specific menu items (Dashboard, My Grants, Applications, Organizations, Reports, Compliance)\n"
            "4. Quick action buttons for creating grants, reviewing applications, etc. are visible"
        ),
        "criteria": "Pass: Donor dashboard loads with correct stats and menu. Fail: Login error or wrong role dashboard."
    },
    {
        "id": "TC-003", "name": "Valid Reviewer Login", "category": "Authentication",
        "priority": "P1 - Critical", "requirement": "FR-AUTH-001",
        "prereqs": "System is running. User james@reviewer.org exists.",
        "steps": (
            "1. Open the application URL\n"
            "2. Enter 'james@reviewer.org' in the Email field\n"
            "3. Enter 'pass123' in the Password field\n"
            "4. Click the 'Sign In' button"
        ),
        "data": "Email: james@reviewer.org | Password: pass123",
        "expected": (
            "1. User is redirected to the Reviewer Dashboard\n"
            "2. Dashboard displays stat cards: Assigned, In Progress, Completed, Average Score\n"
            "3. Sidebar shows Reviewer menu items (Dashboard, My Reviews)\n"
            "4. List of assigned applications is visible"
        ),
        "criteria": "Pass: Reviewer dashboard loads correctly. Fail: Login error or wrong dashboard."
    },
    {
        "id": "TC-004", "name": "Valid Admin Login", "category": "Authentication",
        "priority": "P1 - Critical", "requirement": "FR-AUTH-001",
        "prereqs": "System is running. User admin@kuja.org exists.",
        "steps": (
            "1. Open the application URL\n"
            "2. Enter 'admin@kuja.org' in the Email field\n"
            "3. Enter 'pass123' in the Password field\n"
            "4. Click the 'Sign In' button"
        ),
        "data": "Email: admin@kuja.org | Password: pass123",
        "expected": (
            "1. User is redirected to the Admin Dashboard\n"
            "2. Dashboard displays: Users by role breakdown, Organizations by type, Total users count, Flagged compliance items\n"
            "3. Sidebar shows Admin menu items (Dashboard, Users, Organizations, Grants, Compliance, System)"
        ),
        "criteria": "Pass: Admin dashboard loads with system-wide stats. Fail: Login error or restricted dashboard."
    },
    {
        "id": "TC-005", "name": "Invalid Credentials - Wrong Password", "category": "Authentication",
        "priority": "P1 - Critical", "requirement": "FR-AUTH-002",
        "prereqs": "System is running. User fatima@amani.org exists.",
        "steps": (
            "1. Open the application URL\n"
            "2. Enter 'fatima@amani.org' in the Email field\n"
            "3. Enter 'wrongpassword' in the Password field\n"
            "4. Click the 'Sign In' button"
        ),
        "data": "Email: fatima@amani.org | Password: wrongpassword",
        "expected": (
            "1. Login fails\n"
            "2. Error message displayed: 'Invalid email or password'\n"
            "3. User remains on the login page\n"
            "4. Password field is cleared\n"
            "5. No session cookie is set"
        ),
        "criteria": "Pass: Error message shown, no redirect. Fail: User logs in or no error message."
    },
    {
        "id": "TC-006", "name": "Empty Email Field", "category": "Authentication",
        "priority": "P2 - High", "requirement": "FR-AUTH-003",
        "prereqs": "System is running.",
        "steps": (
            "1. Open the application URL\n"
            "2. Leave the Email field empty\n"
            "3. Enter 'pass123' in the Password field\n"
            "4. Click the 'Sign In' button"
        ),
        "data": "Email: (empty) | Password: pass123",
        "expected": (
            "1. Login fails\n"
            "2. Error message displayed: 'Email and password are required'\n"
            "3. User remains on the login page"
        ),
        "criteria": "Pass: Validation error shown. Fail: Request sent without email."
    },
    {
        "id": "TC-007", "name": "Empty Password Field", "category": "Authentication",
        "priority": "P2 - High", "requirement": "FR-AUTH-003",
        "prereqs": "System is running.",
        "steps": (
            "1. Open the application URL\n"
            "2. Enter 'fatima@amani.org' in the Email field\n"
            "3. Leave the Password field empty\n"
            "4. Click the 'Sign In' button"
        ),
        "data": "Email: fatima@amani.org | Password: (empty)",
        "expected": (
            "1. Login fails\n"
            "2. Error message displayed: 'Email and password are required'\n"
            "3. User remains on the login page"
        ),
        "criteria": "Pass: Validation error shown. Fail: Request sent without password."
    },
    {
        "id": "TC-008", "name": "Rate Limiting - 5 Failed Attempts", "category": "Authentication",
        "priority": "P1 - Critical", "requirement": "FR-AUTH-004",
        "prereqs": "System is running. No prior failed attempts for the test email.",
        "steps": (
            "1. Open the application URL\n"
            "2. Enter 'fatima@amani.org' in the Email field\n"
            "3. Enter 'wrong1' in the Password field and click Sign In\n"
            "4. Repeat with passwords 'wrong2', 'wrong3', 'wrong4', 'wrong5'\n"
            "5. On the 6th attempt, enter the correct password 'pass123'\n"
            "6. Click Sign In"
        ),
        "data": "Email: fatima@amani.org | Passwords: wrong1 through wrong5, then pass123",
        "expected": (
            "1. First 4 attempts show 'Invalid email or password'\n"
            "2. After 5th failed attempt, message changes to account lockout with remaining time\n"
            "3. 6th attempt (even with correct password) is rejected with lockout message\n"
            "4. Message includes countdown or remaining lockout duration"
        ),
        "criteria": "Pass: Account locks after 5 failures, correct password rejected during lockout. Fail: No rate limiting or lockout bypassed."
    },
    {
        "id": "TC-009", "name": "Rate Limiting Recovery", "category": "Authentication",
        "priority": "P2 - High", "requirement": "FR-AUTH-004",
        "prereqs": "Account has been locked from TC-008.",
        "steps": (
            "1. Wait for the lockout period to expire (typically 5-15 minutes)\n"
            "2. Enter 'fatima@amani.org' in the Email field\n"
            "3. Enter 'pass123' in the Password field\n"
            "4. Click Sign In"
        ),
        "data": "Email: fatima@amani.org | Password: pass123",
        "expected": (
            "1. Login succeeds after lockout period expires\n"
            "2. User is redirected to NGO Dashboard\n"
            "3. Failed attempt counter is reset"
        ),
        "criteria": "Pass: Login succeeds after cooldown. Fail: Account remains locked indefinitely."
    },
    {
        "id": "TC-010", "name": "Session Persistence - Close and Reopen Tab", "category": "Authentication",
        "priority": "P2 - High", "requirement": "FR-AUTH-005",
        "prereqs": "None.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Verify NGO dashboard is displayed\n"
            "3. Close the browser tab (not the entire browser)\n"
            "4. Open a new tab and navigate to the application URL\n"
            "5. Observe the page"
        ),
        "data": "Email: fatima@amani.org | Password: pass123",
        "expected": (
            "1. After reopening, user is still logged in\n"
            "2. NGO dashboard is displayed without needing to re-login\n"
            "3. Session cookie persists across tabs"
        ),
        "criteria": "Pass: Session persists across tab close/reopen. Fail: User redirected to login."
    },
    {
        "id": "TC-011", "name": "Logout", "category": "Authentication",
        "priority": "P1 - Critical", "requirement": "FR-AUTH-006",
        "prereqs": "User is logged in as fatima@amani.org.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Verify NGO dashboard is displayed\n"
            "3. Click the Logout button (typically in sidebar or user menu)\n"
            "4. Observe the redirect"
        ),
        "data": "Email: fatima@amani.org | Password: pass123",
        "expected": (
            "1. User is redirected to the login page\n"
            "2. Session cookie is cleared\n"
            "3. Navigating back to a protected route shows login page, not cached dashboard"
        ),
        "criteria": "Pass: Session ended, login page shown. Fail: Session persists after logout."
    },
    {
        "id": "TC-012", "name": "Access Protected Route Without Login", "category": "Authentication",
        "priority": "P1 - Critical", "requirement": "FR-AUTH-007",
        "prereqs": "User is NOT logged in (clear cookies/incognito).",
        "steps": (
            "1. Open an incognito/private browser window\n"
            "2. Navigate directly to a protected API endpoint: GET /api/auth/me\n"
            "3. Observe the response"
        ),
        "data": "URL: /api/auth/me (no session cookie)",
        "expected": (
            "1. Response status code is 401 Unauthorized\n"
            "2. Response body contains error message\n"
            "3. No user data is returned"
        ),
        "criteria": "Pass: 401 returned. Fail: User data returned without authentication."
    },
    {
        "id": "TC-013", "name": "Language Preference - Set to French", "category": "Authentication",
        "priority": "P2 - High", "requirement": "FR-AUTH-008",
        "prereqs": "User is logged in.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Locate the language selector (typically in the sidebar or header)\n"
            "3. Click the language selector\n"
            "4. Select 'Francais' from the dropdown\n"
            "5. Wait for the UI to update"
        ),
        "data": "Email: fatima@amani.org | Language: fr (French)",
        "expected": (
            "1. UI text translates to French\n"
            "2. Dashboard labels, menu items, and buttons display in French\n"
            "3. Language preference is saved (persists on page refresh)\n"
            "4. API returns success for PUT /api/auth/language"
        ),
        "criteria": "Pass: UI displays in French. Fail: Text remains in English or errors occur."
    },
    {
        "id": "TC-014", "name": "Language Preference - Set to Arabic (RTL)", "category": "Authentication",
        "priority": "P2 - High", "requirement": "FR-AUTH-008",
        "prereqs": "User is logged in.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Click the language selector\n"
            "3. Select Arabic from the dropdown\n"
            "4. Wait for the UI to update\n"
            "5. Observe the layout direction"
        ),
        "data": "Email: fatima@amani.org | Language: ar (Arabic)",
        "expected": (
            "1. UI text translates to Arabic\n"
            "2. Layout switches to RTL (right-to-left)\n"
            "3. Sidebar moves to the right side\n"
            "4. Text alignment is right-aligned\n"
            "5. Language preference is saved"
        ),
        "criteria": "Pass: Arabic text displayed with RTL layout. Fail: LTR layout or English text."
    },
    {
        "id": "TC-015", "name": "Invalid Language Preference via API", "category": "Authentication",
        "priority": "P3 - Low", "requirement": "FR-AUTH-008",
        "prereqs": "User is logged in.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Using browser DevTools or curl, send:\n"
            "   PUT /api/auth/language\n"
            "   Body: {\"language\": \"xx\"}\n"
            "3. Observe the response"
        ),
        "data": "API: PUT /api/auth/language | Body: {\"language\": \"xx\"}",
        "expected": (
            "1. Response status code is 400 Bad Request\n"
            "2. Error message indicates invalid language code\n"
            "3. Language preference is not changed"
        ),
        "criteria": "Pass: 400 error returned. Fail: Invalid language accepted."
    },
]
test_cases.extend(auth_cases)

# ============================================================================
# CATEGORY 2: DASHBOARD (TC-020 to TC-028)
# ============================================================================

dashboard_cases = [
    {
        "id": "TC-020", "name": "NGO Dashboard - Stats Cards Display", "category": "Dashboard",
        "priority": "P1 - Critical", "requirement": "FR-DASH-001",
        "prereqs": "Logged in as fatima@amani.org. Seed data loaded.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Verify the NGO Dashboard loads\n"
            "3. Observe the stat cards at the top of the dashboard\n"
            "4. Note the values displayed in each card"
        ),
        "data": "Email: fatima@amani.org | Password: pass123",
        "expected": (
            "1. Dashboard displays 4 stat cards:\n"
            "   - Capacity Score: 82%\n"
            "   - My Applications: count of applications\n"
            "   - Open Grants: count of available grants\n"
            "   - Documents: count of uploaded documents\n"
            "2. Each card has an icon, label, and numeric value\n"
            "3. Quick action buttons are visible below stats"
        ),
        "criteria": "Pass: All 4 stat cards display with correct data. Fail: Missing cards or incorrect values."
    },
    {
        "id": "TC-021", "name": "Donor Dashboard - Stats Cards Display", "category": "Dashboard",
        "priority": "P1 - Critical", "requirement": "FR-DASH-002",
        "prereqs": "Logged in as sarah@globalhealth.org. Seed data loaded.",
        "steps": (
            "1. Login as sarah@globalhealth.org / pass123\n"
            "2. Verify the Donor Dashboard loads\n"
            "3. Observe the stat cards\n"
            "4. Note the values in each card"
        ),
        "data": "Email: sarah@globalhealth.org | Password: pass123",
        "expected": (
            "1. Dashboard displays stat cards:\n"
            "   - Total Grants: count of donor's grants\n"
            "   - Applications: count of received applications\n"
            "   - Pending Reviews: applications awaiting review\n"
            "   - Funding Awarded: total amount awarded\n"
            "   - Reports Due: pending report reviews\n"
            "2. Grant status breakdown visible\n"
            "3. Quick actions: Create Grant, Review Applications, etc."
        ),
        "criteria": "Pass: Donor stats display correctly. Fail: Missing or incorrect metrics."
    },
    {
        "id": "TC-022", "name": "Reviewer Dashboard - Stats Cards Display", "category": "Dashboard",
        "priority": "P1 - Critical", "requirement": "FR-DASH-003",
        "prereqs": "Logged in as james@reviewer.org.",
        "steps": (
            "1. Login as james@reviewer.org / pass123\n"
            "2. Verify the Reviewer Dashboard loads\n"
            "3. Observe the stat cards"
        ),
        "data": "Email: james@reviewer.org | Password: pass123",
        "expected": (
            "1. Dashboard displays stat cards:\n"
            "   - Assigned: number of assigned reviews\n"
            "   - In Progress: reviews currently being worked on\n"
            "   - Completed: finished reviews\n"
            "   - Average Score: mean of all review scores\n"
            "2. List of assigned applications visible"
        ),
        "criteria": "Pass: Reviewer stats shown correctly. Fail: Missing cards or no review list."
    },
    {
        "id": "TC-023", "name": "Admin Dashboard - System Stats Display", "category": "Dashboard",
        "priority": "P1 - Critical", "requirement": "FR-DASH-004",
        "prereqs": "Logged in as admin@kuja.org.",
        "steps": (
            "1. Login as admin@kuja.org / pass123\n"
            "2. Verify the Admin Dashboard loads\n"
            "3. Observe system-wide statistics"
        ),
        "data": "Email: admin@kuja.org | Password: pass123",
        "expected": (
            "1. Dashboard displays system stats:\n"
            "   - Users by role (NGO, Donor, Reviewer, Admin counts)\n"
            "   - Organizations by type\n"
            "   - Total users count\n"
            "   - Flagged compliance items\n"
            "2. Admin-specific menu items visible in sidebar"
        ),
        "criteria": "Pass: Admin stats with role breakdown visible. Fail: Missing system stats."
    },
    {
        "id": "TC-024", "name": "NGO Dashboard - Data Accuracy Verification", "category": "Dashboard",
        "priority": "P2 - High", "requirement": "FR-DASH-005",
        "prereqs": "Logged in as fatima@amani.org. Known seed data: 2 submitted applications for Amani.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Note the 'My Applications' count on dashboard\n"
            "3. Navigate to 'Applications' page from sidebar\n"
            "4. Count the actual applications listed\n"
            "5. Return to dashboard and compare"
        ),
        "data": "Email: fatima@amani.org | Password: pass123",
        "expected": (
            "1. Dashboard 'My Applications' count matches actual number of applications in the list\n"
            "2. 'Open Grants' count matches the number of grants with 'open' status\n"
            "3. 'Documents' count matches uploaded documents count\n"
            "4. Capacity Score matches the assessment score from the profile"
        ),
        "criteria": "Pass: All dashboard numbers match actual data. Fail: Any count mismatch."
    },
    {
        "id": "TC-025", "name": "NGO Dashboard - Quick Actions Navigation", "category": "Dashboard",
        "priority": "P2 - High", "requirement": "FR-DASH-006",
        "prereqs": "Logged in as fatima@amani.org.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. On the dashboard, locate the quick action buttons\n"
            "3. Click 'Browse Grants' quick action\n"
            "4. Verify navigation to Grants page\n"
            "5. Return to dashboard\n"
            "6. Click 'My Applications' quick action\n"
            "7. Verify navigation to Applications page\n"
            "8. Repeat for each available quick action"
        ),
        "data": "Email: fatima@amani.org | Password: pass123",
        "expected": (
            "1. Each quick action button navigates to the correct page\n"
            "2. Back navigation returns to dashboard\n"
            "3. No broken links or error pages"
        ),
        "criteria": "Pass: All quick actions navigate correctly. Fail: Broken link or wrong page."
    },
    {
        "id": "TC-026", "name": "Donor Dashboard - Quick Actions Navigation", "category": "Dashboard",
        "priority": "P2 - High", "requirement": "FR-DASH-006",
        "prereqs": "Logged in as sarah@globalhealth.org.",
        "steps": (
            "1. Login as sarah@globalhealth.org / pass123\n"
            "2. On the donor dashboard, locate quick actions\n"
            "3. Click 'Create Grant' quick action\n"
            "4. Verify grant creation wizard opens\n"
            "5. Return to dashboard\n"
            "6. Click 'Review Applications' quick action\n"
            "7. Verify applications list opens"
        ),
        "data": "Email: sarah@globalhealth.org | Password: pass123",
        "expected": (
            "1. 'Create Grant' opens the grant creation wizard\n"
            "2. 'Review Applications' shows applications for donor's grants\n"
            "3. Each quick action navigates to the correct page"
        ),
        "criteria": "Pass: All donor quick actions work correctly. Fail: Navigation errors."
    },
    {
        "id": "TC-027", "name": "Dashboard Responsive Layout", "category": "Dashboard",
        "priority": "P3 - Low", "requirement": "FR-DASH-007",
        "prereqs": "Logged in as any user.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. View dashboard at full desktop width (1920px)\n"
            "3. Resize browser to tablet width (~768px)\n"
            "4. Resize to mobile width (~375px)\n"
            "5. Observe stat cards and layout at each breakpoint"
        ),
        "data": "Email: fatima@amani.org | Password: pass123",
        "expected": (
            "1. Desktop: stat cards in a horizontal row, sidebar visible\n"
            "2. Tablet: stat cards may wrap to 2 columns, sidebar may collapse\n"
            "3. Mobile: stat cards stack vertically, sidebar is hamburger menu\n"
            "4. No horizontal scrollbar at any width\n"
            "5. All text remains readable"
        ),
        "criteria": "Pass: Layout adapts correctly at all breakpoints. Fail: Overflow or unreadable content."
    },
    {
        "id": "TC-028", "name": "Dashboard Auto-Refresh on Navigation", "category": "Dashboard",
        "priority": "P3 - Low", "requirement": "FR-DASH-008",
        "prereqs": "Logged in as fatima@amani.org.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Note dashboard stats\n"
            "3. Navigate to another section (e.g., Grants)\n"
            "4. Navigate back to Dashboard\n"
            "5. Verify stats are refreshed (not stale cached data)"
        ),
        "data": "Email: fatima@amani.org | Password: pass123",
        "expected": (
            "1. Dashboard stats refresh when returning to dashboard page\n"
            "2. API call is made to fetch fresh data\n"
            "3. Stats reflect any changes made during the session"
        ),
        "criteria": "Pass: Dashboard data refreshes on navigation. Fail: Stale data displayed."
    },
]
test_cases.extend(dashboard_cases)

# ============================================================================
# CATEGORY 3: GRANTS (TC-030 to TC-050)
# ============================================================================

grant_cases = [
    {
        "id": "TC-030", "name": "Browse Open Grants (NGO)", "category": "Grants",
        "priority": "P1 - Critical", "requirement": "FR-GRNT-001",
        "prereqs": "Logged in as NGO user. Open grants exist in system.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Click 'Grants' in the sidebar menu\n"
            "3. Observe the grants list page"
        ),
        "data": "Email: fatima@amani.org | Password: pass123",
        "expected": (
            "1. Grants page displays list of open grants\n"
            "2. Each grant card shows: Title, Funding Amount, Deadline, Sectors, Countries\n"
            "3. At least 3 open grants visible (Community Health Workers, Education Technology, Women's Protection)\n"
            "4. Draft grants (Climate Resilience) are NOT visible to NGOs\n"
            "5. 'Apply' button visible on eligible grants"
        ),
        "criteria": "Pass: Open grants listed with correct details, drafts hidden. Fail: Missing grants or drafts shown."
    },
    {
        "id": "TC-031", "name": "Grant Search Filter", "category": "Grants",
        "priority": "P2 - High", "requirement": "FR-GRNT-002",
        "prereqs": "Logged in as NGO user. Multiple grants exist.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Navigate to Grants page\n"
            "3. Locate the search/filter input\n"
            "4. Type 'Health' in the search box\n"
            "5. Observe the filtered results\n"
            "6. Clear search and type 'Education'\n"
            "7. Observe filtered results"
        ),
        "data": "Search terms: 'Health', 'Education'",
        "expected": (
            "1. Searching 'Health' shows: 'Community Health Workers Scale-Up Program'\n"
            "2. 'Education Technology' grant is filtered out when searching 'Health'\n"
            "3. Searching 'Education' shows: 'Education Technology for Rural Schools'\n"
            "4. Filter is case-insensitive\n"
            "5. Results update in real-time as user types"
        ),
        "criteria": "Pass: Search filters grants correctly. Fail: Wrong results or no filtering."
    },
    {
        "id": "TC-032", "name": "Grant Detail View", "category": "Grants",
        "priority": "P1 - Critical", "requirement": "FR-GRNT-003",
        "prereqs": "Logged in as NGO user. 'Community Health Workers' grant exists.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Navigate to Grants page\n"
            "3. Click on 'Community Health Workers Scale-Up Program'\n"
            "4. Review all sections on the detail page"
        ),
        "data": "Email: fatima@amani.org | Grant: Community Health Workers Scale-Up Program",
        "expected": (
            "1. Grant detail page displays:\n"
            "   - Title: Community Health Workers Scale-Up Program\n"
            "   - Funding: $500,000\n"
            "   - Donor: Global Health Fund\n"
            "   - Countries: Kenya, Somalia, Uganda\n"
            "   - Status: Open\n"
            "2. Eligibility section with requirements\n"
            "3. Evaluation criteria section with weights\n"
            "4. Required documents list\n"
            "5. Apply button visible at the bottom"
        ),
        "criteria": "Pass: All grant details shown correctly. Fail: Missing sections or wrong data."
    },
    {
        "id": "TC-033", "name": "Create Grant - Step 1 Basic Info (Donor)", "category": "Grants",
        "priority": "P1 - Critical", "requirement": "FR-GRNT-004",
        "prereqs": "Logged in as sarah@globalhealth.org (Donor).",
        "steps": (
            "1. Login as sarah@globalhealth.org / pass123\n"
            "2. Click 'Create Grant' button on dashboard or sidebar\n"
            "3. In Step 1 (Basic Information), fill in:\n"
            "   - Title: 'Water Security in Horn of Africa'\n"
            "   - Description: 'Program to improve water access in drought-affected regions'\n"
            "   - Funding Amount: 750000\n"
            "   - Application Deadline: 2026-06-30\n"
            "   - Sectors: WASH, Climate\n"
            "   - Countries: Kenya, Somalia, Ethiopia\n"
            "4. Click 'Next' to proceed to Step 2"
        ),
        "data": "Title: Water Security in Horn of Africa | Amount: $750,000 | Deadline: 2026-06-30",
        "expected": (
            "1. Grant creation wizard opens at Step 1\n"
            "2. All fields accept input correctly\n"
            "3. Multi-select works for sectors and countries\n"
            "4. Clicking Next advances to Step 2\n"
            "5. Data is preserved (going back shows entered data)"
        ),
        "criteria": "Pass: Step 1 data captured, advances to Step 2. Fail: Validation errors or data loss."
    },
    {
        "id": "TC-034", "name": "Create Grant - Step 2 Eligibility", "category": "Grants",
        "priority": "P1 - Critical", "requirement": "FR-GRNT-005",
        "prereqs": "Continuing from TC-033, on Step 2 of grant creation.",
        "steps": (
            "1. In Step 2 (Eligibility Requirements), add requirements:\n"
            "   - 'Registered NGO in target country' (Required: Yes)\n"
            "   - 'Minimum 3 years WASH experience' (Required: Yes)\n"
            "   - 'Annual budget exceeds $100,000' (Required: No)\n"
            "2. Click 'Add Requirement' for each\n"
            "3. Review the list of added requirements\n"
            "4. Click Next to proceed to Step 3"
        ),
        "data": "3 eligibility requirements with varying required status",
        "expected": (
            "1. Requirements are added to the list\n"
            "2. Each shows text and required/optional status\n"
            "3. Requirements can be reordered or deleted\n"
            "4. Clicking Next advances to Step 3"
        ),
        "criteria": "Pass: Requirements saved and visible. Fail: Requirements lost or validation error."
    },
    {
        "id": "TC-035", "name": "Create Grant - Step 3 Evaluation Criteria", "category": "Grants",
        "priority": "P1 - Critical", "requirement": "FR-GRNT-006",
        "prereqs": "Continuing from TC-034, on Step 3.",
        "steps": (
            "1. In Step 3 (Evaluation Criteria), add criteria:\n"
            "   - 'Technical Approach' - Weight: 30%\n"
            "   - 'Organizational Capacity' - Weight: 25%\n"
            "   - 'Budget Reasonableness' - Weight: 25%\n"
            "   - 'Impact & Sustainability' - Weight: 20%\n"
            "2. Verify total weight displays 100%\n"
            "3. Click Next to proceed"
        ),
        "data": "4 criteria: Technical (30%), Capacity (25%), Budget (25%), Impact (20%)",
        "expected": (
            "1. Criteria added with weights\n"
            "2. Running total shows 100%\n"
            "3. System accepts the configuration\n"
            "4. Advances to Step 4"
        ),
        "criteria": "Pass: Criteria with 100% total weight accepted. Fail: Weight calculation error."
    },
    {
        "id": "TC-036", "name": "Create Grant - Invalid Criteria Weight Total", "category": "Grants",
        "priority": "P2 - High", "requirement": "FR-GRNT-006",
        "prereqs": "On Step 3 of grant creation.",
        "steps": (
            "1. Add criteria with weights that do NOT sum to 100%:\n"
            "   - 'Technical Approach' - Weight: 40%\n"
            "   - 'Capacity' - Weight: 30%\n"
            "   (Total: 70%, not 100%)\n"
            "2. Try to click Next"
        ),
        "data": "2 criteria: Technical (40%), Capacity (30%) = 70% total",
        "expected": (
            "1. Validation error displayed: weights must sum to 100%\n"
            "2. Cannot proceed to next step\n"
            "3. Total weight indicator shows 70% with warning"
        ),
        "criteria": "Pass: Validation prevents proceeding. Fail: Allows advancement with non-100% weights."
    },
    {
        "id": "TC-037", "name": "Create Grant - Step 4 Documents", "category": "Grants",
        "priority": "P1 - Critical", "requirement": "FR-GRNT-007",
        "prereqs": "Continuing from TC-035, on Step 4.",
        "steps": (
            "1. In Step 4 (Required Documents), select document types:\n"
            "   - Financial Report (Required)\n"
            "   - Registration Certificate (Required)\n"
            "   - Audit Report (Required)\n"
            "   - PSEA Policy (Required)\n"
            "   - Strategic Plan (Optional)\n"
            "2. For each, set AI evaluation criteria if available\n"
            "3. Click Next to proceed"
        ),
        "data": "5 document types with required/optional flags",
        "expected": (
            "1. Document types selected and displayed\n"
            "2. Required/optional flags set correctly\n"
            "3. AI evaluation criteria can be configured per document type\n"
            "4. Advances to Step 5"
        ),
        "criteria": "Pass: Document requirements configured. Fail: Configuration lost or error."
    },
    {
        "id": "TC-038", "name": "Create Grant - Step 5 Reporting Requirements", "category": "Grants",
        "priority": "P1 - Critical", "requirement": "FR-GRNT-008",
        "prereqs": "Continuing from TC-037, on Step 5.",
        "steps": (
            "1. In Step 5 (Reporting), configure:\n"
            "   - Reporting Frequency: Quarterly\n"
            "   - Report Types: Financial, Narrative\n"
            "   - Add specific requirements for each report type\n"
            "2. Click Next to proceed to Review"
        ),
        "data": "Quarterly reporting with Financial and Narrative types",
        "expected": (
            "1. Reporting configuration saved\n"
            "2. Report template sections displayed\n"
            "3. Advances to final Review step"
        ),
        "criteria": "Pass: Reporting requirements configured. Fail: Configuration not saved."
    },
    {
        "id": "TC-039", "name": "Create Grant - Step 6 Review and Publish", "category": "Grants",
        "priority": "P1 - Critical", "requirement": "FR-GRNT-009",
        "prereqs": "Continuing from TC-038, on final Review step.",
        "steps": (
            "1. In Step 6 (Review), verify all entered information:\n"
            "   - Basic info, eligibility, criteria, documents, reporting\n"
            "2. Click 'Publish Grant'\n"
            "3. Wait for confirmation"
        ),
        "data": "All data from TC-033 through TC-038",
        "expected": (
            "1. Review page shows summary of all configuration\n"
            "2. After publishing, grant status = 'open'\n"
            "3. Success message displayed\n"
            "4. Grant appears in the grants list for NGOs\n"
            "5. Redirected to grant detail page or grants list"
        ),
        "criteria": "Pass: Grant published and visible to NGOs. Fail: Grant not created or not visible."
    },
    {
        "id": "TC-040", "name": "Create Grant as NGO (Unauthorized)", "category": "Grants",
        "priority": "P1 - Critical", "requirement": "FR-GRNT-010",
        "prereqs": "Logged in as NGO user.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Using browser DevTools or curl, send:\n"
            "   POST /api/grants/\n"
            "   Body: {\"title\": \"Test Grant\", \"description\": \"Test\", \"amount\": 100000}\n"
            "3. Observe the response"
        ),
        "data": "Email: fatima@amani.org | API: POST /api/grants/",
        "expected": (
            "1. Response status code is 403 Forbidden\n"
            "2. Error message: 'Donor role required' or similar\n"
            "3. No grant is created in the system"
        ),
        "criteria": "Pass: 403 returned, no grant created. Fail: Grant created by NGO user."
    },
    {
        "id": "TC-041", "name": "Grant Agreement Upload with AI Extraction", "category": "Grants",
        "priority": "P1 - Critical", "requirement": "FR-GRNT-011",
        "prereqs": "Logged in as donor, in grant creation wizard.",
        "steps": (
            "1. Login as sarah@globalhealth.org / pass123\n"
            "2. Start creating a new grant\n"
            "3. In the grant agreement section, click 'Upload Grant Agreement'\n"
            "4. Select the file 'grant_agreement_sample.txt' from test-files/\n"
            "5. Wait for AI analysis to complete\n"
            "6. Review extracted requirements"
        ),
        "data": "File: test-files/grant_agreement_sample.txt",
        "expected": (
            "1. File uploads successfully\n"
            "2. Loading indicator shown during AI analysis\n"
            "3. AI extracts reporting requirements:\n"
            "   - Report types (financial, narrative, impact)\n"
            "   - Frequencies (quarterly, annual)\n"
            "   - Specific deadlines or due dates\n"
            "4. Extracted requirements displayed for donor review\n"
            "5. Donor can modify or add to extracted requirements"
        ),
        "criteria": "Pass: AI extracts meaningful requirements from agreement. Fail: Extraction fails or returns empty."
    },
    {
        "id": "TC-042", "name": "Edit Existing Grant (Owner)", "category": "Grants",
        "priority": "P2 - High", "requirement": "FR-GRNT-012",
        "prereqs": "Logged in as sarah@globalhealth.org. Grant exists that she owns.",
        "steps": (
            "1. Login as sarah@globalhealth.org / pass123\n"
            "2. Navigate to My Grants\n"
            "3. Click on an existing grant\n"
            "4. Click Edit\n"
            "5. Change the title to 'Updated Grant Title'\n"
            "6. Save changes"
        ),
        "data": "Email: sarah@globalhealth.org | Modified field: title",
        "expected": (
            "1. Edit interface opens with current grant data\n"
            "2. Title field is editable\n"
            "3. After save, success message shown\n"
            "4. Grant detail shows updated title"
        ),
        "criteria": "Pass: Grant updated successfully. Fail: Edit fails or data not saved."
    },
    {
        "id": "TC-043", "name": "Edit Grant (Non-Owner Donor)", "category": "Grants",
        "priority": "P2 - High", "requirement": "FR-GRNT-013",
        "prereqs": "david@eatrust.org logged in. Grant owned by sarah exists.",
        "steps": (
            "1. Login as david@eatrust.org / pass123\n"
            "2. Using DevTools or curl, attempt:\n"
            "   PUT /api/grants/1 (owned by Global Health Fund)\n"
            "   Body: {\"title\": \"Hacked Grant\"}\n"
            "3. Observe the response"
        ),
        "data": "Email: david@eatrust.org | API: PUT /api/grants/1",
        "expected": (
            "1. Response status code is 403 Forbidden\n"
            "2. Grant title is NOT changed\n"
            "3. Only the grant owner can edit"
        ),
        "criteria": "Pass: 403 returned, no modification. Fail: Grant modified by non-owner."
    },
    {
        "id": "TC-044", "name": "Grant Sector Filter", "category": "Grants",
        "priority": "P2 - High", "requirement": "FR-GRNT-002",
        "prereqs": "Logged in as NGO user.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Navigate to Grants page\n"
            "3. Use sector filter to select 'Health'\n"
            "4. Observe filtered results\n"
            "5. Change filter to 'Education'\n"
            "6. Observe updated results"
        ),
        "data": "Sector filters: Health, Education",
        "expected": (
            "1. 'Health' filter shows Community Health Workers grant\n"
            "2. 'Education' filter shows Education Technology grant\n"
            "3. Filters can be combined or cleared"
        ),
        "criteria": "Pass: Sector filter works correctly. Fail: Wrong grants shown."
    },
    {
        "id": "TC-045", "name": "Grant Country Filter", "category": "Grants",
        "priority": "P2 - High", "requirement": "FR-GRNT-002",
        "prereqs": "Logged in as NGO user.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Navigate to Grants page\n"
            "3. Use country filter to select 'Kenya'\n"
            "4. Observe filtered results\n"
            "5. Change filter to 'Nigeria'\n"
            "6. Observe updated results"
        ),
        "data": "Country filters: Kenya, Nigeria",
        "expected": (
            "1. 'Kenya' filter shows grants targeting Kenya (Community Health Workers, Education Technology)\n"
            "2. 'Nigeria' filter shows Women's Protection grant\n"
            "3. Filter updates dynamically"
        ),
        "criteria": "Pass: Country filter works correctly. Fail: Wrong grants shown."
    },
]
test_cases.extend(grant_cases)

# ============================================================================
# CATEGORY 4: APPLICATIONS (TC-060 to TC-085)
# ============================================================================

application_cases = [
    {
        "id": "TC-060", "name": "Start New Application", "category": "Applications",
        "priority": "P1 - Critical", "requirement": "FR-APPL-001",
        "prereqs": "Logged in as fatima@amani.org. 'Education Technology' grant is open and Amani has not applied.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Navigate to Grants page\n"
            "3. Find 'Education Technology for Rural Schools'\n"
            "4. Click 'Apply' button\n"
            "5. Observe the application wizard"
        ),
        "data": "Email: fatima@amani.org | Grant: Education Technology for Rural Schools",
        "expected": (
            "1. Application wizard opens at Step 1 (Eligibility)\n"
            "2. Grant name displayed in wizard header\n"
            "3. Eligibility checklist items shown\n"
            "4. Step progress indicator shows Step 1 of 4"
        ),
        "criteria": "Pass: Application wizard opens at Step 1. Fail: Error or wrong page."
    },
    {
        "id": "TC-061", "name": "Eligibility Check - All Requirements Met", "category": "Applications",
        "priority": "P1 - Critical", "requirement": "FR-APPL-002",
        "prereqs": "In Step 1 of application wizard from TC-060.",
        "steps": (
            "1. Check all eligibility requirement checkboxes\n"
            "2. Observe the status indicators\n"
            "3. Click 'Next' to proceed to Step 2"
        ),
        "data": "All eligibility items checked",
        "expected": (
            "1. All items show green checkmarks\n"
            "2. 'Next' button becomes enabled\n"
            "3. Proceeds to Step 2 (Proposal Responses)"
        ),
        "criteria": "Pass: All items checked, advances to Step 2. Fail: Cannot proceed."
    },
    {
        "id": "TC-062", "name": "Eligibility Check - Required Item Unchecked", "category": "Applications",
        "priority": "P2 - High", "requirement": "FR-APPL-002",
        "prereqs": "In Step 1 of application wizard.",
        "steps": (
            "1. Check most eligibility items but leave one REQUIRED item unchecked\n"
            "2. Try to click 'Next'"
        ),
        "data": "One required eligibility item left unchecked",
        "expected": (
            "1. Warning message displayed about unmet requirement\n"
            "2. Cannot proceed to Step 2\n"
            "3. The unchecked required item is highlighted"
        ),
        "criteria": "Pass: Warning shown, cannot proceed. Fail: Proceeds with unmet requirements."
    },
    {
        "id": "TC-063", "name": "Proposal Response with AI Guidance", "category": "Applications",
        "priority": "P1 - Critical", "requirement": "FR-APPL-003",
        "prereqs": "In Step 2 of application wizard.",
        "steps": (
            "1. In Step 2 (Proposal), find the first criterion text area\n"
            "2. Click the 'AI Guidance' button next to it\n"
            "3. Wait for AI to generate guidance\n"
            "4. Read the guidance provided\n"
            "5. Write a response in the text area based on the guidance"
        ),
        "data": "Criterion: first evaluation criterion for the grant",
        "expected": (
            "1. AI Guidance button triggers API call\n"
            "2. Loading indicator shown while AI processes\n"
            "3. AI returns relevant writing suggestions\n"
            "4. Suggestions appear in a panel/tooltip near the text area\n"
            "5. Suggestions are in the user's selected language"
        ),
        "criteria": "Pass: AI guidance generated and relevant. Fail: No guidance or irrelevant suggestions."
    },
    {
        "id": "TC-064", "name": "Proposal Response Word Count", "category": "Applications",
        "priority": "P2 - High", "requirement": "FR-APPL-004",
        "prereqs": "In Step 2 of application wizard.",
        "steps": (
            "1. In a criterion response text area, type a very long response\n"
            "2. Continue typing past any word count limit\n"
            "3. Observe the word count indicator"
        ),
        "data": "Long text exceeding typical 500-word limit",
        "expected": (
            "1. Word count indicator shows current/max words\n"
            "2. When exceeding limit, indicator turns red/warning\n"
            "3. Warning message about exceeding word limit"
        ),
        "criteria": "Pass: Word count tracking works with warning. Fail: No word count or no warning."
    },
    {
        "id": "TC-065", "name": "Document Upload - Valid PDF", "category": "Applications",
        "priority": "P1 - Critical", "requirement": "FR-APPL-005",
        "prereqs": "In Step 3 of application wizard. test-files-v3/valid_financial_report.pdf available.",
        "steps": (
            "1. In Step 3 (Documents), find 'Financial Report' upload area\n"
            "2. Click 'Upload' or drag the file valid_financial_report.pdf\n"
            "3. Wait for upload and AI analysis to complete\n"
            "4. Review the AI analysis results"
        ),
        "data": "File: test-files-v3/valid_financial_report.pdf",
        "expected": (
            "1. File uploads successfully (progress bar shown)\n"
            "2. AI analysis runs automatically after upload\n"
            "3. AI score displayed (expected: 70-90)\n"
            "4. Analysis findings listed\n"
            "5. Document appears in the uploaded documents list with green status"
        ),
        "criteria": "Pass: File uploaded, AI score shown. Fail: Upload fails or no AI analysis."
    },
    {
        "id": "TC-066", "name": "Document Upload - Invalid File Type (EXE)", "category": "Applications",
        "priority": "P1 - Critical", "requirement": "FR-APPL-006",
        "prereqs": "In Step 3 of application wizard.",
        "steps": (
            "1. In Step 3, attempt to upload 'malicious_script.html'\n"
            "2. Observe the system response"
        ),
        "data": "File: test-files-v3/malicious_script.html",
        "expected": (
            "1. File is rejected before upload\n"
            "2. Error message: 'File type not allowed' or similar\n"
            "3. No file is stored on the server\n"
            "4. Only PDF, DOC, DOCX, XLS, XLSX, TXT, CSV formats accepted"
        ),
        "criteria": "Pass: File rejected with error. Fail: File accepted."
    },
    {
        "id": "TC-067", "name": "Document Upload - Oversized File", "category": "Applications",
        "priority": "P2 - High", "requirement": "FR-APPL-006",
        "prereqs": "In Step 3 of application wizard. A file >16MB available.",
        "steps": (
            "1. Create or use a PDF file larger than 16MB\n"
            "2. Attempt to upload it in Step 3\n"
            "3. Observe the system response"
        ),
        "data": "File: large file > 16MB (or 10MB per system config)",
        "expected": (
            "1. File is rejected with size error\n"
            "2. Error message: 'File too large. Max 10 MB' or 'Max 16 MB'\n"
            "3. No file is stored"
        ),
        "criteria": "Pass: File rejected with size error. Fail: Large file accepted."
    },
    {
        "id": "TC-068", "name": "Document Upload - Empty/Corrupt PDF", "category": "Applications",
        "priority": "P2 - High", "requirement": "FR-APPL-007",
        "prereqs": "In Step 3 of application wizard.",
        "steps": (
            "1. Upload the file 'invalid_empty.pdf' (minimal PDF structure, no content)\n"
            "2. Wait for upload and AI analysis\n"
            "3. Review the analysis results"
        ),
        "data": "File: test-files-v3/invalid_empty.pdf",
        "expected": (
            "1. File uploads (valid PDF structure)\n"
            "2. AI analysis returns very low score (5-15)\n"
            "3. Analysis notes: 'Document appears empty' or 'No meaningful content'\n"
            "4. Warning indicator shown"
        ),
        "criteria": "Pass: Low AI score with appropriate warning. Fail: High score for empty document."
    },
    {
        "id": "TC-069", "name": "Application Review Step - Summary", "category": "Applications",
        "priority": "P1 - Critical", "requirement": "FR-APPL-008",
        "prereqs": "Steps 1-3 completed in application wizard.",
        "steps": (
            "1. Navigate to Step 4 (Review & Submit)\n"
            "2. Review the summary of all entered information\n"
            "3. Check completion indicators for each section"
        ),
        "data": "All previous steps completed",
        "expected": (
            "1. Summary shows:\n"
            "   - Eligibility: all items checked\n"
            "   - Proposal: responses for each criterion with word counts\n"
            "   - Documents: uploaded files with AI scores\n"
            "2. Completion indicators show green for completed sections\n"
            "3. 'Submit Application' button is visible"
        ),
        "criteria": "Pass: Complete summary displayed. Fail: Missing sections or wrong data."
    },
    {
        "id": "TC-070", "name": "Submit Application", "category": "Applications",
        "priority": "P1 - Critical", "requirement": "FR-APPL-009",
        "prereqs": "In Step 4 of application wizard, all sections complete.",
        "steps": (
            "1. On the Review step, verify all sections are complete\n"
            "2. Click 'Submit Application'\n"
            "3. Wait for processing\n"
            "4. Observe the confirmation"
        ),
        "data": "Complete application ready for submission",
        "expected": (
            "1. Application submitted successfully\n"
            "2. Status changes from 'draft' to 'submitted'\n"
            "3. AI calculates overall application score\n"
            "4. Confirmation message displayed with score\n"
            "5. Application appears in 'My Applications' list with 'Submitted' status\n"
            "6. Timestamp recorded for submission"
        ),
        "criteria": "Pass: Status = submitted, score calculated. Fail: Error on submission."
    },
    {
        "id": "TC-071", "name": "Duplicate Application Prevention", "category": "Applications",
        "priority": "P1 - Critical", "requirement": "FR-APPL-010",
        "prereqs": "fatima@amani.org has already submitted application for 'Community Health Workers'.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Navigate to Grants page\n"
            "3. Find 'Community Health Workers Scale-Up Program'\n"
            "4. Try to click 'Apply' again\n"
            "5. Alternatively, via API: POST /api/applications/ with grant_id=1"
        ),
        "data": "Email: fatima@amani.org | Grant: Community Health Workers (already applied)",
        "expected": (
            "1. Apply button is disabled or hidden (already applied)\n"
            "2. If API call made: 409 Conflict\n"
            "3. Message: 'Already applied to this grant' or 'Application exists'\n"
            "4. No duplicate application created"
        ),
        "criteria": "Pass: Duplicate prevented (409 or disabled button). Fail: Duplicate application created."
    },
    {
        "id": "TC-072", "name": "View Application Detail", "category": "Applications",
        "priority": "P1 - Critical", "requirement": "FR-APPL-011",
        "prereqs": "fatima@amani.org has submitted application for Community Health Workers.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Navigate to 'My Applications' from sidebar\n"
            "3. Click on the 'Community Health Workers' application\n"
            "4. Review all detail sections"
        ),
        "data": "Email: fatima@amani.org | Application: Community Health Workers",
        "expected": (
            "1. Application detail page shows:\n"
            "   - Grant name and donor\n"
            "   - Status: Submitted\n"
            "   - AI Score: 78.5\n"
            "   - Eligibility responses\n"
            "   - Proposal responses for each criterion\n"
            "   - Uploaded documents with AI scores\n"
            "   - Status timeline with timestamps"
        ),
        "criteria": "Pass: Full application details visible. Fail: Missing data or wrong application."
    },
    {
        "id": "TC-073", "name": "Draft Application - Save and Return", "category": "Applications",
        "priority": "P2 - High", "requirement": "FR-APPL-012",
        "prereqs": "Logged in as NGO user. An open grant exists that user has not applied to.",
        "steps": (
            "1. Login as peter@hopebridges.org / pass123\n"
            "2. Start a new application for an open grant\n"
            "3. Complete Step 1 (Eligibility)\n"
            "4. Start Step 2, write partial responses\n"
            "5. Click 'Save as Draft' or navigate away\n"
            "6. Logout\n"
            "7. Login again as peter@hopebridges.org\n"
            "8. Go to My Applications\n"
            "9. Click on the draft application\n"
            "10. Verify data is preserved"
        ),
        "data": "Email: peter@hopebridges.org | Password: pass123",
        "expected": (
            "1. Application saved as draft\n"
            "2. After re-login, draft appears in 'My Applications' with 'Draft' status\n"
            "3. Opening the draft restores all entered data:\n"
            "   - Eligibility checkboxes still checked\n"
            "   - Partial proposal responses preserved\n"
            "4. Can continue editing from where left off"
        ),
        "criteria": "Pass: Draft preserved with all data. Fail: Data lost on re-login."
    },
    {
        "id": "TC-074", "name": "Application Status Transition - Under Review", "category": "Applications",
        "priority": "P1 - Critical", "requirement": "FR-APPL-013",
        "prereqs": "Logged in as sarah@globalhealth.org. Submitted application exists for her grant.",
        "steps": (
            "1. Login as sarah@globalhealth.org / pass123\n"
            "2. Navigate to Applications for 'Community Health Workers'\n"
            "3. Find Amani's submitted application\n"
            "4. Change status to 'Under Review'\n"
            "5. Observe the status update"
        ),
        "data": "Email: sarah@globalhealth.org | Application: Amani's submitted application",
        "expected": (
            "1. Status changes from 'submitted' to 'under_review'\n"
            "2. Timestamp recorded for the transition\n"
            "3. Status history updated\n"
            "4. NGO can see updated status when they view the application"
        ),
        "criteria": "Pass: Status updated with timestamp. Fail: Status unchanged or error."
    },
    {
        "id": "TC-075", "name": "Assign Reviewer to Application", "category": "Applications",
        "priority": "P1 - Critical", "requirement": "FR-APPL-014",
        "prereqs": "Logged in as sarah@globalhealth.org. Application is under review.",
        "steps": (
            "1. Login as sarah@globalhealth.org / pass123\n"
            "2. Open the application detail page\n"
            "3. Click 'Assign Reviewer' button\n"
            "4. Select 'james@reviewer.org' from the reviewer list\n"
            "5. Confirm assignment"
        ),
        "data": "Reviewer: james@reviewer.org | Application: Amani's application",
        "expected": (
            "1. Review assignment created\n"
            "2. Review status = 'assigned'\n"
            "3. James sees the application in his reviewer dashboard\n"
            "4. Assignment confirmation shown to donor"
        ),
        "criteria": "Pass: Reviewer assigned successfully. Fail: Assignment fails."
    },
    {
        "id": "TC-076", "name": "View Application as Reviewer", "category": "Applications",
        "priority": "P1 - Critical", "requirement": "FR-APPL-015",
        "prereqs": "james@reviewer.org assigned to review Amani's application.",
        "steps": (
            "1. Login as james@reviewer.org / pass123\n"
            "2. View the reviewer dashboard\n"
            "3. Find the assigned application\n"
            "4. Click to open it\n"
            "5. Review all sections"
        ),
        "data": "Email: james@reviewer.org | Password: pass123",
        "expected": (
            "1. Assigned application visible in reviewer dashboard\n"
            "2. Full application visible:\n"
            "   - Proposal responses\n"
            "   - Uploaded documents\n"
            "   - AI scores\n"
            "3. Scoring interface visible for each criterion\n"
            "4. Score input fields (0-100) and comment areas"
        ),
        "criteria": "Pass: Full app visible with scoring interface. Fail: Missing data or no scoring."
    },
    {
        "id": "TC-077", "name": "Score Application - Manual Scoring", "category": "Applications",
        "priority": "P1 - Critical", "requirement": "FR-APPL-016",
        "prereqs": "Logged in as james@reviewer.org. Assigned application open.",
        "steps": (
            "1. For each evaluation criterion, enter a score (0-100):\n"
            "   - Technical Approach: 85\n"
            "   - Organizational Capacity: 78\n"
            "   - Budget: 72\n"
            "   - Impact: 90\n"
            "2. Add comments for each criterion\n"
            "3. Observe the weighted score calculation in real-time"
        ),
        "data": "Scores: Technical=85, Capacity=78, Budget=72, Impact=90",
        "expected": (
            "1. Score inputs accept values 0-100\n"
            "2. Weighted score calculates in real-time as scores are entered\n"
            "3. Comment fields accept text\n"
            "4. Running total updates dynamically"
        ),
        "criteria": "Pass: Scores entered, weighted total calculates. Fail: Calculation error or input rejected."
    },
    {
        "id": "TC-078", "name": "Score Application - AI Auto-Score", "category": "Applications",
        "priority": "P1 - Critical", "requirement": "FR-APPL-017",
        "prereqs": "Logged in as james@reviewer.org. Assigned application open.",
        "steps": (
            "1. On the scoring interface, click 'AI Auto-Score' button\n"
            "2. Wait for AI to process\n"
            "3. Review the AI-generated scores for each criterion\n"
            "4. Optionally adjust scores\n"
            "5. Add or modify comments"
        ),
        "data": "Application: Amani's submitted application",
        "expected": (
            "1. AI generates scores for all criteria\n"
            "2. Loading indicator during processing\n"
            "3. AI scores populated in score fields\n"
            "4. AI-generated comments/justifications added\n"
            "5. Reviewer can manually adjust any AI score\n"
            "6. Weighted total recalculates after AI scoring"
        ),
        "criteria": "Pass: AI generates scores for all criteria. Fail: AI fails or returns empty scores."
    },
    {
        "id": "TC-079", "name": "Submit Review", "category": "Applications",
        "priority": "P1 - Critical", "requirement": "FR-APPL-018",
        "prereqs": "Logged in as james@reviewer.org. All criteria scored.",
        "steps": (
            "1. Verify all criteria have scores\n"
            "2. Click 'Submit Review'\n"
            "3. Wait for confirmation"
        ),
        "data": "Complete review with all scores and comments",
        "expected": (
            "1. Review submitted successfully\n"
            "2. Review status changes to 'completed'\n"
            "3. Scores saved permanently\n"
            "4. Review removed from 'pending' list\n"
            "5. Appears in 'completed' reviews"
        ),
        "criteria": "Pass: Review status = completed, scores saved. Fail: Submission error."
    },
    {
        "id": "TC-080", "name": "Final Score Calculation", "category": "Applications",
        "priority": "P1 - Critical", "requirement": "FR-APPL-019",
        "prereqs": "Reviewer has submitted scores. Application has AI document scores.",
        "steps": (
            "1. Login as sarah@globalhealth.org / pass123\n"
            "2. View the application that has been reviewed\n"
            "3. Check the final composite score\n"
            "4. Verify the calculation breakdown"
        ),
        "data": "Application with reviewer scores and AI document scores",
        "expected": (
            "1. Final score calculated as weighted average:\n"
            "   Final = (Criteria Score x 60%) + (Document Score x 20%) + (Eligibility x 20%)\n"
            "2. Score breakdown visible showing each component\n"
            "3. Percentage and numeric score displayed"
        ),
        "criteria": "Pass: Final score matches expected formula. Fail: Calculation mismatch."
    },
    {
        "id": "TC-081", "name": "View Applicant Rankings (Donor)", "category": "Applications",
        "priority": "P1 - Critical", "requirement": "FR-APPL-020",
        "prereqs": "Logged in as sarah@globalhealth.org. Multiple applications with scores.",
        "steps": (
            "1. Login as sarah@globalhealth.org / pass123\n"
            "2. Navigate to 'Community Health Workers' grant\n"
            "3. View applications/rankings\n"
            "4. Check the ordering"
        ),
        "data": "Email: sarah@globalhealth.org | Grant: Community Health Workers",
        "expected": (
            "1. Applications listed in descending score order\n"
            "2. Amani (78.5) ranked above Salam Relief (62.3)\n"
            "3. Each entry shows: NGO name, score, status, review status\n"
            "4. Award/reject action buttons available"
        ),
        "criteria": "Pass: Ranked list in descending order. Fail: Wrong order or missing scores."
    },
]
test_cases.extend(application_cases)

# ============================================================================
# CATEGORY 5: ASSESSMENTS (TC-090 to TC-100)
# ============================================================================

assessment_cases = [
    {
        "id": "TC-090", "name": "Start Kuja Framework Assessment", "category": "Assessments",
        "priority": "P1 - Critical", "requirement": "FR-ASMT-001",
        "prereqs": "Logged in as fatima@amani.org.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Click 'Assessments' in the sidebar\n"
            "3. Click 'Start New Assessment'\n"
            "4. Select 'Kuja Standard' framework\n"
            "5. Observe the checklist displayed"
        ),
        "data": "Email: fatima@amani.org | Framework: Kuja Standard",
        "expected": (
            "1. Kuja assessment checklist displayed\n"
            "2. 5 categories visible with total of 26 items\n"
            "3. Categories: Governance, Financial, Technical, HR, Compliance (or equivalent)\n"
            "4. Each item has a checkbox and description\n"
            "5. Score starts at 0%"
        ),
        "criteria": "Pass: Kuja checklist with 5 categories displayed. Fail: Wrong framework or missing items."
    },
    {
        "id": "TC-091", "name": "Complete Kuja Checklist", "category": "Assessments",
        "priority": "P1 - Critical", "requirement": "FR-ASMT-002",
        "prereqs": "Kuja assessment started from TC-090.",
        "steps": (
            "1. Check various items across all 5 categories\n"
            "2. For each category, check approximately 70-80% of items\n"
            "3. Observe the score calculations updating\n"
            "4. Click 'Complete Assessment'"
        ),
        "data": "Approximately 70-80% of items checked across all categories",
        "expected": (
            "1. Category scores calculate as (checked/total) x 100 x weight\n"
            "2. Overall score is sum of weighted category scores\n"
            "3. Score updates in real-time as items are checked/unchecked\n"
            "4. Assessment saved on completion\n"
            "5. Results page shows score, category breakdown, gaps"
        ),
        "criteria": "Pass: Correct score calculation and saved. Fail: Wrong score or save failure."
    },
    {
        "id": "TC-092", "name": "Start STEP Framework Assessment", "category": "Assessments",
        "priority": "P2 - High", "requirement": "FR-ASMT-001",
        "prereqs": "Logged in as NGO user.",
        "steps": (
            "1. Login as ahmed@salamrelief.org / pass123\n"
            "2. Navigate to Assessments\n"
            "3. Start new assessment\n"
            "4. Select 'STEP' framework\n"
            "5. Verify checklist content"
        ),
        "data": "Email: ahmed@salamrelief.org | Framework: STEP",
        "expected": (
            "1. STEP checklist displayed with 5 categories\n"
            "2. Items relevant to STEP framework\n"
            "3. Different from Kuja items"
        ),
        "criteria": "Pass: STEP checklist displayed correctly. Fail: Wrong framework items."
    },
    {
        "id": "TC-093", "name": "Start UN-HACT Framework Assessment", "category": "Assessments",
        "priority": "P2 - High", "requirement": "FR-ASMT-001",
        "prereqs": "Logged in as NGO user.",
        "steps": (
            "1. Login as thandi@ubuntu.org / pass123\n"
            "2. Navigate to Assessments\n"
            "3. Start new assessment, select 'UN-HACT'\n"
            "4. Verify checklist"
        ),
        "data": "Email: thandi@ubuntu.org | Framework: UN-HACT",
        "expected": (
            "1. UN-HACT checklist with 5 categories, 22 items\n"
            "2. Items reflect UN-HACT micro-assessment criteria"
        ),
        "criteria": "Pass: UN-HACT checklist correct. Fail: Wrong items or count."
    },
    {
        "id": "TC-094", "name": "Start CHS Framework Assessment", "category": "Assessments",
        "priority": "P2 - High", "requirement": "FR-ASMT-001",
        "prereqs": "Logged in as NGO user.",
        "steps": (
            "1. Login as aisha@sahelwomen.org / pass123\n"
            "2. Navigate to Assessments\n"
            "3. Start new assessment, select 'CHS'\n"
            "4. Verify checklist"
        ),
        "data": "Email: aisha@sahelwomen.org | Framework: CHS",
        "expected": (
            "1. CHS checklist with 7 categories, 27 items\n"
            "2. Items aligned to Core Humanitarian Standard commitments"
        ),
        "criteria": "Pass: CHS checklist with 7 categories. Fail: Wrong structure."
    },
    {
        "id": "TC-095", "name": "Start NUPAS Framework Assessment", "category": "Assessments",
        "priority": "P2 - High", "requirement": "FR-ASMT-001",
        "prereqs": "Logged in as NGO user.",
        "steps": (
            "1. Login as peter@hopebridges.org / pass123\n"
            "2. Navigate to Assessments\n"
            "3. Start new assessment, select 'NUPAS'\n"
            "4. Verify checklist"
        ),
        "data": "Email: peter@hopebridges.org | Framework: NUPAS",
        "expected": (
            "1. NUPAS checklist with 5 categories, 26 items\n"
            "2. Items reflect NUPAS assessment criteria"
        ),
        "criteria": "Pass: NUPAS checklist correct. Fail: Wrong items."
    },
    {
        "id": "TC-096", "name": "Assessment Score Calculation Accuracy", "category": "Assessments",
        "priority": "P1 - Critical", "requirement": "FR-ASMT-003",
        "prereqs": "In Kuja assessment with known items.",
        "steps": (
            "1. Start Kuja assessment\n"
            "2. In Category 1 (e.g., 5 items, weight 25%), check 4 out of 5\n"
            "3. In Category 2 (e.g., 6 items, weight 20%), check 3 out of 6\n"
            "4. Leave other categories at 0\n"
            "5. Calculate expected score manually\n"
            "6. Compare with displayed score"
        ),
        "data": "Category 1: 4/5 checked (80%), Category 2: 3/6 checked (50%)",
        "expected": (
            "1. Category 1 score = (4/5) x 100 x 0.25 = 20.0\n"
            "2. Category 2 score = (3/6) x 100 x 0.20 = 10.0\n"
            "3. Overall = 20.0 + 10.0 = 30.0%\n"
            "4. Displayed score matches manual calculation"
        ),
        "criteria": "Pass: Score matches manual calculation. Fail: Score mismatch."
    },
    {
        "id": "TC-097", "name": "Assessment Gaps Identification", "category": "Assessments",
        "priority": "P2 - High", "requirement": "FR-ASMT-004",
        "prereqs": "Assessment completed with some items unchecked.",
        "steps": (
            "1. Complete an assessment with some items unchecked\n"
            "2. Click 'Complete Assessment'\n"
            "3. View the results page\n"
            "4. Look for the 'Gaps' or 'Recommendations' section"
        ),
        "data": "Assessment with gaps in multiple categories",
        "expected": (
            "1. Unchecked items listed as capacity gaps\n"
            "2. Gaps organized by category\n"
            "3. Recommendations provided for addressing gaps\n"
            "4. Priority indicators for critical gaps"
        ),
        "criteria": "Pass: Gaps correctly identified. Fail: Missing gaps or wrong items listed."
    },
    {
        "id": "TC-098", "name": "Assessment Document Upload", "category": "Assessments",
        "priority": "P2 - High", "requirement": "FR-ASMT-005",
        "prereqs": "In assessment wizard.",
        "steps": (
            "1. During assessment, find the document upload area\n"
            "2. Upload a supporting document (e.g., valid_audit_report.pdf)\n"
            "3. Wait for upload to complete"
        ),
        "data": "File: test-files-v3/valid_audit_report.pdf",
        "expected": (
            "1. Document uploaded successfully\n"
            "2. Document linked to the assessment\n"
            "3. File name displayed in the uploaded list"
        ),
        "criteria": "Pass: Document uploaded and linked. Fail: Upload fails."
    },
    {
        "id": "TC-099", "name": "View Assessment Results", "category": "Assessments",
        "priority": "P1 - Critical", "requirement": "FR-ASMT-006",
        "prereqs": "Assessment completed.",
        "steps": (
            "1. After completing assessment, view results page\n"
            "2. Review all sections of the results"
        ),
        "data": "Completed assessment",
        "expected": (
            "1. Results page shows:\n"
            "   - Overall score (percentage)\n"
            "   - Category-by-category breakdown with scores\n"
            "   - Visual indicators (progress bars or charts)\n"
            "   - List of gaps (unchecked items)\n"
            "   - Recommendations for improvement"
        ),
        "criteria": "Pass: Comprehensive results displayed. Fail: Missing sections."
    },
    {
        "id": "TC-100", "name": "Assessment Updates Organization Profile", "category": "Assessments",
        "priority": "P1 - Critical", "requirement": "FR-ASMT-007",
        "prereqs": "Assessment completed for an NGO.",
        "steps": (
            "1. Complete a new assessment\n"
            "2. Navigate to the organization profile\n"
            "3. Verify the assessment score and date are updated"
        ),
        "data": "Newly completed assessment",
        "expected": (
            "1. Organization profile shows updated assess_score\n"
            "2. assess_date reflects the completion date\n"
            "3. Score visible to donors searching organizations"
        ),
        "criteria": "Pass: Profile updated with new score/date. Fail: Old score persists."
    },
]
test_cases.extend(assessment_cases)

# ============================================================================
# CATEGORY 6: AI SERVICES (TC-120 to TC-130)
# ============================================================================

ai_cases = [
    {
        "id": "TC-120", "name": "AI Chat - Basic Question", "category": "AI Services",
        "priority": "P1 - Critical", "requirement": "FR-AI-001",
        "prereqs": "Logged in as any user. ANTHROPIC_API_KEY configured.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Open the AI Chat panel (typically a button/icon in the header or sidebar)\n"
            "3. Type: 'What can Kuja help with?'\n"
            "4. Press Enter or click Send\n"
            "5. Wait for AI response"
        ),
        "data": "Question: 'What can Kuja help with?'",
        "expected": (
            "1. AI panel opens\n"
            "2. Loading indicator while processing\n"
            "3. AI responds with relevant platform information\n"
            "4. Response is contextual and accurate about Kuja features\n"
            "5. Response appears within reasonable time (< 15 seconds)"
        ),
        "criteria": "Pass: AI responds with relevant info. Fail: Error, timeout, or irrelevant response."
    },
    {
        "id": "TC-121", "name": "AI Chat - Role-Specific Guidance", "category": "AI Services",
        "priority": "P2 - High", "requirement": "FR-AI-002",
        "prereqs": "Logged in as NGO user.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Open AI Chat\n"
            "3. Ask: 'How do I strengthen my application?'\n"
            "4. Review the response"
        ),
        "data": "Question: 'How do I strengthen my application?'",
        "expected": (
            "1. AI provides NGO-specific advice\n"
            "2. Response references proposal writing, document quality, capacity scores\n"
            "3. Advice is actionable and relevant to the NGO context\n"
            "4. Does not provide donor-specific or admin-specific guidance"
        ),
        "criteria": "Pass: Role-appropriate advice given. Fail: Generic or wrong-role advice."
    },
    {
        "id": "TC-122", "name": "AI Chat in French", "category": "AI Services",
        "priority": "P2 - High", "requirement": "FR-AI-003",
        "prereqs": "Logged in. Language set to French.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Switch language to French\n"
            "3. Open AI Chat\n"
            "4. Ask: 'Comment renforcer ma candidature?'\n"
            "5. Review the response"
        ),
        "data": "Language: French | Question: 'Comment renforcer ma candidature?'",
        "expected": (
            "1. AI responds entirely in French\n"
            "2. Response is grammatically correct French\n"
            "3. Content is relevant and helpful\n"
            "4. No English text mixed in"
        ),
        "criteria": "Pass: Complete French response. Fail: English or mixed-language response."
    },
    {
        "id": "TC-123", "name": "AI Chat in Arabic", "category": "AI Services",
        "priority": "P2 - High", "requirement": "FR-AI-003",
        "prereqs": "Logged in. Language set to Arabic.",
        "steps": (
            "1. Login as ahmed@salamrelief.org / pass123\n"
            "2. Switch language to Arabic\n"
            "3. Open AI Chat\n"
            "4. Ask a question in Arabic\n"
            "5. Review the response"
        ),
        "data": "Language: Arabic",
        "expected": (
            "1. AI responds in Arabic\n"
            "2. RTL text rendering is correct\n"
            "3. Content is relevant\n"
            "4. Arabic characters display properly"
        ),
        "criteria": "Pass: Arabic response with correct rendering. Fail: Wrong language or broken rendering."
    },
    {
        "id": "TC-124", "name": "AI Document Analysis - Good Document", "category": "AI Services",
        "priority": "P1 - Critical", "requirement": "FR-AI-004",
        "prereqs": "Logged in as NGO. valid_financial_report.pdf available.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Navigate to Documents section\n"
            "3. Upload valid_financial_report.pdf\n"
            "4. Wait for AI analysis to complete\n"
            "5. Review the analysis results"
        ),
        "data": "File: test-files-v3/valid_financial_report.pdf",
        "expected": (
            "1. AI analysis completes within 30 seconds\n"
            "2. Score: 70-90 (good quality document)\n"
            "3. Findings list with specific observations\n"
            "4. Recommendations for improvement\n"
            "5. Score breakdown by evaluation criteria"
        ),
        "criteria": "Pass: Score 70+, meaningful findings. Fail: Very low score or empty analysis."
    },
    {
        "id": "TC-125", "name": "AI Document Analysis - Poor Document", "category": "AI Services",
        "priority": "P2 - High", "requirement": "FR-AI-004",
        "prereqs": "Logged in as NGO. invalid_financial_incomplete.pdf available.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Upload invalid_financial_incomplete.pdf\n"
            "3. Wait for AI analysis\n"
            "4. Review results"
        ),
        "data": "File: test-files-v3/invalid_financial_incomplete.pdf",
        "expected": (
            "1. AI returns lower score (30-50)\n"
            "2. Identifies missing sections (no auditor opinion, incomplete data)\n"
            "3. Specific findings about what is missing\n"
            "4. Recommendations to complete the document"
        ),
        "criteria": "Pass: Lower score with identified gaps. Fail: High score for incomplete document."
    },
    {
        "id": "TC-126", "name": "AI Application Scoring", "category": "AI Services",
        "priority": "P1 - Critical", "requirement": "FR-AI-005",
        "prereqs": "Application submitted with well-written responses.",
        "steps": (
            "1. Submit a complete application with detailed responses\n"
            "2. After submission, observe the AI score calculation\n"
            "3. Review the score breakdown"
        ),
        "data": "Complete application with detailed proposal responses",
        "expected": (
            "1. AI calculates score based on:\n"
            "   - Completeness of responses\n"
            "   - Relevance to criteria\n"
            "   - Depth and quality of writing\n"
            "2. Score is 0-100\n"
            "3. Per-criterion AI feedback available"
        ),
        "criteria": "Pass: AI score calculated with breakdown. Fail: No score or error."
    },
    {
        "id": "TC-127", "name": "AI Guidance for Proposal Writing", "category": "AI Services",
        "priority": "P2 - High", "requirement": "FR-AI-006",
        "prereqs": "In application wizard Step 2.",
        "steps": (
            "1. In the application wizard, navigate to Step 2 (Proposal)\n"
            "2. For any evaluation criterion, click 'AI Guidance'\n"
            "3. Wait for response\n"
            "4. Review the suggestions"
        ),
        "data": "Criterion: any evaluation criterion from the grant",
        "expected": (
            "1. AI generates writing suggestions\n"
            "2. Suggestions are specific to the criterion\n"
            "3. Include key points to address\n"
            "4. In the user's selected language\n"
            "5. Actionable and concrete"
        ),
        "criteria": "Pass: Relevant, actionable suggestions. Fail: Generic or missing suggestions."
    },
    {
        "id": "TC-128", "name": "AI Report Analysis", "category": "AI Services",
        "priority": "P1 - Critical", "requirement": "FR-AI-007",
        "prereqs": "NGO submits a report for a grant with defined requirements.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Submit a report for a grant\n"
            "3. Wait for AI analysis\n"
            "4. Review the analysis results"
        ),
        "data": "Report submitted for grant with defined requirements",
        "expected": (
            "1. AI analyzes report against grant-specific requirements\n"
            "2. Per-requirement scores (0-100)\n"
            "3. Risk flags for low-scoring requirements\n"
            "4. Overall compliance score\n"
            "5. Specific recommendations"
        ),
        "criteria": "Pass: Per-requirement scoring and risk flags. Fail: No analysis or generic feedback."
    },
    {
        "id": "TC-129", "name": "AI Requirement Extraction from Grant Agreement", "category": "AI Services",
        "priority": "P1 - Critical", "requirement": "FR-AI-008",
        "prereqs": "Logged in as donor.",
        "steps": (
            "1. Login as sarah@globalhealth.org / pass123\n"
            "2. Start creating a new grant\n"
            "3. Upload a grant agreement document\n"
            "4. Click 'Extract Requirements' or similar button\n"
            "5. Wait for AI processing\n"
            "6. Review extracted requirements"
        ),
        "data": "File: test-files/grant_agreement_sample.txt",
        "expected": (
            "1. AI extracts:\n"
            "   - Report types (financial, narrative, impact)\n"
            "   - Reporting frequencies\n"
            "   - Specific deadlines\n"
            "   - Key compliance requirements\n"
            "2. Extracted items displayed in editable format\n"
            "3. Donor can modify, add, or remove items"
        ),
        "criteria": "Pass: Meaningful requirements extracted. Fail: Empty or irrelevant extraction."
    },
    {
        "id": "TC-130", "name": "AI Fallback When API Unavailable", "category": "AI Services",
        "priority": "P2 - High", "requirement": "FR-AI-009",
        "prereqs": "Simulate API failure (e.g., invalid API key or rate limiting).",
        "steps": (
            "1. (For testing) Temporarily disable or simulate AI API failure\n"
            "2. Upload a document for analysis\n"
            "3. Observe the system behavior\n"
            "4. Check if fallback mechanism activates"
        ),
        "data": "Document upload with AI API unavailable",
        "expected": (
            "1. System does not crash or show raw error\n"
            "2. Template-based fallback response returned\n"
            "3. User informed that AI analysis is temporarily unavailable\n"
            "4. Document is still saved/uploaded\n"
            "5. User can retry analysis later"
        ),
        "criteria": "Pass: Graceful fallback without data loss. Fail: Crash or data loss."
    },
]
test_cases.extend(ai_cases)

# ============================================================================
# CATEGORY 7: COMPLIANCE & SANCTIONS (TC-150 to TC-156)
# ============================================================================

compliance_cases = [
    {
        "id": "TC-150", "name": "Sanctions Screening - Clean Organization", "category": "Compliance & Sanctions",
        "priority": "P1 - Critical", "requirement": "FR-COMP-001",
        "prereqs": "Logged in as admin@kuja.org. OpenSanctions API configured.",
        "steps": (
            "1. Login as admin@kuja.org / pass123\n"
            "2. Navigate to Compliance section\n"
            "3. Select 'Amani Community Development' for screening\n"
            "4. Click 'Screen' or 'Run Screening'\n"
            "5. Wait for results from all sanctions lists"
        ),
        "data": "Organization: Amani Community Development | Country: Kenya",
        "expected": (
            "1. Screening runs against: UN, OFAC, EU, World Bank\n"
            "2. All results return CLEAR (no matches)\n"
            "3. Green status indicators for each list\n"
            "4. Screening date/time recorded\n"
            "5. Result saved to compliance history"
        ),
        "criteria": "Pass: All clear across all lists. Fail: False positive or screening failure."
    },
    {
        "id": "TC-151", "name": "Sanctions Screening - Flagged Match", "category": "Compliance & Sanctions",
        "priority": "P1 - Critical", "requirement": "FR-COMP-002",
        "prereqs": "Logged in as admin. Ability to screen arbitrary names.",
        "steps": (
            "1. Login as admin@kuja.org / pass123\n"
            "2. Navigate to Compliance\n"
            "3. Screen entity name similar to a known sanctioned entity\n"
            "4. Wait for results"
        ),
        "data": "Entity name similar to sanctioned organization",
        "expected": (
            "1. Screening returns FLAGGED status\n"
            "2. Match score displayed (percentage similarity)\n"
            "3. Matched sanctioned entity details shown:\n"
            "   - Entity name\n"
            "   - List(s) where found\n"
            "   - Reason for listing\n"
            "4. Red status indicators\n"
            "5. Result saved to compliance history"
        ),
        "criteria": "Pass: Flagged with match details. Fail: False negative (cleared when should be flagged)."
    },
    {
        "id": "TC-152", "name": "View Compliance History", "category": "Compliance & Sanctions",
        "priority": "P2 - High", "requirement": "FR-COMP-003",
        "prereqs": "Previous screenings have been run.",
        "steps": (
            "1. Login as admin@kuja.org / pass123\n"
            "2. Navigate to Compliance\n"
            "3. Select an organization\n"
            "4. View the compliance history tab"
        ),
        "data": "Organization with previous screening records",
        "expected": (
            "1. All previous screenings listed chronologically\n"
            "2. Each entry shows: date, result (clear/flagged), lists checked\n"
            "3. Can click to see full details of any screening\n"
            "4. History is immutable (cannot be deleted)"
        ),
        "criteria": "Pass: Full history displayed. Fail: Missing records or incomplete data."
    },
    {
        "id": "TC-153", "name": "OpenSanctions API Integration", "category": "Compliance & Sanctions",
        "priority": "P1 - Critical", "requirement": "FR-COMP-004",
        "prereqs": "OPENSANCTIONS_API_KEY is configured.",
        "steps": (
            "1. Trigger a sanctions screening\n"
            "2. Monitor network requests (DevTools)\n"
            "3. Verify API call to OpenSanctions"
        ),
        "data": "Valid OpenSanctions API key configured",
        "expected": (
            "1. HTTP request made to https://api.opensanctions.org/\n"
            "2. Response status: 200 OK\n"
            "3. Response contains match results\n"
            "4. Results parsed and displayed in UI"
        ),
        "criteria": "Pass: Successful API call with parsed results. Fail: API error or no results."
    },
    {
        "id": "TC-154", "name": "Fallback Sanctions Check (API Down)", "category": "Compliance & Sanctions",
        "priority": "P2 - High", "requirement": "FR-COMP-005",
        "prereqs": "OpenSanctions API is unavailable or returns error.",
        "steps": (
            "1. (Simulate) When OpenSanctions API is down\n"
            "2. Trigger a sanctions screening\n"
            "3. Observe fallback behavior"
        ),
        "data": "OpenSanctions API unavailable",
        "expected": (
            "1. System falls back to direct downloads:\n"
            "   - UN XML from scsanctions.un.org\n"
            "   - OFAC CSV from treasury.gov\n"
            "   - EU CSV from webgate.ec.europa.eu\n"
            "2. Screening still completes using fallback data\n"
            "3. User informed about fallback mode\n"
            "4. Results may be less comprehensive but still functional"
        ),
        "criteria": "Pass: Fallback screening completes. Fail: Screening fails entirely."
    },
    {
        "id": "TC-155", "name": "Keyword Screening", "category": "Compliance & Sanctions",
        "priority": "P2 - High", "requirement": "FR-COMP-006",
        "prereqs": "Logged in as admin.",
        "steps": (
            "1. Login as admin@kuja.org / pass123\n"
            "2. Screen an organization with suspicious keywords in name\n"
            "3. Review screening results"
        ),
        "data": "Organization name with flagged keywords",
        "expected": (
            "1. Keyword screening detects suspicious terms\n"
            "2. Flagged matches listed with keyword context\n"
            "3. Severity level indicated"
        ),
        "criteria": "Pass: Keywords detected and flagged. Fail: No keyword screening."
    },
    {
        "id": "TC-156", "name": "Personnel Screening", "category": "Compliance & Sanctions",
        "priority": "P2 - High", "requirement": "FR-COMP-007",
        "prereqs": "Logged in as admin or donor.",
        "steps": (
            "1. Login as admin@kuja.org / pass123\n"
            "2. Navigate to Compliance\n"
            "3. Select personnel screening option\n"
            "4. Enter individual name for screening\n"
            "5. Review results"
        ),
        "data": "Individual name for sanctions screening",
        "expected": (
            "1. Person screened against all sanctions lists\n"
            "2. Results show clear or flagged status\n"
            "3. If flagged, matched entity details shown\n"
            "4. Result linked to the organization's compliance record"
        ),
        "criteria": "Pass: Person-level screening works. Fail: No person screening capability."
    },
]
test_cases.extend(compliance_cases)

# ============================================================================
# CATEGORY 8: REGISTRY VERIFICATION (TC-180 to TC-186)
# ============================================================================

registry_cases = [
    {
        "id": "TC-180", "name": "Verify South African NGO", "category": "Registry Verification",
        "priority": "P1 - Critical", "requirement": "FR-REG-001",
        "prereqs": "Logged in as admin. Live internet access.",
        "steps": (
            "1. Login as admin@kuja.org / pass123\n"
            "2. Navigate to Compliance > Registry Verification\n"
            "3. Select 'Ubuntu Education Trust' (South Africa)\n"
            "4. Click 'Verify Registration'\n"
            "5. Wait for live check to complete"
        ),
        "data": "Organization: Ubuntu Education Trust | Country: South Africa | Registry: DSD NPO",
        "expected": (
            "1. System queries DSD NPO Registry (https://www.npo.gov.za/)\n"
            "2. Verification result returned (registered/not found)\n"
            "3. Registration details shown if found\n"
            "4. Verification timestamp recorded\n"
            "5. Status updated on organization profile"
        ),
        "criteria": "Pass: Live verification completes with result. Fail: Verification fails or times out."
    },
    {
        "id": "TC-181", "name": "Verify Kenyan NGO", "category": "Registry Verification",
        "priority": "P1 - Critical", "requirement": "FR-REG-002",
        "prereqs": "Logged in as admin. Live internet access.",
        "steps": (
            "1. Login as admin@kuja.org / pass123\n"
            "2. Navigate to Registry Verification\n"
            "3. Select 'Amani Community Development' (Kenya)\n"
            "4. Click 'Verify Registration'\n"
            "5. Wait for result"
        ),
        "data": "Organization: Amani Community Development | Country: Kenya | Registry: BRS",
        "expected": (
            "1. System checks BRS portal (https://brs.go.ke/)\n"
            "2. Result returned: found/not found\n"
            "3. Verification details displayed\n"
            "4. Timestamp recorded"
        ),
        "criteria": "Pass: Kenya BRS check completes. Fail: Check fails."
    },
    {
        "id": "TC-182", "name": "Verify Nigerian NGO", "category": "Registry Verification",
        "priority": "P2 - High", "requirement": "FR-REG-003",
        "prereqs": "Logged in as admin.",
        "steps": (
            "1. Login as admin@kuja.org / pass123\n"
            "2. Select 'Sahel Women's Network' (Nigeria)\n"
            "3. Click 'Verify Registration'"
        ),
        "data": "Organization: Sahel Women's Network | Country: Nigeria | Registry: CAC",
        "expected": (
            "1. System checks CAC portal (https://search.cac.gov.ng/)\n"
            "2. Result returned\n"
            "3. Verification status updated"
        ),
        "criteria": "Pass: Nigeria CAC check completes. Fail: Check fails."
    },
    {
        "id": "TC-183", "name": "Verify Ugandan NGO", "category": "Registry Verification",
        "priority": "P2 - High", "requirement": "FR-REG-004",
        "prereqs": "Logged in as admin.",
        "steps": (
            "1. Login as admin@kuja.org / pass123\n"
            "2. Select 'Hope Bridges Initiative' (Uganda)\n"
            "3. Click 'Verify Registration'"
        ),
        "data": "Organization: Hope Bridges Initiative | Country: Uganda | Registry: NGO Bureau",
        "expected": (
            "1. System searches NGO Bureau register (https://ngobureau.go.ug/)\n"
            "2. Result returned\n"
            "3. Verification status updated"
        ),
        "criteria": "Pass: Uganda NGO Bureau check completes. Fail: Check fails."
    },
    {
        "id": "TC-184", "name": "Verify Somali NGO (No Public Registry)", "category": "Registry Verification",
        "priority": "P2 - High", "requirement": "FR-REG-005",
        "prereqs": "Logged in as admin.",
        "steps": (
            "1. Login as admin@kuja.org / pass123\n"
            "2. Select 'Salam Relief Foundation' (Somalia)\n"
            "3. Click 'Verify Registration'"
        ),
        "data": "Organization: Salam Relief Foundation | Country: Somalia",
        "expected": (
            "1. System detects no public registry available for Somalia\n"
            "2. Message: 'No public registry available. Manual verification required.'\n"
            "3. Guidance on alternative verification methods (MOIFAR contact info)\n"
            "4. Status set to 'manual_verification_needed'"
        ),
        "criteria": "Pass: Appropriate message about no registry. Fail: Error or false verification."
    },
    {
        "id": "TC-185", "name": "Verify Ethiopian NGO (No Public Registry)", "category": "Registry Verification",
        "priority": "P2 - High", "requirement": "FR-REG-005",
        "prereqs": "Logged in as admin.",
        "steps": (
            "1. Login as admin@kuja.org / pass123\n"
            "2. Select or create verification for Ethiopia-based org\n"
            "3. Attempt verification"
        ),
        "data": "Country: Ethiopia",
        "expected": (
            "1. Message about ACSO (Authority for Civil Society Organizations)\n"
            "2. Manual verification guidance provided\n"
            "3. No false positive from automated check"
        ),
        "criteria": "Pass: Manual verification guidance shown. Fail: Automated check attempted."
    },
    {
        "id": "TC-186", "name": "View All Verification Statuses (Admin)", "category": "Registry Verification",
        "priority": "P2 - High", "requirement": "FR-REG-006",
        "prereqs": "Logged in as admin. Some verifications completed.",
        "steps": (
            "1. Login as admin@kuja.org / pass123\n"
            "2. Navigate to Compliance > Verification Dashboard\n"
            "3. View the list of all organizations with verification status"
        ),
        "data": "Admin view of all organizations",
        "expected": (
            "1. All organizations listed with columns:\n"
            "   - Organization name\n"
            "   - Country\n"
            "   - Registry type\n"
            "   - Verification status (verified/pending/manual/not verified)\n"
            "   - Last verified date\n"
            "2. Filters available by status and country\n"
            "3. Can initiate verification from this view"
        ),
        "criteria": "Pass: All orgs listed with statuses. Fail: Missing orgs or no status info."
    },
]
test_cases.extend(registry_cases)

# ============================================================================
# CATEGORY 9: REPORTS (TC-200 to TC-209)
# ============================================================================

report_cases = [
    {
        "id": "TC-200", "name": "View Reports List (NGO)", "category": "Reports",
        "priority": "P1 - Critical", "requirement": "FR-RPT-001",
        "prereqs": "Logged in as fatima@amani.org. Reports exist for Amani.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Click 'Reports' in the sidebar\n"
            "3. Observe the reports list"
        ),
        "data": "Email: fatima@amani.org | Password: pass123",
        "expected": (
            "1. Reports page displays list of reports for Amani:\n"
            "   - Q1 2026 Financial Report (Submitted)\n"
            "   - Annual Progress Report H1 2026 (Draft)\n"
            "   - Test Q2 Financial Report (Accepted)\n"
            "   - Annual Impact Report 2025 (Revision Requested)\n"
            "   - Under Review Financial Report (Under Review)\n"
            "2. Each report shows: title, type, status, grant name, date\n"
            "3. Status indicators color-coded"
        ),
        "criteria": "Pass: All reports listed with correct statuses. Fail: Missing reports or wrong status."
    },
    {
        "id": "TC-201", "name": "Create New Financial Report", "category": "Reports",
        "priority": "P1 - Critical", "requirement": "FR-RPT-002",
        "prereqs": "Logged in as fatima@amani.org. Active grant exists.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Navigate to Reports\n"
            "3. Click 'New Report'\n"
            "4. Select Type: Financial\n"
            "5. Select Grant: Community Health Workers Scale-Up Program\n"
            "6. Select Period: Q2 2026\n"
            "7. Observe the report form"
        ),
        "data": "Type: Financial | Grant: Community Health Workers | Period: Q2 2026",
        "expected": (
            "1. Report creation form opens\n"
            "2. Financial report template sections displayed:\n"
            "   - Executive Summary\n"
            "   - Income/Revenue\n"
            "   - Expenditure Breakdown\n"
            "   - Budget vs. Actual\n"
            "   - Notes to Accounts\n"
            "3. Template matches donor-defined reporting requirements"
        ),
        "criteria": "Pass: Financial template with correct sections. Fail: Wrong template or missing sections."
    },
    {
        "id": "TC-202", "name": "Create New Narrative Report", "category": "Reports",
        "priority": "P1 - Critical", "requirement": "FR-RPT-002",
        "prereqs": "Logged in as NGO user.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Click New Report\n"
            "3. Select Type: Narrative\n"
            "4. Select appropriate grant and period"
        ),
        "data": "Type: Narrative",
        "expected": (
            "1. Narrative report template sections:\n"
            "   - Executive Summary\n"
            "   - Activities & Outputs\n"
            "   - Progress Against Indicators\n"
            "   - Challenges & Lessons Learned\n"
            "   - Plans for Next Period"
        ),
        "criteria": "Pass: Narrative template displayed. Fail: Wrong template."
    },
    {
        "id": "TC-203", "name": "Fill Report Template Sections", "category": "Reports",
        "priority": "P1 - Critical", "requirement": "FR-RPT-003",
        "prereqs": "Report form open from TC-201.",
        "steps": (
            "1. Fill in Executive Summary: 'This report covers Q2 2026 financial activities...'\n"
            "2. Fill in Revenue section with income data\n"
            "3. Fill in Expenditure section with spending data\n"
            "4. Add notes and explanations\n"
            "5. Click Save"
        ),
        "data": "Financial report content for all template sections",
        "expected": (
            "1. All sections accept text input\n"
            "2. Data saved successfully\n"
            "3. Report status remains 'Draft'\n"
            "4. Can return and edit later"
        ),
        "criteria": "Pass: Content saved in all sections. Fail: Data loss or save error."
    },
    {
        "id": "TC-204", "name": "Submit Report", "category": "Reports",
        "priority": "P1 - Critical", "requirement": "FR-RPT-004",
        "prereqs": "Report filled out and saved as draft.",
        "steps": (
            "1. Open the draft report\n"
            "2. Review all sections\n"
            "3. Click 'Submit Report'\n"
            "4. Confirm submission"
        ),
        "data": "Completed draft report ready for submission",
        "expected": (
            "1. Report submitted successfully\n"
            "2. Status changes from 'draft' to 'submitted'\n"
            "3. AI analysis triggered automatically\n"
            "4. Submission timestamp recorded\n"
            "5. Report visible to donor for review"
        ),
        "criteria": "Pass: Status = submitted, AI analysis runs. Fail: Submission error."
    },
    {
        "id": "TC-205", "name": "AI Report Analysis Results", "category": "Reports",
        "priority": "P1 - Critical", "requirement": "FR-RPT-005",
        "prereqs": "Report submitted (TC-204). AI analysis complete.",
        "steps": (
            "1. View the submitted report\n"
            "2. Check the AI analysis section\n"
            "3. Review per-requirement scores"
        ),
        "data": "Submitted report with AI analysis",
        "expected": (
            "1. AI analysis section shows:\n"
            "   - Overall compliance score\n"
            "   - Per-requirement scores (for each donor-defined requirement)\n"
            "   - Risk flags for low-scoring areas\n"
            "   - Specific recommendations\n"
            "2. Visual indicators (green/yellow/red) for each requirement\n"
            "3. Detailed findings with citations from the report"
        ),
        "criteria": "Pass: Per-requirement AI analysis with risk flags. Fail: No analysis or generic feedback."
    },
    {
        "id": "TC-206", "name": "Donor Reviews Report - Accept", "category": "Reports",
        "priority": "P1 - Critical", "requirement": "FR-RPT-006",
        "prereqs": "Logged in as sarah@globalhealth.org. Submitted report exists.",
        "steps": (
            "1. Login as sarah@globalhealth.org / pass123\n"
            "2. Navigate to Reports section\n"
            "3. Find submitted report from Amani\n"
            "4. Review the report and AI analysis\n"
            "5. Click 'Accept' button"
        ),
        "data": "Email: sarah@globalhealth.org | Report: submitted financial report",
        "expected": (
            "1. Report detail view shows full content and AI analysis\n"
            "2. Accept button available\n"
            "3. After clicking Accept:\n"
            "   - Status changes to 'accepted'\n"
            "   - reviewed_at timestamp set\n"
            "   - NGO can see accepted status\n"
            "4. Confirmation message displayed"
        ),
        "criteria": "Pass: Report accepted, status updated. Fail: Status not changed."
    },
    {
        "id": "TC-207", "name": "Donor Reviews Report - Request Revision", "category": "Reports",
        "priority": "P1 - Critical", "requirement": "FR-RPT-007",
        "prereqs": "Logged in as sarah@globalhealth.org. Submitted report exists.",
        "steps": (
            "1. Login as sarah@globalhealth.org / pass123\n"
            "2. Open a submitted report\n"
            "3. Click 'Request Revision'\n"
            "4. Enter revision notes: 'Please provide more detail on personnel expenditure'\n"
            "5. Confirm"
        ),
        "data": "Revision notes: 'Please provide more detail on personnel expenditure'",
        "expected": (
            "1. Status changes to 'revision_requested'\n"
            "2. Reviewer notes saved and visible to NGO\n"
            "3. NGO sees the report with revision request and notes\n"
            "4. NGO can edit and resubmit"
        ),
        "criteria": "Pass: Revision requested with notes saved. Fail: Notes not saved or status error."
    },
    {
        "id": "TC-208", "name": "View Upcoming Report Deadlines", "category": "Reports",
        "priority": "P2 - High", "requirement": "FR-RPT-008",
        "prereqs": "Logged in as NGO. Reports with deadlines exist.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Navigate to Reports page\n"
            "3. Check for upcoming deadlines section"
        ),
        "data": "Email: fatima@amani.org",
        "expected": (
            "1. Upcoming report deadlines listed\n"
            "2. Each deadline shows: report type, grant name, due date\n"
            "3. Deadlines sorted by date (nearest first)\n"
            "4. Visual indicators for urgency (days remaining)"
        ),
        "criteria": "Pass: Deadlines listed and sorted. Fail: No deadline information."
    },
    {
        "id": "TC-209", "name": "Overdue Report Detection", "category": "Reports",
        "priority": "P2 - High", "requirement": "FR-RPT-009",
        "prereqs": "Reports with past-due deadlines exist.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Navigate to Reports\n"
            "3. Look for overdue report indicators"
        ),
        "data": "Reports with due dates in the past",
        "expected": (
            "1. Overdue reports flagged with red indicator\n"
            "2. 'Overdue' label visible\n"
            "3. Days overdue count shown\n"
            "4. Overdue reports appear at top of list or in separate section"
        ),
        "criteria": "Pass: Overdue reports clearly flagged. Fail: No overdue indication."
    },
]
test_cases.extend(report_cases)

# ============================================================================
# CATEGORY 10: INTERNATIONALIZATION (TC-230 to TC-237)
# ============================================================================

i18n_cases = [
    {
        "id": "TC-230", "name": "English Translations Loaded", "category": "Internationalization",
        "priority": "P2 - High", "requirement": "FR-I18N-001",
        "prereqs": "Application accessible.",
        "steps": (
            "1. In browser, navigate to: /static/js/translations/en.json\n"
            "2. Verify the JSON file loads\n"
            "3. Count the translation keys"
        ),
        "data": "URL: /static/js/translations/en.json",
        "expected": (
            "1. JSON file loads successfully\n"
            "2. Contains 627+ translation keys\n"
            "3. All values are in English\n"
            "4. No missing or empty values"
        ),
        "criteria": "Pass: 627+ keys with English values. Fail: Missing file or fewer keys."
    },
    {
        "id": "TC-231", "name": "Arabic Translations Loaded", "category": "Internationalization",
        "priority": "P2 - High", "requirement": "FR-I18N-001",
        "prereqs": "Application accessible.",
        "steps": (
            "1. Navigate to: /static/js/translations/ar.json\n"
            "2. Verify the JSON file loads\n"
            "3. Verify Arabic text content"
        ),
        "data": "URL: /static/js/translations/ar.json",
        "expected": (
            "1. JSON file loads successfully\n"
            "2. Contains 627+ translation keys\n"
            "3. Values are in Arabic script\n"
            "4. Keys match the English file keys"
        ),
        "criteria": "Pass: Arabic translations present. Fail: Missing or incomplete translations."
    },
    {
        "id": "TC-232", "name": "French Translations Loaded", "category": "Internationalization",
        "priority": "P2 - High", "requirement": "FR-I18N-001",
        "prereqs": "Application accessible.",
        "steps": (
            "1. Navigate to: /static/js/translations/fr.json\n"
            "2. Verify the JSON file loads"
        ),
        "data": "URL: /static/js/translations/fr.json",
        "expected": (
            "1. JSON file loads with 627+ keys\n"
            "2. French text values"
        ),
        "criteria": "Pass: French translations present. Fail: Missing translations."
    },
    {
        "id": "TC-233", "name": "Swahili Translations Loaded", "category": "Internationalization",
        "priority": "P2 - High", "requirement": "FR-I18N-001",
        "prereqs": "Application accessible.",
        "steps": (
            "1. Navigate to: /static/js/translations/sw.json (or equivalent)\n"
            "2. Verify the JSON file loads"
        ),
        "data": "URL: /static/js/translations/sw.json",
        "expected": (
            "1. JSON file loads with translation keys\n"
            "2. Swahili text values"
        ),
        "criteria": "Pass: Swahili translations present. Fail: Missing translations."
    },
    {
        "id": "TC-234", "name": "Switch to Arabic - RTL Layout", "category": "Internationalization",
        "priority": "P1 - Critical", "requirement": "FR-I18N-002",
        "prereqs": "Logged in as any user.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Select Arabic language from language selector\n"
            "3. Wait for UI to update\n"
            "4. Inspect the page layout direction"
        ),
        "data": "Language: Arabic",
        "expected": (
            "1. HTML dir attribute set to 'rtl'\n"
            "2. Sidebar moves to right side of screen\n"
            "3. Text is right-aligned\n"
            "4. Icons and buttons mirror appropriately\n"
            "5. Arabic font (Noto Sans Arabic or similar) applied\n"
            "6. No overlapping elements or broken layout"
        ),
        "criteria": "Pass: Full RTL layout with Arabic text. Fail: LTR maintained or layout breaks."
    },
    {
        "id": "TC-235", "name": "Switch Back to English - LTR Layout", "category": "Internationalization",
        "priority": "P2 - High", "requirement": "FR-I18N-002",
        "prereqs": "Currently in Arabic RTL mode.",
        "steps": (
            "1. From Arabic mode, select English from language selector\n"
            "2. Wait for UI to update\n"
            "3. Verify layout returns to LTR"
        ),
        "data": "Language: English (from Arabic)",
        "expected": (
            "1. HTML dir attribute reverts to 'ltr'\n"
            "2. Sidebar returns to left side\n"
            "3. Text is left-aligned\n"
            "4. All English text displayed\n"
            "5. No layout artifacts from RTL mode"
        ),
        "criteria": "Pass: Clean LTR layout restored. Fail: RTL artifacts remain."
    },
    {
        "id": "TC-236", "name": "Assessment Checklist in French", "category": "Internationalization",
        "priority": "P2 - High", "requirement": "FR-I18N-003",
        "prereqs": "Logged in as NGO. Language set to French.",
        "steps": (
            "1. Login and switch language to French\n"
            "2. Navigate to Assessments\n"
            "3. Start a new assessment\n"
            "4. Observe checklist item text"
        ),
        "data": "Language: French | Section: Assessment Checklist",
        "expected": (
            "1. All checklist items displayed in French\n"
            "2. Category headers in French\n"
            "3. Button labels in French\n"
            "4. Score labels in French"
        ),
        "criteria": "Pass: Complete French checklist. Fail: English items mixed in."
    },
    {
        "id": "TC-237", "name": "Error Messages Translated", "category": "Internationalization",
        "priority": "P2 - High", "requirement": "FR-I18N-004",
        "prereqs": "Logged in. Language set to non-English.",
        "steps": (
            "1. Switch to French\n"
            "2. Trigger a validation error (e.g., submit empty form)\n"
            "3. Observe error message language"
        ),
        "data": "Language: French | Action: trigger validation error",
        "expected": (
            "1. Error message displayed in French\n"
            "2. All system messages in French\n"
            "3. No English error fallback"
        ),
        "criteria": "Pass: Error in selected language. Fail: English error shown."
    },
]
test_cases.extend(i18n_cases)

# ============================================================================
# CATEGORY 11: ACCESS CONTROL (TC-250 to TC-255)
# ============================================================================

access_cases = [
    {
        "id": "TC-250", "name": "NGO Cannot Access Admin Stats", "category": "Access Control",
        "priority": "P1 - Critical", "requirement": "FR-RBAC-001",
        "prereqs": "Logged in as NGO user.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Using DevTools or curl, send:\n"
            "   GET /api/admin/stats\n"
            "3. Observe the response"
        ),
        "data": "Email: fatima@amani.org | API: GET /api/admin/stats",
        "expected": (
            "1. Response status: 403 Forbidden\n"
            "2. Error message: role-based access denied\n"
            "3. No admin stats data returned"
        ),
        "criteria": "Pass: 403 returned. Fail: Admin stats accessible to NGO."
    },
    {
        "id": "TC-251", "name": "NGO Cannot Create Grants", "category": "Access Control",
        "priority": "P1 - Critical", "requirement": "FR-RBAC-002",
        "prereqs": "Logged in as NGO user.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Via API: POST /api/grants/\n"
            "   Body: {\"title\": \"NGO Grant\", \"amount\": 50000}\n"
            "3. Observe response"
        ),
        "data": "Email: fatima@amani.org | API: POST /api/grants/",
        "expected": (
            "1. Response: 403 Forbidden\n"
            "2. No grant created"
        ),
        "criteria": "Pass: 403. Fail: Grant created."
    },
    {
        "id": "TC-252", "name": "Reviewer Cannot Edit Applications", "category": "Access Control",
        "priority": "P1 - Critical", "requirement": "FR-RBAC-003",
        "prereqs": "Logged in as reviewer.",
        "steps": (
            "1. Login as james@reviewer.org / pass123\n"
            "2. Via API: PUT /api/applications/1\n"
            "   Body: {\"status\": \"approved\"}\n"
            "3. Observe response"
        ),
        "data": "Email: james@reviewer.org | API: PUT /api/applications/1",
        "expected": (
            "1. Response: 403 Forbidden\n"
            "2. Application not modified\n"
            "3. Only donors can change application status"
        ),
        "criteria": "Pass: 403 returned. Fail: Application modified by reviewer."
    },
    {
        "id": "TC-253", "name": "Donor Can Only See Own Grants", "category": "Access Control",
        "priority": "P1 - Critical", "requirement": "FR-RBAC-004",
        "prereqs": "Logged in as sarah@globalhealth.org.",
        "steps": (
            "1. Login as sarah@globalhealth.org / pass123\n"
            "2. Navigate to My Grants\n"
            "3. Verify only Global Health Fund grants are shown\n"
            "4. Check that East Africa Trust grants are NOT visible"
        ),
        "data": "Email: sarah@globalhealth.org (Global Health Fund)",
        "expected": (
            "1. Only grants owned by Global Health Fund shown:\n"
            "   - Community Health Workers Scale-Up Program\n"
            "   - Women's Protection and Empowerment\n"
            "2. East Africa Trust grants (Education Technology, Climate Resilience) NOT shown\n"
            "3. No data leakage from other donors"
        ),
        "criteria": "Pass: Only own grants visible. Fail: Other donor's grants shown."
    },
    {
        "id": "TC-254", "name": "NGO Can Only See Own Applications", "category": "Access Control",
        "priority": "P1 - Critical", "requirement": "FR-RBAC-005",
        "prereqs": "Logged in as fatima@amani.org.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Navigate to My Applications\n"
            "3. Verify only Amani's applications shown\n"
            "4. Check that other NGOs' applications are not visible"
        ),
        "data": "Email: fatima@amani.org (Amani Community Development)",
        "expected": (
            "1. Only Amani's applications shown (Community Health Workers)\n"
            "2. Salam Relief, Ubuntu, Sahel, Hope Bridges applications NOT visible\n"
            "3. No access to other organizations' application data"
        ),
        "criteria": "Pass: Only own applications visible. Fail: Other orgs' apps shown."
    },
    {
        "id": "TC-255", "name": "Cross-Organization Document Access Blocked", "category": "Access Control",
        "priority": "P1 - Critical", "requirement": "FR-RBAC-006",
        "prereqs": "Documents uploaded by multiple organizations.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Via API, try to access a document belonging to Salam Relief:\n"
            "   GET /api/documents/{salam_doc_id}\n"
            "3. Observe response"
        ),
        "data": "Email: fatima@amani.org | API: GET /api/documents/{other_org_doc_id}",
        "expected": (
            "1. Response: 403 Forbidden\n"
            "2. No document data returned\n"
            "3. Access restricted to own organization's documents"
        ),
        "criteria": "Pass: 403 returned. Fail: Other org's document accessible."
    },
]
test_cases.extend(access_cases)

# ============================================================================
# CATEGORY 12: SYSTEM HEALTH & VERSION (TC-270 to TC-275)
# ============================================================================

system_cases = [
    {
        "id": "TC-270", "name": "Health Check Endpoint", "category": "System Health",
        "priority": "P1 - Critical", "requirement": "FR-SYS-001",
        "prereqs": "System is running.",
        "steps": (
            "1. Send GET request to /api/health\n"
            "2. Observe the response"
        ),
        "data": "URL: GET /api/health",
        "expected": (
            "1. Response status: 200 OK\n"
            "2. Response body: {\"status\": \"healthy\", \"timestamp\": \"...\"}\n"
            "3. Timestamp is current"
        ),
        "criteria": "Pass: 200 with healthy status. Fail: Non-200 or unhealthy."
    },
    {
        "id": "TC-271", "name": "Version Endpoint", "category": "System Health",
        "priority": "P2 - High", "requirement": "FR-SYS-002",
        "prereqs": "System is running.",
        "steps": (
            "1. Send GET request to /api/version\n"
            "2. Observe the response"
        ),
        "data": "URL: GET /api/version",
        "expected": (
            "1. Response status: 200 OK\n"
            "2. Response body: {\"version\": \"3.0.0\", \"name\": \"Kuja Grant Management System\"}"
        ),
        "criteria": "Pass: Correct version returned. Fail: Wrong version or error."
    },
    {
        "id": "TC-272", "name": "Readiness Check", "category": "System Health",
        "priority": "P2 - High", "requirement": "FR-SYS-003",
        "prereqs": "System is running.",
        "steps": (
            "1. Send GET request to /api/ready\n"
            "2. Observe the response"
        ),
        "data": "URL: GET /api/ready",
        "expected": (
            "1. Response status: 200 OK\n"
            "2. Response body: {\"ready\": true, \"checks\": {\"database\": \"ok\", \"ai_service\": \"configured\"}}\n"
            "3. Both database and AI service checks pass"
        ),
        "criteria": "Pass: All readiness checks pass. Fail: Any check fails."
    },
    {
        "id": "TC-273", "name": "Telemetry Endpoint", "category": "System Health",
        "priority": "P3 - Low", "requirement": "FR-SYS-004",
        "prereqs": "System is running. User is logged in.",
        "steps": (
            "1. Login as any user\n"
            "2. Send POST /api/telemetry with event data:\n"
            "   {\"event\": \"page_view\", \"page\": \"dashboard\"}\n"
            "3. Observe response"
        ),
        "data": "API: POST /api/telemetry | Body: {\"event\": \"page_view\"}",
        "expected": (
            "1. Response status: 200 OK\n"
            "2. Event recorded (or acknowledged)\n"
            "3. No errors"
        ),
        "criteria": "Pass: 200 returned. Fail: Error response."
    },
    {
        "id": "TC-274", "name": "Security Headers Present", "category": "System Health",
        "priority": "P1 - Critical", "requirement": "FR-SYS-005",
        "prereqs": "System is running.",
        "steps": (
            "1. Send any API request (e.g., GET /api/health)\n"
            "2. Inspect the response headers\n"
            "3. Check for security headers"
        ),
        "data": "Any API endpoint response headers",
        "expected": (
            "1. Headers present:\n"
            "   - X-Content-Type-Options: nosniff\n"
            "   - X-Frame-Options: DENY or SAMEORIGIN\n"
            "   - Content-Security-Policy: defined\n"
            "   - X-XSS-Protection: 1; mode=block (or CSP equivalent)\n"
            "2. No Server header revealing technology details"
        ),
        "criteria": "Pass: All security headers present. Fail: Missing critical headers."
    },
    {
        "id": "TC-275", "name": "CORS Configuration", "category": "System Health",
        "priority": "P2 - High", "requirement": "FR-SYS-006",
        "prereqs": "System is running.",
        "steps": (
            "1. Send an OPTIONS preflight request from a different origin\n"
            "2. Check the CORS response headers\n"
            "3. Verify allowed origins"
        ),
        "data": "Cross-origin OPTIONS request",
        "expected": (
            "1. CORS headers present:\n"
            "   - Access-Control-Allow-Origin: appropriate value\n"
            "   - Access-Control-Allow-Methods: listed methods\n"
            "   - Access-Control-Allow-Headers: listed headers\n"
            "2. Not set to wildcard '*' in production"
        ),
        "criteria": "Pass: CORS properly configured. Fail: Missing CORS or too permissive."
    },
]
test_cases.extend(system_cases)

# ============================================================================
# CATEGORY 13: DOCUMENTS (TC-280 to TC-290)
# ============================================================================

doc_mgmt_cases = [
    {
        "id": "TC-280", "name": "View Documents List (NGO)", "category": "Documents",
        "priority": "P1 - Critical", "requirement": "FR-DOC-001",
        "prereqs": "Logged in as fatima@amani.org. Documents uploaded for Amani.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Navigate to Documents from sidebar\n"
            "3. Review the documents list"
        ),
        "data": "Email: fatima@amani.org",
        "expected": (
            "1. Documents page shows list of uploaded documents:\n"
            "   - amani_psea_policy_2024.pdf (AI Score: 88%)\n"
            "   - amani_audit_2024.pdf (AI Score: 78%)\n"
            "   - amani_registration_certificate.pdf (AI Score: 95%)\n"
            "   - amani_financial_2023-2025.pdf (AI Score: 82%)\n"
            "2. Each shows: filename, type, AI score, upload date\n"
            "3. AI score color-coded (green > 80, yellow 50-80, red < 50)"
        ),
        "criteria": "Pass: All documents listed with scores. Fail: Missing documents."
    },
    {
        "id": "TC-281", "name": "Upload New Document", "category": "Documents",
        "priority": "P1 - Critical", "requirement": "FR-DOC-002",
        "prereqs": "Logged in as NGO. Test file available.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Navigate to Documents\n"
            "3. Click 'Upload Document'\n"
            "4. Select document type: 'Strategic Plan'\n"
            "5. Choose file: valid_strategic_plan.pdf\n"
            "6. Click Upload\n"
            "7. Wait for upload and AI analysis"
        ),
        "data": "File: test-files-v3/valid_strategic_plan.pdf | Type: Strategic Plan",
        "expected": (
            "1. File uploads with progress indicator\n"
            "2. AI analysis runs automatically\n"
            "3. AI score displayed (expected 70-90)\n"
            "4. Document appears in documents list\n"
            "5. Type correctly categorized"
        ),
        "criteria": "Pass: Upload successful with AI analysis. Fail: Upload error."
    },
    {
        "id": "TC-282", "name": "Download Document", "category": "Documents",
        "priority": "P2 - High", "requirement": "FR-DOC-003",
        "prereqs": "Document uploaded and visible.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Navigate to Documents\n"
            "3. Click download icon on a document\n"
            "4. Verify file downloads"
        ),
        "data": "Any uploaded document",
        "expected": (
            "1. File downloads to browser\n"
            "2. Downloaded file matches uploaded content\n"
            "3. Correct filename and extension"
        ),
        "criteria": "Pass: File downloads correctly. Fail: Download fails or wrong file."
    },
    {
        "id": "TC-283", "name": "View Document AI Analysis Detail", "category": "Documents",
        "priority": "P2 - High", "requirement": "FR-DOC-004",
        "prereqs": "Document with AI analysis exists.",
        "steps": (
            "1. Click on a document with AI analysis\n"
            "2. View the analysis detail panel"
        ),
        "data": "Document with completed AI analysis",
        "expected": (
            "1. Analysis detail shows:\n"
            "   - Overall score with visual indicator\n"
            "   - Category-level scores\n"
            "   - Specific findings/observations\n"
            "   - Recommendations for improvement\n"
            "   - Analysis timestamp"
        ),
        "criteria": "Pass: Detailed analysis visible. Fail: Missing analysis data."
    },
    {
        "id": "TC-284", "name": "File Type Validation", "category": "Documents",
        "priority": "P1 - Critical", "requirement": "FR-DOC-005",
        "prereqs": "Logged in as NGO.",
        "steps": (
            "1. Try uploading each of these file types:\n"
            "   - .pdf (should accept)\n"
            "   - .doc (should accept)\n"
            "   - .docx (should accept)\n"
            "   - .xls (should accept)\n"
            "   - .xlsx (should accept)\n"
            "   - .txt (should accept)\n"
            "   - .csv (should accept)\n"
            "   - .exe (should reject)\n"
            "   - .html (should reject)\n"
            "   - .js (should reject)"
        ),
        "data": "Files with various extensions",
        "expected": (
            "1. PDF, DOC, DOCX, XLS, XLSX, TXT, CSV: accepted\n"
            "2. EXE, HTML, JS, and other types: rejected with 'File type not allowed'\n"
            "3. Validation happens client-side and server-side"
        ),
        "criteria": "Pass: Correct file types accepted/rejected. Fail: Wrong types accepted."
    },
    {
        "id": "TC-285", "name": "File Size Limit Enforcement", "category": "Documents",
        "priority": "P1 - Critical", "requirement": "FR-DOC-006",
        "prereqs": "Logged in as NGO.",
        "steps": (
            "1. Attempt to upload a file exceeding 10MB (or system max)\n"
            "2. Observe the response"
        ),
        "data": "File > 10MB",
        "expected": (
            "1. File rejected with size error\n"
            "2. Error message states maximum allowed size\n"
            "3. File not stored"
        ),
        "criteria": "Pass: Oversized file rejected. Fail: Large file accepted."
    },
]
test_cases.extend(doc_mgmt_cases)

# ============================================================================
# CATEGORY 14: ORGANIZATION PROFILE (TC-290 to TC-299)
# ============================================================================

org_cases = [
    {
        "id": "TC-290", "name": "View Organization Profile", "category": "Organization Profile",
        "priority": "P2 - High", "requirement": "FR-ORG-001",
        "prereqs": "Logged in as NGO user.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Navigate to Organization Profile (if available in sidebar)\n"
            "3. Review profile information"
        ),
        "data": "Email: fatima@amani.org",
        "expected": (
            "1. Profile displays:\n"
            "   - Organization name: Amani Community Development\n"
            "   - Country: Kenya\n"
            "   - Sectors: Health, WASH, Nutrition\n"
            "   - Assessment Score: 82%\n"
            "   - Registration status\n"
            "   - Contact information"
        ),
        "criteria": "Pass: Complete profile displayed. Fail: Missing information."
    },
    {
        "id": "TC-291", "name": "Donor Organization Search", "category": "Organization Profile",
        "priority": "P2 - High", "requirement": "FR-ORG-002",
        "prereqs": "Logged in as donor.",
        "steps": (
            "1. Login as sarah@globalhealth.org / pass123\n"
            "2. Navigate to Organizations\n"
            "3. Search for 'Amani'\n"
            "4. Review search results"
        ),
        "data": "Email: sarah@globalhealth.org | Search: 'Amani'",
        "expected": (
            "1. Search returns Amani Community Development\n"
            "2. Shows: name, country, sectors, capacity score\n"
            "3. Can click to view detailed profile\n"
            "4. Assessment scores visible to donor"
        ),
        "criteria": "Pass: Organization found with details. Fail: No results or missing data."
    },
    {
        "id": "TC-292", "name": "Organization Search by Country", "category": "Organization Profile",
        "priority": "P3 - Low", "requirement": "FR-ORG-003",
        "prereqs": "Logged in as donor.",
        "steps": (
            "1. Login as sarah@globalhealth.org / pass123\n"
            "2. Navigate to Organizations\n"
            "3. Filter by country: Kenya\n"
            "4. Review results"
        ),
        "data": "Filter: Country = Kenya",
        "expected": (
            "1. Only Kenyan organizations shown:\n"
            "   - Amani Community Development\n"
            "2. Non-Kenyan orgs filtered out"
        ),
        "criteria": "Pass: Only Kenyan orgs shown. Fail: Wrong country orgs included."
    },
]
test_cases.extend(org_cases)

# ============================================================================
# CATEGORY 15: END-TO-END WORKFLOWS (TC-300 to TC-310)
# ============================================================================

e2e_cases = [
    {
        "id": "TC-300", "name": "E2E: Complete Grant Lifecycle", "category": "End-to-End Workflows",
        "priority": "P1 - Critical", "requirement": "FR-E2E-001",
        "prereqs": "All seed data loaded. All test accounts available.",
        "steps": (
            "1. DONOR (sarah@globalhealth.org): Create a new grant\n"
            "   a. Fill basic info, eligibility, criteria (100% weight), documents, reporting\n"
            "   b. Upload grant agreement for AI extraction\n"
            "   c. Publish the grant\n\n"
            "2. NGO (fatima@amani.org): Apply for the grant\n"
            "   a. Complete eligibility checklist\n"
            "   b. Write proposal responses using AI Guidance\n"
            "   c. Upload required documents\n"
            "   d. Submit application\n\n"
            "3. DONOR (sarah@globalhealth.org): Assign reviewer\n"
            "   a. Change app status to 'under_review'\n"
            "   b. Assign james@reviewer.org\n\n"
            "4. REVIEWER (james@reviewer.org): Score application\n"
            "   a. Review all proposal responses\n"
            "   b. Use AI Auto-Score then adjust\n"
            "   c. Submit review\n\n"
            "5. DONOR: View rankings, award the grant\n\n"
            "6. NGO: Submit first report\n"
            "   a. Create financial report\n"
            "   b. Fill template sections\n"
            "   c. Submit -- AI analyzes against requirements\n\n"
            "7. DONOR: Review report\n"
            "   a. View AI analysis with per-requirement scores\n"
            "   b. Accept or request revision"
        ),
        "data": "Multiple accounts, grant agreement file, document files",
        "expected": (
            "1. Grant created and published\n"
            "2. Application submitted with AI score\n"
            "3. Reviewer assigned and scores submitted\n"
            "4. Final score calculated correctly\n"
            "5. Report submitted with AI analysis\n"
            "6. Donor can review and accept/revise report\n"
            "7. All status transitions recorded with timestamps"
        ),
        "criteria": "Pass: All steps complete without errors. Fail: Any step fails."
    },
    {
        "id": "TC-301", "name": "E2E: Due Diligence Workflow", "category": "End-to-End Workflows",
        "priority": "P1 - Critical", "requirement": "FR-E2E-002",
        "prereqs": "NGO with registration certificate. Admin access.",
        "steps": (
            "1. NGO (fatima@amani.org): Upload registration certificate\n"
            "2. SYSTEM: AI analyzes certificate content\n"
            "3. ADMIN (admin@kuja.org): View compliance dashboard\n"
            "4. ADMIN: Trigger registry verification for Kenya\n"
            "5. SYSTEM: Cross-checks against Kenya BRS portal\n"
            "6. ADMIN: Trigger sanctions screening\n"
            "7. SYSTEM: Screens against UN, OFAC, EU, World Bank\n"
            "8. DONOR (sarah@globalhealth.org): View compliance status"
        ),
        "data": "NGO: Amani (Kenya) | Registration cert | Admin and donor accounts",
        "expected": (
            "1. Certificate uploaded and AI analyzed\n"
            "2. Registry verification completes (Kenya BRS)\n"
            "3. Sanctions screening returns CLEAR\n"
            "4. Full compliance history visible\n"
            "5. Donor can see verification and screening results"
        ),
        "criteria": "Pass: Full due diligence workflow completes. Fail: Any check fails."
    },
    {
        "id": "TC-302", "name": "E2E: Assessment to Grant Matching", "category": "End-to-End Workflows",
        "priority": "P2 - High", "requirement": "FR-E2E-003",
        "prereqs": "NGO account. Open grants exist.",
        "steps": (
            "1. NGO (peter@hopebridges.org): Complete Kuja assessment\n"
            "2. Verify capacity score updates on profile\n"
            "3. Browse available grants\n"
            "4. Check if grants match org's sectors and capacity\n"
            "5. Apply for a matching grant\n"
            "6. Verify capacity score is factored into application"
        ),
        "data": "Email: peter@hopebridges.org | Framework: Kuja",
        "expected": (
            "1. Assessment completes, score saved to profile\n"
            "2. Grants filtered by relevance to org's sectors\n"
            "3. Application includes capacity score component\n"
            "4. Score visible to donors during review"
        ),
        "criteria": "Pass: Assessment feeds into grant application process. Fail: Score not reflected."
    },
    {
        "id": "TC-303", "name": "E2E: Multi-Language Workflow", "category": "End-to-End Workflows",
        "priority": "P2 - High", "requirement": "FR-E2E-004",
        "prereqs": "NGO account with French language preference.",
        "steps": (
            "1. Login as fatima@amani.org / pass123\n"
            "2. Switch language to French\n"
            "3. Navigate through:\n"
            "   - Dashboard (verify French text)\n"
            "   - Grants (verify French labels)\n"
            "   - Assessments (verify French checklist)\n"
            "   - AI Chat (ask question in French)\n"
            "4. Switch to Arabic\n"
            "5. Verify RTL layout throughout:\n"
            "   - Dashboard\n"
            "   - Grants\n"
            "   - Documents\n"
            "6. Switch back to English\n"
            "7. Verify clean LTR restoration"
        ),
        "data": "Languages: French, Arabic, English",
        "expected": (
            "1. French: all text translated, labels, buttons, messages\n"
            "2. Arabic: RTL layout throughout, all text Arabic\n"
            "3. English: clean return to LTR\n"
            "4. AI Chat responds in selected language\n"
            "5. No mixed-language artifacts"
        ),
        "criteria": "Pass: Clean language switching throughout. Fail: Mixed languages or layout issues."
    },
]
test_cases.extend(e2e_cases)


# ============================================================================
# ── BUILD THE WORD DOCUMENT ──────────────────────────────────────────────────
# ============================================================================

def build_document():
    doc = Document()

    # ── Page setup ──
    section = doc.sections[0]
    section.page_width = Cm(21)
    section.page_height = Cm(29.7)
    section.top_margin = Cm(2.54)
    section.bottom_margin = Cm(2.54)
    section.left_margin = Cm(2.54)
    section.right_margin = Cm(2.54)

    # ── Set default font ──
    style = doc.styles['Normal']
    font = style.font
    font.name = 'Calibri'
    font.size = Pt(10)

    # ── COVER PAGE ──
    for _ in range(6):
        doc.add_paragraph("")

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title.add_run("KUJA GRANT MANAGEMENT SYSTEM")
    run.bold = True
    run.font.size = Pt(28)
    run.font.color.rgb = RGBColor(26, 35, 126)

    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = subtitle.add_run("Version 3.0 - Test Cases Document")
    run.bold = True
    run.font.size = Pt(18)
    run.font.color.rgb = RGBColor(63, 81, 181)

    doc.add_paragraph("")

    meta = doc.add_paragraph()
    meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = meta.add_run(f"Date: {datetime.now().strftime('%B %d, %Y')}")
    run.font.size = Pt(12)
    run.font.color.rgb = RGBColor(100, 100, 100)

    meta2 = doc.add_paragraph()
    meta2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = meta2.add_run("Prepared for: Adeso / Kuja Link")
    run.font.size = Pt(12)
    run.font.color.rgb = RGBColor(100, 100, 100)

    meta3 = doc.add_paragraph()
    meta3.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = meta3.add_run(f"Total Test Cases: {len(test_cases)}")
    run.font.size = Pt(14)
    run.font.color.rgb = RGBColor(26, 35, 126)
    run.bold = True

    meta4 = doc.add_paragraph()
    meta4.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = meta4.add_run("Production URL: https://web-production-6f8a.up.railway.app")
    run.font.size = Pt(10)
    run.font.color.rgb = RGBColor(100, 100, 100)

    doc.add_page_break()

    # ── TABLE OF CONTENTS (manual) ──
    doc.add_heading("Table of Contents", level=1)

    categories = []
    seen = set()
    for tc in test_cases:
        cat = tc["category"]
        if cat not in seen:
            seen.add(cat)
            categories.append(cat)

    for i, cat in enumerate(categories, 1):
        count = sum(1 for tc in test_cases if tc["category"] == cat)
        p = doc.add_paragraph(f"{i}. {cat} ({count} test cases)")
        p.style = doc.styles['Normal']
        p.paragraph_format.space_after = Pt(2)

    p = doc.add_paragraph(f"{len(categories) + 1}. Test Summary & Traceability Matrix")
    p = doc.add_paragraph(f"{len(categories) + 2}. Test Account Reference")
    p = doc.add_paragraph(f"{len(categories) + 3}. Test Files Reference")

    doc.add_page_break()

    # ── DOCUMENT INFO ──
    doc.add_heading("Document Information", level=1)

    info_table = doc.add_table(rows=8, cols=2)
    info_table.style = 'Table Grid'
    info_data = [
        ("Document Title", "Kuja Grant Management System v3.0 - Test Cases"),
        ("Version", "3.0"),
        ("Date", datetime.now().strftime("%Y-%m-%d")),
        ("Author", "QA Team / Adeso"),
        ("Application", "Kuja Grant Management System"),
        ("Production URL", "https://web-production-6f8a.up.railway.app"),
        ("Technology Stack", "Python/Flask, Vanilla JS SPA, SQLite/PostgreSQL, Claude AI"),
        ("Total Test Cases", str(len(test_cases))),
    ]
    for i, (label, value) in enumerate(info_data):
        set_cell_shading(info_table.rows[i].cells[0], "E8EAF6")
        set_cell_text(info_table.rows[i].cells[0], label, bold=True, size=10)
        set_cell_text(info_table.rows[i].cells[1], value, size=10)

    doc.add_paragraph("")

    # Priority breakdown
    p1 = sum(1 for tc in test_cases if "P1" in tc["priority"])
    p2 = sum(1 for tc in test_cases if "P2" in tc["priority"])
    p3 = sum(1 for tc in test_cases if "P3" in tc["priority"])

    doc.add_heading("Priority Breakdown", level=2)
    prio_table = doc.add_table(rows=4, cols=3)
    prio_table.style = 'Table Grid'
    prio_data = [
        ("Priority", "Count", "Description"),
        ("P1 - Critical", str(p1), "Must-pass tests for core functionality"),
        ("P2 - High", str(p2), "Important tests for secondary functionality"),
        ("P3 - Low", str(p3), "Nice-to-have tests for edge cases"),
    ]
    for i, (col1, col2, col3) in enumerate(prio_data):
        if i == 0:
            set_cell_shading(prio_table.rows[i].cells[0], "1A237E")
            set_cell_shading(prio_table.rows[i].cells[1], "1A237E")
            set_cell_shading(prio_table.rows[i].cells[2], "1A237E")
            set_cell_text(prio_table.rows[i].cells[0], col1, bold=True, size=10, color=(255, 255, 255))
            set_cell_text(prio_table.rows[i].cells[1], col2, bold=True, size=10, color=(255, 255, 255))
            set_cell_text(prio_table.rows[i].cells[2], col3, bold=True, size=10, color=(255, 255, 255))
        else:
            set_cell_text(prio_table.rows[i].cells[0], col1, bold=True, size=10)
            set_cell_text(prio_table.rows[i].cells[1], col2, size=10, alignment=WD_ALIGN_PARAGRAPH.CENTER)
            set_cell_text(prio_table.rows[i].cells[2], col3, size=10)

    doc.add_page_break()

    # ── TEST ACCOUNT REFERENCE ──
    doc.add_heading("Test Account Reference", level=1)
    p = doc.add_paragraph("All passwords: pass123")
    p.runs[0].bold = True

    acct_table = doc.add_table(rows=11, cols=4)
    acct_table.style = 'Table Grid'
    acct_headers = ["Role", "Email", "Organization", "Country"]
    acct_data = [
        ("Admin", "admin@kuja.org", "System Admin", "N/A"),
        ("NGO", "fatima@amani.org", "Amani Community Development", "Kenya"),
        ("NGO", "ahmed@salamrelief.org", "Salam Relief Foundation", "Somalia"),
        ("NGO", "thandi@ubuntu.org", "Ubuntu Education Trust", "South Africa"),
        ("NGO", "peter@hopebridges.org", "Hope Bridges Initiative", "Uganda"),
        ("NGO", "aisha@sahelwomen.org", "Sahel Women's Network", "Nigeria"),
        ("Donor", "sarah@globalhealth.org", "Global Health Fund", "Switzerland"),
        ("Donor", "david@eatrust.org", "East Africa Development Trust", "Kenya"),
        ("Reviewer", "james@reviewer.org", "Independent Reviewer", "N/A"),
        ("Reviewer", "maria@reviewer.org", "Independent Reviewer", "N/A"),
    ]
    # Header row
    for j, h in enumerate(acct_headers):
        set_cell_shading(acct_table.rows[0].cells[j], "1A237E")
        set_cell_text(acct_table.rows[0].cells[j], h, bold=True, size=9, color=(255, 255, 255))
    # Data rows
    for i, (role, email, org, country) in enumerate(acct_data, 1):
        set_cell_text(acct_table.rows[i].cells[0], role, size=9)
        set_cell_text(acct_table.rows[i].cells[1], email, size=9)
        set_cell_text(acct_table.rows[i].cells[2], org, size=9)
        set_cell_text(acct_table.rows[i].cells[3], country, size=9)
        if i % 2 == 0:
            for j in range(4):
                set_cell_shading(acct_table.rows[i].cells[j], "F5F5F5")

    doc.add_page_break()

    # ── TEST FILES REFERENCE ──
    doc.add_heading("Test Files Reference", level=1)
    p = doc.add_paragraph("Location: test-files-v3/ directory")

    doc.add_heading("Positive Test Files", level=2)
    pos_files = [
        ("valid_financial_report.pdf", "Clean financial report with revenue, expenses, auditor notes"),
        ("valid_registration_cert.pdf", "Valid registration certificate (Kenya, expires 2027)"),
        ("valid_audit_report.pdf", "Independent audit report with unqualified opinion"),
        ("valid_psea_policy.pdf", "Comprehensive PSEA policy with all required sections"),
        ("valid_project_report.pdf", "Project report with indicators, progress, lessons learned"),
        ("valid_budget_detail.xlsx", "Detailed budget spreadsheet with formulas"),
        ("valid_strategic_plan.pdf", "Strategic plan with vision, mission, 3 goals"),
    ]
    for fname, desc in pos_files:
        p = doc.add_paragraph(style='List Bullet')
        run = p.add_run(fname)
        run.bold = True
        run.font.size = Pt(9)
        p.add_run(f" - {desc}").font.size = Pt(9)

    doc.add_heading("Negative Test Files", level=2)
    neg_files = [
        ("invalid_empty.pdf", "Valid PDF structure but no meaningful content"),
        ("invalid_wrong_extension.txt.pdf", "Text file with .pdf extension (not a real PDF)"),
        ("invalid_financial_incomplete.pdf", "Financial report missing auditor opinion and expense breakdown"),
        ("expired_registration.pdf", "Registration certificate expired 2023-06-30"),
        ("malicious_script.html", "HTML file - should be rejected by file type filter"),
    ]
    for fname, desc in neg_files:
        p = doc.add_paragraph(style='List Bullet')
        run = p.add_run(fname)
        run.bold = True
        run.font.size = Pt(9)
        p.add_run(f" - {desc}").font.size = Pt(9)

    doc.add_page_break()

    # ── TEST CASES BY CATEGORY ──
    current_category = None
    cat_num = 0

    for tc in test_cases:
        if tc["category"] != current_category:
            current_category = tc["category"]
            cat_num += 1
            if cat_num > 1:
                doc.add_page_break()

            # Category count
            cat_count = sum(1 for t in test_cases if t["category"] == current_category)
            cat_p1 = sum(1 for t in test_cases if t["category"] == current_category and "P1" in t["priority"])
            cat_p2 = sum(1 for t in test_cases if t["category"] == current_category and "P2" in t["priority"])
            cat_p3 = sum(1 for t in test_cases if t["category"] == current_category and "P3" in t["priority"])

            doc.add_heading(f"{cat_num}. {current_category}", level=1)

            summary = doc.add_paragraph()
            summary.add_run(f"Total: {cat_count} test cases").bold = True
            summary.add_run(f" | P1: {cat_p1} | P2: {cat_p2} | P3: {cat_p3}")
            doc.add_paragraph("")

        add_test_case_table(doc, tc)

    # ── TRACEABILITY MATRIX ──
    doc.add_page_break()
    doc.add_heading("Traceability Matrix", level=1)
    p = doc.add_paragraph("This matrix maps test cases to functional requirements.")

    # Create traceability table
    trace_table = doc.add_table(rows=1, cols=4)
    trace_table.style = 'Table Grid'
    headers = ["Requirement ID", "Requirement Area", "Test Cases", "Coverage"]
    for j, h in enumerate(headers):
        set_cell_shading(trace_table.rows[0].cells[j], "1A237E")
        set_cell_text(trace_table.rows[0].cells[j], h, bold=True, size=9, color=(255, 255, 255))

    req_map = {
        "FR-AUTH": ("Authentication & Session Management", [tc["id"] for tc in test_cases if tc["category"] == "Authentication"]),
        "FR-DASH": ("Dashboard & Navigation", [tc["id"] for tc in test_cases if tc["category"] == "Dashboard"]),
        "FR-GRNT": ("Grant Management", [tc["id"] for tc in test_cases if tc["category"] == "Grants"]),
        "FR-APPL": ("Application Workflow", [tc["id"] for tc in test_cases if tc["category"] == "Applications"]),
        "FR-ASMT": ("Capacity Assessment", [tc["id"] for tc in test_cases if tc["category"] == "Assessments"]),
        "FR-AI": ("AI Services & Analysis", [tc["id"] for tc in test_cases if tc["category"] == "AI Services"]),
        "FR-COMP": ("Compliance & Sanctions", [tc["id"] for tc in test_cases if tc["category"] == "Compliance & Sanctions"]),
        "FR-REG": ("Registry Verification", [tc["id"] for tc in test_cases if tc["category"] == "Registry Verification"]),
        "FR-RPT": ("Reports & Deadlines", [tc["id"] for tc in test_cases if tc["category"] == "Reports"]),
        "FR-I18N": ("Internationalization & i18n", [tc["id"] for tc in test_cases if tc["category"] == "Internationalization"]),
        "FR-RBAC": ("Role-Based Access Control", [tc["id"] for tc in test_cases if tc["category"] == "Access Control"]),
        "FR-SYS": ("System Health & Infrastructure", [tc["id"] for tc in test_cases if tc["category"] == "System Health"]),
        "FR-DOC": ("Document Management", [tc["id"] for tc in test_cases if tc["category"] == "Documents"]),
        "FR-ORG": ("Organization Profiles", [tc["id"] for tc in test_cases if tc["category"] == "Organization Profile"]),
        "FR-E2E": ("End-to-End Workflows", [tc["id"] for tc in test_cases if tc["category"] == "End-to-End Workflows"]),
    }

    for req_id, (area, tcs) in req_map.items():
        row = trace_table.add_row()
        set_cell_text(row.cells[0], req_id, bold=True, size=8)
        set_cell_text(row.cells[1], area, size=8)
        set_cell_text(row.cells[2], ", ".join(tcs), size=7)
        set_cell_text(row.cells[3], f"{len(tcs)} tests", size=8, alignment=WD_ALIGN_PARAGRAPH.CENTER)

    doc.add_paragraph("")

    # ── SUMMARY TABLE ──
    doc.add_heading("Test Summary", level=1)

    sum_table = doc.add_table(rows=1, cols=5)
    sum_table.style = 'Table Grid'
    sum_headers = ["Category", "Total", "P1", "P2", "P3"]
    for j, h in enumerate(sum_headers):
        set_cell_shading(sum_table.rows[0].cells[j], "1A237E")
        set_cell_text(sum_table.rows[0].cells[j], h, bold=True, size=9, color=(255, 255, 255))

    total_all = 0
    total_p1 = 0
    total_p2 = 0
    total_p3 = 0

    for cat in categories:
        cat_total = sum(1 for tc in test_cases if tc["category"] == cat)
        cat_p1 = sum(1 for tc in test_cases if tc["category"] == cat and "P1" in tc["priority"])
        cat_p2 = sum(1 for tc in test_cases if tc["category"] == cat and "P2" in tc["priority"])
        cat_p3 = sum(1 for tc in test_cases if tc["category"] == cat and "P3" in tc["priority"])

        total_all += cat_total
        total_p1 += cat_p1
        total_p2 += cat_p2
        total_p3 += cat_p3

        row = sum_table.add_row()
        set_cell_text(row.cells[0], cat, bold=True, size=9)
        set_cell_text(row.cells[1], str(cat_total), size=9, alignment=WD_ALIGN_PARAGRAPH.CENTER)
        set_cell_text(row.cells[2], str(cat_p1), size=9, alignment=WD_ALIGN_PARAGRAPH.CENTER)
        set_cell_text(row.cells[3], str(cat_p2), size=9, alignment=WD_ALIGN_PARAGRAPH.CENTER)
        set_cell_text(row.cells[4], str(cat_p3), size=9, alignment=WD_ALIGN_PARAGRAPH.CENTER)

    # Total row
    row = sum_table.add_row()
    for j in range(5):
        set_cell_shading(row.cells[j], "E8EAF6")
    set_cell_text(row.cells[0], "TOTAL", bold=True, size=10)
    set_cell_text(row.cells[1], str(total_all), bold=True, size=10, alignment=WD_ALIGN_PARAGRAPH.CENTER)
    set_cell_text(row.cells[2], str(total_p1), bold=True, size=10, alignment=WD_ALIGN_PARAGRAPH.CENTER)
    set_cell_text(row.cells[3], str(total_p2), bold=True, size=10, alignment=WD_ALIGN_PARAGRAPH.CENTER)
    set_cell_text(row.cells[4], str(total_p3), bold=True, size=10, alignment=WD_ALIGN_PARAGRAPH.CENTER)

    # ── SAVE ──
    output_path = r"C:\Users\IdirisLoyan\kuja-grant\docs\Kuja_Grant_v3.0_Test_Cases.docx"
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    doc.save(output_path)
    print(f"Document saved to: {output_path}")
    print(f"Total test cases: {len(test_cases)}")
    print(f"P1: {total_p1}, P2: {total_p2}, P3: {total_p3}")
    print(f"Categories: {len(categories)}")


if __name__ == "__main__":
    build_document()
