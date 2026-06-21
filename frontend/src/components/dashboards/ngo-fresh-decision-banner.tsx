'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  fresh: {
    application_id: number;
    status: string;
    decision_recorded_at: string | null;
    grant_title: string | null;
  } | null;
}

const STATUS_LABEL: Record<string, string> = {
  funded: 'Funded',
  awarded: 'Awarded',
  declined: 'Declined',
  rejected: 'Rejected',
};

export function NgoFreshDecisionBanner() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/ngo-fresh-decision').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || !data.fresh) return null;
  const f = data.fresh;
  const isWin = f.status === 'funded' || f.status === 'awarded';

  return (
    <Link
      href={`/applications/${f.application_id}`}
      className={`block rounded-lg border p-4 hover:shadow-sm transition ${
        isWin ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'
      }`}
    >
      <div className="flex items-center gap-3">
        <Sparkles className={`w-5 h-5 ${isWin ? 'text-emerald-700' : 'text-amber-700'}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            Your decision is in: {STATUS_LABEL[f.status] || f.status}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {f.grant_title || `Application #${f.application_id}`} · view details
          </p>
        </div>
      </div>
    </Link>
  );
}
