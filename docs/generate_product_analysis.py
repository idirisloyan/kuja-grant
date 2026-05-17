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
        "The platform covers the complete grant lifecycle across eight integrated stages and "
        "is anchored by three category-defining commitments. First, every organization presents "
        "a two-pillar Organisation Trust Profile that travels with them across applications: "
        "a Capacity Profile sourced from five embedded assessment frameworks (Kuja, STEP, UN-HACT, "
        "CHS, NUPAS) that is completed once and passported across donor-specific frameworks; and "
        "a Due Diligence Profile combining continuous sanctions, AML and counter-terrorism financing "
        "screening, government registry and tax-exempt verification across seven African countries "
        "(expanding to all jurisdictions with public verification portals), beneficial-ownership "
        "transparency with donor-staff conflict checks, and daily adverse-media monitoring. Second, "
        "Embedded AI Intelligence is woven into every workflow as a working partner \u2014 it drafts "
        "applications and reports, scores documents in real time as they upload, extracts donor "
        "reporting requirements into a compliance calendar, predicts donor concerns before submission, "
        "explains compliance findings in plain language, generates auditable reviewer rationales, and "
        "answers operational questions \u2014 grounded in the user's own evidence, traceable to its "
        "sources, and editable end to end. Third, compliance is simplified for both sides of the "
        "relationship: NGOs are supported through every obligation (extract, plan, draft, score, "
        "submit); donors receive pre-assessed, pre-scored reports plus a 4-pillar health score "
        "with trajectory forecasting that surfaces grants drifting off track before they slip."
    )

    add_body(doc,
        "The eight lifecycle stages are marketplace discovery (kuja.org), the Capacity Profile "
        "pillar, the Due Diligence Profile pillar, AI-powered grant matching with top-strength "
        "and top-blocker signals, two-path grant creation and AI-co-authored application drafting "
        "with real-time document scoring and pre-submission readiness checks, reviewer evaluation "
        "with one-screen summaries and evidence extraction, AI-supported reporting with donor-perspective "
        "pre-flight checks and a 4-pillar compliance health score, and back-end ERP for operations "
        "built on Odoo 17. The entire platform is delivered as a progressive web application that "
        "operates offline-first on mobile devices \u2014 a requirement, not an afterthought, for the "
        "low-connectivity environments where Global South CSOs operate."
    )

    add_body(doc,
        "The global grant management software market is valued at $2.75 billion (2024) and "
        "is projected to reach $4.79 billion by 2030, growing at a CAGR of 10.3%. No existing "
        "platform combines marketplace, two-pillar trust profile, embedded AI intelligence, "
        "compliance support for both sides, and ERP operations in a single integrated solution "
        "designed specifically for the Global South. The dissolution of USAID in 2025 \u2014 with "
        "83% of programs cancelled and $36 billion in aid cuts \u2014 has created urgent demand for "
        "diversified funding infrastructure and direct donor-to-NGO connections, positioning Kuja "
        "at the intersection of market need and sector transformation."
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
    add_heading2(doc, "Stage 2 \u2014 Capacity Profile with Passporting (Trust Pillar 1)")

    add_body(doc,
        "Kuja\u2019s capacity assessment is built around a single product principle: the NGO "
        "should do the work once and have it carry forward to every donor. Five industry-standard "
        "frameworks ship today (Kuja, STEP, UN-HACT, CHS, NUPAS); donors can also define entirely "
        "custom frameworks tailored to their portfolio. Regardless of which framework the donor "
        "requires, the system passports the NGO\u2019s prior assessment across by mapping equivalent "
        "questions and prefilling responses with traceable provenance back to the original answer."
    )

    add_bullet(doc, "Five frameworks live today: Kuja (proprietary), STEP (TechSoup), UN-HACT, CHS, NUPAS")
    add_bullet(doc,
        "Custom donor framework builder: Donors can compose their own assessment from a question "
        "bank with configurable weights, evidence requirements, and scoring rubric \u2014 with "
        "an AI-drafted starting point derived from the grant\u2019s focus area"
    )
    add_bullet(doc,
        "Passporting: An NGO\u2019s completed assessment becomes their Capacity Profile (the first "
        "pillar of the Trust Profile). When applying to any grant, the system passports the profile "
        "into the target framework via maintained translation tables, with AI proposing mappings "
        "where curated translations don\u2019t exist. Each prefilled response carries provenance "
        "showing the source assessment, framework, and date."
    )
    add_bullet(doc,
        "Effort reduction: First-time NGOs complete a capacity assessment in days; subsequent "
        "applications complete the capacity section in under an hour rather than twelve."
    )
    add_bullet(doc,
        "AI co-authoring: Initial responses drafted by drawing on prior assessments, uploaded "
        "supporting documents, and organisational memory \u2014 with claim-level provenance"
    )
    add_bullet(doc,
        "AI gap prioritisation: Predicts which capacity gaps are most likely to disqualify the "
        "NGO from a specific grant, helping them prioritise improvement effort"
    )
    add_bullet(doc, "Donor readiness scoring: private philanthropy, bilateral donors, multilateral agencies, UN system")
    add_bullet(doc,
        "Passport completion percentage surfaced on the NGO dashboard so they see how "
        "application-ready they are across major frameworks"
    )

    add_heading3(doc, "Technical Implementation")
    add_bullet(doc,
        "AI inference via the platform\u2019s language-model integration; vendor-agnostic, "
        "easily swappable as the model market evolves"
    )
    add_bullet(doc, "Assessment prompts structured per-framework with framework-specific scoring rubrics")
    add_bullet(doc,
        "Document analysis: PDF (text + scanned via vision fallback), DOCX, XLSX, plain text, "
        "images \u2192 extraction \u2192 AI evaluation against framework criteria"
    )
    add_bullet(doc,
        "Cross-framework mapping tables maintained for curated equivalents; AI proposes mappings "
        "for novel framework pairs with low-confidence flagging for human confirmation"
    )
    add_bullet(doc, "Results stored as structured JSON with per-criterion scores (0-100) and provenance ledger")

    # --- Stage 3 ---
    add_heading2(doc, "Stage 3 \u2014 Due Diligence Profile (Trust Pillar 2)")

    add_body(doc,
        "The second pillar of the Organisation Trust Profile is a continuous due-diligence record "
        "that verifies legal standing, screens against sanctions and watchlists, tracks beneficial "
        "ownership, and monitors adverse media \u2014 all done once per organisation and passported "
        "across applications. This replaces manual due-diligence processes that typically cost "
        "donors $5,000-$15,000 per organisation and reduces friction for NGOs facing fragmented "
        "compliance requirements from every donor."
    )

    add_body(doc,
        "Due diligence on Kuja comprises four sub-pillars, all passported via the Trust Profile."
    )

    add_heading3(doc, "Sanctions, AML & CTF screening")
    add_bullet(doc,
        "Screened against UN Security Council, US OFAC SDN, EU Financial Sanctions, and World Bank "
        "Debarment lists, extended to AML watchlists and counter-terrorism-financing designations "
        "for procurement-grade coverage"
    )
    add_bullet(doc, "Continuous re-screening on schedule, on change events, and on every new application")
    add_bullet(doc,
        "Coverage extends to declared beneficial owners and named officers, not just the "
        "organisation entity"
    )
    add_bullet(doc,
        "AI false-positive triage: weighs disambiguators (country, sector, date of birth, "
        "address) and recommends a determination that a compliance officer confirms"
    )

    add_heading3(doc, "Registration & Standing Verification")
    add_bullet(doc,
        "7 government registries live today: Kenya NGO Coordination Board, Nigeria CAC, "
        "South Africa DSD NPO Registry, Uganda NGO Bureau, Tanzania NiS, Somalia MOIFAR, Ethiopia ACSO"
    )
    add_bullet(doc,
        "Expansion-ready architecture: Adding a new country requires only a registry adapter; "
        "goal is all Global South countries with public verification portals"
    )
    add_bullet(doc,
        "Verifies registered legal name, status, registration number, and (where available) "
        "principal officer names against organisation-claimed values"
    )
    add_bullet(doc,
        "Tax-exempt and charitable-status certification verified per country where the platform "
        "has access to the authoritative registry"
    )
    add_bullet(doc,
        "Periodic re-verification with active alerts when a previously verified registration "
        "lapses, is suspended, or changes status"
    )

    add_heading3(doc, "Beneficial Ownership Transparency")
    add_bullet(doc,
        "Captures and verifies declared beneficial owners, board officers, and key principals, "
        "with each disclosure timestamped and signed"
    )
    add_bullet(doc,
        "Conflict-of-interest checks against donor staff directories surface potential conflicts "
        "for compliance review before award"
    )
    add_bullet(doc, "Ownership-chain disclosure for parent and affiliate entities")
    add_bullet(doc, "Historical preservation: who owned or controlled the organisation at the time of any grant")

    add_heading3(doc, "Adverse Media Monitoring")
    add_bullet(doc,
        "Daily scan of curated regional and international news sources for adverse-media "
        "mentions referencing organisations on the platform"
    )
    add_bullet(doc,
        "AI classifies relevance (does the article actually reference this org?) and severity, "
        "then raises a risk register entry automatically when thresholds are crossed"
    )
    add_bullet(doc,
        "Plain-language summary of each finding with source link and suggested next steps \u2014 "
        "respecting press-freedom considerations by surfacing findings as signals for review, "
        "not judgments"
    )
    add_bullet(doc, "Namesake disambiguation using country, sector, and prior context")

    add_heading3(doc, "Technical Implementation")
    add_bullet(doc, "Primary screening: OpenSanctions API with API key authentication")
    add_bullet(doc, "Fallback: Direct download and parse of UN XML, OFAC CSV, EU CSV when the primary feed is unavailable")
    add_bullet(doc, "Government registries: HTTP-based country-specific parsers")
    add_bullet(doc, "Certificate analysis and adverse-media summarisation: language-model extraction with structured output")
    add_bullet(doc,
        "Trust Profile passports across applications: verifications are reusable across donors "
        "with appropriate refresh cadence; donors see the stamp and validity window without "
        "burdening the NGO to re-submit"
    )

    # --- Stage 4 ---
    add_heading2(doc, "Stage 4 \u2014 AI-Powered Grant Matching")

    add_bullet(doc,
        "Computes an alignment score per NGO-grant pair on eligibility, sector, geography, "
        "capacity (from the passport), and track record"
    )
    add_bullet(doc,
        "Surfaces top strength and top blocker on every match so NGOs know whether the grant "
        "is worth the investment of time before they start"
    )
    add_bullet(doc, "Donor-side: ranks qualified grantees with the same multi-factor scoring")
    add_bullet(doc, "Multi-language: EN, FR, AR, SW, SO, ES natively \u2014 six interface languages at parity")

    # --- Stage 5 ---
    add_heading2(doc, "Stage 5 \u2014 Two-Path Grant Creation and AI-Co-Authored Applications")

    add_body(doc,
        "The system supports two equally-fast paths for donors to create a grant and an "
        "AI-co-authored experience for NGOs to apply. Real-time document scoring tightens the "
        "feedback loop during upload, and the pre-submission readiness check catches gaps before "
        "they become rejections."
    )

    add_heading3(doc, "Two paths for donors to create a grant")
    add_bullet(doc,
        "Path A \u2014 Provide a 2-line donor prompt; the system drafts a complete grant scaffold "
        "(title, description, criteria with weights, eligibility, document and reporting "
        "requirements, recommended deadline) as an editable starting point"
    )
    add_bullet(doc,
        "Path B \u2014 Upload an existing brief (PDF, DOCX, plain text); the system extracts the "
        "structured content and maps it into the wizard\u2019s six steps"
    )
    add_bullet(doc,
        "Either path lands in the same editable six-step wizard. The donor refines, then runs the "
        "applicant-burden critique and median-NGO preview before publishing"
    )

    add_heading3(doc, "NGO application experience")
    add_bullet(doc,
        "Four-step application wizard with AI co-author drafting each criterion response by "
        "drawing on the NGO\u2019s capacity passport, prior applications, uploaded documents, and "
        "organisational memory \u2014 every claim linked to its source"
    )
    add_bullet(doc,
        "Real-time document scoring: as files upload (PDF text + scanned, DOCX, XLSX, plain text, "
        "JPG, PNG), the system displays a score against the donor\u2019s specific requirements with "
        "classified findings and one-click clarification notes"
    )
    add_bullet(doc,
        "Supported types: financial reports, audit reports, project proposals, budgets, "
        "impact reports, certificates, policies, photographs taken in the field"
    )
    add_bullet(doc,
        "Pre-submission readiness check identifies missing evidence, overclaims, generic answers, "
        "and weak passages with one-click rewrites \u2014 each classified blocker, weak, or polish"
    )
    add_bullet(doc,
        "Compliance pre-empt: scans the application for compliance risks before submission "
        "(eligibility gaps, missing documents, financial inconsistencies, narrative-versus-data "
        "contradictions) and proposes specific fixes"
    )

    add_heading3(doc, "Technical Implementation")
    add_bullet(doc,
        "Document analysis applies donor-specific evaluation criteria with priority levels "
        "(Critical, Important, Nice to Have)"
    )
    add_bullet(doc,
        "AI response parsed into structured findings with per-requirement scores, risk flags, "
        "and improvement suggestions"
    )
    add_bullet(doc, "Scanned/image-only PDFs fall back to vision-based extraction so field-collected evidence is never silently rejected")
    add_bullet(doc, "File size limit: 25MB per upload; text extracted before AI evaluation to manage token costs")

    add_page_break(doc)

    # --- Stage 6 ---
    add_heading2(doc, "Stage 6 \u2014 Review with One-Screen AI Summary")

    add_body(doc,
        "Reviewer time is the scarcest resource in the grant lifecycle. The system shall give "
        "every reviewer a one-screen synthesis per application with evidence cited per criterion "
        "\u2014 turning hours of careful reading into minutes of structured judgment."
    )

    add_bullet(doc,
        "One-screen summary: who the NGO is, what they propose, why-strong and why-weak summary, "
        "evidence per criterion (verbatim quotes for and against), decision-changers (what would "
        "shift the score), comparable signal against the cohort, red flags"
    )
    add_bullet(doc,
        "Evidence extraction: verbatim supporting, contradicting, and neutral quotes per rubric "
        "criterion so reviewers cite specific evidence instead of writing rationale from memory"
    )
    add_bullet(doc, "Draft rationale per criterion the reviewer accepts, edits, or overrides")
    add_bullet(doc,
        "Suggest-criteria: when a grant has no rubric defined, AI proposes a calibrated rubric "
        "with labels, descriptions, weights summing to 100, and per-criterion rationale"
    )
    add_bullet(doc, "Dual scoring: AI baseline + human reviewer judgment, both recorded in the decision audit")
    add_bullet(doc, "Donor-configurable evaluation criteria with 3 priority levels and custom weightings")
    add_bullet(doc, "AI-ranked shortlists for reviewer efficiency")
    add_bullet(doc, "Every decision recorded in the tamper-evident audit chain")

    # --- Stage 7 ---
    add_heading2(doc, "Stage 7 \u2014 Compliance Support for NGOs and Donor-Side Health Monitoring")

    add_body(doc,
        "The compliance stage is the platform\u2019s flagship: it simplifies compliance and risk for "
        "BOTH sides. NGOs are supported through every obligation; donors receive pre-assessed, "
        "pre-scored reports plus a 4-pillar compliance health score with trajectory forecasting "
        "that surfaces grants drifting off track before they slip."
    )

    add_heading3(doc, "For NGOs \u2014 embedded AI as compliance working partner")
    add_bullet(doc,
        "Extracts donor reporting requirements from the grant agreement into a structured "
        "obligation list \u2014 cadence, indicators, narrative sections, budget format, document-of-record"
    )
    add_bullet(doc,
        "Translates donor-specific language into clear NGO-side action items: \"submit Q1 progress "
        "report by 30 June including indicator data on visits completed, with budget reconciliation\""
    )
    add_bullet(doc,
        "Maintains a compliance calendar per NGO with every upcoming obligation across every "
        "active grant, with date, type, status, and grant attribution"
    )
    add_bullet(doc,
        "Sends proactive reminders ahead of each obligation \u2014 in-app, email, and web push to "
        "subscribed mobile devices \u2014 escalating as deadlines approach"
    )
    add_bullet(doc,
        "Drafts a first-pass narrative for each progress report from prior reports, captured "
        "indicator data, and uploaded evidence \u2014 the NGO refines"
    )
    add_bullet(doc,
        "Prompts the NGO to upload the right evidence at the right time: \"your indicator data "
        "shows 88% CHW retention this quarter \u2014 attach training attendance records that support this\""
    )
    add_bullet(doc,
        "Scores every uploaded document against the donor\u2019s specific requirements in real time, "
        "with classified findings and one-click clarifications"
    )
    add_bullet(doc,
        "Donor-perspective pre-flight: predicts the specific concerns the donor will raise (vague "
        "claims, unexplained budget variance, missing evidence) and offers a specific fix per concern"
    )
    add_bullet(doc,
        "Guides NGOs through donor revision requests with AI-drafted updates the NGO accepts, edits, "
        "or overrides \u2014 closing revision cycles in one round instead of three"
    )

    add_heading3(doc, "For donors \u2014 pre-assessed reports + portfolio health monitoring")
    add_bullet(doc,
        "Every progress report arrives with an AI pre-assessment attached: section-level summary, "
        "indicator validation, budget reconciliation status, evidence coverage, composite quality score"
    )
    add_bullet(doc,
        "4-pillar compliance health score per active grant (completion 30%, timeliness 30%, "
        "workflow 20%, importance 20%) classifying each grant as on-track, at-risk, or high-risk"
    )
    add_bullet(doc,
        "Daily snapshot of each active grant\u2019s compliance health; linear-regression trajectory "
        "forecast over the trailing 60 days projects when grants will slip"
    )
    add_bullet(doc,
        "Slips-in-N-days badge surfaced on the donor dashboard for grants forecast to drop below "
        "the at-risk threshold within 30 days, colour-coded by urgency"
    )
    add_bullet(doc,
        "Risk register: structured entries with severity, owner, due date, response, and lifecycle "
        "(open, mitigating, mitigated, accepted, dismissed)"
    )
    add_bullet(doc,
        "Portfolio insights panel: AI-generated headline, anomalies, and the next decisions the "
        "donor owes \u2014 tied to specific applications and grants"
    )
    add_bullet(doc,
        "Plain-language explanation of every finding: sanctions matches, registry discrepancies, "
        "compliance pillar contributors \u2014 translated for non-specialist readers"
    )
    add_bullet(doc,
        "Structured collaboration via threaded comments with @-mentions and web push \u2014 every "
        "clarification, revision request, and risk response preserved on the record"
    )

    add_heading3(doc, "Technical Implementation")
    add_bullet(doc,
        "Grant agreement parsing: language-model extraction into structured JSON "
        "(requirement_type, description, deadline, frequency)"
    )
    add_bullet(doc,
        "Report evaluation: each submitted report scored against every extracted requirement "
        "with individual pass/fail/partial determinations"
    )
    add_bullet(doc, "Risk flag categories: Missing, Late, Incomplete, Non-Compliant")
    add_bullet(doc,
        "Async dispatch: heavy AI work (drafting, scoring, summarisation) runs in the background "
        "so the user\u2019s request returns immediately and the model has the time it needs"
    )
    add_bullet(doc,
        "Tamper-evident audit chain: every screening result, verification stamp, evidence score, "
        "report submission, decision, and risk lifecycle transition recorded with cryptographic linkage"
    )

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
    add_heading1(doc, "3. Embedded AI Intelligence & Technical Architecture")

    add_body(doc,
        "Kuja\u2019s AI is not a chatbot bolted onto a database. It is an embedded intelligence "
        "layer woven through every workflow \u2014 drafting, scoring, predicting, extracting, "
        "reasoning, and explaining. The system uses large-language-model inference under a "
        "small number of explicit design principles that together distinguish a working AI "
        "partner from surface-level assistance."
    )

    add_heading2(doc, "Design principles for AI use")

    add_bullet(doc,
        "Grounded, not generic. Every AI output draws on the user\u2019s actual data \u2014 organisation "
        "profile, capacity passport, prior submissions, uploaded documents, the grant they\u2019re "
        "viewing. Where evidence is missing, the system says so rather than inventing.",
        bold_prefix="Grounded. "
    )
    add_bullet(doc,
        "Action-oriented. Every AI output is an editable starting point or a structured "
        "decision aid (gap list, evidence list, rewrite, score with rationale) \u2014 never a "
        "paragraph the user has to re-interpret.",
        bold_prefix="Action-oriented. "
    )
    add_bullet(doc,
        "Traceable. Every AI claim links to its source so applicants verify their drafts and "
        "reviewers see what evidence informed each finding.",
        bold_prefix="Traceable. "
    )
    add_bullet(doc,
        "Honest about uncertainty. AI output surfaces its own confidence and falls back to "
        "deterministic templates or rule-based logic when the AI service is unavailable. Users "
        "always see a usable interface.",
        bold_prefix="Honest. "
    )
    add_bullet(doc,
        "Multilingual and role-aware. AI output is produced in the user\u2019s preferred language "
        "with tone appropriate to their role: warm and coaching for NGOs; precise and "
        "decision-oriented for donors and reviewers.",
        bold_prefix="Multilingual. "
    )
    add_bullet(doc,
        "Auditable. Every AI call produces a telemetry record (endpoint, model, tokens, "
        "latency, success, user, language, role) administrators can inspect.",
        bold_prefix="Auditable. "
    )
    add_bullet(doc,
        "Cost-aware. Heavy AI work executes asynchronously so the user\u2019s request returns "
        "immediately and the model has the time it needs. Daily 30-day cost projection vs. "
        "budget surfaces to administrators.",
        bold_prefix="Cost-aware. "
    )

    add_heading2(doc, "AI Surfaces Across the Workflow")

    add_styled_table(doc,
        headers=["Surface", "Workspace", "What the system does"],
        rows=[
            ["Match scoring", "NGO + Donor",
             "Scores every NGO-grant pair on eligibility, sector, geography, capacity, track "
             "record; surfaces top strength + top blocker"],
            ["Application co-author", "NGO",
             "Drafts a complete first-pass application from passport, prior submissions, "
             "uploaded documents, and organisational memory \u2014 every claim linked to its source"],
            ["Real-time document scoring", "NGO",
             "As files upload, scores against the donor\u2019s specific requirements with classified "
             "findings and one-click clarification notes"],
            ["Submission readiness", "NGO",
             "Pre-submission gap analysis: missing evidence, overclaims, generic answers, "
             "weak passages with one-click rewrites"],
            ["Compliance pre-empt", "NGO",
             "Scans application for compliance risks before submit; proposes specific fixes"],
            ["Grant brief from prompt", "Donor",
             "Drafts a complete grant scaffold from a 2-line donor prompt"],
            ["Grant import from file", "Donor",
             "Extracts an existing grant brief (PDF, DOCX, TXT) into the wizard"],
            ["Median-NGO preview", "Donor",
             "Predicts how the median qualifying NGO will respond; rates discriminative power per criterion"],
            ["Burden critique", "Donor",
             "Spots vague or unfair criteria pre-publish; proposes alternatives"],
            ["Reviewer summary", "Reviewer",
             "One-screen synthesis: who/what/why-strong/why-weak, evidence per criterion, "
             "decision-changers, comparable signal, draft rationale"],
            ["Evidence extraction", "Reviewer",
             "Verbatim supporting, contradicting, and neutral quotes per rubric criterion"],
            ["Suggest-criteria", "Reviewer + Donor",
             "When a grant has no rubric, proposes a calibrated rubric with weights summing to 100"],
            ["Report co-author", "NGO",
             "Drafts narrative from prior reports + indicator data + uploaded evidence"],
            ["Donor pre-flight", "NGO",
             "Predicts donor concerns about a report and offers specific fixes per concern"],
            ["Compliance to-do list", "NGO",
             "Extracts donor obligations into a calendar; sends proactive reminders ahead of deadlines"],
            ["Compliance health narrative", "Donor",
             "Plain-language explanation of the 4-pillar score: why on-track or at-risk"],
            ["Portfolio insights", "Donor",
             "Headline, anomalies, and next decisions tied to specific applications and grants"],
            ["Cross-grant patterns", "Donor",
             "Patterns across declined applications: common shortfalls, systematic misalignment"],
            ["Compliance explanation", "Donor + Admin",
             "Translates sanctions, registry, and risk findings into plain language with suggested next steps"],
            ["Adverse media triage", "Donor + Admin",
             "Daily news scan with AI classification of relevance and severity; auto-raises risk register entries"],
            ["Ask Kuja", "All",
             "Conversational agent that queries read-only data tools, role-checked and org-scoped"],
        ]
    )

    doc.add_paragraph()  # spacer

    add_heading2(doc, "Architecture Stack")

    add_bullet(doc, "Backend: Python 3.x / Flask")
    add_bullet(doc, "Frontend: Next.js (static export), shadcn/ui, Tailwind \u2014 Progressive Web App")
    add_bullet(doc, "Database: SQLite (development) / PostgreSQL (production)")
    add_bullet(doc,
        "AI inference: large-language-model integration (vendor-agnostic; the platform\u2019s AI "
        "adapter abstracts the underlying provider so the model can be swapped as the market evolves)"
    )
    add_bullet(doc, "Async AI dispatcher: heavy AI calls run in the background pool with poll-to-completion semantics")
    add_bullet(doc, "Per-user concurrent-AI cap prevents any single client from saturating workers")
    add_bullet(doc, "Sanctions: OpenSanctions API + direct UN/OFAC/EU file parsing fallback")
    add_bullet(doc,
        "Registry: HTTP-based government registry verification (7 countries live; "
        "designed to expand to all Global South jurisdictions with public portals)"
    )
    add_bullet(doc, "Web push: VAPID-based push notifications to subscribed mobile devices")
    add_bullet(doc, "Deployment: Railway (PaaS); horizontally scalable")
    add_bullet(doc, "Languages: English, Arabic, French, Swahili, Somali, Spanish at parity")

    add_heading2(doc, "AI Observability & Operations")

    add_bullet(doc,
        "AI surface health probe runs daily against synthetic fixtures, exercising every "
        "flagship AI surface and raising an administrator notification on any drift"
    )
    add_bullet(doc,
        "AI cost telemetry per endpoint with daily 30-day projection compared to a configurable "
        "budget threshold"
    )
    add_bullet(doc,
        "Demo-readiness scanner identifies sparse-data risks across the prod dataset "
        "(grants without criteria, applications without docs, reports missing timestamps) so "
        "admins curate before showing the product"
    )
    add_bullet(doc, "Every AI call logged with model, tokens, latency, success, user, language, and role")

    add_heading2(doc, "Security & Compliance")

    add_bullet(doc, "JWT-based authentication with secure token generation and expiry management")
    add_bullet(doc, "Two-factor authentication via TOTP with recovery codes; hard-enforceable for administrators")
    add_bullet(doc,
        "Role-based access control: admin, ngo, donor, reviewer \u2014 enforced at API and UI layers, "
        "with per-organisation data isolation"
    )
    add_bullet(doc,
        "Tamper-evident hash-chained audit log for security-relevant events: authentication, "
        "authorisation, permission changes, sanctions findings, administrative actions"
    )
    add_bullet(doc, "API key management via environment variables \u2014 never stored in source code or client-side")
    add_bullet(doc,
        "Strict Content Security Policy: no third-party script origins, frame-ancestors none, "
        "object-src none, block-all-mixed-content"
    )
    add_bullet(doc, "Data encryption in transit (HTTPS/TLS) enforced across all endpoints")
    add_bullet(doc, "PostgreSQL with parameterized queries to prevent SQL injection")
    add_bullet(doc, "Per-operation named rate-limit policies (login, AI extraction, AI heavy, uploads, mutations, bulk) \u2014 opt-in Redis backend for cross-worker consistency")
    add_bullet(doc, "GDPR right-to-be-forgotten endpoint preserves audit chain integrity while expunging personal data")
    add_bullet(doc, "File upload restrictions: type validation, size limits, server-side text extraction")

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
        ("Embedded AI Intelligence (action-oriented, grounded, traceable)",
                                       ["Y", "P", "P", "P", "\u2014", "\u2014", "P", "\u2014", "P"]),
        ("Two-Pillar Organisation Trust Profile",
                                       ["Y", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014"]),
        ("Multi-Framework Capacity Assessment", ["Y", "\u2014", "\u2014", "\u2014", "P", "Y", "\u2014", "\u2014", "\u2014"]),
        ("Capacity Passporting (one assessment, many frameworks)",
                                       ["Y", "\u2014", "\u2014", "\u2014", "P", "P", "\u2014", "\u2014", "\u2014"]),
        ("Custom Donor Framework Builder",
                                       ["Y", "P", "P", "Y", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014"]),
        ("Two-Sided Marketplace", ["Y", "\u2014", "\u2014", "\u2014", "P", "\u2014", "\u2014", "Y", "\u2014"]),
        ("Match Scoring with Top-Strength / Top-Blocker",
                                       ["Y", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "P"]),
        ("Two Paths to Create a Grant (prompt OR PDF extract)",
                                       ["Y", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014"]),
        ("AI Application Co-Author with Provenance",
                                       ["Y", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014"]),
        ("Real-Time Document Scoring on Upload",
                                       ["Y", "P", "P", "P", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014"]),
        ("Donor-Aware Document Analysis",
                                       ["Y", "P", "P", "P", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014"]),
        ("Pre-Submission Readiness + Compliance Pre-Empt",
                                       ["Y", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014"]),
        ("Reviewer One-Screen Summary + Evidence Extraction",
                                       ["Y", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014"]),
        ("Sanctions / AML / CTF Screening",
                                       ["Y", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "Y", "\u2014", "\u2014"]),
        ("Government Registry & Standing Verification",
                                       ["Y", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "P", "\u2014", "\u2014"]),
        ("Tax-Exempt Status Verification per Country",
                                       ["Y", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014"]),
        ("Beneficial Ownership Transparency + COI Check",
                                       ["Y", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "P", "\u2014", "\u2014"]),
        ("Adverse Media Monitoring (daily, AI-classified)",
                                       ["Y", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "Y", "\u2014", "\u2014"]),
        ("AI Compliance Calendar + Proactive Reminders",
                                       ["Y", "\u2014", "\u2014", "P", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014"]),
        ("AI Report Drafting from Prior Data",
                                       ["Y", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014"]),
        ("Donor-Perspective Report Pre-Flight",
                                       ["Y", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014"]),
        ("4-Pillar Compliance Health Score",
                                       ["Y", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014"]),
        ("Trajectory Forecast + Slips-in-N-Days Warning",
                                       ["Y", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014"]),
        ("Risk Register with Owner + Due Date",
                                       ["Y", "P", "\u2014", "P", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014"]),
        ("Organisational Memory + Provenance Ledger",
                                       ["Y", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014"]),
        ("Structured @mention Collaboration + Web Push",
                                       ["Y", "\u2014", "P", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014"]),
        ("Six-Language Native UI (EN/AR/FR/SW/SO/ES) with Role-Aware Tone",
                                       ["Y", "P", "\u2014", "Y", "Y", "\u2014", "\u2014", "P", "\u2014"]),
        ("Mobile-First Progressive Web App",
                                       ["Y", "P", "Y", "P", "P", "\u2014", "\u2014", "Y", "Y"]),
        ("Offline-First with Background Sync",
                                       ["Y", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014"]),
        ("Donor Configuration of Criteria + Weights",
                                       ["Y", "Y", "Y", "Y", "P", "\u2014", "\u2014", "\u2014", "\u2014"]),
        ("Grant Application Portal", ["Y", "Y", "Y", "Y", "Y", "\u2014", "\u2014", "Y", "\u2014"]),
        ("Review & Award Workflow", ["Y", "Y", "Y", "Y", "Y", "\u2014", "\u2014", "\u2014", "\u2014"]),
        ("ERP Integration (Odoo)", ["Y", "P", "\u2014", "P", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014"]),
        ("Multi-Tenancy", ["Y", "P", "\u2014", "P", "Y", "\u2014", "\u2014", "\u2014", "\u2014"]),
        ("Tamper-Evident Audit Chain", ["Y", "Y", "Y", "Y", "Y", "\u2014", "Y", "\u2014", "\u2014"]),
        ("Hard-Enforceable Admin 2FA", ["Y", "Y", "P", "Y", "Y", "\u2014", "Y", "\u2014", "\u2014"]),
        ("AI Surface Health + Cost Forecast (admin)",
                                       ["Y", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014"]),
        ("Free Tier for CSOs", ["Y", "\u2014", "\u2014", "\u2014", "Y", "\u2014", "\u2014", "\u2014", "\u2014"]),
        ("Global South Design", ["Y", "\u2014", "\u2014", "P", "Y", "P", "\u2014", "Y", "\u2014"]),
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
        "Kuja delivers full support (Y) across every row, including 17 differentiators not "
        "offered by any competitor: two-pillar trust profile, capacity passporting, custom donor "
        "framework builder, two-path grant creation, AI application co-author with provenance, "
        "real-time document scoring, pre-submission readiness, reviewer one-screen summary, "
        "tax-exempt verification, beneficial-ownership transparency, AI compliance calendar, AI "
        "report drafting, donor-perspective pre-flight, 4-pillar compliance health, slips-in-N-days "
        "trajectory forecast, organisational memory, structured collaboration with web push, "
        "six-language native UI with role-aware tone, offline-first PWA, and admin AI surface "
        "health monitoring. The closest competitor on legacy features (Fluxx) does not offer any "
        "of these differentiators; SmartSimple offers partial parity on two. No competitor "
        "combines marketplace + two-pillar trust profile + embedded AI intelligence in a single "
        "Global-South-first platform.",
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

    add_body(doc,
        "Kuja\u2019s differentiation rests on ten commitments. The first three are category-defining "
        "capabilities no competitor offers; the next four are structural advantages competitors "
        "would need years to build; the final three are about who Kuja is."
    )

    add_numbered_item(doc, 1, "EMBEDDED AI INTELLIGENCE, NOT A CHATBOT",
        "AI is woven through every workflow as a working partner: it drafts applications and "
        "reports, scores documents in real time as they upload, extracts donor reporting "
        "requirements into a compliance calendar, predicts donor concerns before submission, "
        "generates auditable reviewer rationales, translates compliance findings into plain "
        "language, and surfaces risks before they escalate. Every AI output is grounded in the "
        "user\u2019s actual evidence, traceable to its sources, action-oriented (an editable starting "
        "point), and falls back gracefully when the AI service is unavailable. This is "
        "architectural \u2014 not a feature you can graft on. Competitors offering AI today provide "
        "either generic chatbots or analytics dashboards, not a working AI partner woven into the "
        "lifecycle."
    )

    add_numbered_item(doc, 2, "TWO-PILLAR ORGANISATION TRUST PROFILE",
        "Every NGO on Kuja presents a Trust Profile composed of two distinct pillars that "
        "travel with them across applications. The Capacity Profile answers \"can this org "
        "execute?\" \u2014 sourced from completed assessments across embedded frameworks and "
        "passported to any donor\u2019s framework via maintained mappings. The Due Diligence Profile "
        "answers \"is this org safe to fund?\" \u2014 combining continuous sanctions/AML/CTF screening, "
        "government registration and tax-exempt verification, beneficial-ownership transparency "
        "with donor-staff conflict checks, and daily adverse-media monitoring. No competitor "
        "offers both pillars together; no competitor offers passporting on the due-diligence side."
    )

    add_numbered_item(doc, 3, "COMPLIANCE SIMPLIFIED FOR BOTH SIDES",
        "Compliance is the most expensive friction in the grant relationship. Kuja simplifies "
        "it for both sides simultaneously. NGOs get a compliance co-pilot: extracts donor "
        "reporting requirements into a calendar, sends proactive reminders, drafts report "
        "narratives from prior data, scores evidence as it uploads, predicts donor concerns, "
        "and guides revision responses. Donors get pre-assessed, pre-scored reports plus a "
        "4-pillar compliance health score, daily trajectory snapshots, slips-in-N-days "
        "forecasting, and a risk register with owners and due dates. The donor is never "
        "surprised; the NGO is never blocked."
    )

    add_numbered_item(doc, 4, "ONLY END-TO-END PLATFORM",
        "Kuja is the only solution combining marketplace discovery, two-pillar trust profile, "
        "AI-co-authored applications, dual-scoring review, AI-supported reporting with portfolio "
        "health monitoring, and ERP operations in a single platform. Organisations and donors "
        "never switch between disconnected tools or re-enter data."
    )

    add_numbered_item(doc, 5, "MOBILE-FIRST, OFFLINE-FIRST",
        "Kuja runs as a progressive web application installable on a phone. Field officers in "
        "low-connectivity areas draft applications, complete capacity assessments, write progress "
        "reports, fill out indicator data, and capture evidence photographs without an active "
        "connection. Work auto-saves to the device; uploads sync in the background when the "
        "network returns. This is a structural commitment to the operating reality of Global "
        "South NGOs, not a feature flag."
    )

    add_numbered_item(doc, 6, "BUILT BY AND FOR THE GLOBAL SOUTH",
        "Adeso\u2019s 30+ years of humanitarian experience across Africa informs every design "
        "decision. Six interface languages at parity (English, Arabic, French, Swahili, Somali, "
        "Spanish) with role-appropriate tone \u2014 warm and coaching for NGOs, precise and "
        "decision-oriented for donors. Multi-currency operations, low-bandwidth optimisation, "
        "scanned-document handling, and culturally appropriate UX patterns. No competitor "
        "operates at this level of Global South coverage."
    )

    add_numbered_item(doc, 7, "DUAL-SIDED NETWORK EFFECTS",
        "Kuja serves both sides of the funding equation. CSOs gain visibility, a portable "
        "Trust Profile, an AI working partner for every application and report, and a calendar "
        "of obligations. Donors gain a vetted pipeline, pre-assessed reports, portfolio health "
        "monitoring, and trajectory forecasting. More CSOs attract more donors, which attract "
        "more CSOs."
    )

    add_numbered_item(doc, 8, "AUDITABLE BY CONSTRUCTION",
        "Every AI claim is traceable to its source via a provenance ledger. Every "
        "compliance-relevant event is recorded in a tamper-evident hash-chained audit log: "
        "authentications, sanctions findings, verification stamps, document scores, decisions, "
        "risk lifecycle transitions. Donor compliance officers can override AI determinations "
        "with rationale that itself becomes part of the record. This is procurement-grade "
        "auditability \u2014 not an afterthought."
    )

    add_numbered_item(doc, 9, "SEAMLESS ERP CONVERSION",
        "Organisations that adopt KujaBuild (Odoo 17) benefit from seamless onboarding \u2014 most "
        "organisational data is already captured through marketplace registration, capacity "
        "assessment, application, and reporting stages. Multi-tenancy allows donors to access "
        "real-time financial data for their grants."
    )

    add_numbered_item(doc, 10, "CREDIBILITY OF ADESO",
        "As a Somali-founded organisation with three decades of impact across Africa and "
        "co-founder of the NEAR Network (the largest network of national and local "
        "organisations in the Global South), Adeso brings unmatched sector credibility. Kuja "
        "is not a Silicon Valley startup attempting to serve communities it does not understand "
        "\u2014 it is a solution built by the communities it serves."
    )

    add_numbered_item(doc, 11, "SUSTAINED AI CONVERSATION INSTEAD OF ONE-SHOT PROMPTS",
        "Every AI surface in Kuja used to be one-shot \u2014 ask, answer, forget. Phase 24 added a "
        "sustained chat with three operating modes: a global thread at /chat, plus per-entity "
        "threads embedded on every grant, application, and report detail page so context is "
        "automatic. Users can ask follow-ups, refine in place, compare across turns, and reset "
        "when they want to start fresh. Per-user thread isolation, last-12-message history cap, "
        "and an anti-hallucination discipline footer prevent the assistant from inventing "
        "numbers or making up answers about data outside its scope. No other grant platform "
        "exposes an actual conversational interface, let alone scopes it deterministically to "
        "the entity being viewed."
    )

    add_numbered_item(doc, 12, "AUTOMATIC REVIEWER ASSIGNMENT THAT JUST WORKS",
        "Manual reviewer assignment was the single most common cause of applications sitting in "
        "queue for days at most donors. Kuja\u2019s reviewer match service ranks candidates by "
        "sector fit, country fit, throughput health, and current workload \u2014 and Phase 25 wired "
        "this directly into the application submit handler. NGOs submit, panels populate "
        "automatically with reasoning, reviewers are notified, and a nightly safety-net cron at "
        "02:45 UTC sweeps any application that slipped through. Donors retain a one-tap manual "
        "override; idempotency prevents duplicates. The donor never has to think about it."
    )

    add_numbered_item(doc, 13, "PORTFOLIO COHORT ANALYTICS \u2014 BENCHMARKING DONORS HONESTLY",
        "Donors making portfolio-level decisions can now see how the NGOs THEY fund compare "
        "against the NGOs OTHER donors fund: grantee capacity score, AI score at award, "
        "country and sector diversity, share of funding to small/emerging organisations, and "
        "grantee report on-time rate. Each metric shows the donor\u2019s value, cohort median, "
        "percentile rank, and a verdict pill (above/on par/below). When the cohort is too small "
        "to fairly compare (fewer than three other donors, or below per-metric sample minimums) "
        "the card surfaces an explicit sparseness message rather than fake numbers. No competitor "
        "exposes anonymised cross-donor portfolio benchmarks with this discipline."
    )

    add_numbered_item(doc, 14, "REAL-USER METRICS BUILT IN, NOT BOLTED ON",
        "Phase 29-31 added a behavioural metrics layer that records every meaningful user "
        "action to a dedicated UserEvent table, lightweight enough that recording is "
        "non-blocking and best-effort. The admin metrics dashboard at /admin/metrics surfaces "
        "DAU/WAU/MAU with role and language breakdowns, six funnel views (chat, application, "
        "report, review, readiness\u2192submit, pre-flight\u2192submit), per-language adoption of "
        "flagship features (the parity signal that should drive deep i18n investment), and a "
        "deterministic A/B bucketing helper so any feature can be tested against a control arm. "
        "A 1-question NPS micro-survey fires at moments-of-completion (application + report "
        "submit) to capture perceived value alongside behavioural data. This means product "
        "decisions \u2014 including the next round of deep i18n investment \u2014 can be data-driven "
        "rather than guessed."
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
            ["Q1 2026", "Grant Platform v3 live with full AI capabilities", "Shipped"],
            ["Q1 2026", "Live sanctions screening (OpenSanctions + fallback)", "Shipped"],
            ["Q1 2026", "Government registry verification (7 African countries live)", "Shipped"],
            ["Q1 2026", "AI document analysis against donor-specific requirements", "Shipped"],
            ["Q1 2026", "Grant agreement upload with AI extraction", "Shipped"],
            ["Q1 2026", "Donor grant wizard with AI evaluation criteria", "Shipped"],
            ["Q1 2026", "NGO reporting with AI evaluation and compliance scores", "Shipped"],
            ["Q2 2026", "Match engine, grant Q&A, diligence room, two-phase intake", "Shipped"],
            ["Q2 2026", "NGO This-Week home, decision audit, donor portfolio diagnostics", "Shipped"],
            ["Q2 2026", "Capacity assessment passporting + custom donor framework builder", "Shipped"],
            ["Q2 2026", "Two-pillar Organisation Trust Profile (Capacity + Due Diligence)", "Shipped"],
            ["Q2 2026", "Beneficial ownership transparency + adverse media monitoring", "Shipped"],
            ["Q2 2026", "Two-path grant creation (prompt OR PDF extraction)", "Shipped"],
            ["Q2 2026", "AI application co-author with claim-level provenance", "Shipped"],
            ["Q2 2026", "Real-time document scoring with one-click clarifications", "Shipped"],
            ["Q2 2026", "Pre-submission readiness + compliance pre-empt", "Shipped"],
            ["Q2 2026", "Reviewer one-screen summary + evidence extraction + suggest-criteria", "Shipped"],
            ["Q2 2026", "AI compliance calendar + proactive reminders + report co-author", "Shipped"],
            ["Q2 2026", "4-pillar compliance health + trajectory + slips-in-N-days forecast", "Shipped"],
            ["Q2 2026", "Risk register with owner/due date + structured collaboration + web push", "Shipped"],
            ["Q2 2026", "Organisational memory + claim provenance ledger", "Shipped"],
            ["Q2 2026", "Mobile-first PWA + offline-first with background sync", "Shipped"],
            ["Q2 2026", "Six-language UI (EN/AR/FR/SW/SO/ES) with role-aware tone", "Shipped"],
            ["Q2 2026", "Async AI dispatcher + per-user concurrent cap + AI surface health probe", "Shipped"],
            ["Q2 2026", "Admin self-service: system health, AI spend forecast, demo readiness", "Shipped"],
            ["Q2 2026", "Hash-chained audit log + TOTP 2FA + hard-gate + GDPR right-to-erasure", "Shipped"],
            ["Q2 2026", "Sustained AI chat threads (global + per grant/application/report scope)", "Shipped"],
            ["Q2 2026", "Reviewer auto-assignment on submit + nightly backfill cron", "Shipped"],
            ["Q2 2026", "Donor cohort analytics (your funded NGOs vs the cohort)", "Shipped"],
            ["Q2 2026", "PWA install banner + native share API + biometric (WebAuthn) re-auth", "Shipped"],
            ["Q2 2026", "Report detail page with scoped chat", "Shipped"],
            ["Q2 2026", "Real-user metrics infrastructure (UserEvent + 6 funnels + A/B bucketing + admin dashboard)", "Shipped"],
            ["Q2 2026", "NPS micro-survey at moments-of-completion with per-language rollup", "Shipped"],
            ["Q3 2026", "KujaLink marketplace enhancements (matching v2, richer profiles)", "Planned"],
            ["Q3 2026", "Odoo 17 ERP integration (KujaBuild) \u2014 Basic Suite", "Planned"],
            ["Q3 2026", "Application portal launch for donors", "Planned"],
            ["Q3 2026", "Registry expansion: East & West Africa (15+ countries)", "Planned"],
            ["Q3 2026", "Additional donor-specific framework templates", "Planned"],
            ["Q4 2026", "ERP Premium and Premium+ suite tiers", "Planned"],
            ["Q4 2026", "LMS (Learning Management System) module start", "Planned"],
            ["Q4 2026", "Advanced portfolio analytics dashboard", "Planned"],
            ["Q4 2026", "Verification fee system for organisations", "Planned"],
            ["Q4 2026", "Fiscal sponsorship package pilot", "Planned"],
            ["2027 H1", "Registry expansion: all Sub-Saharan Africa (30+ countries)", "Planned"],
            ["2027 H1", "Additional language support for LatAm and MENA dialects", "Planned"],
            ["2027 H2", "Advanced AI analytics: predictive matching, donor portfolio simulation", "Planned"],
            ["2027 H2", "Workflow configurator (parallel reviewers + COI gates) for procurement-grade clients", "Planned"],
            ["2028", "Latin America & Caribbean launch (15 countries)", "Planned"],
            ["2028", "Course marketplace (CSO-created and INGO-created learning content)", "Planned"],
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
