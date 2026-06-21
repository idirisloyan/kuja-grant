'use client';

/**
 * Phase 302 — NGO appeal flow on declined applications.
 * Phase 308/309 — Donor resolves the appeal (approve / decline).
 *
 * Three render states:
 *  - Pre-appeal: owner NGO sees a "Request re-review" button.
 *  - Pending: everyone sees the appeal text + (donor only) Approve / Decline.
 *  - Resolved: everyone sees the outcome (emerald approved or rose declined)
 *    plus the resolution_text.
 */

import { useEffect, useState } from 'react';
import { Scale, CheckCircle, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

interface Props {
  applicationId: number;
  isOwnerNgo: boolean;
  status?: string;
  appealRequestedAt?: string | null;
  appealReasonText?: string | null;
  appealResolvedAt?: string | null;
  appealResolution?: string | null;
  appealResolutionText?: string | null;
  viewerRole?: string;
}

export function AppealPanel({
  applicationId,
  isOwnerNgo,
  status,
  appealRequestedAt,
  appealReasonText,
  appealResolvedAt,
  appealResolution,
  appealResolutionText,
  viewerRole,
}: Props) {
  const [requestedAt, setRequestedAt] = useState<string | null>(appealRequestedAt ?? null);
  const [reasonText, setReasonText] = useState<string | null>(appealReasonText ?? null);
  const [resolvedAt, setResolvedAt] = useState<string | null>(appealResolvedAt ?? null);
  const [resolution, setResolution] = useState<string | null>(appealResolution ?? null);
  const [resolutionText, setResolutionText] = useState<string | null>(appealResolutionText ?? null);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [resolveOpen, setResolveOpen] = useState<null | 'approved' | 'declined'>(null);
  const [resolveText, setResolveText] = useState('');
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    setRequestedAt(appealRequestedAt ?? null);
    setReasonText(appealReasonText ?? null);
    setResolvedAt(appealResolvedAt ?? null);
    setResolution(appealResolution ?? null);
    setResolutionText(appealResolutionText ?? null);
  }, [appealRequestedAt, appealReasonText, appealResolvedAt, appealResolution, appealResolutionText]);

  const isDeclined = status === 'declined' || status === 'rejected' || (!!requestedAt);
  if (!isDeclined) return null;

  async function submit() {
    if (draft.trim().length < 20) {
      setErr('Please provide at least 20 characters of context.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const r = await api.post<{ appeal_requested_at?: string; appeal_reason_text?: string }>(
        `/api/applications/${applicationId}/appeal`,
        { reason: draft.trim() }
      );
      if (r?.appeal_requested_at) setRequestedAt(r.appeal_requested_at);
      if (r?.appeal_reason_text) setReasonText(r.appeal_reason_text);
      setOpen(false);
    } catch {
      setErr('Could not submit appeal. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function resolve() {
    if (!resolveOpen) return;
    setResolving(true);
    try {
      const r = await api.post<{
        appeal_resolved_at?: string;
        appeal_resolution?: string;
        appeal_resolution_text?: string;
      }>(
        `/api/applications/${applicationId}/appeal/resolve`,
        { resolution: resolveOpen, text: resolveText.trim() }
      );
      if (r?.appeal_resolved_at) setResolvedAt(r.appeal_resolved_at);
      if (r?.appeal_resolution) setResolution(r.appeal_resolution);
      if (r?.appeal_resolution_text != null) setResolutionText(r.appeal_resolution_text);
      setResolveOpen(null);
      setResolveText('');
    } catch {
      // swallow
    } finally {
      setResolving(false);
    }
  }

  // Resolved — show outcome to everyone.
  if (resolvedAt) {
    const approved = resolution === 'approved';
    return (
      <div className={
        approved
          ? 'rounded-md border border-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/20 p-3 text-sm space-y-1'
          : 'rounded-md border border-rose-300 bg-rose-50/70 dark:bg-rose-950/20 p-3 text-sm space-y-1'
      }>
        <p className={`text-xs font-semibold inline-flex items-center gap-1.5 ${approved ? 'text-emerald-800 dark:text-emerald-300' : 'text-rose-800 dark:text-rose-300'}`}>
          {approved ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
          Appeal {approved ? 'approved' : 'declined'}
        </p>
        <p className="text-xs text-muted-foreground">
          {new Date(resolvedAt).toLocaleDateString()}
        </p>
        {resolutionText && (
          <p className="text-sm whitespace-pre-wrap pt-1 border-t border-border mt-1">{resolutionText}</p>
        )}
        {reasonText && (
          <details className="pt-1 mt-1 border-t border-border">
            <summary className="text-xs text-muted-foreground cursor-pointer">Original appeal</summary>
            <p className="text-xs whitespace-pre-wrap pt-1">{reasonText}</p>
          </details>
        )}
      </div>
    );
  }

  // Pending — show appeal text + (donor/admin only) resolve buttons.
  if (requestedAt) {
    const canResolve = viewerRole === 'donor' || viewerRole === 'admin';
    return (
      <>
        <div className="rounded-md border border-amber-300 bg-amber-50/70 dark:bg-amber-950/20 p-3 text-sm space-y-1">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 inline-flex items-center gap-1.5">
            <Scale className="w-3.5 h-3.5" />
            Re-review requested
          </p>
          <p className="text-xs text-muted-foreground">{new Date(requestedAt).toLocaleDateString()}</p>
          {reasonText && (
            <p className="text-sm whitespace-pre-wrap pt-1 border-t border-amber-200 dark:border-amber-800 mt-1">
              {reasonText}
            </p>
          )}
          {canResolve && (
            <div className="flex justify-end gap-2 pt-2 border-t border-amber-200 dark:border-amber-800 mt-2">
              <button
                type="button"
                onClick={() => { setResolveOpen('declined'); setResolveText(''); }}
                className="text-xs px-3 py-1 rounded-md border border-rose-300 text-rose-700 hover:bg-rose-50"
              >
                Decline appeal
              </button>
              <button
                type="button"
                onClick={() => { setResolveOpen('approved'); setResolveText(''); }}
                className="text-xs px-3 py-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
              >
                Approve & reopen
              </button>
            </div>
          )}
        </div>

        <Dialog open={!!resolveOpen} onOpenChange={(v) => { if (!v) setResolveOpen(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{resolveOpen === 'approved' ? 'Approve appeal' : 'Decline appeal'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                {resolveOpen === 'approved'
                  ? 'The application will be reopened to under review.'
                  : 'The decline will stand. Briefly explain why for the applicant.'}
              </p>
              <textarea
                value={resolveText}
                onChange={(e) => setResolveText(e.target.value.slice(0, 2000))}
                rows={5}
                className="w-full text-sm rounded-md border border-border bg-background p-2"
                placeholder={resolveOpen === 'approved'
                  ? 'Optional context for the applicant'
                  : 'Why is the original decision being kept?'}
              />
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setResolveOpen(null)}
                  className="text-xs px-3 py-1.5 rounded-md border border-border"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={resolve}
                  disabled={resolving}
                  className={`text-xs px-3 py-1.5 rounded-md text-white disabled:opacity-50 ${resolveOpen === 'approved' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}
                >
                  {resolving ? 'Submitting…' : `Submit ${resolveOpen === 'approved' ? 'approval' : 'decline'}`}
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // No appeal yet — only owner NGO sees the button.
  if (!isOwnerNgo) return null;

  return (
    <>
      <div className="flex justify-end px-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-amber-300 text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30"
        >
          <Scale className="w-3.5 h-3.5" />
          Request re-review
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request a re-review</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Briefly explain why you believe the decision should be reconsidered.
              An admin and the donor will be notified.
            </p>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
              rows={6}
              className="w-full text-sm rounded-md border border-border bg-background p-2"
              placeholder="What was misunderstood? What new evidence can you provide?"
            />
            {err && <p className="text-xs text-rose-700">{err}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs px-3 py-1.5 rounded-md border border-border"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={saving}
                className="text-xs px-3 py-1.5 rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {saving ? 'Submitting…' : 'Submit appeal'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
