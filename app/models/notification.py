"""Notification model - In-app notifications for deadline reminders, alerts, and status changes.

NOTE: New table — db.create_all() will create it in development.
For production, run: flask db migrate -m "add notifications table"
"""

from datetime import datetime, timezone

from app.extensions import db


class Notification(db.Model):
    """In-app notification for users (deadline reminders, overdue alerts, etc.)."""
    __tablename__ = 'notifications'
    __table_args__ = (
        db.Index('ix_notifications_user_read', 'user_id', 'read'),
        db.Index('ix_notifications_user_created', 'user_id', 'created_at'),
        db.Index('ix_notifications_type_link', 'type', 'link'),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    type = db.Column(db.String(50), nullable=False)
    # Types: deadline_reminder, overdue_alert, status_change, screening_alert, expiry_alert
    title = db.Column(db.String(200), nullable=False)
    message = db.Column(db.Text, nullable=True)
    link = db.Column(db.String(500), nullable=True)  # Deep link to relevant page
    read = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    user = db.relationship('User', backref=db.backref('notifications', lazy='dynamic'))

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'type': self.type,
            'title': self.title,
            'message': self.message,
            'link': self.link,
            'read': self.read,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
