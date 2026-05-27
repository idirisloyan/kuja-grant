'use client';

/**
 * /admin/network-memberships — Phase 33 (May 2026).
 *
 * Oversight Body / admin review dashboard. Lists pending membership
 * applications in the current network and lets the admin approve or
 * reject with a reason. Until Phase 38 (per-network OB roles), this
 * is admin-only.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { usePendingMemberships, type Membership } from '@/lib/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { useNetworkStore } from '@/stores/network-store';
import { CheckCircle2, XCircle, Loader2, Inbox, Filter, Sparkles } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'under_review', label: 'Under review' },
  { value: 'pending', label: 'Pending (draft)' },
  { value: 'active', label: 'Active members' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'all', label: 'All' },
];

export default function NetworkMembershipsAdminPage() {
  const viewer = useAuthStore((s) => s.user);
  const network = useNetworkStore((s) => s.network);
  const [statusFilter, setStatusFilter] = useState('under_review');
  const { data, isLoading, mutate } = usePendingMemberships(statusFilter);

  if (viewer && viewer.role !== 'admin') {
    return (
      <div className="p-6 text-sm">
        <p className="text-destructive">
          Only platform admins can review network memberships in this phase.
        </p>
      </div>
    );
  }

  const rows = data?.memberships ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="kuja-display text-3xl">
            {network?.name ?? 'Network'} — memberships
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {rows.length} {rows.length === 1 ? 'application' : 'applications'} ·{' '}
            {STATUS_OPTIONS.find((s) => s.value === statusFilter)?.label.toLowerCase()}
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-xs">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2 py-1 rounded-md border border-border bg-background text-xs"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="kuja-shimmer h-16 rounded" />)}
        </div>
      )}

      {!isLoading && rows.length === 0 && (
        <div className="border border-border rounded-lg bg-card p-10 text-center text-sm text-muted-foreground">
          <Inbox className="w-8 h-8 mx-auto mb-2 opacity-50" />
          No memberships in this state.
        </div>
      )}

      {!isLoading && rows.length > 0 && (
        <div className="border border-border rounded-lg bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Org</th>
                <th className="text-left px-3 py-2">Country</th>
                <th className="text-left px-3 py-2">Tier</th>
                <th className="text-left px-3 py-2">Applied</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Capacity</th>
                <th className="text-right px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <MembershipRow key={m.id} m={m} onChange={mutate} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MembershipRow({ m, onChange }: { m: Membership; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [aiBrief, setAiBrief] = useState<{ paragraph?: string; red_flags?: string[]; ok?: boolean } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  async function fetchBrief() {
    setAiBusy(true);
    try {
      const r = await api.post<typeof aiBrief>(`/network/membership/${m.id}/ai-brief`);
      setAiBrief(r);
      if (!r?.ok) toast.message('AI unavailable — fallback shown.');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'AI brief failed.');
    } finally {
      setAiBusy(false);
    }
  }

  async function approve() {
    setBusy(true);
    try {
      await api.post(`/network/membership/${m.id}/approve`);
      toast.success('Approved.');
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
      await api.post(`/network/membership/${m.id}/reject`, {
        reason: rejectReason.trim(),
      });
      toast.success('Rejected.');
      setShowReject(false);
      setRejectReason('');
      onChange();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Reject failed.');
    } finally {
      setBusy(false);
    }
  }

  const canDecide = m.status === 'under_review' || m.status === 'pending';

  return (
    <>
      <tr className="border-t border-border align-top">
        <td className="px-3 py-2">
          <div className="font-medium">{m.org_name ?? m.org?.name ?? `Org #${m.org_id}`}</div>
          <div className="text-xs text-muted-foreground">#{m.id}</div>
        </td>
        <td className="px-3 py-2 text-xs">{m.country ?? '—'}</td>
        <td className="px-3 py-2 text-xs">{m.member_tier}</td>
        <td className="px-3 py-2 text-xs">
          {m.applied_at ? new Date(m.applied_at).toLocaleDateString() : '—'}
        </td>
        <td className="px-3 py-2 text-xs capitalize">
          {m.status.replace('_', ' ')}
          {m.status === 'rejected' && m.status_reason && (
            <div className="text-muted-foreground italic">&ldquo;{m.status_reason}&rdquo;</div>
          )}
        </td>
        <td className="px-3 py-2 text-xs">
          {m.capacity_assessment_id ? (
            <span className="text-[hsl(var(--kuja-grow))]">#{m.capacity_assessment_id}</span>
          ) : (
            <span className="text-muted-foreground">missing</span>
          )}
        </td>
        <td className="px-3 py-2 text-right">
          {canDecide ? (
            <div className="inline-flex gap-1">
              <button
                type="button"
                onClick={fetchBrief}
                disabled={aiBusy}
                title="Generate AI reviewer brief"
                className="px-2 py-1 rounded-md text-xs font-semibold bg-[hsl(var(--kuja-spark))] text-white hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1"
              >
                {aiBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                AI brief
              </button>
              <button
                type="button"
                onClick={approve}
                disabled={busy}
                className="px-2 py-1 rounded-md text-xs font-semibold bg-[hsl(var(--kuja-grow))] text-white hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1"
              >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                Approve
              </button>
              <button
                type="button"
                onClick={() => setShowReject(true)}
                disabled={busy}
                className="px-2 py-1 rounded-md text-xs font-semibold border border-border hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1"
              >
                <XCircle className="w-3 h-3" />
                Reject
              </button>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
      </tr>
      {aiBrief && (
        <tr className="border-t border-border bg-[hsl(var(--kuja-spark-soft))]">
          <td colSpan={7} className="px-3 py-3">
            <div className="flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-[hsl(var(--kuja-spark))] shrink-0 mt-0.5" />
              <div className="flex-1 text-xs space-y-1.5">
                {!aiBrief.ok && (
                  <div className="italic text-muted-foreground">
                    Fallback shown — AI service unavailable.
                  </div>
                )}
                {aiBrief.paragraph && (
                  <p className="leading-relaxed">{aiBrief.paragraph}</p>
                )}
                {aiBrief.red_flags && aiBrief.red_flags.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-destructive mb-0.5">
                      Red flags
                    </div>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {aiBrief.red_flags.map((f, i) => <li key={i}>{f}</li>)}
                    </ul>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setAiBrief(null)}
                className="text-[10px] text-muted-foreground hover:text-foreground"
              >
                Dismiss
              </button>
            </div>
          </td>
        </tr>
      )}
      {showReject && (
        <tr className="border-t border-border bg-muted/30">
          <td colSpan={7} className="px-3 py-3">
            <div className="flex items-start gap-2">
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason (required; visible to the applicant)"
                rows={2}
                className="flex-1 px-2 py-1.5 rounded-md border border-border bg-background text-xs"
              />
              <button
                type="button"
                onClick={reject}
                disabled={busy || !rejectReason.trim()}
                className="px-3 py-1.5 rounded-md text-xs font-semibold bg-destructive text-destructive-foreground disabled:opacity-50"
              >
                Confirm reject
              </button>
              <button
                type="button"
                onClick={() => { setShowReject(false); setRejectReason(''); }}
                className="px-3 py-1.5 rounded-md text-xs font-semibold border border-border hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
