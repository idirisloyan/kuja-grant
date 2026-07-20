'use client';

/**
 * Saxansaxo ops dashboard — SCLR micro-grants console (v0, July 2026).
 *
 * One screen answering the team's only operational questions:
 *   - who is waiting on money, and for how many days (the 10-day clock)
 *   - how much envelope is left per fund
 *   - what the outcomes are teaching us
 *   - which localities are paused for political interference
 *
 * Design posture: the dashboard records the story of decisions; it has
 * NO spend-policing surfaces by design (see Saxansaxo design doc).
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Loader2, Timer, Wallet, Sprout, PauseCircle, Plus, ArrowRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';
import { SAX_STAGE_LABELS, SAX_STAGE_ORDER } from '@/lib/saxansaxo';

interface AwaitingGrant {
  id: number;
  group_id: number;
  group_name: string;
  amount_usd: number;
  sla_days: number | null;
  sla_breached: boolean;
  selected_at: string | null;
}

interface Fund {
  id: number;
  name: string;
  donor_name: string;
  total_usd: number;
  committed_usd: number;
  disbursed_usd: number;
  remaining_usd: number;
}

interface Pause {
  id: number;
  locality: string;
  reason: string;
  paused_at: string | null;
  active: boolean;
}

interface Overview {
  success: boolean;
  groups_total: number;
  stage_counts: Record<string, number>;
  clock: {
    sla_days: number;
    awaiting_disbursement: AwaitingGrant[];
    avg_days_to_disburse: number | null;
    breaches: number;
  };
  funds: Fund[];
  outcomes: Record<string, number>;
  co_contribution_count: number;
  active_pauses: Pause[];
}

const OUTCOME_LABELS: Record<string, string> = {
  delivered: 'Delivered',
  partial: 'Partially delivered',
  learning_loss: 'Learning loss',
};

export default function SaxansaxoAdminPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inline create forms (v0 — no dialogs)
  const [showFundForm, setShowFundForm] = useState(false);
  const [fundName, setFundName] = useState('');
  const [fundTotal, setFundTotal] = useState('');
  const [showPauseForm, setShowPauseForm] = useState(false);
  const [pauseLocality, setPauseLocality] = useState('');
  const [pauseReason, setPauseReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<Overview>('/saxansaxo/overview');
      setData(res);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createFund = async () => {
    if (!fundName.trim() || !fundTotal.trim()) return;
    setSaving(true);
    try {
      await api.post('/saxansaxo/funds', {
        name: fundName.trim(),
        total_usd: parseFloat(fundTotal),
      });
      setFundName(''); setFundTotal(''); setShowFundForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create fund');
    } finally {
      setSaving(false);
    }
  };

  const createPause = async () => {
    if (!pauseLocality.trim() || !pauseReason.trim()) return;
    setSaving(true);
    try {
      await api.post('/saxansaxo/pauses', {
        locality: pauseLocality.trim(),
        reason: pauseReason.trim(),
      });
      setPauseLocality(''); setPauseReason(''); setShowPauseForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to record pause');
    } finally {
      setSaving(false);
    }
  };

  const liftPause = async (id: number) => {
    setSaving(true);
    try {
      await api.post(`/saxansaxo/pauses/${id}/lift`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to lift pause');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageShell>
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      </PageShell>
    );
  }

  if (error || !data) {
    return (
      <PageShell>
        <Card className="p-6 text-sm text-red-600 dark:text-red-400">
          {error || 'Could not load the Saxansaxo dashboard.'}
        </Card>
      </PageShell>
    );
  }

  const clock = data.clock;

  return (
    <PageShell>
      <PageHeader
        title="Saxansaxo"
        subtitle="SCLR micro-grants — Somalia. The one metric that matters: days from selection to money in hand."
        icon={Sprout}
        primaryAction={
          <Link href="/saxansaxo/groups" className={buttonVariants({ size: 'sm' })}>
            Community groups <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        }
      />
      <PageMain>
        <div className="space-y-4">
          {/* Stage pipeline strip */}
          <Card className="p-4">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Pipeline — {data.groups_total} group{data.groups_total === 1 ? '' : 's'}
            </div>
            <div className="flex flex-wrap gap-2">
              {SAX_STAGE_ORDER.map((s) => (
                <div key={s} className="rounded-md border border-border px-3 py-1.5 text-xs">
                  <span className="font-semibold mr-1.5">{data.stage_counts[s] || 0}</span>
                  <span className="text-muted-foreground">{SAX_STAGE_LABELS[s]}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* 10-day clock */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Timer className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
                The {clock.sla_days}-day clock
              </div>
              <div className="text-xs text-muted-foreground">
                {clock.avg_days_to_disburse != null
                  ? `Average so far: ${clock.avg_days_to_disburse} days`
                  : 'No disbursements yet'}
                {clock.breaches > 0 && (
                  <span className="ml-2 text-amber-600 dark:text-amber-400">
                    {clock.breaches} over {clock.sla_days} days
                  </span>
                )}
              </div>
            </div>
            {clock.awaiting_disbursement.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nobody is waiting on money right now.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {clock.awaiting_disbursement.map((g) => (
                  <li key={g.id} className="py-2 flex items-center justify-between gap-3">
                    <Link
                      href={`/saxansaxo/groups/${g.group_id}/`}
                      className="text-sm hover:underline min-w-0 truncate"
                    >
                      {g.group_name}
                    </Link>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-muted-foreground">
                        ${(g.amount_usd || 0).toLocaleString()}
                      </span>
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          g.sla_breached
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                            : (g.sla_days ?? 0) >= clock.sla_days - 2
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        }`}
                      >
                        day {g.sla_days ?? 0} of {clock.sla_days}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Funds */}
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Wallet className="w-4 h-4 text-[hsl(var(--kuja-clay))]" /> Funds
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowFundForm((v) => !v)}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Fund
                </Button>
              </div>
              {showFundForm && (
                <div className="mb-3 space-y-2 rounded-md border border-border p-3">
                  <Input
                    placeholder="Fund name (e.g. Resilio 2026)"
                    value={fundName}
                    onChange={(e) => setFundName(e.target.value)}
                  />
                  <Input
                    placeholder="Total USD"
                    type="number"
                    value={fundTotal}
                    onChange={(e) => setFundTotal(e.target.value)}
                  />
                  <Button size="sm" onClick={createFund} disabled={saving}>
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create fund'}
                  </Button>
                </div>
              )}
              {data.funds.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No funds yet — create the Resilio envelope to start granting.
                </p>
              ) : (
                <ul className="space-y-3">
                  {data.funds.map((f) => {
                    const pct = f.total_usd > 0
                      ? Math.min(100, Math.round((f.committed_usd / f.total_usd) * 100))
                      : 0;
                    return (
                      <li key={f.id}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{f.name}</span>
                          <span className="text-xs text-muted-foreground">
                            ${f.remaining_usd.toLocaleString()} left of ${f.total_usd.toLocaleString()}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-[hsl(var(--kuja-clay))]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {f.donor_name} · ${f.committed_usd.toLocaleString()} committed ·
                          {' '}${f.disbursed_usd.toLocaleString()} disbursed
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            {/* Outcomes + learning */}
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm font-semibold mb-3">
                <Sprout className="w-4 h-4 text-[hsl(var(--kuja-clay))]" /> What the grants taught us
              </div>
              <div className="flex flex-wrap gap-2 mb-2">
                {Object.entries(data.outcomes).map(([tag, n]) => (
                  <div key={tag} className="rounded-md border border-border px-3 py-1.5 text-xs">
                    <span className="font-semibold mr-1.5">{n}</span>
                    <span className="text-muted-foreground">{OUTCOME_LABELS[tag] || tag}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {data.co_contribution_count} group{data.co_contribution_count === 1 ? '' : 's'} added
                their own contribution (money, labour or materials) — counted, never mandated.
              </p>
            </Card>
          </div>

          {/* Political-interference pause register */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <PauseCircle className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
                Paused localities
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowPauseForm((v) => !v)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Pause
              </Button>
            </div>
            {showPauseForm && (
              <div className="mb-3 space-y-2 rounded-md border border-border p-3">
                <Input
                  placeholder="Locality"
                  value={pauseLocality}
                  onChange={(e) => setPauseLocality(e.target.value)}
                />
                <Input
                  placeholder="Reason (e.g. office-holder attempted to steer selection)"
                  value={pauseReason}
                  onChange={(e) => setPauseReason(e.target.value)}
                />
                <Button size="sm" onClick={createPause} disabled={saving}>
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Record pause'}
                </Button>
              </div>
            )}
            {data.active_pauses.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No localities are paused. When an office-holder tries to steer selection, the team
                withdraws from that locality and records it here.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {data.active_pauses.map((p) => (
                  <li key={p.id} className="py-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{p.locality}</div>
                      <div className="text-xs text-muted-foreground truncate">{p.reason}</div>
                    </div>
                    <Button
                      variant="outline" size="sm" disabled={saving}
                      onClick={() => liftPause(p.id)}
                    >
                      Lift
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </PageMain>
    </PageShell>
  );
}
