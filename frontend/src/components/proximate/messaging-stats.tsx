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

import { BarChart3, ChevronRight } from 'lucide-react';
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
    <div className="prox-panel space-y-4" style={{ padding: '14px 16px' }}>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2
          className="text-sm"
          style={{ fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif', fontWeight: 700 }}
        >
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
        <>
        {/* Phone: an overview strip and one expandable row per template —
            not a ten-column table squeezed into 375px (PFX-SEP02-MSG-004).
            The table stays the right form for a desktop ledger. */}
        <div className="md:hidden space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {([
              [t('proximate.messaging.attempted'), totals.total, undefined],
              [t('proximate.messaging.col_sent'), totals.sent, undefined],
              [t('proximate.messaging.col_delivered'), totals.delivered, undefined],
              [t('proximate.messaging.col_responded'), totals.responded, undefined],
              [
                t('proximate.messaging.require_attention'),
                totals.unsent + totals.failed,
                totals.unsent + totals.failed > 0 ? 'var(--prox-danger)' : undefined,
              ],
            ] as [string, number, string | undefined][]).map(([label, n, color]) => (
              <div key={label} className="rounded-md px-3 py-2" style={{ background: 'var(--prox-inset, var(--prox-surface-2))' }}>
                <div className="text-[11px]" style={{ color: 'var(--prox-muted)' }}>{label}</div>
                <div className="prox-num text-lg font-bold" style={{ color: color ?? 'var(--prox-ink)' }}>{n}</div>
              </div>
            ))}
          </div>
          <div>
            <div className="prox-eyebrow mb-1">{t('proximate.messaging.by_template')}</div>
            <div style={{ borderTop: '1px solid var(--prox-line)' }}>
              {stats.map((s) => {
                const attention = s.unsent + s.failed;
                return (
                  <details key={s.template} className="group" style={{ borderBottom: '1px solid var(--prox-line)' }}>
                    <summary className="list-none cursor-pointer flex items-center gap-2 py-2.5" style={{ minHeight: 44 }}>
                      <span className="flex-1 min-w-0 text-sm font-medium line-clamp-2">
                        {templateLabel(s.template, t)}
                      </span>
                      <span className="text-xs tabular-nums shrink-0" style={{ color: 'var(--prox-muted)' }}>
                        {t('proximate.messaging.sent_of', { sent: s.sent, total: s.total })}
                      </span>
                      {attention > 0 && <span className="prox-pill danger shrink-0">{attention}</span>}
                      <ChevronRight
                        className="w-4 h-4 shrink-0 transition-transform group-open:rotate-90"
                        style={{ color: 'var(--prox-muted)' }}
                      />
                    </summary>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 pb-3 text-xs">
                      {([
                        [t('proximate.messaging.col_delivered'), String(s.delivered)],
                        [t('proximate.messaging.col_read'), String(s.read)],
                        [t('proximate.messaging.col_responded'), String(s.responded)],
                        [t('proximate.messaging.col_rate'), pct(s.response_rate)],
                        [t('proximate.messaging.col_unsent'), String(s.unsent)],
                        [t('proximate.messaging.col_failed'), String(s.failed)],
                        [t('proximate.messaging.col_cost'), money(s.cost_usd)],
                      ] as [string, string][]).map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-2">
                          <dt style={{ color: 'var(--prox-muted)' }}>{k}</dt>
                          <dd className="tabular-nums font-medium">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                );
              })}
            </div>
          </div>
        </div>
        {/* Wider screens scroll the table rather than the page. */}
        <div className="overflow-x-auto -mx-4 px-4 hidden md:block">
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
                    className="py-2 px-2 text-end tabular-nums"
                    style={s.unsent > 0 ? { color: 'var(--prox-danger)', fontWeight: 500 } : undefined}
                  >
                    {s.unsent}
                  </td>
                  <td
                    className="py-2 px-2 text-end tabular-nums"
                    style={s.failed > 0 ? { color: 'var(--prox-danger)', fontWeight: 500 } : undefined}
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
                  className="py-2 px-2 text-end tabular-nums"
                  style={totals.unsent > 0 ? { color: 'var(--prox-danger)' } : undefined}
                >
                  {totals.unsent}
                </td>
                <td
                  className="py-2 px-2 text-end tabular-nums"
                  style={totals.failed > 0 ? { color: 'var(--prox-danger)' } : undefined}
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
        </>
      )}
    </div>
  );
}
