'use client';

/**
 * GrantAgreementUnpackPanel — Phase 12.
 *
 * Renders the structured spec returned by /api/grants/<id>/unpack-agreement:
 *   - executive_summary (AI paragraph in callout)
 *   - reporting_obligations (table)
 *   - indicators (table)
 *   - payment_milestones (table)
 *   - budget_breakdown (table)
 *   - key_contacts (table)
 *   - conditions (severity-coded)
 *   - restrictive_covenants (bullets)
 *   - key_dates (chronological)
 *
 * Apply CTA: "Apply to my calendar + reports" hits
 * /api/grants/<id>/apply-unpack which creates Report stubs + StatusSignal
 * rows. Shows a success summary with counts and a link to /calendar.
 *
 * Cached server-side 24h per (grant, document) so re-opening is cheap.
 */

import { useState } from 'react';
import {
  Sparkles, Loader2, CheckCircle2, AlertTriangle, FileText,
  Calendar, Wallet, Users, ShieldAlert, Quote, Wand2, ExternalLink,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/currency';
import { cn } from '@/lib/utils';

interface Obligation {
  title: string;
  type?: string;
  frequency: string;
  first_due_date?: string;
  days_after_period?: number;
  description?: string;
}

interface Indicator {
  name: string;
  target?: string;
  unit?: string;
  baseline?: string;
  source_of_verification?: string;
}

interface PaymentMilestone {
  label: string;
  amount?: number;
  currency?: string;
  trigger_date?: string;
  trigger_condition?: string;
}

interface BudgetItem {
  category: string;
  amount?: number;
  currency?: string;
  restriction?: string;
}

interface Contact {
  name: string;
  role?: string;
  email?: string;
  phone?: string;
}

interface Condition {
  title: string;
  description?: string;
  severity?: 'critical' | 'major' | 'minor';
  status_default?: string;
}

interface KeyDate {
  label: string;
  iso_date: string;
  kind?: string;
}

interface UnpackResp {
  success: boolean;
  source: 'ai' | 'unavailable' | 'no_input';
  executive_summary?: string;
  reporting_obligations: Obligation[];
  indicators: Indicator[];
  payment_milestones: PaymentMilestone[];
  budget_breakdown: BudgetItem[];
  key_contacts: Contact[];
  conditions: Condition[];
  restrictive_covenants: string[];
  key_dates: KeyDate[];
  note?: string;
}

interface ApplyResp {
  success: boolean;
  grant_id: number;
  org_id: number | null;
  reports_created: number[];
  reports_skipped: number;
  signals_created: number[];
  signals_skipped: number;
  audit_seq: number | null;
  applied_at: string;
  note?: string;
}

const SEVERITY_TONE: Record<string, string> = {
  critical: 'border-l-[hsl(var(--kuja-flag))] bg-[hsl(var(--kuja-flag)/0.04)]',
  major:    'border-l-[hsl(var(--kuja-sun))] bg-[hsl(var(--kuja-sun)/0.04)]',
  minor:    'border-l-[hsl(var(--kuja-ink-soft))] bg-[hsl(var(--kuja-quartz))]',
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: 'text-[hsl(var(--kuja-flag))]',
  major:    'text-[hsl(var(--kuja-sun))]',
  minor:    'text-[hsl(var(--kuja-ink-soft))]',
};

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString(); }
  catch { return iso; }
}

export interface GrantAgreementUnpackPanelProps {
  grantId: number;
  /** Optional document id (the signed agreement PDF) */
  documentId?: number;
  /** Show the "Apply to calendar + reports" button (NGO + admin only) */
  canApply?: boolean;
}

export function GrantAgreementUnpackPanel({
  grantId, documentId, canApply = false,
}: GrantAgreementUnpackPanelProps) {
  const [data, setData] = useState<UnpackResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyResp | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    setApplyResult(null);
    try {
      const r = await api.post<UnpackResp>(`/api/grants/${grantId}/unpack-agreement`, {
        ...(documentId ? { document_id: documentId } : {}),
      });
      setData(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const applyUnpack = async () => {
    if (!data) return;
    setApplying(true);
    setError(null);
    try {
      const r = await api.post<ApplyResp>(`/api/grants/${grantId}/apply-unpack`, {
        ...(documentId ? { document_id: documentId } : {}),
      });
      setApplyResult(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApplying(false);
    }
  };

  if (!data && !loading) {
    return (
      <Card className="p-4 border-l-4 border-l-[hsl(var(--kuja-spark))] bg-[hsl(var(--kuja-spark-soft))]">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-md bg-white">
            <Wand2 className="w-5 h-5 text-[hsl(var(--kuja-spark))]" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold">Smart-unpack the grant agreement</h3>
            <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-0.5">
              Claude reads the signed agreement and extracts reporting obligations, indicators,
              payment milestones, budget restrictions, contacts, and termination/clawback
              clauses — then optionally creates report stubs in your calendar.
            </p>
            <button
              type="button"
              onClick={run}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-spark))] px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
            >
              <Sparkles className="w-3.5 h-3.5" /> Unpack agreement
            </button>
          </div>
        </div>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-xs text-[hsl(var(--kuja-ink-soft))]">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Reading the signed agreement — 10-25 seconds.
        </div>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-4 border-l-4 border-l-[hsl(var(--kuja-flag))]">
        <p className="text-sm text-[hsl(var(--kuja-flag))]">Unpack could not run: {error}</p>
        <button type="button" onClick={run} className="mt-2 text-xs text-[hsl(var(--kuja-clay))] hover:underline">Retry</button>
      </Card>
    );
  }

  if (data.source !== 'ai') {
    return (
      <Card className="p-4">
        <p className="text-xs text-[hsl(var(--kuja-ink-soft))]">{data.note || 'No agreement text available for unpack.'}</p>
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-5 border-l-4 border-l-[hsl(var(--kuja-spark))]">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2 min-w-0">
          <Wand2 className="w-5 h-5 text-[hsl(var(--kuja-spark))] mt-0.5" />
          <div className="min-w-0">
            <div className="kuja-eyebrow flex items-center gap-1.5">
              Grant agreement — AI unpack
              <span className="kuja-ai-pill text-[9px]">
                <Sparkles className="w-2.5 h-2.5" /> Claude
              </span>
            </div>
            <h3 className="text-base font-semibold mt-0.5">
              {data.reporting_obligations.length} obligations · {data.indicators.length} indicators · {data.conditions.length} conditions
            </h3>
          </div>
        </div>
        {canApply && !applyResult && (
          <button
            type="button"
            onClick={applyUnpack}
            disabled={applying}
            className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[hsl(var(--kuja-clay-dark))] disabled:opacity-50"
            title="Create report stubs + flag conditions on this grant"
          >
            {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calendar className="w-3.5 h-3.5" />}
            {applying ? 'Applying…' : 'Apply to my calendar + reports'}
          </button>
        )}
      </div>

      {applyResult && (
        <div className="mt-3 rounded-md border border-[hsl(var(--kuja-grow)/0.3)] bg-[hsl(var(--kuja-grow)/0.05)] p-3">
          <div className="flex items-start gap-2 text-sm">
            <CheckCircle2 className="w-4 h-4 text-[hsl(var(--kuja-grow))] shrink-0 mt-0.5" />
            <div>
              <strong>Applied.</strong> Created <strong>{applyResult.reports_created.length}</strong> report stub{applyResult.reports_created.length === 1 ? '' : 's'} and <strong>{applyResult.signals_created.length}</strong> condition flag{applyResult.signals_created.length === 1 ? '' : 's'}.
              {(applyResult.reports_skipped > 0 || applyResult.signals_skipped > 0) && (
                <span className="text-[hsl(var(--kuja-ink-soft))]"> Skipped {applyResult.reports_skipped} duplicate report{applyResult.reports_skipped === 1 ? '' : 's'} + {applyResult.signals_skipped} duplicate signal{applyResult.signals_skipped === 1 ? '' : 's'}.</span>
              )}
              <div className="mt-1.5 flex items-center gap-3 text-[11px]">
                <a href="/calendar" className="inline-flex items-center gap-1 text-[hsl(var(--kuja-clay))] hover:underline">
                  <Calendar className="w-3 h-3" /> Open calendar
                </a>
                <a href="/reports" className="inline-flex items-center gap-1 text-[hsl(var(--kuja-clay))] hover:underline">
                  <FileText className="w-3 h-3" /> Open reports
                </a>
                {applyResult.audit_seq && (
                  <span className="text-[hsl(var(--kuja-ink-soft))]">
                    audit seq #{applyResult.audit_seq}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Executive summary */}
      {data.executive_summary && (
        <div className="mt-4 rounded-md border-l-4 border-l-[hsl(var(--kuja-clay))] bg-[hsl(var(--kuja-sand-50))] p-3">
          <div className="kuja-label flex items-center gap-1.5">
            <Quote className="w-3 h-3" /> Executive summary
          </div>
          <p className="text-sm leading-relaxed mt-1 text-[hsl(var(--kuja-ink))]">{data.executive_summary}</p>
        </div>
      )}

      {/* Reporting obligations */}
      {data.reporting_obligations.length > 0 && (
        <div className="mt-4">
          <div className="kuja-label flex items-center gap-1.5"><FileText className="w-3 h-3" /> Reporting obligations</div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[hsl(var(--kuja-ink-soft))] border-b border-[hsl(var(--border))]">
                <tr>
                  <th className="py-1.5 text-left font-semibold">Title</th>
                  <th className="py-1.5 text-left font-semibold">Type</th>
                  <th className="py-1.5 text-left font-semibold">Frequency</th>
                  <th className="py-1.5 text-left font-semibold">First due</th>
                </tr>
              </thead>
              <tbody>
                {data.reporting_obligations.slice(0, 10).map((ob, i) => (
                  <tr key={i} className="border-b border-[hsl(var(--border))] last:border-b-0">
                    <td className="py-1.5 font-semibold">{ob.title}</td>
                    <td className="py-1.5">{ob.type || '—'}</td>
                    <td className="py-1.5"><Badge variant="outline" className="text-[10px]">{ob.frequency.replace('_', ' ')}</Badge></td>
                    <td className="py-1.5">{fmtDate(ob.first_due_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Indicators */}
      {data.indicators.length > 0 && (
        <div className="mt-4">
          <div className="kuja-label">Indicators ({data.indicators.length})</div>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {data.indicators.slice(0, 8).map((ind, i) => (
              <div key={i} className="rounded-md border border-[hsl(var(--border))] p-2">
                <div className="font-semibold">{ind.name}</div>
                <div className="text-[hsl(var(--kuja-ink-soft))] mt-1">
                  {ind.target && <>Target: <strong>{ind.target}</strong> {ind.unit ?? ''}</>}
                  {ind.baseline && <> · baseline {ind.baseline}</>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment milestones */}
      {data.payment_milestones.length > 0 && (
        <div className="mt-4">
          <div className="kuja-label flex items-center gap-1.5"><Wallet className="w-3 h-3" /> Payment milestones</div>
          <ul className="mt-2 space-y-1 text-xs">
            {data.payment_milestones.slice(0, 10).map((m, i) => (
              <li key={i} className="flex items-center justify-between rounded-md border border-[hsl(var(--border))] px-2 py-1.5">
                <span className="font-semibold truncate">{m.label}</span>
                <span className="text-[hsl(var(--kuja-ink-soft))] shrink-0">
                  {m.amount !== undefined && formatMoney(m.amount, { currency: m.currency || 'USD' })}
                  {m.trigger_date && <> · {fmtDate(m.trigger_date)}</>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Conditions (severity-coded) */}
      {data.conditions.length > 0 && (
        <div className="mt-4">
          <div className="kuja-label flex items-center gap-1.5"><ShieldAlert className="w-3 h-3" /> Conditions ({data.conditions.length})</div>
          <ul className="mt-2 space-y-2">
            {data.conditions.slice(0, 12).map((c, i) => {
              const tone = SEVERITY_TONE[c.severity || 'minor'];
              const labelTone = SEVERITY_LABEL[c.severity || 'minor'];
              return (
                <li key={i} className={cn('rounded-md border border-[hsl(var(--border))] border-l-4 p-2.5', tone)}>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className={cn('text-[10px] uppercase tracking-wider font-semibold', labelTone)}>
                      {(c.severity || 'minor').toUpperCase()}
                    </span>
                    <span className="text-sm font-semibold">{c.title}</span>
                  </div>
                  {c.description && (
                    <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-1 leading-relaxed">{c.description}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Key contacts */}
      {data.key_contacts.length > 0 && (
        <div className="mt-4">
          <div className="kuja-label flex items-center gap-1.5"><Users className="w-3 h-3" /> Key contacts</div>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {data.key_contacts.slice(0, 6).map((c, i) => (
              <div key={i} className="rounded-md border border-[hsl(var(--border))] p-2">
                <div className="font-semibold">{c.name}</div>
                <div className="text-[hsl(var(--kuja-ink-soft))]">
                  {c.role && <span>{c.role}</span>}
                  {c.email && <span> · {c.email}</span>}
                  {c.phone && <span> · {c.phone}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Restrictive covenants */}
      {data.restrictive_covenants.length > 0 && (
        <div className="mt-4 rounded-md border border-[hsl(var(--kuja-sun)/0.3)] bg-[hsl(var(--kuja-sun)/0.05)] p-3 text-xs">
          <div className="kuja-label flex items-center gap-1 text-[hsl(var(--kuja-sun))]">
            <AlertTriangle className="w-3 h-3" /> Restrictive covenants
          </div>
          <ul className="mt-1 space-y-0.5">
            {data.restrictive_covenants.slice(0, 10).map((r, i) => (
              <li key={i}>· {r}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2 pt-3 border-t border-[hsl(var(--border))]">
        <button
          type="button"
          onClick={run}
          className="inline-flex items-center gap-1 rounded-md border border-[hsl(var(--border))] px-2 py-1 text-[11px] font-semibold hover:bg-[hsl(var(--kuja-sand-50))]"
        >
          Re-run
        </button>
        <span className="text-[10px] text-[hsl(var(--kuja-ink-soft))]">
          <ExternalLink className="w-3 h-3 inline mr-0.5" />
          Cached 24h per grant + document
        </span>
      </div>
    </Card>
  );
}
