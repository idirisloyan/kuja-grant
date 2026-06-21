'use client';

/**
 * Phase 297 — NGO pre-submit FAQ: top 3 decline reasons across this
 * grant's donor's history. A quiet "things they look for" hint. Self-
 * gates when no signal (sample_size < 5).
 */

import { useEffect, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { api } from '@/lib/api';

interface Item {
  code: string;
  label: string;
  count: number;
}

interface Resp {
  top_reasons: Item[];
  sample_size: number;
}

export function CommonDeclineReasonsCard({ applicationId }: { applicationId: number | null }) {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    if (!applicationId) return;
    const state = { cancelled: false };
    api.get<Resp>(`/api/applications/${applicationId}/common-decline-reasons`).then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); });
    return () => { state.cancelled = true; };
  }, [applicationId]);

  if (!data || data.sample_size < 5 || data.top_reasons.length === 0) return null;

  return (
    <div className="rounded-md border border-border bg-card p-3 text-sm space-y-1">
      <p className="text-xs font-semibold text-foreground inline-flex items-center gap-1.5">
        <Lightbulb className="w-3.5 h-3.5 text-[hsl(var(--kuja-sun))]" />
        Common reasons this donor declines
      </p>
      <ul className="text-xs text-muted-foreground space-y-0.5 ml-5 list-disc">
        {data.top_reasons.map((r) => (
          <li key={r.code}>{r.label}</li>
        ))}
      </ul>
      <p className="text-[10px] text-muted-foreground italic pt-1">
        From {data.sample_size} past declines. Not a guarantee — just a hint.
      </p>
    </div>
  );
}
