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
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  return (
    <span className="flex items-center gap-1">
      <button
        onClick={() => onDraft(r.id)}
        disabled={draftingId !== null}
        className="text-[10px] inline-flex items-center gap-1 px-2 py-0.5 rounded-md border hover:bg-muted disabled:opacity-50"
        title="AI drafts this report from real round and disbursement data"
      >
        {draftingId === r.id
          ? <Loader2 className="w-3 h-3 animate-spin" />
          : <Sparkles className="w-3 h-3" />}
        {hasContent ? 'Re-draft' : 'Draft with AI'}
      </button>
      {hasContent && (
        <button
          onClick={() => onEdit(r)}
          className="text-[10px] px-2 py-0.5 rounded-md border hover:bg-muted"
        >
          Edit
        </button>
      )}
    </span>
  );
}

function avgScore(scores: RequirementScore[]): number | null {
  if (!scores?.length) return null;
  return Math.round(scores.reduce((a, s) => a + (s.score || 0), 0) / scores.length);
}

function scoreBadgeCls(v: number): string {
  if (v >= 80) return 'bg-emerald-100 text-emerald-800 border-emerald-300';
  if (v >= 55) return 'bg-amber-100 text-amber-800 border-amber-300';
  return 'bg-rose-100 text-rose-800 border-rose-300';
}

function fmtUsd(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

const reportStatusStyles: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground border-border',
  drafting: 'bg-amber-100 text-amber-800 border-amber-300',
  submitted: 'bg-sky-100 text-sky-800 border-sky-300',
  accepted: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  revision_requested: 'bg-rose-100 text-rose-800 border-rose-300',
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
  const isOb = persona === 'ob' || persona === 'admin';

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
      .catch(() => setError('Failed to load grant.'))
      .finally(() => setLoading(false));
    api.get<{ success: boolean; deliverables: DeliverableProgress[] }>(
      `/api/proximate/grants/${grantId}/compliance`,
    )
      .then((r) => setDeliverables(r.deliverables || []))
      .catch(() => {});
  }, [grantId]);

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
      setScoreError(e instanceof Error ? e.message : 'Scoring failed.');
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
      setScoreError(e instanceof Error ? e.message : 'Drafting failed.');
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
      setScoreError(e instanceof Error ? e.message : 'Save failed.');
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
            Loading grant…
          </p>
        </PageMain>
      </PageShell>
    );
  }
  if (error || !data) {
    return (
      <PageShell>
        <PageMain>
          <p className="text-sm text-destructive">{error || 'Not found'}</p>
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
        subtitle={`${g.donor_name || 'Donor TBD'}${g.donor_grant_ref ? ` · Ref ${g.donor_grant_ref}` : ''}`}
      />
      <PageMain>
        <div className="space-y-4">
          {/* Phase 721f — donor pack: full grant-timeline PDF */}
          <div className="flex justify-end">
            <a
              href={`/api/proximate/grants/${g.id}/donor-pack.pdf`}
              className="inline-flex items-center gap-1.5 text-sm border rounded-lg px-3 py-1.5 hover:bg-muted/40"
            >
              ⤓ Donor pack (PDF) — financials, deliverables, reports
            </a>
          </div>
          {/* Financial snapshot */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                Committed
              </p>
              <p className="text-2xl font-semibold">{fmtUsd(g.amount_committed_usd)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                Received to date
              </p>
              <p className="text-2xl font-semibold">{fmtUsd(g.amount_received_usd)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                Allocated
              </p>
              <p className="text-2xl font-semibold">{fmtUsd(g.amount_allocated_usd)}</p>
              <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${pctAllocated}%` }}
                />
              </div>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                Uncommitted
              </p>
              <p className="text-2xl font-semibold">{fmtUsd(g.amount_remaining_usd)}</p>
            </Card>
          </div>

          {/* Phase 721d — deliverables vs targets */}
          {deliverables.length > 0 && (
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-medium">Deliverables vs targets</p>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                What the agreement commits Adeso to, against live system data.
              </p>
              <ul className="space-y-3">
                {deliverables.map((d) => (
                  <li key={d.index}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-sm flex-1 min-w-0">{d.title}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono">
                          {d.current !== null ? d.current.toLocaleString() : '—'}
                          {' / '}
                          {d.target !== null && d.target !== undefined
                            ? d.target.toLocaleString() : '?'}
                          {d.unit ? ` ${d.unit}` : ''}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px]"
                          title={
                            d.source === 'auto:rounds'
                              ? 'Counted from rounds allocated from this grant'
                              : d.source === 'auto:reports'
                                ? 'Counted from submitted donor reports'
                                : d.source === 'manual'
                                  ? 'Entered by the Oversight Body'
                                  : 'Not tracked yet — enter a value'
                          }
                        >
                          {d.source.startsWith('auto') ? 'live' : d.source}
                        </Badge>
                        {isOb && !d.source.startsWith('auto') && (
                          editIdx === d.index ? (
                            <span className="flex items-center gap-1">
                              <input
                                type="number"
                                value={editVal}
                                onChange={(e) => setEditVal(e.target.value)}
                                className="w-24 h-7 px-2 text-xs border rounded-md bg-background"
                                autoFocus
                              />
                              <button
                                onClick={() => saveProgress(d.index)}
                                className="text-xs px-2 py-1 rounded-md bg-emerald-600 text-white"
                              >
                                Save
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => {
                                setEditIdx(d.index);
                                setEditVal(d.current !== null ? String(d.current) : '');
                              }}
                              className="text-xs text-emerald-700 hover:underline"
                            >
                              {d.current === null ? 'Enter progress' : 'Update'}
                            </button>
                          )
                        )}
                      </div>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full ${
                          (d.pct ?? 0) >= 100 ? 'bg-emerald-500'
                            : (d.pct ?? 0) >= 50 ? 'bg-sky-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${d.pct ?? 0}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Terms */}
          <Card className="p-4">
            <p className="text-sm font-medium mb-3">Grant terms</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Period</p>
                <p className="mt-1">
                  {g.start_date || '?'} → {g.end_date || '?'}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">
                  Reporting cadence
                </p>
                <p className="mt-1 font-mono">{g.reporting_cadence}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">
                  Signed PDF
                </p>
                <p className="mt-1">
                  {g.has_signed_pdf ? (
                    <span className="text-emerald-700 inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> On file
                    </span>
                  ) : (
                    <span className="text-amber-700 inline-flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Not uploaded
                    </span>
                  )}
                </p>
              </div>
            </div>
            {(g.restrictions?.geographies?.length
              || g.restrictions?.sectors?.length
              || g.restrictions?.purpose) && (
              <div className="mt-4 pt-4 border-t space-y-2">
                <p className="text-xs font-medium">Donor restrictions</p>
                {g.restrictions?.geographies?.length ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <MapPin className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] uppercase text-muted-foreground">
                      Geography:
                    </span>
                    {g.restrictions.geographies.map((geo) => (
                      <Badge key={geo} variant="outline" className="text-[10px]">
                        {geo}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                {g.restrictions?.sectors?.length ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] uppercase text-muted-foreground">
                      Sectors:
                    </span>
                    {g.restrictions.sectors.map((s) => (
                      <Badge key={s} variant="outline" className="text-[10px]">
                        {s}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                {g.restrictions?.purpose && (
                  <p className="text-xs text-muted-foreground italic mt-1">
                    &quot;{g.restrictions.purpose}&quot;
                  </p>
                )}
              </div>
            )}
          </Card>

          {/* Reporting calendar */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-medium">Reporting calendar</p>
            </div>
            {overdue.length > 0 && (
              <div className="mb-3 p-3 rounded-md border border-rose-300 bg-rose-50">
                <p className="text-xs font-medium text-rose-800 mb-1">
                  {overdue.length} report{overdue.length === 1 ? '' : 's'} overdue
                </p>
                <ul className="text-xs space-y-1">
                  {overdue.map((r) => (
                    <li key={r.id} className="flex items-center gap-2">
                      <span className="flex-1">
                        {r.report_type} · due {r.due_date}
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
                <p className="text-xs font-medium mb-2 text-muted-foreground uppercase">
                  Upcoming
                </p>
                <ul className="text-xs space-y-1.5">
                  {upcoming.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center gap-2 border-b border-border/60 pb-1.5 last:border-b-0"
                    >
                      <span className="flex-1">
                        {r.report_type} · due {r.due_date}
                      </span>
                      {isOb && (
                        <ReportActions
                          r={r}
                          draftingId={draftingId}
                          onDraft={draftReport}
                          onEdit={openEditor}
                        />
                      )}
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${reportStatusStyles[r.status] || ''}`}
                      >
                        {r.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Phase 721c — inline section editor */}
            {isOb && editorId !== null && (
              <div className="mb-3 p-3 rounded-md border bg-muted/20 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold">
                    Editing report #{editorId} — AI drafts from real round
                    data; review every line before submitting.
                  </p>
                  <button
                    onClick={() => setEditorId(null)}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    Close
                  </button>
                </div>
                {Object.entries(editorSections).map(([key, value]) => (
                  <label key={key} className="block">
                    <span className="text-[10px] uppercase text-muted-foreground">
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
                      className="mt-0.5 w-full px-2 py-1.5 text-xs border rounded-md bg-background"
                    />
                  </label>
                ))}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => saveReport(editorId, false)}
                    disabled={savingReport}
                    className="text-xs px-3 py-1.5 rounded-md border hover:bg-muted disabled:opacity-50"
                  >
                    Save draft
                  </button>
                  <button
                    onClick={() => saveReport(editorId, true)}
                    disabled={savingReport}
                    className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {savingReport
                      ? <Loader2 className="w-3 h-3 animate-spin inline me-1" />
                      : null}
                    Submit to donor
                  </button>
                </div>
              </div>
            )}

            {submitted.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-2 text-muted-foreground uppercase">
                  Submitted
                </p>
                {scoreError && (
                  <p className="text-xs text-rose-700 mb-2">{scoreError}</p>
                )}
                <ul className="text-xs space-y-1.5">
                  {submitted.map((r) => {
                    const avg = avgScore(r.compliance_score);
                    return (
                      <li
                        key={r.id}
                        className="border-b border-border/60 pb-1.5 last:border-b-0"
                      >
                        <div className="flex items-center gap-2">
                          <span className="flex-1">
                            {r.report_type} · {r.period_start} – {r.period_end}
                          </span>
                          {avg !== null && (
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-mono ${scoreBadgeCls(avg)}`}
                              title="Average AI compliance score across donor requirements"
                            >
                              {avg}/100
                            </Badge>
                          )}
                          {isOb && (
                            <button
                              onClick={() => scoreReport(r.id)}
                              disabled={scoringId !== null}
                              className="text-[10px] inline-flex items-center gap-1 px-2 py-0.5 rounded-md border hover:bg-muted disabled:opacity-50"
                              title="AI scores this report against the donor's extracted requirements"
                            >
                              {scoringId === r.id
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <Sparkles className="w-3 h-3" />}
                              {avg !== null ? 'Re-score' : 'Score with AI'}
                            </button>
                          )}
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${reportStatusStyles[r.status] || ''}`}
                          >
                            {r.status}
                          </Badge>
                        </div>
                        {r.compliance_score?.length > 0 && (
                          <details className="mt-1 ms-2">
                            <summary className="cursor-pointer text-[10px] text-muted-foreground hover:underline">
                              {r.compliance_score.length} requirement
                              {r.compliance_score.length === 1 ? '' : 's'} scored —
                              {' '}
                              {r.compliance_score.filter((s) => s.verdict === 'met').length} met,
                              {' '}
                              {r.compliance_score.filter((s) => s.verdict === 'partial').length} partial,
                              {' '}
                              {r.compliance_score.filter((s) => s.verdict === 'missing').length} missing
                            </summary>
                            <ul className="mt-1.5 space-y-1.5">
                              {r.compliance_score.map((s, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] font-mono shrink-0 ${scoreBadgeCls(s.score)}`}
                                  >
                                    {s.score}
                                  </Badge>
                                  <span className="min-w-0">
                                    <span className="font-medium">{s.requirement}</span>
                                    {' — '}
                                    <span className="text-muted-foreground">{s.why}</span>
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
              <p className="text-xs text-muted-foreground italic text-center py-4">
                No reports scheduled yet. Reports get auto-generated per the grant&apos;s cadence.
              </p>
            )}
          </Card>

          {/* Round allocations */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-medium">
                Round allocations ({data.allocations.length})
              </p>
            </div>
            {data.allocations.length === 0 ? (
              <p className="text-xs text-muted-foreground italic text-center py-4">
                No rounds have drawn from this grant yet.
                {isOb && ' Rounds can be allocated from the round detail page or here.'}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {data.allocations.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-2 border-b border-border/60 pb-1.5 last:border-b-0"
                  >
                    <Link
                      href={`/proximate/rounds/${a.round_id}`}
                      className="flex-1 min-w-0 text-sm hover:underline"
                    >
                      <span className="font-medium truncate block">
                        {a.round_title}
                      </span>
                      {a.round_status && (
                        <span className="text-[10px] text-muted-foreground">
                          {a.round_status}
                        </span>
                      )}
                    </Link>
                    <p className="text-sm font-mono">{fmtUsd(a.amount_usd)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* AI-extraction inspection panel (OB only) */}
          {isOb && g.extracted && Object.keys(g.extracted).length > 0 && (
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-medium">AI-extracted terms</p>
                <p className="text-[10px] text-muted-foreground">
                  (raw first pass — canonical values above have been reviewed)
                </p>
              </div>
              <pre className="text-[10px] font-mono bg-muted/40 p-3 rounded-md overflow-x-auto max-h-64">
                {JSON.stringify(g.extracted, null, 2)}
              </pre>
            </Card>
          )}
        </div>
      </PageMain>
    </PageShell>
  );
}
