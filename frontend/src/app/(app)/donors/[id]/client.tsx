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
import { PageShell, PageBack, PageMain } from '@/components/layout/page-shell';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { NameChip } from '@/components/shared/name-chip';
import { NativeShareButton } from '@/components/shared/native-share-button';
import { DonorCohortCard } from '@/components/dashboards/donor-cohort-card';
import { useAuthStore } from '@/stores/auth-store';
import { useTranslation } from '@/lib/hooks/use-translation';
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

const BURDEN_META: Record<string, { cls: string }> = {
  low:    { cls: 'text-[hsl(var(--kuja-grow))]' },
  medium: { cls: 'text-[hsl(var(--kuja-sun))]' },
  high:   { cls: 'text-[hsl(var(--kuja-flag))]' },
};

function formatUsd(n?: number | null) {
  if (n == null) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n}`;
}

export default function DonorProfileClient() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.user);
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
        <h2 className="text-base font-semibold text-[hsl(var(--kuja-flag))]">{t('donor_detail.donor_profile_not_found')}</h2>
        <p className="text-xs mt-1">
          {data?.reason === 'not_donor'
            ? t('donor_detail.not_a_donor')
            : t('donor_detail.load_failed')}
        </p>
      </Card>
    );
  }

  const burden = data.reporting_burden?.signal
    ? BURDEN_META[data.reporting_burden.signal]
    : null;

  const bandLabel = (band: string): string => {
    const map: Record<string, string> = {
      under_25k:   t('donor_detail.band_under_25k'),
      '25k_100k':  t('donor_detail.band_25k_100k'),
      '100k_500k': t('donor_detail.band_100k_500k'),
      '500k_plus': t('donor_detail.band_500k_plus'),
    };
    return map[band] ?? band;
  };

  return (
    <div className="max-w-5xl mx-auto">
      <PageShell>
        <PageBack href="/organizations/search" label={t('donor_detail.back_to_organizations')} />
        <PageMain>
      {/* Hero card carries the title + verified badge */}
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
                  <ShieldCheck className="h-3 w-3 mr-1" /> {t('donor_detail.verified')}
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px]">{t('donor_detail.donor')}</Badge>
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
            title={t('donor_detail.share_title', { name: data.donor_name ?? t('donor_detail.donor') })}
            text={t('donor_detail.share_text', { name: data.donor_name ?? t('donor_detail.donor') })}
            label={t('donor_detail.share_profile')}
          />
        </div>
      </Card>

      {data.source === 'sparse' && (
        <Card className="p-4 border-[hsl(var(--kuja-sun)/0.3)] bg-[hsl(var(--kuja-sun)/0.05)]">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-[hsl(var(--kuja-sun))]" />
            <div className="text-xs">
              {t('donor_detail.sparse_notice')}
              {data.open_grant_count !== undefined && data.open_grant_count > 0 && (
                <> {t('donor_detail.sparse_open_grants', { n: data.open_grant_count })}</>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Portfolio snapshot */}
      <div>
        <h2 className="kuja-display text-lg mb-2">{t('donor_detail.portfolio_snapshot')}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Card className="p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Briefcase className="h-3 w-3" /> {t('donor_detail.open_grants')}
            </div>
            <div className="text-2xl font-semibold tabular-nums mt-0.5">
              {data.open_grant_count ?? 0}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {t('donor_detail.of_n_total', { n: data.portfolio_size ?? 0 })}
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <DollarSign className="h-3 w-3" /> {t('donor_detail.committed')}
            </div>
            <div className="text-2xl font-semibold tabular-nums mt-0.5">
              {formatUsd(data.total_funding_committed_usd)}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {data.typical_grant_size_band
                ? t('donor_detail.typical_band', { band: bandLabel(data.typical_grant_size_band) })
                : t('donor_detail.across_portfolio')}
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <CalendarClock className="h-3 w-3" /> {t('donor_detail.decision_speed')}
            </div>
            <div className="text-2xl font-semibold tabular-nums mt-0.5">
              {data.decision_speed_days != null ? `${data.decision_speed_days}d` : '—'}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {data.decided_applications_total
                ? t('donor_detail.median_of_n_decisions', { n: data.decided_applications_total })
                : t('donor_detail.no_decisions_yet')}
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <AlertTriangle className="h-3 w-3" /> {t('donor_detail.decline_rate')}
            </div>
            <div className="text-2xl font-semibold tabular-nums mt-0.5">
              {data.decline_rate != null ? `${data.decline_rate}%` : '—'}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {t('donor_detail.rejected_decided')}
            </div>
          </Card>
        </div>
      </div>

      {/* Sectors + countries */}
      <div className="grid gap-3 md:grid-cols-2">
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <Briefcase className="h-4 w-4 text-[hsl(var(--kuja-clay))]" /> {t('donor_detail.active_sectors')}
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
            <p className="text-xs text-muted-foreground italic">{t('donor_detail.no_sectors')}</p>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-[hsl(var(--kuja-clay))]" /> {t('donor_detail.active_countries')}
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
            <p className="text-xs text-muted-foreground italic">{t('donor_detail.no_countries')}</p>
          )}
        </Card>
      </div>

      {/* Reporting burden */}
      {data.reporting_burden && burden && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <BookOpen className="h-4 w-4 text-[hsl(var(--kuja-clay))]" /> {t('donor_detail.reporting_burden')}
          </h3>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="outline" className={burden.cls}>
              {t(`donor_detail.burden_${data.reporting_burden.signal}`)}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {t('donor_detail.median_reporting_requirements', { n: data.reporting_burden.median_requirements_per_grant })}
            </span>
          </div>
        </Card>
      )}

      {/* Phase 19A — anonymous peer benchmarks for this donor */}
      {bench && bench.success && bench.source === 'benchmark' && bench.metrics.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <Users className="h-4 w-4 text-[hsl(var(--kuja-clay))]" /> {t('donor_detail.peer_comparison_heading')}
          </h3>
          <p className="text-[10px] text-muted-foreground mb-3">
            {t('donor_detail.anonymous_comparison', { n: bench.peer_count })}
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
                    {t('donor_detail.peers_median', { median: m.peer_median, unit: m.unit, percentile: m.percentile })}
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
              <h3 className="text-sm font-semibold">{t('donor_detail.n_open_grants', { n: data.open_grant_count })}</h3>
              <p className="text-xs text-muted-foreground">{t('donor_detail.browse_opportunities')}</p>
            </div>
            <button
              type="button"
              onClick={() => router.push('/grants')}
              className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay-dark))] text-white text-sm font-medium px-3 py-2"
            >
              <FileText className="h-4 w-4" />
              {t('donor_detail.see_grants')}
            </button>
          </div>
        </Card>
      )}

      {/* Phase 25C — admin-only: cohort analytics for this donor. */}
      {currentUser?.role === 'admin' && data.donor_org_id && (
        <DonorCohortCard donorOrgId={data.donor_org_id} />
      )}
        </PageMain>
      </PageShell>
    </div>
  );
}
