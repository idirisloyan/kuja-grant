'use client';

/**
 * Typed-phrase confirmation modal for irreversible actions.
 * The user must type a specific phrase (e.g., the grant reference) to
 * enable the confirm button. Pattern matches Stripe/GitHub's destructive
 * confirmation flow.
 */

import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  title: string;
  body: string;
  phrase: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function TypedConfirm({
  open, title, body, phrase, destructive = false, onConfirm, onCancel,
}: Props) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue('');
      setBusy(false);
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!open) return null;

  const matches = value.trim() === phrase;

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1400] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-md rounded-xl bg-background shadow-2xl border border-border overflow-hidden">
        <div className={cn(
          'p-5 border-b border-border',
          destructive && 'border-b-4 border-[hsl(var(--kuja-flag))]',
        )}>
          <div className="flex items-start gap-3">
            {destructive
              ? <AlertTriangle className="h-5 w-5 text-[hsl(var(--kuja-flag))] flex-shrink-0 mt-0.5" />
              : <ShieldCheck className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />}
            <div className="flex-1 min-w-0">
              <h3 className="kuja-display text-lg">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{body}</p>
            </div>
          </div>
        </div>
        <div className="p-5 space-y-3">
          <label className="text-xs font-medium text-foreground block">
            Type <code className="font-mono bg-muted px-1.5 py-0.5 rounded">{phrase}</code> to confirm
          </label>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches && !busy) handleConfirm();
              if (e.key === 'Escape') onCancel();
            }}
            autoComplete="off"
            className="w-full h-9 px-3 text-sm rounded-md border border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-clay))]"
          />
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!matches || busy}
              className={cn(
                'px-3 py-1.5 text-sm font-medium text-white rounded-md transition-colors',
                destructive
                  ? 'bg-[hsl(var(--kuja-flag))] hover:bg-[hsl(0_74%_36%)]'
                  : 'bg-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay-dark))]',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              )}
            >
              {busy ? 'Working…' : destructive ? 'Confirm & apply' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
