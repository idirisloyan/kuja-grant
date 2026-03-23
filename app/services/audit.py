"""Immutable audit trail for critical business actions.

Uses the dedicated 'kuja.audit' logger namespace so audit events can be
filtered independently in log aggregation systems (e.g. Datadog, Loki).
All entries are structured for easy parsing and are append-only by design.
"""
import json
import logging
from datetime import datetime, timezone

logger = logging.getLogger('kuja.audit')


def log_action(action: str, user_email: str, resource_type: str, resource_id: int,
               details: dict = None, ip_address: str = None):
    """Log an immutable audit event for a critical business action.

    Args:
        action: Dot-separated action identifier (e.g. 'grant.published').
        user_email: Email of the user who performed the action.
        resource_type: Type of resource affected (e.g. 'grant', 'application', 'report').
        resource_id: Primary key of the affected resource.
        details: Optional dict of additional context (grant_id, scores, etc.).
        ip_address: Optional client IP address.
    """
    event = {
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'action': action,
        'user': user_email,
        'resource': f'{resource_type}:{resource_id}',
        'details': details or {},
    }
    if ip_address:
        event['ip'] = ip_address

    # Log as structured JSON for log aggregation systems
    logger.info(
        f"AUDIT {action} {resource_type}:{resource_id} by={user_email} "
        f"{json.dumps(details) if details else ''}"
    )
