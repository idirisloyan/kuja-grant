'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';

interface Resp {
  success: boolean;
  next: {
    review_id: number;
    application_id: number;
    status: string;
    grant_title: string | null;
    org_name: string | null;
    assigned_at: string | null;
  } | null;
}

function daysSince(iso: string | null) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

export function NextReviewCta() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/reviews/next-up').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || !data.next) return null;
  const n = data.next;
  const age = daysSince(n.assigned_at);

  return (
    <Card className="border-sky-200 bg-sky-50/40">
      <CardContent className="pt-4 pb-4 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">Next up</p>
          <p className="text-sm font-medium truncate">
            {n.grant_title || `Review #${n.review_id}`}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {n.org_name || 'Applicant'}
            {age != null ? ` · assigned ${age}d ago` : ''}
          </p>
        </div>
        <Link
          href={`/reviews/${n.review_id}`}
          className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 whitespace-nowrap"
        >
          Continue <ArrowRight className="w-4 h-4" />
        </Link>
      </CardContent>
    </Card>
  );
}
