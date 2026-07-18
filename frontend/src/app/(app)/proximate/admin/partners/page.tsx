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
  SlidersHorizontal,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { labelForProximateStatus } from '@/lib/proximate-status-labels';
import { TONE_CLASSES, toneForProximateStatus } from '@/components/proximate/status-badge';
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

const PAGE_SIZE = 30;

export default function ProximatePartnersPage() {
  const { t } = useTranslation();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  // Redesign Stage 3c — the register must stay usable as the partner
  // count grows: incremental loading instead of one endless page, sort
  // control, and filter chips behind a toggle on small screens.
  const [sort, setSort] = useState<'name' | 'newest'>('name');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Blue Nile intake (2026-07) — bulk PIF import. One Word/PDF form in,
  // one nominated partner out (AI-extracted server-side), original
  // attached as due-diligence evidence.
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const load = () => {
    api.get<{ success: boolean; partners: Partner[] }>('/api/proximate/partners')
      .then((r) => setPartners(r.partners || []))
      .catch(() => setError(t('proximate.partners.load_failed')))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Redesign Stage 2 — filters live in the URL so a filtered view
  // survives refresh and can be shared. Read once on mount, write via
  // history.replaceState (no useSearchParams — static export has no
  // Suspense boundary here, and no navigation should fire per keystroke).
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const s = sp.get('status');
    const q = sp.get('q');
    if (s) setStatusFilter(s);
    if (q) setFilter(q);
  }, []);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (statusFilter && statusFilter !== 'all') sp.set('status', statusFilter);
    else sp.delete('status');
    if (filter) sp.set('q', filter);
    else sp.delete('q');
    const qs = sp.toString();
    window.history.replaceState(
      null, '', window.location.pathname + (qs ? `?${qs}` : ''),
    );
  }, [statusFilter, filter]);

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

  const sorted = useMemo(() => {
    const list = [...filtered];
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else list.sort((a, b) => b.id - a.id);
    return list;
  }, [filtered, sort]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [filter, statusFilter, sort]);

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
        subtitle={t('proximate.partners.subtitle')}
      />
      <PageMain>
        {loading && (
          <p className="text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin inline me-2" />
            {t('proximate.partners.loading')}
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!loading && !error && (
          <div className="space-y-4">
            {/* Rollup tiles — compact stat row (Stage 3c): the spec calls
                for a summary strip, not oversized cards. */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Card className="p-3">
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('proximate.partners.total')}</p>
                </div>
                <p className="text-xl font-semibold">{counts.all}</p>
              </Card>
              <Card className="p-3">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('proximate.partners.cleared')}</p>
                </div>
                <p className="text-xl font-semibold">{counts.dd_clear || 0}</p>
              </Card>
              <Card className="p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t('proximate.partners.in_review')}
                </p>
                <p className="text-xl font-semibold">
                  {(counts.endorsements_open || 0) + (counts.dd_pending || 0)}
                </p>
              </Card>
              <Card className={`p-3 ${withSanctionsFlag > 0 ? 'border-destructive' : ''}`}>
                <div className="flex items-center gap-1.5">
                  <AlertTriangle
                    className={`w-3.5 h-3.5 ${withSanctionsFlag > 0 ? 'text-destructive' : 'text-muted-foreground'}`}
                  />
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {t('proximate.partners.sanctions_flags')}
                  </p>
                </div>
                <p className="text-xl font-semibold">{withSanctionsFlag}</p>
              </Card>
            </div>

            {/* Filter bar */}
            <Card className="p-3">
              <div className="flex items-center gap-2 flex-wrap">
                {/* QA 2026-07-15: the nomination form existed at
                    /proximate/admin/partners/new but nothing linked to
                    it — same navigation dead-end class as PRX-FSP-001. */}
                <Link
                  href="/proximate/admin/partners/new"
                  className="inline-flex items-center gap-1 rounded-md border bg-background hover:bg-muted/40 text-sm px-3 py-1.5 font-medium"
                >
                  {t('proximate.partners.nominate')}
                </Link>
                <Button
                  size="sm" variant="outline" disabled={importing}
                  onClick={() => importRef.current?.click()}
                >
                  {importing
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin me-1" />
                    : <Upload className="w-3.5 h-3.5 me-1" />}
                  {t('proximate.partners.import_pifs')}
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
                    placeholder={t('proximate.partners.filter_placeholder')}
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="w-full text-sm rounded-md border bg-background p-2 ps-7"
                  />
                </div>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as 'name' | 'newest')}
                  className="text-xs rounded-md border bg-background px-2 py-1.5"
                >
                  <option value="name">{t('proximate.partners.sort_name')}</option>
                  <option value="newest">{t('proximate.partners.sort_newest')}</option>
                </select>
                <Button
                  size="sm" variant="outline" className="sm:hidden"
                  onClick={() => setFiltersOpen((v) => !v)}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 me-1" />
                  {t('proximate.partners.filters')}
                  {statusFilter !== 'all' ? ' (1)' : ''}
                </Button>
                <div className={`${filtersOpen ? 'flex' : 'hidden'} sm:flex items-center gap-1 flex-wrap w-full sm:w-auto`}>
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
                      {s === 'all' ? 'All' : labelForProximateStatus(s, t)} ({counts[s] || 0})
                    </button>
                  ))}
                </div>
              </div>
            </Card>

            {/* Partner list */}
            <Card className="p-4">
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground italic py-8 text-center">
                  {t('proximate.partners.no_match')}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {sorted.slice(0, visibleCount).map((p) => (
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
                        {/* Collapsed row shows one workflow status + one
                            secondary signal (sanctions). Trust tier and the
                            rest live on the partner detail. */}
                        {p.sanctions_flag && (
                          <Badge variant="outline" className="text-[10px] border-destructive text-destructive">
                            {t('proximate.partners.sanctions_flag_badge')}
                          </Badge>
                        )}
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${TONE_CLASSES[toneForProximateStatus(p.status)]}`}
                        >
                          {labelForProximateStatus(p.status, t)}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {sorted.length > visibleCount && (
                <div className="pt-3 text-center">
                  <Button
                    size="sm" variant="outline"
                    onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  >
                    {t('proximate.partners.show_more')} ({sorted.length - visibleCount})
                  </Button>
                </div>
              )}
            </Card>
          </div>
        )}
      </PageMain>
    </PageShell>
  );
}
