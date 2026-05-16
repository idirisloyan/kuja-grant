'use client';

/**
 * PreflightPanel — "see your draft as the reviewer will see it" (Phase 7).
 *
 * Drops into application or report detail pages. NGO opens the dialog,
 * sees a per-criterion breakdown:
 *   - predicted reviewer score (with signal: strong/adequate/thin)
 *   - "what works" + "what a reviewer will flag" + "concrete fix"
 *   - word count badge (heuristic, always available)
 *
 * Plus a top-3 fixes list ranked by leverage and a 1-paragraph AI
 * narrative. Source pill (AI vs heuristic) shows which engine ran.
 */

import { useState } from 'react';
import {
  Eye, X, Loader2, AlertTriangle, CheckCircle2, Wrench, Sparkles,
  Database, ChevronDown, ChevronUp, ArrowRight,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface PreflightCriterion {
  key: string;
  label?: string;
  predicted_score: number;
  reviewer_signal: 'strong' | 'adequate' | 'thin';
  what_works?: string;
  what_a_reviewer_will_flag?: string;
  concrete_fix?: string;
  word_count?: number;
  target_words?: number;
}

interface TopFix {
  criterion_key: string;
  fix: string;
  leverage: 'high' | 'medium' | 'low';
}

interface PreflightResponse {
  success: boolean;
  scope: string;
  source: 'ai' | 'heuristic_fallback';
  predicted_overall_score: number;
  predicted_grade: 'strong' | 'adequate' | 'thin';
  criteria: PreflightCriterion[];
  top_fixes: TopFix[];
  ai_summary?: string;
  computed_at: string;
}

const SIGNAL_TONE: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  strong:   { bg: 'bg-[hsl(var(--kuja-grow)/0.08)]', text: 'text-[hsl(var(--kuja-grow))]', dot: 'bg-[hsl(var(--kuja-grow))]', label: 'Strong' },
  adequate: { bg: 'bg-[hsl(var(--kuja-sun)/0.08)]',  text: 'text-[hsl(var(--kuja-sun))]',  dot: 'bg-[hsl(var(--kuja-sun))]',  label: 'Adequate' },
  thin:     { bg: 'bg-[hsl(var(--kuja-flag)/0.08)]', text: 'text-[hsl(var(--kuja-flag))]', dot: 'bg-[hsl(var(--kuja-flag))]', label: 'Thin' },
};

const LEVERAGE_TONE: Record<string, string> = {
  high:   'border-[hsl(var(--kuja-flag))] text-[hsl(var(--kuja-flag))]',
  medium: 'border-[hsl(var(--kuja-sun))] text-[hsl(var(--kuja-sun))]',
  low:    'border-[hsl(var(--kuja-ink-soft))] text-[hsl(var(--kuja-ink-soft))]',
};

function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const meta = SIGNAL_TONE[grade] ?? SIGNAL_TONE.thin;
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.max(0, Math.min(100, score)) / 100) * circumference;
  const color = grade === 'strong' ? 'hsl(var(--kuja-grow))'
    : grade === 'adequate' ? 'hsl(var(--kuja-sun))'
    : 'hsl(var(--kuja-flag))';
  return (
    <div className="relative flex items-center justify-center" style={{ width: 96, height: 96 }}>
      <svg width="96" height="96" className="-rotate-90">
        <circle cx="48" cy="48" r={radius} fill="none" stroke="hsl(var(--kuja-sand))" strokeWidth="8" />
        <circle
          cx="48" cy="48" r={radius}
          fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 600ms ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="kuja-numeric text-2xl font-bold leading-none">{score}</span>
        <span className={cn('text-[10px] uppercase tracking-wider font-semibold mt-1', meta.text)}>{meta.label}</span>
      </div>
    </div>
  );
}

function CriterionRow({ c }: { c: PreflightCriterion }) {
  const meta = SIGNAL_TONE[c.reviewer_signal] ?? SIGNAL_TONE.thin;
  const [open, setOpen] = useState(false);
  const hasDetail = !!(c.what_works || c.what_a_reviewer_will_flag || c.concrete_fix);
  return (
    <div className={cn('rounded-md border border-[hsl(var(--border))]', meta.bg)}>
      <button
        type="button"
        onClick={() => hasDetail && setOpen(!open)}
        className="w-full flex items-start gap-3 p-3 text-left"
        aria-expanded={open}
      >
        <span className={cn('mt-1 w-2 h-2 rounded-full shrink-0', meta.dot)} aria-hidden />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[hsl(var(--kuja-ink))]">{c.label || c.key}</span>
            <span className={cn('text-[10px] uppercase tracking-wider font-semibold', meta.text)}>{meta.label}</span>
            {c.word_count !== undefined && c.target_words !== undefined && (
              <span className="text-[10px] text-[hsl(var(--kuja-ink-soft))]">
                {c.word_count}/{c.target_words} words
              </span>
            )}
          </div>
          {c.what_a_reviewer_will_flag && !open && (
            <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-1 line-clamp-1">
              {c.what_a_reviewer_will_flag}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <span className="kuja-numeric text-sm font-bold tabular-nums">{c.predicted_score}</span>
          <span className="text-xs text-[hsl(var(--kuja-ink-soft))]"> /100</span>
        </div>
        {hasDetail && (
          open
            ? <ChevronUp className="w-4 h-4 text-[hsl(var(--kuja-ink-soft))] shrink-0 mt-1" />
            : <ChevronDown className="w-4 h-4 text-[hsl(var(--kuja-ink-soft))] shrink-0 mt-1" />
        )}
      </button>
      {open && hasDetail && (
        <div className="px-3 pb-3 -mt-1 space-y-2 text-xs leading-relaxed">
          {c.what_works && (
            <div className="flex items-start gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(var(--kuja-grow))] mt-0.5 shrink-0" />
              <div><strong>What works:</strong> {c.what_works}</div>
            </div>
          )}
          {c.what_a_reviewer_will_flag && (
            <div className="flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-[hsl(var(--kuja-sun))] mt-0.5 shrink-0" />
              <div><strong>Reviewer will flag:</strong> {c.what_a_reviewer_will_flag}</div>
            </div>
          )}
          {c.concrete_fix && (
            <div className="flex items-start gap-1.5">
              <Wrench className="w-3.5 h-3.5 text-[hsl(var(--kuja-clay))] mt-0.5 shrink-0" />
              <div><strong>Concrete fix:</strong> {c.concrete_fix}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export interface PreflightPanelProps {
  /** 'application' or 'report' */
  kind: 'application' | 'report';
  entityId: number;
  /** Optional: render as inline card instead of dialog launcher */
  inline?: boolean;
}

export function PreflightPanel({ kind, entityId, inline = false }: PreflightPanelProps) {
  const [open, setOpen] = useState(inline);
  const [data, setData] = useState<PreflightResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await api.get<PreflightResponse>(`/api/preflight/${kind}/${entityId}`);
      setData(resp);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const openAndLoad = () => {
    setOpen(true);
    if (!data) load();
  };

  const Body = () => {
    if (loading) {
      return (
        <div className="py-10 flex flex-col items-center gap-3 text-[hsl(var(--kuja-ink-soft))]">
          <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--kuja-clay))]" />
          <span className="text-sm">Reviewing your draft the way a reviewer will — this takes 5-15 seconds.</span>
        </div>
      );
    }
    if (error) {
      return (
        <div className="rounded-md border border-[hsl(var(--kuja-flag)/0.3)] bg-[hsl(var(--kuja-flag)/0.05)] p-3 text-sm text-[hsl(var(--kuja-flag))]">
          Could not run pre-flight: {error}
        </div>
      );
    }
    if (!data) return null;

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start gap-4 flex-wrap">
          <ScoreRing score={data.predicted_overall_score} grade={data.predicted_grade} />
          <div className="flex-1 min-w-0">
            <div className="kuja-eyebrow flex items-center gap-2">
              Predicted reviewer score
              {data.source === 'ai' ? (
                <span className="kuja-ai-pill text-[9px]">
                  <Sparkles className="w-2.5 h-2.5" /> AI scored
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--kuja-ink-soft)/0.1)] px-1.5 py-0.5 text-[9px] uppercase tracking-wider font-semibold text-[hsl(var(--kuja-ink-soft))]">
                  <Database className="w-2.5 h-2.5" /> Heuristic
                </span>
              )}
            </div>
            {data.ai_summary && (
              <p className="text-sm text-[hsl(var(--kuja-ink))] mt-2 leading-relaxed">{data.ai_summary}</p>
            )}
          </div>
        </div>

        {/* Top fixes */}
        {data.top_fixes.length > 0 && (
          <Card className="p-3 border-l-4 border-l-[hsl(var(--kuja-clay))]">
            <div className="kuja-label">Top {data.top_fixes.length} fixes (ranked by leverage)</div>
            <ul className="mt-2 space-y-2">
              {data.top_fixes.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="shrink-0 mt-0.5">
                    <Badge variant="outline" className={LEVERAGE_TONE[f.leverage] ?? LEVERAGE_TONE.medium}>
                      {f.leverage}
                    </Badge>
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[hsl(var(--kuja-ink))]">{f.fix}</div>
                    <div className="text-[11px] text-[hsl(var(--kuja-ink-soft))] mt-0.5">
                      Targets: <code>{f.criterion_key}</code>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Per-criterion breakdown */}
        <div>
          <div className="kuja-label mb-2">Per-criterion breakdown ({data.criteria.length})</div>
          <div className="space-y-2">
            {data.criteria.map((c) => <CriterionRow key={c.key} c={c} />)}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[hsl(var(--border))]">
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1 rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-xs font-semibold hover:bg-[hsl(var(--kuja-sand-50))]"
          >
            Re-run pre-flight
          </button>
        </div>
      </div>
    );
  };

  if (inline) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Eye className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          <h3 className="text-base font-semibold">See it through the reviewer&apos;s eyes</h3>
        </div>
        <Body />
        {!loading && !data && !error && (
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[hsl(var(--kuja-clay-dark))]"
          >
            <Sparkles className="w-3.5 h-3.5" /> Run pre-flight
          </button>
        )}
      </Card>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={openAndLoad}
        className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[hsl(var(--kuja-clay-dark))]"
      >
        <Eye className="w-3.5 h-3.5" />
        Pre-flight as reviewer
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="kuja-display text-xl">Reviewer-perspective pre-flight</DialogTitle>
            <DialogDescription>
              How a reviewer will likely score this draft — with concrete fixes you can apply before submitting.
            </DialogDescription>
          </DialogHeader>
          <Body />
        </DialogContent>
      </Dialog>
    </>
  );
}
