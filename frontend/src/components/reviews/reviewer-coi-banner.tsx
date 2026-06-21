'use client';

/**
 * Phase 283 — Reviewer COI self-disclosure banner.
 *
 * Sits on the reviewer review-detail page. If the reviewer hasn't
 * disclosed a conflict, shows a "Disclose conflict" button that opens
 * a dialog (kind + optional note). If they have, shows a small
 * acknowledgement that admin has been notified.
 *
 * Backend: POST /api/reviews/<id>/coi-flag — see app/routes/reviews.py.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertOctagon, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

const KINDS: Array<{ key: 'employer_overlap' | 'prior_consulting' | 'family' | 'other'; label: string }> = [
  { key: 'employer_overlap', label: 'Same / former employer as applicant' },
  { key: 'prior_consulting', label: 'Prior consulting / paid engagement' },
  { key: 'family', label: 'Family or close personal relationship' },
  { key: 'other', label: 'Other' },
];

interface ReviewLite {
  id?: number;
  coi_disclosed_at?: string | null;
  coi_kind?: string | null;
  coi_note?: string | null;
}

export function ReviewerCoiBanner({ reviewId }: { reviewId: number | null }) {
  const router = useRouter();
  const [review, setReview] = useState<ReviewLite | null>(null);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<typeof KINDS[number]['key']>('employer_overlap');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [recused, setRecused] = useState(false);

  useEffect(() => {
    if (!reviewId) return;
    const state = { cancelled: false };
    api.get<{ review: ReviewLite }>(`/api/reviews/${reviewId}`)
      .then((r) => { if (!state.cancelled) setReview(r?.review ?? null); })
      .catch(() => { if (!state.cancelled) setReview(null); });
    return () => { state.cancelled = true; };
  }, [reviewId]);

  if (!reviewId) return null;

  const disclosed = !!review?.coi_disclosed_at;

  if (disclosed) {
    const label = KINDS.find((k) => k.key === review?.coi_kind)?.label || review?.coi_kind || 'Conflict';
    return (
      <Card className="border-amber-300 bg-amber-50/70 dark:bg-amber-950/20">
        <CardContent className="py-3 text-sm inline-flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-700" />
          <span className="text-amber-900 dark:text-amber-200">
            You disclosed a conflict ({label}). An admin has been notified and may reassign.
          </span>
        </CardContent>
      </Card>
    );
  }

  async function submit() {
    if (!reviewId) return;
    setSaving(true);
    try {
      const r = await api.post<{ review: ReviewLite; recused?: boolean }>(
        `/api/reviews/${reviewId}/coi-flag`, { kind, note }
      );
      setReview(r?.review ?? null);
      setOpen(false);
      // Phase 289 — backend now auto-recuses on disclosure. The review
      // row is gone — bounce to the queue so the reviewer doesn't sit
      // on a stale detail page.
      if (r?.recused) {
        setRecused(true);
        setTimeout(() => router.push('/reviews'), 1500);
      }
    } catch {
      // swallow — the dialog stays open so the user can retry
    } finally {
      setSaving(false);
    }
  }

  if (recused) {
    return (
      <Card className="border-amber-300 bg-amber-50/70 dark:bg-amber-950/20">
        <CardContent className="py-3 text-sm inline-flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-700" />
          <span className="text-amber-900 dark:text-amber-200">
            Recused. Returning to your queue…
          </span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-300 hover:underline"
      >
        <AlertOctagon className="w-3.5 h-3.5" />
        Disclose conflict
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Disclose a conflict of interest</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              An admin will be notified and may reassign this review. Your disclosure is logged to the audit chain.
            </p>
            <div className="space-y-1.5">
              {KINDS.map((k) => (
                <label key={k.key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="coi-kind"
                    value={k.key}
                    checked={kind === k.key}
                    onChange={() => setKind(k.key)}
                  />
                  <span>{k.label}</span>
                </label>
              ))}
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Note (optional)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 1000))}
                rows={3}
                className="w-full text-sm rounded-md border border-border bg-background p-2"
                placeholder="Brief context for the admin..."
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
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
                {saving ? 'Disclosing…' : 'Disclose'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
