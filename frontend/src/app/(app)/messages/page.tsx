'use client';

/**
 * /messages — Phase 43A (May 2026).
 *
 * In-app messaging for the closed-network model.
 *
 * NGO viewer: inbox of messages whose scope resolves to their org.
 * Admin viewer: full sent log + compose form to send a new message
 *               (scopes: network / country / org / declaration).
 *
 * Email transport is on the backlog — this is the durable interim
 * channel and lives inside the same audit chain as declarations and
 * grants.
 */

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useNetworkStore } from '@/stores/network-store';
import {
  MessageSquare, Send, Loader2, Eye, EyeOff, Globe, MapPin,
  Building2, Siren, ChevronRight,
} from 'lucide-react';
import { PageShell, PageHeader, PageMain } from '@/components/layout/page-shell';

const fetcher = <T,>(url: string): Promise<T> => api.get<T>(url);

interface Message {
  id: number;
  sender_name: string | null;
  sender_email: string | null;
  scope: 'network' | 'country' | 'org' | 'declaration';
  scope_value: string | null;
  subject: string;
  body_md: string;
  related_kind: string | null;
  related_id: number | null;
  sent_at: string | null;
  audit_chain_id: number | null;
  is_read: boolean | null;
}

interface Resp {
  success: boolean;
  messages: Message[];
  unread: number;
}

export default function MessagesPage() {
  const viewer = useAuthStore((s) => s.user);
  const network = useNetworkStore((s) => s.network);
  const tenantName = network?.name || 'the network';
  const isAdmin = viewer?.role === 'admin';
  const { data, mutate } = useSWR<Resp>('/messages/', fetcher);

  const messages = data?.messages ?? [];
  const unread = data?.unread ?? 0;

  return (
    <div className="max-w-4xl mx-auto">
      <PageShell>
        <PageHeader
          title="Messages"
          icon={MessageSquare}
          subtitle={isAdmin
            ? `Send and review communications with ${tenantName} members. Audit-anchored.`
            : `Communications from ${tenantName} secretariat.${unread > 0 ? ` ${unread} unread.` : ''}`}
        />
        {isAdmin && <ComposeForm onSent={mutate} />}
        <PageMain>

          <div className="space-y-2">
            {messages.length === 0 ? (
              <div className="border border-border rounded-lg bg-card p-10 text-center text-sm text-muted-foreground">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                {isAdmin
                  ? 'No messages sent yet.'
                  : 'No messages from the secretariat yet.'}
              </div>
            ) : (
              messages.map((m) => (
                <MessageRow key={m.id} message={m} isAdmin={isAdmin} onChange={mutate} />
              ))
            )}
          </div>
        </PageMain>
      </PageShell>
    </div>
  );
}

function ComposeForm({ onSent }: { onSent: () => void }) {
  const [scope, setScope] = useState<'network' | 'country' | 'org' | 'declaration'>('network');
  const [scopeValue, setScopeValue] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  async function previewRecipients() {
    try {
      const r = await api.post<{ recipient_count: number }>(
        '/messages/recipients',
        { scope, scope_value: scopeValue.trim() || null },
      );
      setRecipientCount(r.recipient_count);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Preview failed.');
    }
  }

  async function send() {
    if (!subject.trim() || !body.trim()) {
      toast.error('Subject and body required.');
      return;
    }
    if (scope !== 'network' && !scopeValue.trim()) {
      toast.error('Scope value required (country code, org id, or declaration id).');
      return;
    }
    setSending(true);
    try {
      const r = await api.post<{ recipient_count: number }>('/messages/', {
        scope,
        scope_value: scopeValue.trim() || null,
        subject: subject.trim(),
        body_md: body.trim(),
      });
      toast.success(`Sent to ${r.recipient_count} org${r.recipient_count === 1 ? '' : 's'}.`);
      setSubject('');
      setBody('');
      setScopeValue('');
      setRecipientCount(null);
      onSent();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Send failed.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border border-border rounded-lg bg-card p-4 space-y-3">
      <h2 className="font-semibold text-sm flex items-center gap-2">
        <Send className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
        Compose new message
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Recipients</label>
          <select
            value={scope}
            onChange={(e) => { setScope(e.target.value as never); setScopeValue(''); setRecipientCount(null); }}
            className="mt-0.5 w-full px-2 py-1.5 rounded-md border border-border bg-background text-sm"
          >
            <option value="network">Every active member</option>
            <option value="country">Members in a specific country</option>
            <option value="org">A single member organisation</option>
            <option value="declaration">Shortlisted members under a declaration</option>
          </select>
        </div>
        {scope !== 'network' && (
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {scope === 'country' ? 'ISO country code (e.g. SOM)' : scope === 'org' ? 'Org id' : 'Declaration id'}
            </label>
            <input
              type="text"
              value={scopeValue}
              onChange={(e) => { setScopeValue(e.target.value); setRecipientCount(null); }}
              className="mt-0.5 w-full px-2 py-1.5 rounded-md border border-border bg-background text-sm font-mono"
              placeholder={scope === 'country' ? 'SOM' : '123'}
            />
          </div>
        )}
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Subject</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={200}
          className="mt-0.5 w-full px-2 py-1.5 rounded-md border border-border bg-background text-sm"
          placeholder="e.g. Somalia drought — application window now open"
        />
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Body (Markdown)</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          maxLength={8000}
          className="mt-0.5 w-full px-2 py-1.5 rounded-md border border-border bg-background text-sm font-mono"
          placeholder="What you want members to know. Keep it tight; the audit chain captures every message."
        />
        <div className="text-[10px] text-muted-foreground text-right mt-0.5">{body.length} / 8000</div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={previewRecipients}
          className="text-xs px-2 py-1 rounded-md border border-border hover:bg-muted"
        >
          Preview recipients
        </button>
        {recipientCount != null && (
          <span className="text-xs text-muted-foreground">
            Would reach <span className="font-semibold text-foreground">{recipientCount}</span> org{recipientCount === 1 ? '' : 's'}
          </span>
        )}
        <button
          type="button"
          onClick={send}
          disabled={sending}
          className="ml-auto px-3 py-1.5 rounded-md text-xs font-semibold bg-[hsl(var(--kuja-clay))] text-white hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1"
        >
          {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
          Send message
        </button>
      </div>
    </div>
  );
}

function MessageRow({ message: m, isAdmin, onChange }: { message: Message; isAdmin: boolean; onChange: () => void }) {
  const [expanded, setExpanded] = useState(false);

  async function markRead() {
    try {
      await api.patch(`/messages/${m.id}/read`, {});
      onChange();
    } catch {
      // silent — not fatal
    }
  }

  const scopeIcon =
    m.scope === 'network' ? <Globe className="w-3 h-3" />
    : m.scope === 'country' ? <MapPin className="w-3 h-3" />
    : m.scope === 'org' ? <Building2 className="w-3 h-3" />
    : <Siren className="w-3 h-3" />;
  const scopeLabel =
    m.scope === 'network' ? 'All active members'
    : m.scope === 'country' ? `Members in ${m.scope_value}`
    : m.scope === 'org' ? `Org #${m.scope_value}`
    : `Shortlisted under declaration #${m.scope_value}`;
  const unreadStyle = !isAdmin && m.is_read === false
    ? 'border-l-4 border-l-[hsl(var(--kuja-clay))]'
    : '';

  return (
    <div className={`border border-border rounded-lg bg-card p-4 space-y-2 ${unreadStyle}`}>
      <button
        type="button"
        onClick={() => {
          setExpanded((v) => !v);
          if (!isAdmin && m.is_read === false) void markRead();
        }}
        className="w-full text-left"
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {!isAdmin && m.is_read === false && (
                <span className="inline-block w-2 h-2 rounded-full bg-[hsl(var(--kuja-clay))]" aria-label="unread" />
              )}
              <span className="font-semibold text-sm">{m.subject}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1">
                {scopeIcon} {scopeLabel}
              </span>
              <span>·</span>
              <span>From {m.sender_name || m.sender_email || 'secretariat'}</span>
              <span>·</span>
              <span>{m.sent_at ? new Date(m.sent_at).toLocaleString() : ''}</span>
              {m.audit_chain_id && (
                <>
                  <span>·</span>
                  <span className="text-[hsl(var(--kuja-grow))]">audit #{m.audit_chain_id}</span>
                </>
              )}
            </div>
          </div>
          <ChevronRight className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </div>
      </button>
      {expanded && (
        <div className="border-t border-border pt-3 text-sm whitespace-pre-wrap leading-relaxed">
          {m.body_md}
        </div>
      )}
      {/* Phase 141 — sender-side read receipts. Admins see who has
          opened the message; collapsed by default to avoid clutter. */}
      {isAdmin && expanded && (
        <ReadReceipts messageId={m.id} />
      )}
    </div>
  );
}

function ReadReceipts({ messageId }: { messageId: number }) {
  const [data, setData] = useState<{
    summary: { recipients: number; read: number; unread: number; read_pct: number };
    recipients: { org_id: number; org_name: string; org_country: string | null; read_at: string | null }[];
  } | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (data || loading) return;
    setLoading(true);
    try {
      const r = await api.get<typeof data>(
        `/api/messages/${messageId}/read-receipts`,
      );
      setData(r);
    } catch {
      // best effort
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border-t border-border pt-3 text-xs">
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); load(); }}
        className="inline-flex items-center gap-1.5 font-semibold text-muted-foreground hover:text-foreground"
      >
        Read receipts
        {data && (
          <span>
            ({data.summary.read}/{data.summary.recipients}, {data.summary.read_pct}%)
          </span>
        )}
        <ChevronRight className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && loading && <div className="mt-2 text-muted-foreground">Loading…</div>}
      {open && data && (
        <ul className="mt-2 space-y-1">
          {data.recipients.slice(0, 30).map((r) => (
            <li key={r.org_id} className="flex items-center justify-between gap-2">
              <span className="truncate">
                {r.org_name}
                {r.org_country && <span className="text-muted-foreground"> · {r.org_country}</span>}
              </span>
              <span className={r.read_at ? 'text-emerald-700' : 'text-muted-foreground'}>
                {r.read_at ? new Date(r.read_at).toLocaleDateString() : 'unread'}
              </span>
            </li>
          ))}
          {data.recipients.length > 30 && (
            <li className="text-muted-foreground">…and {data.recipients.length - 30} more</li>
          )}
        </ul>
      )}
    </div>
  );
}
