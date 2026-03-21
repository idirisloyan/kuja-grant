'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui-store';
import { useAuthStore } from '@/stores/auth-store';
import { useUpcomingReports, useReviews, useApplications } from '@/lib/hooks/use-api';
import {
  LayoutDashboard, ClipboardCheck, Search, FileText, BarChart3, Building2,
  PlusCircle, Briefcase, Star, Shield, CheckCircle2, ClipboardList,
  ChevronLeft, ChevronRight, Zap, Bell, Settings, HelpCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { UserRole } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NavItem {
  icon: LucideIcon;
  label: string;
  href: string;
  badgeKey?: string; // key to match for notification badges
}

// ---------------------------------------------------------------------------
// Nav config per role
// ---------------------------------------------------------------------------

const navItems: Record<UserRole, NavItem[]> = {
  ngo: [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
    { icon: ClipboardCheck, label: 'Assessment Hub', href: '/assessments' },
    { icon: Search, label: 'Browse Grants', href: '/grants' },
    { icon: FileText, label: 'My Applications', href: '/applications', badgeKey: 'applications' },
    { icon: BarChart3, label: 'Reporting & Compliance', href: '/reports', badgeKey: 'reports' },
    { icon: Building2, label: 'Org Profile', href: '/organizations/profile' },
  ],
  donor: [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
    { icon: PlusCircle, label: 'Create Grant', href: '/grants/new' },
    { icon: Briefcase, label: 'My Grants', href: '/grants' },
    { icon: Star, label: 'Review Applications', href: '/reviews', badgeKey: 'reviews' },
    { icon: BarChart3, label: 'Grant Reports', href: '/reports', badgeKey: 'reports' },
    { icon: Shield, label: 'Compliance', href: '/compliance' },
    { icon: Search, label: 'Org Search', href: '/organizations/search' },
    { icon: CheckCircle2, label: 'Registration Checks', href: '/verification' },
  ],
  reviewer: [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
    { icon: ClipboardList, label: 'My Assignments', href: '/reviews', badgeKey: 'reviews' },
    { icon: CheckCircle2, label: 'Completed Reviews', href: '/reviews/completed' },
  ],
  admin: [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
    { icon: Briefcase, label: 'All Grants', href: '/grants' },
    { icon: FileText, label: 'All Applications', href: '/applications' },
    { icon: Search, label: 'Org Search', href: '/organizations/search' },
    { icon: CheckCircle2, label: 'Registration Checks', href: '/verification' },
    { icon: Shield, label: 'Compliance', href: '/compliance' },
  ],
};

// ---------------------------------------------------------------------------
// Mini Score Ring (inline SVG for sidebar)
// ---------------------------------------------------------------------------

function MiniScoreRing({ score, size = 36 }: { score: number; size?: number }) {
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          stroke="rgba(255,255,255,0.15)"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          stroke={color}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: offset,
            transition: 'stroke-dashoffset 0.7s ease-out',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[10px] font-bold text-white">{score}%</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar Component
// ---------------------------------------------------------------------------

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const user = useAuthStore((s) => s.user);
  const role = user?.role || 'ngo';
  const items = navItems[role] || navItems.ngo;

  // Fetch data for notification badges (silently, no blocking)
  const { data: upcomingData } = useUpcomingReports();
  const { data: reviewsData } = useReviews();
  const { data: applicationsData } = useApplications();

  const overdueCount = upcomingData?.overdue_count ?? 0;
  const pendingReviews = reviewsData?.pending?.length ?? 0;
  const pendingApps = applicationsData?.applications?.filter(
    (a) => a.status === 'submitted' || a.status === 'under_review',
  ).length ?? 0;

  // Badge counts per badgeKey
  const badgeCounts: Record<string, number> = {
    reports: overdueCount,
    reviews: pendingReviews,
    applications: pendingApps,
  };

  // Fake overall compliance / readiness score
  const orgReadiness = 72;

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 bottom-0 z-40 flex flex-col bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-white transition-all duration-300',
        sidebarCollapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* ================================================================= */}
      {/* Logo + Readiness Ring                                              */}
      {/* ================================================================= */}
      <div className={cn(
        'flex items-center h-16 px-4 border-b border-slate-800/50',
        sidebarCollapsed ? 'justify-center' : 'gap-3'
      )}>
        <div className="w-9 h-9 bg-gradient-to-br from-brand-400 to-brand-600 rounded-lg flex items-center justify-center shrink-0 shadow-lg shadow-brand-600/30">
          <span className="text-white font-bold text-sm">K</span>
        </div>
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="font-semibold text-sm truncate">Kuja Grant</span>
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* Readiness Score                                                    */}
      {/* ================================================================= */}
      {!sidebarCollapsed && (
        <div className="px-3 py-3 mx-2 mt-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
          <div className="flex items-center gap-3">
            <MiniScoreRing score={orgReadiness} size={40} />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Readiness</p>
              <p className="text-sm font-bold text-white">{orgReadiness}% Score</p>
            </div>
          </div>
        </div>
      )}
      {sidebarCollapsed && (
        <div className="flex justify-center py-3">
          <MiniScoreRing score={orgReadiness} size={32} />
        </div>
      )}

      {/* ================================================================= */}
      {/* Nav Items                                                          */}
      {/* ================================================================= */}
      <nav className="flex-1 px-2 py-4 overflow-y-auto">
        {!sidebarCollapsed && (
          <p className="px-3 mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Navigation
          </p>
        )}
        <ul className="space-y-0.5">
          {items.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
            const badgeCount = item.badgeKey ? (badgeCounts[item.badgeKey] ?? 0) : 0;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-brand-600/90 text-white shadow-lg shadow-brand-600/30 border-l-[3px] border-l-white ml-0 pl-[9px]'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80 border-l-[3px] border-l-transparent ml-0 pl-[9px]',
                    sidebarCollapsed && 'justify-center px-0 pl-0 border-l-0'
                  )}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <item.icon className={cn(
                    'w-5 h-5 shrink-0 transition-colors',
                    isActive ? 'text-white' : 'text-slate-400 group-hover:text-white',
                  )} />
                  {!sidebarCollapsed && <span className="truncate flex-1">{item.label}</span>}

                  {/* Notification Badge */}
                  {badgeCount > 0 && (
                    sidebarCollapsed ? (
                      <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-rose-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white shadow-lg shadow-rose-500/50 animate-pulse">
                        {badgeCount > 9 ? '9+' : badgeCount}
                      </span>
                    ) : (
                      <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-rose-500 rounded-full text-[10px] font-bold text-white shadow-lg shadow-rose-500/30">
                        {badgeCount > 99 ? '99+' : badgeCount}
                      </span>
                    )
                  )}

                  {/* Active indicator (dot) when expanded and no badge */}
                  {isActive && !sidebarCollapsed && badgeCount === 0 && (
                    <span className="ml-auto w-2 h-2 bg-white rounded-full shadow-sm" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ================================================================= */}
      {/* Quick Actions                                                      */}
      {/* ================================================================= */}
      <div className={cn(
        'border-t border-slate-800/50 px-2 py-2',
        sidebarCollapsed ? 'flex flex-col items-center gap-1' : 'flex items-center justify-center gap-1'
      )}>
        {!sidebarCollapsed && (
          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-600 w-full text-center mb-1">
            Quick Actions
          </p>
        )}
        <div className={cn(
          'flex gap-1',
          sidebarCollapsed ? 'flex-col' : 'flex-row justify-center'
        )}>
          <QuickActionButton
            icon={Bell}
            label="Notifications"
            hasAlert={overdueCount > 0}
            collapsed={sidebarCollapsed}
          />
          <QuickActionButton
            icon={Zap}
            label="AI Assistant"
            collapsed={sidebarCollapsed}
          />
          <QuickActionButton
            icon={Settings}
            label="Settings"
            collapsed={sidebarCollapsed}
          />
          <QuickActionButton
            icon={HelpCircle}
            label="Help"
            collapsed={sidebarCollapsed}
          />
        </div>
      </div>

      {/* ================================================================= */}
      {/* Collapse Toggle                                                    */}
      {/* ================================================================= */}
      <button
        onClick={toggleSidebar}
        className="flex items-center justify-center h-11 border-t border-slate-800/50 text-slate-500 hover:text-white hover:bg-slate-800/50 transition-all"
      >
        {sidebarCollapsed ? (
          <ChevronRight className="w-4 h-4" />
        ) : (
          <div className="flex items-center gap-2 text-xs">
            <ChevronLeft className="w-4 h-4" />
            <span>Collapse</span>
          </div>
        )}
      </button>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Quick Action Button
// ---------------------------------------------------------------------------

function QuickActionButton({
  icon: Icon,
  label,
  hasAlert,
  collapsed: _collapsed,
}: {
  icon: LucideIcon;
  label: string;
  hasAlert?: boolean;
  collapsed: boolean;
}) {
  return (
    <button
      className="relative w-8 h-8 rounded-lg bg-slate-800/60 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-all group"
      title={label}
    >
      <Icon className="w-3.5 h-3.5" />
      {hasAlert && (
        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-slate-900 animate-pulse" />
      )}
    </button>
  );
}
