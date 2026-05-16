"""
ApplyUnpackService — Phase 12 (May 2026).

Takes the structured output of GrantAgreementUnpackService and turns it
into live entities the NGO/donor can act on:

  - reporting_obligations  → Report rows with due_date pre-set (draft status)
  - conditions             → StatusSignal rows on the grant (kind=risk for
                             'critical' severity, kind=decision for the rest)
  - key_dates              → not directly stored; surfaced via /api/calendar
                             once the Report stubs land (they pull from
                             Report.due_date)

Returns a summary of what was created. Idempotent-ish: skips creating a
new Report stub if one already exists with the same (grant_id, org_id,
report_type, due_date). Skips a StatusSignal if a row with the same body
already exists for the entity.

Each apply event writes one row to AuditChainEntry so the action is
provable later.
"""

import logging
from datetime import date, datetime, timedelta, timezone

from app.extensions import db
from app.models import (
    Application, Grant, Organization, Report, StatusSignal, AuditChainEntry,
)

logger = logging.getLogger('kuja')


# Map unpack's frequency vocabulary to days-per-period for stub generation
FREQUENCY_DAYS = {
    'monthly':    30,
    'quarterly':  90,
    'semi_annual': 182,
    'annual':     365,
    'final_only': 0,
    'one_time':   0,
}


class ApplyUnpackService:

    MAX_STUBS_PER_OBLIGATION = 4   # cap how many forward periods we pre-create

    @classmethod
    def apply(
        cls,
        *,
        grant_id: int,
        org_id: int | None,
        unpack: dict,
        user,
        include_reports: bool = True,
        include_conditions: bool = True,
    ) -> dict:
        """Apply the structured unpack to live entities for one (grant, org)
        pair. org_id is the org whose Reports get created; None means we'll
        infer from the user's authenticated org (if NGO) or default to the
        grant's first awarded grantee.

        Returns:
          {
            'grant_id': int,
            'org_id': int | None,
            'reports_created': [Report.id, ...],
            'reports_skipped': int,
            'signals_created': [StatusSignal.id, ...],
            'signals_skipped': int,
            'audit_seq': int | null,
            'applied_at': iso,
          }
        """
        grant = db.session.get(Grant, grant_id)
        if not grant:
            return cls._empty(grant_id, org_id, reason='grant_not_found')

        # Resolve org_id if not explicit
        if not org_id:
            if getattr(user, 'role', None) == 'ngo' and getattr(user, 'org_id', None):
                org_id = user.org_id
            else:
                # Fall back to the first awarded application's org
                awarded = (
                    Application.query.filter_by(grant_id=grant_id, status='awarded')
                    .first()
                )
                org_id = awarded.ngo_org_id if awarded else None

        if not org_id:
            return cls._empty(grant_id, None, reason='no_org_scope')

        org = db.session.get(Organization, org_id)
        if not org:
            return cls._empty(grant_id, org_id, reason='org_not_found')

        # Find an Application to link Reports to (preferred: awarded; fallback: any submitted)
        app = (
            Application.query.filter_by(grant_id=grant_id, ngo_org_id=org_id)
            .order_by(
                # awarded first, then submitted, then drafts
                db.case(
                    (Application.status == 'awarded', 0),
                    (Application.status == 'submitted', 1),
                    (Application.status == 'scored', 2),
                    else_=3,
                ),
                Application.updated_at.desc(),
            ).first()
        )
        application_id = app.id if app else None

        reports_created = []
        reports_skipped = 0
        signals_created = []
        signals_skipped = 0

        # ---- Apply reporting_obligations → Report stubs ----
        if include_reports:
            today = date.today()
            for ob in (unpack.get('reporting_obligations') or []):
                if not isinstance(ob, dict):
                    continue
                stub_dates = cls._project_due_dates(
                    obligation=ob, today=today,
                    grant_end=cls._grant_end_date(grant),
                )
                report_type = (ob.get('type') or 'progress').strip().lower()
                title_base = (ob.get('title') or 'Report').strip()[:480]

                for stub_date in stub_dates:
                    if cls._duplicate_report_exists(
                        org_id=org_id, grant_id=grant_id,
                        report_type=report_type, due_date=stub_date,
                    ):
                        reports_skipped += 1
                        continue
                    r = Report(
                        grant_id=grant_id,
                        application_id=application_id,
                        submitted_by_org_id=org_id,
                        report_type=report_type,
                        reporting_period=cls._period_label(stub_date, ob.get('frequency')),
                        title=title_base,
                        due_date=stub_date,
                        status='draft',
                    )
                    db.session.add(r)
                    db.session.flush()    # populate r.id without committing
                    reports_created.append(r.id)

        # ---- Apply conditions → StatusSignal rows on the GRANT ----
        if include_conditions:
            for cond in (unpack.get('conditions') or []):
                if not isinstance(cond, dict):
                    continue
                body = ((cond.get('title') or '').strip()
                        + (': ' + cond.get('description', '').strip() if cond.get('description') else ''))
                body = body[:500]
                if not body:
                    continue
                severity = (cond.get('severity') or 'medium').lower()
                signal_kind = 'risk' if severity in ('critical', 'major') else 'decision'

                if cls._duplicate_signal_exists(
                    entity_kind='grant', entity_id=grant_id, kind=signal_kind, body=body,
                ):
                    signals_skipped += 1
                    continue
                s = StatusSignal(
                    entity_kind='grant',
                    entity_id=grant_id,
                    kind=signal_kind,
                    body=body,
                    status='open',
                    created_by_user_id=getattr(user, 'id', None),
                )
                db.session.add(s)
                db.session.flush()
                signals_created.append(s.id)

        db.session.commit()

        # ---- Audit chain anchor (single row covering this apply event) ----
        audit_entry = None
        try:
            audit_entry = AuditChainEntry.append(
                action='grant_agreement.apply_unpack',
                actor_email=getattr(user, 'email', None),
                subject_kind='grant',
                subject_id=grant_id,
                details={
                    'org_id': org_id,
                    'application_id': application_id,
                    'reports_created': reports_created,
                    'reports_skipped': reports_skipped,
                    'signals_created': signals_created,
                    'signals_skipped': signals_skipped,
                    'reporting_obligation_count': len(unpack.get('reporting_obligations') or []),
                    'condition_count': len(unpack.get('conditions') or []),
                },
            )
        except Exception as e:
            logger.warning(f"audit chain append failed for apply_unpack: {e}")

        return {
            'grant_id': grant_id,
            'org_id': org_id,
            'application_id': application_id,
            'reports_created': reports_created,
            'reports_skipped': reports_skipped,
            'signals_created': signals_created,
            'signals_skipped': signals_skipped,
            'audit_seq': (audit_entry.seq if audit_entry else None),
            'applied_at': datetime.now(timezone.utc).isoformat(),
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @classmethod
    def _project_due_dates(
        cls, *, obligation: dict, today: date, grant_end: date | None,
    ) -> list[date]:
        """Project N forward due-dates for this obligation.

        Strategy:
          - If first_due_date is provided + valid → use it as the first stub.
          - Else if frequency is final_only/one_time → single stub at grant_end (or today+180).
          - Else → start at today + (90 if quarterly, 30 if monthly, ...).
          - Generate up to MAX_STUBS_PER_OBLIGATION stubs spaced by FREQUENCY_DAYS,
            stopping at grant_end (or +24 months from today if unknown).
        """
        first_str = (obligation.get('first_due_date') or '').strip()
        frequency = (obligation.get('frequency') or 'quarterly').lower()
        period_days = FREQUENCY_DAYS.get(frequency, 90)

        first_date = None
        if first_str:
            try:
                first_date = date.fromisoformat(first_str[:10])
            except Exception:
                first_date = None

        if first_date is None:
            # Final-only or one-time → single stub at grant_end or +180d
            if period_days == 0:
                first_date = grant_end or (today + timedelta(days=180))
            else:
                days_after = obligation.get('days_after_period') or 30
                first_date = today + timedelta(days=period_days + days_after)

        # Don't generate dates in the past
        if first_date < today:
            first_date = today + timedelta(days=14)

        horizon_end = grant_end or (today + timedelta(days=24 * 30))

        if period_days == 0:
            return [first_date] if first_date <= horizon_end else []

        stubs: list[date] = []
        cur = first_date
        for _ in range(cls.MAX_STUBS_PER_OBLIGATION):
            if cur > horizon_end:
                break
            stubs.append(cur)
            cur = cur + timedelta(days=period_days)
        return stubs

    @staticmethod
    def _grant_end_date(grant: Grant) -> date | None:
        """Best-effort: look for an end_date / deadline."""
        for attr in ('end_date', 'closing_date', 'deadline'):
            v = getattr(grant, attr, None)
            if v:
                try:
                    if hasattr(v, 'date'):
                        return v.date()
                    return v
                except Exception:
                    continue
        return None

    @staticmethod
    def _period_label(due: date, frequency: str | None) -> str:
        f = (frequency or '').lower()
        if f == 'monthly':
            return due.strftime('%b %Y')
        if f == 'quarterly':
            q = (due.month - 1) // 3 + 1
            return f'Q{q} {due.year}'
        if f == 'semi_annual':
            half = 'H1' if due.month <= 6 else 'H2'
            return f'{half} {due.year}'
        if f == 'annual':
            return str(due.year)
        return due.isoformat()

    @staticmethod
    def _duplicate_report_exists(*, org_id, grant_id, report_type, due_date) -> bool:
        return Report.query.filter_by(
            submitted_by_org_id=org_id, grant_id=grant_id,
            report_type=report_type, due_date=due_date,
        ).first() is not None

    @staticmethod
    def _duplicate_signal_exists(*, entity_kind, entity_id, kind, body) -> bool:
        # Exact body match is good enough for idempotency on apply re-runs
        return StatusSignal.query.filter_by(
            entity_kind=entity_kind, entity_id=entity_id, kind=kind, body=body,
        ).first() is not None

    @staticmethod
    def _empty(grant_id: int | None, org_id: int | None, reason: str) -> dict:
        return {
            'grant_id': grant_id, 'org_id': org_id,
            'application_id': None,
            'reports_created': [], 'reports_skipped': 0,
            'signals_created': [], 'signals_skipped': 0,
            'audit_seq': None, 'applied_at': datetime.now(timezone.utc).isoformat(),
            'note': reason,
        }
