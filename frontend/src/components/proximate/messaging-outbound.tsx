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

import Link from 'next/link';
import { ExternalLink, SendHorizontal } from 'lucide-react';
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
        <div
          key={g.name}
          className="prox-panel"
          style={{ padding: 0, ...(g.stuck ? { borderColor: 'var(--prox-danger)' } : {}) }}
        >
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
                {t('proximate.messaging.review_delivery')}
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
                      {m.body && (
                        <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap" dir="auto">
                          {m.body}
                        </p>
                      )}
                      {m.error && (
                        <p className="text-[11px]" style={{ color: 'var(--prox-danger)' }}>
                          {m.error}
                          {m.attempts > 0 && ` · ${m.attempts} ${t('proximate.messaging.attempts')}`}
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
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
