"""
AI provenance — every AI-generated claim links back to its source(s).

A single AI output (e.g. one drafted application section) typically has
many provenance rows: each factual claim or recommendation cites which
source document, page/section, and how confident the model was.

Used by the Phase 5.1 provenance UI (source chips, doc-highlight panel)
and by the audit trail (Phase 5.3) so NGOs can see "where did this
sentence come from?"

Source kinds:
    'document'   — uploaded file (Document model)
    'application'— prior application by same org
    'report'     — prior report by same org
    'grant'      — text from the grant agreement / criteria
    'profile'    — org profile field
    'web'        — external web fetch (rare; AI tool calls)
    'ai_general' — model knowledge, no specific document

Confidence is bucketed (high/medium/low) so the UI can render a clear
indicator without exposing raw probabilities (which calibrate poorly).
"""

from datetime import datetime, timezone
from app.extensions import db


class AIProvenance(db.Model):
    """One source citation for one AI-generated claim."""
    __tablename__ = 'ai_provenance'
    __table_args__ = (
        db.Index('ix_ai_provenance_call', 'ai_call_id'),
        db.Index('ix_ai_provenance_subject', 'subject_kind', 'subject_id'),
    )

    id = db.Column(db.Integer, primary_key=True)

    # Which AI invocation produced this provenance row.
    ai_call_id = db.Column(db.Integer, db.ForeignKey('ai_call_logs.id'), nullable=True)

    # What the AI was working on (the subject of the output).
    # E.g. application=42, criterion='impact'  →  subject_kind='application',
    # subject_id=42, subject_field='impact'.
    subject_kind = db.Column(db.String(40), nullable=False)
    subject_id = db.Column(db.Integer, nullable=True)
    subject_field = db.Column(db.String(120), nullable=True)

    # The claim itself — short snippet of AI output this citation supports.
    # Stored truncated to 500 chars; the full output lives elsewhere.
    claim = db.Column(db.String(500), nullable=False)

    # Where the claim came from.
    source_kind = db.Column(db.String(40), nullable=False)
    source_id = db.Column(db.Integer, nullable=True)
    source_locator = db.Column(db.String(200), nullable=True)  # 'page 3', 'section 2.1', etc.
    source_excerpt = db.Column(db.String(800), nullable=True)  # the actual quoted text

    # Bucketed confidence: 'high' / 'medium' / 'low'.
    confidence = db.Column(db.String(16), nullable=True, default='medium')

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'ai_call_id': self.ai_call_id,
            'subject': {
                'kind': self.subject_kind,
                'id': self.subject_id,
                'field': self.subject_field,
            },
            'claim': self.claim,
            'source': {
                'kind': self.source_kind,
                'id': self.source_id,
                'locator': self.source_locator,
                'excerpt': self.source_excerpt,
            },
            'confidence': self.confidence,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
