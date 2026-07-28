'use client';

/**
 * /admin/crisis-monitoring/<id> — Phase 35 (May 2026).
 *
 * Crisis Monitoring Report detail. Shows:
 *   - Header (period, status, audit anchor, publish button if draft)
 *   - Summary markdown
 *   - Rows table (sorted by composite_score desc, OB-flagged rows highlighted)
 *   - Per-row AI drafter button (Phase 38 surface #4)
 *   - Add-row form for draft reports
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { useCrisisReport, type CrisisRow } from '@/lib/hooks/use-api';
import { useRouteId } from '@/lib/hooks/use-route-id';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useAuthStore } from '@/stores/auth-store';
import {
  Flag, Sparkles, Loader2, ShieldCheck, AlertOctagon,
  Plus, Upload,
} from 'lucide-react';
import {
  PageShell, PageBack, PageHeader, PageMain,
} from '@/components/layout/page-shell';
import type { StatusTone } from '@/lib/status-copy';

const BAND_OPTIONS = ['low', 'medium', 'high'];
const HDI_OPTIONS = ['low_hdi', 'medium_hdi', 'high_hdi'];

// Crisis-monitoring-specific status copy. Lives here (not in lib/status-copy)
// because the lifecycle is internal to this surface.
function describeReportStatus(
  status: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): { label: string; tone: StatusTone } {
  switch (status) {
    case 'draft':     return { label: t('crisis_detail.status_draft'),           tone: 'muted' };
    case 'in_review': return { label: t('crisis_detail.status_awaiting_review'), tone: 'warn' };
    case 'published': return { label: t('crisis_detail.status_published'),       tone: 'good' };
    case 'archived':  return { label: t('crisis_detail.status_archived'),        tone: 'muted' };
    default:          return { label: status.replace(/_/g, ' '), tone: 'muted' };
  }
}

export default function CrisisMonitoringDetailClient() {
  const { t } = useTranslation();
  const reportId = useRouteId('crisis-monitoring');
  const viewer = useAuthStore((s) => s.user);
  const { data, isLoading, mutate } = useCrisisReport(reportId);

  if (viewer && viewer.role !== 'admin') {
    return (
      <div className="p-6 text-sm">
        <p className="text-destructive">{t('crisis_detail.admin_only')}</p>
      </div>
    );
  }
  if (reportId == null || isLoading || !data) {
    return (
      <div className="space-y-3">
        <div className="kuja-shimmer h-10 w-72 rounded" />
        <div className="kuja-shimmer h-32 rounded" />
      </div>
    );
  }
  if (!data.success) {
    return <div className="p-6 text-sm text-destructive">{t('crisis_detail.load_failed')}</div>;
  }

  const r = data.report;
  const rows = (r.rows ?? []).slice().sort(
    (a, b) => (b.composite_score ?? 0) - (a.composite_score ?? 0),
  );
  const isDraft = r.status === 'draft' || r.status === 'in_review';

  const periodStart = new Date(r.period_start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const periodEnd = new Date(r.period_end).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const periodLabel = t('crisis_detail.period_label', { start: periodStart, end: periodEnd });
  const statusPill = describeReportStatus(r.status, t);

  return (
    <PageShell>
      <PageBack href="/admin/crisis-monitoring" label={t('crisis_detail.back_to_reports')} />

      <PageHeader
        title={periodLabel}
        icon={AlertOctagon}
        status={statusPill}
        meta={[
          { label: rows.length === 1
              ? t('crisis_detail.row_count_one', { n: rows.length })
              : t('crisis_detail.row_count_other', { n: rows.length }) },
          ...(r.flagged_row_count > 0
            ? [{ label: t('crisis_detail.flagged_count', { n: r.flagged_row_count }), icon: Flag }]
            : []),
          ...(r.cron_anchor_audit_id
            ? [{ label: t('crisis_detail.audit_anchor', { id: r.cron_anchor_audit_id }), icon: ShieldCheck }]
            : []),
        ]}
        primaryAction={isDraft ? <PublishButton reportId={reportId} onChange={mutate} /> : null}
      />

      <PageMain>
        {/* Summary — collapsible if long, full if short */}
        {r.summary_md && (
          <section className="border border-border rounded-lg bg-card p-5">
            <h2 className="font-semibold text-sm mb-2">{t('crisis_detail.summary')}</h2>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{r.summary_md}</p>
          </section>
        )}

        {/* Add row form (drafts only) */}
        {isDraft && <AddRowForm reportId={reportId} onChange={mutate} />}

      {/* Rows table */}
      <section className="border border-border rounded-lg bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">{t('crisis_detail.col_country')}</th>
              <th className="text-left px-3 py-2">{t('crisis_detail.col_event')}</th>
              <th className="text-left px-3 py-2">{t('crisis_detail.col_hdi')}</th>
              <th className="text-left px-3 py-2">{t('crisis_detail.col_gov')}</th>
              <th className="text-right px-3 py-2">{t('crisis_detail.col_impacted')}</th>
              <th className="text-left px-3 py-2">{t('crisis_detail.col_attention')}</th>
              <th className="text-right px-3 py-2">{t('crisis_detail.col_score')}</th>
              <th className="text-right px-3 py-2">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-xs text-muted-foreground italic">
                {t('crisis_detail.no_rows_yet')}{isDraft && ` ${t('crisis_detail.add_one_above')}`}
              </td></tr>
            )}
            {rows.map((row) => (
              <CrisisRowDisplay key={row.id} reportId={reportId} row={row} onChange={mutate} isDraft={isDraft} />
            ))}
          </tbody>
        </table>
      </section>
      </PageMain>
    </PageShell>
  );
}

function PublishButton({ reportId, onChange }: { reportId: number; onChange: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  async function publish() {
    setBusy(true);
    try {
      await api.post(`/crisis/reports/${reportId}/publish`);
      toast.success(t('crisis_detail.publish_success'));
      onChange();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('crisis_detail.publish_failed'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={publish}
      disabled={busy}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
    >
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
      {t('crisis_detail.publish_report')}
    </button>
  );
}

function AddRowForm({ reportId, onChange }: { reportId: number; onChange: () => void }) {
  const { t } = useTranslation();
  const [country, setCountry] = useState('');
  const [eventType, setEventType] = useState('');
  const [eventTitle, setEventTitle] = useState('');
  const [hdiBand, setHdiBand] = useState('');
  const [govCapacityBand, setGovCapacityBand] = useState('');
  const [peopleImpacted, setPeopleImpacted] = useState('');
  const [attentionBand, setAttentionBand] = useState('');
  const [narrative, setNarrative] = useState('');
  const [flagged, setFlagged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function add() {
    if (country.trim().length !== 3) {
      toast.error(t('crisis_detail.country_iso_error'));
      return;
    }
    setBusy(true);
    try {
      await api.post(`/crisis/reports/${reportId}/rows`, {
        country: country.trim().toUpperCase(),
        event_type: eventType.trim() || undefined,
        event_title: eventTitle.trim() || undefined,
        hdi_band: hdiBand || undefined,
        gov_capacity_band: govCapacityBand || undefined,
        people_impacted_estimate: peopleImpacted ? Number(peopleImpacted) : undefined,
        attention_band: attentionBand || undefined,
        narrative: narrative.trim() || undefined,
        flagged_for_ob: flagged,
      });
      toast.success(t('crisis_detail.row_added'));
      setOpen(false);
      setCountry(''); setEventType(''); setEventTitle('');
      setHdiBand(''); setGovCapacityBand(''); setPeopleImpacted('');
      setAttentionBand(''); setNarrative(''); setFlagged(false);
      onChange();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('crisis_detail.add_failed'));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-muted"
      >
        <Plus className="w-3 h-3" /> {t('crisis_detail.add_row_toggle')}
      </button>
    );
  }

  return (
    <div className="border border-border rounded-lg bg-card p-4 space-y-3">
      <h3 className="font-semibold text-sm">{t('crisis_detail.new_row')}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        <label className="space-y-1">
          <span className="text-muted-foreground">{t('crisis_detail.field_country')}</span>
          <input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 3))}
            placeholder={t('crisis_detail.placeholder_country')} maxLength={3}
            className="w-full px-2 py-1.5 rounded-md border border-border bg-background uppercase" />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground">{t('crisis_detail.field_event_type')}</span>
          <input value={eventType} onChange={(e) => setEventType(e.target.value)}
            placeholder={t('crisis_detail.placeholder_event_type')}
            className="w-full px-2 py-1.5 rounded-md border border-border bg-background" />
        </label>
        <label className="space-y-1 sm:col-span-3">
          <span className="text-muted-foreground">{t('crisis_detail.field_event_title')}</span>
          <input value={eventTitle} onChange={(e) => setEventTitle(e.target.value)}
            placeholder={t('crisis_detail.placeholder_event_title')}
            className="w-full px-2 py-1.5 rounded-md border border-border bg-background" />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground">{t('crisis_detail.field_hdi_band')}</span>
          <select value={hdiBand} onChange={(e) => setHdiBand(e.target.value)}
            className="w-full px-2 py-1.5 rounded-md border border-border bg-background">
            <option value="">—</option>
            {HDI_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground">{t('crisis_detail.field_gov_capacity')}</span>
          <select value={govCapacityBand} onChange={(e) => setGovCapacityBand(e.target.value)}
            className="w-full px-2 py-1.5 rounded-md border border-border bg-background">
            <option value="">—</option>
            {BAND_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground">{t('crisis_detail.field_attention')}</span>
          <select value={attentionBand} onChange={(e) => setAttentionBand(e.target.value)}
            className="w-full px-2 py-1.5 rounded-md border border-border bg-background">
            <option value="">—</option>
            {BAND_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground">{t('crisis_detail.field_people_impacted')}</span>
          <input type="number" value={peopleImpacted}
            onChange={(e) => setPeopleImpacted(e.target.value)} min={0}
            className="w-full px-2 py-1.5 rounded-md border border-border bg-background" />
        </label>
        <label className="space-y-1 sm:col-span-3">
          <span className="text-muted-foreground">{t('crisis_detail.field_narrative')}</span>
          <textarea value={narrative} onChange={(e) => setNarrative(e.target.value)} rows={3}
            placeholder={t('crisis_detail.placeholder_narrative')}
            className="w-full px-2 py-1.5 rounded-md border border-border bg-background" />
        </label>
        <label className="flex items-center gap-2 sm:col-span-3">
          <input type="checkbox" checked={flagged} onChange={(e) => setFlagged(e.target.checked)} />
          <span>{t('crisis_detail.flag_for_ob')}</span>
        </label>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={add} disabled={busy}
          className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">
          {busy ? <Loader2 className="w-3 h-3 animate-spin inline" /> : t('crisis_detail.add_row_button')}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="px-3 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-muted">
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}

function CrisisRowDisplay({
  reportId, row, onChange, isDraft,
}: {
  reportId: number; row: CrisisRow; onChange: () => void; isDraft: boolean;
}) {
  const { t } = useTranslation();
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNarrative, setAiNarrative] = useState<string | null>(null);

  async function runAIDrafter() {
    setAiBusy(true);
    try {
      const r = await api.post<{ ok?: boolean; narrative?: string; suggested_bands?: Record<string, unknown> }>(
        `/crisis/reports/${reportId}/rows/${row.id}/ai-draft`,
        { apply: false },
      );
      if (r?.narrative) {
        setAiNarrative(r.narrative);
        if (r.ok) toast.success(t('crisis_detail.ai_narrative_drafted'));
        else toast.message(t('crisis_detail.ai_fallback'));
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('crisis_detail.ai_drafter_failed'));
    } finally {
      setAiBusy(false);
    }
  }

  const scoreColour =
    !row.composite_score ? 'text-muted-foreground'
    : row.composite_score >= 80 ? 'text-destructive font-semibold'
    : row.composite_score >= 60 ? 'text-[hsl(var(--kuja-sun))]'
    : 'text-muted-foreground';

  return (
    <>
      <tr className={'border-t border-border ' + (row.flagged_for_ob ? 'bg-[hsl(var(--kuja-clay))]/5' : '')}>
        <td className="px-3 py-2 text-xs">
          {row.flagged_for_ob && <Flag className="w-3 h-3 inline mr-1 text-[hsl(var(--kuja-clay))]" />}
          <strong>{row.country}</strong>
          {row.region && <div className="text-muted-foreground text-[10px]">{row.region}</div>}
        </td>
        <td className="px-3 py-2 text-xs">
          {row.event_title || row.event_type || '—'}
          {row.event_title && row.event_type && (
            <div className="text-muted-foreground text-[10px]">{row.event_type}</div>
          )}
        </td>
        <td className="px-3 py-2 text-xs">{row.hdi_band || '—'}</td>
        <td className="px-3 py-2 text-xs">{row.gov_capacity_band || '—'}</td>
        <td className="px-3 py-2 text-xs text-right">
          {row.people_impacted_estimate ? row.people_impacted_estimate.toLocaleString() : '—'}
        </td>
        <td className="px-3 py-2 text-xs">{row.attention_band || '—'}</td>
        <td className={`px-3 py-2 text-xs text-right ${scoreColour}`}>
          {row.composite_score !== null ? row.composite_score : '—'}
        </td>
        <td className="px-3 py-2 text-right">
          <button
            type="button"
            onClick={runAIDrafter}
            disabled={aiBusy}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-[hsl(var(--kuja-spark))] text-white hover:opacity-90 disabled:opacity-50"
          >
            {aiBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {t('crisis_detail.ai_draft')}
          </button>
        </td>
      </tr>
      {row.narrative && (
        <tr className="border-t border-border bg-muted/20">
          <td colSpan={8} className="px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap">
            {row.narrative}
          </td>
        </tr>
      )}
      {aiNarrative && (
        <tr className="border-t border-border bg-[hsl(var(--kuja-spark-soft))]">
          <td colSpan={8} className="px-3 py-2 text-xs">
            <div className="flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-[hsl(var(--kuja-spark))] shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  {t('crisis_detail.ai_narrative_preview')}
                </div>
                <p className="whitespace-pre-wrap leading-relaxed">{aiNarrative}</p>
              </div>
              <button
                type="button"
                onClick={() => setAiNarrative(null)}
                className="text-[10px] text-muted-foreground hover:text-foreground"
              >{t('crisis_detail.dismiss')}</button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
