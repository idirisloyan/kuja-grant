'use client';

/**
 * Partner report package — review + donor view (July 2026).
 *
 * One persona-aware page:
 *   OB    — edit the AI narrative, approve each media item for donor
 *           eyes (the safeguarding gate: everything starts internal),
 *           request changes, publish.
 *   Donor — the published report: narrative, approved gallery,
 *           financials. The API enforces the filtering; this page just
 *           renders what it gets.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Loader2, ArrowLeft, Sparkles, Eye, EyeOff, Send, Undo2, FileDown, Flag,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useProximatePersona } from '@/lib/hooks/use-proximate-persona';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { labelForProximateStatus } from '@/lib/proximate-status-labels';

interface BudgetLine { label: string; amount: number }
interface Activity {
  id: number; name: string; budget_lines: BudgetLine[];
}
interface Item {
  id: number; kind: string; caption: string | null;
  question_key: string | null; transcript: string | null;
  donor_visible: boolean; change_request?: string | null;
  filename: string | null; mime_type: string | null;
}
interface Section {
  title_en?: string; title_ar?: string; body_en?: string; body_ar?: string;
}
interface Narrative {
  summary_en?: string; summary_ar?: string; sections?: Section[];
  source?: string;
}
interface PkgView {
  success: boolean;
  package?: {
    id: number; status: string; answers: {
      activities?: Record<string, {
        people_reached?: number; unit?: string;
        spend?: Record<string, number>;
      }>;
    };
    spend_currency: string; exchange_rate: number | null;
    narrative: Narrative | null;
    ob_notes: string | null; published_at: string | null;
  };
  partner?: { name: string; name_ar: string | null; locality: string | null };
  round?: { id: number; title: string };
  activities?: Activity[];
  items?: Item[];
  error?: string;
}

const STATUS_TONE: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  submitted: 'bg-amber-100 text-amber-800 border-amber-300',
  changes_requested: 'bg-rose-100 text-rose-800 border-rose-300',
  published: 'bg-emerald-100 text-emerald-800 border-emerald-300',
};

export function ProximateReportPackageClient() {
  const [packageId, setPackageId] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    const m = window.location.pathname.match(/\/proximate\/reports\/(\d+)/);
    return m ? m[1] : '';
  });
  const [data, setData] = useState<PkgView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [notes, setNotes] = useState('');
  const [rateInput, setRateInput] = useState('');
  const [narrative, setNarrative] = useState<Narrative | null>(null);
  const { persona } = useProximatePersona();
  // Same rule as the round page: only a real OB is an operator here.
  const isOperator = persona === 'ob';

  useEffect(() => {
    const m = window.location.pathname.match(/\/proximate\/reports\/(\d+)/);
    if (m && m[1] !== '0' && m[1] !== packageId) setPackageId(m[1]);
  }, [packageId]);

  const refresh = useCallback(() => {
    if (!packageId || packageId === '0') return;
    setLoading(true);
    api.get<PkgView>(`/api/proximate/report-packages/${packageId}`)
      .then((r) => {
        setData(r);
        setNarrative(r.package?.narrative || null);
        setRateInput(r.package?.exchange_rate
          ? String(r.package.exchange_rate) : '');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [packageId]);

  useEffect(() => { refresh(); }, [refresh]);

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError('');
    try {
      await fn();
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy('');
    }
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error && !data?.package) {
    return <p className="text-sm text-muted-foreground p-8">{error}</p>;
  }
  if (!data?.package) return null;

  const pkg = data.package;
  const items = data.items || [];
  const photos = items.filter((i) => i.kind === 'photo');
  const videos = items.filter((i) => i.kind === 'video');
  const voices = items.filter((i) => i.kind === 'voice');
  const files = items.filter((i) => !['photo', 'video', 'voice'].includes(i.kind));
  const actsById = new Map((data.activities || []).map((a) => [String(a.id), a]));
  const blocks = Object.entries(pkg.answers.activities || {});

  const setNarrativeField = (patch: Partial<Narrative>) =>
    setNarrative((n) => ({ ...(n || {}), ...patch }));

  // Per-item fix request. A prompt keeps this one tap on an OB-only
  // surface; the note lands on the partner's token page.
  const flagItem = (it: Item) => {
    const note = window.prompt(
      'What should the partner fix on this item? (leave empty to clear)',
      it.change_request || '');
    if (note === null) return;
    act(`flag${it.id}`, () =>
      api.patch(`/api/proximate/report-packages/${pkg.id}/items/${it.id}`,
                { change_request: note }));
  };

  const flagButton = (it: Item) => isOperator && (
    <button
      type="button" onClick={() => flagItem(it)}
      title={it.change_request
        ? `Fix requested: ${it.change_request}` : 'Request a fix from the partner'}
      className={`shrink-0 inline-flex items-center gap-0.5 px-1 py-0.5 rounded border text-[9px] ${
        it.change_request
          ? 'bg-amber-50 text-amber-800 border-amber-300'
          : 'bg-muted text-muted-foreground border-border'}`}
    >
      <Flag className="w-3 h-3" />
      {it.change_request ? 'Flagged' : 'Flag'}
    </button>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-4 p-4 md:p-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href={`/proximate/rounds/${data.round?.id}`}
              className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold truncate">
            {data.partner?.name} — Implementation report
          </h1>
          <p className="text-xs text-muted-foreground">{data.round?.title}</p>
        </div>
        <Badge variant="outline"
               className={`text-[10px] ${STATUS_TONE[pkg.status] || ''}`}>
          {labelForProximateStatus(pkg.status) || pkg.status.replace(/_/g, ' ')}
        </Badge>
        <a href={`/api/proximate/report-packages/${pkg.id}/pdf`}
           className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border hover:bg-muted">
          <FileDown className="w-3 h-3" /> PDF
        </a>
      </div>

      {error && <p className="text-xs text-rose-600">{error}</p>}

      {/* Narrative */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold flex-1">Narrative</h2>
          {narrative?.source === 'ai' && (
            <Badge variant="outline" className="text-[10px] bg-violet-100 text-violet-800 border-violet-300">
              AI draft
            </Badge>
          )}
          {isOperator && (
            <Button size="sm" variant="outline" disabled={busy === 'compile'}
              onClick={() => act('compile', () =>
                api.post(`/api/proximate/report-packages/${pkg.id}/compile`, {}))}>
              {busy === 'compile'
                ? <Loader2 className="w-3.5 h-3.5 animate-spin me-1" />
                : <Sparkles className="w-3.5 h-3.5 me-1" />}
              {narrative ? 'Recompile' : 'Compile with AI'}
            </Button>
          )}
        </div>
        {isOperator && pkg.status !== 'published' ? (
          <div className="space-y-2">
            <textarea
              value={narrative?.summary_en || ''}
              onChange={(e) => setNarrativeField({ summary_en: e.target.value })}
              rows={3} placeholder="Summary (English)…"
              className="w-full text-sm rounded-md border bg-background p-2"
            />
            <textarea
              dir="rtl"
              value={narrative?.summary_ar || ''}
              onChange={(e) => setNarrativeField({ summary_ar: e.target.value })}
              rows={3} placeholder="الملخص (عربي)…"
              className="w-full text-sm rounded-md border bg-background p-2"
            />
            {(narrative?.sections || []).map((sec, i) => (
              <div key={i} className="space-y-1">
                <input
                  value={sec.title_en || ''}
                  onChange={(e) => {
                    const sections = [...(narrative?.sections || [])];
                    sections[i] = { ...sections[i], title_en: e.target.value };
                    setNarrativeField({ sections });
                  }}
                  className="w-full text-sm font-medium rounded-md border bg-background p-2"
                />
                <textarea
                  value={sec.body_en || ''} rows={3}
                  onChange={(e) => {
                    const sections = [...(narrative?.sections || [])];
                    sections[i] = { ...sections[i], body_en: e.target.value };
                    setNarrativeField({ sections });
                  }}
                  className="w-full text-sm rounded-md border bg-background p-2"
                />
              </div>
            ))}
            <Button size="sm" variant="outline" disabled={busy === 'save'}
              onClick={() => act('save', () =>
                api.patch(`/api/proximate/report-packages/${pkg.id}`,
                          { narrative }))}>
              {busy === 'save' && <Loader2 className="w-3.5 h-3.5 animate-spin me-1" />}
              Save narrative
            </Button>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            {narrative?.summary_en && <p>{narrative.summary_en}</p>}
            {narrative?.summary_ar && <p dir="rtl">{narrative.summary_ar}</p>}
            {(narrative?.sections || []).map((sec, i) => (
              <div key={i}>
                <p className="font-medium">{sec.title_en}</p>
                <p className="text-muted-foreground">{sec.body_en}</p>
                {sec.body_ar && <p className="text-muted-foreground" dir="rtl">{sec.body_ar}</p>}
              </div>
            ))}
            {!narrative && (
              <p className="text-xs text-muted-foreground italic">
                No narrative compiled yet.
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Financials */}
      {blocks.length > 0 && (
        <Card className="p-4 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold flex-1">
              Financials — actual vs approved
            </h2>
            {isOperator && (
              <div className="flex items-center gap-1 text-[11px]">
                <span className="text-muted-foreground">
                  {pkg.spend_currency}/USD
                </span>
                <input
                  type="number" inputMode="decimal" min={0}
                  value={rateInput} placeholder="rate"
                  onChange={(e) => setRateInput(e.target.value)}
                  className="w-20 rounded-md border bg-background px-1.5 py-1 text-xs"
                />
                <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]"
                  disabled={busy === 'rate'}
                  onClick={() => act('rate', () =>
                    api.patch(`/api/proximate/report-packages/${pkg.id}`,
                              { exchange_rate: rateInput ? Number(rateInput) : null }))}>
                  {busy === 'rate' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Set rate'}
                </Button>
              </div>
            )}
            {!isOperator && pkg.exchange_rate ? (
              <span className="text-[10px] text-muted-foreground">
                Rate: {Number(pkg.exchange_rate).toLocaleString()} {pkg.spend_currency}/USD
              </span>
            ) : null}
          </div>
          {blocks.map(([aid, block]) => {
            const approved = actsById.get(aid);
            const approvedLines = new Map(
              (approved?.budget_lines || []).map((l) => [l.label, l.amount]));
            return (
              <div key={aid} className="text-sm space-y-1">
                <p className="font-medium">{approved?.name || 'General activity'}
                  {block.people_reached != null && (
                    <span className="text-xs text-muted-foreground font-normal">
                      {' '}· {block.people_reached.toLocaleString()} {block.unit || ''} reached
                    </span>
                  )}
                </p>
                {Object.entries(block.spend || {}).map(([label, amount]) => (
                  <div key={label} className="flex items-center gap-2 text-xs">
                    <span className="flex-1 min-w-0 truncate">{label}</span>
                    <span className="tabular-nums">
                      {Number(amount).toLocaleString()} {pkg.spend_currency}
                    </span>
                    {pkg.exchange_rate ? (
                      <span className="text-muted-foreground tabular-nums">
                        ≈ {Math.round(Number(amount) / pkg.exchange_rate).toLocaleString()} USD
                      </span>
                    ) : null}
                    {approvedLines.has(label) && (
                      <span className="text-muted-foreground tabular-nums">
                        / approved {Number(approvedLines.get(label)).toLocaleString()} USD
                      </span>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </Card>
      )}

      {/* Media — the safeguarding gate */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold flex-1">
            Evidence ({items.length})
          </h2>
          {isOperator ? (
            <p className="text-[10px] text-muted-foreground">
              Everything is internal until you make it donor-visible.
            </p>
          ) : (
            <p className="text-[10px] text-muted-foreground">
              Evidence included in this report has passed quality and
              safeguarding review.
            </p>
          )}
        </div>
        {photos.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {photos.map((it) => (
              <figure key={it.id} className="rounded-md border overflow-hidden bg-muted/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/proximate/report-items/${it.id}/file`}
                     alt={it.caption || 'evidence photo'}
                     className="w-full h-32 object-cover" loading="lazy" />
                <figcaption className="p-1.5 text-[10px] flex items-center gap-1">
                  <span className="flex-1 min-w-0 truncate">{it.caption || it.filename}</span>
                  {isOperator && (
                    <button
                      type="button"
                      title={it.donor_visible ? 'Visible to donor — click to hide'
                                              : 'Internal only — click to approve for donor'}
                      onClick={() => act(`vis${it.id}`, () =>
                        api.patch(`/api/proximate/report-packages/${pkg.id}/items/${it.id}`,
                                  { donor_visible: !it.donor_visible }))}
                      className={`shrink-0 inline-flex items-center gap-0.5 px-1 py-0.5 rounded border text-[9px] ${
                        it.donor_visible
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : 'bg-muted text-muted-foreground border-border'}`}
                    >
                      {it.donor_visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      {it.donor_visible ? 'Donor' : 'Internal'}
                    </button>
                  )}
                  {flagButton(it)}
                </figcaption>
                {it.change_request && isOperator && (
                  <p className="px-1.5 pb-1.5 text-[9px] text-amber-700">
                    Fix requested: {it.change_request}
                  </p>
                )}
              </figure>
            ))}
          </div>
        )}
        {videos.map((it) => (
          <div key={it.id} className="space-y-1">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video controls preload="metadata" className="w-full rounded-md border max-h-72"
                   src={`/api/proximate/report-items/${it.id}/file`} />
            <div className="flex items-center gap-2 text-[11px]">
              <span className="flex-1 min-w-0 truncate">{it.caption || it.filename}</span>
              {isOperator && (
                <button
                  type="button"
                  onClick={() => act(`vis${it.id}`, () =>
                    api.patch(`/api/proximate/report-packages/${pkg.id}/items/${it.id}`,
                              { donor_visible: !it.donor_visible }))}
                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[9px] ${
                    it.donor_visible
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : 'bg-muted text-muted-foreground border-border'}`}
                >
                  {it.donor_visible ? 'Donor-visible' : 'Internal'}
                </button>
              )}
              {flagButton(it)}
            </div>
            {it.change_request && isOperator && (
              <p className="text-[10px] text-amber-700">
                Fix requested: {it.change_request}
              </p>
            )}
          </div>
        ))}
        {voices.length > 0 && isOperator && (
          <div className="space-y-2">
            <p className="text-xs font-medium">Voice answers (internal)</p>
            {voices.map((it) => (
              <details key={it.id} className="text-xs rounded-md border bg-muted/30 p-2">
                <summary className="cursor-pointer">
                  {it.question_key?.replace(/_/g, ' ') || 'voice note'}
                  {it.transcript ? ' — transcript ready' : ' — transcribing…'}
                </summary>
                <audio controls className="w-full my-1.5"
                       src={`/api/proximate/report-items/${it.id}/file`} />
                {it.transcript && (
                  <p className="text-muted-foreground whitespace-pre-wrap" dir="auto">
                    {it.transcript}
                  </p>
                )}
              </details>
            ))}
          </div>
        )}
        {files.map((it) => (
          <div key={it.id} className="flex items-center gap-2 text-xs rounded-md border px-2.5 py-2">
            <span className="uppercase text-[9px] text-muted-foreground w-12">{it.kind}</span>
            <a href={`/api/proximate/report-items/${it.id}/file`}
               className="flex-1 min-w-0 truncate text-primary hover:underline">
              {it.caption || it.filename}
            </a>
            {isOperator && (
              <button
                type="button"
                onClick={() => act(`vis${it.id}`, () =>
                  api.patch(`/api/proximate/report-packages/${pkg.id}/items/${it.id}`,
                            { donor_visible: !it.donor_visible }))}
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[9px] ${
                  it.donor_visible
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-muted text-muted-foreground border-border'}`}
              >
                {it.donor_visible ? 'Donor-visible' : 'Internal'}
              </button>
            )}
            {flagButton(it)}
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No evidence yet.</p>
        )}
      </Card>

      {/* OB decision */}
      {isOperator && pkg.status !== 'published' && (
        <Card className="p-4 space-y-2">
          <h2 className="text-sm font-semibold">Decision</h2>
          <textarea
            value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            placeholder="Notes to the partner (required for changes)…"
            className="w-full text-xs rounded-md border bg-background p-2"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={!!busy || !notes.trim()}
              onClick={() => act('changes', () =>
                api.post(`/api/proximate/report-packages/${pkg.id}/review`,
                         { action: 'request_changes', notes }))}>
              <Undo2 className="w-3.5 h-3.5 me-1" /> Request changes
            </Button>
            <Button size="sm" disabled={!!busy}
              onClick={() => act('publish', () =>
                api.post(`/api/proximate/report-packages/${pkg.id}/review`,
                         { action: 'publish' }))}>
              {busy === 'publish'
                ? <Loader2 className="w-3.5 h-3.5 animate-spin me-1" />
                : <Send className="w-3.5 h-3.5 me-1" />}
              Publish to donor
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Publishing shows the donor the narrative, financials and ONLY
            the items you marked donor-visible. The tally of approved items
            is recorded on the audit chain.
          </p>
        </Card>
      )}
    </div>
  );
}
