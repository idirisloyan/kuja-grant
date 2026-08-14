'use client';

// ============================================================================
// BuildFinancialSourceCard — Kuja Build financial-source mapping (operator UI).
//
// Admin-only card on the grant detail page. Lets an operator map a grant's
// financial source: 'manual' (default) or 'erp' (pull from Kuja Build using a
// build_ref = Build analytic-account id). Consumes:
//   POST /api/grants/<id>/financial-source   { financial_source, build_ref }
//   GET  /api/admin/build/status              { configured, ... }
//
// This is the frontend for the inert Build scaffolding: mapping a grant is
// allowed now, but the ERP feed only returns data once KUJA_BUILD_* is
// configured on the server. The status line makes that explicit so an operator
// isn't surprised by an empty feed.
// ============================================================================

import { useEffect, useState } from 'react';
import { Database, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { Grant } from '@/lib/types';

type Source = 'manual' | 'erp';

interface BuildStatus {
  configured: boolean;
  base_url_set?: boolean;
  api?: string;
}

interface Props {
  grant: Grant;
}

export function BuildFinancialSourceCard({ grant }: Props) {
  const initialSource: Source = grant.financial_source === 'erp' ? 'erp' : 'manual';
  const [source, setSource] = useState<Source>(initialSource);
  const [buildRef, setBuildRef] = useState<string>(grant.build_ref ?? '');
  const [savedSource, setSavedSource] = useState<Source>(initialSource);
  const [savedRef, setSavedRef] = useState<string>(grant.build_ref ?? '');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<BuildStatus | null>(null);

  useEffect(() => {
    let alive = true;
    api.get<{ success: boolean } & BuildStatus>('/api/admin/build/status')
      .then((r) => { if (alive) setStatus({ configured: r.configured, base_url_set: r.base_url_set, api: r.api }); })
      .catch(() => { if (alive) setStatus(null); });
    return () => { alive = false; };
  }, []);

  const dirty = source !== savedSource || (source === 'erp' && buildRef.trim() !== savedRef);
  // ERP with no ref is allowed (the feed just stays empty), but warn the operator.
  const erpMissingRef = source === 'erp' && buildRef.trim() === '';

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await api.post<{ success: boolean; financial_source: Source; build_ref: string | null }>(
        `/api/grants/${grant.id}/financial-source`,
        { financial_source: source, build_ref: source === 'erp' ? (buildRef.trim() || null) : null },
      );
      const nextSource: Source = res.financial_source === 'erp' ? 'erp' : 'manual';
      setSavedSource(nextSource);
      setSavedRef(res.build_ref ?? '');
      setSource(nextSource);
      setBuildRef(res.build_ref ?? '');
      toast.success('Financial source updated.');
    } catch {
      toast.error('Could not update financial source.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-background p-5">
      <div className="mb-1 flex items-center gap-2">
        <Database className="h-4 w-4 text-[hsl(var(--kuja-clay,var(--primary)))]" aria-hidden />
        <h3 className="text-sm font-semibold">Financial data source</h3>
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          Admin
        </span>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
        Choose where this grant’s budget and spend figures come from. Manual is the default.
        Kuja Build pulls live financials from the ERP by the grant’s Build account id.
      </p>

      {/* Build feed status */}
      <div className="mb-4 flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
        {status?.configured ? (
          <>
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            <span>Kuja Build feed is <strong>connected</strong>. ERP-sourced grants will pull live financials.</span>
          </>
        ) : (
          <>
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            <span>
              Kuja Build feed is <strong>not connected yet</strong>. You can map this grant now, but ERP
              financials stay empty until the Build service is configured.
            </span>
          </>
        )}
      </div>

      {/* Source radios */}
      <div className="space-y-2" role="radiogroup" aria-label="Financial data source">
        {(['manual', 'erp'] as Source[]).map((s) => (
          <label
            key={s}
            className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border px-3 py-2 text-sm hover:border-[hsl(var(--kuja-clay,var(--primary)))]"
          >
            <input
              type="radio"
              name={`financial-source-${grant.id}`}
              value={s}
              checked={source === s}
              onChange={() => setSource(s)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">{s === 'manual' ? 'Manual entry' : 'Kuja Build (ERP)'}</span>
              <span className="block text-xs text-muted-foreground">
                {s === 'manual'
                  ? 'Figures entered in the grant app.'
                  : 'Live budget, actuals and disbursements from Kuja Build.'}
              </span>
            </span>
          </label>
        ))}
      </div>

      {/* build_ref input, only for ERP */}
      {source === 'erp' && (
        <div className="mt-3">
          <label htmlFor={`build-ref-${grant.id}`} className="mb-1 block text-xs font-medium">
            Build account id (analytic account)
          </label>
          <input
            id={`build-ref-${grant.id}`}
            type="text"
            value={buildRef}
            onChange={(e) => setBuildRef(e.target.value)}
            placeholder="e.g. AA-2026-QCF-PROX-01"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-clay,var(--primary)))]"
          />
          {erpMissingRef && (
            <p className="mt-1 text-xs text-amber-600">
              No Build account id set — the ERP feed will return nothing until you add one.
            </p>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={save} disabled={!dirty || saving} className="gap-1.5">
          {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Save
        </Button>
        {grant.financial_synced_at && (
          <span className="text-xs text-muted-foreground">
            Last synced {new Date(grant.financial_synced_at).toLocaleString()}
          </span>
        )}
      </div>
    </section>
  );
}
