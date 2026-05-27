'use client';

/**
 * /admin/windows/[id]/report — Phase 37 (May 2026).
 *
 * Per-window report viewer. Shows everything from
 * WindowReportService.build() — aggregate stats, SLA-vs-target hit rates,
 * declaration roster (signature methods + recusals + audit anchors),
 * grants per declaration, monitoring visits with community feedback,
 * and CSV / ZIP download links.
 */

import { useParams, useRouter } from 'next/navigation';
import { useWindowReport, type WindowReportDeclaration } from '@/lib/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import {
  ChevronLeft, FileSpreadsheet, Archive, Clock, ShieldCheck,
  ShieldAlert, MapPin, Users, Coins, AlertCircle,
} from 'lucide-react';

const SLA_GOOD = 'bg-[hsl(var(--kuja-grow))]/15 text-[hsl(var(--kuja-grow))]';
const SLA_BAD = 'bg-destructive/15 text-destructive';
const SLA_NEUTRAL = 'bg-muted text-muted-foreground';

export default function WindowReportClient() {
  const params = useParams();
  const windowId = Number(params?.id ?? '0');
  const router = useRouter();
  const viewer = useAuthStore((s) => s.user);
  const { data, isLoading } = useWindowReport(windowId || null);

  if (viewer && viewer.role !== 'admin') {
    return (
      <div className="p-6 text-sm">
        <p className="text-destructive">Only platform admins can view window reports.</p>
      </div>
    );
  }
  if (isLoading || !data) {
    return (
      <div className="space-y-3">
        <div className="kuja-shimmer h-10 w-72 rounded" />
        <div className="kuja-shimmer h-32 rounded" />
        <div className="kuja-shimmer h-48 rounded" />
      </div>
    );
  }
  if (!data.success) {
    return <div className="p-6 text-sm text-destructive">Failed to load report.</div>;
  }

  const { window, fund, stats, sla, declarations, audit_chain, generated_at } = data;
  const slaTotal72 = sla.app_window_hits + sla.app_window_misses;
  const slaTotal6d = sla.decision_hits + sla.decision_misses;
  const hitRate72 = slaTotal72 > 0 ? Math.round(100 * sla.app_window_hits / slaTotal72) : null;
  const hitRate6d = slaTotal6d > 0 ? Math.round(100 * sla.decision_hits / slaTotal6d) : null;

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => router.push('/admin/funds')}
        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
      >
        <ChevronLeft className="w-3 h-3" /> Back to funds
      </button>

      {/* Header */}
      <div className="border border-border rounded-lg bg-card p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="kuja-display text-2xl">
              {window.name} <span className="text-muted-foreground text-lg font-normal">— report</span>
            </h1>
            <div className="text-xs text-muted-foreground mt-1">
              {fund?.name} · {fund?.currency} · generated {new Date(generated_at).toLocaleString()}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`/api/windows/${windowId}/report.csv`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-muted"
            >
              <FileSpreadsheet className="w-3 h-3" /> Declarations CSV
            </a>
            <a
              href={`/api/windows/${windowId}/report/grants.csv`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-muted"
            >
              <FileSpreadsheet className="w-3 h-3" /> Grants CSV
            </a>
            <a
              href={`/api/windows/${windowId}/report.zip`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90"
            >
              <Archive className="w-3 h-3" /> Full bundle (ZIP)
            </a>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={<AlertCircle className="w-4 h-4" />} label="Declarations"
          value={`${stats.declarations_active} active`}
          sub={`${stats.declarations_total} total`} />
        <StatCard icon={<Coins className="w-4 h-4" />} label="Grants"
          value={stats.grants_total.toString()}
          sub={`${stats.total_disbursed_estimate.toLocaleString()} disbursed`} />
        <StatCard icon={<Users className="w-4 h-4" />} label="NGOs reached"
          value={stats.ngos_reached.toString()} sub="distinct" />
        <StatCard icon={<MapPin className="w-4 h-4" />} label="Countries"
          value={stats.countries_count.toString()}
          sub={stats.countries_covered.join(', ').slice(0, 40) || '—'} />
      </div>

      {/* SLA-vs-target */}
      <section className="border border-border rounded-lg bg-card p-5 space-y-3">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <Clock className="w-4 h-4" /> SLA performance
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <SlaBlock
            label={`Application window ≤ ${sla.target_app_window_hours}h`}
            hits={sla.app_window_hits} misses={sla.app_window_misses}
            rate={hitRate72}
          />
          <SlaBlock
            label={`Decision ≤ ${sla.target_decision_days} days`}
            hits={sla.decision_hits} misses={sla.decision_misses}
            rate={hitRate6d}
          />
        </div>
      </section>

      {/* Audit chain status */}
      {audit_chain && (
        <div className={
          'flex items-center gap-2 text-xs px-3 py-2 rounded-md border ' +
          (audit_chain.ok === true
            ? 'border-[hsl(var(--kuja-grow))]/30 bg-[hsl(var(--kuja-grow))]/10 text-[hsl(var(--kuja-grow))]'
            : audit_chain.ok === false
            ? 'border-destructive/30 bg-destructive/10 text-destructive'
            : 'border-border bg-muted text-muted-foreground')
        }>
          {audit_chain.ok === true ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
          <span>
            Audit chain {audit_chain.ok === true ? 'verified' : audit_chain.ok === false ? 'BROKEN' : 'unverified'}
            {audit_chain.total !== null && <> · {audit_chain.total} entries</>}
          </span>
        </div>
      )}

      {/* Declaration roster */}
      <section className="border border-border rounded-lg bg-card p-5 space-y-3">
        <h2 className="font-semibold text-sm">Declarations ({declarations.length})</h2>
        {declarations.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">No declarations in this window.</div>
        ) : (
          <ul className="space-y-3">
            {declarations.map((d) => <DeclarationRow key={d.id} d={d} />)}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatCard({ icon, label, value, sub }: {
  icon: React.ReactNode; label: string; value: string; sub: string;
}) {
  return (
    <div className="border border-border rounded-lg bg-card p-3 space-y-1">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        {icon} {label}
      </div>
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-[10px] text-muted-foreground truncate">{sub}</div>
    </div>
  );
}

function SlaBlock({ label, hits, misses, rate }: {
  label: string; hits: number; misses: number; rate: number | null;
}) {
  const tone = rate === null ? SLA_NEUTRAL
    : rate >= 80 ? SLA_GOOD
    : SLA_BAD;
  return (
    <div className="space-y-1">
      <div className="text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2">
        <span className={`px-2 py-1 rounded-md text-xs font-semibold ${tone}`}>
          {rate === null ? '—' : `${rate}% hit`}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {hits} hit · {misses} miss
        </span>
      </div>
    </div>
  );
}

function DeclarationRow({ d }: { d: WindowReportDeclaration }) {
  return (
    <li className="border border-border rounded-md bg-background p-3 space-y-2">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="font-medium text-sm">{d.title}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {d.status.replace('_', ' ')}
        </span>
      </div>
      <div className="text-[11px] text-muted-foreground flex flex-wrap gap-3">
        {d.country && <span>{d.country}</span>}
        {d.crisis_type && <span>{d.crisis_type}</span>}
        <span>
          {d.signed_count} signed
          {d.recused_count > 0 && <> · {d.recused_count} recused</>}
          {d.rejected_count > 0 && <> · {d.rejected_count} rejected</>}
        </span>
        <span>{d.grants.length} grant{d.grants.length !== 1 ? 's' : ''}</span>
        {d.signed_active_audit_id && (
          <span title={`Activation audit anchor: #${d.signed_active_audit_id}`}>
            🔒 #{d.signed_active_audit_id}
          </span>
        )}
      </div>
      {d.grants.length > 0 && (
        <ul className="text-[11px] text-muted-foreground space-y-0.5 pl-2 border-l border-border">
          {d.grants.map((g) => (
            <li key={g.id}>
              · {g.title} — {g.status}
              {g.amount && <> · {g.amount.toLocaleString()} {g.currency}</>}
            </li>
          ))}
        </ul>
      )}
      {d.monitoring_visits.length > 0 && (
        <div className="text-[11px] text-muted-foreground border-l border-border pl-2">
          <div className="font-medium text-foreground/80 mb-1">
            Monitoring ({d.monitoring_visits.length})
          </div>
          {d.monitoring_visits.slice(0, 3).map((v) => (
            <div key={v.id} className="mb-1">
              {v.visit_date} · {v.visit_mode}
              {v.community_feedback_summary && (
                <div className="italic">&ldquo;{v.community_feedback_summary}&rdquo;</div>
              )}
            </div>
          ))}
        </div>
      )}
    </li>
  );
}
