'use client';

/**
 * PortfolioDownloadCard — donor portfolio PDF + AI exec summary (Phase 13).
 *
 * One click → kuja-portfolio-<donor>-<period>.pdf. Wraps the
 * /api/portfolio/bundle + /api/portfolio/bundle.pdf endpoints with an
 * inline AI executive summary preview so the donor can scan before
 * downloading.
 *
 * Cost-aware: only the JSON fetch on mount + a user-triggered download.
 * The same lookback used in the preview is used for the PDF so they
 * match. Defaults to 90 days; donor can switch to 30/180/365.
 */

import { useEffect, useState } from 'react';
import {
  Sparkles, Download, Loader2, FileText, Users, AlertTriangle,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

interface BundleCover { org_name?: string; title?: string; reporting_period?: string; status?: string; }
interface Bundle {
  cover_meta?: BundleCover;
  compliance_score?: number | null;
  risks?: unknown[];
  attachments?: unknown[];
  executive_summary?: string;
}
interface Portfolio {
  donor_org_id: number;
  donor_org_name: string;
  lookback_days: number;
  period_label: string;
  report_count: number;
  grantee_count: number;
  bundles: Bundle[];
  ai_portfolio_summary: string | null;
}

const LOOKBACK_CHOICES = [
  { value: 30,  label: 'Last 30 days' },
  { value: 90,  label: 'Last quarter' },
  { value: 180, label: 'Last 6 months' },
  { value: 365, label: 'Last 12 months' },
];

export function PortfolioDownloadCard() {
  const [days, setDays] = useState<number>(90);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(lookback: number) {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; portfolio: Portfolio }>(
        `/api/portfolio/bundle?days=${lookback}`
      );
      if (res.success) {
        setPortfolio(res.portfolio);
      } else {
        setError('Could not assemble portfolio');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not assemble portfolio');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(days); }, [days]);

  async function downloadPdf() {
    setDownloading(true);
    try {
      const url = `/api/portfolio/bundle.pdf?days=${days}`;
      const resp = await fetch(url, { credentials: 'include' });
      if (!resp.ok) throw new Error('Download failed');
      const blob = await resp.blob();
      const cd = resp.headers.get('content-disposition') || '';
      const m = cd.match(/filename="?([^";]+)"?/i);
      const filename = m ? m[1] : `kuja-portfolio-${days}d.pdf`;
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      // best-effort UI feedback only; the server logs the failure
      console.warn('Portfolio PDF download failed', e);
    } finally {
      setDownloading(false);
    }
  }

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Assembling portfolio review…
        </div>
      </Card>
    );
  }

  if (error || !portfolio) {
    return null; // quiet on actual error — other cards remain useful
  }

  const totalRisks = portfolio.bundles.reduce((s, b) => s + (b.risks?.length || 0), 0);
  const isEmpty = portfolio.report_count === 0;

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">
            <Sparkles className="h-3.5 w-3.5" />
            Portfolio review pack
          </div>
          <h3 className="kuja-display text-lg">Board-ready PDF</h3>
          <p className="text-xs text-muted-foreground">{portfolio.period_label}</p>
        </div>

        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="portfolio-lookback">Lookback window</label>
          <select
            id="portfolio-lookback"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-8 rounded-md border border-[hsl(var(--border))] bg-background px-2 text-xs"
          >
            {LOOKBACK_CHOICES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <Button
            size="sm"
            onClick={downloadPdf}
            disabled={downloading || portfolio.report_count === 0}
          >
            {downloading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Download className="h-3.5 w-3.5" />}
            <span className="ml-1.5">Download PDF</span>
          </Button>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-md border border-[hsl(var(--border))] p-2">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            <Users className="h-3 w-3" /> Grantees
          </div>
          <div className="text-lg font-semibold">{portfolio.grantee_count}</div>
        </div>
        <div className="rounded-md border border-[hsl(var(--border))] p-2">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            <FileText className="h-3 w-3" /> Reports
          </div>
          <div className="text-lg font-semibold">{portfolio.report_count}</div>
        </div>
        <div className="rounded-md border border-[hsl(var(--border))] p-2">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            <AlertTriangle className="h-3 w-3" /> Open risks
          </div>
          <div className="text-lg font-semibold">{totalRisks}</div>
        </div>
        <div className="rounded-md border border-[hsl(var(--border))] p-2">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            <Sparkles className="h-3 w-3" /> Source
          </div>
          <div className="text-xs font-semibold">
            {portfolio.ai_portfolio_summary ? 'AI summary' : 'No summary'}
          </div>
        </div>
      </div>

      {portfolio.ai_portfolio_summary && (
        <div className="rounded-md border-l-2 border-[hsl(var(--kuja-clay))] bg-[hsl(var(--kuja-sand))]/40 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-[hsl(var(--kuja-clay-dark))]">
            <Sparkles className="h-3 w-3" /> Executive summary · AI generated
          </div>
          <p className="text-sm leading-relaxed text-[hsl(var(--foreground))]">
            {portfolio.ai_portfolio_summary}
          </p>
        </div>
      )}

      {isEmpty && (
        <div className="rounded-md border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--kuja-sand))]/30 p-3">
          <p className="text-sm font-medium text-foreground">
            No reports in this window yet.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Two ways to fill this dashboard:
          </p>
          <ul className="mt-1 space-y-0.5 pl-4 text-xs text-muted-foreground list-disc">
            <li>Switch the lookback above to <strong>Last 6 months</strong> or <strong>Last 12 months</strong>.</li>
            <li>Wait for your grantees to submit — you’ll see a board-ready summary the moment any report lands.</li>
          </ul>
          <p className="mt-2 text-[10px] text-muted-foreground">
            One AI portfolio summary call is bounded per download — nothing wakes up until you click.
          </p>
        </div>
      )}
    </Card>
  );
}
