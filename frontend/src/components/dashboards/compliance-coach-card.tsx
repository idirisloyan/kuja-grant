'use client';

/**
 * Phase 74 — NGO compliance coach card.
 *
 * The shift: today donors see an NGO's compliance posture; the NGO only
 * sees red banners. This card flips it — the NGO sees their own
 * compliance posture, benchmarked against peer-median, with one
 * concrete next-action recommendation. Compliance as coaching, not
 * surveillance.
 *
 * Hidden gracefully if the NGO has fewer than 2 submitted reports —
 * there's not enough data to be useful, and "0 days late" with no
 * peer baseline reads as more critical than the NGO deserves.
 */

import useSWR from 'swr';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  TrendingUp, TrendingDown, Minus, Sparkles, ChevronRight,
  ShieldCheck, AlertTriangle, Clock, Target,
} from 'lucide-react';

type Tone = 'good' | 'warn' | 'bad';

interface Pillar {
  key: string;
  label: string;
  score: number;
  peer_median: number | null;
  tone: Tone;
  hint: string;
}

interface NextAction {
  tone: Tone;
  label: string;
  hint: string;
  href?: string;
}

interface ComplianceCoachData {
  success: boolean;
  generated_at: string;
  timeliness: {
    avg_lateness_days: number | null;
    peer_median_days: number | null;
    trend: 'improving' | 'stable' | 'slipping';
    rank_label: string;
    sample_size: number;
    peer_sample_size: number;
  };
  ai_quality: {
    avg_compliance_score: number | null;
    peer_median: number | null;
    trend: 'improving' | 'stable' | 'slipping';
    rank_label: string;
    sample_size: number;
    peer_sample_size: number;
  };
  reports: { total_submitted: number; on_time: number; late: number; overdue_open: number };
  next_action: NextAction | null;
  pillars: Pillar[];
}

const TONE_BG: Record<Tone, string> = {
  good: 'border-[hsl(var(--kuja-grow))]/30 bg-[hsl(var(--kuja-grow))]/10 text-[hsl(var(--kuja-grow))]',
  warn: 'border-[hsl(var(--kuja-sun))]/30 bg-[hsl(var(--kuja-sun))]/10 text-[hsl(var(--kuja-sun))]',
  bad:  'border-destructive/30 bg-destructive/10 text-destructive',
};

function TrendIcon({ t }: { t: 'improving' | 'stable' | 'slipping' }) {
  if (t === 'improving') return <TrendingUp className="w-3 h-3 text-[hsl(var(--kuja-grow))]" />;
  if (t === 'slipping')  return <TrendingDown className="w-3 h-3 text-destructive" />;
  return <Minus className="w-3 h-3 text-muted-foreground" />;
}

export function ComplianceCoachCard() {
  const { data, error, isLoading } = useSWR<ComplianceCoachData>(
    '/dashboard/compliance-coach',
    (url: string) => api.get<ComplianceCoachData>(url),
  );

  if (isLoading) {
    return <div className="kuja-shimmer h-32 rounded-lg" />;
  }
  if (error || !data || !data.success) {
    return null;
  }
  if (data.reports.total_submitted < 2) {
    // Not enough data to coach. Show a friendly first-time card instead.
    return (
      <section className="border border-border rounded-lg bg-card p-5 space-y-2">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[hsl(var(--kuja-grow))]" />
          Compliance coach
        </h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Submit a couple more reports and Kuja will start coaching you here —
          showing how you compare to your peers, what&apos;s trending, and one
          concrete thing to improve next.
        </p>
      </section>
    );
  }

  const na = data.next_action;

  return (
    <section className="border border-border rounded-lg bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[hsl(var(--kuja-grow))]" />
          Compliance coach
        </h2>
        <span className="text-[10px] text-muted-foreground">
          {data.reports.total_submitted} report{data.reports.total_submitted === 1 ? '' : 's'} submitted
          {data.timeliness.peer_sample_size > 0 && (
            <> · benchmark from {data.timeliness.peer_sample_size} peer org{data.timeliness.peer_sample_size === 1 ? '' : 's'}</>
          )}
        </span>
      </div>

      {/* Next action — the punchy "do this next" line */}
      {na && (
        <div className={`border rounded-md px-3 py-2.5 text-xs flex items-start gap-2 ${TONE_BG[na.tone]}`}>
          {na.tone === 'good'
            ? <Sparkles className="w-4 h-4 mt-0.5 shrink-0" />
            : na.tone === 'warn'
              ? <Clock className="w-4 h-4 mt-0.5 shrink-0" />
              : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{na.label}</div>
            <div className="mt-0.5 text-foreground/80 leading-relaxed">{na.hint}</div>
          </div>
          {na.href && (
            <Link href={na.href} className="shrink-0 inline-flex items-center text-[11px] font-semibold hover:underline">
              Open <ChevronRight className="w-3 h-3" />
            </Link>
          )}
        </div>
      )}

      {/* Timeliness + AI quality + reports stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        <Tile
          icon={Clock}
          label="Reporting timeliness"
          value={
            data.timeliness.avg_lateness_days === null
              ? '—'
              : data.timeliness.avg_lateness_days <= 0
                ? `${Math.abs(data.timeliness.avg_lateness_days)}d early avg`
                : `${data.timeliness.avg_lateness_days}d late avg`
          }
          benchmark={
            data.timeliness.peer_median_days === null
              ? null
              : `peer median ${data.timeliness.peer_median_days}d`
          }
          rankLabel={data.timeliness.rank_label}
          trend={data.timeliness.trend}
        />
        <Tile
          icon={Target}
          label="AI content quality"
          value={
            data.ai_quality.avg_compliance_score === null
              ? '—'
              : `${data.ai_quality.avg_compliance_score}/100`
          }
          benchmark={
            data.ai_quality.peer_median === null
              ? null
              : `peer median ${data.ai_quality.peer_median}`
          }
          rankLabel={data.ai_quality.rank_label}
          trend={data.ai_quality.trend}
        />
        <Tile
          icon={ShieldCheck}
          label="Submission record"
          value={`${data.reports.on_time}/${data.reports.total_submitted} on time`}
          benchmark={
            data.reports.overdue_open > 0
              ? `${data.reports.overdue_open} overdue draft${data.reports.overdue_open === 1 ? '' : 's'}`
              : null
          }
          rankLabel={data.reports.overdue_open > 0 ? 'Action needed' : 'In good standing'}
          trend="stable"
        />
      </div>

      {/* Pillar hints — one-line, action-led */}
      {data.pillars.length > 0 && (
        <ul className="space-y-1.5">
          {data.pillars.map((p) => (
            <li key={p.key} className={`border rounded-md px-3 py-2 text-[11px] ${TONE_BG[p.tone]}`}>
              <div className="font-semibold">{p.label}</div>
              <div className="mt-0.5 text-foreground/80 leading-relaxed">{p.hint}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Tile({
  icon: Icon, label, value, benchmark, rankLabel, trend,
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string;
  benchmark: string | null;
  rankLabel: string;
  trend: 'improving' | 'stable' | 'slipping';
}) {
  return (
    <div className="border border-border rounded-md p-2.5 space-y-1">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="font-semibold text-sm">{value}</div>
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground">{benchmark ?? '—'}</span>
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <TrendIcon t={trend} />
          {rankLabel}
        </span>
      </div>
    </div>
  );
}
