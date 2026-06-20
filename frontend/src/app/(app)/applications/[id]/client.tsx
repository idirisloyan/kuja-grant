'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useApplication } from '@/lib/hooks/use-api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { StatusBadge } from '@/components/shared/status-badge';
import { ScoreRing } from '@/components/shared/score-ring';
import {
  ArrowLeft, FileText, Upload, BarChart3, MessageSquare,
  AlertCircle, CheckCircle, Sparkles, ClipboardList, Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Application } from '@/lib/types';
import { InfoTip } from '@/components/shared/info-tip';
import {
  PageShell, PageBack, PageHeader, PageMain,
  PageDetail, PageDetailSection,
} from '@/components/layout/page-shell';
import { describeApplicationStatus } from '@/lib/status-copy';
import { ActivityTimeline } from '@/components/applications/ActivityTimeline';
import { ApplicationTimeline } from '@/components/applications/application-timeline';
import { StatusSignalsRail } from '@/components/shared/status-signals-rail';
import { WhyRejectedPanel } from '@/components/shared/why-rejected-panel';
import { PreflightPanel } from '@/components/shared/preflight-panel';
import { PreSubmitPreview, type Fix } from '@/components/shared/pre-submit-preview';
import { ReviewerFollowupsPanel } from '@/components/reviews/reviewer-followups-panel';
import { ReviewerBriefingCard } from '@/components/reviews/reviewer-briefing-card';
import { PanelCalibrationCard } from '@/components/reviews/panel-calibration-card';
import { ScoreBreakdownCard } from '@/components/applications/score-breakdown-card';
import { NetworkAiPanel } from '@/components/applications/network-ai-panel';
import { NgoBudgetPanel } from '@/components/applications/ngo-budget-panel';
import { ApplicationMessageThread } from '@/components/applications/application-message-thread';
import { DecisionDebriefPanel } from '@/components/apply/decision-debrief-panel';
import { AIChatPanel } from '@/components/copilot/ai-chat-panel';
import { MicroSurvey } from '@/components/shared/micro-survey';
import { useAuthStore } from '@/stores/auth-store';

type TabId = 'responses' | 'documents' | 'scores' | 'reviews' | 'activity';
const TAB_KEYS: { id: TabId; key: string }[] = [
  { id: 'responses', key: 'application.tab.responses' },
  { id: 'documents', key: 'application.tab.documents' },
  { id: 'scores', key: 'application.tab.scores' },
  { id: 'reviews', key: 'application.tab.reviews' },
  { id: 'activity', key: 'application.tab.activity' },
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
  const viewer = useAuthStore((s) => s.user);

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

  const statusPill = describeApplicationStatus(application.status);
  const isOwnerNgo = viewer?.role === 'ngo' && application.ngo_org_id === viewer?.org_id;
  const isReviewerSide = !!viewer && (viewer.role === 'donor' || viewer.role === 'reviewer' || viewer.role === 'admin');
  const isNetworkGrant = (application as { grant_fund_window_id?: number | null }).grant_fund_window_id != null;
  const showBudget = isNetworkGrant && isOwnerNgo;
  const showNetworkAi = isNetworkGrant && isReviewerSide;

  return (
    <PageShell>
      <PageBack href="/applications" label={t('application.back')} />

      <PageHeader
        title={application.grant_title || t('applications.label_fallback', { n: application.id })}
        subtitle={application.ngo_org_name || undefined}
        status={statusPill}
        primaryAction={
          <div className="flex items-center gap-3 flex-wrap">
            {(application.status === 'draft' || application.status === 'submitted') && (
              <PreflightPanel kind="application" entityId={application.id} />
            )}
            {application.ai_score != null && (
              <>
                <ScoreRing score={Math.round(application.ai_score)} size={56} label="AI" />
                {application.human_score != null && (
                  <ScoreRing score={Math.round(application.human_score)} size={56} label="Human" />
                )}
              </>
            )}
          </div>
        }
      />

      <PageMain>
        {/* Phase 98.7 (Wave 3) — pre-submit preview. Only shown for the
            owning NGO while the application is still a draft. Rule-based
            v0 server-side; replaced by AI prediction in Wave 3 final. */}
        {application.status === 'draft' && isOwnerNgo && (
          <ApplicationPreSubmitPreview applicationId={application.id} />
        )}

        {/* Phase 76 — Why-rejected, constructively. Surfaces only when
            the application is declined / rejected / revision_requested.
            On-demand AI explanation; lazy-loaded when opened. */}
        {['declined', 'rejected', 'revision_requested'].includes(application.status) && (
          <WhyRejectedPanel kind="application" entityId={application.id} />
        )}

        {/* 1. Summary first — "Where this stands" */}
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

        {/* 2. Budget second — promoted from the bottom of the page per brief.
            Only renders when relevant (network grant + applicant's NGO). */}
        {showBudget && (
          <NgoBudgetPanel
            applicationId={application.id}
            initial={(application as { budget_lines?: Array<{ item?: string; amount?: number }> }).budget_lines}
            status={application.status}
          />
        )}

        {/* Win/loss debrief — only on awarded/rejected. Close the feedback loop. */}
        <DecisionDebriefPanel
          applicationId={application.id}
          status={application.status}
          canEdit={!!viewer && (viewer.role === 'donor' || viewer.role === 'admin')}
          initial={{
            decision_reason_code: application.decision_reason_code ?? null,
            decision_notes: application.decision_notes ?? null,
            decision_recorded_at: application.decision_recorded_at ?? null,
            decision_recorded_by_user_id: application.decision_recorded_by_user_id ?? null,
          }}
        />

        {/* 3. Main work — tabs */}
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
        {tab === 'activity' && (
          <div className="space-y-3">
            <ApplicationTimeline applicationId={application.id} />
            <ActivityTimeline applicationId={application.id} />
          </div>
        )}

        {/* Score breakdown — visible to all roles, NGOs see WHY they got the score. */}
        <ScoreBreakdownCard applicationId={application.id} />

        {/* Asks · Risks · Decisions rail — stays visible across tabs */}
        <div className="pt-2">
          <h2 className="kuja-eyebrow mb-2">Asks · Risks · Decisions</h2>
          <StatusSignalsRail entityKind="application" entityId={application.id} />
        </div>

        {/* Conversation — primary communication, stays in main */}
        <div className="pt-2">
          <ApplicationMessageThread applicationId={application.id} />
        </div>
      </PageMain>

      {/* 4. Supporting detail — AI assist + reviewer aids + audit/history
          collapsibles per the brief ("AI assist in a side panel or
          collapsible block, audit/history below, not above"). */}
      <PageDetail>
        {/* AI: scoped chat — useful but should not dominate */}
        <PageDetailSection
          title="Ask Kuja about this application"
          icon={Sparkles}
          defaultOpen={false}
        >
          <AIChatPanel scope={{ kind: 'application', id: application.id }} />
        </PageDetailSection>

        {/* AI: NEAR rubric scorer + direct-to-community classifier */}
        {showNetworkAi && (
          <PageDetailSection
            title="NEAR AI assist (rubric scorer · direct-to-community)"
            icon={Sparkles}
            defaultOpen={false}
          >
            <NetworkAiPanel applicationId={application.id} />
          </PageDetailSection>
        )}

        {/* Reviewer aids — collapsed by default, only render for reviewer-side roles */}
        {isReviewerSide && (
          <PageDetailSection
            title="Reviewer aids (decision-unlocking questions · briefing)"
            icon={ClipboardList}
            defaultOpen={false}
          >
            <ReviewerFollowupsGate applicationId={application.id} />
          </PageDetailSection>
        )}

        {/* Panel calibration — auto-hides on its own when <1 reviews; wrap to a section */}
        <PageDetailSection
          title="Panel calibration"
          icon={Activity}
          defaultOpen={false}
        >
          <PanelCalibrationCard applicationId={application.id} />
        </PageDetailSection>

        {/* NGO micro-survey — only after submit */}
        {isOwnerNgo && application.status !== 'draft' && (
          <PageDetailSection
            title="Was Kuja helpful here?"
            icon={MessageSquare}
            defaultOpen={false}
          >
            <MicroSurvey
              surface="application_submit"
              relatedKind="application"
              relatedId={application.id}
              question="How helpful was Kuja in preparing this application?"
            />
          </PageDetailSection>
        )}
      </PageDetail>
    </PageShell>
  );
}

// Phase 8 — gate the reviewer-followups panel to donor/reviewer/admin.
// NGOs don't see this surface (it's reviewer-side AI, not for the
// applicant).
function ReviewerFollowupsGate({ applicationId }: { applicationId: number }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;
  if (!(user.role === 'donor' || user.role === 'reviewer' || user.role === 'admin')) return null;
  return (
    <div className="pt-2 space-y-3">
      {/* Phase 20B — pre-scoring briefing (collapsed by default) */}
      <ReviewerBriefingCard applicationId={applicationId} />
      <div>
        <h2 className="kuja-eyebrow mb-2">Decision-unlocking questions</h2>
        <ReviewerFollowupsPanel kind="application" entityId={applicationId} />
      </div>
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

interface PreSubmitData {
  status?: 'ready' | 'low-conf';
  predictedBand?: string;
  confidence?: 'high' | 'medium' | 'low';
  fixes?: Fix[];
}

function ApplicationPreSubmitPreview({ applicationId }: { applicationId: number }) {
  const [data, setData] = useState<PreSubmitData | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/applications/${applicationId}/pre-submit-preview`)
      .then(r => r.json())
      .then(j => { if (!cancelled) setData(j); })
      .catch(() => { if (!cancelled) setData({ status: 'low-conf' }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [applicationId]);
  const status: 'loading' | 'ready' | 'low-conf' =
    loading ? 'loading' : (data?.status === 'ready' ? 'ready' : 'low-conf');
  return (
    <PreSubmitPreview
      status={status}
      predictedBand={data?.predictedBand}
      confidence={data?.confidence}
      fixes={data?.fixes}
      onFixIt={(f) => {
        // Jump to the responses tab + scroll to the field if present
        if (f.fieldId && typeof window !== 'undefined') {
          const el = document.getElementById(f.fieldId);
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }}
      className="mb-3"
    />
  );
}
