'use client';

/**
 * Kuja sidebar — Phase 46 IA split.
 *
 * The brief is that the two product flavors should NOT share IA, even
 * though they share the codebase. Kuja = open marketplace; NEAR = closed
 * network fund operating system. Each flavor has its own role-keyed nav,
 * and every role has a *Primary* section (the daily workflow) and a
 * *Secondary* section (utility / supporting surfaces) rendered below a
 * divider.
 *
 * Mapping (see docs/DESIGN_PRINCIPLES.md for the source brief):
 *
 *   Kuja  · Donor    → Dashboard · Grants · Applications · Reports · Orgs · Insights
 *                       Messages · Settings
 *   Kuja  · NGO      → Dashboard · Opportunities · Applications · Reports · Org Profile
 *                       Messages · Chat · Settings
 *   NEAR  · Operator → Dashboard · Members · Declarations · Funds & Windows
 *                       · Crisis Monitoring · Reports · Governance
 *                       Messages · Feedback · Audit · Settings
 *   NEAR  · Member   → Dashboard · Membership · Applications · Reports
 *                       Messages · Feedback · Settings
 *
 * Reviewer role keeps its existing nav (the brief is Kuja+NEAR focused;
 * reviewer-specific IA is queued for a later phase).
 *
 * Design language:
 *   - Warm dark palette (#1A1410 base, clay accents) — Kuja Studio's
 *     "Global South editorial" feel, not generic corporate-dark
 *   - Fraunces wordmark in the brand row
 *   - Primary group on top; subtle divider; Secondary group below
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
  Briefcase, Star, ShieldCheck, ClipboardList,
  ChevronLeft, ChevronRight, X, MessageSquare, Inbox,
  Users, Siren, Wallet, Activity, Award, Lightbulb, Settings as SettingsIcon,
  HelpCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { UserRole } from '@/lib/types';

interface NavItem {
  icon: LucideIcon;
  label: string;
  href: string;
}

/**
 * A nav profile = the primary section (daily workflow) + a secondary
 * section (utility) for a single (flavor, role) pair. Rendered as two
 * groups separated by a divider in the sidebar.
 */
interface NavProfile {
  primary: NavItem[];
  secondary: NavItem[];
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
  const isNearFlavor = !!network?.slug && network.slug !== 'kuja';
  const role: UserRole = (user?.role as UserRole) ?? 'ngo';

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname, setMobileSidebarOpen]);

  const profile = pickNavProfile(role, isNearFlavor, t);
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
              {isNearFlavor ? 'Network fund' : 'Grant intelligence'}
            </div>
          </div>
        )}
      </div>

      {/* Nav: primary + secondary in two groups */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-3">
        <NavGroup
          items={profile.primary}
          pathname={pathname}
          collapsed={sidebarCollapsed}
        />
        {profile.secondary.length > 0 && (
          <>
            <div
              className={cn(
                'mx-2 border-t border-white/5',
                sidebarCollapsed && 'mx-3',
              )}
              aria-hidden
            />
            <NavGroup
              items={profile.secondary}
              pathname={pathname}
              collapsed={sidebarCollapsed}
              tone="secondary"
            />
          </>
        )}
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

// ---------------------------------------------------------------------------
// NavGroup — primary or secondary group renderer
// ---------------------------------------------------------------------------

function NavGroup({
  items, pathname, collapsed, tone = 'primary',
}: {
  items: NavItem[];
  pathname: string | null;
  collapsed: boolean;
  tone?: 'primary' | 'secondary';
}) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                'group flex items-center rounded-md text-sm font-medium transition-colors',
                collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2',
                isActive
                  ? 'bg-gradient-to-r from-[#C2410C] to-[#9A3412] text-white shadow-md shadow-orange-950/40'
                  : tone === 'secondary'
                    ? 'text-[#B5816C] hover:bg-white/5 hover:text-[#E8D9CC]'
                    : 'text-[#E8D9CC] hover:bg-white/5 hover:text-white',
              )}
            >
              <Icon className={cn(
                'h-4 w-4 flex-shrink-0',
                !isActive && (tone === 'secondary' ? 'text-[#8C6450]' : 'text-[#B5816C]'),
              )} />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// pickNavProfile — flavor × role → NavProfile
// ---------------------------------------------------------------------------

type T = (k: string) => string;

function pickNavProfile(role: UserRole, isNearFlavor: boolean, t: T): NavProfile {
  if (isNearFlavor) {
    return nearProfile(role, t);
  }
  return kujaProfile(role, t);
}

/* ----------------------------- Kuja flavor ----------------------------- */

function kujaProfile(role: UserRole, t: T): NavProfile {
  switch (role) {
    case 'donor':
      return {
        primary: [
          { icon: LayoutDashboard, label: t('nav.dashboard'),          href: '/dashboard' },
          { icon: Briefcase,       label: t('nav.my_grants'),          href: '/grants' },
          { icon: Star,            label: t('nav.review_applications'),href: '/reviews' },
          { icon: FileText,        label: 'Reports',                   href: '/reports' },
          { icon: Building2,       label: 'Organizations',             href: '/organizations/search' },
          // Insights = portfolio-level intelligence. Routes to /dashboard
          // until Phase 48 adds the dedicated "Insights" surface.
          { icon: Lightbulb,       label: 'Insights',                  href: '/dashboard?view=insights' },
        ],
        secondary: [
          { icon: MessageSquare,   label: 'Messages',                  href: '/messages' },
          { icon: SettingsIcon,    label: 'Settings',                  href: '/settings/notifications' },
        ],
      };

    case 'ngo':
      // Phase 90 — primary nav reduced from 5 to 4 per team review.
      // "Opportunities" demoted to secondary (and surfaced contextually
      // on the dashboard via the matches card + "Find a grant" CTA).
      // The 4 primaries are the ones non-technical NGOs hit every visit:
      // Dashboard → Applications → Reports → Profile (where the Trust
      // Profile lives).
      return {
        primary: [
          { icon: LayoutDashboard, label: t('nav.dashboard'),          href: '/dashboard' },
          { icon: FileText,        label: t('nav.my_applications'),    href: '/applications' },
          { icon: BarChart3,       label: 'Reports',                   href: '/reports' },
          { icon: Building2,       label: t('nav.org_profile'),        href: '/organizations/profile' },
        ],
        secondary: [
          { icon: Search,          label: 'Find a grant',              href: '/grants' },
          { icon: MessageSquare,   label: 'Messages',                  href: '/messages' },
          { icon: HelpCircle,      label: 'Help & Chat',               href: '/chat' },
          { icon: SettingsIcon,    label: 'Settings',                  href: '/settings/notifications' },
        ],
      };

    case 'reviewer':
      // Reviewer IA isn't addressed in the brief (which is Kuja+NEAR
      // workflow focused). Preserve the existing minimal nav.
      return {
        primary: [
          { icon: LayoutDashboard, label: t('nav.dashboard'),          href: '/dashboard' },
          { icon: ClipboardList,   label: t('nav.my_assignments'),     href: '/reviews' },
          { icon: ClipboardCheck,  label: t('nav.completed_reviews'),  href: '/reviews/completed' },
        ],
        secondary: [
          { icon: SettingsIcon,    label: 'Settings',                  href: '/settings/notifications' },
        ],
      };

    case 'admin':
      // Kuja platform admin — keeps the operator-style nav. Brief doesn't
      // remove admin surfaces from Kuja; it just keeps them out of donor
      // and NGO primary.
      return {
        primary: [
          { icon: LayoutDashboard, label: t('nav.dashboard'),          href: '/dashboard' },
          { icon: Briefcase,       label: t('nav.all_grants'),         href: '/grants' },
          { icon: FileText,        label: t('nav.all_applications'),   href: '/applications' },
          { icon: Building2,       label: t('nav.org_search'),         href: '/organizations/search' },
          { icon: ShieldCheck,     label: t('nav.trust_profile'),      href: '/trust' },
        ],
        secondary: [
          { icon: MessageSquare,   label: 'Messages',                  href: '/messages' },
          { icon: Activity,        label: t('nav.observability'),      href: '/observability' },
          { icon: BarChart3,       label: t('nav.metrics'),            href: '/admin/metrics' },
          { icon: ShieldCheck,     label: t('nav.audit_chain'),        href: '/admin/audit-chain' },
          { icon: SettingsIcon,    label: 'Settings',                  href: '/settings/notifications' },
        ],
      };
  }
}

/* ----------------------------- NEAR flavor ----------------------------- */

function nearProfile(role: UserRole, t: T): NavProfile {
  switch (role) {
    case 'admin':
      // NEAR operator / secretariat / OB. Fund operations console — every
      // primary entry is something they actually do in a typical week.
      return {
        primary: [
          { icon: LayoutDashboard, label: t('nav.dashboard'),    href: '/dashboard' },
          { icon: Users,           label: 'Members',             href: '/admin/network-memberships' },
          { icon: Siren,           label: 'Declarations',        href: '/admin/declarations' },
          { icon: Wallet,          label: 'Funds & Windows',     href: '/admin/funds' },
          { icon: Activity,        label: 'Crisis Monitoring',   href: '/admin/crisis-monitoring' },
          { icon: FileText,        label: 'Reports',             href: '/reports' },
          // Governance = committee + approvals + audit + policy controls.
          // Audit chain is the visible governance surface today; Phase 49
          // may add a dedicated policy-controls page.
          { icon: ShieldCheck,     label: 'Governance',          href: '/admin/audit-chain' },
        ],
        secondary: [
          { icon: MessageSquare,   label: 'Messages',            href: '/messages' },
          { icon: Inbox,           label: 'Feedback',            href: '/feedback' },
          // Audit = direct link to the same chain as Governance, kept here
          // as a known utility shortcut. The two will diverge once Phase 49
          // ships /governance with a wider scope.
          { icon: ClipboardList,   label: 'Audit',               href: '/admin/audit-chain' },
          { icon: SettingsIcon,    label: 'Settings',            href: '/settings/notifications' },
        ],
      };

    case 'ngo':
      // NEAR member NGO. The brief's most important rule for this role:
      // they should not feel like they're inside a giant system. Just
      // "my status / my applications / my reports / my messages".
      return {
        primary: [
          { icon: LayoutDashboard, label: t('nav.dashboard'),       href: '/dashboard' },
          // Membership = the member's own status surface. /trust hosts
          // capacity + due diligence + registration state today and is
          // the closest fit until Phase 47 ships a dedicated page.
          { icon: Award,           label: 'Membership',             href: '/trust' },
          { icon: FileText,        label: t('nav.my_applications'), href: '/applications' },
          { icon: BarChart3,       label: 'Reports',                href: '/reports' },
        ],
        secondary: [
          { icon: MessageSquare,   label: 'Messages',               href: '/messages' },
          { icon: Inbox,           label: 'Feedback',               href: '/feedback' },
          { icon: SettingsIcon,    label: 'Settings',               href: '/settings/notifications' },
        ],
      };

    case 'donor':
      // Network-tenant donor is unusual; show a minimal read-only nav
      // until the role's IA is defined.
      return {
        primary: [
          { icon: LayoutDashboard, label: t('nav.dashboard'),    href: '/dashboard' },
          { icon: FileText,        label: 'Reports',             href: '/reports' },
        ],
        secondary: [
          { icon: MessageSquare,   label: 'Messages',            href: '/messages' },
          { icon: SettingsIcon,    label: 'Settings',            href: '/settings/notifications' },
        ],
      };

    case 'reviewer':
      // Network-tenant reviewer — keep minimal.
      return {
        primary: [
          { icon: LayoutDashboard, label: t('nav.dashboard'),         href: '/dashboard' },
          { icon: ClipboardList,   label: t('nav.my_assignments'),    href: '/reviews' },
          { icon: ClipboardCheck,  label: t('nav.completed_reviews'), href: '/reviews/completed' },
        ],
        secondary: [
          { icon: SettingsIcon,    label: 'Settings',                 href: '/settings/notifications' },
        ],
      };
  }
}

