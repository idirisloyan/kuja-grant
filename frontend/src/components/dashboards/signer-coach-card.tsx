'use client';

/**
 * Phase 80 — Signature-pace gentle coaching.
 *
 * Phase 68 ships median + p90 signing pace per window. Phase 80 turns
 * it into personal coaching for the committee member themselves:
 * 'Your last 5 signatures took a median of 8 days. The network target
 * is 6. Anything we can help with?'
 *
 * Tone is coaching, never surveillance. Bad-tone copy is 'no judgement
 * — but the network depends on quick OB decisions in a crisis.'
 *
 * Hidden gracefully when the user is not in a signer role or has
 * nothing to coach on.
 */

import useSWR from 'swr';
import Link from 'next/link';
import {
  ClipboardSignature, Clock, AlertTriangle, Sparkles, ChevronRight,
} from 'lucide-react';
import { api } from '@/lib/api';

interface PendingItem {
  declaration_id: number;
  title?: string | null;
  age_days?: number | null;
  over_target?: boolean;
}

interface SignerCoach {
  success: boolean;
  show: boolean;
  role?: string;
  sample_size?: number;
  my_median_days?: number | null;
  my_p90_days?: number | null;
  target_days?: number;
  tone?: 'good' | 'warn' | 'bad';
  headline?: string;
  hint?: string;
  pending_count?: number;
  pending?: PendingItem[];
}

const TONE_BG: Record<'good' | 'warn' | 'bad', string> = {
  good: 'border-[hsl(var(--kuja-grow))]/30 bg-[hsl(var(--kuja-grow))]/10 text-[hsl(var(--kuja-grow))]',
  warn: 'border-[hsl(var(--kuja-sun))]/30 bg-[hsl(var(--kuja-sun))]/10 text-[hsl(var(--kuja-sun))]',
  bad:  'border-destructive/30 bg-destructive/10 text-destructive',
};

export function SignerCoachCard() {
  const { data, error, isLoading } = useSWR<SignerCoach>(
    '/dashboard/signer-coach',
    (url: string) => api.get<SignerCoach>(url),
  );

  if (isLoading) return <div className="kuja-shimmer h-24 rounded-lg" />;
  if (error || !data || !data.success || !data.show) return null;

  const tone = (data.tone ?? 'good') as 'good' | 'warn' | 'bad';

  return (
    <section className="border border-border rounded-lg bg-card p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <ClipboardSignature className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Your signing pace
        </h2>
        {data.sample_size != null && data.sample_size > 0 && (
          <span className="text-[10px] text-muted-foreground">
            last {data.sample_size} signature{data.sample_size === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {/* Headline + hint — the punchy 'do this next' line. */}
      <div className={`border rounded-md px-3 py-2.5 text-xs flex items-start gap-2 ${TONE_BG[tone]}`}>
        {tone === 'good'
          ? <Sparkles className="w-4 h-4 mt-0.5 shrink-0" />
          : tone === 'warn'
            ? <Clock className="w-4 h-4 mt-0.5 shrink-0" />
            : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{data.headline}</div>
          <div className="mt-0.5 text-foreground/80 leading-relaxed">{data.hint}</div>
        </div>
      </div>

      {/* Stats tiles */}
      {(data.my_median_days != null || data.my_p90_days != null) && (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <Tile label="Median" value={data.my_median_days != null ? `${data.my_median_days}d` : '—'} />
          <Tile label="p90" value={data.my_p90_days != null ? `${data.my_p90_days}d` : '—'} />
          <Tile label="Network target" value={`${data.target_days ?? 6}d`} />
        </div>
      )}

      {/* Pending declarations awaiting this user — direct CTAs */}
      {(data.pending ?? []).length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
            Waiting on your signature
          </div>
          <ul className="space-y-1">
            {(data.pending ?? []).map((p) => (
              <li key={p.declaration_id}>
                <Link
                  href={`/admin/declarations/${p.declaration_id}`}
                  className="flex items-center justify-between gap-2 text-[11px] border border-border rounded-md px-3 py-1.5 hover:bg-muted/30"
                >
                  <span className="truncate font-medium">
                    {p.title || `Declaration #${p.declaration_id}`}
                  </span>
                  <span className="shrink-0 inline-flex items-center gap-1">
                    <span className={`font-mono ${p.over_target ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                      {p.age_days != null ? `${p.age_days}d` : '—'}
                    </span>
                    <ChevronRight className="w-3 h-3 text-muted-foreground" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border rounded-md p-2">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</div>
      <div className="font-semibold text-sm mt-0.5">{value}</div>
    </div>
  );
}
