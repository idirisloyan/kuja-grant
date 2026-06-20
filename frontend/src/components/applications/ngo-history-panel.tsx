'use client';

/**
 * Phase 188 — Donor view: past applications from the applying NGO.
 *
 * Helps the donor see whether this NGO has applied before, how those
 * went, and surfaces basic relationship context. Self-gates when
 * there's no history.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { History, ArrowRight, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface HistoryItem {
  id: number;
  grant_id: number | null;
  grant_title: string | null;
  status: string;
  ai_score: number | null;
  human_score: number | null;
  submitted_at: string | null;
}

interface Resp {
  applications: HistoryItem[];
  summary: {
    total: number;
    awarded: number;
    rejected: number;
    in_progress: number;
  };
}

function statusTone(status: string): string {
  if (status === 'awarded') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'rejected' || status === 'declined') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (status === 'submitted' || status === 'under_review') return 'bg-amber-50 text-amber-700 border-amber-200';
  return '';
}

export function NgoHistoryPanel({ applicationId }: { applicationId: number }) {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>(`/api/applications/${applicationId}/ngo-history`).then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */}).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [applicationId]);

  if (loading) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin inline mr-1.5" />
        Loading past applications…
      </Card>
    );
  }
  if (!data || data.applications.length === 0) {
    return null;
  }

  return (
    <Card className="p-4 space-y-3">
      <header className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold inline-flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-sky-600" />
            Past applications from this NGO
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {data.summary.awarded} awarded · {data.summary.rejected} not awarded · {data.summary.in_progress} in progress
          </p>
        </div>
      </header>
      <ul className="space-y-1.5">
        {data.applications.slice(0, 8).map((a) => (
          <li key={a.id}>
            <Link
              href={`/applications/${a.id}`}
              className="flex items-center justify-between gap-2 rounded-md border border-border p-2 hover:bg-muted/40"
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate">
                  {a.grant_title ?? `Application #${a.id}`}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {a.submitted_at && new Date(a.submitted_at).toLocaleDateString()}
                  {(a.human_score ?? a.ai_score) != null && (
                    <> · score {Math.round(a.human_score ?? a.ai_score ?? 0)}</>
                  )}
                </div>
              </div>
              <Badge variant="outline" className={`text-[10px] shrink-0 ${statusTone(a.status)}`}>
                {a.status}
              </Badge>
              <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
