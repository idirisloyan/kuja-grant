'use client';

/**
 * /admin/funds — Phase 34 (May 2026).
 *
 * Admin / fund-manager page for managing the network's funds, windows,
 * and evaluation rubrics. Single page with three drill-down levels:
 *
 *   Fund list  →  Window list (per fund)  →  Rubric (per window)
 *
 * Minimal but functional: create new fund / new window / seed rubric.
 * Full template editor + per-criterion edit panel lands in a follow-up.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import {
  useFunds, useFund, useWindowRubric, useDeclarations, useWindowOperational,
  type Fund, type FundWindow, type WindowCriterion,
} from '@/lib/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { useNetworkStore } from '@/stores/network-store';
import Link from 'next/link';
import {
  Plus, Coins, Inbox, ChevronDown, ChevronRight, Sparkles,
  Lock, Gauge, Loader2, BarChart3, Wallet,
} from 'lucide-react';
import {
  PageShell, PageHeader, PageAttention, PageMain, type AttentionItem,
} from '@/components/layout/page-shell';

export default function FundsAdminPage() {
  const viewer = useAuthStore((s) => s.user);
  const network = useNetworkStore((s) => s.network);
  const { data, isLoading, mutate: refetchFunds } = useFunds();
  // Phase 49 — lead with operational state across the network. Per-window
  // rollups (open grants, due reports, top risks) still need a backend
  // endpoint; queued as an operational TODO in NEAR_BACKLOG.md.
  const { data: drafts } = useDeclarations('draft');
  const { data: inRev }  = useDeclarations('in_review');
  const { data: active } = useDeclarations('signed_active');
  const [showNewFund, setShowNewFund] = useState(false);
  const [openFundId, setOpenFundId] = useState<number | null>(null);

  if (viewer && viewer.role !== 'admin') {
    return (
      <div className="p-6 text-sm">
        <p className="text-destructive">
          Only platform admins can manage funds in this phase.
        </p>
      </div>
    );
  }

  const funds = data?.funds ?? [];

  // Attention items derived from operational state, not configuration.
  const attention: AttentionItem[] = [];
  const readyRelease = (active?.declarations ?? []).filter((d) => !d.applicants_notified_at);
  if (readyRelease.length > 0) {
    attention.push({
      tone: 'accent',
      label: `${readyRelease.length} declaration${readyRelease.length === 1 ? '' : 's'} ready to release`,
      hint: 'Signed_active — flip the auto-created grant drafts to open and notify shortlisted NGOs.',
    });
  }
  const inReviewCount = inRev?.declarations?.length ?? 0;
  if (inReviewCount > 0) {
    attention.push({
      tone: 'info',
      label: `${inReviewCount} declaration${inReviewCount === 1 ? '' : 's'} in committee review`,
    });
  }
  const draftCount = drafts?.declarations?.length ?? 0;
  if (draftCount > 0) {
    attention.push({
      tone: 'muted',
      label: `${draftCount} draft declaration${draftCount === 1 ? '' : 's'}`,
    });
  }

  return (
    <PageShell>
      <PageHeader
        title={network?.name ? `${network.name} — Funds & windows` : 'Funds & windows'}
        subtitle={`${funds.length} fund${funds.length === 1 ? '' : 's'} configured.`}
        icon={Wallet}
        primaryAction={
          <button
            type="button"
            onClick={() => setShowNewFund((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90"
          >
            <Plus className="w-4 h-4" /> New fund
          </button>
        }
      />

      <PageAttention items={attention} />

      <PageMain>
        {showNewFund && (
          <NewFundForm
            onCreate={async () => { await refetchFunds(); setShowNewFund(false); }}
            onCancel={() => setShowNewFund(false)}
          />
        )}

        {isLoading && (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="kuja-shimmer h-20 rounded" />)}
          </div>
        )}

        {!isLoading && funds.length === 0 && (
          <div className="border border-border rounded-lg bg-card p-10 text-center text-sm text-muted-foreground">
            <Coins className="w-8 h-8 mx-auto mb-2 opacity-50" />
            No funds yet. Create one to get started.
          </div>
        )}

        <div className="space-y-3">
          {funds.map((f) => (
            <FundCard
              key={f.id}
              fund={f}
              isOpen={openFundId === f.id}
              onToggle={() => setOpenFundId(openFundId === f.id ? null : f.id)}
              onUpdate={refetchFunds}
            />
          ))}
        </div>
      </PageMain>
    </PageShell>
  );
}

function NewFundForm({ onCreate, onCancel }: { onCreate: () => void; onCancel: () => void }) {
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!slug.trim() || !name.trim()) {
      toast.error('Slug + name are required.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/funds', {
        slug: slug.trim().toLowerCase(),
        name: name.trim(),
        short_description: shortDescription.trim() || undefined,
        currency: currency.trim().toUpperCase(),
      });
      toast.success('Fund created.');
      onCreate();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Create failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border border-border rounded-lg bg-card p-4 space-y-3">
      <h3 className="font-semibold text-sm">New fund</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input type="text" value={slug} onChange={(e) => setSlug(e.target.value)}
          placeholder="slug (e.g. change-fund)"
          className="px-3 py-1.5 rounded-md border border-border bg-background text-sm" />
        <input type="text" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. Change Fund)"
          className="px-3 py-1.5 rounded-md border border-border bg-background text-sm" />
        <input type="text" value={shortDescription} onChange={(e) => setShortDescription(e.target.value)}
          placeholder="Short description (optional)"
          className="px-3 py-1.5 rounded-md border border-border bg-background text-sm sm:col-span-2" />
        <input type="text" value={currency} onChange={(e) => setCurrency(e.target.value)}
          placeholder="USD" maxLength={10}
          className="px-3 py-1.5 rounded-md border border-border bg-background text-sm w-24" />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={submitting}
          className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">
          {submitting ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Create fund'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-3 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-muted">
          Cancel
        </button>
      </div>
    </div>
  );
}

function FundCard({ fund, isOpen, onToggle, onUpdate }: {
  fund: Fund; isOpen: boolean; onToggle: () => void; onUpdate: () => void;
}) {
  const { data: detail, mutate: refetchFund } = useFund(isOpen ? fund.id : null);
  const fullFund = detail?.fund ?? fund;
  const windows = fullFund.windows ?? [];
  const [showNewWindow, setShowNewWindow] = useState(false);

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 p-4 hover:bg-muted/40 text-left"
      >
        <div className="flex items-center gap-2">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <div>
            <div className="font-semibold text-sm">{fund.name}</div>
            <div className="text-xs text-muted-foreground">
              {fund.slug} · {fund.currency} · {fund.window_count} window{fund.window_count !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-muted">{fund.status}</span>
      </button>
      {isOpen && (
        <div className="border-t border-border bg-muted/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Windows
            </h4>
            <button
              type="button"
              onClick={() => setShowNewWindow((v) => !v)}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border hover:bg-background"
            >
              <Plus className="w-3 h-3" /> New window
            </button>
          </div>
          {showNewWindow && (
            <NewWindowForm
              fundId={fund.id}
              onCreate={async () => { await refetchFund(); onUpdate(); setShowNewWindow(false); }}
              onCancel={() => setShowNewWindow(false)}
            />
          )}
          {windows.length === 0 && !showNewWindow && (
            <div className="text-xs text-muted-foreground italic">No windows yet.</div>
          )}
          {windows.map((w) => (
            <WindowCard key={w.id} window={w} onUpdate={refetchFund} />
          ))}
        </div>
      )}
    </div>
  );
}

function NewWindowForm({ fundId, onCreate, onCancel }: {
  fundId: number; onCreate: () => void; onCancel: () => void;
}) {
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [crisisType, setCrisisType] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!slug.trim() || !name.trim()) {
      toast.error('Slug + name are required.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/funds/${fundId}/windows`, {
        slug: slug.trim().toLowerCase(),
        name: name.trim(),
        crisis_type: crisisType.trim() || undefined,
        max_grant_amount: maxAmount ? Number(maxAmount) : undefined,
        application_window_hours: 72,
        decision_sla_days: 6,
        direct_to_community_single_min_pct: 80,
        direct_to_community_consortium_min_pct: 70,
        status: 'draft',
      });
      toast.success('Window created.');
      onCreate();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Create failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border border-border rounded-md bg-card p-3 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input type="text" value={slug} onChange={(e) => setSlug(e.target.value)}
          placeholder="slug (e.g. emergency-response)"
          className="px-2 py-1.5 rounded-md border border-border bg-background text-xs" />
        <input type="text" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. Emergency Response)"
          className="px-2 py-1.5 rounded-md border border-border bg-background text-xs" />
        <input type="text" value={crisisType} onChange={(e) => setCrisisType(e.target.value)}
          placeholder="Crisis type (optional)"
          className="px-2 py-1.5 rounded-md border border-border bg-background text-xs" />
        <input type="number" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)}
          placeholder="Max grant amount (optional)"
          className="px-2 py-1.5 rounded-md border border-border bg-background text-xs" />
      </div>
      <div className="text-xs text-muted-foreground">
        Defaults applied: 72h application window · 6-day decision SLA · 80%/70% direct-to-community
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={submitting}
          className="px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">
          {submitting ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Create window'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-3 py-1 rounded-md border border-border text-xs font-semibold hover:bg-muted">
          Cancel
        </button>
      </div>
    </div>
  );
}

// Phase 52 — small operational stat tile rendered in WindowCard
function OpStat({
  label, value, tone = 'muted',
}: {
  label: string;
  value: string;
  tone?: 'muted' | 'good' | 'warn' | 'bad' | 'accent';
}) {
  const cls =
    tone === 'good'   ? 'border-[hsl(var(--kuja-grow))]/30 bg-[hsl(var(--kuja-grow))]/10 text-[hsl(var(--kuja-grow))]'
    : tone === 'warn' ? 'border-[hsl(var(--kuja-sun))]/30 bg-[hsl(var(--kuja-sun))]/10 text-[hsl(var(--kuja-sun))]'
    : tone === 'bad'  ? 'border-destructive/30 bg-destructive/10 text-destructive'
    : tone === 'accent' ? 'border-[hsl(var(--kuja-clay))]/30 bg-[hsl(var(--kuja-clay))]/10 text-[hsl(var(--kuja-clay))]'
    : 'border-border bg-muted/30 text-muted-foreground';
  return (
    <div className={`border rounded-md p-2 ${cls}`}>
      <div className="uppercase tracking-wide opacity-80 text-[9px]">{label}</div>
      <div className="font-semibold text-xs mt-0.5">{value}</div>
    </div>
  );
}

function WindowCard({ window: w, onUpdate }: { window: FundWindow; onUpdate: () => void }) {
  const [seeding, setSeeding] = useState(false);
  const { data: rubricData, mutate: refetchRubric } = useWindowRubric(w.id);
  const { data: ops } = useWindowOperational(w.id);
  const rubric = rubricData?.rubric;

  async function seedRubric() {
    setSeeding(true);
    try {
      await api.post(`/windows/${w.id}/rubric/seed-change-fund`);
      toast.success('Change Fund rubric seeded.');
      await refetchRubric();
      onUpdate();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Seed failed.');
    } finally {
      setSeeding(false);
    }
  }

  const hasRubric = !!rubric && (rubric.criterion_count ?? 0) > 0;

  return (
    <div className="border border-border rounded-md bg-card p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-medium text-sm">{w.name}</div>
          <div className="text-xs text-muted-foreground">
            {w.slug} · {w.status}
            {w.crisis_type && <> · {w.crisis_type}</>}
            {w.max_grant_amount && <> · max {w.max_grant_amount.toLocaleString()}</>}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          {!hasRubric && (
            <button
              type="button"
              onClick={seedRubric}
              disabled={seeding}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border hover:bg-background disabled:opacity-50"
              title="Seed the NEAR Change Fund 5-area rubric on this window"
            >
              {seeding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              Seed Change Fund rubric
            </button>
          )}
          <Link
            href={`/admin/windows/${w.id}/report`}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border hover:bg-background"
            title="View window report"
          >
            <BarChart3 className="w-3 h-3" />
            Report
          </Link>
        </div>
      </div>

      {/* Phase 52 — operational state strip. Leads the card with what the
          window is DOING right now, not what it's configured to allow. */}
      {ops && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
          <OpStat
            label="Available"
            value={
              ops.available_budget != null
                ? `${ops.available_budget.toLocaleString()} ${ops.currency ?? ''}`.trim()
                : '—'
            }
          />
          <OpStat
            label="Active declarations"
            value={String(ops.active_declaration_count)}
            tone={ops.active_declaration_count > 0 ? 'accent' : 'muted'}
          />
          <OpStat
            label="Open grants"
            value={String(ops.open_grant_count)}
            tone={ops.open_grant_count > 0 ? 'good' : 'muted'}
          />
          <OpStat
            label="Reports due / overdue"
            value={
              ops.overdue_report_count > 0
                ? `${ops.due_report_count} (${ops.overdue_report_count} overdue)`
                : String(ops.due_report_count)
            }
            tone={
              ops.overdue_report_count > 0 ? 'bad'
              : ops.due_report_count > 0 ? 'warn'
              : 'muted'
            }
          />
        </div>
      )}

      {/* Tiny SLA chip strip */}
      <div className="flex flex-wrap gap-1.5 text-[10px]">
        {w.application_window_hours && (
          <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            {w.application_window_hours}h app window
          </span>
        )}
        {w.decision_sla_days && (
          <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            {w.decision_sla_days}d decision SLA
          </span>
        )}
        {w.direct_to_community_single_min_pct && (
          <span className="px-2 py-0.5 rounded-full bg-[hsl(var(--kuja-grow))]/10 text-[hsl(var(--kuja-grow))]">
            ≥{w.direct_to_community_single_min_pct}% direct-to-community
          </span>
        )}
      </div>

      {hasRubric && rubric && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Rubric: {rubric.name} ({rubric.criterion_count} criteria)
          </summary>
          <ul className="mt-2 space-y-1.5 pl-1">
            {(rubric.criteria ?? []).map((c) => <CriterionRow key={c.id} c={c} />)}
          </ul>
        </details>
      )}
    </div>
  );
}

function CriterionRow({ c }: { c: WindowCriterion }) {
  const isGate = c.threshold_kind === 'hard_gate';
  return (
    <li className="flex items-start gap-2 py-1 border-b border-border last:border-b-0">
      {isGate ? (
        <Lock className="w-3 h-3 mt-0.5 text-destructive shrink-0" />
      ) : (
        <Gauge className="w-3 h-3 mt-0.5 text-muted-foreground shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-medium">{c.name}</span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.area}</span>
          {c.threshold_value !== null && (
            <span className={`text-[10px] font-semibold ${isGate ? 'text-destructive' : 'text-muted-foreground'}`}>
              {isGate ? 'gate' : 'target'}: {c.threshold_value}
            </span>
          )}
        </div>
        {c.description && (
          <div className="text-[11px] text-muted-foreground">{c.description}</div>
        )}
      </div>
    </li>
  );
}
