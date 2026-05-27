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
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { useCrisisReport, type CrisisRow } from '@/lib/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import {
  ChevronLeft, Flag, Sparkles, Loader2, ShieldCheck, AlertOctagon,
  Plus, Upload,
} from 'lucide-react';

const BAND_OPTIONS = ['low', 'medium', 'high'];
const HDI_OPTIONS = ['low_hdi', 'medium_hdi', 'high_hdi'];

const STATUS_COLOUR: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  in_review: 'bg-[hsl(var(--kuja-sun))]/15 text-[hsl(var(--kuja-sun))]',
  published: 'bg-[hsl(var(--kuja-grow))]/15 text-[hsl(var(--kuja-grow))]',
  archived: 'bg-muted text-muted-foreground',
};

export default function CrisisMonitoringDetailClient() {
  const params = useParams();
  const reportId = Number(params?.id ?? '0');
  const router = useRouter();
  const viewer = useAuthStore((s) => s.user);
  const { data, isLoading, mutate } = useCrisisReport(reportId || null);

  if (viewer && viewer.role !== 'admin') {
    return (
      <div className="p-6 text-sm">
        <p className="text-destructive">Only platform admins can view crisis reports.</p>
      </div>
    );
  }
  if (isLoading || !data) {
    return (
      <div className="space-y-3">
        <div className="kuja-shimmer h-10 w-72 rounded" />
        <div className="kuja-shimmer h-32 rounded" />
      </div>
    );
  }
  if (!data.success) {
    return <div className="p-6 text-sm text-destructive">Failed to load report.</div>;
  }

  const r = data.report;
  const rows = (r.rows ?? []).slice().sort(
    (a, b) => (b.composite_score ?? 0) - (a.composite_score ?? 0),
  );
  const isDraft = r.status === 'draft' || r.status === 'in_review';

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => router.push('/admin/crisis-monitoring')}
        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
      >
        <ChevronLeft className="w-3 h-3" /> Back to reports
      </button>

      {/* Header */}
      <div className="border border-border rounded-lg bg-card p-5 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="kuja-display text-2xl flex items-center gap-2">
              <AlertOctagon className="w-6 h-6 text-[hsl(var(--kuja-clay))]" />
              Week of {new Date(r.period_start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              {' – '}
              {new Date(r.period_end).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </h1>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full font-semibold capitalize ${STATUS_COLOUR[r.status] || STATUS_COLOUR.draft}`}>
                {r.status.replace('_', ' ')}
              </span>
              <span>· {rows.length} {rows.length === 1 ? 'row' : 'rows'}</span>
              {r.flagged_row_count > 0 && (
                <span className="inline-flex items-center gap-1 text-[hsl(var(--kuja-clay))]">
                  <Flag className="w-3 h-3" /> {r.flagged_row_count} flagged
                </span>
              )}
              {r.cron_anchor_audit_id && (
                <span className="inline-flex items-center gap-1 text-[hsl(var(--kuja-grow))]">
                  <ShieldCheck className="w-3 h-3" /> audit #{r.cron_anchor_audit_id}
                </span>
              )}
            </div>
          </div>
          {isDraft && <PublishButton reportId={reportId} onChange={mutate} />}
        </div>

        {r.summary_md && (
          <p className="text-sm whitespace-pre-wrap leading-relaxed border-t border-border pt-3">
            {r.summary_md}
          </p>
        )}
      </div>

      {/* Add row form (drafts only) */}
      {isDraft && <AddRowForm reportId={reportId} onChange={mutate} />}

      {/* Rows table */}
      <section className="border border-border rounded-lg bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Country</th>
              <th className="text-left px-3 py-2">Event</th>
              <th className="text-left px-3 py-2">HDI</th>
              <th className="text-left px-3 py-2">Gov</th>
              <th className="text-right px-3 py-2">Impacted</th>
              <th className="text-left px-3 py-2">Attention</th>
              <th className="text-right px-3 py-2">Score</th>
              <th className="text-right px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-xs text-muted-foreground italic">
                No rows yet. {isDraft && 'Add one above.'}
              </td></tr>
            )}
            {rows.map((row) => (
              <CrisisRowDisplay key={row.id} reportId={reportId} row={row} onChange={mutate} isDraft={isDraft} />
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function PublishButton({ reportId, onChange }: { reportId: number; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  async function publish() {
    setBusy(true);
    try {
      await api.post(`/crisis/reports/${reportId}/publish`);
      toast.success('Published. The OB can now cite this as declaration evidence.');
      onChange();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Publish failed.');
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
      Publish report
    </button>
  );
}

function AddRowForm({ reportId, onChange }: { reportId: number; onChange: () => void }) {
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
      toast.error('Country must be ISO 3166 alpha-3 (e.g. SOM, KEN, ETH).');
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
      toast.success('Row added.');
      setOpen(false);
      setCountry(''); setEventType(''); setEventTitle('');
      setHdiBand(''); setGovCapacityBand(''); setPeopleImpacted('');
      setAttentionBand(''); setNarrative(''); setFlagged(false);
      onChange();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Add failed.');
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
        <Plus className="w-3 h-3" /> Add country / event row
      </button>
    );
  }

  return (
    <div className="border border-border rounded-lg bg-card p-4 space-y-3">
      <h3 className="font-semibold text-sm">New row</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        <label className="space-y-1">
          <span className="text-muted-foreground">Country (ISO-3)*</span>
          <input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 3))}
            placeholder="SOM" maxLength={3}
            className="w-full px-2 py-1.5 rounded-md border border-border bg-background uppercase" />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground">Event type</span>
          <input value={eventType} onChange={(e) => setEventType(e.target.value)}
            placeholder="drought / conflict / flood"
            className="w-full px-2 py-1.5 rounded-md border border-border bg-background" />
        </label>
        <label className="space-y-1 sm:col-span-3">
          <span className="text-muted-foreground">Event title</span>
          <input value={eventTitle} onChange={(e) => setEventTitle(e.target.value)}
            placeholder="e.g. Somalia drought escalation, Jubbaland"
            className="w-full px-2 py-1.5 rounded-md border border-border bg-background" />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground">HDI band</span>
          <select value={hdiBand} onChange={(e) => setHdiBand(e.target.value)}
            className="w-full px-2 py-1.5 rounded-md border border-border bg-background">
            <option value="">—</option>
            {HDI_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground">Gov capacity</span>
          <select value={govCapacityBand} onChange={(e) => setGovCapacityBand(e.target.value)}
            className="w-full px-2 py-1.5 rounded-md border border-border bg-background">
            <option value="">—</option>
            {BAND_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground">Attention</span>
          <select value={attentionBand} onChange={(e) => setAttentionBand(e.target.value)}
            className="w-full px-2 py-1.5 rounded-md border border-border bg-background">
            <option value="">—</option>
            {BAND_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground">People impacted</span>
          <input type="number" value={peopleImpacted}
            onChange={(e) => setPeopleImpacted(e.target.value)} min={0}
            className="w-full px-2 py-1.5 rounded-md border border-border bg-background" />
        </label>
        <label className="space-y-1 sm:col-span-3">
          <span className="text-muted-foreground">Narrative</span>
          <textarea value={narrative} onChange={(e) => setNarrative(e.target.value)} rows={3}
            placeholder="What's happening, member-reported signals, gaps..."
            className="w-full px-2 py-1.5 rounded-md border border-border bg-background" />
        </label>
        <label className="flex items-center gap-2 sm:col-span-3">
          <input type="checkbox" checked={flagged} onChange={(e) => setFlagged(e.target.checked)} />
          <span>Flag for Oversight Body review</span>
        </label>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={add} disabled={busy}
          className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">
          {busy ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Add row'}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="px-3 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-muted">
          Cancel
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
        if (r.ok) toast.success('AI narrative drafted.');
        else toast.message('AI fallback — review manually.');
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'AI drafter failed.');
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
            AI draft
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
                  AI-drafted narrative (not applied — preview only)
                </div>
                <p className="whitespace-pre-wrap leading-relaxed">{aiNarrative}</p>
              </div>
              <button
                type="button"
                onClick={() => setAiNarrative(null)}
                className="text-[10px] text-muted-foreground hover:text-foreground"
              >Dismiss</button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
