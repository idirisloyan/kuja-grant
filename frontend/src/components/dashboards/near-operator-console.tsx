'use client';

/**
 * NEAR Operator Console — admin dashboard for the NEAR tenant.
 *
 * Shows the network operator's at-a-glance view of every working part:
 *   - Membership pipeline (pending review, active, etc.)
 *   - Funds + windows
 *   - Active declarations (in_review, signed_active)
 *   - Latest published Crisis Monitoring Report
 *   - Quick navigation tiles to the per-area admin pages
 *
 * Replaces the generic Kuja admin dashboard (AdminOpsPanel, AI budget
 * card, etc.) when the admin is operating in the NEAR tenant.
 */

import Link from 'next/link';
import {
  useFunds,
  usePendingMemberships,
  useDeclarations,
  useLatestCrisisReport,
} from '@/lib/hooks/use-api';
import { FundTree } from '@/components/dashboards/fund-tree';
import {
  Users, Coins, Siren, AlertOctagon, ShieldCheck, Clock,
  ChevronRight, BarChart3, Flag, Sparkles,
} from 'lucide-react';

export function NearOperatorConsole() {
  const { data: fundsData } = useFunds();
  const funds = fundsData?.funds ?? [];

  // Membership counts across statuses
  const { data: pendingData } = usePendingMemberships('all');
  const memberships = pendingData?.memberships ?? [];
  const counts = memberships.reduce(
    (acc, m) => {
      acc[m.status] = (acc[m.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  // Declarations by status
  const { data: declData } = useDeclarations();
  const declarations = declData?.declarations ?? [];
  const declCounts = declarations.reduce(
    (acc, d) => {
      acc[d.status] = (acc[d.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  // Latest published crisis monitoring
  const { data: crisisData } = useLatestCrisisReport();
  const crisis = crisisData?.report ?? null;

  // Total windows across all funds
  const totalWindows = funds.reduce((acc, f) => acc + (f.window_count || 0), 0);

  // Pending review counts for the cross-cutting strip
  const pendingMembers = (counts.pending || 0) + (counts.under_review || 0);

  return (
    <div className="space-y-5">
      {/* Cross-cutting attention strip — items that need OB action, not
          tied to a single fund/window. Members + Crisis Monitoring sit
          across all funds; the tree below organises the rest. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <AttentionTile
          icon={<Users className="w-4 h-4" />}
          label="Pending member review"
          value={pendingMembers}
          sub={pendingMembers > 0 ? 'awaiting OB decision' : 'no applications waiting'}
          tone={pendingMembers > 0 ? 'warn' : 'muted'}
          href="/admin/network-memberships/"
        />
        <AttentionTile
          icon={<AlertOctagon className="w-4 h-4" />}
          label="Crisis monitoring (latest)"
          value={crisis?.flagged_row_count ?? 0}
          sub={
            crisis
              ? `flagged · week of ${new Date(crisis.period_start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
              : 'no published report'
          }
          tone={(crisis?.flagged_row_count ?? 0) > 0 ? 'warn' : 'muted'}
          href="/admin/crisis-monitoring/"
        />
      </div>

      {/* Fund → Window tree — the actual organising structure of the
          network. Scales from 1 fund to N without restructure. */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="kuja-eyebrow text-[10px]">Funds, windows, grants</h2>
          <Link
            href="/admin/funds/"
            className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            Manage <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        <FundTree />
      </section>

      {/* Pending members + recent declarations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Membership pipeline */}
        <section className="border border-border rounded-lg bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
              Membership pipeline
            </h2>
            <Link
              href="/admin/network-memberships"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          {memberships.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No memberships yet.</p>
          ) : (
            <ul className="text-xs space-y-1.5">
              <PipelineRow
                label="Pending review"
                count={(counts.pending || 0) + (counts.under_review || 0)}
                tone="warn"
                href="/admin/network-memberships?status=pending"
              />
              <PipelineRow label="Active members" count={counts.active || 0} tone="good" />
              <PipelineRow label="Rejected (cooldown)" count={counts.rejected || 0} tone="muted" />
              <PipelineRow label="Suspended" count={counts.suspended || 0} tone="warn" />
            </ul>
          )}
        </section>

        {/* Recent declarations */}
        <section className="border border-border rounded-lg bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Siren className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
              Recent declarations
            </h2>
            <Link
              href="/admin/declarations"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          {declarations.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No declarations yet.</p>
          ) : (
            <ul className="text-xs space-y-1.5">
              {declarations.slice(0, 5).map((d) => (
                <li key={d.id} className="border-l-2 border-border pl-2.5 py-1">
                  <Link
                    href={`/admin/declarations/${d.id}`}
                    className="block hover:bg-muted/30 -mx-1 px-1 rounded-md"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium truncate">{d.title}</span>
                      <StatusChip status={d.status} />
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {d.country && <span>{d.country} · </span>}
                      {d.signed_count}/{d.required_signer_count} signed
                      {d.recused_count > 0 && <> · {d.recused_count} recused</>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Latest crisis monitoring report */}
      {crisis && (
        <section className="border border-border rounded-lg bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
              Latest Crisis Monitoring Report
            </h2>
            <Link
              href={`/admin/crisis-monitoring/${crisis.id}`}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              Open <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Period</div>
              <div className="font-medium">
                {new Date(crisis.period_start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – {new Date(crisis.period_end).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Rows</div>
              <div className="font-medium">{crisis.row_count}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Flagged</div>
              <div className="font-medium inline-flex items-center gap-1">
                <Flag className="w-3 h-3 text-[hsl(var(--kuja-clay))]" />
                {crisis.flagged_row_count}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Audit anchor</div>
              <div className="font-medium inline-flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-[hsl(var(--kuja-grow))]" />
                #{crisis.cron_anchor_audit_id ?? '—'}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Quick actions tile strip */}
      <section className="border border-border rounded-lg bg-card p-5 space-y-3">
        <h2 className="font-semibold text-sm">Operator quick links</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-xs">
          <QuickTile href="/admin/network-memberships" icon={<Users className="w-3 h-3" />} label="Memberships" />
          <QuickTile href="/admin/funds" icon={<Coins className="w-3 h-3" />} label="Funds / windows" />
          <QuickTile href="/admin/crisis-monitoring" icon={<AlertOctagon className="w-3 h-3" />} label="Crisis Monitoring" />
          <QuickTile href="/admin/declarations" icon={<Siren className="w-3 h-3" />} label="Declarations" />
          <QuickTile href="/admin/audit-chain" icon={<ShieldCheck className="w-3 h-3" />} label="Audit chain" />
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  icon, label, value, sub, href,
}: {
  icon: React.ReactNode; label: string; value: React.ReactNode; sub: string; href: string;
}) {
  return (
    <Link
      href={href}
      className="block border border-border rounded-lg bg-card p-3 space-y-1 hover:bg-muted/30 transition-colors"
    >
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1">
        {icon} {label}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-[10px] text-muted-foreground truncate">{sub}</div>
    </Link>
  );
}

function AttentionTile({
  icon, label, value, sub, tone, href,
}: {
  icon: React.ReactNode; label: string; value: number; sub: string;
  tone: 'warn' | 'good' | 'muted'; href: string;
}) {
  const accent =
    tone === 'warn'
      ? 'border-[hsl(var(--kuja-sun))]/40 bg-[hsl(var(--kuja-sun))]/5'
      : tone === 'good'
      ? 'border-[hsl(var(--kuja-grow))]/40 bg-[hsl(var(--kuja-grow))]/5'
      : 'border-border bg-card';
  const valueCls =
    tone === 'warn'
      ? 'text-[hsl(var(--kuja-sun))]'
      : tone === 'good'
      ? 'text-[hsl(var(--kuja-grow))]'
      : 'text-foreground';
  return (
    <Link
      href={href}
      className={`block border rounded-lg p-3 hover:bg-muted/30 transition-colors ${accent}`}
    >
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1">
        {icon} {label}
      </div>
      <div className={`text-2xl font-bold mt-0.5 ${valueCls}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground truncate">{sub}</div>
    </Link>
  );
}

function PipelineRow({
  label, count, tone, href,
}: {
  label: string; count: number; tone: 'good' | 'warn' | 'muted'; href?: string;
}) {
  const dot =
    tone === 'good' ? 'bg-[hsl(var(--kuja-grow))]'
    : tone === 'warn' ? 'bg-[hsl(var(--kuja-sun))]'
    : 'bg-muted-foreground/40';
  const inner = (
    <>
      <span className="flex items-center gap-2">
        <span className={`inline-block w-2 h-2 rounded-full ${dot}`} aria-hidden="true" />
        {label}
      </span>
      <span className="font-mono font-semibold">{count}</span>
    </>
  );
  const cls = 'flex items-center justify-between py-1 border-b border-border last:border-b-0';
  if (href) {
    return (
      <Link href={href} className={cls + ' hover:bg-muted/30 -mx-2 px-2 rounded-md'}>
        {inner}
      </Link>
    );
  }
  return <div className={cls}>{inner}</div>;
}

function StatusChip({ status }: { status: string }) {
  const tone =
    status === 'signed_active'
      ? 'bg-[hsl(var(--kuja-grow))]/15 text-[hsl(var(--kuja-grow))]'
      : status === 'in_review'
      ? 'bg-[hsl(var(--kuja-sun))]/15 text-[hsl(var(--kuja-sun))]'
      : status === 'cancelled' || status === 'rejected'
      ? 'bg-destructive/15 text-destructive'
      : 'bg-muted text-muted-foreground';
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold capitalize whitespace-nowrap ${tone}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function QuickTile({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border hover:bg-muted/40 transition-colors"
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
