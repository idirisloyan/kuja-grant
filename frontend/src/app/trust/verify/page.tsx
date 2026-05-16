'use client';

/**
 * Public passport-verification landing page.
 *
 * URL: /trust/verify?s=<slug>&t=<token>
 *
 * Unauthenticated. Donors visit this with the link the NGO sent them.
 * Calls /api/passport/verify/<slug>?t=<token>, renders the snapshotted
 * Trust Profile + provenance metadata.
 *
 * Designed so the URL alone is enough to verify — no Kuja account needed.
 */

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ShieldCheck, ShieldAlert, ExternalLink, CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrustProfileCard } from '@/components/trust/trust-profile-card';
import type { CapacityPassport, TrustProfile } from '@/lib/trust-api';

interface VerifyResponse {
  success: boolean;
  verified: boolean;
  passport?: CapacityPassport;
  reason?: string;
}

const REASON_COPY: Record<string, { title: string; body: string }> = {
  not_found:    { title: 'Passport not found',     body: 'The passport ID in this link is unrecognised.' },
  invalid_token: { title: 'Invalid verification token', body: 'The link looks tampered with. Ask the organisation for a fresh one.' },
  revoked:      { title: 'Passport revoked',       body: 'The organisation revoked this passport. Ask them to publish a new one.' },
  expired:      { title: 'Passport expired',       body: 'This passport reached its expiry date. Ask the organisation for a fresh snapshot.' },
  missing:      { title: 'Link incomplete',         body: 'This link is missing the slug or token. Ask the organisation for a fresh one.' },
};

function PassportFallback() {
  return (
    <div className="min-h-screen bg-[hsl(var(--kuja-quartz))] flex items-center justify-center p-4">
      <div className="max-w-3xl w-full space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-44 w-full" />
      </div>
    </div>
  );
}

export default function PublicPassportPage() {
  return (
    <Suspense fallback={<PassportFallback />}>
      <PassportVerifyInner />
    </Suspense>
  );
}

function PassportVerifyInner() {
  const search = useSearchParams();
  const slug = search?.get('s') ?? '';
  const token = search?.get('t') ?? '';

  const [data, setData] = useState<VerifyResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!slug || !token) {
      setData({ success: false, verified: false, reason: 'missing' });
      setLoading(false);
      return;
    }
    const verify = async () => {
      try {
        const resp = await fetch(`/api/passport/verify/${slug}?t=${encodeURIComponent(token)}`, {
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        });
        const json = await resp.json() as VerifyResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData({ success: false, verified: false, reason: 'network_error' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    verify();
    return () => { cancelled = true; };
  }, [slug, token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[hsl(var(--kuja-quartz))] flex items-center justify-center p-4">
        <div className="max-w-3xl w-full space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      </div>
    );
  }

  if (!data?.verified) {
    const copy = REASON_COPY[data?.reason ?? 'unknown'] ?? {
      title: 'Could not verify',
      body: 'Please ask the organisation to send you a fresh passport link.',
    };
    return (
      <div className="min-h-screen bg-[hsl(var(--kuja-quartz))] flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-6 border-l-4 border-l-[hsl(var(--kuja-flag))]">
          <ShieldAlert className="w-10 h-10 text-[hsl(var(--kuja-flag))]" />
          <h1 className="kuja-display text-2xl mt-3">{copy.title}</h1>
          <p className="text-sm text-[hsl(var(--kuja-ink-soft))] mt-2">{copy.body}</p>
        </Card>
      </div>
    );
  }

  const passport = data.passport!;
  const profile = passport.snapshot as TrustProfile;

  return (
    <div className="min-h-screen bg-[hsl(var(--kuja-quartz))]">
      {/* Verification header */}
      <div className="bg-[hsl(var(--kuja-grow))] text-white py-4 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <CheckCircle2 className="w-6 h-6 shrink-0" />
          <div>
            <div className="font-semibold">Passport Verified</div>
            <div className="text-xs opacity-90">
              You are viewing a tamper-evident snapshot. Verified {new Date(passport.last_verified_at ?? Date.now()).toLocaleString()}.
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
        {/* Provenance card */}
        <Card className="p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-6 h-6 text-[hsl(var(--kuja-clay))] mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <h1 className="kuja-display text-2xl">
                {passport.org_name}
              </h1>
              <p className="text-sm text-[hsl(var(--kuja-ink-soft))] mt-1">
                Capacity Passport · published {passport.published_at && new Date(passport.published_at).toLocaleDateString()}
                {passport.expires_at && <> · expires {new Date(passport.expires_at).toLocaleDateString()}</>}
              </p>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="rounded-md border border-[hsl(var(--border))] p-2.5">
                  <div className="kuja-label">Snapshot hash</div>
                  <code className="font-mono text-[10px] break-all">{passport.snapshot_hash}</code>
                </div>
                <div className="rounded-md border border-[hsl(var(--border))] p-2.5">
                  <div className="kuja-label">Verifications</div>
                  <div className="kuja-numeric text-xl font-bold mt-0.5">{passport.verification_count}</div>
                </div>
                <div className="rounded-md border border-[hsl(var(--border))] p-2.5">
                  <div className="kuja-label">Status</div>
                  <div className="text-sm font-semibold text-[hsl(var(--kuja-grow))] mt-0.5">Active</div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* The actual trust profile snapshot */}
        <TrustProfileCard profile={profile} showActions={false} />

        {/* Footer */}
        <Card className="p-4 text-xs text-[hsl(var(--kuja-ink-soft))]">
          <p>
            <strong>What you&apos;re looking at:</strong> a frozen snapshot of {passport.org_name}&apos;s
            Trust Profile at the moment they published this passport.
            The hash above is cryptographic proof of the snapshot&apos;s integrity — any change to
            the snapshot would change the hash.
          </p>
          <p className="mt-2">
            <strong>How to use this:</strong> if {passport.org_name} applies for your grant, this
            passport may satisfy your due-diligence requirements without you needing to re-run
            the checks. The verification has been recorded in Kuja&apos;s tamper-evident audit chain.
          </p>
          <p className="mt-2">
            Generated by <a href="/" className="text-[hsl(var(--kuja-clay))] hover:underline inline-flex items-center gap-1">Kuja Grant Management <ExternalLink className="w-3 h-3" /></a>
          </p>
        </Card>
      </div>
    </div>
  );
}
