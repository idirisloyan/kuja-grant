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
import { useNetworkStore } from '@/stores/network-store';
import { useTranslation } from '@/lib/hooks/use-translation';
import { cn } from '@/lib/utils';

import {
  LayoutDashboard, ClipboardCheck, Search, FileText, BarChart3, Building2,
  PlusCircle, Briefcase, Star, Shield, CheckCircle2, ClipboardList,
  ChevronLeft, ChevronRight, X, Activity, Brain, ShieldCheck, Calendar,
  MessageSquare, MessageCircle, Inbox,
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
  const network = useNetworkStore((s) => s.network);
  const isNetworkTenant = !!network?.slug && network.slug !== 'kuja';
  const role: UserRole = (user?.role as UserRole) ?? 'ngo';

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname, setMobileSidebarOpen]);

  const navItems: Record<UserRole, NavItem[]> = {
    ngo: isNetworkTenant
      ? [
          // NEAR-tenant NGOs see a simplified set. No browse_grants
          // (closed network — grants come from declarations), no trust
          // profile (NEAR operator runs that during onboarding), no
          // marketplace cues. Just their work + the new (Phase 43)
          // messaging + feedback channels.
          { icon: LayoutDashboard, label: t('nav.dashboard'), href: '/dashboard' },
          { icon: ClipboardCheck, label: t('nav.assessment_hub'), href: '/assessments' },
          { icon: FileText, label: t('nav.my_applications'), href: '/applications' },
          { icon: BarChart3, label: 'Compliance & reporting', href: '/reports' },
          { icon: MessageSquare, label: 'Messages', href: '/messages' },
          { icon: MessageCircle, label: 'Feedback', href: '/feedback' },
          { icon: Building2, label: t('nav.org_profile'), href: '/organizations/profile' },
        ]
      : [
          { icon: LayoutDashboard, label: t('nav.dashboard'), href: '/dashboard' },
          { icon: Calendar, label: t('nav.calendar') || 'Calendar', href: '/calendar' },
          { icon: MessageSquare, label: t('nav.chat') || 'Chat with Kuja', href: '/chat' },
          { icon: ClipboardCheck, label: t('nav.assessment_hub'), href: '/assessments' },
          { icon: ShieldCheck, label: t('nav.trust_profile') || 'Trust Profile', href: '/trust' },
          { icon: Search, label: t('nav.browse_grants'), href: '/grants' },
          { icon: FileText, label: t('nav.my_applications'), href: '/applications' },
          { icon: BarChart3, label: 'Compliance & reporting', href: '/reports' },
          { icon: Building2, label: t('nav.org_profile'), href: '/organizations/profile' },
          { icon: Brain, label: t('nav.org_memory'), href: '/organizations/memory' },
        ],
    donor: [
      { icon: LayoutDashboard, label: t('nav.dashboard'), href: '/dashboard' },
      { icon: Calendar, label: t('nav.calendar') || 'Calendar', href: '/calendar' },
      { icon: MessageSquare, label: t('nav.chat') || 'Chat with Kuja', href: '/chat' },
      { icon: PlusCircle, label: t('nav.create_grant'), href: '/grants/new' },
      { icon: Briefcase, label: t('nav.my_grants'), href: '/grants' },
      { icon: Star, label: t('nav.review_applications'), href: '/reviews' },
      { icon: BarChart3, label: 'Compliance & reporting', href: '/reports' },
      // Trust Profile is the single canonical trust surface — sanctions,
      // adverse media, registration, bank, COI, capacity all under /trust.
      // The standalone /verification link was removed because it's now a
      // section inside Trust Profile (with a "Full registry workflow"
      // drill-in to the original page).
      { icon: ShieldCheck, label: t('nav.trust_profile') || 'Trust Profile', href: '/trust' },
      { icon: Shield, label: t('nav.compliance'), href: '/compliance' },
      { icon: Search, label: t('nav.org_search'), href: '/organizations/search' },
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
      // Registration checks consolidated into Trust Profile (the standalone
      // /verification page is still reachable from the Identity & registration
      // panel inside /trust).
      { icon: ShieldCheck, label: t('nav.trust_profile') || 'Trust Profile', href: '/trust' },
      // Phase 43 — closed-network operational surfaces. NEAR secretariat
      // composes broadcasts here + sees member feedback inbox.
      ...(isNetworkTenant ? [
        { icon: MessageSquare, label: 'Messages', href: '/messages' },
        { icon: Inbox, label: 'Member feedback', href: '/feedback' },
      ] : []),
      { icon: Shield, label: t('nav.compliance'), href: '/compliance' },
      { icon: Activity, label: t('nav.observability'), href: '/observability' },
      { icon: BarChart3, label: t('nav.metrics') || 'Real-user metrics', href: '/admin/metrics' },
      { icon: ShieldCheck, label: t('nav.audit_chain') || 'Audit chain', href: '/admin/audit-chain' },
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
        <div
          className="grid h-9 w-9 place-items-center rounded-lg shadow-lg flex-shrink-0"
          style={{
            background: network?.brand_color_hex
              ? `linear-gradient(135deg, ${network.brand_color_hex}, ${network.brand_color_hex}DD)`
              : 'linear-gradient(135deg, #C2410C, #7C2D12)',
          }}
        >
          <span className="kuja-display text-lg text-white leading-none">
            {(network?.name || 'Kuja').charAt(0).toUpperCase()}
          </span>
        </div>
        {!sidebarCollapsed && (
          <div className="min-w-0">
            <div className="kuja-display text-base leading-tight text-white truncate">
              {network?.name || 'Kuja'}
            </div>
            <div className="text-[9px] uppercase tracking-[0.14em] text-orange-200/70">
              {network?.slug && network.slug !== 'kuja' ? 'Network fund' : 'Grant intelligence'}
            </div>
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
        aria-label={sidebarCollapsed ? t('sidebar.expand') : t('sidebar.collapse')}
      >
        {(() => {
          // In RTL the sidebar sits on the right edge, so the chevron
          // direction inverts — collapse points right (toward edge),
          // expand points left (toward content).
          const isRtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
          const CollapseIcon = isRtl ? ChevronRight : ChevronLeft;
          const ExpandIcon = isRtl ? ChevronLeft : ChevronRight;
          return sidebarCollapsed ? <ExpandIcon className="h-4 w-4" /> : (
            <>
              <CollapseIcon className="h-4 w-4" />
              <span>{t('sidebar.collapse')}</span>
            </>
          );
        })()}
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
