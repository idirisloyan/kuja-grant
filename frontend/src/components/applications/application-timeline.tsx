'use client';

/**
 * ApplicationTimeline — Phase 20A (May 2026).
 *
 * Renders the unified timeline of every action on an application. One
 * surface to answer "where is this application?" instead of cross-
 * referencing the status badge + reviews tab + audit chain + comments.
 *
 * Visible to anyone the application is visible to (server-side gate).
 */

import { useEffect, useState } from 'react';
import {
  Edit3, Send, UserPlus, CheckCircle2, Award, XCircle,
  Download, FileCheck2, MessageSquare, Activity, Clipboard,
  Loader2,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface TimelineEvent {
  kind: string;
  occurred_at: string | null;
  actor_email?: string | null;
  actor_name?: string | null;
  title: string;
  detail?: string | null;
  icon_hint?: string;
}

interface TimelineResp {
  success: boolean;
  reason?: string;
  events: TimelineEvent[];
  event_count: number;
  current_status?: string;
}

const ICON_MAP: Record<string, typeof Edit3> = {
  edit:           Edit3,
  send:           Send,
  'user-plus':    UserPlus,
  'check-circle': CheckCircle2,
  award:          Award,
  x:              XCircle,
  download:       Download,
  'file-check':   FileCheck2,
  'message-square': MessageSquare,
  clipboard:      Clipboard,
  activity:       Activity,
};

const KIND_TONE: Record<string, string> = {
  'app.created':        'text-[hsl(var(--kuja-ink-soft))]',
  'app.submitted':      'text-[hsl(var(--kuja-clay))]',
  'app.awarded':        'text-[hsl(var(--kuja-grow))]',
  'app.rejected':       'text-[hsl(var(--kuja-flag))]',
  'review.assigned':    'text-[hsl(var(--kuja-clay))]',
  'review.completed':   'text-[hsl(var(--kuja-grow))]',
  'comment.posted':     'text-[hsl(var(--kuja-ink-soft))]',
};

function fmtWhen(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso.slice(0, 16).replace('T', ' '); }
}

interface Props {
  applicationId: number;
}

export function ApplicationTimeline({ applicationId }: Props) {
  const [data, setData] = useState<TimelineResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!applicationId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.get<TimelineResp>(`/api/applications/${applicationId}/timeline`)
      .then((r) => { if (!cancelled) setData(r); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [applicationId]);

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading timeline…
        </div>
      </Card>
    );
  }
  if (error || !data?.success) {
    return (
      <Card className="p-4 border-[hsl(var(--kuja-flag)/0.3)]">
        <p className="text-xs text-[hsl(var(--kuja-flag))]">
          {error || data?.reason || 'Could not load timeline'}
        </p>
      </Card>
    );
  }

  if (data.events.length === 0) {
    return (
      <Card className="p-4">
        <p className="text-xs text-muted-foreground italic">
          No activity recorded yet. Events will appear here as the application progresses.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">
            Application activity
          </div>
          <h3 className="kuja-display text-lg">Everything that&apos;s happened</h3>
        </div>
        <Badge variant="outline" className="text-[10px] tabular-nums">
          {data.event_count} event{data.event_count === 1 ? '' : 's'}
        </Badge>
      </div>

      <ol className="relative space-y-3 border-l border-dashed border-[hsl(var(--border))] pl-4">
        {data.events.map((e, i) => {
          const Icon = ICON_MAP[e.icon_hint ?? 'activity'] ?? Activity;
          const tone = KIND_TONE[e.kind] ?? 'text-[hsl(var(--kuja-ink-soft))]';
          return (
            <li key={i} className="relative">
              <span
                className={cn(
                  'absolute -left-[1.55rem] top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-background',
                  tone,
                )}
                aria-hidden="true"
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                <span className="font-medium">{e.title}</span>
                <span className="text-xs text-muted-foreground">
                  {fmtWhen(e.occurred_at)}
                </span>
                {e.actor_name && (
                  <span className="text-[10px] text-muted-foreground">
                    by {e.actor_name}
                  </span>
                )}
              </div>
              {e.detail && (
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{e.detail}</p>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
