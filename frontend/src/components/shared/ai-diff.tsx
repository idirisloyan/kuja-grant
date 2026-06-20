'use client';

/**
 * AiDiff — Phase 98.3 (design backlog Wave 1)
 *
 * The universal "Propose → Diff → Accept" pattern for every AI rewrite,
 * translation, or generative-fill surface.
 *
 * Principle: never silently overwrite. When AI proposes a change to user
 * text, show:
 *   - what changed (visual inline diff)
 *   - the three actions: Keep mine / Use AI / Blend (= edit the AI version)
 *
 * Wrap any textarea/edit surface where AI is allowed to suggest content.
 *
 * Tracks acceptance via the onAccept/onReject callbacks so the parent
 * can write telemetry rows (Phase 97.x AI telemetry).
 *
 * Renders nothing when proposal is null — caller controls when AI has run.
 */

import { useState } from 'react';
import { Check, X, Sparkles, GitCompareArrows } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  /** The user's current text. May be empty. */
  original: string;
  /** What AI proposes. Null = no proposal yet (component renders nothing). */
  proposed: string | null;
  /** Called when user accepts the AI proposal verbatim. */
  onAccept: () => void;
  /** Called when user rejects and keeps their original. */
  onReject: () => void;
  /** Called when user picks "Blend" — receives the AI proposal as starting text. */
  onBlend?: (proposed: string) => void;
  /** Optional surface tag for telemetry. */
  surface?: string;
  /** Optional short caption explaining what the AI did. */
  caption?: string;
  className?: string;
}

function tokenize(s: string): string[] {
  // Word-level tokenization that preserves whitespace as tokens.
  return s.split(/(\s+)/).filter(t => t.length > 0);
}

interface Segment {
  text: string;
  kind: 'same' | 'add' | 'remove';
}

/**
 * Tiny LCS-based diff over word tokens. Good enough for short-to-medium
 * fields (a few hundred words). Long-form fields should use a virtualized
 * diff variant.
 */
function wordDiff(a: string, b: string): Segment[] {
  const A = tokenize(a);
  const B = tokenize(b);
  const m = A.length, n = B.length;
  if (m === 0) return B.map(t => ({ text: t, kind: 'add' as const }));
  if (n === 0) return A.map(t => ({ text: t, kind: 'remove' as const }));

  // dp[i][j] = length of LCS of A[i:] and B[j:]
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (A[i] === B[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const segs: Segment[] = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (A[i] === B[j]) {
      segs.push({ text: A[i], kind: 'same' });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      segs.push({ text: A[i], kind: 'remove' });
      i++;
    } else {
      segs.push({ text: B[j], kind: 'add' });
      j++;
    }
  }
  while (i < m) segs.push({ text: A[i++], kind: 'remove' });
  while (j < n) segs.push({ text: B[j++], kind: 'add' });
  return segs;
}

export function AiDiff({
  original,
  proposed,
  onAccept,
  onReject,
  onBlend,
  surface,
  caption,
  className,
}: Props) {
  const [view, setView] = useState<'diff' | 'proposed' | 'original'>('diff');

  if (proposed == null) return null;
  if (proposed.trim() === original.trim()) {
    // No-op proposal — render quiet acknowledgement; let caller decide whether to show.
    return (
      <div className={cn('rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground', className)}>
        <Sparkles className="mr-1 inline h-3.5 w-3.5" />
        AI reviewed your text and didn&apos;t suggest changes.
      </div>
    );
  }

  const segs = view === 'diff' ? wordDiff(original, proposed) : [];

  return (
    <div
      data-ai-surface={surface}
      role="region"
      aria-label="AI suggestion"
      className={cn(
        'rounded-md border border-amber-200 bg-amber-50/40 p-3',
        'dark:border-amber-900/40 dark:bg-amber-950/20',
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-amber-900 dark:text-amber-100">
          <GitCompareArrows className="h-3.5 w-3.5" />
          AI suggestion
          {caption && (
            <span className="font-normal text-muted-foreground">· {caption}</span>
          )}
        </div>
        <div className="flex gap-0.5 rounded-md border border-border bg-background p-0.5 text-[10px]">
          {(['diff', 'proposed', 'original'] as const).map(v => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                'rounded px-1.5 py-0.5 capitalize',
                view === v ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {v === 'proposed' ? 'AI' : v === 'original' ? 'Yours' : 'Diff'}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 rounded border border-border bg-background p-2 text-sm leading-relaxed">
        {view === 'diff' ? (
          segs.map((s, i) => (
            <span
              key={i}
              className={cn(
                s.kind === 'add' && 'rounded-sm bg-emerald-100 px-0.5 text-emerald-900',
                s.kind === 'remove' && 'rounded-sm bg-rose-100 px-0.5 text-rose-900 line-through',
              )}
            >
              {s.text}
            </span>
          ))
        ) : view === 'proposed' ? (
          <span className="whitespace-pre-wrap">{proposed}</span>
        ) : (
          <span className="whitespace-pre-wrap">{original}</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={onAccept}
          className="bg-emerald-600 text-white hover:bg-emerald-700"
        >
          <Check className="mr-1 h-3.5 w-3.5" /> Use AI
        </Button>
        {onBlend && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onBlend(proposed)}
          >
            Blend (edit AI version)
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onReject}
        >
          <X className="mr-1 h-3.5 w-3.5" /> Keep mine
        </Button>
      </div>
    </div>
  );
}

/**
 * editDistance — Levenshtein word distance. Used by callers to instrument
 * "AI quality as a product metric" (low edits = high trust; high edits =
 * weak prompt). Exported so any AI surface can compute the score on the
 * final-submitted text and write a telemetry row.
 */
export function editDistanceWords(a: string, b: string): number {
  const A = tokenize(a), B = tokenize(b);
  const m = A.length, n = B.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = A[i - 1] === B[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}
