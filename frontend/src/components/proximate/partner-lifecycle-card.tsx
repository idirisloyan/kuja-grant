'use client';

/**
 * One partner record, revealed by stage.
 *
 * The team's review asked for this specifically: not seven separate
 * forms, one record whose fields appear when they become relevant. A
 * stage the partner has not reached is collapsed and marked, rather than
 * shown as a wall of empty inputs that makes a healthy record look
 * neglected.
 *
 * The stage definitions come from the server, so the console and the
 * donor pack cannot disagree about what a cycle requires.
 */

import { useEffect, useState } from 'react';
import {
  Loader2, Lock, Check, ChevronRight, Pencil, X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/hooks/use-translation';

const PROX_DISPLAY = {
  fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif',
  fontWeight: 700,
} as const;

interface Field {
  key: string; label: string; value: string | null; filled: boolean;
}
interface Stage {
  key: string; label: string; blurb: string;
  reached: boolean; locked: boolean;
  fields: Field[]; filled_count: number; field_count: number;
  derived: Record<string, unknown> | null;
}

function usd(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function PartnerLifecycleCard({ partnerId, roundId, canEdit }: {
  partnerId: number; roundId?: number; canEdit: boolean;
}) {
  const { t } = useTranslation();
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const qs = roundId ? `?round_id=${roundId}` : '';
      const r = await api.get<{ success: boolean; stages: Stage[] }>(
        `/api/proximate/partners/${partnerId}/stages${qs}`,
      );
      if (r?.success) {
        setStages(r.stages);
        if (!openKey) {
          const firstOpen = r.stages.find((s) => s.reached && s.field_count > s.filled_count);
          setOpenKey(firstOpen?.key || r.stages.find((s) => s.reached)?.key || null);
        }
      }
    } catch { /* card stays empty */ }
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [partnerId, roundId]);

  async function save(stage: Stage) {
    setSaving(true);
    try {
      await api.patch(`/api/proximate/partners/${partnerId}/stages`, { values: draft });
      setEditKey(null);
      setDraft({});
      await load();
    } catch { /* reload shows truth */ }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="prox-panel flex items-center gap-2 text-sm" style={{ padding: '20px', color: 'var(--prox-muted)' }}>
        <Loader2 className="w-4 h-4 animate-spin" /> {t('proximate.cycle.loading_record') || 'Loading partner record…'}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {stages.map((s, i) => {
        const open = openKey === s.key;
        const editing = editKey === s.key;
        const complete = s.field_count > 0 && s.filled_count === s.field_count;
        const badgeStyle = s.locked
          ? { background: 'var(--prox-inset)', color: 'var(--prox-muted)' }
          : complete
            ? { background: 'var(--prox-good-tint)', color: 'var(--prox-good)' }
            : { background: 'var(--prox-accent-tint)', color: 'var(--prox-accent-deep)' };
        return (
          <div key={s.key} className="prox-panel" style={{ padding: '16px', opacity: s.locked ? 0.7 : undefined }}>
            <button
              type="button"
              onClick={() => setOpenKey(open ? null : s.key)}
              className="w-full text-left"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <span
                    className="mt-0.5 w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs"
                    style={badgeStyle}
                  >
                    {s.locked ? <Lock className="w-3 h-3" />
                      : complete
                        ? <Check className="w-3.5 h-3.5" /> : i + 1}
                  </span>
                  <div className="min-w-0">
                    <p style={{ ...PROX_DISPLAY, color: 'var(--prox-ink)' }}>{s.label}</p>
                    <p className="text-xs" style={{ color: 'var(--prox-muted)' }}>{s.blurb}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {s.field_count > 0 && (
                    <span className="text-xs prox-num" style={{ color: 'var(--prox-muted)' }}>
                      {s.filled_count}/{s.field_count}
                    </span>
                  )}
                  <ChevronRight className={`w-4 h-4 transition-transform ${
                    open ? 'rotate-90' : ''
                  }`} style={{ color: 'var(--prox-muted)' }} />
                </div>
              </div>
            </button>

            {open && (
              <div className="mt-4 pt-4 space-y-3" style={{ borderTop: '1px solid var(--prox-line)' }}>
                {s.locked && (
                  <p className="text-xs" style={{ color: 'var(--prox-muted)' }}>
                    {t('proximate.cycle.stage_locked')
                      || 'Not this partner’s turn yet. The fields are listed so you can see what is coming.'}
                  </p>
                )}

                {s.field_count > 0 && !editing && (
                  <>
                    <dl className="grid sm:grid-cols-2 gap-3">
                      {s.fields.map((f) => (
                        <div key={f.key}>
                          <dt className="text-xs" style={{ color: 'var(--prox-muted)' }}>{f.label}</dt>
                          <dd className="text-sm" style={f.filled ? undefined : { color: 'var(--prox-muted)' }}>
                            {f.value || (t('proximate.cycle.not_recorded') || 'Not recorded')}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    {canEdit && !s.locked && (
                      <Button
                        size="sm" variant="outline"
                        onClick={() => {
                          setEditKey(s.key);
                          setDraft(Object.fromEntries(
                            s.fields.map((f) => [f.key, f.value || ''])));
                        }}
                      >
                        <Pencil className="w-3.5 h-3.5 mr-1.5" /> {t('proximate.cycle.edit') || 'Edit'}
                      </Button>
                    )}
                  </>
                )}

                {editing && (
                  <div className="space-y-3">
                    <div className="grid sm:grid-cols-2 gap-3">
                      {s.fields.map((f) => (
                        <label key={f.key} className="block text-sm">
                          <span className="text-xs" style={{ color: 'var(--prox-muted)' }}>{f.label}</span>
                          <input
                            value={draft[f.key] ?? ''}
                            onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                            className="mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
                            style={{ border: '1px solid var(--prox-line-2)', background: 'var(--prox-surface)' }}
                          />
                        </label>
                      ))}
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline"
                              onClick={() => { setEditKey(null); setDraft({}); }}>
                        {t('proximate.cycle.cancel') || 'Cancel'}
                      </Button>
                      <Button size="sm" disabled={saving} onClick={() => save(s)}>
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : (t('proximate.cycle.save') || 'Save')}
                      </Button>
                    </div>
                  </div>
                )}

                {s.derived && <Derived stageKey={s.key} d={s.derived} />}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Derived({ stageKey, d }: { stageKey: string; d: Record<string, unknown> }) {
  const rows: [string, string][] = [];
  if (stageKey === 'due_diligence') {
    rows.push(['Status', String(d.status ?? '—')]);
    rows.push(['Trust tier', String(d.trust_tier ?? '—')]);
    rows.push(['Cleared', d.dd_cleared_at ? String(d.dd_cleared_at).slice(0, 10) : 'Not yet']);
  } else if (stageKey === 'award') {
    rows.push(['Decision', String(d.decision ?? '—')]);
    rows.push(['Approved', usd(d.approved_amount_usd)]);
    rows.push(['Method', String(d.decision_method ?? '—')]);
    if (d.decision_is_attributable === false) {
      rows.push(['Attribution', 'Recorded by secretariat with nothing behind it']);
    }
  } else if (stageKey === 'contracting') {
    rows.push(['Agreement', String(d.status ?? '—')]);
    rows.push(['Signatory', String(d.signatory_name ?? '—')]);
  } else if (stageKey === 'implementation') {
    rows.push(['Disbursements', String(d.disbursements ?? 0)]);
    rows.push(['Receipts confirmed', String(d.receipt_confirmed ?? 0)]);
    rows.push(['Awaiting receipt', String(d.awaiting_receipt ?? 0)]);
    rows.push(['Evidence logged', String(d.evidence_items ?? 0)]);
    rows.push(['Open issues', String(d.open_issues ?? 0)]);
  } else if (stageKey === 'reporting') {
    rows.push(['Reports in', `${d.reports_in ?? 0} of ${d.reports_due ?? 0}`]);
    rows.push(['Overdue', String(d.overdue ?? 0)]);
  }
  if (!rows.length) return null;
  return (
    <dl className="grid sm:grid-cols-2 gap-3 pt-3" style={{ borderTop: '1px solid var(--prox-line)' }}>
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs" style={{ color: 'var(--prox-muted)' }}>{k}</dt>
          <dd className="text-sm">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
