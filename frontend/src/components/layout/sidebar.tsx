'use client';

/**
 * Kuja sidebar — full shadcn + Tailwind rewrite of the MUI original.
 *
 * Design language:
 *   - Warm dark palette (#1A1410 base, clay accents) — Kuja Studio's
 *     "Global South editorial" feel, not generic corporate-dark
 *   - Fraunces wordmark in the brand row
 *   - Sticky nav-group labels for scannability
 *   - Collapses to 72px icon rail; collapse button at the base
 *   - Mobile: slides in as an overlay driven by useUIStore
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useUIStore } from '@/stores/ui-store';
import { useAuthStore } from '@/stores/auth-store';
import { useTranslation } from '@/lib/hooks/use-translation';
import { cn } from '@/lib/utils';

import {
  LayoutDashboard, ClipboardCheck, Search, FileText, BarChart3, Building2,
  PlusCircle, Briefcase, Star, Shield, CheckCircle2, ClipboardList,
  ChevronLeft, ChevronRight, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { UserRole } from '@/lib/types';

interface NavItem {
  icon: LucideIcon;
  label: string;
  href: string;
}

interface SidebarProps {
  width: number;
  collapsedWidth: number;
}

export function Sidebar({ width, collapsedWidth }: SidebarProps) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const {
    sidebarCollapsed, toggleSidebar, sidebarMobileOpen, setMobileSidebarOpen,
  } = useUIStore();
  const user = useAuthStore((s) => s.user);
  const role: UserRole = (user?.role as UserRole) ?? 'ngo';

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname, setMobileSidebarOpen]);

  const navItems: Record<UserRole, NavItem[]> = {
    ngo: [
      { icon: LayoutDashboard, label: t('nav.dashboard'), href: '/dashboard' },
      { icon: ClipboardCheck, label: t('nav.assessment_hub'), href: '/assessments' },
      { icon: Search, label: t('nav.browse_grants'), href: '/grants' },
      { icon: FileText, label: t('nav.my_applications'), href: '/applications' },
      { icon: BarChart3, label: t('nav.reports'), href: '/reports' },
      { icon: Building2, label: t('nav.org_profile'), href: '/organizations/profile' },
    ],
    donor: [
      { icon: LayoutDashboard, label: t('nav.dashboard'), href: '/dashboard' },
      { icon: PlusCircle, label: t('nav.create_grant'), href: '/grants/new' },
      { icon: Briefcase, label: t('nav.my_grants'), href: '/grants' },
      { icon: Star, label: t('nav.review_applications'), href: '/reviews' },
      { icon: BarChart3, label: t('nav.grant_reports'), href: '/reports' },
      { icon: Shield, label: t('nav.compliance'), href: '/compliance' },
      { icon: Search, label: t('nav.org_search'), href: '/organizations/search' },
      { icon: CheckCircle2, label: t('nav.registration_checks'), href: '/verification' },
    ],
    reviewer: [
      { icon: LayoutDashboard, label: t('nav.dashboard'), href: '/dashboard' },
      { icon: ClipboardList, label: t('nav.my_assignments'), href: '/reviews' },
      { icon: CheckCircle2, label: t('nav.completed_reviews'), href: '/reviews/completed' },
    ],
    admin: [
      { icon: LayoutDashboard, label: t('nav.dashboard'), href: '/dashboard' },
      { icon: Briefcase, label: t('nav.all_grants'), href: '/grants' },
      { icon: FileText, label: t('nav.all_applications'), href: '/applications' },
      { icon: Search, label: t('nav.org_search'), href: '/organizations/search' },
      { icon: CheckCircle2, label: t('nav.registration_checks'), href: '/verification' },
      { icon: Shield, label: t('nav.compliance'), href: '/compliance' },
    ],
  };

  const items = navItems[role] ?? navItems.ngo;
  const currentWidth = sidebarCollapsed ? collapsedWidth : width;

  const body = (
    <div className="flex h-full flex-col bg-[#1A1410] text-[#F4E8DC]">
      {/* Brand */}
      <div
        className={cn(
          'flex items-center gap-2.5 border-b border-white/5 h-16',
          sidebarCollapsed ? 'justify-center px-0' : 'px-4',
        )}
      >
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-[#C2410C] to-[#7C2D12] shadow-lg flex-shrink-0">
          <span className="kuja-display text-lg text-white leading-none">K</span>
        </div>
        {!sidebarCollapsed && (
          <div className="min-w-0">
            <div className="kuja-display text-base leading-tight text-white">Kuja</div>
            <div className="text-[9px] uppercase tracking-[0.14em] text-orange-200/70">Grant intelligence</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-0.5">
          {items.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={sidebarCollapsed ? item.label : undefined}
                  className={cn(
                    'group flex items-center rounded-md text-sm font-medium transition-colors',
                    sidebarCollapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2',
                    isActive
                      ? 'bg-gradient-to-r from-[#C2410C] to-[#9A3412] text-white shadow-md shadow-orange-950/40'
                      : 'text-[#E8D9CC] hover:bg-white/5 hover:text-white',
                  )}
                >
                  <Icon className={cn('h-4 w-4 flex-shrink-0', !isActive && 'text-[#B5816C]')} />
                  {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Collapse toggle */}
      <button
        type="button"
        onClick={toggleSidebar}
        className={cn(
          'hidden lg:flex items-center gap-2 border-t border-white/5 px-3 py-3 text-xs text-[#B5816C] hover:bg-white/5 hover:text-white transition-colors',
          sidebarCollapsed && 'justify-center px-0',
        )}
        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : (
          <>
            <ChevronLeft className="h-4 w-4" />
            <span>Collapse</span>
          </>
        )}
      </button>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar (fixed) */}
      <aside
        className="fixed top-0 left-0 bottom-0 z-40 hidden lg:block border-r border-black/20 transition-[width] duration-200 ease-in-out"
        style={{ width: currentWidth }}
      >
        {body}
      </aside>

      {/* Mobile overlay */}
      {sidebarMobileOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          aria-label="Sidebar"
        >
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden
          />
          <aside className="absolute top-0 left-0 bottom-0 w-72 shadow-2xl animate-slide-in-right">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(false)}
              className="absolute top-3 right-3 z-10 rounded-md p-1 text-white/70 hover:text-white hover:bg-white/10"
              aria-label="Close sidebar"
            >
              <X className="h-5 w-5" />
            </button>
            {body}
          </aside>
        </div>
      )}
    </>
  );
}
