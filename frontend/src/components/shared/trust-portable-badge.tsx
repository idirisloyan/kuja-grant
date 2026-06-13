'use client';

/**
 * Phase 77 — Trust-portable assessment badge.
 *
 * The structural moat made visible to the NGO. Today, the canonical
 * Trust Profile exists but is invisible UX-wise — the NGO doesn't
 * realise that one assessment serves every donor on the platform.
 *
 * This badge surfaces it everywhere relevant: capacity assessment,
 * apply, dashboard. The message: "Submitted once, visible to every
 * donor. You don't fill out 12 different questionnaires anymore."
 *
 * The data is read from /api/trust-profile/<orgId>. Renders nothing
 * if the org has no profile yet (no false moat signalling).
 */

import useSWR from 'swr';
import Link from 'next/link';
import {
  ShieldCheck, Sparkles, ChevronRight, AlertCircle, Globe2,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';

interface TrustProfile {
  org_id?: number;
  org_name?: string;
  overall_score?: number;
  // Pillars
  capacity?: { overall_score?: number; framework?: string; last_completed_at?: string };
  compliance?: { last_screened_at?: string; sanctions_clear?: boolean; registration_status?: string };
  last_refreshed?: string;
}

interface TrustProfileResp {
  success: boolean;
  profile?: TrustProfile;
  error?: string;
}

interface Props {
  /** Optional explicit org id; falls back to the logged-in user's org */
  orgId?: number;
  /** Compact vs full layout */
  variant?: 'compact' | 'full';
  className?: string;
}

function fmt(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString();
  } catch { return dateStr; }
}

export function TrustPortableBadge({ orgId, variant = 'full', className = '' }: Props) {
  const user = useAuthStore((s) => s.user);
  const id = orgId ?? user?.org_id;

  const { data, isLoading } = useSWR<TrustProfileResp>(
    id ? `/trust-profile/${id}` : null,
    (url: string) => api.get<TrustProfileResp>(url),
  );

  if (isLoading || !data || !data.success || !data.profile || !id) return null;

  const p = data.profile;
  const score = p.overall_score ?? p.capacity?.overall_score ?? null;
  const framework = p.capacity?.framework;
  const refreshed = p.last_refreshed ?? p.capacity?.last_completed_at;

  // Compact pill — small inline badge for apply pages / nav strips
  if (variant === 'compact') {
    return (
      <Link
        href={`/trust`}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-colors hover:bg-[hsl(var(--kuja-spark-soft))] ${
          score != null && score >= 75
            ? 'border-[hsl(var(--kuja-grow))]/40 bg-[hsl(var(--kuja-grow))]/10 text-[hsl(var(--kuja-grow))]'
            : 'border-border text-foreground'
        } ${className}`}
        title="Your Trust Profile travels with every grant application you submit. Every donor on Kuja sees the same evidence."
      >
        <ShieldCheck className="w-3 h-3" />
        Trust Profile
        {score != null && <span className="kuja-numeric">· {Math.round(score)}/100</span>}
      </Link>
    );
  }

  // Full panel — used on /assessments + dashboard
  return (
    <section className={`border border-[hsl(var(--kuja-spark))]/30 bg-gradient-to-br from-[hsl(var(--kuja-spark-soft))] to-card rounded-lg p-4 space-y-3 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-[hsl(var(--kuja-spark))]/15 p-2 shrink-0">
          <Globe2 className="w-4 h-4 text-[hsl(var(--kuja-spark))]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm">Your Trust Profile</h3>
            <span className="text-[10px] uppercase tracking-wide font-semibold rounded-full bg-[hsl(var(--kuja-spark))]/15 text-[hsl(var(--kuja-spark))] px-2 py-0.5">
              <Sparkles className="inline w-2.5 h-2.5 mr-0.5" /> Travels with you
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            <strong className="text-foreground">Submit once, visible to every donor on Kuja.</strong>{' '}
            No more filling out 12 different donor questionnaires — your assessment,
            sanctions screening, and registration verification all live here as a single
            Trust Profile that gets attached to every application.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <Tile
          label="Overall trust"
          value={score != null ? `${Math.round(score)}/100` : '—'}
          tone={score != null && score >= 75 ? 'good' : score != null && score >= 60 ? 'warn' : 'muted'}
        />
        <Tile
          label="Framework"
          value={framework ? framework.toUpperCase() : '—'}
          tone="muted"
        />
        <Tile
          label="Last refreshed"
          value={fmt(refreshed)}
          tone="muted"
        />
        <Tile
          label="Sanctions"
          value={p.compliance?.sanctions_clear === true ? 'Clear' : p.compliance?.sanctions_clear === false ? 'Flagged' : '—'}
          tone={p.compliance?.sanctions_clear === true ? 'good' : p.compliance?.sanctions_clear === false ? 'bad' : 'muted'}
        />
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <p className="text-[11px] text-muted-foreground">
          Improving your Trust Profile improves your grant approval rate across every donor.
        </p>
        <Link
          href="/trust"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[hsl(var(--kuja-spark))] hover:underline"
        >
          Open Trust Profile <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
    </section>
  );
}

function Tile({ label, value, tone }: {
  label: string;
  value: string;
  tone: 'good' | 'warn' | 'bad' | 'muted';
}) {
  const cls = tone === 'good'
    ? 'border-[hsl(var(--kuja-grow))]/30 bg-[hsl(var(--kuja-grow))]/10 text-[hsl(var(--kuja-grow))]'
    : tone === 'warn'
      ? 'border-[hsl(var(--kuja-sun))]/30 bg-[hsl(var(--kuja-sun))]/10 text-[hsl(var(--kuja-sun))]'
      : tone === 'bad'
        ? 'border-destructive/30 bg-destructive/10 text-destructive'
        : 'border-border text-foreground';
  return (
    <div className={`border rounded-md p-2 ${cls}`}>
      <div className="text-[9px] uppercase tracking-wide opacity-70 font-semibold">{label}</div>
      <div className="font-semibold text-sm mt-0.5">{value}</div>
    </div>
  );
}
