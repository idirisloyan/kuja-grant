'use client';

/**
 * AdverseMediaPanel — find list + run-new control + drilldown.
 *
 * Designed for the donor + admin reviewing an org. The NGO also sees
 * their own panel so they can see what donors will see (transparency by
 * design — no surprises).
 */

import { useState } from 'react';
import {
  ShieldAlert, Newspaper, ExternalLink, RefreshCw,
  CheckCircle2, Globe, Database, Loader2, Search,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AIConfidenceBadge, confidenceFromScore } from '@/components/shared/ai-confidence-badge';
import { trustApi } from '@/lib/trust-api';
import type { AdverseMediaScreening, AdverseMediaFinding } from '@/lib/trust-api';
import { cn } from '@/lib/utils';

const SEVERITY_TONE: Record<string, string> = {
  high:   'bg-[hsl(var(--kuja-flag)/0.1)] text-[hsl(var(--kuja-flag))] border-[hsl(var(--kuja-flag)/0.3)]',
  medium: 'bg-[hsl(var(--kuja-sun)/0.1)] text-[hsl(var(--kuja-sun))] border-[hsl(var(--kuja-sun)/0.3)]',
  low:    'bg-[hsl(var(--kuja-ink-soft)/0.1)] text-[hsl(var(--kuja-ink-soft))] border-[hsl(var(--kuja-ink-soft)/0.3)]',
};

const CATEGORY_LABEL: Record<string, string> = {
  fraud: 'Fraud',
  investigation: 'Investigation',
  regulatory: 'Regulatory action',
  governance: 'Governance',
  safeguarding: 'Safeguarding',
  finance: 'Financial',
  lawsuit: 'Lawsuit',
  sanctions_adjacent: 'Sanctions-adjacent',
  other: 'Other',
};

function FindingCard({ finding }: { finding: AdverseMediaFinding }) {
  return (
    <div className={cn('rounded-md border p-3', SEVERITY_TONE[finding.severity] ?? SEVERITY_TONE.low)}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <Badge variant="outline" className={SEVERITY_TONE[finding.severity] ?? SEVERITY_TONE.low}>
          {finding.severity.toUpperCase()}
        </Badge>
        <span className="text-[11px] uppercase tracking-wider font-semibold opacity-70">
          {CATEGORY_LABEL[finding.category] ?? finding.category}
        </span>
        <AIConfidenceBadge
          confidence={confidenceFromScore(finding.confidence)}
          variant="inline"
          title={`AI confidence on this finding: ${finding.confidence}/100. Bucketed for calibration.`}
        />
      </div>
      <h4 className="text-sm font-semibold mt-2 text-[hsl(var(--kuja-ink))]">
        {finding.headline}
      </h4>
      <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-1">{finding.summary}</p>
      <div className="flex items-center gap-3 flex-wrap mt-2 text-[11px] text-[hsl(var(--kuja-ink-soft))]">
        {finding.subject && <span>Subject: <strong>{finding.subject}</strong></span>}
        {finding.source && <span>· Source: {finding.source}</span>}
        {finding.published_at && <span>· {finding.published_at}</span>}
        {finding.url && (
          <a
            href={finding.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[hsl(var(--kuja-clay))] hover:underline"
          >
            Open <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  if (source === 'anthropic_web_search') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-[hsl(var(--kuja-grow))]">
        <Globe className="w-3 h-3" /> live web search
      </span>
    );
  }
  if (source === 'claude_training_knowledge') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-[hsl(var(--kuja-sun))]">
        <Database className="w-3 h-3" /> training knowledge fallback
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-[hsl(var(--kuja-ink-soft))]">
      {source}
    </span>
  );
}

export interface AdverseMediaPanelProps {
  orgId: number;
  initialLatest?: AdverseMediaScreening | null;
  canRun?: boolean;
  defaultLeadership?: string[];
}

export function AdverseMediaPanel({
  orgId, initialLatest, canRun = true, defaultLeadership = [],
}: AdverseMediaPanelProps) {
  const [latest, setLatest] = useState<AdverseMediaScreening | null>(initialLatest ?? null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runScreening = async () => {
    setRunning(true);
    setError(null);
    try {
      const resp = await trustApi.runAdverseMedia({
        org_id: orgId,
        leadership: defaultLeadership,
      });
      setLatest(resp.screening);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const summary = latest?.summary;
  const findings = latest?.findings ?? [];
  const overallStatus = summary?.overall_status ?? 'pending';
  const noFindings = findings.length === 0;

  return (
    <Card className="p-4 sm:p-5 border-[hsl(var(--border))]">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2 rounded-md bg-[hsl(var(--kuja-clay)/0.1)]">
            <Newspaper className="w-5 h-5 text-[hsl(var(--kuja-clay))]" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-[hsl(var(--kuja-ink))]">Adverse Media Screening</h3>
            <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-0.5">
              Public reporting on the organisation + named leadership over the last {latest?.lookback_months ?? 24} months.
            </p>
          </div>
        </div>
        {canRun && (
          <button
            type="button"
            onClick={runScreening}
            disabled={running}
            className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[hsl(var(--kuja-clay-dark))] disabled:opacity-60"
          >
            {running ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Screening…</>
            ) : latest ? (
              <><RefreshCw className="w-3.5 h-3.5" /> Re-run</>
            ) : (
              <><Search className="w-3.5 h-3.5" /> Run screening</>
            )}
          </button>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-md bg-[hsl(var(--kuja-flag)/0.1)] border border-[hsl(var(--kuja-flag)/0.3)] p-2.5 text-xs text-[hsl(var(--kuja-flag))]">
          <strong>Could not run screening.</strong> {error}
        </div>
      )}

      {!latest && !running && (
        <div className="mt-4 rounded-md border-2 border-dashed border-[hsl(var(--border))] p-6 text-center">
          <ShieldAlert className="w-8 h-8 mx-auto text-[hsl(var(--kuja-ink-soft))]" />
          <p className="text-sm font-semibold mt-2">No screening run yet</p>
          <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-1">
            Click <strong>Run screening</strong> to search recent web coverage and surface any concerns.
          </p>
        </div>
      )}

      {latest && (
        <>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-md border border-[hsl(var(--border))] p-3">
              <div className="kuja-label">Overall</div>
              <div className={cn(
                'mt-1 text-sm font-semibold uppercase',
                overallStatus === 'flagged' && 'text-[hsl(var(--kuja-flag))]',
                overallStatus === 'review' && 'text-[hsl(var(--kuja-sun))]',
                overallStatus === 'clear' && 'text-[hsl(var(--kuja-grow))]',
                overallStatus === 'pending' && 'text-[hsl(var(--kuja-ink-soft))]',
              )}>{overallStatus}</div>
            </div>
            <div className="rounded-md border border-[hsl(var(--border))] p-3">
              <div className="kuja-label">High</div>
              <div className="mt-1 text-sm font-semibold text-[hsl(var(--kuja-flag))]">{summary?.high_count ?? 0}</div>
            </div>
            <div className="rounded-md border border-[hsl(var(--border))] p-3">
              <div className="kuja-label">Medium</div>
              <div className="mt-1 text-sm font-semibold text-[hsl(var(--kuja-sun))]">{summary?.medium_count ?? 0}</div>
            </div>
            <div className="rounded-md border border-[hsl(var(--border))] p-3">
              <div className="kuja-label">Low</div>
              <div className="mt-1 text-sm font-semibold text-[hsl(var(--kuja-ink-soft))]">{summary?.low_count ?? 0}</div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] text-[hsl(var(--kuja-ink-soft))] flex-wrap gap-2">
            <span>
              Subjects screened: {latest.subjects.map((s, i) => (
                <span key={i}>
                  {i > 0 && ', '}
                  <strong className="text-[hsl(var(--kuja-ink))]">{s}</strong>
                </span>
              ))}
            </span>
            <SourceBadge source={latest.source} />
          </div>

          {latest.ai_notes && (
            <div className="mt-3 rounded-md bg-[hsl(var(--kuja-quartz))] border border-[hsl(var(--border))] p-3">
              <div className="kuja-label">AI summary</div>
              <p className="text-xs text-[hsl(var(--kuja-ink))] mt-1 leading-relaxed">{latest.ai_notes}</p>
            </div>
          )}

          <div className="mt-4 space-y-2">
            {noFindings ? (
              <div className="rounded-md border border-[hsl(var(--kuja-grow)/0.3)] bg-[hsl(var(--kuja-grow)/0.05)] p-3 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-[hsl(var(--kuja-grow))] shrink-0 mt-0.5" />
                <div className="text-xs">
                  <strong>No adverse findings.</strong> The screening returned nothing material across the subjects and lookback window.
                </div>
              </div>
            ) : (
              findings.map((f, i) => <FindingCard key={i} finding={f} />)
            )}
          </div>
        </>
      )}
    </Card>
  );
}
