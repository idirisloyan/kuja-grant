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

import { AlertTriangle, CheckCircle2, HelpCircle, SendHorizontal } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import type { MessagingConfigState } from './messaging-shared';

export function MessagingConfigBanner({
  state,
  channels,
  unsentCount = 0,
  onShowOutbound,
}: {
  state: MessagingConfigState;
  /** Enabled transports, e.g. ['whatsapp']. Only shown when configured. */
  channels?: string[];
  /** Outbound rows in the window that are 'unsent' or 'failed'. */
  unsentCount?: number;
  /** Jumps to the outbound tab — the list of things needing a human. */
  onShowOutbound?: () => void;
}) {
  const { t } = useTranslation();

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
  return (
    <div className="space-y-3">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--prox-good)' }}>
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="font-medium">
            {channelsLabel
              ? t('proximate.messaging.connected_label', { channels: channelsLabel })
              : t('proximate.messaging.configured_title')}
          </span>
        </div>
        <p className="text-xs ps-6" style={{ color: 'var(--prox-muted)' }}>
          {t('proximate.messaging.configured_body')}
        </p>
      </div>

      {unsentCount > 0 && (
        <div
          role="alert"
          className="prox-panel"
          style={{ padding: '14px 16px', borderColor: 'var(--prox-warn)' }}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--prox-warn)' }} />
            <div className="space-y-1 min-w-0">
              <p className="font-medium text-sm" style={{ color: 'var(--prox-ink)' }}>
                {t('proximate.messaging.unsent_warning_title', { count: unsentCount })}
              </p>
              <p className="text-xs" style={{ color: 'var(--prox-ink-2)' }}>
                {t('proximate.messaging.unsent_warning_body')}
              </p>
              {onShowOutbound && (
                <button
                  type="button"
                  onClick={onShowOutbound}
                  className="text-xs font-medium underline hover:no-underline"
                  style={{ color: 'var(--prox-warn)' }}
                >
                  {t('proximate.messaging.review_delivery')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
