'use client';

/**
 * Phase 86 — Inline concept helper.
 *
 * The team's review: "A cleaner page can still ask users to understand
 * difficult concepts such as assessment frameworks, due diligence,
 * compliance states, grant windows, and reporting evidence."
 *
 * This is the fix. Anywhere we use a domain term that a non-technical
 * NGO doesn't know in advance, wrap it in <ConceptHelper conceptKey="..."
 * label="..."/> — the term renders with a small dotted underline; click
 * pops a 1-paragraph plain-language explainer with optional "Learn more"
 * deep-link.
 *
 * Critical: this is NOT a tooltip. Tooltips assume the user already knows
 * the concept exists and just needs a refresher. ConceptHelper assumes
 * the user has never seen the term before. The popover stays open until
 * dismissed, supports long-form copy, and includes a "What this is and
 * why it matters" structure consistent with ComplianceFlag.
 *
 * Used inline in regular sentences:
 *   This grant is in its <ConceptHelper conceptKey="grant_window"/> phase.
 */

import { useState, useRef, useEffect } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { CONCEPTS, type ConceptKey } from '@/lib/concepts';

interface Props {
  conceptKey: ConceptKey;
  /** Override the canonical label for this surface (e.g. plural form) */
  label?: string;
  className?: string;
}

export function ConceptHelper({ conceptKey, label, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const concept = CONCEPTS[conceptKey];
  if (!concept) return <span>{label || conceptKey}</span>;
  const display = label || concept.label;

  return (
    <span ref={ref} className={`relative inline ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-0.5 font-medium border-b border-dashed border-[hsl(var(--kuja-spark))]/60 text-foreground hover:text-[hsl(var(--kuja-spark))]"
      >
        {display}
        <HelpCircle className="w-3 h-3 text-[hsl(var(--kuja-spark))] opacity-70" />
      </button>
      {open && (
        <span
          role="dialog"
          className="absolute z-50 left-0 top-full mt-1 w-80 max-w-[calc(100vw-2rem)] border border-border bg-card rounded-md shadow-lg p-3 text-xs leading-relaxed text-foreground"
        >
          <span className="flex items-start justify-between gap-2 mb-2">
            <strong className="text-sm">{concept.label}</strong>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
          <span className="block whitespace-pre-wrap">{concept.short}</span>
          {concept.example && (
            <span className="block mt-2 text-muted-foreground italic">
              <strong className="not-italic text-foreground/70">Example:</strong> {concept.example}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
