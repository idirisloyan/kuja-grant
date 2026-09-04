'use client';

/**
 * Phase 721b — Upload signed agreement → AI extraction → review wizard.
 *
 * The Proximate grant lifecycle starts AFTER Adeso wins a grant:
 *   1. OB uploads the actual signed agreement PDF
 *   2. AI extracts terms (deliverables, reporting, restrictions, flags)
 *   3. OB reviews / edits / deletes / adds — nothing saved until accept
 *   4. Accept → grant row created → detail page
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Loader2, UploadCloud, FileText, Sparkles, Plus, X,
  CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { api } from '@/lib/api';
import {
  PageShell, PageHeader, PageMain, PageBack,
} from '@/components/layout/page-shell';
import { useTranslation } from '@/lib/hooks/use-translation';

interface Donor { id: number; display_name: string; contact_email: string | null }

interface Deliverable { title: string; target?: number | null; unit?: string }
interface ReportingReq { type: string; cadence: string; due_days_after_period?: number | null }
interface Contact { name: string; role?: string; email?: string }

interface Extracted {
  donor: string;
  title_suggested: string;
  donor_grant_ref: string;
  agreement_date: string;
  total_amount: string;
  total_amount_usd: number | null;
  currency: string;
  duration_months: number | null;
  start_date: string;
  end_date: string;
  reporting_cadence_suggested: string;
  key_deliverables: Deliverable[];
  reporting_requirements: ReportingReq[];
  restrictions_verbatim: string;
  restrictions: { geographies?: string[]; sectors?: string[]; purpose?: string };
  compliance_flags: string[];
  key_contacts: Contact[];
  extraction_confidence: number | null;
  not_an_agreement_reason: string;
}

interface ExtractResponse {
  success: boolean;
  document_id: number;
  extracted: Extracted;
  extracted_model: string;
  donor_match: { id: number; display_name: string } | null;
  error?: string;
}

const CADENCES = ['monthly', 'quarterly', 'semi_annual', 'annual', 'one_time'];

export default function ProximateGrantWizardPage() {
  const { t } = useTranslation();
  const EXTRACT_STAGES = [
    t('proximate.gw.stage_reading'),
    t('proximate.gw.stage_deliverables'),
    t('proximate.gw.stage_reporting'),
    t('proximate.gw.stage_restrictions'),
    t('proximate.gw.stage_flags'),
  ];
  const [step, setStep] = useState<'upload' | 'extracting' | 'review' | 'saving'>('upload');
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [stageIdx, setStageIdx] = useState(0);
  const [donors, setDonors] = useState<Donor[]>([]);
  const [documentId, setDocumentId] = useState<number | null>(null);
  const [extractedModel, setExtractedModel] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Review-step editable state
  const [ex, setEx] = useState<Extracted | null>(null);
  const [title, setTitle] = useState('');
  const [donorId, setDonorId] = useState<string>('');
  const [ref, setRef] = useState('');
  const [amountUsd, setAmountUsd] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [cadence, setCadence] = useState('quarterly');
  const [geos, setGeos] = useState('');
  const [sectors, setSectors] = useState('');
  const [purpose, setPurpose] = useState('');
  const [newFlag, setNewFlag] = useState('');

  const cadenceLabel = (c: string) => {
    const v = t(`proximate.gw.cadence.${c}`);
    return v === `proximate.gw.cadence.${c}` ? c.replace('_', '-') : v;
  };

  useEffect(() => {
    api.get<{ success: boolean; donors: Donor[] }>('/api/proximate/donors')
      .then((r) => setDonors(r.donors || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (step !== 'extracting') return;
    const iv = setInterval(
      () => setStageIdx((i) => (i + 1) % EXTRACT_STAGES.length), 4000,
    );
    return () => clearInterval(iv);
  }, [step, EXTRACT_STAGES.length]);

  async function runExtraction() {
    if (!file) return;
    setError(null);
    setStep('extracting');
    setStageIdx(0);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.upload<ExtractResponse>(
        '/api/proximate/grants/extract-agreement', fd,
      );
      const e = r.extracted;
      setEx(e);
      setDocumentId(r.document_id);
      setExtractedModel(r.extracted_model || '');
      setTitle(e.title_suggested || file.name.replace(/\.pdf$/i, ''));
      setDonorId(r.donor_match ? String(r.donor_match.id) : '');
      setRef(e.donor_grant_ref || '');
      setAmountUsd(
        e.total_amount_usd !== null && e.total_amount_usd !== undefined
          ? String(e.total_amount_usd) : '',
      );
      setCurrency(e.currency || 'USD');
      setStartDate(e.start_date || '');
      setEndDate(e.end_date || '');
      setCadence(e.reporting_cadence_suggested || 'quarterly');
      setGeos((e.restrictions?.geographies || []).join(', '));
      setSectors((e.restrictions?.sectors || []).join(', '));
      setPurpose(e.restrictions?.purpose || '');
      setStep('review');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('proximate.gw.extract_failed');
      setError(msg);
      setStep('upload');
    }
  }

  function patchEx(patch: Partial<Extracted>) {
    setEx((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  async function acceptAndCreate() {
    if (!ex) return;
    if (!title.trim()) { setError(t('proximate.gw.title_required')); return; }
    setError(null);
    setStep('saving');
    try {
      const finalExtracted = {
        ...ex,
        restrictions: {
          geographies: geos.split(',').map((s) => s.trim()).filter(Boolean),
          sectors: sectors.split(',').map((s) => s.trim()).filter(Boolean),
          purpose: purpose.trim(),
        },
      };
      const r = await api.post<{ success: boolean; grant: { id: number } }>(
        '/api/proximate/grants',
        {
          title: title.trim(),
          donor_id: donorId ? Number(donorId) : null,
          donor_grant_ref: ref.trim() || null,
          amount_committed_usd: amountUsd ? Number(amountUsd) : null,
          currency,
          start_date: startDate || null,
          end_date: endDate || null,
          reporting_cadence: cadence,
          restrictions: finalExtracted.restrictions,
          signed_at: ex.agreement_date || true,
          status: 'active',
          extracted: finalExtracted,
          extracted_model: extractedModel,
          signed_agreement_doc_id: documentId,
        },
      );
      window.location.href = `/proximate/admin/grants/${r.grant.id}`;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('proximate.gw.create_failed');
      setError(msg);
      setStep('review');
    }
  }

  const confidence = ex?.extraction_confidence ?? null;
  const confidencePct = confidence !== null ? Math.round(confidence * 100) : null;

  return (
    <PageShell>
      {/* PFX-04SEP-NAV-001: shared back component, above the header. */}
      <PageBack href="/proximate/grants" label={t('proximate.gw.back')} />
      <PageHeader
        title={t('proximate.gw.title')}
        subtitle={t('proximate.gw.subtitle')}
      />
      <PageMain>
        <div className="max-w-3xl space-y-4">

          {error && (
            <div className="prox-panel" style={{ padding: '12px', border: '1px solid color-mix(in srgb, var(--prox-danger) 40%, transparent)', background: 'var(--prox-danger-tint)' }}>
              <p className="text-sm flex items-start gap-2" style={{ color: 'var(--prox-danger)' }}>
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
              </p>
            </div>
          )}

          {step === 'upload' && (
            <div className="prox-panel" style={{ padding: '24px' }}>
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) setFile(f);
                }}
              >
                <UploadCloud className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
                {file ? (
                  <p className="text-sm font-medium flex items-center justify-center gap-2">
                    <FileText className="w-4 h-4" /> {file.name}
                    <span className="prox-mono text-xs" style={{ color: 'var(--prox-muted)' }}>
                      ({(file.size / (1024 * 1024)).toFixed(1)} MB)
                    </span>
                  </p>
                ) : (
                  <>
                    <p className="text-sm font-medium">
                      {t('proximate.gw.drop')}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('proximate.gw.drop_hint')}
                    </p>
                  </>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </div>
              <button
                onClick={runExtraction}
                disabled={!file}
                className="prox-btn primary mt-4 w-full justify-center disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Sparkles className="w-4 h-4" />
                {t('proximate.gw.extract_btn')}
              </button>
            </div>
          )}

          {step === 'extracting' && (
            <div className="prox-panel text-center" style={{ padding: '40px' }}>
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" style={{ color: 'var(--prox-accent)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--prox-ink)' }}>{EXTRACT_STAGES[stageIdx]}</p>
              <p className="text-xs mt-2" style={{ color: 'var(--prox-muted)' }}>
                {t('proximate.gw.extract_wait')}
              </p>
            </div>
          )}

          {(step === 'review' || step === 'saving') && ex && (
            <div className="space-y-4">
              {/* Confidence + not-an-agreement warning */}
              <div className="prox-panel flex items-center justify-between flex-wrap gap-2" style={{ padding: '16px' }}>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4" style={{ color: 'var(--prox-accent)' }} />
                  <p className="text-sm font-medium" style={{ color: 'var(--prox-ink)' }}>{t('proximate.gw.extract_complete')}</p>
                  {confidencePct !== null && (
                    <span className={`prox-pill ${confidencePct >= 80 ? 'good' : 'warn'}`}>
                      {t('proximate.gw.confidence', { pct: confidencePct })}
                    </span>
                  )}
                </div>
                <p className="text-xs" style={{ color: 'var(--prox-muted)' }}>
                  {t('proximate.gw.review_every_field')}
                </p>
              </div>
              {ex.not_an_agreement_reason && (
                <div className="prox-panel" style={{ padding: '12px', border: '1px solid color-mix(in srgb, var(--prox-warn) 40%, transparent)', background: 'var(--prox-warn-tint)' }}>
                  <p className="text-sm" style={{ color: 'var(--prox-warn)' }}>
                    {t('proximate.gw.not_agreement')}{' '}
                    {ex.not_an_agreement_reason}
                  </p>
                </div>
              )}

              {/* Basics */}
              <div className="prox-panel space-y-3" style={{ padding: '18px' }}>
                <p className="text-sm" style={{ fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif', fontWeight: 700, color: 'var(--prox-ink)' }}>{t('proximate.gw.basics')}</p>
                <div className="grid md:grid-cols-2 gap-3">
                  <label className="block md:col-span-2">
                    <span className="prox-eyebrow">{t('proximate.gw.grant_title')}</span>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="mt-1 w-full rounded-md px-3 py-2 text-sm border border-[color:var(--prox-line)] bg-[color:var(--prox-surface)] text-[color:var(--prox-ink)]"
                    />
                  </label>
                  <label className="block">
                    <span className="prox-eyebrow">
                      {t('proximate.gw.donor_extracted', { donor: ex.donor || '—' })}
                    </span>
                    <select
                      value={donorId}
                      onChange={(e) => setDonorId(e.target.value)}
                      className="mt-1 w-full rounded-md px-3 py-2 text-sm border border-[color:var(--prox-line)] bg-[color:var(--prox-surface)] text-[color:var(--prox-ink)]"
                    >
                      <option value="">{t('proximate.gw.not_in_registry')}</option>
                      {donors.map((d) => (
                        <option key={d.id} value={d.id}>{d.display_name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="prox-eyebrow">{t('proximate.gw.donor_ref')}</span>
                    <input
                      value={ref}
                      onChange={(e) => setRef(e.target.value)}
                      className="mt-1 w-full rounded-md px-3 py-2 text-sm border border-[color:var(--prox-line)] bg-[color:var(--prox-surface)] text-[color:var(--prox-ink)]"
                    />
                  </label>
                  <label className="block">
                    <span className="prox-eyebrow">
                      {ex.total_amount
                        ? t('proximate.gw.committed_extracted', { amount: ex.total_amount })
                        : t('proximate.gw.committed')}
                    </span>
                    <input
                      type="number"
                      value={amountUsd}
                      onChange={(e) => setAmountUsd(e.target.value)}
                      className="prox-mono mt-1 w-full rounded-md px-3 py-2 text-sm border border-[color:var(--prox-line)] bg-[color:var(--prox-surface)] text-[color:var(--prox-ink)]"
                    />
                  </label>
                  <label className="block">
                    <span className="prox-eyebrow">{t('proximate.gw.currency')}</span>
                    <input
                      value={currency}
                      maxLength={3}
                      onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                      className="mt-1 w-full rounded-md px-3 py-2 text-sm border border-[color:var(--prox-line)] bg-[color:var(--prox-surface)] text-[color:var(--prox-ink)]"
                    />
                  </label>
                  <label className="block">
                    <span className="prox-eyebrow">{t('proximate.gw.start_date')}</span>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="mt-1 w-full rounded-md px-3 py-2 text-sm border border-[color:var(--prox-line)] bg-[color:var(--prox-surface)] text-[color:var(--prox-ink)]"
                    />
                  </label>
                  <label className="block">
                    <span className="prox-eyebrow">{t('proximate.gw.end_date')}</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="mt-1 w-full rounded-md px-3 py-2 text-sm border border-[color:var(--prox-line)] bg-[color:var(--prox-surface)] text-[color:var(--prox-ink)]"
                    />
                  </label>
                  <label className="block">
                    <span className="prox-eyebrow">{t('proximate.gw.reporting_cadence')}</span>
                    <select
                      value={cadence}
                      onChange={(e) => setCadence(e.target.value)}
                      className="mt-1 w-full rounded-md px-3 py-2 text-sm border border-[color:var(--prox-line)] bg-[color:var(--prox-surface)] text-[color:var(--prox-ink)]"
                    >
                      {CADENCES.map((c) => (
                        <option key={c} value={c}>{cadenceLabel(c)}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              {/* Deliverables */}
              <div className="prox-panel space-y-2" style={{ padding: '18px' }}>
                <p className="text-sm" style={{ fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif', fontWeight: 700, color: 'var(--prox-ink)' }}>
                  {t('proximate.gw.deliverables', { n: ex.key_deliverables.length })}
                </p>
                {ex.key_deliverables.map((d, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      value={d.title}
                      onChange={(e) => {
                        const next = [...ex.key_deliverables];
                        next[i] = { ...next[i], title: e.target.value };
                        patchEx({ key_deliverables: next });
                      }}
                      className="flex-1 rounded-md px-2 py-1.5 text-sm border border-[color:var(--prox-line)] bg-[color:var(--prox-surface)] text-[color:var(--prox-ink)]"
                      placeholder={t('proximate.gw.deliverable_ph')}
                    />
                    <input
                      type="number"
                      value={d.target ?? ''}
                      onChange={(e) => {
                        const next = [...ex.key_deliverables];
                        next[i] = {
                          ...next[i],
                          target: e.target.value === '' ? null : Number(e.target.value),
                        };
                        patchEx({ key_deliverables: next });
                      }}
                      className="w-24 rounded-md px-2 py-1.5 text-sm border border-[color:var(--prox-line)] bg-[color:var(--prox-surface)] text-[color:var(--prox-ink)]"
                      placeholder={t('proximate.gw.target_ph')}
                    />
                    <input
                      value={d.unit ?? ''}
                      onChange={(e) => {
                        const next = [...ex.key_deliverables];
                        next[i] = { ...next[i], unit: e.target.value };
                        patchEx({ key_deliverables: next });
                      }}
                      className="w-28 rounded-md px-2 py-1.5 text-sm border border-[color:var(--prox-line)] bg-[color:var(--prox-surface)] text-[color:var(--prox-ink)]"
                      placeholder={t('proximate.gw.unit_ph')}
                    />
                    <button
                      onClick={() =>
                        patchEx({
                          key_deliverables: ex.key_deliverables.filter((_, j) => j !== i),
                        })
                      }
                      className="p-1.5 text-[color:var(--prox-muted)] hover:text-[color:var(--prox-danger)]"
                      aria-label={t('proximate.gw.remove_deliverable')}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() =>
                    patchEx({
                      key_deliverables: [
                        ...ex.key_deliverables,
                        { title: '', target: null, unit: '' },
                      ],
                    })
                  }
                  className="text-xs inline-flex items-center gap-1 hover:underline"
                  style={{ color: 'var(--prox-accent)' }}
                >
                  <Plus className="w-3 h-3" /> {t('proximate.gw.add_deliverable')}
                </button>
              </div>

              {/* Reporting requirements */}
              <div className="prox-panel space-y-2" style={{ padding: '18px' }}>
                <p className="text-sm" style={{ fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif', fontWeight: 700, color: 'var(--prox-ink)' }}>
                  {t('proximate.gw.reporting_reqs', { n: ex.reporting_requirements.length })}
                </p>
                {ex.reporting_requirements.map((r, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      value={r.type}
                      onChange={(e) => {
                        const next = [...ex.reporting_requirements];
                        next[i] = { ...next[i], type: e.target.value };
                        patchEx({ reporting_requirements: next });
                      }}
                      className="flex-1 rounded-md px-2 py-1.5 text-sm border border-[color:var(--prox-line)] bg-[color:var(--prox-surface)] text-[color:var(--prox-ink)]"
                      placeholder={t('proximate.gw.report_type_ph')}
                    />
                    <select
                      value={r.cadence}
                      onChange={(e) => {
                        const next = [...ex.reporting_requirements];
                        next[i] = { ...next[i], cadence: e.target.value };
                        patchEx({ reporting_requirements: next });
                      }}
                      className="w-32 rounded-md px-2 py-1.5 text-sm border border-[color:var(--prox-line)] bg-[color:var(--prox-surface)] text-[color:var(--prox-ink)]"
                    >
                      {CADENCES.map((c) => (
                        <option key={c} value={c}>{cadenceLabel(c)}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={r.due_days_after_period ?? ''}
                      onChange={(e) => {
                        const next = [...ex.reporting_requirements];
                        next[i] = {
                          ...next[i],
                          due_days_after_period:
                            e.target.value === '' ? null : Number(e.target.value),
                        };
                        patchEx({ reporting_requirements: next });
                      }}
                      className="w-24 rounded-md px-2 py-1.5 text-sm border border-[color:var(--prox-line)] bg-[color:var(--prox-surface)] text-[color:var(--prox-ink)]"
                      placeholder={t('proximate.gw.due_days_ph')}
                      title={t('proximate.gw.due_days_tip')}
                    />
                    <button
                      onClick={() =>
                        patchEx({
                          reporting_requirements:
                            ex.reporting_requirements.filter((_, j) => j !== i),
                        })
                      }
                      className="p-1.5 text-[color:var(--prox-muted)] hover:text-[color:var(--prox-danger)]"
                      aria-label={t('proximate.gw.remove_requirement')}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() =>
                    patchEx({
                      reporting_requirements: [
                        ...ex.reporting_requirements,
                        { type: '', cadence: 'quarterly', due_days_after_period: 45 },
                      ],
                    })
                  }
                  className="text-xs inline-flex items-center gap-1 hover:underline"
                  style={{ color: 'var(--prox-accent)' }}
                >
                  <Plus className="w-3 h-3" /> {t('proximate.gw.add_requirement')}
                </button>
              </div>

              {/* Restrictions */}
              <div className="prox-panel space-y-3" style={{ padding: '18px' }}>
                <p className="text-sm" style={{ fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif', fontWeight: 700, color: 'var(--prox-ink)' }}>{t('proximate.gw.restrictions')}</p>
                <label className="block">
                  <span className="prox-eyebrow">
                    {t('proximate.gw.verbatim')}
                  </span>
                  <textarea
                    value={ex.restrictions_verbatim}
                    onChange={(e) => patchEx({ restrictions_verbatim: e.target.value })}
                    rows={3}
                    className="mt-1 w-full rounded-md px-3 py-2 text-sm border border-[color:var(--prox-line)] bg-[color:var(--prox-surface)] text-[color:var(--prox-ink)]"
                  />
                </label>
                <div className="grid md:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="prox-eyebrow">
                      {t('proximate.gw.geographies')}
                    </span>
                    <input
                      value={geos}
                      onChange={(e) => setGeos(e.target.value)}
                      className="mt-1 w-full rounded-md px-3 py-2 text-sm border border-[color:var(--prox-line)] bg-[color:var(--prox-surface)] text-[color:var(--prox-ink)]"
                    />
                  </label>
                  <label className="block">
                    <span className="prox-eyebrow">
                      {t('proximate.gw.sectors')}
                    </span>
                    <input
                      value={sectors}
                      onChange={(e) => setSectors(e.target.value)}
                      className="mt-1 w-full rounded-md px-3 py-2 text-sm border border-[color:var(--prox-line)] bg-[color:var(--prox-surface)] text-[color:var(--prox-ink)]"
                    />
                  </label>
                  <label className="block md:col-span-2">
                    <span className="prox-eyebrow">{t('proximate.gw.purpose')}</span>
                    <input
                      value={purpose}
                      onChange={(e) => setPurpose(e.target.value)}
                      className="mt-1 w-full rounded-md px-3 py-2 text-sm border border-[color:var(--prox-line)] bg-[color:var(--prox-surface)] text-[color:var(--prox-ink)]"
                    />
                  </label>
                </div>
              </div>

              {/* Compliance flags */}
              <div className="prox-panel space-y-2" style={{ padding: '18px' }}>
                <p className="text-sm" style={{ fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif', fontWeight: 700, color: 'var(--prox-ink)' }}>
                  {t('proximate.gw.compliance_flags', { n: ex.compliance_flags.length })}
                </p>
                <div className="flex flex-wrap gap-2">
                  {ex.compliance_flags.map((f, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 text-xs font-medium rounded-full px-2.5 py-1"
                      style={{ background: 'var(--prox-slate-tint)', color: 'var(--prox-slate)' }}
                    >
                      {f}
                      <button
                        onClick={() =>
                          patchEx({
                            compliance_flags:
                              ex.compliance_flags.filter((_, j) => j !== i),
                          })
                        }
                        aria-label={t('proximate.gw.remove_flag', { flag: f })}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={newFlag}
                    onChange={(e) => setNewFlag(e.target.value)}
                    placeholder={t('proximate.gw.flag_ph')}
                    className="flex-1 rounded-md px-2 py-1.5 text-sm border border-[color:var(--prox-line)] bg-[color:var(--prox-surface)] text-[color:var(--prox-ink)]"
                  />
                  <button
                    onClick={() => {
                      const v = newFlag.trim().toLowerCase().replace(/\s+/g, '_');
                      if (!v) return;
                      patchEx({ compliance_flags: [...ex.compliance_flags, v] });
                      setNewFlag('');
                    }}
                    className="text-xs px-3 py-1.5 rounded-md border hover:bg-muted"
                  >
                    {t('proximate.gw.add')}
                  </button>
                </div>
              </div>

              {/* Accept */}
              <div className="flex items-center gap-3">
                <button
                  onClick={acceptAndCreate}
                  disabled={step === 'saving'}
                  className="prox-btn primary disabled:opacity-50"
                >
                  {step === 'saving'
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <CheckCircle2 className="w-4 h-4" />}
                  {t('proximate.gw.accept_create')}
                </button>
                <button
                  onClick={() => { setStep('upload'); setEx(null); setFile(null); }}
                  disabled={step === 'saving'}
                  className="text-sm hover:underline"
                  style={{ color: 'var(--prox-muted)' }}
                >
                  {t('proximate.gw.start_over')}
                </button>
              </div>
            </div>
          )}
        </div>
      </PageMain>
    </PageShell>
  );
}
