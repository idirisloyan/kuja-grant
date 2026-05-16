"""
DocumentSearchService — Phase 9 (May 2026).

Org-scoped search across uploaded documents: filename + AI extraction +
user clarifications. Returns ranked hits with snippet highlights.

Why ILIKE (not Postgres FTS / tsvector):
  - Documents have no dedicated extracted_text column today; the
    AI extraction sits inside ai_analysis JSON. Adding tsvector
    means a backfill across every existing document + a GIN index
    + an extraction-time hook to keep the column fresh — meaty
    enough to deserve its own iteration.
  - ILIKE works identically on SQLite (dev) and PostgreSQL (prod);
    on prod we can add a btree index on `lower(original_filename)`
    later if search becomes hot.
  - Snippet highlights come from a Python pass over the matched
    JSON values — simpler than tsvector + ts_headline and good
    enough for the search-as-you-type UX scale.

Visibility rules:
  - NGO: documents linked to applications submitted by their org,
    OR documents linked to assessments owned by their org.
  - Donor: documents linked to applications on their grants.
  - Admin: everything.
  - Reviewer: documents on applications they have a Review row for.

Output:
  {
    'query': str,
    'total': int,
    'hits': [
      {
        'document_id': int,
        'original_filename': str,
        'doc_type': str | null,
        'application_id': int | null,
        'assessment_id': int | null,
        'snippet': '... <mark>match</mark> ...',  (HTML-safe text only)
        'match_locations': ['filename', 'ai_analysis', 'user_clarification'],
        'uploaded_at': iso,
      }, ...
    ],
  }
"""

import logging
import re
from datetime import datetime, timezone

from app.extensions import db
from app.models import Document, Application, Assessment, Review

logger = logging.getLogger('kuja')

# Cap result set to keep response time + frontend rendering predictable.
MAX_HITS = 30
SNIPPET_RADIUS = 80


class DocumentSearchService:

    @classmethod
    def search(cls, *, query: str, user) -> dict:
        q = (query or '').strip()
        if len(q) < 2:
            return {'query': q, 'total': 0, 'hits': []}

        # Build the visibility filter.
        scope_q = cls._scope_query(user)
        if scope_q is None:
            return {'query': q, 'total': 0, 'hits': []}

        # SQLAlchemy ILIKE; case-insensitive on Postgres + SQLite alike.
        pattern = f'%{q}%'
        # We can't ILIKE on JSON directly across both DBs reliably, so we
        # match on the raw stored text (it's stored as a JSON STRING in
        # the Text column — substring works).
        hits_q = scope_q.filter(
            db.or_(
                Document.original_filename.ilike(pattern),
                Document.ai_analysis.ilike(pattern),
                Document.user_clarification.ilike(pattern),
            )
        ).order_by(Document.uploaded_at.desc())

        total = hits_q.count()
        rows = hits_q.limit(MAX_HITS).all()

        hits = [cls._hit(doc, q) for doc in rows]
        return {
            'query': q,
            'total': total,
            'hits': hits,
            'searched_at': datetime.now(timezone.utc).isoformat(),
        }

    # ------------------------------------------------------------------

    @classmethod
    def _scope_query(cls, user):
        """Return a base Document query already filtered by visibility,
        or None if the user has no visibility scope."""
        role = getattr(user, 'role', None)
        org_id = getattr(user, 'org_id', None)
        user_id = getattr(user, 'id', None)
        if role == 'admin':
            return Document.query

        if role == 'ngo' and org_id:
            # Documents on applications submitted by this org OR on
            # assessments owned by this org.
            app_ids = [a.id for a in Application.query.filter_by(ngo_org_id=org_id)
                       .with_entities(Application.id).all()]
            asm_ids = [a.id for a in Assessment.query.filter_by(org_id=org_id)
                       .with_entities(Assessment.id).all()]
            if not app_ids and not asm_ids:
                return None
            return Document.query.filter(
                db.or_(
                    Document.application_id.in_(app_ids) if app_ids else db.false(),
                    Document.assessment_id.in_(asm_ids) if asm_ids else db.false(),
                )
            )

        if role == 'donor' and org_id:
            # Documents on applications submitted to this donor's grants
            from app.models import Grant
            grant_ids = [g.id for g in Grant.query.filter_by(donor_org_id=org_id)
                         .with_entities(Grant.id).all()]
            if not grant_ids:
                return None
            app_ids = [a.id for a in Application.query.filter(Application.grant_id.in_(grant_ids))
                       .with_entities(Application.id).all()]
            if not app_ids:
                return None
            return Document.query.filter(Document.application_id.in_(app_ids))

        if role == 'reviewer' and user_id:
            # Documents on applications the reviewer has been assigned to
            app_ids = [r.application_id for r in
                       Review.query.filter_by(reviewer_user_id=user_id)
                       .with_entities(Review.application_id).all()]
            if not app_ids:
                return None
            return Document.query.filter(Document.application_id.in_(app_ids))

        return None

    @classmethod
    def _hit(cls, doc, query: str) -> dict:
        """Render a search-result hit with snippet + match locations."""
        match_locations = []
        snippet = ''

        # Determine where the match is and pull a snippet from the first match
        lowered = query.lower()

        if doc.original_filename and lowered in doc.original_filename.lower():
            match_locations.append('filename')
            snippet = cls._snippet(doc.original_filename, query)

        if not snippet and doc.ai_analysis and lowered in (doc.ai_analysis or '').lower():
            match_locations.append('ai_analysis')
            snippet = cls._snippet(_strip_json_punct(doc.ai_analysis), query)

        if not snippet and doc.user_clarification and lowered in (doc.user_clarification or '').lower():
            match_locations.append('user_clarification')
            snippet = cls._snippet(doc.user_clarification, query)

        # Add any locations not used for the snippet but where the match also occurred
        for field_name, field_val in (
            ('ai_analysis', doc.ai_analysis),
            ('user_clarification', doc.user_clarification),
        ):
            if (field_name not in match_locations and field_val
                    and lowered in (field_val or '').lower()):
                match_locations.append(field_name)

        return {
            'document_id': doc.id,
            'original_filename': doc.original_filename,
            'doc_type': doc.doc_type,
            'application_id': doc.application_id,
            'assessment_id': doc.assessment_id,
            'snippet': snippet,
            'match_locations': match_locations,
            'uploaded_at': doc.uploaded_at.isoformat() if doc.uploaded_at else None,
        }

    @classmethod
    def _snippet(cls, text: str, query: str) -> str:
        """Return an HTML-escaped snippet around the match with the
        match wrapped in <mark>. ~150 chars total."""
        if not text or not query:
            return ''
        lowered = text.lower()
        q_lower = query.lower()
        idx = lowered.find(q_lower)
        if idx < 0:
            return _escape_html(text[:SNIPPET_RADIUS * 2]) + ('…' if len(text) > SNIPPET_RADIUS * 2 else '')

        start = max(0, idx - SNIPPET_RADIUS)
        end = min(len(text), idx + len(query) + SNIPPET_RADIUS)
        prefix = '…' if start > 0 else ''
        suffix = '…' if end < len(text) else ''
        before = _escape_html(text[start:idx])
        match = _escape_html(text[idx:idx + len(query)])
        after = _escape_html(text[idx + len(query):end])
        return f'{prefix}{before}<mark>{match}</mark>{after}{suffix}'


# ----------------------------------------------------------------------
# Module helpers
# ----------------------------------------------------------------------

_JSON_PUNCT_RE = re.compile(r'[{}\[\]",]+')

def _strip_json_punct(s: str) -> str:
    """Make a JSON-string field readable as a snippet by stripping the
    surrounding punctuation. Best-effort — wrong-decoded JSON is fine."""
    return _JSON_PUNCT_RE.sub(' ', s)


def _escape_html(s: str) -> str:
    return (s
            .replace('&', '&amp;')
            .replace('<', '&lt;')
            .replace('>', '&gt;'))
