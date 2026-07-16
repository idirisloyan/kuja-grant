'use client';

/**
 * Proximate operator dashboard — Phase 643 (June 2026).
 *
 * Single-pane signal grid for the OB. Hits /api/proximate/overview
 * and renders the three things the OB needs to triage now:
 *
 *   • Partners by status (intake / dd_pending / dd_clear / suspended).
 *   • Open interventions, with expired callout (those need response
 *     within 24/72/120h windows; expired = response window blown).
 *   • Endorsers pending KYC review.
 *   • Monitoring-due flags for this calendar month (SOP 12 cadence).
 *   • FSP registry size, as a smoke check that disbursement infra
 *     is wired.
 *   • Recent audit-chain rows (Proximate-flavoured actions only) so
 *     the OB can see what happened across the tenant without drill-
 *     ing into each partner.
 *
 * No state mutations live here — every action lives on the partner
 * detail page where the OB is making the call against a specific
 * partner. This is pure navigation.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ShieldCheck, ShieldAlert, Activity, Users, FileText, Banknote, Coins, UserPlus, Flame } from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useProximatePersona } from '@/lib/hooks/use-proximate-persona';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { labelForProximateAction } from '@/lib/proximate-audit-labels';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';
import { AttentionQueue } from '@/components/proximate/attention-queue';

interface Overview {
  success: boolean;
  partners_by_status: Record<string, number>;
  partners_total: number;
  interventions: {
    open: number;
    expired: number;
    escalated: number;
    total: number;
  };
  endorsers_pending: number;
  monitoring_due_this_month: number;
  fsps_registered: number;
  month: string;
  recent_audit: Array<{
    seq: number;
    action: string;
    actor_email: string;
    subject_kind: string;
    subject_id: number;
    created_at: string | null;
  }>;
}

export function ProximateAdminClient() {
  const { t } = useTranslation();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { persona, isLoading: personaLoading } = useProximatePersona();

  // Phase 713 — persona-aware redirect. A donor landing on
  // /proximate/admin used to see "Access denied" — needlessly hostile
  // when the same login has a valid landing surface at
  // /proximate/donor. Silently redirect so the demo viewer never
  // sees a wrong-persona wall.
  useEffect(() => {
    if (personaLoading) return;
    if (persona === 'donor' && typeof window !== 'undefined') {
      window.location.replace('/proximate/donor');
    }
  }, [persona, personaLoading]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get<Overview>('/api/proximate/overview')
      .then((r) => { if (!cancelled) setData(r); })
      .catch(() => {
        if (!cancelled) setError(t('proximate.admin.overview_failed'));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PageShell>
      <PageHeader
        title={t('proximate.admin.title')}
        subtitle={t('proximate.admin.subtitle')}
      />
      <PageMain>
        {loading && (
          <p className="text-sm text-muted-foreground">
            {t('proximate.admin.loading')}
          </p>
        )}
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
        {data && (
          <div className="space-y-4">
            {/* Phase 717 — the single "what needs a human now" feed, above
                everything. Converts the state machines into a to-do list. */}
            <AttentionQueue />

            {/* Top row — the 4 numbers that matter most */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    {t('proximate.admin.partners')}
                  </p>
                </div>
                <p className="text-3xl font-semibold">{data.partners_total}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {(data.partners_by_status.dd_clear ?? 0)}{' '}
                  {t('proximate.admin.cleared')}
                </p>
              </Card>

              <Card className={`p-4 ${data.interventions.expired > 0 ? 'border-destructive' : ''}`}>
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className={`w-4 h-4 ${data.interventions.expired > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    {t('proximate.admin.open_interventions')}
                  </p>
                </div>
                <p className="text-3xl font-semibold">
                  {data.interventions.total}
                </p>
                {data.interventions.expired > 0 ? (
                  <p className="text-xs text-destructive mt-1 font-medium">
                    {data.interventions.expired}{' '}
                    {t('proximate.admin.expired_response')}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('proximate.admin.all_within_window')}
                  </p>
                )}
              </Card>

              <Link href="/proximate/admin/endorsers" className="block">
                <Card className="p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      {t('proximate.admin.endorsers_pending')}
                    </p>
                  </div>
                  <p className="text-3xl font-semibold">{data.endorsers_pending}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('proximate.admin.kyc_review_needed')}
                  </p>
                </Card>
              </Link>

              <Card className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    {t('proximate.admin.monitoring_due')}
                  </p>
                </div>
                <p className="text-3xl font-semibold">
                  {data.monitoring_due_this_month}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {data.month}
                </p>
              </Card>
            </div>

            {/* Workflow tiles — Phase 654: surface the new flows so the OB
                doesn't have to type URLs. */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Link href="/proximate/rounds" className="block">
                <Card className="p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <Coins className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      {t('proximate.admin.tile_rounds')}
                    </p>
                  </div>
                  <p className="text-sm font-medium">
                    {t('proximate.admin.tile_rounds_sub')}
                  </p>
                  {/* Phase 701 — surface the round-create CTA on the
                      operator dashboard. Reviewer noted no obvious
                      "New round" entry point from /proximate/admin. */}
                  <Link
                    href="/proximate/rounds/new"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
                  >
                    + {t('proximate.rounds.new') || 'Start new round'}
                  </Link>
                </Card>
              </Link>
              <Link href="/proximate/disbursements" className="block">
                <Card className="p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <Banknote className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      {t('proximate.admin.tile_disbursements')}
                    </p>
                  </div>
                  <p className="text-sm font-medium">
                    {t('proximate.admin.tile_disbursements_sub')}
                  </p>
                </Card>
              </Link>
              <Link href="/proximate-nominate" className="block" target="_blank">
                <Card className="p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <UserPlus className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      {t('proximate.admin.tile_self_nominate')}
                    </p>
                  </div>
                  <p className="text-sm font-medium">
                    {t('proximate.admin.tile_self_nominate_sub')}
                  </p>
                </Card>
              </Link>
              <Link href="/proximate/crisis-selector" className="block">
                <Card className="p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <Flame className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      {t('proximate.admin.tile_crisis_selector')}
                    </p>
                  </div>
                  <p className="text-sm font-medium">
                    {t('proximate.admin.tile_crisis_selector_sub')}
                  </p>
                </Card>
              </Link>
              {/* Phase 716c — grievance triage queue */}
              <Link href="/proximate/admin/grievances" className="block">
                <Card className="p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldAlert className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      {t('proximate.grievance_queue.title')}
                    </p>
                  </div>
                  <p className="text-sm font-medium">
                    {t('proximate.grievance_queue.subtitle')}
                  </p>
                </Card>
              </Link>
              {/* Phase 717 — OB-on-behalf nomination (was API-only) */}
              <Link href="/proximate/admin/partners/new" className="block">
                <Card className="p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <UserPlus className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      {t('proximate.admin.tile_nominate_partner') || 'Nominate a partner'}
                    </p>
                  </div>
                  <p className="text-sm font-medium">
                    {t('proximate.admin.tile_nominate_partner_sub')
                      || 'Register a partner directly, with bank details.'}
                  </p>
                </Card>
              </Link>
              {/* Phase 717 — FSP registry (was API-only) */}
              <Link href="/proximate/admin/fsps" className="block">
                <Card className="p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <Banknote className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      {t('proximate.admin.tile_register_fsp') || 'Register a provider'}
                    </p>
                  </div>
                  <p className="text-sm font-medium">
                    {t('proximate.admin.tile_register_fsp_sub')
                      || 'Add a bank, hawala, or mobile-money provider.'}
                  </p>
                </Card>
              </Link>
            </div>

            {/* Partners by status — secondary detail */}
            <Card className="p-4">
              <p className="text-sm font-medium mb-3">
                {t('proximate.admin.by_status')}
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.partners_by_status).map(([status, n]) => (
                  <Badge key={status} variant="outline" className="text-xs">
                    {status}: {n}
                  </Badge>
                ))}
              </div>
            </Card>

            {/* FSP smoke-check */}
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm">
                  {t('proximate.admin.fsps_registered')}
                </p>
                <p className="text-lg font-semibold">{data.fsps_registered}</p>
              </div>
            </Card>

            {/* Recent audit feed */}
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-medium">
                  {t('proximate.admin.recent_activity')}
                </p>
              </div>
              {data.recent_audit.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t('proximate.admin.no_activity')}
                </p>
              ) : (
                <ul className="space-y-1.5 text-xs">
                  {data.recent_audit.map((row) => (
                    <li key={row.seq} className="flex items-center gap-2">
                      <span className="text-muted-foreground tabular-nums">
                        #{row.seq}
                      </span>
                      <span title={row.action}>
                        {labelForProximateAction(row.action)}
                      </span>
                      <span className="text-muted-foreground">
                        ({row.subject_kind.replace('proximate_', '')} #{row.subject_id})
                      </span>
                      <span className="text-muted-foreground ms-auto">
                        {row.actor_email}
                      </span>
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
