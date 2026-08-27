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
import { Loader2, Check, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/hooks/use-translation';

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
    <Check className="w-3.5 h-3.5" style={{ color: 'var(--prox-good)' }} aria-label="yes" />
  ) : (
    <X className="w-3.5 h-3.5" style={{ color: 'var(--prox-danger)' }} aria-label="no" />
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
      <div className="prox-panel" style={{ padding: '16px 18px' }}>
        <p className="text-xs flex items-center gap-2" style={{ color: 'var(--prox-muted)' }}>
          <Loader2 className="w-3 h-3 animate-spin" />
          {t('proximate.endorsements.loading')}
        </p>
      </div>
    );
  }
  if (!rows || rows.length === 0) {
    return null; // intake-stage: nothing to show
  }

  return (
    <div className="prox-panel" style={{ padding: '16px 18px' }}>
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
              className="text-xs"
              style={{
                padding: '12px',
                borderRadius: 10,
                border: `1px solid ${row.coi_check_passed ? 'var(--prox-line)' : 'var(--prox-warn)'}`,
                background: row.coi_check_passed ? 'var(--prox-surface-2)' : 'var(--prox-warn-tint)',
              }}
            >
              <div className="flex items-center gap-3 mb-2">
                <span style={{ color: 'var(--prox-muted)' }}>
                  #{row.id}
                </span>
                <span style={{ color: 'var(--prox-muted)' }}>
                  {t('proximate.endorsements.endorser')} #{row.endorser_id}
                </span>
                <div className="flex items-center gap-1.5">
                  <span style={{ color: 'var(--prox-muted)' }}>Q1</span>
                  <YN value={row.q1_real} />
                  <span className="ms-2" style={{ color: 'var(--prox-muted)' }}>Q2</span>
                  <YN value={row.q2_trust} />
                  <span className="ms-2" style={{ color: 'var(--prox-muted)' }}>Q3</span>
                  <YN value={row.q3_accept_aid} />
                </div>
                {!row.coi_check_passed && (
                  <span className="prox-pill warn">
                    {t('proximate.endorsements.coi_flagged')}
                  </span>
                )}
                {hasTranscript && (
                  <span className="prox-pill slate">
                    {t('proximate.endorsements.has_transcript')}
                  </span>
                )}
                <span className="ms-auto" style={{ color: 'var(--prox-muted)' }}>
                  {row.created_at ? new Date(row.created_at).toLocaleDateString() : ''}
                </span>
              </div>
              {hasTranscript && (
                <dl className="space-y-1.5 text-[11px] pt-1" style={{ borderTop: '1px solid var(--prox-line)' }}>
                  {row.transcripts?.q1 && (
                    <div>
                      <dt className="inline" style={{ color: 'var(--prox-muted)' }}>Q1 — </dt>
                      <dd className="inline">{row.transcripts.q1}</dd>
                    </div>
                  )}
                  {row.transcripts?.q2 && (
                    <div>
                      <dt className="inline" style={{ color: 'var(--prox-muted)' }}>Q2 — </dt>
                      <dd className="inline">{row.transcripts.q2}</dd>
                    </div>
                  )}
                  {row.transcripts?.q3 && (
                    <div>
                      <dt className="inline" style={{ color: 'var(--prox-muted)' }}>Q3 — </dt>
                      <dd className="inline">{row.transcripts.q3}</dd>
                    </div>
                  )}
                </dl>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
