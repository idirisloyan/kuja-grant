"""
GlobalSearchService — Phase 22B (May 2026).

Cross-entity content search. Replaces the "click into each surface to
find what you remember" workflow with a single search box that hits
grants, applications, reports, and documents in parallel.

Per-entity scoping (server-enforced):
  - grants:       any logged-in user sees public/open grants;
                  donors see their own draft grants too
  - applications: NGO sees own; donor sees apps on their grants;
                  reviewer sees assigned; admin sees all
  - reports:      NGO sees own; donor sees against own grants;
                  admin sees all
  - documents:    delegate to existing DocumentSearchService (same scope)

Output shape:
  {
    'success': True,
    'query': '<term>',
    'results': [
      { kind, id, title, snippet, href, sort_key, badge? }, ...
    ],
    'totals': { grants: N, applications: N, reports: N, documents: N }
  }

snippet renders <mark> tags around the matched term (frontend safely
renders only those tags). Capped per kind at MAX_PER_KIND so a giant
hit on one entity doesn't drown the others.
"""

import logging
import re
from datetime import datetime, timezone

from sqlalchemy import or_

from app.extensions import db
from app.models import Application, Grant, Organization, Report, User

logger = logging.getLogger('kuja')

MIN_QUERY_LEN = 3
MAX_PER_KIND = 8
SNIPPET_RADIUS = 60        # chars before + after match


def _escape(s: str) -> str:
    return (
        s.replace('&', '&amp;')
         .replace('<', '&lt;')
         .replace('>', '&gt;')
    )


def _snippet(text: str, query: str) -> str:
    """Return a snippet with <mark> highlighting around the first match.
    Falls back to first SNIPPET_RADIUS chars if no match (paranoid)."""
    if not text:
        return ''
    raw = str(text)
    # case-insensitive find
    idx = raw.lower().find(query.lower())
    if idx == -1:
        # truncated head
        head = raw[:SNIPPET_RADIUS * 2]
        return _escape(head) + ('…' if len(raw) > SNIPPET_RADIUS * 2 else '')
    start = max(0, idx - SNIPPET_RADIUS)
    end = min(len(raw), idx + len(query) + SNIPPET_RADIUS)
    chunk = raw[start:end]
    prefix = '…' if start > 0 else ''
    suffix = '…' if end < len(raw) else ''
    escaped = _escape(chunk)
    # Highlight (case-preserving) — use regex with re.escape on query
    try:
        escaped_marked = re.sub(
            re.escape(_escape(query)),
            lambda m: f'<mark>{m.group(0)}</mark>',
            escaped,
            flags=re.IGNORECASE,
        )
    except Exception:
        escaped_marked = escaped
    return f'{prefix}{escaped_marked}{suffix}'


class GlobalSearchService:

    @classmethod
    def search(cls, *, query: str, user) -> dict:
        q = (query or '').strip()
        if len(q) < MIN_QUERY_LEN:
            return {
                'success': True,
                'query': q,
                'results': [],
                'totals': {'grants': 0, 'applications': 0, 'reports': 0, 'documents': 0},
                'reason': 'query_too_short',
                'min_query_len': MIN_QUERY_LEN,
            }

        like = f'%{q}%'
        results: list[dict] = []
        totals = {'grants': 0, 'applications': 0, 'reports': 0, 'documents': 0}

        # ---- Grants
        gq = Grant.query.filter(
            or_(Grant.title.ilike(like), Grant.description.ilike(like))
        )
        if user.role == 'ngo':
            gq = gq.filter(Grant.status == 'open')
        elif user.role == 'donor':
            gq = gq.filter(or_(
                Grant.donor_org_id == user.org_id,
                Grant.status == 'open',
            ))
        # reviewer + admin → all visible
        grants = gq.order_by(Grant.updated_at.desc()).limit(MAX_PER_KIND * 2).all()
        for g in grants[:MAX_PER_KIND]:
            text = (g.title or '') + ' — ' + (g.description or '')
            results.append({
                'kind': 'grant',
                'id': g.id,
                'title': g.title or f'Grant #{g.id}',
                'snippet': _snippet(text, q),
                'href': f'/grants/{g.id}',
                'sort_key': g.updated_at.isoformat() if g.updated_at else '',
                'badge': g.status,
            })
        totals['grants'] = len(grants)

        # ---- Applications (search inside the responses JSON text)
        # Note: responses is JSON text; ILIKE works fine for keyword hunting.
        aq = Application.query.options(db.joinedload(Application.grant))
        if user.role == 'ngo':
            aq = aq.filter(Application.ngo_org_id == user.org_id)
        elif user.role == 'donor':
            aq = aq.join(Grant).filter(Grant.donor_org_id == user.org_id)
        elif user.role == 'reviewer':
            from app.models import Review
            review_ids = db.session.query(Review.application_id).filter_by(
                reviewer_user_id=user.id
            ).subquery()
            aq = aq.filter(Application.id.in_(review_ids))
        aq = aq.filter(Application.responses.ilike(like))
        apps = aq.order_by(Application.updated_at.desc()).limit(MAX_PER_KIND * 2).all()
        for a in apps[:MAX_PER_KIND]:
            responses_text = a.responses or ''
            results.append({
                'kind': 'application',
                'id': a.id,
                'title': (a.grant.title if a.grant else f'Application #{a.id}'),
                'snippet': _snippet(responses_text, q),
                'href': f'/applications/{a.id}',
                'sort_key': a.updated_at.isoformat() if a.updated_at else '',
                'badge': a.status,
            })
        totals['applications'] = len(apps)

        # ---- Reports
        try:
            rq = Report.query.options(db.joinedload(Report.grant))
            if user.role == 'ngo':
                rq = rq.filter(Report.submitted_by_org_id == user.org_id)
            elif user.role == 'donor':
                rq = rq.join(Grant).filter(Grant.donor_org_id == user.org_id)
            # reviewer + admin → all visible (reviewer side-effect)
            rq = rq.filter(or_(
                Report.title.ilike(like),
                Report.content.ilike(like),
            ))
            reports = rq.order_by(Report.updated_at.desc()).limit(MAX_PER_KIND * 2).all()
            for r in reports[:MAX_PER_KIND]:
                text = (r.title or '') + ' — ' + (r.content or '')
                results.append({
                    'kind': 'report',
                    'id': r.id,
                    'title': r.title or f'Report #{r.id}',
                    'snippet': _snippet(text, q),
                    'href': f'/reports',
                    'sort_key': r.updated_at.isoformat() if r.updated_at else '',
                    'badge': r.status,
                })
            totals['reports'] = len(reports)
        except Exception as e:
            logger.warning(f'reports search failed: {e}')

        # ---- Documents (delegate to existing service)
        try:
            from app.services.document_search_service import DocumentSearchService
            doc_resp = DocumentSearchService.search(query=q, user=user)
            doc_hits = (doc_resp or {}).get('results') or []
            for d in doc_hits[:MAX_PER_KIND]:
                results.append({
                    'kind': 'document',
                    'id': d.get('id'),
                    'title': d.get('filename') or f"Document #{d.get('id')}",
                    'snippet': d.get('snippet') or '',
                    'href': d.get('href') or '#',
                    'sort_key': d.get('uploaded_at') or '',
                    'badge': d.get('kind') or 'document',
                })
            totals['documents'] = len(doc_hits)
        except Exception as e:
            logger.warning(f'document search delegate failed: {e}')

        # Sort overall by recency
        results.sort(key=lambda r: r.get('sort_key') or '', reverse=True)

        return {
            'success': True,
            'query': q,
            'results': results,
            'totals': totals,
            'computed_at': datetime.now(timezone.utc).isoformat(),
        }
