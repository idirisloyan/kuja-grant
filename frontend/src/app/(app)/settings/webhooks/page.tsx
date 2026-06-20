'use client';

/**
 * Phase 151 — Webhook management UI for org admins.
 *
 * Reads from the Phase 143 backend (/api/webhooks + /events + /test).
 * Lets the calling user:
 *   - see all registered webhooks for their org (url, last delivery,
 *     status, failure count)
 *   - register a new one (url + event multi-select)
 *   - fire a synthetic test ping at any registered hook
 *   - delete a hook
 *
 * The freshly-registered secret is shown EXACTLY ONCE at creation time;
 * after that the API never returns it again (we mirror standard webhook
 * provider behavior).
 */

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Webhook as WebhookIcon, Send, Trash2, Loader2, Plus, Copy, Check,
  AlertCircle, CheckCircle2,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';
import { cn } from '@/lib/utils';

interface Hook {
  id: number;
  url: string;
  events: string[];
  active: boolean;
  description?: string | null;
  last_delivery_at?: string | null;
  last_delivery_status?: number | null;
  last_delivery_error?: string | null;
  delivery_count: number;
  failure_count: number;
}

interface CreatedHook extends Hook { secret: string }

export default function WebhooksSettingsPage() {
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newEvents, setNewEvents] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<CreatedHook | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [hr, er] = await Promise.all([
        api.get<{ webhooks: Hook[] }>('/api/webhooks'),
        api.get<{ events: string[] }>('/api/webhooks/events'),
      ]);
      setHooks(hr.webhooks ?? []);
      setEvents(er.events ?? []);
    } catch {
      toast.error('Failed to load webhooks.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const toggleEvent = (e: string) => {
    setNewEvents((prev) => {
      const next = new Set(prev);
      if (next.has(e)) next.delete(e); else next.add(e);
      return next;
    });
  };

  const create = async () => {
    if (!newUrl.trim() || newEvents.size === 0) {
      toast.error('URL + at least one event required.');
      return;
    }
    setCreating(true);
    try {
      const r = await api.post<{ webhook: CreatedHook }>('/api/webhooks', {
        url: newUrl.trim(),
        description: newDescription.trim() || undefined,
        events: Array.from(newEvents),
      });
      setCreatedSecret(r.webhook);
      setNewUrl('');
      setNewDescription('');
      setNewEvents(new Set());
      setShowForm(false);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to register webhook');
    } finally {
      setCreating(false);
    }
  };

  const testHook = async (id: number) => {
    try {
      const r = await api.post<{ result: { status: number | null; attempts: number; error?: string | null } }>(
        `/api/webhooks/${id}/test`, {});
      if (r.result.status && r.result.status < 300) {
        toast.success(`Test delivered (${r.result.status}) in ${r.result.attempts} attempt(s).`);
      } else {
        toast.error(`Test failed: ${r.result.error ?? `status ${r.result.status ?? 'n/a'}`}`);
      }
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Test ping failed');
    }
  };

  const deleteHook = async (id: number) => {
    if (!confirm('Delete this webhook? The receiver will no longer get events.')) return;
    try {
      await api.delete(`/api/webhooks/${id}`);
      toast.success('Webhook deleted.');
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Delete failed');
    }
  };

  return (
    <PageShell>
      <PageHeader
        title="Webhooks"
        icon={WebhookIcon}
        subtitle="Receive event payloads from Kuja in your own systems. Each delivery is signed with X-Kuja-Signature (HMAC-SHA256)."
        primaryAction={
          <Button onClick={() => setShowForm(true)} disabled={showForm}>
            <Plus className="w-3.5 h-3.5" /> Register
          </Button>
        }
      />
      <PageMain>
        {/* Created secret card — shown ONCE. */}
        {createdSecret && (
          <Card className="p-4 border-emerald-300 bg-emerald-50 mb-4">
            <header className="flex items-start justify-between mb-2">
              <div>
                <h3 className="font-semibold text-sm inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  Webhook registered
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Copy the secret now — it will never be shown again.
                </p>
              </div>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setCreatedSecret(null)}
              >
                Dismiss
              </button>
            </header>
            <div className="text-xs">
              <div className="text-muted-foreground mb-1">URL: {createdSecret.url}</div>
              <div className="mb-2 text-muted-foreground">
                Events: {createdSecret.events.join(', ')}
              </div>
              <div className="font-mono break-all bg-card border border-border rounded p-2 flex items-center gap-2">
                <code className="flex-1">{createdSecret.secret}</code>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(createdSecret.secret);
                    setSecretCopied(true);
                  }}
                  className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 hover:bg-muted"
                >
                  {secretCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {secretCopied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          </Card>
        )}

        {showForm && (
          <Card className="p-4 mb-4 space-y-3">
            <h3 className="font-semibold text-sm">Register a new webhook</h3>
            <label className="block text-xs">
              <span className="text-muted-foreground">URL</span>
              <input
                type="url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://your-server.example.com/kuja-webhook"
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5"
              />
            </label>
            <label className="block text-xs">
              <span className="text-muted-foreground">Description (optional)</span>
              <input
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Pipes submissions into our CRM"
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5"
              />
            </label>
            <div className="text-xs">
              <div className="text-muted-foreground mb-1.5">Events</div>
              <div className="flex flex-wrap gap-1.5">
                {events.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => toggleEvent(e)}
                    className={cn(
                      'rounded-full border px-2 py-1 text-[11px]',
                      newEvents.has(e)
                        ? 'border-[hsl(var(--kuja-clay))] bg-[hsl(var(--kuja-clay))]/10 text-[hsl(var(--kuja-clay))]'
                        : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={create} disabled={creating}>
                {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Register'}
              </Button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </Card>
        )}

        {loading && (
          <div className="text-sm text-muted-foreground py-6 text-center">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading…
          </div>
        )}

        {!loading && hooks.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No webhooks registered yet. Click <strong>Register</strong> to add one.
          </Card>
        )}

        <div className="space-y-2">
          {hooks.map((h) => {
            const errorRate = h.delivery_count > 0
              ? Math.round(100 * h.failure_count / h.delivery_count)
              : 0;
            return (
              <Card key={h.id} className="p-4 space-y-2">
                <header className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs break-all">{h.url}</div>
                    {h.description && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {h.description}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {h.events.map((e) => (
                        <Badge key={e} variant="outline" className="text-[10px]">
                          {e}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => testHook(h.id)}
                      className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted"
                      title="Send a synthetic test payload"
                    >
                      <Send className="w-3 h-3" /> Test
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteHook(h.id)}
                      className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </div>
                </header>
                <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-3 border-t border-border pt-2">
                  <span>
                    {h.delivery_count} deliveries
                  </span>
                  <span className={
                    errorRate > 0 ? 'text-rose-600 font-semibold' : 'text-muted-foreground'
                  }>
                    {errorRate}% errors
                  </span>
                  {h.last_delivery_at && (
                    <span>
                      Last: {new Date(h.last_delivery_at).toLocaleString()}{' '}
                      {h.last_delivery_status && (
                        <span className={
                          h.last_delivery_status >= 200 && h.last_delivery_status < 300
                            ? 'text-emerald-700'
                            : 'text-rose-600'
                        }>
                          ({h.last_delivery_status})
                        </span>
                      )}
                    </span>
                  )}
                  {h.last_delivery_error && (
                    <span className="inline-flex items-center gap-1 text-rose-600">
                      <AlertCircle className="w-3 h-3" />
                      {h.last_delivery_error.slice(0, 80)}
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </PageMain>
    </PageShell>
  );
}
