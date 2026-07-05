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
  Loader2, ShieldAlert, Clock, CheckCircle2, XCircle, Snowflake,
} from 'lucide-react';
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

const CATEGORY_TONE: Record<string, string> = {
  fraud: 'bg-red-100 text-red-800 border-red-300',
  safety: 'bg-amber-100 text-amber-800 border-amber-300',
  other: 'bg-muted text-muted-foreground border-border',
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
          <div className="flex gap-3 text-sm">
            <span className="px-2.5 py-1 rounded border bg-blue-50 text-blue-800 border-blue-200">
              {newCount} {t('proximate.grievance_queue.new_count')}
            </span>
            {breachedCount > 0 && (
              <span className="px-2.5 py-1 rounded border bg-red-50 text-red-800 border-red-200">
                {breachedCount} {t('proximate.grievance_queue.breached_count')}
              </span>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (rows || []).length === 0 ? (
            <Card className="p-8 text-sm text-center text-muted-foreground">
              {t('proximate.grievance_queue.empty')}
            </Card>
          ) : (
            (rows || []).map((g) => (
              <Card key={g.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-xs px-2 py-0.5 rounded border ${
                        CATEGORY_TONE[g.category] || CATEGORY_TONE.other
                      }`}
                    >
                      {g.category}
                    </span>
                    <span className="text-sm font-medium">
                      {g.partner_name || t('proximate.grievance_queue.about_fund')}
                    </span>
                    {g.intervention_id && (
                      <span className="text-xs px-2 py-0.5 rounded border bg-sky-50 text-sky-800 border-sky-200 inline-flex items-center gap-1">
                        <Snowflake className="w-3 h-3" />
                        {t('proximate.grievance_queue.auto_intervention')}
                      </span>
                    )}
                  </div>
                  {g.status === 'new' && (
                    <span
                      className={`text-xs px-2 py-1 rounded border inline-flex items-center gap-1 ${
                        g.is_sla_breached
                          ? 'bg-red-100 text-red-800 border-red-300'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      }`}
                    >
                      <Clock className="w-3 h-3" />
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
              </Card>
            ))
          )}
        </div>
      </PageMain>
    </PageShell>
  );
}
