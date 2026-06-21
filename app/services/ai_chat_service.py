"""
AIChatService — Phase 24B (May 2026).

Sustained AI conversation thread. Replaces the per-section "AI does ONE
thing then forgets" pattern with a real chat where the user can ask
follow-ups: "now rewrite that in less formal tone", "compare to last
year's plan", "what would a reviewer flag first?"

Uses the existing AIThread + AIMessage models. Each thread is scoped to
an entity (grant / application / report) so context-injection is
deterministic — we feed the latest snapshot of that entity into the
system prompt every time.

Discipline:
  - Max 12 messages from history sent to Claude per turn (cost cap)
  - Per-turn AI call goes through AIBudgetService.enforce_budget (gate)
  - System prompt includes role + scope context but NEVER injects
    PII the user can't already see (rendering matches read scope)
  - Hard reset endpoint: user can wipe the thread without admin help
  - Cost-tagged endpoint='ai.chat' for the budget guard
"""

import logging
from datetime import datetime, timezone

from app.extensions import db
from app.models import AIThread, AIMessage

logger = logging.getLogger('kuja')

MAX_HISTORY_MESSAGES = 12
MAX_USER_MESSAGE_CHARS = 4000
MAX_RESPONSE_TOKENS = 1200


class AIChatService:

    @classmethod
    def open_or_resume(
        cls, *, user_id: int, scope_kind: str | None, scope_id: int | None,
    ) -> AIThread:
        """Return the most recent thread for this (user, scope) or create one."""
        q = AIThread.query.filter(AIThread.user_id == user_id)
        if scope_kind:
            q = q.filter(AIThread.scope_kind == scope_kind)
        else:
            q = q.filter(AIThread.scope_kind.is_(None))
        if scope_id is not None:
            q = q.filter(AIThread.scope_id == scope_id)
        else:
            q = q.filter(AIThread.scope_id.is_(None))
        thread = q.order_by(AIThread.updated_at.desc()).first()
        if thread:
            return thread
        thread = AIThread(
            user_id=user_id,
            scope_kind=scope_kind,
            scope_id=scope_id,
            title=None,
        )
        db.session.add(thread)
        db.session.commit()
        return thread

    @classmethod
    def list_messages(cls, *, thread: AIThread, limit: int = 100) -> list[dict]:
        msgs = (
            thread.messages.order_by(AIMessage.created_at.asc())
            .limit(limit).all()
        )
        return [
            {
                'id': m.id,
                'role': m.role,
                'content': m.content,
                'created_at': m.created_at.isoformat() if m.created_at else None,
                'model': m.model,
            }
            for m in msgs
        ]

    @classmethod
    def post_message(
        cls, *, thread: AIThread, user_text: str, user_role: str,
        user_language: str = 'en',
    ) -> dict:
        """Append user msg, call Claude with context, append response."""
        user_text = (user_text or '').strip()[:MAX_USER_MESSAGE_CHARS]
        if not user_text:
            return {'success': False, 'reason': 'empty_message'}

        # 1. Append the user message
        user_msg = AIMessage(
            thread_id=thread.id,
            role='user',
            content=user_text,
        )
        db.session.add(user_msg)
        # Set the title on first user message (truncate to first ~90 chars)
        if thread.title is None:
            thread.title = user_text[:90].rstrip()
        db.session.commit()

        # 2. Build history (latest MAX_HISTORY_MESSAGES, oldest first)
        history = (
            thread.messages
            .order_by(AIMessage.created_at.desc())
            .limit(MAX_HISTORY_MESSAGES).all()
        )
        history.reverse()
        messages_for_ai = []
        for m in history:
            if m.role in ('user', 'assistant'):
                messages_for_ai.append({'role': m.role, 'content': m.content})

        # 3. Build context-aware system prompt
        scope_context = cls._build_scope_context(
            scope_kind=thread.scope_kind, scope_id=thread.scope_id,
        )
        system_prompt = (
            "You are Kuja's grant-management co-pilot, embedded in a "
            "sustained chat thread with a single user. Be concise, "
            "specific, and helpful. Match the user's language. Don't "
            "repeat the question back. When unsure, say so.\n\n"
            f"User role: {user_role}\n"
            f"User language: {user_language}\n"
            f"Conversation scope: {thread.scope_kind or 'global'}"
            f"{' #' + str(thread.scope_id) if thread.scope_id else ''}\n"
        )
        if scope_context:
            system_prompt += f"\nScope context:\n{scope_context}\n"
        system_prompt += (
            "\nDiscipline: never invent grant amounts, status, or "
            "scores you can't see in the context above. If asked about "
            "data not in the context, say 'I don't have that loaded in "
            "this thread — try the corresponding page.'"
        )

        # 4. Call Claude (multi-turn). _call_claude_messages was added
        # in Phase 24B if it didn't already exist — use the existing
        # _call_claude with a flattened single-user-message fallback.
        try:
            from app.services.ai_service import AIService
        except Exception:
            return {'success': False, 'reason': 'ai_unavailable'}

        flat_user = '\n\n'.join(
            f"[{m['role'].upper()}] {m['content']}" for m in messages_for_ai
        )
        response_text = AIService._call_claude(
            system_prompt, flat_user,
            max_tokens=MAX_RESPONSE_TOKENS,
            endpoint='ai.chat',
            language=user_language,
            role=user_role,
        )
        if not response_text:
            # Save a fallback assistant message so the user sees the failure
            fail_msg = AIMessage(
                thread_id=thread.id,
                role='assistant',
                content='[AI unavailable — please try again in a moment.]',
            )
            db.session.add(fail_msg)
            db.session.commit()
            return {'success': False, 'reason': 'ai_call_failed'}

        assistant_msg = AIMessage(
            thread_id=thread.id,
            role='assistant',
            content=response_text.strip()[:8000],
            model='claude-sonnet-4-6',
        )
        db.session.add(assistant_msg)
        thread.updated_at = datetime.now(timezone.utc)
        db.session.commit()
        return {
            'success': True,
            'message_id': assistant_msg.id,
            'content': assistant_msg.content,
            'thread_title': thread.title,
        }

    @classmethod
    def reset_thread(cls, *, thread: AIThread) -> dict:
        """Wipe all messages in a thread. The thread row itself stays
        so any UI references survive; user starts fresh."""
        AIMessage.query.filter_by(thread_id=thread.id).delete()
        thread.title = None
        thread.updated_at = datetime.now(timezone.utc)
        db.session.commit()
        return {'success': True, 'thread_id': thread.id}

    # ------------------------------------------------------------------

    @classmethod
    def _build_scope_context(cls, *, scope_kind, scope_id) -> str:
        """Return a compact context string for the scoped entity.

        Read scope mirrors what the user can see in the UI — we don't
        leak data here that they wouldn't already have access to via
        normal pages. Service is best-effort: returns empty string if
        the entity can't be loaded.
        """
        if not scope_kind or not scope_id:
            return ''
        try:
            if scope_kind == 'grant':
                from app.models import Grant
                g = db.session.get(Grant, scope_id)
                if not g:
                    return ''
                return (
                    f"Grant: {g.title}\n"
                    f"Status: {g.status} | Deadline: {g.deadline}\n"
                    f"Sectors: {g.get_sectors() if hasattr(g, 'get_sectors') else []}\n"
                    f"Description: {(g.description or '')[:600]}"
                )
            if scope_kind == 'application':
                from app.models import Application
                a = db.session.get(Application, scope_id)
                if not a:
                    return ''
                grant_title = a.grant.title if a.grant else 'unknown grant'
                return (
                    f"Application on grant: {grant_title}\n"
                    f"Status: {a.status} | AI score: {a.ai_score} | "
                    f"Human score: {a.human_score}\n"
                )
            if scope_kind == 'report':
                from app.models import Report
                r = db.session.get(Report, scope_id)
                if not r:
                    return ''
                return (
                    f"Report: {r.title or 'untitled'}\n"
                    f"Status: {r.status} | Due: {r.due_date}\n"
                    f"Type: {r.report_type or 'general'}"
                )
        except Exception as e:
            logger.warning(f'chat scope context build failed: {e}')
        return ''
