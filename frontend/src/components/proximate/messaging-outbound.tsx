'use client';

// ============================================================================
// Outbound log (wave 3c, July 2026).
//
// Exists so "we never actually sent anything" is a place you can go and
// look at, not an inference from an empty inbox. When no provider is
// configured every row here reads 'unsent' with the reason attached, which
// makes this list double as the OB's manual-send worklist.
// ============================================================================

import Link from 'next/link';
import { ExternalLink, SendHorizontal } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useTranslation } from '@/lib/hooks/use-translation';
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

export function MessagingOutbound({
  rows,
  configState,
}: {
  rows: ProximateMessageRow[];
  configState: MessagingConfigState;
}) {
  const { t, formatDate } = useTranslation();

  if (rows.length === 0) {
    return (
      <Card className="p-2">
        <EmptyState
          icon={SendHorizontal}
          title={t('proximate.messaging.outbound_empty')}
          hint={
            configState === 'not_configured'
              ? t('proximate.messaging.not_configured_body')
              : t('proximate.messaging.outbound_empty_hint')
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((m) => {
        const href = subjectHref(m.subject_kind, m.subject_id);
        const subject = subjectLabel(m.subject_kind, t);
        // Anything not delivered is the OB's problem, so give those rows a
        // visible edge instead of leaving them to blend into the list.
        const stuck = m.status === 'unsent' || m.status === 'failed';

        return (
          <Card
            key={m.id}
            className={`p-4 space-y-2 ${
              stuck ? 'border-red-300 dark:border-red-800' : ''
            }`}
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span className="text-sm font-medium">
                  {templateLabel(m.template_key, t)}
                </span>
                {m.template_variant && (
                  <span className="text-xs px-1.5 py-0.5 rounded border bg-muted text-muted-foreground border-border">
                    {m.template_variant}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {m.recipient_name || m.recipient_phone || '—'}
                </span>
                {m.locale && (
                  <span className="text-xs text-muted-foreground">
                    {m.locale.toUpperCase()}
                  </span>
                )}
              </div>
              <MessageStatusChip status={m.status} label={statusLabel(m.status, t)} />
            </div>

            {m.body && (
              <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap" dir="auto">
                {m.body}
              </p>
            )}

            {m.error && (
              <p className="text-xs text-red-700 dark:text-red-400">
                {m.error}
                {m.attempts > 0 && ` · ${m.attempts} ${t('proximate.messaging.attempts')}`}
              </p>
            )}

            <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
              <span>{formatDate(m.created_at, {
                month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}</span>
              <span>{m.channel}</span>
              {/* Operator replies are stored as subject_kind='reply' with no
                  subject_id, so the "#id" suffix is conditional — otherwise
                  every reply in this log reads "reply #null". */}
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
                <span className="text-emerald-700 dark:text-emerald-400">
                  {t('proximate.messaging.col_responded')}
                </span>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
