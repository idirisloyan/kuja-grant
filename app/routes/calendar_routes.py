"""
Calendar routes — Phase 3 (May 2026).

Cross-entity unified deadline view. One endpoint returns every relevant
date the current user should care about, across all donors / NGOs they're
connected to, with a single shape.

Returns events in a flat list — the frontend bins them by week / day.

Event kinds:
  - grant_deadline       — application deadline for a grant (NGO sees open grants;
                           donor sees own grants)
  - report_due           — a reporting period due date (NGO sees own; donor sees
                           any submitted to their grants)
  - registration_expiry  — a registration verification's expiry (donor + admin)
  - passport_expiry      — capacity passport expiry (NGO + admin)
  - screening_due        — adverse media or sanctions screening expected refresh
                           (compliance heuristic; not yet exposed)
"""

import io
import logging
import re
from datetime import date, datetime, timedelta, timezone

from flask import Blueprint, jsonify, request, send_file
from flask_login import login_required, current_user

from app.extensions import db
from app.models import (
    Organization, Grant, Application, Report, RegistrationVerification,
    CapacityPassport, AdverseMediaScreening,
)

logger = logging.getLogger('kuja')

calendar_bp = Blueprint('calendar', __name__, url_prefix='/api/calendar')


def _push(events, *, date_obj, kind, severity, label, detail, href, entity_id=None):
    if not date_obj:
        return
    if isinstance(date_obj, datetime):
        date_obj = date_obj.date()
    events.append({
        'date': date_obj.isoformat(),
        'kind': kind,
        'severity': severity,
        'label': label,
        'detail': detail,
        'href': href,
        'entity_id': entity_id,
    })


def _build_calendar_payload(user, days: int, past_days: int) -> dict:
    """Shared logic between the JSON endpoint and the PDF export route.

    Returns a dict with `events` (list) + window dates so callers can
    render to JSON or to a PDF without re-querying.
    """
    today = date.today()
    window_start = today - timedelta(days=past_days)
    window_end = today + timedelta(days=days)
    events: list[dict] = []

    role = user.role
    org_id = user.org_id

    # ---- NGO: own grant deadlines (open), own report due dates, own passport
    if role == 'ngo' and org_id:
        # Open grants the NGO might apply to
        open_grants = Grant.query.filter(
            Grant.status == 'open',
            Grant.deadline.isnot(None),
            Grant.deadline >= today,
            Grant.deadline <= window_end,
        ).limit(50).all()
        for g in open_grants:
            days_to = (g.deadline - today).days
            severity = 'high' if days_to <= 3 else 'medium' if days_to <= 14 else 'low'
            _push(events,
                  date_obj=g.deadline, kind='grant_deadline', severity=severity,
                  label=f'{g.title}', detail='Grant application deadline',
                  href=f'/grants/{g.id}', entity_id=g.id)

        # Own report due dates
        own_reports = Report.query.filter(
            Report.submitted_by_org_id == org_id,
            Report.due_date.isnot(None),
            Report.due_date >= window_start,
            Report.due_date <= window_end,
            Report.status.in_(['draft', 'revision_requested', 'submitted']),
        ).all()
        for r in own_reports:
            days_to = (r.due_date - today).days
            severity = 'high' if days_to <= 3 else 'medium' if days_to <= 14 else 'low'
            label = r.title or f'{r.report_type} report'
            grant_title = r.grant.title if r.grant else 'Grant'
            _push(events,
                  date_obj=r.due_date, kind='report_due', severity=severity,
                  label=label, detail=f'{grant_title}',
                  href=f'/reports', entity_id=r.id)

        # Own passport expiry
        passports = CapacityPassport.query.filter_by(org_id=org_id, status='active').all()
        for p in passports:
            if p.expires_at:
                _push(events,
                      date_obj=p.expires_at, kind='passport_expiry', severity='medium',
                      label='Capacity Passport expires', detail='Re-publish to keep evidence fresh.',
                      href='/trust', entity_id=p.id)

    # ---- Donor: own grant deadlines, grantee report dues, grantee registration expiries
    elif role == 'donor' and org_id:
        own_grants = Grant.query.filter(
            Grant.donor_org_id == org_id,
            Grant.deadline.isnot(None),
            Grant.deadline >= window_start,
            Grant.deadline <= window_end,
            Grant.status.in_(['open', 'draft']),
        ).all()
        for g in own_grants:
            days_to = (g.deadline - today).days
            severity = 'high' if days_to <= 3 else 'medium' if days_to <= 14 else 'low'
            _push(events,
                  date_obj=g.deadline, kind='grant_deadline', severity=severity,
                  label=f'{g.title}', detail='Closes — last call for applicants',
                  href=f'/grants/{g.id}', entity_id=g.id)

        # Reports to your grants (any NGO)
        grantee_reports = (
            Report.query
            .join(Grant)
            .filter(Grant.donor_org_id == org_id,
                    Report.due_date.isnot(None),
                    Report.due_date >= window_start,
                    Report.due_date <= window_end,
                    Report.status.in_(['draft', 'submitted', 'revision_requested']))
            .options(db.joinedload(Report.grant), db.joinedload(Report.submitted_by_org))
            .limit(200).all()
        )
        for r in grantee_reports:
            days_to = (r.due_date - today).days
            severity = 'high' if days_to <= 3 else 'medium' if days_to <= 14 else 'low'
            label = r.title or f'{r.report_type} report'
            org_label = r.submitted_by_org.name if r.submitted_by_org else f'org #{r.submitted_by_org_id}'
            _push(events,
                  date_obj=r.due_date, kind='report_due', severity=severity,
                  label=label, detail=f'{org_label} → {r.grant.title if r.grant else "grant"}',
                  href=f'/reports', entity_id=r.id)

        # Registration expiries on grantees
        regs = RegistrationVerification.query.filter(
            RegistrationVerification.expiry_date.isnot(None),
            RegistrationVerification.expiry_date >= window_start,
            RegistrationVerification.expiry_date <= window_end,
        ).all()
        for r in regs:
            days_to = (r.expiry_date - today).days
            severity = 'high' if days_to <= 7 else 'medium' if days_to <= 30 else 'low'
            org = r.organization
            _push(events,
                  date_obj=r.expiry_date, kind='registration_expiry', severity=severity,
                  label=f'{org.name if org else "Org"} registration expires',
                  detail=f'{r.country or r.registration_authority or ""}',
                  href=f'/verification', entity_id=r.id)

    # ---- Reviewer: assignments (reviews) — use their due-soon SLA buckets
    elif role == 'reviewer':
        pass   # reviewers see the queue page directly; no calendar events for now

    # ---- Admin: aggregate everything (sample, capped)
    elif role == 'admin':
        # All open grants closing soon
        open_grants = Grant.query.filter(
            Grant.status == 'open',
            Grant.deadline.isnot(None),
            Grant.deadline >= window_start,
            Grant.deadline <= window_end,
        ).limit(100).all()
        for g in open_grants:
            days_to = (g.deadline - today).days
            severity = 'medium' if days_to <= 14 else 'low'
            _push(events,
                  date_obj=g.deadline, kind='grant_deadline', severity=severity,
                  label=g.title, detail='Open grant closing',
                  href=f'/grants/{g.id}', entity_id=g.id)
        # All registration expiries
        regs = RegistrationVerification.query.filter(
            RegistrationVerification.expiry_date.isnot(None),
            RegistrationVerification.expiry_date >= window_start,
            RegistrationVerification.expiry_date <= window_end,
        ).limit(100).all()
        for r in regs:
            days_to = (r.expiry_date - today).days
            severity = 'high' if days_to <= 7 else 'medium' if days_to <= 30 else 'low'
            org = r.organization
            _push(events,
                  date_obj=r.expiry_date, kind='registration_expiry', severity=severity,
                  label=f'{org.name if org else "Org"} registration', detail='',
                  href=f'/verification', entity_id=r.id)

    # Sort by date ASC
    events.sort(key=lambda e: e['date'])

    return {
        'window_start': window_start,
        'window_end': window_end,
        'today': today,
        'events': events,
    }


@calendar_bp.route('/deadlines', methods=['GET'])
@login_required
def api_calendar_deadlines():
    """Return events for the current user.

    Query params:
      ?days=N    Lookahead window in days; default 60, max 365
      ?past=N    Also include events from the last N days (default 7)
    """
    days = max(7, min(365, int(request.args.get('days', 60))))
    past_days = max(0, min(60, int(request.args.get('past', 7))))
    payload = _build_calendar_payload(current_user, days, past_days)
    return jsonify({
        'success': True,
        'window_start': payload['window_start'].isoformat(),
        'window_end': payload['window_end'].isoformat(),
        'today': payload['today'].isoformat(),
        'events': payload['events'],
    })


@calendar_bp.route('/deadlines.pdf', methods=['GET'])
@login_required
def api_calendar_deadlines_pdf():
    """Download the user's calendar as a printable PDF.

    Same scoping rules as the JSON endpoint. Useful for offline / email
    forwarding / wall-printing in field offices.
    """
    days = max(7, min(365, int(request.args.get('days', 60))))
    past_days = max(0, min(60, int(request.args.get('past', 7))))
    payload = _build_calendar_payload(current_user, days, past_days)

    try:
        from app.services.calendar_pdf_service import build_calendar_pdf
        viewer_name = getattr(current_user, 'name', None) or getattr(current_user, 'email', '') or 'User'
        pdf_bytes = build_calendar_pdf(
            viewer_name=viewer_name,
            viewer_role=current_user.role,
            window_start=payload['window_start'],
            window_end=payload['window_end'],
            today=payload['today'],
            events=payload['events'],
        )
    except Exception as e:
        logger.exception(f'Calendar PDF render failed: {e}')
        return jsonify({'success': False, 'error': 'PDF render failed'}), 500

    slug = re.sub(r'[^a-z0-9]+', '-',
                  (getattr(current_user, 'email', '') or 'user').lower()).strip('-')[:40] or 'user'
    filename = f'kuja-calendar-{slug}-{payload["today"].isoformat()}.pdf'
    return send_file(
        io.BytesIO(pdf_bytes),
        mimetype='application/pdf',
        as_attachment=True,
        download_name=filename,
    )
