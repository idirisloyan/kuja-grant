'use client';

/**
 * NEAR NGO Console — simplified dashboard for NGOs in the NEAR tenant.
 *
 * NEAR's product shape differs from Kuja Marketplace: NGOs don't browse
 * donor grants, don't manage a trust profile (NEAR runs that), don't
 * see peer-benchmark / cross-grant pattern cards. They just need:
 *
 *   1. Their membership + capacity assessment status (am I active?
 *      what's my score? when does it need refreshing?)
 *   2. Active grants under the NEAR pool (received via declarations)
 *   3. Compliance & reporting actions due
 */

import Link from 'next/link';
import { useAssessments, useReports, useMyMemberships } from '@/lib/hooks/use-api';
import {
  ClipboardCheck, FileText, AlertCircle, ChevronRight, ShieldCheck,
} from 'lucide-react';

export function NearNgoConsole() {
  const { data: assessmentsData, isLoading: assessmentsLoading } = useAssessments();
  const { data: reportsData } = useReports();
  const { data: mineData } = useMyMemberships();

  const assessments = assessmentsData?.assessments ?? [];
  const latest = assessments[0]; // already ordered by created_at desc by the API
  const reports = reportsData?.reports ?? [];
  const due = reports.filter((r) =>
    r.status !== 'submitted' && r.status !== 'accepted',
  );

  // Find the membership in the CURRENT network (the API scopes to current network)
  const membership = (mineData?.memberships ?? [])[0];

  return (
    <div className="space-y-5">
      {/* Membership status banner */}
      {membership && (
        <MembershipBanner status={membership.status} statusReason={membership.status_reason} />
      )}

      {/* Two-column hero: assessment score + reports due */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AssessmentScoreCard
          loading={assessmentsLoading}
          score={latest?.overall_score ?? null}
          completedAt={latest?.completed_at ?? null}
          status={latest?.status ?? null}
          frameworkLabel="NEAR Capacity Assessment"
        />
        <DueRemindersCard count={due.length} />
      </div>
    </div>
  );
}

function MembershipBanner({ status, statusReason }: {
  status: string; statusReason: string | null;
}) {
  const m: Record<string, { tone: string; title: string; copy: string }> = {
    pending: {
      tone: 'bg-[hsl(var(--kuja-sun))]/10 border-[hsl(var(--kuja-sun))]/30 text-[hsl(var(--kuja-sun))]',
      title: 'Membership application — draft',
      copy: 'Complete your eligibility questions + capacity assessment, then submit for review.',
    },
    under_review: {
      tone: 'bg-[hsl(var(--kuja-sun))]/10 border-[hsl(var(--kuja-sun))]/30 text-[hsl(var(--kuja-sun))]',
      title: 'Under review by NEAR',
      copy: 'NEAR is running due-diligence checks + reviewing your capacity assessment. Typical turnaround: 60 days.',
    },
    active: {
      tone: 'bg-[hsl(var(--kuja-grow))]/10 border-[hsl(var(--kuja-grow))]/30 text-[hsl(var(--kuja-grow))]',
      title: 'Active member',
      copy: 'You are eligible to receive grants under NEAR declarations.',
    },
    rejected: {
      tone: 'bg-destructive/10 border-destructive/30 text-destructive',
      title: 'Application not approved',
      copy: statusReason || 'See your membership page for reason + reapply cooldown.',
    },
    suspended: {
      tone: 'bg-destructive/10 border-destructive/30 text-destructive',
      title: 'Membership suspended',
      copy: statusReason || 'Contact NEAR to resolve.',
    },
  };
  const v = m[status] ?? m.pending;
  return (
    <div className={`border rounded-md px-4 py-3 ${v.tone}`}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck className="w-4 h-4" />
        {v.title}
      </div>
      <p className="text-xs mt-0.5 opacity-90">{v.copy}</p>
    </div>
  );
}

function AssessmentScoreCard({
  loading, score, completedAt, status, frameworkLabel,
}: {
  loading: boolean;
  score: number | null;
  completedAt: string | null;
  status: string | null;
  frameworkLabel: string;
}) {
  if (loading) {
    return <div className="kuja-shimmer h-40 rounded-lg" />;
  }

  const hasScore = score !== null && score !== undefined;
  const dateText = completedAt ? new Date(completedAt).toLocaleDateString() : null;
  const scoreColour =
    !hasScore ? 'text-muted-foreground'
    : score >= 80 ? 'text-[hsl(var(--kuja-grow))]'
    : score >= 60 ? 'text-[hsl(var(--kuja-sun))]'
    : 'text-destructive';

  return (
    <div className="border border-border rounded-lg bg-card p-5 space-y-3">
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {frameworkLabel}
        </div>
        <div className="font-semibold text-base mt-0.5">Your capacity score</div>
      </div>
      {hasScore ? (
        <div className="flex items-baseline gap-3">
          <div className={`kuja-display text-5xl font-bold ${scoreColour}`}>
            {Math.round(score)}
          </div>
          <div className="text-xs text-muted-foreground">
            <div>out of 100</div>
            {dateText && <div>completed {dateText}</div>}
            {status && <div className="capitalize">{status}</div>}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          You haven&rsquo;t taken the NEAR capacity assessment yet. The assessment
          is required for NEAR membership review and for eligibility to receive grants.
        </p>
      )}
      <Link
        href="/assessments/wizard"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 mt-1"
      >
        <ClipboardCheck className="w-3 h-3" />
        {hasScore ? 'Take new assessment' : 'Start assessment'}
        <ChevronRight className="w-3 h-3" />
      </Link>
    </div>
  );
}

function DueRemindersCard({ count }: { count: number }) {
  return (
    <div className="border border-border rounded-lg bg-card p-5 space-y-3">
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Compliance &amp; reporting
        </div>
        <div className="font-semibold text-base mt-0.5">Items due</div>
      </div>
      {count > 0 ? (
        <div className="flex items-baseline gap-3">
          <div className="kuja-display text-5xl font-bold text-[hsl(var(--kuja-sun))]">{count}</div>
          <div className="text-xs text-muted-foreground">
            <div>open report{count === 1 ? '' : 's'}</div>
            <div>under your active grants</div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-[hsl(var(--kuja-grow))]">
          <AlertCircle className="w-4 h-4" />
          You&rsquo;re caught up — no reports currently due.
        </div>
      )}
      <Link
        href="/reports"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-muted mt-1"
      >
        <FileText className="w-3 h-3" />
        Open compliance &amp; reporting
        <ChevronRight className="w-3 h-3" />
      </Link>
    </div>
  );
}
