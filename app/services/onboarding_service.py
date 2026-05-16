"""
OnboardingService — Phase 17B (May 2026).

Deterministic progress snapshot of an NGO's first-run journey:
  1. Org profile (mission + country + sectors filled in)
  2. Capacity assessment (at least one Assessment row exists)
  3. First application (at least one Application in 'submitted' or beyond)

Renders as a small checklist on the NGO dashboard until all three are
done — then disappears (don't pile decorative real estate on busy
power users).

Server-side computation so the frontend gets a single shaped response
and the same logic powers future analytics ("activation funnel").
"""

import logging

from app.extensions import db
from app.models import Application, Assessment, Organization

logger = logging.getLogger('kuja')


REQUIRED_PROFILE_FIELDS = ('mission', 'country', 'sectors')


class OnboardingService:

    @classmethod
    def for_ngo(cls, *, ngo_org_id: int) -> dict:
        org = db.session.get(Organization, ngo_org_id)
        if not org or org.org_type != 'ngo':
            return {'success': False, 'reason': 'not_ngo'}

        # Step 1 — org profile completeness
        profile_done = cls._profile_complete(org)

        # Step 2 — capacity assessment
        has_assessment = (
            Assessment.query.filter(Assessment.org_id == ngo_org_id)
            .first() is not None
        )

        # Step 3 — first submitted application
        first_app = (
            Application.query
            .filter(Application.ngo_org_id == ngo_org_id)
            .filter(Application.status.in_((
                'submitted', 'under_review', 'awarded', 'rejected', 'scored',
            )))
            .first()
        )

        steps = [
            {
                'id': 'profile',
                'label': 'Complete your org profile',
                'caption': 'Mission, country, and sectors so donors can find you.',
                'done': bool(profile_done),
                'href': '/organizations/profile',
            },
            {
                'id': 'assessment',
                'label': 'Run a capacity assessment',
                'caption': '5–10 minutes. Drives your trust profile + matches.',
                'done': bool(has_assessment),
                'href': '/assessments/wizard',
            },
            {
                'id': 'first_app',
                'label': 'Submit your first application',
                'caption': 'Use auto-fill on any open grant to draft fast.',
                'done': bool(first_app),
                'href': '/grants',
            },
        ]

        done_count = sum(1 for s in steps if s['done'])
        all_done = done_count == len(steps)
        # Next-step pointer = first incomplete step
        next_step = next((s for s in steps if not s['done']), None)

        return {
            'success': True,
            'ngo_org_id': ngo_org_id,
            'steps': steps,
            'done_count': done_count,
            'total_count': len(steps),
            'all_done': all_done,
            'next_step': next_step,
        }

    @classmethod
    def for_donor(cls, *, donor_org_id: int) -> dict:
        """Phase 18C — symmetric checklist for new donor orgs.

        Steps:
          1. Org profile (mission + country)
          2. First grant published (status='open' ever)
          3. First decided application (awarded or rejected with debrief)
        """
        from app.models import Grant, Application

        org = db.session.get(Organization, donor_org_id)
        if not org or org.org_type != 'donor':
            return {'success': False, 'reason': 'not_donor'}

        # Step 1 — profile
        profile_done = bool(org.mission and org.country)

        # Step 2 — first grant published
        first_grant = (
            Grant.query.filter(Grant.donor_org_id == donor_org_id)
            .filter(Grant.status.in_(('open', 'closed', 'awarded')))
            .first()
        )

        # Step 3 — first decision with debrief (closes the learning loop)
        first_decided = (
            Application.query.join(Grant)
            .filter(Grant.donor_org_id == donor_org_id)
            .filter(Application.status.in_(('awarded', 'rejected')))
            .filter(Application.decision_reason_code.isnot(None))
            .first()
        )

        steps = [
            {
                'id': 'profile',
                'label': 'Complete your donor profile',
                'caption': 'Mission + country so NGOs can research before applying.',
                'done': bool(profile_done),
                'href': '/organizations/profile',
            },
            {
                'id': 'first_grant',
                'label': 'Publish your first grant',
                'caption': 'Use the wizard — AI scaffolds eligibility, criteria, and reporting.',
                'done': bool(first_grant),
                'href': '/grants/new',
            },
            {
                'id': 'first_debrief',
                'label': 'Record your first win/loss debrief',
                'caption': 'Structured feedback on any awarded or declined application.',
                'done': bool(first_decided),
                'href': '/applications',
            },
        ]
        done_count = sum(1 for s in steps if s['done'])
        all_done = done_count == len(steps)
        next_step = next((s for s in steps if not s['done']), None)

        return {
            'success': True,
            'donor_org_id': donor_org_id,
            'steps': steps,
            'done_count': done_count,
            'total_count': len(steps),
            'all_done': all_done,
            'next_step': next_step,
        }

    @staticmethod
    def _profile_complete(org: Organization) -> bool:
        for f in REQUIRED_PROFILE_FIELDS:
            val = getattr(org, f, None)
            if not val:
                return False
            # sectors is text JSON; treat empty array string as not done
            if f == 'sectors':
                stripped = (val or '').strip().lower()
                if stripped in ('', '[]', 'null'):
                    return False
        return True
