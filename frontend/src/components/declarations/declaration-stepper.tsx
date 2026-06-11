'use client';

/**
 * DeclarationStepper — Phase 45.
 *
 * Visual lifecycle tracker at the top of the declaration detail page.
 * Replaces "you have to read the timeline to know where we are" with a
 * scannable 6-step chevron strip that highlights the current stage and
 * lights up completed stages.
 *
 * Stages map to the IKEA Concept Note flow:
 *   1. Draft         — OB drafted citing crisis evidence
 *   2. Committee     — signer slots assigned to OB members
 *   3. In review     — submitted; signers are acting
 *   4. Active        — threshold reached, 72h application window open
 *   5. Released      — applications flipped from draft to open
 *   6. Closed        — all grants under the declaration complete
 *
 * Cancelled / rejected paths short-circuit and show the bad-tone state
 * on the stage where it died.
 */

import type { EmergencyDeclaration } from '@/lib/hooks/use-api';
import {
  FileEdit, Users, Clock, ShieldCheck, Send, Archive,
  XCircle, AlertTriangle,
} from 'lucide-react';

type StageId = 'draft' | 'committee' | 'in_review' | 'active' | 'released' | 'closed';
type StageState = 'past' | 'current' | 'future' | 'bad';

interface Stage {
  id: StageId;
  label: string;
  sub: string;
  icon: typeof FileEdit;
}

const STAGES: Stage[] = [
  { id: 'draft',     label: '1. Draft',     sub: 'cite crisis evidence',  icon: FileEdit },
  { id: 'committee', label: '2. Committee', sub: 'pick OB signers',       icon: Users },
  { id: 'in_review', label: '3. In review', sub: 'OB signs with COI',     icon: Clock },
  { id: 'active',    label: '4. Active',    sub: '72h application window',icon: ShieldCheck },
  { id: 'released',  label: '5. Released',  sub: 'NGOs invited to apply', icon: Send },
  { id: 'closed',    label: '6. Closed',    sub: 'grants complete',       icon: Archive },
];

export function DeclarationStepper({ d }: { d: EmergencyDeclaration }) {
  // Map declaration state → which stage we're on
  const state = computeState(d);

  return (
    <section className="border border-border rounded-lg bg-card p-4">
      {/* Cancelled / rejected banner overrides the stepper */}
      {(d.status === 'cancelled' || (d.rejected_count ?? 0) > 0) && (
        <div className="mb-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-destructive/10 text-destructive text-xs font-semibold">
          {d.status === 'cancelled' ? <XCircle className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
          {d.status === 'cancelled'
            ? 'This declaration was cancelled.'
            : `Auto-cancelled by signer rejection (${d.rejected_count} rejection${d.rejected_count === 1 ? '' : 's'}).`}
          {d.status_reason && <span className="font-normal italic ml-1">— {d.status_reason}</span>}
        </div>
      )}

      {/* Stepper strip */}
      <ol className="flex items-stretch gap-0 overflow-x-auto">
        {STAGES.map((stage, idx) => {
          const cell = state[stage.id];
          const last = idx === STAGES.length - 1;
          return (
            <StepperCell
              key={stage.id}
              stage={stage}
              cell={cell}
              isLast={last}
            />
          );
        })}
      </ol>

      {/* Inline next-step hint, action-oriented */}
      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap text-xs">
        <NextActionHint d={d} state={state} />
        <SignatureCounter d={d} />
      </div>
    </section>
  );
}

function StepperCell({
  stage, cell, isLast,
}: { stage: Stage; cell: StageState; isLast: boolean }) {
  const Icon = stage.icon;
  const toneCfg = (() => {
    if (cell === 'current') return {
      bg: 'bg-[hsl(var(--kuja-clay))]',
      text: 'text-white',
      sub: 'text-white/85',
      iconColor: 'text-white',
      ring: 'ring-2 ring-[hsl(var(--kuja-clay))] ring-offset-1 ring-offset-card',
    };
    if (cell === 'past') return {
      bg: 'bg-[hsl(var(--kuja-grow))]/15',
      text: 'text-[hsl(var(--kuja-grow))]',
      sub: 'text-[hsl(var(--kuja-grow))]/80',
      iconColor: 'text-[hsl(var(--kuja-grow))]',
      ring: '',
    };
    if (cell === 'bad') return {
      bg: 'bg-destructive/15',
      text: 'text-destructive',
      sub: 'text-destructive/80',
      iconColor: 'text-destructive',
      ring: '',
    };
    return {
      bg: 'bg-muted/40',
      text: 'text-muted-foreground',
      sub: 'text-muted-foreground/70',
      iconColor: 'text-muted-foreground',
      ring: '',
    };
  })();

  return (
    <li className={`flex-1 min-w-[140px] relative ${cell === 'current' ? 'z-10' : ''}`}>
      <div className={`${toneCfg.bg} ${toneCfg.ring} px-3 py-2 ${isLast ? 'rounded-r-md' : ''}`}
           style={isLast ? undefined : { clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)' }}>
        <div className={`flex items-center gap-1.5 ${toneCfg.text}`}>
          <Icon className={`w-3.5 h-3.5 ${toneCfg.iconColor}`} />
          <span className="text-[11px] font-semibold uppercase tracking-wide truncate">{stage.label}</span>
        </div>
        <div className={`text-[10px] mt-0.5 ${toneCfg.sub} truncate`}>{stage.sub}</div>
      </div>
    </li>
  );
}

function NextActionHint({ d, state }: { d: EmergencyDeclaration; state: Record<StageId, StageState> }) {
  // Find the current stage and explain what the OB should do next
  const current = (Object.keys(state) as StageId[]).find((k) => state[k] === 'current');
  if (!current) return <div className="text-muted-foreground italic">No active step.</div>;

  const sigCount = d.signatures?.length ?? 0;
  const slotsFull = sigCount >= d.required_signer_count;

  // Committee stage has two micro-states: slots empty/partial → add members,
  // slots full → submit for signature. Don't conflate them.
  const committeeMsg = slotsFull
    ? 'All committee slots are filled. Click Submit for signature to start the multi-sig flow.'
    : `Add ${d.required_signer_count - sigCount} more Oversight Body member${d.required_signer_count - sigCount === 1 ? '' : 's'} below, then submit for signature.`;

  const messages: Record<StageId, string> = {
    draft: 'Add committee members (Oversight Body signers), then submit for signature.',
    committee: committeeMsg,
    in_review: `${d.signed_count} of ${d.required_signer_count} signers have signed. Awaiting the remaining OB members.`,
    active: 'Declaration is active. Review auto-created grant drafts, then click Release applications.',
    released: 'Applications open to shortlisted NGOs. Awaiting submissions and OB award decisions.',
    closed: 'All grants under this declaration are complete. The declaration is closed.',
  };

  return (
    <div className="text-muted-foreground">
      <span className="text-foreground font-medium">Next: </span>
      {messages[current]}
    </div>
  );
}

function SignatureCounter({ d }: { d: EmergencyDeclaration }) {
  if (d.required_signer_count === 0) return null;
  const pct = Math.min(100, Math.round(100 * d.signed_count / d.required_signer_count));
  return (
    <div className="inline-flex items-center gap-2 text-muted-foreground">
      <span>
        <span className="text-foreground font-semibold">{d.signed_count}</span> / {d.required_signer_count} signed
        {d.recused_count > 0 && <> · {d.recused_count} recused</>}
        {d.rejected_count > 0 && <> · {d.rejected_count} rejected</>}
      </span>
      <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-[hsl(var(--kuja-grow))] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function computeState(d: EmergencyDeclaration): Record<StageId, StageState> {
  const sigCount = (d.signatures?.length ?? 0);
  const cancelled = d.status === 'cancelled';
  const rejected = (d.rejected_count ?? 0) > 0;

  // Default: everything future
  const state: Record<StageId, StageState> = {
    draft: 'future',
    committee: 'future',
    in_review: 'future',
    active: 'future',
    released: 'future',
    closed: 'future',
  };

  if (d.status === 'closed') {
    state.draft = 'past';
    state.committee = 'past';
    state.in_review = 'past';
    state.active = 'past';
    state.released = 'past';
    state.closed = 'current';
    return state;
  }

  if (d.status === 'signed_active') {
    state.draft = 'past';
    state.committee = 'past';
    state.in_review = 'past';
    if (d.applicants_notified_at) {
      // Released to NGOs already
      state.active = 'past';
      state.released = 'current';
    } else {
      state.active = 'current';
    }
    return state;
  }

  if (d.status === 'in_review') {
    state.draft = 'past';
    state.committee = 'past';
    state.in_review = 'current';
    if (rejected) {
      // Show in_review as bad tone (auto-cancelled by rejection)
      state.in_review = 'bad';
    }
    return state;
  }

  if (cancelled) {
    // Mark the stage where cancellation landed as bad; everything before as past
    state.draft = 'past';
    if (sigCount >= d.required_signer_count) {
      state.committee = 'past';
      state.in_review = 'bad';
    } else if (sigCount > 0) {
      state.committee = 'bad';
    } else {
      state.draft = 'bad';
    }
    return state;
  }

  // d.status === 'draft'
  if (sigCount === 0) {
    state.draft = 'past';
    state.committee = 'current';
  } else if (sigCount < d.required_signer_count) {
    state.draft = 'past';
    state.committee = 'current';
  } else {
    state.draft = 'past';
    state.committee = 'past';
    state.in_review = 'current'; // ready to submit
  }
  return state;
}
