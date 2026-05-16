'use client';

/**
 * /admin/audit-chain — hash-chained tamper-evident audit log (Phase 7).
 *
 * Admin-only. Shows:
 *   - Chain integrity badge (✅ intact / ❌ N breaks)
 *   - Full chain count + last verified timestamp
 *   - Paginated recent entries with action, actor, subject, hashes
 *   - One-click re-verify
 *
 * The chain itself is the tamper-evidence — every row contains the hash
 * of the previous row. Editing one row breaks every row after it; the
 * verify endpoint walks the chain and surfaces the break point.
 */

import { useEffect, useState } from 'react';
import {
  ShieldCheck, ShieldAlert, RefreshCw, Loader2, ChevronLeft, ChevronRight,
  Award, User as UserIcon, ExternalLink,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface VerifyResult {
  success: boolean;
  ok: boolean;
  total_checked: number;
  breaks: { seq: number; kind: string; expected?: string; got?: string }[];
  limit: number | null;
}

interface ChainEntry {
  id: number;
  seq: number;
  action: string;
  actor_email: string | null;
  subject_kind: string | null;
  subject_id: number | null;
  prev_hash: string;
  payload_hash: string;
  created_at: string;
  details: Record<string, unknown>;
}

interface RecentResult {
  success: boolean;
  total: number;
  limit: number;
  offset: number;
  entries: ChainEntry[];
}

const ACTION_TONE: Record<string, string> = {
  publish: 'text-[hsl(var(--kuja-grow))]',
  revoke:  'text-[hsl(var(--kuja-flag))]',
  verify:  'text-[hsl(var(--kuja-clay))]',
};

function actionTone(action: string): string {
  if (action.endsWith('.publish')) return ACTION_TONE.publish;
  if (action.endsWith('.revoke')) return ACTION_TONE.revoke;
  if (action.endsWith('.verify')) return ACTION_TONE.verify;
  return 'text-[hsl(var(--kuja-ink-soft))]';
}

function humanise(action: string): string {
  return action.replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

export default function AuditChainPage() {
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(true);
  const [recent, setRecent] = useState<RecentResult | null>(null);
  const [recentLoading, setRecentLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const LIMIT = 25;

  const loadVerify = async () => {
    setVerifyLoading(true);
    try {
      const r = await api.get<VerifyResult>('/api/audit-chain/verify');
      setVerify(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setVerifyLoading(false);
    }
  };

  const loadRecent = async (newOffset: number) => {
    setRecentLoading(true);
    try {
      const r = await api.get<RecentResult>(`/api/audit-chain/recent?limit=${LIMIT}&offset=${newOffset}`);
      setRecent(r);
      setOffset(newOffset);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRecentLoading(false);
    }
  };

  useEffect(() => {
    loadVerify();
    loadRecent(0);
  }, []);

  const integrityOk = verify?.ok === true;

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <div>
        <div className="kuja-eyebrow">Compliance evidence</div>
        <h1 className="kuja-display text-3xl mt-1">Hash-chained audit log</h1>
        <p className="text-sm text-[hsl(var(--kuja-ink-soft))] mt-1 max-w-2xl">
          Every critical event (capacity passport publish/verify/revoke, plus future
          high-trust actions) writes a hash-chained row. Any retroactive edit breaks
          the chain — this page proves the chain is intact and shows the live timeline.
        </p>
      </div>

      {/* Integrity card */}
      <Card className={cn(
        'p-4 sm:p-5 border-l-4',
        verifyLoading ? 'border-l-[hsl(var(--kuja-ink-soft))]'
          : integrityOk ? 'border-l-[hsl(var(--kuja-grow))]'
          : 'border-l-[hsl(var(--kuja-flag))]',
      )}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            {verifyLoading ? (
              <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--kuja-ink-soft))]" />
            ) : integrityOk ? (
              <ShieldCheck className="w-6 h-6 text-[hsl(var(--kuja-grow))]" />
            ) : (
              <ShieldAlert className="w-6 h-6 text-[hsl(var(--kuja-flag))]" />
            )}
            <div>
              <div className="kuja-eyebrow">Chain integrity</div>
              <h2 className="kuja-display text-xl mt-0.5">
                {verifyLoading ? 'Verifying…'
                  : integrityOk ? `Intact — ${verify?.total_checked.toLocaleString()} rows verified`
                  : `${verify?.breaks.length} break(s) detected in ${verify?.total_checked} rows`}
              </h2>
              {verify && !integrityOk && (
                <ul className="text-xs text-[hsl(var(--kuja-flag))] mt-2 space-y-1">
                  {verify.breaks.slice(0, 5).map((b, i) => (
                    <li key={i}>
                      <strong>seq {b.seq}</strong>: {b.kind}
                      {b.expected && <> · expected <code>{b.expected.slice(0, 12)}…</code></>}
                      {b.got && <> · got <code>{b.got.slice(0, 12)}…</code></>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={loadVerify}
            disabled={verifyLoading}
            className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-xs font-semibold hover:bg-[hsl(var(--kuja-sand-50))] disabled:opacity-50"
          >
            {verifyLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Re-verify
          </button>
        </div>
      </Card>

      {/* Recent entries */}
      <Card className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="kuja-eyebrow">Recent entries</div>
            <h3 className="text-base font-semibold mt-0.5">
              {recent ? `${recent.total.toLocaleString()} total` : '…'}
              {recent && recent.entries.length > 0 && (
                <span className="text-[hsl(var(--kuja-ink-soft))] font-normal">
                  {' '}· showing {offset + 1}–{offset + recent.entries.length}
                </span>
              )}
            </h3>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => loadRecent(Math.max(0, offset - LIMIT))}
              disabled={offset === 0 || recentLoading}
              className="rounded-md border border-[hsl(var(--border))] p-1.5 hover:bg-[hsl(var(--kuja-sand-50))] disabled:opacity-50"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => loadRecent(offset + LIMIT)}
              disabled={!recent || offset + LIMIT >= recent.total || recentLoading}
              className="rounded-md border border-[hsl(var(--border))] p-1.5 hover:bg-[hsl(var(--kuja-sand-50))] disabled:opacity-50"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {recentLoading && !recent && (
          <div className="mt-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="kuja-shimmer h-12 rounded" />
            ))}
          </div>
        )}

        {recent && recent.entries.length === 0 && (
          <div className="mt-4 rounded-md border-2 border-dashed border-[hsl(var(--border))] p-8 text-center">
            <Award className="w-8 h-8 mx-auto text-[hsl(var(--kuja-ink-soft))]" />
            <p className="text-sm font-semibold mt-2">No audit entries yet</p>
            <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-1">
              Publishing a capacity passport (or other high-trust actions, as wired) will populate the chain.
            </p>
          </div>
        )}

        {recent && recent.entries.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[hsl(var(--border))] text-[hsl(var(--kuja-ink-soft))]">
                  <th className="py-2 text-left font-semibold">seq</th>
                  <th className="py-2 text-left font-semibold">Action</th>
                  <th className="py-2 text-left font-semibold">Actor</th>
                  <th className="py-2 text-left font-semibold">Subject</th>
                  <th className="py-2 text-left font-semibold">Prev hash</th>
                  <th className="py-2 text-left font-semibold">Payload hash</th>
                  <th className="py-2 text-left font-semibold">When</th>
                </tr>
              </thead>
              <tbody>
                {recent.entries.map((e) => (
                  <tr key={e.id} className="border-b border-[hsl(var(--border))] last:border-b-0 hover:bg-[hsl(var(--kuja-sand-50))]">
                    <td className="py-2 font-mono text-[hsl(var(--kuja-ink-soft))]">{e.seq}</td>
                    <td className={cn('py-2 font-semibold', actionTone(e.action))}>
                      {humanise(e.action)}
                    </td>
                    <td className="py-2">
                      {e.actor_email ? (
                        <span className="inline-flex items-center gap-1">
                          <UserIcon className="w-3 h-3 text-[hsl(var(--kuja-ink-soft))]" />
                          {e.actor_email}
                        </span>
                      ) : <span className="text-[hsl(var(--kuja-ink-soft))]">—</span>}
                    </td>
                    <td className="py-2">
                      {e.subject_kind ? (
                        <Badge variant="outline" className="text-[10px]">
                          {e.subject_kind} #{e.subject_id}
                        </Badge>
                      ) : <span className="text-[hsl(var(--kuja-ink-soft))]">—</span>}
                    </td>
                    <td className="py-2 font-mono text-[10px] text-[hsl(var(--kuja-ink-soft))]">
                      {e.prev_hash || '(genesis)'}
                    </td>
                    <td className="py-2 font-mono text-[10px] text-[hsl(var(--kuja-ink))]">
                      {e.payload_hash}
                    </td>
                    <td className="py-2 text-[hsl(var(--kuja-ink-soft))]">
                      {new Date(e.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-[10px] text-[hsl(var(--kuja-ink-soft))] flex items-center gap-1.5">
        <ExternalLink className="w-3 h-3" />
        The verify routine recomputes each row&apos;s hash with the previous row&apos;s payload — any retroactive edit will break every row that follows.
      </p>

      {error && (
        <Card className="p-3 border-[hsl(var(--kuja-flag)/0.3)]">
          <p className="text-xs text-[hsl(var(--kuja-flag))]">Error: {error}</p>
        </Card>
      )}
    </div>
  );
}
