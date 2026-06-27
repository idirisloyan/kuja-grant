'use client';

/**
 * Public per-disbursement report page — Phase 652 (June 2026).
 *
 * Partner lands here via a signed link sent by SMS/WhatsApp:
 *   /proximate-report?t=<token>
 *
 * No login required — the token IS the credential. The same form
 * works for an authenticated session too (backend accepts either),
 * so down the road a logged-in partner inbox can route through here.
 *
 * 5-question minimum form per spec:
 *   Q1 did the activity happen? (Y/N)
 *   Q2 how many people did it help? (number)
 *   Q3 any issues? (free text)
 *   Q4 photo OR voice (deferred to Phase 654 — voice/photo upload)
 *   Q5 optional: how the money was spent (free text)
 *
 * Routes static-export-safe: token is read from window.location at
 * runtime, no dynamic params.
 */

import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, Send } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

interface DisbursementMeta {
  id: number;
  partner_name: string | null;
  amount_usd: number | null;
  purpose: string | null;
  sent_at: string | null;
  report_due_at: string | null;
  status: string;
  has_report: boolean;
}

export default function ProximateReportPage() {
  const { t } = useTranslation();
  const [token, setToken] = useState<string | null>(null);
  const [meta, setMeta] = useState<DisbursementMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form
  const [happened, setHappened] = useState<boolean | null>(null);
  const [peopleHelped, setPeopleHelped] = useState('');
  const [issues, setIssues] = useState('');
  const [spendSummary, setSpendSummary] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const tk = url.searchParams.get('t');
    if (!tk) {
      setLoadError(t('proximate.report.missing_token'));
      setLoading(false);
      return;
    }
    setToken(tk);
    fetch(`${API_BASE}/api/proximate/disbursement-reports/${encodeURIComponent(tk)}`, {
      headers: { 'X-Network-Override': 'proximate' },
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok || !data.success) {
          setLoadError(data.error || t('proximate.report.load_failed'));
        } else {
          setMeta(data.disbursement);
          if (data.disbursement?.has_report) setSubmitted(true);
        }
      })
      .catch(() => setLoadError(t('proximate.report.load_failed')))
      .finally(() => setLoading(false));
  }, [t]);

  async function submit() {
    setSubmitError(null);
    if (happened === null) {
      setSubmitError(t('proximate.report.activity_required'));
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch(
        `${API_BASE}/api/proximate/disbursement-reports/${encodeURIComponent(token!)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Network-Override': 'proximate',
          },
          body: JSON.stringify({
            activity_happened: happened,
            people_helped: peopleHelped ? parseInt(peopleHelped, 10) : null,
            issues: issues.trim() || null,
            spend_summary: spendSummary.trim() || null,
          }),
        }
      );
      const data = await r.json();
      if (!r.ok || !data.success) {
        setSubmitError(data.error || t('proximate.report.submit_failed'));
      } else {
        setSubmitted(true);
      }
    } catch {
      setSubmitError(t('proximate.report.submit_failed'));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
        <div className="max-w-2xl mx-auto">
          <Card className="p-6 text-center">
            <p className="text-sm text-red-600">{loadError}</p>
          </Card>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
        <div className="max-w-2xl mx-auto">
          <Card className="p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-4" />
            <h1 className="text-2xl kuja-display mb-2">
              {t('proximate.report.thanks_title')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('proximate.report.thanks_body')}
            </p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="max-w-2xl mx-auto space-y-4">
        <header>
          <h1 className="text-2xl kuja-display mb-1">
            {t('proximate.report.title')}
          </h1>
          {meta && (
            <p className="text-sm text-muted-foreground">
              {meta.partner_name && <span>{meta.partner_name} · </span>}
              {meta.amount_usd && (
                <span>${meta.amount_usd.toLocaleString()}</span>
              )}
              {meta.purpose && <span> · {meta.purpose}</span>}
            </p>
          )}
        </header>

        <Card className="p-6 space-y-5">
          {/* Q1 */}
          <div>
            <label className="block text-sm font-medium mb-2">
              1. {t('proximate.report.q1_happened')}
            </label>
            <div className="flex gap-2">
              <Button
                variant={happened === true ? 'default' : 'outline'}
                size="sm"
                onClick={() => setHappened(true)}
              >
                {t('proximate.report.yes')}
              </Button>
              <Button
                variant={happened === false ? 'default' : 'outline'}
                size="sm"
                onClick={() => setHappened(false)}
              >
                {t('proximate.report.no')}
              </Button>
            </div>
          </div>

          {/* Q2 */}
          <div>
            <label className="block text-sm font-medium mb-2">
              2. {t('proximate.report.q2_people_helped')}
            </label>
            <input
              type="number"
              min={0}
              value={peopleHelped}
              onChange={(e) => setPeopleHelped(e.target.value)}
              className="w-32 h-10 px-3 text-sm bg-background border border-border rounded-md"
              placeholder="0"
            />
          </div>

          {/* Q3 */}
          <div>
            <label className="block text-sm font-medium mb-2">
              3. {t('proximate.report.q3_issues')}
            </label>
            <textarea
              value={issues}
              onChange={(e) => setIssues(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md"
              rows={3}
              maxLength={5000}
              placeholder={t('proximate.report.q3_placeholder')}
            />
          </div>

          {/* Q4 — photo/voice deferred to Phase 654 */}
          <div className="bg-muted/40 border border-border rounded-md p-3">
            <p className="text-xs text-muted-foreground">
              {t('proximate.report.q4_attachment_coming')}
            </p>
          </div>

          {/* Q5 */}
          <div>
            <label className="block text-sm font-medium mb-2">
              5. {t('proximate.report.q5_spend')} {t('proximate.report.optional')}
            </label>
            <textarea
              value={spendSummary}
              onChange={(e) => setSpendSummary(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md"
              rows={3}
              maxLength={5000}
              placeholder={t('proximate.report.q5_placeholder')}
            />
          </div>

          {submitError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {submitError}
            </div>
          )}

          <Button onClick={submit} disabled={submitting} className="w-full">
            {submitting ? (
              <Loader2 className="w-4 h-4 me-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 me-2" />
            )}
            {t('proximate.report.submit')}
          </Button>
        </Card>
      </div>
    </div>
  );
}
