"""
SavedSearchAlertService — Phase 167 (Jun 2026).

When a new grant is published, scan saved searches scoped to `grants`
and fire a notification to each saving NGO whose filter matches.

Filter shape (from frontend):
    {
      "q":       optional substring (matched against title + description),
      "sectors": optional list of sector strings,
      "sort":    ignored
    }

A match requires:
    - if q present, the grant's title or description contains q
      (case-insensitive)
    - if sectors present, at least one sector overlaps

Notifications go to one row per matched user, kind=
'grant_published_match', payload includes grant id + title + the
saved-search id so the UI can mark the alert as origin.

Best-effort: any failure is logged but doesn't block the grant
publication flow.
"""

from __future__ import annotations

import json
import logging
from typing import Iterable

from app.extensions import db

logger = logging.getLogger('kuja')


def _filter_matches_grant(filt: dict, grant) -> bool:
    if not isinstance(filt, dict):
        return False
    q = (filt.get('q') or '').strip().lower()
    sectors = filt.get('sectors') or []

    if q:
        title = (grant.title or '').lower()
        description = (grant.description or '').lower()
        if q not in title and q not in description:
            return False

    if isinstance(sectors, list) and sectors:
        gs = set((s or '').lower() for s in (grant.sectors or []))
        ws = set((s or '').lower() for s in sectors)
        if not (gs & ws):
            return False

    return True


def fan_out_for_grant(grant_id: int) -> int:
    """Return the count of notifications dispatched."""
    try:
        from app.models import SavedSearch, Notification, Grant, User
    except Exception:
        return 0

    grant = db.session.get(Grant, grant_id)
    if not grant:
        return 0

    try:
        searches = SavedSearch.query.filter_by(scope='grants').all()
    except Exception as e:
        logger.warning('saved search lookup failed: %s', e)
        return 0

    dispatched = 0
    for ss in searches:
        try:
            filt = ss.get_filter() if hasattr(ss, 'get_filter') else json.loads(ss.filter_json or '{}')
        except Exception:
            filt = {}
        if not _filter_matches_grant(filt, grant):
            continue
        # Don't notify the donor that published their own grant.
        try:
            owner = db.session.get(User, ss.user_id)
            if not owner:
                continue
            if owner.org_id == grant.donor_org_id:
                continue
        except Exception:
            continue
        try:
            n = Notification(
                user_id=ss.user_id,
                org_id=owner.org_id,
                kind='grant_published_match',
                payload_json=json.dumps({
                    'grant_id': grant.id,
                    'grant_title': grant.title,
                    'saved_search_id': ss.id,
                    'saved_search_name': getattr(ss, 'name', None),
                }),
            )
            db.session.add(n)
            dispatched += 1
        except Exception as e:
            logger.debug('saved-search alert insert failed: %s', e)
    try:
        if dispatched:
            db.session.commit()
    except Exception:
        try:
            db.session.rollback()
        except Exception:
            pass
    return dispatched
