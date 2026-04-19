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

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';
import { Sparkles, X, ArrowRight } from 'lucide-react';

// --------------------------------------------------------------------------
// Tour configuration
// --------------------------------------------------------------------------

interface TourStep {
  title: string;
  body: string;
  /** Optional DOM selector; tooltip points at this element if found. */
  anchor?: string;
}

const TOURS: Record<string, TourStep[]> = {
  donor: [
    {
      title: 'Your portfolio command center',
      body: "Today's verdict synthesizes the 3-5 things that need your attention this week — AI-derived from your actual grants, applications, and risk signals.",
    },
    {
      title: 'Charts with AI insight captions',
      body: 'Every chart has a "so what" caption written by AI. Scan a dashboard in 10 seconds, not 10 minutes.',
    },
    {
      title: 'Co-pilot is always a click away',
      body: 'Tap the sparkle on the right edge anytime. Ask Co-pilot about portfolio health, write a new RFP, or scan for patterns across declined applications.',
      anchor: '[aria-label="Open co-pilot"]',
    },
    {
      title: 'Design grants with AI',
      body: 'Under "Create grant," Kuja suggests eligibility criteria, rubric weights, and reporting requirements tuned to your goal + thematic + geography.',
    },
  ],
  ngo: [
    {
      title: 'Your readiness score',
      body: 'A 0–100 signal of how competitive your next application is likely to be. AI updates this as your documents, applications, and capacity change.',
    },
    {
      title: 'AI-coached next actions',
      body: 'The three actions here are ranked by impact on your readiness score — with estimated uplift per action.',
    },
    {
      title: 'Browse grants smart',
      body: "Every grant shows your AI-estimated fit + win probability + what's missing from your profile. Focus where you'll win.",
    },
    {
      title: 'Co-pilot writes with you',
      body: 'Stuck on a section? Tap the sparkle. Co-pilot grounds every suggestion in your own past applications — never generic.',
      anchor: '[aria-label="Open co-pilot"]',
    },
  ],
  reviewer: [
    {
      title: 'AI-prioritized queue',
      body: 'Your assignments are ranked by review priority — deadline, complexity, and similarity to prior high-scoring apps.',
    },
    {
      title: 'Compare mode',
      body: 'Select 2–5 applications to compare side-by-side. AI aligns strengths, weaknesses, and flags potentially coordinated submissions.',
    },
    {
      title: 'Justify every score',
      body: 'AI pre-fills rationale per rubric criterion using application content. You edit and confirm — much faster than writing cold.',
    },
  ],
  admin: [
    {
      title: 'Operations at a glance',
      body: 'Anomaly stream flags unusual patterns — spikes in declined apps, slow review queues, suspicious verification results.',
    },
    {
      title: 'Live AI health panel',
      body: 'Every AI call across the platform is logged — success rate, tokens, per-endpoint breakdowns. Catch regressions before users notice.',
      anchor: '[data-onboard="ai-health"]',
    },
    {
      title: 'Configure and trust',
      body: 'Compliance trust panel, audit timelines, typed-confirmation on destructive actions — this is the platform a board can trust to run a fund.',
    },
  ],
};

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
  const [active, setActive] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const storageKeyRef = useRef<string | null>(null);

  const steps = user ? (TOURS[user.role] ?? TOURS.ngo) : [];

  useEffect(() => {
    if (!user) return;
    storageKeyRef.current = `kuja_onboarded_${user.role}_${user.id}`;
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
  }, [user, pathname]);

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
        />
      )}
    </TourContext.Provider>
  );
}

// --------------------------------------------------------------------------
// Step overlay
// --------------------------------------------------------------------------

function TourStepOverlay({
  step, stepIdx, total, onSkip, onNext,
}: {
  step: TourStep; stepIdx: number; total: number;
  onSkip: () => void; onNext: () => void;
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
            aria-label="Skip tour"
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
              Skip
            </button>
            <button
              type="button"
              onClick={onNext}
              className="inline-flex items-center gap-1 rounded-md bg-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay-dark))] text-white text-sm font-medium px-3 py-1.5"
            >
              {stepIdx === total - 1 ? 'Got it' : 'Next'}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
