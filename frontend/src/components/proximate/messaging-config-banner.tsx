'use client';

// ============================================================================
// The honesty banner for the messaging console (wave 3c, July 2026).
//
// This exists because of a specific failure mode: an OB opens the inbox,
// sees nothing, and concludes that partners are ignoring the fund — when in
// fact no provider was ever configured and not one message left the system.
// Silence-because-nobody-answered and silence-because-nothing-was-sent look
// identical in an empty list, and they call for opposite responses.
//
// So the configuration state is stated at the top of the page, unprompted,
// every time. It is not a dismissible toast and it is not tucked into a
// settings screen. Same lesson as EmailService and MessagingService._send_log:
// a system that quietly does nothing must say so where the work happens.
// ============================================================================

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle, SendHorizontal } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import type { MessagingConfigState } from './messaging-shared';

export function MessagingConfigBanner({
  state,
  channels,
  unsentCount = 0,
  lastSuccessAt = null,
  onShowOutbound,
}: {
  state: MessagingConfigState;
  /** Enabled transports, e.g. ['whatsapp']. Only shown when configured. */
  channels?: string[];
  /** Outbound rows in the window that are 'unsent' or 'failed'. */
  unsentCount?: number;
  /** ISO time of the newest outbound row that actually went out. */
  lastSuccessAt?: string | null;
  /** Jumps to the outbound tab — the list of things needing a human. */
  onShowOutbound?: () => void;
}) {
  const { t, formatDate } = useTranslation();
  // PFX-04SEP-MOBILE-008: when nothing is stuck the health block is ONE
  // line; the three-cell breakdown opens on request. The moment delivery
  // has a problem the breakdown is forced open — nobody should have to
  // expand a card to learn that 16 messages never left.
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (state === 'not_configured') {
    return (
      <div
        role="alert"
        className="prox-panel"
        style={{ padding: '16px 18px', borderColor: 'var(--prox-warn)' }}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 shrink-0 mt-0.5" style={{ color: 'var(--prox-warn)' }} />
          <div className="space-y-2 min-w-0">
            <p style={{ color: 'var(--prox-ink)', fontWeight: 700 }}>
              {t('proximate.messaging.not_configured_title')}
            </p>
            <p className="text-sm" style={{ color: 'var(--prox-ink-2)' }}>
              {t('proximate.messaging.not_configured_body')}
            </p>
            <p className="text-xs" style={{ color: 'var(--prox-muted)' }}>
              {t('proximate.messaging.not_configured_hint')}
            </p>
            {unsentCount > 0 && onShowOutbound && (
              <button
                type="button"
                onClick={onShowOutbound}
                className="text-xs font-medium underline hover:no-underline inline-flex items-center gap-1"
                style={{ color: 'var(--prox-warn)' }}
              >
                <SendHorizontal className="w-3 h-3" />
                {t('proximate.messaging.unsent_warning_title', { count: unsentCount })}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (state === 'unknown') {
    // We could not reach the stats endpoint. Deliberately NOT rendered as
    // "all good" — an unverified pipeline is not a working one.
    return (
      <div
        role="alert"
        className="prox-panel"
        style={{ padding: '16px 18px', borderColor: 'var(--prox-warn)' }}
      >
        <div className="flex items-start gap-3">
          <HelpCircle className="w-6 h-6 shrink-0 mt-0.5" style={{ color: 'var(--prox-warn)' }} />
          <div className="space-y-2 min-w-0">
            <p style={{ color: 'var(--prox-ink)', fontWeight: 700 }}>
              {t('proximate.messaging.config_unknown_title')}
            </p>
            <p className="text-sm" style={{ color: 'var(--prox-ink-2)' }}>
              {t('proximate.messaging.config_unknown_body')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Configured. Still worth a line: it is what licenses the OB to read an
  // empty inbox as real silence. Kept quiet unless something is stuck.
  const channelsLabel = (channels || [])
    .map((c) => (c === 'whatsapp' ? 'WhatsApp' : c === 'sms' ? 'SMS' : c.charAt(0).toUpperCase() + c.slice(1)))
    .join(' + ');
  // ONE health component (PFX-SEP02-MSG-002): provider connectivity and
  // delivery are separate facts with separate colours. A green "connected"
  // line beside "16 outbound failed" used to read as "all fine". Green is
  // reserved for the provider; delivery goes red the moment anything is stuck.
  const stuck = unsentCount > 0;
  const showDetail = stuck || detailsOpen;
  const lastLabel = lastSuccessAt
    ? formatDate(lastSuccessAt, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : t('proximate.messaging.health_none_yet');
  return (
    <div
      className="prox-panel"
      style={{ padding: showDetail ? '12px 16px' : '10px 16px' }}
      role={stuck ? 'alert' : undefined}
      data-testid="messaging-health"
      data-state={stuck ? 'attention' : 'healthy'}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2
          className="text-sm min-w-0"
          style={{ fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif', fontWeight: 700 }}
        >
          {showDetail ? t('proximate.messaging.health_title') : (
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--prox-good)' }} aria-hidden="true" />
              <span className="truncate">
                {t('proximate.messaging.health_ok_line', {
                  channels: channelsLabel || t('proximate.messaging.configured_title'),
                  last: lastLabel,
                })}
              </span>
            </span>
          )}
        </h2>
        {stuck && onShowOutbound && (
          <button
            type="button"
            onClick={onShowOutbound}
            className="prox-btn ghost"
            style={{ height: 32, fontSize: 12, padding: '0 11px' }}
          >
            {t('proximate.messaging.review_delivery')}
          </button>
        )}
        {!stuck && (
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            aria-expanded={detailsOpen}
            className="text-xs underline hover:no-underline shrink-0"
            style={{ color: 'var(--prox-muted)', minHeight: 32 }}
          >
            {detailsOpen ? t('common.hide_details') : t('common.details')}
          </button>
        )}
      </div>
      {showDetail && (
      <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        <div className="flex items-center justify-between gap-3 sm:block">
          <dt className="text-xs" style={{ color: 'var(--prox-muted)' }}>
            {t('proximate.messaging.health_provider')}
          </dt>
          <dd className="inline-flex items-center gap-1.5 font-medium" style={{ color: 'var(--prox-good)' }}>
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {channelsLabel
              ? t('proximate.messaging.connected_label', { channels: channelsLabel })
              : t('proximate.messaging.configured_title')}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 sm:block">
          <dt className="text-xs" style={{ color: 'var(--prox-muted)' }}>
            {t('proximate.messaging.health_delivery')}
          </dt>
          <dd
            className="inline-flex items-center gap-1.5 font-medium"
            style={{ color: stuck ? 'var(--prox-danger)' : 'var(--prox-ink)' }}
          >
            {stuck
              ? <AlertTriangle className="w-4 h-4 shrink-0" />
              : <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--prox-good)' }} />}
            {stuck
              ? t('proximate.messaging.health_attention_n', { n: unsentCount })
              : t('proximate.messaging.health_all_delivered')}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 sm:block">
          <dt className="text-xs" style={{ color: 'var(--prox-muted)' }}>
            {t('proximate.messaging.health_last_success')}
          </dt>
          <dd className="font-medium" style={{ color: 'var(--prox-ink)' }}>
            {lastLabel}
          </dd>
        </div>
      </dl>
      )}
    </div>
  );
}
