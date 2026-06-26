'use client';

/**
 * EndorsementsPanel — Phase 644 (June 2026).
 *
 * Reads all endorsements for a partner and renders each one with
 * its 3 Y/N answers and (if the endorser used voice) the
 * transcribed reasoning. Without this surface, the voice-
 * transcription work in Phase 640 is collected at submit time and
 * never surfaced to the OB — write-only data. The transcript here
 * is the only way for an OB without audio playback infra to read
 * what an endorser said.
 *
 * Renders into the partner detail page. Skips loading entirely if
 * the partner has no endorsements yet (intake-stage partners).
 */

import { useEffect, useState } from 'react';
import { Loader2, Check, X, Mic, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface EndorsementRow {
  id: number;
  endorser_id: number;
  q1_real: boolean;
  q2_trust: boolean;
  q3_accept_aid: boolean;
  coi_check_passed: boolean;
  coi_signals?: Record<string, unknown> | null;
  transcripts?: { q1?: string | null; q2?: string | null; q3?: string | null };
  created_at?: string;
}

interface Resp {
  success: boolean;
  endorsements: EndorsementRow[];
  total: number;
}

function YN({ value }: { value: boolean }) {
  return value ? (
    <Check className="w-3.5 h-3.5 text-emerald-600" aria-label="yes" />
  ) : (
    <X className="w-3.5 h-3.5 text-destructive" aria-label="no" />
  );
}

export function EndorsementsPanel({ partnerId }: { partnerId: number | string }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<EndorsementRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get<Resp>(`/api/proximate/partners/${partnerId}/endorsements`)
      .then((r) => { if (!cancelled) setRows(r.endorsements || []); })
      .catch(() => { if (!cancelled) setRows([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId]);

  if (loading) {
    return (
      <Card className="p-4">
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin" />
          {t('proximate.endorsements.loading')}
        </p>
      </Card>
    );
  }
  if (!rows || rows.length === 0) {
    return null; // intake-stage: nothing to show
  }

  return (
    <Card className="p-4">
      <p className="text-sm font-medium mb-3">
        {t('proximate.endorsements.title')} ({rows.length})
      </p>
      <ul className="space-y-3">
        {rows.map((row) => {
          const hasTranscript = !!(
            row.transcripts?.q1 || row.transcripts?.q2 || row.transcripts?.q3
          );
          return (
            <li
              key={row.id}
              className={`text-xs rounded-md border p-3 ${row.coi_check_passed ? '' : 'border-amber-500 bg-amber-50/40'}`}
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-muted-foreground">
                  #{row.id}
                </span>
                <span className="text-muted-foreground">
                  {t('proximate.endorsements.endorser')} #{row.endorser_id}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Q1</span>
                  <YN value={row.q1_real} />
                  <span className="text-muted-foreground ms-2">Q2</span>
                  <YN value={row.q2_trust} />
                  <span className="text-muted-foreground ms-2">Q3</span>
                  <YN value={row.q3_accept_aid} />
                </div>
                {!row.coi_check_passed && (
                  <Badge variant="outline" className="text-amber-700 border-amber-500">
                    <AlertTriangle className="w-3 h-3 me-1" />
                    {t('proximate.endorsements.coi_flagged')}
                  </Badge>
                )}
                {hasTranscript && (
                  <Badge variant="outline" className="text-muted-foreground">
                    <Mic className="w-3 h-3 me-1" />
                    {t('proximate.endorsements.has_transcript')}
                  </Badge>
                )}
                <span className="text-muted-foreground ms-auto">
                  {row.created_at ? new Date(row.created_at).toLocaleDateString() : ''}
                </span>
              </div>
              {hasTranscript && (
                <dl className="space-y-1.5 text-[11px] pt-1 border-t">
                  {row.transcripts?.q1 && (
                    <div>
                      <dt className="text-muted-foreground inline">Q1 — </dt>
                      <dd className="inline">{row.transcripts.q1}</dd>
                    </div>
                  )}
                  {row.transcripts?.q2 && (
                    <div>
                      <dt className="text-muted-foreground inline">Q2 — </dt>
                      <dd className="inline">{row.transcripts.q2}</dd>
                    </div>
                  )}
                  {row.transcripts?.q3 && (
                    <div>
                      <dt className="text-muted-foreground inline">Q3 — </dt>
                      <dd className="inline">{row.transcripts.q3}</dd>
                    </div>
                  )}
                </dl>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
