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
 * invitations, picks one, answers 3 Yes/No questions, optionally adds
 * a voice note per question, submits. Done.
 */

import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, AlertTriangle, ChevronRight, ChevronLeft, Mic } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

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
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const tk = url.searchParams.get('t');
    if (!tk) {
      setError(t('proximate.endorse.missing_token') || 'Missing token in URL.');
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
          setError(body.error || t('proximate.endorse.load_failed') || 'Failed to load.');
        } else {
          setData(body);
        }
      })
      .catch(() => setError(t('proximate.endorse.load_failed') || 'Failed to load.'))
      .finally(() => setLoading(false));
  }, [t]);

  const pickPartner = (p: PendingPartner) => {
    setSelected(p);
    setQ1(null);
    setQ2(null);
    setQ3(null);
    setQ1Text('');
    setQ2Text('');
    setQ3Text('');
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
        setError(body.error || t('proximate.endorse.submit_failed') || 'Submit failed.');
      } else {
        setView('success');
      }
    } catch {
      setError(t('proximate.endorse.submit_failed') || 'Submit failed.');
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
          <h1 className="text-xl font-bold mb-2">{t('proximate.endorse.error_title') || 'Could not load'}</h1>
          <p className="text-gray-600">{error}</p>
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
            {t('proximate.endorse.success_title') || 'شكراً لك'}
          </h1>
          <p className="text-gray-600 mb-6">
            {t('proximate.endorse.success_body') || 'تم تسجيل تزكيتك. ما عاد محتاجين شي تاني منك.'}
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
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-lg"
          >
            {t('proximate.endorse.back_to_list') || 'الرجوع للقائمة'}
          </button>
        </div>
      </div>
    );
  }

  // --- View: QUESTIONS ----
  if (view === 'questions' && selected) {
    const partnerLabel = selected.partner_name_ar || selected.partner_name;
    const allAnswered = q1 !== null && q2 !== null && q3 !== null;

    const Question = ({
      n,
      labelKey,
      defaultLabel,
      answer,
      setAnswer,
      text,
      setText,
    }: {
      n: number;
      labelKey: string;
      defaultLabel: string;
      answer: boolean | null;
      setAnswer: (b: boolean) => void;
      text: string;
      setText: (s: string) => void;
    }) => (
      <div className="mb-7">
        <div className="text-sm font-medium text-gray-500 mb-1.5">
          {t('proximate.endorse.question_n', { n }) || `سؤال ${n} من 3`}
        </div>
        <h3 className="text-xl font-semibold mb-4">
          {t(labelKey) || defaultLabel}
        </h3>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <button
            type="button"
            onClick={() => setAnswer(true)}
            className={`h-16 rounded-lg text-lg font-bold border-2 ${
              answer === true
                ? 'bg-emerald-600 border-emerald-700 text-white'
                : 'bg-card border-input text-foreground hover:border-emerald-500'
            }`}
          >
            {t('proximate.endorse.yes') || 'نعم'}
          </button>
          <button
            type="button"
            onClick={() => setAnswer(false)}
            className={`h-16 rounded-lg text-lg font-bold border-2 ${
              answer === false
                ? 'bg-red-600 border-red-700 text-white'
                : 'bg-card border-input text-foreground hover:border-red-500'
            }`}
          >
            {t('proximate.endorse.no') || 'لا'}
          </button>
        </div>
        {/* Phase 700 — voice-or-type fallback per reviewer feedback. We
            keep the voice button affordance subtle and put the text
            fallback right next to it so an endorser whose mic is
            broken / blocked still has a one-tap path. */}
        <details className="text-sm text-gray-600">
          <summary className="cursor-pointer inline-flex items-center gap-1.5 select-none">
            <Mic className="w-3.5 h-3.5" />
            {t('proximate.endorse.add_voice_or_text') || 'إضافة ملاحظة (صوت أو نص)'}
          </summary>
          <div className="mt-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('proximate.endorse.text_placeholder') || 'اكتب ملاحظتك هنا...'}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-base"
            />
            <p className="text-xs text-gray-500 mt-1.5">
              {t('proximate.endorse.voice_unavailable_fallback')
                || 'الصوت ما اشتغل؟ اكتب الإجابة هنا. الإثنين ينفعو.'}
            </p>
          </div>
        </details>
      </div>
    );

    return (
      <div className="min-h-screen bg-background p-4 sm:p-6" dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="max-w-md mx-auto">
          {/* Tiny breadcrumb back — no full app nav */}
          <button
            type="button"
            onClick={() => setView('list')}
            className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            {isRtl ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            {t('proximate.endorse.back_to_list') || 'الرجوع'}
          </button>

          <h1 className="text-xl font-semibold mb-1">
            {t('proximate.endorse.endorsing') || 'تزكيتك لـ'}{' '}
            <span className="font-bold">{partnerLabel}</span>
          </h1>
          {selected.locality && (
            <p className="text-sm text-gray-500 mb-5">{selected.locality}</p>
          )}

          {selected.coi_signals.length > 0 && (
            <div className="mb-5 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
              <strong>{t('proximate.endorse.coi_warning_title') || 'تنبيه:'}</strong>{' '}
              {t('proximate.endorse.coi_warning_body')
                || 'يبدو إنك من نفس البيئة. تزكيتك ستسجل بس ما تحسب لازم.'}
            </div>
          )}

          <Question
            n={1}
            labelKey="proximate.endorse.q1"
            defaultLabel="هل هذه المنظمة حقيقية وتعمل على الأرض؟"
            answer={q1}
            setAnswer={setQ1}
            text={q1Text}
            setText={setQ1Text}
          />
          <Question
            n={2}
            labelKey="proximate.endorse.q2"
            defaultLabel="هل تثق بمن يقودها؟"
            answer={q2}
            setAnswer={setQ2}
            text={q2Text}
            setText={setQ2Text}
          />
          <Question
            n={3}
            labelKey="proximate.endorse.q3"
            defaultLabel="هل تقبل المساعدة من خلالهم؟"
            answer={q3}
            setAnswer={setQ3}
            text={q3Text}
            setText={setQ3Text}
          />

          {error && (
            <div className="mb-4 text-sm text-red-600">{error}</div>
          )}

          <button
            type="button"
            onClick={onSubmit}
            disabled={!allAnswered || submitting}
            className="w-full h-14 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-bold text-lg"
          >
            {submitting
              ? (t('proximate.endorse.submitting') || 'جاري الإرسال...')
              : (t('proximate.endorse.submit') || 'إرسال التزكية')}
          </button>
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
          {t('proximate.endorse.list_title') || 'التزكيات المطلوبة منك'}
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          {t('proximate.endorse.list_subtitle')
            || 'اختر منظمة وأجب على 3 أسئلة. خلاص.'}
        </p>

        {pending.length === 0 ? (
          <div className="rounded-lg border border-gray-200 p-6 text-center text-gray-500">
            {t('proximate.endorse.empty')
              || 'ما في تزكيات مطلوبة منك حالياً. شكراً!'}
          </div>
        ) : (
          <ul className="space-y-2">
            {pending.map((p) => (
              <li key={p.partner_id}>
                <button
                  type="button"
                  onClick={() => pickPartner(p)}
                  className="w-full text-start rounded-lg border border-gray-200 hover:border-emerald-500 hover:bg-emerald-50 p-4 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-base truncate">
                        {p.partner_name_ar || p.partner_name}
                      </div>
                      {p.locality && (
                        <div className="text-sm text-gray-500 mt-0.5">{p.locality}</div>
                      )}
                      {p.intake_summary_ar && (
                        <div className="text-sm text-gray-600 mt-1.5 line-clamp-2">
                          {p.intake_summary_ar}
                        </div>
                      )}
                      {p.coi_signals.length > 0 && (
                        <div className="mt-1.5 inline-block text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                          {t('proximate.endorse.coi_chip') || 'تنبيه قرابة'}
                        </div>
                      )}
                    </div>
                    {isRtl
                      ? <ChevronLeft className="w-5 h-5 text-gray-400 shrink-0 mt-1" />
                      : <ChevronRight className="w-5 h-5 text-gray-400 shrink-0 mt-1" />}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        {data?.endorser && (
          <p className="mt-8 text-xs text-gray-400 text-center">
            {t('proximate.endorse.rep_note', { score: data.endorser.reputation_score })
              || `نقاطك: ${data.endorser.reputation_score}/100`}
          </p>
        )}
      </div>
    </div>
  );
}
