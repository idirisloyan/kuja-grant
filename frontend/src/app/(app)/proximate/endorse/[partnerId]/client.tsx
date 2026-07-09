'use client';

/**
 * Proximate endorsement wizard — Phase 629 (Screen 2 of the wireframe).
 *
 * One partner, three Y/N questions, optional voice note per question,
 * submit. Server-side COI auto-check populates signals on the response;
 * if flagged, we show the user a transparent "your endorsement was
 * recorded but won't count for the trust-floor" callout — per the
 * design doc's audit-vs-count separation.
 *
 * Status callout on Screen 3 is rendered if the response includes
 * `state_change === 'dd_clear'` — the partner is now Tier-1 cleared
 * because of this endorsement.
 *
 * Uses apiOffline.post so a submission queued under no-signal will
 * sync when the PWA reconnects. The Proximate team works in Sudan;
 * this is load-bearing.
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Loader2, Check, X, AlertTriangle, CheckCircle2,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { apiOffline, api, isQueuedResponse } from '@/lib/api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useAuthStore } from '@/stores/auth-store';
import { useProximatePersona } from '@/lib/hooks/use-proximate-persona';
import { InterventionPanel } from '@/components/proximate/intervention-panel';
import { VoiceQuestionInput } from '@/components/proximate/voice-question-input';
import { EndorsementsPanel } from '@/components/proximate/endorsements-panel';
import { DisbursementMethodsPanel } from '@/components/proximate/disbursement-methods-panel';
import { PartnerJourney, NextStep } from '@/components/proximate/next-step';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';

interface TrustFloor {
  endorsements_independent_count: number;
  endorsements_required: number;
  endorsements_ok: boolean;
  bank_verified: boolean;
  endorsers_meet_reputation_floor: boolean;
  reputation_floor: number;
  ready_for_dd_clear: boolean;
}

interface SanctionsHit {
  check_type?: string;
  reason?: string;
  match_score?: number;
  list?: string;
}

interface SanctionsSummary {
  total_checks: number;
  flagged_count: number;
  flagged: SanctionsHit[];
}

interface Partner {
  id: number;
  name: string;
  name_ar: string | null;
  locality: string | null;
  status: string;
  trust_tier: string | null;
  bank_verified_at: string | null;
  sanctions_flag?: boolean;
  sanctions_checked_at?: string | null;
  sanctions_summary?: SanctionsSummary | null;
  trust_floor_signals: TrustFloor;
}

interface Questions {
  q1: { en: string; ar: string };
  q2: { en: string; ar: string };
  q3: { en: string; ar: string };
}

interface PartnerResp {
  success: boolean;
  partner: Partner;
  endorsements: unknown[];
  questions: Questions;
}

interface EndorseResp {
  success: boolean;
  endorsement: {
    coi_check_passed: boolean;
    coi_signals: Record<string, unknown>;
  };
  partner: Partner;
  state_change: 'dd_clear' | 'dd_pending' | null;
}

type Answer = boolean | null;

export default function ProximateEndorseWizardClient() {
  const params = useParams();
  // Static export pre-renders only /proximate/endorse/0/, so params.partnerId
  // hydrates as "0" for any real id. The URL is the source of truth (same
  // pattern as /applications/[id]).
  const [partnerId, setPartnerId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const m = window.location.pathname.match(/\/proximate\/endorse\/(\d+)/);
      if (m && m[1] !== '0') return m[1];
    }
    const fromParams = String(params?.partnerId ?? '');
    return fromParams && fromParams !== '0' ? fromParams : '';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const m = window.location.pathname.match(/\/proximate\/endorse\/(\d+)/);
    if (m && m[1] !== '0' && m[1] !== partnerId) {
      setPartnerId(m[1]);
    }
  }, [params, partnerId]);
  const router = useRouter();
  const { t, lang } = useTranslation();
  const isRtl = lang === 'ar';

  const user = useAuthStore((s) => s.user);
  // RBAC fix (2026-07-09): governance controls (interventions, disbursement
  // methods, record-disbursement) are OB-only. Platform admins are NOT an OB
  // (Phase 114) — the old `user?.role === 'admin'` both leaked OB controls to
  // platform admins AND hid them from the real OB (whose User.role is 'ngo').
  // Resolve the actual Proximate persona instead.
  const { persona } = useProximatePersona();
  const isOb = persona === 'ob';

  const [data, setData] = useState<PartnerResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [q1, setQ1] = useState<Answer>(null);
  const [q2, setQ2] = useState<Answer>(null);
  const [q3, setQ3] = useState<Answer>(null);
  // Phase 640 — voice transcripts per question
  const [q1Transcript, setQ1Transcript] = useState('');
  const [q2Transcript, setQ2Transcript] = useState('');
  const [q3Transcript, setQ3Transcript] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<EndorseResp | null>(null);
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Phase 634 — secretariat actions
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');

  useEffect(() => {
    if (!partnerId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.get<PartnerResp>(`/api/proximate/partners/${partnerId}`)
      .then((r) => { if (!cancelled) setData(r); })
      .catch(() => { if (!cancelled) setError(t('proximate.error.load_partner')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId]);

  const allAnswered = q1 !== null && q2 !== null && q3 !== null;

  const handleSubmit = async () => {
    if (!allAnswered) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await apiOffline.post<EndorseResp>(
        `/api/proximate/partners/${partnerId}/endorse`,
        {
          q1_real: q1, q2_trust: q2, q3_accept_aid: q3,
          q1_transcript: q1Transcript, q2_transcript: q2Transcript, q3_transcript: q3Transcript,
        },
        'proximate_endorse',
      );
      if (isQueuedResponse(r)) {
        setQueued(true);
      } else {
        setResult(r);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('proximate.error.submit_failed');
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBankVerify = async () => {
    if (!data) return;
    setAdminBusy(true);
    setAdminMessage(null);
    try {
      const r = await api.post<{ success: boolean; partner: Partner; state_change: string | null }>(
        `/api/proximate/partners/${partnerId}/bank-verify`,
      );
      setData((d) => (d ? { ...d, partner: r.partner } : d));
      setAdminMessage(
        r.state_change === 'dd_clear'
          ? t('proximate.admin.bank_verified_cleared')
          : t('proximate.admin.bank_verified'),
      );
    } catch (e: unknown) {
      setAdminMessage(e instanceof Error ? e.message : t('proximate.admin.action_failed'));
    } finally {
      setAdminBusy(false);
    }
  };

  const handleSuspend = async () => {
    if (!data || !suspendReason.trim()) return;
    setAdminBusy(true);
    setAdminMessage(null);
    try {
      const r = await api.post<{ success: boolean; partner: Partner; endorsers_penalised: number }>(
        `/api/proximate/partners/${partnerId}/suspend`,
        { reason: suspendReason.trim() },
      );
      setData((d) => (d ? { ...d, partner: r.partner } : d));
      setAdminMessage(
        t(
          r.endorsers_penalised === 1
            ? 'proximate.admin.suspended_one'
            : 'proximate.admin.suspended_other',
          { n: r.endorsers_penalised },
        ),
      );
      setSuspendOpen(false);
      setSuspendReason('');
    } catch (e: unknown) {
      setAdminMessage(e instanceof Error ? e.message : t('proximate.admin.action_failed'));
    } finally {
      setAdminBusy(false);
    }
  };

  if (loading) {
    return (
      <PageShell>
        <PageMain>
          <div className="text-sm text-muted-foreground py-6 text-center">
            <Loader2 className="w-4 h-4 animate-spin inline me-2" />
            {t('proximate.inbox.loading')}
          </div>
        </PageMain>
      </PageShell>
    );
  }

  if (!data) {
    return (
      <PageShell>
        <PageMain>
          <Card className="p-6 text-center">
            <p className="text-sm text-destructive">{error ?? t('proximate.error.not_found')}</p>
          </Card>
        </PageMain>
      </PageShell>
    );
  }

  const { partner, questions } = data;
  const displayName = isRtl && partner.name_ar ? partner.name_ar : partner.name;
  const BackChevron = isRtl ? ChevronRight : ChevronLeft;

  // Queued offline — the PWA outbox will retry when the connection
  // returns. Critical for Sudan field workers; show clean confirmation.
  if (queued) {
    return (
      <PageShell>
        <PageHeader title={displayName} />
        <PageMain>
          <div className="space-y-4">
            <Card className="p-4 border-blue-500 bg-blue-50 dark:bg-blue-950/30">
              <div className="flex items-start gap-3">
                <Check className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">{t('proximate.result.queued_title')}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('proximate.result.queued_subtitle')}
                  </p>
                </div>
              </div>
            </Card>
            <Button
              onClick={() => router.push('/proximate/endorse')}
              variant="outline"
              className="w-full"
            >
              {t('proximate.result.back_to_inbox')}
            </Button>
          </div>
        </PageMain>
      </PageShell>
    );
  }

  // Post-submit screen 3: trust-floor checklist + state change callout.
  if (result) {
    const floor = result.partner.trust_floor_signals;
    const signalCount = Object.keys(result.endorsement.coi_signals).length;
    return (
      <PageShell>
        <PageHeader title={displayName} icon={CheckCircle2} />
        <PageMain>
          <div className="space-y-4">
            {result.state_change === 'dd_clear' && (
              <Card className="p-4 border-green-500 bg-green-50 dark:bg-green-950/30">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">{t('proximate.result.cleared_title')}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('proximate.result.cleared_subtitle')}
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {!result.endorsement.coi_check_passed && (
              <Card className="p-4 border-amber-500 bg-amber-50 dark:bg-amber-950/30">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">
                      {t('proximate.result.coi_flagged_title')}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('proximate.result.coi_flagged_subtitle', { n: signalCount })}
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {result.endorsement.coi_check_passed && result.state_change !== 'dd_clear' && (
              <Card className="p-4 border-blue-500 bg-blue-50 dark:bg-blue-950/30">
                <div className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">{t('proximate.result.recorded_title')}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('proximate.result.recorded_subtitle')}
                    </p>
                  </div>
                </div>
              </Card>
            )}

            <Card className="p-4">
              <h2 className="font-medium text-sm mb-3">{t('proximate.floor.title')}</h2>
              <ul className="space-y-2 text-sm">
                <FloorRow
                  ok={floor.endorsements_ok}
                  label={t('proximate.floor.endorsements', {
                    n: floor.endorsements_independent_count,
                    total: floor.endorsements_required,
                  })}
                />
                <FloorRow
                  ok={floor.bank_verified}
                  label={t('proximate.floor.bank')}
                />
                <FloorRow
                  ok={floor.endorsers_meet_reputation_floor}
                  label={t('proximate.floor.reputation', { n: floor.reputation_floor })}
                />
              </ul>
            </Card>

            <Button
              onClick={() => router.push('/proximate/endorse')}
              variant="outline"
              className="w-full"
            >
              {t('proximate.result.back_to_inbox')}
            </Button>
          </div>
        </PageMain>
      </PageShell>
    );
  }

  // Wizard screen 2: 3 questions.
  return (
    <PageShell>
      <PageHeader
        title={displayName}
        subtitle={partner.locality ?? undefined}
      />
      <PageMain>
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => router.push('/proximate/endorse')}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <BackChevron className="w-3 h-3" />
            {t('proximate.wizard.back')}
          </button>

          {/* Phase 717 — partner journey + create-from-here next action.
              The whole trust arc at a glance, and (once cleared) a direct
              path to record a disbursement without hunting for the form. */}
          <Card className="p-4 space-y-3">
            <PartnerJourney status={partner.status} />
            {(() => {
              const s = partner.status;
              const txn = (k: string, fb: string) => {
                const v = t(k);
                return !v || v === k ? fb : v;
              };
              if (s === 'dd_clear') {
                // Record-disbursement is an OB-only action (RBAC 2026-07-09).
                // Endorsers/others still see that the partner is cleared, but
                // without the actionable link into the release form.
                return (
                  <NextStep info={{
                    label: txn('proximate.pj.next.cleared',
                      'Cleared for funding. Record a disbursement to this partner.'),
                    href: isOb ? `/proximate/disbursements/new?partner=${partner.id}` : undefined,
                    cta: isOb ? txn('proximate.pj.next.cleared_cta', 'Record disbursement') : undefined,
                    tone: isOb ? 'action' : 'waiting',
                  }} />
                );
              }
              if (s === 'dd_pending') {
                return (
                  <NextStep info={{
                    label: txn('proximate.pj.next.dd_pending',
                      'Due diligence in progress — verify the bank/FSP method and confirm independent endorsements below.'),
                    tone: 'waiting',
                  }} />
                );
              }
              if (s === 'suspended') {
                return (
                  <NextStep info={{
                    label: txn('proximate.pj.next.suspended',
                      'Suspended. Resolve the open intervention before any further funding.'),
                    tone: 'waiting',
                  }} />
                );
              }
              return (
                <NextStep info={{
                  label: txn('proximate.pj.next.default',
                    'Collect independent community endorsements to clear this partner for funding.'),
                  href: '/proximate/endorse',
                  cta: txn('proximate.pj.next.default_cta', 'Endorsement inbox'),
                  tone: 'action',
                }} />
              );
            })()}
          </Card>

          {partner.sanctions_flag && (
            <Card className="p-4 border-red-400 bg-red-50 dark:bg-red-950/30">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-700 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-red-800 dark:text-red-300">
                    {t('proximate.partner.sanctions_flag_title')}
                  </h3>
                  <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                    {t('proximate.partner.sanctions_flag_body')}
                  </p>
                  {partner.sanctions_summary?.flagged?.length ? (
                    <ul className="text-xs text-red-700 dark:text-red-300 mt-2 list-disc ps-5 space-y-0.5">
                      {partner.sanctions_summary.flagged.slice(0, 3).map((h, i) => (
                        <li key={i}>
                          {h.list || h.check_type}
                          {h.match_score !== undefined ? ` (${h.match_score}%)` : ''}
                          {h.reason ? ` — ${h.reason}` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </Card>
          )}

          <InterventionPanel
            partnerId={partner.id}
            canOpen={isOb}
            canWithdraw={isOb}
          />

          {isOb && partner.status !== 'suspended' && (
            <Card className="p-4 border-violet-300 bg-violet-50/40 dark:bg-violet-950/20">
              <h2 className="text-sm font-medium mb-2">
                {t('proximate.admin.title')}
              </h2>
              <p className="text-xs text-muted-foreground mb-3">
                {t('proximate.admin.subtitle')}
              </p>
              {adminMessage && (
                <p className="text-xs mb-3 text-foreground bg-background border border-border rounded p-2">
                  {adminMessage}
                </p>
              )}
              <div className="flex flex-col gap-2">
                {!partner.bank_verified_at && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleBankVerify}
                    disabled={adminBusy}
                  >
                    {adminBusy && <Loader2 className="w-3 h-3 animate-spin me-2" />}
                    {t('proximate.admin.bank_verify_button')}
                  </Button>
                )}
                {!suspendOpen ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSuspendOpen(true)}
                    disabled={adminBusy}
                    className="text-destructive border-destructive/30 hover:bg-destructive/5"
                  >
                    {t('proximate.admin.suspend_button')}
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <textarea
                      value={suspendReason}
                      onChange={(e) => setSuspendReason(e.target.value)}
                      placeholder={t('proximate.admin.suspend_reason_placeholder')}
                      className="w-full text-sm rounded border border-border bg-background p-2"
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={handleSuspend}
                        disabled={adminBusy || !suspendReason.trim()}
                        className="flex-1"
                      >
                        {adminBusy && <Loader2 className="w-3 h-3 animate-spin me-2" />}
                        {t('proximate.admin.suspend_confirm')}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => { setSuspendOpen(false); setSuspendReason(''); }}
                        disabled={adminBusy}
                      >
                        {t('proximate.admin.cancel')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}

          <EndorsementsPanel partnerId={partnerId} />

          <DisbursementMethodsPanel partnerId={partnerId} isAdmin={isOb} />

          <Card className="p-4">
            <p className="text-xs text-muted-foreground mb-4">
              {t('proximate.wizard.instructions')}
            </p>
            <div className="space-y-5">
              <QuestionRow
                num={1}
                text={isRtl ? questions.q1.ar : questions.q1.en}
                value={q1}
                onChange={setQ1}
                yesLabel={t('proximate.wizard.yes')}
                noLabel={t('proximate.wizard.no')}
              />
              <VoiceQuestionInput
                questionId="q1"
                transcript={q1Transcript}
                onTranscriptChange={setQ1Transcript}
                language={isRtl ? 'ar' : 'en'}
              />
              <QuestionRow
                num={2}
                text={isRtl ? questions.q2.ar : questions.q2.en}
                value={q2}
                onChange={setQ2}
                yesLabel={t('proximate.wizard.yes')}
                noLabel={t('proximate.wizard.no')}
              />
              <VoiceQuestionInput
                questionId="q2"
                transcript={q2Transcript}
                onTranscriptChange={setQ2Transcript}
                language={isRtl ? 'ar' : 'en'}
              />
              <QuestionRow
                num={3}
                text={isRtl ? questions.q3.ar : questions.q3.en}
                value={q3}
                onChange={setQ3}
                yesLabel={t('proximate.wizard.yes')}
                noLabel={t('proximate.wizard.no')}
              />
              <VoiceQuestionInput
                questionId="q3"
                transcript={q3Transcript}
                onTranscriptChange={setQ3Transcript}
                language={isRtl ? 'ar' : 'en'}
              />
            </div>
          </Card>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button
            onClick={handleSubmit}
            disabled={!allAnswered || submitting}
            className="w-full"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin me-2" />
                {t('proximate.wizard.submitting')}
              </>
            ) : (
              t('proximate.wizard.submit')
            )}
          </Button>
        </div>
      </PageMain>
    </PageShell>
  );
}

function FloorRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      {ok ? (
        <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
      ) : (
        <X className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      )}
      <span className={ok ? '' : 'text-muted-foreground'}>{label}</span>
    </li>
  );
}

function QuestionRow({
  num, text, value, onChange, yesLabel, noLabel,
}: {
  num: number;
  text: string;
  value: Answer;
  onChange: (v: Answer) => void;
  yesLabel: string;
  noLabel: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <Badge variant="outline" className="text-[10px] flex-shrink-0 mt-0.5">{num}</Badge>
        <p className="text-sm font-medium">{text}</p>
      </div>
      <div className="flex gap-2 ps-7">
        <Button
          type="button"
          variant={value === true ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange(true)}
          className="flex-1"
        >
          <Check className="w-4 h-4 me-1" />
          {yesLabel}
        </Button>
        <Button
          type="button"
          variant={value === false ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange(false)}
          className="flex-1"
        >
          <X className="w-4 h-4 me-1" />
          {noLabel}
        </Button>
      </div>
    </div>
  );
}
