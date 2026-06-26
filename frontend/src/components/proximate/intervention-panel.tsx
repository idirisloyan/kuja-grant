'use client';

/**
 * Proximate intervention register panel — Phase 638.
 *
 * Shows on the partner-detail wizard for OB users. Lists every open
 * intervention against this partner with a live countdown to
 * response_due_at, the kind badge, and (for OB) a "Withdraw" button.
 *
 * The "Open new intervention" form lives at the top — kind dropdown
 * (warning/freeze/suspend) + reason textarea + Submit. POSTs to
 * /api/proximate/interventions.
 *
 * Countdown polls a re-render every 30s. Server-side authority
 * is response_due_at; this is purely display math.
 */

import { useEffect, useState } from 'react';
import { AlertOctagon, Clock, X, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Intervention {
  id: number;
  partner_id: number;
  kind: 'warning' | 'freeze' | 'suspend';
  sop_clause: string;
  reason: string;
  status: 'open' | 'responded' | 'escalated' | 'withdrawn' | 'closed';
  opened_at: string;
  response_due_at: string;
  response_window_hours: number;
  responded_at: string | null;
  response_notes: string | null;
  escalated_at: string | null;
  closed_at: string | null;
  elapsed_seconds: number;
  remaining_seconds: number;
  is_expired: boolean;
}

interface ListResp {
  success: boolean;
  interventions: Intervention[];
  total: number;
}

function formatRemaining(targetIso: string): string {
  const target = new Date(targetIso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((target - now) / 1000));
  if (diffSec === 0) return '00:00:00';
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  const s = diffSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function InterventionPanel({
  partnerId,
  canOpen,
  canWithdraw,
}: {
  partnerId: number;
  canOpen: boolean;
  canWithdraw: boolean;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Intervention[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [, forceTick] = useState(0); // 30s repaint for countdown
  const [openForm, setOpenForm] = useState(false);
  const [kind, setKind] = useState<'warning' | 'freeze' | 'suspend'>('warning');
  const [reason, setReason] = useState('');

  const reload = async () => {
    try {
      const r = await api.get<ListResp>(`/api/proximate/interventions?partner_id=${partnerId}`);
      setItems(r.interventions || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // Countdown repaint every 30 seconds. We don't refetch — the
    // server is the authority for response_due_at, and that's
    // immutable per intervention. The displayed remaining time
    // is just (response_due_at - now), so a re-render is enough.
    const tick = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(tick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId]);

  const openInterventions = items.filter(
    (i) => i.status === 'open' || i.status === 'escalated',
  );

  const handleOpen = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.post('/api/proximate/interventions', {
        partner_id: partnerId,
        kind,
        reason: reason.trim(),
      });
      setReason('');
      setOpenForm(false);
      setMessage(t('proximate.intervention.opened_ok'));
      await reload();
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : t('proximate.admin.action_failed'));
    } finally {
      setBusy(false);
    }
  };

  const handleWithdraw = async (id: number) => {
    setBusy(true);
    setMessage(null);
    try {
      await api.post(`/api/proximate/interventions/${id}/withdraw`, {});
      setMessage(t('proximate.intervention.withdrawn_ok'));
      await reload();
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : t('proximate.admin.action_failed'));
    } finally {
      setBusy(false);
    }
  };

  if (loading && items.length === 0) return null;
  if (!loading && openInterventions.length === 0 && !canOpen) return null;

  return (
    <Card className="p-4 border-amber-300 bg-amber-50/40 dark:bg-amber-950/20">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-2">
          <AlertOctagon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-medium">{t('proximate.intervention.title')}</h2>
            <p className="text-xs text-muted-foreground">
              {openInterventions.length === 0
                ? t('proximate.intervention.none_open')
                : t(
                  openInterventions.length === 1
                    ? 'proximate.intervention.count_open_one'
                    : 'proximate.intervention.count_open_other',
                  { n: openInterventions.length },
                )}
            </p>
          </div>
        </div>
        {canOpen && !openForm && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setOpenForm(true)}
            disabled={busy}
          >
            {t('proximate.intervention.open_button')}
          </Button>
        )}
      </div>

      {message && (
        <p className="text-xs mb-3 text-foreground bg-background border border-border rounded p-2">
          {message}
        </p>
      )}

      {openForm && canOpen && (
        <div className="mb-4 space-y-2 p-3 bg-background border border-border rounded">
          <div>
            <label htmlFor="intervention-kind" className="text-xs font-medium block mb-1">
              {t('proximate.intervention.kind_label')}
            </label>
            <select
              id="intervention-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as 'warning' | 'freeze' | 'suspend')}
              className="w-full text-sm rounded border border-border bg-background p-2"
            >
              <option value="warning">{t('proximate.intervention.kind.warning')}</option>
              <option value="freeze">{t('proximate.intervention.kind.freeze')}</option>
              <option value="suspend">{t('proximate.intervention.kind.suspend')}</option>
            </select>
          </div>
          <div>
            <label htmlFor="intervention-reason" className="text-xs font-medium block mb-1">
              {t('proximate.intervention.reason_label')}
            </label>
            <textarea
              id="intervention-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('proximate.intervention.reason_placeholder')}
              rows={3}
              className="w-full text-sm rounded border border-border bg-background p-2"
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleOpen}
              disabled={busy || !reason.trim()}
              className="flex-1"
            >
              {busy && <Loader2 className="w-3 h-3 animate-spin me-2" />}
              {t('proximate.intervention.confirm_open')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => { setOpenForm(false); setReason(''); }}
              disabled={busy}
            >
              {t('proximate.admin.cancel')}
            </Button>
          </div>
        </div>
      )}

      {openInterventions.length > 0 && (
        <ul className="space-y-2">
          {openInterventions.map((iv) => {
            const isEscalated = iv.status === 'escalated';
            return (
              <li
                key={iv.id}
                className={
                  'border rounded p-3 '
                  + (isEscalated
                    ? 'border-destructive bg-destructive/5'
                    : 'border-border bg-background')
                }
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={isEscalated ? 'destructive' : 'outline'} className="text-[10px]">
                      {t(`proximate.intervention.kind.${iv.kind}`)}
                    </Badge>
                    {isEscalated && (
                      <Badge variant="destructive" className="text-[10px]">
                        {t('proximate.intervention.escalated')}
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {iv.sop_clause}
                    </span>
                  </div>
                  {!isEscalated && (
                    <span className="text-xs tabular-nums inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatRemaining(iv.response_due_at)}
                    </span>
                  )}
                </div>
                <p className="text-sm">{iv.reason}</p>
                {canWithdraw && (
                  <div className="mt-2 flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => handleWithdraw(iv.id)}
                      disabled={busy}
                      className="h-7 text-xs"
                    >
                      <X className="w-3 h-3 me-1" />
                      {t('proximate.intervention.withdraw')}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
