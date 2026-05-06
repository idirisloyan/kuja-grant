"""Document model - Uploaded documents attached to applications or assessments."""

from datetime import datetime, timezone

from app.extensions import db
from app.utils.helpers import _json_load, _json_dump


class Document(db.Model):
    """Uploaded documents attached to applications or assessments."""
    __tablename__ = 'documents'
    __table_args__ = (
        db.Index('ix_documents_stored_filename', 'stored_filename'),
    )

    id = db.Column(db.Integer, primary_key=True)
    application_id = db.Column(db.Integer, db.ForeignKey('applications.id'), nullable=True, index=True)
    assessment_id = db.Column(db.Integer, db.ForeignKey('assessments.id'), nullable=True, index=True)
    doc_type = db.Column(db.String(100), nullable=True)
    original_filename = db.Column(db.String(500), nullable=False)
    stored_filename = db.Column(db.String(500), nullable=False)
    file_size = db.Column(db.Integer, nullable=True)
    mime_type = db.Column(db.String(200), nullable=True)
    ai_analysis = db.Column(db.Text, nullable=True)  # JSON with score, findings, recommendations
    score = db.Column(db.Float, nullable=True)
    version = db.Column(db.Integer, default=1)
    supersedes_id = db.Column(db.Integer, db.ForeignKey('documents.id'), nullable=True)
    uploaded_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    # Phase 13.5 — extraction lifecycle columns (PMO transfer).
    # Lets the client recover state after a page refresh + gives ops
    # observability into stuck extraction jobs without log diving. Status
    # transitions: queued -> running -> completed | failed | timed_out | aborted.
    # extraction_failed_code uses PMO's vocabulary:
    #   no_document | text_extract_failed | text_too_short | timeout |
    #   ai_error | aborted | unknown
    extraction_status = db.Column(db.String(20), nullable=True, default=None)
    extraction_started_at = db.Column(db.DateTime, nullable=True)
    extraction_completed_at = db.Column(db.DateTime, nullable=True)
    extraction_failed_reason = db.Column(db.String(500), nullable=True)
    extraction_failed_code = db.Column(db.String(40), nullable=True)
    extraction_trace_id = db.Column(db.String(40), nullable=True)
    extraction_attempt_count = db.Column(db.Integer, nullable=True, default=0)
    # native_pdf flag set when the OCR-via-vision fallback path was used
    # (Phase 13.2). Surfaced in /admin/system-health as a quality signal.
    extraction_used_native_pdf = db.Column(db.Boolean, nullable=True, default=False)

    # Relationship to the document this one supersedes
    supersedes = db.relationship('Document', remote_side=[id], backref='superseded_by')

    # --- JSON helpers ---
    def get_ai_analysis(self):
        return _json_load(self.ai_analysis) or {}

    def set_ai_analysis(self, value):
        self.ai_analysis = _json_dump(value)

    def to_dict(self):
        return {
            'id': self.id,
            'application_id': self.application_id,
            'assessment_id': self.assessment_id,
            'doc_type': self.doc_type,
            'original_filename': self.original_filename,
            'stored_filename': self.stored_filename,
            'file_size': self.file_size,
            'mime_type': self.mime_type,
            'ai_analysis': self.get_ai_analysis(),
            'score': self.score,
            'version': self.version or 1,
            'supersedes_id': self.supersedes_id,
            'uploaded_at': self.uploaded_at.isoformat() if self.uploaded_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            # Phase 13.5 — extraction lifecycle (two-phase intake).
            'extraction': {
                'status': self.extraction_status,
                'started_at': self.extraction_started_at.isoformat() if self.extraction_started_at else None,
                'completed_at': self.extraction_completed_at.isoformat() if self.extraction_completed_at else None,
                'failed_reason': self.extraction_failed_reason,
                'failed_code': self.extraction_failed_code,
                'trace_id': self.extraction_trace_id,
                'attempt_count': self.extraction_attempt_count or 0,
                'used_native_pdf': bool(self.extraction_used_native_pdf),
            },
        }
