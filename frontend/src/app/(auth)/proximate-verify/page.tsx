'use client';

/**
 * Verifier mini-portal — Phase 691 (June 2026).
 *
 * Token URL the assigned third-party verifier uses to attest
 * independently to a disbursement without needing a Kuja login.
 *
 *   /proximate-verify?t=<verifier-token>
 *
 * One-shot: once they submit a verdict, the token rejects further
 * submissions. Same pattern as Phase 652 disbursement-report and
 * Phase 679 outcome-attestation.
 */

import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  OfflineFallbackCard,
  ReassuranceNote,
  EffortBadges,
} from '@/components/proximate/token-page-support';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

interface DisbursementCtx {
  id: number;
  amount_usd: number | null;
  purpose: string | null;
  status: string;
  sent_at: string | null;
  partner_name: string | null;
  verifier_verdict: string | null;
  verifier_notes: string | null;
  verifier_attested_at: string | null;
  verified_by_ob: boolean;
  flagged_by_ob: boolean;
}

export default function ProximateVerifyPage() {
  const { t } = useTranslation();
  const [token, setToken] = useState('');
  const [data, setData] = useState<DisbursementCtx | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<'confirmed' | 'disputed' | ''>('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const tk = url.searchParams.get('t');
    if (!tk) {
      setError(t('proximate.verify.missing_token'));
      setLoading(false);
      return;
    }
    setToken(tk);
    fetch(`${API_BASE}/api/proximate/verify-attest/${encodeURIComponent(tk)}`, {
      headers: { 'X-Network-Override': 'proximate' },
    })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok || !body.success) {
          setError(body.error || t('proximate.verify.load_failed'));
        } else {
          setData(body.disbursement);
          if (body.disbursement.verifier_verdict) {
            setSubmitted(true);
            setVerdict(body.disbursement.verifier_verdict);
            setNotes(body.disbursement.verifier_notes || '');
          }
        }
      })
      .catch(() => setError(t('proximate.verify.load_failed')))
      .finally(() => setLoading(false));
  }, [t]);

  const onSubmit = async () => {
    if (!verdict) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(
        `${API_BASE}/api/proximate/verify-attest/${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Network-Override': 'proximate',
          },
          body: JSON.stringify({ verdict, notes: notes.trim() }),
        },
      );
      const body = await r.json();
      if (!r.ok || !body.success) {
        setError(body.error || t('proximate.verify.submit_failed'));
      } else {
        setSubmitted(true);
      }
    } catch {
      setError(t('proximate.verify.submit_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-6">
        <div className="max-w-2xl mx-auto">
          <Card className="p-6 text-center">
            <p className="text-sm text-red-600">{error || t('proximate.verify.load_failed')}</p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="max-w-2xl mx-auto space-y-5">
        <header>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            {t('proximate.verify.portal_label')}
          </p>
          <h1 className="text-2xl kuja-display">
            {t('proximate.verify.title')}
          </h1>
          <EffortBadges showVoice={false} className="mt-3" />
        </header>

        <Card className="p-5 space-y-3">
          <h2 className="text-lg font-medium">
            {t('proximate.verify.context_title')}
          </h2>
          <dl className="text-sm space-y-1 text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">{t('proximate.verify.partner_label')}:</span>{' '}
              {data.partner_name || '—'}
            </div>
            <div>
              <span className="font-medium text-foreground">{t('proximate.verify.amount_label')}:</span>{' '}
              ${data.amount_usd?.toLocaleString() || '—'}
            </div>
            {data.purpose && (
              <div>
                <span className="font-medium text-foreground">{t('proximate.verify.purpose_label')}:</span>{' '}
                {data.purpose}
              </div>
            )}
            {data.sent_at && (
              <div>
                <span className="font-medium text-foreground">{t('proximate.verify.sent_at_label')}:</span>{' '}
                {new Date(data.sent_at).toLocaleDateString()}
              </div>
            )}
            <div>
              <span className="font-medium text-foreground">{t('proximate.verify.ob_status_label')}:</span>{' '}
              {data.verified_by_ob
                ? t('proximate.verify.ob_verified')
                : data.flagged_by_ob
                ? t('proximate.verify.ob_flagged')
                : t('proximate.verify.ob_pending')}
            </div>
          </dl>
        </Card>

        {submitted ? (
          <Card className="p-6 text-center bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
            <h3 className="text-base font-medium">
              {t('proximate.verify.submitted_title')}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {t('proximate.verify.submitted_body')}{' '}
              <span className="font-medium">{verdict}</span>
            </p>
            {notes && (
              <p className="text-sm text-foreground mt-3 text-start whitespace-pre-wrap">
                {notes}
              </p>
            )}
          </Card>
        ) : (
          <Card className="p-5 space-y-4">
            <h2 className="text-lg font-medium">
              {t('proximate.verify.attest_title')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t('proximate.verify.attest_body')}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setVerdict('confirmed')}
                className={`p-4 rounded border text-sm font-medium ${
                  verdict === 'confirmed'
                    ? 'bg-emerald-100 dark:bg-emerald-950/30 border-emerald-400 text-emerald-900 dark:text-emerald-200'
                    : 'bg-background hover:bg-muted border-border'
                }`}
              >
                <CheckCircle2 className="w-5 h-5 inline me-1" />
                {t('proximate.verify.confirmed_label')}
              </button>
              <button
                type="button"
                onClick={() => setVerdict('disputed')}
                className={`p-4 rounded border text-sm font-medium ${
                  verdict === 'disputed'
                    ? 'bg-red-100 dark:bg-red-950/30 border-red-400 text-red-900 dark:text-red-200'
                    : 'bg-background hover:bg-muted border-border'
                }`}
              >
                <AlertTriangle className="w-5 h-5 inline me-1" />
                {t('proximate.verify.disputed_label')}
              </button>
            </div>
            <Textarea
              placeholder={t('proximate.verify.notes_placeholder')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
            />
            <Button
              onClick={onSubmit}
              disabled={!verdict || submitting}
              className="w-full"
            >
              {submitting && <Loader2 className="w-4 h-4 me-2 animate-spin" />}
              {t('proximate.verify.submit_cta')}
            </Button>
          </Card>
        )}

        {/* variant="endorse": the verifier's name reaches Adeso but is
            never shown to the partner they are attesting about, which is
            exactly what that line says. showResume is false — this page
            keeps no draft, and one long-form verdict is not worth
            leaving on what may be a borrowed phone. */}
        <ReassuranceNote variant="endorse" showResume={false} />
        <OfflineFallbackCard code={`DV-${data.id}`} />

        <p className="text-xs text-muted-foreground pt-3 border-t">
          {t('proximate.verify.footer_keep_link_safe')}
        </p>
      </div>
    </div>
  );
}
