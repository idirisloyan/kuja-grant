'use client';

/**
 * RiskRegister — Phase 13.7 UI
 *
 * Renders the risk list for an entity (org / application / grant) with
 * inline status changes, owner display, and a response drawer for
 * editing the mitigation plan + due date.
 *
 * Drop into application detail, grant detail, or org profile pages.
 * Backend: /api/risks/?subject_kind=&subject_id=
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Shield, AlertOctagon, AlertTriangle, Clock, CheckCircle2, X, Loader2, Pencil,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import {
  fetchRisksForSubject, patchRisk,
  type Risk, type RiskCounts, type RiskSubjectKind,
  type RiskStatus, type RiskSeverity,
} from '@/lib/copilot-api';
import { cn } from '@/lib/utils';

interface Props {
  subjectKind: RiskSubjectKind;
  subjectId: number | null;
  /** When true, hide status edit affordances (read-only viewer). */
  readOnly?: boolean;
  className?: string;
}

const severityTone: Record<RiskSeverity, { bg: string; text: string; icon: typeof AlertOctagon }> = {
  critical: { bg: 'bg-[hsl(0_85%_96%)]',  text: 'text-[hsl(var(--kuja-flag))]', icon: AlertOctagon },
  high:     { bg: 'bg-[hsl(38_92%_96%)]', text: 'text-[hsl(var(--kuja-sun))]',  icon: AlertTriangle },
  medium:   { bg: 'bg-muted/40',           text: 'text-muted-foreground',         icon: Shield },
  low:      { bg: 'bg-[hsl(142_68%_96%)]', text: 'text-[hsl(var(--kuja-grow))]', icon: Shield },
};

const STATUS_OPTIONS: RiskStatus[] = ['open', 'mitigating', 'mitigated', 'accepted', 'dismissed'];

export function RiskRegister({ subjectKind, subjectId, readOnly, className }: Props) {
  const { t, formatDate } = useTranslation();
  const [risks, setRisks] = useState<Risk[]>([]);
  const [counts, setCounts] = useState<RiskCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingResponse, setEditingResponse] = useState<Record<number, string>>({});

  const reload = useCallback(async () => {
    if (!subjectId) return;
    setLoading(true);
    const res = await fetchRisksForSubject({ subjectKind, subjectId });
    if (res.ok) {
      setRisks(res.data.risks);
      setCounts(res.data.counts);
      setError(null);
    } else {
      setError(res.message || 'Failed to load risks');
    }
    setLoading(false);
  }, [subjectKind, subjectId]);

  useEffect(() => { void reload(); }, [reload]);

  const updateStatus = useCallback(async (riskId: number, status: RiskStatus) => {
    const res = await patchRisk(riskId, { status });
    if (res.ok) await reload();
    else setError(res.message);
  }, [reload]);

  const saveResponse = useCallback(async (riskId: number) => {
    const text = editingResponse[riskId];
    if (text == null) return;
    const res = await patchRisk(riskId, { response_md: text });
    if (res.ok) {
      setEditingResponse((prev) => {
        const next = { ...prev };
        delete next[riskId];
        return next;
      });
      await reload();
    } else {
      setError(res.message);
    }
  }, [editingResponse, reload]);

  if (loading && risks.length === 0) {
    return <div className="rounded-md border border-border bg-background p-4 text-xs text-muted-foreground">{t('common.loading')}</div>;
  }

  if (error) {
    return (
      <div className={cn('rounded-md border border-[hsl(var(--kuja-flag))]/30 bg-[hsl(0_85%_97%)] p-3 text-xs text-[hsl(var(--kuja-flag))]', className)}>
        {error}
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Shield className="h-4 w-4 text-[hsl(var(--kuja-clay))]" />
          {t('risk_register.title')}
          <span className="text-[10px] font-normal text-muted-foreground">({risks.length})</span>
        </h3>
        {counts && counts.awaiting_response > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--kuja-flag))]/30 bg-[hsl(0_85%_97%)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--kuja-flag))]">
            <Clock className="h-3 w-3" />
            {t('risk_register.awaiting_count', { n: counts.awaiting_response })}
          </span>
        )}
      </div>

      {risks.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-4 text-center text-xs text-muted-foreground">
          {t('risk_register.empty')}
        </div>
      ) : (
        <ul className="space-y-2">
          {risks.map((r) => {
            const tone = severityTone[r.severity];
            const SeverityIcon = tone.icon;
            const isExpanded = expandedId === r.id;
            const draft = editingResponse[r.id];
            const editing = draft != null;
            const isTerminal = r.status === 'mitigated' || r.status === 'accepted' || r.status === 'dismissed';
            return (
              <li
                key={r.id}
                className={cn(
                  'rounded-md border-l-4 border border-border bg-background',
                  r.severity === 'critical' ? 'border-l-[hsl(var(--kuja-flag))]'
                    : r.severity === 'high' ? 'border-l-[hsl(var(--kuja-sun))]'
                    : 'border-l-border',
                  isTerminal && 'opacity-70',
                )}
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  className="w-full p-3 text-left flex items-start gap-2.5 hover:bg-muted/30"
                >
                  <SeverityIcon className={cn('mt-0.5 h-4 w-4 flex-shrink-0', tone.text)} />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider', tone.bg, tone.text)}>
                        {t(`risk.severity.${r.severity}`)}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                        {t(`risk.kind.${r.kind}`)}
                      </span>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {t(`risk.status.${r.status}`)}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-foreground">{r.title}</p>
                    {!isExpanded && r.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{r.description}</p>
                    )}
                  </div>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                </button>

                {isExpanded && (
                  <div className="px-3 pb-3 space-y-2 border-t border-border pt-3">
                    {r.description && (
                      <p className="text-sm text-foreground whitespace-pre-line">{r.description}</p>
                    )}

                    {/* Response */}
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                          {t('risk_register.response')}
                        </span>
                        {!readOnly && !editing && (
                          <button
                            type="button"
                            onClick={() => setEditingResponse((p) => ({ ...p, [r.id]: r.response_md ?? '' }))}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] hover:bg-muted"
                          >
                            <Pencil className="h-3 w-3" />
                            {r.response_md ? t('common.edit') : t('common.add')}
                          </button>
                        )}
                      </div>
                      {!editing && (r.response_md ? (
                        <p className="text-xs text-foreground whitespace-pre-line">{r.response_md}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">{t('risk_register.no_response')}</p>
                      ))}
                      {editing && (
                        <>
                          <textarea
                            value={draft}
                            onChange={(e) => setEditingResponse((p) => ({ ...p, [r.id]: e.target.value }))}
                            rows={3}
                            placeholder={t('risk_register.response_placeholder')}
                            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-clay))]"
                          />
                          <div className="mt-1 flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingResponse((p) => { const n = { ...p }; delete n[r.id]; return n; })}
                              className="rounded-md border border-border bg-background px-2.5 py-1 text-xs hover:bg-muted"
                            >
                              {t('common.cancel')}
                            </button>
                            <button
                              type="button"
                              onClick={() => saveResponse(r.id)}
                              className="rounded-md bg-[hsl(var(--kuja-clay))] px-3 py-1 text-xs font-medium text-white hover:opacity-90"
                            >
                              {t('common.save')}
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Owner + due date row */}
                    <div className="grid gap-2 sm:grid-cols-2 text-xs">
                      {r.owner ? (
                        <div>
                          <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                            {t('risk_register.owner')}
                          </span>
                          <div className="text-foreground">{r.owner.name || r.owner.email}</div>
                        </div>
                      ) : null}
                      {r.due_date && (
                        <div>
                          <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                            {t('risk_register.due')}
                          </span>
                          <div className="text-foreground">{formatDate(r.due_date)}</div>
                        </div>
                      )}
                    </div>

                    {/* Status dropdown */}
                    {!readOnly && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                          {t('risk_register.status')}
                        </span>
                        <select
                          value={r.status}
                          onChange={(e) => updateStatus(r.id, e.target.value as RiskStatus)}
                          className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>{t(`risk.status.${s}`)}</option>
                          ))}
                        </select>
                        {r.resolved_at && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                            <CheckCircle2 className="h-3 w-3 text-[hsl(var(--kuja-grow))]" />
                            {t('risk_register.resolved_at', { ts: formatDate(r.resolved_at) })}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
