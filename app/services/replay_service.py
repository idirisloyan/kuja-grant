"""
Phase 102 — Audit chain replay tooling.

Helper for logging AI calls with full input/output text + audit chain
entry, plus a lookup helper the admin replay endpoint uses.

When a donor/regulator/auditor asks "what AI input/output produced this
audit decision," replay returns the literal prompt and response. Without
this, the hash-chained audit log proves something happened — but not
what.

Usage at the AI call site:

  from app.services.replay_service import log_replayable_ai_call

  call_id = log_replayable_ai_call(
      endpoint='ai-pre-submit-prediction',
      user_id=current_user.id,
      input_text=full_prompt,
      output_text=raw_response,
      model='claude-sonnet-4-6',
      tokens_in=usage.input_tokens,
      tokens_out=usage.output_tokens,
      duration_ms=ms,
      success=True,
      subject_kind='application',
      subject_id=application.id,
  )
  AuditChainEntry.append(
      action='ai.pre_submit_prediction',
      actor_email=current_user.email,
      subject_kind='application',
      subject_id=application.id,
      details={'ai_call_id': call_id, 'predicted_band': band, ...},
  )

Then on the dispute path:

  GET /api/admin/audit/<entry_id>/replay

returns the audit row, the linked AI call, and the full input/output
strings so the admin (or any third-party verifier given admin access)
can reproduce the decision.
"""

from __future__ import annotations

import logging
from typing import Any

from app.extensions import db
from app.models.ai_thread import AICallLog

logger = logging.getLogger('kuja')


def log_replayable_ai_call(
    *,
    endpoint: str,
    user_id: int | None,
    input_text: str | None,
    output_text: str | None,
    model: str | None = None,
    tokens_in: int | None = None,
    tokens_out: int | None = None,
    duration_ms: int | None = None,
    success: bool = True,
    error_code: str | None = None,
    error_message: str | None = None,
    subject_kind: str | None = None,
    subject_id: int | None = None,
) -> int | None:
    """Log an AI call with full input/output text for later replay.

    Best-effort — returns the new AICallLog id on success, None on
    persistence error. Truncates input_text + output_text to a sane
    upper bound (256 KB each) so a pathological prompt or runaway
    response can't blow up the DB.
    """
    MAX = 256 * 1024
    try:
        row = AICallLog(
            endpoint=endpoint[:80],
            user_id=user_id,
            success=success,
            duration_ms=duration_ms,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            model=(model or '')[:80] or None,
            error_code=(error_code or '')[:60] or None,
            error_message=(error_message or '')[:500] or None,
            input_text=(input_text or '')[:MAX] or None,
            output_text=(output_text or '')[:MAX] or None,
            replay_subject_kind=(subject_kind or '')[:40] or None,
            replay_subject_id=subject_id,
        )
        db.session.add(row)
        db.session.commit()
        return row.id
    except Exception as e:
        logger.warning('replay_service log failed: %s', e)
        db.session.rollback()
        return None


def lookup_ai_call_by_subject(
    subject_kind: str, subject_id: int, endpoint: str | None = None,
) -> list[AICallLog]:
    """Find AI calls attached to a given audit subject. Useful when the
    audit chain entry doesn't directly carry an ai_call_id but the
    subject pair (kind, id) is enough to reconstruct."""
    q = (
        AICallLog.query
        .filter(AICallLog.replay_subject_kind == subject_kind)
        .filter(AICallLog.replay_subject_id == subject_id)
    )
    if endpoint:
        q = q.filter(AICallLog.endpoint == endpoint)
    return q.order_by(AICallLog.created_at.desc()).all()
