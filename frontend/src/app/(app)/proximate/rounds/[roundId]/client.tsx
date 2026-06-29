'use client';

/**
 * Round detail — Phase 649.
 *
 * Shows the round, the signature roster, and the action buttons the
 * current OB user can take depending on status:
 *   draft     → Submit for review (drafter only)
 *   in_review → Sign / Reject (any OB)
 *   active    → Close round (any OB)
 *
 * Temporal audit-chain rows in the round's window are listed below so
 * the OB can see what happened during the cycle (the eventual end-of-
 * round PDF aggregates this same data).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, CheckCircle2, X, Lock, Banknote } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useProximatePersona } from '@/lib/hooks/use-proximate-persona';
import { useTranslation } from '@/lib/hooks/use-translation';
import { labelForProximateAction } from '@/lib/proximate-audit-labels';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';

interface Signature {
  id: number;
  user_id: number;
  status: string;
  declared_no_coi: boolean | null;
  note: string | null;
  acted_at: string | null;
}

interface Round {
  id: number;
  title: string;
  title_ar: string | null;
  trigger_type: string;
  trigger_summary: string | null;
  donor_name: string | null;
  envelope_usd: number | null;
  expected_duration_days: number | null;
  target_country: string;
  target_region: string | null;
  status: string;
  // Phase 703 — Donor-safe API shape (Phase 702) omits operator-only
  // fields. Treat as optional so /proximate/rounds/<id> can render for
  // donors. The page also persona-gates the operator-only sections so
  // these are never read for donors anyway.
  drafted_by_user_id?: number;
  drafted_at: string | null;
  submitted_at: string | null;
  activated_at: string | null;
  closed_at: string | null;
  cancellation_reason?: string | null;
  closing_summary?: string | null;
  signed_count: number;
  signers_required: number;
  ready_for_activation?: boolean;
  signatures?: Signature[];
}

interface AuditRow {
  seq: number;
  action: string;
  actor_email: string;
  subject_kind: string;
  subject_id: number;
  created_at: string | null;
}

interface RoundDisbursement {
  id: number;
  partner_name: string | null;
  partner_id: number;
  amount_usd: number | null;
  status: string;
  sent_at: string | null;
  report_due_at: string | null;
  overdue: boolean;
  has_report: boolean;
}

interface Resp {
  success: boolean;
  round: Round;
  // Phase 703 — Donor-safe API shape (Phase 702) omits operator-only
  // fields. audit_in_window and disbursements are present only for OB.
  // Donors get disbursements_count instead of the full list.
  audit_in_window?: AuditRow[];
  disbursements?: RoundDisbursement[];
  disbursements_count?: number;
  envelope_used?: number;
  envelope_remaining?: number | null;
}

const STATUS_TONE: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  in_review: 'bg-amber-100 text-amber-800 border-amber-300',
  active: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  closed: 'bg-blue-100 text-blue-800 border-blue-300',
  cancelled: 'bg-red-100 text-red-800 border-red-300',
};

export function ProximateRoundDetailClient() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  // Phase 701 — Proximate OBs are seeded with User.role='ngo' for
  // platform compat. Use persona, not user.role. Reviewer's
  // "Submit/Sign actions not visible" was this bug.
  const { persona } = useProximatePersona();
  const isOperator =
    persona === 'ob' || persona === 'admin' || user?.role === 'admin';
  // Phase 705 — only true OBs can sign rounds. Platform admins see
  // the operator surface (general visibility into the round) but the
  // backend @ob_required gate rejects signing because admin isn't on
  // the OB roster (Phase 114 retired the admin override). Hiding the
  // Sign button here matches what the backend allows.
  const canSign = persona === 'ob';

  const [roundId, setRoundId] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    const m = window.location.pathname.match(/\/proximate\/rounds\/(\d+)/);
    return m && m[1] !== '0' ? m[1] : '';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const m = window.location.pathname.match(/\/proximate\/rounds\/(\d+)/);
    if (m && m[1] !== '0' && m[1] !== roundId) setRoundId(m[1]);
  }, [roundId]);

  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [closing, setClosing] = useState(false);
  const [closingSummary, setClosingSummary] = useState('');

  const refresh = async () => {
    if (!roundId) return;
    setLoading(true);
    try {
      const r = await api.get<Resp>(`/api/proximate/rounds/${roundId}`);
      setData(r);
    } catch {
      setError(t('proximate.rounds.load_failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

  const round = data?.round;

  const callAction = async (path: string, body?: object) => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/proximate/rounds/${roundId}/${path}`, body || {});
      setRejecting(false);
      setClosing(false);
      setReason('');
      setClosingSummary('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('proximate.rounds.action_failed'));
    } finally {
      setBusy(false);
    }
  };

  if (loading || !round) {
    return (
      <PageShell>
        <PageMain>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            {t('proximate.rounds.loading_detail')}
          </p>
        </PageMain>
      </PageShell>
    );
  }

  // Phase 703 — defensive defaults for the donor-safe shape. The
  // Phase 702 backend strips signatures + audit_in_window + disbursements
  // for non-OB callers; .some() on undefined crashed the donor page.
  const signatures = round.signatures ?? [];
  const auditWindow = data?.audit_in_window ?? [];
  const disbursementsList = data?.disbursements ?? [];
  const userAlreadySigned = signatures.some(
    (s) => s.user_id === user?.id && s.status !== 'pending',
  );

  return (
    <PageShell>
      <PageHeader
        title={round.title}
        subtitle={round.title_ar || ''}
      />
      <PageMain>
        <div className="space-y-4">
          {/* Phase 701 — Stage banner + next-action CTA.
              Reviewer feedback: the backend supports draft → submit →
              sign → active → closed but the UI made none of that
              obvious. The banner + "what's next" CTA makes the round
              authorization pipeline self-explanatory. */}
          {(() => {
            const stages = [
              { key: 'draft',     label: t('proximate.rounds.stage_draft')     || 'Draft' },
              { key: 'in_review', label: t('proximate.rounds.stage_in_review') || 'Awaiting signatures' },
              { key: 'active',    label: t('proximate.rounds.stage_active')    || 'Active' },
              { key: 'closed',    label: t('proximate.rounds.stage_closed')    || 'Closed' },
            ];
            const isCancelled = round.status === 'cancelled';
            const currentIdx = isCancelled
              ? -1
              : stages.findIndex((s) => s.key === round.status);
            const nextActionForOB = (() => {
              if (round.status === 'draft') {
                return {
                  label: t('proximate.rounds.next_submit') || 'Submit for OB review',
                  onClick: () => callAction('submit'),
                };
              }
              if (round.status === 'in_review' && !userAlreadySigned && canSign) {
                return {
                  label: t('proximate.rounds.next_sign') || 'Sign this round (no COI)',
                  onClick: () => callAction('sign', { declared_no_coi: true }),
                };
              }
              if (round.status === 'active' && !closing) {
                return {
                  label: t('proximate.rounds.next_close') || 'Close round',
                  onClick: () => setClosing(true),
                };
              }
              return null;
            })();
            return (
              <Card className={`p-4 ${isCancelled ? 'border-red-300' : 'border-emerald-200'}`}>
                {/* Stepper */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {stages.map((s, i) => {
                    const past = !isCancelled && i < currentIdx;
                    const here = !isCancelled && i === currentIdx;
                    return (
                      <div key={s.key} className="flex items-center gap-1.5 shrink-0">
                        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs ${
                          here ? 'bg-emerald-600 text-white font-semibold'
                          : past ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-muted text-muted-foreground'
                        }`}>
                          <span className={`inline-block w-4 h-4 rounded-full text-[10px] leading-4 text-center ${
                            here ? 'bg-white text-emerald-600'
                            : past ? 'bg-emerald-600 text-white'
                            : 'bg-background border'
                          }`}>{past ? '✓' : i + 1}</span>
                          {s.label}
                        </div>
                        {i < stages.length - 1 && (
                          <span className={`w-3 h-px ${past ? 'bg-emerald-600' : 'bg-muted-foreground/30'}`} />
                        )}
                      </div>
                    );
                  })}
                  {isCancelled && (
                    <span className="ms-2 text-xs px-2 py-1 rounded-md bg-red-100 text-red-700 font-semibold">
                      {t('proximate.rounds.stage_cancelled') || 'Cancelled'}
                    </span>
                  )}
                </div>
                {/* Next-action CTA, only for OBs and only when an
                    action is actually available right now. */}
                {isOperator && nextActionForOB && (
                  <div className="mt-3 pt-3 border-t flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-xs text-muted-foreground">
                      {t('proximate.rounds.whats_next') || 'What\'s next:'}
                    </div>
                    <Button onClick={nextActionForOB.onClick} disabled={busy} size="sm">
                      {busy && <Loader2 className="w-3.5 h-3.5 animate-spin me-1" />}
                      {nextActionForOB.label}
                    </Button>
                  </div>
                )}
                {round.status === 'in_review' && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {round.signed_count}/{round.signers_required}{' '}
                    {t('proximate.rounds.signers_collected') || 'signers collected'}
                    {round.ready_for_activation
                      ? ` — ${t('proximate.rounds.ready_to_activate') || 'ready to activate'}`
                      : ''}
                  </p>
                )}
              </Card>
            );
          })()}

          {/* Status + meta */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={STATUS_TONE[round.status]}>
                {round.status}
              </Badge>
              {round.status === 'in_review' && (
                <span className="text-xs text-muted-foreground">
                  {round.signed_count}/{round.signers_required} {t('proximate.rounds.signed')}
                </span>
              )}
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-y-2 gap-x-4 text-xs">
              <div>
                <dt className="text-muted-foreground">{t('proximate.rounds.trigger')}</dt>
                <dd className="font-medium">{round.trigger_type}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('proximate.rounds.donor')}</dt>
                <dd className="font-medium">{round.donor_name || '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('proximate.rounds.envelope')}</dt>
                <dd className="font-medium">
                  {round.envelope_usd ? `$${round.envelope_usd.toLocaleString()}` : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('proximate.rounds.region')}</dt>
                <dd className="font-medium">{round.target_region || round.target_country}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('proximate.rounds.duration')}</dt>
                <dd className="font-medium">
                  {round.expected_duration_days ? `${round.expected_duration_days}d` : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('proximate.rounds.drafted')}</dt>
                <dd className="font-medium">
                  {round.drafted_at ? new Date(round.drafted_at).toLocaleDateString() : '—'}
                </dd>
              </div>
            </dl>
            {round.trigger_summary && (
              <p className="text-sm border-t pt-2">{round.trigger_summary}</p>
            )}
          </Card>

          {/* Actions */}
          {isOperator && (
            <Card className="p-4 space-y-3">
              <p className="text-sm font-medium">{t('proximate.rounds.actions')}</p>

              {round.status === 'draft' && (
                <Button
                  onClick={() => callAction('submit')}
                  disabled={busy}
                  size="sm"
                >
                  {busy && <Loader2 className="w-3.5 h-3.5 animate-spin me-1" />}
                  {t('proximate.rounds.submit_for_review')}
                </Button>
              )}

              {round.status === 'in_review' && !userAlreadySigned && canSign && (
                <div className="space-y-2">
                  <Button
                    onClick={() => callAction('sign', { declared_no_coi: true })}
                    disabled={busy}
                    size="sm"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 me-1" />
                    {t('proximate.rounds.sign_no_coi')}
                  </Button>
                  <Button
                    onClick={() => callAction('sign', { declared_no_coi: false, note: 'Recusing' })}
                    disabled={busy}
                    size="sm"
                    variant="outline"
                  >
                    {t('proximate.rounds.recuse')}
                  </Button>
                  {!rejecting ? (
                    <Button
                      onClick={() => setRejecting(true)}
                      disabled={busy}
                      size="sm"
                      variant="outline"
                    >
                      <X className="w-3.5 h-3.5 me-1" />
                      {t('proximate.rounds.reject')}
                    </Button>
                  ) : (
                    <div className="space-y-2 border-t pt-3">
                      <label className="text-xs text-muted-foreground block">
                        {t('proximate.rounds.reject_reason')}
                      </label>
                      <textarea
                        className="w-full text-sm rounded-md border bg-background p-2 min-h-[64px]"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => callAction('sign', { reject_reason: reason })}
                          disabled={busy || !reason.trim()}
                        >
                          {t('proximate.rounds.confirm_reject')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setRejecting(false); setReason(''); }}
                        >
                          {t('proximate.rounds.cancel')}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {round.status === 'in_review' && userAlreadySigned && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  {t('proximate.rounds.you_already_responded')}
                </p>
              )}

              {/* Phase 705 — platform admin sees the operator surface
                  but isn't on the OB roster, so the backend rejects
                  signing. Make that explicit instead of showing a
                  Sign button that 403s on click. */}
              {round.status === 'in_review' && !canSign && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  {t('proximate.rounds.admin_cannot_sign')
                    || 'Signing is for OB roster members only — you are signed in as platform admin.'}
                </p>
              )}

              {round.status === 'active' && (
                <>
                  {!closing ? (
                    <Button
                      onClick={() => setClosing(true)}
                      disabled={busy}
                      size="sm"
                      variant="outline"
                    >
                      {t('proximate.rounds.close_round')}
                    </Button>
                  ) : (
                    <div className="space-y-2 border-t pt-3">
                      <label className="text-xs text-muted-foreground block">
                        {t('proximate.rounds.closing_summary')}
                      </label>
                      <textarea
                        className="w-full text-sm rounded-md border bg-background p-2 min-h-[80px]"
                        value={closingSummary}
                        onChange={(e) => setClosingSummary(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => callAction('close', { summary: closingSummary })}
                          disabled={busy}
                        >
                          {t('proximate.rounds.confirm_close')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setClosing(false); setClosingSummary(''); }}
                        >
                          {t('proximate.rounds.cancel')}
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {error && <p className="text-xs text-destructive">{error}</p>}
            </Card>
          )}

          {/* Signatures — operator-only; donors don't see committee names */}
          {isOperator && (
          <Card className="p-4">
            <p className="text-sm font-medium mb-3">
              {t('proximate.rounds.signatures')} ({signatures.length})
            </p>
            {signatures.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t('proximate.rounds.no_signatures')}
              </p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {signatures.map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <span className="text-muted-foreground">{t('proximate.rounds.signer')} #{s.user_id}</span>
                    <Badge variant="outline" className="text-[10px]">{s.status}</Badge>
                    {s.acted_at && (
                      <span className="text-muted-foreground ms-auto">
                        {new Date(s.acted_at).toLocaleDateString()}
                      </span>
                    )}
                    {s.note && <span className="text-muted-foreground italic">— {s.note}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          )}

          {/* Cancellation / closing summary */}
          {round.cancellation_reason && (
            <Card className="p-4 border-destructive">
              <p className="text-sm font-medium mb-1 text-destructive">
                {t('proximate.rounds.cancellation')}
              </p>
              <p className="text-xs">{round.cancellation_reason}</p>
            </Card>
          )}
          {round.closing_summary && (
            <Card className="p-4">
              <p className="text-sm font-medium mb-1">{t('proximate.rounds.closed')}</p>
              <p className="text-xs whitespace-pre-wrap">{round.closing_summary}</p>
            </Card>
          )}

          {/* Phase 702 — Closing pack eligibility panel.
              Reviewer feedback: retrospective PDF returns 422 when the
              round is draft, with no UI hint why. This panel makes
              eligibility explicit: each artifact shows status (locked
              with reason, available now with link, or already
              generated). */}
          {(() => {
            const isActive = round.status === 'active';
            const isClosed = round.status === 'closed';
            const isLater = isActive || isClosed;
            // Phase 704 — retrospective PDF is gated at 180 days
            // past closure (server-side enforced in
            // api_round_retrospective_pdf). Show the link only when
            // both close + age threshold are met; otherwise show a
            // truthful "available N more days after close" message.
            const closedAt = round.closed_at ? new Date(round.closed_at) : null;
            const daysSinceClose = closedAt
              ? Math.floor((Date.now() - closedAt.getTime()) / 86_400_000)
              : null;
            const RETROSPECTIVE_GATE_DAYS = 180;
            const retroReady = isClosed
              && daysSinceClose !== null
              && daysSinceClose >= RETROSPECTIVE_GATE_DAYS;
            const retroDaysRemaining = isClosed && daysSinceClose !== null
              ? Math.max(0, RETROSPECTIVE_GATE_DAYS - daysSinceClose)
              : null;
            const items: Array<{
              label: string;
              available: boolean;
              reason: string;
              href?: string;
            }> = [
              {
                label: t('proximate.rounds.pack_report_pdf') || 'Round report PDF',
                available: isLater,
                reason: isLater
                  ? (t('proximate.rounds.pack_available') || 'Available now.')
                  : (t('proximate.rounds.pack_locked_until_active')
                      || 'Available once the round is active.'),
                href: isLater
                  ? `/api/proximate/rounds/${round.id}/report.pdf`
                  : undefined,
              },
              {
                label: t('proximate.rounds.pack_retrospective_pdf')
                  || 'Donor retrospective PDF (180-day)',
                available: retroReady,
                reason: retroReady
                  ? (t('proximate.rounds.pack_available') || 'Available now.')
                  : isClosed
                    ? (
                        retroDaysRemaining && retroDaysRemaining > 0
                          ? `${t('proximate.rounds.pack_retro_wait')
                              || 'Available'} ${retroDaysRemaining} ${t('proximate.rounds.pack_retro_wait_unit')
                                || 'more days after closure.'}`
                          : (t('proximate.rounds.pack_available') || 'Available now.')
                      )
                    : isActive
                      ? (t('proximate.rounds.pack_retro_after_close')
                          || 'Available 180 days after the round closes.')
                      : (t('proximate.rounds.pack_locked_until_active')
                          || 'Available once the round is active.'),
                href: retroReady
                  ? `/api/proximate/rounds/${round.id}/retrospective.pdf`
                  : undefined,
              },
              {
                label: t('proximate.rounds.pack_audit_bundle')
                  || 'Audit-chain bundle (JSONL)',
                available: isLater,
                reason: isLater
                  ? (t('proximate.rounds.pack_available') || 'Available now.')
                  : (t('proximate.rounds.pack_locked_until_active')
                      || 'Available once the round is active.'),
                href: isLater
                  ? '/api/proximate/audit-chain?format=jsonl&limit=500'
                  : undefined,
              },
            ];
            return (
              <Card className="p-4">
                <p className="text-sm font-medium mb-2">
                  {t('proximate.rounds.closing_pack') || 'Closing pack'}
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  {t('proximate.rounds.closing_pack_sub')
                    || 'Artifacts the OB and donors receive at the end of the round.'}
                </p>
                <ul className="space-y-2 text-xs">
                  {items.map((it) => (
                    <li key={it.label} className="flex items-start gap-2">
                      <span className={`inline-block w-3.5 h-3.5 rounded-full mt-0.5 ${
                        it.available ? 'bg-emerald-500' : 'bg-muted-foreground/30'
                      }`} />
                      <div className="flex-1">
                        <div className="font-medium">{it.label}</div>
                        <div className="text-muted-foreground">{it.reason}</div>
                      </div>
                      {it.available && it.href && (
                        <a
                          href={it.href}
                          className="text-primary hover:underline whitespace-nowrap"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {t('proximate.rounds.pack_download') || 'Download'}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })()}

          {/* Phase 656 — Disbursements rollup.
              Phase 703 — donor-safe variant. Donors see envelope rollup +
              count only (no per-row partner detail or "Disburse more"
              CTA). The donor-safe API returns `disbursements_count`
              instead of `disbursements`. */}
          {(() => {
            const disb = disbursementsList;
            const donorCount =
              typeof data?.disbursements_count === 'number'
                ? data.disbursements_count
                : disb.length;
            const used = data?.envelope_used || 0;
            const total = round.envelope_usd || 0;
            const remaining = data?.envelope_remaining ?? (total ? total - used : null);
            const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
            return (
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-muted-foreground" />
                    {t('proximate.rounds.disbursements_in_round')} ({donorCount})
                  </p>
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/proximate/rounds/${round.id}/report`}
                      className="text-xs text-primary hover:underline"
                    >
                      {t('proximate.rounds.download_report')}
                    </Link>
                    {isOperator && (
                      <Link
                        href={`/proximate/disbursements/new?round=${round.id}`}
                        className="text-xs text-primary hover:underline"
                      >
                        {t('proximate.rounds.disburse_more')}
                      </Link>
                    )}
                  </div>
                </div>
                {total > 0 && (
                  <div className="mb-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">
                        ${used.toLocaleString()} / ${total.toLocaleString()}
                      </span>
                      <span className="text-muted-foreground">
                        {remaining !== null
                          ? `$${remaining.toLocaleString()} ${t('proximate.rounds.remaining')}`
                          : ''}
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-600 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )}
                {isOperator && (
                  disb.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t('proximate.rounds.no_disbursements_yet')}
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {disb.map((d) => (
                        <li key={d.id}>
                          <Link
                            href={`/proximate/disbursements/${d.id}`}
                            className="flex items-center gap-2 text-xs hover:bg-muted/30 rounded px-2 py-1.5 -mx-2"
                          >
                            <span className="font-medium flex-1 truncate">
                              {d.partner_name || `Partner #${d.partner_id}`}
                            </span>
                            {d.amount_usd && (
                              <span className="text-muted-foreground tabular-nums">
                                ${d.amount_usd.toLocaleString()}
                              </span>
                            )}
                            <Badge variant="outline" className={`text-[10px] ${
                              d.status === 'verified' ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : d.status === 'flagged' ? 'bg-red-100 text-red-800 border-red-300'
                              : d.status === 'reported' ? 'bg-blue-100 text-blue-800 border-blue-300'
                              : d.overdue ? 'bg-red-100 text-red-800 border-red-300'
                              : 'bg-amber-100 text-amber-800 border-amber-300'
                            }`}>
                              {d.status}{d.overdue ? ' · late' : ''}
                            </Badge>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )
                )}
              </Card>
            );
          })()}

          {/* Audit window — operator-only.
              Phase 703 — donor-safe API doesn't return audit_in_window.
              Donors get the audit_anchor_seq on the round PDF for
              tamper-evident verification instead. */}
          {isOperator && (
          <Card className="p-4">
            <p className="text-sm font-medium mb-3">
              {t('proximate.rounds.activity')} ({auditWindow.length})
            </p>
            {auditWindow.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t('proximate.rounds.no_activity')}
              </p>
            ) : (
              <ul className="space-y-1 text-xs">
                {auditWindow.slice(0, 30).map((a) => {
                  const label = labelForProximateAction(a.action);
                  const isKnown = label !== a.action;
                  return (
                  <li key={a.seq} className="flex items-center gap-2">
                    <span className="text-muted-foreground tabular-nums">#{a.seq}</span>
                    {/* Phase 704 — human label when we know one,
                        raw mono code as the fallback so the chain
                        is never silently mis-rendered. Hover the
                        label to see the underlying action code. */}
                    {isKnown ? (
                      <span title={a.action}>{label}</span>
                    ) : (
                      <span className="font-mono">{a.action}</span>
                    )}
                    <span className="text-muted-foreground">
                      ({a.subject_kind} #{a.subject_id})
                    </span>
                    <span className="text-muted-foreground ms-auto">{a.actor_email}</span>
                  </li>
                  );
                })}
              </ul>
            )}
          </Card>
          )}
        </div>
      </PageMain>
    </PageShell>
  );
}
