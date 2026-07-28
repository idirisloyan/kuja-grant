'use client';

/**
 * Proximate OB attention queue — Phase 717.
 *
 * The single "what needs a human now" feed. Reads
 * /api/proximate/attention-queue and renders a severity-sorted list of
 * every time-sensitive obligation across the fund (expired/open
 * interventions, pending cosigns, overdue reports, verification pending,
 * new grievances, rounds awaiting signature, endorser KYC), each with a
 * one-click deep link. This converts a system that *has* all the state
 * machines into one that *tells the operator what to do next*.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, ArrowRight, CheckCircle2, ChevronRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { Card } from '@/components/ui/card';

export interface AttentionItem {
  kind: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  subtitle?: string;
  /** i18n keys + params (backend Phase, July 2026). English title/subtitle
   *  remain as a fallback when a key is missing or on an older response. */
  title_key?: string;
  subtitle_key?: string;
  params?: Record<string, string | number>;
  href: string;
  entity_kind: string;
  entity_id: number;
  due_at?: string | null;
  hours_until_due?: number | null;
  age_days?: number | null;
}

type TFn = (key: string, params?: Record<string, string | number>) => string;

// Resolve nested enum codes (intervention kind, grievance category) to a
// translated label, degrading to the English title-case of the raw code when
// no translation exists — never a raw i18n key.
function resolveParams(it: AttentionItem, t: TFn): Record<string, string | number> {
  const p: Record<string, string | number> = { ...(it.params || {}) };
  const nested: Array<[string, string]> = [
    ['kind_code', 'kind'],
    ['category_code', 'category'],
  ];
  for (const [codeField, outField] of nested) {
    const code = p[codeField];
    if (code != null && code !== '') {
      const key = `attention.${codeField === 'kind_code' ? 'ikind' : 'gcat'}.${code}`;
      const val = t(key);
      p[outField] = val === key
        ? String(code).charAt(0).toUpperCase() + String(code).slice(1)
        : val;
    }
  }
  return p;
}

interface QueueResp {
  success: boolean;
  items: AttentionItem[];
  total: number;
  counts: Record<string, number>;
}

const SEV_STYLE: Record<string, { dot: string; label: string; text: string }> = {
  critical: { dot: 'bg-red-500', label: 'Critical', text: 'text-red-700 dark:text-red-400' },
  high: { dot: 'bg-amber-500', label: 'High', text: 'text-amber-700 dark:text-amber-400' },
  medium: { dot: 'bg-blue-500', label: 'Medium', text: 'text-blue-700 dark:text-blue-400' },
  low: { dot: 'bg-muted-foreground/50', label: 'Low', text: 'text-muted-foreground' },
};

export function AttentionQueue({ limit }: { limit?: number }) {
  const { t } = useTranslation();
  const [data, setData] = useState<QueueResp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.get<QueueResp>('/api/proximate/attention-queue')
      .then((r) => { if (!cancelled) setData(r); })
      .catch(() => { /* non-fatal — dashboard still renders */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading || !data) return null;

  const items = limit ? data.items.slice(0, limit) : data.items;
  const critical = data.counts?.critical ?? 0;

  return (
    <Card className={`p-4 ${critical > 0 ? 'border-red-400/60' : ''}`}>
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className={`w-4 h-4 ${critical > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
        <p className="text-sm font-semibold">
          {t('proximate.attention.title') || 'Needs your attention'}
        </p>
        {data.total > 0 && (
          <span className="text-xs text-muted-foreground ms-1">
            {data.total} {t('proximate.attention.open_items') || 'open'}
          </span>
        )}
      </div>

      {data.items.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          {t('proximate.attention.all_clear')
            || 'All clear — nothing needs an action right now.'}
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {items.map((it) => {
            const sev = SEV_STYLE[it.severity] || SEV_STYLE.low;
            const rp = resolveParams(it, t);
            const title = it.title_key ? t(it.title_key, rp) : it.title;
            const subtitle = it.subtitle_key ? t(it.subtitle_key, rp) : it.subtitle;
            const sevKey = `attention.severity.${it.severity}`;
            const sevT = t(sevKey);
            const sevLabel = sevT === sevKey ? sev.label : sevT;
            return (
              <li key={`${it.kind}-${it.entity_id}-${it.title}`}>
                <Link
                  href={it.href}
                  className="flex items-start gap-3 py-2.5 group hover:bg-muted/30 -mx-2 px-2 rounded-md transition-colors"
                >
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${sev.dot}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug">{title}</p>
                    {subtitle && (
                      <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
                    )}
                  </div>
                  <span className={`text-[10px] uppercase font-semibold tracking-wide shrink-0 mt-1 ${sev.text}`}>
                    {sevLabel}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-1 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {limit && data.items.length > limit && (
        <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
          + {data.items.length - limit} {t('proximate.attention.more') || 'more'}
          <ArrowRight className="w-3 h-3" />
        </p>
      )}
    </Card>
  );
}
