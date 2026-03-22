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

# Import from the modular app package
from app import create_app
from app.extensions import db
from app.models import (
    User, Organization, Grant, Application,
    Assessment, Document, Review, ComplianceCheck, Report,
    RegistrationVerification,
)

app = create_app()

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
        description='Amani Community Development is a Kenyan NGO dedicated to improving health outcomes and access to clean water in underserved communities across East Africa. With over a decade of field experience, Amani has implemented integrated health, WASH, and nutrition programs reaching more than 500,000 beneficiaries across Kenya, Somalia, and South Sudan. The organization is recognized by the Kenya NGO Coordination Board as a leader in community-based health service delivery.',
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
        description='Salam Relief Foundation provides emergency and long-term development assistance to vulnerable communities in Somalia and the Horn of Africa. Specializing in food security, protection, and shelter programming, Salam has been a key implementing partner in drought response and displacement assistance since 2015. The organization maintains strong relationships with local authorities and UN coordination bodies across Benadir and Lower Shabelle regions.',
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
        description="Ubuntu Education Trust is one of Africa's leading education-focused NGOs, operating across five countries with partnerships spanning major bilateral and multilateral donors. Since 2008, Ubuntu has pioneered innovative approaches to education technology and youth employment, reaching over 200,000 students and training more than 800 educators. The organization's flagship SmartLearn platform has been independently evaluated and recognized by the African Development Bank as a scalable model for digital education.",
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
        description='Hope Bridges Initiative is a community-based organization in Uganda focused on building climate-resilient agricultural livelihoods and improving community health outcomes in Northern Uganda. Founded in 2019, the organization works primarily in Acholi and Lango sub-regions, supporting smallholder farmers with climate-smart practices while integrating basic health service delivery. Hope Bridges is actively strengthening its institutional capacity to take on larger programming.',
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
        description="Sahel Women's Network is a coalition of 15 grassroots women-led organizations across the Sahel region, working to amplify women's voices in governance and strengthen community-based protection mechanisms. Although established in 2020, the network's founding members bring decades of collective experience in women's rights advocacy, GBV prevention, and political participation programming across Nigeria, Niger, Chad, and Mali.",
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
        description='Global Health Fund is an international grantmaking foundation headquartered in Geneva, dedicated to improving health outcomes in low and middle-income countries. The Fund supports innovative health programs, invests in local capacity building, and partners with governments and civil society organizations to strengthen health systems and deliver lasting impact across sub-Saharan Africa and South Asia.',
        mission='Funding health innovation and strengthening local health systems worldwide.',
    ),
    dict(
        name='East Africa Development Trust',
        org_type='donor', country='Kenya', city='Nairobi',
        year_established=2010, annual_budget='$10M-$50M', staff_count='51-200',
        sectors=json.dumps(['Education', 'Livelihoods', 'Climate', 'Governance']),
        registration_status='registered', registration_number='',
        verified=True, assess_score=None,
        description='East Africa Development Trust is a regional grantmaking body focused on catalyzing sustainable development across East Africa. The Trust supports local organizations working in education, livelihoods, climate resilience, and good governance, with a particular emphasis on strengthening the capacity of national and sub-national civil society actors to lead their own development agendas.',
        mission='Catalyzing sustainable development through local partnerships in East Africa.',
    ),
    dict(
        name='Independent Review Associates',
        org_type='donor', country='Kenya', city='Nairobi',
        year_established=2015, annual_budget='$500K-$1M', staff_count='11-50',
        sectors=json.dumps(['Governance', 'M&E']),
        registration_status='registered', registration_number='',
        verified=True, assess_score=None,
        description='Independent Review Associates is a specialized consultancy providing external evaluation, capacity assessment, and due diligence services for humanitarian and development programs across East Africa and the Horn of Africa.',
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
    ('admin@kuja.org',      'Idiris Loyan',    'admin',    None),
    ('peter@hopebridges.org','Peter Okello',   'ngo',      3),
    ('aisha@sahelwomen.org','Aisha Bello',     'ngo',      4),
]

# ---------------------------------------------------------------------------
# Grant data
# ---------------------------------------------------------------------------

# --- Grant 1: USAID East Africa WASH Program 2026-2028 ---
GRANT1_ELIGIBILITY = json.dumps([
    {"id":"geo","category":"Geographic","label":"Operating in target countries","params":{"countries":["Kenya","Somalia","Uganda"]},"weight":15,"required":True,"helpText":"Must have active operations in at least one target country"},
    {"id":"orgtype","category":"Organization Type","label":"Registered NGO or CBO","params":{"types":["ngo","cbo"]},"weight":10,"required":True,"helpText":"Must be a registered non-governmental or community-based organization"},
    {"id":"exp","category":"Experience","label":"Minimum 3 years WASH program experience","params":{"minYears":3,"sector":"WASH"},"weight":20,"required":True,"helpText":"Demonstrate at least 3 years of implementing WASH programs"},
    {"id":"budget","category":"Budget Range","label":"Annual budget above $200K","params":{"minBudget":200000},"weight":10,"required":False,"helpText":"Organizations with larger budgets may manage bigger sub-grants"},
    {"id":"reg","category":"Registration","label":"Valid NGO registration","params":{"current":True},"weight":10,"required":True,"helpText":"Registration must be current and verifiable"},
])

GRANT1_CRITERIA = json.dumps([
    {"id":"approach","label":"Technical Approach","desc":"Describe your proposed WASH infrastructure approach including water point design, sanitation solutions, and hygiene promotion","weight":25,"instructions":"Detail your water infrastructure design (boreholes, piped systems, rainwater harvesting), sanitation approach (latrines, waste management), and community hygiene behavior change strategy. Include technical specifications and alignment with national WASH standards.","example":"Our WASH program uses a comprehensive approach combining solar-powered borehole drilling with community-managed piped water systems...","maxWords":500},
    {"id":"experience","label":"Organizational Experience","desc":"Demonstrate your organization's WASH implementation track record","weight":20,"instructions":"Detail past WASH programs with locations, scale, infrastructure built, communities served, and sustainability outcomes. Include specific metrics on water access improvements and functionality rates.","example":"Over the past 5 years, we have constructed 28 boreholes across 3 counties...","maxWords":400},
    {"id":"coverage","label":"Coverage & Beneficiaries","desc":"Define target communities and expected reach","weight":20,"instructions":"Identify specific communities, water stress levels, current access rates, and projected beneficiary numbers. Include vulnerability assessments and disaggregated beneficiary data.","example":"We propose to cover 15 communities across Turkana and Garissa counties, reaching 42,000 beneficiaries...","maxWords":400},
    {"id":"sustainability","label":"Sustainability Plan","desc":"How will WASH infrastructure be maintained long-term?","weight":15,"instructions":"Detail your operation and maintenance approach including Water User Associations, tariff structures, spare parts supply chains, local technician training, and government integration plans.","example":"Our sustainability strategy establishes Water User Associations at each water point with elected management committees...","maxWords":400},
    {"id":"budget_nar","label":"Budget & Cost-Effectiveness","desc":"Provide a budget narrative explaining key cost categories and value for money","weight":20,"instructions":"Break down the budget into major categories: infrastructure, community mobilization, capacity building, personnel, M&E, and overhead. Justify unit costs and explain cost-effectiveness measures.","example":"Infrastructure (45%): 12 boreholes with solar pumps at $18,000 each...","maxWords":400},
])

GRANT1_DOC_REQUIREMENTS = json.dumps([
    {"type":"financialReport","required":True,"config":{"years":3,"audited":True}},
    {"type":"registrationCert","required":True,"config":{"current":True}},
    {"type":"auditReport","required":True,"config":{"type":"external","years":2}},
    {"type":"pseaPolicy","required":True,"config":{"components":["reporting","investigation","training","whistleblower"]}},
])

# --- Grant 2: Global Fund Maternal & Newborn Health Initiative ---
GRANT2_ELIGIBILITY = json.dumps([
    {"id":"geo","category":"Geographic","label":"Operating in target countries","params":{"countries":["Kenya","Somalia","Ethiopia"]},"weight":15,"required":True,"helpText":"Must have active operations in at least one target country"},
    {"id":"orgtype","category":"Organization Type","label":"Registered health-focused NGO","params":{"types":["ngo"]},"weight":10,"required":True,"helpText":"Must be a registered NGO with health sector focus"},
    {"id":"exp","category":"Experience","label":"Minimum 3 years maternal health experience","params":{"minYears":3,"sector":"Health"},"weight":25,"required":True,"helpText":"Demonstrate at least 3 years of implementing maternal and child health programs"},
    {"id":"sector","category":"Sector Focus","label":"Maternal & child health focus","params":{"sectors":["Health","Nutrition"]},"weight":15,"required":True,"helpText":"Primary sector focus must include maternal/child health or nutrition"},
    {"id":"reg","category":"Registration","label":"Valid government registration","params":{"current":True},"weight":10,"required":True,"helpText":"Registration must be current and verifiable"},
])

GRANT2_CRITERIA = json.dumps([
    {"id":"approach","label":"Maternal Health Approach","desc":"Describe your approach to improving maternal and newborn health outcomes","weight":25,"instructions":"Detail your strategy for antenatal care, skilled birth attendance, postnatal care, and community MNCH. Include facility and community-level interventions. Reference evidence-based approaches.","example":"","maxWords":500},
    {"id":"experience","label":"MNCH Experience","desc":"Demonstrate track record in maternal and child health programming","weight":20,"instructions":"Share outcomes from past MNCH programs including reduction in maternal/neonatal mortality, ANC coverage improvement, facility delivery rates, and beneficiary reach.","example":"","maxWords":400},
    {"id":"coverage","label":"Target Communities & Reach","desc":"Define geographic scope and target population","weight":20,"instructions":"Identify target communities, current MNCH indicators, estimated pregnant women and children under 5 to be reached. Include vulnerability assessments.","example":"","maxWords":400},
    {"id":"integration","label":"Health System Integration","desc":"How will interventions integrate with existing health systems?","weight":15,"instructions":"Describe coordination with Ministry of Health, county/regional health teams, referral facilities, and national health information systems.","example":"","maxWords":400},
    {"id":"budget_nar","label":"Budget & Cost-Effectiveness","desc":"Budget breakdown and justification by intervention area","weight":20,"instructions":"Detail costs by intervention area: facility strengthening, community health, training, supplies, M&E. Justify unit costs and explain value for money.","example":"","maxWords":400},
])

GRANT2_DOC_REQUIREMENTS = json.dumps([
    {"type":"financialReport","required":True,"config":{"years":3,"audited":True}},
    {"type":"registrationCert","required":True,"config":{"current":True}},
    {"type":"auditReport","required":True,"config":{"type":"external","years":2}},
    {"type":"pseaPolicy","required":True,"config":{"components":["reporting","investigation","training"]}},
    {"type":"projectReport","required":True,"config":{"count":2,"recent":True}},
    {"type":"budgetDetail","required":True,"config":{"lineItems":True,"overheadCap":15}},
])

# --- Grant 3: DFID Climate Resilience for Smallholder Farmers ---
GRANT3_ELIGIBILITY = json.dumps([
    {"id":"geo","category":"Geographic","label":"Operating in target countries","params":{"countries":["Kenya","Uganda","Tanzania"]},"weight":15,"required":True,"helpText":"Must have active operations in at least one target country"},
    {"id":"exp","category":"Experience","label":"2+ years climate or agriculture experience","params":{"minYears":2,"sector":"Climate"},"weight":20,"required":True,"helpText":"Must have climate or agriculture program experience"},
    {"id":"orgtype","category":"Organization Type","label":"Registered NGO or CBO","params":{"types":["ngo","cbo"]},"weight":10,"required":True,"helpText":"Must be a registered organization"},
    {"id":"sector","category":"Sector Focus","label":"Climate, agriculture, or livelihoods focus","params":{"sectors":["Climate","Agriculture","Livelihoods"]},"weight":15,"required":True,"helpText":"Must work in relevant sectors"},
])

GRANT3_CRITERIA = json.dumps([
    {"id":"approach","label":"Climate Resilience Approach","desc":"Describe your proposed climate resilience strategy for smallholder farmers","weight":30,"instructions":"Detail your approach to building community climate resilience, including climate-smart agriculture techniques, early warning systems, crop diversification, water harvesting, and soil conservation. Include gender-responsive programming.","example":"","maxWords":500},
    {"id":"experience","label":"Relevant Experience","desc":"Past climate adaptation or agriculture programs and outcomes","weight":25,"instructions":"Share measurable outcomes from previous climate or agriculture programs including yield improvements, income diversification, and community resilience indicators.","example":"","maxWords":400},
    {"id":"innovation","label":"Innovation & Scalability","desc":"What innovative approaches will you use and how can they scale?","weight":20,"instructions":"Describe innovative elements such as digital extension services, climate information systems, market linkages, or agroforestry models and their potential for replication across the region.","example":"","maxWords":400},
    {"id":"sustainability","label":"Long-term Resilience Plan","desc":"How will communities sustain resilience after the project ends?","weight":25,"instructions":"Explain your exit strategy, farmer organization strengthening, government extension service integration, and community-led adaptation mechanisms.","example":"","maxWords":400},
])

GRANT3_DOC_REQUIREMENTS = json.dumps([
    {"type":"financialReport","required":True,"config":{"years":2}},
    {"type":"registrationCert","required":True,"config":{"current":True}},
    {"type":"projectReport","required":False,"config":{"count":1}},
])

# --- Grant 4: EU Gender-Based Violence Prevention Program ---
GRANT4_ELIGIBILITY = json.dumps([
    {"id":"geo","category":"Geographic","label":"Operating in target countries","params":{"countries":["Somalia","Nigeria"]},"weight":15,"required":True,"helpText":"Must operate in at least one target country"},
    {"id":"orgtype","category":"Organization Type","label":"Women-led or women-focused organization","params":{"types":["ngo","cbo","network"]},"weight":15,"required":True,"helpText":"Priority given to women-led organizations"},
    {"id":"sector","category":"Sector Focus","label":"Protection or gender equality focus","params":{"sectors":["Protection","Gender Equality"]},"weight":15,"required":True,"helpText":"Must work in protection or gender equality sectors"},
    {"id":"exp","category":"Experience","label":"Experience in GBV prevention or women's empowerment","params":{"minYears":1,"sector":"Protection"},"weight":20,"required":True,"helpText":"Must have relevant sector experience"},
])

GRANT4_CRITERIA = json.dumps([
    {"id":"approach","label":"GBV Prevention Approach","desc":"Describe your approach to gender-based violence prevention and response","weight":30,"instructions":"Detail your GBV prevention methodology including community-based protection mechanisms, survivor support services, referral pathways, and male engagement strategies. Address cultural context and sensitivity.","example":"","maxWords":500},
    {"id":"experience","label":"Track Record","desc":"Experience with protection or gender equality programs","weight":25,"instructions":"Share measurable outcomes from previous GBV prevention, women's protection, or gender equality programs. Include reach, survivor support data, and community engagement results.","example":"","maxWords":400},
    {"id":"governance","label":"Women in Governance","desc":"How will you promote women's participation in governance and decision-making?","weight":25,"instructions":"Describe strategies for increasing women's political participation, leadership development, and voice in community governance structures.","example":"","maxWords":400},
    {"id":"sustainability","label":"Sustainability & Community Ownership","desc":"Long-term protection and empowerment plan","weight":20,"instructions":"How will protection gains and women's empowerment be sustained beyond the project? Include community ownership mechanisms and institutional strengthening approaches.","example":"","maxWords":300},
])

GRANT4_DOC_REQUIREMENTS = json.dumps([
    {"type":"financialReport","required":True,"config":{"years":1}},
    {"type":"registrationCert","required":False,"config":{"current":True}},
    {"type":"pseaPolicy","required":True,"config":{"components":["reporting","investigation","training"]}},
])

# --- Grant 5: World Bank Youth Employment & Digital Skills (closed) ---
GRANT5_ELIGIBILITY = json.dumps([
    {"id":"geo","category":"Geographic","label":"Operating in target countries","params":{"countries":["Kenya","South Africa","Nigeria"]},"weight":15,"required":True,"helpText":"Must have active operations in at least one target country"},
    {"id":"orgtype","category":"Organization Type","label":"Registered NGO with youth programming experience","params":{"types":["ngo","cbo","network"]},"weight":10,"required":True,"helpText":"Must be a registered organization"},
    {"id":"exp","category":"Experience","label":"2+ years youth employment or livelihoods programs","params":{"minYears":2,"sector":"Livelihoods"},"weight":20,"required":True,"helpText":"Must have youth employment or livelihoods program experience"},
    {"id":"sector","category":"Sector Focus","label":"Education, livelihoods, or youth development focus","params":{"sectors":["Education","Livelihoods","Youth"]},"weight":15,"required":True,"helpText":"Must work in relevant sectors"},
    {"id":"reg","category":"Registration","label":"Valid government registration","params":{"current":True},"weight":10,"required":True,"helpText":"Registration must be current and verifiable"},
])

GRANT5_CRITERIA = json.dumps([
    {"id":"approach","label":"Skills Training Model","desc":"Describe your approach to youth digital skills development and employment pathways","weight":25,"instructions":"Detail your training curriculum, target digital skills or trades, employer partnerships, mentorship approach, and how you connect graduates to employment. Include digital literacy and 21st century skills components.","example":"","maxWords":500},
    {"id":"experience","label":"Track Record","desc":"Past youth program results and employment outcomes","weight":20,"instructions":"Share measurable employment outcomes, retention rates, income improvements, and employer satisfaction from past youth programs. Include disaggregated data.","example":"","maxWords":400},
    {"id":"innovation","label":"Innovation & Digital Inclusion","desc":"How will you leverage technology and ensure inclusive access?","weight":20,"instructions":"Describe digital platforms, private sector partnerships, or innovative delivery methods. Address the digital gender divide, rural access challenges, and accessibility for marginalized youth.","example":"","maxWords":400},
    {"id":"coverage","label":"Target Youth & Geographic Reach","desc":"Define target youth population and geographic coverage","weight":15,"instructions":"Identify target demographics, geographic areas, estimated youth to be trained, and how you will reach the most marginalized. Include youth labor market analysis.","example":"","maxWords":300},
    {"id":"sustainability","label":"Sustainability & Revenue Model","desc":"Long-term plan for program continuation","weight":20,"instructions":"How will the program sustain financially? Include employer co-funding models, government partnership plans, alumni contributions, or other revenue streams beyond grant funding.","example":"","maxWords":400},
])

GRANT5_DOC_REQUIREMENTS = json.dumps([
    {"type":"financialReport","required":True,"config":{"years":2}},
    {"type":"registrationCert","required":True,"config":{"current":True}},
    {"type":"projectReport","required":True,"config":{"count":1}},
    {"type":"budgetDetail","required":True,"config":{"lineItems":True,"overheadCap":15}},
])


# ---------------------------------------------------------------------------
# Application response texts
# ---------------------------------------------------------------------------

# --- Amani -> Grant 1 (WASH) ---
AMANI_WASH_RESPONSES = json.dumps({
    "approach": "Amani proposes a comprehensive WASH infrastructure program across 15 communities in Turkana and Garissa counties. Our approach combines solar-powered borehole drilling with community-managed piped water systems and institutional WASH for schools and health facilities. We will construct 12 new boreholes with solar pump systems, 8 community water kiosks, and 45 institutional latrines. Our hygiene promotion model uses community health promoters trained in PHAST (Participatory Hygiene and Sanitation Transformation) methodology. Technical design follows Kenya WASH standards and includes geo-hydrological surveys for each site. Water quality monitoring will be conducted quarterly using portable field kits and annual laboratory analysis. We integrate WASH with our existing health programming, creating a comprehensive community health and sanitation approach. Our borehole designs use stainless steel rising mains rated for 20+ year lifespan with solar panels warranted for 25 years.",
    "experience": "Amani has implemented WASH programs in arid and semi-arid regions of Kenya since 2014. Our portfolio includes 28 boreholes drilled, 15 piped water systems rehabilitated, and 120 institutional latrines constructed across Turkana, Garissa, and Marsabit counties. Our Turkana WASH project (2018-2022, UNICEF-funded, $420,000) improved water access for 35,000 people, reducing average water collection time from 4.2 hours to 25 minutes. We achieved 92% functionality rate for water points after 3 years, compared to the sector average of 65%. Our CLTS program in Garissa triggered 45 communities to achieve Open Defecation Free status. We maintain a roster of certified hydrogeologists and WASH engineers. Our operations and maintenance model has been cited as a best practice by the Kenya WASH Alliance.",
    "coverage": "We propose to cover 15 communities across Turkana Central (8 communities) and Garissa Township sub-county (7 communities). Target population: 42,000 beneficiaries including 12,600 children under 15. Current baseline: average water access is 8 liters per person per day (WHO minimum is 20L). Only 35% of households have access to improved sanitation. Each borehole will serve 2,000-4,000 people. School WASH facilities will benefit 4,500 students in 9 primary schools. Three health facilities will receive institutional WASH improvements.",
    "sustainability": "Our O&M model establishes Water User Associations (WUAs) at each water point with elected management committees. WUAs collect water fees (KES 2-5 per 20L jerrycan) deposited in dedicated bank accounts for maintenance. We train 2 community mechanics per water point in pump maintenance and minor repairs. Spare parts supply chains are established through county-level stockists with service agreements. Solar panels require minimal maintenance. County government co-investment secured through the Kenya Water Services Regulatory Board county allocation. Our sustainability record: 92% of water points installed since 2018 remain functional with community-managed O&M.",
    "budget_nar": "Infrastructure (45% - $1,125,000): 12 boreholes with solar pumps at $55,000 each ($660,000), 8 water kiosks at $25,000 each ($200,000), 45 institutional latrines at $4,000 each ($180,000), water quality equipment ($85,000). Community Mobilization (15% - $375,000): PHAST training for 45 promoters, WUA formation and training, CLTS triggering in 15 communities. Capacity Building (10% - $250,000): Mechanic training, WUA financial management, county government coordination. Personnel (15% - $375,000): WASH Engineer, 3 Field Officers, M&E Coordinator, Finance Officer. M&E (7% - $175,000): Baseline and endline surveys, water quality monitoring, quarterly reviews. Management & Overhead (8% - $200,000): Office costs, vehicles, insurance, audit."
})

# --- Salam -> Grant 1 (WASH) ---
SALAM_WASH_RESPONSES = json.dumps({
    "approach": "Salam Relief proposes improving water access in IDP settlements and peri-urban communities across Benadir and Lower Shabelle regions. Our approach transitions communities from emergency water trucking to permanent solar-powered borehole systems. We will install 6 solar-powered boreholes, rehabilitate 4 existing water distribution points, and construct 30 community latrines. Hygiene promotion will be delivered through trained community health volunteers embedded in IDP camp management structures. We employ a context-sensitive approach that accounts for the unique challenges of WASH programming in displacement settings, including population mobility and shared infrastructure management.",
    "experience": "Salam Relief has managed emergency and transitional WASH responses in Mogadishu IDP camps since 2016. Our WASH portfolio includes emergency water trucking during the 2022 drought serving 28,000 people, rehabilitation of 6 water distribution points, and construction of 50 emergency latrines across 8 IDP settlements. Our 2023 cholera response included point-of-use water treatment distribution reaching 15,000 households. While our WASH experience has been primarily emergency-focused, we have increasingly shifted to durable infrastructure solutions. Our partnership with UNICEF Somalia WASH cluster provides technical oversight for infrastructure design. We have a dedicated WASH officer with 6 years of field experience in Somalia.",
    "coverage": "We will focus on Benadir Region (Mogadishu) and Lower Shabelle, covering 10 IDP settlements and 5 host community neighborhoods. Estimated reach is 45,000 beneficiaries across 9,000 households. Priority sites have less than 10 liters per person per day water access. Sanitation coverage in target IDP settlements is below 25%. Our existing presence gives us established relationships with camp leaders, local authorities, and the WASH cluster coordination mechanism.",
    "sustainability": "Our sustainability approach includes establishing Camp WASH Committees at each water point, training community caretakers in basic pump maintenance, and negotiating water fee structures with camp management. We are working with the Benadir Regional Administration to register our water points within the regional WASH asset register. Partnership with UNICEF provides technical backstopping for infrastructure maintenance. We are exploring solar-powered water ATM technology for cost recovery in peri-urban settings.",
    "budget_nar": "Infrastructure (50% - $1,250,000): 6 solar-powered boreholes at $65,000 each ($390,000), 4 water point rehabilitations at $35,000 each ($140,000), 30 community latrines at $5,000 each ($150,000), distribution networks and storage tanks ($370,000), solar water ATM pilot ($200,000). Personnel (20% - $500,000): WASH Program Manager, 2 Field Engineers, Hygiene Promotion Officer, 10 community facilitators. Training & Community Engagement (12% - $300,000): WASH committee training, hygiene promotion campaigns, caretaker training. M&E (8% - $200,000): Baseline survey, water quality monitoring, post-construction monitoring. Management (10% - $250,000): Office costs, vehicles, security, communications, audit."
})

# --- Ubuntu -> Grant 2 (Maternal Health) ---
UBUNTU_MATERNAL_RESPONSES = json.dumps({
    "approach": "Ubuntu Education Trust proposes leveraging our proven digital health technology platform to strengthen maternal and newborn health services in 25 communities across Western Kenya. Our SmartMama mobile application equips community health workers with AI-powered triage protocols for identifying high-risk pregnancies, tracking antenatal care visits, and coordinating emergency referrals. The platform integrates with county health information systems for real-time maternal health surveillance. Community health workers receive rugged tablets with the SmartMama app, solar chargers, and basic maternal health kits. Our approach addresses both supply-side barriers (facility readiness, skilled birth attendance) and demand-side barriers (awareness, transportation, cultural practices) through an integrated community-facility model.",
    "experience": "While Ubuntu is primarily known for education, we have been developing health technology applications since 2022. Our SmartHealth platform was piloted in 5 communities in Kisumu County (2023-2025) with 15 community health workers, tracking 1,200 pregnancies with 92% referral completion rate and 40% more household visits than paper-based workers. Building on this, we developed SmartMama specifically for MNCH, incorporating lessons from our Kisumu pilot. Our education technology expertise gives us unique strengths in designing user-friendly digital tools and training community-level workers in technology adoption. We partnered with Moi University School of Public Health for clinical protocol validation.",
    "coverage": "Target: 25 communities across Busia and Kakamega counties in Western Kenya. Estimated reach: 4,500 pregnant women annually, 6,000 children under 2, and 18,000 women of reproductive age. These counties have maternal mortality ratios of 488 and 432 per 100,000 respectively, significantly above the national average of 342. Only 45% of births are facility-based (national target: 70%). ANC4+ coverage is 38%, below the national average of 57%. We will prioritize the most underserved sub-counties based on county health department data.",
    "integration": "Our program integrates directly with county health systems through formal MoUs with Busia and Kakamega County Departments of Health. SmartMama data feeds into the national DHIS2 health information system. CHWs operate within the Kenya Community Health Strategy framework and are supervised by county community health extension workers. We participate in county and sub-county health management team meetings. Referral pathways connect to 5 sub-county hospitals and 15 primary health centres.",
    "budget_nar": "Technology (18% - $324,000): 50 tablets with SmartMama app ($50,000), app development and hosting ($150,000), cloud infrastructure and DHIS2 integration ($74,000), data analytics dashboard ($50,000). Personnel (35% - $630,000): Digital Health Manager, 2 Clinical Officers, 3 Field Supervisors, IT Support, 50 CHW monthly stipends. Facility Strengthening (15% - $270,000): Essential equipment for 5 maternity units, supplies, minor renovations. Training (12% - $216,000): CHW intensive training program, SBA refresher training, quarterly refreshers. M&E (10% - $180,000): Baseline survey, impact evaluation design, data analysis, endline. Management (10% - $180,000): Office, vehicles, communications, insurance, audit."
})

# --- Hope Bridges -> Grant 2 (Maternal Health) - draft ---
HOPE_MATERNAL_DRAFT_RESPONSES = json.dumps({
    "approach": "Hope Bridges Initiative proposes integrating maternal and child health services into our existing community health programming in Northern Uganda. We plan to train 20 community health workers in Gulu and Lira districts to provide basic antenatal care counseling, nutrition screening for pregnant women, and referral support for facility-based deliveries. Our approach builds on our established relationships with rural farming communities where maternal health indicators remain critically low.",
    "experience": "Hope Bridges has been operating in Northern Uganda since 2019. While our primary focus has been climate-resilient agriculture, we began integrating health components in 2024 with a small community health volunteer program reaching 2,000 farming households. Our community volunteers identified 85 high-risk pregnancies and facilitated 40 referrals to health facilities during a 6-month pilot period."
})

# --- Amani -> Grant 5 (Youth Employment - awarded) ---
AMANI_YOUTH_RESPONSES = json.dumps({
    "approach": "Amani Community Development proposes a community-based youth digital skills and employment program targeting 500 young people aged 18-30 across Nairobi's informal settlements. Our DigiJamii model combines digital literacy training with sector-specific vocational skills in three high-demand areas: mobile technology services (phone repair, app deployment), digital financial services (mobile money agents, digital bookkeeping), and e-commerce and digital marketing. Training is delivered through 4 community digital hubs established in partnership with county government youth centers. Each cohort of 25 youth receives 4 months of intensive hands-on training followed by 2 months of supervised apprenticeship with local businesses. Our model is uniquely adapted to low-income urban settings where traditional ICT training centers are inaccessible.",
    "experience": "Amani has been implementing youth-focused programming since 2018 through our community health worker pipeline, which has provided employment pathways for 120 young people. Our 2023-2025 Digital Health Workers pilot in Nairobi trained 35 youth in mobile health technology, with 28 (80%) gaining employment within 3 months. Building on this, we launched DigiJamii as a dedicated youth employment initiative in 2024 with a small pilot of 50 youth, achieving 68% employment or self-employment placement. Partners include Safaricom Foundation, Ajira Digital program, and the Nairobi County Youth Affairs office. Our community-based delivery model keeps per-trainee costs below $800, significantly lower than traditional ICT training centers.",
    "innovation": "Our innovation centers on three elements: (1) Community digital hubs that bring training to youth in their own neighborhoods, eliminating transport barriers that prevent low-income youth from accessing training centers; (2) A WhatsApp-based peer learning network that provides ongoing support and job referrals after graduation, with 85% engagement rate in our pilot; (3) Partnership with M-Pesa agent network to provide immediate self-employment opportunities for graduates in digital financial services. We are also piloting a digital portfolio system where graduates can showcase their work to potential employers via QR-linked profiles.",
    "coverage": "Target: 500 youth across 4 informal settlements in Nairobi (Kibera, Mathare, Korogocho, Mukuru). Demographics: 60% female, 40% male. Age range: 18-30 years. All targets are youth who are currently out of school and unemployed or underemployed. Nairobi County youth unemployment rate is estimated at 35%, with rates exceeding 50% in informal settlements. Our community-based approach ensures we reach the most marginalized youth who cannot access city-center training programs.",
    "sustainability": "Financial sustainability through three streams: (1) Nairobi County co-funding commitment of KES 5 million annually for digital hub operations; (2) Fee-for-service model where local businesses pay reduced rates for hiring our graduates ($50 placement fee); (3) Digital hub revenue from community internet access services and phone repair during non-training hours. Our pilot hub in Kibera generates $200 monthly from community services, covering 30% of operating costs. We are in discussions with the National Industrial Training Authority for accreditation of our curriculum, which would unlock NITA levy rebates for employer partners."
})

# --- Hope Bridges -> Grant 5 (Youth Employment - rejected) ---
HOPE_YOUTH_RESPONSES = json.dumps({
    "approach": "Hope Bridges Initiative proposes a rural youth agricultural entrepreneurship program in Northern Uganda, combining climate-smart farming skills with basic digital literacy for young farmers aged 18-28. Our AgriYouth model trains youth in modern farming techniques, post-harvest handling, value addition, and digital market access through mobile phone-based platforms. Training is delivered through 2 agricultural demonstration farms in Gulu and Lira districts. Each cohort of 15 youth receives 3 months of practical farm training followed by 3 months of mentored independent farming on leased plots. We integrate digital skills by teaching youth to use mobile money, agricultural market apps, and basic digital record-keeping for their farm businesses.",
    "experience": "Hope Bridges has been supporting young farmers in Northern Uganda since 2019. Our climate-smart agriculture program has reached 2,000 smallholder farmers, including 600 youth. Our 2024 youth farming pilot trained 30 young people in improved farming techniques, with 22 reporting increased crop yields of 25-40% in the first growing season. However, we have limited formal evaluation data and our employment tracking systems are still being developed. Our team includes an agricultural extension officer and 3 community facilitators with experience in youth engagement.",
    "innovation": "We propose using community radio to reach youth farmers with weekly agricultural advisory programs and market price information. Our partnership with a local mobile network operator allows us to send SMS-based farming tips to registered youth farmers. We are exploring a farmer-to-farmer learning model where successful graduates mentor new cohorts, reducing training costs over time.",
    "coverage": "Target: 90 youth across 6 sub-counties in Gulu and Lira districts. Demographics: 50% female, 50% male. All targets are rural youth with access to farmland. Northern Uganda's youth unemployment rate exceeds 60%, with most economic activity in subsistence agriculture. Our agricultural approach aligns with the primary livelihood opportunities available in the target area.",
    "sustainability": "Sustainability through farmer cooperative formation — graduates join cooperatives that provide ongoing market access, input sourcing, and mutual support. Agricultural demonstration farms will continue as training sites supported by sale of farm produce. We plan to seek county government integration of our training curriculum into local agricultural extension services."
})

# --- Ubuntu -> Grant 5 (Youth Employment - scored) ---
UBUNTU_YOUTH_RESPONSES = json.dumps({
    "approach": "Ubuntu Education Trust proposes a comprehensive youth skills-to-employment program that combines our proven digital learning platform with vocational skills training and private sector employer partnerships. Our SmartSkills model delivers market-relevant training in 4 high-demand sectors: digital technology (web development, data entry, digital marketing), hospitality and tourism, renewable energy installation, and agri-business value chains. Training is delivered through a blended model: 60% hands-on practical learning at partner training centers, 30% self-paced digital coursework on our SmartLearn platform, and 10% workplace internship. Each cohort of 25 youth receives 6 months of intensive training followed by 3 months of supported job placement. Our digital platform tracks skills acquisition, assessment scores, and employment outcomes in real-time.",
    "experience": "Ubuntu has been implementing youth development programs since 2010, with a specific focus on skills-to-employment since 2018. Our South Africa skills program (2018-2024) trained 1,200 youth with a 72% employment placement rate within 6 months of graduation. Average income increase was 340% compared to pre-training baseline. In Kenya, our 2023-2025 pilot trained 200 youth in digital skills with 65% securing employment or starting micro-enterprises. We partner with 45 employers across East and Southern Africa including Safaricom, Java House, M-KOPA Solar, and Twiga Foods. Our alumni network of 1,400 graduates provides mentorship and job referral support.",
    "innovation": "Our innovation centers on three elements: (1) AI-powered skills assessment that matches youth to optimal training tracks based on aptitude, local market demand, and career aspirations; (2) a digital portfolio and certification system that employers can verify instantly via QR code; (3) a post-graduation micro-loan facility in partnership with Equity Bank that helps graduates invest in tools and equipment for self-employment. We are piloting virtual reality training modules for hospitality and technical skills. Our platform has been recognized by the African Development Bank as a scalable youth employment solution.",
    "coverage": "Target: 400 youth across Nairobi and Mombasa (Kenya), Cape Town and Johannesburg (South Africa), and Lagos (Nigeria). Demographics: 55% female, 45% male. Age range: 18-30 years. Priority given to youth from underserved communities, out-of-school youth, and young women. Our multi-country approach leverages existing training center partnerships and employer networks in each location. Local labor market assessments inform training track selection per city.",
    "sustainability": "Revenue sustainability through three streams: (1) employer co-funding — employers pay $200 per trained graduate hired, covering 40% of training costs; (2) government partnership — we are in discussions with Kenya's National Industrial Training Authority (NITA) for inclusion in the national skills development framework, which provides per-capita training subsidies; (3) alumni contributions — employed graduates contribute 2% of first-year salary to a training fund. Our South Africa program has been 60% self-sustaining since 2022."
})

# --- Sahel Women -> Grant 4 (GBV Prevention) ---
SAHEL_GBV_RESPONSES = json.dumps({
    "approach": "Sahel Women's Network proposes a community-based GBV prevention and response program that leverages our network of 15 grassroots women's organizations across Somalia and Nigeria. We will train 60 community protection monitors who identify and respond to GBV cases using survivor-centered approaches, establish 8 women's safe spaces providing psychosocial support and referral services, and create community engagement platforms for male allies and traditional leaders. Our approach centers women's voices in designing protection mechanisms, drawing on culturally grounded conflict resolution practices adapted with human rights principles. We integrate GBV prevention with women's economic empowerment, recognizing that financial dependence is a key driver of vulnerability.",
    "experience": "Though established in 2020, our founding members bring decades of collective experience in women's rights across the Sahel. Our network coordinated a multi-country GBV awareness campaign in 2024 reaching 15,000 women through community dialogues. We facilitated the participation of 45 women in local government consultations in Nigeria and supported 120 GBV survivors with referral services through our member organizations. In Somalia, our Mogadishu-based member organization has been providing GBV case management in 3 IDP camps since 2021. However, as a network rather than direct implementer, our formal programmatic track record is still developing.",
    "governance": "Our governance participation strategy has three components: training 30 women candidates for local elections in the 2027 cycle, establishing women's advocacy committees in 20 communities across Somalia and Nigeria, and creating a regional policy brief series on women's political participation and GBV legislation. We aim to increase women's representation in target community governance structures by 25% over the project period. Our approach includes mentorship pairing between experienced women leaders and emerging community advocates.",
    "sustainability": "We will build the capacity of our 15 member organizations to independently deliver protection services and governance training. A small grants mechanism of $5,000-$10,000 per member organization will enable groups to continue GBV prevention activities after the project. We are building institutional relationships with UN Women, the African Union Gender Directorate, and national gender ministries for longer-term programmatic and financial support. Community protection committees will be linked to formal government protection referral pathways."
})

# --- Amani -> Grant 2 (Maternal Health) ---
AMANI_MATERNAL_RESPONSES = json.dumps({
    "approach": "Amani proposes an integrated maternal and child health program across 6 sub-counties in Turkana and Garissa, building on our established CHW network. Our approach addresses the full continuum of care: community-level demand creation through CHW home visits for pregnant women, facility-level quality improvement through essential equipment and supply procurement, skilled birth attendant refresher training, and postnatal follow-up protocols. We will establish 8 maternity waiting homes near health facilities for women in remote areas. Our CHWs will use a custom mobile app for real-time pregnancy registration, antenatal care tracking, and emergency referral coordination. We integrate nutrition counseling, PMTCT, and family planning within our MNCH service package. Our evidence-based approach draws from successful maternal health models in similar ASAL (Arid and Semi-Arid Lands) contexts.",
    "experience": "Amani has implemented maternal health programs since 2014, achieving remarkable outcomes in some of Kenya's most challenging environments. Our USAID-funded maternal health project in Garissa (2019-2023, $380,000) trained 80 CHWs in maternal health, increasing ANC4+ attendance by 41%, facility-based deliveries by 34%, and postnatal care coverage by 52%. Our Turkana MNCH initiative (2021-2025) reduced neonatal mortality from 28 to 18 per 1,000 live births across target communities. We have trained 45 skilled birth attendants through our partnership with county health departments. Our maternal health data system tracks 2,800 pregnancies annually with 98% follow-up completion.",
    "coverage": "Target: 6 sub-counties across Turkana (3) and Garissa (3) counties. Estimated reach: 8,500 pregnant women annually, 12,000 children under 2, and 35,000 women of reproductive age. These counties have maternal mortality ratios of 488 and 512 per 100,000 respectively (national average: 342). Only 32% of births in target areas are facility-based. ANC4+ coverage is 28% compared to national average of 57%.",
    "integration": "Our program integrates directly with Kenya's county health system through formal MoUs with Turkana and Garissa County Departments of Health. CHWs operate within the national Community Health Strategy framework. We participate in county and sub-county health management team meetings. Our data feeds into the DHIS2 national health information system. Referral pathways connect to 6 sub-county hospitals and 24 health centres. We coordinate with UNICEF, WHO, and other health partners through the county health partner coordination forum.",
    "budget_nar": "Personnel (35% - $630,000): MNCH Coordinator, 2 Clinical Officers, 4 Field Supervisors, 60 CHW stipends. Facility Strengthening (20% - $360,000): Essential equipment for 6 maternity units, 8 maternity waiting homes construction, supplies. Training (15% - $270,000): SBA refresher training, CHW MNCH modules, PMTCT counseling. Community Health (12% - $216,000): Mobile health app deployment, referral transport fund, community mobilization. M&E (8% - $144,000): Baseline/endline surveys, quarterly data reviews, external evaluation. Management (10% - $180,000): Office, vehicles, insurance, reporting, audit."
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

def seed(force=False):
    with app.app_context():
        db.create_all()

        force = force or '--force' in sys.argv
        if User.query.first():
            print('Database already seeded. Use --force to re-seed.')
            if not force:
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

        # Grant 1: USAID East Africa WASH Program 2026-2028
        g1 = Grant(
            title='USAID East Africa WASH Program 2026-2028',
            description='A major water, sanitation and hygiene infrastructure program targeting underserved rural and peri-urban communities across East Africa. This grant seeks experienced WASH implementers with proven infrastructure delivery track records to construct boreholes, piped water systems, and institutional sanitation facilities while building community capacity for long-term operation and maintenance. Funded through the USAID Global Water Strategy, the program aims to improve sustainable water access for 200,000 people across Kenya, Somalia, and Uganda.',
            donor_org_id=orgs[5].id,  # Global Health Fund
            total_funding=2500000, currency='USD',
            deadline=date(2026, 6, 22), status='open',
            sectors=json.dumps(['Health', 'WASH']),
            countries=json.dumps(['Kenya', 'Somalia', 'Uganda']),
            eligibility=GRANT1_ELIGIBILITY,
            criteria=GRANT1_CRITERIA,
            doc_requirements=GRANT1_DOC_REQUIREMENTS,
            created_at=dt(2026, 1, 15, 9, 0),
        )
        db.session.add(g1); grants.append(g1)

        # Grant 2: Global Fund Maternal & Newborn Health Initiative
        g2 = Grant(
            title='Global Fund Maternal & Newborn Health Initiative',
            description='Strengthening maternal and newborn health services across the Horn of Africa through community health worker deployment, facility upgrades, digital health tools, and referral system strengthening. This initiative targets counties and regions with the highest maternal mortality ratios, supporting innovative approaches that integrate community and facility-level interventions across the continuum of care from antenatal through postnatal periods.',
            donor_org_id=orgs[5].id,  # Global Health Fund
            total_funding=1800000, currency='USD',
            deadline=date(2026, 5, 22), status='open',
            sectors=json.dumps(['Health', 'Nutrition']),
            countries=json.dumps(['Kenya', 'Somalia', 'Ethiopia']),
            eligibility=GRANT2_ELIGIBILITY,
            criteria=GRANT2_CRITERIA,
            doc_requirements=GRANT2_DOC_REQUIREMENTS,
            created_at=dt(2026, 1, 20, 10, 30),
        )
        db.session.add(g2); grants.append(g2)

        # Grant 3: DFID Climate Resilience for Smallholder Farmers
        g3 = Grant(
            title='DFID Climate Resilience for Smallholder Farmers',
            description='Supporting smallholder farming communities in East Africa to build long-term resilience to climate change through climate-smart agricultural practices, livelihood diversification, early warning systems, and market linkage strengthening. The program prioritizes women-headed households and youth farmers, with a focus on sustainable land management and agroforestry approaches proven effective in semi-arid and sub-humid agro-ecological zones.',
            donor_org_id=orgs[6].id,  # EA Development Trust
            total_funding=950000, currency='USD',
            deadline=date(2026, 7, 15), status='open',
            sectors=json.dumps(['Climate', 'Agriculture', 'Livelihoods']),
            countries=json.dumps(['Kenya', 'Uganda', 'Tanzania']),
            eligibility=GRANT3_ELIGIBILITY,
            criteria=GRANT3_CRITERIA,
            doc_requirements=GRANT3_DOC_REQUIREMENTS,
            created_at=dt(2026, 2, 1, 14, 0),
        )
        db.session.add(g3); grants.append(g3)

        # Grant 4: EU Gender-Based Violence Prevention Program
        g4 = Grant(
            title='EU Gender-Based Violence Prevention Program',
            description="Supporting women-led organizations in Somalia and Nigeria to strengthen community-based GBV prevention and response mechanisms, promote women's participation in governance, and build sustainable protection systems. This program prioritizes organizations with deep community trust and culturally grounded approaches to addressing gender-based violence in conflict-affected and displacement contexts.",
            donor_org_id=orgs[6].id,  # EA Development Trust
            total_funding=680000, currency='USD',
            deadline=date(2026, 6, 30), status='open',
            sectors=json.dumps(['Protection', 'Gender Equality']),
            countries=json.dumps(['Somalia', 'Nigeria']),
            eligibility=GRANT4_ELIGIBILITY,
            criteria=GRANT4_CRITERIA,
            doc_requirements=GRANT4_DOC_REQUIREMENTS,
            created_at=dt(2026, 1, 25, 11, 0),
        )
        db.session.add(g4); grants.append(g4)

        # Grant 5: World Bank Youth Employment & Digital Skills (closed - awarded)
        g5 = Grant(
            title='World Bank Youth Employment & Digital Skills',
            description='Supporting innovative youth employment programs that combine digital skills training, vocational development, and private sector partnerships to create sustainable employment pathways for young people in Africa. This program targets youth in urban and peri-urban areas with high unemployment rates, with priority given to programs reaching young women and marginalized communities. Applications are now closed and awards have been made.',
            donor_org_id=orgs[5].id,  # Global Health Fund
            total_funding=1200000, currency='USD',
            deadline=date(2025, 10, 31), status='closed',
            sectors=json.dumps(['Education', 'Livelihoods']),
            countries=json.dumps(['Kenya', 'South Africa', 'Nigeria']),
            eligibility=GRANT5_ELIGIBILITY,
            criteria=GRANT5_CRITERIA,
            doc_requirements=GRANT5_DOC_REQUIREMENTS,
            published_at=dt(2025, 7, 1, 9, 0),
            created_at=dt(2025, 6, 15, 9, 0),
        )
        db.session.add(g5); grants.append(g5)

        db.session.flush()
        print(f'  Created {len(grants)} grants')

        # ---- Grant Reporting Configuration --------------------------------

        # Grant 1: USAID WASH - quarterly financial, semi-annual narrative, annual impact
        grants[0].set_reporting_requirements([
            {'type': 'financial', 'title': 'Quarterly Financial Report', 'description': 'Detailed expenditure statement with budget variance analysis and procurement documentation', 'frequency': 'quarterly', 'due_days_after_period': 30},
            {'type': 'narrative', 'title': 'Semi-Annual Progress Report', 'description': 'Activities completed, progress against indicators, infrastructure completion status, challenges and lessons learned', 'frequency': 'semi-annual', 'due_days_after_period': 45},
            {'type': 'impact', 'title': 'Annual Impact Report', 'description': 'Water access improvements, health impact data, sustainability metrics, beneficiary satisfaction', 'frequency': 'annual', 'due_days_after_period': 60},
            {'type': 'final', 'title': 'Final Project Report', 'description': 'Comprehensive end-of-project report with audited financials and infrastructure handover documentation', 'frequency': 'final', 'due_days_after_period': 90},
        ])
        grants[0].reporting_frequency = 'quarterly'
        grants[0].set_report_template({
            'template_sections': [
                {'title': 'Executive Summary', 'description': 'Brief overview of the reporting period', 'required': True},
                {'title': 'Activities and Outputs', 'description': 'Detailed description of WASH activities and infrastructure outputs', 'required': True},
                {'title': 'Progress Against Indicators', 'description': 'Update on all KPIs with data', 'required': True},
                {'title': 'Financial Summary', 'description': 'Budget utilization and expenditure summary', 'required': True},
                {'title': 'Challenges and Mitigation', 'description': 'Issues encountered and solutions', 'required': True},
                {'title': 'Beneficiary Data', 'description': 'Disaggregated beneficiary numbers and water access data', 'required': True},
                {'title': 'Lessons Learned', 'description': 'Key learnings and best practices', 'required': False},
                {'title': 'Next Steps', 'description': 'Planned activities for upcoming period', 'required': True},
            ],
            'indicators': [
                {'name': 'People with improved water access', 'target': '42000', 'unit': 'people'},
                {'name': 'Boreholes constructed/rehabilitated', 'target': '12', 'unit': 'boreholes'},
                {'name': 'Water point functionality rate', 'target': '90%', 'unit': 'percentage'},
                {'name': 'Budget utilization rate', 'target': '85%', 'unit': 'percentage'},
            ]
        })

        # Grant 2: Maternal Health - quarterly financial + semi-annual narrative
        grants[1].set_reporting_requirements([
            {'type': 'financial', 'title': 'Quarterly Financial Report', 'description': 'Detailed expenditure with budget variance and burn rate analysis', 'frequency': 'quarterly', 'due_days_after_period': 30},
            {'type': 'narrative', 'title': 'Semi-Annual Progress Report', 'description': 'MNCH activities, indicator progress, beneficiary data, challenges', 'frequency': 'semi-annual', 'due_days_after_period': 45},
            {'type': 'impact', 'title': 'Annual Impact Report', 'description': 'Maternal health outcomes, mortality data, facility delivery rates', 'frequency': 'annual', 'due_days_after_period': 60},
            {'type': 'final', 'title': 'Final Project Report', 'description': 'Comprehensive end-of-project report with audited financials and impact evaluation', 'frequency': 'final', 'due_days_after_period': 90},
        ])
        grants[1].reporting_frequency = 'quarterly'
        grants[1].set_report_template({
            'template_sections': [
                {'title': 'Executive Summary', 'description': 'Overview of MNCH activities and key achievements', 'required': True},
                {'title': 'Activities and Outputs', 'description': 'Detailed description of interventions delivered', 'required': True},
                {'title': 'Maternal Health Indicators', 'description': 'ANC, facility delivery, postnatal care data', 'required': True},
                {'title': 'Child Health Indicators', 'description': 'Immunization, nutrition screening, referral data', 'required': True},
                {'title': 'Financial Summary', 'description': 'Budget utilization and expenditure by category', 'required': True},
                {'title': 'Challenges and Mitigation', 'description': 'Issues encountered and corrective actions', 'required': True},
                {'title': 'Next Steps', 'description': 'Planned activities for next period', 'required': True},
            ],
            'indicators': [
                {'name': 'ANC4+ coverage in target communities', 'target': '60%', 'unit': 'percentage'},
                {'name': 'Facility-based deliveries', 'target': '50%', 'unit': 'percentage'},
                {'name': 'Postnatal care visits within 48 hours', 'target': '70%', 'unit': 'percentage'},
                {'name': 'Children fully immunized', 'target': '80%', 'unit': 'percentage'},
                {'name': 'Budget utilization rate', 'target': '85%', 'unit': 'percentage'},
            ]
        })

        # Grant 3: Climate Resilience - semi-annual reporting
        grants[2].set_reporting_requirements([
            {'type': 'financial', 'title': 'Semi-Annual Financial Report', 'description': 'Budget utilization and expenditure report', 'frequency': 'semi-annual', 'due_days_after_period': 45},
            {'type': 'narrative', 'title': 'Semi-Annual Progress Report', 'description': 'Progress narrative with indicator updates and farmer reach data', 'frequency': 'semi-annual', 'due_days_after_period': 45},
            {'type': 'final', 'title': 'Final Report', 'description': 'Comprehensive final report with impact data', 'frequency': 'final', 'due_days_after_period': 90},
        ])
        grants[2].reporting_frequency = 'semi-annual'

        # Grant 4: GBV Prevention - quarterly reporting
        grants[3].set_reporting_requirements([
            {'type': 'financial', 'title': 'Quarterly Financial Report', 'description': 'Financial statement with budget variance', 'frequency': 'quarterly', 'due_days_after_period': 30},
            {'type': 'narrative', 'title': 'Quarterly Narrative Report', 'description': 'GBV case data, protection activities, governance participation metrics', 'frequency': 'quarterly', 'due_days_after_period': 30},
        ])
        grants[3].reporting_frequency = 'quarterly'

        # Grant 5: Youth Employment (closed/awarded) - quarterly reporting
        grants[4].set_reporting_requirements([
            {'type': 'financial', 'title': 'Quarterly Financial Report', 'description': 'Expenditure report with budget comparison and training cost analysis', 'frequency': 'quarterly', 'due_days_after_period': 30},
            {'type': 'narrative', 'title': 'Quarterly Progress Report', 'description': 'Training outputs, placement rates, employer feedback, youth employment data', 'frequency': 'quarterly', 'due_days_after_period': 30},
            {'type': 'impact', 'title': 'Annual Impact Report', 'description': 'Employment outcomes, income data, employer satisfaction, sustainability metrics', 'frequency': 'annual', 'due_days_after_period': 60},
            {'type': 'final', 'title': 'Final Project Report', 'description': 'End-of-project report with impact evaluation and lessons learned', 'frequency': 'final', 'due_days_after_period': 60},
        ])
        grants[4].reporting_frequency = 'quarterly'
        grants[4].set_report_template({
            'template_sections': [
                {'title': 'Executive Summary', 'description': 'Brief overview of the reporting period', 'required': True},
                {'title': 'Training Activities & Outputs', 'description': 'Cohorts trained, completion rates, skills assessed', 'required': True},
                {'title': 'Employment Outcomes', 'description': 'Placement rates, employer partnerships, income data', 'required': True},
                {'title': 'Financial Summary', 'description': 'Budget utilization and expenditure summary', 'required': True},
                {'title': 'Challenges and Mitigation', 'description': 'Issues encountered and solutions', 'required': True},
                {'title': 'Beneficiary Data', 'description': 'Disaggregated youth participation and outcome data', 'required': True},
                {'title': 'Next Steps', 'description': 'Planned activities for upcoming period', 'required': True},
            ],
            'indicators': [
                {'name': 'Youth trained and graduated', 'target': '500', 'unit': 'youth'},
                {'name': 'Employment placement rate', 'target': '65%', 'unit': 'percentage'},
                {'name': 'Female participation rate', 'target': '60%', 'unit': 'percentage'},
                {'name': 'Budget utilization rate', 'target': '85%', 'unit': 'percentage'},
            ]
        })

        print('  Added reporting requirements to grants')

        # ---- Applications -------------------------------------------------
        apps = []

        # --- Grant 1 (WASH - open): 2 submitted applications ---

        # 1) Amani -> Grant 1 (WASH) - submitted
        a1 = Application(
            ngo_org_id=orgs[0].id, grant_id=g1.id,
            status='submitted', submitted_at=dt(2026, 3, 1, 14, 0),
            responses=AMANI_WASH_RESPONSES,
            ai_score=84.0,
            created_at=dt(2026, 2, 20, 10, 0),
        )
        db.session.add(a1); apps.append(a1)

        # 2) Salam -> Grant 1 (WASH) - submitted
        a2 = Application(
            ngo_org_id=orgs[1].id, grant_id=g1.id,
            status='submitted', submitted_at=dt(2026, 3, 5, 11, 15),
            responses=SALAM_WASH_RESPONSES,
            ai_score=67.5,
            created_at=dt(2026, 2, 25, 10, 0),
        )
        db.session.add(a2); apps.append(a2)

        # --- Grant 2 (Maternal Health - open): 1 submitted, 1 draft ---

        # 3) Amani -> Grant 2 (Maternal Health) - submitted
        a3 = Application(
            ngo_org_id=orgs[0].id, grant_id=g2.id,
            status='submitted', submitted_at=dt(2026, 2, 28, 14, 30),
            responses=AMANI_MATERNAL_RESPONSES,
            ai_score=86.0,
            created_at=dt(2026, 2, 15, 9, 0),
        )
        db.session.add(a3); apps.append(a3)

        # 4) Hope Bridges -> Grant 2 (Maternal Health) - draft
        a4 = Application(
            ngo_org_id=orgs[3].id, grant_id=g2.id,
            status='draft',
            responses=HOPE_MATERNAL_DRAFT_RESPONSES,
            created_at=dt(2026, 3, 10, 13, 0),
        )
        db.session.add(a4); apps.append(a4)

        # --- Grant 4 (GBV Prevention - open): 1 submitted ---

        # 5) Sahel Women -> Grant 4 (GBV Prevention) - submitted
        a5 = Application(
            ngo_org_id=orgs[4].id, grant_id=g4.id,
            status='submitted', submitted_at=dt(2026, 3, 8, 9, 30),
            responses=SAHEL_GBV_RESPONSES,
            ai_score=54.0,
            created_at=dt(2026, 2, 20, 11, 0),
        )
        db.session.add(a5); apps.append(a5)

        # --- Grant 5 (Youth Employment - closed): 3 applications ---

        # 6) Amani -> Grant 5 (Youth) - awarded
        a6 = Application(
            ngo_org_id=orgs[0].id, grant_id=g5.id,
            status='awarded', submitted_at=dt(2025, 10, 1, 14, 0),
            responses=AMANI_YOUTH_RESPONSES,
            ai_score=82.0,
            human_score=85.0,
            final_score=83.5,
            created_at=dt(2025, 9, 15, 9, 0),
        )
        db.session.add(a6); apps.append(a6)

        # 7) Hope Bridges -> Grant 5 (Youth) - rejected
        a7 = Application(
            ngo_org_id=orgs[3].id, grant_id=g5.id,
            status='rejected', submitted_at=dt(2025, 10, 10, 10, 30),
            responses=HOPE_YOUTH_RESPONSES,
            ai_score=48.0,
            human_score=45.0,
            final_score=46.5,
            created_at=dt(2025, 9, 20, 11, 0),
        )
        db.session.add(a7); apps.append(a7)

        # 8) Ubuntu -> Grant 5 (Youth) - scored (under review / shortlisted)
        a8 = Application(
            ngo_org_id=orgs[2].id, grant_id=g5.id,
            status='under_review', submitted_at=dt(2025, 10, 5, 16, 45),
            responses=UBUNTU_YOUTH_RESPONSES,
            ai_score=88.0,
            human_score=90.0,
            final_score=89.0,
            created_at=dt(2025, 9, 18, 8, 30),
        )
        db.session.add(a8); apps.append(a8)

        # --- Additional application: Ubuntu -> Grant 2 (Maternal Health) ---

        # 9) Ubuntu -> Grant 2 (Maternal Health) - submitted
        a9 = Application(
            ngo_org_id=orgs[2].id, grant_id=g2.id,
            status='submitted', submitted_at=dt(2026, 3, 5, 10, 0),
            responses=UBUNTU_MATERNAL_RESPONSES,
            ai_score=76.0,
            created_at=dt(2026, 2, 28, 9, 0),
        )
        db.session.add(a9); apps.append(a9)

        db.session.flush()
        print(f'  Created {len(apps)} applications')

        # ---- Assessments (multiple per NGO showing score progression) -------
        assessments = []

        def add_assessment(org_id, score, created, framework='kuja'):
            data = make_assessment(org_id, score, created)
            data['framework'] = framework
            a = Assessment(**data)
            db.session.add(a)
            assessments.append(a)

        # Amani: 3 assessments showing improvement (75 -> 78 -> 82)
        add_assessment(orgs[0].id, 75.0, dt(2025, 7, 10, 9, 0), 'un_hact')
        add_assessment(orgs[0].id, 78.0, dt(2025, 10, 15, 10, 0), 'step')
        add_assessment(orgs[0].id, 82.0, dt(2026, 1, 20, 10, 0), 'kuja')

        # Salam: 2 assessments showing improvement (62 -> 68)
        add_assessment(orgs[1].id, 62.0, dt(2025, 9, 5, 14, 0), 'step')
        add_assessment(orgs[1].id, 68.0, dt(2026, 1, 22, 14, 0), 'kuja')

        # Ubuntu: 3 assessments showing consistently high (88 -> 90 -> 91)
        add_assessment(orgs[2].id, 88.0, dt(2025, 8, 1, 9, 0), 'un_hact')
        add_assessment(orgs[2].id, 90.0, dt(2025, 11, 20, 10, 0), 'chs')
        add_assessment(orgs[2].id, 91.0, dt(2026, 1, 18, 9, 0), 'kuja')

        # Hope Bridges: 2 assessments showing slight improvement (48 -> 55)
        add_assessment(orgs[3].id, 48.0, dt(2025, 10, 1, 11, 0), 'step')
        add_assessment(orgs[3].id, 55.0, dt(2026, 1, 25, 11, 0), 'kuja')

        # Sahel Women: 2 assessments showing improvement (42 -> 47)
        add_assessment(orgs[4].id, 42.0, dt(2025, 12, 10, 15, 0), 'nupas')
        add_assessment(orgs[4].id, 47.0, dt(2026, 1, 28, 15, 0), 'kuja')

        db.session.flush()
        print(f'  Created {len(assessments)} assessments (with historical data)')

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

        # Amani WASH docs (a1)
        docs.append(make_doc(a1.id, orgs[0].id, 'financialReport',
            'amani_financial_statements_2023-2025.pdf', 84,
            ['Three years of audited financials with consistent growth',
             'WASH-specific budget management experience demonstrated',
             'Clear infrastructure cost accounting',
             'Overhead at 12%, within WASH sector norms'],
            ['Strengthen foreign exchange risk management for multi-year infrastructure projects'],
            dt(2026, 2, 25, 10, 0)))

        docs.append(make_doc(a1.id, orgs[0].id, 'registrationCert',
            'amani_registration_certificate.pdf', 95,
            ['Valid NGO registration certificate from Kenya NGO Coordination Board',
             'Registration number NGO/2012/3847 confirmed active',
             'Certificate valid through December 2027'],
            ['Ensure timely renewal well before expiry date'],
            dt(2026, 2, 25, 10, 5)))

        docs.append(make_doc(a1.id, orgs[0].id, 'auditReport',
            'amani_external_audit_2024-2025.pdf', 80,
            ['External audit by PKF Kenya - unqualified opinion',
             'Asset management procedures assessed as adequate',
             'Internal controls for field procurement documented'],
            ['Implement digital asset tracking for infrastructure projects'],
            dt(2026, 2, 25, 10, 10)))

        docs.append(make_doc(a1.id, orgs[0].id, 'pseaPolicy',
            'amani_psea_policy_2024.pdf', 88,
            ['Comprehensive PSEA policy covering all required components',
             'Reporting mechanism includes confidential hotline',
             'Investigation procedures clearly outlined',
             'Annual staff training requirement documented'],
            ['Add whistleblower protection clause',
             'Include community awareness component'],
            dt(2026, 2, 25, 10, 15)))

        # Salam WASH docs (a2)
        docs.append(make_doc(a2.id, orgs[1].id, 'financialReport',
            'salam_financial_2022-2024.pdf', 65,
            ['Financial statements provided for 3 years',
             'Significant donor dependency on single OCHA grant',
             'Overhead at 18%, slightly above benchmark'],
            ['Diversify funding base urgently',
             'Reduce overhead costs to below 15%',
             'Improve financial narrative documentation'],
            dt(2026, 3, 1, 11, 0)))

        docs.append(make_doc(a2.id, orgs[1].id, 'registrationCert',
            'salam_registration_cert.pdf', 90,
            ['Valid registration under Somalia NGO Act',
             'Registration SOM/NGO/2015/221 confirmed by Ministry'],
            ['Monitor registration renewal timeline'],
            dt(2026, 3, 1, 11, 5)))

        docs.append(make_doc(a2.id, orgs[1].id, 'auditReport',
            'salam_audit_2023.pdf', 60,
            ['External audit completed by local firm',
             'Qualified opinion due to incomplete field expense documentation',
             'Inventory management weakness noted'],
            ['Engage a Big 4 or internationally recognized audit firm',
             'Implement digital expense tracking for field offices',
             'Establish proper inventory management system'],
            dt(2026, 3, 1, 11, 10)))

        # Amani Maternal Health docs (a3)
        docs.append(make_doc(a3.id, orgs[0].id, 'financialReport',
            'amani_financial_2022-2024_maternal.pdf', 85,
            ['Strong financial management for health programs',
             'Previous MNCH program budget execution at 93%',
             'Clear cost allocation between community and facility interventions'],
            ['Build reserves for emergency obstetric referral costs'],
            dt(2026, 2, 20, 10, 0)))

        docs.append(make_doc(a3.id, orgs[0].id, 'pseaPolicy',
            'amani_psea_safeguarding_policy.pdf', 90,
            ['Comprehensive PSEA policy with MNCH-specific provisions',
             'GBV referral pathway integrated into maternal health services',
             'Staff code of conduct specifically addresses health worker ethics'],
            ['Add maternal health confidentiality protocols'],
            dt(2026, 2, 20, 10, 10)))

        docs.append(make_doc(a3.id, orgs[0].id, 'projectReport',
            'amani_garissa_mnch_completion_report.pdf', 86,
            ['Comprehensive MNCH project completion report',
             'ANC4+ coverage increased by 41% in target areas',
             'Facility-based deliveries increased by 34%',
             'Strong community engagement documented'],
            ['Include longer-term health outcome tracking data'],
            dt(2026, 2, 20, 10, 15)))

        # Ubuntu Maternal Health docs (a9)
        docs.append(make_doc(a9.id, orgs[2].id, 'financialReport',
            'ubuntu_financial_report_2024-2025.pdf', 92,
            ['Excellent financial management with clean audit history',
             'Diversified funding across 8 major donors',
             'Overhead ratio at 11%, well below sector average',
             'Strong reserves policy maintained'],
            ['Consider establishing an endowment fund for long-term sustainability'],
            dt(2026, 3, 3, 9, 0)))

        docs.append(make_doc(a9.id, orgs[2].id, 'registrationCert',
            'ubuntu_npo_registration.pdf', 98,
            ['Valid South African NPO registration ZA-NPO-2008-071234',
             'Also registered with SARS as tax-exempt public benefit organization',
             'Cross-border operating permits for Kenya and Uganda on file'],
            [],
            dt(2026, 3, 3, 9, 5)))

        docs.append(make_doc(a9.id, orgs[2].id, 'projectReport',
            'ubuntu_smarthealth_kisumu_pilot_report.pdf', 85,
            ['Rigorous evaluation of SmartHealth CHW pilot',
             '8,400 household visits conducted by 15 digital CHWs',
             '92% referral completion rate achieved',
             '40% more visits than paper-based comparison group'],
            ['Extend evaluation to include maternal health-specific outcomes',
             'Add cost-effectiveness analysis'],
            dt(2026, 3, 3, 9, 10)))

        # Amani Youth docs (a6 - awarded)
        docs.append(make_doc(a6.id, orgs[0].id, 'financialReport',
            'amani_financial_2023-2025_youth.pdf', 82,
            ['Three years of audited financial statements provided',
             'Revenue growth of 15% year-over-year',
             'Overhead ratio at 13%, within acceptable range',
             'Clear separation of restricted and unrestricted funds'],
            ['Consider diversifying funding sources beyond 3 major donors',
             'Strengthen cash flow forecasting processes'],
            dt(2025, 9, 28, 10, 0)))

        docs.append(make_doc(a6.id, orgs[0].id, 'registrationCert',
            'amani_registration_certificate_2025.pdf', 95,
            ['Valid NGO registration certificate from Kenya NGO Coordination Board',
             'Registration number NGO/2012/3847 confirmed active',
             'Certificate valid through December 2027'],
            ['Ensure timely renewal well before expiry date'],
            dt(2025, 9, 28, 10, 5)))

        docs.append(make_doc(a6.id, orgs[0].id, 'projectReport',
            'amani_digijamii_pilot_report_2024.pdf', 78,
            ['Pilot program trained 50 youth in digital skills',
             '68% employment or self-employment placement achieved',
             'Community hub model demonstrated viability',
             'Partner engagement documented'],
            ['Strengthen formal M&E framework for employment tracking',
             'Add cost-per-placement analysis'],
            dt(2025, 9, 28, 10, 10)))

        # Ubuntu Youth docs (a8 - scored)
        docs.append(make_doc(a8.id, orgs[2].id, 'financialReport',
            'ubuntu_consolidated_financials_2024.pdf', 92,
            ['Excellent financial management across 5-country operations',
             'Youth program budget tracking demonstrates efficiency',
             'Employer co-funding revenue model validated'],
            ['Continue scaling employer partnership revenue stream'],
            dt(2025, 10, 2, 10, 0)))

        docs.append(make_doc(a8.id, orgs[2].id, 'projectReport',
            'ubuntu_smartskills_kenya_pilot_report.pdf', 88,
            ['Rigorous evaluation of Kenya skills pilot',
             '200 youth trained with 65% employment rate',
             'Average income increase of 280% post-training',
             'Employer satisfaction survey results strong (4.3/5.0)'],
            ['Include cost-per-job-created analysis',
             'Track 12-month retention rates for placements'],
            dt(2025, 10, 2, 10, 10)))

        # Hope Bridges Youth docs (a7 - rejected)
        docs.append(make_doc(a7.id, orgs[3].id, 'financialReport',
            'hopebridges_annual_finance_2024.pdf', 52,
            ['Financial statements provided for 2 years only',
             'Limited youth program budget management experience',
             'Single donor dependency (90% from one source)'],
            ['Diversify funding sources',
             'Build youth program financial tracking capacity',
             'Engage external auditor with development sector experience'],
            dt(2025, 10, 8, 9, 0)))

        docs.append(make_doc(a7.id, orgs[3].id, 'registrationCert',
            'hopebridges_uganda_cbo_registration.pdf', 65,
            ['CBO registration certificate from Uganda NGO Bureau',
             'Registration expiry date approaching (November 2025)',
             'Registration covers health and climate but not explicitly youth employment'],
            ['Renew CBO registration promptly',
             'Consider upgrading from CBO to full NGO status',
             'Request youth development sector endorsement'],
            dt(2025, 10, 8, 9, 5)))

        # Sahel GBV docs (a5)
        docs.append(make_doc(a5.id, orgs[4].id, 'financialReport',
            'sahelwomen_finance_2024.pdf', 45,
            ['Only 1 year of financial data provided',
             'Financial statements not externally audited',
             'Very small operational budget ($95K)',
             'Limited financial controls documentation'],
            ['Engage external auditor urgently',
             'Develop comprehensive financial policies manual',
             'Establish proper procurement procedures'],
            dt(2026, 3, 5, 11, 0)))

        docs.append(make_doc(a5.id, orgs[4].id, 'pseaPolicy',
            'sahelwomen_gbv_psea_policy.pdf', 62,
            ['Basic PSEA policy provided',
             'GBV referral pathways referenced but not detailed',
             'Missing investigation procedures section'],
            ['Strengthen PSEA policy with detailed investigation procedures',
             'Add survivor-centered approach protocols',
             'Include mandatory reporting timelines'],
            dt(2026, 3, 5, 11, 5)))

        for d in docs:
            db.session.add(d)
        db.session.flush()
        print(f'  Created {len(docs)} documents')

        # ---- Reviews ------------------------------------------------------
        reviews = []

        # Review for Amani WASH (a1)
        r1 = Review(
            application_id=a1.id,
            reviewer_user_id=users[5].id,  # James
            status='completed',
            overall_score=82,
            scores=json.dumps({
                'approach': 85, 'experience': 88,
                'coverage': 78, 'sustainability': 80,
                'budget_nar': 80
            }),
            comments=json.dumps({
                'approach': 'Strong technical approach with proven borehole and solar pump designs. PHAST methodology well-suited to ASAL context. Good integration with existing health programming.',
                'experience': 'Excellent WASH track record with 92% functionality rate, significantly above sector average. Comprehensive infrastructure portfolio.',
                'coverage': 'Good target area selection but ambitious given infrastructure logistics in arid regions. Beneficiary numbers well justified.',
                'sustainability': 'WUA model with fee collection is well designed. County government engagement adds credibility to long-term sustainability.',
                'budget_nar': 'Unit costs are reasonable and well-benchmarked against sector standards. O&M budget allocation could be higher for long-term infrastructure maintenance.'
            }),
            completed_at=dt(2026, 3, 10, 14, 0),
            created_at=dt(2026, 3, 5, 9, 0),
        )
        db.session.add(r1); reviews.append(r1)

        # Review for Salam WASH (a2) - in progress
        r2 = Review(
            application_id=a2.id,
            reviewer_user_id=users[5].id,  # James
            status='in_progress',
            overall_score=None,
            scores=json.dumps({
                'approach': 65, 'experience': 62,
            }),
            comments=json.dumps({
                'approach': 'Reasonable transition approach from emergency to permanent infrastructure. Solar borehole design is appropriate. Water ATM concept is innovative but unproven in Somalia context.',
                'experience': 'Relevant emergency WASH experience but limited large-scale infrastructure track record. Community trust in IDP settings is a significant asset.',
            }),
            created_at=dt(2026, 3, 8, 10, 0),
        )
        db.session.add(r2); reviews.append(r2)

        # Review for Amani Maternal Health (a3) - assigned
        r3 = Review(
            application_id=a3.id,
            reviewer_user_id=users[6].id,  # Maria
            status='assigned',
            created_at=dt(2026, 3, 12, 8, 0),
        )
        db.session.add(r3); reviews.append(r3)

        # Review for Amani Youth (a6) - completed during award process
        r4 = Review(
            application_id=a6.id,
            reviewer_user_id=users[5].id,  # James
            status='completed',
            overall_score=85,
            scores=json.dumps({
                'approach': 84, 'experience': 80,
                'innovation': 88, 'coverage': 82,
                'sustainability': 78
            }),
            comments=json.dumps({
                'approach': 'Community digital hub model is well-adapted to informal settlement context. Four-month training duration is practical. Good sector focus selection for target demographics.',
                'experience': 'Demonstrated results from DigiJamii pilot with 68% placement rate. CHW pipeline experience provides credible youth engagement track record.',
                'innovation': 'WhatsApp peer learning network is a pragmatic innovation with strong engagement. M-Pesa agent partnership creates immediate employment pathway.',
                'coverage': 'Targeting 500 youth across 4 informal settlements is ambitious but achievable with the hub model. Good gender targeting at 60% female.',
                'sustainability': 'County co-funding commitment is encouraging. Fee-for-service and community internet revenue need more validation data.'
            }),
            completed_at=dt(2025, 10, 20, 15, 0),
            created_at=dt(2025, 10, 10, 9, 0),
        )
        db.session.add(r4); reviews.append(r4)

        # Review for Ubuntu Youth (a8) - completed
        r5 = Review(
            application_id=a8.id,
            reviewer_user_id=users[6].id,  # Maria
            status='completed',
            overall_score=90,
            scores=json.dumps({
                'approach': 92, 'experience': 90,
                'innovation': 88, 'coverage': 85,
                'sustainability': 82
            }),
            comments=json.dumps({
                'approach': 'Excellent blended model combining digital and hands-on training. Strong employer partnership network across 45 organizations.',
                'experience': '72% employment placement rate in South Africa is impressive. Good evidence base with longitudinal tracking.',
                'innovation': 'AI-powered skills matching and digital portfolios are innovative and scalable. VR training modules are promising.',
                'coverage': 'Multi-country approach leverages existing infrastructure well. Good targeting criteria for marginalized youth.',
                'sustainability': 'Employer co-funding model is validated in South Africa. NITA partnership discussions are encouraging but not yet confirmed.'
            }),
            completed_at=dt(2025, 10, 22, 16, 0),
            created_at=dt(2025, 10, 12, 10, 0),
        )
        db.session.add(r5); reviews.append(r5)

        # Review for Hope Bridges Youth (a7) - completed (rejected)
        r6 = Review(
            application_id=a7.id,
            reviewer_user_id=users[5].id,  # James
            status='completed',
            overall_score=45,
            scores=json.dumps({
                'approach': 50, 'experience': 42,
                'innovation': 38, 'coverage': 48,
                'sustainability': 40
            }),
            comments=json.dumps({
                'approach': 'Agricultural focus is relevant to Northern Uganda but limited digital skills component does not align well with grant objectives. Training capacity is small.',
                'experience': 'Very limited formal youth employment data. No rigorous evaluation of training outcomes. Agricultural focus does not demonstrate digital skills delivery capacity.',
                'innovation': 'Community radio and SMS are basic rather than innovative. Farmer-to-farmer model lacks structure for quality assurance.',
                'coverage': 'Only 90 youth is insufficient scale for this grant. Geographic focus is appropriate but reach is too limited.',
                'sustainability': 'Cooperative model is standard but unproven for this organization. No revenue diversification beyond farm produce.'
            }),
            completed_at=dt(2025, 10, 25, 14, 0),
            created_at=dt(2025, 10, 15, 9, 0),
        )
        db.session.add(r6); reviews.append(r6)

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

        # Sahel Women - flagged on sanctions (partial name match)
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

        # --- Reports for Grant 5 (Youth Employment - awarded to Amani) ---

        # Q1 2026 Financial Report - accepted
        report1 = Report(
            grant_id=g5.id,
            application_id=a6.id,
            submitted_by_org_id=orgs[0].id,
            report_type='financial',
            reporting_period='Q1 2026',
            title='Q1 2026 Financial Report - Youth Employment & Digital Skills Program',
            status='accepted',
            due_date=date(2026, 4, 30),
            submitted_at=datetime(2026, 4, 15, 10, 0, 0),
            reviewed_at=datetime(2026, 4, 28, 14, 0, 0),
            reviewer_notes='Excellent financial reporting. Budget utilization on track. Training costs well documented.',
            created_at=datetime(2026, 4, 10, 9, 0, 0),
        )
        report1.set_content({
            'Executive Summary': 'This report covers Q1 2026 financial performance for the DigiJamii Youth Employment Program. Total expenditure was $68,200 against a quarterly budget of $75,000, representing 90.9% utilization. The program is on track financially with training activities ramping up across all 4 community digital hubs.',
            'Training Activities & Outputs': 'Cohort 1 training completed across 4 hubs (100 youth). Digital hub operational costs: equipment maintenance $4,200, internet connectivity $3,600. Training materials and facilitator costs: $12,800.',
            'Financial Summary': 'Opening balance: $300,000. Q1 expenditure: $68,200. Key categories: Personnel $28,400 (4 hub coordinators, program manager), Training delivery $16,400, Equipment & technology $12,600, Apprenticeship stipends $5,800, M&E $3,000, Management $2,000. Closing balance: $231,800.',
            'Challenges and Mitigation': 'Equipment procurement for Korogocho hub delayed by 2 weeks due to supplier issues. Resolved by engaging alternative vendor. Internet connectivity costs higher than budgeted in Mukuru hub; negotiating bulk rate with provider.',
            'Next Steps': 'Launch Cohort 2 recruitment (125 youth). Complete Cohort 1 apprenticeship placements. Conduct employer engagement workshops in all 4 locations.',
        })
        report1.set_ai_analysis({
            'score': 88,
            'completeness_score': 90,
            'quality_score': 85,
            'compliance_score': 88,
            'findings': ['Clear budget categorization with good variance explanation', 'Training activities well documented with per-hub cost breakdown', 'Equipment procurement properly documented'],
            'missing_items': ['Detailed procurement schedule for remaining equipment purchases'],
            'recommendations': ['Include exchange rate impact in future reports', 'Add forward-looking cash flow projection'],
            'requirement_scores': [
                {'requirement': 'Statement of expenditure by budget line item', 'score': 92, 'addressed': True, 'feedback': 'Excellent budget line item detail with per-hub breakdown.'},
                {'requirement': 'Budget vs. actual comparison with variance analysis', 'score': 88, 'addressed': True, 'feedback': 'Good variance analysis. 90.9% utilization rate well explained.'},
                {'requirement': 'Cash flow projection for next quarter', 'score': 78, 'addressed': True, 'feedback': 'Next steps provided but formal cash flow projection would strengthen reporting.'},
            ],
            'summary': 'Strong Q1 financial report demonstrating efficient program launch across 4 digital hubs.',
            'risk_flags': [],
        })
        db.session.add(report1)
        reports.append(report1)

        # Q2 2026 Narrative Report - submitted
        report2 = Report(
            grant_id=g5.id,
            application_id=a6.id,
            submitted_by_org_id=orgs[0].id,
            report_type='narrative',
            reporting_period='Q2 2026',
            title='Q2 2026 Progress Report - Youth Employment & Digital Skills Program',
            status='submitted',
            due_date=date(2026, 7, 30),
            submitted_at=datetime(2026, 7, 20, 14, 0, 0),
            created_at=datetime(2026, 7, 15, 9, 0, 0),
        )
        report2.set_content({
            'Executive Summary': 'Q2 2026 saw significant program momentum with Cohort 1 completing training and entering apprenticeships, and Cohort 2 commencing across all 4 community digital hubs. Total youth engaged: 225 (100 Cohort 1 + 125 Cohort 2). Employment placement activities initiated for Cohort 1 graduates.',
            'Training Activities & Outputs': 'Cohort 1 (100 youth): Completed 4-month intensive training. 92 graduated (92% completion rate). 68 placed in 2-month apprenticeships with partner businesses. Cohort 2 (125 youth): Recruited and enrolled. Training commenced in May 2026 across digital technology, financial services, and e-commerce tracks.',
            'Employment Outcomes': 'Cohort 1 early placement results: 42 of 92 graduates (46%) secured employment or self-employment within 4 weeks of graduation. 28 in digital financial services (M-Pesa agents, digital bookkeeping), 9 in mobile technology services, 5 in e-commerce. Remaining graduates in active job search with mentor support.',
            'Beneficiary Data': 'Total enrolled: 225 youth. Gender: 138 female (61%), 87 male (39%). Age distribution: 18-22 (45%), 23-26 (35%), 27-30 (20%). All from target informal settlements: Kibera (65), Mathare (55), Korogocho (50), Mukuru (55).',
            'Challenges and Mitigation': 'Apprenticeship placement in Korogocho slower than other hubs due to fewer local businesses with digital operations. Mitigation: expanded business partnerships to adjacent commercial areas. Two hub facilitators resigned; replacements recruited and trained within 3 weeks.',
        })
        report2.set_ai_analysis({
            'score': 82,
            'completeness_score': 85,
            'quality_score': 80,
            'compliance_score': 82,
            'findings': ['Strong cohort completion rates', 'Good early employment indicators', 'Gender targeting exceeded 60% female target'],
            'missing_items': ['Income data for employed graduates', 'Employer satisfaction survey results'],
            'recommendations': ['Include income baseline and post-training comparison', 'Add employer feedback section in next report'],
            'requirement_scores': [
                {'requirement': 'Training outputs and completion rates', 'score': 90, 'addressed': True, 'feedback': 'Excellent detail on cohort progress and graduation rates.'},
                {'requirement': 'Employment placement data', 'score': 78, 'addressed': True, 'feedback': 'Early results promising but need longer tracking period for full picture.'},
                {'requirement': 'Disaggregated beneficiary data', 'score': 88, 'addressed': True, 'feedback': 'Good gender, age, and location disaggregation provided.'},
            ],
            'summary': 'Solid Q2 progress report demonstrating program scale-up with encouraging early employment outcomes.',
            'risk_flags': ['Staff turnover at 2 hubs needs monitoring'],
        })
        db.session.add(report2)
        reports.append(report2)

        # Q3 2026 Financial Report - draft (upcoming)
        report3 = Report(
            grant_id=g5.id,
            application_id=a6.id,
            submitted_by_org_id=orgs[0].id,
            report_type='financial',
            reporting_period='Q3 2026',
            title='Q3 2026 Financial Report - Youth Employment & Digital Skills Program',
            status='draft',
            due_date=date(2026, 10, 30),
            created_at=datetime(2026, 9, 15, 9, 0, 0),
        )
        report3.set_content({
            'Executive Summary': 'Draft - Q3 2026 financial report for Youth Employment & Digital Skills Program.',
        })
        db.session.add(report3)
        reports.append(report3)

        # --- Additional reports for other grants to show reporting activity ---

        # Grant 1 WASH: Amani submitted Q1 report
        report4 = Report(
            grant_id=g1.id,
            application_id=a1.id,
            submitted_by_org_id=orgs[0].id,
            report_type='financial',
            reporting_period='Q1 2026',
            title='Q1 2026 Financial Report - USAID WASH Program',
            status='submitted',
            due_date=date(2026, 4, 30),
            submitted_at=datetime(2026, 4, 18, 10, 0, 0),
            created_at=datetime(2026, 4, 12, 9, 0, 0),
        )
        report4.set_content({
            'Executive Summary': 'Q1 2026 covers the inception and procurement phase. Total expenditure: $312,500 against quarterly budget of $375,000 (83.3% utilization). Major activities: geo-hydrological surveys completed at 12 borehole sites, 3 drilling contracts awarded, community mobilization initiated.',
            'Financial Summary': 'Opening balance: $625,000. Q1 expenditure: $312,500. Key categories: Infrastructure procurement $185,000, Personnel $62,500, Community mobilization $28,000, M&E $18,500, Management $18,500.',
            'Next Steps': 'Commence borehole drilling at first 4 sites. Complete WUA formation in 8 communities. Begin institutional latrine construction at 3 schools.',
        })
        report4.set_ai_analysis({
            'score': 80,
            'completeness_score': 82,
            'quality_score': 78,
            'compliance_score': 80,
            'findings': ['Infrastructure procurement well documented', 'Geo-hydrological surveys demonstrate thorough planning'],
            'missing_items': ['Detailed procurement documentation for contracts over $50,000'],
            'recommendations': ['Include procurement comparison sheets for infrastructure contracts', 'Add community mobilization activity detail'],
            'requirement_scores': [
                {'requirement': 'Statement of expenditure by budget line item', 'score': 85, 'addressed': True, 'feedback': 'Good line-item breakdown provided.'},
                {'requirement': 'Budget vs. actual comparison with variance analysis', 'score': 78, 'addressed': True, 'feedback': 'Comparison provided. Variance analysis could be more detailed.'},
            ],
            'summary': 'Adequate inception phase financial report. Infrastructure procurement on track.',
            'risk_flags': ['Procurement documentation for large contracts needs strengthening'],
        })
        db.session.add(report4)
        reports.append(report4)

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
                'Registration expired November 2025 - renewal needed',
                'Registered as Community-Based Organization (CBO)',
                'NGO Bureau online registry available for verification',
            ],
            'recommendations': [
                'Request proof of registration renewal from Hope Bridges',
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
            notes='No registration number provided. Organization claims pending registration with CAC Nigeria.',
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
                'Organization established in 2020 but no formal registration obtained',
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
