'use client';

/**
 * CapacityPassportPanel — publish, list, revoke.
 *
 * The NGO publishes a Passport (a tamper-evident snapshot of the current
 * Trust Profile) and shares the URL with donors. Donors verify without
 * needing a Kuja login.
 *
 * Each Passport row:
 *   - Status (active / expired / revoked / draft)
 *   - Publish date + expiry
 *   - Verification count (how many times donors have verified)
 *   - Copy URL button
 *   - Revoke button (with type-name confirmation gate)
 */

import { useState } from 'react';
import {
  Award, Copy, RefreshCw, Loader2, AlertTriangle, Download,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { trustApi } from '@/lib/trust-api';
import type { CapacityPassport as Passport } from '@/lib/trust-api';
import { cn } from '@/lib/utils';

const STATUS_TONE: Record<string, { tone: string; label: string }> = {
  active:  { tone: 'text-[hsl(var(--kuja-grow))]', label: 'Active' },
  draft:   { tone: 'text-[hsl(var(--kuja-ink-soft))]', label: 'Draft' },
  revoked: { tone: 'text-[hsl(var(--kuja-flag))]', label: 'Revoked' },
  expired: { tone: 'text-[hsl(var(--kuja-sun))]', label: 'Expired' },
};

function shortHash(hash: string) {
  return hash ? `${hash.slice(0, 8)}…${hash.slice(-4)}` : '';
}

function PassportRow({
  passport, canRevoke, onRevoke, onCopy,
}: {
  passport: Passport;
  canRevoke: boolean;
  onRevoke: (p: Passport) => void;
  onCopy: (url: string) => void;
}) {
  const meta = STATUS_TONE[passport.status] ?? STATUS_TONE.draft;
  const url = passport.share_url ?? '';
  return (
    <div className="rounded-md border border-[hsl(var(--border))] p-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className={cn('text-sm font-semibold uppercase', meta.tone)}>
              {meta.label}
            </span>
            {passport.snapshot?.overall && (
              <Badge variant="outline">
                Score {passport.snapshot.overall.score}/100
              </Badge>
            )}
            <span className="text-[11px] text-[hsl(var(--kuja-ink-soft))]">
              hash <code className="font-mono">{shortHash(passport.snapshot_hash)}</code>
            </span>
          </div>
          <div className="text-[11px] text-[hsl(var(--kuja-ink-soft))] mt-1">
            {passport.published_at && <>Published {new Date(passport.published_at).toLocaleDateString()}</>}
            {passport.expires_at && <> · Expires {new Date(passport.expires_at).toLocaleDateString()}</>}
            {passport.revoked_at && (
              <> · Revoked {new Date(passport.revoked_at).toLocaleDateString()}
                {passport.revoked_reason && ` (${passport.revoked_reason})`}
              </>
            )}
            <> · <strong>{passport.verification_count}</strong> verification{passport.verification_count === 1 ? '' : 's'}</>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {url && (
            <button
              type="button"
              onClick={() => onCopy(url)}
              className="inline-flex items-center gap-1 rounded-md border border-[hsl(var(--border))] px-2 py-1 text-[11px] font-semibold hover:bg-[hsl(var(--kuja-sand-50))]"
            >
              <Copy className="w-3 h-3" /> Copy URL
            </button>
          )}
          {passport.status === 'active' && (
            <a
              href={`/api/passport/${passport.id}/vc?format=download`}
              download
              className="inline-flex items-center gap-1 rounded-md border border-[hsl(var(--border))] px-2 py-1 text-[11px] font-semibold hover:bg-[hsl(var(--kuja-sand-50))]"
              title="Download as W3C Verifiable Credential (off-platform-portable, signed JSON-LD)"
            >
              <Download className="w-3 h-3" /> Download VC
            </a>
          )}
          {canRevoke && passport.status === 'active' && (
            <button
              type="button"
              onClick={() => onRevoke(passport)}
              className="inline-flex items-center gap-1 rounded-md border border-[hsl(var(--kuja-flag)/0.4)] text-[hsl(var(--kuja-flag))] px-2 py-1 text-[11px] font-semibold hover:bg-[hsl(var(--kuja-flag)/0.05)]"
            >
              Revoke
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export interface CapacityPassportPanelProps {
  orgId: number;
  initial: Passport[];
  canPublish: boolean;
  canRevoke: boolean;
}

export function CapacityPassportPanel({
  orgId, initial, canPublish, canRevoke,
}: CapacityPassportPanelProps) {
  const [passports, setPassports] = useState<Passport[]>(initial);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<Passport | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [revoking, setRevoking] = useState(false);

  const activePassport = passports.find(p => p.status === 'active') ?? null;

  const publish = async () => {
    setPublishing(true);
    setError(null);
    try {
      const resp = await trustApi.publishPassport({ org_id: orgId });
      setPassports([resp.passport, ...passports.map(p => p.status === 'active' ? { ...p, status: 'revoked' as const } : p)]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopyHint('Copied to clipboard');
      setTimeout(() => setCopyHint(null), 2000);
    } catch {
      setCopyHint('Could not copy — please copy manually.');
    }
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      const resp = await trustApi.revokePassport(revokeTarget.id, revokeReason || undefined);
      setPassports(passports.map(p => p.id === resp.passport.id ? resp.passport : p));
      setRevokeTarget(null);
      setRevokeReason('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRevoking(false);
    }
  };

  return (
    <Card className="p-4 sm:p-5 border-[hsl(var(--border))]">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2 rounded-md bg-[hsl(var(--kuja-spark)/0.1)]">
            <Award className="w-5 h-5 text-[hsl(var(--kuja-spark))]" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-[hsl(var(--kuja-ink))]">Capacity Passport</h3>
            <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-0.5">
              Publish a tamper-evident snapshot of your Trust Profile — any donor can verify with the share URL.
              Verify once, accepted by many.
            </p>
          </div>
        </div>
        {canPublish && (
          <button
            type="button"
            onClick={publish}
            disabled={publishing}
            className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-spark))] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {publishing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Publishing…</>
              : activePassport ? <><RefreshCw className="w-3.5 h-3.5" /> Re-publish</>
              : <><Award className="w-3.5 h-3.5" /> Publish passport</>}
          </button>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-md bg-[hsl(var(--kuja-flag)/0.1)] border border-[hsl(var(--kuja-flag)/0.3)] p-2.5 text-xs text-[hsl(var(--kuja-flag))]">
          {error}
        </div>
      )}

      {copyHint && (
        <div className="mt-3 rounded-md bg-[hsl(var(--kuja-grow)/0.1)] border border-[hsl(var(--kuja-grow)/0.3)] p-2 text-xs text-[hsl(var(--kuja-grow))]">
          {copyHint}
        </div>
      )}

      {passports.length === 0 ? (
        <div className="mt-4 rounded-md border-2 border-dashed border-[hsl(var(--border))] p-6 text-center">
          <Award className="w-8 h-8 mx-auto text-[hsl(var(--kuja-ink-soft))]" />
          <p className="text-sm font-semibold mt-2">No passport published yet</p>
          <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-1 max-w-md mx-auto">
            Once your Trust Profile is complete, publish a Passport. Then share one URL instead
            of redoing diligence for every donor.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {passports.map(p => (
            <PassportRow
              key={p.id}
              passport={p}
              canRevoke={canRevoke}
              onRevoke={setRevokeTarget}
              onCopy={copy}
            />
          ))}
        </div>
      )}

      {/* Revoke confirmation modal */}
      {revokeTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <Card className="max-w-md w-full p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[hsl(var(--kuja-flag))] shrink-0 mt-0.5" />
              <div>
                <h4 className="text-base font-semibold">Revoke this passport?</h4>
                <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-1">
                  Anyone with the share URL will see a &quot;revoked&quot; response when they try to verify.
                  This is recorded in the tamper-evident audit chain and can&apos;t be undone.
                </p>
              </div>
            </div>
            <div className="mt-4">
              <label htmlFor="revoke-reason" className="kuja-label">Reason (optional)</label>
              <input
                id="revoke-reason"
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                className="mt-1 w-full rounded-md border border-[hsl(var(--border))] px-2 py-1.5 text-sm"
                placeholder="e.g. Republishing with updated diligence"
              />
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRevokeTarget(null)}
                className="rounded-md px-3 py-1.5 text-xs font-semibold hover:bg-[hsl(var(--kuja-sand-50))]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRevoke}
                disabled={revoking}
                className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-flag))] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {revoking ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Revoking…</> : 'Revoke'}
              </button>
            </div>
          </Card>
        </div>
      )}
    </Card>
  );
}
