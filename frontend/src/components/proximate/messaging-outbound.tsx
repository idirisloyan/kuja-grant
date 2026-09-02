'use client';

// ============================================================================
// Outbound log (wave 3c, July 2026; regrouped Sep 2026 for mobile QA).
//
// Exists so "we never actually sent anything" is a place you can go and
// look at, not an inference from an empty inbox. When no provider is
// configured every row here reads 'unsent' with the reason attached, which
// makes this list double as the OB's manual-send worklist.
//
// The QA handoff (PF-UX-083 / PF-MOB-011) found the old flat list a
// "database wall of repeated cards". It is now grouped by recipient into
// conversation panels, delivery failures float to the top, and each message
// is a compact row (preview + muted meta) rather than a full-height card.
// ============================================================================

import { useState } from 'react';
import Link from 'next/link';
import { CheckCheck, ExternalLink, Loader2, RotateCcw, SendHorizontal } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { isTestRecord } from '@/lib/test-records';
import { EmptyState } from './empty-state';
import {
  MessageStatusChip,
  statusLabel,
  subjectHref,
  subjectLabel,
  templateLabel,
  type MessagingConfigState,
  type ProximateMessageRow,
} from './messaging-shared';

// Map a provider error string to an operator-readable reason key. The raw
// string stays available under "Technical details" (PFX-SEP02-MSG-003).
function deliveryReasonKey(error: string): string {
  const e = error.toLowerCase();
  if (/not configured|no provider|no channel/.test(e)) return 'proximate.messaging.reason_not_configured';
  if (/opt.?out|unsubscrib|blocked|blacklist/.test(e)) return 'proximate.messaging.reason_opted_out';
  if (/\b(401|403)\b|auth|credential|unauthori[sz]ed|forbidden/.test(e)) return 'proximate.messaging.reason_auth';
  if (/\b429\b|rate.?limit|too many/.test(e)) return 'proximate.messaging.reason_rate_limited';
  if (/\b5\d\d\b|timeout|timed out|unavailable|unreachable|connection/.test(e)) return 'proximate.messaging.reason_unavailable';
  if (/\b4\d\d\b|invalid|malformed|rejected|bad request|template/.test(e)) return 'proximate.messaging.reason_rejected';
  return 'proximate.messaging.reason_failed';
}

const STUCK = new Set(['unsent', 'failed', 'queued']);

export function MessagingOutbound({
  rows,
  configState,
  onRetry,
  onSentManually,
}: {
  rows: ProximateMessageRow[];
  configState: MessagingConfigState;
  /** Re-run the transport ladder for one stuck row (MSG-003 [Retry]). */
  onRetry?: (m: ProximateMessageRow) => Promise<void>;
  /** The OB delivered it by hand — record that (MSG-003 [Send manually]). */
  onSentManually?: (m: ProximateMessageRow) => Promise<void>;
}) {
  const { t, formatDate } = useTranslation();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<Record<number, string>>({});
  const runRowAction = async (m: ProximateMessageRow, fn: (m: ProximateMessageRow) => Promise<void>) => {
    setBusyId(m.id);
    setRowError((e) => ({ ...e, [m.id]: '' }));
    try {
      await fn(m);
    } catch (err) {
      setRowError((e) => ({ ...e, [m.id]: err instanceof Error ? err.message : t('proximate.messaging.load_failed') }));
    } finally {
      setBusyId(null);
    }
  };

  if (rows.length === 0) {
    return (
      <div className="prox-panel" style={{ padding: 8 }}>
        <EmptyState
          icon={SendHorizontal}
          title={t('proximate.messaging.outbound_empty')}
          hint={
            configState === 'not_configured'
              ? t('proximate.messaging.not_configured_body')
              : t('proximate.messaging.outbound_empty_hint')
          }
        />
      </div>
    );
  }

  // Group by recipient so an OB reads one conversation at a time instead of a
  // flat wall of near-identical event cards.
  const byRecipient = new Map<string, ProximateMessageRow[]>();
  for (const m of rows) {
    const key = m.recipient_name || m.recipient_phone || '—';
    const arr = byRecipient.get(key);
    if (arr) arr.push(m);
    else byRecipient.set(key, [m]);
  }
  const groups = Array.from(byRecipient.entries()).map(([name, gr]) => ({
    name,
    rows: gr,
    // Anything not delivered is the OB's problem — surface those groups first.
    stuck: gr.some((m) => m.status === 'unsent' || m.status === 'failed'),
    stuckCount: gr.filter((m) => m.status === 'unsent' || m.status === 'failed').length,
    latest: gr.reduce(
      (mx, m) => Math.max(mx, m.created_at ? Date.parse(m.created_at) : 0),
      0,
    ),
  }));
  groups.sort(
    (a, b) => Number(b.stuck) - Number(a.stuck) || b.latest - a.latest,
  );

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        // Neutral panel even when delivery is stuck: red belongs on the failed
        // badge, the reason and the count — not around a whole recipient
        // (PFX-SEP02-MSG-004).
        <div key={g.name} className="prox-panel" style={{ padding: 0 }}>
          <div
            className="flex items-center justify-between gap-3 px-4 py-2.5"
            style={{ borderBottom: '1px solid var(--prox-line)' }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="text-sm truncate"
                style={{ fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif', fontWeight: 700 }}
              >
                {g.name}
              </span>
              {isTestRecord(g.name) && (
                <span className="prox-pill slate">{t('common.test_record')}</span>
              )}
              <span className="text-xs text-muted-foreground shrink-0">
                {g.rows.length}
              </span>
            </div>
            {g.stuck && (
              <span className="prox-pill danger shrink-0">
                {g.stuckCount} · {t('proximate.messaging.review_delivery')}
              </span>
            )}
          </div>

          <div>
            {g.rows.map((m, i) => {
              const href = subjectHref(m.subject_kind, m.subject_id);
              const subject = subjectLabel(m.subject_kind, t);
              return (
                <div
                  key={m.id}
                  className="px-4 py-2.5"
                  style={i > 0 ? { borderTop: '1px solid var(--prox-line-2, var(--prox-line))' } : undefined}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">
                          {templateLabel(m.template_key, t)}
                        </span>
                        {m.template_variant && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded border bg-muted text-muted-foreground border-border">
                            {m.template_variant}
                          </span>
                        )}
                        {m.locale && (
                          <span className="text-[11px] text-muted-foreground">
                            {m.locale.toUpperCase()}
                          </span>
                        )}
                      </div>
                      {/* Operator view: a plain-language reason. The provider's
                          HTTP status, attempt count, tokenised links and the
                          raw payload are engineering detail and live behind
                          "Technical details" below (PFX-SEP02-MSG-003). */}
                      {m.error && (
                        <p className="text-[12px] font-medium" style={{ color: 'var(--prox-danger)' }}>
                          {t(deliveryReasonKey(m.error))}
                        </p>
                      )}
                      <div className="flex items-center gap-2.5 flex-wrap text-[11px] text-muted-foreground">
                        <span>{formatDate(m.created_at, {
                          month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}</span>
                        <span>{m.channel}</span>
                        {subject && (
                          href ? (
                            <Link href={href} className="underline hover:text-foreground inline-flex items-center gap-1">
                              {subject} #{m.subject_id}
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          ) : (
                            <span>{subject}{m.subject_id ? ` #${m.subject_id}` : ''}</span>
                          )
                        )}
                        {m.responded_at && (
                          <span style={{ color: 'var(--prox-good)' }}>
                            {t('proximate.messaging.col_responded')}
                          </span>
                        )}
                      </div>
                    </div>
                    <MessageStatusChip status={m.status} label={statusLabel(m.status, t)} />
                  </div>
                  {(m.error || m.body) && (
                    <details className="mt-1.5 text-[11px]">
                      <summary className="cursor-pointer select-none" style={{ color: 'var(--prox-muted)' }}>
                        {t('proximate.messaging.technical_details')}
                      </summary>
                      <div
                        className="mt-1.5 space-y-1 rounded-md px-2.5 py-2"
                        style={{ background: 'var(--prox-inset, var(--prox-surface-2))' }}
                      >
                        {m.error && (
                          <p className="prox-mono break-all" dir="ltr">{m.error}</p>
                        )}
                        <p style={{ color: 'var(--prox-muted)' }}>
                          {m.attempts > 0 && `${m.attempts} ${t('proximate.messaging.attempts')} · `}
                          {m.channel} · #{m.id}
                        </p>
                        {m.body && (
                          <p className="whitespace-pre-wrap break-words" dir="auto" style={{ color: 'var(--prox-muted)' }}>
                            {m.body}
                          </p>
                        )}
                      </div>
                    </details>
                  )}
                  {/* Operator actions for a row that did not go out
                      (PFX-SEP02-MSG-003): Retry re-runs the same transport
                      ladder; Mark as sent manually records a by-hand
                      delivery. Both write an audit entry server-side. */}
                  {STUCK.has(m.status) && (onRetry || onSentManually) && (
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      {onRetry && (
                        <button
                          type="button"
                          className="prox-btn ghost"
                          style={{ height: 30, fontSize: 12, padding: '0 10px' }}
                          disabled={busyId === m.id}
                          onClick={() => runRowAction(m, onRetry)}
                        >
                          {busyId === m.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <RotateCcw className="w-3.5 h-3.5" />}
                          {t('proximate.messaging.retry')}
                        </button>
                      )}
                      {onSentManually && (
                        <button
                          type="button"
                          className="prox-btn ghost"
                          style={{ height: 30, fontSize: 12, padding: '0 10px' }}
                          disabled={busyId === m.id}
                          onClick={() => runRowAction(m, onSentManually)}
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                          {t('proximate.messaging.mark_sent_manually')}
                        </button>
                      )}
                      {rowError[m.id] && (
                        <span className="text-[11px]" style={{ color: 'var(--prox-danger)' }}>{rowError[m.id]}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
