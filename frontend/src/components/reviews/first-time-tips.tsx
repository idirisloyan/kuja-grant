'use client';

/**
 * Phase 321 — Reviewer first-time tip overlay.
 *
 * Shows 3 lightweight tips on the reviewer's first visit to the review-
 * detail page. Dismissable; persisted in localStorage so it never shows
 * again for that browser. No backend.
 */

import { useEffect, useState } from 'react';
import { Lightbulb, X } from 'lucide-react';

const STORAGE_KEY = 'kuja_reviewer_tips_dismissed';

export function ReviewerFirstTimeTips() {
  const [dismissed, setDismissed] = useState<boolean>(true);

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      setDismissed(v === '1');
    } catch {
      setDismissed(true);
    }
  }, []);

  if (dismissed) return null;

  function close() {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
    setDismissed(true);
  }

  return (
    <div className="rounded-md border border-[hsl(var(--kuja-clay))]/30 bg-[hsl(var(--kuja-sand-50))] p-3 text-sm space-y-2 relative">
      <button
        type="button"
        onClick={close}
        aria-label="Dismiss"
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      <p className="text-xs font-semibold text-[hsl(var(--kuja-clay))] inline-flex items-center gap-1.5">
        <Lightbulb className="w-3.5 h-3.5" />
        First time here? Three quick tips.
      </p>
      <ul className="text-xs space-y-1 ml-5 list-decimal">
        <li>Score each criterion against the rubric, not against other applications.</li>
        <li>Use the <span className="font-medium">Private notes</span> field for context only your team should see — the NGO will never read it.</li>
        <li>If you know the applicant org or the people behind it, click <span className="font-medium">Disclose conflict</span> at the top to recuse yourself before scoring.</li>
      </ul>
    </div>
  );
}
