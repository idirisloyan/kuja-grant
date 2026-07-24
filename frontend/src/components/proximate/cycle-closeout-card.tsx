'use client';

/**
 * Cycle closeout pack.
 *
 * The outstanding list is the point of this screen. A closeout that only
 * summarised what went well would let a cycle be declared finished with
 * three partners still unpaid — so the blockers come first, and
 * "ready to close" is computed from them rather than asserted.
 */

import { useEffect, useState } from 'react';
import {
  Loader2, PackageCheck, AlertTriangle, CircleAlert, Check, Printer,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/hooks/use-translation';

interface Outstanding { partner: string | null; what: string; severity: string }
interface Closeout {
  cycle: { title: string; target_region: string | null; target_locality: string | null };
  panel: { total: number; confirmed: number; localities: string[] };
  meetings: { id: number; meeting_type: string; held_at: string | null }[];
  awards: { considered: number; awarded: number; not_awarded: number; total_approved_usd: number };
  money: Record<string, number>;
  disbursements: { count: number; total_sent_usd: number; receipts_confirmed: number; reports_in: number };
  outstanding: Outstanding[];
  ready_to_close: boolean;
  blocking_count: number;
}

function usd(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function CycleCloseoutCard({ roundId }: { roundId: number }) {
  const { t } = useTranslation();
  const [d, setD] = useState<Closeout | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get<{ success: boolean } & Closeout>(
          `/api/proximate/rounds/${roundId}/closeout`,
        );
        if (r?.success) setD(r);
      } catch { /* stays empty */ }
      setLoading(false);
    })();
  }, [roundId]);

  if (loading) {
    return (
      <Card className="p-5 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> {t('proximate.cycle.building_closeout') || 'Building the closeout pack…'}
      </Card>
    );
  }
  if (!d) return null;

  const blocks = d.outstanding.filter((o) => o.severity === 'block');
  const warns = d.outstanding.filter((o) => o.severity !== 'block');

  return (
    <div className="space-y-4">
      <Card className={`p-5 ${d.ready_to_close ? 'border-emerald-300' : 'border-amber-300'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {d.ready_to_close
              ? <Check className="w-5 h-5 text-emerald-600 mt-0.5" />
              : <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />}
            <div>
              <h3 className="font-semibold">
                {d.ready_to_close
                  ? (t('proximate.cycle.closeout_ready') || 'Nothing is blocking closeout')
                  : `${d.blocking_count} thing${d.blocking_count === 1 ? '' : 's'} must be finished first`}
              </h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                {d.ready_to_close
                  ? (t('proximate.cycle.closeout_ready_sub')
                     || 'Every partner has been paid, confirmed receipt and reported.')
                  : (t('proximate.cycle.closeout_blocked_sub')
                     || 'A cycle should not be closed while a partner is still owed money or a report.')}
              </p>
            </div>
          </div>
          <Button
            size="sm" variant="outline"
            onClick={() => {
              // Server-rendered so the pack does not depend on which
              // browser produced it, and so Arabic shapes correctly.
              window.location.href =
                `/api/proximate/rounds/${roundId}/closeout.pdf`;
            }}
          >
            <Printer className="w-3.5 h-3.5 mr-1.5" /> {t('proximate.cycle.download_pdf') || 'Download PDF'}
          </Button>
        </div>
      </Card>

      {blocks.length > 0 && (
        <Card className="p-5 space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <CircleAlert className="w-4 h-4 text-red-600" /> {t('proximate.cycle.must_resolve') || 'Must be resolved'}
          </h4>
          <ul className="space-y-1.5">
            {blocks.map((o, i) => (
              <li key={i} className="text-sm flex gap-2">
                <span className="text-red-600">•</span>
                <span>
                  {o.partner && <strong>{o.partner}: </strong>}{o.what}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {warns.length > 0 && (
        <Card className="p-5 space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" /> {t('proximate.cycle.worth_noting') || 'Worth noting'}
          </h4>
          <ul className="space-y-1.5">
            {warns.map((o, i) => (
              <li key={i} className="text-sm flex gap-2">
                <span className="text-amber-600">•</span>
                <span>
                  {o.partner && <strong>{o.partner}: </strong>}{o.what}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-5 space-y-4">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <PackageCheck className="w-4 h-4 text-muted-foreground" /> {t('proximate.cycle.cycle_summary') || 'The cycle in summary'}
        </h4>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <S label={t('proximate.cycle.panel_seated') || 'Panel members seated'} v={String(d.panel.confirmed)} />
          <S label={t('proximate.cycle.localities_represented') || 'Localities represented'} v={String(d.panel.localities.length)} />
          <S label={t('proximate.cycle.meetings_recorded') || 'Meetings recorded'} v={String(d.meetings.length)} />
          <S label={t('proximate.cycle.partners_considered') || 'Partners considered'} v={String(d.awards.considered)} />
          <S label={t('proximate.cycle.awarded') || 'Awarded'} v={String(d.awards.awarded)} />
          <S label={t('proximate.cycle.total_approved') || 'Total approved'} v={usd(d.awards.total_approved_usd)} />
          <S label={t('proximate.cycle.total_sent') || 'Total sent'} v={usd(d.disbursements.total_sent_usd)} />
          <S label={t('proximate.cycle.receipts_confirmed') || 'Receipts confirmed'}
             v={`${d.disbursements.receipts_confirmed} of ${d.disbursements.count}`} />
        </div>

        <div className="pt-3 border-t border-border grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <S label={t('proximate.cycle.envelope') || 'Donor envelope'} v={usd(d.money.envelope_usd)} />
          <S label={t('proximate.cycle.admin_overhead') || 'Administration'} v={usd(d.money.admin_overhead_usd)} />
          <S label={t('proximate.cycle.disbursable') || 'Available for partners'} v={usd(d.money.disbursable_usd)} />
          <S label={t('proximate.cycle.unspent') || 'Unspent'} v={usd(d.money.uncommitted_usd)} />
        </div>

        {d.panel.localities.length > 0 && (
          <p className="text-xs text-muted-foreground pt-2 border-t border-border">
            {(t('proximate.cycle.panel_drawn_from') || 'Panel drawn from: {x}.')
              .replace('{x}', d.panel.localities.join(', '))}
          </p>
        )}
      </Card>
    </div>
  );
}

function S({ label, v }: { label: string; v: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold tabular-nums">{v}</p>
    </div>
  );
}
