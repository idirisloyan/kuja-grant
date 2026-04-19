'use client';

/**
 * App shell layout — shadcn + Tailwind rewrite.
 * Replaces the MUI Box/Container shell with semantic HTML + Tailwind.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useTranslation } from '@/lib/hooks/use-translation';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { CopilotRail } from '@/components/copilot/copilot-rail';
import { OnboardingTourProvider } from '@/components/onboarding/tour-provider';

const SIDEBAR_WIDTH = 280;
const COLLAPSED_WIDTH = 72;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading, checkSession } = useAuthStore();
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);

  useTranslation();

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--kuja-quartz))]">
        <div className="flex flex-col items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-[#C2410C] to-[#7C2D12] shadow-lg">
            <span className="kuja-display text-2xl text-white">K</span>
          </div>
          <div className="h-1 w-24 bg-gradient-to-r from-[#C2410C] via-[#F97316] to-[#C2410C] rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  const currentWidth = sidebarCollapsed ? COLLAPSED_WIDTH : SIDEBAR_WIDTH;

  return (
    <OnboardingTourProvider>
      <div className="relative min-h-screen bg-[hsl(var(--kuja-quartz))]">
        <Sidebar width={SIDEBAR_WIDTH} collapsedWidth={COLLAPSED_WIDTH} />
        <div
          className="flex flex-col min-h-screen transition-[padding-left] duration-200 ease-in-out"
          style={{ paddingLeft: currentWidth }}
        >
          <Header />
          <main className="flex-1 py-6 px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-[1400px]">
              {children}
            </div>
          </main>
        </div>
        <CopilotRail />
      </div>
    </OnboardingTourProvider>
  );
}
