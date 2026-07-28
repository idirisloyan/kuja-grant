'use client';

/**
 * Cross-entity Calendar page — Phase 3.
 *
 * One screen, every deadline the current user needs to track. Donor
 * sees their grants closing + grantee reports due + grantee registration
 * expiries. NGO sees open grants + own report due dates + passport expiry.
 *
 * Two views:
 *   - Upcoming list (default) — grouped by week, sorted ascending
 *   - Month grid — calendar view of the next 30 days
 *
 * Each event has a severity color, an entity-kind icon, and a drill link.
 */

import { useEffect, useMemo, useState } from 'react';
import { PageShell, PageHeader, PageMain } from '@/components/layout/page-shell';
import {
  Calendar as CalendarIcon, Clock, Briefcase, ShieldCheck, Award,
  ArrowRight, ChevronLeft, ChevronRight, Download,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/hooks/use-translation';

type EventKind =
  | 'grant_deadline' | 'report_due' | 'registration_expiry'
  | 'passport_expiry' | 'screening_due';

interface CalendarEvent {
  date: string;
  kind: EventKind;
  severity: 'high' | 'medium' | 'low';
  label: string;
  detail: string;
  href: string;
  entity_id?: number;
}

interface CalendarResponse {
  success: boolean;
  window_start: string;
  window_end: string;
  today: string;
  events: CalendarEvent[];
}

const KIND_META: Record<EventKind, { label: string; icon: typeof Clock; color: string }> = {
  grant_deadline:       { label: 'calendar.kind_grant_deadline',      icon: Briefcase,   color: 'text-[hsl(var(--kuja-clay))]' },
  report_due:           { label: 'calendar.kind_report_due',          icon: Clock,       color: 'text-[hsl(var(--kuja-sun))]' },
  registration_expiry:  { label: 'calendar.kind_registration_expiry', icon: ShieldCheck, color: 'text-[hsl(var(--kuja-flag))]' },
  passport_expiry:      { label: 'calendar.kind_passport_expiry',     icon: Award,       color: 'text-[hsl(var(--kuja-spark))]' },
  screening_due:        { label: 'calendar.kind_screening_due',       icon: ShieldCheck, color: 'text-[hsl(var(--kuja-ink-soft))]' },
};

const SEV_DOT: Record<string, string> = {
  high:   'bg-[hsl(var(--kuja-flag))]',
  medium: 'bg-[hsl(var(--kuja-sun))]',
  low:    'bg-[hsl(var(--kuja-ink-soft))]',
};

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function startOfWeek(d: Date): Date {
  const day = d.getDay();      // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day;   // ISO: Mon-start
  const x = new Date(d); x.setDate(d.getDate() + diff); x.setHours(0,0,0,0);
  return x;
}

function weekKey(iso: string): string {
  const monday = startOfWeek(new Date(iso));
  return monday.toISOString().slice(0, 10);
}

function EventRow({ ev }: { ev: CalendarEvent }) {
  const { t } = useTranslation();
  const meta = KIND_META[ev.kind] ?? KIND_META.report_due;
  const Icon = meta.icon;
  return (
    <a
      href={ev.href}
      className="flex items-start gap-3 px-3 py-2 -mx-3 rounded-md hover:bg-[hsl(var(--kuja-sand-50))] transition-colors"
    >
      <div className="pt-0.5 shrink-0 relative">
        <span className={cn('absolute -left-1 top-1.5 w-1.5 h-1.5 rounded-full', SEV_DOT[ev.severity])} aria-hidden />
        <Icon className={cn('w-4 h-4 ml-1.5', meta.color)} aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-wider font-semibold text-[hsl(var(--kuja-ink-soft))]">
            {formatDay(ev.date)}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-[hsl(var(--kuja-ink-soft))]">
            {t(meta.label)}
          </span>
        </div>
        <div className="text-sm font-semibold text-[hsl(var(--kuja-ink))]">{ev.label}</div>
        {ev.detail && <div className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-0.5">{ev.detail}</div>}
      </div>
      <ArrowRight className="w-3 h-3 text-[hsl(var(--kuja-ink-soft))] mt-1 shrink-0 opacity-60" aria-hidden />
    </a>
  );
}

function UpcomingView({ events }: { events: CalendarEvent[] }) {
  const { t } = useTranslation();
  const groups = useMemo(() => {
    const byWeek = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const wk = weekKey(ev.date);
      if (!byWeek.has(wk)) byWeek.set(wk, []);
      byWeek.get(wk)!.push(ev);
    }
    return Array.from(byWeek.entries()).sort(([a], [b]) => a < b ? -1 : 1);
  }, [events]);

  if (events.length === 0) {
    return (
      <Card className="p-8 text-center">
        <CalendarIcon className="w-10 h-10 mx-auto text-[hsl(var(--kuja-ink-soft))]" />
        <p className="kuja-display text-lg mt-2">{t('calendar.empty_title')}</p>
        <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-1">
          {t('calendar.empty_hint')} <code>?days=180</code>.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(([wk, items]) => {
        const monday = new Date(wk);
        const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
        return (
          <Card key={wk} className="p-4">
            <div className="kuja-eyebrow mb-2">
              {t('calendar.week_of', {
                start: monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                end: sunday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
              })}
              <span className="ml-2 text-[hsl(var(--kuja-ink-soft))]">
                {items.length === 1
                  ? t('calendar.event_count_one', { n: items.length })
                  : t('calendar.event_count_other', { n: items.length })}
              </span>
            </div>
            <div className="divide-y divide-[hsl(var(--border))]">
              {items.map((ev, i) => <EventRow key={i} ev={ev} />)}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function MonthView({ events, monthOffset, onShift }: {
  events: CalendarEvent[];
  monthOffset: number;
  onShift: (delta: number) => void;
}) {
  const { t } = useTranslation();
  const today = new Date();
  const cursor = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const startGrid = startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  const cells: { date: Date; inMonth: boolean; events: CalendarEvent[] }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(startGrid); d.setDate(startGrid.getDate() + i);
    const dayEvents = events.filter(ev => ev.date === d.toISOString().slice(0, 10));
    cells.push({
      date: d,
      inMonth: d.getMonth() === cursor.getMonth(),
      events: dayEvents,
    });
  }

  const todayIso = today.toISOString().slice(0, 10);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold">{monthLabel}</h3>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onShift(-1)} className="p-1 rounded hover:bg-[hsl(var(--kuja-sand-50))]" aria-label={t('calendar.previous_month')}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => onShift(0)} className="px-2 text-xs font-semibold hover:bg-[hsl(var(--kuja-sand-50))] rounded">{t('calendar.today')}</button>
          <button type="button" onClick={() => onShift(1)} className="p-1 rounded hover:bg-[hsl(var(--kuja-sand-50))]" aria-label={t('calendar.next_month')}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px bg-[hsl(var(--border))] rounded-md overflow-hidden text-xs">
        {(['mon','tue','wed','thu','fri','sat','sun'] as const).map(d => (
          <div key={d} className="bg-[hsl(var(--kuja-quartz))] py-1.5 text-center font-semibold text-[hsl(var(--kuja-ink-soft))]">{t(`calendar.weekday_${d}`)}</div>
        ))}
        {cells.map((c, i) => {
          const iso = c.date.toISOString().slice(0,10);
          const isToday = iso === todayIso;
          return (
            <div
              key={i}
              className={cn(
                'bg-background min-h-[78px] p-1.5 flex flex-col gap-0.5',
                !c.inMonth && 'opacity-40',
                isToday && 'ring-2 ring-inset ring-[hsl(var(--kuja-clay))]',
              )}
            >
              <div className={cn(
                'text-[10px] font-semibold',
                isToday ? 'text-[hsl(var(--kuja-clay))]' : 'text-[hsl(var(--kuja-ink-soft))]',
              )}>{c.date.getDate()}</div>
              {c.events.slice(0, 3).map((ev, j) => (
                <a
                  key={j}
                  href={ev.href}
                  className={cn(
                    'block text-[10px] truncate rounded px-1 py-0.5 hover:opacity-80',
                    ev.severity === 'high' && 'bg-[hsl(var(--kuja-flag)/0.1)] text-[hsl(var(--kuja-flag))]',
                    ev.severity === 'medium' && 'bg-[hsl(var(--kuja-sun)/0.1)] text-[hsl(var(--kuja-sun))]',
                    ev.severity === 'low' && 'bg-[hsl(var(--kuja-ink-soft)/0.1)] text-[hsl(var(--kuja-ink-soft))]',
                  )}
                  title={`${ev.label} — ${ev.detail}`}
                >
                  {ev.label}
                </a>
              ))}
              {c.events.length > 3 && (
                <div className="text-[10px] text-[hsl(var(--kuja-ink-soft))]">{t('calendar.more_count', { n: c.events.length - 3 })}</div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default function CalendarPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'upcoming' | 'month'>('upcoming');
  const [monthOffset, setMonthOffset] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.get<CalendarResponse>('/api/calendar/deadlines?days=120&past=7')
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const events = data?.events ?? [];
  const highCount = events.filter(e => e.severity === 'high').length;

  return (
    <div className="max-w-6xl mx-auto">
      <PageShell>
        <PageHeader
          title={t('calendar.page_title')}
          icon={CalendarIcon}
          subtitle={t('calendar.page_subtitle')}
          primaryAction={
            <div className="flex items-center gap-3 flex-wrap">
              {highCount > 0 && (
                <Badge variant="outline" className="border-[hsl(var(--kuja-flag))] text-[hsl(var(--kuja-flag))]">
                  {t('calendar.urgent_count', { n: highCount })}
                </Badge>
              )}
              <a
                href="/api/calendar/deadlines.pdf?days=120&past=7"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-xs font-semibold text-[hsl(var(--kuja-ink))] hover:bg-[hsl(var(--kuja-sand-50))]"
              >
                <Download className="w-3.5 h-3.5" /> {t('calendar.export_pdf')}
              </a>
              {/* Phase 127 — iCalendar (.ics) download. Subscribe in Google
                  Calendar / Outlook / Apple Calendar to see deadlines
                  alongside the rest of your week. */}
              <a
                href="/api/calendar/deadlines.ics?days=180&past=30"
                download
                className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-xs font-semibold text-[hsl(var(--kuja-ink))] hover:bg-[hsl(var(--kuja-sand-50))]"
                title={t('calendar.calendar_feed_hint')}
              >
                <Download className="w-3.5 h-3.5" /> {t('calendar.calendar_feed')}
              </a>
              <div className="inline-flex rounded-md border border-[hsl(var(--border))] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setView('upcoming')}
                  className={cn(
                    'px-3 py-1.5 text-sm font-semibold',
                    view === 'upcoming' ? 'bg-[hsl(var(--kuja-clay))] text-white' : 'hover:bg-[hsl(var(--kuja-sand-50))]',
                  )}
                  aria-pressed={view === 'upcoming'}
                >{t('calendar.view_upcoming')}</button>
                <button
                  type="button"
                  onClick={() => setView('month')}
                  className={cn(
                    'px-3 py-1.5 text-sm font-semibold border-l border-[hsl(var(--border))]',
                    view === 'month' ? 'bg-[hsl(var(--kuja-clay))] text-white' : 'hover:bg-[hsl(var(--kuja-sand-50))]',
                  )}
                  aria-pressed={view === 'month'}
                >{t('calendar.view_month')}</button>
              </div>
            </div>
          }
        />
        <PageMain>
          {view === 'upcoming' ? (
            <UpcomingView events={events} />
          ) : (
            <MonthView events={events} monthOffset={monthOffset} onShift={(d) => setMonthOffset(d === 0 ? 0 : monthOffset + d)} />
          )}
        </PageMain>
      </PageShell>
    </div>
  );
}
