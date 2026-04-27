'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useApplication } from '@/lib/hooks/use-api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { StatusBadge } from '@/components/shared/status-badge';
import { ScoreRing } from '@/components/shared/score-ring';
import {
  ArrowLeft, FileText, Upload, BarChart3, MessageSquare,
  AlertCircle, CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Application } from '@/lib/types';
import { InfoTip } from '@/components/shared/info-tip';

type TabId = 'responses' | 'documents' | 'scores' | 'reviews';
const TAB_KEYS: { id: TabId; key: string }[] = [
  { id: 'responses', key: 'application.tab.responses' },
  { id: 'documents', key: 'application.tab.documents' },
  { id: 'scores', key: 'application.tab.scores' },
  { id: 'reviews', key: 'application.tab.reviews' },
];

export default function ApplicationDetailClient() {
  const { t, formatDate } = useTranslation();
  const params = useParams();
  // Same static-export fix as /apply/[grantId]: Next.js prerenders only
  // /applications/0/, so params.id hydrates as "0" for any real id. The URL
  // is the source of truth, and we keep it in state so SWR sees a stable id.
  const [id, setId] = useState<number | null>(() => {
    if (typeof window !== 'undefined') {
      const m = window.location.pathname.match(/\/applications\/(\d+)/);
      if (m && m[1] !== '0') return Number(m[1]);
    }
    const fromParams = Number(params.id);
    return Number.isFinite(fromParams) && fromParams > 0 ? fromParams : null;
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const m = window.location.pathname.match(/\/applications\/(\d+)/);
    if (m && m[1] !== '0') {
      const n = Number(m[1]);
      if (n !== id) setId(n);
      return;
    }
    const fromParams = Number(params.id);
    if (Number.isFinite(fromParams) && fromParams > 0 && fromParams !== id) {
      setId(fromParams);
    }
  }, [params.id, id]);
  const router = useRouter();
  const { data, isLoading } = useApplication(id);
  const [tab, setTab] = useState<TabId>('responses');
  const application = data?.application;

  useEffect(() => {
    // If donor/admin/reviewer is viewing and the application has been
    // reviewed (final_score or human_score present), auto-open Reviews tab
    // so the most relevant info is front and center.
    if (application && (application.final_score != null || application.human_score != null)) {
      setTab('reviews');
    }
  }, [application]);

  if (id == null || isLoading) {
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
        <p className="kuja-display text-xl">{t('application.not_found')}</p>
        <button
          type="button"
          onClick={() => router.push('/applications')}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border hover:border-[hsl(var(--kuja-clay))] text-sm font-medium px-4 py-2"
        >
          <ArrowLeft className="h-4 w-4" /> {t('application.back')}
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
        <ArrowLeft className="h-4 w-4" /> {t('application.back')}
      </button>

      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h1 className="kuja-display text-3xl">
              {application.grant_title || t('applications.label_fallback', { n: application.id })}
            </h1>
            <StatusBadge status={application.status} kind="app" />
          </div>
          {application.ngo_org_name && (
            <p className="text-sm text-muted-foreground">{application.ngo_org_name}</p>
          )}
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

      {/* "Where this stands" summary — replaces the loose meta line so the
          applicant immediately sees what stage they're at and what's
          happening next, instead of having to interpret the status badge. */}
      <div className="rounded-xl border border-border bg-gradient-to-br from-background to-[hsl(var(--kuja-sand-50))] p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
              {t('applications.detail.where_stands')}
            </div>
            <InfoTip>{t('glossary.application_status')}</InfoTip>
          </div>
        </div>
        <p className="mt-1 text-sm text-foreground leading-relaxed">
          {t(`applications.detail.summary_subtitle_${application.status}`)}
        </p>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('applications.detail.summary_grant')}</div>
            <div className="font-medium truncate" title={application.grant_title ?? ''}>{application.grant_title || '—'}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('applications.detail.summary_status')}</div>
            <div className="font-medium"><StatusBadge status={application.status} kind="app" /></div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('applications.detail.summary_submitted')}</div>
            <div className="font-medium">{formatDate(application.submitted_at, { month: 'long', day: 'numeric', year: 'numeric' })}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('applications.detail.summary_score')}</div>
            <div className="font-medium kuja-numeric">{application.final_score != null ? `${application.final_score}%` : '—'}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TAB_KEYS.map((tk) => (
          <button
            key={tk.id}
            type="button"
            onClick={() => setTab(tk.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              tab === tk.id
                ? 'text-[hsl(var(--kuja-clay))] border-[hsl(var(--kuja-clay))]'
                : 'text-muted-foreground border-transparent hover:text-foreground',
            )}
          >
            {t(tk.key)}
          </button>
        ))}
      </div>

      {tab === 'responses' && <ResponsesTab application={application} />}
      {tab === 'documents' && <EmptyTab icon={Upload} label={t('applications.documents_empty')} />}
      {tab === 'scores' && <ScoresTab application={application} />}
      {tab === 'reviews' && <EmptyTab icon={MessageSquare} label={t('applications.reviews_empty')} />}
    </div>
  );
}

function ResponsesTab({ application }: { application: Application }) {
  const { t } = useTranslation();
  const responses = (application.responses ?? {}) as Record<string, string>;
  const entries = Object.entries(responses);
  if (entries.length === 0) {
    return <EmptyTab icon={FileText} label={t('applications.no_responses')} />;
  }
  return (
    <div className="space-y-3">
      {entries.map(([key, value]) => {
        const wordCount = value?.trim() ? value.trim().split(/\s+/).length : 0;
        const wcCls = wordCount < 50
          ? 'text-amber-600 border-amber-200 bg-amber-50'
          : wordCount < 200
            ? 'text-muted-foreground border-border'
            : 'text-emerald-700 border-emerald-200 bg-emerald-50';
        return (
          <div key={key} className="rounded-xl border border-border bg-background p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold capitalize">{key.replace(/_/g, ' ')}</span>
              <span className={`text-[10px] rounded-full border px-2 py-0.5 uppercase tracking-wider ${wcCls}`}>
                {t('applications.word_count', { n: wordCount })}
              </span>
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{value}</p>
          </div>
        );
      })}

      {application.eligibility_responses && Object.keys(application.eligibility_responses).length > 0 && (
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="text-sm font-semibold mb-3">{t('applications.eligibility_responses')}</div>
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
  const { t } = useTranslation();
  const hasScores =
    application.ai_score != null || application.human_score != null || application.final_score != null;
  if (!hasScores) return <EmptyTab icon={BarChart3} label={t('applications.scores_empty')} />;
  return (
    <div className="rounded-xl border border-border bg-background p-5">
      <div className="text-sm font-semibold mb-4">{t('applications.score_overview')}</div>
      <div className="flex items-center justify-center gap-10 flex-wrap">
        {application.ai_score != null && (
          <ScoreRing score={Math.round(application.ai_score)} size={100} label={t('applications.score.ai')} />
        )}
        {application.human_score != null && (
          <ScoreRing score={Math.round(application.human_score)} size={100} label={t('applications.score.human')} />
        )}
        {application.final_score != null && (
          <ScoreRing score={Math.round(application.final_score)} size={100} label={t('applications.score.final')} />
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
