'use client';

// ============================================================================
// DonorReportInbox — the donor's "reports awaiting your review" queue (Kuja).
//
// One clean, action-oriented surface answering the donor ask: "show me what's
// coming due, pre-reviewed and scored, and let me act in one place." It lists
// every submitted / under-review report across the donor's own grants
// (GET /api/reports/?status=... — already scoped to their grants + the Kuja
// network server-side), shows the AI pre-score + per-requirement coverage the
// grantee's submission already carries, and offers the two decisions inline:
//   • Accept
//   • Request revision (with a short note back to the grantee)
// via POST /api/reports/<id>/review { action, notes }.
//
// Donor/admin only; renders nothing for other roles and nothing when the queue
// is empty, so it stays out of the way until there's something to do.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Inbox, Loader2, CheckCircle2, RotateCcw, FileText, CalendarClock, Building2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useTranslation } from '@/lib/hooks/use-translation';

interface RequirementScore { status?: string }
interface AiAnalysis {
  score?: number;
  compliance_score?: number;
  summary?: string;
  per_requirement_scores?: RequirementScore[];
}
interface DonorReport {
  id: number;
  grant_id: number;
  grant_title?: string;
  org_name?: string;
  title?: string;
  report_type?: string;
  reporting_period?: string;
  status: string;
  due_date?: string | null;
  submitted_at?: string | null;
  ai_analysis?: AiAnalysis | null;
}

interface Props {
  /** Called after a report is accepted / sent back so the parent list can refresh. */
  onReviewed?: () => void;
}

function scoreTone(score: number): { ring: string; text: string; bg: string } {
  if (score >= 80) return { ring: 'ring-emerald-500/30', text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-500/10' };
  if (score >= 60) return { ring: 'ring-amber-500/30', text: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-500/10' };
  return { ring: 'ring-red-500/30', text: 'text-red-700 dark:text-red-400', bg: 'bg-red-500/10' };
}

function requirementSummary(a?: AiAnalysis | null): { met: number; partial: number; missing: number; total: number } {
  const list = a?.per_requirement_scores || [];
  let met = 0, partial = 0, missing = 0;
  for (const r of list) {
    const s = (r.status || '').toLowerCase();
    if (s === 'met') met += 1;
    else if (s === 'partially_met' || s === 'partial') partial += 1;
    else if (s === 'not_met' || s === 'missing') missing += 1;
  }
  return { met, partial, missing, total: list.length };
}

export function DonorReportInbox({ onReviewed }: Props) {
  const user = useAuthStore((s) => s.user);
  const { t, formatDate } = useTranslation();
  const isDonor = user?.role === 'donor' || user?.role === 'admin';

  const [reports, setReports] = useState<DonorReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [reviseFor, setReviseFor] = useState<number | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<{ reports: DonorReport[] }>('/reports/?status=submitted').catch(() => ({ reports: [] })),
      api.get<{ reports: DonorReport[] }>('/reports/?status=under_review').catch(() => ({ reports: [] })),
    ])
      .then(([a, b]) => {
        const merged = [...(a.reports || []), ...(b.reports || [])];
        // de-dupe by id, newest submitted first
        const byId = new Map<number, DonorReport>();
        for (const r of merged) byId.set(r.id, r);
        const list = Array.from(byId.values()).sort(
          (x, y) => (y.submitted_at || '').localeCompare(x.submitted_at || ''),
        );
        setReports(list);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (isDonor) load();
    else setLoading(false);
  }, [isDonor, load]);

  const act = useCallback(
    async (id: number, action: 'accept' | 'request_revision') => {
      setBusyId(id);
      try {
        await api.post(`/reports/${id}/review`, {
          action,
          notes: action === 'request_revision' ? note.trim() : undefined,
        });
        setReports((rs) => rs.filter((r) => r.id !== id));
        setReviseFor(null);
        setNote('');
        onReviewed?.();
      } catch {
        // Surface nothing destructive; keep the row so the donor can retry.
      } finally {
        setBusyId(null);
      }
    },
    [note, onReviewed],
  );

  // Not a donor, still loading nothing to show, or an empty queue → render
  // nothing so the page stays clean and action-oriented.
  if (!isDonor) return null;
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-background p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t('report.inbox.loading')}
        </div>
      </div>
    );
  }
  if (reports.length === 0) return null;

  return (
    <section
      className="rounded-xl border border-[hsl(var(--kuja-clay,var(--primary)))]/25 bg-[hsl(var(--kuja-clay,var(--primary)))]/[0.04] p-5"
      aria-label={t('report.inbox.title')}
    >
      <div className="mb-4 flex items-center gap-2">
        <Inbox className="h-4 w-4 text-[hsl(var(--kuja-clay,var(--primary)))]" aria-hidden />
        <h2 className="text-sm font-semibold">{t('report.inbox.title')}</h2>
        <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[hsl(var(--kuja-clay,var(--primary)))] px-1.5 text-[11px] font-bold text-white">
          {reports.length}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">{t('report.inbox.subtitle')}</span>
      </div>

      <ul className="space-y-3">
        {reports.map((r) => {
          const ai = r.ai_analysis || undefined;
          const rawScore = ai?.score ?? ai?.compliance_score;
          const score = typeof rawScore === 'number' ? Math.round(rawScore) : null;
          const tone = score !== null ? scoreTone(score) : null;
          const req = requirementSummary(ai);
          const busy = busyId === r.id;
          return (
            <li key={r.id} className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-start gap-3">
                {/* AI pre-score dial */}
                {score !== null && tone ? (
                  <div className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg ring-1 ${tone.ring} ${tone.bg}`}>
                    <span className={`kuja-numeric text-base font-bold leading-none ${tone.text}`}>{score}</span>
                    <span className="mt-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">{t('report.inbox.ai')}</span>
                  </div>
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <FileText className="h-5 w-5 text-muted-foreground" aria-hidden />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <Link href={`/reports/${r.id}`} className="truncate text-sm font-semibold hover:underline">
                      {r.title || t('report.inbox.untitled')}
                    </Link>
                    {r.reporting_period ? (
                      <span className="text-xs text-muted-foreground">· {r.reporting_period}</span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" aria-hidden />{r.org_name || '—'}</span>
                    <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" aria-hidden />{r.grant_title || `Grant #${r.grant_id}`}</span>
                    {r.due_date ? (
                      <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" aria-hidden />{t('report.inbox.due')} {formatDate(r.due_date)}</span>
                    ) : null}
                  </div>

                  {/* Per-requirement coverage the AI already checked */}
                  {req.total > 0 ? (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                      {req.met > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-400">
                          {req.met} {t('report.inbox.met')}
                        </span>
                      )}
                      {req.partial > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-400">
                          {req.partial} {t('report.inbox.partial')}
                        </span>
                      )}
                      {req.missing > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 font-medium text-red-700 dark:text-red-400">
                          {req.missing} {t('report.inbox.missing')}
                        </span>
                      )}
                    </div>
                  ) : null}

                  {ai?.summary ? (
                    <p className="mt-2 line-clamp-2 text-xs text-foreground/70">{ai.summary}</p>
                  ) : null}

                  {/* Actions */}
                  {reviseFor === r.id ? (
                    <div className="mt-3 space-y-2">
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        placeholder={t('report.inbox.revision_placeholder')}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[hsl(var(--kuja-clay,var(--primary)))]/40"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy || !note.trim()}
                          onClick={() => act(r.id, 'request_revision')}
                          className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                        >
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RotateCcw className="h-3.5 w-3.5" aria-hidden />}
                          {t('report.inbox.send_back')}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => { setReviseFor(null); setNote(''); }}
                          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => act(r.id, 'accept')}
                        className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}
                        {t('report.inbox.accept')}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => { setReviseFor(r.id); setNote(''); }}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                        {t('report.inbox.request_revision')}
                      </button>
                      <Link
                        href={`/reports/${r.id}`}
                        className="inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted"
                      >
                        {t('report.inbox.open')}
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
