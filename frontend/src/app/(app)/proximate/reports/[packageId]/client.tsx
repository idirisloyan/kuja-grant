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
import { labelForProximateStatus } from '@/lib/proximate-status-labels';
import { useTranslation } from '@/lib/hooks/use-translation';

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
  viewer?: 'ob' | 'donor';
  error?: string;
}

// Package status → design-system pill tone.
const STATUS_PILL: Record<string, string> = {
  draft: 'slate',
  submitted: 'warn',
  // PF-UX-008: "changes requested" is a routine revision ask, not a risk —
  // amber (attention), not red. Matches status-badge.tsx (changes_requested
  // = 'attention'). Red is reserved for true risk.
  changes_requested: 'warn',
  published: 'good',
};

export function ProximateReportPackageClient() {
  const { t } = useTranslation();
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
  // Operator = the API said so for THIS session (viewer comes from the
  // package response, so it can never disagree with what the backend served)
  // AND the persona hook agrees. The persona hook alone can serve a stale
  // cached 'ob' after an account switch in the same browser profile, which
  // briefly showed OB-only copy on a donor session.
  const isOperator = data?.viewer === 'ob' && persona === 'ob';

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
      .catch((e) => setError(e instanceof Error ? e.message : t('proximate.reports.load_failed')))
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
      setError(e instanceof Error ? e.message : t('proximate.reports.action_failed'));
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
      t('proximate.reports.fix_prompt'),
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
        ? t('proximate.reports.fix_requested', { msg: it.change_request }) : t('proximate.reports.request_fix')}
      className="shrink-0 inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px]"
      style={it.change_request
        ? { background: 'var(--prox-warn-tint)', color: 'var(--prox-warn)', border: '1px solid color-mix(in srgb, var(--prox-warn) 30%, transparent)' }
        : { background: 'var(--prox-inset)', color: 'var(--prox-muted)', border: '1px solid var(--prox-line)' }}
    >
      <Flag className="w-3 h-3" />
      {it.change_request ? t('proximate.rpkg.flagged') : t('proximate.rpkg.flag')}
    </button>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-4 p-4 md:p-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href={`/proximate/rounds/${data.round?.id}`}
              className="hover:opacity-70" style={{ color: 'var(--prox-muted)' }}>
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg truncate" style={{ fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif', fontWeight: 700 }}>
            {data.partner?.name} — {t('proximate.rpkg.impl_report')}
          </h1>
          <p className="text-xs" style={{ color: 'var(--prox-muted)' }}>{data.round?.title}</p>
        </div>
        <span className={`prox-pill ${STATUS_PILL[pkg.status] || 'slate'}`}>
          {labelForProximateStatus(pkg.status, t) || pkg.status.replace(/_/g, ' ')}
        </span>
        <a href={`/api/proximate/report-packages/${pkg.id}/pdf`}
           className="prox-btn ghost" style={{ height: 32, fontSize: 12, padding: '0 12px' }}>
          <FileDown className="w-3 h-3" /> PDF
        </a>
      </div>

      {error && <p className="text-xs" style={{ color: 'var(--prox-danger)' }}>{error}</p>}

      {/* Narrative */}
      <div className="prox-panel space-y-3" style={{ padding: '16px 18px' }}>
        <div className="flex items-center gap-2">
          <h2 className="flex-1" style={{ fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif', fontWeight: 700, fontSize: 15 }}>{t('proximate.reports.narrative')}</h2>
          {narrative?.source === 'ai' && (
            <span className="prox-pill acc">
              {t('proximate.reports.ai_draft')}
            </span>
          )}
          {isOperator && (
            <button type="button" className="prox-btn ghost" style={{ height: 32, fontSize: 12.5, padding: '0 12px' }} disabled={busy === 'compile'}
              onClick={() => act('compile', () =>
                api.post(`/api/proximate/report-packages/${pkg.id}/compile`, {}))}>
              {busy === 'compile'
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Sparkles className="w-3.5 h-3.5" />}
              {narrative ? t('proximate.reports.recompile') : t('proximate.reports.compile_ai')}
            </button>
          )}
        </div>
        {isOperator && pkg.status !== 'published' ? (
          <div className="space-y-2">
            <textarea
              value={narrative?.summary_en || ''}
              onChange={(e) => setNarrativeField({ summary_en: e.target.value })}
              rows={3} placeholder={t('proximate.reports.summary_ph')}
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
            <button type="button" className="prox-btn ghost" style={{ height: 34, fontSize: 12.5 }} disabled={busy === 'save'}
              onClick={() => act('save', () =>
                api.patch(`/api/proximate/report-packages/${pkg.id}`,
                          { narrative }))}>
              {busy === 'save' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t('proximate.rpkg.save_narrative')}
            </button>
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
                {t('proximate.rpkg.no_narrative')}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Financials */}
      {blocks.length > 0 && (
        <div className="prox-panel space-y-2" style={{ padding: '16px 18px' }}>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="flex-1" style={{ fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif', fontWeight: 700, fontSize: 15 }}>
              {t('proximate.rpkg.financials')}
            </h2>
            {isOperator && (
              <div className="flex items-center gap-1 text-[11px]">
                <span className="text-muted-foreground">
                  {pkg.spend_currency}/USD
                </span>
                <input
                  type="number" inputMode="decimal" min={0}
                  value={rateInput} placeholder={t('proximate.rpkg.rate_ph')}
                  onChange={(e) => setRateInput(e.target.value)}
                  className="w-20 rounded-md border bg-background px-1.5 py-1 text-xs"
                />
                <button type="button" className="prox-btn ghost" style={{ height: 26, fontSize: 10.5, padding: '0 9px' }}
                  disabled={busy === 'rate'}
                  onClick={() => act('rate', () =>
                    api.patch(`/api/proximate/report-packages/${pkg.id}`,
                              { exchange_rate: rateInput ? Number(rateInput) : null }))}>
                  {busy === 'rate' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Set rate'}
                </button>
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
                <p className="font-medium">{approved?.name || t('proximate.reports.general_activity')}
                  {block.people_reached != null && (
                    <span className="text-xs text-muted-foreground font-normal">
                      {' '}· {block.people_reached.toLocaleString()} {block.unit || ''} reached
                    </span>
                  )}
                </p>
                {Object.entries(block.spend || {}).map(([label, amount]) => (
                  <div key={label} className="flex items-center gap-2 text-xs">
                    <span className="flex-1 min-w-0 truncate">{label}</span>
                    <span className="prox-mono" style={{ fontSize: 12 }}>
                      {Number(amount).toLocaleString()} {pkg.spend_currency}
                    </span>
                    {pkg.exchange_rate ? (
                      <span className="prox-mono" style={{ fontSize: 12, color: 'var(--prox-muted)' }}>
                        ≈ {Math.round(Number(amount) / pkg.exchange_rate).toLocaleString()} USD
                      </span>
                    ) : null}
                    {approvedLines.has(label) && (
                      <span className="prox-mono" style={{ fontSize: 12, color: 'var(--prox-muted)' }}>
                        / approved {Number(approvedLines.get(label)).toLocaleString()} USD
                      </span>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Media — the safeguarding gate */}
      <div className="prox-panel space-y-3" style={{ padding: '16px 18px' }}>
        <div className="flex items-center gap-2">
          <h2 className="flex-1" style={{ fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif', fontWeight: 700, fontSize: 15 }}>
            {t('proximate.rpkg.evidence', { n: items.length })}
          </h2>
          {isOperator ? (
            <p className="text-[10px] text-muted-foreground">
              {t('proximate.rpkg.internal_until_visible')}
            </p>
          ) : (
            <p className="text-[10px] text-muted-foreground">
              {t('proximate.rpkg.passed_review')}
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
                      title={it.donor_visible ? t('proximate.reports.donor_visible_hide')
                                              : t('proximate.reports.internal_only_approve')}
                      onClick={() => act(`vis${it.id}`, () =>
                        api.patch(`/api/proximate/report-packages/${pkg.id}/items/${it.id}`,
                                  { donor_visible: !it.donor_visible }))}
                      className="shrink-0 inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px]"
                      style={it.donor_visible
                        ? { background: 'var(--prox-good-tint)', color: 'var(--prox-good)', border: '1px solid color-mix(in srgb, var(--prox-good) 30%, transparent)' }
                        : { background: 'var(--prox-inset)', color: 'var(--prox-muted)', border: '1px solid var(--prox-line)' }}
                    >
                      {it.donor_visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      {it.donor_visible ? t('proximate.rpkg.donor') : t('proximate.rpkg.internal')}
                    </button>
                  )}
                  {flagButton(it)}
                </figcaption>
                {it.change_request && isOperator && (
                  <p className="px-1.5 pb-1.5 text-[9px]" style={{ color: 'var(--prox-warn)' }}>
                    {t('proximate.rpkg.fix_requested', { msg: it.change_request })}
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
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px]"
                  style={it.donor_visible
                    ? { background: 'var(--prox-good-tint)', color: 'var(--prox-good)', border: '1px solid color-mix(in srgb, var(--prox-good) 30%, transparent)' }
                    : { background: 'var(--prox-inset)', color: 'var(--prox-muted)', border: '1px solid var(--prox-line)' }}
                >
                  {it.donor_visible ? t('proximate.rpkg.donor_visible') : t('proximate.rpkg.internal')}
                </button>
              )}
              {flagButton(it)}
            </div>
            {it.change_request && isOperator && (
              <p className="text-[10px]" style={{ color: 'var(--prox-warn)' }}>
                {t('proximate.rpkg.fix_requested', { msg: it.change_request })}
              </p>
            )}
          </div>
        ))}
        {voices.length > 0 && isOperator && (
          <div className="space-y-2">
            <p className="text-xs font-medium">{t('proximate.rpkg.voice_answers')}</p>
            {voices.map((it) => (
              <details key={it.id} className="text-xs rounded-md border bg-muted/30 p-2">
                <summary className="cursor-pointer">
                  {it.question_key?.replace(/_/g, ' ') || t('proximate.rpkg.voice_note')}
                  {it.transcript ? t('proximate.rpkg.transcript_ready') : t('proximate.rpkg.transcribing')}
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
               className="flex-1 min-w-0 truncate hover:underline" style={{ color: 'var(--prox-accent)' }}>
              {it.caption || it.filename}
            </a>
            {isOperator && (
              <button
                type="button"
                onClick={() => act(`vis${it.id}`, () =>
                  api.patch(`/api/proximate/report-packages/${pkg.id}/items/${it.id}`,
                            { donor_visible: !it.donor_visible }))}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px]"
                style={it.donor_visible
                  ? { background: 'var(--prox-good-tint)', color: 'var(--prox-good)', border: '1px solid color-mix(in srgb, var(--prox-good) 30%, transparent)' }
                  : { background: 'var(--prox-inset)', color: 'var(--prox-muted)', border: '1px solid var(--prox-line)' }}
              >
                {it.donor_visible ? t('proximate.rpkg.donor_visible') : t('proximate.rpkg.internal')}
              </button>
            )}
            {flagButton(it)}
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground italic">{t('proximate.rpkg.no_evidence')}</p>
        )}
      </div>

      {/* OB decision */}
      {isOperator && pkg.status !== 'published' && (
        <div className="prox-panel space-y-2" style={{ padding: '16px 18px' }}>
          <h2 style={{ fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif', fontWeight: 700, fontSize: 15 }}>{t('proximate.rpkg.decision')}</h2>
          <textarea
            value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            placeholder={t('proximate.reports.notes_ph')}
            className="w-full text-xs rounded-md border bg-background p-2"
          />
          <div className="flex items-center gap-2">
            <button type="button" className="prox-btn ghost" style={{ height: 36, fontSize: 12.5 }} disabled={!!busy || !notes.trim()}
              onClick={() => act('changes', () =>
                api.post(`/api/proximate/report-packages/${pkg.id}/review`,
                         { action: 'request_changes', notes }))}>
              <Undo2 className="w-3.5 h-3.5" /> {t('proximate.rpkg.request_changes')}
            </button>
            <button type="button" className="prox-btn primary" style={{ height: 36, fontSize: 12.5 }} disabled={!!busy}
              onClick={() => act('publish', () =>
                api.post(`/api/proximate/report-packages/${pkg.id}/review`,
                         { action: 'publish' }))}>
              {busy === 'publish'
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Send className="w-3.5 h-3.5" />}
              {t('proximate.rpkg.publish')}
            </button>
          </div>
          <p className="text-[10px]" style={{ color: 'var(--prox-muted)' }}>
            {t('proximate.rpkg.publish_hint')}
          </p>
        </div>
      )}
    </div>
  );
}
