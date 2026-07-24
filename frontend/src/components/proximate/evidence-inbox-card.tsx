'use client';

/**
 * Evidence inbox — everything that arrived about a partner.
 *
 * The important design choice: a note alone is enough. Most of what
 * actually reaches Proximate mid-implementation is a sentence from a
 * phone call, not a file. Requiring an upload would mean the commonest
 * form of contact never gets recorded, and the partner record would look
 * emptier than the relationship really is.
 *
 * Also here: partner history across cycles — as facts, with no score.
 */

import { useEffect, useState } from 'react';
import {
  Loader2, Inbox, AlertTriangle, Check, Plus, X, MessageCircle,
  Phone, Mail, MapPin, FileText, History,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const SOURCES = [
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { key: 'call', label: 'Phone call', icon: Phone },
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'field_visit', label: 'Field visit', icon: MapPin },
  { key: 'form', label: 'Form', icon: FileText },
  { key: 'other', label: 'Other', icon: FileText },
];

const KINDS = [
  'progress_update', 'receipt', 'invoice', 'activity_photo',
  'video', 'voice_note', 'issue', 'other',
];

interface Evidence {
  id: number; occurred_at: string | null; source: string; kind: string;
  summary: string | null; has_document: boolean;
  is_issue: boolean; needs_followup: boolean; needs_panel: boolean;
  is_open_issue: boolean; resolved_at: string | null; resolution_note: string | null;
}

export function EvidenceInboxCard({ partnerId, roundId, canEdit }: {
  partnerId: number; roundId?: number; canEdit: boolean;
}) {
  const [items, setItems] = useState<Evidence[]>([]);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  async function load() {
    try {
      const r = await api.get<{
        success: boolean; evidence: Evidence[]; summary: Record<string, number>;
      }>(`/api/proximate/partners/${partnerId}/evidence`);
      if (r?.success) { setItems(r.evidence); setSummary(r.summary); }
    } catch { /* stays empty */ }
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [partnerId]);

  async function resolve(id: number) {
    try {
      await api.patch(`/api/proximate/evidence/${id}`, { resolved: true });
      load();
    } catch { /* reload shows truth */ }
  }

  if (loading) {
    return (
      <Card className="p-5 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading evidence…
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Inbox className="w-4 h-4 text-muted-foreground" /> Evidence
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Anything that arrived — a WhatsApp photo, a phone call, a
              receipt. A note on its own is enough; there is no need to
              have a file.
            </p>
          </div>
          {canEdit && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Log something
            </Button>
          )}
        </div>
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Stat label="Items" v={summary.total} />
            <Stat label="Open issues" v={summary.open_issues} bad={summary.open_issues > 0} />
            <Stat label="Needs follow-up" v={summary.needs_followup} />
            <Stat label="For the panel" v={summary.needs_panel} />
          </div>
        )}
      </Card>

      {items.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Nothing logged yet. When a partner sends a photo or calls, record
          it here — that is what the record is made of.
        </Card>
      )}

      {items.map((e) => {
        const Src = SOURCES.find((s) => s.key === e.source)?.icon || FileText;
        return (
          <Card key={e.id} className={`p-4 ${e.is_open_issue ? 'border-amber-300' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <Src className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm">{e.summary || '(attachment only)'}</p>
                  <p className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
                    <span>{SOURCES.find((s) => s.key === e.source)?.label || e.source}</span>
                    <span>·</span>
                    <span>{e.kind.replace(/_/g, ' ')}</span>
                    {e.occurred_at && <><span>·</span><span>{e.occurred_at.slice(0, 10)}</span></>}
                    {e.has_document && <><span>·</span><span>file attached</span></>}
                  </p>
                  {e.resolution_note && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Resolved: {e.resolution_note}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {e.needs_panel && <Badge variant="outline">panel</Badge>}
                {e.is_open_issue && (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    {canEdit && (
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                              onClick={() => resolve(e.id)}>
                        Resolve
                      </Button>
                    )}
                  </>
                )}
                {e.resolved_at && <Check className="w-4 h-4 text-emerald-600" />}
              </div>
            </div>
          </Card>
        );
      })}

      {adding && (
        <AddEvidenceDialog
          partnerId={partnerId} roundId={roundId}
          onClose={() => setAdding(false)}
          onAdded={() => { setAdding(false); load(); }}
        />
      )}
    </div>
  );
}

function Stat({ label, v, bad }: { label: string; v: number; bad?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-semibold tabular-nums ${bad ? 'text-amber-700 dark:text-amber-400' : ''}`}>
        {v}
      </p>
    </div>
  );
}

function AddEvidenceDialog({ partnerId, roundId, onClose, onAdded }: {
  partnerId: number; roundId?: number; onClose: () => void; onAdded: () => void;
}) {
  const [source, setSource] = useState('whatsapp');
  const [kind, setKind] = useState('progress_update');
  const [summary, setSummary] = useState('');
  const [occurred, setOccurred] = useState('');
  const [isIssue, setIsIssue] = useState(false);
  const [followup, setFollowup] = useState(false);
  const [panel, setPanel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    setBusy(true); setErr('');
    try {
      const r = await api.post<{ success: boolean; error?: string }>(
        `/api/proximate/partners/${partnerId}/evidence`,
        {
          source, kind, summary, round_id: roundId,
          occurred_at: occurred || undefined,
          is_issue: isIssue, needs_followup: followup, needs_panel: panel,
        },
      );
      if (r?.success) onAdded();
      else setErr(r?.error || 'Could not save.');
    } catch (e) {
      setErr((e as { message?: string })?.message || 'Could not save.');
    }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg p-5 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Log something that arrived</h3>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-1.5">How did it reach you?</p>
          <div className="flex flex-wrap gap-2">
            {SOURCES.map((s) => (
              <button
                key={s.key} type="button" onClick={() => setSource(s.key)}
                className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${
                  source === s.key
                    ? 'border-[hsl(var(--kuja-clay))] bg-[hsl(var(--kuja-clay))]/10'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <label className="block text-sm">
          <span className="text-xs text-muted-foreground">What happened</span>
          <textarea
            rows={3} value={summary} autoFocus
            onChange={(e) => setSummary(e.target.value)}
            placeholder="He called — the market is closed, distribution moved to Thursday."
            className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
          />
        </label>

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-xs text-muted-foreground">Kind</span>
            <select
              value={kind} onChange={(e) => setKind(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-xs text-muted-foreground">When it happened</span>
            <input
              type="date" value={occurred}
              onChange={(e) => setOccurred(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
            />
          </label>
        </div>

        <div className="space-y-2">
          {([
            ['This is a problem', isIssue, setIsIssue],
            ['Needs follow-up', followup, setFollowup],
            ['The panel should see this', panel, setPanel],
          ] as [string, boolean, (v: boolean) => void][]).map(([label, val, set]) => (
            <label key={label} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={val} onChange={(e) => set(e.target.checked)} />
              {label}
            </label>
          ))}
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={busy || !summary.trim()}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Log it'}
          </Button>
        </div>
      </Card>
    </div>
  );
}


/**
 * Partner history across cycles.
 *
 * Facts, with no score. A reliability rating built from report timing
 * would, in Sudan, measure connectivity and conflict as much as
 * diligence — and a number on a partner card becomes a funding gate by
 * accident, against exactly the organisations this fund exists for.
 */
export function PartnerHistoryCard({ partnerId }: { partnerId: number }) {
  const [data, setData] = useState<{
    cycles: Record<string, unknown>[];
    observations: Record<string, number | null>;
    note: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get<{ success: boolean } & typeof data>(
          `/api/proximate/partners/${partnerId}/history`,
        );
        if (r?.success) setData(r as never);
      } catch { /* stays empty */ }
      setLoading(false);
    })();
  }, [partnerId]);

  if (loading) {
    return (
      <Card className="p-5 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading history…
      </Card>
    );
  }
  if (!data) return null;

  const o = data.observations;
  const rows: [string, string][] = [
    ['Cycles participated in', String(o.cycles_participated ?? 0)],
    ['Times awarded', String(o.times_awarded ?? 0)],
    ['Total awarded', `$${Number(o.total_awarded_usd || 0).toLocaleString()}`],
    ['Total sent', `$${Number(o.total_sent_usd || 0).toLocaleString()}`],
    ['Receipts confirmed', String(o.receipts_confirmed ?? 0)],
    ['Receipts outstanding', String(o.receipts_outstanding ?? 0)],
    ['Typical time to confirm receipt',
      o.median_receipt_lag_days === null || o.median_receipt_lag_days === undefined
        ? 'No data yet' : `${o.median_receipt_lag_days} day(s)`],
    ['Reports on time', String(o.reports_on_time ?? 0)],
    ['Reports late', String(o.reports_late ?? 0)],
    ['Reports outstanding', String(o.reports_outstanding ?? 0)],
    ['Evidence logged', String(o.evidence_items ?? 0)],
    ['Open issues', String(o.open_issues ?? 0)],
  ];

  return (
    <Card className="p-5 space-y-4">
      <h3 className="font-semibold flex items-center gap-2">
        <History className="w-4 h-4 text-muted-foreground" /> History with the fund
      </h3>

      {data.cycles.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="py-1.5 pr-3 font-normal">Cycle</th>
                <th className="py-1.5 pr-3 font-normal">Decision</th>
                <th className="py-1.5 pr-3 font-normal text-right">Approved</th>
                <th className="py-1.5 pr-3 font-normal text-right">Sent</th>
                <th className="py-1.5 font-normal text-right">Reports in</th>
              </tr>
            </thead>
            <tbody>
              {data.cycles.map((c) => (
                <tr key={String(c.round_id)} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3">{String(c.round_title || `#${c.round_id}`)}</td>
                  <td className="py-2 pr-3">{String(c.decision || '—')}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    ${Number(c.approved_amount_usd || 0).toLocaleString()}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    ${Number(c.total_sent_usd || 0).toLocaleString()}
                  </td>
                  <td className="py-2 text-right tabular-nums">{String(c.reports_in ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="text-sm tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <p className="text-xs text-muted-foreground border-t border-border pt-3">
        {data.note}
      </p>
    </Card>
  );
}
