'use client';

/**
 * AIChatPanel — Phase 24E (May 2026).
 *
 * UI for the sustained AI conversation thread backed by /api/ai/threads/*.
 * Distinct from the legacy <CopilotRail> "Ask" tab — that's a stateless
 * one-shot streaming call; this is a real chat where prior turns
 * persist and Claude sees the history.
 *
 * Props:
 *   - scope: optional { kind: 'grant'|'application'|'report', id }
 *     so the backend can fold that entity's snapshot into the system
 *     prompt every turn.
 *
 * UX:
 *   - On mount: POST /threads/open → returns thread, then GET messages
 *   - Send: POST /threads/{id}/messages, optimistic-add the user line,
 *     show "thinking…" placeholder, swap in the real assistant reply
 *   - Reset: POST /threads/{id}/reset, clears the bubble list
 *   - Empty state nudges 3 example prompts so users don't stare at a
 *     blank input
 */

import { useEffect, useRef, useState } from 'react';
import { Send, RotateCcw, Loader2, MessageSquare, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';

interface ChatMessage {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  pending?: boolean;
}

interface OpenResp {
  success: boolean;
  thread_id: number;
  title?: string | null;
  messages?: ChatMessage[];
}

interface PostResp {
  success: boolean;
  reason?: string;
  message_id?: number;
  content?: string;
  thread_title?: string | null;
}

interface ChatScope {
  kind: 'grant' | 'application' | 'report';
  id: number;
}

const EXAMPLES: Record<string, string[]> = {
  global: [
    'What should I prioritise today?',
    'Summarise my open risks in one paragraph.',
    'What would a reviewer flag first about my last submission?',
  ],
  grant: [
    'Rewrite this scope in a less formal tone.',
    'How does this compare to last year\'s plan?',
    'What are the top 3 risks reviewers will flag?',
  ],
  application: [
    'Where is this application weakest vs the criteria?',
    'Draft a one-paragraph reply to the donor for the comments tab.',
    'What does my fit score depend on most?',
  ],
  report: [
    'What evidence is missing from this report?',
    'Rephrase the activities section more concisely.',
    'Does the budget narrative match the figures?',
  ],
};

export function AIChatPanel({ scope }: { scope?: ChatScope }) {
  const user = useAuthStore((s) => s.user);
  const [threadId, setThreadId] = useState<number | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scopeKind = scope?.kind ?? 'global';
  const exampleKey = scope?.kind ?? 'global';

  // Open or resume the thread
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setInitializing(true);
    api.post<OpenResp>('/api/ai/threads/open', {
      scope_kind: scope?.kind ?? null,
      scope_id: scope?.id ?? null,
    }).then((r) => {
      if (cancelled || !r.success) return;
      setThreadId(r.thread_id);
      setTitle(r.title ?? null);
      setMessages(r.messages ?? []);
    }).catch(() => { /* quiet — leave empty */ })
    .finally(() => { if (!cancelled) setInitializing(false); });
    return () => { cancelled = true; };
  }, [user, scope?.kind, scope?.id]);

  // Auto-scroll on new content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const send = async (text: string) => {
    if (!threadId || !text.trim() || busy) return;
    const userMsg: ChatMessage = { role: 'user', content: text.trim() };
    const pendingMsg: ChatMessage = { role: 'assistant', content: '', pending: true };
    setMessages((prev) => [...prev, userMsg, pendingMsg]);
    setDraft('');
    setBusy(true);
    try {
      const r = await api.post<PostResp>(
        `/api/ai/threads/${threadId}/messages`,
        { content: text.trim() },
      );
      setMessages((prev) => {
        const next = [...prev];
        // Replace the pending assistant bubble
        const lastIdx = next.length - 1;
        next[lastIdx] = {
          role: 'assistant',
          content: r.success && r.content
            ? r.content
            : '[The AI is unavailable for a moment — try again shortly.]',
          id: r.message_id,
        };
        return next;
      });
      if (r.thread_title) setTitle(r.thread_title);
    } catch {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          role: 'assistant',
          content: '[Network blip — please retry.]',
        };
        return next;
      });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!threadId || busy) return;
    if (!window.confirm('Clear this conversation? The thread starts fresh.')) return;
    try {
      await api.post(`/api/ai/threads/${threadId}/reset`, {});
      setMessages([]);
      setTitle(null);
    } catch { /* noop */ }
  };

  if (!user) return null;

  return (
    <Card className="flex h-[640px] max-h-[80vh] flex-col overflow-hidden">
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <Sparkles className="h-4 w-4 text-[hsl(var(--kuja-clay))]" />
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-wide font-semibold text-[hsl(var(--kuja-clay))]">
            Kuja chat
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {title ?? `New conversation · scope: ${scopeKind}`}
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={reset}
          disabled={busy || !threadId || messages.length === 0}
          className="gap-1.5"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </Button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {initializing && (
          <div className="flex items-center justify-center text-sm text-muted-foreground gap-2 py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Opening thread…
          </div>
        )}
        {!initializing && messages.length === 0 && (
          <div className="text-center py-6 space-y-3">
            <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto" />
            <div className="text-sm font-semibold">Start a real conversation</div>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Ask follow-ups. Compare across turns. Revise in place. Kuja remembers
              this thread for as long as you want it to.
            </p>
            <div className="flex flex-col gap-1.5 items-stretch max-w-xs mx-auto">
              {(EXAMPLES[exampleKey] ?? EXAMPLES.global).map((ex) => (
                <button
                  type="button"
                  key={ex}
                  onClick={() => send(ex)}
                  className="text-left text-xs px-3 py-2 rounded-md border border-[hsl(var(--border))] hover:border-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-sand))]/30 transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              'flex',
              m.role === 'user' ? 'justify-end' : 'justify-start',
            )}
          >
            <div
              className={cn(
                'rounded-md px-3 py-2 text-sm max-w-[88%] whitespace-pre-wrap',
                m.role === 'user'
                  ? 'bg-[hsl(var(--kuja-clay))] text-white'
                  : 'bg-[hsl(var(--muted))] text-foreground',
              )}
            >
              {m.pending ? (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> thinking…
                </span>
              ) : m.content}
            </div>
          </div>
        ))}
      </div>

      <form
        className="flex items-end gap-2 border-t p-2"
        onSubmit={(e) => { e.preventDefault(); send(draft); }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(draft);
            }
          }}
          placeholder="Ask, refine, follow up…  (Enter to send · Shift+Enter for newline)"
          rows={2}
          maxLength={4000}
          disabled={busy || !threadId}
          className="flex-1 resize-none rounded-md border border-[hsl(var(--border))] bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[hsl(var(--kuja-clay))]"
        />
        <Button
          type="submit"
          size="sm"
          disabled={busy || !threadId || !draft.trim()}
          className="bg-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay))]/90 text-white gap-1.5"
        >
          {busy
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Send className="h-3.5 w-3.5" />}
          Send
        </Button>
      </form>
    </Card>
  );
}
