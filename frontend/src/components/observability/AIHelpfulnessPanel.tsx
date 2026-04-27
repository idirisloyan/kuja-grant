'use client';

/**
 * AIHelpfulnessPanel — Phase 9.2 UI
 *
 * Drops onto the existing /observability page. Calls the new
 * /api/admin/ai/dashboard endpoint and surfaces the helpfulness data
 * (used / edited / dismissed / no_signal per endpoint) plus per-language
 * call breakdown.
 *
 * The other observability surfaces (latency, success rate, anomalies)
 * remain on the existing page; this panel adds the human-feedback signal
 * and the language mix that the older endpoint didn't capture.
 */

import { useEffect, useState } from 'react';
import { Loader2, ThumbsUp, Pencil, X, Globe2 } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useApiError } from '@/lib/hooks/use-api-error';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface EndpointRow {
  endpoint: string;
  total: number;
  success_rate_pct: number | null;
  avg_ms: number | null;
  p50_ms: number | null;
  p95_ms: number | null;
  tokens_in: number;
  tokens_out: number;
  helpfulness: {
    used: number;
    edited: number;
    dismissed: number;
    no_signal: number;
    helpfulness_pct: number | null;
  };
}

interface ApiResponse {
  success: boolean;
  window_hours: number;
  by_endpoint: EndpointRow[];
  top_users: Array<{ user_id: number; calls: number; tokens: number }>;
  by_language: Array<{ language: string; calls: number }>;
}

interface Props {
  hours?: number;
  className?: string;
}

const HELPFUL_TONE = (pct: number | null) => {
  if (pct === null) return 'text-muted-foreground';
  if (pct >= 70) return 'text-emerald-700';
  if (pct >= 40) return 'text-amber-700';
  return 'text-rose-700';
};

export function AIHelpfulnessPanel({ hours = 24, className = '' }: Props) {
  const { t } = useTranslation();
  const formatError = useApiError();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<ApiResponse>(`/admin/ai/dashboard?hours=${hours}`)
      .then((res) => {
        if (cancelled) return;
        setData(res);
      })
      .catch((e) => {
        if (cancelled) return;
        setErrorMsg(formatError(e).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hours]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className={cn('rounded-xl border border-border bg-card p-5', className)}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('observability.helpfulness.heading')}</h2>
        <span className="text-xs text-muted-foreground">
          {t('observability.helpfulness.window', { h: hours })}
        </span>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('observability.helpfulness.loading')}
        </div>
      )}

      {!loading && errorMsg && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {errorMsg}
        </div>
      )}

      {!loading && data && (
        <>
          {/* Per-language breakdown */}
          {data.by_language.length > 0 && (
            <div className="mb-4">
              <div className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Globe2 className="h-3.5 w-3.5" />
                {t('observability.helpfulness.by_language')}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {data.by_language.map((l) => (
                  <span
                    key={l.language}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-xs"
                  >
                    <span className="font-mono text-[10px] uppercase">{l.language}</span>
                    <span className="kuja-numeric text-muted-foreground">{l.calls.toLocaleString()}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Per-endpoint helpfulness */}
          {data.by_endpoint.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('observability.helpfulness.empty')}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">{t('observability.helpfulness.col.endpoint')}</th>
                    <th className="px-3 py-2 text-right">{t('observability.helpfulness.col.calls')}</th>
                    <th className="px-3 py-2 text-right">{t('observability.helpfulness.col.success')}</th>
                    <th className="px-3 py-2 text-right">{t('observability.helpfulness.col.p95')}</th>
                    <th className="px-3 py-2 text-right">{t('observability.helpfulness.col.helpfulness')}</th>
                    <th className="px-3 py-2 text-right">
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <ThumbsUp className="h-3 w-3" /> {t('observability.helpfulness.col.used')}
                      </span>
                    </th>
                    <th className="px-3 py-2 text-right">
                      <span className="inline-flex items-center gap-1 text-amber-700">
                        <Pencil className="h-3 w-3" /> {t('observability.helpfulness.col.edited')}
                      </span>
                    </th>
                    <th className="px-3 py-2 text-right">
                      <span className="inline-flex items-center gap-1 text-rose-700">
                        <X className="h-3 w-3" /> {t('observability.helpfulness.col.dismissed')}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_endpoint.map((r) => (
                    <tr key={r.endpoint} className="border-t border-border">
                      <td className="px-3 py-2 font-mono text-xs">{r.endpoint}</td>
                      <td className="px-3 py-2 text-right kuja-numeric">{r.total.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right kuja-numeric">
                        {r.success_rate_pct != null ? `${r.success_rate_pct}%` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right kuja-numeric text-muted-foreground">
                        {r.p95_ms != null ? `${r.p95_ms}ms` : '—'}
                      </td>
                      <td className={cn('px-3 py-2 text-right kuja-numeric font-semibold', HELPFUL_TONE(r.helpfulness.helpfulness_pct))}>
                        {r.helpfulness.helpfulness_pct != null
                          ? `${r.helpfulness.helpfulness_pct}%`
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-right kuja-numeric text-emerald-700">{r.helpfulness.used}</td>
                      <td className="px-3 py-2 text-right kuja-numeric text-amber-700">{r.helpfulness.edited}</td>
                      <td className="px-3 py-2 text-right kuja-numeric text-rose-700">{r.helpfulness.dismissed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-3 text-[11px] text-muted-foreground">
            {t('observability.helpfulness.footnote')}
          </p>
        </>
      )}
    </section>
  );
}
