'use client';

/**
 * Saxansaxo public proposal page — the community's own proposal,
 * opened from a no-login token link shared over WhatsApp/SMS:
 *
 *   /sax-proposal/?token=<token>
 *
 * Deliberately bilingual Somali-first with English beneath (not t()):
 * anonymous visitors resolve to the host tenant's language, which on
 * the shared Railway URL would be English — hardcoding both languages
 * guarantees the Somali reader is served regardless of URL or session.
 * Four questions, big type, no login. Ownership stays with the group.
 */

import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, Send, Sprout } from 'lucide-react';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

interface Meta {
  success: boolean;
  group_name: string;
  group_name_so: string | null;
  locality: string;
  submitted: boolean;
  answers: Record<string, string>;
}

const QUESTIONS: { key: string; so: string; en: string }[] = [
  {
    key: 'q_problem',
    so: 'Waa maxay dhibaatada aad rabtaan inaad xallisaan?',
    en: 'What problem do you want to solve?',
  },
  {
    key: 'q_plan',
    so: 'Maxaad qorsheyneysaan inaad sameysaan?',
    en: 'What do you plan to do?',
  },
  {
    key: 'q_who',
    so: 'Yaa ka faa’iidaysan doona?',
    en: 'Who will benefit?',
  },
  {
    key: 'q_cost',
    so: 'Sidee baad u isticmaali doontaan lacagta?',
    en: 'How will you use the money?',
  },
];

export default function SaxProposalPage() {
  const [token, setToken] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token') || params.get('t');
    if (!t) {
      setLoadError('Linkigan ma shaqeynayo. / This link is not valid.');
      return;
    }
    setToken(t);
    fetch(`${API_BASE}/api/saxansaxo/proposal?token=${encodeURIComponent(t)}`)
      .then((r) => r.json())
      .then((d: Meta) => {
        if (!d.success) throw new Error('invalid');
        setMeta(d);
        setAnswers(d.answers || {});
        if (d.submitted) setDone(true);
      })
      .catch(() => setLoadError('Linkigan ma shaqeynayo. / This link is not valid.'));
  }, []);

  const submit = async () => {
    if (!token) return;
    setSending(true);
    setSubmitError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/saxansaxo/proposal?token=${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: JSON.stringify({ answers }),
        },
      );
      const d = await res.json();
      if (!res.ok || !d.success) {
        throw new Error(d.error || 'Failed');
      }
      setDone(true);
    } catch (e) {
      setSubmitError(
        'Waan ka xunnahay — mar kale isku day. / Sorry — please try again.',
      );
    } finally {
      setSending(false);
    }
  };

  const hasAnswer = Object.values(answers).some((v) => (v || '').trim());

  return (
    <div className="min-h-screen bg-[#FBF7F2] dark:bg-[#141210] px-4 py-8">
      <div className="mx-auto max-w-xl">
        <div className="flex items-center gap-2 mb-6">
          <Sprout className="w-6 h-6 text-[#0E8A7B]" />
          <div>
            <div className="text-lg font-semibold text-[#1A1410] dark:text-[#F4E8DC]">
              Saxansaxo
            </div>
            <div className="text-xs text-[#8C6450]">
              Qorshaha kooxda / Community proposal
            </div>
          </div>
        </div>

        {loadError ? (
          <div className="rounded-lg border border-red-200 dark:border-red-900 bg-white dark:bg-[#1d1a17] p-6 text-sm text-red-700 dark:text-red-400">
            {loadError}
          </div>
        ) : !meta ? (
          <div className="flex items-center justify-center py-16 text-[#8C6450]">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> …
          </div>
        ) : done ? (
          <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-[#1d1a17] p-8 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
            <div className="text-xl font-semibold text-[#1A1410] dark:text-[#F4E8DC]">
              Waad mahadsan tihiin!
            </div>
            <p className="text-sm text-[#6b5544] dark:text-[#c9b8a8]">
              Qorshihiinna waa la helay. Kooxda Saxansaxo ayaa idinla soo
              xiriiri doonta.
            </p>
            <p className="text-xs text-[#8C6450]">
              Thank you — your proposal has been received. The Saxansaxo team
              will be in touch.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-lg bg-white dark:bg-[#1d1a17] border border-[#e8dcd0] dark:border-[#2c2622] p-4">
              <div className="text-sm font-medium text-[#1A1410] dark:text-[#F4E8DC]">
                {meta.group_name_so || meta.group_name}
              </div>
              <div className="text-xs text-[#8C6450]">{meta.locality}</div>
              <p className="mt-2 text-sm text-[#6b5544] dark:text-[#c9b8a8]">
                Qorshahan waa kiinna — ku qora ereyadiinna.
              </p>
              <p className="text-xs text-[#8C6450]">
                This proposal is yours — write it in your own words.
              </p>
            </div>

            {QUESTIONS.map((q, i) => (
              <div key={q.key} className="rounded-lg bg-white dark:bg-[#1d1a17] border border-[#e8dcd0] dark:border-[#2c2622] p-4">
                <label className="block">
                  <span className="block text-base font-medium text-[#1A1410] dark:text-[#F4E8DC]">
                    {i + 1}. {q.so}
                  </span>
                  <span className="block text-xs text-[#8C6450] mb-2">{q.en}</span>
                  <textarea
                    rows={3}
                    className="w-full rounded-md border border-[#e8dcd0] dark:border-[#3a332d] bg-[#FBF7F2] dark:bg-[#141210] p-3 text-base text-[#1A1410] dark:text-[#F4E8DC] focus:outline-none focus:ring-2 focus:ring-[#0E8A7B]"
                    value={answers[q.key] || ''}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
                  />
                </label>
              </div>
            ))}

            {submitError && (
              <div className="rounded-lg border border-red-200 dark:border-red-900 bg-white dark:bg-[#1d1a17] p-3 text-sm text-red-700 dark:text-red-400">
                {submitError}
              </div>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={sending || !hasAnswer}
              className="w-full rounded-lg bg-[#0E8A7B] px-4 py-3 text-base font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {sending
                ? <Loader2 className="w-5 h-5 animate-spin" />
                : <><Send className="w-4 h-4" /> Dir qorshaha / Send proposal</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
