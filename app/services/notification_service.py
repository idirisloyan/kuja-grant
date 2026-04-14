"""
Kuja Grant Management System - Notification Service
=====================================================
Creates in-app notifications for deadline reminders, overdue alerts,
registration expiry warnings, and status changes.

Designed to be called from the background scheduler or manually.
Each check is idempotent: it won't create duplicate notifications
for the same event (checked via type + link uniqueness per user).
"""

import logging
from datetime import date, datetime, timedelta, timezone

logger = logging.getLogger('kuja')


def create_notification(user_id, type, title, message, link=None):
    """Create and save a notification for a user.

    Args:
        user_id: Target user ID.
        type: Notification type (deadline_reminder, overdue_alert, etc.).
        title: Short notification title.
        message: Full notification message.
        link: Optional deep link to the relevant page.

    Returns:
        The created Notification instance, or None if duplicate.
    """
    from app.extensions import db
    from app.models.notification import Notification

    # Dedup: don't create duplicate notifications with the same type + link
    # for the same user within the last 24 hours.
    if link:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
        existing = Notification.query.filter_by(
            user_id=user_id, type=type, link=link
        ).filter(Notification.created_at > cutoff).first()
        if existing:
            return None

    notification = Notification(
        user_id=user_id,
        type=type,
        title=title,
        message=message,
        link=link,
    )
    db.session.add(notification)
    db.session.commit()
    return notification


def check_deadline_reminders(app):
    """Check for reports due in 30/14/7 days and create notifications for NGO users.

    Runs within an app context. Idempotent — deduplicates by type + link.
    """
    from app.extensions import db
    from app.models import User, Grant, Application, Report

    with app.app_context():
        today = date.today()
        reminder_windows = [
            (30, '30 days'),
            (14, '2 weeks'),
            (7, '1 week'),
        ]

        try:
            # Find all reports with upcoming due dates
            for days_ahead, label in reminder_windows:
                target_date = today + timedelta(days=days_ahead)
                # Find reports due on exactly this target date that are still draft/not submitted
                due_reports = Report.query.filter(
                    Report.due_date == target_date,
                    Report.status.in_(['draft', 'not_started', 'revision_requested']),
                ).all()

                for report in due_reports:
                    # Notify all users in the submitting org
                    org_users = User.query.filter_by(
                        org_id=report.submitted_by_org_id, is_active=True
                    ).all()

                    grant = db.session.get(Grant, report.grant_id)
                    grant_title = grant.title if grant else f'Grant #{report.grant_id}'

                    for user in org_users:
                        create_notification(
                            user_id=user.id,
                            type='deadline_reminder',
                            title=f'Report due in {label}',
                            message=(
                                f'{report.report_type.title()} report for "{grant_title}" '
                                f'is due on {target_date.isoformat()}.'
                            ),
                            link=f'/reports/{report.id}',
                        )

            logger.info("Deadline reminder check completed")

        except Exception as e:
            logger.error(f"Deadline reminder check failed: {e}")
            db.session.rollback()


def check_overdue_reports(app):
    """Create daily overdue alerts for NGOs and their donors.

    Finds all reports past their due date that are not yet submitted/accepted.
    """
    from app.extensions import db
    from app.models import User, Grant, Report

    with app.app_context():
        today = date.today()

        try:
            overdue_reports = Report.query.filter(
                Report.due_date < today,
                Report.status.in_(['draft', 'not_started', 'revision_requested']),
            ).all()

            for report in overdue_reports:
                days_overdue = (today - report.due_date).days
                grant = db.session.get(Grant, report.grant_id)
                grant_title = grant.title if grant else f'Grant #{report.grant_id}'

                # Notify NGO users
                ngo_users = User.query.filter_by(
                    org_id=report.submitted_by_org_id, is_active=True
                ).all()
                for user in ngo_users:
                    create_notification(
                        user_id=user.id,
                        type='overdue_alert',
                        title=f'Report overdue by {days_overdue} days',
                        message=(
                            f'{report.report_type.title()} report for "{grant_title}" '
                            f'was due on {report.due_date.isoformat()} '
                            f'({days_overdue} days ago).'
                        ),
                        link=f'/reports/{report.id}',
                    )

                # Notify donor users
                if grant and grant.donor_org_id:
                    donor_users = User.query.filter_by(
                        org_id=grant.donor_org_id, is_active=True
                    ).all()
                    for user in donor_users:
                        create_notification(
                            user_id=user.id,
                            type='overdue_alert',
                            title=f'Grantee report overdue by {days_overdue} days',
                            message=(
                                f'{report.report_type.title()} report for "{grant_title}" '
                                f'from grantee is overdue by {days_overdue} days.'
                            ),
                            link=f'/reports/{report.id}',
                        )

            logger.info(f"Overdue report check completed: {len(overdue_reports)} overdue reports")

        except Exception as e:
            logger.error(f"Overdue report check failed: {e}")
            db.session.rollback()


def check_expiry_alerts(app):
    """Create notifications for registrations expiring within 30/60/90 days.

    Queries RegistrationVerification records with expiry_date set.
    """
    from app.extensions import db
    from app.models import User, Organization
    from app.models.compliance import RegistrationVerification

    with app.app_context():
        today = date.today()
        windows = [
            (30, 'expiring in 30 days', 'urgent'),
            (60, 'expiring in 60 days', 'warning'),
            (90, 'expiring in 90 days', 'notice'),
        ]

        try:
            for days_ahead, label, _urgency in windows:
                target_date = today + timedelta(days=days_ahead)

                # Find registrations expiring on this exact date
                expiring = RegistrationVerification.query.filter(
                    RegistrationVerification.expiry_date == target_date,
                    RegistrationVerification.status != 'expired',
                ).all()

                for verification in expiring:
                    org = db.session.get(Organization, verification.org_id)
                    if not org:
                        continue

                    # Notify org users
                    org_users = User.query.filter_by(
                        org_id=org.id, is_active=True
                    ).all()
                    for user in org_users:
                        create_notification(
                            user_id=user.id,
                            type='expiry_alert',
                            title=f'Registration {label}',
                            message=(
                                f'Your organization registration in '
                                f'{verification.country or org.country or "unknown country"} '
                                f'expires on {target_date.isoformat()}. '
                                f'Please renew to maintain compliance.'
                            ),
                            link=f'/verification/{org.id}',
                        )

                    # Notify admin users
                    admin_users = User.query.filter_by(
                        role='admin', is_active=True
                    ).all()
                    for user in admin_users:
                        create_notification(
                            user_id=user.id,
                            type='expiry_alert',
                            title=f'{org.name} registration {label}',
                            message=(
                                f'{org.name} registration in '
                                f'{verification.country or org.country or "unknown country"} '
                                f'expires on {target_date.isoformat()}.'
                            ),
                            link=f'/verification/{org.id}',
                        )

            logger.info("Registration expiry alert check completed")

        except Exception as e:
            logger.error(f"Registration expiry alert check failed: {e}")
            db.session.rollback()


def run_all_notification_checks(app):
    """Run all notification checks. Called from the scheduler."""
    logger.info("Running all notification checks...")
    check_deadline_reminders(app)
    check_overdue_reports(app)
    check_expiry_alerts(app)
    logger.info("All notification checks completed")
