'use client';

/**
 * Phase 99 — Admin AI quality dashboard.
 *
 * Companion to Phase 97's failure-rate rollup. Where Phase 97 answered
 * "which AI surfaces fail," this answers "which AI surfaces produce
 * output users actually accept." Backend telemetry shipped in Phase
 * 98.10; this is the UI side that surfaces it.
 *
 * Four cuts per surface:
 *   - median edit-ratio (how much users changed the AI's proposal)
 *   - mode distribution (verbatim accept / blended / rejected)
 *   - false-confidence rate (accepted verbatim, later corrected)
 *   - per-language edit-ratio (catches per-locale prompt failures)
 *
 * The false-confidence guardrail is the design-doc addition. Without it
 * the team would optimise acceptance and ship confidently-wrong AI.
 */

import { useState } from 'react';
import useSWR from 'swr';
import {
  PageShell, PageBack, PageHeader, PageMain,
} from '@/components/layout/page-shell';
import { Sparkles, AlertTriangle, ShieldAlert, Globe } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { EmptyState } from '@/components/shared/empty-state';

interface SurfaceRow {
  surface: string;
  total_events: number;
  median_edit_ratio: number | null;
  mode_distribution: { verbatim: number; blended: number; rejected: number };
  false_confidence_count: number;
  false_confidence_rate_pct: number;
  by_language: { language: string; count: number; median_edit_ratio: number | null }[];
}

interface Resp {
  success: boolean;
  window_hours: number;
  surfaces: SurfaceRow[];
  overall: {
    total_surfaces: number;
    total_events: number;
    median_edit_ratio_overall: number | null;
    false_confidence_rate_pct_overall: number;
  };
}

const WINDOWS = [
  { label: '24h', hours: 24 },
  { label: '3d', hours: 72 },
  { label: '7d', hours: 168 },
  { label: '30d', hours: 720 },
];

function pct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${Math.round(n * 100)}%`;
}

function tone(value: number, thresholds: { warn: number; bad: number }): string {
  if (value >= thresholds.bad) return 'text-rose-700 bg-rose-50';
  if (value >= thresholds.warn) return 'text-amber-700 bg-amber-50';
  return 'text-emerald-700 bg-emerald-50';
}

export default function AIQualityPage() {
  const user = useAuthStore((s) => s.user);
  const [hours, setHours] = useState(168);

  const { data, error, isLoading } = useSWR<Resp>(
    user?.role === 'admin' ? `/admin/ai-quality-rollup?hours=${hours}` : null,
    (url: string) => api.get<Resp>(url),
  );

  if (user?.role !== 'admin') {
    return (
      <PageShell>
        <PageHeader title="AI quality" subtitle="Admin only." />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageBack href="/admin/ai-telemetry" label="Back to AI telemetry" />
      <PageHeader
        title="AI quality"
        subtitle="Edit-ratio, mode distribution, and false-confidence rate per surface × language."
      />

      {/* Window picker */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-muted-foreground">Window:</span>
        {WINDOWS.map((w) => (
          <button
            type="button"
            key={w.hours}
            onClick={() => setHours(w.hours)}
            className={`text-xs font-semibold rounded-md px-2.5 py-1 ${
              hours === w.hours
                ? 'bg-[hsl(var(--kuja-clay))] text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/70'
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>

      <PageMain>
        {isLoading && (
          <div className="kuja-shimmer h-32 rounded-lg" />
        )}
        {error && (
          <div className="border border-rose-200 bg-rose-50 rounded-md p-4 text-sm text-rose-800">
            Could not load AI quality. Check /admin/system-health for backend status.
          </div>
        )}
        {data?.success && (
          <>
            {/* Overall summary tile row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <SummaryTile
                icon={Sparkles}
                label="Surfaces with quality signal"
                value={String(data.overall.total_surfaces)}
                sub={`${data.overall.total_events} events`}
              />
              <SummaryTile
                icon={AlertTriangle}
                label="Median edit ratio (overall)"
                value={pct(data.overall.median_edit_ratio_overall)}
                sub="Lower = AI output more accepted"
                toneClass={
                  data.overall.median_edit_ratio_overall != null
                    ? tone(data.overall.median_edit_ratio_overall, { warn: 0.4, bad: 0.6 })
                    : ''
                }
              />
              <SummaryTile
                icon={ShieldAlert}
                label="False confidence (overall)"
                value={`${data.overall.false_confidence_rate_pct_overall}%`}
                sub="Of verbatim accepts later corrected"
                toneClass={tone(data.overall.false_confidence_rate_pct_overall / 100, {
                  warn: 0.1,
                  bad: 0.25,
                })}
              />
            </div>

            {/* Per-surface table */}
            {data.surfaces.length === 0 ? (
              <EmptyState
                icon={Sparkles}
                title="No AI quality events yet"
                body={`No <recordAiQuality> events recorded in the last ${hours}h. ` +
                  `Verify the producer endpoints (POST /api/ai-telemetry/quality + ` +
                  `/false-confidence) are wired on the surfaces you want to measure.`}
              />
            ) : (
              <div className="border border-border rounded-lg bg-card overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="text-left p-3">Surface</th>
                      <th className="text-right p-3">Events</th>
                      <th className="text-right p-3">Median edit ratio</th>
                      <th className="text-right p-3">Mode mix</th>
                      <th className="text-right p-3">False confidence</th>
                      <th className="text-left p-3">Languages</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.surfaces.map((s) => (
                      <tr key={s.surface} className="border-t border-border align-top">
                        <td className="p-3 font-mono text-[11px] font-semibold">{s.surface}</td>
                        <td className="p-3 text-right">{s.total_events}</td>
                        <td className={`p-3 text-right font-semibold ${
                          s.median_edit_ratio == null ? '' :
                            s.median_edit_ratio >= 0.6 ? 'text-rose-700' :
                              s.median_edit_ratio >= 0.4 ? 'text-amber-700' :
                                'text-emerald-700'
                        }`}>
                          {pct(s.median_edit_ratio)}
                        </td>
                        <td className="p-3 text-right">
                          <ModeBar dist={s.mode_distribution} total={s.total_events} />
                        </td>
                        <td className="p-3 text-right">
                          <span className={`inline-block rounded px-1.5 py-0.5 font-semibold ${
                            tone(s.false_confidence_rate_pct / 100, { warn: 0.1, bad: 0.25 })
                          }`}>
                            {s.false_confidence_rate_pct}%
                          </span>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {s.false_confidence_count} of {s.mode_distribution.verbatim} verbatim
                          </div>
                        </td>
                        <td className="p-3 space-y-0.5">
                          {s.by_language.slice(0, 4).map((lr) => (
                            <div key={lr.language} className="flex items-center gap-1.5 text-[11px]">
                              <Globe className="w-3 h-3 text-muted-foreground" />
                              <span className="font-semibold">{lr.language}</span>
                              <span className="text-muted-foreground">
                                {lr.count} · {pct(lr.median_edit_ratio)}
                              </span>
                            </div>
                          ))}
                          {s.by_language.length === 0 && (
                            <span className="text-muted-foreground italic">no language tag</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-xs text-muted-foreground mt-4">
              Median edit ratio: amber ≥ 40%, red ≥ 60%. False-confidence rate: amber ≥ 10%,
              red ≥ 25% — these mean users accepted AI verbatim and the recipient later
              corrected it. Backed by AICallLog rows with endpoint tag
              <code className="mx-1">ai-quality/&lt;surface&gt;</code>.
            </p>
          </>
        )}
      </PageMain>
    </PageShell>
  );
}

function SummaryTile({
  icon: Icon, label, value, sub, toneClass = '',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  toneClass?: string;
}) {
  return (
    <div className="border border-border bg-card rounded-lg p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className={`kuja-display text-3xl mt-1 ${toneClass.replace(/bg-\S+/, '')}`}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function ModeBar({ dist, total }: {
  dist: { verbatim: number; blended: number; rejected: number };
  total: number;
}) {
  if (total === 0) return <span className="text-muted-foreground">—</span>;
  const vPct = (dist.verbatim / total) * 100;
  const bPct = (dist.blended / total) * 100;
  const rPct = (dist.rejected / total) * 100;
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="h-1.5 w-24 rounded-full overflow-hidden bg-muted flex">
        <div className="bg-emerald-500" style={{ width: `${vPct}%` }} title={`${dist.verbatim} verbatim`} />
        <div className="bg-amber-500" style={{ width: `${bPct}%` }} title={`${dist.blended} blended`} />
        <div className="bg-rose-500" style={{ width: `${rPct}%` }} title={`${dist.rejected} rejected`} />
      </div>
      <div className="text-[10px] text-muted-foreground">
        {dist.verbatim}v / {dist.blended}b / {dist.rejected}r
      </div>
    </div>
  );
}
