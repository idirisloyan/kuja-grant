'use client';

/**
 * Phase 358 — Reviewer keyboard shortcuts help dialog.
 *
 * Press ? on the review-detail page to open the cheat sheet.
 * Lists Phase 255 score-summary keyboard nav hotkeys + Phase 261 save
 * draft + Phase 327 snooze.
 */

import { useEffect, useState } from 'react';
import { Keyboard } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

interface Row {
  keys: string;
  label: string;
}

const ROWS: Row[] = [
  { keys: 'j / k', label: 'Move focus down / up between scoring rows' },
  { keys: '1–5', label: 'Set the focused row to that score band' },
  { keys: '?', label: 'Open or close this cheat sheet' },
  { keys: 'Esc', label: 'Close dialogs / cheat sheet' },
];

export function KeyboardHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        setOpen((p) => !p);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-2">
            <Keyboard className="w-4 h-4" />
            Keyboard shortcuts
          </DialogTitle>
        </DialogHeader>
        <ul className="space-y-1 text-sm">
          {ROWS.map((r) => (
            <li key={r.keys} className="flex items-baseline justify-between gap-3">
              <kbd className="font-mono text-xs px-1.5 py-0.5 rounded border border-border bg-muted">
                {r.keys}
              </kbd>
              <span className="text-muted-foreground text-right text-xs">{r.label}</span>
            </li>
          ))}
        </ul>
        <p className="text-[10px] text-muted-foreground pt-2 border-t border-border">
          Press <kbd className="font-mono px-1 rounded border border-border">?</kbd> any time on a review page to toggle this.
        </p>
      </DialogContent>
    </Dialog>
  );
}
