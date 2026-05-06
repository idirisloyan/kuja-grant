'use client';

/**
 * EntityCommentsThread — Phase 13.18 UI
 *
 * Polymorphic comments thread for any entity (application / grant /
 * report / risk / organization). PMO's pattern: @mention syntax is
 * @<email-localpart>; backend resolves to user IDs and writes
 * Notification rows for the mentioned users.
 *
 * Drop into any entity detail page:
 *   <EntityCommentsThread entityKind="application" entityId={42} />
 *
 * Uses /api/comments/ (Phase 13.18 backend).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  MessageSquare, AtSign, Send, Pencil, Trash2, X, Save, Loader2,
} from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type EntityKind = 'application' | 'grant' | 'report' | 'risk' | 'organization';

interface CommentAuthor {
  user_id: number;
  name: string | null;
  email: string | null;
}

interface Comment {
  id: number;
  entity_kind: string;
  entity_id: number;
  author: CommentAuthor;
  body_md: string;
  mentioned_user_ids: number[];
  created_at: string;
  edited_at: string | null;
  resolved_at: string | null;
}

interface Props {
  entityKind: EntityKind;
  entityId: number | null;
  className?: string;
}

/** Tiny markdown-lite renderer: turns @handle into a chip + escapes HTML.
 *  Falls through to plain text otherwise. Keeps the bundle slim — no
 *  full markdown parser. */
function renderBody(body: string): React.ReactNode {
  if (!body) return null;
  const parts: Array<string | React.ReactNode> = [];
  const re = /@([A-Za-z0-9._-]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) parts.push(body.slice(last, m.index));
    parts.push(
      <span
        key={`m-${m.index}`}
        className="rounded bg-[hsl(var(--kuja-spark-soft))] px-1 py-0.5 text-[hsl(var(--kuja-spark))] font-medium"
      >
        @{m[1]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return parts.map((p, i) => (typeof p === 'string'
    ? <span key={i}>{p}</span>
    : p));
}

export function EntityCommentsThread({ entityKind, entityId, className }: Props) {
  const { t, formatDate } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const reload = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      const res = await api.get<{ comments: Comment[] }>(
        `/comments/?entity_kind=${entityKind}&entity_id=${entityId}`,
      );
      setComments(res.comments ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load comments');
    } finally {
      setLoading(false);
    }
  }, [entityKind, entityId]);

  useEffect(() => { void reload(); }, [reload]);

  const post = useCallback(async () => {
    if (!draft.trim() || posting || !entityId) return;
    setPosting(true);
    try {
      await api.post('/comments/', {
        entity_kind: entityKind,
        entity_id: entityId,
        body_md: draft.trim(),
      });
      setDraft('');
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Post failed');
    } finally {
      setPosting(false);
    }
  }, [draft, posting, entityId, entityKind, reload]);

  const startEdit = useCallback((c: Comment) => {
    setEditingId(c.id);
    setEditingDraft(c.body_md);
  }, []);

  const saveEdit = useCallback(async (id: number) => {
    try {
      await api.patch(`/comments/${id}`, { body_md: editingDraft.trim() });
      setEditingId(null);
      setEditingDraft('');
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    }
  }, [editingDraft, reload]);

  const remove = useCallback(async (id: number) => {
    if (!confirm(t('comments.delete_confirm'))) return;
    try {
      await api.delete(`/comments/${id}`);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  }, [t, reload]);

  const insertMention = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const next = draft.slice(0, start) + '@' + draft.slice(end);
    setDraft(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + 1, start + 1);
    });
  }, [draft]);

  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex items-center gap-1.5">
        <MessageSquare className="h-4 w-4 text-[hsl(var(--kuja-clay))]" />
        <h3 className="text-sm font-semibold">{t('comments.title')}</h3>
        <span className="text-[10px] font-normal text-muted-foreground">({comments.length})</span>
      </div>

      {error && (
        <div className="rounded-md border border-[hsl(var(--kuja-flag))]/30 bg-[hsl(0_85%_97%)] p-2 text-xs text-[hsl(var(--kuja-flag))]">
          {error}
        </div>
      )}

      {loading && comments.length === 0 ? (
        <div className="text-xs text-muted-foreground">{t('common.loading')}</div>
      ) : comments.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-center text-xs text-muted-foreground">
          {t('comments.empty')}
        </div>
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => {
            const isEditing = editingId === c.id;
            const isMine = user?.id === c.author.user_id;
            return (
              <li key={c.id} className="rounded-md border border-border bg-background p-3">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs font-semibold text-foreground">
                    {c.author.name || c.author.email || `User ${c.author.user_id}`}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDate(c.created_at)}
                  </span>
                  {c.edited_at && (
                    <span className="text-[10px] text-muted-foreground italic">
                      {t('comments.edited')}
                    </span>
                  )}
                  {(isMine || user?.role === 'admin') && !isEditing && (
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(c)}
                        className="rounded p-1 hover:bg-muted"
                        aria-label={t('common.edit')}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(c.id)}
                        className="rounded p-1 text-[hsl(var(--kuja-flag))] hover:bg-[hsl(0_85%_96%)]"
                        aria-label={t('common.delete')}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
                {isEditing ? (
                  <>
                    <textarea
                      value={editingDraft}
                      onChange={(e) => setEditingDraft(e.target.value)}
                      rows={3}
                      maxLength={4000}
                      className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-clay))]"
                    />
                    <div className="mt-1 flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => { setEditingId(null); setEditingDraft(''); }}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-muted"
                      >
                        <X className="h-3 w-3" />
                        {t('common.cancel')}
                      </button>
                      <button
                        type="button"
                        onClick={() => saveEdit(c.id)}
                        className="inline-flex items-center gap-1 rounded-md bg-[hsl(var(--kuja-clay))] px-3 py-1 text-xs font-medium text-white hover:opacity-90"
                      >
                        <Save className="h-3 w-3" />
                        {t('common.save')}
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-foreground whitespace-pre-line">{renderBody(c.body_md)}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Composer */}
      <div className="rounded-md border border-border bg-background p-2">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('comments.placeholder')}
          rows={3}
          maxLength={4000}
          disabled={posting || !entityId}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-clay))] disabled:opacity-60"
        />
        <div className="mt-1 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={insertMention}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-muted"
              aria-label={t('comments.insert_mention')}
            >
              <AtSign className="h-3 w-3" />
              {t('comments.mention')}
            </button>
            <span className="text-[10px] text-muted-foreground italic">
              {t('comments.mention_hint')}
            </span>
          </div>
          <button
            type="button"
            onClick={post}
            disabled={!draft.trim() || posting || !entityId}
            className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {posting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            {t('comments.post')}
          </button>
        </div>
      </div>
    </section>
  );
}
