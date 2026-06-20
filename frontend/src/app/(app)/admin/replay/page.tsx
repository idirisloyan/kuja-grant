'use client';

/**
 * Phase 102 — Audit-chain replay viewer (admin).
 *
 * Enter an audit chain seq (or follow a deep link from the audit chain
 * page) and see the linked AI call(s) including the full input prompt
 * and output response. The defensibility surface for AI-related disputes.
 */

import { useEffect, useState } from 'react';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';
import { History, Search, Copy, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

interface AICall {
  id: number;
  endpoint: string;
  user_id: number | null;
  success: boolean;
  duration_ms: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  model: string | null;
  error_code: string | null;
  error_message: string | null;
  replay_subject_kind: string | null;
  replay_subject_id: number | null;
  created_at: string | null;
  input_text: string | null;
  output_text: string | null;
}
interface AuditEntry {
  seq: number;
  action: string;
  actor_email: string | null;
  subject_kind: string | null;
  subject_id: number | null;
  details: Record<string, unknown>;
  created_at: string | null;
  prev_hash: string;
  payload_hash: string;
}
interface Resp {
  success: boolean;
  entry: AuditEntry;
  ai_calls: AICall[];
}

export default function ReplayPage() {
  const user = useAuthStore((s) => s.user);
  const [seqInput, setSeqInput] = useState('');
  const [data, setData] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Pull from ?seq= on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const u = new URL(window.location.href);
    const initial = u.searchParams.get('seq');
    if (initial) {
      setSeqInput(initial);
      void load(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async (seqStr: string) => {
    const n = Number(seqStr);
    if (!Number.isInteger(n) || n < 1) {
      setError('Enter a positive integer audit-chain seq.');
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await api.get<Resp>(`/admin/audit-chain/${n}/replay`);
      if (!res.success) {
        setError('Lookup failed.');
        return;
      }
      setData(res);
    } catch (e) {
      setError((e as Error).message || 'Network error.');
    } finally {
      setLoading(false);
    }
  };

  if (user?.role !== 'admin') {
    return <PageShell><PageHeader title="Audit replay" subtitle="Admin only." /></PageShell>;
  }

  return (
    <PageShell>
      <PageHeader
        title="Audit-chain replay"
        subtitle="Reconstruct the exact AI input + output behind any audit entry. Defensibility surface."
      />

      <div className="flex items-center gap-2 mb-4">
        <Search className="w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          inputMode="numeric"
          value={seqInput}
          onChange={(e) => setSeqInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void load(seqInput); }}
          placeholder="Audit chain seq…"
          className="text-sm rounded-md border border-border bg-card px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--kuja-clay)/0.3)]"
        />
        <Button onClick={() => void load(seqInput)} disabled={loading} size="sm">
          {loading ? 'Loading…' : 'Open'}
        </Button>
      </div>

      <PageMain>
        {error && <div className="border border-rose-200 bg-rose-50 rounded-md p-4 text-sm text-rose-800 mb-4">{error}</div>}

        {data?.success && (
          <>
            <section className="border border-border rounded-lg bg-card p-4 mb-4 space-y-2">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
                <h2 className="text-sm font-semibold">
                  Audit entry seq #{data.entry.seq}
                </h2>
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <Row label="Action" value={<code>{data.entry.action}</code>} />
                <Row label="Actor" value={data.entry.actor_email ?? '—'} />
                <Row label="Subject" value={
                  data.entry.subject_kind
                    ? <span><code>{data.entry.subject_kind}</code> #{data.entry.subject_id}</span>
                    : '—'
                } />
                <Row label="Created" value={data.entry.created_at ? new Date(data.entry.created_at).toLocaleString() : '—'} />
              </dl>
              <details className="text-[11px]">
                <summary className="cursor-pointer text-muted-foreground">Raw details_json</summary>
                <pre className="font-mono text-[10px] mt-1 bg-muted/30 rounded p-2 overflow-x-auto">
                  {JSON.stringify(data.entry.details, null, 2)}
                </pre>
              </details>
              <p className="text-[10px] text-muted-foreground border-t border-border pt-2">
                Hash chain: prev=<code className="font-mono">{shortHash(data.entry.prev_hash)}</code> · payload=<code className="font-mono">{shortHash(data.entry.payload_hash)}</code>
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Database className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
                Linked AI calls ({data.ai_calls.length})
              </h2>
              {data.ai_calls.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  No AI calls linked to this audit entry. Either the entry
                  isn&apos;t AI-derived, or the call wasn&apos;t logged via the replay
                  helper (only the post-Phase 102 replay-eligible call sites
                  populate input/output text).
                </p>
              ) : (
                data.ai_calls.map((c) => (
                  <AICallCard key={c.id} call={c} />
                ))
              )}
            </section>
          </>
        )}
      </PageMain>
    </PageShell>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}

function shortHash(s: string | null): string {
  if (!s) return '?';
  return s.length > 16 ? `${s.slice(0, 8)}…${s.slice(-4)}` : s;
}

function copyToClip(s: string | null) {
  if (!s || typeof navigator === 'undefined') return;
  navigator.clipboard?.writeText(s).catch(() => undefined);
}

function AICallCard({ call }: { call: AICall }) {
  return (
    <div className="border border-border rounded-lg bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm font-semibold">
          AI call #{call.id} · <code className="font-mono text-[12px]">{call.endpoint}</code>
        </div>
        <div className="text-[10px] text-muted-foreground">
          {call.model ?? '—'} · {call.tokens_in ?? '?'}+{call.tokens_out ?? '?'} tokens · {call.duration_ms ?? '?'}ms
        </div>
      </div>
      {!call.success && (
        <div className="text-[11px] text-rose-700">
          Failure: <code className="font-mono">{call.error_code}</code> — {call.error_message}
        </div>
      )}

      <details className="text-xs" open>
        <summary className="cursor-pointer font-semibold flex items-center justify-between">
          Input prompt
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); copyToClip(call.input_text); }}
            className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <Copy className="w-3 h-3" /> Copy
          </button>
        </summary>
        <pre className="font-mono text-[10px] mt-1 bg-muted/30 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words max-h-96">
          {call.input_text ?? '(not stored — pre-Phase-102 call)'}
        </pre>
      </details>

      <details className="text-xs" open>
        <summary className="cursor-pointer font-semibold flex items-center justify-between">
          Output response
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); copyToClip(call.output_text); }}
            className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <Copy className="w-3 h-3" /> Copy
          </button>
        </summary>
        <pre className="font-mono text-[10px] mt-1 bg-muted/30 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words max-h-96">
          {call.output_text ?? '(not stored)'}
        </pre>
      </details>
    </div>
  );
}
