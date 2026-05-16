'use client';

/**
 * Chart card wrapper with an AI-narrated insight caption.
 * Hosts any Recharts component passed as children.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { fetchInsightCaption } from '@/lib/copilot-api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useUIStore } from '@/stores/ui-store';
import { cn } from '@/lib/utils';
import { Sparkles, RefreshCcw, SignalLow } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Props {
  title: ReactNode;
  subtitle?: string;
  icon?: LucideIcon;
  children: ReactNode;
  // AI narration inputs — if provided, renders an AI caption below.
  caption?: {
    chartType: string;
    data: unknown;
    context?: string;
  };
  className?: string;
}

export function ChartCard({
  title, subtitle, icon: Icon, children, caption, className,
}: Props) {
  const { t } = useTranslation();
  // Phase 11 — low-bandwidth mode defers auto-fetch of AI captions.
  // The user still gets the chart; they just have to opt-in to the AI
  // narration via the refresh button (which counts as an explicit request
  // and overrides the gate).
  const lowBandwidth = useUIStore((s) => s.lowBandwidth);
  const [loading, setLoading] = useState(!!caption && !lowBandwidth);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [userRequested, setUserRequested] = useState(false);

  useEffect(() => {
    if (!caption) return;
    // Honor low-bandwidth UNLESS the user explicitly tapped the refresh
    // button (which sets userRequested + bumps refreshTick).
    if (lowBandwidth && !userRequested) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchInsightCaption({
      chart_type: caption.chartType,
      data: caption.data,
      context: caption.context,
    }).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setText(res.data.caption);
      } else {
        setError(true);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caption?.chartType, JSON.stringify(caption?.data ?? {}), refreshTick, lowBandwidth, userRequested]);

  return (
    <div className={cn('kuja-chart-card', className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
          {title}
        </div>
        {caption && !loading && (
          <button
            type="button"
            onClick={() => { setUserRequested(true); setRefreshTick((t) => t + 1); }}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            aria-label={t('chart.refresh_caption_aria')}
            title={lowBandwidth && !text ? 'Low-bandwidth mode — click to fetch AI caption' : undefined}
          >
            <RefreshCcw className="h-3 w-3" />
          </button>
        )}
      </div>
      {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      {/* Chart viewport — SizedChart children provide their own sized
          <div>, so ChartCard just needs a min-width:0 flex/grid child. */}
      <div className="mt-3 w-full min-w-0">
        {children}
      </div>
      {caption && (
        <div className={cn('kuja-chart-caption', (loading || error) && 'kuja-chart-caption-loading')}>
          {loading && (
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 animate-pulse" />
              {t('chart.ai_reading')}
            </span>
          )}
          {!loading && error && (
            <span className="text-xs">{t('chart.ai_caption_unavailable')}</span>
          )}
          {/* Phase 11 — low-bandwidth deferred state. Caption isn't fetched
              automatically; user can tap the refresh icon to load it. */}
          {!loading && !error && !text && lowBandwidth && !userRequested && (
            <span className="inline-flex items-center gap-1.5 text-xs text-[hsl(var(--kuja-sun))]">
              <SignalLow className="h-3.5 w-3.5" />
              AI caption deferred — low-bandwidth mode. Tap the refresh icon to fetch.
            </span>
          )}
          {!loading && !error && text && (
            <>
              <div className="kuja-ai-mark mb-1">
                <Sparkles className="h-3 w-3" /> {t('chart.ai_insight')}
              </div>
              <div>{text}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
