'use client';

/**
 * Endorser no-shell token portal — Phase 700.
 *
 *   /proximate-endorse?t=<endorser-token>
 *
 * Reviewer feedback: the endorser experience felt too much like an
 * authenticated platform page. This is the no-shell version that
 * matches the existing 5 token-credentialed surfaces (nominate, report,
 * outcome, partner mini-portal, verify). The token IS the credential.
 *
 * Layout: bare, Arabic-first, big buttons. No sidebar, no operator
 * shell, no co-pilot, no navigation. The endorser sees their pending
 * invitations, picks one, answers 3 Yes/No questions, submits. Done.
 *
 * July 2026 — the three questions became three SCREENS plus a review.
 * Two things changed with it, both of them fixes rather than features:
 *
 *   * The per-question block used to be a component declared INSIDE the
 *     render function, so every keystroke in its textarea remounted it
 *     and stole focus after one character. It is a plain block now.
 *   * Every label went through t() against keys that were never added
 *     to the six locale files, and translate() returns the raw key when
 *     it misses — so an elder was reading "proximate.endorse.q1" on the
 *     screen. The keys exist now; the `|| 'fallback'` strings that were
 *     silently unreachable are gone.
 *
 * The submitted payload is unchanged.
 */

import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, AlertTriangle, ChevronRight, ChevronLeft, Mic } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import {
  OfflineFallbackCard,
  ReassuranceNote,
  EffortBadges,
  StepProgress,
  WizardNav,
  DraftRestoredNote,
  useLocalDraft,
} from '@/components/proximate/token-page-support';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

/** Three questions, then a review screen. */
const TOTAL_STEPS = 4;
const REVIEW_STEP = 4;

interface PendingPartner {
  partner_id: number;
  partner_name: string;
  partner_name_ar: string | null;
  locality: string | null;
  intake_summary_ar: string | null;
  coi_signals: string[];
}

interface PortalResp {
  success: boolean;
  endorser?: {
    id: number;
    reputation_score: number;
    endorsements_count: number;
    locality: string | null;
  };
  pending_endorsements?: PendingPartner[];
  error?: string;
}

type View = 'list' | 'questions' | 'success';

// `type`, not `interface`: only type aliases get the implicit index
// signature that useLocalDraft's Record<string, unknown> bound needs.
type EndorseDraft = {
  q1: boolean | null;
  q2: boolean | null;
  q3: boolean | null;
  q1Text: string;
  q2Text: string;
  q3Text: string;
  step: number;
};

export default function ProximateEndorsePage() {
  const { t, isRTL } = useTranslation();
  const isRtl = isRTL;

  const [token, setToken] = useState('');
  const [data, setData] = useState<PortalResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<View>('list');
  const [selected, setSelected] = useState<PendingPartner | null>(null);
  const [q1, setQ1] = useState<boolean | null>(null);
  const [q2, setQ2] = useState<boolean | null>(null);
  const [q3, setQ3] = useState<boolean | null>(null);
  const [q1Text, setQ1Text] = useState('');
  const [q2Text, setQ2Text] = useState('');
  const [q3Text, setQ3Text] = useState('');
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Keyed on the partner being endorsed, never the token: one endorser
  // may have several pending invitations and each keeps its own draft.
  const draftKey = selected ? `endorse:${selected.partner_id}` : null;
  const { restored, clear: clearDraft } = useLocalDraft<EndorseDraft>(
    draftKey,
    { q1, q2, q3, q1Text, q2Text, q3Text, step },
    (saved) => {
      if (saved.q1 !== undefined) setQ1(saved.q1);
      if (saved.q2 !== undefined) setQ2(saved.q2);
      if (saved.q3 !== undefined) setQ3(saved.q3);
      if (saved.q1Text !== undefined) setQ1Text(saved.q1Text);
      if (saved.q2Text !== undefined) setQ2Text(saved.q2Text);
      if (saved.q3Text !== undefined) setQ3Text(saved.q3Text);
      if (typeof saved.step === 'number') {
        setStep(Math.min(Math.max(1, saved.step), TOTAL_STEPS));
      }
    },
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    const tk = url.searchParams.get('t');
    if (!tk) {
      setError(t('proximate.endorse.missing_token'));
      setLoading(false);
      return;
    }
    setToken(tk);
    fetch(`${API_BASE}/api/proximate/endorser-portal/${encodeURIComponent(tk)}`, {
      headers: { 'X-Network-Override': 'proximate' },
    })
      .then(async (r) => {
        const body: PortalResp = await r.json();
        if (!r.ok || !body.success) {
          setError(body.error || t('proximate.endorse.load_failed'));
        } else {
          setData(body);
        }
      })
      .catch(() => setError(t('proximate.endorse.load_failed')))
      .finally(() => setLoading(false));
  }, [t]);

  const pickPartner = (p: PendingPartner) => {
    setSelected(p);
    // Reset to empty; useLocalDraft refills these if this partner has an
    // unfinished draft, and its restore pass runs after this state lands.
    setQ1(null);
    setQ2(null);
    setQ3(null);
    setQ1Text('');
    setQ2Text('');
    setQ3Text('');
    setStep(1);
    setView('questions');
  };

  const onSubmit = async () => {
    if (!selected || q1 === null || q2 === null || q3 === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(
        `${API_BASE}/api/proximate/endorser-portal/${encodeURIComponent(token)}/partners/${selected.partner_id}/endorse`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Network-Override': 'proximate',
          },
          body: JSON.stringify({
            q1_real: q1,
            q2_trust: q2,
            q3_accept_aid: q3,
            q1_transcript: q1Text.trim() || null,
            q2_transcript: q2Text.trim() || null,
            q3_transcript: q3Text.trim() || null,
          }),
        },
      );
      const body = await r.json();
      if (!r.ok || !body.success) {
        setError(body.error || t('proximate.endorse.submit_failed'));
      } else {
        // Only after the server confirms — a draft dropped on a failed
        // send loses the answers the endorser is about to retry.
        clearDraft();
        setView('success');
      }
    } catch {
      setError(t('proximate.endorse.submit_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4" dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="max-w-md w-full text-center">
          <AlertTriangle className="w-10 h-10 mx-auto text-red-500 mb-3" />
          <h1 className="text-xl font-bold mb-2">{t('proximate.endorse.error_title')}</h1>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  // --- View: SUCCESS ----
  if (view === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4" dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="max-w-md w-full text-center">
          <CheckCircle2 className="w-16 h-16 mx-auto text-emerald-600 mb-4" />
          <h1 className="text-2xl font-bold mb-3">
            {t('proximate.endorse.success_title')}
          </h1>
          <p className="text-muted-foreground mb-6">
            {t('proximate.endorse.success_body')}
          </p>
          <button
            type="button"
            onClick={() => {
              setView('list');
              setSelected(null);
              // Refresh the pending list (the one we just endorsed should be gone).
              fetch(`${API_BASE}/api/proximate/endorser-portal/${encodeURIComponent(token)}`, {
                headers: { 'X-Network-Override': 'proximate' },
              })
                .then((r) => r.json())
                .then((body: PortalResp) => {
                  if (body.success) setData(body);
                });
            }}
            className="inline-flex items-center gap-2 px-6 h-14 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-lg"
          >
            {t('proximate.endorse.back_to_list')}
          </button>
        </div>
      </div>
    );
  }

  // --- View: QUESTIONS (one per screen) ----
  if (view === 'questions' && selected) {
    const partnerLabel = selected.partner_name_ar || selected.partner_name;
    const allAnswered = q1 !== null && q2 !== null && q3 !== null;

    const questions = [
      { n: 1, label: t('proximate.endorse.q1'), answer: q1, setAnswer: setQ1, text: q1Text, setText: setQ1Text },
      { n: 2, label: t('proximate.endorse.q2'), answer: q2, setAnswer: setQ2, text: q2Text, setText: setQ2Text },
      { n: 3, label: t('proximate.endorse.q3'), answer: q3, setAnswer: setQ3, text: q3Text, setText: setQ3Text },
    ];
    const current = questions[step - 1];

    return (
      <div className="min-h-screen bg-background p-4 sm:p-6" dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="max-w-md mx-auto space-y-4">
          {/* Tiny breadcrumb back — no full app nav */}
          <button
            type="button"
            onClick={() => setView('list')}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            {isRtl ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            {t('proximate.endorse.back_to_list')}
          </button>

          <div>
            <h1 className="text-xl font-semibold">
              {t('proximate.endorse.endorsing')}{' '}
              <span className="font-bold">{partnerLabel}</span>
            </h1>
            {selected.locality && (
              <p className="text-sm text-muted-foreground">{selected.locality}</p>
            )}
          </div>

          {step === 1 && <EffortBadges minutes={3} />}
          {restored && step === 1 && <DraftRestoredNote />}

          {selected.coi_signals.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
              <strong>{t('proximate.endorse.coi_warning_title')}</strong>{' '}
              {t('proximate.endorse.coi_warning_body')}
            </div>
          )}

          <StepProgress step={step} total={TOTAL_STEPS} />

          {step < REVIEW_STEP && current && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="text-xl font-semibold mb-4">{current.label}</h2>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <button
                  type="button"
                  onClick={() => current.setAnswer(true)}
                  aria-pressed={current.answer === true}
                  className={`h-16 rounded-lg text-lg font-bold border-2 ${
                    current.answer === true
                      ? 'bg-emerald-600 border-emerald-700 text-white'
                      : 'bg-card border-input text-foreground hover:border-emerald-500'
                  }`}
                >
                  {t('proximate.endorse.yes')}
                </button>
                <button
                  type="button"
                  onClick={() => current.setAnswer(false)}
                  aria-pressed={current.answer === false}
                  className={`h-16 rounded-lg text-lg font-bold border-2 ${
                    current.answer === false
                      ? 'bg-red-600 border-red-700 text-white'
                      : 'bg-card border-input text-foreground hover:border-red-500'
                  }`}
                >
                  {t('proximate.endorse.no')}
                </button>
              </div>
              {/* Phase 700 — voice-or-type fallback per reviewer feedback. We
                  keep the voice button affordance subtle and put the text
                  fallback right next to it so an endorser whose mic is
                  broken / blocked still has a one-tap path. */}
              <details className="text-sm text-muted-foreground">
                <summary className="cursor-pointer inline-flex items-center gap-1.5 select-none py-2">
                  <Mic className="w-4 h-4" />
                  {t('proximate.endorse.add_voice_or_text')}
                </summary>
                <div className="mt-2">
                  <textarea
                    value={current.text}
                    onChange={(e) => current.setText(e.target.value)}
                    placeholder={t('proximate.endorse.text_placeholder')}
                    rows={3}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-base"
                  />
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {t('proximate.endorse.voice_unavailable_fallback')}
                  </p>
                </div>
              </details>
            </div>
          )}

          {step === REVIEW_STEP && (
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <h2 className="text-lg font-medium">
                {t('proximate.endorse.review_title')}
              </h2>
              <dl className="space-y-3 text-sm">
                {questions.map((q) => (
                  <div
                    key={q.n}
                    className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-0"
                  >
                    <div className="min-w-0">
                      <dt className="text-xs text-muted-foreground">{q.label}</dt>
                      <dd className="font-medium">
                        {q.answer === null
                          ? t('proximate.endorse.not_answered')
                          : q.answer
                            ? t('proximate.endorse.yes')
                            : t('proximate.endorse.no')}
                      </dd>
                      {q.text.trim() && (
                        <dd className="text-muted-foreground whitespace-pre-wrap break-words mt-1">
                          {q.text}
                        </dd>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setStep(q.n)}
                      className="shrink-0 text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground"
                    >
                      {t('proximate.endorse.change')}
                    </button>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {error && <div className="text-sm text-red-600">{error}</div>}

          {step === REVIEW_STEP ? (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="h-14 px-5 rounded-lg border border-border text-base font-medium hover:bg-muted"
              >
                {t('proximate.token.back')}
              </button>
              <button
                type="button"
                onClick={onSubmit}
                disabled={!allAnswered || submitting}
                className="h-14 flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-muted disabled:text-muted-foreground text-white font-bold text-lg"
              >
                {submitting
                  ? t('proximate.endorse.submitting')
                  : t('proximate.endorse.submit')}
              </button>
            </div>
          ) : (
            <WizardNav
              onBack={step > 1 ? () => setStep((s) => s - 1) : undefined}
              onNext={() => setStep((s) => Math.min(s + 1, TOTAL_STEPS))}
              // All three answers are required by the endorsement record,
              // so each screen gates on its own answer.
              nextDisabled={current?.answer === null}
              nextLabel={
                step === TOTAL_STEPS - 1
                  ? t('proximate.endorse.review_title')
                  : undefined
              }
            />
          )}

          <ReassuranceNote variant="endorse" />
          <OfflineFallbackCard code={`EN-${selected.partner_id}`} />
        </div>
      </div>
    );
  }

  // --- View: LIST ----
  const pending = data?.pending_endorsements || [];

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold mb-1">
          {t('proximate.endorse.list_title')}
        </h1>
        <p className="text-sm text-muted-foreground mb-4">
          {t('proximate.endorse.list_subtitle')}
        </p>

        <EffortBadges minutes={3} className="mb-6" />

        {pending.length === 0 ? (
          <div className="rounded-lg border border-border p-6 text-center text-muted-foreground">
            {t('proximate.endorse.empty')}
          </div>
        ) : (
          <ul className="space-y-2">
            {pending.map((p) => (
              <li key={p.partner_id}>
                <button
                  type="button"
                  onClick={() => pickPartner(p)}
                  className="w-full text-start rounded-lg border border-border hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 p-4 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-base truncate">
                        {p.partner_name_ar || p.partner_name}
                      </div>
                      {p.locality && (
                        <div className="text-sm text-muted-foreground mt-0.5">{p.locality}</div>
                      )}
                      {p.intake_summary_ar && (
                        <div className="text-sm text-muted-foreground mt-1.5 line-clamp-2">
                          {p.intake_summary_ar}
                        </div>
                      )}
                      {p.coi_signals.length > 0 && (
                        <div className="mt-1.5 inline-block text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                          {t('proximate.endorse.coi_chip')}
                        </div>
                      )}
                    </div>
                    {isRtl
                      ? <ChevronLeft className="w-5 h-5 text-muted-foreground shrink-0 mt-1" />
                      : <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 mt-1" />}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        <ReassuranceNote variant="endorse" className="mt-6" />

        {data?.endorser && (
          <p className="mt-6 text-xs text-muted-foreground text-center">
            {t('proximate.endorse.rep_note', { score: data.endorser.reputation_score })}
          </p>
        )}
      </div>
    </div>
  );
}
