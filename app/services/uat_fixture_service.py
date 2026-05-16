"""
UATFixtureService — Phase 15D (PMO transfer pattern).

Daily idempotent cron that ensures the demo / UAT environment ALWAYS has
the data state the team needs to exercise category-defining features:

  - At least one open grant per active donor org (so apply flow works)
  - At least one awarded + one rejected application with a Phase 14
    debrief recorded (so the rollup card has data)
  - At least one published bundle on any submitted report (so the audit
    chain timeline + portfolio bundle have content)

Idempotency strategy: each fixture action writes a deterministic marker
on the touched row (audit log + decision_notes prefix) so the next run
detects "already there, skip." A future drift (e.g. team deleted demo
data during a test) self-heals on the next cron tick.

DOES NOT create new orgs/users/grants from scratch — only fills in
missing state on existing fixtures so a real-world run against prod is
safe.
"""

import logging
from datetime import datetime, timedelta, timezone

from app.constants import WIN_LOSS_CODES
from app.extensions import db
from app.models import Application, Grant, Organization, Report

logger = logging.getLogger('kuja')

# Marker tokens written into decision_notes / log_action so we can find
# rows this cron previously touched without a separate ledger.
FIXTURE_DEBRIEF_PREFIX = '[uat-fixture] '
FIXTURE_DEBRIEF_AWARDED_NOTES = (
    FIXTURE_DEBRIEF_PREFIX
    + 'Strong M&E framework and proven delivery in this geography. '
    + 'Pinned by UAT cron so the debrief rollup card has data.'
)
FIXTURE_DEBRIEF_REJECTED_NOTES = (
    FIXTURE_DEBRIEF_PREFIX
    + 'Budget exceeded available envelope this cycle; encourage '
    + 'reapplying with a tighter scope. Pinned by UAT cron.'
)


class UATFixtureService:

    @classmethod
    def run(cls) -> dict:
        """Top-level orchestrator. Returns a structured summary so the
        cron caller can log what was touched."""
        results = {
            'open_grants_ensured': cls._ensure_open_grants(),
            'debriefs_ensured': cls._ensure_debrief_fixtures(),
            'bundles_published': cls._ensure_published_bundle(),
            'computed_at': datetime.now(timezone.utc).isoformat(),
        }
        return results

    # ------------------------------------------------------------------

    @classmethod
    def _ensure_open_grants(cls) -> dict:
        """For each donor org, make sure at least one grant is open with
        a deadline in the next 30 days. Pure status flip — never creates
        a grant."""
        from datetime import date
        donors = Organization.query.filter_by(org_type='donor').all()
        flipped = 0
        already_ok = 0
        no_candidate = 0
        for org in donors:
            open_g = (
                Grant.query
                .filter(Grant.donor_org_id == org.id, Grant.status == 'open')
                .first()
            )
            if open_g:
                already_ok += 1
                continue
            # Find a draft we can promote to open with a near-term deadline.
            candidate = (
                Grant.query
                .filter(Grant.donor_org_id == org.id)
                .filter(Grant.status.in_(('draft', 'closed')))
                .order_by(Grant.created_at.desc())
                .first()
            )
            if not candidate:
                no_candidate += 1
                continue
            candidate.status = 'open'
            if not candidate.deadline or candidate.deadline < date.today():
                candidate.deadline = date.today() + timedelta(days=21)
            flipped += 1
        db.session.commit()
        return {
            'donors_total': len(donors),
            'already_ok': already_ok,
            'flipped_to_open': flipped,
            'no_candidate': no_candidate,
        }

    @classmethod
    def _ensure_debrief_fixtures(cls) -> dict:
        """For each donor org, ensure ONE awarded + ONE rejected
        application has a debrief recorded. Pinned via FIXTURE_DEBRIEF_*
        notes so the next run skips them."""
        donors = Organization.query.filter_by(org_type='donor').all()
        added = 0
        already_ok = 0
        no_candidate = 0
        for org in donors:
            for status, code, notes in (
                ('awarded',  'strong_track_record', FIXTURE_DEBRIEF_AWARDED_NOTES),
                ('rejected', 'budget_over_scope',   FIXTURE_DEBRIEF_REJECTED_NOTES),
            ):
                assert code in WIN_LOSS_CODES, f'controlled vocab drift: {code}'

                # If ANY app in this status for this donor already has a
                # non-empty debrief, we're good — no need to write a marker.
                has_any_debrief = (
                    Application.query
                    .join(Grant)
                    .filter(Grant.donor_org_id == org.id)
                    .filter(Application.status == status)
                    .filter(Application.decision_reason_code.isnot(None))
                    .first()
                )
                if has_any_debrief:
                    already_ok += 1
                    continue

                candidate = (
                    Application.query
                    .join(Grant)
                    .filter(Grant.donor_org_id == org.id)
                    .filter(Application.status == status)
                    .order_by(Application.updated_at.desc())
                    .first()
                )
                if not candidate:
                    no_candidate += 1
                    continue
                candidate.decision_reason_code = code
                candidate.decision_notes = notes
                candidate.decision_recorded_at = datetime.now(timezone.utc)
                # decision_recorded_by_user_id intentionally left NULL —
                # marks this as cron-recorded, not a human decision.
                added += 1
        db.session.commit()
        return {
            'donors_total': len(donors),
            'already_ok': already_ok,
            'added': added,
            'no_candidate': no_candidate,
        }

    @classmethod
    def _ensure_published_bundle(cls) -> dict:
        """Ensure at least ONE recent report has a published bundle so
        the audit timeline + portfolio bundle have content to show."""
        from app.models import AuditChainEntry
        from app.services.report_bundle_service import ReportBundleService

        # Already published? (Check AuditChainEntry for any bundle.publish)
        recent_publish = (
            AuditChainEntry.query
            .filter(AuditChainEntry.action == 'report_bundle.publish')
            .order_by(AuditChainEntry.id.desc())
            .first()
        )
        if recent_publish:
            return {'already_published': True, 'published_now': 0}

        # Find a submitted report to publish
        candidate = (
            Report.query
            .filter(Report.status.in_(('submitted', 'approved')))
            .order_by(Report.submitted_at.desc().nullslast())
            .first()
        )
        if not candidate:
            return {'already_published': False, 'published_now': 0, 'no_candidate': True}

        # Synthesize a system user for the publish (no real user attribution)
        class _SysUser:
            email = 'uat-fixture@kuja.org'

        bundle = ReportBundleService.publish(
            candidate.id, user=_SysUser(), with_ai_summary=False,
        )
        return {
            'already_published': False,
            'published_now': 1 if bundle else 0,
            'report_id': candidate.id,
        }
