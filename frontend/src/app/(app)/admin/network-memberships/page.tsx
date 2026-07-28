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
import Link from 'next/link';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { usePendingMemberships, type Membership } from '@/lib/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { useNetworkStore } from '@/stores/network-store';
import { CheckCircle2, XCircle, Loader2, Inbox, Filter, Sparkles, Users } from 'lucide-react';
import {
  PageShell, PageHeader, PageAttention, PageMain, type AttentionItem,
} from '@/components/layout/page-shell';
import {
  describeMembershipStatus, TONE_PILL_CLASS,
} from '@/lib/status-copy';
import { useTranslation } from '@/lib/hooks/use-translation';

// Phase 51 — filter labels match the human pill copy on the rows themselves.
const STATUS_OPTIONS = [
  { value: 'under_review', labelKey: 'membership_list.status_under_review' },
  { value: 'pending',      labelKey: 'membership_list.status_awaiting_review' },
  { value: 'active',       labelKey: 'membership_list.status_active_members' },
  { value: 'rejected',     labelKey: 'membership_list.status_rejected' },
  { value: 'suspended',    labelKey: 'membership_list.status_suspended' },
  { value: 'all',          labelKey: 'membership_list.status_all' },
];

export default function NetworkMembershipsAdminPage() {
  const { t } = useTranslation();
  const viewer = useAuthStore((s) => s.user);
  const network = useNetworkStore((s) => s.network);
  const [statusFilter, setStatusFilter] = useState('under_review');
  const { data, isLoading, mutate } = usePendingMemberships(statusFilter);
  // Phase 122 — bulk-decision state.
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState('');

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const bulkDecide = async (decision: 'approved' | 'rejected') => {
    if (selected.size === 0 || bulkBusy) return;
    if (decision === 'rejected' && !bulkRejectReason.trim()) {
      toast.error(t('membership_list.err_bulk_reject_reason_required'));
      return;
    }
    const confirmKey =
      decision === 'approved'
        ? (selected.size === 1 ? 'membership_list.confirm_bulk_approve_one' : 'membership_list.confirm_bulk_approve_other')
        : (selected.size === 1 ? 'membership_list.confirm_bulk_reject_one' : 'membership_list.confirm_bulk_reject_other');
    if (!confirm(t(confirmKey, { count: selected.size }))) return;
    setBulkBusy(true);
    try {
      const res = await api.post<{ summary: { succeeded: number; failed: number } }>(
        '/api/network/membership/bulk-decision',
        {
          decision,
          membership_ids: Array.from(selected),
          reason: decision === 'rejected' ? bulkRejectReason.trim() : undefined,
        },
      );
      const { succeeded, failed } = res.summary;
      let successMsg: string;
      if (failed === 0) {
        successMsg = decision === 'approved'
          ? t(succeeded === 1 ? 'membership_list.toast_bulk_approved_one' : 'membership_list.toast_bulk_approved_other', { count: succeeded })
          : t(succeeded === 1 ? 'membership_list.toast_bulk_rejected_one' : 'membership_list.toast_bulk_rejected_other', { count: succeeded });
      } else {
        successMsg = decision === 'approved'
          ? t('membership_list.toast_bulk_approved_partial', { succeeded, failed })
          : t('membership_list.toast_bulk_rejected_partial', { succeeded, failed });
      }
      toast.success(successMsg);
      setSelected(new Set());
      setBulkRejectReason('');
      mutate();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t('membership_list.err_bulk_decision_failed');
      toast.error(msg);
    } finally {
      setBulkBusy(false);
    }
  };

  if (viewer && viewer.role !== 'admin') {
    return (
      <div className="p-6 text-sm">
        <p className="text-destructive">
          {t('membership_list.admin_only')}
        </p>
      </div>
    );
  }

  const rows = data?.memberships ?? [];
  const decidable = rows.filter(
    (m) => m.status === 'pending' || m.status === 'under_review',
  ).length;
  const missingCapacity = rows.filter(
    (m) => !m.capacity_assessment_id && (m.status === 'pending' || m.status === 'under_review'),
  ).length;

  // Phase 51 — attention strip surfaces decision load + readiness gaps.
  const attention: AttentionItem[] = [];
  if (decidable > 0) {
    attention.push({
      tone: 'warn',
      label: t(decidable === 1 ? 'membership_list.attention_awaiting_one' : 'membership_list.attention_awaiting_other', { count: decidable }),
      hint: t('membership_list.attention_awaiting_hint'),
    });
  }
  if (missingCapacity > 0) {
    attention.push({
      tone: 'info',
      label: t(missingCapacity === 1 ? 'membership_list.attention_missing_capacity_one' : 'membership_list.attention_missing_capacity_other', { count: missingCapacity }),
      hint: t('membership_list.attention_missing_capacity_hint'),
    });
  }

  return (
    <PageShell>
      <PageHeader
        title={network?.name ? t('membership_list.title_with_network', { name: network.name }) : t('membership_list.title')}
        icon={Users}
        subtitle={t(rows.length === 1 ? 'membership_list.subtitle_one' : 'membership_list.subtitle_other', {
          count: rows.length,
          status: (() => {
            const s = STATUS_OPTIONS.find((o) => o.value === statusFilter);
            return s ? t(s.labelKey).toLowerCase() : '';
          })(),
        })}
        primaryAction={
          <label className="inline-flex items-center gap-2 text-xs">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2 py-1 rounded-md border border-border bg-background text-xs"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{t(s.labelKey)}</option>
              ))}
            </select>
          </label>
        }
      />

      <PageAttention items={attention} />

      <PageMain>
        {isLoading && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="kuja-shimmer h-16 rounded" />)}
          </div>
        )}

        {!isLoading && rows.length === 0 && (
          <div className="border border-border rounded-lg bg-card p-10 text-center text-sm text-muted-foreground">
            <Inbox className="w-8 h-8 mx-auto mb-2 opacity-50" />
            {t('membership_list.empty_state')}
          </div>
        )}

        {!isLoading && rows.length > 0 && (
          <>
            {/* Phase 122 — Bulk action bar; appears when any row is selected. */}
            {selected.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-[hsl(var(--kuja-clay))]/30 bg-[hsl(var(--kuja-clay))]/5 p-3 mb-3 text-xs">
                <span className="font-semibold">
                  {t('membership_list.n_selected', { count: selected.size })}
                </span>
                <button
                  type="button"
                  onClick={() => bulkDecide('approved')}
                  disabled={bulkBusy}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 text-white px-3 py-1.5 font-medium hover:bg-emerald-700 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {t('membership_list.approve_all')}
                </button>
                <input
                  type="text"
                  value={bulkRejectReason}
                  onChange={(e) => setBulkRejectReason(e.target.value)}
                  placeholder={t('membership_list.bulk_reject_placeholder')}
                  className="flex-1 min-w-[200px] rounded-md border border-border bg-background px-2 py-1.5"
                />
                <button
                  type="button"
                  onClick={() => bulkDecide('rejected')}
                  disabled={bulkBusy || !bulkRejectReason.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 text-white px-3 py-1.5 font-medium hover:bg-rose-700 disabled:opacity-50"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  {t('membership_list.reject_all')}
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="text-muted-foreground hover:text-foreground underline"
                >
                  {t('membership_list.clear')}
                </button>
              </div>
            )}

            <div className="border border-border rounded-lg bg-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-2 py-2 w-8">
                      <input
                        type="checkbox"
                        aria-label={t('membership_list.select_all_aria')}
                        checked={rows.filter((m) => m.status === 'pending' || m.status === 'under_review').length > 0
                          && rows.filter((m) => m.status === 'pending' || m.status === 'under_review').every((m) => selected.has(m.id))}
                        onChange={(e) => {
                          const decidableIds = rows
                            .filter((m) => m.status === 'pending' || m.status === 'under_review')
                            .map((m) => m.id);
                          if (e.target.checked) setSelected(new Set(decidableIds));
                          else setSelected(new Set());
                        }}
                      />
                    </th>
                    <th className="text-left px-3 py-2">{t('membership_list.col_org')}</th>
                    <th className="text-left px-3 py-2">{t('membership_list.col_country')}</th>
                    <th className="text-left px-3 py-2">{t('membership_list.col_tier')}</th>
                    <th className="text-left px-3 py-2">{t('membership_list.col_applied')}</th>
                    <th className="text-left px-3 py-2">{t('common.status')}</th>
                    <th className="text-left px-3 py-2">{t('membership_list.col_capacity')}</th>
                    <th className="text-right px-3 py-2">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => (
                    <MembershipRow
                      key={m.id}
                      m={m}
                      onChange={mutate}
                      selected={selected.has(m.id)}
                      onToggleSelect={() => toggleSelect(m.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </PageMain>
    </PageShell>
  );
}

function MembershipRow({ m, onChange, selected, onToggleSelect }: {
  m: Membership;
  onChange: () => void;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const { t } = useTranslation();
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
      if (!r?.ok) toast.message(t('membership_list.toast_ai_unavailable'));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('membership_list.err_ai_brief_failed'));
    } finally {
      setAiBusy(false);
    }
  }

  async function approve() {
    setBusy(true);
    try {
      await api.post(`/network/membership/${m.id}/approve`);
      toast.success(t('membership_list.toast_approved'));
      onChange();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('membership_list.err_approve_failed'));
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!rejectReason.trim()) {
      toast.error(t('membership_list.err_reason_required'));
      return;
    }
    setBusy(true);
    try {
      await api.post(`/network/membership/${m.id}/reject`, {
        reason: rejectReason.trim(),
      });
      toast.success(t('membership_list.toast_rejected'));
      setShowReject(false);
      setRejectReason('');
      onChange();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('membership_list.err_reject_failed'));
    } finally {
      setBusy(false);
    }
  }

  const canDecide = m.status === 'under_review' || m.status === 'pending';

  return (
    <>
      <tr className="border-t border-border align-top">
        <td className="px-2 py-2">
          {canDecide && onToggleSelect && (
            <input
              type="checkbox"
              aria-label={t('membership_list.select_membership_aria', { id: m.id })}
              checked={!!selected}
              onChange={onToggleSelect}
            />
          )}
        </td>
        <td className="px-3 py-2">
          <Link
            href={`/admin/network-memberships/${m.id}`}
            className="font-medium hover:underline"
          >
            {m.org_name ?? m.org?.name ?? t('membership_list.org_fallback', { id: m.org_id })}
          </Link>
          <div className="text-xs text-muted-foreground">#{m.id}</div>
        </td>
        <td className="px-3 py-2 text-xs">{m.country ?? '—'}</td>
        <td className="px-3 py-2 text-xs">{m.member_tier}</td>
        <td className="px-3 py-2 text-xs">
          {m.applied_at ? new Date(m.applied_at).toLocaleDateString() : '—'}
        </td>
        <td className="px-3 py-2 text-xs">
          {(() => {
            const sc = describeMembershipStatus(m.status);
            return (
              <span className={`px-2 py-0.5 rounded-full font-semibold ${TONE_PILL_CLASS[sc.tone]}`}>
                {sc.label}
              </span>
            );
          })()}
          {m.status === 'rejected' && m.status_reason && (
            <div className="text-muted-foreground italic mt-1">&ldquo;{m.status_reason}&rdquo;</div>
          )}
        </td>
        <td className="px-3 py-2 text-xs">
          {m.capacity_assessment_id ? (
            <span className="text-[hsl(var(--kuja-grow))]">#{m.capacity_assessment_id}</span>
          ) : (
            <span className="text-muted-foreground">{t('membership_list.capacity_missing')}</span>
          )}
        </td>
        <td className="px-3 py-2 text-right">
          {canDecide ? (
            <div className="inline-flex gap-1">
              <button
                type="button"
                onClick={fetchBrief}
                disabled={aiBusy}
                title={t('membership_list.ai_brief_tooltip')}
                className="px-2 py-1 rounded-md text-xs font-semibold bg-[hsl(var(--kuja-spark))] text-white hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1"
              >
                {aiBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                {t('membership_list.ai_brief')}
              </button>
              <button
                type="button"
                onClick={approve}
                disabled={busy}
                className="px-2 py-1 rounded-md text-xs font-semibold bg-[hsl(var(--kuja-grow))] text-white hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1"
              >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                {t('membership_list.approve')}
              </button>
              <button
                type="button"
                onClick={() => setShowReject(true)}
                disabled={busy}
                className="px-2 py-1 rounded-md text-xs font-semibold border border-border hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1"
              >
                <XCircle className="w-3 h-3" />
                {t('membership_list.reject')}
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
                    {t('membership_list.ai_fallback_notice')}
                  </div>
                )}
                {aiBrief.paragraph && (
                  <p className="leading-relaxed">{aiBrief.paragraph}</p>
                )}
                {aiBrief.red_flags && aiBrief.red_flags.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-destructive mb-0.5">
                      {t('membership_list.red_flags')}
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
                {t('membership_list.dismiss')}
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
                placeholder={t('membership_list.reject_placeholder')}
                rows={2}
                className="flex-1 px-2 py-1.5 rounded-md border border-border bg-background text-xs"
              />
              <button
                type="button"
                onClick={reject}
                disabled={busy || !rejectReason.trim()}
                className="px-3 py-1.5 rounded-md text-xs font-semibold bg-destructive text-destructive-foreground disabled:opacity-50"
              >
                {t('membership_list.confirm_reject')}
              </button>
              <button
                type="button"
                onClick={() => { setShowReject(false); setRejectReason(''); }}
                className="px-3 py-1.5 rounded-md text-xs font-semibold border border-border hover:bg-muted"
              >
                {t('common.cancel')}
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
