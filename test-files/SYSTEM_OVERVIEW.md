# Kuja Grant Management System -- Overview & Testing Guide

## What is Kuja Grant?

Kuja Grant Management System is an **AI-powered end-to-end grant management platform** built for the humanitarian sector -- specifically for **NGOs and Donors operating in Africa**. It is part of the broader **Kuja Link ecosystem** (kuja.org marketplace).

No competitor in the market covers the full grant lifecycle in one platform. Kuja Grant does:

**Discovery** --> **Capacity Assessment** --> **Due Diligence** --> **Grant Matching** --> **Application** --> **Review & Award** --> **Reporting** --> **Compliance**

| | |
|---|---|
| **Production URL** | https://web-production-6f8a.up.railway.app |
| **Local Dev** | http://localhost:5000 |
| **GitHub** | https://github.com/idirisloyan/kuja-grant |
| **Stack** | Python/Flask backend, Vanilla JavaScript SPA frontend, SQLite (dev) / PostgreSQL (prod), Claude AI (Anthropic) |

---

## The Vision

One platform where donors and NGOs work together across the entire grant lifecycle:

1. **Discovery** -- NGOs register on the Kuja marketplace and are found by donors.
2. **Capacity Assessment** -- NGOs prove organizational readiness using 5 industry frameworks (Kuja Standard, STEP, UN HACT, CHS, NUPAS).
3. **Due Diligence** -- Live registration verification against government registries + sanctions screening against UN, OFAC, EU, and World Bank lists.
4. **Grant Matching** -- AI matches NGOs to relevant grants based on sector, country, and capacity score.
5. **Application** -- 4-step wizard with eligibility checks, proposals, and document uploads with AI analysis.
6. **Review & Award** -- Dual scoring (AI + human reviewer), reviewer assignments, and donor decision.
7. **Reporting** -- NGOs submit financial/narrative/impact reports. AI analyzes reports against donor-specific requirements. Donors review and accept or request revision.
8. **Compliance** -- Ongoing sanctions monitoring, registration verification, and full audit trail.

---

## Key Features (Detailed)

### For NGOs
- Complete capacity assessment using 5 industry frameworks
- Grant discovery with search and filter by sector, country, keywords
- Smart 4-step application wizard with AI guidance
- Document upload with real-time AI analysis and scoring
- Report submission against donor-defined requirements
- AI chat assistant for role-specific guidance
- Multi-language support: English, French, Swahili, Arabic, Somali

### For Donors
- Grant creation wizard (5 steps) with:
  - Upload actual grant agreement --> AI extracts reporting requirements automatically
  - Set per-document-type evaluation criteria
  - Modify or add to AI-extracted requirements before publishing
- Application review with AI-powered ranking
- Dual scoring system: AI auto-score + human reviewer score
- Organization search with capacity scores
- Compliance dashboard: registration verification + sanctions screening
- Report review with AI analysis against the specific requirements the donor defined

### For Reviewers
- Assignment dashboard showing pending reviews
- Structured scoring rubrics
- Criterion-level scoring for each application

### AI Features (Live Claude API)
- Document content analysis with detailed findings and scoring
- Grant agreement parsing to extract reporting requirements
- Report evaluation against donor-specific criteria
- Contextual chat assistance tailored per user role
- Registration certificate analysis and verification
- Multi-language document understanding (English, French, Arabic, Swahili, Somali)

---

## Live External Integrations

### Government Registry Verification

| Country | Registry | URL | Type |
|---------|----------|-----|------|
| Kenya | NGO Board / BRS | https://brs.go.ke/ | Web portal |
| Nigeria | CAC | https://search.cac.gov.ng/ | Free searchable |
| South Africa | DSD NPO + CIPC | https://www.npo.gov.za/ / https://apim.cipc.co.za/ | Web + REST API |
| Uganda | NGO Bureau | https://ngobureau.go.ug/ | Web table |
| Tanzania | NiS Registrar | https://nis.jamii.go.tz/ | Web portal |
| Somalia | MOIFAR | No public registry | Manual only |
| Ethiopia | ACSO | No public registry | Manual only |

### Sanctions Databases

| List | Source | Format |
|------|--------|--------|
| UN Security Council | https://scsanctions.un.org/resources/xml/en/consolidated.xml | XML |
| US OFAC SDN | https://www.treasury.gov/ofac/downloads/sdn.csv | CSV |
| EU Financial Sanctions | https://webgate.ec.europa.eu/fsd/fsf | CSV/XML |
| World Bank Debarment | https://www.worldbank.org/en/projects-operations/procurement/debarred-firms | HTML |
| OpenSanctions (unified) | https://api.opensanctions.org/ | REST API |

---

## Test User Accounts

All passwords are: **pass123**

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

| Grant | Donor | Amount | Status | Countries |
|-------|-------|--------|--------|-----------|
| Community Health Workers Scale-Up Program | Global Health Fund | $500,000 | Open | Kenya, Somalia, Uganda |
| Education Technology for Rural Schools | EA Development Trust | $250,000 | Open | Kenya, Uganda, Tanzania |
| Climate Resilience in East Africa | EA Development Trust | $1,000,000 | Draft | Kenya, Somalia, Ethiopia, Uganda |
| Women's Protection and Empowerment | Global Health Fund | $350,000 | Open | Nigeria, Niger, Chad, Mali |

### Applications

| NGO | Grant | Status | AI Score |
|-----|-------|--------|----------|
| Amani Community Development | Community Health Workers | Submitted | 78.5% |
| Salam Relief Foundation | Community Health Workers | Submitted | 62.3% |
| Ubuntu Education Trust | Education Technology | Draft | -- |
| Sahel Women's Network | Women's Protection | Submitted | 71.0% |
| Hope Bridges Initiative | Community Health Workers | Draft (incomplete) | -- |

### Reports (Pre-loaded for Amani Community Development)

| Report | Type | Status |
|--------|------|--------|
| Q1 2026 Financial Report | Financial | Submitted (AI Score: 90) |
| Annual Progress Report H1 2026 | Narrative | Draft |
| Test Q2 Financial Report | Financial | Accepted |
| Annual Impact Report 2025 | Impact | Revision Requested |
| Under Review Financial Report | Financial | Under Review |

### Documents (Amani Community Development)

| Document | Type | AI Score |
|----------|------|----------|
| amani_psea_policy_2024.pdf | PSEA Policy | 88% |
| amani_audit_2024.pdf | Audit Report | 78% |
| amani_registration_certificate.pdf | Registration Cert | 95% |
| amani_financial_2023-2025.pdf | Financial Report | 82% |

---

## Real Registration Verification Test Data

These are real organizations you can use to test live registry lookups:

| Organization | Country | Reg Number | Registry |
|-------------|---------|------------|----------|
| ActionAid International Kenya | Kenya | OP.218/051/924/84 | NGO Board |
| World Vision Kenya | Kenya | OP.218/051/93114/86 | NGO Board |
| Gift of the Givers Foundation | South Africa | NPO 032-031 | DSD NPO |
| Treatment Action Campaign | South Africa | NPO 043-770 | DSD NPO |
| Nelson Mandela Foundation | South Africa | NPO 034-681 | DSD NPO |

## Real Sanctions Screening Test Data

| Entity | List | Country | Expected Result |
|--------|------|---------|-----------------|
| Amani Community Development | All | Kenya | CLEAR (not sanctioned) |
| Al-Shabaab | UN, OFAC, EU | Somalia | FLAGGED |
| Boko Haram | UN, OFAC | Nigeria | FLAGGED |
| M23 | UN, EU | DRC | FLAGGED |
| FDLR | UN, EU | DRC | FLAGGED |
| Gitto Costruzioni Generali Nigeria | World Bank | Nigeria | DEBARRED |

---

## Test Files

The `test-files/` folder contains realistic documents for testing AI upload and analysis.

### Standard Test Files

| File | Description | Expected AI Score |
|------|-------------|-------------------|
| financial_report_q1_2026.txt | Quarterly financial report | Medium-High (70-80) |
| audit_report_2025.txt | Independent external audit | High (80-90) |
| registration_certificate.txt | NGO registration certificate | High (85-95) |
| project_proposal.txt | Full project proposal | High (75-85) |
| impact_report_annual_2025.txt | Annual impact report | High (80-90) |
| budget_template.txt | Annual budget with line items | Medium-High (70-80) |
| compliance_checklist.txt | Due diligence checklist | Medium-High (70-80) |
| grant_agreement_sample.txt | Grant agreement for AI extraction | N/A (used for requirement extraction) |

### Edge Case Test Files

| File | Description | Expected AI Score |
|------|-------------|-------------------|
| poor_quality_report.txt | Deliberately incomplete report | Low (20-40) |
| excellent_narrative_report.txt | Comprehensive narrative | High (85-95) |
| arabic_grant_agreement.txt | Arabic grant agreement | Tests multi-language |
| french_project_report.txt | French WASH report | Tests multi-language |
| large_budget_detailed.txt | 50+ line item $500K budget | High (80-90) |
| strategic_plan_2025_2030.txt | 5-year strategic plan | High (80-90) |
| due_diligence_questionnaire_completed.txt | 30-question questionnaire | High (80-90) |
| empty_template.txt | Template with only headers | Very Low (5-15) |
| risk_assessment_matrix.txt | 15-risk matrix | Medium-High (70-85) |
| beneficiary_feedback_report.txt | Community accountability report | Medium-High (70-85) |

---

## How to Run a Full End-to-End Test

### Quick Start

1. Go to https://web-production-6f8a.up.railway.app
2. Login with any test account (password: **pass123**)
3. Follow the role-specific scenarios below

### Scenario 1: Complete Grant Lifecycle

1. **Donor** (sarah@globalhealth.org) -- Create grant --> Upload `grant_agreement_sample.txt` --> AI extracts requirements --> Modify if needed --> Publish
2. **NGO** (fatima@amani.org) -- Complete assessment --> Upload documents (AI analyzes against requirements) --> Browse grants --> Apply
3. **Reviewer** (james@reviewer.org) -- Review application --> Score it
4. **Donor** -- Review rankings --> Award grant
5. **NGO** -- Create report --> Submit --> AI analyzes against donor requirements
6. **Donor** -- Review report with AI analysis --> Accept or request revision

### Scenario 2: Due Diligence & Compliance

1. **NGO** (fatima@amani.org) -- Upload registration certificate
2. **System** -- AI analyzes certificate --> Cross-checks against Kenya NGO Board registry
3. **Donor** (sarah@globalhealth.org) -- View compliance dashboard --> See registration verification status + sanctions screening results
4. **System** -- Screens org against UN, OFAC, EU, World Bank lists --> Shows clear/flagged status

### Scenario 3: AI Document Testing

1. **NGO** -- Upload `excellent_narrative_report.txt` --> Expect HIGH AI score (85+)
2. **NGO** -- Upload `poor_quality_report.txt` --> Expect LOW AI score (below 40)
3. **NGO** -- Upload `empty_template.txt` --> Expect VERY LOW score (5-15)
4. **NGO** -- Upload `french_project_report.txt` --> Verify AI handles French content

---

## Technical Notes

- **Database:** SQLite in development (resets on each Railway redeploy). PostgreSQL in production.
- **AI Engine:** Claude API (Anthropic) -- requires valid `ANTHROPIC_API_KEY` environment variable.
- **File Uploads:** Max 10MB. Supported formats: PDF, DOC, DOCX, XLS, XLSX, TXT, CSV.
- **Sessions:** Cookie-based, expire on browser close.
- **Future Integration:** This app will eventually integrate with Kuja Link (kuja.org) as an Odoo 17 module.

## Roadmap

1. **Current** -- Standalone Flask app with live AI and external integrations
2. **Next** -- Integration with Kuja Link marketplace (Odoo 17)
3. **Future** -- SSO with Kuja Link, shared PostgreSQL, OWL components

---

*Built for Adeso | March 2026*
