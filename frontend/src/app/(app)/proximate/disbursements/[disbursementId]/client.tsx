'use client';

/**
 * Disbursement detail — Phase 654 (June 2026).
 *
 * Static-export-safe: reads the disbursement id from window.location
 * at runtime (sentinel '0' in generateStaticParams). Surfaces the
 * report payload if submitted, the partner-link if still pending,
 * and OB Verify / Flag actions when there is a report to act on.
 * Audit-chain rows scoped to this disbursement are listed at the
 * bottom for the lifecycle trail.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Loader2, Copy, Check, AlertTriangle, CheckCircle2, ArrowLeft, ShieldCheck,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useAuthStore } from '@/stores/auth-store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';

interface ReportPayload {
  activity_happened?: boolean;
  people_helped?: number | null;
  issues?: string | null;
  spend_summary?: string | null;
  submitted_at?: string | null;
  source?: string | null;
}

interface AuditRow {
  seq: number;
  action: string;
  actor_email: string | null;
  created_at: string | null;
  details: Record<string, unknown>;
}

interface Disbursement {
  id: number;
  partner_id: number;
  partner_name: string | null;
  amount_usd: number | null;
  purpose: string | null;
  sent_at: string | null;
  sent_by_user_id: number | null;
  status: string;
  report_due_at: string | null;
  report_submitted_at: string | null;
  overdue: boolean;
  report_token: string | null;
  has_report: boolean;
  report: ReportPayload | null;
  report_voice_doc_id: number | null;
  report_photo_doc_id: number | null;
  report_voice_transcript: string | null;
  ack_message: string | null;
  ack_message_at: string | null;
  cosigned_by_user_id: number | null;
  cosigned_at: string | null;
  cosign_threshold_usd: number;
  audit: AuditRow[];
}

const STATUS_TONE: Record<string, string> = {
  pending_cosign: 'bg-violet-100 text-violet-800 border-violet-300',
  pending_report: 'bg-amber-100 text-amber-800 border-amber-300',
  reported: 'bg-blue-100 text-blue-800 border-blue-300',
  verified: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  flagged: 'bg-red-100 text-red-800 border-red-300',
};

export function ProximateDisbursementDetailClient() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [id, setId] = useState<number | null>(null);
  const [data, setData] = useState<Disbursement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [verifyNote, setVerifyNote] = useState('');
  const [ackText, setAckText] = useState('');
  const [ackSending, setAckSending] = useState(false);

  const fetchData = useCallback(async (idNum: number) => {
    try {
      const r = await api.get<{ disbursement: Disbursement }>(
        `/api/proximate/disbursements/${idNum}`
      );
      setData(r.disbursement);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('proximate.disbursement.load_failed');
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const m = window.location.pathname.match(/\/proximate\/disbursements\/(\d+)/);
    const idNum = m ? parseInt(m[1], 10) : NaN;
    if (!idNum || Number.isNaN(idNum)) {
      setError(t('proximate.disbursement.bad_url'));
      setLoading(false);
      return;
    }
    setId(idNum);
    fetchData(idNum);
  }, [fetchData, t]);

  async function cosign() {
    if (!id) return;
    setActionError(null);
    setActing(true);
    try {
      await api.post(`/api/proximate/disbursements/${id}/cosign`, {});
      await fetchData(id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('proximate.disbursement.action_failed');
      setActionError(msg);
    } finally {
      setActing(false);
    }
  }

  async function sendAck() {
    if (!id || !ackText.trim()) return;
    setAckSending(true);
    setActionError(null);
    try {
      await api.post(`/api/proximate/disbursements/${id}/acknowledge`, {
        message: ackText.trim(),
      });
      await fetchData(id);
      setAckText('');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('proximate.disbursement.action_failed');
      setActionError(msg);
    } finally {
      setAckSending(false);
    }
  }

  async function verdict(v: 'verified' | 'flagged') {
    if (!id) return;
    setActionError(null);
    setActing(true);
    try {
      await api.post(`/api/proximate/disbursements/${id}/verify`, {
        verdict: v,
        note: verifyNote.trim() || undefined,
      });
      await fetchData(id);
      setVerifyNote('');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('proximate.disbursement.action_failed');
      setActionError(msg);
    } finally {
      setActing(false);
    }
  }

  function copyReportUrl() {
    if (!data?.report_token) return;
    const url = `${window.location.origin}/proximate-report?t=${data.report_token}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (loading) {
    return (
      <PageShell>
        <PageMain>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            {t('proximate.disbursement.loading')}
          </p>
        </PageMain>
      </PageShell>
    );
  }

  if (error || !data) {
    return (
      <PageShell>
        <PageMain>
          <Card className="p-6 text-center">
            <p className="text-sm text-red-600">{error || t('proximate.disbursement.load_failed')}</p>
            <Link href="/proximate/disbursements">
              <Button variant="outline" size="sm" className="mt-3">
                <ArrowLeft className="w-3.5 h-3.5 me-1" />
                {t('proximate.disbursements.back_to_list')}
              </Button>
            </Link>
          </Card>
        </PageMain>
      </PageShell>
    );
  }

  const partnerLink = data.report_token
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/proximate-report?t=${data.report_token}`
    : '';

  return (
    <PageShell>
      <PageHeader
        title={data.partner_name || `Partner #${data.partner_id}`}
        subtitle={data.purpose || undefined}
        status={{
          label: data.status,
          tone: data.status === 'verified'
            ? 'good'
            : data.status === 'flagged'
              ? 'bad'
              : data.status === 'pending_report' && data.overdue
                ? 'bad'
                : data.status === 'reported'
                  ? 'info'
                  : 'warn',
        }}
      />
      <PageMain>
        {/* Top-line meta */}
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {data.amount_usd && (
              <span className="font-semibold text-foreground">
                ${data.amount_usd.toLocaleString()}
              </span>
            )}
            {data.sent_at && (
              <span>· {t('proximate.disbursement.sent')} {new Date(data.sent_at).toLocaleDateString()}</span>
            )}
            {data.report_due_at && (
              <span>· {t('proximate.disbursement.due')} {new Date(data.report_due_at).toLocaleDateString()}</span>
            )}
            {data.overdue && (
              <Badge variant="outline" className="text-[10px] bg-red-100 text-red-800 border-red-300">
                {t('proximate.disbursements.overdue')}
              </Badge>
            )}
          </div>
        </Card>

        {/* Phase 662 — pending cosign banner: $10k+ disbursement awaiting second OB signer */}
        {data.status === 'pending_cosign' && (
          <Card className="p-4 border-violet-300 bg-violet-50 dark:bg-violet-950/30 space-y-3">
            <div className="flex items-start gap-2">
              <ShieldCheck className="w-5 h-5 text-violet-700 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-violet-900 dark:text-violet-200">
                  {t('proximate.disbursement.cosign_required_title')}
                </h3>
                <p className="text-xs text-violet-800 dark:text-violet-300 mt-1">
                  {t('proximate.disbursement.cosign_required_body', {
                    amount: `$${data.cosign_threshold_usd.toLocaleString()}`,
                  })}
                </p>
              </div>
            </div>
            {actionError && (
              <p className="text-sm text-red-600">{actionError}</p>
            )}
            {user?.id === data.sent_by_user_id ? (
              <p className="text-xs italic text-muted-foreground">
                {t('proximate.disbursement.cosign_self_blocked')}
              </p>
            ) : (
              <Button size="sm" onClick={cosign} disabled={acting}>
                {acting ? <Loader2 className="w-4 h-4 me-1 animate-spin" /> : <ShieldCheck className="w-4 h-4 me-1" />}
                {t('proximate.disbursement.cosign_now')}
              </Button>
            )}
          </Card>
        )}

        {/* Pending state — surface the partner link */}
        {data.status === 'pending_report' && data.report_token && (
          <Card className="p-4 space-y-3">
            <div>
              <h3 className="text-sm font-medium mb-1">
                {t('proximate.disbursement.awaiting_report')}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t('proximate.disbursement.awaiting_hint')}
              </p>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={partnerLink}
                className="flex-1 h-10 px-3 text-xs bg-muted border border-border rounded-md font-mono"
              />
              <Button size="sm" variant="outline" onClick={copyReportUrl}>
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </Card>
        )}

        {/* Submitted state — show the report payload */}
        {data.report && (
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">
                {t('proximate.disbursement.report_received')}
              </h3>
              {data.report.source && (
                <Badge variant="outline" className="text-[10px]">
                  {t('proximate.disbursement.via')} {data.report.source}
                </Badge>
              )}
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">
                  {t('proximate.report.q1_happened')}
                </dt>
                <dd className="font-medium">
                  {data.report.activity_happened ? t('proximate.report.yes') : t('proximate.report.no')}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  {t('proximate.report.q2_people_helped')}
                </dt>
                <dd className="font-medium">
                  {data.report.people_helped ?? '—'}
                </dd>
              </div>
              {data.report.issues && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">
                    {t('proximate.report.q3_issues')}
                  </dt>
                  <dd className="whitespace-pre-wrap">{data.report.issues}</dd>
                </div>
              )}
              {data.report.spend_summary && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">
                    {t('proximate.report.q5_spend')}
                  </dt>
                  <dd className="whitespace-pre-wrap">{data.report.spend_summary}</dd>
                </div>
              )}
              {data.report_photo_doc_id && id && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground mb-1.5">
                    {t('proximate.disbursement.photo_evidence')}
                  </dt>
                  <dd>
                    <a
                      href={`/api/proximate/disbursements/${id}/attachment/photo`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/proximate/disbursements/${id}/attachment/photo`}
                        alt={t('proximate.disbursement.photo_evidence')}
                        className="max-w-full sm:max-w-sm h-auto rounded-md border border-border"
                      />
                    </a>
                  </dd>
                </div>
              )}
              {data.report_voice_doc_id && id && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground mb-1.5">
                    {t('proximate.disbursement.voice_evidence')}
                  </dt>
                  <dd>
                    <audio
                      controls
                      preload="metadata"
                      className="w-full max-w-md"
                      src={`/api/proximate/disbursements/${id}/attachment/voice`}
                    />
                  </dd>
                </div>
              )}
              {data.report_voice_transcript && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">
                    {t('proximate.disbursement.voice_transcript')}
                  </dt>
                  <dd className="whitespace-pre-wrap text-xs italic">{data.report_voice_transcript}</dd>
                </div>
              )}
              {data.report.submitted_at && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">
                    {t('proximate.disbursement.submitted_at')}
                  </dt>
                  <dd className="text-xs">{new Date(data.report.submitted_at).toLocaleString()}</dd>
                </div>
              )}
            </dl>
          </Card>
        )}

        {/* OB verdict action — only when reported (not yet verified or flagged) */}
        {data.status === 'reported' && (
          <Card className="p-4 space-y-3">
            <h3 className="text-sm font-medium">
              {t('proximate.disbursement.your_verdict')}
            </h3>
            <textarea
              value={verifyNote}
              onChange={(e) => setVerifyNote(e.target.value)}
              rows={3}
              maxLength={2000}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md"
              placeholder={t('proximate.disbursement.verdict_note_placeholder')}
            />
            {actionError && (
              <p className="text-sm text-red-600">{actionError}</p>
            )}
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                onClick={() => verdict('verified')}
                disabled={acting}
              >
                {acting ? <Loader2 className="w-4 h-4 me-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 me-1" />}
                {t('proximate.disbursement.verify')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => verdict('flagged')}
                disabled={acting}
              >
                <AlertTriangle className="w-4 h-4 me-1 text-red-600" />
                {t('proximate.disbursement.flag')}
              </Button>
            </div>
          </Card>
        )}

        {/* Phase 660 — Acknowledge to partner */}
        {(data.status === 'reported' || data.status === 'verified' || data.status === 'flagged') && (
          <Card className="p-4 space-y-3">
            <h3 className="text-sm font-medium">
              {t('proximate.disbursement.ack_title')}
            </h3>
            {data.ack_message ? (
              <div className="text-sm bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded p-3">
                <p className="whitespace-pre-wrap">{data.ack_message}</p>
                {data.ack_message_at && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {t('proximate.disbursement.ack_sent_at')} {new Date(data.ack_message_at).toLocaleString()}
                  </p>
                )}
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  {t('proximate.disbursement.ack_hint')}
                </p>
                <textarea
                  value={ackText}
                  onChange={(e) => setAckText(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md"
                  placeholder={t('proximate.disbursement.ack_placeholder')}
                />
                <Button size="sm" onClick={sendAck} disabled={ackSending || !ackText.trim()}>
                  {ackSending ? <Loader2 className="w-4 h-4 me-1 animate-spin" /> : null}
                  {t('proximate.disbursement.ack_send')}
                </Button>
              </>
            )}
          </Card>
        )}

        {/* Audit trail */}
        <Card className="p-4">
          <h3 className="text-sm font-medium mb-3">
            {t('proximate.disbursement.audit_trail')}
          </h3>
          {data.audit.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t('proximate.disbursement.no_audit')}
            </p>
          ) : (
            <ul className="space-y-2">
              {data.audit.map((row) => (
                <li key={row.seq} className="text-xs text-muted-foreground flex gap-3 flex-wrap">
                  {row.created_at && (
                    <span className="font-mono">
                      {new Date(row.created_at).toLocaleString()}
                    </span>
                  )}
                  <span className="font-medium text-foreground">{row.action}</span>
                  {row.actor_email && <span>· {row.actor_email}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div>
          <Link href="/proximate/disbursements">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-3.5 h-3.5 me-1" />
              {t('proximate.disbursements.back_to_list')}
            </Button>
          </Link>
        </div>
      </PageMain>
    </PageShell>
  );
}
