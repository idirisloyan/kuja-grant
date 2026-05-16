"""
TodayBriefingService — Phase 2 (May 2026 category-defining UX)
==============================================================

Assembles "what should I act on today" for any role: NGO, donor, reviewer, admin.

The pattern is deterministic — we walk the DB and surface concrete items
with explicit urgency, severity, count, and a primary action link. AI is
optional layered narration on top (cached, falls back to template).

Output shape:

    {
      'briefing_date': '2026-05-15',
      'role': 'ngo' | 'donor' | 'reviewer' | 'admin',
      'headline': 'You have 3 priorities and 2 opportunities today.',
      'tone': 'critical' | 'attention' | 'on_track' | 'opportunity',
      'items': [
        {
          'kind': 'deadline' | 'review' | 'screening' | 'opportunity' |
                  'compliance' | 'system' | 'profile',
          'severity': 'critical' | 'major' | 'minor' | 'info',
          'icon': 'alert-triangle' | 'clock' | 'shield' | 'sparkle' | ...,
          'label': 'Quarterly Report due in 2 days',
          'detail': 'Q1 progress for Global Health Fund (KE-2026-04)',
          'count': 1,                      # informational; some items have N
          'due_in_days': 2 | null,         # for ordering + display
          'href': '/reports/123',
          'cta_label': 'Open report',
        },
        ...
      ],
      'computed_at': '2026-05-15T08:00:00Z',
    }

Items are sorted by:
  1. Severity (critical → major → minor → info)
  2. Due-in-days ascending (overdue first; nulls last)
  3. Kind priority (deadline > review > screening > opportunity)

We cap at 6 items per role to keep the briefing scannable.
"""

import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func

from app.extensions import db
from app.models import (
    Organization, Grant, Application, Assessment, Report, Review,
    ComplianceCheck, RegistrationVerification,
    AdverseMediaScreening, CapacityPassport,
)

logger = logging.getLogger('kuja')


SEV_ORDER = {'critical': 0, 'major': 1, 'minor': 2, 'info': 3}
KIND_ORDER = {
    'deadline': 0,
    'review': 1,
    'screening': 2,
    'compliance': 3,
    'profile': 4,
    'opportunity': 5,
    'system': 6,
}


class TodayBriefingService:

    MAX_ITEMS = 6

    @classmethod
    def build(cls, user) -> dict:
        """Top-level dispatch by role."""
        role = getattr(user, 'role', None)
        if role == 'ngo':
            items = cls._ngo_items(user)
        elif role == 'donor':
            items = cls._donor_items(user)
        elif role == 'reviewer':
            items = cls._reviewer_items(user)
        elif role == 'admin':
            items = cls._admin_items(user)
        else:
            items = []

        items = cls._sort_and_cap(items)
        headline, tone = cls._headline(role, items)

        return {
            'briefing_date': date.today().isoformat(),
            'role': role,
            'headline': headline,
            'tone': tone,
            'items': items,
            'computed_at': datetime.now(timezone.utc).isoformat(),
        }

    # ------------------------------------------------------------------
    # Sorting + headline
    # ------------------------------------------------------------------

    @classmethod
    def _sort_and_cap(cls, items: list[dict]) -> list[dict]:
        def key(it):
            return (
                SEV_ORDER.get(it.get('severity', 'info'), 99),
                # Overdue (negative) sorts first; nulls go last
                (it.get('due_in_days') if it.get('due_in_days') is not None else 999),
                KIND_ORDER.get(it.get('kind', 'opportunity'), 99),
            )
        return sorted(items, key=key)[:cls.MAX_ITEMS]

    @classmethod
    def _headline(cls, role: str, items: list[dict]) -> tuple[str, str]:
        if not items:
            return (cls._all_clear_headline(role), 'on_track')

        critical = sum(1 for i in items if i['severity'] == 'critical')
        major = sum(1 for i in items if i['severity'] == 'major')
        opps = sum(1 for i in items if i['kind'] == 'opportunity')

        if critical:
            verb = 'needs' if critical == 1 else 'need'
            return (
                f'{critical} critical item{"" if critical == 1 else "s"} {verb} your attention today.',
                'critical',
            )
        if major:
            parts = [f'{major} priorit{"y" if major == 1 else "ies"}']
            if opps:
                parts.append(f'{opps} opportunit{"y" if opps == 1 else "ies"}')
            return (' and '.join(parts) + ' to handle.', 'attention')
        if opps:
            return (f'{opps} opportunit{"y" if opps == 1 else "ies"} to act on today.', 'opportunity')
        return (f'{len(items)} item{"" if len(items) == 1 else "s"} on your queue.', 'on_track')

    @staticmethod
    def _all_clear_headline(role: str) -> str:
        return {
            'ngo':      'All caught up. Good time to explore new opportunities.',
            'donor':    'All clear — no reviews or reports waiting.',
            'reviewer': 'Inbox zero. Check back later for new assignments.',
            'admin':    'System is healthy. No urgent action required.',
        }.get(role, 'Nothing urgent today.')

    # ------------------------------------------------------------------
    # NGO items
    # ------------------------------------------------------------------

    @classmethod
    def _ngo_items(cls, user) -> list[dict]:
        items = []
        org_id = user.org_id
        if not org_id:
            return items
        today = date.today()

        # 1. Reports due — pull all open reports with due_date
        from app.models.report import Report as _Report
        open_reports = (
            _Report.query
            .filter(_Report.submitted_by_org_id == org_id)
            .filter(_Report.status.in_(['draft', 'revision_requested']))
            .all()
        )
        for r in open_reports:
            if not r.due_date:
                continue
            due_in = (r.due_date - today).days
            severity = (
                'critical' if due_in < 0 else
                'major' if due_in <= 3 else
                'minor' if due_in <= 14 else
                'info'
            )
            label = (
                f'Report overdue by {-due_in} day{"" if -due_in == 1 else "s"}'
                if due_in < 0 else
                f'Report due in {due_in} day{"" if due_in == 1 else "s"}'
                if due_in > 0 else 'Report due today'
            )
            items.append({
                'kind': 'deadline',
                'severity': severity,
                'icon': 'clock' if due_in >= 0 else 'alert-triangle',
                'label': label,
                'detail': (r.title or r.report_type or 'Progress report') + (
                    f' · {r.grant.title}' if r.grant else ''
                ),
                'count': 1,
                'due_in_days': due_in,
                'href': f'/reports',
                'cta_label': 'Open report',
            })

        # 2. Trust Profile gaps (incomplete diligence components reduce funding readiness)
        # Look at latest registration verification + adverse media
        latest_reg = (
            RegistrationVerification.query
            .filter_by(org_id=org_id)
            .order_by(RegistrationVerification.updated_at.desc())
            .first()
        )
        if latest_reg is None:
            items.append({
                'kind': 'compliance',
                'severity': 'major',
                'icon': 'shield',
                'label': 'Registration not verified',
                'detail': 'Donors look for verified registration first. Submit your registration certificate.',
                'count': 1,
                'due_in_days': None,
                'href': '/trust',
                'cta_label': 'Verify registration',
            })
        elif latest_reg.expiry_date and (latest_reg.expiry_date - today).days <= 30:
            days_left = (latest_reg.expiry_date - today).days
            items.append({
                'kind': 'compliance',
                'severity': 'critical' if days_left < 0 else 'major',
                'icon': 'shield',
                'label': (f'Registration expired {-days_left}d ago'
                          if days_left < 0 else
                          f'Registration expires in {days_left}d'),
                'detail': 'Renew before applying to new grants.',
                'count': 1,
                'due_in_days': days_left,
                'href': '/trust',
                'cta_label': 'Renew',
            })

        # Adverse media never run = donors will flag
        latest_am = (
            AdverseMediaScreening.query
            .filter_by(org_id=org_id)
            .order_by(AdverseMediaScreening.screened_at.desc())
            .first()
        )
        if latest_am is None:
            items.append({
                'kind': 'screening',
                'severity': 'minor',
                'icon': 'shield',
                'label': 'Adverse media never screened',
                'detail': 'Run a screening so your Trust Profile is complete before publishing your Passport.',
                'count': 1,
                'due_in_days': None,
                'href': '/trust',
                'cta_label': 'Run screening',
            })

        # 3. Assessments incomplete
        completed_assessments = (
            Assessment.query
            .filter_by(org_id=org_id, status='completed')
            .count()
        )
        if completed_assessments == 0:
            items.append({
                'kind': 'profile',
                'severity': 'major',
                'icon': 'sparkle',
                'label': 'Complete your first capacity assessment',
                'detail': 'Unlock matching grants and pre-fill applications faster.',
                'count': 1,
                'due_in_days': None,
                'href': '/assessments',
                'cta_label': 'Start assessment',
            })
        elif completed_assessments < 5:
            items.append({
                'kind': 'profile',
                'severity': 'minor',
                'icon': 'sparkle',
                'label': f'{5 - completed_assessments} more framework{"" if 5 - completed_assessments == 1 else "s"} to passport',
                'detail': 'A full 5-framework passport is recognised by more donors.',
                'count': 5 - completed_assessments,
                'due_in_days': None,
                'href': '/assessments',
                'cta_label': 'Continue',
            })

        # 4. Application drafts — gentle nudge
        draft_apps = (
            Application.query
            .filter(Application.ngo_org_id == org_id, Application.status == 'draft')
            .count()
        )
        if draft_apps > 0:
            items.append({
                'kind': 'deadline',
                'severity': 'minor',
                'icon': 'file-text',
                'label': f'{draft_apps} application draft{"" if draft_apps == 1 else "s"} in progress',
                'detail': 'Finish or archive them so they don\'t miss their grant deadline.',
                'count': draft_apps,
                'due_in_days': None,
                'href': '/applications',
                'cta_label': 'Open drafts',
            })

        # 5. Capacity Passport stale (>180 days)
        active_passport = (
            CapacityPassport.query
            .filter_by(org_id=org_id, status='active')
            .first()
        )
        if active_passport and active_passport.published_at:
            pub = active_passport.published_at
            if pub.tzinfo is None:
                pub = pub.replace(tzinfo=timezone.utc)
            age_days = (datetime.now(timezone.utc) - pub).days
            if age_days > 180:
                items.append({
                    'kind': 'profile',
                    'severity': 'minor',
                    'icon': 'award',
                    'label': f'Passport published {age_days // 30}mo ago',
                    'detail': 'Re-publish so donors see fresh evidence.',
                    'count': 1,
                    'due_in_days': None,
                    'href': '/trust',
                    'cta_label': 'Re-publish',
                })

        # 6. Open grants opportunity (only if few applications)
        total_apps = Application.query.filter_by(ngo_org_id=org_id).count()
        if total_apps < 5:
            open_grants_count = Grant.query.filter_by(status='open').count()
            if open_grants_count > 0:
                items.append({
                    'kind': 'opportunity',
                    'severity': 'info',
                    'icon': 'compass',
                    'label': f'{open_grants_count} open grant{"" if open_grants_count == 1 else "s"} to explore',
                    'detail': 'Filtered to ones matching your sector and country.',
                    'count': open_grants_count,
                    'due_in_days': None,
                    'href': '/grants',
                    'cta_label': 'Browse grants',
                })

        return items

    # ------------------------------------------------------------------
    # Donor items
    # ------------------------------------------------------------------

    @classmethod
    def _donor_items(cls, user) -> list[dict]:
        items = []
        org_id = user.org_id
        if not org_id:
            return items
        today = date.today()

        # 1. Applications pending review
        pending_apps = (
            db.session.query(func.count(Application.id))
            .join(Grant)
            .filter(Grant.donor_org_id == org_id)
            .filter(Application.status.in_(['submitted', 'under_review']))
            .scalar() or 0
        )
        if pending_apps > 0:
            items.append({
                'kind': 'review',
                'severity': 'major' if pending_apps >= 5 else 'minor',
                'icon': 'clipboard-check',
                'label': f'{pending_apps} application{"" if pending_apps == 1 else "s"} awaiting review',
                'detail': 'Reviewers may be waiting on your sign-off, too.',
                'count': pending_apps,
                'due_in_days': None,
                'href': '/applications?status=submitted',
                'cta_label': 'Review now',
            })

        # 2. Reports awaiting decision
        submitted_reports = (
            db.session.query(func.count(Report.id))
            .join(Grant)
            .filter(Grant.donor_org_id == org_id, Report.status == 'submitted')
            .scalar() or 0
        )
        if submitted_reports > 0:
            items.append({
                'kind': 'review',
                'severity': 'major' if submitted_reports >= 3 else 'minor',
                'icon': 'file-text',
                'label': f'{submitted_reports} report{"" if submitted_reports == 1 else "s"} submitted, awaiting your decision',
                'detail': 'Accept, request revision, or flag.',
                'count': submitted_reports,
                'due_in_days': None,
                'href': '/reports',
                'cta_label': 'Open reports',
            })

        # 3. Grants with deadlines this week
        cutoff = today + timedelta(days=7)
        deadline_grants = Grant.query.filter(
            Grant.donor_org_id == org_id,
            Grant.status == 'open',
            Grant.deadline.isnot(None),
            Grant.deadline >= today,
            Grant.deadline <= cutoff,
        ).all()
        for g in deadline_grants[:3]:
            due_in = (g.deadline - today).days if g.deadline else None
            items.append({
                'kind': 'deadline',
                'severity': 'major' if (due_in or 99) <= 2 else 'minor',
                'icon': 'clock',
                'label': f'{g.title} closes in {due_in}d',
                'detail': 'Last call to invite NGOs you want to apply.',
                'count': 1,
                'due_in_days': due_in,
                'href': f'/grants/{g.id}',
                'cta_label': 'Open grant',
            })

        # 4. Org screenings expiring (registration of any active grantee)
        from datetime import timedelta as _td
        expiring = (
            RegistrationVerification.query
            .filter(
                RegistrationVerification.expiry_date.isnot(None),
                RegistrationVerification.expiry_date <= today + _td(days=30),
            )
            .limit(3).all()
        )
        if expiring:
            items.append({
                'kind': 'screening',
                'severity': 'minor',
                'icon': 'shield',
                'label': f'{len(expiring)} grantee registration{"" if len(expiring) == 1 else "s"} expiring',
                'detail': 'Check the expiring registrations queue.',
                'count': len(expiring),
                'due_in_days': None,
                'href': '/verification',
                'cta_label': 'Review queue',
            })

        # 5. Newly-flagged adverse media (high-severity in last 14 days)
        recent_cut = datetime.now(timezone.utc) - timedelta(days=14)
        recent_am = AdverseMediaScreening.query.filter(
            AdverseMediaScreening.screened_at >= recent_cut,
            AdverseMediaScreening.status == 'flagged',
        ).count()
        if recent_am:
            items.append({
                'kind': 'screening',
                'severity': 'major',
                'icon': 'newspaper',
                'label': f'{recent_am} new adverse media flag{"" if recent_am == 1 else "s"}',
                'detail': 'Review before approving disbursements.',
                'count': recent_am,
                'due_in_days': None,
                'href': '/compliance',
                'cta_label': 'Open compliance',
            })

        # 6. Trust Profile not yet built for an active grantee
        active_ngo_ids = (
            db.session.query(Application.ngo_org_id)
            .join(Grant)
            .filter(Grant.donor_org_id == org_id)
            .filter(Application.status == 'awarded')
            .distinct().all()
        )
        active_ngo_ids = [oid for (oid,) in active_ngo_ids if oid]
        if active_ngo_ids:
            unscreened = (
                Organization.query
                .filter(Organization.id.in_(active_ngo_ids))
                .filter(~Organization.adverse_media_screenings.any())
                .count()
            )
            if unscreened:
                items.append({
                    'kind': 'screening',
                    'severity': 'minor',
                    'icon': 'shield',
                    'label': f'{unscreened} active grantee{"" if unscreened == 1 else "s"} not yet screened',
                    'detail': 'Run adverse media + bank verification for completeness.',
                    'count': unscreened,
                    'due_in_days': None,
                    'href': '/trust',
                    'cta_label': 'Open Trust',
                })

        return items

    # ------------------------------------------------------------------
    # Reviewer items
    # ------------------------------------------------------------------

    @classmethod
    def _reviewer_items(cls, user) -> list[dict]:
        items = []
        user_id = user.id
        now = datetime.now(timezone.utc)

        # 1. Assignments by status
        assigned = Review.query.filter_by(reviewer_user_id=user_id, status='assigned').count()
        in_progress = Review.query.filter_by(reviewer_user_id=user_id, status='in_progress').count()
        if assigned > 0:
            items.append({
                'kind': 'review',
                'severity': 'major' if assigned >= 3 else 'minor',
                'icon': 'clipboard',
                'label': f'{assigned} new assignment{"" if assigned == 1 else "s"} waiting',
                'detail': 'Tap to start scoring.',
                'count': assigned,
                'due_in_days': None,
                'href': '/reviews',
                'cta_label': 'Start reviewing',
            })
        if in_progress > 0:
            items.append({
                'kind': 'review',
                'severity': 'minor',
                'icon': 'edit',
                'label': f'{in_progress} review{"" if in_progress == 1 else "s"} in progress',
                'detail': 'Finish what you started so others see consensus.',
                'count': in_progress,
                'due_in_days': None,
                'href': '/reviews',
                'cta_label': 'Open queue',
            })

        # 2. Stale reviews (>7d in queue)
        stale_cut = now - timedelta(days=7)
        stale = Review.query.filter(
            Review.reviewer_user_id == user_id,
            Review.status.in_(['assigned', 'in_progress']),
            Review.created_at < stale_cut,
        ).count()
        if stale > 0:
            items.append({
                'kind': 'deadline',
                'severity': 'major',
                'icon': 'alert-triangle',
                'label': f'{stale} review{"" if stale == 1 else "s"} 7+ days in your queue',
                'detail': 'Long wait times hurt application velocity. Aim for under 7 days.',
                'count': stale,
                'due_in_days': None,
                'href': '/reviews',
                'cta_label': 'Clear backlog',
            })

        return items

    # ------------------------------------------------------------------
    # Admin items
    # ------------------------------------------------------------------

    @classmethod
    def _admin_items(cls, user) -> list[dict]:
        items = []
        today = date.today()

        # 1. Registrations expiring soon (all orgs)
        from datetime import timedelta as _td
        expiring_30 = RegistrationVerification.query.filter(
            RegistrationVerification.expiry_date.isnot(None),
            RegistrationVerification.expiry_date <= today + _td(days=30),
            RegistrationVerification.expiry_date >= today,
        ).count()
        expired = RegistrationVerification.query.filter(
            RegistrationVerification.expiry_date.isnot(None),
            RegistrationVerification.expiry_date < today,
        ).count()
        if expired > 0:
            items.append({
                'kind': 'compliance',
                'severity': 'critical',
                'icon': 'shield',
                'label': f'{expired} registration{"" if expired == 1 else "s"} expired',
                'detail': 'Block new applications from these orgs until renewed.',
                'count': expired,
                'due_in_days': -1,
                'href': '/verification',
                'cta_label': 'Open queue',
            })
        if expiring_30 > 0:
            items.append({
                'kind': 'compliance',
                'severity': 'major',
                'icon': 'shield',
                'label': f'{expiring_30} registration{"" if expiring_30 == 1 else "s"} expire within 30d',
                'detail': 'Send reminders to grantees.',
                'count': expiring_30,
                'due_in_days': 30,
                'href': '/verification',
                'cta_label': 'Open queue',
            })

        # 2. Flagged sanctions (any org)
        flagged_san = ComplianceCheck.query.filter(
            ComplianceCheck.status == 'flagged',
            ComplianceCheck.check_type.in_([
                'sanctions_un', 'sanctions_ofac', 'sanctions_eu', 'blacklist'
            ]),
        ).count()
        if flagged_san:
            items.append({
                'kind': 'screening',
                'severity': 'critical',
                'icon': 'shield',
                'label': f'{flagged_san} active sanctions flag{"" if flagged_san == 1 else "s"}',
                'detail': 'Each requires triage — false positives are common.',
                'count': flagged_san,
                'due_in_days': None,
                'href': '/compliance',
                'cta_label': 'Triage',
            })

        # 3. Orgs never screened for adverse media
        ngo_orgs = Organization.query.filter(~Organization.org_type.in_(['donor', 'reviewer'])).count()
        am_screened = db.session.query(AdverseMediaScreening.org_id).distinct().count()
        unscreened = ngo_orgs - am_screened
        if unscreened > 0:
            items.append({
                'kind': 'screening',
                'severity': 'minor',
                'icon': 'newspaper',
                'label': f'{unscreened} org{"" if unscreened == 1 else "s"} never adverse-media screened',
                'detail': 'The rescreening cron will catch them on the next run.',
                'count': unscreened,
                'due_in_days': None,
                'href': '/verification',
                'cta_label': 'View orgs',
            })

        return items
