"""
OrgMemoryService — Phase 10.5.

Manages the reusable organizational knowledge layer that the AI co-author
pulls from. Three things this service does:

  1. Ensure the org_memory table exists (lazy create on first use, like
     other Phase-10 tables).
  2. Auto-extract memory items from new applications/reports as they're
     created or submitted (deterministic — pulls org profile fields,
     significant numbers from responses, named partners).
  3. Retrieve relevant memory items for a given grant context (sectors,
     countries, criteria) so the AI prompt can include them inline.

Retrieval strategy is intentionally simple — tag intersection + recency
+ usage_count weighting. We intentionally do NOT do vector retrieval
yet; deterministic retrieval is faster, cheaper, and easier to explain
to an NGO ("we pulled this fact because it's tagged 'health, Kenya'
and you used it 4 times before").
"""

import json
import logging
import re
from datetime import datetime, timezone

from app.extensions import db
from sqlalchemy import text

logger = logging.getLogger('kuja')

_TABLE_READY = False


def _ensure_table():
    """Create org_memory table on first use."""
    global _TABLE_READY
    if _TABLE_READY:
        return True
    try:
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS org_memory (
                id SERIAL PRIMARY KEY,
                org_id INT NOT NULL,
                kind VARCHAR(32) NOT NULL,
                label VARCHAR(160),
                content TEXT NOT NULL,
                metadata_json TEXT,
                source VARCHAR(64),
                tags VARCHAR(400),
                confidence VARCHAR(16) DEFAULT 'medium',
                archived BOOLEAN DEFAULT FALSE NOT NULL,
                last_used_at TIMESTAMP,
                usage_count INT DEFAULT 0 NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
            )
        """))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_org_memory_org ON org_memory (org_id)"
        ))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_org_memory_kind ON org_memory (org_id, kind)"
        ))
        db.session.commit()
        _TABLE_READY = True
        return True
    except Exception as e:
        try:
            db.session.rollback()
        except Exception:
            pass
        logger.error(f"org_memory table create failed: {e}")
        return False


def list_for_org(org_id, *, kind=None, archived=False, limit=200):
    """Return memory items for an org, optionally filtered by kind."""
    if not _ensure_table():
        return []
    from app.models.org_memory import OrgMemory
    q = OrgMemory.query.filter_by(org_id=org_id, archived=archived)
    if kind:
        q = q.filter_by(kind=kind)
    return q.order_by(OrgMemory.usage_count.desc(),
                      OrgMemory.updated_at.desc()).limit(limit).all()


def add_item(org_id, *, kind, content, label=None, metadata=None,
             source='manual', tags=None, confidence='high'):
    """Insert a new memory item. Returns the item or None on failure."""
    if not _ensure_table():
        return None
    from app.models.org_memory import OrgMemory
    try:
        item = OrgMemory(
            org_id=org_id,
            kind=kind,
            label=label,
            content=content[:6000] if content else '',
            metadata_json=json.dumps(metadata, default=str) if metadata else None,
            source=source,
            tags=','.join(tags) if isinstance(tags, list) else tags,
            confidence=confidence,
        )
        db.session.add(item)
        db.session.commit()
        return item
    except Exception as e:
        db.session.rollback()
        logger.error(f"add_item failed: {e}")
        return None


def update_item(item_id, *, org_id, **fields):
    """Update label/content/tags/archived for an item the org owns."""
    if not _ensure_table():
        return None
    from app.models.org_memory import OrgMemory
    item = OrgMemory.query.filter_by(id=item_id, org_id=org_id).first()
    if not item:
        return None
    try:
        for k, v in fields.items():
            if k == 'content' and v is not None:
                item.content = v[:6000]
            elif k == 'metadata' and v is not None:
                item.metadata_json = json.dumps(v, default=str)
            elif k == 'tags':
                item.tags = ','.join(v) if isinstance(v, list) else v
            elif k in ('label', 'kind', 'confidence', 'archived'):
                setattr(item, k, v)
        db.session.commit()
        return item
    except Exception as e:
        db.session.rollback()
        logger.error(f"update_item failed: {e}")
        return None


def delete_item(item_id, *, org_id):
    """Hard delete (vs archive). Used when the user clicks Delete."""
    if not _ensure_table():
        return False
    from app.models.org_memory import OrgMemory
    item = OrgMemory.query.filter_by(id=item_id, org_id=org_id).first()
    if not item:
        return False
    try:
        db.session.delete(item)
        db.session.commit()
        return True
    except Exception as e:
        db.session.rollback()
        logger.error(f"delete_item failed: {e}")
        return False


def retrieve_relevant(org_id, *, sectors=None, countries=None,
                      criteria=None, limit=12):
    """Return the most-relevant memory items for a grant context.

    Ranking: items whose tags intersect grant sectors+countries first,
    then highest usage_count, then most-recent updated_at. We cap at
    `limit` items so the AI prompt stays bounded.
    """
    if not _ensure_table():
        return []
    from app.models.org_memory import OrgMemory

    try:
        all_items = OrgMemory.query.filter_by(org_id=org_id, archived=False).all()
    except Exception as e:
        logger.warning(f"retrieve_relevant query failed: {e}")
        return []

    target_tags = set()
    for s in (sectors or []):
        target_tags.add((s or '').strip().lower())
    for c in (countries or []):
        target_tags.add((c or '').strip().lower())
    # Pull simple keywords out of criteria labels (lowercased, stop-word stripped).
    for cr in (criteria or []):
        label = (cr.get('label') or '') if isinstance(cr, dict) else str(cr)
        for word in re.findall(r'[A-Za-z]{4,}', label.lower()):
            if word not in {'with', 'from', 'this', 'that', 'have', 'been',
                            'them', 'their', 'will', 'shall', 'into', 'about'}:
                target_tags.add(word)

    def score(item):
        tags = set((item.tags or '').lower().split(','))
        intersect = len(tags & target_tags)
        usage = item.usage_count or 0
        return (intersect, usage)

    ranked = sorted(all_items, key=score, reverse=True)
    return ranked[:limit]


def mark_used(item_ids):
    """Bump usage_count + last_used_at on a list of ids."""
    if not item_ids or not _ensure_table():
        return
    try:
        for item_id in item_ids:
            db.session.execute(text(
                "UPDATE org_memory SET usage_count = COALESCE(usage_count,0) + 1, "
                "last_used_at = CURRENT_TIMESTAMP WHERE id = :id"
            ), {'id': item_id})
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        logger.error(f"mark_used failed: {e}")


# ---------------------------------------------------------------------------
# Auto-extraction
# ---------------------------------------------------------------------------

_NUMBER_PATTERN = re.compile(
    r'\b(\d[\d,\.]*)\s+'
    r'(beneficiar(?:y|ies)|farmers|women|men|children|youth|households|trainees|'
    r'CHWs?|community health workers|teachers|students|patients|families|villages|'
    r'kilometres?|km|hectares?|wells?|boreholes?|schools?|clinics?|projects?|grants?)',
    re.IGNORECASE,
)


def auto_extract_from_application(application):
    """Extract candidate memory items from a saved application.

    Called when an application is submitted (or saved) so the next time
    the org applies, the AI co-author has structured access to whatever
    they wrote. Only auto-creates items that don't already exist (rough
    text de-duplication via content prefix).
    """
    if not _ensure_table() or application is None:
        return 0
    try:
        responses = application.get_responses() if hasattr(application, 'get_responses') else {}
    except Exception:
        responses = {}
    if not responses:
        return 0

    org_id = getattr(application, 'ngo_org_id', None)
    if not org_id:
        return 0

    from app.models.org_memory import OrgMemory

    existing_prefixes = set()
    try:
        for prev in OrgMemory.query.filter_by(org_id=org_id).all():
            if prev.content:
                existing_prefixes.add(prev.content[:80].lower().strip())
    except Exception:
        pass

    added = 0
    for criterion_key, response_text in responses.items():
        if not isinstance(response_text, str) or len(response_text) < 80:
            continue
        # Find all "1,247 beneficiaries" style facts.
        for m in _NUMBER_PATTERN.finditer(response_text):
            full = m.group(0).strip()
            # Take a 140-char window around the match for context.
            start = max(0, m.start() - 60)
            end = min(len(response_text), m.end() + 60)
            context = response_text[start:end].strip()
            prefix = context[:80].lower().strip()
            if prefix in existing_prefixes:
                continue
            existing_prefixes.add(prefix)
            try:
                item = OrgMemory(
                    org_id=org_id,
                    kind='fact',
                    label=full[:120],
                    content=context[:600],
                    source=f'application:{application.id}',
                    confidence='medium',
                )
                db.session.add(item)
                added += 1
                if added >= 8:  # cap per application to avoid noise
                    break
            except Exception:
                continue
        if added >= 8:
            break

    if added > 0:
        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            logger.error(f"auto_extract_from_application commit failed: {e}")
            return 0
    return added


def render_for_ai_prompt(items, *, max_chars=2400):
    """Format memory items as a compact block for inclusion in AI prompts.

    The output looks like:
      ORG MEMORY (use these where relevant; cite via source_kind='profile'):
        • [fact] Beneficiaries 2024 — "we trained 1,247 CHWs in Kakamega..."
        • [narrative] Theory of change — "communities thrive when..."
        • [partner] WASH partnership with WaterAid — "..."

    Truncates to max_chars to keep prompt cost bounded.
    """
    if not items:
        return ''
    lines = ["ORG MEMORY (use these where relevant; cite via source_kind='profile'):"]
    used_ids = []
    for item in items:
        snippet = (item.content or '').strip().replace('\n', ' ')
        if len(snippet) > 200:
            snippet = snippet[:197] + '…'
        line = f"  • [{item.kind}] {item.label or ''} — {snippet}"
        if sum(len(l) for l in lines) + len(line) > max_chars:
            break
        lines.append(line)
        used_ids.append(item.id)
    return '\n'.join(lines), used_ids
