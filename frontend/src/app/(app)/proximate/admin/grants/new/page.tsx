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
  Loader2, UploadCloud, FileText, Sparkles, Plus, X, ArrowLeft,
  CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';

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

const EXTRACT_STAGES = [
  'Reading the agreement…',
  'Extracting deliverables and targets…',
  'Mapping reporting requirements…',
  'Quoting restriction clauses…',
  'Flagging compliance obligations…',
];

export default function ProximateGrantWizardPage() {
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

  useEffect(() => {
    api.get<{ success: boolean; donors: Donor[] }>('/api/proximate/donors')
      .then((r) => setDonors(r.donors || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (step !== 'extracting') return;
    const t = setInterval(
      () => setStageIdx((i) => (i + 1) % EXTRACT_STAGES.length), 4000,
    );
    return () => clearInterval(t);
  }, [step]);

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
      const msg = err instanceof Error ? err.message : 'Extraction failed — try again.';
      setError(msg);
      setStep('upload');
    }
  }

  function patchEx(patch: Partial<Extracted>) {
    setEx((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  async function acceptAndCreate() {
    if (!ex) return;
    if (!title.trim()) { setError('Give the grant a title.'); return; }
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
      const msg = err instanceof Error ? err.message : 'Could not create the grant.';
      setError(msg);
      setStep('review');
    }
  }

  const confidence = ex?.extraction_confidence ?? null;
  const confidencePct = confidence !== null ? Math.round(confidence * 100) : null;

  return (
    <PageShell>
      <PageHeader
        title="New grant from signed agreement"
        subtitle="Upload the signed PDF — AI extracts the terms, you review and accept. Nothing is saved until you accept."
      />
      <PageMain>
        <div className="max-w-3xl space-y-4">
          <Link
            href="/proximate/grants"
            className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:underline"
          >
            <ArrowLeft className="w-3 h-3" /> Back to grants
          </Link>

          {error && (
            <Card className="p-3 border-rose-300 bg-rose-50">
              <p className="text-sm text-rose-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
              </p>
            </Card>
          )}

          {step === 'upload' && (
            <Card className="p-6">
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
                    <span className="text-xs text-muted-foreground">
                      ({(file.size / (1024 * 1024)).toFixed(1)} MB)
                    </span>
                  </p>
                ) : (
                  <>
                    <p className="text-sm font-medium">
                      Drop the signed agreement here, or click to choose
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Text-based PDF (not a scan), up to 15 MB
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
                className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Sparkles className="w-4 h-4" />
                Extract terms with AI
              </button>
            </Card>
          )}

          {step === 'extracting' && (
            <Card className="p-10 text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-emerald-600 mb-4" />
              <p className="text-sm font-medium">{EXTRACT_STAGES[stageIdx]}</p>
              <p className="text-xs text-muted-foreground mt-2">
                Usually 20–60 seconds for a full agreement.
              </p>
            </Card>
          )}

          {(step === 'review' || step === 'saving') && ex && (
            <div className="space-y-4">
              {/* Confidence + not-an-agreement warning */}
              <Card className="p-4 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <p className="text-sm font-medium">AI extraction complete</p>
                  {confidencePct !== null && (
                    <Badge
                      variant="outline"
                      className={
                        confidencePct >= 80
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : 'bg-amber-50 text-amber-800 border-amber-300'
                      }
                    >
                      {confidencePct}% confidence
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Review every field — you are accepting a legal record.
                </p>
              </Card>
              {ex.not_an_agreement_reason && (
                <Card className="p-3 border-amber-300 bg-amber-50">
                  <p className="text-sm text-amber-800">
                    ⚠ The AI doubts this is a grant agreement:{' '}
                    {ex.not_an_agreement_reason}
                  </p>
                </Card>
              )}

              {/* Basics */}
              <Card className="p-4 space-y-3">
                <p className="text-sm font-semibold">Grant basics</p>
                <div className="grid md:grid-cols-2 gap-3">
                  <label className="block md:col-span-2">
                    <span className="text-xs text-muted-foreground">Title</span>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted-foreground">
                      Donor (extracted: {ex.donor || '—'})
                    </span>
                    <select
                      value={donorId}
                      onChange={(e) => setDonorId(e.target.value)}
                      className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background"
                    >
                      <option value="">— not in registry —</option>
                      {donors.map((d) => (
                        <option key={d.id} value={d.id}>{d.display_name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted-foreground">Donor reference</span>
                    <input
                      value={ref}
                      onChange={(e) => setRef(e.target.value)}
                      className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted-foreground">
                      Committed (USD{ex.total_amount ? ` — extracted: ${ex.total_amount}` : ''})
                    </span>
                    <input
                      type="number"
                      value={amountUsd}
                      onChange={(e) => setAmountUsd(e.target.value)}
                      className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted-foreground">Currency</span>
                    <input
                      value={currency}
                      maxLength={3}
                      onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                      className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted-foreground">Start date</span>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted-foreground">End date</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted-foreground">Reporting cadence</span>
                    <select
                      value={cadence}
                      onChange={(e) => setCadence(e.target.value)}
                      className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background"
                    >
                      {CADENCES.map((c) => (
                        <option key={c} value={c}>{c.replace('_', '-')}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </Card>

              {/* Deliverables */}
              <Card className="p-4 space-y-2">
                <p className="text-sm font-semibold">
                  Key deliverables ({ex.key_deliverables.length})
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
                      className="flex-1 border rounded-md px-2 py-1.5 text-sm bg-background"
                      placeholder="Deliverable"
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
                      className="w-24 border rounded-md px-2 py-1.5 text-sm bg-background"
                      placeholder="Target"
                    />
                    <input
                      value={d.unit ?? ''}
                      onChange={(e) => {
                        const next = [...ex.key_deliverables];
                        next[i] = { ...next[i], unit: e.target.value };
                        patchEx({ key_deliverables: next });
                      }}
                      className="w-28 border rounded-md px-2 py-1.5 text-sm bg-background"
                      placeholder="Unit"
                    />
                    <button
                      onClick={() =>
                        patchEx({
                          key_deliverables: ex.key_deliverables.filter((_, j) => j !== i),
                        })
                      }
                      className="p-1.5 text-muted-foreground hover:text-rose-600"
                      aria-label="Remove deliverable"
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
                  className="text-xs inline-flex items-center gap-1 text-emerald-700 hover:underline"
                >
                  <Plus className="w-3 h-3" /> Add deliverable
                </button>
              </Card>

              {/* Reporting requirements */}
              <Card className="p-4 space-y-2">
                <p className="text-sm font-semibold">
                  Reporting requirements ({ex.reporting_requirements.length})
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
                      className="flex-1 border rounded-md px-2 py-1.5 text-sm bg-background"
                      placeholder="Report type (e.g. financial)"
                    />
                    <select
                      value={r.cadence}
                      onChange={(e) => {
                        const next = [...ex.reporting_requirements];
                        next[i] = { ...next[i], cadence: e.target.value };
                        patchEx({ reporting_requirements: next });
                      }}
                      className="w-32 border rounded-md px-2 py-1.5 text-sm bg-background"
                    >
                      {CADENCES.map((c) => (
                        <option key={c} value={c}>{c.replace('_', '-')}</option>
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
                      className="w-24 border rounded-md px-2 py-1.5 text-sm bg-background"
                      placeholder="Due +days"
                      title="Days after period end that the report is due"
                    />
                    <button
                      onClick={() =>
                        patchEx({
                          reporting_requirements:
                            ex.reporting_requirements.filter((_, j) => j !== i),
                        })
                      }
                      className="p-1.5 text-muted-foreground hover:text-rose-600"
                      aria-label="Remove requirement"
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
                  className="text-xs inline-flex items-center gap-1 text-emerald-700 hover:underline"
                >
                  <Plus className="w-3 h-3" /> Add requirement
                </button>
              </Card>

              {/* Restrictions */}
              <Card className="p-4 space-y-3">
                <p className="text-sm font-semibold">Restrictions</p>
                <label className="block">
                  <span className="text-xs text-muted-foreground">
                    Verbatim clauses (quoted from the agreement)
                  </span>
                  <textarea
                    value={ex.restrictions_verbatim}
                    onChange={(e) => patchEx({ restrictions_verbatim: e.target.value })}
                    rows={3}
                    className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background"
                  />
                </label>
                <div className="grid md:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs text-muted-foreground">
                      Geographies (comma-separated)
                    </span>
                    <input
                      value={geos}
                      onChange={(e) => setGeos(e.target.value)}
                      className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted-foreground">
                      Sectors (comma-separated)
                    </span>
                    <input
                      value={sectors}
                      onChange={(e) => setSectors(e.target.value)}
                      className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background"
                    />
                  </label>
                  <label className="block md:col-span-2">
                    <span className="text-xs text-muted-foreground">Purpose (one line)</span>
                    <input
                      value={purpose}
                      onChange={(e) => setPurpose(e.target.value)}
                      className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background"
                    />
                  </label>
                </div>
              </Card>

              {/* Compliance flags */}
              <Card className="p-4 space-y-2">
                <p className="text-sm font-semibold">
                  Compliance flags ({ex.compliance_flags.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {ex.compliance_flags.map((f, i) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className="bg-sky-50 text-sky-800 border-sky-300 gap-1"
                    >
                      {f}
                      <button
                        onClick={() =>
                          patchEx({
                            compliance_flags:
                              ex.compliance_flags.filter((_, j) => j !== i),
                          })
                        }
                        aria-label={`Remove ${f}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={newFlag}
                    onChange={(e) => setNewFlag(e.target.value)}
                    placeholder="add_flag_in_snake_case"
                    className="flex-1 border rounded-md px-2 py-1.5 text-sm bg-background"
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
                    Add
                  </button>
                </div>
              </Card>

              {/* Accept */}
              <div className="flex items-center gap-3">
                <button
                  onClick={acceptAndCreate}
                  disabled={step === 'saving'}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                >
                  {step === 'saving'
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <CheckCircle2 className="w-4 h-4" />}
                  Accept &amp; create grant
                </button>
                <button
                  onClick={() => { setStep('upload'); setEx(null); setFile(null); }}
                  disabled={step === 'saving'}
                  className="text-sm text-muted-foreground hover:underline"
                >
                  Start over
                </button>
              </div>
            </div>
          )}
        </div>
      </PageMain>
    </PageShell>
  );
}
