'use client';

/**
 * PortfolioAuditTimeline — donor-side hash-chain visualisation (Phase 13).
 *
 * Renders the most recent audit-chain entries scoped to this donor's
 * grants + portfolio downloads. The point: the donor SEES the loop.
 *   passport publish  →  passport verify
 *   report bundle publish  →  bundle download
 *   portfolio PDF download  ←  receipt for the donor's own ops team
 *
 * Quiet on empty. Auto-hides for non-donor/admin.
 */

import { useEffect, useState } from 'react';
import {
  FileCheck2, Eye, Download, ShieldCheck, FileText,
  Loader2, RefreshCw, Activity,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Entry {
  id: number;
  seq: number;
  created_at: string | null;
  action: string;
  actor_email: string | null;
  subject_kind: string;
  subject_id: number;
  details: Record<string, unknown>;
  payload_hash: string;
}

interface Resp {
  success: boolean;
  cached?: boolean;
  entries: Entry[];
}

const ACTION_META: Record<string, { icon: typeof FileCheck2; tone: string; label: string }> = {
  'capacity_passport.publish': { icon: ShieldCheck, tone: 'text-[hsl(var(--kuja-clay))]', label: 'Passport published' },
  'capacity_passport.verify':  { icon: Eye,         tone: 'text-[hsl(var(--kuja-grow))]', label: 'Passport verified' },
  'capacity_passport.revoke':  { icon: ShieldCheck, tone: 'text-[hsl(var(--kuja-flag))]', label: 'Passport revoked' },
  'report_bundle.publish':     { icon: FileCheck2,  tone: 'text-[hsl(var(--kuja-clay))]', label: 'Bundle published' },
  'report_bundle.download_pdf':{ icon: Download,    tone: 'text-[hsl(var(--kuja-grow))]', label: 'Bundle PDF downloaded' },
  'portfolio.download_pdf':    { icon: Download,    tone: 'text-[hsl(var(--kuja-clay-dark))]', label: 'Portfolio PDF downloaded' },
  'apply_unpack.run':          { icon: FileText,    tone: 'text-[hsl(var(--kuja-clay))]', label: 'Agreement unpacked' },
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso.slice(0, 16).replace('T', ' ');
  }
}

function detailHint(e: Entry): string {
  const d = e.details || {};
  const parts: string[] = [];
  if (e.subject_kind && e.subject_id) parts.push(`${e.subject_kind} #${e.subject_id}`);
  if (d.filename) parts.push(String(d.filename));
  if (d.grantee_count != null) parts.push(`${d.grantee_count} grantees`);
  if (d.report_count != null) parts.push(`${d.report_count} reports`);
  if (d.bundle_hash) parts.push(`hash ${String(d.bundle_hash).slice(0, 8)}`);
  return parts.join(' · ');
}

export function PortfolioAuditTimeline() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await api.get<Resp>('/api/portfolio/audit-timeline?limit=25');
      if (res.success) {
        setEntries(res.entries || []);
        setError(null);
      } else {
        setError('Could not load audit chain');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading review timeline…
        </div>
      </Card>
    );
  }

  if (error || entries.length === 0) {
    return null; // quiet on empty
  }

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">
            <Activity className="h-3.5 w-3.5" />
            Portfolio review timeline
          </div>
          <h3 className="kuja-display text-lg">Tamper-evident audit chain</h3>
          <p className="text-xs text-muted-foreground">
            Every publish, verify, and download against your portfolio, hash-anchored.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setRefreshing(true); load(); }}
          disabled={refreshing}
          aria-label="Refresh timeline"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
        </Button>
      </div>

      <ol className="relative space-y-3 border-l border-dashed border-[hsl(var(--border))] pl-4">
        {entries.map((e) => {
          const meta = ACTION_META[e.action] || {
            icon: FileText,
            tone: 'text-[hsl(var(--kuja-ink-soft))]',
            label: e.action,
          };
          const Icon = meta.icon;
          return (
            <li key={e.id} className="relative">
              <span
                className={cn(
                  'absolute -left-[1.55rem] top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-background',
                  meta.tone,
                )}
                aria-hidden="true"
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                <span className="font-medium">{meta.label}</span>
                <Badge variant="outline" className="font-mono text-[10px]">
                  seq {e.seq}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {fmtDate(e.created_at)}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {detailHint(e)}
                {e.actor_email ? ` · ${e.actor_email}` : ''}
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-[hsl(var(--kuja-ink-soft))]">
                hash: {e.payload_hash}…
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
