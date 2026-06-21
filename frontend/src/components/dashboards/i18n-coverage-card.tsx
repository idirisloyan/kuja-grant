'use client';

import { useEffect, useState } from 'react';
import { Languages } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  counts: Record<string, number>;
  coverage_pct_vs_en: Record<string, number | null>;
  en_total: number;
}

const LOCALES: Array<{ key: string; label: string }> = [
  { key: 'ar', label: 'Arabic' },
  { key: 'fr', label: 'French' },
  { key: 'es', label: 'Spanish' },
  { key: 'sw', label: 'Swahili' },
  { key: 'so', label: 'Somali' },
];

export function I18nCoverageCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/i18n-coverage').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.en_total === 0) return null;
  const worst = Math.min(...LOCALES.map((l) => data.coverage_pct_vs_en[l.key] ?? 100));
  const low = worst < 95;

  return (
    <Card className={low ? 'border-amber-200' : undefined}>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Languages className={`w-4 h-4 ${low ? 'text-amber-600' : 'text-emerald-700'}`} />
          i18n coverage vs EN
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="text-sm space-y-1">
          {LOCALES.map((l) => {
            const pct = data.coverage_pct_vs_en[l.key];
            if (pct == null) return null;
            const lowLocale = pct < 95;
            return (
              <li key={l.key} className="flex items-baseline justify-between gap-2">
                <span className="text-muted-foreground">{l.label}</span>
                <span className={`tabular-nums ${lowLocale ? 'text-amber-700 font-medium' : ''}`}>
                  {pct}%
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          {data.en_total} keys in the English canonical.
        </p>
      </CardContent>
    </Card>
  );
}
