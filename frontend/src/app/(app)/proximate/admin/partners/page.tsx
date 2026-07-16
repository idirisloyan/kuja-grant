'use client';

/**
 * Proximate partners list — Phase 722.
 *
 * Fixes a UX bug where sidebar "Partners" pointed at /proximate/admin
 * (same as Operator dashboard). Partners now has its own destination
 * with real filtering + drill-in.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Loader2, Search, Users, ShieldCheck, AlertTriangle, Upload,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';

interface Partner {
  id: number;
  name: string;
  name_ar: string | null;
  locality: string | null;
  status: string;
  trust_tier: string | null;
  sanctions_flag: boolean;
  endorsements_count?: number;
}

const statusStyles: Record<string, string> = {
  nominated: 'bg-muted text-muted-foreground border-border',
  endorsements_open: 'bg-amber-100 text-amber-800 border-amber-300',
  dd_pending: 'bg-sky-100 text-sky-800 border-sky-300',
  dd_clear: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  suspended: 'bg-rose-100 text-rose-800 border-rose-300',
};

export default function ProximatePartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  // Blue Nile intake (2026-07) — bulk PIF import. One Word/PDF form in,
  // one nominated partner out (AI-extracted server-side), original
  // attached as due-diligence evidence.
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const load = () => {
    api.get<{ success: boolean; partners: Partner[] }>('/api/proximate/partners')
      .then((r) => setPartners(r.partners || []))
      .catch(() => setError('Failed to load partners.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const onImport = async (files: FileList | null) => {
    if (!files?.length) return;
    setImporting(true);
    let created = 0, updated = 0, failed = 0;
    for (const f of Array.from(files)) {
      try {
        const fd = new FormData();
        fd.append('file', f);
        const r = await api.upload<{ created: boolean }>(
          '/api/proximate/partners/import-pif', fd,
        );
        if (r.created) created += 1; else updated += 1;
      } catch {
        failed += 1;
      }
    }
    setImportNote(
      `Imported ${created} new partner${created === 1 ? '' : 's'}`
      + (updated ? `, updated ${updated}` : '')
      + (failed ? `, ${failed} failed` : ''),
    );
    setImporting(false);
    if (importRef.current) importRef.current.value = '';
    load();
  };

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return partners.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q)
        || (p.locality || '').toLowerCase().includes(q)
      );
    });
  }, [partners, filter, statusFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: partners.length };
    for (const p of partners) c[p.status] = (c[p.status] || 0) + 1;
    return c;
  }, [partners]);

  const withSanctionsFlag = partners.filter((p) => p.sanctions_flag).length;

  return (
    <PageShell>
      <PageHeader
        title="Partners"
        subtitle="NGOs in the Proximate register — nominated, endorsed, cleared"
      />
      <PageMain>
        {loading && (
          <p className="text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin inline me-2" />
            Loading partners…
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!loading && !error && (
          <div className="space-y-4">
            {/* Rollup tiles */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
                </div>
                <p className="text-3xl font-semibold">{counts.all}</p>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Cleared</p>
                </div>
                <p className="text-3xl font-semibold">{counts.dd_clear || 0}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  In review
                </p>
                <p className="text-3xl font-semibold">
                  {(counts.endorsements_open || 0) + (counts.dd_pending || 0)}
                </p>
              </Card>
              <Card className={`p-4 ${withSanctionsFlag > 0 ? 'border-destructive' : ''}`}>
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle
                    className={`w-4 h-4 ${withSanctionsFlag > 0 ? 'text-destructive' : 'text-muted-foreground'}`}
                  />
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Sanctions flags
                  </p>
                </div>
                <p className="text-3xl font-semibold">{withSanctionsFlag}</p>
              </Card>
            </div>

            {/* Filter bar */}
            <Card className="p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm" variant="outline" disabled={importing}
                  onClick={() => importRef.current?.click()}
                >
                  {importing
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin me-1" />
                    : <Upload className="w-3.5 h-3.5 me-1" />}
                  Import PIFs
                </Button>
                <input
                  ref={importRef} type="file" multiple className="hidden"
                  accept=".pdf,.docx,.doc"
                  onChange={(e) => onImport(e.target.files)}
                />
                {importNote && (
                  <span className="text-xs text-muted-foreground">{importNote}</span>
                )}
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Filter by name or locality…"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="w-full text-sm rounded-md border bg-background p-2 ps-7"
                  />
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  {['all', 'nominated', 'endorsements_open', 'dd_pending', 'dd_clear', 'suspended'].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatusFilter(s)}
                      className={`text-[11px] px-2 py-1 rounded-md border ${
                        statusFilter === s
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background hover:bg-muted/40'
                      }`}
                    >
                      {s.replace(/_/g, ' ')} ({counts[s] || 0})
                    </button>
                  ))}
                </div>
              </div>
            </Card>

            {/* Partner list */}
            <Card className="p-4">
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground italic py-8 text-center">
                  No partners match your filter.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {filtered.map((p) => (
                    <li
                      key={p.id}
                      className="border-b border-border/60 pb-1.5 last:border-b-0"
                    >
                      {/* QA 2026-07-12 (PRX-FSP-001 reachability): this used
                          to link to /proximate/admin?partner=N, but the
                          dashboard never reads that param — the click dropped
                          the partner context, and the actual partner detail
                          (Add payment route, bank verify, interventions,
                          endorsements) at /proximate/endorse/<id> was
                          unreachable by navigation. Link the real detail. */}
                      <Link
                        href={`/proximate/endorse/${p.id}`}
                        className="flex items-center gap-2 py-1.5 hover:bg-muted/30 rounded-sm px-2 -mx-2"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{p.name}</p>
                          {p.locality && (
                            <p className="text-[10px] text-muted-foreground">
                              {p.locality}
                            </p>
                          )}
                        </div>
                        {p.sanctions_flag && (
                          <Badge variant="outline" className="text-[10px] border-destructive text-destructive">
                            sanctions flag
                          </Badge>
                        )}
                        {p.trust_tier && (
                          <Badge variant="outline" className="text-[10px]">
                            {p.trust_tier}
                          </Badge>
                        )}
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${statusStyles[p.status] || ''}`}
                        >
                          {p.status.replace(/_/g, ' ')}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
      </PageMain>
    </PageShell>
  );
}
