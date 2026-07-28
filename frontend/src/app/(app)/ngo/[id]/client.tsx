'use client';

/**
 * NGOSummaryClient — Phase 19C (May 2026).
 *
 * Public read-only NGO summary page. Renders only what the NGO has
 * explicitly opted into publishing. Mirrors DonorProfileClient (Phase 18B)
 * in structure so the platform's research-before-engage pattern is
 * symmetric across both sides.
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Building2, Globe, ShieldCheck, ArrowLeft,
  MapPin, Briefcase, Award, FileCheck2,
  Sparkles, Lock,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { NameChip } from '@/components/shared/name-chip';
import { NativeShareButton } from '@/components/shared/native-share-button';
import { OneNumberCard } from '@/components/shared/one-number-card';
import { PageShell, PageBack, PageMain } from '@/components/layout/page-shell';
import { useTranslation } from '@/lib/hooks/use-translation';

interface NGOSummary {
  success: boolean;
  reason?: string;
  ngo_org_id?: number;
  ngo_name?: string;
  country?: string | null;
  verified?: boolean;
  mission?: string | null;
  website?: string | null;
  year_established?: number | null;
  staff_count?: string | null;
  annual_budget?: string | null;
  sectors?: string[];
  geographic_areas?: string[];
  focus_areas?: string[];
  capacity_score?: number | null;
  diligence_score?: number | null;
  overall_score?: number | null;
  overall_status?: string | null;
  awarded_count?: number;
  active_grant_count?: number;
  reports_submitted_count?: number;
  passport?: { slug: string | null; published_at: string | null } | null;
}

function ScoreTile({ label, value, max = 100 }: { label: string; value: number | null | undefined; max?: number }) {
  return (
    <div className="rounded-md border border-[hsl(var(--border))] p-3 text-center">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums mt-0.5">
        {value != null ? value : '—'}
        {value != null && <span className="text-[10px] text-muted-foreground">/{max}</span>}
      </div>
    </div>
  );
}

export default function NGOSummaryClient() {
  const params = useParams();
  const router = useRouter();
  const { t } = useTranslation();
  const [id, setId] = useState<number | null>(() => {
    if (typeof window !== 'undefined') {
      const m = window.location.pathname.match(/\/ngo\/(\d+)/);
      if (m && m[1] !== '0') return Number(m[1]);
    }
    const fromParams = Number(params.id);
    return Number.isFinite(fromParams) && fromParams > 0 ? fromParams : null;
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const m = window.location.pathname.match(/\/ngo\/(\d+)/);
    if (m && m[1] !== '0') {
      const n = Number(m[1]);
      if (n !== id) setId(n);
    }
  }, [params.id, id]);

  const [data, setData] = useState<NGOSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    api.get<NGOSummary>(`/api/organizations/${id}/ngo-summary`)
      .then((r) => { if (!cancelled) setData(r); })
      .catch(() => {/* quiet */})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  if (id == null || loading) {
    return (
      <div className="space-y-3">
        <div className="kuja-shimmer h-8 w-64 rounded" />
        <div className="kuja-shimmer h-32 rounded-xl" />
      </div>
    );
  }

  // Two distinct empty states: doesn't exist vs. not opted-in
  if (!data?.success) {
    const isPrivate = data?.reason === 'not_published';
    return (
      <Card className="p-6 max-w-lg mx-auto mt-12 border-[hsl(var(--kuja-flag)/0.3)]">
        <div className="flex items-start gap-2">
          {isPrivate
            ? <Lock className="h-5 w-5 mt-0.5 text-[hsl(var(--kuja-ink-soft))]" />
            : <Building2 className="h-5 w-5 mt-0.5 text-[hsl(var(--kuja-flag))]" />}
          <div>
            <h2 className="text-base font-semibold">
              {isPrivate ? t('ngo_detail.not_opted_in_title') : t('ngo_detail.not_found_title')}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {isPrivate
                ? t('ngo_detail.not_opted_in_body')
                : t('ngo_detail.not_found_body')}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <PageShell>
        <PageBack href="/organizations/search" label={t('ngo_detail.back_to_organizations')} />
        <PageMain>
      {/* Hero card carries the title + verified badge */}
      <Card className="p-5 sm:p-6">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="p-2 rounded-md bg-[hsl(var(--kuja-sand))]/40">
            <Building2 className="h-7 w-7 text-[hsl(var(--kuja-clay))]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="kuja-display text-2xl sm:text-3xl">{data.ngo_name}</h1>
              {data.verified && (
                <Badge variant="outline" className="text-[10px] text-[hsl(var(--kuja-grow))] border-[hsl(var(--kuja-grow))]">
                  <ShieldCheck className="h-3 w-3 mr-1" /> {t('ngo_detail.verified')}
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px]">{t('ngo_detail.badge_ngo')}</Badge>
              {data.passport?.slug && (
                <Badge variant="outline" className="text-[10px] text-[hsl(var(--kuja-clay))] border-[hsl(var(--kuja-clay))]">
                  <Sparkles className="h-3 w-3 mr-1" /> {t('ngo_detail.capacity_passport')}
                </Badge>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {data.country && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {data.country}
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
              {data.year_established && <span>{t('ngo_detail.since', { year: data.year_established })}</span>}
              {data.staff_count && <span>{t('ngo_detail.staff_count', { count: data.staff_count })}</span>}
            </div>
            {data.mission && (
              <p className="mt-2 text-sm leading-relaxed">{data.mission}</p>
            )}
          </div>
          <NativeShareButton
            url={typeof window !== 'undefined' ? window.location.href : ''}
            title={t('ngo_detail.share_title', { name: data.ngo_name ?? t('ngo_detail.organisation_fallback') })}
            text={t('ngo_detail.share_text', { name: data.ngo_name ?? t('ngo_detail.organisation_fallback') })}
            label={t('ngo_detail.share_profile')}
          />
        </div>
      </Card>

      {/* Trust scores */}
      {(data.overall_score != null || data.capacity_score != null) && (
        <div>
          <h2 className="kuja-display text-lg mb-2">{t('ngo_detail.trust_at_a_glance')}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <ScoreTile label={t('ngo_detail.score_overall')} value={data.overall_score} />
            <ScoreTile label={t('ngo_detail.score_capacity')} value={data.capacity_score} />
            <ScoreTile label={t('ngo_detail.score_diligence')} value={data.diligence_score} />
          </div>
          {data.overall_status && (
            <p className="mt-2 text-[10px] text-muted-foreground">
              {t('ngo_detail.status_label')} <strong className="text-foreground">{data.overall_status}</strong>
            </p>
          )}
        </div>
      )}

      {/* Delivery snapshot — Phase 98.4 OneNumberCard pattern */}
      <div>
        <h2 className="kuja-display text-lg mb-2">{t('ngo_detail.delivery_snapshot')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <OneNumberCard
            label={t('ngo_detail.awarded')}
            value={String(data.awarded_count ?? 0)}
            icon={Award}
            comparison={t('ngo_detail.awarded_comparison')}
          />
          <OneNumberCard
            label={t('ngo_detail.active')}
            value={String(data.active_grant_count ?? 0)}
            icon={Briefcase}
            comparison={t('ngo_detail.active_comparison')}
          />
          <OneNumberCard
            label={t('ngo_detail.reports')}
            value={String(data.reports_submitted_count ?? 0)}
            icon={FileCheck2}
            comparison={t('ngo_detail.reports_comparison')}
            tone="success"
          />
        </div>
      </div>

      {/* Sectors + geography */}
      <div className="grid gap-3 md:grid-cols-2">
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2">{t('ngo_detail.sectors')}</h3>
          {data.sectors?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {data.sectors.map((s) => <NameChip key={s} name={s} size="sm" />)}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">{t('ngo_detail.no_sectors')}</p>
          )}
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2">{t('ngo_detail.geographic_footprint')}</h3>
          {data.geographic_areas?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {data.geographic_areas.map((g) => <NameChip key={g} name={g} size="sm" />)}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">{t('ngo_detail.no_geographies')}</p>
          )}
        </Card>
      </div>

      <p className="text-[10px] text-muted-foreground text-center">
        {t('ngo_detail.footer_note')}
      </p>
        </PageMain>
      </PageShell>
    </div>
  );
}
