'use client';

/**
 * PreemptionWatchCard — the category-defining "predicting slippage" surface.
 *
 * Renders a short, severity-sorted list of predicted compliance risks
 * across the user's active grants. Each finding shows:
 *   - severity dot + category
 *   - specific deliverable at risk + days-to-due
 *   - 1-line "why" (evidence-driven)
 *   - recommended action with a drill-link
 *   - AI confidence chip
 *
 * Source can be 'ai' (Claude-generated) or 'deterministic_fallback'
 * (rule-based) — labeled so reviewers know what they're looking at.
 *
 * Designed to live on the donor command center + NGO dashboard. Quiet
 * when there are no findings ("All clear for the next 60 days.").
 */

import { useEffect, useState } from 'react';
import {
  ShieldAlert, ArrowRight, Sparkles, Database, AlertTriangle,
  CheckCircle2, Loader2, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AIConfidenceBadge, confidenceFromScore } from '@/components/shared/ai-confidence-badge';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface PreemptionFinding {
  severity: 'high' | 'medium' | 'low';
  confidence: number;
  category: string;
  grant_id: number;
  grant_title?: string;
  org_id: number;
  org_name?: string;
  deliverable: string;
  due_in_days?: number;
  reason: string;
  recommended_action: string;
  evidence?: string[];
}

interface PreemptionResponse {
  success: boolean;
  scope: string;
  computed_at: string;
  findings: PreemptionFinding[];
  summary?: string;
  source: 'ai' | 'deterministic_fallback' | 'no_input';
}

const SEV_TONE: Record<string, { bg: string; text: string; dot: string }> = {
  high:   { bg: 'bg-[hsl(var(--kuja-flag)/0.06)]', text: 'text-[hsl(var(--kuja-flag))]', dot: 'bg-[hsl(var(--kuja-flag))]' },
  medium: { bg: 'bg-[hsl(var(--kuja-sun)/0.06)]',  text: 'text-[hsl(var(--kuja-sun))]',  dot: 'bg-[hsl(var(--kuja-sun))]' },
  low:    { bg: 'bg-[hsl(var(--kuja-ink-soft)/0.04)]', text: 'text-[hsl(var(--kuja-ink-soft))]', dot: 'bg-[hsl(var(--kuja-ink-soft))]' },
};

const CATEGORY_LABEL: Record<string, string> = {
  late_report: 'Late report risk',
  late_evidence: 'Evidence missing',
  compliance_drift: 'Compliance drift',
  budget_overrun: 'Budget overrun',
  capacity_gap: 'Capacity gap',
};

function FindingCard({ finding }: { finding: PreemptionFinding }) {
  const tone = SEV_TONE[finding.severity] ?? SEV_TONE.low;
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={cn('rounded-md border border-[hsl(var(--border))] p-3', tone.bg)}>
      <div className="flex items-start gap-3">
        <span className={cn('mt-1.5 w-2 h-2 rounded-full shrink-0', tone.dot)} aria-hidden />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className={cn('text-[10px] uppercase tracking-wider font-semibold', tone.text)}>
              {finding.severity.toUpperCase()}
            </span>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-[hsl(var(--kuja-ink-soft))]">
              {CATEGORY_LABEL[finding.category] ?? finding.category}
            </span>
            <AIConfidenceBadge
              confidence={confidenceFromScore(finding.confidence)}
              variant="inline"
              title={`AI confidence: ${finding.confidence}/100 — bucketed for calibration honesty (see Phase 5.4 design doc).`}
            />
          </div>
          <p className="mt-1 text-sm font-semibold text-[hsl(var(--kuja-ink))]">
            {finding.deliverable}
            {finding.due_in_days !== undefined && (
              <span className="ml-1.5 text-xs font-normal text-[hsl(var(--kuja-ink-soft))]">
                · due in {finding.due_in_days}d
              </span>
            )}
          </p>
          <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-0.5">
            {finding.org_name && <strong>{finding.org_name}</strong>}
            {finding.grant_title && <> · {finding.grant_title}</>}
          </p>
          <p className="text-xs text-[hsl(var(--kuja-ink))] mt-2 leading-relaxed">
            <strong>Why:</strong> {finding.reason}
          </p>
          <p className="text-xs text-[hsl(var(--kuja-ink))] mt-1.5 leading-relaxed">
            <strong>Do this:</strong> {finding.recommended_action}
          </p>

          {finding.evidence && finding.evidence.length > 0 && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-[hsl(var(--kuja-clay))] hover:underline"
              >
                {expanded ? <><ChevronUp className="w-3 h-3" /> Hide evidence</> : <><ChevronDown className="w-3 h-3" /> Show evidence ({finding.evidence.length})</>}
              </button>
              {expanded && (
                <ul className="mt-1.5 space-y-1 text-[11px] text-[hsl(var(--kuja-ink-soft))]">
                  {finding.evidence.map((e, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-[hsl(var(--kuja-ink-soft))]">·</span>
                      <span>{e}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <a
          href={`/grants/${finding.grant_id}`}
          className="shrink-0 inline-flex items-center gap-1 rounded-md border border-[hsl(var(--border))] px-2 py-1 text-[11px] font-semibold hover:bg-[hsl(var(--kuja-sand-50))]"
        >
          Open <ArrowRight className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source: PreemptionResponse['source'] }) {
  if (source === 'ai') {
    return (
      <span className="kuja-ai-pill" title="AI-generated finding">
        <Sparkles className="w-2.5 h-2.5" /> AI scan
      </span>
    );
  }
  if (source === 'deterministic_fallback') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--kuja-ink-soft)/0.1)] border border-[hsl(var(--kuja-ink-soft)/0.2)] px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold text-[hsl(var(--kuja-ink-soft))]">
        <Database className="w-2.5 h-2.5" /> Rule-based
      </span>
    );
  }
  return null;
}

export interface PreemptionWatchCardProps {
  /** 'me' resolves to NGO or donor scope based on the current user */
  scope?: 'me' | { kind: 'ngo' | 'donor'; orgId: number };
  className?: string;
}

export function PreemptionWatchCard({ scope = 'me', className }: PreemptionWatchCardProps) {
  const [data, setData] = useState<PreemptionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = scope === 'me'
      ? '/api/preemption/me'
      : `/api/preemption/${scope.kind}/${scope.orgId}`;
    api.get<PreemptionResponse>(url)
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError((e as Error).message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [scope]);

  if (loading) {
    return (
      <Card className={cn('p-4 sm:p-5', className)}>
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-[hsl(var(--kuja-clay))]" />
          <span className="kuja-eyebrow">Pre-emption watch</span>
        </div>
        <div className="kuja-shimmer mt-3 h-24 rounded" />
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={cn('p-4', className)}>
        <span className="kuja-eyebrow">Pre-emption watch</span>
        <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-1">Unavailable: {error}</p>
      </Card>
    );
  }

  if (!data) return null;

  const findings = data.findings ?? [];
  const allClear = findings.length === 0;

  return (
    <Card className={cn('p-4 sm:p-5', className)}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-start gap-2 min-w-0">
          <div className="p-2 rounded-md bg-[hsl(var(--kuja-spark)/0.1)]">
            <ShieldAlert className="w-5 h-5 text-[hsl(var(--kuja-spark))]" />
          </div>
          <div>
            <div className="kuja-eyebrow flex items-center gap-1.5">
              <span>Pre-emption Watch</span>
              <SourceBadge source={data.source} />
            </div>
            <h3 className="text-base font-semibold text-[hsl(var(--kuja-ink))] mt-0.5">
              {allClear ? 'All clear for the next 60 days.' : `${findings.length} item${findings.length === 1 ? '' : 's'} predicted to slip`}
            </h3>
            {data.summary && (
              <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-0.5 leading-relaxed">{data.summary}</p>
            )}
          </div>
        </div>
      </div>

      {allClear ? (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-[hsl(var(--kuja-grow)/0.3)] bg-[hsl(var(--kuja-grow)/0.05)] p-3">
          <CheckCircle2 className="w-4 h-4 text-[hsl(var(--kuja-grow))] shrink-0 mt-0.5" />
          <div className="text-xs">
            <strong>No predicted slips.</strong> Active grants are tracking on time relative to past behaviour.
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {findings.map((f, i) => <FindingCard key={i} finding={f} />)}
        </div>
      )}
    </Card>
  );
}
