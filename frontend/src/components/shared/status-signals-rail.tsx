'use client';

/**
 * StatusSignalsRail — ASK / RISK / DECISION 3-column rail.
 *
 * Renders on application + report (+ grant) detail pages. Three tinted
 * columns: blue (asks), amber (risks), green (decisions). Each column
 * shows open signals, lets the user add a new one inline, and resolves
 * an existing one with a one-click toggle.
 *
 * Color-coded — matches the PMO + dashboard rollup pattern. Helps
 * leadership scan "what needs me, what could derail us, what was agreed."
 */

import { useEffect, useState } from 'react';
import { Plus, Check, X, Loader2, MessageCircleQuestion, AlertTriangle, ScrollText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type SignalKind = 'ask' | 'risk' | 'decision';
type EntityKind = 'application' | 'report' | 'grant';

interface Signal {
  id: number;
  entity_kind: EntityKind;
  entity_id: number;
  kind: SignalKind;
  body: string;
  status: 'open' | 'resolved' | 'archived';
  resolution_note: string | null;
  resolved_at: string | null;
  resolved_by_name: string | null;
  created_by_name: string | null;
  created_at: string;
}

const KIND_META: Record<SignalKind, {
  label: string; tone: string; bg: string; border: string; icon: typeof MessageCircleQuestion;
  placeholder: string;
}> = {
  ask: {
    label: 'ASKS',
    tone: 'text-[hsl(var(--kuja-sky))]',
    bg: 'bg-[hsl(210_60%_98%)]',
    border: 'border-l-[hsl(210_60%_50%)]',
    icon: MessageCircleQuestion,
    placeholder: 'What do you need from leadership / donor?',
  },
  risk: {
    label: 'RISKS',
    tone: 'text-[hsl(var(--kuja-sun))]',
    bg: 'bg-[hsl(32_80%_98%)]',
    border: 'border-l-[hsl(var(--kuja-sun))]',
    icon: AlertTriangle,
    placeholder: 'What could derail this?',
  },
  decision: {
    label: 'DECISIONS',
    tone: 'text-[hsl(var(--kuja-grow))]',
    bg: 'bg-[hsl(142_50%_98%)]',
    border: 'border-l-[hsl(var(--kuja-grow))]',
    icon: ScrollText,
    placeholder: 'What was agreed?',
  },
};

function SignalCard({ signal, onResolve, onDelete }: {
  signal: Signal;
  onResolve: (s: Signal) => Promise<void>;
  onDelete: (s: Signal) => Promise<void>;
}) {
  const isResolved = signal.status === 'resolved';
  return (
    <li className="rounded-md border border-[hsl(var(--border))] bg-background p-2.5 text-xs">
      <p className={cn(
        'leading-relaxed text-[hsl(var(--kuja-ink))]',
        isResolved && 'line-through opacity-60',
      )}>
        {signal.body}
      </p>
      <div className="mt-1.5 flex items-center justify-between text-[10px] text-[hsl(var(--kuja-ink-soft))]">
        <span>
          {signal.created_by_name && <>by {signal.created_by_name} · </>}
          {new Date(signal.created_at).toLocaleDateString()}
        </span>
        <div className="flex items-center gap-1">
          {!isResolved && (
            <button
              type="button"
              onClick={() => onResolve(signal)}
              className="rounded p-1 hover:bg-[hsl(var(--kuja-grow)/0.1)] text-[hsl(var(--kuja-grow))]"
              aria-label="Mark resolved"
              title="Mark resolved"
            >
              <Check className="w-3 h-3" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onDelete(signal)}
            className="rounded p-1 hover:bg-[hsl(var(--kuja-flag)/0.1)] text-[hsl(var(--kuja-flag))]"
            aria-label="Delete"
            title="Delete"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
      {isResolved && signal.resolution_note && (
        <p className="mt-1 text-[10px] italic text-[hsl(var(--kuja-ink-soft))]">
          ↳ {signal.resolution_note}
        </p>
      )}
    </li>
  );
}

function SignalColumn({
  kind, signals, entityKind, entityId, onChanged,
}: {
  kind: SignalKind;
  signals: Signal[];
  entityKind: EntityKind;
  entityId: number;
  onChanged: () => Promise<void>;
}) {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await api.post('/api/signals', {
        entity_kind: entityKind,
        entity_id: entityId,
        kind,
        body: draft.trim(),
      });
      setDraft('');
      await onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const resolve = async (s: Signal) => {
    await api.post(`/api/signals/${s.id}/resolve`, {});
    await onChanged();
  };
  const del = async (s: Signal) => {
    await api.delete(`/api/signals/${s.id}`);
    await onChanged();
  };

  const open = signals.filter(s => s.status === 'open');
  const resolved = signals.filter(s => s.status === 'resolved');

  return (
    <Card className={cn('border-l-4 p-3 sm:p-4', meta.border, meta.bg)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className={cn('w-3.5 h-3.5', meta.tone)} />
          <span className={cn('text-[10px] uppercase tracking-wider font-semibold', meta.tone)}>{meta.label}</span>
        </div>
        <span className="text-[10px] text-[hsl(var(--kuja-ink-soft))]">
          {open.length} open
        </span>
      </div>

      <ul className="mt-2 space-y-2">
        {open.map(s => (
          <SignalCard key={s.id} signal={s} onResolve={resolve} onDelete={del} />
        ))}
        {open.length === 0 && (
          <li className="text-[11px] text-[hsl(var(--kuja-ink-soft))] italic py-1">No open items.</li>
        )}
      </ul>

      {resolved.length > 0 && (
        <details className="mt-2 group">
          <summary className="text-[10px] uppercase tracking-wider font-semibold text-[hsl(var(--kuja-ink-soft))] cursor-pointer">
            Resolved ({resolved.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {resolved.map(s => (
              <SignalCard key={s.id} signal={s} onResolve={resolve} onDelete={del} />
            ))}
          </ul>
        </details>
      )}

      <form onSubmit={submit} className="mt-2">
        <div className="flex items-center gap-1.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={meta.placeholder}
            maxLength={500}
            className="flex-1 rounded-md border border-[hsl(var(--border))] bg-background px-2 py-1.5 text-xs"
          />
          <button
            type="submit"
            disabled={!draft.trim() || adding}
            className="rounded-md bg-[hsl(var(--kuja-clay))] px-2 py-1.5 text-xs font-semibold text-white hover:bg-[hsl(var(--kuja-clay-dark))] disabled:opacity-50"
            aria-label="Add"
          >
            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          </button>
        </div>
        {error && <p className="mt-1 text-[10px] text-[hsl(var(--kuja-flag))]">{error}</p>}
      </form>
    </Card>
  );
}

export interface StatusSignalsRailProps {
  entityKind: EntityKind;
  entityId: number;
  className?: string;
}

export function StatusSignalsRail({ entityKind, entityId, className }: StatusSignalsRailProps) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const resp = await api.get<{ signals: Signal[] }>(`/api/signals/${entityKind}/${entityId}`);
      setSignals(resp.signals);
    } catch {
      setSignals([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityKind, entityId]);

  if (loading) {
    return (
      <div className={cn('grid grid-cols-1 md:grid-cols-3 gap-3', className)}>
        <div className="kuja-shimmer h-32 rounded-xl" />
        <div className="kuja-shimmer h-32 rounded-xl" />
        <div className="kuja-shimmer h-32 rounded-xl" />
      </div>
    );
  }

  const asks = signals.filter(s => s.kind === 'ask');
  const risks = signals.filter(s => s.kind === 'risk');
  const decisions = signals.filter(s => s.kind === 'decision');

  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-3 gap-3', className)}>
      <SignalColumn kind="ask"      signals={asks}      entityKind={entityKind} entityId={entityId} onChanged={load} />
      <SignalColumn kind="risk"     signals={risks}     entityKind={entityKind} entityId={entityId} onChanged={load} />
      <SignalColumn kind="decision" signals={decisions} entityKind={entityKind} entityId={entityId} onChanged={load} />
    </div>
  );
}
