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
import { Loader2, Plus, Copy, Check, Inbox } from 'lucide-react';
import { api } from '@/lib/api';
import { formatComplianceDate } from '@/lib/format-date';
import { labelForProximateStatus } from '@/lib/proximate-status-labels';
import { proxPillForStatus } from '@/components/proximate/status-badge';
import { EmptyState } from '@/components/proximate/empty-state';
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

// Priority queues (PF-UX-090): needs-action stages first, in urgency order.
// Completed (verified) history collapses below these.
const NEEDS_ACTION_SECTIONS: {
  key: string; tone: string; match: (d: Disbursement) => boolean;
}[] = [
  { key: 'overdue', tone: 'danger', match: (d) => d.status === 'pending_report' && d.overdue },
  { key: 'flagged', tone: 'danger', match: (d) => d.status === 'flagged' },
  { key: 'cosign', tone: 'warn', match: (d) => d.status === 'pending_cosign' },
  { key: 'review', tone: 'warn', match: (d) => d.status === 'reported' },
  { key: 'due', tone: 'acc', match: (d) => d.status === 'pending_report' && !d.overdue },
];

// The single next action for a row's stage — one obvious verb, not a row of
// competing controls (PF-MOB-012 / PF-UX one-primary-action).
function actionKey(status: string): string {
  switch (status) {
    case 'pending_cosign': return 'proximate.disbursements.action_cosign';
    case 'reported': return 'proximate.disbursements.action_review';
    case 'flagged': return 'proximate.disbursements.action_resolve';
    default: return 'proximate.disbursements.action_view';
  }
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
  // Fixture rows are hidden by default so a live session does not open on a
  // list of QA Fixture / UAT records. Never removed — the count stays
  // visible and one click brings them back.
  const [showTest, setShowTest] = useState(false);
  // Redesign (PF-UX-090): the register groups into needs-action queues; the
  // completed (verified) history collapses so it never sits at the same
  // prominence as unresolved risk.
  const [showCompleted, setShowCompleted] = useState(false);
  const { real: realRows, test: testRows } = useMemo(
    () => splitTestRecords(rows ?? [], (d) => d.partner_name),
    [rows],
  );
  const countedRows = useMemo(
    () => (showTest ? [...realRows, ...testRows] : realRows),
    [realRows, testRows, showTest],
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

  const inNeedsAction = (d: Disbursement) =>
    NEEDS_ACTION_SECTIONS.some((s) => s.match(d));
  const sectioned = NEEDS_ACTION_SECTIONS
    .map((s) => ({
      ...s,
      rows: countedRows
        .filter(s.match)
        .sort((a, b) =>
          s.key === 'overdue'
            // most overdue first
            ? (a.report_due_at ? Date.parse(a.report_due_at) : 0) - (b.report_due_at ? Date.parse(b.report_due_at) : 0)
            : (b.sent_at ? Date.parse(b.sent_at) : 0) - (a.sent_at ? Date.parse(a.sent_at) : 0)),
    }))
    .filter((s) => s.rows.length > 0);
  // Everything not needing action (verified + any residual status) collapses
  // into the completed group — nothing is dropped from the register.
  const completedRows = countedRows
    .filter((d) => !inNeedsAction(d))
    .sort((a, b) => (b.sent_at ? Date.parse(b.sent_at) : 0) - (a.sent_at ? Date.parse(a.sent_at) : 0));

  const renderRow = (d: Disbursement, i: number) => {
    const isReport = d.status === 'pending_report';
    const age = isReport ? dueAge(d.report_due_at) : null;
    return (
      <div key={d.id} className="prox-qrow" style={i === 0 ? { borderTop: 0 } : undefined}>
        <Link href={`/proximate/disbursements/${d.id}`} className="min-w-0 block">
          <div className="flex items-center gap-2 flex-wrap">
            <strong className="truncate" style={{ fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif', fontSize: 14, fontWeight: 700 }}>
              {d.partner_name || `Partner #${d.partner_id}`}
            </strong>
            {/* One workflow badge per row; lateness is supporting text below,
                not a competing pill (PF-UX-005 / PF-MOB-017). */}
            <span className={`prox-pill ${proxPillForStatus(d.status)}`}>
              {labelForProximateStatus(d.status, t)}
            </span>
            {showTest && isTestRecord(d.partner_name) && (
              <span className="prox-pill slate">{t('common.test_record')}</span>
            )}
          </div>
          <small className="block" style={{ marginTop: 3 }}>
            {d.amount_usd != null && (
              <span className="prox-mono" style={{ fontWeight: 600, color: 'var(--prox-ink)' }}>${d.amount_usd.toLocaleString()}</span>
            )}
            {age && (
              <span style={age.late ? { color: 'var(--prox-danger)', fontWeight: 600 } : undefined}>
                {' · '}{age.text}
              </span>
            )}
            {!age && d.sent_at && <> · {formatComplianceDate(d.sent_at)}</>}
            {d.purpose && <> · {d.purpose}</>}
          </small>
        </Link>
        {isReport && d.report_token ? (
          <button
            className="prox-btn ghost"
            style={{ height: 30, fontSize: 12, padding: '0 11px' }}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); copyReportUrl(d); }}
          >
            {copied === d.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied === d.id ? t('proximate.disbursements.copied') : t('proximate.disbursements.copy_report_link')}
          </button>
        ) : (
          <Link
            href={`/proximate/disbursements/${d.id}`}
            className="text-xs self-center whitespace-nowrap inline-flex items-center min-h-[24px]"
            style={{ color: 'var(--prox-muted)' }}
          >
            {t(actionKey(d.status))} →
          </Link>
        )}
      </div>
    );
  };

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
          <Card>
            <EmptyState compact icon={Inbox} title={t('proximate.disbursements.empty')} />
          </Card>
        )}
        {!loadError && rows !== null && rows.length > 0 && (
          <div className="space-y-4">
            {testRows.length > 0 && (
              <div className="flex justify-end">
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
              </div>
            )}

            {/* Needs-action queues, most urgent first. */}
            {sectioned.map((s) => (
              <div key={s.key} className="prox-panel overflow-hidden">
                <div className="prox-phead">
                  <h2>{t(`proximate.disbursements.section_${s.key}`)}</h2>
                  <span className={`prox-pill ${s.tone}`}>{s.rows.length}</span>
                </div>
                <div>{s.rows.map((d, i) => renderRow(d, i))}</div>
              </div>
            ))}

            {sectioned.length === 0 && (
              <div className="prox-panel" style={{ padding: '18px' }}>
                <p className="text-sm" style={{ color: 'var(--prox-muted)' }}>
                  {t('proximate.disbursements.needs_action_none')}
                </p>
              </div>
            )}

            {/* Completed (verified) history — collapsed by default. */}
            {completedRows.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowCompleted((v) => !v)}
                  className="text-xs px-3 py-1 rounded-full border border-dashed transition-colors"
                  style={showCompleted
                    ? { background: 'var(--prox-slate)', color: '#fff', borderColor: 'transparent' }
                    : { background: 'var(--prox-surface)', color: 'var(--prox-muted)', borderColor: 'var(--prox-line-2)' }}
                >
                  {showCompleted
                    ? t('proximate.disbursements.hide_completed')
                    : t('proximate.disbursements.show_completed', { n: completedRows.length })}
                </button>
                {showCompleted && (
                  <div className="prox-panel overflow-hidden mt-3">
                    <div className="prox-phead">
                      <h2>{t('proximate.disbursements.section_verified')}</h2>
                      <span className="prox-pill good">{completedRows.length}</span>
                    </div>
                    <div>{completedRows.map((d, i) => renderRow(d, i))}</div>
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
