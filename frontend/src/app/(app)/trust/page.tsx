'use client';

/**
 * /trust — the Trust Profile page (NGO + donor + admin).
 *
 * NGO sees their own profile.
 * Donor + admin see a search bar and switch between orgs.
 *
 * One screen, three panels:
 *   1. Trust Profile composite (two pillars, drillable)
 *   2. Adverse Media screening
 *   3. Bank Account verification
 *   4. Capacity Passport publish/manage (NGO only sees publish/revoke)
 */

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { ShieldCheck, Search } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { TrustProfileCard } from '@/components/trust/trust-profile-card';
import { TrustGapInsightsCard } from '@/components/trust/trust-gap-insights-card';
import { AdverseMediaPanel } from '@/components/trust/adverse-media-panel';
import { BankVerificationPanel } from '@/components/trust/bank-verification-panel';
import { CapacityPassportPanel } from '@/components/trust/capacity-passport-panel';
import { RegistrationPanel } from '@/components/trust/registration-panel';
import { trustApi } from '@/lib/trust-api';
import { PageShell, PageHeader, PageMain } from '@/components/layout/page-shell';
import type {
  TrustProfile, AdverseMediaScreening, BankVerification, CapacityPassport as Passport,
} from '@/lib/trust-api';

interface OrgPickerOption {
  id: number;
  name: string;
  country?: string;
}

export default function TrustProfilePage() {
  return (
    <Suspense fallback={<div className="space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-44 w-full" /></div>}>
      <TrustProfilePageInner />
    </Suspense>
  );
}

function TrustProfilePageInner() {
  const user = useAuthStore((s) => s.user);
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlOrgId = searchParams.get('org');
  const fromTrust = searchParams.get('from') === 'trust';
  const initialOrgId = urlOrgId ? Number(urlOrgId) : user?.org_id ?? null;

  const [orgId, setOrgId] = useState<number | null>(initialOrgId);
  const [profile, setProfile] = useState<TrustProfile | null>(null);
  const [adverseMedia, setAdverseMedia] = useState<AdverseMediaScreening | null>(null);
  const [bank, setBank] = useState<BankVerification | null>(null);
  const [passports, setPassports] = useState<Passport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isDonor = user?.role === 'donor';
  const isAdmin = user?.role === 'admin';
  const isNgo = user?.role === 'ngo';
  const ownsThisOrg = isNgo && user?.org_id === orgId;
  const canPublish = ownsThisOrg || isAdmin;
  const canRevoke = ownsThisOrg || isAdmin;
  const canRunScreenings = isDonor || isAdmin || ownsThisOrg;

  const loadAll = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const [pf, am, bk, ps] = await Promise.all([
        trustApi.getProfile(id),
        trustApi.listAdverseMedia(id),
        trustApi.listBankVerifications(id),
        trustApi.listPassports(id),
      ]);
      setProfile(pf.profile);
      setAdverseMedia(am.latest);
      setBank(bk.latest);
      setPassports(ps.passports);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (orgId) {
      loadAll(orgId);
    } else {
      setLoading(false);
    }
  }, [orgId, loadAll]);

  // Switching org via the URL ?org=N param
  const onSwitchOrg = (id: number) => {
    setOrgId(id);
    router.replace(`/trust?org=${id}`);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-44 w-full" />
      </div>
    );
  }

  if (!orgId) {
    return (
      <Card className="p-6 text-center max-w-lg mx-auto mt-12">
        <ShieldCheck className="w-10 h-10 mx-auto text-[hsl(var(--kuja-clay))]" />
        <h2 className="kuja-display text-xl mt-3">No organisation selected</h2>
        <p className="text-sm text-[hsl(var(--kuja-ink-soft))] mt-1">
          {isDonor || isAdmin
            ? 'Pick an organisation to see its Trust Profile.'
            : 'Your account is not linked to an organisation yet.'}
        </p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6 max-w-lg mx-auto mt-12 border-[hsl(var(--kuja-flag)/0.3)]">
        <h2 className="text-base font-semibold text-[hsl(var(--kuja-flag))]">Could not load profile</h2>
        <p className="text-xs mt-1">{error}</p>
      </Card>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <PageShell>
        <PageHeader
          title="Trust Profile"
          icon={ShieldCheck}
          subtitle="Identity, sanctions, adverse media, bank verification, COI, and capacity — one canonical view."
        />
        <PageMain>
      {/* Returned from the Kuja Trust capacity assessment — the status below now
          reflects the latest assessment (read back via the Trust service). */}
      {fromTrust && (
        <Card className="p-4 flex items-center gap-3 border-[hsl(var(--kuja-clay)/0.35)] bg-[hsl(var(--kuja-clay)/0.06)]">
          <ShieldCheck className="w-5 h-5 text-[hsl(var(--kuja-clay))] shrink-0" />
          <p className="text-sm">
            Welcome back from Kuja Trust — your capacity &amp; due-diligence status below reflects your latest assessment.
          </p>
        </Card>
      )}

      {/* Capacity-assessment hand-off CTA — NGO viewing their own org, only when
          the Trust hand-off is configured for this tenant. */}
      <CapacityHandoffCta show={ownsThisOrg} />

      {/* Identity & Registration — folded in from /verification */}
      <RegistrationPanel orgId={orgId} />

      {/* Trust Profile */}
      {profile && (
        <TrustProfileCard
          profile={profile}
          onPublishPassport={canPublish ? async () => {
            try {
              const resp = await trustApi.publishPassport({ org_id: orgId });
              setPassports([resp.passport, ...passports.map(p =>
                p.status === 'active' ? { ...p, status: 'revoked' as const } : p
              )]);
              // Scroll to passport panel
              document.getElementById('passport-panel')?.scrollIntoView({ behavior: 'smooth' });
            } catch (e) {
              alert((e as Error).message);
            }
          } : undefined}
          onRunScreening={canRunScreenings ? (kind) => {
            const el = document.getElementById(`${kind === 'adverse_media' ? 'am-panel' : kind === 'bank' ? 'bank-panel' : 'am-panel'}`);
            el?.scrollIntoView({ behavior: 'smooth' });
          } : undefined}
          showActions={canPublish || canRunScreenings}
        />
      )}

      {/* Phase 18A — AI-narrated gap analysis. Renders below the trust
          profile card for everyone with read access. */}
      {profile && <TrustGapInsightsCard orgId={orgId} />}

      {/* Adverse Media */}
      <div id="am-panel">
        <AdverseMediaPanel
          orgId={orgId}
          initialLatest={adverseMedia}
          canRun={canRunScreenings}
        />
      </div>

      {/* Bank Verification */}
      <div id="bank-panel">
        <BankVerificationPanel
          orgId={orgId}
          initialLatest={bank}
          canRun={canPublish}
        />
      </div>

      {/* Capacity Passport */}
      <div id="passport-panel">
        <CapacityPassportPanel
          orgId={orgId}
          initial={passports}
          canPublish={canPublish}
          canRevoke={canRevoke}
        />
      </div>
        </PageMain>
      </PageShell>
    </div>
  );
}

/**
 * CapacityHandoffCta — sends the NGO to the standalone Kuja Trust app to complete
 * their capacity assessment (no second login) and bring them back. Renders only
 * when the hand-off is configured for this tenant (checked server-side); otherwise
 * it stays hidden and the NGO uses the in-app assessment as before.
 */
function CapacityHandoffCta({ show }: { show: boolean }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!show) return;
    let active = true;
    trustApi.handoffAvailable()
      .then((r) => { if (active) setAvailable(!!r.available); })
      .catch(() => { if (active) setAvailable(false); });
    return () => { active = false; };
  }, [show]);

  if (!show || !available) return null;

  const start = async () => {
    setStarting(true);
    setErr(null);
    try {
      const { url } = await trustApi.startHandoff();
      window.location.href = url;
    } catch (e) {
      setErr((e as Error).message || 'Could not open Kuja Trust. Please try again.');
      setStarting(false);
    }
  };

  return (
    <Card className="p-5 border-[hsl(var(--kuja-clay)/0.35)] bg-[hsl(var(--kuja-clay)/0.06)]">
      <div className="flex items-start gap-4 flex-wrap">
        <ShieldCheck className="w-6 h-6 text-[hsl(var(--kuja-clay))] shrink-0 mt-0.5" />
        <div className="flex-1 min-w-[220px]">
          <h3 className="kuja-display text-lg">Complete your capacity assessment</h3>
          <p className="text-sm text-[hsl(var(--kuja-ink-soft))] mt-1">
            Your capacity &amp; due-diligence assessment is completed in <strong>Kuja Trust</strong>.
            We&apos;ll take you there securely — no separate password — and bring you straight back when you&apos;re done.
          </p>
          {err && <p className="text-xs text-[hsl(var(--kuja-flag))] mt-2">{err}</p>}
        </div>
        <button
          type="button"
          onClick={start}
          disabled={starting}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white bg-[hsl(var(--kuja-clay))] hover:opacity-90 disabled:opacity-60 whitespace-nowrap"
        >
          {starting ? 'Opening Kuja Trust…' : 'Open Kuja Trust'}
        </button>
      </div>
    </Card>
  );
}
