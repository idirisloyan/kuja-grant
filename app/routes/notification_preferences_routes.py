"""
Notification preference routes — Phase 6.

Blueprint prefix: /api/notification-preferences
Routes:
  GET    /api/notification-preferences          - my prefs (one row per category)
  PUT    /api/notification-preferences          - upsert (replace all categories)
  POST   /api/notification-preferences/test     - send myself a test notification
"""

import logging

from flask import Blueprint, jsonify
from flask_login import login_required, current_user

from app.extensions import db
from app.models import NotificationPreference
from app.models.notification_preference import (
    VALID_CATEGORIES, VALID_CHANNELS, DEFAULT_CHANNELS_BY_CATEGORY,
)
from app.services.notification_dispatcher import NotificationDispatcher
from app.utils.helpers import get_request_json

logger = logging.getLogger('kuja')

notif_pref_bp = Blueprint(
    'notif_pref', __name__, url_prefix='/api/notification-preferences',
)


def _load_my_prefs(user_id: int) -> dict:
    """Return current prefs as {categories: [{category, channels, ...}],
    catalog: {categories, channels, defaults}}."""
    rows = NotificationPreference.query.filter_by(user_id=user_id).all()
    rows_by_cat = {r.category: r for r in rows}
    out_categories = []
    for cat in sorted(VALID_CATEGORIES):
        row = rows_by_cat.get(cat)
        if row:
            out_categories.append(row.to_dict())
        else:
            out_categories.append({
                'category': cat,
                'channels': DEFAULT_CHANNELS_BY_CATEGORY[cat],
                'phone_e164': None,
                'whatsapp_e164': None,
                'updated_at': None,
            })
    return {
        'categories': out_categories,
        'catalog': {
            'categories': sorted(VALID_CATEGORIES),
            'channels': sorted(VALID_CHANNELS),
            'defaults': DEFAULT_CHANNELS_BY_CATEGORY,
        },
    }


@notif_pref_bp.route('', methods=['GET'])
@login_required
def api_get_prefs():
    return jsonify({'success': True, **_load_my_prefs(current_user.id)})


@notif_pref_bp.route('', methods=['PUT'])
@login_required
def api_put_prefs():
    """Upsert all categories at once.

    Body:
      {
        "categories": [
          {"category": "compliance", "channels": ["in_app","sms"], "phone_e164": "+254700..."},
          ...
        ]
      }
    Phone numbers are shared across rows — last-write-wins applies; we
    also keep them in sync so the contact_for() helper always finds one.
    """
    data = get_request_json() or {}
    cats = data.get('categories') or []
    if not isinstance(cats, list):
        return jsonify({'success': False, 'error': 'categories must be a list'}), 400

    # Validate first so we don't half-write
    cleaned = []
    shared_phone = None
    shared_whatsapp = None
    for entry in cats:
        cat = (entry.get('category') or '').strip().lower()
        if cat not in VALID_CATEGORIES:
            return jsonify({'success': False, 'error': f'unknown category: {cat}'}), 400
        chans = entry.get('channels') or []
        if not isinstance(chans, list):
            return jsonify({'success': False, 'error': f'channels must be a list for {cat}'}), 400
        chans_clean = [c for c in chans if c in VALID_CHANNELS]
        # always include in_app — every user gets in-app, even when they pick zero channels
        if 'in_app' not in chans_clean:
            chans_clean = ['in_app'] + chans_clean
        phone = (entry.get('phone_e164') or '').strip() or None
        whats = (entry.get('whatsapp_e164') or '').strip() or None
        if phone: shared_phone = phone
        if whats: shared_whatsapp = whats
        cleaned.append({'category': cat, 'channels': chans_clean,
                        'phone_e164': phone, 'whatsapp_e164': whats})

    # Upsert
    for c in cleaned:
        row = NotificationPreference.query.filter_by(
            user_id=current_user.id, category=c['category'],
        ).first()
        if not row:
            row = NotificationPreference(
                user_id=current_user.id, category=c['category'],
            )
            db.session.add(row)
        row.set_channels(c['channels'])
        # Keep contact numbers in sync across all rows so we always have
        # an address when an external channel is wanted.
        row.phone_e164 = c['phone_e164'] or shared_phone
        row.whatsapp_e164 = c['whatsapp_e164'] or shared_whatsapp
    db.session.commit()

    return jsonify({'success': True, **_load_my_prefs(current_user.id)})


@notif_pref_bp.route('/test', methods=['POST'])
@login_required
def api_test_notification():
    """Send a test through the dispatcher using current prefs.
    Body: {category: 'deadlines'|...}  (defaults to 'deadlines')"""
    data = get_request_json() or {}
    category = (data.get('category') or 'deadlines').strip().lower()
    if category not in VALID_CATEGORIES:
        return jsonify({'success': False, 'error': 'invalid category'}), 400

    results = NotificationDispatcher.dispatch(
        user_id=current_user.id,
        category=category,
        title='Kuja test notification',
        body='This is a test of your notification preferences. If you see this in unexpected places, edit your channels.',
        deep_link_url='/dashboard',
        related_kind='test',
    )
    return jsonify({'success': True, 'results': results})
