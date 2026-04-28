'use client';

import { useState, useMemo, useCallback } from 'react';
import { Sparkles } from 'lucide-react';
import { useVerifications, useRegistries } from '@/lib/hooks/use-api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/shared/status-badge';
import { AiBadge } from '@/components/shared/ai-badge';
import { ComplianceState, type ComplianceStateKind } from '@/components/shared/compliance-state';
import { useFlag } from '@/lib/hooks/use-feature-flags';
import {
  ShieldCheck, AlertTriangle, Clock, Eye, Search, RefreshCw,
  ChevronDown, ChevronRight, Loader2, CheckCircle, XCircle, Cpu,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RegistrationVerification } from '@/lib/types';

function confidenceCls(c: number | null | undefined): string {
  if (c == null) return 'text-muted-foreground';
  if (c >= 80) return 'text-[hsl(var(--kuja-grow))]';
  if (c >= 60) return 'text-[hsl(var(--kuja-sun))]';
  return 'text-[hsl(var(--kuja-flag))]';
}

function confidenceBar(c: number | null | undefined): string {
  if (c == null) return 'bg-muted';
  if (c >= 80) return 'bg-[hsl(var(--kuja-grow))]';
  if (c >= 60) return 'bg-[hsl(var(--kuja-sun))]';
  return 'bg-[hsl(var(--kuja-flag))]';
}

interface ComplianceExplanation {
  headline: string;
  confidence_band: 'high' | 'medium' | 'low';
  what_we_know: string[];
  gaps: string[];
  recommended_actions: { title: string; why: string; urgency: 'now' | 'soon' | 'fyi' }[];
  source: string;
}

// Phase 10.7 — map a verification record onto the 4-state compliance taxonomy.
// Returns one of clear / confirmed / likely / missing / followup so the
// shared ComplianceState primitive can render a consistent pill across
// every compliance surface.
function mapToComplianceState(
  v: RegistrationVerification & { verification_status?: string },
): { state: ComplianceStateKind; detail?: string } {
  const status = (v.verification_status ?? v.status ?? 'unverified') as string;
  const conf = (v as unknown as { ai_confidence?: number | null }).ai_confidence;
  const a = v.ai_analysis as Record<string, unknown> | null;
  const findingsCount = (a?.findings as unknown[] | undefined)?.length ?? 0;

  if (status === 'verified' && (conf == null || conf >= 80)) {
    return { state: 'clear', detail: 'Registry confirmed; no findings.' };
  }
  if (status === 'flagged' || (conf != null && conf < 50 && findingsCount > 0)) {
    return { state: 'confirmed', detail: 'Findings indicate ineligibility — escalate.' };
  }
  if (findingsCount > 0 && (conf == null || conf < 70)) {
    return { state: 'likely', detail: `${findingsCount} finding(s); high confidence pattern.` };
  }
  if (status === 'pending' || status === 'unverified' || !conf) {
    return { state: 'missing', detail: 'Registry check not yet run or returned no data.' };
  }
  return { state: 'followup', detail: 'Auto-check passed; manual eyes recommended.' };
}

/**
 * ComplianceListPill — Phase 10.7
 *
 * Renders the 4-state taxonomy pill in a verification list row when the
 * ui.compliance_4state flag is on. Falls back to the legacy StatusBadge
 * so the list never shows blank. The team's Apr 28 retest correctly
 * pointed out that the taxonomy was buried in the expanded detail —
 * this surfaces it where reviewers actually scan.
 */
function ComplianceListPill({
  verification,
}: { verification: RegistrationVerification }) {
  const { enabled } = useFlag('ui.compliance_4state');
  if (!enabled) {
    return <StatusBadge status={verification.status} />;
  }
  const { state } = mapToComplianceState(verification);
  return <ComplianceState state={state} variant="pill" />;
}

/**
 * FourStateStatRow — Phase 10.7
 *
 * Top-of-page stat row in the 4-state vocabulary so donors triaging
 * compliance posture see "12 confirmed / 5 likely / 7 missing /
 * 3 follow-up" in one glance. Renders only when the flag is on.
 */
function FourStateStatRow({
  counts,
}: { counts: Record<ComplianceStateKind, number> }) {
  const { enabled } = useFlag('ui.compliance_4state');
  if (!enabled) return null;
  const cells: Array<{ kind: ComplianceStateKind; total: number }> = [
    { kind: 'clear',     total: counts.clear },
    { kind: 'confirmed', total: counts.confirmed },
    { kind: 'likely',    total: counts.likely },
    { kind: 'missing',   total: counts.missing },
    { kind: 'followup',  total: counts.followup },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cells.map(({ kind, total }) => (
        <div
          key={kind}
          className="rounded-xl border border-border bg-background p-4 flex flex-col gap-2"
        >
          <ComplianceState state={kind} variant="pill" />
          <div className="kuja-numeric text-3xl font-bold tabular-nums">{total}</div>
        </div>
      ))}
    </div>
  );
}

function VerificationDetail({ verification }: { verification: RegistrationVerification }) {
  const { t, formatDate } = useTranslation();
  const { enabled: fourStateEnabled } = useFlag('ui.compliance_4state');
  const a = verification.ai_analysis as Record<string, unknown> | null;
  const findings = a?.findings as string[] | undefined;
  const recommendations = a?.recommendations as string[] | undefined;
  const registryResult = verification.registry_check_result as Record<string, unknown> | null;
  const orgId = (verification as unknown as { org_id?: number }).org_id;
  const fourState = fourStateEnabled ? mapToComplianceState(verification) : null;

  // Compliance co-pilot — on-demand plain-language explanation of the
  // verification + sanctions findings with concrete follow-up actions.
  const [explanation, setExplanation] = useState<ComplianceExplanation | null>(null);
  const [loadingExpl, setLoadingExpl] = useState(false);
  const [explError, setExplError] = useState<string | null>(null);

  const fetchExplanation = useCallback(async () => {
    if (!orgId) return;
    setLoadingExpl(true); setExplError(null);
    try {
      const res = await api.post<{ success: boolean } & ComplianceExplanation>(
        '/ai/compliance-explain', { org_id: orgId },
      );
      if (res.success) setExplanation(res);
      else setExplError('AI explanation unavailable');
    } catch (e) {
      setExplError(e instanceof Error ? e.message : 'AI explanation failed');
    } finally {
      setLoadingExpl(false);
    }
  }, [orgId]);

  return (
    <div className="px-5 py-4 bg-muted/30 border-t border-border space-y-4">
      {/* Phase 10.7 — 4-state compliance taxonomy pill at the top of
          each verification detail. Renders only when ui.compliance_4state
          is on; gives donor/admin a consistent vocabulary across surfaces:
          clear / confirmed / likely / missing / followup. */}
      {fourState && (
        <ComplianceState state={fourState.state} detail={fourState.detail} variant="row" />
      )}
      {/* Compliance co-pilot panel — prominent because this is the highest
          decision-relevance signal a donor needs from this row. */}
      <div className="rounded-xl border border-[hsl(var(--kuja-spark-soft))] bg-[hsl(var(--kuja-spark-soft))]/40 p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Sparkles className="h-4 w-4 text-[hsl(var(--kuja-spark))]" />
            <span className="text-sm font-semibold">{t('compliance_copilot.title')}</span>
            {explanation && <AiBadge className="ml-1" />}
          </div>
          {!explanation && (
            <button
              type="button"
              onClick={fetchExplanation}
              disabled={loadingExpl || !orgId}
              className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-spark))] hover:opacity-90 text-white text-xs font-medium px-3 py-1.5 disabled:opacity-50"
            >
              {loadingExpl ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {loadingExpl ? t('compliance_copilot.thinking') : t('compliance_copilot.run')}
            </button>
          )}
        </div>
        {!explanation && !loadingExpl && !explError && (
          <p className="text-xs text-muted-foreground leading-relaxed">{t('compliance_copilot.intro')}</p>
        )}
        {explError && (
          <p className="text-xs text-red-700">{explError}</p>
        )}
        {explanation && (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <p className="text-sm text-foreground font-medium leading-relaxed flex-1">{explanation.headline}</p>
              <span className={cn(
                'rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap',
                explanation.confidence_band === 'high' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : explanation.confidence_band === 'medium' ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-red-50 text-red-700 border-red-200',
              )}>
                {t(`compliance_copilot.confidence_${explanation.confidence_band}`)}
              </span>
            </div>
            {explanation.what_we_know && explanation.what_we_know.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1">{t('compliance_copilot.known')}</div>
                <ul className="space-y-0.5">
                  {explanation.what_we_know.map((s, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs"><CheckCircle className="mt-0.5 h-3 w-3 flex-shrink-0 text-[hsl(var(--kuja-grow))]" /><span>{s}</span></li>
                  ))}
                </ul>
              </div>
            )}
            {explanation.gaps && explanation.gaps.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1">{t('compliance_copilot.gaps')}</div>
                <ul className="ml-4 list-disc space-y-0.5 text-xs text-muted-foreground">
                  {explanation.gaps.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
            {explanation.recommended_actions && explanation.recommended_actions.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1">{t('compliance_copilot.actions')}</div>
                <ul className="space-y-1.5">
                  {explanation.recommended_actions.map((a, i) => {
                    const urgencyCls = a.urgency === 'now' ? 'bg-red-50 text-red-700 border-red-200'
                      : a.urgency === 'soon' ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-muted text-muted-foreground border-border';
                    return (
                      <li key={i} className="rounded-md border border-border bg-background p-2.5">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-xs font-medium">{a.title}</span>
                          <span className={cn('rounded-full border px-1.5 py-0.5 text-[10px] uppercase font-bold', urgencyCls)}>
                            {t(`compliance_copilot.urgency_${a.urgency}`)}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">{a.why}</p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <button
              onClick={fetchExplanation}
              className="text-[10px] text-muted-foreground hover:text-foreground underline"
            >
              {t('compliance_copilot.rerun')}
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Cpu className="h-3.5 w-3.5 text-[hsl(var(--kuja-clay))]" />
            <span className="text-sm font-semibold">{t('verification.ai_analysis')}</span>
          </div>
          {findings && findings.length > 0 ? (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {findings.map((f, i) => (
                <li key={i} className="flex gap-2"><span className="text-muted-foreground">-</span>{f}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground italic">{t('verification.no_findings')}</p>
          )}
        </div>
        <div>
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="h-3.5 w-3.5 text-[hsl(var(--kuja-grow))]" />
            <span className="text-sm font-semibold">{t('verification.recommendations')}</span>
          </div>
          {recommendations && recommendations.length > 0 ? (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {recommendations.map((r, i) => (
                <li key={i} className="flex gap-2"><span>-</span>{r}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground italic">{t('verification.no_recommendations')}</p>
          )}
        </div>
      </div>

      {registryResult && (
        <div className="mt-4">
          <div className="text-sm font-semibold mb-2">{t('verification.registry_check')}</div>
          <pre className="bg-background border border-border rounded p-3 text-xs font-mono overflow-auto max-h-64">
            {JSON.stringify(registryResult, null, 2)}
          </pre>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {verification.registry_url && (
          <span>
            {t('verification.detail.registry_label')}: <a href={verification.registry_url} target="_blank" rel="noreferrer"
              className="text-[hsl(var(--kuja-clay))] underline">{verification.registry_url}</a>
          </span>
        )}
        {verification.verified_by_name && <span>{t('verification.detail.verified_by_label')}: {verification.verified_by_name}</span>}
        {verification.verified_at && <span>{t('verification.status.verified')}: {formatDate(verification.verified_at)}</span>}
        {verification.notes && <span>{t('verification.detail.notes_label')}: {verification.notes}</span>}
      </div>
    </div>
  );
}

export default function VerificationPage() {
  const { t } = useTranslation();
  const { data, isLoading, mutate } = useVerifications();
  const { data: registriesData } = useRegistries();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [runningId, setRunningId] = useState<number | null>(null);

  const verifications = useMemo(() => {
    const orgs = (data?.organizations ?? []) as unknown as Array<Record<string, unknown>>;
    return orgs.map((o) => ({
      ...o,
      id: (o.org_id ?? o.id) as number,
      status: ((o.verification_status ?? o.status) || 'unverified') as string,
      ai_confidence: (o.ai_confidence ?? null) as number | null,
      org_name: (o.org_name ?? '') as string,
      country: (o.country ?? '') as string,
      registration_number: (o.registration_number ?? '') as string,
      registration_authority: (o.registration_authority ?? o.registry_authority ?? '') as string,
    })) as unknown as RegistrationVerification[];
  }, [data]);

  const statCounts = useMemo(() => {
    const counts = { verified: 0, ai_reviewed: 0, pending: 0, flagged: 0, unverified: 0 };
    for (const v of verifications) {
      if (v.status in counts) counts[v.status as keyof typeof counts]++;
    }
    return counts;
  }, [verifications]);

  // Phase 10.7 — 4-state taxonomy counts. Maps every org onto one of
  // clear / confirmed / likely / missing / followup so the donor sees
  // the same vocabulary across the verification list, the per-row pill,
  // and the expanded detail panel.
  const fourStateCounts = useMemo(() => {
    const counts: Record<ComplianceStateKind, number> = {
      clear: 0, confirmed: 0, likely: 0, missing: 0, followup: 0,
    };
    for (const v of verifications) {
      const { state } = mapToComplianceState(v);
      counts[state]++;
    }
    return counts;
  }, [verifications]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return verifications;
    const q = searchQuery.toLowerCase();
    return verifications.filter((v) =>
      (v.org_name ?? '').toLowerCase().includes(q) ||
      (v.country ?? '').toLowerCase().includes(q) ||
      (v.registration_number ?? '').toLowerCase().includes(q) ||
      (v.registration_authority ?? '').toLowerCase().includes(q),
    );
  }, [verifications, searchQuery]);

  const runVerification = useCallback(async (orgId: number) => {
    setRunningId(orgId);
    try {
      const org = verifications.find((v) => (v as unknown as Record<string, unknown>).org_id === orgId || v.id === orgId);
      await api.post('/verification/verify', { org_id: orgId, country: org?.country || '' });
      await mutate();
    } catch { /* noop */ } finally { setRunningId(null); }
  }, [mutate, verifications]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="kuja-shimmer h-10 w-64 rounded" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[1,2,3,4,5].map((i) => <div key={i} className="kuja-shimmer h-24 rounded-xl" />)}
        </div>
        <div className="kuja-shimmer h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="kuja-display text-3xl">{t('verification.title')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t('verification.subtitle', { n: Object.keys(registriesData?.registries ?? {}).length })}
        </p>
      </div>

      {/* Intro callout — explains what each status means so first-time
          users (especially donors new to the verification surface) don't
          have to infer the difference between Verified vs AI reviewed. */}
      <div className="rounded-xl border border-[hsl(var(--kuja-spark-soft))] bg-[hsl(var(--kuja-spark-soft))]/40 p-3">
        <div className="text-[10px] uppercase tracking-wide font-semibold text-[hsl(var(--kuja-spark))] mb-1">
          {t('verification.intro_title')}
        </div>
        <p className="text-xs text-foreground leading-relaxed">{t('verification.intro_body')}</p>
      </div>

      {/* Phase 10.7 — 4-state taxonomy stat row. Shows when the flag is
          on; this is the primary scan surface for donors triaging
          compliance posture across their applicant pool. */}
      <FourStateStatRow counts={fourStateCounts} />

      {/* Legacy stat tiles. Kept rendered for parity with the existing
          status counts (verified / pending / flagged etc.) — no UI
          regression for donors who use those numbers in their workflow. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatBox icon={ShieldCheck} label={t('verification.status.verified')} value={statCounts.verified} tone="success" />
        <StatBox icon={Cpu} label={t('verification.status.ai_reviewed')} value={statCounts.ai_reviewed} tone="spark" />
        <StatBox icon={Clock} label={t('verification.status.pending')} value={statCounts.pending} tone="warn" />
        <StatBox icon={AlertTriangle} label={t('verification.status.flagged')} value={statCounts.flagged} tone="danger" />
        <StatBox icon={XCircle} label={t('verification.status.unverified')} value={statCounts.unverified} />
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('verification.search_placeholder')}
          className="w-full h-10 pl-9 pr-3 text-sm rounded-md border border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-clay))]"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-background px-6 py-14 text-center">
          <Eye className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="kuja-display text-xl">{t('verification.no_verifications')}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {searchQuery ? t('common.try_different_search') : t('verification.no_orgs_hint')}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-background overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b border-border text-left">
                  <th className="w-10" />
                  <th className="px-4 py-3 font-medium text-muted-foreground">{t('verification.col.org')}</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">{t('verification.col.country')}</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">{t('verification.col.reg')}</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">{t('verification.col.authority')}</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">{t('verification.col.status')}</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right">{t('verification.col.confidence')}</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right">{t('verification.col.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => {
                  const expanded = expandedId === v.id;
                  const running = runningId === v.org_id;
                  return (
                    <Fragmentable key={v.id}>
                      <tr
                        onClick={() => setExpandedId(expanded ? null : v.id)}
                        className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                      >
                        <td className="px-2">
                          {expanded
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        </td>
                        <td className="px-4 py-3 font-medium">{v.org_name || `Org #${v.org_id}`}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full border border-border text-[10px] uppercase tracking-wider px-2 py-0.5 text-muted-foreground">
                            {v.country}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {v.registration_number || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {v.registration_authority || '—'}
                        </td>
                        <td className="px-4 py-3">
                          {/* Phase 10.7 — show 4-state taxonomy pill in
                              the LIST row, not just the expanded detail.
                              Falls back to StatusBadge when flag is off. */}
                          <ComplianceListPill verification={v} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          {v.ai_confidence != null ? (
                            <div className="flex items-center gap-2 justify-end">
                              <div className="w-12 h-1.5 bg-muted rounded overflow-hidden">
                                <div
                                  className={cn('h-full transition-all', confidenceBar(v.ai_confidence))}
                                  style={{ width: `${Math.min(v.ai_confidence, 100)}%` }}
                                />
                              </div>
                              <span className={cn('font-semibold text-xs min-w-[32px] text-right', confidenceCls(v.ai_confidence))}>
                                {v.ai_confidence}%
                              </span>
                            </div>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); runVerification(v.org_id); }}
                            disabled={running}
                            className={cn(
                              'inline-flex items-center gap-1 rounded text-xs font-medium px-2.5 py-1 disabled:opacity-50',
                              v.status === 'unverified' || v.status === 'pending'
                                ? 'bg-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay-dark))] text-white'
                                : 'border border-border hover:border-[hsl(var(--kuja-clay))]',
                            )}
                          >
                            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            {running ? t('verification.running') : t('verification.verify')}
                          </button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={8} className="p-0">
                            <VerificationDetail verification={v} />
                          </td>
                        </tr>
                      )}
                    </Fragmentable>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// React fragment wrapper for a two-row pattern — needed because bare <></>
// isn't valid inside <tbody> with a key. Used only for map-keying.
import { Fragment } from 'react';
import type { ReactNode } from 'react';
function Fragmentable({ children }: { children: ReactNode }) {
  return <Fragment>{children}</Fragment>;
}

function StatBox({
  icon: Icon, label, value, tone,
}: { icon: typeof ShieldCheck; label: string; value: number; tone?: 'success' | 'warn' | 'danger' | 'spark' }) {
  const cls = tone === 'success' ? 'text-[hsl(var(--kuja-grow))]'
    : tone === 'warn' ? 'text-[hsl(var(--kuja-sun))]'
    : tone === 'danger' ? 'text-[hsl(var(--kuja-flag))]'
    : tone === 'spark' ? 'text-[hsl(var(--kuja-spark))]'
    : 'text-[hsl(var(--kuja-clay-dark))]';
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <Icon className={cn('h-5 w-5 mb-2', cls)} />
      <div className={cn('kuja-numeric text-2xl font-semibold', cls)}>{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}
