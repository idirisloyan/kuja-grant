'use client';

/**
 * NGOPortfolioDownloadCard — Phase 14.
 *
 * NGO-side analog of PortfolioDownloadCard. NGO program director clicks
 * once → kuja-ngo-portfolio-<ngo>-<period>.pdf for the board meeting.
 *
 * Shows AI-generated delivery summary inline so they can scan before
 * downloading. Empty-state guidance when no reports in window.
 */

import { useEffect, useState } from 'react';
import {
  Sparkles, Download, Loader2, FileText, Users, AlertTriangle,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

interface BundleCover {
  grant_title?: string;
  title?: string;
  donor_org_name?: string;
  reporting_period?: string;
  status?: string;
}
interface Bundle {
  cover_meta?: BundleCover;
  compliance_score?: number | null;
  risks?: unknown[];
  attachments?: unknown[];
  executive_summary?: string;
}
interface NgoPortfolio {
  ngo_org_id: number;
  ngo_org_name: string;
  lookback_days: number;
  period_label: string;
  report_count: number;
  donor_count: number;
  bundles: Bundle[];
  ai_portfolio_summary: string | null;
}

const LOOKBACK_CHOICES = [
  { value: 30,  label: 'Last 30 days' },
  { value: 90,  label: 'Last quarter' },
  { value: 180, label: 'Last 6 months' },
  { value: 365, label: 'Last 12 months' },
];

export function NGOPortfolioDownloadCard() {
  const [days, setDays] = useState<number>(90);
  const [portfolio, setPortfolio] = useState<NgoPortfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(lookback: number) {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; portfolio: NgoPortfolio }>(
        `/api/portfolio/ngo/bundle?days=${lookback}`,
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
      const url = `/api/portfolio/ngo/bundle.pdf?days=${days}`;
      const resp = await fetch(url, { credentials: 'include' });
      if (!resp.ok) throw new Error('Download failed');
      const blob = await resp.blob();
      const cd = resp.headers.get('content-disposition') || '';
      const m = cd.match(/filename="?([^";]+)"?/i);
      const filename = m ? m[1] : `kuja-ngo-portfolio-${days}d.pdf`;
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      console.warn('NGO portfolio PDF download failed', e);
    } finally {
      setDownloading(false);
    }
  }

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Assembling delivery report…
        </div>
      </Card>
    );
  }

  if (error || !portfolio) return null;

  const totalRisks = portfolio.bundles.reduce((s, b) => s + (b.risks?.length || 0), 0);
  const isEmpty = portfolio.report_count === 0;

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">
            <Sparkles className="h-3.5 w-3.5" />
            Delivery report
          </div>
          <h3 className="kuja-display text-lg">Board pack PDF</h3>
          <p className="text-xs text-muted-foreground">{portfolio.period_label}</p>
        </div>

        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="ngo-portfolio-lookback">Lookback window</label>
          <select
            id="ngo-portfolio-lookback"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-8 rounded-md border border-[hsl(var(--border))] bg-background px-2 text-xs"
          >
            {LOOKBACK_CHOICES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <Button size="sm" onClick={downloadPdf} disabled={downloading || isEmpty}>
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
            <Users className="h-3 w-3" /> Donors
          </div>
          <div className="text-lg font-semibold">{portfolio.donor_count}</div>
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
            <Sparkles className="h-3 w-3" /> Delivery summary · AI generated
          </div>
          <p className="text-sm leading-relaxed text-foreground">
            {portfolio.ai_portfolio_summary}
          </p>
        </div>
      )}

      {isEmpty && (
        <div className="rounded-md border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--kuja-sand))]/30 p-3">
          <p className="text-sm font-medium text-foreground">
            No reports submitted in this window yet.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Submit your first report on any open grant — the moment it lands, this card
            assembles a board-ready PDF with an AI delivery summary.
          </p>
        </div>
      )}
    </Card>
  );
}
