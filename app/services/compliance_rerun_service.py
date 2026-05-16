"""
ComplianceRerunService — Phase 22C (May 2026).

Daily cron picks NGOs whose adverse-media screening is older than
`STALE_AFTER_DAYS` (default 90) and re-runs them. Operational
must-have: without this, screenings drift stale silently.

Discipline:
  - Idempotent: skips orgs that have a screening newer than threshold
  - Cost-bounded: caps MAX_PER_RUN orgs per cron tick (avoids cost
    spikes if a backlog accumulates)
  - Best-effort: any one org's failure doesn't abort the rest
  - Cost-tagged: each AdverseMediaService.screen() call records via
    AI budget service (cost gate already enforced upstream)

Returns a structured report so the cron caller can log drift.
"""

import logging
from datetime import datetime, timedelta, timezone

from app.extensions import db
from app.models import AdverseMediaScreening, Organization

logger = logging.getLogger('kuja')

STALE_AFTER_DAYS = 90
MAX_PER_RUN = 25


class ComplianceRerunService:

    @classmethod
    def run(cls) -> dict:
        cutoff = datetime.now(timezone.utc) - timedelta(days=STALE_AFTER_DAYS)

        # NGOs only — donors don't get screened
        ngos = Organization.query.filter(
            Organization.org_type == 'ngo'
        ).all()

        ran = 0
        skipped_fresh = 0
        skipped_capacity = 0
        errors = []

        for org in ngos:
            if ran >= MAX_PER_RUN:
                skipped_capacity += 1
                continue

            latest = (
                AdverseMediaScreening.query
                .filter(AdverseMediaScreening.org_id == org.id)
                .order_by(AdverseMediaScreening.screened_at.desc())
                .first()
            )
            if latest and latest.screened_at:
                ts = (
                    latest.screened_at
                    if latest.screened_at.tzinfo
                    else latest.screened_at.replace(tzinfo=timezone.utc)
                )
                if ts >= cutoff:
                    skipped_fresh += 1
                    continue

            try:
                from app.services.adverse_media_service import AdverseMediaService
                import json as _json
                result = AdverseMediaService.screen(
                    org_name=org.name,
                    country=org.country,
                    sector=None,
                    leadership=None,
                )
                # Counts live in summary_json; status + source are columns.
                summary = {
                    'high_count': result.get('high_count') or 0,
                    'medium_count': result.get('medium_count') or 0,
                    'low_count': result.get('low_count') or 0,
                    'overall_status': result.get('status') or 'review',
                }
                row = AdverseMediaScreening(
                    org_id=org.id,
                    status=result.get('status') or 'review',
                    source=result.get('source') or 'unknown',
                    lookback_months=result.get('lookback_months') or 24,
                )
                if hasattr(row, 'set_findings'):
                    row.set_findings(result.get('findings') or [])
                else:
                    row.findings_json = _json.dumps(result.get('findings') or [])
                if hasattr(row, 'set_subjects'):
                    row.set_subjects(result.get('subjects') or [])
                else:
                    row.subjects_json = _json.dumps(result.get('subjects') or [])
                if hasattr(row, 'set_summary'):
                    row.set_summary(summary)
                else:
                    row.summary_json = _json.dumps(summary)
                db.session.add(row)
                db.session.commit()
                ran += 1
                logger.info(
                    f"compliance rerun org={org.id} status={row.status} "
                    f"h={summary['high_count']} m={summary['medium_count']} l={summary['low_count']}"
                )
            except Exception as e:
                db.session.rollback()
                errors.append({'org_id': org.id, 'error': str(e)[:200]})
                logger.warning(f'compliance rerun failed org={org.id}: {e}')

        return {
            'ok': True,
            'ngos_total': len(ngos),
            'reran': ran,
            'skipped_fresh': skipped_fresh,
            'skipped_capacity': skipped_capacity,
            'errors': errors,
            'cap_per_run': MAX_PER_RUN,
            'stale_after_days': STALE_AFTER_DAYS,
            'computed_at': datetime.now(timezone.utc).isoformat(),
        }
