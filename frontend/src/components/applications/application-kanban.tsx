'use client';

/**
 * ApplicationKanban — Phase 15B (PMO transfer pattern).
 *
 * Donor pipeline view: applications laid out as columns by status,
 * cards drag-and-drop between columns. Uses native HTML5 drag-drop
 * (no extra dependency) — the same pattern the PMO opportunity board
 * uses. Mobile devices fall back to a status-flip dropdown so the
 * column UX is still actionable on touch screens.
 *
 * Status flow this kanban supports:
 *   draft → submitted → under_review → (awarded | rejected)
 *
 * Permissions:
 *   - donor can move submitted/under_review → awarded/rejected
 *   - donor can move under_review back to submitted (reopen)
 *   - draft column is read-only (NGO transitions on submit)
 *
 * Optimistic UI with explicit rollback on server error.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Inbox, FileText, Eye, Award, XCircle, Loader2, AlertCircle,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useApplications } from '@/lib/hooks/use-api';
import { cn } from '@/lib/utils';
import { RecencyChip } from '@/components/shared/recency-chip';

type Status = 'draft' | 'submitted' | 'under_review' | 'awarded' | 'rejected';

interface KanbanCard {
  id: number;
  grant_id: number;
  grant_title?: string | null;
  org_name?: string | null;
  status: string;
  ai_score?: number | null;
  updated_at?: string | null;
  created_at?: string | null;
  submitted_at?: string | null;
}

const COLUMNS: { id: Status; label: string; icon: typeof Inbox; tone: string }[] = [
  { id: 'draft',        label: 'Drafts',       icon: Inbox,    tone: 'text-[hsl(var(--kuja-ink-soft))]' },
  { id: 'submitted',    label: 'Submitted',    icon: FileText, tone: 'text-[hsl(var(--kuja-clay))]' },
  { id: 'under_review', label: 'Under review', icon: Eye,      tone: 'text-[hsl(var(--kuja-sun))]' },
  { id: 'awarded',      label: 'Awarded',      icon: Award,    tone: 'text-[hsl(var(--kuja-grow))]' },
  { id: 'rejected',     label: 'Declined',     icon: XCircle,  tone: 'text-[hsl(var(--kuja-flag))]' },
];

// Allowed transitions for donor drag-drop. Draft column is read-only
// (NGO triggers draft → submitted via /submit endpoint).
const DONOR_TRANSITIONS: Partial<Record<Status, Status[]>> = {
  submitted:    ['under_review', 'awarded', 'rejected'],
  under_review: ['submitted', 'awarded', 'rejected'],
  awarded:      ['under_review'], // allow undo within window
  rejected:     ['under_review'], // allow undo within window
};

function canDrop(from: Status, to: Status): boolean {
  const allowed = DONOR_TRANSITIONS[from];
  return !!allowed && allowed.includes(to);
}

function ApplicationCard({
  card, onMobileMove, draggingId, setDraggingId,
}: {
  card: KanbanCard;
  onMobileMove: (id: number, to: Status) => void;
  draggingId: number | null;
  setDraggingId: (id: number | null) => void;
}) {
  const router = useRouter();
  const isDraft = card.status === 'draft';
  const allowed = DONOR_TRANSITIONS[card.status as Status] || [];

  return (
    <div
      draggable={!isDraft}
      onDragStart={(e) => {
        if (isDraft) return;
        e.dataTransfer.setData('text/plain', String(card.id));
        e.dataTransfer.setData('application/x-kuja-status', card.status);
        e.dataTransfer.effectAllowed = 'move';
        setDraggingId(card.id);
      }}
      onDragEnd={() => setDraggingId(null)}
      onClick={() => router.push(`/applications/${card.id}`)}
      className={cn(
        'group rounded-md border border-[hsl(var(--border))] bg-background p-2.5',
        'cursor-pointer transition-all',
        !isDraft && 'cursor-grab active:cursor-grabbing hover:border-[hsl(var(--kuja-clay))]',
        draggingId === card.id && 'opacity-50',
      )}
    >
      <div className="text-xs font-semibold text-foreground line-clamp-2">
        {card.grant_title || `Grant #${card.grant_id}`}
      </div>
      {card.org_name && (
        <div className="mt-0.5 text-[10px] text-muted-foreground truncate">
          {card.org_name}
        </div>
      )}
      <div className="mt-1.5 flex items-center justify-between gap-1">
        <RecencyChip iso={card.updated_at || card.created_at} />
        {card.ai_score != null && (
          <Badge variant="outline" className="text-[10px] tabular-nums">
            AI {Math.round(card.ai_score)}
          </Badge>
        )}
      </div>

      {/* Mobile fallback: status flip dropdown (touch can't drag) */}
      {!isDraft && allowed.length > 0 && (
        <select
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const to = e.target.value as Status;
            if (to && to !== card.status) onMobileMove(card.id, to);
            e.target.value = ''; // reset select
          }}
          aria-label="Move application"
          className={cn(
            'mt-1.5 w-full rounded border border-[hsl(var(--border))] bg-background px-1 py-0.5 text-[10px]',
            'sm:hidden', // hidden on desktop where drag-drop works
          )}
        >
          <option value="">Move to…</option>
          {allowed.map((s) => {
            const label = COLUMNS.find((c) => c.id === s)?.label ?? s;
            return <option key={s} value={s}>{label}</option>;
          })}
        </select>
      )}
    </div>
  );
}

export function ApplicationKanban() {
  const { data, isLoading, mutate } = useApplications();
  const all = (data?.applications ?? []) as KanbanCard[];

  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [overCol, setOverCol] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<number | null>(null);

  // Local optimistic overlay. Maps id → new status. Reverts on error.
  const [optimistic, setOptimistic] = useState<Record<number, Status>>({});
  const merged = useMemo(() => {
    return all.map((a) => ({
      ...a,
      status: optimistic[a.id] || a.status,
    }));
  }, [all, optimistic]);

  const byStatus = useMemo(() => {
    const out: Record<Status, KanbanCard[]> = {
      draft: [], submitted: [], under_review: [], awarded: [], rejected: [],
    };
    for (const a of merged) {
      const s = a.status as Status;
      if (out[s]) out[s].push(a);
    }
    // Sort each column by updated_at desc
    for (const s of Object.keys(out) as Status[]) {
      out[s].sort((a, b) => {
        const at = Date.parse(a.updated_at || a.created_at || '');
        const bt = Date.parse(b.updated_at || b.created_at || '');
        return bt - at;
      });
    }
    return out;
  }, [merged]);

  async function moveTo(id: number, to: Status) {
    const card = all.find((a) => a.id === id);
    if (!card) return;
    const from = (optimistic[id] || card.status) as Status;
    if (from === to) return;
    if (!canDrop(from, to)) {
      setError(`Can't move from ${from} → ${to}`);
      setTimeout(() => setError(null), 3000);
      return;
    }
    setMovingId(id);
    setOptimistic((p) => ({ ...p, [id]: to }));
    setError(null);
    try {
      await api.patch(`/api/applications/${id}/status`, { status: to });
      // SWR mutate to re-fetch authoritative state and drop optimistic
      await mutate?.();
      setOptimistic((p) => {
        const next = { ...p }; delete next[id]; return next;
      });
    } catch (e: unknown) {
      // Rollback
      setOptimistic((p) => {
        const next = { ...p }; delete next[id]; return next;
      });
      setError(e instanceof Error ? e.message : 'Move failed');
      setTimeout(() => setError(null), 4000);
    } finally {
      setMovingId(null);
    }
  }

  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading pipeline…
        </div>
      </Card>
    );
  }

  if (all.length === 0) {
    return null; // quiet on empty — donor sees their existing list
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="kuja-display text-lg">Pipeline</h3>
        <div className="flex items-center gap-2">
          {movingId && (
            <span className="text-[11px] text-muted-foreground">
              <Loader2 className="inline h-3 w-3 animate-spin mr-1" />
              Moving…
            </span>
          )}
          {error && (
            <span className="inline-flex items-center gap-1 text-[11px] text-[hsl(var(--kuja-flag))]">
              <AlertCircle className="h-3 w-3" /> {error}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-5">
        {COLUMNS.map((col) => {
          const cards = byStatus[col.id];
          const Icon = col.icon;
          const isOver = overCol === col.id;
          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (overCol !== col.id) setOverCol(col.id);
              }}
              onDragLeave={() => {
                if (overCol === col.id) setOverCol(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setOverCol(null);
                const id = Number(e.dataTransfer.getData('text/plain'));
                if (Number.isFinite(id)) moveTo(id, col.id);
              }}
              className={cn(
                'flex flex-col rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--kuja-sand))]/20 p-2 min-h-[200px]',
                isOver && 'ring-2 ring-[hsl(var(--kuja-clay))] bg-[hsl(var(--kuja-sand))]/60',
              )}
            >
              <div className="mb-2 flex items-center justify-between gap-1">
                <div className={cn('flex items-center gap-1.5 text-xs font-semibold', col.tone)}>
                  <Icon className="h-3.5 w-3.5" />
                  {col.label}
                </div>
                <Badge variant="outline" className="text-[10px] tabular-nums">{cards.length}</Badge>
              </div>
              <div className="space-y-1.5">
                {cards.length === 0 ? (
                  <div className="text-[10px] text-muted-foreground italic px-1 py-2">
                    Empty
                  </div>
                ) : (
                  cards.slice(0, 12).map((c) => (
                    <ApplicationCard
                      key={c.id}
                      card={c}
                      onMobileMove={moveTo}
                      draggingId={draggingId}
                      setDraggingId={setDraggingId}
                    />
                  ))
                )}
                {cards.length > 12 && (
                  <div className="text-[10px] text-muted-foreground italic px-1">
                    + {cards.length - 12} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground">
        Drag cards between columns to change status. Touch devices: use the in-card dropdown.
      </p>
    </div>
  );
}
