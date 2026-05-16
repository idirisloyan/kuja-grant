'use client';

/**
 * ApplicationMessageThread — Phase 20C (May 2026).
 *
 * Chat-style threaded messaging scoped to one application. Donor + NGO
 * + reviewer (assigned) + admin can all post; visibility is enforced
 * by the existing /api/comments routes (Phase 13.18).
 *
 * Why this is here: NGOs and donors today send email back-and-forth
 * during review. That history lives in inboxes, not on the
 * application. Threaded messages inline mean every reviewer can see
 * the conversation context.
 *
 * Posts use the existing EntityComment table. Renders sender role
 * badges so it's obvious who is who.
 */

import { useEffect, useRef, useState } from 'react';
import {
  MessageSquare, Send, Loader2, RefreshCw,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';

interface Comment {
  id: number;
  body_md: string;
  author_user_id: number;
  author_name?: string;
  author_email?: string;
  author_role?: string;
  created_at: string;
  edited_at?: string | null;
  resolved_at?: string | null;
}

interface ListResp {
  success: boolean;
  comments: Comment[];
}

const ROLE_TONE: Record<string, string> = {
  ngo:      'text-[hsl(var(--kuja-clay))] border-[hsl(var(--kuja-clay))]',
  donor:    'text-[hsl(var(--kuja-grow))] border-[hsl(var(--kuja-grow))]',
  reviewer: 'text-[hsl(var(--kuja-sun))] border-[hsl(var(--kuja-sun))]',
  admin:    'text-[hsl(var(--kuja-ink-soft))] border-[hsl(var(--kuja-ink-soft))]',
};

function fmtWhen(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

interface Props {
  applicationId: number;
}

export function ApplicationMessageThread({ applicationId }: Props) {
  const me = useAuthStore((s) => s.user);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  async function load(scroll = false) {
    try {
      const r = await api.get<ListResp>(
        `/api/comments/?entity_kind=application&entity_id=${applicationId}`,
      );
      if (r.success) {
        setComments(r.comments || []);
        if (scroll) setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
      }
    } catch {/* quiet */}
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (!applicationId) return;
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  async function post() {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    try {
      await api.post('/api/comments/', {
        entity_kind: 'application',
        entity_id: applicationId,
        body_md: body,
      });
      setDraft('');
      await load(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading conversation…
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-[hsl(var(--kuja-clay))]" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">
              Conversation
            </div>
            <h3 className="kuja-display text-lg">Donor &amp; NGO thread</h3>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            {comments.length} message{comments.length === 1 ? '' : 's'}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => load(false)}
            disabled={loading}
            aria-label="Refresh"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      <div className="max-h-[400px] overflow-y-auto space-y-2 mb-3 pr-1">
        {comments.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-2">
            No messages yet. Start the conversation below — both sides will see this thread.
          </p>
        ) : (
          comments.map((c) => {
            const mine = me?.id === c.author_user_id;
            const role = c.author_role ?? 'admin';
            const roleTone = ROLE_TONE[role] ?? ROLE_TONE.admin;
            return (
              <div
                key={c.id}
                className={cn(
                  'rounded-md border p-2',
                  mine
                    ? 'border-[hsl(var(--kuja-clay))]/40 bg-[hsl(var(--kuja-sand))]/30 ml-6'
                    : 'border-[hsl(var(--border))] mr-6',
                )}
              >
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-xs font-semibold">
                    {c.author_name ?? c.author_email ?? `User #${c.author_user_id}`}
                  </span>
                  <Badge variant="outline" className={cn('text-[10px] capitalize', roleTone)}>
                    {role}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {fmtWhen(c.created_at)}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{c.body_md}</p>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <div className="space-y-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask a question, share a clarification, or post a quick update… (4,000 chars max)"
          rows={3}
          maxLength={4000}
          onKeyDown={(e) => {
            // Ctrl/Cmd + Enter to send
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              void post();
            }
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] text-muted-foreground">
            Ctrl/Cmd + Enter to send. Mention with @email-username.
            {error && (
              <span className="ml-2 text-[hsl(var(--kuja-flag))]">{error}</span>
            )}
          </div>
          <Button
            size="sm"
            onClick={post}
            disabled={sending || !draft.trim()}
          >
            {sending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Send className="h-3.5 w-3.5" />}
            <span className="ml-1.5">Post</span>
          </Button>
        </div>
      </div>
    </Card>
  );
}
