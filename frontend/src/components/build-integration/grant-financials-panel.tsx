'use client';

// ============================================================================
// GrantFinancialsPanel — the "with-or-without ERP" financial view (Kuja tenant).
//
// Donor/admin read-only panel on the grant detail page. Renders the ONE
// normalized financials shape from GET /api/grants/<id>/financials regardless of
// source, so compliance/reporting reads the same thing whether the numbers come
// from Kuja Build (ERP) or from manually entered / uploaded figures:
//   status 'manual'          -> figures live in the grant app / uploaded reports
//   status 'erp_unconfigured'-> mapped to Build, feed not connected yet
//   status 'erp'             -> live budget / actuals / disbursements from Build
//   status 'erp_unavailable:*'-> Build hiccup, degraded to the manual shape
//
// Today the Build feed is inert (build_api_pending), so every grant resolves to
// the manual/empty state — which is exactly the correct behaviour for a donor
// who does not run our ERP. The panel is self-contained and Kuja-scoped; it
// quietly renders nothing if the caller isn't authorized for this grant.
// ============================================================================

import { useEffect, useState } from 'react';
import { Wallet, Loader2, Database, CheckCircle2, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';

type Status = 'manual' | 'erp_unconfigured' | 'erp' | string;

interface Line { label?: string; name?: string; category?: string; amount?: number }
interface Financials {
  source: 'erp' | 'manual';
  build_ref: string | null;
  currency: string;
  budget_lines: Line[];
  actuals: Line[];
  disbursements: Line[];
  last_synced_at: string | null;
  status: Status;
}

interface Props { grantId: number }

function money(amount: number | undefined, currency: string): string {
  const n = typeof amount === 'number' ? amount : 0;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${n.toLocaleString()}`;
  }
}

function total(lines: Line[]): number {
  return lines.reduce((s, l) => s + (typeof l.amount === 'number' ? l.amount : 0), 0);
}

function Section({ title, lines, currency }: { title: string; lines: Line[]; currency: string }) {
  if (!lines || lines.length === 0) return null;
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <span className="text-sm font-semibold tabular-nums">{money(total(lines), currency)}</span>
      </div>
      <ul className="space-y-1">
        {lines.map((l, i) => (
          <li key={i} className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-foreground/80">{l.label || l.name || l.category || `Item ${i + 1}`}</span>
            <span className="tabular-nums text-muted-foreground">{money(l.amount, currency)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GrantFinancialsPanel({ grantId }: Props) {
  const [data, setData] = useState<Financials | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get<{ success: boolean; financials: Financials }>(`/api/grants/${grantId}/financials`)
      .then((r) => { if (alive) { setData(r.financials); setLoading(false); } })
      .catch(() => { if (alive) { setDenied(true); setLoading(false); } });
    return () => { alive = false; };
  }, [grantId]);

  // Not authorized for this grant's financials (e.g. a donor viewing another
  // donor's grant) — render nothing rather than an error.
  if (denied) return null;

  const hasLines = !!data && (data.budget_lines.length + data.actuals.length + data.disbursements.length) > 0;
  const isErp = data?.source === 'erp';

  return (
    <section className="rounded-xl border border-border bg-background p-5">
      <div className="mb-1 flex items-center gap-2">
        <Wallet className="h-4 w-4 text-[hsl(var(--kuja-clay,var(--primary)))]" aria-hidden />
        <h3 className="text-sm font-semibold">Financials</h3>
        {data && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {isErp ? <Database className="h-3 w-3" aria-hidden /> : null}
            {isErp ? 'Kuja Build (ERP)' : 'Manual'}
          </span>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading financials…
        </div>
      )}

      {!loading && data && (
        <>
          {/* Status line — honest about where the numbers come from. */}
          <div className="mb-4 flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
            {data.status === 'erp' ? (
              <>
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                <span>Live from Kuja Build{data.last_synced_at ? ` · synced ${new Date(data.last_synced_at).toLocaleString()}` : ''}.</span>
              </>
            ) : data.status === 'erp_unconfigured' ? (
              <>
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                <span>This grant is mapped to Kuja Build, but the ERP feed isn’t connected yet — showing manual figures until it is.</span>
              </>
            ) : String(data.status).startsWith('erp_unavailable') ? (
              <>
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                <span>Kuja Build is temporarily unavailable — showing manual figures.</span>
              </>
            ) : (
              <span className="text-muted-foreground">
                Figures are entered in the grant app and from submitted reports. Donors who run Kuja Build see live budget, actuals and disbursements here instead.
              </span>
            )}
          </div>

          {hasLines ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <Section title="Budget" lines={data.budget_lines} currency={data.currency} />
              <Section title="Actuals" lines={data.actuals} currency={data.currency} />
              <Section title="Disbursements" lines={data.disbursements} currency={data.currency} />
            </div>
          ) : (
            <p className="py-1 text-xs text-muted-foreground">
              No financial figures recorded yet. They’ll appear here as reports are submitted{isErp ? ' or once the Kuja Build feed is connected' : ''}.
            </p>
          )}
        </>
      )}
    </section>
  );
}
