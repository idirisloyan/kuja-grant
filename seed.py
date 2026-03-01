#!/usr/bin/env python3
"""Seed database with realistic Kuja Grant Management data.

Based on Kuja Link profiles from East Africa humanitarian organizations.
Runnable as: python seed.py
Use --force to drop and re-seed existing data.
"""
import os
import sys
import json
from datetime import datetime, date, timedelta
from werkzeug.security import generate_password_hash

# Don't override DATABASE_URL - let server.py set the default
from server import (
    app, db, User, Organization, Grant, Application,
    Assessment, Document, Review, ComplianceCheck, Report,
    RegistrationVerification
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
PASSWORD_HASH = generate_password_hash('pass123')

def dt(year, month, day, hour=0, minute=0):
    return datetime(year, month, day, hour, minute)

# ---------------------------------------------------------------------------
# Organization data
# ---------------------------------------------------------------------------
ORGANIZATIONS = [
    # --- NGOs ---
    dict(
        name='Amani Community Development',
        org_type='ngo', country='Kenya', city='Nairobi',
        year_established=2012, annual_budget='$1M-$5M', staff_count='51-200',
        sectors=json.dumps(['Health', 'WASH', 'Nutrition']),
        registration_status='registered', registration_number='NGO/2012/3847',
        verified=True, assess_score=82.0,
        description='Amani Community Development is a Kenyan NGO dedicated to improving health outcomes and access to clean water in underserved communities across East Africa. With over a decade of experience, Amani has implemented programs reaching over 500,000 beneficiaries across Kenya, Somalia, and South Sudan.',
        mission='To strengthen community resilience through integrated health, water, and nutrition programs.',
        geographic_areas=json.dumps(['East Africa', 'Horn of Africa']),
        focus_areas=json.dumps(['Community Health', 'WASH Infrastructure', 'Maternal Nutrition']),
        sdg_ids=json.dumps([3, 6, 2]),
        website='https://amanicommunity.org',
    ),
    dict(
        name='Salam Relief Foundation',
        org_type='ngo', country='Somalia', city='Mogadishu',
        year_established=2015, annual_budget='$500K-$1M', staff_count='11-50',
        sectors=json.dumps(['Food Security', 'Protection', 'Shelter']),
        registration_status='registered', registration_number='SOM/NGO/2015/221',
        verified=True, assess_score=68.0,
        description='Salam Relief provides emergency and development assistance in Somalia and the Horn of Africa. Focused on food security and protection, Salam has been a key partner in drought response and displacement assistance programs.',
        mission='Delivering humanitarian aid and building sustainable futures for vulnerable communities in Somalia.',
        geographic_areas=json.dumps(['Somalia', 'Horn of Africa']),
        focus_areas=json.dumps(['Emergency Response', 'Food Distribution', 'IDP Protection']),
        sdg_ids=json.dumps([2, 16, 11]),
    ),
    dict(
        name='Ubuntu Education Trust',
        org_type='ngo', country='South Africa', city='Cape Town',
        year_established=2008, annual_budget='$5M+', staff_count='200+',
        sectors=json.dumps(['Education', 'Livelihoods', 'Youth Development']),
        registration_status='registered', registration_number='ZA-NPO-2008-071234',
        verified=True, assess_score=91.0,
        description="Ubuntu Education Trust is one of Africa's leading education-focused NGOs. With programs across 5 countries and partnerships with major donors, Ubuntu has pioneered innovative approaches to education technology and youth employment.",
        mission='Transforming lives through education and sustainable livelihoods across Africa.',
        geographic_areas=json.dumps(['Southern Africa', 'East Africa', 'West Africa']),
        focus_areas=json.dumps(['EdTech', 'Vocational Training', 'Youth Employment']),
        sdg_ids=json.dumps([4, 8, 10]),
    ),
    dict(
        name='Hope Bridges Initiative',
        org_type='cbo', country='Uganda', city='Kampala',
        year_established=2019, annual_budget='$100K-$500K', staff_count='11-50',
        sectors=json.dumps(['Health', 'Climate', 'Agriculture']),
        registration_status='registered', registration_number='UG/CBO/2019/445',
        verified=False, assess_score=55.0,
        description='Hope Bridges is a community-based organization in Uganda focused on climate-resilient agriculture and community health. As a newer organization, Hope Bridges is building its capacity while delivering impactful programs in rural Uganda.',
        mission='Bridging communities to climate resilience and better health.',
        geographic_areas=json.dumps(['Uganda', 'East Africa']),
        focus_areas=json.dumps(['Climate Agriculture', 'Community Health', 'Rural Development']),
        sdg_ids=json.dumps([13, 3, 15]),
    ),
    dict(
        name="Sahel Women's Network",
        org_type='network', country='Nigeria', city='Abuja',
        year_established=2020, annual_budget='<$100K', staff_count='1-10',
        sectors=json.dumps(['Protection', 'Governance', 'Gender']),
        registration_status='pending', registration_number='',
        verified=False, assess_score=47.0,
        description="Sahel Women's Network connects women-led organizations across the Sahel region to amplify their voice in governance and protection. Still in its early stages, the network is building a coalition of grassroots women's groups.",
        mission='Empowering women across the Sahel through collective action and advocacy.',
        geographic_areas=json.dumps(['West Africa', 'Sahel']),
        focus_areas=json.dumps(["Women's Rights", 'GBV Prevention', 'Political Participation']),
        sdg_ids=json.dumps([5, 16, 10]),
    ),
    # --- Donors ---
    dict(
        name='Global Health Fund',
        org_type='donor', country='Switzerland', city='Geneva',
        year_established=2005, annual_budget='$50M+', staff_count='200+',
        sectors=json.dumps(['Health', 'Nutrition', 'WASH']),
        registration_status='registered', registration_number='',
        verified=True, assess_score=None,
        description='Global Health Fund is an international grantmaking foundation dedicated to improving health outcomes in low and middle-income countries. We fund innovative health programs, support capacity building, and partner with local organizations to deliver lasting impact.',
        mission='Funding health innovation and strengthening local health systems worldwide.',
    ),
    dict(
        name='East Africa Development Trust',
        org_type='donor', country='Kenya', city='Nairobi',
        year_established=2010, annual_budget='$10M-$50M', staff_count='51-200',
        sectors=json.dumps(['Education', 'Livelihoods', 'Climate', 'Governance']),
        registration_status='registered', registration_number='',
        verified=True, assess_score=None,
        description='EA Development Trust is a regional grantmaking body focused on sustainable development across East Africa. We support local organizations in education, livelihoods, climate resilience, and good governance.',
        mission='Catalyzing sustainable development through local partnerships in East Africa.',
    ),
    dict(
        name='Independent Review Associates',
        org_type='donor', country='Kenya', city='Nairobi',
        year_established=2015, annual_budget='$500K-$1M', staff_count='11-50',
        sectors=json.dumps(['Governance', 'M&E']),
        registration_status='registered', registration_number='',
        verified=True, assess_score=None,
        description='Independent review and evaluation consultancy specializing in humanitarian program assessment.',
    ),
]

# ---------------------------------------------------------------------------
# User data  (index into org list by position, None = no org)
# ---------------------------------------------------------------------------
USERS = [
    ('fatima@amani.org',    'Fatima Hassan',   'ngo',      0),
    ('ahmed@salamrelief.org','Ahmed Omar',      'ngo',      1),
    ('thandi@ubuntu.org',   'Thandi Nkosi',    'ngo',      2),
    ('sarah@globalhealth.org','Sarah Mitchell', 'donor',    5),
    ('david@eatrust.org',   'David Kimani',    'donor',    6),
    ('james@reviewer.org',  'James Ochieng',   'reviewer', 7),
    ('maria@reviewer.org',  'Maria Santos',    'reviewer', 7),
    ('admin@kuja.org',      'Admin User',      'admin',    None),
    ('peter@hopebridges.org','Peter Okello',   'ngo',      3),
    ('aisha@sahelwomen.org','Aisha Bello',     'ngo',      4),
]

# ---------------------------------------------------------------------------
# Grant data
# ---------------------------------------------------------------------------

GRANT1_ELIGIBILITY = json.dumps([
    {"id":"geo","category":"Geographic","label":"Operating in target countries","params":{"countries":["Kenya","Somalia","Uganda"]},"weight":15,"required":True,"helpText":"Must have active operations in at least one target country"},
    {"id":"orgtype","category":"Organization Type","label":"Registered NGO or CBO","params":{"types":["ngo","cbo"]},"weight":10,"required":True,"helpText":"Must be a registered non-governmental or community-based organization"},
    {"id":"exp","category":"Experience","label":"Minimum 3 years health program experience","params":{"minYears":3,"sector":"Health"},"weight":20,"required":True,"helpText":"Demonstrate at least 3 years of implementing health programs"},
    {"id":"budget","category":"Budget Range","label":"Annual budget above $200K","params":{"minBudget":200000},"weight":10,"required":False,"helpText":"Organizations with larger budgets may manage bigger sub-grants"},
    {"id":"sector","category":"Sector Focus","label":"Health and/or Nutrition focus","params":{"sectors":["Health","Nutrition"]},"weight":15,"required":True,"helpText":"Primary sector focus must include health or nutrition"},
    {"id":"reg","category":"Registration","label":"Valid NGO registration","params":{"current":True},"weight":10,"required":True,"helpText":"Registration must be current and verifiable"},
])

GRANT1_CRITERIA = json.dumps([
    {"id":"approach","label":"Technical Approach","desc":"Describe your proposed approach to training and deploying community health workers","weight":25,"instructions":"Explain your CHW model including: recruitment strategy, training curriculum, supervision structure, and integration with existing health systems. Reference evidence-based approaches.","example":"Our CHW program uses a cascade training model where master trainers...","maxWords":500},
    {"id":"experience","label":"Relevant Experience","desc":"Describe your organization's experience with similar programs","weight":20,"instructions":"Detail past CHW or community health programs including: locations, duration, number of CHWs, beneficiary reach, and measurable outcomes achieved.","example":"Over the past 5 years, we have trained and deployed 250 CHWs across 3 counties...","maxWords":400},
    {"id":"coverage","label":"Geographic Coverage","desc":"Explain your proposed geographic coverage and reach","weight":15,"instructions":"Specify target locations, estimated beneficiary numbers, and how you will ensure coverage in hard-to-reach areas. Include maps or location lists if possible.","example":"We propose to cover 5 sub-counties in Turkana County, reaching...","maxWords":300},
    {"id":"timeline","label":"Implementation Timeline","desc":"Provide a detailed implementation timeline","weight":15,"instructions":"Present a month-by-month timeline with key milestones, deliverables, and review points. Include: inception phase, training, deployment, monitoring, and reporting periods.","example":"Month 1-2: Inception and community mapping; Month 3-4: CHW recruitment...","maxWords":400},
    {"id":"budget_nar","label":"Budget Narrative","desc":"Provide a budget narrative explaining key cost categories","weight":15,"instructions":"Break down the budget into major categories: personnel, training, equipment, transport, M&E, and overhead. Explain how costs were estimated and justify major line items.","example":"Personnel (40%): Program Manager, 2 Field Coordinators, 50 CHW stipends...","maxWords":400},
    {"id":"sustainability","label":"Sustainability Plan","desc":"How will the program sustain beyond the grant period?","weight":10,"instructions":"Describe your exit strategy and how program benefits will continue after funding ends. Include: government integration plans, community ownership mechanisms, and potential alternative funding.","example":"Our sustainability strategy has three pillars: 1) Integration with county health...","maxWords":300},
])

GRANT1_DOC_REQUIREMENTS = json.dumps([
    {"type":"financialReport","required":True,"config":{"years":3,"audited":True}},
    {"type":"registrationCert","required":True,"config":{"current":True}},
    {"type":"auditReport","required":True,"config":{"type":"external","years":2}},
    {"type":"pseaPolicy","required":True,"config":{"components":["reporting","investigation","training","whistleblower"]}},
    {"type":"projectReport","required":False,"config":{"count":2,"recent":True}},
    {"type":"budgetDetail","required":True,"config":{"lineItems":True,"overheadCap":15}},
])

GRANT2_ELIGIBILITY = json.dumps([
    {"id":"geo","category":"Geographic","label":"East Africa operations","params":{"countries":["Kenya","Uganda","Tanzania"]},"weight":15,"required":True,"helpText":"Must operate in at least one target country"},
    {"id":"exp","category":"Experience","label":"2+ years education programs","params":{"minYears":2,"sector":"Education"},"weight":20,"required":True,"helpText":"Must have education program experience"},
    {"id":"sector","category":"Sector Focus","label":"Education focus","params":{"sectors":["Education"]},"weight":15,"required":True,"helpText":"Primary focus must include education"},
])

GRANT2_CRITERIA = json.dumps([
    {"id":"approach","label":"EdTech Solution","desc":"Describe your proposed education technology solution","weight":30,"instructions":"Detail the technology, how it improves learning, and evidence of effectiveness.","example":"","maxWords":500},
    {"id":"experience","label":"Track Record","desc":"Past education program results","weight":25,"instructions":"Share measurable outcomes from previous education programs.","example":"","maxWords":400},
    {"id":"implementation","label":"Implementation Plan","desc":"How will you deploy and maintain the solution?","weight":25,"instructions":"Cover deployment, teacher training, maintenance, and technical support.","example":"","maxWords":400},
    {"id":"sustainability","label":"Sustainability","desc":"Long-term plan beyond grant period","weight":20,"instructions":"How will the technology be maintained and scaled after the grant?","example":"","maxWords":300},
])

GRANT2_DOC_REQUIREMENTS = json.dumps([
    {"type":"financialReport","required":True,"config":{"years":2}},
    {"type":"registrationCert","required":True,"config":{"current":True}},
    {"type":"projectReport","required":True,"config":{"count":1}},
])

GRANT3_ELIGIBILITY = json.dumps([
    {"id":"geo","category":"Geographic","label":"East Africa presence","params":{"countries":["Kenya","Somalia","Ethiopia","Uganda"]},"weight":15,"required":True,"helpText":"Must have operations in target countries"},
    {"id":"exp","category":"Experience","label":"Climate or agriculture experience","params":{"minYears":2,"sector":"Climate"},"weight":20,"required":True,"helpText":"Must have relevant sector experience"},
])

GRANT3_CRITERIA = json.dumps([
    {"id":"approach","label":"Climate Resilience Approach","desc":"Describe your proposed climate resilience strategy","weight":35,"instructions":"Detail your approach to building community climate resilience.","example":"","maxWords":500},
    {"id":"experience","label":"Relevant Experience","desc":"Past climate or agriculture programs","weight":30,"instructions":"Share outcomes from previous climate or agriculture programs.","example":"","maxWords":400},
    {"id":"sustainability","label":"Sustainability","desc":"Long-term resilience plan","weight":35,"instructions":"How will communities sustain resilience after the project?","example":"","maxWords":400},
])

GRANT3_DOC_REQUIREMENTS = json.dumps([
    {"type":"financialReport","required":True,"config":{"years":2}},
    {"type":"registrationCert","required":True,"config":{"current":True}},
])

GRANT4_ELIGIBILITY = json.dumps([
    {"id":"geo","category":"Geographic","label":"Sahel region operations","params":{"countries":["Nigeria","Niger","Chad","Mali"]},"weight":15,"required":True,"helpText":"Must operate in the Sahel region"},
    {"id":"orgtype","category":"Organization Type","label":"Women-led or women-focused organization","params":{"types":["ngo","cbo","network"]},"weight":15,"required":True,"helpText":"Priority given to women-led organizations"},
    {"id":"sector","category":"Sector Focus","label":"Protection or gender focus","params":{"sectors":["Protection","Gender"]},"weight":15,"required":True,"helpText":"Must work in protection or gender sectors"},
])

GRANT4_CRITERIA = json.dumps([
    {"id":"approach","label":"Protection Approach","desc":"Describe your approach to women's protection","weight":30,"instructions":"Detail your protection methodology and how it addresses GBV and women's rights.","example":"","maxWords":500},
    {"id":"experience","label":"Track Record","desc":"Experience with protection or gender programs","weight":25,"instructions":"Share measurable outcomes from previous protection or gender programs.","example":"","maxWords":400},
    {"id":"governance","label":"Governance Participation","desc":"How will you promote women in governance?","weight":25,"instructions":"Describe strategies for increasing women's political participation.","example":"","maxWords":400},
    {"id":"sustainability","label":"Sustainability","desc":"Long-term empowerment plan","weight":20,"instructions":"How will protection gains be sustained?","example":"","maxWords":300},
])

GRANT4_DOC_REQUIREMENTS = json.dumps([
    {"type":"financialReport","required":True,"config":{"years":1}},
    {"type":"registrationCert","required":False,"config":{"current":True}},
])

# ---------------------------------------------------------------------------
# Application response texts
# ---------------------------------------------------------------------------

AMANI_RESPONSES = json.dumps({
    "approach": "Amani proposes a cascade Community Health Worker model that builds on our existing network of 120 CHWs in Nairobi, Turkana, and Garissa counties. Our approach begins with recruiting CHW candidates from the communities they will serve, prioritizing women with at least primary education. Each CHW receives a 6-week intensive training covering integrated community case management (iCCM), nutrition screening using MUAC measurements, maternal health counseling, and disease surveillance using mobile-based reporting tools. We deploy CHWs in pairs to cover catchment areas of approximately 500 households each. Supervision follows a tiered model: community health extension workers (CHEWs) conduct monthly supportive supervision visits, while our program coordinators perform quarterly quality audits. All CHWs are equipped with smartphones loaded with our custom CommCare application for real-time data capture, referral tracking, and supply chain management. Our model integrates directly with county health departments by aligning CHW activities with the Kenya Community Health Strategy 2020-2030 and participating in sub-county health management team meetings. Evidence from our pilot in Turkana showed a 34% increase in facility-based deliveries and a 28% reduction in severe acute malnutrition cases within the first 18 months of CHW deployment.",
    "experience": "Amani has implemented community health programs continuously since 2014, covering 8 years of direct CHW program experience. Our flagship Afya Jamii program (2016-2022) trained and deployed 250 CHWs across Turkana, Garissa, and Nairobi counties, reaching over 300,000 beneficiaries. Key outcomes included: 34% increase in facility-based deliveries in target areas, 28% reduction in SAM cases identified through community screening, and 89% treatment completion rate for childhood pneumonia and diarrhea through iCCM. Our USAID-funded maternal health project (2019-2023) in Garissa trained 80 CHWs specifically in maternal and newborn health, achieving a 41% increase in antenatal care attendance. We currently operate under a UNICEF partnership delivering integrated nutrition and health services in 3 sub-counties of Turkana, managing 120 active CHWs with monthly reporting to county health teams. Our team includes 4 staff with MPH degrees and 2 certified CHW trainers.",
    "coverage": "We propose to operate across 6 sub-counties in Turkana County (Turkana Central, Turkana South, Loima) and Garissa County (Garissa Township, Balambala, Lagdera). This geographic focus targets areas with the highest burden of disease and lowest health facility coverage in Kenya. Our estimated reach is 180,000 beneficiaries across approximately 30,000 households. Each sub-county will have a dedicated field coordinator managing 15-20 CHWs. Hard-to-reach pastoral communities will be served through mobile CHW teams that follow seasonal migration patterns, a model we have tested successfully in Turkana since 2018. We will establish 12 community health posts as supply and reporting hubs.",
    "timeline": "Month 1-2: Inception phase including baseline survey, stakeholder mapping, community engagement, and county health department coordination. Month 3-4: CHW recruitment from target communities (90 candidates) and selection (60 final CHWs). Month 5-6: Intensive 6-week CHW training program with practicum placements. Month 7: CHW deployment and equipment distribution (smartphones, kits, supplies). Month 8-14: Active implementation with monthly supervision cycles, quarterly review meetings, and continuous data monitoring. Month 15-16: Mid-term evaluation and program adjustment. Month 17-22: Continued implementation with enhanced focus on sustainability and government integration. Month 23-24: Endline evaluation, lessons learned documentation, and transition planning.",
    "budget_nar": "Personnel (42% - $210,000): Program Manager ($36,000), 3 Field Coordinators ($72,000), 60 CHW monthly stipends of $50 ($144,000 over 24 months), M&E Officer ($30,000). Training (15% - $75,000): Training venue and materials ($20,000), trainer fees and per diem ($25,000), refresher trainings quarterly ($30,000). Equipment (12% - $60,000): 60 smartphones with CommCare licenses ($30,000), CHW kits including medical supplies ($20,000), 12 community health post equipment ($10,000). Transport (10% - $50,000): Vehicle running costs ($30,000), CHW transport allowances ($20,000). M&E (8% - $40,000): Baseline and endline surveys ($20,000), data management systems ($10,000), quarterly reviews ($10,000). Overhead (13% - $65,000): Office costs, utilities, insurance, audit fees.",
    "sustainability": "Our sustainability strategy rests on three pillars. First, government integration: we align fully with Kenya's Community Health Strategy and will formally transition CHWs to the county health payroll by month 18, leveraging the government's commitment to fund 100,000 CHWs nationally. Second, community ownership: Village Health Committees will be trained to manage and supervise CHWs, with community health funds established through savings groups. Third, diversified funding: we are pursuing parallel funding from the Global Fund and county government health budgets to ensure continuity. Our Turkana pilot achieved 85% CHW retention after external funding ended, demonstrating the viability of this transition model."
})

SALAM_RESPONSES = json.dumps({
    "approach": "Salam Relief proposes deploying 40 community health workers across Benadir and Lower Shabelle regions of Somalia, targeting IDP settlements and peri-urban communities with limited health access. Our CHW model uses a simplified training approach of 4 weeks covering basic health screening, nutrition assessment, referral pathways, and community health education. CHWs will be selected from within IDP camps and host communities to ensure cultural acceptance. Each CHW will cover approximately 300 households. Supervision will be conducted bi-weekly by our health program officers. We will use paper-based reporting initially with plans to transition to digital tools by month 6.",
    "experience": "Salam Relief has been active in health and nutrition programming in Somalia since 2016. Our emergency health response during the 2022 drought reached approximately 45,000 beneficiaries across 8 IDP camps in Mogadishu. We deployed 25 community health volunteers during the cholera outbreak in 2023, achieving 90% household visit coverage in target areas. Our nutrition screening program identified and referred over 2,000 children with severe acute malnutrition. While our CHW programs have been primarily emergency-focused, we have built strong community trust and established referral networks with Benadir Regional Hospital and 5 primary health centers.",
    "coverage": "We will focus on Benadir Region (Mogadishu) and Lower Shabelle, covering 15 IDP settlements and 5 host community neighborhoods. Estimated reach is 60,000 beneficiaries across 12,000 households. Our existing presence in these locations gives us established relationships with camp leaders and local authorities. Areas are accessible year-round, reducing logistics challenges.",
    "timeline": "Month 1-3: Community engagement, CHW recruitment, and training. Month 4-9: CHW deployment with weekly supervision. Month 10-12: Review, documentation, and sustainability planning. We anticipate a 12-month implementation period with potential for extension.",
    "budget_nar": "Personnel (45%): Program Coordinator, 2 Health Officers, 40 CHW incentives. Training (20%): 4-week training program, materials, refreshers. Equipment (10%): Health kits, reporting supplies. Transport (15%): Field visits, supervision travel. Overhead (10%): Office, communications, administration.",
    "sustainability": "We plan to integrate CHWs into the Benadir health cluster coordination mechanism and seek continued funding through OCHA pooled funds. Community health committees will be established to provide local oversight and support."
})

UBUNTU_RESPONSES = json.dumps({
    "approach": "Ubuntu Education Trust proposes deploying our proven SmartLearn tablet-based learning platform to 50 rural primary schools across Kenya and Uganda. SmartLearn uses adaptive learning algorithms to personalize mathematics and literacy instruction for students in grades 3-6. The platform works offline, syncing data when connectivity is available, making it ideal for rural settings. Each school receives a set of 40 tablets, a solar charging station, and a teacher facilitation guide. Our evidence from a randomized controlled trial in South Africa showed a 23% improvement in numeracy scores and 18% improvement in literacy after one academic year. Teachers receive 5-day in-person training followed by monthly virtual coaching sessions. The platform includes a real-time teacher dashboard showing student progress, areas of difficulty, and suggested lesson modifications.",
    "experience": "Ubuntu has been implementing education programs since 2008, reaching over 200,000 students across South Africa, Kenya, Uganda, Tanzania, and Mozambique. Our SmartLearn platform has been deployed in 120 schools with rigorous impact evaluation. In our 2023-2025 Kenya pilot (30 schools, 3,600 students), we measured a 23% improvement in grade-level mathematics achievement and reduced the gender gap in STEM performance by 40%. Our teacher training program has equipped over 800 teachers with EdTech facilitation skills. We hold partnerships with the Kenya Ministry of Education, Uganda National Curriculum Development Centre, and multiple international donors including DFID, USAID, and the Mastercard Foundation.",
    "implementation": "Phase 1 (Month 1-3): School selection and baseline assessment. We will work with county and district education offices to identify 50 schools meeting our criteria: rural location, minimum 200 enrollment, basic infrastructure, and willing school leadership. Phase 2 (Month 4-5): Infrastructure setup including solar charging stations, tablet provisioning, and network configuration. Phase 3 (Month 5-6): Teacher training (5-day intensive) with school-level practice sessions. Phase 4 (Month 7-18): Active deployment with weekly content updates, monthly teacher coaching, quarterly school visits, and real-time data monitoring. Phase 5 (Month 19-24): Impact evaluation, scale planning, and government handover preparation. Technical support is provided via our regional hub in Nairobi staffed by 3 full-time EdTech specialists.",
    "sustainability": "Ubuntu's sustainability model integrates three strategies. First, government adoption: we are in active discussions with Kenya's Ministry of Education to include SmartLearn in the national digital learning program, with a commitment letter already received. Second, cost optimization: solar charging eliminates electricity costs, and tablet refresh cycles of 4 years keep per-student costs below $15 annually. Third, local capacity: we train 2 teachers per school as EdTech champions who can support peers and troubleshoot issues independently. Our South Africa deployment has been self-sustaining for 3 years with government funding covering 80% of operational costs."
})

SAHEL_RESPONSES = json.dumps({
    "approach": "Sahel Women's Network proposes a community-based protection approach that leverages our network of 15 grassroots women's organizations across 4 Sahel countries. We will train 60 community protection monitors who identify and respond to GBV cases, establish 8 women's safe spaces, and create a regional advocacy platform for women's participation in governance. Our approach centers women's voices in designing protection mechanisms, drawing on traditional conflict resolution practices adapted with human rights principles.",
    "experience": "Though established in 2020, our founding members bring decades of collective experience in women's rights across the Sahel. Our network coordinated a multi-country GBV awareness campaign in 2024 reaching 15,000 women through community dialogues. We facilitated the participation of 45 women in local government consultations in Nigeria and Niger. However, as a network rather than direct implementer, our programmatic track record is still developing.",
    "governance": "Our governance participation strategy has three components: training women candidates for local elections, establishing women's advocacy committees in 20 communities, and creating a regional policy brief series on women's political participation. We aim to increase women's representation in target community governance structures by 25% over the project period.",
    "sustainability": "We will build the capacity of our 15 member organizations to independently deliver protection services and governance training. A small grants mechanism will enable member groups to continue activities after the project. We are also building relationships with UN Women and the African Union for longer-term institutional support."
})

HOPE_PARTIAL_RESPONSES = json.dumps({
    "approach": "Hope Bridges proposes training 20 community health workers in Gulu and Lira districts of Northern Uganda, focusing on communities affected by climate change impacts on agricultural livelihoods and associated health challenges. Our CHWs will integrate health screening with climate-smart agriculture messaging.",
    "experience": "Hope Bridges has been operating in Northern Uganda since 2019. Our initial programs focused on climate-resilient farming techniques, reaching 2,000 smallholder farmers. We began integrating health components in 2024 with a small community health volunteer program."
})

# ---------------------------------------------------------------------------
# Assessment templates
# ---------------------------------------------------------------------------

def make_assessment(org_id, score, created_at):
    """Build an Assessment dict with category scores and checklist."""
    if score >= 85:
        cats = {"registration": 95, "governance": 90, "financial": 88, "policies": 85, "programmatic": 92}
    elif score >= 75:
        cats = {"registration": 90, "governance": 82, "financial": 78, "policies": 75, "programmatic": 85}
    elif score >= 60:
        cats = {"registration": 85, "governance": 70, "financial": 65, "policies": 60, "programmatic": 72}
    elif score >= 50:
        cats = {"registration": 70, "governance": 55, "financial": 50, "policies": 48, "programmatic": 58}
    else:
        cats = {"registration": 50, "governance": 45, "financial": 40, "policies": 42, "programmatic": 48}

    # Build 19-item checklist based on score thresholds
    checklist_items = [
        "Valid registration certificate",
        "Board of directors established",
        "Annual general meetings held",
        "Constitution or governing document",
        "Strategic plan in place",
        "Annual financial statements prepared",
        "External audit completed",
        "Bank account in organization name",
        "Financial controls documented",
        "Anti-fraud policy",
        "PSEA policy",
        "Safeguarding policy",
        "HR manual",
        "Procurement policy",
        "M&E framework",
        "Program reports available",
        "Beneficiary feedback mechanism",
        "Data protection policy",
        "Risk management plan",
    ]
    # Number of True items proportional to score
    n_true = int(round(score / 100 * 19))
    checklist = {item: (i < n_true) for i, item in enumerate(checklist_items)}

    gaps = []
    for cat, cat_score in cats.items():
        if cat_score < 80:
            gaps.append({"category": cat, "score": cat_score,
                         "gap": f"{cat.title()} capacity needs strengthening (scored {cat_score}%)"})

    return dict(
        org_id=org_id,
        assess_type='free',
        framework='kuja',
        status='completed',
        overall_score=score,
        category_scores=json.dumps(cats),
        checklist_responses=json.dumps(checklist),
        gaps=json.dumps(gaps),
        completed_at=created_at,
        created_at=created_at,
    )


# ---------------------------------------------------------------------------
# Main seed function
# ---------------------------------------------------------------------------

def seed():
    with app.app_context():
        db.create_all()

        if User.query.first():
            print('Database already seeded. Use --force to re-seed.')
            if '--force' not in sys.argv:
                return
            print('Dropping all tables and re-creating ...')
            db.drop_all()
            db.create_all()

        # ---- Organizations ------------------------------------------------
        orgs = []
        for data in ORGANIZATIONS:
            org = Organization(**data)
            db.session.add(org)
            orgs.append(org)
        db.session.flush()  # assigns IDs
        print(f'  Created {len(orgs)} organizations')

        # ---- Users --------------------------------------------------------
        users = []
        for email, name, role, org_idx in USERS:
            u = User(
                email=email,
                name=name,
                password_hash=PASSWORD_HASH,
                role=role,
                org_id=orgs[org_idx].id if org_idx is not None else None,
            )
            db.session.add(u)
            users.append(u)
        db.session.flush()
        print(f'  Created {len(users)} users')

        # ---- Grants -------------------------------------------------------
        grants = []

        g1 = Grant(
            title='Community Health Workers Scale-Up Program',
            description='This grant supports the training, deployment, and supervision of community health workers in rural areas across East Africa. We seek experienced NGOs with strong community health track records to implement innovative CHW programs that integrate nutrition screening, maternal health, and disease surveillance.',
            donor_org_id=orgs[5].id,  # Global Health Fund
            total_funding=500000, currency='USD',
            deadline=date(2026, 4, 15), status='open',
            sectors=json.dumps(['Health', 'Nutrition']),
            countries=json.dumps(['Kenya', 'Somalia', 'Uganda']),
            eligibility=GRANT1_ELIGIBILITY,
            criteria=GRANT1_CRITERIA,
            doc_requirements=GRANT1_DOC_REQUIREMENTS,
            created_at=dt(2026, 1, 15, 9, 0),
        )
        db.session.add(g1); grants.append(g1)

        g2 = Grant(
            title='Education Technology for Rural Schools',
            description='Supporting innovative education technology solutions that improve learning outcomes in rural schools. We are looking for organizations that can deploy and maintain EdTech solutions with measurable impact on student achievement.',
            donor_org_id=orgs[6].id,  # EA Development Trust
            total_funding=250000, currency='USD',
            deadline=date(2026, 5, 1), status='open',
            sectors=json.dumps(['Education', 'Technology']),
            countries=json.dumps(['Kenya', 'Uganda', 'Tanzania']),
            eligibility=GRANT2_ELIGIBILITY,
            criteria=GRANT2_CRITERIA,
            doc_requirements=GRANT2_DOC_REQUIREMENTS,
            created_at=dt(2026, 1, 20, 10, 30),
        )
        db.session.add(g2); grants.append(g2)

        g3 = Grant(
            title='Climate Resilience in East Africa',
            description='A major initiative to build climate resilience in East African communities through sustainable agriculture, early warning systems, and livelihood diversification.',
            donor_org_id=orgs[5].id,
            total_funding=1000000, currency='USD',
            deadline=date(2026, 6, 30), status='draft',
            sectors=json.dumps(['Climate', 'Agriculture', 'Livelihoods']),
            countries=json.dumps(['Kenya', 'Somalia', 'Ethiopia', 'Uganda']),
            eligibility=GRANT3_ELIGIBILITY,
            criteria=GRANT3_CRITERIA,
            doc_requirements=GRANT3_DOC_REQUIREMENTS,
            created_at=dt(2026, 2, 1, 14, 0),
        )
        db.session.add(g3); grants.append(g3)

        g4 = Grant(
            title="Women's Protection and Empowerment",
            description="Supporting women-led organizations in the Sahel to strengthen protection mechanisms and promote women's participation in governance.",
            donor_org_id=orgs[6].id,
            total_funding=350000, currency='USD',
            deadline=date(2026, 4, 30), status='open',
            sectors=json.dumps(['Protection', 'Gender', 'Governance']),
            countries=json.dumps(['Nigeria', 'Niger', 'Chad', 'Mali']),
            eligibility=GRANT4_ELIGIBILITY,
            criteria=GRANT4_CRITERIA,
            doc_requirements=GRANT4_DOC_REQUIREMENTS,
            created_at=dt(2026, 1, 25, 11, 0),
        )
        db.session.add(g4); grants.append(g4)

        db.session.flush()
        print(f'  Created {len(grants)} grants')

        # ---- Grant Reporting Configuration --------------------------------
        # Grant 1: Community Health Workers - full reporting setup
        grants[0].set_reporting_requirements([
            {'type': 'financial', 'title': 'Quarterly Financial Report', 'description': 'Detailed expenditure statement with budget variance analysis', 'frequency': 'quarterly', 'due_days_after_period': 30},
            {'type': 'narrative', 'title': 'Semi-Annual Progress Report', 'description': 'Activities completed, progress against indicators, challenges and lessons learned', 'frequency': 'semi-annual', 'due_days_after_period': 45},
            {'type': 'impact', 'title': 'Annual Impact Report', 'description': 'Outcome-level results, beneficiary data, sustainability assessment', 'frequency': 'annual', 'due_days_after_period': 60},
            {'type': 'final', 'title': 'Final Project Report', 'description': 'Comprehensive end-of-project report with audited financials', 'frequency': 'final', 'due_days_after_period': 90},
        ])
        grants[0].reporting_frequency = 'quarterly'
        grants[0].set_report_template({
            'template_sections': [
                {'title': 'Executive Summary', 'description': 'Brief overview of the reporting period', 'required': True},
                {'title': 'Activities and Outputs', 'description': 'Detailed description of activities and outputs achieved', 'required': True},
                {'title': 'Progress Against Indicators', 'description': 'Update on all KPIs with data', 'required': True},
                {'title': 'Financial Summary', 'description': 'Budget utilization and expenditure summary', 'required': True},
                {'title': 'Challenges and Mitigation', 'description': 'Issues encountered and solutions', 'required': True},
                {'title': 'Beneficiary Data', 'description': 'Disaggregated beneficiary numbers', 'required': True},
                {'title': 'Lessons Learned', 'description': 'Key learnings and best practices', 'required': False},
                {'title': 'Next Steps', 'description': 'Planned activities for upcoming period', 'required': True},
            ],
            'indicators': [
                {'name': 'CHWs trained and active', 'target': '50', 'unit': 'people'},
                {'name': 'Household visits per quarter', 'target': '5000', 'unit': 'visits'},
                {'name': 'Facility referrals', 'target': '800', 'unit': 'referrals'},
                {'name': 'Budget utilization rate', 'target': '85%', 'unit': 'percentage'},
            ]
        })

        # Grant 2: Education Technology - quarterly reporting
        grants[1].set_reporting_requirements([
            {'type': 'financial', 'title': 'Quarterly Financial Report', 'description': 'Budget vs actual expenditure report', 'frequency': 'quarterly', 'due_days_after_period': 30},
            {'type': 'narrative', 'title': 'Quarterly Progress Report', 'description': 'Activities, outputs, and progress against targets', 'frequency': 'quarterly', 'due_days_after_period': 30},
            {'type': 'final', 'title': 'Final Project Report', 'description': 'End-of-project report with impact evaluation results', 'frequency': 'final', 'due_days_after_period': 60},
        ])
        grants[1].reporting_frequency = 'quarterly'

        # Grant 3: Climate Resilience - semi-annual reporting
        grants[2].set_reporting_requirements([
            {'type': 'financial', 'title': 'Semi-Annual Financial Report', 'description': 'Budget utilization and expenditure report', 'frequency': 'semi-annual', 'due_days_after_period': 45},
            {'type': 'narrative', 'title': 'Semi-Annual Progress Report', 'description': 'Progress narrative with indicator updates', 'frequency': 'semi-annual', 'due_days_after_period': 45},
            {'type': 'final', 'title': 'Final Report', 'description': 'Comprehensive final report', 'frequency': 'final', 'due_days_after_period': 90},
        ])
        grants[2].reporting_frequency = 'semi-annual'

        # Grant 4: Women's Protection - quarterly reporting
        grants[3].set_reporting_requirements([
            {'type': 'financial', 'title': 'Quarterly Financial Report', 'description': 'Financial statement with budget variance', 'frequency': 'quarterly', 'due_days_after_period': 30},
            {'type': 'narrative', 'title': 'Quarterly Narrative Report', 'description': 'Activities and progress update', 'frequency': 'quarterly', 'due_days_after_period': 30},
        ])
        grants[3].reporting_frequency = 'quarterly'

        print('  Added reporting requirements to grants')

        # ---- Applications -------------------------------------------------
        apps = []

        # 1) Amani -> Grant 1 (CHW) - submitted
        a1 = Application(
            ngo_org_id=orgs[0].id, grant_id=g1.id,
            status='submitted', submitted_at=dt(2026, 2, 20, 14, 30),
            responses=AMANI_RESPONSES,
            ai_score=78.5,
            created_at=dt(2026, 2, 10, 9, 0),
        )
        db.session.add(a1); apps.append(a1)

        # 2) Salam -> Grant 1 (CHW) - submitted
        a2 = Application(
            ngo_org_id=orgs[1].id, grant_id=g1.id,
            status='submitted', submitted_at=dt(2026, 2, 22, 11, 15),
            responses=SALAM_RESPONSES,
            ai_score=65.0,
            created_at=dt(2026, 2, 12, 10, 0),
        )
        db.session.add(a2); apps.append(a2)

        # 3) Ubuntu -> Grant 2 (EdTech) - under_review
        a3 = Application(
            ngo_org_id=orgs[2].id, grant_id=g2.id,
            status='under_review', submitted_at=dt(2026, 2, 18, 16, 45),
            responses=UBUNTU_RESPONSES,
            ai_score=88.0,
            created_at=dt(2026, 2, 5, 8, 30),
        )
        db.session.add(a3); apps.append(a3)

        # 4) Hope Bridges -> Grant 1 (CHW) - draft (partial)
        a4 = Application(
            ngo_org_id=orgs[3].id, grant_id=g1.id,
            status='draft',
            responses=HOPE_PARTIAL_RESPONSES,
            created_at=dt(2026, 2, 15, 13, 0),
        )
        db.session.add(a4); apps.append(a4)

        # 5) Sahel Women -> Grant 4 (Women's Protection) - submitted
        a5 = Application(
            ngo_org_id=orgs[4].id, grant_id=g4.id,
            status='submitted', submitted_at=dt(2026, 2, 25, 9, 30),
            responses=SAHEL_RESPONSES,
            ai_score=52.0,
            created_at=dt(2026, 2, 16, 11, 0),
        )
        db.session.add(a5); apps.append(a5)

        db.session.flush()
        print(f'  Created {len(apps)} applications')

        # ---- Assessments (one per NGO) ------------------------------------
        ngo_scores = [
            (orgs[0].id, 82.0, dt(2026, 1, 20, 10, 0)),
            (orgs[1].id, 68.0, dt(2026, 1, 22, 14, 0)),
            (orgs[2].id, 91.0, dt(2026, 1, 18, 9, 0)),
            (orgs[3].id, 55.0, dt(2026, 1, 25, 11, 0)),
            (orgs[4].id, 47.0, dt(2026, 1, 28, 15, 0)),
        ]
        assessments = []
        for org_id, score, created in ngo_scores:
            a = Assessment(**make_assessment(org_id, score, created))
            db.session.add(a)
            assessments.append(a)
        db.session.flush()
        print(f'  Created {len(assessments)} assessments')

        # ---- Documents ----------------------------------------------------
        docs = []

        def make_doc(application_id, org_id, doc_type, filename, score, findings, recommendations, created_at):
            return Document(
                application_id=application_id,
                doc_type=doc_type,
                original_filename=filename,
                stored_filename=f'{doc_type}_{org_id}_{filename}',
                file_size=int(150000 + score * 1000),
                mime_type='application/pdf',
                ai_analysis=json.dumps({
                    'score': score,
                    'findings': findings,
                    'recommendations': recommendations,
                }),
                score=float(score),
                uploaded_at=created_at,
            )

        # Amani docs (application 1)
        docs.append(make_doc(a1.id, orgs[0].id, 'financialReport',
            'amani_financial_2023-2025.pdf', 82,
            ['Three years of audited financial statements provided',
             'Revenue growth of 15% year-over-year',
             'Overhead ratio at 13%, within acceptable range',
             'Clear separation of restricted and unrestricted funds'],
            ['Consider diversifying funding sources beyond 3 major donors',
             'Strengthen cash flow forecasting processes'],
            dt(2026, 2, 18, 10, 0)))

        docs.append(make_doc(a1.id, orgs[0].id, 'registrationCert',
            'amani_registration_certificate.pdf', 95,
            ['Valid NGO registration certificate from Kenya NGO Coordination Board',
             'Registration number NGO/2012/3847 confirmed active',
             'Certificate valid through December 2027'],
            ['Ensure timely renewal well before expiry date'],
            dt(2026, 2, 18, 10, 5)))

        docs.append(make_doc(a1.id, orgs[0].id, 'auditReport',
            'amani_audit_2024.pdf', 78,
            ['External audit by PKF Kenya - unqualified opinion',
             'No material misstatements identified',
             'Minor finding on asset register completeness'],
            ['Update fixed asset register quarterly',
             'Implement automated reconciliation for field office expenses'],
            dt(2026, 2, 18, 10, 10)))

        docs.append(make_doc(a1.id, orgs[0].id, 'pseaPolicy',
            'amani_psea_policy_2024.pdf', 88,
            ['Comprehensive PSEA policy covering all required components',
             'Reporting mechanism includes confidential hotline',
             'Investigation procedures clearly outlined',
             'Annual staff training requirement documented'],
            ['Add whistleblower protection clause',
             'Include community awareness component'],
            dt(2026, 2, 19, 9, 0)))

        # Salam docs (application 2)
        docs.append(make_doc(a2.id, orgs[1].id, 'financialReport',
            'salam_financial_2022-2024.pdf', 65,
            ['Financial statements provided for 3 years',
             'Significant donor dependency on single OCHA grant',
             'Overhead at 18%, slightly above benchmark'],
            ['Diversify funding base urgently',
             'Reduce overhead costs to below 15%',
             'Improve financial narrative documentation'],
            dt(2026, 2, 20, 11, 0)))

        docs.append(make_doc(a2.id, orgs[1].id, 'registrationCert',
            'salam_registration_cert.pdf', 90,
            ['Valid registration under Somalia NGO Act',
             'Registration SOM/NGO/2015/221 confirmed by Ministry'],
            ['Monitor registration renewal timeline'],
            dt(2026, 2, 20, 11, 5)))

        docs.append(make_doc(a2.id, orgs[1].id, 'auditReport',
            'salam_audit_2023.pdf', 60,
            ['External audit completed by local firm',
             'Qualified opinion due to incomplete field expense documentation',
             'Inventory management weakness noted'],
            ['Engage a Big 4 or internationally recognized audit firm',
             'Implement digital expense tracking for field offices',
             'Establish proper inventory management system'],
            dt(2026, 2, 20, 11, 10)))

        # Ubuntu docs (application 3)
        docs.append(make_doc(a3.id, orgs[2].id, 'financialReport',
            'ubuntu_financial_2023-2024.pdf', 92,
            ['Excellent financial management with clean audit history',
             'Diversified funding across 8 major donors',
             'Overhead ratio at 11%, well below sector average',
             'Strong reserves policy maintained'],
            ['Consider establishing an endowment fund for long-term sustainability'],
            dt(2026, 2, 16, 14, 0)))

        docs.append(make_doc(a3.id, orgs[2].id, 'registrationCert',
            'ubuntu_npo_registration.pdf', 98,
            ['Valid South African NPO registration ZA-NPO-2008-071234',
             'Also registered with SARS as tax-exempt public benefit organization',
             'Cross-border operating permits for Kenya and Uganda on file'],
            [],
            dt(2026, 2, 16, 14, 5)))

        docs.append(make_doc(a3.id, orgs[2].id, 'projectReport',
            'ubuntu_smartlearn_impact_2024.pdf', 90,
            ['Rigorous impact evaluation using RCT methodology',
             'Statistically significant improvements in numeracy (23%) and literacy (18%)',
             'High teacher satisfaction scores (4.6/5.0)',
             'Gender gap in STEM reduced by 40%'],
            ['Extend evaluation to include long-term retention outcomes',
             'Add cost-effectiveness analysis to future reports'],
            dt(2026, 2, 16, 14, 10)))

        for d in docs:
            db.session.add(d)
        db.session.flush()
        print(f'  Created {len(docs)} documents')

        # ---- Reviews ------------------------------------------------------
        reviews = []

        r1 = Review(
            application_id=a1.id,
            reviewer_user_id=users[5].id,  # James
            status='completed',
            overall_score=76,
            scores=json.dumps({
                'approach': 80, 'experience': 85,
                'coverage': 75, 'timeline': 72,
                'budget_nar': 70, 'sustainability': 78
            }),
            comments=json.dumps({
                'approach': 'Strong CHW model with evidence-based methodology. Good integration with county health systems. Could elaborate more on digital tools strategy.',
                'experience': 'Impressive track record with concrete outcomes. Strong team qualifications. Clear demonstrated capacity.',
                'coverage': 'Reasonable geographic scope. Pastoral community coverage plan is innovative but needs more detail on logistics.',
                'timeline': 'Timeline is realistic but tight for the scale of the program. Month 5-6 training period may need extension.',
                'budget_nar': 'Budget is generally well-justified. CHW stipend level may be low for retention. Overhead slightly high at 13%.',
                'sustainability': 'Government integration plan is credible given Kenya policy environment. Community ownership mechanisms need more detail.'
            }),
            completed_at=dt(2026, 2, 26, 16, 0),
            created_at=dt(2026, 2, 24, 9, 0),
        )
        db.session.add(r1); reviews.append(r1)

        r2 = Review(
            application_id=a2.id,
            reviewer_user_id=users[5].id,  # James
            status='in_progress',
            overall_score=None,
            scores=json.dumps({
                'approach': 62, 'experience': 68,
            }),
            comments=json.dumps({
                'approach': 'Basic CHW model with limited innovation. Paper-based reporting is a concern. Transition to digital tools needs clearer plan.',
                'experience': 'Relevant emergency health experience but limited long-term CHW program track record. Good community trust.',
            }),
            created_at=dt(2026, 2, 25, 10, 0),
        )
        db.session.add(r2); reviews.append(r2)

        r3 = Review(
            application_id=a3.id,
            reviewer_user_id=users[6].id,  # Maria
            status='assigned',
            created_at=dt(2026, 2, 26, 8, 0),
        )
        db.session.add(r3); reviews.append(r3)

        db.session.flush()
        print(f'  Created {len(reviews)} reviews')

        # ---- Compliance Checks --------------------------------------------
        checks = []

        def add_checks(org_id, items):
            for check_type, status, details, checked_at in items:
                c = ComplianceCheck(
                    org_id=org_id,
                    check_type=check_type,
                    status=status,
                    result=json.dumps(details),
                    checked_at=checked_at,
                )
                db.session.add(c)
                checks.append(c)

        # Amani - all clear (live screening format)
        add_checks(orgs[0].id, [
            ('un_sanctions', 'clear', {'source': 'UN Security Council Consolidated List', 'method': 'opensanctions_api', 'result': 'No match found', 'query': 'Amani Community Development', 'api_score': 0, 'checked_date': '2026-02-15'}, dt(2026, 2, 15, 8, 0)),
            ('ofac_sdn', 'clear', {'source': 'US OFAC SDN List', 'method': 'opensanctions_api', 'result': 'No match found', 'query': 'Amani Community Development', 'api_score': 0}, dt(2026, 2, 15, 8, 2)),
            ('eu_sanctions', 'clear', {'source': 'EU Financial Sanctions', 'method': 'opensanctions_api', 'result': 'No match found', 'query': 'Amani Community Development', 'api_score': 0}, dt(2026, 2, 15, 8, 4)),
            ('world_bank', 'clear', {'source': 'World Bank Debarment List', 'method': 'opensanctions_api', 'result': 'Not listed', 'query': 'Amani Community Development', 'api_score': 0}, dt(2026, 2, 15, 8, 6)),
            ('keyword_screening', 'clear', {'source': 'Internal keyword screening', 'result': 'No sanctioned keywords found in organization name or description'}, dt(2026, 2, 15, 8, 8)),
        ])

        # Salam - all clear (live screening format)
        add_checks(orgs[1].id, [
            ('un_sanctions', 'clear', {'source': 'UN Security Council Consolidated List', 'method': 'opensanctions_api', 'result': 'No match found', 'query': 'Salam Relief Foundation'}, dt(2026, 2, 16, 9, 0)),
            ('ofac_sdn', 'clear', {'source': 'US OFAC SDN List', 'method': 'opensanctions_api', 'result': 'No match found', 'query': 'Salam Relief Foundation'}, dt(2026, 2, 16, 9, 2)),
            ('eu_sanctions', 'clear', {'source': 'EU Financial Sanctions', 'method': 'opensanctions_api', 'result': 'No match found', 'query': 'Salam Relief Foundation'}, dt(2026, 2, 16, 9, 4)),
            ('world_bank', 'clear', {'source': 'World Bank Debarment List', 'method': 'opensanctions_api', 'result': 'Not listed', 'query': 'Salam Relief Foundation'}, dt(2026, 2, 16, 9, 6)),
        ])

        # Ubuntu - all clear (live screening format)
        add_checks(orgs[2].id, [
            ('un_sanctions', 'clear', {'source': 'UN Security Council Consolidated List', 'method': 'opensanctions_api', 'result': 'No match found', 'query': 'Ubuntu Education Trust'}, dt(2026, 2, 14, 10, 0)),
            ('ofac_sdn', 'clear', {'source': 'US OFAC SDN List', 'method': 'opensanctions_api', 'result': 'No match found', 'query': 'Ubuntu Education Trust'}, dt(2026, 2, 14, 10, 2)),
            ('eu_sanctions', 'clear', {'source': 'EU Financial Sanctions', 'method': 'opensanctions_api', 'result': 'No match found', 'query': 'Ubuntu Education Trust'}, dt(2026, 2, 14, 10, 4)),
            ('world_bank', 'clear', {'source': 'World Bank Debarment List', 'method': 'opensanctions_api', 'result': 'Not listed', 'query': 'Ubuntu Education Trust'}, dt(2026, 2, 14, 10, 6)),
            ('keyword_screening', 'clear', {'source': 'Internal keyword screening', 'result': 'No sanctioned keywords found'}, dt(2026, 2, 14, 10, 8)),
        ])

        # Hope Bridges - all clear on sanctions, registration pending (Uganda)
        add_checks(orgs[3].id, [
            ('un_sanctions', 'clear', {'source': 'UN Security Council Consolidated List', 'method': 'opensanctions_api', 'result': 'No match found', 'query': 'Hope Bridges Initiative'}, dt(2026, 2, 17, 11, 0)),
            ('ofac_sdn', 'clear', {'source': 'US OFAC SDN List', 'method': 'opensanctions_api', 'result': 'No match found', 'query': 'Hope Bridges Initiative'}, dt(2026, 2, 17, 11, 2)),
            ('eu_sanctions', 'clear', {'source': 'EU Financial Sanctions', 'method': 'opensanctions_api', 'result': 'No match found', 'query': 'Hope Bridges Initiative'}, dt(2026, 2, 17, 11, 4)),
            ('world_bank', 'clear', {'source': 'World Bank Debarment List', 'method': 'opensanctions_api', 'result': 'Not listed', 'query': 'Hope Bridges Initiative'}, dt(2026, 2, 17, 11, 6)),
        ])

        # Sahel Women - flagged on sanctions (partial name match demo)
        add_checks(orgs[4].id, [
            ('un_sanctions', 'flagged', {'source': 'UN Security Council Consolidated List', 'method': 'opensanctions_api', 'result': 'Partial name match found', 'query': 'Sahel Women\'s Network', 'match_details': "Name 'Sahel' partially matched sanctioned entity. Score: 0.42. Likely false positive.", 'api_score': 0.42, 'risk_level': 'low', 'action_required': 'Manual review recommended'}, dt(2026, 2, 18, 12, 0)),
            ('ofac_sdn', 'clear', {'source': 'US OFAC SDN List', 'method': 'opensanctions_api', 'result': 'No match found', 'query': 'Sahel Women\'s Network', 'api_score': 0}, dt(2026, 2, 18, 12, 2)),
            ('eu_sanctions', 'clear', {'source': 'EU Financial Sanctions', 'method': 'opensanctions_api', 'result': 'No match found', 'query': 'Sahel Women\'s Network', 'api_score': 0}, dt(2026, 2, 18, 12, 4)),
            ('world_bank', 'clear', {'source': 'World Bank Debarment List', 'method': 'opensanctions_api', 'result': 'Not listed', 'query': 'Sahel Women\'s Network', 'api_score': 0}, dt(2026, 2, 18, 12, 6)),
            ('keyword_screening', 'clear', {'source': 'Internal keyword screening', 'result': 'No sanctioned keywords found in organization name or description'}, dt(2026, 2, 18, 12, 8)),
        ])

        db.session.flush()
        print(f'  Created {len(checks)} compliance checks')

        # ---- Reports ------------------------------------------------------
        print('  Creating reports...')
        reports = []

        # Report 1: Submitted Q1 financial report
        report1 = Report(
            grant_id=grants[0].id,
            application_id=apps[0].id,
            submitted_by_org_id=orgs[0].id,
            report_type='financial',
            reporting_period='Q1 2026',
            title='Q1 2026 Financial Report - Community Health Workers Program',
            status='submitted',
            due_date=date(2026, 4, 30),
            submitted_at=datetime(2026, 4, 15, 10, 0, 0),
            created_at=datetime(2026, 4, 10, 9, 0, 0),
        )
        report1.set_content({
            'Executive Summary': 'This report covers Q1 2026 financial performance. Total expenditure was $127,450 against a quarterly budget of $145,000, representing 87.9% utilization.',
            'Activities and Outputs': 'Personnel costs of $78,800 covered 25 CHWs and program staff. Three training workshops conducted for $12,450. Medical supplies procured for $8,920.',
            'Financial Summary': 'Opening balance: $312,500. Income: $145,234.50. Expenditure: $127,450. Closing balance: $330,284.50. Budget utilization: 87.9%.',
            'Challenges and Mitigation': 'M&E activities under budget due to baseline survey postponement caused by access constraints in target districts. Will be completed in Q2.',
            'Next Steps': 'Complete baseline survey, recruit 2 additional CHWs, conduct Q2 training workshops.',
        })
        report1.set_ai_analysis({
            'score': 82,
            'completeness_score': 85,
            'quality_score': 78,
            'compliance_score': 80,
            'findings': ['Budget variance analysis is thorough', 'Expenditure categories are clearly documented', 'Cash flow projection included'],
            'missing_items': ['Disaggregated beneficiary data not included in financial report'],
            'recommendations': ['Include procurement details for items over $5,000', 'Add exchange rate impact analysis'],
            'requirement_scores': [
                {'requirement': 'Statement of expenditure by budget line item', 'score': 90, 'addressed': True, 'feedback': 'Expenditure well documented by category with clear budget line items.'},
                {'requirement': 'Budget vs. actual comparison with variance analysis', 'score': 85, 'addressed': True, 'feedback': 'Good variance analysis showing 87.9% utilization rate.'},
                {'requirement': 'Bank reconciliation statement', 'score': 75, 'addressed': True, 'feedback': 'Opening and closing balances provided but formal bank reconciliation not attached.'},
                {'requirement': 'Cash flow projection for next quarter', 'score': 70, 'addressed': True, 'feedback': 'Next steps mentioned but formal cash flow projection could be more detailed.'},
                {'requirement': 'List of procurements exceeding $5,000', 'score': 60, 'addressed': False, 'feedback': 'Procurement amounts mentioned but no itemized list for items over $5,000.'},
            ],
            'summary': 'Solid quarterly financial report with good budget tracking. Minor gaps in procurement documentation.',
            'risk_flags': ['Procurement documentation incomplete for items over $5,000 threshold'],
        })
        db.session.add(report1)
        reports.append(report1)

        # Report 2: Draft narrative report
        report2 = Report(
            grant_id=grants[0].id,
            application_id=apps[0].id,
            submitted_by_org_id=orgs[0].id,
            report_type='narrative',
            reporting_period='H1 2026',
            title='Semi-Annual Progress Report - H1 2026',
            status='draft',
            due_date=date(2026, 8, 15),
            created_at=datetime(2026, 3, 1, 9, 0, 0),
        )
        report2.set_content({
            'Executive Summary': 'Draft - First half progress report covering January to June 2026.',
            'Activities and Outputs': 'Draft - 25 CHWs deployed, 15,600 household visits completed.',
        })
        db.session.add(report2)
        reports.append(report2)

        # Report 3: Accepted report from a different NGO
        report3 = Report(
            grant_id=grants[0].id,
            application_id=apps[1].id if len(apps) > 1 else apps[0].id,
            submitted_by_org_id=orgs[1].id if len(orgs) > 1 else orgs[0].id,
            report_type='progress',
            reporting_period='Q4 2025',
            title='Q4 2025 Progress Report',
            status='accepted',
            due_date=date(2026, 1, 30),
            submitted_at=datetime(2026, 1, 20, 14, 30, 0),
            reviewed_at=datetime(2026, 2, 5, 11, 0, 0),
            reviewer_notes='Good progress. Continue with current approach.',
            created_at=datetime(2026, 1, 15, 9, 0, 0),
        )
        report3.set_content({
            'Executive Summary': 'Strong progress in Q4 2025 with all major milestones achieved.',
            'Activities and Outputs': 'Completed initial CHW training cohort, established community health posts in 8 villages.',
            'Progress Against Indicators': 'CHW recruitment: 100% target achieved. Household visits: exceeded target by 15%.',
            'Beneficiary Data': 'Total beneficiaries: 8,350 (5,230 female, 3,120 male). Children under 5: 2,540.',
        })
        report3.set_ai_analysis({
            'score': 88,
            'completeness_score': 90,
            'quality_score': 85,
            'compliance_score': 92,
            'findings': ['All required sections completed', 'Beneficiary data well disaggregated', 'Good use of quantitative indicators'],
            'missing_items': [],
            'recommendations': ['Include success stories for future reports', 'Add comparison with previous quarter'],
            'requirement_scores': [
                {'requirement': 'Executive summary of progress', 'score': 90, 'addressed': True, 'feedback': 'Clear and comprehensive executive summary provided.'},
                {'requirement': 'Activities completed against work plan', 'score': 92, 'addressed': True, 'feedback': 'Activities well documented with specific achievements.'},
                {'requirement': 'Progress against indicators and targets', 'score': 95, 'addressed': True, 'feedback': 'Excellent quantitative tracking of indicators with target comparisons.'},
                {'requirement': 'Beneficiary data disaggregated by gender and age', 'score': 88, 'addressed': True, 'feedback': 'Good disaggregation by gender. Age breakdown could be more detailed.'},
                {'requirement': 'Challenges encountered and mitigation measures', 'score': 75, 'addressed': True, 'feedback': 'Challenges mentioned but mitigation measures could be more specific.'},
            ],
            'summary': 'Excellent progress report with comprehensive data and clear presentation of results.',
            'risk_flags': [],
        })
        db.session.add(report3)
        reports.append(report3)

        # Report 4: Revision requested report
        report4 = Report(
            grant_id=grants[0].id,
            application_id=apps[0].id,
            submitted_by_org_id=orgs[0].id,
            report_type='impact',
            reporting_period='Annual 2025',
            title='Annual Impact Report 2025',
            status='revision_requested',
            due_date=date(2026, 3, 1),
            submitted_at=datetime(2026, 2, 25, 16, 0, 0),
            reviewed_at=datetime(2026, 3, 5, 10, 0, 0),
            reviewer_notes='Please add disaggregated beneficiary data by age group and include environmental impact assessment section.',
            created_at=datetime(2026, 2, 20, 9, 0, 0),
        )
        report4.set_content({
            'Executive Summary': 'The Community Health Workers Scale-Up Program achieved significant results in 2025.',
            'Activities and Outputs': 'Trained and deployed 25 CHWs, reached 12,450 beneficiaries.',
            'Progress Against Indicators': 'Most targets met or exceeded. Vaccination coverage slightly below target.',
        })
        db.session.add(report4)
        reports.append(report4)

        # Report 5: Under review financial report from Ubuntu for EdTech grant
        report5 = Report(
            grant_id=grants[1].id,
            application_id=apps[2].id,
            submitted_by_org_id=orgs[2].id,
            report_type='financial',
            reporting_period='Q1 2026',
            title='Q1 2026 Financial Report - SmartLearn EdTech Deployment',
            status='under_review',
            due_date=date(2026, 4, 30),
            submitted_at=datetime(2026, 4, 20, 11, 0, 0),
            created_at=datetime(2026, 4, 18, 9, 0, 0),
        )
        report5.set_content({
            'Executive Summary': 'Q1 2026 financial summary for the SmartLearn EdTech deployment across 50 rural schools in Kenya and Uganda.',
            'Financial Summary': 'Total Q1 expenditure: $52,340 against budget of $62,500 (83.7% utilization). Major spend on tablet procurement and teacher training.',
            'Activities and Outputs': 'Procured 800 tablets, installed 20 solar charging stations, trained 45 teachers in 3 cohorts.',
        })
        db.session.add(report5)
        reports.append(report5)

        db.session.flush()
        print(f'  Created {len(reports)} reports')

        # ---- Registration Verifications -----------------------------------
        verifications = []

        # Amani - Kenya, fully verified
        v1 = RegistrationVerification(
            org_id=orgs[0].id,
            status='verified',
            registration_number='NGO/2012/3847',
            registration_authority='NGO Coordination Board',
            registration_date=date(2012, 3, 15),
            expiry_date=date(2027, 3, 15),
            country='Kenya',
            ai_confidence=92.0,
            verified_by_user_id=users[5].id,  # Sarah (donor)
            verified_at=datetime(2026, 1, 10, 14, 30),
            notes='Verified against NGO Coordination Board public registry. Registration active and in good standing.',
            registry_url='https://ngobureau.go.ke/search/',
            created_at=datetime(2026, 1, 8),
            updated_at=datetime(2026, 1, 10, 14, 30),
        )
        v1.set_ai_analysis({
            'extracted_data': {
                'organization_name': 'Amani Community Development',
                'registration_number': 'NGO/2012/3847',
                'registration_authority': 'NGO Coordination Board, Kenya',
                'registration_date': '2012-03-15',
                'expiry_date': '2027-03-15',
                'registration_type': 'NGO',
                'registered_address': 'Kilimani Road, Nairobi',
                'authorized_activities': ['Health', 'Water & Sanitation', 'Nutrition Programs'],
            },
            'validation': {
                'name_matches': True,
                'number_format_valid': True,
                'is_expired': False,
                'authority_recognized': True,
                'document_authentic_indicators': ['Official letterhead', 'Government seal', 'Registrar signature', 'Embossed stamp'],
            },
            'confidence': 92,
            'findings': [
                'Registration number NGO/2012/3847 matches Kenya NGO Board format',
                'Organization registered since March 2012, valid until March 2027',
                'Registration covers Health, WASH, and Nutrition activities',
                'Official seal and registrar signature present on certificate',
            ],
            'recommendations': [
                'Registration in good standing - no action needed',
                'Schedule re-verification before March 2027 expiry',
            ],
        })
        v1.set_registry_check_result({
            'verified': None,
            'method': 'portal_check',
            'country': 'Kenya',
            'registry': 'NGO Coordination Board / Business Registration Service (BRS)',
            'registry_url': 'https://brs.go.ke/',
            'portal_accessible': True,
            'message': 'Kenya BRS portal is accessible. Search for registration number NGO/2012/3847 to verify.',
            'guidance': 'Manual verification recommended - enter registration number at https://brs.go.ke/ to confirm status.',
            'checked_at': '2026-02-15T08:12:00',
        })
        db.session.add(v1)
        verifications.append(v1)

        # Salam Relief - Somalia, AI reviewed pending manual check
        v2 = RegistrationVerification(
            org_id=orgs[1].id,
            status='ai_reviewed',
            registration_number='SOM/NGO/2015/221',
            registration_authority='Ministry of Interior, Federal Affairs and Reconciliation',
            registration_date=date(2015, 7, 20),
            expiry_date=None,
            country='Somalia',
            ai_confidence=68.0,
            notes='AI analysis complete. Manual verification recommended due to limited online registry access.',
            registry_url='https://www.moi.gov.so/',
            created_at=datetime(2026, 1, 12),
            updated_at=datetime(2026, 1, 12),
        )
        v2.set_ai_analysis({
            'extracted_data': {
                'organization_name': 'Salam Relief Foundation',
                'registration_number': 'SOM/NGO/2015/221',
                'registration_authority': 'Ministry of Interior, Somalia',
                'registration_date': '2015-07-20',
                'expiry_date': None,
                'registration_type': 'NGO',
                'authorized_activities': ['Food Security', 'Protection', 'Shelter'],
            },
            'validation': {
                'name_matches': True,
                'number_format_valid': True,
                'is_expired': None,
                'authority_recognized': True,
                'document_authentic_indicators': ['Ministry letterhead', 'Registration stamp'],
            },
            'confidence': 68,
            'findings': [
                'Registration number matches Somalia NGO format',
                'Registered with Ministry of Interior since 2015',
                'No online registry available for cross-verification',
                'No expiry date found - may be perpetual registration',
            ],
            'recommendations': [
                'Contact Ministry of Interior directly to confirm registration status',
                'Request updated registration letter from Somali authorities',
                'Verify through UN OCHA Somalia coordination mechanism',
            ],
        })
        db.session.add(v2)
        verifications.append(v2)

        # Ubuntu - South Africa, verified
        v3 = RegistrationVerification(
            org_id=orgs[2].id,
            status='verified',
            registration_number='ZA-NPO-2008-071234',
            registration_authority='Department of Social Development NPO Directorate',
            registration_date=date(2008, 5, 10),
            expiry_date=None,
            country='South Africa',
            ai_confidence=95.0,
            verified_by_user_id=users[6].id,  # David (donor)
            verified_at=datetime(2026, 1, 5, 9, 0),
            notes='Verified online via DSD NPO Registry. Active and compliant with annual reporting.',
            registry_url='https://npo.dsd.gov.za/public/SearchOrganisationOnline.aspx',
            created_at=datetime(2026, 1, 3),
            updated_at=datetime(2026, 1, 5, 9, 0),
        )
        v3.set_ai_analysis({
            'extracted_data': {
                'organization_name': 'Ubuntu Education Trust',
                'registration_number': 'ZA-NPO-2008-071234',
                'registration_authority': 'DSD NPO Directorate, South Africa',
                'registration_date': '2008-05-10',
                'expiry_date': None,
                'registration_type': 'NPO',
                'registered_address': 'Sandton, Johannesburg',
                'authorized_activities': ['Education', 'Livelihoods', 'Youth Development'],
            },
            'validation': {
                'name_matches': True,
                'number_format_valid': True,
                'is_expired': False,
                'authority_recognized': True,
                'document_authentic_indicators': ['Official DSD letterhead', 'NPO registration certificate', 'Compliance certificate current'],
            },
            'confidence': 95,
            'findings': [
                'Registration verified via South Africa NPO online registry',
                'ZA-NPO-2008-071234 is active and in good standing',
                'Annual compliance reports filed through 2025',
                'Organization is fully compliant with NPO Act 1997',
            ],
            'recommendations': [
                'Registration confirmed - no further action needed',
                'Continue annual compliance monitoring',
            ],
        })
        v3.set_registry_check_result({
            'verified': True,
            'method': 'npo_portal_search',
            'country': 'South Africa',
            'registry': 'Department of Social Development NPO Directorate',
            'registry_url': 'https://npo.dsd.gov.za/public/SearchOrganisationOnline.aspx',
            'portal_accessible': True,
            'message': 'Organization found in DSD NPO Registry. Status: Active. Registration number ZA-NPO-2008-071234 confirmed.',
            'npo_status': 'Active',
            'compliance_status': 'Compliant',
            'checked_at': '2026-02-14T10:08:00',
        })
        db.session.add(v3)
        verifications.append(v3)

        # Hope Bridges - Uganda, pending
        v4 = RegistrationVerification(
            org_id=orgs[3].id,
            status='pending',
            registration_number='UG/CBO/2019/445',
            registration_authority='NGO Bureau, Ministry of Internal Affairs',
            registration_date=date(2019, 11, 8),
            expiry_date=date(2025, 11, 8),
            country='Uganda',
            ai_confidence=55.0,
            notes='Registration may be expired. Manual verification with Uganda NGO Bureau recommended.',
            registry_url='https://www.ngobureau.go.ug/organizations',
            created_at=datetime(2026, 1, 15),
            updated_at=datetime(2026, 1, 15),
        )
        v4.set_ai_analysis({
            'extracted_data': {
                'organization_name': 'Hope Bridges Initiative',
                'registration_number': 'UG/CBO/2019/445',
                'registration_authority': 'NGO Bureau, Uganda',
                'registration_date': '2019-11-08',
                'expiry_date': '2025-11-08',
                'registration_type': 'CBO',
                'authorized_activities': ['Health', 'Climate', 'Agriculture'],
            },
            'validation': {
                'name_matches': True,
                'number_format_valid': True,
                'is_expired': True,
                'authority_recognized': True,
                'document_authentic_indicators': ['NGO Bureau stamp', 'Registration certificate'],
            },
            'confidence': 55,
            'findings': [
                'Registration UG/CBO/2019/445 matches Uganda format',
                'WARNING: Registration expired November 2025 - renewal needed',
                'Registered as Community-Based Organization (CBO)',
                'NGO Bureau online registry available for verification',
            ],
            'recommendations': [
                'URGENT: Request proof of registration renewal from Hope Bridges',
                'Verify renewal status at ngobureau.go.ug/organizations',
                'Do not proceed with grant until registration is renewed',
            ],
        })
        db.session.add(v4)
        verifications.append(v4)

        # Sahel Women's Network - Nigeria, unverified/flagged
        v5 = RegistrationVerification(
            org_id=orgs[4].id,
            status='flagged',
            registration_number='',
            registration_authority='Corporate Affairs Commission (CAC)',
            country='Nigeria',
            ai_confidence=20.0,
            notes='No registration number provided. Organization claims pending registration.',
            created_at=datetime(2026, 1, 20),
            updated_at=datetime(2026, 1, 20),
        )
        v5.set_ai_analysis({
            'extracted_data': {
                'organization_name': "Sahel Women's Network",
                'registration_number': 'Not found',
                'registration_authority': 'CAC Nigeria (expected)',
                'registration_date': None,
                'expiry_date': None,
                'registration_type': 'Network/Association',
                'authorized_activities': ['Protection', 'Governance', 'Gender'],
            },
            'validation': {
                'name_matches': True,
                'number_format_valid': False,
                'is_expired': None,
                'authority_recognized': True,
                'document_authentic_indicators': [],
            },
            'confidence': 20,
            'findings': [
                'No registration certificate provided',
                'Organization claims registration is pending with CAC Nigeria',
                'Cannot verify registration without certificate or number',
                'Organization established in 2020 but no formal registration',
            ],
            'recommendations': [
                'Request registration certificate from Sahel Women\'s Network',
                'Verify at CAC Nigeria (search.cac.gov.ng) once number is provided',
                'Consider whether unregistered status affects grant eligibility',
                'May need to register as Incorporated Trustees with CAC',
            ],
        })
        db.session.add(v5)
        verifications.append(v5)

        db.session.flush()
        print(f'  Created {len(verifications)} registration verifications')

        # ---- Commit -------------------------------------------------------
        db.session.commit()
        print('\nDatabase seeded successfully!')
        print_summary()


def print_summary():
    """Print summary of seeded data and login credentials."""
    with app.app_context():
        print('\n' + '='*60)
        print('  KUJA GRANT MANAGEMENT - SEED DATA SUMMARY')
        print('='*60)
        print(f'  Organizations : {Organization.query.count()}')
        print(f'  Users         : {User.query.count()}')
        print(f'  Grants        : {Grant.query.count()}')
        print(f'  Applications  : {Application.query.count()}')
        print(f'  Assessments   : {Assessment.query.count()}')
        print(f'  Documents     : {Document.query.count()}')
        print(f'  Reviews       : {Review.query.count()}')
        print(f'  Compliance    : {ComplianceCheck.query.count()}')
        print(f'  Reports       : {Report.query.count()}')
        print(f'  Verifications : {RegistrationVerification.query.count()}')
        print('='*60)
        print('\n  LOGIN CREDENTIALS (all passwords: pass123)')
        print('  ' + '-'*55)
        print(f'  {"Email":<30} {"Role":<10} {"Organization"}')
        print('  ' + '-'*55)
        for u in User.query.all():
            org = Organization.query.get(u.org_id) if u.org_id else None
            org_name = org.name[:22] if org else 'N/A'
            print(f'  {u.email:<30} {u.role:<10} {org_name}')
        print('  ' + '-'*55)
        print('\n  GRANTS')
        print('  ' + '-'*55)
        for g in Grant.query.all():
            amt = g.total_funding or 0
            print(f'  {g.title[:40]:<42} ${amt:>10,.0f}  [{g.status}]')
        print('  ' + '-'*55 + '\n')


if __name__ == '__main__':
    seed()
