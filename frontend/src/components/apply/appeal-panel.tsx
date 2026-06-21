'use client';

/**
 * Phase 302 — NGO appeal flow on declined applications.
 *
 * NGO viewer of a declined app sees a "Request re-review" button that
 * opens a textarea dialog. Submission stamps appeal_requested_at +
 * appeal_reason_text, notifies admin + donor, and the panel flips to
 * "Re-review pending" for all viewers.
 */

import { useEffect, useState } from 'react';
import { Scale } from 'lucide-react';
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
}

export function AppealPanel({
  applicationId,
  isOwnerNgo,
  status,
  appealRequestedAt,
  appealReasonText,
}: Props) {
  const [requestedAt, setRequestedAt] = useState<string | null>(appealRequestedAt ?? null);
  const [reasonText, setReasonText] = useState<string | null>(appealReasonText ?? null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setRequestedAt(appealRequestedAt ?? null);
    setReasonText(appealReasonText ?? null);
  }, [appealRequestedAt, appealReasonText]);

  const isDeclined = status === 'declined' || status === 'rejected';
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

  // Already submitted — everyone sees the status.
  if (requestedAt) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50/70 dark:bg-amber-950/20 p-3 text-sm space-y-1">
        <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 inline-flex items-center gap-1.5">
          <Scale className="w-3.5 h-3.5" />
          Re-review requested
        </p>
        <p className="text-xs text-muted-foreground">
          {new Date(requestedAt).toLocaleDateString()}
        </p>
        {reasonText && (
          <p className="text-sm whitespace-pre-wrap pt-1 border-t border-amber-200 dark:border-amber-800 mt-1">
            {reasonText}
          </p>
        )}
      </div>
    );
  }

  // Not yet submitted — only owner NGO sees the button.
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
