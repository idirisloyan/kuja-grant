"""
Generate Kuja GTM Strategy document (external-facing).
Produces: Kuja_GTM_Strategy.docx (~14 pages)
For partners, investors, and board members.
"""

import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from doc_helpers import *


def build_solution_grid(doc):
    """Build the 2x4 solution overview grid with custom formatting."""
    stages_row1 = [
        ("1. Discovery",
         "Free marketplace (kuja.org) connecting CSOs, donors, and networks. 600+ users."),
        ("2. Assessment",
         "5-framework AI capacity assessment. Passportable results eliminate duplicate assessments."),
        ("3. Due Diligence",
         "Live government registry verification (7 countries) + sanctions screening (UN/OFAC/EU/WB)."),
        ("4. Matching",
         "AI matches NGOs to grants and donors to grantees based on capacity, sector, geography."),
    ]
    stages_row2 = [
        ("5. Application",
         "AI-guided grant application with document analysis and per-criteria scoring."),
        ("6. Review",
         "Dual scoring: AI auto-score + human reviewer. Donor-configurable evaluation criteria."),
        ("7. Reporting",
         "AI extracts requirements from grant agreements. Per-requirement compliance monitoring."),
        ("8. ERP",
         "KujaBuild (Odoo 17) with multi-tenancy. Seamless onboarding from captured data."),
    ]

    table = doc.add_table(rows=2, cols=4)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True

    # Set borders
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

    for row_idx, stages in enumerate([stages_row1, stages_row2]):
        for col_idx, (name, desc) in enumerate(stages):
            cell = table.cell(row_idx, col_idx)
            set_cell_shading(cell, LIGHT_BLUE_HEX)
            cell.text = ""
            p = cell.paragraphs[0]
            # Bold blue stage name
            run_name = p.add_run(name)
            run_name.font.name = "Calibri"
            run_name.font.size = Pt(9)
            run_name.font.color.rgb = BLUE
            run_name.bold = True
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.space_before = Pt(2)
            # Description in gray on new paragraph
            p2 = cell.add_paragraph()
            run_desc = p2.add_run(desc)
            run_desc.font.name = "Calibri"
            run_desc.font.size = Pt(9)
            run_desc.font.color.rgb = MEDIUM_GRAY
            p2.paragraph_format.space_after = Pt(2)
            p2.paragraph_format.space_before = Pt(0)

    return table


def generate():
    doc = setup_document()

    # ── Cover Page ────────────────────────────────────────────────────────────
    create_cover_page(
        doc,
        title="KUJA GRANT PLATFORM",
        subtitle="Go-to-Market Strategy 2026",
        confidential_text="CONFIDENTIAL \u2014 FOR PARTNER DISCUSSIONS"
    )

    # ── Table of Contents ─────────────────────────────────────────────────────
    create_toc(doc, [
        (1, "Executive Summary"),
        (2, "Market Context & Opportunity"),
        (3, "Ideal Customer Profile"),
        (4, "Value Proposition & Positioning"),
        (5, "Solution Overview"),
        (6, "GTM Motion & Sales Strategy"),
        (7, "Channel & Partnership Strategy"),
        (8, "Competitive Landscape"),
        (9, "Revenue Model & Unit Economics"),
        (10, "2026 Targets & Milestones"),
        (11, "Team & Traction"),
        (12, "The Ask"),
    ])

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 1: Executive Summary
    # ══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "1. Executive Summary")

    add_body(doc, (
        "The $2.75B grant management software market\u2014growing to $4.79B by 2030 "
        "at 10.3% CAGR\u2014has no solution designed for the Global South. The 2025 "
        "USAID dissolution (83% of programs cancelled, $36B in aid cuts) has created "
        "urgent demand for diversified funding infrastructure that does not yet exist."
    ))

    add_body(doc, (
        "Kuja is the first AI-powered end-to-end grant management platform "
        "purpose-built for the Global South. Incubated by Adeso (30+ years in "
        "humanitarian work, co-founder of NEAR Network), Kuja spans 8 integrated "
        "lifecycle stages from marketplace discovery to ERP operations. It is the "
        "only platform combining marketplace, capacity assessment, grant management, "
        "AI-powered analysis, and ERP in a single solution."
    ))

    add_body(doc, (
        "600+ marketplace users, 200+ organizations, 8 pipeline partners, platform "
        "live at https://web-production-6f8a.up.railway.app. 2026 revenue target: "
        "$1M. Path to profitability at $2M+ ARR by 2029."
    ))

    add_page_break(doc)

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 2: Market Context & Opportunity
    # ══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "2. Market Context & Opportunity")

    add_heading2(doc, "Why Now: Three Convergent Forces")

    add_numbered_item(doc, 1, "USAID Disruption",
        "83% of programs cancelled (March 2025), $36B in aid cuts, 81+ NGOs closed "
        "field offices. Organizations need alternative funding pathways immediately.")

    add_numbered_item(doc, 2, "Localization Imperative",
        "Grand Bargain 2.0 commits to 25% direct funding to local actors \u2014 the actual "
        "figure remains below 5%. New infrastructure is needed to close this gap.")

    add_numbered_item(doc, 3, "AI Readiness",
        "90% of nonprofits and 94% of foundations want to expand AI use "
        "(CEP \u201cAI With Purpose\u201d 2025). The sector is ready for intelligent automation.")

    add_heading2(doc, "Total Addressable Market")

    add_styled_table(doc,
        ["Metric", "Value", "Source"],
        [
            ["Total Addressable Market (2024)", "$2.75B", "Grand View Research"],
            ["TAM Projected (2030)", "$4.79B (10.3% CAGR)", "Grand View Research"],
            ["Serviceable Available Market", "~$1.6B (NGO segment, 58.2%)", "Grand View Research"],
            ["Serviceable Obtainable Market (2026)", "$1M (Year 1 target)", "Internal projections"],
            ["SOM Target (2029)", "$2M+ ARR", "Internal projections"],
        ]
    )

    add_page_break(doc)

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 3: Ideal Customer Profile
    # ══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "3. Ideal Customer Profile")

    # Segment A
    add_heading2(doc, "Segment A \u2014 Local CSOs/NGOs (Primary)")

    add_styled_table(doc,
        ["Attribute", "Profile"],
        [
            ["Organization size", "10\u2013100 staff, $500K\u2013$5M annual budget"],
            ["Current state", "Managing 3\u20135 donor relationships manually"],
            ["Pain points", "30%+ staff time on compliance, 4\u201312 duplicate assessments/year, invisible to donors"],
            ["Buying triggers", "New grant opportunity, failed audit, USAID funding loss"],
            ["Decision maker", "Executive Director or Finance Director"],
            ["Deal size", "Free tier \u2192 $2,500\u2013$5,000/year (assessment + matching)"],
        ]
    )

    # Segment B
    add_heading2(doc, "Segment B \u2014 Donors & INGOs (Secondary)")

    add_styled_table(doc,
        ["Attribute", "Profile"],
        [
            ["Organization type", "Foundations, bilateral donors, INGOs seeking local grantees"],
            ["Current state", "Manual partner identification, fragmented compliance tracking"],
            ["Pain points", "Cannot find vetted local partners, high due diligence costs ($5K\u2013$15K/org), manual compliance monitoring"],
            ["Buying triggers", "Localization mandate, grant cycle launch, portfolio expansion"],
            ["Decision maker", "Grants Director or Program Officer"],
            ["Deal size", "$10,000\u2013$20,000/year (application portal)"],
        ]
    )

    # Segment C
    add_heading2(doc, "Segment C \u2014 CSO Networks (Channel Partners)")

    add_styled_table(doc,
        ["Attribute", "Profile"],
        [
            ["Organization type", "National/regional CSO umbrella networks"],
            ["Network size", "50\u2013500+ member organizations"],
            ["Value to Kuja", "Distribution channel \u2014 each MOU provides access to full membership base"],
            ["Incentive", "Revenue share on ERP reselling to members, joint donor proposals"],
            ["2026 target", "10 network MOUs signed"],
        ]
    )

    add_page_break(doc)

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 4: Value Proposition & Positioning
    # ══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "4. Value Proposition & Positioning")

    add_callout_box(doc, "Positioning Statement",
        "For Global South CSOs and their donors who need to navigate complex grant "
        "lifecycles, Kuja is the only AI-powered grant management platform that spans "
        "the complete journey from discovery to operations \u2014 eliminating the need for "
        "3\u20135 disconnected tools while reducing compliance burden by up to 70%."
    )

    add_numbered_item(doc, 1, "ONLY END-TO-END PLATFORM",
        "8 integrated lifecycle stages in one solution. No competitor covers more than 3.")

    add_numbered_item(doc, 2, "AI-POWERED THROUGHOUT",
        "Claude AI automates document analysis, capacity assessment, grant matching, "
        "compliance scoring, and report evaluation across every stage.")

    add_numbered_item(doc, 3, "BUILT BY AND FOR THE GLOBAL SOUTH",
        "Adeso\u2019s 30+ years of humanitarian experience and deep African networks inform "
        "every design decision. Multi-language (EN/FR/AR/SW/SO), multi-currency, designed "
        "for low-bandwidth environments.")

    add_numbered_item(doc, 4, "ACCESSIBLE ECONOMICS",
        "Free marketplace and basic assessment for CSOs. Cross-subsidy model where donor "
        "premium pricing funds CSO access. No competitor offers comparable functionality "
        "at these price points.")

    add_page_break(doc)

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 5: Solution Overview
    # ══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "5. Solution Overview")

    add_body(doc, (
        "Kuja is organized around 8 lifecycle stages that mirror the complete grant "
        "journey for both CSOs and donors. Each stage is AI-enhanced and feeds data "
        "forward to the next, creating a seamless operational workflow."
    ))

    build_solution_grid(doc)

    add_page_break(doc)

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 6: GTM Motion & Sales Strategy
    # ══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "6. GTM Motion & Sales Strategy")

    add_heading2(doc, "Three-Engine GTM Model")

    add_body(doc, (
        "Kuja employs a hybrid GTM approach combining product-led growth for CSO "
        "acquisition, direct enterprise sales for donor contracts, and partner-led "
        "distribution through CSO network MOUs."
    ))

    add_styled_table(doc,
        ["Engine", "Motion", "Target", "Mechanics", "Revenue Contribution"],
        [
            ["Product-Led", "Self-service signup \u2192 upgrade", "CSOs",
             "Free marketplace profile \u2192 paid assessment \u2192 ERP", "Pipeline + $50K direct"],
            ["Sales-Led", "Direct enterprise sales", "Donors/INGOs",
             "Outbound + network intros \u2192 demo \u2192 pilot \u2192 contract",
             "$650K (End-to-End) + $300K (ERP)"],
            ["Partner-Led", "CSO network reselling", "Networks \u2192 CSOs",
             "MOU \u2192 network promotes to members \u2192 bulk onboarding", "Embedded in above"],
        ]
    )

    add_heading2(doc, "Geographic Phasing")

    add_styled_table(doc,
        ["Phase", "Timeline", "Geography", "Focus"],
        [
            ["Kenya Testing", "Q1\u2013Q2 2026", "Kenya",
             "Validate model with 3 CSO network MOUs, 8 pipeline partners"],
            ["Global Scaling", "Q2\u2013Q4 2026", "Global (via Adeso network)",
             "10 CSO network MOUs, first donor enterprise deals"],
            ["Sub-Saharan Africa", "2027", "24 countries (East, Central, West, South)",
             "Regional expansion via network partnerships"],
            ["Latin America", "2028", "15 countries",
             "Spanish language support, LatAm donor engagement"],
        ]
    )

    add_heading2(doc, "Conversion Funnel")

    add_body(doc, (
        "The platform is designed as a progressive conversion funnel: free marketplace "
        "profiles attract CSOs \u2192 capacity assessments qualify them for funding \u2192 grant "
        "matching creates donor connections \u2192 application portal generates revenue \u2192 "
        "ERP adoption captures long-term value. Each stage increases both user "
        "engagement and lifetime value."
    ))

    add_page_break(doc)

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 7: Channel & Partnership Strategy
    # ══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "7. Channel & Partnership Strategy")

    add_heading2(doc, "CSO Networks \u2014 Primary Distribution Channel")

    add_bullet(doc, "Each network MOU provides access to 50\u2013500+ member organizations")
    add_bullet(doc, "Networks recruit members onto the platform; Kuja provides the technology")
    add_bullet(doc, "2027: Networks begin reselling ERP to members with revenue share")
    add_bullet(doc, "Joint proposals with donors to fund ERP access for network members")
    add_bullet(doc,
        "Target networks: Mzizi Connect (DRC), WACSI (West Africa), EACSOF (East Africa), "
        "SANGONet (Southern Africa), NEAR Network, MCLD, Start Network, Pledge for Change"
    )

    add_heading2(doc, "Donor Partners \u2014 Revenue + Recruitment")

    add_bullet(doc,
        "NEAR Change Fund, Hilton Foundation, Gates Foundation, Oak Foundation, "
        "Porticus, Packard Foundation"
    )
    add_bullet(doc,
        "Approach: demonstrate ROI through pilot outcomes, emphasize compliance "
        "automation and risk reduction"
    )
    add_bullet(doc,
        "Each donor partnership creates dual revenue: direct platform fees + "
        "sponsored CSO access"
    )

    add_callout_box(doc, "How the Cross-Subsidy Model Works",
        "Donor organizations pay a 75% premium over CSO pricing. For every two "
        "donor-sponsored organizations onboarded, one CSO receives full platform "
        "access at no cost. This creates a self-sustaining ecosystem: donor "
        "investment directly expands the network of vetted, assessed, report-ready "
        "CSOs \u2014 which in turn attracts more donors."
    )

    add_page_break(doc)

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 8: Competitive Landscape
    # ══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "8. Competitive Landscape")

    add_styled_table(doc,
        ["Competitor", "Type", "Pricing", "Lifecycle Coverage", "Global South", "AI"],
        [
            ["Fluxx", "Donor-side grant mgmt", "Custom (not public)",
             "Application \u2192 Reporting", "No", "Analytics"],
            ["Submittable", "Donor-side grant mgmt", "~$5K\u201318K/yr",
             "Application \u2192 Review", "No", "Fraud detection"],
            ["SmartSimple", "Donor-side grant mgmt", "~$6K/yr",
             "Application \u2192 Reporting", "Partial", "+AI add-on"],
            ["GlobalGiving", "Marketplace", "5\u201312% + 3% fees",
             "Discovery only", "Yes", "No"],
            ["UN Partner Portal", "Due diligence", "Free",
             "Assessment \u2192 Application", "Yes", "No"],
            ["Instrumentl", "Grant discovery", "$299\u2013499/mo",
             "Discovery only", "No", "Matching"],
            ["Kuja", "End-to-end", "Free tier + $10K\u201320K/yr",
             "All 8 stages", "Yes", "Throughout"],
        ]
    )

    add_callout_box(doc, "Key Finding",
        "No competitor offers all eight of Kuja\u2019s lifecycle stages in a single platform. "
        "The closest competitors \u2014 Fluxx and SmartSimple \u2014 serve only the donor side, "
        "cost significantly more, and lack capacity assessment, marketplace discovery, "
        "and any meaningful focus on the Global South. Kuja is the only platform that "
        "eliminates these gaps by unifying all stages with AI automation throughout."
    )

    add_page_break(doc)

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 9: Revenue Model & Unit Economics
    # ══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "9. Revenue Model & Unit Economics")

    add_heading2(doc, "Pricing Tiers")

    add_heading3(doc, "Application Portal (Donor-Facing)")

    add_styled_table(doc,
        ["Tier", "Annual Cost", "Proposal Volume", "Features"],
        [
            ["Basic", "$10,000/yr", "Up to 10K proposals",
             "Application portal + KujaLink listing + AI support + dashboard"],
            ["Standard", "$12,000\u2013$15,000/yr", "15K\u201320K proposals",
             "Basic + AI matching capabilities"],
            ["Enterprise", "Custom", "20K+ proposals",
             "All features + capacity assessment integration + direct grantee matching"],
        ]
    )

    add_heading3(doc, "ERP Suites (Organization-Facing)")

    add_styled_table(doc,
        ["Suite", "Modules", "Target"],
        [
            ["Basic",
             "Grant management, donor management, accounting, financial reporting",
             "Small CSOs needing core operations"],
            ["Premium",
             "Basic + asset management, procurement, payroll integration",
             "Mid-size organizations"],
            ["Premium+",
             "Premium + project management, HRIS, MEAL, document management",
             "Large NGOs with complex operations"],
        ]
    )

    add_heading2(doc, "2026 Revenue Breakdown")

    add_styled_table(doc,
        ["Stream", "Target", "Notes"],
        [
            ["ERP Software & Outsourcing", "$300K", "Direct sales to donors/INGOs"],
            ["End-to-End Solution", "$650K", "Integrated contracts with donor organizations"],
            ["Application Portal", "$50K", "Self-service + sales-assisted"],
            ["Total", "$1M", ""],
        ]
    )

    add_heading2(doc, "Revenue Trajectory")

    add_body(doc, (
        "$1M in 2026 (validation year) \u2192 Scale through ERP adoption and geographic "
        "expansion in 2027 \u2192 Profitability target at $2M+ ARR in 2029. The "
        "marketplace-to-ERP conversion funnel creates predictable revenue growth: "
        "free marketplace users convert to assessment users, who convert to grant "
        "management subscribers, who convert to ERP customers \u2014 each stage increasing "
        "lifetime value."
    ))

    add_heading2(doc, "Unit Economics Framework")

    add_body(doc, (
        "Customer acquisition cost (CAC) is driven primarily through CSO network "
        "partnerships, reducing the need for expensive outbound marketing. With network "
        "MOUs providing access to 50\u2013500+ organizations per partnership, the effective "
        "CAC per CSO is estimated at $50\u2013200 (cost of network partnership divided by "
        "members activated). For donor enterprise deals, CAC is higher ($2,000\u2013$5,000 "
        "per deal) but offset by annual contract values of $10,000\u2013$20,000+, yielding "
        "a payback period under 6 months. The cross-subsidy model ensures that each "
        "donor contract also onboards CSOs at near-zero marginal cost, creating "
        "compounding network value."
    ))

    add_page_break(doc)

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 10: 2026 Targets & Milestones
    # ══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "10. 2026 Targets & Milestones")

    add_heading2(doc, "Key Performance Indicators")

    add_styled_table(doc,
        ["Metric", "2026 Target"],
        [
            ["Sales revenue", "$1M"],
            ["CSO profiles on marketplace", "2,500"],
            ["INGO/Donor profiles", "25"],
            ["Individual user profiles", "7,500"],
            ["User retention rate", "75%"],
            ["CSO Network MOUs signed", "10"],
            ["CSOs matched to funded grants", "10"],
            ["Donor operational efficiency rating", "75% report improvement"],
        ]
    )

    add_heading2(doc, "Quarterly Milestones")

    add_styled_table(doc,
        ["Quarter", "Key Milestones"],
        [
            ["Q1 2026",
             "Kenya country-level pilot launch. 3 CSO Network MOUs signed (Kenya + DRC). "
             "Platform v3.3.4 live with full AI capabilities."],
            ["Q2 2026",
             "Grant marketplace features go-live. Application portal launch. Global "
             "scaling via Adeso network. First network reselling agreement test."],
            ["Q3 2026",
             "East Africa regional network partnership. Capacity Assessment Tool full "
             "launch. Sub-Saharan Africa geographic expansion begins."],
            ["Q4 2026",
             "Grant matching functionality launch. Assess Kenya model for replication. "
             "Plan 2027 expansion to 20+ Sub-Saharan African countries. Target: 2,500 "
             "CSO profiles, $1M revenue."],
        ]
    )

    add_page_break(doc)

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 11: Team & Traction
    # ══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "11. Team & Traction")

    add_body(doc, (
        "Adeso (African Development Solutions) is a Somali-founded social enterprise "
        "with over 30 years of experience delivering humanitarian and development "
        "programs across Africa. As a co-founder of the NEAR Network \u2014 the largest "
        "network of national and local organizations in the Global South \u2014 Adeso brings "
        "unmatched credibility, relationships, and understanding of the challenges "
        "facing local organizations. Kuja is Adeso\u2019s technology incubation, designed to "
        "solve problems the team has experienced firsthand for three decades."
    ))

    add_heading2(doc, "Current Traction")

    add_bullet(doc, "600+ active users on KujaLink marketplace")
    add_bullet(doc, "200+ local organizations recruited since March 2024")
    add_bullet(doc, "8 pipeline partners in active discussions")
    add_bullet(doc, "Platform live with full AI-powered grant lifecycle management")
    add_bullet(doc, "10 test accounts demonstrating all capabilities to potential partners")

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 12: The Ask
    # ══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "12. The Ask")

    add_callout_box(doc, "How to Partner with Kuja",
        "We are seeking strategic partners who share our vision of democratizing "
        "access to global funding for the Global South. Partnership opportunities "
        "include: (1) Pilot partnerships \u2014 test the platform with your grantee "
        "portfolio, (2) Network partnerships \u2014 introduce Kuja to your CSO member "
        "organizations, (3) Integration partnerships \u2014 connect your systems with "
        "Kuja\u2019s API, (4) Investment \u2014 support our path to scale across Sub-Saharan "
        "Africa and beyond."
    )

    add_body(doc, "Contact: info@adeso.org  |  www.kuja.org  |  www.adesoafrica.org",
             bold=True)

    # ── Footer ────────────────────────────────────────────────────────────────
    create_footer(doc)

    # ── Save ──────────────────────────────────────────────────────────────────
    output_path = os.path.join(OUTPUT_DIR, "Kuja_GTM_Strategy.docx")
    doc.save(output_path)
    file_size = os.path.getsize(output_path)
    print(f"Generated: {output_path}")
    print(f"File size: {file_size:,} bytes ({file_size / 1024:.1f} KB)")
    return output_path


if __name__ == "__main__":
    generate()
