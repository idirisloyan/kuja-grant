'use client';

/**
 * OrgMergeTool — Phase 17D (PMO transfer pattern).
 *
 * Admin picks two donor orgs (kept + dup), types the exact dup name
 * to confirm, then runs the merge. Server reparents everything onto
 * kept_id and deletes dup.
 *
 * The name-typed confirmation is the safety gate — copy-paste defeats
 * the gate too, but it forces the admin to slow down + look at the
 * exact name they're about to delete.
 *
 * Quiet on success: shows a small report banner with the counts.
 */

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Merge, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';

interface Org {
  id: number;
  name: string;
  org_type: string;
  country?: string | null;
  verified?: boolean;
}

interface Report {
  success: boolean;
  error?: string;
  kept_id?: number;
  kept_name?: string;
  dup_id?: number;
  dup_name?: string;
  grants_moved?: number;
  users_moved?: number;
  watchlist_moved?: number;
  signals_moved?: number;
  audit_chain_reparented?: number;
}

export function OrgMergeTool() {
  const user = useAuthStore((s) => s.user);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [keptId, setKeptId] = useState<number | null>(null);
  const [dupId, setDupId] = useState<number | null>(null);
  const [confirmName, setConfirmName] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Report | null>(null);

  async function loadOrgs() {
    setLoading(true);
    try {
      const r = await api.get<{ organizations: Org[]; total: number }>(
        '/api/organizations/?org_type=donor&per_page=200'
      );
      setOrgs(r.organizations || []);
    } catch {/* quiet */}
    finally { setLoading(false); }
  }
  useEffect(() => { if (user?.role === 'admin') loadOrgs(); }, [user]);

  const dupOrg = useMemo(() => orgs.find((o) => o.id === dupId), [orgs, dupId]);
  const keptOrg = useMemo(() => orgs.find((o) => o.id === keptId), [orgs, keptId]);
  const canRun = (
    !!keptId && !!dupId && keptId !== dupId &&
    !!dupOrg && confirmName === dupOrg.name && !running
  );

  async function runMerge() {
    if (!canRun) return;
    setRunning(true);
    setResult(null);
    try {
      const r = await api.post<Report>('/api/admin/orgs/merge', {
        kept_id: keptId, dup_id: dupId, confirm_name: confirmName,
      });
      setResult(r);
      if (r.success) {
        // Refresh the org list so the deleted dup vanishes
        setDupId(null);
        setKeptId(null);
        setConfirmName('');
        await loadOrgs();
      }
    } catch (e: unknown) {
      setResult({ success: false, error: e instanceof Error ? e.message : 'merge failed' });
    } finally {
      setRunning(false);
    }
  }

  if (!user || user.role !== 'admin') return null;

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex items-start gap-2 flex-wrap">
        <Merge className="h-5 w-5 mt-0.5 text-[hsl(var(--kuja-clay))]" aria-hidden="true" />
        <div className="flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">
            Donor merge tool
          </div>
          <h3 className="kuja-display text-lg">Combine duplicate donors</h3>
          <p className="text-xs text-muted-foreground">
            Pick the org to keep + the duplicate, type the duplicate&apos;s name to confirm,
            then merge. Grants, users, watchlist items, and signals all move to the kept org.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadOrgs}
          disabled={loading}
          aria-label="Refresh org list"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1">
            Keep this org
          </label>
          <select
            value={keptId ?? ''}
            onChange={(e) => setKeptId(e.target.value ? Number(e.target.value) : null)}
            className="w-full h-9 rounded-md border border-[hsl(var(--border))] bg-background px-2 text-sm"
          >
            <option value="">— choose donor —</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id} disabled={o.id === dupId}>
                {o.name} {o.country ? `· ${o.country}` : ''} (#{o.id})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1">
            Delete this duplicate
          </label>
          <select
            value={dupId ?? ''}
            onChange={(e) => {
              setDupId(e.target.value ? Number(e.target.value) : null);
              setConfirmName('');
            }}
            className="w-full h-9 rounded-md border border-[hsl(var(--border))] bg-background px-2 text-sm"
          >
            <option value="">— choose donor —</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id} disabled={o.id === keptId}>
                {o.name} {o.country ? `· ${o.country}` : ''} (#{o.id})
              </option>
            ))}
          </select>
        </div>
      </div>

      {dupOrg && (
        <div className="mt-3 rounded-md border-l-2 border-[hsl(var(--kuja-flag))] bg-[hsl(var(--kuja-flag)/0.05)] p-3 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-[hsl(var(--kuja-flag))]" />
            <div className="text-xs">
              You&apos;re about to <strong className="text-[hsl(var(--kuja-flag))]">delete</strong>{' '}
              <strong>{dupOrg.name}</strong> (#{dupOrg.id}) and move all its relationships to{' '}
              <strong>{keptOrg?.name ?? '— pick kept org first —'}</strong>.
              Type the duplicate&apos;s exact name to confirm:
            </div>
          </div>
          <Input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={dupOrg.name}
            className="h-9 text-sm"
          />
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] text-muted-foreground">
              {confirmName === dupOrg.name
                ? <Badge className="text-[10px] bg-[hsl(var(--kuja-grow))]">name matches</Badge>
                : confirmName
                  ? <Badge variant="outline" className="text-[10px] text-[hsl(var(--kuja-flag))]">doesn&apos;t match yet</Badge>
                  : 'awaiting confirmation'}
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={runMerge}
              disabled={!canRun}
            >
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Merge className="h-3.5 w-3.5" />}
              <span className="ml-1.5">Merge orgs</span>
            </Button>
          </div>
        </div>
      )}

      {result && (
        <div
          className={cn(
            'mt-3 rounded-md border p-3 text-sm',
            result.success
              ? 'border-[hsl(var(--kuja-grow)/0.3)] bg-[hsl(var(--kuja-grow)/0.05)]'
              : 'border-[hsl(var(--kuja-flag)/0.3)] bg-[hsl(var(--kuja-flag)/0.05)]',
          )}
        >
          {result.success ? (
            <>
              <div className="font-semibold text-[hsl(var(--kuja-grow))] mb-1">Merge complete.</div>
              <div className="text-xs text-muted-foreground">
                Moved <strong>{result.grants_moved}</strong> grants,{' '}
                <strong>{result.users_moved}</strong> users,{' '}
                <strong>{result.watchlist_moved}</strong> watchlist items,{' '}
                <strong>{result.signals_moved}</strong> signals,{' '}
                <strong>{result.audit_chain_reparented}</strong> audit entries
                onto <strong>{result.kept_name}</strong> (#{result.kept_id}).
                Dup <strong>{result.dup_name}</strong> deleted.
              </div>
            </>
          ) : (
            <>
              <div className="font-semibold text-[hsl(var(--kuja-flag))] mb-1">Merge failed.</div>
              <div className="text-xs text-muted-foreground">{result.error}</div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
