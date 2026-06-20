'use client';

/**
 * /admin/declarations/<id> — Phase 36 (May 2026).
 *
 * Multi-sig workflow page. Shows:
 *   - Header with status, SLA timestamps, signed/total counter
 *   - Summary block (title + crisis_type + country + severity + summary_md)
 *   - Signers panel (signature status, sign/recuse/reject controls for
 *     the signer themselves, manual_admin override for admins)
 *   - Documents list
 *   - Drafter actions (submit, cancel)
 *
 * Self-sign UX:
 *   - If TOTP is enrolled: prompt for 6-digit code, then call /sign.
 *   - If not enrolled: admin attestation via manual_admin (admin only).
 */

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import {
  useDeclaration,
  useObRoster,
  type EmergencyDeclaration,
  type ObRosterMember,
} from '@/lib/hooks/use-api';
import { useRouteId } from '@/lib/hooks/use-route-id';
import { useAuthStore } from '@/stores/auth-store';
import {
  CheckCircle2, XCircle, AlertCircle, Loader2,
  Lock, Clock, FileText, Sparkles, Send, Rocket, UserPlus, Search, Trash2,
  Siren, ShieldCheck,
} from 'lucide-react';
import { DeclarationLedgerPanel } from '@/components/declarations/declaration-ledger-panel';
import { DeclarationStepper } from '@/components/declarations/declaration-stepper';
import { WaitingFor, type Actor } from '@/components/shared/waiting-for';
import {
  PageShell, PageBack, PageHeader, PageMain, PageDetail, PageDetailSection,
} from '@/components/layout/page-shell';

// Human-readable status label + tone for the page header pill.
// Maps internal state to workflow language per design principles.
function describeStatus(d: EmergencyDeclaration): { label: string; tone: 'muted' | 'warn' | 'good' | 'bad' | 'accent' } {
  if (d.status === 'cancelled') return { label: 'Cancelled', tone: 'bad' };
  if (d.status === 'closed')    return { label: 'Closed', tone: 'muted' };
  if (d.status === 'signed_active') {
    return d.applicants_notified_at
      ? { label: 'Applications open', tone: 'good' }
      : { label: 'Ready to release', tone: 'accent' };
  }
  if (d.status === 'in_review') {
    const remaining = Math.max(0, d.required_signer_count - d.signed_count);
    return remaining === 0
      ? { label: 'Signatures complete', tone: 'good' }
      : { label: `Waiting for ${remaining} signature${remaining === 1 ? '' : 's'}`, tone: 'warn' };
  }
  // draft
  return { label: 'Draft', tone: 'muted' };
}

export default function DeclarationDetailClient() {
  const id = useRouteId('declarations');
  const viewer = useAuthStore((s) => s.user);
  const { data, isLoading, mutate } = useDeclaration(id);
  const d = data?.declaration;

  if (viewer && viewer.role !== 'admin') {
    return (
      <div className="p-6 text-sm">
        <p className="text-destructive">Only platform admins can view this page.</p>
      </div>
    );
  }

  if (id == null || isLoading || !d) {
    return (
      <div className="space-y-3">
        <div className="kuja-shimmer h-10 w-72 rounded" />
        <div className="kuja-shimmer h-32 rounded" />
      </div>
    );
  }

  const statusPill = describeStatus(d);
  const hasSla = !!(
    d.declared_at || d.applications_open_at || d.applications_close_at ||
    d.decision_at || d.applicants_notified_at
  );

  return (
    <PageShell>
      <PageBack href="/admin/declarations" label="Back to declarations" />

      <PageHeader
        title={d.title}
        icon={Siren}
        status={statusPill}
        meta={[
          ...(d.country      ? [{ label: d.country }]                                  : []),
          ...(d.crisis_type  ? [{ label: d.crisis_type }]                              : []),
          ...(d.severity     ? [{ label: `severity: ${d.severity}` }]                  : []),
          ...(d.proposed_total_amount
            ? [{ label: `proposed: ${d.proposed_total_amount.toLocaleString()}` }]
            : []),
        ]}
        primaryAction={<DrafterActions d={d} onChange={mutate} />}
      />

      {/* Release applications — the highest-priority action when active and
          NGOs not yet notified. Rendered as its own attention-tier banner. */}
      {d.status === 'signed_active' && (
        <ReleaseApplicationsPanel d={d} onChange={mutate} />
      )}

      {/* Phase 45 stepper carries the live counter + count-aware "Next:" hint.
          This IS the page's attention surface for declarations. */}
      <DeclarationStepper d={d} />

      {/* Phase 98.1 — humanise the wait. When signatures are pending, show
          named signers and exactly who's holding things up so the OB chair
          can chase the right person instead of staring at a counter. */}
      {(d.status === 'draft' || d.status === 'in_review') &&
        (d.signatures ?? []).length > 0 &&
        (d.signed_count < d.required_signer_count) && (
        <WaitingFor
          what={`${d.required_signer_count - d.signed_count} signature${
            d.required_signer_count - d.signed_count === 1 ? '' : 's'
          }`}
          actors={
            (d.signatures ?? []).map<Actor>(s => ({
              name: s.signer_name || s.signer_email || `User #${s.signer_user_id}`,
              status:
                s.status === 'signed' ? 'done' :
                s.status === 'recused' || s.status === 'rejected' ? 'declined' :
                'pending',
              at: s.signed_at,
              role: s.signer_org_name || undefined,
            }))
          }
          className="mb-3"
        />
      )}

      <PageMain>
        {/* Context: summary + evidence anchor */}
        <div className="border border-border rounded-lg bg-card p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-sm">Context</h2>
            {d.status === 'draft' && (
              <AIDraftAssistButton declarationId={d.id} onUpdate={mutate} />
            )}
          </div>
          {d.summary_md ? (
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{d.summary_md}</p>
          ) : (
            <p className="text-xs text-muted-foreground italic">No summary yet.</p>
          )}
          {d.evidence_row_id && (
            <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-2 border-t border-border">
              <FileText className="w-3 h-3" />
              Evidence: Crisis Monitoring row #{d.evidence_row_id}
              {d.evidence_report_id && <> · Report #{d.evidence_report_id}</>}
            </div>
          )}
        </div>

        {/* Committee — identity-resolved rows + inline OB picker */}
        <section className="border border-border rounded-lg bg-card p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold text-sm">Committee (Oversight Body signers)</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Per IKEA Concept Note procedure — OB members sign with COI affirmation
                before the declaration goes active.
              </p>
            </div>
            {d.status === 'draft' && (
              <div className="text-[11px] text-muted-foreground">
                <strong className="text-foreground">{(d.signatures ?? []).length}</strong>{' '}
                of {d.required_signer_count} slots filled
              </div>
            )}
          </div>

          {(d.signatures ?? []).length === 0 && (
            <div className="text-xs text-muted-foreground italic">
              No committee members assigned yet. Pick from the Oversight Body roster below.
            </div>
          )}
          <ul className="space-y-2">
            {(d.signatures ?? []).map((s) => (
              <SignerRow
                key={s.id}
                declarationId={d.id}
                decl={d}
                sig={s}
                onChange={mutate}
              />
            ))}
          </ul>

          {/* Inline OB picker — only while still draftable */}
          {d.status === 'draft' && (
            <AddSignerPanel d={d} onChange={mutate} />
          )}
        </section>

        {/* Documents — render only if any are attached */}
        {(d.documents ?? []).length > 0 && (
          <section className="border border-border rounded-lg bg-card p-5 space-y-3">
            <h2 className="font-semibold text-sm">Supporting documents</h2>
            <ul className="space-y-1.5 text-xs">
              {(d.documents ?? []).map((doc) => (
                <li key={doc.id} className="flex items-center gap-2">
                  <FileText className="w-3 h-3 text-muted-foreground" />
                  <span className="capitalize">{doc.kind.replace('_', ' ')}</span>
                  {doc.note && <span className="text-muted-foreground italic">— {doc.note}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </PageMain>

      {/* Supporting detail — collapsible by default. Audit trail, SLA
          timestamps, and the activation anchor live here so the page leads
          with action, not records. */}
      <PageDetail>
        <PageDetailSection
          title="Process timeline"
          icon={Clock}
          defaultOpen={false}
        >
          <DeclarationLedgerPanel declarationId={d.id} />
        </PageDetailSection>
        {hasSla && (
          <PageDetailSection
            title="SLA milestones"
            icon={Clock}
            defaultOpen={false}
          >
            <SlaPanel d={d} />
          </PageDetailSection>
        )}
        {d.signed_active_audit_id && (
          <PageDetailSection
            title="Audit anchor"
            icon={ShieldCheck}
            defaultOpen={false}
          >
            <div className="text-xs text-muted-foreground">
              Activation audit-chain anchor:{' '}
              <span className="font-mono">#{d.signed_active_audit_id}</span>
            </div>
          </PageDetailSection>
        )}
      </PageDetail>
    </PageShell>
  );
}

function SlaPanel({ d }: { d: EmergencyDeclaration }) {
  const items = [
    { label: 'Declared', value: d.declared_at },
    { label: 'Apps open', value: d.applications_open_at },
    { label: 'Apps close', value: d.applications_close_at },
    { label: 'Decision', value: d.decision_at },
    { label: 'Notified', value: d.applicants_notified_at },
  ];
  const hasAny = items.some((i) => i.value);
  if (!hasAny) return null;
  // Renders inside <PageDetailSection> which already provides the card chrome.
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10px]">
      {items.map((i) => (
        <div key={i.label} className="space-y-0.5">
          <div className="uppercase tracking-wide text-muted-foreground">{i.label}</div>
          <div className="font-medium">
            {i.value ? (
              <span className="text-foreground">
                <Clock className="w-3 h-3 inline mr-1" />
                {new Date(i.value).toLocaleString()}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function DrafterActions({ d, onChange }: { d: EmergencyDeclaration; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  async function submit() {
    setBusy(true);
    try {
      await api.post(`/declarations/${d.id}/submit`);
      toast.success('Submitted for signature.');
      onChange();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Submit failed.');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!cancelReason.trim()) {
      toast.error('Cancellation reason is required.');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/declarations/${d.id}/cancel`, { reason: cancelReason.trim() });
      toast.success('Declaration cancelled.');
      onChange();
      setShowCancel(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Cancel failed.');
    } finally {
      setBusy(false);
    }
  }

  if (d.status === 'draft') {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy || (d.signatures ?? []).length < d.required_signer_count}
          title={
            (d.signatures ?? []).length < d.required_signer_count
              ? `Add at least ${d.required_signer_count} signer slots first`
              : ''
          }
          className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Submit for signature'}
        </button>
        <button
          type="button"
          onClick={() => setShowCancel(true)}
          className="px-3 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-muted"
        >
          Cancel
        </button>
        {showCancel && (
          <div className="basis-full flex gap-2 mt-2">
            <input
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason"
              className="flex-1 px-2 py-1 rounded-md border border-border bg-background text-xs"
            />
            <button
              type="button"
              onClick={cancel}
              disabled={busy}
              className="px-3 py-1 rounded-md bg-destructive text-destructive-foreground text-xs font-semibold disabled:opacity-50"
            >
              Confirm cancel
            </button>
          </div>
        )}
      </div>
    );
  }
  if (d.status === 'in_review') {
    return (
      <div>
        <button
          type="button"
          onClick={() => setShowCancel(true)}
          className="px-3 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-muted"
        >
          Cancel
        </button>
        {showCancel && (
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason"
              className="flex-1 px-2 py-1 rounded-md border border-border bg-background text-xs"
            />
            <button
              type="button"
              onClick={cancel}
              disabled={busy}
              className="px-3 py-1 rounded-md bg-destructive text-destructive-foreground text-xs font-semibold disabled:opacity-50"
            >
              Confirm cancel
            </button>
          </div>
        )}
      </div>
    );
  }
  return null;
}

function SignerRow({
  declarationId, decl, sig, onChange,
}: {
  declarationId: number;
  decl: EmergencyDeclaration;
  sig: NonNullable<EmergencyDeclaration['signatures']>[number];
  onChange: () => void;
}) {
  const viewer = useAuthStore((s) => s.user);
  const isSelf = viewer?.id === sig.signer_user_id;
  const isAdmin = viewer?.role === 'admin';

  const [busy, setBusy] = useState(false);
  const [showSign, setShowSign] = useState(false);
  const [showRecuse, setShowRecuse] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [noCoi, setNoCoi] = useState(false);
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState<'totp' | 'manual_admin'>('totp');

  const canAct = sig.status === 'pending' && decl.status === 'in_review' && (isSelf || isAdmin);

  async function sign() {
    if (!noCoi) {
      toast.error('You must affirm no conflict of interest to sign.');
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        signature_method: method,
        declared_no_coi: true,
      };
      if (method === 'totp') body.totp_code = totpCode;
      await api.post(`/declarations/${declarationId}/signatures/${sig.id}/sign`, body);
      toast.success('Signed.');
      setShowSign(false);
      setTotpCode('');
      setNoCoi(false);
      onChange();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Sign failed.');
    } finally {
      setBusy(false);
    }
  }

  async function recuse() {
    if (!reason.trim()) {
      toast.error('Recusal reason is required.');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/declarations/${declarationId}/signatures/${sig.id}/recuse`,
        { reason: reason.trim() });
      toast.success('Recused.');
      setShowRecuse(false);
      setReason('');
      onChange();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Recuse failed.');
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!reason.trim()) {
      toast.error('Rejection reason is required.');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/declarations/${declarationId}/signatures/${sig.id}/reject`,
        { reason: reason.trim() });
      toast.success('Rejected.');
      setShowReject(false);
      setReason('');
      onChange();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Reject failed.');
    } finally {
      setBusy(false);
    }
  }

  const statusIcon = sig.status === 'signed'
    ? <CheckCircle2 className="w-4 h-4 text-[hsl(var(--kuja-grow))]" />
    : sig.status === 'rejected'
    ? <XCircle className="w-4 h-4 text-destructive" />
    : sig.status === 'recused'
    ? <AlertCircle className="w-4 h-4 text-muted-foreground" />
    : <Lock className="w-4 h-4 text-muted-foreground" />;

  const displayName = sig.signer_name || sig.signer_email || `User #${sig.signer_user_id}`;
  const canRemove = decl.status === 'draft' && isAdmin && sig.status === 'pending';

  async function removeSlot() {
    if (!confirm(`Remove ${displayName} from the committee?`)) return;
    setBusy(true);
    try {
      await api.delete(`/declarations/${declarationId}/signers/${sig.id}`);
      toast.success('Signer removed.');
      onChange();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Remove failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="border border-border rounded-md bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {statusIcon}
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{displayName}</div>
            {sig.signer_org_name && (
              <div className="text-[11px] text-muted-foreground truncate">
                {sig.signer_org_name}
              </div>
            )}
            <div className="text-xs text-muted-foreground capitalize">
              {sig.status.replace('_', ' ')}
              {sig.signature_method && <> · via {sig.signature_method}</>}
              {sig.signed_at && <> · {new Date(sig.signed_at).toLocaleString()}</>}
            </div>
            {sig.recusal_reason && (
              <div className="text-xs italic text-muted-foreground mt-0.5">
                Recused: {sig.recusal_reason}
              </div>
            )}
            {sig.rejection_reason && (
              <div className="text-xs italic text-destructive mt-0.5">
                Rejected: {sig.rejection_reason}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          {canAct && (
            <>
              <button type="button" onClick={() => setShowSign(true)}
                className="px-2 py-1 rounded-md bg-[hsl(var(--kuja-grow))] text-white text-xs font-semibold hover:opacity-90">
                Sign
              </button>
              <button type="button" onClick={() => setShowRecuse(true)}
                className="px-2 py-1 rounded-md border border-border text-xs font-semibold hover:bg-muted">
                Recuse
              </button>
              <button type="button" onClick={() => setShowReject(true)}
                className="px-2 py-1 rounded-md border border-border text-xs font-semibold hover:bg-muted">
                Reject
              </button>
            </>
          )}
          {canRemove && (
            <button
              type="button"
              onClick={removeSlot}
              disabled={busy}
              title="Remove from committee"
              className="px-2 py-1 rounded-md border border-border text-xs font-semibold hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Sign dialog */}
      {showSign && (
        <div className="mt-3 border-t border-border pt-3 space-y-2">
          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" checked={noCoi} onChange={(e) => setNoCoi(e.target.checked)}
              className="mt-0.5" />
            <span>
              I affirm that I have <strong>no conflict of interest</strong> with this
              declaration (affected country, recipient orgs, or financial relationship).
            </span>
          </label>
          {isAdmin && !isSelf ? (
            <label className="text-xs space-y-1 block">
              <span className="text-muted-foreground">Signature method</span>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as 'totp' | 'manual_admin')}
                className="px-2 py-1 rounded-md border border-border bg-background text-xs"
              >
                <option value="manual_admin">Manual attestation (admin)</option>
                <option value="totp">TOTP (signer must provide code)</option>
              </select>
            </label>
          ) : null}
          {method === 'totp' && (
            <label className="text-xs space-y-1 block">
              <span className="text-muted-foreground">TOTP code (6 digits)</span>
              <input type="text" value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456" maxLength={6} inputMode="numeric"
                className="px-2 py-1 rounded-md border border-border bg-background text-sm w-32 tracking-widest" />
            </label>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={sign} disabled={busy || !noCoi}
              className="px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">
              {busy ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Confirm signature'}
            </button>
            <button type="button" onClick={() => { setShowSign(false); setTotpCode(''); setNoCoi(false); }}
              className="px-3 py-1 rounded-md border border-border text-xs font-semibold hover:bg-muted">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Recuse dialog */}
      {showRecuse && (
        <div className="mt-3 border-t border-border pt-3 space-y-2">
          <label className="text-xs space-y-1 block">
            <span className="text-muted-foreground">
              Recusal reason (visible in the audit chain — be specific)
            </span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)}
              rows={2} className="w-full px-2 py-1 rounded-md border border-border bg-background text-xs" />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={recuse} disabled={busy || !reason.trim()}
              className="px-3 py-1 rounded-md bg-muted text-foreground text-xs font-semibold disabled:opacity-50">
              {busy ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Confirm recusal'}
            </button>
            <button type="button" onClick={() => { setShowRecuse(false); setReason(''); }}
              className="px-3 py-1 rounded-md border border-border text-xs font-semibold hover:bg-muted">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Reject dialog */}
      {showReject && (
        <div className="mt-3 border-t border-border pt-3 space-y-2">
          <label className="text-xs space-y-1 block">
            <span className="text-muted-foreground">
              Rejection reason (this cancels the WHOLE declaration)
            </span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)}
              rows={2} className="w-full px-2 py-1 rounded-md border border-border bg-background text-xs" />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={reject} disabled={busy || !reason.trim()}
              className="px-3 py-1 rounded-md bg-destructive text-destructive-foreground text-xs font-semibold disabled:opacity-50">
              {busy ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Confirm rejection'}
            </button>
            <button type="button" onClick={() => { setShowReject(false); setReason(''); }}
              className="px-3 py-1 rounded-md border border-border text-xs font-semibold hover:bg-muted">
              Cancel
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function ReleaseApplicationsPanel({ d, onChange }: {
  d: EmergencyDeclaration; onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<{
    released_count?: number;
    released?: Array<{ grant_id: number; title: string }>;
    skipped?: Array<{ grant_id: number; status: string }>;
  } | null>(null);

  const alreadyReleased = !!d.applicants_notified_at;

  async function release() {
    setBusy(true);
    try {
      const r = await api.post<{
        success: boolean;
        released_count: number;
        released: Array<{ grant_id: number; title: string }>;
        skipped: Array<{ grant_id: number; status: string }>;
      }>(`/declarations/${d.id}/release-applications`);
      setLastResult(r);
      if (r.released_count > 0) {
        toast.success(`Released ${r.released_count} grant${r.released_count === 1 ? '' : 's'} — NGOs notified.`);
      } else {
        toast.message('All grants already released.');
      }
      onChange();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Release failed.');
    } finally {
      setBusy(false);
    }
  }

  if (alreadyReleased) {
    return (
      <div className="mt-4 border border-[hsl(var(--kuja-grow))]/30 bg-[hsl(var(--kuja-grow))]/10 rounded-md p-3">
        <div className="flex items-start gap-2">
          <Send className="w-4 h-4 text-[hsl(var(--kuja-grow))] shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <div className="font-semibold text-[hsl(var(--kuja-grow))]">
              Applications released
            </div>
            <div className="text-muted-foreground mt-0.5">
              Shortlisted NGOs were notified on{' '}
              {new Date(d.applicants_notified_at!).toLocaleString()}.
              Grant drafts are now open for NGO application.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 border border-[hsl(var(--kuja-sun))]/30 bg-[hsl(var(--kuja-sun))]/10 rounded-md p-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <Rocket className="w-4 h-4 text-[hsl(var(--kuja-sun))] shrink-0 mt-0.5" />
          <div className="text-xs flex-1">
            <div className="font-semibold text-[hsl(var(--kuja-sun))]">
              Ready to release — final governed step
            </div>
            <div className="text-muted-foreground mt-0.5">
              Declaration is signed_active. Grant drafts have been auto-created
              under the window for each shortlisted org. Click to flip them to
              <code className="font-mono mx-1 px-1 py-0.5 bg-muted rounded text-[10px]">open</code>
              status and notify the NGOs. This action is audit-anchored and
              advances the <code className="font-mono mx-1 px-1 py-0.5 bg-muted rounded text-[10px]">applicants_notified_at</code> SLA milestone.
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={release}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[hsl(var(--kuja-sun))] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 shrink-0"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
          Release applications now
        </button>
      </div>
      {lastResult && lastResult.released && lastResult.released.length > 0 && (
        <ul className="mt-2 pt-2 border-t border-[hsl(var(--kuja-sun))]/20 text-[11px] space-y-0.5">
          {lastResult.released.map((g) => (
            <li key={g.grant_id} className="text-muted-foreground">
              · grant #{g.grant_id} — {g.title.slice(0, 60)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * AddSignerPanel — Phase 45.
 *
 * Inline OB roster picker. Surfaces every user at every Oversight Body-flagged
 * org so the drafter can pick committee members by NAME (not by raw user_id).
 *
 * Lives under the signer list on draft declarations. Filters out anyone already
 * assigned (signed, recused, rejected — they all sit in d.signatures), filters
 * by free-text on name/email/org, calls POST /declarations/<id>/signers per pick.
 */
function AddSignerPanel({
  d, onChange,
}: { d: EmergencyDeclaration; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [busyUserId, setBusyUserId] = useState<number | null>(null);
  const { data: rosterData, isLoading } = useObRoster();

  const assignedUserIds = useMemo(
    () => new Set((d.signatures ?? []).map((s) => s.signer_user_id)),
    [d.signatures],
  );

  const candidates = useMemo<ObRosterMember[]>(() => {
    const all = rosterData?.members ?? [];
    const free = all.filter((m) => !assignedUserIds.has(m.user_id));
    if (!query.trim()) return free;
    const q = query.trim().toLowerCase();
    return free.filter((m) =>
      (m.user_name || '').toLowerCase().includes(q) ||
      (m.user_email || '').toLowerCase().includes(q) ||
      (m.org_name || '').toLowerCase().includes(q) ||
      (m.country || '').toLowerCase().includes(q),
    );
  }, [rosterData, assignedUserIds, query]);

  async function addSigner(member: ObRosterMember) {
    setBusyUserId(member.user_id);
    try {
      await api.post(`/declarations/${d.id}/signers`, {
        user_id: member.user_id,
      });
      toast.success(`Added ${member.user_name || member.user_email}.`);
      onChange();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Add signer failed.');
    } finally {
      setBusyUserId(null);
    }
  }

  if (!open) {
    return (
      <div className="mt-2 pt-3 border-t border-border">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[hsl(var(--kuja-clay))] text-white text-xs font-semibold hover:opacity-90"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Add committee member
        </button>
        <p className="text-[11px] text-muted-foreground mt-1.5">
          Pick from the Oversight Body roster — only OB-seat-flagged members are
          eligible to sign.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-2 pt-3 border-t border-border space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold flex items-center gap-1.5">
          <UserPlus className="w-3.5 h-3.5 text-[hsl(var(--kuja-clay))]" />
          Add from Oversight Body roster
        </h3>
        <button
          type="button"
          onClick={() => { setOpen(false); setQuery(''); }}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>

      <label className="block">
        <span className="sr-only">Search OB members</span>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email, org or country…"
            className="w-full pl-7 pr-2 py-1.5 rounded-md border border-border bg-background text-xs"
          />
        </div>
      </label>

      {isLoading && (
        <div className="text-xs text-muted-foreground italic">Loading roster…</div>
      )}

      {!isLoading && (rosterData?.members ?? []).length === 0 && (
        <div className="border border-dashed border-border rounded-md p-3 text-xs text-muted-foreground">
          No Oversight Body seats are configured for this network yet. Ask the
          network admin to grant OB seats from the Membership page first.
        </div>
      )}

      {!isLoading && candidates.length === 0 && (rosterData?.members ?? []).length > 0 && (
        <div className="text-xs text-muted-foreground italic">
          {query.trim()
            ? `No matches for "${query}".`
            : 'All eligible members are already on the committee.'}
        </div>
      )}

      {candidates.length > 0 && (
        <ul className="space-y-1 max-h-64 overflow-y-auto pr-1">
          {candidates.map((m) => (
            <li
              key={m.user_id}
              className="flex items-center justify-between gap-2 border border-border rounded-md p-2 hover:bg-muted/30 transition-colors"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {m.user_name || m.user_email || `User #${m.user_id}`}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {m.org_name}
                  {m.country && <> · {m.country}</>}
                  {m.user_role && <> · {m.user_role}</>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => addSigner(m)}
                disabled={busyUserId === m.user_id}
                className="px-2.5 py-1 rounded-md bg-[hsl(var(--kuja-clay))] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 shrink-0"
              >
                {busyUserId === m.user_id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  'Add'
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AIDraftAssistButton({ declarationId, onUpdate }: {
  declarationId: number; onUpdate: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    ok?: boolean;
    summary_md?: string;
    shortlist_suggestions?: Array<{ org_name: string; rationale: string; amount?: number }>;
  } | null>(null);

  async function run(apply: boolean) {
    setBusy(true);
    try {
      const r = await api.post<typeof result>(
        `/declarations/${declarationId}/ai-draft-assist`,
        { apply },
      );
      setResult(r);
      if (apply && r?.ok) {
        toast.success('Summary applied to draft.');
        onUpdate();
      } else if (r?.ok) {
        toast.success('AI draft ready — review below.');
      } else {
        toast.message('AI unavailable — using fallback.');
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => run(false)}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[hsl(var(--kuja-spark))] text-white text-xs font-semibold disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
        AI draft assist
      </button>
      {result && (
        <div className="border border-[hsl(var(--kuja-spark))]/30 rounded-md bg-[hsl(var(--kuja-spark-soft))] p-3 mt-2 space-y-2">
          {result.summary_md && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 flex items-center justify-between">
                <span>AI-drafted summary</span>
                <button
                  type="button"
                  onClick={() => run(true)}
                  disabled={busy}
                  className="text-[10px] underline hover:no-underline"
                >
                  Apply to draft
                </button>
              </div>
              <p className="text-xs whitespace-pre-wrap leading-relaxed">{result.summary_md}</p>
            </div>
          )}
          {result.shortlist_suggestions && result.shortlist_suggestions.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                Shortlist suggestions
              </div>
              <ul className="text-xs space-y-1">
                {result.shortlist_suggestions.map((s, i) => (
                  <li key={i}>
                    <strong>{s.org_name}</strong>
                    {s.amount && <> · {s.amount.toLocaleString()}</>}
                    <div className="text-muted-foreground">{s.rationale}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
