'use client';
import { useState, useMemo, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useGrant } from '@/lib/hooks/use-api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  DollarSign, Calendar, MapPin, FileText, Target, ClipboardList,
  Upload, Users, ArrowLeft, CheckCircle, AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EligibilityRequirement, Criterion, DocRequirement } from '@/lib/types';
import { GrantQAPanel } from '@/components/grants/GrantQAPanel';

function formatFunding(amount: number | null, currency: string): string {
  if (!amount) return 'TBD';
  return `${currency === 'USD' ? '$' : currency + ' '}${amount.toLocaleString()}`;
}

type TabId = 'overview' | 'eligibility' | 'criteria' | 'documents' | 'qa' | 'applications';

const TAB_KEYS: { id: TabId; key: string }[] = [
  { id: 'overview', key: 'grant.tab.overview' },
  { id: 'eligibility', key: 'grant.tab.eligibility' },
  { id: 'criteria', key: 'grant.tab.criteria' },
  { id: 'documents', key: 'grant.tab.documents' },
  { id: 'qa', key: 'grant.tab.qa' },
  { id: 'applications', key: 'grant.tab.applications' },
];

export default function GrantDetailClient() {
  const { t, formatDate } = useTranslation();
  const formatDeadline = (d?: string | null) =>
    d ? formatDate(d, { month: 'long', day: 'numeric', year: 'numeric' }) : 'No deadline';
  const params = useParams();
  // Static-export workaround: only /grants/0/ is prerendered, so params.id
  // hydrates as "0" for any real id. Track resolved id in state, re-resolve
  // from URL on each params change so SWR sees a stable id.
  const [id, setId] = useState<number | null>(() => {
    if (typeof window !== 'undefined') {
      const m = window.location.pathname.match(/\/grants\/(\d+)/);
      if (m && m[1] !== '0') return Number(m[1]);
    }
    const fromParams = Number(params.id);
    return Number.isFinite(fromParams) && fromParams > 0 ? fromParams : null;
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const m = window.location.pathname.match(/\/grants\/(\d+)/);
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
  const user = useAuthStore((s) => s.user);
  const { data, isLoading } = useGrant(id);
  const [tab, setTab] = useState<TabId>('overview');

  const grant = data?.grant;
  const isNgo = user?.role === 'ngo';
  const isDonor = user?.role === 'donor' || user?.role === 'admin';

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

  if (!grant) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-background px-6 py-14 text-center">
        <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
        <p className="kuja-display text-xl">{t('grant.detail.not_found')}</p>
        <button
          type="button"
          onClick={() => router.push('/grants')}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border hover:border-[hsl(var(--kuja-clay))] text-sm font-medium px-4 py-2"
        >
          <ArrowLeft className="h-4 w-4" /> {t('grant.detail.back')}
        </button>
      </div>
    );
  }

  const visibleTabs = TAB_KEYS.filter((tk) => tk.id !== 'applications' || isDonor);

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => router.push('/grants')}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t('grant.detail.back')}
      </button>

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h1 className="kuja-display text-3xl">{grant.title}</h1>
            <StatusBadge status={grant.status} kind="grant" />
          </div>
          {grant.donor_org_name && <p className="text-sm text-muted-foreground">{grant.donor_org_name}</p>}
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            <span className="inline-flex items-center gap-1.5 font-semibold text-[hsl(var(--kuja-grow))]">
              <DollarSign className="h-4 w-4" /> {formatFunding(grant.total_funding, grant.currency)}
            </span>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="h-4 w-4" /> {formatDeadline(grant.deadline)}
            </span>
            {grant.countries && grant.countries.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="h-4 w-4" /> {grant.countries.join(', ')}
              </span>
            )}
          </div>
        </div>
        {isNgo && grant.status === 'open' && !grant.user_application_status && (
          <button
            type="button"
            onClick={() => router.push(`/apply/${grant.id}`)}
            className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay-dark))] text-white text-sm font-medium px-4 py-2"
          >
            <FileText className="h-4 w-4" /> {t('grant.detail.apply')}
          </button>
        )}
        {isNgo && grant.user_application_status && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{t('grant.detail.your_app')}:</span>
            <StatusBadge status={grant.user_application_status} kind="app" />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {visibleTabs.map((tk) => (
          <button
            key={tk.id}
            type="button"
            onClick={() => setTab(tk.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap',
              tab === tk.id
                ? 'text-[hsl(var(--kuja-clay))] border-[hsl(var(--kuja-clay))]'
                : 'text-muted-foreground border-transparent hover:text-foreground',
            )}
          >
            {t(tk.key)}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab grant={grant} t={t} formatDeadline={formatDeadline} />}
      {tab === 'eligibility' && <EligibilityTab requirements={grant.eligibility ?? []} t={t} />}
      {tab === 'criteria' && <CriteriaTab criteria={grant.criteria ?? []} t={t} />}
      {tab === 'documents' && <DocumentsTab requirements={grant.doc_requirements ?? []} t={t} />}
      {tab === 'qa' && <GrantQAPanel grantId={grant.id} />}
      {tab === 'applications' && <ApplicationsTab grantId={grant.id} t={t} />}
    </div>
  );
}

function OverviewTab({ grant, t, formatDeadline }: { grant: NonNullable<ReturnType<typeof useGrant>['data']>['grant']; t: (key: string, vars?: Record<string, string | number>) => string; formatDeadline: (d?: string | null) => string }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <div className="rounded-xl border border-border bg-background p-5">
          <div className="text-sm font-semibold mb-2">{t('grant.detail.description')}</div>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {grant.description || t('grant.detail.no_description')}
          </p>
        </div>

        {grant.reporting_requirements && grant.reporting_requirements.length > 0 && (
          <div className="rounded-xl border border-border bg-background p-5">
            <div className="text-sm font-semibold mb-3">{t('grant.detail.reporting')}</div>
            <div className="space-y-2">
              {grant.reporting_requirements.map((r, i) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-muted/30 rounded-md">
                  <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">{r.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {r.type} · {r.frequency} · Due {r.due_days_after_period} days after period
                    </div>
                    {r.description && (
                      <div className="text-xs text-muted-foreground mt-1">{r.description}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="rounded-xl border border-border bg-background p-5">
          <div className="text-sm font-semibold mb-3">{t('grant.detail.quick_facts')}</div>
          <div className="space-y-3">
            <Fact label="Funding" value={formatFunding(grant.total_funding, grant.currency)} strong />
            <Fact label="Deadline" value={formatDeadline(grant.deadline)} />
            <div>
              <div className="kuja-label text-[10px]">Status</div>
              <div className="mt-1"><StatusBadge status={grant.status} kind="grant" /></div>
            </div>
            {grant.application_count !== undefined && (
              <Fact label="Applications" value={String(grant.application_count)} />
            )}
          </div>
        </div>

        {grant.sectors && grant.sectors.length > 0 && (
          <div className="rounded-xl border border-border bg-background p-5">
            <div className="text-sm font-semibold mb-2">Sectors</div>
            <div className="flex flex-wrap gap-1.5">
              {grant.sectors.map((s: string) => (
                <span key={s} className="rounded-full border border-[hsl(var(--kuja-clay))] text-[hsl(var(--kuja-clay-dark))] text-[11px] px-2 py-0.5">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {grant.countries && grant.countries.length > 0 && (
          <div className="rounded-xl border border-border bg-background p-5">
            <div className="text-sm font-semibold mb-2">Countries</div>
            <div className="flex flex-wrap gap-1.5">
              {grant.countries.map((c: string) => (
                <span key={c} className="rounded-full border border-border text-muted-foreground text-[11px] px-2 py-0.5">
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Fact({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="kuja-label text-[10px]">{label}</div>
      <div className={cn('mt-0.5', strong ? 'kuja-numeric text-base font-semibold' : 'text-sm')}>{value}</div>
    </div>
  );
}

function EligibilityTab({ requirements, t }: { requirements: EligibilityRequirement[]; t: (key: string, vars?: Record<string, string | number>) => string }) {
  if (requirements.length === 0) return <EmptyBlock icon={ClipboardList} label={t('grant.detail.no_eligibility')} />;
  return (
    <div className="space-y-2">
      {requirements.map((req, i) => (
        <div key={req.key || i} className="rounded-xl border border-border bg-background p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-[hsl(var(--kuja-sand-50))] grid place-items-center flex-shrink-0">
              <CheckCircle className="h-4 w-4 text-[hsl(var(--kuja-clay))]" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{req.label}</span>
                {req.required && <span className="kuja-severity kuja-severity-critical">{t('grant.detail.required')}</span>}
                {req.weight && <span className="kuja-severity kuja-severity-info">Weight: {req.weight}</span>}
              </div>
              {req.details && <p className="text-sm text-muted-foreground mt-1">{req.details}</p>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CriteriaTab({ criteria, t }: { criteria: Criterion[]; t: (key: string, vars?: Record<string, string | number>) => string }) {
  if (criteria.length === 0) return <EmptyBlock icon={Target} label={t('grant.detail.no_criteria')} />;
  const total = criteria.reduce((sum, c) => sum + c.weight, 0);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
        <Target className="h-4 w-4" /> {t('grant.detail.total_weight')}: {total}
      </div>
      {criteria.map((c, i) => (
        <div key={c.key || i} className="rounded-xl border border-border bg-background p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{c.label}</div>
              {c.description && <p className="text-sm text-muted-foreground mt-1">{c.description}</p>}
              {c.instructions && <p className="text-xs italic text-muted-foreground mt-1">{c.instructions}</p>}
              {c.max_words && <p className="text-xs text-muted-foreground mt-0.5">Max words: {c.max_words}</p>}
            </div>
            <div className="text-right flex-shrink-0">
              <div className="kuja-numeric text-xl font-bold text-[hsl(var(--kuja-clay))]">{c.weight}</div>
              <div className="kuja-label text-[10px]">weight</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DocumentsTab({ requirements, t }: { requirements: DocRequirement[]; t: (key: string, vars?: Record<string, string | number>) => string }) {
  if (requirements.length === 0) return <EmptyBlock icon={Upload} label={t('grant.detail.no_doc_reqs')} />;
  return (
    <div className="space-y-2">
      {requirements.map((doc, i) => (
        <div key={doc.key || i} className="rounded-xl border border-border bg-background p-4">
          <div className="flex items-start gap-3">
            <div className={cn(
              'w-8 h-8 rounded grid place-items-center flex-shrink-0',
              doc.required ? 'bg-[hsl(0_85%_97%)]' : 'bg-muted',
            )}>
              <Upload className={cn('h-4 w-4', doc.required ? 'text-[hsl(var(--kuja-flag))]' : 'text-muted-foreground')} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{doc.label}</span>
                {doc.required && <span className="kuja-severity kuja-severity-critical">{t('grant.detail.required')}</span>}
                {doc.ai_review && <span className="kuja-ai-pill">AI reviewed</span>}
              </div>
              {doc.specific_requirements && (
                <p className="text-sm text-muted-foreground mt-1">{doc.specific_requirements}</p>
              )}
              {doc.ai_criteria && (
                <p className="text-xs text-muted-foreground mt-1">AI criteria: {doc.ai_criteria}</p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ApplicationsTab({ grantId, t }: { grantId: number; t: (key: string, vars?: Record<string, string | number>) => string }) {
  const router = useRouter();
  return (
    <div className="rounded-xl border border-border bg-background px-6 py-12 text-center">
      <Users className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
      <p className="text-sm text-muted-foreground mb-3">{t('grant.detail.view_apps_subtitle')}</p>
      <button
        type="button"
        onClick={() => router.push(`/applications?grant_id=${grantId}`)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border hover:border-[hsl(var(--kuja-clay))] text-sm font-medium px-4 py-2"
      >
        <Users className="h-4 w-4" /> {t('grant.detail.view_apps')}
      </button>
    </div>
  );
}

function EmptyBlock({ icon: Icon, label }: { icon: typeof FileText; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-background px-6 py-12 text-center">
      <Icon className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
