'use client';

/**
 * Phase 327 — Reviewer "Snooze this review" action.
 *
 * Defers a review for 3 / 7 / 14 days. Snoozed reviews fall off the
 * queue list until expiry. After successful snooze, redirect back to
 * /reviews so the reviewer doesn't sit on the page.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock } from 'lucide-react';
import { api } from '@/lib/api';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

interface Props {
  reviewId: number | null;
  snoozedUntil?: string | null;
}

const OPTIONS = [3, 7, 14] as const;

export function SnoozeButton({ reviewId, snoozedUntil }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<typeof OPTIONS[number]>(7);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  if (!reviewId) return null;

  if (snoozedUntil) {
    return (
      <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5 px-1">
        <Clock className="w-3 h-3 text-amber-600" />
        Snoozed until {new Date(snoozedUntil).toLocaleDateString()}
      </p>
    );
  }

  async function submit() {
    if (!reviewId) return;
    setSaving(true);
    try {
      await api.post(`/api/reviews/${reviewId}/snooze`, { days, reason });
      setOpen(false);
      router.push('/reviews');
    } catch {
      // swallow — dialog stays open
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:bg-muted"
      >
        <Clock className="w-3.5 h-3.5" />
        Snooze
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Snooze this review</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex gap-2">
              {OPTIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(d)}
                  className={
                    days === d
                      ? 'flex-1 text-xs px-2 py-1.5 rounded-md bg-[hsl(var(--kuja-clay))] text-white'
                      : 'flex-1 text-xs px-2 py-1.5 rounded-md border border-border'
                  }
                >
                  {d} days
                </button>
              ))}
            </div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 200))}
              rows={2}
              className="w-full text-sm rounded-md border border-border bg-background p-2"
              placeholder="Optional: why are you snoozing this?"
            />
            <div className="flex justify-end gap-2">
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
                className="text-xs px-3 py-1.5 rounded-md bg-[hsl(var(--kuja-clay))] text-white disabled:opacity-50"
              >
                {saving ? 'Snoozing…' : 'Snooze'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
