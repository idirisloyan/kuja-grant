"""
Phase 117 — Peer reference snippets.

"Orgs like yours wrote this" — when an NGO is staring at a blank
criterion response, show them 1-3 short anonymized excerpts from
past *awarded* applications by peer orgs (same sectors / countries).
Not generated, not paraphrased: real fragments the peer wrote,
truncated to a sentence or two so the NGO can see a credible
phrasing pattern without lifting wholesale.

Privacy:
  * Source NGO name + ID never leave the backend.
  * We only ever include responses from applications where
    status == 'awarded' (the peer's submission was approved and
    funded — implicit consent that this content is benchmark-quality).
  * The label returned to the requester is just "Peer NGO" + a
    rough sector tag, never the org id or name.

Ranking:
  * Jaccard overlap on sectors + countries between the calling org
    and the candidate peer.
  * Tiebreak: more recent awarded application wins (fresher language).

Returns up to 3 snippets, each ~280 chars max.
"""

from __future__ import annotations
import json
import logging
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from app.extensions import db
from app.models import Organization, Application, Grant
from app.utils.api_errors import error_response

logger = logging.getLogger('kuja')

peer_snippets_bp = Blueprint(
    'peer_snippets', __name__, url_prefix='/api/peer-snippets',
)

MAX_SNIPPETS = 3
SNIPPET_CHAR_BUDGET = 280


def _norm_list(val):
    if val is None:
        return set()
    if isinstance(val, str):
        try:
            parsed = json.loads(val)
            if isinstance(parsed, list):
                return {str(x).strip().lower() for x in parsed if x}
        except Exception:
            pass
        return {p.strip().lower() for p in val.split(',') if p.strip()}
    if isinstance(val, (list, tuple)):
        return {str(x).strip().lower() for x in val if x}
    return set()


def _jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _truncate(text: str, budget: int = SNIPPET_CHAR_BUDGET) -> str:
    t = (text or '').strip()
    if len(t) <= budget:
        return t
    # Cut at the last sentence boundary before the budget.
    cut = t[:budget]
    for delim in ('. ', '! ', '? '):
        idx = cut.rfind(delim)
        if idx > budget * 0.4:
            return cut[: idx + 1].strip()
    return cut.rstrip() + '…'


@peer_snippets_bp.route('/<criterion_key>', methods=['GET'])
@login_required
def api_peer_snippets(criterion_key: str):
    """Return up to 3 anonymized peer snippets for a criterion key.

    Query: ?grant_id=<id> (optional, scopes the sector candidate pool to
    the same donor's pool when set).
    """
    if current_user.role != 'ngo':
        return error_response('auth.access_denied', 403)

    org = db.session.get(Organization, current_user.org_id)
    if not org:
        return error_response('auth.access_denied', 403)

    grant_id = request.args.get('grant_id', type=int)

    my_sectors = _norm_list(getattr(org, 'sectors', None))
    my_countries = _norm_list(getattr(org, 'countries', None))

    # Pull all awarded applications joined to ngo + grant for sector/country.
    rows = (
        db.session.query(Application, Organization, Grant)
        .join(Organization, Organization.id == Application.ngo_org_id)
        .outerjoin(Grant, Grant.id == Application.grant_id)
        .filter(Application.status == 'awarded')
        .filter(Application.ngo_org_id != org.id)
        .filter(Application.responses.isnot(None))
        .order_by(Application.created_at.desc())
        .limit(120)
        .all()
    )

    scored = []
    for app, peer_org, peer_grant in rows:
        try:
            resp = json.loads(app.responses) if app.responses else {}
        except Exception:
            continue
        text = (resp.get(criterion_key) or '').strip() if isinstance(resp, dict) else ''
        if not text or len(text) < 40:
            continue
        peer_sectors = _norm_list(getattr(peer_org, 'sectors', None))
        peer_countries = _norm_list(getattr(peer_org, 'countries', None))
        score = (
            _jaccard(my_sectors, peer_sectors) * 0.6
            + _jaccard(my_countries, peer_countries) * 0.4
        )
        # If scoped to a grant, give a small boost to peers who applied
        # to the same donor (lateral relevance).
        if grant_id and peer_grant and peer_grant.donor_org_id is not None:
            try:
                this_grant = db.session.get(Grant, grant_id)
                if this_grant and this_grant.donor_org_id == peer_grant.donor_org_id:
                    score += 0.15
            except Exception:
                pass
        if score <= 0.0:
            continue
        # Sector label is the first overlapping sector if any, else just
        # the peer's first sector — used for the anonymous attribution.
        overlap_sector = next(iter(my_sectors & peer_sectors), None)
        label_sector = overlap_sector or next(iter(peer_sectors), None) or 'peer'
        scored.append({
            'snippet': _truncate(text),
            'score': round(score, 3),
            'sector_label': label_sector,
            'peer_label': f'Peer NGO ({label_sector.title()})',
        })

    scored.sort(key=lambda x: x['score'], reverse=True)
    snippets = scored[:MAX_SNIPPETS]

    return jsonify({
        'success': True,
        'criterion_key': criterion_key,
        'snippets': [
            {
                'snippet': s['snippet'],
                'peer_label': s['peer_label'],
                'sector_label': s['sector_label'],
            }
            for s in snippets
        ],
        'notice': 'Snippets are anonymized excerpts from awarded peer applications. '
                  'Use them for inspiration; do not copy.',
    })
