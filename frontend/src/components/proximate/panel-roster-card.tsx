'use client';

/**
 * Panel members — the people who endorse partners and decide awards.
 *
 * Proximate has no separate "endorser" role. Endorsement is a step, and
 * panel members are who perform it. So this one surface covers the whole
 * arc: propose a member, run due diligence on them, seat them, and hand
 * them the WhatsApp link they will actually use.
 *
 * Two deliberate frictions:
 *  - You cannot seat a member before their checks pass. They decide who
 *    gets public money; the vetting comes first.
 *  - Standing someone down revokes their link in the same action, so
 *    "off the panel" and "can still open the form" cannot drift apart.
 */

import { useEffect, useState } from 'react';
import {
  Loader2, UserPlus, ShieldCheck, Link2, Copy, Check, X, MapPin,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/lib/hooks/use-translation';

interface Member {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  location: string | null;
  rationale: string | null;
  expertise: string | null;
  network_represented: string | null;
  status: string;
  language: string;
  sanctions_status: string | null;
  media_status: string | null;
  social_status: string | null;
  other_checks: { label: string; result: string; note?: string }[];
  dd_verdict: string | null;
  dd_complete: boolean;
  dd_passed: boolean;
  can_be_confirmed: boolean;
  tor_accepted: boolean;
  coi_declared: boolean;
  confidentiality_accepted: boolean;
  has_link: boolean;
  public_token?: string | null;
}

interface Summary {
  total: number;
  confirmed: number;
  awaiting_dd: number;
  dd_failed: number;
  localities_represented: string[];
  locality_count: number;
}

const STATUS_LABEL: Record<string, { en: string; k: string }> = {
  candidate: { en: 'Proposed', k: 'proximate.cycle.st_candidate' },
  dd_in_progress: { en: 'Checks running', k: 'proximate.cycle.st_dd_in_progress' },
  dd_passed: { en: 'Checks passed', k: 'proximate.cycle.st_dd_passed' },
  dd_failed: { en: 'Checks failed', k: 'proximate.cycle.st_dd_failed' },
  confirmed: { en: 'On the panel', k: 'proximate.cycle.st_confirmed' },
  stood_down: { en: 'Stood down', k: 'proximate.cycle.st_stood_down' },
};

const CHECK_RESULTS = [
  { key: 'clear', label: 'Nothing found', k: 'proximate.cycle.res_clear' },
  { key: 'possible_match', label: 'Possible match', k: 'proximate.cycle.res_possible' },
  { key: 'confirmed_match', label: 'Confirmed match', k: 'proximate.cycle.res_confirmed' },
];

export function PanelRosterCard({ roundId, canEdit }: { roundId: number; canEdit: boolean }) {
  const { t } = useTranslation();
  const [members, setMembers] = useState<Member[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  async function load() {
    try {
      const r = await api.get<{ success: boolean; members: Member[]; summary: Summary }>(
        `/api/proximate/rounds/${roundId}/panel`,
      );
      if (r?.success) { setMembers(r.members); setSummary(r.summary); }
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

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">{t('proximate.cycle.panel_title') || 'Panel members'}</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t('proximate.cycle.panel_blurb')
                || 'They endorse partners and decide the awards. Each one is vetted before they are seated.'}
            </p>
          </div>
          {canEdit && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <UserPlus className="w-3.5 h-3.5 mr-1.5" /> {t('proximate.cycle.add_member') || 'Add member'}
            </Button>
          )}
        </div>

        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">{t('proximate.cycle.on_panel') || 'On the panel'}</p>
              <p className="font-semibold">{summary.confirmed}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('proximate.cycle.awaiting_checks') || 'Awaiting checks'}</p>
              <p className="font-semibold">{summary.awaiting_dd}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('proximate.cycle.checks_failed') || 'Checks failed'}</p>
              <p className="font-semibold">{summary.dd_failed}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('proximate.cycle.localities_represented') || 'Localities represented'}</p>
              <p className="font-semibold">{summary.locality_count}</p>
            </div>
          </div>
        )}
        {summary && summary.confirmed > 0 && summary.locality_count < 2 && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {t('proximate.cycle.one_locality_warn')
              || 'Everyone seated so far is from the same locality. The panel is meant to span localities and networks.'}
          </p>
        )}
      </Card>

      {members.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          {t('proximate.cycle.panel_empty')
            || 'No panel members yet. The cycle starts by finding people from the area with local knowledge and standing.'}
        </Card>
      )}

      {members.map((m) => (
        <MemberRow
          key={m.id}
          m={m}
          canEdit={canEdit}
          open={openId === m.id}
          onToggle={() => setOpenId(openId === m.id ? null : m.id)}
          onChanged={load}
        />
      ))}

      {adding && (
        <AddMemberDialog
          roundId={roundId}
          onClose={() => setAdding(false)}
          onAdded={() => { setAdding(false); load(); }}
        />
      )}
    </div>
  );
}

function MemberRow({ m, canEdit, open, onToggle, onChanged }: {
  m: Member; canEdit: boolean; open: boolean;
  onToggle: () => void; onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [portal, setPortal] = useState('');
  const [err, setErr] = useState('');

  async function check(kind: string, result: string, label?: string) {
    setBusy(true);
    try {
      await api.post(`/api/proximate/panel/${m.id}/checks`, { kind, result, label });
      onChanged();
    } catch { /* surfaced by the reload */ }
    setBusy(false);
  }

  async function verdict(v: string) {
    setBusy(true);
    try {
      await api.post(`/api/proximate/panel/${m.id}/verdict`, { verdict: v });
      onChanged();
    } catch { /* ignore */ }
    setBusy(false);
  }

  async function confirm() {
    setBusy(true);
    setErr('');
    try {
      const r = await api.post<{ success: boolean; portal_url?: string; error?: string }>(
        `/api/proximate/panel/${m.id}/confirm`, {},
      );
      if (r?.success) { setPortal(r.portal_url || ''); onChanged(); }
      else setErr(r?.error || 'Could not seat this member.');
    } catch (e) {
      setErr((e as { message?: string })?.message || 'Could not seat this member.');
    }
    setBusy(false);
  }

  const tone = m.status === 'confirmed'
    ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200'
    : m.status === 'dd_failed'
      ? 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200'
      : 'bg-muted text-muted-foreground';

  return (
    <Card className="p-4">
      <button type="button" onClick={onToggle} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium truncate">{m.name}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              {m.location && <><MapPin className="w-3 h-3" />{m.location}</>}
              {m.network_represented && <span>· {m.network_represented}</span>}
            </p>
          </div>
          <span className={`text-xs rounded-full px-2 py-0.5 whitespace-nowrap ${tone}`}>
            {STATUS_LABEL[m.status]
              ? (t(STATUS_LABEL[m.status].k) || STATUS_LABEL[m.status].en)
              : m.status}
          </span>
        </div>
      </button>

      {open && (
        <div className="mt-4 pt-4 border-t border-border space-y-4">
          {m.rationale && (
            <div className="text-sm">
              <p className="text-xs text-muted-foreground">{t('proximate.cycle.why_proposed') || 'Why they were proposed'}</p>
              <p>{m.rationale}</p>
            </div>
          )}

          <div>
            <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> {t('proximate.cycle.dd_on_member') || 'Due diligence on this member'}
            </p>
            <div className="space-y-2">
              <CheckRow label={t('proximate.cycle.chk_sanctions') || 'Sanctions'} value={m.sanctions_status}
                        canEdit={canEdit && m.status !== 'confirmed'} busy={busy}
                        onSet={(r) => check('sanctions', r)} />
              <CheckRow label={t('proximate.cycle.chk_media') || 'Media / reputation'} value={m.media_status}
                        canEdit={canEdit && m.status !== 'confirmed'} busy={busy}
                        onSet={(r) => check('media', r)} />
              <CheckRow label={t('proximate.cycle.chk_social') || 'Social media'} value={m.social_status}
                        canEdit={canEdit && m.status !== 'confirmed'} busy={busy}
                        onSet={(r) => check('social', r)} />
              {m.other_checks.map((c, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{c.label}</span>
                  <span>{(() => { const r = CHECK_RESULTS.find((x) => x.key === c.result);
                    return r ? (t(r.k) || r.label) : c.result; })()}</span>
                </div>
              ))}
            </div>
            {canEdit && m.status !== 'confirmed' && (
              <OtherCheck onAdd={(label, result) => check('other', result, label)} busy={busy} />
            )}
          </div>

          {canEdit && m.dd_complete === false && m.sanctions_status && m.media_status && (
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-muted-foreground self-center">{t('proximate.cycle.overall_verdict') || 'Overall verdict'}:</span>
              {['clear', 'low', 'medium', 'high', 'rejected'].map((v) => (
                <Button key={v} size="sm" variant="outline" disabled={busy}
                        onClick={() => verdict(v)}>
                  {v}
                </Button>
              ))}
            </div>
          )}
          {m.dd_verdict && (
            <p className="text-sm">
              <span className="text-muted-foreground">{t('proximate.cycle.verdict') || 'Verdict'}: </span>
              <Badge variant="outline">{m.dd_verdict}</Badge>
            </p>
          )}

          {err && <p className="text-sm text-red-600">{err}</p>}

          {canEdit && m.status !== 'confirmed' && m.status !== 'stood_down' && (
            <div>
              <Button size="sm" disabled={busy || !m.can_be_confirmed} onClick={confirm}>
                {t('proximate.cycle.seat_member') || 'Seat on the panel'}
              </Button>
              {!m.can_be_confirmed && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  {t('proximate.cycle.seat_blocked')
                    || 'Run the checks and record a verdict first. A panel member decides who receives public money.'}
                </p>
              )}
            </div>
          )}

          {(portal || (m.status === 'confirmed' && m.public_token)) && (
            <div className="rounded-md border border-border p-3 space-y-2">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5" />
                {t('proximate.cycle.their_link') || 'Their link — no login, no app. Send it on WhatsApp.'}
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-muted rounded px-2 py-1.5 truncate select-all">
                  {portal || `${window.location.origin}/proximate-endorse?t=${m.public_token}`}
                </code>
                <Button size="sm" variant="outline" onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      portal || `${window.location.origin}/proximate-endorse?t=${m.public_token}`,
                    );
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  } catch { /* selectable anyway */ }
                }}>
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function CheckRow({ label, value, canEdit, busy, onSet }: {
  label: string; value: string | null; canEdit: boolean; busy: boolean;
  onSet: (result: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {value ? (
        <span>{(() => { const r = CHECK_RESULTS.find((x) => x.key === value);
          return r ? (t(r.k) || r.label) : value; })()}</span>
      ) : canEdit ? (
        <div className="flex gap-1">
          {CHECK_RESULTS.map((r) => (
            <Button key={r.key} size="sm" variant="outline" disabled={busy}
                    onClick={() => onSet(r.key)} className="text-xs h-7">
              {t(r.k) || r.label}
            </Button>
          ))}
        </div>
      ) : (
        <span className="text-muted-foreground">{t('proximate.cycle.not_checked') || 'Not checked'}</span>
      )}
    </div>
  );
}

function OtherCheck({ onAdd, busy }: { onAdd: (l: string, r: string) => void; busy: boolean }) {
  const { t } = useTranslation();
  const [label, setLabel] = useState('');
  const [result, setResult] = useState('clear');
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <label className="text-sm flex-1 min-w-[12rem]">
        <span className="text-xs text-muted-foreground">
          {t('proximate.cycle.other_check_label') || 'Anything else you checked'}
        </span>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t('proximate.cycle.other_check_ph') || 'Reference call, radio interview, WhatsApp group…'}
          className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
        />
      </label>
      <select
        value={result}
        onChange={(e) => setResult(e.target.value)}
        className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
      >
        {CHECK_RESULTS.map((r) => <option key={r.key} value={r.key}>{t(r.k) || r.label}</option>)}
      </select>
      <Button
        size="sm" variant="outline" disabled={busy || !label.trim()}
        onClick={() => { onAdd(label.trim(), result); setLabel(''); }}
      >
        {t('proximate.cycle.record_check') || 'Record'}
      </Button>
    </div>
  );
}

function AddMemberDialog({ roundId, onClose, onAdded }: {
  roundId: number; onClose: () => void; onAdded: () => void;
}) {
  const { t } = useTranslation();
  const [f, setF] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    setBusy(true); setErr('');
    try {
      const r = await api.post<{ success: boolean; error?: string }>(
        `/api/proximate/rounds/${roundId}/panel`, f,
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
      <Card className="w-full max-w-lg p-5 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{t('proximate.cycle.add_panel_member') || 'Add a panel member'}</h3>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        {[
          ['name', t('proximate.cycle.full_name') || 'Full name'],
          ['location', t('proximate.cycle.locality') || 'Locality'],
          ['phone', t('proximate.cycle.phone') || 'Phone / WhatsApp'],
          ['email', t('proximate.cycle.email_opt') || 'Email (optional)'],
          ['network_represented',
            t('proximate.cycle.network_represented') || 'Network or community they represent'],
          ['expertise', t('proximate.cycle.expertise') || 'Area of expertise'],
          ['recommended_by', t('proximate.cycle.recommended_by') || 'Recommended by'],
        ].map(([k, label]) => (
          <label key={k} className="block text-sm">
            <span className="text-xs text-muted-foreground">{label}</span>
            <input
              value={f[k] || ''}
              onChange={(e) => setF({ ...f, [k]: e.target.value })}
              className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
            />
          </label>
        ))}
        <label className="block text-sm">
          <span className="text-xs text-muted-foreground">{t('proximate.cycle.why_person') || 'Why this person'}</span>
          <textarea
            rows={2}
            value={f.rationale || ''}
            onChange={(e) => setF({ ...f, rationale: e.target.value })}
            className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
          />
        </label>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>{t('proximate.cycle.cancel') || 'Cancel'}</Button>
          <Button size="sm" onClick={submit} disabled={busy || !(f.name || '').trim()}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (t('proximate.cycle.add') || 'Add')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
