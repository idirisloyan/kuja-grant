'use client';

import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight } from 'lucide-react';

const BANDS: Array<{ range: string; label: string; tone: string; note: string }> = [
  { range: '0–40', label: 'Weak', tone: 'text-rose-700', note: 'Misses the criterion or shows fundamental gaps.' },
  { range: '41–60', label: 'Developing', tone: 'text-amber-700', note: 'Partially addresses the criterion; needs improvement.' },
  { range: '61–80', label: 'Strong', tone: 'text-sky-700', note: 'Clearly meets the criterion with concrete evidence.' },
  { range: '81–100', label: 'Exceptional', tone: 'text-emerald-700', note: 'Exceeds expectations with depth, evidence, and clarity.' },
];

export function RubricScoringBands() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-border bg-card text-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/30"
      >
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <BookOpen className="w-4 h-4 text-sky-600" />
        <span className="font-medium">Scoring bands quick reference</span>
      </button>
      {open && (
        <ul className="divide-y border-t">
          {BANDS.map((b) => (
            <li key={b.range} className="px-3 py-2 flex items-start gap-3">
              <span className={`w-16 font-semibold tabular-nums ${b.tone}`}>{b.range}</span>
              <span className="w-24 text-xs uppercase tracking-wide text-muted-foreground">{b.label}</span>
              <span className="flex-1 text-xs text-muted-foreground">{b.note}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
