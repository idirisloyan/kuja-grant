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
import { Card } from '@/components/ui/card';
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
      <Card
        role="alert"
        className="p-5 border-2 border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
          <div className="space-y-2 min-w-0">
            <p className="font-semibold text-red-900 dark:text-red-200">
              {t('proximate.messaging.not_configured_title')}
            </p>
            <p className="text-sm text-red-900/90 dark:text-red-200/90">
              {t('proximate.messaging.not_configured_body')}
            </p>
            <p className="text-xs text-red-800/80 dark:text-red-300/80">
              {t('proximate.messaging.not_configured_hint')}
            </p>
            {unsentCount > 0 && onShowOutbound && (
              <button
                type="button"
                onClick={onShowOutbound}
                className="text-xs font-medium underline text-red-900 dark:text-red-200 hover:no-underline inline-flex items-center gap-1"
              >
                <SendHorizontal className="w-3 h-3" />
                {t('proximate.messaging.unsent_warning_title', { count: unsentCount })}
              </button>
            )}
          </div>
        </div>
      </Card>
    );
  }

  if (state === 'unknown') {
    // We could not reach the stats endpoint. Deliberately NOT rendered as
    // "all good" — an unverified pipeline is not a working one.
    return (
      <Card
        role="alert"
        className="p-5 border-2 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800"
      >
        <div className="flex items-start gap-3">
          <HelpCircle className="w-6 h-6 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="space-y-2 min-w-0">
            <p className="font-semibold text-amber-900 dark:text-amber-200">
              {t('proximate.messaging.config_unknown_title')}
            </p>
            <p className="text-sm text-amber-900/90 dark:text-amber-200/90">
              {t('proximate.messaging.config_unknown_body')}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  // Configured. Still worth a line: it is what licenses the OB to read an
  // empty inbox as real silence. Kept quiet unless something is stuck.
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-emerald-800 dark:text-emerald-300">
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        <span className="font-medium">{t('proximate.messaging.configured_title')}</span>
        {channels && channels.length > 0 && (
          <span className="text-xs text-muted-foreground">
            ({channels.join(', ')})
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          — {t('proximate.messaging.configured_body')}
        </span>
      </div>

      {unsentCount > 0 && (
        <Card
          role="alert"
          className="p-4 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="space-y-1 min-w-0">
              <p className="font-medium text-sm text-amber-900 dark:text-amber-200">
                {t('proximate.messaging.unsent_warning_title', { count: unsentCount })}
              </p>
              <p className="text-xs text-amber-900/90 dark:text-amber-200/90">
                {t('proximate.messaging.unsent_warning_body')}
              </p>
              {onShowOutbound && (
                <button
                  type="button"
                  onClick={onShowOutbound}
                  className="text-xs font-medium underline text-amber-900 dark:text-amber-200 hover:no-underline"
                >
                  {t('proximate.messaging.tab_outbound')}
                </button>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
