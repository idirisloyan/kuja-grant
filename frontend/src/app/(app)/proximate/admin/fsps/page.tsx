'use client';

/**
 * FSP registry — list + management surface (Phase 717 follow-up).
 *
 * /proximate/admin/fsps previously fell through to the dashboard. It now
 * lists registered providers and links to the register form, so the FSP
 * registry is a real management page rather than a dead route.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Banknote, Plus, ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { PageShell, PageHeader, PageMain } from '@/components/layout/page-shell';

interface Fsp {
  id: number;
  name: string;
  name_ar?: string | null;
  kind: string;
  country?: string | null;
  locality?: string | null;
}

const KIND_LABEL: Record<string, string> = {
  bank: 'Bank', hawala: 'Hawala', mobile_money: 'Mobile money',
};

export default function FspListPage() {
  const { t } = useTranslation();
  const [fsps, setFsps] = useState<Fsp[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.get<{ fsps: Fsp[] }>('/api/proximate/fsps')
      .then((r) => { if (!cancelled) setFsps(r.fsps || []); })
      .catch(() => { if (!cancelled) setFsps([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <PageShell>
      <PageHeader
        title={t('proximate.fsps.title')}
        subtitle={t('proximate.fsps.subtitle')}
      />
      <PageMain>
        <div className="flex items-center justify-between mb-3">
          <Link href="/proximate/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> {t('proximate.disbursements.back_to_list') || 'Back'}
          </Link>
          <Link href="/proximate/admin/fsps/new" className="prox-btn primary" style={{ height: 36 }}>
            <Plus className="w-4 h-4" /> {t('proximate.fsps.register')}
          </Link>
        </div>

        {loading && <p className="text-sm text-muted-foreground">…</p>}

        {fsps && fsps.length === 0 && (
          <div className="prox-panel text-center" style={{ padding: '28px 18px' }}>
            <Banknote className="w-6 h-6 mx-auto mb-2" style={{ color: 'var(--prox-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--prox-muted)' }}>{t('proximate.fsps.empty')}</p>
            <Link href="/proximate/admin/fsps/new" className="prox-btn primary" style={{ height: 36, marginTop: 12 }}>
              <Plus className="w-4 h-4" /> {t('proximate.fsps.register')}
            </Link>
          </div>
        )}

        {fsps && fsps.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {fsps.map((f) => (
              <div key={f.id} className="prox-panel" style={{ padding: '15px 17px' }}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p style={{ fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif', fontSize: 15, fontWeight: 700 }}>{f.name}</p>
                    {f.name_ar && <p className="text-sm" dir="rtl" style={{ color: 'var(--prox-muted)' }}>{f.name_ar}</p>}
                    <p className="text-xs mt-1" style={{ color: 'var(--prox-muted)' }}>
                      {[f.locality, f.country].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  <span className="prox-pill slate shrink-0">
                    {(() => {
                      const k = `proximate.fsp_kind.${f.kind}`;
                      const v = t(k);
                      return v && v !== k ? v : (KIND_LABEL[f.kind] || f.kind);
                    })()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </PageMain>
    </PageShell>
  );
}
