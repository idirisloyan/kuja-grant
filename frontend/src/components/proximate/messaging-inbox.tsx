'use client';

// ============================================================================
// Inbound reply queue (wave 3c, July 2026).
//
// One card per inbound message: who it came from, what they said, the
// language the server detected, the record it relates to, and the two
// actions an OB needs — reply, and mark handled so the queue drains.
//
// The empty state is load-bearing and changes with the delivery
// configuration; see emptyCopy() below.
// ============================================================================

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, MessageSquare, Reply, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/hooks/use-translation';
import { EmptyState } from './empty-state';
import {
  MessageStatusChip,
  statusLabel,
  subjectHref,
  subjectLabel,
  type MessagingConfigState,
  type ProximateMessageRow,
} from './messaging-shared';

export function MessagingInbox({
  rows,
  configState,
  sentInWindow,
  days,
  onReply,
  onMarkHandled,
}: {
  rows: ProximateMessageRow[];
  configState: MessagingConfigState;
  /** Messages actually sent in the window; null when stats were unavailable. */
  sentInWindow: number | null;
  days: number;
  /** Resolves to the persisted row so we can report what really happened. */
  onReply: (msg: ProximateMessageRow, body: string) => Promise<ProximateMessageRow | null>;
  onMarkHandled: (msg: ProximateMessageRow) => Promise<void>;
}) {
  const { t, formatDate } = useTranslation();
  const [showHandled, setShowHandled] = useState(false);
  const [replyingId, setReplyingId] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  // Per-row outcome notice. Keyed by id so replying twice doesn't leave a
  // stale "sent" under the wrong message.
  const [outcome, setOutcome] = useState<{ id: number; text: string; ok: boolean } | null>(null);

  const unhandled = rows.filter((r) => !r.handled_at);
  const visible = showHandled ? rows : unhandled;

  const send = async (msg: ProximateMessageRow) => {
    if (!draft.trim()) {
      setRowError(t('proximate.messaging.reply_empty'));
      return;
    }
    setBusyId(msg.id);
    setRowError(null);
    try {
      const saved = await onReply(msg, draft.trim());
      // Belt and braces. The server answers 409/502 when a reply is
      // recorded but not delivered, which throws below — but a 2xx only
      // ever means the row was PERSISTED. ProximateMessaging deliberately
      // stores status='unsent' when no provider is configured, so treating
      // a 2xx as proof of delivery would recreate the exact bug this
      // console exists to expose. Trust the row's own status.
      const undelivered =
        !saved || saved.status === 'unsent' || saved.status === 'failed';
      setOutcome({
        id: msg.id,
        ok: !undelivered,
        text: undelivered
          ? t('proximate.messaging.reply_recorded_undelivered')
          : t('proximate.messaging.reply_sent'),
      });
      setReplyingId(null);
      setDraft('');
    } catch (e) {
      // The failure reasons here are specific and actionable — "outside the
      // 24-hour session window", "no messaging provider configured" — so
      // show the server's own wording against the message it concerns
      // rather than a generic banner at the top of the list.
      setOutcome({
        id: msg.id,
        ok: false,
        text: e instanceof Error && e.message
          ? e.message
          : t('proximate.messaging.reply_recorded_undelivered'),
      });
      // Composer stays open with the text intact — the operator may want to
      // copy it out and send it by hand, which is the whole fallback plan.
    } finally {
      setBusyId(null);
    }
  };

  const markHandled = async (msg: ProximateMessageRow) => {
    setBusyId(msg.id);
    setRowError(null);
    try {
      await onMarkHandled(msg);
    } catch (e) {
      setRowError(
        e instanceof Error ? e.message : t('proximate.messaging.action_failed'),
      );
    } finally {
      setBusyId(null);
    }
  };

  /**
   * The whole point of this screen. An empty inbox has four different
   * meanings and only one of them is "partners are not replying":
   *
   *   not configured  → nothing was ever deliverable; silence proves nothing
   *   nothing sent    → configured, but we asked no one anything
   *   sent, no answer → the only reading that is actually about partners
   *   unknown         → we could not check; don't let them conclude anything
   */
  const emptyCopy = (): { title: string; hint: string } => {
    if (configState === 'not_configured') {
      return {
        title: t('proximate.messaging.inbox_empty_not_configured'),
        hint: t('proximate.messaging.inbox_empty_not_configured_hint'),
      };
    }
    if (configState === 'unknown' || sentInWindow === null) {
      return {
        title: t('proximate.messaging.inbox_empty_unknown'),
        hint: t('proximate.messaging.inbox_empty_unknown_hint'),
      };
    }
    if (sentInWindow === 0) {
      return {
        title: t('proximate.messaging.inbox_empty_nothing_sent'),
        hint: t('proximate.messaging.inbox_empty_nothing_sent_hint', { days }),
      };
    }
    return {
      title: t('proximate.messaging.inbox_empty_sent'),
      hint: t('proximate.messaging.inbox_empty_sent_hint', { sent: sentInWindow, days }),
    };
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-sm text-muted-foreground">
          {unhandled.length} {t('proximate.messaging.awaiting_triage')}
        </span>
        {rows.length > unhandled.length && (
          <button
            type="button"
            onClick={() => setShowHandled((v) => !v)}
            className="text-xs underline text-muted-foreground hover:text-foreground"
          >
            {showHandled
              ? t('proximate.messaging.hide_handled')
              : t('proximate.messaging.show_handled')}
          </button>
        )}
      </div>

      {rowError && <p className="text-sm text-red-600">{rowError}</p>}

      {visible.length === 0 ? (
        <Card className="p-2">
          <EmptyState icon={MessageSquare} {...emptyCopy()} />
        </Card>
      ) : (
        visible.map((m) => {
          const href = subjectHref(m.subject_kind, m.subject_id);
          const subject = subjectLabel(m.subject_kind, t);
          const note = outcome && outcome.id === m.id ? outcome : null;

          return (
            <Card key={m.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="text-sm font-medium">
                    {m.recipient_name || m.recipient_phone || '—'}
                  </span>
                  {m.recipient_name && m.recipient_phone && (
                    <span className="text-xs text-muted-foreground">
                      {m.recipient_phone}
                    </span>
                  )}
                  {m.locale && (
                    <span
                      className="text-xs px-2 py-0.5 rounded border bg-muted text-muted-foreground border-border"
                      title={t('proximate.messaging.language')}
                    >
                      {m.locale.toUpperCase()}
                    </span>
                  )}
                  {m.handled_at && (
                    <span className="text-xs px-2 py-0.5 rounded border bg-muted text-muted-foreground border-border inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      {t('proximate.messaging.handled_badge')}
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDate(m.created_at, {
                    month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              </div>

              {/* dir="auto" so an Arabic reply renders RTL inside an
                  otherwise LTR console, and vice versa. */}
              <p className="text-sm whitespace-pre-wrap" dir="auto">
                {m.body || '—'}
              </p>

              {subject && (
                <p className="text-xs text-muted-foreground">
                  {t('proximate.messaging.about')}:{' '}
                  {href ? (
                    <Link href={href} className="underline hover:text-foreground inline-flex items-center gap-1">
                      {subject} #{m.subject_id}
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  ) : (
                    // #id only when there is one — see the note in
                    // messaging-outbound.tsx.
                    <span>{subject}{m.subject_id ? ` #${m.subject_id}` : ''}</span>
                  )}
                </p>
              )}

              {note && (
                <p
                  className={`text-xs rounded border px-2 py-1.5 ${
                    note.ok
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                      : 'bg-red-50 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800'
                  }`}
                >
                  {note.text}
                </p>
              )}

              <div className="flex gap-2 flex-wrap items-center border-t pt-3">
                {replyingId === m.id ? (
                  <div className="flex-1 min-w-full space-y-2">
                    {configState !== 'configured' && (
                      <p className="text-xs text-amber-800 dark:text-amber-300">
                        {t('proximate.messaging.reply_undeliverable_warning')}
                      </p>
                    )}
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={3}
                      dir="auto"
                      className="w-full border rounded p-2 text-sm bg-background"
                      placeholder={t('proximate.messaging.reply_placeholder')}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" disabled={busyId === m.id} onClick={() => send(m)}>
                        {busyId === m.id
                          ? <Loader2 className="w-4 h-4 animate-spin me-1" />
                          : <Reply className="w-4 h-4 me-1" />}
                        {t('proximate.messaging.reply_send')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setReplyingId(null); setDraft(''); setRowError(null); }}
                      >
                        {t('proximate.messaging.cancel')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setReplyingId(m.id);
                      setDraft('');
                      setRowError(null);
                      setOutcome(null);
                    }}
                  >
                    <Reply className="w-4 h-4 me-1" />
                    {t('proximate.messaging.reply')}
                  </Button>
                )}

                {!m.handled_at && replyingId !== m.id && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === m.id}
                    onClick={() => markHandled(m)}
                  >
                    {busyId === m.id
                      ? <Loader2 className="w-4 h-4 animate-spin me-1" />
                      : <CheckCircle2 className="w-4 h-4 me-1" />}
                    {t('proximate.messaging.mark_handled')}
                  </Button>
                )}

                <span className="ms-auto">
                  <MessageStatusChip status={m.status} label={statusLabel(m.status, t)} />
                </span>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
