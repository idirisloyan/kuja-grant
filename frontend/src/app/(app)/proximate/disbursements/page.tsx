'use client';

/**
 * Proximate disbursements list — Phase 653 (June 2026).
 *
 * OB sees every money release tagged to a Proximate partner, sorted
 * newest first, with the report-obligation status. Each row links
 * to a per-disbursement detail (deferred); for now the report token
 * is surfaced inline so the OB can copy the partner-facing URL.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, Plus, Copy, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { formatComplianceDate } from '@/lib/format-date';
import { labelForProximateStatus } from '@/lib/proximate-status-labels';
import { useAuthStore } from '@/stores/auth-store';
import { useProximatePersona } from '@/lib/hooks/use-proximate-persona';
import { useTranslation } from '@/lib/hooks/use-translation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/proximate/load-error';
import { isTestRecord, splitTestRecords } from '@/lib/test-records';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';

// Disbursement status → design-system pill tone.
const DISB_PILL: Record<string, string> = {
  draft: 'slate', pending_cosign: 'warn', disbursed: 'acc', pending_report: 'warn',
  reported: 'warn', verified: 'good', flagged: 'danger',
};

interface Disbursement {
  id: number;
  partner_id: number;
  partner_name: string | null;
  amount_usd: number | null;
  purpose: string | null;
  sent_at: string | null;
  status: string;
  report_due_at: string | null;
  report_submitted_at: string | null;
  overdue: boolean;
  report_token: string | null;
  has_report: boolean;
}

export default function ProximateDisbursementsPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  // Phase 701 — Disbursements is an OB-only operator surface. Reviewer
  // flagged: donors could navigate here via URL paste and see the
  // "Record disbursement" UI (POSTs are server-gated, but UI shouldn't
  // tease an action the user can't take).
  const { persona, isLoading: personaLoading } = useProximatePersona();
  const isOperator =
    persona === 'ob' || persona === 'admin' || user?.role === 'admin';
  const isDonor = persona === 'donor';

  const [rows, setRows] = useState<Disbursement[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [copied, setCopied] = useState<number | null>(null);
  // Redesign Stage 3c — status filter chips, URL-persisted (same
  // pattern as the rounds and partners registers).
  const [statusFilter, setStatusFilter] = useState('all');
  // Fixture rows are hidden by default so a live session does not open on a
  // list of QA Fixture / UAT records. Never removed — the count stays
  // visible and one click brings them back.
  const [showTest, setShowTest] = useState(false);
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('status');
    if (s) setStatusFilter(s);
  }, []);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (statusFilter && statusFilter !== 'all') sp.set('status', statusFilter);
    else sp.delete('status');
    const qs = sp.toString();
    window.history.replaceState(
      null, '', window.location.pathname + (qs ? `?${qs}` : ''),
    );
  }, [statusFilter]);
  const { real: realRows, test: testRows } = useMemo(
    () => splitTestRecords(rows ?? [], (d) => d.partner_name),
    [rows],
  );
  // Everything the register is willing to show right now, before the status
  // chips narrow it further.
  const countedRows = useMemo(
    () => (showTest ? [...realRows, ...testRows] : realRows),
    [realRows, testRows, showTest],
  );
  // Counted over the same set the list shows. Counting hidden fixtures here
  // would put a number on a chip that then filters to fewer rows than it
  // promised — the kind of small dishonesty that erodes trust in a register.
  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const d of countedRows) c[d.status] = (c[d.status] || 0) + 1;
    return c;
  }, [countedRows]);
  const visibleRows = useMemo(
    () => countedRows.filter(
      (d) => statusFilter === 'all' || d.status === statusFilter,
    ),
    [countedRows, statusFilter],
  );

  const load = useCallback(() => {
    if (!isOperator) return; // Don't even fetch — donors aren't supposed to see this.
    setLoading(true);
    setLoadError(null);
    api.get<{ disbursements: Disbursement[] }>('/api/proximate/disbursements')
      .then((r) => { setRows(r.disbursements || []); })
      // F-02: a failed fetch must NOT become "No disbursements yet". Surface
      // the real error (auth / permission / server / network) with a retry.
      .catch((e: unknown) => { setLoadError(e); })
      .finally(() => { setLoading(false); });
  }, [isOperator]);

  useEffect(() => { load(); }, [load]);

  // Donor gate: show a friendly "OB only" panel and a link back to
  // the donor portal. Operator UI is never rendered for donors.
  if (!personaLoading && isDonor) {
    return (
      <PageShell>
        <PageMain>
          <Card className="p-6 max-w-md mx-auto text-center space-y-3">
            <p className="text-sm font-medium">
              {t('proximate.disbursements.donor_blocked_title')
                || 'This page is for the Oversight Body.'}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('proximate.disbursements.donor_blocked_body')
                || 'Disbursement operations are handled by Adeso. Your portfolio view is over here.'}
            </p>
            <Link href="/proximate/donor">
              <Button size="sm">
                {t('proximate.disbursements.go_to_donor_portal')
                  || 'Go to donor portal'}
              </Button>
            </Link>
          </Card>
        </PageMain>
      </PageShell>
    );
  }

  // "Due Aug 15" makes someone do the arithmetic. "8 days overdue" does not.
  function dueAge(iso: string | null | undefined): { text: string; late: boolean } | null {
    if (!iso) return null;
    const due = new Date(iso);
    if (Number.isNaN(due.getTime())) return null;
    const days = Math.round((due.getTime() - Date.now()) / 86_400_000);
    if (days < 0) return { text: t('proximate.disbursements.days_overdue', { n: Math.abs(days) }), late: true };
    if (days === 0) return { text: t('proximate.disbursements.due_today'), late: true };
    return { text: t('proximate.disbursements.days_left', { n: days }), late: false };
  }

  function copyReportUrl(d: Disbursement) {
    if (!d.report_token) return;
    const url = `${window.location.origin}/proximate-report?t=${d.report_token}`;
    navigator.clipboard.writeText(url);
    setCopied(d.id);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <PageShell>
      <PageHeader
        title={t('proximate.disbursements.title')}
        subtitle={t('proximate.disbursements.subtitle')}
        // PRX-RBAC-014 — recording money is OB-only. Platform admin can
        // observe the list but must not be teased the Record action (the
        // POST 403s them). isOperator still gates the read/view above.
        primaryAction={persona === 'ob' ? (
          <Link href="/proximate/disbursements/new">
            <Button size="sm">
              <Plus className="w-3.5 h-3.5 me-1" />
              {t('proximate.disbursements.new')}
            </Button>
          </Link>
        ) : undefined}
      />
      <PageMain>
        {loading && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            {t('proximate.disbursements.loading')}
          </p>
        )}
        {loadError != null && !loading && (
          <LoadError error={loadError} onRetry={load} />
        )}
        {!loadError && rows !== null && rows.length === 0 && !loading && (
          <Card className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {t('proximate.disbursements.empty')}
            </p>
          </Card>
        )}
        {!loadError && rows !== null && rows.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mb-2">
            {['all', 'draft', 'pending_cosign', 'disbursed', 'pending_report',
              'reported', 'verified', 'flagged']
              .filter((s) => s === 'all' || statusCounts[s])
              .map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className="text-xs px-3 py-1 rounded-full border transition-colors"
                  style={statusFilter === s
                    ? { background: 'var(--prox-accent)', color: '#fff', borderColor: 'transparent' }
                    : { background: 'var(--prox-surface)', color: 'var(--prox-muted)', borderColor: 'var(--prox-line-2)' }}
                >
                  {s === 'all'
                    ? `${t('common.all')} (${countedRows.length})`
                    : `${labelForProximateStatus(s, t)} (${statusCounts[s]})`}
                </button>
              ))}
            {testRows.length > 0 && (
              <button
                type="button"
                onClick={() => setShowTest((v) => !v)}
                className="text-xs px-3 py-1 rounded-full border border-dashed transition-colors"
                style={showTest
                  ? { background: 'var(--prox-slate)', color: '#fff', borderColor: 'transparent' }
                  : { background: 'var(--prox-surface)', color: 'var(--prox-muted)', borderColor: 'var(--prox-line-2)' }}
                title={t('proximate.disbursements.test_toggle_hint')}
              >
                {showTest
                  ? t('proximate.disbursements.hide_test', { n: testRows.length })
                  : t('proximate.disbursements.show_test', { n: testRows.length })}
              </button>
            )}
          </div>
        )}
        {visibleRows.length > 0 && (
          <div className="prox-panel overflow-hidden">
            {visibleRows.map((d, i) => (
              <div key={d.id} className="prox-qrow" style={i === 0 ? { borderTop: 0 } : undefined}>
                <Link href={`/proximate/disbursements/${d.id}`} className="min-w-0 block">
                  <div className="flex items-center gap-2 flex-wrap">
                    <strong className="truncate" style={{ fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif', fontSize: 14, fontWeight: 700 }}>
                      {d.partner_name || `Partner #${d.partner_id}`}
                    </strong>
                    <span className={`prox-pill ${DISB_PILL[d.status] || 'slate'}`}>
                      {labelForProximateStatus(d.status, t)}
                    </span>
                    {d.overdue && (
                      <span className="prox-pill danger">{t('proximate.disbursements.overdue')}</span>
                    )}
                    {isTestRecord(d.partner_name) && (
                      <span className="prox-pill slate">{t('common.test_record')}</span>
                    )}
                  </div>
                  <small className="block" style={{ marginTop: 3 }}>
                    {d.amount_usd != null && (
                      <span className="prox-mono" style={{ fontWeight: 600, color: 'var(--prox-ink)' }}>${d.amount_usd.toLocaleString()}</span>
                    )}
                    {d.purpose && <> · {d.purpose}</>}
                    {d.sent_at && <> · {formatComplianceDate(d.sent_at)}</>}
                    {d.report_due_at && d.status === 'pending_report' && (() => {
                      const age = dueAge(d.report_due_at);
                      return (
                        <span style={age?.late ? { color: 'var(--prox-danger)', fontWeight: 600 } : undefined}>
                          {' · '}{t('proximate.disbursements.due')} {formatComplianceDate(d.report_due_at)}
                          {age ? ` (${age.text})` : ''}
                        </span>
                      );
                    })()}
                  </small>
                </Link>
                {d.report_token && d.status === 'pending_report' && (
                  <button
                    className="prox-btn ghost"
                    style={{ height: 30, fontSize: 12, padding: '0 11px' }}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); copyReportUrl(d); }}
                  >
                    {copied === d.id ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copied === d.id
                      ? t('proximate.disbursements.copied')
                      : t('proximate.disbursements.copy_report_link')}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </PageMain>
    </PageShell>
  );
}
