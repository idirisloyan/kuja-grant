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
    uploaded_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

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
            'uploaded_at': self.uploaded_at.isoformat() if self.uploaded_at else None,
        }
