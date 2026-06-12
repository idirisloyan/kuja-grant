'use client';

/**
 * /admin/network-memberships/<id> — Phase 47 redesign.
 *
 * Guided decision surface. Per design principles:
 *   - Top: member name + status + country/org/sector + Approve / Reject
 *   - Attention strip: missing readiness items + recommended next action
 *   - Tabs: Overview · Capacity · Due diligence · Messages · Audit
 *   - Default view: summary + readiness flags + missing items + next action
 *   - Hide raw details unless expanded
 *
 * Replaces the stacked-sections layout. The Trust Process and Capacity
 * panels move into tabs; the Overview tab is the operator's home base —
 * they should be able to make an approve/reject call from it without
 * leaving.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { useMembership } from '@/lib/hooks/use-api';
import { useRouteId } from '@/lib/hooks/use-route-id';
import { useAuthStore } from '@/stores/auth-store';
import {
  ShieldCheck, ShieldAlert, Loader2,
  CheckCircle2, XCircle, ClipboardCheck, Sparkles, MapPin, Building2,
  Inbox, History,
} from 'lucide-react';
import {
  PageShell, PageBack, PageHeader, PageAttention, PageMain,
  type AttentionItem,
} from '@/components/layout/page-shell';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

// Local membership shape (mirrors useMembership return) — narrower than the
// full hook type so this file stays self-contained for the tabs.
type Membership = {
  id: number;
  status: string;
  member_tier?: string;
  country?: string;
  region?: string;
  applied_at?: string | null;
  capacity_assessment_id?: number | null;
  eligibility_answers?: Record<string, unknown>;
  is_oversight_body?: boolean;
  ob_role_started_at?: string | null;
  ob_role_ended_at?: string | null;
  org_id: number;
  org?: { name?: string; sector?: string } | null;
};

function describeMembershipStatus(m: Membership): { label: string; tone: 'muted' | 'warn' | 'good' | 'bad' | 'accent' } {
  switch (m.status) {
    case 'pending':       return { label: 'Awaiting review', tone: 'warn' };
    case 'under_review':  return { label: 'Under review',    tone: 'warn' };
    case 'active':        return { label: 'Active member',   tone: 'good' };
    case 'rejected':      return { label: 'Rejected',        tone: 'bad' };
    case 'suspended':     return { label: 'Suspended',       tone: 'bad' };
    case 'expelled':      return { label: 'Expelled',        tone: 'bad' };
    default:              return { label: m.status,          tone: 'muted' };
  }
}

export default function MembershipReviewClient() {
  const id = useRouteId('network-memberships');
  const viewer = useAuthStore((s) => s.user);
  const { data, isLoading, mutate } = useMembership(id);

  if (viewer && viewer.role !== 'admin') {
    return (
      <div className="p-6 text-sm">
        <p className="text-destructive">Only admins can review memberships.</p>
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
  const m = data.membership as unknown as Membership;
  const decidable = m.status === 'pending' || m.status === 'under_review';
  const statusPill = describeMembershipStatus(m);

  // Build attention strip — blockers + recommended next action.
  // Defaults to the page being calm; only surfaces items that ARE issues.
  const attention: AttentionItem[] = [];
  if (decidable && !m.capacity_assessment_id) {
    attention.push({
      tone: 'warn',
      label: 'Capacity assessment not yet linked',
      hint: 'Typically required before approval. Ask the applicant to complete the assessment self-service.',
    });
  }
  if (decidable && m.capacity_assessment_id) {
    attention.push({
      tone: 'accent',
      label: 'Ready to review',
      hint: 'Run the trust process on the Due diligence tab, then approve or reject from the header.',
    });
  }

  return (
    <PageShell>
      <PageBack href="/admin/network-memberships" label="Back to memberships" />

      <PageHeader
        title={m.org?.name || `Org #${m.org_id}`}
        icon={Building2}
        status={statusPill}
        meta={[
          ...(m.country ? [{ label: m.country, icon: MapPin }] : []),
          ...(m.region  ? [{ label: m.region }]                : []),
          ...(m.org?.sector ? [{ label: m.org.sector }]        : []),
          ...(m.member_tier ? [{ label: `tier: ${m.member_tier}` }] : []),
          ...(m.applied_at
            ? [{ label: `applied ${new Date(m.applied_at).toLocaleDateString()}` }]
            : []),
          ...(m.is_oversight_body ? [{ label: 'Oversight Body', icon: ShieldCheck }] : []),
        ]}
        primaryAction={
          decidable ? <DecisionActions m={m} onChange={mutate} /> : null
        }
      />

      <PageAttention items={attention} />

      <PageMain>
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto" variant="line">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="capacity">Capacity</TabsTrigger>
            <TabsTrigger value="due_diligence">Due diligence</TabsTrigger>
            <TabsTrigger value="messages">Messages</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-3">
            <OverviewTab m={m} onChange={mutate} />
          </TabsContent>

          <TabsContent value="capacity" className="mt-3">
            <CapacityTab m={m} />
          </TabsContent>

          <TabsContent value="due_diligence" className="mt-3">
            <TrustProcessPanel membershipId={m.id} onUpdate={mutate} />
          </TabsContent>

          <TabsContent value="messages" className="mt-3">
            <PlaceholderTab
              icon={Inbox}
              title="Messages with this member"
              body="Per-member message thread lands in Phase 50. Until then, use the global Messages surface."
              ctaLabel="Open Messages"
              ctaHref="/messages"
            />
          </TabsContent>

          <TabsContent value="audit" className="mt-3">
            <PlaceholderTab
              icon={History}
              title="Decision audit trail"
              body="Approve / reject / suspend / OB seat grant + revoke events are recorded on the chain. A per-membership audit slice lands in Phase 50."
              ctaLabel="Open audit chain"
              ctaHref="/admin/audit-chain"
            />
          </TabsContent>
        </Tabs>
      </PageMain>
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Overview tab — summary + eligibility + (when active) OB seat management
// ---------------------------------------------------------------------------

function OverviewTab({ m, onChange }: { m: Membership; onChange: () => void }) {
  return (
    <div className="space-y-4">
      <section className="border border-border rounded-lg bg-card p-5 space-y-2">
        <h2 className="font-semibold text-sm">Summary</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {m.org?.name || `Org #${m.org_id}`}
          {m.country && <> in <strong className="text-foreground">{m.country}</strong></>}
          {m.region && <>, {m.region}</>}
          . Application status:{' '}
          <strong className="text-foreground">{describeMembershipStatus(m).label.toLowerCase()}</strong>
          {m.applied_at && <>, submitted {new Date(m.applied_at).toLocaleDateString()}</>}
          .
        </p>
      </section>

      {Object.keys(m.eligibility_answers || {}).length > 0 && (
        <section className="border border-border rounded-lg bg-card p-5 space-y-3">
          <h2 className="font-semibold text-sm">Eligibility self-assessment</h2>
          <ul className="text-xs space-y-1.5">
            {Object.entries(m.eligibility_answers || {}).map(([k, v]) => (
              <li key={k} className="flex items-center justify-between gap-3 py-1 border-b border-border last:border-b-0">
                <span className="text-muted-foreground capitalize">{k.replace(/_/g, ' ')}</span>
                <span className={`font-semibold ${String(v).toLowerCase() === 'yes' ? 'text-[hsl(var(--kuja-grow))]' : 'text-destructive'}`}>
                  {String(v).toUpperCase()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {m.status === 'active' && (
        <OversightBodyPanel membership={m} onChange={onChange} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Capacity tab — current capacity panel
// ---------------------------------------------------------------------------

function CapacityTab({ m }: { m: Membership }) {
  return (
    <section className="border border-border rounded-lg bg-card p-5 space-y-3">
      <h2 className="font-semibold text-sm flex items-center gap-2">
        <ClipboardCheck className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
        Capacity assessment
      </h2>
      {m.capacity_assessment_id ? (
        <div className="text-xs flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[hsl(var(--kuja-grow))] font-semibold">
              Assessment #{m.capacity_assessment_id} linked
            </div>
            <div className="text-muted-foreground mt-0.5">
              Self-service capacity assessment completed by the applicant.
            </div>
          </div>
          <a
            href="/assessments"
            className="text-xs underline hover:no-underline text-muted-foreground"
          >
            Open assessment
          </a>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          Applicant has not yet completed the capacity assessment. They must do this before approval.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Placeholder tab — generic future-feature panel
// ---------------------------------------------------------------------------

function PlaceholderTab({
  icon: Icon, title, body, ctaLabel, ctaHref,
}: {
  icon: typeof Inbox;
  title: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    <section className="border border-dashed border-border rounded-lg bg-card p-8 text-center space-y-3">
      <Icon className="w-8 h-8 mx-auto text-muted-foreground opacity-50" />
      <h3 className="font-semibold text-sm">{title}</h3>
      <p className="text-xs text-muted-foreground max-w-md mx-auto">{body}</p>
      {ctaLabel && ctaHref && (
        <a
          href={ctaHref}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-muted"
        >
          {ctaLabel}
        </a>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// DecisionActions — Approve + Reject buttons rendered in the header
// ---------------------------------------------------------------------------

function DecisionActions({ m, onChange }: { m: { id: number; capacity_assessment_id?: number | null }; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  async function approve() {
    setBusy(true);
    try {
      await api.post(`/network/membership/${m.id}/approve`);
      toast.success('Approved — applicant is now an active member.');
      onChange();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Approve failed.');
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!rejectReason.trim()) {
      toast.error('Reason is required.');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/network/membership/${m.id}/reject`, { reason: rejectReason.trim() });
      toast.success('Rejected.');
      setRejectOpen(false);
      setRejectReason('');
      onChange();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Reject failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setRejectOpen(!rejectOpen)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-muted"
      >
        <XCircle className="w-3 h-3" />
        Reject
      </button>
      <button
        type="button"
        onClick={approve}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[hsl(var(--kuja-grow))] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
        Approve
      </button>
      {rejectOpen && (
        <div className="absolute z-30 mt-2 top-full right-0 bg-popover border border-border rounded-md shadow-lg p-3 w-80 space-y-2">
          <label className="text-xs space-y-1 block">
            <span className="text-muted-foreground">
              Rejection reason (visible to the applicant)
            </span>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-xs"
            />
          </label>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => { setRejectOpen(false); setRejectReason(''); }}
              className="px-3 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={reject}
              disabled={busy || !rejectReason.trim()}
              className="px-3 py-1.5 rounded-md bg-destructive text-destructive-foreground text-xs font-semibold disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Confirm reject'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TrustProcessPanel — Due diligence tab content
// ---------------------------------------------------------------------------

function TrustProcessPanel({
  membershipId, onUpdate,
}: { membershipId: number; onUpdate: () => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    screening?: { recommendation?: string; high_count?: number; medium_count?: number; low_count?: number; sources_searched?: string[]; error?: string };
    trust_profile?: Record<string, unknown> | null;
  } | null>(null);

  async function run() {
    setBusy(true);
    try {
      const r = await api.post<typeof result>(`/network/membership/${membershipId}/run-trust-process`);
      setResult(r);
      if (r?.screening && !('error' in (r.screening || {}))) {
        const rec = r.screening?.recommendation;
        toast.success(`Trust process complete. Recommendation: ${rec ?? '—'}`);
      } else {
        toast.message('Trust process ran — see results below.');
      }
      onUpdate();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Trust process failed.');
    } finally {
      setBusy(false);
    }
  }

  const rec = result?.screening?.recommendation;
  const recTone =
    rec === 'clear' ? 'text-[hsl(var(--kuja-grow))]'
    : rec === 'flagged' ? 'text-destructive'
    : rec === 'review' ? 'text-[hsl(var(--kuja-sun))]'
    : 'text-muted-foreground';

  return (
    <section className="border border-border rounded-lg bg-card p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Trust process (sanctions · adverse media · registry)
        </h2>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {result ? 'Re-run trust process' : 'Run trust process now'}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        NEAR runs adverse-media screening, registry verification, and sanctions checks on the
        applicant. Audit-anchored. Results stay on the applicant&rsquo;s trust profile and feed
        future pre-disbursement checks.
      </p>

      {result?.screening?.error && (
        <div className="text-xs border border-destructive/30 bg-destructive/10 rounded-md p-2">
          <ShieldAlert className="w-3 h-3 inline mr-1" />
          Service error: {result.screening.error}
        </div>
      )}

      {result?.screening && !result.screening.error && (
        <div className="border border-border rounded-md p-3 space-y-2">
          <div className="flex items-center gap-3 flex-wrap text-xs">
            <span className="font-semibold">Recommendation:</span>
            <span className={`uppercase font-bold tracking-wide ${recTone}`}>
              {rec || '—'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <CountChip label="High-severity hits" count={result.screening.high_count || 0} tone="bad" />
            <CountChip label="Medium"             count={result.screening.medium_count || 0} tone="warn" />
            <CountChip label="Low"                count={result.screening.low_count || 0} tone="muted" />
          </div>
          {result.screening.sources_searched && result.screening.sources_searched.length > 0 && (
            <div className="text-[10px] text-muted-foreground">
              Sources: {result.screening.sources_searched.join(' · ')}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function CountChip({ label, count, tone }: { label: string; count: number; tone: 'bad' | 'warn' | 'muted' }) {
  const cls =
    tone === 'bad' ? 'border-destructive/40 text-destructive'
    : tone === 'warn' ? 'border-[hsl(var(--kuja-sun))]/40 text-[hsl(var(--kuja-sun))]'
    : 'border-border text-muted-foreground';
  return (
    <div className={`border rounded-md p-2 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wide">{label}</div>
      <div className="text-lg font-semibold mt-0.5">{count}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OversightBodyPanel — grant/revoke OB seat (visible on Overview when active)
// ---------------------------------------------------------------------------

function OversightBodyPanel({
  membership: m,
  onChange,
}: {
  membership: { id: number; is_oversight_body?: boolean; ob_role_started_at?: string | null; ob_role_ended_at?: string | null };
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const isOB = m.is_oversight_body === true;

  async function grant() {
    setBusy(true);
    try {
      await api.post(`/network/membership/${m.id}/ob-seat`, { note: note.trim() || null });
      toast.success('OB seat granted. The member can now act on declarations.');
      setNote('');
      onChange();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Grant failed.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!confirm('Revoke this Oversight Body seat? The member keeps their NGO-member access; they lose OB permissions.')) return;
    setBusy(true);
    try {
      const reason = note.trim();
      const url = `/network/membership/${m.id}/ob-seat${reason ? `?reason=${encodeURIComponent(reason)}` : ''}`;
      await api.delete(url);
      toast.success('OB seat revoked.');
      setNote('');
      onChange();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Revoke failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border border-border rounded-lg bg-card p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className={`grid h-10 w-10 place-items-center rounded-md ${isOB ? 'bg-[hsl(var(--kuja-clay))]/15 text-[hsl(var(--kuja-clay))]' : 'bg-muted text-muted-foreground'} shrink-0`}>
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm">
            {isOB ? 'Active Oversight Body seat' : 'No Oversight Body seat'}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
            Per the IKEA Concept Note, the OB is peer-elected from member orgs.
            Granting this seat gives every user at the org OB permissions
            (sign declarations, approve membership, run trust process) on top
            of their NGO-member access.
          </p>
          {isOB && m.ob_role_started_at && (
            <p className="text-[11px] text-muted-foreground mt-1">
              Seat started {new Date(m.ob_role_started_at).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
      <div className="border-t border-border pt-3 space-y-2">
        <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {isOB ? 'Reason for revocation (optional)' : 'Note (optional — election cycle, term, etc.)'}
        </label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-sm"
          placeholder={isOB ? 'e.g. End of 2-year term' : 'e.g. Elected by the Eastern Africa caucus, 2026 term'}
        />
        <div className="flex items-center gap-2">
          {!isOB ? (
            <button
              type="button"
              onClick={grant}
              disabled={busy}
              className="px-3 py-1.5 rounded-md text-xs font-semibold bg-[hsl(var(--kuja-clay))] text-white hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
              Grant OB seat
            </button>
          ) : (
            <button
              type="button"
              onClick={revoke}
              disabled={busy}
              className="px-3 py-1.5 rounded-md text-xs font-semibold border border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-50 inline-flex items-center gap-1"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
              Revoke OB seat
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

