'use client';

/**
 * GrantFitCompareDialog — Phase 17C (May 2026).
 *
 * NGO picks 2-4 grants on the list page → clicks "Compare fit" → this
 * dialog opens, POSTs /api/grants/fit-compare, and renders the ranked
 * comparison matrix + the AI rationale + a single "Apply now" link to
 * the recommended grant.
 *
 * The dialog is stateless about its trigger — pass selected grant IDs
 * + open state from the parent. Closes via onOpenChange.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2, Sparkles, Award, Pause, X, ArrowRight, Check,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface MatrixRow {
  grant_id: number;
  grant_title?: string;
  fit_score: number;
  effort_score: number;
  verdict: 'apply' | 'apply_if_capacity' | 'skip';
  reasons_to_apply?: string[];
  reasons_to_skip?: string[];
}

interface CompareResp {
  success: boolean;
  matrix: MatrixRow[];
  recommended_grant_id?: number;
  second_choice_grant_id?: number | null;
  skip_grant_ids?: number[];
  recommendation_rationale?: string;
}

const VERDICT_META: Record<string, { Icon: typeof Award; cls: string; label: string }> = {
  apply:              { Icon: Award, cls: 'text-[hsl(var(--kuja-grow))] border-[hsl(var(--kuja-grow))]', label: 'Apply' },
  apply_if_capacity:  { Icon: Pause, cls: 'text-[hsl(var(--kuja-sun))] border-[hsl(var(--kuja-sun))]', label: 'If capacity' },
  skip:               { Icon: X,     cls: 'text-[hsl(var(--kuja-flag))] border-[hsl(var(--kuja-flag))]', label: 'Skip' },
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  grantIds: number[];
}

export function GrantFitCompareDialog({ open, onOpenChange, grantIds }: Props) {
  const router = useRouter();
  const [data, setData] = useState<CompareResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || grantIds.length < 2) return;
    let cancelled = false;
    setData(null);
    setError(null);
    setLoading(true);
    api.post<CompareResp>('/api/grants/fit-compare', { grant_ids: grantIds })
      .then((r) => { if (!cancelled) setData(r); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Compare failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, grantIds]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[hsl(var(--kuja-clay))]" />
            Which of these fits you best?
          </DialogTitle>
          <DialogDescription>
            AI ranks {grantIds.length} grants against your org profile, capacity score,
            and recent delivery history. {' '}
            <span className="text-[10px]">Single Claude call · result cached for repeat views.</span>
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="py-8 flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            Computing fit + effort scores…
          </div>
        )}

        {error && (
          <div className="rounded-md border border-[hsl(var(--kuja-flag)/0.3)] bg-[hsl(var(--kuja-flag)/0.05)] p-3 text-sm">
            <strong className="text-[hsl(var(--kuja-flag))]">Couldn&apos;t compute:</strong> {error}
          </div>
        )}

        {data && data.success && (
          <div className="space-y-4">
            {/* Top recommendation */}
            {data.recommended_grant_id && (
              <div className="rounded-lg border-2 border-[hsl(var(--kuja-clay))] bg-[hsl(var(--kuja-sand))]/40 p-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-semibold text-[hsl(var(--kuja-clay))]">
                      <Award className="h-3 w-3" /> Recommended
                    </div>
                    <div className="font-semibold text-sm mt-0.5">
                      {data.matrix.find((m) => m.grant_id === data.recommended_grant_id)?.grant_title
                        ?? `Grant #${data.recommended_grant_id}`}
                    </div>
                    {data.recommendation_rationale && (
                      <p className="text-xs mt-2 leading-relaxed">{data.recommendation_rationale}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => router.push(`/grants/${data.recommended_grant_id}`)}
                  >
                    Open grant <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {/* Per-grant matrix */}
            <div className="space-y-2">
              {data.matrix.map((m) => {
                const meta = VERDICT_META[m.verdict] ?? VERDICT_META.skip;
                const { Icon } = meta;
                const isRecommended = m.grant_id === data.recommended_grant_id;
                const isSecond = m.grant_id === data.second_choice_grant_id;
                return (
                  <div
                    key={m.grant_id}
                    className={cn(
                      'rounded-md border p-3 cursor-pointer hover:border-[hsl(var(--kuja-clay))] transition-colors',
                      isRecommended ? 'border-[hsl(var(--kuja-clay))]/40' : 'border-[hsl(var(--border))]',
                    )}
                    onClick={() => router.push(`/grants/${m.grant_id}`)}
                  >
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">
                            {m.grant_title ?? `Grant #${m.grant_id}`}
                          </span>
                          {isRecommended && <Badge className="text-[10px] bg-[hsl(var(--kuja-clay))]">Top pick</Badge>}
                          {isSecond && <Badge variant="outline" className="text-[10px]">Backup</Badge>}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                          <span><strong className="text-foreground tabular-nums">{m.fit_score}</strong>/100 fit</span>
                          <span><strong className="text-foreground tabular-nums">{m.effort_score}</strong>/100 effort</span>
                        </div>
                      </div>
                      <Badge variant="outline" className={cn('font-semibold', meta.cls)}>
                        <Icon className="h-3 w-3 mr-1" /> {meta.label}
                      </Badge>
                    </div>

                    {(m.reasons_to_apply?.length || m.reasons_to_skip?.length) && (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {m.reasons_to_apply && m.reasons_to_apply.length > 0 && (
                          <div>
                            <div className="text-[10px] uppercase tracking-wide font-semibold text-[hsl(var(--kuja-grow))]">
                              Why apply
                            </div>
                            <ul className="mt-0.5 space-y-0.5">
                              {m.reasons_to_apply.map((r, i) => (
                                <li key={i} className="text-[11px] flex items-start gap-1">
                                  <Check className="h-2.5 w-2.5 mt-1 shrink-0 text-[hsl(var(--kuja-grow))]" />
                                  {r}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {m.reasons_to_skip && m.reasons_to_skip.length > 0 && (
                          <div>
                            <div className="text-[10px] uppercase tracking-wide font-semibold text-[hsl(var(--kuja-flag))]">
                              Why skip
                            </div>
                            <ul className="mt-0.5 space-y-0.5">
                              {m.reasons_to_skip.map((r, i) => (
                                <li key={i} className="text-[11px] flex items-start gap-1">
                                  <X className="h-2.5 w-2.5 mt-1 shrink-0 text-[hsl(var(--kuja-flag))]" />
                                  {r}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
