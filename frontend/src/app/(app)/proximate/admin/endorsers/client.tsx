'use client';

/**
 * Endorser approval queue — Phase 646 (June 2026).
 *
 * Pure secretariat-side surface. Reads /api/proximate/admin/endorsers/
 * pending and renders each row with the COI self-disclosure fields
 * (village_name, family_name, employer) the OB needs to judge whether
 * the endorser will trigger the COI auto-checker against the partners
 * they'll endorse. Approve is one click; reject demands a reason
 * (required at the route layer too — short-circuit if empty).
 *
 * Audit-chain rows the actions emit are visible on the operator
 * dashboard's "Recent activity" feed, so the OB can confirm their
 * decision landed.
 */

import { useEffect, useState } from 'react';
import { Loader2, Check, X, Mail, MapPin } from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/proximate/empty-state';
import { TONE_CLASSES } from '@/components/proximate/status-badge';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';

interface Endorser {
  id: number;
  user_id: number;
  user_name?: string | null;
  locality: string | null;
  country: string;
  status: string;
  registered_at: string | null;
  village_name?: string | null;
  family_name?: string | null;
  employer?: string | null;
  sanctions_flag?: boolean;
}

export function ProximateEndorserQueueClient() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Endorser[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  // Redesign Stage 3c — approvals need an explicit confirm step
  // (reject already has one via the reason panel) and a visible
  // success note once the record leaves the queue.
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<{ endorsers: Endorser[] }>(
        '/api/proximate/admin/endorsers/pending',
      );
      setRows(r.endorsers || []);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t('proximate.endorser_queue.load_failed'),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const approve = async (id: number, name: string) => {
    setBusyId(id);
    try {
      await api.post(`/api/proximate/admin/endorsers/${id}/approve`);
      setConfirmingId(null);
      setNotice(`${t('proximate.endorser_queue.approved_note')} — ${name}`);
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t('proximate.endorser_queue.action_failed'),
      );
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id: number, name: string) => {
    if (!reason.trim()) {
      setError(t('proximate.endorser_queue.reason_required'));
      return;
    }
    setBusyId(id);
    try {
      await api.post(`/api/proximate/admin/endorsers/${id}/reject`, {
        reason: reason.trim(),
      });
      setRejectingId(null);
      setReason('');
      setNotice(`${t('proximate.endorser_queue.rejected_note')} — ${name}`);
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t('proximate.endorser_queue.action_failed'),
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <PageShell>
      <PageHeader
        title={t('proximate.endorser_queue.title')}
        subtitle={t('proximate.endorser_queue.subtitle')}
      />
      <PageMain>
        {loading && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            {t('proximate.endorser_queue.loading')}
          </p>
        )}
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
        {notice && (
          <div className={`text-xs rounded-md border px-3 py-2 ${TONE_CLASSES.positive}`}>
            {notice}
          </div>
        )}
        {rows !== null && rows.length === 0 && !loading && (
          <Card>
            <EmptyState
              compact
              title={t('proximate.endorser_queue.empty_title')}
              hint={t('proximate.endorser_queue.empty_body')}
            />
          </Card>
        )}
        {rows !== null && rows.length > 0 && (
          <ul className="space-y-3">
            {rows.map((e) => (
              <li key={e.id}>
                <Card className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">
                          {e.user_name || `${t('proximate.endorser_queue.endorser')} #${e.id}`}
                        </p>
                        <Badge variant="outline" className={`text-[10px] ${TONE_CLASSES.attention}`}>
                          {t('proximate.endorser_queue.pending_badge')}
                        </Badge>
                        {e.sanctions_flag && (
                          <Badge variant="outline" className={`text-[10px] ${TONE_CLASSES.critical}`}>
                            {t('proximate.partners.sanctions_flag_badge')}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {t('proximate.endorser_queue.user')} #{e.user_id}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {e.locality || '?'} · {e.country}
                        </span>
                        <span>
                          {e.registered_at
                            ? new Date(e.registered_at).toLocaleDateString()
                            : ''}
                        </span>
                      </div>
                      <dl className="text-xs pt-2 grid grid-cols-1 sm:grid-cols-3 gap-x-3 gap-y-1">
                        <div>
                          <dt className="text-muted-foreground inline">
                            {t('proximate.endorser_queue.village')}:{' '}
                          </dt>
                          <dd className="inline">{e.village_name || '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground inline">
                            {t('proximate.endorser_queue.family')}:{' '}
                          </dt>
                          <dd className="inline">{e.family_name || '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground inline">
                            {t('proximate.endorser_queue.employer')}:{' '}
                          </dt>
                          <dd className="inline">{e.employer || '—'}</dd>
                        </div>
                      </dl>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => {
                          setConfirmingId(e.id);
                          setRejectingId(null);
                          setError(null);
                        }}
                        disabled={busyId === e.id}
                      >
                        <Check className="w-3.5 h-3.5 me-1" />
                        {t('proximate.endorser_queue.approve')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRejectingId(e.id);
                          setConfirmingId(null);
                          setReason('');
                          setError(null);
                        }}
                        disabled={busyId === e.id}
                      >
                        <X className="w-3.5 h-3.5 me-1" />
                        {t('proximate.endorser_queue.reject')}
                      </Button>
                    </div>
                  </div>
                  {confirmingId === e.id && (
                    <div className="mt-3 pt-3 border-t flex items-center gap-2 flex-wrap">
                      <p className="text-xs text-muted-foreground flex-1 min-w-[200px]">
                        {t('proximate.endorser_queue.confirm_approve_body')}
                      </p>
                      <Button
                        size="sm"
                        onClick={() => approve(e.id, e.user_name || `#${e.id}`)}
                        disabled={busyId === e.id}
                      >
                        {busyId === e.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin me-1" />
                        ) : (
                          <Check className="w-3.5 h-3.5 me-1" />
                        )}
                        {t('proximate.endorser_queue.confirm_approve')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmingId(null)}
                      >
                        {t('proximate.endorser_queue.cancel')}
                      </Button>
                    </div>
                  )}
                  {rejectingId === e.id && (
                    <div className="mt-3 pt-3 border-t space-y-2">
                      <label className="text-xs text-muted-foreground block">
                        {t('proximate.endorser_queue.reason_label')}
                      </label>
                      <textarea
                        className="w-full text-sm rounded-md border bg-background p-2 min-h-[64px]"
                        value={reason}
                        onChange={(ev) => setReason(ev.target.value)}
                        placeholder={t('proximate.endorser_queue.reason_placeholder')}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => reject(e.id, e.user_name || `#${e.id}`)}
                          disabled={busyId === e.id || !reason.trim()}
                        >
                          {t('proximate.endorser_queue.confirm_reject')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setRejectingId(null);
                            setReason('');
                            setError(null);
                          }}
                        >
                          {t('proximate.endorser_queue.cancel')}
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </PageMain>
    </PageShell>
  );
}
