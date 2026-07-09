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
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
          <Link href="/proximate/admin/fsps/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium">
            <Plus className="w-4 h-4" /> {t('proximate.fsps.register')}
          </Link>
        </div>

        {loading && <p className="text-sm text-muted-foreground">…</p>}

        {fsps && fsps.length === 0 && (
          <Card className="p-6 text-center">
            <Banknote className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">{t('proximate.fsps.empty')}</p>
            <Link href="/proximate/admin/fsps/new"
              className="inline-flex items-center gap-1.5 mt-3 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium">
              <Plus className="w-4 h-4" /> {t('proximate.fsps.register')}
            </Link>
          </Card>
        )}

        {fsps && fsps.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {fsps.map((f) => (
              <Card key={f.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{f.name}</p>
                    {f.name_ar && <p className="text-sm text-muted-foreground" dir="rtl">{f.name_ar}</p>}
                    <p className="text-xs text-muted-foreground mt-1">
                      {[f.locality, f.country].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {KIND_LABEL[f.kind] || f.kind}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </PageMain>
    </PageShell>
  );
}
