'use client';

/**
 * DeclarationLedgerPanel — Phase 43C.
 *
 * Human-readable timeline of the declaration's audit chain. Surfaces
 * the existing AuditChainEntry rows as a chronological narrative so
 * the OB can answer "who signed, when, with what COI attestation,
 * who recused and why, when did activation fire, what grants were
 * auto-created, when were applications released."
 *
 * Backend: GET /api/declarations/<id>/ledger
 */

import useSWR from 'swr';
import { api } from '@/lib/api';
import {
  ShieldCheck, AlertCircle, CheckCircle2, XCircle, Sparkles,
  Send, Edit3, Lock,
} from 'lucide-react';

const fetcher = <T,>(url: string): Promise<T> => api.get<T>(url);

interface Event {
  seq: number;
  audit_id: number;
  action: string;
  label: string;
  detail: string;
  tone: 'info' | 'good' | 'warn' | 'bad';
  actor_email: string | null;
  created_at: string;
}

interface Ledger {
  success: boolean;
  declaration_id: number;
  declaration_title: string;
  events: Event[];
}

export function DeclarationLedgerPanel({ declarationId }: { declarationId: number }) {
  const { data, isLoading } = useSWR<Ledger>(
    declarationId ? `/declarations/${declarationId}/ledger` : null,
    fetcher,
  );

  if (isLoading) {
    return <div className="kuja-shimmer h-32 rounded" />;
  }

  if (!data || !data.success) {
    return null;
  }

  const events = data.events ?? [];

  return (
    <section className="border border-border rounded-lg bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-[hsl(var(--kuja-grow))]/10 text-[hsl(var(--kuja-grow))] shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="kuja-eyebrow text-[10px]">Hash-anchored chain · tamper-evident</h2>
            <h3 className="font-semibold text-base">Oversight Body process timeline</h3>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
              Every step the Oversight Body took on this declaration, in order. Each
              entry corresponds to an AuditChainEntry row and is verifiable in the
              audit-chain ledger.
            </p>
          </div>
        </div>
      </div>

      {events.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          No process events yet — the declaration is still a draft.
        </p>
      ) : (
        <ol className="space-y-3 border-l-2 border-border ml-4 pl-4">
          {events.map((e) => <EventNode key={e.audit_id} event={e} />)}
        </ol>
      )}
    </section>
  );
}

function EventNode({ event: e }: { event: Event }) {
  const tone = e.tone;
  const cfg = (() => {
    if (tone === 'good') return { icon: CheckCircle2, color: 'text-[hsl(var(--kuja-grow))]', bg: 'bg-[hsl(var(--kuja-grow))]/15' };
    if (tone === 'warn') return { icon: AlertCircle, color: 'text-[hsl(var(--kuja-sun))]', bg: 'bg-[hsl(var(--kuja-sun))]/15' };
    if (tone === 'bad') return { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/15' };
    return { icon: chooseIconForAction(e.action), color: 'text-muted-foreground', bg: 'bg-muted/60' };
  })();
  const Icon = cfg.icon;
  const when = new Date(e.created_at);

  return (
    <li className="relative">
      <span
        className={`absolute -left-[27px] grid h-5 w-5 place-items-center rounded-full ring-2 ring-background ${cfg.bg}`}
        aria-hidden
      >
        <Icon className={`w-3 h-3 ${cfg.color}`} />
      </span>
      <div>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-semibold text-sm">{e.label}</span>
          <span className="text-[10px] text-muted-foreground font-mono">
            audit #{e.audit_id} · seq {e.seq}
          </span>
        </div>
        {e.detail && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{e.detail}</p>
        )}
        <div className="text-[10px] text-muted-foreground mt-0.5">
          {when.toLocaleString()}
          {e.actor_email && <> · {e.actor_email}</>}
        </div>
      </div>
    </li>
  );
}

function chooseIconForAction(action: string) {
  if (action.includes('drafted')) return Edit3;
  if (action.includes('submitted')) return Send;
  if (action.includes('signed')) return CheckCircle2;
  if (action.includes('grants')) return Sparkles;
  if (action.includes('released')) return Send;
  if (action.includes('cancelled')) return XCircle;
  return ShieldCheck;
}
