"""
Match engine routes — Phase 3.1+3.2+3.3
========================================
NGO-side: GET /api/match/for-me              → ranked open grants for my org
Donor-side: GET /api/match/for-grant/<id>    → ranked NGOs for a grant
Admin: POST /api/match/recompute             → admin/cron recomputation

Match scores are deterministic + cheap; we recompute eagerly on grant
publish + lazily when a stale score is read. The endpoints below also
expose a one-shot 'recompute_now' query param for testing.
"""

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from app.extensions import db
from app.models import Grant
from app.utils.api_errors import error_response
from app.utils.feature_flags import is_enabled
from app.services import match_engine
import logging

logger = logging.getLogger('kuja')

match_bp = Blueprint('match', __name__, url_prefix='/api/match')


def _flag_enabled():
    return is_enabled(
        'ai.match_engine',
        user_id=getattr(current_user, 'id', None),
        org_id=getattr(current_user, 'org_id', None),
    )


@match_bp.route('/for-me', methods=['GET'])
@login_required
def api_match_for_me():
    """NGO opportunity feed — ranked open grants for the calling org.

    Query: ?limit=10 (max 25) [&recompute=1 to force a fresh compute]

    Gated by feature flag ai.match_engine. While the flag is OFF the
    endpoint still works for QA but returns an empty list — frontends
    should call useFlag('ai.match_engine') and hide the surface.
    """
    if not _flag_enabled():
        return jsonify({'success': True, 'matches': [], 'flag': 'off'})

    if current_user.role != 'ngo':
        return error_response('auth.access_denied', 403)

    org_id = current_user.org_id
    if not org_id:
        return error_response('auth.access_denied', 403)

    try:
        limit = max(1, min(25, int(request.args.get('limit', 10))))
    except (TypeError, ValueError):
        limit = 10

    if request.args.get('recompute') in ('1', 'true', 'yes'):
        try:
            match_engine.compute_for_org(org_id, limit=50)
        except Exception as e:
            logger.error(f"on-demand recompute failed: {e}")

    matches = match_engine.top_matches_for_org(org_id, limit=limit)
    return jsonify({'success': True, 'matches': matches, 'flag': 'on'})


@match_bp.route('/for-grant/<int:grant_id>', methods=['GET'])
@login_required
def api_match_for_grant(grant_id):
    """Donor sees the ranked NGO list most likely to deliver this grant.

    Access: only the donor org that owns this grant + admins.
    """
    if not _flag_enabled():
        return jsonify({'success': True, 'matches': [], 'flag': 'off'})

    grant = db.session.get(Grant, grant_id)
    if not grant:
        return error_response('grant.not_found', 404)

    if current_user.role == 'donor' and grant.donor_org_id != current_user.org_id:
        return error_response('auth.access_denied', 403)
    if current_user.role not in ('donor', 'admin'):
        return error_response('auth.access_denied', 403)

    try:
        limit = max(1, min(50, int(request.args.get('limit', 10))))
    except (TypeError, ValueError):
        limit = 10

    matches = match_engine.top_orgs_for_grant(grant_id, limit=limit)
    return jsonify({'success': True, 'matches': matches, 'flag': 'on'})


@match_bp.route('/explain/<int:grant_id>', methods=['GET'])
@login_required
def api_match_explain(grant_id):
    """Phase 112 — Return the WhyThisMatch facets for the calling NGO
    against a single grant, computed live from the match engine.

    Backs the WhyThisMatch component on /grants/[id] so the reasons are
    grounded in real signals (sector/geography Jaccard, capacity fit,
    track record) instead of the prior local heuristic that only echoed
    the grant's own fields.

    Auth: NGO-only (the explanation is for the calling org).
    Returns: {reasons: [{facet, value}], top_strength, top_blocker,
              score, components} — even when flag is off (reasons=[]).
    """
    if current_user.role != 'ngo':
        return error_response('auth.access_denied', 403)

    org_id = current_user.org_id
    if not org_id:
        return error_response('auth.access_denied', 403)

    grant = db.session.get(Grant, grant_id)
    if not grant:
        return error_response('grant.not_found', 404)

    try:
        result = match_engine.compute(org_id, grant_id, persist=True)
    except Exception as e:
        logger.error(f"match explain compute failed: {e}")
        return jsonify({
            'success': True,
            'reasons': [],
            'top_strength': None,
            'top_blocker': None,
            'score': 0,
            'components': {},
        })

    components = result.get('components') or {}
    reasons = []

    # Map component → facet, with the concrete signal value where we
    # have it. Only emit a facet when the component contributed > 0.
    org = current_user.organization if hasattr(current_user, 'organization') else None
    org_countries = (org.countries if org and getattr(org, 'countries', None) else []) or []
    org_sectors = (org.sectors if org and getattr(org, 'sectors', None) else []) or []
    grant_countries = grant.countries or []
    grant_sectors = grant.sectors or []

    if components.get('sector', 0) > 0:
        overlap = [s for s in (grant_sectors or [])
                   if s and s.lower() in [str(x).lower() for x in (org_sectors or [])]]
        reasons.append({
            'facet': 'sector',
            'value': ', '.join(overlap[:2]) if overlap else None,
        })

    if components.get('geography', 0) > 0:
        overlap = [c for c in (grant_countries or [])
                   if c and c.lower() in [str(x).lower() for x in (org_countries or [])]]
        reasons.append({
            'facet': 'country',
            'value': ', '.join(overlap[:2]) if overlap else None,
        })

    if components.get('capacity', 0) >= 14:  # ≥70% of the 20 budget
        reasons.append({
            'facet': 'capacity-match',
            'value': 'Your readiness fits this grant\'s complexity',
        })
    elif components.get('capacity', 0) >= 8:
        reasons.append({'facet': 'readiness', 'value': None})

    if components.get('track_record', 0) >= 7.5:  # ≥50% of the 15 budget
        reasons.append({
            'facet': 'past-success',
            'value': 'You\'ve won similar grants before',
        })

    return jsonify({
        'success': True,
        'reasons': reasons[:4],
        'top_strength': result.get('top_strength'),
        'top_blocker': result.get('top_blocker'),
        'score': result.get('score', 0),
        'components': components,
    })


@match_bp.route('/recompute', methods=['POST'])
@login_required
def api_match_recompute():
    """Admin-only full recompute. Body:
       {"grant_id": <id>}     — recompute one grant's matches
       {"org_id": <id>}       — recompute one org's matches
       {"all": true}          — recompute every (open grant × ngo) pair (slow)
    """
    if current_user.role != 'admin':
        return error_response('auth.admin_only', 403)

    from app.utils.helpers import get_request_json
    data = get_request_json() or {}
    if data.get('grant_id'):
        n = match_engine.compute_for_grant(int(data['grant_id']))
        return jsonify({'success': True, 'recomputed': n, 'scope': 'grant'})
    if data.get('org_id'):
        n = match_engine.compute_for_org(int(data['org_id']))
        return jsonify({'success': True, 'recomputed': n, 'scope': 'org'})
    if data.get('all'):
        from app.models import Organization, Grant
        n = 0
        grants = Grant.query.filter_by(status='open').all()
        orgs = Organization.query.filter_by(org_type='ngo').all()
        for g in grants:
            for o in orgs:
                match_engine.compute(o.id, g.id, persist=True)
                n += 1
        return jsonify({'success': True, 'recomputed': n, 'scope': 'all'})
    return error_response('validation.missing_field', 400, field='grant_id|org_id|all')
