'use client';

/**
 * /reports/[id] — Phase 53 retrofit (June 2026).
 *
 * Per docs/DESIGN_PRINCIPLES.md:
 *   Top: due date · status · score / readiness · next action
 *   Then: report sections · attachments · follow-ups
 *   Below: history (in collapsibles)
 *
 * Previously a single-card surface that buried the next action inside
 * the header. Now leads with an attention strip whose item is computed
 * from the report's status (so the user always knows what to do next),
 * and tucks AI chat / survey into PageDetail collapsibles so they're
 * supporting, not dominant.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  FileText, Calendar, CheckCircle2, Loader2, AlertTriangle,
  Paperclip, Sparkles, MessageCircle,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { AIChatPanel } from '@/components/copilot/ai-chat-panel';
import { MicroSurvey } from '@/components/shared/micro-survey';
import {
  PageShell, PageBack, PageHeader, PageAttention, PageMain,
  PageDetail, PageDetailSection, type AttentionItem,
} from '@/components/layout/page-shell';
import { describeReportStatus, TONE_PILL_CLASS } from '@/lib/status-copy';
import { WhyRejectedPanel } from '@/components/shared/why-rejected-panel';

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

function daysUntil(iso?: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / (1000 * 60 * 60 * 24));
}

/** Compute the attention strip from the report's state. */
function buildAttention(r: ReportDetail): AttentionItem[] {
  const items: AttentionItem[] = [];
  const days = daysUntil(r.due_date);
  const status = r.status ?? 'draft';

  if (status === 'revision_requested') {
    items.push({
      tone: 'bad',
      label: 'Revisions requested',
      hint: r.reviewer_notes
        ? `Reviewer note: ${r.reviewer_notes}`
        : 'Open the report below to see what to change, then resubmit.',
    });
  } else if (status === 'draft') {
    if (days !== null && days < 0) {
      items.push({
        tone: 'bad',
        label: `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`,
        hint: 'Continue drafting and submit as soon as you can.',
      });
    } else if (days !== null && days <= 7) {
      items.push({
        tone: 'warn',
        label: days === 0 ? 'Due today' : `Due in ${days} day${days === 1 ? '' : 's'}`,
        hint: 'Continue drafting and submit before the deadline.',
      });
    } else {
      items.push({
        tone: 'accent',
        label: 'Continue drafting',
        hint: 'Pick up where you left off — submit when ready.',
      });
    }
  } else if (status === 'submitted' || status === 'under_review' || status === 'in_review') {
    items.push({
      tone: 'info',
      label: 'Submitted — awaiting reviewer decision',
      hint: r.submitted_at ? `Submitted ${fmtDate(r.submitted_at)}.` : undefined,
    });
  } else if (status === 'accepted' || status === 'approved') {
    items.push({
      tone: 'good',
      label: 'Accepted',
      hint: r.reviewed_at ? `Reviewed ${fmtDate(r.reviewed_at)}.` : undefined,
    });
  } else if (status === 'rejected') {
    items.push({
      tone: 'bad',
      label: 'Rejected',
      hint: r.reviewer_notes ?? 'Open the reviewer feedback below to see why.',
    });
  }
  return items;
}

export default function ReportDetailClient() {
  const params = useParams();
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
            <PageBack href="/reports" label="Back to reports" />
          </div>
        </div>
      </Card>
    );
  }

  const status = data.status ?? 'draft';
  const compliance = data.ai_analysis?.compliance_score;
  const attachmentsCount = Array.isArray(data.attachments) ? data.attachments.length : 0;
  const statusPill = describeReportStatus(status);
  const attention = buildAttention(data);
  const title = data.title || data.reporting_period || `Report #${data.id}`;

  return (
    <div className="max-w-4xl mx-auto">
      <PageShell>
        <PageBack href="/reports" label="Back to reports" />

        <PageHeader
          title={title}
          icon={FileText}
          status={statusPill}
          meta={[
            ...(data.grant_title    ? [{ label: `Grant: ${data.grant_title}` }] : []),
            ...(data.reporting_period ? [{ label: `Period: ${data.reporting_period}` }] : []),
            { label: `Due ${fmtDate(data.due_date)}`, icon: Calendar },
            ...(data.submitted_at   ? [{ label: `Submitted ${fmtDate(data.submitted_at)}` }] : []),
            ...(attachmentsCount > 0
              ? [{ label: `${attachmentsCount} attachment${attachmentsCount === 1 ? '' : 's'}`, icon: Paperclip }]
              : []),
            ...(compliance != null
              ? [{ label: `AI compliance ${compliance}/100`, icon: CheckCircle2 }]
              : []),
          ]}
        />

        <PageAttention items={attention} />

        <PageMain>
          {/* Phase 76 — Why-rejected, constructively. Only when the
              report is rejected or revision-requested. Lazy-loaded AI. */}
          {['rejected', 'revision_requested'].includes(status) && (
            <WhyRejectedPanel kind="report" entityId={data.id} />
          )}

          {/* Reviewer notes surfaced prominently when present and the
              attention strip didn't already lead with them. */}
          {data.reviewer_notes && status !== 'revision_requested' && status !== 'rejected' && (
            <section className="border border-border rounded-lg bg-card p-5">
              <h2 className="font-semibold text-sm mb-2">Reviewer notes</h2>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {data.reviewer_notes}
              </p>
            </section>
          )}

          {data.ai_analysis?.summary && (
            <section className="border border-border rounded-lg bg-card p-5">
              <h2 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[hsl(var(--kuja-spark))]" />
                AI analysis
              </h2>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {data.ai_analysis.summary}
              </p>
            </section>
          )}

          {/* Status pill duplicated inline for quick scan even when meta
              overflows. Uses the same TONE_PILL_CLASS so visuals match. */}
          <div className="text-xs text-muted-foreground">
            Status:{' '}
            <span className={`px-2 py-0.5 rounded-full font-semibold ${TONE_PILL_CLASS[statusPill.tone]}`}>
              {statusPill.label}
            </span>
          </div>
        </PageMain>

        {/* Supporting detail — collapsibles for AI chat + micro-survey */}
        <PageDetail>
          <PageDetailSection
            title="Ask Kuja about this report"
            icon={Sparkles}
            defaultOpen={false}
          >
            <AIChatPanel scope={{ kind: 'report', id: data.id }} />
          </PageDetailSection>

          {status !== 'draft' && (
            <PageDetailSection
              title="Was Kuja helpful here?"
              icon={MessageCircle}
              defaultOpen={false}
            >
              <MicroSurvey
                surface="report_submit"
                relatedKind="report"
                relatedId={data.id}
                question="How helpful was Kuja in preparing this report?"
              />
            </PageDetailSection>
          )}
        </PageDetail>
      </PageShell>
    </div>
  );
}
