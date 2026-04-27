'use client';

/**
 * InfoTip — small accessible info icon that reveals a short explanation on
 * hover/focus. Used to demystify grant-system jargon for first-time NGO
 * users (capacity assessment, readiness score, rubric, eligibility, etc.).
 *
 * Renders the explanation as an HTML `title` attribute on hover for the
 * mouse path, plus a tap-to-toggle popover for touch devices. Keyboard
 * users can focus the icon and read the same text via the popover.
 */

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  /** Plain text or short JSX explanation. Keep it under 2-3 sentences. */
  children: ReactNode;
  /** Optional accessible label for the trigger. */
  label?: string;
  className?: string;
  /** Tone for the popover. Defaults to neutral. */
  tone?: 'neutral' | 'info';
}

export function InfoTip({ children, label, className, tone = 'neutral' }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const popCls = tone === 'info'
    ? 'bg-[hsl(var(--kuja-spark-soft))] border-[hsl(var(--kuja-spark-soft))] text-[hsl(var(--kuja-ink))]'
    : 'bg-popover border-border text-popover-foreground';

  return (
    <span className={cn('relative inline-flex items-center', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label ?? 'More info'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-[hsl(var(--kuja-clay))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-clay))]"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span
          role="tooltip"
          className={cn(
            'absolute z-50 top-full mt-1.5 left-0 w-64 rounded-md border px-3 py-2 text-xs leading-relaxed shadow-md',
            popCls,
          )}
          // Keep open while hovering the popover itself
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          {children}
        </span>
      )}
    </span>
  );
}
