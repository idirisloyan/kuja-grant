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
import { Loader2, CheckCircle2, X, Lock, Banknote, Users, UserPlus, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useProximatePersona } from '@/lib/hooks/use-proximate-persona';
import { useTranslation } from '@/lib/hooks/use-translation';
import { labelForProximateAction } from '@/lib/proximate-audit-labels';
import { labelForProximateStatus } from '@/lib/proximate-status-labels';
import { TONE_CLASSES, toneForProximateStatus } from '@/components/proximate/status-badge';
import { SelectionVoteCard } from '@/components/proximate/selection-vote-card';
import { ReportPackagesCard } from '@/components/proximate/report-packages-card';
import { ApprovedActivitiesCard } from '@/components/proximate/approved-activities-card';
import {
  ProximateAttachmentsPanel, PanelRosterPanel,
} from '@/components/proximate/dd-evidence';
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

export function ProximateRoundDetailClient() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  // Phase 701 — Proximate OBs are seeded with User.role='ngo' for
  // platform compat. Use persona, not user.role. Reviewer's
  // "Submit/Sign actions not visible" was this bug.
  const { persona } = useProximatePersona();
  // RBAC 2026-07-09 — the operator surface (round lifecycle controls:
  // submit / activate / close / record disbursement + the roster editor)
  // is OB-only. Previously this also matched persona==='admin' and
  // user.role==='admin', so platform admins saw enabled OB controls
  // (fiduciary-control risk flagged by the team). The backend now serves
  // admins the donor-safe round shape and rejects the mutations, so the
  // UI must match: only a real OB is an operator here.
  const isOperator = persona === 'ob';
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
  // Phase 711 — Round participant roster. Loaded lazily after the
  // round detail lands so the initial render isn't blocked. Empty
  // array is fine — the roster card just renders a "no participants
  // yet" empty state in that case.
  const [participants, setParticipants] = useState<{
    id: number;
    partner_id: number;
    partner_name: string | null;
    partner_locality: string | null;
    partner_status: string | null;
    stage: string;
    notes: string | null;
  }[]>([]);

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

  // Phase 711 — participant fetch. Non-blocking: if it 403s (donor
  // persona) or 404s (round has none) the card just renders empty.
  // Extracted so the add-partner dialog (Phase 715b) can refresh
  // the roster in-place after a POST.
  const refreshParticipants = async () => {
    if (!roundId) return;
    try {
      const r = await api.get<{
        success: boolean;
        participants: {
          id: number; partner_id: number;
          partner_name: string | null;
          partner_locality: string | null;
          partner_status: string | null;
          stage: string; notes: string | null;
        }[];
      }>(`/api/proximate/rounds/${roundId}/participants`);
      if (r?.participants) setParticipants(r.participants);
    } catch {
      setParticipants((prev) => prev);
    }
  };
  useEffect(() => {
    void refreshParticipants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

  // Phase 715b — Add-partner dialog state. Loaded lazily on open so
  // opening the round page doesn't fetch the full partner registry.
  const [showAddPartner, setShowAddPartner] = useState(false);
  const [availablePartners, setAvailablePartners] = useState<{
    id: number; name: string; locality: string | null; status: string;
  }[] | null>(null);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [addFilter, setAddFilter] = useState('');

  const openAddPartner = async () => {
    setShowAddPartner(true);
    if (availablePartners !== null) return;
    try {
      const r = await api.get<{
        success: boolean;
        partners: {
          id: number; name: string; locality: string | null; status: string;
        }[];
      }>('/api/proximate/partners');
      setAvailablePartners(r?.partners || []);
    } catch {
      setAvailablePartners([]);
    }
  };

  const addPartnerToRound = async (partnerId: number) => {
    setAddingId(partnerId);
    try {
      await api.post(
        `/api/proximate/rounds/${roundId}/participants`,
        { partner_id: partnerId },
      );
      await refreshParticipants();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('proximate.rounds.action_failed'));
    } finally {
      setAddingId(null);
    }
  };

  // Phase 716a — Invite endorser modal state. OB fills in name + phone
  // → generates a per-elder invite token → returns a shareable WhatsApp
  // URL the elder can open cold (no login).
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitePartnerId, setInvitePartnerId] = useState<number | null>(null);
  const [invitePartnerName, setInvitePartnerName] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteLocality, setInviteLocality] = useState('');
  const [inviteNote, setInviteNote] = useState('');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{
    inviteToken: string;
    shareUrl: string;
    waHref: string;
  } | null>(null);

  const openInviteEndorser = (partnerId: number, partnerName: string) => {
    setInvitePartnerId(partnerId);
    setInvitePartnerName(partnerName);
    setInviteName('');
    setInvitePhone('');
    setInviteLocality('');
    setInviteNote('');
    setInviteResult(null);
    setInviteOpen(true);
  };

  const submitInvite = async () => {
    if (!invitePartnerId || !inviteName.trim()) return;
    setInviteSubmitting(true);
    try {
      const r = await api.post<{
        success: boolean;
        invite: { invite_token: string };
      }>(`/api/proximate/partners/${invitePartnerId}/endorser-invites`, {
        invitee_name: inviteName.trim(),
        invitee_phone: invitePhone.trim() || null,
        invitee_locality: inviteLocality.trim() || null,
        note: inviteNote.trim() || null,
      });
      const token = r.invite.invite_token;
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const shareUrl = `${origin}/proximate-endorse-invite?t=${token}`;
      const waText = `Salaam ${inviteName.trim()}. Adeso is asking you to endorse ${invitePartnerName} for the current Proximate round. Please open: ${shareUrl}`;
      const waHref = `https://wa.me/${(invitePhone.trim() || '').replace(/[^\d]/g, '')}?text=${encodeURIComponent(waText)}`;
      setInviteResult({ inviteToken: token, shareUrl, waHref });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('proximate.rounds.action_failed'));
    } finally {
      setInviteSubmitting(false);
    }
  };

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
        breadcrumbs={[
          { label: 'Proximate', href: '/proximate/admin' },
          { label: 'Rounds', href: '/proximate/rounds' },
        ]}
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

          {/* Pilot polish (2026-07-16, external review): the partner
              pipeline for THIS round, aggregated from roster stages,
              with the current bottleneck highlighted — an OB opening
              the round sees nominated → endorsed → route verified →
              funds out → reported without reading a runbook. */}
          {participants.length > 0 && (() => {
            const roster = participants.filter((p) => p.stage !== 'withdrawn');
            const JOURNEY = [
              { keys: ['planned'],
                label: t('proximate.rounds.journey_nominated') || 'Nominated',
                hint: t('proximate.rounds.journey_nominated_hint') || 'Partners are on the roster. Next: invite two community endorsers per partner from the roster below.' },
              { keys: ['endorsement_open'],
                label: t('proximate.rounds.journey_endorsing') || 'Endorsements',
                hint: t('proximate.rounds.journey_endorsing_hint') || 'Endorsements are being collected — two conflict-free endorsements clear a partner.' },
              { keys: ['endorsed'],
                label: t('proximate.rounds.journey_endorsed') || 'Endorsed + DD',
                hint: t('proximate.rounds.journey_endorsed_hint') || 'Next: verify each partner’s payment route (bank, hawala or mobile money).' },
              { keys: ['bank_verified'],
                label: t('proximate.rounds.journey_route_ok') || 'Route verified',
                hint: t('proximate.rounds.journey_route_ok_hint') || 'Next: create disbursements — amounts above the threshold collect co-signatures.' },
              { keys: ['disbursed'],
                label: t('proximate.rounds.journey_funded') || 'Funds out',
                hint: t('proximate.rounds.journey_funded_hint') || 'Next: partners report back with photos and receipts; reminders go out automatically.' },
              { keys: ['reported', 'attested', 'verified'],
                label: t('proximate.rounds.journey_reported') || 'Reported & verified',
                hint: t('proximate.rounds.journey_reported_hint') || 'Reports are in — verify them; 90-day outcome attestations follow.' },
            ];
            const counts = JOURNEY.map((s) =>
              roster.filter((p) => s.keys.includes(p.stage)).length);
            const bottleneck = counts.findIndex((c) => c > 0);
            return (
              <Card className="p-4">
                <p className="text-sm font-medium mb-3">
                  {t('proximate.rounds.journey_title') || 'What happens next'}
                </p>
                <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
                  {JOURNEY.map((s, i) => (
                    <div key={s.label} className="flex items-center gap-1 min-w-0">
                      <div
                        className={`rounded-md border px-2.5 py-1.5 text-center min-w-[86px] ${
                          i === bottleneck
                            ? 'border-primary bg-primary/10'
                            : counts[i] > 0
                              ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800'
                              : 'border-border bg-muted/30'
                        }`}
                      >
                        <p className="text-base font-semibold leading-tight">{counts[i]}</p>
                        <p className="text-[10px] text-muted-foreground leading-tight">{s.label}</p>
                      </div>
                      {i < JOURNEY.length - 1 && (
                        <span className="text-muted-foreground text-xs shrink-0" aria-hidden>
                          →
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                {bottleneck >= 0 && (
                  <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-xs text-muted-foreground flex-1 min-w-[200px]">
                      {JOURNEY[bottleneck].hint}
                    </p>
                    {/* Pilot feedback: the hint told operators to invite
                        endorsers but gave them nothing to click. Jump to
                        the roster, where each partner has its own
                        invite/share-endorser action. */}
                    {bottleneck <= 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          document.getElementById('round-roster')?.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start',
                          })
                        }
                        className="text-[11px] inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 shrink-0"
                      >
                        {t('proximate.rounds.journey_start_endorsements') || 'Start endorsements'}
                        <span aria-hidden>↓</span>
                      </button>
                    )}
                  </div>
                )}
              </Card>
            );
          })()}

          {/* Status + meta */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={TONE_CLASSES[toneForProximateStatus(round.status)]}>
                {labelForProximateStatus(round.status, t)}
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

          {/* Phase 711 — Partner Roster.
              User feedback: "it is not clear how you tie a round to
              NGO's...should show visual representation of the stage of
              the round...be able to click and drill down." This card
              answers "who is in this round" — one row per participating
              partner with a stage pill and a WhatsApp-share button for
              the endorser link. Donors see the roster too (partner
              names + stages), just no share button. */}
          {(() => {
            // Phase 715b — roster is now visible for OB whenever the
            // round is in a roster-mutable state (draft/active) even
            // if empty, so there's a place for the "Add partner" CTA.
            // For donor/non-OB personas the roster only appears when
            // there's something to see (the original behaviour).
            const rosterMutable =
              !!round && (round.status === 'draft' || round.status === 'active');
            const showRoster =
              participants.length > 0 || (isOperator && rosterMutable);
            if (!showRoster) return null;
            return (
            <Card id="round-roster" className="p-4 scroll-mt-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  Partner roster ({participants.length})
                </p>
                <div className="flex items-center gap-2">
                  {isOperator && rosterMutable && (
                    <button
                      type="button"
                      onClick={openAddPartner}
                      className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                    >
                      <UserPlus className="w-3 h-3" />
                      Add partner
                    </button>
                  )}
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Stage per partner
                  </p>
                </div>
              </div>
              {participants.length === 0 && (
                <p className="text-xs text-muted-foreground italic py-4 text-center">
                  No partners on the roster yet. Click <span className="font-medium">Add partner</span> to enrol the first NGO.
                </p>
              )}
              <ul className="space-y-1.5">
                {participants.map((p) => {
                  const stageStyles: Record<string, string> = {
                    planned: 'bg-muted text-muted-foreground border-border',
                    endorsement_open: 'bg-amber-100 text-amber-800 border-amber-300',
                    endorsed: 'bg-blue-100 text-blue-800 border-blue-300',
                    bank_verified: 'bg-sky-100 text-sky-800 border-sky-300',
                    disbursed: 'bg-emerald-100 text-emerald-800 border-emerald-300',
                    reported: 'bg-emerald-100 text-emerald-800 border-emerald-300',
                    attested: 'bg-emerald-100 text-emerald-800 border-emerald-300',
                    verified: 'bg-emerald-200 text-emerald-900 border-emerald-400 font-semibold',
                    withdrawn: 'bg-rose-100 text-rose-800 border-rose-300',
                  };
                  const stageCls = stageStyles[p.stage] || stageStyles.planned;
                  const partnerHref = `/proximate/admin?partner=${p.partner_id}`;
                  const endorseUrl = typeof window !== 'undefined'
                    ? `${window.location.origin}/proximate/endorse/${p.partner_id}`
                    : `/proximate/endorse/${p.partner_id}`;
                  const waText = `Please endorse this Proximate partner for our current round: ${p.partner_name || 'partner'}. Open: ${endorseUrl}`;
                  const waHref = `https://wa.me/?text=${encodeURIComponent(waText)}`;
                  return (
                    <li
                      key={p.id}
                      className="flex items-center gap-2 py-1.5 border-b border-border/60 last:border-b-0 flex-wrap"
                    >
                      <Link
                        href={partnerHref}
                        className="flex-1 min-w-0 text-sm hover:underline"
                      >
                        <span className="font-medium truncate block">
                          {p.partner_name || `Partner #${p.partner_id}`}
                        </span>
                        {p.partner_locality && (
                          <span className="text-[10px] text-muted-foreground">
                            {p.partner_locality}
                            {p.partner_status ? ` · ${p.partner_status}` : ''}
                          </span>
                        )}
                      </Link>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${stageCls}`}
                      >
                        {p.stage.replace(/_/g, ' ')}
                      </Badge>
                      {isOperator ? (
                        <button
                          type="button"
                          onClick={() => openInviteEndorser(p.partner_id, p.partner_name || `Partner #${p.partner_id}`)}
                          className="text-[10px] inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
                        >
                          Invite endorser
                        </button>
                      ) : (
                        <a
                          href={waHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
                        >
                          Share endorser link
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="text-[10px] text-muted-foreground mt-2">
                Click a partner to open detail. Share the endorser link
                via WhatsApp — the recipient opens it, endorses, and the
                round auto-updates.
              </p>
            </Card>
            );
          })()}

          {/* Panel selection vote — the digital replacement for the
              physical selection meeting. OB-only card; renders nothing
              for other personas. */}
          {isOperator && participants.length > 0 && (
            <SelectionVoteCard roundId={Number(roundId)} isOperator={isOperator} />
          )}

          {/* Partner report packages — phone links + review queue. */}
          {isOperator && participants.length > 0 && (
            <ReportPackagesCard
              roundId={Number(roundId)}
              participants={participants}
              isOperator={isOperator}
            />
          )}

          {/* Approved activities — the reporting baseline per partner. */}
          {isOperator && participants.length > 0 && (
            <ApprovedActivitiesCard
              roundId={Number(roundId)}
              participants={participants}
              isOperator={isOperator}
            />
          )}

          {/* Phase 715b — Add-partner dialog. Renders as a lightweight
              inline modal so we don't need to pull in a Dialog primitive.
              Lists tenant partners not already on this round's roster.
              Clicking a row POSTs to /participants and refreshes the
              roster in place. */}
          {showAddPartner && (
            <div
              className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
              onClick={() => setShowAddPartner(false)}
            >
              <div
                className="bg-background rounded-lg shadow-xl border max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between p-4 border-b">
                  <p className="text-sm font-medium">Add partner to round</p>
                  <button
                    type="button"
                    onClick={() => setShowAddPartner(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-4 border-b">
                  <input
                    type="text"
                    autoFocus
                    placeholder="Filter by name…"
                    value={addFilter}
                    onChange={(e) => setAddFilter(e.target.value)}
                    className="w-full text-sm rounded-md border bg-background p-2"
                  />
                </div>
                <div className="flex-1 overflow-y-auto">
                  {availablePartners === null && (
                    <p className="text-xs text-muted-foreground p-4 text-center">
                      Loading partners…
                    </p>
                  )}
                  {availablePartners !== null && (() => {
                    const onRoster = new Set(
                      participants.map((p) => p.partner_id),
                    );
                    const filterLc = addFilter.trim().toLowerCase();
                    const eligible = availablePartners
                      .filter((p) => !onRoster.has(p.id))
                      .filter((p) =>
                        !filterLc
                          ? true
                          : p.name.toLowerCase().includes(filterLc)
                            || (p.locality || '').toLowerCase().includes(filterLc),
                      );
                    if (eligible.length === 0) {
                      return (
                        <p className="text-xs text-muted-foreground p-4 text-center">
                          {addFilter.trim()
                            ? 'No partners match your filter.'
                            : 'All tenant partners are already on the roster.'}
                        </p>
                      );
                    }
                    return (
                      <ul className="divide-y">
                        {eligible.map((p) => (
                          <li
                            key={p.id}
                            className="flex items-center gap-2 p-3 hover:bg-muted/40"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {p.name}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {[p.locality, p.status].filter(Boolean).join(' · ')}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={addingId === p.id}
                              onClick={() => addPartnerToRound(p.id)}
                              className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                            >
                              {addingId === p.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Plus className="w-3 h-3" />
                              )}
                              Add
                            </button>
                          </li>
                        ))}
                      </ul>
                    );
                  })()}
                </div>
                <div className="p-3 border-t bg-muted/30">
                  <p className="text-[10px] text-muted-foreground">
                    Partners land on the roster at stage <span className="font-mono">planned</span>. Stage auto-advances as endorsements, disbursements, and reports come in.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Phase 716a — Invite endorser modal. OB provides elder's
              name + phone; backend mints a per-invite token; modal
              swaps to a share panel with WhatsApp CTA. */}
          {inviteOpen && (
            <div
              className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
              onClick={() => setInviteOpen(false)}
            >
              <div
                className="bg-background rounded-lg shadow-xl border max-w-md w-full max-h-[85vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between p-4 border-b">
                  <div>
                    <p className="text-sm font-medium">Invite endorser</p>
                    <p className="text-[11px] text-muted-foreground">
                      for {invitePartnerName}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInviteOpen(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {!inviteResult ? (
                  <div className="p-4 space-y-3 flex-1 overflow-y-auto">
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">
                        Elder&apos;s name *
                      </label>
                      <input
                        type="text"
                        autoFocus
                        className="w-full text-sm rounded-md border bg-background p-2"
                        value={inviteName}
                        onChange={(e) => setInviteName(e.target.value)}
                        placeholder="e.g. Sarah Musa"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">
                        Phone (for WhatsApp)
                      </label>
                      <input
                        type="tel"
                        className="w-full text-sm rounded-md border bg-background p-2"
                        value={invitePhone}
                        onChange={(e) => setInvitePhone(e.target.value)}
                        placeholder="+249…"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">
                        Locality
                      </label>
                      <input
                        type="text"
                        className="w-full text-sm rounded-md border bg-background p-2"
                        value={inviteLocality}
                        onChange={(e) => setInviteLocality(e.target.value)}
                        placeholder="e.g. Kassala"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">
                        Note (shown to the elder)
                      </label>
                      <textarea
                        className="w-full text-sm rounded-md border bg-background p-2 min-h-[70px]"
                        value={inviteNote}
                        onChange={(e) => setInviteNote(e.target.value)}
                        placeholder="e.g. Because you know the Kassala community"
                      />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button
                        onClick={submitInvite}
                        disabled={inviteSubmitting || !inviteName.trim()}
                      >
                        {inviteSubmitting && <Loader2 className="w-4 h-4 animate-spin me-2" />}
                        Generate invite
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setInviteOpen(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 space-y-3 flex-1 overflow-y-auto">
                    <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3">
                      <p className="text-sm font-medium text-emerald-800">
                        Invitation ready
                      </p>
                      <p className="text-[11px] text-emerald-700 mt-1">
                        Send this link to {inviteName} — they can open it on their phone with no login.
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">
                        Shareable URL
                      </label>
                      <input
                        type="text"
                        readOnly
                        className="w-full text-xs rounded-md border bg-muted/40 p-2 font-mono"
                        value={inviteResult.shareUrl}
                        onFocus={(e) => e.currentTarget.select()}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <a
                        href={inviteResult.waHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                      >
                        Open in WhatsApp
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(inviteResult.shareUrl);
                        }}
                        className="w-full py-2 rounded-md border bg-background text-sm hover:bg-muted/40"
                      >
                        Copy link
                      </button>
                    </div>
                    <div className="pt-2 border-t">
                      <button
                        type="button"
                        onClick={() => {
                          setInviteResult(null);
                          setInviteName('');
                          setInvitePhone('');
                          setInviteLocality('');
                          setInviteNote('');
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        + Invite another endorser for this partner
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

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
              /* QA 2026-07-15 ("too busy"): the Blue Nile ingestion put
                 ~500 near-identical rows in this window and the card
                 rendered 30 of them as a monospace wall. Roll the window
                 up into per-action counts and show only the most recent
                 handful of individual events. The full chain is still
                 one click away via the audit bundle download above. */
              (() => {
                const counts = new Map<string, number>();
                for (const a of auditWindow) {
                  counts.set(a.action, (counts.get(a.action) || 0) + 1);
                }
                const grouped = Array.from(counts.entries())
                  .sort((x, y) => y[1] - x[1]);
                return (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-1.5">
                      {grouped.slice(0, 8).map(([action, n]) => (
                        <span
                          key={action}
                          title={action}
                          className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[11px]"
                        >
                          {labelForProximateAction(action)}
                          <span className="text-muted-foreground tabular-nums">×{n}</span>
                        </span>
                      ))}
                      {grouped.length > 8 && (
                        <span className="text-[11px] text-muted-foreground self-center">
                          +{grouped.length - 8}
                        </span>
                      )}
                    </div>
                    <ul className="space-y-1 text-xs">
                      {auditWindow.slice(0, 6).map((a) => (
                        <li key={a.seq} className="flex items-center gap-2">
                          <span title={a.action}>{labelForProximateAction(a.action)}</span>
                          <span className="text-muted-foreground">
                            ({a.subject_kind.replace('proximate_', '')} #{a.subject_id})
                          </span>
                          <span className="text-muted-foreground ms-auto truncate">{a.actor_email}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()
            )}
          </Card>
          )}

          {/* Blue Nile intake (2026-07) — the round's evidence pack
              (needs assessments, site factsheets, cluster alerts) and
              the panel roster, both formerly loose files. OB-only. */}
          {isOperator && roundId && (
            <ProximateAttachmentsPanel
              subjectKind="round"
              subjectId={parseInt(roundId, 10)}
              title="Evidence pack"
            />
          )}
          {isOperator && roundId && (
            <PanelRosterPanel roundId={parseInt(roundId, 10)} />
          )}
        </div>
      </PageMain>
    </PageShell>
  );
}
