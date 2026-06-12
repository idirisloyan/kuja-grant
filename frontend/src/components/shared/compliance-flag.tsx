'use client';

/**
 * Phase 85 — Plain-language compliance flag.
 *
 * The team's review: every compliance issue should explain
 *   - what is needed
 *   - why it matters
 *   - an acceptable example
 *   - how to resolve it
 *
 * This is the universal renderer for that schema. Any compliance check
 * (Trust Profile gap, report pre-check finding, application eligibility
 * miss) wraps its issue text in a <ComplianceFlag> and the NGO gets
 * the same 4-part explainer everywhere.
 *
 * Headline + tone shown by default. Click expands the four-section
 * explainer. Renders gracefully when only the headline is supplied
 * (legacy paths) — the explainer just doesn't show.
 */

import { useState, type ReactNode } from 'react';
import {
  AlertTriangle, AlertCircle, Info, CheckCircle2, ChevronDown, ChevronUp,
  HelpCircle, Lightbulb, Wrench,
} from 'lucide-react';

export type ComplianceTone = 'bad' | 'warn' | 'info' | 'good';

export interface ComplianceExplain {
  /** What is needed — the plain-language statement of the requirement */
  what?: string;
  /** Why it matters — the donor / regulator / network reason */
  why?: string;
  /** An acceptable example — concrete and copy-pasteable */
  example?: string;
  /** How to resolve — step-by-step instructions */
  how?: string;
}

interface Props {
  /** Short tone-coded label, e.g. "Audited financials missing" */
  headline: string;
  /** Tone — drives icon + color treatment */
  tone?: ComplianceTone;
  /** Optional structured explainer. If omitted, only the headline shows. */
  explain?: ComplianceExplain;
  /** Optional CTA button on the right of the headline */
  action?: ReactNode;
  className?: string;
}

const TONE_STYLES: Record<ComplianceTone, { wrap: string; icon: typeof AlertTriangle; iconColor: string }> = {
  bad:  { wrap: 'border-destructive/30 bg-destructive/5',
          icon: AlertTriangle, iconColor: 'text-destructive' },
  warn: { wrap: 'border-[hsl(var(--kuja-sun))]/30 bg-[hsl(var(--kuja-sun))]/5',
          icon: AlertCircle,   iconColor: 'text-[hsl(var(--kuja-sun))]' },
  info: { wrap: 'border-[hsl(var(--kuja-spark))]/30 bg-[hsl(var(--kuja-spark))]/5',
          icon: Info,          iconColor: 'text-[hsl(var(--kuja-spark))]' },
  good: { wrap: 'border-[hsl(var(--kuja-grow))]/30 bg-[hsl(var(--kuja-grow))]/5',
          icon: CheckCircle2,  iconColor: 'text-[hsl(var(--kuja-grow))]' },
};

export function ComplianceFlag({
  headline, tone = 'warn', explain, action, className = '',
}: Props) {
  const [open, setOpen] = useState(false);
  const T = TONE_STYLES[tone];
  const Icon = T.icon;
  const hasExplain = !!explain && Object.values(explain).some((v) => v && v.trim());

  return (
    <section className={`border rounded-md ${T.wrap} ${className}`}>
      <div className="flex items-start gap-3 p-3">
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${T.iconColor}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-semibold leading-tight">{headline}</h4>
            {action && <div className="shrink-0">{action}</div>}
          </div>
          {hasExplain && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="mt-1 text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              {open
                ? <>Hide explanation <ChevronUp className="w-3 h-3" /></>
                : <>What is this and how do I fix it? <ChevronDown className="w-3 h-3" /></>}
            </button>
          )}
        </div>
      </div>

      {hasExplain && open && (
        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border/30">
          {explain!.what && (
            <ExplainSection icon={HelpCircle} label="What is needed">
              {explain!.what}
            </ExplainSection>
          )}
          {explain!.why && (
            <ExplainSection icon={Info} label="Why it matters">
              {explain!.why}
            </ExplainSection>
          )}
          {explain!.example && (
            <ExplainSection icon={Lightbulb} label="An acceptable example" mono>
              {explain!.example}
            </ExplainSection>
          )}
          {explain!.how && (
            <ExplainSection icon={Wrench} label="How to resolve">
              {explain!.how}
            </ExplainSection>
          )}
        </div>
      )}
    </section>
  );
}

function ExplainSection({
  icon: Icon, label, children, mono = false,
}: {
  icon: typeof HelpCircle;
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="text-xs">
      <div className="flex items-center gap-1.5 mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className={`leading-relaxed text-foreground/90 pl-4 ${mono ? 'font-mono text-[11px] bg-muted/50 rounded px-2 py-1.5 whitespace-pre-wrap' : ''}`}>
        {children}
      </div>
    </div>
  );
}
