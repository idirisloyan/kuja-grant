'use client';

/**
 * Crisis Selector skeleton — Phase 663.
 *
 * Module 3.2 from PROXIMATE_FUND_DESIGN.md, shipped as a skeleton: the
 * ranked dashboard + AI brief drafter both work; the news/signal feed
 * ingestor (the ~2-week piece) is honestly backlogged. The OB sees
 * existing crisis-monitoring rows scoped to the Proximate tenant
 * (falling back to Sudan rows from any tenant during UAT until prod
 * data lands) and can ask Claude for a scenario-typed decision brief.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Loader2, Flame, Sparkles, Plus, Radio, ClipboardCheck, Rocket,
  ArrowRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { labelForProximateStatus } from '@/lib/proximate-status-labels';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';

interface CrisisRow {
  id: number;
  report_id: number;
  country: string;
  region: string | null;
  event_type: string | null;
  event_title: string | null;
  composite_score: number | null;
  narrative: string | null;
  flagged_for_ob: boolean;
  hdi_band: string | null;
  gov_capacity_band: string | null;
  people_impacted_estimate: number | null;
  attention_band: string | null;
  report_period_start: string | null;
}

interface Resp {
  success: boolean;
  rows: CrisisRow[];
  fallback_used: boolean;
  feed_ingestor_status: string;
  scenario_types: string[];
}

// Phase 706 — Crisis signals are the OB-logged raw observations
// from /api/proximate/crisis-signals. Distinct from CrisisRow which
// is a curated CrisisMonitoringRow. Showing them on the same page
// closes the "I logged it, where did it go?" gap.
interface CrisisSignal {
  id: number;
  country: string;
  event_type: string | null;
  description: string;
  status: string;
  submitted_at: string | null;
  submitted_by_user_id: number | null;
}

interface SignalsResp {
  success: boolean;
  signals: CrisisSignal[];
}

export default function CrisisSelectorPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [briefForRow, setBriefForRow] = useState<number | null>(null);
  const [briefText, setBriefText] = useState<string>('');
  const [briefing, setBriefing] = useState(false);
  const [briefScenario, setBriefScenario] = useState<string>('strengthen');
  const [briefError, setBriefError] = useState<string | null>(null);
  // Phase 674 — manual crisis signal entry
  const [showSignalForm, setShowSignalForm] = useState(false);
  const [signalDescription, setSignalDescription] = useState('');
  const [signalEvent, setSignalEvent] = useState('');
  const [signalCountry, setSignalCountry] = useState('SDN');
  const [signalSaving, setSignalSaving] = useState(false);
  const [signalError, setSignalError] = useState<string | null>(null);
  // Phase 706 — pending signals visibility. Reviewer found that
  // logging a signal looked like nothing happened because the page
  // only re-fetched the published-rows endpoint. Now we also fetch
  // /crisis-signals after each submit and render them on top.
  const [signals, setSignals] = useState<CrisisSignal[]>([]);
  // Redesign Stage 4 — severity filter over the curated list, built
  // from the attention bands actually present (same chip pattern as
  // the rounds/disbursements registers). Red stays reserved for the
  // critical band; every other band renders amber.
  const [bandFilter, setBandFilter] = useState('all');
  useEffect(() => {
    const b = new URLSearchParams(window.location.search).get('band');
    if (b) setBandFilter(b);
  }, []);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (bandFilter && bandFilter !== 'all') sp.set('band', bandFilter);
    else sp.delete('band');
    const qs = sp.toString();
    window.history.replaceState(
      null, '', window.location.pathname + (qs ? `?${qs}` : ''),
    );
  }, [bandFilter]);
  const bandCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of data?.rows ?? []) {
      if (r.attention_band) c[r.attention_band] = (c[r.attention_band] || 0) + 1;
    }
    return c;
  }, [data]);
  const visibleRows = useMemo(
    () => (data?.rows ?? []).filter(
      (r) => bandFilter === 'all' || r.attention_band === bandFilter,
    ),
    [data, bandFilter],
  );

  async function logSignal() {
    if (!signalDescription.trim() || signalDescription.trim().length < 5) {
      setSignalError(t('proximate.crisis_signal.description_required'));
      return;
    }
    setSignalSaving(true);
    setSignalError(null);
    try {
      await api.post('/api/proximate/crisis-signals', {
        country: signalCountry,
        event_type: signalEvent || undefined,
        description: signalDescription,
      });
      setSignalDescription('');
      setSignalEvent('');
      setShowSignalForm(false);
      // Reload to refresh row list.
      load();
    } catch (e: unknown) {
      setSignalError(e instanceof Error ? e.message : 'failed');
    } finally {
      setSignalSaving(false);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Phase 706 — fetch both endpoints in parallel: published rows
      // (curated) AND raw signals (OB-logged observations). Either
      // failing is non-fatal for the other.
      const [rowsR, signalsR] = await Promise.allSettled([
        api.get<Resp>('/api/proximate/crisis-selector'),
        api.get<SignalsResp>('/api/proximate/crisis-signals'),
      ]);
      if (rowsR.status === 'fulfilled') setData(rowsR.value);
      else throw rowsR.reason;
      if (signalsR.status === 'fulfilled') {
        setSignals(signalsR.value.signals || []);
      } else {
        // Signal-endpoint failure shouldn't break the page.
        setSignals([]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function draftBrief(rowId: number, scenario: string) {
    setBriefing(true);
    setBriefError(null);
    setBriefForRow(rowId);
    setBriefScenario(scenario);
    setBriefText('');
    try {
      const r = await api.post<{ brief: string }>(
        `/api/proximate/crisis-selector/${rowId}/brief`,
        { scenario_type: scenario },
      );
      setBriefText(r.brief);
    } catch (e: unknown) {
      setBriefError(e instanceof Error ? e.message : 'brief failed');
    } finally {
      setBriefing(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title={t('proximate.crisis_selector.title')}
        subtitle={t('proximate.crisis_selector.subtitle')}
        icon={Flame}
      />
      <PageMain>
        {/* What is this page? UAT 2026-06-30: "Crisis selector is poor.
            Not clear what it is or how it works." Answer the three
            questions before showing any data. */}
        <div className="prox-panel" style={{ padding: '16px 18px', background: 'var(--prox-surface-2)' }}>
          <p className="text-sm mb-1" style={{ fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif', fontWeight: 700 }}>
            {t('proximate.crisis_selector.explainer_title')}
          </p>
          <p className="text-xs mb-3" style={{ color: 'var(--prox-muted)' }}>
            {t('proximate.crisis_selector.explainer_body')}
          </p>
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: 'var(--prox-surface)', border: '1px solid var(--prox-line)' }}>
              <Radio className="w-3 h-3" style={{ color: 'var(--prox-warn)' }} />
              {t('proximate.crisis_selector.step_signal')}
            </span>
            <ArrowRight className="w-3 h-3 rtl:rotate-180" style={{ color: 'var(--prox-muted)' }} />
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: 'var(--prox-surface)', border: '1px solid var(--prox-line)' }}>
              <ClipboardCheck className="w-3 h-3" style={{ color: 'var(--prox-accent)' }} />
              {t('proximate.crisis_selector.step_review')}
            </span>
            <ArrowRight className="w-3 h-3 rtl:rotate-180" style={{ color: 'var(--prox-muted)' }} />
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: 'var(--prox-surface)', border: '1px solid var(--prox-line)' }}>
              <Rocket className="w-3 h-3" style={{ color: 'var(--prox-good)' }} />
              {t('proximate.crisis_selector.step_round')}
            </span>
          </div>
        </div>

        {data?.fallback_used && (
          <div className="prox-panel" style={{ padding: '12px 14px', borderColor: 'var(--prox-warn)', background: 'var(--prox-warn-tint)' }}>
            <p className="text-xs" style={{ color: 'var(--prox-warn)' }}>
              {t('proximate.crisis_selector.fallback_note')}
            </p>
          </div>
        )}

        {/* Phase 674 — manual crisis signal entry */}
        <div className="prox-panel space-y-3" style={{ padding: '16px 18px' }}>
          {!showSignalForm ? (
            <button type="button" className="prox-btn ghost" style={{ height: 34, fontSize: 12.5 }} onClick={() => setShowSignalForm(true)}>
              <Plus className="w-3.5 h-3.5" />
              {t('proximate.crisis_signal.log_signal')}
            </button>
          ) : (
            <div className="space-y-3">
              <h3 className="text-sm" style={{ fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif', fontWeight: 700 }}>{t('proximate.crisis_signal.heading')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                <input
                  type="text"
                  value={signalCountry}
                  onChange={(e) => setSignalCountry(e.target.value.toUpperCase().slice(0, 3))}
                  placeholder="SDN"
                  className="px-3 py-2 bg-background border border-border rounded-md font-mono"
                />
                <input
                  type="text"
                  value={signalEvent}
                  onChange={(e) => setSignalEvent(e.target.value)}
                  placeholder={t('proximate.crisis_signal.event_type_placeholder')}
                  className="sm:col-span-2 px-3 py-2 bg-background border border-border rounded-md"
                />
              </div>
              <textarea
                value={signalDescription}
                onChange={(e) => setSignalDescription(e.target.value)}
                rows={3}
                maxLength={5000}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md"
                placeholder={t('proximate.crisis_signal.description_placeholder')}
              />
              {signalError && (
                <p className="text-xs" style={{ color: 'var(--prox-danger)' }}>{signalError}</p>
              )}
              <div className="flex gap-2">
                <button type="button" className="prox-btn primary" style={{ height: 36, fontSize: 12.5 }} onClick={logSignal} disabled={signalSaving}>
                  {signalSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  {t('proximate.crisis_signal.log')}
                </button>
                <button type="button" className="prox-btn ghost" style={{ height: 36, fontSize: 12.5 }} onClick={() => setShowSignalForm(false)}>
                  {t('proximate.crisis_signal.cancel')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Phase 706 — pending crisis signals (raw OB-logged
            observations). Reviewer flagged the signal entry felt
            dead — submit succeeded but nothing showed up. Now it's
            right here above the curated rows. */}
        {signals.length > 0 && (
          <div className="prox-panel space-y-2" style={{ padding: '16px 18px' }}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm" style={{ fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif', fontWeight: 700 }}>
                {t('proximate.crisis_signal.pending_heading')
                  || 'Pending signals'} ({signals.length})
              </p>
              <p className="prox-eyebrow">
                {t('proximate.crisis_signal.pending_subline')
                  || 'OB-logged. Triage to publish.'}
              </p>
            </div>
            <ul className="space-y-1.5">
              {signals.slice(0, 8).map((sig) => (
                <li key={sig.id} className="text-xs flex items-start gap-2">
                  <span
                    className={`prox-pill ${
                      sig.status === 'pending'
                        ? 'warn'
                        : sig.status === 'triaged'
                          ? 'good'
                          : 'slate'
                    }`}
                    style={{ marginTop: 2 }}
                  >
                    {labelForProximateStatus(sig.status, t)}
                  </span>
                  <span className="prox-mono" style={{ color: 'var(--prox-muted)' }}>
                    {sig.country}
                  </span>
                  {sig.event_type && (
                    <span className="text-muted-foreground">
                      · {sig.event_type}
                    </span>
                  )}
                  <span className="flex-1 line-clamp-2">{sig.description}</span>
                  {sig.submitted_at && (
                    <span className="text-muted-foreground whitespace-nowrap text-[10px]">
                      {new Date(sig.submitted_at).toLocaleDateString()}
                    </span>
                  )}
                  <Link
                    href={`/proximate/rounds/new?trigger=disaster&title=${encodeURIComponent(
                      `${sig.country} — ${(sig.event_type || 'emergency response')}`,
                    )}&summary=${encodeURIComponent(sig.description.slice(0, 500))}&region=${encodeURIComponent(sig.country)}`}
                    className="text-[10px] hover:underline whitespace-nowrap inline-flex items-center gap-0.5"
                    style={{ color: 'var(--prox-accent)', fontWeight: 600 }}
                  >
                    <Rocket className="w-3 h-3" />
                    {t('proximate.crisis_signal.start_round')}
                  </Link>
                </li>
              ))}
            </ul>
            {signals.length > 8 && (
              <p className="text-[10px] text-muted-foreground">
                +{signals.length - 8} {t('proximate.crisis_signal.more') || 'more'}
              </p>
            )}
          </div>
        )}

        {loading && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            {t('proximate.crisis_selector.loading')}
          </p>
        )}

        {error && <p className="text-sm" style={{ color: 'var(--prox-danger)' }}>{error}</p>}

        {!loading && data && data.rows.length === 0 && (
          <div className="prox-panel text-center" style={{ padding: '24px' }}>
            <p className="text-sm text-muted-foreground">
              {t('proximate.crisis_selector.empty')}
            </p>
          </div>
        )}

        {(data?.rows.length ?? 0) > 0 && Object.keys(bandCounts).length > 1 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {['all', ...Object.keys(bandCounts)].map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBandFilter(b)}
                className="text-xs px-2.5 py-1 rounded-full transition-colors"
                style={bandFilter === b
                  ? { background: 'var(--prox-accent)', color: '#fff', border: '1px solid var(--prox-accent)' }
                  : { background: 'var(--prox-surface)', color: 'var(--prox-muted)', border: '1px solid var(--prox-line)' }}
              >
                {b === 'all'
                  ? `All (${data?.rows.length ?? 0})`
                  : `${labelForProximateStatus(b, t)} (${bandCounts[b]})`}
              </button>
            ))}
          </div>
        )}

        <ul className="space-y-3">
          {visibleRows.map((row) => (
            <li key={row.id}>
              <div className="prox-panel space-y-3" style={{ padding: '16px 18px' }}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 style={{ fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif', fontWeight: 700, fontSize: 15 }}>
                        {row.country}{row.region && ` · ${row.region}`}
                      </h3>
                      {row.attention_band && (
                        <span
                          className={`prox-pill ${
                            row.attention_band === 'critical' ? 'danger' : 'warn'
                          }`}
                        >
                          {labelForProximateStatus(row.attention_band, t)}
                        </span>
                      )}
                      {row.flagged_for_ob && (
                        <span className="prox-pill danger">
                          {t('proximate.crisis_selector.flagged')}
                        </span>
                      )}
                      {row.report_period_start && (
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(row.report_period_start).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {row.event_title && (
                      <p className="text-sm mt-1">{row.event_title}</p>
                    )}
                    {row.narrative && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-3">
                        {row.narrative}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="prox-mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--prox-ink)' }}>
                      {row.composite_score ?? '—'}
                    </div>
                    <div className="prox-eyebrow">
                      {t('proximate.crisis_selector.urgency')}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap pt-2" style={{ borderTop: '1px solid var(--prox-line)' }}>
                  <Link
                    href={`/proximate/rounds/new?trigger=disaster&title=${encodeURIComponent(
                      row.event_title || `${row.country} emergency response`,
                    )}&summary=${encodeURIComponent(
                      (row.narrative || row.event_title || '').slice(0, 500),
                    )}&region=${encodeURIComponent(row.region || row.country || '')}`}
                    className="prox-btn primary"
                    style={{ height: 30, fontSize: 12, padding: '0 12px' }}
                  >
                    <Rocket className="w-3 h-3" />
                    {t('proximate.crisis_selector.start_round')}
                  </Link>
                  <span className="text-xs text-muted-foreground ms-1">
                    {t('proximate.crisis_selector.draft_brief_as')}:
                  </span>
                  {(data?.scenario_types || []).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="prox-btn ghost"
                      style={{ height: 30, fontSize: 12, padding: '0 11px' }}
                      onClick={() => draftBrief(row.id, s)}
                      disabled={briefing}
                    >
                      {briefing && briefForRow === row.id && briefScenario === s
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Sparkles className="w-3 h-3" />
                      }
                      {t(`proximate.crisis_selector.scenario_${s}`)}
                    </button>
                  ))}
                </div>

                {briefForRow === row.id && briefText && (
                  <div className="prox-panel" style={{ padding: '12px 13px', background: 'var(--prox-inset)', borderStyle: 'dashed' }}>
                    <p className="prox-eyebrow mb-1">
                      {t('proximate.crisis_selector.brief_label')} · {briefScenario}
                    </p>
                    <pre className="whitespace-pre-wrap text-xs font-sans">{briefText}</pre>
                  </div>
                )}
                {briefForRow === row.id && briefError && (
                  <p className="text-xs" style={{ color: 'var(--prox-danger)' }}>{briefError}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </PageMain>
    </PageShell>
  );
}
