'use client';

/**
 * /admin/audit-chain — hash-chained tamper-evident audit log (Phase 7).
 *
 * Admin-only. Shows:
 *   - Chain integrity badge (✅ intact / ❌ N breaks)
 *   - Full chain count + last verified timestamp
 *   - Paginated recent entries with action, actor, subject, hashes
 *   - One-click re-verify
 *
 * The chain itself is the tamper-evidence — every row contains the hash
 * of the previous row. Editing one row breaks every row after it; the
 * verify endpoint walks the chain and surfaces the break point.
 */

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ShieldCheck, ShieldAlert, RefreshCw, Loader2, ChevronLeft, ChevronRight, Download,
  Award, User as UserIcon, ExternalLink, ArrowUpRight,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api, ApiError } from '@/lib/api';
import { useNetworkStore } from '@/stores/network-store';
import { cn } from '@/lib/utils';
import { PageShell, PageHeader, PageMain } from '@/components/layout/page-shell';
import { useTranslation } from '@/lib/hooks/use-translation';
import { labelForProximateAction, labelForAuditSubject } from '@/lib/proximate-audit-labels';

/**
 * Phase 61 — map an audit chain row's subject_kind to its detail page
 * URL so operators can drill in from the chain to the entity that
 * triggered the event. Returns null when there's no useful drill-in
 * (e.g. lists without detail pages).
 */
function subjectDrillHref(kind: string | null, id: number | null | undefined): string | null {
  if (!kind || id == null) return null;
  switch (kind) {
    case 'application':              return `/applications/${id}`;
    case 'emergency_declaration':    return `/admin/declarations/${id}`;
    case 'grant':                    return `/grants/${id}`;
    case 'network_membership':       return `/admin/network-memberships/${id}`;
    case 'report':                   return `/reports/${id}`;
    case 'crisis_monitoring_report': return `/admin/crisis-monitoring/${id}`;
    case 'org':                      return `/trust?org=${id}`;
    case 'window':                   return `/admin/windows/${id}`;
    case 'fund':                     return `/admin/funds`;
    // member_feedback + tenant_message land on their list pages until
    // detail surfaces ship; intentional fallback.
    case 'member_feedback':          return '/feedback';
    case 'tenant_message':           return '/messages';
    default:                         return null;
  }
}

// Subject labels moved to the shared catalogue (labelForAuditSubject) so
// the OB console renders them in the viewer's language; the raw kind
// stays visible in the expanded Details JSON for verification.

interface VerifyResult {
  success: boolean;
  ok: boolean;
  total_checked: number;
  breaks: { seq: number; kind: string; expected?: string; got?: string }[];
  limit: number | null;
}

interface ChainEntry {
  id: number;
  seq: number;
  action: string;
  actor_email: string | null;
  subject_kind: string | null;
  subject_id: number | null;
  prev_hash: string;
  payload_hash: string;
  created_at: string;
  details: Record<string, unknown>;
}

interface RecentResult {
  success: boolean;
  total: number;
  limit: number;
  offset: number;
  entries: ChainEntry[];
}

const ACTION_TONE: Record<string, string> = {
  publish: 'text-[hsl(var(--kuja-grow))]',
  revoke:  'text-[hsl(var(--kuja-flag))]',
  verify:  'text-[hsl(var(--kuja-clay))]',
};

function actionTone(action: string): string {
  if (action.endsWith('.publish')) return ACTION_TONE.publish;
  if (action.endsWith('.revoke')) return ACTION_TONE.revoke;
  if (action.endsWith('.verify')) return ACTION_TONE.verify;
  return 'text-[hsl(var(--kuja-ink-soft))]';
}

function humanise(action: string): string {
  return action.replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Proximate rows resolve through the shared catalogue (i18n-first, so
 * the Arabic-default OB reads Arabic); platform rows keep the
 * title-case prettifier — two-segment codes like `grant.published`
 * would lose their subject through the proximate fallback.
 */
function actionLabel(action: string, t: (key: string) => string): string {
  if (action.startsWith('proximate.')) return labelForProximateAction(action, t);
  return humanise(action);
}

export default function AuditChainPage() {
  // QA 2026-07-10: on the Proximate tenant the OB reaches its own
  // tenant-scoped chain at /api/proximate/audit-chain (read + jsonl export);
  // the platform /api/audit-chain/* endpoints are admin-only and 403 the OB,
  // which used to render this page broken ("undefined break(s)… Insufficient
  // permissions"). When on Proximate we read the tenant chain and show an
  // honest tenant-scoped card — the cryptographic re-verify is platform-only,
  // so we don't fake an "intact" badge; the OB verifies offline via the export.
  const network = useNetworkStore((s) => s.network);
  const { t } = useTranslation();
  // QA 2026-07-28 (PRX-27JUL-RBAC-001): the network store hydrates async, so on
  // the FIRST render `network` is null and this used to resolve isProx=false —
  // firing the platform-admin audit endpoints (/api/audit-chain/*), which 403
  // the Proximate OB and latched accessDenied=true (never reset), leaving the OB
  // falsely "access restricted" even though /api/proximate/audit-chain returns
  // 200 for them. Fall back to the host while the store is unresolved so the
  // first fetch hits the right tenant-scoped endpoint; the store stays
  // authoritative once it loads (covers the X-Network-Override tenant switch).
  const isProx = network
    ? network.slug === 'proximate'
    : (typeof window !== 'undefined'
       && window.location.hostname.toLowerCase().includes('proximate'));
  const recentUrl = isProx ? '/api/proximate/audit-chain' : '/api/audit-chain/recent';
  const exportHref = isProx
    ? '/api/proximate/audit-chain?format=jsonl'
    : '/api/audit-chain/export.jsonl';

  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(true);
  const [recent, setRecent] = useState<RecentResult | null>(null);
  const [recentLoading, setRecentLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  // Redesign Stage 4 — two-level event view. Collapsed rows show the
  // operational facts (action / actor / subject / time); the hashes
  // and details payload needed for independent verification live in
  // an expandable row. Presentation only — chain/export logic untouched.
  const [expandedSeq, setExpandedSeq] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // PRX-RBAC-024 (2026-07-27) — the audit chain is OB/admin-only server-side
  // (/api/proximate/audit-chain 403s non-OB; /api/audit-chain/* is
  // @role_required('admin')). This page previously rendered the shell + a
  // bare <a download> Export control for ANY logged-in user, so a donor could
  // fire a request that returned a 403 body the browser saved as
  // "audit-chain.json". Gate the UI on the server's own verdict: a 401/403
  // from the data load flips accessDenied, which hides the Export control and
  // every entry, and shows an access-denied card instead. No client-side role
  // rule to drift from the server gate.
  const [accessDenied, setAccessDenied] = useState(false);
  const LIMIT = 25;

  const loadVerify = async () => {
    // Proximate has no cryptographic verify endpoint — skip it (calling the
    // platform one would 403 the OB and show a fake error).
    if (isProx) { setVerifyLoading(false); return; }
    setVerifyLoading(true);
    try {
      const r = await api.get<VerifyResult>('/api/audit-chain/verify');
      setVerify(r);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 403 || e.status === 401)) {
        setAccessDenied(true);
        setError(null);
      } else {
        setError((e as Error).message);
      }
    } finally {
      setVerifyLoading(false);
    }
  };

  const loadRecent = async (newOffset: number) => {
    setRecentLoading(true);
    try {
      const r = await api.get<RecentResult>(`${recentUrl}?limit=${LIMIT}&offset=${newOffset}`);
      setRecent(r);
      setOffset(newOffset);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 403 || e.status === 401)) {
        setAccessDenied(true);
        setError(null);
      } else {
        setError((e as Error).message);
      }
    } finally {
      setRecentLoading(false);
    }
  };

  useEffect(() => {
    // Clear any denial latched by a prior (wrong-endpoint) attempt before
    // re-loading with the now-resolved tenant — a later 200 must not stay
    // masked by an earlier 403. The load handlers re-set it if THIS attempt
    // is genuinely refused.
    setAccessDenied(false);
    loadVerify();
    loadRecent(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProx]);

  const integrityOk = verify?.ok === true;

  // PRX-RBAC-024 — server said no. Render an access-denied state with NO
  // Export control and NO entries, rather than the admin shell a donor
  // could poke at.
  if (accessDenied) {
    return (
      <div className="max-w-6xl mx-auto">
        <PageShell>
          <PageHeader
            title={t('audit_chain.page_title')}
            icon={ShieldAlert}
            subtitle={t('audit_chain.access_denied_subtitle')}
          />
          <PageMain>
            <Card className="p-6 border-l-4 border-l-[hsl(var(--kuja-flag))]">
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-6 h-6 text-[hsl(var(--kuja-flag))] shrink-0" />
                <div>
                  <h2 className="text-base font-semibold">{t('audit_chain.access_restricted')}</h2>
                  <p className="text-sm text-[hsl(var(--kuja-ink-soft))] mt-1">
                    {t('audit_chain.access_denied_body')}
                  </p>
                </div>
              </div>
            </Card>
          </PageMain>
        </PageShell>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <PageShell>
        <PageHeader
          title={t('audit_chain.page_title')}
          icon={ShieldCheck}
          subtitle={t('audit_chain.page_subtitle')}
          // Export control renders only once an authorized data load has
          // succeeded (recent !== null), so it never flashes for a user the
          // server will 403 — closing the "bare <a download> fires anyway" gap.
          primaryAction={
            recent ? (
              <a
                href={exportHref}
                download
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                title={t('audit_chain.export_hint')}
              >
                <Download className="w-3.5 h-3.5" />
                {t('audit_chain.export_chain')}
              </a>
            ) : undefined
          }
        />
        <PageMain>
      {/* Integrity card — on Proximate we can't run the platform verify, so
          show an honest tenant-scoped state (no fake "intact" claim). */}
      {isProx ? (
        <Card className="p-4 sm:p-5 border-l-4 border-l-[hsl(var(--kuja-clay))]">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-6 h-6 text-[hsl(var(--kuja-clay))]" />
            <div>
              <div className="kuja-eyebrow">{t('audit_chain.tenant_chain_eyebrow')}</div>
              <h2 className="kuja-display text-xl mt-0.5">
                {recent ? t('audit_chain.entries_count', { n: recent.total.toLocaleString() }) : '…'}
              </h2>
              <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-2">
                {t('audit_chain.tenant_chain_desc')}
              </p>
            </div>
          </div>
        </Card>
      ) : (
      <Card className={cn(
        'p-4 sm:p-5 border-l-4',
        verifyLoading ? 'border-l-[hsl(var(--kuja-ink-soft))]'
          : integrityOk ? 'border-l-[hsl(var(--kuja-grow))]'
          : 'border-l-[hsl(var(--kuja-flag))]',
      )}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            {verifyLoading ? (
              <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--kuja-ink-soft))]" />
            ) : integrityOk ? (
              <ShieldCheck className="w-6 h-6 text-[hsl(var(--kuja-grow))]" />
            ) : (
              <ShieldAlert className="w-6 h-6 text-[hsl(var(--kuja-flag))]" />
            )}
            <div>
              <div className="kuja-eyebrow">{t('audit_chain.chain_integrity')}</div>
              <h2 className="kuja-display text-xl mt-0.5">
                {verifyLoading ? t('audit_chain.verifying')
                  : integrityOk ? t('audit_chain.intact_rows', { n: verify?.total_checked.toLocaleString() ?? '' })
                  : t('audit_chain.breaks_detected', { breaks: verify?.breaks.length ?? 0, rows: verify?.total_checked ?? 0 })}
              </h2>
              {verify && !integrityOk && (
                <ul className="text-xs text-[hsl(var(--kuja-flag))] mt-2 space-y-1">
                  {verify.breaks.slice(0, 5).map((b, i) => (
                    <li key={i}>
                      <strong>seq {b.seq}</strong>: {b.kind}
                      {b.expected && <> · {t('audit_chain.expected')} <code>{b.expected.slice(0, 12)}…</code></>}
                      {b.got && <> · {t('audit_chain.got')} <code>{b.got.slice(0, 12)}…</code></>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={loadVerify}
            disabled={verifyLoading}
            className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-xs font-semibold hover:bg-[hsl(var(--kuja-sand-50))] disabled:opacity-50"
          >
            {verifyLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {t('audit_chain.re_verify')}
          </button>
        </div>
      </Card>
      )}

      {/* Recent entries */}
      <Card className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="kuja-eyebrow">{t('audit_chain.recent_entries')}</div>
            <h3 className="text-base font-semibold mt-0.5">
              {recent ? t('audit_chain.total_count', { n: recent.total.toLocaleString() }) : '…'}
              {recent && recent.entries.length > 0 && (
                <span className="text-[hsl(var(--kuja-ink-soft))] font-normal">
                  {' · '}{t('audit_chain.showing_range', { from: offset + 1, to: offset + recent.entries.length })}
                </span>
              )}
            </h3>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => loadRecent(Math.max(0, offset - LIMIT))}
              disabled={offset === 0 || recentLoading}
              className="rounded-md border border-[hsl(var(--border))] p-1.5 hover:bg-[hsl(var(--kuja-sand-50))] disabled:opacity-50"
              aria-label={t('audit_chain.previous_page')}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => loadRecent(offset + LIMIT)}
              disabled={!recent || offset + LIMIT >= recent.total || recentLoading}
              className="rounded-md border border-[hsl(var(--border))] p-1.5 hover:bg-[hsl(var(--kuja-sand-50))] disabled:opacity-50"
              aria-label={t('audit_chain.next_page')}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {recentLoading && !recent && (
          <div className="mt-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="kuja-shimmer h-12 rounded" />
            ))}
          </div>
        )}

        {recent && recent.entries.length === 0 && (
          <div className="mt-4 rounded-md border-2 border-dashed border-[hsl(var(--border))] p-8 text-center">
            <Award className="w-8 h-8 mx-auto text-[hsl(var(--kuja-ink-soft))]" />
            <p className="text-sm font-semibold mt-2">{t('audit_chain.no_entries')}</p>
            <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-1">
              {t('audit_chain.no_entries_desc')}
            </p>
          </div>
        )}

        {/* Desktop keeps the table — it is the right form for a ledger
            (PF-UX-120). Mobile gets stacked cards below (PF-MOB-015). */}
        {recent && recent.entries.length > 0 && (
          <div className="mt-4 overflow-x-auto hidden md:block">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[hsl(var(--border))] text-[hsl(var(--kuja-ink-soft))]">
                  <th className="py-2 text-left font-semibold">seq</th>
                  <th className="py-2 text-left font-semibold">{t('audit_chain.col_action')}</th>
                  <th className="py-2 text-left font-semibold">{t('audit_chain.col_actor')}</th>
                  <th className="py-2 text-left font-semibold">{t('audit_chain.col_subject')}</th>
                  <th className="py-2 text-left font-semibold">{t('audit_chain.col_when')}</th>
                  <th className="py-2 text-left font-semibold" aria-label={t('audit_chain.expand')} />
                </tr>
              </thead>
              <tbody>
                {recent.entries.map((e) => (
                  <Fragment key={e.seq}>
                  <tr
                    className="border-b border-[hsl(var(--border))] last:border-b-0 hover:bg-[hsl(var(--kuja-sand-50))] cursor-pointer"
                    onClick={() => setExpandedSeq(expandedSeq === e.seq ? null : e.seq)}
                  >
                    <td className="py-2 font-mono text-[hsl(var(--kuja-ink-soft))]">{e.seq}</td>
                    <td className={cn('py-2 font-semibold', actionTone(e.action))}>
                      {actionLabel(e.action, t)}
                    </td>
                    <td className="py-2">
                      {e.actor_email ? (
                        <span className="inline-flex items-center gap-1">
                          <UserIcon className="w-3 h-3 text-[hsl(var(--kuja-ink-soft))]" />
                          {e.actor_email}
                        </span>
                      ) : <span className="text-[hsl(var(--kuja-ink-soft))]">—</span>}
                    </td>
                    <td className="py-2">
                      {(() => {
                        if (!e.subject_kind) {
                          return <span className="text-[hsl(var(--kuja-ink-soft))]">—</span>;
                        }
                        const href = subjectDrillHref(e.subject_kind, e.subject_id ?? null);
                        const inner = (
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] inline-flex items-center gap-1',
                              href && 'hover:bg-[hsl(var(--kuja-sand-50))] hover:border-[hsl(var(--kuja-clay))] cursor-pointer transition-colors',
                            )}
                          >
                            {labelForAuditSubject(e.subject_kind, t)} #{e.subject_id}
                            {href && <ArrowUpRight className="w-2.5 h-2.5" />}
                          </Badge>
                        );
                        if (!href) return inner;
                        return (
                          <Link
                            href={href}
                            title={t('audit_chain.open_subject', { kind: e.subject_kind ?? '', id: e.subject_id ?? '' })}
                            className="inline-block"
                          >
                            {inner}
                          </Link>
                        );
                      })()}
                    </td>
                    <td className="py-2 text-[hsl(var(--kuja-ink-soft))]">
                      {new Date(e.created_at).toLocaleString()}
                    </td>
                    <td className="py-2 text-[hsl(var(--kuja-ink-soft))]">
                      <ChevronRight
                        className={cn(
                          'w-3.5 h-3.5 transition-transform',
                          expandedSeq === e.seq && 'rotate-90',
                        )}
                      />
                    </td>
                  </tr>
                  {expandedSeq === e.seq && (
                    <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--kuja-sand-50))]/50">
                      <td colSpan={6} className="py-2 px-3">
                        <div className="grid gap-1.5 text-[10px] font-mono">
                          <div>
                            <span className="uppercase tracking-wide font-sans font-semibold text-[hsl(var(--kuja-ink-soft))] me-2">{t('audit_chain.prev_hash')}</span>
                            <span className="break-all">{e.prev_hash || t('audit_chain.genesis')}</span>
                          </div>
                          <div>
                            <span className="uppercase tracking-wide font-sans font-semibold text-[hsl(var(--kuja-ink-soft))] me-2">{t('audit_chain.payload_hash')}</span>
                            <span className="break-all">{e.payload_hash}</span>
                          </div>
                          {e.details && Object.keys(e.details).length > 0 && (
                            <div>
                              <span className="uppercase tracking-wide font-sans font-semibold text-[hsl(var(--kuja-ink-soft))] me-2">{t('common.details')}</span>
                              <pre className="whitespace-pre-wrap break-all inline">{JSON.stringify(e.details)}</pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Mobile: stacked entry cards — the table is unreadable at phone
            width (PF-MOB-015). Same fields, same expand-for-hashes. */}
        {recent && recent.entries.length > 0 && (
          <div className="md:hidden mt-4 space-y-2">
            {recent.entries.map((e) => {
              const href = subjectDrillHref(e.subject_kind, e.subject_id ?? null);
              const open = expandedSeq === e.seq;
              return (
                <div key={e.seq} className="rounded-lg border border-[hsl(var(--border))] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedSeq(open ? null : e.seq)}
                    className="w-full text-start p-3 hover:bg-[hsl(var(--kuja-sand-50))]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn('text-sm font-semibold', actionTone(e.action))}>
                        {actionLabel(e.action, t)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono text-[hsl(var(--kuja-ink-soft))] shrink-0">
                        #{e.seq}
                        <ChevronRight className={cn('w-3.5 h-3.5 transition-transform', open && 'rotate-90')} />
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[hsl(var(--kuja-ink-soft))] mt-1.5">
                      {e.actor_email && (
                        <span className="inline-flex items-center gap-1">
                          <UserIcon className="w-3 h-3" />{e.actor_email}
                        </span>
                      )}
                      {e.subject_kind && (
                        <span>{labelForAuditSubject(e.subject_kind, t)} #{e.subject_id}</span>
                      )}
                      <span>{new Date(e.created_at).toLocaleString()}</span>
                    </div>
                  </button>
                  {open && (
                    <div className="px-3 pb-3 bg-[hsl(var(--kuja-sand-50))]/50">
                      <div className="grid gap-1.5 text-[10px] font-mono pt-2 border-t border-[hsl(var(--border))]">
                        <div>
                          <span className="uppercase tracking-wide font-sans font-semibold text-[hsl(var(--kuja-ink-soft))] me-2">{t('audit_chain.prev_hash')}</span>
                          <span className="break-all">{e.prev_hash || t('audit_chain.genesis')}</span>
                        </div>
                        <div>
                          <span className="uppercase tracking-wide font-sans font-semibold text-[hsl(var(--kuja-ink-soft))] me-2">{t('audit_chain.payload_hash')}</span>
                          <span className="break-all">{e.payload_hash}</span>
                        </div>
                        {e.details && Object.keys(e.details).length > 0 && (
                          <div>
                            <span className="uppercase tracking-wide font-sans font-semibold text-[hsl(var(--kuja-ink-soft))] me-2">{t('common.details')}</span>
                            <pre className="whitespace-pre-wrap break-all inline">{JSON.stringify(e.details)}</pre>
                          </div>
                        )}
                        {href && (
                          <Link href={href} className="inline-flex items-center gap-1 text-[hsl(var(--kuja-clay))] font-sans font-semibold mt-1">
                            {t('audit_chain.open_subject', { kind: e.subject_kind ?? '', id: e.subject_id ?? '' })}
                            <ArrowUpRight className="w-2.5 h-2.5" />
                          </Link>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <p className="text-[10px] text-[hsl(var(--kuja-ink-soft))] flex items-center gap-1.5">
        <ExternalLink className="w-3 h-3" />
        {t('audit_chain.verify_note')}
      </p>

      {error && (
        <Card className="p-3 border-[hsl(var(--kuja-flag)/0.3)]">
          <p className="text-xs text-[hsl(var(--kuja-flag))]">{t('common.error')}: {error}</p>
        </Card>
      )}
        </PageMain>
      </PageShell>
    </div>
  );
}
