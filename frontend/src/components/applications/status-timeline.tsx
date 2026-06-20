'use client';

/**
 * Phase 237 — Application status timeline.
 *
 * Reads /api/audit-chain/recent?subject_kind=application&subject_id=X
 * and renders the action stream in chronological order (oldest
 * first). Hidden when no entries.
 */

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface AuditRow {
  id: number;
  action: string;
  actor_email?: string | null;
  created_at?: string | null;
  details?: Record<string, unknown> | null;
}

interface Resp {
  entries: AuditRow[];
}

const ACTION_LABEL: Record<string, string> = {
  'application.created': 'Created',
  'application.submitted': 'Submitted',
  'application.revision_requested': 'Revision requested',
  'application.resubmitted': 'Resubmitted',
  'application.withdrawn': 'Withdrawn',
  'application.document_requested': 'Document requested',
  'application.star_toggled': 'Shortlist toggled',
  'application.bulk_star_toggled': 'Shortlist toggled (bulk)',
  'review.created': 'Reviewer assigned',
  'review.completed': 'Review completed',
  'review.declined': 'Reviewer declined',
  'grant.withdrawn': 'Grant withdrawn',
  'application.decision.recorded': 'Decision recorded',
};

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
}

export function StatusTimeline({ applicationId }: { applicationId: number }) {
  const [rows, setRows] = useState<AuditRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>(`/api/audit-chain/recent?subject_kind=application&subject_id=${applicationId}&limit=50`).then((r) => {
      if (cancelled) return;
      const list = Array.isArray(r?.entries) ? r.entries : [];
      list.sort((a, b) => {
        const ta = a.created_at ? Date.parse(a.created_at) : 0;
        const tb = b.created_at ? Date.parse(b.created_at) : 0;
        return ta - tb;
      });
      setRows(list);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, [applicationId]);

  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Clock className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Status timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start gap-3 text-sm">
              <span className="mt-1 w-2 h-2 rounded-full bg-[hsl(var(--kuja-clay))] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium">{ACTION_LABEL[r.action] ?? r.action}</div>
                <div className="text-xs text-muted-foreground">
                  {formatWhen(r.created_at)}
                  {r.actor_email ? <> · {r.actor_email}</> : null}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
