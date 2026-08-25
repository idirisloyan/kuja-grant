'use client';

/**
 * Award register — the panel's decisions, and what follows from them.
 *
 * This replaces the spreadsheet that used to be screen-shared during the
 * awarding meeting. Three things it is deliberate about:
 *
 *  - Requested, recommended and approved are three different numbers.
 *    "We asked for X and got Y" is the question both partners and donors
 *    ask afterwards, so all three are kept.
 *
 *  - Awards are checked against what is actually disbursable, not the
 *    donor envelope. Over-committing is refused with the arithmetic
 *    shown, not silently clamped.
 *
 *  - A decision the secretariat recorded on the panel's behalf is
 *    flagged until something stands behind it. That is allowed — a
 *    meeting on a bad line still happened — but it cannot pass as a
 *    panel decision without a meeting, minutes or a confirmation.
 */

import { useEffect, useState } from 'react';
import {
  Loader2, Gavel, FileSignature, AlertTriangle, Plus, X, ExternalLink,
  ChevronDown,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/lib/hooks/use-translation';

interface Contract {
  id: number;
  status: string;
  pandadoc_url: string | null;
  is_complete: boolean;
  official_name_ar: string | null;
  signatory_name: string | null;
  // R-04 — partner-facing signing
  partner_sign_url: string | null;
  partner_signed_name: string | null;
  partner_signed_at: string | null;
}

interface Award {
  id: number;
  partner_id: number;
  partner_name: string | null;
  meeting_id: number | null;
  requested_amount_usd: number | null;
  recommended_amount_usd: number | null;
  approved_amount_usd: number | null;
  amount_reason: string | null;
  decision: string;
  decision_method: string | null;
  panel_comments: string | null;
  confirmation_count: number;
  decision_is_attributable: boolean;
  contract: Contract | null;
}

interface Money {
  envelope_usd: number; admin_overhead_usd: number; disbursable_usd: number;
  awarded_usd: number; uncommitted_usd: number;
}

const DECISIONS = [
  { key: 'awarded', label: 'Fund', k: 'proximate.cycle.dec_awarded' },
  { key: 'not_awarded', label: 'Do not fund', k: 'proximate.cycle.dec_not_awarded' },
  { key: 'clarification', label: 'Request clarification',
    k: 'proximate.cycle.dec_clarification' },
  { key: 'deferred', label: 'Defer', k: 'proximate.cycle.dec_deferred' },
];

const METHODS = [
  { key: 'consensus', label: 'Consensus', k: 'proximate.cycle.m_consensus' },
  { key: 'no_objection', label: 'No objection', k: 'proximate.cycle.m_no_objection' },
  { key: 'recorded_vote', label: 'Recorded vote', k: 'proximate.cycle.m_recorded_vote' },
  { key: 'chair_confirmation', label: 'Chair confirmation', k: 'proximate.cycle.m_chair' },
  { key: 'secretariat_recorded', label: 'Recorded by secretariat',
    k: 'proximate.cycle.m_secretariat' },
];

const CONTRACT_STATUSES = [
  'drafting', 'sent', 'partner_signed', 'adeso_signed', 'completed', 'void',
];

function usd(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function AwardRegisterCard({ roundId, canEdit }: { roundId: number; canEdit: boolean }) {
  const { t } = useTranslation();
  const [awards, setAwards] = useState<Award[]>([]);
  const [money, setMoney] = useState<Money | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  async function load() {
    try {
      const r = await api.get<{ success: boolean; awards: Award[]; money: Money }>(
        `/api/proximate/rounds/${roundId}/awards`,
      );
      if (r?.success) { setAwards(r.awards); setMoney(r.money); }
    } catch { /* card stays empty */ }
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [roundId]);

  if (loading) {
    return (
      <Card className="p-5 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> {t('proximate.cycle.loading') || 'Loading…'}
      </Card>
    );
  }

  const unattributable = awards.filter(
    (a) => a.decision === 'awarded' && !a.decision_is_attributable,
  );

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Gavel className="w-4 h-4 text-muted-foreground" /> {t('proximate.cycle.award_register') || 'Award register'}
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t('proximate.cycle.award_blurb')
                || 'Generated from the panel’s decisions. Nothing to keep in step by hand.'}
            </p>
          </div>
          {canEdit && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> {t('proximate.cycle.add_partner') || 'Add partner'}
            </Button>
          )}
        </div>

        {money && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">{t('proximate.cycle.disbursable') || 'Available for partners'}</p>
              <p className="font-semibold tabular-nums">{usd(money.disbursable_usd)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('proximate.cycle.awarded') || 'Awarded'}</p>
              <p className="font-semibold tabular-nums">{usd(money.awarded_usd)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('proximate.cycle.remaining') || 'Remaining'}</p>
              <p className={`font-semibold tabular-nums ${
                money.uncommitted_usd < 0 ? 'text-red-600 dark:text-red-400' : ''
              }`}>
                {usd(money.uncommitted_usd)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('proximate.cycle.decisions_recorded') || 'Decisions recorded'}</p>
              <p className="font-semibold tabular-nums">
                {awards.filter((a) => a.decision !== 'pending').length}/{awards.length}
              </p>
            </div>
          </div>
        )}

        {unattributable.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3">
            <p className="text-xs text-amber-900 dark:text-amber-200 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {(t('proximate.cycle.unattributable_warn')
                || '{n} award(s) recorded by the secretariat with nothing behind them. Link the meeting, attach the minutes, or record a panel confirmation — otherwise the panel cannot be shown to have made the decision.')
                .replace('{n}', String(unattributable.length))}
            </p>
          </div>
        )}
      </Card>

      {awards.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          {t('proximate.cycle.awards_empty')
            || 'No awards yet. Add the shortlisted partners, then record what the panel decided for each.'}
        </Card>
      )}

      {awards.map((a) => (
        <AwardRow
          key={a.id} a={a} canEdit={canEdit}
          open={openId === a.id}
          onToggle={() => setOpenId(openId === a.id ? null : a.id)}
          onChanged={load}
        />
      ))}

      {adding && (
        <AddAwardDialog
          roundId={roundId}
          onClose={() => setAdding(false)}
          onAdded={() => { setAdding(false); load(); }}
        />
      )}
    </div>
  );
}

function AwardRow({ a, canEdit, open, onToggle, onChanged }: {
  a: Award; canEdit: boolean; open: boolean;
  onToggle: () => void; onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const [approved, setApproved] = useState(a.approved_amount_usd?.toString() || '');
  const [reason, setReason] = useState(a.amount_reason || '');
  const [method, setMethod] = useState(a.decision_method || 'consensus');

  async function decide(decision: string) {
    setBusy(true); setErr('');
    try {
      const r = await api.patch<{ success: boolean; error?: string; warning?: string }>(
        `/api/proximate/awards/${a.id}`,
        {
          decision,
          decision_method: method,
          approved_amount_usd: decision === 'awarded' ? approved : null,
          amount_reason: reason,
        },
      );
      if (r?.success) onChanged();
      else setErr(r?.error || 'Could not record the decision.');
    } catch (e) {
      setErr((e as { message?: string })?.message || 'Could not record the decision.');
    }
    setBusy(false);
  }

  async function openContract() {
    setBusy(true); setErr('');
    try {
      const r = await api.post<{ success: boolean; error?: string }>(
        `/api/proximate/awards/${a.id}/contract`, {},
      );
      if (r?.success) onChanged();
      else setErr(r?.error || 'Could not open a contract.');
    } catch (e) {
      setErr((e as { message?: string })?.message || 'Could not open a contract.');
    }
    setBusy(false);
  }

  async function setContractStatus(status: string) {
    if (!a.contract) return;
    setBusy(true); setErr('');
    try {
      await api.patch(`/api/proximate/contracts/${a.contract.id}`, { status });
      onChanged();
    } catch (e) {
      // R-04: the server now refuses to record the partner's signature by
      // hand, and refuses adeso_signed/completed before the partner has
      // signed — surface that instead of silently no-op'ing.
      setErr((e as { message?: string })?.message || 'Could not update the agreement.');
    }
    setBusy(false);
  }

  const tone = a.decision === 'awarded'
    ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200'
    : a.decision === 'not_awarded'
      ? 'bg-muted text-muted-foreground'
      : a.decision === 'pending'
        ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'
        : 'bg-muted text-muted-foreground';

  return (
    <Card className={`p-4 transition-colors ${open ? 'ring-1 ring-[hsl(var(--kuja-clay))] border-[hsl(var(--kuja-clay))]' : ''}`}>
      <button type="button" onClick={onToggle} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium truncate">
              {a.partner_name || `Partner #${a.partner_id}`}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('proximate.cycle.requested') || 'Requested'} {usd(a.requested_amount_usd)}
              {a.approved_amount_usd
                ? ` · ${t('proximate.cycle.approved') || 'Approved'} ${usd(a.approved_amount_usd)}`
                : ''}
            </p>
            {/* OB-010 — the decision UI opens INLINE (no modal); prompt for it
                on undecided rows so the OB knows where to record the decision. */}
            {canEdit && a.decision === 'pending' && !open && (
              <p className="text-[11px] font-medium text-[hsl(var(--kuja-clay))] mt-1">
                {t('proximate.cycle.record_decision_hint') || 'Tap to record the panel decision'}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!a.decision_is_attributable && a.decision === 'awarded' && (
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            )}
            <span className={`text-xs rounded-full px-2 py-0.5 ${tone}`}>
              {(() => { const d = DECISIONS.find((x) => x.key === a.decision);
                if (d) return t(d.k) || d.label;
                return a.decision === 'pending'
                  ? (t('proximate.cycle.dec_pending') || 'Not yet decided') : a.decision; })()}
            </span>
            <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
          </div>
        </div>
      </button>

      {open && (
        <div className="mt-4 pt-4 border-t border-border space-y-4">
          {canEdit && (
            <div className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="text-xs text-muted-foreground">{t('proximate.cycle.approved_amount') || 'Approved amount (USD)'}</span>
                  <input
                    value={approved}
                    onChange={(e) => setApproved(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-xs text-muted-foreground">{t('proximate.cycle.how_decided') || 'How the decision was made'}</span>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                  >
                    {METHODS.map((m) => (
                      <option key={m.key} value={m.key}>{t(m.k) || m.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-sm">
                <span className="text-xs text-muted-foreground">
                  {t('proximate.cycle.why_amount') || 'Why this amount'}
                </span>
                <textarea
                  rows={2} value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
                />
              </label>
              {method === 'secretariat_recorded' && (
                <p className="text-xs text-muted-foreground">
                  {t('proximate.cycle.secretariat_note')
                    || 'Recording on the panel’s behalf is allowed — meetings happen on bad lines. Link the meeting or attach the minutes so the decision can be traced back to the panel.'}
                </p>
              )}
              {err && <p className="text-sm text-red-600">{err}</p>}
              <div className="flex flex-wrap gap-2">
                {DECISIONS.map((d) => (
                  <Button
                    key={d.key} size="sm"
                    variant={d.key === 'awarded' ? 'default' : 'outline'}
                    disabled={busy} onClick={() => decide(d.key)}
                  >
                    {t(d.k) || d.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {a.panel_comments && (
            <div className="text-sm">
              <p className="text-xs text-muted-foreground">{t('proximate.cycle.panel_comments') || 'Panel comments'}</p>
              <p>{a.panel_comments}</p>
            </div>
          )}

          {/* ---- Contract ------------------------------------------- */}
          {a.decision === 'awarded' && (
            <div className="pt-3 border-t border-border space-y-2">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <FileSignature className="w-3.5 h-3.5" /> {t('proximate.cycle.agreement') || 'Agreement'}
              </p>
              {!a.contract ? (
                <div>
                  <Button size="sm" variant="outline" disabled={busy} onClick={openContract}>
                    {t('proximate.cycle.open_agreement') || 'Open agreement'}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {t('proximate.cycle.contract_gate_note')
                      || 'Funds cannot be released until this is signed by both sides.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">{a.contract.status}</Badge>
                    {a.contract.pandadoc_url && (
                      <a
                        href={a.contract.pandadoc_url}
                        target="_blank" rel="noopener noreferrer"
                        className="text-xs text-[hsl(var(--kuja-clay))] inline-flex items-center gap-1"
                      >
                        {t('proximate.cycle.open_pandadoc') || 'Open in PandaDoc'} <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {a.contract.partner_signed_name && (
                      <span className="text-[11px] text-emerald-700">
                        Partner signed: {a.contract.partner_signed_name}
                      </span>
                    )}
                  </div>
                  {/* R-04 — the partner signs via their OWN tokenised link, so
                      the signature is an independent identity, not an OB
                      self-attestation. The OB shares the link; they cannot mark
                      the partner signature themselves (server refuses it). */}
                  {canEdit && a.contract.partner_sign_url && !a.contract.partner_signed_at && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        size="sm" variant="outline" className="text-xs h-7" disabled={busy}
                        onClick={() => {
                          const c = a.contract;
                          if (!c?.partner_sign_url) return;
                          const url = `${window.location.origin}${c.partner_sign_url}`;
                          navigator.clipboard?.writeText(url).then(
                            () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
                            () => {},
                          );
                        }}
                      >
                        {copied ? t('proximate.award.link_copied') : t('proximate.award.copy_sign_link')}
                      </Button>
                      <span className="text-[11px] text-muted-foreground">
                        {t('proximate.award.share_to_sign')}
                      </span>
                    </div>
                  )}
                  {canEdit && (
                    <div className="flex flex-wrap gap-1.5">
                      {/* partner_signed is intentionally absent — only the
                          partner can reach that state via their link. */}
                      {CONTRACT_STATUSES.filter((s) => s !== 'partner_signed').map((s) => (
                        <Button
                          key={s} size="sm" variant="outline" disabled={busy}
                          className="text-xs h-7"
                          onClick={() => setContractStatus(s)}
                        >
                          {s.replace(/_/g, ' ')}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function AddAwardDialog({ roundId, onClose, onAdded }: {
  roundId: number; onClose: () => void; onAdded: () => void;
}) {
  const { t } = useTranslation();
  const [partners, setPartners] = useState<{ id: number; name: string }[]>([]);
  const [partnerId, setPartnerId] = useState<number | ''>('');
  const [requested, setRequested] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get<{ partners?: { id: number; name: string }[] }>(
          '/api/proximate/partners?limit=200',
        );
        setPartners(r?.partners || []);
      } catch { setPartners([]); }
    })();
  }, []);

  async function submit() {
    setBusy(true); setErr('');
    try {
      const r = await api.post<{ success: boolean; error?: string }>(
        `/api/proximate/rounds/${roundId}/awards`,
        { partner_id: partnerId, requested_amount_usd: requested },
      );
      if (r?.success) onAdded();
      else setErr(r?.error || 'Could not add.');
    } catch (e) {
      setErr((e as { message?: string })?.message || 'Could not add.');
    }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{t('proximate.cycle.add_to_register') || 'Add a partner to the register'}</h3>
          <button type="button" onClick={onClose} aria-label={t('proximate.award.close')}>
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <label className="block text-sm">
          <span className="text-xs text-muted-foreground">{t('proximate.cycle.partner') || 'Partner'}</span>
          <select
            value={partnerId}
            onChange={(e) => setPartnerId(e.target.value ? Number(e.target.value) : '')}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">{t('proximate.cycle.choose') || 'Choose…'}</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-xs text-muted-foreground">{t('proximate.cycle.amount_requested') || 'Amount requested (USD)'}</span>
          <input
            value={requested}
            onChange={(e) => setRequested(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
          />
        </label>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>{t('proximate.cycle.cancel') || 'Cancel'}</Button>
          <Button size="sm" onClick={submit} disabled={busy || !partnerId}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (t('proximate.cycle.add') || 'Add')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
