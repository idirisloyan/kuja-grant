'use client';

/**
 * OB grievance triage queue — Phase 716c (July 2026).
 *
 * Reads /api/proximate/grievances (new + triaged working set). Every
 * row carries the 72-hour SLA clock from the model; the queue renders
 * a countdown badge that goes red once breached. Triage stops the
 * clock; resolve/dismiss closes the row out (notes required).
 *
 * Reporter identity appears here and ONLY here — this is the one
 * OB-side surface allowed to see it, and anonymous rows never carry
 * it at all (cleared server-side at submit time).
 */

import { useEffect, useState } from 'react';
import {
  Loader2, ShieldAlert, CheckCircle2, XCircle,
} from 'lucide-react';
import { EmptyState } from '@/components/proximate/empty-state';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';

interface Grievance {
  id: number;
  partner_id: number | null;
  partner_name: string | null;
  category: string;
  description: string;
  status: string;
  is_anonymous: boolean;
  reporter_name?: string | null;
  reporter_phone?: string | null;
  submitted_at: string | null;
  remaining_seconds: number;
  is_sla_breached: boolean;
  intervention_id: number | null;
}

const CATEGORY_PILL: Record<string, string> = {
  fraud: 'danger', safety: 'warn', other: 'slate',
};

function slaLabel(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export function ProximateGrievanceQueueClient() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Grievance[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<{ grievances: Grievance[] }>(
        '/api/proximate/grievances',
      );
      setRows(r.grievances || []);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t('proximate.grievance_queue.load_failed'),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const triage = async (id: number) => {
    setBusyId(id);
    try {
      await api.post(`/api/proximate/grievances/${id}/triage`, {});
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t('proximate.grievance_queue.action_failed'),
      );
    } finally {
      setBusyId(null);
    }
  };

  const resolve = async (id: number, dismissed: boolean) => {
    if (!notes.trim()) {
      setError(t('proximate.grievance_queue.notes_required'));
      return;
    }
    setBusyId(id);
    try {
      await api.post(`/api/proximate/grievances/${id}/resolve`, {
        notes: notes.trim(),
        dismissed,
      });
      setResolvingId(null);
      setNotes('');
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t('proximate.grievance_queue.action_failed'),
      );
    } finally {
      setBusyId(null);
    }
  };

  const newCount = (rows || []).filter((r) => r.status === 'new').length;
  const breachedCount = (rows || []).filter((r) => r.is_sla_breached).length;

  return (
    <PageShell>
      <PageHeader
        title={t('proximate.grievance_queue.title')}
        subtitle={t('proximate.grievance_queue.subtitle')}
      />
      <PageMain>
        <div className="space-y-4 max-w-3xl">
          <div className="flex gap-2 text-sm">
            <span className="prox-pill acc">{newCount} {t('proximate.grievance_queue.new_count')}</span>
            {breachedCount > 0 && (
              <span className="prox-pill danger">{breachedCount} {t('proximate.grievance_queue.breached_count')}</span>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (rows || []).length === 0 ? (
            <Card>
              <EmptyState compact icon={CheckCircle2} title={t('proximate.grievance_queue.empty')} />
            </Card>
          ) : (
            (rows || []).map((g) => (
              <div key={g.id} className="prox-panel space-y-3" style={{ padding: '16px 18px' }}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`prox-pill ${CATEGORY_PILL[g.category] || 'slate'}`}>
                      {(() => {
                        const k = `proximate.grievance_category.${g.category}`;
                        const v = t(k);
                        return v && v !== k ? v : g.category;
                      })()}
                    </span>
                    <span style={{ fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif', fontSize: 14, fontWeight: 700 }}>
                      {g.partner_name || t('proximate.grievance_queue.about_fund')}
                    </span>
                    {g.intervention_id && (
                      <span className="prox-pill acc">
                        {t('proximate.grievance_queue.auto_intervention')}
                      </span>
                    )}
                  </div>
                  {g.status === 'new' && (
                    <span className={`prox-pill ${g.is_sla_breached ? 'danger' : 'good'}`}>
                      {g.is_sla_breached
                        ? t('proximate.grievance_queue.sla_breached')
                        : `${slaLabel(g.remaining_seconds)} ${t('proximate.grievance_queue.sla_remaining')}`}
                    </span>
                  )}
                </div>

                <p className="text-sm whitespace-pre-wrap" dir="auto">{g.description}</p>

                <p className="text-xs text-muted-foreground">
                  {g.submitted_at && new Date(g.submitted_at).toLocaleString()}
                  {' · '}
                  {g.is_anonymous
                    ? t('proximate.grievance_queue.anonymous')
                    : [g.reporter_name, g.reporter_phone].filter(Boolean).join(' · ')
                      || t('proximate.grievance_queue.anonymous')}
                </p>

                <div className="flex gap-2 flex-wrap items-center border-t pt-3">
                  {g.status === 'new' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === g.id}
                      onClick={() => triage(g.id)}
                    >
                      {busyId === g.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <ShieldAlert className="w-4 h-4 me-1" />}
                      {t('proximate.grievance_queue.triage')}
                    </Button>
                  )}
                  {resolvingId === g.id ? (
                    <div className="flex-1 min-w-full space-y-2">
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={2}
                        dir="auto"
                        className="w-full border rounded p-2 text-sm bg-background"
                        placeholder={t('proximate.grievance_queue.notes_placeholder')}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" disabled={busyId === g.id} onClick={() => resolve(g.id, false)}>
                          <CheckCircle2 className="w-4 h-4 me-1" />
                          {t('proximate.grievance_queue.resolve')}
                        </Button>
                        <Button size="sm" variant="outline" disabled={busyId === g.id} onClick={() => resolve(g.id, true)}>
                          <XCircle className="w-4 h-4 me-1" />
                          {t('proximate.grievance_queue.dismiss')}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setResolvingId(null); setNotes(''); }}>
                          ✕
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setResolvingId(g.id); setNotes(''); }}
                    >
                      {t('proximate.grievance_queue.resolve')}…
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </PageMain>
    </PageShell>
  );
}
