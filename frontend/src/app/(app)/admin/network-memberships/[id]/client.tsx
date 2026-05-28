'use client';

/**
 * /admin/network-memberships/<id> — NEAR redesign (Phase 15).
 *
 * Admin's full review screen for a pending membership. Bundles:
 *   - Applicant info (org, country, region, eligibility answers)
 *   - Capacity assessment (score + link)
 *   - Trust process button (admin-run sanctions + adverse media +
 *     registry — NEAR runs this, NOT the NGO)
 *   - Approve / Reject buttons with reason
 *
 * Replaces the inline expand-rows in the list view. The list still
 * surfaces approve/reject for the simple case; this page is the full
 * review surface where the operator drills in.
 */

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { useMembership } from '@/lib/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import {
  ChevronLeft, ShieldCheck, ShieldAlert, AlertCircle, Loader2,
  CheckCircle2, XCircle, ClipboardCheck, Sparkles, MapPin, Building2,
} from 'lucide-react';

const STATUS_COLOUR: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  under_review: 'bg-[hsl(var(--kuja-sun))]/15 text-[hsl(var(--kuja-sun))]',
  active: 'bg-[hsl(var(--kuja-grow))]/15 text-[hsl(var(--kuja-grow))]',
  rejected: 'bg-destructive/15 text-destructive',
  suspended: 'bg-destructive/15 text-destructive',
  expelled: 'bg-destructive/15 text-destructive',
};

export default function MembershipReviewClient() {
  const params = useParams();
  const id = Number(params?.id ?? '0');
  const router = useRouter();
  const viewer = useAuthStore((s) => s.user);
  const { data, isLoading, mutate } = useMembership(id || null);

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
  const m = data.membership;

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => router.push('/admin/network-memberships')}
        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
      >
        <ChevronLeft className="w-3 h-3" /> Back to memberships
      </button>

      {/* Header */}
      <div className="border border-border rounded-lg bg-card p-5 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="kuja-display text-2xl flex items-center gap-2">
              <Building2 className="w-6 h-6 text-[hsl(var(--kuja-clay))]" />
              {m.org?.name || `Org #${m.org_id}`}
            </h1>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full font-semibold capitalize ${STATUS_COLOUR[m.status] || STATUS_COLOUR.pending}`}>
                {m.status.replace('_', ' ')}
              </span>
              {m.country && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {m.country}
                </span>
              )}
              {m.region && <span>{m.region}</span>}
              <span>tier: {m.member_tier}</span>
              {m.applied_at && (
                <span>applied {new Date(m.applied_at).toLocaleDateString()}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Eligibility answers */}
      {Object.keys(m.eligibility_answers || {}).length > 0 && (
        <section className="border border-border rounded-lg bg-card p-5 space-y-3">
          <h2 className="font-semibold text-sm">Eligibility self-assessment</h2>
          <ul className="text-xs space-y-1.5">
            {Object.entries(m.eligibility_answers).map(([k, v]) => (
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

      {/* Capacity assessment */}
      <section className="border border-border rounded-lg bg-card p-5 space-y-3">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Capacity assessment
        </h2>
        {m.capacity_assessment_id ? (
          <div className="text-xs flex items-center justify-between">
            <div>
              <div className="text-[hsl(var(--kuja-grow))] font-semibold">
                Assessment #{m.capacity_assessment_id} linked
              </div>
              <div className="text-muted-foreground mt-0.5">
                Self-service capacity assessment completed by the applicant.
              </div>
            </div>
            <a
              href={`/assessments`}
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

      {/* Trust process (admin-run) */}
      <TrustProcessPanel membershipId={m.id} onUpdate={mutate} />

      {/* Decision */}
      {(m.status === 'pending' || m.status === 'under_review') && (
        <DecisionPanel m={m} onUpdate={mutate} />
      )}
    </div>
  );
}

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
          Trust process
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
            <CountChip label="Medium" count={result.screening.medium_count || 0} tone="warn" />
            <CountChip label="Low" count={result.screening.low_count || 0} tone="muted" />
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

interface MembershipForDecision {
  id: number;
  status: string;
  capacity_assessment_id: number | null;
}

function DecisionPanel({ m, onUpdate }: { m: MembershipForDecision; onUpdate: () => void }) {
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  async function approve() {
    setBusy(true);
    try {
      await api.post(`/network/membership/${m.id}/approve`);
      toast.success('Approved — applicant is now an active member.');
      onUpdate();
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
      onUpdate();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Reject failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border border-border rounded-lg bg-card p-5 space-y-3">
      <h2 className="font-semibold text-sm">Decision</h2>
      <p className="text-xs text-muted-foreground">
        After reviewing the capacity assessment + trust process results, approve to activate the
        member (eligible to receive grants under NEAR declarations) or reject with reason.
      </p>
      {!m.capacity_assessment_id && (
        <div className="text-xs border border-[hsl(var(--kuja-sun))]/30 bg-[hsl(var(--kuja-sun))]/10 rounded-md p-2 text-[hsl(var(--kuja-sun))]">
          <AlertCircle className="w-3 h-3 inline mr-1" />
          Capacity assessment not yet linked — typically required before approval.
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={approve}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[hsl(var(--kuja-grow))] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
          Approve membership
        </button>
        <button
          type="button"
          onClick={() => setRejectOpen(!rejectOpen)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-muted"
        >
          <XCircle className="w-3 h-3" />
          Reject
        </button>
      </div>
      {rejectOpen && (
        <div className="border-t border-border pt-3 space-y-2">
          <label className="text-xs space-y-1 block">
            <span className="text-muted-foreground">Rejection reason (visible to the applicant)</span>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={2}
              className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-xs"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={reject}
              disabled={busy || !rejectReason.trim()}
              className="px-3 py-1.5 rounded-md bg-destructive text-destructive-foreground text-xs font-semibold disabled:opacity-50"
            >
              Confirm reject
            </button>
            <button
              type="button"
              onClick={() => { setRejectOpen(false); setRejectReason(''); }}
              className="px-3 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
