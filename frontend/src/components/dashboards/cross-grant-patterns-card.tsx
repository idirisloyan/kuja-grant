'use client';

/**
 * CrossGrantPatternsCard — portfolio-level patterns surface (Phase 11).
 *
 * NGO dashboard variant: "you consistently lose on M&E specificity;
 * here are 3 fixes that worked for similar orgs."
 * Donor dashboard variant: "your top performers share these traits."
 *
 * Renders nothing until /api/patterns/me responds — never causes layout
 * shifts. Quiet on empty (no-data) state.
 */

import { useEffect, useState } from 'react';
import {
  TrendingUp, TrendingDown, Compass, Loader2, Sparkles, ChevronDown, ChevronUp,
  Database,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Pattern {
  title: string;
  category: 'strength' | 'weakness' | 'opportunity';
  severity: 'high' | 'medium' | 'low';
  evidence?: string[];
  fix: string;
}

interface PatternsResp {
  success: boolean;
  scope: string;
  source: 'ai' | 'no_data' | 'unavailable';
  patterns: Pattern[];
  top_3_actions: string[];
  summary: string;
}

const CATEGORY_META: Record<string, { icon: typeof TrendingUp; tone: string; label: string }> = {
  strength:    { icon: TrendingUp,   tone: 'text-[hsl(var(--kuja-grow))]', label: 'Strength' },
  weakness:    { icon: TrendingDown, tone: 'text-[hsl(var(--kuja-flag))]', label: 'Weakness' },
  opportunity: { icon: Compass,      tone: 'text-[hsl(var(--kuja-clay))]', label: 'Opportunity' },
};

const SEVERITY_BAR: Record<string, string> = {
  high: 'border-l-[hsl(var(--kuja-flag))]',
  medium: 'border-l-[hsl(var(--kuja-sun))]',
  low: 'border-l-[hsl(var(--kuja-ink-soft))]',
};

function PatternRow({ p }: { p: Pattern }) {
  const meta = CATEGORY_META[p.category] ?? CATEGORY_META.opportunity;
  const Icon = meta.icon;
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={cn(
      'rounded-md border border-[hsl(var(--border))] border-l-4 p-3',
      SEVERITY_BAR[p.severity] ?? SEVERITY_BAR.low,
    )}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2 min-w-0">
          <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', meta.tone)} />
          <div className="min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className={cn('text-[10px] uppercase tracking-wider font-semibold', meta.tone)}>
                {meta.label}
              </span>
              <Badge variant="outline" className="text-[10px]">
                {p.severity}
              </Badge>
            </div>
            <h4 className="text-sm font-semibold mt-1 text-[hsl(var(--kuja-ink))]">{p.title}</h4>
          </div>
        </div>
        {p.evidence && p.evidence.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-[11px] text-[hsl(var(--kuja-clay))] hover:underline inline-flex items-center gap-1"
            aria-expanded={expanded}
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? 'Hide' : 'Evidence'} ({p.evidence.length})
          </button>
        )}
      </div>
      <p className="text-xs text-[hsl(var(--kuja-ink))] mt-2 leading-relaxed">
        <strong>Do this:</strong> {p.fix}
      </p>
      {expanded && p.evidence && p.evidence.length > 0 && (
        <ul className="mt-2 space-y-1 text-[11px] text-[hsl(var(--kuja-ink-soft))]">
          {p.evidence.map((e, i) => (
            <li key={i}>· {e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CrossGrantPatternsCard({ className }: { className?: string }) {
  const [data, setData] = useState<PatternsResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<PatternsResp>('/api/patterns/me');
      setData(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!data && !loading && !error) {
    return (
      <Card className={cn('p-4', className)}>
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-md bg-[hsl(var(--kuja-spark)/0.1)]">
            <Sparkles className="w-5 h-5 text-[hsl(var(--kuja-spark))]" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold">Cross-grant patterns</h3>
            <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-0.5">
              Claude reads your applications + reports + capacity signals over the last 12 months and surfaces what consistently works, what consistently slips, and what to fix next.
            </p>
            <button
              type="button"
              onClick={load}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-spark))] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
            >
              <Sparkles className="w-3.5 h-3.5" /> Run pattern detection
            </button>
          </div>
        </div>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className={cn('p-4', className)}>
        <div className="flex items-center gap-2 text-xs text-[hsl(var(--kuja-ink-soft))]">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Reading your portfolio — this takes 10-20 seconds.
        </div>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className={cn('p-4', className)}>
        <p className="text-xs text-[hsl(var(--kuja-flag))]">Patterns unavailable: {error}</p>
        <button type="button" onClick={load} className="mt-2 text-xs text-[hsl(var(--kuja-clay))] hover:underline">Retry</button>
      </Card>
    );
  }

  if (data.source === 'no_data') {
    return (
      <Card className={cn('p-4', className)}>
        <div className="flex items-start gap-2 text-xs text-[hsl(var(--kuja-ink-soft))]">
          <Database className="w-3.5 h-3.5 mt-0.5" />
          <span>{data.summary || 'Not enough submission history yet — patterns will appear after a few applications and reports.'}</span>
        </div>
      </Card>
    );
  }

  if (data.source === 'unavailable') {
    return (
      <Card className={cn('p-4', className)}>
        <p className="text-xs text-[hsl(var(--kuja-ink-soft))]">{data.summary || 'AI not available — try again later.'}</p>
        <button type="button" onClick={load} className="mt-2 text-xs text-[hsl(var(--kuja-clay))] hover:underline">Retry</button>
      </Card>
    );
  }

  return (
    <Card className={cn('p-4 sm:p-5', className)}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2 min-w-0">
          <div className="p-2 rounded-md bg-[hsl(var(--kuja-spark)/0.1)]">
            <Sparkles className="w-5 h-5 text-[hsl(var(--kuja-spark))]" />
          </div>
          <div>
            <div className="kuja-eyebrow flex items-center gap-1.5">
              Cross-grant patterns
              <span className="kuja-ai-pill text-[9px]"><Sparkles className="w-2.5 h-2.5" /> Portfolio scan</span>
            </div>
            <h3 className="text-base font-semibold mt-0.5">
              {data.patterns.length} pattern{data.patterns.length === 1 ? '' : 's'} surfaced
            </h3>
            {data.summary && (
              <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-1 leading-relaxed max-w-2xl">{data.summary}</p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1 rounded-md border border-[hsl(var(--border))] px-2 py-1 text-[11px] font-semibold hover:bg-[hsl(var(--kuja-sand-50))]"
        >
          Re-scan
        </button>
      </div>

      {data.top_3_actions.length > 0 && (
        <div className="mt-3 rounded-md border border-[hsl(var(--kuja-clay)/0.3)] bg-[hsl(var(--kuja-clay)/0.04)] p-3">
          <div className="kuja-label">Top 3 actions to take now</div>
          <ol className="mt-1 space-y-1 text-xs">
            {data.top_3_actions.map((a, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <Badge variant="outline" className="text-[10px] shrink-0">{i + 1}</Badge>
                <span>{a}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {data.patterns.map((p, i) => <PatternRow key={i} p={p} />)}
      </div>
    </Card>
  );
}
