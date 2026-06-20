'use client';

/**
 * Trust Profile — Registration & Registry section.
 *
 * Folds the standalone /verification page into the Trust Profile so
 * the team has one canonical view of the org's trust posture
 * (sanctions + adverse media + registration + bank + capacity +
 * COI) — they kept asking "why is registration check separate from
 * trust profile?" and the honest answer is that it was built in two
 * phases and the UI never caught up to the service.
 *
 * This panel surfaces the latest registry verification + identity
 * basics + a deep link to /verification for the full workflow. Heavy
 * registry interactions (running a new check, browsing all history,
 * exploring AI evidence) still live on /verification — only the
 * summary is hoisted into /trust.
 */

import useSWR from 'swr';
import Link from 'next/link';
import { api } from '@/lib/api';
import { AIConfidenceBadge, confidenceFromScore } from '@/components/shared/ai-confidence-badge';

const fetcher = <T,>(url: string): Promise<T> => api.get<T>(url);
import {
  Building2, ShieldCheck, ShieldAlert, ExternalLink, Globe,
  ClipboardCheck, MapPin, ChevronRight, Loader2,
} from 'lucide-react';

interface Registry {
  authority: string | null;
  url: string | null;
  search_url: string | null;
  expected_format: string | null;
  notes: string | null;
}

interface RegistrationResponse {
  success: boolean;
  organization?: {
    id: number;
    name: string;
    country: string | null;
    sector: string | null;
    registration_number: string | null;
    overall_status?: string;
    overall_confidence?: number | null;
  };
  verifications?: Array<{
    id: number;
    status: string;
    verification_status?: string;
    ai_confidence: number | null;
    notes: string | null;
    registry_url: string | null;
    updated_at: string;
    ai_analysis?: { findings?: unknown[]; rationale?: string };
  }>;
  registry?: Registry | null;
  overall_status?: string;
}

export function RegistrationPanel({ orgId }: { orgId: number }) {
  const { data, isLoading } = useSWR<RegistrationResponse>(
    `/verification/${orgId}`,
    fetcher,
  );

  if (isLoading) {
    return (
      <div className="border border-border rounded-lg bg-card p-5">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading registration check…</span>
        </div>
      </div>
    );
  }

  if (!data?.success) {
    return null;
  }

  const org = data.organization;
  const latest = (data.verifications && data.verifications[0]) || null;
  const registry = data.registry;
  const overallStatus = (latest?.verification_status || latest?.status || data.overall_status || 'pending') as string;

  // Tone driven by status
  const toneCfg = (() => {
    if (overallStatus === 'verified' || overallStatus === 'clear') {
      return { icon: ShieldCheck, color: 'text-[hsl(var(--kuja-grow))]', bg: 'bg-[hsl(var(--kuja-grow))]/10', border: 'border-[hsl(var(--kuja-grow))]/30', label: 'Registry verified' };
    }
    if (overallStatus === 'flagged' || overallStatus === 'rejected') {
      return { icon: ShieldAlert, color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/30', label: 'Registry flagged' };
    }
    if (overallStatus === 'pending' || overallStatus === 'unverified') {
      return { icon: ClipboardCheck, color: 'text-muted-foreground', bg: 'bg-muted/40', border: 'border-border', label: 'Registry check not run' };
    }
    return { icon: ClipboardCheck, color: 'text-[hsl(var(--kuja-sun))]', bg: 'bg-[hsl(var(--kuja-sun))]/10', border: 'border-[hsl(var(--kuja-sun))]/30', label: 'Registry needs follow-up' };
  })();
  const ToneIcon = toneCfg.icon;

  return (
    <div className="border border-border rounded-lg bg-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <div className={`grid h-10 w-10 place-items-center rounded-md ${toneCfg.bg} ${toneCfg.color} shrink-0`}>
            <Building2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="kuja-eyebrow text-[10px]">Pillar 1 of Trust</h2>
            <h3 className="font-semibold text-base">Identity &amp; registration</h3>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
              Government registry check + identity basics for {org?.name ?? 'this organisation'}.
              All trust checks consolidated here — sanctions, adverse media, bank verification, COI,
              and capacity follow below.
            </p>
          </div>
        </div>
        <Link
          href={`/verification?org=${orgId}`}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          Full registry workflow <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Identity basics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Country</div>
          <div className="font-medium flex items-center gap-1 mt-0.5">
            <MapPin className="w-3 h-3 text-muted-foreground" />
            {org?.country ?? '—'}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Sector</div>
          <div className="font-medium mt-0.5">{org?.sector ?? '—'}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Registration #</div>
          <div className="font-mono text-[11px] mt-0.5 break-all">
            {org?.registration_number ?? <span className="text-muted-foreground italic">not on file</span>}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Registry authority</div>
          <div className="font-medium mt-0.5 truncate" title={registry?.authority ?? undefined}>
            {registry?.authority ?? <span className="text-muted-foreground italic">not configured</span>}
          </div>
        </div>
      </div>

      {/* Latest verification banner */}
      <div className={`border rounded-md p-3 ${toneCfg.bg} ${toneCfg.border}`}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2 min-w-0">
            <ToneIcon className={`w-4 h-4 mt-0.5 shrink-0 ${toneCfg.color}`} />
            <div className="min-w-0">
              <div className={`text-sm font-semibold ${toneCfg.color}`}>{toneCfg.label}</div>
              {latest ? (
                <div className="text-xs text-muted-foreground mt-0.5">
                  Last checked {new Date(latest.updated_at).toLocaleDateString()}
                  {latest.ai_confidence != null && (
                    <> · <AIConfidenceBadge
                      confidence={confidenceFromScore(latest.ai_confidence)}
                      variant="inline"
                      title={`AI confidence on registration verification: ${Math.round(latest.ai_confidence)}%.`}
                    /></>
                  )}
                  {latest.ai_analysis?.findings && latest.ai_analysis.findings.length > 0 && (
                    <> · {latest.ai_analysis.findings.length} finding(s)</>
                  )}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground mt-0.5">
                  No verification on file. Run one from the full registry workflow.
                </div>
              )}
              {latest?.notes && (
                <div className="text-xs text-muted-foreground italic mt-1 line-clamp-2">&ldquo;{latest.notes}&rdquo;</div>
              )}
            </div>
          </div>
          {latest?.registry_url && (
            <a
              href={latest.registry_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[hsl(var(--kuja-clay))] hover:underline inline-flex items-center gap-1 shrink-0"
            >
              Open registry record <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {/* Registry meta — quick reference for the OB so they don't have
          to leave the page to know which authority to query. */}
      {registry?.authority && (
        <div className="text-[11px] text-muted-foreground space-y-1 border-t border-border pt-3">
          {registry.url && (
            <div className="flex items-center gap-1">
              <Globe className="w-3 h-3" />
              <a
                href={registry.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[hsl(var(--kuja-clay))] hover:underline truncate"
              >
                {registry.url}
              </a>
            </div>
          )}
          {registry.expected_format && (
            <div>Expected number format: <code className="font-mono">{registry.expected_format}</code></div>
          )}
          {registry.notes && <div className="italic">{registry.notes}</div>}
        </div>
      )}
    </div>
  );
}
