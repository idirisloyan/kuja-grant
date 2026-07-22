'use client';

// ============================================================================
// Per-template delivery and response panel (wave 3c, July 2026).
//
// Answers "which of our messages actually work". Response rate is the
// number that decides whether a template gets rewritten, so it is computed
// server-side over SENT (not total) and is null when nothing was sent —
// a rate over zero sends would read as 0% and look like a content problem
// when it is really a delivery problem.
//
// Unsent/failed columns are rendered in red rather than being hidden, so a
// broken pipeline shows up in the same table that measures copy quality.
// ============================================================================

import { BarChart3 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useTranslation } from '@/lib/hooks/use-translation';
import { EmptyState } from './empty-state';
import {
  templateLabel,
  type MessagingConfigState,
  type MessagingStatRow,
} from './messaging-shared';

function pct(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

function money(usd: number): string {
  return usd > 0 ? `$${usd.toFixed(2)}` : '—';
}

export function MessagingStats({
  stats,
  days,
  configState,
}: {
  stats: MessagingStatRow[];
  days: number;
  configState: MessagingConfigState;
}) {
  const { t } = useTranslation();

  const totals = stats.reduce(
    (a, s) => ({
      total: a.total + s.total,
      sent: a.sent + s.sent,
      delivered: a.delivered + s.delivered,
      read: a.read + s.read,
      responded: a.responded + s.responded,
      unsent: a.unsent + s.unsent,
      failed: a.failed + s.failed,
      cost_usd: a.cost_usd + s.cost_usd,
    }),
    { total: 0, sent: 0, delivered: 0, read: 0, responded: 0, unsent: 0, failed: 0, cost_usd: 0 },
  );

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold">
          {t('proximate.messaging.stats_title')}
        </h2>
        <span className="text-xs text-muted-foreground">
          {t('proximate.messaging.stats_period', { days })}
        </span>
      </div>

      {stats.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          compact
          title={t('proximate.messaging.stats_empty')}
          hint={
            configState === 'not_configured'
              ? t('proximate.messaging.not_configured_body')
              : t('proximate.messaging.stats_empty_hint', { days })
          }
        />
      ) : (
        // Narrow screens scroll the table rather than the page — the
        // console is used on phones in the field.
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border">
                <th className="text-start font-medium py-2 pe-3">
                  {t('proximate.messaging.col_template')}
                </th>
                <th className="text-end font-medium py-2 px-2">
                  {t('proximate.messaging.col_total')}
                </th>
                <th className="text-end font-medium py-2 px-2">
                  {t('proximate.messaging.col_sent')}
                </th>
                <th className="text-end font-medium py-2 px-2">
                  {t('proximate.messaging.col_delivered')}
                </th>
                <th className="text-end font-medium py-2 px-2">
                  {t('proximate.messaging.col_read')}
                </th>
                <th className="text-end font-medium py-2 px-2">
                  {t('proximate.messaging.col_responded')}
                </th>
                <th className="text-end font-medium py-2 px-2">
                  {t('proximate.messaging.col_rate')}
                </th>
                <th className="text-end font-medium py-2 px-2">
                  {t('proximate.messaging.col_unsent')}
                </th>
                <th className="text-end font-medium py-2 px-2">
                  {t('proximate.messaging.col_failed')}
                </th>
                <th className="text-end font-medium py-2 ps-2">
                  {t('proximate.messaging.col_cost')}
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.template} className="border-b border-border/60">
                  <td className="py-2 pe-3 font-medium">
                    {templateLabel(s.template, t)}
                  </td>
                  <td className="py-2 px-2 text-end tabular-nums">{s.total}</td>
                  <td className="py-2 px-2 text-end tabular-nums">{s.sent}</td>
                  <td className="py-2 px-2 text-end tabular-nums">{s.delivered}</td>
                  <td className="py-2 px-2 text-end tabular-nums">{s.read}</td>
                  <td className="py-2 px-2 text-end tabular-nums">{s.responded}</td>
                  <td className="py-2 px-2 text-end tabular-nums font-medium">
                    {pct(s.response_rate)}
                  </td>
                  <td
                    className={`py-2 px-2 text-end tabular-nums ${
                      s.unsent > 0 ? 'text-red-600 dark:text-red-400 font-medium' : ''
                    }`}
                  >
                    {s.unsent}
                  </td>
                  <td
                    className={`py-2 px-2 text-end tabular-nums ${
                      s.failed > 0 ? 'text-red-600 dark:text-red-400 font-medium' : ''
                    }`}
                  >
                    {s.failed}
                  </td>
                  <td className="py-2 ps-2 text-end tabular-nums text-muted-foreground">
                    {money(s.cost_usd)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="text-xs font-medium">
                <td className="py-2 pe-3">{t('proximate.messaging.col_total')}</td>
                <td className="py-2 px-2 text-end tabular-nums">{totals.total}</td>
                <td className="py-2 px-2 text-end tabular-nums">{totals.sent}</td>
                <td className="py-2 px-2 text-end tabular-nums">{totals.delivered}</td>
                <td className="py-2 px-2 text-end tabular-nums">{totals.read}</td>
                <td className="py-2 px-2 text-end tabular-nums">{totals.responded}</td>
                <td className="py-2 px-2 text-end tabular-nums">
                  {/* Recomputed from the aggregate rather than averaging the
                      per-template rates, which would weight a 2-message
                      template the same as a 200-message one. */}
                  {pct(totals.sent ? totals.responded / totals.sent : null)}
                </td>
                <td
                  className={`py-2 px-2 text-end tabular-nums ${
                    totals.unsent > 0 ? 'text-red-600 dark:text-red-400' : ''
                  }`}
                >
                  {totals.unsent}
                </td>
                <td
                  className={`py-2 px-2 text-end tabular-nums ${
                    totals.failed > 0 ? 'text-red-600 dark:text-red-400' : ''
                  }`}
                >
                  {totals.failed}
                </td>
                <td className="py-2 ps-2 text-end tabular-nums text-muted-foreground">
                  {money(totals.cost_usd)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}
