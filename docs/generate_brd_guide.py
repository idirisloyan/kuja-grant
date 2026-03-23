"""
Generate Kuja Grant Management System - Business Requirements & User Guide
Version 3.0.0 - March 2026
"""

from docx import Document
from docx.shared import Inches, Pt, Cm, RGBColor, Emu
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.section import WD_ORIENT
from docx.oxml.ns import qn, nsdecls
from docx.oxml import parse_xml
import os

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def set_cell_shading(cell, color_hex):
    """Set background shading on a table cell."""
    shading = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{color_hex}"/>')
    cell._tc.get_or_add_tcPr().append(shading)


def set_cell_border(cell, **kwargs):
    """Set cell borders. kwargs keys: top, bottom, left, right, insideH, insideV."""
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcBorders = parse_xml(f'<w:tcBorders {nsdecls("w")}></w:tcBorders>')
    for edge, val in kwargs.items():
        element = parse_xml(
            f'<w:{edge} {nsdecls("w")} w:val="{val["val"]}" '
            f'w:sz="{val["sz"]}" w:space="0" w:color="{val["color"]}"/>'
        )
        tcBorders.append(element)
    tcPr.append(tcBorders)


def add_formatted_table(doc, headers, rows, col_widths=None, header_color="1B3A5C"):
    """Add a professionally formatted table."""
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = "Table Grid"

    # Header row
    hdr_cells = table.rows[0].cells
    for i, header in enumerate(headers):
        hdr_cells[i].text = ""
        p = hdr_cells[i].paragraphs[0]
        run = p.add_run(header)
        run.bold = True
        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        run.font.size = Pt(9)
        run.font.name = "Calibri"
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        set_cell_shading(hdr_cells[i], header_color)

    # Data rows
    for r_idx, row_data in enumerate(rows):
        row_cells = table.rows[r_idx + 1].cells
        stripe = "F2F6FA" if r_idx % 2 == 0 else "FFFFFF"
        for c_idx, cell_text in enumerate(row_data):
            row_cells[c_idx].text = ""
            p = row_cells[c_idx].paragraphs[0]
            run = p.add_run(str(cell_text))
            run.font.size = Pt(9)
            run.font.name = "Calibri"
            set_cell_shading(row_cells[c_idx], stripe)

    # Column widths
    if col_widths:
        for row in table.rows:
            for i, width in enumerate(col_widths):
                row.cells[i].width = Inches(width)

    return table


def add_bullet_list(doc, items, bold_prefix=None, level=0):
    """Add a bulleted list. If bold_prefix is provided, each item is (prefix, text)."""
    for item in items:
        p = doc.add_paragraph(style="List Bullet")
        p.paragraph_format.left_indent = Inches(0.5 + level * 0.25)
        p.paragraph_format.space_after = Pt(2)
        if isinstance(item, tuple):
            run_b = p.add_run(item[0])
            run_b.bold = True
            run_b.font.size = Pt(10)
            run_b.font.name = "Calibri"
            run_n = p.add_run(item[1])
            run_n.font.size = Pt(10)
            run_n.font.name = "Calibri"
        else:
            run = p.add_run(str(item))
            run.font.size = Pt(10)
            run.font.name = "Calibri"


def add_numbered_list(doc, items):
    """Add a numbered list."""
    for i, item in enumerate(items, 1):
        p = doc.add_paragraph(style="List Number")
        p.paragraph_format.left_indent = Inches(0.5)
        p.paragraph_format.space_after = Pt(2)
        if isinstance(item, tuple):
            run_b = p.add_run(item[0])
            run_b.bold = True
            run_b.font.size = Pt(10)
            run_b.font.name = "Calibri"
            run_n = p.add_run(item[1])
            run_n.font.size = Pt(10)
            run_n.font.name = "Calibri"
        else:
            run = p.add_run(str(item))
            run.font.size = Pt(10)
            run.font.name = "Calibri"


def add_body(doc, text):
    """Add a normal paragraph."""
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.font.size = Pt(10)
    run.font.name = "Calibri"
    p.paragraph_format.space_after = Pt(6)
    return p


def add_body_bold_start(doc, bold_text, normal_text):
    """Add a paragraph with bold prefix."""
    p = doc.add_paragraph()
    run_b = p.add_run(bold_text)
    run_b.bold = True
    run_b.font.size = Pt(10)
    run_b.font.name = "Calibri"
    run_n = p.add_run(normal_text)
    run_n.font.size = Pt(10)
    run_n.font.name = "Calibri"
    p.paragraph_format.space_after = Pt(6)
    return p


def heading(doc, text, level=1):
    """Add a heading with custom formatting."""
    h = doc.add_heading(text, level=level)
    for run in h.runs:
        run.font.name = "Calibri"
        if level == 1:
            run.font.color.rgb = RGBColor(0x1B, 0x3A, 0x5C)
            run.font.size = Pt(18)
        elif level == 2:
            run.font.color.rgb = RGBColor(0x1B, 0x3A, 0x5C)
            run.font.size = Pt(14)
        elif level == 3:
            run.font.color.rgb = RGBColor(0x2C, 0x5F, 0x8A)
            run.font.size = Pt(12)
    return h


# ---------------------------------------------------------------------------
# Build Document
# ---------------------------------------------------------------------------

doc = Document()

# -- Default style adjustments --
style = doc.styles["Normal"]
font = style.font
font.name = "Calibri"
font.size = Pt(10)
style.paragraph_format.space_after = Pt(6)
style.paragraph_format.line_spacing = 1.15

# Heading styles
for lvl in range(1, 4):
    hs = doc.styles[f"Heading {lvl}"]
    hs.font.name = "Calibri"
    if lvl == 1:
        hs.font.size = Pt(18)
        hs.font.color.rgb = RGBColor(0x1B, 0x3A, 0x5C)
        hs.paragraph_format.space_before = Pt(18)
        hs.paragraph_format.space_after = Pt(8)
    elif lvl == 2:
        hs.font.size = Pt(14)
        hs.font.color.rgb = RGBColor(0x1B, 0x3A, 0x5C)
        hs.paragraph_format.space_before = Pt(14)
        hs.paragraph_format.space_after = Pt(6)
    elif lvl == 3:
        hs.font.size = Pt(12)
        hs.font.color.rgb = RGBColor(0x2C, 0x5F, 0x8A)
        hs.paragraph_format.space_before = Pt(10)
        hs.paragraph_format.space_after = Pt(4)

# Set page margins
for section in doc.sections:
    section.top_margin = Cm(2.54)
    section.bottom_margin = Cm(2.54)
    section.left_margin = Cm(2.54)
    section.right_margin = Cm(2.54)

# ===========================================================================
# COVER PAGE
# ===========================================================================

# Top spacer
for _ in range(6):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(0)

# Decorative top line
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = p.add_run("_" * 60)
run.font.color.rgb = RGBColor(0x1B, 0x3A, 0x5C)
run.font.size = Pt(14)

# Title
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(24)
run = p.add_run("Kuja Grant Management System")
run.bold = True
run.font.size = Pt(28)
run.font.color.rgb = RGBColor(0x1B, 0x3A, 0x5C)
run.font.name = "Calibri"

# Subtitle
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(8)
run = p.add_run("Business Requirements & User Guide")
run.font.size = Pt(20)
run.font.color.rgb = RGBColor(0x2C, 0x5F, 0x8A)
run.font.name = "Calibri"

# Decorative bottom line
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(12)
run = p.add_run("_" * 60)
run.font.color.rgb = RGBColor(0x1B, 0x3A, 0x5C)
run.font.size = Pt(14)

# Spacer
for _ in range(3):
    doc.add_paragraph()

# Metadata table (centered)
meta_table = doc.add_table(rows=5, cols=2)
meta_table.alignment = WD_TABLE_ALIGNMENT.CENTER
meta_data = [
    ("Version", "3.0.0"),
    ("Date", "March 2026"),
    ("Classification", "Internal Use"),
    ("Organization", "Adeso / Kuja Link"),
    ("Document ID", "KUJA-BRD-UG-3.0"),
]
for i, (label, value) in enumerate(meta_data):
    cell_l = meta_table.rows[i].cells[0]
    cell_l.text = ""
    p = cell_l.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = p.add_run(label + ":")
    run.bold = True
    run.font.size = Pt(11)
    run.font.name = "Calibri"
    run.font.color.rgb = RGBColor(0x1B, 0x3A, 0x5C)
    cell_l.width = Inches(2.5)

    cell_r = meta_table.rows[i].cells[1]
    cell_r.text = ""
    p = cell_r.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    run = p.add_run("  " + value)
    run.font.size = Pt(11)
    run.font.name = "Calibri"
    cell_r.width = Inches(3.0)

# Remove table borders for cover metadata
for row in meta_table.rows:
    for cell in row.cells:
        tc = cell._tc
        tcPr = tc.get_or_add_tcPr()
        tcBorders = parse_xml(
            f'<w:tcBorders {nsdecls("w")}>'
            f'<w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
            f'<w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
            f'<w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
            f'<w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
            f'</w:tcBorders>'
        )
        tcPr.append(tcBorders)

doc.add_page_break()

# ===========================================================================
# DOCUMENT CONTROL
# ===========================================================================

heading(doc, "Document Control", 1)

heading(doc, "Revision History", 2)
add_formatted_table(doc,
    ["Version", "Date", "Author", "Description"],
    [
        ["1.0", "January 2026", "Kuja Team", "Initial release - core grant lifecycle"],
        ["2.0", "February 2026", "Kuja Team", "Added AI services, capacity assessment, sanctions screening"],
        ["3.0", "March 2026", "Kuja Team", "Production upgrade: live sanctions, registry verification, AI reporting, donor requirements, comprehensive user guide"],
    ],
    col_widths=[0.8, 1.2, 1.2, 3.3]
)

doc.add_paragraph()
heading(doc, "Approval", 2)
add_formatted_table(doc,
    ["Role", "Name", "Signature", "Date"],
    [
        ["Project Sponsor", "", "", ""],
        ["Product Owner", "", "", ""],
        ["Technical Lead", "", "", ""],
        ["QA Lead", "", "", ""],
    ],
    col_widths=[1.5, 2.0, 1.8, 1.2]
)

doc.add_page_break()

# ===========================================================================
# TABLE OF CONTENTS
# ===========================================================================

heading(doc, "Table of Contents", 1)

toc_entries = [
    ("PART 1: BUSINESS REQUIREMENTS", 0),
    ("1. Introduction", 0),
    ("    1.1 Purpose", 1),
    ("    1.2 Scope", 1),
    ("    1.3 Target Users", 1),
    ("2. Functional Requirements", 0),
    ("    2.1 Authentication & User Management", 1),
    ("    2.2 Grant Management", 1),
    ("    2.3 Application Management", 1),
    ("    2.4 Assessment", 1),
    ("    2.5 Document Management", 1),
    ("    2.6 AI Services", 1),
    ("    2.7 Compliance & Sanctions", 1),
    ("    2.8 Registry Verification", 1),
    ("    2.9 Reporting", 1),
    ("    2.10 Internationalization", 1),
    ("3. Non-Functional Requirements", 0),
    ("PART 2: USER GUIDE", 0),
    ("4. Getting Started", 0),
    ("    4.1 Accessing the System", 1),
    ("    4.2 Logging In", 1),
    ("    4.3 Changing Language", 1),
    ("5. NGO User Guide", 0),
    ("    5.1 Dashboard Overview", 1),
    ("    5.2 Browsing and Applying for Grants", 1),
    ("    5.3 Grant Application Wizard", 1),
    ("    5.4 Tracking Applications", 1),
    ("    5.5 Capacity Assessment", 1),
    ("    5.6 Submitting Reports", 1),
    ("    5.7 Using AI Assistant", 1),
    ("6. Donor User Guide", 0),
    ("    6.1 Dashboard Overview", 1),
    ("    6.2 Creating a Grant (6-Step Wizard)", 1),
    ("    6.3 Managing Applications", 1),
    ("    6.4 Reviewing Reports", 1),
    ("    6.5 Compliance Screening", 1),
    ("7. Reviewer User Guide", 0),
    ("    7.1 Dashboard Overview", 1),
    ("    7.2 Reviewing Applications", 1),
    ("    7.3 Using AI Auto-Score", 1),
    ("8. Admin User Guide", 0),
    ("    8.1 Dashboard Overview", 1),
    ("    8.2 User Management", 1),
    ("    8.3 Organization Management", 1),
    ("    8.4 System Health", 1),
    ("APPENDICES", 0),
    ("    A. Keyboard Shortcuts", 1),
    ("    B. Supported File Types", 1),
    ("    C. Status Definitions", 1),
    ("    D. Glossary", 1),
]

for entry, level in toc_entries:
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(1)
    p.paragraph_format.space_before = Pt(1)
    run = p.add_run(entry)
    run.font.size = Pt(10)
    run.font.name = "Calibri"
    if level == 0:
        run.bold = True
        run.font.color.rgb = RGBColor(0x1B, 0x3A, 0x5C)
    else:
        run.font.color.rgb = RGBColor(0x33, 0x33, 0x33)

doc.add_page_break()

# ===========================================================================
# PART 1: BUSINESS REQUIREMENTS
# ===========================================================================

# Part 1 banner
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(72)
p.paragraph_format.space_after = Pt(12)
run = p.add_run("PART 1")
run.bold = True
run.font.size = Pt(32)
run.font.color.rgb = RGBColor(0x1B, 0x3A, 0x5C)
run.font.name = "Calibri"

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_after = Pt(6)
run = p.add_run("BUSINESS REQUIREMENTS")
run.font.size = Pt(22)
run.font.color.rgb = RGBColor(0x2C, 0x5F, 0x8A)
run.font.name = "Calibri"

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = p.add_run("_" * 50)
run.font.color.rgb = RGBColor(0x1B, 0x3A, 0x5C)

doc.add_page_break()

# ---- 1. Introduction ----
heading(doc, "1. Introduction", 1)

heading(doc, "1.1 Purpose", 2)
add_body(doc,
    "Kuja Grant Management System automates the full grant lifecycle for humanitarian "
    "organizations in East Africa and beyond. It connects NGOs, donors, and reviewers on a "
    "single platform with AI-powered assistance, enabling streamlined grant publishing, "
    "application management, capacity assessment, compliance screening, and reporting."
)
add_body(doc,
    "The system is designed to reduce administrative burden, improve transparency, and "
    "accelerate funding decisions for organizations operating in complex humanitarian "
    "environments. By integrating artificial intelligence throughout the workflow, Kuja "
    "provides intelligent document analysis, automated scoring, and real-time compliance "
    "verification that would otherwise require significant manual effort."
)

heading(doc, "1.2 Scope", 2)
add_body(doc, "The Kuja Grant Management System covers the following functional areas:")
add_bullet_list(doc, [
    "Grant creation, publishing, and lifecycle management",
    "Application submission, scoring, and tracking",
    "Multi-framework capacity assessment (5 frameworks, 118+ checklist items)",
    "AI-powered document analysis with per-requirement scoring",
    "Live sanctions screening against UN, OFAC, EU, and World Bank lists",
    "Government registry verification for 7 African countries",
    "NGO reporting with AI compliance evaluation and risk flagging",
    "Multi-language support (English, Arabic, French, Spanish) with RTL layout for Arabic",
    "Role-based access for NGOs, Donors, Reviewers, and Administrators",
])

heading(doc, "1.3 Target Users", 2)
add_body(doc, "The system serves four distinct user roles, each with dedicated portal functionality:")

add_formatted_table(doc,
    ["Role", "Description", "Key Responsibilities"],
    [
        ["NGO Staff", "Staff members of non-governmental organizations seeking grant funding",
         "Apply for grants, submit reports, complete capacity assessments, upload documents"],
        ["Donor Program Officers", "Representatives of funding organizations managing grant programs",
         "Create and publish grants, review applications, evaluate reports, configure compliance screening"],
        ["Independent Reviewers", "Subject matter experts assigned to evaluate applications",
         "Score applications against criteria, provide expert feedback, use AI-assisted scoring"],
        ["System Administrators", "Platform administrators responsible for system operations",
         "Manage users and organizations, monitor compliance flags, maintain system health"],
    ],
    col_widths=[1.5, 2.5, 2.5]
)

doc.add_page_break()

# ---- 2. Functional Requirements ----
heading(doc, "2. Functional Requirements", 1)

# 2.1 Authentication
heading(doc, "2.1 Authentication & User Management", 2)
add_body(doc, "The authentication module provides secure access control and user lifecycle management.")

add_formatted_table(doc,
    ["ID", "Requirement", "Priority"],
    [
        ["FR-001", "System shall support email/password authentication with secure password hashing (bcrypt)", "Must"],
        ["FR-002", "System shall enforce rate limiting: 5 failed login attempts trigger 30-minute lockout", "Must"],
        ["FR-003", "System shall support 4 user roles: NGO, Donor, Reviewer, Admin with role-based access", "Must"],
        ["FR-004", "System shall allow language preference selection (EN, AR, FR, ES) persisted to user profile", "Should"],
        ["FR-005", "System shall support account activation/deactivation by administrators", "Must"],
    ],
    col_widths=[0.8, 4.7, 1.0]
)

doc.add_paragraph()

# 2.2 Grant Management
heading(doc, "2.2 Grant Management", 2)
add_body(doc, "Grant management enables donors to create, configure, and publish funding opportunities through a structured 6-step wizard process.")

add_formatted_table(doc,
    ["ID", "Requirement", "Priority"],
    [
        ["FR-010", "Donors shall create grants using a 6-step wizard: Basic Info, Eligibility, Evaluation Criteria, Documents, Reporting, Review", "Must"],
        ["FR-011", "Grants shall include eligibility requirements, weighted evaluation criteria, document requirements, and reporting configuration", "Must"],
        ["FR-012", "System shall support grant statuses: Draft, Open, Review, Closed, Awarded", "Must"],
        ["FR-013", "Donors shall publish grants to make them discoverable by NGOs", "Must"],
        ["FR-014", "System shall support grant agreement document upload with AI extraction of reporting requirements", "Should"],
        ["FR-015", "Total funding amount shall use financial precision (Numeric 12,2) with currency selection", "Must"],
    ],
    col_widths=[0.8, 4.7, 1.0]
)

doc.add_paragraph()

# 2.3 Application Management
heading(doc, "2.3 Application Management", 2)
add_body(doc, "Application management provides NGOs with a guided process to apply for grants and enables donors and reviewers to evaluate submissions.")

add_formatted_table(doc,
    ["ID", "Requirement", "Priority"],
    [
        ["FR-020", "NGOs shall apply for grants via a 4-step wizard: Eligibility Check, Proposal Response, Document Upload, Review & Submit", "Must"],
        ["FR-021", "System shall enforce one application per NGO per grant (unique constraint)", "Must"],
        ["FR-022", "Applications shall support draft saving, allowing NGOs to return and complete later", "Must"],
        ["FR-023", "System shall provide automatic AI scoring upon application submission", "Should"],
        ["FR-024", "Donors shall assign independent reviewers to applications from the reviewer pool", "Must"],
        ["FR-025", "System shall calculate final score: (Criteria x 60%) + (Documents x 20%) + (Eligibility x 20%)", "Must"],
    ],
    col_widths=[0.8, 4.7, 1.0]
)

doc.add_paragraph()

# 2.4 Assessment
heading(doc, "2.4 Capacity Assessment", 2)
add_body(doc, "The capacity assessment module enables NGOs to evaluate their organizational readiness using internationally recognized frameworks.")

add_formatted_table(doc,
    ["ID", "Requirement", "Priority"],
    [
        ["FR-030", "System shall support 5 capacity assessment frameworks: Kuja, STEP, UN-HACT, CHS, NUPAS", "Must"],
        ["FR-031", "Each framework shall have weighted categories with checklist items (118 total items across all frameworks)", "Must"],
        ["FR-032", "System shall calculate category scores and overall capacity score based on weighted checklist completion", "Must"],
        ["FR-033", "System shall identify capacity gaps and generate actionable recommendations", "Should"],
        ["FR-034", "Assessment results shall automatically update the organization profile capacity score", "Must"],
    ],
    col_widths=[0.8, 4.7, 1.0]
)

doc.add_paragraph()

# Framework details table
heading(doc, "Assessment Framework Summary", 3)
add_formatted_table(doc,
    ["Framework", "Categories", "Items", "Focus Area"],
    [
        ["Kuja", "5", "26", "Custom humanitarian capacity framework for East Africa"],
        ["STEP", "5", "26", "Strengthening Technical Excellence in Partner organizations"],
        ["UN-HACT", "5", "22", "UN Harmonized Approach to Cash Transfers"],
        ["CHS", "7", "27", "Core Humanitarian Standard on Quality and Accountability"],
        ["NUPAS", "5", "26", "National NGO Assessment for organizational capacity"],
    ],
    col_widths=[1.2, 1.2, 0.8, 3.3]
)

doc.add_paragraph()

# 2.5 Document Management
heading(doc, "2.5 Document Management", 2)
add_body(doc, "Document management provides secure file handling with AI-powered analysis for grant applications and compliance.")

add_formatted_table(doc,
    ["ID", "Requirement", "Priority"],
    [
        ["FR-040", "System shall accept PDF, DOCX, XLSX, CSV, PNG, JPG, and TXT file formats", "Must"],
        ["FR-041", "Maximum file size shall be 16 MB per upload", "Must"],
        ["FR-042", "System shall validate file type via both extension check and magic bytes verification", "Must"],
        ["FR-043", "AI shall analyze uploaded documents against donor-specific requirements with per-requirement scoring", "Should"],
        ["FR-044", "Each document shall receive an AI quality score (0-100) with detailed feedback", "Should"],
    ],
    col_widths=[0.8, 4.7, 1.0]
)

doc.add_page_break()

# 2.6 AI Services
heading(doc, "2.6 AI Services", 2)
add_body(doc,
    "The Kuja system integrates Anthropic Claude AI to provide intelligent assistance across "
    "multiple workflows. AI services enhance document analysis, provide role-aware guidance, "
    "and automate compliance evaluation."
)

add_formatted_table(doc,
    ["ID", "Requirement", "Priority"],
    [
        ["FR-050", "System shall provide AI-powered document analysis with per-requirement scoring against donor criteria", "Must"],
        ["FR-051", "System shall provide an AI chat assistant with role-aware guidance (contextual to user role and current workflow)", "Should"],
        ["FR-052", "System shall provide field-level writing guidance for proposal responses and report sections", "Should"],
        ["FR-053", "System shall extract reporting requirements, deadlines, and risk areas from grant agreement PDFs", "Should"],
        ["FR-054", "System shall analyze submitted reports for compliance against extracted grant requirements", "Should"],
        ["FR-055", "AI shall respond in the user's selected language (EN, AR, FR, ES)", "Should"],
        ["FR-056", "System shall provide template-based fallback responses when the AI API is unavailable", "Must"],
    ],
    col_widths=[0.8, 4.7, 1.0]
)

doc.add_paragraph()

# 2.7 Compliance & Sanctions
heading(doc, "2.7 Compliance & Sanctions Screening", 2)
add_body(doc,
    "The compliance module provides automated sanctions screening to ensure organizations "
    "receiving funding are not on international sanctions lists. The system uses a multi-tier "
    "approach with live API checks and fallback mechanisms."
)

add_formatted_table(doc,
    ["ID", "Requirement", "Priority"],
    [
        ["FR-060", "System shall screen organizations against UN, OFAC, EU, and World Bank sanctions lists", "Must"],
        ["FR-061", "Primary screening via OpenSanctions API with fallback to direct list downloads (UN XML, OFAC CSV, EU CSV)", "Must"],
        ["FR-062", "Fuzzy name matching with configurable similarity threshold (default: 0.75)", "Must"],
        ["FR-063", "System shall flag organizations with potential sanctions matches and provide match details", "Must"],
        ["FR-064", "System shall support personnel screening (individual names in addition to organization names)", "Should"],
    ],
    col_widths=[0.8, 4.7, 1.0]
)

doc.add_paragraph()

# 2.8 Registry Verification
heading(doc, "2.8 Government Registry Verification", 2)
add_body(doc,
    "Registry verification validates NGO registration status against government databases "
    "in 7 African countries, providing varying levels of automated verification depending on "
    "registry availability."
)

add_formatted_table(doc,
    ["ID", "Requirement", "Priority"],
    [
        ["FR-070", "System shall verify NGO registration against government registries for 7 African countries", "Must"],
        ["FR-071", "Live API verification for South Africa (DSD NPO Registry) and Uganda (NGO Bureau)", "Must"],
        ["FR-072", "Portal accessibility checks with redirect links for Nigeria, Kenya, and Tanzania", "Should"],
        ["FR-073", "Manual verification guidance with authority contact information for Somalia and Ethiopia", "Should"],
    ],
    col_widths=[0.8, 4.7, 1.0]
)

doc.add_paragraph()

# Country verification summary
heading(doc, "Registry Verification by Country", 3)
add_formatted_table(doc,
    ["Country", "Verification Method", "Registry Source", "Automation Level"],
    [
        ["South Africa", "Live API", "DSD NPO Registry", "Full"],
        ["Uganda", "Live API", "NGO Bureau", "Full"],
        ["Kenya", "Portal Check", "NGO Coordination Board", "Partial"],
        ["Nigeria", "Portal Check", "CAC Portal", "Partial"],
        ["Tanzania", "Portal Check", "RITA", "Partial"],
        ["Somalia", "Manual Guidance", "Ministry of Interior", "Manual"],
        ["Ethiopia", "Manual Guidance", "ACSO", "Manual"],
    ],
    col_widths=[1.3, 1.5, 2.0, 1.7]
)

doc.add_page_break()

# 2.9 Reporting
heading(doc, "2.9 Reporting", 2)
add_body(doc,
    "The reporting module enables structured grant reporting with AI-assisted compliance "
    "evaluation, allowing donors to track NGO performance against grant requirements."
)

add_formatted_table(doc,
    ["ID", "Requirement", "Priority"],
    [
        ["FR-080", "NGOs shall submit grant reports of 5 types: financial, narrative, impact, progress, and final", "Must"],
        ["FR-081", "Report templates shall be configured per grant by donors during grant creation", "Must"],
        ["FR-082", "System shall track upcoming report deadlines and display them on the NGO dashboard", "Must"],
        ["FR-083", "AI shall analyze submitted reports against donor requirements with per-requirement compliance scoring", "Should"],
        ["FR-084", "Donors shall review reports with options to accept or request revision with notes", "Must"],
        ["FR-085", "System shall generate risk flags for reports that are deficient in specific requirement areas", "Should"],
    ],
    col_widths=[0.8, 4.7, 1.0]
)

doc.add_paragraph()

# 2.10 Internationalization
heading(doc, "2.10 Internationalization", 2)
add_body(doc,
    "The system provides full multi-language support to serve diverse humanitarian communities "
    "across linguistic boundaries."
)

add_formatted_table(doc,
    ["ID", "Requirement", "Priority"],
    [
        ["FR-090", "System shall support 4 languages: English, Arabic, French, and Spanish", "Must"],
        ["FR-091", "Arabic shall use Right-to-Left (RTL) layout with Noto Sans Arabic font family", "Must"],
        ["FR-092", "Translation system shall cover 627 keys for all user-facing UI elements", "Must"],
        ["FR-093", "User language preference shall be persisted to the database and restored on login", "Must"],
        ["FR-094", "AI responses shall be localized to the user's selected language", "Should"],
    ],
    col_widths=[0.8, 4.7, 1.0]
)

doc.add_paragraph()

# Language support summary
heading(doc, "Language Support Summary", 3)
add_formatted_table(doc,
    ["Language", "Code", "Direction", "Font Family", "Coverage"],
    [
        ["English", "EN", "LTR", "Calibri / System Default", "Full (627 keys)"],
        ["Arabic", "AR", "RTL", "Noto Sans Arabic", "Full (627 keys)"],
        ["French", "FR", "LTR", "System Default", "Full (627 keys)"],
        ["Spanish", "ES", "LTR", "System Default", "Full (627 keys)"],
    ],
    col_widths=[1.3, 0.8, 1.0, 1.8, 1.6]
)

doc.add_page_break()

# ---- 3. Non-Functional Requirements ----
heading(doc, "3. Non-Functional Requirements", 1)
add_body(doc,
    "Non-functional requirements define the quality attributes and operational constraints "
    "of the Kuja Grant Management System."
)

add_formatted_table(doc,
    ["ID", "Category", "Requirement"],
    [
        ["NFR-001", "Scalability", "System shall support 1,000+ concurrent NGO organizations with efficient query performance"],
        ["NFR-002", "Performance", "API response time shall be under 2 seconds for standard queries (non-AI operations)"],
        ["NFR-003", "Performance", "AI operations shall timeout at 180 seconds with graceful fallback to template-based responses"],
        ["NFR-004", "Infrastructure", "System shall use PostgreSQL with connection pooling (10 main + 15 overflow connections)"],
        ["NFR-005", "Security", "System shall implement 8 security headers including Content Security Policy (CSP)"],
        ["NFR-006", "Accessibility", "System shall meet WCAG 2.1 Level A accessibility standards"],
        ["NFR-007", "Availability", "System shall maintain 99.5% uptime with Railway infrastructure"],
        ["NFR-008", "Auditability", "All audit-relevant actions shall be logged with timestamps and user identification"],
    ],
    col_widths=[0.8, 1.3, 4.4]
)

doc.add_paragraph()

heading(doc, "Technology Stack", 3)
add_formatted_table(doc,
    ["Component", "Technology", "Version / Details"],
    [
        ["Backend", "Python / Flask", "Python 3.11+, Flask with Blueprint architecture"],
        ["Frontend", "Vanilla JavaScript SPA", "Single-page application, no framework dependencies"],
        ["Database (Dev)", "SQLite", "Local development with file-based storage"],
        ["Database (Prod)", "PostgreSQL", "Railway-provisioned with connection pooling"],
        ["AI Engine", "Anthropic Claude", "Claude API for document analysis, scoring, chat assistance"],
        ["Hosting", "Railway", "Containerized deployment with auto-scaling"],
        ["Sanctions API", "OpenSanctions", "Live API with fallback to direct list downloads"],
        ["Styling", "CSS3", "Custom design system with RTL support"],
    ],
    col_widths=[1.5, 2.0, 3.0]
)

doc.add_page_break()

# ===========================================================================
# PART 2: USER GUIDE
# ===========================================================================

# Part 2 banner
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(72)
p.paragraph_format.space_after = Pt(12)
run = p.add_run("PART 2")
run.bold = True
run.font.size = Pt(32)
run.font.color.rgb = RGBColor(0x1B, 0x3A, 0x5C)
run.font.name = "Calibri"

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_after = Pt(6)
run = p.add_run("USER GUIDE")
run.font.size = Pt(22)
run.font.color.rgb = RGBColor(0x2C, 0x5F, 0x8A)
run.font.name = "Calibri"

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = p.add_run("_" * 50)
run.font.color.rgb = RGBColor(0x1B, 0x3A, 0x5C)

doc.add_page_break()

# ---- 4. Getting Started ----
heading(doc, "4. Getting Started", 1)

heading(doc, "4.1 Accessing the System", 2)
add_body_bold_start(doc, "Production URL: ", "https://web-production-6f8a.up.railway.app")
add_body(doc, "The Kuja Grant Management System is a web-based application accessible through any modern browser. No software installation is required.")

heading(doc, "Supported Browsers", 3)
add_formatted_table(doc,
    ["Browser", "Minimum Version", "Status"],
    [
        ["Google Chrome", "90+", "Fully Supported"],
        ["Mozilla Firefox", "88+", "Fully Supported"],
        ["Apple Safari", "14+", "Fully Supported"],
        ["Microsoft Edge", "90+", "Fully Supported"],
    ],
    col_widths=[2.0, 2.0, 2.5]
)

doc.add_paragraph()

heading(doc, "4.2 Logging In", 2)
add_body(doc, "Follow these steps to access the system:")

add_numbered_list(doc, [
    "Open your web browser and navigate to the Kuja Grant Management System URL.",
    "On the login page, enter your registered email address in the Email field.",
    "Enter your password in the Password field.",
    "Click the Sign In button.",
    "The system will authenticate your credentials and redirect you to your role-specific dashboard.",
])

doc.add_paragraph()
add_body_bold_start(doc, "Important: ", "After 5 failed login attempts, your account will be locked for 30 minutes for security purposes. Contact your system administrator if you need immediate access.")

heading(doc, "4.3 Changing Language", 2)
add_body(doc, "Kuja supports multiple languages to serve diverse humanitarian communities:")

add_numbered_list(doc, [
    "Locate the language selector (globe icon) in the top navigation header.",
    "Click the globe icon to open the language dropdown menu.",
    "Select your desired language: English, \u0627\u0644\u0639\u0631\u0628\u064a\u0629 (Arabic), Fran\u00e7ais (French), or Espa\u00f1ol (Spanish).",
    "The entire user interface will immediately translate to the selected language.",
    "Your language preference is automatically saved and will persist across sessions.",
])

doc.add_paragraph()
add_body_bold_start(doc, "Note: ", "Selecting Arabic will switch the entire layout to Right-to-Left (RTL) mode with the Noto Sans Arabic font for optimal readability.")

doc.add_page_break()

# ---- 5. NGO User Guide ----
heading(doc, "5. NGO User Guide", 1)
add_body(doc,
    "This section provides comprehensive guidance for NGO staff members using the Kuja Grant "
    "Management System. As an NGO user, you can browse available grants, submit applications, "
    "complete capacity assessments, and submit required reports."
)

heading(doc, "5.1 Dashboard Overview", 2)
add_body(doc,
    "Upon logging in, you will see the NGO Dashboard with key statistics and quick-access "
    "sections designed to keep you informed of your grant activity."
)

heading(doc, "Dashboard Stat Cards", 3)
add_formatted_table(doc,
    ["Card", "Description"],
    [
        ["Capacity Score", "Your organization's overall capacity score based on the most recent assessment"],
        ["My Applications", "Total number of grant applications submitted by your organization"],
        ["Open Grants", "Number of currently available grants accepting applications"],
        ["Documents", "Total documents uploaded to your organization's profile"],
    ],
    col_widths=[1.8, 4.7]
)

doc.add_paragraph()

heading(doc, "Dashboard Sections", 3)
add_bullet_list(doc, [
    ("Recommended Grants: ", "Grants matching your organization's profile, sector, and geography."),
    ("Upcoming Reports: ", "Report deadlines approaching in the next 30 days with status indicators."),
    ("Recent Applications: ", "Your most recent application submissions with current status."),
    ("Quick Actions: ", "One-click shortcuts to Browse Grants, Start Assessment, Submit Report, and View Documents."),
])

heading(doc, "5.2 Browsing and Applying for Grants", 2)
add_body(doc, "To find and apply for available grants:")

add_numbered_list(doc, [
    "Click \"Browse Grants\" in the left sidebar navigation.",
    "Use the search bar to find grants by keyword, or use filters (sector, country, funding amount) to narrow results.",
    "Click on a grant card to view full details including eligibility requirements, evaluation criteria, and document requirements.",
    "Review all grant information carefully before proceeding.",
    "Click the \"Apply\" button to begin the application process.",
])

doc.add_paragraph()
add_body_bold_start(doc, "Tip: ", "Check the eligibility requirements before starting an application. The system enforces a one-application-per-grant rule, so ensure your organization meets the criteria.")

heading(doc, "5.3 Grant Application Wizard", 2)
add_body(doc, "The application process follows a structured 4-step wizard:")

heading(doc, "Step 1: Eligibility Check", 3)
add_bullet_list(doc, [
    "Review each eligibility requirement listed by the donor.",
    "Check the box next to each requirement your organization meets.",
    "Requirements marked as mandatory (asterisk) must be checked to proceed.",
    "The system displays a progress indicator showing how many requirements are met.",
    "Click \"Next\" to proceed to the proposal step.",
])

heading(doc, "Step 2: Proposal Response", 3)
add_bullet_list(doc, [
    "For each evaluation criterion defined by the donor, write a detailed response.",
    "Each criterion shows the maximum word count and scoring weight.",
    "Click the \"AI Guidance\" button (lightbulb icon) for AI-powered writing suggestions.",
    "AI guidance provides structure, key points to address, and language-appropriate suggestions.",
    "Monitor the word count indicator to stay within limits.",
    "Click \"Next\" to proceed to document upload.",
])

heading(doc, "Step 3: Document Upload", 3)
add_bullet_list(doc, [
    "Upload all required documents as specified by the donor.",
    "Supported formats: PDF, DOCX, XLSX, CSV, PNG, JPG, TXT (max 16 MB each).",
    "Each document receives automatic AI analysis upon upload.",
    "AI analysis scores each document against donor-specific requirements (0-100).",
    "A green checkmark indicates the document meets minimum quality thresholds.",
    "Click \"Next\" to proceed to the review step.",
])

heading(doc, "Step 4: Review & Submit", 3)
add_bullet_list(doc, [
    "Review all your responses, uploaded documents, and eligibility selections.",
    "Green checkmarks indicate completed sections; red indicators show missing items.",
    "Make corrections by clicking \"Back\" to return to previous steps.",
    "When satisfied, click \"Submit Application\" to finalize.",
    "The system automatically calculates an AI score based on your submission.",
    "You will receive a confirmation with your application reference number.",
])

doc.add_page_break()

heading(doc, "5.4 Tracking Applications", 2)
add_body(doc, "Monitor the status of all your submitted applications:")

add_bullet_list(doc, [
    "Navigate to \"My Applications\" in the sidebar.",
    "View the application list with status indicators for each submission.",
    "Click any application to see full details including scores and reviewer feedback.",
])

add_body(doc, "Application status progression:")
add_formatted_table(doc,
    ["Status", "Description"],
    [
        ["Draft", "Application started but not yet submitted; can be edited and completed"],
        ["Submitted", "Application submitted to donor; awaiting initial review"],
        ["Under Review", "Donor has begun reviewing the application; reviewers may be assigned"],
        ["Scored", "All reviews completed; final score calculated"],
        ["Awarded", "Application approved for funding; grant agreement forthcoming"],
        ["Rejected", "Application not selected for funding; feedback may be available"],
    ],
    col_widths=[1.5, 5.0]
)

doc.add_paragraph()

heading(doc, "5.5 Capacity Assessment", 2)
add_body(doc,
    "Capacity assessments help your organization evaluate its readiness for grant funding "
    "and identify areas for improvement. Kuja supports five internationally recognized frameworks."
)

heading(doc, "Starting an Assessment", 3)
add_numbered_list(doc, [
    "Go to \"Assessments\" in the left sidebar.",
    "Click \"Start New Assessment\" button.",
    "Select the assessment framework from the dropdown (Kuja, STEP, UN-HACT, CHS, or NUPAS).",
    "Complete the organization profile section with current information.",
    "Work through each category's checklist, checking items your organization has in place.",
    "Optionally upload supporting evidence documents for checked items.",
    "Submit the assessment to view results.",
])

doc.add_paragraph()

heading(doc, "Assessment Frameworks", 3)
add_formatted_table(doc,
    ["Framework", "Categories", "Items", "Description"],
    [
        ["Kuja", "5", "26", "Custom humanitarian capacity framework designed for East African organizations. Covers governance, operations, financial management, program delivery, and monitoring."],
        ["STEP", "5", "26", "Strengthening Technical Excellence in Partner organizations. Focuses on institutional development, program quality, and sustainability."],
        ["UN-HACT", "5", "22", "UN Harmonized Approach to Cash Transfers. Assesses financial management, procurement, internal controls, and audit compliance."],
        ["CHS", "7", "27", "Core Humanitarian Standard on Quality and Accountability. Evaluates community engagement, effectiveness, coordination, learning, and staff competency."],
        ["NUPAS", "5", "26", "National NGO Assessment for organizational capacity. Covers governance, management systems, service delivery, financial systems, and external relations."],
    ],
    col_widths=[0.9, 0.9, 0.7, 4.0]
)

doc.add_paragraph()
add_body(doc,
    "After completing an assessment, you will see a results dashboard showing overall score, "
    "per-category scores, identified capacity gaps, and AI-generated recommendations for "
    "improvement. Your organization profile capacity score will be updated automatically."
)

doc.add_page_break()

heading(doc, "5.6 Submitting Reports", 2)
add_body(doc,
    "Grant reports are required as part of your funding agreement. The reporting module "
    "helps you meet deadlines and produce compliant reports."
)

add_numbered_list(doc, [
    "Go to \"Reports\" in the left sidebar.",
    "Click \"New Report\" or select an upcoming deadline from the dashboard calendar.",
    "Select the report type (financial, narrative, impact, progress, or final) and reporting period.",
    "Fill in the report template sections: Executive Summary, Activities Completed, Financial Summary, Challenges, and Next Steps.",
    "Enter indicator data to track progress against targets.",
    "Click \"Save as Draft\" to continue later, or \"Submit\" when the report is complete.",
    "Upon submission, AI automatically analyzes the report against donor requirements.",
    "Track the donor's review status (Pending Review, Accepted, Revision Requested).",
])

doc.add_paragraph()
add_body_bold_start(doc, "Important: ", "Submitted reports receive an AI compliance score with per-requirement analysis. If the donor requests revision, you will see specific feedback on which areas need improvement.")

heading(doc, "5.7 Using the AI Assistant", 2)
add_body(doc, "The Kuja AI Assistant provides context-aware guidance throughout your workflow:")

add_bullet_list(doc, [
    ("Chat Panel: ", "Click the AI panel toggle (chat icon) in the top navigation to open the assistant. Type questions to receive role-specific guidance on grants, applications, reports, or assessments."),
    ("Writing Guidance: ", "In application forms, click the \"AI Guidance\" button next to any text field. The AI provides structured suggestions, key points to address, and writing tips tailored to the evaluation criteria."),
    ("Document Feedback: ", "After uploading documents, review the AI analysis summary for specific improvement suggestions."),
    ("Language Support: ", "The AI responds in your selected language. Switch languages using the header language selector."),
])

doc.add_page_break()

# ---- 6. Donor User Guide ----
heading(doc, "6. Donor User Guide", 1)
add_body(doc,
    "This section provides guidance for donor program officers who create grants, review "
    "applications, evaluate reports, and manage compliance screening."
)

heading(doc, "6.1 Dashboard Overview", 2)
add_body(doc, "The Donor Dashboard provides an at-a-glance summary of your grant portfolio:")

add_formatted_table(doc,
    ["Stat Card", "Description"],
    [
        ["Total Grants", "Number of grants you have created (all statuses)"],
        ["Applications", "Total applications received across all your grants"],
        ["Pending Reviews", "Applications awaiting reviewer assignment or scoring"],
        ["Funding Awarded", "Total amount of funding awarded to successful applicants"],
        ["Reports Due", "Number of upcoming or overdue reports from funded NGOs"],
    ],
    col_widths=[1.8, 4.7]
)

doc.add_paragraph()

heading(doc, "6.2 Creating a Grant (6-Step Wizard)", 2)
add_body(doc, "The grant creation wizard guides you through a comprehensive setup process:")

heading(doc, "Step 1: Basic Information", 3)
add_bullet_list(doc, [
    "Enter the grant title and a detailed description.",
    "Set the total funding amount and select the currency.",
    "Define the application deadline (date and time).",
    "Select applicable sectors (Health, Education, WASH, Food Security, etc.).",
    "Specify eligible countries and regions.",
])

heading(doc, "Step 2: Eligibility Requirements", 3)
add_bullet_list(doc, [
    "Add eligibility criteria that applicants must meet.",
    "Select from predefined types: Geographic, Organization Type, Experience, Budget, Sector, Registration.",
    "Set each requirement as Required (must meet) or Preferred (bonus points).",
    "Add weight (importance) and help text for each requirement.",
    "Configure minimum thresholds where applicable.",
])

heading(doc, "Step 3: Evaluation Criteria", 3)
add_bullet_list(doc, [
    "Define scoring criteria with descriptive labels.",
    "Add instructions and example responses for applicants.",
    "Set maximum word count per criterion response.",
    "Assign weights to each criterion (all weights must total 100%).",
    "The system will use these criteria for both human reviewer and AI scoring.",
])

heading(doc, "Step 4: Document Requirements", 3)
add_bullet_list(doc, [
    "Select the document types applicants must submit.",
    "Available types include: Project Proposal, Budget, Registration Certificate, Annual Report, Financial Audit, Logical Framework, and more.",
    "Configure specific requirements per document type (e.g., 'Must cover the last 3 fiscal years' for financial audits).",
    "Mark documents as Required or Optional.",
])

heading(doc, "Step 5: Reporting Configuration", 3)
add_bullet_list(doc, [
    "Set the reporting frequency (monthly, quarterly, semi-annual, annual).",
    "Define required report types: Financial, Narrative, Impact, Progress, Final.",
    "Configure report templates with required sections.",
    "Add performance indicators that NGOs will track and report against.",
    "The system will generate a reporting calendar based on your configuration.",
])

heading(doc, "Step 6: Review & Publish", 3)
add_bullet_list(doc, [
    "Review all grant settings across all previous steps.",
    "The system displays a completion checklist with validation status for each section.",
    "Click \"Save as Draft\" to save without publishing (only visible to you).",
    "Click \"Publish\" to make the grant visible to all NGOs on the platform.",
    "Published grants appear immediately in the NGO grant browser.",
])

doc.add_page_break()

heading(doc, "6.3 Managing Applications", 2)
add_body(doc, "Once NGOs submit applications to your grants, manage the review process:")

add_numbered_list(doc, [
    "Navigate to your grant's detail page and click the \"Applications\" tab.",
    "View the list of submitted applications with AI scores and status indicators.",
    "Click an individual application to review the full submission: eligibility responses, proposal text, uploaded documents, and AI analysis.",
    "Assign independent reviewers from the reviewer pool by clicking \"Assign Reviewers\" and selecting from available experts.",
    "Monitor reviewer progress; the system shows assigned, in-progress, and completed reviews.",
    "Once all reviews are complete, view the consolidated score breakdown: Criteria (60%) + Documents (20%) + Eligibility (20%).",
    "Change application status to Awarded or Rejected using the status dropdown.",
])

heading(doc, "6.4 Reviewing Reports", 2)
add_body(doc, "Review grant reports submitted by funded NGOs:")

add_numbered_list(doc, [
    "Go to the \"Reports\" section in the sidebar.",
    "View submitted reports organized by grant, with AI compliance analysis summaries.",
    "Click a report to see the full submission with per-requirement compliance scores.",
    "Review AI-generated risk flags highlighting areas where the report may be deficient.",
    "Click \"Accept\" to approve the report, or \"Request Revision\" to send the report back with specific feedback notes.",
])

heading(doc, "6.5 Compliance Screening", 2)
add_body(doc, "Screen applicant organizations against international sanctions lists:")

add_numbered_list(doc, [
    "Navigate to the \"Compliance\" section in the sidebar.",
    "Select an organization to screen from the list of applicants.",
    "Click \"Run Screening\" to check against UN, OFAC, EU, and World Bank sanctions lists.",
    "The system performs live screening via the OpenSanctions API (with fallback to direct list downloads).",
    "View results showing match scores, matched names, and the specific sanctions list source.",
    "Flag organizations with potential matches for further investigation, or clear them if results are false positives.",
])

doc.add_paragraph()
add_body_bold_start(doc, "Note: ", "The screening uses fuzzy name matching with a 0.75 similarity threshold. Partial matches should be manually reviewed to determine relevance.")

doc.add_page_break()

# ---- 7. Reviewer User Guide ----
heading(doc, "7. Reviewer User Guide", 1)
add_body(doc,
    "This section provides guidance for independent reviewers who evaluate grant applications "
    "and provide expert scoring."
)

heading(doc, "7.1 Dashboard Overview", 2)
add_body(doc, "The Reviewer Dashboard provides a summary of your review assignments:")

add_formatted_table(doc,
    ["Stat Card", "Description"],
    [
        ["Assigned", "Total number of applications assigned to you for review"],
        ["In Progress", "Reviews you have started but not yet submitted"],
        ["Completed", "Reviews you have submitted with final scores"],
        ["Average Score Given", "Your average score across all completed reviews"],
    ],
    col_widths=[2.0, 4.5]
)

doc.add_paragraph()

heading(doc, "7.2 Reviewing Applications", 2)
add_body(doc, "Follow this process to review assigned applications:")

add_numbered_list(doc, [
    "Go to \"My Assignments\" in the left sidebar.",
    "Click on an assigned application to open the review interface.",
    "The review screen displays a split-panel layout:",
    "For each evaluation criterion, read the applicant's response in the left panel.",
    "In the right panel, enter your score (0 to 100) for each criterion.",
    "Add detailed comments and feedback in the comments field below each score.",
    "Review the AI document analysis summaries for each uploaded document.",
    "When all criteria are scored, click \"Submit Review\" to finalize your evaluation.",
])

doc.add_paragraph()
add_body_bold_start(doc, "Scoring Guidelines: ",
    "Score each criterion from 0 (does not address the requirement) to 100 (excellent, "
    "fully addresses all aspects). Consider the quality of evidence, specificity of the "
    "response, and alignment with the donor's stated objectives."
)

heading(doc, "7.3 Using AI Auto-Score", 2)
add_body(doc,
    "The AI Auto-Score feature provides an AI-generated baseline score to assist your review. "
    "This is intended as a starting point, not a replacement for expert judgment."
)

add_numbered_list(doc, [
    "Within the review interface, click the \"AI Auto-Score\" button in the toolbar.",
    "The system generates suggested scores for each criterion based on AI analysis of the applicant's responses.",
    "Review each AI-suggested score carefully and adjust based on your expert judgment.",
    "Add your own comments and qualitative feedback that the AI cannot provide.",
    "The final submitted scores are always yours; AI suggestions are advisory only.",
    "Submit your review when you are satisfied with all scores and comments.",
])

doc.add_page_break()

# ---- 8. Admin User Guide ----
heading(doc, "8. Admin User Guide", 1)
add_body(doc,
    "This section provides guidance for system administrators who manage users, organizations, "
    "and overall system operations."
)

heading(doc, "8.1 Dashboard Overview", 2)
add_body(doc, "The Admin Dashboard provides system-wide metrics and operational insights:")

add_formatted_table(doc,
    ["Metric", "Description"],
    [
        ["Users by Role", "Breakdown of registered users across NGO, Donor, Reviewer, and Admin roles"],
        ["Organizations by Type", "Count of NGOs, donor organizations, and other entity types"],
        ["Active Grants", "Number of grants currently in Open or Review status"],
        ["Pending Applications", "Applications awaiting review or scoring"],
        ["Compliance Flags", "Organizations with unresolved sanctions screening matches"],
    ],
    col_widths=[2.0, 4.5]
)

doc.add_paragraph()

heading(doc, "8.2 User Management", 2)
add_body(doc, "Manage system users through the Admin panel:")

add_bullet_list(doc, [
    ("View All Users: ", "Browse the complete user list with filtering by role (NGO, Donor, Reviewer, Admin), status, and organization."),
    ("Create New Accounts: ", "Add new users by providing email, name, role, and organization assignment. The system sends an activation email."),
    ("Activate/Deactivate Accounts: ", "Toggle account status to grant or revoke access. Deactivated accounts cannot log in but data is preserved."),
    ("Change User Roles: ", "Modify a user's role assignment. Role changes take effect on the user's next login."),
])

heading(doc, "8.3 Organization Management", 2)
add_body(doc, "Monitor and manage registered organizations:")

add_bullet_list(doc, [
    ("View All Organizations: ", "Browse organizations with filtering by type, country, and verification status."),
    ("Track Verification Status: ", "Monitor government registry verification results for each organization."),
    ("Monitor Assessment Scores: ", "View the latest capacity assessment scores and framework completion."),
    ("Review Compliance Results: ", "Check sanctions screening results and manage flagged organizations."),
])

heading(doc, "8.4 System Health", 2)
add_body(doc, "Monitor system operations using the health check endpoints:")

add_formatted_table(doc,
    ["Endpoint", "Method", "Description", "Response"],
    [
        ["/api/health", "GET", "Overall system health status", "200 OK with status details"],
        ["/api/ready", "GET", "Database and AI service readiness checks", "200 OK or 503 if services unavailable"],
        ["/api/version", "GET", "Current application version information", "Version number, build date, environment"],
    ],
    col_widths=[1.5, 0.8, 2.5, 1.7]
)

doc.add_page_break()

# ===========================================================================
# APPENDICES
# ===========================================================================

heading(doc, "Appendices", 1)

# Appendix A
heading(doc, "Appendix A: Keyboard Shortcuts", 2)
add_formatted_table(doc,
    ["Shortcut", "Action", "Context"],
    [
        ["Ctrl + S", "Save current form as draft", "Application wizard, Report editor"],
        ["Ctrl + Enter", "Submit current form", "Application wizard, Report editor"],
        ["Esc", "Close modal dialog or AI panel", "Global"],
        ["Tab / Shift+Tab", "Navigate between form fields", "All forms"],
        ["Alt + L", "Open language selector", "Global"],
        ["Alt + A", "Open AI assistant panel", "Global"],
        ["Ctrl + F", "Focus search bar", "Grant browser, User management"],
    ],
    col_widths=[1.5, 2.5, 2.5]
)

doc.add_paragraph()

# Appendix B
heading(doc, "Appendix B: Supported File Types", 2)
add_formatted_table(doc,
    ["Extension", "MIME Type", "Description", "Max Size"],
    [
        [".pdf", "application/pdf", "Portable Document Format", "16 MB"],
        [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Microsoft Word Document", "16 MB"],
        [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Microsoft Excel Spreadsheet", "16 MB"],
        [".csv", "text/csv", "Comma-Separated Values", "16 MB"],
        [".png", "image/png", "PNG Image", "16 MB"],
        [".jpg", "image/jpeg", "JPEG Image", "16 MB"],
        [".txt", "text/plain", "Plain Text File", "16 MB"],
    ],
    col_widths=[0.8, 2.7, 1.8, 1.2]
)

doc.add_paragraph()
add_body(doc, "File validation is performed using both file extension checks and magic byte verification to prevent malicious file uploads.")

doc.add_paragraph()

# Appendix C
heading(doc, "Appendix C: Status Definitions", 2)

heading(doc, "Grant Statuses", 3)
add_formatted_table(doc,
    ["Status", "Description", "Transitions To"],
    [
        ["Draft", "Grant created but not yet published; only visible to the donor", "Open"],
        ["Open", "Grant published and accepting applications from NGOs", "Review, Closed"],
        ["Review", "Application period closed; applications under evaluation", "Closed, Awarded"],
        ["Closed", "Grant cycle completed; no further actions", "N/A (terminal)"],
        ["Awarded", "Funding decisions made; successful applicants notified", "Closed"],
    ],
    col_widths=[1.2, 3.3, 2.0]
)

doc.add_paragraph()

heading(doc, "Application Statuses", 3)
add_formatted_table(doc,
    ["Status", "Description", "Transitions To"],
    [
        ["Draft", "Application started but not submitted; editable by NGO", "Submitted"],
        ["Submitted", "Application submitted to donor for consideration", "Under Review"],
        ["Under Review", "Application being evaluated by reviewers", "Scored"],
        ["Scored", "All reviews completed; final score calculated", "Awarded, Rejected"],
        ["Awarded", "Application approved for grant funding", "N/A (terminal)"],
        ["Rejected", "Application not selected for funding", "N/A (terminal)"],
    ],
    col_widths=[1.2, 3.3, 2.0]
)

doc.add_paragraph()

heading(doc, "Assessment Statuses", 3)
add_formatted_table(doc,
    ["Status", "Description"],
    [
        ["In Progress", "Assessment started but not all categories completed"],
        ["Completed", "All categories reviewed; scores and recommendations generated"],
    ],
    col_widths=[1.5, 5.0]
)

doc.add_paragraph()

heading(doc, "Report Statuses", 3)
add_formatted_table(doc,
    ["Status", "Description", "Transitions To"],
    [
        ["Draft", "Report started but not submitted; editable by NGO", "Submitted"],
        ["Submitted", "Report submitted to donor for review", "Accepted, Revision Requested"],
        ["Accepted", "Donor approved the report", "N/A (terminal)"],
        ["Revision Requested", "Donor requested changes; returned to NGO", "Submitted"],
    ],
    col_widths=[1.5, 3.0, 2.0]
)

doc.add_paragraph()

heading(doc, "Compliance Statuses", 3)
add_formatted_table(doc,
    ["Status", "Description"],
    [
        ["Clear", "No sanctions matches found; organization cleared for funding"],
        ["Flagged", "Potential sanctions match detected; requires manual review"],
        ["Under Review", "Flagged organization being investigated by compliance team"],
        ["Blocked", "Confirmed sanctions match; organization ineligible for funding"],
    ],
    col_widths=[1.5, 5.0]
)

doc.add_page_break()

# Appendix D
heading(doc, "Appendix D: Glossary", 2)

glossary_terms = [
    ["AI Auto-Score", "Feature that generates suggested application scores using Anthropic Claude AI analysis, serving as a starting point for human reviewers"],
    ["Capacity Assessment", "Structured evaluation of an NGO's organizational readiness across governance, financial management, operations, and program delivery"],
    ["CHS", "Core Humanitarian Standard on Quality and Accountability, an internationally recognized assessment framework"],
    ["Compliance Screening", "Automated process of checking organizations against international sanctions lists (UN, OFAC, EU, World Bank)"],
    ["Evaluation Criteria", "Weighted scoring dimensions defined by donors against which grant applications are assessed"],
    ["Fuzzy Matching", "Name comparison algorithm that identifies potential matches despite spelling variations, transliterations, or partial name differences"],
    ["Grant Wizard", "Guided multi-step interface for creating grants (donors) or applications (NGOs)"],
    ["Kuja Framework", "Custom humanitarian capacity assessment framework designed for East African organizations"],
    ["Magic Bytes", "File header signature used to verify actual file type independent of the file extension"],
    ["NUPAS", "National NGO Assessment, a capacity evaluation framework for national organizations"],
    ["OFAC", "Office of Foreign Assets Control, a U.S. Treasury Department division maintaining sanctions lists"],
    ["OpenSanctions", "Third-party API service providing consolidated international sanctions data"],
    ["RTL", "Right-to-Left, the text direction used for Arabic language rendering"],
    ["SPA", "Single-Page Application, the frontend architecture where navigation occurs without full page reloads"],
    ["STEP", "Strengthening Technical Excellence in Partner organizations, a capacity assessment framework"],
    ["UN-HACT", "United Nations Harmonized Approach to Cash Transfers, an assessment framework for organizations receiving UN funds"],
]

add_formatted_table(doc,
    ["Term", "Definition"],
    glossary_terms,
    col_widths=[1.8, 4.7]
)

# ===========================================================================
# Footer / End of Document
# ===========================================================================

doc.add_page_break()

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(144)
run = p.add_run("END OF DOCUMENT")
run.bold = True
run.font.size = Pt(14)
run.font.color.rgb = RGBColor(0x1B, 0x3A, 0x5C)
run.font.name = "Calibri"

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(12)
run = p.add_run("Kuja Grant Management System v3.0.0")
run.font.size = Pt(11)
run.font.color.rgb = RGBColor(0x66, 0x66, 0x66)
run.font.name = "Calibri"

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = p.add_run("Adeso / Kuja Link  |  March 2026  |  Internal Use")
run.font.size = Pt(10)
run.font.color.rgb = RGBColor(0x99, 0x99, 0x99)
run.font.name = "Calibri"

# ===========================================================================
# Save
# ===========================================================================

output_path = r"C:\Users\IdirisLoyan\kuja-grant\docs\Kuja_Grant_v3.0_Business_Requirements_User_Guide.docx"
doc.save(output_path)
print(f"Document saved to: {output_path}")
print(f"File size: {os.path.getsize(output_path) / 1024:.1f} KB")
