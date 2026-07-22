'use client';

/**
 * Zero-login endorser invite portal — Phase 716a.
 *
 *   /proximate-endorse-invite?t=<invite-token>
 *
 * Matches the partner report/attest pattern: token URL is the credential,
 * no login screen, no account creation the elder ever sees. Backend
 * auto-provisions Endorser + User rows on submit.
 *
 * Layout: bare, mobile-first, big buttons. Same skeleton as the existing
 * /proximate-endorse page, but scoped to one specific partner (the one
 * the OB invited them to endorse).
 */

import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  OfflineFallbackCard,
  ReassuranceNote,
  EffortBadges,
} from '@/components/proximate/token-page-support';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

interface InviteResp {
  success: boolean;
  invite?: {
    invitee_name: string;
    invitee_locality: string | null;
    note: string | null;
  };
  partner?: {
    id: number;
    name: string;
    name_ar: string | null;
    locality: string | null;
    intake_summary_ar: string | null;
  };
  error?: string;
  used_at?: string;
}

export default function ProximateEndorseInvitePage() {
  const [token, setToken] = useState('');
  const [data, setData] = useState<InviteResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q1, setQ1] = useState<boolean | null>(null);
  const [q2, setQ2] = useState<boolean | null>(null);
  const [q3, setQ3] = useState<boolean | null>(null);
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
      `${API_BASE}/api/proximate/endorser-invites/${encodeURIComponent(tk)}`,
      { headers: { 'X-Network-Override': 'proximate' } },
    )
      .then(async (r) => {
        const body: InviteResp = await r.json();
        if (!r.ok || !body.success) {
          if (body.error === 'already_used') {
            setError('This invitation has already been used. Thank you.');
          } else {
            setError(body.error || 'Failed to load invitation.');
          }
        } else {
          setData(body);
        }
      })
      .catch(() => setError('Failed to load invitation.'))
      .finally(() => setLoading(false));
  }, []);

  const submit = async () => {
    if (q1 === null || q2 === null || q3 === null) {
      setError('Please answer all three questions.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(
        `${API_BASE}/api/proximate/endorser-invites/${encodeURIComponent(token)}`,
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
          }),
        },
      );
      const body = await r.json();
      if (!r.ok || !body.success) {
        setError(body.error || 'Submission failed.');
      } else {
        setSubmitted(true);
      }
    } catch {
      setError('Submission failed.');
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

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
          <h1 className="text-xl font-semibold">Thank you</h1>
          <p className="text-sm text-muted-foreground">
            Your response has been recorded. Adeso will review it as part of
            the trust process for {data?.partner?.name}.
          </p>
        </div>
      </div>
    );
  }

  if (!data?.partner || !data?.invite) return null;

  const p = data.partner;
  const inv = data.invite;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Proximate Fund — Community Endorsement
          </p>
          <h1 className="text-2xl font-bold">
            Salaam, {inv.invitee_name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Adeso has asked you to endorse an NGO for our current round.
          </p>
          <EffortBadges minutes={3} showVoice={false} className="justify-center" />
        </div>

        <div className="bg-muted/40 rounded-lg p-4 space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            The NGO
          </p>
          <p className="text-lg font-semibold">{p.name}</p>
          {p.name_ar && (
            <p className="text-lg font-semibold" dir="rtl">
              {p.name_ar}
            </p>
          )}
          {p.locality && (
            <p className="text-xs text-muted-foreground">{p.locality}</p>
          )}
          {p.intake_summary_ar && (
            <p className="text-sm text-muted-foreground border-t pt-2 mt-2" dir="rtl">
              {p.intake_summary_ar}
            </p>
          )}
          {inv.note && (
            <p className="text-xs italic border-t pt-2 mt-2 text-muted-foreground">
              Note from Adeso: {inv.note}
            </p>
          )}
        </div>

        <div className="space-y-4">
          {[
            { key: 'q1', value: q1, setter: setQ1, label: 'Is this organisation real?', hint: 'Have you actually seen or heard of them operating in your community?' },
            { key: 'q2', value: q2, setter: setQ2, label: 'Do you trust them?', hint: 'Would you send your own community to them for help?' },
            { key: 'q3', value: q3, setter: setQ3, label: 'Would you accept aid from them?', hint: 'If your own family was in need, would you take help from them?' },
          ].map((q) => (
            <div key={q.key} className="bg-card border rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium">{q.label}</p>
              <p className="text-xs text-muted-foreground">{q.hint}</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => q.setter(true)}
                  className={`py-3 rounded-md text-sm font-medium transition ${
                    q.value === true
                      ? 'bg-emerald-600 text-white'
                      : 'bg-muted hover:bg-muted/70'
                  }`}
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => q.setter(false)}
                  className={`py-3 rounded-md text-sm font-medium transition ${
                    q.value === false
                      ? 'bg-rose-600 text-white'
                      : 'bg-muted hover:bg-muted/70'
                  }`}
                >
                  No
                </button>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={submitting || q1 === null || q2 === null || q3 === null}
          className="w-full py-4 rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Submit endorsement
        </button>

        {/* showResume=false: this is a ONE-TIME link and the page keeps
            no draft, so promising "come back later" would be wrong twice
            over. */}
        <ReassuranceNote variant="endorse" showResume={false} />
        <OfflineFallbackCard code={`EN-${p.id}`} />

        <p className="text-[10px] text-center text-muted-foreground">
          Your answers are shared only with Adeso. No account is created.
          This link works one time.
        </p>
      </div>
    </div>
  );
}
