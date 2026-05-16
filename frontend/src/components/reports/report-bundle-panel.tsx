'use client';

/**
 * ReportBundlePanel — "publish a single shareable bundle for this report" (Phase 8).
 *
 * NGO opens it on a report → sees what the donor will see:
 *   cover · executive summary (AI) · narrative · indicators ·
 *   attachments · asks / risks / decisions · trust snapshot ·
 *   compliance score
 * with a bundle_hash anchor so the snapshot is provably the one the
 * donor reviewed.
 *
 * "Publish" writes an AuditChainEntry so the publish event is tamper-
 * evident.
 */

import { useState } from 'react';
import {
  FileBox, Sparkles, ShieldCheck, FileText, AlertTriangle, CheckCircle2,
  Loader2, Copy, ExternalLink, BookOpen, Paperclip, Download,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Indicator {
  name: string;
  description?: string;
  target?: string | number;
  unit?: string;
  current?: unknown;
}

interface Attachment {
  id: number;
  original_filename: string;
  doc_type: string | null;
  file_size?: number;
  uploaded_at?: string;
  score?: number;
}

interface Signal {
  id: number;
  body: string;
  status: string;
}

interface TrustSnapshot {
  overall: { score: number; status: string };
  capacity_score: number;
  capacity_status: string;
  diligence_score: number;
  diligence_status: string;
}

interface Bundle {
  cover_meta: {
    title: string;
    reporting_period?: string;
    org_name?: string;
    org_country?: string;
    grant_title?: string;
    donor_org_name?: string;
    status: string;
    submitted_at?: string;
    due_date?: string;
    revision_number?: number;
  };
  executive_summary: string | null;
  narrative_sections: Record<string, unknown>;
  indicators: Indicator[];
  attachments: Attachment[];
  asks: Signal[];
  risks: Signal[];
  decisions: Signal[];
  trust_snapshot: TrustSnapshot | null;
  compliance_score?: number | null;
  risk_flags?: string[];
  bundle_hash: string;
  assembled_at: string;
}

interface BundleResp {
  success: boolean;
  bundle: Bundle;
  cached?: boolean;
}

function STATUS_TONE(s: string): string {
  if (s === 'clear' || s === 'strong') return 'text-[hsl(var(--kuja-grow))]';
  if (s === 'review' || s === 'adequate') return 'text-[hsl(var(--kuja-sun))]';
  if (s === 'flagged' || s === 'thin') return 'text-[hsl(var(--kuja-flag))]';
  return 'text-[hsl(var(--kuja-ink-soft))]';
}

function fmtBytes(n?: number): string {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export interface ReportBundlePanelProps {
  reportId: number;
  canPublish: boolean;
}

export function ReportBundlePanel({ reportId, canPublish }: ReportBundlePanelProps) {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<BundleResp>(`/api/reports/${reportId}/bundle`);
      setBundle(r.bundle);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const publish = async () => {
    setPublishing(true);
    setError(null);
    try {
      const r = await api.post<BundleResp>(`/api/reports/${reportId}/bundle/publish`, {});
      setBundle(r.bundle);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  const copyHash = async () => {
    if (!bundle) return;
    try {
      await navigator.clipboard.writeText(bundle.bundle_hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {/* ignore */}
  };

  if (!bundle && !loading) {
    return (
      <Card className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-md bg-[hsl(var(--kuja-clay)/0.1)]">
            <FileBox className="w-5 h-5 text-[hsl(var(--kuja-clay))]" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold">Donor review bundle</h3>
            <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-0.5">
              Assemble a single deliverable: cover, AI executive summary, narrative,
              indicators, evidence, asks/risks/decisions, and the org&apos;s trust snapshot —
              ready to share with the donor.
            </p>
            <button
              type="button"
              onClick={load}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[hsl(var(--kuja-clay-dark))]"
            >
              <Sparkles className="w-3.5 h-3.5" /> Assemble bundle
            </button>
          </div>
        </div>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-[hsl(var(--kuja-ink-soft))]">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Assembling bundle — AI executive summary may take a few seconds.</span>
        </div>
      </Card>
    );
  }

  if (error || !bundle) {
    return (
      <Card className="p-4 border-l-4 border-l-[hsl(var(--kuja-flag))]">
        <h3 className="text-sm font-semibold text-[hsl(var(--kuja-flag))]">Could not assemble bundle</h3>
        <p className="text-xs mt-1">{error}</p>
        <button type="button" onClick={load} className="mt-2 text-xs text-[hsl(var(--kuja-clay))] hover:underline">Retry</button>
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-5 border-l-4 border-l-[hsl(var(--kuja-clay))]">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2 min-w-0">
          <div className="p-2 rounded-md bg-[hsl(var(--kuja-clay)/0.1)]">
            <FileBox className="w-5 h-5 text-[hsl(var(--kuja-clay))]" />
          </div>
          <div className="min-w-0">
            <div className="kuja-eyebrow">Donor review bundle</div>
            <h2 className="kuja-display text-xl mt-0.5">{bundle.cover_meta.title}</h2>
            <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-0.5">
              {bundle.cover_meta.org_name}
              {bundle.cover_meta.donor_org_name && <> · {bundle.cover_meta.donor_org_name}</>}
              {bundle.cover_meta.reporting_period && <> · {bundle.cover_meta.reporting_period}</>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Phase 9 — direct PDF download. Same endpoint as JSON but .pdf;
              browser-handles the download. Available to anyone with read
              access (donors, reviewers, admin, NGO). */}
          <a
            href={`/api/reports/${reportId}/bundle.pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-xs font-semibold text-[hsl(var(--kuja-ink))] hover:bg-[hsl(var(--kuja-sand-50))]"
          >
            <Download className="w-3.5 h-3.5" /> Download PDF
          </a>
          {canPublish && (
            <button
              type="button"
              onClick={publish}
              disabled={publishing}
              className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[hsl(var(--kuja-clay-dark))] disabled:opacity-50"
            >
              {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              {publishing ? 'Publishing…' : 'Publish (audit anchor)'}
            </button>
          )}
        </div>
      </div>

      {/* Bundle hash + assembled time */}
      <div className="mt-3 flex items-center justify-between gap-2 flex-wrap text-[11px] text-[hsl(var(--kuja-ink-soft))]">
        <span>
          Assembled {new Date(bundle.assembled_at).toLocaleString()}
        </span>
        <button
          type="button"
          onClick={copyHash}
          className="inline-flex items-center gap-1 font-mono hover:text-[hsl(var(--kuja-clay))]"
          aria-label="Copy bundle hash"
          title="Copy bundle hash"
        >
          {copied ? <CheckCircle2 className="w-3 h-3 text-[hsl(var(--kuja-grow))]" /> : <Copy className="w-3 h-3" />}
          <span>{bundle.bundle_hash.slice(0, 16)}…</span>
        </button>
      </div>

      {/* Executive summary */}
      {bundle.executive_summary && (
        <Card className="mt-4 p-3 border-l-4 border-l-[hsl(var(--kuja-spark))] bg-[hsl(var(--kuja-spark-soft))]">
          <div className="kuja-eyebrow flex items-center gap-1.5">
            Executive summary
            <span className="kuja-ai-pill text-[9px]"><Sparkles className="w-2.5 h-2.5" /> AI</span>
          </div>
          <p className="text-sm leading-relaxed text-[hsl(var(--kuja-ink))] mt-1">{bundle.executive_summary}</p>
        </Card>
      )}

      {/* Quick stats grid */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
        <div className="rounded-md border border-[hsl(var(--border))] p-2">
          <div className="kuja-label text-[9px]">Status</div>
          <div className={cn('font-semibold uppercase', STATUS_TONE(bundle.cover_meta.status))}>{bundle.cover_meta.status}</div>
        </div>
        {bundle.compliance_score !== undefined && bundle.compliance_score !== null && (
          <div className="rounded-md border border-[hsl(var(--border))] p-2">
            <div className="kuja-label text-[9px]">Compliance</div>
            <div className="font-semibold kuja-numeric">{bundle.compliance_score}/100</div>
          </div>
        )}
        {bundle.trust_snapshot && (
          <>
            <div className="rounded-md border border-[hsl(var(--border))] p-2">
              <div className="kuja-label text-[9px]">Capacity</div>
              <div className={cn('font-semibold kuja-numeric', STATUS_TONE(bundle.trust_snapshot.capacity_status))}>
                {bundle.trust_snapshot.capacity_score}/100
              </div>
            </div>
            <div className="rounded-md border border-[hsl(var(--border))] p-2">
              <div className="kuja-label text-[9px]">Diligence</div>
              <div className={cn('font-semibold kuja-numeric', STATUS_TONE(bundle.trust_snapshot.diligence_status))}>
                {bundle.trust_snapshot.diligence_score}/100
              </div>
            </div>
          </>
        )}
        <div className="rounded-md border border-[hsl(var(--border))] p-2">
          <div className="kuja-label text-[9px]">Evidence</div>
          <div className="font-semibold kuja-numeric">{bundle.attachments.length}</div>
        </div>
      </div>

      {/* Narrative sections */}
      {Object.keys(bundle.narrative_sections).length > 0 && (
        <div className="mt-4">
          <div className="kuja-label flex items-center gap-1.5"><BookOpen className="w-3 h-3" /> Narrative</div>
          <div className="mt-2 space-y-2">
            {Object.entries(bundle.narrative_sections).slice(0, 5).map(([key, value]) => (
              <div key={key} className="rounded-md border border-[hsl(var(--border))] p-2 text-xs">
                <div className="font-semibold text-[hsl(var(--kuja-ink))]">{key.replace(/_/g, ' ')}</div>
                <p className="mt-1 text-[hsl(var(--kuja-ink-soft))] line-clamp-4 leading-relaxed">{String(value)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Indicators */}
      {bundle.indicators.length > 0 && (
        <div className="mt-4">
          <div className="kuja-label">Indicators ({bundle.indicators.length})</div>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {bundle.indicators.slice(0, 8).map((ind, i) => (
              <div key={i} className="rounded-md border border-[hsl(var(--border))] p-2">
                <div className="font-semibold">{ind.name}</div>
                <div className="mt-1 text-[hsl(var(--kuja-ink-soft))]">
                  {ind.current !== undefined && ind.current !== null ? <strong>{String(ind.current)}</strong> : <em>not reported</em>}
                  {ind.target !== undefined && ind.target !== null && <> / target {String(ind.target)}</>}
                  {ind.unit && <> {ind.unit}</>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Attachments */}
      {bundle.attachments.length > 0 && (
        <div className="mt-4">
          <div className="kuja-label flex items-center gap-1.5"><Paperclip className="w-3 h-3" /> Evidence attachments</div>
          <ul className="mt-2 space-y-1 text-xs">
            {bundle.attachments.slice(0, 10).map((a) => (
              <li key={a.id} className="flex items-center gap-2 rounded-md border border-[hsl(var(--border))] px-2 py-1.5">
                <FileText className="w-3.5 h-3.5 text-[hsl(var(--kuja-ink-soft))]" />
                <span className="font-semibold truncate flex-1">{a.original_filename}</span>
                <span className="text-[hsl(var(--kuja-ink-soft))] shrink-0">
                  {a.doc_type && <Badge variant="outline" className="text-[9px] mr-1">{a.doc_type}</Badge>}
                  {fmtBytes(a.file_size)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Asks / Risks / Decisions strip */}
      {(bundle.asks.length + bundle.risks.length + bundle.decisions.length > 0) && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          {[
            { label: 'Asks', items: bundle.asks, tone: 'text-[hsl(var(--kuja-sky))]' },
            { label: 'Risks', items: bundle.risks, tone: 'text-[hsl(var(--kuja-sun))]' },
            { label: 'Decisions', items: bundle.decisions, tone: 'text-[hsl(var(--kuja-grow))]' },
          ].map(col => (
            <div key={col.label} className="rounded-md border border-[hsl(var(--border))] p-2">
              <div className={cn('kuja-label', col.tone)}>{col.label} ({col.items.length})</div>
              <ul className="mt-1 space-y-1">
                {col.items.slice(0, 3).map((s) => (
                  <li key={s.id} className={cn('text-[11px] line-clamp-2', s.status === 'resolved' && 'opacity-50 line-through')}>
                    {s.body}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Risk flags from AI report analysis */}
      {bundle.risk_flags && bundle.risk_flags.length > 0 && (
        <div className="mt-4 rounded-md border-l-4 border-l-[hsl(var(--kuja-flag))] bg-[hsl(var(--kuja-flag)/0.05)] p-3">
          <div className="kuja-label flex items-center gap-1.5 text-[hsl(var(--kuja-flag))]">
            <AlertTriangle className="w-3 h-3" /> AI risk flags
          </div>
          <ul className="mt-1 space-y-1 text-xs">
            {bundle.risk_flags.slice(0, 5).map((f, i) => <li key={i}>· {f}</li>)}
          </ul>
        </div>
      )}

      <p className="mt-3 text-[10px] text-[hsl(var(--kuja-ink-soft))] flex items-center gap-1.5">
        <ExternalLink className="w-3 h-3" />
        Publishing the bundle anchors its hash in the tamper-evident audit chain so the donor can prove what they reviewed.
      </p>
    </Card>
  );
}
