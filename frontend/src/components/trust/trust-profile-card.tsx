'use client';

/**
 * TrustProfileCard — the single-screen two-pillar Trust Profile.
 *
 * The category-defining moat: instead of giving donors a stack of raw artifacts
 * (sanctions PDF, registration scan, assessment workbook), Kuja synthesises
 * the org's evidence into ONE defensible answer ("Trust 78/100. Capacity strong.
 * One pending medium-severity adverse media item.") with drilldown one click away.
 *
 * Design:
 *   - Headline composite score on the left, with status chip
 *   - Two pillars (Capacity + Diligence) as stacked accordions on the right
 *   - Per-pillar component breakdown with status pip, last-updated, drilldown
 *   - Strengths and gaps from the most recent assessment
 *   - Renders gracefully on empty / partial data
 */

import { useState } from 'react';
import {
  ShieldCheck, AlertTriangle, Info, ChevronDown, ChevronUp,
  CheckCircle2, Circle, XCircle, ExternalLink, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import type {
  TrustProfile, PillarStatus, DiligenceComponent, CapacityFrameworkRow,
} from '@/lib/trust-api';

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_META: Record<PillarStatus, { label: string; tone: string; icon: typeof CheckCircle2 }> = {
  clear:      { label: 'Clear',      tone: 'text-[hsl(var(--kuja-grow))]', icon: CheckCircle2 },
  review:     { label: 'Review',     tone: 'text-[hsl(var(--kuja-sun))]',  icon: AlertTriangle },
  flagged:    { label: 'Flagged',    tone: 'text-[hsl(var(--kuja-flag))]', icon: XCircle },
  incomplete: { label: 'Incomplete', tone: 'text-[hsl(var(--kuja-ink-soft))]', icon: Circle },
};

function StatusPip({ status }: { status: PillarStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.incomplete;
  const Icon = meta.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold', meta.tone)}>
      <Icon className="w-3.5 h-3.5" aria-hidden />
      <span>{meta.label}</span>
    </span>
  );
}

function ScoreRing({ score, size = 132, status }: { score: number; size?: number; status: PillarStatus }) {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.max(0, Math.min(100, score)) / 100) * circumference;
  const ringColor = status === 'flagged' ? 'hsl(var(--kuja-flag))'
    : status === 'review' ? 'hsl(var(--kuja-sun))'
    : status === 'clear' ? 'hsl(var(--kuja-grow))'
    : 'hsl(var(--kuja-ink-soft))';
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="hsl(var(--kuja-sand))" strokeWidth="10"
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={ringColor} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 600ms ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="kuja-numeric text-4xl font-bold leading-none">{score}</span>
        <span className="kuja-label text-[10px] mt-1">/ 100</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Last-updated chip
// ---------------------------------------------------------------------------

function formatAge(iso: string | null): string {
  if (!iso) return 'never';
  const then = new Date(iso);
  const now = new Date();
  const days = Math.floor((now.getTime() - then.getTime()) / 86400000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

// ---------------------------------------------------------------------------
// Diligence row
// ---------------------------------------------------------------------------

function DiligenceRow({ comp }: { comp: DiligenceComponent }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-[hsl(var(--border))] last:border-b-0">
      <div className="pt-0.5">
        <StatusPip status={comp.status} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h4 className="text-sm font-semibold text-[hsl(var(--kuja-ink))]">{comp.label}</h4>
          <span className="text-[11px] text-[hsl(var(--kuja-ink-soft))]">
            {formatAge(comp.last_updated)}
          </span>
        </div>
        <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-0.5">{comp.detail}</p>
      </div>
      <div className="text-right shrink-0">
        <span className="kuja-numeric text-sm font-semibold tabular-nums">{comp.score}</span>
        <span className="text-xs text-[hsl(var(--kuja-ink-soft))]"> /100</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Capacity row
// ---------------------------------------------------------------------------

function CapacityRow({ row }: { row: CapacityFrameworkRow }) {
  const isCompleted = row.status === 'completed' && row.score !== null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-[hsl(var(--border))] last:border-b-0">
      <div className="pt-0.5 shrink-0">
        {isCompleted ? (
          <CheckCircle2 className="w-4 h-4 text-[hsl(var(--kuja-grow))]" />
        ) : (
          <Circle className="w-4 h-4 text-[hsl(var(--kuja-ink-soft))]" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h4 className="text-sm font-semibold text-[hsl(var(--kuja-ink))]">{row.label}</h4>
          <span className="text-[11px] text-[hsl(var(--kuja-ink-soft))] uppercase tracking-wider">
            weight {row.weight}
          </span>
        </div>
        <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-0.5">
          {isCompleted ? `Updated ${formatAge(row.last_updated)}` : 'Not started yet'}
        </p>
      </div>
      <div className="text-right shrink-0">
        {row.score !== null ? (
          <>
            <span className="kuja-numeric text-sm font-semibold tabular-nums">{row.score}</span>
            <span className="text-xs text-[hsl(var(--kuja-ink-soft))]"> /100</span>
          </>
        ) : (
          <span className="text-xs text-[hsl(var(--kuja-ink-soft))]">—</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pillar card
// ---------------------------------------------------------------------------

function PillarCard({
  title, score, status, subtitle, children, defaultOpen = true,
}: {
  title: string;
  score: number;
  status: PillarStatus;
  subtitle?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="border-[hsl(var(--border))] overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-4 px-4 py-3 hover:bg-[hsl(var(--kuja-sand-50))] transition-colors text-left"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-3 min-w-0">
          <ShieldCheck className="w-5 h-5 text-[hsl(var(--kuja-clay))] shrink-0" />
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-[hsl(var(--kuja-ink))]">{title}</h3>
            {subtitle && (
              <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <div>
              <span className="kuja-numeric text-xl font-bold tabular-nums">{score}</span>
              <span className="text-xs text-[hsl(var(--kuja-ink-soft))]"> /100</span>
            </div>
            <StatusPip status={status} />
          </div>
          {open ? (
            <ChevronUp className="w-4 h-4 text-[hsl(var(--kuja-ink-soft))]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[hsl(var(--kuja-ink-soft))]" />
          )}
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-[hsl(var(--border))] bg-[hsl(var(--kuja-quartz))]">
          {children}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface TrustProfileCardProps {
  profile: TrustProfile;
  onPublishPassport?: () => void;
  onRunScreening?: (kind: 'sanctions' | 'adverse_media' | 'bank' | 'registration') => void;
  showActions?: boolean;
}

export function TrustProfileCard({
  profile, onPublishPassport, onRunScreening, showActions = true,
}: TrustProfileCardProps) {
  const overall = profile.overall;
  return (
    <div className="space-y-4">
      {/* Headline composite */}
      <Card className={cn(
        'p-6 border-l-4',
        overall.status === 'flagged' && 'border-l-[hsl(var(--kuja-flag))]',
        overall.status === 'review' && 'border-l-[hsl(var(--kuja-sun))]',
        overall.status === 'clear' && 'border-l-[hsl(var(--kuja-grow))]',
        overall.status === 'incomplete' && 'border-l-[hsl(var(--kuja-ink-soft))]',
      )}>
        <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
          <ScoreRing score={overall.score} status={overall.status} />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h2 className="kuja-display text-2xl">Trust Profile</h2>
              <StatusPip status={overall.status} />
            </div>
            <p className="text-sm text-[hsl(var(--kuja-ink-soft))] mt-1">
              {profile.org_name}
              {profile.country && <> · {profile.country}</>}
              {profile.sector && <> · {profile.sector}</>}
            </p>
            <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-3">
              Composite of two pillars: capacity (what the NGO can do) and due diligence
              (whether the NGO is safe to fund). The lower pillar drives the overall status.
            </p>
            <div className="grid grid-cols-2 gap-3 mt-4 max-w-md">
              <div className="rounded-md border border-[hsl(var(--border))] p-3 bg-[hsl(var(--kuja-quartz))]">
                <div className="kuja-label">Capacity</div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="kuja-numeric text-lg font-bold">{profile.capacity.score}</span>
                  <StatusPip status={profile.capacity.status} />
                </div>
              </div>
              <div className="rounded-md border border-[hsl(var(--border))] p-3 bg-[hsl(var(--kuja-quartz))]">
                <div className="kuja-label">Due Diligence</div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="kuja-numeric text-lg font-bold">{profile.diligence.score}</span>
                  <StatusPip status={profile.diligence.status} />
                </div>
              </div>
            </div>
            {showActions && onPublishPassport && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onPublishPassport}
                  className="inline-flex items-center gap-2 rounded-md bg-[hsl(var(--kuja-clay))] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[hsl(var(--kuja-clay-dark))] transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Publish Capacity Passport
                </button>
                <span className="text-[11px] text-[hsl(var(--kuja-ink-soft))]">
                  Share a verified snapshot with any donor — no re-doing diligence.
                </span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Capacity pillar */}
      <PillarCard
        title="Capacity Profile"
        subtitle={`${profile.capacity.frameworks_completed} of ${profile.capacity.frameworks_total} frameworks completed · ${profile.capacity.completion_pct}%`}
        score={profile.capacity.score}
        status={profile.capacity.status}
      >
        <div className="pt-3">
          {profile.capacity.breakdown.map((row) => (
            <CapacityRow key={row.framework} row={row} />
          ))}
        </div>
        {(profile.capacity.strengths.length > 0 || profile.capacity.gaps.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 pt-3 border-t border-[hsl(var(--border))]">
            {profile.capacity.strengths.length > 0 && (
              <div>
                <div className="kuja-label">Top strengths</div>
                <ul className="text-xs space-y-1 mt-1.5">
                  {profile.capacity.strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(var(--kuja-grow))] mt-0.5 shrink-0" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {profile.capacity.gaps.length > 0 && (
              <div>
                <div className="kuja-label">Priority gaps</div>
                <ul className="text-xs space-y-1 mt-1.5">
                  {profile.capacity.gaps.map((g, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-[hsl(var(--kuja-sun))] mt-0.5 shrink-0" />
                      <span>{g}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </PillarCard>

      {/* Diligence pillar */}
      <PillarCard
        title="Due Diligence Profile"
        subtitle="Six sub-components: registration · sanctions · PEP · adverse media · bank · ownership"
        score={profile.diligence.score}
        status={profile.diligence.status}
      >
        <div className="pt-3">
          {profile.diligence.breakdown.map((comp) => (
            <DiligenceRow key={comp.key} comp={comp} />
          ))}
        </div>
        {showActions && onRunScreening && (
          <div className="mt-3 pt-3 border-t border-[hsl(var(--border))] flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onRunScreening('adverse_media')}
              className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--border))] px-2.5 py-1 text-xs font-semibold hover:bg-[hsl(var(--kuja-sand-50))]"
            >
              Run adverse media
            </button>
            <button
              type="button"
              onClick={() => onRunScreening('sanctions')}
              className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--border))] px-2.5 py-1 text-xs font-semibold hover:bg-[hsl(var(--kuja-sand-50))]"
            >
              Re-screen sanctions
            </button>
            <button
              type="button"
              onClick={() => onRunScreening('bank')}
              className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--border))] px-2.5 py-1 text-xs font-semibold hover:bg-[hsl(var(--kuja-sand-50))]"
            >
              Verify bank account
            </button>
          </div>
        )}
      </PillarCard>

      <p className="text-[10px] text-[hsl(var(--kuja-ink-soft))] flex items-center gap-1.5">
        <Info className="w-3 h-3" />
        Composite computed {formatAge(overall.computed_at)} from the most recent inputs.
        Click <ExternalLink className="w-3 h-3 inline mb-0.5" /> on each component to drill into the underlying evidence.
      </p>
    </div>
  );
}
