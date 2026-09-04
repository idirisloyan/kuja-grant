'use client';

/**
 * OB messaging console — wave 3c (July 2026).
 *
 * Three views over the same message log:
 *   Inbox     — inbound replies needing triage (the daily work)
 *   Outbound  — what we sent and what became of it (the manual-send worklist)
 *   Delivery  — per-template delivery and response rates (is the copy working)
 *
 * The configuration banner sits above all three and is the reason this page
 * exists in the shape it does: an OB must never be able to mistake "nothing
 * was ever sent" for "nobody replied". Everything that could blur that
 * distinction — an empty list, a 0% rate, a silent failure — is annotated
 * with which of the two it actually is.
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, MessagesSquare, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { splitTestRecords } from '@/lib/test-records';
import { TestDataToggle } from '@/components/proximate/test-data-toggle';
import { useUIStore } from '@/stores/ui-store';
import { useTranslation } from '@/lib/hooks/use-translation';
import { Button } from '@/components/ui/button';
import { PageShell, PageHeader, PageMain } from '@/components/layout/page-shell';
import { MessagingConfigBanner } from '@/components/proximate/messaging-config-banner';
import { MessagingInbox } from '@/components/proximate/messaging-inbox';
import { MessagingOutbound } from '@/components/proximate/messaging-outbound';
import { MessagingStats } from '@/components/proximate/messaging-stats';
import type {
  MessagingConfigState,
  MessagingStatRow,
  ProximateMessageRow,
} from '@/components/proximate/messaging-shared';

const STATS_DAYS = 30;
const PAGE_LIMIT = 100;

type Tab = 'inbox' | 'outbound' | 'delivery';

export function ProximateMessagesClient() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('inbox');

  const [inbound, setInbound] = useState<ProximateMessageRow[]>([]);
  const [outbound, setOutbound] = useState<ProximateMessageRow[]>([]);
  const [stats, setStats] = useState<MessagingStatRow[]>([]);
  // Starts 'unknown' rather than 'configured': until the stats call comes
  // back we have no evidence either way, and the optimistic default is the
  // one that misleads.
  const [configState, setConfigState] = useState<MessagingConfigState>('unknown');
  const [channels, setChannels] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Test/UAT hygiene (PF-MOB-016 / PF-UX): fixtures are hidden by default and
  // revealed only on request. Keyed on the recipient name, the same heuristic
  // and the same persisted flag every other register uses
  // (PFX-SEP02-GLOBAL-004).
  const showTest = useUIStore((s) => s.showTestData);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Settled rather than all() — a failing stats endpoint must not blank
    // the inbox, and a failing inbox must not hide the config banner.
    const [statsRes, inRes, outRes] = await Promise.allSettled([
      // `channels` is ProximateMessaging.status() — a per-transport flag
      // map {whatsapp, sms, any}, not a list of names.
      api.get<{
        configured: boolean;
        stats: MessagingStatRow[];
        channels?: Record<string, boolean>;
      }>(
        `/api/proximate/messaging/stats?days=${STATS_DAYS}`,
      ),
      api.get<{ messages: ProximateMessageRow[] }>(
        `/api/proximate/messages?direction=in&limit=${PAGE_LIMIT}`,
      ),
      api.get<{ messages: ProximateMessageRow[] }>(
        `/api/proximate/messages?direction=out&limit=${PAGE_LIMIT}`,
      ),
    ]);

    if (statsRes.status === 'fulfilled') {
      setStats(statsRes.value.stats || []);
      setConfigState(statsRes.value.configured ? 'configured' : 'not_configured');
      // 'any' is a rollup of the others, not a transport — showing it would
      // read as a third channel.
      setChannels(
        Object.entries(statsRes.value.channels || {})
          .filter(([name, on]) => on && name !== 'any')
          .map(([name]) => name),
      );
    } else {
      // Keep any previously loaded stats visible but stop asserting that
      // delivery works — the banner switches to the 'unknown' warning.
      setConfigState('unknown');
      setError(t('proximate.messaging.stats_failed'));
    }

    if (inRes.status === 'fulfilled') {
      setInbound(inRes.value.messages || []);
    } else {
      setError(t('proximate.messaging.load_failed'));
    }

    if (outRes.status === 'fulfilled') {
      setOutbound(outRes.value.messages || []);
    }

    setLoading(false);
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Sent/unsent totals come from the stats rollup, which covers the whole
  // window; the message lists are capped at PAGE_LIMIT and would undercount.
  // null (not 0) when stats are unavailable, so the inbox empty state says
  // "we don't know" instead of "nothing was sent".
  const sentInWindow =
    configState === 'unknown' ? null : stats.reduce((n, s) => n + s.sent, 0);
  const unsentCount =
    configState === 'unknown' ? 0 : stats.reduce((n, s) => n + s.unsent + s.failed, 0);
  // Newest outbound row that actually went out — the "is anything getting
  // through at all?" fact for the health strip (PFX-SEP02-MSG-002).
  const lastSuccessAt = outbound
    .filter((m) => ['sent', 'delivered', 'read', 'responded'].includes(m.status))
    .reduce<string | null>(
      (mx, m) => (m.created_at && (!mx || m.created_at > mx) ? m.created_at : mx),
      null,
    );

  const reply = async (
    msg: ProximateMessageRow,
    body: string,
  ): Promise<ProximateMessageRow | null> => {
    // Deliberately NO `phone` field, even though the contract allows one.
    // to_dict() masks recipient_phone to '•••1234' and the server's _e164()
    // strips non-digits, so passing the masked value through would yield a
    // perfectly valid-looking '+1234' — and because the server only falls
    // back to message_id when phone is empty, the reply would be addressed
    // to a number that belongs to nobody. Sending message_id alone makes
    // the server resolve the real number from the row it already holds.
    const res = await api.post<{ message?: ProximateMessageRow }>(
      '/api/proximate/messages/reply',
      { body, message_id: msg.id },
    );
    await refresh();
    return res.message || null;
  };

  // PFX-SEP02-MSG-003 — the two operator actions on a stuck outbound row.
  // Both endpoints refuse rows that already went out and write an audit
  // entry; the list refreshes so the chip shows the real new status.
  const retryMessage = async (msg: ProximateMessageRow) => {
    await api.post(`/api/proximate/messages/${msg.id}/retry`);
    await refresh();
  };
  const markSentManually = async (msg: ProximateMessageRow) => {
    await api.post(`/api/proximate/messages/${msg.id}/sent-manually`);
    await refresh();
  };

  const markHandled = async (msg: ProximateMessageRow) => {
    const res = await api.post<{ message?: ProximateMessageRow }>(
      `/api/proximate/messages/${msg.id}/handled`,
    );
    // Patch in place so the row doesn't jump out of view before the OB sees
    // it register; refresh() reconciles with the server right after.
    setInbound((rows) =>
      rows.map((r) =>
        r.id === msg.id
          ? (res.message || { ...r, handled_at: new Date().toISOString() })
          : r,
      ),
    );
  };

  // Hide test/UAT rows by default; keep the count so they can be revealed.
  const inSplit = splitTestRecords(inbound, (m) => m.recipient_name || '');
  const outSplit = splitTestRecords(outbound, (m) => m.recipient_name || '');
  const testCount = inSplit.test.length + outSplit.test.length;
  const inboxRows = showTest ? [...inSplit.real, ...inSplit.test] : inSplit.real;
  const outboundRows = showTest ? [...outSplit.real, ...outSplit.test] : outSplit.real;

  const TABS: { key: Tab; label: string; count?: number }[] = [
    {
      key: 'inbox',
      label: t('proximate.messaging.tab_inbox'),
      count: inboxRows.filter((m) => !m.handled_at).length,
    },
    { key: 'outbound', label: t('proximate.messaging.tab_outbound') },
    { key: 'delivery', label: t('proximate.messaging.tab_delivery') },
  ];

  return (
    <PageShell>
      <PageHeader
        title={t('proximate.messaging.title')}
        subtitle={t('proximate.messaging.subtitle')}
        icon={MessagesSquare}
        breadcrumbs={[{ label: 'Proximate', href: '/proximate/admin' }]}
        primaryAction={
          <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin me-1" />
              : <RefreshCw className="w-4 h-4 me-1" />}
            {t('proximate.messaging.refresh')}
          </Button>
        }
      />
      <PageMain>
        <div className="space-y-5">
          {/* Always first, always visible — never behind the active tab. */}
          <MessagingConfigBanner
            state={configState}
            channels={channels}
            unsentCount={unsentCount}
            lastSuccessAt={lastSuccessAt}
            onShowOutbound={() => setTab('outbound')}
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          {/* PFX-04SEP-MOBILE-008: the tab row stays put under the global
              header (4rem) + the mobile context bar (44px) while the list
              scrolls, so Inbox / Outbound / Delivery are always one tap
              away. Static again from lg up where the sidebar is docked. */}
          <div
            className="flex items-center gap-1 overflow-x-auto sticky top-[calc(4rem+44px)] lg:static z-10 bg-background"
            role="tablist"
            style={{ borderBottom: '1px solid var(--prox-line)' }}
          >
            {TABS.map((x) => {
              const active = tab === x.key;
              return (
                <button
                  key={x.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(x.key)}
                  className="px-4 py-2.5 text-[13.5px] whitespace-nowrap shrink-0 transition-colors"
                  // Active underline drawn as an inset shadow, not a
                  // border-b + negative margin — the old approach was clipped
                  // by overflow-x-auto on phones, so the underline doubled and
                  // the tab row read as "broken" (PF-MOB-011).
                  style={active
                    ? { color: 'var(--prox-ink)', fontWeight: 600, boxShadow: 'inset 0 -2px 0 var(--prox-accent)' }
                    : { color: 'var(--prox-muted)' }}
                >
                  {x.label}
                  {x.count ? (
                    <span className="ms-1.5 text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--prox-accent-tint)', color: 'var(--prox-accent-deep)' }}>
                      {x.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {tab !== 'delivery' && (
            <TestDataToggle count={testCount} className="-mt-1" />
          )}

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {tab === 'inbox' && (
                <MessagingInbox
                  rows={inboxRows}
                  configState={configState}
                  sentInWindow={sentInWindow}
                  days={STATS_DAYS}
                  onReply={reply}
                  onMarkHandled={markHandled}
                />
              )}
              {tab === 'outbound' && (
                <MessagingOutbound
                  rows={outboundRows}
                  configState={configState}
                  onRetry={retryMessage}
                  onSentManually={markSentManually}
                />
              )}
              {tab === 'delivery' && (
                <MessagingStats
                  stats={stats}
                  days={STATS_DAYS}
                  configState={configState}
                />
              )}
            </>
          )}
        </div>
      </PageMain>
    </PageShell>
  );
}
