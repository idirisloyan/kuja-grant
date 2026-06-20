'use client';
import { useState, useMemo, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useGrant } from '@/lib/hooks/use-api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  DollarSign, Calendar, MapPin, FileText, Target, ClipboardList,
  Upload, Users, ArrowLeft, CheckCircle, AlertCircle, Sparkles, Briefcase,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EligibilityRequirement, Criterion, DocRequirement } from '@/lib/types';
import { GrantQAPanel } from '@/components/grants/GrantQAPanel';
import { LiveDraftersPill } from '@/components/grants/LiveDraftersPill';
import { GrantAgreementUnpackPanel } from '@/components/grants/grant-agreement-unpack-panel';
import { TagsEditor } from '@/components/shared/tags-editor';
import { GrantBroadcastDialog } from '@/components/grants/grant-broadcast-dialog';
import { AIChatPanel } from '@/components/copilot/ai-chat-panel';
import { Megaphone, Download } from 'lucide-react';
import {
  PageShell, PageBack, PageHeader, PageMain,
  PageDetail, PageDetailSection,
} from '@/components/layout/page-shell';
import { describeGrantStatus } from '@/lib/status-copy';
import { WhyThisMatch, type ReasonFacet } from '@/components/shared/why-this-match';
import { TopMatchedNGOs } from '@/components/grants/top-matched-ngos';
import { BroadcastsThread } from '@/components/grants/broadcasts-thread';
import { api } from '@/lib/api';

// Phase 112 — Live wrapper around WhyThisMatch. Calls /api/match/explain
// for the calling NGO + grant, renders the resulting facets. While the
// request is in flight we show the fallback (built from the grant's own
// fields) so the callout doesn't pop in. On error we keep showing
// fallback. The caveat copy honors whether reasons came from the engine.
function WhyThisMatchLive({
  grantId,
  fallbackReasons,
}: {
  grantId: number;
  fallbackReasons: Array<{ facet: ReasonFacet; value?: string }>;
}) {
  const [live, setLive] = useState<{
    reasons: Array<{ facet: ReasonFacet; value?: string }>;
    grounded: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{
        success: boolean;
        reasons: Array<{ facet: ReasonFacet; value?: string }>;
      }>(`/api/match/explain/${grantId}`)
      .then((res) => {
        if (cancelled) return;
        if (res?.success && Array.isArray(res.reasons) && res.reasons.length > 0) {
          setLive({ reasons: res.reasons, grounded: true });
        } else {
          setLive({ reasons: fallbackReasons, grounded: false });
        }
      })
      .catch(() => {
        if (!cancelled) setLive({ reasons: fallbackReasons, grounded: false });
      });
    return () => {
      cancelled = true;
    };
  }, [grantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const reasons = live?.reasons ?? fallbackReasons;
  if (reasons.length === 0) return null;

  return (
    <WhyThisMatch
      reasons={reasons}
      caveat={
        live?.grounded
          ? 'Computed from your organization profile. Eligibility decisions are made by the donor.'
          : 'Match is automated. Eligibility decisions are made by the donor.'
      }
    />
  );
}

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
  // Phase 21B — broadcast dialog state (donor + admin only)
  const [broadcastOpen, setBroadcastOpen] = useState(false);

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
  const statusPill = describeGrantStatus(grant.status);

  // Primary action — apply / broadcast / "your application" depending on role.
  // Phase 73 — audit-folder export. Available to NGO (their own), donor
  // (full grant), admin (full grant). One click → ZIP with manifest +
  // SHA-256 hashes. Eliminates the days-of-Drive-archaeology audit dread.
  const showAuditExport = (isNgo && !!grant.user_application_status) || isDonor || user?.role === 'admin';
  const auditHref = `/api/grants/${grant.id}/audit-folder`;
  const primaryAction = (
    <div className="flex items-center gap-2 flex-wrap">
      {showAuditExport && (
        <a
          href={auditHref}
          className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--kuja-grow))]/40 hover:bg-[hsl(var(--kuja-grow))]/10 text-[hsl(var(--kuja-grow))] text-sm font-medium px-4 py-2"
          title="Download a ZIP with the agreement, every report, every attachment, every reviewer note, and a tamper-evident manifest. Audit-ready in one click."
        >
          <Download className="h-4 w-4" /> Audit folder
        </a>
      )}
      {isDonor && (
        <button
          type="button"
          onClick={() => setBroadcastOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--border))] hover:border-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-sand))]/40 text-sm font-medium px-4 py-2"
          title="Send a clarification to every NGO with an app on this grant"
        >
          <Megaphone className="h-4 w-4" /> Broadcast
        </button>
      )}
      {/* Phase 181 — duplicate this grant into a fresh draft. */}
      {isDonor && grant.id != null && (
        <DuplicateGrantButton grantId={grant.id} />
      )}
      {/* Phase 199 — save criteria as reusable template. */}
      {isDonor && grant.id != null && grant.criteria && grant.criteria.length > 0 && (
        <SaveCriteriaTemplateButton grantId={grant.id} />
      )}
      {/* Phase 208 — applications CSV export. */}
      {isDonor && grant.id != null && (
        <a
          href={`/api/grants/${grant.id}/applications.csv`}
          className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--border))] hover:border-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-sand))]/40 text-sm font-medium px-4 py-2"
          title="Download applications + scores as CSV"
        >
          Export applications CSV
        </a>
      )}
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
      {isDonor && <LiveDraftersPill grantId={grant.id} />}
    </div>
  );

  return (
    <PageShell>
      <PageBack href="/grants" label={t('grant.detail.back')} />

      <PageHeader
        title={grant.title}
        subtitle={grant.donor_org_name || undefined}
        icon={Briefcase}
        status={statusPill}
        meta={[
          { label: formatFunding(grant.total_funding, grant.currency), icon: DollarSign },
          { label: formatDeadline(grant.deadline), icon: Calendar },
          ...(grant.countries && grant.countries.length > 0
            ? [{ label: grant.countries.join(', '), icon: MapPin }]
            : []),
        ]}
        primaryAction={primaryAction}
      />

      <PageMain>
        {/* Phase 112 — NGO-only "why this is a fit" callout. Now grounded
            in real match-engine signals (sector/geography Jaccard, capacity
            fit vs grant burden, awarded track record) via /api/match/explain
            instead of the prior local heuristic that echoed the grant's
            own fields. Falls back silently if the call fails. */}
        {/* Phase 155 — Donor view: ranked NGOs that fit this grant. */}
        {isDonor && id != null && <TopMatchedNGOs grantId={id} />}

        {/* Phase 194 — Broadcasts thread (donor + applicant NGOs). */}
        {id != null && <BroadcastsThread grantId={id} />}

        {isNgo && id != null && (
          <WhyThisMatchLive grantId={id} fallbackReasons={(() => {
            const reasons: Array<{ facet: ReasonFacet; value?: string }> = [];
            if (grant.countries && grant.countries.length > 0) {
              reasons.push({ facet: 'country', value: grant.countries.slice(0, 2).join(', ') });
            }
            if (grant.sectors && grant.sectors.length > 0) {
              reasons.push({ facet: 'sector', value: grant.sectors.slice(0, 2).join(', ') });
            }
            return reasons;
          })()} />
        )}

        {/* Tags row — kept near the top because they're identity / filter signals */}
        <div>
          <TagsEditor
            targetKind="grant"
            targetId={grant.id}
            editable={isDonor}
          />
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
      </PageMain>

      {/* Supporting detail — agreement smart-unpack + AI chat */}
      <PageDetail>
        <PageDetailSection
          title="Grant agreement smart-unpack"
          icon={FileText}
          defaultOpen={false}
        >
          <GrantAgreementUnpackPanel
            grantId={grant.id}
            canApply={user?.role === 'ngo' || user?.role === 'admin'}
          />
        </PageDetailSection>
        <PageDetailSection
          title="Ask Kuja about this grant"
          icon={Sparkles}
          defaultOpen={false}
        >
          <AIChatPanel scope={{ kind: 'grant', id: grant.id }} />
        </PageDetailSection>
      </PageDetail>

      {/* Broadcast dialog stays mounted regardless of where it sits visually. */}
      {isDonor && (
        <GrantBroadcastDialog
          open={broadcastOpen}
          onOpenChange={setBroadcastOpen}
          grantId={grant.id}
        />
      )}
    </PageShell>
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

// Phase 199 — Save criteria as a re-usable template (Phase 189 lib).
function SaveCriteriaTemplateButton({ grantId }: { grantId: number }) {
  const [busy, setBusy] = useState(false);

  async function go() {
    if (busy) return;
    const name = prompt('Name this criteria template (e.g. "WASH evaluation v2"):');
    if (!name || !name.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/grants/${grantId}/save-as-template`, {
        name: name.trim(),
      });
      alert('Saved. The picker on grant create will show it next time.');
    } catch {
      alert('Could not save template.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={go}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--border))] hover:border-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-sand))]/40 text-sm font-medium px-4 py-2 disabled:opacity-60"
      title="Save these criteria as a reusable template"
    >
      {busy ? 'Saving…' : 'Save as template'}
    </button>
  );
}

// Phase 181 — duplicate-grant CTA. Calls the Phase 177 backend, then
// navigates the donor to the new draft so they can tweak title +
// deadline and publish.
function DuplicateGrantButton({ grantId }: { grantId: number }) {
  const router = useRouter();
  const { t: _t } = useTranslation();
  const [busy, setBusy] = useState(false);
  void _t;

  async function go() {
    if (busy) return;
    if (!confirm('Duplicate this grant into a new draft? You can edit the copy before publishing.')) {
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ grant: { id: number } }>(
        `/api/grants/${grantId}/duplicate`, {},
      );
      router.push(`/grants/${res.grant.id}`);
    } catch {
      alert('Failed to duplicate grant. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={go}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--border))] hover:border-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-sand))]/40 text-sm font-medium px-4 py-2 disabled:opacity-60"
      title="Clone this grant into a new draft"
    >
      {busy ? 'Duplicating…' : 'Duplicate'}
    </button>
  );
}
