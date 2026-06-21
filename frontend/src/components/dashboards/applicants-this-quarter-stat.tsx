'use client';

import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  applicants: number;
  quarter_start: string;
}

export function ApplicantsThisQuarterStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/donor-applicants-this-quarter').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.applicants === 0) return null;
  const qStart = new Date(data.quarter_start).toLocaleDateString();

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <Users className="w-3 h-3 text-sky-600" />
        This quarter (from {qStart})
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{data.applicants}</span> distinct applicant
        {data.applicants === 1 ? '' : 's'}
      </span>
    </div>
  );
}
