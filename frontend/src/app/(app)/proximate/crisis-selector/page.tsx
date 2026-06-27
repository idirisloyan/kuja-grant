'use client';

/**
 * Crisis Selector skeleton — Phase 663.
 *
 * Module 3.2 from PROXIMATE_FUND_DESIGN.md, shipped as a skeleton: the
 * ranked dashboard + AI brief drafter both work; the news/signal feed
 * ingestor (the ~2-week piece) is honestly backlogged. The OB sees
 * existing crisis-monitoring rows scoped to the Proximate tenant
 * (falling back to Sudan rows from any tenant during UAT until prod
 * data lands) and can ask Claude for a scenario-typed decision brief.
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Flame, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';

interface CrisisRow {
  id: number;
  report_id: number;
  country: string;
  region: string | null;
  event_type: string | null;
  event_title: string | null;
  composite_score: number | null;
  narrative: string | null;
  flagged_for_ob: boolean;
  hdi_band: string | null;
  gov_capacity_band: string | null;
  people_impacted_estimate: number | null;
  attention_band: string | null;
  report_period_start: string | null;
}

interface Resp {
  success: boolean;
  rows: CrisisRow[];
  fallback_used: boolean;
  feed_ingestor_status: string;
  scenario_types: string[];
}

export default function CrisisSelectorPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [briefForRow, setBriefForRow] = useState<number | null>(null);
  const [briefText, setBriefText] = useState<string>('');
  const [briefing, setBriefing] = useState(false);
  const [briefScenario, setBriefScenario] = useState<string>('strengthen');
  const [briefError, setBriefError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<Resp>('/api/proximate/crisis-selector');
      setData(r);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function draftBrief(rowId: number, scenario: string) {
    setBriefing(true);
    setBriefError(null);
    setBriefForRow(rowId);
    setBriefScenario(scenario);
    setBriefText('');
    try {
      const r = await api.post<{ brief: string }>(
        `/api/proximate/crisis-selector/${rowId}/brief`,
        { scenario_type: scenario },
      );
      setBriefText(r.brief);
    } catch (e: unknown) {
      setBriefError(e instanceof Error ? e.message : 'brief failed');
    } finally {
      setBriefing(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title={t('proximate.crisis_selector.title')}
        subtitle={t('proximate.crisis_selector.subtitle')}
        icon={Flame}
      />
      <PageMain>
        {data?.fallback_used && (
          <Card className="p-3 bg-amber-50 dark:bg-amber-950/30 border-amber-200">
            <p className="text-xs text-amber-800 dark:text-amber-300">
              {t('proximate.crisis_selector.fallback_note')}
            </p>
          </Card>
        )}

        {loading && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            {t('proximate.crisis_selector.loading')}
          </p>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        {!loading && data && data.rows.length === 0 && (
          <Card className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {t('proximate.crisis_selector.empty')}
            </p>
          </Card>
        )}

        <ul className="space-y-3">
          {data?.rows.map((row) => (
            <li key={row.id}>
              <Card className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium">
                        {row.country}{row.region && ` · ${row.region}`}
                      </h3>
                      {row.flagged_for_ob && (
                        <Badge variant="outline" className="text-[10px] bg-red-100 text-red-800 border-red-300">
                          {t('proximate.crisis_selector.flagged')}
                        </Badge>
                      )}
                    </div>
                    {row.event_title && (
                      <p className="text-sm mt-1">{row.event_title}</p>
                    )}
                    {row.narrative && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-3">
                        {row.narrative}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-semibold">
                      {row.composite_score ?? '—'}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {t('proximate.crisis_selector.urgency')}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-border">
                  <span className="text-xs text-muted-foreground">
                    {t('proximate.crisis_selector.draft_brief_as')}:
                  </span>
                  {(data.scenario_types || []).map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant="outline"
                      onClick={() => draftBrief(row.id, s)}
                      disabled={briefing}
                      className="text-xs"
                    >
                      {briefing && briefForRow === row.id && briefScenario === s
                        ? <Loader2 className="w-3 h-3 me-1 animate-spin" />
                        : <Sparkles className="w-3 h-3 me-1" />
                      }
                      {t(`proximate.crisis_selector.scenario_${s}`)}
                    </Button>
                  ))}
                </div>

                {briefForRow === row.id && briefText && (
                  <Card className="p-3 bg-muted/30 border-dashed">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                      {t('proximate.crisis_selector.brief_label')} · {briefScenario}
                    </p>
                    <pre className="whitespace-pre-wrap text-xs font-sans">{briefText}</pre>
                  </Card>
                )}
                {briefForRow === row.id && briefError && (
                  <p className="text-xs text-red-600">{briefError}</p>
                )}
              </Card>
            </li>
          ))}
        </ul>
      </PageMain>
    </PageShell>
  );
}
