"""
Kuja Grant Management System - Report Routes
==============================================
Extracted from server.py section 18b (lines ~4649-5104).
Handles NGO report creation, submission, donor review, and upcoming reports.

Blueprint prefix: /api/reports
Routes served:
  /api/reports                       GET   - list reports (paginated, role-filtered)
  /api/reports                       POST  - create report (NGO)
  /api/reports/<report_id>           GET   - get report detail
  /api/reports/<report_id>           PUT   - update report
  /api/reports/<report_id>/submit    POST  - submit report (with AI analysis)
  /api/reports/<report_id>/review    POST  - donor reviews report
  /api/reports/upcoming              GET   - upcoming/overdue reports
"""

import logging
from datetime import datetime, date, timedelta, timezone

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from app.extensions import db
from app.models import Application, Grant, Report
from app.services.ai_service import AIService
from app.utils.helpers import get_request_json, paginate_query

logger = logging.getLogger('kuja')

reports_bp = Blueprint('reports', __name__, url_prefix='/api/reports')


@reports_bp.route('/', methods=['GET'])
@login_required
def api_list_reports():
    """List reports - filtered by role."""
    role = current_user.role
    org_id = current_user.org_id

    # Eager-load grant and submitted_by_org to avoid N+1 in to_dict()
    base_query = Report.query.options(
        db.joinedload(Report.grant),
        db.joinedload(Report.submitted_by_org),
    )

    if role == 'ngo':
        query = base_query.filter_by(submitted_by_org_id=org_id)
    elif role == 'donor':
        # Reports for grants owned by this donor
        query = base_query.join(Grant).filter(Grant.donor_org_id == org_id)
    else:
        query = base_query

    grant_id = request.args.get('grant_id', type=int)
    if grant_id:
        query = query.filter(Report.grant_id == grant_id)

    status = request.args.get('status')
    if status:
        query = query.filter(Report.status == status)

    query = query.order_by(Report.created_at.desc())
    pagination = paginate_query(query)

    return jsonify({
        'reports': [r.to_dict() for r in pagination.items],
        'total': pagination.total,
        'page': pagination.page,
        'pages': pagination.pages,
    })


@reports_bp.route('/', methods=['POST'])
@login_required
def api_create_report():
    """Create a new report (NGO)."""
    data = get_request_json()

    grant_id = data.get('grant_id')
    if not grant_id:
        return jsonify({'error': 'grant_id is required', 'success': False}), 400

    grant = db.session.get(Grant, grant_id)
    if not grant:
        return jsonify({'error': 'Grant not found', 'success': False}), 404

    # Input length validation
    title = data.get('title', '')
    if title and len(title) > 500:
        return jsonify({'error': 'Title too long (max 500 characters)', 'success': False}), 400
    reporting_period = data.get('reporting_period', '')
    if reporting_period and len(reporting_period) > 100:
        return jsonify({'error': 'Reporting period too long (max 100 characters)', 'success': False}), 400

    # Verify the NGO has a valid application for this grant
    app_id = data.get('application_id')
    if app_id:
        application = db.session.get(Application, app_id)
        if not application or application.ngo_org_id != current_user.org_id:
            return jsonify({'error': 'Invalid application', 'success': False}), 400

    report = Report(
        grant_id=grant_id,
        application_id=app_id,
        submitted_by_org_id=current_user.org_id,
        report_type=data.get('report_type', 'progress'),
        reporting_period=data.get('reporting_period', ''),
        title=data.get('title', ''),
        status='draft',
    )

    if data.get('content'):
        report.set_content(data['content'])
    if data.get('due_date'):
        try:
            report.due_date = date.fromisoformat(data['due_date'])
        except (ValueError, TypeError):
            pass

    db.session.add(report)
    db.session.commit()

    return jsonify({'success': True, 'report': report.to_dict()}), 201


@reports_bp.route('/<int:report_id>', methods=['GET'])
@login_required
def api_get_report(report_id):
    """Get report detail."""
    report = db.session.get(Report, report_id)
    if not report:
        return jsonify({'error': 'Report not found'}), 404

    # Access control
    if current_user.role == 'ngo' and report.submitted_by_org_id != current_user.org_id:
        return jsonify({'error': 'Access denied'}), 403
    if current_user.role == 'donor':
        grant = db.session.get(Grant, report.grant_id)
        if grant and grant.donor_org_id != current_user.org_id:
            return jsonify({'error': 'Access denied'}), 403

    data = report.to_dict()
    # Include grant reporting requirements for context
    grant = db.session.get(Grant, report.grant_id)
    if grant:
        data['grant_reporting_requirements'] = grant.get_reporting_requirements()
        data['grant_report_template'] = grant.get_report_template()
        data['grant_reporting_frequency'] = grant.reporting_frequency

    return jsonify({'report': data})


@reports_bp.route('/<int:report_id>', methods=['PUT'])
@login_required
def api_update_report(report_id):
    """Update report content (NGO editing draft) or donor adding review notes."""
    report = db.session.get(Report, report_id)
    if not report:
        return jsonify({'error': 'Report not found'}), 404

    data = get_request_json()

    if current_user.role == 'ngo':
        if report.submitted_by_org_id != current_user.org_id:
            return jsonify({'error': 'Access denied'}), 403
        if report.status not in ('draft', 'revision_requested'):
            return jsonify({'error': 'Report cannot be edited in current status'}), 400

        if 'content' in data:
            report.set_content(data['content'])
        if 'title' in data:
            report.title = data['title']
        if 'reporting_period' in data:
            report.reporting_period = data['reporting_period']
        if 'report_type' in data:
            report.report_type = data['report_type']
        if 'attachments' in data:
            report.set_attachments(data['attachments'])

    elif current_user.role == 'donor':
        grant = db.session.get(Grant, report.grant_id)
        if not grant or grant.donor_org_id != current_user.org_id:
            return jsonify({'error': 'Access denied'}), 403
        # Donors can add review notes
        if 'reviewer_notes' in data:
            report.reviewer_notes = data['reviewer_notes']

    db.session.commit()
    return jsonify({'success': True, 'report': report.to_dict()})


@reports_bp.route('/<int:report_id>/submit', methods=['POST'])
@login_required
def api_submit_report(report_id):
    """Submit report to donor."""
    report = db.session.get(Report, report_id)
    if not report:
        return jsonify({'error': 'Report not found'}), 404

    if report.submitted_by_org_id != current_user.org_id:
        return jsonify({'error': 'Access denied'}), 403

    if report.status not in ('draft', 'revision_requested'):
        return jsonify({'error': 'Report already submitted'}), 400

    report.status = 'submitted'
    report.submitted_at = datetime.now(timezone.utc)

    # Run AI analysis against grant requirements
    try:
        grant = db.session.get(Grant, report.grant_id)
        requirements = grant.get_reporting_requirements() if grant else []
        content = report.get_content()

        analysis = AIService.analyze_report(content, requirements, report.report_type)
        report.set_ai_analysis(analysis)
    except Exception as e:
        logger.error(f"Report AI analysis failed: {e}")

    db.session.commit()
    return jsonify({'success': True, 'report': report.to_dict()})


@reports_bp.route('/<int:report_id>/review', methods=['POST'])
@login_required
def api_review_report(report_id):
    """Donor reviews a submitted report."""
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'Only donors can review reports'}), 403

    report = db.session.get(Report, report_id)
    if not report:
        return jsonify({'error': 'Report not found'}), 404

    # Verify donor owns the grant
    grant = db.session.get(Grant, report.grant_id)
    if not grant or (current_user.role == 'donor' and grant.donor_org_id != current_user.org_id):
        return jsonify({'error': 'Access denied'}), 403

    # Only submitted or under_review reports can be reviewed
    if report.status not in ('submitted', 'under_review'):
        return jsonify({'error': f'Report in "{report.status}" status cannot be reviewed'}), 400

    data = get_request_json()
    action = data.get('action')  # 'accept' or 'request_revision'

    if action == 'accept':
        report.status = 'accepted'
    elif action == 'request_revision':
        report.status = 'revision_requested'
    else:
        return jsonify({'error': 'action must be "accept" or "request_revision"'}), 400

    report.reviewer_notes = data.get('notes', '')
    report.reviewed_at = datetime.now(timezone.utc)

    db.session.commit()
    return jsonify({'success': True, 'report': report.to_dict()})


@reports_bp.route('/upcoming', methods=['GET'])
@login_required
def api_upcoming_reports():
    """Get upcoming and overdue reports for the current user's grants.
    For NGOs: reports they need to submit for awarded grants.
    For Donors: reports they are expecting from grantees.
    """
    today = date.today()
    upcoming = []

    if current_user.role == 'ngo':
        # Find awarded applications for this NGO's org (with eager loading)
        awarded_apps = Application.query.options(
            db.joinedload(Application.grant).joinedload(Grant.donor_org)
        ).filter_by(
            ngo_org_id=current_user.org_id, status='awarded'
        ).all()

        # Pre-fetch all reports for this org to avoid N+1 queries
        all_org_reports = Report.query.filter_by(
            submitted_by_org_id=current_user.org_id
        ).all()
        _report_lookup = {}
        for r in all_org_reports:
            key = (r.grant_id, r.report_type, r.reporting_period)
            _report_lookup[key] = r

        for app_record in awarded_apps:
            grant = app_record.grant
            if not grant:
                continue

            requirements = grant.get_reporting_requirements()
            if not requirements:
                # Generate default requirements from reporting_frequency
                freq = grant.reporting_frequency or 'quarterly'
                requirements = [{'type': 'financial', 'frequency': freq, 'due_days_after_period': 30, 'title': f'{freq.title()} Financial Report'},
                                {'type': 'narrative', 'frequency': freq, 'due_days_after_period': 45, 'title': f'{freq.title()} Narrative Report'}]

            # Calculate next due dates based on grant start (published_at or created_at)
            grant_start = (grant.published_at or grant.created_at or datetime.now(timezone.utc)).date() if hasattr(grant.published_at or grant.created_at, 'date') else today

            # Use pre-fetched reports to determine existing periods
            existing_periods = set()
            for rkey, rpt in _report_lookup.items():
                if rkey[0] == grant.id and rpt.status in ('submitted', 'accepted', 'under_review'):
                    existing_periods.add((rpt.report_type, rpt.reporting_period))

            for req in requirements:
                freq = req.get('frequency', grant.reporting_frequency or 'quarterly')
                due_days = req.get('due_days_after_period', 30)
                req_type = req.get('type', 'progress')
                req_title = req.get('title', f'{req_type.title()} Report')

                # Calculate period intervals
                if freq == 'monthly':
                    interval_months = 1
                elif freq == 'quarterly':
                    interval_months = 3
                elif freq == 'semi-annual':
                    interval_months = 6
                elif freq == 'annual':
                    interval_months = 12
                else:
                    continue  # Skip final_only - those are created manually

                # Generate next 4 upcoming periods
                for period_num in range(1, 13):
                    period_end_month = grant_start.month + (interval_months * period_num) - 1
                    period_end_year = grant_start.year + (period_end_month - 1) // 12
                    period_end_month = ((period_end_month - 1) % 12) + 1

                    try:
                        # Last day of the period end month
                        if period_end_month == 12:
                            period_end = date(period_end_year, 12, 31)
                        else:
                            period_end = date(period_end_year, period_end_month + 1, 1) - timedelta(days=1)
                    except (ValueError, OverflowError):
                        continue

                    due = period_end + timedelta(days=due_days)

                    # Only show reports due within the next 90 days or overdue
                    if due > today + timedelta(days=90):
                        break
                    if due < grant_start:
                        continue

                    # Determine period label
                    period_start_month = period_end_month - interval_months + 1
                    if period_start_month < 1:
                        period_start_month += 12
                        period_start_year = period_end_year - 1
                    else:
                        period_start_year = period_end_year

                    if interval_months <= 3:
                        q_num = ((period_end_month - 1) // 3) + 1
                        period_label = f"Q{q_num} {period_end_year}"
                    elif interval_months == 6:
                        h_num = 1 if period_end_month <= 6 else 2
                        period_label = f"H{h_num} {period_end_year}"
                    else:
                        period_label = str(period_end_year)

                    # Skip if already submitted
                    if (req_type, period_label) in existing_periods:
                        continue

                    # Check if there's a draft already (using pre-fetched lookup)
                    draft = _report_lookup.get((grant.id, req_type, period_label))
                    if draft and draft.status not in ('draft', 'revision_requested'):
                        draft = None  # Only consider drafts/revision_requested

                    days_until = (due - today).days
                    upcoming.append({
                        'grant_id': grant.id,
                        'grant_title': grant.title,
                        'application_id': app_record.id,
                        'report_type': req_type,
                        'requirement_title': req_title,
                        'reporting_period': period_label,
                        'due_date': due.isoformat(),
                        'days_until_due': days_until,
                        'is_overdue': days_until < 0,
                        'status': draft.status if draft else 'not_started',
                        'draft_report_id': draft.id if draft else None,
                        'donor_org': grant.donor_org.name if grant.donor_org else None,
                    })

    elif current_user.role == 'donor':
        # Find grants owned by this donor that are awarded (with eager loading)
        awarded_apps = Application.query.options(
            db.joinedload(Application.grant),
            db.joinedload(Application.ngo_org)
        ).join(Grant).filter(
            Grant.donor_org_id == current_user.org_id,
            Application.status == 'awarded'
        ).all()

        # Pre-fetch all reports for grants owned by this donor to avoid N+1 queries
        donor_grant_ids = list({a.grant_id for a in awarded_apps if a.grant_id})
        _donor_report_lookup = {}
        if donor_grant_ids:
            donor_reports = Report.query.filter(Report.grant_id.in_(donor_grant_ids)).all()
            for r in donor_reports:
                key = (r.grant_id, r.submitted_by_org_id, r.report_type, r.reporting_period)
                _donor_report_lookup[key] = r

        for app_record in awarded_apps:
            grant = app_record.grant
            if not grant:
                continue
            ngo_org = app_record.ngo_org

            requirements = grant.get_reporting_requirements()
            if not requirements:
                freq = grant.reporting_frequency or 'quarterly'
                requirements = [{'type': 'financial', 'frequency': freq, 'due_days_after_period': 30, 'title': f'{freq.title()} Financial Report'}]

            grant_start = (grant.published_at or grant.created_at or datetime.now(timezone.utc)).date() if hasattr(grant.published_at or grant.created_at, 'date') else today

            for req in requirements:
                freq = req.get('frequency', grant.reporting_frequency or 'quarterly')
                due_days = req.get('due_days_after_period', 30)
                req_type = req.get('type', 'progress')

                if freq == 'monthly':
                    interval_months = 1
                elif freq == 'quarterly':
                    interval_months = 3
                elif freq == 'semi-annual':
                    interval_months = 6
                elif freq == 'annual':
                    interval_months = 12
                else:
                    continue

                for period_num in range(1, 13):
                    period_end_month = grant_start.month + (interval_months * period_num) - 1
                    period_end_year = grant_start.year + (period_end_month - 1) // 12
                    period_end_month = ((period_end_month - 1) % 12) + 1
                    try:
                        if period_end_month == 12:
                            period_end = date(period_end_year, 12, 31)
                        else:
                            period_end = date(period_end_year, period_end_month + 1, 1) - timedelta(days=1)
                    except (ValueError, OverflowError):
                        continue

                    due = period_end + timedelta(days=due_days)
                    if due > today + timedelta(days=90):
                        break
                    if due < grant_start:
                        continue

                    if interval_months <= 3:
                        q_num = ((period_end_month - 1) // 3) + 1
                        period_label = f"Q{q_num} {period_end_year}"
                    elif interval_months == 6:
                        h_num = 1 if period_end_month <= 6 else 2
                        period_label = f"H{h_num} {period_end_year}"
                    else:
                        period_label = str(period_end_year)

                    # Check if report exists from this NGO (using pre-fetched lookup)
                    existing = _donor_report_lookup.get(
                        (grant.id, app_record.ngo_org_id, req_type, period_label)
                    )

                    days_until = (due - today).days
                    upcoming.append({
                        'grant_id': grant.id,
                        'grant_title': grant.title,
                        'ngo_org_id': app_record.ngo_org_id,
                        'ngo_org_name': ngo_org.name if ngo_org else None,
                        'report_type': req_type,
                        'reporting_period': period_label,
                        'due_date': due.isoformat(),
                        'days_until_due': days_until,
                        'is_overdue': days_until < 0,
                        'status': existing.status if existing else 'not_submitted',
                        'report_id': existing.id if existing else None,
                    })

    # Sort: overdue first, then by due date
    upcoming.sort(key=lambda x: (not x.get('is_overdue', False), x.get('due_date', '')))

    return jsonify({
        'upcoming_reports': upcoming,
        'total': len(upcoming),
        'overdue_count': sum(1 for r in upcoming if r.get('is_overdue')),
    })
