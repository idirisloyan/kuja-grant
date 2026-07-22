'use client';

/**
 * Zero-login panel selection ballot — July 2026.
 *
 *   /proximate-vote?t=<vote-token>
 *
 * The panel-meeting replacement: each appointed panelist gets a personal
 * WhatsApp link from the OB. One page, one tap per partner they select,
 * one submit. Untapped partners count as "pass". Same token-is-the-
 * credential pattern as /proximate-endorse-invite.
 */

import { useEffect, useMemo, useState } from 'react';
import { Loader2, CheckCircle2, AlertTriangle, Check } from 'lucide-react';
import {
  ReassuranceNote,
  EffortBadges,
} from '@/components/proximate/token-page-support';

// NOTE: no OfflineFallbackCard here. The ballot response carries no
// record id we could quote (voter_name + ballot only), and a fallback
// code derived from the vote token would put a credential into a
// WhatsApp thread. If the OB wants one, expose the invite id.

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

interface BallotEntry {
  participant_id: number;
  partner_name: string;
  partner_name_ar: string | null;
  locality: string | null;
}

interface BallotResp {
  success: boolean;
  voter_name?: string;
  already_voted?: boolean;
  vote_open?: boolean;
  round?: { title: string | null; title_ar?: string | null };
  ballot?: BallotEntry[];
  error?: string;
}

export default function ProximateVotePage() {
  const [token, setToken] = useState('');
  const [data, setData] = useState<BallotResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const tk = url.searchParams.get('t');
    if (!tk) {
      setError('Missing token in URL.');
      setLoading(false);
      return;
    }
    setToken(tk);
    fetch(
      `${API_BASE}/api/proximate/selection-vote/${encodeURIComponent(tk)}`,
      { headers: { 'X-Network-Override': 'proximate' } },
    )
      .then(async (r) => {
        const body: BallotResp = await r.json();
        if (!r.ok || !body.success) {
          setError(body.error || 'Failed to load ballot.');
        } else {
          setData(body);
        }
      })
      .catch(() => setError('Failed to load ballot.'))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (pid: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  const choices = useMemo(() => {
    const out: Record<string, string> = {};
    (data?.ballot || []).forEach((b) => {
      out[String(b.participant_id)] = selected.has(b.participant_id)
        ? 'select'
        : 'pass';
    });
    return out;
  }, [data, selected]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(
        `${API_BASE}/api/proximate/selection-vote/${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Network-Override': 'proximate',
          },
          body: JSON.stringify({ choices, note: note.trim() || undefined }),
        },
      );
      const body = await r.json();
      if (!r.ok || !body.success) {
        setError(body.error === 'already_voted'
          ? 'This ballot has already been submitted.'
          : body.error || 'Submission failed.');
      } else {
        setSubmitted(true);
      }
    } catch {
      setError('Submission failed — check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted || data?.already_voted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
          <h1 className="text-xl font-semibold">Thank you — شكراً لك</h1>
          <p className="text-sm text-muted-foreground">
            Your selection has been recorded. The Oversight Body will share
            the outcome with the panel.
          </p>
          <p className="text-sm text-muted-foreground" dir="rtl">
            تم تسجيل اختيارك. ستشارك هيئة الرقابة النتيجة مع اللجنة.
          </p>
        </div>
      </div>
    );
  }

  if (data && data.vote_open === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
          <p className="text-sm text-muted-foreground">
            This vote has closed. — أُغلق هذا التصويت.
          </p>
        </div>
      </div>
    );
  }

  if (!data?.ballot) return null;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 pb-28">
      <div className="max-w-lg mx-auto space-y-5">
        <div className="text-center space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Proximate Fund — Panel Selection
          </p>
          <h1 className="text-2xl font-bold">Salaam, {data.voter_name}</h1>
          {data.round?.title && (
            <p className="text-sm font-medium">{data.round.title}</p>
          )}
          <p className="text-sm text-muted-foreground">
            Tap the partners you select for funding. Untapped partners are
            not selected. Then press Submit once.
          </p>
          <p className="text-sm text-muted-foreground" dir="rtl">
            اضغط على الشركاء الذين تختارهم للتمويل، ثم اضغط «إرسال» مرة واحدة.
          </p>
          <EffortBadges showVoice={false} className="justify-center" />
        </div>

        <div className="space-y-2">
          {data.ballot.map((b) => {
            const on = selected.has(b.participant_id);
            return (
              <button
                key={b.participant_id}
                type="button"
                onClick={() => toggle(b.participant_id)}
                aria-pressed={on}
                className={`w-full text-start rounded-lg border p-3 flex items-center gap-3 transition ${
                  on
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-card hover:bg-muted/50'
                }`}
              >
                <span
                  aria-hidden
                  className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 ${
                    on
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-muted-foreground/40'
                  }`}
                >
                  {on && <Check className="w-4 h-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">
                    {b.partner_name}
                  </span>
                  {b.partner_name_ar && (
                    <span className="block text-sm truncate" dir="rtl">
                      {b.partner_name_ar}
                    </span>
                  )}
                  {b.locality && (
                    <span className="block text-[11px] text-muted-foreground">
                      {b.locality}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <textarea
          placeholder="Optional note to the Oversight Body — ملاحظة اختيارية"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="w-full text-sm rounded-md border bg-background p-2"
        />

        {/* variant="endorse": an individual panelist's ballot is never
            shown to the partners on it, which is the thing a panelist
            from the same locality actually worries about. showResume is
            false — selections live only in this tab. */}
        <ReassuranceNote variant="endorse" showResume={false} />

        {error && <p className="text-sm text-rose-600 text-center">{error}</p>}
      </div>

      {/* Sticky submit — always reachable on a long ballot */}
      <div className="fixed bottom-0 inset-x-0 bg-background/95 backdrop-blur border-t border-border p-3">
        <div className="max-w-lg mx-auto">
          <button
            type="button"
            disabled={submitting}
            onClick={submit}
            className="w-full py-3 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Submit selection ({selected.size} of {data.ballot.length}) — إرسال
          </button>
        </div>
      </div>
    </div>
  );
}
