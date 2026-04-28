"""
Organizational Memory — Phase 10.5.

The team's spec: "Let NGOs build once, reuse often: organization facts,
standard narratives, past reports, common documents, evidence snippets.
AI should pull from that memory every time."

OrgMemory is the table the AI co-author reads from when drafting an
application response or a report section. The NGO doesn't have to
re-paste their mission, theory of change, or 2024 impact numbers into
every form — they live in OrgMemory and the AI cites them.

Memory kinds:
  fact        — atomic factual claim with a number, date, or named entity
                ('we trained 1,247 CHWs in Kakamega in Q3 2024')
  narrative   — a reusable paragraph the org has refined ('our theory
                of change is...')
  evidence    — a quote/snippet pulled from a document, with citation
  document    — a pointer to an uploaded document with summary
  metric      — a recurring KPI tracked over time
  partner     — a partner organization the NGO works with

Memory items are extracted from:
  - the org profile (mission, sectors, etc.) on creation
  - past applications (auto-extracted on app creation/submit)
  - past reports (auto-extracted on report creation/submit)
  - manual user-added items via the Org Memory page

last_used_at + usage_count let us surface the most-pulled items in the
admin view and let the AI prefer recent/proven items when the grant
context is ambiguous.
"""

from datetime import datetime, timezone
from app.extensions import db


class OrgMemory(db.Model):
    """One reusable piece of organizational knowledge."""
    __tablename__ = 'org_memory'
    __table_args__ = (
        db.Index('ix_org_memory_org', 'org_id'),
        db.Index('ix_org_memory_kind', 'org_id', 'kind'),
    )

    id = db.Column(db.Integer, primary_key=True)

    org_id = db.Column(db.Integer, db.ForeignKey('organizations.id'), nullable=False)

    # 'fact' | 'narrative' | 'evidence' | 'document' | 'metric' | 'partner'
    kind = db.Column(db.String(32), nullable=False)

    # Short label so the user sees what the item is at a glance
    # ('Beneficiaries 2024', 'Theory of change', 'WASH partnership').
    label = db.Column(db.String(160), nullable=True)

    # The actual content. For facts/narratives this is the text itself.
    # For document/evidence kinds the content is a quote/excerpt.
    content = db.Column(db.Text, nullable=False)

    # Optional structured metadata: e.g. for metric kind:
    # {"period": "Q3 2024", "value": 1247, "unit": "CHWs trained"}
    metadata_json = db.Column(db.Text, nullable=True)

    # Where this came from (auto-extraction lineage).
    # 'profile' | 'application:<id>' | 'report:<id>' | 'document:<id>' | 'manual'
    source = db.Column(db.String(64), nullable=True)

    # Tags for retrieval — sectors / countries / grant categories.
    # Comma-separated for simplicity (we're not doing vector retrieval yet).
    tags = db.Column(db.String(400), nullable=True)

    # Confidence in the item (manual=high, auto-extracted=medium, AI-inferred=low).
    confidence = db.Column(db.String(16), nullable=True, default='medium')

    # Soft-archive: items the user has explicitly hidden.
    archived = db.Column(db.Boolean, default=False, nullable=False)

    # Usage tracking — surfaces "your most-used items" in the org memory UI
    # and lets the AI prefer proven/recent items when context is ambiguous.
    last_used_at = db.Column(db.DateTime, nullable=True)
    usage_count = db.Column(db.Integer, default=0, nullable=False)

    created_at = db.Column(db.DateTime,
                           default=lambda: datetime.now(timezone.utc),
                           nullable=False)
    updated_at = db.Column(db.DateTime,
                           default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc),
                           nullable=False)

    def to_dict(self):
        import json as _json
        meta = None
        if self.metadata_json:
            try:
                meta = _json.loads(self.metadata_json)
            except (ValueError, TypeError):
                meta = {'raw': self.metadata_json[:200]}
        return {
            'id': self.id,
            'org_id': self.org_id,
            'kind': self.kind,
            'label': self.label,
            'content': self.content,
            'metadata': meta,
            'source': self.source,
            'tags': [t.strip() for t in (self.tags or '').split(',') if t.strip()],
            'confidence': self.confidence,
            'archived': self.archived,
            'last_used_at': self.last_used_at.isoformat() if self.last_used_at else None,
            'usage_count': self.usage_count,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

    def mark_used(self):
        """Bump usage signal — called by AI co-author when this item is pulled."""
        self.last_used_at = datetime.now(timezone.utc)
        self.usage_count = (self.usage_count or 0) + 1
