'use client';

/**
 * MicroSurvey — Phase 31B (May 2026).
 *
 * Single-question NPS-style survey that fires at moments-of-completion
 * (application submit, report submit, etc). Captures perceived value
 * alongside the behavioural events recorded by UserEventService.
 *
 * UX discipline:
 *   - One question, 0-10 scale, optional comment
 *   - Skip is always one tap away — never block the user
 *   - Local-storage memory so the same surface+target isn't re-prompted
 *     on the same browser even before the server has confirmed save
 *   - Auto-dismiss after submit; brief thank-you state
 *   - Sparse-honest: if the user is unauthenticated we render nothing
 *
 * Usage:
 *   <MicroSurvey
 *     surface="application_submit"
 *     relatedKind="application"
 *     relatedId={appId}
 *     question="How helpful was Kuja in preparing this application?"
 *   />
 */

import { useEffect, useState } from 'react';
import { X, Check, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';

interface Props {
  surface: string;
  relatedKind?: string;
  relatedId?: number;
  question: string;
}

const LS_PREFIX = 'kuja_microsurvey_done_v1::';

function lsKey(surface: string, kind?: string, id?: number) {
  return `${LS_PREFIX}${surface}|${kind ?? ''}|${id ?? ''}`;
}

export function MicroSurvey({ surface, relatedKind, relatedId, question }: Props) {
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (typeof window === 'undefined') return;
    try {
      if (window.localStorage.getItem(lsKey(surface, relatedKind, relatedId))) {
        return;  // already answered on this device
      }
    } catch {
      /* localStorage blocked → still open */
    }
    // small delay so the survey doesn't appear before the user has
    // visually parsed the "submitted!" state.
    const t = window.setTimeout(() => setOpen(true), 800);
    return () => window.clearTimeout(t);
  }, [user, surface, relatedKind, relatedId]);

  const dismiss = () => {
    setOpen(false);
    try {
      window.localStorage.setItem(lsKey(surface, relatedKind, relatedId), '1');
    } catch { /* noop */ }
  };

  const submit = async () => {
    if (score === null) return;
    setSending(true);
    try {
      await api.post('/api/feedback', {
        surface,
        score,
        related_kind: relatedKind,
        related_id: relatedId,
        comment: comment.trim() || undefined,
      });
      setDone(true);
      try {
        window.localStorage.setItem(lsKey(surface, relatedKind, relatedId), '1');
      } catch { /* noop */ }
      window.setTimeout(() => setOpen(false), 1500);
    } catch {
      // Silently fail — never block on telemetry. Mark as done locally
      // so we don't re-prompt.
      setDone(true);
      try {
        window.localStorage.setItem(lsKey(surface, relatedKind, relatedId), '1');
      } catch { /* noop */ }
      window.setTimeout(() => setOpen(false), 1500);
    } finally {
      setSending(false);
    }
  };

  if (!user || !open) return null;

  return (
    <div
      className="fixed bottom-4 left-4 right-4 z-40 sm:bottom-6 sm:left-auto sm:right-6 sm:max-w-sm"
      role="dialog"
      aria-label="Quick feedback"
    >
      <Card className="p-3 sm:p-4 shadow-lg border-[hsl(var(--kuja-clay))]/30">
        {done ? (
          <div className="flex items-center gap-2 py-2">
            <Check className="h-5 w-5 text-[hsl(var(--kuja-grow))]" />
            <div className="text-sm">Thanks — feedback saved.</div>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-2 mb-3">
              <div className="flex-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">
                  Quick feedback
                </div>
                <p className="text-sm mt-0.5">{question}</p>
              </div>
              <button
                type="button"
                onClick={dismiss}
                aria-label="Dismiss survey"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center justify-between gap-0.5 mb-2">
              {Array.from({ length: 11 }, (_, i) => i).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setScore(n)}
                  aria-label={`Score ${n}`}
                  className={cn(
                    'h-8 w-8 rounded-md text-xs font-medium border transition-colors',
                    score === n
                      ? 'bg-[hsl(var(--kuja-clay))] text-white border-[hsl(var(--kuja-clay))]'
                      : 'border-[hsl(var(--border))] hover:border-[hsl(var(--kuja-clay))]',
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mb-2 px-0.5">
              <span>Not at all</span>
              <span>Extremely</span>
            </div>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Anything specific? (optional)"
              rows={2}
              maxLength={500}
              className="w-full resize-none rounded-md border border-[hsl(var(--border))] bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[hsl(var(--kuja-clay))]"
            />

            <div className="flex justify-end gap-1.5 mt-2">
              <Button size="sm" variant="ghost" onClick={dismiss} disabled={sending}>
                Not now
              </Button>
              <Button
                size="sm"
                onClick={submit}
                disabled={score === null || sending}
                className="bg-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay))]/90 text-white gap-1.5"
              >
                {sending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Send
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
