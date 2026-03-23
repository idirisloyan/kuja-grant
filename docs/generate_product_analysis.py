"""
Generate Kuja Product & Market Analysis document (~26 pages).
Internal reference document for team, technical partners, and evaluators.

Usage:
    python generate_product_analysis.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from doc_helpers import *


def build_document():
    """Build the complete Product & Market Analysis document."""
    doc = setup_document()

    # ═══════════════════════════════════════════════════════════════════════════
    # COVER PAGE
    # ═══════════════════════════════════════════════════════════════════════════
    create_cover_page(
        doc,
        title="KUJA GRANT PLATFORM",
        subtitle="Product & Market Analysis",
        confidential_text="INTERNAL \u2014 FOR TEAM & TECHNICAL PARTNERS"
    )

    # ═══════════════════════════════════════════════════════════════════════════
    # TABLE OF CONTENTS
    # ═══════════════════════════════════════════════════════════════════════════
    create_toc(doc, [
        (1, "Executive Summary"),
        (2, "Product Architecture \u2014 8-Stage Grant Lifecycle"),
        (3, "AI Capabilities & Technical Architecture"),
        (4, "Detailed Competitive Analysis"),
        (5, "Feature Comparison Matrix"),
        (6, "Market Research & Data"),
        (7, "Competitive Advantages"),
        (8, "Risk Analysis & Mitigation"),
        (9, "Product Roadmap"),
        (10, "Appendix \u2014 Source References"),
    ])

    # ═══════════════════════════════════════════════════════════════════════════
    # SECTION 1: EXECUTIVE SUMMARY
    # ═══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "1. Executive Summary")

    add_body(doc,
        "Kuja is the first AI-powered end-to-end grant management platform purpose-built "
        "for the Global South. Incubated by Adeso, a Somali-founded African social enterprise "
        "with over 30 years of humanitarian experience, Kuja addresses a fundamental imbalance "
        "in the aid sector: local organizations closest to communities have the most effective "
        "solutions but the least resources. Billions in aid funding remain concentrated at "
        "Global North headquarters while local civil society organizations face systemic "
        "barriers \u2014 lack of visibility to donors, limited capacity to navigate complex "
        "funding processes, extensive and duplicative donor compliance requirements, and "
        "fragmented grants management tooling."
    )

    add_body(doc,
        "The platform covers the complete grant lifecycle across eight integrated stages: "
        "marketplace discovery (kuja.org, 600+ active users), AI-powered capacity assessments "
        "using five industry-standard frameworks today (Kuja, STEP, UN-HACT, CHS, NUPAS) with "
        "an extensible architecture designed to add donor-specific or any new framework on demand, "
        "live due diligence including government registry verification for seven African countries "
        "today \u2014 with a system designed to expand to any Global South country that provides "
        "a government verification portal \u2014 "
        "and sanctions screening against UN, OFAC, EU, and World Bank databases, AI-guided "
        "grant applications with document analysis and scoring, dual-scoring review combining "
        "AI and human evaluation, AI-powered reporting with compliance monitoring, and "
        "back-end ERP for operations built on Odoo 17. For entities choosing the ERP, "
        "onboarding is seamless because most organizational information is already captured "
        "through earlier lifecycle stages. For those that do not adopt the ERP, a dedicated "
        "reporting module connects grant information to enable compliance reporting without "
        "additional data entry."
    )

    add_body(doc,
        "The global grant management software market is valued at $2.75 billion (2024) and "
        "is projected to reach $4.79 billion by 2030, growing at a CAGR of 10.3%. No "
        "existing platform in this market combines marketplace, capacity assessment, grant "
        "management, AI-powered analysis, and ERP operations in a single integrated solution "
        "designed specifically for the Global South. The dissolution of USAID in 2025 \u2014 "
        "with 83% of programs cancelled and $36 billion in aid cuts \u2014 has created urgent "
        "demand for diversified funding infrastructure and direct donor-to-NGO connections, "
        "positioning Kuja at the intersection of market need and sector transformation."
    )

    add_page_break(doc)

    # ═══════════════════════════════════════════════════════════════════════════
    # SECTION 2: PRODUCT ARCHITECTURE - 8-STAGE GRANT LIFECYCLE
    # ═══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "2. Product Architecture \u2014 8-Stage Grant Lifecycle")

    # --- Stage 1 ---
    add_heading2(doc, "Stage 1 \u2014 Marketplace Discovery (kuja.org)")

    add_body(doc,
        "The foundation of the Kuja ecosystem is a free networking platform serving CSOs, "
        "Networks, INGOs, Donors, and Individual professionals."
    )

    add_bullet(doc, "Profile types: CSO, Network, INGO, Donor, Individual \u2014 each with tailored fields and verification requirements")
    add_bullet(doc, "Three-tier verification: referral-based, legal registration verification, and community/peer verification")
    add_bullet(doc, "Discussion forums, direct messaging, curated resource library")
    add_bullet(doc, "Grant feed with advanced filtering by sector, country, organization type, funding size, keywords")
    add_bullet(doc, "600+ active users in pre-launch phase")

    add_heading3(doc, "Technical Implementation")
    add_bullet(doc, "Stack: Python/Flask backend, Vanilla JS SPA frontend, PostgreSQL (production)")
    add_bullet(doc, "API: RESTful, JWT authentication, role-based access control (admin, ngo, donor, reviewer)")
    add_bullet(doc, "Production URL: https://web-production-6f8a.up.railway.app")

    # --- Stage 2 ---
    add_heading2(doc, "Stage 2 \u2014 AI-Powered Capacity Assessment")

    add_body(doc,
        "Kuja\u2019s capacity assessment module is the most comprehensive self-service "
        "assessment available in the sector. The system currently supports five frameworks "
        "but is architecturally designed to be extensible \u2014 new frameworks (including "
        "donor-specific assessment criteria) can be added on demand without structural changes."
    )

    add_bullet(doc, "Five frameworks live today: Kuja (proprietary), STEP (TechSoup), UN-HACT, CHS, NUPAS")
    add_bullet(doc, "Extensible by design: Add donor-specific or any new assessment framework on demand \u2014 "
        "no competitor offers this flexibility")
    add_bullet(doc,
        "Free tier: Rules-based assessment engine generates gap checklists and learning roadmaps"
    )
    add_bullet(doc,
        "Paid tier: Claude AI reviews uploaded organizational policies, financial documents, "
        "certificates \u2014 identifying missing clauses, weak areas, providing 30/60/90-day "
        "improvement roadmap"
    )
    add_bullet(doc, "Donor readiness scoring: private philanthropy, bilateral donors, multilateral agencies, UN system")
    add_bullet(doc, "Passportable results: Complete one assessment, share with multiple donors")

    add_heading3(doc, "Technical Implementation")
    add_bullet(doc, "AI model: Anthropic Claude claude-sonnet-4-20250514")
    add_bullet(doc, "Assessment prompts structured per-framework with framework-specific scoring rubrics")
    add_bullet(doc,
        "Document analysis: PDF, DOCX, XLSX upload \u2192 text extraction \u2192 AI evaluation "
        "against framework criteria"
    )
    add_bullet(doc, "Results stored as structured JSON with per-criterion scores (0-100)")

    # --- Stage 3 ---
    add_heading2(doc, "Stage 3 \u2014 Live Due Diligence")

    add_body(doc,
        "Automated, real-time verification replaces manual due diligence processes that "
        "typically cost donors $5,000-$15,000 per organization. The system is designed to "
        "expand to any Global South country that provides a government verification portal "
        "\u2014 the current seven countries are the starting point, not the ceiling."
    )

    add_bullet(doc,
        "7 countries live today: Kenya NGO Coordination Board, "
        "Nigeria CAC, South Africa DSD NPO Registry, Uganda NGO Bureau, Tanzania NiS, "
        "Somalia MOIFAR, Ethiopia ACSO"
    )
    add_bullet(doc,
        "Expansion-ready architecture: Adding a new country requires only a registry adapter "
        "\u2014 no structural changes. Goal: all Global South countries with government "
        "verification portals"
    )
    add_bullet(doc,
        "Sanctions screening against 5 databases: OpenSanctions API (primary), UN Security "
        "Council (XML), US OFAC SDN (CSV), EU Financial Sanctions (CSV), World Bank "
        "Debarment List"
    )
    add_bullet(doc,
        "AI-powered registration certificate analysis \u2014 extracting org name, registration "
        "number, date, validity"
    )

    add_heading3(doc, "Technical Implementation")
    add_bullet(doc, "Primary API: OpenSanctions with API key authentication")
    add_bullet(doc, "Fallback: Direct download and parse of UN XML, OFAC CSV, EU CSV files when API unavailable")
    add_bullet(doc, "Government registries: HTTP scraping with country-specific parsers")
    add_bullet(doc, "Certificate analysis: Claude AI with structured output extraction")

    # --- Stage 4 ---
    add_heading2(doc, "Stage 4 \u2014 AI-Powered Grant Matching")

    add_bullet(doc, "AI matches NGOs to grants based on profile, capacity score, sector, geography, funding tier eligibility")
    add_bullet(doc, "AI matches donors to qualified grantees based on requirements, geography, sector, capacity thresholds")
    add_bullet(doc, "Multi-language: EN, FR, AR, SW, SO natively \u2014 architecture supports 100+ via AI translation")

    # --- Stage 5 ---
    add_heading2(doc, "Stage 5 \u2014 Grant Application with AI Guidance")

    add_bullet(doc, "Four-step application wizard with AI coaching at each stage")
    add_bullet(doc,
        "AI analyzes uploaded documents (PDF, DOCX, XLSX) with per-criteria scoring (0-100) "
        "and recommendations"
    )
    add_bullet(doc,
        "Supported types: financial reports, audit reports, project proposals, budgets, "
        "impact reports, certificates, policies"
    )

    add_heading3(doc, "Technical Implementation")
    add_bullet(doc,
        "Document analysis prompt includes donor-specific evaluation criteria with priority "
        "levels (Critical, Important, Nice to Have)"
    )
    add_bullet(doc,
        "AI response parsed into structured findings with per-requirement scores, risk flags, "
        "and improvement suggestions"
    )
    add_bullet(doc, "File size limit: 25MB per upload; text extracted before AI analysis to manage token costs")

    add_page_break(doc)

    # --- Stage 6 ---
    add_heading2(doc, "Stage 6 \u2014 Review & Award")

    add_bullet(doc, "Dual scoring: AI auto-score (objective baseline) + human reviewer (contextual judgment)")
    add_bullet(doc, "Structured scoring rubrics per document type for consistency")
    add_bullet(doc, "Donor-configurable evaluation criteria with 3 priority levels and custom weightings")
    add_bullet(doc, "AI-ranked shortlists for reviewer efficiency")

    # --- Stage 7 ---
    add_heading2(doc, "Stage 7 \u2014 Reporting & Compliance Monitoring")

    add_bullet(doc,
        "Donors upload grant agreements; AI extracts reporting requirements, deadlines, "
        "financial obligations, compliance conditions"
    )
    add_bullet(doc, "Donors define per-document-type evaluation criteria")
    add_bullet(doc,
        "NGOs submit reports; AI evaluates against extracted requirements with per-requirement "
        "compliance scores and risk flags"
    )
    add_bullet(doc,
        "Compliance dashboard: portfolio-level visibility into deadlines, submission status, "
        "risk indicators"
    )
    add_bullet(doc,
        "For non-ERP NGOs: reporting module connects grant info to compliance workflows "
        "without additional software"
    )

    add_heading3(doc, "Technical Implementation")
    add_bullet(doc,
        "Grant agreement parsing: Claude AI extracts structured JSON with requirement_type, "
        "description, deadline, frequency"
    )
    add_bullet(doc,
        "Report evaluation: Each submitted report evaluated against all extracted requirements "
        "with individual pass/fail/partial scores"
    )
    add_bullet(doc, "Risk flag categories: Missing, Late, Incomplete, Non-Compliant")

    # --- Stage 8 ---
    add_heading2(doc, "Stage 8 \u2014 ERP & Operations (KujaBuild \u2014 Odoo 17)")

    add_body(doc,
        "The final stage extends grant management into full operational management."
    )

    add_bullet(doc,
        "Three tiers: Basic (grant/donor mgmt, accounting, financial reporting), "
        "Premium (+asset mgmt, procurement, payroll), Premium+ (+project mgmt, HRIS, MEAL)"
    )
    add_bullet(doc, "Multi-tenancy: donors access real-time financial data for their grants")
    add_bullet(doc, "Seamless onboarding: most data captured in Stages 1-7, reducing setup from weeks to hours")
    add_bullet(doc, "Automatic data migration from marketplace profiles, assessment results, grant records")

    add_page_break(doc)

    # ═══════════════════════════════════════════════════════════════════════════
    # SECTION 3: AI CAPABILITIES & TECHNICAL ARCHITECTURE
    # ═══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "3. AI Capabilities & Technical Architecture")

    add_heading2(doc, "AI Model & Integration")

    add_bullet(doc, "Model: Anthropic Claude claude-sonnet-4-20250514 via Anthropic API")
    add_bullet(doc, "Integration: Server-side API calls from Python/Flask backend")
    add_bullet(doc, "Authentication: ANTHROPIC_API_KEY environment variable")
    add_bullet(doc, "Response format: Structured JSON for all analysis functions")

    add_heading2(doc, "AI Functions")

    add_styled_table(doc,
        headers=["Function", "Input", "Output", "Estimated Cost/Call"],
        rows=[
            ["Document Analysis", "PDF/DOCX/XLSX (extracted text)",
             "Per-criteria scores (0-100), findings, recommendations", "~$0.05-0.15"],
            ["Capacity Assessment", "Questionnaire responses + uploaded docs",
             "Framework-specific scores, gap analysis, improvement roadmap", "~$0.10-0.30"],
            ["Grant Agreement Parsing", "Agreement PDF",
             "Extracted requirements, deadlines, financial obligations (JSON)", "~$0.05-0.15"],
            ["Report Evaluation", "Submitted report + extracted requirements",
             "Per-requirement compliance scores, risk flags", "~$0.05-0.10"],
            ["Grant Matching", "NGO profile + available grants",
             "Ranked matches with compatibility scores", "~$0.03-0.08"],
            ["Chat Assistant", "User query + context",
             "Contextual response", "~$0.01-0.05"],
        ]
    )

    doc.add_paragraph()  # spacer

    add_heading2(doc, "Architecture Stack")

    add_bullet(doc, "Backend: Python 3.x / Flask")
    add_bullet(doc, "Frontend: Vanilla JavaScript SPA (single-page application)")
    add_bullet(doc, "Database: SQLite (development) / PostgreSQL (production, Railway)")
    add_bullet(doc, "AI: Anthropic Claude API (claude-sonnet-4-20250514)")
    add_bullet(doc, "Sanctions: OpenSanctions API + direct UN/OFAC/EU file parsing")
    add_bullet(doc, "Registry: HTTP-based government registry verification (7 countries live, "
        "designed to expand to all Global South countries)")
    add_bullet(doc, "Deployment: Railway (PaaS)")
    add_bullet(doc, "Languages: English, French, Arabic, Spanish, Swahili live \u2014 expanding to 10+")

    add_heading2(doc, "Security & Compliance")

    add_bullet(doc, "JWT-based authentication with secure token generation and expiry management")
    add_bullet(doc, "Role-based access control: admin, ngo, donor, reviewer \u2014 enforced at API and UI layers")
    add_bullet(doc, "API key management via environment variables \u2014 never stored in source code or client-side")
    add_bullet(doc, "Data encryption in transit (HTTPS/TLS) enforced across all endpoints")
    add_bullet(doc, "PostgreSQL with parameterized queries to prevent SQL injection")
    add_bullet(doc, "Input validation and sanitization on all user-facing endpoints")
    add_bullet(doc, "File upload restrictions: type validation, size limits (25MB), server-side text extraction")

    add_page_break(doc)

    # ═══════════════════════════════════════════════════════════════════════════
    # SECTION 4: DETAILED COMPETITIVE ANALYSIS
    # ═══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "4. Detailed Competitive Analysis")

    add_body(doc,
        "The following analysis covers 13 competitors across grant management, discovery, "
        "assessment, and screening categories. Threat levels reflect the degree to which each "
        "competitor could erode Kuja\u2019s addressable market within 12-24 months."
    )

    add_styled_table(doc,
        headers=["Competitor", "Type", "Primary User", "Key Strength", "Pricing",
                 "Global South?", "AI?", "Threat Level"],
        rows=[
            ["Fluxx", "Grant Mgmt", "Donors", "Deep lifecycle management, Grantelligence AI",
             "Custom (not public)", "No", "Yes (analytics)", "HIGH"],
            ["Submittable", "Grant Mgmt", "Donors", "Proven scale (25M apps, 145K programs)",
             "~$5K-18K/yr", "No", "Yes (fraud)", "HIGH"],
            ["SmartSimple", "Grant Mgmt", "Donors", "Extremely configurable, 45+ languages",
             "~$6K/yr", "Partial", "Yes (+AI)", "MEDIUM"],
            ["Good Grants", "Grant Mgmt", "Donors", "Affordable, humanitarian sector friendly",
             "EUR 3K-6K/yr", "Partial", "No", "MEDIUM"],
            ["Foundant GLM", "Grant Mgmt", "Donors", "User-friendly, unlimited users",
             "Not public", "No", "Limited", "LOW"],
            ["Benevity", "CSR Suite", "Corporations", "Massive scale ($14B+ donations)",
             "$40K+/yr", "No", "Yes", "LOW"],
            ["OpenGrants", "Discovery", "Seekers", "AI matching, grant writer marketplace",
             "$29/mo", "No", "Yes (matching)", "LOW"],
            ["Instrumentl", "Discovery", "Seekers", "Best discovery (450K+ funders, 31K+ RFPs)",
             "$299-499/mo", "No", "Yes (matching)", "LOW"],
            ["GrantHub", "Pipeline", "Seekers", "Affordable entry point",
             "$95/mo", "No", "No", "LOW"],
            ["GlobalGiving", "Marketplace", "Both", "Established trust, 175 countries",
             "5-12% + 3% fees", "Yes", "No", "MEDIUM"],
            ["UN Partner Portal", "Due Diligence", "UN-CSO", "Free, harmonized across UN system",
             "Free", "Yes", "No", "MEDIUM"],
            ["TechSoup STEP", "Assessment", "Both", "Comprehensive organizational assessment",
             "Contact", "Yes", "No", "MEDIUM"],
            ["Xapien", "Screening", "Donors", "True AI (35T pages, 0.5B registries)",
             "Subscription", "Partial", "Yes", "LOW"],
        ]
    )

    doc.add_paragraph()  # spacer

    # --- Per-competitor detailed analysis (HIGH and MEDIUM threats) ---
    add_heading3(doc, "Fluxx (HIGH THREAT)")
    add_bullet(doc,
        "Strengths: Most comprehensive donor-side lifecycle management, Grantelligence AI "
        "analytics, TAG 2024 top choice"
    )
    add_bullet(doc,
        "Weaknesses: Enterprise-only pricing excludes Global South CSOs, no marketplace or "
        "capacity assessment, no NGO-facing tools, US/Europe focus only"
    )
    add_bullet(doc,
        "Recent: Fluxx Grantseeker added (free/premium tiers), but separate product from "
        "Grantmaker with limited integration"
    )

    add_heading3(doc, "Submittable (HIGH THREAT)")
    add_bullet(doc,
        "Strengths: Massive scale (25M applications processed, 145K programs), strong brand "
        "recognition, growing AI capabilities"
    )
    add_bullet(doc,
        "Weaknesses: Application-focused only (no discovery, no assessment, no ERP), no "
        "Global South presence, pricing starts ~$5K/yr"
    )
    add_bullet(doc, "Recent: Added AI fraud detection and smart form features")

    add_heading3(doc, "SmartSimple (MEDIUM THREAT)")
    add_bullet(doc,
        "Strengths: Extremely configurable, 45+ languages, merged with Foundant Technologies "
        "(Aug 2024), launched +AI in 2023"
    )
    add_bullet(doc,
        "Weaknesses: Complex implementation, enterprise sales cycle, limited Global South "
        "focus despite language support"
    )
    add_bullet(doc,
        "Recent: SmartSimple Cloud +AI launched; Foundant merger creates largest grantmaking "
        "software company"
    )

    add_heading3(doc, "GlobalGiving (MEDIUM THREAT)")
    add_bullet(doc,
        "Strengths: Established marketplace trusted in 175 countries, strong brand in "
        "development sector"
    )
    add_bullet(doc,
        "Weaknesses: Discovery-only (no grant management, no assessment, no AI), 5-12% + 3% "
        "fee structure reduces net funding to NGOs"
    )
    add_bullet(doc,
        "Differentiation: Kuja offers full lifecycle vs. GlobalGiving\u2019s discovery-only model"
    )

    add_heading3(doc, "UN Partner Portal (MEDIUM THREAT)")
    add_bullet(doc,
        "Strengths: Free, harmonized across UN system, mandatory for UN partnerships"
    )
    add_bullet(doc,
        "Weaknesses: UN-only ecosystem (not useful for bilateral/private donors), rigid "
        "processes, no marketplace, no AI, no ERP"
    )
    add_bullet(doc,
        "Note: Complementary \u2014 Kuja\u2019s HACT framework aligns with UNPP requirements"
    )

    add_heading3(doc, "TechSoup STEP (MEDIUM THREAT)")
    add_bullet(doc,
        "Strengths: Comprehensive organizational assessment, strong nonprofit sector "
        "credibility, global reach"
    )
    add_bullet(doc,
        "Weaknesses: Assessment-only (no grant management, no marketplace, no ERP), "
        "limited AI, separate from any grant workflow"
    )
    add_bullet(doc,
        "Note: Kuja\u2019s assessment module is a superset (5 frameworks including alignment "
        "with STEP methodology)"
    )

    add_page_break(doc)

    # ═══════════════════════════════════════════════════════════════════════════
    # SECTION 5: FEATURE COMPARISON MATRIX
    # ═══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "5. Feature Comparison Matrix")

    add_body(doc,
        "Y = Yes (fully supported), P = Partial (limited support), \u2014 = Not available.",
        italic=True
    )

    # Define the matrix data
    competitors = ["Kuja", "Fluxx", "Submittable", "SmartSimple", "UNPP", "STEP",
                   "Xapien", "GlobalGiving", "Instrumentl"]

    features_data = [
        # (Feature Name, [Kuja, Fluxx, Submittable, SmartSimple, UNPP, STEP, Xapien, GlobalGiving, Instrumentl])
        ("Self-Service Digital Platform", ["Y", "Y", "Y", "Y", "Y", "Y", "Y", "Y", "Y"]),
        ("AI-Powered Analysis", ["Y", "P", "P", "P", "\u2014", "\u2014", "Y", "\u2014", "P"]),
        ("Multi-Framework Assessment", ["Y", "\u2014", "\u2014", "\u2014", "P", "Y", "\u2014", "\u2014", "\u2014"]),
        ("Passportable Results", ["Y", "\u2014", "\u2014", "\u2014", "P", "P", "\u2014", "\u2014", "\u2014"]),
        ("Two-Sided Marketplace", ["Y", "\u2014", "\u2014", "\u2014", "P", "\u2014", "\u2014", "Y", "\u2014"]),
        ("Grant Matching Algorithm", ["Y", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "Y"]),
        ("Document Upload & Scoring", ["Y", "P", "P", "P", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014"]),
        ("Donor Configuration", ["Y", "Y", "Y", "Y", "P", "\u2014", "\u2014", "\u2014", "\u2014"]),
        ("Capacity Improvement Roadmap", ["Y", "\u2014", "\u2014", "\u2014", "\u2014", "P", "\u2014", "\u2014", "\u2014"]),
        ("Multi-Language Support", ["Y", "P", "\u2014", "Y", "Y", "\u2014", "\u2014", "P", "\u2014"]),
        ("Gov. Registry Verification", ["Y", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "P", "\u2014", "\u2014"]),
        ("Live Sanctions Screening", ["Y", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "Y", "\u2014", "\u2014"]),
        ("Grant Application Portal", ["Y", "Y", "Y", "Y", "Y", "\u2014", "\u2014", "Y", "\u2014"]),
        ("Review & Award Workflow", ["Y", "Y", "Y", "Y", "Y", "\u2014", "\u2014", "\u2014", "\u2014"]),
        ("Reporting Module", ["Y", "Y", "P", "Y", "P", "\u2014", "\u2014", "P", "\u2014"]),
        ("ERP Integration", ["Y", "P", "\u2014", "P", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014"]),
        ("Multi-Tenancy", ["Y", "P", "\u2014", "P", "Y", "\u2014", "\u2014", "\u2014", "\u2014"]),
        ("Compliance Dashboard", ["Y", "Y", "P", "Y", "P", "\u2014", "\u2014", "\u2014", "\u2014"]),
        ("Audit Trail", ["Y", "Y", "Y", "Y", "Y", "\u2014", "Y", "\u2014", "\u2014"]),
        ("Mobile-Ready", ["Y", "P", "Y", "P", "P", "\u2014", "\u2014", "Y", "Y"]),
        ("Offline Capability", ["P", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014"]),
        ("Free Tier for CSOs", ["Y", "\u2014", "\u2014", "\u2014", "Y", "\u2014", "\u2014", "\u2014", "\u2014"]),
        ("Global South Design", ["Y", "\u2014", "\u2014", "P", "Y", "P", "\u2014", "Y", "\u2014"]),
        ("Chat Assistant", ["Y", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014"]),
    ]

    # Build the custom table
    num_cols = 1 + len(competitors)  # Feature col + competitor cols
    num_rows = 1 + len(features_data)  # Header + data rows
    table = doc.add_table(rows=num_rows, cols=num_cols)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True

    # Set table borders
    tbl = table._tbl
    tbl_pr = tbl.tblPr if tbl.tblPr is not None else parse_xml(f'<w:tblPr {nsdecls("w")}/>')
    borders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>'
        '  <w:top w:val="single" w:sz="4" w:space="0" w:color="B0C4DE"/>'
        '  <w:left w:val="single" w:sz="4" w:space="0" w:color="B0C4DE"/>'
        '  <w:bottom w:val="single" w:sz="4" w:space="0" w:color="B0C4DE"/>'
        '  <w:right w:val="single" w:sz="4" w:space="0" w:color="B0C4DE"/>'
        '  <w:insideH w:val="single" w:sz="4" w:space="0" w:color="B0C4DE"/>'
        '  <w:insideV w:val="single" w:sz="4" w:space="0" w:color="B0C4DE"/>'
        '</w:tblBorders>'
    )
    tbl_pr.append(borders)

    # Header row
    header_labels = ["Feature"] + competitors
    for j, label in enumerate(header_labels):
        cell = table.cell(0, j)
        set_cell_shading(cell, BLUE_HEX)
        set_cell_text(cell, label, bold=True, font_size=Pt(7.5), font_color=WHITE)

    # Data rows
    for i, (feature_name, values) in enumerate(features_data):
        # Feature name column
        cell = table.cell(i + 1, 0)
        if i % 2 == 1:
            set_cell_shading(cell, ALT_ROW_HEX)
        set_cell_text(cell, feature_name, font_size=Pt(7.5), font_color=DARK_GRAY)

        # Value columns
        for j, val in enumerate(values):
            cell = table.cell(i + 1, j + 1)
            if i % 2 == 1:
                set_cell_shading(cell, ALT_ROW_HEX)

            # Special formatting for Kuja column (j == 0)
            if j == 0:
                if val == "Y":
                    set_cell_text(cell, val, bold=True, font_size=Pt(7.5), font_color=GREEN,
                                  alignment=WD_ALIGN_PARAGRAPH.CENTER)
                elif val == "P":
                    set_cell_text(cell, val, bold=True, font_size=Pt(7.5), font_color=AMBER,
                                  alignment=WD_ALIGN_PARAGRAPH.CENTER)
                else:
                    set_cell_text(cell, val, font_size=Pt(7.5), font_color=DARK_GRAY,
                                  alignment=WD_ALIGN_PARAGRAPH.CENTER)
            else:
                set_cell_text(cell, val, font_size=Pt(7.5), font_color=DARK_GRAY,
                              alignment=WD_ALIGN_PARAGRAPH.CENTER)

    doc.add_paragraph()  # spacer

    add_body(doc,
        "Kuja achieves full support (Y) for 23 of 24 features, with partial support (P) for "
        "Offline Capability (planned for future release). No competitor achieves more than 12 "
        "of 24 features. The closest competitors \u2014 Fluxx and SmartSimple \u2014 score 11 "
        "each, and neither offers marketplace, extensible capacity assessment, government registry "
        "verification (expanding to all Global South countries), or multi-language support "
        "for Global South languages (Arabic, French, Spanish, Swahili).",
        italic=True
    )

    add_page_break(doc)

    # ═══════════════════════════════════════════════════════════════════════════
    # SECTION 6: MARKET RESEARCH & DATA
    # ═══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "6. Market Research & Data")

    add_heading2(doc, "Market Size")

    add_styled_table(doc,
        headers=["Metric", "Value", "Source"],
        rows=[
            ["Global grant management software market (2024)", "$2.75 billion", "Grand View Research"],
            ["Projected market size (2030)", "$4.79 billion", "Grand View Research"],
            ["CAGR (2024-2030)", "10.3%", "Grand View Research"],
            ["Nonprofit/NGO segment share", "58.2%", "Grand View Research"],
            ["Cloud-based deployments", "65% of new implementations", "Industry reports"],
            ["Nonprofits wanting to expand AI use", "90%", 'CEP "AI With Purpose" (2025)'],
            ["Foundations wanting to expand AI use", "94%", 'CEP "AI With Purpose" (2025)'],
        ]
    )

    doc.add_paragraph()  # spacer

    add_heading2(doc, "TAM/SAM/SOM Methodology")

    add_bullet(doc, "TAM: Full global grant management software market ($2.75B \u2192 $4.79B)", bold_prefix="TAM: ")
    add_bullet(doc,
        "SAM: NGO/nonprofit segment (58.2% = ~$1.6B in 2024, ~$2.79B by 2030). Includes "
        "donor-side platforms used for nonprofit grantmaking.",
        bold_prefix="SAM: "
    )
    add_bullet(doc,
        "SOM: Kuja\u2019s realistic Year 1-3 capture based on geographic focus (Africa first), "
        "pricing model, and sales capacity. Year 1: $1M. Year 3: $2M+ ARR.",
        bold_prefix="SOM: "
    )

    add_heading2(doc, "Sector Trends")

    add_bullet(doc,
        "Aid localization: Grand Bargain 2.0 commits 25% direct funding to local actors; "
        "actual figure below 5%"
    )
    add_bullet(doc,
        "USAID disruption: 83% programs cancelled (March 2025), 81+ NGOs closed field "
        "offices, $36B in cuts"
    )
    add_bullet(doc, "Digital transformation: 65% of new grant management deployments are cloud-based")
    add_bullet(doc,
        "AI adoption surge: 92% of nonprofits use AI in some capacity (Virtuous/Fundraising.AI "
        "2026), but 76% lack formal AI strategy (TechSoup 2025)"
    )
    add_bullet(doc,
        "Merger activity: SmartSimple + Foundant merger (Aug 2024), Bonterra launched "
        "Grantmaker (Feb 2026)"
    )
    add_bullet(doc,
        "Assessment standardization: Growing demand for passportable, reusable capacity "
        "assessments across donors"
    )

    add_heading2(doc, "Target Market Segments")

    add_styled_table(doc,
        headers=["Segment", "Estimated Size", "Kuja\u2019s Approach"],
        rows=[
            ["African CSOs/NGOs", "100,000+ registered organizations",
             "Free tier for marketplace + paid assessment + ERP"],
            ["Global South CSOs (incl. LatAm, Asia)", "500,000+",
             "Phase 2-3 geographic expansion"],
            ["Bilateral/multilateral donors", "50+ major institutions",
             "Premium end-to-end solution"],
            ["Private foundations", "200,000+ globally",
             "Application portal + matching"],
            ["INGOs seeking local partners", "1,000+",
             "Marketplace + assessment integration"],
        ]
    )

    add_page_break(doc)

    # ═══════════════════════════════════════════════════════════════════════════
    # SECTION 7: COMPETITIVE ADVANTAGES
    # ═══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "7. Competitive Advantages")

    add_numbered_item(doc, 1, "ONLY END-TO-END PLATFORM",
        "Kuja is the only solution that combines marketplace discovery, capacity assessment, "
        "grant application, dual-scoring review, compliance reporting, and ERP operations in "
        "a single platform. Organizations and donors never need to switch between disconnected "
        "tools or re-enter data across systems."
    )

    add_numbered_item(doc, 2, "AI-POWERED THROUGHOUT",
        "Claude AI is integrated into every stage: document analysis, capacity assessment, "
        "grant matching, application coaching, review scoring, compliance monitoring, and chat "
        "assistance. This is not a bolt-on AI feature \u2014 it is architectural, reducing "
        "manual effort at every touchpoint."
    )

    add_numbered_item(doc, 3, "BUILT BY AND FOR THE GLOBAL SOUTH",
        "Adeso\u2019s 30+ years of humanitarian experience across Africa informs every design "
        "decision. Multi-language support today (English, French, Arabic, Spanish, Swahili) "
        "with more languages coming in weeks \u2014 no other vendor offers Global South "
        "language coverage at this level. Combined with multi-currency operations, "
        "low-bandwidth optimization, and culturally appropriate UX patterns. No competitor "
        "has this institutional knowledge."
    )

    add_numbered_item(doc, 4, "EXTENSIBLE ASSESSMENT FRAMEWORK",
        "Five industry-standard frameworks live today (Kuja, STEP, UN-HACT, CHS, NUPAS) with "
        "an architecture designed to add donor-specific or any new framework on demand. "
        "Organizations complete one comprehensive assessment and share verified, passportable "
        "results with any donor \u2014 replacing 4-12 duplicate assessments per year. No other "
        "platform offers this framework flexibility."
    )

    add_numbered_item(doc, 5, "LIVE DUE DILIGENCE \u2014 DESIGNED TO SCALE",
        "Real-time government registry verification across seven African countries today, "
        "with a system designed to expand to any Global South country that provides a "
        "government verification portal. Combined with sanctions screening against five "
        "international databases (UN, OFAC, EU, World Bank, OpenSanctions), this replaces "
        "manual processes costing $5,000-$15,000 per organization. Adding a new country "
        "requires only a registry adapter \u2014 no structural changes."
    )

    add_numbered_item(doc, 6, "DUAL-SIDED VALUE",
        "Kuja serves both sides of the funding equation. CSOs gain visibility, assessment "
        "credentials, and compliance tools. Donors gain a vetted pipeline, automated "
        "screening, and real-time reporting. This dual-sided approach creates network effects: "
        "more CSOs attract more donors, which attract more CSOs."
    )

    add_numbered_item(doc, 7, "SEAMLESS ERP CONVERSION",
        "Organizations that adopt KujaBuild (Odoo 17) benefit from seamless onboarding \u2014 "
        "most organizational data is already captured through marketplace registration, "
        "capacity assessment, and grant application stages. Multi-tenancy allows donors to "
        "access real-time financial data for their grants."
    )

    add_numbered_item(doc, 8, "CREDIBILITY OF ADESO",
        "As a Somali-founded organization with three decades of impact across Africa and "
        "co-founder of the NEAR Network (the largest network of national and local "
        "organizations in the Global South), Adeso brings unmatched sector credibility. Kuja "
        "is not a Silicon Valley startup attempting to serve communities it does not "
        "understand \u2014 it is a solution built by the communities it serves."
    )

    add_page_break(doc)

    # ═══════════════════════════════════════════════════════════════════════════
    # SECTION 8: RISK ANALYSIS & MITIGATION
    # ═══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "8. Risk Analysis & Mitigation")

    add_styled_table(doc,
        headers=["#", "Risk Category", "Risk Description", "Likelihood", "Impact",
                 "Mitigation Strategy"],
        rows=[
            ["R1", "Market",
             "USAID funding partially restored, reducing urgency for alternatives",
             "Medium", "Medium",
             "Kuja\u2019s value proposition extends beyond USAID \u2014 diversified funding "
             "pathways benefit organizations regardless of USAID status"],
            ["R2", "Market",
             "Major competitor (Fluxx/Submittable) launches Global South offering",
             "Medium", "High",
             "First-mover advantage, Adeso\u2019s deep network relationships, and local "
             "expertise create switching costs competitors cannot replicate quickly"],
            ["R3", "Market",
             "Donor adoption slower than projected",
             "High", "High",
             "Focus on CSO network partnerships for bottom-up demand generation; demonstrate "
             "ROI through pilot outcomes"],
            ["R4", "Technical",
             "AI accuracy insufficient for compliance-critical decisions",
             "Low", "High",
             "AI provides recommendations, not decisions \u2014 human reviewers always have "
             "final authority. Continuous prompt engineering and model updates."],
            ["R5", "Technical",
             "OpenSanctions API dependency (rate limits, downtime)",
             "Medium", "Medium",
             "Fallback to direct UN XML/OFAC CSV/EU CSV downloads. Local caching of "
             "sanctions data. Multiple data sources."],
            ["R6", "Technical",
             "Government registry APIs change or become unavailable",
             "Medium", "Low",
             "HTTP scraping with per-country parsers allows rapid adaptation. Manual "
             "fallback for verification."],
            ["R7", "Technical",
             "Platform scaling under high concurrent load",
             "Medium", "Medium",
             "Railway auto-scaling, PostgreSQL connection pooling, CDN for static assets. "
             "Load testing before geographic expansion."],
            ["R8", "Operational",
             "Insufficient team capacity for geographic expansion",
             "High", "Medium",
             "Partner-led expansion model reduces need for direct presence. CSO networks "
             "handle local recruitment. Phased rollout (Kenya \u2192 SSA \u2192 LatAm)."],
            ["R9", "Operational",
             "CSO network MOUs do not translate to user acquisition",
             "Medium", "High",
             "Direct sales fallback. Incentivize networks with revenue share on ERP "
             "reselling. Joint donor proposals to fund member access."],
            ["R10", "Financial",
             "Revenue concentration in single donor contracts",
             "Medium", "High",
             "Diversify across product lines (portal, ERP, outsourcing). Target 10+ donors "
             "by end of 2026. Build recurring revenue from CSO subscriptions."],
            ["R11", "Financial",
             "Cross-subsidy model unsustainable at scale",
             "Low", "Medium",
             "Model validated through pilot phase. Donor premium (75%) covers CSO "
             "subsidization. Adjust ratios based on unit economics data."],
            ["R12", "Competitive",
             "Bonterra Grantmaker (Feb 2026) captures small foundation market",
             "Medium", "Low",
             "Bonterra targets US foundations; Kuja targets Global South. Minimal overlap. "
             "Monitor for international expansion."],
        ]
    )

    add_page_break(doc)

    # ═══════════════════════════════════════════════════════════════════════════
    # SECTION 9: PRODUCT ROADMAP
    # ═══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "9. Product Roadmap")

    add_styled_table(doc,
        headers=["Quarter", "Milestone", "Status"],
        rows=[
            ["Q1 2026", "Grant Platform v3.3.4 live with full AI capabilities", "Complete"],
            ["Q1 2026", "Live sanctions screening (OpenSanctions + fallback)", "Complete"],
            ["Q1 2026", "Government registry verification (7 African countries live)", "Complete"],
            ["Q1 2026", "AI document analysis against donor-specific requirements", "Complete"],
            ["Q1 2026", "Grant agreement upload with AI extraction", "Complete"],
            ["Q1 2026", "Donor grant wizard with AI evaluation criteria", "Complete"],
            ["Q1 2026", "NGO reporting with AI evaluation and compliance scores", "Complete"],
            ["Q2 2026", "KujaLink marketplace enhancements (improved matching, profiles)", "Planned"],
            ["Q2 2026", "Odoo 17 ERP integration (KujaBuild) \u2014 Basic Suite", "Planned"],
            ["Q2 2026", "Application portal launch for donors", "Planned"],
            ["Q3 2026", "ERP Premium and Premium+ suite tiers", "Planned"],
            ["Q3 2026", "LMS (Learning Management System) module start", "Planned"],
            ["Q3 2026", "Advanced analytics dashboard", "Planned"],
            ["Q4 2026", "Verification fee system for organizations", "Planned"],
            ["Q4 2026", "Ad revenue module (cost-per-click at $2.00/click)", "Planned"],
            ["Q4 2026", "Fiscal sponsorship package pilot", "Planned"],
            ["Q2 2026", "Additional assessment frameworks (donor-specific on demand)", "Planned"],
            ["Q3 2026", "Registry expansion: East & West Africa (15+ countries)", "Planned"],
            ["2027 H1", "Registry expansion: all Sub-Saharan Africa (30+ countries)", "Planned"],
            ["2027 H1", "Additional language support for LatAm and MENA", "Planned"],
            ["2027 H2", "Offline capability for low-connectivity environments", "Planned"],
            ["2027 H2", "Advanced AI analytics and predictive grant matching", "Planned"],
            ["2028", "Latin America & Caribbean launch (15 countries)", "Planned"],
            ["2028", "Course marketplace (CSO-created: $25 setup, INGO-created: $50)", "Planned"],
        ]
    )

    add_page_break(doc)

    # ═══════════════════════════════════════════════════════════════════════════
    # SECTION 10: APPENDIX - SOURCE REFERENCES
    # ═══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "10. Appendix \u2014 Source References")

    add_heading2(doc, "Market Data")
    add_bullet(doc,
        'Grand View Research. "Grant Management Software Market Report." 2024. '
        "https://www.grandviewresearch.com/industry-analysis/grant-management-software-market-report"
    )
    add_bullet(doc,
        'Future Market Insights. "Grant Management Software Market." 2024. '
        "https://www.futuremarketinsights.com/reports/grant-management-software-market"
    )

    add_heading2(doc, "AI Adoption")
    add_bullet(doc,
        'Center for Effective Philanthropy (CEP). "AI With Purpose: How Foundations and '
        'Nonprofits Are Thinking About and Using AI." 2025.'
    )
    add_bullet(doc,
        'TechSoup & Tapp Network. "State of AI in Nonprofits: 2025 Benchmark Report." 2025.'
    )
    add_bullet(doc,
        'Virtuous & Fundraising.AI. "2026 Nonprofit AI Adoption Report." February 2026.'
    )

    add_heading2(doc, "USAID & Aid Sector")
    add_bullet(doc,
        'NPR. "Rubio announces that 83% of USAID contracts will be canceled." March 10, 2025.'
    )
    add_bullet(doc,
        "ForeignAssistance.gov. USAID spending data, 2024-2025."
    )

    add_heading2(doc, "Competitor Sources")
    add_bullet(doc, "Fluxx. https://www.fluxx.io")
    add_bullet(doc, "Submittable. https://www.submittable.com")
    add_bullet(doc, "SmartSimple. https://www.smartsimple.com")
    add_bullet(doc, "GlobalGiving. https://www.globalgiving.org")
    add_bullet(doc, "UN Partner Portal. https://www.unpartnerportal.org")
    add_bullet(doc, "TechSoup. https://www.techsoup.org")
    add_bullet(doc, "Instrumentl. https://www.instrumentl.com")
    add_bullet(doc, "Xapien. https://www.xapien.com")
    add_bullet(doc, "OpenGrants. https://opengrants.io")
    add_bullet(doc, "Bonterra. https://www.bonterratech.com")
    add_bullet(doc, "Benevity. https://www.benevity.com")

    add_heading2(doc, "Humanitarian Sector")
    add_bullet(doc,
        "Grand Bargain 2.0 Framework. https://interagencystandingcommittee.org/grand-bargain"
    )
    add_bullet(doc, "NEAR Network. https://www.near.ngo")
    add_bullet(doc,
        'ReliefWeb. "Partner Capacity Assessments of Humanitarian NGOs." 2024.'
    )

    # ═══════════════════════════════════════════════════════════════════════════
    # FOOTER
    # ═══════════════════════════════════════════════════════════════════════════
    create_footer(doc, "Kuja Grant Platform | Adeso \u2014 African Development Solutions | INTERNAL | 2026")

    return doc


def main():
    doc = build_document()

    output_path = os.path.join(OUTPUT_DIR, "Kuja_Product_Market_Analysis.docx")
    doc.save(output_path)

    file_size = os.path.getsize(output_path)
    if file_size > 1024 * 1024:
        size_str = f"{file_size / (1024 * 1024):.1f} MB"
    else:
        size_str = f"{file_size / 1024:.1f} KB"

    print(f"Generated: {output_path}")
    print(f"File size: {size_str}")


if __name__ == "__main__":
    main()
