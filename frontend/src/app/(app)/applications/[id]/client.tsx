'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useApplication } from '@/lib/hooks/use-api';
import { StatusBadge } from '@/components/shared/status-badge';
import { ScoreRing } from '@/components/shared/score-ring';
import {
  ArrowLeft, FileText, Upload, BarChart3, MessageSquare,
  AlertCircle, CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Application } from '@/lib/types';

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

type TabId = 'responses' | 'documents' | 'scores' | 'reviews';
const TABS: { id: TabId; label: string }[] = [
  { id: 'responses', label: 'Responses' },
  { id: 'documents', label: 'Documents' },
  { id: 'scores', label: 'Scores' },
  { id: 'reviews', label: 'Reviews' },
];

export default function ApplicationDetailClient() {
  const params = useParams();
  const id = Number(params.id);
  const router = useRouter();
  const { data, isLoading } = useApplication(id || null);
  const [tab, setTab] = useState<TabId>('responses');
  const application = data?.application;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="kuja-shimmer h-8 w-64 rounded" />
        <div className="kuja-shimmer h-6 w-96 rounded" />
        <div className="kuja-shimmer h-10 rounded" />
        <div className="kuja-shimmer h-64 rounded-xl" />
      </div>
    );
  }

  if (!application) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-background px-6 py-14 text-center">
        <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
        <p className="kuja-display text-xl">Application not found</p>
        <button
          type="button"
          onClick={() => router.push('/applications')}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border hover:border-[hsl(var(--kuja-clay))] text-sm font-medium px-4 py-2"
        >
          <ArrowLeft className="h-4 w-4" /> Back to applications
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => router.push('/applications')}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to applications
      </button>

      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h1 className="kuja-display text-3xl">
              {application.grant_title || `Application #${application.id}`}
            </h1>
            <StatusBadge status={application.status} />
          </div>
          {application.ngo_org_name && (
            <p className="text-sm text-muted-foreground">{application.ngo_org_name}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span>Submitted: {formatDate(application.submitted_at)}</span>
            {application.final_score != null && <span>Final score: {application.final_score}%</span>}
          </div>
        </div>
        {application.ai_score != null && (
          <div className="flex items-center gap-3">
            <ScoreRing score={Math.round(application.ai_score)} size={64} label="AI" />
            {application.human_score != null && (
              <ScoreRing score={Math.round(application.human_score)} size={64} label="Human" />
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              tab === t.id
                ? 'text-[hsl(var(--kuja-clay))] border-[hsl(var(--kuja-clay))]'
                : 'text-muted-foreground border-transparent hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'responses' && <ResponsesTab application={application} />}
      {tab === 'documents' && <EmptyTab icon={Upload} label="Documents uploaded with this application will appear here" />}
      {tab === 'scores' && <ScoresTab application={application} />}
      {tab === 'reviews' && <EmptyTab icon={MessageSquare} label="Reviewer scores and comments will appear here" />}
    </div>
  );
}

function ResponsesTab({ application }: { application: Application }) {
  const responses = (application.responses ?? {}) as Record<string, string>;
  const entries = Object.entries(responses);
  if (entries.length === 0) {
    return <EmptyTab icon={FileText} label="No responses submitted" />;
  }
  return (
    <div className="space-y-3">
      {entries.map(([key, value]) => {
        const wordCount = value?.trim() ? value.trim().split(/\s+/).length : 0;
        return (
          <div key={key} className="rounded-xl border border-border bg-background p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold capitalize">{key.replace(/_/g, ' ')}</span>
              <span className="text-[10px] rounded-full border border-border text-muted-foreground px-2 py-0.5 uppercase tracking-wider">
                {wordCount} words
              </span>
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{value}</p>
          </div>
        );
      })}

      {application.eligibility_responses && Object.keys(application.eligibility_responses).length > 0 && (
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="text-sm font-semibold mb-3">Eligibility responses</div>
          <div className="space-y-1.5">
            {Object.entries(application.eligibility_responses).map(([key, val]) => {
              const item = val as Record<string, unknown>;
              return (
                <div key={key} className="flex items-center gap-2">
                  {item.met ? (
                    <CheckCircle className="h-4 w-4 text-[hsl(var(--kuja-grow))] flex-shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
                  )}
                  <span className="text-sm capitalize text-muted-foreground flex-1">
                    {key.replace(/_/g, ' ')}
                  </span>
                  {item.evidence ? (
                    <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                      {String(item.evidence)}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ScoresTab({ application }: { application: Application }) {
  const hasScores =
    application.ai_score != null || application.human_score != null || application.final_score != null;
  if (!hasScores) return <EmptyTab icon={BarChart3} label="Scores will appear after AI and reviewer evaluation" />;
  return (
    <div className="rounded-xl border border-border bg-background p-5">
      <div className="text-sm font-semibold mb-4">Score overview</div>
      <div className="flex items-center justify-center gap-10 flex-wrap">
        {application.ai_score != null && (
          <ScoreRing score={Math.round(application.ai_score)} size={100} label="AI Score" />
        )}
        {application.human_score != null && (
          <ScoreRing score={Math.round(application.human_score)} size={100} label="Human" />
        )}
        {application.final_score != null && (
          <ScoreRing score={Math.round(application.final_score)} size={100} label="Final" />
        )}
      </div>
    </div>
  );
}

function EmptyTab({ icon: Icon, label }: { icon: typeof FileText; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-background px-6 py-12 text-center">
      <Icon className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
