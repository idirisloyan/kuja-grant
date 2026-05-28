'use client';

/**
 * Kuja onboarding tour — role-aware, first-login-per-user.
 *
 * Mounted in (app)/layout.tsx as a Provider. Fires a 3-4 step tour
 * the first time a user lands on /dashboard, or on-demand via
 * window.dispatchEvent(new Event('kuja:replay-tour')).
 *
 * Persistence: localStorage key `kuja_onboarded_${role}_${userId}`.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNetworkStore } from '@/stores/network-store';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useTranslation } from '@/lib/hooks/use-translation';
import { cn } from '@/lib/utils';
import { Sparkles, X, ArrowRight } from 'lucide-react';

// --------------------------------------------------------------------------
// Tour configuration — content is i18n-keyed so it translates with the user's
// language preference. Anchors stay here since they target DOM selectors.
// --------------------------------------------------------------------------

interface TourStep {
  titleKey?: string;
  bodyKey?: string;
  /** Literal text (NEAR tour). When set, takes precedence over the i18n keys. */
  title?: string;
  body?: string;
  /** Optional DOM selector; tooltip points at this element if found. */
  anchor?: string;
}

const TOURS: Record<string, TourStep[]> = {
  donor: [
    { titleKey: 'tour.donor.s1.title', bodyKey: 'tour.donor.s1.body' },
    { titleKey: 'tour.donor.s2.title', bodyKey: 'tour.donor.s2.body' },
    { titleKey: 'tour.donor.s3.title', bodyKey: 'tour.donor.s3.body',
      anchor: '[aria-label="Open co-pilot"]' },
    { titleKey: 'tour.donor.s4.title', bodyKey: 'tour.donor.s4.body' },
  ],
  ngo: [
    { titleKey: 'tour.ngo.s1.title', bodyKey: 'tour.ngo.s1.body' },
    { titleKey: 'tour.ngo.s2.title', bodyKey: 'tour.ngo.s2.body' },
    { titleKey: 'tour.ngo.s3.title', bodyKey: 'tour.ngo.s3.body' },
    { titleKey: 'tour.ngo.s4.title', bodyKey: 'tour.ngo.s4.body',
      anchor: '[aria-label="Open co-pilot"]' },
  ],
  reviewer: [
    { titleKey: 'tour.reviewer.s1.title', bodyKey: 'tour.reviewer.s1.body' },
    { titleKey: 'tour.reviewer.s2.title', bodyKey: 'tour.reviewer.s2.body' },
    { titleKey: 'tour.reviewer.s3.title', bodyKey: 'tour.reviewer.s3.body' },
  ],
  admin: [
    { titleKey: 'tour.admin.s1.title', bodyKey: 'tour.admin.s1.body' },
    { titleKey: 'tour.admin.s2.title', bodyKey: 'tour.admin.s2.body',
      anchor: '[data-onboard="ai-health"]' },
    { titleKey: 'tour.admin.s3.title', bodyKey: 'tour.admin.s3.body' },
  ],
};

// NEAR-specific tours (closed network model). Hand-written copy rather
// than i18n keys because NEAR UAT runs in English only; can be moved to
// i18n if/when localised.
function nearTours(networkName: string): Record<string, TourStep[]> {
  return {
    ngo: [
      {
        title: `Welcome to ${networkName}`,
        body: `You're a NEAR member. This dashboard surfaces your active grants, what's due, and where the network needs you.`,
      },
      {
        title: 'Capacity assessment',
        body: 'The NEAR capacity framework drives your eligibility. Take it during onboarding and refresh annually — the Oversight Body sees your score.',
      },
      {
        title: 'Compliance & reporting',
        body: 'Reports are grouped by grant. Submit progress, financial, and final reports straight from each grant card; deadlines are colour-coded.',
      },
      {
        title: 'Co-pilot',
        body: 'Ask anything about your obligations, declarations you can apply to, or how to read your scores.',
        anchor: '[aria-label="Open co-pilot"]',
      },
    ],
    admin: [
      {
        title: `${networkName} operator console`,
        body: 'This is your control panel: membership pipeline, active declarations, the Change Fund pulse, and the Crisis Monitoring Report at a glance.',
      },
      {
        title: 'Crisis monitoring',
        body: 'The OB reviews active crises weekly. Rows with a high composite score (HDI + government capacity + people impacted + attention level) become declaration candidates.',
      },
      {
        title: 'Membership reviews',
        body: 'New applications need OB review. Run the trust process (sanctions, registry, adverse media) and check the capacity assessment before approving.',
      },
      {
        title: 'Emergency declarations',
        body: 'Multi-signature with COI recusal — every signature is audit-anchored. Activated declarations auto-create shortlisted grants ready for release.',
      },
    ],
    // Reviewer + donor roles aren't part of the NEAR closed-network model;
    // fall back to a single welcome step if they somehow appear.
    reviewer: [
      { title: `Welcome to ${networkName}`, body: `${networkName} is a closed network — reviewers operate through the OB workflow rather than independent panels.` },
    ],
    donor: [
      { title: `Welcome to ${networkName}`, body: `${networkName} is its own donor: there's no separate donor role here. Use the operator console to manage funds.` },
    ],
  };
}

// --------------------------------------------------------------------------
// Context
// --------------------------------------------------------------------------

interface TourContextValue {
  startTour: () => void;
  skipForever: () => void;
}

const TourContext = createContext<TourContextValue>({
  startTour: () => {},
  skipForever: () => {},
});

export function useOnboarding() {
  return useContext(TourContext);
}

// --------------------------------------------------------------------------
// Provider
// --------------------------------------------------------------------------

export function OnboardingTourProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const network = useNetworkStore((s) => s.network);
  const isNetworkTenant = !!network?.slug && network.slug !== 'kuja';
  const tenantName = network?.name || 'NEAR Network';
  const { t } = useTranslation();
  const [active, setActive] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const storageKeyRef = useRef<string | null>(null);

  const tourSet = isNetworkTenant ? nearTours(tenantName) : TOURS;
  const stepDefs = user ? (tourSet[user.role] ?? tourSet.ngo) : [];
  // Resolve to displayable strings — NEAR tour ships literal copy, Kuja
  // tour ships i18n keys.
  const steps = useMemo(
    () => stepDefs.map((s) => ({
      title: s.title ?? (s.titleKey ? t(s.titleKey) : ''),
      body: s.body ?? (s.bodyKey ? t(s.bodyKey) : ''),
      anchor: s.anchor,
    })),
    [stepDefs, t],
  );

  useEffect(() => {
    if (!user) return;
    storageKeyRef.current = `kuja_onboarded_${user.role}_${user.id}${isNetworkTenant ? `_${network?.slug ?? 'net'}` : ''}`;
    if (pathname?.startsWith('/dashboard')) {
      try {
        const done = localStorage.getItem(storageKeyRef.current);
        if (done !== 'done') {
          // Delay so dashboard has time to mount before the spotlight
          const t = setTimeout(() => setActive(true), 900);
          return () => clearTimeout(t);
        }
      } catch {}
    }
  }, [user, pathname, isNetworkTenant, network?.slug]);

  // Replay via custom event
  useEffect(() => {
    const h = () => { setStepIdx(0); setActive(true); };
    window.addEventListener('kuja:replay-tour', h);
    return () => window.removeEventListener('kuja:replay-tour', h);
  }, []);

  const startTour = useCallback(() => { setStepIdx(0); setActive(true); }, []);
  const skipForever = useCallback(() => {
    if (storageKeyRef.current) {
      try { localStorage.setItem(storageKeyRef.current, 'done'); } catch {}
    }
    setActive(false);
  }, []);

  const close = () => {
    if (storageKeyRef.current) {
      try { localStorage.setItem(storageKeyRef.current, 'done'); } catch {}
    }
    setActive(false);
  };

  const next = () => {
    if (stepIdx >= steps.length - 1) close();
    else setStepIdx((i) => i + 1);
  };

  return (
    <TourContext.Provider value={{ startTour, skipForever }}>
      {children}
      {active && steps[stepIdx] && (
        <TourStepOverlay
          step={steps[stepIdx]}
          stepIdx={stepIdx}
          total={steps.length}
          onSkip={skipForever}
          onNext={next}
          t={t}
        />
      )}
    </TourContext.Provider>
  );
}

// --------------------------------------------------------------------------
// Step overlay
// --------------------------------------------------------------------------

interface ResolvedStep { title: string; body: string; anchor?: string }

function TourStepOverlay({
  step, stepIdx, total, onSkip, onNext, t,
}: {
  step: ResolvedStep; stepIdx: number; total: number;
  onSkip: () => void; onNext: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!step.anchor) { setPos(null); return; }
    const el = document.querySelector(step.anchor) as HTMLElement | null;
    if (!el) { setPos(null); return; }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const r = el.getBoundingClientRect();
    const top = Math.max(20, r.top - 10);
    const left = Math.min(window.innerWidth - 360, Math.max(20, r.left));
    setPos({ top, left });
  }, [step]);

  const tooltipStyle = pos
    ? { top: pos.top, left: pos.left, transform: 'none' as const }
    : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' as const };

  return (
    <div className="fixed inset-0 z-[1400] flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" onClick={onSkip} />
      <div
        className="fixed w-[340px] max-w-[calc(100vw-32px)] rounded-xl border border-border bg-background shadow-2xl p-5"
        style={tooltipStyle}
      >
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-[hsl(var(--kuja-spark))] to-[hsl(262_70%_45%)] text-white flex-shrink-0">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="kuja-display text-lg leading-tight">{step.title}</div>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{step.body}</p>
          </div>
          <button
            type="button"
            onClick={onSkip}
            className="p-1 text-muted-foreground hover:text-foreground"
            aria-label={t('tour.skip_aria')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 flex items-center justify-between">
          <div className="flex gap-1">
            {Array.from({ length: total }).map((_, i) => (
              <span
                key={i}
                className={cn('h-1.5 w-1.5 rounded-full', i === stepIdx ? 'bg-[hsl(var(--kuja-clay))]' : 'bg-muted')}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSkip}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
            >
              {t('tour.skip')}
            </button>
            <button
              type="button"
              onClick={onNext}
              className="inline-flex items-center gap-1 rounded-md bg-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay-dark))] text-white text-sm font-medium px-3 py-1.5"
            >
              {stepIdx === total - 1 ? t('tour.got_it') : t('tour.next')}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
