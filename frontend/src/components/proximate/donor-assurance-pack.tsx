'use client';

/**
 * "Download assurance pack" — the donor's hand-it-to-my-auditor button
 * (2026-07-21).
 *
 * Wraps two PDF endpoints that already exist server-side; this adds no
 * new endpoint:
 *   grant → GET /api/proximate/grants/<id>/donor-pack.pdf   (Phase 721f)
 *   round → GET /api/proximate/rounds/<id>/report.pdf       (Phase 671)
 *
 * Why fetch+blob instead of the `window.open(url)` the round card used:
 *
 *  1. Honesty. Both endpoints answer 503 JSON when reportlab is missing
 *     from the deploy, and 403 JSON when the donor doesn't own the
 *     grant. `window.open` renders that JSON in a new tab and the
 *     original page still looks like the download succeeded. Here the
 *     response is inspected — anything that is not actually a PDF
 *     surfaces as a visible failure next to the button, and nothing is
 *     saved.
 *  2. The `X-Network-Override` header. `api.ts` attaches it to every
 *     XHR; a raw `window.open` cannot, so on an override session the
 *     PDF resolves against the wrong tenant. Replicated below.
 */

import { useState } from 'react';
import { Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/hooks/use-translation';
import { DonorExplainer } from '@/components/proximate/donor-explainer';

export type AssurancePackScope = 'grant' | 'round';

function packUrl(scope: AssurancePackScope, id: number) {
  return scope === 'grant'
    ? `/api/proximate/grants/${id}/donor-pack.pdf`
    : `/api/proximate/rounds/${id}/report.pdf`;
}

export function AssurancePackButton({
  scope,
  id,
  variant = 'default',
  size = 'sm',
  className = '',
  showHint = false,
}: {
  scope: AssurancePackScope;
  id: number;
  variant?: 'default' | 'outline';
  size?: 'sm' | 'default';
  className?: string;
  /** Render the one-line "what's inside" note under the button. */
  showHint?: boolean;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const headers: Record<string, string> = {
        'X-Requested-With': 'XMLHttpRequest',
      };
      try {
        const override = window.localStorage.getItem('kuja_network_override');
        if (override) headers['X-Network-Override'] = override;
      } catch {
        // localStorage blocked (private mode) — host-native tenants
        // resolve without the override anyway.
      }

      const res = await fetch(packUrl(scope, id), {
        credentials: 'include',
        headers,
      });

      if (!res.ok) {
        // Both endpoints answer JSON on failure. Prefer the server's own
        // message so "reportlab not installed on this deploy" reaches the
        // person who can act on it instead of becoming a generic error.
        const body = await res.json().catch(() => null);
        const reason = (body && (body.message || body.error))
          || `HTTP ${res.status}`;
        setError(t('proximate.donor.assurance.failed', { reason }));
        return;
      }

      // A 200 that isn't a PDF means the route degraded to a JSON body.
      // Treat it as a failure — saving it would hand the donor a file
      // their auditor cannot open.
      const type = res.headers.get('content-type') || '';
      if (!type.toLowerCase().includes('pdf')) {
        setError(t('proximate.donor.assurance.not_pdf'));
        return;
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = scope === 'grant'
        ? `proximate-grant-${id}-assurance-pack.pdf`
        : `proximate-round-${id}-assurance-pack.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke on the next tick — revoking synchronously can cancel the
      // download on Safari before it has read the blob.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
    } catch (e: unknown) {
      setError(t('proximate.donor.assurance.failed', {
        reason: e instanceof Error ? e.message : 'network error',
      }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <Button
        size={size}
        variant={variant}
        onClick={download}
        disabled={busy}
      >
        {busy
          ? <Loader2 className="w-4 h-4 me-1.5 animate-spin" />
          : <ShieldCheck className="w-4 h-4 me-1.5" />}
        {busy
          ? t('proximate.donor.assurance.preparing')
          : t('proximate.donor.assurance.download')}
      </Button>
      {showHint && !error && (
        <p className="text-xs text-muted-foreground mt-1.5 flex items-start gap-1">
          <span>
            {scope === 'grant'
              ? t('proximate.donor.assurance.hint_grant')
              : t('proximate.donor.assurance.hint_round')}
          </span>
          <DonorExplainer term="assurance_pack" />
        </p>
      )}
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 mt-1.5 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
