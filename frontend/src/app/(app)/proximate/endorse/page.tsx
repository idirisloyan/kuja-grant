'use client';

/**
 * Proximate endorser inbox — Phase 629.
 *
 * The first screen of the wireframe from
 * docs/PROXIMATE_FUND_DESIGN.md §3.1. Shows partners awaiting
 * endorsement. Tap → wizard. Arabic-first; relies on the global
 * dir="rtl" toggle the layout already does when lang === 'ar'.
 *
 * One screen, one job: which partner is next.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, Loader2, ChevronLeft, ChevronRight, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';

interface TrustFloor {
  endorsements_independent_count: number;
  endorsements_required: number;
  endorsements_ok: boolean;
  bank_verified: boolean;
  endorsers_meet_reputation_floor: boolean;
  reputation_floor: number;
  ready_for_dd_clear: boolean;
}

interface Partner {
  id: number;
  name: string;
  name_ar: string | null;
  locality: string | null;
  country: string;
  status: string;
  trust_tier: string | null;
  nominated_at: string | null;
  trust_floor_signals: TrustFloor;
}

interface Resp {
  success: boolean;
  partners: Partner[];
  total: number;
}

export default function ProximateInboxPage() {
  const { t, lang } = useTranslation();
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const isRtl = lang === 'ar';

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/proximate/partners')
      .then((r) => { if (!cancelled) setData(r); })
      .catch(() => {/* silent — show empty state */})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Partners that are open to endorsement first; cleared partners last.
  const visible = (data?.partners ?? []).filter(
    (p) => p.status === 'nominated' || p.status === 'endorsements_open' || p.status === 'dd_pending'
  );

  const Chevron = isRtl ? ChevronLeft : ChevronRight;

  return (
    <PageShell>
      <PageHeader
        title={t('proximate.inbox.title')}
        icon={Users}
        subtitle={
          loading
            ? t('proximate.inbox.loading')
            : t(
              visible.length === 1
                ? 'proximate.inbox.count_one'
                : 'proximate.inbox.count_other',
              { n: visible.length },
            )
        }
      />
      <PageMain>
        {loading && (
          <div className="text-sm text-muted-foreground py-6 text-center">
            <Loader2 className="w-4 h-4 animate-spin inline me-2" /> {t('proximate.inbox.loading')}
          </div>
        )}

        {!loading && visible.length === 0 && (
          <Card className="p-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">{t('proximate.inbox.empty')}</p>
            <Link
              href="/proximate/endorse/register"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <UserPlus className="w-3.5 h-3.5" />
              {t('proximate.inbox.become_endorser')}
            </Link>
          </Card>
        )}

        {!loading && visible.length > 0 && (
          <ul className="space-y-2">
            {visible.map((p) => {
              const displayName = isRtl && p.name_ar ? p.name_ar : p.name;
              const floor = p.trust_floor_signals;
              const isReady = floor.ready_for_dd_clear;
              return (
                <li key={p.id}>
                  <Link
                    href={`/proximate/endorse/${p.id}`}
                    className="block"
                  >
                    <Card className="p-4 hover:bg-muted/30 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-medium truncate">{displayName}</h3>
                            {isReady && (
                              <Badge variant="default" className="text-[10px]">
                                {t('proximate.status.dd_clear')}
                              </Badge>
                            )}
                          </div>
                          {p.locality && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {p.locality}
                            </p>
                          )}
                          <p className="text-xs mt-2 tabular-nums">
                            {t('proximate.inbox.progress', {
                              n: floor.endorsements_independent_count,
                              total: floor.endorsements_required,
                            })}
                          </p>
                        </div>
                        <Chevron className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                      </div>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </PageMain>
    </PageShell>
  );
}
