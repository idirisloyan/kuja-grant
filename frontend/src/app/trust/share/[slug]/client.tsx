'use client';

/**
 * /trust/share/[slug] — Phase 98.4 (Wave 4) public Trust Profile share page.
 *
 * URL: /trust/share/<slug>
 *
 * Unauthenticated. No token required. Reads the published Capacity Passport
 * snapshot via /api/passport/share/<slug>. Renders the existing
 * TrustProfileCard primitive so the visual fidelity matches the
 * cryptographically-verified /trust/verify page exactly — the only
 * difference is the absence of the "Verified" stamp + the presence of a
 * prominent "Verify cryptographically" CTA pointing to the existing
 * /trust/verify path (which still requires the token-bearing URL the NGO
 * sent the donor directly).
 *
 * Revocation: when /api/passport/share returns 410 Gone (revoked/expired
 * /draft), this page renders a clear "stale credential" state with copy
 * keyed off the reason — never a half-rendered snapshot.
 */

import { Suspense, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  ShieldCheck, ShieldAlert, ExternalLink, AlertCircle, Printer,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { TrustProfileCard } from '@/components/trust/trust-profile-card';
import type { CapacityPassport, TrustProfile } from '@/lib/trust-api';

interface ShareResponse {
  success: boolean;
  verified?: boolean;
  public_share?: boolean;
  passport?: CapacityPassport;
  reason?: string;
  verify_hint?: string;
}

const REASON_COPY: Record<string, { title: string; body: string }> = {
  not_found: { title: 'Profile not found',     body: 'The link points to a profile that does not exist.' },
  revoked:   { title: 'Profile revoked',       body: 'The NGO revoked this profile snapshot. Ask them for a fresh share link.' },
  expired:   { title: 'Profile expired',       body: 'This profile reached its expiry date. Ask the NGO for a fresh snapshot.' },
  draft:     { title: 'Profile not published', body: 'The NGO has not yet published a public Trust Profile.' },
};

function PageFallback() {
  return (
    <div className="min-h-screen bg-[hsl(var(--kuja-quartz))] flex items-center justify-center p-4">
      <div className="max-w-3xl w-full space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-44 w-full" />
      </div>
    </div>
  );
}

export default function ShareClient() {
  return (
    <Suspense fallback={<PageFallback />}>
      <ShareInner />
    </Suspense>
  );
}

function ShareInner() {
  const params = useParams();
  const [slug, setSlug] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const m = window.location.pathname.match(/\/trust\/share\/([^/?#]+)/);
      if (m && m[1] !== '0') return decodeURIComponent(m[1]);
    }
    const fromParams = String(params?.slug ?? '');
    return fromParams !== '0' ? fromParams : '';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const m = window.location.pathname.match(/\/trust\/share\/([^/?#]+)/);
    if (m && m[1] !== '0') setSlug(decodeURIComponent(m[1]));
  }, [params?.slug]);

  const [data, setData] = useState<ShareResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) {
      setData({ success: false, reason: 'not_found' });
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/passport/share/${encodeURIComponent(slug)}`)
      .then(r => r.json())
      .then((j: ShareResponse) => { if (!cancelled) setData(j); })
      .catch(() => { if (!cancelled) setData({ success: false, reason: 'network_error' }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  if (loading) return <PageFallback />;

  if (!data?.success || !data?.passport) {
    const copy = REASON_COPY[data?.reason ?? 'not_found'] ?? {
      title: 'Could not load profile',
      body: 'Ask the organisation for a fresh share link.',
    };
    return (
      <div className="min-h-screen bg-[hsl(var(--kuja-quartz))] flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-6 border-l-4 border-l-[hsl(var(--kuja-flag))]">
          <ShieldAlert className="w-10 h-10 text-[hsl(var(--kuja-flag))]" />
          <h1 className="kuja-display text-2xl mt-3">{copy.title}</h1>
          <p className="text-sm text-muted-foreground mt-2">{copy.body}</p>
        </Card>
      </div>
    );
  }

  const p = data.passport;
  const orgName = p.org_name || 'this organisation';
  const profile = p.snapshot as unknown as TrustProfile;

  return (
    <div className="min-h-screen bg-[hsl(var(--kuja-quartz))] py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-5">
        {/* Header strip — clear "public snapshot, not cryptographically verified" framing */}
        <Card className="p-5 bg-gradient-to-r from-[hsl(var(--kuja-clay)/0.08)] to-[hsl(var(--kuja-sand-50))] border-[hsl(var(--kuja-clay)/0.25)]">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-8 h-8 text-[hsl(var(--kuja-clay))] shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h1 className="kuja-display text-xl">
                Trust Profile · {orgName}
              </h1>
              <p className="text-xs text-muted-foreground mt-1">
                Public snapshot · published {p.published_at
                  ? new Date(p.published_at).toLocaleDateString()
                  : '—'}. For cryptographic verification, ask the NGO for the
                token-bearing link.
              </p>
            </div>
            <div className="hidden sm:flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                className="bg-background"
              >
                <Printer className="h-3.5 w-3.5 mr-1.5" />
                Print
              </Button>
            </div>
          </div>
          {data.verify_hint && (
            <div className="mt-3 flex items-start gap-2 text-[11px] text-muted-foreground border-t border-border pt-2">
              <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
              <span>{data.verify_hint}</span>
            </div>
          )}
        </Card>

        {profile ? (
          <TrustProfileCard
            profile={profile}
            showActions={false}
          />
        ) : (
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">
              This profile does not include a Trust Profile snapshot. Ask the
              organisation to republish with the full profile attached.
            </p>
          </Card>
        )}

        <p className="text-[11px] text-muted-foreground text-center">
          <ExternalLink className="inline h-3 w-3 mr-0.5" />
          Hosted by Kuja · the NGO is responsible for the information shown above.
        </p>
      </div>
    </div>
  );
}
