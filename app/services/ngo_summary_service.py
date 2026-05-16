"""
NGOSummaryService — Phase 19C (May 2026).

Public read-only summary of an NGO that the org can opt-in to share.
Symmetric to DonorProfileService (Phase 18B) but on the NGO side.

Designed to be the URL an NGO puts in their email signature, mailing
list pitch, or donor's research portal. Aggregates only — no individual
application content, no grant amounts received.

What it shows:
  - Name + country + verified badge
  - Capacity score + diligence score (from TrustProfileService)
  - Sectors they work in (from org.sectors)
  - Country footprint (from org.geographic_areas)
  - Active passport status (if published)
  - Aggregate delivery: # awarded grants, # active grants, # reports submitted
  - Year established + budget band + staff band

Opt-in: only returns data when org.settings_json.public_summary_enabled
is True. Defaults to False so existing NGOs are not unexpectedly
exposed.
"""

import logging
from datetime import datetime, timezone

from app.extensions import db
from app.models import Application, CapacityPassport, Grant, Organization, Report

logger = logging.getLogger('kuja')


class NGOSummaryService:

    @classmethod
    def for_ngo(cls, *, ngo_org_id: int) -> dict:
        org = db.session.get(Organization, ngo_org_id)
        if not org or org.org_type != 'ngo':
            return {'success': False, 'reason': 'not_ngo'}

        # Opt-in check
        settings = org.get_settings() if hasattr(org, 'get_settings') else {}
        if not settings.get('public_summary_enabled'):
            return {'success': False, 'reason': 'not_published'}

        # Compose
        sectors = org.get_sectors() if hasattr(org, 'get_sectors') else []
        geo = org.get_geographic_areas() if hasattr(org, 'get_geographic_areas') else []
        focus = org.get_focus_areas() if hasattr(org, 'get_focus_areas') else []

        # Aggregate counts (cheap GROUP-BY style)
        apps = Application.query.filter(Application.ngo_org_id == ngo_org_id).all()
        awarded_count = sum(1 for a in apps if a.status == 'awarded')
        active_grant_count = sum(
            1 for a in apps if a.status in ('awarded', 'submitted', 'under_review')
        )
        reports_submitted = (
            Report.query
            .filter(Report.submitted_by_org_id == ngo_org_id)
            .filter(Report.status.in_(('submitted', 'approved')))
            .count()
        )

        # Trust scores (use the deterministic builder; never expose the
        # raw component breakdown publicly)
        try:
            from app.services.trust_profile_service import TrustProfileService
            tp = TrustProfileService.build(ngo_org_id) or {}
            capacity_score = (tp.get('capacity') or {}).get('score')
            diligence_score = (tp.get('diligence') or {}).get('score')
            overall_score = (tp.get('overall') or {}).get('score')
            overall_status = (tp.get('overall') or {}).get('status')
        except Exception:
            capacity_score = None
            diligence_score = None
            overall_score = None
            overall_status = None

        # Passport
        active_passport = (
            CapacityPassport.query
            .filter_by(org_id=ngo_org_id, status='active')
            .order_by(CapacityPassport.created_at.desc())
            .first()
        )

        return {
            'success': True,
            'ngo_org_id': ngo_org_id,
            'ngo_name': org.name,
            'country': org.country,
            'verified': bool(org.verified),
            'mission': (org.mission or '')[:600] or None,
            'website': org.website,
            'year_established': org.year_established,
            'staff_count': org.staff_count,
            'annual_budget': org.annual_budget,
            'sectors': sectors[:8] if isinstance(sectors, list) else [],
            'geographic_areas': geo[:8] if isinstance(geo, list) else [],
            'focus_areas': focus[:6] if isinstance(focus, list) else [],
            'capacity_score': capacity_score,
            'diligence_score': diligence_score,
            'overall_score': overall_score,
            'overall_status': overall_status,
            'awarded_count': awarded_count,
            'active_grant_count': active_grant_count,
            'reports_submitted_count': reports_submitted,
            'passport': {
                'slug': active_passport.slug if active_passport else None,
                'published_at': (
                    active_passport.created_at.isoformat()
                    if active_passport and active_passport.created_at else None
                ),
            } if active_passport else None,
            'computed_at': datetime.now(timezone.utc).isoformat(),
        }

    @classmethod
    def publish(cls, *, ngo_org_id: int) -> dict:
        """Flip the opt-in switch."""
        org = db.session.get(Organization, ngo_org_id)
        if not org or org.org_type != 'ngo':
            return {'success': False, 'reason': 'not_ngo'}
        cur = org.get_settings() if hasattr(org, 'get_settings') else {}
        cur['public_summary_enabled'] = True
        if hasattr(org, 'set_settings'):
            org.set_settings(cur)
            db.session.commit()
        return {'success': True, 'published': True}

    @classmethod
    def unpublish(cls, *, ngo_org_id: int) -> dict:
        org = db.session.get(Organization, ngo_org_id)
        if not org or org.org_type != 'ngo':
            return {'success': False, 'reason': 'not_ngo'}
        cur = org.get_settings() if hasattr(org, 'get_settings') else {}
        cur.pop('public_summary_enabled', None)
        if hasattr(org, 'set_settings'):
            org.set_settings(cur)
            db.session.commit()
        return {'success': True, 'published': False}
