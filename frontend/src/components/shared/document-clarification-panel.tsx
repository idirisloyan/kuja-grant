'use client';

/**
 * DocumentClarificationPanel — Phase 13.26
 *
 * NGO-facing surface that lets the document uploader add context the
 * AI missed: "this finding doesn't apply because we used methodology X."
 * Donor sees the clarification alongside the AI analysis on review.
 *
 * Drop into any document detail surface (NGO-side application doc list,
 * compliance workspace, etc.). Shows current clarification + edit
 * affordance + last-edited stamp.
 *
 * Save semantics: explicit "Save" button (not auto-save) because
 * clarifications are meaningful statements the user wants to compose
 * deliberately, not throwaway text.
 */

import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Pencil, Save, X, Loader2 } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props {
  documentId: number;
  /** Existing clarification, if any. */
  initialValue?: string | null;
  /** ISO timestamp of the last clarification edit. */
  lastUpdatedAt?: string | null;
  /** Read-only mode (donor / reviewer viewing the NGO's clarification). */
  readOnly?: boolean;
  className?: string;
}

export function DocumentClarificationPanel({
  documentId, initialValue, lastUpdatedAt, readOnly, className,
}: Props) {
  const { t, formatDate } = useTranslation();
  const [text, setText] = useState(initialValue ?? '');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setText(initialValue ?? ''); }, [initialValue]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await api.patch(`/documents/${documentId}/clarification`, {
        clarification: text.trim(),
      });
      toast.success(t('clarification.saved'));
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [documentId, text, t]);

  const hasContent = (text || '').trim().length > 0;

  // Read-only viewers see only the saved clarification (or nothing).
  if (readOnly) {
    if (!hasContent) return null;
    return (
      <div className={cn('rounded-md border border-[hsl(var(--kuja-clay))]/30 bg-[hsl(var(--kuja-clay))]/5 p-3', className)}>
        <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-[hsl(var(--kuja-clay))]">
          <MessageSquare className="h-3 w-3" />
          {t('clarification.uploader_note')}
          {lastUpdatedAt && (
            <span className="ml-auto text-[9px] font-normal text-muted-foreground">
              {formatDate(lastUpdatedAt)}
            </span>
          )}
        </div>
        <p className="text-sm text-foreground whitespace-pre-line">{text}</p>
      </div>
    );
  }

  return (
    <div className={cn('rounded-md border border-border bg-background p-3', className)}>
      <div className="mb-2 flex items-center gap-1.5">
        <MessageSquare className="h-3.5 w-3.5 text-[hsl(var(--kuja-clay))]" />
        <span className="text-xs font-semibold">{t('clarification.title')}</span>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] font-medium hover:bg-muted"
          >
            <Pencil className="h-3 w-3" />
            {hasContent ? t('common.edit') : t('clarification.add')}
          </button>
        )}
      </div>

      {!editing && hasContent && (
        <p className="text-sm text-foreground whitespace-pre-line">{text}</p>
      )}
      {!editing && !hasContent && (
        <p className="text-xs text-muted-foreground italic">{t('clarification.empty_hint')}</p>
      )}

      {editing && (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('clarification.placeholder')}
            rows={4}
            maxLength={4000}
            disabled={saving}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-clay))] disabled:opacity-60"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">
              {text.length} / 4000
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => { setEditing(false); setText(initialValue ?? ''); }}
                disabled={saving}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted"
              >
                <X className="h-3 w-3" />
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-1 rounded-md bg-[hsl(var(--kuja-clay))] px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                {t('common.save')}
              </button>
            </div>
          </div>
        </>
      )}

      {!editing && lastUpdatedAt && hasContent && (
        <p className="mt-2 text-[10px] italic text-muted-foreground">
          {t('clarification.last_edited', { ts: formatDate(lastUpdatedAt) })}
        </p>
      )}
    </div>
  );
}
