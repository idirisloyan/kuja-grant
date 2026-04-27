'use client';

/**
 * ProvenanceChips — Phase 5.1 UI
 *
 * Renders source citations for an AI-generated subject. Click a chip to
 * expand the cited claim + source excerpt. Sits adjacent to AI outputs
 * (drafted application sections, draft report sections, AI scores) so
 * users can answer "where did this come from?" without leaving the flow.
 *
 * Source-kind icons map to where the claim was grounded:
 *   document  📄  uploaded file
 *   profile   🏢  org profile field
 *   application 📋 prior application
 *   report    📊  prior report
 *   note      📝  reporter free-form notes
 *   grant     📜  grant agreement / criteria text
 *   ai_general 🧠 model knowledge (low confidence by default)
 *
 * Lazy-fetches via fetchProvenance() — only loads when expanded, so a
 * page with 20 sections doesn't fire 20 requests on render.
 */

import { useState, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronUp, FileText, Building2, ClipboardList, BarChart3, StickyNote, ScrollText, Brain } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { fetchProvenance, type ProvenanceRow } from '@/lib/copilot-api';
import { AIConfidenceBadge } from './ai-confidence-badge';

interface Props {
  subjectKind: 'application' | 'report' | 'grant';
  subjectId: number;
  subjectField?: string;
  /** Pre-fetched rows (preferred — avoids a network hop). When omitted we fetch lazily. */
  rows?: ProvenanceRow[];
  /** Visual density — 'inline' for one-line summaries, 'expanded' for full doc panel. */
  variant?: 'inline' | 'expanded';
  className?: string;
}

const ICON_BY_KIND: Record<string, typeof FileText> = {
  document: FileText,
  profile: Building2,
  application: ClipboardList,
  report: BarChart3,
  note: StickyNote,
  grant: ScrollText,
  ai_general: Brain,
};

export function ProvenanceChips({
  subjectKind,
  subjectId,
  subjectField,
  rows: preloaded,
  variant = 'inline',
  className = '',
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ProvenanceRow[] | null>(preloaded ?? null);
  const [loading, setLoading] = useState(false);

  // Lazy load when expanded for the first time and no preload was supplied.
  useEffect(() => {
    if (!open || rows !== null || preloaded !== undefined) return;
    let cancelled = false;
    setLoading(true);
    fetchProvenance({ subject_kind: subjectKind, subject_id: subjectId, subject_field: subjectField })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setRows(res.data.provenance);
        else setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, rows, preloaded, subjectKind, subjectId, subjectField]);

  const count = useMemo(() => (rows ?? []).length, [rows]);
  const hasRows = (rows ?? []).length > 0;

  // Closed state — small clickable summary chip.
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
      >
        {rows === null
          ? t('provenance.loading')
          : count === 1
            ? t('citations.grounded_in_one', { n: count })
            : t('citations.grounded_in_other', { n: count })}
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {open && (
        <div className="mt-2 rounded-md border border-border bg-card p-2 space-y-1.5">
          {loading && <div className="text-[11px] text-muted-foreground">{t('provenance.loading')}</div>}
          {!loading && !hasRows && (
            <div className="text-[11px] italic text-muted-foreground">
              {t('provenance.empty')}
            </div>
          )}
          {hasRows && rows!.map((r) => {
            const Icon = ICON_BY_KIND[r.source.kind] || Brain;
            return (
              <div key={r.id} className="flex items-start gap-2">
                <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {r.source.kind}
                      {r.source.locator ? ` · ${r.source.locator}` : ''}
                    </span>
                    <AIConfidenceBadge confidence={r.confidence} variant="inline" />
                  </div>
                  <p className="mt-0.5 text-xs text-foreground">{r.claim}</p>
                  {r.source.excerpt && variant === 'expanded' && (
                    <p className="mt-1 border-l-2 border-border pl-2 text-[11px] italic text-muted-foreground">
                      &ldquo;{r.source.excerpt}&rdquo;
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
