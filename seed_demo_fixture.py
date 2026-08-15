#!/usr/bin/env python3
"""
seed_demo_fixture.py — one clean, realistic pilot fixture (Kuja Marketplace).

The 14-Aug pilot review flagged that the only grant the E2E suite left behind
had NO eligibility and NO criteria, so criterion-aware guidance and scoring
couldn't be demonstrated. This seeds ONE descriptive, fully-specified grant
(weighted criteria + eligibility + required docs + dated deliverables), plus a
single genuine submitted+scored application and one reviewer assignment — so
after the synthetic purge every persona has real, coherent work:

  donor (Global Health Fund) : 1 pre-scored submitted application to review
  NGO   (Amani Community Dev) : 1 submitted application on a real, rubric'd grant
  reviewer (James)           : 1 assigned review

Idempotent: re-running updates the grant in place and never duplicates the
application/review. The title is descriptive (never matches
is_test_artifact_title), so the pruner will not touch it.

Usage (inside the Railway container):
    python seed_demo_fixture.py
"""

import os
import sys
from datetime import datetime, timezone, date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from app.extensions import db
from app.models import Grant, Application, Organization, User, Review
from app.services.scoring_engine import ScoringEngine

GRANT_TITLE = "Rural WASH & Maternal Health Resilience Fund (2026)"
DONOR_ORG = "Global Health Fund"
NGO_ORG = "Amani Community Development"
REVIEWER_EMAIL = "james@reviewer.org"

CRITERIA = [
    {"id": "approach", "label": "Programme approach & technical soundness", "weight": 30,
     "description": "Clarity of the delivery model, evidence base, and fit to the target communities."},
    {"id": "capacity", "label": "Organisational capacity & track record", "weight": 25,
     "description": "Demonstrated ability to deliver at this scale, with clean financial management."},
    {"id": "sustainability", "label": "Sustainability & community ownership", "weight": 25,
     "description": "How results and services continue after the grant ends, and who owns them locally."},
    {"id": "vfm", "label": "Value for money", "weight": 20,
     "description": "Cost per beneficiary and the share of budget reaching the community directly."},
]
ELIGIBILITY = [
    {"id": "registered", "label": "Registered NGO/CBO in the country of operation", "required": True},
    {"id": "experience", "label": "At least 2 years delivering WASH or maternal-health programmes", "required": True},
    {"id": "audit", "label": "Most recent independent financial audit available", "required": True},
]
DOC_REQUIREMENTS = [
    {"id": "reg_cert", "label": "Registration certificate", "required": True},
    {"id": "audit_report", "label": "Latest audited financial statements", "required": True},
    {"id": "budget", "label": "Detailed programme budget", "required": True},
]
REPORTING_REQUIREMENTS = [
    {"id": "q_narrative", "title": "Quarterly narrative & indicator report", "type": "narrative",
     "frequency": "quarterly", "due_offset_days": 30,
     "description": "Progress against indicators, challenges, and lessons — within 30 days of each quarter end."},
    {"id": "q_financial", "title": "Quarterly financial report", "type": "financial",
     "frequency": "quarterly", "due_offset_days": 30,
     "description": "Budget vs actual with variance narrative — within 30 days of each quarter end."},
    {"id": "final_eval", "title": "Final evaluation report", "type": "impact",
     "frequency": "final_only", "due_offset_days": 90,
     "description": "Independent outcome evaluation within 90 days of project completion."},
]
RESPONSES = {
    "approach": ("We deploy trained community health workers alongside a village water-committee model, "
                 "targeting 40 villages with WHO-aligned maternal-health and WASH indicators. Each site pairs "
                 "a rehabilitated water point with monthly antenatal outreach, referral links to the district "
                 "clinic, and a locally-elected committee that maintains the point."),
    "capacity": ("Amani has delivered three comparable grants totalling $2.1M over five years across Kenya, "
                 "Somalia and South Sudan, each with a clean independent audit and 96% budget-burn accuracy. "
                 "We hold Kenya NGO Board registration and employ 120+ field staff."),
    "sustainability": ("Water committees collect a small maintenance fee and are trained on repairs, so points "
                       "keep running after the grant. Community health workers are drawn from and paid by the "
                       "villages by year three, and indicator collection is handed to the district health team."),
    "vfm": ("Total cost per beneficiary is $18 across an estimated 55,000 people; 82% of the budget reaches the "
            "community directly, with overheads held at 11%."),
}
ELIGIBILITY_RESPONSES = {"registered": "yes", "experience": "yes", "audit": "yes"}


def main():
    app = create_app()
    with app.app_context():
        donor = Organization.query.filter(Organization.name == DONOR_ORG).first()
        ngo = Organization.query.filter(Organization.name == NGO_ORG).first()
        reviewer = User.query.filter(User.email.ilike(REVIEWER_EMAIL)).first()
        if not donor or not ngo:
            print(f"ERROR: need both orgs present — donor={bool(donor)} ngo={bool(ngo)}")
            sys.exit(2)

        # --- Grant (get-or-create, updated in place) ---
        g = Grant.query.filter(
            Grant.title == GRANT_TITLE, Grant.donor_org_id == donor.id).first()
        created_grant = g is None
        if g is None:
            g = Grant(donor_org_id=donor.id, title=GRANT_TITLE)
            db.session.add(g)
        g.description = ("A results-focused fund for rural water, sanitation and maternal-health programmes "
                         "in the Horn of Africa. We back organisations that combine sound technical delivery "
                         "with genuine community ownership and strong value for money.")
        g.total_funding = 500000
        g.currency = "USD"
        g.deadline = date.today() + timedelta(days=45)
        g.status = "open"
        g.set_sectors(["Health", "WASH", "Nutrition"])
        g.set_countries(["Kenya", "Somalia", "South Sudan"])
        g.set_criteria(CRITERIA)
        g.set_eligibility(ELIGIBILITY)
        g.set_doc_requirements(DOC_REQUIREMENTS)
        g.set_reporting_requirements(REPORTING_REQUIREMENTS)
        g.reporting_frequency = "quarterly"
        if g.published_at is None:
            g.published_at = datetime.now(timezone.utc)
        db.session.commit()

        # --- One genuine submitted + scored application from the NGO ---
        a = Application.query.filter_by(grant_id=g.id, ngo_org_id=ngo.id).first()
        created_app = a is None
        if a is None:
            a = Application(grant_id=g.id, ngo_org_id=ngo.id)
            db.session.add(a)
        a.set_responses(RESPONSES)
        a.set_eligibility_responses(ELIGIBILITY_RESPONSES)
        # Only advance forward — never regress an already-under_review/scored app
        # back to 'submitted' on a re-run.
        if (a.status or "draft") in ("draft", ""):
            a.status = "submitted"
        if a.submitted_at is None:
            a.submitted_at = datetime.now(timezone.utc)
        db.session.flush()
        try:
            res = ScoringEngine.score_application(a)
            sc = res.get("overall_score")
            if sc is not None:
                a.ai_score = sc
                a.final_score = sc
        except Exception as e:
            print(f"(auto-score skipped: {e})")
        db.session.commit()

        # --- One reviewer assignment so the reviewer persona has real work ---
        rv_note = "no reviewer account"
        if reviewer and reviewer.role == "reviewer":
            rv = Review.query.filter_by(application_id=a.id, reviewer_user_id=reviewer.id).first()
            if rv is None:
                rv = Review(application_id=a.id, reviewer_user_id=reviewer.id, status="assigned")
                db.session.add(rv)
                if a.status == "submitted":
                    a.status = "under_review"
                db.session.commit()
                rv_note = f"assigned review#{rv.id} to {reviewer.email}"
            else:
                rv_note = f"review already assigned to {reviewer.email}"

        print("=" * 64)
        print("DEMO FIXTURE READY")
        print(f"  grant   #{g.id}  '{g.title}'  status={g.status}  "
              f"criteria={len(g.get_criteria())}  ({'created' if created_grant else 'updated'})")
        print(f"  application #{a.id}  ngo={ngo.name}  status={a.status}  "
              f"ai_score={a.ai_score}  ({'created' if created_app else 'updated'})")
        print(f"  reviewer: {rv_note}")
        print("=" * 64)


if __name__ == '__main__':
    main()
