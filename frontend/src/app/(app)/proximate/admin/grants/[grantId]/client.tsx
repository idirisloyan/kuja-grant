'use client';

/**
 * Grant detail — Phase 721.
 *
 * Terms, allocations, reports history, next-report tile.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Loader2, FileText, Calendar, DollarSign, AlertCircle, CheckCircle2, MapPin,
  Target, Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useProximatePersona } from '@/lib/hooks/use-proximate-persona';
import { useTranslation } from '@/lib/hooks/use-translation';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';

interface GrantResp {
  success: boolean;
  grant: {
    id: number;
    title: string;
    donor_name: string | null;
    donor_grant_ref: string | null;
    amount_committed_usd: number | null;
    amount_received_usd: number;
    amount_allocated_usd: number;
    amount_remaining_usd: number;
    currency: string;
    start_date: string | null;
    end_date: string | null;
    reporting_cadence: string;
    reporting_next_due_at: string | null;
    restrictions: {
      geographies?: string[];
      sectors?: string[];
      purpose?: string;
    };
    has_signed_pdf: boolean;
    status: string;
    extracted?: Record<string, unknown>;
  };
  allocations: {
    id: number;
    round_id: number;
    grant_id: number;
    amount_usd: number;
    notes: string | null;
    round_title: string;
    round_status: string | null;
  }[];
  reports: ReportRow[];
}

interface RequirementScore {
  requirement_id: string;
  requirement: string;
  score: number;
  verdict: 'met' | 'partial' | 'missing';
  why: string;
}

interface ReportRow {
  id: number;
  report_type: string;
  period_start: string | null;
  period_end: string | null;
  due_date: string | null;
  status: string;
  compliance_score: RequirementScore[];
  submitted_at: string | null;
  donor_ack_at: string | null;
  content?: Record<string, string>;
}

interface DeliverableProgress {
  index: number;
  title: string | null;
  target: number | null;
  unit: string | null;
  current: number | null;
  source: string;
  pct: number | null;
}

function ReportActions({ r, draftingId, onDraft, onEdit }: {
  r: ReportRow;
  draftingId: number | null;
  onDraft: (id: number) => void;
  onEdit: (r: ReportRow) => void;
}) {
  const hasContent = !!r.content && Object.keys(r.content).length > 0;
  const { t } = useTranslation();
  return (
    <span className="flex items-center gap-1">
      <button
        onClick={() => onDraft(r.id)}
        disabled={draftingId !== null}
        className="prox-btn ghost disabled:opacity-50"
        style={{ height: 26, fontSize: 11, padding: '0 8px', gap: 5 }}
        title={t('prox_grant.draft_report_tooltip')}
      >
        {draftingId === r.id
          ? <Loader2 className="w-3 h-3 animate-spin" />
          : <Sparkles className="w-3 h-3" />}
        {hasContent ? t('prox_grant.re_draft') : t('prox_grant.draft_with_ai')}
      </button>
      {hasContent && (
        <button
          onClick={() => onEdit(r)}
          className="prox-btn ghost"
          style={{ height: 26, fontSize: 11, padding: '0 8px' }}
        >
          {t('common.edit')}
        </button>
      )}
    </span>
  );
}

function avgScore(scores: RequirementScore[]): number | null {
  if (!scores?.length) return null;
  return Math.round(scores.reduce((a, s) => a + (s.score || 0), 0) / scores.length);
}

// Score → design-system pill tone (emerald→good, amber→warn, rose→danger).
function scorePillTone(v: number): string {
  if (v >= 80) return 'good';
  if (v >= 55) return 'warn';
  return 'danger';
}

function fmtUsd(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

// Report status → design-system pill tone (sky→acc, emerald→good, rose→danger).
const reportStatusTone: Record<string, string> = {
  pending: 'slate',
  drafting: 'warn',
  submitted: 'acc',
  accepted: 'good',
  revision_requested: 'danger',
};

export function ProximateGrantDetailClient() {
  // Phase 725 — useParams() returns the pre-generated static stub ('0')
  // under output:export, so any real grantId in the URL was being
  // shadowed and the client fetched /grants/0. Read directly from
  // window.location.pathname instead — same pattern as the working
  // /proximate/rounds/[roundId] detail page.
  const [grantId, setGrantId] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    const m = window.location.pathname.match(/\/grants\/(\d+)/);
    return m ? m[1] : '';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const m = window.location.pathname.match(/\/grants\/(\d+)/);
    if (m && m[1] !== '0' && m[1] !== grantId) setGrantId(m[1]);
  }, [grantId]);

  const [data, setData] = useState<GrantResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { persona } = useProximatePersona();
  const { t } = useTranslation();
  const isOb = persona === 'ob' || persona === 'admin';

  // Localize a system enum via `<prefix>.<value>`, falling back to the raw
  // value for anything the catalog doesn't cover (e.g. AI-extracted sectors).
  const enumLabel = (prefix: string, val: string): string => {
    if (!val) return val;
    const k = `${prefix}.${val}`;
    const v = t(k);
    return v && v !== k ? v : val;
  };

  // Phase 721d — deliverables vs targets + report scoring
  const [deliverables, setDeliverables] = useState<DeliverableProgress[]>([]);
  const [scoringId, setScoringId] = useState<number | null>(null);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');

  const loadAll = useCallback(() => {
    if (!grantId || grantId === '0') return;
    api.get<GrantResp>(`/api/proximate/grants/${grantId}`)
      .then((r) => setData(r))
      .catch(() => setError(t('prox_grant.failed_load_grant')))
      .finally(() => setLoading(false));
    api.get<{ success: boolean; deliverables: DeliverableProgress[] }>(
      `/api/proximate/grants/${grantId}/compliance`,
    )
      .then((r) => setDeliverables(r.deliverables || []))
      .catch(() => {});
  }, [grantId, t]);

  useEffect(() => {
    setLoading(true);
    loadAll();
  }, [loadAll]);

  async function scoreReport(reportId: number) {
    setScoringId(reportId);
    setScoreError(null);
    try {
      await api.post(
        `/api/proximate/grants/${grantId}/reports/${reportId}/score`, {},
      );
      loadAll();
    } catch (e: unknown) {
      setScoreError(e instanceof Error ? e.message : t('prox_grant.scoring_failed'));
    } finally {
      setScoringId(null);
    }
  }

  // Phase 721c — report drafting + editing
  const [draftingId, setDraftingId] = useState<number | null>(null);
  const [editorId, setEditorId] = useState<number | null>(null);
  const [editorSections, setEditorSections] = useState<Record<string, string>>({});
  const [savingReport, setSavingReport] = useState(false);

  async function draftReport(reportId: number) {
    setDraftingId(reportId);
    setScoreError(null);
    try {
      const r = await api.post<{ success: boolean; report: ReportRow }>(
        `/api/proximate/grants/${grantId}/reports/${reportId}/draft`, {},
      );
      setEditorId(reportId);
      setEditorSections(r.report.content || {});
      loadAll();
    } catch (e: unknown) {
      setScoreError(e instanceof Error ? e.message : t('prox_grant.drafting_failed'));
    } finally {
      setDraftingId(null);
    }
  }

  function openEditor(r: ReportRow) {
    setEditorId(r.id);
    setEditorSections(r.content || {
      executive_summary: '', financial_summary: '',
      impact_narrative: '', compliance_note: '',
    });
  }

  async function saveReport(reportId: number, submit: boolean) {
    setSavingReport(true);
    setScoreError(null);
    try {
      await api.put(
        `/api/proximate/grants/${grantId}/reports/${reportId}`,
        submit
          ? { content: editorSections, status: 'submitted' }
          : { content: editorSections },
      );
      if (submit) setEditorId(null);
      loadAll();
    } catch (e: unknown) {
      setScoreError(e instanceof Error ? e.message : t('prox_grant.save_failed'));
    } finally {
      setSavingReport(false);
    }
  }

  async function saveProgress(index: number) {
    const v = Number(editVal);
    if (Number.isNaN(v)) return;
    try {
      await api.put(
        `/api/proximate/grants/${grantId}/deliverable-progress`,
        { index, value: v },
      );
      setEditIdx(null);
      setEditVal('');
      loadAll();
    } catch {
      setEditIdx(null);
    }
  }

  if (loading) {
    return (
      <PageShell>
        <PageMain>
          <p className="text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin inline me-2" />
            {t('prox_grant.loading_grant')}
          </p>
        </PageMain>
      </PageShell>
    );
  }
  if (error || !data) {
    return (
      <PageShell>
        <PageMain>
          <p className="text-sm text-destructive">{error || t('prox_grant.not_found')}</p>
        </PageMain>
      </PageShell>
    );
  }

  const g = data.grant;
  const pctAllocated = g.amount_committed_usd
    ? Math.min(100, (g.amount_allocated_usd / g.amount_committed_usd) * 100)
    : 0;

  const overdue = data.reports.filter(
    (r) => r.status === 'pending' && r.due_date && new Date(r.due_date) < new Date()
  );
  const upcoming = data.reports.filter(
    (r) => r.status === 'pending' && r.due_date && new Date(r.due_date) >= new Date()
  );
  const submitted = data.reports.filter(
    (r) => r.status !== 'pending'
  );

  return (
    <PageShell>
      <PageHeader
        title={g.title}
        subtitle={`${g.donor_name || t('prox_grant.donor_tbd')}${g.donor_grant_ref ? ` · ${t('prox_grant.ref_label', { ref: g.donor_grant_ref })}` : ''}`}
      />
      <PageMain>
        <div className="space-y-4">
          {/* Phase 721f — donor pack: full grant-timeline PDF */}
          <div className="flex justify-end">
            <a
              href={`/api/proximate/grants/${g.id}/donor-pack.pdf`}
              className="prox-btn ghost"
              style={{ height: 34, fontSize: 13 }}
            >
              ⤓ {t('prox_grant.donor_pack_pdf')}
            </a>
          </div>
          {/* Financial snapshot */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="prox-stat">
              <div className="lab">{t('prox_grant.committed')}</div>
              <div className="val prox-num">{fmtUsd(g.amount_committed_usd)}</div>
            </div>
            <div className="prox-stat">
              <div className="lab">{t('prox_grant.received_to_date')}</div>
              <div className="val prox-num">{fmtUsd(g.amount_received_usd)}</div>
            </div>
            <div className="prox-stat">
              <div className="lab">{t('prox_grant.allocated')}</div>
              <div className="val prox-num">{fmtUsd(g.amount_allocated_usd)}</div>
              <div className="prox-bar" style={{ marginTop: 10 }}>
                <i style={{ width: `${pctAllocated}%` }} />
              </div>
            </div>
            <div className="prox-stat">
              <div className="lab">{t('prox_grant.uncommitted')}</div>
              <div className="val prox-num">{fmtUsd(g.amount_remaining_usd)}</div>
            </div>
          </div>

          {/* Phase 721d — deliverables vs targets */}
          {deliverables.length > 0 && (
            <div className="prox-panel" style={{ padding: '16px 18px' }}>
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-4 h-4" style={{ color: 'var(--prox-muted)' }} />
                <p style={{ fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif', fontSize: 14, fontWeight: 700 }}>{t('prox_grant.deliverables_vs_targets')}</p>
              </div>
              <p className="text-xs mb-3" style={{ color: 'var(--prox-muted)' }}>
                {t('prox_grant.deliverables_description')}
              </p>
              <ul className="space-y-3">
                {deliverables.map((d) => (
                  <li key={d.index}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-sm flex-1 min-w-0">{d.title}</p>
                      <div className="flex items-center gap-2">
                        <span className="prox-mono" style={{ fontSize: 13 }}>
                          {d.current !== null ? d.current.toLocaleString() : '—'}
                          {' / '}
                          {d.target !== null && d.target !== undefined
                            ? d.target.toLocaleString() : '?'}
                          {d.unit ? ` ${d.unit}` : ''}
                        </span>
                        <span
                          className={`prox-pill ${d.source.startsWith('auto') ? 'acc' : 'slate'}`}
                          title={
                            d.source === 'auto:rounds'
                              ? t('prox_grant.source_auto_rounds')
                              : d.source === 'auto:reports'
                                ? t('prox_grant.source_auto_reports')
                                : d.source === 'manual'
                                  ? t('prox_grant.source_manual')
                                  : t('prox_grant.source_untracked')
                          }
                        >
                          {d.source.startsWith('auto') ? t('prox_grant.live') : enumLabel('prox_grant.dsource', d.source)}
                        </span>
                        {isOb && !d.source.startsWith('auto') && (
                          editIdx === d.index ? (
                            <span className="flex items-center gap-1">
                              <input
                                type="number"
                                value={editVal}
                                onChange={(e) => setEditVal(e.target.value)}
                                className="w-24 h-7 px-2 text-xs rounded-md"
                                style={{ background: 'var(--prox-surface)', border: '1px solid var(--prox-line-2)' }}
                                autoFocus
                              />
                              <button
                                onClick={() => saveProgress(d.index)}
                                className="prox-btn primary"
                                style={{ height: 28, fontSize: 12, padding: '0 10px' }}
                              >
                                {t('common.save')}
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => {
                                setEditIdx(d.index);
                                setEditVal(d.current !== null ? String(d.current) : '');
                              }}
                              className="text-xs hover:underline"
                              style={{ color: 'var(--prox-accent)', fontWeight: 600 }}
                            >
                              {d.current === null ? t('prox_grant.enter_progress') : t('prox_grant.update')}
                            </button>
                          )
                        )}
                      </div>
                    </div>
                    <div className={`prox-bar ${(d.pct ?? 0) >= 100 ? 'good' : ''}`} style={{ marginTop: 6 }}>
                      <i style={{ width: `${d.pct ?? 0}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Terms */}
          <div className="prox-panel" style={{ padding: '16px 18px' }}>
            <p className="mb-3" style={{ fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif', fontSize: 14, fontWeight: 700 }}>{t('prox_grant.grant_terms')}</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <p className="prox-eyebrow">{t('prox_grant.period')}</p>
                <p className="mt-1">
                  {g.start_date || '?'} → {g.end_date || '?'}
                </p>
              </div>
              <div>
                <p className="prox-eyebrow">
                  {t('prox_grant.reporting_cadence')}
                </p>
                <p className="prox-mono mt-1">{enumLabel('prox_grant.cadence', g.reporting_cadence)}</p>
              </div>
              <div>
                <p className="prox-eyebrow">
                  {t('prox_grant.signed_pdf')}
                </p>
                <p className="mt-1">
                  {g.has_signed_pdf ? (
                    <span className="inline-flex items-center gap-1" style={{ color: 'var(--prox-good)' }}>
                      <CheckCircle2 className="w-3 h-3" /> {t('prox_grant.on_file')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1" style={{ color: 'var(--prox-warn)' }}>
                      <AlertCircle className="w-3 h-3" /> {t('prox_grant.not_uploaded')}
                    </span>
                  )}
                </p>
              </div>
            </div>
            {(g.restrictions?.geographies?.length
              || g.restrictions?.sectors?.length
              || g.restrictions?.purpose) && (
              <div className="mt-4 pt-4 space-y-2" style={{ borderTop: '1px solid var(--prox-line)' }}>
                <p className="text-xs font-medium">{t('prox_grant.donor_restrictions')}</p>
                {g.restrictions?.geographies?.length ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <MapPin className="w-3 h-3" style={{ color: 'var(--prox-muted)' }} />
                    <span className="prox-eyebrow">
                      {t('prox_grant.geography_label')}
                    </span>
                    {g.restrictions.geographies.map((geo) => (
                      <span key={geo} className="prox-pill slate">
                        {geo}
                      </span>
                    ))}
                  </div>
                ) : null}
                {g.restrictions?.sectors?.length ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="prox-eyebrow">
                      {t('prox_grant.sectors_label')}
                    </span>
                    {g.restrictions.sectors.map((s) => (
                      <span key={s} className="prox-pill slate">
                        {enumLabel('prox_grant.sector', s)}
                      </span>
                    ))}
                  </div>
                ) : null}
                {g.restrictions?.purpose && (
                  <p className="text-xs italic mt-1" style={{ color: 'var(--prox-muted)' }}>
                    &quot;{g.restrictions.purpose}&quot;
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Reporting calendar */}
          <div className="prox-panel" style={{ padding: '16px 18px' }}>
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4" style={{ color: 'var(--prox-muted)' }} />
              <p style={{ fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif', fontSize: 14, fontWeight: 700 }}>{t('prox_grant.reporting_calendar')}</p>
            </div>
            {overdue.length > 0 && (
              <div className="prox-panel mb-3" style={{ padding: '12px 14px', borderColor: 'var(--prox-danger)', background: 'var(--prox-danger-tint)' }}>
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--prox-danger)' }}>
                  {overdue.length === 1
                    ? t('prox_grant.reports_overdue_one', { n: overdue.length })
                    : t('prox_grant.reports_overdue_other', { n: overdue.length })}
                </p>
                <ul className="text-xs space-y-1">
                  {overdue.map((r) => (
                    <li key={r.id} className="flex items-center gap-2">
                      <span className="flex-1">
                        {enumLabel('prox_grant.cadence', r.report_type)} · {t('prox_grant.due', { date: r.due_date ?? '' })}
                      </span>
                      {isOb && (
                        <ReportActions
                          r={r}
                          draftingId={draftingId}
                          onDraft={draftReport}
                          onEdit={openEditor}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {upcoming.length > 0 && (
              <div className="mb-3">
                <p className="prox-eyebrow mb-2">
                  {t('prox_grant.upcoming')}
                </p>
                <ul className="text-xs space-y-1.5">
                  {upcoming.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center gap-2 pb-1.5 last:border-b-0"
                      style={{ borderBottom: '1px solid var(--prox-line)' }}
                    >
                      <span className="flex-1">
                        {enumLabel('prox_grant.cadence', r.report_type)} · {t('prox_grant.due', { date: r.due_date ?? '' })}
                      </span>
                      {isOb && (
                        <ReportActions
                          r={r}
                          draftingId={draftingId}
                          onDraft={draftReport}
                          onEdit={openEditor}
                        />
                      )}
                      <span className={`prox-pill ${reportStatusTone[r.status] || 'slate'}`}>
                        {enumLabel('prox_grant.report_status', r.status)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Phase 721c — inline section editor */}
            {isOb && editorId !== null && (
              <div className="prox-panel mb-3 space-y-2" style={{ padding: '12px 14px', background: 'var(--prox-surface-2)' }}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold">
                    {t('prox_grant.editing_report', { id: editorId })}
                  </p>
                  <button
                    onClick={() => setEditorId(null)}
                    className="text-xs hover:underline"
                    style={{ color: 'var(--prox-muted)' }}
                  >
                    {t('common.close')}
                  </button>
                </div>
                {Object.entries(editorSections).map(([key, value]) => (
                  <label key={key} className="block">
                    <span className="prox-eyebrow">
                      {key.replace(/_/g, ' ')}
                    </span>
                    <textarea
                      value={value}
                      onChange={(e) =>
                        setEditorSections((prev) => ({
                          ...prev, [key]: e.target.value,
                        }))
                      }
                      rows={3}
                      className="mt-0.5 w-full px-2 py-1.5 text-xs rounded-md"
                      style={{ background: 'var(--prox-surface)', border: '1px solid var(--prox-line-2)' }}
                    />
                  </label>
                ))}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => saveReport(editorId, false)}
                    disabled={savingReport}
                    className="prox-btn ghost disabled:opacity-50"
                    style={{ height: 32, fontSize: 12.5 }}
                  >
                    {t('prox_grant.save_draft')}
                  </button>
                  <button
                    onClick={() => saveReport(editorId, true)}
                    disabled={savingReport}
                    className="prox-btn primary disabled:opacity-50"
                    style={{ height: 32, fontSize: 12.5 }}
                  >
                    {savingReport
                      ? <Loader2 className="w-3 h-3 animate-spin inline me-1" />
                      : null}
                    {t('prox_grant.submit_to_donor')}
                  </button>
                </div>
              </div>
            )}

            {submitted.length > 0 && (
              <div>
                <p className="prox-eyebrow mb-2">
                  {t('prox_grant.submitted')}
                </p>
                {scoreError && (
                  <p className="text-xs mb-2" style={{ color: 'var(--prox-danger)' }}>{scoreError}</p>
                )}
                <ul className="text-xs space-y-1.5">
                  {submitted.map((r) => {
                    const avg = avgScore(r.compliance_score);
                    return (
                      <li
                        key={r.id}
                        className="pb-1.5 last:border-b-0"
                        style={{ borderBottom: '1px solid var(--prox-line)' }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="flex-1">
                            {enumLabel('prox_grant.cadence', r.report_type)} · {r.period_start} – {r.period_end}
                          </span>
                          {avg !== null && (
                            <span
                              className={`prox-pill prox-mono ${scorePillTone(avg)}`}
                              title={t('prox_grant.avg_score_tooltip')}
                            >
                              {avg}/100
                            </span>
                          )}
                          {isOb && (
                            <button
                              onClick={() => scoreReport(r.id)}
                              disabled={scoringId !== null}
                              className="prox-btn ghost disabled:opacity-50"
                              style={{ height: 26, fontSize: 11, padding: '0 8px', gap: 5 }}
                              title={t('prox_grant.score_report_tooltip')}
                            >
                              {scoringId === r.id
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <Sparkles className="w-3 h-3" />}
                              {avg !== null ? t('prox_grant.re_score') : t('prox_grant.score_with_ai')}
                            </button>
                          )}
                          <span className={`prox-pill ${reportStatusTone[r.status] || 'slate'}`}>
                            {enumLabel('prox_grant.report_status', r.status)}
                          </span>
                        </div>
                        {r.compliance_score?.length > 0 && (
                          <details className="mt-1 ms-2">
                            <summary className="cursor-pointer text-[10px] hover:underline" style={{ color: 'var(--prox-muted)' }}>
                              {r.compliance_score.length === 1
                                ? t('prox_grant.requirements_scored_one', { n: r.compliance_score.length })
                                : t('prox_grant.requirements_scored_other', { n: r.compliance_score.length })}
                              {' — '}
                              {t('prox_grant.score_breakdown', {
                                met: r.compliance_score.filter((s) => s.verdict === 'met').length,
                                partial: r.compliance_score.filter((s) => s.verdict === 'partial').length,
                                missing: r.compliance_score.filter((s) => s.verdict === 'missing').length,
                              })}
                            </summary>
                            <ul className="mt-1.5 space-y-1.5">
                              {r.compliance_score.map((s, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <span
                                    className={`prox-pill prox-mono ${scorePillTone(s.score)}`}
                                    style={{ flexShrink: 0 }}
                                  >
                                    {s.score}
                                  </span>
                                  <span className="min-w-0">
                                    <span className="font-medium">{s.requirement}</span>
                                    {' — '}
                                    <span style={{ color: 'var(--prox-muted)' }}>{s.why}</span>
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {data.reports.length === 0 && (
              <p className="text-xs" style={{ color: 'var(--prox-muted)' }}>
                {t('prox_grant.no_reports_scheduled')}
              </p>
            )}
          </div>

          {/* Round allocations */}
          <div className="prox-panel" style={{ padding: '16px 18px' }}>
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="w-4 h-4" style={{ color: 'var(--prox-muted)' }} />
              <p style={{ fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif', fontSize: 14, fontWeight: 700 }}>
                {t('prox_grant.round_allocations', { n: data.allocations.length })}
              </p>
            </div>
            {data.allocations.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--prox-muted)' }}>
                {t('prox_grant.no_rounds_drawn')}
                {isOb && ` ${t('prox_grant.allocate_from_round')}`}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {data.allocations.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-2 pb-1.5 last:border-b-0"
                    style={{ borderBottom: '1px solid var(--prox-line)' }}
                  >
                    <Link
                      href={`/proximate/rounds/${a.round_id}`}
                      className="flex-1 min-w-0 text-sm hover:underline"
                    >
                      <span className="font-medium truncate block">
                        {a.round_title}
                      </span>
                      {a.round_status && (
                        <span className="text-[10px]" style={{ color: 'var(--prox-muted)' }}>
                          {enumLabel('proximate.status', a.round_status)}
                        </span>
                      )}
                    </Link>
                    <p className="prox-mono text-sm">{fmtUsd(a.amount_usd)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* AI-extraction inspection panel (OB only).
              QA 2026-07-15 ("too busy"): this rendered the raw JSON blob
              by default — an inspection tool masquerading as content.
              Collapsed behind a <details>; the reviewed canonical values
              above are what the OB actually reads. */}
          {isOb && g.extracted && Object.keys(g.extracted).length > 0 && (
            <div className="prox-panel" style={{ padding: '16px 18px' }}>
              <details>
                <summary className="flex items-center gap-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                  <FileText className="w-4 h-4" style={{ color: 'var(--prox-muted)' }} />
                  <p style={{ fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif', fontSize: 14, fontWeight: 700 }}>{t('prox_grant.ai_extracted_terms')}</p>
                  <p className="text-[10px]" style={{ color: 'var(--prox-muted)' }}>
                    {t('prox_grant.ai_extracted_hint')}
                  </p>
                </summary>
                <pre className="prox-mono mt-3 text-[10px] p-3 rounded-md overflow-x-auto max-h-64" style={{ background: 'var(--prox-inset)' }}>
                  {JSON.stringify(g.extracted, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      </PageMain>
    </PageShell>
  );
}
