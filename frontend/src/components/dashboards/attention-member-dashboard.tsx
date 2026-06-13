'use client';

/**
 * NEAR member NGO dashboard — Phase 48.
 *
 * The brief's hardest constraint for this role: they should NOT feel
 * like they're inside a giant system. Just "my status / my apps / my
 * reports / my messages".
 *
 *   Top: membership status (or attention if pending)
 *   Sections: current opportunities · my applications · due reports ·
 *             unread messages / feedback
 *   Detail: the existing rich NearNgoConsole as a collapsible
 */

import Link from 'next/link';
import { useMemo } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useNetworkStore } from '@/stores/network-store';
import {
  useApplications, useGrants, useMyMemberships, useUpcomingReports,
} from '@/lib/hooks/use-api';
import {
  PageShell, PageHeader, PageAttention, PageMain, PageDetail,
  PageDetailSection, type AttentionItem,
} from '@/components/layout/page-shell';
import { NearNgoConsole } from '@/components/dashboards/near-ngo-console';
import { Award, FileText, BarChart3, ArrowRight, Sparkles } from 'lucide-react';
import { TodayFocusBanner } from '@/components/dashboards/today-focus-banner';

export function AttentionMemberDashboard() {
  const user = useAuthStore((s) => s.user);
  const network = useNetworkStore((s) => s.network);

  const { data: myMems }       = useMyMemberships();
  const { data: openGrants }   = useGrants({ status: 'open' });
  const { data: myApps }       = useApplications();
  const { data: upcomingReps } = useUpcomingReports();

  // Pick the membership for the current network.
  const currentMem = useMemo(() => {
    if (!myMems?.memberships || !network?.id) return null;
    return myMems.memberships.find((m) => m.network_id === network.id) || null;
  }, [myMems, network?.id]);

  const draftApps   = (myApps?.applications ?? []).filter((a) => a.status === 'draft');
  const submittedApps = (myApps?.applications ?? []).filter((a) =>
    ['submitted', 'in_review'].includes(a.status),
  );
  // upcoming_reports is typed `unknown[]` at the hook; narrow it here.
  // Backend returns `draft_report_id` (nullable when not yet started)
  // — there is no top-level `id` field.
  type Upcoming = {
    grant_id: number;
    grant_title?: string;
    due_date?: string;
    application_id?: number;
    draft_report_id: number | null;
    requirement_title?: string;
    reporting_period?: string;
    status?: string;
  };
  const upcoming = ((upcomingReps?.upcoming_reports ?? []) as Upcoming[]).slice(0, 3);

  // Phase 63 — name the entities (same pattern as Phase 62).
  const draftNames = draftApps
    .map((a) => a.grant_title ? `"${a.grant_title}"` : `App #${a.id}`)
    .slice(0, 2);
  const upcomingNames = upcoming
    .map((r) => r.grant_title ? `"${r.grant_title}"` : (r.requirement_title || 'Report'))
    .slice(0, 2);
  const fmtList = (sample: string[], total: number) => {
    if (sample.length === 0) return '';
    const more = total - sample.length;
    return more > 0 ? `${sample.join(', ')} +${more} more` : sample.join(', ');
  };

  const attention: AttentionItem[] = useMemo(() => {
    const items: AttentionItem[] = [];
    if (!currentMem || currentMem.status === 'pending' || currentMem.status === 'under_review') {
      items.push({
        tone: 'warn',
        label: currentMem ? `Your membership is ${currentMem.status === 'pending' ? 'awaiting review' : 'under review'}` : 'Membership status unknown',
        hint: 'You can apply to declarations once your membership is active.',
        action: <JumpLink href="/trust" label="Open membership" />,
      });
    }
    if (draftApps.length > 0) {
      const list = fmtList(draftNames, draftApps.length);
      items.push({
        tone: 'accent',
        label: `${draftApps.length} draft application${draftApps.length === 1 ? '' : 's'} waiting to submit`,
        hint: list
          ? `${list}. Pick up where you left off.`
          : 'Pick up where you left off.',
        action: <JumpLink href="/applications" label="Continue" />,
      });
    }
    if (upcoming.length > 0) {
      const list = fmtList(upcomingNames, upcoming.length);
      items.push({
        tone: 'warn',
        label: `${upcoming.length} report${upcoming.length === 1 ? '' : 's'} due soon`,
        hint: list
          ? `${list}. Upload deliverables and answer the AI-evaluated questions.`
          : 'Upload deliverables and answer the AI-evaluated questions.',
        action: <JumpLink href="/reports" label="Open Reports" />,
      });
    }
    if (items.length === 0 && currentMem?.status === 'active') {
      items.push({
        tone: 'good',
        label: 'You\'re all caught up',
        hint: 'No drafts, no upcoming reports. Browse opportunities below when you\'re ready.',
      });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentMem, draftApps, upcoming,
    draftNames.join('|'),
    upcomingNames.join('|'),
  ]);

  if (!user) return null;
  const firstName = user.name?.split(' ')[0] ?? 'there';

  return (
    <PageShell>
      <PageHeader
        title={`Hi ${firstName}.`}
        subtitle={network?.name ? `${network.name} — member workspace.` : 'Member workspace.'}
        icon={Award}
      />

      <TodayFocusBanner items={attention} />
      <PageAttention items={attention} />

      <PageMain>
        {/* Current opportunities */}
        <section className="border border-border rounded-lg bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
              Current opportunities
            </h2>
            <Link
              href="/applications"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              See all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {(openGrants?.grants ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No open opportunities right now. Watch this space — declarations
              open shortlisted NGOs to apply.
            </p>
          ) : (
            <ul className="space-y-2">
              {(openGrants?.grants ?? []).slice(0, 3).map((g) => (
                <li key={g.id} className="text-xs flex items-center justify-between gap-3 border border-border rounded-md p-3 hover:bg-muted/30">
                  <Link href={`/grants/${g.id}`} className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{g.title}</div>
                    <div className="text-muted-foreground mt-0.5">
                      {g.total_funding && <>{g.total_funding.toLocaleString()} {g.currency || ''}</>}
                      {g.deadline && (
                        <> · closes {new Date(g.deadline).toLocaleDateString()}</>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* My applications in flight */}
        {submittedApps.length > 0 && (
          <section className="border border-border rounded-lg bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
                My applications in review
              </h2>
              <Link
                href="/applications"
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                See all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <ul className="space-y-2">
              {submittedApps.slice(0, 3).map((a) => (
                <li key={a.id} className="text-xs flex items-center justify-between gap-3 border border-border rounded-md p-3">
                  <Link href={`/applications/${a.id}`} className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{a.grant_title || `Application #${a.id}`}</div>
                    <div className="text-muted-foreground capitalize mt-0.5">{a.status.replace('_', ' ')}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Reports due — only when there are any */}
        {upcoming.length > 0 && (
          <section className="border border-border rounded-lg bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
                Reports due soon
              </h2>
              <Link
                href="/reports"
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                See all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <ul className="space-y-2">
              {upcoming.map((r, idx) => {
                const href = r.draft_report_id
                  ? `/reports/${r.draft_report_id}`
                  : `/reports?grant_id=${r.grant_id}`;
                const cta = r.draft_report_id ? 'Resume draft' : 'Start report';
                return (
                  <li
                    key={`${r.grant_id}-${r.reporting_period || idx}`}
                    className="text-xs flex items-center justify-between gap-3 border border-border rounded-md p-3"
                  >
                    <Link href={href} className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">
                        {r.grant_title || r.requirement_title || 'Report'}
                      </div>
                      <div className="text-muted-foreground mt-0.5 flex items-center gap-2">
                        {r.due_date && <span>Due {new Date(r.due_date).toLocaleDateString()}</span>}
                        {r.reporting_period && <span className="opacity-70">· {r.reporting_period}</span>}
                      </div>
                    </Link>
                    <span className="text-[10px] uppercase tracking-wide text-[hsl(var(--kuja-clay))] font-semibold whitespace-nowrap">
                      {cta}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </PageMain>

      <PageDetail>
        <PageDetailSection title="Full member console" defaultOpen={false}>
          <NearNgoConsole />
        </PageDetailSection>
      </PageDetail>
    </PageShell>
  );
}

function JumpLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-background border border-border text-xs font-semibold hover:bg-muted shrink-0"
    >
      {label} <ArrowRight className="w-3 h-3" />
    </Link>
  );
}
