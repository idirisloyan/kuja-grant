"""
Kuja Grant Management System - Route Decorators
=================================================
Extracted from server.py lines 890-900.
Access-control decorators for API route handlers.
"""

from functools import wraps
from flask import jsonify
from flask_login import login_required, current_user


def role_required(*roles):
    """Decorator that restricts access to users with specific roles."""
    def decorator(f):
        @wraps(f)
        @login_required
        def decorated_function(*args, **kwargs):
            if current_user.role not in roles:
                return jsonify({'error': 'Insufficient permissions', 'success': False}), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator
