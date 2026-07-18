'use client';

/**
 * Proximate disbursements list — Phase 653 (June 2026).
 *
 * OB sees every money release tagged to a Proximate partner, sorted
 * newest first, with the report-obligation status. Each row links
 * to a per-disbursement detail (deferred); for now the report token
 * is surfaced inline so the OB can copy the partner-facing URL.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Plus, Copy, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { labelForProximateStatus } from '@/lib/proximate-status-labels';
import { useAuthStore } from '@/stores/auth-store';
import { useProximatePersona } from '@/lib/hooks/use-proximate-persona';
import { useTranslation } from '@/lib/hooks/use-translation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TONE_CLASSES, toneForProximateStatus } from '@/components/proximate/status-badge';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';

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
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => {
    if (!isOperator) return; // Don't even fetch — donors aren't supposed to see this.
    let cancelled = false;
    api.get<{ disbursements: Disbursement[] }>('/api/proximate/disbursements')
      .then((r) => { if (!cancelled) setRows(r.disbursements || []); })
      .catch(() => { if (!cancelled) setRows([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOperator]);

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
        {rows !== null && rows.length === 0 && !loading && (
          <Card className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {t('proximate.disbursements.empty')}
            </p>
          </Card>
        )}
        {rows !== null && rows.length > 0 && (
          <ul className="space-y-2">
            {rows.map((d) => (
              <li key={d.id}>
                <Card className="p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start gap-3 flex-wrap">
                    <Link href={`/proximate/disbursements/${d.id}`} className="flex-1 min-w-0 block">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium truncate">
                          {d.partner_name || `Partner #${d.partner_id}`}
                        </h3>
                        <Badge variant="outline" className={`text-[10px] ${TONE_CLASSES[toneForProximateStatus(d.status)]}`}>
                          {labelForProximateStatus(d.status, t)}
                        </Badge>
                        {d.overdue && (
                          <Badge variant="outline" className="text-[10px] bg-red-100 text-red-800 border-red-300">
                            {t('proximate.disbursements.overdue')}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1">
                        {d.amount_usd && (
                          <span>${d.amount_usd.toLocaleString()}</span>
                        )}
                        {d.purpose && <span>· {d.purpose}</span>}
                        {d.sent_at && (
                          <span>· {new Date(d.sent_at).toLocaleDateString()}</span>
                        )}
                        {d.report_due_at && d.status === 'pending_report' && (
                          <span>· {t('proximate.disbursements.due')} {new Date(d.report_due_at).toLocaleDateString()}</span>
                        )}
                      </div>
                    </Link>
                    {d.report_token && d.status === 'pending_report' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); copyReportUrl(d); }}
                      >
                        {copied === d.id ? (
                          <Check className="w-3.5 h-3.5 me-1" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 me-1" />
                        )}
                        {copied === d.id
                          ? t('proximate.disbursements.copied')
                          : t('proximate.disbursements.copy_link')}
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </PageMain>
    </PageShell>
  );
}
