'use client';

/**
 * DecisionDebriefPanel — PMO transfer pattern (Phase 14).
 *
 * On awarded/rejected applications, the donor records WHY:
 *   - A controlled-vocab reason code (chip selector)
 *   - Optional free-text notes
 *
 * NGOs see the same panel read-only — structured feedback closes the
 * loop on declined proposals AND explains why winners won. Over time
 * the system can aggregate "you consistently lose on weak M&E" cross-
 * grant patterns (already shipped Phase 11 — this feeds quality data
 * into it).
 *
 * Donor view (edit mode):
 *   - Chip selector grouped by tone (win vs loss)
 *   - Notes textarea
 *   - Save / clear buttons
 *
 * NGO/reviewer view (read-only):
 *   - Reason chip + notes block
 *   - "Recorded by [donor] on [date]" attribution
 *   - Quiet on missing (no shame badge)
 */

import { useEffect, useState } from 'react';
import { Award, XCircle, Sparkles, Save, Loader2, MessageSquare } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ReasonOpt {
  code: string;
  label: string;
  tone: 'win' | 'loss' | 'both';
}

interface DebriefState {
  decision_reason_code: string | null;
  decision_notes: string | null;
  decision_recorded_at: string | null;
  decision_recorded_by_user_id: number | null;
}

interface Props {
  applicationId: number;
  /** Awarded | rejected. Anything else hides the panel. */
  status: string;
  /** 'donor' | 'admin' can edit; everyone else read-only. */
  canEdit: boolean;
  initial?: Partial<DebriefState>;
  /** Optional callback so the parent can refresh state after save. */
  onSaved?: (state: DebriefState) => void;
}

export function DecisionDebriefPanel({
  applicationId, status, canEdit, initial, onSaved,
}: Props) {
  const [reasons, setReasons] = useState<ReasonOpt[]>([]);
  const [code, setCode] = useState<string>(initial?.decision_reason_code ?? '');
  const [notes, setNotes] = useState<string>(initial?.decision_notes ?? '');
  const [recordedAt, setRecordedAt] = useState<string | null>(initial?.decision_recorded_at ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Show only for decided applications
  const visible = status === 'awarded' || status === 'rejected';

  useEffect(() => {
    if (!visible) return;
    api.get<{ reasons: ReasonOpt[] }>('/api/applications/decision-reasons')
      .then((r) => setReasons(r.reasons || []))
      .catch(() => setReasons([]));
  }, [visible]);

  if (!visible) return null;

  const isAwarded = status === 'awarded';
  const Icon = isAwarded ? Award : XCircle;
  const headerTone = isAwarded
    ? 'text-[hsl(var(--kuja-grow))]'
    : 'text-[hsl(var(--kuja-flag))]';
  const headerLabel = isAwarded ? 'Win debrief' : 'Loss debrief';

  // Filter reasons to those that make sense for this outcome
  const optsForStatus = reasons.filter((r) =>
    r.tone === 'both' || (isAwarded ? r.tone === 'win' : r.tone === 'loss')
  );
  const selected = reasons.find((r) => r.code === code) || null;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await api.put<{ success: boolean } & DebriefState>(
        `/api/applications/${applicationId}/debrief`,
        { reason_code: code, notes },
      );
      if (res.success) {
        setRecordedAt(res.decision_recorded_at);
        onSaved?.(res);
      } else {
        setError('Save failed');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex items-start gap-2">
        <Icon className={cn('h-5 w-5 mt-0.5', headerTone)} aria-hidden="true" />
        <div className="flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">
            {headerLabel} · {isAwarded ? 'Why this won' : 'Why this didn\'t win'}
          </div>
          <h3 className="kuja-display text-lg">Structured feedback</h3>
          <p className="text-xs text-muted-foreground">
            {canEdit
              ? 'Record a reason + notes so the applicant gets clear feedback. Used to aggregate cross-grant learning.'
              : 'Feedback from the funder. Use it to sharpen your next application.'}
          </p>
        </div>
      </div>

      {!canEdit ? (
        // Read-only view (NGO + reviewer)
        <div>
          {!selected && !notes ? (
            <p className="text-sm text-muted-foreground italic">
              No structured feedback recorded yet.
            </p>
          ) : (
            <>
              {selected && (
                <Badge
                  variant="outline"
                  className={cn(
                    'mr-2 mb-2',
                    selected.tone === 'win'  && 'border-[hsl(var(--kuja-grow))] text-[hsl(var(--kuja-grow))]',
                    selected.tone === 'loss' && 'border-[hsl(var(--kuja-flag))] text-[hsl(var(--kuja-flag))]',
                  )}
                >
                  {selected.label}
                </Badge>
              )}
              {notes && (
                <div className="mt-2 rounded-md border-l-2 border-[hsl(var(--kuja-clay))] bg-[hsl(var(--kuja-sand))]/40 p-3">
                  <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-[hsl(var(--kuja-clay-dark))]">
                    <MessageSquare className="h-3 w-3" /> Notes
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{notes}</p>
                </div>
              )}
              {recordedAt && (
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Recorded {new Date(recordedAt).toLocaleString()}
                </p>
              )}
            </>
          )}
        </div>
      ) : (
        // Edit view (donor + admin)
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">
              Reason
            </label>
            <div className="flex flex-wrap gap-1.5">
              {optsForStatus.map((r) => (
                <button
                  key={r.code}
                  type="button"
                  onClick={() => setCode(code === r.code ? '' : r.code)}
                  aria-pressed={code === r.code}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors',
                    code === r.code
                      ? 'border-[hsl(var(--kuja-clay))] bg-[hsl(var(--kuja-clay))] text-white'
                      : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--kuja-sand))]/40',
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="debrief-notes"
              className="mb-1 block text-xs font-semibold text-muted-foreground"
            >
              Notes <span className="font-normal">(optional, up to 4,000 chars)</span>
            </label>
            <Textarea
              id="debrief-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="What specifically did or didn't work? Be honest — this is the most useful feedback you can give."
              maxLength={4000}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] text-muted-foreground">
              {recordedAt
                ? `Last recorded ${new Date(recordedAt).toLocaleString()}`
                : 'Not recorded yet'}
            </div>
            <div className="flex items-center gap-2">
              {error && <span className="text-xs text-[hsl(var(--kuja-flag))]">{error}</span>}
              <Button size="sm" onClick={save} disabled={saving}>
                {saving
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Save className="h-3.5 w-3.5" />}
                <span className="ml-1.5">Save debrief</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Sparkles className="h-3 w-3" />
        Feeds into cross-grant patterns for both sides.
      </div>
    </Card>
  );
}
