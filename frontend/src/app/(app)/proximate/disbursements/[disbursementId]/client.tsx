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
  Loader2, Copy, Check, AlertTriangle, CheckCircle2, ArrowLeft, ShieldCheck, UserCheck,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useAuthStore } from '@/stores/auth-store';
import { useProximatePersona } from '@/lib/hooks/use-proximate-persona';
import { labelForProximateAction } from '@/lib/proximate-audit-labels';
import { labelForProximateStatus } from '@/lib/proximate-status-labels';
import { TONE_CLASSES, toneForProximateStatus } from '@/components/proximate/status-badge';
import { NextStep, disbursementNextStep } from '@/components/proximate/next-step';
import { useOrigin } from '@/components/proximate/token-page-support';
import { ProximateAttachmentsPanel } from '@/components/proximate/dd-evidence';
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
  cosigners_required: number;
  cosigners_count: number;
  cosigners_extra: { user_id: number; cosigned_at: string }[];
  flagged_reason: string | null;
  verifier_user_id?: number | null;
  verifier_assigned_at?: string | null;
  verifier_verdict?: string | null;
  audit: AuditRow[];
  outcome: OutcomeAttestation | null;
}

interface OutcomeAttestation {
  id: number;
  status: string;
  due_at: string | null;
  spawned_at: string | null;
  submitted_at: string | null;
  submitted_via: string | null;
  overdue: boolean;
  report_token: string | null;
  answers: {
    still_in_state_n?: number | null;
    total_intended_n?: number | null;
    sustained?: string | null;
    not_sustained?: string | null;
  };
  voice_doc_id: number | null;
  photo_doc_id: number | null;
  voice_transcript: string | null;
  counterfactual_reflection: string | null;
  verdict_by_user_id: number | null;
  verdict_at: string | null;
  verdict_notes: string | null;
  ack_message: string | null;
  ack_message_at: string | null;
}

export function ProximateDisbursementDetailClient() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  // RBAC fix (2026-07-09): co-signing a release is an OB-only governance
  // action. The backend already 403s non-OB /cosign, but the button must not
  // render for donors/endorsers/platform-admins either.
  const { persona } = useProximatePersona();
  const isOb = persona === 'ob';
  const [id, setId] = useState<number | null>(null);
  // Read the origin from a mount effect, never inline during render. An
  // inline `typeof window` ternary yields '' on the prerender pass, which
  // would bake a domain-less link into a Copy button or a WhatsApp body —
  // and a link without its host is worthless once it has been pasted into
  // a chat thread and sent to someone in the field.
  const origin = useOrigin();
  const [data, setData] = useState<Disbursement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [verifyNote, setVerifyNote] = useState('');
  const [ackText, setAckText] = useState('');
  const [ackSending, setAckSending] = useState(false);
  // Phase 717 — independent verifier assignment (SoP §10).
  const [assigning, setAssigning] = useState(false);
  const [verifierUrl, setVerifierUrl] = useState<string | null>(null);
  const [verifierCopied, setVerifierCopied] = useState(false);

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

  async function assignVerifier() {
    if (!id) return;
    setActionError(null);
    setAssigning(true);
    try {
      const r = await api.post<{ verifier_url?: string; url?: string; verifier_token?: string }>(
        `/api/proximate/disbursements/${id}/assign-verifier`, {},
      );
      const url = r.verifier_url || r.url
        || (r.verifier_token ? `${window.location.origin}/proximate-verify?t=${r.verifier_token}` : null);
      setVerifierUrl(url);
      await fetchData(id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('proximate.disbursement.action_failed');
      setActionError(msg);
    } finally {
      setAssigning(false);
    }
  }

  // Phase 680 — OB outcome verdict + ack actions
  const [outcomeVerdictNote, setOutcomeVerdictNote] = useState('');
  const [outcomeAckText, setOutcomeAckText] = useState('');
  const [outcomeActing, setOutcomeActing] = useState(false);
  async function setOutcomeVerdict(v: 'verified' | 'disputed') {
    if (!data?.outcome) return;
    setActionError(null);
    setOutcomeActing(true);
    try {
      await api.post(
        `/api/proximate/outcome-attestations/${data.outcome.id}/verdict`,
        { verdict: v, notes: outcomeVerdictNote.trim() || undefined },
      );
      if (id) await fetchData(id);
      setOutcomeVerdictNote('');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('proximate.disbursement.action_failed');
      setActionError(msg);
    } finally {
      setOutcomeActing(false);
    }
  }
  async function sendOutcomeAck() {
    if (!data?.outcome || !outcomeAckText.trim()) return;
    setActionError(null);
    setOutcomeActing(true);
    try {
      await api.post(
        `/api/proximate/outcome-attestations/${data.outcome.id}/ack`,
        { message: outcomeAckText.trim() },
      );
      if (id) await fetchData(id);
      setOutcomeAckText('');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('proximate.disbursement.action_failed');
      setActionError(msg);
    } finally {
      setOutcomeActing(false);
    }
  }
  function copyOutcomeUrl() {
    if (!data?.outcome?.report_token) return;
    const url = `${window.location.origin}/proximate-outcome?t=${data.outcome.report_token}`;
    navigator.clipboard?.writeText(url).catch(() => {});
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

  const partnerLink = origin && data.report_token
    ? `${origin}/proximate-report?t=${data.report_token}`
    : '';

  return (
    <PageShell>
      <PageHeader
        title={data.partner_name || `Partner #${data.partner_id}`}
        subtitle={data.purpose || undefined}
        breadcrumbs={[
          { label: 'Proximate', href: '/proximate/admin' },
          { label: 'Disbursements', href: '/proximate/disbursements' },
        ]}
        status={{
          label: labelForProximateStatus(data.status, t),
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

        {/* Phase 717 — one-line "what happens next" guidance. */}
        <NextStep info={disbursementNextStep(data)} />

        {/* Phase 662 + Phase 668 — pending cosign banner with ladder progress */}
        {data.status === 'pending_cosign' && (
          <Card className="p-4 border-violet-300 bg-violet-50 dark:bg-violet-950/30 space-y-3">
            <div className="flex items-start gap-2">
              <ShieldCheck className="w-5 h-5 text-violet-700 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-violet-900 dark:text-violet-200">
                  {t('proximate.disbursement.cosign_required_title')}
                </h3>
                <p className="text-xs text-violet-800 dark:text-violet-300 mt-1">
                  {t('proximate.disbursement.cosign_progress', {
                    have: data.cosigners_count,
                    need: data.cosigners_required,
                  })}
                </p>
              </div>
            </div>
            {actionError && (
              <p className="text-sm text-red-600">{actionError}</p>
            )}
            {!isOb ? (
              <p className="text-xs italic text-muted-foreground">
                {t('proximate.disbursement.cosign_ob_only')}
              </p>
            ) : user?.id === data.sent_by_user_id ? (
              <p className="text-xs italic text-muted-foreground">
                {t('proximate.disbursement.cosign_self_blocked')}
              </p>
            ) : (data.cosigned_by_user_id === user?.id ||
                 data.cosigners_extra.some((e) => e.user_id === user?.id)) ? (
              <p className="text-xs italic text-muted-foreground">
                {t('proximate.disbursement.cosign_already_signed')}
              </p>
            ) : (
              <Button size="sm" onClick={cosign} disabled={acting}>
                {acting ? <Loader2 className="w-4 h-4 me-1 animate-spin" /> : <ShieldCheck className="w-4 h-4 me-1" />}
                {t('proximate.disbursement.cosign_now')}
              </Button>
            )}
          </Card>
        )}

        {/* PRX-OUTCOME-002 — one amber remediation card for EVERY flagged
            report (verdict-flagged included, not just route failures).
            Normal follow-up (outcome link, acknowledgement) is paused
            until the OB re-verdicts the report as verified. */}
        {data.status === 'flagged' && (
          <Card className="p-4 border-amber-300 bg-amber-50 dark:bg-amber-950/30 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  {data.flagged_reason === 'route_failure_security'
                    ? t('proximate.disbursement.planb_title')
                    : t('proximate.disbursement.flagged_title')}
                </h3>
                <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
                  {data.flagged_reason === 'route_failure_security'
                    ? t('proximate.disbursement.planb_body')
                    : t('proximate.disbursement.flagged_body')}
                </p>
                {data.flagged_reason && data.flagged_reason !== 'route_failure_security' && (
                  <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
                    {t('proximate.disbursement.flag_reason')}: {labelForProximateStatus(data.flagged_reason)}
                  </p>
                )}
                {data.flagged_reason === 'route_failure_security' && (
                  <Link
                    href={`/proximate/endorse/${data.partner_id}#routes`}
                    className="inline-flex items-center gap-1 text-xs text-amber-900 dark:text-amber-200 mt-2 hover:underline"
                  >
                    {t('proximate.disbursement.planb_view_routes')} →
                  </Link>
                )}
              </div>
            </div>
            <div>
              <Button size="sm" variant="outline" onClick={() => verdict('verified')} disabled={acting}>
                {acting ? <Loader2 className="w-4 h-4 me-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 me-1" />}
                {t('proximate.disbursement.flagged_resolve')}
              </Button>
              {actionError && <p className="text-sm text-red-600 mt-2">{actionError}</p>}
            </div>
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
            <div className="flex gap-2 flex-wrap">
              <input
                type="text"
                readOnly
                value={partnerLink}
                className="flex-1 min-w-[200px] h-10 px-3 text-xs bg-muted border border-border rounded-md font-mono"
              />
              <Button size="sm" variant="outline" onClick={copyReportUrl}>
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
              {/* Phase 669 — WhatsApp share. Opens the wa.me deep-link with the token URL */}
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `${t('proximate.disbursement.whatsapp_lead')} ${partnerLink}`,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 h-10 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {t('proximate.disbursement.share_via_whatsapp')}
              </a>
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

        {/* Phase 717 — independent third-party verification (SoP §10). The
            assign endpoint picks a random, conflict-free endorser; this was
            previously API-only with no button. */}
        {(data.status === 'reported' || data.status === 'pending_report')
          && data.verifier_verdict !== 'confirmed' && (
          <Card className="p-4 space-y-3">
            <div className="flex items-start gap-2">
              <UserCheck className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-medium">Independent verification</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Assign a random, conflict-free endorser to independently confirm this
                  disbursement reached the community. They cannot be the partner&apos;s own
                  endorser, the sender, a cosigner, or the nominator.
                </p>
              </div>
            </div>
            {data.verifier_user_id && !verifierUrl ? (
              <p className="text-xs italic text-muted-foreground">
                A verifier has been assigned{data.verifier_verdict ? ` (verdict: ${data.verifier_verdict})` : ' — awaiting their attestation'}.
              </p>
            ) : verifierUrl ? (
              <div className="space-y-1.5">
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  Verifier assigned. Share this one-time link with them (out of band):
                </p>
                <div className="flex gap-2 flex-wrap">
                  <input readOnly value={verifierUrl}
                    className="flex-1 min-w-[200px] h-9 px-3 text-xs bg-muted border border-border rounded-md font-mono" />
                  <Button size="sm" variant="outline" onClick={() => {
                    navigator.clipboard?.writeText(verifierUrl).catch(() => {});
                    setVerifierCopied(true); setTimeout(() => setVerifierCopied(false), 1500);
                  }}>
                    {verifierCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={assignVerifier} disabled={assigning}>
                {assigning ? <Loader2 className="w-4 h-4 me-1 animate-spin" /> : <UserCheck className="w-4 h-4 me-1" />}
                Assign independent verifier
              </Button>
            )}
            {actionError && <p className="text-sm text-red-600">{actionError}</p>}
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
            ) : data.status === 'flagged' ? (
              <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded p-3">
                {t('proximate.disbursement.ack_paused')}
              </p>
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

        {/* Payment confirmations — hawala / government payment-app
            receipts filed against this specific transfer. */}
        {isOb && (
          <ProximateAttachmentsPanel
            subjectKind="disbursement"
            subjectId={data.id}
            title={t('proximate.disbursement.payment_confirmations')}
            defaultKind="payment_confirmation"
            emptyText={t('proximate.disbursement.payment_confirmations_empty')}
          />
        )}

        {/* Phase 680 — 90-day outcome attestation */}
        {data.outcome && (
          <Card className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <h3 className="text-sm font-medium">
                  {t('proximate.outcome.card_title')}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {data.outcome.due_at
                    ? t('proximate.outcome.due_at_prefix') +
                      ' ' +
                      new Date(data.outcome.due_at).toLocaleDateString()
                    : ''}
                  {data.outcome.overdue && (
                    <span className="ms-2 text-red-600">
                      {t('proximate.outcome.overdue_badge')}
                    </span>
                  )}
                </p>
              </div>
              <span
                className={`text-xs px-2 py-1 rounded border ${
                  TONE_CLASSES[toneForProximateStatus(data.outcome.status)]
                }`}
              >
                {t(`proximate.outcome.status_${data.outcome.status}`)}
              </span>
            </div>

            {data.outcome.status === 'pending' && data.status === 'flagged' && (
              <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded p-3">
                {t('proximate.disbursement.outcome_paused')}
              </p>
            )}

            {data.outcome.status === 'pending' && data.outcome.report_token && data.status !== 'flagged' && (
              <div className="text-xs space-y-2">
                <p className="text-muted-foreground">
                  {t('proximate.outcome.share_link_hint')}
                </p>
                <div className="flex gap-2 flex-wrap">
                  <code className="flex-1 min-w-[200px] truncate bg-muted px-2 py-1 rounded text-xs">
                    {`${origin ?? ''}/proximate-outcome?t=${data.outcome.report_token}`}
                  </code>
                  <Button size="sm" variant="outline" onClick={copyOutcomeUrl}>
                    {t('proximate.disbursement.copy')}
                  </Button>
                  {/* Phase 698 — WhatsApp share for outcome attestation
                      token (parity with the report-token share row above). */}
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(
                      `${t('proximate.disbursement.whatsapp_lead')} ${origin ?? ''}/proximate-outcome?t=${data.outcome.report_token}`,
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 h-8 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    {t('proximate.disbursement.share_via_whatsapp')}
                  </a>
                </div>
              </div>
            )}

            {data.outcome.submitted_at && (
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">
                    {t('proximate.outcome.q1_still_in_state')}
                  </dt>
                  <dd>
                    {data.outcome.answers.still_in_state_n ?? '—'}
                    {' '}
                    {t('proximate.outcome.q1_of')}{' '}
                    {data.outcome.answers.total_intended_n ?? '—'}
                  </dd>
                </div>
                {data.outcome.answers.sustained && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">
                      {t('proximate.outcome.q2_sustained')}
                    </dt>
                    <dd className="whitespace-pre-wrap text-sm">
                      {data.outcome.answers.sustained}
                    </dd>
                  </div>
                )}
                {data.outcome.answers.not_sustained && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">
                      {t('proximate.outcome.q3_not_sustained')}
                    </dt>
                    <dd className="whitespace-pre-wrap text-sm">
                      {data.outcome.answers.not_sustained}
                    </dd>
                  </div>
                )}
                <div className="sm:col-span-2 text-xs text-muted-foreground">
                  {t('proximate.outcome.submitted_at')}{' '}
                  {new Date(data.outcome.submitted_at).toLocaleString()}
                  {data.outcome.submitted_via && (
                    <span> · {data.outcome.submitted_via}</span>
                  )}
                </div>
              </dl>
            )}

            {data.outcome.status === 'submitted' && (
              <div className="space-y-2 border-t pt-3">
                <h4 className="text-sm font-medium">
                  {t('proximate.outcome.your_verdict')}
                </h4>
                <textarea
                  value={outcomeVerdictNote}
                  onChange={(e) => setOutcomeVerdictNote(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md"
                  placeholder={t('proximate.outcome.verdict_note_placeholder')}
                />
                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    onClick={() => setOutcomeVerdict('verified')}
                    disabled={outcomeActing}
                  >
                    {outcomeActing ? (
                      <Loader2 className="w-4 h-4 me-1 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 me-1" />
                    )}
                    {t('proximate.outcome.verify')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setOutcomeVerdict('disputed')}
                    disabled={outcomeActing}
                  >
                    <AlertTriangle className="w-4 h-4 me-1 text-red-600" />
                    {t('proximate.outcome.dispute')}
                  </Button>
                </div>
              </div>
            )}

            {data.outcome.verdict_notes && (
              <div className="text-xs text-muted-foreground border-t pt-2">
                <span className="font-medium">{t('proximate.outcome.verdict_notes')}: </span>
                {data.outcome.verdict_notes}
              </div>
            )}

            {data.outcome.submitted_at && (
              <div className="border-t pt-3">
                <h4 className="text-sm font-medium mb-2">
                  {t('proximate.outcome.ack_title')}
                </h4>
                {data.outcome.ack_message ? (
                  <div className="text-sm bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded p-3">
                    <p className="whitespace-pre-wrap">{data.outcome.ack_message}</p>
                    {data.outcome.ack_message_at && (
                      <p className="text-xs text-muted-foreground mt-2">
                        {new Date(data.outcome.ack_message_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <textarea
                      value={outcomeAckText}
                      onChange={(e) => setOutcomeAckText(e.target.value)}
                      rows={2}
                      maxLength={2000}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md"
                      placeholder={t('proximate.outcome.ack_placeholder')}
                    />
                    <Button
                      size="sm"
                      className="mt-2"
                      onClick={sendOutcomeAck}
                      disabled={outcomeActing || !outcomeAckText.trim()}
                    >
                      {outcomeActing ? (
                        <Loader2 className="w-4 h-4 me-1 animate-spin" />
                      ) : null}
                      {t('proximate.outcome.ack_send')}
                    </Button>
                  </>
                )}
              </div>
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
                  {/* Phase 705 — human label when known, raw mono
                      code as fallback (so the chain is never silently
                      mis-rendered). Same util as the round detail
                      audit window. Hover shows the action code. */}
                  <span className="font-medium text-foreground" title={row.action}>
                    {labelForProximateAction(row.action, t)}
                  </span>
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
