'use client';

/**
 * SubmissionVelocityBar — Phase 18D (May 2026).
 *
 * Lightweight at-a-glance progress meter for the apply wizard. Tracks
 * per-criterion word count and renders:
 *   - Overall "% drafted" + count drafted vs total
 *   - Per-criterion mini segments (color-coded: empty / sparse / good)
 *   - Lowest-progress criterion call-out so the NGO knows what to tackle next
 *
 * Distinct from SubmissionReadiness (Phase 10.1) which is the heavyweight
 * AI pre-flight at submit time. This bar runs zero AI calls — pure
 * client-side word counting on every keystroke.
 *
 * Discipline:
 *   - "good" threshold is intentionally generous (40 words) so the bar
 *     rewards progress; the AI pre-flight is where rigour kicks in
 *   - Renders only when there are >= 2 criteria (no clutter on trivial grants)
 */

import { useMemo } from 'react';
import { Gauge, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Criterion {
  key: string;
  label: string;
  weight?: number;
  max_words?: number;
}

interface Props {
  criteria: Criterion[];
  responses: Record<string, string>;
  /** Optional: scroll-to or focus the named criterion when "Continue here" is clicked. */
  onJumpToCriterion?: (key: string) => void;
}

const EMPTY_THRESHOLD = 5;     // < 5 words = empty
const SPARSE_THRESHOLD = 40;   // < 40 words = sparse
// >= 40 words = good (paragraph-scale answer)

function wordCount(text: string): number {
  const trimmed = (text || '').trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function stateForCount(n: number): 'empty' | 'sparse' | 'good' {
  if (n < EMPTY_THRESHOLD) return 'empty';
  if (n < SPARSE_THRESHOLD) return 'sparse';
  return 'good';
}

const STATE_BAR: Record<string, string> = {
  empty:  'bg-[hsl(var(--kuja-sand))]/40',
  sparse: 'bg-[hsl(var(--kuja-sun))]',
  good:   'bg-[hsl(var(--kuja-grow))]',
};

export function SubmissionVelocityBar({ criteria, responses, onJumpToCriterion }: Props) {
  const stats = useMemo(() => {
    const per = criteria.map((c) => {
      const text = responses[c.key] ?? '';
      const n = wordCount(text);
      return {
        key: c.key,
        label: c.label || c.key,
        weight: c.weight ?? 1,
        max_words: c.max_words,
        words: n,
        state: stateForCount(n),
      };
    });
    const drafted = per.filter((p) => p.state !== 'empty').length;
    const totalWeight = per.reduce((s, p) => s + (p.weight ?? 1), 0);
    // Weighted completeness: contribution of each criterion = (sparse=0.5, good=1.0)
    const earnedWeight = per.reduce((s, p) => {
      const factor = p.state === 'good' ? 1 : p.state === 'sparse' ? 0.5 : 0;
      return s + factor * (p.weight ?? 1);
    }, 0);
    const pct = totalWeight ? Math.round((earnedWeight / totalWeight) * 100) : 0;
    const totalWords = per.reduce((s, p) => s + p.words, 0);
    // Next-to-tackle = first empty (or sparse if no empties), by reading order
    const nextEmpty = per.find((p) => p.state === 'empty');
    const nextSparse = per.find((p) => p.state === 'sparse');
    const next = nextEmpty || nextSparse || null;
    return { per, drafted, pct, totalWords, next };
  }, [criteria, responses]);

  if (criteria.length < 2) return null;

  const { per, drafted, pct, totalWords, next } = stats;

  return (
    <div className="rounded-md border border-[hsl(var(--border))] bg-background p-3 space-y-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Gauge className="h-4 w-4 text-[hsl(var(--kuja-clay))]" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Submission progress
          </span>
        </div>
        <div className="text-xs tabular-nums">
          <strong className="text-foreground">{drafted}</strong>
          <span className="text-muted-foreground"> of {criteria.length} criteria · </span>
          <strong className="text-foreground">{pct}%</strong>
          <span className="text-muted-foreground"> drafted · </span>
          <span className="text-muted-foreground">{totalWords} words</span>
        </div>
      </div>

      {/* Segmented bar — one segment per criterion, sized by weight */}
      <div
        className="flex w-full h-2 rounded-full overflow-hidden gap-0.5 bg-[hsl(var(--kuja-sand))]/30"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Submission progress by criterion"
      >
        {per.map((p) => (
          <div
            key={p.key}
            className={cn('h-full rounded-sm', STATE_BAR[p.state])}
            style={{ flex: p.weight ?? 1 }}
            title={`${p.label}: ${p.words} words (${p.state})`}
          />
        ))}
      </div>

      {next && onJumpToCriterion && (
        <button
          type="button"
          onClick={() => onJumpToCriterion(next.key)}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-[hsl(var(--kuja-clay))]"
        >
          {next.state === 'empty' ? 'Start' : 'Continue'}: <strong className="text-foreground">{next.label}</strong>
          <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
