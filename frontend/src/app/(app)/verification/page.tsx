'use client';

import { useState, useMemo, useCallback } from 'react';
import { useVerifications, useRegistries } from '@/lib/hooks/use-api';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  ShieldCheck, AlertTriangle, Clock, Eye, Search, RefreshCw,
  ChevronDown, ChevronRight, Loader2, CheckCircle, XCircle, Cpu,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RegistrationVerification } from '@/lib/types';

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function confidenceCls(c: number | null | undefined): string {
  if (c == null) return 'text-muted-foreground';
  if (c >= 80) return 'text-[hsl(var(--kuja-grow))]';
  if (c >= 60) return 'text-[hsl(var(--kuja-sun))]';
  return 'text-[hsl(var(--kuja-flag))]';
}

function confidenceBar(c: number | null | undefined): string {
  if (c == null) return 'bg-muted';
  if (c >= 80) return 'bg-[hsl(var(--kuja-grow))]';
  if (c >= 60) return 'bg-[hsl(var(--kuja-sun))]';
  return 'bg-[hsl(var(--kuja-flag))]';
}

function VerificationDetail({ verification }: { verification: RegistrationVerification }) {
  const a = verification.ai_analysis as Record<string, unknown> | null;
  const findings = a?.findings as string[] | undefined;
  const recommendations = a?.recommendations as string[] | undefined;
  const registryResult = verification.registry_check_result as Record<string, unknown> | null;

  return (
    <div className="px-5 py-4 bg-muted/30 border-t border-border">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Cpu className="h-3.5 w-3.5 text-[hsl(var(--kuja-clay))]" />
            <span className="text-sm font-semibold">AI analysis</span>
          </div>
          {findings && findings.length > 0 ? (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {findings.map((f, i) => (
                <li key={i} className="flex gap-2"><span className="text-muted-foreground">-</span>{f}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground italic">No AI findings available.</p>
          )}
        </div>
        <div>
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="h-3.5 w-3.5 text-[hsl(var(--kuja-grow))]" />
            <span className="text-sm font-semibold">Recommendations</span>
          </div>
          {recommendations && recommendations.length > 0 ? (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {recommendations.map((r, i) => (
                <li key={i} className="flex gap-2"><span>-</span>{r}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground italic">No recommendations available.</p>
          )}
        </div>
      </div>

      {registryResult && (
        <div className="mt-4">
          <div className="text-sm font-semibold mb-2">Registry check result</div>
          <pre className="bg-background border border-border rounded p-3 text-xs font-mono overflow-auto max-h-64">
            {JSON.stringify(registryResult, null, 2)}
          </pre>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {verification.registry_url && (
          <span>
            Registry: <a href={verification.registry_url} target="_blank" rel="noreferrer"
              className="text-[hsl(var(--kuja-clay))] underline">{verification.registry_url}</a>
          </span>
        )}
        {verification.verified_by_name && <span>Verified by: {verification.verified_by_name}</span>}
        {verification.verified_at && <span>Verified: {formatDate(verification.verified_at)}</span>}
        {verification.notes && <span>Notes: {verification.notes}</span>}
      </div>
    </div>
  );
}

export default function VerificationPage() {
  const { data, isLoading, mutate } = useVerifications();
  const { data: registriesData } = useRegistries();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [runningId, setRunningId] = useState<number | null>(null);

  const verifications = useMemo(() => {
    const orgs = (data?.organizations ?? []) as unknown as Array<Record<string, unknown>>;
    return orgs.map((o) => ({
      ...o,
      id: (o.org_id ?? o.id) as number,
      status: ((o.verification_status ?? o.status) || 'unverified') as string,
      ai_confidence: (o.ai_confidence ?? null) as number | null,
      org_name: (o.org_name ?? '') as string,
      country: (o.country ?? '') as string,
      registration_number: (o.registration_number ?? '') as string,
      registration_authority: (o.registration_authority ?? o.registry_authority ?? '') as string,
    })) as unknown as RegistrationVerification[];
  }, [data]);

  const statCounts = useMemo(() => {
    const counts = { verified: 0, ai_reviewed: 0, pending: 0, flagged: 0, unverified: 0 };
    for (const v of verifications) {
      if (v.status in counts) counts[v.status as keyof typeof counts]++;
    }
    return counts;
  }, [verifications]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return verifications;
    const q = searchQuery.toLowerCase();
    return verifications.filter((v) =>
      (v.org_name ?? '').toLowerCase().includes(q) ||
      (v.country ?? '').toLowerCase().includes(q) ||
      (v.registration_number ?? '').toLowerCase().includes(q) ||
      (v.registration_authority ?? '').toLowerCase().includes(q),
    );
  }, [verifications, searchQuery]);

  const runVerification = useCallback(async (orgId: number) => {
    setRunningId(orgId);
    try {
      const org = verifications.find((v) => (v as unknown as Record<string, unknown>).org_id === orgId || v.id === orgId);
      await api.post('/verification/verify', { org_id: orgId, country: org?.country || '' });
      await mutate();
    } catch { /* noop */ } finally { setRunningId(null); }
  }, [mutate, verifications]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="kuja-shimmer h-10 w-64 rounded" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[1,2,3,4,5].map((i) => <div key={i} className="kuja-shimmer h-24 rounded-xl" />)}
        </div>
        <div className="kuja-shimmer h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="kuja-display text-3xl">Registration verification</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Verify organization registrations across {Object.keys(registriesData?.registries ?? {}).length} supported countries
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatBox icon={ShieldCheck} label="Verified" value={statCounts.verified} tone="success" />
        <StatBox icon={Cpu} label="AI reviewed" value={statCounts.ai_reviewed} tone="spark" />
        <StatBox icon={Clock} label="Pending" value={statCounts.pending} tone="warn" />
        <StatBox icon={AlertTriangle} label="Flagged" value={statCounts.flagged} tone="danger" />
        <StatBox icon={XCircle} label="Unverified" value={statCounts.unverified} />
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by org, country, reg number…"
          className="w-full h-10 pl-9 pr-3 text-sm rounded-md border border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-clay))]"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-background px-6 py-14 text-center">
          <Eye className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="kuja-display text-xl">No verifications found</p>
          <p className="text-sm text-muted-foreground mt-1">
            {searchQuery ? 'Try a different search term.' : 'No organization verifications available.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-background overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b border-border text-left">
                  <th className="w-10" />
                  <th className="px-4 py-3 font-medium text-muted-foreground">Organization</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Country</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Reg #</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Authority</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right">AI confidence</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => {
                  const expanded = expandedId === v.id;
                  const running = runningId === v.org_id;
                  return (
                    <Fragmentable key={v.id}>
                      <tr
                        onClick={() => setExpandedId(expanded ? null : v.id)}
                        className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                      >
                        <td className="px-2">
                          {expanded
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        </td>
                        <td className="px-4 py-3 font-medium">{v.org_name || `Org #${v.org_id}`}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full border border-border text-[10px] uppercase tracking-wider px-2 py-0.5 text-muted-foreground">
                            {v.country}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {v.registration_number || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {v.registration_authority || '—'}
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={v.status} /></td>
                        <td className="px-4 py-3 text-right">
                          {v.ai_confidence != null ? (
                            <div className="flex items-center gap-2 justify-end">
                              <div className="w-12 h-1.5 bg-muted rounded overflow-hidden">
                                <div
                                  className={cn('h-full transition-all', confidenceBar(v.ai_confidence))}
                                  style={{ width: `${Math.min(v.ai_confidence, 100)}%` }}
                                />
                              </div>
                              <span className={cn('font-semibold text-xs min-w-[32px] text-right', confidenceCls(v.ai_confidence))}>
                                {v.ai_confidence}%
                              </span>
                            </div>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); runVerification(v.org_id); }}
                            disabled={running}
                            className="inline-flex items-center gap-1 rounded border border-border hover:border-[hsl(var(--kuja-clay))] text-xs font-medium px-2.5 py-1 disabled:opacity-50"
                          >
                            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            {running ? 'Running…' : 'Verify'}
                          </button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={8} className="p-0">
                            <VerificationDetail verification={v} />
                          </td>
                        </tr>
                      )}
                    </Fragmentable>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// React fragment wrapper for a two-row pattern — needed because bare <></>
// isn't valid inside <tbody> with a key. Used only for map-keying.
import { Fragment } from 'react';
import type { ReactNode } from 'react';
function Fragmentable({ children }: { children: ReactNode }) {
  return <Fragment>{children}</Fragment>;
}

function StatBox({
  icon: Icon, label, value, tone,
}: { icon: typeof ShieldCheck; label: string; value: number; tone?: 'success' | 'warn' | 'danger' | 'spark' }) {
  const cls = tone === 'success' ? 'text-[hsl(var(--kuja-grow))]'
    : tone === 'warn' ? 'text-[hsl(var(--kuja-sun))]'
    : tone === 'danger' ? 'text-[hsl(var(--kuja-flag))]'
    : tone === 'spark' ? 'text-[hsl(var(--kuja-spark))]'
    : 'text-[hsl(var(--kuja-clay-dark))]';
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <Icon className={cn('h-5 w-5 mb-2', cls)} />
      <div className={cn('kuja-numeric text-2xl font-semibold', cls)}>{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}
