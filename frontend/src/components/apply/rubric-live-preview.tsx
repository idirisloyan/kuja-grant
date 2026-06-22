'use client';

/**
 * Phase 119 — Side-by-side rubric live preview.
 *
 * Computes a cheap, deterministic, client-only heuristic score per
 * criterion as the NGO types. Updates per keystroke without any
 * server round-trip or AI cost.
 *
 * The heuristic isn't the rubric reviewers will use — it's a feedback
 * dial that tells the NGO whether they're tracking. Three signals,
 * each 0-1, summed and normalised to 0-100:
 *
 *   1. Length fit         — words / max_words, capped at 1.0
 *   2. Structure presence — bonuses for numbered lists / bullets /
 *                           outcome verbs ("will", "by", "%", "USD")
 *   3. Specificity        — penalty for filler ("we believe", "important",
 *                           "various", "etc"); bonus for digits or units.
 *
 * Per-criterion score → mini bar. Total → overall bar at the top.
 */

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { CircleHelp } from 'lucide-react';
import { criterionAnchorId } from '@/lib/criterion-anchor';

interface Criterion {
  key?: string;
  id?: string;
  label: string;
  max_words?: number | null;
}

interface Props {
  criteria: Criterion[];
  responses: Record<string, string>;
  className?: string;
}

const FILLER = [
  'we believe', 'in our opinion', 'very important', 'various', 'numerous',
  'a lot of', 'lots of', 'etcetera', 'etc.', 'really good', 'great', 'amazing',
];
const OUTCOME_VERBS = ['will', 'deliver', 'reach', 'serve', 'achieve', 'reduce', 'increase'];
const UNIT_RX = /(\$|usd|kes|ngn|%|km|kg|m\b|households?|children|people|months?|weeks?|days?)/i;
const NUMBER_RX = /\b\d+([,.]\d+)?\b/;
const BULLET_RX = /(^|\n)\s*([-*•]|\d+\.)\s+/g;

function scoreFor(text: string, maxWords: number): { score: number; signals: { label: string; pct: number }[] } {
  const t = (text || '').trim();
  if (!t) return { score: 0, signals: [{ label: 'Empty', pct: 0 }] };

  const words = t.split(/\s+/).filter(Boolean).length;
  const lengthFit = maxWords ? Math.min(1, words / Math.max(1, maxWords * 0.6)) : Math.min(1, words / 60);

  let structure = 0;
  const bullets = (t.match(BULLET_RX) || []).length;
  if (bullets >= 2) structure += 0.5;
  else if (bullets >= 1) structure += 0.25;
  const lc = t.toLowerCase();
  const verbHits = OUTCOME_VERBS.filter((v) => lc.includes(v)).length;
  structure += Math.min(0.5, verbHits * 0.15);

  let specificity = 0;
  if (NUMBER_RX.test(t)) specificity += 0.45;
  if (UNIT_RX.test(t)) specificity += 0.3;
  const fillerHits = FILLER.filter((f) => lc.includes(f)).length;
  specificity -= Math.min(0.5, fillerHits * 0.15);
  specificity = Math.max(0, Math.min(1, specificity));

  // 50% length, 25% structure, 25% specificity.
  const norm = lengthFit * 0.5 + structure * 0.25 + specificity * 0.25;
  return {
    score: Math.round(norm * 100),
    signals: [
      { label: 'Length', pct: Math.round(lengthFit * 100) },
      { label: 'Structure', pct: Math.round(structure * 100) },
      { label: 'Specificity', pct: Math.round(specificity * 100) },
    ],
  };
}

function tone(score: number) {
  if (score >= 75) return 'bg-emerald-500';
  if (score >= 50) return 'bg-amber-500';
  return 'bg-rose-500';
}

export function RubricLivePreview({ criteria, responses, className }: Props) {
  const rows = useMemo(() => {
    return criteria.map((c, index) => {
      const responseKey = c.key ?? c.id ?? '';
      const txt = responseKey ? (responses[responseKey] ?? '') : '';
      const { score, signals } = scoreFor(txt, c.max_words ?? 0);
      return {
        c,
        anchor: criterionAnchorId(c, index),
        score,
        signals,
        hasText: !!txt.trim(),
      };
    });
  }, [criteria, responses]);

  const overall = rows.length
    ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length)
    : 0;

  return (
    <aside
      role="complementary"
      aria-label="Live rubric preview"
      className={cn(
        'sticky top-4 rounded-md border border-border bg-card p-3 space-y-3 text-xs',
        className,
      )}
    >
      <header className="flex items-center justify-between">
        <span className="font-semibold inline-flex items-center gap-1.5">
          Live preview
          <CircleHelp
            className="w-3 h-3 text-muted-foreground"
            aria-label="Heuristic estimate — real review uses the donor's rubric"
          />
        </span>
        <span className={cn('font-bold text-sm', overall >= 75 ? 'text-emerald-700' : overall >= 50 ? 'text-amber-700' : 'text-rose-700')}>
          {overall}/100
        </span>
      </header>

      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full transition-all', tone(overall))}
          style={{ width: `${overall}%` }}
        />
      </div>

      <ul className="space-y-2">
        {rows.map(({ c, anchor, score, hasText }) => (
          <li key={anchor} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <a
                href={`#criterion-${anchor}`}
                className="truncate flex-1 text-foreground hover:underline"
                title={c.label}
              >
                {c.label}
              </a>
              <span className={cn('text-[10px] tabular-nums', !hasText && 'text-muted-foreground')}>
                {hasText ? `${score}` : '—'}
              </span>
            </div>
            <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn('h-full transition-all', tone(score))}
                style={{ width: `${hasText ? score : 0}%` }}
              />
            </div>
          </li>
        ))}
      </ul>

      <p className="text-[10px] text-muted-foreground italic border-t border-border pt-2">
        Quick heuristic — final review uses the donor&apos;s rubric. Aim for ≥75 across all rows.
      </p>
    </aside>
  );
}
