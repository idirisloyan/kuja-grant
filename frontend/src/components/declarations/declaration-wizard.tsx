'use client';

/**
 * DeclarationWizard — Phase 45.
 *
 * Replaces "create one from a fund window via the API" with a guided
 * 4-step creation flow that maps 1:1 to the IKEA Concept Note process:
 *
 *   Step 1 — Evidence       Pick a row from the latest published
 *                            Crisis Monitoring Report (the OB's weekly
 *                            evidence base).
 *   Step 2 — Declaration    Fund + Window + title + country + severity
 *                            + proposed amount + summary.
 *   Step 3 — Committee      Pick OB signers from the per-network OB
 *                            roster (Phase 44C). Refuses non-OB users
 *                            via the err.signer_not_ob gate.
 *   Step 4 — Confirm        Review + submit. Optionally submit-for-
 *                            signature immediately so the OB doesn't
 *                            need a second click.
 *
 * Renders as a modal sheet over the list page. Submit creates the
 * declaration, adds signer slots, and optionally calls /submit.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  X, ChevronRight, ChevronLeft, AlertOctagon, Coins, Globe,
  Users, Sparkles, Loader2, CheckCircle2, Search, ShieldCheck,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { VoiceFieldInput } from '@/components/shared/voice-field-input';
import {
  useLatestCrisisReport, useCrisisReport, useFunds, useFund,
  useObRoster, type FundWindow, type CrisisRow, type ObRosterMember,
} from '@/lib/hooks/use-api';
import { DeclarationConversation } from './declaration-conversation';

interface WizardProps {
  onClose: () => void;
  onCreated?: (declarationId: number) => void;
}

interface FormState {
  fund_id: number | null;
  window_id: number | null;
  title: string;
  crisis_type: string;
  region: string;
  country: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  summary_md: string;
  proposed_total_amount: string;
  evidence_row_id: number | null;
  evidence_report_id: number | null;
  signer_user_ids: number[];
  submit_for_signature_now: boolean;
}

const EMPTY_FORM: FormState = {
  fund_id: null,
  window_id: null,
  title: '',
  crisis_type: '',
  region: '',
  country: '',
  severity: 'high',
  summary_md: '',
  proposed_total_amount: '',
  evidence_row_id: null,
  evidence_report_id: null,
  signer_user_ids: [],
  submit_for_signature_now: false,
};

export function DeclarationWizard({ onClose, onCreated }: WizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  // Phase 79 — Conversation mode. Lives alongside the wizard. When
  // selected, the OB member describes the situation in plain language;
  // we parse + pre-fill the form + jump to step 4 (Confirm).
  const [mode, setMode] = useState<'conversation' | 'wizard'>('conversation');

  function applyParsedDeclaration(p: {
    title?: string; crisis_type?: string; severity?: 'low' | 'medium' | 'high' | 'critical';
    country?: string; proposed_total_amount?: number | null; currency?: string;
    summary?: string; suggested_committee?: number[];
  }) {
    setForm((prev) => ({
      ...prev,
      title: p.title || prev.title,
      crisis_type: p.crisis_type || prev.crisis_type,
      severity: p.severity ?? prev.severity,
      country: p.country || prev.country,
      proposed_total_amount: p.proposed_total_amount != null
        ? String(p.proposed_total_amount) : prev.proposed_total_amount,
      summary_md: p.summary || prev.summary_md,
      signer_user_ids: (p.suggested_committee && p.suggested_committee.length > 0)
        ? p.suggested_committee : prev.signer_user_ids,
    }));
    setMode('wizard');
    // Jump to the Declaration step (step 2). User still needs to pick fund/
    // window since conversation mode cannot infer them. From step 2 the
    // wizard guides them through committee + confirm.
    setStep(2);
    toast.success('Parsed. Pick the fund + window, then confirm.');
  }

  function next() {
    setStep((s) => (s < 4 ? ((s + 1) as 1 | 2 | 3 | 4) : s));
  }
  function back() {
    setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3 | 4) : s));
  }

  async function submitAll() {
    if (!form.fund_id || !form.window_id) {
      toast.error('Fund and window are required.');
      return;
    }
    if (!form.title.trim() || !form.country.trim() || !form.summary_md.trim()) {
      toast.error('Title, country, and summary are required.');
      return;
    }
    if (form.signer_user_ids.length === 0) {
      toast.error('Pick at least one committee member.');
      return;
    }
    setSubmitting(true);
    try {
      // Step 1: Create the declaration
      const created = await api.post<{ declaration: { id: number } }>('/declarations', {
        fund_id: form.fund_id,
        window_id: form.window_id,
        title: form.title.trim(),
        crisis_type: form.crisis_type.trim() || null,
        region: form.region.trim() || null,
        country: form.country.trim(),
        severity: form.severity,
        summary_md: form.summary_md.trim(),
        proposed_total_amount: form.proposed_total_amount ? Number(form.proposed_total_amount) : null,
        evidence_row_id: form.evidence_row_id,
        evidence_report_id: form.evidence_report_id,
      });
      const declId = created.declaration.id;

      // Step 2: Add signer slots
      for (let i = 0; i < form.signer_user_ids.length; i++) {
        await api.post(`/declarations/${declId}/signers`, {
          user_id: form.signer_user_ids[i],
          required_order: i,
        });
      }

      // Step 3 (optional): Submit for signature now
      if (form.submit_for_signature_now) {
        await api.post(`/declarations/${declId}/submit`);
      }

      toast.success(
        form.submit_for_signature_now
          ? 'Declaration created and submitted for signature.'
          : 'Declaration draft created with committee. Submit when ready.',
      );
      onCreated?.(declId);
      router.push(`/admin/declarations/${declId}`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Create failed.';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[1300] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[88vh] flex flex-col bg-background border border-border rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between gap-3 p-4 border-b border-border bg-card">
          <div className="min-w-0 flex-1">
            <h2 className="kuja-display text-xl">New emergency declaration</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {mode === 'conversation'
                ? 'Describe what is happening in your own words. We will structure it for you.'
                : 'Guided creation — 4 steps, ~3 minutes. Aligns with NEAR’s OB process.'}
            </p>
          </div>
          {/* Phase 79 — mode toggle. Conversation default; wizard fallback. */}
          <div className="inline-flex rounded-md border border-border text-[11px] overflow-hidden mr-2">
            <button
              type="button"
              onClick={() => setMode('conversation')}
              className={
                'px-2.5 py-1 font-semibold ' +
                (mode === 'conversation'
                  ? 'bg-[hsl(var(--kuja-clay))] text-white'
                  : 'bg-background text-muted-foreground hover:text-foreground')
              }
            >
              Conversation
            </button>
            <button
              type="button"
              onClick={() => { setMode('wizard'); setStep(1); }}
              className={
                'px-2.5 py-1 font-semibold border-l border-border ' +
                (mode === 'wizard'
                  ? 'bg-[hsl(var(--kuja-clay))] text-white'
                  : 'bg-background text-muted-foreground hover:text-foreground')
              }
            >
              Wizard
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Stepper rail — hidden in conversation mode (no steps yet). */}
        {mode === 'wizard' && (
        <div className="px-4 pt-3 pb-1 border-b border-border bg-muted/20">
          <ol className="flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold">
            {(['Evidence', 'Declaration', 'Committee', 'Confirm'] as const).map((label, idx) => {
              const n = (idx + 1) as 1 | 2 | 3 | 4;
              const isPast = step > n;
              const isCurrent = step === n;
              const cls = isCurrent
                ? 'bg-[hsl(var(--kuja-clay))] text-white'
                : isPast
                  ? 'bg-[hsl(var(--kuja-grow))]/15 text-[hsl(var(--kuja-grow))]'
                  : 'bg-muted text-muted-foreground';
              return (
                <li key={label} className={`flex-1 px-3 py-1.5 rounded-md text-center ${cls}`}>
                  {n}. {label}
                </li>
              );
            })}
          </ol>
        </div>
        )}

        {/* Step content / Conversation mode */}
        <div className="flex-1 overflow-y-auto p-5">
          {mode === 'conversation' ? (
            <DeclarationConversation
              onParsed={applyParsedDeclaration}
              onCancel={onClose}
            />
          ) : (
            <>
              {step === 1 && <Step1Evidence form={form} setForm={setForm} />}
              {step === 2 && <Step2Declaration form={form} setForm={setForm} />}
              {step === 3 && <Step3Committee form={form} setForm={setForm} />}
              {step === 4 && <Step4Confirm form={form} setForm={setForm} />}
            </>
          )}
        </div>

        {/* Footer — only in wizard mode. Conversation has its own primary
            action ('Use this draft') inside the parsed-preview panel. */}
        {mode === 'wizard' && (
        <footer className="flex items-center justify-between gap-3 p-4 border-t border-border bg-card">
          <button
            type="button"
            onClick={step === 1 ? onClose : back}
            disabled={submitting}
            className="px-3 py-1.5 text-xs font-semibold rounded-md border border-border hover:bg-muted inline-flex items-center gap-1 disabled:opacity-50"
          >
            <ChevronLeft className="w-3 h-3" />
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          {step < 4 ? (
            <button
              type="button"
              onClick={next}
              className="px-3 py-1.5 text-xs font-semibold rounded-md bg-[hsl(var(--kuja-clay))] text-white hover:opacity-90 inline-flex items-center gap-1"
            >
              Next <ChevronRight className="w-3 h-3" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submitAll}
              disabled={submitting}
              className="px-4 py-1.5 text-xs font-semibold rounded-md bg-[hsl(var(--kuja-clay))] text-white hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1"
            >
              {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              Create declaration
            </button>
          )}
        </footer>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Step 1: Pick evidence
// ============================================================================

function Step1Evidence({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
  const { data: latest } = useLatestCrisisReport();
  const reportId = latest?.report?.id ?? null;
  const { data: full } = useCrisisReport(reportId);

  const rows: CrisisRow[] = (full?.report?.rows ?? [])
    .slice()
    .sort((a, b) => (b.composite_score ?? 0) - (a.composite_score ?? 0));

  return (
    <div className="space-y-4">
      <header>
        <h3 className="font-semibold text-base flex items-center gap-2">
          <AlertOctagon className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Pick crisis evidence
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
          The IKEA Concept Note says the OB stays informed through the weekly Crisis
          Monitoring Report and acts when a row crosses the threshold. Pick the row
          this declaration is responding to — the platform will cite it as evidence
          and anchor the link in the audit chain.
        </p>
      </header>

      {!latest?.report && (
        <div className="border border-border rounded-lg bg-card p-6 text-center text-sm text-muted-foreground">
          No published Crisis Monitoring Report yet. You can skip this step and create the declaration without evidence, but the OB should ideally cite a monitoring row.
          <button
            type="button"
            onClick={() => setForm({ ...form, evidence_row_id: null, evidence_report_id: null })}
            className="ml-2 underline hover:no-underline"
          >
            Continue without evidence
          </button>
        </div>
      )}

      {latest?.report && (
        <>
          <div className="text-xs text-muted-foreground">
            From <span className="font-semibold text-foreground">
              {new Date(latest.report.period_start).toLocaleDateString()} – {new Date(latest.report.period_end).toLocaleDateString()}
            </span>{' '}
            (published Crisis Monitoring Report). Showing rows by composite score, highest first.
          </div>
          {rows.length === 0 && (
            <div className="border border-border rounded-lg bg-card p-6 text-center text-sm text-muted-foreground">
              Report has no rows yet. Add rows in /admin/crisis-monitoring before declaring.
            </div>
          )}
          <ul className="space-y-2">
            {rows.map((r) => {
              const isPicked = form.evidence_row_id === r.id;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setForm({
                      ...form,
                      evidence_row_id: r.id,
                      evidence_report_id: latest.report?.id ?? null,
                      // Pre-fill some fields from the row to save typing
                      country: r.country || form.country,
                      crisis_type: r.event_type || form.crisis_type,
                      region: r.region || form.region,
                      title: form.title || `${r.event_title}`.slice(0, 200),
                    })}
                    className={`w-full text-left border rounded-lg p-3 transition-colors ${
                      isPicked
                        ? 'border-[hsl(var(--kuja-clay))] bg-[hsl(var(--kuja-clay))]/5'
                        : 'border-border bg-card hover:bg-muted/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm">{r.event_title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1">
                            <Globe className="w-3 h-3" /> {r.country}
                          </span>
                          {r.region && <span>{r.region}</span>}
                          <span>{r.event_type}</span>
                          {r.flagged_for_ob && (
                            <span className="text-[hsl(var(--kuja-clay))] font-semibold">
                              flagged for OB
                            </span>
                          )}
                        </div>
                      </div>
                      <ScoreChip score={r.composite_score} />
                    </div>
                    {r.narrative && (
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{r.narrative}</p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function ScoreChip({ score }: { score: number | null }) {
  if (score == null) return null;
  const tone = score >= 80 ? 'destructive' : score >= 60 ? 'sun' : 'muted';
  const cls =
    tone === 'destructive' ? 'bg-destructive/15 text-destructive'
    : tone === 'sun' ? 'bg-[hsl(var(--kuja-sun))]/15 text-[hsl(var(--kuja-sun))]'
    : 'bg-muted text-muted-foreground';
  return (
    <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-md ${cls}`}>
      composite {score}
    </span>
  );
}

// ============================================================================
// Step 2: Declaration details
// ============================================================================

function Step2Declaration({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
  const { data: fundsData } = useFunds();
  const funds = fundsData?.funds ?? [];

  // Auto-select first fund if not set
  useEffect(() => {
    if (!form.fund_id && funds.length > 0) {
      setForm({ ...form, fund_id: funds[0].id });
    }
  }, [funds, form, setForm]);

  const { data: fundData } = useFund(form.fund_id);
  const windows: FundWindow[] = fundData?.fund?.windows ?? [];

  useEffect(() => {
    if (form.fund_id && !form.window_id && windows.length > 0) {
      setForm({ ...form, window_id: windows[0].id });
    }
  }, [windows, form, setForm]);

  return (
    <div className="space-y-4">
      <header>
        <h3 className="font-semibold text-base flex items-center gap-2">
          <Coins className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Declaration details
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Where the funding comes from + what crisis you&apos;re declaring.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Fund">
          <select
            value={form.fund_id ?? ''}
            onChange={(e) => setForm({ ...form, fund_id: Number(e.target.value) || null, window_id: null })}
            className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-sm"
          >
            <option value="">— pick a fund —</option>
            {funds.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Window">
          <select
            value={form.window_id ?? ''}
            onChange={(e) => setForm({ ...form, window_id: Number(e.target.value) || null })}
            className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-sm"
          >
            <option value="">— pick a window —</option>
            {windows.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Title" className="sm:col-span-2">
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Somalia drought emergency — Q2 2026 response"
            className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-sm"
            maxLength={250}
          />
        </Field>

        <Field label="Country (ISO code or name)">
          <input
            type="text"
            value={form.country}
            onChange={(e) => setForm({ ...form, country: e.target.value })}
            placeholder="SOM"
            className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-sm"
          />
        </Field>

        <Field label="Crisis type">
          <input
            type="text"
            value={form.crisis_type}
            onChange={(e) => setForm({ ...form, crisis_type: e.target.value })}
            placeholder="drought / conflict / flooding / …"
            className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-sm"
          />
        </Field>

        <Field label="Region">
          <input
            type="text"
            value={form.region}
            onChange={(e) => setForm({ ...form, region: e.target.value })}
            placeholder="Horn of Africa"
            className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-sm"
          />
        </Field>

        <Field label="Severity">
          <select
            value={form.severity}
            onChange={(e) => setForm({ ...form, severity: e.target.value as FormState['severity'] })}
            className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-sm"
          >
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
            <option value="critical">critical</option>
          </select>
        </Field>

        <Field label="Proposed total amount (numbers only)">
          <input
            type="number"
            value={form.proposed_total_amount}
            onChange={(e) => setForm({ ...form, proposed_total_amount: e.target.value })}
            placeholder="1500000"
            className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-sm font-mono"
          />
        </Field>

        <Field label="Summary (Markdown)" className="sm:col-span-2">
          <textarea
            value={form.summary_md}
            onChange={(e) => setForm({ ...form, summary_md: e.target.value })}
            placeholder="What the OB is declaring + what response is proposed."
            rows={5}
            className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-sm"
          />
          {/* Phase 110 — voice extension. */}
          <div className="mt-2 flex justify-end">
            <VoiceFieldInput
              value={form.summary_md}
              onChange={(next) => setForm({ ...form, summary_md: next })}
              fieldLabel="Declaration summary"
            />
          </div>
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

// ============================================================================
// Step 3: Pick committee from OB roster
// ============================================================================

function Step3Committee({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
  const { data: roster } = useObRoster();
  const members: ObRosterMember[] = roster?.members ?? [];
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      return (m.user_name || '').toLowerCase().includes(q)
        || (m.user_email || '').toLowerCase().includes(q)
        || (m.org_name || '').toLowerCase().includes(q)
        || (m.country || '').toLowerCase().includes(q);
    });
  }, [members, filter]);

  function toggle(userId: number) {
    const exists = form.signer_user_ids.includes(userId);
    setForm({
      ...form,
      signer_user_ids: exists
        ? form.signer_user_ids.filter((id) => id !== userId)
        : [...form.signer_user_ids, userId],
    });
  }

  return (
    <div className="space-y-4">
      <header>
        <h3 className="font-semibold text-base flex items-center gap-2">
          <Users className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Pick the committee
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
          The Oversight Body members who will sign this declaration. The list is the
          per-network OB roster (Phase 44) — only users at organisations holding an
          OB seat are eligible. Picking at least <span className="font-semibold">two</span> is
          recommended for the multi-sig flow to be meaningful.
        </p>
      </header>

      {members.length === 0 ? (
        <div className="border border-border rounded-lg bg-card p-6 text-center text-sm text-muted-foreground">
          <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-50" />
          No active OB members in this network yet. Grant OB seats first at
          {' '}<span className="font-mono">/admin/network-memberships</span> →
          pick an active member → &quot;Grant OB seat&quot;.
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by name, org, country, or email…"
              className="w-full pl-7 pr-2 py-1.5 rounded-md border border-border bg-background text-sm"
            />
          </div>

          <div className="border border-border rounded-lg bg-card divide-y divide-border max-h-[360px] overflow-y-auto">
            {filtered.map((m) => {
              const picked = form.signer_user_ids.includes(m.user_id);
              return (
                <button
                  key={`${m.membership_id}-${m.user_id}`}
                  type="button"
                  onClick={() => toggle(m.user_id)}
                  className={`w-full text-left px-3 py-2.5 transition-colors flex items-center gap-3 ${
                    picked ? 'bg-[hsl(var(--kuja-clay))]/10' : 'hover:bg-muted/30'
                  }`}
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                    picked
                      ? 'bg-[hsl(var(--kuja-clay))] border-[hsl(var(--kuja-clay))]'
                      : 'bg-background border-muted-foreground/40'
                  }`}>
                    {picked && <CheckCircle2 className="w-3 h-3 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {m.user_name || m.user_email || `User #${m.user_id}`}
                    </div>
                    <div className="text-xs text-muted-foreground truncate flex items-center gap-2">
                      <span>{m.org_name}</span>
                      {m.country && <><span>·</span><span>{m.country}</span></>}
                      {m.user_email && <><span>·</span><span className="font-mono text-[10px]">{m.user_email}</span></>}
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[hsl(var(--kuja-clay))] shrink-0">
                    <ShieldCheck className="w-3 h-3" /> OB
                  </span>
                </button>
              );
            })}
          </div>

          <div className="text-xs text-muted-foreground">
            {form.signer_user_ids.length} selected.
            {form.signer_user_ids.length === 1 && (
              <span className="ml-1 text-[hsl(var(--kuja-sun))]">Single-signer flow — no peer check. Add at least one more for a credible multi-sig.</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Step 4: Confirm
// ============================================================================

function Step4Confirm({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
  const { data: roster } = useObRoster();
  const members: ObRosterMember[] = roster?.members ?? [];
  const pickedMembers = members.filter((m) => form.signer_user_ids.includes(m.user_id));

  return (
    <div className="space-y-4">
      <header>
        <h3 className="font-semibold text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Review and confirm
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Once you click Create declaration, it lands as a draft. Each signer slot is added.
          Submit-for-signature is the next step (unless you check the box below).
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SummaryRow label="Title" value={form.title || <em className="text-muted-foreground">missing</em>} />
        <SummaryRow label="Crisis type" value={form.crisis_type || '—'} />
        <SummaryRow label="Country" value={form.country || <em className="text-muted-foreground">missing</em>} />
        <SummaryRow label="Region" value={form.region || '—'} />
        <SummaryRow label="Severity" value={form.severity} />
        <SummaryRow label="Proposed amount" value={form.proposed_total_amount ? Number(form.proposed_total_amount).toLocaleString() : '—'} />
        <SummaryRow label="Evidence row" value={form.evidence_row_id ? `Crisis Monitoring row #${form.evidence_row_id}` : <em className="text-muted-foreground">none cited</em>} className="sm:col-span-2" />
        <SummaryRow label="Summary" value={form.summary_md ? <span className="whitespace-pre-wrap">{form.summary_md.slice(0, 280)}{form.summary_md.length > 280 ? '…' : ''}</span> : <em className="text-muted-foreground">missing</em>} className="sm:col-span-2" />
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Committee</div>
        {pickedMembers.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">No signers selected — go back to step 3.</div>
        ) : (
          <ul className="border border-border rounded-md bg-card divide-y divide-border">
            {pickedMembers.map((m, i) => (
              <li key={m.user_id} className="px-3 py-2 text-sm flex items-center justify-between">
                <div>
                  <span className="font-medium">{m.user_name || m.user_email || `User #${m.user_id}`}</span>
                  <span className="text-muted-foreground"> · {m.org_name}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">order #{i + 1}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <label className="flex items-start gap-2 text-xs">
        <input
          type="checkbox"
          checked={form.submit_for_signature_now}
          onChange={(e) => setForm({ ...form, submit_for_signature_now: e.target.checked })}
          className="mt-0.5"
        />
        <span>
          <span className="font-medium">Also submit for signature now</span> — the declaration goes straight to <code className="font-mono">in_review</code> and signers start receiving requests. Skip this if you want to attach documents or do final edits in the draft first.
        </span>
      </label>
    </div>
  );
}

function SummaryRow({ label, value, className = '' }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm mt-0.5">{value}</div>
    </div>
  );
}
