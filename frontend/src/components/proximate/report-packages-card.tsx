'use client';

/**
 * Partner reporting card — round page, OB only (July 2026).
 *
 * One row per roster partner: open their report package (creates the
 * reusable phone link), share it via WhatsApp/copy, watch the status,
 * jump into review. The token link is the partner's whole reporting UX.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Loader2, FileText, Copy, Check, MessageCircle, ExternalLink,
} from 'lucide-react';
import { api } from '@/lib/api';
import { labelForProximateStatus } from '@/lib/proximate-status-labels';
import { useOrigin } from '@/components/proximate/token-page-support';
import { useTranslation } from '@/lib/hooks/use-translation';

interface Pkg {
  id: number; partner_id: number; partner_name: string | null;
  status: string; package_token: string; item_count: number;
}
interface Participant { partner_id: number; partner_name: string | null; stage: string }

const STATUS_PILL: Record<string, string> = {
  draft: 'slate',
  submitted: 'warn',
  changes_requested: 'danger',
  published: 'good',
};

export function ReportPackagesCard({
  roundId, participants, isOperator,
}: { roundId: number; participants: Participant[]; isOperator: boolean }) {
  const origin = useOrigin();
  const { t } = useTranslation();
  const [pkgs, setPkgs] = useState<Pkg[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const refresh = useCallback(() => {
    api.get<{ packages: Pkg[] }>(
      `/api/proximate/rounds/${roundId}/report-packages`,
    ).then((r) => setPkgs(r.packages)).catch(() => setPkgs([]));
  }, [roundId]);

  useEffect(() => {
    if (isOperator) refresh();
  }, [isOperator, refresh]);

  if (!isOperator || pkgs === null) return null;

  const byPartner = new Map(pkgs.map((p) => [p.partner_id, p]));
  const roster = participants.filter((p) => p.stage !== 'withdrawn');
  if (roster.length === 0) return null;

  // See selection-vote-card: origin comes from a mount effect so a
  // prerender pass can never bake a host-less link into a share action.
  const shareUrl = (token: string) =>
    `${origin ?? ''}/proximate-report-package?t=${token}`;

  const open = async (partnerId: number) => {
    setBusyId(partnerId);
    try {
      await api.post(`/api/proximate/rounds/${roundId}/report-packages`,
                     { partner_id: partnerId });
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  const copy = async (pkg: Pkg) => {
    try {
      await navigator.clipboard.writeText(shareUrl(pkg.package_token));
      setCopiedId(pkg.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch { /* WhatsApp button still works */ }
  };

  return (
    <div className="prox-panel" style={{ padding: '16px 18px' }}>
      <div className="flex items-center gap-2 mb-2">
        <FileText className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm flex-1" style={{ fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif', fontWeight: 700 }}>{t('proximate.reports.partner_reporting')}</h3>
        <p className="text-[10px]" style={{ color: 'var(--prox-muted)' }}>
          {t('proximate.reports.partner_reporting_sub')}
        </p>
      </div>
      <ul className="space-y-1.5">
        {roster.map((p) => {
          const pkg = byPartner.get(p.partner_id);
          return (
            <li key={p.partner_id}
                className="flex items-center gap-2 py-1 text-sm flex-wrap border-b last:border-b-0"
                style={{ borderColor: 'var(--prox-line)' }}>
              <span className="flex-1 min-w-0 truncate" style={{ fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif', fontWeight: 700 }}>
                {p.partner_name || `Partner #${p.partner_id}`}
              </span>
              {pkg ? (
                <>
                  <span className={`prox-pill ${STATUS_PILL[pkg.status] || 'slate'}`}>
                    {labelForProximateStatus(pkg.status) || pkg.status}
                    {pkg.item_count > 0 && ` · ${pkg.item_count} items`}
                  </span>
                  <button type="button" onClick={() => copy(pkg)}
                    className="text-[10px] inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted"
                    style={{ border: '1px solid var(--prox-line)' }}>
                    {copiedId === pkg.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copiedId === pkg.id ? 'Copied' : 'Copy link'}
                  </button>
                  <a href={`https://wa.me/?text=${encodeURIComponent(
                        `Salaam. Please use this link to submit your Proximate implementation report — numbers, photos, videos and voice notes all in one place: ${shareUrl(pkg.package_token)}`)}`}
                     target="_blank" rel="noopener noreferrer"
                     className="text-[10px] inline-flex items-center gap-1 px-2 py-1 rounded-md"
                     style={{ background: 'var(--prox-good-tint)', color: 'var(--prox-good)', border: '1px solid var(--prox-good)' }}>
                    <MessageCircle className="w-3 h-3" /> WhatsApp
                  </a>
                  <Link href={`/proximate/reports/${pkg.id}`}
                        className="text-[10px] inline-flex items-center gap-1 px-2 py-1 rounded-md"
                        style={{ background: 'var(--prox-accent-tint)', color: 'var(--prox-accent-deep)', border: '1px solid var(--prox-accent)' }}>
                    <ExternalLink className="w-3 h-3" /> Review
                  </Link>
                </>
              ) : (
                <button type="button" disabled={busyId === p.partner_id}
                        onClick={() => open(p.partner_id)}
                        className="text-[10px] inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted"
                        style={{ border: '1px solid var(--prox-line)' }}>
                  {busyId === p.partner_id && <Loader2 className="w-3 h-3 animate-spin" />}
                  {t('proximate.reports.open_reporting')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
