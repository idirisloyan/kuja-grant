'use client';

/**
 * DonorProfileClient — Phase 18B (May 2026).
 *
 * Public-ish donor profile page. Any logged-in user can view; the data
 * shown is aggregates only (no specific NGO names that won/lost).
 * Helps NGOs research a donor before committing effort to apply.
 *
 * Sections:
 *   - Hero with donor name + verified badge + key facts
 *   - Portfolio snapshot (4-stat grid)
 *   - Sector + country distribution (chip clusters)
 *   - Reporting burden signal
 *   - Sparse-data fallback if fewer than 3 decided apps
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Building2, Globe, ShieldCheck, ArrowLeft, Loader2,
  CalendarClock, AlertTriangle, FileText, Briefcase, DollarSign,
  MapPin, BookOpen,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { NameChip } from '@/components/shared/name-chip';
import { NativeShareButton } from '@/components/shared/native-share-button';
import { TrendingUp, TrendingDown, Minus, Users } from 'lucide-react';

interface BenchmarkMetric {
  code: string;
  label: string;
  self_value: number;
  peer_median: number;
  peer_count: number;
  percentile: number;
  verdict: 'above' | 'around' | 'below';
  higher_is_better: boolean;
  unit: string;
}

interface BenchmarksResp {
  success: boolean;
  source: 'benchmark' | 'sparse' | 'unavailable';
  peer_count: number;
  metrics: BenchmarkMetric[];
}

interface DonorProfile {
  success: boolean;
  reason?: string;
  donor_org_id?: number;
  donor_name?: string;
  donor_country?: string | null;
  verified?: boolean;
  website?: string | null;
  mission?: string | null;
  portfolio_size?: number;
  open_grant_count?: number;
  total_funding_committed_usd?: number | null;
  decision_speed_days?: number | null;
  decline_rate?: number | null;
  decided_applications_total?: number;
  active_sectors?: { name: string; count: number }[];
  active_countries?: { name: string; count: number }[];
  typical_grant_size_band?: string | null;
  reporting_burden?: {
    signal: 'low' | 'medium' | 'high' | null;
    median_requirements_per_grant: number;
  };
  source?: 'profile' | 'sparse' | 'unavailable';
}

const BAND_LABELS: Record<string, string> = {
  under_25k:   'Under $25k',
  '25k_100k':  '$25k–100k',
  '100k_500k': '$100k–500k',
  '500k_plus': '$500k+',
};

const BURDEN_META: Record<string, { cls: string; label: string }> = {
  low:    { cls: 'text-[hsl(var(--kuja-grow))]', label: 'Lighter than average' },
  medium: { cls: 'text-[hsl(var(--kuja-sun))]',  label: 'Typical' },
  high:   { cls: 'text-[hsl(var(--kuja-flag))]', label: 'Heavier than average' },
};

function formatUsd(n?: number | null) {
  if (n == null) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n}`;
}

export default function DonorProfileClient() {
  const params = useParams();
  const router = useRouter();
  const [id, setId] = useState<number | null>(() => {
    if (typeof window !== 'undefined') {
      const m = window.location.pathname.match(/\/donors\/(\d+)/);
      if (m && m[1] !== '0') return Number(m[1]);
    }
    const fromParams = Number(params.id);
    return Number.isFinite(fromParams) && fromParams > 0 ? fromParams : null;
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const m = window.location.pathname.match(/\/donors\/(\d+)/);
    if (m && m[1] !== '0') {
      const n = Number(m[1]);
      if (n !== id) setId(n);
    }
  }, [params.id, id]);

  const [data, setData] = useState<DonorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [bench, setBench] = useState<BenchmarksResp | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    api.get<DonorProfile>(`/api/organizations/${id}/donor-profile`)
      .then((r) => { if (!cancelled) setData(r); })
      .catch(() => {/* quiet */})
      .finally(() => { if (!cancelled) setLoading(false); });
    // Phase 19A — lazy fetch peer benchmarks too (separate quiet call)
    api.get<BenchmarksResp>(`/api/organizations/${id}/donor-benchmarks`)
      .then((r) => { if (!cancelled) setBench(r); })
      .catch(() => {/* quiet */});
    return () => { cancelled = true; };
  }, [id]);

  if (id == null || loading) {
    return (
      <div className="space-y-3">
        <div className="kuja-shimmer h-8 w-64 rounded" />
        <div className="kuja-shimmer h-32 rounded-xl" />
        <div className="kuja-shimmer h-48 rounded-xl" />
      </div>
    );
  }

  if (!data?.success) {
    return (
      <Card className="p-6 max-w-lg mx-auto mt-12 border-[hsl(var(--kuja-flag)/0.3)]">
        <h2 className="text-base font-semibold text-[hsl(var(--kuja-flag))]">Donor profile not found</h2>
        <p className="text-xs mt-1">
          {data?.reason === 'not_donor'
            ? "This organisation isn't a donor — try /organizations instead."
            : "We couldn't load this donor profile."}
        </p>
      </Card>
    );
  }

  const burden = data.reporting_burden?.signal
    ? BURDEN_META[data.reporting_burden.signal]
    : null;

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <button
        type="button"
        onClick={() => router.push('/organizations/search')}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to organizations
      </button>

      {/* Hero */}
      <Card className="p-5 sm:p-6">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="p-2 rounded-md bg-[hsl(var(--kuja-sand))]/40">
            <Building2 className="h-7 w-7 text-[hsl(var(--kuja-clay))]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="kuja-display text-2xl sm:text-3xl">{data.donor_name}</h1>
              {data.verified && (
                <Badge variant="outline" className="text-[10px] text-[hsl(var(--kuja-grow))] border-[hsl(var(--kuja-grow))]">
                  <ShieldCheck className="h-3 w-3 mr-1" /> Verified
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px]">Donor</Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {data.donor_country && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {data.donor_country}
                </span>
              )}
              {data.website && (
                <a
                  href={data.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  <Globe className="h-3 w-3" /> {data.website.replace(/^https?:\/\//, '')}
                </a>
              )}
            </div>
            {data.mission && (
              <p className="mt-2 text-sm leading-relaxed">{data.mission}</p>
            )}
          </div>
          <NativeShareButton
            url={typeof window !== 'undefined' ? window.location.href : ''}
            title={`${data.donor_name ?? 'Donor'} · Kuja`}
            text={`${data.donor_name ?? 'Donor'} on Kuja — portfolio + funding patterns at a glance.`}
            label="Share profile"
          />
        </div>
      </Card>

      {data.source === 'sparse' && (
        <Card className="p-4 border-[hsl(var(--kuja-sun)/0.3)] bg-[hsl(var(--kuja-sun)/0.05)]">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-[hsl(var(--kuja-sun))]" />
            <div className="text-xs">
              This donor has fewer than 3 decided applications on the platform —
              not enough yet to fairly characterise their decision pattern.
              {data.open_grant_count !== undefined && data.open_grant_count > 0 && (
                <> They have <strong>{data.open_grant_count}</strong> open grant{data.open_grant_count === 1 ? '' : 's'} you can still apply to.</>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Portfolio snapshot */}
      <div>
        <h2 className="kuja-display text-lg mb-2">Portfolio snapshot</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Card className="p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Briefcase className="h-3 w-3" /> Open grants
            </div>
            <div className="text-2xl font-semibold tabular-nums mt-0.5">
              {data.open_grant_count ?? 0}
            </div>
            <div className="text-[10px] text-muted-foreground">
              of {data.portfolio_size ?? 0} total
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <DollarSign className="h-3 w-3" /> Committed
            </div>
            <div className="text-2xl font-semibold tabular-nums mt-0.5">
              {formatUsd(data.total_funding_committed_usd)}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {data.typical_grant_size_band
                ? `typical ${BAND_LABELS[data.typical_grant_size_band] ?? data.typical_grant_size_band}`
                : 'across portfolio'}
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <CalendarClock className="h-3 w-3" /> Decision speed
            </div>
            <div className="text-2xl font-semibold tabular-nums mt-0.5">
              {data.decision_speed_days != null ? `${data.decision_speed_days}d` : '—'}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {data.decided_applications_total
                ? `median of ${data.decided_applications_total} decisions`
                : 'no decisions yet'}
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <AlertTriangle className="h-3 w-3" /> Decline rate
            </div>
            <div className="text-2xl font-semibold tabular-nums mt-0.5">
              {data.decline_rate != null ? `${data.decline_rate}%` : '—'}
            </div>
            <div className="text-[10px] text-muted-foreground">
              rejected / decided
            </div>
          </Card>
        </div>
      </div>

      {/* Sectors + countries */}
      <div className="grid gap-3 md:grid-cols-2">
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <Briefcase className="h-4 w-4 text-[hsl(var(--kuja-clay))]" /> Active sectors
          </h3>
          {data.active_sectors?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {data.active_sectors.map((s) => (
                <NameChip
                  key={s.name}
                  name={`${s.name} · ${s.count}`}
                  size="sm"
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">No sectors tagged on grants yet.</p>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-[hsl(var(--kuja-clay))]" /> Active countries
          </h3>
          {data.active_countries?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {data.active_countries.map((c) => (
                <NameChip
                  key={c.name}
                  name={`${c.name} · ${c.count}`}
                  size="sm"
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">No countries tagged on grants yet.</p>
          )}
        </Card>
      </div>

      {/* Reporting burden */}
      {data.reporting_burden && burden && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <BookOpen className="h-4 w-4 text-[hsl(var(--kuja-clay))]" /> Reporting burden
          </h3>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="outline" className={burden.cls}>
              {burden.label}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Median <strong className="text-foreground tabular-nums">
                {data.reporting_burden.median_requirements_per_grant}
              </strong> reporting requirements per grant
            </span>
          </div>
        </Card>
      )}

      {/* Phase 19A — anonymous peer benchmarks for this donor */}
      {bench && bench.success && bench.source === 'benchmark' && bench.metrics.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <Users className="h-4 w-4 text-[hsl(var(--kuja-clay))]" /> How they compare to peer donors
          </h3>
          <p className="text-[10px] text-muted-foreground mb-3">
            Anonymous comparison vs {bench.peer_count} other donors on the platform.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {bench.metrics.map((m) => {
              const Icon = m.verdict === 'above' ? TrendingUp
                : m.verdict === 'below' ? TrendingDown : Minus;
              const tone = m.verdict === 'above' ? 'text-[hsl(var(--kuja-grow))]'
                : m.verdict === 'below' ? 'text-[hsl(var(--kuja-flag))]'
                : 'text-[hsl(var(--kuja-ink-soft))]';
              return (
                <div key={m.code} className="rounded-md border border-[hsl(var(--border))] p-2 space-y-1">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{m.label}</div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-lg font-semibold tabular-nums">{m.self_value}{m.unit}</span>
                    <Icon className={`h-3.5 w-3.5 ${tone}`} />
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    peers median {m.peer_median}{m.unit} · {m.percentile}th pct
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* CTA back to grants list */}
      {data.open_grant_count && data.open_grant_count > 0 && (
        <Card className="p-4 bg-gradient-to-br from-background to-[hsl(var(--kuja-sand))]/30 border-[hsl(var(--kuja-clay))]/40">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold">{data.open_grant_count} open grant{data.open_grant_count === 1 ? '' : 's'}</h3>
              <p className="text-xs text-muted-foreground">Browse this donor&apos;s active opportunities.</p>
            </div>
            <button
              type="button"
              onClick={() => router.push('/grants')}
              className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay-dark))] text-white text-sm font-medium px-3 py-2"
            >
              <FileText className="h-4 w-4" />
              See grants
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
