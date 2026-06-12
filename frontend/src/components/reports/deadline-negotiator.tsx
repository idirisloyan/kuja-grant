'use client';

/**
 * Phase 81 — Smart deadline negotiation.
 *
 * The platform mediates between the donor and the NGO instead of
 * forcing them to fight it out in email. NGO requests an extension
 * (extra_days + reason). Donor approves, counters, or declines —
 * all in-app, logged on the report.
 *
 * Single component handles both sides via the current user's role.
 */

import { useState } from 'react';
import {
  CalendarClock, Send, Loader2, AlertTriangle, CheckCircle2, X,
  ChevronRight, ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

interface ExtensionRequest {
  requested_at?: string;
  requested_by_user_id?: number;
  extra_days?: number;
  reason?: string;
  original_due_date?: string;
  status?: 'pending' | 'approved' | 'declined' | 'counter';
  decided_at?: string;
  decided_by_user_id?: number;
  note?: string;
  counter_days?: number;
}

interface Props {
  reportId: number;
  reportStatus: string;
  dueDate?: string | null;
  pendingRequest?: ExtensionRequest | null;
  historyLatest?: ExtensionRequest | null;
  onUpdated?: () => void;
  className?: string;
}

export function DeadlineNegotiator({
  reportId, reportStatus, dueDate, pendingRequest, historyLatest,
  onUpdated, className = '',
}: Props) {
  const user = useAuthStore((s) => s.user);
  const role = user?.role;
  const isNgo = role === 'ngo';
  const isDonor = role === 'donor' || role === 'admin';
  const draftish = ['draft', 'revision_requested'].includes(reportStatus);

  // NGO request form state
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(7);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  // Donor decision state
  const [counter, setCounter] = useState(7);
  const [note, setNote] = useState('');

  async function submitRequest() {
    if (reason.trim().length < 5) {
      toast.error('Please give a short reason — even one sentence helps the donor.');
      return;
    }
    setBusy(true);
    try {
      const resp = await api.post<{ success: boolean; error?: string }>(
        `/reports/${reportId}/extension-request`,
        { extra_days: days, reason: reason.trim() },
      );
      if (!resp.success) {
        toast.error(resp.error || 'Could not submit the request.');
      } else {
        toast.success('Extension request sent to the donor.');
        setOpen(false); setReason('');
        onUpdated?.();
      }
    } catch (e) {
      toast.error((e as Error).message || 'Failed to reach the server.');
    } finally {
      setBusy(false);
    }
  }

  async function decide(decision: 'approved' | 'declined' | 'counter') {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { decision, note };
      if (decision === 'counter') body.counter_days = counter;
      const resp = await api.post<{ success: boolean; error?: string }>(
        `/reports/${reportId}/extension-decision`,
        body,
      );
      if (!resp.success) {
        toast.error(resp.error || 'Could not record the decision.');
      } else {
        toast.success(
          decision === 'approved' ? 'Extension approved — due date moved.'
          : decision === 'counter' ? 'Counter sent to the NGO.'
          : 'Request declined.',
        );
        onUpdated?.();
      }
    } catch (e) {
      toast.error((e as Error).message || 'Failed to reach the server.');
    } finally {
      setBusy(false);
    }
  }

  // Pending request — donor sees decision UI, NGO sees waiting state
  if (pendingRequest && pendingRequest.status === 'pending') {
    return (
      <section className={`border border-[hsl(var(--kuja-sun))]/30 bg-[hsl(var(--kuja-sun))]/5 rounded-lg p-4 space-y-3 ${className}`}>
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-[hsl(var(--kuja-sun))]" />
          Extension request — awaiting donor decision
        </h3>
        <div className="text-xs leading-relaxed border-l-2 border-[hsl(var(--kuja-sun))] pl-3">
          <strong>{pendingRequest.extra_days} more day{pendingRequest.extra_days === 1 ? '' : 's'}</strong>{' '}
          on top of {pendingRequest.original_due_date}.
          <div className="mt-1 text-muted-foreground">Reason: {pendingRequest.reason}</div>
        </div>

        {isDonor && (
          <div className="space-y-3 pt-1 border-t border-border">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold block">
              Note to NGO (optional)
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why approve / counter / decline."
              className="w-full text-xs border border-input rounded-md p-2 bg-background"
            />

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => decide('approved')}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-grow))] text-white text-xs font-semibold px-3 py-1.5 hover:opacity-90 disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Approve {pendingRequest.extra_days}d
              </button>

              <div className="inline-flex items-center gap-1 border border-border rounded-md px-2 py-1 text-xs">
                Counter:
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={counter}
                  onChange={(e) => setCounter(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                  className="w-12 bg-background text-center"
                />
                <span className="text-muted-foreground">d</span>
                <button
                  type="button"
                  onClick={() => decide('counter')}
                  disabled={busy}
                  className="ml-2 inline-flex items-center gap-1 rounded-md bg-[hsl(var(--kuja-clay))] text-white text-xs font-semibold px-2 py-0.5 hover:opacity-90 disabled:opacity-50"
                >
                  Send <ChevronRight className="w-3 h-3" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => decide('declined')}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 text-destructive text-xs font-semibold px-3 py-1.5 hover:bg-destructive/10 disabled:opacity-50"
              >
                <X className="w-3.5 h-3.5" /> Decline
              </button>
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
            </div>
          </div>
        )}

        {isNgo && (
          <p className="text-[11px] text-muted-foreground italic">
            The donor will respond in-app. You can keep working on the report draft while you wait.
          </p>
        )}
      </section>
    );
  }

  // Most-recent decided request — show outcome briefly
  if (historyLatest && historyLatest.status && historyLatest.status !== 'pending') {
    const tone =
      historyLatest.status === 'approved' ? 'good' :
      historyLatest.status === 'counter' ? 'warn' : 'bad';
    const cls = tone === 'good'
      ? 'border-[hsl(var(--kuja-grow))]/30 bg-[hsl(var(--kuja-grow))]/10 text-[hsl(var(--kuja-grow))]'
      : tone === 'warn'
        ? 'border-[hsl(var(--kuja-sun))]/30 bg-[hsl(var(--kuja-sun))]/10 text-[hsl(var(--kuja-sun))]'
        : 'border-destructive/30 bg-destructive/10 text-destructive';
    return (
      <section className={`border ${cls} rounded-lg p-3 text-xs flex items-start gap-2 ${className}`}>
        <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="font-semibold">
            {historyLatest.status === 'approved'
              ? `Extension approved — +${historyLatest.extra_days} days.`
              : historyLatest.status === 'counter'
                ? `Donor proposed a counter of ${historyLatest.counter_days} days. Resubmit if accepting.`
                : 'Extension declined.'}
          </div>
          {historyLatest.note && (
            <div className="mt-0.5 text-foreground/80">Note: {historyLatest.note}</div>
          )}
        </div>
        {isNgo && draftish && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="ml-auto text-[11px] hover:underline shrink-0"
          >
            New request
          </button>
        )}
      </section>
    );
  }

  // Initial state — NGO sees a "Request extension" button
  if (isNgo && draftish && dueDate) {
    if (!open) {
      return (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`inline-flex items-center gap-1.5 rounded-md border border-border hover:border-[hsl(var(--kuja-sun))] text-xs text-muted-foreground hover:text-[hsl(var(--kuja-sun))] px-3 py-1.5 ${className}`}
          title="Ask the donor for a one-time extension on this report. You stay drafting; they approve or counter in-app."
        >
          <CalendarClock className="w-3.5 h-3.5" /> Request deadline extension
        </button>
      );
    }
    return (
      <section className={`border border-[hsl(var(--kuja-sun))]/30 bg-card rounded-lg p-4 space-y-3 ${className}`}>
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-[hsl(var(--kuja-sun))]" />
            Request deadline extension
          </h3>
          <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Donors typically approve when the reason is concrete. Be brief and honest:
          a sentence or two is enough.
        </p>

        <div className="flex items-center gap-2 text-xs">
          <label className="text-muted-foreground">Extra days:</label>
          <input
            type="number"
            min={1}
            max={30}
            value={days}
            onChange={(e) => setDays(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
            className="w-16 border border-input rounded-md p-1 text-center bg-background"
          />
        </div>

        <textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Three reports + a declaration signature are due the same week. A 7-day extension on this one would let us focus."
          className="w-full text-xs border border-input rounded-md p-2 bg-background"
        />

        <button
          type="button"
          onClick={submitRequest}
          disabled={busy || reason.trim().length < 5}
          className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-sun))] text-white text-xs font-semibold px-3 py-1.5 hover:opacity-90 disabled:opacity-50"
        >
          {busy
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…</>
            : <><Send className="w-3.5 h-3.5" /> Send request</>}
        </button>
      </section>
    );
  }

  return null;
}
