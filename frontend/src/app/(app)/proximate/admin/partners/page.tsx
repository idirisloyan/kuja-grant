'use client';

/**
 * Proximate partners list — Phase 722.
 *
 * Fixes a UX bug where sidebar "Partners" pointed at /proximate/admin
 * (same as Operator dashboard). Partners now has its own destination
 * with real filtering + drill-in.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { isTestRecord, splitTestRecords } from '@/lib/test-records';
import { TestDataToggle } from '@/components/proximate/test-data-toggle';
import { useUIStore } from '@/stores/ui-store';
import Link from 'next/link';
import {
  Loader2, Search, Users, ShieldCheck, AlertTriangle, Upload,
  SlidersHorizontal, ChevronRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { Card } from '@/components/ui/card';
import { labelForProximateStatus } from '@/lib/proximate-status-labels';
import { proxPillForStatus } from '@/components/proximate/status-badge';
import { EmptyState } from '@/components/proximate/empty-state';
import { Button } from '@/components/ui/button';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';

// Partner workflow status → design-system pill tone.

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
const SAVED_FILTERS_KEY = 'kuja_partner_saved_filters_v1';

// The clickable summary tiles filter by more than one raw status: "In review"
// is endorsements-open OR due-diligence-pending, and "Sanctions" is a flag, not
// a status. One matcher keeps the tile, chip, and count logic honest and in
// agreement, so a tile never promises more rows than clicking it delivers.
function partnerMatchesStatus(
  p: { status: string; sanctions_flag: boolean }, sf: string,
): boolean {
  if (sf === 'all') return true;
  if (sf === 'in_review') return p.status === 'endorsements_open' || p.status === 'dd_pending';
  if (sf === 'sanctions') return p.sanctions_flag;
  return p.status === sf;
}

// The one thing to DO for a partner at each status — so a row reads as a next
// step, not just a state. All resolve to the same partner workspace; the verb
// is what tells Khalid/Marwa why they'd open it. English fallback lives beside
// the key so a missing translation never renders a raw i18n key.
const NEXT_ACTION: Record<string, { key: string; en: string }> = {
  nominated: { key: 'proximate.partners.next.nominated', en: 'Start endorsements' },
  endorsements_open: { key: 'proximate.partners.next.endorsements_open', en: 'Continue review' },
  dd_pending: { key: 'proximate.partners.next.dd_pending', en: 'Complete due diligence' },
  dd_clear: { key: 'proximate.partners.next.dd_clear', en: 'Ready for award' },
  suspended: { key: 'proximate.partners.next.suspended', en: 'Review suspension' },
};

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
  // Fixtures hidden by default — see lib/test-records.ts. ONE persisted flag
  // shared by every register (PFX-SEP02-GLOBAL-004); the count stays visible
  // so nothing disappears without the user being told.
  const showTest = useUIStore((s) => s.showTestData);
  // Redesign spec "saved filters where practical" — named search+status
  // combos persisted per-device in localStorage. Presentation only; the
  // saved entry just replays the same URL-backed filter state.
  const [savedFilters, setSavedFilters] = useState<
    { label: string; status: string; q: string }[]
  >([]);
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
    try {
      const raw = window.localStorage.getItem(SAVED_FILTERS_KEY);
      if (raw) setSavedFilters(JSON.parse(raw));
    } catch { /* corrupted store — start empty */ }
  }, []);

  const persistSaved = (next: { label: string; status: string; q: string }[]) => {
    setSavedFilters(next);
    try {
      window.localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(next));
    } catch { /* storage full/unavailable — chips just don't persist */ }
  };

  const saveCurrentFilter = () => {
    const label = [
      statusFilter !== 'all' ? labelForProximateStatus(statusFilter, t) : '',
      filter.trim(),
    ].filter(Boolean).join(' · ');
    if (!label) return;
    const next = [
      ...savedFilters.filter((f) => f.label !== label),
      { label, status: statusFilter, q: filter.trim() },
    ].slice(-6);
    persistSaved(next);
  };
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

  const { real: realPartners, test: testPartners } = useMemo(
    () => splitTestRecords(partners, (p) => p.name),
    [partners],
  );

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const base = showTest ? partners : realPartners;
    return base.filter((p) => {
      if (!partnerMatchesStatus(p, statusFilter)) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q)
        || (p.locality || '').toLowerCase().includes(q)
      );
    });
  }, [partners, realPartners, showTest, filter, statusFilter]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else list.sort((a, b) => b.id - a.id);
    return list;
  }, [filtered, sort]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [filter, statusFilter, sort]);

  // Counted over the same set the register shows, so a chip never promises
  // more rows than clicking it delivers.
  const counted = showTest ? partners : realPartners;
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: counted.length };
    for (const p of counted) c[p.status] = (c[p.status] || 0) + 1;
    return c;
  }, [counted]);

  const withSanctionsFlag = counted.filter((p) => p.sanctions_flag).length;

  return (
    <PageShell>
      <PageHeader
        title={t('proximate.partners.title')}
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
            {/* Rollup tiles — compact stat row (Stage 3c), now clickable
                filters (Khalid/Marwa review, Aug 2026: "summary cards should
                be clickable filters"). Clicking a tile narrows the register
                below to that group; the active tile carries a ring so it is
                obvious which slice you are looking at. Total clears back to
                everything. */}
            {/* Phone: the same four filters as one summary line, so search and
                the register are reachable without scrolling past four tiles
                (PFX-SEP02-PARTNERS-001). */}
            <div className="sm:hidden flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px]" style={{ color: 'var(--prox-muted)' }}>
              {([
                ['all', counts.all, t('proximate.partners.total'), undefined],
                ['in_review', (counts.endorsements_open || 0) + (counts.dd_pending || 0), t('proximate.partners.in_review'), undefined],
                ['dd_clear', counts.dd_clear || 0, t('proximate.partners.cleared'), 'var(--prox-good)'],
                ['sanctions', withSanctionsFlag, t('proximate.partners.sanctions_flags'), withSanctionsFlag > 0 ? 'var(--prox-danger)' : undefined],
              ] as [string, number, string, string | undefined][]).map(([key, n, label, color], i) => (
                <span key={key} className="inline-flex items-center gap-1.5">
                  {i > 0 && <span aria-hidden="true">·</span>}
                  <button
                    type="button"
                    onClick={() => setStatusFilter(key)}
                    aria-pressed={statusFilter === key}
                    className="inline-flex items-center gap-1 rounded-md px-1 -mx-1"
                    style={{
                      minHeight: 36,
                      ...(statusFilter === key
                        ? { color: 'var(--prox-ink)', textDecoration: 'underline', textUnderlineOffset: 3 }
                        : undefined),
                    }}
                  >
                    <b className="prox-num" style={{ color: color ?? 'var(--prox-ink)' }}>{n}</b>
                    <span>{label.toLowerCase()}</span>
                  </button>
                </span>
              ))}
            </div>
            <div className="hidden sm:grid sm:grid-cols-4 gap-2.5">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                aria-pressed={statusFilter === 'all'}
                title={t('proximate.partners.filter_to_total')}
                className="prox-stat text-start"
                style={statusFilter === 'all' ? { borderColor: 'var(--prox-accent)', boxShadow: '0 0 0 1px var(--prox-accent)' } : undefined}
              >
                <div className="lab"><Users className="w-3.5 h-3.5" /> {t('proximate.partners.total')}</div>
                <div className="val prox-num">{counts.all}</div>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('dd_clear')}
                aria-pressed={statusFilter === 'dd_clear'}
                title={t('proximate.partners.filter_to_cleared')}
                className="prox-stat text-start"
                style={statusFilter === 'dd_clear' ? { borderColor: 'var(--prox-accent)', boxShadow: '0 0 0 1px var(--prox-accent)' } : undefined}
              >
                <div className="lab"><ShieldCheck className="w-3.5 h-3.5" style={{ color: 'var(--prox-good)' }} /> {t('proximate.partners.cleared')}</div>
                <div className="val prox-num" style={{ color: 'var(--prox-good)' }}>{counts.dd_clear || 0}</div>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('in_review')}
                aria-pressed={statusFilter === 'in_review'}
                title={t('proximate.partners.filter_to_in_review')}
                className="prox-stat text-start"
                style={statusFilter === 'in_review' ? { borderColor: 'var(--prox-accent)', boxShadow: '0 0 0 1px var(--prox-accent)' } : undefined}
              >
                <div className="lab">{t('proximate.partners.in_review')}</div>
                <div className="val prox-num">{(counts.endorsements_open || 0) + (counts.dd_pending || 0)}</div>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('sanctions')}
                aria-pressed={statusFilter === 'sanctions'}
                title={t('proximate.partners.filter_to_sanctions')}
                className={`prox-stat text-start${withSanctionsFlag > 0 ? ' alert' : ''}`}
                style={statusFilter === 'sanctions' ? { borderColor: 'var(--prox-accent)', boxShadow: '0 0 0 1px var(--prox-accent)' } : undefined}
              >
                <div className="lab">
                  <AlertTriangle className="w-3.5 h-3.5" style={{ color: withSanctionsFlag > 0 ? 'var(--prox-danger)' : 'var(--prox-muted)' }} />
                  {t('proximate.partners.sanctions_flags')}
                </div>
                <div className="val prox-num" style={withSanctionsFlag > 0 ? { color: 'var(--prox-danger)' } : undefined}>{withSanctionsFlag}</div>
              </button>
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
                  <Search className="w-3.5 h-3.5 absolute start-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
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
                      className="text-[11px] px-2.5 py-1 rounded-md border transition-colors"
                      style={statusFilter === s
                        ? { background: 'var(--prox-accent)', color: '#fff', borderColor: 'transparent' }
                        : { background: 'var(--prox-surface)', color: 'var(--prox-muted)', borderColor: 'var(--prox-line-2)' }}
                    >
                      {s === 'all' ? t('common.all') : labelForProximateStatus(s, t)} ({counts[s] || 0})
                    </button>
                  ))}
                </div>
                {/* Saved filters row: replay a named search+status combo. */}
                {(savedFilters.length > 0 || statusFilter !== 'all' || filter.trim()) && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    {savedFilters.map((f) => (
                      <span
                        key={f.label}
                        className="inline-flex items-center rounded-md border bg-muted/40 text-[11px]"
                      >
                        <button
                          type="button"
                          onClick={() => { setStatusFilter(f.status); setFilter(f.q); }}
                          className="px-2 py-1 hover:underline"
                          title={t('proximate.partners.apply_saved')}
                        >
                          {f.label}
                        </button>
                        <button
                          type="button"
                          onClick={() => persistSaved(savedFilters.filter((x) => x.label !== f.label))}
                          className="px-1.5 py-1 text-muted-foreground hover:text-destructive"
                          aria-label={`${t('proximate.partners.remove_saved')}: ${f.label}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    {(statusFilter !== 'all' || filter.trim()) && (
                      <button
                        type="button"
                        onClick={saveCurrentFilter}
                        className="text-[11px] px-2 py-1 rounded-md border border-dashed text-muted-foreground hover:text-foreground hover:bg-muted/40"
                      >
                        {t('proximate.partners.save_filter')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </Card>

            <TestDataToggle count={testPartners.length} className="mb-2" />

            {/* Partner list */}
            {filtered.length === 0 ? (
              <Card>
                <EmptyState compact icon={Search} title={t('proximate.partners.no_match')} />
              </Card>
            ) : (
              <div className="prox-panel overflow-hidden">
                {sorted.slice(0, visibleCount).map((p, i) => (
                  /* QA 2026-07-12 (PRX-FSP-001 reachability): link the real
                     partner detail at /proximate/endorse/<id>, not the
                     dashboard, which drops the partner context. */
                  <Link
                    key={p.id}
                    href={`/proximate/endorse/${p.id}`}
                    className="prox-qrow"
                    style={i === 0 ? { borderTop: 0 } : undefined}
                  >
                    <div className="min-w-0">
                      {/* Two lines, not an ellipsis — the name is what
                          distinguishes two partners (PFX-SEP02-PARTNERS-002). */}
                      <strong className="line-clamp-2" style={{ fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif', fontSize: 14 }}>
                        {p.name}
                        {isTestRecord(p.name) && (
                          <span className="prox-pill slate" style={{ marginInlineStart: 6, verticalAlign: 'middle' }}>
                            {t('common.test_record')}
                          </span>
                        )}
                      </strong>
                      {p.locality && <small className="block truncate">{p.locality}</small>}
                    </div>
                    {/* Collapsed row: one workflow status + sanctions signal. */}
                    <div className="flex items-center gap-1.5">
                      {p.sanctions_flag && (
                        <span className="prox-pill danger">{t('proximate.partners.sanctions_flag_badge')}</span>
                      )}
                      <span className={`prox-pill ${proxPillForStatus(p.status)}`}>
                        {labelForProximateStatus(p.status, t)}
                      </span>
                    </div>
                    {/* The one thing to do next — reads as a step, not a state. */}
                    {(() => {
                      const na = NEXT_ACTION[p.status];
                      if (!na) return <span />;
                      const resolved = t(na.key);
                      const label = resolved === na.key ? na.en : resolved;
                      return (
                        <span className="hidden sm:inline-flex items-center gap-0.5 text-[11px] shrink-0" style={{ color: 'var(--prox-muted)' }}>
                          {label}
                          <ChevronRight className="w-3 h-3" />
                        </span>
                      );
                    })()}
                  </Link>
                ))}
                {sorted.length > visibleCount && (
                  <div className="py-3 text-center" style={{ borderTop: '1px solid var(--prox-line)' }}>
                    <Button
                      size="sm" variant="outline"
                      onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    >
                      {t('proximate.partners.show_more')} ({sorted.length - visibleCount})
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </PageMain>
    </PageShell>
  );
}
