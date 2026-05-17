'use client';

/**
 * /reports/[id] — Phase 26A (May 2026).
 *
 * Focused detail view for a single report: title, status, due/submitted
 * dates, content snapshot, AI analysis summary if present, attachments
 * count, plus a per-scope <AIChatPanel> so the user can ask Kuja about
 * THIS report ("what evidence is missing?", "rephrase the activities
 * section", etc.).
 *
 * Intentionally lightweight — heavy editing happens on the /reports
 * list page; this is a deep-link surface for messaging, audit, and chat.
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, FileText, Calendar, CheckCircle2, Loader2,
  AlertTriangle, Paperclip,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { AIChatPanel } from '@/components/copilot/ai-chat-panel';
import { MicroSurvey } from '@/components/shared/micro-survey';

interface ReportDetail {
  id: number;
  grant_id: number;
  grant_title?: string | null;
  title?: string | null;
  status?: string;
  report_type?: string | null;
  reporting_period?: string | null;
  due_date?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  reviewer_notes?: string | null;
  content?: Record<string, unknown> | null;
  attachments?: unknown[];
  ai_analysis?: { compliance_score?: number; summary?: string } | null;
  org_name?: string | null;
}

interface Resp {
  report?: ReportDetail;
  error?: string;
}

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return d;
  }
}

function statusTone(status?: string): string {
  switch (status) {
    case 'accepted':
      return 'text-[hsl(var(--kuja-grow))] border-[hsl(var(--kuja-grow))]';
    case 'submitted':
    case 'under_review':
      return 'text-[hsl(var(--kuja-clay))] border-[hsl(var(--kuja-clay))]';
    case 'revision_requested':
      return 'text-[hsl(var(--kuja-flag))] border-[hsl(var(--kuja-flag))]';
    default:
      return 'text-muted-foreground';
  }
}

export default function ReportDetailClient() {
  const params = useParams();
  const router = useRouter();
  const [id, setId] = useState<number | null>(() => {
    if (typeof window !== 'undefined') {
      const m = window.location.pathname.match(/\/reports\/(\d+)/);
      if (m && m[1] !== '0') return Number(m[1]);
    }
    const fromParams = Number(params.id);
    return Number.isFinite(fromParams) && fromParams > 0 ? fromParams : null;
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const m = window.location.pathname.match(/\/reports\/(\d+)/);
    if (m && m[1] !== '0') {
      const n = Number(m[1]);
      if (n !== id) setId(n);
    }
  }, [params.id, id]);

  const [data, setData] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    api.get<Resp>(`/api/reports/${id}`)
      .then((r) => {
        if (cancelled) return;
        if (r.report) setData(r.report);
        else setErr(r.error ?? 'Report not found');
      })
      .catch(() => { if (!cancelled) setErr('Could not load report'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  if (id == null || loading) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading report…
        </div>
      </div>
    );
  }

  if (err || !data) {
    return (
      <Card className="p-6 max-w-lg mx-auto mt-12 border-[hsl(var(--kuja-flag)/0.3)]">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-[hsl(var(--kuja-flag))] mt-0.5" />
          <div>
            <div className="text-sm font-semibold">{err ?? 'Report not found'}</div>
            <button
              type="button"
              onClick={() => router.push('/reports')}
              className="mt-3 inline-flex items-center gap-1.5 text-sm underline"
            >
              <ArrowLeft className="h-4 w-4" /> Back to reports
            </button>
          </div>
        </div>
      </Card>
    );
  }

  const compliance = data.ai_analysis?.compliance_score;
  const attachmentsCount = Array.isArray(data.attachments) ? data.attachments.length : 0;

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <button
        type="button"
        onClick={() => router.push('/reports')}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to reports
      </button>

      <Card className="p-5 sm:p-6">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="p-2 rounded-md bg-[hsl(var(--kuja-sand))]/40">
            <FileText className="h-7 w-7 text-[hsl(var(--kuja-clay))]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="kuja-display text-2xl sm:text-3xl">
                {data.title || data.reporting_period || `Report #${data.id}`}
              </h1>
              <Badge variant="outline" className={`text-[10px] ${statusTone(data.status)}`}>
                {(data.status ?? 'draft').replace(/_/g, ' ')}
              </Badge>
              {compliance != null && (
                <Badge variant="outline" className="text-[10px]">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> AI compliance {compliance}/100
                </Badge>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {data.grant_title && (
                <span>Grant: <strong>{data.grant_title}</strong></span>
              )}
              {data.reporting_period && (
                <span>Period: {data.reporting_period}</span>
              )}
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Due {fmtDate(data.due_date)}
              </span>
              {data.submitted_at && (
                <span>Submitted {fmtDate(data.submitted_at)}</span>
              )}
              {attachmentsCount > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Paperclip className="h-3 w-3" /> {attachmentsCount} attachment{attachmentsCount === 1 ? '' : 's'}
                </span>
              )}
            </div>
            {data.reviewer_notes && (
              <p className="mt-3 text-sm leading-relaxed border-l-2 border-[hsl(var(--kuja-clay))] pl-3">
                <strong>Reviewer notes:</strong> {data.reviewer_notes}
              </p>
            )}
          </div>
        </div>
      </Card>

      {data.ai_analysis?.summary && (
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide font-semibold text-[hsl(var(--kuja-clay))] mb-1">
            AI analysis
          </div>
          <p className="text-sm whitespace-pre-wrap">{data.ai_analysis.summary}</p>
        </Card>
      )}

      {/* Phase 26A — scoped AI chat: ask Kuja about THIS report. */}
      <AIChatPanel scope={{ kind: 'report', id: data.id }} />

      {/* Phase 31B — micro-survey on submitted reports. */}
      {data.status && data.status !== 'draft' && (
        <MicroSurvey
          surface="report_submit"
          relatedKind="report"
          relatedId={data.id}
          question="How helpful was Kuja in preparing this report?"
        />
      )}
    </div>
  );
}
