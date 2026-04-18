"""AI Thread + Message + Call Log models.

Added in Phase 2 of the Kuja "category-defining" upgrade. Three concerns:

  AIThread / AIMessage  — persist co-pilot conversations so users can
                          resume across page reloads / sessions.
  AICallLog             — observability: every AI endpoint hit is logged
                          with success state, duration, tokens, error
                          code. Powers the admin AI health panel.

NOTE: New tables — db.create_all() will create them in development.
For production, run: flask db migrate -m "add ai_threads + ai_messages + ai_call_logs"
"""

from datetime import datetime, timezone

from app.extensions import db


class AIThread(db.Model):
    """A conversation thread between a user and the Kuja co-pilot."""
    __tablename__ = 'ai_threads'
    __table_args__ = (
        db.Index('ix_ai_threads_user_updated', 'user_id', 'updated_at'),
        db.Index('ix_ai_threads_scope', 'scope_kind', 'scope_id'),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    # Scope this thread is anchored to (page-context). Lets us show the
    # right thread history when a user returns to a specific grant/app/etc.
    scope_kind = db.Column(db.String(40), nullable=True)  # 'global'|'grant'|'application'|'report'|'compliance'
    scope_id = db.Column(db.Integer, nullable=True)        # FK depends on scope_kind; loose link
    title = db.Column(db.String(200), nullable=True)       # truncated first user message
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    messages = db.relationship('AIMessage', backref='thread', lazy='dynamic',
                                cascade='all, delete-orphan',
                                order_by='AIMessage.created_at')

    def to_dict(self, include_messages=False):
        out = {
            'id': self.id,
            'user_id': self.user_id,
            'scope_kind': self.scope_kind,
            'scope_id': self.scope_id,
            'title': self.title,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_messages:
            out['messages'] = [m.to_dict() for m in self.messages]
        return out


class AIMessage(db.Model):
    """A single user/assistant turn within an AIThread."""
    __tablename__ = 'ai_messages'
    __table_args__ = (
        db.Index('ix_ai_messages_thread_created', 'thread_id', 'created_at'),
    )

    id = db.Column(db.Integer, primary_key=True)
    thread_id = db.Column(db.Integer, db.ForeignKey('ai_threads.id', ondelete='CASCADE'),
                          nullable=False)
    role = db.Column(db.String(20), nullable=False)  # 'user' | 'assistant' | 'system'
    content = db.Column(db.Text, nullable=False)
    # Optional structured payload (citations, tool calls, etc.)
    meta_json = db.Column(db.Text, nullable=True)
    tokens_in = db.Column(db.Integer, nullable=True)
    tokens_out = db.Column(db.Integer, nullable=True)
    model = db.Column(db.String(80), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'thread_id': self.thread_id,
            'role': self.role,
            'content': self.content,
            'meta_json': self.meta_json,
            'tokens_in': self.tokens_in,
            'tokens_out': self.tokens_out,
            'model': self.model,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class AICallLog(db.Model):
    """Observability log for every AI endpoint invocation.

    Used by the admin AI health panel + alerting. Independent of AIThread —
    short-lived calls (insight narration, suggestions) write rows here too.
    """
    __tablename__ = 'ai_call_logs'
    __table_args__ = (
        db.Index('ix_ai_call_logs_endpoint_created', 'endpoint', 'created_at'),
        db.Index('ix_ai_call_logs_user_created', 'user_id', 'created_at'),
        db.Index('ix_ai_call_logs_success', 'success'),
    )

    id = db.Column(db.Integer, primary_key=True)
    endpoint = db.Column(db.String(80), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    success = db.Column(db.Boolean, default=True, nullable=False)
    duration_ms = db.Column(db.Integer, nullable=True)
    tokens_in = db.Column(db.Integer, nullable=True)
    tokens_out = db.Column(db.Integer, nullable=True)
    model = db.Column(db.String(80), nullable=True)
    error_code = db.Column(db.String(60), nullable=True)
    error_message = db.Column(db.String(500), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'endpoint': self.endpoint,
            'user_id': self.user_id,
            'success': self.success,
            'duration_ms': self.duration_ms,
            'tokens_in': self.tokens_in,
            'tokens_out': self.tokens_out,
            'model': self.model,
            'error_code': self.error_code,
            'error_message': self.error_message,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
