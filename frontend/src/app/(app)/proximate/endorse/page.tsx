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
import { EmptyState } from '@/components/proximate/empty-state';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/hooks/use-translation';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';

// Round lifecycle / partner readiness → design-system pill tone.
const PROX_DISPLAY = {
  fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif',
  fontWeight: 700,
} as const;

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
  source?: 'self' | 'staff';
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
          <div className="prox-panel">
            <EmptyState
              compact
              icon={Users}
              title={t('proximate.inbox.empty')}
              action={(
                <Link
                  href="/proximate/endorse/register"
                  className="inline-flex items-center gap-1.5 text-xs hover:underline"
                  style={{ color: 'var(--prox-accent)', fontWeight: 600 }}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  {t('proximate.inbox.become_endorser')}
                </Link>
              )}
            />
          </div>
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
                    <div className="prox-panel transition-colors" style={{ padding: '16px' }}>
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="truncate" style={{ ...PROX_DISPLAY, color: 'var(--prox-ink)' }}>{displayName}</h3>
                            {isReady && (
                              <span className="prox-pill good">
                                {t('proximate.status.dd_clear')}
                              </span>
                            )}
                            {p.source === 'self' && (
                              <span className="prox-pill acc">
                                {t('proximate.inbox.self_nominated')}
                              </span>
                            )}
                          </div>
                          {p.locality && (
                            <p className="text-xs mt-0.5" style={{ color: 'var(--prox-muted)' }}>
                              {p.locality}
                            </p>
                          )}
                          <p className="text-xs mt-2 prox-num">
                            {t('proximate.inbox.progress', {
                              n: floor.endorsements_independent_count,
                              total: floor.endorsements_required,
                            })}
                          </p>
                        </div>
                        <Chevron className="w-4 h-4 flex-shrink-0 mt-1" style={{ color: 'var(--prox-muted)' }} />
                      </div>
                    </div>
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
