'use client';

/**
 * TodayBriefing — the "what needs my attention today" hero card.
 *
 * Sits at the top of every role-aware dashboard. Deterministic items
 * sourced from /api/dashboard/today, prioritised by severity + urgency.
 *
 * Each item:
 *   - severity pip (critical / major / minor / info) + icon
 *   - label (e.g. "Report due in 2 days")
 *   - detail (one-line context)
 *   - primary action (CTA → href)
 *
 * Headline tone drives the left-border color (critical = flag red,
 * attention = sun amber, on_track = grow green, opportunity = clay).
 *
 * Empty state: a friendly all-clear message + a single "explore" CTA.
 */

import { useEffect, useState } from 'react';
import {
  AlertTriangle, Clock, Shield, Sparkles, FileText, ClipboardCheck,
  Clipboard, Edit, Newspaper, Award, Compass, ArrowRight, CheckCircle2,
  ListChecks, Loader2,
} from 'lucide-react';
// Sparkles is also used inline in the AI pill below
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types (mirror app/services/today_briefing_service.py)
// ---------------------------------------------------------------------------

type Severity = 'critical' | 'major' | 'minor' | 'info';
type Tone = 'critical' | 'attention' | 'on_track' | 'opportunity';
type ItemKind =
  | 'deadline' | 'review' | 'screening' | 'opportunity'
  | 'compliance' | 'system' | 'profile';

interface BriefingItem {
  kind: ItemKind;
  severity: Severity;
  icon: string;
  label: string;
  detail: string;
  count: number;
  due_in_days: number | null;
  href: string;
  cta_label: string;
}

interface TodayBriefing {
  briefing_date: string;
  role: string;
  headline: string;
  deterministic_headline?: string;
  narration?: string | null;
  tone: Tone;
  items: BriefingItem[];
  computed_at: string;
}

// ---------------------------------------------------------------------------
// Icon map (kept inline so the component is self-contained)
// ---------------------------------------------------------------------------

const ICONS: Record<string, typeof Clock> = {
  'clock': Clock,
  'alert-triangle': AlertTriangle,
  'shield': Shield,
  'sparkle': Sparkles,
  'file-text': FileText,
  'clipboard-check': ClipboardCheck,
  'clipboard': Clipboard,
  'edit': Edit,
  'newspaper': Newspaper,
  'award': Award,
  'compass': Compass,
  'list-checks': ListChecks,
};

function iconFor(name: string) {
  return ICONS[name] ?? ListChecks;
}

// ---------------------------------------------------------------------------
// Severity styling
// ---------------------------------------------------------------------------

const SEV_DOT: Record<Severity, string> = {
  critical: 'bg-[hsl(var(--kuja-flag))]',
  major:    'bg-[hsl(var(--kuja-sun))]',
  minor:    'bg-[hsl(var(--kuja-clay))]',
  info:     'bg-[hsl(var(--kuja-ink-soft))]',
};

const SEV_TEXT: Record<Severity, string> = {
  critical: 'text-[hsl(var(--kuja-flag))]',
  major:    'text-[hsl(var(--kuja-sun))]',
  minor:    'text-[hsl(var(--kuja-clay))]',
  info:     'text-[hsl(var(--kuja-ink-soft))]',
};

const SEV_LABEL: Record<Severity, string> = {
  critical: 'CRITICAL',
  major:    'PRIORITY',
  minor:    'TO DO',
  info:     'FYI',
};

const TONE_BORDER: Record<Tone, string> = {
  critical:    'border-l-[hsl(var(--kuja-flag))]',
  attention:   'border-l-[hsl(var(--kuja-sun))]',
  on_track:    'border-l-[hsl(var(--kuja-grow))]',
  opportunity: 'border-l-[hsl(var(--kuja-clay))]',
};

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function BriefingRow({ item }: { item: BriefingItem }) {
  const Icon = iconFor(item.icon);
  return (
    <a
      href={item.href}
      className="group block px-3 py-2.5 -mx-3 rounded-md hover:bg-[hsl(var(--kuja-sand-50))] transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="pt-0.5 shrink-0 relative">
          <span className={cn('absolute -left-1 top-1 w-1.5 h-1.5 rounded-full', SEV_DOT[item.severity])} aria-hidden />
          <Icon className={cn('w-4 h-4 ml-1.5', SEV_TEXT[item.severity])} aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className={cn('text-[10px] uppercase tracking-wider font-semibold', SEV_TEXT[item.severity])}>
              {SEV_LABEL[item.severity]}
            </span>
            <span className="text-sm font-semibold text-[hsl(var(--kuja-ink))]">
              {item.label}
            </span>
          </div>
          <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-0.5">{item.detail}</p>
        </div>
        <div className="shrink-0 self-center">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[hsl(var(--kuja-clay))] opacity-0 group-hover:opacity-100 transition-opacity">
            {item.cta_label}
            <ArrowRight className="w-3 h-3" />
          </span>
        </div>
      </div>
    </a>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function TodaySkeleton() {
  return (
    <Card className="border-l-4 border-l-[hsl(var(--kuja-clay))] p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-[hsl(var(--kuja-clay))]" />
        <span className="kuja-eyebrow">Today</span>
      </div>
      <div className="kuja-shimmer mt-3 h-6 w-3/4 rounded" />
      <div className="kuja-shimmer mt-3 h-12 w-full rounded" />
      <div className="kuja-shimmer mt-2 h-12 w-full rounded" />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function AllClear({ headline, exploreHref }: { headline: string; exploreHref: string }) {
  return (
    <Card className="border-l-4 border-l-[hsl(var(--kuja-grow))] p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="w-6 h-6 text-[hsl(var(--kuja-grow))] shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="kuja-eyebrow">Today, all clear</div>
          <h2 className="kuja-display text-xl mt-1">{headline}</h2>
          <a
            href={exploreHref}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-sm font-semibold hover:bg-[hsl(var(--kuja-sand-50))]"
          >
            Explore
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const EXPLORE_HREF: Record<string, string> = {
  ngo:      '/grants',
  donor:    '/grants',
  reviewer: '/reviews',
  admin:    '/observability',
};

export function TodayBriefing({ exploreHrefOverride }: { exploreHrefOverride?: string } = {}) {
  const [data, setData] = useState<TodayBriefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<TodayBriefing>('/api/dashboard/today')
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError((e as Error).message); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <TodaySkeleton />;
  if (error) {
    return (
      <Card className="border-l-4 border-l-[hsl(var(--kuja-ink-soft))] p-4">
        <div className="kuja-eyebrow">Today</div>
        <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-1">Briefing unavailable: {error}</p>
      </Card>
    );
  }
  if (!data) return null;

  const explore = exploreHrefOverride ?? EXPLORE_HREF[data.role] ?? '/dashboard';
  if (data.items.length === 0) {
    return <AllClear headline={data.headline} exploreHref={explore} />;
  }

  return (
    <Card className={cn('border-l-4 p-4 sm:p-5', TONE_BORDER[data.tone] ?? TONE_BORDER.opportunity)}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="kuja-eyebrow flex items-center gap-1.5">
            <span>Today, {new Date(data.briefing_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
            {data.narration && (
              <span className="kuja-ai-pill text-[9px]" title="AI-synthesised">
                <Sparkles className="w-2.5 h-2.5" /> Briefed
              </span>
            )}
          </div>
          <h2 className="kuja-display text-xl mt-1 text-balance">{data.headline}</h2>
          {data.narration && (
            <p className="mt-1.5 text-sm text-[hsl(var(--kuja-ink-soft))] leading-relaxed">{data.narration}</p>
          )}
        </div>
        <span className="text-[10px] uppercase tracking-wider font-semibold text-[hsl(var(--kuja-ink-soft))] mt-1">
          {data.items.length} item{data.items.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="mt-3 divide-y divide-[hsl(var(--border))]">
        {data.items.map((item, i) => (
          <BriefingRow key={i} item={item} />
        ))}
      </div>
    </Card>
  );
}
